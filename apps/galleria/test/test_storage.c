/* test_storage.c — test host ADVERSARIALE di storage.c (gcc + shim/pebble.h, nessun ARM/emulatore).
 * Esegue: make -C apps/galleria/test run-test_storage
 * GALLERIA_TEST_VERBOSE=1 nell'ambiente per vedere gli APP_LOG di storage.c.
 * Copre: init su persist vuoto, quota < 1 MiB (album disabilitato), scrittura+commit di una foto
 * raw6 (134 chunk), rilettura del manifest, manifest corrotto (CRC/dimensione/magic/schema),
 * schema futuro -> reset, E_OUT_OF_STORAGE su chunk/manifest (ripristino), argomenti invalidi,
 * debounce delle impostazioni (timer), rotstate, clear_slot/set_order e conteggio delle scritture.
 *
 * Schema 2 (revisione perf 04/09/2026): UN solo record di metadati (chiave 1, GalManifest 234 B =
 * slot + ordine + shake_offset + GalSettings). Le chiavi 2 (GalRotState) e 10 (GalSettings) non
 * vengono piu' scritte: esistono solo per la migrazione dallo schema 1 (GalManifestV1, 214 B),
 * fatta una volta in storage_init e materializzata dal timer di debounce o dal flush di deinit.
 * Contratti pinnati qui: s_schema_ok (la chiave 0 gia' allineata non viene riscritta), un solo
 * timer per impostazioni e shake, flush che scrive SOLO con impostazioni pendenti (uno shake da
 * solo va perso), scrittura fallita -> dirty mantenuti, settings_apply identiche -> nessuna
 * scrittura, migrazione V1 in tutte le sue varianti.
 * Revisione v1.9 (05/09/2026): (15) RICERCHE persist contate dallo shim (F10: init schema 2 = 2
 * ricerche e 0 a vuoto, file vuoto = 2 a vuoto, migrazione = 4 [0, 1, 10, 2], impostazioni
 * identiche / set_order identico / clear_slot su EMPTY / flush senza dirty = 0, chunk senza
 * persist_exists); (16) impostazioni pendenti + commit/set_order/clear entro i 10 s = un solo record
 * (F05); (17) ritentativi del timer: 1 + STORAGE_WRITE_RETRIES scatti, contatore azzerato da ogni
 * evento nuovo, register NULL nel ritentativo (F12); (18) init con timer pendente, chiave 0 con
 * errore generico, chiave 10 di schema diverso, open_ms con l'orologio finto (F34/F48);
 * clear_slot idempotente (F31) in (11). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pebble.h>          /* shim host: test/shim/pebble.h (-Ishim davanti a -I../src/c) */
#include "storage.h"
#include "crc.h"

static int g_ok, g_fail;
#define CHECK(cond) do { if (cond) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_EQ(a, b) do { long long _a = (long long)(a), _b = (long long)(b); if (_a == _b) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s = %lld, atteso %s = %lld\n", __FILE__, __LINE__, #a, _a, #b, _b); } } while (0)

#define QUOTA_OK        (1024u * 1024u)      /* 1 MiB: album abilitato */
#define QUOTA_BAD       4096u                /* fallback SDK < 4.17: album disabilitato */
#define FMT_RAW6        1                    /* PHOTO_FMT_RAW6_200x228 (photo_codec.h) */
#define PHOTO_LEN       34200u               /* raw6 200x228 */
#define PHOTO_CHUNKS    134                  /* 133 x 256 + 152 */
#define LAST_CHUNK_N    152

static uint8_t g_photo[PHOTO_LEN];
static uint8_t g_ref[GAL_CHUNK_BYTES];       /* copia del manifest valido persistito (+ padding) */
static uint8_t g_tmp[GAL_CHUNK_BYTES];

/* ---- helper ---- */

static uint32_t g_seed = 987654321u;
static uint8_t rnd8(void) {
  g_seed = g_seed * 1103515245u + 12345u;
  return (uint8_t)(g_seed >> 16);
}

static void fill_photo(void) {
  for (uint32_t i = 0; i < PHOTO_LEN; i++) {
    g_photo[i] = rnd8();
  }
}

static uint16_t chunk_len(uint16_t i) {
  return (i == PHOTO_CHUNKS - 1) ? LAST_CHUNK_N : GAL_CHUNK_BYTES;
}

static StorageResult write_photo(uint8_t slot) {
  for (uint16_t i = 0; i < PHOTO_CHUNKS; i++) {
    const StorageResult r = storage_write_chunk(slot, i, g_photo + (uint32_t)i * GAL_CHUNK_BYTES,
                                                chunk_len(i));
    if (r != STORAGE_OK) {
      return r;
    }
  }
  return STORAGE_OK;
}

/* storage.c ha stato static (handle del timer + flag dirty) che sopravvive a shim_persist_reset:
 * il flush lo azzera prima di ogni caso, cosi' i contatori di timer/scritture partono puliti. */
static void reset_all(uint32_t quota) {
  storage_flush();
  shim_persist_reset();
  shim_set_quota(quota);
}

static void fresh(uint32_t quota) {
  reset_all(quota);
  (void)storage_init();
}

static int order_all_none(const GalManifest *m) {
  for (uint8_t i = 0; i < GAL_MAX_SLOTS; i++) {
    if (m->order[i] != GAL_SLOT_NONE) {
      return 0;
    }
  }
  return 1;
}

static int manifest_is_default(const GalManifest *m) {
  GalSettings def;
  settings_set_defaults(&def);
  if (m->magic != GAL_MAGIC || m->schema != GAL_SCHEMA || m->slot_count != GAL_MAX_SLOTS
      || m->shake_offset != 0 || !order_all_none(m)) {
    return 0;
  }
  /* schema 2: anche le impostazioni fanno parte del record (crc16 escluso: vale 0 finche' non
   * viene scritto) */
  if (memcmp(&m->settings, &def, sizeof(GalSettings) - 2u) != 0) {
    return 0;
  }
  for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {
    if (m->slots[k].state != GAL_SLOT_EMPTY || m->slots[k].format != 0
        || m->slots[k].generation != 0 || m->slots[k].length != 0
        || m->slots[k].crc32 != 0 || m->slots[k].photo_id != 0) {
      return 0;
    }
  }
  return storage_valid_slots() == 0;
}

static const uint16_t GAL_INTERVALS[7] = { 0, 5, 15, 30, 60, 180, 1440 };   /* settings_validate */

static void mk_settings(GalSettings *s, uint8_t seed) {
  memset(s, 0, sizeof(*s));
  s->schema       = 99;                      /* deve essere FORZATO a GAL_SETTINGS_SCHEMA */
  s->layout       = (uint8_t)(seed % 2u);
  s->font         = (uint8_t)(seed % 4u);
  s->clock_mode   = (uint8_t)(seed % 3u);
  s->leading_zero = (uint8_t)((seed + 1u) % 3u);
  s->text_color   = (uint8_t)(seed % 5u);
  s->outline      = (uint8_t)((seed + 2u) % 3u);
  s->interval_min = GAL_INTERVALS[seed % 7u];  /* schema 2: il record viene RILETTO da storage_init,
                                                  che rimette i default se un campo e' fuori range */
  s->order        = (uint8_t)(seed & 1u);
  s->shake_next   = (uint8_t)((seed >> 1) & 1u);
  s->info_row     = (uint8_t)(seed & 0x0Fu);
  s->crc16        = 0xBEEF;                  /* deve essere RICALCOLATO */
}

/* Uguaglianza dei campi utili: salta schema (byte 0) e crc16 (ultimi 2), riscritti da storage.c. */
static int settings_eq_payload(const GalSettings *a, const GalSettings *b) {
  return memcmp((const uint8_t *)a + 1, (const uint8_t *)b + 1, sizeof(GalSettings) - 3u) == 0;
}

/* Byte di una chiave persist: se manca segnala il fallimento e ritorna un buffer a zero, cosi'
 * una storage.c rotta produce FAIL leggibili invece di far crashare il test. */
static uint8_t g_zero[GAL_CHUNK_BYTES];
static const uint8_t *key_bytes(uint32_t key) {
  const uint8_t *p = shim_key_bytes(key);
  if (p) {
    return p;
  }
  g_fail++;
  printf("FAIL chiave %u assente in persist\n", (unsigned)key);
  memset(g_zero, 0, sizeof(g_zero));
  return g_zero;
}

static void manifest_fix_crc(uint8_t *b) {
  const uint16_t c = crc16_ccitt(b, (uint32_t)sizeof(GalManifest) - 2u);
  memcpy(b + sizeof(GalManifest) - 2u, &c, sizeof(c));
}

/* Scrive `len` byte nella chiave 1, ricarica e pretende il manifest di DEFAULT (mai crash). */
static void expect_rejected(const uint8_t *b, uint16_t len, const char *what) {
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, b, len), (int)len);
  CHECK(storage_init());
  if (manifest_is_default(storage_manifest())) {
    g_ok++;
  } else {
    g_fail++;
    printf("FAIL manifest corrotto ACCETTATO: %s\n", what);
  }
  CHECK_EQ(storage_valid_slots(), 0);
}

/* Stato di riferimento: una foto in slot 3 committata (chunk + manifest + chiave schema). */
static void build_valid_state(void) {
  fresh(QUOTA_OK);
  fill_photo();
  CHECK_EQ(write_photo(3), STORAGE_OK);
  CHECK_EQ(storage_commit_slot(3, FMT_RAW6, PHOTO_LEN, 0xABCD1234u, 42u), STORAGE_OK);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
}

/* ---- 1. dimensioni e chiavi ---- */

/* Le stesse asserzioni di gal_types.h, ripetute qui: se un giorno l'header perdesse i propri
 * _Static_assert il layout del record persistito resterebbe comunque bloccato dai test. */
_Static_assert(sizeof(GalManifest) == 234, "GalManifest deve essere 234 B (schema 2)");
_Static_assert(sizeof(GalManifestV1) == 214, "GalManifestV1 deve essere 214 B (schema 1)");
_Static_assert(sizeof(GalSlotMeta) == 16, "GalSlotMeta deve essere 16 B");
_Static_assert(sizeof(GalSettings) == 20, "GalSettings deve essere 20 B");
_Static_assert(sizeof(GalRotState) == 4, "GalRotState deve essere 4 B");
_Static_assert(sizeof(GalManifest) <= GAL_CHUNK_BYTES, "il manifest deve stare in una chiave persist");
_Static_assert(GAL_SCHEMA == 2, "schema persistito corrente");

static void test_sizes(void) {
  CHECK_EQ(sizeof(GalManifest), 234);
  CHECK_EQ(sizeof(GalManifestV1), 214);
  CHECK_EQ(sizeof(GalSlotMeta), 16);
  CHECK_EQ(sizeof(GalRotState), 4);
  CHECK_EQ(sizeof(GalSettings), 20);
  CHECK_EQ(GAL_SCHEMA, 2);
  CHECK(sizeof(GalManifest) <= GAL_CHUNK_BYTES);        /* una sola chiave persist */
  CHECK_EQ(offsetof(GalManifest, crc16), 232);
  CHECK_EQ(offsetof(GalManifest, order), 6);
  CHECK_EQ(offsetof(GalManifest, shake_offset), 18);
  CHECK_EQ(offsetof(GalManifest, slots), 20);
  CHECK_EQ(offsetof(GalManifest, settings), 212);
  /* schema 1: stessi offset fino a slots[], reserved dove ora sta shake_offset */
  CHECK_EQ(offsetof(GalManifestV1, order), 6);
  CHECK_EQ(offsetof(GalManifestV1, reserved), 18);
  CHECK_EQ(offsetof(GalManifestV1, slots), 20);
  CHECK_EQ(offsetof(GalManifestV1, crc16), 212);
  CHECK_EQ(GAL_KEY_ROTSTATE, 2);
  CHECK_EQ(GAL_KEY_SETTINGS, 10);
  CHECK_EQ(GAL_KEY_CHUNK(0, 0), 1000u);
  CHECK_EQ(GAL_KEY_CHUNK(3, 133), 1000u + 3u * 256u + 133u);
  CHECK_EQ(GAL_KEY_CHUNK(11, 255), 1000u + 11u * 256u + 255u);
  CHECK_EQ(PHOTO_CHUNKS * GAL_CHUNK_BYTES - (GAL_CHUNK_BYTES - LAST_CHUNK_N), PHOTO_LEN);
  CHECK_EQ(STORAGE_SETTINGS_DEBOUNCE_MS, 10000);
}

/* ---- 2. init su persist vuoto ---- */

static void test_init_empty(void) {
  reset_all(QUOTA_OK);
  CHECK(storage_init() == true);
  CHECK(storage_album_enabled());
  CHECK_EQ(storage_quota(), QUOTA_OK);

  const GalManifest *m = storage_manifest();
  CHECK(m != NULL);
  CHECK_EQ(m->magic, GAL_MAGIC);
  CHECK_EQ(m->schema, GAL_SCHEMA);
  CHECK_EQ(m->slot_count, GAL_MAX_SLOTS);
  CHECK_EQ(m->shake_offset, 0);
  CHECK(order_all_none(m));
  CHECK(manifest_is_default(m));
  CHECK_EQ(storage_valid_slots(), 0);

  /* init NON scrive: nessuna chiave creata (neppure la 0) */
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(shim_key_count(), 0);
  CHECK(!shim_key_exists(GAL_KEY_SCHEMA));
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));

  GalSettings s;
  GalRotState r;
  CHECK(!storage_read_settings(&s));
  CHECK(!storage_read_rotstate(&r));
  CHECK(!storage_read_settings(NULL));
  CHECK(!storage_read_rotstate(NULL));
  CHECK(!shim_timer_pending());                   /* init non programma nulla senza migrazione */
  uint8_t rd[8];
  CHECK(storage_read_chunk(0, 0, rd, sizeof(rd)) < 0);

  /* soglia della quota */
  shim_set_quota(GAL_MIN_QUOTA - 1u);
  CHECK(storage_init() == false);
  CHECK_EQ(storage_quota(), GAL_MIN_QUOTA - 1u);
  shim_set_quota(GAL_MIN_QUOTA);
  CHECK(storage_init() == true);
  shim_set_quota(4u * 1024u * 1024u);
  CHECK(storage_init() == true);
}

/* ---- 3. quota < 1 MiB: album disabilitato, impostazioni e rotstate comunque ---- */

static void test_disabled_quota(void) {
  reset_all(QUOTA_BAD);
  CHECK(storage_init() == false);
  CHECK(!storage_album_enabled());
  CHECK_EQ(storage_quota(), QUOTA_BAD);

  uint8_t data[8] = { 1, 2, 3, 4, 5, 6, 7, 8 };
  uint8_t ord[GAL_MAX_SLOTS];
  memset(ord, GAL_SLOT_NONE, sizeof(ord));
  ord[0] = 0;
  CHECK_EQ(storage_write_chunk(0, 0, data, sizeof(data)), STORAGE_DISABLED);
  CHECK_EQ(storage_commit_slot(0, FMT_RAW6, PHOTO_LEN, 1u, 1u), STORAGE_DISABLED);
  CHECK_EQ(storage_set_order(ord), STORAGE_DISABLED);
  CHECK_EQ(storage_clear_slot(0), STORAGE_DISABLED);
  uint8_t rd[GAL_CHUNK_BYTES];
  CHECK(storage_read_chunk(0, 0, rd, sizeof(rd)) < 0);
  /* nemmeno gli argomenti invalidi devono scrivere qualcosa */
  CHECK_EQ(storage_write_chunk(GAL_MAX_SLOTS, 0, NULL, 0), STORAGE_DISABLED);
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(shim_key_count(), 0);
  CHECK_EQ(storage_valid_slots(), 0);

  /* shake: accettato comunque, ma solo con il debounce (nessuna chiave 2 nello schema 2) */
  GalRotState st;
  st.shake_offset = 5;
  st.crc16 = 0;
  CHECK(storage_write_rotstate(&st));
  CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));
  CHECK_EQ(shim_write_count(), 0);                     /* debounce: niente scritture immediate */
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_timeout(), STORAGE_SETTINGS_DEBOUNCE_MS);
  CHECK_EQ(shim_timer_registrations(), 1);
  CHECK_EQ(storage_manifest()->shake_offset, 5);
  GalRotState back;
  CHECK(!storage_read_rotstate(&back));                /* nessun record ancora scritto/letto */

  /* impostazioni: stesso timer (un solo AppTimer per impostazioni e shake) */
  GalSettings s, out;
  mk_settings(&s, 3);
  storage_settings_changed(&s);
  CHECK_EQ(shim_timer_registrations(), 1);
  CHECK_EQ(shim_timer_reschedules(), 1);
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_write_count(), 0);
  CHECK(shim_timer_fire());
  /* album disabilitato: il record dei metadati viene scritto lo stesso (impostazioni + shake) */
  CHECK_EQ(shim_write_count(), 2);                     /* chiave schema + manifest */
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);   /* il manifest sempre per ultimo */
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));
  CHECK_EQ(out.schema, GAL_SETTINGS_SCHEMA);
  CHECK(storage_read_rotstate(&back));                 /* lo stesso record porta anche lo shake */
  CHECK_EQ(back.shake_offset, 5);

  /* nessuna chiave dello schema 1 e nessun chunk toccato */
  CHECK(!shim_key_exists(GAL_KEY_SETTINGS));
  CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));
  CHECK(!shim_key_exists(GAL_KEY_CHUNK(0, 0)));
  CHECK_EQ(shim_key_count(), 2);
  CHECK(!storage_album_enabled());
  CHECK_EQ(storage_valid_slots(), 0);

  /* rilettura con la quota ancora bassa: impostazioni e shake sopravvivono al riavvio */
  CHECK(storage_init() == false);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));
  CHECK(storage_read_rotstate(&back));
  CHECK_EQ(back.shake_offset, 5);
  CHECK_EQ(shim_key_count(), 2);

  /* Album pieno e POI quota crollata (SDK vecchio / persist ridotto): schema 2 legge comunque il
   * record, quindi gli slot restano VISIBILI mentre i chunk non sono leggibili. Comportamento
   * CAMBIATO rispetto allo schema 1 (dove la lettura del manifest era sotto `if (s_album_enabled)`
   * e storage_valid_slots() valeva 0): la lettura serve per impostazioni e shake, ma model.c vede
   * degli slot validi e tenta 12 caricamenti falliti prima di ripiegare sulle demo. */
  fresh(QUOTA_OK);
  fill_photo();
  CHECK_EQ(write_photo(1), STORAGE_OK);
  CHECK_EQ(storage_commit_slot(1, FMT_RAW6, PHOTO_LEN, 0x1234u, 7u), STORAGE_OK);
  CHECK_EQ(storage_valid_slots(), 1);
  shim_set_quota(QUOTA_BAD);
  CHECK(storage_init() == false);
  /* Schema 2: il record viene letto anche con l'album disabilitato (porta impostazioni e shake) ma
   * slot e ordine vengono azzerati in RAM: model.c non deve provare 12 slot illeggibili. */
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK_EQ(storage_manifest()->order[0], GAL_SLOT_NONE);
  {
    uint8_t rd2[GAL_CHUNK_BYTES];
    CHECK(storage_read_chunk(1, 0, rd2, sizeof(rd2)) < 0);   /* ...ma i chunk non si leggono */
  }
  CHECK_EQ(storage_commit_slot(1, FMT_RAW6, PHOTO_LEN, 1u, 1u), STORAGE_DISABLED);
}

/* ---- 4. foto: 134 chunk + commit + rilettura ---- */

static void test_photo_commit(void) {
  fresh(QUOTA_OK);
  fill_photo();
  CHECK_EQ(write_photo(3), STORAGE_OK);
  CHECK_EQ(shim_write_count(), PHOTO_CHUNKS);
  CHECK_EQ(shim_key_count(), PHOTO_CHUNKS);

  int bad = 0;
  for (uint16_t i = 0; i < PHOTO_CHUNKS; i++) {
    const uint32_t key = GAL_KEY_CHUNK(3, i);
    const uint16_t n = chunk_len(i);
    if (shim_key_len(key) != (int)n
        || memcmp(key_bytes(key), g_photo + (uint32_t)i * GAL_CHUNK_BYTES, n) != 0) {
      bad++;
    }
  }
  CHECK_EQ(bad, 0);
  CHECK_EQ(shim_key_len(GAL_KEY_CHUNK(3, 0)), GAL_CHUNK_BYTES);
  CHECK_EQ(shim_key_len(GAL_KEY_CHUNK(3, PHOTO_CHUNKS - 1)), LAST_CHUNK_N);
  CHECK(!shim_key_exists(GAL_KEY_CHUNK(3, PHOTO_CHUNKS)));
  /* prima del commit non esiste alcun metadato (manifest scritto PER ULTIMO) */
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
  CHECK(!shim_key_exists(GAL_KEY_SCHEMA));
  CHECK_EQ(storage_valid_slots(), 0);

  const uint32_t crc = crc32_update(0, g_photo, PHOTO_LEN);
  CHECK_EQ(storage_commit_slot(3, FMT_RAW6, PHOTO_LEN, crc, 0xDEADBEEFu), STORAGE_OK);
  /* una foto = 134 chunk + 1 manifest + 1 schema (solo la prima volta) */
  CHECK_EQ(shim_write_count(), PHOTO_CHUNKS + 2);
  CHECK_EQ(shim_key_len(GAL_KEY_SCHEMA), 4);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));

  const GalManifest *m = storage_manifest();
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), m, sizeof(GalManifest)) == 0);
  CHECK_EQ(m->crc16, crc16_ccitt((const uint8_t *)m, (uint32_t)sizeof(GalManifest) - 2u));
  CHECK_EQ(m->magic, GAL_MAGIC);
  CHECK_EQ(m->schema, GAL_SCHEMA);
  CHECK_EQ(m->slot_count, GAL_MAX_SLOTS);
  CHECK_EQ(m->slots[3].state, GAL_SLOT_VALID);
  CHECK_EQ(m->slots[3].format, FMT_RAW6);
  CHECK_EQ(m->slots[3].generation, 1);
  CHECK_EQ(m->slots[3].length, PHOTO_LEN);
  CHECK_EQ(m->slots[3].crc32, crc);
  CHECK_EQ(m->slots[3].photo_id, 0xDEADBEEFu);
  CHECK_EQ(m->order[0], 3);
  CHECK_EQ(m->order[1], GAL_SLOT_NONE);
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK_EQ(m->slots[2].state, GAL_SLOT_EMPTY);

  /* rilettura dei chunk */
  static uint8_t rd[GAL_CHUNK_BYTES];
  CHECK_EQ(storage_read_chunk(3, 0, rd, sizeof(rd)), GAL_CHUNK_BYTES);
  CHECK(memcmp(rd, g_photo, GAL_CHUNK_BYTES) == 0);
  CHECK_EQ(storage_read_chunk(3, PHOTO_CHUNKS - 1, rd, sizeof(rd)), LAST_CHUNK_N);
  CHECK(memcmp(rd, g_photo + (uint32_t)(PHOTO_CHUNKS - 1) * GAL_CHUNK_BYTES, LAST_CHUNK_N) == 0);
  CHECK(storage_read_chunk(3, PHOTO_CHUNKS, rd, sizeof(rd)) < 0);   /* chiave assente */
  CHECK(storage_read_chunk(4, 0, rd, sizeof(rd)) < 0);              /* slot senza chunk */
  CHECK_EQ(storage_read_chunk(3, 0, rd, 100), 100);                 /* cap più piccolo: tronca */
  CHECK(memcmp(rd, g_photo, 100) == 0);

  /* ri-commit dello stesso slot: generation +1, order invariato, solo il manifest riscritto */
  int w = shim_write_count();
  CHECK_EQ(storage_commit_slot(3, FMT_RAW6, PHOTO_LEN, crc ^ 1u, 0xC0FFEEu), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 1);
  CHECK_EQ(m->slots[3].generation, 2);
  CHECK_EQ(m->slots[3].crc32, crc ^ 1u);
  CHECK_EQ(m->slots[3].photo_id, 0xC0FFEEu);
  CHECK_EQ(m->order[0], 3);
  CHECK_EQ(m->order[1], GAL_SLOT_NONE);
  CHECK_EQ(storage_valid_slots(), 1);

  /* secondo slot: accodato in order[] */
  CHECK_EQ(storage_write_chunk(7, 0, g_photo, GAL_CHUNK_BYTES), STORAGE_OK);
  CHECK_EQ(storage_commit_slot(7, FMT_RAW6, GAL_CHUNK_BYTES, 0x1111u, 7u), STORAGE_OK);
  CHECK_EQ(m->order[0], 3);
  CHECK_EQ(m->order[1], 7);
  CHECK_EQ(m->order[2], GAL_SLOT_NONE);
  CHECK_EQ(m->slots[7].generation, 1);
  CHECK_EQ(storage_valid_slots(), 2);

  /* seconda foto completa: 134 + 1 (la chiave schema c'è già) */
  fill_photo();
  shim_reset_write_count();
  CHECK_EQ(write_photo(5), STORAGE_OK);
  CHECK_EQ(storage_commit_slot(5, FMT_RAW6, PHOTO_LEN, crc32_update(0, g_photo, PHOTO_LEN), 5u),
           STORAGE_OK);
  CHECK_EQ(shim_write_count(), PHOTO_CHUNKS + 1);
  CHECK_EQ(m->order[2], 5);
  CHECK_EQ(m->order[3], GAL_SLOT_NONE);
  CHECK_EQ(storage_valid_slots(), 3);

  /* storage_init senza reset dello shim: stesso manifest BIT A BIT, nessuna scrittura */
  GalManifest saved;
  memcpy(&saved, storage_manifest(), sizeof(saved));
  const int w2 = shim_write_count();
  const int k2 = shim_key_count();
  CHECK(storage_init());
  CHECK(memcmp(&saved, storage_manifest(), sizeof(saved)) == 0);
  CHECK_EQ(shim_write_count(), w2);
  CHECK_EQ(shim_key_count(), k2);
  CHECK_EQ(storage_valid_slots(), 3);
  CHECK_EQ(storage_manifest()->slots[3].generation, 2);
}

/* ---- 5. manifest corrotto: sempre default, mai crash ---- */

static void test_manifest_corrupt(void) {
  build_valid_state();
  memcpy(g_ref, key_bytes(GAL_KEY_MANIFEST), sizeof(GalManifest));
  CHECK_EQ(crc16_ccitt(g_ref, (uint32_t)sizeof(GalManifest) - 2u),
           ((uint16_t)g_ref[232] | (uint16_t)((uint16_t)g_ref[233] << 8)));

  /* controllo: il riferimento viene accettato */
  CHECK(storage_init());
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK_EQ(storage_manifest()->slots[3].photo_id, 42u);

  /* CRC alterato (entrambi i byte) */
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  g_tmp[232] = (uint8_t)(g_tmp[232] ^ 0xFFu);
  expect_rejected(g_tmp, sizeof(GalManifest), "crc16 byte basso");
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  g_tmp[233] = (uint8_t)(g_tmp[233] ^ 0x01u);
  expect_rejected(g_tmp, sizeof(GalManifest), "crc16 byte alto");

  /* payload cambiato senza aggiornare il CRC */
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  g_tmp[offsetof(GalManifest, slots) + 8] ^= 0x20u;      /* dentro slots[0].crc32 */
  expect_rejected(g_tmp, sizeof(GalManifest), "payload alterato, crc16 vecchio");
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  g_tmp[offsetof(GalManifest, shake_offset)] ^= 0x11u;   /* schema 2: anche lo shake e' coperto */
  expect_rejected(g_tmp, sizeof(GalManifest), "shake_offset alterato, crc16 vecchio");
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  g_tmp[offsetof(GalManifest, settings) + 2] ^= 0x0Fu;   /* schema 2: e le impostazioni */
  expect_rejected(g_tmp, sizeof(GalManifest), "settings alterate, crc16 vecchio");

  /* dimensione 233 e 235 (214 = schema 1: percorso di migrazione, testato a parte) */
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  expect_rejected(g_tmp, (uint16_t)(sizeof(GalManifest) - 1u), "233 byte");
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  g_tmp[sizeof(GalManifest)] = 0x00;
  expect_rejected(g_tmp, (uint16_t)(sizeof(GalManifest) + 1u), "235 byte");

  /* magic diverso, CRC ricalcolato (solo il magic lo rifiuta) */
  {
    GalManifest mm;
    memcpy(&mm, g_ref, sizeof(mm));
    mm.magic = 0x314C4148u;                              /* "GAL1" -> "HAL1" */
    memcpy(g_tmp, &mm, sizeof(mm));
    manifest_fix_crc(g_tmp);
    expect_rejected(g_tmp, sizeof(GalManifest), "magic diverso (crc valido)");

    memcpy(&mm, g_ref, sizeof(mm));
    mm.schema = GAL_SCHEMA + 1;                          /* schema futuro nel manifest */
    memcpy(g_tmp, &mm, sizeof(mm));
    manifest_fix_crc(g_tmp);
    expect_rejected(g_tmp, sizeof(GalManifest), "schema 3 (crc valido)");

    memcpy(&mm, g_ref, sizeof(mm));
    mm.schema = 1;                                       /* schema 1 ma 234 B: non e' un V1 */
    memcpy(g_tmp, &mm, sizeof(mm));
    manifest_fix_crc(g_tmp);
    expect_rejected(g_tmp, sizeof(GalManifest), "schema 1 in un record da 234 B");

    memcpy(&mm, g_ref, sizeof(mm));
    mm.slot_count = GAL_MAX_SLOTS - 1;
    memcpy(g_tmp, &mm, sizeof(mm));
    manifest_fix_crc(g_tmp);
    expect_rejected(g_tmp, sizeof(GalManifest), "slot_count 11 (crc valido)");
  }

  /* tutti zero e tutti 0xFF, sia a 234 B (schema 2) sia a 214 B (percorso V1) */
  memset(g_tmp, 0, sizeof(GalManifest));
  expect_rejected(g_tmp, sizeof(GalManifest), "234 byte a zero");
  memset(g_tmp, 0xFF, sizeof(GalManifest));
  expect_rejected(g_tmp, sizeof(GalManifest), "234 byte a 0xFF");
  memset(g_tmp, 0, sizeof(GalManifestV1));
  expect_rejected(g_tmp, sizeof(GalManifestV1), "214 byte a zero (V1)");
  CHECK(!shim_timer_pending());                          /* nessuna migrazione, nessun timer */
  memset(g_tmp, 0xFF, sizeof(GalManifestV1));
  expect_rejected(g_tmp, sizeof(GalManifestV1), "214 byte a 0xFF (V1)");
  CHECK(!shim_timer_pending());
  /* 0 byte */
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, g_tmp, 0), 0);
  CHECK(storage_init());
  CHECK(manifest_is_default(storage_manifest()));

  /* i chunk non vengono mai toccati dalle riletture */
  CHECK(shim_key_exists(GAL_KEY_CHUNK(3, 0)));
  CHECK(shim_key_exists(GAL_KEY_CHUNK(3, PHOTO_CHUNKS - 1)));

  /* ripristinando il manifest valido torna tutto leggibile */
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, g_ref, sizeof(GalManifest)),
           (int)sizeof(GalManifest));
  CHECK(storage_init());
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK(memcmp(g_ref, storage_manifest(), sizeof(GalManifest)) == 0);
}

/* ---- 6. schema futuro/negativo nella chiave 0: reset dei metadati, chunk intatti ---- */

static void test_schema_reset(void) {
  const int32_t variants[] = { GAL_SCHEMA + 1, 127, -1, -2147483647 - 1 };
  for (size_t v = 0; v < sizeof(variants) / sizeof(variants[0]); v++) {
    build_valid_state();
    GalSettings s;
    mk_settings(&s, (uint8_t)(4u + v));
    storage_settings_changed(&s);
    CHECK(shim_timer_fire());
    GalRotState st;
    st.shake_offset = 9;
    st.crc16 = 0;
    CHECK(storage_write_rotstate(&st));
    /* flush con SOLO lo shake pendente: nessuna scrittura (lo shake si perde, contratto D10) */
    const int w_flush = shim_write_count();
    storage_flush();
    CHECK_EQ(shim_write_count(), w_flush);
    CHECK(!shim_timer_pending());
    CHECK(shim_key_exists(GAL_KEY_MANIFEST));
    CHECK(!shim_key_exists(GAL_KEY_SETTINGS));         /* schema 2: nessuna chiave 10 */
    CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));         /* schema 2: nessuna chiave 2 */
    /* chiavi 2 e 10 lasciate da una versione schema 1: prv_reset_meta deve cancellarle comunque */
    uint8_t legacy[sizeof(GalSettings)];
    memset(legacy, 0, sizeof(legacy));
    CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, legacy, sizeof(GalSettings)), (int)sizeof(GalSettings));
    CHECK_EQ(persist_write_data(GAL_KEY_ROTSTATE, legacy, sizeof(GalRotState)), (int)sizeof(GalRotState));
    const int keys_before = shim_key_count();
    const int del_before = shim_delete_count();

    /* il firmware ritorna i BYTE SCRITTI (4), non S_SUCCESS: prv_ensure_schema_key() deve
     * considerare successo ogni valore >= 0 (vedi il commento in storage.c) */
    CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, variants[v]), 4);
    CHECK(storage_init());                     /* album ancora abilitato */
    CHECK(!shim_key_exists(GAL_KEY_SCHEMA));
    CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
    CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));
    CHECK(!shim_key_exists(GAL_KEY_SETTINGS));
    CHECK_EQ(shim_delete_count(), del_before + 4);
    CHECK_EQ(shim_key_count(), keys_before - 4);
    CHECK(shim_key_exists(GAL_KEY_CHUNK(3, 0)));                 /* i chunk restano */
    CHECK(shim_key_exists(GAL_KEY_CHUNK(3, PHOTO_CHUNKS - 1)));
    CHECK(manifest_is_default(storage_manifest()));
    GalSettings so;
    GalRotState ro;
    CHECK(!storage_read_settings(&so));
    CHECK(!storage_read_rotstate(&ro));
  }

  /* controllo: schema corrente -> nessuna cancellazione */
  build_valid_state();
  CHECK(!shim_timer_pending());
  const int keys = shim_key_count();
  const int dels = shim_delete_count();
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK(storage_init());
  CHECK_EQ(shim_key_count(), keys);
  CHECK_EQ(shim_delete_count(), dels);
  CHECK_EQ(storage_valid_slots(), 1);
  /* schema 0 (chiave scritta da una versione precedente): nessun reset */
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 0), 4);
  CHECK(storage_init());
  CHECK_EQ(shim_delete_count(), dels);
  CHECK_EQ(storage_valid_slots(), 1);
}

/* ---- 7. argomenti invalidi: STORAGE_ERR e nessuna scrittura ---- */

static void test_args(void) {
  fresh(QUOTA_OK);
  static uint8_t data[GAL_CHUNK_BYTES];
  memset(data, 0xA5, sizeof(data));

  CHECK_EQ(storage_write_chunk(0, 0, data, 0), STORAGE_ERR);
  CHECK_EQ(storage_write_chunk(0, 0, data, GAL_CHUNK_BYTES + 1), STORAGE_ERR);
  CHECK_EQ(storage_write_chunk(0, 0, data, 65535), STORAGE_ERR);
  CHECK_EQ(storage_write_chunk(GAL_MAX_SLOTS, 0, data, 8), STORAGE_ERR);
  CHECK_EQ(storage_write_chunk(255, 0, data, 8), STORAGE_ERR);
  CHECK_EQ(storage_write_chunk(0, GAL_KEYS_PER_SLOT, data, 8), STORAGE_ERR);
  CHECK_EQ(storage_write_chunk(0, 65535, data, 8), STORAGE_ERR);
  CHECK_EQ(storage_write_chunk(0, 0, NULL, 8), STORAGE_ERR);
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(shim_key_count(), 0);

  /* estremi validi */
  CHECK_EQ(storage_write_chunk(0, 0, data, GAL_CHUNK_BYTES), STORAGE_OK);
  CHECK_EQ(storage_write_chunk(GAL_MAX_SLOTS - 1, GAL_KEYS_PER_SLOT - 1, data, 1), STORAGE_OK);
  CHECK_EQ(shim_key_len(GAL_KEY_CHUNK(0, 0)), GAL_CHUNK_BYTES);
  CHECK_EQ(shim_key_len(GAL_KEY_CHUNK(GAL_MAX_SLOTS - 1, GAL_KEYS_PER_SLOT - 1)), 1);
  CHECK_EQ(shim_write_count(), 2);

  uint8_t rd[16];
  CHECK(storage_read_chunk(GAL_MAX_SLOTS, 0, rd, sizeof(rd)) < 0);
  CHECK(storage_read_chunk(0, GAL_KEYS_PER_SLOT, rd, sizeof(rd)) < 0);
  CHECK(storage_read_chunk(0, 0, NULL, sizeof(rd)) < 0);
  CHECK(storage_read_chunk(0, 0, rd, 0) < 0);
  CHECK(storage_read_chunk(0, 1, rd, sizeof(rd)) < 0);          /* chiave assente */
  CHECK_EQ(storage_read_chunk(0, 0, rd, sizeof(rd)), (int)sizeof(rd));

  CHECK_EQ(storage_commit_slot(GAL_MAX_SLOTS, FMT_RAW6, PHOTO_LEN, 0, 1), STORAGE_ERR);
  CHECK_EQ(storage_commit_slot(255, FMT_RAW6, PHOTO_LEN, 0, 1), STORAGE_ERR);
  CHECK_EQ(storage_commit_slot(0, FMT_RAW6, 0, 0, 1), STORAGE_ERR);
  CHECK_EQ(storage_commit_slot(0, FMT_RAW6, (uint32_t)GAL_KEYS_PER_SLOT * GAL_CHUNK_BYTES + 1u, 0, 1),
           STORAGE_ERR);
  CHECK_EQ(storage_commit_slot(0, FMT_RAW6, 0xFFFFFFFFu, 0, 1), STORAGE_ERR);
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(storage_valid_slots(), 0);
  /* limite superiore accettato */
  CHECK_EQ(storage_commit_slot(0, FMT_RAW6, (uint32_t)GAL_KEYS_PER_SLOT * GAL_CHUNK_BYTES, 0, 1),
           STORAGE_OK);
  CHECK_EQ(storage_valid_slots(), 1);

  CHECK_EQ(storage_set_order(NULL), STORAGE_ERR);
  CHECK_EQ(storage_clear_slot(GAL_MAX_SLOTS), STORAGE_ERR);
  CHECK_EQ(storage_clear_slot(200), STORAGE_ERR);
  CHECK_EQ(storage_valid_slots(), 1);
}

/* ---- 8. E_OUT_OF_STORAGE: NO_SPACE e manifest in RAM ripristinato ---- */

static void test_write_failures(void) {
  fresh(QUOTA_OK);
  static uint8_t data[GAL_CHUNK_BYTES];
  memset(data, 0x5A, sizeof(data));

  shim_fail_writes_after(0);
  CHECK_EQ(storage_write_chunk(2, 0, data, GAL_CHUNK_BYTES), STORAGE_NO_SPACE);
  CHECK(!shim_key_exists(GAL_KEY_CHUNK(2, 0)));
  CHECK_EQ(shim_write_count(), 0);
  shim_fail_writes_code(E_ERROR);                 /* errore generico -> STORAGE_ERR */
  CHECK_EQ(storage_write_chunk(2, 0, data, GAL_CHUNK_BYTES), STORAGE_ERR);
  shim_fail_writes_code(E_OUT_OF_STORAGE);
  /* la quota finisce a metà foto: i primi 2 chunk passano */
  shim_fail_writes_after(2);
  CHECK_EQ(storage_write_chunk(2, 0, data, GAL_CHUNK_BYTES), STORAGE_OK);
  CHECK_EQ(storage_write_chunk(2, 1, data, GAL_CHUNK_BYTES), STORAGE_OK);
  CHECK_EQ(storage_write_chunk(2, 2, data, GAL_CHUNK_BYTES), STORAGE_NO_SPACE);
  CHECK_EQ(shim_write_count(), 2);
  CHECK(!shim_key_exists(GAL_KEY_CHUNK(2, 2)));

  /* commit che fallisce sulla chiave schema (prima scrittura del commit) */
  GalManifest before;
  memcpy(&before, storage_manifest(), sizeof(before));
  shim_fail_writes_after(0);
  CHECK_EQ(storage_commit_slot(2, FMT_RAW6, 512u, 7u, 9u), STORAGE_NO_SPACE);
  CHECK(memcmp(&before, storage_manifest(), sizeof(before)) == 0);
  CHECK(!shim_key_exists(GAL_KEY_SCHEMA));
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
  CHECK_EQ(storage_valid_slots(), 0);
  shim_fail_writes_after(-1);

  /* commit riuscito, poi commit che fallisce sulla scrittura del manifest */
  CHECK_EQ(storage_commit_slot(2, FMT_RAW6, 512u, 7u, 9u), STORAGE_OK);
  CHECK_EQ(storage_manifest()->slots[2].generation, 1);
  memcpy(&before, storage_manifest(), sizeof(before));
  static uint8_t key1[sizeof(GalManifest)];
  memcpy(key1, key_bytes(GAL_KEY_MANIFEST), sizeof(key1));

  shim_fail_writes_after(0);
  CHECK_EQ(storage_commit_slot(4, FMT_RAW6, 1024u, 0x99u, 11u), STORAGE_NO_SPACE);
  CHECK(memcmp(&before, storage_manifest(), sizeof(before)) == 0);      /* RAM ripristinata */
  CHECK(memcmp(key1, key_bytes(GAL_KEY_MANIFEST), sizeof(key1)) == 0);  /* chiave 1 invariata */
  CHECK_EQ(storage_manifest()->slots[4].state, GAL_SLOT_EMPTY);
  CHECK_EQ(storage_manifest()->slots[4].generation, 0);
  CHECK_EQ(storage_manifest()->order[1], GAL_SLOT_NONE);
  CHECK_EQ(storage_valid_slots(), 1);
  /* stesso slot: nemmeno generation deve avanzare */
  CHECK_EQ(storage_commit_slot(2, FMT_RAW6, 512u, 7u, 9u), STORAGE_NO_SPACE);
  CHECK_EQ(storage_manifest()->slots[2].generation, 1);
  CHECK(memcmp(&before, storage_manifest(), sizeof(before)) == 0);
  /* set_order e clear_slot: stesso ripristino */
  uint8_t ord[GAL_MAX_SLOTS];
  memset(ord, 0, sizeof(ord));
  CHECK_EQ(storage_set_order(ord), STORAGE_NO_SPACE);
  CHECK(memcmp(&before, storage_manifest(), sizeof(before)) == 0);
  CHECK_EQ(storage_clear_slot(2), STORAGE_NO_SPACE);
  CHECK(memcmp(&before, storage_manifest(), sizeof(before)) == 0);
  CHECK(memcmp(key1, key_bytes(GAL_KEY_MANIFEST), sizeof(key1)) == 0);
  CHECK_EQ(storage_valid_slots(), 1);
  /* errore generico sul manifest -> STORAGE_ERR (sempre con ripristino) */
  shim_fail_writes_code(E_ERROR);
  CHECK_EQ(storage_commit_slot(4, FMT_RAW6, 1024u, 0x99u, 11u), STORAGE_ERR);
  CHECK(memcmp(&before, storage_manifest(), sizeof(before)) == 0);
  shim_fail_writes_code(E_OUT_OF_STORAGE);

  /* shake sotto iniezione: la scossa e' sempre accettata (solo debounce), ma la scrittura del
   * manifest alla scadenza fallisce -> dirty mantenuto e chiave 1 invariata (nessun dato perso) */
  GalRotState st;
  st.shake_offset = 2;
  st.crc16 = 0;
  CHECK(storage_write_rotstate(&st));                  /* true: non scrive, programma soltanto */
  CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));
  CHECK(shim_timer_pending());
  const int wr = shim_write_count();
  shim_log_reset();
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), wr);                    /* scrittura fallita */
  CHECK(memcmp(key1, key_bytes(GAL_KEY_MANIFEST), sizeof(key1)) == 0);
  CHECK_EQ(shim_log_find("storage: write key 1"), 1);  /* errore loggato una volta sola */
  CHECK_EQ(shim_log_errors(), 1);

  /* nuova scossa: il timer riparte e, finita l'emergenza, scrive lo shake accumulato */
  st.shake_offset = 3;
  CHECK(storage_write_rotstate(&st));
  CHECK(shim_timer_pending());
  shim_fail_writes_after(-1);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), wr + 1);
  GalRotState back;
  CHECK(storage_read_rotstate(&back));
  CHECK_EQ(back.shake_offset, 3);
  CHECK_EQ(storage_manifest()->shake_offset, 3);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);
  CHECK(!shim_timer_pending());

  /* finita l'emergenza tutto riprende: generation avanza UNA sola volta */
  CHECK_EQ(storage_commit_slot(2, FMT_RAW6, 512u, 7u, 9u), STORAGE_OK);
  CHECK_EQ(storage_manifest()->slots[2].generation, 2);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);
}

/* ---- 9. impostazioni: debounce 10 s, ultima copia, flush, validazione ---- */

static void test_settings(void) {
  fresh(QUOTA_OK);
  GalSettings out;
  CHECK(!storage_read_settings(&out));                 /* persist vuoto */
  CHECK(!storage_read_settings(NULL));
  storage_settings_changed(NULL);                      /* nessun effetto, nessun timer */
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), 0);
  CHECK_EQ(shim_write_count(), 0);

  GalSettings a, b;
  mk_settings(&a, 1);
  storage_settings_changed(&a);
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_timeout(), STORAGE_SETTINGS_DEBOUNCE_MS);
  CHECK_EQ(shim_timer_registrations(), 1);
  CHECK_EQ(shim_write_count(), 0);                     /* debounce: nessuna scrittura subito */
  CHECK(!shim_key_exists(GAL_KEY_SETTINGS));

  /* seconda modifica prima della scadenza: reschedule, non un secondo timer */
  mk_settings(&b, 6);
  CHECK(!settings_eq_payload(&a, &b));
  storage_settings_changed(&b);
  CHECK_EQ(shim_timer_registrations(), 1);
  CHECK_EQ(shim_timer_reschedules(), 1);
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_timeout(), STORAGE_SETTINGS_DEBOUNCE_MS);
  CHECK_EQ(shim_write_count(), 0);

  /* alla scadenza viene scritta l'ULTIMA copia, DENTRO il manifest (schema 2) */
  CHECK(shim_timer_fire());
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), 2);                     /* schema + manifest */
  CHECK(!shim_key_exists(GAL_KEY_SETTINGS));           /* la chiave 10 non esiste piu' */
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  {
    const uint8_t *man = key_bytes(GAL_KEY_MANIFEST);
    const uint8_t *p = man + offsetof(GalManifest, settings);
    CHECK_EQ(p[0], GAL_SETTINGS_SCHEMA);               /* schema forzato */
    uint16_t pc = 0;
    memcpy(&pc, p + sizeof(GalSettings) - 2u, sizeof(pc));
    CHECK_EQ(pc, crc16_ccitt(p, (uint32_t)sizeof(GalSettings) - 2u));   /* CRC16 sui 18 B */
    CHECK(pc != 0xBEEF);
    uint16_t mc = 0;
    memcpy(&mc, man + sizeof(GalManifest) - 2u, sizeof(mc));
    CHECK_EQ(mc, crc16_ccitt(man, (uint32_t)sizeof(GalManifest) - 2u)); /* CRC16 sui 232 B */
    CHECK(memcmp(man, storage_manifest(), sizeof(GalManifest)) == 0);
  }
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &b));
  CHECK(!settings_eq_payload(&out, &a));
  CHECK_EQ(out.schema, GAL_SETTINGS_SCHEMA);
  CHECK_EQ(out.interval_min, b.interval_min);

  /* flush senza modifiche pendenti: nessuna scrittura */
  int w = shim_write_count();
  storage_flush();
  CHECK_EQ(shim_write_count(), w);
  CHECK(!shim_timer_pending());

  /* flush con timer pendente: cancella e scrive subito */
  GalSettings c;
  mk_settings(&c, 9);
  storage_settings_changed(&c);
  CHECK(shim_timer_pending());
  const int cancels = shim_timer_cancels();
  storage_flush();
  CHECK_EQ(shim_timer_cancels(), cancels + 1);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), w + 1);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &c));
  storage_flush();                                     /* idempotente */
  CHECK_EQ(shim_write_count(), w + 1);

  /* nessun timer disponibile (heap): scrittura immediata, mai perdere dati */
  shim_fail_timer_register(true);
  GalSettings d;
  mk_settings(&d, 12);
  storage_settings_changed(&d);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), w + 2);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &d));
  shim_fail_timer_register(false);

  /* Schema 2: le impostazioni non hanno piu' una chiave propria, quindi le vecchie prove di
   * corruzione della chiave 10 diventano prove sul RECORD UNICO, rilette con storage_init.
   * (a) un byte delle impostazioni alterato senza aggiornare il CRC del manifest -> tutto il
   *     record e' rifiutato: default e nessun record caricato (anche le foto sono perse). */
  uint8_t saved[sizeof(GalManifest)];
  uint8_t tmp[sizeof(GalManifest)];
  memcpy(saved, key_bytes(GAL_KEY_MANIFEST), sizeof(saved));
  memcpy(tmp, saved, sizeof(tmp));
  tmp[offsetof(GalManifest, settings) + 5] ^= 0xFFu;
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, tmp, sizeof(tmp)), (int)sizeof(tmp));
  CHECK(storage_init());
  CHECK(!storage_read_settings(&out));
  CHECK(manifest_is_default(storage_manifest()));
  /* (b) impostazioni FUORI INTERVALLO con CRC del manifest valido: il record resta buono (slot e
   *     ordine si salvano) ma le impostazioni tornano ai default. */
  memcpy(tmp, saved, sizeof(tmp));
  tmp[offsetof(GalManifest, settings) + offsetof(GalSettings, interval_min)] = 7;   /* non ammesso */
  tmp[offsetof(GalManifest, settings) + offsetof(GalSettings, interval_min) + 1] = 0;
  manifest_fix_crc(tmp);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, tmp, sizeof(tmp)), (int)sizeof(tmp));
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));                  /* record caricato... */
  {
    GalSettings def;
    settings_set_defaults(&def);
    CHECK(settings_eq_payload(&out, &def));            /* ...ma impostazioni ai default */
    CHECK(!settings_eq_payload(&out, &d));
  }
  /* (c) schema delle impostazioni diverso da GAL_SETTINGS_SCHEMA: stessa regola */
  memcpy(tmp, saved, sizeof(tmp));
  tmp[offsetof(GalManifest, settings)] = GAL_SETTINGS_SCHEMA + 1;
  manifest_fix_crc(tmp);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, tmp, sizeof(tmp)), (int)sizeof(tmp));
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  CHECK_EQ(out.schema, GAL_SETTINGS_SCHEMA);
  {
    GalSettings def;
    settings_set_defaults(&def);
    CHECK(settings_eq_payload(&out, &def));
  }
  /* (d) dimensione sbagliata: record ignorato */
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, saved, sizeof(saved) - 1u),
           (int)sizeof(saved) - 1);
  CHECK(storage_init());
  CHECK(!storage_read_settings(&out));
  /* (e) record ripristinato: torna tutto (le impostazioni di d NON erano valide -> default) */
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, saved, sizeof(saved)), (int)sizeof(saved));
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &d));                /* impostazioni valide: sopravvivono al riavvio */
  CHECK_EQ(out.schema, GAL_SETTINGS_SCHEMA);
  CHECK_EQ(storage_valid_slots(), 0);                  /* questo caso non ha foto */

  /* scrittura fallita alla scadenza del timer: le impostazioni pendenti restano dirty e il flush le
   * ritenta (BUG S4 trovato da questo test e corretto: s_settings_dirty veniva azzerato PRIMA della
   * scrittura e la copia pendente andava persa senza ritentativi). */
  GalSettings e;
  mk_settings(&e, 15);
  shim_fail_writes_after(0);
  storage_settings_changed(&e);
  CHECK(shim_timer_pending());
  CHECK(shim_timer_fire());
  /* schema 2: storage_read_settings ritorna la copia in RAM (gia' aggiornata), mentre in PERSIST
   * c'e' ancora il record vecchio: la scrittura e' fallita e resta pendente */
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &e));
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), saved, sizeof(saved)) == 0);
  shim_fail_writes_after(-1);
  const int wf = shim_write_count();
  storage_flush();
  CHECK_EQ(shim_write_count(), wf + 1);                /* ritentata e scritta */
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &e));
  storage_flush();
  CHECK_EQ(shim_write_count(), wf + 1);                /* non più dirty: nessuna scrittura in più */

  /* F2 (revisione 29/08): il timer è SCADUTO ma il suo callback non è ancora stato eseguito (in coda
   * dietro l'evento in corso: evented_timer) quando arriva un'altra modifica → app_timer_reschedule
   * ritorna false. storage.c deve CANCELLARE quel timer (il callback in coda viene scartato) e
   * registrarne uno nuovo, non sovrascrivere l'handle: prima il callback in coda restava vivo
   * (orphan) e scriveva subito la copia pendente (gia' aggiornata: nessuna perdita di dati, ma il
   * debounce saltava) mentre il timer nuovo trovava dirty=false. Le asserzioni sui dati qui sotto
   * descrivono il comportamento atteso; il fix e' pinnato dai contatori dello shim (cancels/orphans). */
  GalSettings fa, fb;
  mk_settings(&fa, 3);
  mk_settings(&fb, 10);
  CHECK(!settings_eq_payload(&fa, &fb));
  const int reg0 = shim_timer_registrations();
  const int can0 = shim_timer_cancels();
  const int res0 = shim_timer_reschedules();
  const int w0 = shim_write_count();
  storage_settings_changed(&fa);                       /* modifica a → timer pendente */
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), reg0 + 1);
  CHECK(shim_timer_expire());                          /* scaduto, callback in coda */
  CHECK(shim_timer_expired());
  CHECK(shim_timer_pending());
  storage_settings_changed(&fb);                       /* modifica b: reschedule → false */
  CHECK_EQ(shim_timer_reschedules(), res0);
  CHECK_EQ(shim_timer_cancels(), can0 + 1);            /* il timer scaduto viene cancellato... */
  CHECK_EQ(shim_timer_registrations(), reg0 + 2);      /* ...e ne parte uno nuovo */
  CHECK_EQ(shim_timer_orphans(), 0);                   /* mai una register con un timer ancora vivo */
  CHECK(shim_timer_pending());
  CHECK(!shim_timer_expired());
  CHECK_EQ(shim_timer_timeout(), STORAGE_SETTINGS_DEBOUNCE_MS);
  CHECK_EQ(shim_write_count(), w0);                    /* nessuna scrittura anticipata */
  CHECK(shim_timer_fire());                            /* il timer nuovo scrive la copia b, UNA volta */
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), w0 + 1);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &fb));
  CHECK(!settings_eq_payload(&out, &fa));
  CHECK(!shim_timer_fire());                           /* niente altro in coda */
  storage_flush();
  CHECK_EQ(shim_write_count(), w0 + 1);                /* non più dirty */
  CHECK_EQ(shim_timer_orphans(), 0);                   /* per tutta la sezione timer */
}

/* ---- 10. stato rotazione (shake nel manifest, debounce come le impostazioni) ---- */

static void test_rotstate(void) {
  fresh(QUOTA_OK);
  GalRotState out;
  CHECK(!storage_read_rotstate(&out));                 /* nessun record */
  CHECK(!storage_read_rotstate(NULL));
  CHECK(!storage_write_rotstate(NULL));
  CHECK_EQ(shim_write_count(), 0);
  CHECK(!shim_timer_pending());

  /* prima scossa: solo debounce, nessuna scrittura e nessuna chiave 2 */
  GalRotState st;
  st.shake_offset = 27719;                             /* ROT_SHAKE_MOD - 1: 16 bit, little-endian */
  st.crc16 = 0x1234;                                   /* ignorato: il CRC e' quello del manifest */
  CHECK(storage_write_rotstate(&st));
  CHECK_EQ(shim_write_count(), 0);
  CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_timeout(), STORAGE_SETTINGS_DEBOUNCE_MS);
  CHECK_EQ(shim_timer_registrations(), 1);
  CHECK_EQ(storage_manifest()->shake_offset, 27719);   /* subito in RAM (la rotazione lo usa) */
  CHECK(!storage_read_rotstate(&out));                 /* ...ma nessun record ancora */

  /* piu' scosse ravvicinate: UN solo timer (reschedule) e UNA sola scrittura */
  for (uint16_t v = 27720; v <= 27724; v++) {
    st.shake_offset = v;
    CHECK(storage_write_rotstate(&st));
  }
  CHECK_EQ(shim_timer_registrations(), 1);
  CHECK_EQ(shim_timer_reschedules(), 5);
  CHECK_EQ(shim_timer_orphans(), 0);
  CHECK_EQ(shim_write_count(), 0);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);                     /* chiave schema + manifest */
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));
  CHECK(storage_read_rotstate(&out));
  CHECK_EQ(out.shake_offset, 27724);                   /* l'ULTIMO valore */
  CHECK_EQ(out.crc16, 0);                              /* campo non piu' usato: sempre azzerato */
  {
    const uint8_t *p = key_bytes(GAL_KEY_MANIFEST) + offsetof(GalManifest, shake_offset);
    CHECK_EQ(p[0], 0x4C);                              /* 27724 = 0x6C4C, little-endian */
    CHECK_EQ(p[1], 0x6C);
  }

  /* shake INVARIATO: nessun timer, nessuna scrittura */
  int w = shim_write_count();
  int reg = shim_timer_registrations();
  st.shake_offset = 27724;
  CHECK(storage_write_rotstate(&st));
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), reg);
  CHECK_EQ(shim_write_count(), w);
  CHECK(storage_write_rotstate(&st));                  /* idempotente */
  CHECK_EQ(shim_write_count(), w);
  CHECK(!shim_timer_pending());

  /* riavvio: lo shake si rilegge dal manifest */
  CHECK(storage_init());
  CHECK_EQ(shim_write_count(), w);
  CHECK(storage_read_rotstate(&out));
  CHECK_EQ(out.shake_offset, 27724);
  CHECK_EQ(storage_manifest()->shake_offset, 27724);

  /* flush con SOLO lo shake pendente: il timer viene cancellato e NON si scrive (l'offset va
   * perso: contratto D10 rivista, l'uscita non deve pagare una scansione del file) */
  st.shake_offset = 1234;
  CHECK(storage_write_rotstate(&st));
  CHECK(shim_timer_pending());
  const int can = shim_timer_cancels();
  storage_flush();
  CHECK_EQ(shim_timer_cancels(), can + 1);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), w);                     /* NESSUNA scrittura */
  CHECK(storage_init());
  CHECK_EQ(storage_manifest()->shake_offset, 27724);   /* in persist c'e' ancora il valore vecchio */

  /* flush con impostazioni pendenti: UNA scrittura che porta anche lo shake accumulato */
  GalSettings sp;
  mk_settings(&sp, 4);
  reg = shim_timer_registrations();
  const int res = shim_timer_reschedules();
  st.shake_offset = 4321;
  CHECK(storage_write_rotstate(&st));                  /* shake dirty: un timer... */
  storage_settings_changed(&sp);                       /* ...piu' impostazioni: lo STESSO timer */
  CHECK_EQ(shim_timer_registrations(), reg + 1);
  CHECK_EQ(shim_timer_reschedules(), res + 1);
  CHECK_EQ(shim_timer_orphans(), 0);
  CHECK(shim_timer_pending());
  w = shim_write_count();
  storage_flush();
  CHECK_EQ(shim_write_count(), w + 1);                 /* una sola scrittura */
  CHECK(!shim_timer_pending());
  CHECK(storage_read_rotstate(&out));
  CHECK_EQ(out.shake_offset, 4321);
  GalSettings so;
  CHECK(storage_read_settings(&so));
  CHECK(settings_eq_payload(&so, &sp));
  storage_flush();                                     /* idempotente: niente piu' pendente */
  CHECK_EQ(shim_write_count(), w + 1);
  CHECK(storage_init());                               /* e sopravvive al riavvio */
  CHECK(storage_read_rotstate(&out));
  CHECK_EQ(out.shake_offset, 4321);
  CHECK(storage_read_settings(&so));
  CHECK(settings_eq_payload(&so, &sp));

  /* roundtrip su shake_offset a 16 bit (tutti i byte bassi + estremi), in RAM */
  int bad_rt = 0;
  for (int v = 0; v < 65536; v += (v < 256 ? 1 : 997)) {
    st.shake_offset = (uint16_t)v;
    if (!storage_write_rotstate(&st) || !storage_read_rotstate(&out) || out.shake_offset != (uint16_t)v) {
      bad_rt++;
    }
  }
  CHECK_EQ(bad_rt, 0);
  /* ...e attraverso persist per gli estremi */
  const uint16_t extremes[4] = { 0, 1, 32768u, 65535u };
  for (size_t i = 0; i < 4; i++) {
    st.shake_offset = extremes[i];
    CHECK(storage_write_rotstate(&st));
    if (shim_timer_pending()) {
      GalSettings force;
      mk_settings(&force, (uint8_t)(i + 1u));
      storage_settings_changed(&force);                /* le impostazioni fanno scrivere il record */
      storage_flush();
    }
    CHECK(storage_init());
    CHECK(storage_read_rotstate(&out));
    CHECK_EQ(out.shake_offset, extremes[i]);
  }
}

/* ---- 11. clear_slot / set_order ---- */

static void test_clear_and_order(void) {
  fresh(QUOTA_OK);
  static uint8_t data[GAL_CHUNK_BYTES];
  memset(data, 0x77, sizeof(data));
  CHECK_EQ(storage_write_chunk(3, 0, data, GAL_CHUNK_BYTES), STORAGE_OK);
  CHECK_EQ(storage_write_chunk(3, 1, data, 100), STORAGE_OK);
  CHECK_EQ(storage_commit_slot(3, FMT_RAW6, 356u, 1u, 1u), STORAGE_OK);
  CHECK_EQ(storage_write_chunk(7, 0, data, GAL_CHUNK_BYTES), STORAGE_OK);
  CHECK_EQ(storage_commit_slot(7, FMT_RAW6, 256u, 2u, 2u), STORAGE_OK);
  CHECK_EQ(storage_valid_slots(), 2);

  int w = shim_write_count();
  CHECK_EQ(storage_clear_slot(3), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 1);                 /* solo il manifest */
  CHECK_EQ(storage_manifest()->slots[3].state, GAL_SLOT_EMPTY);
  CHECK_EQ(storage_manifest()->slots[3].generation, 1);         /* metadati conservati */
  CHECK_EQ(storage_manifest()->slots[3].length, 356u);
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK(shim_key_exists(GAL_KEY_CHUNK(3, 0)));                  /* i chunk restano */
  CHECK_EQ(shim_key_len(GAL_KEY_CHUNK(3, 1)), 100);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);
  CHECK_EQ(storage_manifest()->order[0], 3);                    /* order non viene compattato */
  CHECK_EQ(storage_manifest()->order[1], 7);
  /* F31 (revisione 05/09): idempotente — slot gia' EMPTY ⇒ STORAGE_OK senza scrivere ne' cercare
   * (un ALBUM_DELETE ritrasmesso dal telefono non appende un record morto: come set_order con
   * ordine identico), anche su uno slot mai usato e anche con la scrittura impossibile */
  w = shim_write_count();
  shim_lookup_reset();
  CHECK_EQ(storage_clear_slot(3), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w);
  CHECK_EQ(shim_lookup_count(), 0);
  CHECK_EQ(storage_clear_slot(9), STORAGE_OK);                  /* slot mai usato */
  CHECK_EQ(shim_write_count(), w);
  shim_fail_writes_after(0);
  CHECK_EQ(storage_clear_slot(3), STORAGE_OK);                  /* no-op: mai NO_SPACE per nulla */
  CHECK_EQ(storage_clear_slot(9), STORAGE_OK);
  shim_fail_writes_after(-1);
  CHECK_EQ(shim_write_count(), w);
  CHECK_EQ(shim_lookup_count(), 0);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);
  CHECK_EQ(storage_manifest()->slots[3].generation, 1);         /* metadati ancora conservati */
  CHECK_EQ(storage_valid_slots(), 1);

  /* set_order: 12 B copiati alla lettera + manifest riscritto */
  uint8_t ord[GAL_MAX_SLOTS];
  memset(ord, GAL_SLOT_NONE, sizeof(ord));
  ord[0] = 7;
  ord[1] = 3;
  w = shim_write_count();
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 1);
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);
  CHECK_EQ(storage_manifest()->crc16,
           crc16_ccitt(key_bytes(GAL_KEY_MANIFEST), (uint32_t)sizeof(GalManifest) - 2u));

  /* S7 F9(4): set_order idempotente — ordine identico a quello in RAM ⇒ STORAGE_OK e NESSUNA
   * scrittura (ogni HELLO con foto manda ALBUM_ORDER: prima era un manifest da 214 B per sync);
   * anche una copia in un altro buffer conta come identica; ordine diverso ⇒ una sola scrittura. */
  w = shim_write_count();
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w);
  uint8_t same[GAL_MAX_SLOTS];
  memcpy(same, ord, sizeof(same));
  CHECK_EQ(storage_set_order(same), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w);
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);   /* l'ultima scrittura resta quella di prima */
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);
  same[2] = 5;                                           /* un byte diverso (anche oltre i validi) */
  CHECK_EQ(storage_set_order(same), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 1);
  CHECK(memcmp(storage_manifest()->order, same, sizeof(same)) == 0);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);          /* torniamo all'ordine di partenza */
  CHECK_EQ(shim_write_count(), w + 2);
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);          /* ancora idempotente dopo un cambio */
  CHECK_EQ(shim_write_count(), w + 2);
  /* con l'album disabilitato il controllo di quota viene PRIMA del confronto: STORAGE_DISABLED
   * anche per un ordine identico (test_disabled_quota copre l'ordine diverso) */
  shim_set_quota(QUOTA_BAD);
  CHECK(!storage_init());
  /* Schema 2: il record viene letto ANCHE con l'album disabilitato (porta impostazioni e shake) ma
   * slot e ordine vengono azzerati in RAM (storage_init). Il controllo di quota resta comunque
   * PRIMA del confronto: STORAGE_DISABLED anche per un ordine identico a quello in RAM. */
  CHECK_EQ(storage_manifest()->order[0], GAL_SLOT_NONE);
  CHECK_EQ(storage_set_order(ord), STORAGE_DISABLED);
  memset(same, GAL_SLOT_NONE, sizeof(same));
  CHECK_EQ(storage_set_order(same), STORAGE_DISABLED);
  CHECK_EQ(shim_write_count(), w + 2);
  shim_set_quota(QUOTA_OK);
  CHECK(storage_init());
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);   /* riletto da persist */

  /* order pieno senza GAL_SLOT_NONE: il commit di un nuovo slot non lo aggiunge (né sfora) */
  for (uint8_t i = 0; i < GAL_MAX_SLOTS; i++) {
    ord[i] = (uint8_t)(GAL_MAX_SLOTS - 1u - i);
  }
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);
  CHECK_EQ(storage_commit_slot(5, FMT_RAW6, 256u, 3u, 3u), STORAGE_OK);
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);
  CHECK_EQ(storage_manifest()->slots[5].state, GAL_SLOT_VALID);
  memset(ord, 0, sizeof(ord));                          /* 12 voci uguali: nessun NONE, slot assente */
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);
  CHECK_EQ(storage_commit_slot(9, FMT_RAW6, 256u, 4u, 4u), STORAGE_OK);
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);
  CHECK_EQ(storage_manifest()->slots[9].state, GAL_SLOT_VALID);

  /* il manifest riletto da persist coincide bit a bit */
  GalManifest saved;
  memcpy(&saved, storage_manifest(), sizeof(saved));
  CHECK(storage_init());
  CHECK(memcmp(&saved, storage_manifest(), sizeof(saved)) == 0);
  CHECK_EQ(storage_valid_slots(), 3);
}

/* ---- 12. chiave 0 (s_schema_ok): la prima scrittura la ripete solo se serve ---- */

static void test_schema_key_writes(void) {
  GalSettings s;

  /* (a) chiave 0 ASSENTE: la prima scrittura la crea (2 scritture), il manifest per ultimo */
  fresh(QUOTA_OK);
  CHECK(!shim_key_exists(GAL_KEY_SCHEMA));
  mk_settings(&s, 2);
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);

  /* (b) chiave 0 gia' = GAL_SCHEMA all'init: NESSUNA riscrittura (una ricerca in meno nel file) */
  CHECK(storage_init());
  shim_reset_write_count();
  mk_settings(&s, 5);
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 1);                     /* solo il manifest */
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  /* e nemmeno alla seconda/terza scrittura della stessa esecuzione */
  shim_reset_write_count();
  mk_settings(&s, 6);
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(storage_commit_slot(1, FMT_RAW6, 256u, 1u, 1u), STORAGE_OK);
  CHECK_EQ(shim_write_count(), 2);                     /* due manifest, zero chiavi 0 */

  /* (c) chiave 0 = 1 (schema vecchio senza manifest): la prima scrittura la porta a 2 */
  reset_all(QUOTA_OK);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 1), 4);
  CHECK(storage_init());
  CHECK(!shim_timer_pending());                        /* nessun manifest: niente da migrare */
  shim_reset_write_count();
  mk_settings(&s, 7);
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);

  /* (d) chiave 0 = 0 (valore "mai scritto" del firmware): come (c) */
  reset_all(QUOTA_OK);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 0), 4);
  CHECK(storage_init());
  shim_reset_write_count();
  mk_settings(&s, 8);
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
}

/* ---- 13. migrazione schema 1 -> 2 ---- */

static uint8_t g_v1[sizeof(GalManifestV1)];

/* Manifest V1 valido: nslots foto in slot 0..n-1, order[] in ordine INVERSO (non banale). */
static void build_v1(uint8_t nslots, uint16_t reserved, int corrupt) {
  GalManifestV1 v;
  memset(&v, 0, sizeof(v));
  v.magic = GAL_MAGIC;
  v.schema = 1;
  v.slot_count = GAL_MAX_SLOTS;
  memset(v.order, GAL_SLOT_NONE, sizeof(v.order));
  v.reserved = reserved;
  for (uint8_t k = 0; k < nslots; k++) {
    v.order[k] = (uint8_t)(nslots - 1u - k);
    v.slots[k].state = GAL_SLOT_VALID;
    v.slots[k].format = FMT_RAW6;
    v.slots[k].generation = (uint16_t)(k + 1u);
    v.slots[k].length = PHOTO_LEN;
    v.slots[k].crc32 = 0x1000u + k;
    v.slots[k].photo_id = 100u + k;
  }
  v.crc16 = crc16_ccitt((const uint8_t *)&v, (uint32_t)sizeof(v) - 2u);
  if (corrupt) {
    v.crc16 = (uint16_t)(v.crc16 ^ 0x0001u);
  }
  memcpy(g_v1, &v, sizeof(g_v1));
}

/* Chiave 10 dello schema 1 (schema e CRC coerenti, salvo corrupt). */
static void write_legacy_settings(const GalSettings *s, int corrupt) {
  GalSettings t = *s;
  t.schema = GAL_SETTINGS_SCHEMA;
  t.crc16 = crc16_ccitt((const uint8_t *)&t, (uint32_t)sizeof(t) - 2u);
  if (corrupt) {
    t.crc16 = (uint16_t)(t.crc16 ^ 0x0001u);
  }
  CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, &t, sizeof(t)), (int)sizeof(t));
}

/* Chiave 2 dello schema 1. */
static void write_legacy_rotstate(uint16_t off, int corrupt) {
  GalRotState r;
  r.shake_offset = off;
  r.crc16 = crc16_ccitt((const uint8_t *)&r, 2u);
  if (corrupt) {
    r.crc16 = (uint16_t)(r.crc16 ^ 0x0100u);
  }
  CHECK_EQ(persist_write_data(GAL_KEY_ROTSTATE, &r, sizeof(r)), (int)sizeof(r));
}

/* Persist "schema 1": chiave 0 = 1, manifest V1 con nslots foto, chiavi 2/10 su richiesta. */
static void setup_v1(uint8_t nslots, int corrupt_v1) {
  reset_all(QUOTA_OK);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 1), 4);
  build_v1(nslots, 0, corrupt_v1);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, g_v1, sizeof(g_v1)), (int)sizeof(g_v1));
}

static void test_migrate_v1(void) {
  GalSettings old, out;
  GalRotState rs;

  /* (a) migrazione completa: V1 + chiave 10 valida + chiave 2 valida */
  setup_v1(3, 0);
  mk_settings(&old, 5);
  write_legacy_settings(&old, 0);
  write_legacy_rotstate(777, 0);
  shim_reset_write_count();
  const int del0 = shim_delete_count();
  CHECK(storage_init());
  /* l'init NON scrive: il record nuovo arriva dal timer di debounce (o dal flush di deinit) */
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(shim_delete_count(), del0);                 /* le chiavi 2/10 restano dove sono */
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifestV1));
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), 1);
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_timeout(), STORAGE_SETTINGS_DEBOUNCE_MS);
  CHECK_EQ(shim_timer_registrations(), 1);
  {
    const GalManifest *m = storage_manifest();
    CHECK_EQ(m->magic, GAL_MAGIC);
    CHECK_EQ(m->schema, GAL_SCHEMA);                   /* in RAM e' gia' schema 2 */
    CHECK_EQ(m->slot_count, GAL_MAX_SLOTS);
    CHECK_EQ(m->shake_offset, 777);
    CHECK_EQ(m->order[0], 2);
    CHECK_EQ(m->order[1], 1);
    CHECK_EQ(m->order[2], 0);
    CHECK_EQ(m->order[3], GAL_SLOT_NONE);
    CHECK_EQ(m->slots[0].generation, 1);
    CHECK_EQ(m->slots[2].generation, 3);
    CHECK_EQ(m->slots[2].photo_id, 102u);
    CHECK_EQ(m->slots[2].length, PHOTO_LEN);
    CHECK_EQ(m->slots[2].crc32, 0x1002u);
    CHECK_EQ(m->slots[3].state, GAL_SLOT_EMPTY);
  }
  CHECK_EQ(storage_valid_slots(), 3);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &old));              /* impostazioni dalla chiave 10 */
  CHECK_EQ(out.schema, GAL_SETTINGS_SCHEMA);
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 777);                      /* shake dalla chiave 2 */
  CHECK_EQ(shim_log_find("schema 1 -> 2 migrated"), 1);

  /* il timer materializza il record nuovo (234 B) e porta la chiave 0 a 2 */
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);

  /* rilettura: schema 2, nessuna nuova migrazione, impostazioni/shake/foto intatti */
  {
    GalManifest saved;
    memcpy(&saved, storage_manifest(), sizeof(saved));
    shim_reset_write_count();
    CHECK(storage_init());
    CHECK_EQ(shim_write_count(), 0);
    CHECK(!shim_timer_pending());                      /* niente da migrare: nessun timer */
    CHECK(memcmp(&saved, storage_manifest(), sizeof(saved)) == 0);
    CHECK_EQ(shim_log_find("schema 1 -> 2 migrated"), 1);   /* migrato UNA volta sola */
  }
  CHECK_EQ(storage_valid_slots(), 3);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &old));
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 777);

  /* (b) chiave 10 ASSENTE: impostazioni ai default, shake migrato */
  setup_v1(2, 0);
  write_legacy_rotstate(5, 0);
  CHECK(!shim_key_exists(GAL_KEY_SETTINGS));
  CHECK(storage_init());
  CHECK(shim_timer_pending());
  CHECK(storage_read_settings(&out));
  {
    GalSettings def;
    settings_set_defaults(&def);
    CHECK(settings_eq_payload(&out, &def));
  }
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 5);
  CHECK_EQ(storage_valid_slots(), 2);

  /* (c) chiave 10 con CRC ERRATO: default (mai impostazioni a caso) */
  setup_v1(2, 0);
  mk_settings(&old, 6);
  write_legacy_settings(&old, 1);
  write_legacy_rotstate(6, 0);
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  {
    GalSettings def;
    settings_set_defaults(&def);
    CHECK(settings_eq_payload(&out, &def));
    CHECK(!settings_eq_payload(&out, &old));
  }
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 6);                        /* lo shake si migra lo stesso */

  /* (c2) chiave 10 con CRC valido ma valori FUORI INTERVALLO: default */
  setup_v1(2, 0);
  mk_settings(&old, 6);
  old.interval_min = 7;                                /* non ammesso da settings_validate */
  write_legacy_settings(&old, 0);
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  {
    GalSettings def;
    settings_set_defaults(&def);
    CHECK(settings_eq_payload(&out, &def));
  }
  CHECK_EQ(out.interval_min, 30);

  /* (c3) chiave 10 di dimensione sbagliata: default */
  setup_v1(2, 0);
  mk_settings(&old, 6);
  {
    GalSettings t = old;
    t.schema = GAL_SETTINGS_SCHEMA;
    t.crc16 = crc16_ccitt((const uint8_t *)&t, (uint32_t)sizeof(t) - 2u);
    CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, &t, sizeof(t) - 1u), (int)sizeof(t) - 1);
  }
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  {
    GalSettings def;
    settings_set_defaults(&def);
    CHECK(settings_eq_payload(&out, &def));
  }

  /* (d) chiave 2 con CRC ERRATO / assente / troppo corta: shake 0, impostazioni migrate */
  setup_v1(2, 0);
  mk_settings(&old, 9);
  write_legacy_settings(&old, 0);
  write_legacy_rotstate(999, 1);
  CHECK(storage_init());
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 0);
  CHECK_EQ(storage_manifest()->shake_offset, 0);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &old));

  setup_v1(2, 0);
  CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));
  CHECK(storage_init());
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 0);

  setup_v1(2, 0);
  {
    GalRotState r;
    r.shake_offset = 321;
    r.crc16 = crc16_ccitt((const uint8_t *)&r, 2u);
    CHECK_EQ(persist_write_data(GAL_KEY_ROTSTATE, &r, sizeof(r) - 1u), (int)sizeof(r) - 1);
  }
  CHECK(storage_init());
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 0);

  /* (e) V1 con CRC ERRATO: nessuna migrazione, manifest di default, nessun timer, nessuna
   *     scrittura e nessun record (le foto della versione precedente vanno perse, come per un
   *     manifest schema 2 corrotto) */
  setup_v1(4, 1);
  mk_settings(&old, 11);
  write_legacy_settings(&old, 0);
  write_legacy_rotstate(42, 0);
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK_EQ(shim_write_count(), 0);
  CHECK(!shim_timer_pending());
  CHECK(manifest_is_default(storage_manifest()));
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK(!storage_read_settings(&out));                 /* nessun record caricato */
  CHECK(!storage_read_rotstate(&rs));
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifestV1));   /* non toccato */

  /* (e2) V1 con magic sbagliato / slot_count sbagliato / schema != 1 nei 214 B */
  {
    const size_t off_magic = offsetof(GalManifestV1, magic);
    const size_t off_schema = offsetof(GalManifestV1, schema);
    const size_t off_slots = offsetof(GalManifestV1, slot_count);
    const size_t fields[3] = { off_magic, off_schema, off_slots };
    for (size_t i = 0; i < 3; i++) {
      setup_v1(3, 0);
      g_v1[fields[i]] = (uint8_t)(g_v1[fields[i]] ^ 0x55u);
      {
        const uint16_t c = crc16_ccitt(g_v1, (uint32_t)sizeof(g_v1) - 2u);
        memcpy(g_v1 + sizeof(g_v1) - 2u, &c, sizeof(c));   /* CRC ricalcolato: solo il campo conta */
      }
      CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, g_v1, sizeof(g_v1)), (int)sizeof(g_v1));
      CHECK(storage_init());
      CHECK(manifest_is_default(storage_manifest()));
      CHECK(!shim_timer_pending());
    }
  }

  /* (f) migrazione materializzata dal FLUSH di deinit invece che dal timer */
  setup_v1(2, 0);
  mk_settings(&old, 13);
  write_legacy_settings(&old, 0);
  write_legacy_rotstate(64, 0);
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK(shim_timer_pending());
  const int can0 = shim_timer_cancels();
  storage_flush();                                     /* impostazioni pendenti: scrive */
  CHECK_EQ(shim_timer_cancels(), can0 + 1);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), 2);                     /* chiave 0 (era 1) + manifest */
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  storage_flush();                                     /* idempotente */
  CHECK_EQ(shim_write_count(), 2);
  /* riavvio: tutto al suo posto e nessuna migrazione */
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK_EQ(shim_write_count(), 0);
  CHECK(!shim_timer_pending());
  CHECK_EQ(storage_valid_slots(), 2);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &old));
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 64);
  CHECK_EQ(storage_manifest()->order[0], 1);
  CHECK_EQ(storage_manifest()->order[1], 0);

  /* (g) migrazione con album DISABILITATO (quota < 1 MiB): il record si scrive lo stesso */
  reset_all(GAL_MIN_QUOTA - 1u);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 1), 4);
  build_v1(2, 0, 0);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, g_v1, sizeof(g_v1)), (int)sizeof(g_v1));
  mk_settings(&old, 3);
  write_legacy_settings(&old, 0);
  write_legacy_rotstate(11, 0);
  shim_reset_write_count();
  CHECK(!storage_init());
  CHECK(shim_timer_pending());
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &old));
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 11);

  /* (h) migrazione con la scrittura che fallisce: dirty mantenuti e ritentati */
  setup_v1(2, 0);
  mk_settings(&old, 2);
  write_legacy_settings(&old, 0);
  write_legacy_rotstate(88, 0);
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK(shim_timer_pending());
  shim_fail_writes_after(0);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifestV1));   /* ancora il V1 */
  shim_fail_writes_after(-1);
  storage_flush();                                     /* il flush ritenta (settings dirty) */
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &old));
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 88);
}

/* ---- 14. settings_apply: impostazioni identiche = nessuna scrittura ---- */

static void test_settings_apply(void) {
  fresh(QUOTA_OK);
  settings_init();                                     /* nessun record: default in RAM */
  CHECK_EQ(shim_timer_registrations(), 0);
  CHECK_EQ(shim_write_count(), 0);

  /* identiche (crc16 escluso dal confronto): nessun timer, nessuna scrittura */
  GalSettings same = *settings_get();
  CHECK(settings_apply(&same));
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), 0);
  CHECK_EQ(shim_write_count(), 0);
  same.crc16 = (uint16_t)(same.crc16 ^ 0xFFFFu);
  CHECK(settings_apply(&same));
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), 0);

  /* non valide: rifiutate, nessun timer e nessuna scrittura */
  GalSettings bad = *settings_get();
  bad.interval_min = 7;
  CHECK(!settings_apply(&bad));
  bad = *settings_get();
  bad.schema = GAL_SETTINGS_SCHEMA + 1;
  CHECK(!settings_apply(&bad));
  CHECK(!settings_apply(NULL));
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), 0);

  /* un campo diverso: debounce e UNA scrittura */
  GalSettings other = *settings_get();
  other.interval_min = (uint16_t)(other.interval_min == 30u ? 60u : 30u);
  CHECK(settings_apply(&other));
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), 1);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);                     /* chiave 0 + manifest */
  GalSettings out;
  CHECK(storage_read_settings(&out));
  CHECK_EQ(out.interval_min, other.interval_min);
  CHECK(settings_eq_payload(&out, settings_get()));

  /* riapplicare le stesse: ancora nessuna scrittura (nessun record morto in flash) */
  const int w = shim_write_count();
  CHECK(settings_apply(&other));
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), w);
  /* ...anche dopo un riavvio che le rilegge da persist */
  CHECK(storage_init());
  settings_init();
  CHECK_EQ(settings_get()->interval_min, other.interval_min);
  CHECK(settings_apply(&other));
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), w);
}


/* ---- 15. ricerche persist (F10, revisione v1.9): il contratto centrale di S8-perf ----
 * Sul PT2 ogni ricerca di chiave e' una scansione lineare del file (~0,4 s con 12 foto) e una
 * chiave assente costa una scansione intera a vuoto: lo shim conta le ricerche (chiave diversa
 * dall'ultima toccata) e quelle a vuoto. */

static void test_lookups(void) {
  GalSettings s, out, same;
  GalRotState rs;
  static uint8_t data[GAL_CHUNK_BYTES];
  static uint8_t rd[GAL_CHUNK_BYTES];
  memset(data, 0x3C, sizeof(data));

  /* (a) file vuoto: 2 ricerche (chiave 0, chiave 1), entrambe a vuoto, nessuna scrittura */
  reset_all(QUOTA_OK);
  CHECK_EQ(shim_lookup_count(), 0);
  CHECK(storage_init());
  CHECK_EQ(shim_lookup_count(), 2);
  CHECK_EQ(shim_lookup_missing(), 2);
  CHECK_EQ(shim_write_count(), 0);
  /* la prima scrittura (timer) crea chiave 0 e record: 2 ricerche nuove, entrambe a vuoto (una
   * chiave NUOVA costa una scansione: "riempire l'album e' cubico nelle foto") */
  shim_lookup_reset();
  mk_settings(&s, 2);
  storage_settings_changed(&s);
  CHECK_EQ(shim_lookup_count(), 0);                    /* solo il timer: nessun accesso al file */
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(shim_lookup_count(), 2);
  CHECK_EQ(shim_lookup_missing(), 2);
  /* la seconda scrittura della stessa esecuzione, dopo che il tick ha toccato un chunk: UNA
   * ricerca (chiave 1), nessuna a vuoto (sulla stessa chiave dell'ultima scrittura il firmware
   * riprenderebbe dal record: qui in mezzo c'e' un'altra chiave, come sull'orologio) */
  mk_settings(&s, 3);
  storage_settings_changed(&s);
  CHECK(storage_read_chunk(0, 0, rd, sizeof(rd)) < 0);   /* il tick: un'altra chiave (a vuoto) */
  shim_lookup_reset();
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 3);
  CHECK_EQ(shim_lookup_count(), 1);
  CHECK_EQ(shim_lookup_missing(), 0);

  /* (b) schema 2 con una foto: init = 2 ricerche (chiave 0 + manifest), 0 a vuoto; get_size e
   *     read_data riprendono dal record trovato */
  build_valid_state();
  shim_lookup_reset();
  CHECK(storage_init());
  CHECK_EQ(shim_lookup_count(), 2);
  CHECK_EQ(shim_lookup_missing(), 0);
  /* letture dalla RAM: mai una ricerca */
  shim_lookup_reset();
  CHECK(storage_read_settings(&out));
  CHECK(storage_read_rotstate(&rs));
  (void)storage_manifest();
  (void)storage_valid_slots();
  (void)storage_open_ms();
  CHECK_EQ(shim_lookup_count(), 0);

  /* (c) impostazioni IDENTICHE (settings_apply) e storage_settings_changed: 0 ricerche; il timer
   *     scrive il record con UNA ricerca (chiave 1: la chiave 0 e' gia' verificata in init) */
  settings_init();
  shim_lookup_reset();
  same = *settings_get();
  CHECK(settings_apply(&same));
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_lookup_count(), 0);
  mk_settings(&s, 4);
  storage_settings_changed(&s);
  CHECK_EQ(shim_lookup_count(), 0);
  CHECK_EQ(storage_read_chunk(3, 0, rd, sizeof(rd)), GAL_CHUNK_BYTES);   /* un tick in mezzo */
  shim_lookup_reset();
  {
    const int w = shim_write_count();
    CHECK(shim_timer_fire());
    CHECK_EQ(shim_write_count(), w + 1);
  }
  CHECK_EQ(shim_lookup_count(), 1);                    /* solo la chiave 1: la 0 non viene ricercata */
  CHECK_EQ(shim_lookup_missing(), 0);
  storage_settings_changed(&s);                        /* stessa copia: 0 ricerche finche' il timer non scatta */
  CHECK_EQ(shim_lookup_count(), 1);
  CHECK_EQ(storage_read_chunk(3, 1, rd, sizeof(rd)), GAL_CHUNK_BYTES);
  shim_lookup_reset();
  storage_flush();                                     /* impostazioni "pendenti" identiche: 1 ricerca (storage non confronta) */
  CHECK_EQ(shim_lookup_count(), 1);

  /* (d) set_order identico, clear_slot su EMPTY, flush senza dirty: 0 ricerche e 0 scritture */
  shim_lookup_reset();
  {
    const int w = shim_write_count();
    uint8_t ord[GAL_MAX_SLOTS];
    memcpy(ord, storage_manifest()->order, sizeof(ord));
    CHECK_EQ(storage_set_order(ord), STORAGE_OK);
    CHECK_EQ(storage_clear_slot(0), STORAGE_OK);      /* mai usato */
    CHECK_EQ(storage_clear_slot(11), STORAGE_OK);
    storage_flush();
    storage_flush();
    CHECK_EQ(shim_write_count(), w);
  }
  CHECK_EQ(shim_lookup_count(), 0);
  CHECK(!shim_timer_pending());

  /* (e) chunk: storage_read_chunk = una ricerca per chunk SENZA persist_exists (un chunk assente
   *     e' una ricerca a vuoto, non due); storage_write_chunk su chiave nuova = una ricerca a vuoto,
   *     su chiave esistente (foto sostituita) = una ricerca piena */
  shim_lookup_reset();
  CHECK_EQ(storage_read_chunk(3, 0, rd, sizeof(rd)), GAL_CHUNK_BYTES);
  CHECK_EQ(shim_persist_calls(), 1);       /* ESATTAMENTE una persist_*: niente exists/get_size prima del read */
  CHECK_EQ(storage_read_chunk(3, 1, rd, sizeof(rd)), GAL_CHUNK_BYTES);
  CHECK_EQ(storage_read_chunk(3, 2, rd, sizeof(rd)), GAL_CHUNK_BYTES);
  CHECK_EQ(shim_lookup_count(), 3);
  CHECK_EQ(shim_persist_calls(), 3);
  CHECK_EQ(shim_lookup_missing(), 0);
  CHECK(storage_read_chunk(3, PHOTO_CHUNKS, rd, sizeof(rd)) < 0);
  CHECK_EQ(shim_lookup_count(), 4);
  CHECK_EQ(shim_persist_calls(), 4);       /* chunk assente: una sola chiamata (E_DOES_NOT_EXIST), non exists+read */
  CHECK_EQ(shim_lookup_missing(), 1);
  CHECK(storage_read_chunk(GAL_MAX_SLOTS, 0, rd, sizeof(rd)) < 0);   /* argomenti invalidi: nessuna ricerca */
  CHECK_EQ(shim_lookup_count(), 4);
  shim_lookup_reset();
  CHECK_EQ(storage_write_chunk(4, 0, data, GAL_CHUNK_BYTES), STORAGE_OK);
  CHECK_EQ(storage_write_chunk(4, 1, data, 100), STORAGE_OK);
  CHECK_EQ(shim_lookup_count(), 2);
  CHECK_EQ(shim_lookup_missing(), 2);
  CHECK_EQ(storage_write_chunk(3, 0, data, GAL_CHUNK_BYTES), STORAGE_OK);   /* sostituzione */
  CHECK_EQ(shim_lookup_count(), 3);
  CHECK_EQ(shim_lookup_missing(), 2);
  CHECK_EQ(storage_write_chunk(3, 0, NULL, 8), STORAGE_ERR);               /* invalido: niente */
  CHECK_EQ(shim_lookup_count(), 3);
  /* commit: una sola ricerca (manifest esistente), chiave 0 mai ricercata */
  shim_lookup_reset();
  CHECK_EQ(storage_commit_slot(4, FMT_RAW6, 356u, 0x44u, 44u), STORAGE_OK);
  CHECK_EQ(shim_lookup_count(), 1);
  CHECK_EQ(shim_lookup_missing(), 0);

  /* (f) migrazione: 4 ricerche (0, 1, 10, 2), nessuna a vuoto se le chiavi legacy esistono; il
   *     timer poi scrive con 2 ricerche (chiave 0 da 1 a 2 + record) */
  setup_v1(3, 0);
  mk_settings(&s, 5);
  write_legacy_settings(&s, 0);
  write_legacy_rotstate(777, 0);
  shim_lookup_reset();
  CHECK(storage_init());
  CHECK_EQ(shim_lookup_count(), 4);
  CHECK_EQ(shim_lookup_missing(), 0);
  CHECK(shim_timer_pending());
  shim_lookup_reset();
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_lookup_count(), 2);
  CHECK_EQ(shim_lookup_missing(), 0);
  /* riavvio dopo la migrazione: di nuovo 2 ricerche, le chiavi 2/10 non vengono piu' lette */
  shim_lookup_reset();
  CHECK(storage_init());
  CHECK_EQ(shim_lookup_count(), 2);
  CHECK_EQ(shim_lookup_missing(), 0);
  CHECK(!shim_timer_pending());
  /* chiave 10 assente: 4 ricerche, 1 a vuoto; chiavi 10 e 2 assenti: 4 ricerche, 2 a vuoto */
  setup_v1(2, 0);
  write_legacy_rotstate(5, 0);
  shim_lookup_reset();
  CHECK(storage_init());
  CHECK_EQ(shim_lookup_count(), 4);
  CHECK_EQ(shim_lookup_missing(), 1);
  setup_v1(2, 0);
  shim_lookup_reset();
  CHECK(storage_init());
  CHECK_EQ(shim_lookup_count(), 4);
  CHECK_EQ(shim_lookup_missing(), 2);
  /* V1 corrotto: 2 ricerche (0, 1), le chiavi legacy non vengono nemmeno cercate */
  setup_v1(2, 1);
  write_legacy_settings(&s, 0);
  shim_lookup_reset();
  CHECK(storage_init());
  CHECK_EQ(shim_lookup_count(), 2);
  CHECK_EQ(shim_lookup_missing(), 0);

  /* (g) schema futuro: la ricerca delle chiavi da cancellare e' inevitabile (4 delete), poi il
   *     manifest a vuoto: nessuna ricerca in piu' oltre a quelle */
  build_valid_state();
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, GAL_SCHEMA + 1), 4);
  CHECK_EQ(storage_read_chunk(3, 0, rd, sizeof(rd)), GAL_CHUNK_BYTES);   /* ultima chiave toccata: un chunk */
  shim_lookup_reset();
  CHECK(storage_init());
  CHECK_EQ(shim_lookup_count(), 5);                    /* 0 (letta e cancellata), 1, 2, 10, poi 1 a vuoto */
  CHECK_EQ(shim_lookup_missing(), 3);                  /* 2 e 10 assenti, 1 appena cancellata */
}

/* ---- 16. impostazioni pendenti + commit/set_order/clear entro i 10 s: UN solo record (F05) ----
 * Ogni sync con impostazioni cambiate manda SETTINGS -> SYNC_REQUEST -> PHOTO_* (4-9 s a foto): il
 * commit cade quasi sempre dentro il debounce. prv_write_manifest_any azzera i dirty anche quando
 * la chiama commit/set_order/clear: il timer che scatta dopo NON deve riscrivere il manifest. */

static void test_pending_then_commit(void) {
  GalSettings s, s2, s3, s4, out;
  GalManifest rec;
  uint8_t ord[GAL_MAX_SLOTS];
  static uint8_t data[GAL_CHUNK_BYTES];
  memset(data, 0x42, sizeof(data));
  mk_settings(&s, 5);
  mk_settings(&s2, 6);
  mk_settings(&s3, 7);
  mk_settings(&s4, 8);

  /* (a) persist nuovo: SETTINGS (timer) -> chunk -> commit: chiave 0 + manifest = 2 scritture, il
   *     record porta gia' le impostazioni nuove, il manifest e' l'ultima chiave scritta */
  fresh(QUOTA_OK);
  storage_settings_changed(&s);
  CHECK(shim_timer_pending());
  CHECK_EQ(storage_write_chunk(0, 0, data, GAL_CHUNK_BYTES), STORAGE_OK);
  int w = shim_write_count();
  CHECK_EQ(storage_commit_slot(0, FMT_RAW6, GAL_CHUNK_BYTES, 0x1u, 0x10u), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 2);
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s));
  CHECK_EQ(rec.settings.schema, GAL_SETTINGS_SCHEMA);
  CHECK_EQ(rec.settings.crc16, crc16_ccitt((const uint8_t *)&rec.settings, (uint32_t)sizeof(GalSettings) - 2u));
  CHECK_EQ(rec.slots[0].state, GAL_SLOT_VALID);
  CHECK_EQ(rec.order[0], 0);
  CHECK(shim_timer_pending());                         /* il commit non cancella il timer... */
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), w + 2);                 /* ...ma il callback non scrive (dirty azzerati) */
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_timer_orphans(), 0);
  storage_flush();
  CHECK_EQ(shim_write_count(), w + 2);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);

  /* (b) idem con set_order: 1 scrittura (la chiave 0 c'e' gia'), impostazioni s2 nel record */
  storage_settings_changed(&s2);
  CHECK(shim_timer_pending());
  memset(ord, GAL_SLOT_NONE, sizeof(ord));
  ord[0] = 5;
  ord[1] = 0;
  w = shim_write_count();
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 1);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s2));
  CHECK_EQ(rec.order[0], 5);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), w + 1);
  CHECK(!shim_timer_pending());

  /* (c) idem con clear_slot */
  storage_settings_changed(&s3);
  w = shim_write_count();
  CHECK_EQ(storage_clear_slot(0), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 1);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s3));
  CHECK_EQ(rec.slots[0].state, GAL_SLOT_EMPTY);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), w + 1);
  CHECK(!shim_timer_pending());

  /* (d) shake pendente + commit: anche lo shake viaggia col manifest del commit */
  {
    const GalRotState st = { .shake_offset = 21, .crc16 = 0 };
    CHECK(storage_write_rotstate(&st));
    CHECK(shim_timer_pending());
    w = shim_write_count();
    CHECK_EQ(storage_commit_slot(0, FMT_RAW6, GAL_CHUNK_BYTES, 0x2u, 0x11u), STORAGE_OK);
    CHECK_EQ(shim_write_count(), w + 1);
    memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
    CHECK_EQ(rec.shake_offset, 21);
    CHECK_EQ(rec.slots[0].generation, 2);
    CHECK(shim_timer_fire());
    CHECK_EQ(shim_write_count(), w + 1);
  }

  /* (e) commit che FALLISCE: le impostazioni nuove restano in RAM e dirty, il timer e' intatto e
   *     alla scadenza le scrive SENZA lo slot fallito; il record in persist non e' stato toccato */
  storage_settings_changed(&s4);
  memcpy(g_ref, key_bytes(GAL_KEY_MANIFEST), sizeof(GalManifest));
  w = shim_write_count();
  shim_fail_writes_after(0);
  CHECK_EQ(storage_commit_slot(1, FMT_RAW6, GAL_CHUNK_BYTES, 0x3u, 0x12u), STORAGE_NO_SPACE);
  CHECK_EQ(shim_write_count(), w);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), g_ref, sizeof(GalManifest)) == 0);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s4));               /* RAM: impostazioni nuove conservate */
  CHECK_EQ(storage_manifest()->slots[1].state, GAL_SLOT_EMPTY);
  CHECK(shim_timer_pending());
  shim_fail_writes_after(-1);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), w + 1);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s4));
  CHECK_EQ(rec.slots[1].state, GAL_SLOT_EMPTY);
  CHECK_EQ(rec.slots[0].state, GAL_SLOT_VALID);
  CHECK(!shim_timer_pending());
  storage_flush();
  CHECK_EQ(shim_write_count(), w + 1);                 /* non piu' dirty */
  CHECK_EQ(shim_timer_orphans(), 0);

  /* (f) riavvio: tutto coerente e nessun timer */
  CHECK(storage_init());
  CHECK(!shim_timer_pending());
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s4));
  CHECK_EQ(storage_manifest()->shake_offset, 21);
  CHECK_EQ(storage_valid_slots(), 1);
}

/* ---- 17. ritentativi del timer (F12): 1 + STORAGE_WRITE_RETRIES scatti, poi silenzio ----
 * STORAGE_WRITE_RETRIES vive in storage.c (non esportata): il pin qui sotto la fissa a 3. Una
 * regressione (<= invece di <, contatore non azzerato, timer non ri-registrato) cambia il numero di
 * scatti/registrazioni. */

#define WRITE_RETRIES 3

/* Fa scattare il timer finche' e' pendente (con una guardia): ritorna il numero di scatti. */
static int fire_until_idle(void) {
  int n = 0;
  while (shim_timer_pending() && n < 16) {
    CHECK(shim_timer_fire());
    n++;
  }
  return n;
}

static void test_timer_retries(void) {
  GalSettings s, s2, out;
  GalManifest rec;
  GalRotState st = { .shake_offset = 3, .crc16 = 0 };
  mk_settings(&s, 11);
  mk_settings(&s2, 12);
  build_valid_state();
  memcpy(g_ref, key_bytes(GAL_KEY_MANIFEST), sizeof(GalManifest));
  CHECK_EQ(shim_timer_registrations(), 0);             /* contatori puliti da fresh() */
  CHECK_EQ(shim_timer_cancels(), 0);

  /* (a) scritture SEMPRE fallite: scatto originale + 3 ritentativi a 10 s, 4 registrazioni, nessun
   *     orfano, 4 ERROR, poi nessun timer; RAM conserva la copia pendente, persist il record vecchio */
  storage_settings_changed(&s);
  const int w0 = shim_write_count();
  shim_fail_writes_after(0);
  shim_log_reset();
  CHECK(shim_timer_fire());                            /* scatto 1: fallisce, ritentativo programmato */
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_timeout(), STORAGE_SETTINGS_DEBOUNCE_MS);
  CHECK_EQ(shim_timer_registrations(), 2);
  CHECK_EQ(fire_until_idle(), WRITE_RETRIES);          /* scatti 2..4 */
  CHECK_EQ(shim_timer_registrations(), 1 + WRITE_RETRIES);
  CHECK_EQ(shim_timer_orphans(), 0);
  CHECK_EQ(shim_timer_cancels(), 0);
  CHECK_EQ(shim_log_errors(), 1 + WRITE_RETRIES);
  CHECK_EQ(shim_log_find("storage: write key 1"), 1 + WRITE_RETRIES);
  CHECK(!shim_timer_pending());
  CHECK(!shim_timer_fire());                           /* niente in coda */
  CHECK_EQ(shim_write_count(), w0);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), g_ref, sizeof(GalManifest)) == 0);

  /* (b) evento nuovo (uno shake basta) azzera il contatore: altri 1 + 3 scatti */
  CHECK(storage_write_rotstate(&st));
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), 2 + WRITE_RETRIES);
  CHECK_EQ(fire_until_idle(), 1 + WRITE_RETRIES);
  CHECK_EQ(shim_timer_registrations(), 2 * (1 + WRITE_RETRIES));
  CHECK_EQ(shim_log_errors(), 2 * (1 + WRITE_RETRIES));
  CHECK_EQ(shim_write_count(), w0);
  CHECK_EQ(shim_timer_orphans(), 0);
  CHECK(!shim_timer_pending());

  /* (c) la scrittura torna possibile: UNA scrittura con impostazioni + shake accumulati */
  shim_fail_writes_after(-1);
  storage_settings_changed(&s2);
  CHECK_EQ(fire_until_idle(), 1);
  CHECK_EQ(shim_write_count(), w0 + 1);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s2));
  CHECK_EQ(rec.shake_offset, 3);
  CHECK_EQ(rec.slots[3].state, GAL_SLOT_VALID);

  /* (d) ritentativi esauriti, poi il flush di deinit: le impostazioni pendenti si scrivono */
  mk_settings(&s, 13);
  storage_settings_changed(&s);
  shim_fail_writes_after(0);
  CHECK_EQ(fire_until_idle(), 1 + WRITE_RETRIES);
  shim_fail_writes_after(-1);
  storage_flush();
  CHECK_EQ(shim_write_count(), w0 + 2);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));

  /* (e) ritentativi esauriti con SOLO lo shake pendente: il flush non scrive (D19) */
  st.shake_offset = 5;
  CHECK(storage_write_rotstate(&st));
  shim_fail_writes_after(0);
  CHECK_EQ(fire_until_idle(), 1 + WRITE_RETRIES);
  shim_fail_writes_after(-1);
  storage_flush();
  CHECK_EQ(shim_write_count(), w0 + 2);

  /* (f) app_timer_register NULL DENTRO un ritentativo: catena interrotta (a differenza della prima
   *     programmazione, che scrive subito), nessuna scrittura finche' non arriva il flush */
  mk_settings(&s2, 14);
  storage_settings_changed(&s2);
  CHECK(shim_timer_pending());
  const int reg = shim_timer_registrations();
  shim_fail_writes_after(0);
  shim_fail_timer_register(true);
  shim_log_reset();
  CHECK(shim_timer_fire());                            /* scrittura fallita, register del ritentativo -> NULL */
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), reg);
  CHECK_EQ(shim_log_errors(), 1);
  CHECK_EQ(shim_write_count(), w0 + 2);
  shim_fail_writes_after(-1);                          /* anche con la scrittura tornata possibile... */
  CHECK(!shim_timer_fire());                           /* ...nessuno riprova da solo */
  CHECK_EQ(shim_write_count(), w0 + 2);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s2));               /* RAM */
  storage_flush();                                     /* il flush di deinit recupera */
  CHECK_EQ(shim_write_count(), w0 + 3);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s2));
  shim_fail_timer_register(false);
  CHECK_EQ(shim_timer_orphans(), 0);
}

/* ---- 18. rami minori di storage_init (F34) e open_ms con l'orologio finto (F48) ---- */

static void test_init_edges(void) {
  GalSettings s, out, def;
  GalRotState rs;
  settings_set_defaults(&def);
  mk_settings(&s, 5);

  /* (1) storage_init con il timer pendente (solo test host: init ripetuto): cancel, dirty azzerati
   *     senza scrivere; le impostazioni pendenti si perdono (vince il record riletto) */
  build_valid_state();
  storage_settings_changed(&s);
  CHECK(shim_timer_pending());
  const int can = shim_timer_cancels();
  const int w = shim_write_count();
  CHECK(storage_init());
  CHECK_EQ(shim_timer_cancels(), can + 1);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), w);
  CHECK(storage_read_settings(&out));
  CHECK(!settings_eq_payload(&out, &s));               /* riletto dal record: le pendenti sono perse */
  storage_flush();
  CHECK_EQ(shim_write_count(), w);                     /* dirty azzerati: il flush non scrive */
  CHECK(!shim_timer_fire());
  CHECK_EQ(shim_timer_orphans(), 0);

  /* (2) chiave 0 assente e persist_write_int che fallisce con un errore GENERICO: STORAGE_ERR
   *     (ritentabile per il telefono), non NO_SPACE; chiave 0 e manifest assenti, RAM ripristinata */
  fresh(QUOTA_OK);
  {
    const status_t codes[3] = { E_ERROR, E_INTERNAL, E_INVALID_OPERATION };
    for (size_t i = 0; i < 3; i++) {
      shim_fail_writes_after(0);
      shim_fail_writes_code(codes[i]);
      shim_log_reset();
      CHECK_EQ(storage_commit_slot(0, FMT_RAW6, 256u, 1u, 1u), STORAGE_ERR);
      CHECK(!shim_key_exists(GAL_KEY_SCHEMA));
      CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
      CHECK_EQ(storage_manifest()->slots[0].state, GAL_SLOT_EMPTY);
      CHECK_EQ(storage_valid_slots(), 0);
      CHECK_EQ(shim_log_find("storage: write schema"), 1);
      CHECK_EQ(shim_log_errors(), 1);
    }
    shim_fail_writes_code(E_OUT_OF_STORAGE);
    CHECK_EQ(storage_commit_slot(0, FMT_RAW6, 256u, 1u, 1u), STORAGE_NO_SPACE);
    shim_fail_writes_after(-1);
    /* finita l'emergenza la chiave 0 viene scritta (il fallimento non ha alzato s_schema_ok) */
    CHECK_EQ(storage_commit_slot(0, FMT_RAW6, 256u, 1u, 1u), STORAGE_OK);
    CHECK_EQ(shim_write_count(), 2);
    CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  }

  /* (3) migrazione con chiave 10 di SCHEMA diverso (CRC valido): default, shake migrato lo stesso */
  {
    const uint8_t schemas[2] = { GAL_SETTINGS_SCHEMA + 1, 0 };
    for (size_t i = 0; i < 2; i++) {
      setup_v1(2, 0);
      GalSettings t = s;
      t.schema = schemas[i];
      t.crc16 = crc16_ccitt((const uint8_t *)&t, (uint32_t)sizeof(t) - 2u);
      CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, &t, sizeof(t)), (int)sizeof(t));
      write_legacy_rotstate(7, 0);
      shim_log_reset();
      CHECK(storage_init());
      CHECK(shim_timer_pending());
      CHECK(storage_read_settings(&out));
      CHECK(settings_eq_payload(&out, &def));
      CHECK(!settings_eq_payload(&out, &s));
      CHECK(storage_read_rotstate(&rs));
      CHECK_EQ(rs.shake_offset, 7);
      CHECK_EQ(shim_log_find("migrated (settings 0 shake 7)"), 1);
    }
  }

  /* (4) open_ms = ms fra le due letture di time_ms in storage_init, con clamp [0, 65535] (F48):
   *     l'orologio finto avanza di `step` ms dopo ogni lettura */
  reset_all(QUOTA_OK);
  shim_set_time_ms(100, 900);
  shim_set_time_step_ms(1300);                         /* 1 s + 300 ms, a cavallo del secondo */
  CHECK(storage_init());
  CHECK_EQ(storage_open_ms(), 1300);
#ifndef GALLERIA_DEBUG_TIMING
  CHECK_EQ(shim_time_ms_calls(), 2);                   /* due letture per storage_init (regola 11) */
  CHECK_EQ(storage_debug_ms(0), 0);                    /* build P: sempre 0 */
  CHECK_EQ(storage_debug_ms(1), 0);
#else
  CHECK_EQ(shim_time_ms_calls(), 4);                   /* + TMR(t_man) e TMR_MS */
  CHECK_EQ(storage_debug_ms(0), 1300);
#endif
  shim_set_time_step_ms(70000);                        /* 70 s: clamp */
  CHECK(storage_init());
  CHECK_EQ(storage_open_ms(), 65535);
  shim_set_time_step_ms(65536);
  CHECK(storage_init());
  CHECK_EQ(storage_open_ms(), 65535);
  shim_set_time_step_ms(65535);                        /* esattamente il massimo */
  CHECK(storage_init());
  CHECK_EQ(storage_open_ms(), 65535);
  shim_set_time_step_ms(-500);                         /* orologio che salta indietro: mai negativo */
  CHECK(storage_init());
  CHECK_EQ(storage_open_ms(), 0);
  shim_set_time_step_ms(0);                            /* orologio fermo */
  CHECK(storage_init());
  CHECK_EQ(storage_open_ms(), 0);
  shim_set_time_ms(5, 999);
  shim_set_time_step_ms(1);
  CHECK(storage_init());
  CHECK_EQ(storage_open_ms(), 1);
  shim_set_time_ms(2000000000, 999);                   /* time_t grande: nessun overflow */
  shim_set_time_step_ms(1);
  CHECK(storage_init());
  CHECK_EQ(storage_open_ms(), 1);
  /* misurato anche con album disabilitato (HELLO con MAX_CHUNK 0: F49) e con schema futuro */
  shim_set_quota(QUOTA_BAD);
  shim_set_time_ms(7, 100);
  shim_set_time_step_ms(2150);                         /* il numero di campo del 04/09 (file gonfio) */
  CHECK(!storage_init());
  CHECK_EQ(storage_open_ms(), 2150);
  shim_set_quota(QUOTA_OK);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, GAL_SCHEMA + 1), 4);
  CHECK(storage_init());
  CHECK_EQ(storage_open_ms(), 2150);
  /* il valore misurato non dipende dal contenuto del file: stesso passo, file con record e chunk */
  build_valid_state();                                 /* reset_all rimette l'orologio reale */
  shim_set_time_ms(7, 100);
  shim_set_time_step_ms(2150);
  CHECK(storage_init());
  CHECK_EQ(storage_open_ms(), 2150);
  CHECK_EQ(storage_valid_slots(), 1);
  /* lo shim stesso: firma SDK (ritorna i ms), campione e avanzamento */
  {
    time_t ts = 0;
    uint16_t ms = 0;
    shim_set_time_ms(42, 1500);                        /* ms >= 1000 traboccano nei secondi */
    shim_set_time_step_ms(0);
    CHECK_EQ(time_ms(&ts, &ms), 500);
    CHECK_EQ(ms, 500);
    CHECK_EQ(ts, 43);
    shim_advance_time_ms(-600);
    CHECK_EQ(time_ms(&ts, &ms), 900);
    CHECK_EQ(ts, 42);
    CHECK_EQ(time_ms(NULL, NULL), 900);                /* argomenti NULL ammessi dall'SDK */
    shim_persist_reset();                              /* torna l'orologio reale: ms = 0 */
    CHECK_EQ(time_ms(&ts, &ms), 0);
    CHECK_EQ(ms, 0);
    CHECK(ts >= 1756000000);                           /* > 24/08/2026: ora reale */
  }
}


/* ---- 19. S10 (D31): GalSettings.lang al byte 13 (ex reserved[0]) ----
 * Contratti: offset 13, reserved[4] a seguire, CRC dei default INVARIATO (0x7EE7: lo stesso pin di
 * test_album.js, cosi' un orologio gia' sincronizzato non riceve una SETTINGS inutile), settings_validate
 * con lang <= 4 (reserved mai validati), round trip in persist, record con lang fuori intervallo ->
 * default, blob pre-S10 (byte 13 = 0) -> auto, gal_lang_from_locale (settings.h, pura). */

static void test_settings_lang(void) {
  fresh(QUOTA_OK);
  settings_init();                                     /* nessun record: default in RAM */
  GalSettings def;
  settings_set_defaults(&def);

  /* layout del blob sul filo e in persist */
  CHECK_EQ(offsetof(GalSettings, digit_style), 12);
  CHECK_EQ(offsetof(GalSettings, lang), 13);
  CHECK_EQ(offsetof(GalSettings, reserved), 14);
  CHECK_EQ(sizeof(def.reserved), 4);
  CHECK_EQ(offsetof(GalSettings, crc16), 18);
  CHECK_EQ(sizeof(GalSettings), 20);
  CHECK_EQ(GAL_LANG_AUTO, 0);
  CHECK_EQ(GAL_LANG_EN, 1);
  CHECK_EQ(GAL_LANG_IT, 2);
  CHECK_EQ(GAL_LANG_DE, 3);
  CHECK_EQ(GAL_LANG_FR, 4);

  /* default: auto, reserved a zero, CRC-16 dei 18 B = 0x7EE7 (pin condiviso con il PKJS) */
  CHECK_EQ(def.lang, GAL_LANG_AUTO);
  for (uint8_t i = 0; i < sizeof(def.reserved); i++) {
    CHECK_EQ(def.reserved[i], 0);
  }
  CHECK_EQ(crc16_ccitt((const uint8_t *)&def, (uint32_t)sizeof(GalSettings) - 2u), 0x7EE7);
  {
    uint8_t b[sizeof(GalSettings)];
    memcpy(b, &def, sizeof(b));
    CHECK_EQ(b[13], 0);
    CHECK_EQ(settings_get()->lang, GAL_LANG_AUTO);
    CHECK_EQ(crc16_ccitt((const uint8_t *)settings_get(), (uint32_t)sizeof(GalSettings) - 2u), 0x7EE7);
  }

  /* settings_validate: esattamente i valori 0..4 passano */
  {
    int ok = 0, bad = 0;
    for (unsigned l = 0; l < 256u; l++) {
      GalSettings s = def;
      s.lang = (uint8_t)l;
      if (settings_validate(&s)) { ok++; } else { bad++; }
    }
    CHECK_EQ(ok, 5);
    CHECK_EQ(bad, 251);
    GalSettings s = def;
    s.lang = GAL_LANG_FR;
    CHECK(settings_validate(&s));
    s.lang = (uint8_t)(GAL_LANG_FR + 1);
    CHECK(!settings_validate(&s));
    /* reserved[] NON validato: orologio nuovo + PKJS di uno schema futuro deve passare */
    s.lang = GAL_LANG_FR;
    memset(s.reserved, 0xEE, sizeof(s.reserved));
    CHECK(settings_validate(&s));
    /* lang e' dentro il confronto "identiche" di settings_apply e di settings_eq_payload */
    GalSettings a = def, b = def;
    b.lang = GAL_LANG_IT;
    CHECK(!settings_eq_payload(&a, &b));
  }

  /* settings_apply: lang 5 rifiutata senza timer ne' scritture, RAM intatta */
  {
    GalSettings bad5 = *settings_get();
    bad5.lang = 5;
    CHECK(!settings_apply(&bad5));
    CHECK(!shim_timer_pending());
    CHECK_EQ(shim_write_count(), 0);
    CHECK_EQ(settings_get()->lang, GAL_LANG_AUTO);
  }

  /* lang 3 (+ intervallo 60 per vedere che il resto viaggia insieme): debounce, UNA scrittura,
   * byte 13 del record = 3, CRC ricalcolato (!= 0x7EE7), rilettura e riavvio con la lingua salva */
  GalSettings de = *settings_get();
  de.lang = GAL_LANG_DE;
  de.interval_min = 60;
  CHECK(settings_apply(&de));
  CHECK_EQ(settings_get()->lang, GAL_LANG_DE);
  CHECK(shim_timer_pending());
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);                     /* chiave 0 + manifest */
  GalSettings out;
  CHECK(storage_read_settings(&out));
  CHECK_EQ(out.lang, GAL_LANG_DE);
  {
    const uint8_t *p = key_bytes(GAL_KEY_MANIFEST) + offsetof(GalManifest, settings);
    CHECK_EQ(p[13], GAL_LANG_DE);
    uint16_t pc = 0;
    memcpy(&pc, p + sizeof(GalSettings) - 2u, sizeof(pc));
    CHECK_EQ(pc, crc16_ccitt(p, (uint32_t)sizeof(GalSettings) - 2u));
    CHECK(pc != 0x7EE7);
  }
  CHECK(storage_init());
  settings_init();
  CHECK_EQ(settings_get()->lang, GAL_LANG_DE);
  CHECK_EQ(settings_get()->interval_min, 60);
  /* identiche: nessuna scrittura; solo lang diversa: e' un cambiamento */
  {
    const int w = shim_write_count();
    CHECK(settings_apply(&de));
    CHECK(!shim_timer_pending());
    CHECK_EQ(shim_write_count(), w);
    GalSettings fr = de;
    fr.lang = GAL_LANG_FR;
    CHECK(settings_apply(&fr));
    CHECK(shim_timer_pending());
    storage_flush();
    CHECK_EQ(shim_write_count(), w + 1);
    CHECK(storage_read_settings(&out));
    CHECK_EQ(out.lang, GAL_LANG_FR);
  }

  /* record in persist con lang 7 e CRC del manifest valido: record buono ma impostazioni ai default */
  uint8_t tmp[sizeof(GalManifest)];
  memcpy(tmp, key_bytes(GAL_KEY_MANIFEST), sizeof(tmp));
  tmp[offsetof(GalManifest, settings) + 13] = 7;
  manifest_fix_crc(tmp);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, tmp, sizeof(tmp)), (int)sizeof(tmp));
  CHECK(storage_init());
  settings_init();
  CHECK_EQ(settings_get()->lang, GAL_LANG_AUTO);
  CHECK_EQ(settings_get()->interval_min, def.interval_min);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &def));

  /* record scritto da un firmware pre-S10 (byte 13 = 0, era reserved[0]): lang auto, il resto vale */
  tmp[offsetof(GalManifest, settings) + 13] = 0;
  manifest_fix_crc(tmp);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, tmp, sizeof(tmp)), (int)sizeof(tmp));
  CHECK(storage_init());
  settings_init();
  CHECK_EQ(settings_get()->lang, GAL_LANG_AUTO);
  CHECK_EQ(settings_get()->interval_min, 60);

  /* gal_lang_from_locale (settings.h, D33): prefisso en/it/de/fr -> 1..4, tutto il resto -> EN, mai 0 */
  {
    static const struct { const char *loc; uint8_t lang; } T[] = {
      { "it_IT", GAL_LANG_IT }, { "it", GAL_LANG_IT }, { "ita", GAL_LANG_IT }, { "it-CH", GAL_LANG_IT },
      { "de_DE", GAL_LANG_DE }, { "de", GAL_LANG_DE }, { "de_AT", GAL_LANG_DE },
      { "fr_FR", GAL_LANG_FR }, { "fr", GAL_LANG_FR }, { "fr_CA", GAL_LANG_FR },
      { "en_US", GAL_LANG_EN }, { "en_GB", GAL_LANG_EN }, { "en", GAL_LANG_EN },
      { "es_ES", GAL_LANG_EN }, { "pt_BR", GAL_LANG_EN }, { "ru_RU", GAL_LANG_EN }, { "zh_CN", GAL_LANG_EN },
      { "nl_NL", GAL_LANG_EN }, { "i", GAL_LANG_EN }, { "d", GAL_LANG_EN }, { "f", GAL_LANG_EN },
      { "", GAL_LANG_EN }, { "i18n", GAL_LANG_EN }, { "dx", GAL_LANG_EN }, { "fi_FI", GAL_LANG_EN },
      { "IT_IT", GAL_LANG_EN },   /* maiuscole: non e' un locale che il firmware produce (comportamento pinnato) */
    };
    for (size_t i = 0; i < sizeof(T) / sizeof(T[0]); i++) {
      const uint8_t got = gal_lang_from_locale(T[i].loc);
      if (got != T[i].lang) {
        printf("  gal_lang_from_locale(\"%s\") = %u, atteso %u\n", T[i].loc, got, T[i].lang);
      }
      CHECK_EQ(got, T[i].lang);
      CHECK(got >= GAL_LANG_EN && got <= GAL_LANG_FR);
    }
    CHECK_EQ(gal_lang_from_locale(NULL), GAL_LANG_EN);
  }
  storage_flush();
}

int main(void) {
  shim_set_log(getenv("GALLERIA_TEST_VERBOSE") != NULL);
  test_sizes();
  test_init_empty();
  test_disabled_quota();
  test_photo_commit();
  test_manifest_corrupt();
  test_schema_reset();
  test_args();
  test_write_failures();
  test_settings();
  test_rotstate();
  test_clear_and_order();
  test_schema_key_writes();
  test_migrate_v1();
  test_settings_apply();
  test_lookups();
  test_pending_then_commit();
  test_timer_retries();
  test_init_edges();
  test_settings_lang();
  printf("storage: %d ok, %d falliti\n", g_ok, g_fail);
  return g_fail ? 1 : 0;
}

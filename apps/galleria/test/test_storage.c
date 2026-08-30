/* test_storage.c — test host ADVERSARIALE di storage.c (gcc + shim/pebble.h, nessun ARM/emulatore).
 * Esegue: make -C apps/galleria/test run-test_storage
 * GALLERIA_TEST_VERBOSE=1 nell'ambiente per vedere gli APP_LOG di storage.c.
 * Copre: init su persist vuoto, quota < 1 MiB (album disabilitato), scrittura+commit di una foto
 * raw6 (134 chunk), rilettura del manifest, manifest corrotto (CRC/dimensione/magic/schema),
 * schema futuro -> reset, E_OUT_OF_STORAGE su chunk/manifest (ripristino), argomenti invalidi,
 * debounce delle impostazioni (timer), rotstate, clear_slot/set_order e conteggio delle scritture. */
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

static void fresh(uint32_t quota) {
  shim_persist_reset();
  shim_set_quota(quota);
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
  if (m->magic != GAL_MAGIC || m->schema != GAL_SCHEMA || m->slot_count != GAL_MAX_SLOTS
      || m->reserved != 0 || !order_all_none(m)) {
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

static void mk_settings(GalSettings *s, uint8_t seed) {
  memset(s, 0, sizeof(*s));
  s->schema       = 99;                      /* deve essere FORZATO a GAL_SETTINGS_SCHEMA */
  s->layout       = (uint8_t)(seed % 2u);
  s->font         = (uint8_t)(seed % 4u);
  s->clock_mode   = (uint8_t)(seed % 3u);
  s->leading_zero = (uint8_t)((seed + 1u) % 3u);
  s->text_color   = (uint8_t)(seed % 5u);
  s->outline      = (uint8_t)((seed + 2u) % 3u);
  s->interval_min = (uint16_t)(5u * (seed + 1u));
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

static void test_sizes(void) {
  CHECK_EQ(sizeof(GalManifest), 214);
  CHECK_EQ(sizeof(GalSlotMeta), 16);
  CHECK_EQ(sizeof(GalRotState), 4);
  CHECK_EQ(sizeof(GalSettings), 20);
  CHECK(sizeof(GalManifest) <= GAL_CHUNK_BYTES);        /* una sola chiave persist */
  CHECK_EQ(offsetof(GalManifest, crc16), 212);
  CHECK_EQ(offsetof(GalManifest, order), 6);
  CHECK_EQ(offsetof(GalManifest, slots), 20);
  CHECK_EQ(GAL_KEY_CHUNK(0, 0), 1000u);
  CHECK_EQ(GAL_KEY_CHUNK(3, 133), 1000u + 3u * 256u + 133u);
  CHECK_EQ(GAL_KEY_CHUNK(11, 255), 1000u + 11u * 256u + 255u);
  CHECK_EQ(PHOTO_CHUNKS * GAL_CHUNK_BYTES - (GAL_CHUNK_BYTES - LAST_CHUNK_N), PHOTO_LEN);
  CHECK_EQ(STORAGE_SETTINGS_DEBOUNCE_MS, 10000);
}

/* ---- 2. init su persist vuoto ---- */

static void test_init_empty(void) {
  shim_persist_reset();
  shim_set_quota(QUOTA_OK);
  CHECK(storage_init() == true);
  CHECK(storage_album_enabled());
  CHECK_EQ(storage_quota(), QUOTA_OK);

  const GalManifest *m = storage_manifest();
  CHECK(m != NULL);
  CHECK_EQ(m->magic, GAL_MAGIC);
  CHECK_EQ(m->schema, GAL_SCHEMA);
  CHECK_EQ(m->slot_count, GAL_MAX_SLOTS);
  CHECK_EQ(m->reserved, 0);
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
  shim_persist_reset();
  shim_set_quota(QUOTA_BAD);
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

  /* rotstate: scritto comunque (crea anche la chiave schema) */
  GalRotState st;
  st.shake_offset = 5;
  st.crc16 = 0;
  CHECK(storage_write_rotstate(&st));
  CHECK_EQ(shim_key_len(GAL_KEY_ROTSTATE), (int)sizeof(GalRotState));
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  GalRotState back;
  CHECK(storage_read_rotstate(&back));
  CHECK_EQ(back.shake_offset, 5);

  /* impostazioni: debounce + scrittura comunque */
  GalSettings s, out;
  mk_settings(&s, 3);
  storage_settings_changed(&s);
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_timeout(), STORAGE_SETTINGS_DEBOUNCE_MS);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_key_len(GAL_KEY_SETTINGS), (int)sizeof(GalSettings));
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));
  CHECK_EQ(out.schema, GAL_SETTINGS_SCHEMA);

  /* nessun manifest e nessun chunk toccato */
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
  CHECK(!shim_key_exists(GAL_KEY_CHUNK(0, 0)));
  CHECK_EQ(shim_key_count(), 3);
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
           ((uint16_t)g_ref[212] | (uint16_t)((uint16_t)g_ref[213] << 8)));

  /* controllo: il riferimento viene accettato */
  CHECK(storage_init());
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK_EQ(storage_manifest()->slots[3].photo_id, 42u);

  /* CRC alterato (entrambi i byte) */
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  g_tmp[212] = (uint8_t)(g_tmp[212] ^ 0xFFu);
  expect_rejected(g_tmp, sizeof(GalManifest), "crc16 byte basso");
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  g_tmp[213] = (uint8_t)(g_tmp[213] ^ 0x01u);
  expect_rejected(g_tmp, sizeof(GalManifest), "crc16 byte alto");

  /* payload cambiato senza aggiornare il CRC */
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  g_tmp[offsetof(GalManifest, slots) + 8] ^= 0x20u;      /* dentro slots[0].crc32 */
  expect_rejected(g_tmp, sizeof(GalManifest), "payload alterato, crc16 vecchio");

  /* dimensione 213 e 215 */
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  expect_rejected(g_tmp, (uint16_t)(sizeof(GalManifest) - 1u), "213 byte");
  memcpy(g_tmp, g_ref, sizeof(GalManifest));
  g_tmp[sizeof(GalManifest)] = 0x00;
  expect_rejected(g_tmp, (uint16_t)(sizeof(GalManifest) + 1u), "215 byte");

  /* magic diverso, CRC ricalcolato (solo il magic lo rifiuta) */
  {
    GalManifest mm;
    memcpy(&mm, g_ref, sizeof(mm));
    mm.magic = 0x314C4148u;                              /* "GAL1" -> "HAL1" */
    memcpy(g_tmp, &mm, sizeof(mm));
    manifest_fix_crc(g_tmp);
    expect_rejected(g_tmp, sizeof(GalManifest), "magic diverso (crc valido)");

    memcpy(&mm, g_ref, sizeof(mm));
    mm.schema = 2;                                       /* schema futuro nel manifest */
    memcpy(g_tmp, &mm, sizeof(mm));
    manifest_fix_crc(g_tmp);
    expect_rejected(g_tmp, sizeof(GalManifest), "schema 2 (crc valido)");

    memcpy(&mm, g_ref, sizeof(mm));
    mm.slot_count = GAL_MAX_SLOTS - 1;
    memcpy(g_tmp, &mm, sizeof(mm));
    manifest_fix_crc(g_tmp);
    expect_rejected(g_tmp, sizeof(GalManifest), "slot_count 11 (crc valido)");
  }

  /* tutti zero e tutti 0xFF */
  memset(g_tmp, 0, sizeof(GalManifest));
  expect_rejected(g_tmp, sizeof(GalManifest), "214 byte a zero");
  memset(g_tmp, 0xFF, sizeof(GalManifest));
  expect_rejected(g_tmp, sizeof(GalManifest), "214 byte a 0xFF");
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
  const int32_t variants[] = { 2, 127, -1, -2147483647 - 1 };
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
    CHECK(shim_key_exists(GAL_KEY_SETTINGS));
    CHECK(shim_key_exists(GAL_KEY_ROTSTATE));
    CHECK(shim_key_exists(GAL_KEY_MANIFEST));
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

  /* rotstate sotto iniezione */
  GalRotState st;
  st.shake_offset = 2;
  st.crc16 = 0;
  CHECK(!storage_write_rotstate(&st));
  CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));

  shim_fail_writes_after(-1);
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

  /* alla scadenza viene scritta l'ULTIMA copia */
  CHECK(shim_timer_fire());
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), 2);                     /* schema + impostazioni */
  CHECK_EQ(shim_key_len(GAL_KEY_SETTINGS), (int)sizeof(GalSettings));
  {
    const uint8_t *p = key_bytes(GAL_KEY_SETTINGS);
    CHECK(shim_key_exists(GAL_KEY_SETTINGS));
    CHECK_EQ(p[0], GAL_SETTINGS_SCHEMA);               /* schema forzato */
    uint16_t pc = 0;
    memcpy(&pc, p + sizeof(GalSettings) - 2u, sizeof(pc));
    CHECK_EQ(pc, crc16_ccitt(p, (uint32_t)sizeof(GalSettings) - 2u));   /* CRC16 sui 18 B */
    CHECK(pc != 0xBEEF);
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

  /* persist invalido -> read false (default in RAM) */
  uint8_t saved[sizeof(GalSettings)];
  uint8_t tmp[sizeof(GalSettings)];
  memcpy(saved, key_bytes(GAL_KEY_SETTINGS), sizeof(saved));
  memcpy(tmp, saved, sizeof(tmp));
  tmp[5] = (uint8_t)(tmp[5] ^ 0xFFu);                  /* payload alterato: CRC non torna */
  CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, tmp, sizeof(tmp)), (int)sizeof(tmp));
  CHECK(!storage_read_settings(&out));
  memcpy(tmp, saved, sizeof(tmp));
  tmp[sizeof(tmp) - 1] = (uint8_t)(tmp[sizeof(tmp) - 1] ^ 0x80u);       /* CRC alterato */
  CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, tmp, sizeof(tmp)), (int)sizeof(tmp));
  CHECK(!storage_read_settings(&out));
  memcpy(tmp, saved, sizeof(tmp));
  tmp[0] = 2;                                          /* schema != 1, CRC ricalcolato */
  {
    const uint16_t c2 = crc16_ccitt(tmp, (uint32_t)sizeof(tmp) - 2u);
    memcpy(tmp + sizeof(tmp) - 2u, &c2, sizeof(c2));
  }
  CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, tmp, sizeof(tmp)), (int)sizeof(tmp));
  CHECK(!storage_read_settings(&out));
  CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, saved, sizeof(saved) - 1u),
           (int)sizeof(saved) - 1);                    /* dimensione sbagliata */
  CHECK(!storage_read_settings(&out));
  CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, saved, sizeof(saved)), (int)sizeof(saved));
  CHECK(storage_read_settings(&out));                  /* ripristinato */
  CHECK(settings_eq_payload(&out, &d));

  /* scrittura fallita alla scadenza del timer: le impostazioni pendenti restano dirty e il flush le
   * ritenta (BUG S4 trovato da questo test e corretto: s_settings_dirty veniva azzerato PRIMA della
   * scrittura e la copia pendente andava persa senza ritentativi). */
  GalSettings e;
  mk_settings(&e, 15);
  shim_fail_writes_after(0);
  storage_settings_changed(&e);
  CHECK(shim_timer_pending());
  CHECK(shim_timer_fire());
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &d));                /* in persist c'è ancora la copia vecchia */
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

/* ---- 10. stato rotazione ---- */

static void test_rotstate(void) {
  fresh(QUOTA_OK);
  GalRotState out;
  CHECK(!storage_read_rotstate(&out));
  CHECK(!storage_read_rotstate(NULL));
  CHECK(!storage_write_rotstate(NULL));
  CHECK_EQ(shim_write_count(), 0);

  GalRotState st;
  st.shake_offset = 27719;                             /* ROT_SHAKE_MOD − 1: 16 bit, little-endian */
  st.crc16 = 0x1234;                                   /* deve essere ricalcolato */
  CHECK(storage_write_rotstate(&st));
  CHECK_EQ(shim_write_count(), 2);                     /* schema + rotstate */
  CHECK_EQ(shim_key_len(GAL_KEY_ROTSTATE), (int)sizeof(GalRotState));
  uint8_t saved[sizeof(GalRotState)];
  memcpy(saved, key_bytes(GAL_KEY_ROTSTATE), sizeof(saved));
  CHECK_EQ(saved[0], 0x47);
  CHECK_EQ(saved[1], 0x6C);
  {
    uint16_t pc = 0;
    memcpy(&pc, saved + 2, sizeof(pc));
    CHECK_EQ(pc, crc16_ccitt(saved, 2));
    CHECK(pc != 0x1234);
  }
  CHECK(storage_read_rotstate(&out));
  CHECK_EQ(out.shake_offset, 27719);

  uint8_t bad[sizeof(GalRotState)];
  memcpy(bad, saved, sizeof(bad));
  bad[3] = (uint8_t)(bad[3] ^ 0x01u);                  /* CRC errato */
  CHECK_EQ(persist_write_data(GAL_KEY_ROTSTATE, bad, sizeof(bad)), (int)sizeof(bad));
  CHECK(!storage_read_rotstate(&out));
  memcpy(bad, saved, sizeof(bad));
  bad[1] = (uint8_t)(bad[1] ^ 0xFFu);                  /* payload alterato */
  CHECK_EQ(persist_write_data(GAL_KEY_ROTSTATE, bad, sizeof(bad)), (int)sizeof(bad));
  CHECK(!storage_read_rotstate(&out));
  CHECK_EQ(persist_write_data(GAL_KEY_ROTSTATE, saved, sizeof(saved) - 1u), 3);   /* 3 B */
  CHECK(!storage_read_rotstate(&out));
  CHECK_EQ(persist_write_data(GAL_KEY_ROTSTATE, saved, sizeof(saved)), (int)sizeof(saved));
  CHECK(storage_read_rotstate(&out));

  /* roundtrip su shake_offset a 16 bit (tutti i byte bassi + estremi) */
  int bad_rt = 0;
  for (int v = 0; v < 65536; v += (v < 256 ? 1 : 997)) {
    st.shake_offset = (uint16_t)v;
    if (!storage_write_rotstate(&st) || !storage_read_rotstate(&out) || out.shake_offset != (uint16_t)v) {
      bad_rt++;
    }
  }
  st.shake_offset = 65535;
  CHECK(storage_write_rotstate(&st) && storage_read_rotstate(&out) && out.shake_offset == 65535);
  CHECK_EQ(bad_rt, 0);
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
  CHECK_EQ(storage_clear_slot(3), STORAGE_OK);                  /* idempotente */
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
  memset(same, GAL_SLOT_NONE, sizeof(same));             /* = manifest di default in RAM */
  CHECK(memcmp(storage_manifest()->order, same, sizeof(same)) == 0);
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
  printf("storage: %d ok, %d falliti\n", g_ok, g_fail);
  return g_fail ? 1 : 0;
}

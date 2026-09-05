/* test_storage_adv.c — test host ADVERSARIALI aggiuntivi di storage.c (schema persist 2, revisione
 * S8-perf del 04/09/2026): migrazione interrotta a meta', album disabilitato, chiave 0 incoerente con
 * il record, reset dello schema seguito da una scrittura, ritentativi del timer, commit/set_order/
 * clear_slot intrecciati con le impostazioni pendenti, open_ms, chiavi legacy piu' lunghe del dovuto.
 * Non duplica test_storage.c: ne riusa lo stile (CHECK/CHECK_EQ) e gli helper minimi.
 *
 * Compilazione: make -C apps/galleria/test run-test_storage_adv (stessa ricetta di test_storage).
 * GALLERIA_TEST_VERBOSE=1 nell'ambiente per vedere gli APP_LOG di storage.c.
 *
 * Storia (rapporto T1, 05/09/2026): i finding B1 (album disabilitato → record scritto con slot e
 * ordine azzerati) e B2 (storage_clear_slot non idempotente) erano marcati come "bug attesi"; sono
 * stati corretti in storage.c (revisione 05/09) e qui sono CHECK normali. open_ms usa l'orologio
 * finto dello shim (shim_set_time_ms/shim_set_time_step_ms, F48): la variante --wrap=time_ms non
 * serve piu'. Con -DGALLERIA_DEBUG_TIMING=1 (build M) il file compila e passa lo stesso
 * (storage_debug_ms e le 4 letture di time_ms per init). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pebble.h>          /* shim host: test/shim/pebble.h (-Ishim davanti a -I../src/c) */
#include "storage.h"
#include "crc.h"

static int g_ok, g_fail;
#define CHECK(cond) do { if (cond) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_EQ(a, b) do { long long _a = (long long)(a), _b = (long long)(b); if (_a == _b) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s = %lld, atteso %s = %lld\n", __FILE__, __LINE__, #a, _a, #b, _b); } } while (0)

#define QUOTA_OK        (1024u * 1024u)
#define QUOTA_BAD       4096u
#define FMT_RAW6        1
#define SMALL_LEN       356u                 /* 256 + 100: foto "piccola" da 2 chunk (i test non decodificano) */

static uint8_t g_chunk[GAL_CHUNK_BYTES];
static uint8_t g_v1[sizeof(GalManifestV1)];
static uint8_t g_saved[sizeof(GalManifest)];
static uint8_t g_zero[GAL_CHUNK_BYTES];

/* ---- helper (stesse convenzioni di test_storage.c) ---- */

static void reset_all(uint32_t quota) {
  storage_flush();                          /* svuota lo stato static di storage.c prima del reset */
  shim_persist_reset();
  shim_set_quota(quota);
}

static void fresh(uint32_t quota) {
  reset_all(quota);
  (void)storage_init();
}

static const uint16_t GAL_INTERVALS[7] = { 0, 5, 15, 30, 60, 180, 1440 };

static void mk_settings(GalSettings *s, uint8_t seed) {
  memset(s, 0, sizeof(*s));
  s->schema       = 99;
  s->layout       = (uint8_t)(seed % 2u);
  s->font         = (uint8_t)(seed % 4u);
  s->clock_mode   = (uint8_t)(seed % 3u);
  s->leading_zero = (uint8_t)((seed + 1u) % 3u);
  s->text_color   = (uint8_t)(seed % 5u);
  s->outline      = (uint8_t)((seed + 2u) % 3u);
  s->interval_min = GAL_INTERVALS[seed % 7u];
  s->order        = (uint8_t)(seed & 1u);
  s->shake_next   = (uint8_t)((seed >> 1) & 1u);
  s->info_row     = (uint8_t)(seed & 0x0Fu);
  s->crc16        = 0xBEEF;
}

static int settings_eq_payload(const GalSettings *a, const GalSettings *b) {
  return memcmp((const uint8_t *)a + 1, (const uint8_t *)b + 1, sizeof(GalSettings) - 3u) == 0;
}

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

/* Foto "piccola": chunk 0 pieno + chunk 1 da 100 B (SMALL_LEN). */
static void put_photo(uint8_t slot, uint8_t fill) {
  memset(g_chunk, fill, sizeof(g_chunk));
  CHECK_EQ(storage_write_chunk(slot, 0, g_chunk, GAL_CHUNK_BYTES), STORAGE_OK);
  CHECK_EQ(storage_write_chunk(slot, 1, g_chunk, 100), STORAGE_OK);
}

/* Stato di riferimento: persist nuovo, foto in slot 3 committata (chiave 0 = 2 + manifest 234 B). */
static void build_valid_state(void) {
  fresh(QUOTA_OK);
  put_photo(3, 0x33);
  CHECK_EQ(storage_commit_slot(3, FMT_RAW6, SMALL_LEN, 0xABCD1234u, 42u), STORAGE_OK);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
}

static void build_v1(uint8_t nslots, int corrupt) {
  GalManifestV1 v;
  memset(&v, 0, sizeof(v));
  v.magic = GAL_MAGIC;
  v.schema = 1;
  v.slot_count = GAL_MAX_SLOTS;
  memset(v.order, GAL_SLOT_NONE, sizeof(v.order));
  for (uint8_t k = 0; k < nslots; k++) {
    v.order[k] = (uint8_t)(nslots - 1u - k);
    v.slots[k].state = GAL_SLOT_VALID;
    v.slots[k].format = FMT_RAW6;
    v.slots[k].generation = (uint16_t)(k + 1u);
    v.slots[k].length = SMALL_LEN;
    v.slots[k].crc32 = 0x1000u + k;
    v.slots[k].photo_id = 100u + k;
  }
  v.crc16 = crc16_ccitt((const uint8_t *)&v, (uint32_t)sizeof(v) - 2u);
  if (corrupt) {
    v.crc16 = (uint16_t)(v.crc16 ^ 0x0001u);
  }
  memcpy(g_v1, &v, sizeof(g_v1));
}

static void write_legacy_settings(const GalSettings *s) {
  GalSettings t = *s;
  t.schema = GAL_SETTINGS_SCHEMA;
  t.crc16 = crc16_ccitt((const uint8_t *)&t, (uint32_t)sizeof(t) - 2u);
  CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, &t, sizeof(t)), (int)sizeof(t));
}

static void write_legacy_rotstate(uint16_t off) {
  GalRotState r;
  r.shake_offset = off;
  r.crc16 = crc16_ccitt((const uint8_t *)&r, 2u);
  CHECK_EQ(persist_write_data(GAL_KEY_ROTSTATE, &r, sizeof(r)), (int)sizeof(r));
}

/* Persist "schema 1" completo: chiave 0 = key0 (se >= 0), V1 con nslots foto, chiave 10 e 2. */
static void setup_v1_full(int32_t key0, uint8_t nslots, const GalSettings *old, uint16_t shake) {
  reset_all(QUOTA_OK);
  if (key0 >= 0) {
    CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, key0), 4);
  }
  build_v1(nslots, 0);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, g_v1, sizeof(g_v1)), (int)sizeof(g_v1));
  write_legacy_settings(old);
  write_legacy_rotstate(shake);
}

/* ---- 1. migrazione con scrittura fallita a meta' e riavvio ---- */

static void test_migrate_half_failed(void) {
  GalSettings old, out;
  GalRotState rs;
  mk_settings(&old, 5);

  /* (a) chiave 0 scritta (1 -> 2), manifest E_OUT_OF_STORAGE, poi riavvio prima del ritentativo */
  setup_v1_full(1, 3, &old, 777);
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK(shim_timer_pending());
  shim_fail_writes_after(1);                           /* la 1a scrittura (chiave 0) passa, la 2a no */
  shim_log_reset();
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 1);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);          /* chiave 0 gia' a 2... */
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifestV1));   /* ...record ancora V1 */
  CHECK_EQ(shim_log_find("storage: write key 1"), 1);
  CHECK_EQ(shim_log_errors(), 1);
  CHECK(shim_timer_pending());                         /* ritentativo fra 10 s */
  CHECK_EQ(shim_timer_registrations(), 2);
  CHECK_EQ(shim_timer_orphans(), 0);
  CHECK(shim_key_exists(GAL_KEY_SETTINGS));            /* le chiavi legacy non vengono toccate */
  CHECK(shim_key_exists(GAL_KEY_ROTSTATE));

  /* riavvio (l'utente esce dalla watchface entro 10 s, storage_flush scrive: qui lo saltiamo con
   * la scrittura ancora impedita, cioe' il caso peggiore) */
  storage_flush();                                     /* fallisce ancora: errore loggato, V1 intatto */
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifestV1));
  shim_fail_writes_after(-1);
  shim_log_reset();
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK_EQ(shim_log_find("schema 1 -> 2 migrated"), 1);   /* la migrazione si rifa' da capo */
  CHECK_EQ(shim_write_count(), 0);
  CHECK(shim_timer_pending());
  CHECK_EQ(storage_valid_slots(), 3);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &old));
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 777);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 1);                     /* SOLO il manifest: la chiave 0 era gia' 2 */
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK(!shim_timer_pending());

  /* secondo riavvio: schema 2 a regime, nessuna migrazione, dati intatti */
  shim_log_reset();
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK_EQ(shim_log_find("migrated"), 0);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(storage_valid_slots(), 3);
  CHECK_EQ(storage_manifest()->order[0], 2);
  CHECK_EQ(storage_manifest()->order[2], 0);
  CHECK_EQ(storage_manifest()->order[3], GAL_SLOT_NONE);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &old));
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 777);

  /* (b) fallisce gia' la chiave 0: nulla scritto, riavvio, migrazione rifatta, 2 scritture */
  setup_v1_full(1, 2, &old, 9);
  CHECK(storage_init());
  shim_reset_write_count();                            /* le 4 scritture della preparazione non contano */
  shim_fail_writes_after(0);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), 1);
  CHECK(shim_timer_pending());
  shim_fail_writes_after(-1);
  shim_log_reset();
  CHECK(storage_init());
  CHECK_EQ(shim_log_find("migrated"), 1);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 9);
}

/* ---- 2. album disabilitato (quota < 1 MiB): che cosa finisce nel record ---- */

static void test_disabled_album_record(void) {
  GalSettings old, s, out;
  GalManifest rec;
  mk_settings(&old, 3);
  mk_settings(&s, 8);

  /* (a) migrazione V1 con 2 foto e album disabilitato, poi impostazioni cambiate: il record scritto
   * dal timer porta impostazioni + shake (contratto) e CONSERVA slot e ordine del V1 (B1, corretto
   * 05/09: s_backup): i chunk sono ancora nel file e il record e' l'unica descrizione delle foto,
   * mentre in RAM slot e ordine restano azzerati (model.c non deve provare slot illeggibili). */
  reset_all(QUOTA_BAD);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 1), 4);
  build_v1(2, 0);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, g_v1, sizeof(g_v1)), (int)sizeof(g_v1));
  write_legacy_settings(&old);
  write_legacy_rotstate(11);
  CHECK(!storage_init());
  CHECK_EQ(storage_valid_slots(), 0);                  /* in RAM: accettato (model.c non prova gli slot) */
  CHECK_EQ(storage_manifest()->order[0], GAL_SLOT_NONE);
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s));       /* impostazioni nuove: ok */
  CHECK_EQ(rec.shake_offset, 11);                      /* shake migrato: ok */
  /* B1: il record in persist conserva le 2 foto del V1 (generation, crc32, photo_id, ordine)... */
  CHECK(rec.slots[0].state == GAL_SLOT_VALID);
  CHECK(rec.slots[1].state == GAL_SLOT_VALID);
  CHECK(rec.slots[1].photo_id == 101u);
  CHECK_EQ(rec.slots[1].generation, 2);
  CHECK(rec.order[0] == 1 && rec.order[1] == 0);
  CHECK_EQ(rec.crc16, crc16_ccitt((const uint8_t *)&rec, (uint32_t)sizeof(rec) - 2u));
  /* ...mentre in RAM restano azzerati finche' l'album e' disabilitato */
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK_EQ(storage_manifest()->order[0], GAL_SLOT_NONE);
  CHECK_EQ(storage_manifest()->slots[1].state, GAL_SLOT_EMPTY);
  /* stesso file persist, quota di nuovo >= 1 MiB: le foto ci sono ancora */
  shim_set_quota(QUOTA_OK);
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));
  CHECK(storage_valid_slots() == 2);
  CHECK_EQ(storage_manifest()->slots[1].photo_id, 101u);
  CHECK_EQ(storage_manifest()->order[0], 1);

  /* (b) senza migrazione: record schema 2 con 1 foto, quota crollata, uno SHAKE (o un'impostazione)
   * fa scrivere il record, che CONSERVA slot e ordine (B1 corretto 05/09) mentre la RAM resta azzerata */
  build_valid_state();
  CHECK_EQ(storage_valid_slots(), 1);
  memcpy(g_saved, key_bytes(GAL_KEY_MANIFEST), sizeof(g_saved));
  shim_set_quota(QUOTA_BAD);
  CHECK(!storage_init());
  CHECK_EQ(storage_valid_slots(), 0);
  {
    GalRotState st = { .shake_offset = 4, .crc16 = 0 };
    CHECK(storage_write_rotstate(&st));
  }
  CHECK(shim_timer_fire());
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK_EQ(rec.shake_offset, 4);
  CHECK(rec.slots[3].state == GAL_SLOT_VALID);         /* B1: il record conserva la foto */
  CHECK(rec.slots[3].photo_id == 42u);
  CHECK(rec.order[0] == 3);
  CHECK_EQ(storage_valid_slots(), 0);                  /* RAM: ancora nascosti */
  /* una seconda scrittura con l'album ancora disabilitato non degrada il record */
  {
    GalSettings s2;
    mk_settings(&s2, 9);
    storage_settings_changed(&s2);
    CHECK(shim_timer_fire());
    memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
    CHECK(settings_eq_payload(&rec.settings, &s2));
    CHECK_EQ(rec.slots[3].state, GAL_SLOT_VALID);
    CHECK_EQ(rec.order[0], 3);
    CHECK_EQ(storage_valid_slots(), 0);
  }
  shim_set_quota(QUOTA_OK);
  CHECK(storage_init());
  CHECK(storage_valid_slots() == 1);
  CHECK_EQ(storage_manifest()->slots[3].photo_id, 42u);
  CHECK(shim_key_exists(GAL_KEY_CHUNK(3, 0)));         /* i chunk ci sono ancora */
  CHECK(shim_key_exists(GAL_KEY_CHUNK(3, 1)));

  /* (c) con l'album disabilitato e NESSUNA modifica non si scrive nulla (contratto rispettato) */
  fresh(QUOTA_BAD);
  shim_reset_write_count();
  storage_flush();
  CHECK_EQ(shim_write_count(), 0);
  CHECK(!shim_timer_pending());
}

/* ---- 3. chiave 0 incoerente con il record ---- */

static void test_key0_vs_record(void) {
  GalSettings old, s, out;
  mk_settings(&old, 4);
  mk_settings(&s, 7);

  /* (a) chiave 0 = 2 con manifest 214 B (migrazione interrotta dopo la chiave 0): migrazione fatta
   * lo stesso, e la prima scrittura NON riscrive la chiave 0 */
  setup_v1_full(2, 2, &old, 9);
  shim_log_reset();
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK_EQ(shim_log_find("schema 1 -> 2 migrated"), 1);
  CHECK(shim_timer_pending());
  CHECK_EQ(storage_valid_slots(), 2);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 1);
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  shim_log_reset();
  CHECK(storage_init());
  CHECK_EQ(shim_log_find("migrated"), 0);
  CHECK_EQ(storage_valid_slots(), 2);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &old));

  /* (b) chiave 0 ASSENTE con manifest 214 B: migrazione, poi 2 scritture */
  setup_v1_full(-1, 2, &old, 9);
  CHECK(!shim_key_exists(GAL_KEY_SCHEMA));
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK(shim_timer_pending());
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);

  /* (c) chiave 0 ASSENTE con manifest 234 B valido: il record e' accettato (la chiave 0 non e' una
   * condizione per leggerlo), la prima scrittura la crea */
  build_valid_state();
  CHECK_EQ(persist_delete(GAL_KEY_SCHEMA), S_TRUE);
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK(!shim_timer_pending());
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK_EQ(storage_manifest()->slots[3].photo_id, 42u);
  CHECK(storage_read_settings(&out));                  /* record caricato */
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
  CHECK_EQ(storage_valid_slots(), 1);

  /* (d) chiave 0 = 1 con manifest 234 B valido: idem, la chiave 0 sale a 2 alla prima scrittura */
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 1), 4);
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK_EQ(storage_valid_slots(), 1);
  mk_settings(&s, 9);
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);

  /* (e) chiave 0 = 2 con V1 CORROTTO: ignorato (WARNING), default, nessun timer; la prima
   * scrittura sostituisce il record da 214 B con quello da 234 B (una sola scrittura) */
  reset_all(QUOTA_OK);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 2), 4);
  build_v1(3, 1);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, g_v1, sizeof(g_v1)), (int)sizeof(g_v1));
  write_legacy_settings(&old);
  shim_log_reset();
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK_EQ(shim_log_find("manifest v1 invalid"), 1);
  CHECK_EQ(shim_log_warnings(), 1);
  CHECK(!shim_timer_pending());
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK(!storage_read_settings(&out));
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 1);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));
  CHECK_EQ(storage_valid_slots(), 0);

  /* (f) prima scrittura di un persist NUOVO interrotta dopo la chiave 0: al riavvio chiave 0 = 2
   * senza record → default, s_schema_ok alzato → la scrittura seguente e' una sola */
  fresh(QUOTA_OK);
  shim_fail_writes_after(1);
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
  shim_fail_writes_after(-1);
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK(!storage_read_settings(&out));
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 1);
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
}

/* ---- 4. schema futuro: reset dei metadati, poi una scrittura ---- */

static void test_reset_then_write(void) {
  GalSettings s, s2, out;
  mk_settings(&s, 2);
  mk_settings(&s2, 6);
  build_valid_state();
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, GAL_SCHEMA + 1), 4);
  const int del0 = shim_delete_count();
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK_EQ(shim_delete_count(), del0 + 2);             /* solo 0 e 1 esistevano */
  CHECK(!shim_key_exists(GAL_KEY_SCHEMA));
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
  CHECK(!storage_read_settings(&out));
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), 0);
  /* la prima scrittura dopo il reset ricrea la chiave 0 (= 2) e il record: 2 scritture */
  storage_settings_changed(&s2);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s2));
  CHECK_EQ(storage_valid_slots(), 0);
  {
    uint8_t rd[8];
    CHECK_EQ(storage_read_chunk(3, 0, rd, sizeof(rd)), 8);   /* i chunk restano leggibili */
  }
  /* riavvio: record nuovo, nessun reset, impostazioni conservate, foto "dimenticate" (contratto) */
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK_EQ(shim_delete_count(), del0 + 2);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s2));
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK(!shim_timer_pending());
  /* la seconda scrittura della stessa esecuzione non ritocca la chiave 0 */
  mk_settings(&s, 10);
  storage_settings_changed(&s);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 1);

  /* schema futuro con album DISABILITATO: stesso reset, stessa ricostruzione */
  shim_set_quota(QUOTA_BAD);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 7), 4);
  shim_reset_write_count();
  CHECK(!storage_init());
  CHECK(!shim_key_exists(GAL_KEY_SCHEMA));
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
  storage_settings_changed(&s2);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
}

/* ---- 5. timer: ritentativi esauriti, quarto evento, register NULL nel ritentativo ---- */

static void fire_n_failing(int n) {
  for (int i = 0; i < n; i++) {
    CHECK(shim_timer_fire());
  }
}

static void test_timer_retries(void) {
  GalSettings s, s2, s3, out;
  GalRotState st = { .shake_offset = 3, .crc16 = 0 };
  mk_settings(&s, 11);
  mk_settings(&s2, 12);
  mk_settings(&s3, 13);
  build_valid_state();
  memcpy(g_saved, key_bytes(GAL_KEY_MANIFEST), sizeof(g_saved));
  storage_settings_changed(&s);
  const int reg0 = shim_timer_registrations();
  const int w0 = shim_write_count();
  shim_fail_writes_after(0);
  shim_log_reset();
  /* fire 1 (originale) + 3 ritentativi: ogni fallimento ri-registra il timer, il terzo no */
  fire_n_failing(3);
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_timeout(), STORAGE_SETTINGS_DEBOUNCE_MS);
  CHECK_EQ(shim_timer_registrations(), reg0 + 3);
  CHECK(shim_timer_fire());                            /* 4o fallimento: ritentativi esauriti */
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), reg0 + 3);
  CHECK_EQ(shim_timer_orphans(), 0);
  CHECK_EQ(shim_log_errors(), 4);
  CHECK_EQ(shim_write_count(), w0);
  CHECK(!shim_timer_fire());                           /* niente piu' in coda */
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));                /* la RAM conserva la copia pendente */
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), g_saved, sizeof(g_saved)) == 0);   /* persist vecchio */

  /* 4o evento (uno shake basta): il contatore riparte, altri 3 ritentativi */
  CHECK(storage_write_rotstate(&st));
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), reg0 + 4);
  fire_n_failing(4);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), reg0 + 7);
  CHECK_EQ(shim_log_errors(), 8);
  CHECK_EQ(shim_write_count(), w0);

  /* evento nuovo con la scrittura tornata possibile: UNA scrittura con impostazioni + shake */
  shim_fail_writes_after(-1);
  storage_settings_changed(&s);                        /* stessa copia: storage non confronta */
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), w0 + 1);
  CHECK(!shim_timer_pending());
  {
    GalManifest rec;
    memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
    CHECK(settings_eq_payload(&rec.settings, &s));
    CHECK_EQ(rec.shake_offset, 3);
    CHECK_EQ(rec.slots[3].state, GAL_SLOT_VALID);
  }

  /* ritentativi esauriti, poi il flush di deinit: le impostazioni pendenti si scrivono */
  storage_settings_changed(&s2);
  shim_fail_writes_after(0);
  fire_n_failing(4);
  CHECK(!shim_timer_pending());
  shim_fail_writes_after(-1);
  storage_flush();
  CHECK_EQ(shim_write_count(), w0 + 2);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s2));
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s2));

  /* ritentativi esauriti con SOLO lo shake pendente: il flush non scrive (D19: accettato) */
  st.shake_offset = 5;
  CHECK(storage_write_rotstate(&st));
  shim_fail_writes_after(0);
  fire_n_failing(4);
  CHECK(!shim_timer_pending());
  shim_fail_writes_after(-1);
  storage_flush();
  CHECK_EQ(shim_write_count(), w0 + 2);

  /* app_timer_register NULL DENTRO il ritentativo: nessun timer, dati in RAM, flush li scrive */
  CHECK(storage_init());
  storage_settings_changed(&s3);
  CHECK(shim_timer_pending());
  shim_fail_writes_after(0);
  shim_fail_timer_register(true);
  shim_log_reset();
  CHECK(shim_timer_fire());
  CHECK(!shim_timer_pending());                        /* register fallita: nessun ritentativo */
  CHECK_EQ(shim_log_errors(), 1);
  CHECK_EQ(shim_write_count(), w0 + 2);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s3));
  shim_fail_timer_register(false);
  shim_fail_writes_after(-1);
  storage_flush();
  CHECK_EQ(shim_write_count(), w0 + 3);
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s3));

  /* register NULL alla PRIMA programmazione con scrittura impossibile: dirty resta, l'evento
   * successivo (register ok) porta tutto */
  st.shake_offset = 6;
  shim_fail_timer_register(true);
  shim_fail_writes_after(0);
  CHECK(storage_write_rotstate(&st));                  /* scrittura immediata... fallita */
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), w0 + 3);
  shim_fail_timer_register(false);
  shim_fail_writes_after(-1);
  mk_settings(&s, 14);
  storage_settings_changed(&s);
  CHECK(shim_timer_pending());
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), w0 + 4);
  {
    GalManifest rec;
    memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
    CHECK_EQ(rec.shake_offset, 6);
    CHECK(settings_eq_payload(&rec.settings, &s));
  }
}

/* ---- 6. flush con timer scaduto-non-consumato (callback in coda) ---- */

static void test_flush_expired_timer(void) {
  GalSettings s;
  GalRotState st = { .shake_offset = 5, .crc16 = 0 };
  mk_settings(&s, 1);
  build_valid_state();
  const int w = shim_write_count();
  storage_settings_changed(&s);
  CHECK(shim_timer_expire());                          /* scaduto, callback in coda */
  const int can = shim_timer_cancels();
  storage_flush();
  CHECK_EQ(shim_timer_cancels(), can + 1);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), w + 1);                 /* scritto dal flush */
  CHECK(!shim_timer_fire());                           /* callback scartato: nessuna 2a scrittura */
  CHECK_EQ(shim_write_count(), w + 1);
  storage_flush();
  CHECK_EQ(shim_write_count(), w + 1);

  /* solo shake, scaduto: cancellato, niente scrittura, offset perso al riavvio (D19: accettato) */
  CHECK(storage_write_rotstate(&st));
  CHECK(shim_timer_expire());
  storage_flush();
  CHECK_EQ(shim_write_count(), w + 1);
  CHECK(!shim_timer_fire());
  CHECK(storage_init());
  CHECK_EQ(storage_manifest()->shake_offset, 0);
}

/* ---- 7. commit/set_order/clear intrecciati con impostazioni pendenti ---- */

static void test_commit_vs_pending_settings(void) {
  GalSettings s, s2, s3, out;
  GalManifest rec;
  uint8_t ord[GAL_MAX_SLOTS];
  mk_settings(&s, 5);
  mk_settings(&s2, 6);
  mk_settings(&s3, 7);
  build_valid_state();
  memcpy(g_saved, key_bytes(GAL_KEY_MANIFEST), sizeof(g_saved));

  /* (a) impostazioni pendenti, commit che FALLISCE: le impostazioni nuove sopravvivono in RAM,
   * dirty resta, il timer pendente le porta poi in persist senza lo slot fallito */
  storage_settings_changed(&s);
  CHECK(shim_timer_pending());
  put_photo(4, 0x44);
  const int w = shim_write_count();
  shim_fail_writes_after(0);
  CHECK_EQ(storage_commit_slot(4, FMT_RAW6, SMALL_LEN, 0x99u, 11u), STORAGE_NO_SPACE);
  CHECK_EQ(storage_manifest()->slots[4].state, GAL_SLOT_EMPTY);
  CHECK_EQ(storage_manifest()->slots[4].generation, 0);
  CHECK_EQ(storage_manifest()->order[1], GAL_SLOT_NONE);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));                /* RAM: impostazioni nuove conservate */
  CHECK(shim_timer_pending());                         /* il timer non e' stato toccato */
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), g_saved, sizeof(g_saved)) == 0);
  shim_fail_writes_after(-1);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), w + 1);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s));
  CHECK_EQ(rec.slots[4].state, GAL_SLOT_EMPTY);
  CHECK_EQ(rec.slots[3].state, GAL_SLOT_VALID);
  CHECK(!shim_timer_pending());
  storage_flush();
  CHECK_EQ(shim_write_count(), w + 1);                 /* non piu' dirty */

  /* (b) impostazioni pendenti, commit che RIESCE: il manifest del commit porta gia' le impostazioni,
   * dirty azzerato, il timer (ancora pendente) poi non scrive nulla */
  storage_settings_changed(&s2);
  CHECK(shim_timer_pending());
  CHECK_EQ(storage_commit_slot(4, FMT_RAW6, SMALL_LEN, 0x99u, 11u), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 2);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s2));
  CHECK_EQ(rec.slots[4].state, GAL_SLOT_VALID);
  CHECK_EQ(rec.order[1], 4);
  CHECK(shim_timer_pending());                         /* documentato: il commit non cancella il timer */
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), w + 2);                 /* ...ma il callback non scrive (dirty = false) */
  storage_flush();
  CHECK_EQ(shim_write_count(), w + 2);

  /* (c) idem con set_order e clear_slot */
  storage_settings_changed(&s3);
  memset(ord, GAL_SLOT_NONE, sizeof(ord));
  ord[0] = 4;
  ord[1] = 3;
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 3);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s3));
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), w + 3);
  mk_settings(&s3, 8);
  storage_settings_changed(&s3);
  CHECK_EQ(storage_clear_slot(4), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 4);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s3));
  CHECK_EQ(rec.slots[4].state, GAL_SLOT_EMPTY);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), w + 4);

  /* (d) shake pendente + commit riuscito: anche lo shake viaggia col manifest del commit */
  {
    GalRotState st = { .shake_offset = 21, .crc16 = 0 };
    CHECK(storage_write_rotstate(&st));
    CHECK_EQ(storage_commit_slot(4, FMT_RAW6, SMALL_LEN, 0x98u, 12u), STORAGE_OK);
    memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
    CHECK_EQ(rec.shake_offset, 21);
    CHECK_EQ(rec.slots[4].generation, 2);
    CHECK(shim_timer_fire());
    CHECK_EQ(shim_write_count(), w + 5);
  }

  /* (e) riavvio: tutto coerente e nessun timer */
  CHECK(storage_init());
  CHECK(!shim_timer_pending());
  CHECK_EQ(storage_valid_slots(), 2);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s3));
  CHECK_EQ(storage_manifest()->shake_offset, 21);
}

/* ---- 8. set_order identico dopo commit / clear; order pieno ---- */

static void test_set_order_after_commit(void) {
  uint8_t ord[GAL_MAX_SLOTS];
  fresh(QUOTA_OK);
  put_photo(3, 0x33);
  CHECK_EQ(storage_commit_slot(3, FMT_RAW6, SMALL_LEN, 1u, 1u), STORAGE_OK);
  put_photo(7, 0x77);
  CHECK_EQ(storage_commit_slot(7, FMT_RAW6, SMALL_LEN, 2u, 2u), STORAGE_OK);
  memset(ord, GAL_SLOT_NONE, sizeof(ord));
  ord[0] = 3;
  ord[1] = 7;
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);
  int w = shim_write_count();
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);        /* identico a quello costruito dai commit */
  CHECK_EQ(shim_write_count(), w);
  CHECK_EQ(storage_clear_slot(3), STORAGE_OK);         /* order non compattato */
  CHECK_EQ(shim_write_count(), w + 1);
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 1);
  CHECK_EQ(storage_commit_slot(3, FMT_RAW6, SMALL_LEN, 3u, 3u), STORAGE_OK);   /* gia' in order */
  CHECK_EQ(shim_write_count(), w + 2);
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 2);
  /* set_order identico con la scrittura impossibile: STORAGE_OK senza toccare persist */
  shim_fail_writes_after(0);
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);
  shim_fail_writes_after(-1);
  CHECK_EQ(shim_write_count(), w + 2);

  /* order pieno di 12 slot (nessun NONE): il commit di ogni slot non elencato non lo tocca e il
   * manifest viene comunque scritto una volta per commit */
  for (uint8_t i = 0; i < GAL_MAX_SLOTS; i++) {
    ord[i] = (uint8_t)(GAL_MAX_SLOTS - 1u - i);
  }
  CHECK_EQ(storage_set_order(ord), STORAGE_OK);
  w = shim_write_count();
  for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {
    CHECK_EQ(storage_commit_slot(k, FMT_RAW6, SMALL_LEN, 10u + k, 20u + k), STORAGE_OK);
  }
  CHECK_EQ(shim_write_count(), w + GAL_MAX_SLOTS);
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);
  CHECK_EQ(storage_valid_slots(), GAL_MAX_SLOTS);
  CHECK_EQ(storage_manifest()->settings.schema, GAL_SETTINGS_SCHEMA);   /* record integro dopo 12 commit */
  CHECK_EQ(storage_manifest()->magic, GAL_MAGIC);
  CHECK(storage_init());
  CHECK_EQ(storage_valid_slots(), GAL_MAX_SLOTS);
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);
}

/* ---- 9. clear_slot su slot gia' vuoto ---- */

static void test_clear_slot_idempotent(void) {
  fresh(QUOTA_OK);
  put_photo(3, 0x33);
  CHECK_EQ(storage_commit_slot(3, FMT_RAW6, SMALL_LEN, 1u, 1u), STORAGE_OK);
  int w = shim_write_count();
  CHECK_EQ(storage_clear_slot(3), STORAGE_OK);
  CHECK_EQ(shim_write_count(), w + 1);                 /* prima cancellazione: una scrittura */
  memcpy(g_saved, key_bytes(GAL_KEY_MANIFEST), sizeof(g_saved));
  w = shim_write_count();
  /* B2 (corretto 05/09, F31): slot GIA' EMPTY ⇒ STORAGE_OK senza riscrivere il manifest (come
   * storage_set_order dal S7 F9(4)): un ALBUM_DELETE ritrasmesso dal telefono (sync.js
   * STATUS_RESENDS) o su uno slot mai usato non appende un record identico (= un passo in piu' in
   * ogni scansione del file, per sempre). */
  shim_lookup_reset();
  CHECK_EQ(storage_clear_slot(3), STORAGE_OK);
  CHECK(shim_write_count() == w);
  CHECK(memcmp(key_bytes(GAL_KEY_MANIFEST), g_saved, sizeof(g_saved)) == 0);   /* bit a bit uguale */
  CHECK_EQ(storage_clear_slot(9), STORAGE_OK);         /* slot mai usato */
  CHECK(shim_write_count() == w);
  CHECK_EQ(shim_lookup_count(), 0);                    /* nemmeno una ricerca nel file */
  /* con la scrittura impossibile, la cancellazione di uno slot gia' vuoto e' un no-op: non deve
   * fallire (il telefono riceverebbe STATUS NO_SPACE per nulla) */
  shim_fail_writes_after(0);
  CHECK(storage_clear_slot(3) == STORAGE_OK);
  CHECK(storage_clear_slot(9) == STORAGE_OK);
  shim_fail_writes_after(-1);
  CHECK(shim_write_count() == w);
  CHECK_EQ(storage_manifest()->slots[3].state, GAL_SLOT_EMPTY);
  CHECK_EQ(storage_manifest()->slots[9].state, GAL_SLOT_EMPTY);
  CHECK_EQ(storage_manifest()->slots[3].generation, 1);   /* metadati conservati anche dopo i tentativi */
}

/* ---- 10. open_ms: formula e clamp con l'orologio finto dello shim (F48) ---- */

/* storage_init con l'orologio finto: due letture di time_ms distanti `step` ms a partire da (s0, ms0). */
static uint16_t open_ms_for(time_t s0, uint16_t ms0, int32_t step) {
  shim_set_time_ms(s0, ms0);
  shim_set_time_step_ms(step);
  (void)storage_init();
  shim_set_time_step_ms(0);
  return storage_open_ms();
}

static void test_open_ms(void) {
  fresh(QUOTA_OK);
  /* orologio reale dello shim (ms = 0): 0, oppure 1000 se il secondo di parete scatta fra le due
   * letture (per questo i pin veri usano l'orologio finto) */
  CHECK(storage_open_ms() == 0 || storage_open_ms() == 1000);
#ifndef GALLERIA_DEBUG_TIMING
  CHECK_EQ(storage_debug_ms(0), 0);                    /* build P: sempre 0 */
  CHECK_EQ(storage_debug_ms(1), 0);
#else
  CHECK_EQ(storage_debug_ms(0), storage_open_ms());
#endif
  /* misurato anche con album disabilitato e con schema futuro (prima di qualunque reset) */
  shim_set_quota(QUOTA_BAD);
  CHECK(!storage_init());
  CHECK(storage_open_ms() == 0 || storage_open_ms() == 1000);

  reset_all(QUOTA_OK);
  CHECK_EQ(open_ms_for(100, 900, 200), 200);           /* a cavallo del secondo: 100.900 -> 101.100 */
  CHECK_EQ(open_ms_for(5, 999, 1), 1);
  CHECK_EQ(open_ms_for(10, 10, 0), 0);
  CHECK_EQ(open_ms_for(100, 0, 999), 999);
  CHECK_EQ(open_ms_for(0, 0, 65535), 65535);           /* esattamente il massimo */
  CHECK_EQ(open_ms_for(0, 0, 65536), 65535);           /* clamp */
  CHECK_EQ(open_ms_for(100, 0, 100000), 65535);        /* 100 s -> clamp */
  CHECK_EQ(open_ms_for(100, 500, -100), 0);            /* orologio indietro: mai negativo */
  CHECK_EQ(open_ms_for(100, 0, -1), 0);
  CHECK_EQ(open_ms_for(2000000000, 999, 1), 1);        /* time_t grande: nessun overflow */
  {
    const int calls0 = shim_time_ms_calls();
    CHECK_EQ(open_ms_for(7, 100, 2150), 2150);
#ifndef GALLERIA_DEBUG_TIMING
    CHECK_EQ(shim_time_ms_calls() - calls0, 2);        /* due letture per storage_init (regola 11) */
#else
    CHECK_EQ(shim_time_ms_calls() - calls0, 4);        /* + TMR(t_man) e TMR_MS */
    CHECK_EQ(storage_debug_ms(0), 2150);
#endif
  }
  /* il valore misurato non dipende dal persist: stesso passo, file con record e chunk */
  build_valid_state();
  CHECK_EQ(open_ms_for(7, 100, 2150), 2150);           /* il numero di campo del 04/09 */
  CHECK_EQ(storage_valid_slots(), 1);
  shim_set_quota(QUOTA_BAD);
  CHECK_EQ(open_ms_for(7, 100, 90), 90);               /* album disabilitato: misurato lo stesso */
  CHECK(!storage_album_enabled());
  shim_set_quota(QUOTA_OK);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, GAL_SCHEMA + 1), 4);
  CHECK_EQ(open_ms_for(7, 100, 650), 650);             /* schema futuro: misurato PRIMA del reset */
  CHECK(!shim_key_exists(GAL_KEY_SCHEMA));
}

/* ---- 11. chiavi legacy piu' lunghe del dovuto (prv_read_blob: size == sizeof) ---- */

static void test_legacy_blob_longer(void) {
  GalSettings old, out, def;
  GalRotState rs;
  uint8_t buf[GAL_CHUNK_BYTES];
  mk_settings(&old, 6);
  settings_set_defaults(&def);

  /* chiave 10 di 21 B (impostazioni valide + 1 byte): rifiutata → default */
  reset_all(QUOTA_OK);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 1), 4);
  build_v1(2, 0);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, g_v1, sizeof(g_v1)), (int)sizeof(g_v1));
  {
    GalSettings t = old;
    t.schema = GAL_SETTINGS_SCHEMA;
    t.crc16 = crc16_ccitt((const uint8_t *)&t, (uint32_t)sizeof(t) - 2u);
    memset(buf, 0, sizeof(buf));
    memcpy(buf, &t, sizeof(t));
    CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, buf, sizeof(t) + 1u), (int)sizeof(t) + 1);
  }
  /* chiave 2 di 5 B (rotstate valido + 1 byte): rifiutata → shake 0 */
  {
    GalRotState r;
    r.shake_offset = 321;
    r.crc16 = crc16_ccitt((const uint8_t *)&r, 2u);
    memset(buf, 0, sizeof(buf));
    memcpy(buf, &r, sizeof(r));
    CHECK_EQ(persist_write_data(GAL_KEY_ROTSTATE, buf, sizeof(r) + 1u), (int)sizeof(r) + 1);
  }
  shim_log_reset();
  CHECK(storage_init());
  CHECK(shim_timer_pending());                         /* il V1 si migra lo stesso */
  CHECK_EQ(storage_valid_slots(), 2);
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &def));
  CHECK(!settings_eq_payload(&out, &old));
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 0);
  CHECK_EQ(shim_log_find("size 21 != 20"), 1);
  CHECK_EQ(shim_log_find("size 5 != 4"), 1);

  /* chiave 10 da 256 B (tutto il record possibile) */
  reset_all(QUOTA_OK);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, 1), 4);
  CHECK_EQ(persist_write_data(GAL_KEY_MANIFEST, g_v1, sizeof(g_v1)), (int)sizeof(g_v1));
  {
    GalSettings t = old;
    t.schema = GAL_SETTINGS_SCHEMA;
    t.crc16 = crc16_ccitt((const uint8_t *)&t, (uint32_t)sizeof(t) - 2u);
    memset(buf, 0xEE, sizeof(buf));
    memcpy(buf, &t, sizeof(t));
    CHECK_EQ(persist_write_data(GAL_KEY_SETTINGS, buf, sizeof(buf)), (int)sizeof(buf));
  }
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &def));
}

/* ---- 12. shake senza timer disponibile ---- */

static void test_shake_no_timer(void) {
  GalRotState st = { .shake_offset = 5, .crc16 = 0 };
  GalRotState back;
  GalSettings s;
  GalManifest rec;
  fresh(QUOTA_OK);
  shim_fail_timer_register(true);
  CHECK(storage_write_rotstate(&st));                  /* nessun timer: scrittura immediata */
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), 2);                     /* chiave 0 + manifest */
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
  CHECK(storage_read_rotstate(&back));
  CHECK_EQ(back.shake_offset, 5);
  CHECK(storage_write_rotstate(&st));                  /* invariato: niente */
  CHECK_EQ(shim_write_count(), 2);
  st.shake_offset = 6;
  CHECK(storage_write_rotstate(&st));
  CHECK_EQ(shim_write_count(), 3);
  /* timer e scrittura entrambi impossibili: la scossa e' accettata, dirty resta, nessun record */
  shim_fail_writes_after(0);
  shim_log_reset();
  st.shake_offset = 7;
  CHECK(storage_write_rotstate(&st));
  CHECK_EQ(shim_write_count(), 3);
  CHECK_EQ(shim_log_errors(), 1);
  CHECK_EQ(storage_manifest()->shake_offset, 7);       /* RAM aggiornata (la rotazione lo usa) */
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK_EQ(rec.shake_offset, 6);                       /* persist fermo al valore precedente */
  /* un'impostazione cambiata con il timer tornato disponibile porta anche lo shake 7 */
  shim_fail_timer_register(false);
  shim_fail_writes_after(-1);
  mk_settings(&s, 3);
  storage_settings_changed(&s);
  CHECK(shim_timer_pending());
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 4);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK_EQ(rec.shake_offset, 7);
  CHECK(settings_eq_payload(&rec.settings, &s));
}

/* ---- 13. migrazione seguita da commit / impostazioni prima del timer ---- */

static void test_migrate_then_ops_before_timer(void) {
  GalSettings old, s, out;
  GalRotState rs;
  GalManifest rec;
  mk_settings(&old, 5);
  mk_settings(&s, 9);

  /* (a) commit di una foto nuova subito dopo la migrazione (sync veloce): il manifest del commit
   * porta chiave 0 → 2 e il record 234 B con gli slot V1 + il nuovo; il timer poi non scrive */
  setup_v1_full(1, 3, &old, 777);
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK(shim_timer_pending());
  put_photo(5, 0x55);
  CHECK_EQ(shim_write_count(), 2);                     /* i 2 chunk */
  CHECK_EQ(storage_commit_slot(5, FMT_RAW6, SMALL_LEN, 0x5555u, 500u), STORAGE_OK);
  CHECK_EQ(shim_write_count(), 4);                     /* chiave 0 (1 → 2) + manifest */
  CHECK_EQ(persist_read_int(GAL_KEY_SCHEMA), GAL_SCHEMA);
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK_EQ(rec.slots[0].state, GAL_SLOT_VALID);
  CHECK_EQ(rec.slots[2].photo_id, 102u);
  CHECK_EQ(rec.slots[5].state, GAL_SLOT_VALID);
  CHECK_EQ(rec.slots[5].generation, 1);
  CHECK_EQ(rec.order[0], 2);
  CHECK_EQ(rec.order[3], 5);
  CHECK_EQ(rec.order[4], GAL_SLOT_NONE);
  CHECK_EQ(rec.shake_offset, 777);
  CHECK(settings_eq_payload(&rec.settings, &old));
  CHECK(shim_timer_pending());
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 4);                     /* dirty gia' azzerati dal commit */
  shim_log_reset();
  CHECK(storage_init());
  CHECK_EQ(shim_log_find("migrated"), 0);
  CHECK_EQ(storage_valid_slots(), 4);

  /* (b) impostazioni cambiate prima del timer: reschedule, una sola scrittura con le nuove */
  setup_v1_full(1, 2, &old, 64);
  shim_reset_write_count();
  CHECK(storage_init());
  CHECK_EQ(shim_timer_registrations(), 1);
  storage_settings_changed(&s);
  CHECK_EQ(shim_timer_registrations(), 1);
  CHECK_EQ(shim_timer_reschedules(), 1);
  CHECK_EQ(shim_timer_orphans(), 0);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_write_count(), 2);
  memcpy(&rec, key_bytes(GAL_KEY_MANIFEST), sizeof(rec));
  CHECK(settings_eq_payload(&rec.settings, &s));
  CHECK(!settings_eq_payload(&rec.settings, &old));
  CHECK_EQ(rec.shake_offset, 64);
  CHECK_EQ(rec.slots[1].state, GAL_SLOT_VALID);
  CHECK_EQ(rec.order[0], 1);
  CHECK(storage_init());
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 64);
  CHECK_EQ(storage_valid_slots(), 2);

  /* (c) set_order identico all'ordine migrato: nessuna scrittura, il timer scrive la migrazione */
  setup_v1_full(1, 2, &old, 1);
  shim_reset_write_count();
  CHECK(storage_init());
  {
    uint8_t ord[GAL_MAX_SLOTS];
    memset(ord, GAL_SLOT_NONE, sizeof(ord));
    ord[0] = 1;
    ord[1] = 0;
    CHECK_EQ(storage_set_order(ord), STORAGE_OK);
    CHECK_EQ(shim_write_count(), 0);
    CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifestV1));
    CHECK(shim_timer_pending());
    CHECK(shim_timer_fire());
    CHECK_EQ(shim_write_count(), 2);
    CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));
  }
}

/* ---- 14. letture senza record ---- */

static void test_read_without_record(void) {
  GalSettings s, out;
  GalRotState st = { .shake_offset = 8, .crc16 = 0 };
  GalRotState back;
  mk_settings(&s, 4);
  fresh(QUOTA_OK);
  storage_settings_changed(&s);
  CHECK(storage_write_rotstate(&st));
  shim_fail_writes_after(0);
  CHECK(shim_timer_fire());                            /* scrittura fallita: nessun record */
  CHECK(!storage_read_settings(&out));                 /* contratto: false senza record... */
  CHECK(!storage_read_rotstate(&back));
  CHECK_EQ(storage_manifest()->shake_offset, 8);       /* ...ma il manifest in RAM li ha */
  CHECK(settings_eq_payload(&storage_manifest()->settings, &s));
  shim_fail_writes_after(-1);
  CHECK(shim_timer_fire());                            /* ritentativo riuscito */
  CHECK(storage_read_settings(&out));
  CHECK(settings_eq_payload(&out, &s));
  CHECK(storage_read_rotstate(&back));
  CHECK_EQ(back.shake_offset, 8);
  CHECK_EQ(back.crc16, 0);
}

int main(void) {
  shim_set_log(getenv("GALLERIA_TEST_VERBOSE") != NULL);
  test_migrate_half_failed();
  test_disabled_album_record();
  test_key0_vs_record();
  test_reset_then_write();
  test_timer_retries();
  test_flush_expired_timer();
  test_commit_vs_pending_settings();
  test_set_order_after_commit();
  test_clear_slot_idempotent();
  test_open_ms();
  test_legacy_blob_longer();
  test_shake_no_timer();
  test_migrate_then_ops_before_timer();
  test_read_without_record();
  printf("test_storage_adv: %d ok, %d falliti\n", g_ok, g_fail);
  return g_fail ? 1 : 0;
}

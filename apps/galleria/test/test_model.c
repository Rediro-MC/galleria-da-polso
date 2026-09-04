/* test_model.c — test host di model.c (gcc + shim/pebble.h + shim/ui_fake.c, nessun ARM/emulatore).
 * Esegue: make -C apps/galleria/test run-test_model
 * GALLERIA_TEST_VERBOSE=1 nell'ambiente per vedere gli APP_LOG (rot(...), storage, settings).
 *
 * model.c e' compilato INALTERATO: persist e timer dallo shim, storage.c/settings.c/rotation.c veri,
 * ui_photo_x e ui_time_photo_changed finti (ui_fake.c) che contano le chiamate. L'album viene
 * popolato con le API pubbliche di storage.c (write_chunk + commit_slot), come fa sync_proto.c.
 *
 * Revisione 29/08 (F1): durante una sync (model_sync_hold(true)) la rotazione e' congelata: tick,
 * shake, focus e impostazioni aggiornano lo stato ma NON leggono persist ne' toccano il bitmap;
 * al rilascio (model_sync_hold(false) o model_album_changed) si applica UNA volta lo stato
 * accumulato. Casi: (a) hold + tick oltre il confine → un solo caricamento al rilascio;
 * (b) slot mostrato svuotato dal PHOTO_BEGIN e ricommittato → un solo reload a model_album_changed;
 * (c) shake/focus/impostazioni sotto hold → applicati solo al rilascio; (d) etichette dei log
 * (rot(sync)/rot(album)) e nessun caricamento se il confine non e' stato superato; (e) hold(false)
 * senza hold → no-op; (f) album vuoto → demo, con la stessa regola; (g) unico slot svuotato sotto
 * hold → niente demo; (h) bitmap assente; (i) model_album_changed azzera s_bad_mask e rilascia l'hold.
 *
 * Revisione perf 04/09/2026 (schema persist 2): lo shake vive SOLO in RAM (D10 rivista: ogni record
 * persist rallenta ogni avvio). model_shake() non chiama piu' storage_write_rotstate, che
 * aggiorna solo la RAM e programma il debounce da 10 s; model_deinit() NON scrive piu' nulla in
 * persist (solo la disiscrizione dal tap service). Caso (j) test_shake_debounce.
 *
 * Isolamento: model.c ha stato static senza reset (s_shake resta se il manifest non e' leggibile,
 * s_bad_mask e s_tap_subscribed non vengono azzerati da model_init): ogni caso scrive rotstate 0
 * prima di model_init, chiama model_album_changed subito dopo (hold e bad_mask a zero) e chiude con
 * model_deinit (tap service disiscritto). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pebble.h>          /* shim host: test/shim/pebble.h (-Ishim davanti a -I../src/c) */
#include "ui_fake.h"
#include "model.h"
#include "storage.h"
#include "settings.h"
#include "rotation.h"
#include "photo_codec.h"
#include "crc.h"

static int g_ok, g_fail;
#define CHECK(cond) do { if (cond) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_EQ(a, b) do { long long _a = (long long)(a), _b = (long long)(b); if (_a == _b) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s = %lld, atteso %s = %lld\n", __FILE__, __LINE__, #a, _a, #b, _b); } } while (0)

#define QUOTA_OK      (1024u * 1024u)        /* 1 MiB: album abilitato */
#define FMT_RAW6      PHOTO_FMT_RAW6_200x228 /* formato nativo dell'host (ui_fake: emery) */
#define PHOTO_LEN     ((uint32_t)RAW6_BYTES) /* 34.200 */
#define PHOTO_CHUNKS  134                    /* 133 x 256 + 152 */
#define LAST_CHUNK_N  152
#define INTERVAL      5                      /* il piu' piccolo ammesso da settings_validate (1 no) */

/* ---- payload deterministico (LCG, come test_storage.c): uguale per tutti gli slot ---- */

static uint8_t  g_photo[PHOTO_LEN];
static uint32_t g_crc;

static uint32_t g_seed = 987654321u;
static uint8_t rnd8(void) {
  g_seed = g_seed * 1103515245u + 12345u;
  return (uint8_t)(g_seed >> 16);
}

static void fill_photo(void) {
  for (uint32_t i = 0; i < PHOTO_LEN; i++) {
    g_photo[i] = rnd8();
  }
  g_crc = crc32_update(0, g_photo, PHOTO_LEN);
}

static uint16_t chunk_len(uint16_t i) {
  return (i == PHOTO_CHUNKS - 1) ? LAST_CHUNK_N : GAL_CHUNK_BYTES;
}

/* Scrive i chunk e committa lo slot (generation + 1), come PHOTO_DATA×N + PHOTO_END. */
static void commit_photo(uint8_t slot) {
  int errors = 0;
  for (uint16_t i = 0; i < PHOTO_CHUNKS; i++) {
    if (storage_write_chunk(slot, i, g_photo + (uint32_t)i * GAL_CHUNK_BYTES, chunk_len(i)) != STORAGE_OK) {
      errors++;
    }
  }
  CHECK_EQ(errors, 0);
  CHECK_EQ(storage_commit_slot(slot, FMT_RAW6, PHOTO_LEN, g_crc, 0x100u + slot), STORAGE_OK);
}

/* ---- tempo: 29/08/2026, ora:minuto ---- */

static struct tm g_tm;

static const struct tm *at(int hour, int minute) {
  memset(&g_tm, 0, sizeof(g_tm));
  g_tm.tm_year = 2026 - 1900;
  g_tm.tm_mon = 8 - 1;
  g_tm.tm_mday = 29;
  g_tm.tm_hour = hour;
  g_tm.tm_min = minute;
  return &g_tm;
}

static uint32_t lmin(int hour, int minute) {
  return rotation_local_minutes(2026, 8, 29, hour, minute);
}

/* Slot atteso in rotazione SEQUENZIALE (calcolo indipendente da rotation.c: order[] filtrato sugli
 * slot VALID nel formato nativo, indice (t/intervallo + shake) mod n). GAL_SLOT_NONE se nessuno. */
static uint8_t expect_slot(uint32_t now_min, uint16_t interval, uint16_t shake) {
  const GalManifest *m = storage_manifest();
  uint8_t seq[GAL_MAX_SLOTS];
  uint8_t n = 0;
  for (uint8_t i = 0; i < GAL_MAX_SLOTS && m->order[i] != GAL_SLOT_NONE; i++) {
    const uint8_t k = m->order[i];
    if (k < GAL_MAX_SLOTS && m->slots[k].state == GAL_SLOT_VALID && m->slots[k].format == FMT_RAW6) {
      seq[n++] = k;
    }
  }
  if (n == 0) {
    return GAL_SLOT_NONE;
  }
  return seq[(now_min / interval + shake) % n];
}

/* Demo attesa (album vuoto): DEMO_COUNT = 2, stessa regola. */
static uint32_t expect_demo(uint32_t now_min, uint16_t interval, uint16_t shake) {
  return ((now_min / interval + shake) % 2u) == 0 ? RESOURCE_ID_DEMO_1_RAW6 : RESOURCE_ID_DEMO_2_RAW6;
}

/* ---- scenario ---- */

static void apply_settings(uint16_t interval, uint8_t order, uint8_t shake_next) {
  GalSettings s = *settings_get();
  s.interval_min = interval;
  s.order = order;
  s.shake_next = shake_next;
  CHECK(settings_apply(&s));
  storage_flush();                           /* niente timer pendenti nel resto del caso */
}

/* Persist vuoto + n foto negli slot 0..n-1 (order[] = 0..n-1), impostazioni: intervallo 5 min,
 * sequenziale, shake attivo, rotstate = 0. Il modello NON e' ancora inizializzato. */
static void fresh(uint8_t nslots) {
  shim_persist_reset();
  shim_set_quota(QUOTA_OK);
  CHECK(storage_init());
  settings_init();
  apply_settings(INTERVAL, GAL_ORDER_SEQUENTIAL, 1);
  const GalRotState rs = { .shake_offset = 0, .crc16 = 0 };
  CHECK(storage_write_rotstate(&rs));
  for (uint8_t k = 0; k < nslots; k++) {
    commit_photo(k);
  }
  CHECK_EQ(storage_valid_slots(), nslots);
  shim_ui_reset();
  shim_reset_write_count();
}

/* model_init (ora reale, silenzioso), reset dell'hold/bad_mask, tick a t0; poi contatori a zero. */
static void boot(int hour, int minute) {
  model_init();
  model_album_changed();
  model_tick(at(hour, minute));
  shim_ui_reset_counters();
  shim_reset_write_count();
}

static void shutdown(void) {
  model_sync_hold(false);
  model_focus(true);
  model_deinit();
}

static int log_is(const char *prefix) {
  return strncmp(shim_log_last(), prefix, strlen(prefix)) == 0;
}

/* ================================ casi ================================ */

/* Inizializzazione e rotazione senza hold: riferimento per i casi successivi. */
static void test_baseline(void) {
  fresh(4);
  model_init();                              /* ora reale: carica uno slot, senza notifica alla UI */
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_photo_changed(), 0);
  CHECK_EQ(shim_ui_resource_calls(), 0);
  CHECK(model_current_slot() < 4);
  CHECK(log_is("rot(init)"));
  CHECK_EQ(shim_accel_tap_subscribes(), 1);  /* shake_next = 1 */
  CHECK(shim_accel_tap_handler() != NULL);
  model_album_changed();
  shim_ui_reset_counters();

  /* tick a 10:00: slot (600/5) mod 4 = 0; poi ogni 5 minuti lo slot successivo, una lettura per
   * cambio e nessuna nei minuti intermedi */
  model_tick(at(10, 0));
  CHECK_EQ(model_current_slot(), expect_slot(lmin(10, 0), INTERVAL, 0));
  CHECK_EQ(model_current_slot(), 0);
  shim_ui_reset_counters();
  model_tick(at(10, 1));
  model_tick(at(10, 4));
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_tick(at(10, 5));
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_last_slot(), 1);
  CHECK_EQ(shim_ui_last_generation(), 1);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK(log_is("rot(tick)"));
  CHECK_EQ(shim_write_count(), 0);           /* mai scritture persist a regime */
  shutdown();
  CHECK_EQ(shim_accel_tap_unsubscribes(), 1);
}

/* (a) hold + tick per piu' minuti oltre il confine: nessuna lettura, nessuna notifica, stato del tempo
 * aggiornato; al rilascio UN solo caricamento dello slot dovuto all'ULTIMO tick e una notifica. */
static void test_hold_tick(void) {
  fresh(4);
  boot(10, 0);
  CHECK_EQ(model_current_slot(), 0);

  const int logs = shim_log_count();
  model_sync_hold(true);
  model_tick(at(10, 5));
  model_tick(at(10, 10));
  model_tick(at(10, 15));
  CHECK_EQ(shim_ui_total_calls(), 0);        /* ne' persist, ne' bitmap, ne' UI */
  CHECK_EQ(model_current_slot(), 0);         /* la foto mostrata resta quella */
  CHECK_EQ(shim_log_count(), logs);          /* nessun rot(tick) */

  model_sync_hold(false);
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_resource_calls(), 0);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK_EQ(shim_ui_last_slot(), expect_slot(lmin(10, 15), INTERVAL, 0));
  CHECK_EQ(shim_ui_last_slot(), 3);          /* (615/5) mod 4: il tempo e' avanzato durante l'hold */
  CHECK_EQ(model_current_slot(), 3);
  CHECK(log_is("rot(sync)"));

  /* un secondo rilascio non fa nulla */
  const int n = shim_log_count();
  model_sync_hold(false);
  CHECK_EQ(shim_ui_total_calls(), 2);
  CHECK_EQ(shim_log_count(), n);

  /* hold(true) ripetuto (sync.c lo chiama dopo OGNI messaggio in SYNCING) e' idempotente */
  model_sync_hold(true);
  model_sync_hold(true);
  model_tick(at(10, 20));
  CHECK_EQ(shim_ui_total_calls(), 2);
  model_sync_hold(false);
  CHECK_EQ(shim_ui_persist_calls(), 2);
  CHECK_EQ(shim_ui_last_slot(), 0);
  CHECK_EQ(shim_write_count(), 0);
  shutdown();
}

/* (b) PHOTO_BEGIN svuota nel manifest lo slot mostrato (storage_clear_slot) mentre la sync e' attiva:
 * il tick non deve cambiare foto (senza hold rotation_slot sceglierebbe un altro slot: n = 3);
 * PHOTO_END lo ricommitta con generation nuova; a fine sync model_album_changed ricarica UNA volta. */
static void test_hold_slot_replaced(void) {
  /* b1: il tempo avanza durante il trasferimento → al rilascio lo slot dovuto al nuovo minuto */
  fresh(4);
  boot(10, 0);
  const uint8_t k = model_current_slot();
  CHECK_EQ(k, 0);
  model_sync_hold(true);
  CHECK_EQ(storage_clear_slot(k), STORAGE_OK);
  CHECK_EQ(storage_manifest()->slots[k].state, GAL_SLOT_EMPTY);
  model_sync_hold(true);                     /* prv_album_flush dopo il PHOTO_BEGIN: ancora SYNCING */
  model_tick(at(10, 0));                     /* stesso minuto: senza hold cambierebbe (slot 1) */
  model_tick(at(10, 5));
  CHECK_EQ(shim_ui_total_calls(), 0);
  CHECK_EQ(model_current_slot(), k);
  commit_photo(k);                           /* PHOTO_END: generation 2 */
  CHECK_EQ(storage_manifest()->slots[k].generation, 2);
  model_sync_hold(true);                     /* prv_album_flush dopo il PHOTO_END: ancora SYNCING */
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_album_changed();                     /* SYNC_DONE con manifest cambiato */
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK_EQ(shim_ui_last_slot(), expect_slot(lmin(10, 5), INTERVAL, 0));
  CHECK_EQ(shim_ui_last_slot(), 1);
  CHECK(log_is("rot(album)"));
  model_sync_hold(false);                    /* hold gia' rilasciato da model_album_changed */
  CHECK_EQ(shim_ui_total_calls(), 2);
  shutdown();

  /* b2: stesso minuto → stesso slot ma generation nuova: va riletto (una volta) */
  fresh(4);
  boot(10, 0);
  model_sync_hold(true);
  CHECK_EQ(storage_clear_slot(0), STORAGE_OK);
  model_tick(at(10, 1));
  commit_photo(0);
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_album_changed();
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_last_slot(), 0);
  CHECK_EQ(shim_ui_last_generation(), 2);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  model_tick(at(10, 2));
  CHECK_EQ(shim_ui_total_calls(), 2);        /* stessa foto, stessa generation: nessuna lettura */
  shutdown();

  /* b3: sostituito uno slot NON mostrato → al rilascio nessuna rilettura se lo slot dovuto e' lo stesso */
  fresh(4);
  boot(10, 0);
  model_sync_hold(true);
  CHECK_EQ(storage_clear_slot(2), STORAGE_OK);
  model_tick(at(10, 0));                     /* senza hold: n = 3 → (120 mod 3) = 0: slot 0, ma non e' garantito */
  commit_photo(2);
  model_album_changed();
  CHECK_EQ(shim_ui_persist_calls(), 0);      /* slot 0 generation 1: gia' nel bitmap */
  CHECK_EQ(shim_ui_photo_changed(), 0);
  shutdown();
}

/* (c) shake (dal tap handler registrato da model.c), focus e impostazioni durante l'hold: lo stato
 * viene aggiornato ma applicato solo al rilascio; fuori focus il rilascio non carica nulla. */
static void test_hold_shake_focus_settings(void) {
  fresh(4);
  boot(10, 0);
  AccelTapHandler tap = shim_accel_tap_handler();
  CHECK(tap != NULL);

  model_sync_hold(true);
  tap(ACCEL_AXIS_X, 1);                      /* scossa: s_shake = 1 */
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_focus(false);
  model_focus(true);                         /* recupero: bloccato dall'hold */
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_sync_hold(false);
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_last_slot(), expect_slot(lmin(10, 0), INTERVAL, 1));
  CHECK_EQ(shim_ui_last_slot(), 1);          /* (120 + 1) mod 4 */
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK(log_is("rot(sync)"));

  /* due scosse sotto hold → una sola applicazione (+2) */
  shim_ui_reset_counters();
  model_sync_hold(true);
  tap(ACCEL_AXIS_Y, -1);
  tap(ACCEL_AXIS_Z, 1);
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_sync_hold(false);
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_last_slot(), 3);          /* (120 + 3) mod 4 */
  CHECK_EQ(shim_ui_photo_changed(), 1);

  /* fuori focus al rilascio: niente; il recupero avviene al ritorno in primo piano */
  shim_ui_reset_counters();
  model_sync_hold(true);
  model_tick(at(10, 5));
  model_focus(false);
  model_sync_hold(false);
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_tick(at(10, 10));                    /* coperta: nessun cambio (D10) */
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_focus(true);
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_last_slot(), expect_slot(lmin(10, 10), INTERVAL, 3));
  CHECK_EQ(shim_ui_last_slot(), 1);          /* (122 + 3) mod 4 */
  CHECK(log_is("rot(focus)"));
  model_sync_hold(false);                    /* l'hold era gia' stato rilasciato: no-op */
  CHECK_EQ(shim_ui_total_calls(), 2);

  /* impostazioni sotto hold: intervallo 15 → applicato al rilascio */
  shim_ui_reset_counters();
  model_sync_hold(true);
  apply_settings(15, GAL_ORDER_SEQUENTIAL, 1);
  model_settings_changed();
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_sync_hold(false);
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_last_slot(), expect_slot(lmin(10, 10), 15, 3));
  CHECK_EQ(shim_ui_last_slot(), 3);          /* (610/15 = 40, + 3) mod 4 */
  CHECK(log_is("rot(sync)"));

  /* shake disattivato sotto hold: tap service disiscritto subito (non e' rotazione), scosse ignorate */
  shim_ui_reset_counters();
  model_sync_hold(true);
  apply_settings(15, GAL_ORDER_SEQUENTIAL, 0);
  model_settings_changed();
  CHECK_EQ(shim_accel_tap_unsubscribes(), 1);
  CHECK(shim_accel_tap_handler() == NULL);
  model_shake();                             /* shake_next = 0: ignorata */
  model_sync_hold(false);
  CHECK_EQ(shim_ui_total_calls(), 0);        /* stesso slot 3 */
  const int w_before = shim_write_count();
  shutdown();
  CHECK_EQ(shim_accel_tap_unsubscribes(), 1);   /* gia' disiscritto: deinit non lo rifa' */
  /* revisione perf 04/09: model_deinit() non scrive piu' in persist (l'uscita non paga una
   * scansione del file) e lo shake NON viene persistito da nessuna parte (ogni record in piu'
   * rallenta ogni avvio): il manifest in flash porta shake_offset 0 anche dopo 3 scosse */
  CHECK_EQ(shim_write_count(), w_before);
  CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));    /* schema 2: la chiave 2 non esiste piu' */
  GalRotState rs;
  CHECK(storage_read_rotstate(&rs));
  CHECK_EQ(rs.shake_offset, 0);
  CHECK_EQ(storage_manifest()->shake_offset, 0);
  {
    GalManifest onflash;
    CHECK_EQ(persist_read_data(GAL_KEY_MANIFEST, &onflash, sizeof(onflash)), (int)sizeof(onflash));
    CHECK_EQ(onflash.shake_offset, 0);          /* mai in persist: solo RAM */
  }
}

/* (d) hold senza cambi di manifest: se il confine non e' stato superato il rilascio non fa nulla e non
 * logga; se e' stato superato, una rotazione con etichetta "sync". */
static void test_hold_release_labels(void) {
  fresh(4);
  boot(10, 0);
  int n = shim_log_count();
  model_sync_hold(true);
  model_tick(at(10, 1));
  model_tick(at(10, 4));
  model_sync_hold(false);
  CHECK_EQ(shim_ui_total_calls(), 0);
  CHECK_EQ(shim_log_count(), n);             /* nessun rot(...) */

  n = shim_log_count();
  model_sync_hold(true);
  model_tick(at(10, 5));
  model_sync_hold(false);
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_last_slot(), 1);
  CHECK_EQ(shim_log_count(), n + 1);
  CHECK(log_is("rot(sync): t="));
  CHECK(strstr(shim_log_last(), " slot=1 ") != NULL);
  CHECK(strstr(shim_log_last(), " demo=255 ") != NULL);
  CHECK(strstr(shim_log_last(), " valid=4 ") != NULL);
  shutdown();
}

/* (e) hold(false) senza hold precedente: nessun effetto (ne' letture, ne' log), anche dopo un tick. */
static void test_release_without_hold(void) {
  fresh(4);
  boot(10, 0);
  const int n = shim_log_count();
  model_sync_hold(false);
  model_sync_hold(false);
  CHECK_EQ(shim_ui_total_calls(), 0);
  CHECK_EQ(shim_log_count(), n);
  model_tick(at(10, 5));                     /* senza hold il tick ruota da solo */
  CHECK_EQ(shim_ui_persist_calls(), 1);
  model_sync_hold(false);
  CHECK_EQ(shim_ui_total_calls(), 2);
  CHECK_EQ(shim_log_count(), n + 1);
  shutdown();
}

/* (f) album vuoto: demo da risorsa con la stessa rotazione; l'hold congela anche la demo. */
static void test_hold_demo(void) {
  fresh(0);
  model_init();
  CHECK_EQ(shim_ui_resource_calls(), 1);
  CHECK_EQ(shim_ui_persist_calls(), 0);
  CHECK_EQ(model_current_slot(), GAL_SLOT_NONE);
  model_album_changed();
  model_tick(at(10, 0));
  CHECK_EQ(shim_ui_last_resource(), expect_demo(lmin(10, 0), INTERVAL, 0));
  CHECK_EQ(shim_ui_last_resource(), RESOURCE_ID_DEMO_1_RAW6);
  shim_ui_reset_counters();

  model_sync_hold(true);
  model_tick(at(10, 5));                     /* demo 2 dovuta */
  model_tick(at(10, 10));                    /* demo 1 di nuovo */
  model_tick(at(10, 15));                    /* demo 2 */
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_sync_hold(false);
  CHECK_EQ(shim_ui_resource_calls(), 1);
  CHECK_EQ(shim_ui_persist_calls(), 0);
  CHECK_EQ(shim_ui_last_resource(), RESOURCE_ID_DEMO_2_RAW6);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK(log_is("rot(sync)"));
  CHECK(strstr(shim_log_last(), " slot=255 demo=1 ") != NULL);

  /* prima foto arrivata durante la sync: al SYNC_DONE model_album_changed passa dalla demo allo slot */
  shim_ui_reset_counters();
  model_sync_hold(true);
  commit_photo(5);
  model_tick(at(10, 20));
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_album_changed();
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_last_slot(), 5);
  CHECK_EQ(shim_ui_resource_calls(), 0);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK_EQ(model_current_slot(), 5);
  shutdown();
}

/* (g) unico slot VALID svuotato dal PHOTO_BEGIN sotto hold: il tick NON carica la demo (senza hold la
 * sequenza vuota porterebbe alla demo a meta' trasferimento); al ricommit una sola rilettura. */
static void test_hold_single_slot(void) {
  fresh(1);
  boot(10, 0);
  CHECK_EQ(model_current_slot(), 0);
  model_sync_hold(true);
  CHECK_EQ(storage_clear_slot(0), STORAGE_OK);
  CHECK_EQ(storage_valid_slots(), 0);
  model_tick(at(10, 5));
  model_tick(at(10, 10));
  CHECK_EQ(shim_ui_total_calls(), 0);
  CHECK_EQ(shim_ui_resource_calls(), 0);
  CHECK_EQ(model_current_slot(), 0);
  commit_photo(0);
  model_album_changed();
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_last_slot(), 0);
  CHECK_EQ(shim_ui_last_generation(), 2);
  CHECK_EQ(shim_ui_resource_calls(), 0);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  shutdown();

  /* variante: la sync abortisce (timeout) con lo slot ancora vuoto → rilascio senza manifest nuovo:
   * ora SI passa alla demo (una volta), come dopo un'eliminazione */
  fresh(1);
  boot(10, 0);
  model_sync_hold(true);
  CHECK_EQ(storage_clear_slot(0), STORAGE_OK);
  model_tick(at(10, 5));
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_sync_hold(false);
  CHECK_EQ(shim_ui_resource_calls(), 1);
  CHECK_EQ(shim_ui_persist_calls(), 0);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK_EQ(model_current_slot(), GAL_SLOT_NONE);
  shutdown();
}

/* (h) bitmap assente (heap insufficiente): mai caricamenti, con o senza hold. */
static void test_no_bitmap(void) {
  fresh(4);
  shim_ui_set_size(0, 0);
  boot(10, 0);
  /* (nessun CHECK su model_current_slot: senza bitmap prv_update esce prima di toccarlo, quindi il
   *  valore sarebbe solo quello ereditato dal caso precedente) */
  model_tick(at(10, 5));
  model_sync_hold(true);
  model_tick(at(10, 10));
  model_sync_hold(false);
  model_album_changed();
  CHECK_EQ(shim_ui_total_calls(), 0);
  shutdown();
}

/* (i) slot illeggibile → saltato fino al riavvio (s_bad_mask), la foto precedente e' persa (bitmap
 * azzerato) e si carica il successivo; model_album_changed azzera la maschera E rilascia l'hold. */
static void test_bad_slot_and_album_changed(void) {
  fresh(2);
  boot(10, 0);                               /* slot 0 */
  CHECK_EQ(model_current_slot(), 0);
  shim_ui_set_persist_fail_mask(1u << 1);
  model_tick(at(10, 5));                     /* dovuto lo slot 1: fallisce → bitmap vuoto → slot 0 */
  CHECK_EQ(shim_ui_persist_calls(), 2);
  CHECK_EQ(shim_ui_last_slot(), 0);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK_EQ(model_current_slot(), 0);
  CHECK(strstr(shim_log_last(), " bad=2") != NULL);
  shim_ui_reset_counters();
  model_tick(at(10, 15));                    /* slot 1 ancora saltato: sequenza = {0}, gia' mostrato */
  CHECK_EQ(shim_ui_total_calls(), 0);

  shim_ui_set_persist_fail_mask(0);          /* la foto e' stata risincronizzata */
  model_sync_hold(true);
  model_tick(at(10, 25));                    /* 125 mod 2 = 1 */
  CHECK_EQ(shim_ui_total_calls(), 0);
  model_album_changed();                     /* bad_mask = 0 e hold rilasciato */
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_last_slot(), 1);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK(strstr(shim_log_last(), " bad=0") != NULL);
  model_tick(at(10, 30));
  CHECK_EQ(shim_ui_persist_calls(), 2);      /* hold rilasciato: il tick ruota di nuovo */
  CHECK_EQ(shim_ui_last_slot(), 0);
  shutdown();
}

/* (j) revisione perf 04/09/2026: ogni scossa aggiorna la RAM e programma il debounce di storage.c;
 * model_deinit() non scrive nulla; il record (chiave 1, con lo shake dentro) lo scrive il timer. */
static void test_shake_debounce(void) {
  /* Perf 04/09/2026 (D10 rivista): lo shake vive SOLO in RAM. Nessun timer, nessuna scrittura,
   * nessun record in piu' nel file persist; al riavvio la rotazione torna al programma. */
  fresh(4);
  boot(10, 0);
  AccelTapHandler tap = shim_accel_tap_handler();
  CHECK(tap != NULL);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(storage_manifest()->shake_offset, 0);
  const int reg0 = shim_timer_registrations();
  shim_ui_reset_counters();

  tap(ACCEL_AXIS_X, 1);                      /* scossa: s_shake = 1, foto successiva subito */
  CHECK_EQ(shim_write_count(), 0);           /* mai una scrittura nel gestore dello shake */
  CHECK(!shim_timer_pending());              /* e nemmeno un timer: niente da salvare */
  CHECK_EQ(shim_timer_registrations(), reg0);
  CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));
  CHECK_EQ(storage_manifest()->shake_offset, 0);       /* il manifest non lo porta piu' */
  CHECK(shim_ui_total_calls() > 0);
  CHECK_EQ(shim_ui_last_slot(), expect_slot(lmin(10, 0), INTERVAL, 1));

  /* tre scosse in fila: sempre solo RAM */
  tap(ACCEL_AXIS_Y, -1);
  tap(ACCEL_AXIS_Z, 1);
  CHECK_EQ(shim_timer_registrations(), reg0);
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(model_current_slot(), expect_slot(lmin(10, 0), INTERVAL, 3));

  /* deinit: solo tap service, nessuna scrittura persist, nessun timer */
  const int unsub = shim_accel_tap_unsubscribes();
  model_deinit();
  storage_flush();                                     /* come main.c in deinit */
  CHECK_EQ(shim_accel_tap_unsubscribes(), unsub + 1);
  CHECK_EQ(shim_write_count(), 0);
  CHECK(!shim_timer_pending());
  CHECK(!shim_key_exists(GAL_KEY_ROTSTATE));

  /* riavvio: l'offset riparte da 0 e la rotazione torna al programma (slot atteso con shake 0) */
  CHECK(storage_init());
  settings_init();
  model_init();
  model_album_changed();
  shim_ui_reset_counters();
  model_tick(at(10, 0));
  CHECK_EQ(storage_manifest()->shake_offset, 0);       /* mai arrivato in flash */
  CHECK_EQ(model_current_slot(), expect_slot(lmin(10, 0), INTERVAL, 0));
  shutdown();
}

/* ================================ main ================================ */

static void run(const char *name, void (*fn)(void)) {
  const int ok0 = g_ok, fail0 = g_fail;
  fn();
  printf("  %-28s %4d ok, %d falliti\n", name, g_ok - ok0, g_fail - fail0);
}

int main(void) {
  shim_set_log(getenv("GALLERIA_TEST_VERBOSE") != NULL);
  fill_photo();
  run("baseline",                 test_baseline);
  run("hold_tick",                test_hold_tick);
  run("hold_slot_replaced",       test_hold_slot_replaced);
  run("hold_shake_focus_settings", test_hold_shake_focus_settings);
  run("hold_release_labels",      test_hold_release_labels);
  run("release_without_hold",     test_release_without_hold);
  run("hold_demo",                test_hold_demo);
  run("hold_single_slot",         test_hold_single_slot);
  run("no_bitmap",                test_no_bitmap);
  run("bad_slot_album_changed",   test_bad_slot_and_album_changed);
  run("shake_debounce",           test_shake_debounce);
  printf("test_model: %d ok, %d falliti\n", g_ok, g_fail);
  return g_fail ? 1 : 0;
}

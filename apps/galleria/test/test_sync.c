/* test_sync.c — test host ADVERSARIALE di sync.c (gcc + shim/pebble.h + shim/ui_fake.c; nessun
 * ARM, nessun emulatore). Esegue: make -C apps/galleria/test run-test_sync
 * GALLERIA_TEST_VERBOSE=1 nell'ambiente per vedere gli APP_LOG di sync.c/storage.c/model.c.
 *
 * sync.c e' compilato INALTERATO: AppMessage e dizionari vengono dallo shim host
 * (shim/pebble_shim.c: outbox di ESATTAMENTE outbox_size byte, dict_write_* che non entra ritorna
 * DICT_NOT_ENOUGH_STORAGE senza scrivere, una sola app_message_open, messaggio "in volo" finche' il
 * test non consegna l'esito). sync_proto.c, storage.c, settings.c, model.c e rotation.c sono quelli
 * VERI (F1 end-to-end: l'hold della rotazione si osserva sulle chiamate finte di ui_photo/ui_time).
 *
 * Copre (spec S7 §2.7): F4 (outbox esatto 119 B, HELLO completo — con OPEN_MS decodificata dal
 * dizionario e forzata ≠ 0 dall'orologio finto dello shim (v1.9, F13/F49), anche con l'album
 * disabilitato e fra le tuple superstiti del tripwire —, tripwire "incompleto" con outbox forzato
 * a 100 dopo l'apertura; JS_READY → HELLO senza ricerche persist), F2 (timer di silenzio: reschedule, scaduto-non-consumato,
 * callback stantio, timeout vero, nessun orfano), F1 (rotazione congelata durante la sostituzione
 * dello slot mostrato e un solo ricaricamento a fine sync), coda outbox (4 messaggi, il 5o scartato,
 * drenaggio, NOT_CONNECTED che svuota, SEND_TIMEOUT che prosegue, outbox_begin fallita), decodifica
 * per lunghezza di tupla (int32 del JS, uint8/uint16/uint32, saturazione a 255, tipi sbagliati,
 * byte array), negoziazione del chunk, HELLO, STATUS.REPLY_TO, avanzamento, sync_env_settings_changed,
 * sync_deinit e app_message_open che fallisce (S7: sync muta, coda che non si blocca, riapertura).
 *
 * Il runner controlla a ogni scenario che shim_am_sent_overflow() sia 0: lo shim registra i primi
 * SHIM_AM_SENT_MAX (64) messaggi spediti e oltre quel tetto shim_am_sent()/shim_am_last_sent()
 * ritornano NULL, cosi' nessuna asserzione guarda un messaggio diverso da quello che crede.
 *
 * Ogni scenario riparte da zero (fresh(): shim_persist_reset + shim_am_reset + shim_ui_reset +
 * storage_init + settings_init; start(): model_init + sync_init).
 *
 * LIMITI dello shim (nel report della sessione): un solo AppTimer per processo, quindi il debounce
 * delle impostazioni di storage.c e il timer di silenzio di sync.c non possono essere pendenti
 * insieme (sull'orologio sono due timer distinti): gli scenari che guardano il timer non applicano
 * impostazioni e viceversa (storage_flush() subito dopo ogni settings_apply). Non sono modellati il
 * costo di heap di app_message_open, il framing/gli ACK del trasporto e l'asincronia dei callback
 * (qui sono sincroni). */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pebble.h>          /* shim host: test/shim/pebble.h (-Ishim davanti a -I../src/c) */
#include "ui_fake.h"
#include "sync.h"
#include "sync_proto.h"
#include "model.h"
#include "storage.h"
#include "settings.h"
#include "rotation.h"
#include "photo_codec.h"
#include "crc.h"

static int g_ok, g_fail;
#define CHECK(cond) do { if (cond) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_EQ(a, b) do { long long _a = (long long)(a), _b = (long long)(b); if (_a == _b) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s = %lld, atteso %s = %lld\n", __FILE__, __LINE__, #a, _a, #b, _b); } } while (0)

#define QUOTA_OK      (1024u * 1024u)        /* 1 MiB: album abilitato (GAL_MIN_QUOTA) */
#define QUOTA_BAD     4096u                  /* album disabilitato */
#define FMT_RAW6      PHOTO_FMT_RAW6_200x228
#define FMT_RAW1      PHOTO_FMT_RAW1_144x168
#define PHOTO_LEN     ((uint32_t)RAW6_BYTES) /* 34.200 */
#define PHOTO_CHUNKS  134                    /* 133 x 256 + 152 */
#define LAST_CHUNK_N  152
#define MAX_CHUNK     4096u                  /* SYNC_MAX_CHUNK_BYTES */
#define INBOX_MAX_STD 8200u                  /* app Core / emulatore */
#define OVERHEAD      41u                    /* dict_calc_buffer_size(4, 4, 4, 4, 0) */
#define SLACK         16u                    /* SYNC_INBOX_SLACK */
#define OUTBOX_EXACT  119u                   /* F4: dict_calc_buffer_size del HELLO (v1.9: + OPEN_MS) */
#define INBOX_EMERY   (OVERHEAD + SLACK + MAX_CHUNK)   /* 4.153 */

/* ---- payload deterministici (LCG, come test_sync_proto.c) ---- */

static uint8_t  g_photo[PHOTO_LEN];
static uint8_t  g_photo2[PHOTO_LEN];
static uint32_t g_crc_a, g_crc_b;

static uint32_t g_seed = 987654321u;
static uint8_t rnd8(void) {
  g_seed = g_seed * 1103515245u + 12345u;
  return (uint8_t)(g_seed >> 16);
}

static void fill_photos(void) {
  for (uint32_t i = 0; i < PHOTO_LEN; i++) {
    g_photo[i] = rnd8();
  }
  for (uint32_t i = 0; i < PHOTO_LEN; i++) {
    g_photo2[i] = (uint8_t)(rnd8() ^ 0x5Au);
  }
  g_crc_a = crc32_update(0, g_photo, PHOTO_LEN);
  g_crc_b = crc32_update(0, g_photo2, PHOTO_LEN);
}

/* ---- tempo: 29/08/2026, ora:minuto (per model_tick) ---- */

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

/* ---- helper di scenario ---- */

/* Persist vuoto, AppMessage chiusa, ui finte azzerate, storage/settings reinizializzati.
 * Il modello e la sync NON sono ancora avviati (start()). */
static void fresh(uint32_t quota, uint32_t inbox_max, uint8_t fmt) {
  sync_deinit();                             /* chiude lo scenario precedente: timer + callback */
  model_sync_hold(false);
  model_focus(true);
  model_deinit();
  shim_fail_writes_after(-1);
  shim_fail_writes_code(E_OUT_OF_STORAGE);
  storage_flush();                           /* svuota il debounce sul persist VECCHIO */
  shim_persist_reset();
  shim_am_reset();
  shim_ui_reset();
  shim_set_quota(quota);
  shim_am_set_inbox_max(inbox_max);
  shim_ui_set_native_format(fmt);
  (void)storage_init();
  settings_init();
}

/* Scrive i chunk e committa lo slot (come PHOTO_DATA x N + PHOTO_END). */
static void seed_photo(uint8_t slot, const uint8_t *p, uint32_t crc, uint32_t photo_id) {
  int errors = 0;
  for (uint16_t i = 0; i < PHOTO_CHUNKS; i++) {
    const uint16_t n = (i == PHOTO_CHUNKS - 1) ? LAST_CHUNK_N : GAL_CHUNK_BYTES;
    if (storage_write_chunk(slot, i, p + (uint32_t)i * GAL_CHUNK_BYTES, n) != STORAGE_OK) {
      errors++;
    }
  }
  CHECK_EQ(errors, 0);
  CHECK_EQ(storage_commit_slot(slot, FMT_RAW6, PHOTO_LEN, crc, photo_id), STORAGE_OK);
}

/* model_init + sync_init; contatori, log e write count azzerati (le righe di init non contano). */
static void start(void) {
  const GalRotState rs = { .shake_offset = 0, .crc16 = 0 };
  CHECK(storage_write_rotstate(&rs));
  model_init();
  model_album_changed();                     /* hold e bad_mask a zero (model.c ha stato static) */
  model_focus(true);
  sync_init();
  shim_ui_reset_counters();
  shim_reset_write_count();
  shim_log_reset();
}

/* v1.9 (F13/F49): forza storage_open_ms() = ms con l'orologio finto dello shim (le due letture di
 * time_ms in storage_init distano `ms`), poi ferma l'orologio. Dopo fresh() e prima di start(). */
static void force_open_ms(uint16_t ms) {
  shim_set_time_ms(7, 100);
  shim_set_time_step_ms((int32_t)ms);
  (void)storage_init();
  shim_set_time_step_ms(0);
  CHECK_EQ(storage_open_ms(), ms);
}

#define HELLO_FIELDS (SHIM_S_MSG | SHIM_S_PROTO | SHIM_S_FORMAT | SHIM_S_MAX_CHUNK | SHIM_S_CRC | SHIM_S_OPEN_MS)

/* Consegna l'esito positivo a tutti i messaggi in volo (il telefono ACKa tutto). */
static void ack_all(void) {
  int guard = 0;
  while (shim_am_in_flight() && guard++ < 64) {
    CHECK(shim_am_outbox_sent());
  }
  CHECK(guard < 64);
}

/* Accesso diretto all'ultimo messaggio spedito (o all'i-esimo). Se quel messaggio non e' stato
 * REGISTRATO dallo shim (oltre SHIM_AM_SENT_MAX) l'hook ritorna NULL: qui la cosa viene segnalata
 * come fallimento e si prosegue su una copia azzerata, invece di dereferenziare NULL a meta' test. */
static const ShimSentMsg g_no_msg;

static const ShimSentMsg *last(void) {
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  return m ? m : &g_no_msg;
}

static const ShimSentMsg *nth(int i) {
  const ShimSentMsg *m = shim_am_sent(i);
  CHECK(m != NULL);
  return m ? m : &g_no_msg;
}

/* ---- costruzione dei messaggi in ingresso (interi come il JS: int32) ---- */

static void in_msg(uint8_t msg) {
  shim_in_begin();
  CHECK(shim_in_int32(MESSAGE_KEY_MSG, (int32_t)msg));
}

static bool deliver(void) {
  return shim_am_deliver_built();
}

/* JS_READY: risponde con HELLO. */
static void js_ready(void) {
  in_msg(SYNC_MSG_JS_READY);
  CHECK(deliver());
}

/* SYNC_REQUEST{COUNT}: porta in SYNCING (risposta SYNC_READY). */
static void sync_request(uint8_t count) {
  in_msg(SYNC_MSG_SYNC_REQUEST);
  CHECK(shim_in_int32(MESSAGE_KEY_COUNT, count));
  CHECK(deliver());
}

/* ALBUM_DELETE su uno slot fuori intervallo: STATUS BAD_FORMAT{slot}, nessun effetto sul persist.
 * Serve a generare messaggi in uscita DISTINGUIBILI (slot 12..255) senza toccare l'album. */
static void ping(uint8_t tag) {
  in_msg(SYNC_MSG_ALBUM_DELETE);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, tag));
  CHECK(deliver());
}

static void photo_begin(uint8_t slot, uint32_t photo_id, uint8_t fmt, uint32_t length, uint32_t crc) {
  in_msg(SYNC_MSG_PHOTO_BEGIN);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, slot));
  CHECK(shim_in_int32(MESSAGE_KEY_PHOTO_ID, (int32_t)photo_id));
  CHECK(shim_in_int32(MESSAGE_KEY_FORMAT, fmt));
  CHECK(shim_in_int32(MESSAGE_KEY_LENGTH, (int32_t)length));
  CHECK(shim_in_int32(MESSAGE_KEY_CRC, (int32_t)crc));
  CHECK(deliver());
}

static void photo_data(uint8_t slot, uint32_t off, const uint8_t *p, uint16_t n) {
  in_msg(SYNC_MSG_PHOTO_DATA);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, slot));
  CHECK(shim_in_int32(MESSAGE_KEY_OFFSET, (int32_t)off));
  CHECK(shim_in_bytes(MESSAGE_KEY_DATA, p, n));
  CHECK(deliver());
}

static void photo_end(uint8_t slot) {
  in_msg(SYNC_MSG_PHOTO_END);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, slot));
  CHECK(deliver());
}

/* Foto intera a chunk da `chunk` byte, ACK dopo ogni messaggio. */
static int send_photo(uint8_t slot, uint32_t photo_id, const uint8_t *p, uint32_t crc, uint16_t chunk) {
  int msgs = 0;
  photo_begin(slot, photo_id, FMT_RAW6, PHOTO_LEN, crc);
  ack_all();
  for (uint32_t off = 0; off < PHOTO_LEN; off += chunk) {
    const uint32_t rem = PHOTO_LEN - off;
    const uint16_t n = (rem > chunk) ? chunk : (uint16_t)rem;
    photo_data(slot, off, p + off, n);
    ack_all();
    msgs++;
  }
  photo_end(slot);
  ack_all();
  return msgs;
}

/* ================================ casi ================================ */

/* --- init: dimensioni esatte (F4), una sola apertura, callback prima di open --- */
static void test_init_sizes(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  CHECK_EQ(shim_am_open_count(), 0);
  start();
  CHECK_EQ(shim_am_open_count(), 1);
  CHECK(shim_am_is_open());
  CHECK_EQ(shim_am_last_open_result(), APP_MSG_OK);
  CHECK_EQ(shim_am_callbacks_registered(), 4);
  /* F4: outbox ESATTO = dict_calc_buffer_size del HELLO = 119 B (v1.9: + OPEN_MS u16) */
  CHECK_EQ(shim_am_outbox_size(), OUTBOX_EXACT);
  CHECK_EQ(dict_calc_buffer_size(7, (size_t)1, (size_t)1, (size_t)1, (size_t)2, (size_t)2, (size_t)2,
                                 (size_t)SYNC_SLOTS_BYTES), OUTBOX_EXACT);
  CHECK_EQ(1u + 7u * 7u + SYNC_HELLO_VALUE_BYTES, OUTBOX_EXACT);
  /* una tupla in piu' NON entrerebbe: il tripwire deve scattare, non consumare margine */
  CHECK_EQ(dict_calc_buffer_size(8, (size_t)1, (size_t)1, (size_t)1, (size_t)2, (size_t)2, (size_t)2,
                                 (size_t)SYNC_SLOTS_BYTES, (size_t)1), 127u);
  CHECK(dict_calc_buffer_size(8, (size_t)1, (size_t)1, (size_t)1, (size_t)2, (size_t)2, (size_t)2,
                              (size_t)SYNC_SLOTS_BYTES, (size_t)1) > OUTBOX_EXACT);
  /* inbox: overhead (41) + slack (16) + chunk di piattaforma (4.096) = 4.153 su emery */
  CHECK_EQ(dict_calc_buffer_size(4, (size_t)4, (size_t)4, (size_t)4, (size_t)0), OVERHEAD);
  CHECK_EQ(shim_am_inbox_size(), INBOX_EMERY);
  CHECK_EQ(shim_am_inbox_size(), 4153u);
  CHECK_EQ(sync_proto_max_chunk(), MAX_CHUNK);
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_log_warnings(), 0);
  /* sync_init due volte: nessuna seconda apertura (s_inited) */
  sync_init();
  CHECK_EQ(shim_am_open_count(), 1);
  CHECK_EQ(shim_am_callbacks_registered(), 4);
  /* una seconda app_message_open, se qualcuno la chiamasse, fallirebbe: nessuna close nell'SDK */
  CHECK_EQ(app_message_open(1000, 100), APP_MSG_INVALID_STATE);
  CHECK_EQ(shim_am_inbox_size(), INBOX_EMERY);   /* dimensioni invariate */

  /* flint: raw1 3.024 B -> chunk di piattaforma 3.072, inbox 3.129 */
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW1);
  start();
  CHECK_EQ(shim_am_inbox_size(), OVERHEAD + SLACK + 3072u);
  CHECK_EQ(shim_am_inbox_size(), 3129u);
  CHECK_EQ(shim_am_outbox_size(), OUTBOX_EXACT);   /* l'outbox non dipende dalla piattaforma */
  CHECK_EQ(sync_proto_max_chunk(), 3072u);
}

/* --- HELLO: contenuto e dimensione esatta --- */
static void test_hello(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  force_open_ms(2150);                       /* il numero di campo del 04/09 (file gonfio) */
  start();
  shim_lookup_reset();
  js_ready();
  CHECK_EQ(shim_lookup_count(), 0);          /* JS_READY → HELLO: solo RAM, nessuna ricerca persist (F10) */
  CHECK_EQ(shim_am_sent_count(), 1);
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->msg, SYNC_MSG_HELLO);
    CHECK_EQ(m->tuples, 7);                  /* MSG, PROTO, FORMAT, MAX_CHUNK, CRC, OPEN_MS, SLOTS */
    CHECK_EQ(m->fields, HELLO_FIELDS | SHIM_S_SLOTS);
    CHECK(m->fields & SHIM_S_OPEN_MS);       /* v1.9 (F13): OPEN_MS sul filo, con la chiave giusta... */
    CHECK_EQ(m->open_ms, 2150);              /* ...e il valore di storage_open_ms (u16) */
    CHECK_EQ(m->open_ms, storage_open_ms());
    CHECK_EQ(m->bytes, OUTBOX_EXACT);        /* il HELLO riempie l'outbox al byte */
    CHECK_EQ(m->proto, SYNC_PROTO_VERSION);
    CHECK_EQ(m->format, FMT_RAW6);
    CHECK_EQ(m->max_chunk, MAX_CHUNK);
    CHECK_EQ(m->slots_len, SYNC_SLOTS_BYTES);
    CHECK_EQ(m->fields & SHIM_S_REPLY_TO, 0);/* REPLY_TO solo negli STATUS */
    CHECK_EQ(m->crc, crc16_ccitt((const uint8_t *)settings_get(), (uint32_t)(sizeof(GalSettings) - 2)));
    int nonzero = 0;
    for (int i = 0; i < SYNC_SLOTS_BYTES; i++) {
      nonzero += (m->slots[i] != 0);
    }
    CHECK_EQ(nonzero, 0);                    /* album vuoto: 12 x {0, crc 0} */
  }
  CHECK_EQ(shim_log_warnings(), 0);          /* nessun tripwire: il HELLO entra tutto */
  CHECK(shim_am_in_flight());
  ack_all();
  CHECK(!shim_am_in_flight());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK(!shim_timer_pending());              /* fuori da SYNCING nessun timer di silenzio */

  /* con una foto in album: SLOTS[0] = {1, crc32 LE}; open_ms di un file nuovo (90 ms il 04/09) */
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  seed_photo(3, g_photo, g_crc_a, 0x777u);
  force_open_ms(90);
  start();
  js_ready();
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK(m->fields & SHIM_S_OPEN_MS);
    CHECK_EQ(m->open_ms, 90);
    CHECK_EQ(m->slots_len, SYNC_SLOTS_BYTES);
    CHECK_EQ(m->slots[3 * 5 + 0], 1);
    CHECK_EQ(m->slots[3 * 5 + 1], (uint8_t)(g_crc_a & 0xFF));
    CHECK_EQ(m->slots[3 * 5 + 2], (uint8_t)((g_crc_a >> 8) & 0xFF));
    CHECK_EQ(m->slots[3 * 5 + 3], (uint8_t)((g_crc_a >> 16) & 0xFF));
    CHECK_EQ(m->slots[3 * 5 + 4], (uint8_t)((g_crc_a >> 24) & 0xFF));
    CHECK_EQ(m->slots[0], 0);
    CHECK_EQ(m->bytes, OUTBOX_EXACT);
  }

  /* album disabilitato (quota < 1 MiB): HELLO con MAX_CHUNK 0 — e OPEN_MS comunque presente: e'
   * l'unica informazione utile di questa sync (F49: l'avviso "Galleria lenta" della config page) */
  fresh(QUOTA_BAD, INBOX_MAX_STD, FMT_RAW6);
  force_open_ms(2150);
  start();
  js_ready();
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->msg, SYNC_MSG_HELLO);
    CHECK_EQ(m->max_chunk, 0);
    CHECK_EQ(m->tuples, 7);
    CHECK_EQ(m->fields, HELLO_FIELDS | SHIM_S_SLOTS);
    CHECK(m->fields & SHIM_S_OPEN_MS);
    CHECK_EQ(m->open_ms, 2150);
    CHECK_EQ(m->bytes, OUTBOX_EXACT);
  }
  ack_all();
  /* un secondo JS_READY nella stessa esecuzione (telefono riconnesso) manda lo stesso open_ms */
  js_ready();
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->open_ms, 2150);
  }
}

/* --- F4: tripwire dell'outbox (una tupla non entra) --- */
static void test_outbox_tripwire(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  force_open_ms(3000);
  start();
  /* la dimensione la calcola sync_init: la si forza DOPO l'apertura (spec S7 2.7) */
  shim_am_force_outbox_size(100);
  CHECK_EQ(shim_am_outbox_size(), 100u);
  js_ready();
  CHECK_EQ(shim_log_warnings(), 1);
  CHECK_EQ(shim_log_find("incompleto"), 1);  /* il tripwire conserva la parola (spec S7 2.5) */
  CHECK(shim_log_find_last("incompleto") != NULL);
  CHECK_EQ(shim_am_sent_count(), 1);         /* si spedisce COMUNQUE: OUT_WRITING si chiude con send */
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->msg, SYNC_MSG_HELLO);
    CHECK_EQ(m->tuples, 6);                  /* SLOTS (67 B) non entra in 100 B */
    CHECK_EQ(m->slots_len, 0);
    CHECK_EQ(m->fields & SHIM_S_SLOTS, 0);
    CHECK_EQ(m->fields, HELLO_FIELDS);       /* OPEN_MS resta fra le 6 tuple superstiti (F13) */
    CHECK_EQ(m->open_ms, 3000);
    CHECK_EQ(m->bytes, 52u);                 /* 1 + 6 tuple: MSG, PROTO, FORMAT, MAX_CHUNK, CRC, OPEN_MS */
    CHECK_EQ(m->max_chunk, MAX_CHUNK);       /* le tuple scritte PRIMA restano valide */
    CHECK_EQ(m->proto, SYNC_PROTO_VERSION);
  }
  ack_all();
  /* outbox rimessa a 119: il HELLO successivo e' di nuovo completo e senza WARNING */
  shim_log_reset();
  shim_am_force_outbox_size(OUTBOX_EXACT);
  js_ready();
  CHECK_EQ(shim_log_warnings(), 0);
  CHECK_EQ(shim_log_find("incompleto"), 0);
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->tuples, 7);
    CHECK_EQ(m->slots_len, SYNC_SLOTS_BYTES);
    CHECK_EQ(m->fields, HELLO_FIELDS | SHIM_S_SLOTS);
    CHECK_EQ(m->open_ms, 3000);
    CHECK_EQ(m->bytes, OUTBOX_EXACT);
  }
  ack_all();

  /* outbox ridicola (10 B): non entra nemmeno MSG, ma il messaggio parte lo stesso (vuoto) */
  shim_log_reset();
  shim_am_force_outbox_size(4);
  js_ready();
  CHECK_EQ(shim_log_warnings(), 1);
  CHECK_EQ(shim_log_find("incompleto"), 1);
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->tuples, 0);
    CHECK_EQ(m->bytes, 1u);
    CHECK_EQ(m->fields, 0);
  }
}

/* --- negoziazione del chunk (a ogni JS_READY) --- */
static void check_negotiation(uint32_t inbox_max, uint16_t expect_chunk) {
  fresh(QUOTA_OK, inbox_max, FMT_RAW6);
  start();
  CHECK_EQ(sync_proto_max_chunk(), expect_chunk);
  js_ready();
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->msg, SYNC_MSG_HELLO);
    CHECK_EQ(m->max_chunk, expect_chunk);
  }
  ack_all();
}

static void test_negotiation(void) {
  check_negotiation(8200u, 4096);            /* app Core: piu' del chunk di piattaforma -> 4.096 */
  check_negotiation(4153u, 4096);            /* esattamente l'inbox aperta */
  check_negotiation(2000u, 1792);            /* (2000 - 41) / 256 * 256 */
  check_negotiation(313u, 256);              /* (313 - 41) = 272 -> 256 */
  check_negotiation(124u, 0);                /* telefono senza 8k: sync non supportata */
  check_negotiation(41u, 0);                 /* inbox_max == overhead: nessun margine */
  check_negotiation(0u, 0);

  /* chunk 0: SYNC_REQUEST riceve NOT_SUPPORTED e lo stato resta IDLE */
  fresh(QUOTA_OK, 124u, FMT_RAW6);
  start();
  sync_request(1);
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->msg, SYNC_MSG_STATUS);
    CHECK_EQ(m->code, SYNC_CODE_NOT_SUPPORTED);
    CHECK_EQ(m->reply_to, SYNC_MSG_SYNC_REQUEST);
  }
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK(!shim_timer_pending());
  ack_all();

  /* rinegoziazione a caldo: il telefono connesso cambia fra due JS_READY */
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  js_ready();
  ack_all();
  CHECK_EQ(sync_proto_max_chunk(), MAX_CHUNK);
  shim_am_set_inbox_max(2000u);
  js_ready();
  ack_all();
  CHECK_EQ(sync_proto_max_chunk(), 1792);
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->max_chunk, 1792);
  }
  /* l'inbox APERTA non cambia (una sola apertura per esecuzione) */
  CHECK_EQ(shim_am_inbox_size(), INBOX_EMERY);
  shim_am_set_inbox_max(INBOX_MAX_STD);
  js_ready();
  ack_all();
  CHECK_EQ(sync_proto_max_chunk(), MAX_CHUNK);
}

/* --- STATUS: REPLY_TO, slot, code, offset --- */
static void test_status_reply_to(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  /* ALBUM_DELETE su slot fuori intervallo: BAD_FORMAT, REPLY_TO = 12 */
  ping(12);
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->msg, SYNC_MSG_STATUS);
    CHECK_EQ(m->tuples, 5);
    CHECK_EQ(m->bytes, 44u);                 /* 1 + 5*7 + (1+1+1+4+1) */
    CHECK_EQ(m->code, SYNC_CODE_BAD_FORMAT);
    CHECK_EQ(m->slot, 12);
    CHECK_EQ(m->offset, 0);
    CHECK_EQ(m->reply_to, SYNC_MSG_ALBUM_DELETE);
  }
  ack_all();
  /* MSG ignoto: NOT_SUPPORTED con REPLY_TO uguale al MSG ricevuto */
  in_msg(99);
  CHECK(deliver());
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->code, SYNC_CODE_NOT_SUPPORTED);
    CHECK_EQ(m->slot, GAL_SLOT_NONE);
    CHECK_EQ(m->reply_to, 99);
  }
  ack_all();
  /* PHOTO_BEGIN fuori da SYNCING: BUSY, REPLY_TO = 5 */
  photo_begin(0, 1u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->code, SYNC_CODE_BUSY);
    CHECK_EQ(m->reply_to, SYNC_MSG_PHOTO_BEGIN);
    CHECK_EQ(m->slot, 0);
  }
  ack_all();
  /* PHOTO_END fuori da SYNCING: BUSY, REPLY_TO = 7 */
  photo_end(4);
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->code, SYNC_CODE_BUSY);
    CHECK_EQ(m->reply_to, SYNC_MSG_PHOTO_END);
    CHECK_EQ(m->slot, 4);
  }
  ack_all();
  /* ALBUM_ORDER valido: OK, REPLY_TO = 11; offset 0 */
  uint8_t order[GAL_MAX_SLOTS];
  memset(order, GAL_SLOT_NONE, sizeof(order));
  in_msg(SYNC_MSG_ALBUM_ORDER);
  CHECK(shim_in_bytes(MESSAGE_KEY_ORDER, order, sizeof(order)));
  CHECK(deliver());
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->code, SYNC_CODE_OK);
    CHECK_EQ(m->reply_to, SYNC_MSG_ALBUM_ORDER);
    CHECK_EQ(m->slot, GAL_SLOT_NONE);
  }
  ack_all();
  /* SYNC_DONE non produce risposta */
  const int sent = shim_am_sent_count();
  in_msg(SYNC_MSG_SYNC_DONE);
  CHECK(deliver());
  CHECK_EQ(shim_am_sent_count(), sent);
  CHECK(!shim_am_in_flight());
}

/* --- decodifica: lunghezza della tupla, tipi, saturazione, chiavi assenti --- */
static void test_decode(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();

  /* MSG come uint8 / uint16 / uint32 / int32: stesso effetto */
  const uint8_t widths = 4;
  for (uint8_t w = 0; w < widths; w++) {
    shim_in_begin();
    if (w == 0) { CHECK(shim_in_uint8(MESSAGE_KEY_MSG, SYNC_MSG_ALBUM_DELETE)); }
    if (w == 1) { CHECK(shim_in_uint16(MESSAGE_KEY_MSG, SYNC_MSG_ALBUM_DELETE)); }
    if (w == 2) { CHECK(shim_in_uint32(MESSAGE_KEY_MSG, SYNC_MSG_ALBUM_DELETE)); }
    if (w == 3) { CHECK(shim_in_int32(MESSAGE_KEY_MSG, SYNC_MSG_ALBUM_DELETE)); }
    CHECK(shim_in_uint8(MESSAGE_KEY_SLOT, 13));
    CHECK(deliver());
    const ShimSentMsg *m = shim_am_last_sent();
    CHECK(m != NULL);
    if (m) {
      CHECK_EQ(m->reply_to, SYNC_MSG_ALBUM_DELETE);
      CHECK_EQ(m->slot, 13);
      CHECK_EQ(m->code, SYNC_CODE_BAD_FORMAT);
    }
    ack_all();
  }

  /* SLOT come uint16 e come int32: stesso valore */
  shim_in_begin();
  CHECK(shim_in_int32(MESSAGE_KEY_MSG, SYNC_MSG_ALBUM_DELETE));
  CHECK(shim_in_uint16(MESSAGE_KEY_SLOT, 14));
  CHECK(deliver());
  CHECK_EQ(last()->slot, 14);
  ack_all();

  /* una tupla di 2 B va letta a 16 bit: 270 (0x010E) satura a 255, NON diventa 14 (byte basso) */
  shim_in_begin();
  CHECK(shim_in_int32(MESSAGE_KEY_MSG, SYNC_MSG_ALBUM_DELETE));
  CHECK(shim_in_uint16(MESSAGE_KEY_SLOT, 270));
  CHECK(deliver());
  CHECK_EQ(last()->slot, 255);
  CHECK_EQ(last()->code, SYNC_CODE_BAD_FORMAT);
  ack_all();

  /* saturazione a 255: 300 non deve diventare lo slot 44 (300 & 0xFF) ne' lo slot 0 */
  shim_in_begin();
  CHECK(shim_in_int32(MESSAGE_KEY_MSG, SYNC_MSG_ALBUM_DELETE));
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, 300));
  CHECK(deliver());
  CHECK_EQ(last()->slot, 255);
  CHECK_EQ(last()->code, SYNC_CODE_BAD_FORMAT);
  ack_all();
  shim_in_begin();
  CHECK(shim_in_int32(MESSAGE_KEY_MSG, SYNC_MSG_ALBUM_DELETE));
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, 256));
  CHECK(deliver());
  CHECK_EQ(last()->slot, 255);
  ack_all();

  /* MSG saturato: 300 -> 255 -> MSG ignoto (non 44) */
  shim_in_begin();
  CHECK(shim_in_int32(MESSAGE_KEY_MSG, 300));
  CHECK(deliver());
  CHECK_EQ(last()->code, SYNC_CODE_NOT_SUPPORTED);
  CHECK_EQ(last()->reply_to, 255);
  ack_all();

  /* MSG assente: nessuna risposta (SYNC_MSG_NONE) */
  int sent = shim_am_sent_count();
  shim_in_begin();
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, 3));
  CHECK(deliver());
  CHECK_EQ(shim_am_sent_count(), sent);
  CHECK(!shim_am_in_flight());

  /* MSG con lunghezza 8 (tupla non intera per l'SDK): prv_tuple_u32 -> 0 -> nessuna risposta */
  const uint8_t eight[8] = { SYNC_MSG_ALBUM_DELETE, 0, 0, 0, 0, 0, 0, 0 };
  shim_in_begin();
  CHECK(shim_in_raw(MESSAGE_KEY_MSG, TUPLE_UINT, 8, eight));
  CHECK(deliver());
  CHECK_EQ(shim_am_sent_count(), sent);

  /* MSG con lunghezza 3: idem */
  shim_in_begin();
  CHECK(shim_in_raw(MESSAGE_KEY_MSG, TUPLE_UINT, 3, eight));
  CHECK(deliver());
  CHECK_EQ(shim_am_sent_count(), sent);

  /* MSG di tipo CSTRING / BYTE_ARRAY: rifiutato da prv_get_u32 -> nessuna risposta */
  shim_in_begin();
  CHECK(shim_in_raw(MESSAGE_KEY_MSG, TUPLE_CSTRING, 2, (const uint8_t *)"5"));
  CHECK(deliver());
  CHECK_EQ(shim_am_sent_count(), sent);
  shim_in_begin();
  CHECK(shim_in_raw(MESSAGE_KEY_MSG, TUPLE_BYTE_ARRAY, 1, eight));
  CHECK(deliver());
  CHECK_EQ(shim_am_sent_count(), sent);

  /* TUPLE_INT negativo su OFFSET: letto come uint32 (0xFFFFFFFF), niente slot 0 per sbaglio */
  sync_request(1);
  ack_all();
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  photo_begin(0, 0x99u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  ack_all();
  in_msg(SYNC_MSG_PHOTO_DATA);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, 0));
  CHECK(shim_in_int32(MESSAGE_KEY_OFFSET, -1));
  CHECK(shim_in_bytes(MESSAGE_KEY_DATA, g_photo, 256));
  CHECK(deliver());
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->code, SYNC_CODE_SEQ_ERR);    /* offset enorme > next: fuori sequenza */
    CHECK_EQ(m->offset, 0);                  /* riprendere da 0 */
    CHECK_EQ(m->reply_to, SYNC_MSG_PHOTO_DATA);
  }
  ack_all();

  /* OFFSET come uint16 = 512 (0x0200): fuori sequenza (next = 0) -> SEQ_ERR. Letto a 8 bit
   * varrebbe 0 e il chunk verrebbe accettato in silenzio. */
  in_msg(SYNC_MSG_PHOTO_DATA);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, 0));
  CHECK(shim_in_uint16(MESSAGE_KEY_OFFSET, 512));
  CHECK(shim_in_bytes(MESSAGE_KEY_DATA, g_photo, 256));
  CHECK(deliver());
  CHECK_EQ(last()->code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(last()->offset, 0);
  CHECK_EQ(last()->reply_to, SYNC_MSG_PHOTO_DATA);
  ack_all();

  /* DATA come intero invece che byte array: campo assente -> SEQ_ERR */
  in_msg(SYNC_MSG_PHOTO_DATA);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, 0));
  CHECK(shim_in_int32(MESSAGE_KEY_OFFSET, 0));
  CHECK(shim_in_int32(MESSAGE_KEY_DATA, 1234));
  CHECK(deliver());
  CHECK_EQ(last()->code, SYNC_CODE_SEQ_ERR);
  ack_all();

  /* DATA byte array valido: nessuna risposta (l'ACK di AppMessage basta) */
  sent = shim_am_sent_count();
  photo_data(0, 0, g_photo, 256);
  CHECK_EQ(shim_am_sent_count(), sent);
  CHECK(!shim_am_in_flight());

  /* ORDER come intero: campo assente -> BAD_FORMAT */
  in_msg(SYNC_MSG_ALBUM_ORDER);
  CHECK(shim_in_int32(MESSAGE_KEY_ORDER, 0));
  CHECK(deliver());
  CHECK_EQ(last()->code, SYNC_CODE_BAD_FORMAT);
  CHECK_EQ(last()->reply_to, SYNC_MSG_ALBUM_ORDER);
  ack_all();

  /* SETTINGS di lunghezza sbagliata: BAD_FORMAT */
  uint8_t blob[sizeof(GalSettings) + 1];
  memcpy(blob, settings_get(), sizeof(GalSettings));
  in_msg(SYNC_MSG_SETTINGS);
  CHECK(shim_in_bytes(MESSAGE_KEY_SETTINGS, blob, sizeof(GalSettings) + 1));
  CHECK(deliver());
  CHECK_EQ(last()->code, SYNC_CODE_BAD_FORMAT);
  ack_all();
  storage_flush();                           /* niente debounce pendente nel resto degli scenari */
}

/* --- inbox: messaggio piu' grande dell'inbox aperta --- */
static void test_inbox_dropped(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  sync_request(1);
  ack_all();
  photo_begin(0, 0x55u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  ack_all();
  shim_log_reset();
  const int sent = shim_am_sent_count();
  /* DATA da 4.352 B: il dizionario supera i 4.153 B dell'inbox */
  in_msg(SYNC_MSG_PHOTO_DATA);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, 0));
  CHECK(shim_in_int32(MESSAGE_KEY_OFFSET, 0));
  CHECK(shim_in_bytes(MESSAGE_KEY_DATA, g_photo, 4352));
  CHECK(shim_in_size() > shim_am_inbox_size());
  CHECK(!deliver());                         /* NACK: inbox_received non viene chiamata */
  CHECK_EQ(shim_am_dropped_calls(), 1);
  CHECK_EQ(shim_log_warnings(), 1);          /* "sync: inbox dropped" */
  CHECK_EQ(shim_am_sent_count(), sent);      /* nessuno STATUS: il telefono ritenta */
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  /* il chunk giusto passa */
  photo_data(0, 0, g_photo, 4096);
  CHECK_EQ(shim_am_dropped_calls(), 1);
}

/* --- coda outbox: 4 posti, il 5o scartato, drenaggio in ordine --- */
static void test_queue_full(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  /* 5 messaggi senza consegnare alcun esito: 1 in volo + 4 in coda... il 5o e' di troppo */
  ping(20);                                  /* parte subito (in volo) */
  CHECK_EQ(shim_am_sent_count(), 1);
  CHECK(shim_am_in_flight());
  ping(21);
  ping(22);
  ping(23);
  CHECK_EQ(shim_am_sent_count(), 1);         /* la coda non spedisce finche' c'e' un messaggio in volo */
  CHECK_EQ(shim_log_warnings(), 0);
  ping(24);                                  /* 5o: coda piena (4) -> scartato con WARNING */
  CHECK_EQ(shim_log_warnings(), 1);
  CHECK_EQ(shim_am_sent_count(), 1);
  /* drenaggio: ogni outbox_sent fa partire il successivo, in ordine FIFO */
  CHECK(shim_am_outbox_sent());
  CHECK_EQ(shim_am_sent_count(), 2);
  CHECK_EQ(last()->slot, 21);
  CHECK(shim_am_outbox_sent());
  CHECK_EQ(shim_am_sent_count(), 3);
  CHECK_EQ(last()->slot, 22);
  CHECK(shim_am_outbox_sent());
  CHECK_EQ(shim_am_sent_count(), 4);
  CHECK_EQ(last()->slot, 23);
  CHECK(shim_am_outbox_sent());
  CHECK_EQ(shim_am_sent_count(), 4);         /* il 5o (24) non e' mai stato accodato */
  CHECK(!shim_am_in_flight());
  /* la coda e' di nuovo vuota: un messaggio nuovo parte subito */
  ping(25);
  CHECK_EQ(shim_am_sent_count(), 5);
  CHECK_EQ(last()->slot, 25);
  /* ordine complessivo */
  CHECK_EQ(nth(0)->slot, 20);
  CHECK_EQ(nth(1)->slot, 21);
  CHECK_EQ(nth(2)->slot, 22);
  CHECK_EQ(nth(3)->slot, 23);
  CHECK_EQ(nth(4)->slot, 25);
  CHECK(shim_am_sent(5) == NULL);
}

/* --- coda outbox: esiti negativi --- */
static void test_queue_failures(void) {
  /* NOT_CONNECTED: la coda viene SVUOTATA (mai ritentare senza telefono, regola 7) */
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  ping(30);
  ping(31);
  ping(32);
  CHECK_EQ(shim_am_sent_count(), 1);
  shim_log_reset();
  CHECK(shim_am_outbox_failed(APP_MSG_NOT_CONNECTED));
  CHECK_EQ(shim_am_sent_count(), 1);         /* 31 e 32 buttati, nessun invio */
  CHECK(!shim_am_in_flight());
  CHECK_EQ(shim_log_warnings(), 1);
  ping(33);                                  /* la coda e' pulita: il nuovo parte subito */
  CHECK_EQ(shim_am_sent_count(), 2);
  CHECK_EQ(last()->slot, 33);
  ack_all();

  /* APP_NOT_RUNNING: stesso trattamento (stessa maschera di bit) */
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  ping(30);
  ping(31);
  CHECK(shim_am_outbox_failed(APP_MSG_APP_NOT_RUNNING));
  CHECK_EQ(shim_am_sent_count(), 1);
  ping(34);
  CHECK_EQ(shim_am_sent_count(), 2);
  CHECK_EQ(last()->slot, 34);
  ack_all();

  /* SEND_TIMEOUT: si scarta solo quello fallito e si prosegue col successivo */
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  ping(40);
  ping(41);
  ping(42);
  CHECK_EQ(shim_am_sent_count(), 1);
  CHECK(shim_am_outbox_failed(APP_MSG_SEND_TIMEOUT));
  CHECK_EQ(shim_am_sent_count(), 2);
  CHECK_EQ(last()->slot, 41);
  CHECK(shim_am_in_flight());
  CHECK(shim_am_outbox_failed(APP_MSG_SEND_REJECTED));
  CHECK_EQ(shim_am_sent_count(), 3);
  CHECK_EQ(last()->slot, 42);
  ack_all();
  CHECK_EQ(shim_am_sent_count(), 3);

  /* outbox_begin che fallisce: scarta i messaggi in coda uno per uno, senza bloccarsi */
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  ping(50);
  ping(51);
  ping(52);
  const int begins = shim_am_begin_calls();
  shim_log_reset();
  shim_am_fail_outbox_begin(APP_MSG_INVALID_STATE);
  CHECK(shim_am_outbox_sent());              /* pop di 50 -> pump: begin fallisce per 51 e 52 */
  CHECK_EQ(shim_am_begin_calls(), begins + 2);
  CHECK_EQ(shim_am_sent_count(), 1);
  CHECK_EQ(shim_log_warnings(), 2);
  CHECK(!shim_am_in_flight());
  shim_am_fail_outbox_begin(APP_MSG_OK);
  ping(53);                                  /* la coda e' vuota: si riparte */
  CHECK_EQ(shim_am_sent_count(), 2);
  CHECK_EQ(last()->slot, 53);
  ack_all();

  /* outbox_send che fallisce in modo sincrono: messaggio scartato, il successivo prosegue */
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  shim_am_fail_outbox_send(APP_MSG_INVALID_ARGS);
  shim_log_reset();
  ping(60);
  CHECK_EQ(shim_am_sent_count(), 0);
  CHECK(!shim_am_in_flight());
  CHECK_EQ(shim_log_warnings(), 1);
  shim_am_fail_outbox_send(APP_MSG_OK);
  ping(61);
  CHECK_EQ(shim_am_sent_count(), 1);
  CHECK_EQ(last()->slot, 61);
  ack_all();
}

/* --- F2: timer di silenzio (30 s) --- */
static void test_idle_timer(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), 0);

  sync_request(2);
  ack_all();
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_timeout(), SYNC_IDLE_TIMEOUT_MS);
  CHECK_EQ(shim_timer_timeout(), 30000u);
  CHECK_EQ(shim_timer_registrations(), 1);
  CHECK_EQ(shim_timer_orphans(), 0);
  void *ctx0 = shim_timer_data();

  /* ogni messaggio in SYNCING riarma il timer con una reschedule (nessun timer nuovo) */
  ping(12);
  ack_all();
  CHECK_EQ(shim_timer_reschedules(), 1);
  CHECK_EQ(shim_timer_registrations(), 1);
  CHECK_EQ(shim_timer_cancels(), 0);
  CHECK_EQ(shim_timer_orphans(), 0);
  CHECK(shim_timer_data() == ctx0);
  ping(13);
  ack_all();
  CHECK_EQ(shim_timer_reschedules(), 2);
  CHECK_EQ(shim_timer_registrations(), 1);

  /* scaduto ma NON consumato (callback in coda dietro il messaggio in corso): reschedule fallisce,
   * sync.c cancella e registra un timer nuovo con una generazione nuova (F2) */
  CHECK(shim_timer_expire());
  CHECK(shim_timer_expired());
  ping(14);
  ack_all();
  CHECK_EQ(shim_timer_cancels(), 1);
  CHECK_EQ(shim_timer_registrations(), 2);
  CHECK_EQ(shim_timer_reschedules(), 2);
  CHECK_EQ(shim_timer_orphans(), 0);         /* mai due timer vivi */
  CHECK(shim_timer_pending());
  CHECK(!shim_timer_expired());
  void *ctx1 = shim_timer_data();
  CHECK(ctx1 != ctx0);                       /* generazione incrementata */
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);

  /* il callback STANTIO del timer superato non deve forzare IDLE ne' azzerare l'handle nuovo */
  const int prog = shim_ui_progress_calls();
  CHECK(shim_timer_fire_ctx(ctx0));
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  CHECK_EQ(shim_ui_progress_calls(), prog);
  CHECK(shim_timer_pending());
  /* prova che s_idle_timer non e' stato azzerato: il messaggio dopo RIPROGRAMMA, non registra */
  ping(15);
  ack_all();
  CHECK_EQ(shim_timer_reschedules(), 3);
  CHECK_EQ(shim_timer_registrations(), 2);
  CHECK_EQ(shim_timer_orphans(), 0);

  /* timeout vero: IDLE, avanzamento azzerato, hold rilasciato */
  shim_log_reset();
  CHECK(shim_timer_fire());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_log_warnings(), 1);          /* "30 s idle -> IDLE" */
  CHECK_EQ(shim_ui_progress_calls(), prog + 1);
  CHECK_EQ(shim_ui_progress_index(), 0);
  CHECK_EQ(shim_ui_progress_count(), 0);
  /* un secondo scatto non ha effetto (timer gia' consumato) */
  CHECK(!shim_timer_fire());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);

  /* fuori da SYNCING il timer non si riarma */
  ping(16);
  ack_all();
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), 2);

  /* SYNC_DONE spegne il timer */
  sync_request(1);
  ack_all();
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_registrations(), 3);
  const int cancels = shim_timer_cancels();
  in_msg(SYNC_MSG_SYNC_DONE);
  CHECK(deliver());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_timer_cancels(), cancels + 1);
  CHECK_EQ(shim_ui_progress_index(), 0);
  CHECK_EQ(shim_ui_progress_count(), 0);

  /* register che fallisce (heap esaurito): senza rete di sicurezza la sync verrebbe lasciata in
   * SYNCING con il modello in hold (rotazione congelata) finche' non arriva un altro messaggio o
   * l'app riparte (osservazione del test host, S7). Correzione: la sync viene abbandonata subito
   * (WARNING + sync_proto_timeout) e l'hold rilasciato nello stesso giro: il telefono riceve BUSY al
   * prossimo messaggio di foto e rinnova la SYNC_REQUEST. */
  const int warn0 = shim_log_warnings();
  shim_fail_timer_register(true);
  sync_request(1);
  ack_all();
  CHECK(!shim_timer_pending());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK_EQ(shim_log_warnings(), warn0 + 1);
  CHECK_EQ(shim_ui_progress_index(), 0);     /* "Foto k/n" spento come in un timeout */
  CHECK_EQ(shim_ui_progress_count(), 0);     /* count 0 = etichetta via (index 0 da solo sarebbe "1/n") */
  shim_ui_reset_counters();
  model_shake();                             /* album vuoto: la scossa cambia demo → rotazione NON congelata */
  CHECK(shim_ui_total_calls() > 0);
  shim_fail_timer_register(false);
  sync_request(1);                           /* la richiesta seguente rientra in SYNCING con il timer */
  ack_all();
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_orphans(), 0);
}

/* --- avanzamento "Foto k/n" --- */
static void test_progress(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  CHECK_EQ(shim_ui_progress_calls(), 0);
  sync_request(3);
  ack_all();
  CHECK_EQ(shim_ui_progress_calls(), 1);
  CHECK_EQ(shim_ui_progress_index(), 0);
  CHECK_EQ(shim_ui_progress_count(), 3);
  photo_begin(0, 0x11u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  ack_all();
  CHECK_EQ(shim_ui_progress_calls(), 2);
  CHECK_EQ(shim_ui_progress_index(), 1);
  CHECK_EQ(shim_ui_progress_count(), 3);
  photo_begin(1, 0x12u, FMT_RAW6, PHOTO_LEN, g_crc_b);
  ack_all();
  CHECK_EQ(shim_ui_progress_index(), 2);
  in_msg(SYNC_MSG_SYNC_DONE);
  CHECK(deliver());
  CHECK_EQ(shim_ui_progress_index(), 0);
  CHECK_EQ(shim_ui_progress_count(), 0);

  /* OFFSET >= COUNT: clamp a count - 1 (ripresa dopo un BUSY, F3) */
  in_msg(SYNC_MSG_SYNC_REQUEST);
  CHECK(shim_in_int32(MESSAGE_KEY_COUNT, 2));
  CHECK(shim_in_int32(MESSAGE_KEY_OFFSET, 5));
  CHECK(deliver());
  ack_all();
  CHECK_EQ(shim_ui_progress_index(), 1);
  CHECK_EQ(shim_ui_progress_count(), 2);
  photo_begin(2, 0x13u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  ack_all();
  CHECK_EQ(shim_ui_progress_index(), 2);     /* al piu' n/n */

  /* R01 (S9): COUNT nel PHOTO_BEGIN = k esplicito (prv_decode lo legge come per SYNC_REQUEST) */
  in_msg(SYNC_MSG_SYNC_DONE);
  CHECK(deliver());
  in_msg(SYNC_MSG_SYNC_REQUEST);
  CHECK(shim_in_int32(MESSAGE_KEY_COUNT, 3));
  CHECK(deliver());
  ack_all();
  CHECK_EQ(shim_ui_progress_index(), 0);
  in_msg(SYNC_MSG_PHOTO_BEGIN);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, 4));
  CHECK(shim_in_int32(MESSAGE_KEY_PHOTO_ID, 0x14));
  CHECK(shim_in_int32(MESSAGE_KEY_FORMAT, FMT_RAW6));
  CHECK(shim_in_int32(MESSAGE_KEY_LENGTH, (int32_t)PHOTO_LEN));
  CHECK(shim_in_int32(MESSAGE_KEY_CRC, (int32_t)g_crc_a));
  CHECK(shim_in_int32(MESSAGE_KEY_COUNT, 3));           /* foto 1 e 2 saltate dal telefono */
  CHECK(deliver());
  ack_all();
  CHECK_EQ(shim_ui_progress_index(), 3);     /* "Foto 3/3" subito, non 1/3 */
  CHECK_EQ(shim_ui_progress_count(), 3);
}

/* --- F1: rotazione congelata durante la sostituzione dello slot mostrato --- */
static void test_hold_during_sync(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  seed_photo(0, g_photo, g_crc_a, 0xA001u);
  start();
  model_tick(at(10, 0));
  shim_ui_reset_counters();
  CHECK_EQ(model_current_slot(), 0);
  CHECK_EQ(storage_valid_slots(), 1);

  /* SYNC_REQUEST: hold attivo (nessuna rotazione fino a fine sync) */
  sync_request(1);
  ack_all();
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  model_tick(at(10, 30));
  model_tick(at(11, 45));
  model_shake();
  CHECK_EQ(shim_ui_total_calls(), 0);        /* niente persist, niente bitmap, niente UI */

  /* PHOTO_BEGIN sullo slot MOSTRATO: il manifest lo svuota subito (D8) */
  photo_begin(0, 0xB002u, FMT_RAW6, PHOTO_LEN, g_crc_b);
  ack_all();
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->code, SYNC_CODE_OK);
    CHECK_EQ(m->slot, 0);
    CHECK_EQ(m->offset, 0);
  }
  CHECK_EQ(storage_valid_slots(), 0);        /* slot svuotato: senza hold il modello passerebbe a demo */
  model_tick(at(12, 0));
  model_focus(false);
  model_focus(true);
  CHECK_EQ(shim_ui_total_calls(), 0);        /* F1: congelato */

  /* i 9 PHOTO_DATA non producono risposte e non toccano la UI */
  int data_msgs = 0;
  for (uint32_t off = 0; off < PHOTO_LEN; off += MAX_CHUNK) {
    const uint32_t rem = PHOTO_LEN - off;
    const uint16_t n = (rem > MAX_CHUNK) ? (uint16_t)MAX_CHUNK : (uint16_t)rem;
    const int sent = shim_am_sent_count();
    photo_data(0, off, g_photo2 + off, n);
    CHECK_EQ(shim_am_sent_count(), sent);    /* nessuno STATUS per chunk */
    data_msgs++;
  }
  CHECK_EQ(data_msgs, 9);                    /* 8 x 4.096 + 1.432 */
  CHECK_EQ(shim_ui_total_calls(), 0);

  /* PHOTO_END: commit, ma il modello resta congelato (siamo ancora in SYNCING) */
  photo_end(0);
  ack_all();
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->code, SYNC_CODE_OK);
    CHECK_EQ(m->slot, 0);
    CHECK_EQ(m->offset, PHOTO_LEN);
    CHECK_EQ(m->reply_to, SYNC_MSG_PHOTO_END);
  }
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK_EQ(storage_manifest()->slots[0].crc32, g_crc_b);
  CHECK_EQ(storage_manifest()->slots[0].generation, 2);
  CHECK_EQ(shim_ui_total_calls(), 0);        /* nessuna ricarica a ogni PHOTO_END */

  /* SYNC_DONE: una sola ricarica + una sola notifica alla UI */
  in_msg(SYNC_MSG_SYNC_DONE);
  CHECK(deliver());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK_EQ(shim_ui_persist_calls(), 1);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK_EQ(shim_ui_resource_calls(), 0);     /* mai la demo: lo slot e' tornato valido */
  CHECK_EQ(shim_ui_last_slot(), 0);
  CHECK_EQ(shim_ui_last_generation(), 2);
  CHECK_EQ(model_current_slot(), 0);
  CHECK(!shim_timer_pending());

  /* dopo il rilascio la rotazione riprende normalmente */
  shim_ui_reset_counters();
  model_tick(at(13, 0));
  CHECK_EQ(shim_ui_persist_calls(), 0);      /* una sola foto in album: nessun cambio */
}

/* --- F1: il timeout di silenzio rilascia l'hold anche senza SYNC_DONE --- */
static void test_hold_released_by_timeout(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  seed_photo(0, g_photo, g_crc_a, 0xC001u);
  seed_photo(1, g_photo2, g_crc_b, 0xC002u);
  start();
  model_tick(at(9, 0));
  shim_ui_reset_counters();
  const uint8_t slot0 = model_current_slot();
  CHECK(slot0 == 0 || slot0 == 1);

  sync_request(1);
  ack_all();
  photo_begin(slot0, 0xD003u, FMT_RAW6, PHOTO_LEN, g_crc_b);
  ack_all();
  CHECK_EQ(storage_valid_slots(), 1);        /* lo slot mostrato e' stato svuotato */
  model_tick(at(9, 30));
  CHECK_EQ(shim_ui_total_calls(), 0);

  /* nessun altro messaggio: scatta il timeout */
  CHECK(shim_timer_pending());
  CHECK(shim_timer_fire());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  /* la foto mostrata era stata svuotata: il modello ricarica (album cambiato durante la sync) */
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK_EQ(model_current_slot(), (slot0 == 0) ? 1 : 0);
  CHECK_EQ(shim_ui_persist_calls(), 1);
}

/* --- ALBUM_ORDER / ALBUM_DELETE a riposo: il modello rilegge subito --- */
static void test_album_changes_idle(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  seed_photo(0, g_photo, g_crc_a, 0xE001u);
  seed_photo(1, g_photo2, g_crc_b, 0xE002u);
  start();
  model_tick(at(8, 0));
  shim_ui_reset_counters();
  const uint8_t before = model_current_slot();

  /* ALBUM_DELETE della foto mostrata: STATUS OK e ricarica immediata (stato IDLE) */
  in_msg(SYNC_MSG_ALBUM_DELETE);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, before));
  CHECK(deliver());
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->code, SYNC_CODE_OK);
    CHECK_EQ(m->slot, before);
    CHECK_EQ(m->reply_to, SYNC_MSG_ALBUM_DELETE);
  }
  ack_all();
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK_EQ(shim_ui_photo_changed(), 1);
  CHECK_EQ(model_current_slot(), (before == 0) ? 1 : 0);
  CHECK(!shim_timer_pending());              /* nessuna sync in corso: nessun timer */
}

/* --- sync_env_settings_changed: chi viene notificato --- */

/* Prima di ogni caso model_deinit() disiscrive il tap service lasciando shake_next = 1: cosi'
 * una chiamata a model_settings_changed si vede come una sottoscrizione in piu'. */
static void env_case(const char *name, GalSettings before, GalSettings now,
                     int tick, int layout, int style, int full, int model) {
  CHECK(settings_apply(&now));
  storage_flush();                           /* niente debounce pendente (un solo timer nello shim) */
  model_deinit();
  shim_ui_reset_counters();
  const int sub0 = shim_accel_tap_subscribes();
  sync_env_settings_changed(&before);
  if (shim_ui_tick_calls() != tick || shim_ui_layout_calls() != layout
      || shim_ui_style_calls() != style || shim_ui_full_redraw_calls() != full
      || shim_accel_tap_subscribes() - sub0 != model) {
    printf("  (caso %s)\n", name);
  }
  CHECK_EQ(shim_ui_tick_calls(), tick);
  CHECK_EQ(shim_ui_layout_calls(), layout);
  CHECK_EQ(shim_ui_style_calls(), style);
  CHECK_EQ(shim_ui_full_redraw_calls(), full);
  CHECK_EQ(shim_accel_tap_subscribes() - sub0, model);
}

static void test_env_settings(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  GalSettings base;
  settings_set_defaults(&base);
  base.shake_next = 1;
  CHECK(settings_apply(&base));
  storage_flush();

  GalSettings s;

  s = base; s.clock_mode = GAL_CLOCK_12H;
  env_case("clock_mode", base, s, 1, 0, 0, 1, 0);      /* riformatta + redraw completo */
  s = base; s.leading_zero = GAL_LZ_ON;
  env_case("leading_zero", base, s, 1, 0, 0, 1, 0);
  s = base; s.info_row = GAL_INFO_DATE;
  env_case("info_row", base, s, 1, 0, 0, 1, 0);
  s = base; s.layout = GAL_LAYOUT_B;
  env_case("layout", base, s, 0, 1, 0, 0, 0);          /* layout_changed include colore e redraw */
  s = base; s.font = GAL_FONT_LECO;
  env_case("font", base, s, 0, 1, 0, 0, 0);
  s = base; s.text_color = GAL_TEXT_YELLOW;
  env_case("text_color", base, s, 0, 0, 1, 0, 0);
  s = base; s.outline = GAL_OUTLINE_ALWAYS;
  env_case("outline", base, s, 0, 0, 1, 0, 0);
  s = base; s.digit_style = GAL_STYLE_OUTLINE_3D;
  env_case("digit_style", base, s, 0, 0, 1, 0, 0);   /* S8-stile: solo palette + redraw, nessuna strip da ricaricare */
  s = base; s.digit_style = GAL_STYLE_OUTLINE; s.layout = GAL_LAYOUT_B;
  env_case("stile+layout", base, s, 0, 1, 0, 0, 0);  /* layout vince anche sullo stile */
  s = base;
  env_case("nessun cambiamento", base, s, 0, 0, 0, 1, 0);   /* comportamento attuale: redraw prudente */
  s = base; s.clock_mode = GAL_CLOCK_24H; s.font = GAL_FONT_BEBAS;
  env_case("clock+font", base, s, 1, 1, 0, 0, 0);
  s = base; s.text_color = GAL_TEXT_BLACK; s.layout = GAL_LAYOUT_B;
  env_case("colore+layout", base, s, 0, 1, 0, 0, 0);   /* layout vince: style non viene chiamata */
  s = base; s.interval_min = 60;
  env_case("intervallo", base, s, 0, 0, 0, 1, 1);      /* il modello ricalcola lo slot */
  s = base; s.order = GAL_ORDER_RANDOM;
  env_case("ordine", base, s, 0, 0, 0, 1, 1);
  s = base; s.shake_next = 0;
  {   /* shake 1 -> 0: model_settings_changed DISISCRIVE (non sottoscrive) */
    CHECK(settings_apply(&s));
    storage_flush();
    model_deinit();
    shim_ui_reset_counters();
    const int sub0 = shim_accel_tap_subscribes();
    const int uns0 = shim_accel_tap_unsubscribes();
    sync_env_settings_changed(&base);
    CHECK_EQ(shim_ui_full_redraw_calls(), 1);
    CHECK_EQ(shim_accel_tap_subscribes(), sub0);
    CHECK_EQ(shim_accel_tap_unsubscribes(), uns0);     /* gia' disiscritto da model_deinit */
  }
  CHECK(settings_apply(&base));
  storage_flush();
  s = base; s.shake_next = 0;
  CHECK(settings_apply(&s));
  storage_flush();
  env_case("shake 0 -> 1", s, base, 0, 0, 0, 1, 1);
}

/* --- SETTINGS end-to-end (messaggio dal telefono) --- */
static void test_settings_message(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  GalSettings s = *settings_get();
  const uint8_t font0 = s.font;
  s.font = (uint8_t)(font0 == GAL_FONT_ANTON ? GAL_FONT_BEBAS : GAL_FONT_ANTON);
  s.crc16 = 0;                               /* il crc16 del blob viene ignorato: lo rifa' storage */
  uint8_t blob[sizeof(GalSettings)];
  memcpy(blob, &s, sizeof(blob));
  shim_ui_reset_counters();
  in_msg(SYNC_MSG_SETTINGS);
  CHECK(shim_in_bytes(MESSAGE_KEY_SETTINGS, blob, sizeof(blob)));
  CHECK(deliver());
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->code, SYNC_CODE_OK);
    CHECK_EQ(m->reply_to, SYNC_MSG_SETTINGS);
    CHECK_EQ(m->slot, GAL_SLOT_NONE);
  }
  CHECK_EQ(settings_get()->font, s.font);
  CHECK_EQ(shim_ui_layout_calls(), 1);       /* font cambiato -> strip e griglia */
  CHECK_EQ(shim_ui_tick_calls(), 0);
  CHECK_EQ(shim_ui_style_calls(), 0);
  ack_all();
  /* il HELLO successivo porta il CRC delle impostazioni NUOVE (sync stateless, S5b) */
  js_ready();
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->crc, crc16_ccitt((const uint8_t *)settings_get(), (uint32_t)(sizeof(GalSettings) - 2)));
  }
  ack_all();
  /* impostazioni non valide: BAD_FORMAT e nessuna notifica */
  shim_ui_reset_counters();
  memset(blob, 0xFF, sizeof(blob));
  in_msg(SYNC_MSG_SETTINGS);
  CHECK(shim_in_bytes(MESSAGE_KEY_SETTINGS, blob, sizeof(blob)));
  CHECK(deliver());
  CHECK_EQ(last()->code, SYNC_CODE_BAD_FORMAT);
  CHECK_EQ(shim_ui_time_calls(), 0);
  ack_all();
  storage_flush();
}

/* --- sync_deinit --- */
static void test_deinit(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  sync_request(1);
  ack_all();
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_am_callbacks_registered(), 4);
  ping(12);                                  /* un messaggio resta in volo */
  CHECK(shim_am_in_flight());

  sync_deinit();
  CHECK(!shim_timer_pending());              /* timer cancellato */
  CHECK_EQ(shim_am_callbacks_registered(), 0);
  /* nessun callback: i messaggi non raggiungono piu' l'app (inbox_received deregistrata) */
  const int sent = shim_am_sent_count();
  in_msg(SYNC_MSG_ALBUM_DELETE);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, 13));
  CHECK(!deliver());
  CHECK_EQ(shim_am_sent_count(), sent);
  /* l'esito del messaggio rimasto in volo non risveglia nessuno (outbox_sent deregistrata):
   * la coda di sync.c e' gia' stata svuotata da sync_deinit, quindi niente riparte da sola. */
  CHECK(shim_am_in_flight());
  CHECK(shim_am_outbox_sent());
  CHECK(!shim_am_in_flight());
  CHECK_EQ(shim_am_sent_count(), sent);
  /* sync_deinit e' idempotente */
  sync_deinit();
  CHECK_EQ(shim_am_callbacks_registered(), 0);

  /* sync_init dopo un deinit: i callback tornano, ma l'inbox NON si riapre (nessuna close nell'SDK
   * 4.33.1): resta quella della prima apertura, con la stessa dimensione. */
  sync_init();
  CHECK_EQ(shim_am_open_count(), 2);
  CHECK_EQ(shim_am_last_open_result(), APP_MSG_INVALID_STATE);
  CHECK_EQ(shim_am_callbacks_registered(), 4);
  CHECK_EQ(shim_am_inbox_size(), INBOX_EMERY);
  CHECK(shim_am_is_open());
  ping(14);                                  /* la sync funziona di nuovo */
  CHECK_EQ(shim_am_sent_count(), sent + 1);
  CHECK_EQ(last()->slot, 14);
  ack_all();
}

/* --- due foto di fila, con ACK e riavvio del modello --- */
static void test_two_photos(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  sync_request(2);
  ack_all();
  const int msgs_a = send_photo(0, 0xF001u, g_photo, g_crc_a, (uint16_t)MAX_CHUNK);
  CHECK_EQ(msgs_a, 9);
  const int msgs_b = send_photo(1, 0xF002u, g_photo2, g_crc_b, (uint16_t)MAX_CHUNK);
  CHECK_EQ(msgs_b, 9);
  CHECK_EQ(storage_valid_slots(), 2);
  CHECK_EQ(storage_manifest()->slots[0].crc32, g_crc_a);
  CHECK_EQ(storage_manifest()->slots[1].crc32, g_crc_b);
  CHECK_EQ(storage_manifest()->slots[0].photo_id, 0xF001u);
  CHECK_EQ(storage_manifest()->slots[1].photo_id, 0xF002u);
  in_msg(SYNC_MSG_SYNC_DONE);
  CHECK(deliver());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK_EQ(shim_ui_progress_index(), 0);
  /* il manifest e' scritto per ultimo: chiave 1 */
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
  /* i byte in persist sono quelli mandati */
  static uint8_t buf[GAL_CHUNK_BYTES];
  int mismatch = 0;
  for (uint16_t i = 0; i < PHOTO_CHUNKS; i++) {
    const uint16_t n = (i == PHOTO_CHUNKS - 1) ? LAST_CHUNK_N : GAL_CHUNK_BYTES;
    const int r = storage_read_chunk(1, i, buf, sizeof(buf));
    if (r != (int)n || memcmp(buf, g_photo2 + (uint32_t)i * GAL_CHUNK_BYTES, n) != 0) {
      mismatch++;
    }
  }
  CHECK_EQ(mismatch, 0);
  CHECK_EQ(shim_log_warnings(), 0);          /* nessun tripwire, nessuna coda piena */
  CHECK_EQ(shim_log_find("sync: end"), 2);   /* una riga per PHOTO_END */
#ifndef GALLERIA_DEBUG_TIMING
  CHECK_EQ(shim_log_find("sync: gap"), 0);   /* la riga gap e' solo della build M */
#endif
}

#ifdef GALLERIA_DEBUG_TIMING
/* --- F36 (build M, make run-test_sync_timing): la riga "sync: gap n= max avg" esce UNA volta per
 * foto, al PHOTO_END che la chiude; un PHOTO_END ritrasmesso (BUSY in IDLE, SEQ_ERR in SYNCING senza
 * foto pendente) NON la ripete con statistiche stantie (logstats la attaccherebbe alla END successiva). --- */
static void test_gap_once(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  shim_set_time_step_ms(10);                 /* orologio finto che avanza: intervalli > 0 */
  sync_request(1);
  ack_all();
  CHECK_EQ(send_photo(0, 0xF001u, g_photo, g_crc_a, (uint16_t)MAX_CHUNK), 9);
  CHECK_EQ(shim_log_find("sync: gap"), 1);
  CHECK(shim_log_find_last("sync: gap n=8 ") != NULL);   /* 9 PHOTO_DATA -> 8 intervalli */
  CHECK_EQ(shim_log_find("sync: end"), 1);
  in_msg(SYNC_MSG_SYNC_DONE);
  CHECK(deliver());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);

  /* PHOTO_END ritrasmesso in IDLE: STATUS BUSY, riga end si', riga gap no */
  photo_end(0);
  ack_all();
  const ShimSentMsg *m = last();
  CHECK_EQ(m->code, SYNC_CODE_BUSY);
  CHECK_EQ(m->reply_to, SYNC_MSG_PHOTO_END);
  CHECK_EQ(shim_log_find("sync: end"), 2);
  CHECK_EQ(shim_log_find("sync: gap"), 1);

  /* PHOTO_END in SYNCING senza foto pendente: SEQ_ERR, ancora nessuna gap */
  sync_request(1);
  ack_all();
  photo_end(0);
  ack_all();
  m = last();
  CHECK_EQ(m->code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(shim_log_find("sync: end"), 3);
  CHECK_EQ(shim_log_find("sync: gap"), 1);

  /* la seconda foto produce la sua riga (statistiche azzerate al PHOTO_BEGIN) */
  CHECK_EQ(send_photo(1, 0xF002u, g_photo2, g_crc_b, (uint16_t)MAX_CHUNK), 9);
  CHECK_EQ(shim_log_find("sync: gap"), 2);
  CHECK(shim_log_find_last("sync: gap n=8 ") != NULL);
  in_msg(SYNC_MSG_SYNC_DONE);
  CHECK(deliver());
  CHECK_EQ(storage_valid_slots(), 2);
  CHECK_EQ(shim_log_warnings(), 0);
  shim_set_time_step_ms(0);
}
#endif

/* --- CRC sbagliato: STATUS CRC_ERR e manifest intatto --- */
static void test_crc_error(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  start();
  sync_request(1);
  ack_all();
  photo_begin(2, 0xAB01u, FMT_RAW6, PHOTO_LEN, g_crc_a ^ 0xFFu);
  ack_all();
  for (uint32_t off = 0; off < PHOTO_LEN; off += MAX_CHUNK) {
    const uint32_t rem = PHOTO_LEN - off;
    const uint16_t n = (rem > MAX_CHUNK) ? (uint16_t)MAX_CHUNK : (uint16_t)rem;
    photo_data(2, off, g_photo + off, n);
  }
  photo_end(2);
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->code, SYNC_CODE_CRC_ERR);
    CHECK_EQ(m->slot, 2);
    CHECK_EQ(m->reply_to, SYNC_MSG_PHOTO_END);
  }
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK_EQ(storage_manifest()->slots[2].state, GAL_SLOT_EMPTY);
  ack_all();
}

/* --- app_message_open che fallisce (heap esaurito): sync muta, ma niente si blocca --- */
static void test_open_failure(void) {
  fresh(QUOTA_OK, INBOX_MAX_STD, FMT_RAW6);
  shim_am_set_open_result(APP_MSG_OUT_OF_MEMORY);   /* iniezione PRIMA di sync_init */
  start();
  CHECK_EQ(shim_am_open_count(), 1);
  CHECK(!shim_am_is_open());
  CHECK_EQ(shim_am_last_open_result(), APP_MSG_OUT_OF_MEMORY);
  CHECK_EQ(shim_am_callbacks_registered(), 4);      /* registrati PRIMA di open (regola 7) */
  CHECK_EQ(shim_am_inbox_size(), 0);                /* nessuna inbox: l'apertura non e' avvenuta */
  CHECK_EQ(shim_am_outbox_size(), 0);
  CHECK_EQ(sync_proto_max_chunk(), MAX_CHUNK);      /* il chunk si negozia comunque (inbox_size_maximum) */
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK(!shim_timer_pending());

  /* nessun messaggio raggiunge l'app: senza apertura il firmware non consegna nulla */
  const int warn0 = shim_log_warnings();
  in_msg(SYNC_MSG_JS_READY);
  CHECK(!deliver());
  in_msg(SYNC_MSG_ALBUM_DELETE);
  CHECK(shim_in_int32(MESSAGE_KEY_SLOT, 12));
  CHECK(!deliver());
  in_msg(SYNC_MSG_SYNC_REQUEST);
  CHECK(shim_in_int32(MESSAGE_KEY_COUNT, 2));
  CHECK(!deliver());
  CHECK_EQ(shim_am_deliver_calls(), 3);
  CHECK_EQ(shim_am_dropped_calls(), 0);             /* chiusa: nemmeno inbox_dropped */
  CHECK_EQ(shim_am_sent_count(), 0);                /* quindi nessuna risposta */
  CHECK_EQ(shim_am_sent_overflow(), 0);
  CHECK(shim_am_last_sent() == NULL);
  CHECK(shim_am_sent(0) == NULL);
  CHECK(!shim_am_in_flight());
  CHECK(!shim_am_writing());                        /* nessun OUT_WRITING appeso */
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);       /* niente SYNCING: nessun hold, nessun timer */
  CHECK(!shim_timer_pending());
  CHECK_EQ(shim_log_warnings(), warn0);             /* muta: nessun WARNING */
  CHECK_EQ(shim_ui_total_calls(), 0);
  /* la rotazione resta libera (l'hold si prende solo entrando in SYNCING) */
  model_tick(at(10, 0));
  model_shake();
  CHECK(shim_ui_total_calls() > 0);
  CHECK(!shim_timer_pending());                     /* perf 04/09: lo shake resta in RAM, nessun timer */
  /* con AppMessage chiusa outbox_begin da' INVALID_STATE senza toccare l'iteratore: e' l'esito che
   * fa scartare i messaggi in coda (provato sotto sulla coda vera con la stessa iniezione) */
  DictionaryIterator *it = NULL;
  CHECK_EQ(app_message_outbox_begin(&it), APP_MSG_INVALID_STATE);
  CHECK(it == NULL);
  CHECK_EQ(app_message_outbox_send(), APP_MSG_INVALID_STATE);

  /* sync_deinit dopo un'apertura fallita: coerente e idempotente */
  sync_deinit();
  CHECK_EQ(shim_am_callbacks_registered(), 0);
  CHECK(!shim_timer_pending());
  sync_deinit();
  CHECK_EQ(shim_am_callbacks_registered(), 0);
  CHECK_EQ(shim_am_open_count(), 1);                /* deinit non apre e non chiude nulla */

  /* sync_init dopo un open FALLITO riapre davvero: il vincolo "una sola open per esecuzione"
   * dell'SDK 4.33.1 riguarda le aperture RIUSCITE (qui l'inbox non e' mai esistita) */
  shim_am_set_open_result(APP_MSG_OK);
  sync_init();
  CHECK_EQ(shim_am_open_count(), 2);
  CHECK(shim_am_is_open());
  CHECK_EQ(shim_am_last_open_result(), APP_MSG_OK);
  CHECK_EQ(shim_am_inbox_size(), INBOX_EMERY);
  CHECK_EQ(shim_am_outbox_size(), OUTBOX_EXACT);
  CHECK_EQ(shim_am_callbacks_registered(), 4);
  shim_ui_reset_counters();
  js_ready();                                       /* i messaggi arrivano di nuovo */
  CHECK_EQ(shim_am_sent_count(), 1);
  const ShimSentMsg *m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->msg, SYNC_MSG_HELLO);
    CHECK_EQ(m->bytes, OUTBOX_EXACT);
  }
  ack_all();

  /* coda che non si blocca quando outbox_begin fallisce SEMPRE con INVALID_STATE (l'esito di
   * un'AppMessage chiusa): i messaggi accodati vengono scartati uno per uno con un WARNING
   * ciascuno e la coda torna vuota, senza restare appesa */
  ping(20);                                         /* parte subito: in volo */
  CHECK_EQ(shim_am_sent_count(), 2);
  ping(21);
  ping(22);
  ping(23);                                         /* coda piena (4 posti: 3 in attesa) */
  CHECK_EQ(shim_am_sent_count(), 2);
  shim_log_reset();
  shim_am_fail_outbox_begin(APP_MSG_INVALID_STATE);
  CHECK(shim_am_outbox_sent());                     /* pop di 20 -> pump: 21, 22, 23 scartati */
  CHECK_EQ(shim_log_warnings(), 3);
  CHECK_EQ(shim_am_sent_count(), 2);                /* HELLO + ping 20 e basta */
  CHECK(!shim_am_in_flight());
  CHECK(!shim_am_writing());
  shim_am_fail_outbox_begin(APP_MSG_OK);
  ping(24);                                         /* la coda e' vuota: si riparte subito */
  CHECK_EQ(shim_am_sent_count(), 3);
  m = shim_am_last_sent();
  CHECK(m != NULL);
  if (m) {
    CHECK_EQ(m->slot, 24);
    CHECK_EQ(m->reply_to, SYNC_MSG_ALBUM_DELETE);
  }
  ack_all();
  CHECK(!shim_am_in_flight());
}

/* ================================ main ================================ */

static void run(const char *name, void (*fn)(void)) {
  const int ok0 = g_ok, fail0 = g_fail;
  fn();
  /* Lo shim registra i primi SHIM_AM_SENT_MAX messaggi spediti dall'ultimo shim_am_reset (= dall'ultima
   * fresh() dello scenario): oltre quel tetto shim_am_sent()/shim_am_last_sent() ritornano NULL e le
   * asserzioni sui messaggi diventerebbero vacue. Deve restare 0: se scatta, va alzato il tetto. */
  CHECK_EQ(shim_am_sent_overflow(), 0);
  printf("  %-26s %4d ok, %d falliti\n", name, g_ok - ok0, g_fail - fail0);
}

int main(void) {
  shim_set_log(getenv("GALLERIA_TEST_VERBOSE") != NULL);
  fill_photos();
  run("init_sizes",          test_init_sizes);
  run("hello",               test_hello);
  run("outbox_tripwire",     test_outbox_tripwire);
  run("negotiation",         test_negotiation);
  run("status_reply_to",     test_status_reply_to);
  run("decode",              test_decode);
  run("inbox_dropped",       test_inbox_dropped);
  run("queue_full",          test_queue_full);
  run("queue_failures",      test_queue_failures);
  run("idle_timer",          test_idle_timer);
  run("progress",            test_progress);
  run("hold_during_sync",    test_hold_during_sync);
  run("hold_timeout",        test_hold_released_by_timeout);
  run("album_changes_idle",  test_album_changes_idle);
  run("env_settings",        test_env_settings);
  run("settings_message",    test_settings_message);
  run("deinit",              test_deinit);
  run("open_failure",        test_open_failure);
  run("two_photos",          test_two_photos);
#ifdef GALLERIA_DEBUG_TIMING
  run("gap_once",            test_gap_once);
#endif
  run("crc_error",           test_crc_error);
  printf("sync: %d ok, %d falliti\n", g_ok, g_fail);
  return g_fail ? 1 : 0;
}

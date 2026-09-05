/* test_sync_proto.c — test host ADVERSARIALE di sync_proto.c (gcc + shim/pebble.h, nessun
 * ARM/emulatore). Esegue: make -C apps/galleria/test run-test_sync_proto
 * GALLERIA_TEST_VERBOSE=1 nell'ambiente per vedere gli APP_LOG di storage.c/settings.c.
 *
 * sync_proto.c e' PURO ma tocca il persist via storage.c e le impostazioni via settings.c: qui
 * vengono compilati tutti INALTERATI (storage.c/settings.c con lo shim host di <pebble.h>).
 * Le tre funzioni d'ambiente sync_env_* sono implementate qui come stub che contano le chiamate e
 * registrano gli argomenti.
 *
 * Copre: HELLO (proto/max_chunk/SLOTS), SYNC_REQUEST (idempotenza, album disabilitato, chunk 0),
 * PHOTO_BEGIN (campi mancanti, slot/format/length/photo_id invalidi, quota, ripresa), PHOTO_DATA
 * (sequenza, duplicati, pezzi validi/invalidi, scrittura byte-esatta dei chunk, CRC progressivo,
 * E_OUT_OF_STORAGE / errore generico), PHOTO_END (SEQ_ERR, CRC_ERR, commit, commit fallito),
 * SYNC_DONE, timeout, SETTINGS, ALBUM_ORDER, ALBUM_DELETE, MSG ignoti, due foto + riavvio,
 * sostituzione interrotta.
 *
 * Ogni scenario riparte da zero (shim_persist_reset + storage_init + settings_init +
 * sync_proto_init): nessun test dipende dall'ordine di esecuzione. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pebble.h>          /* shim host: test/shim/pebble.h (-Ishim davanti a -I../src/c) */
#include "sync_proto.h"
#include "storage.h"
#include "settings.h"
#include "photo_codec.h"
#include "crc.h"

static int g_ok, g_fail;
#define CHECK(cond) do { if (cond) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_EQ(a, b) do { long long _a = (long long)(a), _b = (long long)(b); if (_a == _b) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s = %lld, atteso %s = %lld\n", __FILE__, __LINE__, #a, _a, #b, _b); } } while (0)

#define QUOTA_OK      (1024u * 1024u)        /* 1 MiB: album abilitato (GAL_MIN_QUOTA) */
#define QUOTA_BAD     4096u                  /* fallback SDK < 4.17: album disabilitato */
#define FMT_RAW6      PHOTO_FMT_RAW6_200x228 /* formato nativo emery in questi test */
#define FMT_RAW1      PHOTO_FMT_RAW1_144x168
#define PHOTO_LEN     ((uint32_t)RAW6_BYTES) /* 34.200 */
#define PHOTO_CHUNKS  134                    /* 133 x 256 + 152 */
#define LAST_CHUNK_N  152
#define MAX_CHUNK     4096                   /* SYNC_MAX_CHUNK_BYTES */

/* ---- ambiente (sync_env_*): stub che contano e registrano ---- */

static int         g_album_changed;
static int         g_settings_changed;
static GalSettings g_settings_before;        /* copia: il puntatore vive solo nella callback */
static int         g_progress_calls;
static int         g_progress_index, g_progress_count;

void sync_env_album_changed(void) {
  g_album_changed++;
}

void sync_env_settings_changed(const GalSettings *before) {
  g_settings_changed++;
  if (before) {
    g_settings_before = *before;
  } else {
    g_fail++;
    printf("FAIL sync_env_settings_changed(NULL)\n");
  }
}

void sync_env_progress(uint8_t index, uint8_t count) {
  g_progress_calls++;
  g_progress_index = index;
  g_progress_count = count;
}

static void env_reset(void) {
  g_album_changed = 0;
  g_settings_changed = 0;
  g_progress_calls = 0;
  g_progress_index = -1;
  g_progress_count = -1;
  memset(&g_settings_before, 0, sizeof(g_settings_before));
}

/* ---- payload deterministici (LCG, come test_storage.c) ---- */

static uint8_t  g_photo[PHOTO_LEN];          /* foto A */
static uint8_t  g_photo2[PHOTO_LEN];         /* foto B */
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

/* ---- helper di scenario ---- */

static SyncOut g_out;

static SyncAction handle(const SyncIn *in) {
  SyncAction act = sync_proto_handle(in, &g_out);
  if (g_out.msg == SYNC_MSG_STATUS) {
    CHECK_EQ(g_out.reply_to, in->msg);       /* S5b: ogni STATUS dice a quale messaggio risponde */
  } else {
    CHECK_EQ(g_out.reply_to, 0);
  }
  return act;
}

/* Riparte da zero: svuota il debounce delle impostazioni rimasto dallo scenario precedente
 * (storage.c ha stato static che shim_persist_reset non tocca), poi persist vuoto e moduli reinit. */
static void fresh(uint32_t quota, uint16_t max_chunk) {
  shim_fail_writes_after(-1);
  shim_fail_writes_code(E_OUT_OF_STORAGE);
  storage_flush();                           /* scrive/scarta la copia pendente sul persist vecchio */
  shim_persist_reset();
  shim_set_quota(quota);
  (void)storage_init();
  settings_init();
  sync_proto_init(FMT_RAW6, max_chunk);
  env_reset();
}

/* v1.9 (F13/F49): forza storage_open_ms() = ms con l'orologio finto dello shim (le due letture di
 * time_ms in storage_init distano `ms`), poi ferma l'orologio. Dopo fresh(). */
static void force_open_ms(uint16_t ms) {
  shim_set_time_ms(7, 100);
  shim_set_time_step_ms((int32_t)ms);
  (void)storage_init();
  shim_set_time_step_ms(0);
  CHECK_EQ(storage_open_ms(), ms);
}

static SyncIn mk(uint8_t msg) {
  SyncIn in;
  memset(&in, 0, sizeof(in));
  in.msg = msg;
  return in;
}

static SyncIn begin_in(uint8_t slot, uint32_t photo_id, uint8_t format, uint32_t length, uint32_t crc) {
  SyncIn in = mk(SYNC_MSG_PHOTO_BEGIN);
  in.fields = SYNC_F_SLOT | SYNC_F_PHOTO_ID | SYNC_F_FORMAT | SYNC_F_LENGTH | SYNC_F_CRC;
  in.slot = slot;
  in.photo_id = photo_id;
  in.format = format;
  in.length = length;
  in.crc = crc;
  return in;
}

static SyncIn data_in(uint8_t slot, uint32_t offset, const uint8_t *p, uint16_t n) {
  SyncIn in = mk(SYNC_MSG_PHOTO_DATA);
  in.fields = SYNC_F_SLOT | SYNC_F_OFFSET | SYNC_F_DATA;
  in.slot = slot;
  in.offset = offset;
  in.data = p;
  in.data_len = n;
  return in;
}

static SyncIn end_in(uint8_t slot) {
  SyncIn in = mk(SYNC_MSG_PHOTO_END);
  in.fields = SYNC_F_SLOT;
  in.slot = slot;
  return in;
}

/* SYNC_REQUEST accettata ⇒ progress(0, count) (la UI azzera "Foto k/n": correzione S5a). L'helper lo
 * verifica e poi azzera i contatori dell'avanzamento, così gli scenari contano solo ciò che segue. */
static SyncAction sync_request(uint8_t count) {
  SyncIn in = mk(SYNC_MSG_SYNC_REQUEST);
  in.fields = SYNC_F_COUNT;
  in.count = count;
  const int calls0 = g_progress_calls;
  const SyncAction a = handle(&in);
  if (g_out.msg == SYNC_MSG_SYNC_READY) {
    CHECK_EQ(g_progress_calls, calls0 + 1);
    CHECK_EQ(g_progress_index, 0);
    CHECK_EQ(g_progress_count, count);
    g_progress_calls = 0;
    g_progress_index = -1;
    g_progress_count = -1;
  } else {
    CHECK_EQ(g_progress_calls, calls0);      /* rifiutata: nessuna notifica */
  }
  return a;
}

/* F3: SYNC_REQUEST con OFFSET = foto gia' concluse (ripresa dopo un BUSY a meta' album, o PKJS che
 * rinnova la richiesta): accettata ⇒ progress(want_index, count), dove want_index = min(OFFSET,
 * count − 1) (0 se count e' 0) e' passato esplicitamente dal chiamante. Azzera i contatori come
 * sync_request. */
static SyncAction sync_request_at(uint8_t count, uint32_t offset, int want_index) {
  SyncIn in = mk(SYNC_MSG_SYNC_REQUEST);
  in.fields = SYNC_F_COUNT | SYNC_F_OFFSET;
  in.count = count;
  in.offset = offset;
  const int calls0 = g_progress_calls;
  const SyncAction a = handle(&in);
  if (g_out.msg == SYNC_MSG_SYNC_READY) {
    CHECK_EQ(g_progress_calls, calls0 + 1);
    CHECK_EQ(g_progress_index, want_index);
    CHECK_EQ(g_progress_count, count);
    g_progress_calls = 0;
    g_progress_index = -1;
    g_progress_count = -1;
  } else {
    CHECK_EQ(g_progress_calls, calls0);      /* rifiutata: nessuna notifica */
  }
  return a;
}

/* Manda i DATA di [from, len) a pezzi di `piece` byte (offset ASSOLUTI dentro buf); ritorna quante
 * risposte (STATUS) sono arrivate: in una sequenza corretta devono essere 0 (basta l'ACK). */
static int send_data_range(uint8_t slot, const uint8_t *buf, uint32_t from, uint32_t len, uint16_t piece) {
  int replies = 0;
  for (uint32_t off = from; off < len; off += piece) {
    const uint32_t rem = len - off;
    const uint16_t n = (rem > (uint32_t)piece) ? piece : (uint16_t)rem;
    SyncIn in = data_in(slot, off, buf + off, n);
    if (handle(&in) != SYNC_ACT_NONE) {
      replies++;
    }
  }
  return replies;
}

static int send_all_data(uint8_t slot, const uint8_t *buf, uint32_t len, uint16_t piece) {
  return send_data_range(slot, buf, 0, len, piece);
}

/* Trasferimento completo e riuscito (BEGIN + DATA + END); lascia la risposta in g_out. */
static void send_photo(uint8_t slot, uint32_t photo_id, const uint8_t *buf, uint32_t crc, uint16_t piece) {
  SyncIn b = begin_in(slot, photo_id, FMT_RAW6, PHOTO_LEN, crc);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(send_all_data(slot, buf, PHOTO_LEN, piece), 0);
  SyncIn e = end_in(slot);
  CHECK_EQ(handle(&e), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
}

/* Verifica byte a byte i chunk persist 1000 + slot*256 + i contro il buffer sorgente. */
static void check_chunks(uint8_t slot, const uint8_t *buf, uint32_t len, const char *what) {
  const uint16_t nchunks = (uint16_t)((len + GAL_CHUNK_BYTES - 1) / GAL_CHUNK_BYTES);
  int missing = 0, bad_len = 0, bad_bytes = 0;
  for (uint16_t i = 0; i < nchunks; i++) {
    const uint32_t off = (uint32_t)i * GAL_CHUNK_BYTES;
    const uint32_t rem = len - off;
    const uint16_t n = (rem > (uint32_t)GAL_CHUNK_BYTES) ? (uint16_t)GAL_CHUNK_BYTES : (uint16_t)rem;
    const uint32_t key = GAL_KEY_CHUNK(slot, i);
    const uint8_t *p = shim_key_bytes(key);
    if (!p) {
      missing++;
      continue;
    }
    if (shim_key_len(key) != (int)n) {
      bad_len++;
    } else if (memcmp(p, buf + off, n) != 0) {
      bad_bytes++;
    }
  }
  if (missing || bad_len || bad_bytes) {
    g_fail++;
    printf("FAIL chunk di %s (slot %u): %d assenti, %d lunghezza sbagliata, %d diversi\n",
           what, (unsigned)slot, missing, bad_len, bad_bytes);
  } else {
    g_ok++;
  }
}

static uint8_t hello_state(const uint8_t *slots, uint8_t k) {
  return slots[(uint16_t)k * 5u];
}

static uint32_t hello_crc(const uint8_t *slots, uint8_t k) {
  const uint8_t *p = slots + (uint16_t)k * 5u;
  return (uint32_t)p[1] | ((uint32_t)p[2] << 8) | ((uint32_t)p[3] << 16) | ((uint32_t)p[4] << 24);
}

static void mk_valid_settings(GalSettings *s) {
  memset(s, 0, sizeof(*s));
  s->schema       = GAL_SETTINGS_SCHEMA;
  s->layout       = GAL_LAYOUT_B;
  s->font         = GAL_FONT_BARLOW;
  s->clock_mode   = GAL_CLOCK_24H;
  s->leading_zero = GAL_LZ_ON;
  s->text_color   = GAL_TEXT_YELLOW;
  s->outline      = GAL_OUTLINE_ALWAYS;
  s->interval_min = 180;
  s->order        = GAL_ORDER_RANDOM;
  s->shake_next   = 0;
  s->info_row     = GAL_INFO_STEPS | GAL_INFO_DATE;
  s->crc16        = 0xDEAD;                  /* ignorato dal protocollo: lo ricalcola storage.c */
}

static SyncAction send_settings(const void *blob, uint16_t len) {
  SyncIn in = mk(SYNC_MSG_SETTINGS);
  in.fields = SYNC_F_SETTINGS;
  in.settings = (const uint8_t *)blob;
  in.settings_len = len;
  return handle(&in);
}

static void expect_settings_rejected(GalSettings s, const char *what) {
  const GalSettings before = *settings_get();
  const int sc = g_settings_changed;
  CHECK_EQ(send_settings(&s, (uint16_t)sizeof(s)), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);
  CHECK_EQ(g_settings_changed, sc);
  if (memcmp(&before, settings_get(), sizeof(before)) != 0) {
    g_fail++;
    printf("FAIL impostazioni modificate da un blob invalido: %s\n", what);
  } else {
    g_ok++;
  }
}

static SyncAction send_order(const uint8_t *order, uint16_t len) {
  SyncIn in = mk(SYNC_MSG_ALBUM_ORDER);
  in.fields = SYNC_F_ORDER;
  in.order = order;
  in.order_len = len;
  return handle(&in);
}

static void expect_order_rejected(const uint8_t *order, uint16_t len, const char *what) {
  uint8_t before[GAL_MAX_SLOTS];
  memcpy(before, storage_manifest()->order, sizeof(before));
  const int ac = g_album_changed;
  CHECK_EQ(send_order(order, len), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);
  CHECK_EQ(g_album_changed, ac);
  if (memcmp(before, storage_manifest()->order, sizeof(before)) != 0) {
    g_fail++;
    printf("FAIL order modificato da un ALBUM_ORDER invalido: %s\n", what);
  } else {
    g_ok++;
  }
}

/* ================================ scenari ================================ */

/* API elementari: init, arrotondamento del chunk, stato/pending iniziali, argomenti NULL. */
static void test_api_basics(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK_EQ(sync_proto_max_chunk(), MAX_CHUNK);

  uint8_t slot = 7;
  uint32_t next = 99;
  CHECK(!sync_proto_pending(&slot, &next));
  CHECK_EQ(slot, GAL_SLOT_NONE);
  CHECK_EQ(next, 0);
  CHECK(!sync_proto_pending(NULL, NULL));

  /* arrotondamento per difetto al multiplo di 256 */
  sync_proto_set_max_chunk(4095);
  CHECK_EQ(sync_proto_max_chunk(), 3840);
  sync_proto_set_max_chunk(255);
  CHECK_EQ(sync_proto_max_chunk(), 0);
  sync_proto_set_max_chunk(256);
  CHECK_EQ(sync_proto_max_chunk(), 256);
  sync_proto_set_max_chunk(0);
  CHECK_EQ(sync_proto_max_chunk(), 0);
  sync_proto_init(FMT_RAW6, 300);
  CHECK_EQ(sync_proto_max_chunk(), 256);
  /* NOTA: nessun clamp a SYNC_MAX_CHUNK_BYTES; sync.c e' l'unico a decidere il valore. */
  sync_proto_set_max_chunk(65535);
  CHECK_EQ(sync_proto_max_chunk(), 65280);

  /* argomenti NULL: nessuna azione, nessun crash */
  sync_proto_init(FMT_RAW6, MAX_CHUNK);
  SyncIn in = mk(SYNC_MSG_JS_READY);
  CHECK_EQ(sync_proto_handle(&in, NULL), SYNC_ACT_NONE);
  CHECK_EQ(sync_proto_handle(NULL, &g_out), SYNC_ACT_NONE);
  CHECK_EQ(g_out.msg, SYNC_MSG_NONE);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);       /* out sempre azzerato + slot NONE */

  /* msg 0 (chiave MSG assente nel dizionario) */
  SyncIn none = mk(SYNC_MSG_NONE);
  none.fields = SYNC_F_SLOT;
  none.slot = 3;
  CHECK_EQ(handle(&none), SYNC_ACT_NONE);
  CHECK_EQ(g_out.msg, SYNC_MSG_NONE);
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
}

/* JS_READY -> HELLO: proto, max_chunk, SLOTS coerenti con il manifest. */
static void test_hello(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  force_open_ms(2150);                       /* il numero di campo del 04/09 (file gonfio) */
  SyncIn js = mk(SYNC_MSG_JS_READY);
  CHECK_EQ(handle(&js), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_HELLO);
  CHECK_EQ(g_out.proto, SYNC_PROTO_VERSION);
  CHECK_EQ(g_out.proto, 1);
  CHECK_EQ(g_out.max_chunk, MAX_CHUNK);
  CHECK_EQ(g_out.slots_len, SYNC_SLOTS_BYTES);
  CHECK_EQ(SYNC_SLOTS_BYTES, 60);
  /* F4: l'outbox di sync.c e' dimensionata sul HELLO (il messaggio piu' grande) con
   * dict_calc_buffer_size(7, 1, 1, 1, 2, 2, 2, SYNC_SLOTS_BYTES) = 1 + 7 tuple x 7 B di intestazione +
   * 69 B di valori = 119 B (v1.9; emery e flint: log "sync: open(4153/119)" / "open(3129/119)"). Questo pin
   * fissa solo il valore atteso: sync.c NON e' compilato su host, quindi un campo aggiunto senza
   * aggiornare la chiamata di sync_init lo rileva solo il tripwire WARNING in emulatore (gate). */
  CHECK_EQ(SYNC_HELLO_VALUE_BYTES, 69);                 /* v1.9: + OPEN_MS u16 */
  CHECK_EQ(1 + 7 * 7 + SYNC_HELLO_VALUE_BYTES, 119);
  CHECK(g_out.slots != NULL);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);       /* SLOT non pertinente in HELLO */
  /* S5b: CRC-16/CCITT-FALSE dei primi 18 B delle impostazioni correnti (qui i default) */
  {
    GalSettings def;
    settings_set_defaults(&def);
    CHECK_EQ(g_out.settings_crc, crc16_ccitt((const uint8_t *)&def, sizeof(def) - 2));
    CHECK_EQ(g_out.settings_crc, crc16_ccitt((const uint8_t *)settings_get(), sizeof(GalSettings) - 2));
    CHECK(g_out.settings_crc != 0);
    CHECK_EQ(g_out.open_ms, 2150);           /* v1.9: apertura del file persist nel HELLO (u16, non 0 == 0) */
    CHECK_EQ(g_out.open_ms, storage_open_ms());
  }
  for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {  /* album vuoto: tutto a zero */
    CHECK_EQ(hello_state(g_out.slots, k), 0);
    CHECK_EQ(hello_crc(g_out.slots, k), 0);
  }
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE); /* JS_READY non cambia stato */

  /* una foto committata: state 1 e crc32 LE nello slot giusto, gli altri a zero */
  CHECK(sync_request(1) == SYNC_ACT_SEND);
  send_photo(4, 0xAABBCCDDu, g_photo, g_crc_a, MAX_CHUNK);
  CHECK_EQ(handle(&js), SYNC_ACT_SEND);
  CHECK_EQ(g_out.open_ms, 2150);             /* stessa esecuzione: stesso valore a ogni HELLO */
  CHECK_EQ(hello_state(g_out.slots, 4), 1);
  CHECK_EQ(hello_crc(g_out.slots, 4), g_crc_a);
  CHECK_EQ(g_out.slots[4 * 5 + 1], (uint8_t)(g_crc_a & 0xFFu));           /* little-endian */
  CHECK_EQ(g_out.slots[4 * 5 + 4], (uint8_t)((g_crc_a >> 24) & 0xFFu));
  for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {
    if (k == 4) {
      continue;
    }
    CHECK_EQ(hello_state(g_out.slots, k), 0);
    CHECK_EQ(hello_crc(g_out.slots, k), 0);
  }
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING); /* JS_READY non interrompe la sync in corso */

  /* dopo ALBUM_DELETE lo slot torna a {0, 0} anche se il manifest conserva crc32/length */
  SyncIn del = mk(SYNC_MSG_ALBUM_DELETE);
  del.fields = SYNC_F_SLOT;
  del.slot = 4;
  CHECK_EQ(handle(&del), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(storage_manifest()->slots[4].crc32, g_crc_a);   /* resta nel manifest... */
  CHECK_EQ(handle(&js), SYNC_ACT_SEND);
  CHECK_EQ(hello_state(g_out.slots, 4), 0);                /* ...ma HELLO annuncia 0 */
  CHECK_EQ(hello_crc(g_out.slots, 4), 0);
}

/* Album disabilitato (quota < 1 MiB) e chunk 0: HELLO annuncia 0, SYNC_REQUEST -> NOT_SUPPORTED. */
static void test_hello_disabled(void) {
  fresh(QUOTA_BAD, MAX_CHUNK);
  CHECK(!storage_album_enabled());
  force_open_ms(3000);
  SyncIn js = mk(SYNC_MSG_JS_READY);
  CHECK_EQ(handle(&js), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_HELLO);
  CHECK_EQ(g_out.max_chunk, 0);              /* album disabilitato */
  CHECK_EQ(g_out.open_ms, 3000);             /* F49: OPEN_MS anche con MAX_CHUNK 0 (l'unica informazione utile) */
  CHECK_EQ(g_out.slots_len, SYNC_SLOTS_BYTES);
  CHECK_EQ(sync_proto_max_chunk(), MAX_CHUNK); /* il chunk negoziato resta quello di sync.c */

  CHECK_EQ(sync_request(3), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_NOT_SUPPORTED);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK_EQ(g_progress_calls, 0);

  /* fuori da SYNCING i messaggi di foto sono BUSY */
  SyncIn b = begin_in(0, 1, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BUSY);

  /* album disabilitato: ordine ed eliminazione non sono supportati... */
  uint8_t ord[GAL_MAX_SLOTS];
  memset(ord, GAL_SLOT_NONE, sizeof(ord));
  ord[0] = 2;
  CHECK_EQ(send_order(ord, GAL_MAX_SLOTS), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_NOT_SUPPORTED);
  CHECK_EQ(g_album_changed, 0);
  SyncIn del = mk(SYNC_MSG_ALBUM_DELETE);
  del.fields = SYNC_F_SLOT;
  del.slot = 2;
  CHECK_EQ(handle(&del), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_NOT_SUPPORTED);
  CHECK_EQ(g_album_changed, 0);

  /* ...ma le impostazioni si salvano comunque (storage.h: "le impostazioni si salvano comunque") */
  GalSettings s;
  mk_valid_settings(&s);
  CHECK_EQ(send_settings(&s, (uint16_t)sizeof(s)), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_settings_changed, 1);
  CHECK_EQ(settings_get()->layout, GAL_LAYOUT_B);

  /* max_chunk 0 con album abilitato: HELLO 0 e SYNC_REQUEST NOT_SUPPORTED */
  fresh(QUOTA_OK, 0);
  CHECK_EQ(handle(&js), SYNC_ACT_SEND);
  CHECK_EQ(g_out.max_chunk, 0);
  CHECK_EQ(sync_request(2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_NOT_SUPPORTED);
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  /* anche un chunk "non nullo ma < 256" viene arrotondato a 0 */
  fresh(QUOTA_OK, 200);
  CHECK_EQ(sync_proto_max_chunk(), 0);
  CHECK_EQ(sync_request(2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_NOT_SUPPORTED);
}

/* SYNC_REQUEST: IDLE -> SYNCING, idempotente se ripetuto. */
static void test_sync_request(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(5), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_SYNC_READY);
  CHECK_EQ(g_out.max_chunk, MAX_CHUNK);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  CHECK_EQ(g_progress_calls, 0);             /* progress(0, 5) verificato e azzerato dall'helper */

  /* prima foto avviata e mezza trasferita */
  SyncIn b = begin_in(1, 0x11u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_progress_calls, 1);
  CHECK_EQ(g_progress_index, 1);
  CHECK_EQ(g_progress_count, 5);
  SyncIn d = data_in(1, 0, g_photo, MAX_CHUNK);
  CHECK_EQ(handle(&d), SYNC_ACT_NONE);
  uint8_t slot = 0;
  uint32_t next = 0;
  CHECK(sync_proto_pending(&slot, &next));
  CHECK_EQ(slot, 1);
  CHECK_EQ(next, MAX_CHUNK);

  /* SYNC_REQUEST ripetuto SENZA OFFSET (SYNC_READY perso, o PKJS vecchio): pending abbandonato,
   * indice azzerato → il BEGIN successivo mostra "Foto 1/7" (F3: OFFSET assente vale 0) */
  CHECK_EQ(sync_request(7), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_SYNC_READY);
  CHECK_EQ(g_out.max_chunk, MAX_CHUNK);
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  CHECK(!sync_proto_pending(&slot, &next));
  CHECK_EQ(slot, GAL_SLOT_NONE);
  CHECK_EQ(next, 0);
  CHECK_EQ(g_progress_calls, 0);             /* solo progress(0, 7) dell'helper, gia' azzerato */
  SyncIn b2 = begin_in(1, 0x11u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b2), SYNC_ACT_SEND);
  CHECK_EQ(g_progress_index, 1);             /* indice ripartito da 1: senza OFFSET resta cosi' */
  CHECK_EQ(g_progress_count, 7);             /* nuovo COUNT */

  /* F3: SYNC_REQUEST rinnovata dal telefono dopo un BUSY a meta' album, CON OFFSET = foto gia'
   * concluse: "Foto k/n" riprende da k (prima ripartiva da 1 e la riga info tornava indietro). */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(5), SYNC_ACT_SEND);
  SyncIn ob1 = begin_in(1, 0x21u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&ob1), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_progress_index, 1);
  CHECK_EQ(g_progress_count, 5);
  SyncIn od1 = data_in(1, 0, g_photo, MAX_CHUNK);
  CHECK_EQ(handle(&od1), SYNC_ACT_NONE);
  CHECK(sync_proto_pending(&slot, &next));
  CHECK_EQ(sync_request_at(7, 2, 2), SYNC_ACT_SEND);   /* progress(2, 7): 2 foto gia' concluse */
  CHECK_EQ(g_out.msg, SYNC_MSG_SYNC_READY);
  CHECK_EQ(g_out.max_chunk, MAX_CHUNK);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  CHECK(!sync_proto_pending(&slot, &next));  /* la foto a meta' e' abbandonata */
  CHECK_EQ(slot, GAL_SLOT_NONE);
  CHECK_EQ(next, 0);
  SyncIn ob2 = begin_in(3, 0x23u, FMT_RAW6, PHOTO_LEN, g_crc_a);   /* foto nuova */
  CHECK_EQ(handle(&ob2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(g_progress_calls, 1);
  CHECK_EQ(g_progress_index, 3);             /* 2 concluse + questa: "Foto 3/7" */
  CHECK_EQ(g_progress_count, 7);
  SyncIn ob2r = begin_in(3, 0x23u, FMT_RAW6, PHOTO_LEN, g_crc_a);  /* ritrasmissione: ferma */
  CHECK_EQ(handle(&ob2r), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_progress_calls, 1);
  CHECK_EQ(g_progress_index, 3);

  /* clamp: OFFSET >= COUNT → count − 1, cosi' il BEGIN successivo mostra n/n e mai n+1/n */
  CHECK_EQ(sync_request_at(7, 9, 6), SYNC_ACT_SEND);
  SyncIn ob3 = begin_in(4, 0x24u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&ob3), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_progress_index, 7);
  CHECK_EQ(g_progress_count, 7);
  CHECK_EQ(sync_request_at(7, 7, 6), SYNC_ACT_SEND);            /* == COUNT: stesso clamp */
  CHECK_EQ(sync_request_at(7, 0xFFFFFFFFu, 6), SYNC_ACT_SEND);  /* u32 alto (JS int32 -1) */
  CHECK_EQ(sync_request_at(255, 300, 254), SYNC_ACT_SEND);      /* COUNT massimo */
  /* COUNT 0 → (0, 0) qualunque OFFSET; OFFSET 0 esplicito = come senza OFFSET */
  CHECK_EQ(sync_request_at(0, 3, 0), SYNC_ACT_SEND);
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  CHECK_EQ(sync_request_at(4, 0, 0), SYNC_ACT_SEND);
  SyncIn ob4 = begin_in(0, 0x26u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&ob4), SYNC_ACT_SEND);
  CHECK_EQ(g_progress_index, 1);
  CHECK_EQ(g_progress_count, 4);
  /* dopo il timeout di silenzio (IDLE, progress(0, 0)) la richiesta con OFFSET riprende da li' */
  CHECK(sync_proto_timeout());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK_EQ(g_progress_index, 0);
  CHECK_EQ(g_progress_count, 0);
  CHECK_EQ(sync_request_at(3, 1, 1), SYNC_ACT_SEND);
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  SyncIn b7 = begin_in(2, 0x27u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b7), SYNC_ACT_SEND);
  CHECK_EQ(g_progress_index, 2);
  CHECK_EQ(g_progress_count, 3);
  /* album disabilitato / chunk 0: rifiutata anche con OFFSET, nessun progress (helper) */
  fresh(QUOTA_BAD, MAX_CHUNK);
  CHECK_EQ(sync_request_at(3, 1, 1), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_NOT_SUPPORTED);
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);

  /* PHOTO_BEGIN ritrasmesso con OFFSET 0/assente (STATUS OK perso sul BT) per la STESSA foto e
   * next == 0: e' una ripresa (correzione S5a): OK(0), pending conservato, NESSUN nuovo progress
   * (prima l'indice cresceva a ogni ritrasmissione: "Foto 2/1"). */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  for (int k = 1; k <= 3; k++) {
    SyncIn rb = begin_in(0, 0x1234u, FMT_RAW6, PHOTO_LEN, g_crc_a);
    if (k == 2) {
      rb.fields |= SYNC_F_OFFSET;            /* anche con OFFSET 0 esplicito */
      rb.offset = 0;
    }
    CHECK_EQ(handle(&rb), SYNC_ACT_SEND);
    CHECK_EQ(g_out.code, SYNC_CODE_OK);
    CHECK_EQ(g_out.offset, 0);
    CHECK_EQ(g_progress_calls, 1);
    CHECK_EQ(g_progress_index, 1);
    CHECK_EQ(g_progress_count, 1);
  }
  /* ...ma con un pending gia' avanzato un BEGIN da 0 riparte davvero (indice fermo: stessa foto) */
  SyncIn d0 = data_in(0, 0, g_photo, MAX_CHUNK);
  CHECK_EQ(handle(&d0), SYNC_ACT_NONE);
  SyncIn rb0 = begin_in(0, 0x1234u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&rb0), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(g_progress_calls, 1);             /* nuovo pending ma STESSA foto (slot+photo_id): "Foto 1/1" resta (revisione S5a) */
  CHECK_EQ(g_progress_index, 1);
  /* ...e una foto DIVERSA nello stesso slot avanza */
  SyncIn rb1 = begin_in(0, 0x1235u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&rb1), SYNC_ACT_SEND);
  CHECK_EQ(g_progress_calls, 2);
  CHECK_EQ(g_progress_index, 2);

  /* SYNC_REQUEST senza COUNT: count = 0 */
  fresh(QUOTA_OK, MAX_CHUNK);
  SyncIn r = mk(SYNC_MSG_SYNC_REQUEST);      /* nessun campo */
  CHECK_EQ(handle(&r), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_SYNC_READY);
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  SyncIn b3 = begin_in(0, 1, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b3), SYNC_ACT_SEND);
  CHECK_EQ(g_progress_index, 1);
  CHECK_EQ(g_progress_count, 0);
}

/* R01 (S9): PHOTO_BEGIN con COUNT = k esplicito: "Foto k/n" non resta indietro per le foto che il
 * telefono salta senza un BEGIN accettato (load fallito, BAD_FORMAT/NO_SPACE) e arriva a n/n;
 * senza COUNT (PKJS <= v1.9) resta il contatore locale; clamp a n; COUNT 0 = assente. */
static void test_begin_count_k(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(3), SYNC_ACT_SEND);
  /* la foto 1 e' stata saltata dal telefono (load fallito): il BEGIN della foto 2 porta COUNT 2 */
  SyncIn b2 = begin_in(1, 0x31u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  b2.fields |= SYNC_F_COUNT;
  b2.count = 2;
  CHECK_EQ(handle(&b2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_progress_calls, 1);
  CHECK_EQ(g_progress_index, 2);             /* "Foto 2/3", non 1/3 */
  CHECK_EQ(g_progress_count, 3);
  CHECK_EQ(handle(&b2), SYNC_ACT_SEND);      /* ritrasmissione (STATUS perso): ferma */
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_progress_calls, 1);
  SyncIn b3 = begin_in(2, 0x32u, FMT_RAW6, PHOTO_LEN, g_crc_a);   /* foto 3: "Foto 3/3" (prima: 2/3) */
  b3.fields |= SYNC_F_COUNT;
  b3.count = 3;
  CHECK_EQ(handle(&b3), SYNC_ACT_SEND);
  CHECK_EQ(g_progress_calls, 2);
  CHECK_EQ(g_progress_index, 3);
  CHECK_EQ(g_progress_count, 3);
  SyncIn b4 = begin_in(3, 0x33u, FMT_RAW6, PHOTO_LEN, g_crc_a);   /* COUNT oltre n: clamp, mai 9/3 */
  b4.fields |= SYNC_F_COUNT;
  b4.count = 9;
  CHECK_EQ(handle(&b4), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_progress_index, 3);
  CHECK_EQ(g_progress_count, 3);
  /* senza COUNT (PKJS <= v1.9) e con COUNT 0: contatore locale k + 1 */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(3), SYNC_ACT_SEND);
  SyncIn o1 = begin_in(1, 0x41u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&o1), SYNC_ACT_SEND);
  CHECK_EQ(g_progress_index, 1);
  SyncIn o2 = begin_in(2, 0x42u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  o2.fields |= SYNC_F_COUNT;
  o2.count = 0;
  CHECK_EQ(handle(&o2), SYNC_ACT_SEND);
  CHECK_EQ(g_progress_index, 2);
  /* SYNC_REQUEST senza COUNT (n = 0): nessun clamp, k = COUNT del BEGIN */
  fresh(QUOTA_OK, MAX_CHUNK);
  SyncIn r = mk(SYNC_MSG_SYNC_REQUEST);
  CHECK_EQ(handle(&r), SYNC_ACT_SEND);
  SyncIn o3 = begin_in(0, 0x43u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  o3.fields |= SYNC_F_COUNT;
  o3.count = 5;
  CHECK_EQ(handle(&o3), SYNC_ACT_SEND);
  CHECK_EQ(g_progress_index, 5);
  CHECK_EQ(g_progress_count, 0);
}

/* PHOTO_BEGIN: stato, campi mancanti, valori invalidi. */
static void test_begin_validation(void) {
  /* fuori da SYNCING -> BUSY (con lo slot ricevuto, GAL_SLOT_NONE se assente) */
  fresh(QUOTA_OK, MAX_CHUNK);
  SyncIn b = begin_in(3, 0x99u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_BUSY);
  CHECK_EQ(g_out.slot, 3);
  CHECK_EQ(g_out.offset, 0);
  CHECK(!sync_proto_pending(NULL, NULL));
  SyncIn bn = begin_in(3, 0x99u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  bn.fields &= (uint16_t)~SYNC_F_SLOT;
  CHECK_EQ(handle(&bn), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BUSY);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);

  CHECK_EQ(sync_request(2), SYNC_ACT_SEND);
  shim_reset_write_count();

  /* ogni campo obbligatorio a turno: il valore resta, sparisce solo il bit in fields */
  static const uint16_t needed[] = { SYNC_F_SLOT, SYNC_F_PHOTO_ID, SYNC_F_FORMAT,
                                     SYNC_F_LENGTH, SYNC_F_CRC };
  for (unsigned i = 0; i < sizeof(needed) / sizeof(needed[0]); i++) {
    SyncIn m = begin_in(3, 0x99u, FMT_RAW6, PHOTO_LEN, g_crc_a);
    m.fields &= (uint16_t)~needed[i];
    CHECK_EQ(handle(&m), SYNC_ACT_SEND);
    CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
    CHECK_EQ(g_out.offset, 0);
    CHECK(!sync_proto_pending(NULL, NULL));
  }
  /* PHOTO_BEGIN senza alcun campo */
  SyncIn empty = mk(SYNC_MSG_PHOTO_BEGIN);
  CHECK_EQ(handle(&empty), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);

  /* slot fuori intervallo */
  static const uint8_t bad_slots[] = { GAL_MAX_SLOTS, 13, 200, GAL_SLOT_NONE };
  for (unsigned i = 0; i < sizeof(bad_slots) / sizeof(bad_slots[0]); i++) {
    SyncIn m = begin_in(bad_slots[i], 0x99u, FMT_RAW6, PHOTO_LEN, g_crc_a);
    CHECK_EQ(handle(&m), SYNC_ACT_SEND);
    CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
    CHECK_EQ(g_out.slot, bad_slots[i]);
    CHECK(!sync_proto_pending(NULL, NULL));
  }

  /* formato diverso dal nativo (raw1 su una build emery), sconosciuto o assente-come-valore */
  static const uint8_t bad_fmt[] = { PHOTO_FMT_NONE, FMT_RAW1, 3, 255 };
  for (unsigned i = 0; i < sizeof(bad_fmt) / sizeof(bad_fmt[0]); i++) {
    SyncIn m = begin_in(3, 0x99u, bad_fmt[i], PHOTO_LEN, g_crc_a);
    CHECK_EQ(handle(&m), SYNC_ACT_SEND);
    CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
    CHECK(!sync_proto_pending(NULL, NULL));
  }
  /* raw1 con la SUA lunghezza corretta: comunque rifiutato (non e' il formato nativo) */
  SyncIn r1 = begin_in(3, 0x99u, FMT_RAW1, (uint32_t)RAW1_BYTES, g_crc_a);
  CHECK_EQ(handle(&r1), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);

  /* lunghezza diversa da photo_format_length(nativo) */
  static const uint32_t bad_len[] = { 0u, 1u, PHOTO_LEN - 1u, PHOTO_LEN + 1u, 0xFFFFFFFFu,
                                      (uint32_t)RAW1_BYTES };
  for (unsigned i = 0; i < sizeof(bad_len) / sizeof(bad_len[0]); i++) {
    SyncIn m = begin_in(3, 0x99u, FMT_RAW6, bad_len[i], g_crc_a);
    CHECK_EQ(handle(&m), SYNC_ACT_SEND);
    CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
    CHECK(!sync_proto_pending(NULL, NULL));
  }

  /* photo_id 0 (il telefono deve assegnarne uno != 0) */
  SyncIn z = begin_in(3, 0, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&z), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
  CHECK(!sync_proto_pending(NULL, NULL));

  /* nessun rifiuto ha scritto in persist ne' notificato l'avanzamento */
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(g_progress_calls, 0);
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);

  /* BEGIN valido: OK, OFFSET 0, progress(1, count) */
  SyncIn good = begin_in(3, 0x99u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&good), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.slot, 3);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(g_progress_calls, 1);
  CHECK_EQ(g_progress_index, 1);
  CHECK_EQ(g_progress_count, 2);
  uint8_t slot = 0;
  uint32_t next = 1;
  CHECK(sync_proto_pending(&slot, &next));
  CHECK_EQ(slot, 3);
  CHECK_EQ(next, 0);
  CHECK_EQ(shim_write_count(), 0);           /* BEGIN non scrive niente */

  /* secondo BEGIN (foto nuova) -> progress(2, count) */
  SyncIn good2 = begin_in(5, 0xABu, FMT_RAW6, PHOTO_LEN, g_crc_b);
  CHECK_EQ(handle(&good2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(g_progress_calls, 2);
  CHECK_EQ(g_progress_index, 2);
  CHECK(sync_proto_pending(&slot, NULL));
  CHECK_EQ(slot, 5);

  /* un BEGIN invalido dopo un BEGIN valido NON abbandona il pending */
  SyncIn bad = begin_in(99, 0xABu, FMT_RAW6, PHOTO_LEN, g_crc_b);
  CHECK_EQ(handle(&bad), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
  CHECK(sync_proto_pending(&slot, &next));
  CHECK_EQ(slot, 5);
  CHECK_EQ(next, 0);
  CHECK_EQ(g_progress_calls, 2);
}

/* PHOTO_BEGIN: stima di occupazione (SYNC_QUOTA_PCT). */
static void test_begin_quota(void) {
  /* Aritmetica esatta della stima in prv_quota_ok(), con i numeri di emery/raw6. */
  const uint32_t chunks   = (PHOTO_LEN + GAL_CHUNK_BYTES - 1u) / GAL_CHUNK_BYTES;
  const uint32_t per_slot = PHOTO_LEN + chunks * SYNC_KEY_OVERHEAD;
  CHECK_EQ(chunks, 134);
  CHECK_EQ(per_slot, 36344u);                          /* 34.200 + 134 x 16 */
  CHECK_EQ((uint32_t)GAL_MAX_SLOTS * per_slot, 436128u); /* stima massima: 12 slot */
  CHECK_EQ(GAL_MIN_QUOTA / 100u * SYNC_QUOTA_PCT, 786375u); /* consentito con la quota MINIMA */
  /* Confine: la stima supera il consentito solo per quota/100*75 < 436.128, cioe' quota <= 581.599,
   * MOLTO sotto GAL_MIN_QUOTA (1.048.576) sotto cui l'album e' gia' disabilitato. Il ramo NO_SPACE
   * di PHOTO_BEGIN e' quindi IRRAGGIUNGIBILE: vedi il report (ambiguita' della specifica). */
  CHECK_EQ(581599u / 100u * SYNC_QUOTA_PCT, 436125u);  /* < 436.128: sarebbe NO_SPACE */
  CHECK_EQ(581600u / 100u * SYNC_QUOTA_PCT, 436200u);  /* >= 436.128: sarebbe OK */
  CHECK(581599u < GAL_MIN_QUOTA);
  CHECK((uint32_t)GAL_MAX_SLOTS * per_slot < GAL_MIN_QUOTA / 100u * SYNC_QUOTA_PCT);

  /* Caso peggiore reale: 11 slot pieni + 1 nuovo = 12 -> deve passare con la quota minima. */
  fresh(GAL_MIN_QUOTA, MAX_CHUNK);
  CHECK(storage_album_enabled());
  CHECK_EQ(storage_quota(), GAL_MIN_QUOTA);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  for (uint8_t k = 0; k < GAL_MAX_SLOTS - 1; k++) {
    CHECK_EQ(storage_commit_slot(k, FMT_RAW6, PHOTO_LEN, 0x1000u + k, 100u + k), STORAGE_OK);
  }
  CHECK_EQ(storage_valid_slots(), GAL_MAX_SLOTS - 1);
  SyncIn b = begin_in(GAL_MAX_SLOTS - 1, 0x77u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);        /* 12 x 36.344 = 436.128 <= 786.375 */

  /* Slot gia' VALID sostituito: slots_after non cresce (12 slot pieni). */
  CHECK_EQ(storage_commit_slot(GAL_MAX_SLOTS - 1, FMT_RAW6, PHOTO_LEN, 0x1111u, 111u), STORAGE_OK);
  CHECK_EQ(storage_valid_slots(), GAL_MAX_SLOTS);
  SyncIn b2 = begin_in(0, 0x78u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
}

/* PHOTO_BEGIN: ripresa di un trasferimento interrotto. */
static void test_begin_resume(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(3), SYNC_ACT_SEND);
  SyncIn b = begin_in(2, 0xCAFEu, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(g_progress_calls, 1);
  CHECK_EQ(send_all_data(2, g_photo, 3u * MAX_CHUNK, MAX_CHUNK), 0);
  uint32_t next = 0;
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, 3u * MAX_CHUNK);

  /* ripresa esatta: stesso slot/photo_id/crc e OFFSET == next -> OK(next), nessun progress nuovo */
  SyncIn r = begin_in(2, 0xCAFEu, FMT_RAW6, PHOTO_LEN, g_crc_a);
  r.fields |= SYNC_F_OFFSET;
  r.offset = 3u * MAX_CHUNK;
  CHECK_EQ(handle(&r), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.slot, 2);
  CHECK_EQ(g_out.offset, 3u * MAX_CHUNK);
  CHECK_EQ(g_progress_calls, 1);             /* la foto e' la stessa: nessun avanzamento */
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, 3u * MAX_CHUNK);
  /* il CRC progressivo NON e' stato azzerato: il resto della foto chiude il trasferimento */
  CHECK_EQ(send_data_range(2, g_photo, next, PHOTO_LEN, MAX_CHUNK), 0);
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, PHOTO_LEN);
  SyncIn er = end_in(2);
  CHECK_EQ(handle(&er), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.offset, PHOTO_LEN);
  CHECK_EQ(storage_manifest()->slots[2].crc32, g_crc_a);
  check_chunks(2, g_photo, PHOTO_LEN, "foto A ripresa a meta'");

  /* --- ogni discrepanza fa ripartire da 0 --- */
  struct { const char *what; uint8_t slot; uint32_t pid; uint32_t crc; uint32_t off; } cases[] = {
    { "photo_id diverso", 2, 0xBEEFu, 0,          3u * MAX_CHUNK },
    { "crc diverso",      2, 0xCAFEu, 0x12345678u, 3u * MAX_CHUNK },
    { "slot diverso",     6, 0xCAFEu, 0,          3u * MAX_CHUNK },
    { "offset != next",   2, 0xCAFEu, 0,          2u * MAX_CHUNK },
    { "offset 0",         2, 0xCAFEu, 0,          0u },
    { "offset > length",  2, 0xCAFEu, 0,          PHOTO_LEN + 256u },
  };
  for (unsigned i = 0; i < sizeof(cases) / sizeof(cases[0]); i++) {
    fresh(QUOTA_OK, MAX_CHUNK);
    CHECK_EQ(sync_request(3), SYNC_ACT_SEND);
    SyncIn b0 = begin_in(2, 0xCAFEu, FMT_RAW6, PHOTO_LEN, g_crc_a);
    CHECK_EQ(handle(&b0), SYNC_ACT_SEND);
    CHECK_EQ(send_all_data(2, g_photo, 3u * MAX_CHUNK, MAX_CHUNK), 0);
    CHECK_EQ(g_progress_calls, 1);
    SyncIn m = begin_in(cases[i].slot, cases[i].pid, FMT_RAW6, PHOTO_LEN,
                        cases[i].crc ? cases[i].crc : g_crc_a);
    m.fields |= SYNC_F_OFFSET;
    m.offset = cases[i].off;
    CHECK_EQ(handle(&m), SYNC_ACT_SEND);
    /* revisione S5a: "Foto k/n" avanza solo se la foto (slot + photo_id) e' diversa dall'ultima contata */
    const int want_progress = (cases[i].slot != 2 || cases[i].pid != 0xCAFEu) ? 2 : 1;
    if (g_out.code != SYNC_CODE_OK || g_out.offset != 0 || g_progress_calls != want_progress) {
      g_fail++;
      printf("FAIL ripresa non ripartita da 0 (%s): code %u offset %u progress %d (atteso %d)\n",
             cases[i].what, (unsigned)g_out.code, (unsigned)g_out.offset, g_progress_calls, want_progress);
    } else {
      g_ok++;
    }
    uint8_t slot = 0;
    uint32_t nx = 1;
    CHECK(sync_proto_pending(&slot, &nx));
    CHECK_EQ(slot, cases[i].slot);
    CHECK_EQ(nx, 0);
  }

  /* ripresa senza pending (dopo un timeout): riparte da 0 */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  SyncIn r0 = begin_in(2, 0xCAFEu, FMT_RAW6, PHOTO_LEN, g_crc_a);
  r0.fields |= SYNC_F_OFFSET;
  r0.offset = 8192;
  CHECK_EQ(handle(&r0), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(g_progress_calls, 1);

  /* ripresa a foto gia' completa (OFFSET == length == next): OK(length), poi END committa */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  SyncIn b1 = begin_in(2, 0xCAFEu, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b1), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(2, g_photo, PHOTO_LEN, MAX_CHUNK), 0);
  SyncIn rr = begin_in(2, 0xCAFEu, FMT_RAW6, PHOTO_LEN, g_crc_a);
  rr.fields |= SYNC_F_OFFSET;
  rr.offset = PHOTO_LEN;
  CHECK_EQ(handle(&rr), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.offset, PHOTO_LEN);
  CHECK_EQ(g_progress_calls, 1);
  SyncIn e = end_in(2);
  CHECK_EQ(handle(&e), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(storage_manifest()->slots[2].state, GAL_SLOT_VALID);
}

/* PHOTO_DATA: tutti i rifiuti (nessuna scrittura, next invariato). */
static void test_data_errors(void) {
  fresh(QUOTA_OK, MAX_CHUNK);

  /* fuori da SYNCING -> BUSY */
  SyncIn d0 = data_in(5, 0, g_photo, 256);
  CHECK_EQ(handle(&d0), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BUSY);
  CHECK_EQ(g_out.slot, 5);

  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  /* senza PHOTO_BEGIN -> SEQ_ERR con OFFSET 0 */
  CHECK_EQ(handle(&d0), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.slot, 5);
  CHECK_EQ(g_out.offset, 0);

  SyncIn b = begin_in(2, 0x55u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  shim_reset_write_count();

  /* slot diverso da quello del pending -> SEQ_ERR con lo slot ATTESO e OFFSET = next */
  SyncIn dsl = data_in(3, 0, g_photo, 256);
  CHECK_EQ(handle(&dsl), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.slot, 2);
  CHECK_EQ(g_out.offset, 0);

  /* campi mancanti / data NULL */
  static const uint16_t need[] = { SYNC_F_SLOT, SYNC_F_OFFSET, SYNC_F_DATA };
  for (unsigned i = 0; i < sizeof(need) / sizeof(need[0]); i++) {
    SyncIn m = data_in(2, 0, g_photo, 256);
    m.fields &= (uint16_t)~need[i];
    CHECK_EQ(handle(&m), SYNC_ACT_SEND);
    CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
    CHECK_EQ(g_out.slot, 2);
    CHECK_EQ(g_out.offset, 0);
  }
  SyncIn dnull = data_in(2, 0, NULL, 256);
  CHECK_EQ(handle(&dnull), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);

  /* offset > next */
  SyncIn dfwd = data_in(2, 256, g_photo + 256, 256);
  CHECK_EQ(handle(&dfwd), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, 0);

  /* n == 0 */
  SyncIn dz = data_in(2, 0, g_photo, 0);
  CHECK_EQ(handle(&dz), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, 0);

  /* n > max_chunk (4.096) */
  SyncIn dbig = data_in(2, 0, g_photo, MAX_CHUNK + 256);
  CHECK_EQ(handle(&dbig), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, 0);

  /* n non multiplo di 256 e non ultimo pezzo */
  SyncIn dodd = data_in(2, 0, g_photo, 300);
  CHECK_EQ(handle(&dodd), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, 0);
  SyncIn dodd2 = data_in(2, 0, g_photo, 1);
  CHECK_EQ(handle(&dodd2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);

  /* nessun rifiuto ha scritto, next e' rimasto a 0 */
  CHECK_EQ(shim_write_count(), 0);
  uint32_t next = 1;
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, 0);

  /* --- duplicati: nessuna risposta e nessuna scrittura --- */
  SyncIn d1 = data_in(2, 0, g_photo, MAX_CHUNK);
  CHECK_EQ(handle(&d1), SYNC_ACT_NONE);
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, MAX_CHUNK);
  const int w = shim_write_count();
  CHECK_EQ(w, 16);                           /* 4.096 / 256 chunk scritti */
  CHECK_EQ(handle(&d1), SYNC_ACT_NONE);      /* ritrasmissione dello stesso pezzo */
  CHECK_EQ(shim_write_count(), w);
  CHECK_EQ(g_out.msg, SYNC_MSG_NONE);        /* out azzerato: nessuna risposta */
  SyncIn dmid = data_in(2, 2048, g_photo + 2048, 256);
  CHECK_EQ(handle(&dmid), SYNC_ACT_NONE);    /* duplicato parziale */
  CHECK_EQ(shim_write_count(), w);
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, MAX_CHUNK);                 /* next non torna indietro */
  /* un duplicato con dati "sporchi" viene comunque ignorato (offset < next e' l'unico criterio) */
  SyncIn ddirty = data_in(2, 0, g_photo2, 7);
  CHECK_EQ(handle(&ddirty), SYNC_ACT_NONE);
  CHECK_EQ(shim_write_count(), w);

  /* --- offset + n > length --- */
  /* porta next a 34.048 (133 chunk): 8 x 4096 + 1 x 1280 */
  CHECK_EQ(send_all_data(2, g_photo, 8u * MAX_CHUNK, MAX_CHUNK), 0);   /* riparte da 0: duplicati */
  SyncIn d1280 = data_in(2, 8u * MAX_CHUNK, g_photo + 8u * MAX_CHUNK, 1280);
  CHECK_EQ(handle(&d1280), SYNC_ACT_NONE);
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, 34048u);
  SyncIn dover = data_in(2, 34048u, g_photo + 34048u, 256);            /* 34.304 > 34.200 */
  CHECK_EQ(handle(&dover), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, 34048u);
  /* ultimo pezzo corretto: 152 B, non multiplo di 256 ma chiude la foto */
  SyncIn dlast = data_in(2, 34048u, g_photo + 34048u, LAST_CHUNK_N);
  CHECK_EQ(handle(&dlast), SYNC_ACT_NONE);
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, PHOTO_LEN);

  /* --- offset non multiplo di 256: raggiungibile solo a foto completa (next == length) --- */
  SyncIn dtail = data_in(2, PHOTO_LEN, g_photo, 256);
  CHECK_EQ(handle(&dtail), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, PHOTO_LEN);
  CHECK_EQ(PHOTO_LEN % GAL_CHUNK_BYTES, 152);  /* 34.200 non e' multiplo di 256 */
}

/* PHOTO_DATA: sequenza corretta con pezzi da 4.096 / 512 / 256 B. */
static void test_data_ok(void) {
  static const uint16_t pieces[] = { MAX_CHUNK, 512, 256, 1024 };
  for (unsigned p = 0; p < sizeof(pieces) / sizeof(pieces[0]); p++) {
    fresh(QUOTA_OK, MAX_CHUNK);
    CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
    SyncIn b = begin_in(9, 0x424242u, FMT_RAW6, PHOTO_LEN, g_crc_a);
    CHECK_EQ(handle(&b), SYNC_ACT_SEND);
    shim_reset_write_count();
    CHECK_EQ(send_all_data(9, g_photo, PHOTO_LEN, pieces[p]), 0);
    uint32_t next = 0;
    CHECK(sync_proto_pending(NULL, &next));
    CHECK_EQ(next, PHOTO_LEN);
    CHECK_EQ(shim_write_count(), PHOTO_CHUNKS);            /* un persist_write_data per chunk */
    CHECK_EQ(shim_key_len(GAL_KEY_CHUNK(9, PHOTO_CHUNKS - 1)), LAST_CHUNK_N);
    CHECK(!shim_key_exists(GAL_KEY_CHUNK(9, PHOTO_CHUNKS)));
    check_chunks(9, g_photo, PHOTO_LEN, "foto A");
    /* il manifest non e' ancora stato toccato: il commit avviene solo in PHOTO_END */
    CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
    CHECK_EQ(storage_valid_slots(), 0);

    /* il CRC progressivo coincide con quello dell'intero payload: lo dimostra il PHOTO_END */
    SyncIn e = end_in(9);
    CHECK_EQ(handle(&e), SYNC_ACT_SEND);
    CHECK_EQ(g_out.code, SYNC_CODE_OK);                    /* CRC_ERR se crc_running fosse sbagliato */
    CHECK_EQ(storage_manifest()->slots[9].crc32, g_crc_a);
  }

  /* chunk-index: le chiavi usate sono esattamente 1000 + slot*256 + i */
  CHECK_EQ(GAL_KEY_CHUNK(9, 0), 1000u + 9u * 256u);
  CHECK_EQ(GAL_KEY_CHUNK(9, 133), 1000u + 9u * 256u + 133u);
}

/* PHOTO_DATA: errori di scrittura persist iniettati a meta' trasferimento. */
static void test_data_write_failures(void) {
  /* --- E_OUT_OF_STORAGE --- */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(2), SYNC_ACT_SEND);
  SyncIn b = begin_in(1, 0x31337u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(1, g_photo, 4u * MAX_CHUNK, MAX_CHUNK), 0);
  shim_reset_write_count();
  shim_fail_writes_after(4);                 /* i primi 4 chunk del prossimo pezzo passano */
  SyncIn d = data_in(1, 4u * MAX_CHUNK, g_photo + 4u * MAX_CHUNK, MAX_CHUNK);
  CHECK_EQ(handle(&d), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_NO_SPACE);
  CHECK_EQ(g_out.slot, 1);
  CHECK_EQ(g_out.offset, 0);                 /* ripartire da PHOTO_BEGIN{OFFSET 0} */
  CHECK_EQ(shim_write_count(), 4);           /* scritti solo i 4 chunk prima del guasto */
  CHECK(!sync_proto_pending(NULL, NULL));    /* pending abbandonato */
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);

  /* PHOTO_END dopo il guasto -> SEQ_ERR(0), manifest ancora assente */
  SyncIn e = end_in(1);
  CHECK_EQ(handle(&e), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.slot, 1);
  CHECK_EQ(g_out.offset, 0);
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK_EQ(storage_manifest()->slots[1].state, GAL_SLOT_EMPTY);
  CHECK_EQ(g_album_changed, 0);

  /* --- errore generico (E_ERROR) -> STORAGE_ERR --- */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  SyncIn b2 = begin_in(1, 0x31337u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b2), SYNC_ACT_SEND);
  shim_reset_write_count();
  shim_fail_writes_code(E_ERROR);
  shim_fail_writes_after(0);                 /* fallisce subito */
  SyncIn d2 = data_in(1, 0, g_photo, 256);
  CHECK_EQ(handle(&d2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_STORAGE_ERR);
  CHECK_EQ(g_out.slot, 1);
  CHECK_EQ(shim_write_count(), 0);
  CHECK(!sync_proto_pending(NULL, NULL));
  CHECK_EQ(storage_valid_slots(), 0);

  /* dopo il guasto il telefono riparte da BEGIN{0} e la foto arriva intera */
  shim_fail_writes_after(-1);
  SyncIn b3 = begin_in(1, 0x31337u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  b3.fields |= SYNC_F_OFFSET;
  b3.offset = 0;
  CHECK_EQ(handle(&b3), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(send_all_data(1, g_photo, PHOTO_LEN, MAX_CHUNK), 0);
  SyncIn e3 = end_in(1);
  CHECK_EQ(handle(&e3), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  check_chunks(1, g_photo, PHOTO_LEN, "foto A dopo il guasto");
}

/* PHOTO_END: SEQ_ERR, CRC_ERR e commit. */
static void test_end(void) {
  /* fuori da SYNCING -> BUSY */
  fresh(QUOTA_OK, MAX_CHUNK);
  SyncIn e0 = end_in(4);
  CHECK_EQ(handle(&e0), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BUSY);
  CHECK_EQ(g_out.slot, 4);

  /* senza pending -> SEQ_ERR(0) */
  CHECK_EQ(sync_request(2), SYNC_ACT_SEND);
  CHECK_EQ(handle(&e0), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.slot, 4);
  CHECK_EQ(g_out.offset, 0);

  SyncIn b = begin_in(4, 0xF00Du, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(4, g_photo, 2u * MAX_CHUNK, MAX_CHUNK), 0);

  /* dati incompleti -> SEQ_ERR(next) */
  CHECK_EQ(handle(&e0), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.slot, 4);
  CHECK_EQ(g_out.offset, 2u * MAX_CHUNK);
  CHECK(sync_proto_pending(NULL, NULL));     /* il pending resta: si riprende da next */

  /* slot sbagliato / SLOT assente -> SEQ_ERR con lo slot ATTESO e next */
  SyncIn ew = end_in(7);
  CHECK_EQ(handle(&ew), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.slot, 4);
  CHECK_EQ(g_out.offset, 2u * MAX_CHUNK);
  SyncIn en = end_in(4);
  en.fields = 0;
  CHECK_EQ(handle(&en), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.slot, 4);
  CHECK_EQ(g_out.offset, 2u * MAX_CHUNK);

  /* --- CRC sbagliato: manifest INTATTO, pending abbandonato --- */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  SyncIn bc = begin_in(4, 0xF00Du, FMT_RAW6, PHOTO_LEN, g_crc_a ^ 1u);   /* CRC annunciato errato */
  CHECK_EQ(handle(&bc), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(4, g_photo, PHOTO_LEN, MAX_CHUNK), 0);
  shim_reset_write_count();
  SyncIn ec = end_in(4);
  CHECK_EQ(handle(&ec), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_CRC_ERR);
  CHECK_EQ(g_out.slot, 4);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(shim_write_count(), 0);           /* nessuna scrittura: manifest non toccato */
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));
  CHECK_EQ(storage_manifest()->slots[4].state, GAL_SLOT_EMPTY);
  CHECK_EQ(storage_manifest()->slots[4].generation, 0);
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK_EQ(g_album_changed, 0);
  CHECK(!sync_proto_pending(NULL, NULL));
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  /* un END ripetuto ora e' SEQ_ERR(0) */
  CHECK_EQ(handle(&ec), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, 0);

  /* --- CRC giusto: commit, manifest scritto PER ULTIMO --- */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(2), SYNC_ACT_SEND);
  SyncIn bg = begin_in(4, 0xF00Du, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&bg), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(4, g_photo, PHOTO_LEN, MAX_CHUNK), 0);
  const bool schema_before = shim_key_exists(GAL_KEY_SCHEMA);
  shim_reset_write_count();
  SyncIn eg = end_in(4);
  CHECK_EQ(handle(&eg), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.slot, 4);
  CHECK_EQ(g_out.offset, PHOTO_LEN);
  CHECK_EQ(shim_write_count(), schema_before ? 1 : 2);   /* chiave 0 (schema) + chiave 1 (manifest) */
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);     /* il manifest e' l'ULTIMA scrittura */
  CHECK_EQ(g_album_changed, 1);
  CHECK(!sync_proto_pending(NULL, NULL));
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);         /* la sync continua con la foto successiva */

  const GalSlotMeta *m = &storage_manifest()->slots[4];
  CHECK_EQ(m->state, GAL_SLOT_VALID);
  CHECK_EQ(m->format, FMT_RAW6);
  CHECK_EQ(m->generation, 1);
  CHECK_EQ(m->length, PHOTO_LEN);
  CHECK_EQ(m->crc32, g_crc_a);
  CHECK_EQ(m->photo_id, 0xF00Du);
  CHECK_EQ(storage_manifest()->order[0], 4);
  CHECK_EQ(storage_manifest()->order[1], GAL_SLOT_NONE);
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK(memcmp(shim_key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);
  check_chunks(4, g_photo, PHOTO_LEN, "foto A committata");

  /* sostituzione riuscita dello stesso slot: generation 2, order invariato */
  send_photo(4, 0xBEEFu, g_photo2, g_crc_b, MAX_CHUNK);
  CHECK_EQ(storage_manifest()->slots[4].generation, 2);
  CHECK_EQ(storage_manifest()->slots[4].crc32, g_crc_b);
  CHECK_EQ(storage_manifest()->slots[4].photo_id, 0xBEEFu);
  CHECK_EQ(storage_manifest()->order[0], 4);
  CHECK_EQ(storage_manifest()->order[1], GAL_SLOT_NONE);
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK_EQ(g_album_changed, 3);              /* commit A + svuotamento dello slot al BEGIN di B (revisione S5a) + commit B */
  CHECK_EQ(g_progress_index, 2);
  check_chunks(4, g_photo2, PHOTO_LEN, "foto B (sostituzione)");

  /* revisione S5a: PHOTO_END ritrasmesso DOPO un commit riuscito (STATUS OK perso) con lo stesso
   * PHOTO_ID -> OK{length} senza ricommittare; PHOTO_ID diverso o assente -> SEQ_ERR{0} */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  send_photo(6, 0xABCDu, g_photo, g_crc_a, MAX_CHUNK);
  const uint16_t gen = storage_manifest()->slots[6].generation;
  const int writes_after_commit = shim_write_count();
  SyncIn again = end_in(6);
  again.fields |= SYNC_F_PHOTO_ID;
  again.photo_id = 0xABCDu;
  CHECK_EQ(handle(&again), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.slot, 6);
  CHECK_EQ(g_out.offset, PHOTO_LEN);
  CHECK_EQ(storage_manifest()->slots[6].generation, gen);   /* nessun nuovo commit */
  CHECK_EQ(shim_write_count(), writes_after_commit);
  again.photo_id = 0xABCEu;
  CHECK_EQ(handle(&again), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, 0);
  SyncIn noid = end_in(6);
  CHECK_EQ(handle(&noid), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, 0);

}

/* PHOTO_END: commit fallito sul manifest -> NO_SPACE e manifest in RAM ripristinato. */
static void test_commit_failure(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  /* chiave 0 gia' presente: cosi' l'unica scrittura del commit e' quella del manifest */
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, GAL_SCHEMA), 4);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  SyncIn b = begin_in(6, 0x1234u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(6, g_photo, PHOTO_LEN, MAX_CHUNK), 0);

  GalManifest before;
  memcpy(&before, storage_manifest(), sizeof(before));
  shim_reset_write_count();
  shim_fail_writes_after(0);                 /* la scrittura del manifest fallisce */
  SyncIn e = end_in(6);
  CHECK_EQ(handle(&e), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_NO_SPACE);
  CHECK_EQ(g_out.slot, 6);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(g_album_changed, 0);              /* nessuna notifica: il commit non e' avvenuto */
  CHECK(!sync_proto_pending(NULL, NULL));
  /* manifest in RAM ripristinato bit a bit */
  CHECK(memcmp(&before, storage_manifest(), sizeof(before)) == 0);
  CHECK_EQ(storage_manifest()->slots[6].state, GAL_SLOT_EMPTY);
  CHECK_EQ(storage_manifest()->slots[6].generation, 0);
  CHECK_EQ(storage_manifest()->order[0], GAL_SLOT_NONE);
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK(!shim_key_exists(GAL_KEY_MANIFEST));

  /* errore generico sul manifest -> STORAGE_ERR */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(persist_write_int(GAL_KEY_SCHEMA, GAL_SCHEMA), 4);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  SyncIn b2 = begin_in(6, 0x1234u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b2), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(6, g_photo, PHOTO_LEN, MAX_CHUNK), 0);
  shim_fail_writes_code(E_ERROR);
  shim_fail_writes_after(0);
  SyncIn e2 = end_in(6);
  CHECK_EQ(handle(&e2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_STORAGE_ERR);
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK_EQ(g_album_changed, 0);

  /* ritentando senza guasto la foto si committa (i chunk sono ancora quelli giusti) */
  shim_fail_writes_after(-1);
  SyncIn b3 = begin_in(6, 0x1234u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b3), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(6, g_photo, PHOTO_LEN, MAX_CHUNK), 0);
  SyncIn e3 = end_in(6);
  CHECK_EQ(handle(&e3), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK_EQ(g_album_changed, 1);
}

/* SYNC_DONE e sync_proto_timeout(). */
static void test_done_and_timeout(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  /* SYNC_DONE in IDLE: nessuna risposta, nessun avanzamento */
  SyncIn done = mk(SYNC_MSG_SYNC_DONE);
  CHECK_EQ(handle(&done), SYNC_ACT_NONE);
  CHECK_EQ(g_out.msg, SYNC_MSG_NONE);
  CHECK_EQ(g_progress_calls, 0);
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  /* timeout in IDLE: false, nessun avanzamento */
  CHECK(!sync_proto_timeout());
  CHECK_EQ(g_progress_calls, 0);

  /* SYNC_DONE in SYNCING con una foto a meta' */
  CHECK_EQ(sync_request(4), SYNC_ACT_SEND);
  SyncIn b = begin_in(0, 0x5u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(0, g_photo, 2u * MAX_CHUNK, MAX_CHUNK), 0);
  CHECK_EQ(g_progress_calls, 1);
  CHECK_EQ(handle(&done), SYNC_ACT_NONE);
  CHECK_EQ(g_out.msg, SYNC_MSG_NONE);        /* nessuna risposta */
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK(!sync_proto_pending(NULL, NULL));
  CHECK_EQ(g_progress_calls, 2);
  CHECK_EQ(g_progress_index, 0);
  CHECK_EQ(g_progress_count, 0);
  CHECK_EQ(storage_valid_slots(), 0);        /* la foto a meta' non viene committata */
  /* SYNC_DONE ripetuto in IDLE: niente */
  CHECK_EQ(handle(&done), SYNC_ACT_NONE);
  CHECK_EQ(g_progress_calls, 2);
  /* i messaggi di foto tornano BUSY */
  SyncIn b2 = begin_in(0, 0x5u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BUSY);
  SyncIn d2 = data_in(0, 0, g_photo, 256);
  CHECK_EQ(handle(&d2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BUSY);
  SyncIn e2 = end_in(0);
  CHECK_EQ(handle(&e2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BUSY);

  /* --- timeout in SYNCING --- */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(SYNC_IDLE_TIMEOUT_MS, 30000);
  CHECK_EQ(sync_request(4), SYNC_ACT_SEND);
  SyncIn b3 = begin_in(0, 0x5u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b3), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(0, g_photo, MAX_CHUNK, MAX_CHUNK), 0);
  CHECK_EQ(g_progress_calls, 1);
  CHECK(sync_proto_timeout());
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK(!sync_proto_pending(NULL, NULL));
  CHECK_EQ(g_progress_calls, 2);
  CHECK_EQ(g_progress_index, 0);
  CHECK_EQ(g_progress_count, 0);
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK(!sync_proto_timeout());              /* gia' IDLE: nessun cambio di stato */
  CHECK_EQ(g_progress_calls, 2);

  /* dopo il timeout basta un nuovo SYNC_REQUEST per ricominciare */
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  send_photo(0, 0x5u, g_photo, g_crc_a, MAX_CHUNK);
  CHECK_EQ(storage_valid_slots(), 1);
}

/* SETTINGS: blob valido, lunghezze sbagliate, campi fuori intervallo. */
static void test_settings_msg(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  GalSettings def;
  settings_set_defaults(&def);
  CHECK(memcmp(settings_get(), &def, sizeof(def)) == 0);

  GalSettings s;
  mk_valid_settings(&s);
  CHECK_EQ(send_settings(&s, (uint16_t)sizeof(s)), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(g_settings_changed, 1);
  /* settings_get() riflette i nuovi valori */
  CHECK_EQ(settings_get()->layout, GAL_LAYOUT_B);
  CHECK_EQ(settings_get()->font, GAL_FONT_BARLOW);
  CHECK_EQ(settings_get()->clock_mode, GAL_CLOCK_24H);
  CHECK_EQ(settings_get()->leading_zero, GAL_LZ_ON);
  CHECK_EQ(settings_get()->text_color, GAL_TEXT_YELLOW);
  CHECK_EQ(settings_get()->outline, GAL_OUTLINE_ALWAYS);
  CHECK_EQ(settings_get()->interval_min, 180);
  CHECK_EQ(settings_get()->order, GAL_ORDER_RANDOM);
  CHECK_EQ(settings_get()->shake_next, 0);
  CHECK_EQ(settings_get()->info_row, GAL_INFO_STEPS | GAL_INFO_DATE);
  CHECK(settings_is_24h());                  /* usa clock_is_24h_style() dello shim */
  /* la callback ha ricevuto i valori PRECEDENTI (i default) */
  CHECK(memcmp(&g_settings_before, &def, sizeof(def)) == 0);
  /* le impostazioni finiscono in persist con il debounce di storage.c */
  CHECK(shim_timer_pending());
  CHECK_EQ(shim_timer_timeout(), STORAGE_SETTINGS_DEBOUNCE_MS);
  CHECK(shim_timer_fire());
  CHECK_EQ(shim_key_len(GAL_KEY_MANIFEST), (int)sizeof(GalManifest));   /* schema 2: nel manifest */
  CHECK_EQ(shim_key_len(GAL_KEY_SETTINGS), -1);                          /* la chiave 10 non si scrive più */
  {
    GalSettings back;
    CHECK(storage_read_settings(&back));
    CHECK_EQ(back.interval_min, 180);
  }

  /* secondo blob: la callback riceve i valori del PRIMO */
  GalSettings s2 = s;
  s2.layout = GAL_LAYOUT_A;
  s2.interval_min = 1440;
  s2.info_row = 0;
  CHECK_EQ(send_settings(&s2, (uint16_t)sizeof(s2)), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_settings_changed, 2);
  CHECK_EQ(g_settings_before.layout, GAL_LAYOUT_B);
  CHECK_EQ(g_settings_before.interval_min, 180);
  CHECK_EQ(settings_get()->interval_min, 1440);
  /* S5b: HELLO annuncia il CRC delle impostazioni APPLICATE (diverso dai default), calcolato sui
   * 18 B che precedono crc16, qualunque cosa contenga il campo crc16 del blob ricevuto */
  {
    GalSettings def;
    settings_set_defaults(&def);
    SyncIn js = mk(SYNC_MSG_JS_READY);
    CHECK_EQ(handle(&js), SYNC_ACT_SEND);
    CHECK_EQ(g_out.msg, SYNC_MSG_HELLO);
    CHECK_EQ(g_out.settings_crc, crc16_ccitt((const uint8_t *)&s2, sizeof(s2) - 2));
    CHECK(g_out.settings_crc != crc16_ccitt((const uint8_t *)&def, sizeof(def) - 2));
    CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  }

  /* lunghezze sbagliate: 19, 21, 0, campo assente, puntatore NULL */
  static const uint16_t bad_len[] = { 0, 1, 19, 21, 40 };
  for (unsigned i = 0; i < sizeof(bad_len) / sizeof(bad_len[0]); i++) {
    const GalSettings before = *settings_get();
    CHECK_EQ(send_settings(&s, bad_len[i]), SYNC_ACT_SEND);
    CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
    CHECK_EQ(g_out.slot, GAL_SLOT_NONE);
    CHECK(memcmp(&before, settings_get(), sizeof(before)) == 0);
  }
  CHECK_EQ(send_settings(NULL, (uint16_t)sizeof(s)), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
  SyncIn nofield = mk(SYNC_MSG_SETTINGS);
  nofield.settings = (const uint8_t *)&s;
  nofield.settings_len = (uint16_t)sizeof(s);   /* valore presente ma bit SYNC_F_SETTINGS assente */
  CHECK_EQ(handle(&nofield), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
  CHECK_EQ(g_settings_changed, 2);

  /* campi fuori intervallo, uno per volta */
  GalSettings m;
  mk_valid_settings(&m); m.schema = 2;             expect_settings_rejected(m, "schema 2");
  mk_valid_settings(&m); m.schema = 0;             expect_settings_rejected(m, "schema 0");
  mk_valid_settings(&m); m.interval_min = 7;       expect_settings_rejected(m, "interval 7");
  mk_valid_settings(&m); m.interval_min = 31;      expect_settings_rejected(m, "interval 31");
  mk_valid_settings(&m); m.layout = 2;             expect_settings_rejected(m, "layout 2");
  mk_valid_settings(&m); m.font = GAL_FONT_COUNT;  expect_settings_rejected(m, "font 6");     /* S8-stile: 4 e 5 sono F4/F5 */
  mk_valid_settings(&m); m.digit_style = 4;        expect_settings_rejected(m, "digit_style 4");
  mk_valid_settings(&m); m.clock_mode = 3;         expect_settings_rejected(m, "clock_mode 3");
  mk_valid_settings(&m); m.leading_zero = 3;       expect_settings_rejected(m, "leading_zero 3");
  mk_valid_settings(&m); m.text_color = 5;         expect_settings_rejected(m, "text_color 5");
  mk_valid_settings(&m); m.outline = 3;            expect_settings_rejected(m, "outline 3");
  mk_valid_settings(&m); m.order = 2;              expect_settings_rejected(m, "order 2");
  mk_valid_settings(&m); m.shake_next = 2;         expect_settings_rejected(m, "shake 2");
  mk_valid_settings(&m); m.info_row = 16;          expect_settings_rejected(m, "info_row 16");
  mk_valid_settings(&m); m.info_row = 255;         expect_settings_rejected(m, "info_row 255");

  /* valori limite ACCETTATI */
  mk_valid_settings(&m);
  m.interval_min = 0;                          /* "mai" */
  m.info_row = 15;
  m.crc16 = 0;                                 /* crc16 del blob ignorato */
  CHECK_EQ(send_settings(&m, (uint16_t)sizeof(m)), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(settings_get()->interval_min, 0);
  /* reserved[] non e' validato: un blob di uno schema futuro con reserved != 0 passa (S8-stile: sono 4 byte (S10: il primo dei cinque e' diventato `lang`),
   * il primo dei sei di prima e' diventato digit_style e QUELLO e' validato) */
  mk_valid_settings(&m);
  m.reserved[0] = 0xAA;
  m.reserved[3] = 0x55;
  CHECK_EQ(send_settings(&m, (uint16_t)sizeof(m)), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(settings_get()->reserved[0], 0xAA);
  CHECK_EQ(settings_get()->reserved[3], 0x55);
  /* S8-stile: font 4/5 e i 4 stili sono accettati e applicati */
  mk_valid_settings(&m);
  m.font = GAL_FONT_STAATLICHES;
  m.digit_style = GAL_STYLE_FILL_3D;
  CHECK_EQ(send_settings(&m, (uint16_t)sizeof(m)), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(settings_get()->font, GAL_FONT_STAATLICHES);
  CHECK_EQ(settings_get()->digit_style, GAL_STYLE_FILL_3D);
  mk_valid_settings(&m);
  m.font = GAL_FONT_FRANCOIS;
  m.digit_style = GAL_STYLE_OUTLINE;
  CHECK_EQ(send_settings(&m, (uint16_t)sizeof(m)), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(settings_get()->digit_style, GAL_STYLE_OUTLINE);

  /* --- SETTINGS in SYNCING: applicate senza toccare il pending --- */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  SyncIn b = begin_in(8, 0x2u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(8, g_photo, 2u * MAX_CHUNK, MAX_CHUNK), 0);
  mk_valid_settings(&s);
  CHECK_EQ(send_settings(&s, (uint16_t)sizeof(s)), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_settings_changed, 1);
  uint8_t slot = 0;
  uint32_t next = 0;
  CHECK(sync_proto_pending(&slot, &next));
  CHECK_EQ(slot, 8);
  CHECK_EQ(next, 2u * MAX_CHUNK);
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  CHECK_EQ(g_progress_calls, 1);
  /* e la foto si conclude regolarmente */
  CHECK_EQ(send_data_range(8, g_photo, next, PHOTO_LEN, MAX_CHUNK), 0);
  SyncIn e8 = end_in(8);
  CHECK_EQ(handle(&e8), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK_EQ(g_album_changed, 1);
}

/* ALBUM_ORDER. */
static void test_album_order(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  uint8_t ord[GAL_MAX_SLOTS];

  /* ordine valido con coda GAL_SLOT_NONE */
  memset(ord, GAL_SLOT_NONE, sizeof(ord));
  ord[0] = 5;
  ord[1] = 0;
  ord[2] = 11;
  CHECK_EQ(send_order(ord, GAL_MAX_SLOTS), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);
  CHECK_EQ(g_album_changed, 1);
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);
  CHECK(memcmp(shim_key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);

  /* permutazione completa 0..11 (nessun GAL_SLOT_NONE) */
  for (uint8_t i = 0; i < GAL_MAX_SLOTS; i++) {
    ord[i] = (uint8_t)(GAL_MAX_SLOTS - 1u - i);
  }
  CHECK_EQ(send_order(ord, GAL_MAX_SLOTS), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK(memcmp(storage_manifest()->order, ord, sizeof(ord)) == 0);
  CHECK_EQ(g_album_changed, 2);

  /* ordine vuoto (tutti GAL_SLOT_NONE): valido */
  memset(ord, GAL_SLOT_NONE, sizeof(ord));
  CHECK_EQ(send_order(ord, GAL_MAX_SLOTS), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_album_changed, 3);

  /* rimettiamo un ordine noto e proviamo tutti i rifiuti */
  memset(ord, GAL_SLOT_NONE, sizeof(ord));
  ord[0] = 2;
  ord[1] = 3;
  CHECK_EQ(send_order(ord, GAL_MAX_SLOTS), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  const int ac = g_album_changed;

  uint8_t bad[GAL_MAX_SLOTS + 4];
  memset(bad, GAL_SLOT_NONE, sizeof(bad));
  bad[0] = 1;
  expect_order_rejected(bad, GAL_MAX_SLOTS - 1, "11 byte");
  expect_order_rejected(bad, GAL_MAX_SLOTS + 1, "13 byte");
  expect_order_rejected(bad, 0, "0 byte");
  memset(bad, GAL_SLOT_NONE, sizeof(bad));
  bad[0] = GAL_MAX_SLOTS;                                  /* indice 12 */
  expect_order_rejected(bad, GAL_MAX_SLOTS, "indice 12");
  bad[0] = 200;
  expect_order_rejected(bad, GAL_MAX_SLOTS, "indice 200");
  memset(bad, GAL_SLOT_NONE, sizeof(bad));
  bad[0] = 3;
  bad[1] = 3;
  expect_order_rejected(bad, GAL_MAX_SLOTS, "duplicato");
  memset(bad, GAL_SLOT_NONE, sizeof(bad));
  bad[0] = 3;
  bad[2] = 7;                                              /* valore dopo un 0xFF */
  expect_order_rejected(bad, GAL_MAX_SLOTS, "valore dopo GAL_SLOT_NONE");
  memset(bad, 0, sizeof(bad));                             /* 12 zeri: 11 duplicati */
  expect_order_rejected(bad, GAL_MAX_SLOTS, "12 zeri");

  /* puntatore NULL e bit SYNC_F_ORDER assente */
  CHECK_EQ(send_order(NULL, GAL_MAX_SLOTS), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
  SyncIn nofield = mk(SYNC_MSG_ALBUM_ORDER);
  nofield.order = ord;
  nofield.order_len = GAL_MAX_SLOTS;
  CHECK_EQ(handle(&nofield), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);

  CHECK_EQ(g_album_changed, ac);                           /* nessun rifiuto ha notificato */
  CHECK_EQ(storage_manifest()->order[0], 2);
  CHECK_EQ(storage_manifest()->order[1], 3);
  CHECK_EQ(storage_manifest()->order[2], GAL_SLOT_NONE);

  /* ALBUM_ORDER in SYNCING non tocca il pending */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  SyncIn b = begin_in(1, 0x9u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(1, g_photo, MAX_CHUNK, MAX_CHUNK), 0);
  memset(ord, GAL_SLOT_NONE, sizeof(ord));
  ord[0] = 1;
  CHECK_EQ(send_order(ord, GAL_MAX_SLOTS), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  uint32_t next = 0;
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, MAX_CHUNK);
}

/* ALBUM_DELETE. */
static void test_album_delete(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(2), SYNC_ACT_SEND);
  send_photo(3, 0x11u, g_photo, g_crc_a, MAX_CHUNK);
  CHECK_EQ(storage_valid_slots(), 1);
  CHECK_EQ(g_album_changed, 1);

  SyncIn del = mk(SYNC_MSG_ALBUM_DELETE);
  del.fields = SYNC_F_SLOT;
  del.slot = 3;
  CHECK_EQ(handle(&del), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_out.slot, 3);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(storage_manifest()->slots[3].state, GAL_SLOT_EMPTY);
  CHECK_EQ(storage_valid_slots(), 0);
  CHECK_EQ(g_album_changed, 2);
  CHECK(shim_key_exists(GAL_KEY_CHUNK(3, 0)));       /* i chunk restano (storage.h) */
  CHECK(memcmp(shim_key_bytes(GAL_KEY_MANIFEST), storage_manifest(), sizeof(GalManifest)) == 0);
  /* idempotente */
  CHECK_EQ(handle(&del), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK_EQ(g_album_changed, 3);

  /* slot fuori intervallo / campo assente */
  static const uint8_t bad[] = { GAL_MAX_SLOTS, 13, 200, GAL_SLOT_NONE };
  for (unsigned i = 0; i < sizeof(bad) / sizeof(bad[0]); i++) {
    SyncIn m = mk(SYNC_MSG_ALBUM_DELETE);
    m.fields = SYNC_F_SLOT;
    m.slot = bad[i];
    CHECK_EQ(handle(&m), SYNC_ACT_SEND);
    CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
    CHECK_EQ(g_out.slot, bad[i]);
  }
  SyncIn nofield = mk(SYNC_MSG_ALBUM_DELETE);
  nofield.slot = 3;                                  /* valore presente ma bit assente */
  CHECK_EQ(handle(&nofield), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_BAD_FORMAT);
  CHECK_EQ(g_out.slot, GAL_SLOT_NONE);
  CHECK_EQ(g_album_changed, 3);

  /* --- eliminare lo slot del trasferimento in corso lo abbandona --- */
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(2), SYNC_ACT_SEND);
  SyncIn b = begin_in(5, 0x22u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(5, g_photo, 2u * MAX_CHUNK, MAX_CHUNK), 0);
  CHECK(sync_proto_pending(NULL, NULL));
  SyncIn d5 = mk(SYNC_MSG_ALBUM_DELETE);
  d5.fields = SYNC_F_SLOT;
  d5.slot = 5;
  CHECK_EQ(handle(&d5), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  CHECK(!sync_proto_pending(NULL, NULL));
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
  SyncIn e = end_in(5);
  CHECK_EQ(handle(&e), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, 0);

  /* eliminare un ALTRO slot non tocca il pending */
  SyncIn b2 = begin_in(5, 0x22u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b2), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(5, g_photo, MAX_CHUNK, MAX_CHUNK), 0);
  SyncIn d6 = mk(SYNC_MSG_ALBUM_DELETE);
  d6.fields = SYNC_F_SLOT;
  d6.slot = 6;
  CHECK_EQ(handle(&d6), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  uint32_t next = 0;
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, MAX_CHUNK);
}

/* MSG ignoti e messaggi che l'orologio non deve mai ricevere. */
static void test_unknown_msg(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  static const uint8_t unknown[] = { 13, 14, 100, 200, 255,
                                     SYNC_MSG_HELLO, SYNC_MSG_SYNC_READY, SYNC_MSG_STATUS };
  for (unsigned i = 0; i < sizeof(unknown) / sizeof(unknown[0]); i++) {
    SyncIn in = mk(unknown[i]);
    in.fields = SYNC_F_SLOT | SYNC_F_COUNT;
    in.slot = 3;
    in.count = 9;
    CHECK_EQ(handle(&in), SYNC_ACT_SEND);
    CHECK_EQ(g_out.msg, SYNC_MSG_STATUS);
    CHECK_EQ(g_out.code, SYNC_CODE_NOT_SUPPORTED);
    CHECK_EQ(g_out.slot, GAL_SLOT_NONE);
    CHECK_EQ(g_out.offset, 0);
  }
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK_EQ(shim_write_count(), 0);
  CHECK_EQ(g_progress_calls, 0);
  CHECK_EQ(g_album_changed, 0);
  CHECK_EQ(g_settings_changed, 0);

  /* un MSG ignoto in SYNCING non interrompe il trasferimento */
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  SyncIn b = begin_in(0, 0x1u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(0, g_photo, MAX_CHUNK, MAX_CHUNK), 0);
  SyncIn un = mk(200);
  CHECK_EQ(handle(&un), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_NOT_SUPPORTED);
  uint32_t next = 0;
  CHECK(sync_proto_pending(NULL, &next));
  CHECK_EQ(next, MAX_CHUNK);
  CHECK_EQ(sync_proto_state(), SYNC_ST_SYNCING);
}

/* Rinegoziazione del chunk A TRASFERIMENTO IN CORSO (sync.c ricalcola max_chunk a ogni JS_READY):
 * i DATA gia' in volo piu' grandi del nuovo limite vengono rifiutati con SEQ_ERR(next). */
static void test_max_chunk_midsync(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  SyncIn b = begin_in(1, 0x7u, FMT_RAW6, PHOTO_LEN, g_crc_a);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(send_all_data(1, g_photo, MAX_CHUNK, MAX_CHUNK), 0);

  /* il telefono si riconnette con un'inbox piu' piccola */
  sync_proto_set_max_chunk(256);
  CHECK_EQ(sync_proto_max_chunk(), 256);
  SyncIn dbig = data_in(1, MAX_CHUNK, g_photo + MAX_CHUNK, MAX_CHUNK);
  CHECK_EQ(handle(&dbig), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, MAX_CHUNK);         /* si riprende da next con pezzi piu' piccoli */
  CHECK_EQ(send_data_range(1, g_photo, MAX_CHUNK, PHOTO_LEN, 256), 0);
  SyncIn e = end_in(1);
  CHECK_EQ(handle(&e), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  check_chunks(1, g_photo, PHOTO_LEN, "foto A con chunk rinegoziato");

  /* max_chunk azzerato a meta' sync: OGNI PHOTO_DATA diventa SEQ_ERR (n > 0 == max_chunk) e il
   * trasferimento si sblocca solo con il timeout / un nuovo SYNC_REQUEST. Comportamento
   * documentato: vedi il report (osservazione sulla rinegoziazione a 0). */
  SyncIn b2 = begin_in(2, 0x8u, FMT_RAW6, PHOTO_LEN, g_crc_b);
  CHECK_EQ(handle(&b2), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);        /* PHOTO_BEGIN non guarda max_chunk */
  sync_proto_set_max_chunk(0);
  shim_reset_write_count();
  SyncIn d0 = data_in(2, 0, g_photo2, 256);
  CHECK_EQ(handle(&d0), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_SEQ_ERR);
  CHECK_EQ(g_out.offset, 0);
  CHECK_EQ(shim_write_count(), 0);
  CHECK(sync_proto_timeout());               /* unica uscita */
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
}

/* Sequenza completa di due foto + riavvio dell'app (storage_init sullo stesso persist). */
static void test_two_photos_restart(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  SyncIn js = mk(SYNC_MSG_JS_READY);
  CHECK_EQ(handle(&js), SYNC_ACT_SEND);
  CHECK_EQ(g_out.max_chunk, MAX_CHUNK);
  CHECK_EQ(hello_state(g_out.slots, 3), 0);

  CHECK_EQ(sync_request(2), SYNC_ACT_SEND);
  send_photo(3, 0xAAAA0001u, g_photo, g_crc_a, MAX_CHUNK);
  CHECK_EQ(g_progress_index, 1);
  CHECK_EQ(g_progress_count, 2);
  send_photo(7, 0xAAAA0002u, g_photo2, g_crc_b, 512);
  CHECK_EQ(g_progress_index, 2);
  SyncIn done = mk(SYNC_MSG_SYNC_DONE);
  CHECK_EQ(handle(&done), SYNC_ACT_NONE);
  CHECK_EQ(g_progress_index, 0);
  CHECK_EQ(g_progress_count, 0);
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK_EQ(storage_valid_slots(), 2);
  CHECK_EQ(g_album_changed, 2);
  check_chunks(3, g_photo, PHOTO_LEN, "foto A slot 3");
  check_chunks(7, g_photo2, PHOTO_LEN, "foto B slot 7");

  GalManifest before;
  memcpy(&before, storage_manifest(), sizeof(before));

  /* --- riavvio: nessun reset dello shim, solo storage_init/settings_init/sync_proto_init --- */
  CHECK(storage_init());
  settings_init();
  sync_proto_init(FMT_RAW6, MAX_CHUNK);
  CHECK(memcmp(&before, storage_manifest(), sizeof(before)) == 0);
  CHECK_EQ(storage_valid_slots(), 2);
  CHECK_EQ(storage_manifest()->slots[3].crc32, g_crc_a);
  CHECK_EQ(storage_manifest()->slots[3].photo_id, 0xAAAA0001u);
  CHECK_EQ(storage_manifest()->slots[3].generation, 1);
  CHECK_EQ(storage_manifest()->slots[7].crc32, g_crc_b);
  CHECK_EQ(storage_manifest()->slots[7].photo_id, 0xAAAA0002u);
  CHECK_EQ(storage_manifest()->order[0], 3);
  CHECK_EQ(storage_manifest()->order[1], 7);
  CHECK_EQ(storage_manifest()->order[2], GAL_SLOT_NONE);

  /* i chunk riletti da persist ricostruiscono i CRC annunciati */
  for (uint8_t k = 0; k < 2; k++) {
    const uint8_t slot = k ? 7 : 3;
    static uint8_t buf[GAL_CHUNK_BYTES];
    uint32_t crc = 0;
    uint32_t got = 0;
    for (uint16_t i = 0; i < PHOTO_CHUNKS; i++) {
      const int n = storage_read_chunk(slot, i, buf, sizeof(buf));
      if (n <= 0) {
        break;
      }
      crc = crc32_update(crc, buf, (uint32_t)n);
      got += (uint32_t)n;
    }
    CHECK_EQ(got, PHOTO_LEN);
    CHECK_EQ(crc, k ? g_crc_b : g_crc_a);
  }

  /* HELLO dopo il riavvio riporta gli stessi CRC */
  CHECK_EQ(handle(&js), SYNC_ACT_SEND);
  CHECK_EQ(g_out.msg, SYNC_MSG_HELLO);
  CHECK_EQ(hello_state(g_out.slots, 3), 1);
  CHECK_EQ(hello_crc(g_out.slots, 3), g_crc_a);
  CHECK_EQ(hello_state(g_out.slots, 7), 1);
  CHECK_EQ(hello_crc(g_out.slots, 7), g_crc_b);
  for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {
    if (k == 3 || k == 7) {
      continue;
    }
    CHECK_EQ(hello_state(g_out.slots, k), 0);
    CHECK_EQ(hello_crc(g_out.slots, k), 0);
  }
}

/* Sostituzione interrotta di uno slot gia' VALID: manifest invariato, chunk "misti". */
static void test_interrupted_replace(void) {
  fresh(QUOTA_OK, MAX_CHUNK);
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  send_photo(2, 0x1000u, g_photo, g_crc_a, MAX_CHUNK);
  SyncIn done = mk(SYNC_MSG_SYNC_DONE);
  CHECK_EQ(handle(&done), SYNC_ACT_NONE);
  GalManifest before;
  memcpy(&before, storage_manifest(), sizeof(before));
  CHECK_EQ(before.slots[2].generation, 1);

  /* nuova sync: BEGIN + 3 DATA da 4.096 (chunk 0..47) poi SYNC_DONE */
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  const int album0 = g_album_changed;
  const int writes0 = shim_write_count();
  SyncIn b = begin_in(2, 0x2000u, FMT_RAW6, PHOTO_LEN, g_crc_b);
  CHECK_EQ(handle(&b), SYNC_ACT_SEND);
  CHECK_EQ(g_out.code, SYNC_CODE_OK);
  /* revisione S5a: lo slot VALID viene SVUOTATO nel manifest PRIMA di sovrascrivere i chunk
   * (una scrittura del manifest, album_changed notificato) */
  CHECK_EQ(storage_manifest()->slots[2].state, GAL_SLOT_EMPTY);
  CHECK_EQ(g_album_changed, album0 + 1);
  CHECK_EQ(shim_write_count(), writes0 + 1);
  CHECK_EQ(shim_last_write_key(), GAL_KEY_MANIFEST);
  CHECK_EQ(send_all_data(2, g_photo2, 3u * MAX_CHUNK, MAX_CHUNK), 0);
  CHECK_EQ(handle(&done), SYNC_ACT_NONE);
  CHECK_EQ(sync_proto_state(), SYNC_ST_IDLE);
  CHECK(!sync_proto_pending(NULL, NULL));

  /* manifest: lo slot 2 e' EMPTY (la rotazione lo salta, HELLO lo annuncia state 0), il resto e' invariato */
  GalManifest expected;
  memcpy(&expected, &before, sizeof(expected));
  expected.slots[2].state = GAL_SLOT_EMPTY;
  expected.crc16 = storage_manifest()->crc16;
  CHECK(memcmp(&expected, storage_manifest(), sizeof(expected)) == 0);
  CHECK_EQ(storage_manifest()->slots[2].generation, 1);
  CHECK(memcmp(shim_key_bytes(GAL_KEY_MANIFEST), &expected, sizeof(expected)) == 0);
  /* HELLO lo annuncia vuoto */
  SyncIn js = mk(SYNC_MSG_JS_READY);
  CHECK_EQ(handle(&js), SYNC_ACT_SEND);
  CHECK_EQ(g_out.slots[2 * 5], 0);

  /* chunk MISTI: 0..47 dalla foto nuova, 48..133 da quella vecchia (documentato: il CRC li scarta) */
  const uint16_t written = (uint16_t)(3u * MAX_CHUNK / GAL_CHUNK_BYTES);   /* 48 */
  CHECK_EQ(written, 48);
  int mixed_new = 0, mixed_old = 0;
  for (uint16_t i = 0; i < PHOTO_CHUNKS; i++) {
    const uint32_t off = (uint32_t)i * GAL_CHUNK_BYTES;
    const uint32_t rem = PHOTO_LEN - off;
    const uint16_t n = (rem > (uint32_t)GAL_CHUNK_BYTES) ? (uint16_t)GAL_CHUNK_BYTES : (uint16_t)rem;
    const uint8_t *p = shim_key_bytes(GAL_KEY_CHUNK(2, i));
    if (!p) {
      continue;
    }
    if (memcmp(p, g_photo2 + off, n) == 0) {
      mixed_new++;
    } else if (memcmp(p, g_photo + off, n) == 0) {
      mixed_old++;
    }
  }
  CHECK_EQ(mixed_new, written);
  CHECK_EQ(mixed_old, PHOTO_CHUNKS - written);

  /* i chunk misti non tornano col CRC vecchio (e comunque lo slot e' EMPTY: nessuno li legge) */
  static uint8_t buf[GAL_CHUNK_BYTES];
  uint32_t crc = 0;
  for (uint16_t i = 0; i < PHOTO_CHUNKS; i++) {
    const int n = storage_read_chunk(2, i, buf, sizeof(buf));
    CHECK(n > 0);
    crc = crc32_update(crc, buf, (uint32_t)n);
  }
  CHECK(crc != g_crc_a);

  /* la sync successiva rimette lo slot a posto */
  CHECK_EQ(sync_request(1), SYNC_ACT_SEND);
  send_photo(2, 0x2000u, g_photo2, g_crc_b, MAX_CHUNK);
  CHECK_EQ(storage_manifest()->slots[2].generation, 2);
  CHECK_EQ(storage_manifest()->slots[2].crc32, g_crc_b);
  check_chunks(2, g_photo2, PHOTO_LEN, "foto B dopo il ripristino");
}

/* ================================ main ================================ */

static void run(const char *name, void (*fn)(void)) {
  const int ok0 = g_ok, fail0 = g_fail;
  fn();
  printf("  %-24s %4d ok, %d falliti\n", name, g_ok - ok0, g_fail - fail0);
}

int main(void) {
  shim_set_log(getenv("GALLERIA_TEST_VERBOSE") != NULL);
  fill_photos();
  run("api_basics",          test_api_basics);
  run("hello",               test_hello);
  run("hello_disabled",      test_hello_disabled);
  run("sync_request",        test_sync_request);
  run("begin_count_k",       test_begin_count_k);
  run("begin_validation",    test_begin_validation);
  run("begin_quota",         test_begin_quota);
  run("begin_resume",        test_begin_resume);
  run("data_errors",         test_data_errors);
  run("data_ok",             test_data_ok);
  run("data_write_failures", test_data_write_failures);
  run("end",                 test_end);
  run("commit_failure",      test_commit_failure);
  run("done_and_timeout",    test_done_and_timeout);
  run("settings_msg",        test_settings_msg);
  run("album_order",         test_album_order);
  run("album_delete",        test_album_delete);
  run("unknown_msg",         test_unknown_msg);
  run("max_chunk_midsync",   test_max_chunk_midsync);
  run("two_photos_restart",  test_two_photos_restart);
  run("interrupted_replace", test_interrupted_replace);
  printf("sync_proto: %d ok, %d falliti\n", g_ok, g_fail);
  return g_fail ? 1 : 0;
}

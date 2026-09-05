/* sync.c — vedi sync.h. Buffer static a file-scope (regola 5); un solo log per messaggio di
 * controllo e uno per foto (regola 11, S7): i tempi per chunk si accumulano in max/media e finiscono
 * nella riga di PHOTO_END (S8 li misura sul PT2); la riga per chunk resta in LOGV per il gate.
 *
 * S5a, deviazione dal design D9: app_message_close() NON è esportata dall'SDK 4.33.1 (assente da
 * pebble.h e da libpebble.a; esiste solo dentro il firmware) e app_message_open() ritorna
 * APP_MSG_INVALID_STATE se già aperta → nessuna "inbox a due fasi". L'inbox è UNA, aperta in init()
 * con la dimensione del chunk massimo (4.096 B di DATA + intestazioni: 4.153 B) e resta aperta
 * per tutta la vita dell'app; app_message_open() non ritaglia la dimensione richiesta (PebbleOS
 * app_message.c, letto il 29/08/2026), quindi la si può aprire anche senza telefono connesso. Il
 * chunk annunciato in HELLO viene rinegoziato a ogni JS_READY da app_message_inbox_size_maximum()
 * (dipende dalle capability del telefono connesso: 8.200 con l'app Core / emulatore). L'outbox è
 * esatto (regola 7, F4): dict_calc_buffer_size del HELLO (119 B, v1.9), che è per costruzione il messaggio
 * più grande; gli esiti delle dict_write_* sono accumulati e un messaggio incompleto lascia un
 * WARNING (tripwire per l'emulatore) ma parte comunque (OUT_WRITING si chiude solo con send). */
#include <pebble.h>
#include "sync.h"
#include "sync_proto.h"
#include "storage.h"
#include "settings.h"
#include "model.h"
#include "ui_photo.h"
#include "ui_time.h"
#include "photo_codec.h"
#include "gal_log.h"

#define SYNC_INBOX_SLACK    16       /* margine per chiavi future nei PHOTO_DATA */
#define SYNC_OUT_QUEUE      4

static bool      s_inited;
static uint32_t  s_inbox_size;       /* aperta in init: overhead + slack + chunk massimo */
static uint32_t  s_overhead;         /* dict_calc_buffer_size(4, 4, 4, 4, 0) + slack */
static uint32_t  s_outbox_size;      /* F4: dict_calc_buffer_size del HELLO (119 B, v1.9), il messaggio più grande */
static AppTimer *s_idle_timer;
static uint8_t   s_idle_gen;         /* F2: generazione del timer di silenzio (contesto del callback) */
static SyncOut   s_queue[SYNC_OUT_QUEUE];
static uint8_t   s_q_head, s_q_len;
static bool      s_sending;          /* messaggio in volo (fino a outbox_sent/failed) */
static time_t    s_photo_s0;         /* tempo del PHOTO_BEGIN corrente (log per foto) */
static bool      s_album_dirty;      /* manifest cambiato durante la sync: il modello lo rilegge a fine sync */
static uint16_t  s_photo_ms0;
static uint8_t   s_photo_msgs;       /* PHOTO_DATA ricevuti per la foto corrente */
static int32_t   s_chunk_ms_max;     /* S7: ms del PHOTO_DATA più lento / somma, azzerati al PHOTO_BEGIN */
static int32_t   s_chunk_ms_sum;     /*     (riga END: "ch max %d avg %d", nessun log per chunk) */
#ifdef GALLERIA_DEBUG_TIMING
static time_t    s_gap_s0;           /* S8: arrivo dell'ultimo PHOTO_DATA → "sync: gap n= max avg" al PHOTO_END */
static uint16_t  s_gap_ms0;
static bool      s_gap_have;
static uint8_t   s_gap_n;
static int32_t   s_gap_max;
static int32_t   s_gap_sum;
#endif
#ifdef GALLERIA_DEBUG_HEAP
static bool      s_was_syncing;      /* LOGH("sync_end") solo al passaggio SYNCING → riposo */
#endif

/* ---- tempi (una misura per messaggio) ---- */

static int32_t prv_elapsed_ms(time_t s0, uint16_t ms0) {
  time_t s1 = 0;
  uint16_t ms1 = 0;
  time_ms(&s1, &ms1);
  if (s0 == 0 || s1 - s0 > 1000000) {
    return -1;                             /* nessun riferimento (END senza BEGIN): niente overflow nel log */
  }
  const int32_t dt = (int32_t)(s1 - s0) * 1000 + ((int32_t)ms1 - (int32_t)ms0);
  return dt < 0 ? 0 : dt;                  /* pypkjs/telefono risincronizzano l'orologio di ±1 s (S6 §7: -951 ms) */
}

/* ---- negoziazione del chunk ---- */

/* Chunk massimo della piattaforma: min(SYNC_MAX_CHUNK_BYTES, ceil(foto / 256) × 256):
 * 4.096 B su emery (raw6 34.200 B → 9 messaggi), 3.072 B su flint (raw1 3.024 B → 1 messaggio). */
static uint32_t prv_platform_chunk(void) {
  const uint32_t len = photo_format_length(ui_photo_native_format());
  uint32_t plat = ((len + GAL_CHUNK_BYTES - 1) / GAL_CHUNK_BYTES) * GAL_CHUNK_BYTES;
  if (plat > SYNC_MAX_CHUNK_BYTES) {
    plat = SYNC_MAX_CHUNK_BYTES;
  }
  return plat;
}

/* chunk = min(chunk di piattaforma, ((inbox_max − overhead) / 256) × 256). L'overhead 41 =
 * dict_calc_buffer_size(4, 4, 4, 4, 0): MSG, SLOT, OFFSET arrivano dal JS come int32 (doc SDK
 * "Number → int32") più la tupla DATA; +16 di margine. Mai *_size_maximum() come dimensione di
 * apertura (regola 7). Con un telefono senza 8k (inbox_max 124+) il risultato è 0 = sync non
 * supportata: HELLO lo annuncia e il PKJS non manda foto. */
static uint16_t prv_negotiate_chunk(void) {
  const uint32_t inbox_max = app_message_inbox_size_maximum();
  const uint32_t avail = (inbox_max > s_overhead) ? inbox_max - s_overhead : 0;
  uint32_t chunk = (avail / GAL_CHUNK_BYTES) * GAL_CHUNK_BYTES;
  const uint32_t plat = prv_platform_chunk();
  if (chunk > plat) {
    chunk = plat;
  }
  LOGV("sync: inbox_max=%u inbox=%u chunk=%u", (unsigned)inbox_max, (unsigned)s_inbox_size,
       (unsigned)chunk);                   /* per JS_READY; il chunk in vigore e' nella riga "sync: open" */
  return (uint16_t)chunk;
}

/* ---- coda outbox ---- */

static void prv_pump_one(void);

static void prv_queue_clear(void) {
  s_q_head = 0;
  s_q_len = 0;
}

static void prv_queue_pop(void) {
  if (s_q_len > 0) {
    s_q_head = (uint8_t)((s_q_head + 1) % SYNC_OUT_QUEUE);
    s_q_len--;
  }
}

static void prv_enqueue(const SyncOut *out) {
  if (s_q_len >= SYNC_OUT_QUEUE) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "sync: outbox queue full, msg %u dropped", (unsigned)out->msg);
    return;                                  /* il telefono va in timeout e ripete: si autocorregge */
  }
  s_queue[(s_q_head + s_q_len) % SYNC_OUT_QUEUE] = *out;
  s_q_len++;
}

static void prv_pump(void) {
  while (!s_sending && s_q_len > 0) {       /* un messaggio scartato non deve bloccare i successivi (revisione S5a) */
    prv_pump_one();
  }
}

static void prv_pump_one(void) {
  const SyncOut *o = &s_queue[s_q_head];
  DictionaryIterator *it = NULL;
  AppMessageResult r = app_message_outbox_begin(&it);
  if (r != APP_MSG_OK || !it) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "sync: outbox_begin -> %d, msg %u dropped", (int)r, (unsigned)o->msg);
    prv_queue_pop();
    return;
  }
  /* F4: gli esiti (DictionaryResult, codici a bit) si accumulano: una tupla che non entra viene
   * scartata in silenzio da dict_write_* (PebbleOS dict.c) e il messaggio partirebbe tronco. */
  DictionaryResult dr = dict_write_uint8(it, MESSAGE_KEY_MSG, o->msg);
  switch (o->msg) {
    case SYNC_MSG_HELLO:                       /* 1 + 7·7 + SYNC_HELLO_VALUE_BYTES = 119 B = outbox esatto */
      dr |= dict_write_uint8(it, MESSAGE_KEY_PROTO, o->proto);
      dr |= dict_write_uint8(it, MESSAGE_KEY_FORMAT, o->format);
      dr |= dict_write_uint16(it, MESSAGE_KEY_MAX_CHUNK, o->max_chunk);
      dr |= dict_write_uint16(it, MESSAGE_KEY_CRC, o->settings_crc);    /* S5b */
      dr |= dict_write_uint16(it, MESSAGE_KEY_OPEN_MS, o->open_ms);     /* v1.9 (perf 04/09) */
      if (o->slots && o->slots_len) {
        dr |= dict_write_data(it, MESSAGE_KEY_SLOTS, o->slots, o->slots_len);
      }
      break;
    case SYNC_MSG_SYNC_READY:                  /* 1 + 2·7 + 3 = 18 B */
      dr |= dict_write_uint16(it, MESSAGE_KEY_MAX_CHUNK, o->max_chunk);
      break;
    case SYNC_MSG_STATUS:                      /* S5b: 1 + 5·7 + 8 = 44 B */
      dr |= dict_write_uint8(it, MESSAGE_KEY_CODE, o->code);
      dr |= dict_write_uint8(it, MESSAGE_KEY_SLOT, o->slot);
      dr |= dict_write_uint32(it, MESSAGE_KEY_OFFSET, o->offset);
      dr |= dict_write_uint8(it, MESSAGE_KEY_REPLY_TO, o->reply_to);
      break;
    default:
      break;
  }
  if (dr != DICT_OK) {
    /* Tripwire per l'emulatore (campo aggiunto senza aggiornare s_outbox_size). Si spedisce
     * COMUNQUE: dopo outbox_begin il firmware è in OUT_WRITING e se ne esce solo con outbox_send
     * (un secondo begin darebbe APP_MSG_INVALID_STATE: sync morta fino al riavvio). */
    APP_LOG(APP_LOG_LEVEL_WARNING, "sync: dict_write -> %d, msg %u incompleto", (int)dr, (unsigned)o->msg);
  }
  dict_write_end(it);
  r = app_message_outbox_send();
  if (r == APP_MSG_OK) {
    s_sending = true;                        /* prossimo invio da outbox_sent/failed */
  } else {
    APP_LOG(APP_LOG_LEVEL_WARNING, "sync: outbox_send -> %d, msg %u dropped", (int)r, (unsigned)o->msg);
    prv_queue_pop();                         /* nessun retry (regola 7) */
  }
}

/* ---- timeout di silenzio ---- */

/* Invariante (F2): prv_idle_cb azzera s_idle_timer per prima cosa, quindi un handle non NULL è
 * pendente oppure scaduto-non-consumato (callback ancora in coda dietro il messaggio che stiamo
 * servendo): app_timer_cancel è sempre lecito e scarta quel callback (PebbleOS evented_timer).
 * s_idle_gen viaggia come contesto del timer: un callback stantio di un timer superato non deve
 * azzerare l'handle nuovo né forzare IDLE (doppia rete oltre a cancel). */
static void prv_idle_cancel(void) {
  if (s_idle_timer) {
    app_timer_cancel(s_idle_timer);
    s_idle_timer = NULL;
    s_idle_gen++;
  }
}

/* Il modello rilegge il manifest (ricarica foto + redraw) UNA volta a fine sync, non a ogni PHOTO_END
 * dentro inbox_received (revisione S5a: l'ACK partiva dopo 134 letture persist + luma). F1: finché la
 * sync è attiva la rotazione è congelata (model_sync_hold): il manifest in RAM cambia già al
 * PHOTO_BEGIN (slot svuotato) e un tick/shake/focus leggerebbe uno slot sparito → cambio foto o demo
 * a metà trasferimento (134 letture persist + luma nel tick). Chiamata dopo OGNI messaggio ricevuto
 * e nel timeout di silenzio: a riposo rilascia l'hold (con o senza manifest da rileggere). */
static void prv_album_flush(void) {
  if (sync_proto_state() == SYNC_ST_SYNCING) {
    model_sync_hold(true);
#ifdef GALLERIA_DEBUG_HEAP
    s_was_syncing = true;
#endif
    return;
  }
  if (s_album_dirty) {
    s_album_dirty = false;
    model_album_changed();                   /* rilascia anche l'hold */
  } else {
    model_sync_hold(false);                  /* niente da rileggere: applica le rotazioni congelate */
  }
#ifdef GALLERIA_DEBUG_HEAP
  if (s_was_syncing) {
    s_was_syncing = false;
    LOGH("sync_end");                        /* gate S7: uguale all'heap prima della sync (nessuna perdita) */
  }
#endif
}

static void prv_idle_cb(void *ctx) {
  if ((uint8_t)(uintptr_t)ctx != s_idle_gen) {
    return;                                  /* F2: timer superato, non è quello corrente */
  }
  s_idle_timer = NULL;
  if (sync_proto_timeout()) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "sync: %u s idle -> IDLE heap %u/%u", (unsigned)(SYNC_IDLE_TIMEOUT_MS / 1000),
            (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
  }
  prv_album_flush();
}

/* In SYNCING ogni messaggio ricevuto riarma i 30 s di silenzio; fuori da SYNCING il timer si spegne. */
static void prv_idle_touch(void) {
  if (sync_proto_state() != SYNC_ST_SYNCING) {
    prv_idle_cancel();
    return;
  }
  if (s_idle_timer) {
    if (app_timer_reschedule(s_idle_timer, SYNC_IDLE_TIMEOUT_MS)) {
      return;
    }
    /* Scaduto ma il callback è ancora in coda dietro questo messaggio (reschedule → false): cancel
     * lo scarta, altrimenti forzerebbe IDLE subito dopo un messaggio ricevuto (F2). */
    app_timer_cancel(s_idle_timer);
  }
  s_idle_gen++;
  s_idle_timer = app_timer_register(SYNC_IDLE_TIMEOUT_MS, prv_idle_cb, (void *)(uintptr_t)s_idle_gen);
  if (!s_idle_timer) {
    /* S7 (test_sync): senza timer la sync resterebbe in SYNCING — con la rotazione congelata (F1) —
     * finché non arriva un altro messaggio o l'app riparte. Meglio abbandonarla subito: il telefono
     * riceve BUSY al prossimo messaggio di foto e rinnova la SYNC_REQUEST; il chiamante (prv_album_flush)
     * rilascia l'hold nello stesso giro. */
    APP_LOG(APP_LOG_LEVEL_WARNING, "sync: idle timer alloc failed -> IDLE");
    sync_proto_timeout();
  }
}

/* ---- decodifica ---- */

static uint32_t prv_tuple_u32(const Tuple *t) {
  switch (t->length) {                       /* il JS manda int32; altri client possono usare 1/2 B */
    case 1:  return t->value->uint8;
    case 2:  return t->value->uint16;
    case 4:  return t->value->uint32;
    default: return 0;
  }
}

static bool prv_get_u32(DictionaryIterator *it, uint32_t key, uint32_t *v) {
  const Tuple *t = dict_find(it, key);
  if (!t || (t->type != TUPLE_UINT && t->type != TUPLE_INT)) {
    return false;
  }
  *v = prv_tuple_u32(t);
  return true;
}

static uint8_t prv_u8(uint32_t v) {
  return (v > 0xFFu) ? 0xFFu : (uint8_t)v;   /* saturato: 256 non deve diventare lo slot 0 */
}

static bool prv_get_bytes(DictionaryIterator *it, uint32_t key, const uint8_t **p, uint16_t *n) {
  const Tuple *t = dict_find(it, key);
  if (!t || t->type != TUPLE_BYTE_ARRAY) {
    return false;
  }
  *p = t->value->data;
  *n = t->length;
  return true;
}

static void prv_decode(DictionaryIterator *it, SyncIn *in) {
  uint32_t v;
  memset(in, 0, sizeof(*in));
  if (prv_get_u32(it, MESSAGE_KEY_MSG, &v))      { in->msg = prv_u8(v); }
  if (prv_get_u32(it, MESSAGE_KEY_COUNT, &v))    { in->count = prv_u8(v);  in->fields |= SYNC_F_COUNT; }
  if (prv_get_u32(it, MESSAGE_KEY_SLOT, &v))     { in->slot = prv_u8(v);   in->fields |= SYNC_F_SLOT; }
  if (prv_get_u32(it, MESSAGE_KEY_FORMAT, &v))   { in->format = prv_u8(v); in->fields |= SYNC_F_FORMAT; }
  if (prv_get_u32(it, MESSAGE_KEY_PHOTO_ID, &v)) { in->photo_id = v;       in->fields |= SYNC_F_PHOTO_ID; }
  if (prv_get_u32(it, MESSAGE_KEY_LENGTH, &v))   { in->length = v;         in->fields |= SYNC_F_LENGTH; }
  if (prv_get_u32(it, MESSAGE_KEY_CRC, &v))      { in->crc = v;            in->fields |= SYNC_F_CRC; }
  if (prv_get_u32(it, MESSAGE_KEY_OFFSET, &v))   { in->offset = v;         in->fields |= SYNC_F_OFFSET; }
  if (prv_get_bytes(it, MESSAGE_KEY_DATA, &in->data, &in->data_len))             { in->fields |= SYNC_F_DATA; }
  if (prv_get_bytes(it, MESSAGE_KEY_ORDER, &in->order, &in->order_len))          { in->fields |= SYNC_F_ORDER; }
  if (prv_get_bytes(it, MESSAGE_KEY_SETTINGS, &in->settings, &in->settings_len)) { in->fields |= SYNC_F_SETTINGS; }
}

/* ---- callback AppMessage ---- */

static void prv_inbox_received(DictionaryIterator *it, void *ctx) {
  static SyncIn s_in;                        /* ~40 B: comunque static (regola 5) */
  prv_decode(it, &s_in);
  if (s_in.msg == SYNC_MSG_JS_READY) {
    sync_proto_set_max_chunk(prv_negotiate_chunk());   /* il telefono connesso può essere cambiato */
  }
  time_t s0 = 0;
  uint16_t ms0 = 0;
  time_ms(&s0, &ms0);
  if (s_in.msg == SYNC_MSG_PHOTO_BEGIN) {
    s_photo_s0 = s0;
    s_photo_ms0 = ms0;
    s_photo_msgs = 0;
    s_chunk_ms_max = 0;
    s_chunk_ms_sum = 0;
#ifdef GALLERIA_DEBUG_TIMING
    s_gap_n = 0;
    s_gap_max = 0;
    s_gap_sum = 0;
    s_gap_have = false;
#endif
  }
#ifdef GALLERIA_DEBUG_TIMING
  if (s_in.msg == SYNC_MSG_PHOTO_DATA) {         /* S8: intervallo fra arrivi consecutivi di PHOTO_DATA
                                                    (= BLE + telefono + le scritture persist del chunk precedente) */
    if (s_gap_have) {
      const int32_t gap = prv_elapsed_ms(s_gap_s0, s_gap_ms0);
      if (gap >= 0) {                            /* -1 = nessun riferimento: fuori dalla statistica */
        s_gap_n++;
        s_gap_sum += gap;
        if (gap > s_gap_max) {
          s_gap_max = gap;
        }
      }
    }
    s_gap_s0 = s0;
    s_gap_ms0 = ms0;
    s_gap_have = true;
  }
#endif
  SyncOut out;
  const SyncAction act = sync_proto_handle(&s_in, &out);
  const int32_t dt = prv_elapsed_ms(s0, ms0);   /* ms spesi in sync_proto_handle (chunk: scrittura persist) */
  switch (s_in.msg) {
    case SYNC_MSG_PHOTO_DATA:                /* nessun APP_LOG per chunk (regola 11): statistiche nella riga END */
      s_photo_msgs++;
      s_chunk_ms_sum += dt;
      if (dt > s_chunk_ms_max) {
        s_chunk_ms_max = dt;
      }
      LOGV("sync: data slot=%u off=%u n=%u -> act=%d code=%u %d ms", (unsigned)s_in.slot,
           (unsigned)s_in.offset, (unsigned)s_in.data_len, (int)act, (unsigned)out.code, (int)dt);
      break;
    case SYNC_MSG_PHOTO_END: {               /* una riga per foto: s=slot c=code n=PHOTO_DATA, ms del commit, della foto, per chunk */
      const int32_t photo_ms = prv_elapsed_ms(s_photo_s0, s_photo_ms0);   /* PRIMA della riga gap: il suo APP_LOG non entra nel totale */
#ifdef GALLERIA_DEBUG_TIMING
      if (s_gap_have) {                    /* una sola riga per foto: un PHOTO_END ritrasmesso non la ripete (F36) */
        APP_LOG(APP_LOG_LEVEL_INFO, "sync: gap n=%u max %d avg %d", (unsigned)s_gap_n, (int)s_gap_max,
                (int)(s_gap_n ? s_gap_sum / (int32_t)s_gap_n : 0));
        s_gap_have = false;
        s_gap_n = 0;
        s_gap_max = 0;
        s_gap_sum = 0;
      }
#endif
      APP_LOG(APP_LOG_LEVEL_INFO, "sync: end s=%u c=%u n=%u commit %d photo %d ch max %d avg %d heap %u",
              (unsigned)s_in.slot, (unsigned)out.code, (unsigned)s_photo_msgs, (int)dt,
              (int)photo_ms, (int)s_chunk_ms_max,
              (int)(s_photo_msgs ? s_chunk_ms_sum / s_photo_msgs : 0), (unsigned)heap_bytes_free());
      break;
    }
    default:                                 /* un rigo per messaggio di controllo (f = campi presenti, st = stato) */
      APP_LOG(APP_LOG_LEVEL_INFO, "sync: msg=%u f=%x -> act=%d out=%u code=%u off=%u st=%u heap %u",
              (unsigned)s_in.msg, (unsigned)s_in.fields, (int)act, (unsigned)out.msg, (unsigned)out.code,
              (unsigned)out.offset, (unsigned)sync_proto_state(), (unsigned)heap_bytes_free());
      break;
  }
  prv_idle_touch();
  if (act == SYNC_ACT_SEND) {
    prv_enqueue(&out);
    prv_pump();
  }
  prv_album_flush();                         /* dopo l'invio: fuori da SYNCING (SYNC_DONE, ORDER/DELETE a riposo) */
}

static void prv_inbox_dropped(AppMessageResult reason, void *ctx) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "sync: inbox dropped (%d) state=%u", (int)reason,
          (unsigned)sync_proto_state());   /* il telefono riceve NACK e ritenta */
}

static void prv_outbox_sent(DictionaryIterator *it, void *ctx) {
  s_sending = false;
  prv_queue_pop();
  prv_pump();
}

static void prv_outbox_failed(DictionaryIterator *it, AppMessageResult reason, void *ctx) {
  s_sending = false;
  APP_LOG(APP_LOG_LEVEL_WARNING, "sync: outbox failed (%d), queue %u", (int)reason, (unsigned)s_q_len);
  prv_queue_pop();
  if (reason & (APP_MSG_NOT_CONNECTED | APP_MSG_APP_NOT_RUNNING)) {
    prv_queue_clear();                       /* mai ritentare senza telefono (regola 7) */
  }
  prv_pump();
}

/* ---- ambiente per sync_proto ---- */

void sync_env_album_changed(void) {
  s_album_dirty = true;                      /* consumato da prv_album_flush a fine sync (o subito se a riposo) */
}

void sync_env_settings_changed(const GalSettings *b) {
  const GalSettings *n = settings_get();
  if (b->lang != n->lang) {
    ui_time_lang_changed();                  /* S10 (D37): separatore delle migliaia, data, fascia info (prima dei rami sotto) */
  }
  if (b->clock_mode != n->clock_mode || b->leading_zero != n->leading_zero || b->info_row != n->info_row) {
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    if (t) {
      ui_time_tick(t);                       /* riformatta ora e riga info */
    }
  }
  if (b->layout != n->layout || b->font != n->font) {
    ui_time_layout_changed();                /* strip e griglia; include colore e redraw completo */
  } else if (b->text_color != n->text_color || b->outline != n->outline || b->digit_style != n->digit_style) {
    ui_time_style_changed();                 /* palette delle strip + redraw (S8-stile: anche lo stile delle cifre) */
  } else {
    ui_time_request_full_redraw();           /* p.es. 12/24 h nel layout B: la riga HH sta fuori fascia */
  }
  if (b->interval_min != n->interval_min || b->order != n->order || b->shake_next != n->shake_next) {
    model_settings_changed();
  }
}

void sync_env_progress(uint8_t index, uint8_t count) {
  ui_time_set_sync_progress(index, count);
}

/* ---- API ---- */

void sync_init(void) {
  if (s_inited) {
    return;
  }
  s_inited = true;
  s_sending = false;
  s_album_dirty = false;                     /* S7: nessun residuo di un'esecuzione precedente (test host) */
  prv_queue_clear();
  s_overhead = dict_calc_buffer_size(4, (size_t)4, (size_t)4, (size_t)4, (size_t)0) + SYNC_INBOX_SLACK;
  s_inbox_size = s_overhead + prv_platform_chunk();
  /* Outbox esatto (regola 7, F4): HELLO {PROTO u8, FORMAT u8, MAX_CHUNK u16, CRC u16, OPEN_MS u16,
   * SLOTS 60 B} = 1 + 7·7 + SYNC_HELLO_VALUE_BYTES = 119 B è per costruzione il messaggio più grande (STATUS 44 B,
   * SYNC_READY 18 B), quindi basta a tutti. Un campo in più senza aggiornare questa riga fa scattare
   * il tripwire di prv_pump_one al primo HELLO in emulatore invece di consumare margine in silenzio. */
  s_outbox_size = dict_calc_buffer_size(7, (size_t)1, (size_t)1, (size_t)1, (size_t)2, (size_t)2, (size_t)2,
                                        (size_t)SYNC_SLOTS_BYTES);
#ifdef GALLERIA_DEBUG_OUTBOX
  s_outbox_size = GALLERIA_DEBUG_OUTBOX;     /* build di test: outbox forzato (p.es. 100 → HELLO senza SLOTS + WARNING) */
#endif
  sync_proto_init(ui_photo_native_format(), prv_negotiate_chunk());
  /* Callback PRIMA di open (regola 7). Una sola apertura per esecuzione (vedi intestazione). */
  app_message_register_inbox_received(prv_inbox_received);
  app_message_register_inbox_dropped(prv_inbox_dropped);
  app_message_register_outbox_sent(prv_outbox_sent);
  app_message_register_outbox_failed(prv_outbox_failed);
  const unsigned free0 = heap_bytes_free();
  const AppMessageResult r = app_message_open(s_inbox_size, s_outbox_size);
  APP_LOG(APP_LOG_LEVEL_INFO, "sync: open(%u/%u) -> %d chunk=%u heap %u/%u (cost %u)", (unsigned)s_inbox_size,
          (unsigned)s_outbox_size, (int)r, (unsigned)sync_proto_max_chunk(), (unsigned)heap_bytes_used(),
          (unsigned)heap_bytes_free(), free0 - heap_bytes_free());
}

void sync_deinit(void) {
  if (!s_inited) {
    return;
  }
  prv_idle_cancel();
  app_message_deregister_callbacks();
  prv_queue_clear();
  s_sending = false;
  s_inited = false;
}

/* pebble_shim.c — implementazione dello shim host di <pebble.h> (vedi shim/pebble.h).
 * Persist in RAM: mappa chiave -> { byte[256], len }, con il troncamento a
 * PERSIST_DATA_MAX_LENGTH del firmware e i codici di errore dell'SDK. Timer unico con lo stato
 * "scaduto ma non consumato" (F2), tap service e risorse finti (model.c), ultima riga di log. */
#include <pebble.h>
#include <stdio.h>

typedef struct {
  uint32_t key;
  uint16_t len;
  bool     used;
  uint8_t  data[PERSIST_DATA_MAX_LENGTH];
} ShimEntry;

static ShimEntry s_entries[SHIM_MAX_KEYS];
static size_t    s_quota = 1048576u;
static uint32_t  s_last_write_key = SHIM_NO_KEY;
static bool      s_is_24h = true;
static int       s_writes;
static int       s_deletes;
static int       s_fail_after = -1;          /* < 0: nessuna iniezione */
static status_t  s_fail_code = E_OUT_OF_STORAGE;
static bool      s_log;

struct AppTimer {
  uint32_t         timeout_ms;
  AppTimerCallback cb;
  void            *data;
  bool             pending;                  /* registrato e non ancora consumato né cancellato */
  bool             expired;                  /* F2: scaduto, callback in coda (pending resta true) */
};
static struct AppTimer s_timer;              /* handle unico e stabile: un handle "vecchio" non
                                                diventa mai penzolante (reschedule/cancel sicuri) */
static int  s_timer_registrations, s_timer_reschedules, s_timer_cancels, s_timer_orphans;
static bool s_timer_register_fails;

static AccelTapHandler s_tap_handler;
static int  s_tap_subscribes, s_tap_unsubscribes;

static char s_log_last[256];
static int  s_log_count;
/* S7: buffer circolare delle ultime righe (con il livello) per shim_log_warnings/find. */
static char s_log_ring[SHIM_LOG_LINES][256];
static uint8_t s_log_level[SHIM_LOG_LINES];
static int  s_log_ring_n;                    /* righe scritte dal reset (può superare SHIM_LOG_LINES) */
static int  s_log_warnings, s_log_errors;

/* ---- helper ---- */

static ShimEntry *prv_find(uint32_t key) {
  for (size_t i = 0; i < SHIM_MAX_KEYS; i++) {
    if (s_entries[i].used && s_entries[i].key == key) {
      return &s_entries[i];
    }
  }
  return NULL;
}

static ShimEntry *prv_alloc(uint32_t key) {
  for (size_t i = 0; i < SHIM_MAX_KEYS; i++) {
    if (!s_entries[i].used) {
      s_entries[i].used = true;
      s_entries[i].key = key;
      s_entries[i].len = 0;
      memset(s_entries[i].data, 0, sizeof(s_entries[i].data));
      return &s_entries[i];
    }
  }
  return NULL;
}

/* Iniezione: true se questa scrittura deve fallire. */
static bool prv_write_fails(void) {
  return (s_fail_after >= 0 && s_writes >= s_fail_after);
}

static int prv_store(uint32_t key, const void *data, size_t size) {
  if (prv_write_fails()) {
    return (int)s_fail_code;
  }
  ShimEntry *e = prv_find(key);
  if (!e) {
    e = prv_alloc(key);
    if (!e) {
      return E_OUT_OF_STORAGE;               /* tabella piena: come la quota esaurita */
    }
  }
  size_t n = (size > PERSIST_DATA_MAX_LENGTH) ? PERSIST_DATA_MAX_LENGTH : size;  /* il firmware tronca */
  memset(e->data, 0, sizeof(e->data));
  if (n > 0 && data) {
    memcpy(e->data, data, n);
  }
  e->len = (uint16_t)n;
  s_writes++;
  s_last_write_key = key;
  return (int)n;
}

/* ---- persist ---- */

bool persist_exists(const uint32_t key) {
  return prv_find(key) != NULL;
}

size_t persist_get_max_size(void) {
  return s_quota;
}

int persist_get_size(const uint32_t key) {
  const ShimEntry *e = prv_find(key);
  return e ? (int)e->len : E_DOES_NOT_EXIST;
}

int32_t persist_read_int(const uint32_t key) {
  const ShimEntry *e = prv_find(key);
  int32_t v = 0;
  if (!e) {
    return 0;                                /* "if the value has not yet been set: 0" */
  }
  memcpy(&v, e->data, (e->len < sizeof(v)) ? e->len : sizeof(v));
  return v;
}

int persist_read_data(const uint32_t key, void *buffer, const size_t buffer_size) {
  const ShimEntry *e = prv_find(key);
  if (!e) {
    return E_DOES_NOT_EXIST;
  }
  size_t n = (e->len < buffer_size) ? e->len : buffer_size;
  if (n > 0 && buffer) {
    memcpy(buffer, e->data, n);
  }
  return (int)n;
}

status_t persist_write_int(const uint32_t key, const int32_t value) {
  return (status_t)prv_store(key, &value, sizeof(value));
}

int persist_write_data(const uint32_t key, const void *data, const size_t size) {
  if (!data && size > 0) {
    return E_INVALID_ARGUMENT;
  }
  return prv_store(key, data, size);
}

status_t persist_delete(const uint32_t key) {
  ShimEntry *e = prv_find(key);
  if (!e) {
    return E_DOES_NOT_EXIST;
  }
  e->used = false;
  e->len = 0;
  s_deletes++;
  return S_TRUE;
}

/* ---- timer ---- */

AppTimer *app_timer_register(uint32_t timeout_ms, AppTimerCallback callback, void *callback_data) {
  if (s_timer_register_fails) {
    return NULL;
  }
  if (s_timer.pending) {
    s_timer_orphans++;                       /* register con un timer ancora vivo: sul firmware
                                                sarebbero due (bug F2: register senza cancel) */
  }
  s_timer.timeout_ms = timeout_ms;
  s_timer.cb = callback;
  s_timer.data = callback_data;
  s_timer.pending = true;
  s_timer.expired = false;
  s_timer_registrations++;
  return &s_timer;
}

bool app_timer_reschedule(AppTimer *timer_handle, uint32_t new_timeout_ms) {
  if (timer_handle != &s_timer || !s_timer.pending || s_timer.expired) {
    return false;                            /* "elapsed timers cannot be rescheduled" (anche se il
                                                callback non è ancora stato eseguito: evented_timer) */
  }
  s_timer.timeout_ms = new_timeout_ms;
  s_timer_reschedules++;
  return true;
}

void app_timer_cancel(AppTimer *timer_handle) {
  if (timer_handle == &s_timer) {
    s_timer.pending = false;                 /* anche se scaduto-non-consumato: il callback in coda
                                                viene scartato (sys_evented_timer_consume) */
    s_timer.expired = false;
    s_timer_cancels++;
  }
}

/* ---- tap service (model.c): no-op che registra l'handler ---- */

void accel_tap_service_subscribe(AccelTapHandler handler) {
  s_tap_handler = handler;
  s_tap_subscribes++;
}

void accel_tap_service_unsubscribe(void) {
  s_tap_handler = NULL;
  s_tap_unsubscribes++;
}

/* ---- risorse (model.c solo con GALLERIA_DEBUG_SEED): nessuna risorsa sull'host ---- */

ResHandle resource_get_handle(uint32_t resource_id) {
  return NULL;
}

size_t resource_size(ResHandle h) {
  return 0;
}

size_t resource_load_byte_range(ResHandle h, uint32_t start_offset, uint8_t *buffer, size_t num_bytes) {
  return 0;
}

/* ---- ora di sistema ---- */

bool clock_is_24h_style(void) {
  return s_is_24h;
}

void time_ms(time_t *utc_time, uint16_t *out_ms) {
  if (utc_time) {
    *utc_time = time(NULL);
  }
  if (out_ms) {
    *out_ms = 0;
  }
}

/* ---- log ---- */

void app_log(uint8_t log_level, const char *src_filename, int src_line_number, const char *fmt, ...) {
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(s_log_last, sizeof(s_log_last), fmt, ap);   /* sempre: shim_log_last() anche a log spento */
  va_end(ap);
  s_log_count++;
  snprintf(s_log_ring[s_log_ring_n % SHIM_LOG_LINES], sizeof(s_log_ring[0]), "%s", s_log_last);
  s_log_level[s_log_ring_n % SHIM_LOG_LINES] = log_level;
  s_log_ring_n++;
  if (log_level <= APP_LOG_LEVEL_ERROR) {
    s_log_errors++;
  } else if (log_level <= APP_LOG_LEVEL_WARNING) {
    s_log_warnings++;
  }
  if (!s_log) {
    return;
  }
  const char *lvl = (log_level <= APP_LOG_LEVEL_ERROR) ? "E"
                  : (log_level <= APP_LOG_LEVEL_WARNING) ? "W"
                  : (log_level <= APP_LOG_LEVEL_INFO) ? "I" : "D";
  printf("[%s %s:%d] %s\n", lvl, src_filename, src_line_number, s_log_last);
}

/* ---- hook di test ---- */

void shim_persist_reset(void) {
  memset(s_entries, 0, sizeof(s_entries));
  s_quota = 1048576u;
  s_last_write_key = SHIM_NO_KEY;
  s_is_24h = true;
  s_writes = 0;
  s_deletes = 0;
  s_fail_after = -1;
  s_fail_code = E_OUT_OF_STORAGE;
  s_timer.pending = false;
  s_timer.expired = false;
  s_timer.cb = NULL;
  s_timer.data = NULL;
  s_timer.timeout_ms = 0;
  s_timer_registrations = 0;
  s_timer_reschedules = 0;
  s_timer_cancels = 0;
  s_timer_orphans = 0;
  s_timer_register_fails = false;
  s_tap_handler = NULL;
  s_tap_subscribes = 0;
  s_tap_unsubscribes = 0;
  shim_log_reset();
}

void shim_log_reset(void) {
  s_log_last[0] = '\0';
  s_log_count = 0;
  s_log_ring_n = 0;
  s_log_warnings = 0;
  s_log_errors = 0;
  memset(s_log_ring, 0, sizeof(s_log_ring));
  memset(s_log_level, 0, sizeof(s_log_level));
}

int shim_log_warnings(void) { return s_log_warnings; }
int shim_log_errors(void)   { return s_log_errors; }

/* Righe (dal reset, al più le ultime SHIM_LOG_LINES) che contengono substr. */
static int prv_log_scan(const char *substr, const char **last) {
  int n = 0;
  if (last) {
    *last = NULL;
  }
  if (!substr) {
    return 0;
  }
  const int first = (s_log_ring_n > SHIM_LOG_LINES) ? s_log_ring_n - SHIM_LOG_LINES : 0;
  for (int i = first; i < s_log_ring_n; i++) {
    const char *line = s_log_ring[i % SHIM_LOG_LINES];
    if (strstr(line, substr)) {
      n++;
      if (last) {
        *last = line;
      }
    }
  }
  return n;
}

int shim_log_find(const char *substr) {
  return prv_log_scan(substr, NULL);
}

const char *shim_log_find_last(const char *substr) {
  const char *last = NULL;
  (void)prv_log_scan(substr, &last);
  return last;
}

void shim_set_quota(size_t bytes)          { s_quota = bytes; }
void shim_set_24h(bool is24h)              { s_is_24h = is24h; }
uint32_t shim_last_write_key(void)         { return s_last_write_key; }
void shim_fail_writes_after(int n)         { s_fail_after = n; }
void shim_fail_writes_code(status_t code)  { s_fail_code = code; }
int  shim_write_count(void)                { return s_writes; }
void shim_reset_write_count(void)          { s_writes = 0; }
int  shim_delete_count(void)               { return s_deletes; }
bool shim_key_exists(uint32_t key)         { return prv_find(key) != NULL; }

int shim_key_len(uint32_t key) {
  const ShimEntry *e = prv_find(key);
  return e ? (int)e->len : -1;
}

const uint8_t *shim_key_bytes(uint32_t key) {
  const ShimEntry *e = prv_find(key);
  return e ? e->data : NULL;
}

int shim_key_count(void) {
  int n = 0;
  for (size_t i = 0; i < SHIM_MAX_KEYS; i++) {
    if (s_entries[i].used) {
      n++;
    }
  }
  return n;
}

bool     shim_timer_pending(void)       { return s_timer.pending; }
bool     shim_timer_expired(void)       { return s_timer.pending && s_timer.expired; }
uint32_t shim_timer_timeout(void)       { return s_timer.timeout_ms; }
int      shim_timer_registrations(void) { return s_timer_registrations; }
int      shim_timer_reschedules(void)   { return s_timer_reschedules; }
int      shim_timer_cancels(void)       { return s_timer_cancels; }
int      shim_timer_orphans(void)       { return s_timer_orphans; }
void     shim_fail_timer_register(bool fail) { s_timer_register_fails = fail; }
void     shim_set_log(bool enabled)     { s_log = enabled; }
const char *shim_log_last(void)         { return s_log_last; }
int      shim_log_count(void)           { return s_log_count; }
int      shim_accel_tap_subscribes(void)   { return s_tap_subscribes; }
int      shim_accel_tap_unsubscribes(void) { return s_tap_unsubscribes; }
AccelTapHandler shim_accel_tap_handler(void) { return s_tap_handler; }

void *shim_timer_data(void) {
  return s_timer.pending ? s_timer.data : NULL;
}

/* F2: callback STANTIO rimasto in coda da un timer superato: si esegue con il contesto vecchio e
 * il timer corrente NON viene consumato (sul firmware sono due eventi distinti). */
bool shim_timer_fire_ctx(void *data) {
  if (!s_timer.cb) {
    return false;
  }
  s_timer.cb(data);
  return true;
}

bool shim_timer_expire(void) {
  if (!s_timer.pending) {
    return false;
  }
  s_timer.expired = true;                    /* scaduto: callback accodato, non ancora eseguito */
  return true;
}

bool shim_timer_fire(void) {
  if (!s_timer.pending) {
    return false;                            /* cancellato o già consumato: callback scartato */
  }
  s_timer.pending = false;                   /* il firmware "consuma" il timer prima del callback */
  s_timer.expired = false;
  AppTimerCallback cb = s_timer.cb;
  void *data = s_timer.data;
  if (cb) {
    cb(data);
  }
  return true;
}

/* ======================= S7: AppMessage / dict finti (test_sync) =======================
 * Riproduce la superficie SDK usata da sync.c con la semantica di PebbleOS:
 *  - outbox = buffer di ESATTAMENTE outbox_size byte; una dict_write_* che non entra ritorna
 *    DICT_NOT_ENOUGH_STORAGE e non scrive nulla (le altre tuple restano);
 *  - app_message_open una sola volta (la seconda → APP_MSG_INVALID_STATE), nessuna close;
 *  - outbox_begin: APP_MSG_INVALID_STATE se non aperta o già in scrittura (OUT_WRITING),
 *    APP_MSG_BUSY se un messaggio è in volo; outbox_send lascia il messaggio "in volo" finché il
 *    test chiama shim_am_outbox_sent()/shim_am_outbox_failed(reason) (che invocano i callback);
 *  - shim_am_deliver() costruisce un DictionaryIterator sul buffer e chiama inbox_received
 *    (messaggio più grande dell'inbox → inbox_dropped con APP_MSG_BUFFER_OVERFLOW).
 * NON modella: cifratura/framing del trasporto, il vero costo di heap di app_message_open, gli
 * ACK/NACK del telefono, la coda di eventi del firmware (i callback sono sincroni). */

struct Dictionary {                          /* opaca nell'SDK: qui solo l'intestazione di 1 B */
  uint8_t count;
} __attribute__((packed));

#define SHIM_TUPLE_HDR 7u                    /* key 4 + type 1 + length 2 */

static uint32_t s_heap_used = 60000u, s_heap_free = 50000u;

uint32_t heap_bytes_used(void) { return s_heap_used; }
uint32_t heap_bytes_free(void) { return s_heap_free; }
void     shim_set_heap(uint32_t used, uint32_t free_bytes) { s_heap_used = used; s_heap_free = free_bytes; }

/* ---- dict ---- */

uint32_t dict_calc_buffer_size(const uint8_t tuple_count, ...) {
  uint32_t total = 1u + (uint32_t)tuple_count * SHIM_TUPLE_HDR;
  va_list ap;
  va_start(ap, tuple_count);
  for (uint8_t i = 0; i < tuple_count; i++) {
    total += (uint32_t)va_arg(ap, size_t);   /* i chiamanti castano a (size_t), come vuole l'SDK */
  }
  va_end(ap);
  return total;
}

static uint8_t *prv_dict_base(const DictionaryIterator *iter) {
  return (uint8_t *)iter->dictionary;
}

uint32_t dict_size(DictionaryIterator *iter) {
  if (!iter || !iter->dictionary || !iter->cursor) {
    return 0;
  }
  return (uint32_t)((const uint8_t *)iter->cursor - prv_dict_base(iter));
}

DictionaryIterator *shim_dict_out_iter(void);   /* fwd (definita più sotto) */

DictionaryResult dict_write_begin(DictionaryIterator *iter, uint8_t * const buffer, const uint16_t size) {
  if (!iter || !buffer || size < 1) {
    return DICT_INVALID_ARGS;
  }
  memset(buffer, 0, size);
  iter->dictionary = (Dictionary *)buffer;
  iter->end = buffer + size;
  iter->dictionary->count = 0;
  iter->cursor = (Tuple *)(buffer + 1);
  return DICT_OK;
}

/* Scrittura di una tupla: se non entra nel buffer, NULLA viene scritto (PebbleOS dict.c). */
static DictionaryResult prv_write_tuple(DictionaryIterator *iter, uint32_t key, uint8_t type,
                                        const void *data, uint16_t len) {
  if (!iter || !iter->dictionary || !iter->cursor || !iter->end) {
    return DICT_INVALID_ARGS;
  }
  uint8_t *cur = (uint8_t *)iter->cursor;
  const uint8_t *end = (const uint8_t *)iter->end;
  if (cur > end || (size_t)(end - cur) < (size_t)SHIM_TUPLE_HDR + len) {
    return DICT_NOT_ENOUGH_STORAGE;
  }
  memcpy(cur, &key, sizeof(key));
  cur[4] = type;
  memcpy(cur + 5, &len, sizeof(len));
  if (len > 0 && data) {
    memcpy(cur + SHIM_TUPLE_HDR, data, len);
  }
  iter->cursor = (Tuple *)(cur + SHIM_TUPLE_HDR + len);
  iter->dictionary->count++;
  return DICT_OK;
}

DictionaryResult dict_write_data(DictionaryIterator *iter, const uint32_t key,
                                 const uint8_t * const data, const uint16_t size) {
  if (!data && size > 0) {
    return DICT_INVALID_ARGS;
  }
  return prv_write_tuple(iter, key, TUPLE_BYTE_ARRAY, data, size);
}

DictionaryResult dict_write_cstring(DictionaryIterator *iter, const uint32_t key, const char * const cstring) {
  if (!cstring) {
    return DICT_INVALID_ARGS;
  }
  return prv_write_tuple(iter, key, TUPLE_CSTRING, cstring, (uint16_t)(strlen(cstring) + 1));
}

DictionaryResult dict_write_int(DictionaryIterator *iter, const uint32_t key, const void *integer,
                                const uint8_t width_bytes, const bool is_signed) {
  if (!integer || (width_bytes != 1 && width_bytes != 2 && width_bytes != 4)) {
    return DICT_INVALID_ARGS;
  }
  return prv_write_tuple(iter, key, is_signed ? TUPLE_INT : TUPLE_UINT, integer, width_bytes);
}

DictionaryResult dict_write_uint8(DictionaryIterator *iter, const uint32_t key, const uint8_t value) {
  return prv_write_tuple(iter, key, TUPLE_UINT, &value, 1);
}
DictionaryResult dict_write_uint16(DictionaryIterator *iter, const uint32_t key, const uint16_t value) {
  return prv_write_tuple(iter, key, TUPLE_UINT, &value, 2);
}
DictionaryResult dict_write_uint32(DictionaryIterator *iter, const uint32_t key, const uint32_t value) {
  return prv_write_tuple(iter, key, TUPLE_UINT, &value, 4);
}
DictionaryResult dict_write_int8(DictionaryIterator *iter, const uint32_t key, const int8_t value) {
  return prv_write_tuple(iter, key, TUPLE_INT, &value, 1);
}
DictionaryResult dict_write_int16(DictionaryIterator *iter, const uint32_t key, const int16_t value) {
  return prv_write_tuple(iter, key, TUPLE_INT, &value, 2);
}
DictionaryResult dict_write_int32(DictionaryIterator *iter, const uint32_t key, const int32_t value) {
  return prv_write_tuple(iter, key, TUPLE_INT, &value, 4);
}

uint32_t dict_write_end(DictionaryIterator *iter) {
  if (!iter || !iter->dictionary || !iter->cursor) {
    return 0;
  }
  const uint32_t n = dict_size(iter);
  iter->end = iter->cursor;                  /* il dizionario finisce dove è arrivato il cursore */
  return n;
}

/* Lunghezza totale (intestazione + valore) della tupla, 0 se sfora il buffer. */
static uint16_t prv_tuple_bytes(const Tuple *t, const uint8_t *end) {
  const uint8_t *p = (const uint8_t *)t;
  if (p + SHIM_TUPLE_HDR > end) {
    return 0;
  }
  uint16_t len;
  memcpy(&len, p + 5, sizeof(len));
  if ((size_t)(end - p) < (size_t)SHIM_TUPLE_HDR + len) {
    return 0;
  }
  return (uint16_t)(SHIM_TUPLE_HDR + len);
}

Tuple *dict_read_begin_from_buffer(DictionaryIterator *iter, const uint8_t * const buffer, const uint16_t size) {
  if (!iter || !buffer || size < 1) {
    return NULL;
  }
  iter->dictionary = (Dictionary *)(uintptr_t)buffer;
  iter->end = buffer + size;
  iter->cursor = (Tuple *)(uintptr_t)(buffer + 1);
  return dict_read_next(iter);
}

/* Semantica dello shim (l'SDK non la documenta byte per byte): iter->cursor è SEMPRE la prossima
 * tupla da restituire; read_first riparte dall'inizio. */
Tuple *dict_read_first(DictionaryIterator *iter) {
  if (!iter || !iter->dictionary) {
    return NULL;
  }
  iter->cursor = (Tuple *)(prv_dict_base(iter) + 1);
  return dict_read_next(iter);
}

Tuple *dict_read_next(DictionaryIterator *iter) {
  if (!iter || !iter->dictionary || !iter->cursor || !iter->end) {
    return NULL;
  }
  Tuple *t = iter->cursor;
  const uint16_t n = prv_tuple_bytes(t, (const uint8_t *)iter->end);
  if (n == 0) {
    return NULL;
  }
  iter->cursor = (Tuple *)((uint8_t *)t + n);
  return t;
}

Tuple *dict_find(const DictionaryIterator *iter, const uint32_t key) {
  if (!iter || !iter->dictionary || !iter->end) {
    return NULL;
  }
  const uint8_t *end = (const uint8_t *)iter->end;
  uint8_t *p = prv_dict_base((DictionaryIterator *)(uintptr_t)iter) + 1;
  const uint8_t count = iter->dictionary->count;
  for (uint8_t i = 0; i < count; i++) {
    Tuple *t = (Tuple *)p;
    const uint16_t n = prv_tuple_bytes(t, end);
    if (n == 0) {
      return NULL;
    }
    uint32_t k;
    memcpy(&k, p, sizeof(k));
    if (k == key) {
      return t;
    }
    p += n;
  }
  return NULL;
}

/* ---- AppMessage ---- */

static bool     s_am_opened, s_am_writing, s_am_inflight;
static uint32_t s_am_inbox_size, s_am_outbox_size;
static uint32_t s_am_inbox_max = 8200u;      /* app Core / emulatore */
static int      s_am_opens;
static AppMessageResult s_am_open_forced = APP_MSG_OK, s_am_last_open = APP_MSG_OK;
static AppMessageResult s_am_begin_forced = APP_MSG_OK, s_am_send_forced = APP_MSG_OK;
static int      s_am_begin_calls, s_am_send_calls, s_am_deliver_calls, s_am_dropped_calls;
static void    *s_am_ctx;

static AppMessageInboxReceived s_cb_in;
static AppMessageInboxDropped  s_cb_drop;
static AppMessageOutboxSent    s_cb_sent;
static AppMessageOutboxFailed  s_cb_failed;

static uint8_t  s_am_outbuf[SHIM_AM_OUTBOX_CAP];
static uint8_t  s_am_inbuf[SHIM_AM_INBOX_CAP];
static DictionaryIterator s_am_outit, s_am_init;

static ShimSentMsg s_am_sent[SHIM_AM_SENT_MAX];
static int         s_am_sent_n;              /* messaggi partiti (anche oltre il tetto) */
static int         s_am_sent_over;           /* messaggi partiti e NON registrati (tetto superato) */

DictionaryIterator *shim_dict_out_iter(void) { return &s_am_outit; }

static uint32_t prv_tuple_uint(const Tuple *t) {
  switch (t->length) {
    case 1:  return t->value->uint8;
    case 2:  return t->value->uint16;
    case 4:  return t->value->uint32;
    default: return 0;
  }
}

/* Decodifica il messaggio appena scritto nell'outbox (chiavi note del protocollo). Oltre il tetto
 * il messaggio non viene registrato: si conta soltanto (s_am_sent_over), cosi' il test se ne
 * accorge invece di leggere il messaggio sbagliato. */
static void prv_record_sent(void) {
  const uint16_t len = (uint16_t)dict_size(&s_am_outit);
  if (s_am_sent_n >= SHIM_AM_SENT_MAX) {
    s_am_sent_over++;
  } else {
    ShimSentMsg *m = &s_am_sent[s_am_sent_n];
    memset(m, 0, sizeof(*m));
    m->bytes = len;
    m->tuples = s_am_outbuf[0];
    DictionaryIterator it;
    dict_read_begin_from_buffer(&it, s_am_outbuf, len);
    for (Tuple *t = dict_read_first(&it); t; t = dict_read_next(&it)) {
      switch (t->key) {
        case MESSAGE_KEY_MSG:       m->msg = (uint8_t)prv_tuple_uint(t);        m->fields |= SHIM_S_MSG; break;
        case MESSAGE_KEY_PROTO:     m->proto = (uint8_t)prv_tuple_uint(t);      m->fields |= SHIM_S_PROTO; break;
        case MESSAGE_KEY_FORMAT:    m->format = (uint8_t)prv_tuple_uint(t);     m->fields |= SHIM_S_FORMAT; break;
        case MESSAGE_KEY_MAX_CHUNK: m->max_chunk = (uint16_t)prv_tuple_uint(t); m->fields |= SHIM_S_MAX_CHUNK; break;
        case MESSAGE_KEY_CRC:       m->crc = (uint16_t)prv_tuple_uint(t);       m->fields |= SHIM_S_CRC; break;
        case MESSAGE_KEY_CODE:      m->code = (uint8_t)prv_tuple_uint(t);       m->fields |= SHIM_S_CODE; break;
        case MESSAGE_KEY_SLOT:      m->slot = (uint8_t)prv_tuple_uint(t);       m->fields |= SHIM_S_SLOT; break;
        case MESSAGE_KEY_OFFSET:    m->offset = prv_tuple_uint(t);              m->fields |= SHIM_S_OFFSET; break;
        case MESSAGE_KEY_REPLY_TO:  m->reply_to = (uint8_t)prv_tuple_uint(t);   m->fields |= SHIM_S_REPLY_TO; break;
        case MESSAGE_KEY_SLOTS:
          m->slots_len = t->length;
          memcpy(m->slots, t->value->data, (t->length < SHIM_AM_SLOTS_CAP) ? t->length : SHIM_AM_SLOTS_CAP);
          m->fields |= SHIM_S_SLOTS;
          break;
        default: break;
      }
    }
  }
  s_am_sent_n++;
}

AppMessageResult app_message_open(const uint32_t size_inbound, const uint32_t size_outbound) {
  s_am_opens++;
  if (s_am_opened) {
    s_am_last_open = APP_MSG_INVALID_STATE;  /* nessuna close nell'SDK 4.33.1: una sola apertura */
    return s_am_last_open;
  }
  if (s_am_open_forced != APP_MSG_OK) {
    s_am_last_open = s_am_open_forced;
    return s_am_last_open;
  }
  if (size_outbound > SHIM_AM_OUTBOX_CAP || size_inbound > SHIM_AM_INBOX_CAP) {
    s_am_last_open = APP_MSG_OUT_OF_MEMORY;  /* limite dello shim, non dell'SDK */
    return s_am_last_open;
  }
  s_am_opened = true;
  s_am_inbox_size = size_inbound;
  s_am_outbox_size = size_outbound;
  s_am_last_open = APP_MSG_OK;
  return s_am_last_open;
}

void app_message_deregister_callbacks(void) {
  s_cb_in = NULL;
  s_cb_drop = NULL;
  s_cb_sent = NULL;
  s_cb_failed = NULL;
  s_am_ctx = NULL;
}

void *app_message_get_context(void) { return s_am_ctx; }

void *app_message_set_context(void *context) {
  void *old = s_am_ctx;
  s_am_ctx = context;
  return old;
}

AppMessageInboxReceived app_message_register_inbox_received(AppMessageInboxReceived cb) {
  AppMessageInboxReceived old = s_cb_in;
  s_cb_in = cb;
  return old;
}
AppMessageInboxDropped app_message_register_inbox_dropped(AppMessageInboxDropped cb) {
  AppMessageInboxDropped old = s_cb_drop;
  s_cb_drop = cb;
  return old;
}
AppMessageOutboxSent app_message_register_outbox_sent(AppMessageOutboxSent cb) {
  AppMessageOutboxSent old = s_cb_sent;
  s_cb_sent = cb;
  return old;
}
AppMessageOutboxFailed app_message_register_outbox_failed(AppMessageOutboxFailed cb) {
  AppMessageOutboxFailed old = s_cb_failed;
  s_cb_failed = cb;
  return old;
}

uint32_t app_message_inbox_size_maximum(void)  { return s_am_inbox_max; }
uint32_t app_message_outbox_size_maximum(void) { return s_am_inbox_max; }

AppMessageResult app_message_outbox_begin(DictionaryIterator **iterator) {
  s_am_begin_calls++;
  if (s_am_begin_forced != APP_MSG_OK) {
    return s_am_begin_forced;                /* iniezione: iteratore non toccato */
  }
  if (!iterator) {
    return APP_MSG_INVALID_ARGS;
  }
  if (!s_am_opened) {
    return APP_MSG_INVALID_STATE;
  }
  if (s_am_inflight) {
    return APP_MSG_BUSY;                     /* messaggio precedente non ancora concluso */
  }
  if (s_am_writing) {
    return APP_MSG_INVALID_STATE;            /* già in OUT_WRITING: se ne esce solo con send */
  }
  dict_write_begin(&s_am_outit, s_am_outbuf, (uint16_t)s_am_outbox_size);
  s_am_writing = true;
  *iterator = &s_am_outit;
  return APP_MSG_OK;
}

AppMessageResult app_message_outbox_send(void) {
  s_am_send_calls++;
  if (!s_am_opened || !s_am_writing) {
    return APP_MSG_INVALID_STATE;
  }
  if (s_am_send_forced != APP_MSG_OK) {
    s_am_writing = false;                    /* messaggio scartato: nessun callback in arrivo */
    return s_am_send_forced;
  }
  prv_record_sent();
  s_am_writing = false;
  s_am_inflight = true;                      /* esito da shim_am_outbox_sent/failed */
  return APP_MSG_OK;
}

/* ---- hook AppMessage ---- */

void shim_am_reset(void) {
  s_am_opened = false;
  s_am_writing = false;
  s_am_inflight = false;
  s_am_inbox_size = 0;
  s_am_outbox_size = 0;
  s_am_inbox_max = 8200u;
  s_am_opens = 0;
  s_am_open_forced = APP_MSG_OK;
  s_am_last_open = APP_MSG_OK;
  s_am_begin_forced = APP_MSG_OK;
  s_am_send_forced = APP_MSG_OK;
  s_am_begin_calls = 0;
  s_am_send_calls = 0;
  s_am_deliver_calls = 0;
  s_am_dropped_calls = 0;
  s_am_ctx = NULL;
  s_cb_in = NULL;
  s_cb_drop = NULL;
  s_cb_sent = NULL;
  s_cb_failed = NULL;
  s_am_sent_n = 0;
  s_am_sent_over = 0;
  memset(s_am_sent, 0, sizeof(s_am_sent));
  memset(&s_am_outit, 0, sizeof(s_am_outit));
  memset(&s_am_init, 0, sizeof(s_am_init));
  shim_in_begin();
}

int      shim_am_open_count(void)   { return s_am_opens; }
bool     shim_am_is_open(void)      { return s_am_opened; }
AppMessageResult shim_am_last_open_result(void) { return s_am_last_open; }
uint32_t shim_am_inbox_size(void)   { return s_am_inbox_size; }
uint32_t shim_am_outbox_size(void)  { return s_am_outbox_size; }
void     shim_am_set_inbox_max(uint32_t n) { s_am_inbox_max = n; }
void     shim_am_set_open_result(AppMessageResult r) { s_am_open_forced = r; }
int      shim_am_begin_calls(void)  { return s_am_begin_calls; }
int      shim_am_send_calls(void)   { return s_am_send_calls; }
int      shim_am_deliver_calls(void){ return s_am_deliver_calls; }
int      shim_am_dropped_calls(void){ return s_am_dropped_calls; }
void     shim_am_fail_outbox_begin(AppMessageResult r) { s_am_begin_forced = r; }
void     shim_am_fail_outbox_send(AppMessageResult r)  { s_am_send_forced = r; }
bool     shim_am_in_flight(void)    { return s_am_inflight; }
bool     shim_am_writing(void)      { return s_am_writing; }
int      shim_am_sent_count(void)   { return s_am_sent_n; }
int      shim_am_sent_overflow(void){ return s_am_sent_over; }

void shim_am_force_outbox_size(uint32_t n) {
  s_am_outbox_size = (n > SHIM_AM_OUTBOX_CAP) ? SHIM_AM_OUTBOX_CAP : n;
}

int shim_am_callbacks_registered(void) {
  return (s_cb_in ? 1 : 0) + (s_cb_drop ? 1 : 0) + (s_cb_sent ? 1 : 0) + (s_cb_failed ? 1 : 0);
}

const ShimSentMsg *shim_am_sent(int i) {
  if (i < 0 || i >= s_am_sent_n || i >= SHIM_AM_SENT_MAX) {
    return NULL;                             /* fuori intervallo o mai registrato: mai un altro */
  }
  return &s_am_sent[i];
}

const ShimSentMsg *shim_am_last_sent(void) {
  if (s_am_sent_n < 1 || s_am_sent_n > SHIM_AM_SENT_MAX) {
    return NULL;                             /* nessun messaggio, oppure l'ultimo e' in overflow */
  }
  return &s_am_sent[s_am_sent_n - 1];
}

bool shim_am_outbox_sent(void) {
  if (!s_am_inflight) {
    return false;
  }
  s_am_inflight = false;
  if (s_cb_sent) {
    s_cb_sent(&s_am_outit, s_am_ctx);
  }
  return true;
}

bool shim_am_outbox_failed(AppMessageResult reason) {
  if (!s_am_inflight) {
    return false;
  }
  s_am_inflight = false;
  if (s_cb_failed) {
    s_cb_failed(&s_am_outit, reason, s_am_ctx);
  }
  return true;
}

/* ---- costruzione del dizionario in ingresso ---- */

static uint8_t  s_in_buf[SHIM_AM_INBOX_CAP];
static uint16_t s_in_len;

void shim_in_begin(void) {
  memset(s_in_buf, 0, sizeof(s_in_buf));
  s_in_buf[0] = 0;
  s_in_len = 1;
}

bool shim_in_raw(uint32_t key, uint8_t type, uint16_t len, const uint8_t *p) {
  if ((size_t)s_in_len + SHIM_TUPLE_HDR + len > sizeof(s_in_buf) || s_in_buf[0] == 0xFF) {
    return false;
  }
  uint8_t *cur = s_in_buf + s_in_len;
  memcpy(cur, &key, sizeof(key));
  cur[4] = type;
  memcpy(cur + 5, &len, sizeof(len));
  if (len > 0 && p) {
    memcpy(cur + SHIM_TUPLE_HDR, p, len);
  }
  s_in_len = (uint16_t)(s_in_len + SHIM_TUPLE_HDR + len);
  s_in_buf[0]++;
  return true;
}

bool shim_in_int32(uint32_t key, int32_t v)  { return shim_in_raw(key, TUPLE_INT, 4, (const uint8_t *)&v); }
bool shim_in_uint8(uint32_t key, uint8_t v)  { return shim_in_raw(key, TUPLE_UINT, 1, &v); }
bool shim_in_uint16(uint32_t key, uint16_t v){ return shim_in_raw(key, TUPLE_UINT, 2, (const uint8_t *)&v); }
bool shim_in_uint32(uint32_t key, uint32_t v){ return shim_in_raw(key, TUPLE_UINT, 4, (const uint8_t *)&v); }
bool shim_in_bytes(uint32_t key, const uint8_t *p, uint16_t n) {
  return shim_in_raw(key, TUPLE_BYTE_ARRAY, n, p);
}
uint16_t shim_in_size(void) { return s_in_len; }

bool shim_am_deliver(const uint8_t *buf, uint16_t len) {
  s_am_deliver_calls++;
  if (!s_am_opened || !buf || len < 1) {
    return false;
  }
  if ((uint32_t)len > s_am_inbox_size) {
    s_am_dropped_calls++;                    /* il firmware NACKa: il telefono ritenta */
    if (s_cb_drop) {
      s_cb_drop(APP_MSG_BUFFER_OVERFLOW, s_am_ctx);
    }
    return false;
  }
  memcpy(s_am_inbuf, buf, len);
  dict_read_begin_from_buffer(&s_am_init, s_am_inbuf, len);
  if (!s_cb_in) {
    return false;
  }
  s_cb_in(&s_am_init, s_am_ctx);
  return true;
}

bool shim_am_deliver_built(void) {
  return shim_am_deliver(s_in_buf, s_in_len);
}

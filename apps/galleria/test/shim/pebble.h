/* test/shim/pebble.h — SHIM host di <pebble.h> per i test di storage.c, settings.c e model.c (gcc,
 * nessun ARM/emulatore). Riproduce SOLO la superficie SDK usata da quei moduli, con le firme ESATTE
 * dell'SDK 4.33.1 (~/.local/share/pebble-sdk/SDKs/4.33.1/sdk-core/pebble/emery/include/pebble.h):
 *   persist_exists/get_size/read_data/write_data/read_int/write_int/delete/get_max_size,
 *   status_t + StatusCode, APP_LOG/app_log, AppTimer + register/reschedule/cancel, PBL_API_EXISTS,
 *   clock_is_24h_style (settings.c, S5a); per model.c (revisione 29/08, F1): time/localtime (<time.h>),
 *   AccelAxisType/AccelTapHandler + accel_tap_service_subscribe/unsubscribe, PBL_IF_COLOR_ELSE,
 *   RESOURCE_ID_DEMO_x, ResHandle, resource_get_handle/size/load_byte_range e time_ms (solo
 *   GALLERIA_DEBUG_SEED), i tipi GPoint/GSize/GRect/GContext/Window/BatteryChargeState dichiarati
 *   da ui_photo.h/ui_time.h (le loro funzioni sono finte in ui_fake.c, hook in ui_fake.h).
 * Timer (F2): il timer unico ha anche lo stato "scaduto ma non consumato" del firmware (evented_timer:
 * expired=true, callback in coda dietro l'evento in corso): shim_timer_expire() lo mette in quello
 * stato, app_timer_reschedule allora ritorna false, app_timer_cancel scarta il callback,
 * shim_timer_fire lo esegue solo se ancora pendente. shim_timer_orphans() conta le register fatte
 * mentre un timer era ancora pendente (= il bug F2: register senza cancel → due timer vivi).
 * storage.c, settings.c e model.c NON vengono modificati: il Makefile li compila con -Ishim davanti
 * a -I../src/c. Implementazione (persist in RAM + hook di test shim_*) in pebble_shim.c. */
#ifndef GALLERIA_TEST_SHIM_PEBBLE_H
#define GALLERIA_TEST_SHIM_PEBBLE_H

#include <stdarg.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <time.h>            /* time(), localtime(), struct tm: pebble.h li dichiara (~9074/9093) */

/* ---- Compatibility (pebble_sdk_version.h) ---- */
#define PBL_API_EXISTS(x) defined(_PBL_API_EXISTS_##x)
#define _PBL_API_EXISTS_persist_get_max_size

/* ---- Logging (pebble.h ~1656-1678) ---- */
typedef enum {
  APP_LOG_LEVEL_ERROR = 1,
  APP_LOG_LEVEL_WARNING = 50,
  APP_LOG_LEVEL_INFO = 100,
  APP_LOG_LEVEL_DEBUG = 200,
  APP_LOG_LEVEL_DEBUG_VERBOSE = 255,
} AppLogLevel;

void app_log(uint8_t log_level, const char *src_filename, int src_line_number, const char *fmt, ...)
    __attribute__((format(printf, 4, 5)));

#define APP_LOG(level, fmt, ...) app_log(level, __FILE__, __LINE__, fmt, ##__VA_ARGS__)

/* ---- Timer (pebble.h ~3027-3051) ---- */
struct AppTimer;
typedef struct AppTimer AppTimer;
typedef void (*AppTimerCallback)(void *data);

AppTimer *app_timer_register(uint32_t timeout_ms, AppTimerCallback callback, void *callback_data);
bool app_timer_reschedule(AppTimer *timer_handle, uint32_t new_timeout_ms);
void app_timer_cancel(AppTimer *timer_handle);

/* ---- Ora di sistema (pebble.h ~370-373, ~9100) ---- */
bool clock_is_24h_style(void);
void time_ms(time_t *utc_time, uint16_t *out_ms);

/* ---- Piattaforma (pebble.h ~3560-3616): l'host finge emery (colore) ---- */
#define PBL_IF_COLOR_ELSE(if_true, if_false) (if_true)
#define PBL_IF_BW_ELSE(if_true, if_false) (if_false)

typedef struct GPoint {
  int16_t x;
  int16_t y;
} GPoint;
#define GPoint(x, y) ((GPoint){(x), (y)})

typedef struct GSize {
  int16_t w;
  int16_t h;
} GSize;
#define GSize(w, h) ((GSize){(w), (h)})

typedef struct GRect {
  GPoint origin;
  GSize size;
} GRect;

typedef struct GContext GContext;          /* opachi: solo puntatori nelle firme di ui_*.h */
typedef struct Window Window;

typedef struct {
  uint8_t charge_percent;
  bool is_charging;
  bool is_plugged;
} BatteryChargeState;

/* ---- Risorse (pebble.h ~2818-2868): generate dall'SDK in resource_ids.auto.h; qui valori
 * arbitrari ma DISTINTI (il test verifica solo quale risorsa viene chiesta) ---- */
#define RESOURCE_ID_DEMO_1_RAW6 0x1001u
#define RESOURCE_ID_DEMO_1_RAW1 0x1002u
#define RESOURCE_ID_DEMO_2_RAW6 0x1003u
#define RESOURCE_ID_DEMO_2_RAW1 0x1004u
typedef void *ResHandle;
ResHandle resource_get_handle(uint32_t resource_id);
size_t    resource_size(ResHandle h);
size_t    resource_load_byte_range(ResHandle h, uint32_t start_offset, uint8_t *buffer, size_t num_bytes);

/* ---- Accelerometro, tap (pebble.h ~712-785) ---- */
typedef enum {
  ACCEL_AXIS_X = 0,
  ACCEL_AXIS_Y = 1,
  ACCEL_AXIS_Z = 2,
} AccelAxisType;
typedef void (*AccelTapHandler)(AccelAxisType axis, int32_t direction);
void accel_tap_service_subscribe(AccelTapHandler handler);
void accel_tap_service_unsubscribe(void);

/* ---- Storage (pebble.h ~3104-3250) ---- */
#define PERSIST_DATA_MAX_LENGTH 256
#define PERSIST_STRING_MAX_LENGTH PERSIST_DATA_MAX_LENGTH

typedef enum StatusCode {
  S_SUCCESS = 0,
  E_ERROR = -1,
  E_UNKNOWN = -2,
  E_INTERNAL = -3,
  E_INVALID_ARGUMENT = -4,
  E_OUT_OF_MEMORY = -5,
  E_OUT_OF_STORAGE = -6,
  E_OUT_OF_RESOURCES = -7,
  E_RANGE = -8,
  E_DOES_NOT_EXIST = -9,
  E_INVALID_OPERATION = -10,
  E_BUSY = -11,
  E_AGAIN = -12,
  S_TRUE = 1,
  S_FALSE = 0,
  S_NO_MORE_ITEMS = 2,
  S_NO_ACTION_REQUIRED = 3,
} StatusCode;

typedef int32_t status_t;

bool     persist_exists(const uint32_t key);
size_t   persist_get_max_size(void);
int      persist_get_size(const uint32_t key);
int32_t  persist_read_int(const uint32_t key);
int      persist_read_data(const uint32_t key, void *buffer, const size_t buffer_size);
status_t persist_write_int(const uint32_t key, const int32_t value);
int      persist_write_data(const uint32_t key, const void *data, const size_t size);
status_t persist_delete(const uint32_t key);

/* ---- Heap (pebble.h ~3062) ----
 * DEVIAZIONE documentata: l'SDK le dichiara `size_t`, che su ARM EABI e' 4 B = unsigned int.
 * Sull'host size_t e' 8 B, quindi l'espressione `free0 - heap_bytes_free()` di sync_init()
 * (free0 e' un `unsigned`) diventerebbe un `unsigned long` e romperebbe la %u con -Werror=format.
 * uint32_t riproduce esattamente il tipo che sync.c vede sull'orologio. */
uint32_t heap_bytes_free(void);
uint32_t heap_bytes_used(void);

/* ---- Dictionary (pebble.h ~1775-2120): layout BYTE-ESATTO dell'SDK ---- */
typedef enum {
  DICT_OK = 0,
  DICT_NOT_ENOUGH_STORAGE = 1 << 1,          /* 2 */
  DICT_INVALID_ARGS = 1 << 2,                /* 4 */
  DICT_INTERNAL_INCONSISTENCY = 1 << 3,      /* 8 */
  DICT_MALLOC_FAILED = 1 << 4,               /* 16 */
} DictionaryResult;

typedef enum {
  TUPLE_BYTE_ARRAY = 0,
  TUPLE_CSTRING = 1,
  TUPLE_UINT = 2,                            /* length 1/2/4 → uint8/uint16/uint32 */
  TUPLE_INT = 3,
} TupleType;

typedef struct __attribute__((__packed__)) {
  uint32_t key;
  TupleType type:8;
  uint16_t length;                           /* byte di .value */
  union {
    uint8_t data[0];
    char cstring[0];
    uint8_t uint8;
    uint16_t uint16;
    uint32_t uint32;
    int8_t int8;
    int16_t int16;
    int32_t int32;
  } value[];
} Tuple;                                     /* 7 B di intestazione + length */

struct Dictionary;
typedef struct Dictionary Dictionary;        /* opaca come nell'SDK (definita in pebble_shim.c) */

typedef struct {
  Dictionary *dictionary;
  const void *end;
  Tuple *cursor;
} DictionaryIterator;

/* 1 + 7·n + Σ size_i (doc SDK). Gli argomenti variadici sono letti come size_t: sync.c li passa
 * già castati a (size_t), come vuole l'SDK su ARM (size_t = 4 B). */
uint32_t dict_calc_buffer_size(const uint8_t tuple_count, ...);
uint32_t dict_size(DictionaryIterator *iter);
DictionaryResult dict_write_begin(DictionaryIterator *iter, uint8_t * const buffer, const uint16_t size);
DictionaryResult dict_write_data(DictionaryIterator *iter, const uint32_t key, const uint8_t * const data,
                                 const uint16_t size);
DictionaryResult dict_write_cstring(DictionaryIterator *iter, const uint32_t key, const char * const cstring);
DictionaryResult dict_write_int(DictionaryIterator *iter, const uint32_t key, const void *integer,
                                const uint8_t width_bytes, const bool is_signed);
DictionaryResult dict_write_uint8(DictionaryIterator *iter, const uint32_t key, const uint8_t value);
DictionaryResult dict_write_uint16(DictionaryIterator *iter, const uint32_t key, const uint16_t value);
DictionaryResult dict_write_uint32(DictionaryIterator *iter, const uint32_t key, const uint32_t value);
DictionaryResult dict_write_int8(DictionaryIterator *iter, const uint32_t key, const int8_t value);
DictionaryResult dict_write_int16(DictionaryIterator *iter, const uint32_t key, const int16_t value);
DictionaryResult dict_write_int32(DictionaryIterator *iter, const uint32_t key, const int32_t value);
uint32_t dict_write_end(DictionaryIterator *iter);
Tuple *dict_read_begin_from_buffer(DictionaryIterator *iter, const uint8_t * const buffer, const uint16_t size);
Tuple *dict_read_first(DictionaryIterator *iter);
Tuple *dict_read_next(DictionaryIterator *iter);
Tuple *dict_find(const DictionaryIterator *iter, const uint32_t key);

/* ---- AppMessage (pebble.h ~2307-2540) ---- */
typedef enum {
  APP_MSG_OK = 0,
  APP_MSG_SEND_TIMEOUT = 1 << 1,             /* 2 */
  APP_MSG_SEND_REJECTED = 1 << 2,            /* 4 */
  APP_MSG_NOT_CONNECTED = 1 << 3,            /* 8 */
  APP_MSG_APP_NOT_RUNNING = 1 << 4,          /* 16 */
  APP_MSG_INVALID_ARGS = 1 << 5,             /* 32 */
  APP_MSG_BUSY = 1 << 6,                     /* 64 */
  APP_MSG_BUFFER_OVERFLOW = 1 << 7,          /* 128 */
  APP_MSG_ALREADY_RELEASED = 1 << 9,         /* 512 */
  APP_MSG_CALLBACK_ALREADY_REGISTERED = 1 << 10,
  APP_MSG_CALLBACK_NOT_REGISTERED = 1 << 11,
  APP_MSG_OUT_OF_MEMORY = 1 << 12,
  APP_MSG_CLOSED = 1 << 13,
  APP_MSG_INTERNAL_ERROR = 1 << 14,
  APP_MSG_INVALID_STATE = 1 << 15,           /* 32768 */
} AppMessageResult;

typedef void (*AppMessageInboxReceived)(DictionaryIterator *iterator, void *context);
typedef void (*AppMessageInboxDropped)(AppMessageResult reason, void *context);
typedef void (*AppMessageOutboxSent)(DictionaryIterator *iterator, void *context);
typedef void (*AppMessageOutboxFailed)(DictionaryIterator *iterator, AppMessageResult reason, void *context);

AppMessageResult app_message_open(const uint32_t size_inbound, const uint32_t size_outbound);
void app_message_deregister_callbacks(void);
void *app_message_get_context(void);
void *app_message_set_context(void *context);
AppMessageInboxReceived app_message_register_inbox_received(AppMessageInboxReceived received_callback);
AppMessageInboxDropped app_message_register_inbox_dropped(AppMessageInboxDropped dropped_callback);
AppMessageOutboxSent app_message_register_outbox_sent(AppMessageOutboxSent sent_callback);
AppMessageOutboxFailed app_message_register_outbox_failed(AppMessageOutboxFailed failed_callback);
uint32_t app_message_inbox_size_maximum(void);
uint32_t app_message_outbox_size_maximum(void);
AppMessageResult app_message_outbox_begin(DictionaryIterator **iterator);
AppMessageResult app_message_outbox_send(void);

/* ---- MESSAGE_KEY_* (l'SDK li genera in message_keys.auto.h da package.json; qui 10000 + indice
 * nell'ordine di package.json: MSG, PROTO, MAX_CHUNK, SLOTS, COUNT, SLOT, PHOTO_ID, FORMAT,
 * LENGTH, CRC, OFFSET, DATA, CODE, ORDER, SETTINGS, REPLY_TO) ---- */
#define MESSAGE_KEY_MSG        10000u
#define MESSAGE_KEY_PROTO      10001u
#define MESSAGE_KEY_MAX_CHUNK  10002u
#define MESSAGE_KEY_SLOTS      10003u
#define MESSAGE_KEY_COUNT      10004u
#define MESSAGE_KEY_SLOT       10005u
#define MESSAGE_KEY_PHOTO_ID   10006u
#define MESSAGE_KEY_FORMAT     10007u
#define MESSAGE_KEY_LENGTH     10008u
#define MESSAGE_KEY_CRC        10009u
#define MESSAGE_KEY_OFFSET     10010u
#define MESSAGE_KEY_DATA       10011u
#define MESSAGE_KEY_CODE       10012u
#define MESSAGE_KEY_ORDER      10013u
#define MESSAGE_KEY_SETTINGS   10014u
#define MESSAGE_KEY_REPLY_TO   10015u
#define MESSAGE_KEY_OPEN_MS    10016u   /* v1.9 (perf 04/09): HELLO.OPEN_MS */

/* ================= hook di test (non fanno parte dell'SDK) ================= */

#define SHIM_MAX_KEYS 600            /* 2 foto raw6 (134 chiavi l'una) + metadati */

/* Svuota il persist, azzera contatori/iniezioni/timer, rimette la quota a 1 MiB e il 24 h a true. */
void   shim_persist_reset(void);
/* Valore ritornato da persist_get_max_size(). */
void   shim_set_quota(size_t bytes);
/* Dopo n scritture riuscite (write_data/write_int) le successive falliscono; n < 0 disabilita. */
void   shim_fail_writes_after(int n);
/* Codice iniettato dalle scritture che falliscono (default E_OUT_OF_STORAGE). */
void   shim_fail_writes_code(status_t code);
/* Scritture riuscite (write_data + write_int) dall'ultimo reset/azzeramento. */
int    shim_write_count(void);
void   shim_reset_write_count(void);
int    shim_delete_count(void);
/* Ispezione diretta del persist. */
bool   shim_key_exists(uint32_t key);
int    shim_key_len(uint32_t key);           /* -1 se assente */
const uint8_t *shim_key_bytes(uint32_t key); /* NULL se assente */
int    shim_key_count(void);
/* Timer: uno solo pendente (come serve a storage.c / sync.c). Stati: pendente (register), scaduto-
 * non-consumato (shim_timer_expire: pendente E expired, reschedule → false, cancel lecito), consumato
 * (shim_timer_fire: pendente/expired azzerati PRIMA del callback, che riceve il callback_data della
 * register) o cancellato (app_timer_cancel: pendente/expired azzerati, callback scartato). */
bool     shim_timer_pending(void);
bool     shim_timer_expired(void);           /* scaduto ma callback non ancora eseguito (F2) */
uint32_t shim_timer_timeout(void);
bool     shim_timer_expire(void);            /* false se nessun timer pendente */
bool     shim_timer_fire(void);              /* esegue il callback SOLO se ancora pendente; false altrimenti */
int      shim_timer_registrations(void);
int      shim_timer_reschedules(void);
int      shim_timer_cancels(void);
/* app_timer_register chiamate mentre un timer era ANCORA pendente (scaduto o no) senza cancel: sul
 * firmware sarebbero due timer vivi con due callback (bug F2); deve restare 0. */
int      shim_timer_orphans(void);
void     shim_fail_timer_register(bool fail);/* app_timer_register -> NULL (heap esaurito) */
/* Tap service (model.c): iscrizioni/disiscrizioni dal reset e handler corrente (NULL se nessuno):
 * il test lo invoca per simulare una scossa. */
int      shim_accel_tap_subscribes(void);
int      shim_accel_tap_unsubscribes(void);
AccelTapHandler shim_accel_tap_handler(void);
/* Valore ritornato da clock_is_24h_style() (default true; shim_persist_reset lo rimette a true). */
void   shim_set_24h(bool is24h);
/* Chiave dell'ultima scrittura RIUSCITA (write_data/write_int); SHIM_NO_KEY se nessuna dal reset.
 * Serve a verificare che il manifest sia scritto PER ULTIMO (storage.h, sync_proto PHOTO_END). */
#define SHIM_NO_KEY 0xFFFFFFFFu
uint32_t shim_last_write_key(void);
/* APP_LOG su stdout (default: silenzioso). */
void   shim_set_log(bool enabled);
/* Ultima riga APP_LOG formattata (solo il messaggio, senza prefisso; "" se nessuna dal reset) e
 * numero di righe dal reset: registrate anche a log spento. */
const char *shim_log_last(void);
int    shim_log_count(void);


/* ---- heap (sync.c logga heap_bytes_used/free): valori fissi impostabili ---- */
void shim_set_heap(uint32_t used, uint32_t free_bytes);

/* ---- log: buffer circolare (le ultime SHIM_LOG_LINES righe) oltre a shim_log_last ---- */
#define SHIM_LOG_LINES 128
/* Righe con livello WARNING (50) / ERROR (1) dal reset. */
int  shim_log_warnings(void);
int  shim_log_errors(void);
/* Righe che contengono substr (conteggio) e l'ULTIMA di esse (NULL se nessuna). */
int  shim_log_find(const char *substr);
const char *shim_log_find_last(const char *substr);
void shim_log_reset(void);

/* ---- timer: contesto del callback (F2) ---- */
void *shim_timer_data(void);                 /* callback_data del timer corrente (NULL se nessuno) */
/* Esegue il callback del timer corrente con un contesto ARBITRARIO senza consumare il timer:
 * simula un callback STANTIO rimasto in coda da un timer superato (F2). false se nessun callback. */
bool  shim_timer_fire_ctx(void *data);

/* ================= AppMessage: stato finto e hook ================= */

/* Dimensioni massime dello shim: outbox ≤ 2 KB (sync.c ne chiede 110), inbox ≤ 4.608 B
 * (4.096 di DATA + intestazioni). */
#define SHIM_AM_OUTBOX_CAP 2048u
#define SHIM_AM_INBOX_CAP  4608u
#define SHIM_AM_SENT_MAX   64                /* messaggi spediti REGISTRATI per scenario (S7: era 16,
                                              * cioe' esattamente quanti ne manda test_decode: il
                                              * primo messaggio in piu' sarebbe stato perso in
                                              * silenzio). Oltre il tetto si conta soltanto:
                                              * shim_am_sent_overflow() > 0 e shim_am_sent()/
                                              * shim_am_last_sent() ritornano NULL. */
#define SHIM_AM_SLOTS_CAP  96                /* byte di SLOTS/ORDER/SETTINGS copiati */

/* Campi trovati in un messaggio spedito (presenza della chiave). */
enum ShimSentField {
  SHIM_S_MSG       = 1u << 0,
  SHIM_S_PROTO     = 1u << 1,
  SHIM_S_MAX_CHUNK = 1u << 2,
  SHIM_S_SLOTS     = 1u << 3,
  SHIM_S_FORMAT    = 1u << 4,
  SHIM_S_CRC       = 1u << 5,
  SHIM_S_CODE      = 1u << 6,
  SHIM_S_SLOT      = 1u << 7,
  SHIM_S_OFFSET    = 1u << 8,
  SHIM_S_REPLY_TO  = 1u << 9,
};

/* Copia decodificata di un messaggio passato a app_message_outbox_send(). */
typedef struct {
  uint16_t bytes;                            /* dict_write_end: byte del dizionario */
  uint8_t  tuples;                           /* Dictionary.count */
  uint16_t fields;                           /* ShimSentField presenti */
  uint8_t  msg, proto, format, code, slot, reply_to;
  uint16_t max_chunk, crc;
  uint32_t offset;
  uint16_t slots_len;
  uint8_t  slots[SHIM_AM_SLOTS_CAP];
} ShimSentMsg;

/* Chiude l'AppMessage finto: nessuna apertura, nessun callback, code e contatori a zero (compreso
 * l'overflow dei messaggi registrati), inbox_size_maximum 8.200 (emulatore / app Core), nessuna
 * iniezione. */
void shim_am_reset(void);

int      shim_am_open_count(void);           /* chiamate ad app_message_open (anche fallite) */
bool     shim_am_is_open(void);
AppMessageResult shim_am_last_open_result(void);
uint32_t shim_am_inbox_size(void);           /* dimensione richiesta all'apertura */
uint32_t shim_am_outbox_size(void);          /* idem (F4: 110 B) */
void     shim_am_set_inbox_max(uint32_t n);  /* valore di app_message_inbox_size_maximum() */
void     shim_am_set_open_result(AppMessageResult r);  /* open forzata a fallire (≠ OK) */
/* F4: cambia la dimensione dell'outbox DOPO l'apertura (sync.c la calcola in sync_init: è l'unico
 * modo di provare il tripwire "dict_write -> … incompleto"). */
void     shim_am_force_outbox_size(uint32_t n);
int      shim_am_callbacks_registered(void); /* 0..4 */

int      shim_am_begin_calls(void);
int      shim_am_send_calls(void);
int      shim_am_deliver_calls(void);
int      shim_am_dropped_calls(void);        /* consegne rifiutate (len > inbox) */
/* Iniezioni: risultato forzato di outbox_begin / outbox_send (APP_MSG_OK = nessuna iniezione). */
void     shim_am_fail_outbox_begin(AppMessageResult r);
void     shim_am_fail_outbox_send(AppMessageResult r);

bool     shim_am_in_flight(void);            /* outbox_send riuscita, esito non ancora consegnato */
bool     shim_am_writing(void);              /* outbox_begin senza send (OUT_WRITING) */
/* Esito del messaggio in volo: invocano i callback registrati. false se nessun messaggio in volo. */
bool     shim_am_outbox_sent(void);
bool     shim_am_outbox_failed(AppMessageResult reason);

int      shim_am_sent_count(void);           /* messaggi effettivamente partiti dal reset */
/* Messaggi partiti ma NON registrati (oltre SHIM_AM_SENT_MAX): deve restare 0, altrimenti lo
 * scenario e' troppo lungo per lo shim e le asserzioni sui messaggi guardano dati parziali.
 * Azzerato da shim_am_reset. */
int      shim_am_sent_overflow(void);
/* i-esimo messaggio partito: NULL se i e' fuori intervallo OPPURE se quel messaggio non e' stato
 * registrato (i >= SHIM_AM_SENT_MAX) — mai un messaggio diverso da quello chiesto. */
const ShimSentMsg *shim_am_sent(int i);
/* Ultimo messaggio partito: NULL se non ne e' partito nessuno oppure se l'ultimo e' finito in
 * overflow (prima l'indice saturava e ritornava sempre il SHIM_AM_SENT_MAX-esimo, in silenzio). */
const ShimSentMsg *shim_am_last_sent(void);

/* ---- costruzione di un dizionario in ingresso (come lo manda il PKJS) ---- */
void     shim_in_begin(void);                /* azzera il buffer */
bool     shim_in_int32(uint32_t key, int32_t v);    /* il JS manda ogni Number come int32 (4 B) */
bool     shim_in_uint8(uint32_t key, uint8_t v);
bool     shim_in_uint16(uint32_t key, uint16_t v);
bool     shim_in_uint32(uint32_t key, uint32_t v);
bool     shim_in_bytes(uint32_t key, const uint8_t *p, uint16_t n);   /* TUPLE_BYTE_ARRAY */
/* Tupla ARBITRARIA (tipo/lunghezza qualsiasi): serve ai casi patologici (TUPLE_UINT di 8 B,
 * TUPLE_CSTRING al posto di un intero, ...). */
bool     shim_in_raw(uint32_t key, uint8_t type, uint16_t len, const uint8_t *p);
uint16_t shim_in_size(void);                 /* byte del dizionario costruito */

/* Consegna all'inbox_received registrato. false (e inbox_dropped con BUFFER_OVERFLOW) se il
 * messaggio è più grande dell'inbox aperta, o se AppMessage non è aperta. */
bool     shim_am_deliver(const uint8_t *buf, uint16_t len);
bool     shim_am_deliver_built(void);        /* consegna il dizionario di shim_in_* */

#endif /* GALLERIA_TEST_SHIM_PEBBLE_H */

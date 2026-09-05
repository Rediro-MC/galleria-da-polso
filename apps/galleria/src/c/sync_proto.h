/* sync_proto.h — protocollo di sync telefono ↔ orologio (docs/design/galleria.md §5), lato orologio.
 * Modulo PURO: nessun pebble.h (test host in test/test_sync_proto.c con lo shim persist). Contiene
 * la macchina a stati e la validazione dei messaggi; il trasporto AppMessage (dizionari, inbox,
 * coda outbox, timer di silenzio) sta in sync.c, che decodifica ogni messaggio in una SyncIn,
 * chiama sync_proto_handle() e spedisce la SyncOut se l'azione è SEND.
 *
 * Stati: IDLE → SYNC_REQUEST → SYNCING (foto: PHOTO_BEGIN / PHOTO_DATA×N / PHOTO_END) →
 * SYNC_DONE o 30 s di silenzio → IDLE. SETTINGS / ALBUM_ORDER / ALBUM_DELETE / JS_READY in
 * qualsiasi stato. S5a: l'inbox è UNA sola, aperta in init() (app_message_close() non è esportata
 * dall'SDK 4.33.1: la "inbox a due fasi" del design D9 non è realizzabile), quindi la macchina a
 * stati serve a rifiutare i messaggi di foto fuori sequenza (BUSY), all'avanzamento "Foto k/n" e al
 * timeout di silenzio; il chunk è negoziato una volta da sync.c (4.096 B con inbox da 8 KB).
 *
 * Effetti collaterali (persist) tramite storage.h; notifiche verso UI/modello tramite le
 * sync_env_* dichiarate in fondo, implementate da sync.c sull'orologio e dal test su host. */
#ifndef GALLERIA_SYNC_PROTO_H
#define GALLERIA_SYNC_PROTO_H

#include <stdbool.h>
#include <stdint.h>
#include "gal_types.h"
#include "settings.h"

#define SYNC_PROTO_VERSION   1

/* Valori della chiave MSG (design §5). */
enum SyncMsg {
  SYNC_MSG_NONE         = 0,
  SYNC_MSG_JS_READY     = 1,    /* telefono → orologio: PKJS pronto */
  SYNC_MSG_HELLO        = 2,    /* orologio → telefono: PROTO, FORMAT, MAX_CHUNK, CRC (impostazioni), OPEN_MS, SLOTS */
  SYNC_MSG_SYNC_REQUEST = 3,    /* → : COUNT foto da inviare (+ OFFSET opz. = foto già concluse: "Foto k/n"
                                   riprende da lì dopo un BUSY, F3; assente = PKJS vecchio → 0) */
  SYNC_MSG_SYNC_READY   = 4,    /* ← : MAX_CHUNK (stato SYNCING) */
  SYNC_MSG_PHOTO_BEGIN  = 5,    /* → : SLOT, PHOTO_ID, FORMAT, LENGTH, CRC, OFFSET */
  SYNC_MSG_PHOTO_DATA   = 6,    /* → : SLOT, OFFSET, DATA */
  SYNC_MSG_PHOTO_END    = 7,    /* → : SLOT (+ PHOTO_ID: rende idempotente una ritrasmissione dopo il commit) */
  SYNC_MSG_STATUS       = 8,    /* ← : CODE, SLOT, OFFSET, REPLY_TO (S5b: il MSG a cui risponde) */
  SYNC_MSG_SYNC_DONE    = 9,    /* → */
  SYNC_MSG_SETTINGS     = 10,   /* → : SETTINGS (20 B) */
  SYNC_MSG_ALBUM_ORDER  = 11,   /* → : ORDER (12 B) */
  SYNC_MSG_ALBUM_DELETE = 12,   /* → : SLOT */
};

/* Valori della chiave CODE nei messaggi STATUS. */
enum SyncCode {
  SYNC_CODE_OK            = 0,
  SYNC_CODE_CRC_ERR       = 1,  /* PHOTO_END: CRC32 diverso, manifest non toccato */
  SYNC_CODE_NO_SPACE      = 2,  /* quota persist (stima in PHOTO_BEGIN) o E_OUT_OF_STORAGE */
  SYNC_CODE_BAD_FORMAT    = 3,  /* formato/lunghezza/slot/argomento non valido */
  SYNC_CODE_BUSY          = 4,  /* messaggio di foto fuori dallo stato SYNCING */
  SYNC_CODE_SEQ_ERR       = 5,  /* offset inatteso: ripartire da PHOTO_BEGIN{OFFSET = out.offset} */
  SYNC_CODE_NOT_SUPPORTED = 6,  /* MSG ignoto, album disabilitato, chunk 0 (telefono senza 8k) */
  SYNC_CODE_STORAGE_ERR   = 7,  /* S5a: errore persist diverso da E_OUT_OF_STORAGE */
};

/* Stati (sync_proto_state()). */
enum SyncState { SYNC_ST_IDLE = 0, SYNC_ST_SYNCING = 1 };

/* Campi presenti in SyncIn.fields. */
enum SyncField {
  SYNC_F_COUNT    = 1u << 0,
  SYNC_F_SLOT     = 1u << 1,
  SYNC_F_PHOTO_ID = 1u << 2,
  SYNC_F_FORMAT   = 1u << 3,
  SYNC_F_LENGTH   = 1u << 4,
  SYNC_F_CRC      = 1u << 5,
  SYNC_F_OFFSET   = 1u << 6,
  SYNC_F_DATA     = 1u << 7,
  SYNC_F_ORDER    = 1u << 8,
  SYNC_F_SETTINGS = 1u << 9,
};

/* Messaggio ricevuto, già decodificato dal dizionario (gli interi arrivano dal JS come int32: il
 * chiamante li legge in base alla lunghezza della tupla). I puntatori valgono solo durante la
 * chiamata a sync_proto_handle (buffer dell'inbox). */
typedef struct {
  uint16_t       fields;      /* SyncField presenti */
  uint8_t        msg;         /* SyncMsg (0 = assente) */
  uint8_t        count;
  uint8_t        slot;
  uint8_t        format;
  uint32_t       photo_id;
  uint32_t       length;
  uint32_t       crc;
  uint32_t       offset;
  const uint8_t *data;
  uint16_t       data_len;
  const uint8_t *order;
  uint16_t       order_len;
  const uint8_t *settings;
  uint16_t       settings_len;
} SyncIn;

/* Messaggio da spedire (msg = 0: nessuno). HELLO: proto, format, max_chunk, settings_crc, open_ms
 * (v1.9), slots[slots_len]; SYNC_READY: max_chunk; STATUS: code, slot (GAL_SLOT_NONE se non
 * pertinente), offset, reply_to (il MSG ricevuto). */
typedef struct {
  uint8_t        msg;
  uint8_t        code;
  uint8_t        slot;
  uint8_t        proto;
  uint8_t        format;      /* HELLO: PHOTO_FMT_* nativo (S5a, revisione: il telefono non indovina) */
  uint8_t        reply_to;    /* STATUS (S5b, v1.7): SyncMsg del messaggio a cui risponde → il telefono
                                 scarta gli STATUS di copie ritrasmesse attribuendoli al passo giusto */
  uint16_t       max_chunk;
  uint16_t       open_ms;     /* HELLO (v1.9, perf 04/09): ms dell'apertura del file persist (storage_open_ms) */
  uint16_t       settings_crc;/* HELLO (S5b, v1.7): CRC-16/CCITT-FALSE dei primi 18 B di GalSettings
                                 correnti → il telefono manda SETTINGS solo se il suo CRC è diverso */
  uint32_t       offset;
  const uint8_t *slots;       /* buffer statico di sync_proto: valido fino al prossimo HELLO */
  uint16_t       slots_len;
} SyncOut;

/* Azione richiesta a sync.c. */
typedef enum {
  SYNC_ACT_NONE = 0,
  SYNC_ACT_SEND,              /* spedire out */
} SyncAction;

#define SYNC_SLOTS_BYTES     (GAL_MAX_SLOTS * 5)   /* HELLO.SLOTS: 12 × {state u8, crc32 u32 LE} */
/* Byte di valore del HELLO (MSG u8 + PROTO u8 + FORMAT u8 + MAX_CHUNK u16 + CRC u16 + OPEN_MS u16 +
 * SLOTS 60) = 69 (v1.9): l'outbox di sync.c è dict_calc_buffer_size(7, 1, 1, 1, 2, 2, 2, SYNC_SLOTS_BYTES)
 * = 1 + 7·7 + 69 = 119 B (F4). Guardie: il pin di test_sync_proto.c (69/119) e test_sync.c, che dal S7
 * compila sync.c su host e misura l'outbox reale; il WARNING (tripwire) di prv_pump_one al primo HELLO
 * in emulatore resta la rete di sicurezza. Un campo in più nel HELLO va aggiunto QUI, in sync_init e nei pin. */
#define SYNC_HELLO_VALUE_BYTES (1 + 1 + 1 + 2 + 2 + 2 + SYNC_SLOTS_BYTES)   /* v1.9: + OPEN_MS u16 */
#define SYNC_IDLE_TIMEOUT_MS 30000                 /* silenzio in SYNCING → IDLE (foto in corso abbandonata) */
#define SYNC_MAX_CHUNK_BYTES (16u * GAL_CHUNK_BYTES)  /* 4.096 B: 16 chunk persist per messaggio (D9 rivista in S5a) */
#define SYNC_QUOTA_PCT       75                    /* stima di occupazione ammessa in PHOTO_BEGIN */
#define SYNC_KEY_OVERHEAD    16                    /* stima dell'intestazione persist per chiave */

/* native_format: PHOTO_FMT_* della piattaforma; max_chunk: byte di DATA per messaggio (multiplo di
 * 256, 0 = sync non supportata: HELLO lo annuncia e SYNC_REQUEST riceve NOT_SUPPORTED). */
void sync_proto_init(uint8_t native_format, uint16_t max_chunk);
/* Rinegozia il chunk (sync.c lo ricalcola a ogni JS_READY: app_message_inbox_size_maximum()
 * dipende dal telefono connesso). Arrotondato per difetto al multiplo di 256. */
void sync_proto_set_max_chunk(uint16_t max_chunk);

/* Gestisce un messaggio ricevuto; out viene sempre azzerato e riempito se l'azione è SEND. */
SyncAction sync_proto_handle(const SyncIn *in, SyncOut *out);

/* SYNC_IDLE_TIMEOUT_MS senza messaggi in SYNCING: abbandona la foto in corso, torna IDLE,
 * avanzamento azzerato. true se lo stato è cambiato. */
bool sync_proto_timeout(void);

uint8_t  sync_proto_state(void);
uint16_t sync_proto_max_chunk(void);
/* Foto in corso: true se c'è un PHOTO_BEGIN accettato non ancora concluso; next = offset atteso. */
bool     sync_proto_pending(uint8_t *slot, uint32_t *next_offset);

/* ---- ambiente (implementate da sync.c sull'orologio, dal test su host) ---- */
/* Manifest cambiato (foto committata, ordine, eliminazione): il modello ricalcola lo slot. */
void sync_env_album_changed(void);
/* Impostazioni applicate (settings_apply riuscita): before = valori precedenti. */
void sync_env_settings_changed(const GalSettings *before);
/* Avanzamento: index = foto in corso (1..count), count da SYNC_REQUEST; (0, 0) = sync finita. */
void sync_env_progress(uint8_t index, uint8_t count);

#endif /* GALLERIA_SYNC_PROTO_H */

/* sync_proto.c — vedi sync_proto.h. Modulo PURO (nessun pebble.h): tutto lo stato è static a
 * file-scope (regola 5), nessuna allocazione, nessun timer (il timeout lo misura sync.c).
 * Ogni messaggio produce al più UNA risposta (un solo messaggio in volo per direzione, D9). */
#include <string.h>
#include "sync_proto.h"
#include "storage.h"
#include "photo_codec.h"
#include "crc.h"

typedef struct {
  bool     active;
  uint8_t  slot;
  uint8_t  format;
  uint32_t photo_id;
  uint32_t length;
  uint32_t crc_expected;
  uint32_t crc_running;
  uint32_t next;            /* prossimo offset atteso (multiplo di 256 finché < length) */
} SyncPending;

static uint8_t     s_native_format;
static uint16_t    s_max_chunk;
static uint8_t     s_state = SYNC_ST_IDLE;
static uint8_t     s_count, s_index;            /* avanzamento "k/n" della sync (S10: senza parola) */
static uint8_t     s_counted_slot = GAL_SLOT_NONE;  /* ultima foto conteggiata in s_index (revisione S5a: */
static uint32_t    s_counted_id;                    /* una ripartenza da 0 della stessa foto non avanza) */
static SyncPending s_pend;
static uint8_t     s_slots_buf[SYNC_SLOTS_BYTES];

/* ---- helper ---- */

static void prv_abort_pending(void) {
  s_pend.active = false;
}

static void prv_progress(uint8_t index, uint8_t count) {
  s_index = index;
  s_count = count;
  sync_env_progress(index, count);
}

static SyncAction prv_status(SyncOut *out, uint8_t code, uint8_t slot, uint32_t offset) {
  out->msg = SYNC_MSG_STATUS;
  out->code = code;
  out->slot = slot;
  out->offset = offset;
  return SYNC_ACT_SEND;
}

static uint8_t prv_code(StorageResult r) {
  switch (r) {
    case STORAGE_OK:       return SYNC_CODE_OK;
    case STORAGE_NO_SPACE: return SYNC_CODE_NO_SPACE;
    case STORAGE_DISABLED: return SYNC_CODE_NOT_SUPPORTED;
    default:               return SYNC_CODE_STORAGE_ERR;
  }
}

/* HELLO.SLOTS: 12 × {state u8, crc32 u32 little-endian} dal manifest in RAM. */
static void prv_build_slots(void) {
  const GalManifest *m = storage_manifest();
  for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {
    uint8_t *p = s_slots_buf + (uint16_t)k * 5;
    const GalSlotMeta *s = &m->slots[k];
    const bool valid = s->state == GAL_SLOT_VALID;
    p[0] = valid ? 1 : 0;
    const uint32_t crc = valid ? s->crc32 : 0;
    p[1] = (uint8_t)(crc & 0xFF);
    p[2] = (uint8_t)((crc >> 8) & 0xFF);
    p[3] = (uint8_t)((crc >> 16) & 0xFF);
    p[4] = (uint8_t)((crc >> 24) & 0xFF);
  }
}

static SyncAction prv_hello(SyncOut *out) {
  prv_build_slots();
  out->msg = SYNC_MSG_HELLO;
  out->proto = SYNC_PROTO_VERSION;
  out->format = s_native_format;                   /* il telefono non deve indovinare raw6/raw1 */
  out->max_chunk = storage_album_enabled() ? s_max_chunk : 0;
  /* S5b: CRC delle impostazioni correnti (tutto tranne il campo crc16): sync stateless anche per
   * SETTINGS (dopo un wipe il CRC torna quello dei default e il telefono rimanda le sue). */
  out->settings_crc = crc16_ccitt((const uint8_t *)settings_get(), (uint32_t)(sizeof(GalSettings) - 2));
  out->open_ms = storage_open_ms();               /* v1.9: la config page avvisa se il file persist è gonfio */
  out->slots = s_slots_buf;
  out->slots_len = SYNC_SLOTS_BYTES;
  return SYNC_ACT_SEND;
}

/* Stima di occupazione del file persist dopo questa foto ≤ SYNC_QUOTA_PCT % della quota
 * (revisione S4: la quota va controllata in PHOTO_BEGIN, prima di trasferire 34 KB). Con i formati
 * v1 (≤ 34.200 B → ≤ 436 KB per 12 slot) e la quota minima di 1 MiB per l'album (786 KB ammessi)
 * il ramo NO_SPACE non è raggiungibile (test host S5a): è la rete di sicurezza per formati futuri
 * fino a 64 KB/slot (12 × 65.536 = 786 KB) o per un GAL_MAX_SLOTS più alto. */
static bool prv_quota_ok(uint8_t slot, uint32_t length) {
  const GalManifest *m = storage_manifest();
  const uint32_t slots_after = (uint32_t)storage_valid_slots()
                             + ((m->slots[slot].state == GAL_SLOT_VALID) ? 0u : 1u);
  const uint32_t chunks = (length + GAL_CHUNK_BYTES - 1) / GAL_CHUNK_BYTES;
  const uint32_t per_slot = length + chunks * SYNC_KEY_OVERHEAD;
  const uint32_t est = slots_after * per_slot;               /* ≤ 12 × 36.344: nessun overflow */
  const uint32_t allowed = storage_quota() / 100u * SYNC_QUOTA_PCT;
  return est <= allowed;
}

/* order[]: indici < 12 senza duplicati, poi solo GAL_SLOT_NONE fino alla fine. */
static bool prv_order_valid(const uint8_t *order) {
  uint16_t seen = 0;
  bool ended = false;
  for (uint8_t i = 0; i < GAL_MAX_SLOTS; i++) {
    const uint8_t v = order[i];
    if (v == GAL_SLOT_NONE) {
      ended = true;
      continue;
    }
    if (ended || v >= GAL_MAX_SLOTS || (seen & (uint16_t)(1u << v))) {
      return false;
    }
    seen |= (uint16_t)(1u << v);
  }
  return true;
}

/* ---- messaggi ---- */

static SyncAction prv_sync_request(const SyncIn *in, SyncOut *out) {
  if (!storage_album_enabled() || s_max_chunk == 0) {
    return prv_status(out, SYNC_CODE_NOT_SUPPORTED, GAL_SLOT_NONE, 0);
  }
  /* Idempotente: un SYNC_REQUEST ripetuto (SYNC_READY perso, o rinnovato dal telefono dopo un BUSY)
   * abbandona il pending; l'indice "k/n" riparte da OFFSET = foto già concluse (F3: 0 se
   * assente, PKJS vecchio), clampato a count − 1 così il PHOTO_BEGIN successivo mostra al più n/n. */
  const uint8_t count = (in->fields & SYNC_F_COUNT) ? in->count : 0;
  uint8_t idx = (in->fields & SYNC_F_OFFSET) ? (uint8_t)(in->offset > 255u ? 255u : in->offset) : 0;
  if (idx >= count) {
    idx = count ? (uint8_t)(count - 1) : 0;
  }
  prv_abort_pending();
  s_counted_slot = GAL_SLOT_NONE;
  prv_progress(idx, count);
  s_state = SYNC_ST_SYNCING;
  out->msg = SYNC_MSG_SYNC_READY;
  out->max_chunk = s_max_chunk;
  return SYNC_ACT_SEND;
}

static SyncAction prv_photo_begin(const SyncIn *in, SyncOut *out) {
  const uint8_t slot = (in->fields & SYNC_F_SLOT) ? in->slot : GAL_SLOT_NONE;
  if (s_state != SYNC_ST_SYNCING) {
    return prv_status(out, SYNC_CODE_BUSY, slot, 0);
  }
  const uint16_t need = SYNC_F_SLOT | SYNC_F_PHOTO_ID | SYNC_F_FORMAT | SYNC_F_LENGTH | SYNC_F_CRC;
  if ((in->fields & need) != need || slot >= GAL_MAX_SLOTS) {
    return prv_status(out, SYNC_CODE_BAD_FORMAT, slot, 0);
  }
  if (in->format != s_native_format || in->length == 0 || in->length != photo_format_length(in->format)
      || in->photo_id == 0) {
    return prv_status(out, SYNC_CODE_BAD_FORMAT, slot, 0);
  }
  if (!prv_quota_ok(slot, in->length)) {
    return prv_status(out, SYNC_CODE_NO_SPACE, slot, 0);
  }
  /* Ripresa (o ritrasmissione di un BEGIN il cui STATUS si è perso: offset == next == 0) se
   * coincide con il pending: CRC parziale conservato e "k/n" fermo (test host S5a). */
  const uint32_t offset = (in->fields & SYNC_F_OFFSET) ? in->offset : 0;
  const bool resume = s_pend.active && s_pend.slot == slot && s_pend.photo_id == in->photo_id
                   && s_pend.crc_expected == in->crc && offset == s_pend.next;
  if (!resume) {
    /* Sostituzione di uno slot VALID: i chunk stanno per essere sovrascritti, quindi lo slot va
     * dichiarato vuoto PRIMA (manifest "valido ⇒ foto complete", D8): un'interruzione degrada a
     * "slot vuoto" (la rotazione lo salta, HELLO lo annuncia state 0 e il telefono lo rimanda)
     * invece di lasciare un manifest che certifica un payload misto (revisione S5a). */
    if (storage_manifest()->slots[slot].state == GAL_SLOT_VALID) {
      const StorageResult r = storage_clear_slot(slot);
      if (r != STORAGE_OK) {
        return prv_status(out, prv_code(r), slot, 0);
      }
      sync_env_album_changed();
    }
    s_pend = (SyncPending) {
      .active = true, .slot = slot, .format = in->format, .photo_id = in->photo_id,
      .length = in->length, .crc_expected = in->crc, .crc_running = 0, .next = 0,
    };
    /* "k/n" avanza solo per una foto diversa dall'ultima conteggiata: una ripartenza da 0
     * (CRC_ERR, SEQ_ERR con pending perso) non deve mostrare "2/1" (revisione S5a). */
    if (slot != s_counted_slot || in->photo_id != s_counted_id) {
      s_counted_slot = slot;
      s_counted_id = in->photo_id;
      /* R01 (S9): k esplicito dal telefono nella chiave COUNT (foto in corso, 1-based, comprese quelle
       * saltate senza un BEGIN accettato: load fallito, BAD_FORMAT/NO_SPACE), clampato a n; senza
       * COUNT (PKJS <= v1.9) o COUNT 0 resta il contatore locale k + 1. */
      uint8_t k = (uint8_t)(s_index < 255 ? s_index + 1 : 255);
      if ((in->fields & SYNC_F_COUNT) && in->count > 0) {
        k = (s_count && in->count > s_count) ? s_count : in->count;
      }
      prv_progress(k, s_count);
    }
  }
  /* OK.OFFSET = da dove il telefono deve (ri)partire: s_pend.next (0 se non è una ripresa). */
  return prv_status(out, SYNC_CODE_OK, slot, s_pend.next);
}

static SyncAction prv_photo_data(const SyncIn *in, SyncOut *out) {
  const uint8_t slot = (in->fields & SYNC_F_SLOT) ? in->slot : GAL_SLOT_NONE;
  if (s_state != SYNC_ST_SYNCING) {
    return prv_status(out, SYNC_CODE_BUSY, slot, 0);
  }
  if (!s_pend.active) {
    return prv_status(out, SYNC_CODE_SEQ_ERR, slot, 0);   /* nessun PHOTO_BEGIN: ripartire da 0 */
  }
  const uint16_t need = SYNC_F_SLOT | SYNC_F_OFFSET | SYNC_F_DATA;
  if ((in->fields & need) != need || slot != s_pend.slot || !in->data) {
    return prv_status(out, SYNC_CODE_SEQ_ERR, s_pend.slot, s_pend.next);
  }
  if (in->offset < s_pend.next) {
    return SYNC_ACT_NONE;                        /* duplicato (ACK perso dal telefono): già scritto */
  }
  const uint32_t n = in->data_len;
  if (in->offset > s_pend.next || (in->offset % GAL_CHUNK_BYTES) != 0 || n == 0
      || n > s_max_chunk || in->offset + n > s_pend.length
      || ((n % GAL_CHUNK_BYTES) != 0 && in->offset + n != s_pend.length)) {
    return prv_status(out, SYNC_CODE_SEQ_ERR, slot, s_pend.next);
  }
  /* Scrittura dei chunk direttamente dal buffer dell'inbox (nessuna copia): l'ACK parte al ritorno
   * del callback, quindi il flash è scritto prima che il telefono mandi il chunk successivo. */
  for (uint32_t off = 0; off < n; off += GAL_CHUNK_BYTES) {
    const uint32_t rem = n - off;
    const uint16_t m = (rem > GAL_CHUNK_BYTES) ? GAL_CHUNK_BYTES : (uint16_t)rem;
    const uint16_t i = (uint16_t)((in->offset + off) / GAL_CHUNK_BYTES);
    const StorageResult r = storage_write_chunk(slot, i, in->data + off, m);
    if (r != STORAGE_OK) {
      prv_abort_pending();                       /* il telefono riparte da PHOTO_BEGIN{OFFSET 0} */
      return prv_status(out, prv_code(r), slot, 0);
    }
  }
  s_pend.crc_running = crc32_update(s_pend.crc_running, in->data, n);
  s_pend.next += n;
  return SYNC_ACT_NONE;                          /* l'ACK di AppMessage basta */
}

static SyncAction prv_photo_end(const SyncIn *in, SyncOut *out) {
  const uint8_t slot = (in->fields & SYNC_F_SLOT) ? in->slot : GAL_SLOT_NONE;
  if (s_state != SYNC_ST_SYNCING) {
    return prv_status(out, SYNC_CODE_BUSY, slot, 0);
  }
  if (!s_pend.active) {
    /* PHOTO_END ritrasmesso dopo un commit riuscito (STATUS OK perso): se lo slot contiene già la
     * foto con lo stesso PHOTO_ID rispondiamo OK senza ricommittare, altrimenti il telefono
     * ritrasmetterebbe 34 KB (revisione S5a). Senza PHOTO_ID resta SEQ_ERR{0} (prudente). */
    if ((in->fields & SYNC_F_PHOTO_ID) && slot < GAL_MAX_SLOTS) {
      const GalSlotMeta *m = &storage_manifest()->slots[slot];
      if (m->state == GAL_SLOT_VALID && m->photo_id == in->photo_id) {
        return prv_status(out, SYNC_CODE_OK, slot, m->length);
      }
    }
    return prv_status(out, SYNC_CODE_SEQ_ERR, slot, 0);
  }
  if (!(in->fields & SYNC_F_SLOT) || slot != s_pend.slot) {
    return prv_status(out, SYNC_CODE_SEQ_ERR, s_pend.slot, s_pend.next);
  }
  if (s_pend.next != s_pend.length) {
    return prv_status(out, SYNC_CODE_SEQ_ERR, slot, s_pend.next);   /* mancano dati: riprendere da next */
  }
  if (s_pend.crc_running != s_pend.crc_expected) {
    prv_abort_pending();                         /* manifest non toccato: lo slot resta com'era */
    return prv_status(out, SYNC_CODE_CRC_ERR, slot, 0);
  }
  const uint32_t length = s_pend.length;
  const StorageResult r = storage_commit_slot(slot, s_pend.format, length, s_pend.crc_expected,
                                               s_pend.photo_id);
  prv_abort_pending();
  if (r != STORAGE_OK) {
    return prv_status(out, prv_code(r), slot, 0);
  }
  sync_env_album_changed();
  return prv_status(out, SYNC_CODE_OK, slot, length);
}

static SyncAction prv_sync_done(void) {
  if (s_state == SYNC_ST_SYNCING) {
    prv_abort_pending();
    s_state = SYNC_ST_IDLE;
    prv_progress(0, 0);
  }
  return SYNC_ACT_NONE;                          /* nessuna risposta: l'ACK basta */
}

static SyncAction prv_settings(const SyncIn *in, SyncOut *out) {
  if (!(in->fields & SYNC_F_SETTINGS) || !in->settings || in->settings_len != sizeof(GalSettings)) {
    return prv_status(out, SYNC_CODE_BAD_FORMAT, GAL_SLOT_NONE, 0);
  }
  GalSettings before = *settings_get();          /* 20 B sullo stack */
  GalSettings next;
  memcpy(&next, in->settings, sizeof(next));     /* crc16 del blob ignorato: lo ricalcola storage */
  if (!settings_apply(&next)) {
    return prv_status(out, SYNC_CODE_BAD_FORMAT, GAL_SLOT_NONE, 0);
  }
  sync_env_settings_changed(&before);
  return prv_status(out, SYNC_CODE_OK, GAL_SLOT_NONE, 0);
}

static SyncAction prv_album_order(const SyncIn *in, SyncOut *out) {
  if (!(in->fields & SYNC_F_ORDER) || !in->order || in->order_len != GAL_MAX_SLOTS
      || !prv_order_valid(in->order)) {
    return prv_status(out, SYNC_CODE_BAD_FORMAT, GAL_SLOT_NONE, 0);
  }
  const StorageResult r = storage_set_order(in->order);
  if (r != STORAGE_OK) {
    return prv_status(out, prv_code(r), GAL_SLOT_NONE, 0);
  }
  sync_env_album_changed();
  return prv_status(out, SYNC_CODE_OK, GAL_SLOT_NONE, 0);
}

static SyncAction prv_album_delete(const SyncIn *in, SyncOut *out) {
  const uint8_t slot = (in->fields & SYNC_F_SLOT) ? in->slot : GAL_SLOT_NONE;
  if (slot >= GAL_MAX_SLOTS) {
    return prv_status(out, SYNC_CODE_BAD_FORMAT, slot, 0);
  }
  if (s_pend.active && s_pend.slot == slot) {
    prv_abort_pending();                         /* eliminata la foto in arrivo: il trasferimento decade */
  }
  const StorageResult r = storage_clear_slot(slot);
  if (r != STORAGE_OK) {
    return prv_status(out, prv_code(r), slot, 0);
  }
  sync_env_album_changed();
  return prv_status(out, SYNC_CODE_OK, slot, 0);
}

/* ---- API ---- */

void sync_proto_init(uint8_t native_format, uint16_t max_chunk) {
  s_native_format = native_format;
  s_max_chunk = (uint16_t)(max_chunk - max_chunk % GAL_CHUNK_BYTES);
  s_state = SYNC_ST_IDLE;
  s_count = 0;
  s_index = 0;
  s_counted_slot = GAL_SLOT_NONE;
  memset(&s_pend, 0, sizeof(s_pend));
}

void sync_proto_set_max_chunk(uint16_t max_chunk) {
  s_max_chunk = (uint16_t)(max_chunk - max_chunk % GAL_CHUNK_BYTES);
}

SyncAction sync_proto_handle(const SyncIn *in, SyncOut *out) {
  if (!out) {
    return SYNC_ACT_NONE;
  }
  memset(out, 0, sizeof(*out));
  out->slot = GAL_SLOT_NONE;
  if (!in || in->msg == SYNC_MSG_NONE) {
    return SYNC_ACT_NONE;
  }
  SyncAction act;
  switch (in->msg) {
    case SYNC_MSG_JS_READY:     act = prv_hello(out); break;
    case SYNC_MSG_SYNC_REQUEST: act = prv_sync_request(in, out); break;
    case SYNC_MSG_PHOTO_BEGIN:  act = prv_photo_begin(in, out); break;
    case SYNC_MSG_PHOTO_DATA:   act = prv_photo_data(in, out); break;
    case SYNC_MSG_PHOTO_END:    act = prv_photo_end(in, out); break;
    case SYNC_MSG_SYNC_DONE:    act = prv_sync_done(); break;
    case SYNC_MSG_SETTINGS:     act = prv_settings(in, out); break;
    case SYNC_MSG_ALBUM_ORDER:  act = prv_album_order(in, out); break;
    case SYNC_MSG_ALBUM_DELETE: act = prv_album_delete(in, out); break;
    default:                    act = prv_status(out, SYNC_CODE_NOT_SUPPORTED, GAL_SLOT_NONE, 0); break;
  }
  if (out->msg == SYNC_MSG_STATUS) {
    out->reply_to = in->msg;                 /* S5b: ogni STATUS dice a quale messaggio risponde */
  }
  return act;
}

bool sync_proto_timeout(void) {
  if (s_state != SYNC_ST_SYNCING) {
    return false;
  }
  prv_abort_pending();
  s_counted_slot = GAL_SLOT_NONE;
  s_state = SYNC_ST_IDLE;
  prv_progress(0, 0);
  return true;
}

uint8_t sync_proto_state(void) {
  return s_state;
}

uint16_t sync_proto_max_chunk(void) {
  return s_max_chunk;
}

bool sync_proto_pending(uint8_t *slot, uint32_t *next_offset) {
  if (slot) {
    *slot = s_pend.active ? s_pend.slot : GAL_SLOT_NONE;
  }
  if (next_offset) {
    *next_offset = s_pend.active ? s_pend.next : 0;
  }
  return s_pend.active;
}

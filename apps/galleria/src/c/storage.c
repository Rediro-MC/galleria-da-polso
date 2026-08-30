/* storage.c — vedi storage.h. Regola 8: persist_exists prima di leggere, schema versionato + CRC,
 * chunk poi manifest, scritture con debounce, flush in deinit, quota con fallback 4096,
 * E_OUT_OF_STORAGE gestito. Nessuna allocazione: buffer static a file-scope (regola 5). */
#include <pebble.h>
#include "storage.h"
#include "crc.h"
#include "gal_log.h"

static GalManifest s_manifest;            /* copia in RAM (214 B) */
static bool        s_manifest_loaded;     /* letto valido da persist */
static bool        s_album_enabled;
static uint32_t    s_quota;
static GalSettings s_pending_settings;    /* ultima copia ricevuta, in attesa di scrittura */
static bool        s_settings_dirty;
static AppTimer   *s_settings_timer;
static bool        s_schema_ok;           /* chiave 0 verificata/scritta in questa esecuzione (revisione S4) */
static GalManifest s_backup;              /* copia del manifest da ripristinare se la scrittura fallisce */

/* ---- primitive ---- */

static bool prv_read_blob(uint32_t key, void *buf, uint16_t size) {
  if (!persist_exists(key)) {
    return false;
  }
  if (persist_get_size(key) != (int)size) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "storage: key %u size %d != %u", (unsigned)key,
            persist_get_size(key), (unsigned)size);
    return false;
  }
  return persist_read_data(key, buf, size) == (int)size;
}

static StorageResult prv_write_blob(uint32_t key, const void *buf, uint16_t size) {
  const int r = persist_write_data(key, buf, size);
  if (r == (int)size) {
    return STORAGE_OK;
  }
  APP_LOG(APP_LOG_LEVEL_ERROR, "storage: write key %u (%u B) -> %d", (unsigned)key, (unsigned)size, r);
  return (r == E_OUT_OF_STORAGE) ? STORAGE_NO_SPACE : STORAGE_ERR;
}

/* Chiave 0 = versione dello schema, scritta una volta prima del primo blob. */
static StorageResult prv_ensure_schema_key(void) {
  if (s_schema_ok) {
    return STORAGE_OK;                     /* già verificata: niente 2 lookup a ogni scrittura */
  }
  if (persist_exists(GAL_KEY_SCHEMA) && persist_read_int(GAL_KEY_SCHEMA) == GAL_SCHEMA) {
    s_schema_ok = true;
    return STORAGE_OK;
  }
  /* Ritorna i byte scritti (4) se ok, un StatusCode negativo altrimenti (pebble.h: "The number of
   * bytes written if successful") — NON S_SUCCESS: verificato in emulatore (S4). */
  const status_t r = persist_write_int(GAL_KEY_SCHEMA, GAL_SCHEMA);
  if (r < 0) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "storage: write schema -> %d", (int)r);
    return (r == E_OUT_OF_STORAGE) ? STORAGE_NO_SPACE : STORAGE_ERR;
  }
  s_schema_ok = true;
  return STORAGE_OK;
}

static void prv_manifest_defaults(GalManifest *m) {
  memset(m, 0, sizeof(*m));
  m->magic = GAL_MAGIC;
  m->schema = GAL_SCHEMA;
  m->slot_count = GAL_MAX_SLOTS;
  memset(m->order, GAL_SLOT_NONE, sizeof(m->order));
}

static bool prv_manifest_valid(const GalManifest *m) {
  if (m->magic != GAL_MAGIC || m->schema != GAL_SCHEMA || m->slot_count != GAL_MAX_SLOTS) {
    return false;
  }
  return crc16_ccitt((const uint8_t *)m, sizeof(*m) - 2) == m->crc16;
}

static StorageResult prv_write_manifest(void) {
  if (!s_album_enabled) {
    return STORAGE_DISABLED;
  }
  StorageResult r = prv_ensure_schema_key();
  if (r != STORAGE_OK) {
    return r;
  }
  s_manifest.crc16 = crc16_ccitt((const uint8_t *)&s_manifest, sizeof(s_manifest) - 2);
  r = prv_write_blob(GAL_KEY_MANIFEST, &s_manifest, sizeof(s_manifest));
  if (r == STORAGE_OK) {
    s_manifest_loaded = true;
  }
  return r;
}

/* Versione futura dello schema: azzera le chiavi di metadati (i chunk restano: senza manifest
 * non vengono letti e verranno sovrascritti dalle prossime sync). */
static void prv_reset_meta(void) {
  s_schema_ok = false;
  persist_delete(GAL_KEY_SCHEMA);
  persist_delete(GAL_KEY_MANIFEST);
  persist_delete(GAL_KEY_ROTSTATE);
  persist_delete(GAL_KEY_SETTINGS);
}

/* ---- init ---- */

bool storage_init(void) {
  s_schema_ok = false;
  /* PBL_API_EXISTS espande a defined(): GCC avverte con -Wextra, ma è la macro sanzionata (regola 1). */
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wexpansion-to-defined"
#if PBL_API_EXISTS(persist_get_max_size)
  s_quota = (uint32_t)persist_get_max_size();
#else
  s_quota = 4096;                          /* SDK < 4.17: la doc dice di assumere 4 KB */
#endif
#pragma GCC diagnostic pop
  s_album_enabled = (s_quota >= GAL_MIN_QUOTA);

  int32_t schema = 0;
  if (persist_exists(GAL_KEY_SCHEMA)) {
    schema = persist_read_int(GAL_KEY_SCHEMA);
    if (schema > GAL_SCHEMA || schema < 0) {
      APP_LOG(APP_LOG_LEVEL_WARNING, "storage: schema %d > %d: reset", (int)schema, GAL_SCHEMA);
      prv_reset_meta();
      schema = 0;
    }
  }

  prv_manifest_defaults(&s_manifest);
  s_manifest_loaded = false;
  /* Lettura in s_backup (buffer static riusato: mai 214 B sullo stack, regola 5). */
  if (s_album_enabled && prv_read_blob(GAL_KEY_MANIFEST, &s_backup, sizeof(s_backup))) {
    if (prv_manifest_valid(&s_backup)) {
      s_manifest = s_backup;
      s_manifest_loaded = true;
    } else {
      APP_LOG(APP_LOG_LEVEL_WARNING, "storage: manifest invalid (magic %08x schema %u crc): ignored",
              (unsigned)s_backup.magic, (unsigned)s_backup.schema);
    }
  }
  APP_LOG(APP_LOG_LEVEL_INFO, "storage: quota=%u album=%d schema=%d manifest=%s valid=%u",
          (unsigned)s_quota, (int)s_album_enabled, (int)schema,
          s_manifest_loaded ? "persist" : "default", (unsigned)storage_valid_slots());
  return s_album_enabled;
}

bool storage_album_enabled(void) {
  return s_album_enabled;
}

uint32_t storage_quota(void) {
  return s_quota;
}

const GalManifest *storage_manifest(void) {
  return &s_manifest;
}

uint8_t storage_valid_slots(void) {
  uint8_t n = 0;
  for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {
    if (s_manifest.slots[k].state == GAL_SLOT_VALID) {
      n++;
    }
  }
  return n;
}

/* ---- impostazioni ---- */

bool storage_read_settings(GalSettings *out) {
  if (!out) {
    return false;
  }
  static GalSettings s_tmp;
  if (!prv_read_blob(GAL_KEY_SETTINGS, &s_tmp, sizeof(s_tmp))) {
    return false;
  }
  if (s_tmp.schema != GAL_SETTINGS_SCHEMA
      || crc16_ccitt((const uint8_t *)&s_tmp, sizeof(s_tmp) - 2) != s_tmp.crc16) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "storage: settings invalid (schema %u): defaults", (unsigned)s_tmp.schema);
    return false;
  }
  *out = s_tmp;
  return true;
}

static void prv_write_settings_now(void) {
  if (!s_settings_dirty) {
    return;
  }
  if (prv_ensure_schema_key() != STORAGE_OK) {
    return;                              /* dirty resta alzato: si ritenta al flush (test_storage S4) */
  }
  s_pending_settings.schema = GAL_SETTINGS_SCHEMA;
  s_pending_settings.crc16 = crc16_ccitt((const uint8_t *)&s_pending_settings, sizeof(s_pending_settings) - 2);
  const StorageResult r = prv_write_blob(GAL_KEY_SETTINGS, &s_pending_settings, sizeof(s_pending_settings));
  if (r == STORAGE_OK) {
    s_settings_dirty = false;            /* solo dopo una scrittura riuscita: mai perdere dati */
  }
  LOGV("storage: settings written -> %d", (int)r);   /* un fallimento e' gia' loggato da prv_write_blob */
}

static void prv_settings_timer_cb(void *ctx) {
  s_settings_timer = NULL;
  prv_write_settings_now();
}

void storage_settings_changed(const GalSettings *s) {
  if (!s) {
    return;
  }
  s_pending_settings = *s;
  s_settings_dirty = true;
  if (s_settings_timer) {
    if (app_timer_reschedule(s_settings_timer, STORAGE_SETTINGS_DEBOUNCE_MS)) {
      return;
    }
    /* Scaduto ma il callback è ancora in coda (prv_settings_timer_cb azzera l'handle per primo,
     * quindi non ha ancora scritto): lo cancelliamo, il timer nuovo scrive la copia aggiornata fra
     * 10 s (F2; stesso schema di sync.c). */
    app_timer_cancel(s_settings_timer);
  }
  s_settings_timer = app_timer_register(STORAGE_SETTINGS_DEBOUNCE_MS, prv_settings_timer_cb, NULL);
  if (!s_settings_timer) {
    prv_write_settings_now();              /* senza timer (heap?) scriviamo subito: mai perdere dati */
  }
}

void storage_flush(void) {
  if (s_settings_timer) {
    app_timer_cancel(s_settings_timer);
    s_settings_timer = NULL;
  }
  prv_write_settings_now();
}

/* ---- stato rotazione ---- */

bool storage_read_rotstate(GalRotState *out) {
  if (!out) {
    return false;
  }
  GalRotState st;
  if (!prv_read_blob(GAL_KEY_ROTSTATE, &st, sizeof(st))) {
    return false;
  }
  if (crc16_ccitt((const uint8_t *)&st, sizeof(st) - 2) != st.crc16) {
    return false;
  }
  *out = st;
  return true;
}

bool storage_write_rotstate(const GalRotState *st) {
  if (!st) {
    return false;
  }
  GalRotState w = *st;
  w.crc16 = crc16_ccitt((const uint8_t *)&w, sizeof(w) - 2);
  return prv_ensure_schema_key() == STORAGE_OK
      && prv_write_blob(GAL_KEY_ROTSTATE, &w, sizeof(w)) == STORAGE_OK;
}

/* ---- foto ---- */

int storage_read_chunk(uint8_t slot, uint16_t i, uint8_t *buf, uint16_t cap) {
  if (!s_album_enabled || slot >= GAL_MAX_SLOTS || i >= GAL_KEYS_PER_SLOT || !buf || cap == 0) {
    return STORAGE_ERR;
  }
  /* Niente persist_exists: persist_read_data ritorna già E_DOES_NOT_EXIST (< 0), non ambiguo come
   * persist_read_int → 134 lookup in meno per foto nel tick (revisione S4; ricerca 02 F14/F16). */
  int n = persist_read_data(GAL_KEY_CHUNK(slot, i), buf, cap);   /* byte letti o E_DOES_NOT_EXIST */
#ifdef GALLERIA_DEBUG_CORRUPT_SLOT
  if (n > 0 && slot == GALLERIA_DEBUG_CORRUPT_SLOT && i == 0) {
    buf[0] ^= 0xFFu;                       /* build di test: CRC di questo slot sempre sbagliato */
  }
#endif
  return n;
}

StorageResult storage_write_chunk(uint8_t slot, uint16_t i, const uint8_t *data, uint16_t n) {
  if (!s_album_enabled) {
    return STORAGE_DISABLED;
  }
  if (slot >= GAL_MAX_SLOTS || i >= GAL_KEYS_PER_SLOT || !data || n == 0 || n > GAL_CHUNK_BYTES) {
    return STORAGE_ERR;
  }
  return prv_write_blob(GAL_KEY_CHUNK(slot, i), data, n);
}

StorageResult storage_commit_slot(uint8_t slot, uint8_t format, uint32_t length, uint32_t crc32, uint32_t photo_id) {
  if (!s_album_enabled) {
    return STORAGE_DISABLED;
  }
  if (slot >= GAL_MAX_SLOTS || length == 0 || length > (uint32_t)GAL_KEYS_PER_SLOT * GAL_CHUNK_BYTES) {
    return STORAGE_ERR;
  }
  s_backup = s_manifest;                    /* ripristino se la scrittura fallisce (mai 214 B sullo stack) */
  GalSlotMeta *m = &s_manifest.slots[slot];
  m->state = GAL_SLOT_VALID;
  m->format = format;
  m->generation = (uint16_t)(m->generation + 1u);
  m->length = length;
  m->crc32 = crc32;
  m->photo_id = photo_id;
  bool in_order = false;
  uint8_t end = GAL_MAX_SLOTS;
  for (uint8_t i = 0; i < GAL_MAX_SLOTS; i++) {
    if (s_manifest.order[i] == slot) {
      in_order = true;
      break;
    }
    if (s_manifest.order[i] == GAL_SLOT_NONE) {
      end = i;
      break;
    }
  }
  if (!in_order && end < GAL_MAX_SLOTS) {
    s_manifest.order[end] = slot;
  }
  const StorageResult r = prv_write_manifest();
  if (r != STORAGE_OK) {
    s_manifest = s_backup;
  }
  return r;
}

StorageResult storage_set_order(const uint8_t *order) {
  if (!s_album_enabled) {
    return STORAGE_DISABLED;
  }
  if (!order) {
    return STORAGE_ERR;
  }
  if (memcmp(s_manifest.order, order, sizeof(s_manifest.order)) == 0) {
    /* F9(4), S7: ordine già in vigore → nessuna scrittura flash (ogni HELLO con foto manda
     * ALBUM_ORDER completo: prima erano 214 B di manifest riscritti a ogni sync). */
    return STORAGE_OK;
  }
  s_backup = s_manifest;
  memcpy(s_manifest.order, order, sizeof(s_manifest.order));
  const StorageResult r = prv_write_manifest();
  if (r != STORAGE_OK) {
    s_manifest = s_backup;
  }
  return r;
}

StorageResult storage_clear_slot(uint8_t slot) {
  if (!s_album_enabled) {
    return STORAGE_DISABLED;
  }
  if (slot >= GAL_MAX_SLOTS) {
    return STORAGE_ERR;
  }
  s_backup = s_manifest;
  s_manifest.slots[slot].state = GAL_SLOT_EMPTY;
  const StorageResult r = prv_write_manifest();
  if (r != STORAGE_OK) {
    s_manifest = s_backup;
  }
  return r;
}

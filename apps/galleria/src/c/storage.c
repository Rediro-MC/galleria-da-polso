/* storage.c — vedi storage.h. Regola 8: persist_exists prima di leggere, schema versionato + CRC,
 * chunk poi manifest, scritture con debounce, flush in deinit, quota con fallback 4096,
 * E_OUT_OF_STORAGE gestito. Nessuna allocazione: buffer static a file-scope (regola 5).
 *
 * Revisione perf (04/09/2026, schema 2): sul Pebble Time 2 il file persist con 12 foto (~430 KB,
 * ~1.600 record) è una lista lineare che il firmware (settings_file.c, senza page cache) scandisce
 * dall'inizio a ogni ricerca di chiave: ~0,4 s a scansione, 2 scansioni già all'apertura (prima
 * chiamata persist), una per ogni chiave cercata, una A VUOTO per ogni chiave assente. Quindi:
 * un solo record di metadati (manifest + impostazioni + shake, 234 B), nessuna chiave letta a
 * vuoto, s_schema_ok alzato già in init (la prima scrittura non ripaga la ricerca della chiave 0),
 * nessuna scrittura in deinit (il flush scrive solo se ci sono impostazioni pendenti); lo shake
 * NON si persiste affatto (D19: solo RAM in model.c; storage_write_rotstate resta per i test).
 * Chiavi 2 e 10 dello schema 1 lette una volta sola per la migrazione e mai più (cancellarle
 * costerebbe una scansione ciascuna). Revisione 05/09: con l'album disabilitato il record scritto
 * conserva slot e ordine del file (s_backup), anche se in RAM sono azzerati. */
#include <pebble.h>
#include "storage.h"
#include "crc.h"
#include "gal_log.h"

static GalManifest s_manifest;            /* copia in RAM (234 B): slot, ordine, impostazioni, shake */
static bool        s_manifest_loaded;     /* letto valido da persist (o migrato da schema 1) */
static bool        s_album_enabled;
static uint32_t    s_quota;
static bool        s_settings_dirty;      /* impostazioni cambiate: timer, oppure flush in deinit */
static bool        s_shake_dirty;         /* shake cambiato: solo timer (mai in deinit: uscita veloce) */
static AppTimer   *s_write_timer;         /* UN solo timer per entrambi (lo shim dei test ne ha uno) */
static bool        s_schema_ok;           /* chiave 0 verificata/scritta in questa esecuzione */
static GalManifest s_backup;              /* copia del manifest da ripristinare se la scrittura fallisce; in init è
                                             il buffer di lettura (anche del V1: 214 ≤ 234 B) e, con l'album
                                             disabilitato, l'immagine di slot/ordine da conservare nel record */
static uint16_t    s_open_ms;             /* ms della prima chiamata persist (apertura del file da parte del
                                             firmware): misurata SEMPRE, va nel HELLO (OPEN_MS) per l'avviso
                                             "Galleria lenta" della config page */
#ifdef GALLERIA_DEBUG_TIMING
static int         s_t_man_ms;            /* build M: ricerca del manifest */
#endif

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
    return STORAGE_OK;                     /* già verificata in init: niente ricerche a ogni scrittura */
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
  settings_set_defaults(&m->settings);
}

static bool prv_manifest_valid(const GalManifest *m) {
  if (m->magic != GAL_MAGIC || m->schema != GAL_SCHEMA || m->slot_count != GAL_MAX_SLOTS) {
    return false;
  }
  return crc16_ccitt((const uint8_t *)m, sizeof(*m) - 2) == m->crc16;
}

/* Scrive il manifest corrente (senza controllare l'album: le impostazioni e lo shake si salvano
 * anche con l'album disabilitato). Il CRC delle impostazioni viene ricalcolato: è quello che
 * settings.c/sync.c espongono al telefono (HELLO.CRC), il manifest ha il suo. */
static void prv_hide_slots(void) {
  memset(s_manifest.slots, 0, sizeof(s_manifest.slots));
  memset(s_manifest.order, GAL_SLOT_NONE, sizeof(s_manifest.order));
}

static StorageResult prv_write_manifest_any(void) {
  StorageResult r = prv_ensure_schema_key();
  if (r != STORAGE_OK) {
    return r;
  }
  if (!s_album_enabled) {
    /* Album disabilitato (quota < 1 MiB): in RAM slot e ordine sono azzerati (model.c non li prova),
     * ma il record deve conservare quelli del file: sono l'unica descrizione delle foto, i cui chunk
     * restano nel file (revisione 05/09, B1). s_backup = immagine letta/migrata in init, mai toccata
     * finché l'album è disabilitato (commit/set_order/clear_slot escono con STORAGE_DISABLED). */
    memcpy(s_manifest.slots, s_backup.slots, sizeof(s_manifest.slots));
    memcpy(s_manifest.order, s_backup.order, sizeof(s_manifest.order));
  }
  s_manifest.settings.schema = GAL_SETTINGS_SCHEMA;
  s_manifest.settings.crc16 = crc16_ccitt((const uint8_t *)&s_manifest.settings, sizeof(GalSettings) - 2);
  s_manifest.crc16 = crc16_ccitt((const uint8_t *)&s_manifest, sizeof(s_manifest) - 2);
  r = prv_write_blob(GAL_KEY_MANIFEST, &s_manifest, sizeof(s_manifest));
  if (!s_album_enabled) {
    prv_hide_slots();
  }
  if (r == STORAGE_OK) {
    s_manifest_loaded = true;
    s_settings_dirty = false;              /* il record porta sempre anche impostazioni e shake */
    s_shake_dirty = false;
  }
  return r;
}

static StorageResult prv_write_manifest(void) {
  if (!s_album_enabled) {
    return STORAGE_DISABLED;
  }
  return prv_write_manifest_any();
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

static void prv_schedule_write(void);

/* ---- migrazione schema 1 → 2 (una volta, al primo avvio dopo l'aggiornamento) ---- */

/* Il manifest V1 (214 B) viene letto nei byte di s_backup (234 B, libero durante init): niente
 * .bss in più per una lettura che avviene una volta sola (revisione 05/09, F28). */
_Static_assert(sizeof(GalManifestV1) <= sizeof(GalManifest), "il V1 deve stare in s_backup");
#define S_V1 ((GalManifestV1 *)&s_backup)

static bool prv_v1_valid(const GalManifestV1 *m) {
  if (m->magic != GAL_MAGIC || m->schema != 1 || m->slot_count != GAL_MAX_SLOTS) {
    return false;
  }
  return crc16_ccitt((const uint8_t *)m, sizeof(*m) - 2) == m->crc16;
}

/* Costruisce s_manifest dallo schema 1: slot e ordine dal manifest vecchio, impostazioni dalla
 * chiave 10 e shake dalla chiave 2 SE esistono e sono valide (ognuna costa una ricerca: solo qui,
 * una volta). Il record nuovo viene scritto dal timer (debounce) o dal flush di deinit, non ora:
 * l'avvio non paga la scrittura. */
static void prv_migrate_v1(void) {
  prv_manifest_defaults(&s_manifest);
  memcpy(s_manifest.order, S_V1->order, sizeof(s_manifest.order));
  memcpy(s_manifest.slots, S_V1->slots, sizeof(s_manifest.slots));
  static GalSettings s_old;
  bool have_settings = false;
  if (prv_read_blob(GAL_KEY_SETTINGS, &s_old, sizeof(s_old))
      && s_old.schema == GAL_SETTINGS_SCHEMA
      && crc16_ccitt((const uint8_t *)&s_old, sizeof(s_old) - 2) == s_old.crc16
      && settings_validate(&s_old)) {
    s_manifest.settings = s_old;
    have_settings = true;
  }
  GalRotState rs;
  if (prv_read_blob(GAL_KEY_ROTSTATE, &rs, sizeof(rs))
      && crc16_ccitt((const uint8_t *)&rs, sizeof(rs) - 2) == rs.crc16) {
    s_manifest.shake_offset = rs.shake_offset;
  }
  s_manifest_loaded = true;
  s_settings_dirty = true;                 /* → scrittura del record nuovo fra 10 s (o al flush di deinit) */
  prv_schedule_write();
  APP_LOG(APP_LOG_LEVEL_INFO, "storage: manifest schema 1 -> 2 migrated (settings %d shake %u)",
          (int)have_settings, (unsigned)s_manifest.shake_offset);
}

/* ---- timer di scrittura (impostazioni + shake) ---- */

static void prv_write_pending_now(void) {
  if (!s_settings_dirty && !s_shake_dirty) {
    return;
  }
  const StorageResult r = prv_write_manifest_any();   /* dirty restano alzati se fallisce: si ritenta */
  (void)r;                                            /* un fallimento e' gia' loggato da prv_write_blob */
  LOGV("storage: meta written -> %d", (int)r);
}

#define STORAGE_WRITE_RETRIES 3           /* fire fallito (p.es. E_OUT_OF_STORAGE transitorio): ritenta fra 10 s */
static uint8_t s_write_retries;

static void prv_write_timer_cb(void *ctx) {
  s_write_timer = NULL;
  prv_write_pending_now();
  if ((s_settings_dirty || s_shake_dirty) && s_write_retries < STORAGE_WRITE_RETRIES) {
    s_write_retries++;                     /* scrittura fallita: nuovo tentativo dal timer, mai in deinit */
    s_write_timer = app_timer_register(STORAGE_SETTINGS_DEBOUNCE_MS, prv_write_timer_cb, NULL);
  }
}

static void prv_schedule_write(void) {
  s_write_retries = 0;                     /* evento nuovo: il contatore dei tentativi riparte */
  if (s_write_timer) {
    if (app_timer_reschedule(s_write_timer, STORAGE_SETTINGS_DEBOUNCE_MS)) {
      return;
    }
    /* Scaduto ma il callback è ancora in coda (prv_write_timer_cb azzera l'handle per primo,
     * quindi non ha ancora scritto): lo cancelliamo, il timer nuovo scrive la copia aggiornata fra
     * 10 s (F2; stesso schema di sync.c). */
    app_timer_cancel(s_write_timer);
  }
  s_write_timer = app_timer_register(STORAGE_SETTINGS_DEBOUNCE_MS, prv_write_timer_cb, NULL);
  if (!s_write_timer) {
    prv_write_pending_now();               /* senza timer (heap?) scriviamo subito: mai perdere dati */
  }
}

/* ---- init ---- */

bool storage_init(void) {
  s_schema_ok = false;
  s_settings_dirty = false;
  s_shake_dirty = false;
  s_write_retries = 0;
  if (s_write_timer) {                     /* solo test host (init ripetuto): sull'orologio è NULL */
    app_timer_cancel(s_write_timer);
    s_write_timer = NULL;
  }
  /* PBL_API_EXISTS espande a defined(): GCC avverte con -Wextra, ma è la macro sanzionata (regola 1). */
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wexpansion-to-defined"
#if PBL_API_EXISTS(persist_get_max_size)
  s_quota = (uint32_t)persist_get_max_size();      /* non apre il file persist (persist.c del firmware) */
#else
  s_quota = 4096;                          /* SDK < 4.17: la doc dice di assumere 4 KB */
#endif
#pragma GCC diagnostic pop
  s_album_enabled = (s_quota >= GAL_MIN_QUOTA);

  /* Prima chiamata persist = apertura del file da parte del firmware (bootup_check + compute_stats:
   * 2 scansioni complete, ~0,8 s con 12 foto sul PT2) PIÙ la ricerca della chiave 0, la cui posizione
   * dipende dalla storia del file: dopo i chunk della prima foto su un file nuovo (~135° record),
   * in coda dopo una migrazione 1 → 2 (riscritta = appesa: fino a una scansione in più). La misura
   * s_open_ms va quindi letta come "2-3 scansioni" (revisione 05/09, F04): la config page la
   * confronta con una soglia proporzionale al numero di foto. */
  time_t o_s = 0;
  uint16_t o_ms = 0;
  time_ms(&o_s, &o_ms);                    /* due chiamate per esecuzione: costo nullo (regola 11) */
  int32_t schema = 0;
  if (persist_exists(GAL_KEY_SCHEMA)) {
    schema = persist_read_int(GAL_KEY_SCHEMA);
    if (schema > GAL_SCHEMA || schema < 0) {
      APP_LOG(APP_LOG_LEVEL_WARNING, "storage: schema %d fuori intervallo (max %d): reset", (int)schema, GAL_SCHEMA);
      prv_reset_meta();
      schema = 0;
    } else if (schema == GAL_SCHEMA) {
      s_schema_ok = true;                  /* già letta: la prima scrittura non la ricerca di nuovo */
    }
  }
  {
    time_t s1 = 0;
    uint16_t ms1 = 0;
    time_ms(&s1, &ms1);
    const int32_t d = (int32_t)(s1 - o_s) * 1000 + ((int32_t)ms1 - (int32_t)o_ms);
    s_open_ms = (d < 0) ? 0 : (d > 65535) ? 65535 : (uint16_t)d;
  }

  prv_manifest_defaults(&s_manifest);
  s_manifest_loaded = false;
  /* Manifest: una sola ricerca (il record sta in coda al file: ~1 scansione), poi persist_get_size
   * e persist_read_data riprendono dal record trovato. Schema 1 (214 B) → migrazione. */
  TMR(t_man);
  if (persist_exists(GAL_KEY_MANIFEST)) {
    const int size = persist_get_size(GAL_KEY_MANIFEST);
    if (size == (int)sizeof(GalManifest)) {
      if (persist_read_data(GAL_KEY_MANIFEST, &s_backup, sizeof(s_backup)) == (int)sizeof(s_backup)
          && prv_manifest_valid(&s_backup)) {
        s_manifest = s_backup;
        s_manifest_loaded = true;
      } else {
        APP_LOG(APP_LOG_LEVEL_WARNING, "storage: manifest invalid (magic %08x schema %u crc): ignored",
                (unsigned)s_backup.magic, (unsigned)s_backup.schema);
      }
    } else if (size == (int)sizeof(GalManifestV1)) {
      if (persist_read_data(GAL_KEY_MANIFEST, S_V1, sizeof(GalManifestV1)) == (int)sizeof(GalManifestV1)
          && prv_v1_valid(S_V1)) {
        prv_migrate_v1();
      } else {
        APP_LOG(APP_LOG_LEVEL_WARNING, "storage: manifest v1 invalid (magic %08x schema %u): ignored",
                (unsigned)S_V1->magic, (unsigned)S_V1->schema);
      }
    } else {
      APP_LOG(APP_LOG_LEVEL_WARNING, "storage: manifest size %d: ignored", size);
    }
  }
#ifdef GALLERIA_DEBUG_TIMING
  s_t_man_ms = TMR_MS(t_man);
#endif
  if (!settings_validate(&s_manifest.settings)) {
    settings_set_defaults(&s_manifest.settings);   /* record letto ma impostazioni fuori intervallo */
  }
  s_backup = s_manifest;                   /* immagine di slot/ordine (letta, migrata o default) */
  if (!s_album_enabled) {
    /* Quota < 1 MiB: in RAM gli slot non devono comparire come validi (storage_read_chunk rifiuta e
     * model.c li proverebbe tutti); nel record scritto restano quelli di s_backup (B1). */
    prv_hide_slots();
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

uint16_t storage_open_ms(void) {
  return s_open_ms;
}

int storage_debug_ms(uint8_t which) {
#ifdef GALLERIA_DEBUG_TIMING
  return which == 0 ? (int)s_open_ms : s_t_man_ms;
#else
  (void)which;
  return 0;
#endif
}

/* ---- impostazioni (nel manifest) ---- */

bool storage_read_settings(GalSettings *out) {
  if (!out || !s_manifest_loaded) {
    return false;                          /* nessun record: default (nessuna ricerca a vuoto) */
  }
  *out = s_manifest.settings;
  return true;
}

void storage_settings_changed(const GalSettings *s) {
  if (!s) {
    return;
  }
  s_manifest.settings = *s;
  s_settings_dirty = true;
  prv_schedule_write();
}

void storage_flush(void) {
  if (s_write_timer) {
    app_timer_cancel(s_write_timer);
    s_write_timer = NULL;
  }
  if (!s_settings_dirty) {
    return;                                /* solo shake pendente: NIENTE scrittura in deinit (uscita veloce) */
  }
  prv_write_pending_now();
}

/* ---- stato rotazione (nel manifest) ---- */

bool storage_read_rotstate(GalRotState *out) {
  if (!out || !s_manifest_loaded) {
    return false;
  }
  out->shake_offset = s_manifest.shake_offset;
  out->crc16 = 0;
  return true;
}

bool storage_write_rotstate(const GalRotState *st) {
  if (!st) {
    return false;
  }
  if (s_manifest.shake_offset == st->shake_offset && !s_shake_dirty) {
    return true;                           /* invariato: nessuna scrittura */
  }
  s_manifest.shake_offset = st->shake_offset;
  s_shake_dirty = true;
  prv_schedule_write();                    /* debounce: mai una scansione nel gestore dello shake */
  return true;
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
  s_backup = s_manifest;                    /* ripristino se la scrittura fallisce (mai 234 B sullo stack) */
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
  if (s_manifest.slots[slot].state == GAL_SLOT_EMPTY) {
    return STORAGE_OK;                     /* idempotente (revisione 05/09, F31): un ALBUM_DELETE ritrasmesso
                                              non appende un record morto (come set_order con ordine identico) */
  }
  s_backup = s_manifest;
  s_manifest.slots[slot].state = GAL_SLOT_EMPTY;
  const StorageResult r = prv_write_manifest();
  if (r != STORAGE_OK) {
    s_manifest = s_backup;
  }
  return r;
}

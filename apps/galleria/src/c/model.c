/* model.c — vedi model.h. Nessuna allocazione; nessun timer; nessuna scrittura persist a regime.
 * Non include sync.h: l'hold di sync (F1) arriva da sync.c tramite model_sync_hold. */
#include <pebble.h>
#include "model.h"
#include "storage.h"
#include "settings.h"
#include "rotation.h"
#include "ui_photo.h"
#include "ui_time.h"
#include "photo_codec.h"
#include "crc.h"
#include "gal_log.h"

#define DEMO_COUNT 2
static const uint32_t DEMO_RES[DEMO_COUNT] = {
  PBL_IF_COLOR_ELSE(RESOURCE_ID_DEMO_1_RAW6, RESOURCE_ID_DEMO_1_RAW1),
  PBL_IF_COLOR_ELSE(RESOURCE_ID_DEMO_2_RAW6, RESOURCE_ID_DEMO_2_RAW1),
};

static uint8_t   s_slot = GAL_SLOT_NONE;   /* slot persist mostrato (GAL_SLOT_NONE = demo) */
static uint16_t  s_generation;             /* generation del manifest per s_slot (ricarica dopo una sync) */
static uint8_t   s_demo = 0xFF;            /* demo mostrata quando s_slot == GAL_SLOT_NONE */
static uint16_t  s_bad_mask;               /* slot con lettura/CRC falliti in questa esecuzione */
static uint16_t  s_shake, s_shake_saved;   /* contatore shake in RAM (mod ROT_SHAKE_MOD) / valore letto da persist */
static bool      s_focus = true;
static bool      s_hold;                   /* F1: sync attiva → rotazione congelata (model_sync_hold) */
static bool      s_tap_subscribed;
static bool      s_have_time;
static uint32_t  s_now_min;                /* minuti locali dell'ultimo tick (anche fuori focus) */

static void prv_note_time(const struct tm *t) {
  if (!t) {
    return;
  }
  s_now_min = rotation_local_minutes(t->tm_year + 1900, t->tm_mon + 1, t->tm_mday, t->tm_hour, t->tm_min);
  s_have_time = true;
}

static void prv_time_now(void) {
  time_t now = time(NULL);
  prv_note_time(localtime(&now));
}

/* Sceglie e carica la foto per s_now_min. true se la foto mostrata è cambiata. */
/* Lo stato "mostrato" non esiste più (bitmap azzerato da un caricamento fallito, o mai riempito). */
static void prv_invalidate_shown(void) {
  s_slot = GAL_SLOT_NONE;
  s_generation = 0;
  s_demo = 0xFF;
}

static bool prv_update(void) {
  const GalSettings *st = settings_get();
  const GalManifest *m = storage_manifest();
  const uint8_t fmt = ui_photo_native_format();

  if (ui_photo_size().w == 0) {
    return false;                        /* nessun bitmap (heap insufficiente): sfondo nero, niente da caricare */
  }
  if (!ui_photo_is_loaded()) {
    prv_invalidate_shown();              /* il bitmap non contiene ciò che crediamo: ricaricare comunque */
  }

  for (uint8_t tries = 0; tries < GAL_MAX_SLOTS; tries++) {
    const uint8_t slot = rotation_slot(s_now_min, m, fmt, s_bad_mask, st->interval_min, st->order, s_shake);
    if (slot == GAL_SLOT_NONE) {
      break;                             /* nessuno slot mostrabile: demo */
    }
    if (slot == s_slot && m->slots[slot].generation == s_generation) {
      return false;                      /* stessa foto, ancora nel bitmap: nessuna lettura */
    }
    if (ui_photo_load_persist(slot, &m->slots[slot])) {
      s_slot = slot;
      s_generation = m->slots[slot].generation;
      s_demo = 0xFF;
      return true;
    }
    s_bad_mask |= (uint16_t)(1u << slot);
    APP_LOG(APP_LOG_LEVEL_WARNING, "rotation: slot %u unreadable, skipped until restart", (unsigned)slot);
    if (!ui_photo_is_loaded()) {
      /* Il tentativo ha azzerato il bitmap (chunk mancante / CRC): la foto di prima non c'è più, quindi
       * anche lo stesso slot va ricaricato e la UI avvisata (revisione S4: altrimenti schermo nero). */
      prv_invalidate_shown();
    }
  }

  uint8_t d;
#ifdef GALLERIA_DEMO_INDEX
  d = (uint8_t)(GALLERIA_DEMO_INDEX % DEMO_COUNT);   /* build di test: demo fissa */
#else
  d = rotation_index(s_now_min, DEMO_COUNT, st->interval_min, st->order, s_shake);
#endif
  if (s_slot == GAL_SLOT_NONE && d == s_demo) {
    return false;                        /* stessa demo, ancora nel bitmap (s_demo valido ⇒ caricata) */
  }
  const bool ok = ui_photo_load_resource(DEMO_RES[d]);
  if (!ok) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "demo photo %u not loaded: black background", (unsigned)d);
  }
  s_slot = GAL_SLOT_NONE;
  s_generation = 0;
  s_demo = ok ? d : 0xFF;                /* fallita: si ritenta al prossimo aggiornamento */
  return true;                           /* il bitmap è cambiato (foto o nero): la UI ricalcola e ridisegna */
}

static void prv_log_state(const char *why) {
  /* Righe brevi: il log dell'app viene troncato a ~100 caratteri, prefisso file:riga compreso. */
  APP_LOG(APP_LOG_LEVEL_INFO, "rot(%s): t=%u int=%u ord=%u shk=%u slot=%u demo=%u valid=%u bad=%x",
          why, (unsigned)s_now_min, (unsigned)settings_get()->interval_min, (unsigned)settings_get()->order,
          (unsigned)s_shake, (unsigned)s_slot, (unsigned)s_demo, (unsigned)storage_valid_slots(), (unsigned)s_bad_mask);
}

/* Aggiorna e, se la foto è cambiata, notifica la UI (colore a freddo + redraw completo). */
static void prv_apply(const char *why) {
  if (s_hold) {
    return;                              /* sync attiva (F1): lo stato è già aggiornato, si applica al rilascio */
  }
  if (!s_have_time) {
    prv_time_now();
  }
  if (prv_update()) {
    ui_time_photo_changed();
    prv_log_state(why);
  }
}

static void prv_tap_handler(AccelAxisType axis, int32_t direction) {
  model_shake();
}

static void prv_sync_tap(void) {
  const bool want = settings_get()->shake_next != 0;
  if (want && !s_tap_subscribed) {
    accel_tap_service_subscribe(prv_tap_handler);
    s_tap_subscribed = true;
  } else if (!want && s_tap_subscribed) {
    accel_tap_service_unsubscribe();
    s_tap_subscribed = false;
  }
}

#ifdef GALLERIA_DEBUG_SEED
/* Build di test (GALLERIA_DEFINES="GALLERIA_DEBUG_SEED=1"): copia le demo in persist con il percorso di
 * scrittura di S5a (chunk in ordine → commit del manifest) per esercitare la lettura da persist.
 * =2: riscrive anche se l'album è già popolato (sostituzione = stesse chiavi). Le letture della
 * risorsa a offset crescente costano O(offset) sull'orologio reale (F12): solo emulatore. */
static uint8_t s_seed_buf[GAL_CHUNK_BYTES];

static void prv_seed_demo(void) {
  if (!storage_album_enabled()) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "seed: album disabled (quota %u)", (unsigned)storage_quota());
    return;
  }
  if (GALLERIA_DEBUG_SEED < 2 && storage_valid_slots() > 0) {
    APP_LOG(APP_LOG_LEVEL_INFO, "seed: album already populated (%u slots)", (unsigned)storage_valid_slots());
    return;
  }
  const uint8_t fmt = ui_photo_native_format();
  const uint32_t len = photo_format_length(fmt);
  for (uint8_t d = 0; d < DEMO_COUNT; d++) {
    ResHandle h = resource_get_handle(DEMO_RES[d]);
    if (resource_size(h) != (size_t)len) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "seed: demo %u size %u != %u", (unsigned)d, (unsigned)resource_size(h), (unsigned)len);
      continue;
    }
    time_t s0 = 0;
    uint16_t ms0 = 0;
    time_ms(&s0, &ms0);
    uint32_t crc = 0, off = 0;
    uint16_t i = 0;
    StorageResult r = STORAGE_OK;
    while (off < len) {
      const uint16_t want = (len - off > GAL_CHUNK_BYTES) ? GAL_CHUNK_BYTES : (uint16_t)(len - off);
      if (resource_load_byte_range(h, off, s_seed_buf, want) != (size_t)want) {
        r = STORAGE_ERR;
        break;
      }
      r = storage_write_chunk(d, i, s_seed_buf, want);
      if (r != STORAGE_OK) {
        break;
      }
      crc = crc32_update(crc, s_seed_buf, want);
      off += want;
      i++;
    }
    if (r == STORAGE_OK) {
      r = storage_commit_slot(d, fmt, len, crc, 0xDE300001u + d);
    }
    time_t s1 = 0;
    uint16_t ms1 = 0;
    time_ms(&s1, &ms1);
    APP_LOG(APP_LOG_LEVEL_INFO, "seed: demo %u -> slot %u: %d (%u chunks crc %08x %d ms)",
            (unsigned)d, (unsigned)d, (int)r, (unsigned)i, (unsigned)crc,
            (int)((int32_t)(s1 - s0) * 1000 + ((int32_t)ms1 - (int32_t)ms0)));
  }
}
#endif

/* ---- API ---- */

void model_init(void) {
  GalRotState st;
  if (storage_read_rotstate(&st)) {
    s_shake = (uint16_t)(st.shake_offset % ROT_SHAKE_MOD);
  }
  s_shake_saved = s_shake;
#ifdef GALLERIA_DEBUG_SEED
  prv_seed_demo();
#endif
  prv_time_now();
  prv_update();                          /* silenzioso: ui_time_init farà colore e redraw */
  prv_log_state("init");
  prv_sync_tap();
}

void model_deinit(void) {
  if (s_tap_subscribed) {
    accel_tap_service_unsubscribe();
    s_tap_subscribed = false;
  }
  if (s_shake != s_shake_saved) {        /* unica scrittura dello stato di rotazione: in deinit */
    const GalRotState st = { .shake_offset = s_shake, .crc16 = 0 };
    if (storage_write_rotstate(&st)) {
      s_shake_saved = s_shake;
    }
  }
}

void model_tick(const struct tm *t) {
  prv_note_time(t);
  if (!s_focus) {
    return;                              /* coperta: nessun cambio foto (D10) */
  }
  prv_apply("tick");
}

void model_shake(void) {
  if (!settings_get()->shake_next) {
    return;
  }
  s_shake = (uint16_t)((s_shake + 1u) % ROT_SHAKE_MOD);   /* mcm(1..12): wrap continuo per ogni n */
  if (!s_focus) {
    return;                              /* applicato al ritorno in primo piano */
  }
  prv_apply("shake");
  LOGH("shake");                         /* gate S7: identico dopo ogni scossa (nessuna perdita) */
}

void model_focus(bool in_focus) {
  s_focus = in_focus;
  if (in_focus) {
    prv_apply("focus");                  /* recupera le rotazioni saltate */
  }
}

void model_settings_changed(void) {
  prv_sync_tap();
  if (s_focus) {
    prv_apply("settings");
  }
}

void model_album_changed(void) {
  s_hold = false;                        /* fine sync con manifest cambiato: rilascia l'hold (F1) */
  s_bad_mask = 0;                        /* le foto sono cambiate: ritentare tutto */
  if (s_focus) {
    prv_apply("album");
  }
}

void model_sync_hold(bool on) {
  if (on) {
    s_hold = true;
    return;
  }
  if (s_hold) {
    s_hold = false;
    if (s_focus) {
      prv_apply("sync");                 /* recupera tick/shake/impostazioni accumulati durante la sync */
    }
  }
}

uint8_t model_current_slot(void) {
  return s_slot;
}

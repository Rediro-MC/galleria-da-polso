/* settings.c — vedi settings.h. */
#include <pebble.h>
#include "settings.h"
#include "storage.h"
#include "timefmt.h"
#include "gal_log.h"

static GalSettings s_settings;

_Static_assert(sizeof(GalSettings) == 20, "GalSettings deve essere 20 B (design 4.1)");

void settings_set_defaults(GalSettings *s) {
  if (!s) {
    return;
  }
  *s = (GalSettings) {
    .schema       = GAL_SETTINGS_SCHEMA,
    .layout       = GAL_LAYOUT_A,
    .font         = GAL_FONT_ANTON,
    .clock_mode   = GAL_CLOCK_AUTO,
    .leading_zero = GAL_LZ_AUTO,
    .text_color   = GAL_TEXT_AUTO,
    .outline      = GAL_OUTLINE_AUTO,
    .interval_min = 30,
    .order        = GAL_ORDER_SEQUENTIAL,
    .shake_next   = 1,
    .info_row     = GAL_INFO_STEPS | GAL_INFO_BATTERY | GAL_INFO_DATE | GAL_INFO_BT,
  };
}

static bool prv_interval_valid(uint16_t v) {
  return v == 0 || v == 5 || v == 15 || v == 30 || v == 60 || v == 180 || v == 1440;
}

bool settings_validate(const GalSettings *s) {
  if (!s) {
    return false;
  }
  return s->schema == GAL_SETTINGS_SCHEMA
      && s->layout <= GAL_LAYOUT_B
      && s->font <= GAL_FONT_LECO
      && s->clock_mode <= GAL_CLOCK_24H
      && s->leading_zero <= GAL_LZ_OFF
      && s->text_color <= GAL_TEXT_OXFORD
      && s->outline <= GAL_OUTLINE_NEVER
      && prv_interval_valid(s->interval_min)
      && s->order <= GAL_ORDER_RANDOM
      && s->shake_next <= 1
      && s->info_row <= (GAL_INFO_STEPS | GAL_INFO_BATTERY | GAL_INFO_DATE | GAL_INFO_BT);
}

/* Hook di test (wscript GALLERIA_DEFINES): forzano i valori DOPO la lettura da persist, così gli
 * screenshot dei gate sono riproducibili qualunque cosa sia salvata. Nessun effetto nelle build
 * normali. GALLERIA_DEBUG_SETTINGS_SAVE=1 salva in persist i valori così ottenuti (percorso di
 * settings_apply, come dal telefono); GALLERIA_DEBUG_INTERVAL=1 (minuti, anche fuori dalla lista
 * ammessa) e GALLERIA_DEBUG_ORDER=1 (casuale) valgono solo in RAM e vengono applicati per ultimi. */
static void prv_debug_overrides(void) {
#ifdef GALLERIA_DEBUG_LAYOUT
  s_settings.layout = GALLERIA_DEBUG_LAYOUT;             /* 0 A, 1 B */
#endif
#ifdef GALLERIA_DEBUG_FONT
  s_settings.font = GALLERIA_DEBUG_FONT;                 /* 0 Anton, 1 Bebas, 2 Barlow, 3 LECO */
#endif
#ifdef GALLERIA_DEBUG_TEXT_COLOR
  s_settings.text_color = GALLERIA_DEBUG_TEXT_COLOR;
#endif
#ifdef GALLERIA_DEBUG_OUTLINE
  s_settings.outline = GALLERIA_DEBUG_OUTLINE;
#endif
#ifdef GALLERIA_DEBUG_SETTINGS_SAVE
  {
    GalSettings copy = s_settings;
    const bool applied = settings_apply(&copy);
    LOGV("settings: debug save -> apply=%d", (int)applied);
    (void)applied;
  }
#endif
#ifdef GALLERIA_DEBUG_INTERVAL
  s_settings.interval_min = GALLERIA_DEBUG_INTERVAL;
#endif
#ifdef GALLERIA_DEBUG_ORDER
  s_settings.order = GALLERIA_DEBUG_ORDER;
#endif
}

void settings_init(void) {
  settings_set_defaults(&s_settings);
  GalSettings loaded;
  const bool from_persist = storage_read_settings(&loaded) && settings_validate(&loaded);
  if (from_persist) {
    s_settings = loaded;
  }
  APP_LOG(APP_LOG_LEVEL_INFO, "settings: %s layout=%u font=%u interval=%u order=%u shake=%u",
          from_persist ? "persist" : "defaults", (unsigned)s_settings.layout, (unsigned)s_settings.font,
          (unsigned)s_settings.interval_min, (unsigned)s_settings.order, (unsigned)s_settings.shake_next);
  prv_debug_overrides();
}

const GalSettings *settings_get(void) {
  return &s_settings;
}

bool settings_apply(const GalSettings *s) {
  if (!settings_validate(s)) {
    APP_LOG(APP_LOG_LEVEL_WARNING, "settings: rejected (schema %u interval %u)",
            s ? (unsigned)s->schema : 0u, s ? (unsigned)s->interval_min : 0u);
    return false;
  }
  s_settings = *s;
  storage_settings_changed(&s_settings);   /* debounce 10 s; flush in deinit */
  return true;
}

bool settings_is_24h(void) {
  return timefmt_resolve_24h(s_settings.clock_mode, clock_is_24h_style());
}

bool settings_leading_zero(bool is24h) {
  return timefmt_resolve_leading_zero(s_settings.leading_zero, is24h);
}

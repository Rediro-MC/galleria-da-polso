/* test/shim/ui_fake.c — vedi ui_fake.h. Compilato nei target test_model e test_sync. */
#include <pebble.h>
#include "ui_fake.h"
#include "ui_photo.h"
#include "ui_time.h"
#include "photo_codec.h"

static uint8_t  s_fmt;
static GSize    s_size;
static bool     s_loaded;
static uint16_t s_fail_mask;
static bool     s_resource_ok;

static int      s_persist_calls, s_resource_calls, s_changed_calls;
static int      s_tick_calls, s_layout_calls, s_style_calls, s_full_calls, s_progress_calls;
static int      s_lang_calls, s_lang_order, s_ui_seq;   /* S10: ui_time_lang_changed + ordine fra le notifiche */
static int      s_progress_index, s_progress_count;
static uint8_t  s_last_slot;
static uint16_t s_last_generation;
static uint32_t s_last_resource;

/* ---- ui_photo.h (solo ciò che model.c usa) ---- */

uint8_t ui_photo_native_format(void) {
  return s_fmt;
}

GSize ui_photo_size(void) {
  return s_size;
}

bool ui_photo_is_loaded(void) {
  return s_loaded;
}

bool ui_photo_load_persist(uint8_t slot, const GalSlotMeta *meta) {
  s_persist_calls++;
  s_last_slot = slot;
  s_last_generation = meta ? meta->generation : 0;
  if (s_size.w == 0 || !meta || meta->state != GAL_SLOT_VALID || meta->format != s_fmt
      || meta->length != photo_format_length(s_fmt) || slot >= GAL_MAX_SLOTS) {
    return false;                            /* meta non valido: bitmap intatto (ui_photo.h) */
  }
  if (s_fail_mask & (uint16_t)(1u << slot)) {
    s_loaded = false;                        /* chunk mancante / CRC: bitmap azzerato */
    return false;
  }
  s_loaded = true;
  return true;
}

bool ui_photo_load_resource(uint32_t resource_id) {
  s_resource_calls++;
  s_last_resource = resource_id;
  if (s_size.w == 0 || !s_resource_ok) {
    s_loaded = false;
    return false;
  }
  s_loaded = true;
  return true;
}

/* ---- ui_time.h ---- */

void ui_time_photo_changed(void) {
  s_changed_calls++;
}

/* S7: le ui_time_* usate da sync.c (sync_env_settings_changed / sync_env_progress). Nessun effetto:
 * si contano le chiamate e si registrano gli ultimi argomenti. */

void ui_time_tick(const struct tm *t) {
  s_ui_seq++;
  s_tick_calls++;
}

void ui_time_layout_changed(void) {
  s_ui_seq++;
  s_layout_calls++;
}

void ui_time_style_changed(void) {
  s_ui_seq++;
  s_style_calls++;
}

void ui_time_request_full_redraw(void) {
  s_ui_seq++;
  s_full_calls++;
}

/* S10 (D37): chiamata da sync_env_settings_changed quando cambia GalSettings.lang (sull'orologio ricalcola il
 * separatore delle migliaia, riformatta la data e ridisegna la fascia info). Qui si conta e si annota la
 * posizione fra le notifiche ui_time_* (1 = per prima: il contratto dice "prima dei rami esistenti"). */
void ui_time_lang_changed(void) {
  s_ui_seq++;
  s_lang_calls++;
  if (s_lang_order == 0) {
    s_lang_order = s_ui_seq;
  }
}

void ui_time_set_sync_progress(uint8_t index, uint8_t count) {
  s_progress_calls++;
  s_progress_index = index;
  s_progress_count = count;
}

/* ---- hook ---- */

void shim_ui_reset(void) {
  s_fmt = PHOTO_FMT_RAW6_200x228;
  s_size = GSize(RAW6_W, RAW6_H);
  s_loaded = false;
  s_fail_mask = 0;
  s_resource_ok = true;
  shim_ui_reset_counters();
}

void shim_ui_reset_counters(void) {
  s_persist_calls = 0;
  s_resource_calls = 0;
  s_changed_calls = 0;
  s_last_slot = 0xFF;
  s_last_generation = 0;
  s_last_resource = 0;
  s_tick_calls = 0;
  s_layout_calls = 0;
  s_style_calls = 0;
  s_full_calls = 0;
  s_progress_calls = 0;
  s_progress_index = -1;
  s_progress_count = -1;
  s_lang_calls = 0;
  s_lang_order = 0;
  s_ui_seq = 0;
}

void     shim_ui_set_native_format(uint8_t fmt)        { s_fmt = fmt; }
void     shim_ui_set_size(int16_t w, int16_t h)        { s_size = GSize(w, h); }
void     shim_ui_set_loaded(bool loaded)               { s_loaded = loaded; }
void     shim_ui_set_persist_fail_mask(uint16_t mask)  { s_fail_mask = mask; }
void     shim_ui_set_resource_ok(bool ok)              { s_resource_ok = ok; }
int      shim_ui_persist_calls(void)                   { return s_persist_calls; }
uint8_t  shim_ui_last_slot(void)                       { return s_last_slot; }
uint16_t shim_ui_last_generation(void)                 { return s_last_generation; }
int      shim_ui_resource_calls(void)                  { return s_resource_calls; }
uint32_t shim_ui_last_resource(void)                   { return s_last_resource; }
int      shim_ui_photo_changed(void)                   { return s_changed_calls; }
int      shim_ui_total_calls(void)                     { return s_persist_calls + s_resource_calls + s_changed_calls; }
int      shim_ui_tick_calls(void)                      { return s_tick_calls; }
int      shim_ui_layout_calls(void)                    { return s_layout_calls; }
int      shim_ui_style_calls(void)                     { return s_style_calls; }
int      shim_ui_full_redraw_calls(void)               { return s_full_calls; }
int      shim_ui_progress_calls(void)                  { return s_progress_calls; }
int      shim_ui_progress_index(void)                  { return s_progress_index; }
int      shim_ui_progress_count(void)                  { return s_progress_count; }
int      shim_ui_lang_calls(void)                      { return s_lang_calls; }
int      shim_ui_lang_order(void)                      { return s_lang_order; }
int      shim_ui_time_calls(void)                      { return s_tick_calls + s_layout_calls + s_style_calls + s_full_calls + s_lang_calls; }

/* main.c — Galleria: init/deinit, servizi, tick al minuto. Watchface (nessun click handler). */
#include <pebble.h>
#include "settings.h"
#include "storage.h"
#include "model.h"
#include "ui_photo.h"
#include "ui_time.h"
#include "sync.h"
#include "gal_log.h"

static Window *s_window;

static void prv_log_heap(const char *phase) {
  APP_LOG(APP_LOG_LEVEL_INFO, "heap %s: used=%u free=%u", phase,
          (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
}

/* ---- callback servizi ---- */

static void prv_tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  model_tick(tick_time);                         /* rotazione: foto nuova → ui_time_photo_changed */
  ui_time_tick(tick_time);                       /* un solo render per tick (mark_dirty idempotente) */
}

static void prv_battery_handler(BatteryChargeState state) {
  ui_time_set_battery(state);
}

static void prv_connection_handler(bool connected) {
  ui_time_set_connected(connected);              /* icona barrata, nessuna vibrazione */
}

static void prv_unobstructed_will_change(GRect final_unobstructed_screen_area, void *context) {
  ui_time_request_full_redraw();                 /* riempire tutta la finestra durante l'animazione */
}

static void prv_unobstructed_did_change(void *context) {
  ui_time_unobstructed_changed();                /* layout B: riga singola sotto Quick View (S3) */
}

static void prv_focus_did_change(bool in_focus) {
  model_focus(in_focus);                         /* niente rotazione mentre è coperta; recupero al ritorno */
  if (in_focus) {
    ui_time_request_full_redraw();               /* il framebuffer potrebbe non essere nostro */
  }
}

/* ---- finestra ---- */

static void prv_window_load(Window *window) {
  ui_time_init(window);
  prv_log_heap("window_load");

  time_t now = time(NULL);
  struct tm *t = localtime(&now);
  if (t) {
    ui_time_tick(t);
  }
}

static void prv_window_unload(Window *window) {
  ui_time_deinit();
}

/* ---- ciclo di vita ---- */

static void prv_init(void) {
  prv_log_heap("main");                           /* baseline del sistema prima di ogni allocazione nostra */
  ui_photo_init();                                /* il blocco più grande, per primo (regola 13) */
  setlocale(LC_ALL, "");                          /* %a / %b localizzati in strftime */
  storage_init();                                 /* quota, schema, manifest */
  settings_init();                                /* default → persist → hook di debug */
  model_init();                                   /* prima foto (persist o demo) prima della finestra */

  s_window = window_create();
  if (!s_window) {
    return;
  }
  window_set_background_color(s_window, GColorClear);   /* repaint mirato: nessun clear di sistema */
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load,
    .unload = prv_window_unload,
  });
  window_stack_push(s_window, false);

  tick_timer_service_subscribe(MINUTE_UNIT, prv_tick_handler);
  battery_state_service_subscribe(prv_battery_handler);
  connection_service_subscribe((ConnectionHandlers) {
    .pebble_app_connection_handler = prv_connection_handler,
  });
  unobstructed_area_service_subscribe((UnobstructedAreaHandlers) {
    .will_change = prv_unobstructed_will_change,
    .did_change = prv_unobstructed_did_change,
  }, NULL);
  app_focus_service_subscribe_handlers((AppFocusHandlers) {
    .did_focus = prv_focus_did_change,
  });
  LOGH("services");                               /* sonda dei ~2 KB dei servizi (PIANO §7 S4) */

  sync_init();                                    /* S5a: AppMessage (inbox unica 4.153 B) dopo finestra e servizi */
  prv_log_heap("init");
}

static void prv_deinit(void) {
  sync_deinit();                                  /* timer e callback AppMessage per primi */
  app_focus_service_unsubscribe();
  unobstructed_area_service_unsubscribe();
  connection_service_unsubscribe();
  battery_state_service_unsubscribe();
  tick_timer_service_unsubscribe();
  LOGH("unsub");

  model_deinit();                                 /* tap service; GalRotState se cambiato */
  storage_flush();                                /* impostazioni pendenti (debounce) */
  if (s_window) {
    window_destroy(s_window);
    s_window = NULL;
  }
  ui_photo_deinit();
  prv_log_heap("deinit");
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
  return 0;
}

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
static time_t s_start;                            /* S8: uptime nelle righe "batt:" */

static void prv_log_heap(const char *phase) {
  APP_LOG(APP_LOG_LEVEL_INFO, "heap %s: used=%u free=%u", phase,
          (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
}

/* S8: curva di scarica sull'orologio reale. Evento raro (gradini del 10 %, carica): una riga per evento. */
static void prv_log_battery(BatteryChargeState st) {
  const time_t now = time(NULL);
  const unsigned up_min = (now > s_start) ? (unsigned)((now - s_start) / 60) : 0u;
  APP_LOG(APP_LOG_LEVEL_INFO, "batt: %u%% chg=%d plug=%d up %u min", (unsigned)st.charge_percent,
          (int)st.is_charging, (int)st.is_plugged, up_min);
}

/* ---- callback servizi ---- */

static void prv_tick_handler(struct tm *tick_time, TimeUnits units_changed) {
  model_tick(tick_time);                         /* rotazione: foto nuova → ui_time_photo_changed */
  ui_time_tick(tick_time);                       /* un solo render per tick (mark_dirty idempotente) */
  LOGH("tick");                                  /* S8: heap a regime, una riga al minuto (solo build di misura) */
}

static void prv_battery_handler(BatteryChargeState state) {
  prv_log_battery(state);
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
  TMR(t_tot);                                     /* build M: `init:` a fine funzione */
  s_start = time(NULL);
  prv_log_heap("main");                           /* baseline del sistema prima di ogni allocazione nostra */
  {                                               /* S8: firmware e modello reali (D5), una riga per avvio */
    const WatchInfoVersion v = watch_info_get_firmware_version();
    APP_LOG(APP_LOG_LEVEL_INFO, "watch: fw %u.%u.%u model=%u", (unsigned)v.major, (unsigned)v.minor,
            (unsigned)v.patch, (unsigned)watch_info_get_model());
  }
  prv_log_battery(battery_state_service_peek());
  ui_photo_init();                                /* il blocco più grande, per primo (regola 13) */
  setlocale(LC_ALL, "");                          /* %a / %b localizzati in strftime */
  TMR(t_sto);
  storage_init();                                 /* quota, schema, manifest (apre il file persist: 2 scansioni) */
#ifdef GALLERIA_DEBUG_TIMING
  const int ms_sto = TMR_MS(t_sto);
#endif
  TMR(t_set);
  settings_init();                                /* default → manifest → hook di debug (nessuna persist) */
#ifdef GALLERIA_DEBUG_TIMING
  const int ms_set = TMR_MS(t_set);
#endif
  TMR(t_mod);
  model_init();                                   /* prima foto (persist o demo) prima della finestra */
#ifdef GALLERIA_DEBUG_TIMING
  const int ms_mod = TMR_MS(t_mod);
#endif

  TMR(t_win);
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
#ifdef GALLERIA_DEBUG_TIMING
  const int ms_win = TMR_MS(t_win);              /* window_load: layout, strip, prima ui_time_tick */
#endif

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

  TMR(t_syn);
  sync_init();                                    /* S5a: AppMessage (inbox unica 4.153 B) dopo finestra e servizi */
#ifdef GALLERIA_DEBUG_TIMING
  const int ms_syn = TMR_MS(t_syn);              /* chiuso PRIMA del log heap (F24: il log non entra in syn) */
#endif
  prv_log_heap("init");
#ifdef GALLERIA_DEBUG_TIMING
  /* S8 perf: quanto costa l'avvio e dove (open = apertura del file persist da parte del firmware +
   * ricerca della chiave 0, la cui posizione dipende dalla storia del file; man = ricerca del manifest;
   * il primo render vero e' nella riga `draw:` di ui_time). */
  APP_LOG(APP_LOG_LEVEL_INFO, "init: open=%d man=%d sto=%d set=%d mod=%d win=%d syn=%d tot=%d ms",
          storage_debug_ms(0), storage_debug_ms(1), ms_sto, ms_set, ms_mod, ms_win, ms_syn, TMR_MS(t_tot));
#endif
}

static void prv_deinit(void) {
  TMR(t_tot);                                     /* build M: `deinit:` in fondo */
  sync_deinit();                                  /* timer e callback AppMessage per primi */
  app_focus_service_unsubscribe();
  unobstructed_area_service_unsubscribe();
  connection_service_unsubscribe();
  battery_state_service_unsubscribe();
  tick_timer_service_unsubscribe();
  LOGH("unsub");

  TMR(t_mod);
  model_deinit();                                 /* tap service (nessuna scrittura persist: perf 04/09) */
#ifdef GALLERIA_DEBUG_TIMING
  const int ms_mod = TMR_MS(t_mod);
#endif
  TMR(t_fl);
  storage_flush();                                /* solo impostazioni pendenti (debounce); mai lo shake */
#ifdef GALLERIA_DEBUG_TIMING
  const int ms_fl = TMR_MS(t_fl);
#endif
  TMR(t_win);
  if (s_window) {
    window_destroy(s_window);
    s_window = NULL;
  }
  ui_photo_deinit();
#ifdef GALLERIA_DEBUG_TIMING
  const int ms_win = TMR_MS(t_win);
#endif
  prv_log_heap("deinit");
#ifdef GALLERIA_DEBUG_TIMING
  APP_LOG(APP_LOG_LEVEL_INFO, "deinit: mod=%d fl=%d win=%d tot=%d ms", ms_mod, ms_fl, ms_win, TMR_MS(t_tot));
#endif
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
  return 0;
}

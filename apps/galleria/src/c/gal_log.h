/* gal_log.h — log di produzione vs diagnostica (regola 11). Header puro.
 * Produzione (APP_LOG, sempre): una riga per fase/evento — heap main/init/window_load/deinit e
 * "after first render", storage/settings/ui_time/sync all'init, un rigo per messaggio di controllo
 * della sync, uno per foto ricevuta (END), uno per foto caricata da persist, uno per cambio foto
 * (rot), uno per decisione di colore (luma), tutti gli ERROR/WARNING. Formati ≤ 80 caratteri: il
 * firmware tronca a ~100 con il prefisso file:riga.
 * LOGV (solo GALLERIA_LOG_VERBOSE): diagnostica del gate — chunk, risorse, strip, bt.
 * LOGH (solo GALLERIA_DEBUG_HEAP): sonda dell'heap in un punto (services/unsub/qv/shake/sync_end).
 * TMR/TMR_MS (solo GALLERIA_DEBUG_TIMING): cronometri per le righe `init:`/`deinit:` di main.c (S8 perf).
 * Build: GALLERIA_DEFINES="GALLERIA_LOG_VERBOSE=1 GALLERIA_DEBUG_HEAP=1 GALLERIA_DEBUG_TIMING=1" pebble build */
#ifndef GALLERIA_GAL_LOG_H
#define GALLERIA_GAL_LOG_H

#include <pebble.h>
#ifdef GALLERIA_LOG_VERBOSE
#define LOGV(fmt, ...) APP_LOG(APP_LOG_LEVEL_INFO, fmt, ##__VA_ARGS__)   /* diagnostica del gate: chunk, risorse, strip */
#else
#define LOGV(fmt, ...) ((void)0)
#endif
#ifdef GALLERIA_DEBUG_HEAP
#define LOGH(phase) APP_LOG(APP_LOG_LEVEL_INFO, "heap %s: used=%u free=%u", (phase), (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free())
#else
#define LOGH(phase) ((void)0)
#endif

/* TMR (solo GALLERIA_DEBUG_TIMING, S8 perf): cronometro locale con time_ms, mai negativo
 * (pypkjs risincronizza l'orologio di ±1 s). `TMR(t);` dichiara e avvia; `TMR_MS(t)` = ms trascorsi.
 * Nella build P le macro spariscono: usare TMR_MS solo dentro #ifdef GALLERIA_DEBUG_TIMING. */
#ifdef GALLERIA_DEBUG_TIMING
typedef struct { time_t s; uint16_t ms; } GalTmr;
static inline void gal_tmr_start(GalTmr *t) { time_ms(&t->s, &t->ms); }
static inline int gal_tmr_ms(const GalTmr *t) {
  time_t s1 = 0;
  uint16_t ms1 = 0;
  time_ms(&s1, &ms1);
  const int32_t d = (int32_t)(s1 - t->s) * 1000 + ((int32_t)ms1 - (int32_t)t->ms);
  return d < 0 ? 0 : (int)d;
}
#define TMR(name) GalTmr name; gal_tmr_start(&name)
#define TMR_MS(name) gal_tmr_ms(&name)
#else
#define TMR(name) ((void)0)
#define TMR_MS(name) 0
#endif

#endif /* GALLERIA_GAL_LOG_H */

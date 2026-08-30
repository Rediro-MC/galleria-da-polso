/* gal_log.h — log di produzione vs diagnostica (regola 11). Header puro.
 * Produzione (APP_LOG, sempre): una riga per fase/evento — heap main/init/window_load/deinit e
 * "after first render", storage/settings/ui_time/sync all'init, un rigo per messaggio di controllo
 * della sync, uno per foto ricevuta (END), uno per foto caricata da persist, uno per cambio foto
 * (rot), uno per decisione di colore (luma), tutti gli ERROR/WARNING. Formati ≤ 80 caratteri: il
 * firmware tronca a ~100 con il prefisso file:riga.
 * LOGV (solo GALLERIA_LOG_VERBOSE): diagnostica del gate — chunk, risorse, strip, bt.
 * LOGH (solo GALLERIA_DEBUG_HEAP): sonda dell'heap in un punto (services/unsub/qv/shake/sync_end).
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

#endif /* GALLERIA_GAL_LOG_H */

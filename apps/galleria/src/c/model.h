/* model.h — stato in RAM dell'album: quale foto è mostrata e perché (design D10, PIANO S4).
 * Slot = rotation_slot(minuti locali, manifest, impostazioni, shake) ricalcolato al tick al minuto
 * e caricato SOLO se cambia (una lettura persist per intervallo, mai per tick); album vuoto / slot
 * illeggibili → foto demo da risorsa, ruotate con la stessa regola. Shake (accel_tap_service) =
 * offset in RAM (+1), persistito solo in deinit (chiave 2); niente cambio foto mentre la watchface è
 * coperta (app_focus_service): si recupera al ritorno in primo piano. Stessa regola durante una sync
 * (model_sync_hold, F1): il manifest in RAM cambia già al PHOTO_BEGIN, quindi la rotazione è congelata
 * e applicata al rilascio (fine sync o timeout). Ogni cambio foto notifica ui_time_photo_changed()
 * (colore a freddo + redraw completo). */
#ifndef GALLERIA_MODEL_H
#define GALLERIA_MODEL_H

#include <pebble.h>
#include "gal_types.h"

/* Dopo storage_init/settings_init e PRIMA della finestra: carica la prima foto in silenzio
 * (ui_time_init calcola colore e redraw). Iscrive il tap service se shake_next è attivo. */
void model_init(void);
/* Disiscrive il tap service; salva GalRotState se lo shake è cambiato. */
void model_deinit(void);

/* Tick al minuto (dal tick handler, prima di ui_time_tick). */
void model_tick(const struct tm *t);
/* Scossa: foto successiva (se shake_next). Chiamata dal tap handler interno. */
void model_shake(void);
/* app_focus did_focus: false = coperta (nessuna rotazione), true = recupero. */
void model_focus(bool in_focus);
/* S5a/S6: intervallo/ordine/shake cambiati → tap service e slot ricalcolati. */
void model_settings_changed(void);
/* S5a: manifest cambiato (foto nuova/eliminata/riordinata) → slot ricalcolato e ricaricato.
 * Rilascia anche l'hold di sync (è la notifica di fine sync quando il manifest è cambiato). */
void model_album_changed(void);
/* F1: sync attiva (on = true): la rotazione non tocca il bitmap né legge persist; tick/shake/focus/
 * impostazioni aggiornano solo lo stato e vengono applicati al rilascio (come fuori focus, D10).
 * on = false: se era in hold, ricalcola e ricarica subito (log "rot(sync)"), solo se in focus.
 * Chiamata da sync.c dopo ogni messaggio (true in SYNCING) e a fine sync/timeout (false). */
void model_sync_hold(bool on);
/* Slot persist mostrato, GAL_SLOT_NONE se è una demo. */
uint8_t model_current_slot(void);

#endif /* GALLERIA_MODEL_H */

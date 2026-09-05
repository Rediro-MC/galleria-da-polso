/* ui_time.h — layer dell'ora (layout A, docs/design/galleria.md §3.1) + riga info sopra la foto.
 * Un solo Layer con update_proc; ridisegno mirato: al tick solo la fascia dinamica
 * (y < band_h: sub-bitmap della foto + testo), foto intera solo quando richiesto (primo render,
 * cambio foto, Quick View, focus). Colore testo automatico (luma.c) + alone opzionale (S2). */
#ifndef GALLERIA_UI_TIME_H
#define GALLERIA_UI_TIME_H

#include <pebble.h>

/* Da chiamare in window_load: crea il layer, sceglie i font, calcola il layout. */
void ui_time_init(Window *window);
/* Da chiamare in window_unload: distrugge tutto ciò che ui_time_init ha creato. */
void ui_time_deinit(void);

/* Tick al minuto (o aggiornamento iniziale): riformatta i testi, rilegge i passi,
 * riposiziona la riga info e chiama layer_mark_dirty() UNA volta. */
void ui_time_tick(const struct tm *t);

/* Eventi rari (nessuna vibrazione): aggiornano lo stato e ridisegnano la fascia. */
void ui_time_set_battery(BatteryChargeState state);
void ui_time_set_connected(bool connected);

/* Il prossimo render ridisegna tutto lo schermo (Quick View, focus riacquisito). */
void ui_time_request_full_redraw(void);

/* Colore automatico del testo (luma.c sulla fascia dinamica, una volta: mai nel tick) + redraw
 * completo. Tutte valide solo dopo ui_time_init().
 *  - ui_time_photo_changed(): la foto è cambiata → decisione a freddo (luma_reset), come
 *    photo_prep.py --stats. S4 la chiama a ogni rotazione.
 *  - ui_time_band_changed(): stessa foto, fascia diversa (S3: layout B / Quick View) → isteresi
 *    di 10 punti per evitare il flip del colore a ogni peek (D7).
 *  - ui_time_style_changed(): sono cambiate solo le impostazioni colore/contorno (S6). */
void ui_time_photo_changed(void);
void ui_time_band_changed(void);
void ui_time_style_changed(void);

/* S3: l'area non ostruita è cambiata (unobstructed did_change): nel layout B passa alla riga
 * singola con la strip A e viceversa (fascia e colore ricalcolati); nel layout A solo redraw.
 * S7 (D16): nel layout B la strip A viene caricata QUI all'inizio della Quick View (una
 * gbitmap_create_with_resource, ≈ 7,5 KB dalla flash, evento raro fuori dal tick) e scaricata al
 * did_change che la chiude; se l'heap non basta si ripiega sull'ora intera in LECO. Le allocazioni
 * delle strip avvengono solo in window_load, in ui_time_layout_changed e qui: mai in update_proc. */
void ui_time_unobstructed_changed(void);
/* S3/S6: sono cambiati layout o font nelle impostazioni: ricarica le strip e rifà il layout. */
void ui_time_layout_changed(void);

/* S5a: avanzamento della sync nella riga info ("Foto index/count" al posto di passi/icona BT;
 * "Foto index" se count è 0). index 0 = sync finita: torna la riga normale. Layout A: nella riga info.
 * Layout B (R10, deroga a D13 per la sola durata della sync): "Foto k/n" in Gothic 14 Bold in basso a sinistra
 * della fascia MM, 2 righe sotto il "PM"; niente in Quick View (riga singola); index 0 → la fascia ridisegnata
 * lo cancella. Ridisegna la sola fascia. Valida anche prima di ui_time_init. */
void ui_time_set_sync_progress(uint8_t index, uint8_t count);

/* Altezza della fascia dinamica (per S2: sub-bitmap della foto). Valida SOLO dopo ui_time_init()
 * (window_load): prima vale 0. Le allocazioni grandi di init() (GBitmap foto a schermo intero)
 * non devono dipendere da questo valore. */
int16_t ui_time_band_height(void);

#endif /* GALLERIA_UI_TIME_H */

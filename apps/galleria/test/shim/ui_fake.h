/* test/shim/ui_fake.h — hook dei finti ui_photo_x / ui_time_x di ui_fake.c (test_model.c, test_sync.c).
 * ui_fake.c implementa SOLO le funzioni di ui_photo.h/ui_time.h che model.c e sync.c chiamano:
 *   ui_photo_native_format, ui_photo_size, ui_photo_is_loaded, ui_photo_load_persist,
 *   ui_photo_load_resource, ui_time_photo_changed e (S7, per sync.c) ui_time_tick,
 *   ui_time_layout_changed, ui_time_style_changed, ui_time_request_full_redraw,
 *   ui_time_set_sync_progress e (S10, D37) ui_time_lang_changed.
 * Contratto riprodotto (ui_photo.h): load_persist ritorna false SENZA toccare il bitmap se meta non è
 * VALID nel formato nativo con la lunghezza attesa; con lo slot nella maschera di guasto ritorna
 * false E azzera il bitmap (chunk mancante / CRC, come sull'orologio); altrimenti true e bitmap
 * caricato. load_resource: true e bitmap caricato, oppure (shim_ui_set_resource_ok(false)) false e
 * bitmap azzerato. Nessun byte viene letto o decodificato: si registrano solo le chiamate. */
#ifndef GALLERIA_TEST_SHIM_UI_FAKE_H
#define GALLERIA_TEST_SHIM_UI_FAKE_H

#include <stdbool.h>
#include <stdint.h>

/* Stato iniziale: raw6, 200×228, bitmap NON caricato, nessun guasto, contatori a zero. */
void     shim_ui_reset(void);
/* Azzera solo i contatori e gli "ultimi" (slot/generation/risorsa), non lo stato del bitmap. */
void     shim_ui_reset_counters(void);

void     shim_ui_set_native_format(uint8_t fmt);
void     shim_ui_set_size(int16_t w, int16_t h);        /* 0×0 = bitmap mancante (heap insufficiente) */
void     shim_ui_set_loaded(bool loaded);
void     shim_ui_set_persist_fail_mask(uint16_t mask);  /* bit k: load_persist(k) fallisce e azzera il bitmap */
void     shim_ui_set_resource_ok(bool ok);

int      shim_ui_persist_calls(void);
uint8_t  shim_ui_last_slot(void);                       /* 0xFF se nessuna load_persist dal reset */
uint16_t shim_ui_last_generation(void);                 /* meta->generation dell'ultima load_persist */
int      shim_ui_resource_calls(void);
uint32_t shim_ui_last_resource(void);                   /* 0 se nessuna load_resource dal reset */
int      shim_ui_photo_changed(void);                   /* chiamate a ui_time_photo_changed */

/* S7 (test_sync.c): contatori delle ui_time_* chiamate da sync_env_settings_changed/progress.
 * shim_ui_reset/shim_ui_reset_counters li azzerano insieme agli altri. */
int      shim_ui_tick_calls(void);
int      shim_ui_layout_calls(void);
int      shim_ui_style_calls(void);
int      shim_ui_full_redraw_calls(void);
int      shim_ui_progress_calls(void);
int      shim_ui_progress_index(void);                  /* -1 se nessuna chiamata dal reset */
int      shim_ui_progress_count(void);                  /* -1 se nessuna chiamata dal reset */
/* S10 (D37): chiamate a ui_time_lang_changed (sync_env_settings_changed con GalSettings.lang diverso). */
int      shim_ui_lang_calls(void);
/* Posizione (1 = per prima) della PRIMA chiamata a ui_time_lang_changed fra le notifiche ui_time_*
 * (tick/layout/style/full_redraw/lang) dal reset; 0 se non e' stata chiamata. Pinna il contratto D37
 * "prima dei rami esistenti" di sync_env_settings_changed. */
int      shim_ui_lang_order(void);
/* Somma delle ui_time_* di stile/layout/tick/redraw/lang (S10): utile per "nessuna notifica alla UI". */
int      shim_ui_time_calls(void);
/* Somma delle chiamate che toccano il bitmap o la UI (persist + resource + photo_changed): deve
 * restare ferma durante un hold di sync (F1). */
int      shim_ui_total_calls(void);

#endif /* GALLERIA_TEST_SHIM_UI_FAKE_H */

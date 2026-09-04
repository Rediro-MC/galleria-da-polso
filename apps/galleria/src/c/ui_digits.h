/* ui_digits.h — cifre grandi come sprite 2BitPalette (design D3, D20, §7): una "strip" per (font, taglia)
 * con 11 glifi ('0'..'9', ':') generata da tools/gen_digits.py v2 (metriche in digit_metrics.h).
 * QUATTRO indici di palette, riconosciuti dal COLORE del PNG al caricamento (l'SDK genera la palette
 * del .pbi in ordine arbitrario): 0xFF bianco = RIEMPIMENTO, 0xC0 nero = ANELLO (contorno spesso
 * `ring` px), 0xF0 rosso = OMBRA 3D (`shadow` px in basso a destra), alpha 0 = trasparente.
 * A runtime ogni indice riceve un colore o GColorClear (ui_digits_set_palette): pieno, trasparente,
 * con o senza ombra sono la STESSA strip (S8-stile, D20/D21). Un solo blit per glifo (GCompOpSet),
 * poi il compositing torna a GCompOpAssign. Due taglie possono essere caricate insieme (layout B: la A
 * solo mentre la Quick View è attiva, caricata al did_change e scaricata quando finisce — D16, S7).
 * Allocazioni solo in ui_digits_load (window_load, cambio impostazione, did_change dell'area non
 * ostruita), mai in update_proc: strip + UNA sub-bitmap per taglia, riposizionata sul glifo con
 * gbitmap_set_bounds prima di ogni blit (revisione S8-stile: −10 GBitmap in heap per taglia). Un glifo
 * con ink[g].w == 0 nelle metriche (S7: taglia B senza la cella del ':') è ASSENTE: ui_digits_draw non
 * disegna nulla e ui_digits_ink_width ritorna 0.
 * L'indice di strip NON è il valore dell'impostazione `font`: è gal_font_strip(font) (settings.h, D22). */
#ifndef GALLERIA_UI_DIGITS_H
#define GALLERIA_UI_DIGITS_H

#include <pebble.h>
#include "digit_metrics.h"

enum { DIGITS_SIZE_A = 0, DIGITS_SIZE_B = 1, DIGITS_SIZES = 2 };
#define DIGITS_GLYPH_COLON 10          /* glifi 0..9 = cifre, 10 = ':' */
/* Numero di strip generate (righe di DIGITS_METRICS): indice 0..DIGITS_STRIPS-1 = gal_font_strip(font). */
#define DIGITS_STRIPS ((uint8_t)DIGITS_FONT_COUNT)

/* Carica la strip (indice 0..DIGITS_STRIPS-1) nella taglia data; sostituisce quella eventualmente
 * caricata. false = indice fuori intervallo o risorsa/heap/palette non validi: in ogni caso la
 * taglia resta "non caricata" (chiamante: fallback LECO). */
bool ui_digits_load(uint8_t size, uint8_t strip);
void ui_digits_unload(uint8_t size);
void ui_digits_unload_all(void);
bool ui_digits_is_loaded(uint8_t size);
/* Strip attualmente caricata nella taglia (valido solo se is_loaded). */
uint8_t ui_digits_strip(uint8_t size);

/* Metriche della strip caricata (NULL se non caricata). */
const DigitStripMetrics *ui_digits_metrics(uint8_t size);
/* Larghezza dell'inchiostro (anello e ombra compresi) del glifo; 0 se non caricata. */
int16_t ui_digits_ink_width(uint8_t size, uint8_t glyph);
/* Larghezza del solo RIEMPIMENTO (inchiostro − 2·ring − shadow, ≥ 1 se il glifo esiste): è la misura con
 * cui ui_time.c allarga il passo di cella (D25: anello e ombra possono sovrapporsi ai vicini). 0 se assente. */
int16_t ui_digits_fill_width(uint8_t size, uint8_t glyph);
/* Altezza della strip (0 se non caricata). */
int16_t ui_digits_height(uint8_t size);

/* Scrive la palette: riempimento, anello, ombra (ognuno può essere GColorClear). La strip senza il
 * colore dell'ombra (shadow == 0) ignora il terzo. */
void ui_digits_set_palette(uint8_t size, GColor fill, GColor ring, GColor shadow);

/* Disegna il glifo con il NUCLEO dell'inchiostro (riempimento + anello, cioè w − shadow) centrato
 * orizzontalmente nella cella [x, x + advance) — l'ombra sporge a destra — e la riga 0 della strip a y
 * (in update_proc). Nessun effetto se la taglia non è caricata. */
void ui_digits_draw(GContext *ctx, uint8_t size, uint8_t glyph, int16_t x, int16_t y, int16_t advance);

#endif /* GALLERIA_UI_DIGITS_H */

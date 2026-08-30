/* ui_digits.h — cifre grandi come sprite 2BitPalette (design D3, §7): una "strip" per (font, taglia)
 * con 11 glifi ('0'..'9', ':') generata da tools/gen_digits.py (metriche in digit_metrics.h).
 * Palette della strip a runtime: indice del RIEMPIMENTO (bianco nel PNG) = colore del testo, indice
 * del CONTORNO (nero nel PNG) = colore dell'alone o GColorClear; indice trasparente = 0 alpha.
 * L'SDK genera la palette del .pbi in ordine arbitrario: gli indici vengono riconosciuti dal
 * colore (0xFF bianco, 0xC0 nero) al caricamento. Un solo blit per glifo (GCompOpSet), poi il
 * compositing torna a GCompOpAssign. Due taglie possono essere caricate insieme (layout B: la A
 * solo mentre la Quick View è attiva, caricata al did_change e scaricata quando finisce — D16, S7).
 * Allocazioni solo in ui_digits_load (window_load, cambio impostazione, did_change dell'area non
 * ostruita), mai in update_proc: strip + una sub-bitmap per glifo presente. Un glifo con
 * ink[g].w == 0 nelle metriche (S7: taglia B senza la cella del ':') è ASSENTE: nessuna sub-bitmap,
 * ui_digits_draw non disegna nulla e ui_digits_ink_width ritorna 0. */
#ifndef GALLERIA_UI_DIGITS_H
#define GALLERIA_UI_DIGITS_H

#include <pebble.h>
#include "digit_metrics.h"

enum { DIGITS_SIZE_A = 0, DIGITS_SIZE_B = 1, DIGITS_SIZES = 2 };
#define DIGITS_GLYPH_COLON 10          /* glifi 0..9 = cifre, 10 = ':' */
/* Numero di font sprite: deriva dalla tabella generata (0..DIGITS_FONTS-1; GAL_FONT_LECO deve valere DIGITS_FONTS). */
#define DIGITS_FONTS ((uint8_t)(sizeof(DIGITS_METRICS) / sizeof(DIGITS_METRICS[0])))

/* Carica la strip (font 0..DIGITS_FONTS-1) nella taglia data; sostituisce quella eventualmente
 * caricata. false = font fuori intervallo o risorsa/heap/palette non validi: in ogni caso la
 * taglia resta "non caricata" (chiamante: fallback LECO). */
bool ui_digits_load(uint8_t size, uint8_t font);
void ui_digits_unload(uint8_t size);
void ui_digits_unload_all(void);
bool ui_digits_is_loaded(uint8_t size);
/* Font attualmente caricato nella taglia (valido solo se is_loaded). */
uint8_t ui_digits_font(uint8_t size);

/* Metriche della strip caricata (NULL se non caricata). */
const DigitStripMetrics *ui_digits_metrics(uint8_t size);
/* Larghezza dell'inchiostro (contorno compreso) del glifo; 0 se non caricata. */
int16_t ui_digits_ink_width(uint8_t size, uint8_t glyph);
/* Altezza della strip (0 se non caricata). */
int16_t ui_digits_height(uint8_t size);

/* Scrive la palette: riempimento, contorno (GColorClear se outline_on == false). */
void ui_digits_set_colors(uint8_t size, GColor fill, GColor outline, bool outline_on);

/* Disegna il glifo con l'inchiostro centrato orizzontalmente nella cella [x, x + advance) e la
 * riga 0 della strip a y (in update_proc). Nessun effetto se la taglia non è caricata. */
void ui_digits_draw(GContext *ctx, uint8_t size, uint8_t glyph, int16_t x, int16_t y, int16_t advance);

#endif /* GALLERIA_UI_DIGITS_H */

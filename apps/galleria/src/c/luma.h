/* luma.h — colore automatico del testo sulla fascia dell'ora (docs/design/galleria.md D7 / §7;
 * docs/ricerca/galleria/05-colore-quantizzazione.md §3). Modulo PURO: nessun pebble.h, i pixel
 * arrivano come byte del GBitmap (test host in test/test_luma.c con immagini sintetiche).
 *
 * Regola (emery, 8Bit): Y = LUMA_SUN[GColor8 & 0x3F] (resa "sunlight" del pannello, 0..255);
 * bad_white = % pixel con Y > 77 (bianco sotto 3:1), bad_black = % pixel con Y < 25;
 * si vuole bianco se bad_white < bad_black, a parità se Y medio < 46; con un risultato precedente
 * valido (stessa foto rivalutata su un'altra fascia: layout, Quick View) il colore cambia solo con
 * un vantaggio ≥ 10 punti (isteresi); a ogni foto nuova il chiamante fa luma_reset (decisione a
 * freddo); contorno se bad_pct > 15 %. flint (1BitPalette): bianco se la maggioranza dei pixel è
 * nera (stessa isteresi); contorno sempre; parità 50/50 → media 127 → nero.
 * Fascia usata dall'app: tutta la fascia dinamica (cifre + riga info: 200×106, 110 con ExtraLarge,
 * 144×76 su flint). Campionamento 1 px su 2 in x e y (5.300 letture per 200×106): < 1 ms, una
 * volta per foto/fascia. */
#ifndef GALLERIA_LUMA_H
#define GALLERIA_LUMA_H

#include <stdbool.h>
#include <stdint.h>

#define LUMA_Y_WHITE_BAD  77    /* Y > 77: testo bianco sotto 3:1 (WCAG) */
#define LUMA_Y_BLACK_BAD  25    /* Y < 25: testo nero sotto 3:1 */
#define LUMA_Y_CROSSOVER  46    /* Y = 0,179: bianco e nero hanno lo stesso contrasto */
#define LUMA_HYSTERESIS   10    /* punti % di vantaggio necessari per cambiare colore */
#define LUMA_HALO_PCT     15    /* > 15 % di pixel in conflitto → contorno consigliato */

typedef struct { int16_t x, y, w, h; } LumaRect;   /* in coordinate del bitmap */

typedef struct {
  bool    valid;       /* almeno un campione letto (false dopo luma_reset: nessuna isteresi) */
  bool    white;       /* colore corrente del testo (true = bianco) */
  bool    halo;        /* contorno consigliato per il colore corrente */
  uint8_t bad_pct;     /* % pixel in conflitto con il colore corrente (0..100) */
  uint8_t bad_white;   /* % pixel ostili al bianco (Y > 77)   [diagnostica/log] */
  uint8_t bad_black;   /* % pixel ostili al nero  (Y < 25) */
  uint8_t mean;        /* Y medio 0..255 dei campioni */
} LumaResult;

/* Y (0..255, lineare WCAG) della resa "sunlight" dei 64 colori; indice = GColor8 & 0x3F. */
extern const uint8_t LUMA_SUN[64];

/* white = true, halo = false, valid = false, percentuali 0. */
void luma_reset(LumaResult *r);

/* 8Bit: 1 byte GColor8 per pixel; data = riga 0, stride = byte per riga; band ritagliata a
 * w,h ≥ 0 dal chiamante (x,y ≥ 0). Aggiorna r in place applicando l'isteresi rispetto a r->white
 * se r->valid, altrimenti prende la decisione diretta. Con band vuota lascia r invariato
 * (valid resta com'è) e azzera solo bad_pct/halo. */
void luma_compute_8bit(const uint8_t *data, uint16_t stride, LumaRect band, LumaResult *r);

/* 1BitPalette MSB-first (pixel x nel bit 0x80 >> (x & 7) del byte x/8; bit 1 = bianco).
 * bad_white = % pixel bianchi, bad_black = % pixel neri, mean = bianchi × 255 / campioni,
 * halo sempre true (design §3.3), stessa isteresi. */
void luma_compute_1bit(const uint8_t *data, uint16_t stride, LumaRect band, LumaResult *r);

#endif /* GALLERIA_LUMA_H */

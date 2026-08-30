/* digit_metrics.h — GENERATO da tools/gen_digits.py (v1): non modificare.
 * Rigenerare con:
 *   ~/.local/share/uv/tools/pebble-tool/bin/python tools/gen_digits.py \
 *       --fonts-dir apps/galleria/resources/fonts \
 *       --out apps/galleria/resources/digits \
 *       --header apps/galleria/src/c/digit_metrics.h \
 *       --fit-width --no-colon-b --pack
 *
 * Segnalazioni della generazione:
 *   NOTA   barlow emery A     altezza ottenuta 61 px su 66 disponibili (-5): digit_h = 61
 *   AVVISO barlow emery A     layout 12 h (celle 38 cifre / 16 il ':'): glifi più larghi della cella: '4' 40>38
 *   NOTA   barlow emery B     altezza ottenuta 93 px su 94 disponibili (-1): digit_h = 93
 *   NOTA   barlow flint A     altezza ottenuta 40 px su 42 disponibili (-2): digit_h = 40
 *   AVVISO barlow flint A     layout 12 h (celle 26 cifre / 12 il ':'): glifi più larghi della cella: '4' 28>26
 *
 * Strip COMPATTA (--pack): i glifi stanno adiacenti da sinistra a destra nell'ordine
 * '0'..'9' (la taglia A chiude con ':'), senza celle vuote: si ritagliano SOLO con
 * ink[k].x/ink[k].w, che è quello che fa ui_digits.c. strip_w = somma degli inchiostri
 * arrotondata al multiplo di 4 px superiore: le colonne in coda sono trasparenti e
 * tengono lo stride del PBI a 2 bit su byte interi (4 px = 1 B).
 * Taglia B (--no-colon-b): niente ':' — il layout B non lo disegna mai — quindi
 * ink[DIGITS_GLYPH_COLON] = { 0, 0 } (ui_digits.c salta i glifi con w == 0).
 * PNG RGBA a 3 colori: (0,0,0,0) trasparente, (255,255,255,255) riempimento,
 * (0,0,0,255) contorno (dilatazione 8-connessa di 1 px meno la maschera).
 * Taglie (cell_w × strip_h): emery A 40×68, B 64×96; flint A 28×44, B 48×64;
 * cell_w è il PASSO DELLA GRIGLIA DEL LAYOUT (ui_time.c lo confronta con a_cell/b_cell),
 * non la larghezza di una cella nel PNG: nella strip compatta le celle non esistono.
 * strip_w è nel campo di ogni voce, col commento "pack <inchiostro>+<coda>".
 * righe utili = strip_h − 2 (1 px di contorno sopra e 1 sotto).
 * digit_h = altezza REALE del riempimento: le cifre stanno nelle righe 1..digit_h
 * della strip (= strip_h − 2, meno dove --fit-width ha abbassato la px).
 * File: resources/digits/<font>_<taglia>~color.png (emery) / ~bw.png (flint). */
#ifndef GALLERIA_DIGIT_METRICS_H
#define GALLERIA_DIGIT_METRICS_H

#include <stdint.h>

#define DIGITS_GLYPHS 11

typedef struct { uint16_t x; uint8_t w; } DigitInk;      /* inchiostro (contorno compreso) nella strip */
typedef struct {
  uint16_t strip_w, strip_h;   /* dimensioni del PNG (1 px di contorno sopra e sotto le righe utili) */
  uint8_t  cell_w;             /* passo della griglia del LAYOUT (ui_time.c): la strip è compatta */
  uint8_t  digit_h;            /* altezza reale del riempimento: cifre nelle righe 1..digit_h */
  uint8_t  px;                 /* pixel size FreeType usata (diagnostica) */
  DigitInk ink[DIGITS_GLYPHS]; /* '0'..'9', ':' (assente = { 0, 0 }) */
} DigitStripMetrics;

/* [font: 0 Anton, 1 Bebas Neue, 2 Barlow Condensed Bold][taglia: 0 A, 1 B] */
#if defined(PBL_COLOR) /* emery */
static const DigitStripMetrics DIGITS_METRICS[3][2] = {
  { /* Anton */
    { /* A — anton_a~color.png, 360×68, pack 359+1 */
      360, 68, 40, 66, 74,
      { {   0, 36 }, {  36, 23 }, {  59, 36 }, {  95, 36 },
        { 131, 37 }, { 168, 35 }, { 203, 36 }, { 239, 34 },
        { 273, 35 }, { 308, 36 }, { 344, 15 } },
    },
    { /* B — anton_b~color.png, 492×96, pack 489+3 */
      492, 96, 64, 94, 107,
      { {   0, 51 }, {  51, 33 }, {  84, 51 }, { 135, 50 },
        { 185, 53 }, { 238, 51 }, { 289, 51 }, { 340, 48 },
        { 388, 50 }, { 438, 51 }, {   0,  0 } },
    },
  },
  { /* Bebas Neue */
    { /* A — bebas_a~color.png, 332×68, pack 332+0 */
      332, 68, 40, 66, 92,
      { {   0, 33 }, {  33, 23 }, {  56, 32 }, {  88, 32 },
        { 120, 37 }, { 157, 33 }, { 190, 33 }, { 223, 32 },
        { 255, 33 }, { 288, 32 }, { 320, 12 } },
    },
    { /* B — bebas_b~color.png, 448×96, pack 448+0 */
      448, 96, 64, 94, 131,
      { {   0, 46 }, {  46, 32 }, {  78, 45 }, { 123, 45 },
        { 168, 51 }, { 219, 45 }, { 264, 45 }, { 309, 46 },
        { 355, 47 }, { 402, 46 }, {   0,  0 } },
    },
  },
  { /* Barlow Condensed Bold */
    { /* A — barlow_a~color.png, 352×68, pack 350+2 (inchiostro 61 px su 66) */
      352, 68, 40, 61, 84,
      { {   0, 35 }, {  35, 22 }, {  57, 35 }, {  92, 34 },
        { 126, 40 }, { 166, 34 }, { 200, 34 }, { 234, 34 },
        { 268, 33 }, { 301, 34 }, { 335, 15 } },
    },
    { /* B — barlow_b~color.png, 512×96, pack 512+0 (inchiostro 93 px su 94) */
      512, 96, 64, 93, 130,
      { {   0, 53 }, {  53, 33 }, {  86, 54 }, { 140, 52 },
        { 192, 61 }, { 253, 52 }, { 305, 52 }, { 357, 52 },
        { 409, 51 }, { 460, 52 }, {   0,  0 } },
    },
  },
};
#else /* flint */
static const DigitStripMetrics DIGITS_METRICS[3][2] = {
  { /* Anton */
    { /* A — anton_a~bw.png, 248×44, pack 246+2 */
      248, 44, 28, 42, 49,
      { {   0, 24 }, {  24, 16 }, {  40, 25 }, {  65, 24 },
        {  89, 26 }, { 115, 24 }, { 139, 25 }, { 164, 23 },
        { 187, 24 }, { 211, 25 }, { 236, 10 } },
    },
    { /* B — anton_b~bw.png, 328×64, pack 326+2 */
      328, 64, 48, 62, 70,
      { {   0, 34 }, {  34, 22 }, {  56, 34 }, {  90, 34 },
        { 124, 35 }, { 159, 33 }, { 192, 34 }, { 226, 33 },
        { 259, 33 }, { 292, 34 }, {   0,  0 } },
    },
  },
  { /* Bebas Neue */
    { /* A — bebas_a~bw.png, 216×44, pack 216+0 */
      216, 44, 28, 42, 58,
      { {   0, 21 }, {  21, 15 }, {  36, 21 }, {  57, 21 },
        {  78, 23 }, { 101, 21 }, { 122, 21 }, { 143, 21 },
        { 164, 22 }, { 186, 21 }, { 207,  9 } },
    },
    { /* B — bebas_b~bw.png, 300×64, pack 300+0 */
      300, 64, 48, 62, 86,
      { {   0, 31 }, {  31, 21 }, {  52, 31 }, {  83, 30 },
        { 113, 34 }, { 147, 30 }, { 177, 31 }, { 208, 30 },
        { 238, 32 }, { 270, 30 }, {   0,  0 } },
    },
  },
  { /* Barlow Condensed Bold */
    { /* A — barlow_a~bw.png, 252×44, pack 249+3 (inchiostro 40 px su 42) */
      252, 44, 28, 40, 58,
      { {   0, 25 }, {  25, 15 }, {  40, 25 }, {  65, 24 },
        {  89, 28 }, { 117, 24 }, { 141, 24 }, { 165, 24 },
        { 189, 24 }, { 213, 24 }, { 237, 12 } },
    },
    { /* B — barlow_b~bw.png, 344×64, pack 343+1 */
      344, 64, 48, 62, 86,
      { {   0, 35 }, {  35, 22 }, {  57, 36 }, {  93, 35 },
        { 128, 41 }, { 169, 35 }, { 204, 35 }, { 239, 35 },
        { 274, 34 }, { 308, 35 }, {   0,  0 } },
    },
  },
};
#endif

/* risorse: DIGITS_<FONT>_<TAGLIA> (uguali sulle due piattaforme: il tag ~color/~bw sceglie il file) */
static const uint32_t DIGITS_RESOURCE_IDS[3][2] = {
  { RESOURCE_ID_DIGITS_ANTON_A, RESOURCE_ID_DIGITS_ANTON_B },
  { RESOURCE_ID_DIGITS_BEBAS_A, RESOURCE_ID_DIGITS_BEBAS_B },
  { RESOURCE_ID_DIGITS_BARLOW_A, RESOURCE_ID_DIGITS_BARLOW_B },
};

#endif /* GALLERIA_DIGIT_METRICS_H */

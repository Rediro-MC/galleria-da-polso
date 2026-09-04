/* digit_metrics.h — GENERATO da tools/gen_digits.py (v2): non modificare.
 * Rigenerare con:
 *   ~/.local/share/uv/tools/pebble-tool/bin/python tools/gen_digits.py \
 *       --fonts-dir apps/galleria/resources/fonts \
 *       --out apps/galleria/resources/digits \
 *       --header apps/galleria/src/c/digit_metrics.h \
 *       --fit-width --no-colon-b --pack
 *
 * Segnalazioni della generazione:
 *   AVVISO anton emery A          layout 24 h (celle 40 cifre / 16 il ':'): glifi più larghi della cella: '4' 41>40 ':' 19>16
 *   AVVISO anton emery A          layout 12 h (celle 38 cifre / 16 il ':'): glifi più larghi della cella: '0' 40>38 '2' 40>38 '3' 40>38 '4' 41>38 '5' 39>38 '6' 40>38 '8' 39>38 '9' 40>38 ':' 19>16
 *   AVVISO bebas emery A          layout 24 h (celle 40 cifre / 16 il ':'): glifi più larghi della cella: '4' 41>40
 *   AVVISO bebas emery A          layout 12 h (celle 38 cifre / 16 il ':'): glifi più larghi della cella: '4' 41>38
 *   NOTA   barlow emery A         altezza ottenuta 61 px su 66 disponibili (-5): digit_h = 61
 *   AVVISO barlow emery A         layout 24 h (celle 40 cifre / 16 il ':'): glifi più larghi della cella: '4' 44>40 ':' 19>16
 *   AVVISO barlow emery A         layout 12 h (celle 38 cifre / 16 il ':'): glifi più larghi della cella: '0' 39>38 '2' 39>38 '4' 44>38 ':' 19>16
 *   NOTA   barlow emery B         altezza ottenuta 93 px su 94 disponibili (-1): digit_h = 93
 *   NOTA   barlow flint A         altezza ottenuta 40 px su 42 disponibili (-2): digit_h = 40
 *   AVVISO barlow flint A         layout 12 h (celle 26 cifre / 12 il ':'): glifi più larghi della cella: '4' 28>26
 *   NOTA   francois emery A       altezza ottenuta 61 px su 66 disponibili (-5): digit_h = 61
 *   AVVISO francois emery A       layout 24 h (celle 40 cifre / 16 il ':'): glifi più larghi della cella: '0' 42>40 '2' 41>40 '3' 41>40 '4' 44>40 '5' 41>40 '8' 41>40 ':' 17>16
 *   AVVISO francois emery A       layout 12 h (celle 38 cifre / 16 il ':'): glifi più larghi della cella: '0' 42>38 '2' 41>38 '3' 41>38 '4' 44>38 '5' 41>38 '6' 40>38 '8' 41>38 '9' 39>38 ':' 17>16
 *   NOTA   francois flint A       altezza ottenuta 41 px su 42 disponibili (-1): digit_h = 41
 *   AVVISO francois flint A       layout 12 h (celle 26 cifre / 12 il ':'): glifi più larghi della cella: '0' 27>26 '4' 28>26
 *   NOTA   francois flint B       altezza ottenuta 61 px su 62 disponibili (-1): digit_h = 61
 *   NOTA   staatliches emery A    altezza ottenuta 65 px su 66 disponibili (-1): digit_h = 65
 *   AVVISO staatliches emery A    layout 24 h (celle 40 cifre / 16 il ':'): glifi più larghi della cella: '0' 44>40 '2' 41>40 '3' 41>40 '4' 44>40 '5' 41>40 '6' 41>40 '7' 41>40 '8' 41>40 '9' 41>40
 *   AVVISO staatliches emery A    layout 12 h (celle 38 cifre / 16 il ':'): glifi più larghi della cella: '0' 44>38 '2' 41>38 '3' 41>38 '4' 44>38 '5' 41>38 '6' 41>38 '7' 41>38 '8' 41>38 '9' 41>38
 *   AVVISO staatliches flint A    layout 12 h (celle 26 cifre / 12 il ':'): glifi più larghi della cella: '0' 27>26
 *
 * Strip COMPATTA (--pack): i glifi stanno adiacenti da sinistra a destra nell'ordine
 * '0'..'9' (la taglia A chiude con ':'), senza celle vuote: si ritagliano SOLO con
 * ink[k].x/ink[k].w, che è quello che fa ui_digits.c. strip_w = somma degli inchiostri
 * arrotondata al multiplo di 4 px superiore: le colonne in coda sono trasparenti e
 * tengono lo stride del PBI a 2 bit su byte interi (4 px = 1 B).
 * Taglia B (--no-colon-b): niente ':' — il layout B non lo disegna mai — quindi
 * ink[DIGITS_GLYPH_COLON] = { 0, 0 } (ui_digits.c salta i glifi con w == 0).
 * PNG RGBA a 4 colori esatti (D20): (0,0,0,0) trasparente, (255,255,255,255) riempimento,
 * (0,0,0,255) anello spesso R (dilatazione di Chebyshev di R px meno il riempimento),
 * (255,0,0,255) ombra 3D profonda S (spostamenti (+k,+k), k = 1..S, di riempimento ∪ anello,
 * meno riempimento ∪ anello). Resta 2BitPalette: gli stili di D21 cambiano solo la palette.
 * Su flint (~bw) i colori sono TRE: S = 0 (D26), perché nel .pbi di una piattaforma B/N il
 * rosso viene quantizzato a nero e si fonderebbe con l'anello; gli stili 3D valgono come i
 * corrispondenti stili piatti.
 * Geometria (cell_w, righe del riempimento, R, S): emery A (40, 66, 2, 2), B (64, 94, 2, 2);
 * flint A (28, 42, 1, 0), B (48, 62, 1, 0); strip_h = righe + 2R + S (emery 72/100,
 * flint 44/64). Il riempimento sta nelle righe R .. R + digit_h − 1.
 * cell_w è il PASSO DELLA GRIGLIA DEL LAYOUT (ui_time.c lo confronta con a_cell/b_cell),
 * non la larghezza di una cella nel PNG: nella strip compatta le celle non esistono.
 * strip_w è nel campo di ogni voce, col commento "pack <inchiostro>+<coda>".
 * digit_h = altezza REALE del riempimento (= righe disponibili, meno dove --fit-width ha
 * abbassato la px). Righe controllate dal generatore (§3.4) con il passo di ui_time.c
 * (prv_place_row, D25: max(passo, RIEMPIMENTO = ink − 2R − S), non l'inchiostro intero):
 * 24 h "20:44" e 12 h "10:44" + 4 + PM contro la larghezza dello schermo, più un AVVISO se i
 * pixel del blocco centrato escono dallo schermo (anello/ombra tagliati al bordo).
 * File: resources/digits/<font>_<taglia>~color.png (emery) / ~bw.png (flint). */
#ifndef GALLERIA_DIGIT_METRICS_H
#define GALLERIA_DIGIT_METRICS_H

#include <stdint.h>

#define DIGITS_GLYPHS 11
/* righe di DIGITS_METRICS: 0 Anton, 1 Bebas Neue, 2 Barlow Condensed Bold, 3 Francois One, 4 Staatliches (LECO non ha strip) */
#define DIGITS_FONT_COUNT 5

typedef struct __attribute__((packed)) { uint16_t x; uint8_t w; } DigitInk;   /* colonne con inchiostro (riempimento ∪ anello ∪ ombra); packed: 3 B (revisione S8-stile F4) */
typedef struct __attribute__((packed)) {
  uint16_t strip_w, strip_h;   /* dimensioni del PNG; strip_h = righe del riempimento + 2·ring + shadow */
  uint8_t  cell_w;             /* passo della griglia del LAYOUT (ui_time.c): la strip è compatta */
  uint8_t  digit_h;            /* altezza reale del riempimento: righe ring .. ring + digit_h − 1 */
  uint8_t  ring;               /* R: spessore dell'anello = righe libere sopra il riempimento */
  uint8_t  shadow;             /* S: profondità dell'ombra (colonne/righe in più a destra e in basso) */
  uint8_t  px;                 /* pixel size FreeType usata (diagnostica) */
  DigitInk ink[DIGITS_GLYPHS]; /* '0'..'9', ':' (assente = { 0, 0 }) */
} DigitStripMetrics;

/* [font: 0 Anton, 1 Bebas Neue, 2 Barlow Condensed Bold, 3 Francois One, 4 Staatliches][taglia: 0 A, 1 B] */
#if defined(PBL_COLOR) /* emery */
static const DigitStripMetrics DIGITS_METRICS[DIGITS_FONT_COUNT][2] = {
  { /* Anton */
    { /* A — anton_a~color.png, 404×72, pack 403+1 */
      404, 72, 40, 66, 2, 2, 74,
      { {   0, 40 }, {  40, 27 }, {  67, 40 }, { 107, 40 },
        { 147, 41 }, { 188, 39 }, { 227, 40 }, { 267, 38 },
        { 305, 39 }, { 344, 40 }, { 384, 19 } },
    },
    { /* B — anton_b~color.png, 532×100, pack 529+3 */
      532, 100, 64, 94, 2, 2, 107,
      { {   0, 55 }, {  55, 37 }, {  92, 55 }, { 147, 54 },
        { 201, 57 }, { 258, 55 }, { 313, 55 }, { 368, 52 },
        { 420, 54 }, { 474, 55 }, {   0,  0 } },
    },
  },
  { /* Bebas Neue */
    { /* A — bebas_a~color.png, 376×72, pack 376+0 */
      376, 72, 40, 66, 2, 2, 92,
      { {   0, 37 }, {  37, 27 }, {  64, 36 }, { 100, 36 },
        { 136, 41 }, { 177, 37 }, { 214, 37 }, { 251, 36 },
        { 287, 37 }, { 324, 36 }, { 360, 16 } },
    },
    { /* B — bebas_b~color.png, 488×100, pack 488+0 */
      488, 100, 64, 94, 2, 2, 131,
      { {   0, 50 }, {  50, 36 }, {  86, 49 }, { 135, 49 },
        { 184, 55 }, { 239, 49 }, { 288, 49 }, { 337, 50 },
        { 387, 51 }, { 438, 50 }, {   0,  0 } },
    },
  },
  { /* Barlow Condensed Bold */
    { /* A — barlow_a~color.png, 396×72, pack 394+2 (inchiostro 61 px su 66) */
      396, 72, 40, 61, 2, 2, 84,
      { {   0, 39 }, {  39, 26 }, {  65, 39 }, { 104, 38 },
        { 142, 44 }, { 186, 38 }, { 224, 38 }, { 262, 38 },
        { 300, 37 }, { 337, 38 }, { 375, 19 } },
    },
    { /* B — barlow_b~color.png, 552×100, pack 552+0 (inchiostro 93 px su 94) */
      552, 100, 64, 93, 2, 2, 130,
      { {   0, 57 }, {  57, 37 }, {  94, 58 }, { 152, 56 },
        { 208, 65 }, { 273, 56 }, { 329, 56 }, { 385, 56 },
        { 441, 55 }, { 496, 56 }, {   0,  0 } },
    },
  },
  { /* Francois One */
    { /* A — francois_a~color.png, 416×72, pack 416+0 (inchiostro 61 px su 66) */
      416, 72, 40, 61, 2, 2, 79,
      { {   0, 42 }, {  42, 32 }, {  74, 41 }, { 115, 41 },
        { 156, 44 }, { 200, 41 }, { 241, 40 }, { 281, 38 },
        { 319, 41 }, { 360, 39 }, { 399, 17 } },
    },
    { /* B — francois_b~color.png, 596×100, pack 595+1 */
      596, 100, 64, 94, 2, 2, 123,
      { {   0, 63 }, {  63, 48 }, { 111, 61 }, { 172, 61 },
        { 233, 66 }, { 299, 61 }, { 360, 58 }, { 418, 57 },
        { 475, 62 }, { 537, 58 }, {   0,  0 } },
    },
  },
  { /* Staatliches */
    { /* A — staatliches_a~color.png, 408×72, pack 408+0 (inchiostro 65 px su 66) */
      408, 72, 40, 65, 2, 2, 90,
      { {   0, 44 }, {  44, 17 }, {  61, 41 }, { 102, 41 },
        { 143, 44 }, { 187, 41 }, { 228, 41 }, { 269, 41 },
        { 310, 41 }, { 351, 41 }, { 392, 16 } },
    },
    { /* B — staatliches_b~color.png, 552×100, pack 552+0 */
      552, 100, 64, 94, 2, 2, 132,
      { {   0, 63 }, {  63, 22 }, {  85, 58 }, { 143, 58 },
        { 201, 61 }, { 262, 58 }, { 320, 58 }, { 378, 58 },
        { 436, 58 }, { 494, 58 }, {   0,  0 } },
    },
  },
};
#else /* flint */
static const DigitStripMetrics DIGITS_METRICS[DIGITS_FONT_COUNT][2] = {
  { /* Anton */
    { /* A — anton_a~bw.png, 248×44, pack 246+2 */
      248, 44, 28, 42, 1, 0, 49,
      { {   0, 24 }, {  24, 16 }, {  40, 25 }, {  65, 24 },
        {  89, 26 }, { 115, 24 }, { 139, 25 }, { 164, 23 },
        { 187, 24 }, { 211, 25 }, { 236, 10 } },
    },
    { /* B — anton_b~bw.png, 328×64, pack 326+2 */
      328, 64, 48, 62, 1, 0, 70,
      { {   0, 34 }, {  34, 22 }, {  56, 34 }, {  90, 34 },
        { 124, 35 }, { 159, 33 }, { 192, 34 }, { 226, 33 },
        { 259, 33 }, { 292, 34 }, {   0,  0 } },
    },
  },
  { /* Bebas Neue */
    { /* A — bebas_a~bw.png, 216×44, pack 216+0 */
      216, 44, 28, 42, 1, 0, 58,
      { {   0, 21 }, {  21, 15 }, {  36, 21 }, {  57, 21 },
        {  78, 23 }, { 101, 21 }, { 122, 21 }, { 143, 21 },
        { 164, 22 }, { 186, 21 }, { 207,  9 } },
    },
    { /* B — bebas_b~bw.png, 300×64, pack 300+0 */
      300, 64, 48, 62, 1, 0, 86,
      { {   0, 31 }, {  31, 21 }, {  52, 31 }, {  83, 30 },
        { 113, 34 }, { 147, 30 }, { 177, 31 }, { 208, 30 },
        { 238, 32 }, { 270, 30 }, {   0,  0 } },
    },
  },
  { /* Barlow Condensed Bold */
    { /* A — barlow_a~bw.png, 252×44, pack 249+3 (inchiostro 40 px su 42) */
      252, 44, 28, 40, 1, 0, 58,
      { {   0, 25 }, {  25, 15 }, {  40, 25 }, {  65, 24 },
        {  89, 28 }, { 117, 24 }, { 141, 24 }, { 165, 24 },
        { 189, 24 }, { 213, 24 }, { 237, 12 } },
    },
    { /* B — barlow_b~bw.png, 344×64, pack 343+1 */
      344, 64, 48, 62, 1, 0, 86,
      { {   0, 35 }, {  35, 22 }, {  57, 36 }, {  93, 35 },
        { 128, 41 }, { 169, 35 }, { 204, 35 }, { 239, 35 },
        { 274, 34 }, { 308, 35 }, {   0,  0 } },
    },
  },
  { /* Francois One */
    { /* A — francois_a~bw.png, 260×44, pack 259+1 (inchiostro 41 px su 42) */
      260, 44, 28, 41, 1, 0, 53,
      { {   0, 27 }, {  27, 20 }, {  47, 26 }, {  73, 26 },
        {  99, 28 }, { 127, 25 }, { 152, 24 }, { 176, 24 },
        { 200, 26 }, { 226, 24 }, { 250,  9 } },
    },
    { /* B — francois_b~bw.png, 360×64, pack 359+1 (inchiostro 61 px su 62) */
      360, 64, 48, 61, 1, 0, 79,
      { {   0, 38 }, {  38, 28 }, {  66, 37 }, { 103, 37 },
        { 140, 40 }, { 180, 37 }, { 217, 36 }, { 253, 34 },
        { 287, 37 }, { 324, 35 }, {   0,  0 } },
    },
  },
  { /* Staatliches */
    { /* A — staatliches_a~bw.png, 248×44, pack 245+3 */
      248, 44, 28, 42, 1, 0, 58,
      { {   0, 27 }, {  27,  9 }, {  36, 25 }, {  61, 25 },
        {  86, 26 }, { 112, 25 }, { 137, 24 }, { 161, 25 },
        { 186, 25 }, { 211, 25 }, { 236,  9 } },
    },
    { /* B — staatliches_b~bw.png, 344×64, pack 343+1 */
      344, 64, 48, 62, 1, 0, 86,
      { {   0, 40 }, {  40, 13 }, {  53, 36 }, {  89, 36 },
        { 125, 38 }, { 163, 36 }, { 199, 36 }, { 235, 36 },
        { 271, 36 }, { 307, 36 }, {   0,  0 } },
    },
  },
};
#endif

/* risorse: DIGITS_<FONT>_<TAGLIA> (uguali sulle due piattaforme: il tag ~color/~bw sceglie il file) */
static const uint32_t DIGITS_RESOURCE_IDS[DIGITS_FONT_COUNT][2] = {
  { RESOURCE_ID_DIGITS_ANTON_A, RESOURCE_ID_DIGITS_ANTON_B },
  { RESOURCE_ID_DIGITS_BEBAS_A, RESOURCE_ID_DIGITS_BEBAS_B },
  { RESOURCE_ID_DIGITS_BARLOW_A, RESOURCE_ID_DIGITS_BARLOW_B },
  { RESOURCE_ID_DIGITS_FRANCOIS_A, RESOURCE_ID_DIGITS_FRANCOIS_B },
  { RESOURCE_ID_DIGITS_STAATLICHES_A, RESOURCE_ID_DIGITS_STAATLICHES_B },
};

#endif /* GALLERIA_DIGIT_METRICS_H */

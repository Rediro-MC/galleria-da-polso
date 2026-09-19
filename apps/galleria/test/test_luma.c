/* test_luma.c — test host di luma.c (nessun pebble.h): immagini sintetiche in buffer static.
 * Campionamento 1 px su 2: su 200×120 a 8 bit si leggono 100×60 = 6.000 campioni (colonne e righe
 * pari); su 144×80 a 1 bit 72×40 = 2.880. Le percentuali attese sono calcolate su quei campioni.
 * S14 (D140): l'alone scatta gia' a bad_pct == 15 (>=, era >): le 5 attese vecchie a 15 % sono halo
 * = true e test_8bit_halo_threshold pinna il confine 14/15 nei due versi, con e senza stato.
 * S14 (D136, «Ora in basso»): test_band_bottom campiona fasce con y > 0 su immagini grandi come lo
 * schermo (200×228 a 8 bit, 144×168 a 1 bit, con una riga di guardia sotto): la fascia [122, 228)
 * legge le righe 122, 124, …, 226 e mai la 121, la 227 o la 228; idem Quick View [63, 169) (righe
 * dispari) ed ExtraLarge [118, 228); flint [92, 168) e [41, 117). Ogni caso ha un CONTROLLO che
 * sposta la fascia di 1 riga e vede la riga esclusa: il test non e' vacuo. */
#include <stdio.h>
#include <string.h>
#include "luma.h"

static int g_fail, g_pass;

#define CHECK(cond) do { \
    if (cond) { g_pass++; } \
    else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)

/* --- immagine 8 bit 200×120 (GColor8 per pixel) --- */
#define W8 200
#define H8 120
static uint8_t g_img8[H8 * W8];

#define C_BLK   0xC0   /* idx 0  → Y 0   */
#define C_WHT   0xFF   /* idx 63 → Y 255 */
#define C_LGRAY 0xEA   /* idx 42 → Y 104 (LightGray #AAAAAA) */
#define C_DGRAY 0xD5   /* idx 21 → Y 23  (DarkGray) */
#define C_MID   0xC7   /* idx 7  → Y 49  (neutro: né chiaro né scuro) */
#define C_Y77   0xF5   /* idx 53 → Y 77  (limite: NON ostile al bianco) */
#define C_Y25   0xE0   /* idx 32 → Y 25  (limite: NON ostile al nero) */
#define C_Y53   0xE6   /* idx 38 → Y 53  (neutro) */
#define C_Y42   0xE5   /* idx 37 → Y 42  (neutro) */
#define C_Y39   0xE2   /* idx 34 → Y 39  (neutro) */

static const LumaRect FULL8 = { 0, 0, W8, H8 };

static void fill8(uint8_t v) {
  memset(g_img8, v, sizeof(g_img8));
}

static void rect8(int32_t x, int32_t y, int32_t w, int32_t h, uint8_t v) {
  for (int32_t yy = y; yy < y + h; yy++) {
    memset(&g_img8[yy * W8 + x], v, (uint32_t)w);
  }
}

/* Colonne [x0, x1) a tutta altezza. */
static void cols8(int32_t x0, int32_t x1, uint8_t v) {
  rect8(x0, 0, x1 - x0, H8, v);
}

/* --- immagine 1 bit 144×80 MSB-first, stride 18 (+ variante con stride 20 e padding sporco) --- */
#define W1 144
#define H1 80
#define STRIDE1 18
#define STRIDE1P 20
static uint8_t g_img1[H1 * STRIDE1];
static uint8_t g_img1p[H1 * STRIDE1P];

static const LumaRect FULL1 = { 0, 0, W1, H1 };

static void set1(uint8_t *img, uint16_t stride, int32_t x, int32_t y, bool white) {
  uint8_t *p = &img[y * stride + (x >> 3)];
  const uint8_t mask = (uint8_t)(0x80u >> (x & 7));
  if (white) {
    *p |= mask;
  } else {
    *p = (uint8_t)(*p & ~mask);
  }
}

static void rect1(uint8_t *img, uint16_t stride, int32_t x, int32_t y, int32_t w, int32_t h, bool white) {
  for (int32_t yy = y; yy < y + h; yy++) {
    for (int32_t xx = x; xx < x + w; xx++) {
      set1(img, stride, xx, yy, white);
    }
  }
}

static void cols1(int32_t x0, int32_t x1, bool white) {
  rect1(g_img1, STRIDE1, x0, 0, x1 - x0, H1, white);
}

/* Confronto completo del risultato (valid deve essere true). */
static void check_res(const LumaResult *r, bool white, bool halo, uint8_t bad_pct,
                      uint8_t bad_white, uint8_t bad_black, uint8_t mean, const char *what) {
  if (!r->valid || r->white != white || r->halo != halo || r->bad_pct != bad_pct ||
      r->bad_white != bad_white || r->bad_black != bad_black || r->mean != mean) {
    g_fail++;
    printf("FAIL %s: valid=%d white=%d halo=%d bad=%u bw=%u bb=%u mean=%u, atteso "
           "white=%d halo=%d bad=%u bw=%u bb=%u mean=%u\n", what,
           r->valid, r->white, r->halo, r->bad_pct, r->bad_white, r->bad_black, r->mean,
           white, halo, bad_pct, bad_white, bad_black, mean);
  } else {
    g_pass++;
  }
}

static void test_table_and_reset(void) {
  CHECK(LUMA_SUN[0] == 0);
  CHECK(LUMA_SUN[63] == 255);
  CHECK(LUMA_SUN[C_LGRAY & 0x3F] == 104);
  CHECK(LUMA_SUN[C_DGRAY & 0x3F] == 23);
  CHECK(LUMA_SUN[C_MID & 0x3F] == 49);
  CHECK(LUMA_SUN[C_Y77 & 0x3F] == 77);
  CHECK(LUMA_SUN[C_Y25 & 0x3F] == 25);
  CHECK(LUMA_SUN[0x2A] == 104 && LUMA_SUN[0x15] == 23);   /* indice = r<<4|g<<2|b */
  CHECK(LUMA_SUN[C_Y53 & 0x3F] == 53 && LUMA_SUN[C_Y42 & 0x3F] == 42 && LUMA_SUN[C_Y39 & 0x3F] == 39);

  /* Tutte le 64 voci contro la copia di riferimento (ricerca 05 F14): un errore di copia in una
   * voce qualsiasi deve emergere. La somma (6.113) è un secondo controllo indipendente. */
  static const uint8_t REF[64] = {
      0,   3,  15,  36,  14,  18,  28,  49,  65,  69,  80, 100, 160, 165, 175, 195,
      5,   8,  19,  39,  20,  23,  34,  54,  71,  74,  85, 105, 167, 170, 181, 201,
     25,  28,  39,  59,  39,  42,  53,  73,  90,  94, 104, 125, 185, 189, 201, 219,
     60,  62,  74,  94,  74,  77,  87, 108, 125, 129, 140, 160, 218, 223, 234, 255,
  };
  CHECK(memcmp(LUMA_SUN, REF, sizeof(REF)) == 0);
  uint32_t sum = 0;
  for (uint32_t i = 0; i < 64; i++) {
    sum += LUMA_SUN[i];
  }
  CHECK(sum == 6113);

  LumaResult r;
  memset(&r, 0xAB, sizeof(r));
  luma_reset(&r);
  CHECK(r.valid == false && r.white == true && r.halo == false);
  CHECK(r.bad_pct == 0 && r.bad_white == 0 && r.bad_black == 0 && r.mean == 0);
  luma_reset(NULL);                                        /* non deve esplodere */
}

static void test_8bit_uniform(void) {
  LumaResult r;

  luma_reset(&r);
  fill8(C_BLK);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, false, 0, 0, 100, 0, "8bit tutto nero");

  luma_compute_8bit(g_img8, W8, FULL8, &r);              /* stessa foto: invariato */
  check_res(&r, true, false, 0, 0, 100, 0, "8bit tutto nero (bis)");

  fill8(C_WHT);                                           /* da bianco: 100 ≥ 0 + 10 → cambia */
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 0, 100, 0, 255, "8bit tutto bianco dopo nero");

  luma_reset(&r);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 0, 100, 0, 255, "8bit tutto bianco (fresco)");

  luma_reset(&r);
  fill8(C_LGRAY);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 0, 100, 0, 104, "8bit LightGray");

  luma_reset(&r);
  fill8(C_DGRAY);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, false, 0, 0, 100, 23, "8bit DarkGray");

  /* Soglie: Y 77 non è > 77, Y 25 non è < 25 → nessun conflitto, decide la media (46). */
  luma_reset(&r);
  fill8(C_Y77);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 0, 0, 0, 77, "8bit Y=77 (limite bianco)");

  luma_reset(&r);
  fill8(C_Y25);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, false, 0, 0, 0, 25, "8bit Y=25 (limite nero)");

  luma_reset(&r);
  fill8(C_MID);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 0, 0, 0, 49, "8bit Y=49 (sopra crossover)");

  /* Crossover esatto a parità 0/0 (nessun pixel ostile): media 46 → nero, 45 → bianco.
   * Con w=4 si campionano solo le colonne 0 e 2, di due colori neutri diversi. */
  luma_reset(&r);
  fill8(C_Y53);
  cols8(2, 4, C_Y39);                                     /* (53 + 39) / 2 = 46 */
  luma_compute_8bit(g_img8, W8, (LumaRect){ 0, 0, 4, H8 }, &r);
  check_res(&r, false, false, 0, 0, 0, 46, "8bit media 46 = crossover → nero");
  luma_reset(&r);
  fill8(C_Y42);
  cols8(2, 4, C_MID);                                     /* (42 + 49) / 2 = 45 */
  luma_compute_8bit(g_img8, W8, (LumaRect){ 0, 0, 4, H8 }, &r);
  check_res(&r, true, false, 0, 0, 0, 45, "8bit media 45 < crossover → bianco");
}

static void test_8bit_split_and_alpha(void) {
  LumaResult r;

  /* Metà sinistra bianca, metà destra nera: 50/50 → parità → media 127 ≥ 46 → nero, halo. */
  luma_reset(&r);
  fill8(C_BLK);
  cols8(0, 100, C_WHT);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 50, 50, 50, 127, "8bit metà/metà");

  /* Bit alpha ignorati: 0x00 ≡ 0xC0, 0x3F ≡ 0xFF, 0x6A ≡ 0xEA. */
  luma_reset(&r);
  fill8(0x00);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, false, 0, 0, 100, 0, "8bit nero alpha 0");

  luma_reset(&r);
  fill8(0x3F);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 0, 100, 0, 255, "8bit bianco alpha 0");

  luma_reset(&r);
  fill8(0x6A);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 0, 100, 0, 104, "8bit LightGray alpha 1");
}

/* Colonne campionate (pari) su 200 px = 100: [0,2·a) bianco → a %, poi [2·a, 2·(a+b)) nero → b %. */
static void img8_bad(uint8_t bad_white, uint8_t bad_black) {
  fill8(C_MID);
  cols8(0, 2 * bad_white, C_WHT);
  cols8(2 * bad_white, 2 * (bad_white + bad_black), C_BLK);
}

static void test_8bit_hysteresis(void) {
  LumaResult r;

  /* Stato bianco (foto nera), poi 20 % chiari / 15 % scuri: vorrebbe nero ma 20 < 15 + 10 → resta
   * bianco, bad 20 → halo. Media = (20·255 + 65·49)/100 = 82. */
  luma_reset(&r);
  fill8(C_BLK);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  img8_bad(20, 15);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, true, 20, 20, 15, 82, "isteresi 20/15 resta bianco");

  /* 30 % chiari / 15 % scuri: 30 ≥ 25 → nero; bad 15 ≥ 15 → halo (S14/D140: era > 15, niente halo). Media 103. */
  img8_bad(30, 15);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 15, 30, 15, 103, "isteresi 30/15 passa a nero");

  /* Limite esatto: 25/15 → 25 ≥ 25 → cambia; 24/15 → resta. Media 25/15: (25·255+60·49)/100 = 93;
   * 24/15: (24·255 + 61·49)/100 = 91. */
  luma_reset(&r);
  fill8(C_BLK);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  img8_bad(24, 15);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, true, 24, 24, 15, 91, "isteresi 24/15 resta bianco");
  img8_bad(25, 15);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 15, 25, 15, 93, "isteresi 25/15 passa a nero");   /* bad 15 → halo (D140) */

  /* Direzione opposta: stato nero (foto bianca), poi 15 % chiari / 20 % scuri → vorrebbe bianco
   * ma 20 < 15 + 10 → resta nero con bad 20 → halo. Media (15·255 + 65·49)/100 = 70. */
  luma_reset(&r);
  fill8(C_WHT);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  img8_bad(15, 20);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 20, 15, 20, 70, "isteresi 15/20 resta nero");
  img8_bad(15, 30);                                       /* 30 ≥ 15 + 10 → bianco, bad 15 → halo (D140) */
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, true, 15, 15, 30, 65, "isteresi 15/30 passa a bianco");

  /* Senza stato (reset): decisione diretta, niente isteresi; bad 15 → halo (S14/D140). */
  luma_reset(&r);
  img8_bad(20, 15);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 15, 20, 15, 82, "20/15 senza stato → nero");
  luma_reset(&r);
  img8_bad(15, 20);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, true, 15, 15, 20, 70, "15/20 senza stato → bianco");

  /* bad_pct è la % ostile al colore SCELTO: 16 % chiari / 0 % scuri → nero senza conflitti. */
  luma_reset(&r);
  img8_bad(16, 0);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 0, 16, 0, 81, "16/0 → nero, bad 0");
  /* Halo: 16 % → true (15 % → true già visto; il confine 14/15 in test_8bit_halo_threshold, S14/D140).
   * 16/20 → bianco, bad 16; media (16·255+64·49)/100 = 72. */
  luma_reset(&r);
  img8_bad(16, 20);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, true, 16, 16, 20, 72, "halo a 16 %");
}

static void test_8bit_band(void) {
  LumaResult r;

  /* Band interna con origine ≠ 0: fuori band colore opposto → non deve contare. */
  luma_reset(&r);
  fill8(C_WHT);
  rect8(50, 30, 60, 40, C_BLK);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 50, 30, 60, 40 }, &r);
  check_res(&r, true, false, 0, 0, 100, 0, "band 50,30 60×40 nera in bianco");
  luma_reset(&r);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 51, 31, 59, 39 }, &r);   /* origine dispari */
  check_res(&r, true, false, 0, 0, 100, 0, "band 51,31 59×39 nera in bianco");
  luma_reset(&r);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 49, 29, 62, 42 }, &r);   /* 1 px di cornice bianca */
  CHECK(r.white == true && r.bad_white > 0 && r.bad_white < 20);

  luma_reset(&r);
  fill8(C_BLK);
  rect8(50, 30, 60, 40, C_WHT);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 50, 30, 60, 40 }, &r);
  check_res(&r, false, false, 0, 100, 0, 255, "band 50,30 60×40 bianca in nero");

  /* stride (200) > larghezza logica (100): le colonne 100..199 sono fuori bitmap logico. */
  luma_reset(&r);
  fill8(C_BLK);
  cols8(100, 200, C_WHT);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 0, 0, 100, H8 }, &r);
  check_res(&r, true, false, 0, 0, 100, 0, "stride 200, larghezza 100");
  luma_reset(&r);
  luma_compute_8bit(g_img8 + 100, W8, (LumaRect){ 0, 0, 100, H8 }, &r);   /* data = colonna 100 */
  check_res(&r, false, false, 0, 100, 0, 255, "stride 200, data spostato di 100");

  /* Band vuota / negativa / dati NULL: azzera solo bad_pct e halo, non tocca il resto. */
  luma_reset(&r);
  fill8(C_BLK);
  cols8(0, 100, C_WHT);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 50, 50, 50, 127, "stato prima della band vuota");
  static const LumaRect empties[] = {
    { 0, 0, 0, H8 }, { 0, 0, W8, 0 }, { 0, 0, 0, 0 }, { 10, 10, -1, 5 }, { 10, 10, 5, -5 },
    { -1, 0, 10, 10 }, { 0, -1, 10, 10 },
  };
  for (uint32_t i = 0; i < (uint32_t)(sizeof(empties) / sizeof(empties[0])); i++) {
    r.bad_pct = 50;
    r.halo = true;
    luma_compute_8bit(g_img8, W8, empties[i], &r);
    CHECK(r.valid == true && r.white == false && r.bad_pct == 0 && r.halo == false);
    CHECK(r.bad_white == 50 && r.bad_black == 50 && r.mean == 127);
  }
  r.bad_pct = 50;
  r.halo = true;
  luma_compute_8bit(NULL, W8, FULL8, &r);
  CHECK(r.valid == true && r.white == false && r.bad_pct == 0 && r.halo == false);
  luma_reset(&r);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 0, 0, 0, 0 }, &r);
  CHECK(r.valid == false && r.white == true && r.halo == false && r.bad_pct == 0);
  luma_compute_8bit(g_img8, W8, FULL8, NULL);              /* non deve esplodere */

  /* w dispari: si campionano solo le colonne pari della band. Colonne 0,2,4 bianche, 1,3 nere. */
  luma_reset(&r);
  fill8(C_BLK);
  cols8(0, 1, C_WHT);
  cols8(2, 3, C_WHT);
  cols8(4, 5, C_WHT);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 0, 0, 5, H8 }, &r);
  check_res(&r, false, false, 0, 100, 0, 255, "w=5 da x=0: 0,2,4 bianche");
  luma_reset(&r);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 1, 0, 5, H8 }, &r);      /* x = 1, 3, 5 → nere */
  check_res(&r, true, false, 0, 0, 100, 0, "w=5 da x=1: 1,3,5 nere");
  luma_reset(&r);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 0, 0, 4, H8 }, &r);      /* x = 0, 2 */
  check_res(&r, false, false, 0, 100, 0, 255, "w=4 da x=0: 0,2 bianche");
  luma_reset(&r);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 0, 0, 1, 1 }, &r);       /* un solo campione */
  check_res(&r, false, false, 0, 100, 0, 255, "1×1 bianco");
  luma_reset(&r);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 1, 0, 1, 1 }, &r);
  check_res(&r, true, false, 0, 0, 100, 0, "1×1 nero");
  luma_reset(&r);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 0, 119, 5, 1 }, &r);     /* h dispari, ultima riga */
  check_res(&r, false, false, 0, 100, 0, 255, "w=5 h=1 ultima riga");
  luma_reset(&r);
  fill8(C_BLK);
  rect8(0, 3, 6, 1, C_WHT);                                          /* riga 3 (dispari): ignorata */
  luma_compute_8bit(g_img8, W8, (LumaRect){ 0, 2, 6, 3 }, &r);       /* y = 2, 4 */
  check_res(&r, true, false, 0, 0, 100, 0, "righe dispari non campionate");
  luma_reset(&r);
  luma_compute_8bit(g_img8, W8, (LumaRect){ 0, 3, 6, 3 }, &r);       /* y = 3, 5 → 50 % */
  check_res(&r, false, true, 50, 50, 50, 127, "righe 3 e 5: metà bianca");
}

static void test_1bit(void) {
  LumaResult r;

  /* Ordine dei bit: pixel x=0 nel bit 0x80. */
  memset(g_img1, 0, sizeof(g_img1));
  set1(g_img1, STRIDE1, 0, 0, true);
  CHECK(g_img1[0] == 0x80);
  set1(g_img1, STRIDE1, 7, 0, true);
  CHECK(g_img1[0] == 0x81);
  set1(g_img1, STRIDE1, 8, 0, true);
  CHECK(g_img1[1] == 0x80);
  set1(g_img1, STRIDE1, 0, 1, true);
  CHECK(g_img1[STRIDE1] == 0x80);

  memset(g_img1, 0, sizeof(g_img1));
  g_img1[0] = 0x80;                                        /* solo (0,0) bianco */
  luma_reset(&r);
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 0, 0, 1, 1 }, &r);
  check_res(&r, false, true, 0, 100, 0, 255, "1bit pixel (0,0) bianco");
  luma_reset(&r);
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 1, 0, 1, 1 }, &r);
  check_res(&r, true, true, 0, 0, 100, 0, "1bit pixel (1,0) nero");
  luma_reset(&r);
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 0, 0, 2, 1 }, &r);  /* x = 0 soltanto */
  check_res(&r, false, true, 0, 100, 0, 255, "1bit w=2 campiona solo x=0");
  g_img1[0] = 0x40;                                        /* solo (1,0) bianco */
  luma_reset(&r);
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 0, 0, 1, 1 }, &r);
  check_res(&r, true, true, 0, 0, 100, 0, "1bit 0x40: x=0 è nero");
  luma_reset(&r);
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 1, 0, 1, 1 }, &r);
  check_res(&r, false, true, 0, 100, 0, 255, "1bit 0x40: x=1 è bianco");
  g_img1[0] = 0;
  g_img1[1] = 0x01;                                        /* solo (15,0) bianco */
  luma_reset(&r);
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 15, 0, 1, 1 }, &r);
  check_res(&r, false, true, 0, 100, 0, 255, "1bit 0x01 nel byte 1: x=15");
  luma_reset(&r);
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 14, 0, 1, 1 }, &r);
  check_res(&r, true, true, 0, 0, 100, 0, "1bit x=14 nero");

  /* Uniformi: contorno sempre, anche a bad 0. */
  luma_reset(&r);
  memset(g_img1, 0x00, sizeof(g_img1));
  luma_compute_1bit(g_img1, STRIDE1, FULL1, &r);
  check_res(&r, true, true, 0, 0, 100, 0, "1bit tutto nero");
  luma_reset(&r);
  memset(g_img1, 0xFF, sizeof(g_img1));
  luma_compute_1bit(g_img1, STRIDE1, FULL1, &r);
  check_res(&r, false, true, 0, 100, 0, 255, "1bit tutto bianco");

  /* 25 % bianchi: colonne [0,36) → 18 campioni su 72 per riga; media 18·255/72 = 63. */
  luma_reset(&r);
  memset(g_img1, 0x00, sizeof(g_img1));
  cols1(0, 36, true);
  luma_compute_1bit(g_img1, STRIDE1, FULL1, &r);
  check_res(&r, true, true, 25, 25, 75, 63, "1bit 25 % bianchi");

  /* Parità 50/50 → media 127 → nero. */
  luma_reset(&r);
  cols1(0, 72, true);
  luma_compute_1bit(g_img1, STRIDE1, FULL1, &r);
  check_res(&r, false, true, 50, 50, 50, 127, "1bit metà/metà");

  /* Isteresi: da bianco, 39/72 bianchi → 54 % / 45 % → resta bianco; 40/72 → 55 % / 44 % → nero. */
  luma_reset(&r);
  memset(g_img1, 0x00, sizeof(g_img1));
  luma_compute_1bit(g_img1, STRIDE1, FULL1, &r);
  cols1(0, 78, true);
  luma_compute_1bit(g_img1, STRIDE1, FULL1, &r);
  check_res(&r, true, true, 54, 54, 45, 138, "1bit isteresi 54/45 resta bianco");
  cols1(0, 80, true);
  luma_compute_1bit(g_img1, STRIDE1, FULL1, &r);
  check_res(&r, false, true, 44, 55, 44, 141, "1bit isteresi 55/44 passa a nero");
  /* Da nero: 33/72 bianchi → 45 % / 54 % → vorrebbe bianco, 54 < 55 → resta nero. */
  memset(g_img1, 0x00, sizeof(g_img1));
  cols1(0, 66, true);
  luma_compute_1bit(g_img1, STRIDE1, FULL1, &r);
  check_res(&r, false, true, 54, 45, 54, 116, "1bit isteresi 45/54 resta nero");
  /* 32/72 → 44 % / 55 % → 55 ≥ 54 → bianco. */
  memset(g_img1, 0x00, sizeof(g_img1));
  cols1(0, 64, true);
  luma_compute_1bit(g_img1, STRIDE1, FULL1, &r);
  check_res(&r, true, true, 44, 44, 55, 113, "1bit isteresi 44/55 passa a bianco");

  /* Band con origine non allineata al byte e stride 20 con padding sporco (byte 18,19 = 0xFF). */
  memset(g_img1p, 0xFF, sizeof(g_img1p));
  rect1(g_img1p, STRIDE1P, 0, 0, W1, H1, false);          /* i 144 px neri, padding resta 0xFF */
  luma_reset(&r);
  luma_compute_1bit(g_img1p, STRIDE1P, FULL1, &r);
  check_res(&r, true, true, 0, 0, 100, 0, "1bit stride 20: padding non letto");
  memset(g_img1p, 0xFF, sizeof(g_img1p));
  rect1(g_img1p, STRIDE1P, 5, 3, 7, 10, false);           /* x = 5,7,9,11; y = 3,5,7,9,11 → 20 campioni */
  luma_reset(&r);
  luma_compute_1bit(g_img1p, STRIDE1P, (LumaRect){ 5, 3, 7, 10 }, &r);
  check_res(&r, true, true, 0, 0, 100, 0, "1bit band 5,3 7×10 nera in bianco");
  luma_reset(&r);
  luma_compute_1bit(g_img1p, STRIDE1P, (LumaRect){ 4, 3, 7, 10 }, &r);   /* x = 4,6,8,10: 4 bianca */
  check_res(&r, true, true, 25, 25, 75, 63, "1bit band 4,3: colonna 4 fuori rettangolo");
  memset(g_img1p, 0x00, sizeof(g_img1p));
  rect1(g_img1p, STRIDE1P, 5, 3, 7, 10, true);
  luma_reset(&r);
  luma_compute_1bit(g_img1p, STRIDE1P, (LumaRect){ 5, 3, 7, 10 }, &r);
  check_res(&r, false, true, 0, 100, 0, 255, "1bit band 5,3 7×10 bianca in nero");

  /* Righe: 1 su 2 anche a 1 bit. Riga 3 bianca su 16 px (8 campioni per riga): la band da y=2
   * legge y=2,4 (nere); da y=3 legge y=3,5 → 8/16 bianchi → 50 % → parità → media 127 → nero. */
  memset(g_img1, 0x00, sizeof(g_img1));
  rect1(g_img1, STRIDE1, 0, 3, 16, 1, true);
  luma_reset(&r);
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 0, 2, 16, 3 }, &r);
  check_res(&r, true, true, 0, 0, 100, 0, "1bit righe dispari non campionate");
  luma_reset(&r);
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 0, 3, 16, 3 }, &r);
  check_res(&r, false, true, 50, 50, 50, 127, "1bit righe 3 e 5: metà bianca");

  /* Band vuota: bad_pct 0, halo resta true (contorno sempre su 1 bit), il resto invariato. */
  luma_reset(&r);
  memset(g_img1, 0x00, sizeof(g_img1));
  cols1(0, 72, true);
  luma_compute_1bit(g_img1, STRIDE1, FULL1, &r);
  check_res(&r, false, true, 50, 50, 50, 127, "1bit stato prima della band vuota");
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 0, 0, 0, H1 }, &r);
  CHECK(r.valid == true && r.white == false && r.bad_pct == 0 && r.halo == true);
  CHECK(r.bad_white == 50 && r.bad_black == 50 && r.mean == 127);
  luma_compute_1bit(NULL, STRIDE1, FULL1, &r);
  CHECK(r.valid == true && r.white == false && r.bad_pct == 0 && r.halo == true);
  luma_reset(&r);
  luma_compute_1bit(g_img1, STRIDE1, (LumaRect){ 3, 3, 0, 0 }, &r);
  CHECK(r.valid == false && r.white == true && r.halo == true && r.bad_pct == 0);
  luma_compute_1bit(g_img1, STRIDE1, FULL1, NULL);
}


/* --- S14 (D140): confine dell'alone a 15 % esatto, nei due versi, con e senza stato --- */
static void test_8bit_halo_threshold(void) {
  LumaResult r;

  /* senza stato: 14 % ostili al colore SCELTO → niente alone; 15 % → alone (D140: >=, era >).
   * Medie: 14/20 (14·255 + 66·49)/100 = 68; 15/20 = 70; 20/14 (20·255 + 66·49)/100 = 83; 20/15 = 82. */
  luma_reset(&r);
  img8_bad(14, 20);                                       /* → bianco, bad 14 */
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, false, 14, 14, 20, 68, "14/20 senza stato → bianco, bad 14: niente alone");
  luma_reset(&r);
  img8_bad(15, 20);                                       /* → bianco, bad 15 */
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, true, 15, 15, 20, 70, "15/20 senza stato → bianco, bad 15: alone");
  luma_reset(&r);
  img8_bad(20, 14);                                       /* → nero, bad 14 */
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 14, 20, 14, 83, "20/14 senza stato → nero, bad 14: niente alone");
  luma_reset(&r);
  img8_bad(20, 15);                                       /* → nero, bad 15 */
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 15, 20, 15, 82, "20/15 senza stato → nero, bad 15: alone");

  /* con stato e colore confermato dall'isteresi: stesso confine sul colore CORRENTE */
  luma_reset(&r);
  fill8(C_BLK);
  luma_compute_8bit(g_img8, W8, FULL8, &r);              /* stato bianco */
  img8_bad(14, 20);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, false, 14, 14, 20, 68, "stato bianco, 14/20: niente alone");
  img8_bad(15, 20);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, true, 15, 15, 20, 70, "stato bianco, 15/20: alone");
  luma_reset(&r);
  fill8(C_WHT);
  luma_compute_8bit(g_img8, W8, FULL8, &r);              /* stato nero */
  img8_bad(20, 14);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 14, 20, 14, 83, "stato nero, 20/14: niente alone");
  img8_bad(20, 15);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 15, 20, 15, 82, "stato nero, 20/15: alone");

  /* isteresi che TRATTIENE il colore con bad esattamente 15: l'alone guarda bad_pct del colore tenuto.
   * Stato bianco, 15/10: vorrebbe nero (15 > 10) ma 15 < 10 + 10 → resta bianco, bad 15 → alone;
   * media (15·255 + 75·49)/100 = 75. Poi 14/10: resta bianco, bad 14 → niente; media (14·255 + 76·49)/100 = 72. */
  luma_reset(&r);
  fill8(C_BLK);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  img8_bad(15, 10);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, true, 15, 15, 10, 75, "isteresi trattiene bianco con bad 15: alone");
  img8_bad(14, 10);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, false, 14, 14, 10, 72, "isteresi trattiene bianco con bad 14: niente alone");
  /* Stato nero, 10/15: vorrebbe bianco ma 15 < 20 → resta nero, bad 15 → alone; media (10·255 + 75·49)/100 = 62.
   * Poi 10/14: resta nero, bad 14 → niente; media (10·255 + 76·49)/100 = 62. */
  luma_reset(&r);
  fill8(C_WHT);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  img8_bad(10, 15);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 15, 10, 15, 62, "isteresi trattiene nero con bad 15: alone");
  img8_bad(10, 14);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 14, 10, 14, 62, "isteresi trattiene nero con bad 14: niente alone");

  /* parità 15/15: decide la media (72 ≥ 46 → nero), bad 15 → alone */
  luma_reset(&r);
  img8_bad(15, 15);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 15, 15, 15, 72, "15/15 → nero per media, alone");
  /* la costante e' 15 e la regola e' >= (un LUMA_HALO_PCT cambiato per sbaglio deve emergere qui) */
  CHECK(LUMA_HALO_PCT == 15);
  luma_reset(&r);
  img8_bad(0, 0);                                         /* tutto neutro: bad 0 → niente alone */
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 0, 0, 0, 49, "0/0 → nero (media 49), niente alone");
}

/* --- S14 (D136): fasce con y > 0 su immagini grandi come lo schermo («Ora in basso», Quick View, ExtraLarge) --- */
#define WE 200
#define HE 228
static uint8_t g_img_e[(HE + 1) * WE];       /* riga 228 = guardia: fuori dal bitmap, mai letta */
#define WF 144
#define HF 168
#define STRIDEF 18
static uint8_t g_img_f[(HF + 1) * STRIDEF];  /* riga 168 = guardia */

static void rows_e(int32_t y0, int32_t y1, uint8_t v) {
  for (int32_t yy = y0; yy < y1; yy++) {
    memset(&g_img_e[yy * WE], v, WE);
  }
}

/* nero in [0, y0), bianco in [y0, y1), nero in [y1, 229) (guardia compresa) */
static void img_e_white_band(int32_t y0, int32_t y1) {
  rows_e(0, y0, C_BLK);
  rows_e(y0, y1, C_WHT);
  rows_e(y1, HE + 1, C_BLK);
}

static void img_f_white_band(int32_t y0, int32_t y1) {
  memset(g_img_f, 0x00, sizeof(g_img_f));                 /* tutto nero, guardia compresa */
  rect1(g_img_f, STRIDEF, 0, y0, WF, y1 - y0, true);
}

static void test_band_bottom(void) {
  LumaResult r;

  /* emery «Ora in basso»: fascia [122, 228) → righe 122, 124, …, 226 (53 righe × 100 colonne). Nero sopra
   * la 122 e sotto la 228 (guardia): il risultato non deve vedere il nero. */
  img_e_white_band(122, 228);
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 122, WE, 106 }, &r);
  check_res(&r, false, false, 0, 100, 0, 255, "emery [122,228): non vede il nero sopra");
  /* controllo di sensibilita': da y 121 (h 107) le righe sono 121, 123, …, 227: la 121 nera entra
   * (1 riga su 54: bad_black 100/5400 = 1 %, bad_white 5300/5400 = 98 %, media 53·255/54 = 250) */
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 121, WE, 107 }, &r);
  check_res(&r, false, false, 1, 98, 1, 250, "controllo: da y 121 la riga 121 si vede");
  /* la riga 227 (dispari) non e' campionata dalla fascia [122, 228)... */
  rows_e(227, 228, C_BLK);
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 122, WE, 106 }, &r);
  check_res(&r, false, false, 0, 100, 0, 255, "emery [122,228): la riga 227 non conta");
  /* ...ma da y 123 (h 105: righe 123 … 227) si': 1 su 53 → bad_black 100/5300 = 1, bad_white 98, media 52·255/53 = 250 */
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 123, WE, 105 }, &r);
  check_res(&r, false, false, 1, 98, 1, 250, "controllo: da y 123 la riga 227 si vede");
  /* dalla riga 0 (fascia «Ora in alto» estesa a tutto lo schermo) il nero si vede eccome: righe pari 0..226 = 114,
   * 61 nere e 53 bianche → bad_black 6100/11400 = 53, bad_white 5300/11400 = 46 → bianco, bad 46 → alone, media 118 */
  img_e_white_band(122, 228);
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 0, WE, HE }, &r);
  check_res(&r, true, true, 46, 46, 53, 118, "controllo: da y 0 il nero sopra si vede");
  /* specchio: bianco sopra, nero nella fascia → testo bianco senza alone (non vede il bianco sopra) */
  rows_e(0, 122, C_WHT);
  rows_e(122, HE + 1, C_BLK);
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 122, WE, 106 }, &r);
  check_res(&r, true, false, 0, 0, 100, 0, "emery [122,228) nera sotto bianco: bianco senza alone");

  /* Quick View su emery: unob 169 → fascia [63, 169): righe DISPARI 63, 65, …, 167 (53). Bianco solo in [63, 169):
   * la 169 (nera) resta fuori. */
  img_e_white_band(63, 169);
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 63, WE, 106 }, &r);
  check_res(&r, false, false, 0, 100, 0, 255, "emery QV [63,169): righe dispari, 169 esclusa");
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 63, WE, 107 }, &r);   /* h 107: entra la 169 */
  check_res(&r, false, false, 1, 98, 1, 250, "controllo: con h 107 la riga 169 si vede");
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 62, WE, 107 }, &r);   /* da 62: righe pari 62..168, la 62 e' nera */
  check_res(&r, false, false, 1, 98, 1, 250, "controllo: da y 62 la riga 62 si vede");

  /* ExtraLarge: fascia [118, 228) (110 righe) → 118, 120, …, 226 (55); Quick View [59, 169) → 59 … 167 (55, dispari) */
  img_e_white_band(118, 228);
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 118, WE, 110 }, &r);
  check_res(&r, false, false, 0, 100, 0, 255, "emery XL [118,228)");
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 117, WE, 111 }, &r);   /* 117 … 227: la 117 e' nera (1/56, media 55·255/56 = 250) */
  check_res(&r, false, false, 1, 98, 1, 250, "controllo XL: da y 117");
  img_e_white_band(59, 169);
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 59, WE, 110 }, &r);
  check_res(&r, false, false, 0, 100, 0, 255, "emery XL QV [59,169)");

  /* la fascia bassa con l'isteresi: stessa foto, stato bianco (fascia alta nera) → la fascia bassa bianca
   * (bad_white 100 ≥ 0 + 10) porta a nero; il nero sopra non pesa */
  img_e_white_band(122, 228);
  luma_reset(&r);
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 0, WE, 106 }, &r);    /* «Ora in alto»: tutta nera → bianco */
  check_res(&r, true, false, 0, 0, 100, 0, "fascia alta [0,106) nera → bianco");
  luma_compute_8bit(g_img_e, WE, (LumaRect){ 0, 122, WE, 106 }, &r);  /* passaggio a «Ora in basso» */
  check_res(&r, false, false, 0, 100, 0, 255, "fascia bassa dopo l'alta: nero (isteresi superata)");

  /* flint «Ora in basso»: fascia [92, 168) su 144×168 → righe 92, 94, …, 166 (38 × 72 campioni); guardia 168 nera */
  img_f_white_band(92, 168);
  luma_reset(&r);
  luma_compute_1bit(g_img_f, STRIDEF, (LumaRect){ 0, 92, WF, 76 }, &r);
  check_res(&r, false, true, 0, 100, 0, 255, "flint [92,168): non vede il nero sopra");
  luma_reset(&r);
  luma_compute_1bit(g_img_f, STRIDEF, (LumaRect){ 0, 91, WF, 77 }, &r);   /* 91 … 167: la 91 e' nera (1/39 → 2 %, 97 %, media 38·255/39 = 248) */
  check_res(&r, false, true, 2, 97, 2, 248, "controllo flint: da y 91");
  /* flint Quick View: unob 117 → [41, 117): righe dispari 41 … 115 (38); la 117 (nera) esclusa */
  img_f_white_band(41, 117);
  luma_reset(&r);
  luma_compute_1bit(g_img_f, STRIDEF, (LumaRect){ 0, 41, WF, 76 }, &r);
  check_res(&r, false, true, 0, 100, 0, 255, "flint QV [41,117)");
  luma_reset(&r);
  luma_compute_1bit(g_img_f, STRIDEF, (LumaRect){ 0, 41, WF, 77 }, &r);   /* entra la 117 */
  check_res(&r, false, true, 2, 97, 2, 248, "controllo flint QV: con h 77 la riga 117 si vede");
  /* specchio flint: bianco sopra, nero nella fascia → bianco (contorno sempre) */
  memset(g_img_f, 0xFF, sizeof(g_img_f));
  rect1(g_img_f, STRIDEF, 0, 92, WF, HF + 1 - 92, false);
  luma_reset(&r);
  luma_compute_1bit(g_img_f, STRIDEF, (LumaRect){ 0, 92, WF, 76 }, &r);
  check_res(&r, true, true, 0, 0, 100, 0, "flint [92,168) nera sotto bianco: bianco");
}

int main(void) {
  test_table_and_reset();
  test_8bit_uniform();
  test_8bit_split_and_alpha();
  test_8bit_hysteresis();
  test_8bit_halo_threshold();
  test_8bit_band();
  test_band_bottom();
  test_1bit();

  printf("luma: %d ok, %d falliti\n", g_pass, g_fail);
  return g_fail ? 1 : 0;
}

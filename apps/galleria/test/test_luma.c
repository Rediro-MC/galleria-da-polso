/* test_luma.c — test host di luma.c (nessun pebble.h): immagini sintetiche in buffer static.
 * Campionamento 1 px su 2: su 200×120 a 8 bit si leggono 100×60 = 6.000 campioni (colonne e righe
 * pari); su 144×80 a 1 bit 72×40 = 2.880. Le percentuali attese sono calcolate su quei campioni. */
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

  /* 30 % chiari / 15 % scuri: 30 ≥ 25 → nero; bad 15 non è > 15 → niente halo. Media 103. */
  img8_bad(30, 15);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 15, 30, 15, 103, "isteresi 30/15 passa a nero");

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
  check_res(&r, false, false, 15, 25, 15, 93, "isteresi 25/15 passa a nero");

  /* Direzione opposta: stato nero (foto bianca), poi 15 % chiari / 20 % scuri → vorrebbe bianco
   * ma 20 < 15 + 10 → resta nero con bad 20 → halo. Media (15·255 + 65·49)/100 = 70. */
  luma_reset(&r);
  fill8(C_WHT);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  img8_bad(15, 20);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, true, 20, 15, 20, 70, "isteresi 15/20 resta nero");
  img8_bad(15, 30);                                       /* 30 ≥ 15 + 10 → bianco, bad 15 */
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, false, 15, 15, 30, 65, "isteresi 15/30 passa a bianco");

  /* Senza stato (reset): decisione diretta, niente isteresi. */
  luma_reset(&r);
  img8_bad(20, 15);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 15, 20, 15, 82, "20/15 senza stato → nero");
  luma_reset(&r);
  img8_bad(15, 20);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, true, false, 15, 15, 20, 70, "15/20 senza stato → bianco");

  /* bad_pct è la % ostile al colore SCELTO: 16 % chiari / 0 % scuri → nero senza conflitti. */
  luma_reset(&r);
  img8_bad(16, 0);
  luma_compute_8bit(g_img8, W8, FULL8, &r);
  check_res(&r, false, false, 0, 16, 0, 81, "16/0 → nero, bad 0");
  /* Halo: 16 % → true (15 % → false già visto). 16/20 → bianco, bad 16; media (16·255+64·49)/100 = 72. */
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

int main(void) {
  test_table_and_reset();
  test_8bit_uniform();
  test_8bit_split_and_alpha();
  test_8bit_hysteresis();
  test_8bit_band();
  test_1bit();

  printf("luma: %d ok, %d falliti\n", g_pass, g_fail);
  return g_fail ? 1 : 0;
}

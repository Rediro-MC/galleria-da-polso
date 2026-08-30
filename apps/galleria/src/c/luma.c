/* luma.c — vedi luma.h. Modulo puro: nessun pebble.h, nessun float, nessuna divisione nel loop.
 * Solo tipi a larghezza fissa (host 64 bit e ARM 32 bit danno lo stesso risultato). */
#include "luma.h"

/* Y lineare WCAG × 255 della resa "sunlight" (LUT di `pebble screenshot`), indice = GColor8 & 0x3F.
 * Nero 0, bianco 255, LightGray (#AAAAAA, idx 42) → 104. Vedi ricerca 05 F14. */
const uint8_t LUMA_SUN[64] = {
    0,   3,  15,  36,  14,  18,  28,  49,  65,  69,  80, 100, 160, 165, 175, 195,
    5,   8,  19,  39,  20,  23,  34,  54,  71,  74,  85, 105, 167, 170, 181, 201,
   25,  28,  39,  59,  39,  42,  53,  73,  90,  94, 104, 125, 185, 189, 201, 219,
   60,  62,  74,  94,  74,  77,  87, 108, 125, 129, 140, 160, 218, 223, 234, 255,
};

void luma_reset(LumaResult *r) {
  if (!r) {
    return;
  }
  r->valid = false;
  r->white = true;
  r->halo = false;
  r->bad_pct = 0;
  r->bad_white = 0;
  r->bad_black = 0;
  r->mean = 0;
}

/* Band inutilizzabile (vuota, origine negativa, dati assenti): true se non c'è nulla da campionare. */
static bool prv_band_empty(const uint8_t *data, LumaRect band) {
  return !data || band.x < 0 || band.y < 0 || band.w <= 0 || band.h <= 0;
}

/* Decisione comune a 8 bit e 1 bit (n > 0): percentuali intere, scelta diretta se !valid,
 * altrimenti isteresi rispetto a r->white. Non tocca r->halo (dipende dal formato). */
static void prv_decide(LumaResult *r, uint32_t n, uint32_t sum, uint32_t n_bright, uint32_t n_dark) {
  const uint32_t bad_white = n_bright * 100u / n;   /* % pixel ostili al bianco */
  const uint32_t bad_black = n_dark * 100u / n;     /* % pixel ostili al nero */
  const uint32_t mean = sum / n;
  const bool want_white = (bad_white != bad_black) ? (bad_white < bad_black)
                                                   : (mean < LUMA_Y_CROSSOVER);
  if (!r->valid) {
    r->white = want_white;
  } else if (want_white != r->white) {
    /* Isteresi: si cambia solo se il colore attuale è peggiore di almeno LUMA_HYSTERESIS punti. */
    const uint32_t cur_bad = r->white ? bad_white : bad_black;
    const uint32_t new_bad = want_white ? bad_white : bad_black;
    if (cur_bad >= new_bad + LUMA_HYSTERESIS) {
      r->white = want_white;
    }
  }
  r->bad_white = (uint8_t)bad_white;
  r->bad_black = (uint8_t)bad_black;
  r->mean = (uint8_t)mean;
  r->bad_pct = r->white ? r->bad_white : r->bad_black;
  r->valid = true;
}

void luma_compute_8bit(const uint8_t *data, uint16_t stride, LumaRect band, LumaResult *r) {
  if (!r) {
    return;
  }
  if (prv_band_empty(data, band)) {
    r->bad_pct = 0;
    r->halo = false;
    return;
  }
  const int32_t x_end = (int32_t)band.x + band.w;
  const int32_t y_end = (int32_t)band.y + band.h;
  uint32_t n = 0, sum = 0, n_bright = 0, n_dark = 0;
  for (int32_t y = band.y; y < y_end; y += 2) {              /* 1 riga su 2 */
    const uint8_t *row = data + (uint32_t)y * stride;
    for (int32_t x = band.x; x < x_end; x += 2) {            /* 1 colonna su 2 */
      const uint8_t l = LUMA_SUN[row[x] & 0x3F];             /* bit alpha ignorati */
      sum += l;
      n++;
      if (l > LUMA_Y_WHITE_BAD) {
        n_bright++;
      } else if (l < LUMA_Y_BLACK_BAD) {
        n_dark++;
      }
    }
  }
  prv_decide(r, n, sum, n_bright, n_dark);
  r->halo = r->bad_pct > LUMA_HALO_PCT;
}

void luma_compute_1bit(const uint8_t *data, uint16_t stride, LumaRect band, LumaResult *r) {
  if (!r) {
    return;
  }
  if (prv_band_empty(data, band)) {
    r->bad_pct = 0;
    r->halo = true;                                          /* su 1 bit il contorno c'è sempre */
    return;
  }
  const int32_t x_end = (int32_t)band.x + band.w;
  const int32_t y_end = (int32_t)band.y + band.h;
  uint32_t n = 0, n_white = 0;
  for (int32_t y = band.y; y < y_end; y += 2) {
    const uint8_t *row = data + (uint32_t)y * stride;
    for (int32_t x = band.x; x < x_end; x += 2) {
      n++;
      if (row[x >> 3] & (uint8_t)(0x80u >> (x & 7))) {      /* MSB-first: bit 1 = bianco */
        n_white++;
      }
    }
  }
  /* Bianco = ostile al testo bianco, nero = ostile al nero; Y medio = bianchi × 255 / n. */
  prv_decide(r, n, n_white * 255u, n_white, n - n_white);
  r->halo = true;
}

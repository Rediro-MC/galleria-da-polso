/* rotation.c — vedi rotation.h. Solo aritmetica intera a larghezza fissa (regola 4). */
#include "rotation.h"

/* Giorni dal 1970-01-01 (Howard Hinnant, "days_from_civil"): valido per ogni data gregoriana. */
static int32_t prv_days_from_civil(int32_t y, int32_t m, int32_t d) {
  y -= (m <= 2) ? 1 : 0;
  const int32_t  era = (y >= 0 ? y : y - 399) / 400;
  const uint32_t yoe = (uint32_t)(y - era * 400);                          /* [0, 399] */
  const uint32_t doy = (153u * (uint32_t)(m > 2 ? m - 3 : m + 9) + 2u) / 5u + (uint32_t)d - 1u;
  const uint32_t doe = yoe * 365u + yoe / 4u - yoe / 100u + doy;           /* [0, 146096] */
  return era * 146097 + (int32_t)doe - 719468;
}

static int32_t prv_clamp(int32_t v, int32_t lo, int32_t hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

uint32_t rotation_local_minutes(int32_t year, int32_t month, int32_t day, int32_t hour, int32_t minute) {
  year   = prv_clamp(year, 1900, 6000);      /* < 1970 → days < 0 → 0 */
  month  = prv_clamp(month, 1, 12);
  day    = prv_clamp(day, 1, 31);
  hour   = prv_clamp(hour, 0, 23);
  minute = prv_clamp(minute, 0, 59);
  const int32_t days = prv_days_from_civil(year, month, day);
  if (days < 0) {
    return 0;
  }
  return (uint32_t)days * 1440u + (uint32_t)hour * 60u + (uint32_t)minute;
}

/* Periodo t dell'istante: 0 se "mai"; giornaliero = numero di confini delle 04:00 superati. */
static uint32_t prv_period(uint32_t now_min, uint16_t interval_min) {
  if (interval_min == 0) {
    return 0;
  }
  if (interval_min == ROT_DAILY_MIN) {
    /* Confini delle 04:00 superati, senza somme che possano traboccare (uint32 fino a 2^32 − 1). */
    const uint32_t boundary = ROT_DAILY_HOUR * 60u;
    return (now_min >= boundary) ? (now_min - boundary) / ROT_DAILY_MIN + 1u : 0u;
  }
  return now_min / interval_min;
}

/* Hash a 32 bit (lowbias32) per seminare il generatore dal numero di round. */
static uint32_t prv_hash32(uint32_t x) {
  x ^= x >> 16;
  x *= 0x7FEB352Du;
  x ^= x >> 15;
  x *= 0x846CA68Bu;
  x ^= x >> 16;
  return x;
}

static uint32_t prv_xorshift32(uint32_t *s) {
  uint32_t x = *s;
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  *s = x;
  return x;
}

/* Permutazione di 0..n−1 del round dato (Fisher–Yates). p ha spazio per GAL_MAX_SLOTS. */
static void prv_permutation(uint32_t round, uint8_t n, uint8_t *p) {
  for (uint8_t i = 0; i < n; i++) {
    p[i] = i;
  }
  uint32_t s = prv_hash32(round * 0x9E3779B9u + 0x5BD1E995u);
  if (s == 0) {
    s = 0x1234567u;                          /* xorshift non deve partire da 0 */
  }
  for (uint8_t i = n - 1; i > 0; i--) {
    const uint8_t j = (uint8_t)(prv_xorshift32(&s) % (uint32_t)(i + 1u));
    const uint8_t tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
}

uint8_t rotation_index(uint32_t now_min, uint8_t n, uint16_t interval_min, uint8_t order, uint16_t shake_offset) {
  if (n == 0) {
    return 0;
  }
  if (n > GAL_MAX_SLOTS) {
    n = GAL_MAX_SLOTS;
  }
  const uint32_t k = prv_period(now_min, interval_min) + shake_offset;
  if (order == 0 || n <= 2) {
    return (uint8_t)(k % n);                 /* sequenziale (n ≤ 2: il casuale degenera) */
  }
  const uint32_t round = k / n;
  const uint8_t  pos = (uint8_t)(k % n);
  uint8_t p[GAL_MAX_SLOTS];
  prv_permutation(round, n, p);
  if (round > 0) {
    /* L'ultimo del round precedente non è toccato dallo scambio (posizioni 0 e 1, n ≥ 3). */
    uint8_t q[GAL_MAX_SLOTS];
    prv_permutation(round - 1u, n, q);
    if (p[0] == q[n - 1]) {
      const uint8_t tmp = p[0];
      p[0] = p[1];
      p[1] = tmp;
    }
  }
  return p[pos];
}

/* Aggiunge slot alla sequenza se mostrabile e non ancora presente. */
static void prv_push(const GalManifest *m, uint8_t slot, uint8_t native_format, uint16_t skip_mask,
                     uint16_t *seen, uint8_t *out, uint8_t *n) {
  if (slot >= GAL_MAX_SLOTS) {
    return;
  }
  const uint16_t bit = (uint16_t)(1u << slot);
  if ((*seen & bit) || (skip_mask & bit)) {
    return;
  }
  const GalSlotMeta *s = &m->slots[slot];
  if (s->state != GAL_SLOT_VALID || s->format != native_format) {
    return;
  }
  *seen |= bit;
  out[(*n)++] = slot;
}

uint8_t rotation_sequence(const GalManifest *m, uint8_t native_format, uint16_t skip_mask, uint8_t *out) {
  if (!m || !out) {
    return 0;
  }
  uint16_t seen = 0;
  uint8_t  n = 0;
  for (uint8_t i = 0; i < GAL_MAX_SLOTS && m->order[i] != GAL_SLOT_NONE; i++) {
    prv_push(m, m->order[i], native_format, skip_mask, &seen, out, &n);
  }
  if (n == 0) {                              /* order[] vuoto o inutile: ordine naturale */
    for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {
      prv_push(m, k, native_format, skip_mask, &seen, out, &n);
    }
  }
  return n;
}

uint8_t rotation_slot(uint32_t now_min, const GalManifest *m, uint8_t native_format, uint16_t skip_mask,
                      uint16_t interval_min, uint8_t order, uint16_t shake_offset) {
  uint8_t seq[GAL_MAX_SLOTS];
  const uint8_t n = rotation_sequence(m, native_format, skip_mask, seq);
  if (n == 0) {
    return GAL_SLOT_NONE;
  }
  return seq[rotation_index(now_min, n, interval_min, order, shake_offset)];
}

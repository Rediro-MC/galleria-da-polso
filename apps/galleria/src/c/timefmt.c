/* timefmt.c — vedi timefmt.h. Nessuna dipendenza da pebble.h né da printf. */
#include "timefmt.h"

bool timefmt_resolve_24h(uint8_t clock_mode, bool system_24h) {
  switch (clock_mode) {
    case TIMEFMT_CLOCK_12H: return false;
    case TIMEFMT_CLOCK_24H: return true;
    default:                return system_24h;
  }
}

bool timefmt_resolve_leading_zero(uint8_t lz_mode, bool is24h) {
  switch (lz_mode) {
    case TIMEFMT_LZ_ON:  return true;
    case TIMEFMT_LZ_OFF: return false;
    default:             return is24h;
  }
}

static int prv_clamp(int v, int lo, int hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

size_t timefmt_hhmm(char *buf, size_t size, int hour, int minute, bool is24h, bool leading_zero) {
  if (!buf || size == 0) {
    return 0;
  }
  hour = prv_clamp(hour, 0, 23);
  minute = prv_clamp(minute, 0, 59);

  int h = hour;
  if (!is24h) {
    h = hour % 12;
    if (h == 0) {
      h = 12;
    }
  }

  char tmp[TIMEFMT_HHMM_BUFSZ];
  size_t n = 0;
  if (h >= 10) {
    tmp[n++] = (char)('0' + h / 10);
  } else if (leading_zero) {
    tmp[n++] = '0';
  }
  tmp[n++] = (char)('0' + h % 10);
  tmp[n++] = ':';
  tmp[n++] = (char)('0' + minute / 10);
  tmp[n++] = (char)('0' + minute % 10);

  if (n + 1 > size) {
    buf[0] = '\0';
    return 0;
  }
  for (size_t i = 0; i < n; i++) {
    buf[i] = tmp[i];
  }
  buf[n] = '\0';
  return n;
}

const char *timefmt_ampm(int hour) {
  return prv_clamp(hour, 0, 23) < 12 ? "AM" : "PM";
}

size_t timefmt_grouped_uint(char *buf, size_t size, uint32_t value, char sep) {
  if (!buf || size == 0) {
    return 0;
  }
  /* Massimo: 4.294.967.295 → 13 caratteri + NUL. Riempito da destra. */
  char tmp[16];
  size_t pos = sizeof(tmp);
  tmp[--pos] = '\0';
  unsigned digits = 0;
  do {
    if (sep && digits > 0 && (digits % 3) == 0) {
      tmp[--pos] = sep;
    }
    tmp[--pos] = (char)('0' + (value % 10u));
    value /= 10u;
    digits++;
  } while (value > 0);

  size_t n = sizeof(tmp) - 1 - pos;
  if (n + 1 > size) {
    buf[0] = '\0';
    return 0;
  }
  for (size_t i = 0; i <= n; i++) {
    buf[i] = tmp[pos + i];
  }
  return n;
}

/* test_crc.c — test host di crc.c (nessun pebble.h). */
#include <stdio.h>
#include <string.h>
#include "crc.h"

static int g_fail, g_pass;

#define CHECK(cond) do { \
    if (cond) { g_pass++; } \
    else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)

/* Riferimento bit a bit (indipendente dalle tabelle a nibble). */
static uint32_t ref_crc32(uint32_t crc, const uint8_t *p, uint32_t n) {
  crc = ~crc;
  for (uint32_t i = 0; i < n; i++) {
    crc ^= p[i];
    for (uint8_t k = 0; k < 8; k++) {
      crc = (crc & 1u) ? (crc >> 1) ^ 0xEDB88320u : (crc >> 1);
    }
  }
  return ~crc;
}

static uint16_t ref_crc16(uint16_t crc, const uint8_t *p, uint32_t n) {
  for (uint32_t i = 0; i < n; i++) {
    crc = (uint16_t)(crc ^ (uint16_t)(p[i] << 8));
    for (uint8_t k = 0; k < 8; k++) {
      crc = (uint16_t)((crc & 0x8000u) ? (uint16_t)(crc << 1) ^ 0x1021u : (uint16_t)(crc << 1));
    }
  }
  return crc;
}

static uint32_t g_seed = 12345u;
static uint8_t prv_rand8(void) {
  g_seed = g_seed * 1103515245u + 12345u;
  return (uint8_t)(g_seed >> 16);
}

static uint8_t g_buf[1000];

static void check_vec32(const char *s, uint32_t exp) {
  uint32_t got = crc32_update(0, (const uint8_t *)s, (uint32_t)strlen(s));
  if (got != exp) {
    g_fail++;
    printf("FAIL crc32(\"%s\") = %08lX, atteso %08lX\n", s, (unsigned long)got, (unsigned long)exp);
  } else {
    g_pass++;
  }
}

static void check_vec16(const char *s, uint16_t exp) {
  uint16_t got = crc16_ccitt((const uint8_t *)s, (uint32_t)strlen(s));
  if (got != exp) {
    g_fail++;
    printf("FAIL crc16(\"%s\") = %04X, atteso %04X\n", s, (unsigned)got, (unsigned)exp);
  } else {
    g_pass++;
  }
}

int main(void) {
  static const uint8_t check[9] = { '1', '2', '3', '4', '5', '6', '7', '8', '9' };

  /* --- vettori noti --- */
  check_vec32("123456789", 0xCBF43926u);
  check_vec32("", 0x00000000u);
  check_vec32("a", 0xE8B7BE43u);
  check_vec32("abc", 0x352441C2u);
  check_vec32("The quick brown fox jumps over the lazy dog", 0x414FA339u);
  check_vec16("123456789", 0x29B1u);
  check_vec16("", 0xFFFFu);
  check_vec16("A", 0xB915u);
  check_vec16("a", 0x9D77u);
  check_vec16("abc", 0x514Au);
  check_vec16("The quick brown fox jumps over the lazy dog", 0x8FDDu);
  CHECK(crc16_ccitt_update(0xFFFFu, check, 9) == 0x29B1u);

  /* --- n == 0 con p NULL: identità sullo stato --- */
  CHECK(crc32_update(0, NULL, 0) == 0);
  CHECK(crc32_update(0xCBF43926u, NULL, 0) == 0xCBF43926u);
  CHECK(crc32_update(0xFFFFFFFFu, NULL, 0) == 0xFFFFFFFFu);
  CHECK(crc16_ccitt(NULL, 0) == 0xFFFFu);
  CHECK(crc16_ccitt_update(0x1234u, NULL, 0) == 0x1234u);

  /* --- incrementale: split in tutti i punti di "123456789" (anche 0 e 9) --- */
  for (uint32_t k = 0; k <= 9; k++) {
    uint32_t c32 = crc32_update(0, check, k);
    c32 = crc32_update(c32, check + k, 9 - k);
    CHECK(c32 == 0xCBF43926u);
    uint16_t c16 = crc16_ccitt_update(0xFFFFu, check, k);
    c16 = crc16_ccitt_update(c16, check + k, 9 - k);
    CHECK(c16 == 0x29B1u);
  }
  /* --- un byte alla volta --- */
  {
    uint32_t c32 = 0;
    uint16_t c16 = 0xFFFFu;
    for (uint32_t k = 0; k < 9; k++) {
      c32 = crc32_update(c32, check + k, 1);
      c16 = crc16_ccitt_update(c16, check + k, 1);
    }
    CHECK(c32 == 0xCBF43926u);
    CHECK(c16 == 0x29B1u);
  }

  /* --- tutti i 256 valori di un byte singolo contro il riferimento --- */
  for (uint32_t v = 0; v < 256; v++) {
    uint8_t b = (uint8_t)v;
    CHECK(crc32_update(0, &b, 1) == ref_crc32(0, &b, 1));
    CHECK(crc16_ccitt(&b, 1) == ref_crc16(0xFFFFu, &b, 1));
  }

  /* --- 1000 byte pseudo-casuali (LCG) contro il riferimento bit a bit --- */
  for (uint32_t i = 0; i < sizeof(g_buf); i++) {
    g_buf[i] = prv_rand8();
  }
  {
    uint32_t exp32 = ref_crc32(0, g_buf, sizeof(g_buf));
    uint16_t exp16 = ref_crc16(0xFFFFu, g_buf, sizeof(g_buf));
    CHECK(crc32_update(0, g_buf, sizeof(g_buf)) == exp32);
    CHECK(crc16_ccitt(g_buf, sizeof(g_buf)) == exp16);
    CHECK(exp32 != 0 && exp32 != 0xFFFFFFFFu);      /* sanità del riferimento */

    /* stesso buffer a blocchi di lunghezza pseudo-casuale (0..47) */
    uint32_t c32 = 0;
    uint16_t c16 = 0xFFFFu;
    uint32_t pos = 0;
    while (pos < sizeof(g_buf)) {
      uint32_t len = prv_rand8() % 48u;
      if (len > sizeof(g_buf) - pos) {
        len = sizeof(g_buf) - pos;
      }
      c32 = crc32_update(c32, g_buf + pos, len);
      c16 = crc16_ccitt_update(c16, g_buf + pos, len);
      pos += len;
    }
    CHECK(c32 == exp32);
    CHECK(c16 == exp16);

    /* prefissi: ogni prefisso di lunghezza 0..1000 a passi di 37 */
    for (uint32_t n = 0; n <= sizeof(g_buf); n += 37) {
      CHECK(crc32_update(0, g_buf, n) == ref_crc32(0, g_buf, n));
      CHECK(crc16_ccitt(g_buf, n) == ref_crc16(0xFFFFu, g_buf, n));
    }
  }

  /* --- un bit cambiato cambia il CRC --- */
  {
    uint32_t a = crc32_update(0, g_buf, sizeof(g_buf));
    uint16_t b = crc16_ccitt(g_buf, sizeof(g_buf));
    g_buf[500] ^= 0x10;
    CHECK(crc32_update(0, g_buf, sizeof(g_buf)) != a);
    CHECK(crc16_ccitt(g_buf, sizeof(g_buf)) != b);
  }

  printf("crc: %d ok, %d falliti\n", g_pass, g_fail);
  return g_fail ? 1 : 0;
}

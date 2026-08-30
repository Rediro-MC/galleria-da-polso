/* test_timefmt.c — test host di timefmt.c (nessun pebble.h). */
#include <stdio.h>
#include <string.h>
#include "timefmt.h"

static int g_fail, g_pass;

#define CHECK(cond) do { \
    if (cond) { g_pass++; } \
    else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)

static void check_hhmm(int h, int m, bool is24h, bool lz, const char *exp) {
  char buf[TIMEFMT_HHMM_BUFSZ];
  memset(buf, 'X', sizeof(buf));
  size_t n = timefmt_hhmm(buf, sizeof(buf), h, m, is24h, lz);
  if (n != strlen(exp) || strcmp(buf, exp) != 0) {
    g_fail++;
    printf("FAIL hhmm(%d,%d,%s,%s) = \"%s\" (n=%zu), atteso \"%s\"\n",
           h, m, is24h ? "24h" : "12h", lz ? "lz" : "nolz", buf, n, exp);
  } else {
    g_pass++;
  }
}

static void check_grouped(uint32_t v, char sep, const char *exp) {
  char buf[16];
  size_t n = timefmt_grouped_uint(buf, sizeof(buf), v, sep);
  if (n != strlen(exp) || strcmp(buf, exp) != 0) {
    g_fail++;
    printf("FAIL grouped(%lu,'%c') = \"%s\" (n=%zu), atteso \"%s\"\n",
           (unsigned long)v, sep ? sep : '0', buf, n, exp);
  } else {
    g_pass++;
  }
}

int main(void) {
  /* --- 24 h con zero iniziale --- */
  check_hhmm(0, 5, true, true, "00:05");
  check_hhmm(9, 7, true, true, "09:07");
  check_hhmm(12, 0, true, true, "12:00");
  check_hhmm(23, 59, true, true, "23:59");
  /* --- 24 h senza zero iniziale --- */
  check_hhmm(0, 5, true, false, "0:05");
  check_hhmm(9, 7, true, false, "9:07");
  check_hhmm(10, 0, true, false, "10:00");
  check_hhmm(23, 59, true, false, "23:59");
  /* --- 12 h senza zero iniziale --- */
  check_hhmm(0, 5, false, false, "12:05");
  check_hhmm(1, 0, false, false, "1:00");
  check_hhmm(11, 59, false, false, "11:59");
  check_hhmm(12, 0, false, false, "12:00");
  check_hhmm(13, 15, false, false, "1:15");
  check_hhmm(23, 59, false, false, "11:59");
  /* --- 12 h con zero iniziale --- */
  check_hhmm(4, 15, false, true, "04:15");
  check_hhmm(13, 15, false, true, "01:15");
  check_hhmm(0, 0, false, true, "12:00");
  /* --- saturazione --- */
  check_hhmm(-1, -1, true, true, "00:00");
  check_hhmm(24, 60, true, true, "23:59");
  check_hhmm(99, 99, false, false, "11:59");

  /* --- buffer troppo piccolo --- */
  {
    char small[5] = "abcd";
    CHECK(timefmt_hhmm(small, sizeof(small), 12, 34, true, true) == 0);
    CHECK(small[0] == '\0');
    CHECK(timefmt_hhmm(small, sizeof(small), 1, 2, true, false) == 4);   /* "1:02" ci sta */
    CHECK(strcmp(small, "1:02") == 0);
    CHECK(timefmt_hhmm(NULL, 10, 1, 2, true, false) == 0);
    CHECK(timefmt_hhmm(small, 0, 1, 2, true, false) == 0);
  }

  /* --- AM/PM --- */
  CHECK(strcmp(timefmt_ampm(0), "AM") == 0);
  CHECK(strcmp(timefmt_ampm(11), "AM") == 0);
  CHECK(strcmp(timefmt_ampm(12), "PM") == 0);
  CHECK(strcmp(timefmt_ampm(23), "PM") == 0);
  CHECK(strcmp(timefmt_ampm(-5), "AM") == 0);
  CHECK(strcmp(timefmt_ampm(50), "PM") == 0);

  /* --- risoluzione impostazioni --- */
  CHECK(timefmt_resolve_24h(TIMEFMT_CLOCK_AUTO, true) == true);
  CHECK(timefmt_resolve_24h(TIMEFMT_CLOCK_AUTO, false) == false);
  CHECK(timefmt_resolve_24h(TIMEFMT_CLOCK_12H, true) == false);
  CHECK(timefmt_resolve_24h(TIMEFMT_CLOCK_24H, false) == true);
  CHECK(timefmt_resolve_24h(200, true) == true);      /* valore sconosciuto → sistema */
  CHECK(timefmt_resolve_leading_zero(TIMEFMT_LZ_AUTO, true) == true);
  CHECK(timefmt_resolve_leading_zero(TIMEFMT_LZ_AUTO, false) == false);
  CHECK(timefmt_resolve_leading_zero(TIMEFMT_LZ_ON, false) == true);
  CHECK(timefmt_resolve_leading_zero(TIMEFMT_LZ_OFF, true) == false);
  CHECK(timefmt_resolve_leading_zero(77, false) == false); /* sconosciuto → AUTO */

  /* --- separatore delle migliaia --- */
  check_grouped(0, '.', "0");
  check_grouped(7, '.', "7");
  check_grouped(999, '.', "999");
  check_grouped(1000, '.', "1.000");
  check_grouped(6532, '.', "6.532");
  check_grouped(12345, ',', "12,345");
  check_grouped(999999, '.', "999.999");
  check_grouped(1234567, '.', "1.234.567");
  check_grouped(4294967295u, '.', "4.294.967.295");
  check_grouped(1234567, 0, "1234567");
  {
    char small[5] = "abcd";
    CHECK(timefmt_grouped_uint(small, sizeof(small), 1000, '.') == 0);   /* "1.000" non ci sta */
    CHECK(small[0] == '\0');
    CHECK(timefmt_grouped_uint(small, sizeof(small), 1000, 0) == 4);     /* "1000" ci sta */
    CHECK(strcmp(small, "1000") == 0);
    CHECK(timefmt_grouped_uint(NULL, 5, 1, '.') == 0);
    CHECK(timefmt_grouped_uint(small, 0, 1, '.') == 0);
  }

  printf("timefmt: %d ok, %d falliti\n", g_pass, g_fail);
  return g_fail ? 1 : 0;
}

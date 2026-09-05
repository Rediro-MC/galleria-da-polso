/* test_datefmt.c — test host ADVERSARIALE di datefmt.c (S10, D34; nessun pebble.h).
 * Esegue: make -C apps/galleria/test run-test_datefmt
 * Base (agente C): esaustivo su lingue × giorni × date × mesi × livelli per lunghezza/overflow e stringa
 * attesa, campioni della spec, UTF-8 dei pack, indici clampati, buffer piccoli, separatori.
 * Test-writer (C-TEST): (A) griglia 4 lingue × 7 giorni × 12 mesi × 3 livelli × mday {1, 9, 10, 31} con
 * limiti di lunghezza per livello e per numero di cifre (in byte E in caratteri UTF-8), UTF-8 valido, mai
 * U+00A0/U+202F, massimo osservato == DATEFMT_MAX_LEN (13: fr "Dim 31 Juill." e "Dim 31 Févr." in byte — il
 * "≤ 12" del brief vale per tutte le altre combinazioni ed e' pinnato come tale); (B) canary su OGNI cap per
 * tutti i 31.248 casi (cap = n+1, n, n−1, 1, 2, 4, 8, 14, 32: nessun byte oltre cap, NUL in cap−1 quando
 * tronca, prefisso esatto); (C) campioni espliciti per lingua e livello dalla tabella della spec §0/D34
 * (incluso it "Mar 3 Mar": martedi' 3 marzo, stesso testo per giorno e mese); (D) separatore delle
 * migliaia su tutti i 256 valori di lang; (E) clamp PER LINGUA (wday 7/255 == 6, mon 12/255 == 11, lang
 * 5/6/100/255 == EN: senza clamp l'indice 7 legge la riga della lingua successiva); (F) mday 0/255 con il
 * buffer minimo (troncamento pulito); (G) costanti pinnate; (H) nessuna dipendenza dal contenuto
 * precedente del buffer; (I) byte ≥ 0x80 SOLO in de Mär e fr Févr./Août/Déc., mai ai livelli 1/2.
 * Ogni mutante di datefmt.c (mese scambiato, de senza virgola, clamp tolto, fr a punto, de livello 1 senza
 * punto, cap ignorato, clamp di lang tolto, livello >= 2 -> == 2, EN a punto, Mär senza umlaut) deve far
 * fallire almeno un CHECK: vedi il report della sessione (scratchpad mutants.sh). */
#include <stdio.h>
#include <string.h>
#include "datefmt.h"

static int g_fail, g_pass;

#define CHECK(cond) do { \
    if (cond) { g_pass++; } \
    else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)
#define CHECK_EQ(a, b) do { long long _a = (long long)(a), _b = (long long)(b); \
    if (_a == _b) { g_pass++; } \
    else { g_fail++; printf("FAIL %s:%d: %s = %lld, atteso %s = %lld\n", __FILE__, __LINE__, #a, _a, #b, _b); } \
  } while (0)

/* Copie indipendenti delle tabelle dei pack (spec S10 §0): il test non legge quelle di datefmt.c. */
static const char *const EXP_WD[4][7] = {
  { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" },
  { "Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab" },
  { "So", "Mo", "Di", "Mi", "Do", "Fr", "Sa" },
  { "Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam" },
};
static const char *const EXP_MON[4][12] = {
  { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" },
  { "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic" },
  { "Jan", "Feb", "M\xC3\xA4r", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez" },
  { "Janv.", "F\xC3\xA9vr.", "Mars", "Avr.", "Mai", "Juin", "Juill.", "Ao\xC3\xBBt", "Sept.", "Oct.", "Nov.", "D\xC3\xA9" "c." },
};

static void check_fmt(uint8_t lang, uint8_t wday, uint8_t mday, uint8_t mon, uint8_t level, const char *exp) {
  char buf[DATEFMT_BUFSZ + 4];
  memset(buf, 0x7F, sizeof(buf));
  datefmt_format(buf, DATEFMT_BUFSZ, lang, wday, mday, mon, level);
  if (strcmp(buf, exp) != 0) {
    g_fail++;
    printf("FAIL fmt(lang %u, wd %u, %u, mon %u, lv %u) = \"%s\", atteso \"%s\"\n",
           lang, wday, mday, mon, level, buf, exp);
  } else {
    g_pass++;
  }
  CHECK(buf[DATEFMT_BUFSZ] == 0x7F && buf[DATEFMT_BUFSZ + 1] == 0x7F);   /* nessun byte oltre cap */
}

/* Stringa attesa costruita dalle tabelle del test con il formato per lingua (D34). */
static void expected(char *out, size_t cap, uint8_t lang, uint8_t wday, uint8_t mday, uint8_t mon, uint8_t level) {
  const uint8_t li = (uint8_t)(lang - 1);
  if (level >= 2) {
    snprintf(out, cap, "%u", (unsigned)mday);
  } else if (lang == DATEFMT_LANG_DE) {
    if (level == 1) snprintf(out, cap, "%s, %u.", EXP_WD[li][wday], (unsigned)mday);
    else            snprintf(out, cap, "%s, %u. %s", EXP_WD[li][wday], (unsigned)mday, EXP_MON[li][mon]);
  } else if (level == 1) {
    snprintf(out, cap, "%s %u", EXP_WD[li][wday], (unsigned)mday);
  } else {
    snprintf(out, cap, "%s %u %s", EXP_WD[li][wday], (unsigned)mday, EXP_MON[li][mon]);
  }
}

/* ---- helper del test-writer ---- */

/* UTF-8 ben formato (solo sequenze a 1 e 2 byte: i pack non ne hanno di piu' lunghe); -1 se rotto,
 * altrimenti il numero di caratteri. */
static int utf8_chars(const char *s) {
  int n = 0;
  for (const unsigned char *p = (const unsigned char *)s; *p; p++, n++) {
    if (*p < 0x80) {
      continue;
    }
    if ((*p & 0xE0) != 0xC0 || (p[1] & 0xC0) != 0x80) {
      return -1;                          /* byte alto isolato, sequenza > 2 byte o continuazione mancante */
    }
    p++;
  }
  return n;
}

static int has_high_byte(const char *s) {
  for (const unsigned char *p = (const unsigned char *)s; *p; p++) {
    if (*p >= 0x80) {
      return 1;
    }
  }
  return 0;
}

/* U+00A0 (C2 A0) e U+202F (E2 80 AF) non devono comparire: i font di sistema non hanno U+202F (D34). */
static int has_nbsp(const char *s) {
  return strstr(s, "\xC2\xA0") != NULL || strstr(s, "\xE2\x80\xAF") != NULL;
}

/* Chiama datefmt_format con `cap` su un buffer di 40 B pieno di 0xA5 e verifica: nessun byte da cap in
 * poi toccato; con cap >= 1 un NUL entro cap; l'output e' il prefisso di `full` lungo min(n, cap-1).
 * Ritorna 1 se tutto torna. */
static int canary_cap(uint8_t lang, uint8_t wday, uint8_t mday, uint8_t mon, uint8_t level,
                      size_t cap, const char *full) {
  unsigned char buf[40];
  memset(buf, 0xA5, sizeof(buf));
  datefmt_format((char *)buf, cap, lang, wday, mday, mon, level);
  for (size_t i = cap; i < sizeof(buf); i++) {
    if (buf[i] != 0xA5) {
      return 0;
    }
  }
  if (cap == 0) {
    return 1;
  }
  const size_t n = strlen(full);
  const size_t want = n < cap - 1 ? n : cap - 1;
  if (buf[want] != '\0') {
    return 0;
  }
  return memcmp(buf, full, want) == 0;
}

int main(void) {
  /* --- campioni della spec (sabato 5 settembre 2026: wday 6, mday 5, mon 8) --- */
  check_fmt(DATEFMT_LANG_EN, 6, 5, 8, 0, "Sat 5 Sep");
  check_fmt(DATEFMT_LANG_IT, 6, 5, 8, 0, "Sab 5 Set");
  check_fmt(DATEFMT_LANG_FR, 6, 5, 8, 0, "Sam 5 Sept.");
  check_fmt(DATEFMT_LANG_DE, 6, 5, 8, 0, "Sa, 5. Sep");
  check_fmt(DATEFMT_LANG_EN, 6, 5, 8, 1, "Sat 5");
  check_fmt(DATEFMT_LANG_IT, 6, 5, 8, 1, "Sab 5");
  check_fmt(DATEFMT_LANG_FR, 6, 5, 8, 1, "Sam 5");
  check_fmt(DATEFMT_LANG_DE, 6, 5, 8, 1, "Sa, 5.");
  for (uint8_t lang = 1; lang <= 4; lang++) {
    check_fmt(lang, 6, 5, 8, 2, "5");
    check_fmt(lang, 6, 31, 11, 2, "31");
  }
  /* --- UTF-8 dei pack: byte esatti --- */
  check_fmt(DATEFMT_LANG_DE, 3, 4, 2, 0, "Mi, 4. M\xC3\xA4r");
  check_fmt(DATEFMT_LANG_FR, 0, 1, 7, 0, "Dim 1 Ao\xC3\xBBt");
  check_fmt(DATEFMT_LANG_FR, 2, 24, 11, 0, "Mar 24 D\xC3\xA9" "c.");
  check_fmt(DATEFMT_LANG_FR, 4, 14, 1, 0, "Jeu 14 F\xC3\xA9vr.");
  /* --- la stringa piu' lunga: fr "Dim 31 Juill." = DATEFMT_MAX_LEN --- */
  {
    char buf[DATEFMT_BUFSZ];
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_FR, 0, 31, 6, 0);
    CHECK(strcmp(buf, "Dim 31 Juill.") == 0);
    CHECK(strlen(buf) == DATEFMT_MAX_LEN);
  }

  /* --- esaustivo: 4 lingue × 7 giorni × 31 date × 12 mesi × 3 livelli = 31.248 casi --- */
  {
    char buf[DATEFMT_BUFSZ + 4];
    char exp[32];
    uint32_t cases = 0, bad = 0;
    for (uint8_t lang = 1; lang <= 4; lang++) {
      for (uint8_t wday = 0; wday < 7; wday++) {
        for (uint8_t mday = 1; mday <= 31; mday++) {
          for (uint8_t mon = 0; mon < 12; mon++) {
            for (uint8_t level = 0; level < 3; level++) {
              memset(buf, 0x7F, sizeof(buf));
              datefmt_format(buf, DATEFMT_BUFSZ, lang, wday, mday, mon, level);
              expected(exp, sizeof(exp), lang, wday, mday, mon, level);
              const size_t n = strlen(buf);
              cases++;
              if (n == 0 || n > DATEFMT_MAX_LEN || strcmp(buf, exp) != 0
                  || buf[DATEFMT_BUFSZ] != 0x7F || buf[DATEFMT_BUFSZ + 3] != 0x7F) {
                bad++;
                if (bad <= 5) {
                  printf("FAIL esaustivo lang %u wd %u %u mon %u lv %u: \"%s\" atteso \"%s\"\n",
                         lang, wday, mday, mon, level, buf, exp);
                }
              }
            }
          }
        }
      }
    }
    CHECK(cases == 31248u);
    CHECK(bad == 0);
  }

  /* --- indici clampati --- */
  check_fmt(0,   6, 5, 8, 0, "Sat 5 Sep");     /* auto: se arriva qui vale EN */
  check_fmt(5,   6, 5, 8, 0, "Sat 5 Sep");
  check_fmt(255, 6, 5, 8, 0, "Sat 5 Sep");
  check_fmt(DATEFMT_LANG_IT, 7,   5, 8, 0, "Sab 5 Set");   /* wday > 6 -> sabato */
  check_fmt(DATEFMT_LANG_IT, 255, 5, 8, 0, "Sab 5 Set");
  check_fmt(DATEFMT_LANG_IT, 6, 5, 12,  0, "Sab 5 Dic");   /* mon > 11 -> dicembre */
  check_fmt(DATEFMT_LANG_IT, 6, 5, 255, 0, "Sab 5 Dic");
  check_fmt(DATEFMT_LANG_DE, 6, 5, 8, 3,   "5");           /* livello > 2 -> solo il giorno */
  check_fmt(DATEFMT_LANG_DE, 6, 5, 8, 255, "5");
  check_fmt(DATEFMT_LANG_EN, 0, 0, 0, 0, "Sun 0 Jan");     /* struct tm azzerata (prima del primo tick) */
  check_fmt(DATEFMT_LANG_EN, 6, 255, 11, 0, "Sat 255 Dec");   /* mday non viene clampato ma non sfonda */

  /* --- buffer piccoli e argomenti nulli --- */
  {
    char small[6];
    memset(small, 0x7F, sizeof(small));
    datefmt_format(small, 4, DATEFMT_LANG_EN, 6, 5, 8, 0);
    CHECK(strcmp(small, "Sat") == 0);                       /* troncato con NUL */
    CHECK(small[4] == 0x7F && small[5] == 0x7F);
    memset(small, 0x7F, sizeof(small));
    datefmt_format(small, 1, DATEFMT_LANG_EN, 6, 5, 8, 0);
    CHECK(small[0] == '\0' && small[1] == 0x7F);
    memset(small, 0x7F, sizeof(small));
    datefmt_format(small, 0, DATEFMT_LANG_EN, 6, 5, 8, 0);
    CHECK(small[0] == 0x7F);                                /* cap 0: intatto */
    datefmt_format(NULL, 16, DATEFMT_LANG_EN, 6, 5, 8, 0);  /* nessun crash */
    g_pass++;
  }

  /* --- separatore delle migliaia (D34) --- */
  CHECK(datefmt_thousands_sep(DATEFMT_LANG_EN) == ',');
  CHECK(datefmt_thousands_sep(DATEFMT_LANG_IT) == '.');
  CHECK(datefmt_thousands_sep(DATEFMT_LANG_DE) == '.');
  CHECK(datefmt_thousands_sep(DATEFMT_LANG_FR) == ' ');
  CHECK(datefmt_thousands_sep(0) == ',');
  CHECK(datefmt_thousands_sep(5) == ',');
  CHECK(datefmt_thousands_sep(255) == ',');

  /* ================= test-writer adversariale (C-TEST) ================= */

  /* --- (G) costanti pinnate: il chiamante (ui_time.c) dimensiona s_date_buf su DATEFMT_BUFSZ --- */
  CHECK_EQ(DATEFMT_MAX_LEN, 13);
  CHECK_EQ(DATEFMT_BUFSZ, 14);
  CHECK_EQ(DATEFMT_LANG_EN, 1);
  CHECK_EQ(DATEFMT_LANG_IT, 2);
  CHECK_EQ(DATEFMT_LANG_DE, 3);
  CHECK_EQ(DATEFMT_LANG_FR, 4);

  /* --- (A) griglia del brief: 4 lingue × 7 giorni × 12 mesi × 3 livelli × mday {1, 9, 10, 31} = 4.032 --- */
  {
    static const uint8_t MDAYS[4] = { 1, 9, 10, 31 };
    char buf[40];
    char exp[32];
    uint32_t cases = 0, bad = 0, max0 = 0, max1 = 0, max2 = 0, max0_chars = 0;
    uint32_t at13 = 0, at13_fr_fev_juil = 0;
    for (uint8_t lang = 1; lang <= 4; lang++) {
      for (uint8_t wday = 0; wday < 7; wday++) {
        for (uint8_t mon = 0; mon < 12; mon++) {
          for (uint8_t level = 0; level < 3; level++) {
            for (uint8_t k = 0; k < 4; k++) {
              const uint8_t mday = MDAYS[k];
              memset(buf, 0xA5, sizeof(buf));
              datefmt_format(buf, DATEFMT_BUFSZ, lang, wday, mday, mon, level);
              expected(exp, sizeof(exp), lang, wday, mday, mon, level);
              const size_t n = strlen(buf);
              const int chars = utf8_chars(buf);
              cases++;
              int ok = strcmp(buf, exp) == 0 && chars > 0 && !has_nbsp(buf)
                    && (unsigned char)buf[DATEFMT_BUFSZ] == 0xA5;
              if (level == 0) {
                /* due cifre: ≤ 13 byte (spec §2.1 "12+1"); una cifra: ≤ 12; il "≤ 12" del brief vale
                 * per tutto tranne fr Févr. (13 byte, 12 caratteri) e fr Juill. (13 e 13) */
                const int fr_long = (lang == DATEFMT_LANG_FR && (mon == 1 || mon == 6));
                ok = ok && n <= DATEFMT_MAX_LEN && (size_t)chars <= DATEFMT_MAX_LEN;
                ok = ok && (mday >= 10 || n <= 12);
                ok = ok && (fr_long || n <= 12);
                if (n > max0) max0 = (uint32_t)n;
                if ((uint32_t)chars > max0_chars) max0_chars = (uint32_t)chars;
                if (n == 13) { at13++; if (fr_long && mday >= 10) at13_fr_fev_juil++; }
              } else if (level == 1) {
                ok = ok && n <= 7;              /* "Sab 31", de "Sa, 31." = 7 */
                if (n > max1) max1 = (uint32_t)n;
              } else {
                ok = ok && n <= 2 && !has_high_byte(buf);
                if (n > max2) max2 = (uint32_t)n;
              }
              if (!ok) {
                bad++;
                if (bad <= 5) {
                  printf("FAIL griglia lang %u wd %u %u mon %u lv %u: \"%s\" (n %u, chars %d) atteso \"%s\"\n",
                         lang, wday, mday, mon, level, buf, (unsigned)n, chars, exp);
                }
              }
            }
          }
        }
      }
    }
    CHECK_EQ(cases, 4032u);
    CHECK_EQ(bad, 0u);
    CHECK_EQ(max0, DATEFMT_MAX_LEN);          /* la costante non e' stantia: il massimo viene raggiunto */
    CHECK_EQ(max0_chars, 13u);                /* anche in caratteri ("Dim 31 Juill.") */
    CHECK_EQ(max1, 7u);
    CHECK_EQ(max2, 2u);
    CHECK_EQ(at13, at13_fr_fev_juil);         /* i 13 byte SOLO da fr Févr./Juill. con due cifre */
    CHECK_EQ(at13, 2u * 7u * 2u);             /* 2 mesi × 7 giorni × mday {10, 31} = 28 */
  }

  /* --- (B) canary su ogni cap per tutti i 31.248 casi --- */
  {
    static const size_t CAPS[] = { 1, 2, 4, 8, 14, 32 };
    char full[32];
    uint32_t calls = 0, bad = 0;
    for (uint8_t lang = 1; lang <= 4; lang++) {
      for (uint8_t wday = 0; wday < 7; wday++) {
        for (uint8_t mday = 1; mday <= 31; mday++) {
          for (uint8_t mon = 0; mon < 12; mon++) {
            for (uint8_t level = 0; level < 3; level++) {
              expected(full, sizeof(full), lang, wday, mday, mon, level);
              const size_t n = strlen(full);
              size_t caps[9];
              size_t nc = 0;
              caps[nc++] = n + 1;                     /* esatto: stringa intera */
              caps[nc++] = n;                         /* un byte in meno: tronca l'ultimo carattere */
              if (n > 1) caps[nc++] = n - 1;
              for (size_t i = 0; i < sizeof(CAPS) / sizeof(CAPS[0]); i++) caps[nc++] = CAPS[i];
              for (size_t i = 0; i < nc; i++) {
                calls++;
                if (!canary_cap(lang, wday, mday, mon, level, caps[i], full)) {
                  bad++;
                  if (bad <= 5) {
                    printf("FAIL canary lang %u wd %u %u mon %u lv %u cap %u (\"%s\")\n",
                           lang, wday, mday, mon, level, (unsigned)caps[i], full);
                  }
                }
              }
            }
          }
        }
      }
    }
    CHECK(calls >= 31248u * 8u);
    CHECK_EQ(bad, 0u);
    /* cap 0 e NULL su un campione: nessuna scrittura, nessun crash */
    CHECK(canary_cap(DATEFMT_LANG_FR, 0, 31, 6, 0, 0, "Dim 31 Juill."));
    datefmt_format(NULL, 0, DATEFMT_LANG_FR, 0, 31, 6, 0);
    datefmt_format(NULL, 1, DATEFMT_LANG_DE, 6, 31, 11, 1);
    g_pass++;
  }

  /* --- (C) campioni espliciti per lingua e livello (spec §0 + D34) --- */
  {
    static const struct { uint8_t lang, wday, mday, mon, level; const char *exp; } S[] = {
      /* en */
      { DATEFMT_LANG_EN, 3, 1, 0, 0, "Wed 1 Jan" },   { DATEFMT_LANG_EN, 3, 1, 0, 1, "Wed 1" },
      { DATEFMT_LANG_EN, 0, 25, 11, 0, "Sun 25 Dec" }, { DATEFMT_LANG_EN, 0, 25, 11, 1, "Sun 25" },
      { DATEFMT_LANG_EN, 0, 25, 11, 2, "25" },        { DATEFMT_LANG_EN, 1, 10, 4, 0, "Mon 10 May" },
      { DATEFMT_LANG_EN, 5, 9, 9, 0, "Fri 9 Oct" },
      /* it */
      { DATEFMT_LANG_IT, 0, 1, 0, 0, "Dom 1 Gen" },   { DATEFMT_LANG_IT, 5, 15, 7, 0, "Ven 15 Ago" },
      { DATEFMT_LANG_IT, 2, 3, 2, 0, "Mar 3 Mar" },   { DATEFMT_LANG_IT, 2, 3, 2, 1, "Mar 3" },
      { DATEFMT_LANG_IT, 4, 30, 5, 0, "Gio 30 Giu" }, { DATEFMT_LANG_IT, 3, 31, 9, 0, "Mer 31 Ott" },
      { DATEFMT_LANG_IT, 1, 10, 6, 0, "Lun 10 Lug" }, { DATEFMT_LANG_IT, 6, 8, 3, 0, "Sab 8 Apr" },
      { DATEFMT_LANG_IT, 6, 8, 4, 0, "Sab 8 Mag" },   { DATEFMT_LANG_IT, 6, 8, 10, 0, "Sab 8 Nov" },
      { DATEFMT_LANG_IT, 6, 8, 1, 0, "Sab 8 Feb" },   { DATEFMT_LANG_IT, 6, 8, 11, 2, "8" },
      /* de (virgola dopo il giorno, punto dopo la data: %c del pack) */
      { DATEFMT_LANG_DE, 1, 1, 0, 0, "Mo, 1. Jan" },  { DATEFMT_LANG_DE, 1, 1, 0, 1, "Mo, 1." },
      { DATEFMT_LANG_DE, 2, 3, 2, 0, "Di, 3. M\xC3\xA4r" }, { DATEFMT_LANG_DE, 0, 24, 11, 0, "So, 24. Dez" },
      { DATEFMT_LANG_DE, 0, 24, 11, 1, "So, 24." },   { DATEFMT_LANG_DE, 4, 10, 9, 0, "Do, 10. Okt" },
      { DATEFMT_LANG_DE, 5, 31, 4, 0, "Fr, 31. Mai" }, { DATEFMT_LANG_DE, 6, 9, 7, 0, "Sa, 9. Aug" },
      { DATEFMT_LANG_DE, 3, 20, 5, 0, "Mi, 20. Jun" }, { DATEFMT_LANG_DE, 3, 20, 6, 0, "Mi, 20. Jul" },
      { DATEFMT_LANG_DE, 3, 20, 1, 0, "Mi, 20. Feb" }, { DATEFMT_LANG_DE, 3, 20, 3, 0, "Mi, 20. Apr" },
      { DATEFMT_LANG_DE, 3, 20, 8, 0, "Mi, 20. Sep" }, { DATEFMT_LANG_DE, 3, 20, 10, 0, "Mi, 20. Nov" },
      { DATEFMT_LANG_DE, 3, 20, 10, 2, "20" },
      /* fr (abbreviazioni con il punto dove il pack lo mette) */
      { DATEFMT_LANG_FR, 1, 1, 0, 0, "Lun 1 Janv." },  { DATEFMT_LANG_FR, 6, 14, 6, 0, "Sam 14 Juill." },
      { DATEFMT_LANG_FR, 1, 15, 7, 0, "Lun 15 Ao\xC3\xBBt" }, { DATEFMT_LANG_FR, 3, 11, 10, 0, "Mer 11 Nov." },
      { DATEFMT_LANG_FR, 5, 1, 4, 0, "Ven 1 Mai" },    { DATEFMT_LANG_FR, 0, 31, 2, 0, "Dim 31 Mars" },
      { DATEFMT_LANG_FR, 0, 31, 2, 1, "Dim 31" },      { DATEFMT_LANG_FR, 4, 2, 3, 0, "Jeu 2 Avr." },
      { DATEFMT_LANG_FR, 2, 21, 5, 0, "Mar 21 Juin" }, { DATEFMT_LANG_FR, 6, 30, 8, 0, "Sam 30 Sept." },
      { DATEFMT_LANG_FR, 6, 12, 9, 0, "Sam 12 Oct." },  { DATEFMT_LANG_FR, 6, 25, 11, 0, "Sam 25 D\xC3\xA9" "c." },
      { DATEFMT_LANG_FR, 6, 28, 1, 0, "Sam 28 F\xC3\xA9vr." }, { DATEFMT_LANG_FR, 6, 28, 1, 2, "28" },
    };
    for (size_t i = 0; i < sizeof(S) / sizeof(S[0]); i++) {
      check_fmt(S[i].lang, S[i].wday, S[i].mday, S[i].mon, S[i].level, S[i].exp);
    }
    CHECK_EQ(strlen("Sam 30 Sept."), 12u);        /* il massimo del brief... */
    CHECK_EQ(strlen("Dim 31 Juill."), 13u);       /* ...e quello vero (byte = caratteri) */
    CHECK_EQ(strlen("Dim 31 F\xC3\xA9vr."), 13u); /* 13 byte, 12 caratteri */
    CHECK_EQ(utf8_chars("Dim 31 F\xC3\xA9vr."), 12);
  }

  /* --- (D) separatore delle migliaia su tutti i 256 valori --- */
  {
    int comma = 0, dot = 0, space = 0, other = 0;
    for (unsigned l = 0; l < 256u; l++) {
      const char c = datefmt_thousands_sep((uint8_t)l);
      if (c == ',') comma++;
      else if (c == '.') dot++;
      else if (c == ' ') space++;
      else other++;
      /* mai un byte >= 0x80 (U+00A0/U+202F non ci stanno in un char e non sono nei font) e mai 0 */
      CHECK((unsigned char)c < 0x80 && c != '\0');
    }
    CHECK_EQ(dot, 2);                               /* it, de */
    CHECK_EQ(space, 1);                             /* fr */
    CHECK_EQ(comma, 253);                           /* en + 0 + 5..255 */
    CHECK_EQ(other, 0);
    /* coerenza con timefmt_grouped_uint: il separatore fr e' lo SPAZIO NORMALE (U+0020), 1 byte */
    CHECK_EQ((unsigned char)datefmt_thousands_sep(DATEFMT_LANG_FR), 0x20u);
  }

  /* --- (E) clamp PER LINGUA: senza clamp l'indice 7 leggerebbe la riga della lingua dopo (o oltre) --- */
  {
    char a[DATEFMT_BUFSZ], b[DATEFMT_BUFSZ];
    for (uint8_t lang = 1; lang <= 4; lang++) {
      for (uint8_t level = 0; level < 2; level++) {
        datefmt_format(a, sizeof(a), lang, 6, 17, 4, level);
        datefmt_format(b, sizeof(b), lang, 7, 17, 4, level);
        CHECK(strcmp(a, b) == 0);
        datefmt_format(b, sizeof(b), lang, 255, 17, 4, level);
        CHECK(strcmp(a, b) == 0);
        CHECK(strncmp(a, EXP_WD[lang - 1][6], strlen(EXP_WD[lang - 1][6])) == 0);
      }
      datefmt_format(a, sizeof(a), lang, 2, 17, 11, 0);
      datefmt_format(b, sizeof(b), lang, 2, 17, 12, 0);
      CHECK(strcmp(a, b) == 0);
      datefmt_format(b, sizeof(b), lang, 2, 17, 255, 0);
      CHECK(strcmp(a, b) == 0);
      {
        const char *dec = EXP_MON[lang - 1][11];
        CHECK(strlen(a) >= strlen(dec) && strcmp(a + strlen(a) - strlen(dec), dec) == 0);
      }
      /* entrambi fuori intervallo insieme (fr: ultima riga di ENTRAMBE le tabelle) */
      datefmt_format(a, sizeof(a), lang, 6, 31, 11, 0);
      datefmt_format(b, sizeof(b), lang, 255, 31, 255, 0);
      CHECK(strcmp(a, b) == 0);
    }
    /* lang fuori 1..4 == EN per tutti i livelli (0 = auto arrivato per errore, 5 = primo valore libero) */
    static const uint8_t BADL[] = { 0, 5, 6, 100, 255 };
    for (size_t i = 0; i < sizeof(BADL) / sizeof(BADL[0]); i++) {
      for (uint8_t level = 0; level < 3; level++) {
        datefmt_format(a, sizeof(a), DATEFMT_LANG_EN, 4, 23, 1, level);
        datefmt_format(b, sizeof(b), BADL[i], 4, 23, 1, level);
        CHECK(strcmp(a, b) == 0);
      }
      CHECK(datefmt_thousands_sep(BADL[i]) == ',');
    }
    /* livello: 2, 3, 4, 255 danno tutti solo il giorno */
    static const uint8_t LV[] = { 2, 3, 4, 255 };
    for (size_t i = 0; i < sizeof(LV) / sizeof(LV[0]); i++) {
      for (uint8_t lang = 1; lang <= 4; lang++) {
        datefmt_format(a, sizeof(a), lang, 6, 31, 11, LV[i]);
        CHECK(strcmp(a, "31") == 0);
      }
    }
  }

  /* --- (F) mday 0/255 con il buffer minimo: troncamento pulito, canary intatto --- */
  {
    unsigned char buf[DATEFMT_BUFSZ + 8];
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_FR, 0, 255, 6, 0);   /* "Dim 255 Juill." = 14 */
    CHECK(strcmp((char *)buf, "Dim 255 Juill") == 0);                              /* tronca l'ultimo byte */
    CHECK(buf[DATEFMT_BUFSZ - 1] == '\0' && buf[DATEFMT_BUFSZ] == 0xA5 && buf[DATEFMT_BUFSZ + 7] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_FR, 0, 0, 6, 0);
    CHECK(strcmp((char *)buf, "Dim 0 Juill.") == 0);
    CHECK(buf[DATEFMT_BUFSZ] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_DE, 0, 255, 2, 0);    /* "So, 255. Mär" = 13 */
    CHECK(strcmp((char *)buf, "So, 255. M\xC3\xA4r") == 0);
    CHECK(buf[DATEFMT_BUFSZ] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_DE, 3, 255, 2, 1);    /* "Mi, 255." = 8 */
    CHECK(strcmp((char *)buf, "Mi, 255.") == 0);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_EN, 3, 255, 2, 2);
    CHECK(strcmp((char *)buf, "255") == 0);
    CHECK(buf[4] == 0xA5);
    /* cap 13 su una stringa da 13: tronca di uno ("Dim 31 Juill"); cap 14 la contiene */
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, 13, DATEFMT_LANG_FR, 0, 31, 6, 0);
    CHECK(strcmp((char *)buf, "Dim 31 Juill") == 0 && buf[13] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, 14, DATEFMT_LANG_FR, 0, 31, 6, 0);
    CHECK(strcmp((char *)buf, "Dim 31 Juill.") == 0 && buf[14] == 0xA5);
    /* cap 2 e 3: "S" e "Sa" (de) con NUL al posto giusto */
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, 2, DATEFMT_LANG_DE, 6, 5, 8, 0);
    CHECK(strcmp((char *)buf, "S") == 0 && buf[2] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, 3, DATEFMT_LANG_DE, 6, 5, 8, 0);
    CHECK(strcmp((char *)buf, "Sa") == 0 && buf[3] == 0xA5);
  }

  /* --- (H) nessuna dipendenza dal contenuto precedente del buffer, ne' stato fra chiamate --- */
  {
    char z[DATEFMT_BUFSZ], n[DATEFMT_BUFSZ], again[DATEFMT_BUFSZ];
    memset(z, 'Z', sizeof(z));
    memset(n, 0, sizeof(n));
    datefmt_format(z, sizeof(z), DATEFMT_LANG_IT, 6, 5, 8, 0);
    datefmt_format(n, sizeof(n), DATEFMT_LANG_IT, 6, 5, 8, 0);
    CHECK(strcmp(z, n) == 0 && strcmp(z, "Sab 5 Set") == 0);
    datefmt_format(again, sizeof(again), DATEFMT_LANG_DE, 6, 5, 8, 0);   /* un'altra lingua in mezzo */
    CHECK(strcmp(again, "Sa, 5. Sep") == 0);
    datefmt_format(again, sizeof(again), DATEFMT_LANG_IT, 6, 5, 8, 0);
    CHECK(strcmp(again, z) == 0);
    /* il separatore non ha stato */
    CHECK(datefmt_thousands_sep(DATEFMT_LANG_FR) == ' ' && datefmt_thousands_sep(DATEFMT_LANG_EN) == ','
          && datefmt_thousands_sep(DATEFMT_LANG_FR) == ' ');
  }

  /* --- (I) byte >= 0x80 SOLO in de Mär e fr Févr./Août/Déc. al livello 0; mai ai livelli 1 e 2 --- */
  {
    char buf[DATEFMT_BUFSZ];
    uint32_t high0 = 0, high12 = 0, invalid = 0;
    for (uint8_t lang = 1; lang <= 4; lang++) {
      for (uint8_t wday = 0; wday < 7; wday++) {
        for (uint8_t mon = 0; mon < 12; mon++) {
          for (uint8_t level = 0; level < 3; level++) {
            datefmt_format(buf, sizeof(buf), lang, wday, 15, mon, level);
            if (utf8_chars(buf) < 0) invalid++;
            const int expect_high = (level == 0)
              && ((lang == DATEFMT_LANG_DE && mon == 2)
                  || (lang == DATEFMT_LANG_FR && (mon == 1 || mon == 7 || mon == 11)));
            const int got_high = has_high_byte(buf);
            if (got_high != expect_high) {
              g_fail++;
              printf("FAIL byte alti lang %u wd %u mon %u lv %u: \"%s\"\n", lang, wday, mon, level, buf);
            } else {
              g_pass++;
            }
            if (got_high) { if (level == 0) high0++; else high12++; }
          }
        }
      }
    }
    CHECK_EQ(invalid, 0u);
    CHECK_EQ(high0, 4u * 7u);                  /* 4 mesi accentati × 7 giorni */
    CHECK_EQ(high12, 0u);
    /* i byte esatti dei 4 accenti (UTF-8 a 2 byte, dentro U+00A0–017F che i font Gothic hanno) */
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_DE, 0, 1, 2, 0);
    CHECK(memcmp(buf, "So, 1. M\xC3\xA4r", 12) == 0);
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_FR, 0, 1, 1, 0);
    CHECK(memcmp(buf, "Dim 1 F\xC3\xA9vr.", 13) == 0);
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_FR, 0, 1, 7, 0);
    CHECK(memcmp(buf, "Dim 1 Ao\xC3\xBBt", 12) == 0);
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_FR, 0, 1, 11, 0);
    CHECK(memcmp(buf, "Dim 1 D\xC3\xA9" "c.", 12) == 0);
  }

  printf("test_datefmt: %d ok, %d falliti\n", g_pass, g_fail);
  return g_fail ? 1 : 0;
}

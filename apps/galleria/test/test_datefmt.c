/* test_datefmt.c — test host ADVERSARIALE di datefmt.c (S10, D34; S11, D40/D41: es e pt; nessun pebble.h).
 * Esegue: make -C apps/galleria/test run-test_datefmt
 * Base (agente C, S10): esaustivo su lingue × giorni × date × mesi × livelli per lunghezza/overflow e stringa
 * attesa, campioni della spec, UTF-8 dei pack, indici clampati, buffer piccoli, separatori.
 * Test-writer (C-TEST in S10; T1 in S11 su 6 lingue en it de fr es pt — D39: es = 5 e pt = 6 SEMPRE in coda):
 * (A) griglia 6 lingue × 7 giorni × 12 mesi × 3 livelli × mday {1, 9, 10, 31} = 6.048 con i massimi di
 * lunghezza PER LINGUA e per numero di cifre (in byte E in caratteri UTF-8), UTF-8 valido, mai U+00A0/U+202F,
 * massimo osservato == DATEFMT_MAX_LEN (14: pt "Sáb 31 de Set" in byte, 13 caratteri; fino alla S10 era 13 =
 * fr "Dim 31 Juill."); (B) canary su OGNI cap per tutti i 46.872 casi (cap = n+1, n, n−1, 1, 2, 3, 4, 8, 14,
 * 15, 32: nessun byte oltre cap, NUL in cap−1 quando tronca, prefisso esatto); (C) campioni espliciti per
 * lingua e livello dalla tabella della spec §0/D34/D40 (incluso it "Mar 3 Mar": martedi' 3 marzo) e le 19 + 19
 * stringhe es/pt VERBATIM dei pack es_ES/pt_PT come letterali del test; (D) separatore delle migliaia su tutti
 * i 256 valori di lang (D41: es/pt '.', nessuna eccezione); (E) clamp PER LINGUA (wday 7/255 == 6, mon 12/255
 * == 11, lang 0/7/8/100/255 == EN: senza clamp l'indice 7 legge oltre l'ultima riga, che ora e' pt); (F) mday
 * 0/255 con il buffer minimo (troncamento pulito); (G) costanti pinnate; (H) nessuna dipendenza dal contenuto
 * precedente del buffer; (I) byte ≥ 0x80 PER LINGUA: en/it mai; de solo Mär e fr solo Févr./Août/Déc. al
 * livello 0; es "sá" e pt "Sáb" (giorno 6) ai livelli 0 E 1; mai al livello 2; (J) il "de" del portoghese solo
 * al livello 0 e solo in pt; (K) spagnolo tutto minuscolo (forma del pack), le altre lingue con l'iniziale
 * maiuscola.
 * Ogni mutante di datefmt.c deve far fallire almeno un CHECK (verificato con SRC_DIR=<copia> OUT=<dir>, script
 * mutants.py nello scratchpad s11/t1; asserzioni fallite del 06/09/2026 fra parentesi): S10 (1) mese
 * scambiato (5), (2) de senza virgola (24), (3) clamp di wday tolto (34), (4) fr a punto (5), (5) de livello 1
 * senza punto (8), (6) cap ignorato (14), (7) clamp di lang tolto (segfault: lang 0 legge WDAY[255]), (8)
 * livello >= 2 -> == 2 (21), (9) EN a punto (12), (10) Mär senza umlaut (18); S11 (11) righe es/pt scambiate
 * (111), (12) "de" mancante in pt (51), (13) cella WDAY a 4 ("Sáb" senza NUL: gcc 15 la rifiuta gia' in
 * compilazione con -Wextra -Werror, -Wunterminated-string-initialization; la toolchain ARM dell'SDK (GCC 14.2.1)
 * NON ha quel warning e compila la cella a 4 senza avvisi: contro questo errore vale solo make -C test; con -Wno-… 29), (14) ES/PT -> EN nel
 * clamp, lang <= FR (171), (15) es a virgola (4), (16) pt a spazio (5), (17) "mayo" -> "may" (12), (18) es con
 * "de" (42), (19) "sá" senza accento (48), (20) pt livello 1 con "de" (18), (21) DATEFMT_MAX_LEN 13 nell'header
 * (16). */
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

#define NLANG 6                               /* en it de fr es pt (D39) */

/* Copie indipendenti delle tabelle dei pack (spec S10 §0, S11 D40: es_ES.po e pt_PT.po verbatim, "mayo" per
 * esteso e spagnolo minuscolo come nel pack): il test non legge quelle di datefmt.c. Escape esadecimali per gli
 * accenti: "S\xC3\xA1" "b" spezzato perche' la "b" e' una cifra esadecimale e finirebbe nell'escape. */
static const char *const EXP_WD[NLANG][7] = {
  { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" },
  { "Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab" },
  { "So", "Mo", "Di", "Mi", "Do", "Fr", "Sa" },
  { "Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam" },
  { "do", "lu", "ma", "mi", "ju", "vi", "s\xC3\xA1" },
  { "Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "S\xC3\xA1" "b" },
};
static const char *const EXP_MON[NLANG][12] = {
  { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" },
  { "Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic" },
  { "Jan", "Feb", "M\xC3\xA4r", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez" },
  { "Janv.", "F\xC3\xA9vr.", "Mars", "Avr.", "Mai", "Juin", "Juill.", "Ao\xC3\xBBt", "Sept.", "Oct.", "Nov.", "D\xC3\xA9" "c." },
  { "ene", "feb", "mar", "abr", "mayo", "jun", "jul", "ago", "sep", "oct", "nov", "dic" },
  { "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez" },
};

/* Massimi di lunghezza in BYTE per lingua (indice lang - 1), pinnati a mano dalle tabelle qui sopra:
 *   livello 0 con una cifra:  en "Wed 9 May" 9, it 9, de "So, 9. Mär" 11, fr "Dim 9 Juill." 12, es "sá 9 mayo" 10,
 *                             pt "Sáb 9 de Set" 13;
 *   livello 0 con due cifre:  10, 10, 12, 13 ("Dim 31 Juill." / "Dim 31 Févr."), 11 ("sá 31 mayo"), 14 ("Sáb 31 de Set");
 *   livello 1 con due cifre:  "Sat 31" 6, 6, "Sa, 31." 7, 6, "sá 31" 6, "Sáb 31" 7.
 * In CARATTERI al livello 0: 10, 10, 11, 13, 10, 13 (i due massimi, fr e pt, sono 13 caratteri). */
static const uint8_t MAX0_1DIGIT[NLANG] = { 9, 9, 11, 12, 10, 13 };
static const uint8_t MAX0_2DIGIT[NLANG] = { 10, 10, 12, 13, 11, 14 };
static const uint8_t MAX1_2DIGIT[NLANG] = { 6, 6, 7, 6, 6, 7 };
static const uint8_t MAX0_CHARS[NLANG]  = { 10, 10, 11, 13, 10, 13 };

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

/* Stringa attesa costruita dalle tabelle del test con il formato per lingua (D34, D40: pt "%s %u de %s" al
 * livello 0, es come it/fr). */
static void expected(char *out, size_t cap, uint8_t lang, uint8_t wday, uint8_t mday, uint8_t mon, uint8_t level) {
  const uint8_t li = (uint8_t)(lang - 1);
  if (level >= 2) {
    snprintf(out, cap, "%u", (unsigned)mday);
  } else if (lang == DATEFMT_LANG_DE) {
    if (level == 1) snprintf(out, cap, "%s, %u.", EXP_WD[li][wday], (unsigned)mday);
    else            snprintf(out, cap, "%s, %u. %s", EXP_WD[li][wday], (unsigned)mday, EXP_MON[li][mon]);
  } else if (level == 1) {
    snprintf(out, cap, "%s %u", EXP_WD[li][wday], (unsigned)mday);
  } else if (lang == DATEFMT_LANG_PT) {
    snprintf(out, cap, "%s %u de %s", EXP_WD[li][wday], (unsigned)mday, EXP_MON[li][mon]);
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

/* (I) Regola dei byte >= 0x80 PER LINGUA (D40): en/it mai; de solo "Mär" (mon 2) e fr solo "Févr." (1),
 * "Août" (7), "Déc." (11), tutti al livello 0 (il mese cade al livello 1); es "sá" e pt "Sáb" sono il GIORNO
 * (wday 6) e restano al livello 1; al livello 2 (solo il numero) mai. */
static int expect_high(uint8_t lang, uint8_t wday, uint8_t mon, uint8_t level) {
  switch (lang) {
    case DATEFMT_LANG_DE: return level == 0 && mon == 2;
    case DATEFMT_LANG_FR: return level == 0 && (mon == 1 || mon == 7 || mon == 11);
    case DATEFMT_LANG_ES:
    case DATEFMT_LANG_PT: return level <= 1 && wday == 6;
    default:              return 0;
  }
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
  check_fmt(DATEFMT_LANG_ES, 6, 5, 8, 0, "s\xC3\xA1 5 sep");            /* D40: minuscolo, giorno-mese */
  check_fmt(DATEFMT_LANG_PT, 6, 5, 8, 0, "S\xC3\xA1" "b 5 de Set");     /* D40: %c del pack "%a %e de %b" */
  check_fmt(DATEFMT_LANG_EN, 6, 5, 8, 1, "Sat 5");
  check_fmt(DATEFMT_LANG_IT, 6, 5, 8, 1, "Sab 5");
  check_fmt(DATEFMT_LANG_FR, 6, 5, 8, 1, "Sam 5");
  check_fmt(DATEFMT_LANG_DE, 6, 5, 8, 1, "Sa, 5.");
  check_fmt(DATEFMT_LANG_ES, 6, 5, 8, 1, "s\xC3\xA1 5");
  check_fmt(DATEFMT_LANG_PT, 6, 5, 8, 1, "S\xC3\xA1" "b 5");            /* il "de" cade con il mese */
  for (uint8_t lang = 1; lang <= DATEFMT_LANG_LAST; lang++) {
    check_fmt(lang, 6, 5, 8, 2, "5");
    check_fmt(lang, 6, 31, 11, 2, "31");
  }
  /* gate S11 (domenica 6 settembre 2026): GALLERIA_DEBUG_LANG=5 "do 6 sep", =6 "Dom 6 de Set" */
  check_fmt(DATEFMT_LANG_ES, 0, 6, 8, 0, "do 6 sep");
  check_fmt(DATEFMT_LANG_PT, 0, 6, 8, 0, "Dom 6 de Set");
  check_fmt(DATEFMT_LANG_ES, 3, 31, 4, 0, "mi 31 mayo");               /* "mayo": unica forma del pack per May */
  /* --- UTF-8 dei pack: byte esatti --- */
  check_fmt(DATEFMT_LANG_DE, 3, 4, 2, 0, "Mi, 4. M\xC3\xA4r");
  check_fmt(DATEFMT_LANG_FR, 0, 1, 7, 0, "Dim 1 Ao\xC3\xBBt");
  check_fmt(DATEFMT_LANG_FR, 2, 24, 11, 0, "Mar 24 D\xC3\xA9" "c.");
  check_fmt(DATEFMT_LANG_FR, 4, 14, 1, 0, "Jeu 14 F\xC3\xA9vr.");
  check_fmt(DATEFMT_LANG_ES, 6, 12, 9, 0, "s\xC3\xA1 12 oct");
  check_fmt(DATEFMT_LANG_PT, 6, 12, 9, 0, "S\xC3\xA1" "b 12 de Out");
  /* --- la stringa piu' lunga: pt "Sáb 31 de Set" = DATEFMT_MAX_LEN (14 B, 13 caratteri); fr "Dim 31 Juill."
   * (13, il massimo fino alla S10) non lo e' piu' --- */
  {
    char buf[DATEFMT_BUFSZ];
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_PT, 6, 31, 8, 0);
    CHECK(strcmp(buf, "S\xC3\xA1" "b 31 de Set") == 0);
    CHECK(strlen(buf) == DATEFMT_MAX_LEN);
    CHECK_EQ(utf8_chars(buf), 13);
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_FR, 0, 31, 6, 0);
    CHECK(strcmp(buf, "Dim 31 Juill.") == 0);
    CHECK(strlen(buf) == DATEFMT_MAX_LEN - 1);
  }

  /* --- esaustivo: 6 lingue × 7 giorni × 31 date × 12 mesi × 3 livelli = 46.872 casi, con i massimi di
   * lunghezza PER LINGUA (livello 0 e 1: MAX0_2DIGIT / MAX1_2DIGIT raggiunti esattamente) --- */
  {
    char buf[DATEFMT_BUFSZ + 4];
    char exp[32];
    uint32_t cases = 0, bad = 0;
    uint8_t max0[NLANG] = { 0 }, max1[NLANG] = { 0 }, max2 = 0;
    for (uint8_t lang = 1; lang <= DATEFMT_LANG_LAST; lang++) {
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
              if (level == 0)      { if (n > max0[lang - 1]) max0[lang - 1] = (uint8_t)n; }
              else if (level == 1) { if (n > max1[lang - 1]) max1[lang - 1] = (uint8_t)n; }
              else                 { if (n > max2) max2 = (uint8_t)n; }
            }
          }
        }
      }
    }
    CHECK_EQ(cases, 46872u);
    CHECK_EQ(bad, 0u);
    for (uint8_t li = 0; li < NLANG; li++) {
      if (max0[li] != MAX0_2DIGIT[li] || max1[li] != MAX1_2DIGIT[li]) {
        printf("  (lingua %u: max livello 0 %u, livello 1 %u)\n", li + 1u, max0[li], max1[li]);
      }
      CHECK_EQ(max0[li], MAX0_2DIGIT[li]);
      CHECK_EQ(max1[li], MAX1_2DIGIT[li]);
    }
    CHECK_EQ(max2, 2u);
    CHECK_EQ(max0[DATEFMT_LANG_PT - 1], DATEFMT_MAX_LEN);   /* il massimo globale e' il portoghese */
  }

  /* --- indici clampati --- */
  check_fmt(0,   6, 5, 8, 0, "Sat 5 Sep");     /* auto: se arriva qui vale EN */
  check_fmt(7,   6, 5, 8, 0, "Sat 5 Sep");     /* primo valore libero dopo pt (S11) */
  check_fmt(255, 6, 5, 8, 0, "Sat 5 Sep");
  check_fmt(DATEFMT_LANG_IT, 7,   5, 8, 0, "Sab 5 Set");   /* wday > 6 -> sabato */
  check_fmt(DATEFMT_LANG_IT, 255, 5, 8, 0, "Sab 5 Set");
  check_fmt(DATEFMT_LANG_IT, 6, 5, 12,  0, "Sab 5 Dic");   /* mon > 11 -> dicembre */
  check_fmt(DATEFMT_LANG_IT, 6, 5, 255, 0, "Sab 5 Dic");
  check_fmt(DATEFMT_LANG_ES, 7,   5, 12,  0, "s\xC3\xA1 5 dic");         /* stesso clamp sulle righe nuove */
  check_fmt(DATEFMT_LANG_PT, 255, 5, 255, 0, "S\xC3\xA1" "b 5 de Dez");
  check_fmt(DATEFMT_LANG_DE, 6, 5, 8, 3,   "5");           /* livello > 2 -> solo il giorno */
  check_fmt(DATEFMT_LANG_DE, 6, 5, 8, 255, "5");
  check_fmt(DATEFMT_LANG_PT, 6, 5, 8, 3,   "5");           /* anche in pt: niente "de" oltre il livello 1 */
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

  /* --- separatore delle migliaia (D34, D41: es/pt '.' come i pack, nessuna eccezione) --- */
  CHECK(datefmt_thousands_sep(DATEFMT_LANG_EN) == ',');
  CHECK(datefmt_thousands_sep(DATEFMT_LANG_IT) == '.');
  CHECK(datefmt_thousands_sep(DATEFMT_LANG_DE) == '.');
  CHECK(datefmt_thousands_sep(DATEFMT_LANG_FR) == ' ');
  CHECK(datefmt_thousands_sep(DATEFMT_LANG_ES) == '.');
  CHECK(datefmt_thousands_sep(DATEFMT_LANG_PT) == '.');
  CHECK(datefmt_thousands_sep(0) == ',');
  CHECK(datefmt_thousands_sep(7) == ',');
  CHECK(datefmt_thousands_sep(255) == ',');

  /* ================= test-writer adversariale (C-TEST / T1) ================= */

  /* --- (G) costanti pinnate: il chiamante (ui_time.c) dimensiona s_date_buf su DATEFMT_BUFSZ (24 >= 15);
   * D39: es e pt in coda, DATEFMT_LANG_LAST e' pt e i confronti di intervallo usano LAST --- */
  CHECK_EQ(DATEFMT_MAX_LEN, 14);
  CHECK_EQ(DATEFMT_BUFSZ, 15);
  CHECK_EQ(DATEFMT_LANG_EN, 1);
  CHECK_EQ(DATEFMT_LANG_IT, 2);
  CHECK_EQ(DATEFMT_LANG_DE, 3);
  CHECK_EQ(DATEFMT_LANG_FR, 4);
  CHECK_EQ(DATEFMT_LANG_ES, 5);
  CHECK_EQ(DATEFMT_LANG_PT, 6);
  CHECK_EQ(DATEFMT_LANG_LAST, 6);
  CHECK_EQ(DATEFMT_LANG_LAST, DATEFMT_LANG_PT);
  CHECK_EQ(NLANG, DATEFMT_LANG_LAST);

  /* --- (A) griglia del brief: 6 lingue × 7 giorni × 12 mesi × 3 livelli × mday {1, 9, 10, 31} = 6.048 --- */
  {
    static const uint8_t MDAYS[4] = { 1, 9, 10, 31 };
    char buf[40];
    char exp[32];
    uint32_t cases = 0, bad = 0, max0 = 0, max1 = 0, max2 = 0, max0_chars = 0;
    uint32_t at14 = 0, at14_pt_sab = 0, at13 = 0, at13_fr = 0, at13_pt = 0;
    uint8_t m1[NLANG] = { 0 }, m2[NLANG] = { 0 }, mc[NLANG] = { 0 };
    for (uint8_t lang = 1; lang <= DATEFMT_LANG_LAST; lang++) {
      const uint8_t li = (uint8_t)(lang - 1);
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
                /* limiti PER LINGUA e per numero di cifre (tabelle in testa al file) */
                ok = ok && n <= DATEFMT_MAX_LEN && (size_t)chars <= DATEFMT_MAX_LEN;
                ok = ok && n <= (mday >= 10 ? MAX0_2DIGIT[li] : MAX0_1DIGIT[li]);
                ok = ok && (size_t)chars <= MAX0_CHARS[li];
                if (n > max0) max0 = (uint32_t)n;
                if ((uint32_t)chars > max0_chars) max0_chars = (uint32_t)chars;
                if (mday >= 10) { if (n > m2[li]) m2[li] = (uint8_t)n; }
                else            { if (n > m1[li]) m1[li] = (uint8_t)n; }
                if ((uint8_t)chars > mc[li]) mc[li] = (uint8_t)chars;
                if (n == 14) { at14++; if (lang == DATEFMT_LANG_PT && wday == 6 && mday >= 10) at14_pt_sab++; }
                if (n == 13) {
                  at13++;
                  if (lang == DATEFMT_LANG_FR && (mon == 1 || mon == 6) && mday >= 10) at13_fr++;
                  if (lang == DATEFMT_LANG_PT && ((wday != 6 && mday >= 10) || (wday == 6 && mday < 10))) at13_pt++;
                }
              } else if (level == 1) {
                ok = ok && n <= MAX1_2DIGIT[li];   /* "Sab 31", de "Sa, 31.", pt "Sáb 31" = 7 */
                ok = ok && (mday >= 10 || n <= MAX1_2DIGIT[li] - 1u);
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
    CHECK_EQ(cases, 6048u);
    CHECK_EQ(bad, 0u);
    CHECK_EQ(max0, DATEFMT_MAX_LEN);          /* la costante non e' stantia: il massimo viene raggiunto */
    CHECK_EQ(max0_chars, 13u);                /* in caratteri: "Dim 31 Juill." e "Sáb 31 de Set" */
    CHECK_EQ(max1, 7u);
    CHECK_EQ(max2, 2u);
    for (uint8_t li = 0; li < NLANG; li++) {  /* ogni massimo per lingua viene RAGGIUNTO (tabelle esatte) */
      CHECK_EQ(m1[li], MAX0_1DIGIT[li]);
      CHECK_EQ(m2[li], MAX0_2DIGIT[li]);
      CHECK_EQ(mc[li], MAX0_CHARS[li]);
    }
    CHECK_EQ(at14, at14_pt_sab);              /* i 14 byte SOLO da pt "Sáb" con due cifre */
    CHECK_EQ(at14, 12u * 2u);                 /* 12 mesi × mday {10, 31} = 24 */
    CHECK_EQ(at13, at13_fr + at13_pt);        /* i 13 byte: fr Févr./Juill. a due cifre + pt (non-Sáb a due
                                               * cifre, Sáb a una) */
    CHECK_EQ(at13_fr, 2u * 7u * 2u);          /* 28 */
    CHECK_EQ(at13_pt, 6u * 12u * 2u + 12u * 2u);   /* 144 + 24 = 168 */
    CHECK_EQ(at13, 196u);
  }

  /* --- (B) canary su ogni cap per tutti i 46.872 casi (cap 15 = DATEFMT_BUFSZ, 14 = il BUFSZ della S10 che
   * ora tronca "Sáb 31 de Set"; cap 3 taglia "sá"/"Sáb" a meta' della sequenza UTF-8: snprintf non conosce i
   * caratteri e il chiamante passa sempre DATEFMT_BUFSZ) --- */
  {
    static const size_t CAPS[] = { 1, 2, 3, 4, 8, 14, 15, 32 };
    char full[32];
    uint32_t calls = 0, bad = 0;
    for (uint8_t lang = 1; lang <= DATEFMT_LANG_LAST; lang++) {
      for (uint8_t wday = 0; wday < 7; wday++) {
        for (uint8_t mday = 1; mday <= 31; mday++) {
          for (uint8_t mon = 0; mon < 12; mon++) {
            for (uint8_t level = 0; level < 3; level++) {
              expected(full, sizeof(full), lang, wday, mday, mon, level);
              const size_t n = strlen(full);
              size_t caps[11];
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
    CHECK(calls >= 46872u * 10u);
    CHECK_EQ(bad, 0u);
    /* cap 0 e NULL su un campione: nessuna scrittura, nessun crash */
    CHECK(canary_cap(DATEFMT_LANG_PT, 6, 31, 8, 0, 0, "S\xC3\xA1" "b 31 de Set"));
    CHECK(canary_cap(DATEFMT_LANG_FR, 0, 31, 6, 0, 0, "Dim 31 Juill."));
    datefmt_format(NULL, 0, DATEFMT_LANG_FR, 0, 31, 6, 0);
    datefmt_format(NULL, 1, DATEFMT_LANG_DE, 6, 31, 11, 1);
    datefmt_format(NULL, DATEFMT_BUFSZ, DATEFMT_LANG_PT, 6, 31, 8, 0);
    g_pass++;
  }

  /* --- (C) campioni espliciti per lingua e livello (spec §0 + D34 + D40) --- */
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
      /* es (S11, D40: giorno-mese come it/fr, tutto minuscolo come nel pack es_ES; le 7 + 12 stringhe VERBATIM
       * sono qui sotto in ES_DAYS/ES_MONTHS) */
      { DATEFMT_LANG_ES, 1, 1, 0, 0, "lu 1 ene" },     { DATEFMT_LANG_ES, 1, 1, 0, 1, "lu 1" },
      { DATEFMT_LANG_ES, 3, 31, 4, 0, "mi 31 mayo" },  { DATEFMT_LANG_ES, 3, 31, 4, 1, "mi 31" },
      { DATEFMT_LANG_ES, 6, 5, 8, 0, "s\xC3\xA1 5 sep" }, { DATEFMT_LANG_ES, 6, 5, 8, 1, "s\xC3\xA1 5" },
      { DATEFMT_LANG_ES, 6, 5, 8, 2, "5" },            { DATEFMT_LANG_ES, 0, 6, 8, 0, "do 6 sep" },
      { DATEFMT_LANG_ES, 2, 3, 2, 0, "ma 3 mar" },     { DATEFMT_LANG_ES, 4, 25, 11, 0, "ju 25 dic" },
      { DATEFMT_LANG_ES, 5, 12, 9, 0, "vi 12 oct" },   { DATEFMT_LANG_ES, 6, 31, 4, 0, "s\xC3\xA1 31 mayo" },
      { DATEFMT_LANG_ES, 6, 31, 4, 2, "31" },
      /* pt (S11, D40: %c del pack pt_PT "%a %e de %b"; il "de" cade con il mese) */
      { DATEFMT_LANG_PT, 1, 1, 0, 0, "Seg 1 de Jan" }, { DATEFMT_LANG_PT, 1, 1, 0, 1, "Seg 1" },
      { DATEFMT_LANG_PT, 6, 5, 8, 0, "S\xC3\xA1" "b 5 de Set" }, { DATEFMT_LANG_PT, 6, 5, 8, 1, "S\xC3\xA1" "b 5" },
      { DATEFMT_LANG_PT, 6, 5, 8, 2, "5" },            { DATEFMT_LANG_PT, 6, 31, 8, 0, "S\xC3\xA1" "b 31 de Set" },
      { DATEFMT_LANG_PT, 6, 31, 8, 1, "S\xC3\xA1" "b 31" }, { DATEFMT_LANG_PT, 0, 6, 8, 0, "Dom 6 de Set" },
      { DATEFMT_LANG_PT, 2, 3, 2, 0, "Ter 3 de Mar" }, { DATEFMT_LANG_PT, 4, 25, 11, 0, "Qui 25 de Dez" },
      { DATEFMT_LANG_PT, 5, 12, 9, 0, "Sex 12 de Out" }, { DATEFMT_LANG_PT, 3, 31, 4, 0, "Qua 31 de Mai" },
      { DATEFMT_LANG_PT, 3, 31, 4, 2, "31" },
    };
    for (size_t i = 0; i < sizeof(S) / sizeof(S[0]); i++) {
      check_fmt(S[i].lang, S[i].wday, S[i].mday, S[i].mon, S[i].level, S[i].exp);
    }
    CHECK_EQ(strlen("Sam 30 Sept."), 12u);        /* il massimo del brief S10... */
    CHECK_EQ(strlen("Dim 31 Juill."), 13u);       /* ...quello vero della S10 (byte = caratteri)... */
    CHECK_EQ(strlen("Dim 31 F\xC3\xA9vr."), 13u); /* 13 byte, 12 caratteri */
    CHECK_EQ(utf8_chars("Dim 31 F\xC3\xA9vr."), 12);
    CHECK_EQ(strlen("S\xC3\xA1" "b 31 de Set"), 14u);   /* ...e quello della S11: 14 byte, 13 caratteri */
    CHECK_EQ(utf8_chars("S\xC3\xA1" "b 31 de Set"), 13);
    CHECK_EQ(strlen("s\xC3\xA1 31 mayo"), 11u);   /* il massimo spagnolo: 11 byte, 10 caratteri */
    CHECK_EQ(utf8_chars("s\xC3\xA1 31 mayo"), 10);

    /* le 19 + 19 stringhe es/pt VERBATIM dei pack (D40) come letterali completi del test: i giorni al livello 1
     * (giorno 5) e i mesi al livello 0 (mercoledi' 1 / segunda 1), indipendenti dalle tabelle EXP_* */
    static const char *const ES_DAYS[7] = { "do 5", "lu 5", "ma 5", "mi 5", "ju 5", "vi 5", "s\xC3\xA1 5" };
    static const char *const ES_MONTHS[12] = {
      "mi 1 ene", "mi 1 feb", "mi 1 mar", "mi 1 abr", "mi 1 mayo", "mi 1 jun",
      "mi 1 jul", "mi 1 ago", "mi 1 sep", "mi 1 oct", "mi 1 nov", "mi 1 dic" };
    static const char *const PT_DAYS[7] = { "Dom 5", "Seg 5", "Ter 5", "Qua 5", "Qui 5", "Sex 5", "S\xC3\xA1" "b 5" };
    static const char *const PT_MONTHS[12] = {
      "Seg 1 de Jan", "Seg 1 de Fev", "Seg 1 de Mar", "Seg 1 de Abr", "Seg 1 de Mai", "Seg 1 de Jun",
      "Seg 1 de Jul", "Seg 1 de Ago", "Seg 1 de Set", "Seg 1 de Out", "Seg 1 de Nov", "Seg 1 de Dez" };
    for (uint8_t wday = 0; wday < 7; wday++) {
      check_fmt(DATEFMT_LANG_ES, wday, 5, 8, 1, ES_DAYS[wday]);
      check_fmt(DATEFMT_LANG_PT, wday, 5, 8, 1, PT_DAYS[wday]);
    }
    for (uint8_t mon = 0; mon < 12; mon++) {
      check_fmt(DATEFMT_LANG_ES, 3, 1, mon, 0, ES_MONTHS[mon]);
      check_fmt(DATEFMT_LANG_PT, 1, 1, mon, 0, PT_MONTHS[mon]);
    }
    /* es e pt NON sono copie di it (stesso giorno: "Sab 5 Set" / "sá 5 sep" / "Sáb 5 de Set") e le due righe
     * nuove non sono scambiate fra loro (pt maiuscolo con "de", es minuscolo senza) */
    {
      char it[DATEFMT_BUFSZ], es[DATEFMT_BUFSZ], pt[DATEFMT_BUFSZ];
      datefmt_format(it, sizeof(it), DATEFMT_LANG_IT, 6, 5, 8, 0);
      datefmt_format(es, sizeof(es), DATEFMT_LANG_ES, 6, 5, 8, 0);
      datefmt_format(pt, sizeof(pt), DATEFMT_LANG_PT, 6, 5, 8, 0);
      CHECK(strcmp(it, es) != 0 && strcmp(it, pt) != 0 && strcmp(es, pt) != 0);
      CHECK(strstr(pt, " de ") != NULL && strstr(es, " de ") == NULL && strstr(it, " de ") == NULL);
      CHECK(es[0] == 's' && pt[0] == 'S' && it[0] == 'S');
    }
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
    CHECK_EQ(dot, 4);                               /* it, de, es, pt (D41: nessuna eccezione) */
    CHECK_EQ(space, 1);                             /* fr */
    CHECK_EQ(comma, 251);                           /* en + 0 + 7..255 */
    CHECK_EQ(other, 0);
    /* coerenza con timefmt_grouped_uint: il separatore fr e' lo SPAZIO NORMALE (U+0020), 1 byte */
    CHECK_EQ((unsigned char)datefmt_thousands_sep(DATEFMT_LANG_FR), 0x20u);
    /* le lingue nuove NON prendono lo spazio del francese ne' la virgola inglese */
    CHECK(datefmt_thousands_sep(DATEFMT_LANG_ES) == datefmt_thousands_sep(DATEFMT_LANG_IT));
    CHECK(datefmt_thousands_sep(DATEFMT_LANG_PT) == datefmt_thousands_sep(DATEFMT_LANG_IT));
  }

  /* --- (E) clamp PER LINGUA: senza clamp l'indice 7 leggerebbe la riga della lingua dopo (o oltre la
   * tabella, per pt che ora e' l'ultima riga) --- */
  {
    char a[DATEFMT_BUFSZ], b[DATEFMT_BUFSZ];
    for (uint8_t lang = 1; lang <= DATEFMT_LANG_LAST; lang++) {
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
      /* entrambi fuori intervallo insieme (pt: ultima riga di ENTRAMBE le tabelle) */
      datefmt_format(a, sizeof(a), lang, 6, 31, 11, 0);
      datefmt_format(b, sizeof(b), lang, 255, 31, 255, 0);
      CHECK(strcmp(a, b) == 0);
    }
    /* lang fuori 1..6 == EN per tutti i livelli (0 = auto arrivato per errore, 7 = primo valore libero dopo pt,
     * 8, 100, 255): senza il clamp 7 leggerebbe oltre le tabelle */
    static const uint8_t BADL[] = { 0, 7, 8, 100, 255 };
    for (size_t i = 0; i < sizeof(BADL) / sizeof(BADL[0]); i++) {
      for (uint8_t level = 0; level < 3; level++) {
        datefmt_format(a, sizeof(a), DATEFMT_LANG_EN, 4, 23, 1, level);
        datefmt_format(b, sizeof(b), BADL[i], 4, 23, 1, level);
        CHECK(strcmp(a, b) == 0);
      }
      CHECK(datefmt_thousands_sep(BADL[i]) == ',');
    }
    /* es (5) e pt (6) NON vengono clampate a EN (mutante "lang <= FR") */
    datefmt_format(a, sizeof(a), DATEFMT_LANG_EN, 4, 23, 1, 0);
    datefmt_format(b, sizeof(b), DATEFMT_LANG_ES, 4, 23, 1, 0);
    CHECK(strcmp(a, b) != 0 && strcmp(b, "ju 23 feb") == 0);
    datefmt_format(b, sizeof(b), DATEFMT_LANG_PT, 4, 23, 1, 0);
    CHECK(strcmp(a, b) != 0 && strcmp(b, "Qui 23 de Fev") == 0);
    /* livello: 2, 3, 4, 255 danno tutti solo il giorno */
    static const uint8_t LV[] = { 2, 3, 4, 255 };
    for (size_t i = 0; i < sizeof(LV) / sizeof(LV[0]); i++) {
      for (uint8_t lang = 1; lang <= DATEFMT_LANG_LAST; lang++) {
        datefmt_format(a, sizeof(a), lang, 6, 31, 11, LV[i]);
        CHECK(strcmp(a, "31") == 0);
      }
    }
  }

  /* --- (F) mday 0/255 con il buffer minimo: troncamento pulito, canary intatto --- */
  {
    unsigned char buf[DATEFMT_BUFSZ + 8];
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_PT, 6, 255, 8, 0);   /* "Sáb 255 de Set" = 15 */
    CHECK(strcmp((char *)buf, "S\xC3\xA1" "b 255 de Se") == 0);                    /* tronca l'ultimo byte */
    CHECK(buf[DATEFMT_BUFSZ - 1] == '\0' && buf[DATEFMT_BUFSZ] == 0xA5 && buf[DATEFMT_BUFSZ + 7] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_FR, 0, 255, 6, 0);   /* "Dim 255 Juill." = 14:
                                                                                     * troncato in S10, intero ora */
    CHECK(strcmp((char *)buf, "Dim 255 Juill.") == 0);
    CHECK(buf[DATEFMT_BUFSZ - 1] == '\0' && buf[DATEFMT_BUFSZ] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_FR, 0, 0, 6, 0);
    CHECK(strcmp((char *)buf, "Dim 0 Juill.") == 0);
    CHECK(buf[DATEFMT_BUFSZ] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_PT, 6, 0, 8, 0);
    CHECK(strcmp((char *)buf, "S\xC3\xA1" "b 0 de Set") == 0);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_ES, 6, 255, 4, 0);   /* "sá 255 mayo" = 12: entra */
    CHECK(strcmp((char *)buf, "s\xC3\xA1 255 mayo") == 0);
    CHECK(buf[DATEFMT_BUFSZ] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_DE, 0, 255, 2, 0);    /* "So, 255. Mär" = 13 */
    CHECK(strcmp((char *)buf, "So, 255. M\xC3\xA4r") == 0);
    CHECK(buf[DATEFMT_BUFSZ] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_DE, 3, 255, 2, 1);    /* "Mi, 255." = 8 */
    CHECK(strcmp((char *)buf, "Mi, 255.") == 0);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_PT, 6, 255, 2, 1);    /* "Sáb 255" = 8 */
    CHECK(strcmp((char *)buf, "S\xC3\xA1" "b 255") == 0);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, DATEFMT_BUFSZ, DATEFMT_LANG_EN, 3, 255, 2, 2);
    CHECK(strcmp((char *)buf, "255") == 0);
    CHECK(buf[4] == 0xA5);
    /* cap 14 (il BUFSZ della S10) su "Sáb 31 de Set" tronca di uno; cap 15 (DATEFMT_BUFSZ) la contiene */
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, 14, DATEFMT_LANG_PT, 6, 31, 8, 0);
    CHECK(strcmp((char *)buf, "S\xC3\xA1" "b 31 de Se") == 0 && buf[14] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, 15, DATEFMT_LANG_PT, 6, 31, 8, 0);
    CHECK(strcmp((char *)buf, "S\xC3\xA1" "b 31 de Set") == 0 && buf[15] == 0xA5);
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
    /* cap 3 su "sá 5 sep": snprintf taglia a meta' della sequenza UTF-8 ("s" C3 NUL) senza toccare oltre;
     * cap 4 contiene "sá"; per pt cap 4 "Sá" e cap 5 "Sáb" (l'orologio passa sempre DATEFMT_BUFSZ) */
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, 3, DATEFMT_LANG_ES, 6, 5, 8, 0);
    CHECK(buf[0] == 's' && buf[1] == 0xC3 && buf[2] == '\0' && buf[3] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, 4, DATEFMT_LANG_ES, 6, 5, 8, 0);
    CHECK(strcmp((char *)buf, "s\xC3\xA1") == 0 && buf[4] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, 4, DATEFMT_LANG_PT, 6, 5, 8, 0);
    CHECK(strcmp((char *)buf, "S\xC3\xA1") == 0 && buf[4] == 0xA5);
    memset(buf, 0xA5, sizeof(buf));
    datefmt_format((char *)buf, 5, DATEFMT_LANG_PT, 6, 5, 8, 0);
    CHECK(strcmp((char *)buf, "S\xC3\xA1" "b") == 0 && buf[5] == 0xA5);
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
    datefmt_format(again, sizeof(again), DATEFMT_LANG_PT, 6, 5, 8, 0);   /* ...anche una con il "de" */
    CHECK(strcmp(again, "S\xC3\xA1" "b 5 de Set") == 0);
    datefmt_format(again, sizeof(again), DATEFMT_LANG_IT, 6, 5, 8, 0);
    CHECK(strcmp(again, z) == 0);
    memset(z, 'Z', sizeof(z));
    datefmt_format(z, sizeof(z), DATEFMT_LANG_ES, 6, 5, 8, 0);
    memset(n, 0, sizeof(n));
    datefmt_format(n, sizeof(n), DATEFMT_LANG_ES, 6, 5, 8, 0);
    CHECK(strcmp(z, n) == 0 && strcmp(z, "s\xC3\xA1 5 sep") == 0);
    /* il separatore non ha stato */
    CHECK(datefmt_thousands_sep(DATEFMT_LANG_FR) == ' ' && datefmt_thousands_sep(DATEFMT_LANG_EN) == ','
          && datefmt_thousands_sep(DATEFMT_LANG_PT) == '.' && datefmt_thousands_sep(DATEFMT_LANG_FR) == ' ');
  }

  /* --- (I) byte >= 0x80 PER LINGUA (expect_high): de Mär e fr Févr./Août/Déc. solo al livello 0; es "sá" e
   * pt "Sáb" (wday 6) ai livelli 0 e 1; en/it mai; livello 2 mai --- */
  {
    char buf[DATEFMT_BUFSZ];
    uint32_t high0 = 0, high1 = 0, high2 = 0, invalid = 0;
    for (uint8_t lang = 1; lang <= DATEFMT_LANG_LAST; lang++) {
      for (uint8_t wday = 0; wday < 7; wday++) {
        for (uint8_t mon = 0; mon < 12; mon++) {
          for (uint8_t level = 0; level < 3; level++) {
            datefmt_format(buf, sizeof(buf), lang, wday, 15, mon, level);
            if (utf8_chars(buf) < 0) invalid++;
            const int got_high = has_high_byte(buf);
            if (got_high != expect_high(lang, wday, mon, level)) {
              g_fail++;
              printf("FAIL byte alti lang %u wd %u mon %u lv %u: \"%s\"\n", lang, wday, mon, level, buf);
            } else {
              g_pass++;
            }
            if (got_high) {
              if (level == 0) high0++; else if (level == 1) high1++; else high2++;
            }
          }
        }
      }
    }
    CHECK_EQ(invalid, 0u);
    CHECK_EQ(high0, 7u + 3u * 7u + 12u + 12u);  /* de Mär × 7 giorni + fr 3 mesi × 7 + es sá × 12 mesi + pt Sáb × 12 = 52 */
    CHECK_EQ(high1, 12u + 12u);                 /* es "sá 15" e pt "Sáb 15" ripetuti per i 12 mesi del ciclo = 24 */
    CHECK_EQ(high2, 0u);
    /* i byte esatti dei 6 accenti (UTF-8 a 2 byte, dentro U+00A0–017F che i font Gothic hanno) */
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_DE, 0, 1, 2, 0);
    CHECK(memcmp(buf, "So, 1. M\xC3\xA4r", 12) == 0);
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_FR, 0, 1, 1, 0);
    CHECK(memcmp(buf, "Dim 1 F\xC3\xA9vr.", 13) == 0);
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_FR, 0, 1, 7, 0);
    CHECK(memcmp(buf, "Dim 1 Ao\xC3\xBBt", 12) == 0);
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_FR, 0, 1, 11, 0);
    CHECK(memcmp(buf, "Dim 1 D\xC3\xA9" "c.", 12) == 0);
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_ES, 6, 1, 0, 0);
    CHECK(memcmp(buf, "s\xC3\xA1 1 ene", 9) == 0);              /* "á" = C3 A1, minuscola */
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_PT, 6, 1, 0, 0);
    CHECK(memcmp(buf, "S\xC3\xA1" "b 1 de Jan", 13) == 0);      /* "Sáb" = 53 C3 A1 62 */
    /* mai il maiuscolo "Á" (C3 81) o l'ASCII "Sab" al posto di "Sáb" */
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_PT, 6, 5, 8, 1);
    CHECK(strcmp(buf, "Sab 5") != 0 && strstr(buf, "\xC3\x81") == NULL);
  }

  /* --- (J) il "de" del portoghese: presente (" de ") in TUTTE le combinazioni pt al livello 0, in nessun'altra
   * lingua, e assente dal livello 1 in poi ("de" non e' nemmeno una sottostringa dei giorni pt) --- */
  {
    char buf[DATEFMT_BUFSZ];
    uint32_t pt_de = 0, other_de = 0, pt_lv1_de = 0;
    for (uint8_t lang = 1; lang <= DATEFMT_LANG_LAST; lang++) {
      for (uint8_t wday = 0; wday < 7; wday++) {
        for (uint8_t mon = 0; mon < 12; mon++) {
          datefmt_format(buf, sizeof(buf), lang, wday, 21, mon, 0);
          if (strstr(buf, " de ") != NULL) { if (lang == DATEFMT_LANG_PT) pt_de++; else other_de++; }
          datefmt_format(buf, sizeof(buf), lang, wday, 21, mon, 1);
          if (lang == DATEFMT_LANG_PT && strstr(buf, "de") != NULL) pt_lv1_de++;
        }
      }
    }
    CHECK_EQ(pt_de, 7u * 12u);
    CHECK_EQ(other_de, 0u);
    CHECK_EQ(pt_lv1_de, 0u);
    /* forma esatta: "<giorno> <n> de <mese>", con il mese in coda e un solo "de" */
    datefmt_format(buf, sizeof(buf), DATEFMT_LANG_PT, 4, 21, 2, 0);
    CHECK(strcmp(buf, "Qui 21 de Mar") == 0);
    CHECK(strstr(buf, "de") == buf + 7 && strstr(buf + 8, "de") == NULL);
  }

  /* --- (K) lo spagnolo del pack e' tutto minuscolo (giorni E mesi), le altre lingue hanno l'iniziale
   * maiuscola: pinna la forma del pack es_ES (D40) e distingue la riga es da it/pt --- */
  {
    char buf[DATEFMT_BUFSZ];
    uint32_t es_lower = 0, es_upper_any = 0, other_upper = 0;
    for (uint8_t lang = 1; lang <= DATEFMT_LANG_LAST; lang++) {
      for (uint8_t wday = 0; wday < 7; wday++) {
        for (uint8_t mon = 0; mon < 12; mon++) {
          for (uint8_t level = 0; level < 2; level++) {
            datefmt_format(buf, sizeof(buf), lang, wday, 3, mon, level);
            const unsigned char c0 = (unsigned char)buf[0];
            if (lang == DATEFMT_LANG_ES) {
              if (c0 >= 'a' && c0 <= 'z') es_lower++;
              for (const char *p = buf; *p; p++) {
                if (*p >= 'A' && *p <= 'Z') { es_upper_any++; break; }
              }
            } else if (c0 >= 'A' && c0 <= 'Z') {
              other_upper++;
            }
          }
        }
      }
    }
    CHECK_EQ(es_lower, 7u * 12u * 2u);
    CHECK_EQ(es_upper_any, 0u);
    CHECK_EQ(other_upper, 5u * 7u * 12u * 2u);
  }

  printf("test_datefmt: %d ok, %d falliti\n", g_pass, g_fail);
  return g_fail ? 1 : 0;
}

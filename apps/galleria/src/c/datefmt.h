/* datefmt.h — data abbreviata per lingua FORZATA (S10, D34; S11, D40: es/pt) e separatore delle migliaia (D34, D41).
 * Modulo PURO: nessun pebble.h, solo tipi a larghezza fissa (testabile su host: test/test_datefmt.c).
 * Con lang = auto (0) l'orologio NON passa di qui: usa strftime del firmware (language pack). Le costanti
 * rispecchiano GalLang (settings.h) senza dipenderne, come timefmt.h fa con clock_mode. */
#ifndef GALLERIA_DATEFMT_H
#define GALLERIA_DATEFMT_H

#include <stddef.h>
#include <stdint.h>

/* GalSettings.lang 1..6 (0 = auto: non gestito qui, vale come EN se arriva). D39: es e pt in coda;
 * DATEFMT_LANG_LAST = ultima lingua (i confronti di intervallo usano LAST, mai il nome di una lingua). */
enum { DATEFMT_LANG_EN = 1, DATEFMT_LANG_IT = 2, DATEFMT_LANG_DE = 3, DATEFMT_LANG_FR = 4,
       DATEFMT_LANG_ES = 5, DATEFMT_LANG_PT = 6, DATEFMT_LANG_LAST = DATEFMT_LANG_PT };

/* Lunghezza massima del testo prodotto (byte, senza NUL, con mday <= 31): pt livello 0 "Sáb 31 de Set" = 14
 * ("á" vale 2 B; S11, era 13 = fr "Dim 31 Juill." fino alla S10; es al massimo "sá 31 mayo" = 11). */
#define DATEFMT_MAX_LEN 14
/* Dimensione minima del buffer per datefmt_format (DATEFMT_MAX_LEN + NUL). */
#define DATEFMT_BUFSZ   (DATEFMT_MAX_LEN + 1)

/* Scrive in out (al piu' cap byte, NUL compreso; snprintf tronca) la data abbreviata nella lingua data,
 * con le abbreviazioni IDENTICHE ai language pack di PebbleOS (spec S10 §0, S11 D40) e il formato della lingua
 * (D34, D40):
 *   livello 0: en "Sat 5 Sep", it "Sab 5 Set", fr "Sam 5 Sept.", de "Sa, 5. Sep", es "sá 5 sep", pt "Sáb 5 de Set"
 *   livello 1: en/it/fr/es/pt "Sab 5" (es "sá 5", pt "Sáb 5"), de "Sa, 5."
 *   livello 2 (o oltre): "5"
 * wday 0 = domenica (tm_wday), mon 0 = gennaio (tm_mon), mday stampato com'e' (tm_mday).
 * Indici clampati: lang fuori 1..6 -> EN, wday > 6 -> 6, mon > 11 -> 11. out NULL o cap 0: nessun effetto. */
void datefmt_format(char *out, size_t cap, uint8_t lang, uint8_t wday, uint8_t mday, uint8_t mon, uint8_t level);

/* Separatore delle migliaia per la lingua (D34, D41): en ','; it/de/es/pt '.'; fr ' ' (U+0020: U+202F non e'
 * nei font di sistema). Nessuna eccezione per es/pt (D41: come i pack e come l'automatico). lang fuori 1..6 -> EN (','). */
char datefmt_thousands_sep(uint8_t lang);

#endif /* GALLERIA_DATEFMT_H */

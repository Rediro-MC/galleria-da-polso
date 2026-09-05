/* datefmt.h — data abbreviata per lingua FORZATA (S10, D34) e separatore delle migliaia (D34).
 * Modulo PURO: nessun pebble.h, solo tipi a larghezza fissa (testabile su host: test/test_datefmt.c).
 * Con lang = auto (0) l'orologio NON passa di qui: usa strftime del firmware (language pack). Le costanti
 * rispecchiano GalLang (settings.h) senza dipenderne, come timefmt.h fa con clock_mode. */
#ifndef GALLERIA_DATEFMT_H
#define GALLERIA_DATEFMT_H

#include <stddef.h>
#include <stdint.h>

/* GalSettings.lang 1..4 (0 = auto: non gestito qui, vale come EN se arriva). */
enum { DATEFMT_LANG_EN = 1, DATEFMT_LANG_IT = 2, DATEFMT_LANG_DE = 3, DATEFMT_LANG_FR = 4 };

/* Lunghezza massima del testo prodotto (byte, senza NUL): fr livello 0 "Dim 31 Juill." = 13. */
#define DATEFMT_MAX_LEN 13
/* Dimensione minima del buffer per datefmt_format (DATEFMT_MAX_LEN + NUL). */
#define DATEFMT_BUFSZ   (DATEFMT_MAX_LEN + 1)

/* Scrive in out (al piu' cap byte, NUL compreso; snprintf tronca) la data abbreviata nella lingua data,
 * con le abbreviazioni IDENTICHE ai language pack di PebbleOS (spec S10 §0) e il formato della lingua (D34):
 *   livello 0: en "Sat 5 Sep", it "Sab 5 Set", fr "Sam 5 Sept.", de "Sa, 5. Sep"
 *   livello 1: en/it/fr "Sab 5", de "Sa, 5."
 *   livello 2 (o oltre): "5"
 * wday 0 = domenica (tm_wday), mon 0 = gennaio (tm_mon), mday stampato com'e' (tm_mday).
 * Indici clampati: lang fuori 1..4 -> EN, wday > 6 -> 6, mon > 11 -> 11. out NULL o cap 0: nessun effetto. */
void datefmt_format(char *out, size_t cap, uint8_t lang, uint8_t wday, uint8_t mday, uint8_t mon, uint8_t level);

/* Separatore delle migliaia per la lingua (D34): en ','; it/de '.'; fr ' ' (U+0020: U+202F non e' nei font
 * di sistema). lang fuori 1..4 -> EN (','). */
char datefmt_thousands_sep(uint8_t lang);

#endif /* GALLERIA_DATEFMT_H */

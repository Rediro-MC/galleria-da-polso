/* timefmt.h — formattazione ora/numeri. Modulo PURO: nessun pebble.h, testabile su host
 * (apps/galleria/test/test_timefmt.c). Le costanti dei modi rispecchiano GalSettings
 * (settings.h) senza dipenderne. */
#ifndef GALLERIA_TIMEFMT_H
#define GALLERIA_TIMEFMT_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/* GalSettings.clock_mode */
enum { TIMEFMT_CLOCK_AUTO = 0, TIMEFMT_CLOCK_12H = 1, TIMEFMT_CLOCK_24H = 2 };
/* GalSettings.leading_zero */
enum { TIMEFMT_LZ_AUTO = 0, TIMEFMT_LZ_ON = 1, TIMEFMT_LZ_OFF = 2 };

/* Dimensione minima del buffer per timefmt_hhmm ("HH:MM" + NUL). */
#define TIMEFMT_HHMM_BUFSZ 6

/* Decide il formato 24 h a partire dall'impostazione e dal formato di sistema
 * (clock_is_24h_style()). Modi sconosciuti → sistema. */
bool timefmt_resolve_24h(uint8_t clock_mode, bool system_24h);

/* Decide lo zero iniziale: AUTO → acceso in 24 h, spento in 12 h. Modi sconosciuti → AUTO. */
bool timefmt_resolve_leading_zero(uint8_t lz_mode, bool is24h);

/* Scrive "H:MM"/"HH:MM" (12 h: 0 → 12, 13 → 1). Ore e minuti fuori intervallo vengono
 * saturati a 0..23 / 0..59. Ritorna i caratteri scritti (senza NUL); 0 se il buffer è
 * troppo piccolo (in tal caso buf[0] = '\0' se size ≥ 1). */
size_t timefmt_hhmm(char *buf, size_t size, int hour, int minute, bool is24h, bool leading_zero);

/* "AM" per 0..11, "PM" per 12..23 (fuori intervallo: saturazione come sopra). */
const char *timefmt_ampm(int hour);

/* Intero senza segno con separatore delle migliaia (es. 6532 → "6.532" con sep '.').
 * sep == 0 → nessun separatore. Ritorna i caratteri scritti; 0 se il buffer è troppo piccolo. */
size_t timefmt_grouped_uint(char *buf, size_t size, uint32_t value, char sep);

#endif /* GALLERIA_TIMEFMT_H */

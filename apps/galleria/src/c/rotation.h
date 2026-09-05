/* rotation.h — rotazione STATELESS delle foto (docs/design/galleria.md D10). Modulo PURO: nessun
 * pebble.h (test host in test/test_rotation.c). Lo slot mostrato è una funzione del tempo locale,
 * delle impostazioni e di un contatore di shake: nessuna scrittura persist a regime e la stessa
 * foto dopo un riavvio (D19: il contatore di shake vive solo in RAM e riparte da 0 a ogni avvio).
 *
 *   t = now_min / interval_min          (interval_min 0 "mai" → t = 0;
 *                                        1440 "giornaliera" → cambio al primo tick dopo le 04:00)
 *   k = t + shake_offset                 (una scossa = posizione successiva)
 *   sequenziale: idx = k mod n
 *   casuale:     round = k / n, pos = k mod n; permutazione Fisher–Yates di n elementi seminata dal
 *                round (xorshift32); per n ≥ 3 il primo elemento del round r è forzato ≠ dall'ultimo
 *                del round r−1 ("mai la stessa due volte di seguito"); n ≤ 2 → come sequenziale.
 * La sequenza è manifest->order[] filtrata (slot validi nel formato nativo, non in skip_mask, senza
 * duplicati); se order[] non ne produce nessuno, gli slot 0..11 in ordine. */
#ifndef GALLERIA_ROTATION_H
#define GALLERIA_ROTATION_H

#include <stdint.h>
#include "gal_types.h"

#define ROT_DAILY_MIN   1440u    /* interval_min della modalità giornaliera */
#define ROT_DAILY_HOUR  4u       /* ora locale del cambio giornaliero */
/* Il contatore di shake vive in [0, ROT_SHAKE_MOD) e il chiamante lo incrementa modulo ROT_SHAKE_MOD
 * = mcm(1..12) = 27.720: così k = t + shake resta continuo modulo OGNI n ≤ 12 anche al wrap (con un
 * uint8 il salto 255 → 0 annullava la 256ª scossa quando n divide 255: 3, 5, 15 — test S4). In
 * casuale, al wrap (una volta ogni 27.720 scosse) la posizione è quella successiva ma il round cambia:
 * la foto PUÒ coincidere per caso (accettato). Precondizione: now_min ≤ 2^32 − 1 − ROT_SHAKE_MOD (vale
 * per costruzione: rotation_local_minutes satura a 2.120.101.919), altrimenti t + shake trabocca. */
#define ROT_SHAKE_MOD   27720u

/* Minuti locali trascorsi dal 1970-01-01 00:00 (calendario gregoriano proleptico) a partire dai
 * campi di struct tm già normalizzati: year = tm_year + 1900, month = tm_mon + 1 (1..12), day =
 * tm_mday (1..31), hour 0..23, minute 0..59. Valori fuori intervallo vengono saturati; date prima
 * del 1970 → 0. Massimo ≈ 2,2 miliardi di minuti (anno 6053). */
uint32_t rotation_local_minutes(int32_t year, int32_t month, int32_t day, int32_t hour, int32_t minute);

/* Indice 0..n−1 nella sequenza di n elementi per l'istante now_min (vedi sopra). n == 0 → 0.
 * order: 0 sequenziale, altro = casuale. */
uint8_t rotation_index(uint32_t now_min, uint8_t n, uint16_t interval_min, uint8_t order, uint16_t shake_offset);

/* Sequenza degli slot mostrabili (vedi sopra) in out[GAL_MAX_SLOTS]; ritorna quanti sono (0 se m è
 * NULL o nessuno slot è mostrabile). skip_mask: bit k = slot k da saltare (CRC fallito in RAM). */
uint8_t rotation_sequence(const GalManifest *m, uint8_t native_format, uint16_t skip_mask, uint8_t *out);

/* Slot da mostrare ora, o GAL_SLOT_NONE se la sequenza è vuota (→ foto demo). */
uint8_t rotation_slot(uint32_t now_min, const GalManifest *m, uint8_t native_format, uint16_t skip_mask,
                      uint16_t interval_min, uint8_t order, uint16_t shake_offset);

#endif /* GALLERIA_ROTATION_H */

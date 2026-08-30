/* storage.h — persist (docs/design/galleria.md §4.2, PIANO-SVILUPPO-PEBBLE.md §10.2, regola 8).
 * Chiavi: 0 schema (int), 1 GalManifest (scritto PER ULTIMO: manifest valido ⇒ foto complete),
 * 2 GalRotState (solo deinit), 10 GalSettings (debounce 10 s + flush in deinit, mai nel tick),
 * 1000 + slot·256 + i chunk da 256 B (raw6 134 chunk, raw1 12). Sostituire una foto = riscrivere le
 * stesse chiavi (mai persist_delete sui chunk). Validazione: persist_exists + persist_get_size ==
 * sizeof + magic/schema + CRC16, altrimenti default (mai crash); schema futuro → reset delle chiavi
 * 0/1/2/10. Album abilitato solo se persist_get_max_size() ≥ 1 MiB (altrimenti solo demo; le
 * impostazioni si salvano comunque). Superficie SDK usata (per lo shim dei test host):
 * persist_*, APP_LOG, app_timer_register/reschedule/cancel. */
#ifndef GALLERIA_STORAGE_H
#define GALLERIA_STORAGE_H

#include <stdbool.h>
#include <stdint.h>
#include "gal_types.h"
#include "settings.h"

#define STORAGE_SETTINGS_DEBOUNCE_MS 10000

typedef enum {
  STORAGE_OK       = 0,
  STORAGE_ERR      = -1,   /* errore generico del firmware / argomento non valido */
  STORAGE_NO_SPACE = -2,   /* E_OUT_OF_STORAGE: quota esaurita (S5a → STATUS NO_SPACE) */
  STORAGE_DISABLED = -3,   /* album non abilitato (quota < 1 MiB) */
} StorageResult;

/* Legge quota, schema (reset se futuro), manifest. Ritorna true se l'album è abilitato. */
bool storage_init(void);
bool storage_album_enabled(void);
uint32_t storage_quota(void);

/* Manifest corrente in RAM (mai NULL; vuoto se assente/invalido). */
const GalManifest *storage_manifest(void);
/* Numero di slot con state == VALID. */
uint8_t storage_valid_slots(void);

/* Impostazioni: lettura (false se assenti/invalide); scrittura con debounce (copia interna). */
bool storage_read_settings(GalSettings *out);
void storage_settings_changed(const GalSettings *s);
/* Scrive subito le impostazioni pendenti (deinit). */
void storage_flush(void);

/* Stato rotazione (chiave 2): lettura (false se assente/invalido) e scrittura (solo deinit). */
bool storage_read_rotstate(GalRotState *out);
bool storage_write_rotstate(const GalRotState *st);

/* Chunk i dello slot: byte letti (≤ cap) oppure < 0 (assente/errore/album disabilitato). Leggere i
 * chunk di una foto in ordine crescente senza intercalare altre chiavi (ricerca 02 F16). */
int storage_read_chunk(uint8_t slot, uint16_t i, uint8_t *buf, uint16_t cap);

/* Scrittura di una foto (S4 seed, S5a sync): i chunk in ordine crescente, poi il commit che
 * aggiorna slots[slot] (state VALID, generation + 1) e order[] (aggiunto in coda se assente) e
 * scrive il manifest. n ≤ GAL_CHUNK_BYTES. */
StorageResult storage_write_chunk(uint8_t slot, uint16_t i, const uint8_t *data, uint16_t n);
StorageResult storage_commit_slot(uint8_t slot, uint8_t format, uint32_t length, uint32_t crc32, uint32_t photo_id);
/* S5a: nuovo ordine (12 B, GAL_SLOT_NONE = fine) / slot svuotato (state EMPTY, chunk lasciati).
 * set_order è idempotente (S7, F9(4)): ordine identico a quello in RAM → STORAGE_OK senza scrivere
 * il manifest (con album disabilitato resta STORAGE_DISABLED). */
StorageResult storage_set_order(const uint8_t *order);
StorageResult storage_clear_slot(uint8_t slot);

#endif /* GALLERIA_STORAGE_H */

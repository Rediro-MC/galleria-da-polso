/* storage.h — persist (docs/design/galleria.md §4.2, PIANO-SVILUPPO-PEBBLE.md §10.2, regola 8).
 * Chiavi (schema 2, revisione perf 04/09/2026): 0 schema (int), 1 GalManifest 234 B = slot +
 * ordine + impostazioni + offset shake (UN solo record di metadati: sul PT2 ogni ricerca di chiave
 * costa una scansione del file, ~0,4 s con 12 foto; scritto PER ULTIMO nella sync: manifest valido
 * ⇒ foto complete), 1000 + slot·256 + i chunk da 256 B (raw6 134 chunk, raw1 12). Le chiavi 2
 * (GalRotState) e 10 (GalSettings) dello schema 1 vengono lette una volta dalla migrazione e mai
 * più. Le impostazioni si scrivono con debounce 10 s (flush in deinit); lo shake NON viene
 * persistito (model.c lo tiene in RAM: D10 rivista, ogni record in più rallenta ogni avvio);
 * storage_write_rotstate resta per i test e per completezza dell'API (stesso debounce). Sostituire una foto = riscrivere le
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

/* Impostazioni (nel manifest): lettura (false se nessun record); scrittura con debounce (copia interna). */
bool storage_read_settings(GalSettings *out);
void storage_settings_changed(const GalSettings *s);
/* Scrive subito le impostazioni pendenti (deinit). Uno shake pendente da solo NON viene scritto. */
void storage_flush(void);

/* Offset shake (nel manifest): lettura (false se nessun record); scrittura con debounce 10 s
 * (chiamare a ogni scossa: costa nulla; invariato → nessuna scrittura). */
bool storage_read_rotstate(GalRotState *out);
bool storage_write_rotstate(const GalRotState *st);

/* ms della prima chiamata persist di questa esecuzione (= apertura del file da parte del firmware:
 * 2 scansioni di tutti i record, morti compresi). Misurato sempre: HELLO.OPEN_MS → config page
 * ("Galleria si avvia lentamente?" con la procedura di rimozione + reinstallazione). */
uint16_t storage_open_ms(void);
/* Build M (GALLERIA_DEBUG_TIMING): 0 = come storage_open_ms, 1 = ms della ricerca del manifest.
 * Sempre 0 nella build P. */
int storage_debug_ms(uint8_t which);

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

/* ui_photo.h — la foto di sfondo. UN solo GBitmap preallocato in init() PRIMA di ogni altra
 * allocazione (regola 13; eccezione documentata alla regola 6 root): 8Bit 200×228 su emery
 * (45.600 B + struct), 1BitPalette 144×168 su flint (3.024 B, palette static {nero, bianco}).
 * Risorsa demo (S2): UNA sola resource_load_byte_range dall'offset 0 nella coda del bitmap e
 * decodifica in place col PhotoDecoder (photo_codec.h) — il costo di lettura cresce con l'offset
 * iniziale (ricerca 04 F12), quindi niente blocchi e una risorsa per foto. In S4 lo stesso decoder
 * riceve i chunk persist da 256 B. Disegno (D11): foto intera solo quando cambia (o su redraw
 * completo), solo la fascia dinamica al tick tramite una sub-bitmap creata fuori da update_proc. */
#ifndef GALLERIA_UI_PHOTO_H
#define GALLERIA_UI_PHOTO_H

#include <pebble.h>
#include "gal_types.h"

/* init(): alloca il bitmap (false = heap insufficiente: l'app continua con sfondo nero). */
bool ui_photo_init(void);
/* deinit(): distrugge bitmap e sub-bitmap. */
void ui_photo_deinit(void);

/* Formato nativo della piattaforma: PHOTO_FMT_RAW6_200x228 (emery) / PHOTO_FMT_RAW1_144x168 (flint). */
uint8_t ui_photo_native_format(void);

/* Carica una risorsa raw (demo) nel bitmap. false se il bitmap manca, la dimensione della risorsa
 * non è quella del formato nativo o la lettura fallisce (in tal caso il bitmap viene azzerato). */
bool ui_photo_load_resource(uint32_t resource_id);
/* S4: carica la foto dello slot da persist (storage_read_chunk in ordine crescente, decodifica a
 * streaming nel bitmap, CRC32 accumulato e confrontato con meta->crc32). false se meta non è
 * VALID nel formato nativo con la lunghezza attesa (bitmap intatto), oppure se un chunk manca o il
 * CRC non coincide (bitmap azzerato: il chiamante passa allo slot successivo). */
bool ui_photo_load_persist(uint8_t slot, const GalSlotMeta *meta);
/* true se il bitmap contiene una foto completa. */
bool ui_photo_is_loaded(void);
/* Azzera il bitmap (nero) e lo marca "non caricato". */
void ui_photo_clear(void);

/* Fascia dinamica in coordinate schermo: crea/ricrea la sub-bitmap (chiamare in window_load o su
 * cambio layout, MAI in update_proc). h ≤ 0 → nessuna sub-bitmap (draw_band disegna tutto). */
void ui_photo_set_band(int16_t y0, int16_t h);

/* Disegno in update_proc (compositing GCompOpAssign, antialias irrilevante). Senza bitmap o senza
 * foto caricata riempiono di nero l'area richiesta (la fascia va sempre ripulita al tick). band =
 * fascia dinamica in coordinate schermo (di norma quella passata a ui_photo_set_band). */
void ui_photo_draw_full(GContext *ctx, GRect full);
void ui_photo_draw_band(GContext *ctx, GRect band);

/* Accesso ai pixel per luma (riga 0 e stride in byte); NULL se il bitmap manca. */
const uint8_t *ui_photo_data(uint16_t *stride);
/* Dimensioni del bitmap (0×0 se manca). */
GSize ui_photo_size(void);

#endif /* GALLERIA_UI_PHOTO_H */

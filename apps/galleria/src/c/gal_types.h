/* gal_types.h — tipi PERSISTITI condivisi da storage.c, rotation.c, model.c e dai test host
 * (docs/design/galleria.md §4.1–4.2). Header PURO: nessun pebble.h, solo tipi a larghezza fissa.
 * Le struct sono packed e le loro dimensioni sono fissate da _Static_assert: cambiano solo con un
 * nuovo GAL_SCHEMA (versione futura letta da un'app vecchia → reset, mai crash). */
#ifndef GALLERIA_GAL_TYPES_H
#define GALLERIA_GAL_TYPES_H

#include <stdint.h>

#define GAL_MAX_SLOTS       12
#define GAL_KEYS_PER_SLOT   256          /* chiavi riservate per slot (64 KiB max per foto) */
#define GAL_CHUNK_BYTES     256          /* PERSIST_DATA_MAX_LENGTH: 1 chunk = 1 chiave */
#define GAL_KEY_SCHEMA      0            /* int32: GAL_SCHEMA */
#define GAL_KEY_MANIFEST    1            /* GalManifest, scritto PER ULTIMO dopo i chunk */
#define GAL_KEY_ROTSTATE    2            /* GalRotState, solo in deinit */
#define GAL_KEY_SETTINGS    10           /* GalSettings (settings.h) */
#define GAL_KEY_CHUNK(k, i) (1000u + (uint32_t)(k) * GAL_KEYS_PER_SLOT + (uint32_t)(i))
#define GAL_MAGIC           0x314C4147u  /* "GAL1" letto little-endian */
#define GAL_SCHEMA          1
#define GAL_SLOT_NONE       0xFFu        /* nessuno slot / fine di order[] */
#define GAL_MIN_QUOTA       1048576u     /* persist_get_max_size() minima per l'album (1 MiB) */

enum { GAL_SLOT_EMPTY = 0, GAL_SLOT_VALID = 1 };

typedef struct __attribute__((packed)) {
  uint8_t  state;        /* GAL_SLOT_EMPTY / GAL_SLOT_VALID */
  uint8_t  format;       /* PHOTO_FMT_* (photo_codec.h) */
  uint16_t generation;   /* +1 a ogni sostituzione */
  uint32_t length;       /* byte del payload (34.200 raw6 / 3.024 raw1) */
  uint32_t crc32;        /* CRC-32 zlib del payload */
  uint32_t photo_id;     /* assegnato dal telefono (≠ 0) */
} GalSlotMeta;           /* 16 B */

typedef struct __attribute__((packed)) {
  uint32_t    magic;                 /* GAL_MAGIC */
  uint8_t     schema;                /* GAL_SCHEMA */
  uint8_t     slot_count;            /* GAL_MAX_SLOTS */
  uint8_t     order[GAL_MAX_SLOTS];  /* indici slot in ordine di rotazione, GAL_SLOT_NONE = fine */
  uint16_t    reserved;
  GalSlotMeta slots[GAL_MAX_SLOTS];  /* 192 B */
  uint16_t    crc16;                 /* CRC-16/CCITT-FALSE dei 212 B precedenti */
} GalManifest;                       /* 214 B */

typedef struct __attribute__((packed)) {
  uint16_t shake_offset; /* avanzamenti manuali (shake) accumulati, modulo ROT_SHAKE_MOD (rotation.h):
                            16 bit perché con 8 il wrap 255 → 0 annullava una scossa per n | 255 (S4) */
  uint16_t crc16;        /* dei 2 B precedenti */
} GalRotState;           /* 4 B */

_Static_assert(sizeof(GalSlotMeta) == 16, "GalSlotMeta deve essere 16 B (design 4.1)");
_Static_assert(sizeof(GalManifest) == 214, "GalManifest deve essere 214 B (design 4.1)");
_Static_assert(sizeof(GalRotState) == 4, "GalRotState deve essere 4 B (design 4.1)");

#endif /* GALLERIA_GAL_TYPES_H */

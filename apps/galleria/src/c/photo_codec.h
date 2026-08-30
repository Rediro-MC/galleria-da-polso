/* photo_codec.h — codec foto. Modulo PURO: nessun pebble.h, solo tipi a larghezza fissa
 * (test host in test/test_photo_codec.c). Formati (docs/design/galleria.md §4.3–4.4):
 *
 *  raw6 (emery, 200×228): 4 pixel → 3 byte MSB-first, idx = r2<<4 | g2<<2 | b2 (0..63):
 *        b0 = p0<<2 | p1>>4;  b1 = (p1&15)<<4 | p2>>2;  b2 = (p2&3)<<6 | p3
 *        riga 150 B (200 px, 50 gruppi), totale 34.200 B. Sull'orologio ogni pixel diventa un byte
 *        GColor8 opaco 0xC0|idx nel GBitmap 8Bit (stride = 200 B/riga).
 *  raw1 (flint, 144×168): GBitmapFormat1BitPalette MSB-first (pixel 0 nel bit 0x80), bit 1 =
 *        palette[1] = bianco, riga 18 B, totale 3.024 B, copiato tal quale nel bitmap.
 *
 * Il decoder è a streaming: accetta blocchi di input di QUALSIASI lunghezza (i chunk persist da
 * 256 B non sono multipli di 3) con carry di 0–2 byte fra una chiamata e l'altra, e scrive
 * riga per riga in un buffer con stride (quello del GBitmap). Un gruppo da 4 px non attraversa
 * mai una riga (200 % 4 == 0 e 150 % 3 == 0).
 *
 * GARANZIA "in place" (usata da ui_photo per leggere la risorsa con UNA sola chiamata): con stride
 * == row_bytes, l'input raw6 può stare nella CODA del buffer di output (in = dst + 45.600 − 34.200 =
 * dst + 11.400) ed essere decodificato lì. Ogni gruppo legge i suoi 3 byte prima di scrivere i 4 di
 * output (argomenti di prv_raw6_group), i gruppi sono elaborati in ordine crescente e la scrittura
 * del gruppo k finisce a 4k+3 < 11.400 + 3(k+1) = primo byte non ancora letto, per ogni k < 11.400.
 * Vale per qualsiasi sequenza di chunk (l'ordine non cambia). Test: test_decoder_inplace. */
#ifndef GALLERIA_PHOTO_CODEC_H
#define GALLERIA_PHOTO_CODEC_H

#include <stdbool.h>
#include <stdint.h>

/* Valori di GalSlotMeta.format (design §4.1): stabili, vanno in persist. */
enum { PHOTO_FMT_NONE = 0, PHOTO_FMT_RAW6_200x228 = 1, PHOTO_FMT_RAW1_144x168 = 2 };

#define RAW6_W              200
#define RAW6_H              228
#define RAW6_ROW_BYTES      150        /* 200 px × 6 bit / 8 */
#define RAW6_BYTES          34200      /* RAW6_ROW_BYTES × RAW6_H */
#define RAW6_OUT_ROW_BYTES  200        /* 1 byte/px nel GBitmap 8Bit */
#define RAW1_W              144
#define RAW1_H              168
#define RAW1_ROW_BYTES      18         /* 144 px / 8, MSB-first */
#define RAW1_BYTES          3024       /* RAW1_ROW_BYTES × RAW1_H */

#define PHOTO_PIXEL_OPAQUE  0xC0u      /* GColor8: alpha = 3 nei due bit alti */

/* ---- basso livello raw6, indipendente dalle dimensioni dell'immagine ---- */

typedef struct {
  uint8_t carry[2];
  uint8_t ncarry;                      /* 0..2 byte di input in attesa di completare un gruppo da 3 */
} Raw6Unpacker;

void raw6_unpack_init(Raw6Unpacker *u);

/* Consuma n byte di input; per ogni gruppo completo di 3 byte scrive 4 byte (0xC0|idx) in dst.
 * Scrive al massimo dst_cap byte: se dst è pieno l'input residuo viene SCARTATO (il chiamante
 * deve dimensionare dst per (ncarry + n) / 3 * 4 byte). Ritorna i byte scritti in dst.
 * in/dst possono essere NULL solo se n == 0 / dst_cap == 0. */
uint32_t raw6_unpack(Raw6Unpacker *u, const uint8_t *in, uint32_t n, uint8_t *dst, uint32_t dst_cap);

/* Inverso (test host e riferimento per tools/photo_prep.py): npix indici 0..63 (i bit alti degli
 * indici vengono ignorati) → 3 B ogni 4 px; un ultimo gruppo incompleto viene completato con 0.
 * Ritorna i byte scritti (≤ out_cap; se out_cap non basta scrive solo i gruppi interi che entrano). */
uint32_t raw6_pack(const uint8_t *idx, uint32_t npix, uint8_t *out, uint32_t out_cap);

/* ---- alto livello: decoder a streaming verso il buffer del bitmap ---- */

typedef struct {
  Raw6Unpacker u;
  uint8_t   format;                    /* PHOTO_FMT_* */
  uint8_t  *dst;                       /* riga 0 del buffer di destinazione */
  uint16_t  dst_stride;                /* byte per riga nel buffer (≥ row_bytes) */
  uint16_t  row_bytes;                 /* byte utili per riga di OUTPUT (200 raw6, 18 raw1) */
  uint16_t  rows;                      /* righe totali (228 / 168) */
  uint16_t  in_row_bytes;              /* byte di INPUT per riga (150 raw6, 18 raw1) */
  uint32_t  in_len;                    /* byte di input attesi (34.200 / 3.024) */
  uint32_t  in_pos;                    /* byte di input consumati (≤ in_len) */
  uint32_t  out_pos;                   /* byte di output prodotti, riga-maggiore SENZA stride */
} PhotoDecoder;

/* Lunghezza in byte del payload per formato (0 se ignoto). */
uint32_t photo_format_length(uint8_t format);
/* Byte di output per riga (200 / 18) e righe (228 / 168); 0 se ignoto. */
uint16_t photo_format_row_bytes(uint8_t format);
uint16_t photo_format_rows(uint8_t format);

/* Prepara il decoder su dst (riga 0 del bitmap) con lo stride dato. false se il formato è ignoto,
 * dst è NULL o dst_stride < row_bytes. */
bool photo_decoder_init(PhotoDecoder *d, uint8_t format, uint8_t *dst, uint16_t dst_stride);
/* Consuma n byte di input (quelli oltre in_len vengono ignorati e NON contati). Ritorna i byte di
 * output prodotti da questa chiamata. Mai più di row_bytes × rows byte scritti in totale. */
uint32_t photo_decoder_feed(PhotoDecoder *d, const uint8_t *in, uint32_t n);
/* true quando in_pos == in_len e out_pos == row_bytes × rows (nessun carry pendente). */
bool photo_decoder_complete(const PhotoDecoder *d);

#endif /* GALLERIA_PHOTO_CODEC_H */

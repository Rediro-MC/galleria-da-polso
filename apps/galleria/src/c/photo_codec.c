/* photo_codec.c — vedi photo_codec.h. Nessun pebble.h; solo tipi a larghezza fissa. */
#include <string.h>
#include "photo_codec.h"

/* ---- raw6 ---- */

/* Un gruppo: 3 byte di input → 4 byte GColor8 opachi (0xC0 | idx). */
static void prv_raw6_group(uint8_t *dst, uint8_t b0, uint8_t b1, uint8_t b2) {
  dst[0] = (uint8_t)(PHOTO_PIXEL_OPAQUE | (b0 >> 2));
  dst[1] = (uint8_t)(PHOTO_PIXEL_OPAQUE | ((b0 & 3u) << 4) | (b1 >> 4));
  dst[2] = (uint8_t)(PHOTO_PIXEL_OPAQUE | ((b1 & 15u) << 2) | (b2 >> 6));
  dst[3] = (uint8_t)(PHOTO_PIXEL_OPAQUE | (b2 & 63u));
}

void raw6_unpack_init(Raw6Unpacker *u) {
  if (u) {
    u->carry[0] = 0;
    u->carry[1] = 0;
    u->ncarry = 0;
  }
}

uint32_t raw6_unpack(Raw6Unpacker *u, const uint8_t *in, uint32_t n, uint8_t *dst, uint32_t dst_cap) {
  if (!u) {
    return 0;
  }
  uint32_t i = 0;
  uint32_t w = 0;
  while (i < n) {
    if (u->ncarry == 0 && (n - i) >= 3u) {
      /* Percorso veloce: gruppi interi direttamente dall'input. */
      if (w + 4u > dst_cap) {
        break;                         /* dst pieno: input residuo scartato */
      }
      prv_raw6_group(dst + w, in[i], in[i + 1], in[i + 2]);
      i += 3;
      w += 4;
    } else {
      /* Coda o gruppo a cavallo di due chiamate: un byte alla volta via carry.
       * Il byte si consuma solo se il gruppo può essere scritto (altrimenti è scarto). */
      if (u->ncarry < 2) {
        u->carry[u->ncarry++] = in[i++];
      } else {
        if (w + 4u > dst_cap) {
          break;
        }
        prv_raw6_group(dst + w, u->carry[0], u->carry[1], in[i]);
        i++;
        u->ncarry = 0;
        w += 4;
      }
    }
  }
  if (i < n) {
    u->ncarry = 0;                     /* scarto: nessun gruppo pendente, stato coerente */
  }
  return w;
}

uint32_t raw6_pack(const uint8_t *idx, uint32_t npix, uint8_t *out, uint32_t out_cap) {
  uint32_t w = 0;
  for (uint32_t i = 0; i < npix; i += 4) {
    if (w + 3u > out_cap) {
      break;
    }
    uint8_t p[4] = { 0, 0, 0, 0 };     /* ultimo gruppo incompleto completato con 0 */
    for (uint32_t k = 0; k < 4u && i + k < npix; k++) {
      p[k] = (uint8_t)(idx[i + k] & 63u);
    }
    out[w]     = (uint8_t)((p[0] << 2) | (p[1] >> 4));
    out[w + 1] = (uint8_t)(((p[1] & 15u) << 4) | (p[2] >> 2));
    out[w + 2] = (uint8_t)(((p[2] & 3u) << 6) | p[3]);
    w += 3;
  }
  return w;
}

/* ---- PhotoDecoder ---- */

uint32_t photo_format_length(uint8_t format) {
  switch (format) {
    case PHOTO_FMT_RAW6_200x228: return RAW6_BYTES;
    case PHOTO_FMT_RAW1_144x168: return RAW1_BYTES;
    default:                     return 0;
  }
}

uint16_t photo_format_row_bytes(uint8_t format) {
  switch (format) {
    case PHOTO_FMT_RAW6_200x228: return RAW6_OUT_ROW_BYTES;
    case PHOTO_FMT_RAW1_144x168: return RAW1_ROW_BYTES;
    default:                     return 0;
  }
}

uint16_t photo_format_rows(uint8_t format) {
  switch (format) {
    case PHOTO_FMT_RAW6_200x228: return RAW6_H;
    case PHOTO_FMT_RAW1_144x168: return RAW1_H;
    default:                     return 0;
  }
}

/* Byte di input per riga: 150 raw6 (3 B ogni 4 px), 18 raw1 (copia tal quale). */
static uint16_t prv_in_row_bytes(uint8_t format) {
  switch (format) {
    case PHOTO_FMT_RAW6_200x228: return RAW6_ROW_BYTES;
    case PHOTO_FMT_RAW1_144x168: return RAW1_ROW_BYTES;
    default:                     return 0;
  }
}

bool photo_decoder_init(PhotoDecoder *d, uint8_t format, uint8_t *dst, uint16_t dst_stride) {
  if (!d) {
    return false;
  }
  memset(d, 0, sizeof(*d));            /* format = NONE: feed/complete restano inerti */
  uint32_t len = photo_format_length(format);
  uint16_t row_bytes = photo_format_row_bytes(format);
  if (len == 0 || !dst || dst_stride < row_bytes) {
    return false;
  }
  raw6_unpack_init(&d->u);
  d->format = format;
  d->dst = dst;
  d->dst_stride = dst_stride;
  d->row_bytes = row_bytes;
  d->rows = photo_format_rows(format);
  d->in_row_bytes = prv_in_row_bytes(format);
  d->in_len = len;
  d->in_pos = 0;
  d->out_pos = 0;
  return true;
}

uint32_t photo_decoder_feed(PhotoDecoder *d, const uint8_t *in, uint32_t n) {
  if (!d || d->in_len == 0 || !in || n == 0) {
    return 0;
  }
  uint32_t avail = d->in_len - d->in_pos;
  if (n > avail) {
    n = avail;                         /* eccesso ignorato e non contato */
  }
  uint32_t produced = 0;
  uint32_t i = 0;
  while (i < n) {
    /* Si lavora entro la riga di INPUT corrente: un gruppo raw6 non la attraversa mai. */
    uint32_t row = d->in_pos / d->in_row_bytes;
    uint32_t in_off = d->in_pos - row * d->in_row_bytes;
    uint32_t take = d->in_row_bytes - in_off;
    if (take > n - i) {
      take = n - i;
    }
    uint8_t *row_dst = d->dst + row * d->dst_stride;
    if (d->format == PHOTO_FMT_RAW6_200x228) {
      /* Offset di output nella riga = out_pos − inizio riga; cap = byte residui della riga,
       * che bastano sempre per i gruppi completabili con questi take byte. */
      uint32_t out_off = d->out_pos - row * d->row_bytes;
      uint32_t w = raw6_unpack(&d->u, in + i, take, row_dst + out_off, d->row_bytes - out_off);
      d->out_pos += w;
      produced += w;
    } else {
      memcpy(row_dst + in_off, in + i, take);
      d->out_pos += take;
      produced += take;
    }
    d->in_pos += take;
    i += take;
  }
  return produced;
}

bool photo_decoder_complete(const PhotoDecoder *d) {
  if (!d || d->in_len == 0) {
    return false;
  }
  return d->in_pos == d->in_len
      && d->out_pos == (uint32_t)d->row_bytes * d->rows
      && d->u.ncarry == 0;
}

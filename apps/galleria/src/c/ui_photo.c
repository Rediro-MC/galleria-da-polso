/* ui_photo.c — vedi ui_photo.h. Regole: un solo bitmap grande allocato in init() (regola 13),
 * nessun buffer di staging (la risorsa viene letta nella coda del bitmap e decodificata in place),
 * nessuna allocazione in update_proc (regola 3). */
#include <pebble.h>
#include "ui_photo.h"
#include "photo_codec.h"
#include "storage.h"
#include "crc.h"
#include "gal_log.h"

/* I formati raw sono definiti per queste esatte dimensioni: un'altra piattaforma non deve compilare
 * in silenzio (regola 1: le dimensioni vengono dalla build, non dal nome della piattaforma). */
#if defined(PBL_COLOR)
_Static_assert(RAW6_W == PBL_DISPLAY_WIDTH && RAW6_H == PBL_DISPLAY_HEIGHT, "raw6 e' definito per 200x228");
#else
_Static_assert(RAW1_W == PBL_DISPLAY_WIDTH && RAW1_H == PBL_DISPLAY_HEIGHT, "raw1 e' definito per 144x168");
#endif

static GBitmap *s_bmp;            /* la foto residente */
static GBitmap *s_band;           /* sub-bitmap della fascia dinamica (condivide i pixel di s_bmp) */
static GRect    s_band_rect;      /* in coordinate schermo/bitmap (coincidono: layer a schermo intero) */
static bool     s_loaded;
#if !defined(PBL_COLOR)
static GColor   s_palette[2];     /* {nero, bianco}: bit 1 = bianco (design §4.4), mai liberata dal sistema */
#endif
static uint8_t  s_chunk[GAL_CHUNK_BYTES];   /* lettura dei chunk persist (regola 5: mai 256 B sullo stack) */

/* Millisecondi trascorsi fra due letture di time_ms (una misura per caricamento, regola 11).
 * Mai negativo: pypkjs (e il telefono) risincronizzano l'orologio di ±1 s (S6 §7: "-951 ms"). */
static int32_t prv_elapsed_ms(time_t s0, uint16_t ms0) {
  time_t s1 = 0;
  uint16_t ms1 = 0;
  time_ms(&s1, &ms1);
  const int32_t dt = (int32_t)(s1 - s0) * 1000 + ((int32_t)ms1 - (int32_t)ms0);
  return dt < 0 ? 0 : dt;
}

uint8_t ui_photo_native_format(void) {
  return PBL_IF_COLOR_ELSE(PHOTO_FMT_RAW6_200x228, PHOTO_FMT_RAW1_144x168);
}

bool ui_photo_init(void) {
  if (s_bmp) {
    return true;
  }
#if defined(PBL_COLOR)
  s_bmp = gbitmap_create_blank(GSize(RAW6_W, RAW6_H), GBitmapFormat8Bit);
#else
  s_palette[0] = GColorBlack;
  s_palette[1] = GColorWhite;
  s_bmp = gbitmap_create_blank_with_palette(GSize(RAW1_W, RAW1_H), GBitmapFormat1BitPalette,
                                            s_palette, false);
#endif
  if (!s_bmp) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "photo: bitmap alloc failed (free=%u)", (unsigned)heap_bytes_free());
    return false;
  }
  LOGV("photo: bitmap %dx%d fmt=%d stride=%u heap %u/%u",
       (int)gbitmap_get_bounds(s_bmp).size.w, (int)gbitmap_get_bounds(s_bmp).size.h,
       (int)gbitmap_get_format(s_bmp), (unsigned)gbitmap_get_bytes_per_row(s_bmp),
       (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
  return true;
}

void ui_photo_deinit(void) {
  if (s_band) {
    gbitmap_destroy(s_band);          /* prima la sub-bitmap, poi il padre (pebble.h) */
    s_band = NULL;
  }
  if (s_bmp) {
    gbitmap_destroy(s_bmp);
    s_bmp = NULL;
  }
  s_loaded = false;
}

void ui_photo_clear(void) {
  s_loaded = false;
  if (!s_bmp) {
    return;
  }
  uint8_t *data = gbitmap_get_data(s_bmp);
  const GRect b = gbitmap_get_bounds(s_bmp);
  const uint16_t stride = gbitmap_get_bytes_per_row(s_bmp);
  if (data && b.size.h > 0) {
    memset(data, 0, (size_t)stride * (size_t)b.size.h);   /* 0 = nero in entrambi i formati */
  }
}

bool ui_photo_load_resource(uint32_t resource_id) {
  if (!s_bmp) {
    return false;
  }
  const uint8_t fmt = ui_photo_native_format();
  const uint32_t len = photo_format_length(fmt);
  uint8_t *data = gbitmap_get_data(s_bmp);
  const uint16_t stride = gbitmap_get_bytes_per_row(s_bmp);
  const uint32_t bmp_bytes = (uint32_t)stride * photo_format_rows(fmt);
  ResHandle h = resource_get_handle(resource_id);
  const size_t rs = resource_size(h);

  /* Il costo di resource_load_byte_range cresce con l'offset iniziale (ricerca 04 F12: O(offset)
   * sul PT2 reale, ~2,8 MB/s di "seek"): UNA sola lettura dall'offset 0. Senza buffer in più: il
   * payload va nella CODA del buffer del bitmap e si decodifica in place. Sicuro perché ogni gruppo
   * raw6 legge i suoi 3 byte prima di scrivere i 4 di output e la lettura resta sempre avanti alla
   * scrittura (garanzia documentata in photo_codec.h); raw1 è già nel layout del bitmap. Vale solo
   * con stride == byte per riga del formato (200 / 18): altrimenti nessuna foto (loggato). */
  if (!data || rs != (size_t)len || stride != photo_format_row_bytes(fmt) || bmp_bytes < len) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "photo: resource %u unusable (size %u/%u, stride %u)",
            (unsigned)resource_id, (unsigned)rs, (unsigned)len, (unsigned)stride);
    ui_photo_clear();
    return false;
  }
  uint8_t *tail = data + (bmp_bytes - len);

  time_t s0 = 0;
  uint16_t ms0 = 0;
  time_ms(&s0, &ms0);                    /* una misura per caricamento (regola 11) */
  const size_t got = resource_load_byte_range(h, 0, tail, len);
  bool ok = (got == (size_t)len);
  if (ok && tail != data) {              /* raw6: decodifica in place dalla coda verso l'inizio */
    PhotoDecoder dec;                    /* ~32 B sullo stack */
    ok = photo_decoder_init(&dec, fmt, data, stride)
      && photo_decoder_feed(&dec, tail, len) > 0
      && photo_decoder_complete(&dec);
  }                                      /* raw1: tail == data, già nel formato del bitmap */
  s_loaded = ok;
  LOGV("photo: resource %u loaded=%d (%u B, 1 read) %d ms heap %u/%u",
       (unsigned)resource_id, (int)ok, (unsigned)got, (int)prv_elapsed_ms(s0, ms0),
       (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
  if (!ok) {
    ui_photo_clear();
  }
  return ok;
}

bool ui_photo_load_persist(uint8_t slot, const GalSlotMeta *meta) {
  if (!s_bmp || !meta) {
    return false;
  }
  const uint8_t fmt = ui_photo_native_format();
  const uint32_t len = photo_format_length(fmt);
  uint8_t *data = gbitmap_get_data(s_bmp);
  const uint16_t stride = gbitmap_get_bytes_per_row(s_bmp);
  if (!data || meta->state != GAL_SLOT_VALID || meta->format != fmt || meta->length != len) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "photo: slot %u meta unusable (state %u fmt %u/%u len %u/%u)",
            (unsigned)slot, (unsigned)meta->state, (unsigned)meta->format, (unsigned)fmt,
            (unsigned)meta->length, (unsigned)len);
    return false;                        /* bitmap intatto: nessuna lettura fatta */
  }
  PhotoDecoder dec;                      /* ~32 B sullo stack */
  if (!photo_decoder_init(&dec, fmt, data, stride)) {
    return false;
  }
  time_t s0 = 0;
  uint16_t ms0 = 0;
  time_ms(&s0, &ms0);                    /* una misura per caricamento (regola 11) */
  uint32_t crc = 0, off = 0;
  uint16_t i = 0;
  bool ok = true;
  while (off < len) {                    /* chunk in ordine crescente, nessun'altra chiave in mezzo (F16) */
    const uint16_t want = (len - off > GAL_CHUNK_BYTES) ? GAL_CHUNK_BYTES : (uint16_t)(len - off);
    const int got = storage_read_chunk(slot, i, s_chunk, GAL_CHUNK_BYTES);
    if (got != (int)want) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "photo: slot %u chunk %u read %d/%u", (unsigned)slot, (unsigned)i, got, (unsigned)want);
      ok = false;
      break;
    }
    crc = crc32_update(crc, s_chunk, want);
    photo_decoder_feed(&dec, s_chunk, want);
    off += want;
    i++;
  }
  ok = ok && photo_decoder_complete(&dec) && crc == meta->crc32;
  const int32_t dt = prv_elapsed_ms(s0, ms0);
  s_loaded = ok;
  /* Una riga per caricamento da persist (produzione: S8 misura i tempi sul PT2 con questa). */
  APP_LOG(APP_LOG_LEVEL_INFO, "photo: slot %u persist crc %s %u ch %d ms heap %u/%u",
          (unsigned)slot, ok ? "ok" : "MISMATCH", (unsigned)i, (int)dt,
          (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
  if (!ok) {
    ui_photo_clear();                    /* mai mostrare una foto parziale o corrotta */
  }
  return ok;
}

bool ui_photo_is_loaded(void) {
  return s_loaded;
}

void ui_photo_set_band(int16_t y0, int16_t h) {
  if (s_band) {
    gbitmap_destroy(s_band);
    s_band = NULL;
  }
  s_band_rect = GRectZero;
  if (!s_bmp || h <= 0) {
    return;
  }
  const GRect b = gbitmap_get_bounds(s_bmp);
  GRect r = GRect(0, y0, b.size.w, h);
  grect_clip(&r, &b);
  if (r.size.h <= 0) {
    return;
  }
  s_band = gbitmap_create_as_sub_bitmap(s_bmp, r);   /* nessuna copia dei pixel */
  if (s_band) {
    s_band_rect = r;
  } else {
    APP_LOG(APP_LOG_LEVEL_ERROR, "photo: sub-bitmap alloc failed");
  }
}

static void prv_fill_black(GContext *ctx, GRect r) {
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, r, 0, GCornerNone);
}

void ui_photo_draw_full(GContext *ctx, GRect full) {
  if (!s_bmp || !s_loaded) {
    prv_fill_black(ctx, full);
    return;
  }
  const GRect b = gbitmap_get_bounds(s_bmp);
  if (b.size.w != full.size.w || b.size.h != full.size.h) {
    prv_fill_black(ctx, full);         /* difensivo: nessun residuo fuori dalla foto */
  }
  graphics_context_set_compositing_mode(ctx, GCompOpAssign);
  graphics_draw_bitmap_in_rect(ctx, s_bmp, GRect(0, 0, b.size.w, b.size.h));
}

void ui_photo_draw_band(GContext *ctx, GRect band) {
  if (!s_bmp || !s_loaded) {
    prv_fill_black(ctx, band);         /* la fascia va SEMPRE ripulita: mai cifre sopra cifre */
    return;
  }
  if (!s_band || s_band_rect.size.h <= 0) {
    const GRect b = gbitmap_get_bounds(s_bmp);
    ui_photo_draw_full(ctx, GRect(0, 0, b.size.w, b.size.h));
    return;
  }
  graphics_context_set_compositing_mode(ctx, GCompOpAssign);
  graphics_draw_bitmap_in_rect(ctx, s_band, s_band_rect);
}

const uint8_t *ui_photo_data(uint16_t *stride) {
  if (!s_bmp) {
    if (stride) {
      *stride = 0;
    }
    return NULL;
  }
  if (stride) {
    *stride = gbitmap_get_bytes_per_row(s_bmp);
  }
  return gbitmap_get_data(s_bmp);
}

GSize ui_photo_size(void) {
  if (!s_bmp) {
    return GSizeZero;
  }
  return gbitmap_get_bounds(s_bmp).size;
}

/* ui_digits.c — vedi ui_digits.h. Regole: allocazioni solo in ui_digits_load (mai in update_proc),
 * ogni *_create con il suo *_destroy, compositing riportato a GCompOpAssign dopo ogni blit. */
#include <pebble.h>
#include "ui_digits.h"
#include "gal_log.h"

#define FILL_ARGB    0xFFu    /* bianco nel PNG → riempimento */
#define OUTLINE_ARGB 0xC0u    /* nero nel PNG → contorno */
#define PALETTE_N    4        /* 2BitPalette */

/* Le tabelle generate devono avere la forma [font][taglia] attesa. */
_Static_assert(sizeof(DIGITS_METRICS[0]) / sizeof(DIGITS_METRICS[0][0]) == DIGITS_SIZES, "DIGITS_METRICS: 2 taglie");
_Static_assert(sizeof(DIGITS_RESOURCE_IDS) / sizeof(DIGITS_RESOURCE_IDS[0]) == sizeof(DIGITS_METRICS) / sizeof(DIGITS_METRICS[0]),
               "DIGITS_RESOURCE_IDS: stessi font di DIGITS_METRICS");
_Static_assert(sizeof(DIGITS_RESOURCE_IDS[0]) / sizeof(DIGITS_RESOURCE_IDS[0][0]) == DIGITS_SIZES, "DIGITS_RESOURCE_IDS: 2 taglie");
_Static_assert(DIGITS_GLYPH_COLON < DIGITS_GLYPHS, "il ':' e' l'ultimo glifo della strip");

typedef struct {
  GBitmap *strip;
  GBitmap *glyph[DIGITS_GLYPHS];        /* sub-bitmap: solo l'inchiostro del glifo, tutta l'altezza */
  const DigitStripMetrics *m;
  uint8_t  font;
  uint8_t  fill_idx, outline_idx;       /* indici di palette riconosciuti dal colore */
  bool     loaded;
} DigitStrip;

static DigitStrip s_strip[DIGITS_SIZES];

static bool prv_detect_palette(DigitStrip *s) {
  GColor *pal = gbitmap_get_palette(s->strip);
  if (!pal) {
    return false;
  }
  bool have_fill = false, have_outline = false;
  for (uint8_t i = 0; i < PALETTE_N; i++) {
    if (!have_fill && pal[i].argb == FILL_ARGB) {
      s->fill_idx = i;
      have_fill = true;
    } else if (!have_outline && pal[i].argb == OUTLINE_ARGB) {
      s->outline_idx = i;
      have_outline = true;
    }
  }
  return have_fill && have_outline;
}

void ui_digits_unload(uint8_t size) {
  if (size >= DIGITS_SIZES) {
    return;
  }
  DigitStrip *s = &s_strip[size];
  for (uint8_t g = 0; g < DIGITS_GLYPHS; g++) {
    if (s->glyph[g]) {
      gbitmap_destroy(s->glyph[g]);   /* le sub-bitmap prima del padre */
      s->glyph[g] = NULL;
    }
  }
  if (s->strip) {
    gbitmap_destroy(s->strip);
    s->strip = NULL;
  }
  s->m = NULL;
  s->loaded = false;
}

void ui_digits_unload_all(void) {
  for (uint8_t i = 0; i < DIGITS_SIZES; i++) {
    ui_digits_unload(i);
  }
}

bool ui_digits_load(uint8_t size, uint8_t font) {
  if (size >= DIGITS_SIZES) {
    return false;
  }
  DigitStrip *s = &s_strip[size];
  if (font >= DIGITS_FONTS) {
    ui_digits_unload(size);              /* font non valido: mai lasciare la strip precedente */
    APP_LOG(APP_LOG_LEVEL_ERROR, "digits: font %u out of range", (unsigned)font);
    return false;
  }
  if (s->loaded && s->font == font) {
    return true;
  }
  ui_digits_unload(size);

  const DigitStripMetrics *m = &DIGITS_METRICS[font][size];
  s->strip = gbitmap_create_with_resource(DIGITS_RESOURCE_IDS[font][size]);
  if (!s->strip) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "digits: strip font=%u size=%u alloc failed (free=%u)",
            (unsigned)font, (unsigned)size, (unsigned)heap_bytes_free());
    return false;
  }
  const GRect b = gbitmap_get_bounds(s->strip);
  const GBitmapFormat fmt = gbitmap_get_format(s->strip);
  if (b.size.w != (int16_t)m->strip_w || b.size.h != (int16_t)m->strip_h
      || fmt != GBitmapFormat2BitPalette || !prv_detect_palette(s)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "digits: strip font=%u size=%u unexpected (%dx%d fmt=%d, metrics %ux%u)",
            (unsigned)font, (unsigned)size, (int)b.size.w, (int)b.size.h, (int)fmt,
            (unsigned)m->strip_w, (unsigned)m->strip_h);
    ui_digits_unload(size);
    return false;
  }
  for (uint8_t g = 0; g < DIGITS_GLYPHS; g++) {
    if (m->ink[g].w == 0) {
      s->glyph[g] = NULL;                /* glifo assente dalla strip (S7: taglia B senza ':'): niente sub-bitmap */
      continue;
    }
    const GRect r = GRect(m->ink[g].x, 0, m->ink[g].w, m->strip_h);
    s->glyph[g] = gbitmap_create_as_sub_bitmap(s->strip, r);
    if (!s->glyph[g]) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "digits: sub-bitmap %u failed", (unsigned)g);
      ui_digits_unload(size);
      return false;
    }
  }
  s->m = m;
  s->font = font;
  s->loaded = true;
  LOGV("digits: font=%u size=%u %ux%u fill=%u outline=%u heap %u/%u",
       (unsigned)font, (unsigned)size, (unsigned)m->strip_w, (unsigned)m->strip_h,
       (unsigned)s->fill_idx, (unsigned)s->outline_idx,
       (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
  return true;
}

bool ui_digits_is_loaded(uint8_t size) {
  return size < DIGITS_SIZES && s_strip[size].loaded;
}

uint8_t ui_digits_font(uint8_t size) {
  return size < DIGITS_SIZES ? s_strip[size].font : 0;
}

const DigitStripMetrics *ui_digits_metrics(uint8_t size) {
  return ui_digits_is_loaded(size) ? s_strip[size].m : NULL;
}

int16_t ui_digits_ink_width(uint8_t size, uint8_t glyph) {
  if (!ui_digits_is_loaded(size) || glyph >= DIGITS_GLYPHS) {
    return 0;
  }
  return (int16_t)s_strip[size].m->ink[glyph].w;
}

int16_t ui_digits_height(uint8_t size) {
  return ui_digits_is_loaded(size) ? (int16_t)s_strip[size].m->strip_h : 0;
}

void ui_digits_set_colors(uint8_t size, GColor fill, GColor outline, bool outline_on) {
  if (!ui_digits_is_loaded(size)) {
    return;
  }
  DigitStrip *s = &s_strip[size];
  GColor *pal = gbitmap_get_palette(s->strip);
  if (!pal) {
    return;
  }
  pal[s->fill_idx] = fill;
  pal[s->outline_idx] = outline_on ? outline : GColorClear;   /* la palette è letta al blit */
}

void ui_digits_draw(GContext *ctx, uint8_t size, uint8_t glyph, int16_t x, int16_t y, int16_t advance) {
  if (!ui_digits_is_loaded(size) || glyph >= DIGITS_GLYPHS) {
    return;
  }
  const DigitStrip *s = &s_strip[size];
  if (!s->glyph[glyph]) {
    return;                              /* glifo assente dalla strip (ink w == 0) */
  }
  const int16_t w = (int16_t)s->m->ink[glyph].w;
  const int16_t gx = x + (advance - w) / 2;
  graphics_context_set_compositing_mode(ctx, GCompOpSet);
  graphics_draw_bitmap_in_rect(ctx, s->glyph[glyph], GRect(gx, y, w, (int16_t)s->m->strip_h));
  graphics_context_set_compositing_mode(ctx, GCompOpAssign);
}

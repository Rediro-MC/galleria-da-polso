/* ui_digits.c — vedi ui_digits.h. Regole: allocazioni solo in ui_digits_load (mai in update_proc),
 * ogni *_create con il suo *_destroy, compositing riportato a GCompOpAssign dopo ogni blit.
 * Per taglia: la strip + UNA sub-bitmap che gbitmap_set_bounds sposta sul glifo prima del blit. */
#include <pebble.h>
#include "ui_digits.h"
#include "gal_log.h"

#define FILL_ARGB    0xFFu    /* bianco nel PNG → riempimento */
#define RING_ARGB    0xC0u    /* nero nel PNG → anello (contorno spesso) */
#define SHADOW_ARGB  0xF0u    /* rosso nel PNG → ombra 3D (S8-stile, D20) */
#define PALETTE_N    4        /* 2BitPalette */
#define IDX_NONE     0xFFu    /* indice di palette assente (strip senza ombra) */

/* Le tabelle generate devono avere la forma [strip][taglia] attesa. */
_Static_assert(sizeof(DIGITS_METRICS) / sizeof(DIGITS_METRICS[0]) == DIGITS_FONT_COUNT, "DIGITS_METRICS: DIGITS_FONT_COUNT strip");
_Static_assert(sizeof(DIGITS_METRICS[0]) / sizeof(DIGITS_METRICS[0][0]) == DIGITS_SIZES, "DIGITS_METRICS: 2 taglie");
_Static_assert(sizeof(DIGITS_RESOURCE_IDS) / sizeof(DIGITS_RESOURCE_IDS[0]) == DIGITS_FONT_COUNT,
               "DIGITS_RESOURCE_IDS: stesse strip di DIGITS_METRICS");
_Static_assert(sizeof(DIGITS_RESOURCE_IDS[0]) / sizeof(DIGITS_RESOURCE_IDS[0][0]) == DIGITS_SIZES, "DIGITS_RESOURCE_IDS: 2 taglie");
_Static_assert(DIGITS_GLYPH_COLON < DIGITS_GLYPHS, "il ':' e' l'ultimo glifo della strip");

typedef struct {
  GBitmap *strip;
  GBitmap *sprite;                      /* UNA sub-bitmap riposizionata sul glifo con gbitmap_set_bounds prima di ogni blit
                                         * (revisione S8-stile F4: −10 GBitmap per taglia rispetto a una sub-bitmap per glifo) */
  const DigitStripMetrics *m;
  uint8_t  index;                       /* strip caricata (gal_font_strip) */
  uint8_t  fill_idx, ring_idx, shadow_idx;   /* indici di palette riconosciuti dal colore (shadow: IDX_NONE se assente) */
  bool     loaded;
} DigitStrip;

static DigitStrip s_strip[DIGITS_SIZES];

static bool prv_detect_palette(DigitStrip *s) {
  GColor *pal = gbitmap_get_palette(s->strip);
  if (!pal) {
    return false;
  }
  bool have_fill = false, have_ring = false;
  s->shadow_idx = IDX_NONE;
  for (uint8_t i = 0; i < PALETTE_N; i++) {
    if (!have_fill && pal[i].argb == FILL_ARGB) {
      s->fill_idx = i;
      have_fill = true;
    } else if (!have_ring && pal[i].argb == RING_ARGB) {
      s->ring_idx = i;
      have_ring = true;
    } else if (s->shadow_idx == IDX_NONE && pal[i].argb == SHADOW_ARGB) {
      s->shadow_idx = i;
    }
  }
  return have_fill && have_ring;
}

void ui_digits_unload(uint8_t size) {
  if (size >= DIGITS_SIZES) {
    return;
  }
  DigitStrip *s = &s_strip[size];
  if (s->sprite) {
    gbitmap_destroy(s->sprite);        /* la sub-bitmap prima del padre */
    s->sprite = NULL;
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

bool ui_digits_load(uint8_t size, uint8_t strip) {
  if (size >= DIGITS_SIZES) {
    return false;
  }
  DigitStrip *s = &s_strip[size];
  if (strip >= DIGITS_STRIPS) {
    ui_digits_unload(size);              /* indice non valido: mai lasciare la strip precedente */
    APP_LOG(APP_LOG_LEVEL_ERROR, "digits: strip %u out of range", (unsigned)strip);
    return false;
  }
  if (s->loaded && s->index == strip) {
    return true;
  }
  ui_digits_unload(size);

  const DigitStripMetrics *m = &DIGITS_METRICS[strip][size];
  s->strip = gbitmap_create_with_resource(DIGITS_RESOURCE_IDS[strip][size]);
  if (!s->strip) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "digits: strip %u size=%u alloc failed (free=%u)",
            (unsigned)strip, (unsigned)size, (unsigned)heap_bytes_free());
    return false;
  }
  const GRect b = gbitmap_get_bounds(s->strip);
  const GBitmapFormat fmt = gbitmap_get_format(s->strip);
  if (b.size.w != (int16_t)m->strip_w || b.size.h != (int16_t)m->strip_h
      || fmt != GBitmapFormat2BitPalette || !prv_detect_palette(s)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "digits: strip %u size=%u unexpected (%dx%d fmt=%d, metrics %ux%u)",
            (unsigned)strip, (unsigned)size, (int)b.size.w, (int)b.size.h, (int)fmt,
            (unsigned)m->strip_w, (unsigned)m->strip_h);
    ui_digits_unload(size);
    return false;
  }
  if (m->shadow && s->shadow_idx == IDX_NONE) {
    /* La strip ha S > 0 ma il colore dell'ombra non c'è nella palette del .pbi (quantizzazione della
     * SDK?): si disegna lo stesso, l'ombra resta del colore che ha preso (gate S8-stile, rischio §8). */
    APP_LOG(APP_LOG_LEVEL_WARNING, "digits: strip %u size=%u senza colore ombra", (unsigned)strip, (unsigned)size);
  }
  /* Una sola sub-bitmap (bounds iniziali = glifo '0', tutta l'altezza): ui_digits_draw la sposta sul glifo
   * da disegnare con gbitmap_set_bounds (nessuna allocazione in update_proc, regola 3). Un glifo con
   * ink[g].w == 0 (S7: taglia B senza ':') è assente: ui_digits_draw non disegna nulla. */
  s->sprite = gbitmap_create_as_sub_bitmap(s->strip, GRect(m->ink[0].x, 0, m->ink[0].w, m->strip_h));
  if (!s->sprite) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "digits: sub-bitmap failed (free=%u)", (unsigned)heap_bytes_free());
    ui_digits_unload(size);
    return false;
  }
  s->m = m;
  s->index = strip;
  s->loaded = true;
  LOGV("digits: strip=%u size=%u %ux%u fill=%u ring=%u shadow=%u heap %u/%u",
       (unsigned)strip, (unsigned)size, (unsigned)m->strip_w, (unsigned)m->strip_h,
       (unsigned)s->fill_idx, (unsigned)s->ring_idx, (unsigned)s->shadow_idx,
       (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
  return true;
}

bool ui_digits_is_loaded(uint8_t size) {
  return size < DIGITS_SIZES && s_strip[size].loaded;
}

uint8_t ui_digits_strip(uint8_t size) {
  return size < DIGITS_SIZES ? s_strip[size].index : 0;
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

int16_t ui_digits_fill_width(uint8_t size, uint8_t glyph) {
  const int16_t w = ui_digits_ink_width(size, glyph);
  if (w <= 0) {
    return 0;
  }
  const DigitStripMetrics *m = s_strip[size].m;
  const int16_t fill = (int16_t)(w - 2 * (int16_t)m->ring - (int16_t)m->shadow);
  return fill < 1 ? 1 : fill;
}

int16_t ui_digits_height(uint8_t size) {
  return ui_digits_is_loaded(size) ? (int16_t)s_strip[size].m->strip_h : 0;
}

void ui_digits_set_palette(uint8_t size, GColor fill, GColor ring, GColor shadow) {
  if (!ui_digits_is_loaded(size)) {
    return;
  }
  DigitStrip *s = &s_strip[size];
  GColor *pal = gbitmap_get_palette(s->strip);
  if (!pal) {
    return;
  }
  pal[s->fill_idx] = fill;                 /* la palette è letta al blit */
  pal[s->ring_idx] = ring;
  if (s->shadow_idx != IDX_NONE) {
    pal[s->shadow_idx] = shadow;
  }
}

void ui_digits_draw(GContext *ctx, uint8_t size, uint8_t glyph, int16_t x, int16_t y, int16_t advance) {
  if (!ui_digits_is_loaded(size) || glyph >= DIGITS_GLYPHS) {
    return;
  }
  const DigitStrip *s = &s_strip[size];
  const int16_t w = (int16_t)s->m->ink[glyph].w;
  if (w <= 0 || !s->sprite) {
    return;                              /* glifo assente dalla strip (ink w == 0) */
  }
  int16_t core = (int16_t)(w - (int16_t)s->m->shadow);   /* riempimento + anello: l'ombra sporge a destra */
  if (core < 1) {
    core = w;
  }
  const int16_t gx = x + (advance - core) / 2;
  gbitmap_set_bounds(s->sprite, GRect(s->m->ink[glyph].x, 0, w, (int16_t)s->m->strip_h));   /* solo un rettangolo: nessuna alloc */
  graphics_context_set_compositing_mode(ctx, GCompOpSet);
  graphics_draw_bitmap_in_rect(ctx, s->sprite, GRect(gx, y, w, (int16_t)s->m->strip_h));
  graphics_context_set_compositing_mode(ctx, GCompOpAssign);
}

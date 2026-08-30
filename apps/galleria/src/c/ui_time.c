/* ui_time.c — vedi ui_time.h. Regole CLAUDE.md: buffer static, niente malloc in update_proc,
 * GSize del testo memorizzate al tick, antialias off, un solo layer_mark_dirty per tick.
 * S2: sfondo = foto (ui_photo), colore testo da luma.c (una volta per foto), alone opzionale.
 * S3: cifre come sprite (ui_digits) nel layout A (o LECO di sistema) e nel layout B a tutto
 * schermo (HH sopra MM); con Quick View il layout B ripiega su una riga con la strip A, che in B
 * viene caricata solo per la durata della Quick View (S7, D16: −8.152 B di heap a regime). */
#include <pebble.h>
#include "ui_time.h"
#include "ui_photo.h"
#include "ui_digits.h"
#include "luma.h"
#include "settings.h"
#include "timefmt.h"
#include "gal_log.h"

_Static_assert(GAL_FONT_LECO == 3 && sizeof(DIGITS_METRICS) / sizeof(DIGITS_METRICS[0]) == 3,
               "i font sprite sono 0..2 (Anton, Bebas, Barlow); GAL_FONT_LECO = 3 e' il font di sistema");

/* ---- geometria (numeri da docs/design/galleria.md §3.1–§3.3) ---- */
#define MARGIN_X        4
#define INFO_GAP        6     /* spazio minimo fra le celle della riga info */
#define AMPM_GAP        4     /* spazio fra cifre e AM/PM */
#define BT_ICON_W       10
#define BT_ICON_H       16
#define BOLT_W          8
#define BOLT_H          14
#define BOLT_GAP        2
#define MAX_GLYPHS      5     /* "HH:MM" */
#define AMPM_SHRINK     2     /* in 12 h le celle delle CIFRE (non del ':') si stringono di 2 px per AM/PM (§3.1) */

/* Modalità di rendering effettiva = impostazioni + strip caricate + area non ostruita. */
enum { MODE_A_LECO = 0, MODE_A_SPRITE = 1, MODE_B_SPRITE = 2, MODE_B_QV = 3 };

typedef struct {
  GRect   full;                 /* bounds del layer (schermo intero) */
  PreferredContentSize content_size;   /* letto una volta (regola 1) */
  /* layout A con LECO di sistema (S1) */
  int16_t leco_y, leco_h;       /* box del testo ora: (0, leco_y, w, leco_h) */
  int16_t leco_bottom;          /* riga sotto l'ultimo pixel delle cifre LECO (misurata sugli screenshot) */
  int16_t info_y, info_h;       /* riga info (solo layout A) */
  /* layout A con sprite: riga y, passo delle celle in 24 h (cifra, due punti) */
  int16_t a_y, a_cell, a_colon;
  /* layout B: righe HH/MM, cella e gap */
  int16_t b_hh_y, b_mm_y, b_cell, b_gap;
  GFont   leco_font, ampm_font, info_font;
  /* dinamici (prv_pick_mode) */
  uint8_t mode;
  int16_t band_y, band_h;       /* fascia dinamica [band_y, band_y + band_h): tutto ciò che cambia al tick sta qui */
  int16_t luma_h;               /* fascia valutata da luma: [0, luma_h) (in B tutto lo schermo: le due righe) */
} UiLayout;

typedef struct { uint8_t glyph; int16_t x, adv; } GlyphPos;

static Layer   *s_layer;
static Layer   *s_root;
static UiLayout s_lay;
static GPath   *s_bolt_path;
static bool     s_full_redraw = true;
static bool     s_first_render_logged;
static int16_t  s_unob_h;        /* altezza dell'area non ostruita (aggiornata da unobstructed_changed) */

/* Stato mostrato (aggiornato al tick / su evento, mai in update_proc). */
static char  s_time_buf[TIMEFMT_HHMM_BUFSZ];
static char  s_ampm_buf[3];
static char  s_steps_buf[16];
static char  s_batt_buf[8];
static char  s_date_buf[24];
static char  s_sync_buf[16];     /* "Foto 255/255" (S5a) */
static uint8_t s_sync_index, s_sync_count;
static bool  s_connected = true;
static bool  s_steps_ok;
static BatteryChargeState s_batt;
static char  s_thousands_sep = '.';

/* Posizioni calcolate al tick (GSize memorizzate: regola 12). */
static GRect s_rc_time, s_rc_ampm, s_rc_left, s_rc_batt, s_rc_date;
static bool  s_show_bt_icon, s_show_left, s_show_batt, s_show_date, s_show_sync;
/* Sprite: riga 1 (unica in A / HH in B) e riga 2 (MM in B). */
static GlyphPos s_row1[MAX_GLYPHS], s_row2[MAX_GLYPHS];
static uint8_t  s_row1_n, s_row2_n;
static int16_t  s_row1_y, s_row2_y;
static char     s_prev_hh[3];    /* ore dell'ultimo tick: in B la riga HH (fuori fascia) si ridisegna solo se cambia */

/* Colore testo (S2): deciso da luma.c sulla fascia dinamica + impostazioni, in ui_time_photo_changed
 * (mai nel tick). s_fg = testo/riempimento, s_bg = alone/contorno. */
static LumaResult s_luma;
static GColor s_fg, s_bg;
static bool   s_halo;
/* Offset dell'alone del testo di sistema: i primi 4 "a croce" (font piccoli), tutti e 8 per LECO. */
static const int8_t HALO_OFFS[8][2] = { {-1, 0}, {1, 0}, {0, -1}, {0, 1}, {-1, -1}, {1, -1}, {-1, 1}, {1, 1} };

static const GPathInfo s_bolt_info = {
  .num_points = 7,
  .points = (GPoint[]) { {4, 0}, {0, 8}, {3, 8}, {2, 14}, {8, 5}, {5, 5}, {6, 0} },
};

#ifdef GALLERIA_DEBUG_TIMING
/* Hook di misura (S7, O3): ms fra due time_ms, mai negativo (pypkjs risincronizza l'orologio di ±1 s).
 * Solo in build di misura: un log per render ("draw:") e per tick ("tick:"). */
static int32_t prv_elapsed_ms(time_t s0, uint16_t ms0) {
  time_t s1 = 0;
  uint16_t ms1 = 0;
  time_ms(&s1, &ms1);
  const int32_t dt = (int32_t)(s1 - s0) * 1000 + ((int32_t)ms1 - (int32_t)ms0);
  return dt < 0 ? 0 : dt;
}
#endif

/* ---------------------------------------------------------------- layout */

static void prv_compute_layout(Layer *root) {
  s_lay.full = layer_get_bounds(root);
  const bool wide = s_lay.full.size.w >= 180;              /* 200 px: emery-class */
  s_lay.content_size = preferred_content_size();            /* letto una volta */

  if (wide) {
    s_lay.leco_font = fonts_get_system_font(FONT_KEY_LECO_60_BOLD_NUMBERS_AM_PM); /* cifre 42 px */
    s_lay.leco_y = 6;
    s_lay.leco_h = 60;
    s_lay.leco_bottom = s_lay.leco_y + 60;      /* cifre a y 24..65: a filo del fondo del box */
    if (s_lay.content_size == PreferredContentSizeExtraLarge) {
      s_lay.info_font = fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD);
      s_lay.info_y = 80;
      s_lay.info_h = 28;
    } else {
      s_lay.info_font = fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
      s_lay.info_y = 82;
      s_lay.info_h = 22;
    }
    s_lay.a_y = 8;   s_lay.a_cell = 40; s_lay.a_colon = 16;    /* §3.1: 40|40|16|40|40 = 176, x0 12 */
    s_lay.b_hh_y = 12; s_lay.b_mm_y = 120; s_lay.b_cell = 64; s_lay.b_gap = 8;   /* §3.2 */
  } else {
    s_lay.leco_font = fonts_get_system_font(FONT_KEY_LECO_42_NUMBERS);            /* cifre 29 px */
    s_lay.leco_y = 6;
    s_lay.leco_h = 44;
    s_lay.leco_bottom = s_lay.leco_y + 42;      /* cifre a y 19..47 */
    s_lay.info_font = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
    s_lay.info_y = 56;
    s_lay.info_h = 18;
    s_lay.a_y = 6;   s_lay.a_cell = 28; s_lay.a_colon = 12;    /* §3.3: 28|28|12|28|28 = 124, x0 10 */
    s_lay.b_hh_y = 12; s_lay.b_mm_y = 92; s_lay.b_cell = 48; s_lay.b_gap = 8;
  }
  s_lay.ampm_font = fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD);
}

/* Il font delle impostazioni è un font sprite (0..DIGITS_FONTS-1)? LECO e valori fuori intervallo no. */
static bool prv_sprite_font(void) {
  return settings_get()->font < DIGITS_FONTS;
}

/* La strip caricata deve corrispondere alla griglia cablata (regola 1: nessun legame implicito fra
 * digit_metrics.h generato e le costanti di layout): passo di cella e altezza dentro lo schermo. */
static bool prv_strip_fits(uint8_t size) {
  const DigitStripMetrics *m = ui_digits_metrics(size);
  if (!m) {
    return false;
  }
  const bool a = (size == DIGITS_SIZE_A);
  const int16_t cell = a ? s_lay.a_cell : s_lay.b_cell;
  const int16_t bottom = a ? (int16_t)(s_lay.a_y + m->strip_h) : (int16_t)(s_lay.b_mm_y + m->strip_h);
  const int16_t limit = a ? s_lay.info_y : s_lay.full.size.h;
  if ((int16_t)m->cell_w != cell || bottom > limit) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "digits: size=%u cell_w=%u h=%u vs grid cell %d bottom %d > %d",
            (unsigned)size, (unsigned)m->cell_w, (unsigned)m->strip_h, (int)cell, (int)bottom, (int)limit);
    return false;
  }
  return true;
}

static bool prv_load_checked(uint8_t size, uint8_t font) {
  if (!ui_digits_load(size, font)) {
    return false;
  }
  if (!prv_strip_fits(size)) {
    ui_digits_unload(size);
    return false;
  }
  return true;
}

/* Carica/scarica le strip secondo impostazioni e area non ostruita (D16, S7); no-op se già nello
 * stato giusto (ui_digits_load ritorna subito con lo stesso font).
 *   need_b = layout B (font = st->font se sprite, altrimenti Anton);
 *   need_a = (layout A e font sprite) oppure (layout B, B caricata e Quick View attiva): in B la A
 *            serve solo alla riga singola sotto il peek, con lo stesso font della B, e viene
 *            scaricata al did_change che chiude la Quick View (−7.932 B di heap a regime, misurato
 *            nel gate S7); se la B non è caricabile (heap) si ripiega sul layout A con sprite (revisione S7).
 * Chiamata da prv_refresh_mode (window_load, ui_time_layout_changed, did_change dell'area non
 * ostruita): MAI da update_proc (regola 3). Ordine: prima la B, poi la A, così il blocco A vive in
 * cima all'heap sopra foto e strip B e il suo alloc/free non lascia buchi. Ogni fallimento lascia la
 * taglia scarica (prv_pick_mode ripiega: senza A sotto Quick View → MODE_A_LECO). */
static void prv_load_strips(void) {
  const GalSettings *st = settings_get();
  const bool sprite = prv_sprite_font();
  const bool layout_b = st->layout == GAL_LAYOUT_B;
  const bool obstructed = s_unob_h < s_lay.full.size.h;
  const uint8_t font_b = sprite ? st->font : GAL_FONT_ANTON;
  bool need_a;
  uint8_t font_a;

  if (layout_b) {
    prv_load_checked(DIGITS_SIZE_B, font_b);
    if (ui_digits_is_loaded(DIGITS_SIZE_B)) {
      need_a = obstructed;               /* D16: la A solo sotto Quick View, con il font della B */
      font_a = font_b;
    } else {
      need_a = sprite;                   /* B non caricabile (heap): ripiego sul layout A con sprite (come prima di S7) */
      font_a = st->font;
    }
  } else {
    ui_digits_unload(DIGITS_SIZE_B);
    need_a = sprite;
    font_a = st->font;
  }
  if (need_a) {
    prv_load_checked(DIGITS_SIZE_A, font_a);
  } else {
    ui_digits_unload(DIGITS_SIZE_A);
  }
}

/* Modalità e fascia dinamica da impostazioni, strip disponibili e area non ostruita. */
static void prv_pick_mode(void) {
  const GalSettings *st = settings_get();
  const bool obstructed = s_unob_h < s_lay.full.size.h;
  uint8_t mode = MODE_A_LECO;
  if (st->layout == GAL_LAYOUT_B && ui_digits_is_loaded(DIGITS_SIZE_B)) {
    if (!obstructed) {
      mode = MODE_B_SPRITE;
    } else if (ui_digits_is_loaded(DIGITS_SIZE_A)) {
      mode = MODE_B_QV;
    } else {
      mode = MODE_A_LECO;               /* senza strip A la riga MM finirebbe sotto il peek: ora intera con LECO */
    }
  } else if (prv_sprite_font() && ui_digits_is_loaded(DIGITS_SIZE_A)) {
    mode = MODE_A_SPRITE;
  }
  s_lay.mode = mode;
  s_lay.band_y = 0;
  switch (mode) {
    case MODE_B_SPRITE:
      /* Al tick cambia solo la riga MM (+ "PM" in basso): fascia dalla riga MM al fondo; la riga HH
       * (e il cambio AM/PM) si ridisegnano con un redraw completo quando cambia l'ora (D11). */
      s_lay.band_y = (int16_t)(s_lay.b_mm_y - 1);
      s_lay.band_h = (int16_t)(s_lay.full.size.h - s_lay.band_y);
      s_lay.luma_h = s_lay.full.size.h;                      /* colore deciso su entrambe le righe */
      break;
    case MODE_B_QV:
      s_lay.band_h = s_lay.a_y + ui_digits_height(DIGITS_SIZE_A) + 2;   /* riga singola, niente riga info */
      s_lay.luma_h = s_lay.band_h;
      break;
    default:
      /* 2 px di margine sotto la riga info (design §3.1/§3.3: 106 emery, 76 flint; 110 in ExtraLarge) */
      s_lay.band_h = s_lay.info_y + s_lay.info_h + 2;
      s_lay.luma_h = s_lay.band_h;
      break;
  }
}

static bool prv_mode_is_a(void) {
  return s_lay.mode == MODE_A_LECO || s_lay.mode == MODE_A_SPRITE;
}

static GSize prv_measure(const char *text, GFont font, int16_t h) {
  if (!text || text[0] == '\0') {
    return GSizeZero;
  }
  return graphics_text_layout_get_content_size(text, font, GRect(0, 0, s_lay.full.size.w, h),
                                               GTextOverflowModeWordWrap, GTextAlignmentLeft);
}

static uint8_t prv_glyph_of(char c) {
  return (c >= '0' && c <= '9') ? (uint8_t)(c - '0') : DIGITS_GLYPH_COLON;
}

/* Riga di glifi con passo per cifra/due punti, a partire da x0: ritorna la larghezza totale.
 * Un glifo più largo del passo (Barlow '4' in 12 h) riceve il proprio inchiostro come passo,
 * così non si sovrappone mai ai vicini (il blocco si allarga di conseguenza). */
static int16_t prv_place_row(GlyphPos *row, uint8_t *n, uint8_t size, const char *s, uint8_t count,
                             int16_t x0, int16_t cell, int16_t colon, int16_t gap) {
  int16_t x = x0;
  *n = 0;
  for (uint8_t i = 0; i < count && s[i] && *n < MAX_GLYPHS; i++) {
    const uint8_t g = prv_glyph_of(s[i]);
    int16_t adv = (g == DIGITS_GLYPH_COLON) ? colon : cell;
    const int16_t ink = ui_digits_ink_width(size, g);
    if (ink > adv) {
      adv = ink;
    }
    row[*n] = (GlyphPos) { .glyph = g, .x = x, .adv = adv };
    (*n)++;
    x += adv + gap;
  }
  return (int16_t)(x - x0 - (*n ? gap : 0));
}

static void prv_shift_row(GlyphPos *row, uint8_t n, int16_t dx) {
  for (uint8_t i = 0; i < n; i++) {
    row[i].x += dx;
  }
}

/* Posiziona ora + AM/PM centrati orizzontalmente (blocco unico) secondo la modalità. */
static void prv_layout_time(void) {
  const int16_t w = s_lay.full.size.w;
  GSize as = prv_measure(s_ampm_buf, s_lay.ampm_font, s_lay.info_h);
  s_row1_n = s_row2_n = 0;

  if (s_lay.mode == MODE_A_LECO) {
    GSize ts = prv_measure(s_time_buf, s_lay.leco_font, s_lay.leco_h);
    int16_t total = ts.w + (as.w ? AMPM_GAP + as.w : 0);
    int16_t x0 = (w - total) / 2;
    if (x0 < 0) {
      x0 = 0;
    }
    s_rc_time = GRect(x0, s_lay.leco_y, ts.w + 2, s_lay.leco_h);
    /* AM/PM con la base sulla stessa riga del fondo delle cifre: i glifi di Gothic 14 Bold occupano
     * le righe 5..13 del box da 14 px, quindi box.y = bottom - as.h → fondo glifi = bottom - 1 */
    s_rc_ampm = GRect(x0 + ts.w + AMPM_GAP, s_lay.leco_bottom - as.h, as.w + 2, as.h + 2);
    return;
  }

  if (s_lay.mode == MODE_B_SPRITE) {
    /* HH sopra MM: celle b_cell con gap, ogni riga centrata; ore a 1 cifra → cella centrata.
     * "H:MM" / "HH:MM": le ore finiscono al primo ':' (nessuna funzione di libreria: regola 5/13). */
    uint8_t hh_n = 0;
    const char *mm = s_time_buf;
    while (*mm && *mm != ':') {
      mm++;
      hh_n++;
    }
    if (*mm == ':') {
      mm++;
    }
    const int16_t hh_w = prv_place_row(s_row1, &s_row1_n, DIGITS_SIZE_B, s_time_buf, hh_n, 0, s_lay.b_cell, s_lay.b_cell, s_lay.b_gap);
    const int16_t mm_w = prv_place_row(s_row2, &s_row2_n, DIGITS_SIZE_B, mm, 2, 0, s_lay.b_cell, s_lay.b_cell, s_lay.b_gap);
    prv_shift_row(s_row1, s_row1_n, (int16_t)((w - hh_w) / 2));
    prv_shift_row(s_row2, s_row2_n, (int16_t)((w - mm_w) / 2));
    s_row1_y = s_lay.b_hh_y;
    s_row2_y = s_lay.b_mm_y;
    /* 12 h: "PM" in basso a destra (§3.2), base a 2 px dal bordo */
    s_rc_ampm = GRect(w - MARGIN_X - as.w, s_lay.full.size.h - 2 - as.h, as.w + 2, as.h + 2);
    return;
  }

  /* MODE_A_SPRITE e MODE_B_QV: riga unica con la strip A; in 12 h le celle delle cifre si
   * stringono di 2 px, i due punti tengono la cella piena (§3.1); un glifo più largo del passo
   * tiene il suo inchiostro come passo (prv_place_row). */
  const bool ampm = s_ampm_buf[0] != '\0';
  const int16_t cell = s_lay.a_cell - (ampm ? AMPM_SHRINK : 0);
  const int16_t colon = s_lay.a_colon;
  const int16_t total = prv_place_row(s_row1, &s_row1_n, DIGITS_SIZE_A, s_time_buf, MAX_GLYPHS, 0, cell, colon, 0);
  const int16_t block = total + (as.w ? AMPM_GAP + as.w : 0);
  int16_t x0 = (w - block) / 2;
  if (x0 < 0) {
    x0 = 0;
  }
  prv_shift_row(s_row1, s_row1_n, x0);
  s_row1_y = s_lay.a_y;
  const DigitStripMetrics *m = ui_digits_metrics(DIGITS_SIZE_A);
  const int16_t digits_bottom = s_lay.a_y + 1 + (m ? (int16_t)m->digit_h : 0);
  s_rc_ampm = GRect(x0 + total + AMPM_GAP, digits_bottom - as.h, as.w + 2, as.h + 2);
}

/* Riga info: [passi | icona BT] a sinistra, batteria al centro, data a destra.
 * Se non ci sta, la data si accorcia ("mer 26", poi "26"). */
static void prv_format_date(const struct tm *t, uint8_t level);
static struct tm s_last_tm;   /* copia dell'ultimo tick per riformattare la data */

static void prv_layout_info(void) {
  const GalSettings *st = settings_get();
  const int16_t w = s_lay.full.size.w;
  const int16_t usable = w - 2 * MARGIN_X;

  s_show_sync = s_sync_index > 0;                                /* S5a: "Foto k/n" al posto di passi/BT */
  s_show_bt_icon = !s_show_sync && (st->info_row & GAL_INFO_BT) && !s_connected;
  s_show_left = s_show_sync || s_show_bt_icon || (st->info_row & GAL_INFO_STEPS);
  s_show_batt = (st->info_row & GAL_INFO_BATTERY) != 0;
  s_show_date = (st->info_row & GAL_INFO_DATE) != 0;

  int16_t left_w = 0;
  if (s_show_sync) {
    left_w = prv_measure(s_sync_buf, s_lay.info_font, s_lay.info_h).w;
  } else if (s_show_bt_icon) {
    left_w = BT_ICON_W;
  } else if (s_show_left) {
    left_w = prv_measure(s_steps_buf, s_lay.info_font, s_lay.info_h).w;
  }
  int16_t batt_w = s_show_batt ? prv_measure(s_batt_buf, s_lay.info_font, s_lay.info_h).w : 0;
  if (s_show_batt && s_batt.is_charging) {
    batt_w += BOLT_W + BOLT_GAP;
  }

  int16_t date_w = 0;
  for (uint8_t level = 0; level < 3 && s_show_date; level++) {
    prv_format_date(&s_last_tm, level);
    date_w = prv_measure(s_date_buf, s_lay.info_font, s_lay.info_h).w;
    int16_t need = left_w + batt_w + date_w;
    int16_t items = (left_w ? 1 : 0) + (batt_w ? 1 : 0) + 1;
    if (need + (items - 1) * INFO_GAP <= usable) {
      break;
    }
  }

  const int16_t y = s_lay.info_y, h = s_lay.info_h;
  s_rc_left = GRect(MARGIN_X, y, left_w + 2, h);
  s_rc_date = GRect(w - MARGIN_X - date_w, y, date_w + 2, h);
  /* batteria: centrata nello spazio fra sinistra e destra */
  int16_t lo = s_show_left ? (int16_t)(MARGIN_X + left_w) : MARGIN_X;
  int16_t hi = s_show_date ? (int16_t)(w - MARGIN_X - date_w) : (int16_t)(w - MARGIN_X);
  int16_t bx = (int16_t)((lo + hi) / 2 - batt_w / 2);
  if (bx < lo + INFO_GAP && s_show_left) {
    bx = lo + INFO_GAP;
  }
  s_rc_batt = GRect(bx, y, batt_w + 2, h);
}

/* ---------------------------------------------------------------- dati */

static void prv_format_date(const struct tm *t, uint8_t level) {
  char wd[8] = "";
  char mon[8] = "";
  strftime(wd, sizeof(wd), "%a", t);
  strftime(mon, sizeof(mon), "%b", t);
  switch (level) {
    case 0:  snprintf(s_date_buf, sizeof(s_date_buf), "%s %d %s", wd, t->tm_mday, mon); break;
    case 1:  snprintf(s_date_buf, sizeof(s_date_buf), "%s %d", wd, t->tm_mday); break;
    default: snprintf(s_date_buf, sizeof(s_date_buf), "%d", t->tm_mday); break;
  }
}

static void prv_format_battery(void) {
  snprintf(s_batt_buf, sizeof(s_batt_buf), "%u%%", (unsigned)s_batt.charge_percent);
}

static void prv_read_steps(void) {
  s_steps_ok = false;
#if defined(PBL_HEALTH)
  const time_t now = time(NULL);
  const time_t start = time_start_of_today();
  HealthServiceAccessibilityMask mask =
      health_service_metric_accessible(HealthMetricStepCount, start, now);
  if (mask & HealthServiceAccessibilityMaskAvailable) {
    HealthValue steps = health_service_sum_today(HealthMetricStepCount);
    if (steps >= 0) {
      timefmt_grouped_uint(s_steps_buf, sizeof(s_steps_buf), (uint32_t)steps, s_thousands_sep);
      s_steps_ok = true;
    }
  }
#endif
  if (!s_steps_ok) {
    snprintf(s_steps_buf, sizeof(s_steps_buf), "-");
  }
}

/* ---------------------------------------------------------------- disegno */

static void prv_draw_bt_lines(GContext *ctx, GPoint o) {
  const int16_t x0 = o.x + 1, x1 = o.x + BT_ICON_W - 2;      /* 1 .. 8 */
  const int16_t y0 = o.y + 1, y1 = o.y + BT_ICON_H - 2;      /* 1 .. 14 */
  const int16_t cx = o.x + BT_ICON_W / 2;
  graphics_draw_line(ctx, GPoint(cx, y0), GPoint(cx, y1));
  graphics_draw_line(ctx, GPoint(cx, y0), GPoint(x1, y0 + 3));
  graphics_draw_line(ctx, GPoint(x1, y0 + 3), GPoint(x0, y1 - 3));
  graphics_draw_line(ctx, GPoint(x0, y0 + 3), GPoint(x1, y1 - 3));
  graphics_draw_line(ctx, GPoint(x1, y1 - 3), GPoint(cx, y1));
  graphics_draw_line(ctx, GPoint(x0, y1), GPoint(x1, y0));
}

static void prv_draw_bt_icon(GContext *ctx, GPoint o) {
  /* Runa Bluetooth + barra diagonale (disconnesso), TUTTA dentro il box BT_ICON_W×BT_ICON_H:
   * tratto 3 (solo valori dispari sono supportati: pebble.h) → raggio 1, quindi ogni estremo
   * sta a 1 px dal bordo del box. Con l'alone le stesse linee vengono prima tracciate con
   * tratto 5 (raggio 2) nel colore opposto: sbordano di 1 px dal box, che il chiamante riserva.
   * Il tutto deve stare in [0, band_h) (repaint mirato, D11). */
  if (s_halo) {
    graphics_context_set_stroke_color(ctx, s_bg);
    graphics_context_set_stroke_width(ctx, 5);
    prv_draw_bt_lines(ctx, o);
  }
  graphics_context_set_stroke_color(ctx, s_fg);
  graphics_context_set_stroke_width(ctx, 3);
  prv_draw_bt_lines(ctx, o);
  graphics_context_set_stroke_width(ctx, 1);
}

/* Testo di sistema nel colore corrente; con l'alone prima n copie sfalsate di 1 px nel colore
 * opposto (4 "a croce" per i font piccoli, 8 per LECO). */
static void prv_draw_text(GContext *ctx, const char *text, GFont font, GRect box, bool big) {
  if (s_halo) {
    const int n = big ? 8 : 4;
    graphics_context_set_text_color(ctx, s_bg);
    for (int i = 0; i < n; i++) {
      GRect o = box;
      o.origin.x += HALO_OFFS[i][0];
      o.origin.y += HALO_OFFS[i][1];
      graphics_draw_text(ctx, text, font, o, GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
    }
  }
  graphics_context_set_text_color(ctx, s_fg);
  graphics_draw_text(ctx, text, font, box, GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
}

/* Colore e alone effettivi da impostazioni + risultato di luma (chiamata fuori dal tick);
 * aggiorna anche le palette delle strip caricate (contorno = alone). */
static void prv_apply_text_style(void) {
  const GalSettings *st = settings_get();
  bool light;                                   /* testo chiaro (alone scuro) o viceversa */
  switch (st->text_color) {
    case GAL_TEXT_WHITE:  s_fg = GColorWhite; light = true;  break;
    case GAL_TEXT_BLACK:  s_fg = GColorBlack; light = false; break;
    case GAL_TEXT_YELLOW: s_fg = PBL_IF_COLOR_ELSE(GColorPastelYellow, GColorWhite); light = true;  break; /* 19:1 su nero (display.md §4.3) */
    case GAL_TEXT_OXFORD: s_fg = PBL_IF_COLOR_ELSE(GColorOxfordBlue, GColorBlack);   light = false; break; /* 16,6:1 su bianco */
    default:              light = s_luma.white; s_fg = light ? GColorWhite : GColorBlack; break;
  }
  s_bg = light ? GColorBlack : GColorWhite;
  switch (st->outline) {
    case GAL_OUTLINE_ALWAYS: s_halo = true;  break;
    case GAL_OUTLINE_NEVER:  s_halo = false; break;
    default:
      /* auto: % di pixel della fascia in conflitto con il colore EFFETTIVO (luma.h: bianco → Y > 77,
       * nero → Y < 25); su flint sempre (design §3.3); senza bitmap (luma non valida) mai. */
#if defined(PBL_COLOR)
      s_halo = s_luma.valid && (light ? s_luma.bad_white : s_luma.bad_black) > LUMA_HALO_PCT;
#else
      s_halo = s_luma.valid;
#endif
      break;
  }
  ui_digits_set_colors(DIGITS_SIZE_A, s_fg, s_bg, s_halo);
  ui_digits_set_colors(DIGITS_SIZE_B, s_fg, s_bg, s_halo);
}

static void prv_draw_row(GContext *ctx, uint8_t size, const GlyphPos *row, uint8_t n, int16_t y) {
  for (uint8_t i = 0; i < n; i++) {
    ui_digits_draw(ctx, size, row[i].glyph, row[i].x, y, row[i].adv);
  }
}

static void prv_update_proc(Layer *layer, GContext *ctx) {
  const GRect full = layer_get_bounds(layer);
  const GRect ub = layer_get_unobstructed_bounds(layer);
  const bool mode_a = prv_mode_is_a();
  const bool compact = mode_a && ub.size.h < s_lay.band_h;   /* ostruzione più alta della fascia A: solo ora */
#ifdef GALLERIA_DEBUG_TIMING
  time_t t0s = 0;
  uint16_t t0ms = 0;
  time_ms(&t0s, &t0ms);
  const bool full_draw = s_full_redraw || compact;   /* letto PRIMA di azzerare s_full_redraw */
#endif

  graphics_context_set_antialiased(ctx, false);
  if (s_full_redraw || compact) {
    ui_photo_draw_full(ctx, full);                 /* foto intera (nero se non caricata) */
    s_full_redraw = false;
#ifdef GALLERIA_DEBUG_PERSIST
    /* Marker disegnato SOLO nel redraw completo: se sopravvive al tick, il framebuffer
     * fuori dalla fascia persiste (prerequisito del repaint mirato, verificato in S1). */
    graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorLightGray, GColorWhite));
    graphics_fill_rect(ctx, GRect(4, full.size.h - 12, 40, 8), 0, GCornerNone);
#endif
  } else {
    ui_photo_draw_band(ctx, GRect(0, s_lay.band_y, full.size.w, s_lay.band_h));   /* solo la fascia dinamica */
  }

  int16_t dy = 0;
  if (compact) {
    const int16_t h = (s_lay.mode == MODE_A_LECO) ? s_lay.leco_h : ui_digits_height(DIGITS_SIZE_A);
    const int16_t y = (s_lay.mode == MODE_A_LECO) ? s_lay.leco_y : s_lay.a_y;
    dy = (int16_t)((ub.size.h - h) / 2 - y);
  }
  GRect rc_ampm = s_rc_ampm;
  rc_ampm.origin.y += dy;

  switch (s_lay.mode) {
    case MODE_A_LECO: {
      GRect rc_time = s_rc_time;
      rc_time.origin.y += dy;
      prv_draw_text(ctx, s_time_buf, s_lay.leco_font, rc_time, true);
      break;
    }
    case MODE_B_SPRITE:
      prv_draw_row(ctx, DIGITS_SIZE_B, s_row1, s_row1_n, s_row1_y);
      prv_draw_row(ctx, DIGITS_SIZE_B, s_row2, s_row2_n, s_row2_y);
      break;
    default:   /* MODE_A_SPRITE, MODE_B_QV */
      prv_draw_row(ctx, DIGITS_SIZE_A, s_row1, s_row1_n, (int16_t)(s_row1_y + dy));
      break;
  }
  if (s_ampm_buf[0]) {
    prv_draw_text(ctx, s_ampm_buf, s_lay.ampm_font, rc_ampm, false);
  }

  if (mode_a && !compact) {
    if (s_show_sync) {
      prv_draw_text(ctx, s_sync_buf, s_lay.info_font, s_rc_left, false);
    } else if (s_show_bt_icon) {
      const int16_t extra = s_halo ? 1 : 0;      /* l'alone sborda di 1 px dal box dell'icona */
      int16_t oy = s_rc_left.origin.y + (s_lay.info_h - BT_ICON_H) / 2;
      if (oy + BT_ICON_H + extra > s_lay.band_h) {
        oy = s_lay.band_h - BT_ICON_H - extra;   /* guardia: mai fuori dalla fascia dinamica */
      }
      prv_draw_bt_icon(ctx, GPoint(s_rc_left.origin.x, oy));
    } else if (s_show_left) {
      prv_draw_text(ctx, s_steps_buf, s_lay.info_font, s_rc_left, false);
    }
    if (s_show_batt) {
      GRect rc = s_rc_batt;
      if (s_batt.is_charging && s_bolt_path) {
        gpath_move_to(s_bolt_path, GPoint(rc.origin.x, rc.origin.y + (s_lay.info_h - BOLT_H) / 2));
        if (s_halo) {                              /* contorno 1 px nel colore opposto */
          graphics_context_set_stroke_color(ctx, s_bg);
          graphics_context_set_stroke_width(ctx, 3);
          gpath_draw_outline(ctx, s_bolt_path);
          graphics_context_set_stroke_width(ctx, 1);
        }
        graphics_context_set_fill_color(ctx, s_fg);
        gpath_draw_filled(ctx, s_bolt_path);
        rc.origin.x += BOLT_W + BOLT_GAP;
        rc.size.w -= BOLT_W + BOLT_GAP;
      }
      prv_draw_text(ctx, s_batt_buf, s_lay.info_font, rc, false);
    }
    if (s_show_date) {
      prv_draw_text(ctx, s_date_buf, s_lay.info_font, s_rc_date, false);
    }
  }

  if (!s_first_render_logged) {
    s_first_render_logged = true;
    APP_LOG(APP_LOG_LEVEL_INFO, "heap after first render: used=%u free=%u",
            (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
  }
#ifdef GALLERIA_DEBUG_TIMING
  APP_LOG(APP_LOG_LEVEL_INFO, "draw: mode=%u full=%d %d ms", (unsigned)s_lay.mode, (int)full_draw,
          (int)prv_elapsed_ms(t0s, t0ms));
#endif
}

/* ---------------------------------------------------------------- luma / stile */

/* Luma sulla fascia dinamica intera (D7), ritagliata all'altezza del bitmap (precondizione di
 * luma.h). Senza bitmap (alloc fallita) lo sfondo è nero per costruzione: il risultato equivale a
 * una fascia tutta nera, così i colori manuali scuri ricevono comunque l'alone bianco. */
static void prv_compute_luma(void) {
  uint16_t stride = 0;
  const uint8_t *data = ui_photo_data(&stride);
  const GSize sz = ui_photo_size();
  int16_t h = s_lay.luma_h;
  if (h > sz.h) {
    h = sz.h;
  }
  if (data && h > 0 && sz.w > 0) {
    const LumaRect band = { 0, 0, sz.w, h };
#if defined(PBL_COLOR)
    luma_compute_8bit(data, stride, band, &s_luma);
#else
    luma_compute_1bit(data, stride, band, &s_luma);
#endif
  } else {
    s_luma = (LumaResult) {
      .valid = true, .white = true, .halo = PBL_IF_BW_ELSE(true, false),
      .bad_pct = 0, .bad_white = 0, .bad_black = 100, .mean = 0,
    };
  }
}

/* Una riga per decisione di colore (produzione): m=modalità b=fascia y+h h=luma_h ph=foto caricata
 * w=testo bianco bad=% in conflitto (bianco/nero) mean=luma media fg=argb halo=alone. */
static void prv_log_style(const char *why) {
  APP_LOG(APP_LOG_LEVEL_INFO, "luma(%s): m=%u b=%d+%d h=%d ph=%d w=%d bad=%u(%u/%u) mean=%u fg=%02x halo=%d",
          why, (unsigned)s_lay.mode, (int)s_lay.band_y, (int)s_lay.band_h, (int)s_lay.luma_h,
          (int)ui_photo_is_loaded(), (int)s_luma.white, (unsigned)s_luma.bad_pct,
          (unsigned)s_luma.bad_white, (unsigned)s_luma.bad_black, (unsigned)s_luma.mean,
          (unsigned)s_fg.argb, (int)s_halo);
}

/* Allinea le strip (D16), ricalcola modalità e fascia; se la fascia cambia aggiorna sub-bitmap e
 * posizioni. Ritorna true se la fascia è cambiata. Unico punto (oltre a ui_time_init) che alloca
 * le strip: mai chiamato da update_proc. */
static bool prv_refresh_mode(void) {
  const int16_t old_band_y = s_lay.band_y, old_band_h = s_lay.band_h;
  const uint8_t old_mode = s_lay.mode;
  prv_load_strips();                   /* prima di scegliere la modalità: la A in B esiste solo sotto Quick View */
  prv_pick_mode();
  const bool band_changed = (s_lay.band_y != old_band_y) || (s_lay.band_h != old_band_h);
  if (band_changed) {
    ui_photo_set_band(s_lay.band_y, s_lay.band_h);
  }
  if (s_lay.mode != old_mode) {
    prv_apply_text_style();            /* una strip appena caricata ha ancora la palette del PNG */
    prv_layout_time();
    if (prv_mode_is_a()) {             /* la riga info torna visibile: dati e posizioni aggiornati */
      prv_read_steps();
      prv_layout_info();
    }
  }
  return band_changed;
}

/* ---------------------------------------------------------------- API */

void ui_time_init(Window *window) {
  s_root = window_get_root_layer(window);
  prv_compute_layout(s_root);
  s_unob_h = layer_get_unobstructed_bounds(s_root).size.h;

  const char *loc = i18n_get_system_locale();
  s_thousands_sep = (loc && loc[0] == 'e' && loc[1] == 'n') ? ',' : '.';

  s_batt = battery_state_service_peek();
  prv_format_battery();
  s_connected = connection_service_peek_pebble_app_connection();
#ifdef GALLERIA_DEBUG_BT_OFF
  s_connected = false;   /* l'emulatore non consegna l'evento di disconnessione: hook di test */
#endif

  prv_load_strips();                 /* strip sprite in heap (window_load; poi solo prv_refresh_mode) */
  prv_pick_mode();
  /* Una riga all'init: cs=content size, loc=locale, unob=altezza non ostruita, lay/font=impostazioni */
  APP_LOG(APP_LOG_LEVEL_INFO, "ui_time: cs=%d bt=%d loc=%s %dx%d unob=%d lay=%u font=%u mode=%u band=%d",
          (int)s_lay.content_size, (int)s_connected, loc ? loc : "?",
          (int)s_lay.full.size.w, (int)s_lay.full.size.h, (int)s_unob_h,
          (unsigned)settings_get()->layout, (unsigned)settings_get()->font,
          (unsigned)s_lay.mode, (int)s_lay.band_h);

  s_bolt_path = gpath_create(&s_bolt_info);
  s_layer = layer_create(s_lay.full);
  if (s_layer) {
    layer_set_update_proc(s_layer, prv_update_proc);
    layer_add_child(s_root, s_layer);
  }

  /* Fascia dinamica della foto (sub-bitmap, fuori da update_proc) e colore automatico del testo
   * sulla foto già caricata in init(). */
  ui_photo_set_band(s_lay.band_y, s_lay.band_h);
  luma_reset(&s_luma);
  s_fg = GColorWhite;
  s_bg = GColorBlack;
  s_halo = false;
  ui_time_photo_changed();
  s_full_redraw = true;
}

void ui_time_deinit(void) {
  ui_digits_unload_all();
  ui_photo_set_band(0, 0);           /* creata da ui_time_init: distrutta qui (simmetria) */
  if (s_layer) {
    layer_destroy(s_layer);
    s_layer = NULL;
  }
  if (s_bolt_path) {
    gpath_destroy(s_bolt_path);
    s_bolt_path = NULL;
  }
  s_root = NULL;
}

void ui_time_tick(const struct tm *t) {
  if (!s_layer || !t) {
    return;
  }
#ifdef GALLERIA_DEBUG_TIMING
  time_t t0s = 0;
  uint16_t t0ms = 0;
  time_ms(&t0s, &t0ms);              /* passi Health + layout + misure di testo (il render e' in "draw:") */
#endif
  s_last_tm = *t;
  const bool is24h = settings_is_24h();
  const bool lz = settings_leading_zero(is24h);
  timefmt_hhmm(s_time_buf, sizeof(s_time_buf), t->tm_hour, t->tm_min, is24h, lz);
  snprintf(s_ampm_buf, sizeof(s_ampm_buf), "%s", is24h ? "" : timefmt_ampm(t->tm_hour));

  /* In B la riga HH sta fuori dalla fascia dinamica: redraw completo quando cambiano le ore
   * (anche per salti di orario/DST, non solo al minuto 0). */
  if (s_lay.mode == MODE_B_SPRITE
      && (s_time_buf[0] != s_prev_hh[0] || s_time_buf[1] != s_prev_hh[1])) {
    s_full_redraw = true;
  }
  s_prev_hh[0] = s_time_buf[0];
  s_prev_hh[1] = s_time_buf[1];

  prv_layout_time();
  if (prv_mode_is_a()) {               /* la riga info esiste solo nel layout A (regola 12) */
    prv_read_steps();
    prv_layout_info();
  }
  layer_mark_dirty(s_layer);
#ifdef GALLERIA_DEBUG_TIMING
  APP_LOG(APP_LOG_LEVEL_INFO, "tick: %d ms", (int)prv_elapsed_ms(t0s, t0ms));
#endif
}

void ui_time_set_battery(BatteryChargeState state) {
  s_batt = state;
  prv_format_battery();
  if (s_layer && prv_mode_is_a()) {    /* in B la riga info non c'è: nessun ridisegno */
    prv_layout_info();
    layer_mark_dirty(s_layer);
  }
}

void ui_time_set_connected(bool connected) {
  if (connected == s_connected) {
    return;
  }
  s_connected = connected;
  LOGV("bt: connected=%d", (int)connected);   /* evento raro, ma visibile dall'icona: solo diagnostica */
  if (s_layer && prv_mode_is_a()) {
    prv_layout_info();
    layer_mark_dirty(s_layer);
  }
}

void ui_time_request_full_redraw(void) {
  s_full_redraw = true;
  if (s_layer) {
    layer_mark_dirty(s_layer);
  }
}

void ui_time_photo_changed(void) {
  luma_reset(&s_luma);                 /* foto nuova: decisione a freddo (come photo_prep --stats) */
  prv_compute_luma();
  prv_apply_text_style();
  prv_log_style("photo");
  ui_time_request_full_redraw();
}

void ui_time_band_changed(void) {
  prv_compute_luma();                  /* stessa foto, fascia diversa: isteresi attiva (D7) */
  prv_apply_text_style();
  prv_log_style("band");
  ui_time_request_full_redraw();
}

void ui_time_style_changed(void) {
  prv_apply_text_style();              /* solo impostazioni: nessun ricalcolo di luma */
  prv_log_style("style");
  ui_time_request_full_redraw();
}

void ui_time_unobstructed_changed(void) {
  if (!s_root || !s_layer) {
    return;
  }
  s_unob_h = layer_get_unobstructed_bounds(s_root).size.h;
  if (prv_refresh_mode()) {            /* in B carica la A all'inizio della Quick View e la scarica alla fine (D16) */
    ui_time_band_changed();            /* layout B ↔ riga singola: fascia e colore ricalcolati */
  } else {
    ui_time_request_full_redraw();
  }
  LOGH("qv");                          /* gate S7: 20 cicli on/off → gli "off" identici (nessuna perdita) */
}

void ui_time_layout_changed(void) {
  if (!s_layer) {
    return;
  }
  prv_refresh_mode();                  /* ricarica le strip (D16) e rifà modalità e fascia */
  prv_layout_time();
  ui_time_band_changed();
}

void ui_time_set_sync_progress(uint8_t index, uint8_t count) {
  if (index == s_sync_index && count == s_sync_count) {
    return;
  }
  s_sync_index = index;
  s_sync_count = count;
  if (index) {
    if (count) {
      snprintf(s_sync_buf, sizeof(s_sync_buf), "Foto %u/%u", (unsigned)index, (unsigned)count);
    } else {
      snprintf(s_sync_buf, sizeof(s_sync_buf), "Foto %u", (unsigned)index);
    }
  }
  if (s_layer && prv_mode_is_a()) {     /* in B la riga info non c'è: nessun ridisegno */
    prv_layout_info();
    layer_mark_dirty(s_layer);
  }
}

int16_t ui_time_band_height(void) {
  return s_lay.band_h;
}

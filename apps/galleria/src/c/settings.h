/* settings.h — impostazioni dell'app (docs/design/galleria.md §4.1, GalSettings 20 B).
 * S1: default in RAM; S4: lette da persist in settings_init e salvate con debounce da settings_apply
 * (S5a/S6: blob SETTINGS dal telefono); dallo schema 2 (S8-perf) vivono nel manifest (chiave 1). Header PURO (usabile dai test host). */
#ifndef GALLERIA_SETTINGS_H
#define GALLERIA_SETTINGS_H

#include <stdbool.h>
#include <stdint.h>

#define GAL_SETTINGS_SCHEMA 1

enum GalLayout      { GAL_LAYOUT_A = 0, GAL_LAYOUT_B = 1 };
/* S8-stile (D22): enum stabile — 3 = LECO (sistema, solo layout A) resta al suo posto, i font sprite nuovi seguono.
 * Indice della strip = gal_font_strip(): 0 Anton, 1 Bebas, 2 Barlow, 3 Francois One, 4 Staatliches (LECO nessuna strip). */
enum GalFont        { GAL_FONT_ANTON = 0, GAL_FONT_BEBAS = 1, GAL_FONT_BARLOW = 2, GAL_FONT_LECO = 3,
                      GAL_FONT_FRANCOIS = 4, GAL_FONT_STAATLICHES = 5, GAL_FONT_COUNT = 6 };
/* S8-stile (D21): stile delle cifre sprite. 0 = riempimento pieno (com'era); 1 = solo anello (la foto si vede dentro);
 * 2 = anello + ombra 3D nel colore opposto; 3 = pieno + ombra 3D. Con LECO l'orologio lo ignora. */
enum GalDigitStyle  { GAL_STYLE_FILL = 0, GAL_STYLE_OUTLINE = 1, GAL_STYLE_OUTLINE_3D = 2, GAL_STYLE_FILL_3D = 3 };
enum GalClockMode   { GAL_CLOCK_AUTO = 0, GAL_CLOCK_12H = 1, GAL_CLOCK_24H = 2 };
enum GalLeadingZero { GAL_LZ_AUTO = 0, GAL_LZ_ON = 1, GAL_LZ_OFF = 2 };
enum GalTextColor   { GAL_TEXT_AUTO = 0, GAL_TEXT_WHITE = 1, GAL_TEXT_BLACK = 2, GAL_TEXT_YELLOW = 3, GAL_TEXT_OXFORD = 4 };
enum GalOutline     { GAL_OUTLINE_AUTO = 0, GAL_OUTLINE_ALWAYS = 1, GAL_OUTLINE_NEVER = 2 };
enum GalOrder       { GAL_ORDER_SEQUENTIAL = 0, GAL_ORDER_RANDOM = 1 };
/* S10 (D31): lingua della config page E dell'orologio. 0 = automatica (pagina: lingua dell'orologio; orologio:
 * data da strftime del firmware con il language pack, separatore delle migliaia dal locale di sistema);
 * 1..4 = forzata (data da datefmt.c con le abbreviazioni dei pack e il formato della lingua, separatore per lingua). */
enum GalLang        { GAL_LANG_AUTO = 0, GAL_LANG_EN = 1, GAL_LANG_IT = 2, GAL_LANG_DE = 3, GAL_LANG_FR = 4 };
enum GalInfoRowBits { GAL_INFO_STEPS = 1 << 0, GAL_INFO_BATTERY = 1 << 1, GAL_INFO_DATE = 1 << 2, GAL_INFO_BT = 1 << 3 };

typedef struct __attribute__((packed)) {
  uint8_t  schema;        /* GAL_SETTINGS_SCHEMA */
  uint8_t  layout;        /* GalLayout */
  uint8_t  font;          /* GalFont */
  uint8_t  clock_mode;    /* GalClockMode */
  uint8_t  leading_zero;  /* GalLeadingZero */
  uint8_t  text_color;    /* GalTextColor */
  uint8_t  outline;       /* GalOutline */
  uint16_t interval_min;  /* 0 mai; 5, 15, 30, 60, 180, 1440 (giornaliera) */
  uint8_t  order;         /* GalOrder */
  uint8_t  shake_next;    /* 0/1 */
  uint8_t  info_row;      /* GalInfoRowBits */
  uint8_t  digit_style;   /* GalDigitStyle (S8-stile: era reserved[0], quindi 0 = pieno nei blob vecchi) */
  uint8_t  lang;          /* GalLang (S10, byte 13: era reserved[0], quindi 0 = auto nei blob vecchi; CRC dei default invariato) */
  uint8_t  reserved[4];   /* il design §4.1 diceva [4] ma contava 20 B: allineato a 20 B (S1); S8-stile: 6 → 5; S10: 5 → 4 */
  uint16_t crc16;         /* CRC-16/CCITT-FALSE dei 18 B precedenti (storage.c) */
} GalSettings;            /* 20 B */

/* Indice della strip sprite per un font (D22): 0..GAL_FONT_COUNT-2; -1 per LECO o valori fuori intervallo. */
static inline int8_t gal_font_strip(uint8_t font) {
  if (font == GAL_FONT_LECO || font >= GAL_FONT_COUNT) {
    return -1;
  }
  return (int8_t)(font < GAL_FONT_LECO ? font : font - 1);
}

/* Lo stile lascia il riempimento trasparente (1, 2)? */
static inline bool gal_style_transparent(uint8_t style) {
  return style == GAL_STYLE_OUTLINE || style == GAL_STYLE_OUTLINE_3D;
}
/* Lo stile ha l'ombra 3D (2, 3)? */
static inline bool gal_style_shadow(uint8_t style) {
  return style == GAL_STYLE_OUTLINE_3D || style == GAL_STYLE_FILL_3D;
}

/* S10 (D33): lingua dal locale di sistema (i18n_get_system_locale(): "it_IT", "en_US", …) per il prefisso
 * en/it/de/fr → GAL_LANG_EN..GAL_LANG_FR; qualunque altro prefisso, stringa corta o NULL → GAL_LANG_EN.
 * Pura (nessuna libreria): stesso mapping di langAuto nel PKJS. Non ritorna mai GAL_LANG_AUTO. */
static inline uint8_t gal_lang_from_locale(const char *loc) {
  if (loc && loc[0] != '\0' && loc[1] != '\0') {
    const char a = loc[0], b = loc[1];
    if (a == 'i' && b == 't') {
      return GAL_LANG_IT;
    }
    if (a == 'd' && b == 'e') {
      return GAL_LANG_DE;
    }
    if (a == 'f' && b == 'r') {
      return GAL_LANG_FR;
    }
  }
  return GAL_LANG_EN;
}

/* Default in RAM, poi persist (se valido), poi gli hook di debug GALLERIA_DEBUG_* (wscript). */
void settings_init(void);
/* Ripristina i default nella struct passata. */
void settings_set_defaults(GalSettings *s);
/* Impostazioni correnti (sola lettura per la UI). */
const GalSettings *settings_get(void);
/* Tutti i campi nei rispettivi intervalli (schema compreso). */
bool settings_validate(const GalSettings *s);
/* Applica impostazioni ricevute (S5a/S6): valida, copia, programma la scrittura in persist
 * (debounce). false se non valide (nessun effetto). NON notifica la UI: il chiamante invoca
 * ui_time_layout_changed()/ui_time_style_changed()/model_settings_changed() secondo i campi. */
bool settings_apply(const GalSettings *s);
/* Formato 24 h effettivo (clock_mode AUTO → clock_is_24h_style()). */
bool settings_is_24h(void);
/* Zero iniziale effettivo per il formato dato. */
bool settings_leading_zero(bool is24h);

#endif /* GALLERIA_SETTINGS_H */

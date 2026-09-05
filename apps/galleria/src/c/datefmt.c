/* datefmt.c — vedi datefmt.h. Modulo PURO (S10, D34): nessun pebble.h, niente float, tipi a larghezza fissa. */
#include <stdio.h>
#include "datefmt.h"

/* Abbreviazioni IDENTICHE ai language pack di PebbleOS (tintin.po it/de/fr; spec S10 §0): la data con la lingua
 * forzata coincide con quella che strftime produce sull'orologio con il pack corrispondente (e con notifiche e
 * calendario). Indice 0..3 = lang - 1 (en, it, de, fr). UTF-8 dentro il limite dei 7 B: "Mär" 4, "Févr." 6,
 * "Juill." 6, "Août" 5, "Déc." 5 (i font Gothic di sistema hanno i glifi U+00A0–017F). 448 B in flash. */
static const char WDAY[4][7][4] = {
  { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" },
  { "Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab" },
  { "So",  "Mo",  "Di",  "Mi",  "Do",  "Fr",  "Sa"  },
  { "Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam" },
};
static const char MON[4][12][7] = {
  { "Jan",   "Feb",   "Mar",  "Apr",  "May", "Jun",  "Jul",    "Aug",  "Sep",   "Oct",  "Nov",  "Dec"  },
  { "Gen",   "Feb",   "Mar",  "Apr",  "Mag", "Giu",  "Lug",    "Ago",  "Set",   "Ott",  "Nov",  "Dic"  },
  { "Jan",   "Feb",   "Mär",  "Apr",  "Mai", "Jun",  "Jul",    "Aug",  "Sep",   "Okt",  "Nov",  "Dez"  },
  { "Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juill.", "Août", "Sept.", "Oct.", "Nov.", "Déc." },
};

void datefmt_format(char *out, size_t cap, uint8_t lang, uint8_t wday, uint8_t mday, uint8_t mon, uint8_t level) {
  if (!out || cap == 0) {
    return;
  }
  const uint8_t li = (lang >= DATEFMT_LANG_EN && lang <= DATEFMT_LANG_FR) ? (uint8_t)(lang - 1) : 0;
  const char *wd = WDAY[li][wday > 6 ? 6 : wday];
  const char *mo = MON[li][mon > 11 ? 11 : mon];
  const unsigned d = mday;
  if (level >= 2) {
    snprintf(out, cap, "%u", d);
  } else if (li == DATEFMT_LANG_DE - 1) {          /* convenzione del %c del pack tedesco: "Sa, 5. Sep" */
    if (level == 1) {
      snprintf(out, cap, "%s, %u.", wd, d);
    } else {
      snprintf(out, cap, "%s, %u. %s", wd, d, mo);
    }
  } else if (level == 1) {
    snprintf(out, cap, "%s %u", wd, d);
  } else {
    snprintf(out, cap, "%s %u %s", wd, d, mo);
  }
}

char datefmt_thousands_sep(uint8_t lang) {
  switch (lang) {
    case DATEFMT_LANG_IT:
    case DATEFMT_LANG_DE: return '.';
    case DATEFMT_LANG_FR: return ' ';
    default:              return ',';               /* EN e valori fuori intervallo (auto risolto dal chiamante) */
  }
}

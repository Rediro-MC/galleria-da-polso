/* datefmt.c — vedi datefmt.h. Modulo PURO (S10, D34; S11, D40/D41): nessun pebble.h, niente float, tipi a larghezza fissa. */
#include <stdio.h>
#include "datefmt.h"

/* Abbreviazioni IDENTICHE ai language pack di PebbleOS (tintin.po it/de/fr, es_ES.po, pt_PT.po; spec S10 §0 e
 * S11 D40): le ABBREVIAZIONI coincidono con quelle che strftime produce sull'orologio con il pack corrispondente
 * (notifiche e calendario); il FORMATO segue il %c del pack (de «Sa, 5. Sep», pt «Sáb 5 de Set»), mentre in auto
 * l'app compone «%a %d %b» (con il pack pt in auto si legge «Sáb 5 Set»; D40). Indice 0..5 = lang - 1 (en, it, de, fr, es, pt: ordine D39,
 * es/pt SEMPRE in coda). Letterali UTF-8 DIRETTI, mai "\xC3\xA1b" (la "b" finirebbe dentro l'escape): "Sáb" e'
 * 4 B + NUL e non sta in 4 → celle dei giorni a 5; mesi entro 7 B: "Mär" 4, "Févr." 6, "Juill." 6, "Août" 5,
 * "Déc." 5, "mayo" 5 (i font Gothic di sistema hanno i glifi U+00A0–017F). Spagnolo tutto minuscolo e «mayo»
 * per esteso: sono le forme del pack, verbatim (unica forma del pack per «May»). Dimensioni: 6×7×5 + 6×12×7 =
 * 210 + 504 = 714 B in flash (448 B con 4 lingue in S10). */
static const char WDAY[6][7][5] = {
  { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" },
  { "Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab" },
  { "So",  "Mo",  "Di",  "Mi",  "Do",  "Fr",  "Sa"  },
  { "Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam" },
  { "do",  "lu",  "ma",  "mi",  "ju",  "vi",  "sá"  },
  { "Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb" },
};
static const char MON[6][12][7] = {
  { "Jan",   "Feb",   "Mar",  "Apr",  "May",  "Jun",  "Jul",    "Aug",  "Sep",   "Oct",  "Nov",  "Dec"  },
  { "Gen",   "Feb",   "Mar",  "Apr",  "Mag",  "Giu",  "Lug",    "Ago",  "Set",   "Ott",  "Nov",  "Dic"  },
  { "Jan",   "Feb",   "Mär",  "Apr",  "Mai",  "Jun",  "Jul",    "Aug",  "Sep",   "Okt",  "Nov",  "Dez"  },
  { "Janv.", "Févr.", "Mars", "Avr.", "Mai",  "Juin", "Juill.", "Août", "Sept.", "Oct.", "Nov.", "Déc." },
  { "ene",   "feb",   "mar",  "abr",  "mayo", "jun",  "jul",    "ago",  "sep",   "oct",  "nov",  "dic"  },
  { "Jan",   "Fev",   "Mar",  "Abr",  "Mai",  "Jun",  "Jul",    "Ago",  "Set",   "Out",  "Nov",  "Dez"  },
};

/* Formati per lingua (D34, D40). Spagnolo come it/fr (giorno-mese, "sá 5 sep"): il %c del pack spagnolo e' il
 * msgid inglese NON tradotto ("%a %b %e"), non una convenzione spagnola, e "sá 5 sep" coincide con cio' che
 * l'orologio compone gia' in automatico con il pack ("%a %d %b" in ui_time.c). Portoghese con il %c del pack
 * ("%a %e de %b"): "Sáb 5 de Set" al livello 0, "Sáb 5" al livello 1 (il "de" cade con il mese). */
void datefmt_format(char *out, size_t cap, uint8_t lang, uint8_t wday, uint8_t mday, uint8_t mon, uint8_t level) {
  if (!out || cap == 0) {
    return;
  }
  const uint8_t li = (lang >= DATEFMT_LANG_EN && lang <= DATEFMT_LANG_LAST) ? (uint8_t)(lang - 1) : 0;
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
  } else if (li == DATEFMT_LANG_PT - 1) {          /* convenzione del %c del pack portoghese: "Sáb 5 de Set" */
    snprintf(out, cap, "%s %u de %s", wd, d, mo);
  } else {
    snprintf(out, cap, "%s %u %s", wd, d, mo);
  }
}

char datefmt_thousands_sep(uint8_t lang) {
  switch (lang) {
    case DATEFMT_LANG_IT:
    case DATEFMT_LANG_DE:
    case DATEFMT_LANG_ES:                            /* D41: nessuna eccezione, come i pack e l'automatico */
    case DATEFMT_LANG_PT: return '.';
    case DATEFMT_LANG_FR: return ' ';
    default:              return ',';               /* EN e valori fuori intervallo (auto risolto dal chiamante) */
  }
}

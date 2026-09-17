#!/usr/bin/env python3
r"""gen_preview_fixture.py — v1 (S12, D48): la fixture dell'anteprima della config page.

Genera `test/fixture_preview.js` (`module.exports = {...}`), cioe' il RIFERIMENTO con cui
`test/test_preview.js` confronta `src/pkjs/config/preview.js` (il porting JS di ui_time.c,
ui_digits.c e luma.c). Tutti i numeri vengono dai tool, non sono scritti a mano:

  posizioni    tools/gen_digits.py importato come modulo (grid_steps / place_row_fit / draw_x /
               cdiv, cioe' le stesse funzioni che controllano le righe delle strip) sulle metriche
               rilette da src/pkjs/digit_masks.js (D45), piu' le costanti di layout di ui_time.c
               (prv_compute_layout) trascritte qui sotto in LAYOUT;
  CRC dei glifi CRC32 (zlib) della mappa di indici 0..3 ricostruita dalla SOLA maschera con la
               regola di D45/D20 (gen_digits.glyph_index_map): se preview.js sbaglia la
               dilatazione dell'anello o lo scorrimento dell'ombra, il CRC cambia;
  luma         tools/photo_prep.py importato come modulo (stats_emery / stats_flint, le stesse
               funzioni di --stats) sulle due foto demo di resources/photos/, sulla fascia del
               layout A e su quella del layout B: gli stessi numeri della tabella «Colore del testo
               previsto» di resources/photos/README.md.

Dipendenze: solo stdlib (base64, json, re, zlib) + i due tool. NIENTE freetype e NIENTE Pillow:
gira con il python3 di sistema (`make -C test pagecheck`). Le maschere NON vengono ricalcolate dai
TTF: si rileggono da digit_masks.js, che a sua volta e' verificato da `gen_digits.py --check`
(interprete del pebble-tool) e, qui, incrociato con src/c/digit_metrics.h.

Ancoraggio ai SORGENTI C (revisione S12, rv/rk): prima di generare, `check_c_sources()` rilegge con
regex src/c/luma.h (LUMA_Y_WHITE_BAD / BLACK_BAD / CROSSOVER / HYSTERESIS / HALO_PCT), src/c/luma.c
(i 64 valori di LUMA_SUN[64]), src/c/ui_time.c (le costanti di prv_compute_layout: ramo wide con
content size normale e ramo flint) e src/c/digit_metrics.h (strip_h / digit_h / ring / shadow /
cell_w e le 11 ink[].w di ogni font x taglia x piattaforma) e li confronta con LAYOUT, con le
costanti di photo_prep.py e con digit_masks.js: se differiscono il tool esce con 1 e un messaggio
che dice quale valore. Cosi' una modifica del C non passa inosservata a test_preview.js (che
altrimenti confronterebbe due trascrizioni JS/Python concordi fra loro) e un digit_masks.js
stantio viene colto anche quando `gen_digits.py --check` e' saltato per mancanza dell'interprete.

Uso:
    python3 apps/galleria/test/gen_preview_fixture.py            # (ri)genera il .js
    python3 apps/galleria/test/gen_preview_fixture.py --check    # verifica, exit 1 se non aggiornata
    ... --c-dir DIR    # sorgenti C da confrontare (default src/c): per provare il controllo su una copia alterata

Riproducibile: nessuna data, nessun percorso assoluto nel file generato -> `--check` confronta
byte per byte. Tempo: ~1 s.
"""

import argparse
import os
import re
import sys
import time
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))                  # apps/galleria/test
APP_DIR = os.path.dirname(HERE)                                    # apps/galleria
REPO_DIR = os.path.dirname(os.path.dirname(APP_DIR))               # radice del repo
TOOLS_DIR = os.path.join(REPO_DIR, 'tools')
OUT_JS = os.path.join(HERE, 'fixture_preview.js')
MASKS_JS = os.path.join(APP_DIR, 'src', 'pkjs', 'digit_masks.js')
PHOTOS_DIR = os.path.join(APP_DIR, 'resources', 'photos')
C_DIR = os.path.join(APP_DIR, 'src', 'c')                          # luma.h, luma.c, ui_time.c, digit_metrics.h

sys.path.insert(0, TOOLS_DIR)
import gen_digits as gd                                            # noqa: E402
import photo_prep as pp                                            # noqa: E402

FIXTURE_VERSION = 'v1'
PREVIEW_TIME = '12:34'          # ora campione dell'anteprima (D45: state.preview_time)
DEMOS = ('demo_1', 'demo_2')

# Costanti di ui_time.c:prv_compute_layout (content size normale: nessun ExtraLarge nell'anteprima,
# D46) e larghezza/altezza dello schermo. La fascia del colore automatico e' quella della watchface:
# layout A = cifre + riga info (info_y + info_h + 2), layout B = schermo intero.
LAYOUT = {
    'emery': {'fmt': 'raw6', 'w': 200, 'h': 228,
              'a_fill_y': 9, 'a_cell': 40, 'a_colon': 16,
              'b_hh_fill_y': 13, 'b_mm_fill_y': 121, 'b_cell': 64, 'b_gap': 8,
              'info_y': 82, 'info_h': 22},
    'flint': {'fmt': 'raw1', 'w': 144, 'h': 168,
              'a_fill_y': 7, 'a_cell': 28, 'a_colon': 12,
              'b_hh_fill_y': 13, 'b_mm_fill_y': 93, 'b_cell': 48, 'b_gap': 8,
              'info_y': 56, 'info_h': 18},
}

# Indice della strip (digit_masks.js / DIGITS_METRICS) -> valore dell'impostazione `font`
# (settings.h: 0 Anton, 1 Bebas, 2 Barlow, 3 LECO, 4 Francois One, 5 Staatliches).
FONT_SETTING = {0: 0, 1: 1, 2: 2, 3: 4, 4: 5}

# luma.h: punti % di vantaggio per cambiare colore. L'anteprima NON la usa (decisione a freddo,
# D46) ma la pinna: se il C la cambia, chi tocca la fixture deve chiedersi se l'anteprima resta onesta.
LUMA_HYSTERESIS = 10

# Le 9 costanti di prv_compute_layout lette da ui_time.c (le altre di LAYOUT — w, h, fmt — vengono
# dallo schermo, non dal C).
C_LAYOUT_KEYS = ('a_fill_y', 'a_cell', 'a_colon', 'b_hh_fill_y', 'b_mm_fill_y', 'b_cell', 'b_gap',
                 'info_y', 'info_h')


# ------------------------------------------------------- sorgenti C (rv/rk) ---

def _read_c(c_dir, name):
    path = os.path.join(c_dir, name)
    if not os.path.isfile(path):
        raise gd.GenError('manca %s (sorgente C da confrontare con la fixture)' % path)
    with open(path, 'r', encoding='utf-8') as fh:
        return fh.read()


def _c_luma_h(text, errors):
    """#define LUMA_* di luma.h contro le costanti di photo_prep.py (le stesse pinnate nella fixture)."""
    want = (('LUMA_Y_WHITE_BAD', pp.LUMA_Y_WHITE_BAD), ('LUMA_Y_BLACK_BAD', pp.LUMA_Y_BLACK_BAD),
            ('LUMA_Y_CROSSOVER', pp.LUMA_Y_CROSSOVER), ('LUMA_HYSTERESIS', LUMA_HYSTERESIS),
            ('LUMA_HALO_PCT', pp.LUMA_HALO_PCT))
    for name, exp in want:
        found = re.findall(r'^\s*#define\s+%s\s+(\d+)\b' % name, text, re.M)
        if len(found) != 1:
            errors.append('luma.h: #define %s trovato %d volte (attesa 1)' % (name, len(found)))
        elif int(found[0]) != exp:
            errors.append('luma.h: %s = %s nel C, %d in photo_prep.py/fixture' % (name, found[0], exp))
    return len(want)


def _c_luma_sun(text, errors):
    """LUMA_SUN[64] = { ... } di luma.c contro photo_prep.LUM_SUN, valore per valore."""
    m = re.search(r'\bLUMA_SUN\s*\[\s*64\s*\]\s*=\s*\{([^}]*)\}', text)
    if not m:
        errors.append('luma.c: tabella "LUMA_SUN[64] = { ... }" non trovata')
        return 0
    vals = [int(v) for v in re.findall(r'\d+', m.group(1))]
    exp = list(pp.LUM_SUN)
    if len(vals) != 64:
        errors.append('luma.c: LUMA_SUN ha %d valori invece di 64' % len(vals))
        return 64
    for i in range(64):
        if vals[i] != exp[i]:
            errors.append('luma.c: LUMA_SUN[%d] = %d nel C, %d in photo_prep.py' % (i, vals[i], exp[i]))
    return 64


def _c_layout(text, errors):
    """Le costanti di prv_compute_layout (ui_time.c) contro LAYOUT: ramo wide (emery) con content
    size normale e ramo flint. Forma attesa del C: `if (wide) { ... if (ExtraLarge) { ... } else
    { info normale } a_/b_ ... } else { flint }` -> spezzando il corpo su "} else {" il pezzo 1 e' il
    ramo wide normale, il pezzo 2 il ramo flint."""
    i = text.find('static void prv_compute_layout(')
    if i < 0:
        errors.append('ui_time.c: prv_compute_layout non trovata')
        return 0
    j = text.find('\n}\n', i)
    body = text[i:j] if j > 0 else text[i:]
    parts = body.split('} else {')
    if len(parts) != 3 or 'if (wide) {' not in parts[0] or 'PreferredContentSizeExtraLarge' not in parts[0]:
        errors.append('ui_time.c: prv_compute_layout ha una forma inattesa (attesi "if (wide) {", '
                      'il ramo ExtraLarge e due "} else {": %d trovati)' % (len(parts) - 1))
        return 0
    n = 0
    for plat, region in (('emery', parts[1]), ('flint', parts[2])):
        for key in C_LAYOUT_KEYS:
            found = re.findall(r'\bs_lay\.%s\s*=\s*(\d+)\s*;' % key, region)
            n += 1
            if len(found) != 1:
                errors.append('ui_time.c: s_lay.%s (%s) assegnata %d volte nel ramo (attesa 1)'
                              % (key, plat, len(found)))
            elif int(found[0]) != LAYOUT[plat][key]:
                errors.append('ui_time.c: %s.%s = %s nel C, %d in LAYOUT della fixture'
                              % (plat, key, found[0], LAYOUT[plat][key]))
    return n


# una voce di DIGITS_METRICS: commento "A — anton_a~color.png, ...", poi strip_w, strip_h, cell_w,
# digit_h, ring, shadow, px e le 11 coppie { x, w } (l'ordine dei campi e' quello della struct)
_METRICS_ENTRY = re.compile(
    r'/\*\s*[AB]\s+\S+\s+([a-z]+)_([ab])~(color|bw)\.png.*?\*/\s*'
    r'(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'
    r'\{((?:\s*\{\s*\d+\s*,\s*\d+\s*\}\s*,?)+)\s*\}', re.S)


def _c_metrics(text, masks, errors):
    """digit_metrics.h contro digit_masks.js: strip_h / digit_h / ring / shadow / cell_w e le 11
    ink[].w di ogni (piattaforma, font, taglia). Un digit_masks.js rimasto indietro rispetto alle
    strip si vede anche senza l'interprete del pebble-tool (rk)."""
    glyphs = re.search(r'^#define\s+DIGITS_GLYPHS\s+(\d+)', text, re.M)
    fonts = re.search(r'^#define\s+DIGITS_FONT_COUNT\s+(\d+)', text, re.M)
    if not glyphs or int(glyphs.group(1)) != len(gd.GLYPHS):
        errors.append('digit_metrics.h: DIGITS_GLYPHS %s, attesi %d' % (glyphs and glyphs.group(1), len(gd.GLYPHS)))
    if not fonts or int(fonts.group(1)) != len(gd.FONTS):
        errors.append('digit_metrics.h: DIGITS_FONT_COUNT %s, attesi %d' % (fonts and fonts.group(1), len(gd.FONTS)))
    entries = _METRICS_ENTRY.findall(text)
    expected = len(gd.FONTS) * 2 * 2
    if len(entries) != expected:
        errors.append('digit_metrics.h: %d voci di DIGITS_METRICS riconosciute, attese %d'
                      % (len(entries), expected))
    seen = set()
    n = 0
    for (font, size, tag, strip_w, strip_h, cell_w, digit_h, ring, shadow, px, ink) in entries:
        plat = 'emery' if tag == 'color' else 'flint'
        where = '%s %s %s' % (plat, font, size.upper())
        seen.add((plat, font, size))
        entry = masks.get(plat, {}).get(font, {}).get(size)
        if not entry:
            errors.append('digit_masks.js: manca la voce %s presente in digit_metrics.h' % where)
            continue
        for key, val in (('strip_h', strip_h), ('digit_h', digit_h), ('ring', ring), ('shadow', shadow), ('cell_w', cell_w)):
            n += 1
            if int(entry.get(key, -1)) != int(val):
                errors.append('%s: %s = %s in digit_metrics.h, %s in digit_masks.js' % (where, key, val, entry.get(key)))
        pairs = re.findall(r'\{\s*(\d+)\s*,\s*(\d+)\s*\}', ink)
        if len(pairs) != len(gd.GLYPHS):
            errors.append('%s: %d coppie ink[] in digit_metrics.h, attese %d' % (where, len(pairs), len(gd.GLYPHS)))
            continue
        for k, ch in enumerate(gd.GLYPHS):
            n += 1
            w_h = int(pairs[k][1])
            g = entry.get('glyphs', {}).get(ch)
            w_m = int(g['w']) if g else 0
            if w_h != w_m:
                errors.append("%s: ink['%s'].w = %d in digit_metrics.h, %d in digit_masks.js"
                              % (where, ch, w_h, w_m))
    for plat in ('emery', 'flint'):
        for font in masks.get(plat, {}):
            for size in masks[plat][font]:
                if (plat, font, size) not in seen:
                    errors.append('digit_masks.js: voce %s %s %s assente in digit_metrics.h' % (plat, font, size.upper()))
    return n


def check_c_sources(masks, c_dir=None):
    """Confronta i sorgenti C con LAYOUT / photo_prep / digit_masks.js; GenError con TUTTE le
    differenze se ce ne sono. Ritorna il numero di valori confrontati (per il messaggio di esito)."""
    c_dir = c_dir or C_DIR
    errors = []
    n = _c_luma_h(_read_c(c_dir, 'luma.h'), errors)
    n += _c_luma_sun(_read_c(c_dir, 'luma.c'), errors)
    n += _c_layout(_read_c(c_dir, 'ui_time.c'), errors)
    n += _c_metrics(_read_c(c_dir, 'digit_metrics.h'), masks, errors)
    if errors:
        raise gd.GenError('i sorgenti C in %s NON coincidono con la fixture (%d differenze):\n  %s\n'
                          '  -> se il C e\' cambiato di proposito, aggiornare LAYOUT/photo_prep.py, '
                          'src/pkjs/config/preview.js e rigenerare digit_masks.js e la fixture'
                          % (c_dir, len(errors), '\n  '.join(errors)))
    return n


# ------------------------------------------------------------------- calcolo ---

def band_h(plat, layout):
    """Altezza della fascia su cui si decide il colore del testo (D46)."""
    lay = LAYOUT[plat]
    return lay['info_y'] + lay['info_h'] + 2 if layout == 'A' else lay['h']


def glyph_crc(entry, ch, key, cache):
    """CRC32 (zlib, senza segno) della mappa di indici 0..3 del glifo, w byte per riga."""
    g = entry['glyphs'][ch]
    if key not in cache:
        bits = gd.b64url_decode(g['bits'])
        idx = gd.glyph_index_map(bits, g['w'], entry['strip_h'], entry['ring'], entry['shadow'])
        cache[key] = (zlib.crc32(bytes(idx)) & 0xFFFFFFFF, idx)
    return cache[key]


def row_case(st, entry, key, text, x0_rows, cell, colon, gap, screen_w, y, clamp, cache):
    """Una riga di glifi: place_row_fit + centratura come ui_time.c, poi le posizioni del blit."""
    placed, total, rg = gd.place_row_fit(st, text, cell, colon, gap, 0, screen_w)
    x0 = gd.cdiv(screen_w - total, 2)
    if clamp and x0 < 0:                       # ui_time.c: in A x0 non scende sotto 0 (in B no)
        x0 = 0
    glyphs = []
    for (k, x, adv) in placed:
        ch = gd.GLYPHS[k]
        crc, idx = glyph_crc(entry, ch, key + (ch,), cache)
        glyphs.append({'ch': ch, 'g': k, 'w': entry['glyphs'][ch]['w'],
                       'x': x0 + x, 'adv': adv, 'gx': x0 + gd.draw_x(st, k, x, adv),
                       'crc': crc,
                       'fill': sum(1 for v in idx if v == gd.FILL),
                       'ring': sum(1 for v in idx if v == gd.RING),
                       'shadow': sum(1 for v in idx if v == gd.SHADOW)})
    x0_rows.append({'y': y, 'total': total, 'x0': x0, 'ring_gap': rg, 'glyphs': glyphs})


def build_cases(masks):
    """20 casi: piattaforma x font x layout (A = riga unica taglia A, B = HH sopra MM, taglia B)."""
    cases = []
    cache = {}
    hh, mm = PREVIEW_TIME.split(':')
    for plat in ('emery', 'flint'):
        lay = LAYOUT[plat]
        for strip, font in enumerate(f['key'] for f in gd.FONTS):
            for layout in ('A', 'B'):
                size = 'a' if layout == 'A' else 'b'
                entry = masks[plat][font][size]
                st = gd.strip_from_masks(entry, size, 'color' if plat == 'emery' else 'bw')
                rows = []
                key = (plat, font, size)
                if layout == 'A':
                    row_case(st, entry, key, PREVIEW_TIME, rows, lay['a_cell'], lay['a_colon'], 0,
                             lay['w'], lay['a_fill_y'] - entry['ring'], True, cache)
                else:
                    row_case(st, entry, key, hh, rows, lay['b_cell'], lay['b_cell'], lay['b_gap'],
                             lay['w'], lay['b_hh_fill_y'] - entry['ring'], False, cache)
                    row_case(st, entry, key, mm, rows, lay['b_cell'], lay['b_cell'], lay['b_gap'],
                             lay['w'], lay['b_mm_fill_y'] - entry['ring'], False, cache)
                cases.append({
                    'platform': plat, 'fmt': lay['fmt'], 'font': font, 'strip': strip,
                    'setting': FONT_SETTING[strip], 'layout': layout, 'size': size,
                    'mode': 'A_SPRITE' if layout == 'A' else 'B_SPRITE',
                    'screen_w': lay['w'], 'screen_h': lay['h'],
                    'cell': lay['a_cell'] if layout == 'A' else lay['b_cell'],
                    'colon': lay['a_colon'] if layout == 'A' else lay['b_cell'],
                    'gap': 0 if layout == 'A' else lay['b_gap'],
                    'band_h': band_h(plat, layout),
                    'strip_h': entry['strip_h'], 'digit_h': entry['digit_h'],
                    'ring': entry['ring'], 'shadow': entry['shadow'], 'cell_w': entry['cell_w'],
                    'rows': rows})
    return cases


def unpack1(data, w, h):
    """raw1 -> lista di 0/1 per pixel (MSB-first: photo_codec.h; inverso di photo_prep.pack1)."""
    stride = (w + 7) // 8
    out = bytearray(w * h)
    for y in range(h):
        base = y * stride
        row = y * w
        for x in range(w):
            out[row + x] = 1 if data[base + (x >> 3)] & (0x80 >> (x & 7)) else 0
    return out


def build_photos():
    """Decisioni luma delle due demo su fascia A e B, con le funzioni di photo_prep --stats."""
    out = []
    for name in DEMOS:
        raw6 = open(os.path.join(PHOTOS_DIR, name + '.raw6'), 'rb').read()
        raw1 = open(os.path.join(PHOTOS_DIR, name + '.raw1'), 'rb').read()
        idx = pp.unpack6(raw6, pp.EMERY_W * pp.EMERY_H)
        bits = unpack1(raw1, pp.FLINT_W, pp.FLINT_H)
        for plat, data, raw in (('emery', idx, raw6), ('flint', bits, raw1)):
            bands = []
            for layout in ('A', 'B'):
                h = band_h(plat, layout)
                s = (pp.stats_emery(data, pp.EMERY_W, h) if plat == 'emery'
                     else pp.stats_flint(data, pp.FLINT_W, h))
                bands.append({'layout': layout, 'h': h, 'samples': s['samples'],
                              'bad_white': s['bad_white'], 'bad_black': s['bad_black'],
                              'mean': s['mean'], 'white': s['white'], 'bad_pct': s['bad_pct'],
                              'halo': s['halo']})
            out.append({'name': name, 'platform': plat, 'fmt': LAYOUT[plat]['fmt'],
                        'file': '%s.%s' % (name, LAYOUT[plat]['fmt']), 'bytes': len(raw),
                        'crc': zlib.crc32(raw) & 0xFFFFFFFF,
                        'w': pp.EMERY_W if plat == 'emery' else pp.FLINT_W,
                        'h': pp.EMERY_H if plat == 'emery' else pp.FLINT_H,
                        'bands': bands})
    return out


# ----------------------------------------------------------------- rendering ---

HEADER = """\
/* fixture_preview.js - FIXTURE GENERATA da test/gen_preview_fixture.py %s: non modificare a mano.
 * Riferimento di src/pkjs/config/preview.js (S12/D48: anteprima "onesta" della config page) per
 * test/test_preview.js. Rigenerare con:
 *   python3 apps/galleria/test/gen_preview_fixture.py     (--check verifica che sia aggiornata)
 * Nessuna data: due esecuzioni devono dare lo stesso file byte per byte.
 *
 * cases[]  un caso per piattaforma x font x layout (5 font x 2 layout x 2 piattaforme = 20), con
 *          l'ora campione '%s' posizionata come ui_time.c (prv_grid_steps / prv_place_row_fit /
 *          prv_layout_time, funzioni di tools/gen_digits.py) sulle metriche di
 *          src/pkjs/digit_masks.js. Campi:
 *            platform fmt font strip setting layout size mode  - identificazione (setting =
 *                     valore dell'impostazione `font` di settings.h, strip = indice in digit_masks)
 *            screen_w screen_h cell colon gap band_h          - costanti del layout (band_h =
 *                     altezza della fascia del colore automatico: A = info_y + info_h + 2, B = tutto)
 *            strip_h digit_h ring shadow cell_w               - metriche della taglia
 *            rows[]   una riga in A ('%s'), due in B (HH sopra MM):
 *              y        riga 0 della strip sullo schermo (= fill_y - ring)
 *              total    larghezza della riga secondo la griglia scelta
 *              x0       origine del blocco centrato ((w - total) / 2 troncato verso lo zero; in A
 *                       mai < 0, in B nessun clamp, come ui_time.c)
 *              ring_gap spazio fra gli anelli scelto da prv_place_row_fit (null = riserva)
 *              glyphs[] { ch, g (indice 0..10), w (colonne d'inchiostro), x (cella), adv (passo),
 *                       gx (x del blit: ui_digits_draw), crc, fill, ring, shadow }
 *                       crc = CRC32 zlib SENZA SEGNO della mappa di indici 0..3 (0 vuoto,
 *                       1 riempimento, 2 anello, 3 ombra) ricostruita dalla SOLA maschera di
 *                       digit_masks.js con la regola di D45, w byte per riga, strip_h righe;
 *                       fill/ring/shadow = quanti pixel per indice (diagnostica).
 * photos[] decisioni del colore automatico sulle due foto demo (resources/photos/): le stesse
 *          della tabella di resources/photos/README.md, calcolate con photo_prep.stats_emery /
 *          stats_flint (campionamento 1 px su 2, nessuna isteresi: decisione a freddo).
 * luma     costanti di src/c/luma.h e impronta della tabella LUMA_SUN (64 valori) da pinnare nel
 *          porting JS: sum = somma dei 64 valori, crc = CRC32 zlib dei 64 byte (hysteresis non e'
 *          usata dall'anteprima: decisione a freddo).
 * Ancoraggio al C: prima di scrivere, il generatore confronta luma.h, LUMA_SUN di luma.c, le
 * costanti di prv_compute_layout (ui_time.c) e digit_metrics.h (contro digit_masks.js) con questi
 * numeri e si ferma se differiscono: la fixture non puo' restare verde su un C cambiato.
 * I CRC sono interi senza segno (in JS confrontare con `zlib.crc32(...) >>> 0`). */
module.exports = {
  version: '%s',
  masks_v: %d,
  time: '%s',
"""


def hexu(v):
    return '0x%08X' % (v & 0xFFFFFFFF)


def jsbool(v):
    return 'true' if v else 'false'


def render(cases, photos, masks_v):
    out = [HEADER % (FIXTURE_VERSION, PREVIEW_TIME, PREVIEW_TIME, FIXTURE_VERSION, masks_v,
                     PREVIEW_TIME)]
    a = out.append

    a('  /* costanti di ui_time.c:prv_compute_layout (content size normale). */\n')
    a('  layout: {\n')
    for plat in ('emery', 'flint'):
        lay = LAYOUT[plat]
        a("    %s: { fmt: '%s', w: %d, h: %d, a_fill_y: %d, a_cell: %d, a_colon: %d,\n"
          '      b_hh_fill_y: %d, b_mm_fill_y: %d, b_cell: %d, b_gap: %d, info_y: %d, info_h: %d,\n'
          '      band_a: %d, band_b: %d },\n'
          % (plat, lay['fmt'], lay['w'], lay['h'], lay['a_fill_y'], lay['a_cell'], lay['a_colon'],
             lay['b_hh_fill_y'], lay['b_mm_fill_y'], lay['b_cell'], lay['b_gap'], lay['info_y'],
             lay['info_h'], band_h(plat, 'A'), band_h(plat, 'B')))
    a('  },\n\n')

    a('  /* costanti di src/c/luma.h + impronta di LUMA_SUN (deve coincidere con luma.c). */\n')
    a('  luma: { white_bad: %d, black_bad: %d, crossover: %d, halo_pct: %d, hysteresis: %d,\n'
      '    sun_len: %d, sun_sum: %d, sun_crc: %s },\n\n'
      % (pp.LUMA_Y_WHITE_BAD, pp.LUMA_Y_BLACK_BAD, pp.LUMA_Y_CROSSOVER, pp.LUMA_HALO_PCT,
         LUMA_HYSTERESIS, len(pp.LUM_SUN), sum(pp.LUM_SUN), hexu(zlib.crc32(bytes(pp.LUM_SUN)))))

    a('  cases: [\n')
    for c in cases:
        a("    { platform: '%s', fmt: '%s', font: '%s', strip: %d, setting: %d, layout: '%s',"
          " size: '%s', mode: '%s',\n"
          % (c['platform'], c['fmt'], c['font'], c['strip'], c['setting'], c['layout'], c['size'],
             c['mode']))
        a('      screen_w: %d, screen_h: %d, cell: %d, colon: %d, gap: %d, band_h: %d,\n'
          % (c['screen_w'], c['screen_h'], c['cell'], c['colon'], c['gap'], c['band_h']))
        a('      strip_h: %d, digit_h: %d, ring: %d, shadow: %d, cell_w: %d,\n'
          % (c['strip_h'], c['digit_h'], c['ring'], c['shadow'], c['cell_w']))
        a('      rows: [\n')
        for r in c['rows']:
            a('        { y: %d, total: %d, x0: %d, ring_gap: %s, glyphs: [\n'
              % (r['y'], r['total'], r['x0'],
                 'null' if r['ring_gap'] is None else str(r['ring_gap'])))
            for g in r['glyphs']:
                a("          { ch: '%s', g: %d, w: %d, x: %d, adv: %d, gx: %d, crc: %s,"
                  ' fill: %d, ring: %d, shadow: %d },\n'
                  % (g['ch'], g['g'], g['w'], g['x'], g['adv'], g['gx'], hexu(g['crc']),
                     g['fill'], g['ring'], g['shadow']))
            a('        ] },\n')
        a('      ] },\n')
    a('  ],\n\n')

    a('  /* foto demo: le decisioni del colore automatico della tabella di resources/photos/README.md. */\n')
    a('  photos: [\n')
    for p in photos:
        a("    { name: '%s', platform: '%s', fmt: '%s', file: '%s', bytes: %d, crc: %s,"
          ' w: %d, h: %d,\n'
          % (p['name'], p['platform'], p['fmt'], p['file'], p['bytes'], hexu(p['crc']),
             p['w'], p['h']))
        a('      bands: [\n')
        for b in p['bands']:
            a("        { layout: '%s', h: %d, samples: %d, bad_white: %d, bad_black: %d,"
              ' mean: %d, white: %s, bad_pct: %d, halo: %s },\n'
              % (b['layout'], b['h'], b['samples'], b['bad_white'], b['bad_black'], b['mean'],
                 jsbool(b['white']), b['bad_pct'], jsbool(b['halo'])))
        a('      ] },\n')
    a('  ]\n')
    a('};\n')
    return ''.join(out)


def build(c_dir=None):
    masks = gd.load_masks_js(MASKS_JS)
    n = check_c_sources(masks, c_dir)
    print('sorgenti C coerenti con la fixture: %d valori (luma.h, LUMA_SUN, prv_compute_layout, digit_metrics.h vs digit_masks.js)' % n)
    return render(build_cases(masks), build_photos(), masks['v'])


# --------------------------------------------------------------------- main ---

def first_diff(a, b):
    la, lb = a.split('\n'), b.split('\n')
    for i in range(min(len(la), len(lb))):
        if la[i] != lb[i]:
            return i + 1, la[i], lb[i]
    n = min(len(la), len(lb))
    return n + 1, (la[n] if len(la) > n else '<fine>'), (lb[n] if len(lb) > n else '<fine>')


def main(argv=None):
    ap = argparse.ArgumentParser(description="fixture dell'anteprima della config page (S12/D48)")
    ap.add_argument('--out', default=OUT_JS, help='file da scrivere (default: test/fixture_preview.js)')
    ap.add_argument('--check', action='store_true',
                    help='non scrive: verifica che il file su disco sia aggiornato (exit 1)')
    ap.add_argument('--c-dir', default=C_DIR, metavar='DIR',
                    help='cartella dei sorgenti C confrontati con la fixture (default: src/c)')
    args = ap.parse_args(argv)

    t0 = time.time()
    if not os.path.isfile(MASKS_JS):
        print('ERRORE: manca %s (rigenerare con gen_digits.py --masks-js)' % MASKS_JS)
        return 1
    text = build(args.c_dir)

    if args.check:
        if not os.path.exists(args.out):
            print('check: %s NON esiste (eseguire gen_preview_fixture.py)' % args.out)
            return 1
        with open(args.out, 'r', encoding='utf-8') as fh:
            have = fh.read()
        if have == text:
            print('check: fixture_preview.js aggiornata (%d B, %.1f s)'
                  % (len(text.encode('utf-8')), time.time() - t0))
            return 0
        n, ra, rb = first_diff(have, text)
        print('check: %s DIVERSO dal generato, prima differenza alla riga %d' % (args.out, n))
        print('  nel repo:  %s' % ra[:100])
        print('  generato:  %s' % rb[:100])
        print('  rigenerare con: python3 apps/galleria/test/gen_preview_fixture.py')
        return 1

    with open(args.out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)
    print('scritto %s  %d B  (%d righe, %.1f s)'
          % (args.out, len(text.encode('utf-8')), text.count('\n'), time.time() - t0))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except gd.GenError as exc:
        sys.stderr.write('gen_preview_fixture.py: %s\n' % exc)
        sys.exit(1)

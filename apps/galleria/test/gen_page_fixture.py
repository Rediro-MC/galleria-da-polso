#!/usr/bin/env python3
r"""gen_page_fixture.py — v1 (S6): la fixture del round trip Python <-> JS della config page.

Genera `test/fixture_page.js` (`module.exports = {...}`), cioè il RIFERIMENTO byte-esatto con
cui `test/test_pipeline.js` confronta `src/pkjs/config/pipeline.js`. Tutti i numeri vengono da
`tools/photo_prep.py` (importato come modulo, non rilanciato come processo): se il tool e il
porting JS divergono, il test diventa rosso.

Dipendenze: solo stdlib (base64, zlib) + le funzioni di photo_prep.py. NIENTE Pillow: l'immagine
di prova è sintetica e disegnata qui con aritmetica intera.

Contenuto della fixture (spec docs/design/galleria-s6-config-page.md §8):
  img200/img144   immagine RGB piatta 200x228 e 144x168 in base64 (alfabeto standard, con
                  padding: si decodifica con Buffer.from(s, 'base64')). Deterministica:
                  riga 0-1 = sweep di tutti i 256 livelli su ogni canale, poi bande di
                  gradienti (colore e neutro), blocchi saturi, rumore LCG, gradiente + rumore,
                  quasi-bianco/quasi-nero (clamp) e grigi a cavallo delle soglie 85/170.
  emery_cases     dither {fs, bayer, none} x sunlight {false, true} x (gamma, lift)
                  {(1,0), (0.8,0.1), (1.6,0.3)} -> CRC32 del raw6, photo_id, primi byte, colori.
  emery_pin       un caso (fs + sunlight + 0.8/0.1) con il raw6 INTERO in base64url senza
                  padding: pin di pack6 e di b64url insieme.
  flint_cases     dither {fs, atkinson, none} x le stesse 3 coppie -> CRC32 del raw1, photo_id.
  flint_pin       un caso (atkinson + 1.6/0.3) con il raw1 intero in base64url.
  tone            le tre LUT di tono (256 valori) + l'identità.
  quant           _quant_raw ai bordi (42|43, 127|128, 212|213: NON 84|85).
  gray            to_gray16 su singoli colori (pin dei pesi 54/183/19).
  crc_vectors     zlib.crc32 su stringhe ASCII note.
  b64_vectors     base64url senza padding di buffer LCG di lunghezza 0..8 (0,1,2 mod 3).
  rects           fit_rect / crop_rect / flint_rect su 10 casi (anche fuori immagine).
  sun_lut_crc32   CRC32 della LUT 32^3 (0x48CBD990).

Uso:
    python3 apps/galleria/test/gen_page_fixture.py            # (ri)genera il .js
    python3 apps/galleria/test/gen_page_fixture.py --check    # verifica, exit 1 se non aggiornato

Riproducibile: nessuna data, nessun percorso assoluto, nessun `sys.argv` nel file generato ->
`--check` confronta byte per byte. Tempo: ~2 s (make pagecheck lo esegue a ogni `make -C test`).
"""

import argparse
import base64
import os
import sys
import time
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))                  # apps/galleria/test
APP_DIR = os.path.dirname(HERE)                                    # apps/galleria
REPO_DIR = os.path.dirname(os.path.dirname(APP_DIR))               # radice del repo
TOOLS_DIR = os.path.join(REPO_DIR, 'tools')
OUT_JS = os.path.join(HERE, 'fixture_page.js')

sys.path.insert(0, TOOLS_DIR)
import photo_prep as pp                                            # noqa: E402

FIXTURE_VERSION = 'v1'
B64_COLS = 96               # caratteri per riga nelle stringhe spezzate del .js
PAIRS = ((1.0, 0.0), (0.8, 0.1), (1.6, 0.3))
EMERY_PIN = ('fs', True, 0.8, 0.1)          # caso con il raw6 intero in fixture
FLINT_PIN = ('atkinson', 1.6, 0.3)          # caso con il raw1 intero in fixture

# Casi dei rettangoli: (sw, sh, arg) con arg None oppure (x, y, w, h), anche fuori immagine.
RECT_CASES = (
    (4000, 3000, None),
    (3000, 4000, None),
    (200, 228, None),
    (1, 1, None),
    (120, 100, None),
    (4000, 3000, (100, 200, 1500, 900)),
    (4000, 3000, (-50, -50, 99999, 99999)),
    (640, 480, (600, 470, 100, 100)),
    (500, 570, (0, 0, 500, 570)),
    (999, 1001, (10, 20, 30, 40)),
)

# Colori per il pin di to_gray16 (pesi Rec.709 interi 54/183/19 >> 8).
GRAY_CASES = ((0, 0, 0), (255, 255, 255), (255, 0, 0), (0, 255, 0), (0, 0, 255),
              (128, 128, 128), (85, 170, 255), (1, 2, 3), (200, 30, 90), (7, 250, 13))

# Vettori del CRC32 (stringhe ASCII): gli stessi di test_crc.c / crc.js.
CRC_STRINGS = ('', 'a', 'abc', '123456789', 'The quick brown fox jumps over the lazy dog')


# ------------------------------------------------------- immagine sintetica ---

def synth(w, h, seed):
    """Immagine RGB piatta w x h deterministica (solo interi, nessun antialias).

    Le prime due righe sono uno sweep: il pixel i-esimo vale (v, v+85, v+170) mod 256 con
    v = i % 256, così ogni canale vede tutti e 256 i livelli (2*144 = 288 pixel bastano anche
    per flint). Sotto, bande alte 12 righe che si ripetono: gradiente a colori, gradiente
    neutro, blocchi saturi (rosso/verde/blu/giallo/ciano/magenta/bianco/nero), rumore LCG puro,
    gradiente + rumore, quasi-bianco/quasi-nero (fa lavorare il clamp 0..4080 del FS) e grigi a
    ridosso delle soglie 85/170 di q(v). L'LCG avanza a ogni pixel (anche nello sweep).
    """
    px = bytearray(w * h * 3)
    x0 = seed
    for y in range(h):
        for x in range(w):
            x0 = (x0 * 1103515245 + 12345) & 0x7FFFFFFF
            n = (x0 >> 16) & 255
            if y < 2:
                v = (y * w + x) % 256
                r, g, b = v, (v + 85) % 256, (v + 170) % 256
            else:
                band = ((y - 2) // 12) % 7
                if band == 0:
                    r = x * 255 // (w - 1)
                    g = y * 255 // (h - 1)
                    b = (x + y) * 255 // (w + h - 2)
                elif band == 1:
                    r = g = b = x * 255 // (w - 1)
                elif band == 2:
                    r, g, b = ((255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0),
                               (0, 255, 255), (255, 0, 255), (255, 255, 255),
                               (0, 0, 0))[(x * 8) // w]
                elif band == 3:
                    r, g, b = n, (n * 7) & 255, (n * 13) & 255
                elif band == 4:
                    r = (x * 255 // (w - 1) * 3 + n) // 4
                    g = (y * 255 // (h - 1) * 3 + (255 - n)) // 4
                    b = (n * 3 + x) & 255
                elif band == 5:
                    r = g = b = 250 if (x // 6) % 2 else 5
                else:
                    v = 85 + (x % 3) - 1 if (y & 1) else 170 + (x % 3) - 1
                    r, g, b = v, v ^ 1, v
            p = (y * w + x) * 3
            px[p] = r & 255
            px[p + 1] = g & 255
            px[p + 2] = b & 255
    return bytes(px)


def levels(px):
    """Numero di livelli distinti per canale: la fixture pretende 256 su tutti e tre."""
    return [len(set(px[c::3])) for c in range(3)]


# ------------------------------------------------------------- formattazione ---

def b64std(data):
    """base64 standard CON padding (Buffer.from(s, 'base64') in node)."""
    return base64.b64encode(data).decode('ascii')


def b64url(data):
    """base64url SENZA padding: lo stesso alfabeto/risultato di src/pkjs/b64.js."""
    return base64.urlsafe_b64encode(data).decode('ascii').rstrip('=')


def js_str_lines(s, indent):
    """Stringa lunga spezzata in righe da B64_COLS caratteri: ['...', '...'].join('')."""
    if len(s) <= B64_COLS:
        return "'%s'" % s
    pad = ' ' * indent
    parts = [s[i:i + B64_COLS] for i in range(0, len(s), B64_COLS)]
    return "[\n" + ",\n".join("%s  '%s'" % (pad, p) for p in parts) + "\n%s].join('')" % pad


def js_num_list(seq, per_line, indent):
    """Lista di interi su più righe (LUT di tono, byte di testa)."""
    pad = ' ' * indent
    rows = []
    for i in range(0, len(seq), per_line):
        rows.append(pad + '  ' + ', '.join(str(v) for v in seq[i:i + per_line]))
    return "[\n" + ",\n".join(rows) + "\n" + pad + "]"


def hexu(v):
    return '0x%08X' % (v & 0xFFFFFFFF)


def num(v):
    """Numero Python -> letterale JS con lo stesso valore double (repr è esatto)."""
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, int):
        return str(v)
    return repr(float(v))


def rect_js(r):
    return '{ x: %d, y: %d, w: %d, h: %d }' % r


# ------------------------------------------------------------------ calcolo ---

def build(verbose=False):
    """Calcola tutto con photo_prep.py e ritorna il testo di fixture_page.js."""
    t0 = time.time()
    img6 = synth(pp.EMERY_W, pp.EMERY_H, 12345)
    img1 = synth(pp.FLINT_W, pp.FLINT_H, 777)
    for name, im in (('200x228', img6), ('144x168', img1)):
        lv = levels(im)
        if lv != [256, 256, 256]:
            raise SystemExit('fixture %s: livelli per canale %s, servono 256 su ognuno' % (name, lv))
    lut = pp.sun_lut()
    sun_crc = zlib.crc32(lut)
    if sun_crc != pp.SUN_LUT_CRC32:
        raise SystemExit('build_sun_lut: CRC32 %s invece di %s' % (hexu(sun_crc), hexu(pp.SUN_LUT_CRC32)))

    tones = [(ga, li, pp.tone_lut(ga, li)) for ga, li in PAIRS]
    ident = pp.tone_lut(1.0, 0.0)

    emery, emery_pin = [], None
    for dn in ('fs', 'bayer', 'none'):
        for sun in (False, True):
            for ga, li in PAIRS:
                px = img6.translate(bytes(pp.tone_lut(ga, li)))
                idx = getattr(pp, 'dither_' + dn)(px, pp.EMERY_W, pp.EMERY_H, lut if sun else None)
                raw = pp.pack6(idx)
                if len(raw) != pp.RAW6_BYTES:
                    raise SystemExit('raw6 di %d B invece di %d' % (len(raw), pp.RAW6_BYTES))
                crc = zlib.crc32(raw)
                emery.append({'dither': dn, 'sunlight': sun, 'gamma': ga, 'lift': li,
                              'crc': crc, 'photo_id': (crc & 0x7FFFFFFF) or 1,
                              'colors': len(set(idx)), 'head': list(raw[:12])})
                if (dn, sun, ga, li) == EMERY_PIN:
                    emery_pin = {'dither': dn, 'sunlight': sun, 'gamma': ga, 'lift': li,
                                 'len': len(raw), 'crc': crc, 'b64url': b64url(raw)}
                if verbose:
                    print('  emery %-5s sun=%d %.1f/%.1f  CRC %s' % (dn, sun, ga, li, hexu(crc)))
    if emery_pin is None:
        raise SystemExit('EMERY_PIN non trovato fra i casi')

    flint, flint_pin = [], None
    for dn in ('fs', 'atkinson', 'none'):
        for ga, li in PAIRS:
            g = pp.to_gray16(img1, pp.FLINT_W, pp.FLINT_H, pp.tone_lut(ga, li))
            bits = getattr(pp, 'dither1_' + dn)(g, pp.FLINT_W, pp.FLINT_H)
            raw = pp.pack1(bits, pp.FLINT_W, pp.FLINT_H)
            if len(raw) != pp.RAW1_BYTES:
                raise SystemExit('raw1 di %d B invece di %d' % (len(raw), pp.RAW1_BYTES))
            crc = zlib.crc32(raw)
            flint.append({'dither': dn, 'gamma': ga, 'lift': li, 'crc': crc,
                          'photo_id': (crc & 0x7FFFFFFF) or 1, 'white': sum(bits),
                          'head': list(raw[:12])})
            if (dn, ga, li) == FLINT_PIN:
                flint_pin = {'dither': dn, 'gamma': ga, 'lift': li,
                             'len': len(raw), 'crc': crc, 'b64url': b64url(raw)}
            if verbose:
                print('  flint %-8s %.1f/%.1f  CRC %s' % (dn, ga, li, hexu(crc)))
    if flint_pin is None:
        raise SystemExit('FLINT_PIN non trovato fra i casi')

    # _quant_raw ai bordi: le soglie vere sono 42|43, 127|128, 212|213 (q(v) = min(3,(v+42)//85)).
    quant = []
    for v in (0, 42, 43, 84, 85, 126, 127, 128, 170, 212, 213, 254, 255):
        quant.append({'v': v, 'q': pp._quant_raw(v, v, v) & 3})
    quant_rgb = []
    for r, g, b in ((0, 0, 0), (255, 255, 255), (42, 43, 127), (128, 212, 213),
                    (84, 85, 0), (255, 0, 128), (170, 169, 171)):
        quant_rgb.append({'rgb': (r, g, b), 'idx': pp._quant_raw(r, g, b)})

    gray = []
    for r, g, b in GRAY_CASES:
        gray.append({'rgb': (r, g, b), 'g16': pp.to_gray16(bytes((r, g, b)), 1, 1, ident)[0]})

    for s in CRC_STRINGS:                  # finiscono in un letterale JS fra apici singoli
        if not s.isascii() or "'" in s or '\\' in s:
            raise SystemExit('CRC_STRINGS: "%s" non e\' ASCII senza apici/backslash' % s)
    crc_vectors = [{'s': s, 'crc': zlib.crc32(s.encode('ascii'))} for s in CRC_STRINGS]

    b64_vectors = []
    x0 = 2024
    buf = bytearray()
    for n in range(0, 9):
        while len(buf) < n:
            x0 = (x0 * 1103515245 + 12345) & 0x7FFFFFFF
            buf.append((x0 >> 16) & 255)
        b64_vectors.append({'bytes': list(buf[:n]), 's': b64url(bytes(buf[:n]))})

    rects = []
    for sw, sh, arg in RECT_CASES:
        fw, fh = pp.fit_rect(sw, sh, pp.EMERY_W, pp.EMERY_H)
        crop = pp.crop_rect(sw, sh, arg)
        rects.append({'sw': sw, 'sh': sh, 'arg': arg, 'fit': (fw, fh),
                      'crop': crop, 'flint': pp.flint_rect(crop)})

    text = render(img6, img1, sun_crc, tones, ident, emery, emery_pin, flint, flint_pin,
                  quant, quant_rgb, gray, crc_vectors, b64_vectors, rects)
    if verbose:
        print('calcolato in %.1f s' % (time.time() - t0))
    return text


# ---------------------------------------------------------------- rendering ---

HEADER = """\
/* fixture_page.js — FIXTURE GENERATA da test/gen_page_fixture.py %s: non modificare a mano.
 * Riferimento byte-esatto di tools/photo_prep.py %s per test/test_pipeline.js (S6, round trip
 * Python <-> src/pkjs/config/pipeline.js). Rigenerare con:
 *   python3 apps/galleria/test/gen_page_fixture.py          (--check verifica che sia aggiornata)
 * Nessuna data: due esecuzioni devono dare lo stesso file byte per byte.
 * img200/img144 = byte RGB piatti in base64 standard; i raw6/raw1 dei "pin" sono in base64url
 * senza padding (lo stesso alfabeto di src/pkjs/b64.js). */
module.exports = {
  version: '%s',
  tool: '%s',
"""


def render(img6, img1, sun_crc, tones, ident, emery, emery_pin, flint, flint_pin,
           quant, quant_rgb, gray, crc_vectors, b64_vectors, rects):
    out = [HEADER % (FIXTURE_VERSION, pp.TOOL_VERSION, FIXTURE_VERSION, pp.TOOL_VERSION)]
    a = out.append

    a('  sun_lut_crc32: %s,\n\n' % hexu(sun_crc))

    a('  /* immagine di prova 200x228 (emery): byte RGB piatti, base64 standard. */\n')
    a('  img200: { w: %d, h: %d, len: %d, crc: %s, b64: %s },\n\n'
      % (pp.EMERY_W, pp.EMERY_H, len(img6), hexu(zlib.crc32(img6)), js_str_lines(b64std(img6), 2)))
    a('  /* immagine di prova 144x168 (flint). */\n')
    a('  img144: { w: %d, h: %d, len: %d, crc: %s, b64: %s },\n\n'
      % (pp.FLINT_W, pp.FLINT_H, len(img1), hexu(zlib.crc32(img1)), js_str_lines(b64std(img1), 2)))

    a('  /* LUT di tono (tone_lut) per le coppie usate nei casi, piu\' l\'identita\'. */\n')
    a('  tone: [\n')
    for ga, li, t in tones:
        a('    { gamma: %s, lift: %s, lut: %s },\n' % (num(ga), num(li), js_num_list(t, 16, 4)))
    a('  ],\n')
    a('  tone_ident: %s,\n\n' % js_num_list(ident, 16, 2))

    a('  /* raw6: dither x sunlight x (gamma, lift). head = primi 12 byte (diagnostica). */\n')
    a('  emery_cases: [\n')
    for c in emery:
        a("    { dither: '%s', sunlight: %s, gamma: %s, lift: %s, crc: %s, photo_id: %d,"
          " colors: %d, head: [%s] },\n"
          % (c['dither'], num(c['sunlight']), num(c['gamma']), num(c['lift']), hexu(c['crc']),
             c['photo_id'], c['colors'], ', '.join(str(v) for v in c['head'])))
    a('  ],\n')
    a('  /* pin di pack6 + b64url: il raw6 intero (45.600 caratteri) di un caso. */\n')
    a("  emery_pin: { dither: '%s', sunlight: %s, gamma: %s, lift: %s, len: %d, crc: %s,\n"
      "    b64url: %s },\n\n"
      % (emery_pin['dither'], num(emery_pin['sunlight']), num(emery_pin['gamma']),
         num(emery_pin['lift']), emery_pin['len'], hexu(emery_pin['crc']),
         js_str_lines(emery_pin['b64url'], 4)))

    a('  /* raw1: dither x (gamma, lift). white = pixel a 1 (bianchi). */\n')
    a('  flint_cases: [\n')
    for c in flint:
        a("    { dither: '%s', gamma: %s, lift: %s, crc: %s, photo_id: %d, white: %d,"
          " head: [%s] },\n"
          % (c['dither'], num(c['gamma']), num(c['lift']), hexu(c['crc']), c['photo_id'],
             c['white'], ', '.join(str(v) for v in c['head'])))
    a('  ],\n')
    a("  flint_pin: { dither: '%s', gamma: %s, lift: %s, len: %d, crc: %s,\n    b64url: %s },\n\n"
      % (flint_pin['dither'], num(flint_pin['gamma']), num(flint_pin['lift']), flint_pin['len'],
         hexu(flint_pin['crc']), js_str_lines(flint_pin['b64url'], 4)))

    a('  /* q(v) = min(3, (v + 42) // 85): le soglie sono 42|43, 127|128, 212|213. */\n')
    a('  quant: [%s],\n'
      % ', '.join('{ v: %d, q: %d }' % (c['v'], c['q']) for c in quant))
    a('  quant_rgb: [\n')
    for c in quant_rgb:
        a('    { rgb: [%d, %d, %d], idx: %d },\n' % (c['rgb'][0], c['rgb'][1], c['rgb'][2], c['idx']))
    a('  ],\n\n')

    a('  /* to_gray16 con la LUT identita\': pin dei pesi 54/183/19 e del x16. */\n')
    a('  gray: [\n')
    for c in gray:
        a('    { rgb: [%d, %d, %d], g16: %d },\n' % (c['rgb'][0], c['rgb'][1], c['rgb'][2], c['g16']))
    a('  ],\n\n')

    a('  /* CRC32 zlib di stringhe ASCII (gli stessi vettori di crc.js). */\n')
    a('  crc_vectors: [\n')
    for c in crc_vectors:
        a("    { s: '%s', crc: %s },\n" % (c['s'], hexu(c['crc'])))
    a('  ],\n\n')

    a('  /* base64url senza padding di buffer LCG: lunghezze 0..8 (0, 1, 2 mod 3). */\n')
    a('  b64_vectors: [\n')
    for c in b64_vectors:
        a("    { bytes: [%s], s: '%s' },\n" % (', '.join(str(v) for v in c['bytes']), c['s']))
    a('  ],\n\n')

    a('  /* fit_rect / crop_rect / flint_rect (arg null = crop centrato piu\' grande). */\n')
    a('  rects: [\n')
    for r in rects:
        arg = 'null' if r['arg'] is None else '[%d, %d, %d, %d]' % r['arg']
        a('    { sw: %d, sh: %d, arg: %s, fit: { w: %d, h: %d }, crop: %s, flint: %s },\n'
          % (r['sw'], r['sh'], arg, r['fit'][0], r['fit'][1], rect_js(r['crop']), rect_js(r['flint'])))
    a('  ]\n')
    a('};\n')
    return ''.join(out)


# --------------------------------------------------------------------- main ---

def first_diff(a, b):
    """(numero di riga 1-based, riga di a, riga di b) della prima differenza."""
    la, lb = a.split('\n'), b.split('\n')
    for i in range(min(len(la), len(lb))):
        if la[i] != lb[i]:
            return i + 1, la[i], lb[i]
    return min(len(la), len(lb)) + 1, '<fine>' if len(la) <= len(lb) else la[len(lb)], \
        '<fine>' if len(lb) <= len(la) else lb[len(la)]


def main(argv=None):
    ap = argparse.ArgumentParser(description='fixture del round trip della config page (S6)')
    ap.add_argument('--out', default=OUT_JS, help='file da scrivere (default: test/fixture_page.js)')
    ap.add_argument('--check', action='store_true',
                    help='non scrive: verifica che il file su disco sia aggiornato (exit 1)')
    ap.add_argument('-q', '--quiet', action='store_true', help='meno righe di log')
    args = ap.parse_args(argv)

    t0 = time.time()
    text = build(verbose=not args.quiet and not args.check)
    blob = text.encode('utf-8')

    if args.check:
        if not os.path.exists(args.out):
            print('check: %s NON esiste (eseguire gen_page_fixture.py)' % args.out)
            return 1
        with open(args.out, 'r', encoding='utf-8') as fh:
            have = fh.read()
        if have == text:
            print('check: fixture_page.js aggiornata (%d B, %.1f s)' % (len(blob), time.time() - t0))
            return 0
        n, ra, rb = first_diff(have, text)
        print('check: %s DIVERSO dal generato, prima differenza alla riga %d' % (args.out, n))
        print('  nel repo:  %s' % ra[:100])
        print('  generato:  %s' % rb[:100])
        print('  rigenerare con: python3 apps/galleria/test/gen_page_fixture.py')
        return 1

    with open(args.out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)
    print('scritto %s  %d B  (%d righe, %.1f s)'
          % (args.out, len(blob), text.count('\n'), time.time() - t0))
    return 0


if __name__ == '__main__':
    sys.exit(main())

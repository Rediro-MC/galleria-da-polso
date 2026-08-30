#!/usr/bin/env python3
r"""gen_sync_fixture.py — v1 (S5a): la foto di prova del PKJS di Galleria.

Genera `test/fixture_photo.js`, cioè una foto già convertita nei due formati raw di
`src/c/photo_codec.h` e incorporata nel JavaScript come stringhe **base64url senza padding**.
In S5a era la foto della fixture PKJS (`src/pkjs/index.js` di prova); da S5b `index.js` usa
l'album vero e la foto sintetica serve ai test node (`test_b64.js`, `test_album.js`,
`test_sync_engine.js`): sta quindi in `test/` e non entra nel bundle del `.pbw`.

L'immagine NON viene da un file esterno (niente foto da licenziare): è sintetica e
deterministica — gradiente diagonale magenta→ciano, cerchio giallo bordato di nero, un
quadrato bianco e uno nero, otto barre sature nel terzo inferiore. Sull'emulatore si
distingue a colpo d'occhio dalle due demo del repo (`demo_1` Big Dipper scura, `demo_2`
Snowy Light chiara), sia a colori su emery sia in bianco e nero su flint.

Pipeline: PIL (interi, nessun antialias) → PNG 800×912 in una cartella temporanea →
`tools/photo_prep.py --out <tmp> --name sync_fixture` (opzioni di default: crop 200:228,
LANCZOS, dithering Floyd–Steinberg, niente `--sunlight`) → `sync_fixture.raw6` (34.200 B) e
`sync_fixture.raw1` (3.024 B) → base64url → JS.

Uso:
    python3 apps/galleria/test/gen_sync_fixture.py            # (ri)genera il .js
    python3 apps/galleria/test/gen_sync_fixture.py --check    # verifica, exit 1 se diverso
    python3 apps/galleria/test/gen_sync_fixture.py --keep /tmp/fx   # tiene PNG e raw

Riproducibilità: a parità di Pillow e di `photo_prep.py` i byte generati sono sempre gli
stessi (il disegno è in aritmetica intera, il tool è deterministico). L'unica riga che
cambia è quella con la data nell'intestazione: `--check` la normalizza in entrambi i testi
prima di confrontarli, il resto del file dev'essere identico byte per byte.
"""

import argparse
import base64
import datetime
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zlib

from PIL import Image, ImageDraw

# ---------------------------------------------------------------- costanti ---

NAME = 'sync_fixture'       # --name passato a photo_prep.py e campo `name` del modulo JS

SRC_W, SRC_H = 800, 912     # 4x 200x228: stesso rapporto della foto finale, nessun crop di lato
RAW6_BYTES = 34200          # photo_codec.h: 150 B/riga x 228 righe (emery)
RAW1_BYTES = 3024           # photo_codec.h:  18 B/riga x 168 righe (flint)

B64_COLS = 96               # caratteri per riga nel .js: 4 + 1 + 96 + 1 + 2 = 104 colonne

# Barre verticali del terzo inferiore: gli 8 colori più saturi, bianco e nero compresi.
BAR_COLORS = (
    (255,   0,   0), (  0, 255,   0), (  0,   0, 255), (255, 255,   0),
    (255,   0, 255), (  0, 255, 255), (255, 255, 255), (  0,   0,   0),
)

HERE = os.path.dirname(os.path.abspath(__file__))            # apps/galleria/test
APP_DIR = os.path.dirname(HERE)                              # apps/galleria
REPO_DIR = os.path.dirname(os.path.dirname(APP_DIR))         # radice del repo
PHOTO_PREP = os.path.join(REPO_DIR, 'tools', 'photo_prep.py')
OUT_JS = os.path.join(HERE, 'fixture_photo.js')

# Comando scritto nell'intestazione: fisso (non sys.argv), così --check resta stabile.
GEN_CMD = 'python3 apps/galleria/test/gen_sync_fixture.py'
DATE_RE = re.compile(r'^ \* Generato il .*$')
DATE_PLACEHOLDER = ' * Generato il <data>'

B64URL_OK = re.compile(r'^[A-Za-z0-9_-]*$')


# ------------------------------------------------------- immagine sintetica ---

def build_image():
    """Immagine 800x912 deterministica: gradiente diagonale + forme grandi.

    Tutto in aritmetica intera e senza antialias (`ImageDraw` non ne fa): due esecuzioni
    danno gli stessi byte anche su macchine diverse.
    """
    # Gradiente diagonale magenta (255,0,255) -> ciano (0,255,255): il colore dipende solo
    # da x+y, quindi una sola rampa lunga W+H-1 e ogni riga ne è una fetta spostata di 1 px.
    span = SRC_W + SRC_H - 2
    ramp = bytearray()
    for i in range(span + 1):
        r = (255 * (span - i) + span // 2) // span
        g = (255 * i + span // 2) // span
        ramp += bytes((r, g, 255))

    data = bytearray()
    for y in range(SRC_H):
        data += ramp[y * 3:(y + SRC_W) * 3]
    img = Image.frombytes('RGB', (SRC_W, SRC_H), bytes(data))

    d = ImageDraw.Draw(img)
    # Cerchio giallo con bordo nero: forma tonda grande, sta nella fascia dell'ora del layout A.
    d.ellipse((250, 150, 550, 450), fill=(255, 255, 0), outline=(0, 0, 0), width=10)
    # Quadrato bianco a sinistra e nero a destra: riferimenti per dithering e colore del testo.
    d.rectangle((60, 60, 200, 200), fill=(255, 255, 255))
    d.rectangle((600, 60, 740, 200), fill=(0, 0, 0))
    # Barre verticali nel terzo inferiore (y 608..911), 100 px l'una.
    bar_w = SRC_W // len(BAR_COLORS)
    for k, color in enumerate(BAR_COLORS):
        d.rectangle((k * bar_w, SRC_H * 2 // 3, (k + 1) * bar_w - 1, SRC_H - 1), fill=color)
    return img


# ------------------------------------------------------------- photo_prep ----

def run_photo_prep(png_path, out_dir):
    """Invoca tools/photo_prep.py con le opzioni di default e rilegge i due raw."""
    cmd = [sys.executable, PHOTO_PREP, '--out', out_dir, '--name', NAME, png_path]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout)
        sys.stderr.write(proc.stderr)
        raise SystemExit('photo_prep.py è uscito con %d' % proc.returncode)

    raws = []
    for ext, expected in (('raw6', RAW6_BYTES), ('raw1', RAW1_BYTES)):
        path = os.path.join(out_dir, '%s.%s' % (NAME, ext))
        with open(path, 'rb') as fh:
            blob = fh.read()
        if len(blob) != expected:
            raise SystemExit('%s: %d byte invece di %d' % (path, len(blob), expected))
        raws.append(blob)
    return raws[0], raws[1], proc.stdout


# -------------------------------------------------------------- base64url ----

def b64url(blob):
    """base64url SENZA padding: alfabeto A-Z a-z 0-9 '-' '_', nessun '=' finale."""
    text = base64.urlsafe_b64encode(blob).decode('ascii').rstrip('=')
    if not B64URL_OK.match(text):
        raise SystemExit('base64url inatteso (caratteri fuori alfabeto)')
    return text


def js_string_lines(text, indent='    '):
    """Stringa JS spezzata su più righe con `+`, sotto le ~120 colonne."""
    if not text:
        return indent + "''"
    parts = [text[i:i + B64_COLS] for i in range(0, len(text), B64_COLS)]
    lines = ["%s'%s'" % (indent, part) for part in parts]
    return ' +\n'.join(lines)


def signed32(value):
    """CRC32 come lo vede JavaScript: `crc | 0`, cioè intero con segno a 32 bit."""
    return value - 0x100000000 if value >= 0x80000000 else value


# ------------------------------------------------------------------- .js -----

def js_source(raw6, raw1, when):
    crc6, crc1 = zlib.crc32(raw6), zlib.crc32(raw1)
    out = []
    add = out.append
    add('/* fixture_photo.js — AUTOGENERATO da test/gen_sync_fixture.py — non modificare a mano.')
    add(' *')
    add(' * Foto di prova dei test node del PKJS (S5a: fixture della sync; S5b: test_b64.js,')
    add(' * test_album.js, test_sync_engine.js): immagine sintetica (gradiente diagonale magenta→ciano,')
    add(' * cerchio giallo, quadrato bianco e nero, barre sature) già convertita nei due formati raw')
    add(' * di src/c/photo_codec.h, senza foto esterne e senza licenze.')
    add(' *')
    add(' * Le stringhe sono base64url SENZA padding (alfabeto A-Z a-z 0-9 - _): si decodificano con')
    add(" * src/pkjs/b64.js, che restituisce un Array di interi 0..255 pronto per l'AppMessage.")
    add(' * `crc` è il CRC32 zlib del raw come lo scrive JavaScript, cioè con segno (`crc | 0`):')
    add(' * per confrontarlo con un CRC senza segno usare `fixture.raw6.crc >>> 0`.')
    add(' *')
    add(' * Generato il %s con:' % when)
    add(' *     %s' % GEN_CMD)
    add(' * Verifica: %s --check' % GEN_CMD)
    add(' *')
    add(' * raw6 (emery 200×228): %d B, CRC32 0x%08X (%d)' % (len(raw6), crc6, signed32(crc6)))
    add(' * raw1 (flint 144×168):  %d B, CRC32 0x%08X (%d)' % (len(raw1), crc1, signed32(crc1)))
    add(' */')
    add('')
    add('var RAW6_B64 =')
    add(js_string_lines(b64url(raw6)) + ';')
    add('')
    add('var RAW1_B64 =')
    add(js_string_lines(b64url(raw1)) + ';')
    add('')
    add('module.exports = {')
    add("  name: '%s'," % NAME)
    add('  raw6: { len: %d, crc: %d, b64: RAW6_B64 },' % (len(raw6), signed32(crc6)))
    add('  raw1: { len: %d, crc: %d, b64: RAW1_B64 }' % (len(raw1), signed32(crc1)))
    add('};')
    add('')
    return '\n'.join(out)


def normalize(text):
    """Testo confrontabile da --check: la sola riga con la data diventa un segnaposto."""
    return '\n'.join(DATE_PLACEHOLDER if DATE_RE.match(line) else line
                     for line in text.split('\n'))


def first_diff(a, b):
    """Numero di riga (1-based) e le due righe dove i due testi divergono."""
    la, lb = a.split('\n'), b.split('\n')
    for i in range(max(len(la), len(lb))):
        ra = la[i] if i < len(la) else '<fine file>'
        rb = lb[i] if i < len(lb) else '<fine file>'
        if ra != rb:
            return i + 1, ra, rb
    return 0, '', ''


# ------------------------------------------------------------------ main -----

def main():
    ap = argparse.ArgumentParser(
        description='Genera test/fixture_photo.js (foto sintetica per i test node del PKJS).',
        epilog='Formati: apps/galleria/src/c/photo_codec.h. Conversione: tools/photo_prep.py (§9 di tools/README.md).')
    ap.add_argument('--check', action='store_true',
                    help='non scrive nulla: verifica che il .js nel repo sia quello generato (exit 1)')
    ap.add_argument('--out', metavar='FILE', default=OUT_JS,
                    help='percorso del .js da scrivere (default: test/fixture_photo.js)')
    ap.add_argument('--keep', metavar='DIR',
                    help='copia in DIR il PNG sintetico e i due raw (per guardarli)')
    args = ap.parse_args()

    if not os.path.exists(PHOTO_PREP):
        raise SystemExit('manca %s' % PHOTO_PREP)

    with tempfile.TemporaryDirectory(prefix='galleria_fixture_') as tmp:
        png = os.path.join(tmp, '%s.png' % NAME)
        build_image().save(png)
        raw6, raw1, prep_out = run_photo_prep(png, tmp)
        if args.keep:
            os.makedirs(args.keep, exist_ok=True)
            for src in (png, os.path.join(tmp, '%s.raw6' % NAME), os.path.join(tmp, '%s.raw1' % NAME)):
                shutil.copy2(src, args.keep)

    crc6, crc1 = zlib.crc32(raw6), zlib.crc32(raw1)
    when = datetime.date.today().isoformat()
    text = js_source(raw6, raw1, when)
    blob = text.encode('utf-8')

    print(prep_out.rstrip())
    print('sorgente sintetica  %dx%d px (nessun file esterno)' % (SRC_W, SRC_H))
    print('raw6  %6d B  CRC32 0x%08X  (con segno %d)  base64url %d caratteri'
          % (len(raw6), crc6, signed32(crc6), len(b64url(raw6))))
    print('raw1  %6d B  CRC32 0x%08X  (con segno %d)  base64url %d caratteri'
          % (len(raw1), crc1, signed32(crc1), len(b64url(raw1))))

    if args.check:
        if not os.path.exists(args.out):
            print('check: %s NON esiste' % args.out)
            return 1
        with open(args.out, 'r', encoding='utf-8') as fh:
            have = fh.read()
        if normalize(have) == normalize(text):
            print('check: %s è aggiornato (%d B, data a parte)' % (args.out, len(have.encode('utf-8'))))
            return 0
        num, ra, rb = first_diff(normalize(have), normalize(text))
        print('check: %s DIVERSO dal generato, prima differenza alla riga %d' % (args.out, num))
        print('  nel repo:  %s' % ra[:100])
        print('  generato:  %s' % rb[:100])
        return 1

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(text)
    print('scritto %s  %d B  (%d righe)' % (args.out, len(blob), text.count('\n')))
    return 0


if __name__ == '__main__':
    sys.exit(main())

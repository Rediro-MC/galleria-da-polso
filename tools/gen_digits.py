#!/usr/bin/env python3
r"""gen_digits.py — v1 (S3): cifre grandi come sprite per la watchface Galleria.

Da TTF a "strip" PNG: per ogni (font, taglia, piattaforma) un PNG con 11 celle affiancate
(glifo k in [k*cell_w, (k+1)*cell_w)), nell'ordine '0'..'9' poi ':'. Con --no-colon-b la sola
taglia B ha 10 celle ('0'..'9': il layout B non disegna mai il ':'), strip_w = 10*cell_w (senza
--pack) e nell'header ink[10] = { 0, 0 }; la taglia A resta a 11 celle e byte-identica. Il PNG è RGBA con
SOLO tre colori:

    (0, 0, 0,   0)  trasparente        -> indice "vuoto"
    (255,255,255,255) riempimento      -> palette[i] = colore del testo a runtime
    (0, 0, 0,   255)  contorno 1 px    -> palette[i] = alone o GColorClear

Il contorno è la dilatazione 8-connessa di 1 px della maschera meno la maschera stessa
(design galleria §7, D3): un solo blit per glifo con GCompOpSet.

Rasterizzazione con freetype-py come fontgen.py dell'SDK:
FT_LOAD_RENDER | FT_LOAD_TARGET_MONO | FT_LOAD_MONOCHROME (bitmap 1 bit, MSB-first).

Geometria (cell_w × strip_h), da apps/galleria/src/c/digit_metrics.h:

    emery (~color)  A 40×68   B 64×96
    flint (~bw)     A 28×44   B 48×64
    righe utili = strip_h - 2  (1 px di contorno sopra e 1 sotto)

Scelta della pixel size: la PIÙ GRANDE px per cui max(altezza dell'inchiostro delle cifre
'0'..'9') <= strip_h - 2 (ricerca lineare dal basso, si ferma alla prima px che sfora). Con
--fit-width la ricerca aggiunge il vincolo orizzontale bw + 2 <= cell_w (vedi sotto) e, nella
sola taglia A, bw(':') + 2 <= colon_cell (16 su emery, 12 su flint: la cella che il layout
riserva ai due punti), così un ':' troppo largo abbassa la px invece di sbordare sui vicini.

`digit_h` nell'header è l'altezza REALE del riempimento delle cifre, che occupano le righe
1..digit_h della strip: di norma strip_h - 2, meno quando --fit-width abbassa la px. È il
valore con cui ui_time.c allinea la base di AM/PM al fondo delle cifre, quindi deve seguire
l'inchiostro e non la geometria della cella (strip_h resta un campo a sé).

Baseline comune: baseline_row = 1 + max(bitmap_top delle cifre); ogni glifo va a
y0 = baseline_row - bitmap_top, quindi la cifra più alta parte dalla riga 1. Il ':' resta
dove lo mette il font rispetto alla baseline; se il suo contorno uscirebbe dalla strip viene
alzato (o abbassato) del minimo necessario e la cosa viene segnalata.

Orizzontale: x0 = k*cell_w + (cell_w - (bw + 2)) // 2 + 1, con bw = bitmap.width, così
l'inchiostro resta centrato nella cella con 1 px libero per il contorno.
Se bw + 2 > cell_w il glifo non ci sta: **ERRORE** (uscita 1), a meno di --fit-width, che
abbassa la px di quella sola combinazione finché il glifo più largo (e, in taglia A, il ':'
nella sua cella) non entra (con segnalazione della perdita di altezza; le combinazioni che già
entrano non cambiano di un byte).

--pack (S7, compito G2; comando canonico di Galleria): dopo il disegno la strip viene
RICOMPATTATA. I glifi vengono copiati adiacenti da sinistra a destra nello stesso ordine della
strip ('0'..'9' e, dove c'è, ':'), ink[k].x diventa l'offset progressivo e

    strip_w = somma delle larghezze degli inchiostri, arrotondata per eccesso a un multiplo di 4

(le colonne in coda restano trasparenti: 4 px = 1 byte esatto a 2 bit/px, così lo stride del PBI
resta a byte interi). Le colonne di inchiostro sono le STESSE identiche di prima — stessa px,
stessa baseline, stesse righe, stesso digit_h — perché vengono copiate tali e quali dalla strip
a celle fisse: cambia solo lo spazio vuoto fra un glifo e l'altro (nella taglia B di Anton su
emery: 640 px di strip per 489 px di inchiostro). Nell'header **cell_w resta il passo del
LAYOUT** (40/64 su emery, 28/48 su flint), che ui_time.c confronta con la griglia della
watchface, e non è più la larghezza della cella nel PNG; anche pick_px e --fit-width continuano
a misurare i vincoli di larghezza contro quel passo. ui_digits.c ritaglia i glifi con i soli
ink[k].x/ink[k].w, quindi non si accorge della differenza (controlla però strip_w).

Uso tipico (interprete del venv pebble-tool: ha freetype-py e Pillow):

  ~/.local/share/uv/tools/pebble-tool/bin/python tools/gen_digits.py \
      --fonts-dir apps/galleria/resources/fonts \
      --out apps/galleria/resources/digits \
      --header apps/galleria/src/c/digit_metrics.h \
      --preview /tmp/digits --fit-width --no-colon-b --pack

  ... --check              # stampa solo la tabella delle metriche, non scrive nulla

Il tool è deterministico: nessuna data, nessun percorso assoluto e nessun timestamp finisce
nell'output, quindi due esecuzioni danno gli stessi byte (`cmp` come controllo).
"""

import argparse
import os
import sys

import freetype
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- costanti ---

TOOL_VERSION = 'v1'          # citata nell'header al posto della data (output riproducibile)

GLYPHS = '0123456789:'       # ordine delle celle nella strip (e dell'array ink[] dell'header)
NGLYPHS = len(GLYPHS)        # 11 (= DIGITS_GLYPHS)
DIGITS = '0123456789'
COLON = ':'

# [font: 0 Anton, 1 Bebas Neue, 2 Barlow Condensed Bold]
FONTS = (
    {'key': 'anton',  'name': 'Anton',                  'res': 'ANTON',  'file': 'Anton-Regular.ttf'},
    {'key': 'bebas',  'name': 'Bebas Neue',             'res': 'BEBAS',  'file': 'BebasNeue-Regular.ttf'},
    {'key': 'barlow', 'name': 'Barlow Condensed Bold',  'res': 'BARLOW', 'file': 'BarlowCondensed-Bold.ttf'},
)

SIZES = ('a', 'b')                  # taglia 0 = A, 1 = B
PLATFORMS = ('color', 'bw')         # tag risorsa: ~color = emery, ~bw = flint
PLATFORM_NAME = {'color': 'emery', 'bw': 'flint'}

# (cell_w, strip_h) per (piattaforma, taglia)
GEOM = {
    ('color', 'a'): (40, 68),
    ('color', 'b'): (64, 96),
    ('bw',    'a'): (28, 44),
    ('bw',    'b'): (48, 64),
}

# Griglia reale del layout A (design §3.1/§3.3, ui_time.c): 24 h = celle piene; in 12 h si
# stringono di AMPM_SHRINK = 2 px SOLO le celle delle cifre, il ':' tiene la sua cella piena
# (ui_time.c: `colon = s_lay.a_colon`, senza shrink) perché a 14/10 px non ci starebbe.
#   emery A  24 h 40|40|16|40|40      12 h 38|38|16|38|38
#   flint A  24 h 28|28|12|28|28      12 h 26|26|12|26|26
# La cella delle CIFRE è cell_w (24 h) / cell_w - 2 (12 h); quella del ':' è COLON_CELL sempre.
COLON_CELL = {('color', 'a'): 16, ('bw', 'a'): 12}
AMPM_SHRINK = 2              # ui_time.c:24

PX_MAX = 400                 # limite della ricerca lineare della pixel size
PX_FIELD_MAX = 255           # il campo `px` di digit_metrics.h è uint8_t

FT_FLAGS = (freetype.FT_LOAD_RENDER
            | freetype.FT_LOAD_TARGET_MONO
            | freetype.FT_LOAD_MONOCHROME)

# valori nella mappa della strip
EMPTY, FILL, OUTLINE = 0, 1, 2
RGBA = {
    EMPTY:   (0, 0, 0, 0),
    FILL:    (255, 255, 255, 255),
    OUTLINE: (0, 0, 0, 255),
}

PREVIEW_BG = (96, 96, 96)
PREVIEW_LABEL = (235, 235, 235)
PREVIEW_NAME = 'digits_preview.png'

# comando canonico citato nell'header (percorsi relativi alla radice del repo: riproducibile)
CANON_CMD = (
    '~/.local/share/uv/tools/pebble-tool/bin/python tools/gen_digits.py \\\n'
    ' *       --fonts-dir apps/galleria/resources/fonts \\\n'
    ' *       --out apps/galleria/resources/digits \\\n'
    ' *       --header apps/galleria/src/c/digit_metrics.h'
)


class GenError(Exception):
    """Errore fatale: viene stampato e il tool esce con 1."""


# ------------------------------------------------------------ freetype ---

class Glyph(object):
    """Bitmap monocromatica di un glifo, srotolata in righe di 0/1."""

    __slots__ = ('char', 'w', 'h', 'top', 'left', 'rows')

    def __init__(self, char, w, h, top, left, rows):
        self.char = char
        self.w = w
        self.h = h
        self.top = top
        self.left = left
        self.rows = rows        # list[bytearray] di lunghezza w, valori 0/1


def render(face, px, chars=GLYPHS):
    """Rasterizza `chars` a `px` pixel; ritorna {char: Glyph}."""
    face.set_pixel_sizes(0, px)
    out = {}
    for ch in chars:
        face.load_char(ch, FT_FLAGS)
        slot = face.glyph
        bm = slot.bitmap
        if bm.pixel_mode != 1:          # FT_PIXEL_MODE_MONO
            raise GenError('pixel_mode %d inatteso (attesa bitmap monocromatica)' % bm.pixel_mode)
        if bm.pitch < 0:
            raise GenError('pitch negativo (%d): bitmap capovolta, non gestita' % bm.pitch)
        buf = bm.buffer
        rows = []
        for y in range(bm.rows):
            base = y * bm.pitch
            row = bytearray(bm.width)
            for x in range(bm.width):
                row[x] = (buf[base + (x >> 3)] >> (7 - (x & 7))) & 1
            rows.append(row)
        out[ch] = Glyph(ch, bm.width, bm.rows, slot.bitmap_top, slot.bitmap_left, rows)
    return out


def pick_px(face, cell_w, rows_h, fit_width, colon_cell=None, chars=GLYPHS):
    """La px più grande che rispetta i vincoli; ritorna (px, {char: Glyph}).

    `chars` è l'insieme dei glifi effettivamente generati (GLYPHS, oppure le sole DIGITS per la
    taglia B con --no-colon-b): i vincoli di larghezza guardano solo quelli.

    Vincolo di altezza (sempre): max(h delle cifre) <= rows_h (righe utili = strip_h - 2).
    Vincoli di larghezza (solo con fit_width):
      - max(w dei glifi generati) + 2 <= cell_w  (la cella della strip);
      - w del ':' + 2 <= colon_cell, quando colon_cell è dato (taglia A): è la cella che il
        layout riserva ai due punti (16 emery / 12 flint), più stretta di cell_w, e senza
        questo vincolo un ':' più largo sborderebbe sulle cifre invece di far scendere la px.
    La ricerca sale da 1 e si ferma alla prima px che sfora l'altezza (monotona in pratica,
    ma così il risultato non dipende da eventuali non monotonie oltre il limite).
    """
    best = None
    for px in range(1, PX_MAX + 1):
        g = render(face, px, chars)
        if max(g[c].h for c in DIGITS) > rows_h:
            break
        if fit_width and max(g[c].w for c in chars) + 2 > cell_w:
            continue                    # troppo largo: non è un candidato, ma la scansione
                                        # prosegue fino al limite di altezza (best resta
                                        # l'ultima px valida su TUTTI i vincoli).
        if fit_width and colon_cell is not None and g[COLON].w + 2 > colon_cell:
            continue                    # il ':' non entra nella sua cella di layout
        best = (px, g)
    if best is None:
        raise GenError('nessuna pixel size valida (cell_w=%d, righe utili=%d)' % (cell_w, rows_h))
    return best


# --------------------------------------------------------------- strip ---

class Strip(object):
    """Una strip generata: mappa dei pixel + metriche + segnalazioni."""

    __slots__ = ('font', 'size', 'platform', 'cell_w', 'strip_w', 'strip_h', 'digit_h',
                 'rows_h', 'px', 'ink_h', 'buf', 'ink_x', 'ink_w', 'chars', 'ncells',
                 'packed', 'ink_sum', 'pad', 'notes', 'warnings', 'errors')

    def __init__(self, font, size, platform):
        self.font = font
        self.size = size
        self.platform = platform
        self.packed = False
        self.ink_sum = 0
        self.pad = 0
        self.notes = []
        self.warnings = []
        self.errors = []


def pack_strip(st):
    """Ricompatta la strip: glifi adiacenti, strip_w = somma degli inchiostri a multiplo di 4.

    Le colonne di inchiostro vengono copiate tali e quali dalla strip a celle fisse (stessi
    pixel, stessa altezza, stessa riga di baseline): cambia solo lo spazio vuoto fra i glifi,
    che sparisce. ink[k].x diventa l'offset progressivo; cell_w NON cambia, perché nell'header
    è il passo della griglia del layout (ui_time.c lo confronta con a_cell/b_cell) e non la
    larghezza della cella nel PNG. Le colonne di coda (0..3) restano trasparenti e servono solo
    a tenere lo stride del PBI a 2 bit su byte interi (4 px = 1 byte).
    """
    total = sum(st.ink_w[:st.ncells])
    new_w = ((total + 3) // 4) * 4
    buf = bytearray(new_w * st.strip_h)
    new_x = []
    x_out = 0
    for k in range(st.ncells):
        w = st.ink_w[k]
        src = st.ink_x[k]
        for y in range(st.strip_h):
            sb = y * st.strip_w + src
            db = y * new_w + x_out
            buf[db:db + w] = st.buf[sb:sb + w]
        new_x.append(x_out)
        x_out += w
    while len(new_x) < NGLYPHS:
        new_x.append(0)                  # glifo assente (taglia B senza ':'): resta { 0, 0 }
    st.ink_x = new_x
    st.buf = buf
    st.ink_sum = total
    st.pad = new_w - total
    st.strip_w = new_w
    st.packed = True


def build_strip(face, font, size, platform, fit_width, no_colon_b=False, pack=False):
    """Costruisce la strip (font = dict di FONTS).

    Con no_colon_b la taglia B salta la cella del ':' (10 celle invece di 11): il layout B non lo
    disegna mai, quindi sono 1.536 B (emery) / 768 B (flint) di heap e ~4,6 KB di pbpack in meno
    (con pack il ':' della taglia B semplicemente non c'è, e il conto è quello di pack).
    Con pack i glifi vengono poi accostati (vedi pack_strip): stessi pixel di inchiostro, senza
    lo spazio vuoto delle celle fisse.
    """
    cell_w, strip_h = GEOM[(platform, size)]
    rows_h = strip_h - 2                 # righe utili fra le due righe di contorno
    st = Strip(font, size, platform)
    st.chars = DIGITS if (size == 'b' and no_colon_b) else GLYPHS
    st.ncells = len(st.chars)
    st.cell_w = cell_w
    st.strip_w = st.ncells * cell_w
    st.strip_h = strip_h
    st.rows_h = rows_h

    colon_cell = COLON_CELL.get((platform, size))    # solo la taglia A ha una cella per il ':'
    px, glyphs = pick_px(face, cell_w, rows_h, fit_width, colon_cell, st.chars)
    if px > PX_FIELD_MAX:
        raise GenError('pixel size %d fuori dal campo uint8_t di digit_metrics.h (max %d): '
                       '%s %s %s' % (px, PX_FIELD_MAX, font['key'], PLATFORM_NAME[platform],
                                     size.upper()))
    st.px = px
    st.ink_h = max(glyphs[c].h for c in DIGITS)
    # digit_h = altezza reale del riempimento (le cifre stanno nelle righe 1..digit_h):
    # è il valore che ui_time.c usa per la base di AM/PM, non rows_h.
    st.digit_h = st.ink_h
    if st.ink_h < rows_h:
        st.notes.append('altezza ottenuta %d px su %d disponibili (%+d): digit_h = %d'
                        % (st.ink_h, rows_h, st.ink_h - rows_h, st.ink_h))

    # larghezza: il glifo deve stare nella cella con 1 px libero per lato
    for ch in st.chars:
        if glyphs[ch].w + 2 > cell_w:
            st.errors.append("glifo '%s' largo %d px: %d + 2 > cell_w %d"
                             % (ch, glyphs[ch].w, glyphs[ch].w, cell_w))
    if st.errors:
        st.ink_x = [0] * NGLYPHS
        st.ink_w = [0] * NGLYPHS
        st.buf = None
        return st

    # baseline comune, presa dalle sole cifre
    baseline_row = 1 + max(glyphs[c].top for c in DIGITS)

    placed = []                          # (glifo, x0, y0)
    for k, ch in enumerate(st.chars):
        g = glyphs[ch]
        x0 = k * cell_w + (cell_w - (g.w + 2)) // 2 + 1
        y0 = baseline_row - g.top
        if ch == COLON:
            # il ':' deve stare nella strip col suo contorno: alzalo/abbassalo del minimo
            lo, hi = 1, strip_h - 1 - g.h
            if y0 > hi:
                st.notes.append("':' alzato di %d px per entrare nella strip" % (y0 - hi))
                y0 = hi
            elif y0 < lo:
                st.notes.append("':' abbassato di %d px per entrare nella strip" % (lo - y0))
                y0 = lo
        if y0 < 1 or y0 + g.h - 1 > strip_h - 2:
            st.errors.append("glifo '%s' fuori dalla strip: righe %d..%d su 1..%d"
                             % (ch, y0, y0 + g.h - 1, strip_h - 2))
        placed.append((g, x0, y0))
    if st.errors:
        st.ink_x = [0] * NGLYPHS
        st.ink_w = [0] * NGLYPHS
        st.buf = None
        return st

    # digit_h deve essere il fondo reale del riempimento delle cifre (righe 1..digit_h):
    # con una cifra che scende sotto la baseline max(h) non basterebbe.
    bottom = max(y0 + g.h - 1 for g, x0, y0 in placed[:10])
    if bottom != st.digit_h:
        st.digit_h = bottom
        st.notes.append('fondo del riempimento alla riga %d: digit_h = %d' % (bottom, bottom))

    # riempimento
    buf = bytearray(st.strip_w * strip_h)
    for g, x0, y0 in placed:
        for y in range(g.h):
            row = g.rows[y]
            base = (y0 + y) * st.strip_w + x0
            for x in range(g.w):
                if row[x]:
                    buf[base + x] = FILL

    # contorno: dilatazione 8-connessa, ritagliata alla cella e alla strip
    dropped = set()
    for k, (g, x0, y0) in enumerate(placed):
        cx0 = k * cell_w
        cx1 = cx0 + cell_w - 1
        for y in range(g.h):
            row = g.rows[y]
            sy = y0 + y
            for x in range(g.w):
                if not row[x]:
                    continue
                sx = x0 + x
                for dy in (-1, 0, 1):
                    ny = sy + dy
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx = sx + dx
                        if nx < cx0 or nx > cx1 or ny < 0 or ny >= strip_h:
                            dropped.add((nx, ny))
                            continue
                        if buf[ny * st.strip_w + nx] == EMPTY:
                            buf[ny * st.strip_w + nx] = OUTLINE
    if dropped:
        st.warnings.append('%d pixel di contorno tagliati dai bordi di cella/strip' % len(dropped))
    st.buf = buf

    # metriche: prima colonna con inchiostro o contorno, larghezza totale
    st.ink_x = []
    st.ink_w = []
    for k in range(st.ncells):
        cx0 = k * cell_w
        first = last = None
        for x in range(cx0, cx0 + cell_w):
            col = False
            for y in range(strip_h):
                if buf[y * st.strip_w + x]:
                    col = True
                    break
            if col:
                if first is None:
                    first = x
                last = x
        if first is None:
            st.errors.append("glifo '%s' vuoto nella strip" % st.chars[k])
            first, last = cx0, cx0
        st.ink_x.append(first)
        st.ink_w.append(last - first + 1)
    # l'array ink[] dell'header ha sempre DIGITS_GLYPHS voci: la cella del ':' assente vale
    # { 0, 0 } (ui_digits.c salta i glifi con w == 0: nessuna sub-bitmap, glyph[g] = NULL).
    while len(st.ink_x) < NGLYPHS:
        st.ink_x.append(0)
        st.ink_w.append(0)

    # vincolo di layout della taglia A (design §3.1/§3.3): la griglia NON è uniforme, il ':'
    # ha una cella sua. 24 h = celle piene; in 12 h si stringono di AMPM_SHRINK solo le celle
    # delle CIFRE, il ':' tiene la cella piena (ui_time.c: colon = s_lay.a_colon).
    if colon_cell is not None:
        for label, dc, cc in (('24 h', cell_w, colon_cell),
                              ('12 h', cell_w - AMPM_SHRINK, colon_cell)):
            wide = [(GLYPHS[k], st.ink_w[k], dc) for k in range(10) if st.ink_w[k] > dc]
            if st.ink_w[10] > cc:
                wide.append((COLON, st.ink_w[10], cc))
            if wide:
                st.warnings.append('layout %s (celle %d cifre / %d il \':\'): glifi più larghi '
                                   'della cella: %s'
                                   % (label, dc, cc,
                                      ' '.join("'%s' %d>%d" % w for w in wide)))

    # compattazione (dopo i controlli di layout, che guardano solo le LARGHEZZE degli
    # inchiostri: pack non le tocca, sposta soltanto i glifi)
    st.ink_sum = sum(st.ink_w[:st.ncells])
    if pack:
        pack_strip(st)          # il risparmio finisce nella tabella e nel commento della voce,
                                # non nelle segnalazioni: non è un problema da leggere
    return st


# ----------------------------------------------------------------- PNG ---

def strip_image(st):
    """Immagine RGBA della strip (3 colori)."""
    img = Image.new('RGBA', (st.strip_w, st.strip_h), RGBA[EMPTY])
    px = img.load()
    for y in range(st.strip_h):
        base = y * st.strip_w
        for x in range(st.strip_w):
            v = st.buf[base + x]
            if v:
                px[x, y] = RGBA[v]
    return img


def write_png(st, out_dir):
    name = '%s_%s~%s.png' % (st.font['key'], st.size, st.platform)
    path = os.path.join(out_dir, name)
    strip_image(st).save(path, format='PNG', optimize=False)
    return path


def write_preview(strips, preview_dir):
    """Foglio di contatto: tutte le strip ×2 su fondo grigio, con i colori resi."""
    scale = 2
    pad, gap, label_h = 8, 10, 12
    width = pad * 2 + max(st.strip_w for st in strips) * scale
    height = pad * 2 + sum(st.strip_h * scale + label_h + gap for st in strips) - gap
    sheet = Image.new('RGB', (width, height), PREVIEW_BG)
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default()
    except Exception:                                        # pragma: no cover
        font = None
    y = pad
    for st in strips:
        label = ('%s %s %s  cell %d x %d  px %d  h %d'
                 % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper(),
                    st.cell_w, st.strip_h, st.px, st.digit_h))
        draw.text((pad, y), label, fill=PREVIEW_LABEL, font=font)
        y += label_h
        img = strip_image(st).resize((st.strip_w * scale, st.strip_h * scale), Image.NEAREST)
        sheet.paste(img, (pad, y), img)
        y += st.strip_h * scale + gap
    path = os.path.join(preview_dir, PREVIEW_NAME)
    sheet.save(path, format='PNG', optimize=False)
    return path


# -------------------------------------------------------------- header ---

def emit_header(strips, fit_width, no_colon_b=False, pack=False):
    """Testo di src/c/digit_metrics.h (nessuna data: riproducibile)."""
    by_key = {(st.font['key'], st.size, st.platform): st for st in strips}
    cmd = CANON_CMD
    if fit_width:
        cmd += ' \\\n *       --fit-width'
    opts = []
    if no_colon_b:
        opts.append('--no-colon-b')
    if pack:
        opts.append('--pack')
    if opts:
        cmd += ((' ' if fit_width else ' \\\n *       ') + ' '.join(opts))
    out = []
    w = out.append
    w('/* digit_metrics.h — GENERATO da tools/gen_digits.py (%s): non modificare.\n' % TOOL_VERSION)
    w(' * Rigenerare con:\n')
    w(' *   %s\n' % cmd)
    w(' *\n')
    if pack:
        w(' * Strip COMPATTA (--pack): i glifi stanno adiacenti da sinistra a destra nell\'ordine\n')
        w(' * \'0\'..\'9\'%s, senza celle vuote: si ritagliano SOLO con\n'
          % (' (la taglia A chiude con \':\')' if no_colon_b else ' poi \':\''))
        w(' * ink[k].x/ink[k].w, che è quello che fa ui_digits.c. strip_w = somma degli inchiostri\n')
        w(' * arrotondata al multiplo di 4 px superiore: le colonne in coda sono trasparenti e\n')
        w(' * tengono lo stride del PBI a 2 bit su byte interi (4 px = 1 B).\n')
        if no_colon_b:
            w(' * Taglia B (--no-colon-b): niente \':\' — il layout B non lo disegna mai — quindi\n')
            w(' * ink[DIGITS_GLYPH_COLON] = { 0, 0 } (ui_digits.c salta i glifi con w == 0).\n')
    elif no_colon_b:
        w(' * Strip: celle affiancate (glifo k in [k*cell_w, (k+1)*cell_w)). Taglia A: 11 celle,\n')
        w(' * \'0\'..\'9\' poi \':\'. Taglia B (--no-colon-b): 10 celle, solo \'0\'..\'9\' — il layout B\n')
        w(' * non disegna mai i due punti, quindi la sua cella non viene generata e in B\n')
        w(' * ink[DIGITS_GLYPH_COLON] = { 0, 0 } (ui_digits.c salta i glifi con w == 0).\n')
    else:
        w(' * Strip: 11 celle affiancate (glifo k in [k*cell_w, (k+1)*cell_w)), \'0\'..\'9\' poi \':\'.\n')
    w(' * PNG RGBA a 3 colori: (0,0,0,0) trasparente, (255,255,255,255) riempimento,\n')
    w(' * (0,0,0,255) contorno (dilatazione 8-connessa di 1 px meno la maschera).\n')
    w(' * Taglie (cell_w × strip_h): emery A 40×68, B 64×96; flint A 28×44, B 48×64;\n')
    if pack:
        w(' * cell_w è il PASSO DELLA GRIGLIA DEL LAYOUT (ui_time.c lo confronta con a_cell/b_cell),\n')
        w(' * non la larghezza di una cella nel PNG: nella strip compatta le celle non esistono.\n')
        w(' * strip_w è nel campo di ogni voce, col commento "pack <inchiostro>+<coda>".\n')
    else:
        w(' * strip_w = celle × cell_w (vedi il campo strip_w di ogni voce);\n')
    w(' * righe utili = strip_h − 2 (1 px di contorno sopra e 1 sotto).\n')
    w(' * digit_h = altezza REALE del riempimento: le cifre stanno nelle righe 1..digit_h\n')
    w(' * della strip (= strip_h − 2, meno dove --fit-width ha abbassato la px).\n')
    w(' * File: resources/digits/<font>_<taglia>~color.png (emery) / ~bw.png (flint). */\n')
    lines = []
    for st in strips:
        tag = '%s %s %s' % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper())
        for n in st.notes:
            lines.append('NOTA   %-18s %s' % (tag, n))
        for n in st.warnings:
            lines.append('AVVISO %-18s %s' % (tag, n))
    if lines:
        out.insert(4, ' * Segnalazioni della generazione:\n')
        for i, ln in enumerate(lines):
            out.insert(5 + i, ' *   %s\n' % ln)
        out.insert(5 + len(lines), ' *\n')
    w('#ifndef GALLERIA_DIGIT_METRICS_H\n')
    w('#define GALLERIA_DIGIT_METRICS_H\n')
    w('\n')
    w('#include <stdint.h>\n')
    w('\n')
    w('#define DIGITS_GLYPHS 11\n')
    w('\n')
    w('typedef struct { uint16_t x; uint8_t w; } DigitInk;      /* inchiostro (contorno compreso) nella strip */\n')
    w('typedef struct {\n')
    w('  uint16_t strip_w, strip_h;   /* dimensioni del PNG (1 px di contorno sopra e sotto le righe utili) */\n')
    if pack:
        w('  uint8_t  cell_w;             /* passo della griglia del LAYOUT (ui_time.c): la strip è compatta */\n')
    else:
        w('  uint8_t  cell_w;             /* passo delle celle nella strip (glifo k in [k*cell_w, (k+1)*cell_w)) */\n')
    w('  uint8_t  digit_h;            /* altezza reale del riempimento: cifre nelle righe 1..digit_h */\n')
    w('  uint8_t  px;                 /* pixel size FreeType usata (diagnostica) */\n')
    w('  DigitInk ink[DIGITS_GLYPHS]; /* \'0\'..\'9\', \':\'%s */\n'
      % (' (assente = { 0, 0 })' if no_colon_b else ''))
    w('} DigitStripMetrics;\n')
    w('\n')
    w('/* [font: 0 Anton, 1 Bebas Neue, 2 Barlow Condensed Bold][taglia: 0 A, 1 B] */\n')
    for i, platform in enumerate(PLATFORMS):
        w('%s /* %s */\n' % ('#if defined(PBL_COLOR)' if i == 0 else '#else', PLATFORM_NAME[platform]))
        w('static const DigitStripMetrics DIGITS_METRICS[3][2] = {\n')
        for fi, font in enumerate(FONTS):
            w('  { /* %s */\n' % font['name'])
            for size in SIZES:
                st = by_key[(font['key'], size, platform)]
                note = ''
                if st.packed:
                    note += ', pack %d+%d' % (st.ink_sum, st.pad)
                if st.digit_h != st.rows_h:
                    note += ' (inchiostro %d px su %d)' % (st.digit_h, st.rows_h)
                w('    { /* %s — %s_%s~%s.png, %d×%d%s */\n'
                  % (size.upper(), font['key'], size, platform, st.strip_w, st.strip_h, note))
                w('      %d, %d, %d, %d, %d,\n'
                  % (st.strip_w, st.strip_h, st.cell_w, st.digit_h, st.px))
                w('      { ')
                for k in range(NGLYPHS):
                    w('{ %3d, %2d }' % (st.ink_x[k], st.ink_w[k]))
                    if k == NGLYPHS - 1:
                        w(' },\n')
                    elif k % 4 == 3:
                        w(',\n        ')
                    else:
                        w(', ')
                w('    },\n')
            w('  },\n')
        w('};\n')
    w('#endif\n')
    w('\n')
    w('/* risorse: DIGITS_<FONT>_<TAGLIA> (uguali sulle due piattaforme: il tag ~color/~bw sceglie il file) */\n')
    w('static const uint32_t DIGITS_RESOURCE_IDS[3][2] = {\n')
    for font in FONTS:
        w('  { RESOURCE_ID_DIGITS_%s_A, RESOURCE_ID_DIGITS_%s_B },\n'
          % (font['res'], font['res']))
    w('};\n')
    w('\n')
    w('#endif /* GALLERIA_DIGIT_METRICS_H */\n')
    return ''.join(out)


# --------------------------------------------------------------- output ---

def print_table(strips):
    hdr = ('%-7s %-6s %-2s %-8s %-9s %-4s %-6s %-6s %-6s %s'
           % ('font', 'piatt', 'tg', 'cella', 'strip', 'px', 'h ink', 'w max', "w ':'",
              'larghezze (contorno compreso) 0..9 | :'))
    print(hdr)
    print('-' * len(hdr))
    for st in strips:
        if st.errors:
            print('%-7s %-6s %-2s %-8s %-9s %-4d %-6s %-6s %-6s ERRORE: %s'
                  % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper(),
                     '%dx%d' % (st.cell_w, st.strip_h), '-', st.px, '-', '-', '-',
                     '; '.join(st.errors)))
            continue
        wmax = max(st.ink_w[:10])
        colon = str(st.ink_w[10]) if st.ncells > 10 else '-'
        strip = '%dx%d' % (st.strip_w, st.strip_h)
        if st.packed:
            strip += '*'                 # * = compatta (--pack): strip_w = inchiostro + coda
        print('%-7s %-6s %-2s %-8s %-9s %-4d %-6s %-6d %-6s %s | %s'
              % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper(),
                 '%dx%d' % (st.cell_w, st.strip_h), strip, st.px,
                 '%d/%d' % (st.digit_h, st.rows_h), wmax, colon,
                 ','.join(str(v) for v in st.ink_w[:10]), colon))


def print_notes(strips):
    for st in strips:
        tag = '%s %s %s' % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper())
        for n in st.notes:
            print('NOTA    %-18s %s' % (tag, n))
        for n in st.warnings:
            print('AVVISO  %-18s %s' % (tag, n))
        for n in st.errors:
            print('ERRORE  %-18s %s' % (tag, n))


def parse_only(spec):
    """--only font,taglia,piattaforma (campi vuoti o '*' = tutti)."""
    if not spec:
        return (None, None, None)
    parts = [p.strip().lower() for p in spec.split(',')]
    while len(parts) < 3:
        parts.append('')
    if len(parts) > 3:
        raise GenError('--only vuole al massimo 3 campi: font,taglia,piattaforma')
    keys = [f['key'] for f in FONTS]
    f, s, p = [None if v in ('', '*') else v for v in parts]
    if f is not None and f not in keys:
        raise GenError('--only: font sconosciuto %r (attesi: %s)' % (f, ', '.join(keys)))
    if s is not None and s not in SIZES:
        raise GenError('--only: taglia sconosciuta %r (attese: %s)' % (s, ', '.join(SIZES)))
    if p is not None and p not in PLATFORMS:
        raise GenError('--only: piattaforma sconosciuta %r (attese: %s)' % (p, ', '.join(PLATFORMS)))
    return (f, s, p)


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog='gen_digits.py',
        description='Genera le strip PNG delle cifre e src/c/digit_metrics.h per Galleria (S3).',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Interprete con freetype-py e Pillow: ~/.local/share/uv/tools/pebble-tool/bin/python")
    ap.add_argument('--fonts-dir', default='apps/galleria/resources/fonts', metavar='DIR',
                    help='cartella dei TTF (default: %(default)s)')
    ap.add_argument('--out', default='apps/galleria/resources/digits', metavar='DIR',
                    help='cartella delle strip PNG (default: %(default)s)')
    ap.add_argument('--header', default='apps/galleria/src/c/digit_metrics.h', metavar='FILE',
                    help='header generato (default: %(default)s)')
    ap.add_argument('--preview', metavar='DIR',
                    help='scrive DIR/%s (foglio di contatto ×2 su fondo grigio)' % PREVIEW_NAME)
    ap.add_argument('--only', metavar='FONT,TAGLIA,PIATT',
                    help="limita la generazione (es. 'barlow,a,color'; campi vuoti = tutti)")
    ap.add_argument('--check', action='store_true',
                    help='stampa solo la tabella delle metriche, non scrive nulla')
    ap.add_argument('--no-colon-b', action='store_true', dest='no_colon_b',
                    help="la taglia B viene generata senza la cella del ':' (10 celle invece di 11, "
                         "strip_w = 10*cell_w senza --pack): il layout B non disegna i due punti. "
                         "Nell'header la voce del ':' della taglia B diventa { 0, 0 }. La taglia A "
                         'non cambia.')
    ap.add_argument('--pack', action='store_true',
                    help='strip COMPATTA: i glifi vengono accostati (ink[k].x = offset progressivo) e '
                         'strip_w = somma degli inchiostri arrotondata a un multiplo di 4 px, invece '
                         "delle celle fisse da cell_w. Stessi pixel di inchiostro, stessa px e stesso "
                         'digit_h; cell_w resta il passo della griglia del layout. Meno pbpack e meno heap')
    ap.add_argument('--fit-width', action='store_true',
                    help="se un glifo non entra nella sua cella (quella della strip, o quella del ':' "
                         'nel layout A) abbassa la px invece di uscire con errore '
                         '(perde altezza: viene segnalato)')
    args = ap.parse_args(argv)

    only_f, only_s, only_p = parse_only(args.only)

    faces = {}
    strips = []
    for font in FONTS:
        if only_f is not None and font['key'] != only_f:
            continue
        path = os.path.join(args.fonts_dir, font['file'])
        if not os.path.isfile(path):
            raise GenError('font mancante: %s' % path)
        faces[font['key']] = freetype.Face(path)
        for platform in PLATFORMS:
            if only_p is not None and platform != only_p:
                continue
            for size in SIZES:
                if only_s is not None and size != only_s:
                    continue
                strips.append(build_strip(faces[font['key']], font, size, platform,
                                          args.fit_width, args.no_colon_b, args.pack))

    if not strips:
        raise GenError('--only non ha selezionato nulla')

    # ordine di stampa: font, piattaforma, taglia (deterministico)
    print_table(strips)
    print('')
    print_notes(strips)

    failed = [st for st in strips if st.errors]
    if failed:
        print('')
        print('ERRORE: %d combinazioni su %d non entrano nella cella; con --fit-width il tool '
              'abbassa la pixel size invece di fermarsi.' % (len(failed), len(strips)))
        return 1

    if args.check:
        print('')
        print('--check: nessun file scritto (%d strip verificate).' % len(strips))
        return 0

    if not os.path.isdir(args.out):
        os.makedirs(args.out)
    written = [write_png(st, args.out) for st in strips]

    header_txt = (emit_header(strips, args.fit_width, args.no_colon_b, args.pack)
                  if len(strips) == len(FONTS) * 4 else None)
    if header_txt is None:
        print('')
        print('NOTA: header non scritto (--only ha selezionato %d strip su %d).'
              % (len(strips), len(FONTS) * 4))
    else:
        with open(args.header, 'w', encoding='utf-8') as fh:
            fh.write(header_txt)
        written.append(args.header)

    if args.preview:
        if not os.path.isdir(args.preview):
            os.makedirs(args.preview)
        written.append(write_preview(strips, args.preview))

    print('')
    for p in written:
        print('scritto  %s (%d B)' % (p, os.path.getsize(p)))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except GenError as exc:
        sys.stderr.write('gen_digits.py: %s\n' % exc)
        sys.exit(1)

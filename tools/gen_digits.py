#!/usr/bin/env python3
r"""gen_digits.py — v2 (S8-stile): cifre grandi come sprite per la watchface Galleria.

Da TTF a "strip" PNG: per ogni (font, taglia, piattaforma) un PNG con i glifi '0'..'9' poi ':'
(con --no-colon-b la sola taglia B ha 10 glifi: il layout B non disegna mai i due punti, e
nell'header ink[10] = { 0, 0 }). Il PNG è RGBA con SOLO quattro colori (D20):

    (0,   0,   0,   0)    trasparente        -> indice "vuoto"
    (255, 255, 255, 255)  riempimento        -> palette[i] = colore del testo (o GColorClear)
    (0,   0,   0,   255)  anello, spesso R   -> palette[i] = alone / colore del testo
    (255, 0,   0,   255)  ombra 3D, prof. S  -> palette[i] = colore opposto (o GColorClear)

Su flint (~bw) i colori sono TRE, non quattro: S = 0, nessun pixel d'ombra (D26). La SDK
riduce ogni pixel delle piattaforme B/N con nearest_color_to_pebble2_palette (luma -> 0/255,
alpha -> 0/255), quindi in un .pbi ~bw esistono solo 0x00, 0xC0 e 0xFF: il rosso diventerebbe
nero e si fonderebbe con l'anello (ombra e anello nello STESSO indice, indistinguibili a
runtime). Verificato in emulatore il 04/09/2026; sull'orologio gli stili 3D valgono come i
corrispondenti stili piatti.

Restano quindi 2 bit per pixel (`memoryFormat: "2BitPalette"`): un solo blit per glifo, e i
quattro stili di D21 (0 Pieno, 1 Trasparente, 2 Trasparente 3D, 3 Pieno 3D) si ottengono a
runtime cambiando tre voci di palette. ui_digits.c riconosce gli indici dal COLORE (0xFF
riempimento, 0xC0 anello, 0xF0 ombra), non dalla posizione: l'SDK ordina la palette del .pbi
come vuole.

Geometria per (piattaforma, taglia) — GEOM: (cell_w, rows_h, R, S)

    emery (~color)  A (40, 66, 2, 2)   B (64, 94, 2, 2)
    flint (~bw)     A (28, 42, 1, 0)   B (48, 62, 1, 0)      <- S = 0: D26

    strip_h = rows_h + 2R + S     ->  emery A 72, B 100;  flint A 44, B 64

`rows_h` sono le righe disponibili al RIEMPIMENTO (gli stessi valori della v1, dove valevano
strip_h - 2): il riempimento occupa le righe R .. R + digit_h - 1, sopra restano R righe per
l'anello, sotto R righe di anello più S righe di ombra.

Costruzione dei tre strati (per glifo, dentro la sua cella di lavoro):

  riempimento  bitmap monocromatica FreeType (FT_LOAD_RENDER | TARGET_MONO | MONOCHROME)
  anello       pixel a distanza di Chebyshev 1..R dal riempimento (R dilatazioni 8-connesse),
               meno il riempimento
  ombra        unione degli spostamenti diagonali (+k, +k), k = 1..S, di (riempimento ∪ anello),
               meno (riempimento ∪ anello); su flint S = 0, quindi lo strato non esiste (D26)

Scelta della pixel size (INVARIATA rispetto alla v1 — D24): la PIÙ GRANDE px per cui
max(altezza dell'inchiostro delle cifre '0'..'9') <= rows_h; con --fit-width si aggiunge il
vincolo orizzontale "riempimento + 2 <= cell_w" e, nella sola taglia A, "':' + 2 <= colon_cell"
(16 su emery, 12 su flint). I due vincoli di larghezza guardano il RIEMPIMENTO, non
riempimento + 2R + S: anello e ombra possono sporgere dal passo della cella, perché
ui_time.c (prv_place_row) allarga il passo a max(passo, riempimento + R) (D25). Così i pixel del
riempimento di Anton/Bebas/Barlow restano identici a quelli della v1 (stessa px, stesso
digit_h, stesse larghezze del riempimento).

`digit_h` nell'header è l'altezza REALE del riempimento delle cifre, che occupano le righe
R .. R + digit_h - 1 della strip: di norma rows_h, meno quando --fit-width abbassa la px.
È il valore con cui ui_time.c allinea la base di AM/PM al fondo delle cifre.

Baseline comune: baseline_row = R + max(bitmap_top delle cifre); ogni glifo va a
y0 = baseline_row - bitmap_top, quindi la cifra più alta parte dalla riga R. Il ':' resta dove
lo mette il font rispetto alla baseline; se il suo anello+ombra uscirebbe dalla strip viene
alzato (o abbassato) del minimo necessario e la cosa viene segnalata.

Orizzontale: ogni glifo si disegna in una CELLA DI LAVORO larga cell_w + 2R + S + 2, con il
riempimento centrato nella sottocella da cell_w: restano almeno R+2 colonne libere a sinistra e
R+S+2 a destra, così anello e ombra non vengono mai tagliati (se lo fossero è un ERRORE, non un
avviso). Con --pack le celle di lavoro spariscono: i glifi vengono ricompattati adiacenti.

--pack (comando canonico di Galleria): dopo il disegno la strip viene RICOMPATTATA. I glifi
vengono copiati adiacenti da sinistra a destra nello stesso ordine, ink[k].x diventa l'offset
progressivo e

    strip_w = somma delle larghezze degli inchiostri, arrotondata per eccesso a un multiplo di 4

(le colonne in coda restano trasparenti: 4 px = 1 byte esatto a 2 bit/px, così lo stride del PBI
resta a byte interi). ink[k].x/ink[k].w sono le colonne con almeno un pixel non trasparente,
cioè riempimento ∪ anello ∪ ombra. Nell'header **cell_w resta il passo del LAYOUT** (40/64 su
emery, 28/48 su flint), che ui_time.c confronta con la griglia della watchface.

Controlli (errore = uscita 1):
  - riga peggiore del layout A come la calcola ui_time.c:prv_place_row (D25 rivista nella
    revisione S8-stile: ogni glifo occupa max(passo, NUCLEO + gap) con gap 2, 1, 0 px fra gli anelli provati in ordine (prv_place_row_fit) e, in riserva, max(passo, RIEMPIMENTO + R), con riempimento =
    ink.w - 2R - S = ui_digits_fill_width, NON l'inchiostro intero - il +R serve perche' l'anello
    del glifo successivo non tocchi mai il riempimento del precedente; passo cifre = cell_w in
    24 h, cell_w - 2 in 12 h; passo ':' = colon_cell): 24 h "20:44" <= larghezza schermo, 12 h
    "10:44" + 4 + "PM" e 12 h "09:44" + 4 + "PM" (con lo zero iniziale il primo glifo e' uno '0'
    largo, non l'1) <= larghezza schermo, con "PM" = 18 px su entrambe le piattaforme;
  - taglia B: 2 x max(passo, riempimento + R) + gap 8 <= larghezza schermo;
  - anello o ombra tagliati dalla cella di lavoro / dalla strip;
  - glifo più largo della sua cella senza --fit-width; PNG con più di 4 colori (autocontrollo
    prima di scrivere).
AVVISO (non errore) se i PIXEL del blocco centrato escono dallo schermo: le righe vengono
rifatte come le disegna ui_digits_draw (gx = x + (passo - nucleo)/2, nucleo = ink - ombra) e si
misurano i margini a sinistra e a destra; un margine negativo significa qualche pixel di anello
o ombra tagliato dal layer al bordo.
Con --allow-row-overflow il solo controllo di riga scende ad AVVISO (la riga verrà tagliata a
destra da ui_time.c, che porta x0 a 0): serve solo per esplorare geometrie fuori contratto.

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
import collections
import os
import sys

import freetype
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------- costanti ---

TOOL_VERSION = 'v2'          # citata nell'header al posto della data (output riproducibile)

GLYPHS = '0123456789:'       # ordine dei glifi nella strip (e dell'array ink[] dell'header)
NGLYPHS = len(GLYPHS)        # 11 (= DIGITS_GLYPHS)
DIGITS = '0123456789'
COLON = ':'

# Tabella DATA-DRIVEN dei font con una strip: aggiungere una voce = una riga (l'header segue con
# DIGITS_FONT_COUNT = len(FONTS)). L'indice qui è l'INDICE DI STRIP, non il valore
# dell'impostazione `font` (D22: 3 = LECO, font di sistema, non ha strip).
FONTS = (
    {'key': 'anton',  'name': 'Anton',                  'res': 'ANTON',  'file': 'Anton-Regular.ttf'},
    {'key': 'bebas',  'name': 'Bebas Neue',             'res': 'BEBAS',  'file': 'BebasNeue-Regular.ttf'},
    {'key': 'barlow', 'name': 'Barlow Condensed Bold',  'res': 'BARLOW', 'file': 'BarlowCondensed-Bold.ttf'},
    {'key': 'francois',    'name': 'Francois One',       'res': 'FRANCOIS',    'file': 'FrancoisOne-Regular.ttf'},
    {'key': 'staatliches', 'name': 'Staatliches',        'res': 'STAATLICHES', 'file': 'Staatliches-Regular.ttf'},
)

SIZES = ('a', 'b')                  # taglia 0 = A, 1 = B
PLATFORMS = ('color', 'bw')         # tag risorsa: ~color = emery, ~bw = flint
PLATFORM_NAME = {'color': 'emery', 'bw': 'flint'}

# (cell_w, rows_h, R = spessore dell'anello, S = profondità dell'ombra) per (piattaforma, taglia).
# strip_h = rows_h + 2R + S; rows_h sono le righe disponibili al RIEMPIMENTO.
# D26: su flint S = 0 (niente ombra), perché nel .pbi ~bw la SDK quantizza il rosso a nero e lo
# fonde con l'anello: strip a 3 colori e strip_h 44/64 come nella v1.
GEOM = {
    ('color', 'a'): (40, 66, 2, 2),
    ('color', 'b'): (64, 94, 2, 2),
    ('bw',    'a'): (28, 42, 1, 0),
    ('bw',    'b'): (48, 62, 1, 0),
}

# Griglia reale del layout A (design §3.1/§3.3, ui_time.c): 24 h = celle piene; in 12 h si
# stringono di AMPM_SHRINK = 2 px SOLO le celle delle cifre, il ':' tiene la sua cella piena
# (ui_time.c: `colon = s_lay.a_colon`, senza shrink) perché a 14/10 px non ci starebbe.
#   emery A  24 h 40|40|16|40|40      12 h 38|38|16|38|38
#   flint A  24 h 28|28|12|28|28      12 h 26|26|12|26|26
COLON_CELL = {('color', 'a'): 16, ('bw', 'a'): 12}
AMPM_SHRINK = 2              # ui_time.c
AMPM_GAP = 4                 # ui_time.c: spazio fra le cifre e "PM"
AMPM_W = {'color': 18, 'bw': 18}      # larghezza di "PM" in Gothic 14 Bold (stesso font sulle due piattaforme,
                                      # ui_time.c; 18 px misurati sugli screenshot del gate S8-stile; design §3.1)
SCREEN_W = {'color': 200, 'bw': 144}  # larghezza dello schermo
B_GAP = 8                    # ui_time.c: s_lay.b_gap (taglia B, due glifi per riga)
ROW_24H = '20:44'            # riga peggiore in 24 h (§3.4)
ROW_12H = '10:44'            # riga peggiore in 12 h (§3.4), poi + AMPM_GAP + "PM"
ROW_12H_LZ = '09:44'         # 12 h con zero iniziale (GAL_LZ_ON): il primo glifo è uno '0' largo, non l'1 (revisione S8-stile)
RING_GAPS = (2, 1, 0, None)  # ui_time.c prv_place_row_fit: spazio minimo fra gli anelli provato in ordine; None = riserva
                             # max(passo, riempimento + R) — l'unica che il controllo di riga deve garantire (05/09).
                             # Griglia UNIFORME (D3/S3): il passo delle cifre è quello della cifra PIÙ LARGA del font.
FIT_MARGIN = 2               # ui_time.c: px liberi per lato richiesti ai tentativi con gap (non alla riserva)

PX_MAX = 400                 # limite della ricerca lineare della pixel size
PX_FIELD_MAX = 255           # il campo `px` di digit_metrics.h è uint8_t

FT_FLAGS = (freetype.FT_LOAD_RENDER
            | freetype.FT_LOAD_TARGET_MONO
            | freetype.FT_LOAD_MONOCHROME)

# valori nella mappa della strip (D20)
EMPTY, FILL, RING, SHADOW = 0, 1, 2, 3
RGBA = {
    EMPTY:  (0, 0, 0, 0),
    FILL:   (255, 255, 255, 255),
    RING:   (0, 0, 0, 255),
    SHADOW: (255, 0, 0, 255),
}
LAYER_NAME = {FILL: 'riempimento', RING: 'anello', SHADOW: 'ombra'}

PREVIEW_BG = (96, 96, 96)             # grigio medio: mostra sia il bianco sia il nero
PREVIEW_LABEL = (235, 235, 235)
PREVIEW_NAME = 'digits_preview.png'
PREVIEW_WHITE = (255, 255, 255)
PREVIEW_BLACK = (0, 0, 0)
# I quattro stili di D21: (nome, colore del riempimento, colore dell'anello, colore dell'ombra);
# None = trasparente (GColorClear). Testo bianco, colore opposto nero.
PREVIEW_STYLES = (
    ('0 pieno',          PREVIEW_WHITE, PREVIEW_BLACK, None),
    ('3 pieno 3D',       PREVIEW_WHITE, PREVIEW_BLACK, PREVIEW_BLACK),
    ('1 trasparente',    None,          PREVIEW_WHITE, None),
    ('2 trasparente 3D', None,          PREVIEW_WHITE, PREVIEW_BLACK),
)

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

    Vincolo di altezza (sempre): max(h delle cifre) <= rows_h (righe del RIEMPIMENTO).
    Vincoli di larghezza (solo con fit_width), invariati dalla v1 — D24: misurano il
    RIEMPIMENTO, non riempimento + 2R + S, perché anello e ombra possono sporgere dal passo
    della cella (prv_place_row allarga il passo a max(passo, riempimento + R), D25):
      - max(w dei glifi generati) + 2 <= cell_w  (il passo del layout);
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


# --------------------------------------------------- anello e ombra (D20) ---

def ring_pixels(fill, r):
    """Pixel a distanza di Chebyshev 1..r da `fill` (set di (x, y)), riempimento escluso.

    r dilatazioni 8-connesse successive: il risultato è un anello spesso ESATTAMENTE r px
    (dove il glifo è libero, cioè dove non incontra il riempimento di un tratto vicino).
    Nessun ritaglio: chi chiama controlla i limiti e segnala un errore se qualcosa esce.
    """
    cur = set(fill)
    ring = set()
    frontier = set(fill)
    for _ in range(r):
        nxt = set()
        for (x, y) in frontier:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    p = (x + dx, y + dy)
                    if p not in cur:
                        nxt.add(p)
        cur |= nxt
        ring |= nxt
        frontier = nxt
    return ring


def shadow_pixels(body, s):
    """Ombra 3D: unione degli spostamenti (+k, +k) per k = 1..s di `body`, meno `body`."""
    out = set()
    for k in range(1, s + 1):
        for (x, y) in body:
            out.add((x + k, y + k))
    return out - body


# --------------------------------------------------------------- strip ---

class Strip(object):
    """Una strip generata: mappa dei pixel + metriche + segnalazioni."""

    __slots__ = ('font', 'size', 'platform', 'cell_w', 'strip_w', 'strip_h', 'digit_h',
                 'rows_h', 'ring', 'shadow', 'work_w', 'px', 'ink_h', 'buf', 'ink_x', 'ink_w',
                 'chars', 'ncells', 'packed', 'ink_sum', 'pad', 'rows', 'notes', 'warnings',
                 'errors')

    def __init__(self, font, size, platform):
        self.font = font
        self.size = size
        self.platform = platform
        self.packed = False
        self.ink_sum = 0
        self.pad = 0
        self.rows = []              # [Row]: righe controllate dal §3.4
        self.notes = []
        self.warnings = []
        self.errors = []

    def fail(self):
        """Metriche vuote dopo un errore: la strip non viene disegnata."""
        self.ink_x = [0] * NGLYPHS
        self.ink_w = [0] * NGLYPHS
        self.buf = None
        return self


def pack_strip(st):
    """Ricompatta la strip: glifi adiacenti, strip_w = somma degli inchiostri a multiplo di 4.

    Le colonne di inchiostro vengono copiate tali e quali dalle celle di lavoro (stessi pixel,
    stessa altezza, stessa riga di baseline): cambia solo lo spazio vuoto fra i glifi, che
    sparisce. ink[k].x diventa l'offset progressivo; cell_w NON cambia, perché nell'header è il
    passo della griglia del layout (ui_time.c lo confronta con a_cell/b_cell) e non la larghezza
    della cella nel PNG. Le colonne di coda (0..3) restano trasparenti e servono solo a tenere lo
    stride del PBI a 2 bit su byte interi (4 px = 1 byte).
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


# Una riga controllata dal §3.4: larghezza secondo D25, la stessa con l'inchiostro intero
# (diagnostica) e i due margini in px fra i PIXEL disegnati e i bordi dello schermo.
Row = collections.namedtuple('Row', 'label w limit ink left right')


def cdiv(a, b):
    """Divisione intera del C (troncamento verso lo zero): ui_time.c e ui_digits.c centrano
    con `/ 2` su int16_t, e con un numeratore negativo Python arrotonderebbe verso il basso."""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b >= 0) else -q


def fill_width(st, k):
    """Larghezza del RIEMPIMENTO del glifo k, esattamente come ui_digits.c:ui_digits_fill_width.

    ink[k].w comprende anello (R colonne per lato) e ombra (S colonne a destra): il riempimento
    è ink - 2R - S, con lo stesso clamp a 1 px del C. Glifo assente (w == 0) -> 0.
    """
    w = st.ink_w[k]
    if w <= 0:
        return 0
    f = w - 2 * st.ring - st.shadow
    return 1 if f < 1 else f


def grid_steps(st, digit_cell, colon_cell, ring_gap=None):
    """Passi UNIFORMI della griglia come ui_time.c:prv_grid_steps: cifre = max(cella, nucleo della cifra
    più larga + ring_gap) e ':' = max(cella del ':', nucleo del ':' + ring_gap), con nucleo = riempimento
    + 2R; ring_gap None = riserva max(cella, riempimento più largo + R)."""
    fills = [fill_width(st, k) for k in range(10)]
    max_fill = max(fills) if fills else 0
    colon_fill = fill_width(st, GLYPHS.index(COLON)) if st.ncells > 10 else 0
    adv_d, adv_c = digit_cell, colon_cell

    def need(f):
        return f + 2 * st.ring + ring_gap if ring_gap is not None else f + st.ring
    if max_fill > 0 and need(max_fill) > adv_d:
        adv_d = need(max_fill)
    if colon_fill > 0 and need(colon_fill) > adv_c:
        adv_c = need(colon_fill)
    return adv_d, adv_c


def place_row(st, text, digit_cell, colon_cell, gap=0, ring_gap=None):
    """Rifà ui_time.c:prv_place_row con i passi uniformi di grid_steps: [(glifo, x, passo)] con x da 0,
    e la larghezza della riga. D25 (terza versione, 05/09): griglia fissa per font/taglia, così le cifre
    non si spostano al cambio di minuto; lo spazio fra gli anelli (ring_gap) o la riserva (None).
    """
    adv_d, adv_c = grid_steps(st, digit_cell, colon_cell, ring_gap)
    out = []
    x = 0
    for ch in text:
        k = GLYPHS.index(ch)
        adv = adv_c if ch == COLON else adv_d
        out.append((k, x, adv))
        x += adv + gap
    return out, (x - gap if out else 0)


def place_row_fit(st, text, digit_cell, colon_cell, gap, extra, max_w):
    """Come ui_time.c:prv_place_row_fit: prova RING_GAPS in ordine e tiene la prima riga per cui
    total + extra <= max_w; l'ultima (riserva) viene restituita anche se sfora (errore a valle).
    Ritorna (placed, total, ring_gap_scelto)."""
    placed, total, rg = None, 0, None
    for rg in RING_GAPS:
        placed, total = place_row(st, text, digit_cell, colon_cell, gap, rg)
        if rg is None or total + extra <= max_w - 2 * FIT_MARGIN:
            break
    return placed, total, rg


def row_width(st, text, digit_cell, colon_cell, gap=0):
    """Larghezza della riga `text` con il passo di prv_place_row (D25)."""
    return place_row(st, text, digit_cell, colon_cell, gap)[1]


def row_ink_width(st, text, digit_cell, colon_cell, gap=0):
    """Diagnostica: la stessa riga se l'anticipo guardasse l'INCHIESTRO intero (anello e ombra
    compresi) invece del riempimento. È il numero fra parentesi nella tabella."""
    total = 0
    for ch in text:
        k = GLYPHS.index(ch)
        adv = colon_cell if ch == COLON else digit_cell
        total += max(adv, st.ink_w[k]) + gap
    return total - gap if text else 0


def row_extents(st, placed, x0):
    """Prima e ultima COLONNA di pixel della riga, come le disegna ui_digits.c:ui_digits_draw:
    gx = x + (passo - nucleo) / 2 con nucleo = ink - ombra (il riempimento resta centrato nel
    passo e l'ombra sporge a destra), poi il glifo occupa ink colonne."""
    lo = hi = None
    for (k, x, adv) in placed:
        w = st.ink_w[k]
        if w <= 0:
            continue                      # glifo assente dalla strip: ui_digits_draw non disegna
        core = w - st.shadow
        if core < 1:
            core = w
        gx = x0 + x + cdiv(adv - core, 2)
        if lo is None or gx < lo:
            lo = gx
        if hi is None or gx + w - 1 > hi:
            hi = gx + w - 1
    return lo, hi


def check_rows(st, allow_overflow):
    """Controlli di riga §3.4: riempie st.rows, con errore se una riga non entra nello schermo
    e AVVISO se i pixel del blocco centrato ne escono (anello/ombra tagliati dal layer).

    Le righe sono quelle peggiori del contratto: taglia A 24 h "20:44" e 12 h "10:44" + gap +
    "PM"; taglia B tutte le coppie di cifre (il layout ne disegna due per riga), da cui si
    prendono la larghezza massima e i margini minimi.
    """
    screen = SCREEN_W[st.platform]
    colon_cell = COLON_CELL.get((st.platform, st.size))
    st.rows = []
    if colon_cell is not None:                       # taglia A: riga unica "HH:MM" (+ AM/PM)
        ampm_w = AMPM_GAP + AMPM_W[st.platform]
        rows = (('24 h "%s"' % ROW_24H, ROW_24H, st.cell_w, 0),
                ('12 h "%s"+%d+PM' % (ROW_12H, AMPM_GAP), ROW_12H, st.cell_w - AMPM_SHRINK,
                 ampm_w),
                ('12 h "%s"+%d+PM' % (ROW_12H_LZ, AMPM_GAP), ROW_12H_LZ, st.cell_w - AMPM_SHRINK,
                 ampm_w))
        for label, text, cell, extra in rows:
            placed, total, rg = place_row_fit(st, text, cell, colon_cell, 0, extra, screen)
            label += ' [gap %s]' % ('riserva' if rg is None else rg)
            block = total + extra
            x0 = cdiv(screen - block, 2)             # ui_time.c: x0 = (w - block) / 2, mai < 0
            if x0 < 0:
                x0 = 0
            lo, hi = row_extents(st, placed, x0)
            if extra:                                # "PM": testo, nessuna sporgenza sua
                hi = max(hi, x0 + total + AMPM_GAP + AMPM_W[st.platform] - 1)
            ink = row_ink_width(st, text, cell, colon_cell) + extra
            st.rows.append(Row(label, block, screen, ink, lo, screen - 1 - hi))
    else:                                            # taglia B: due glifi per riga, gap B_GAP
        wide = ink = 0
        left = right = None
        for a in DIGITS:
            for b in DIGITS:
                placed, total, _rg = place_row_fit(st, a + b, st.cell_w, st.cell_w, B_GAP, 0, screen)
                x0 = cdiv(screen - total, 2)         # ui_time.c: prv_shift_row((w - riga) / 2)
                lo, hi = row_extents(st, placed, x0)
                wide = max(wide, total)
                ink = max(ink, row_ink_width(st, a + b, st.cell_w, st.cell_w, B_GAP))
                left = lo if left is None else min(left, lo)
                right = (screen - 1 - hi) if right is None else min(right, screen - 1 - hi)
        st.rows.append(Row('B 2 glifi + gap %d' % B_GAP, wide, screen, ink, left, right))
    for r in st.rows:
        if r.w > r.limit:
            msg = ("riga %s larga %d px > %d (schermo %s); con l'inchiostro intero (anello e "
                   'ombra compresi) sarebbe %d px'
                   % (r.label, r.w, r.limit, PLATFORM_NAME[st.platform], r.ink))
            if allow_overflow:
                st.warnings.append(msg + ' [--allow-row-overflow]')
            else:
                st.errors.append(msg)
        elif r.left < 0 or r.right < 0:               # §3.4: sporgenza = avviso, non errore
            st.warnings.append('riga %s: i pixel del blocco centrato escono dallo schermo '
                               '(margini %d px a sinistra, %d a destra): anello/ombra tagliati '
                               'dal layer al bordo' % (r.label, r.left, r.right))


def check_buf_colors(st):
    """Autocontrollo: nella mappa della strip ci sono solo i valori di D20 (tre dove S = 0)."""
    seen = set(st.buf)
    extra = seen - set(RGBA)
    if extra:
        st.errors.append('valori inattesi nella mappa della strip: %s'
                         % ', '.join(str(v) for v in sorted(extra)))
    if len(seen) > len(RGBA):
        st.errors.append('più di %d colori nella strip (%d)' % (len(RGBA), len(seen)))
    if st.shadow == 0 and SHADOW in seen:            # D26: ~bw senza ombra
        st.errors.append("pixel d'ombra con S = 0 (la piattaforma non ha il quarto colore)")


def build_strip(face, font, size, platform, fit_width, no_colon_b=False, pack=False,
                allow_row_overflow=False):
    """Costruisce la strip (font = dict di FONTS).

    Con no_colon_b la taglia B salta il ':' (10 glifi invece di 11): il layout B non lo disegna
    mai. Con pack i glifi vengono poi accostati (vedi pack_strip): stessi pixel, senza lo spazio
    vuoto delle celle di lavoro.
    """
    cell_w, rows_h, ring, shadow = GEOM[(platform, size)]
    strip_h = rows_h + 2 * ring + shadow
    work_w = cell_w + 2 * ring + shadow + 2     # cella di LAVORO: anello e ombra non si tagliano
    st = Strip(font, size, platform)
    st.chars = DIGITS if (size == 'b' and no_colon_b) else GLYPHS
    st.ncells = len(st.chars)
    st.cell_w = cell_w
    st.work_w = work_w
    st.strip_w = st.ncells * work_w
    st.strip_h = strip_h
    st.rows_h = rows_h
    st.ring = ring
    st.shadow = shadow

    colon_cell = COLON_CELL.get((platform, size))    # solo la taglia A ha una cella per il ':'
    px, glyphs = pick_px(face, cell_w, rows_h, fit_width, colon_cell, st.chars)
    if px > PX_FIELD_MAX:
        raise GenError('pixel size %d fuori dal campo uint8_t di digit_metrics.h (max %d): '
                       '%s %s %s' % (px, PX_FIELD_MAX, font['key'], PLATFORM_NAME[platform],
                                     size.upper()))
    st.px = px
    st.ink_h = max(glyphs[c].h for c in DIGITS)
    st.digit_h = st.ink_h
    if st.ink_h < rows_h:
        st.notes.append('altezza ottenuta %d px su %d disponibili (%+d): digit_h = %d'
                        % (st.ink_h, rows_h, st.ink_h - rows_h, st.ink_h))

    # larghezza: il RIEMPIMENTO deve stare nel passo della cella con 1 px libero per lato (D24)
    for ch in st.chars:
        if glyphs[ch].w + 2 > cell_w:
            st.errors.append("glifo '%s' largo %d px: %d + 2 > cell_w %d"
                             % (ch, glyphs[ch].w, glyphs[ch].w, cell_w))
    if st.errors:
        return st.fail()

    # baseline comune, presa dalle sole cifre: la cifra più alta parte dalla riga `ring`
    baseline_row = ring + max(glyphs[c].top for c in DIGITS)
    top_limit = ring                          # prima riga utile al riempimento
    bot_limit = strip_h - 1 - ring - shadow   # ultima riga utile al riempimento

    placed = []                               # (glifo, x0 assoluto, y0)
    for k, ch in enumerate(st.chars):
        g = glyphs[ch]
        x0 = k * work_w + ring + 1 + (cell_w - (g.w + 2)) // 2 + 1
        y0 = baseline_row - g.top
        if ch == COLON:
            # il ':' deve stare nella strip con anello e ombra: alzalo/abbassalo del minimo
            lo, hi = top_limit, bot_limit - g.h + 1
            if y0 > hi:
                st.notes.append("':' alzato di %d px per entrare nella strip" % (y0 - hi))
                y0 = hi
            elif y0 < lo:
                st.notes.append("':' abbassato di %d px per entrare nella strip" % (lo - y0))
                y0 = lo
        if y0 < top_limit or y0 + g.h - 1 > bot_limit:
            st.errors.append("glifo '%s' fuori dalla strip: righe %d..%d su %d..%d"
                             % (ch, y0, y0 + g.h - 1, top_limit, bot_limit))
        placed.append((g, x0, y0))
    if st.errors:
        return st.fail()

    # digit_h deve essere il fondo reale del riempimento delle cifre (righe ring..ring+digit_h-1):
    # con una cifra che scende sotto la baseline max(h) non basterebbe.
    bottom = max(y0 + g.h - 1 for g, x0, y0 in placed[:10]) - ring + 1
    if bottom != st.digit_h:
        st.digit_h = bottom
        st.notes.append('fondo del riempimento alla riga %d: digit_h = %d'
                        % (ring + bottom - 1, bottom))

    # ---- disegno: riempimento, anello (R), ombra (S), un glifo per volta nella sua cella ----
    buf = bytearray(st.strip_w * strip_h)
    clipped = []
    st.ink_x = []
    st.ink_w = []
    for k, (g, x0, y0) in enumerate(placed):
        cx0 = k * work_w
        fill = set()
        for y in range(g.h):
            row = g.rows[y]
            for x in range(g.w):
                if row[x]:
                    fill.add((x0 - cx0 + x, y0 + y))
        rng = ring_pixels(fill, ring)
        body = fill | rng
        shd = shadow_pixels(body, shadow)
        for layer, pixels in ((RING, rng), (SHADOW, shd)):
            out = [p for p in pixels if not (0 <= p[0] < work_w and 0 <= p[1] < strip_h)]
            if out:
                clipped.append((st.chars[k], LAYER_NAME[layer], len(out)))
        for value, pixels in ((FILL, fill), (RING, rng), (SHADOW, shd)):
            for (x, y) in pixels:
                if 0 <= x < work_w and 0 <= y < strip_h:
                    buf[y * st.strip_w + cx0 + x] = value
        # inchiostro = colonne con almeno un pixel non trasparente (riempimento ∪ anello ∪ ombra)
        cols = sorted(set(x for (x, y) in (fill | rng | shd)
                          if 0 <= x < work_w and 0 <= y < strip_h))
        if not cols:
            st.errors.append("glifo '%s' vuoto nella strip" % st.chars[k])
            cols = [0]
        st.ink_x.append(cx0 + cols[0])
        st.ink_w.append(cols[-1] - cols[0] + 1)
    if clipped:
        st.errors.append('anello/ombra tagliati dalla cella di lavoro: %s'
                         % ' '.join("'%s' %s %d px" % c for c in clipped))
    st.buf = buf
    # l'array ink[] dell'header ha sempre DIGITS_GLYPHS voci: il ':' assente vale { 0, 0 }
    # (ui_digits.c salta i glifi con w == 0: nessuna sub-bitmap, glyph[g] = NULL).
    while len(st.ink_x) < NGLYPHS:
        st.ink_x.append(0)
        st.ink_w.append(0)
    check_buf_colors(st)
    if st.errors:
        return st.fail()

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

    # righe peggiori (§3.4): guardano solo le LARGHEZZE degli inchiostri, che pack non tocca
    check_rows(st, allow_row_overflow)

    st.ink_sum = sum(st.ink_w[:st.ncells])
    if pack:
        pack_strip(st)          # il risparmio finisce nella tabella e nel commento della voce,
                                # non nelle segnalazioni: non è un problema da leggere
    return st


# ----------------------------------------------------------------- PNG ---

def strip_image(st):
    """Immagine RGBA della strip (4 colori esatti, D20)."""
    img = Image.new('RGBA', (st.strip_w, st.strip_h), RGBA[EMPTY])
    px = img.load()
    for y in range(st.strip_h):
        base = y * st.strip_w
        for x in range(st.strip_w):
            v = st.buf[base + x]
            if v:
                px[x, y] = RGBA[v]
    return img


def check_image(st, img):
    """Autocontrollo prima di scrivere: dimensioni uguali all'header e nessun colore fuori dai
    quattro di D20 (su flint sono tre: S = 0, nessun pixel d'ombra — D26)."""
    if img.size != (st.strip_w, st.strip_h):
        raise GenError('PNG %dx%d diverso dall\'header %dx%d (%s %s %s)'
                       % (img.size[0], img.size[1], st.strip_w, st.strip_h,
                          st.font['key'], PLATFORM_NAME[st.platform], st.size.upper()))
    counted = img.getcolors(maxcolors=64)
    if counted is None:
        raise GenError('PNG con più di 64 colori (%s %s %s): attesi i 4 di D20 (3 se S = 0)'
                       % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper()))
    found = set(c for _, c in counted)
    allowed = set(RGBA.values())
    if len(found) > len(RGBA) or not found <= allowed:
        raise GenError('PNG con colori fuori dai 4 di D20 (%s %s %s): %s'
                       % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper(),
                          ', '.join(str(c) for c in sorted(found - allowed) or sorted(found))))


def write_png(st, out_dir):
    name = '%s_%s~%s.png' % (st.font['key'], st.size, st.platform)
    path = os.path.join(out_dir, name)
    img = strip_image(st)
    check_image(st, img)
    img.save(path, format='PNG', optimize=False)
    return path


def style_image(st, fill_c, ring_c, shadow_c):
    """La strip resa con una palette di D21 (None = trasparente), su sfondo trasparente."""
    img = Image.new('RGBA', (st.strip_w, st.strip_h), (0, 0, 0, 0))
    px = img.load()
    colors = {FILL: fill_c, RING: ring_c, SHADOW: shadow_c}
    for y in range(st.strip_h):
        base = y * st.strip_w
        for x in range(st.strip_w):
            c = colors.get(st.buf[base + x])
            if c is not None:
                px[x, y] = (c[0], c[1], c[2], 255)
    return img


def write_preview(strips, preview_dir):
    """Foglio di contatto: per ogni strip i 4 stili di D21 su grigio medio + la strip grezza."""
    pad, gap, group_gap, label_h = 8, 3, 10, 12
    rows = len(PREVIEW_STYLES) + 1
    width = pad * 2 + max(st.strip_w for st in strips)
    height = pad * 2 + sum(label_h * rows + st.strip_h * rows + gap * (rows - 1) + group_gap
                           for st in strips) - group_gap
    sheet = Image.new('RGB', (width, height), PREVIEW_BG)
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.load_default()
    except Exception:                                        # pragma: no cover
        font = None
    y = pad
    for st in strips:
        head = ('%s %s %s  cell %d  strip %dx%d  px %d  h %d  R %d  S %d'
                % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper(),
                   st.cell_w, st.strip_w, st.strip_h, st.px, st.digit_h, st.ring, st.shadow))
        draw.text((pad, y), head, fill=PREVIEW_LABEL, font=font)
        y += label_h
        img = strip_image(st)
        sheet.paste(img, (pad, y), img)
        y += st.strip_h + gap
        for name, fc, rc, sc in PREVIEW_STYLES:
            draw.text((pad, y), name, fill=PREVIEW_LABEL, font=font)
            y += label_h
            img = style_image(st, fc, rc, sc)
            sheet.paste(img, (pad, y), img)
            y += st.strip_h + gap
        y += group_gap - gap
    path = os.path.join(preview_dir, PREVIEW_NAME)
    sheet.save(path, format='PNG', optimize=False)
    return path


# -------------------------------------------------------------- header ---

def emit_header(strips, fit_width, no_colon_b=False, pack=False, allow_row_overflow=False):
    """Testo di src/c/digit_metrics.h (nessuna data: riproducibile).

    La riga "Rigenerare con" riporta TUTTE le opzioni usate, --allow-row-overflow compreso:
    deve bastare copiarla per riottenere gli stessi byte.
    """
    by_key = {(st.font['key'], st.size, st.platform): st for st in strips}
    cmd = CANON_CMD
    if fit_width:
        cmd += ' \\\n *       --fit-width'
    opts = []
    if no_colon_b:
        opts.append('--no-colon-b')
    if pack:
        opts.append('--pack')
    if allow_row_overflow:
        opts.append('--allow-row-overflow')
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
        w(' * Strip: celle di lavoro affiancate (cell_w + 2R + S + 2). Taglia A: 11 glifi,\n')
        w(' * \'0\'..\'9\' poi \':\'. Taglia B (--no-colon-b): 10 glifi, solo \'0\'..\'9\' — il layout B\n')
        w(' * non disegna mai i due punti, quindi in B ink[DIGITS_GLYPH_COLON] = { 0, 0 }\n')
        w(' * (ui_digits.c salta i glifi con w == 0).\n')
    else:
        w(' * Strip: 11 glifi in celle di lavoro affiancate (cell_w + 2R + S + 2), \'0\'..\'9\' poi \':\'.\n')
    w(' * PNG RGBA a 4 colori esatti (D20): (0,0,0,0) trasparente, (255,255,255,255) riempimento,\n')
    w(' * (0,0,0,255) anello spesso R (dilatazione di Chebyshev di R px meno il riempimento),\n')
    w(' * (255,0,0,255) ombra 3D profonda S (spostamenti (+k,+k), k = 1..S, di riempimento ∪ anello,\n')
    w(' * meno riempimento ∪ anello). Resta 2BitPalette: gli stili di D21 cambiano solo la palette.\n')
    w(' * Su flint (~bw) i colori sono TRE: S = 0 (D26), perché nel .pbi di una piattaforma B/N il\n')
    w(' * rosso viene quantizzato a nero e si fonderebbe con l\'anello; gli stili 3D valgono come i\n')
    w(' * corrispondenti stili piatti.\n')
    w(' * Geometria (cell_w, righe del riempimento, R, S): emery A (40, 66, 2, 2), B (64, 94, 2, 2);\n')
    w(' * flint A (28, 42, 1, 0), B (48, 62, 1, 0); strip_h = righe + 2R + S (emery 72/100,\n')
    w(' * flint 44/64). Il riempimento sta nelle righe R .. R + digit_h − 1.\n')
    if pack:
        w(' * cell_w è il PASSO DELLA GRIGLIA DEL LAYOUT (ui_time.c lo confronta con a_cell/b_cell),\n')
        w(' * non la larghezza di una cella nel PNG: nella strip compatta le celle non esistono.\n')
        w(' * strip_w è nel campo di ogni voce, col commento "pack <inchiostro>+<coda>".\n')
    else:
        w(' * strip_w = glifi × (cell_w + 2R + S + 2) (vedi il campo strip_w di ogni voce);\n')
    w(' * digit_h = altezza REALE del riempimento (= righe disponibili, meno dove --fit-width ha\n')
    w(' * abbassato la px). Righe controllate dal generatore (§3.4) con il passo di ui_time.c\n')
    w(' * (prv_place_row, D25: max(passo, RIEMPIMENTO = ink − 2R − S), non l\'inchiostro intero):\n')
    w(' * 24 h "%s" e 12 h "%s" + %d + PM contro la larghezza dello schermo, più un AVVISO se i\n'
      % (ROW_24H, ROW_12H, AMPM_GAP))
    w(' * pixel del blocco centrato escono dallo schermo (anello/ombra tagliati al bordo).\n')
    if allow_row_overflow:
        w(' * Con --allow-row-overflow uno sforamento e\' solo un AVVISO (vedi sopra): la riga\n')
        w(' * viene tagliata a destra da ui_time.c, che porta x0 a 0.\n')
    w(' * File: resources/digits/<font>_<taglia>~color.png (emery) / ~bw.png (flint). */\n')
    lines = []
    for st in strips:
        tag = '%s %s %s' % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper())
        for n in st.notes:
            lines.append('NOTA   %-22s %s' % (tag, n))
        for n in st.warnings:
            lines.append('AVVISO %-22s %s' % (tag, n))
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
    w('/* righe di DIGITS_METRICS: %s (LECO non ha strip) */\n'
      % ', '.join('%d %s' % (i, f['name']) for i, f in enumerate(FONTS)))
    w('#define DIGITS_FONT_COUNT %d\n' % len(FONTS))
    w('\n')
    w('typedef struct __attribute__((packed)) { uint16_t x; uint8_t w; } DigitInk;   /* colonne con inchiostro (riempimento ∪ anello ∪ ombra); packed: 3 B (revisione S8-stile F4) */\n')
    w('typedef struct __attribute__((packed)) {\n')
    w('  uint16_t strip_w, strip_h;   /* dimensioni del PNG; strip_h = righe del riempimento + 2·ring + shadow */\n')
    if pack:
        w('  uint8_t  cell_w;             /* passo della griglia del LAYOUT (ui_time.c): la strip è compatta */\n')
    else:
        w('  uint8_t  cell_w;             /* passo della griglia del LAYOUT (le celle del PNG sono più larghe) */\n')
    w('  uint8_t  digit_h;            /* altezza reale del riempimento: righe ring .. ring + digit_h − 1 */\n')
    w('  uint8_t  ring;               /* R: spessore dell\'anello = righe libere sopra il riempimento */\n')
    w('  uint8_t  shadow;             /* S: profondità dell\'ombra (colonne/righe in più a destra e in basso) */\n')
    w('  uint8_t  px;                 /* pixel size FreeType usata (diagnostica) */\n')
    w('  DigitInk ink[DIGITS_GLYPHS]; /* \'0\'..\'9\', \':\'%s */\n'
      % (' (assente = { 0, 0 })' if no_colon_b else ''))
    w('} DigitStripMetrics;\n')
    w('\n')
    w('/* [font: %s][taglia: 0 A, 1 B] */\n'
      % ', '.join('%d %s' % (i, f['name']) for i, f in enumerate(FONTS)))
    for i, platform in enumerate(PLATFORMS):
        w('%s /* %s */\n' % ('#if defined(PBL_COLOR)' if i == 0 else '#else', PLATFORM_NAME[platform]))
        w('static const DigitStripMetrics DIGITS_METRICS[DIGITS_FONT_COUNT][2] = {\n')
        for font in FONTS:
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
                w('      %d, %d, %d, %d, %d, %d, %d,\n'
                  % (st.strip_w, st.strip_h, st.cell_w, st.digit_h, st.ring, st.shadow, st.px))
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
    w('static const uint32_t DIGITS_RESOURCE_IDS[DIGITS_FONT_COUNT][2] = {\n')
    for font in FONTS:
        w('  { RESOURCE_ID_DIGITS_%s_A, RESOURCE_ID_DIGITS_%s_B },\n'
          % (font['res'], font['res']))
    w('};\n')
    w('\n')
    w('#endif /* GALLERIA_DIGIT_METRICS_H */\n')
    return ''.join(out)


# --------------------------------------------------------------- output ---

def fmt_rows(st):
    """Le due colonne 'riga': 'larghezza/limite(inchiostro) margine sx/dx'.

    La larghezza e' quella di D25 (passo sul RIEMPIMENTO, come prv_place_row), '!' quando
    sfora; fra parentesi la stessa riga se l'anticipo guardasse l'inchiostro intero (anello e
    ombra compresi); poi i margini in px fra i pixel disegnati e i bordi dello schermo, '!'
    quando sono negativi (anello/ombra tagliati dal layer).
    """
    cells = []
    for r in st.rows:
        cells.append('%d/%d%s(%d) %d/%d%s'
                     % (r.w, r.limit, '!' if r.w > r.limit else '', r.ink, r.left, r.right,
                        '!' if (r.left < 0 or r.right < 0) else ''))
    while len(cells) < 2:
        cells.append('-')
    return cells[0], cells[1]


def print_table(strips):
    hdr = ('%-11s %-6s %-2s %-8s %-9s %-4s %-6s %-4s %-6s %-6s %-20s %-20s %s'
           % ('font', 'piatt', 'tg', 'cella', 'strip', 'px', 'h ink', 'R/S', 'w max', "w ':'",
              'riga 1', 'riga 2', 'larghezze (anello+ombra comprese) 0..9 | :'))
    print(hdr)
    print('-' * len(hdr))
    for st in strips:
        rs = '%d/%d' % (st.ring, st.shadow)
        if st.buf is None:              # strip non disegnata: solo l'errore che l'ha fermata
            print('%-11s %-6s %-2s %-8s %-9s %-4d %-6s %-4s %-6s %-6s %-20s %-20s ERRORE: %s'
                  % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper(),
                     '%dx%d' % (st.cell_w, st.strip_h), '-', st.px, '-', rs, '-', '-', '-', '-',
                     '; '.join(st.errors)))
            continue
        wmax = max(st.ink_w[:10])
        colon = str(st.ink_w[10]) if st.ncells > 10 else '-'
        strip = '%dx%d' % (st.strip_w, st.strip_h)
        if st.packed:
            strip += '*'                 # * = compatta (--pack): strip_w = inchiostro + coda
        r1, r2 = fmt_rows(st)
        print('%-11s %-6s %-2s %-8s %-9s %-4d %-6s %-4s %-6d %-6s %-20s %-20s %s | %s'
              % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper(),
                 '%dx%d' % (st.cell_w, st.strip_h), strip, st.px,
                 '%d/%d' % (st.digit_h, st.rows_h), rs, wmax, colon, r1, r2,
                 ','.join(str(v) for v in st.ink_w[:10]), colon))
    print('')
    print('cella = cell_w (passo del layout) x strip_h; R/S = anello / ombra; riga 1 e riga 2 =')
    print('  taglia A: 24 h "%s" e 12 h "%s" + %d + PM (%d emery / %d flint), passo di'
          % (ROW_24H, ROW_12H, AMPM_GAP, AMPM_W['color'], AMPM_W['bw']))
    print('            ui_time.c: max(cella, RIEMPIMENTO = inchiostro - 2R - S, D25), celle')
    print('            delle cifre -%d in 12 h;' % AMPM_SHRINK)
    print('  taglia B: 2 x max(cella, riempimento) + gap %d (peggiore delle coppie di cifre),'
          % B_GAP)
    print('            riga 2 non si applica.')
    print('  Il limite e\' la larghezza dello schermo (%d emery / %d flint); \'!\' = sfora;'
          % (SCREEN_W['color'], SCREEN_W['bw']))
    print('  fra parentesi la stessa riga con l\'inchiostro intero (anello e ombra compresi:')
    print('  quanto misurerebbe se prv_place_row non seguisse D25); dopo, i margini in px fra i')
    print('  pixel disegnati (ui_digits_draw) e i bordi dello schermo, \'!\' se negativi.')


def print_notes(strips):
    for st in strips:
        tag = '%s %s %s' % (st.font['key'], PLATFORM_NAME[st.platform], st.size.upper())
        for n in st.notes:
            print('NOTA    %-22s %s' % (tag, n))
        for n in st.warnings:
            print('AVVISO  %-22s %s' % (tag, n))
        for n in st.errors:
            print('ERRORE  %-22s %s' % (tag, n))


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


# -------------------------------------------------------------- selftest ---

def _fake_strip(platform, size, ink_w, ring=None, shadow=None, cell_w=None):
    """Strip finta per i controlli (nessun TTF): solo i campi che servono alle righe."""
    g_cell, rows_h, g_ring, g_shadow = GEOM[(platform, size)]
    st = Strip(FONTS[0], size, platform)
    st.cell_w = g_cell if cell_w is None else cell_w
    st.ring = g_ring if ring is None else ring
    st.shadow = g_shadow if shadow is None else shadow
    st.rows_h = rows_h
    st.digit_h = rows_h
    st.strip_h = rows_h + 2 * st.ring + st.shadow
    st.work_w = st.cell_w + 2 * st.ring + st.shadow + 2
    st.strip_w = len(ink_w) * st.work_w
    st.px = 1
    st.chars = GLYPHS
    st.ncells = len(ink_w)
    st.ink_w = list(ink_w) + [0] * (NGLYPHS - len(ink_w))
    st.ink_x = [0] * NGLYPHS
    st.buf = None
    return st


def selftest():
    """Controlli del contratto senza toccare i TTF (`--selftest`).

    Coprono quello che le revisioni di S8-stile hanno trovato fragile: il passo di riga di D25
    (RIEMPIMENTO, non inchiostro intero), l'avviso di sporgenza del §3.4, la geometria di D26
    (flint senza ombra) e gli autocontrolli della strip.
    """
    fails = []
    n = [0]

    def ck(cond, msg):
        n[0] += 1
        if not cond:
            fails.append(msg)

    # 1. cdiv = divisione del C (troncamento verso lo zero)
    for a, b, want in ((7, 2, 3), (-7, 2, -3), (-4, 2, -2), (-1, 2, 0), (0, 2, 0), (5, -2, -2)):
        ck(cdiv(a, b) == want, 'cdiv(%d, %d) = %d, atteso %d' % (a, b, cdiv(a, b), want))

    # 2. geometria D20/D26: emery 2/2, flint 1/0 (niente ombra), strip_h = rows_h + 2R + S
    for (plat, size), (cell, rows_h, r, s) in sorted(GEOM.items()):
        want = (2, 2) if plat == 'color' else (1, 0)
        ck((r, s) == want, 'GEOM[%s,%s] R/S = %d/%d, atteso %d/%d' % (plat, size, r, s,
                                                                     want[0], want[1]))
    ck(GEOM[('bw', 'a')][1] + 2 * GEOM[('bw', 'a')][2] + GEOM[('bw', 'a')][3] == 44,
       'strip_h di flint A != 44')
    ck(GEOM[('bw', 'b')][1] + 2 * GEOM[('bw', 'b')][2] + GEOM[('bw', 'b')][3] == 64,
       'strip_h di flint B != 64')

    # 3. fill_width = ui_digits_fill_width (ink - 2R - S, clamp a 1; 0 se il glifo manca)
    st = _fake_strip('color', 'a', [40] * 11)
    ck(fill_width(st, 0) == 40 - 4 - 2, 'fill_width: %d' % fill_width(st, 0))
    st.ink_w[1] = 5                                   # 5 - 4 - 2 < 1 -> clamp
    ck(fill_width(st, 1) == 1, 'fill_width senza clamp a 1')
    st.ink_w[2] = 0
    ck(fill_width(st, 2) == 0, 'fill_width di un glifo assente != 0')

    # 4. D25: il passo si allarga al RIEMPIMENTO, non all'inchiostro intero
    st = _fake_strip('color', 'a', [40] * 10 + [19])  # riempimento 34 < passo 40
    ck(row_width(st, ROW_24H, 40, 16) == 4 * 40 + 16, 'riga 24 h con glifi stretti')
    st = _fake_strip('color', 'a', [60] * 10 + [19])  # riempimento 54 > passo 40 -> passo 54 + R (56)
    ck(row_width(st, ROW_24H, 40, 16) == 4 * (54 + 2) + 16, 'riga 24 h con glifi larghi (D25 riserva: riempimento più largo + R)')
    ck(row_ink_width(st, ROW_24H, 40, 16) == 4 * 60 + 19, 'diagnostica con inchiostro intero')

    # 5. le righe sforano -> errori (24 h, 12 h e 12 h con zero iniziale); con --allow-row-overflow solo avvisi
    st = _fake_strip('color', 'a', [60] * 10 + [19])
    check_rows(st, False)
    ck(len(st.errors) == 3 and not st.warnings,
       'righe sforate: errori %s avvisi %s' % (st.errors, st.warnings))
    st = _fake_strip('color', 'a', [60] * 10 + [19])
    check_rows(st, True)
    ck(not st.errors and len(st.warnings) == 3, '--allow-row-overflow non declassa ad avviso')

    # 6. sporgenza fuori schermo: AVVISO, mai errore. Riempimenti 38 per tutte le cifre e 16 per il ':'
    # (griglia uniforme di riserva: 38 + 2 = 40 per cifra, 16 + 2 = 18 per il ':') -> la riga 12 h misura
    # esattamente 200 px (4 x 40 + 18 + 4 + PM 18), sia "10:44" sia "09:44", quindi x0 = 0 e l'anello del
    # primo glifo (nucleo 42 in un passo di 40) esce di 1 px a sinistra; i tentativi con gap (44/43/42 per
    # cifra) sforano e vengono scartati.
    st = _fake_strip('color', 'a', [44] * 10 + [22])
    check_rows(st, False)
    ck(st.rows[1].w == SCREEN_W['color'], 'riga 12 h di prova larga %d' % st.rows[1].w)
    ck(st.rows[2].w == SCREEN_W['color'], 'riga 12 h con zero iniziale larga %d' % st.rows[2].w)
    ck(st.rows[1].left < 0, 'margine sinistro %d: atteso negativo' % st.rows[1].left)
    ck(not st.errors and any('escono dallo schermo' in x for x in st.warnings),
       'sporgenza: atteso un avviso, trovati errori %s / avvisi %s' % (st.errors, st.warnings))

    # 7. row_extents = ui_digits_draw (nucleo centrato nel passo, ombra a destra)
    st = _fake_strip('color', 'a', [40] * 11)
    placed, total = place_row(st, '0', 40, 16)
    lo, hi = row_extents(st, placed, 0)
    ck((lo, hi) == (1, 40), 'row_extents (%d, %d), atteso (1, 40)' % (lo, hi))

    # 8. anello e ombra (D20)
    ring1 = ring_pixels(set([(0, 0)]), 1)
    ck(len(ring1) == 8 and (1, 1) in ring1 and (0, 0) not in ring1, 'anello R = 1')
    ring2 = ring_pixels(set([(0, 0)]), 2)
    ck(len(ring2) == 24 and (2, 2) in ring2, 'anello R = 2')
    ck(ring_pixels(set([(0, 0)]), 0) == set(), 'anello R = 0 non vuoto')
    ck(shadow_pixels(set([(0, 0)]), 2) == set([(1, 1), (2, 2)]), 'ombra S = 2')
    ck(shadow_pixels(set([(0, 0)]), 0) == set(), 'ombra S = 0 non vuota')

    # 9. autocontrolli della mappa: quinto valore, e ombra dove S = 0 (D26)
    st = _fake_strip('color', 'a', [40] * 11)
    st.buf = bytearray([EMPTY, FILL, RING, SHADOW, 7])
    check_buf_colors(st)
    ck(st.errors, 'un quinto valore nella strip non è un errore')
    st = _fake_strip('bw', 'a', [20] * 11)
    st.buf = bytearray([EMPTY, FILL, RING, SHADOW])
    check_buf_colors(st)
    ck(any('ombra' in e for e in st.errors), 'ombra con S = 0 non segnalata (D26)')
    st = _fake_strip('bw', 'a', [20] * 11)
    st.buf = bytearray([EMPTY, FILL, RING])
    check_buf_colors(st)
    ck(not st.errors, 'strip a 3 colori rifiutata su flint')

    # 10. pack: glifi adiacenti, strip_w multiplo di 4, pixel invariati
    st = _fake_strip('color', 'a', [3, 4])
    st.strip_w, st.strip_h = 20, 2
    st.ink_x = [1, 11] + [0] * 9
    st.buf = bytearray(20 * 2)
    for y in range(2):
        for i, x in enumerate(range(1, 4)):
            st.buf[y * 20 + x] = FILL
        for i, x in enumerate(range(11, 15)):
            st.buf[y * 20 + x] = RING
    pack_strip(st)
    ck(st.strip_w == 8 and st.ink_x[:2] == [0, 3], 'pack: strip_w %d ink_x %s'
       % (st.strip_w, st.ink_x[:2]))
    ck(st.ink_sum == 7 and st.pad == 1, 'pack: somma %d coda %d' % (st.ink_sum, st.pad))
    ck(bytes(st.buf[:8]) == bytes(bytearray([FILL, FILL, FILL, RING, RING, RING, RING, EMPTY])),
       'pack: pixel spostati male')

    # 11. header: DIGITS_FONT_COUNT = len(FONTS), risorse di ogni font, riga "Rigenerare con"
    strips = []
    for font in FONTS:
        for platform in PLATFORMS:
            for size in SIZES:
                s = _fake_strip(platform, size, [20] * 11)
                s.font = font
                strips.append(s)
    txt = emit_header(strips, True, True, True, False)
    ck('#define DIGITS_FONT_COUNT %d' % len(FONTS) in txt, 'DIGITS_FONT_COUNT nell\'header')
    for font in FONTS:
        ck('RESOURCE_ID_DIGITS_%s_B' % font['res'] in txt, 'risorsa di %s' % font['key'])
    ck('--fit-width --no-colon-b --pack' in txt, 'comando canonico nell\'header')
    ck('--allow-row-overflow' not in txt, 'l\'header cita --allow-row-overflow senza il flag')
    ck('--allow-row-overflow' in emit_header(strips, True, True, True, True),
       'con il flag l\'header non lo cita')
    ck('flint A (28, 42, 1, 0)' in txt, 'geometria D26 nel commento dell\'header')

    for f in fails:
        print('FALLITO  %s' % f)
    print('selftest: %d controlli, %d falliti' % (n[0], len(fails)))
    return 1 if fails else 0


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog='gen_digits.py',
        description='Genera le strip PNG delle cifre e src/c/digit_metrics.h per Galleria '
                    '(S3; v2 con anello spesso R e ombra 3D S, S8-stile D20).',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Interprete con freetype-py e Pillow: ~/.local/share/uv/tools/pebble-tool/bin/python")
    ap.add_argument('--fonts-dir', default='apps/galleria/resources/fonts', metavar='DIR',
                    help='cartella dei TTF (default: %(default)s)')
    ap.add_argument('--out', default='apps/galleria/resources/digits', metavar='DIR',
                    help='cartella delle strip PNG (default: %(default)s)')
    ap.add_argument('--header', default='apps/galleria/src/c/digit_metrics.h', metavar='FILE',
                    help='header generato (default: %(default)s)')
    ap.add_argument('--preview', metavar='DIR',
                    help='scrive DIR/%s (foglio di contatto: strip grezza + i 4 stili di D21 '
                         'su grigio medio)' % PREVIEW_NAME)
    ap.add_argument('--only', metavar='FONT,TAGLIA,PIATT',
                    help="limita la generazione (es. 'barlow,a,color'; campi vuoti = tutti)")
    ap.add_argument('--check', action='store_true',
                    help='stampa solo la tabella delle metriche, non scrive nulla')
    ap.add_argument('--selftest', action='store_true',
                    help='autotest del contratto (§3.4, D25, D26) senza leggere i TTF: passo di '
                         'riga sul riempimento, avviso di sporgenza, geometria di flint, anello '
                         'e ombra, pack, autocontrolli della mappa, header. Non scrive nulla')
    ap.add_argument('--no-colon-b', action='store_true', dest='no_colon_b',
                    help="la taglia B viene generata senza il ':' (10 glifi invece di 11): il "
                         "layout B non disegna i due punti. Nell'header la voce del ':' della "
                         'taglia B diventa { 0, 0 }. La taglia A non cambia.')
    ap.add_argument('--pack', action='store_true',
                    help='strip COMPATTA: i glifi vengono accostati (ink[k].x = offset progressivo) e '
                         'strip_w = somma degli inchiostri arrotondata a un multiplo di 4 px, invece '
                         "delle celle di lavoro. Stessi pixel, stessa px e stesso digit_h; cell_w "
                         'resta il passo della griglia del layout. Meno pbpack e meno heap')
    ap.add_argument('--fit-width', action='store_true',
                    help="se il RIEMPIMENTO di un glifo non entra nella sua cella (il passo del "
                         "layout, o la cella del ':' nel layout A) abbassa la px invece di uscire "
                         'con errore (perde altezza: viene segnalato). Anello e ombra non entrano '
                         'nel vincolo (D24): possono sporgere dal passo')
    ap.add_argument('--allow-row-overflow', action='store_true', dest='allow_row_overflow',
                    help='declassa ad AVVISO il controllo di riga del §3.4 (24 h / 12 h nel layout '
                         'A, due glifi in B). Fuori contratto: la riga verrà tagliata a destra '
                         '(ui_time.c porta x0 a 0). Solo per esplorare geometrie R/S diverse')
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()

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
                                          args.fit_width, args.no_colon_b, args.pack,
                                          args.allow_row_overflow))

    if not strips:
        raise GenError('--only non ha selezionato nulla')

    # ordine di stampa: font, piattaforma, taglia (deterministico)
    print_table(strips)
    print('')
    print_notes(strips)

    failed = [st for st in strips if st.errors]
    if failed:
        print('')
        print('ERRORE: %d combinazioni su %d non passano i controlli (celle, anello/ombra, righe '
              'del §3.4). Con --fit-width il tool abbassa la pixel size invece di fermarsi sui '
              'glifi troppo larghi.' % (len(failed), len(strips)))
        return 1

    if args.check:
        print('')
        print('--check: nessun file scritto (%d strip verificate).' % len(strips))
        return 0

    if not os.path.isdir(args.out):
        os.makedirs(args.out)
    written = [write_png(st, args.out) for st in strips]

    header_txt = (emit_header(strips, args.fit_width, args.no_colon_b, args.pack,
                              args.allow_row_overflow)
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

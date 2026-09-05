#!/usr/bin/env python3
r"""gen_test_cards.py — v1 (S8, 30/08/2026): test card per il gate sull'orologio reale di Galleria
(docs/design/galleria-s8-hardware.md §2.5, obiettivi O5 "colore automatico" e O6 "LUT sunlight").

Scrive PNG RGB 200x228 fatti SOLO di colori esatti della palette del firmware (canali 0/85/170/255)
così che, con "dithering nessuno", gamma 1, lift 0 e "Ottimizza per il vetro" OFF nella config page,
la quantizzazione q(v) = min(3, (v + 42) // 85) sia l'IDENTITÀ: quello che si vede sul PNG è, pixel
per pixel, quello che finisce nel raw6 sull'orologio. Ogni card realizza una condizione precisa
della regola di apps/galleria/src/c/luma.h (bianco/nero, alone, pareggio, isteresi), così che la
riga di log `luma(photo): ... bad=(w/b) mean= fg= halo=` letta sul vetro si possa confrontare con un
valore atteso calcolato a tavolino, e non "a occhio".

Perché strisce VERTICALI larghe un numero PARI di pixel e che partono da x PARI: luma.c campiona
1 px su 2 in x e su 2 in y, quindi su emery le 200 colonne diventano 100 campioni (2 px = 1 % esatto)
e su flint le 144 ne diventano 72. Strisce alte quanto l'immagine ⇒ le stesse percentuali valgono per
la fascia del layout A (106 px), per quella del layout B (228) e per la riga singola sotto la Quick
View (78): la card non cambia significato al cambio di layout.

Card flint (f1..f5) — ATTENZIONE, differenza rispetto alla bozza di §2.5: la pagina di
configurazione NON ritaglia un sotto-rettangolo 144x168 1:1. `photo_prep.flint_rect()` (e il suo
porting `pipeline.js:flintRect()`, che è ciò che gira sul telefono) prende il sotto-rettangolo con
RAPPORTO 144:168 del crop di emery — per una sorgente 200x228 è x 2..196, cioè 195x228 — e lo
RIDIMENSIONA a 144x168 (LANCZOS). Un motivo disegnato in un riquadro 144x168 centrato verrebbe
quindi rimpicciolito e circondato di nero, e le percentuali non tornerebbero (f3 e f5 darebbero la
decisione sbagliata). Le card flint sono perciò a tutta larghezza e i loro bordi sono scelti in modo
che, dopo il ridimensionamento 195 -> 144, cadano su colonne di uscita ESATTE:
    x_card = 2 + round(c * 195 / 144)   (c = colonna del bitmap 144x168 dell'orologio)
verificato byte per byte dal --selftest, che rilegge il .raw1 prodotto da photo_prep.py.

Le card valgono solo se la config page NON le ritocca (dithering "Nessuno", gamma 1, lift 0,
"Ottimizza per il vetro" SPENTO, nessuno zoom): l'avviso completo è in SEND_HINT e lo stampano sia
la generazione sia --check, perché con la casella del vetro accesa palette64 perde 41 tasselli su
64 e O6 verrebbe fatto su una card corrotta.

Uso:
  python3 tools/gen_test_cards.py                       # scrive le card in ~/galleria-gate/cards/
  python3 tools/gen_test_cards.py --out /tmp/cards --emery
  python3 tools/gen_test_cards.py --check               # genera + verifica con photo_prep.py e con
                                                        #   luma.c/luma.h (exit 1 se discorda)
  python3 tools/gen_test_cards.py --selftest            # autotest (make -C apps/galleria/test cards)
Il comando del gate è `make -C apps/galleria/test cards` (esegue --selftest e --check).

Dipendenze: Pillow (solo per scrivere/rileggere i PNG) + stdlib. Nessuna dipendenza da pebble.h.
"""

import argparse
import os
import re
import subprocess
import sys
import tempfile
import textwrap

# ------------------------------------------------------------------ costanti ---

TOOL_VERSION = 'v1'

EMERY_W, EMERY_H = 200, 228
FLINT_W, FLINT_H = 144, 168
EMERY_BAND_H = 106          # fascia dinamica del layout A (photo_prep --band-h 106,76)
FLINT_BAND_H = 76
FLINT_CROP_X = 2            # photo_prep.flint_rect((0,0,200,228)) = (2, 0, 195, 228)
FLINT_CROP_W = 195

# Palette RGB222 del firmware: indice = (r2 << 4) | (g2 << 2) | b2, canali 0/85/170/255.
PAL_RGB = tuple((((k >> 4) & 3) * 85, ((k >> 2) & 3) * 85, (k & 3) * 85) for k in range(64))
PAL_CHANNELS = (0, 85, 170, 255)

# Y percettiva (0..255) della resa "sunlight" dei 64 colori: copia di LUMA_SUN[] di
# apps/galleria/src/c/luma.c (il --selftest la riconfronta con il sorgente C, se lo trova).
LUMA_SUN = (
    0,   3,  15,  36,  14,  18,  28,  49,  65,  69,  80, 100, 160, 165, 175, 195,
    5,   8,  19,  39,  20,  23,  34,  54,  71,  74,  85, 105, 167, 170, 181, 201,
   25,  28,  39,  59,  39,  42,  53,  73,  90,  94, 104, 125, 185, 189, 201, 219,
   60,  62,  74,  94,  74,  77,  87, 108, 125, 129, 140, 160, 218, 223, 234, 255,
)

# Soglie di luma.h (il --selftest le riconfronta con l'header).
LUMA_Y_WHITE_BAD = 77       # Y > 77  -> pixel ostile al testo bianco
LUMA_Y_BLACK_BAD = 25       # Y < 25  -> pixel ostile al testo nero
LUMA_Y_CROSSOVER = 46       # parità di contrasto: a pari "bad" decide il Y medio
LUMA_HYSTERESIS = 10        # punti di vantaggio per cambiare colore (NON usato dalla previsione a freddo)
LUMA_HALO_PCT = 15          # bad_pct > 15 % -> contorno

# Indici usati dalle card (verificati contro LUMA_SUN: vedi il --selftest).
IDX_BLACK = 0               # #000000  Y 0
IDX_GRAY55 = 21             # #555555  Y 23  (< 25: ostile al nero)
IDX_RED = 32                # #AA0000  Y 25  (nessuna delle due soglie: pareggio)
IDX_VIOLET = 39             # #AA55FF  Y 73  (neutro, sotto 77)
IDX_GRAY_AA = 42            # #AAAAAA  Y 104 (> 77: ostile al bianco)
IDX_SALMON = 53             # #FF5555  Y 77  (soglia esatta, confronto stretto: NON ostile)
IDX_WHITE = 63              # #FFFFFF  Y 255

EMERY_BAND_XL = 110         # fascia del layout A con content size ExtraLarge (ui_time.c: 80+28+2)
EMERY_BAND_QV = 78          # fascia della riga singola sotto la Quick View (ui_time.c: 8+68+2)

DEFAULT_OUT = os.path.join('~', 'galleria-gate', 'cards')

# Avviso operativo, stampato sia da print_written() (chi genera e copia le card sul telefono) sia
# in testa alla tabella di --check (che finisce nel runbook): le card valgono SOLO se la config
# page non le ritocca, ed è la dimenticanza più facile e più cara. Misurato il 30/08/2026 con
# `photo_prep.py --dither none --sunlight` su palette64: 41 tasselli su 64 cambiano indice (43
# colori distinti invece di 64) e la fascia A dà 17/40, Y medio 46 invece di 32/37, Y 67.
SEND_HINT = '''Come inviare le card dalla config page (ALTRIMENTI I NUMERI ATTESI NON VALGONO):
  dithering "Nessuno", gamma 1, lift 0, "Ottimizza per il vetro" SPENTO (com'è oggi di default),
  nessuno zoom né spostamento nell'editor (la card è già 200x228: pulsante "Adatta", intera).
  - "Ottimizza per il vetro" acceso: palette64 perde 41 tasselli su 64 (43 colori invece di 64) e
    l'esperimento O6 verrebbe fatto su una card corrotta (fascia A: 17/40, Y 46 invece
    di 32/37, Y 67);
  - zoom o ritaglio anche di 1 px: la pagina ricampiona con LANCZOS e ogni percentuale cambia.
    Se la riga luma(photo) sul vetro non coincide con la tabella è successo questo: riaprire
    l'editor con la cornice più larga possibile e premere "Adatta" (l'orientamento del telefono
    non conta: la cornice è comunque limitata a 300 px).
  - su flint la stessa voce "Nessuno" vale per il dithering a 1 bit (qui: --bw-dither none).'''

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTO_PREP = os.path.join(REPO_ROOT, 'tools', 'photo_prep.py')
LUMA_C = os.path.join(REPO_ROOT, 'apps', 'galleria', 'src', 'c', 'luma.c')
LUMA_H = os.path.join(REPO_ROOT, 'apps', 'galleria', 'src', 'c', 'luma.h')


# -------------------------------------------------------------- modello luma ---

def decide(n_bright, n_dark, sum_y, n):
    """prv_decide() di luma.c a freddo (nessuna isteresi: r->valid = false, come dopo luma_reset).
    Percentuali intere, pareggio deciso dal Y medio, contorno se bad_pct > LUMA_HALO_PCT."""
    bad_white = n_bright * 100 // n
    bad_black = n_dark * 100 // n
    mean = sum_y // n
    white = (bad_white < bad_black) if bad_white != bad_black else (mean < LUMA_Y_CROSSOVER)
    bad_pct = bad_white if white else bad_black
    return {'bad_white': bad_white, 'bad_black': bad_black, 'mean': mean, 'samples': n,
            'fg': 'BIANCO' if white else 'NERO', 'halo': 'SI' if bad_pct > LUMA_HALO_PCT else 'no'}


def stats_emery(grid, band_h):
    """luma_compute_8bit() su una griglia di indici 0..63 larga EMERY_W (1 px su 2 in x e y)."""
    n = n_bright = n_dark = acc = 0
    for y in range(0, band_h, 2):
        row = y * EMERY_W
        for x in range(0, EMERY_W, 2):
            l = LUMA_SUN[grid[row + x]]
            acc += l
            n += 1
            if l > LUMA_Y_WHITE_BAD:
                n_bright += 1
            elif l < LUMA_Y_BLACK_BAD:
                n_dark += 1
    return decide(n_bright, n_dark, acc, n)


def stats_flint(bits, band_h):
    """luma_compute_1bit() su una griglia 0/1 larga FLINT_W: bad_white = % bianchi, bad_black = %
    neri, Y medio = bianchi x 255 / campioni. Il contorno su 1 bit c'è SEMPRE (halo = SI)."""
    n = n_white = 0
    for y in range(0, band_h, 2):
        row = y * FLINT_W
        for x in range(0, FLINT_W, 2):
            n += 1
            n_white += bits[row + x]
    r = decide(n_white, n - n_white, n_white * 255, n)
    r['halo'] = 'SI'
    return r


# ------------------------------------------------------------- modello card ---

class Card(object):
    """Una test card. `rects` = rettangoli (x, y, w, h, idx) su fondo IDX_BLACK, in coordinate
    della card 200x228. `bands` = fasce su cui si controlla la previsione. `expect` = attesi
    {fascia: (bad_white, bad_black, mean, testo, alone)} scritti a mano dalla specifica: il
    --selftest verifica che il modello analitico li riproduca, --check che ci arrivi anche
    photo_prep.py partendo dal PNG. `cols` = colonne campionate attese per indice (controllo delle
    percentuali). `out_stripes` (solo flint) = strisce bianche [c0, c1) attese nel bitmap 144x168
    dell'orologio, da cui si ricavano sia i rettangoli sorgente sia gli attesi."""

    def __init__(self, name, plat, desc, rects, bands, expect, cols=None, out_stripes=None,
                 note=None):
        self.name = name
        self.plat = plat
        self.desc = desc
        self.rects = rects
        self.bands = bands
        self.expect = expect
        self.cols = cols or {}
        self.out_stripes = out_stripes
        self.note = note

    def grid(self):
        """Griglia 200x228 di indici di palette (quello che l'orologio riceverà nel raw6)."""
        g = bytearray(EMERY_W * EMERY_H)
        for (x, y, w, h, idx) in self.rects:
            for yy in range(y, y + h):
                row = yy * EMERY_W
                for xx in range(x, x + w):
                    g[row + xx] = idx
        return g

    def out_bits(self):
        """Griglia 0/1 144x168 attesa sull'orologio (solo card flint)."""
        bits = bytearray(FLINT_W * FLINT_H)
        for (c0, c1) in (self.out_stripes or ()):
            for y in range(FLINT_H):
                row = y * FLINT_W
                for x in range(c0, c1):
                    bits[row + x] = 1
        return bits

    def predict(self, band):
        """Previsione analitica (modello di luma.c) sulla fascia richiesta."""
        if self.plat == 'flint':
            return stats_flint(self.out_bits(), band)
        return stats_emery(self.grid(), band)


def _card_x(c):
    """Colonna c del bitmap 144x168 dell'orologio -> x nella card 200x228 (inverso del crop
    x 2..196 + ridimensionamento 195 -> 144 di photo_prep.flint_rect)."""
    return FLINT_CROP_X + int(round(c * FLINT_CROP_W / float(FLINT_W)))


def _flint_rects(stripes):
    """Rettangoli bianchi a tutta altezza per le strisce di uscita [c0, c1); la prima e l'ultima
    striscia arrivano al bordo della card (i pixel x < 2 e x >= 197 restano fuori dal crop, ma
    tenerli dello stesso colore evita di introdurre un bordo che il LANCZOS spalmerebbe)."""
    out = []
    for (c0, c1) in stripes:
        x0 = 0 if c0 == 0 else _card_x(c0)
        x1 = EMERY_W if c1 == FLINT_W else _card_x(c1)
        out.append((x0, 0, x1 - x0, EMERY_H, IDX_WHITE))
    return out


def _da_bianco(p):
    """Esito sull'orologio quando la fascia cambia arrivando dal BIANCO (layout B -> layout A):
    prv_decide() con r->valid = true e r->white = true, cioè l'isteresi di luma.c."""
    flip = p['bad_white'] >= p['bad_black'] + LUMA_HYSTERESIS
    bad = p['bad_black'] if flip else p['bad_white']
    return ('NERO' if flip else 'BIANCO'), ('SI' if bad > LUMA_HALO_PCT else 'no')


def _fascia(card, band, etichetta):
    """'etichetta (band) w/b Y mean COLORE [con alone]' calcolato dal modello: i numeri delle
    fasce che --check non controlla restano veri anche dopo una ritaratura delle soglie."""
    p = card.predict(band)
    return '%s (%d) %d/%d Y %d %s%s' % (etichetta, band, p['bad_white'], p['bad_black'],
                                        p['mean'], p['fg'],
                                        ' con alone' if p['halo'] == 'SI' else '')


def build_cards():
    """Le 18 card di §2.5, con gli attesi scritti a mano (LUMA_SUN + regola di luma.h)."""
    cards = []
    full = (0, 0, EMERY_W, EMERY_H)

    def tinta(name, idx, expect, desc):
        cards.append(Card(name, 'emery', desc, [full + (idx,)], [EMERY_BAND_H],
                          {EMERY_BAND_H: expect}, cols={idx: 100}))

    tinta('c1_black', IDX_BLACK, (0, 100, 0, 'BIANCO', 'no'),
          'tinta unita idx 0 #000000 (Y 0): tutto ostile al nero')
    tinta('c2_white', IDX_WHITE, (100, 0, 255, 'NERO', 'no'),
          'tinta unita idx 63 #FFFFFF (Y 255): tutto ostile al bianco')
    tinta('c3_gray104', IDX_GRAY_AA, (100, 0, 104, 'NERO', 'no'),
          'tinta unita idx 42 #AAAAAA (Y 104 > 77): ostile al bianco per poco')
    tinta('c4_y77', IDX_SALMON, (0, 0, 77, 'NERO', 'no'),
          'tinta unita idx 53 #FF5555 (Y 77 = soglia, confronto stretto): pareggio 0/0, '
          'media 77 >= 46 -> nero')
    tinta('c5_y25', IDX_RED, (0, 0, 25, 'BIANCO', 'no'),
          'tinta unita idx 32 #AA0000 (Y 25 = soglia, confronto stretto): pareggio 0/0, '
          'media 25 < 46 -> bianco')

    # c6: 10 strisce da 10 px di idx 21 (Y 23, ostile al nero) alternate a idx 42 (Y 104, ostile al
    # bianco): 50 colonne campionate ciascuno -> pareggio 50/50, media 63 -> nero CON alone.
    c6 = [(x, 0, 10, EMERY_H, IDX_GRAY55 if (x // 10) % 2 == 0 else IDX_GRAY_AA)
          for x in range(0, EMERY_W, 10)]
    cards.append(Card('c6_tie_halo', 'emery',
                      'strisce 10 px idx 21 #555555 (Y 23) / idx 42 #AAAAAA (Y 104): pareggio '
                      '50/50, media 63 -> nero con alone (50 % > 15 %)',
                      c6, [EMERY_BAND_H], {EMERY_BAND_H: (50, 50, 63, 'NERO', 'SI')},
                      cols={IDX_GRAY55: 50, IDX_GRAY_AA: 50}))

    # c7a/b/c: fondo nero + N strisce bianche da 2 px (1 colonna campionata l'una) distribuite:
    # il testo resta bianco, l'alone si accende solo sopra il 15 %.
    for name, n, step, halo in (('c7a_halo12', 12, 16, 'no'), ('c7b_halo15', 15, 12, 'no'),
                                ('c7c_halo18', 18, 10, 'SI')):
        rects = [(4 + step * i, 0, 2, EMERY_H, IDX_WHITE) for i in range(n)]
        mean = n * 255 // 100
        cards.append(Card(name, 'emery',
                          '%d strisce bianche da 2 px su fondo nero = %d %% delle colonne '
                          'campionate: testo bianco, alone %s' % (n, n, halo),
                          rects, [EMERY_BAND_H],
                          {EMERY_BAND_H: (n, 100 - n, mean, 'BIANCO', halo)},
                          cols={IDX_WHITE: n, IDX_BLACK: 100 - n}))

    # c8a/c8b: isteresi. Righe 0..105 = W colonne bianche + 15 nere + resto idx 39 (Y 73, neutro);
    # righe 106..227 tutte nere. In layout B (fascia 228) entrambe danno BIANCO senza alone; in
    # layout A (fascia 106) la previsione A FREDDO è nero per entrambe, ma sull'orologio, arrivando
    # da B, l'isteresi di 10 punti tiene c8a sul bianco (20 < 15 + 10) e lascia passare c8b (30 >= 25).
    for name, wcols, bandA, band228, note in (
            ('c8a_hyst_hold', 20, (20, 15, 98, 'NERO', 'no'), (9, 60, 45, 'BIANCO', 'no'),
             "sull'orologio: caricare in layout B (bianco, alone spento), poi passare al layout A "
             "-> resta BIANCO con alone (bad_white 20 < bad_black 15 + isteresi 10). La previsione "
             "di photo_prep è a freddo (nessuna isteresi) e vale NERO: è il valore in tabella."),
            ('c8b_hyst_flip', 30, (30, 15, 116, 'NERO', 'no'), (13, 60, 54, 'BIANCO', 'no'),
             "sull'orologio: da layout B (bianco) a layout A -> passa a NERO senza alone "
             "(30 >= 15 + 10). A freddo photo_prep dice già NERO.")):
        rects = [(0, 0, wcols * 2, EMERY_BAND_H, IDX_WHITE),
                 (wcols * 2, 0, 30, EMERY_BAND_H, IDX_BLACK),
                 (wcols * 2 + 30, 0, EMERY_W - wcols * 2 - 30, EMERY_BAND_H, IDX_VIOLET)]
        cards.append(Card(name, 'emery',
                          'fascia A: %d colonne bianche + 15 nere + %d idx 39 #AA55FF (Y 73); '
                          'righe 106..227 nere' % (wcols, 100 - wcols - 15),
                          rects, [EMERY_BAND_H, EMERY_H],
                          {EMERY_BAND_H: bandA, EMERY_H: band228},
                          cols={IDX_WHITE: wcols, IDX_BLACK: 15, IDX_VIOLET: 100 - wcols - 15},
                          note=note))
        # La prova vale con il testo di sistema NORMALE (fascia A 106). Con ExtraLarge la fascia è
        # 110 (ui_time.c: info_y 80 + info_h 28 + 2) e i conti cambiano: la frase la scrive il
        # modello, così resta vera anche dopo una ritaratura delle soglie (O5). Il passo 7 del
        # runbook lascia l'orologio su Large/ExtraLarge, quindi l'avvertenza serve davvero.
        c8 = cards[-1]
        pxl = c8.predict(EMERY_BAND_XL)
        fg_xl, halo_xl = _da_bianco(pxl)
        c8.note += (' ATTENZIONE: fare la prova con content size normale (fascia A %d). Con '
                    'ExtraLarge la fascia diventa %d, i conti %d/%d e sull\'orologio si finisce '
                    'su %s con alone %s.'
                    % (EMERY_BAND_H, EMERY_BAND_XL, pxl['bad_white'], pxl['bad_black'],
                       fg_xl, halo_xl))

    # palette64: 8x8 tasselli 24x28 (margini neri 4 px a sinistra/destra, 2 px sopra/sotto), indice
    # = riga * 8 + colonna. Card di riferimento per la LUT sunlight (O6): si legge per posizione.
    pal = [(4 + 24 * c, 2 + 28 * r, 24, 28, r * 8 + c) for r in range(8) for c in range(8)]
    cards.append(Card('palette64', 'emery',
                      'i 64 colori in tasselli 24x28 (idx = riga*8 + colonna, origine 4,2): '
                      'foto del vetro alla luce del giorno vs pebble screenshot (O6)',
                      pal, [EMERY_BAND_H, EMERY_H],
                      {EMERY_BAND_H: (32, 37, 67, 'BIANCO', 'SI'),
                       EMERY_H: (45, 20, 90, 'NERO', 'SI')}))
    # Unica card non a strisce a tutta altezza (§2.5 chiede il contrario, ma per O6 servono i 64
    # tasselli): il colore del testo dipende dalla fascia. --check controlla A e B; Quick View e
    # ExtraLarge finiscono nella nota, calcolati dal modello.
    pal_card = cards[-1]
    pal_card.note = ('unica card NON a strisce a tutta altezza (i tasselli cambiano riga per riga), '
                     'quindi la riga luma(photo) dipende dalla fascia: %s; %s; %s; %s. Per O6 il '
                     'colore del testo non conta (si guardano i tasselli), ma il log va '
                     'confrontato con la fascia giusta.'
                     % (_fascia(pal_card, EMERY_BAND_H, 'layout A'),
                        _fascia(pal_card, EMERY_BAND_QV, 'Quick View'),
                        _fascia(pal_card, EMERY_BAND_XL, 'ExtraLarge'),
                        _fascia(pal_card, EMERY_H, 'layout B')))

    # gray4: i 4 neutri della palette, 50 px l'uno (25 colonne campionate ciascuno).
    gray = [(50 * i, 0, 50, EMERY_H, idx)
            for i, idx in enumerate((IDX_BLACK, IDX_GRAY55, IDX_GRAY_AA, IDX_WHITE))]
    cards.append(Card('gray4', 'emery',
                      'bande da 50 px: idx 0 / 21 / 42 / 63 (#000000 #555555 #AAAAAA #FFFFFF) '
                      'per il confronto LUT sui neutri (O6)',
                      gray, [EMERY_BAND_H], {EMERY_BAND_H: (50, 50, 95, 'NERO', 'SI')},
                      cols={IDX_BLACK: 25, IDX_GRAY55: 25, IDX_GRAY_AA: 25, IDX_WHITE: 25},
                      note='card per la LUT (O6), non per il colore del testo: le 4 bande uguali '
                           'danno un pareggio ESATTO 50/50 e il nero lo decide il Y medio (95 >= '
                           '46). Basta 1 px di ricampionamento della pagina (zoom, o cornice '
                           "dell'editor larga 124/125/131/132/139/146/153/182 px, che ritaglia "
                           '199x227) perché diventi 49/51 e la riga luma dica BIANCO: non è un '
                           'errore della luma, è la card ritoccata. Vedi l\'avviso in testa '
                           'alla tabella.'))

    # --- flint: strisce a tutta altezza, bordi allineati alle colonne del bitmap 144x168 ---
    # Le percentuali contano le 72 colonne campionate delle 144 dell'orologio; su 1 bit l'alone è
    # sempre acceso (luma_compute_1bit) e la parità la decide il Y medio = bianchi x 255 / campioni.
    for name, stripes, expect, desc, note in (
            ('f1_black', (), (0, 100, 0, 'BIANCO', 'SI'), 'tutto nero -> testo bianco', None),
            ('f2_white', ((0, FLINT_W),), (100, 0, 255, 'NERO', 'SI'),
             'tutto bianco -> testo nero', None),
            ('f3_5050', ((0, 26), (48, 68), (96, 122)), (50, 50, 127, 'NERO', 'SI'),
             '3 strisce bianche (26+20+26 = 72 colonne su 144, 36 campionate su 72): pareggio '
             '50/50, media 127 -> nero',
             'la §2.5 la descrive come "blocchi 2x2 alternati" in un riquadro 144x168 centrato: '
             'qui sono 3 strisce verticali a tutta altezza e a tutta larghezza, perché la pagina '
             'NON ritaglia un 144x168 1:1 (vedi il docstring del tool). Il risultato — pareggio '
             '50/50 sulle 72 colonne campionate — è quello voluto dalla §2.5.'),
            ('f4_40w', ((0, 60),), (41, 58, 106, 'BIANCO', 'SI'),
             'blocco bianco di 60 colonne su 144 (41,7 %): minoranza bianca -> testo bianco',
             'il nome viene dalla §2.5 ("40 % bianco"), la card ne ha 41,7 % (60 colonne su 144, '
             '41 % dei campioni): i 40 % tondi non sono realizzabili con bordi allineati alla '
             'scala 195 -> 144 (65:48). La decisione (bianco) non cambia.'),
            ('f5_60w', ((0, 88),), (61, 38, 155, 'NERO', 'SI'),
             'blocco bianco di 88 colonne su 144 (61,1 %): maggioranza bianca -> testo nero',
             'come f4: nome dalla §2.5, percentuale vera 61,1 % (88 colonne su 144, 61 % dei '
             'campioni). La decisione (nero) non cambia.')):
        cards.append(Card(name, 'flint', desc, _flint_rects(stripes), [FLINT_BAND_H],
                          {FLINT_BAND_H: expect}, out_stripes=stripes, note=note))
    return cards


CARDS = build_cards()


# ------------------------------------------------------------------- output ---

def render(card):
    """PNG RGB della card (Pillow importato qui: il resto del tool non ne ha bisogno)."""
    from PIL import Image
    g = card.grid()
    px = bytearray(len(g) * 3)
    for i, k in enumerate(g):
        r, gr, b = PAL_RGB[k]
        px[i * 3] = r
        px[i * 3 + 1] = gr
        px[i * 3 + 2] = b
    return Image.frombytes('RGB', (EMERY_W, EMERY_H), bytes(px))


def write_cards(outdir, plats):
    """Scrive le card richieste in outdir (creata se manca). Ritorna la lista delle card scritte."""
    outdir = os.path.abspath(os.path.expanduser(outdir))
    os.makedirs(outdir, exist_ok=True)
    written = []
    for card in CARDS:
        if card.plat not in plats:
            continue
        path = os.path.join(outdir, card.name + '.png')
        render(card).save(path)
        written.append((card, path))
    return outdir, written


def _wrapped(prefix, text, width=98):
    """Testo a capo con rientro sotto il prefisso (le note delle card sono lunghe)."""
    return textwrap.fill(text, width=width, initial_indent=prefix,
                         subsequent_indent=' ' * len(prefix))


def print_written(outdir, written, notes=True):
    """Elenco delle card scritte; con notes=False (quando segue --check, che le ristampa in coda
    alla tabella in forma markdown) salta note e avviso per non stampare tutto due volte."""
    print('%d card in %s' % (len(written), outdir))
    for card, path in written:
        exp = card.expect[card.bands[0]]
        print('  %-18s %-6s %dx%d  testo %-6s alone %-2s  %s'
              % (card.name + '.png', card.plat, EMERY_W, EMERY_H, exp[3], exp[4], card.desc))
    if not notes:
        return
    print('')
    for name, note in [(c.name, c.note) for c, _ in written if c.note]:
        print(_wrapped('  nota %s: ' % name, note))
    print('')
    print(SEND_HINT)


# -------------------------------------------------------------------- check ---

RE_EMERY = re.compile(r'stats emery fascia y 0\.\.(\d+) \((\d+) campioni\): '
                      r'bad_white (\d+) %\s+bad_black (\d+) %\s+Y medio (\d+)\s+->\s+'
                      r'testo (BIANCO|NERO), contorno (SI|no)')
RE_FLINT = re.compile(r'stats flint fascia y 0\.\.(\d+) \((\d+) campioni\): '
                      r'bianchi (\d+) %\s+neri (\d+) %\s+Y medio (\d+)\s+->\s+'
                      r'testo (BIANCO|NERO), contorno (SI|no)')


def band_arg(card, band):
    """--band-h EMERY,FLINT che mette la fascia richiesta sulla piattaforma della card."""
    if card.plat == 'flint':
        return '%d,%d' % (EMERY_BAND_H if band == FLINT_BAND_H else EMERY_H, band)
    return '%d,%d' % (band, FLINT_BAND_H if band == EMERY_BAND_H else FLINT_H)


def run_photo_prep(png, band_h, workdir, python=None):
    """photo_prep.py --dither none --bw-dither none --stats --band-h ... (i .raw6/.raw1 finiscono
    in workdir, che è temporanea).

    --bw-dither none NON è un'aggiunta arbitraria alla §2.5 (che scrive solo --dither none): nella
    config page il dithering è UNA sola voce (page.js: `dither: el('dither').value`), e per un
    orologio flint quella voce va a encodeFlint (fs | atkinson | none). Chiedere all'utente
    "dithering Nessuno" vuol dire quindi bw-dither none, ed è esattamente ciò che il comando
    riproduce. Con `fs` le percentuali di f1..f5 vengono le stesse (verificato), ma il raw1 NO: il
    Floyd-Steinberg diffonde l'errore dei pixel grigi creati dal ridimensionamento 195 -> 144 sui
    bordi delle strisce e il CRC cambia, quindi il confronto byte-esatto del --selftest
    (raw1 == out_bits) richiede `none`."""
    cmd = [python or sys.executable, PHOTO_PREP, '--dither', 'none', '--bw-dither', 'none',
           '--stats', '--band-h', band_h, '--out', workdir, png]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return p.returncode, p.stdout.decode('utf-8', 'replace'), ' '.join(cmd)


def parse_stats(out, plat):
    """(fascia, campioni, bad_white, bad_black, mean, testo, alone) dalla riga di --stats."""
    m = (RE_FLINT if plat == 'flint' else RE_EMERY).search(out)
    if not m:
        return None
    return (int(m.group(1)) + 1, int(m.group(2)), int(m.group(3)), int(m.group(4)),
            int(m.group(5)), m.group(6), m.group(7))


def check(outdir, written, verbose=False):
    """Esegue photo_prep.py su ogni card generata e confronta con l'atteso. Stampa la tabella
    markdown di §2.5 e ritorna il numero di discordanze."""
    rows = []
    bad = 0
    with tempfile.TemporaryDirectory(prefix='galleria-cards-') as tmp:
        for card, path in written:
            for band in card.bands:
                bh = band_arg(card, band)
                rc, out, cmd = run_photo_prep(path, bh, tmp)
                exp = card.expect[band]
                if rc != 0:
                    rows.append((card, band, exp, None, 'photo_prep exit %d' % rc))
                    bad += 1
                    print(out.rstrip())
                    continue
                got = parse_stats(out, card.plat)
                if verbose:
                    print('$ %s\n%s' % (cmd, out.rstrip()))
                if got is None:
                    rows.append((card, band, exp, None, 'riga --stats non riconosciuta'))
                    bad += 1
                    continue
                if got[0] != band:
                    rows.append((card, band, exp, got, 'fascia %d invece di %d' % (got[0], band)))
                    bad += 1
                    continue
                ok = (got[2], got[3], got[4], got[5], got[6]) == exp
                rows.append((card, band, exp, got, 'ok' if ok else 'DISCORDE'))
                if not ok:
                    bad += 1
    print('')
    print(SEND_HINT)
    print('')
    st = c_source_status()
    ndiff = sum(1 for ok, _ in st if ok is False)
    nskip = sum(1 for ok, _ in st if ok is None)
    if ndiff:
        print('soglie e LUMA_SUN: %d DISCORDANZ%s con luma.c/luma.h -> card e tabella sono '
              'VECCHIE, da rigenerare dopo la ritaratura (O5):'
              % (ndiff, 'A' if ndiff == 1 else 'E'))
        for ok, msg in st:
            if ok is not True:
                print('  - %s' % msg)
    elif nskip:
        print('soglie e LUMA_SUN: NON confrontate con luma.c/luma.h (%d sorgenti non leggibili): '
              'i numeri valgono solo se le soglie non sono cambiate' % nskip)
    else:
        print('soglie e LUMA_SUN confrontate con luma.c/luma.h: ok (tabella dei 64 Y + 5 soglie)')
    print('')
    print('previsione: python3 tools/photo_prep.py --dither none --bw-dither none --stats '
          '--band-h <fascia> --out <tmp> <card>.png')
    print('')
    print('| card | piatt. | fascia | bad w/b | Y medio | testo atteso | alone atteso | '
          'previsione photo_prep | esito |')
    print('|---|---|---|---|---|---|---|---|---|')
    for card, band, exp, got, esito in rows:
        prev = ('%d/%d · %d · %s · %s' % (got[2], got[3], got[4], got[5], got[6])) if got else '—'
        print('| `%s` | %s | %d | %d/%d | %d | %s | %s | %s | %s |'
              % (card.name, card.plat, band, exp[0], exp[1], exp[2], exp[3], exp[4], prev, esito))
    notes = [(c.name, c.note) for c, _ in written if c.note]
    if notes:
        print('')
        for name, note in notes:
            print('- `%s`: %s' % (name, note))
    print('')
    print('gen_test_cards --check: %d righe, %d discordanti%s'
          % (len(rows), bad, '' if not ndiff else
             ', + %d soglie diverse da luma.c/luma.h' % ndiff))
    return bad + ndiff


# ----------------------------------------------------------------- selftest ---

def unpack6(data, npix):
    """raw6 -> indici 0..63 (inverso di photo_prep.pack6)."""
    out = bytearray(npix)
    i = 0
    for o in range(0, (npix + 3) // 4 * 3, 3):
        b0, b1, b2 = data[o], data[o + 1], data[o + 2]
        for v in (b0 >> 2, ((b0 & 3) << 4) | (b1 >> 4), ((b1 & 15) << 2) | (b2 >> 6), b2 & 63):
            if i < npix:
                out[i] = v
                i += 1
    return bytes(out)


def unpack1(data, w, h):
    """raw1 (1BitPalette MSB-first) -> pixel 0/1."""
    stride = (w + 7) // 8
    out = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            out[y * w + x] = 1 if data[y * stride + (x >> 3)] & (0x80 >> (x & 7)) else 0
    return bytes(out)


class _T(object):
    """Contatore pass/fail nello stile di photo_prep.py e dei test C."""

    def __init__(self):
        self.ok = 0
        self.fail = 0

    def check(self, cond, what):
        if cond:
            self.ok += 1
        else:
            self.fail += 1
            print('FAIL %s' % what)


def _c_table(path, name, n):
    """Legge una tabella `const uint8_t NAME[n] = { ... };` da un sorgente C (None se assente)."""
    try:
        with open(path) as f:
            src = f.read()
    except OSError:
        return None
    m = re.search(re.escape(name) + r'\s*\[[^\]]*\]\s*=\s*\{([^}]*)\}', src)
    if not m:
        return None
    vals = [int(v) for v in re.findall(r'\d+', m.group(1))]
    return tuple(vals) if len(vals) == n else None


def _c_define(path, name):
    """Legge `#define NAME <intero>` da un header (None se assente)."""
    try:
        with open(path) as f:
            src = f.read()
    except OSError:
        return None
    m = re.search(r'#define\s+' + re.escape(name) + r'\s+(\d+)', src)
    return int(m.group(1)) if m else None


def c_source_status():
    """Confronta la copia locale di LUMA_SUN e delle soglie con apps/galleria/src/c/luma.c e
    luma.h. Ritorna una lista di (esito, testo) con esito True = confrontato e uguale, False =
    DIVERSO, None = sorgente non leggibile (confronto saltato). La usano sia --selftest sia
    --check: dopo una ritaratura delle soglie (O5) le card e la tabella sono da rifare, e --check
    da solo — il comando che finisce nel runbook — altrimenti non se ne accorgerebbe."""
    out = []
    tab = _c_table(LUMA_C, 'LUMA_SUN', 64)
    if tab is None:
        out.append((None, 'LUMA_SUN: %s non leggibile' % LUMA_C))
    else:
        diff = [k for k in range(64) if tab[k] != LUMA_SUN[k]]
        out.append((not diff, 'LUMA_SUN uguale a quella di luma.c' if not diff else
                    'LUMA_SUN DIVERSA da luma.c in %d indici (primi: %s)' % (len(diff), diff[:8])))
    for cname, val in (('LUMA_Y_WHITE_BAD', LUMA_Y_WHITE_BAD), ('LUMA_Y_BLACK_BAD', LUMA_Y_BLACK_BAD),
                       ('LUMA_Y_CROSSOVER', LUMA_Y_CROSSOVER), ('LUMA_HYSTERESIS', LUMA_HYSTERESIS),
                       ('LUMA_HALO_PCT', LUMA_HALO_PCT)):
        got = _c_define(LUMA_H, cname)
        if got is None:
            out.append((None, '%s non trovato in luma.h' % cname))
        else:
            out.append((got == val, '%s = %d come in luma.h' % (cname, val) if got == val else
                        '%s = %d nel tool ma %d in luma.h' % (cname, val, got)))
    return out


def selftest():
    from PIL import Image
    t = _T()

    # --- tabelle e soglie: la copia locale deve essere quella di luma.c/luma.h (se il sorgente c'è)
    for ok, msg in c_source_status():
        if ok is None:
            print('nota: %s, confronto saltato' % msg)
        else:
            t.check(ok, msg)

    # --- gli indici citati in §2.5 realizzano davvero la condizione voluta
    t.check(LUMA_SUN[IDX_BLACK] == 0 and LUMA_SUN[IDX_WHITE] == 255, 'idx 0 -> Y 0, idx 63 -> Y 255')
    t.check(LUMA_SUN[IDX_GRAY55] == 23 and LUMA_SUN[IDX_GRAY55] < LUMA_Y_BLACK_BAD,
            'idx 21 #555555 -> Y 23 (< 25: ostile al nero)')
    t.check(LUMA_SUN[IDX_RED] == 25 and not LUMA_SUN[IDX_RED] < LUMA_Y_BLACK_BAD,
            'idx 32 #AA0000 -> Y 25 (confronto stretto: NON ostile)')
    t.check(LUMA_SUN[IDX_VIOLET] == 73 and not LUMA_SUN[IDX_VIOLET] > LUMA_Y_WHITE_BAD,
            'idx 39 #AA55FF -> Y 73 (neutro)')
    t.check(LUMA_SUN[IDX_GRAY_AA] == 104 and LUMA_SUN[IDX_GRAY_AA] > LUMA_Y_WHITE_BAD,
            'idx 42 #AAAAAA -> Y 104 (> 77: ostile al bianco)')
    t.check(LUMA_SUN[IDX_SALMON] == 77 and not LUMA_SUN[IDX_SALMON] > LUMA_Y_WHITE_BAD,
            'idx 53 #FF5555 -> Y 77 (soglia esatta: NON ostile)')
    t.check(PAL_RGB[IDX_GRAY55] == (85, 85, 85) and PAL_RGB[IDX_GRAY_AA] == (170, 170, 170)
            and PAL_RGB[IDX_RED] == (170, 0, 0) and PAL_RGB[IDX_SALMON] == (255, 85, 85)
            and PAL_RGB[IDX_VIOLET] == (170, 85, 255), 'PAL_RGB degli indici usati')

    # --- modello analitico == attesi scritti a mano
    for card in CARDS:
        for band in card.bands:
            p = card.predict(band)
            got = (p['bad_white'], p['bad_black'], p['mean'], p['fg'], p['halo'])
            t.check(got == card.expect[band],
                    '%s fascia %d: modello %s == atteso %s' % (card.name, band, got,
                                                               card.expect[band]))
    t.check(len(CARDS) == 18 and len([c for c in CARDS if c.plat == 'flint']) == 5,
            '18 card, 5 delle quali flint (ha dato %d/%d)'
            % (len(CARDS), len([c for c in CARDS if c.plat == 'flint'])))

    # --- geometria. Emery: strisce di larghezza pari da x pari (il campionamento è 1 px su 2).
    # Flint: i bordi PARI stanno nel bitmap 144x168 di uscita, non nella card (in mezzo c'è il
    # ridimensionamento 195 -> 144), e i rettangoli sorgente ne sono l'antimmagine.
    for card in CARDS:
        for (x, y, w, h, idx) in card.rects:
            if card.plat == 'emery':
                t.check(x % 2 == 0 and w % 2 == 0,
                        '%s: rettangolo x=%d w=%d pari' % (card.name, x, w))
            t.check(0 <= x and x + w <= EMERY_W and 0 <= y and y + h <= EMERY_H,
                    '%s: rettangolo dentro 200x228' % card.name)
        for (c0, c1) in (card.out_stripes or ()):
            t.check(c0 % 2 == 0 and c1 % 2 == 0 and 0 <= c0 < c1 <= FLINT_W,
                    '%s: striscia di uscita [%d,%d) pari e dentro 0..144' % (card.name, c0, c1))
            for c in (c0, c1):
                if 0 < c < FLINT_W:      # errore di allineamento del bordo, in colonne di uscita
                    err = abs((_card_x(c) - FLINT_CROP_X) * float(FLINT_W) / FLINT_CROP_W - c)
                    t.check(err < 0.35, '%s: bordo c=%d allineato entro 0,35 colonne (%.3f)'
                            % (card.name, c, err))

    with tempfile.TemporaryDirectory(prefix='galleria-cards-self-') as tmp:
        outdir, written = write_cards(os.path.join(tmp, 'cards'), ('emery', 'flint'))
        raw = os.path.join(tmp, 'raw')
        os.makedirs(raw, exist_ok=True)
        t.check(len(written) == 18, 'scritte 18 card (ha dato %d)' % len(written))

        for card, path in written:
            img = Image.open(path)
            t.check(img.size == (EMERY_W, EMERY_H) and img.mode == 'RGB',
                    '%s: PNG RGB 200x228 (ha dato %s %s)' % (card.name, img.size, img.mode))
            data = img.tobytes()
            t.check(set(data) <= set(PAL_CHANNELS),
                    '%s: solo canali 0/85/170/255 (ha dato %s)'
                    % (card.name, sorted(set(data))[:8]))
            # percentuali: colonne campionate per indice (sulla riga 0, le strisce sono a tutta altezza)
            if card.cols:
                counts = {}
                g = card.grid()
                for x in range(0, EMERY_W, 2):
                    counts[g[x]] = counts.get(g[x], 0) + 1
                t.check(counts == card.cols,
                        '%s: colonne campionate %s == attese %s' % (card.name, counts, card.cols))

        # --- identità della pipeline emery: il raw6 di photo_prep == la griglia della card
        for name in ('palette64', 'gray4', 'c8a_hyst_hold', 'c6_tie_halo'):
            card = [c for c in CARDS if c.name == name][0]
            png = os.path.join(outdir, name + '.png')
            rc, out, cmd = run_photo_prep(png, '106,76', raw)
            t.check(rc == 0, '%s: photo_prep exit 0 (%s)' % (name, out.strip()[-160:]))
            with open(os.path.join(raw, name + '.raw6'), 'rb') as f:
                idx = unpack6(f.read(), EMERY_W * EMERY_H)
            t.check(idx == bytes(card.grid()),
                    '%s: raw6 identico alla griglia della card (dithering nessuno = identità)' % name)
            if name == 'palette64':
                wrong = [k for k in range(64)
                         if idx[(2 + 28 * (k // 8) + 14) * EMERY_W + (4 + 24 * (k % 8) + 12)] != k]
                t.check(not wrong, 'palette64: ogni indice 0..63 al centro del suo tassello '
                                   '(sbagliati: %s)' % wrong[:8])
                t.check(len(set(idx)) == 64, 'palette64: tutti i 64 indici presenti nel raw6')

        # --- card flint: il raw1 di photo_prep == il bitmap 144x168 di progetto
        for card in [c for c in CARDS if c.plat == 'flint']:
            png = os.path.join(outdir, card.name + '.png')
            rc, out, cmd = run_photo_prep(png, '106,76', raw)
            t.check(rc == 0, '%s: photo_prep exit 0 (%s)' % (card.name, out.strip()[-160:]))
            with open(os.path.join(raw, card.name + '.raw1'), 'rb') as f:
                bits = unpack1(f.read(), FLINT_W, FLINT_H)
            t.check(bits == bytes(card.out_bits()),
                    '%s: raw1 == strisce di progetto %s' % (card.name, card.out_stripes))
            got = parse_stats(out, 'flint')
            t.check(got is not None and (got[2], got[3], got[4], got[5], got[6])
                    == card.expect[FLINT_BAND_H],
                    '%s: --stats flint %s == atteso %s' % (card.name, got, card.expect[FLINT_BAND_H]))

    print('gen_test_cards selftest: %d ok, %d falliti' % (t.ok, t.fail))
    return t.fail == 0


# --------------------------------------------------------------------- main ---

def main(argv=None):
    ap = argparse.ArgumentParser(
        description='Test card per il gate S8 di Galleria (colore automatico e LUT sunlight).',
        epilog='gen_test_cards %s. Specifica: docs/design/galleria-s8-hardware.md §2.5. Regola: '
               'apps/galleria/src/c/luma.h. Verifica: --check (usa tools/photo_prep.py).'
               % TOOL_VERSION)
    ap.add_argument('--out', default=DEFAULT_OUT, metavar='DIR',
                    help='cartella delle card (default: %s)' % DEFAULT_OUT)
    ap.add_argument('--emery', action='store_true', help='solo le card emery (c1..c8b, palette64, gray4)')
    ap.add_argument('--flint', action='store_true', help='solo le card flint (f1..f5)')
    ap.add_argument('--check', action='store_true',
                    help='dopo la scrittura verifica ogni card con photo_prep.py (exit 1 se discorda)')
    ap.add_argument('--verbose', action='store_true', help='con --check stampa anche l\'output di photo_prep')
    ap.add_argument('--selftest', action='store_true', help='autotest del tool ed esce')
    args = ap.parse_args(argv)

    try:
        from PIL import Image                                  # noqa: F401  (serve a render())
    except ImportError:
        print('ERRORE: serve Pillow (pip install Pillow) per scrivere e rileggere i PNG')
        return 2

    if args.selftest:
        return 0 if selftest() else 1

    plats = []
    if args.emery or not args.flint:
        plats.append('emery')
    if args.flint or not args.emery:
        plats.append('flint')

    if args.check and not os.path.exists(PHOTO_PREP):
        print('ERRORE: %s non trovato: --check impossibile' % PHOTO_PREP)
        return 2
    try:
        outdir, written = write_cards(args.out, plats)
    except OSError as e:
        print('ERRORE: non riesco a scrivere in %s (%s)' % (args.out, e))
        return 2
    print_written(outdir, written, notes=not args.check)
    if args.check:
        return 1 if check(outdir, written, args.verbose) else 0
    return 0


if __name__ == '__main__':
    sys.exit(main())

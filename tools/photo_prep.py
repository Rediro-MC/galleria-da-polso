#!/usr/bin/env python3
r"""photo_prep.py — v1 (S2, 27/08/2026): prepara le foto della watchface Galleria.

Produce i due formati raw definiti in apps/galleria/src/c/photo_codec.h:
  raw6  emery 200x228, 4 px -> 3 B (indice 0..63 = r2<<4|g2<<2|b2), riga 150 B, 34.200 B
  raw1  flint 144x168, 1BitPalette MSB-first (1 = bianco), riga 18 B, 3.024 B

La pipeline è la trascrizione FEDELE di quella JavaScript di
docs/ricerca/galleria/05-colore-quantizzazione.md §1.3–1.5 e §2 (la pagina di configurazione di
S6 dovrà produrre lo STESSO raw6 dalla stessa immagine 200x228): stesso fixed point x16, stesso
serpentine, stessi pesi 7/3/5/1 con >>4 (floor, come >> in JS), stesso clamp 0..4080, stessa
q(v) = min(3, (v + 42) // 85), stessa LUT 32^3 per lo spazio "sunlight".
Gli arrotondamenti che in JS sono Math.round (che arrotonda .5 verso +inf, non al pari come round()
di Python) passano da _jsround(): non usare round() nei punti della pipeline.

Dipendenze: solo stdlib + Pillow (12.1.1). Niente numpy: i loop sono in Python puro su liste piatte
di interi: ~0,2 s per foto (45.600 px), +0,2 s una volta sola per la LUT di --sunlight.

Uso tipico:
  python3 tools/photo_prep.py --out apps/galleria/resources/photos --name demo_1 \
          --preview --preview-dir /tmp/prep --stats foto.jpg
  python3 tools/photo_prep.py --stats --band-h 228,168 foto.jpg   # fascia = schermo intero (layout B)

--stats prevede il colore del testo sulla sola fascia dinamica del layout A (106 px su emery,
76 su flint). Per gli altri casi la fascia si passa con --band-h EMERY[,FLINT]: 228,168 = layout B
a tutto schermo, 78,52 = riga singola sotto Quick View, 110 = layout A con content size ExtraLarge
(solo emery: senza il secondo valore flint resta a 76).
  python3 tools/photo_prep.py --fixture apps/galleria/test/fixtures   # fixture del test C
  python3 tools/photo_prep.py --selftest                              # autotest (make pyselftest)
"""

import argparse
import hashlib
import math
import os
import re
import sys
import time
import zlib

# ---------------------------------------------------------------- costanti ---

TOOL_VERSION = 'v1'         # citata in rt_meta.h al posto della data (output riproducibile)

EMERY_W, EMERY_H = 200, 228
FLINT_W, FLINT_H = 144, 168
RAW6_BYTES = 34200          # photo_codec.h: RAW6_ROW_BYTES(150) * RAW6_H(228)
RAW1_BYTES = 3024           # photo_codec.h: RAW1_ROW_BYTES(18)  * RAW1_H(168)
EMERY_BAND_H = 106          # fascia dinamica del layout A: default di --band-h (design galleria §3.1)
FLINT_BAND_H = 76           # idem su flint (§3.3); altre fasce: --band-h 228,168 / 78,52 / 110

# Resa reale dei 64 colori sul pannello ("sunlight correction"), copiata dal dict `mapping` di
# _correct_colours in pebble_tool/commands/screenshot.py: è esattamente ciò che si vede in un
# `pebble screenshot`. Indice = (r//85)<<4 | (g//85)<<2 | b//85, cioè GColor8 & 0x3F.
SUN_RGB = (
    (  0,  0,  0), (  0, 30, 65), (  0, 67,135), (  0,104,202),
    ( 43, 74, 44), ( 39, 81, 79), ( 22, 99,141), (  0,125,206),
    ( 94,152, 96), ( 92,155,114), ( 87,165,162), ( 76,180,219),
    (142,227,145), (142,230,158), (138,235,192), (132,245,241),
    ( 74, 22, 27), ( 72, 39, 72), ( 64, 72,138), ( 47,107,204),
    ( 86, 78, 54), ( 84, 84, 84), ( 79,103,144), ( 65,128,208),
    (117,154,100), (117,157,118), (113,166,164), (105,181,221),
    (158,229,148), (157,231,160), (155,236,194), (149,246,242),
    (153, 53, 63), (152, 62, 90), (149, 86,148), (143,116,210),
    (157, 91, 77), (157, 96,100), (154,112,153), (149,135,213),
    (175,160,114), (174,163,130), (171,171,171), (167,186,226),
    (201,232,157), (201,234,167), (199,240,200), (195,249,247),
    (227, 84, 98), (226, 88,116), (225,106,163), (222,131,220),
    (230,110,107), (230,114,124), (227,127,167), (225,148,223),
    (241,170,134), (241,173,147), (239,181,184), (236,195,235),
    (255,238,171), (255,241,181), (255,246,211), (255,255,255),
)

# Palette RGB222 "cruda" (i valori che il firmware vede davvero): 0/85/170/255 esatti.
PAL_RGB = tuple((((k >> 4) & 3) * 85, ((k >> 2) & 3) * 85, (k & 3) * 85) for k in range(64))

# CRC32 della LUT 32^3 costruita da build_sun_lut(): verificato nel --selftest.
SUN_LUT_CRC32 = 0x48CBD990

LUMA_Y_WHITE_BAD = 77       # luma.h: Y > 77 -> testo bianco sotto 3:1
LUMA_Y_BLACK_BAD = 25       # luma.h: Y < 25 -> testo nero sotto 3:1
LUMA_Y_CROSSOVER = 46       # luma.h: parita' di contrasto bianco/nero
LUMA_HALO_PCT = 15          # luma.h: oltre il 15 % di pixel in conflitto -> contorno

# Fixture del test C (rt = round trip), vedi --fixture.
RT_W, RT_H = 40, 12
RT1_W, RT1_H = 24, 8


def _srgb_to_linear(c):
    """Canale sRGB 0..255 -> lineare 0..1 (WCAG)."""
    v = c / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def _build_lum_sun():
    """Y percettiva (0..255) della resa sunlight dei 64 colori: la tabella LUMA_SUN di luma.c."""
    out = []
    for r, g, b in SUN_RGB:
        y = 0.2126 * _srgb_to_linear(r) + 0.7152 * _srgb_to_linear(g) + 0.0722 * _srgb_to_linear(b)
        out.append(int(round(255.0 * y)))
    return tuple(out)


LUM_SUN = _build_lum_sun()

# Valore atteso (deve coincidere con LUMA_SUN[] di src/c/luma.c): controllato nel --selftest.
LUM_SUN_EXPECTED = (
    0, 3, 15, 36, 14, 18, 28, 49, 65, 69, 80, 100, 160, 165, 175, 195,
    5, 8, 19, 39, 20, 23, 34, 54, 71, 74, 85, 105, 167, 170, 181, 201,
    25, 28, 39, 59, 39, 42, 53, 73, 90, 94, 104, 125, 185, 189, 201, 219,
    60, 62, 74, 94, 74, 77, 87, 108, 125, 129, 140, 160, 218, 223, 234, 255,
)


# ------------------------------------------------------------- primitive ----

def _jsround(x):
    """Math.round di JS: .5 arrotondato verso +infinito (round() di Python arrotonda al pari)."""
    return math.floor(x + 0.5)


def tone_lut(gamma=1.0, lift=0.0):
    """LUT di tono per il MiP (§1.3): t[i] = round(255 * (min(1, lift + (1-lift)*i/255))^gamma).
    gamma 1.0 e lift 0.0 danno l'identità."""
    return [_jsround(255.0 * math.pow(min(1.0, lift + (1.0 - lift) * i / 255.0), gamma))
            for i in range(256)]


def pack6(idx, npix=None):
    """Indici 0..63 -> raw6 (§1.5): 4 px -> 3 B MSB-first. Un ultimo gruppo incompleto viene
    completato con 0 (come raw6_pack di photo_codec.c)."""
    if npix is None:
        npix = len(idx)
    out = bytearray(((npix + 3) // 4) * 3)
    o = 0
    for i in range(0, npix, 4):
        a = idx[i] & 63
        b = idx[i + 1] & 63 if i + 1 < npix else 0
        c = idx[i + 2] & 63 if i + 2 < npix else 0
        d = idx[i + 3] & 63 if i + 3 < npix else 0
        out[o] = (a << 2) | (b >> 4)
        out[o + 1] = ((b & 15) << 4) | (c >> 2)
        out[o + 2] = ((c & 3) << 6) | d
        o += 3
    return bytes(out)


def unpack6(data, npix):
    """Inverso di pack6 (serve solo al --selftest e come riferimento di raw6_unpack)."""
    out = bytearray(npix)
    i = 0
    for o in range(0, (npix + 3) // 4 * 3, 3):
        b0, b1, b2 = data[o], data[o + 1], data[o + 2]
        quad = (b0 >> 2, ((b0 & 3) << 4) | (b1 >> 4), ((b1 & 15) << 2) | (b2 >> 6), b2 & 63)
        for v in quad:
            if i < npix:
                out[i] = v
                i += 1
    return bytes(out)


def pack1(bits, w, h):
    """Pixel 0/1 -> raw1: 1BitPalette MSB-first, pixel x nel bit 0x80 >> (x & 7) del byte x//8,
    riga (w+7)//8 byte, 1 = bianco (design §4.4). NON è il packing LSB-first di
    GBitmapFormat1Bit."""
    stride = (w + 7) // 8
    out = bytearray(stride * h)
    for y in range(h):
        base = y * stride
        row = y * w
        for x in range(w):
            if bits[row + x]:
                out[base + (x >> 3)] |= 0x80 >> (x & 7)
    return bytes(out)


def build_sun_lut():
    """LUT 32x32x32 (§1.4): per ogni colore a 5 bit per canale l'indice di palette la cui RESA
    è più vicina. Aritmetica in double come nel JS di riferimento (R = r * 255 / 31): due celle su
    32.768 sono pareggi che l'aritmetica intera romperebbe in modo diverso."""
    lut = bytearray(32768)
    sun = SUN_RGB
    for r in range(32):
        rr = r * 255 / 31
        base_r = r << 10
        for g in range(32):
            gg = g * 255 / 31
            base_g = base_r | (g << 5)
            for b in range(32):
                bb = b * 255 / 31
                best, bd = 0, 1e12
                for k in range(64):
                    p = sun[k]
                    dr = p[0] - rr
                    dg = p[1] - gg
                    db = p[2] - bb
                    d = dr * dr + dg * dg + db * db
                    if d < bd:
                        bd = d
                        best = k
                lut[base_g | b] = best
    return bytes(lut)


_SUN_LUT_CACHE = None


def sun_lut():
    """La LUT 32^3 costruita una volta sola (0,2 s)."""
    global _SUN_LUT_CACHE
    if _SUN_LUT_CACHE is None:
        _SUN_LUT_CACHE = build_sun_lut()
    return _SUN_LUT_CACHE


def _quant_raw(r, g, b):
    """Colore di palette più vicino in RGB: per canale, nessuna ricerca (§1.4)."""
    qr = 3 if r + 42 >= 255 else (r + 42) // 85
    qg = 3 if g + 42 >= 255 else (g + 42) // 85
    qb = 3 if b + 42 >= 255 else (b + 42) // 85
    return (qr << 4) | (qg << 2) | qb


# --------------------------------------------------------- dithering 64 ----

def dither_fs(px, w, h, lut=None):
    """Floyd-Steinberg serpentine, fixed point x16, errore su due righe (§1.4).
    px = byte RGB piatti (w*h*3). lut = None -> quantizzazione nello spazio RGB crudo;
    altrimenti LUT 32^3 e diffusione dell'errore rispetto alla RESA (--sunlight)."""
    idx = bytearray(w * h)
    tgt = SUN_RGB if lut is not None else PAL_RGB
    cur = [0] * ((w + 2) * 3)
    nxt = [0] * ((w + 2) * 3)
    for y in range(h):
        ltr = (y & 1) == 0
        d = 1 if ltr else -1
        row = y * w
        for i in range(w):
            x = i if ltr else w - 1 - i
            p = (row + x) * 3
            e = (x + 1) * 3
            r = px[p] * 16 + cur[e]
            g = px[p + 1] * 16 + cur[e + 1]
            b = px[p + 2] * 16 + cur[e + 2]
            if r < 0:
                r = 0
            elif r > 4080:
                r = 4080
            if g < 0:
                g = 0
            elif g > 4080:
                g = 4080
            if b < 0:
                b = 0
            elif b > 4080:
                b = 4080
            rr = r >> 4
            gg = g >> 4
            bb = b >> 4
            if lut is not None:
                k = lut[((rr >> 3) << 10) | ((gg >> 3) << 5) | (bb >> 3)]
            else:
                k = _quant_raw(rr, gg, bb)
            idx[row + x] = k
            t = tgt[k]
            er = r - t[0] * 16
            eg = g - t[1] * 16
            eb = b - t[2] * 16
            a = (x + 1 + d) * 3
            c = (x + 1 - d) * 3
            cur[a] += er * 7 >> 4
            cur[a + 1] += eg * 7 >> 4
            cur[a + 2] += eb * 7 >> 4
            nxt[c] += er * 3 >> 4
            nxt[c + 1] += eg * 3 >> 4
            nxt[c + 2] += eb * 3 >> 4
            nxt[e] += er * 5 >> 4
            nxt[e + 1] += eg * 5 >> 4
            nxt[e + 2] += eb * 5 >> 4
            nxt[a] += er >> 4
            nxt[a + 1] += eg >> 4
            nxt[a + 2] += eb >> 4
        cur, nxt = nxt, cur
        nxt = [0] * ((w + 2) * 3)
    return idx


_BAYER4 = (0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5)


def dither_bayer(px, w, h, lut=None):
    """Bayer 4x4 ordinato (§1.4): pattern regolare, nessuna diffusione. Con lut la soglia si
    applica al colore e la scelta passa dalla LUT della resa."""
    idx = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            t = ((_BAYER4[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5) * 85
            p = (row + x) * 3
            if lut is not None:
                v = []
                for c in range(3):
                    q = _jsround(px[p + c] + t)
                    v.append(0 if q < 0 else 255 if q > 255 else q)
                idx[row + x] = lut[((v[0] >> 3) << 10) | ((v[1] >> 3) << 5) | (v[2] >> 3)]
            else:
                q = []
                for c in range(3):
                    n = _jsround((px[p + c] + t) / 85)
                    q.append(0 if n < 0 else 3 if n > 3 else n)
                idx[row + x] = (q[0] << 4) | (q[1] << 2) | q[2]
    return idx


def dither_none(px, w, h, lut=None):
    """Nessun dithering: colore più vicino pixel per pixel (posterizza, ma comprime bene)."""
    idx = bytearray(w * h)
    for i in range(w * h):
        p = i * 3
        r, g, b = px[p], px[p + 1], px[p + 2]
        if lut is not None:
            idx[i] = lut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]
        else:
            idx[i] = _quant_raw(r, g, b)
    return idx


# ----------------------------------------------------------- dithering 1 ----

def to_gray16(px, w, h, tone):
    """Grigio Rec.709 intero ((54R + 183G + 19B) >> 8, i pesi sommano a 256), LUT di tono, x16
    (§2)."""
    g = [0] * (w * h)
    for i in range(w * h):
        p = i * 3
        g[i] = tone[(54 * px[p] + 183 * px[p + 1] + 19 * px[p + 2]) >> 8] * 16
    return g


def dither1_fs(g, w, h):
    """Floyd-Steinberg serpentine a 1 bit, fixed point x16, soglia 2048 (§2). g è modificata."""
    bits = bytearray(w * h)
    for y in range(h):
        ltr = (y & 1) == 0
        d = 1 if ltr else -1
        row = y * w
        nrow = row + w
        for i in range(w):
            x = i if ltr else w - 1 - i
            k = row + x
            v = g[k]
            if v >= 2048:
                bits[k] = 1
                e = v - 4080
            else:
                e = v
            xa = x + d
            xc = x - d
            if 0 <= xa < w:
                g[row + xa] += e * 7 >> 4
            if y + 1 < h:
                if 0 <= xc < w:
                    g[nrow + xc] += e * 3 >> 4
                g[nrow + x] += e * 5 >> 4
                if 0 <= xa < w:
                    g[nrow + xa] += e >> 4
    return bits


_ATKINSON = ((1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2))


def dither1_atkinson(g, w, h):
    """Atkinson a 1 bit: stessi 6 vicini con peso 1/8 ciascuno (§2), più contrasto delle FS.
    Serpentine come le FS (dx specchiato quando si va da destra a sinistra)."""
    bits = bytearray(w * h)
    for y in range(h):
        ltr = (y & 1) == 0
        d = 1 if ltr else -1
        row = y * w
        for i in range(w):
            x = i if ltr else w - 1 - i
            k = row + x
            v = g[k]
            if v >= 2048:
                bits[k] = 1
                e = v - 4080
            else:
                e = v
            e8 = e >> 3
            for dx, dy in _ATKINSON:
                xx = x + dx * d
                yy = y + dy
                if 0 <= xx < w and yy < h:
                    g[yy * w + xx] += e8
    return bits


def dither1_none(g, w, h):
    """Sola soglia a 2048: nessuna diffusione dell'errore."""
    bits = bytearray(w * h)
    for i in range(w * h):
        if g[i] >= 2048:
            bits[i] = 1
    return bits


# --------------------------------------------------------------- ritagli ----

def fit_rect(sw, sh, aw, ah):
    """Rettangolo più grande con rapporto aw:ah che sta in sw x sh (si riduce il lato lungo)."""
    if sw * ah >= sh * aw:
        h = sh
        w = sh * aw // ah
    else:
        w = sw
        h = sw * ah // aw
    return max(1, min(w, sw)), max(1, min(h, sh))


def crop_rect(sw, sh, arg):
    """Rettangolo di crop per emery (rapporto 200:228). arg = None -> centrato e più grande
    possibile; arg = (X, Y, W, H) in pixel sorgente -> ritagliato all'immagine, rapporto forzato
    riducendo il lato lungo e ricentrato dentro il rettangolo chiesto."""
    if arg is None:
        w, h = fit_rect(sw, sh, EMERY_W, EMERY_H)
        return (sw - w) // 2, (sh - h) // 2, w, h
    x, y, w, h = arg
    x = max(0, min(x, sw - 1))
    y = max(0, min(y, sh - 1))
    w = max(1, min(w, sw - x))
    h = max(1, min(h, sh - y))
    fw, fh = fit_rect(w, h, EMERY_W, EMERY_H)
    return x + (w - fw) // 2, y + (h - fh) // 2, fw, fh


def flint_rect(rect):
    """Sotto-rettangolo centrato con rapporto 144:168 dentro il rettangolo di crop di emery."""
    x, y, w, h = rect
    fw, fh = fit_rect(w, h, FLINT_W, FLINT_H)
    return x + (w - fw) // 2, y + (h - fh) // 2, fw, fh


# ----------------------------------------------------------------- stats ----

def stats_emery(idx, w, band_h):
    """Previsione del colore del testo con la regola di luma.h (campionamento 1 px su 2)."""
    tot = nw = nb = acc = 0
    for y in range(0, band_h, 2):
        row = y * w
        for x in range(0, w, 2):
            yy = LUM_SUN[idx[row + x]]
            acc += yy
            tot += 1
            if yy > LUMA_Y_WHITE_BAD:
                nw += 1
            elif yy < LUMA_Y_BLACK_BAD:
                nb += 1
    return _decide(nw, nb, acc // tot if tot else 0, tot, halo_always=False)


def stats_flint(bits, w, band_h):
    """Come stats_emery ma su 1 bit: bad_white = % pixel bianchi, bad_black = % neri, halo sempre."""
    tot = nw = 0
    for y in range(0, band_h, 2):
        row = y * w
        for x in range(0, w, 2):
            nw += bits[row + x]
            tot += 1
    nb = tot - nw
    return _decide(nw, nb, nw * 255 // tot if tot else 0, tot, halo_always=True)


def _decide(nw, nb, mean, tot, halo_always):
    """bad_white/bad_black in percentuale intera come in C; bianco se bad_white < bad_black,
    a parita' se Y medio < 46 (luma.h, nessuna isteresi: previsione a freddo)."""
    bad_white = nw * 100 // tot if tot else 0
    bad_black = nb * 100 // tot if tot else 0
    if bad_white != bad_black:
        white = bad_white < bad_black
    else:
        white = mean < LUMA_Y_CROSSOVER
    bad_pct = bad_white if white else bad_black
    return {'bad_white': bad_white, 'bad_black': bad_black, 'mean': mean, 'samples': tot,
            'white': white, 'bad_pct': bad_pct, 'halo': halo_always or bad_pct > LUMA_HALO_PCT}


# ----------------------------------------------------------- utilità I/O ----

def _it(n):
    """Numero con il punto come separatore delle migliaia."""
    return '{:,}'.format(n).replace(',', '.')


def _pct(n, tot):
    return 100.0 * n / tot if tot else 0.0


def _write(path, data):
    with open(path, 'wb') as f:
        f.write(data)
    return len(data)


def _safe_name(path):
    base = os.path.splitext(os.path.basename(path))[0]
    return ''.join(c if (c.isalnum() or c in '._-') else '_' for c in base) or 'foto'


def output_names(paths, forced=None):
    """(nomi, errore): nome base di uscita per ogni input. Errore se due input darebbero gli
    stessi .raw6/.raw1 (finirebbero sovrascritti in silenzio), cfr. --name con più input."""
    names = [forced if forced else _safe_name(p) for p in paths]
    visti = {}
    for path, name in zip(paths, names):
        if name in visti:
            return names, ('ERRORE: "%s" e "%s" scriverebbero gli stessi %s.raw6/%s.raw1: '
                           'rinomina un input, oppure elaborali uno alla volta con --name'
                           % (visti[name], path, name, name))
        visti[name] = path
    return names, None


def validate_ranges(gamma, lift):
    """Messaggio d'errore per gamma/lift fuori intervallo, o None. Condizioni scritte in
    negativo apposta: con `gamma <= 0` un NaN passerebbe (ogni confronto con NaN è falso) e
    schianterebbe più avanti in _jsround()."""
    if not 0.0 <= lift <= 1.0:
        return 'ERRORE: --lift deve stare fra 0 e 1'
    if not gamma > 0.0:
        return 'ERRORE: --gamma deve essere positivo'
    return None


def _preview_emery(idx, path):
    from PIL import Image
    px = bytearray(EMERY_W * EMERY_H * 3)
    for i, k in enumerate(idx):
        r, g, b = SUN_RGB[k]
        px[i * 3] = r
        px[i * 3 + 1] = g
        px[i * 3 + 2] = b
    img = Image.frombytes('RGB', (EMERY_W, EMERY_H), bytes(px))
    img.resize((EMERY_W * 2, EMERY_H * 2), Image.Resampling.NEAREST).save(path)


def _preview_flint(bits, path):
    from PIL import Image
    img = Image.frombytes('L', (FLINT_W, FLINT_H), bytes(255 if b else 0 for b in bits))
    img.resize((FLINT_W * 2, FLINT_H * 2), Image.Resampling.NEAREST).save(path)


# -------------------------------------------------------------- pipeline ----

def process(path, name, args):
    """Converte una foto: scrive <name>.raw6 e <name>.raw1 (+ anteprime e .idx) e stampa il resoconto."""
    from PIL import Image, ImageOps
    t0 = time.time()
    src = Image.open(path)
    src = ImageOps.exif_transpose(src) or src
    src = src.convert('RGB')
    sw, sh = src.size

    rect = crop_rect(sw, sh, args.crop)
    frect = flint_rect(rect)
    tone = bytes(tone_lut(args.gamma, args.lift))
    lut = sun_lut() if args.sunlight else None

    # --- emery: crop -> 200x228 LANCZOS -> LUT di tono per canale -> dithering -> pack6
    ce = src.crop((rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]))
    ce = ce.resize((EMERY_W, EMERY_H), Image.Resampling.LANCZOS)
    px = ce.tobytes().translate(tone)
    if args.dither == 'fs':
        idx = dither_fs(px, EMERY_W, EMERY_H, lut)
    elif args.dither == 'bayer':
        idx = dither_bayer(px, EMERY_W, EMERY_H, lut)
    else:
        idx = dither_none(px, EMERY_W, EMERY_H, lut)
    raw6 = pack6(idx)

    # --- flint: sotto-rettangolo 144:168 -> 144x168 LANCZOS -> grigio + tono -> 1 bit -> pack1
    cf = src.crop((frect[0], frect[1], frect[0] + frect[2], frect[1] + frect[3]))
    cf = cf.resize((FLINT_W, FLINT_H), Image.Resampling.LANCZOS)
    gray = to_gray16(cf.tobytes(), FLINT_W, FLINT_H, tone)
    if args.bw_dither == 'fs':
        bits = dither1_fs(gray, FLINT_W, FLINT_H)
    elif args.bw_dither == 'atkinson':
        bits = dither1_atkinson(gray, FLINT_W, FLINT_H)
    else:
        bits = dither1_none(gray, FLINT_W, FLINT_H)
    raw1 = pack1(bits, FLINT_W, FLINT_H)

    os.makedirs(args.out, exist_ok=True)
    p6 = os.path.join(args.out, name + '.raw6')
    p1 = os.path.join(args.out, name + '.raw1')
    n6 = _write(p6, raw6)
    n1 = _write(p1, raw1)
    if n6 != RAW6_BYTES or n1 != RAW1_BYTES:
        print('ERRORE: dimensioni inattese %d/%d (attese %d/%d)' % (n6, n1, RAW6_BYTES, RAW1_BYTES))
        return False
    if args.emit_idx:
        _write(os.path.join(args.out, name + '.idx'), bytes(idx))

    nwhite = sum(bits)
    space = 'sunlight' if args.sunlight else 'raw'
    print('%s  <-  %s  (%dx%d)' % (name, path, sw, sh))
    print('  crop emery %d,%d %dx%d   flint %d,%d %dx%d   gamma %.2f  lift %.2f  spazio %s'
          % (rect[0], rect[1], rect[2], rect[3], frect[0], frect[1], frect[2], frect[3],
             args.gamma, args.lift, space))
    print('  emery  %-14s %s B  CRC32 0x%08X  dither %-8s colori usati %d/64'
          % (name + '.raw6', _it(n6), zlib.crc32(raw6), args.dither, len(set(idx))))
    print('  flint  %-14s %s B   CRC32 0x%08X  dither %-8s bianchi %.1f %%'
          % (name + '.raw1', _it(n1), zlib.crc32(raw1), args.bw_dither,
             _pct(nwhite, FLINT_W * FLINT_H)))

    if args.stats:
        band_e, band_f = getattr(args, 'band_h', None) or (EMERY_BAND_H, FLINT_BAND_H)
        se = stats_emery(idx, EMERY_W, band_e)
        sf = stats_flint(bits, FLINT_W, band_f)
        print('  stats emery fascia y 0..%d (%d campioni): bad_white %d %%  bad_black %d %%  '
              'Y medio %d  ->  testo %s, contorno %s'
              % (band_e - 1, se['samples'], se['bad_white'], se['bad_black'], se['mean'],
                 'BIANCO' if se['white'] else 'NERO', 'SI' if se['halo'] else 'no'))
        print('  stats flint fascia y 0..%d (%d campioni): bianchi %d %%  neri %d %%  '
              'Y medio %d  ->  testo %s, contorno %s'
              % (band_f - 1, sf['samples'], sf['bad_white'], sf['bad_black'], sf['mean'],
                 'BIANCO' if sf['white'] else 'NERO', 'SI' if sf['halo'] else 'no'))

    if args.preview:
        pdir = args.preview_dir or args.out
        os.makedirs(pdir, exist_ok=True)
        pe = os.path.join(pdir, name + '_emery_x2.png')
        pf = os.path.join(pdir, name + '_flint_x2.png')
        _preview_emery(idx, pe)
        _preview_flint(bits, pf)
        print('  anteprime  %s   %s' % (pe, pf))
    print('  %.1f s' % (time.time() - t0))
    return True


# -------------------------------------------------------------- fixture ----

def _lcg_indices(n, seed=1):
    """LCG deterministico condiviso con il test C: un avanzamento per pixel, poi (x >> 16) & 63."""
    x = seed
    out = bytearray(n)
    for i in range(n):
        x = (x * 1103515245 + 12345) & 0x7FFFFFFF
        out[i] = (x >> 16) & 63
    return out


def make_fixture_data():
    """(idx, raw6, bits, raw1) delle fixture di test/fixtures/."""
    npix = RT_W * RT_H
    idx = bytearray(npix)
    for i in range(64):
        idx[i] = i
    idx[64:] = _lcg_indices(npix - 64)
    bits = bytearray(RT1_W * RT1_H)
    for y in range(RT1_H):
        for x in range(RT1_W):
            if y == 0:
                v = 1
            elif y == 1:
                v = 0
            else:
                v = 1 if ((x * 7 + y * 3) % 5) < 2 else 0
            bits[y * RT1_W + x] = v
    return bytes(idx), pack6(idx), bytes(bits), pack1(bits, RT1_W, RT1_H)


RT_META_TEMPLATE = """\
/* rt_meta.h — metadati delle fixture del test host di photo_codec.c. FILE GENERATO: non
 * modificarlo a mano, si rigenera con photo_prep.py %s (dalla radice del repo)
 *   python3 tools/photo_prep.py --fixture apps/galleria/test/fixtures
 * Non contiene la data: rigenerandolo si deve riottenere lo stesso file byte per byte (cmp).
 * I test girano con cwd = apps/galleria/test, quindi i percorsi sono "fixtures/rt.*".
 *
 *  rt.idx   %d×%d = %d indici 0..63, 1 byte per pixel: i primi 64 sono 0..63 in sequenza, così
 *           ogni valore a 6 bit compare almeno una volta nel file; NON però in ogni posizione del
 *           gruppo da 4 (in quei primi 64 la posizione k vede solo i valori congrui a k mod 4).
 *           I restanti vengono da un LCG: sull'intero file ciascuna delle 4 posizioni del gruppo
 *           vede %d..%d valori distinti su 64. LCG: x0 = 1; a ogni pixel
 *           x = (x * 1103515245 + 12345) & 0x7fffffff, idx = (x >> 16) & 63.
 *  rt.raw6  raw6_pack(rt.idx): 4 px → 3 B, b0 = p0<<2|p1>>4, b1 = (p1&15)<<4|p2>>2, b2 = (p2&3)<<6|p3.
 *  rt.bits  %d×%d = %d pixel 0/1, 1 byte per pixel: riga 0 tutta 1, riga 1 tutta 0, poi
 *           bit = ((x*7 + y*3) %% 5) < 2.
 *  rt.raw1  pack1(rt.bits): 1BitPalette MSB-first, pixel x nel bit 0x80 >> (x & 7) del byte x/8,
 *           riga (W+7)/8 = %d B, 1 = bianco.
 *
 * I CRC32 sono zlib.crc32 sui byte del file, cioè crc32_update(0, dati, len) di src/c/crc.c. */
#ifndef GALLERIA_RT_META_H
#define GALLERIA_RT_META_H

#define RT_W            %d
#define RT_H            %d
#define RT_RAW6_LEN     %d
#define RT_RAW6_CRC32   0x%08Xu

#define RT1_W           %d
#define RT1_H           %d
#define RT_RAW1_LEN     %d
#define RT_RAW1_CRC32   0x%08Xu

#endif /* GALLERIA_RT_META_H */
"""


def idx_pos_coverage(idx):
    """(min, max) dei valori 0..63 distinti visti da ciascuna delle 4 posizioni del gruppo da 4."""
    counts = [len(set(idx[k::4])) for k in range(4)]
    return min(counts), max(counts)


def render_rt_meta(idx, raw6, raw1):
    """Testo di rt_meta.h. Dipende SOLO dalle fixture: nessuna data, nessun percorso assoluto,
    così `--fixture` in un altro giorno riproduce il file byte per byte (verificabile con cmp)."""
    lo, hi = idx_pos_coverage(idx)
    return RT_META_TEMPLATE % (
        TOOL_VERSION,
        RT_W, RT_H, RT_W * RT_H, lo, hi,
        RT1_W, RT1_H, RT1_W * RT1_H, (RT1_W + 7) // 8,
        RT_W, RT_H, len(raw6), zlib.crc32(raw6),
        RT1_W, RT1_H, len(raw1), zlib.crc32(raw1))


def write_fixtures(dirpath):
    idx, raw6, bits, raw1 = make_fixture_data()
    os.makedirs(dirpath, exist_ok=True)
    _write(os.path.join(dirpath, 'rt.idx'), idx)
    _write(os.path.join(dirpath, 'rt.raw6'), raw6)
    _write(os.path.join(dirpath, 'rt.bits'), bits)
    _write(os.path.join(dirpath, 'rt.raw1'), raw1)
    with open(os.path.join(dirpath, 'rt_meta.h'), 'w') as f:
        f.write(render_rt_meta(idx, raw6, raw1))
    print('fixture in %s:' % dirpath)
    print('  rt.idx   %5d B  (%dx%d indici 0..63)' % (len(idx), RT_W, RT_H))
    print('  rt.raw6  %5d B  CRC32 0x%08X' % (len(raw6), zlib.crc32(raw6)))
    print('  rt.bits  %5d B  (%dx%d pixel 0/1)' % (len(bits), RT1_W, RT1_H))
    print('  rt.raw1  %5d B  CRC32 0x%08X' % (len(raw1), zlib.crc32(raw1)))
    print('  rt_meta.h')
    return True


# ------------------------------------------------------------- selftest ----

class _T(object):
    """Contatore pass/fail in stile test/test_*.c."""

    def __init__(self):
        self.ok = 0
        self.fail = 0

    def check(self, cond, what):
        if cond:
            self.ok += 1
        else:
            self.fail += 1
            print('FAIL %s' % what)


def selftest():
    t = _T()

    # --- pack6/unpack6: tutti i 64 valori, in ogni posizione del gruppo da 4
    seq = bytes(range(64))
    p = pack6(seq)
    t.check(len(p) == 48, 'pack6(64 px) = 48 B (ha dato %d)' % len(p))
    t.check(unpack6(p, 64) == seq, 'unpack6(pack6(0..63)) identità')
    # vettore calcolato a mano: 0x3F,0x00,0x2A,0x15 -> FC 0A 95
    t.check(pack6(bytes((0x3F, 0x00, 0x2A, 0x15))) == b'\xFC\x0A\x95', 'pack6 vettore a mano')
    t.check(pack6(bytes((0x01, 0x02, 0x03, 0x04))) == b'\x04\x20\xC4', 'pack6 vettore a mano 2')
    lcg = _lcg_indices(480)
    p = pack6(lcg)
    t.check(len(p) == 360, 'pack6(480 px) = 360 B (ha dato %d)' % len(p))
    t.check(unpack6(p, 480) == bytes(lcg), 'unpack6(pack6(LCG 480)) identità')
    t.check(max(lcg) <= 63, 'indici LCG in 0..63')
    # gruppo incompleto completato con 0
    t.check(pack6(bytes((0x3F, 0x3F))) == b'\xFF\xF0\x00', 'pack6 gruppo incompleto')

    # --- pack1: ordine dei bit MSB-first, byte per byte
    one = bytearray(8)
    one[0] = 1
    t.check(pack1(one, 8, 1) == b'\x80', 'pack1 pixel 0 -> bit 0x80')
    one = bytearray(8)
    one[7] = 1
    t.check(pack1(one, 8, 1) == b'\x01', 'pack1 pixel 7 -> bit 0x01')
    row = bytearray(24)
    for x in (0, 1, 8, 15, 16, 23):
        row[x] = 1
    t.check(pack1(row, 24, 1) == b'\xC0\x81\x81', 'pack1 riga 24 px (3 B)')
    two = bytearray(48)
    two[0] = 1
    two[24 + 23] = 1
    t.check(pack1(two, 24, 2) == b'\x80\x00\x00\x00\x00\x01', 'pack1 due righe, stride 3 B')
    _, _, bits, raw1 = make_fixture_data()
    t.check(len(raw1) == 24 and raw1[0:3] == b'\xFF\xFF\xFF' and raw1[3:6] == b'\x00\x00\x00',
            'fixture rt.raw1: riga 0 bianca, riga 1 nera')
    t.check(len(bits) == RT1_W * RT1_H, 'fixture rt.bits = %d B' % (RT1_W * RT1_H))

    # --- rt_meta.h: riproducibile (niente data) e coerente con le fixture
    idx, raw6, _, raw1 = make_fixture_data()
    meta = render_rt_meta(idx, raw6, raw1)
    t.check(meta == render_rt_meta(idx, raw6, raw1), 'render_rt_meta deterministico')
    t.check(re.search(r'\d{1,2}/\d{1,2}/\d{4}', meta) is None,
            'rt_meta.h non contiene una data (sarebbe un diff spurio a ogni rigenerazione)')
    orig_strftime = time.strftime
    try:      # nessun campo deve venire dall'orologio
        time.strftime = lambda *a, **k: 'DATA-FINTA'
        t.check(render_rt_meta(idx, raw6, raw1) == meta, 'render_rt_meta non usa time.strftime')
    finally:
        time.strftime = orig_strftime
    t.check(('0x%08Xu' % zlib.crc32(raw6)) in meta and ('0x%08Xu' % zlib.crc32(raw1)) in meta,
            'rt_meta.h riporta i CRC32 delle fixture')

    # --- fixture rt.idx: la copertura dichiarata nel commento è quella vera
    t.check(set(idx) == set(range(64)), 'rt.idx: tutti i 64 valori presenti almeno una volta')
    t.check(bytes(idx[:64]) == bytes(range(64)), 'rt.idx: i primi 64 sono 0..63 in sequenza')
    lo, hi = idx_pos_coverage(idx)
    t.check(1 <= lo <= hi <= 64, 'idx_pos_coverage in 1..64 (ha dato %d..%d)' % (lo, hi))
    t.check(hi < 64, 'nessuna posizione del gruppo da 4 vede tutti i 64 valori (max %d)' % hi)
    t.check(('%d..%d valori distinti' % (lo, hi)) in meta,
            'rt_meta.h dichiara la copertura misurata (%d..%d)' % (lo, hi))
    t.check(idx_pos_coverage(bytes(range(64)) * 4) == (16, 16),
            'idx_pos_coverage su 0..63 ripetuto = 16 per posizione')

    # --- output_names: due input con lo stesso basename non si sovrascrivono in silenzio
    names, err = output_names(['a/foto.png', 'b/altra.jpg'])
    t.check(names == ['foto', 'altra'] and err is None, 'output_names: basename distinti')
    names, err = output_names(['a/foto.png', 'b/foto.jpg'])
    t.check(err is not None and 'foto.raw6' in err, 'output_names: collisione rifiutata')
    t.check(output_names(['a/x y.png'])[0] == ['x_y'], 'output_names: caratteri non alfanumerici')
    t.check(output_names(['a/foto.png'], 'demo_1')[0] == ['demo_1'], 'output_names: --name')

    # --- validate_ranges: NaN respinto con un messaggio, non con un traceback
    t.check(validate_ranges(1.0, 0.0) is None, 'validate_ranges: default validi')
    t.check(validate_ranges(2.2, 1.0) is None, 'validate_ranges: gamma 2.2 / lift 1 validi')
    nan = float('nan')
    t.check('gamma' in (validate_ranges(nan, 0.0) or ''), 'validate_ranges: --gamma nan respinto')
    t.check('lift' in (validate_ranges(1.0, nan) or ''), 'validate_ranges: --lift nan respinto')
    t.check(validate_ranges(0.0, 0.0) is not None, 'validate_ranges: --gamma 0 respinto')
    t.check(validate_ranges(-1.0, 0.0) is not None, 'validate_ranges: --gamma negativo respinto')
    t.check(validate_ranges(1.0, 1.5) is not None, 'validate_ranges: --lift 1.5 respinto')

    # --- CRC32 (stesso di src/c/crc.c e della config page)
    t.check(zlib.crc32(b'123456789') == 0xCBF43926, 'crc32("123456789") = 0xCBF43926')

    # --- tabelle
    t.check(tuple(LUM_SUN) == LUM_SUN_EXPECTED, 'LUM_SUN uguale a LUMA_SUN[] di luma.c')
    t.check(len(SUN_RGB) == 64 and SUN_RGB[0] == (0, 0, 0) and SUN_RGB[63] == (255, 255, 255),
            'SUN_RGB estremi')
    t.check(tone_lut(1.0, 0.0) == list(range(256)), 'toneLUT(1.0, 0) = identità')
    t.check(tone_lut(1.0, 1.0) == [255] * 256, 'toneLUT(*, lift 1) = tutto bianco')
    t.check(len(sun_lut()) == 32768 and zlib.crc32(sun_lut()) == SUN_LUT_CRC32,
            'LUT 32^3 sunlight CRC32 = 0x%08X (ha dato 0x%08X)' % (SUN_LUT_CRC32,
                                                                   zlib.crc32(sun_lut())))
    t.check(sun_lut()[0] == 0 and sun_lut()[32767] == 63, 'LUT sunlight estremi')
    t.check(_quant_raw(0, 42, 43) == 0x01 and _quant_raw(255, 255, 255) == 0x3F,
            'q(v) = min(3, (v + 42) // 85)')
    t.check(_jsround(0.5) == 1 and _jsround(1.5) == 2 and _jsround(-0.5) == 0,
            '_jsround = Math.round di JS')

    # --- Floyd-Steinberg deterministico su un gradiente sintetico
    w, h = EMERY_W, EMERY_H
    px = bytearray(w * h * 3)
    for y in range(h):
        for x in range(w):
            p = (y * w + x) * 3
            px[p] = x * 255 // (w - 1)
            px[p + 1] = y * 255 // (h - 1)
            px[p + 2] = (x + y) * 255 // (w + h - 2)
    px = bytes(px)
    a = pack6(dither_fs(px, w, h, None))
    b = pack6(dither_fs(px, w, h, None))
    t.check(a == b, 'FS raw deterministico')
    t.check(len(a) == RAW6_BYTES, 'FS raw -> %d B (ha dato %d)' % (RAW6_BYTES, len(a)))
    s = pack6(dither_fs(px, w, h, sun_lut()))
    t.check(s != a, 'FS sunlight diverso da FS raw')
    g = to_gray16(px, w, h, bytes(tone_lut(1.0, 0.0)))
    b1 = pack1(dither1_fs(list(g), w, h), w, h)
    b2 = pack1(dither1_fs(list(g), w, h), w, h)
    t.check(b1 == b2, 'FS 1 bit deterministico')
    at = pack1(dither1_atkinson(list(g), w, h), w, h)
    t.check(at != b1, 'Atkinson diverso da FS')
    print('sha256 gradiente 200x228: FS raw      %s' % hashlib.sha256(a).hexdigest())
    print('                          FS sunlight %s' % hashlib.sha256(s).hexdigest())
    print('                          FS 1 bit    %s' % hashlib.sha256(b1).hexdigest())
    print('                          Atkinson    %s' % hashlib.sha256(at).hexdigest())

    print('photo_prep selftest: %d ok, %d falliti' % (t.ok, t.fail))
    return t.fail == 0


# ------------------------------------------------------------------ main ----

def _parse_crop(s):
    parts = s.split(',')
    if len(parts) != 4:
        raise argparse.ArgumentTypeError('formato atteso X,Y,W,H (pixel sorgente)')
    try:
        v = [int(p) for p in parts]
    except ValueError:
        raise argparse.ArgumentTypeError('X,Y,W,H devono essere interi')
    if v[2] <= 0 or v[3] <= 0:
        raise argparse.ArgumentTypeError('W e H devono essere positivi')
    return tuple(v)


def _parse_band_h(spec):
    """--band-h EMERY[,FLINT]: altezza della fascia su cui --stats prevede il colore del testo."""
    parts = [p.strip() for p in str(spec).split(',')]
    if len(parts) > 2 or any(p == '' for p in parts):
        raise argparse.ArgumentTypeError('formato atteso EMERY[,FLINT] (es. 106,76 oppure 110)')
    try:
        v = [int(p) for p in parts]
    except ValueError:
        raise argparse.ArgumentTypeError('EMERY e FLINT devono essere interi')
    if len(v) == 1:
        v.append(FLINT_BAND_H)
    if not 1 <= v[0] <= EMERY_H:
        raise argparse.ArgumentTypeError('EMERY fuori intervallo 1..%d' % EMERY_H)
    if not 1 <= v[1] <= FLINT_H:
        raise argparse.ArgumentTypeError('FLINT fuori intervallo 1..%d' % FLINT_H)
    return (v[0], v[1])


def main(argv=None):
    ap = argparse.ArgumentParser(
        description='Prepara foto raw6 (emery 200x228) e raw1 (flint 144x168) per Galleria.',
        epilog='Formati: apps/galleria/src/c/photo_codec.h. Pipeline: '
               'docs/ricerca/galleria/05-colore-quantizzazione.md §1.3–1.5 e §2.')
    ap.add_argument('inputs', nargs='*', metavar='FOTO', help='immagini sorgente (jpg/png/...)')
    ap.add_argument('--out', default='.', metavar='DIR', help='cartella dei .raw6/.raw1 (default: .)')
    ap.add_argument('--name', metavar='NOME', help='nome base dei file (solo con un input)')
    ap.add_argument('--crop', type=_parse_crop, metavar='X,Y,W,H',
                    help='ritaglio in pixel sorgente; il rapporto viene forzato a 200:228')
    ap.add_argument('--gamma', type=float, default=1.0, metavar='G', help='LUT di tono (default 1.0)')
    ap.add_argument('--lift', type=float, default=0.0, metavar='L',
                    help='sollevamento dei neri 0..1 (default 0)')
    ap.add_argument('--dither', choices=('fs', 'bayer', 'none'), default='fs',
                    help='dithering emery (default fs)')
    ap.add_argument('--bw-dither', choices=('fs', 'atkinson', 'none'), default='fs',
                    help='dithering flint (default fs)')
    ap.add_argument('--sunlight', action='store_true',
                    help='quantizza nello spazio della resa del pannello (LUT 32^3)')
    ap.add_argument('--preview', action='store_true', help='scrive le anteprime PNG x2')
    ap.add_argument('--preview-dir', metavar='DIR', help='cartella delle anteprime (default: --out)')
    ap.add_argument('--emit-idx', action='store_true', help='scrive anche <nome>.idx (1 byte/px)')
    ap.add_argument('--stats', action='store_true',
                    help='previsione del colore del testo con la regola di luma.h (fascia del '
                         'layout A, vedi --band-h)')
    ap.add_argument('--band-h', type=_parse_band_h, default=(EMERY_BAND_H, FLINT_BAND_H),
                    metavar='EMERY[,FLINT]',
                    help='altezza della fascia di --stats in px (default %d,%d = layout A); '
                         '228,168 = layout B a tutto schermo, 78,52 = riga singola sotto Quick '
                         'View, 110 = layout A con content size ExtraLarge (flint resta %d)'
                         % (EMERY_BAND_H, FLINT_BAND_H, FLINT_BAND_H))
    ap.add_argument('--fixture', metavar='DIR', help='scrive le fixture del test C e esce')
    ap.add_argument('--selftest', action='store_true', help='autotest del tool e esce')
    args = ap.parse_args(argv)

    if args.selftest:
        return 0 if selftest() else 1
    if args.fixture:
        return 0 if write_fixtures(args.fixture) else 1
    if not args.inputs:
        ap.print_help()
        return 1
    if args.name and len(args.inputs) > 1:
        print('ERRORE: --name vale solo con un input (con più foto il nome viene dal file)')
        return 1
    err = validate_ranges(args.gamma, args.lift)
    if err:
        print(err)
        return 1
    names, err = output_names(args.inputs, args.name)
    if err:
        print(err)
        return 1

    rc = 0
    for path, name in zip(args.inputs, names):
        if not process(path, name, args):
            rc = 1
    return rc


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
r"""gen_font_previews.py — v2 (S6, compito B1): anteprime dei font per la config page.

Rasterizza la stringa "12:34" con i tre TTF dell'app (Anton, Bebas Neue, Barlow Condensed
Bold) in **bianco su nero**, la riduce a **1 bit**, la ritaglia sull'inchiostro e la salva
come PNG ottimizzato; i tre PNG finiscono come data-URL dentro

    apps/galleria/src/pkjs/config/previews.js

nello schema UMD della specifica S6 §1 (nel browser `window.GalPreviews = {anton, bebas,
barlow}`, in node `module.exports`). Il file viene inlinato nella config page
(`tools/build_config_page.py`), quindi:

  * ES5 puro, nessun template literal (il file finisce dentro una stringa JSON);
  * niente `</script>` e nessun backtick nel contenuto generato;
  * **totale del file <= 4096 B** (`--max-bytes`): se sfora, l'altezza viene ridotta di 2 px
    per volta (28 -> 26 -> 24 ...) finché ci sta, e la cosa viene stampata.

**v2 (finding M7-tool, 30/08): rasterizzazione a 4x + LANCZOS + soglia.** La v1 tirava la
soglia (128) direttamente sul rendering antialiasato alla pixel size finale: a 28 px di
inchiostro i tre font condensati venivano fuori con i tratti al minimo consentito dalla
griglia (arco del "3" e diagonale del "4" spessi 2 px), e bastava un ridimensionamento di
un paio di pixel nella pagina per spezzarli — nel gate le anteprime si leggevano male.
Ora si rasterizza a `SUPERSAMPLE`x la dimensione finale, si riduce con LANCZOS (che media
la copertura reale del glifo) e solo allora si applica la soglia, tenuta a `THRESHOLD` =
100 invece di 128: un pixel si accende se il glifo lo copre per circa il 40%, non per il
50%. A parità di pixel size l'inchiostro cresce del 4-8% e i tratti sottili passano da 2 a
3 px, restando pieni anche se il browser ridimensiona l'immagine.

⚠ L'immagine va mostrata **1:1** (`height: 28px` di CONTENUTO): un ridimensionamento non
intero di un PNG a 1 bit con `image-rendering: pixelated` butta via righe e colonne intere
e nessuna rasterizzazione lo può compensare del tutto (vedi `--selftest`, ultimo controllo).

Altezza: 28 px di *inchiostro* (non di em). Per ogni font si cerca la pixel size più grande
per cui l'altezza del bounding box dell'inchiostro di "12:34" è <= all'altezza richiesta
(ricerca lineare dal basso, ci si ferma alla prima px che sfora) — stessa logica di
`tools/gen_digits.py`, così i tre campioni hanno cifre della stessa altezza reale e si
possono confrontare a occhio nella pagina.

Uso:

    python3 tools/gen_font_previews.py                 # rigenera previews.js
    python3 tools/gen_font_previews.py --check         # verifica che sia aggiornato (exit 1 se no)
    python3 tools/gen_font_previews.py --png-dir /tmp/prev   # salva anche i tre PNG su disco
    python3 tools/gen_font_previews.py --selftest      # prova il generatore (qualità dei glifi)

Deterministico: nessuna data, nessun percorso assoluto e nessun timestamp finisce
nell'output (Pillow non scrive il chunk tIME), quindi due esecuzioni danno gli stessi byte.
"""

import argparse
import base64
import contextlib
import io
import os
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:                                    # pragma: no cover
    sys.stderr.write("errore: serve Pillow (python3 -c 'import PIL')\n")
    sys.exit(1)

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.normpath(os.path.join(TOOLS_DIR, "..", "apps", "galleria"))
DEF_FONTS = os.path.join(APP_DIR, "resources", "fonts")
DEF_OUT = os.path.join(APP_DIR, "src", "pkjs", "config", "previews.js")

# chiave JS -> file TTF (l'ordine è quello degli indici del campo `font`: 0 Anton, 1 Bebas,
# 2 Barlow; il font 3 è LECO di sistema e non ha anteprima)
FONTS = [
    ("anton", "Anton-Regular.ttf"),
    ("bebas", "BebasNeue-Regular.ttf"),
    ("barlow", "BarlowCondensed-Bold.ttf"),
]

TEXT = "12:34"
HEIGHT = 28
MAX_BYTES = 4096
MIN_HEIGHT = 12
SUPERSAMPLE = 4          # rasterizzazione a 4x, poi LANCZOS: vedi il commento in testa
THRESHOLD = 100          # copertura ~40% (a 128 i tratti restano al minimo e si spezzano)
LEGACY_THRESHOLD = 128   # la soglia della v1 (serve solo al --selftest, per il confronto)


class GenError(Exception):
    pass


def render_bw(ttf_path, px, text, ss=SUPERSAMPLE, threshold=THRESHOLD):
    """Rasterizza `text` a pixel size `px` e ritorna l'immagine 1 bit ritagliata
    sull'inchiostro (bianco su nero), oppure None se non c'è inchiostro.

    Con `ss` > 1 si disegna a `px * ss` e si riduce con LANCZOS prima della soglia: il grigio
    che ne esce è la copertura reale del glifo, e la soglia taglia lì invece che sui
    pixel-fantasma dell'antialias alla dimensione finale (v2).
    """
    try:
        font = ImageFont.truetype(ttf_path, px * ss)
    except Exception as exc:                           # pragma: no cover
        raise GenError("font non leggibile %s: %s" % (os.path.basename(ttf_path), exc))
    pad = (px + 8) * ss
    canvas_w = px * ss * (len(text) + 2) + 2 * pad
    canvas_h = px * ss * 3 + 2 * pad
    img = Image.new("L", (canvas_w, canvas_h), 0)
    draw = ImageDraw.Draw(img)
    draw.text((pad, pad), text, font=font, fill=255)
    if ss > 1:
        img = img.resize((canvas_w // ss, canvas_h // ss), Image.LANCZOS)
    # soglia netta: niente dithering (1 bit puro), ma su un grigio che vale copertura
    bw = img.point(lambda v: 255 if v >= threshold else 0).convert("1", dither=Image.NONE)
    box = bw.getbbox()
    if box is None:
        return None
    return bw.crop(box)


def fit_height(ttf_path, text, target_h, ss=SUPERSAMPLE, threshold=THRESHOLD):
    """px più grande la cui altezza d'inchiostro sta in target_h (+ immagine ritagliata)."""
    best = None
    px = max(4, target_h // 2)
    limit = target_h * 6 + 32
    while px <= limit:
        img = render_bw(ttf_path, px, text, ss=ss, threshold=threshold)
        if img is not None:
            if img.height > target_h:
                break
            best = (px, img)
        px += 1
    if best is None:
        raise GenError("nessuna pixel size utile per %s a %d px"
                       % (os.path.basename(ttf_path), target_h))
    return best


# ------------------------------------------------ qualità dei glifi (selftest) ----

def _bits(img):
    """(matrice di bool dell'inchiostro, larghezza, altezza)."""
    grey = img.convert("L")
    w, h = grey.size
    px = grey.load()
    return [[px[x, y] > 127 for x in range(w)] for y in range(h)], w, h


def glyph_stats(img):
    """Numeri sulla «pienezza» dei glifi (li usa --selftest, non la generazione).

    ink        pixel accesi / area
    isolated   pixel accesi senza nemmeno un vicino ortogonale acceso (i «puntini bianchi»)
    holes      pixel spenti circondati su tutti e quattro i lati (i «puntini neri»)
    thin1      pixel accesi il cui tratto (il minore fra la corsa orizzontale e quella
               verticale) è di 1 px solo: sono quelli che spariscono al primo
               ridimensionamento della pagina
    """
    bits, w, h = _bits(img)
    total = w * h
    ink = sum(row.count(True) for row in bits)
    hor = [[0] * w for _ in range(h)]
    ver = [[0] * w for _ in range(h)]
    for y in range(h):
        x = 0
        while x < w:
            if bits[y][x]:
                x2 = x
                while x2 < w and bits[y][x2]:
                    x2 += 1
                for i in range(x, x2):
                    hor[y][i] = x2 - x
                x = x2
            else:
                x += 1
    for x in range(w):
        y = 0
        while y < h:
            if bits[y][x]:
                y2 = y
                while y2 < h and bits[y2][x]:
                    y2 += 1
                for i in range(y, y2):
                    ver[i][x] = y2 - y
                y = y2
            else:
                y += 1

    def on(x, y):
        return 0 <= x < w and 0 <= y < h and bits[y][x]

    isolated = holes = thin1 = 0
    for y in range(h):
        for x in range(w):
            near = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if on(x + dx, y + dy))
            if bits[y][x]:
                if near == 0:
                    isolated += 1
                if min(hor[y][x], ver[y][x]) <= 1:
                    thin1 += 1
            elif near == 4:
                holes += 1
    return {"w": w, "h": h, "pixels": ink, "ink": ink / float(total) if total else 0.0,
            "isolated": isolated, "holes": holes, "thin1": thin1}


def shrink_nearest(img, height):
    """L'immagine ridotta come farebbe il browser con `image-rendering: pixelated`
    (nearest neighbour, rapporto non intero): serve solo a misurare il danno."""
    w = max(1, int(round(img.width * float(height) / img.height)))
    return img.convert("L").resize((w, height), Image.NEAREST)


# --------------------------------------------------------------- generazione ----

def png_bytes(img):
    """PNG 1 bit ottimizzato (bit depth 1: Pillow lo fa da sé per il modo '1')."""
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True, compress_level=9)
    return buf.getvalue()


def data_url(raw):
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def build_js(entries, height):
    """entries = [(chiave, data-url, larghezza, altezza)] -> testo di previews.js (ES5, UMD)."""
    lines = []
    lines.append("/* GENERATO da tools/gen_font_previews.py (S6): non modificare a mano. */")
    lines.append("/* Anteprime dei font per la config page: \"%s\" a 1 bit, inchiostro alto %d px"
                 % (TEXT, height))
    lines.append(" * (rasterizzato a %dx e ridotto con LANCZOS prima della soglia: glifi pieni)."
                 % SUPERSAMPLE)
    lines.append(" * Chiavi = indici del campo 'font' (0 Anton, 1 Bebas Neue, 2 Barlow Condensed;")
    lines.append(" * il 3 e' LECO di sistema e non ha anteprima). Bianco su nero, PNG data-URL.")
    lines.append(" * Da mostrare 1:1 (28 px di CONTENUTO): ridimensionata perde righe e colonne. */")
    lines.append("(function (root, factory) {")
    lines.append("  if (typeof module === 'object' && module.exports) { module.exports = factory(); }")
    lines.append("  else { root.GalPreviews = factory(); }")
    lines.append("}(this, function () {")
    lines.append("  return {")
    for i, (key, url, w, h) in enumerate(entries):
        comma = "," if i + 1 < len(entries) else ""
        lines.append("    /* %d x %d */" % (w, h))
        lines.append("    %s: '%s'%s" % (key, url, comma))
    lines.append("  };")
    lines.append("}));")
    return "\n".join(lines) + "\n"


def generate(fonts_dir, text, height, max_bytes, png_dir=None):
    """Ritorna (testo di previews.js, altezza usata, [(chiave, px, w, h, byte del PNG)])."""
    h = height
    while True:
        entries = []
        info = []
        for key, fname in FONTS:
            path = os.path.join(fonts_dir, fname)
            if not os.path.isfile(path):
                raise GenError("font mancante: %s" % path)
            px, img = fit_height(path, text, h)
            raw = png_bytes(img)
            entries.append((key, data_url(raw), img.width, img.height))
            info.append((key, px, img.width, img.height, raw))
        js = build_js(entries, h)
        if len(js.encode("utf-8")) <= max_bytes or h <= MIN_HEIGHT:
            break
        h -= 2
    if png_dir:
        if not os.path.isdir(png_dir):
            os.makedirs(png_dir)
        for key, px, w, hh, raw in info:
            with open(os.path.join(png_dir, key + ".png"), "wb") as fh:
                fh.write(raw)
    return js, h, info


# ------------------------------------------------------------------ selftest ----

def selftest(fonts_dir, out_path, text=TEXT, height=HEIGHT, max_bytes=MAX_BYTES, verbose=False):
    """Prova il generatore: determinismo, qualità dei glifi, forma del file, --check."""
    results = []

    def check(label, cond, detail=""):
        results.append((label, bool(cond), detail))
        return bool(cond)

    try:
        js, used_h, info = generate(fonts_dir, text, height, max_bytes)
        js2, used_h2, _i2 = generate(fonts_dir, text, height, max_bytes)
        check("due generazioni danno gli stessi byte (nessuna data, nessun timestamp)",
              js == js2 and used_h == used_h2, "%d B" % len(js.encode("utf-8")))
        check("altezza richiesta ottenuta senza ridurre (%d px)" % height, used_h == height,
              "usata %d px" % used_h)

        for key, fname in FONTS:
            path = os.path.join(fonts_dir, fname)
            px, img = fit_height(path, text, height)
            st = glyph_stats(img)
            check("%s: l'inchiostro è alto esattamente %d px (si mostra 1:1, senza scalare)"
                  % (key, height), img.height == height, "%dx%d px, size %d" % (img.width, img.height, px))
            check("%s: nessun pixel isolato e nessun buco chiuso (i «puntini» del gate)" % key,
                  st["isolated"] == 0 and st["holes"] == 0,
                  "isolati %d, buchi %d" % (st["isolated"], st["holes"]))
            check("%s: quasi nessun tratto da 1 px (<= 1,5%% dell'inchiostro)" % key,
                  st["thin1"] <= max(2, int(st["pixels"] * 0.015)),
                  "thin1 %d su %d pixel accesi" % (st["thin1"], st["pixels"]))
            check("%s: glifi pieni (inchiostro >= 35%% del riquadro)" % key, st["ink"] >= 0.35,
                  "%.1f%%" % (100.0 * st["ink"]))
            # v2 contro v1: a parità di pixel size il rendering 4x+LANCZOS accende PIÙ pixel
            old = render_bw(path, px, text, ss=1, threshold=LEGACY_THRESHOLD)
            old_ink = glyph_stats(old)["pixels"] if old is not None else 0
            check("%s: la rasterizzazione a %dx dà più inchiostro della soglia secca della v1"
                  % (key, SUPERSAMPLE), st["pixels"] > old_ink,
                  "%d pixel contro %d (+%.1f%%)"
                  % (st["pixels"], old_ink, 100.0 * (st["pixels"] - old_ink) / max(1, old_ink)))
            bigger = render_bw(path, px + 1, text)
            check("%s: fit_height ha preso la pixel size più grande possibile" % key,
                  bigger is not None and bigger.height > height,
                  "a %d px l'inchiostro sarebbe alto %s" % (px + 1, bigger and bigger.height))

        blob = js.encode("utf-8")
        check("previews.js entro il tetto (%d B)" % max_bytes, len(blob) <= max_bytes,
              "%d B" % len(blob))
        check("previews.js è ASCII puro, senza backtick e senza il marcatore di chiusura script",
              blob.decode("utf-8").isascii() and "`" not in js and "</script" not in js.lower())
        check("previews.js espone le tre chiavi dei font",
              all(("\n    %s: 'data:image/png;base64," % key) in js for key, _f in FONTS))
        check("previews.js sul disco è aggiornato (come `--check`)",
              os.path.isfile(out_path) and io.open(out_path, "rb").read() == blob,
              out_path)

        stretto = len(blob) - 40
        small_js, small_h, _i = generate(fonts_dir, text, height, stretto)
        check("con un tetto stretto (%d B) l'altezza scende e il file ci sta" % stretto,
              small_h < height and len(small_js.encode("utf-8")) <= stretto,
              "altezza %d px, %d B" % (small_h, len(small_js.encode("utf-8"))))
        _js_min, h_min, _i = generate(fonts_dir, text, height, 200)
        check("il tetto impossibile ferma la riduzione al minimo (%d px), non a zero" % MIN_HEIGHT,
              h_min == MIN_HEIGHT, "altezza %d px" % h_min)
        try:
            generate(os.path.join(fonts_dir, "non-esiste"), text, height, max_bytes)
            check("cartella dei font sbagliata → GenError", False, "nessun errore")
        except GenError as exc:
            check("cartella dei font sbagliata → GenError", "font mancante" in str(exc),
                  str(exc)[:70])
        muto = io.StringIO()
        with contextlib.redirect_stderr(muto):
            rc_basso = main(["--height", str(MIN_HEIGHT - 1)])
        check("--height sotto il minimo → exit 1 con messaggio su stderr",
              rc_basso == 1 and "deve essere" in muto.getvalue(), muto.getvalue().strip()[:60])

        # Il danno che la pagina può ancora fare da sé: se il CSS mostra il PNG a un'altezza
        # diversa da quella vera (p.es. `height: 28px` con `box-sizing: border-box` + bordo
        # 1 px => 26 px di contenuto), `image-rendering: pixelated` butta via righe e colonne.
        key0, fname0 = FONTS[0]
        _px0, img0 = fit_height(os.path.join(fonts_dir, fname0), text, height)
        pieno = glyph_stats(img0)
        ridotta = glyph_stats(shrink_nearest(img0, height - 2))
        check("un ridimensionamento non intero (%d -> %d px, come lo farebbe il browser) "
              "erode l'inchiostro: il PNG va mostrato 1:1" % (height, height - 2),
              ridotta["ink"] < pieno["ink"],
              "%s: inchiostro %.1f%% contro %.1f%%, tratti da 1 px %d contro %d"
              % (key0, 100.0 * ridotta["ink"], 100.0 * pieno["ink"],
                 ridotta["thin1"], pieno["thin1"]))
    except GenError as exc:
        results.append(("errore nel selftest: %s" % exc, False, ""))
    except Exception as exc:                                    # pragma: no cover
        results.append(("eccezione inattesa: %r" % (exc,), False, ""))

    ok = sum(1 for _l, good, _d in results if good)
    bad = len(results) - ok
    for label, good, detail in results:
        if not good:
            print("FALLITO  %s%s" % (label, ("  [%s]" % detail) if detail else ""))
        elif verbose:
            print("ok       %s%s" % (label, ("  [%s]" % detail) if detail else ""))
    print("gen_font_previews selftest: %d ok, %d falliti" % (ok, bad))
    return 1 if bad else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="Anteprime dei font (12:34, 1 bit) per la config page.")
    ap.add_argument("--fonts-dir", default=DEF_FONTS, help="cartella dei TTF (default: %s)" % DEF_FONTS)
    ap.add_argument("--out", default=DEF_OUT, help="previews.js da scrivere (default: %s)" % DEF_OUT)
    ap.add_argument("--text", default=TEXT, help="stringa da rasterizzare (default: %s)" % TEXT)
    ap.add_argument("--height", type=int, default=HEIGHT, help="altezza dell'inchiostro in px (default: %d)" % HEIGHT)
    ap.add_argument("--max-bytes", type=int, default=MAX_BYTES, help="tetto del file generato (default: %d)" % MAX_BYTES)
    ap.add_argument("--png-dir", default=None, help="salva anche i tre PNG in questa cartella")
    ap.add_argument("--check", action="store_true", help="verifica che --out sia aggiornato (exit 1 se no)")
    ap.add_argument("--selftest", action="store_true",
                    help="prova il generatore (determinismo, qualità dei glifi, forma del file)")
    ap.add_argument("-v", "--verbose", action="store_true", help="--selftest: stampa anche i passati")
    args = ap.parse_args(argv)

    if args.height < MIN_HEIGHT:
        sys.stderr.write("errore: --height deve essere >= %d\n" % MIN_HEIGHT)
        return 1
    if args.selftest:
        return selftest(args.fonts_dir, args.out, args.text, args.height, args.max_bytes,
                        verbose=args.verbose)
    try:
        js, used_h, info = generate(args.fonts_dir, args.text, args.height,
                                    args.max_bytes, None if args.check else args.png_dir)
    except GenError as exc:
        sys.stderr.write("errore: %s\n" % exc)
        return 1

    size = len(js.encode("utf-8"))
    if args.check:
        if not os.path.isfile(args.out):
            sys.stderr.write("previews.js assente (%s): esegui tools/gen_font_previews.py\n" % args.out)
            return 1
        with open(args.out, "rb") as fh:
            cur = fh.read()
        if cur != js.encode("utf-8"):
            sys.stderr.write("previews.js NON aggiornato (%s): esegui tools/gen_font_previews.py\n" % args.out)
            return 1
        print("previews.js aggiornato (%d B, altezza %d px)" % (size, used_h))
        return 0

    if size > args.max_bytes:
        sys.stderr.write("errore: %d B > tetto %d B anche a %d px di altezza\n"
                         % (size, args.max_bytes, used_h))
        return 1
    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir and not os.path.isdir(out_dir):
        os.makedirs(out_dir)
    with open(args.out, "wb") as fh:
        fh.write(js.encode("utf-8"))

    if used_h != args.height:
        print("altezza ridotta a %d px per stare in %d B" % (used_h, args.max_bytes))
    for key, px, w, h, raw in info:
        print("  %-7s px %-3d  %3dx%-3d  PNG %4d B  base64 %5d car."
              % (key, px, w, h, len(raw), len(base64.b64encode(raw))))
    print("previews.js: %d B (tetto %d), altezza inchiostro %d px" % (size, args.max_bytes, used_h))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera gli asset per lo store di Galleria (S7 §2.12).

Sorgenti (screenshot del gate S9-prep del 05/09/2026, gia' presenti nel repo; fino a S8 erano gli s7_* con le demo CC-BY-SA):
  docs/design/galleria/s9_emery_a_anton_scura.png   200x228  (Pebble Time 2, layout A, Anton, demo 1 aurora sul fiordo, testo bianco)
  docs/design/galleria/s9_flint_a_anton_chiara.png   144x168  (Pebble 2 Duo,  layout A, Anton, demo 2 Bryce Canyon, testo nero)

Prodotti in apps/galleria/store/:
  icon_144.png / icon_80.png / icon_48.png  ritaglio quadrato 200x200 dello screenshot
                                            emery (y 14..214, centrato verticalmente),
                                            ridimensionato con LANCZOS
  emery_screenshot_1.png (200x228)          copia esatta dello screenshot emery
  flint_screenshot_1.png (144x168)          copia esatta dello screenshot flint
                                            (nome con la piattaforma come PRIMO token:
                                            formato richiesto da `pebble publish --screenshots`)

Nessuna cornice, nessun testo aggiunto. Idempotente: rieseguirlo riscrive gli stessi byte.
Uso: python3 apps/galleria/store/make_assets.py [--check]
     --check  non scrive nulla: verifica che i file esistano e coincidano con l'atteso.
"""

import argparse
import io
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, os.pardir, os.pardir, os.pardir))
SRC_DIR = os.path.join(ROOT, "docs", "design", "galleria")
SRC_EMERY = os.path.join(SRC_DIR, "s9_emery_a_anton_scura.png")   # gate S9-prep (17:15, demo 1 aurora CC0: testo bianco leggibile a 48 px)
SRC_FLINT = os.path.join(SRC_DIR, "s9_flint_a_anton_chiara.png")  # gate S9-prep (demo 2 Bryce Canyon CC0: la scena si legge meglio in B/N)

EMERY_SIZE = (200, 228)
FLINT_SIZE = (144, 168)
CROP_TOP = 14          # 200x200 centrato verticalmente su 228: (228-200)//2 = 14
ICON_SIZES = (144, 80, 48)


def _load(path, expected_size):
    if not os.path.exists(path):
        raise SystemExit("sorgente mancante: %s" % path)
    img = Image.open(path)
    img.load()
    if img.size != expected_size:
        raise SystemExit("%s: attese %dx%d, trovate %dx%d"
                         % ((path,) + expected_size + img.size))
    return img.convert("RGB")


def _encode(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _emit(path, data, check, report):
    name = os.path.basename(path)
    if check:
        if not os.path.exists(path):
            report.append("MANCANTE  %s" % name)
            return False
        with open(path, "rb") as fh:
            same = fh.read() == data
        report.append(("ok        " if same else "DIVERSO   ") + name)
        return same
    old = None
    if os.path.exists(path):
        with open(path, "rb") as fh_old:
            old = fh_old.read()
    if old != data:
        with open(path, "wb") as fh:
            fh.write(data)
        report.append("scritto   %s (%d B)" % (name, len(data)))
    else:
        report.append("invariato %s (%d B)" % (name, len(data)))
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(description="asset store di Galleria")
    ap.add_argument("--check", action="store_true",
                    help="verifica senza scrivere (exit 1 se qualcosa differisce)")
    args = ap.parse_args(argv)

    emery = _load(SRC_EMERY, EMERY_SIZE)
    flint = _load(SRC_FLINT, FLINT_SIZE)

    square = emery.crop((0, CROP_TOP, 200, CROP_TOP + 200))

    report = []
    ok = True
    for size in ICON_SIZES:
        icon = square if size == 200 else square.resize((size, size), Image.LANCZOS)
        ok &= _emit(os.path.join(HERE, "icon_%d.png" % size), _encode(icon),
                    args.check, report)

    shots = (                      # nomi con la piattaforma come PRIMO token: `pebble publish --screenshots`
        ("emery_screenshot_1.png", emery),
        ("flint_screenshot_1.png", flint),
    )
    for name, img in shots:
        ok &= _emit(os.path.join(HERE, name), _encode(img), args.check, report)

    for line in report:
        print(line)
    if args.check and not ok:
        print("check FALLITO: rigenerare con python3 store/make_assets.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

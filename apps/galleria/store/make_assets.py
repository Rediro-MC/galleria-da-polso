#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera gli asset per lo store di Galleria (S7 §2.12).

Sorgenti (screenshot in docs/design/galleria/: i due storici dal gate S9-prep del 05/09/2026; fino a S8 erano gli
s7_* con le demo CC-BY-SA; i sei "in piu'" sono stati chiesti dall'utente nella notte del 18/09/2026 (tre alle 01:13,
tre alle 01:21), a 0.4.0 gia' pubblicata: quattro vengono dal gate S9-prep (foto demo CC0), i due store040_* sono
screenshot NUOVI dell'emulatore (build 0.4.0, GALLERIA_DEBUG_LAYOUT=1, demo CC0). Un settimo, emery_screenshot_6
(layout B Staatliches trasparente da s8stile_*, foto di prova CC-BY-SA-4.0, mai online), e' stato tolto il 19/09/2026
su decisione dell'utente: tutte le sorgenti sono demo CC0):
  docs/design/galleria/s9_emery_a_anton_scura.png               200x228  (PT2, layout A, Anton, demo 1 aurora sul fiordo, testo bianco)
  docs/design/galleria/s9_flint_a_anton_chiara.png               144x168  (P2 Duo, layout A, Anton, demo 2 Bryce Canyon, testo nero)
  docs/design/galleria/s9_emery_b_francois_trasparente3d_scura.png 200x228 (PT2, layout B, Francois One trasparente 3D, demo 1)
  docs/design/galleria/s9_emery_a_anton_chiara.png               200x228  (PT2, layout A, Anton, demo 2 chiara, testo nero automatico)
  docs/design/galleria/s9_flint_a_anton_scura.png                144x168  (P2 Duo, layout A, Anton, demo 1 scura, testo bianco)
  docs/design/galleria/store040_emery_b_anton_scura.png          200x228  (PT2, layout B, Anton pieno, demo 1: emulatore, build 0.4.0)
  docs/design/galleria/s9_emery_b_francois_trasparente3d_chiara.png 200x228 (PT2, layout B, Francois One trasparente 3D, demo 2 chiara)
  docs/design/galleria/store040_flint_b_anton_chiara.png         144x168  (P2 Duo, layout B, Anton nero, demo 2: emulatore, build 0.4.0)

Prodotti in apps/galleria/store/:
  icon_144.png / icon_80.png / icon_48.png  ritaglio quadrato 200x200 dello screenshot
                                            emery (y 14..214, centrato verticalmente),
                                            ridimensionato con LANCZOS
  emery_screenshot_1.png (200x228)          copia esatta dello screenshot emery scuro (online dal 05/09/2026)
  flint_screenshot_1.png (144x168)          copia esatta dello screenshot flint chiaro (online dal 05/09/2026)
  emery_screenshot_2.png (200x228)          layout B trasparente 3D        } i sei in piu' della notte del
  emery_screenshot_3.png (200x228)          layout A su foto chiara        } 18/09/2026, tutti online dal
  flint_screenshot_2.png (144x168)          flint su foto scura            } 19/09/2026 (verificato), caricati
  emery_screenshot_4.png (200x228)          layout B, Anton pieno          } dall'utente dalla dashboard
  emery_screenshot_5.png (200x228)          layout B trasp. 3D chiara      } (PUBLISH.md par. 5, LISTING.md
  flint_screenshot_3.png (144x168)          layout B su flint, Anton nero  } par. 7)
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
# Screenshot in piu' chiesti dall'utente nella notte del 18/09/2026, a 0.4.0 gia' pubblicata; i primi tre (01:13).
SRC_EMERY_2 = os.path.join(SRC_DIR, "s9_emery_b_francois_trasparente3d_scura.png")  # 18/09: layout B, stile trasparente 3D
SRC_EMERY_3 = os.path.join(SRC_DIR, "s9_emery_a_anton_chiara.png")                  # 18/09: colore del testo automatico (nero su chiara)
SRC_FLINT_2 = os.path.join(SRC_DIR, "s9_flint_a_anton_scura.png")                   # 18/09: flint con la demo scura
# Varianti "ora a tutto schermo" (layout B), chieste la stessa notte alle 01:21; le store040_* sono
# screenshot NUOVI dell'emulatore con la build 0.4.0 (GALLERIA_DEBUG_LAYOUT=1, album vuoto -> demo CC0).
# Fra parentesi in coda a queste tre righe: l'ora mostrata sul quadrante nello screenshot.
SRC_EMERY_4 = os.path.join(SRC_DIR, "store040_emery_b_anton_scura.png")             # B, Anton pieno bianco, demo 1 aurora (21:23)
SRC_EMERY_5 = os.path.join(SRC_DIR, "s9_emery_b_francois_trasparente3d_chiara.png") # B, Francois trasparente 3D, demo 2 chiara (17:17)
SRC_FLINT_3 = os.path.join(SRC_DIR, "store040_flint_b_anton_chiara.png")            # B, Anton nero, demo 2 chiara (21:53)

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
    emery2 = _load(SRC_EMERY_2, EMERY_SIZE)
    emery3 = _load(SRC_EMERY_3, EMERY_SIZE)
    flint2 = _load(SRC_FLINT_2, FLINT_SIZE)
    emery4 = _load(SRC_EMERY_4, EMERY_SIZE)
    emery5 = _load(SRC_EMERY_5, EMERY_SIZE)
    flint3 = _load(SRC_FLINT_3, FLINT_SIZE)

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
        ("emery_screenshot_2.png", emery2),
        ("emery_screenshot_3.png", emery3),
        ("flint_screenshot_2.png", flint2),
        ("emery_screenshot_4.png", emery4),
        ("emery_screenshot_5.png", emery5),
        ("flint_screenshot_3.png", flint3),
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

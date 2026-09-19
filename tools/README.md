# Pebble – materiale di riferimento (`tools/`)

Raccolta di risorse per lo sviluppo di watchface/watchapp Pebble su Linux.
Tutto il contenuto vive esclusivamente in questa cartella; niente è installato a livello di sistema.

Ambiente verificato il 2026-08-24: Ubuntu 26.04, Python 3.14.4 di sistema, nessun `sudo`,
niente `pip`/`ensurepip` sul Python di sistema. Sono disponibili in user space `uv`
(`~/.local/bin/uv`), il `pebble` CLI e l'SDK con QEMU (installati da `setup-env.sh`, vedi §8).
ImageMagick **non** è installato.

---

## Indice dei contenuti

| Percorso | Cos'è |
|---|---|
| `pebble-watchface-agent-skill/` | Skill ufficiale Claude Code per generare watchface/watchapp Pebble (clone git, **non versionato**) — §1 |
| `sdk-docs/` | Sorgenti di developer.repebble.com: guide, changelog, API C (clone git, **non versionato**) — §2 |
| `svg2pdc.py` | Convertitore SVG → PDC (Pebble Draw Command), **portato a Python 3** — §3 |
| `pebble_image_routines.py` | Routine colore Pebble (palette a 64 colori), **portate a Python 3** — §4 |
| `upstream-py2/` | Originali Python 2 non modificati, tenuti solo come riferimento — §5 |
| `palette/` | Palette ufficiale a 64 colori Pebble (`.gif`, `.act`, `.pal`) — §6 |
| `test/` | SVG di prova e output PDC generato — §7 |
| `setup-env.sh`, `pebble-env.sh`, `qemu-pebble-wrapper` | Installazione e caricamento dell'ambiente SDK Pebble in user space — §8 |
| `photo_prep.py` | Foto → `raw6`/`raw1` per la watchface Galleria (Pillow, dithering FS/Bayer/Atkinson) — §9 |
| `gen_digits.py` | Cifre grandi come **strip PNG** (sprite) + `src/c/digit_metrics.h` (+ le **maschere** `src/pkjs/digit_masks.js` per l'anteprima della config page, S12) per Galleria (freetype-py + Pillow) — §10 |
| `galleria_devserver.py` | **Dev server** di Galleria: in emulatore fa le veci della config page del telefono (solo stdlib) — §11 |
| `galleria_browser.py` | **Firefox headless** via WebDriver (solo stdlib): pilota la config page di Galleria per il gate S6 — §12 |
| `build_config_page.py` | Inlina le sorgenti della **config page** di Galleria in un unico HTML + `src/pkjs/config_page.js` (S6) — §13 |
| `gen_font_previews.py` | Anteprime «12:34» a 1 bit dei font per la config page (`previews.js`, S6) — **fuori dalla build dal 13/09/2026** (UX-2, D95) — §14 |
| `setup-adb.sh` | **adb** (Android platform-tools) in user space, per `pebble … --adb` sull'orologio reale (S8) — §15 |
| `galleria_logstats.py` | **Riepilogo dei log** catturati sull'orologio reale di Galleria (solo stdlib) — §16 |
| `gen_test_cards.py` | **Test card** dai numeri noti per soglie luma e LUT «vetro» di Galleria (Pillow) — §17 |
| `build_i18n.py` | **Dizionari** della config page: `apps/galleria/i18n/messages.json` → `src/pkjs/i18n.js` + fixture dei test (S10; sei lingue da S11; tripwire di lunghezza da UX-1) — §18 |
| `galleria_gloss_check.py` | **Tripwire del glossario** di Galleria: la tabella di `docs/design/galleria-s10-i18n.md` §3 contro `apps/galleria/i18n/messages.json` (solo stdlib, UX-4/D132) — §19 |

---

## 1. `pebble-watchface-agent-skill/`

Clone di <https://github.com/coredevices/pebble-watchface-agent-skill> (`--depth 1`, ~2.7 MB).
È la skill ufficiale di Core Devices per Claude Code: genera watchface e watchapp completi,
compila il `.pbw` e li testa nell'emulatore QEMU. La cartella **non è versionata** in questo repo
(`.gitignore`): su un clone pulito va riscaricata.

```bash
git clone --depth 1 https://github.com/coredevices/pebble-watchface-agent-skill \
    ~/ProgettiClaude/Pebble/tools/pebble-watchface-agent-skill
```

### Struttura principale

```
.claude/skills/pebble-watchface/
├── SKILL.md      # workflow completo in 8 fasi (816 righe): scelta del tipo di progetto,
│                 # design, implementazione, build PBW, test QEMU, asset, publish
├── reference/    # approfondimenti caricati su richiesta: pebble-api-reference.md (API C),
│                 # drawing-guide.md, animation-patterns.md, watchapp-guide.md,
│                 # alloy-guide.md (JavaScript eseguito sul watch, Moddable XS)
├── templates/    # file di partenza: static/animated/weather-watchface.c, pkjs-weather.js,
│                 # alloy-watchface.js, alloy-mdbl.c, i tre manifest e wscript.template
├── scripts/      # utility Python 3: create_project.py, validate_project.py, generate_uuid.py,
│                 # create_app_icons.py, create_preview_gif.py
└── samples/aqua-pbw/     # vuota nel clone (artefatti .pbw esclusi dal .gitignore)
```

Fuori dalla skill: `samples/projects/` (7 progetti completi di esempio con sorgenti e screenshot:
batman, beach, castle, lightsaber-duel, persia-swordfight, pocket-garden, tumbling-monkeys)
e `tutorials/c-watchface-tutorial/part1..part6` (il tutorial ufficiale in C, progressivo).

### Come attivarla

Copiare o collegare la cartella della skill dentro il progetto in cui si lavora:

```bash
mkdir -p <progetto>/.claude/skills
ln -s ~/ProgettiClaude/Pebble/tools/pebble-watchface-agent-skill/.claude/skills/pebble-watchface \
      <progetto>/.claude/skills/pebble-watchface
```

La skill presuppone l'SDK Pebble (`pebble` CLI) e QEMU: su questa macchina sono installati
in user space, vedi §8.

---

## 2. `sdk-docs/`

Clone di <https://github.com/coredevices/sdk-docs> (`--depth 1`, ~215 MB di cui 84 MB di `.git`
e 107 MB di asset immagini/video). È il sito Jekyll che genera developer.repebble.com. Come la
skill di §1, **non è versionata** in questo repo (`.gitignore`): è un clone locale, fuori dal repo.

```bash
git clone --depth 1 https://github.com/coredevices/sdk-docs ~/ProgettiClaude/Pebble/tools/sdk-docs
```

### Dove si trova cosa

| Contenuto | Percorso | Dimensione |
|---|---|---|
| **Guide** | `source/_guides/` | 1,2 MB – 114 file `.md` in 16 categorie |
| **Changelog SDK** | `source/_changelogs/` | 440 KB – 98 file, da `2.0-BETA0.md` a `4.33.1.md` |
| **API C (sorgente)** | `aplite/doxygen_sdk/xml/`, `basalt/doxygen_sdk/xml/` | 4,3 MB ciascuno, 164 file XML per piattaforma |
| **API C (HTML Doxygen)** | `aplite/doxygen_sdk/html/`, `basalt/doxygen_sdk/html/` | 4,4 MB ciascuno |
| **API C (pagine sito)** | `source/docs/c/` | solo `index.html` di template |
| Tutorial | `source/tutorials/` | 248 KB |
| Blog / annunci | `source/_posts/` | 134 file |
| API JS (PebbleKit JS, Rocky) | `source/_data/jsdocs-pkjs.json`, `jsdocs-rocky.json` | 418 KB + 835 KB |

Categorie in `source/_guides/`: `alloy` (192 KB), `events-and-services` (144 KB),
`user-interfaces` (124 KB), `app-resources` (124 KB), `communication` (108 KB),
`pebble-timeline`, `design-and-interaction`, `migration`, `tools-and-resources`,
`graphics-and-animations`, `debugging`, `best-practices`, `appstore-publishing`,
`rocky-js`, `pebble-packages`.

**Importante sulle API C**: in `source/docs/c/` ci sono solo i template di pagina.
La reference C vera e propria viene *generata a build time* da Jekyll a partire dall'XML Doxygen
in `aplite/` e `basalt/`, tramite `lib/pebble_documentation_c.rb` e `lib/c_docs/*.rb`.
Per consultarla offline senza costruire il sito conviene aprire direttamente l'HTML Doxygen
già presente, ad esempio `basalt/doxygen_sdk/html/index.html`, oppure leggere gli XML.

Guide particolarmente rilevanti per la grafica vettoriale:
- `source/_guides/app-resources/pdc-format.md` – specifica del formato PDC
- `source/_guides/app-resources/converting-svg-to-pdc.md` – uso di `svg2pdc.py`
- `source/tutorials/advanced/vector-animations.md` – animazioni vettoriali
- File PDC di esempio: `source/assets/other/*.pdc` e `source/assets/other/pdc/`

---

## 3. `svg2pdc.py` – da SVG a Pebble Draw Command

Port a Python 3 dello script ufficiale Pebble del 2015
(<https://raw.githubusercontent.com/pebble-examples/cards-example/master/tools/svg2pdc.py>),
che era scritto in Python 2 e non è più eseguibile su questo sistema (non esiste `python2`).

Il **formato binario prodotto è identico** all'originale: header `PDCI` (immagine) o `PDCS`
(sequenza), versione 1, stessi campi e stesso ordinamento dei byte.

### Uso

```bash
# immagine singola (nessuna dipendenza esterna necessaria)
python3 svg2pdc.py test/icon.svg -o test/icon.pdc

# con output verboso (elenca i comandi di disegno interpretati)
python3 svg2pdc.py test/icon.svg -v -o test/icon.pdc

# senza -o il file .pdc viene scritto accanto all'SVG di partenza
python3 svg2pdc.py test/icon.svg

# sequenza animata: la cartella deve contenere più .svg, ordinati per nome
python3 svg2pdc.py cartella_frame/ --sequence -d 33 -c 1 -o animazione.pdc

# coordinate sub-pixel (path "precise", 1/8 di pixel)
python3 svg2pdc.py test/icon.svg --precise -o test/icon.pdc
```

Opzioni: `-s/--sequence`, `-o/--output`, `-v/--verbose`, `-d/--duration` (ms per frame,
default 33), `-c/--play_count` (default 1), `-p/--precise`, e in più `--builtin-parser`
(aggiunta del port, vedi sotto).

Elementi SVG supportati: `g`, `layer`, `path`, `rect`, `polyline`, `polygon`, `line`, `circle`.
Tutto il resto viene ignorato con un avviso.

### Dipendenze

**Nessuna: `python3 svg2pdc.py` funziona così com'è.**

L'originale importava due moduli non presenti in questo ambiente:

1. `pebble_image_routines` (parte dell'SDK Pebble) → **incorporato** dentro `svg2pdc.py`
   (ed è disponibile anche come modulo a sé, vedi §4).
2. `svg.path` (pacchetto PyPI, serve a interpretare l'attributo `d` dei `<path>`) →
   **è stato scritto un parser equivalente interno**, senza dipendenze.

Il parser interno riproduce la semantica di `svg.path` 2.x/3.x (quella dell'epoca dello script)
e supporta `M/m L/l H/h V/v C/c S/s Q/q T/t A/a Z/z`, comandi impliciti e sotto-percorsi multipli.
È stato verificato che produce output **byte per byte identico** a `svg.path==3.0`.

Se si preferisce comunque usare il pacchetto vero, `uv` è disponibile e non richiede installazione
permanente:

```bash
# ATTENZIONE: fissare la versione 3.0
~/.local/bin/uv run --with 'svg.path==3.0' python3 svg2pdc.py test/icon.svg -o test/icon.pdc
```

> **Non usare `svg.path` ≥ 4.0.** Dalla 4.0 `parse_path()` restituisce anche segmenti `Move`,
> che questo script conteggia come punti: il primo punto di ogni path risulta duplicato e il PDC
> generato è diverso (e sbagliato). Con la 3.0 l'output coincide con quello del parser interno.
> Se `svg.path` è installato, `--builtin-parser` forza comunque il parser interno.

### Principali modifiche fatte nel port (documentate anche in testa al file)

- `print` istruzione → `print()`
- `Element.getchildren()` → `list(element)` (rimosso in Python 3.9)
- `filter(lambda, str)` → `''.join(filter(...))` (in Python 3 `filter` restituisce un iteratore)
- `round()` → `py2_round()`: Python 3 arrotonda i mezzi al pari, Python 2 li arrotondava
  allontanandosi da zero. Senza questa funzione le coordinate cambierebbero.
- divisione intera `/` → `//` nelle routine colore
- output binario: `"PDCI"` → `b"PDCI"`, file aperto in `'wb'`
- `struct.pack('H', <float>)`: Python 2 accettava i float troncandoli, Python 3 solleva
  un errore → si applica `int()` (riguarda solo il raggio dei cerchi)

### Verifica dell'output

```bash
python3 - <<'EOF'
import struct
d = open('test/icon.pdc','rb').read()
assert d[:4] == b'PDCI'
size, = struct.unpack('<I', d[4:8])
ver, res, w, h = struct.unpack('<BBhh', d[8:14])
ncmd, = struct.unpack('<H', d[14:16])
print("magic PDCI, payload", size, "byte, versione", ver, "viewbox %dx%d" % (w,h), "-", ncmd, "comandi")
EOF
```

---

## 4. `pebble_image_routines.py`

Port a Python 3 del modulo colore dell'SDK Pebble. Converte colori RGBA a 8 bit per canale nella
palette Pebble a 2 bit per canale (64 colori) e nel formato ARGB8 a un byte usato dal firmware.

```python
from pebble_image_routines import (pebble_get_64color_palette,
                                   pebble_truncate_color_to_pebble_palette,
                                   pebble_nearest_color_to_pebble_palette,
                                   rgba32_triplet_to_argb8)

pebble_get_64color_palette()                                  # lista di 64 tuple (r, g, b)
rgba32_triplet_to_argb8(255, 0, 0, 255)                       # 0xF0 -> GColorRed
```

Modifiche rispetto all'originale: `xrange` → `range`, divisione `/` fra interi → `//`.

---

## 5. `upstream-py2/`

Gli script originali Python 2 scaricati da GitHub, **non modificati**, tenuti solo per confronto:
`upstream-py2/svg2pdc.py` e `upstream-py2/pebble_image_routines.py`.

Sono in una sottocartella apposta perché non vengano importati per errore al posto dei port
Python 3 (`pebble_image_routines.py` in Python 2 è sintatticamente valido anche in Python 3 ma
produrrebbe colori sbagliati a causa della divisione).

**Non sono eseguibili qui**: `python2` non esiste su questo sistema, quindi non è possibile
confrontare l'output byte a byte contro l'implementazione originale. La verifica è stata fatta
rileggendo il binario prodotto con `struct` e controllando ogni campo del formato PDC.

---

## 6. `palette/` – palette ufficiale a 64 colori

Scaricata da developer.repebble.com (file identici, md5, a quelli di `coredevices/sdk-docs`, Apache-2.0: vedi `THIRD-PARTY-NOTICES.md`):

| File | Dimensione | Tipo | Uso |
|---|---|---|---|
| `pebble_colors_64.gif` | 2475 byte | GIF 87a, 177x177 | ImageMagick, Pillow |
| `pebble_colors_64.act` | 772 byte | Adobe Color Table | Photoshop (“Salva per Web”) |
| `pebble_colors_64.pal` | 1048 byte | RIFF PAL | editor Windows |

Verificato: la palette del GIF e le prime 64 voci del `.act` corrispondono esattamente ai
64 colori generati da `pebble_get_64color_palette()` (canali con valori 0, 85, 170, 255).

### Uso con ImageMagick

```bash
magick in.png +dither -remap palette/pebble_colors_64.gif PNG8:out.png
```

`+dither` disattiva il dithering (consigliato per grafica piatta: il dithering fa esplodere la
dimensione del PNG e sullo schermo Pebble rende male). Per ottenere invece il dithering:
`-dither FloydSteinberg`. `PNG8:` forza un PNG a palette, che è ciò che l'SDK Pebble si aspetta.

Con ImageMagick 6 il comando è `convert` al posto di `magick`.

> **ImageMagick non è installato in questo ambiente** (`magick`, `convert` e `identify` non
> esistono e non si può installarlo senza `sudo`). Il comando qui sopra è documentato per
> completezza ma **non è eseguibile così com'è**.

### Alternativa funzionante: Pillow

Pillow 12.1.1 è già disponibile nel Python di sistema e fa la stessa cosa:

```python
from PIL import Image

palette = Image.open('palette/pebble_colors_64.gif').convert('P')
img = Image.open('in.png').convert('RGB')
out = img.quantize(palette=palette, dither=Image.Dither.NONE)   # equivalente di +dither
out.save('out.png')                                             # PNG a palette
```

Testato: l'immagine risultante usa solo colori appartenenti alla palette Pebble.

---

## 7. `test/`

- `test/icon.svg` – SVG 24x24 di prova con un `circle`, un `rect` e un `path` (soli elementi
  supportati dal convertitore), colori dichiarati con attributi di presentazione.
- `test/icon.pdc` – output di `svg2pdc.py`, 75 byte, 3 comandi di disegno.

Comando usato e risultato (accorciato qui il solo percorso assoluto che il tool stampa):

```
$ cd test && python3 ../svg2pdc.py icon.svg -v -o icon.pdc
Path parser: built-in (vendored)
…/tools/test/icon.svg:
Circle: [fill color:203; stroke color:192; stroke width:1] (12.0, 12.0) 10.0
Path: [fill color:240; stroke color:255; stroke width:1] [(4.0, 4.0), (10.0, 4.0), (10.0, 10.0), (4.0, 10.0)] False
Path: [fill color:204; stroke color:192; stroke width:2] [(4.0, 20.0), (12.0, 14.0), (20.0, 20.0)] False
```

Rileggendo l'header con `struct`: magic `PDCI` (immagine), versione 1, viewbox 24×24, payload 67 B
(+ 8 B di header = i 75 del file), 3 comandi — un `CIRCLE` di raggio 10 e due `PATH` da 4 e 3 punti —
e 75/75 byte consumati, cioè file interamente interpretato.

### Nota sugli attributi `style`

Lo script legge `style="fill:#ff0000;stroke:#000000"` spezzando la stringa sui `;` e sui `:`,
**senza rimuovere gli spazi**: `style="fill: #ff0000"` (con spazio dopo i due punti) viene
interpretato come colore non valido e l'elemento risulta trasparente. È un comportamento
dell'originale che è stato mantenuto. Conviene usare gli attributi di presentazione
(`fill="#ff0000"`) oppure scrivere lo `style` senza spazi.

### Coordinate valide

Pebble usa una griglia con offset di mezzo pixel: sono valide le coordinate multiple di 0,5
(1/8 di pixel in modalità `--precise`). Con altri valori lo script stampa
`Invalid point: ... Closest supported coordinate: ...` e arrotonda.

---

## 8. Ambiente SDK: `setup-env.sh`, `pebble-env.sh`, `qemu-pebble-wrapper`

Script di installazione dell'ambiente Pebble in user space, **senza `sudo`** (Fase 0 del piano
di sviluppo). Non fanno parte del materiale di riferimento vero e proprio ma vivono qui perché
`pebble-env.sh` viene caricato da `~/.bashrc`.

| File | Ruolo |
|---|---|
| `setup-env.sh` | Installazione idempotente: `uv`, Python 3.13 gestito da uv (il Python di sistema non ha `ensurepip`), `pebble-tool` pinnato, SDK Pebble con toolchain ARM e QEMU in `~/.local/share/pebble-sdk`, librerie runtime di QEMU estratte dai `.deb` in `~/.local/lib/pebble-deps`, hook in `~/.bashrc` |
| `pebble-env.sh` | Caricato da `~/.bashrc`: aggiunge `~/.local/bin` al `PATH` ed esporta `PEBBLE_QEMU_PATH` |
| `qemu-pebble-wrapper` | Wrapper che imposta `LD_LIBRARY_PATH` sulle librerie estratte (libSDL2, libXss, libsndio) e lancia il `qemu-pebble` dell'SDK attivo |

Stato verificato: `pebble` risponde da `~/.local/bin/pebble`, l'SDK è in
`~/.local/share/pebble-sdk/SDKs/current` e `qemu-pebble` è presente nella toolchain.

---

## 9. `photo_prep.py` – foto per Galleria

Converte una foto qualsiasi nei due formati raw della watchface **Galleria**
(`apps/galleria`, specifica in `apps/galleria/src/c/photo_codec.h`):

| Formato | Piattaforma | Contenuto | Byte |
|---|---|---|---|
| `.raw6` | `emery` 200×228 | indice di palette `r2<<4\|g2<<2\|b2` (0..63), 4 px in 3 byte MSB-first, riga 150 B | 34.200 |
| `.raw1` | `flint` 144×168 | `GBitmapFormat1BitPalette` MSB-first (pixel `x` nel bit `0x80 >> (x & 7)`), 1 = bianco, riga 18 B | 3.024 |

Dipendenze: **solo stdlib + Pillow 12.1.1** (già nel Python di sistema). Niente numpy: i loop girano
su liste piatte di interi (~0,2 s per foto; la LUT `--sunlight` aggiunge 0,2 s una volta sola).

### Uso

```bash
# le due foto demo del repo (CC0, S9-prep 05/09/2026; comandi esatti e provenienza in apps/galleria/resources/photos/README.md)
python3 tools/photo_prep.py --out apps/galleria/resources/photos --name demo_1 \
        --preview --preview-dir ~/galleria-gate/s9/final_prev --stats ~/galleria-gate/s9/src/d10_lauklines.jpg

# più foto in un colpo: il nome viene dal file (niente --name). Due input con lo stesso
# basename (a/foto.png e b/foto.jpg) darebbero gli stessi .raw6/.raw1: il tool rifiuta ed esce 1
# PRIMA di scrivere qualsiasi file, invece di sovrascrivere in silenzio.
python3 tools/photo_prep.py --out /tmp/prep --preview foto1.jpg foto2.png

# ritaglio scelto a mano (pixel dell'immagine sorgente; il rapporto viene forzato a 200:228)
python3 tools/photo_prep.py --crop 400,120,1600,1824 --gamma 0.85 --lift 0.05 foto.jpg

# fixture del test host di photo_codec.c  /  autotest del tool (girano in `make -C apps/galleria/test`)
python3 tools/photo_prep.py --fixture apps/galleria/test/fixtures
python3 tools/photo_prep.py --selftest
```

| Opzione | Effetto |
|---|---|
| `--out DIR` | cartella dei `.raw6`/`.raw1` (default: cartella corrente) |
| `--name NOME` | nome base dei file; ammesso solo con **un** input |
| | *(senza `--name` il nome viene dal basename dell'input; due input che darebbero lo stesso nome sono un errore, exit 1)* |
| `--crop X,Y,W,H` | ritaglio in pixel sorgente; rapporto forzato a 200:228 riducendo il lato lungo, ricentrato |
| `--gamma G` `--lift L` | LUT di tono per il MiP: `t[i] = round(255·(min(1, L + (1−L)·i/255))^G)`; default `1.0` / `0` = identità. `G` dev'essere > 0 e `L` in 0..1: valori fuori intervallo — **`nan` compreso** — escono con un messaggio, non con un traceback |
| `--dither fs\|bayer\|none` | dithering emery (default `fs`, serpentine) |
| `--bw-dither fs\|atkinson\|none` | dithering flint (default `fs`); Atkinson dà più contrasto e brucia le luci |
| `--sunlight` | quantizza nello **spazio della resa** del pannello (LUT 32³): colori più fedeli, decisione D6 → default OFF **nel tool** (resta opt-in qui; la casella omonima della config page nasce **spuntata** dal 19/09/2026, S14/D138, che rovescia D6) |
| `--preview` `--preview-dir DIR` | `<nome>_emery_x2.png` e `<nome>_flint_x2.png` (ricostruite con la resa sunlight, ×2 NEAREST) |
| `--emit-idx` | scrive anche `<nome>.idx`, 1 byte per pixel (indici 0..63) |
| `--stats` | previsione del colore del testo con la regola di `apps/galleria/src/c/luma.h`; senza `--band-h` copre la fascia del layout A (106 px emery / 76 flint) **e**, sotto, la stessa fascia ancorata al fondo dello schermo (S14/D136 «Ora in basso»: `y 122..227` su emery, `y 92..167` su flint). Contorno **dal 15 % in su** di pixel in conflitto (S14/D140: confronto `>=`, non più `>`) |
| `--band-h E[,F]` | altezza della fascia di `--stats` in px (default `106,76`): `228,168` = layout B a tutto schermo, `78,52` = riga singola sotto Quick View, `110` = layout A con content size ExtraLarge (un valore solo ⇒ flint resta 76) |
| `--fixture DIR` | scrive `rt.idx`, `rt.raw6`, `rt.bits`, `rt.raw1`, `rt_meta.h` ed esce |
| `--selftest` | autotest (pack6/unpack6, pack1, CRC32, tabelle, determinismo del dithering) ed esce |

Stampa sempre, per ogni foto: rettangoli di crop, dimensioni dei raw, **CRC32** (`zlib.crc32`) e
numero di colori usati; con `--stats` anche `bad_white`/`bad_black`/Y medio e il colore di testo
previsto sulla fascia dell'ora (campionamento 1 px su 2). Prima vengono le due righe della fascia
**in alto** (emery e flint: `y 0..105` e `y 0..75` con i default) e poi, da S14/D136, quelle della
**stessa altezza ancorata al fondo** (`y 122..227` e `y 92..167`), che è il layout «Ora in basso».
La riga in basso però si decide **per piattaforma** (`stats_rows`): c'è solo dove sotto la fascia
resta spazio. Con i default le righe sono quindi **quattro**; con `--band-h 228` sono **tre** (su
emery la fascia è già tutto lo schermo, su flint no); con `--band-h 228,168` sono **due**. Le altre
fasce si chiedono con `--band-h EMERY[,FLINT]` (i quattro casi sono nella tabella delle opzioni qui
sopra): sostituisce le due costanti sia nel conteggio sia nella riga stampata (`fascia y Y0..Y1`).
`--band-h` tocca **solo** le statistiche: i `.raw6`/`.raw1` e i loro CRC32 non cambiano.

Chi importa il tool come **modulo** chiede la stessa cosa da sé: da S14 `stats_emery(idx, w, band_h,
y0=0)` e `stats_flint(bits, w, band_h, y0=0)` prendono l'origine `y0` della fascia (0 = in alto,
122 su emery e 92 su flint = «Ora in basso») e campionano da `y0` a `y0 + band_h` a passi di 2, come
il C; `stats_rows(band_e, band_f)` ritorna le coppie `(piattaforma, y0)` che `--stats` stampa. È
così che `apps/galleria/test/gen_preview_fixture.py` calcola il luma della fascia bassa per la
fixture dell'anteprima, senza duplicare la regola.

La regola dell'**alone** (contorno di contrasto) è `bad_pct >= 15 %`: dal 15 % in su di pixel in
conflitto con il colore scelto il testo prende il contorno. Il confronto è **non stretto** da
S14/D140 (prima era `> 15 %`, e le card `c7b`/`c8a`/`c8b` al 15 % esatto risultavano illeggibili sul
vetro). Le copie della regola — `apps/galleria/src/c/luma.c`, `src/c/ui_time.c`,
`src/pkjs/config/preview.js`, questo tool e l'oracolo di `gen_test_cards.py` (§17) — devono cambiare
**insieme**, e **nessun test le confronta fra loro**: si pinnano una per una.
`apps/galleria/test/test_luma.c` tiene il confine 14/15 di `luma.c`, `test_preview.js` quello di
`preview.js`, `apps/galleria/test/test_cards.py` quelli di `gen_test_cards.py` **e** di questo tool
(`gen_test_cards.py --check` confronta le due previsioni riga per riga: rimettendo `>` in `_decide`
dà «3 discordanti»). Due buchi da ricordare: il cross-check del tool con il C
(`gen_test_cards.c_source_status`) legge le sole **costanti** — `LUMA_SUN` e i cinque `#define` di
`luma.h` —, **non** l'operatore, quindi `--check` resta verde anche con un confronto sbagliato; e la
copia in `ui_time.c` non è coperta da nessun test host (`ui_time.c` non compila senza `pebble.h`):
resta affidata alla revisione del diff.

### Pipeline

```
emery:  open + exif_transpose + RGB → crop 200:228 → LANCZOS 200×228 → LUT di tono per canale
        → dithering (spazio RGB crudo, oppure resa "sunlight") → indici 0..63 → pack6
flint:  sotto-rettangolo 144:168 CENTRATO nel crop di emery → LANCZOS 144×168
        → grigio Rec.709 intero ((54R + 183G + 19B) >> 8) → LUT di tono → 1 bit (soglia 2048)
        → pack1 MSB-first
```

È la trascrizione **fedele** della pipeline JavaScript di
`docs/ricerca/galleria/05-colore-quantizzazione.md` §1.3–1.5 e §2, perché in S6 la pagina di
configurazione dovrà produrre lo **stesso** `raw6` dalla stessa immagine 200×228: stesso fixed point
×16, stesso serpentine, stessi pesi 7/3/5/1 con `>>4` (floor, come `>>` in JS), stesso clamp
0..4080, stessa `q(v) = min(3, (v + 42) // 85)`, stessa LUT 32³ per lo spazio sunlight. Gli
arrotondamenti che in JS sono `Math.round` (che manda `.5` verso +∞) passano da `_jsround()`, **non**
da `round()` di Python (che arrotonda al pari). Il tool è deterministico: stessa foto e stesse
opzioni ⇒ stessi byte, stessi CRC32.

**Porting JS (S6).** Quella trascrizione ora esiste davvero: è
`apps/galleria/src/pkjs/config/pipeline.js`, che la config page usa nel browser del telefono. Il
round trip Python ↔ JS è verificato da `apps/galleria/test/test_pipeline.js` sulla fixture di
`apps/galleria/test/gen_page_fixture.py` (che importa **questo** tool come modulo, senza Pillow).
**Ogni modifica a `photo_prep.py` va replicata in `pipeline.js`** — e viceversa: altrimenti la
stessa foto darebbe due `raw6` diversi, quindi due `photo_id`, fra telefono e dev server.

La tabella `SUN_RGB[64]` (resa reale dei 64 colori, quella che si vede in un `pebble screenshot`) è
copiata dal dict `mapping` di `_correct_colours` in
`pebble_tool/commands/screenshot.py`, indicizzata da `(r//85)<<4 | (g//85)<<2 | b//85`. Da lì il tool
ricava `LUM_SUN[64]` (Y percettiva 0..255, canali sRGB→lineari, pesi WCAG 0,2126/0,7152/0,0722) e il
`--selftest` verifica che coincida con la tabella `LUMA_SUN[]` di `apps/galleria/src/c/luma.c`.
La LUT 32³ dello spazio sunlight è costruita in `double` come nel JS di riferimento (`R = r*255/31`):
con l'aritmetica intera due celle su 32.768 cambierebbero, perché sono pareggi esatti. Il suo CRC32
(`0x48CBD990`) è controllato dal `--selftest`.

### Fixture del test C (`--fixture`)

Scrive in `apps/galleria/test/fixtures/` i vettori che il test host di `photo_codec.c` confronta con
l'implementazione in C (round trip fra i due linguaggi):

| File | Contenuto |
|---|---|
| `rt.idx` | 40×12 = 480 indici 0..63, 1 byte/px: i primi 64 sono `0..63` in sequenza, così ogni valore a 6 bit compare almeno una volta nel file — ma **non** in ogni posizione del gruppo da 4 (in quei 64 la posizione `k` vede solo i valori congrui a `k mod 4`); i restanti da un LCG (`x0 = 1`; `x = (x·1103515245 + 12345) & 0x7fffffff`; `idx = (x >> 16) & 63`), che porta ciascuna delle 4 posizioni a 50..58 valori distinti su 64 |
| `rt.raw6` | `pack6(rt.idx)`, 360 B |
| `rt.bits` | 24×8 = 192 pixel 0/1, 1 byte/px: riga 0 tutta 1, riga 1 tutta 0, poi `((x·7 + y·3) % 5) < 2` |
| `rt.raw1` | `pack1(rt.bits)`, 3 B/riga, 24 B |
| `rt_meta.h` | `RT_W`, `RT_H`, `RT_RAW6_LEN`, `RT_RAW6_CRC32`, `RT1_W`, `RT1_H`, `RT_RAW1_LEN`, `RT_RAW1_CRC32` |

I CRC32 in `rt_meta.h` sono `zlib.crc32` sui byte del file, cioè `crc32_update(0, dati, len)` di
`apps/galleria/src/c/crc.c`.

`--fixture` è **riproducibile**: nessuno dei cinque file dipende dall'orologio o dai percorsi, quindi
rigenerarli in un altro giorno o in un'altra cartella dà gli stessi byte. È quindi lecito usare
`cmp` come controllo di non-derivazione (le fixture nel repo corrispondono davvero al tool):

```bash
python3 tools/photo_prep.py --fixture /tmp/fx
for f in rt.idx rt.raw6 rt.bits rt.raw1 rt_meta.h; do cmp /tmp/fx/$f apps/galleria/test/fixtures/$f; done
```

### Autotest (`--selftest`)

Lo esegue anche `make -C apps/galleria/test` (target `pyselftest`). Controlla: round trip
`pack6`/`unpack6` su tutti i 64 valori, su 480 px LCG e su un gruppo incompleto; vettori di `pack6`
calcolati a mano; `pack1` byte per byte (ordine dei bit MSB-first, stride, riga bianca/nera);
`crc32("123456789") == 0xCBF43926`; `LUM_SUN`, `SUN_RGB`, la LUT 32³ e `q(v)`; `toneLUT(1.0, 0)`
identità; `_jsround` = `Math.round`; determinismo di FS (raw, sunlight, 1 bit) e Atkinson su un
gradiente sintetico 200×228, di cui stampa lo sha256. Controlla inoltre che `rt_meta.h` non contenga
date e non legga l'orologio, che la copertura degli indici dichiarata nel suo commento sia quella
misurata, che due input omonimi vengano rifiutati e che `--gamma nan`/`--lift nan` diano un errore.
Da **S14** anche il confine dell'alone in `_decide` (`bad_pct` 14 → niente contorno, 15 → contorno,
in tutte e due le direzioni: è il pin di D140 su questo tool) e la fascia con `y0 > 0` — su
un'immagine sintetica scura in alto e chiara in basso, `y0 0` dà BIANCO e `y0 122` dà NERO, con lo
stesso numero di campioni: la fascia bassa non vede una riga di quella alta. Stampa
`photo_prep selftest: N ok, M falliti` — oggi **65** — ed esce 0 se tutto passa, 1 altrimenti.

### Foto demo

`apps/galleria/resources/photos/demo_{1,2}.{raw6,raw1}` (provenienza, licenza, CRC32 e previsione del
colore del testo in `apps/galleria/resources/photos/README.md`). Le anteprime PNG **non** stanno nel
repo: generarle con `--preview --preview-dir` in una cartella temporanea.

---

## 10. `gen_digits.py` – cifre sprite per Galleria

Genera da TTF le **strip** delle cifre grandi della watchface **Galleria** (design
`docs/design/galleria.md` D3/D4 e §7, sessione S3; **v2** = S8-stile, `docs/design/galleria-s8-stile.md`
§3: anello spesso e ombra 3D) e l'header `apps/galleria/src/c/digit_metrics.h` che
`src/c/ui_digits.c` include.

Interprete: **`~/.local/share/uv/tools/pebble-tool/bin/python`** (freetype-py 2.5.1 su libfreetype 2.13.2 + Pillow 12.3).
Il Python di sistema **non** ha freetype-py: con `python3` il tool non parte, tranne `--selftest`,
che non legge i TTF (gli import di freetype/Pillow sono pigri da S12).

### Novità della v2 (S8-stile)

Su **emery** ogni glifo ha **tre** strati invece di due — riempimento, **anello spesso R px**,
**ombra 3D profonda S px** — e il PNG ha **quattro** colori invece di tre (resta `2BitPalette`:
2 bit/px). Con questi tre indici l'orologio ottiene i quattro stili di D21 cambiando **solo la
palette**, senza una risorsa per stile: 0 Pieno, 1 Trasparente (riempimento `GColorClear`),
2 Trasparente 3D, 3 Pieno 3D. Il generatore sa anche calcolare le righe peggiori del layout e si
ferma se non entrano nello schermo (§ "Controlli di riga").

Su **flint** (`~bw`) l'ombra **non esiste** (`S = 0`, **D26**: il perché sta in «Palette»), quindi
con `R = 1` e `S = 0` le strip `~bw` restano **identiche byte per byte a quelle della v1** e
sull'orologio gli stili 3D valgono come i corrispondenti stili piatti (2 → 1, 3 → 0). Anche i
**pixel del riempimento** non cambiano rispetto alla v1 (D24): stessa `px`, stesso `digit_h`, stesse
larghezze del riempimento per Anton/Bebas/Barlow; su emery cambiano `strip_h` (+2R+S), `strip_w`
(ogni inchiostro cresce di 2R+S−2 = 4 px) e la riga da cui parte il riempimento (`R`, non 1).

La v2 porta anche i **due font nuovi** di D22 — **Francois One** (chiave `francois`, risorse
`DIGITS_FRANCOIS_A/B`) e **Staatliches** (chiave `staatliches`, `DIGITS_STAATLICHES_A/B`) — quindi
le strip sono **20** (5 font × 2 taglie × 2 piattaforme) e `DIGITS_FONT_COUNT` vale 5. ⚠️ Le quattro
risorse nuove vanno dichiarate in `apps/galleria/package.json` (`2BitPalette`,
`spaceOptimization: "memory"`), altrimenti l'header cita `RESOURCE_ID_` che l'SDK non genera.

### Uso

```bash
PY=~/.local/share/uv/tools/pebble-tool/bin/python

# generazione completa (20 PNG + header + maschere JS + foglio di contatto per il controllo visivo)
# --fit-width --no-colon-b --pack --masks-js = comando CANONICO di Galleria: `--masks-js` NE FA PARTE
# (senza, le strip e l'header si rigenerano e `digit_masks.js` resta indietro). Lo cita per intero anche
# la riga «Rigenerare con» di digit_metrics.h (da S12: prima si fermava a --pack)
$PY tools/gen_digits.py \
    --fonts-dir apps/galleria/resources/fonts \
    --out       apps/galleria/resources/digits \
    --header    apps/galleria/src/c/digit_metrics.h \
    --masks-js  apps/galleria/src/pkjs/digit_masks.js \
    --preview   /tmp/digits --fit-width --no-colon-b --pack

# solo la tabella delle metriche, nessun file scritto (con --masks-js confronta anche il modulo)
$PY tools/gen_digits.py --check --fit-width --no-colon-b --pack \
    --masks-js apps/galleria/src/pkjs/digit_masks.js

# autotest del contratto (§3.4, D25, D26): non legge i TTF e non scrive nulla
$PY tools/gen_digits.py --selftest        # -> "selftest: 63 controlli, 0 falliti" (erano 46 fino a S11)

# una sola combinazione (font,taglia,piattaforma; campi vuoti o `*` = tutti)
$PY tools/gen_digits.py --only barlow,a,color --out /tmp/d --preview /tmp/d
```

| Opzione | Effetto |
|---|---|
| `--fonts-dir DIR` | cartella dei TTF (default `apps/galleria/resources/fonts`) |
| `--out DIR` | cartella delle strip PNG (default `apps/galleria/resources/digits`) |
| `--header FILE` | header generato (default `apps/galleria/src/c/digit_metrics.h`) |
| `--preview DIR` | scrive `DIR/digits_preview.png`: per ogni strip la **strip grezza** (4 colori su emery, 3 su flint) più i **4 stili di D21** (pieno, pieno 3D, trasparente, trasparente 3D) resi in bianco/nero **sopra un grigio medio** |
| `--only F,T,P` | limita la generazione; con una selezione parziale l'**header non viene scritto** |
| `--check` | stampa solo la tabella delle metriche e le segnalazioni, non scrive nulla |
| `--selftest` | autotest del contratto **senza TTF**: griglia di riga con la regola di **riserva** di D25 (cifra più larga + anello, la sola che il generatore deve garantire), avviso di sporgenza, geometria di flint (D26), anello/ombra, `--pack`, autocontrolli della mappa, header. Non scrive nulla; esce 1 se un controllo fallisce |
| `--fit-width` | se il **riempimento** di un glifo non entra nella sua cella — il passo del layout, o la cella del `':'` nel layout A — abbassa la pixel size invece di uscire con errore (vedi sotto). Anello e ombra **non** entrano nel vincolo (D24) |
| `--no-colon-b` | la taglia **B** viene generata **senza il `':'`**: 10 glifi invece di 11, e nell'header `ink[DIGITS_GLYPH_COLON] = { 0, 0 }`. Il layout B non disegna mai i due punti (S3/S7 D16). La taglia A non cambia |
| `--pack` | strip **compatta**: i glifi vengono accostati e `strip_w` scende alla somma degli inchiostri (arrotondata a 4 px), invece delle celle di lavoro. Stessi pixel, stessa `px`, stesso `digit_h`; `cell_w` nell'header resta il passo della griglia del layout (vedi sotto) |
| `--masks-js FILE` | **S12/D45**: scrive anche il modulo delle **maschere** per l'anteprima della config page (vedi sotto). Con `--check` il file non viene scritto ma **confrontato**, come l'header |
| `--allow-row-overflow` | **fuori contratto**: declassa ad AVVISO il controllo di riga (§ "Controlli di riga"). La riga sforata viene tagliata a destra da `ui_time.c`, che porta `x0` a 0. Serve solo per esplorare geometrie R/S diverse (`GEOM`); **non va usato per lo stato del repo**, e se usato finisce nella riga «Rigenerare con» dell'header |

Il tool è **deterministico**: nessuna data, nessun percorso assoluto e nessun timestamp finisce
nell'output (l'header cita `TOOL_VERSION` e il comando canonico con percorsi relativi), quindi due
esecuzioni danno gli stessi byte e `cmp` vale come controllo di non-derivazione:

```bash
$PY tools/gen_digits.py --out /tmp/d1 --header /tmp/d1.h --fit-width --no-colon-b --pack
$PY tools/gen_digits.py --out /tmp/d2 --header /tmp/d2.h --fit-width --no-colon-b --pack
for f in /tmp/d1/*.png; do cmp "$f" "/tmp/d2/$(basename "$f")"; done; cmp /tmp/d1.h /tmp/d2.h
```

Il comando canonico qui sopra è **lo stesso** che citano `digit_metrics.h` («Rigenerare con») e
`apps/galleria/CLAUDE.md`, **`--masks-js` compreso**: rieseguendolo si riottengono i 20 PNG,
l'header e il modulo delle maschere in repo, byte per byte. (Fino alla prima stesura di S12 la riga
dell'header si fermava a `--pack`: chi la copiava lasciava indietro `src/pkjs/digit_masks.js`, e se
ne accorgeva solo il `--check` di `pagecheck`, dopo il giro sbagliato.)

### `--masks-js`: maschere delle cifre per l'anteprima della config page (S12/D45)

`--masks-js apps/galleria/src/pkjs/digit_masks.js` scrive, accanto alle strip e all'header, un
modulo **ES5/CommonJS e solo ASCII** con la maschera a **1 bit del solo riempimento** di ogni glifo,
per piattaforma (`emery`, `flint`), font (`anton`, `bebas`, `barlow`, `francois`, `staatliches`) e
taglia (`a`, `b`):

```js
module.exports = { v: 1, emery: { anton: { a: { strip_h, digit_h, ring, shadow, cell_w,
                                               glyphs: { '0': { w, bits }, …, ':': { w, bits } } },
                                          b: { … } }, … }, flint: { … } };
```

`bits` è il **base64url senza padding** delle righe della colonna d'inchiostro del glifo: larghezza
`w` = `ink[k].w`, `strip_h` righe, `ceil(w/8)` byte per riga, MSB-first, 1 = riempimento (l'origine
`x` nella strip non serve a chi disegna da capo). Anello e ombra **non** vengono salvati: si
ricostruiscono esattamente con la regola di § "I tre strati", ed è quello che fa
`src/pkjs/config/preview.js`.

Serve alla config page per disegnare l'ora campione «12:34» con gli stessi pixel dell'orologio: il
PKJS (`index.js`) non manda però tutto il modulo nell'hash dell'URL, ma **solo la piattaforma
collegata e solo i glifi di `state.preview_time`** (in taglia B senza il `':'`, che la strip B non
ha) **più il solo `w` degli altri digit** (la griglia D25 misura la cifra più larga fra le dieci).

**Misure** (comando canonico, 5 font × 2 taglie × 2 piattaforme, 11 glifi): `digit_masks.js` pesa
**121.107 B** in 1.086 righe, di cui **105.121 caratteri** (86,8 %) sono il base64 delle maschere;
ogni font (le sue due taglie sulle due piattaforme) vale 20,6–23,8 kB di JSON. ⚠️ La spec D45
stimava «≈ 26 KB»: quella cifra vale per **un** font. Il modulo entra tutto nel bundle PKJS del
`.pbw` (`build/pebble-js-app.js`: **367.502 B** il 19/09/2026 dopo S14, 367.747 B il 14/09/2026, 359.644 dopo S12), mentre
nell'URL viaggia molto meno — **43.276 caratteri** di hash su emery, **19.610** su flint, misurati
in `docs/design/galleria-s6-config-page.md` §2.

Il tool stampa il conteggio a ogni generazione e, **prima di scrivere**, verifica su tutte e 20 le
strip che anello e ombra si ricostruiscano esattamente dalla maschera: se una ricostruzione non
torna, esce con errore.

`make -C apps/galleria/test pagecheck` esegue `gen_digits.py --check` con le opzioni canoniche,
`--masks-js` compreso: strip, header e modulo restano allineati o il gate si ferma (+2,9 s; il passo
ha bisogno dell'interprete del pebble-tool, con freetype-py — variabile `PEBBLE_PY` —, altrimenti
viene **saltato con un avviso**). Poi tocca a `test/gen_preview_fixture.py --check` (+0,2 s), che
rilegge `digit_masks.js` e rigenera `test/fixture_preview.js`: quella non ha bisogno di freetype.

### Geometria: `GEOM`, `strip_h` e le celle di lavoro

`GEOM[(piattaforma, taglia)] = (cell_w, rows_h, R, S)`:

| Piattaforma (tag) | Taglia | `cell_w` | `rows_h` (righe del riempimento) | `R` anello | `S` ombra | `strip_h` = `rows_h + 2R + S` | cella di lavoro `cell_w + 2R + S + 2` |
|---|---|---|---|---|---|---|---|
| `emery` (`~color`) | A | 40 | 66 | 2 | 2 | **72** | 48 |
| `emery` (`~color`) | B | 64 | 94 | 2 | 2 | **100** | 72 |
| `flint` (`~bw`) | A | 28 | 42 | 1 | **0** (D26) | **44** | 32 |
| `flint` (`~bw`) | B | 48 | 62 | 1 | **0** (D26) | **64** | 52 |

Il **riempimento** occupa le righe `R .. R + digit_h − 1`: sopra restano `R` righe per l'anello,
sotto `R` righe di anello più `S` righe di ombra. Il `':'` resta dove lo mette il font rispetto alla
baseline; se il suo anello+ombra uscirebbe dalla strip viene alzato (o abbassato) del minimo
necessario, con segnalazione.

Ogni glifo si disegna in una **cella di lavoro** larga `cell_w + 2R + S + 2`, con il riempimento
centrato nella sottocella da `cell_w`: restano almeno `R+2` colonne libere a sinistra e `R+S+2` a
destra. Se un pixel di anello o ombra uscisse dalla cella di lavoro (o dalla strip) è un
**ERRORE**, non un avviso. Con `--pack` le celle di lavoro spariscono e restano solo gli
inchiostri, accostati.

### I tre strati

| Strato | Costruzione |
|---|---|
| riempimento | bitmap monocromatica FreeType (`FT_LOAD_RENDER \| FT_LOAD_TARGET_MONO \| FT_LOAD_MONOCHROME`) |
| anello | pixel a **distanza di Chebyshev 1..R** dal riempimento (R dilatazioni 8-connesse), meno il riempimento — spesso esattamente `R` px dove il glifo è libero |
| ombra | unione degli **spostamenti diagonali** `(+k, +k)`, `k = 1..S`, di (riempimento ∪ anello), meno (riempimento ∪ anello) — sporge di `S` px a destra e in basso. **Su flint `S = 0`: lo strato non esiste** (D26) |

Conseguenza sulle larghezze: `ink[k].w` (v2) = `riempimento + 2R + S`, cioè `ink[k].w` (v1)
`− 2 + 2R + S`: **+4 px su emery, invariato su flint** (`2R + S = 2` come la v1). Un autocontrollo
si ferma con errore se una strip con `S = 0` contiene pixel d'ombra.

### Formato della strip

Una strip per **(font, taglia, piattaforma)**, nell'ordine `'0'..'9'` poi `':'`. Il glifo si
estrae sempre con `gbitmap_create_as_sub_bitmap(strip, GRect(ink[k].x, 0, ink[k].w, strip_h))`
(nessuna copia): `ui_digits.c` conosce **solo** `ink[k].x` e `ink[k].w`, mai `cell_w`.
La taglia A porta **11 glifi**; con `--no-colon-b` (comando canonico di Galleria) la taglia B ne
ha **10**, solo le cifre.

Due disposizioni orizzontali:

- **a celle di lavoro** (default): glifo `k` in `[k·(cell_w+2R+S+2), …)`, riempimento centrato.
  Fra un glifo e l'altro resta molto vuoto (le cifre sono più strette del passo del layout).
- **compatta** (`--pack`, comando canonico da S7): i glifi vengono copiati **adiacenti** da
  sinistra a destra nello stesso ordine, `ink[k].x` è l'offset progressivo e
  `strip_w = Σ ink[k].w` **arrotondata per eccesso a un multiplo di 4 px** (a 2 bit/px, 4 px = 1
  byte esatto: lo stride del PBI resta a byte interi). Le 0..3 colonne in coda sono trasparenti.
  I pixel sono **identici** a quelli della strip a celle di lavoro: `pack_strip()` li copia
  colonna per colonna dopo il disegno, quindi `px`, baseline, righe e `digit_h` non cambiano.

⚠️ Con `--pack` **`cell_w` nell'header resta il passo della griglia del LAYOUT** (40/64 su emery,
28/48 su flint), non la larghezza di una cella nel PNG. È il valore che `ui_time.c`
(`prv_strip_fits`) confronta con `a_cell`/`b_cell` per rifiutare una strip che non corrisponde
alla griglia cablata, ed è il vincolo che `pick_px` e `--fit-width` continuano a usare per la
scelta della `px`.

`package.json` dichiara **10** risorse `DIGITS_<FONT>_<TAGLIA>` (cinque font × due taglie) con
`"file": "digits/<font>_<taglia>.png"` (senza tag): sono i tag `~color`/`~bw` sul nome del file a
far scegliere all'SDK la variante emery/flint.

### Palette: quattro colori esatti (tre su flint)

I PNG sono **RGBA** (`mode "RGBA"`) con al massimo quattro colori — **tre** sulle strip `~bw`, dove
`S = 0` e i pixel d'ombra non esistono (D26) — e l'autocontrollo prima di scrivere rifiuta un
quinto colore, dimensioni diverse da quelle dell'header o un pixel d'ombra dove `S = 0`:

| Pixel | RGBA | A runtime (`memoryFormat: "2BitPalette"`) |
|---|---|---|
| vuoto | `(0, 0, 0, 0)` | trasparente (alpha 0) |
| riempimento | `(255, 255, 255, 255)` | `palette[i]` = colore del testo, oppure `GColorClear` negli stili trasparenti |
| anello | `(0, 0, 0, 255)` | `palette[i]` = alone (stile Pieno) o colore del testo (stili trasparenti) |
| ombra | `(255, 0, 0, 255)` | `palette[i]` = colore opposto negli stili 3D, `GColorClear` negli altri |

L'SDK genera la palette del `.pbi` in ordine arbitrario: `ui_digits.c` riconosce i tre indici
**dal colore** (`0xFF` bianco = riempimento, `0xC0` nero = anello, `0xF0` rosso = ombra), non
dalla posizione.

⚠️ **Sulla variante `~bw` (flint) il quarto colore non esiste** (D26, verificato il 04/09/2026 con
una build in emulatore): la SDK quantizza ogni pixel di una piattaforma B/N con
`nearest_color_to_pebble2_palette`, nel `.pbi` restano solo `0x00`, `0xC0` e `0xFF`, e il rosso
finisce **nello stesso indice dell'anello** — informazione persa nei dati, non solo nella palette
(nessun altro colore aiuta: grigi e blu vengono spinti su bianco o nero). Per questo il generatore
mette `S = 0` su flint, `ui_digits.c` non trova l'indice dell'ombra e gli stili 3D valgono come i
piatti.

### Rasterizzazione e scelta della pixel size

Come `fontgen.py` dell'SDK: `face.load_char(c, FT_LOAD_RENDER | FT_LOAD_TARGET_MONO |
FT_LOAD_MONOCHROME)`, bitmap monocromatica (`pixel_mode == 1`, MSB-first, `pitch` in byte).

- **`px`**: la più grande pixel size per cui `max(altezza dell'inchiostro di '0'..'9') ≤ rows_h`.
  La ricerca sale da 1 e si ferma alla prima `px` che sfora, così il risultato non dipende da
  eventuali non monotonie del hinting oltre il limite. `set_pixel_sizes(0, px)` **non** dà cifre alte
  `px` (dipende da unitsPerEm e dal disegno del font): la `px` trovata è molto più grande
  dell'altezza ottenuta — in taglia A su emery 74 per Anton, 92 per Bebas, 84 per Barlow (dopo
  `--fit-width`) — e finisce nel campo diagnostico `px`. Il campo `px` dell'header è `uint8_t`: se
  la ricerca superasse 255 il tool si ferma con un errore (oggi il massimo è 132, Staatliches B su
  emery).
- **Baseline comune**: `baseline_row = R + max(bitmap_top delle cifre)`, ogni glifo va a
  `y0 = baseline_row − bitmap_top`. La cifra più alta occupa quindi le righe `R .. R + digit_h − 1`.
- **Glifi considerati**: i vincoli di larghezza guardano solo i glifi effettivamente generati,
  quindi con `--no-colon-b` la taglia B li valuta sulle sole cifre. Con i cinque font attuali il
  `':'` non è mai il glifo più largo, perciò non è lui a fissare la `px`.
- **Orizzontale**: il riempimento è centrato nella sottocella da `cell_w` della cella di lavoro,
  con almeno 1 px libero per lato **oltre** ad anello e ombra. Se `riempimento + 2 > cell_w` il
  glifo non ci sta ed è un **errore** (uscita 1), a meno di `--fit-width`. **D24**: il vincolo
  misura il **riempimento**, non `riempimento + 2R + S` — anello e ombra possono sporgere dal
  passo della cella, perché è la **griglia** di `ui_time.c` ad assorbirli (D25, § "Controlli di
  riga"). Con `--fit-width` la ricerca aggiunge, nella sola taglia A, anche il vincolo
  `riempimento(':') + 2 ≤ colon_cell` (16 su emery, 12 su flint).

### Controlli di riga (spec S8-stile §3.4)

Il generatore rifà il conto di `ui_time.c:prv_grid_steps` + `prv_place_row_fit`. La **derivazione**
della regola — **D25, terza versione**, con la storia delle tre stesure e il motivo di ciascuna — sta
nella tabella delle decisioni di `docs/design/galleria-s8-stile.md`, voce «D25 v3» (attenzione: §3.4
di quel documento descrive ancora la seconda stesura, per glifo). Qui resta solo quello che il tool
deve rispettare, perché `RING_GAPS` e `FIT_MARGIN` vanno tenuti uguali a quelli di `ui_time.c`:

- griglia **uniforme** (un passo per tutte le cifre, uno per il `':'`: le cifre non si spostano al
  cambio di minuto), ma **adattata al font**: passo delle cifre = `max(cell_w, nucleo della cifra
  PIÙ LARGA + gap)`, passo del `':'` = `max(colon_cell, nucleo del ':' + gap)`;
- **nucleo** = `riempimento + 2R`, con riempimento = `ink[k].w − 2R − S`, cioè esattamente
  `ui_digits_fill_width()` di `ui_digits.c`; il `gap` è lo spazio minimo fra gli anelli di due
  glifi adiacenti;
- il `gap` si prova nell'ordine **2, 1, 0** px (`RING_GAPS`) e si tiene il primo per cui la riga
  intera (più `4 + PM 18` in 12 h) sta in `larghezza schermo − 2 × FIT_MARGIN`, con
  **`FIT_MARGIN = 2`**; se non basta nemmeno 0 si passa alla **regola di riserva**,
  `max(cella, riempimento più largo + R)`, che vale **sempre** (nessun margine richiesto);
- la riserva è l'**unica** regola che il generatore garantisce: è quella su cui si ferma con errore
  (uscita 1, nessun file scritto) se la riga non entra nello schermo (200 px su emery, 144 su
  flint). L'ombra può sporgere di 1 px nel margine interno del vicino (solo negli stili 3D).

Il gap scelto compare come `[gap 2]` … `[gap 0]` oppure `[gap riserva]` **in ogni segnalazione di
riga** (avvisi ed errori, che il tool ricopia nel commento in testa a `digit_metrics.h`: oggi non
ce n'è nessuna, perché tutte le righe entrano). Il conto si fa sulle righe peggiori:

| Riga | Passi | Limite |
|---|---|---|
| taglia A, 24 h `20:44` | griglia uniforme calcolata su `cell_w` (cifre) e `colon_cell` (`':'`), nessun gap fra le celle | larghezza schermo |
| taglia A, 12 h `10:44` + 4 + `PM` | griglia uniforme su `cell_w − 2` (AM/PM) e `colon_cell`; `PM` = **18 px** su emery **e** su flint (Gothic 14 Bold, misurato: stesso font, stessa larghezza) | larghezza schermo |
| taglia A, 12 h `09:44` + 4 + `PM` | come sopra: è la riga con lo **zero iniziale** (`GAL_LZ_ON`). Con la griglia uniforme è **larga quanto «10:44»** — il controllo serve per i **margini**, che si stringono perché lo `0` ha l'inchiostro più largo dell'`1` | larghezza schermo |
| taglia B | `2 × passo della griglia + gap 8`, peggiore delle 100 coppie di cifre (`[gap 2]` per tutti i font) | larghezza schermo |

Secondo controllo, **AVVISO** e non errore: il tool rifà anche il **centraggio** del blocco
(`x0 = (schermo − blocco) / 2`, mai negativo, come `ui_time.c`) e la posizione dei pixel di ogni
glifo come li disegna `ui_digits_draw` (`gx = x + (passo − nucleo) / 2` con `nucleo = ink − ombra`,
divisione intera del C: il riempimento resta centrato nel passo e l'ombra sporge a destra), poi
misura i **margini** fra i pixel disegnati e i bordi dello schermo. Un margine negativo vuol dire
qualche pixel di anello o ombra tagliato dal layer al bordo: si segnala (nell'header e nella
tabella), non si blocca.

**Come si legge la tabella di `--check`.** Le colonne `riga 1` / `riga 2` mostrano
`larghezza/limite(inchiostro) margine_sx/margine_dx`, con `!` sulla larghezza quando sfora e sui
margini quando sono negativi; il numero fra parentesi è la stessa riga misurata con l'**inchiostro
intero**, cioè `Σ max(cella, inchiostro)` — la regola che D25 **non** usa, tenuta come diagnostica.
Le colonne sono **due**: `riga 2` è la 12 h «10:44»; la 12 h «09:44» viene controllata lo stesso
(errore, avvisi ed etichetta `[gap …]` compresi) ma non ha una colonna sua, perché con la griglia
uniforme è larga **quanto «10:44»** per tutti e cinque i font e cambiano solo i margini, più stretti
(fino a 0 px con Staatliches su emery).

Con la geometria di D20/D26 e i cinque font **tutte le righe entrano** e il comando canonico esce 0
(nessun `--allow-row-overflow` nello stato del repo):

| Riga | Larghezza | Limite | Margini peggiori (sx / dx) |
|---|---|---|---|
| emery A, 24 h `20:44` | 180 Bebas · 183 Anton · 192 Staatliches · 193 Francois One · **195 Barlow** (tutti `[gap 2]`) | 200 | 5 (Barlow, Francois One) / 2 (Barlow) |
| emery A, 12 h `10:44`/`09:44` + PM | 194 Bebas · 195 Anton (`[gap 0]`) · **198 Barlow, Francois One, Staatliches** (`[gap riserva]`) | 200 | 0 (Staatliches in «09:44») / 1 (Barlow, Francois One, Staatliches) |
| flint A, 24 h | 124 Anton, Bebas · 128 Staatliches · 132 Francois One · **134 Barlow** (tutti `[gap 2]`) | 144 | 7 (Barlow) / 6 (Barlow) |
| flint A, 12 h + PM | 138 Bebas `[gap 2]` · 138 Anton `[gap 0]` · 138 Staatliches · **142 Barlow, Francois One** (`[gap riserva]`) | 144 | 1 (Francois One in «09:44») / 1 (Barlow, Francois One) |
| taglia B (2 glifi + gap 8) | 136 Anton, Bebas, Staatliches · 138 Barlow · **140 Francois One** su emery; 104 su flint (tutti i font) | 200 / 144 | ≥ 29 emery, ≥ 23 flint |

In **24 h** la riga sta larga, il gap scelto è sempre 2 e la larghezza dipende dal solo passo della
cifra più larga ripetuto quattro volte. In **12 h** le celle scendono a 38 (26 su flint) e alla riga
vanno tolti anche `4 + PM 18` e i `2 × FIT_MARGIN = 4` px: restano 174 px per i cinque glifi su
emery (118 su flint), quindi Bebas e Anton passano a `[gap 0]` mentre Barlow, Francois One e
Staatliches — con il riempimento più largo — ricadono sulla **riserva**, ed è l'unico caso in cui
gli anelli di due cifre larghe tornano a toccarsi. Con l'inchiostro intero, in 12 h su emery
entrerebbe **solo Bebas** (196 su 200): Anton 201, Barlow 206, Francois One 207, Staatliches 208 —
sono i numeri fra parentesi della colonna `riga 2` di `--check`. Se cambiassero l'ordine dei gap,
`FIT_MARGIN`, la regola di riserva o la geometria `R`/`S`, questo controllo va rifatto.

### Metriche generate (`digit_metrics.h`)

```c
#define DIGITS_GLYPHS 11
#define DIGITS_FONT_COUNT 5          /* = len(FONTS) nel tool: aggiungere un font = una riga */
typedef struct __attribute__((packed)) { uint16_t x; uint8_t w; } DigitInk;   /* riempimento ∪ anello ∪ ombra; packed: 3 B */
typedef struct __attribute__((packed)) {
  uint16_t strip_w, strip_h;      /* strip_h = rows_h + 2·ring + shadow */
  uint8_t  cell_w;                /* con --pack: passo della griglia del layout */
  uint8_t  digit_h;               /* righe ring .. ring + digit_h − 1 */
  uint8_t  ring, shadow;          /* R e S */
  uint8_t  px;                    /* pixel size FreeType (diagnostica) */
  DigitInk ink[DIGITS_GLYPHS];                          /* '0'..'9', ':' */
} DigitStripMetrics;
static const DigitStripMetrics DIGITS_METRICS[DIGITS_FONT_COUNT][2];   /* #if PBL_COLOR / #else */
static const uint32_t         DIGITS_RESOURCE_IDS[DIGITS_FONT_COUNT][2];
```

La tabella `FONTS` del tool è **data-driven**: aggiungere un font è **una riga** in `FONTS` (chiave,
nome, prefisso di risorsa, file TTF), e `DIGITS_FONT_COUNT` segue `len(FONTS)`. Indici: 0 Anton,
1 Bebas Neue, 2 Barlow Condensed Bold, 3 Francois One, 4 Staatliches; taglia 0 = A, 1 = B.
L'indice qui è l'**indice di strip**, non il valore dell'impostazione `font` (D22: `font` 3 = LECO,
font di sistema, non ha strip, quindi indice di strip = `font < 3 ? font : font − 1`).

`ink[k].x` è la prima colonna del glifo con **riempimento, anello o ombra**, `ink[k].w` la
larghezza totale: sono i due valori della sub-bitmap. Senza `--pack` è la prima colonna piena
dentro la cella di lavoro `k`; con `--pack` è l'offset progressivo (`ink[0].x == 0`, poi la somma
delle larghezze precedenti).

`DIGITS_GLYPHS` resta **11** anche con `--no-colon-b`: nella taglia B la voce del `':'`
(`ink[DIGITS_GLYPH_COLON]`) vale `{ 0, 0 }`, cioè **glifo assente** — `ui_digits.c` salta i glifi
con `w == 0` (nessuna sub-bitmap, `glyph[g] = NULL`; `ui_digits_draw` non disegna,
`ui_digits_ink_width` ritorna 0). Il controllo `b.size.w == m->strip_w` al caricamento vale come
prima ed è quello che si accorge di un PNG rigenerato senza l'opzione (o viceversa).

`digit_h` è l'**altezza reale del riempimento**: le cifre occupano le righe `ring .. ring + digit_h − 1`
della strip (`ui_time.c` ci allinea la base di AM/PM, §3.1, con `strip_y = fill_y − ring`).
Vale `rows_h` ovunque **tranne** dove `--fit-width` ha dovuto abbassare la `px`: Barlow A 61
(emery) e 40 (flint) e Barlow B 93 (emery); Francois One A 61 (emery) e 41 (flint) e Francois One B
61 (flint); Staatliches A 65 (emery).

⚠️ **I valori delle 20 strip non stanno qui**: sono un dato **generato** e si leggono da
`$PY tools/gen_digits.py --check --fit-width --no-colon-b --pack` (le stesse opzioni del comando
canonico), che stampa una riga per (font, piattaforma, taglia) con le colonne `cella`
(`cell_w × strip_h`), `strip` (`strip_w × strip_h`), `px`, `h ink` (`digit_h`/`rows_h`), `R/S`,
`w max` e `w ':'`, le due righe di controllo `riga 1` / `riga 2` e l'elenco delle larghezze
d'inchiostro di `'0'..'9'` e del `':'`. Gli stessi valori stanno nell'array `DIGITS_METRICS[][]` di `digit_metrics.h`
(e le note di `--fit-width` e di layout nel suo commento in testa), e `pagecheck` verifica a ogni
giro che tool, strip e header restino allineati: ricopiarli qui vorrebbe dire lasciarli invecchiare
in un terzo posto.

Per Anton/Bebas/Barlow `px`, `digit_h` e le larghezze del **riempimento** sono rimasti quelli di
S3/S7 (la v2 non tocca la rasterizzazione) e le sei strip `~bw` dei font vecchi sono **identiche
byte per byte** alla v1.

### `--fit-width`: il `'4'` di Barlow Condensed Bold

Barlow Condensed Bold ha un `'4'` molto più largo delle altre cifre (42 px contro 35–37 alla `px`
che riempie la taglia A di emery). Con `cell_w = 40` non entra nemmeno senza anello: il tool si
ferma con

```
ERRORE  barlow emery A     glifo '4' largo 42 px: 42 + 2 > cell_w 40
```

`--fit-width` aggiunge alla ricerca il vincolo `riempimento + 2 ≤ cell_w` e abbassa la `px`
**solo** delle combinazioni che non entrano (le altre dieci non cambiano di un byte): Barlow A
scende a `px 84` su emery (riempimento 61 px invece di 66) e a `px 58` su flint (40 invece di 42).
Le perdite di altezza finiscono nel commento in testa a `digit_metrics.h`, insieme agli avvisi di
layout.

**Avviso di layout della taglia A** (design §3.1/§3.3): la griglia **non** è uniforme — il `':'` ha
una cella più stretta delle cifre — e in 12 h si stringono di 2 px **solo le celle delle cifre**,
per far posto ad AM/PM: il `':'` tiene la cella piena (`ui_time.c`: `colon = s_lay.a_colon`, senza
shrink), perché a 14/10 px il `':'` di Anton e Barlow non ci starebbe.

| | cifre | `':'` |
|---|---|---|
| emery A, 24 h | 40 | 16 |
| emery A, 12 h | 38 | **16** |
| flint A, 24 h | 28 | 12 |
| flint A, 12 h | 26 | **12** |

Il tool confronta ogni glifo con la **sua** cella nei due layout e segnala chi sfora. Su emery
sforano molti più glifi che nella v1 — in 12 h quasi tutte le cifre — perché `ink[k].w` è cresciuto
di 4 px, mentre su flint gli avvisi sono gli stessi della v1 (`2R + S = 2`). Non è un errore: è la
sporgenza prevista da D24, e con **D25** è la **griglia** ad assorbirla (§ "Controlli di riga"). In
24 h su emery il `4` di Barlow (nucleo 42, gap 2 → 44) porta la griglia da 40 a 44 px, in 12 h la
riserva la porta a 40; il `':'` ha il suo passo, calcolato allo stesso modo (in 24 h su emery:
19 px con Anton e Barlow, 17 con Francois One, 16 con Bebas e Staatliches). Il controllo che conta
davvero è quello **di riga**.

### Costo delle strip

Formula del PBI a 2 bit/px (`memoryFormat: "2BitPalette"` + `spaceOptimization: "memory"`):

```
byte della voce nel pbpack = 12 (header) + ceil(strip_w / 4) × strip_h (pixel) + 4 (palette)
byte in heap                =              ceil(strip_w / 4) × strip_h (pixel)  + 12 GBitmap × 56 B
                                                                   (la strip + le 11 sub-bitmap)
```

Valori **calcolati** con la formula sulle strip della v2 (le misure dirette su
`app_resources.pbpack` sono di S3 e riguardano la v1):

| voce nel pbpack | A | B |
|---|---|---|
| emery, anton | 7.288 | 13.316 |
| emery, bebas | 6.784 | 12.216 |
| emery, barlow | 7.144 | 13.816 |
| emery, francois | 7.504 | 14.916 |
| emery, staatliches | 7.360 | 13.816 |
| flint, anton | 2.744 | 5.264 |
| flint, bebas | 2.392 | 4.816 |
| flint, barlow | 2.788 | 5.520 |
| flint, francois | 2.876 | 5.776 |
| flint, staatliches | 2.744 | 5.520 |

I valori **v1** per strip (prima dell'anello e dell'ombra) stanno nella storia git:
`git show 81dbcca:tools/README.md`, §10 «Costo delle strip».

Le sei risorse dei tre font vecchi passano da 52.692 (v1) a **60.564 B** su emery (**+7.872 B**) e
restano **23.524 B** su flint (le strip `~bw` non cambiano, `R = 1` e `S = 0` come la v1). Con
**dieci** risorse il totale è **104.160 B** (101,7 KiB) su emery e **40.440 B** (39,5 KiB) su flint:
dentro il budget risorse (≤ 256 KB).

**Heap**: in RAM è residente **una sola** strip per taglia (quella del font attivo) e il numero di
`GBitmap` (strip + 11 sub-bitmap) non cambia; su emery i pixel crescono di +1.152 B (taglia A,
Anton) e +1.492 B (taglia B, Anton) rispetto alla v1, **su flint per niente**. Il caso peggiore è
**Francois One in taglia B su emery** (14.900 B di pixel). I numeri di heap misurati davvero in
emulatore stanno in `docs/design/galleria-s8-stile.md`.

I 20 PNG pesano 57.507 B in tutto, ma è la dimensione del sorgente: quello che conta è il PBI
generato dall'SDK.

---

## 11. `galleria_devserver.py` – dev server di Galleria (S5b + S6)

Sul telefono le foto e le impostazioni arrivano dalla **config page** (`Pebble.openURL` di un URL
`data:`); in **emulatore** quella strada non esiste — `pebble emu-app-config` 5.0.40 non apre pagine
`data:` — quindi il PKJS in modalità dev (`Pebble.platform === 'pypkjs'`) le chiede a questo server
locale. Specifica: `docs/design/galleria.md` §5.1 ("Modalità dev") e §6 ("Emulatore").

Converte le foto di `--album` con `photo_prep.py` (§9), le tiene **in memoria** (nessuno stato su
disco: chiuderlo equivale a disinstallare l'app dal telefono) e le espone via HTTP insieme alle
impostazioni, all'ordine di rotazione e allo "scenario" dei guasti iniettati nella sync di S5a.
Serve anche una **pagina di prova** HTML per scegliere foto/ordine/impostazioni dal browser del PC;
da S6 al suo posto si può servire la **config page vera**, inlinata a ogni richiesta da
`--page-dir` (§13), e allora il server fa solo da tramite fra pagina e PKJS (modalità **relay**).

Dipendenze: **solo stdlib** (`http.server.ThreadingHTTPServer`, `json`, `zlib`, `base64`,
`subprocess`). Pillow serve solo dentro `photo_prep.py` e per le immagini sintetiche del
`--selftest`.

### Uso

```bash
# due foto negli slot 0 e 1, rotazione ogni 5 minuti, layout B
python3 tools/galleria_devserver.py --album foto1.jpg foto2.png \
        --settings '{"interval_min": 5, "layout": 1}'

# layout «ora in basso» (S14/D136) con rotazione ogni 6 ore (S14/D139)
python3 tools/galleria_devserver.py --album foto1.jpg \
        --settings '{"layout": 2, "interval_min": 360}'

# slot e ordine espliciti + guasto "crc" iniettato nel motore di sync
python3 tools/galleria_devserver.py --album a.jpg b.jpg c.jpg \
        --slots 3,7,11 --order 11,3,7 --scenario crc

# quantizzazione nello spazio del vetro (l'"=" è obbligatorio, vedi tabella)
python3 tools/galleria_devserver.py --album a.jpg --photo-prep-args="--sunlight"

# autotest di tutti gli endpoint (immagini sintetiche, nessuna rete esterna, < 5 s)
python3 tools/galleria_devserver.py --selftest

# la pagina incorporata e i JSON SENZA avviare il server (test node della pagina)
python3 tools/galleria_devserver.py --dump-page > /tmp/config.html
python3 tools/galleria_devserver.py --dump-json state --settings '{"layout": 1}'
```

Poi, da un **altro terminale** (con l'emulatore avviato e la watchface installata):

```bash
pebble emu-app-config --emulator emery      # apre http://localhost:8765/config.html?return_to=… nel browser
```

| Opzione | Effetto |
|---|---|
| `--port N` | porta di ascolto, **0..65535** (default **8765**, quella che il PKJS cerca; `0` = porta libera; fuori intervallo o non numerica = errore di argparse, non un traceback). Attenzione: `apps/galleria/src/pkjs/devserver.js` ha `http://localhost:8765` **cablato**, quindi con un'altra porta il percorso emulatore non funziona più (resta buona per aprire la pagina a mano nel browser) |
| `--bind IND` | indirizzo di ascolto (default `127.0.0.1`: solo questo PC) |
| `--album FOTO…` | foto del pool, **max 12**: ciascuna convertita in `raw6` (34.200 B) + `raw1` (3.024 B) + anteprime ×2. Si può anche omettere: il server parte con il pool vuoto (`photos: []`, `order: []`), utile per provare la pagina o il PKJS senza foto |
| `--slots k,k,…` | slot delle foto di `--album` (default `0,1,2,…`); valori 0..11, unici, tanti quante le foto |
| `--order k,k,…` | ordine di rotazione (default: gli slot nell'ordine dato); slot senza foto o ripetuti = errore |
| `--settings JSON` | impostazioni iniziali, anche **parziali**, sopra i default di `settings_set_defaults()` |
| `--scenario …` | `photo` (default, nessun guasto) \| `seq` \| `dup` \| `crc` \| `interrupt` \| `none`: finisce in `hooks.scenario` e il PKJS lo usa per iniettare i guasti di S5a. Sono gli stessi del design §5.1; gli scenari `settings`/`order`/`delete` della fixture di S5a qui non servono come hook, si provano **davvero** cambiando impostazioni, ordine e foto dalla pagina (`POST /save`) |
| `--open-ms N` | **v1.9**: mette `open_ms: N` (intero **0..65535**, come `HELLO.OPEN_MS` u16) in `hooks` di `/state.json`; `apps/galleria/src/pkjs/index.js` in modalità dev forza `hello.openMs = N` **prima del piano**, così la config page mostra l'avviso «Galleria si avvia lentamente» (riquadro `#slow`) anche in emulatore, dove l'apertura del file persist è istantanea. Senza l'opzione `hooks` non cambia (nessuna chiave `open_ms`). La soglia della pagina cresce con le **foto valide sull'orologio** (400 + 100 × n ms, n dallo snapshot dell'HELLO): con l'orologio vuoto basta `N > 400`, con 4 foto sincronizzate serve `N > 800` |
| `--work DIR` | cartella dei `.raw6`/`.raw1`/anteprime (default: temporanea, **rimossa** all'uscita — sia con Ctrl-C sia con SIGTERM, cioè `kill`/`timeout`/`pkill`); una cartella non scrivibile è un errore che nomina `--work`, non la porta |
| `--page FILE` | serve questo HTML su `/config.html` al posto della pagina incorporata (è così che S6 proverà la config page vera); file mancante o illeggibile all'avvio = errore con messaggio. Il file viene **riletto a ogni `GET /config.html`**: in S6 basta salvare e ricaricare il browser, senza riavviare il server (cioè senza riconvertire l'album, ~300 ms per foto). Se sparisce o diventa illeggibile a server acceso si continua a servire l'ultima copia buona, con un avviso su stderr |
| `--page-dir DIR` | **config page vera (S6)**, esclusivo con `--page`: a ogni `GET /config.html` la pagina viene inlinata da `DIR` con `tools/build_config_page.py` (§13: `inline_page()`, importato pigramente dal `tools/` accanto), così si salva un file delle sorgenti e si ricarica il browser senza riavviare il server. Un errore di inlining (file mancante, `</script>` nel contenuto, pagina oltre 96 KB) è un **500** con il messaggio in chiaro nel corpo e una riga su stderr a **ogni** GET — niente «ultima copia buona», che nasconderebbe una pagina rotta proprio mentre la si scrive; gli avvisi non fatali del tool (attributi persi, ordine degli script, > 84 KB, `localStorage`) escono invece **una volta sola** per messaggio. La cartella viene riletta a ogni richiesta, ma `build_config_page.py` è importato una volta sola: modificare il **tool** richiede il riavvio del server. `DIR` inesistente o non una cartella = errore di argparse (uscita 2); `--dump-page` lo rispetta. Senza `--album` accende anche la modalità relay |
| `--lang en\|it\|de\|fr\|es\|pt` | **S10 (D33)**, sei lingue da **S11 (D39)**: mette `lang: "<codice>"` in `hooks` di `/state.json`; `apps/galleria/src/pkjs/index.js` in modalità dev lo usa come **lingua automatica** della config page al posto di `Pebble.getActiveWatchInfo().language`, che in emulatore è sempre `en_US`. È un hook come `--open-ms`: uno stato con `hooks` e **senza** `lang` azzera l'hook (dev server riavviato senza il flag). L'elenco `PAGE_LANGS` è lo stesso — e nello stesso ordine — di `LANG_ORDER` in `index.js` e di `LANGS` in `config/page_core.js`; una lingua fuori elenco (`--lang ru`) è un errore di argparse. ⚠️ Da non confondere con l'**impostazione** `lang` (byte 13 del blob, 0..6), che è una voce di `--settings` (`--settings '{"lang": 3}'` = pagina e orologio forzati in tedesco, `6` = portoghese) |
| `--relay` | **modalità relay (S6)**: nessun album sul server — `/state.json` diventa `{v:1, seq, settings?, hooks:{scenario, open_ms?}}`, **senza `full`**, che il PKJS applica come delta vuoto e quindi non cancella nulla. Le foto arrivano dalla config page con `POST /save` e restano nel `localStorage` del PKJS. Si accende da sé con `--page-dir` senza `--album`; **con `--album` è un errore** di riga di comando |
| `--photo-prep-args "…"` | opzioni extra per `photo_prep.py`. **Serve la forma con l'uguale** (`--photo-prep-args="--sunlight"`): senza `=`, argparse scambierebbe `--sunlight` per una propria opzione |
| `--selftest` | autotest di tutti gli endpoint, poi esce (0/1) |
| `--dump-page` | stampa su stdout la pagina di `/config.html` (quella incorporata, o il file di `--page`) ed esce **senza avviare il server**: è quello che usa `apps/galleria/test/test_devpage.js` per eseguire lo script della pagina sotto node |
| `--dump-json pool\|state` | stampa su stdout `/pool.json` o `/state.json` costruiti dalle opzioni date (`--album`, `--slots`, `--order`, `--settings`, `--scenario`, `--open-ms`) ed esce senza avviare il server; con `--album` converte le foto (in una temporanea, rimossa subito) e su stdout esce **solo il JSON** (niente righe `pool[..]`); Ctrl-C o SIGTERM a metà conversione: uscita **1** con «interrotto: nessun JSON prodotto.» (nessun traceback), temporanea rimossa e `photo_prep` figlio ucciso — con `--work DIR` i raw restano invece nella cartella scelta, come per il server |

Campi di `--settings` (stessi intervalli di `settings_validate()` in `apps/galleria/src/c/settings.c`;
un valore fuori intervallo è un **errore**, non viene sostituito in silenzio dal default):
`layout` **0..2** (0 «ora in alto», 1 «a tutto schermo», **2 «ora in basso»**: S14/D136),
`font` **0..5** (0 Anton, 1 Bebas Neue, 2 Barlow Condensed Bold, **3 LECO**,
**4 Francois One**, **5 Staatliches**: D22, S8-stile), `clock_mode` 0..2, `leading_zero` 0..2,
`text_color` 0..4, `outline` 0..2,
`interval_min` ∈ {0, 5, 15, 30, 60, 180, **360**, **720**, 1440} (S14/D139: 360 = ogni 6 h,
720 = ogni 12 h), `order` 0..1,
`shake_next` 0..1, `info_row` 0..15, `digit_style` **0..3** (0 pieno, 1 trasparente, 2 trasparente
3D, 3 pieno 3D: D21, S8-stile), `lang` **0..6** (0 automatica = lingua dell'orologio, 1 en, 2 it,
3 de, 4 fr, **5 es**, **6 pt**: D31 e S11/D39). Default: `30` per `interval_min`, `1` per
`shake_next`, `15` per `info_row`, `0` per tutto il resto (`digit_style` e `lang` compresi).

⚠️ Il server accetta `digit_style` 2 e 3 anche per uno scenario flint: la normalizzazione di D26
(2 → 1, 3 → 0, dove l'ombra non esiste) sta nella **config page**, non nel dev server.

Gli elenchi di `--slots` e `--order` devono essere ben formati: un pezzo vuoto (`0,,1`, `3,`) è un
**errore**, non viene saltato in silenzio — sulla riga di comando un refuso va segnalato. Il
ripulisci‑e‑tira‑avanti (doppioni scartati, slot mancanti accodati) vale solo per l'`order` che
arriva dal `POST`, dove è comportamento documentato.

⚠️ Un server avviato **senza `--album` e senza `--relay`** resta in modalità pool come in S5b e
serve un `/state.json` `full: true` con **zero foto**: il PKJS lo applica come stato completo e,
non trovandoci nessuno slot, **cancella tutto l'album**. All'avvio il server lo dice in due righe
su stderr («… CANCELLA TUTTI gli slot … --relay»); per fare solo da tramite alla config page
usare `--relay` (automatico con `--page-dir` senza `--album`). Il payload del server nudo resta
`full` apposta: `apps/galleria/test/test_devpage.js` lo pretende da `--dump-json state`.

La porta viene presa **prima** di convertire le foto: se è occupata l'errore arriva subito, senza
pagare ~300 ms per foto, e "impossibile ascoltare su …" riguarda davvero solo il socket.

Uscite: un errore di **riga di comando** (valore fuori intervallo, elenco malformato, `--page`
illeggibile, `--settings` sbagliate) passa da `argparse` — `usage:` + messaggio, **uscita 2**; un
errore **all'avvio** (foto non trovata, `photo_prep.py` fallito, `--work` non utilizzabile, porta
occupata) è un messaggio su stderr con **uscita 1**. In nessun caso un traceback.

### Endpoint

Tutte le risposte JSON sono UTF-8 con `Content-Type: application/json; charset=utf-8`,
`Cache-Control: no-store` e `Access-Control-Allow-Origin: *` (a `OPTIONS` risponde 204 con i soli
header applicativi — i tre CORS, più `Server:` e `Date:` che aggiunge `http.server` — e **senza**
corpo né `Content-Length`, come vuole la RFC 7230 §3.3.2). Ogni richiesta stampa una riga di log su
stdout: `14:31:14.118  GET     /photo/0.raw6 -> 200  34200 B  0.2 ms`; anche quelle a cui risponde
`http.server` da sé (metodo non gestito, p.es. `HEAD` o `PUT` → 501; riga di richiesta malformata →
400, con `?` al posto di metodo e percorso).

| Richiesta | Risposta |
|---|---|
| `GET /` | 302 → `/config.html` |
| `GET /config.html` | pagina di prova (o il file di `--page`), `text/html; charset=utf-8` |
| `GET /state.json` | **pool** (`--album`, o server nudo): payload **completo** `{v:1, full:true, seq, settings?, order, deleted:[], photos:[…], hooks:{scenario, open_ms?}}` — `settings` compare solo dopo `--settings` o un Save: senza, il PKJS (`album.settingsSet`) non sovrascrive le impostazioni dell'orologio. **Relay** (`--relay`, o `--page-dir` senza `--album`): `{v:1, seq, settings?, hooks:{scenario, open_ms?}}`, **senza `full`** e senza `photos`/`order`/`deleted`, così il PKJS lo applica come delta vuoto e non elimina nessuno slot |
| `GET /save.json` | quello che il PKJS legge dopo un Save. Prima di ogni Save — e in modalità pool — è l'**alias** di `/state.json`, come in S5b; dopo un Save della **config page vera** è il payload che la pagina ha mandato, con `seq` e `hooks` aggiunti e **senza `full`** (il PKJS lo applica come delta). Un Save della pagina di prova azzera il payload tenuto da parte e riporta `/save.json` allo stato del server |
| `GET /pool.json` | `{pool:[{i, name, photo_id, crc6, crc1, preview, preview_flint}…], slots_max:12, settings_defaults:{layout:0, …, interval_min:30, shake_next:1, info_row:15}}` — `settings_defaults` sono i **12** default di `settings_set_defaults()` (`digit_style` e `lang` compresi; unica fonte: `SETTINGS_SPEC`): la pagina li usa quando `state.json` non porta `settings` |
| `GET /photo/<k>.raw6` \| `.raw1` | byte dello slot `k` (`application/octet-stream`); con `?b64=1` → **base64url senza padding** come testo. 404 se lo slot è vuoto |
| `GET /preview/<i>.png` | anteprima ×2 (resa "come sul vetro") della foto `i` del **pool**; `?flint=1` = versione 1 bit |
| `POST /save` = `POST /state.json` | due corpi possibili, distinti dal campo **`deleted`** (vedi «Payload della config page vera» più sotto). **Pagina di prova**: corpo `{v?: 1, settings?, order?, photos?: [{slot, src}], scenario?}` → stato sostituito nei campi presenti, `seq + 1`, risposta `{"ok":true,"seq":N}`; errore → 400 `{"ok":false,"error":"…"}`. La validazione è severa allo stesso modo a **tutti e tre** i livelli: un campo sconosciuto in cima, dentro `settings` e dentro una voce di `photos` (che vuole esattamente `slot` e `src`) danno tutti e tre 400 (un refuso della pagina non deve diventare un save a metà); `{"v": true}` è 400 come `{"v": 2}`. Corpo senza `Content-Length` (`Transfer-Encoding: chunked`) → 411; `Content-Length` più grande del corpo davvero inviato → **408** dopo 15 s (`DevHandler.timeout`), senza lasciare il thread appeso; `Content-Length` assente, non numerico, negativo o oltre 8 MiB → **400**. In tutti e tre i casi (411, 408, 400) la risposta porta `Connection: close` e la connessione **si chiude**: il corpo non letto non deve diventare la "richiesta" successiva della keep-alive (prima, `{}` + `GET` sullo stesso socket dava un `501 Unsupported method ('{}GET')` e la `GET` non veniva mai servita); un client keep-alive (`http.client`, `curl`) riapre da sé alla richiesta dopo |
| qualsiasi altro | 404 `{"ok":false,"error":"not found"}`; su un `POST` anche `Connection: close` (il corpo non viene letto) |

Nei percorsi il numero è **canonico**: `/photo/0.raw6` sì, `/photo/00.raw6` no (404) — sono URL che
genera il server, non testo scritto a mano. `?b64=1` accetta anche `1/true/yes/on` e il flag da solo
(`?b64`); idem `?flint`.

In `photos` c'è **una voce per formato**: lo stesso slot compare due volte, `fmt: 1` (raw6, emery) e
`fmt: 2` (raw1, flint), con lo stesso `photo_id` e il `crc` (CRC-32 zlib, **senza segno**) del
proprio formato; l'elenco è ordinato per slot crescente. `photo_id` = `crc32(raw6) & 0x7FFFFFFF`,
mai 0 (resta sotto 2³¹ perché il JS maneggia gli interi come int32): è la stessa convenzione di
`newPhotoId()` in `apps/galleria/src/pkjs/album.js` (che genera id già `& 0x7FFFFFFF`).
Al posto di `data` c'è `url`, **relativo** alla base del server (`/photo/<slot>.<fmt>?b64=1`): il
PKJS lo ricostruisce da `slot` + `fmt`, un altro consumatore deve premettere `http://<host>:<porta>`.
Il payload si scarica **una foto per volta** con `GET …?b64=1` e si salva in `localStorage`, da lì in
poi l'album è identico a quello del telefono (design §5.1).

Nel `POST` l'`order` viene **ripulito**: gli slot senza foto vengono scartati e quelli dell'album che
mancano si accodano in ordine crescente, così l'ordine è sempre una permutazione degli slot pieni
(è ciò che `ALBUM_ORDER` si aspetta). `photos` sostituisce l'album: gli slot non elencati vengono
svuotati (`full: true`).

### Payload della config page vera (S6)

Un `POST /save` è **della config page vera** se il corpo ha il campo `deleted` (la pagina lo manda
sempre, anche vuoto; la pagina di prova mai). Restano alla pagina di prova i corpi con `scenario` e
quelli con `photos: [{slot, src}]` (indici del pool, non byte). Un corpo con `v`, `settings` e
`order` ma **senza** `deleted` non scivola nel validatore sbagliato: è un **400** «manca "deleted"»,
perché altrimenti verrebbe accettato con 200, azzererebbe il payload tenuto da parte e il Save
sparirebbe in silenzio.

La validazione è severa quanto quella della pagina di prova, e per lo stesso motivo: quel che passa
di lì il PKJS lo applica come **delta** all'album, e un refuso della pagina non deve diventare mezza
sincronizzazione. Il corpo deve portare `v`, `settings`, `order` e `deleted` — la pagina li manda
sempre —; `photos` è l'unico facoltativo e non è ammesso nient'altro.

| campo | regola |
|---|---|
| `v` | l'**intero** `1`: `2`, `true` e `1.0` sono tutti 400 |
| `deleted`, `order` | liste di interi 0..11, senza doppioni |
| `settings` | **tutti e 12** i campi (`digit_style` da S8-stile, `lang` da S10), negli intervalli di `settings_validate()` |
| `photos` | al più **12** voci, ognuna con **tutti** i campi `slot`, `photo_id`, `fmt`, `len`, `crc`, `data`, `name` (più `thumb`, facoltativo) |
| `photos.slot` | 0..11, **unico** dentro `photos`; può però comparire anche in `deleted` (una foto nuova su uno slot appena eliminato nello stesso Save) |
| `photos.photo_id` | intero 1..2³¹−1 |
| `photos.fmt` + `len` | `1` = raw6 con `len` **34.200**, `2` = raw1 con `len` **3.024** |
| `photos.data` | base64url **senza padding**, esattamente `ceil(len·4/3)` caratteri (45.600 per raw6, 4.032 per raw1), alfabeto `A-Z a-z 0-9 - _`, decodificabile a `len` byte |
| `photos.crc` | 0..2³²−1 e **uguale** allo `zlib.crc32` dei byte decodificati |
| `photos.name` | stringa di **≤ 64** caratteri |
| `photos.thumb` | facoltativa: stringa di **≤ 6.000** caratteri che inizia con `data:image/` |
| campo sconosciuto | 400, sia in cima sia dentro una voce di `photos` |

Esito: il corpo viene tenuto da parte per `/save.json`, `seq + 1`, risposta `{"ok":true,"seq":N}`.
Un payload pieno (12 foto raw6) arriva a ~600 KB e viene validato in ~10 ms; il tetto del corpo
resta 8 MiB.

In modalità **pool** un `POST` della config page vera viene accettato lo stesso (comodo per i test) e
`/save.json` lo rende, ma `/state.json` resta il `full` dell'album di `--album`: al riavvio del PKJS
l'autorità torna al pool. Simmetricamente, un Save della **pagina di prova** azzera il payload
tenuto da parte e riporta `/save.json` allo stato del pool.

### Flusso del token di ritorno

```
pebble emu-app-config              →  browser:  /config.html?return_to=http://localhost:<porta>/close?
utente sceglie foto/impostazioni   →  POST /save                     →  {"ok":true,"seq":N}
pagina                             →  location.href = return_to + encodeURIComponent('{"v":1,"dev":true,"seq":N}')
pebble-tool                        →  Pebble.webviewclosed con quel testo
PKJS (dev)                         →  GET /save.json  →  album.applyPayload(payload, {full:true})  →  sync.resync()
```

Con la **config page vera** (`--page-dir` + relay) il giro è lo stesso, ma cambiano i due estremi:
l'URL porta anche `#<stato base64url>` dopo il `return_to`, il `POST /save` manda le foto per intero
(corpo con `deleted`, fino a ~600 KB) e il PKJS applica un **delta** (`{full:false}`) invece di uno
stato completo.

Lo **stato** che il PKJS mette nel frammento è `album.state()` più `{v, platform, fmt, cap_kb, dev}`,
serializzato in base64url senza padding (spec S6 §2); il `return_to` resta **prima** del `#`, com'è
scritto da `pebble emu-app-config`. Il token di ritorno è identico a quello di S5b.

Il token è **piccolo apposta** (nessun byte di foto): passa dalla riga di richiesta di `http.server`
del pebble-tool, che ha un limite di ~64 KB. Senza `return_to` (pagina aperta a mano nel browser) il
Salva scrive solo "salvato (seq N)" e il PKJS se ne accorgerà al prossimo `GET /state.json`.
"Annulla" torna a `return_to` **senza** query: `webviewclosed` arriva con testo vuoto e il PKJS lo
ignora. La pagina non usa `localStorage` (sul telefono girerebbe da un'origine opaca, dove lancia).

Senza `--settings` `state.json` non porta `settings` e la pagina parte dai **default del server**
(`pool.json.settings_defaults`), dicendolo in testa («impostazioni: default (non ancora salvate)»).
Il primo **Salva** manda tutti e 12 i campi: da lì `settings` compare in `state.json` (`settings_set`)
e il dev server diventa l'**autorità** delle impostazioni, come il telefono dopo il primo Save
(design §5.1) — quelle eventualmente scritte sull'orologio (p.es. con `GALLERIA_DEBUG_SETTINGS_SAVE`)
vengono sovrascritte al `HELLO` successivo. «Annulla» non le tocca. La pagina costruisce i campi una
volta sola (`dataset.built`, marcato **a costruzione finita**: un errore a metà non blocca il
re-render né lascia campi doppi) e ha un fallback per campo sui default. Elementi con `id` (per i
test): `head`, `err`, `msg`, `pool`, `order`, `settings` (i campi sono `s_<chiave>`: `s_layout`,
`s_font`, `s_clock_mode`, `s_leading_zero`, `s_text_color`, `s_outline`, `s_interval_min`,
`s_order`, `s_shake_next`, `s_info_row`, `s_digit_style`, `s_lang`), `scenario`, `save`, `cancel`.
Da S14 `s_layout` ha **tre** voci (`A — ora in alto`, `B — a tutto schermo`, `C — ora in basso`:
D136) e `s_interval_min` ne ha **nove** (`360 (6 h)` e `720 (12 h)` fra `180` e `1440`: D139); i
conteggi li pinna `OPTION_COUNT` in `apps/galleria/test/test_devpage.js`.

### Autotest (`--selftest`)

Genera tre PNG sintetici 400×456 (Pillow), li converte con `photo_prep.py`, avvia il server su una
porta effimera in un thread e con `http.client` esercita **ogni** endpoint e **ogni** regola di
validazione: struttura di `state.json`, `pool.json` e `save.json` nelle due modalità (pool e relay),
foto grezze e `?b64=1`, anteprime PNG, 404/411/408/501 con la **keep-alive** che non si sporca
(il corpo non letto non deve diventare la richiesta successiva), `POST` della pagina di prova e della
config page vera con **una regola violata per volta** (CRC, `len`, `data`, `thumb`, `name`, slot
ripetuto, `deleted`, `v`, campo sconosciuto in cima o dentro una voce) e `/save.json` invariato, gli
errori di riga di comando (`--page`, `--slots`, `--order`, `--port`, `--work`, `--dump-json`,
`--relay` con `--album`, `--page-dir` inesistente), `--dump-page`/`--dump-json` in un sottoprocesso,
la rilettura di `--page` e `--page-dir` a ogni richiesta (con il **500** in chiaro quando una
sorgente sparisce) e la rimozione della temporanea su **SIGTERM**. Se `node` è nel `PATH` esegue
anche la pagina incorporata sotto `vm` con un DOM finto, in tre varianti di `state.json`; senza
`node` salta 27 casi, dicendolo (la stessa verifica, più estesa, sta in
`apps/galleria/test/test_devpage.js`). Stampa `devserver selftest: N ok, M falliti` — oggi **266**
con `node`, in circa 2,6 s — ed esce 0/1. Lo esegue anche `make -C apps/galleria/test` (target
`devtest`), come `pyselftest` per `photo_prep.py` (§9).

---

## 12. `galleria_browser.py` – Firefox headless per la config page (S6)

Client **W3C WebDriver solo stdlib** (niente selenium, niente `pip`, niente `$HOME` sporcato) per
pilotare Firefox headless tramite `geckodriver`. Serve al gate S6
(`docs/design/galleria-s6-config-page.md` §9 e §11): aprire la config page — servita dal dev server
(§11) o indicata dall'emulatore — scegliere una foto, trascinare e zoomare la cornice, salvare, fare
screenshot.

Dipendenze esterne: solo `geckodriver` e `firefox` (snap). Se mancano, `--selftest` dice «saltato»
ed esce **0**.

Come funziona: avvia `geckodriver --host 127.0.0.1 --port <porta libera>` in una **sessione a parte**
(alla chiusura si abbatte tutto il gruppo: geckodriver, Firefox e i `contentproc`), attende
`/status`, apre una sessione con `moz:firefoxOptions.args = ['-headless', '-width', '500',
'-height', '900']` e parla HTTP+JSON con `urllib`. Ogni errore diventa un `BrowserError` con
messaggio in italiano (comando, endpoint, errore W3C, coda del log di geckodriver): mai un
traceback.

### Uso

```bash
tools/galleria_browser.py --url http://127.0.0.1:8765/config.html#AAA screenshot ~/pagina.png
tools/galleria_browser.py narrow http://127.0.0.1:8765/config.html#AAA 400   # la pagina a 400 px
tools/galleria_browser.py emu-url                     # URL scritto da `pebble emu-app-config`
tools/galleria_browser.py --script gate.json          # tanti passi, una sola sessione
echo '[["open-emu"],["title"],["screenshot","~/p.png"]]' | tools/galleria_browser.py --script -
tools/galleria_browser.py --selftest
```

| Comando | Effetto |
|---|---|
| `open URL` | naviga (anche `data:`) |
| `open-emu [SEC]` | legge l'URL scritto da `pebble emu-app-config` e lo apre |
| `emu-url [SEC]` | stampa quell'URL e basta |
| `narrow URL LARGH [ALT]` | carica la pagina in un **iframe** largo `LARGH` px (stessa origine, hash compreso) e ci entra: l'unico modo di provarla sotto i 500 px |
| `frame CSS` / `frame-top` | entra in un iframe / torna al documento principale |
| `title` · `current-url` · `viewport` | titolo, URL, dimensioni **reali** del viewport |
| `exec SCRIPT [ARG…]` | esegue un **corpo di funzione** (scrivere `return …`) |
| `find CSS` · `click CSS` · `text CSS` | esistenza, clic (che scorre fino all'elemento), testo visibile (ricade su `textContent`) |
| `set-file CSS PERCORSO` | imposta un `<input type=file>` |
| `set-value CSS VALORE` | scrive `value` — o `checked` per checkbox/radio — e lancia gli eventi `input` e `change`, come farebbe l'utente |
| `wait SELETTORE\|js:ESPR [SEC]` | attende un selettore CSS o un'espressione (`js:` + `return …`) |
| `drag CSS DX DY` · `wheel CSS DY` | Pointer/Wheel Events veri (`POST /actions`); una `wheel` può generare più eventi nella pagina |
| `screenshot FILE [CSS]` | PNG del **viewport**, o del solo elemento |
| `screenshot-full FILE` | PNG della pagina intera |
| `sleep SEC` · `close` | pausa; chiude la sessione |

| Opzione | Effetto |
|---|---|
| `--url URL` | apre questo URL prima del comando |
| `--script FILE` | lista di passi JSON (`-` = stdin) |
| `--selftest` | prova il tool ed esce |
| `--timeout SEC` | timeout dei comandi, **> 0** (default 30) |
| `--width PX` `--height PX` | finestra (default 500×900; il viewport è ~86 px più basso) |
| `--no-headless` | finestra visibile (serve un display) |
| `--geckodriver PERCORSO` `--firefox PERCORSO` | eseguibili alternativi |
| `--driver-log FILE` | tiene il log di geckodriver in questo file |
| `--keep` | con `--selftest`: non cancella la cartella temporanea |
| `-v` · `--version` | verboso; versione (oggi 1.1) |

### I tre limiti dello snap Firefox

Verificati il 29–30/08/2026 con Firefox 154.0.1 e geckodriver snap; il tool li gestisce tutti e tre.

1. **File per `<input type=file>`**: devono stare **sotto `$HOME` e fuori dalle cartelle nascoste**.
   Da `/tmp` l'errore è esplicito (`invalid argument: File not found`); da un dot-dir come
   `~/.cache/…` è peggio — l'input riceve nome e dimensione giusti ma la pagina non ne legge i byte
   (`FileReader` → `NotFoundError`, `createImageBitmap` → «The image could not be decoded»): un
   falso verde. `set-file` copia da sé i percorsi illeggibili in `~/galleria-browser-files/pid<N>/`
   (cartella cancellata alla chiusura) e **verifica con `FileReader`** che la pagina li legga
   davvero.
2. **Larghezza minima 500 px**: Firefox/GTK non fa finestre più strette, né all'avvio né con
   `Set Window Rect`; un `--width 400` verrebbe ignorato in silenzio. Il tool lo segnala su stderr,
   `viewport` mostra il valore reale (500×814 con `--height 900`) e `narrow URL 400` mette la pagina
   in una cornice da 400 px: è così che il gate la prova a 360–400 px, non con `--width`.
3. **`screenshot` inquadra il viewport**, non la pagina intera (una pagina alta 3.000 px dà un PNG
   500×814): per l'intera serve `screenshot-full`. Dentro un `narrow`, `screenshot-full` inquadra la
   cornice da 400 px e lo dice su stderr.

### Dettagli utili

- `drag` e `wheel` (`POST /actions`) **non** scorrono la pagina fino all'elemento, a differenza di
  `click`: se il bersaglio è sotto la piega si ottiene `move target out of bounds`. Prima di
  trascinare la cornice: `exec "document.querySelector('#crop').scrollIntoView(); return 1;"`.
- `exec`: l'avvolgimento automatico in `return (…)` **non** scatta se il testo contiene la parola
  `return`, un `;` o un a capo, e in quel caso il risultato è `null` senza errore. Scrivere sempre
  `return …` esplicito, anche in `wait js:…`.
- La chiave W3C degli elementi è `element-6066-11e4-a52e-4f735466cecf` (con `…cecc` le azioni
  pointer/wheel danno `invalid argument … untagged enum PointerActionItem`).
- Sull'origine `data:` `window.origin` è `null` e `localStorage` lancia `SecurityError`: conferma il
  divieto della spec S6 §1. Un `data:` URL da 155 KB con un hash da 100.000 caratteri viene navigato
  senza troncature.

### Uso da Python e URL dall'emulatore

```python
import sys; sys.path.insert(0, '<radice>/tools')
from galleria_browser import Browser, emu_config_url, BrowserError

with Browser(width=500, height=900) as br:      # close() anche in caso di eccezione
    br.open(emu_config_url(timeout=20, newer_than=t0))
```

`emu_config_url(timeout=20, pattern=None, newer_than=None)` legge l'URL dal file
`~/pebble-tool-emu-app-config-*.html` che `pebble emu-app-config` scrive
(`<meta http-equiv="refresh" content="0;URL=…">`, con `?return_to=http://localhost:<porta>/close?`
**prima** del frammento). Con `BROWSER=true` il pebble-tool non apre nessuna finestra: l'URL si
legge solo da lì. Il file viene **cancellato quando `emu-app-config` esce** (cioè quando la pagina
chiama `/close`): leggerlo subito dopo il lancio e passare `newer_than` = un istante *precedente* al
lancio, per non riprendere l'URL della sessione prima.

### Script JSON

`--script FILE.json`: lista di passi `[{"cmd": "open", "args": ["…"]}, …]` oppure
`[["open", "…"], ["title"]]` (va bene anche `{"steps": […]}`); `-` legge da stdin. Girano tutti
nella **stessa sessione** e il risultato di ognuno viene stampato (stringa nuda o JSON). Il primo
passo che fallisce stampa `passo N (cmd): messaggio` su stderr ed esce 1.

### Robustezza

Un **Ctrl-C** in qualunque momento dà uscita **130**, il messaggio «interrotto» e zero processi
orfani, mai un traceback (senza questa cura restavano vivi geckodriver e l'albero di Firefox: 13
processi, più un `/tmp/galleria_gecko_*.log`). Dopo un passo `close` i comandi successivi non
riaprono una sessione di nascosto, e gli argomenti non numerici (`--timeout 0`, `drag #x a b`)
falliscono con un messaggio **prima** ancora di avviare Firefox. Se qualcosa sopravvivesse:
`ps -eo pid,cmd | awk '$2 ~ /^\/snap\/firefox\//'` e uccidere **per PID** — mai `pkill -f`, che
ammazza anche la shell da cui si lancia.

### Autotest (`--selftest`)

Target `make -C apps/galleria/test browsertest` (fuori da `all`). Avvia `galleria_devserver.py` in
**relay** su porta effimera con una pagina minima in una cartella temporanea (`--page-dir` se il dev
server lo conosce, altrimenti `--page`, con ripiego automatico se l'inlining fallisce), apre
`/config.html#PROVA` e verifica: titolo e `location.hash`, `set-file` con una foto di
`~/.cache/galleria-gate/photos/` (quindi passando dalla copia, con la lettura verificata), `drag` e
`wheel` sul canvas, `narrow` a 400 px, screenshot di viewport / elemento / pagina intera (firma PNG
e dimensioni controllate), i messaggi d'errore (selettore assente, file assente, `wait` scaduto),
`emu_config_url` e il Ctrl-C con uscita 130. Ferma dev server e browser **per PID**. Stampa
`browser selftest: N ok, M falliti` — oggi **60** controlli in ~7 s (M7: `into-view`, `click` che centra l'elemento e ritenta dopo un «intercepted», `open` dello stesso URL che passa da `about:blank`) — ed esce 0 (anche quando
`firefox`/`geckodriver` mancano), 1 se qualcosa fallisce, 130 se interrotto.

---

## 13. `build_config_page.py` – config page inlinata di Galleria (S6)

Inlina le sorgenti di `apps/galleria/src/pkjs/config/` in un **unico HTML autosufficiente** — niente
risorse esterne: sul telefono la pagina viaggia dentro un `data:` URL, in emulatore la serve il dev
server (§11, `--page-dir`) — e genera il modulo `apps/galleria/src/pkjs/config_page.js`, che il PKJS
carica con `require('./config_page')`.

Solo stdlib (Python 3.8+). Specifica: `docs/design/galleria-s6-config-page.md` §1 (contratto di
inlining) e §7.

**Passo i18n (S10, D35).** Prima dei controlli finali il tool sostituisce, in tutto l'HTML già
inlinato, il **nome** di ogni chiave di traduzione con il suo **indice** in
`apps/galleria/i18n/messages.json`: `T('chiave'` → `T(12`, `data-i18n="chiave"` e
`data-i18n-title="chiave"` → `data-i18n="12"`. Così l'artefatto non porta né i testi né i nomi delle
chiavi (i dizionari viaggiano nell'hash dell'URL, §18). Il file dei messaggi si cerca accanto alle
sorgenti (`--dir/../../../i18n/messages.json`) e si può forzare con `--messages` (o, dall'API, con
l'argomento `messages=`); se nella pagina non c'è nessuna chiave non viene nemmeno aperto. Una
chiave che **non esiste** è un errore con il numero di riga: rigenerare prima i dizionari
(`build_i18n.py`), che è quello che fa `make -C apps/galleria/test pagecheck` eseguendo
`build_i18n.py --check` **prima** di questo.
⚠️ La sostituzione guarda tutto l'HTML, **commenti a fine riga compresi** (lo strip toglie solo le
righe di commento intere): non scrivere `T('nome')` in un commento in coda a una riga di codice.

**Controllo incrociato dei dizionari (S10, esteso in S11/D39).** L'artefatto contiene solo indici, i
testi arrivano dagli array di `src/pkjs/i18n.js`: se i due nascessero da `messages.json` diversi la
pagina mostrerebbe i testi sbagliati **senza nessun errore**. Perciò, quando la pagina usa chiavi, il
tool pretende che (1) l'elenco `keys` di `src/pkjs/i18n.js` coincida con `messages.json` e (2) le
**lingue** siano le stesse, e nello stesso ordine, in tre punti: gli array di `src/pkjs/i18n.js`, la
lista `LANGS` di `src/pkjs/config/page_core.js` (l'indice è il valore dell'impostazione `lang`: 1 = la
prima) e `LANG_ORDER` di `src/pkjs/index.js` (ordine dei dizionari nello stato dell'hash; è l'unica
lista del file, la mappa di `langOf()` ne è derivata a run time). In più `LANG_NAMES` di `page_core.js`
deve avere **tante voci quante le lingue** — un endonimo per lingua, altrimenti il select mostra il
codice. Le tre liste stanno in tre file diversi — una generata (`i18n.js`) e due scritte a mano —:
aggiungere una lingua in due su tre è l'errore tipico, e qui diventa un messaggio che nomina il file
rimasto indietro (e, quando quello indietro può essere `i18n.js`, anche il rimedio:
`python3 tools/build_i18n.py`). Un file assente (copie di prova, selftest) è un **avviso** con salto
del confronto, non un errore.
⚠️ `page_core.js` e `index.js` si leggono **accanto a `messages.json`** (`<app>/src/pkjs/`), non nella
cartella passata a `--dir`: su una copia di prova si controlla comunque il PKJS del repo, che è quello
da cui nascono gli indici.

```bash
python3 tools/build_config_page.py                            # rigenera src/pkjs/config_page.js
python3 tools/build_config_page.py --check                    # 0 se è aggiornato, 1 altrimenti
python3 tools/build_config_page.py --html-out /tmp/page.html  # anche l'HTML, per il browser
python3 tools/build_config_page.py --no-strip --html-out /tmp/page_leggibile.html
python3 tools/build_config_page.py --selftest
```

| Opzione | Effetto |
|---|---|
| `--dir DIR` | cartella delle sorgenti, con `page.html` (default `apps/galleria/src/pkjs/config`, **relativo alla posizione del tool**) |
| `--out FILE` | modulo JS da scrivere (default `apps/galleria/src/pkjs/config_page.js`) |
| `--html-out FILE` | scrive **anche** l'HTML inlinato: per aprirlo nel browser o darlo a `--page` del dev server |
| `--messages FILE` | `messages.json` del passo i18n (default: quello accanto alle sorgenti) |
| `--check` | non scrive nulla: uscita 0 se `--out` coincide con la rigenerazione, 1 se manca o differisce (dicendo l'offset della prima differenza) |
| `--no-strip` | non toglie commenti, righe vuote e indentazione dagli asset: pagina leggibile nel debugger |
| `--selftest` | autotest su una cartella temporanea, poi esce |

### Contratto di inlining

| In `page.html` | Diventa |
|---|---|
| `<link rel="stylesheet" href="X">` | `<style>` con il contenuto di `X` |
| `<script src="X"></script>` | `<script>` con il contenuto di `X` |
| `<script>`/`<style>` già inline, commenti HTML, `<link>` non-stylesheet | intatti (e il loro corpo non viene nemmeno scansionato) |

`X` è **solo un nome di file nella stessa cartella**: un URL (`http://…`, `//…`, qualunque
`schema:`), una sottocartella, una query o un fragment sono errori. Oggi `page.html` inlina
`page.css` e, in quest'ordine, `pipeline.js`, `page_core.js`, `preview.js` (S12: motore
dell'anteprima della watchface) e `page.js`. Fino a UX-1 c'era anche `previews.js` (le PNG dei
font, con `data-optional="1"`): **UX-2/D95 l'ha tolto** dalla pagina e da `SCRIPT_ORDER` (§14).
Il meccanismo `data-optional="1"` resta, e oggi non lo usa nessun tag.

**Errori** (uscita 1, messaggio in italiano, mai un traceback): cartella o `page.html` mancanti; file
inlinato mancante — a meno di `data-optional="1"`, e allora il tag sparisce insieme alla sua riga;
contenuto che chiuderebbe il **suo** tag (`</script` in un `.js`, `</style` in un `.css`,
riconosciuti anche scritti `</ SCRIPT >`); in un `.js`, un `<!--` seguito da un `<script` (il parser
HTML entra in «script data double escaped» e il `</script>` di chiusura non chiude più il tag); un
tag di apertura con una virgoletta non chiusa; una sorgente che non è UTF-8; HTML inlinato oltre
**98.304 B** (96 KB; era 65.536 fino a S11: l'ha alzato S12/D43 per l'anteprima della watchface).
L'incrocio invece è **innocuo e ammesso**: un `</style>` dentro un `.js` e un
`</script>` dentro un `.css` in HTML non chiudono niente.

**Avvisi** non fatali (su stderr, la generazione prosegue): attributi persi; ordine degli script
diverso da `pipeline → page_core → preview → page` (`preview.js` è il motore dell'anteprima della
watchface, S12: usa `GalPipeline` ed è usato da `page.js`; `previews.js` è uscito dalla lista con
UX-2/D95); uno script **fuori** da questa lista non ha vincoli d'ordine; HTML oltre l'obiettivo di 84 KB;
riferimenti a risorse esterne rimasti nella pagina; `@import` nel CSS; uso di `localStorage`/`sessionStorage`/
`document.cookie` (nella pagina `data:` l'origine è opaca e l'accesso lancia `SecurityError`).

⚠️ **Gli attributi del tag sostituito vengono scartati.** `defer`, `async`, `type="module"`,
`media="print"`, `data-*` non sopravvivono all'inlining: lo script inlinato è classico, bloccante ed
eseguito subito, e il CSS si applica sempre e senza condizioni. In `page.html` i tag vanno tenuti
nudi — sopravvivono solo `src`/`href`/`rel`/`data-optional` e un `type` innocuo
(`text/javascript`, `text/css`); su tutto il resto il tool avvisa.

### Strip degli asset

Per default il tool toglie dagli asset le **righe di commento intere** (`//…`, `/*…*/` e i blocchi
che continuano sotto), le **righe vuote** e l'**indentazione**; dall'HTML toglie solo le righe vuote
(commenti e indentazione restano). Non è un minificatore, ed è sicuro per costruzione: in ES5 una
stringa non attraversa una riga, quindi una riga che *inizia* con `//` o `/*` è un commento, mentre
un commento aperto a metà riga non viene toccato.

Lo **strip è obbligatorio**: misurato sulle sorgenti del 30/08/2026 (fine S6) dava **HTML 58.659 B**
e modulo `config_page.js` 60.515 B, contro **65.385 / 67.349 B** con `--no-strip` — quasi 7 KB di
differenza, che già allora facevano la differenza fra stare e non stare nel tetto.

**Misura corrente** (`python3 tools/build_config_page.py --check`, 19/09/2026, fine S14): **HTML
inlinato 85.058 B**, **modulo `config_page.js` 87.832 B**, cioè **958 B** sotto l'avviso soft
(86.016 B = 84 KB) e **13.246 B** sotto il tetto duro (98.304 B = 96 KB). **Il numero vero si legge sempre da
`--check`**: è quello — non una stima — da riportare qui e nei documenti dopo ogni modifica alla
pagina.

I due tetti sono `MAX_BYTES` e `SOFT_BYTES` in `build_config_page.py`: valevano 64/60 KB fino a S11 e
li ha alzati **S12/D43**, perché l'anteprima della watchface (`src/pkjs/config/preview.js`, 12.216 B
inlinati) non ci stava nei 64 KB. ⚠️ La prima stesura di D43 diceva 80/72, ma a 80/72 restavano
892 B e l'avviso soft si accendeva a **ogni** generazione — cioè una tripwire spenta —, quindi la
revisione S12 li ha portati a **96/84**: il vincolo che lega davvero non è il tetto ma la
**lunghezza dell'URL `data:`** sul telefono (`docs/design/galleria-s6-config-page.md` §2). I messaggi
d'errore e d'avviso ricavano le cifre in KB dalle due costanti (una sola verità), mentre il selftest
le scrive a mano di proposito: chi cambia un tetto senza aggiornare README e specifica se lo trova
detto.

La **storia delle misure** — 63.424 B (05/09, S8-stile), 64.222 (S9-prep), 64.699 (S10), 64.745
(S11), 81.028 (S12, `+16.283 B` per l'anteprima), 83.865 (UX-2), 85.446 (UX-3), 85.476 (UX-4),
85.058 (S14, `−418 B`: via le frecce del font, D137, contro «Ora in basso» e i due intervalli
nuovi, D136/D139) — sta in `docs/design/galleria-s6-config-page.md` (riga «Budget» di §1 e i
blocchi «Revisione S12 / UX-2 / UX-3 / UX-4»), con il motivo di ogni salto.

### Il modulo generato, e la riproducibilità

```js
/* GENERATO da tools/build_config_page.py (S6): non modificare a mano. Sorgenti: src/pkjs/config/. Dimensione HTML: 54540 B. */
module.exports = "…";   // json.dumps(html, ensure_ascii=True): solo ASCII, tutto su una riga
```

Nessuna data, nessun percorso assoluto: BOM e CRLF delle sorgenti vengono normalizzati e la fine
riga è sempre `\n`, quindi due esecuzioni danno gli **stessi byte**. È ciò che rende sensato
`--check`.

⚠️ **`make -C apps/galleria/test pagecheck` prima di ogni `pebble build`: non è facoltativo.** Se
l'inlining fallisce (per esempio perché la pagina supera i 96 KB) il tool esce 1 ma **non tocca** il
`config_page.js` già sul disco, e lo dice a voce alta: un `pebble build` lanciato da solo
imbarcherebbe in silenzio la config page **precedente**. Il target `pagecheck` (dentro `make all`)
esegue `build_i18n.py --check` (§18, **per primo**: gli indici della pagina vengono da lì),
`build_config_page.py --check` e `test/gen_page_fixture.py --check`; da **S12** anche
`gen_digits.py --check` con le opzioni canoniche e `--masks-js` (§10) e
`test/gen_preview_fixture.py --check`. Da **UX-2** (D95) `gen_font_previews.py --check` **non**
è più in `pagecheck`: quel tool non è più nella build (§14).

### Autotest (`--selftest`)

Su una cartella temporanea: CSS e JS inlinati davvero, `<link>` non-stylesheet e `<script>` già
inline lasciati com'erano, commenti HTML intatti, ordine dei quattro script di `SCRIPT_ORDER`, `data-optional` (tag e riga
rimossi, oppure file inlinato), `</script>` nel contenuto e cartella inesistente = errori,
avvisi di lint e di attributi persi, il tetto di 96 KB e l'avviso a 84, strip (righe di commento
via, stringhe e commenti a metà riga intatti, idempotenza, `--no-strip` che non tocca niente),
riproducibilità (due esecuzioni identiche, CRLF+BOM = LF), il modulo (solo ASCII, round trip JSON,
nessuna data) e la CLI: `--check` nei tre casi, e soprattutto che dopo un fallimento il file
precedente **resti intatto** con l'avviso. Stampa `build_config_page selftest: N ok, M falliti` —
oggi **106** controlli in meno di 0,1 s (UX-2/D95: `preview.js` prima di `page.js` senza avviso,
`preview.js` inlinato fra `page_core.js` e `page.js`, ordine invertito ⇒ avviso, `previews.js` fuori da
`SCRIPT_ORDER`; l'esempio di script facoltativo è un nome neutro, `extra.js`; S10: passo i18n, chiave inesistente, `data-i18n` con indice;
S11: lingue allineate a 4 e a 6, ogni file rimasto indietro, ordine diverso, `LANG_NAMES` più corto
della lista, `i18n.js` senza nessun array di lingua, `page_core.js`/`index.js` assenti = avviso,
letterale `LANG_ORDER` sparito) — ed esce 0/1.

---

## 14. `gen_font_previews.py` – anteprime dei font per la config page (S6, **fuori dalla build da UX-2**)

> ⚠️ **Dal 13/09/2026 (UX-2, voce U-10, decisione D95) questo tool non è più nella build.** La
> config page non mostra più la PNG «12:34» sotto la select dei font: il nome del font si prova con
> l'**anteprima vera della watchface** (`preview.js`, §13). `apps/galleria/src/pkjs/config/previews.js`
> è stato cancellato, il suo `<script data-optional="1">` tolto da `page.html`, il nome tolto da
> `SCRIPT_ORDER` e `--check` tolto da `make -C apps/galleria/test pagecheck`. Il tool **resta qui**
> nel caso le anteprime tornassero utili.

Rasterizza `12:34` con i **cinque** TTF di `apps/galleria/resources/fonts/` (Anton, Bebas Neue,
Barlow Condensed Bold e, da S8-stile, Francois One e Staatliches) e scrive un modulo ES5 con un PNG
**1 bit** per font, ritagliato sull'inchiostro e inlinato come data-URL: nel browser
`window.GalPreviews`, in node `module.exports`. Chiavi = i cinque font sprite di `gen_digits.py`
(§10); gli indici del campo `font` delle impostazioni sono invece 0/1/2/**4**/**5**, perché il font 3
(LECO, di sistema) non ha né strip né anteprima. Dipendenza: **Pillow** (niente freetype-py).
Opzioni: `--fonts-dir`, `--out`, `--text` (default `12:34`), `--height` (altezza dell'inchiostro,
default 28), `--max-bytes` (default 4096), `--png-dir`, `--check`, `--selftest`, `-v`.

Poiché il file di uscita non esiste più, si lavora **fuori dal repo**:

```bash
python3 tools/gen_font_previews.py --out /tmp/prev.js               # 2.500 B con cinque font (tetto 4.096)
python3 tools/gen_font_previews.py --selftest --out /tmp/prev.js    # 41 ok, 0 falliti
python3 tools/gen_font_previews.py --png-dir /tmp/prev --out /tmp/prev.js   # salva anche i cinque PNG
```

Senza `--out`, `--check` e `--selftest` non falliscono: stampano «previews.js non e' piu' nella
build (UX-2/D95): niente da controllare» ed escono **0** (il selftest si ferma a 40 controlli, il
41° è quello sul file su disco). Il tool è deterministico (nessuna data, nessun percorso, Pillow non
scrive il chunk `tIME`), ed è ciò che rendeva affidabile `--check` dentro `pagecheck`. Rimettere le
anteprime in pagina vuol dire rigenerare `previews.js` **e** rimettere `PREV_KEYS`/`GalPreviews` in
`page.js`, `<img id="fontPreview">` in `page.html`, `.fontprev` in `page.css` (a dimensione
naturale, `box-sizing: content-box`), il tag in `page.html`, il nome in `SCRIPT_ORDER` e `--check`
in `pagecheck`.

---

## 15. `setup-adb.sh` – adb in user space

Installa gli **Android platform-tools** (cioè `adb`) senza `sudo` e senza toccare il sistema: servono
alla sessione S8 per il trasporto `pebble … --adb`, che parla con l'app Pebble su Android tramite
`adb shell am broadcast` + `adb forward` invece che con l'IP del telefono
(`docs/design/galleria-s8-hardware.md` §2.1).

```bash
~/ProgettiClaude/Pebble/tools/setup-adb.sh          # idempotente: se adb c'è già non riscarica nulla
~/ProgettiClaude/Pebble/tools/setup-adb.sh --force  # (o FORCE=1) riscarica e riestrae comunque
ADB_ZIP_URL=… ADB_DEST=… ~/ProgettiClaude/Pebble/tools/setup-adb.sh   # sorgente/destinazione diverse
```

Cosa fa, nell'ordine: scarica `platform-tools-latest-linux.zip` da `dl.google.com` (con `curl`, in
mancanza `wget`), verifica che sia uno zip e che contenga `platform-tools/adb`, lo estrae in
**`~/.local/android-platform-tools/platform-tools`**, crea il symlink
**`~/.local/bin/adb`** (cartella già nel `PATH` grazie a `tools/pebble-env.sh`, §8) e stampa
`adb version`. Se `~/.local/bin` non è nel `PATH` della shell corrente lo dice e ricorda di caricare
`pebble-env.sh`. Nessuna dipendenza Python; servono solo `curl`/`wget` e `unzip`.

### Wireless debugging in 4 comandi

Questa VM **non ha bus USB** e il telefono non è raggiungibile in ingresso: l'unica via è il
*Wireless debugging* di Android 11+ (Opzioni sviluppatore → Debug wireless), che si usa così — il
telefono deve essere sulla stessa Wi‑Fi dell'host:

```bash
adb pair <IP del telefono>:37115 123456     # 1. una volta sola: porta e codice a 6 cifre da "Accoppia dispositivo"
adb connect <IP del telefono>:41283         # 2. PORTA DIVERSA: quella mostrata sotto "Debug wireless"
adb devices                            # 3. deve comparire "<IP del telefono>:41283   device"
pebble install build_s8/galleria_p.pbw --adb --logs   # 4. (o `pebble ping --adb`; il .pbw PRIMA di --adb: un percorso subito dopo il flag verrebbe letto come seriale)
```

Insidie, tutte verificate in S8 §2.1:

- le **due porte sono diverse**: quella di `adb pair` è della finestra di accoppiamento, quella di
  `adb connect` è del servizio — e **cambia a ogni riattivazione** del debug wireless, quindi il
  passo 2 va rifatto ogni volta (il passo 1 no).
- **niente mDNS attraverso il NAT** della VM: `adb pair`/`adb connect` con il nome
  `adb-…_adb-tls-connect._tcp` non funziona, va scritto l'IP.
- il receiver che `--adb` usa (`coredevices.coreapp.DEV_CONNECTION`, permesso `DUMP`) esiste
  **dall'app Android 1.10.0**: con versioni precedenti resta solo `--phone <IP>` (che richiede però
  i due interruttori nell'app: *Dev Connection* e *Use LAN developer connection*).
- `--adb` **forza la LAN da solo**, senza toccare la UI dell'app, e in più dà `adb logcat`: è la via
  da preferire quando l'app è aggiornata. `--phone` **senza IP** significa invece CloudPebble, non
  «il telefono».
- a fine sessione conviene spegnere il debug wireless sul telefono (`adb disconnect` non basta).

> Nota: `export ADB_SERVER_SOCKET=tcp:<IP host>:5037` serve solo nel caso diverso in cui il server
> `adb` (e quindi il telefono, magari via cavo) stia su **un altro PC**; in questa VM non serve.

---

## 16. `galleria_logstats.py` – riepilogo dei log dell'orologio

Trasforma uno o più log catturati sull'orologio (`pebble install --logs`/`pebble logs` redirezionati
in `run_s8_*.log`) in un riepilogo leggibile, senza contare le righe a mano. **Solo stdlib**
(Python ≥ 3.10). Contratto: `docs/design/galleria-s8-hardware.md` §2.4; formati delle righe: §2.3.

```bash
python3 tools/galleria_logstats.py run_s8_2.log                    # riepilogo a schermo
python3 tools/galleria_logstats.py run_s8_*.log --md                # tabelle markdown da incollare
python3 tools/galleria_logstats.py run_s8_3.log --json -            # solo JSON su stdout
python3 tools/galleria_logstats.py run_s8_7.log --threshold-ms 10 --since 10:20:00 --until 10:40:00
python3 tools/galleria_logstats.py --selftest                       # campioni incorporati
```

| Opzione | Effetto |
|---|---|
| `file …` | uno o più log; più file vengono letti **in fila** e ciascun record ricorda da quale viene |
| `--md` | tabelle markdown, per `docs/design/galleria-s8-risultati.md` |
| `--json PATH` | riepilogo strutturato con chiavi stabili (`versione`, una chiave per sezione); `-` = stdout **al posto** del testo |
| `--since HH:MM:SS`, `--until HH:MM:SS` | finestra oraria; orari impossibili o `since` > `until` = errore |
| `--threshold-ms N` | soglia dei render lenti nella sezione 7 (default 10, cioè il criterio O4) |
| `--selftest` | campioni incorporati + asserzioni, poi esce |

Uscite: **0** anche con righe di formato sconosciuto (i log S5a–S6 sono più vecchi) e con un file
vuoto («nessun evento riconosciuto»); **2** per argomenti errati o file inesistente; **1** solo se
`--selftest` fallisce.

### Le 13 sezioni

1. **Avvii** — `heap main` con orario; un avvio non preceduto da `heap deinit` nello stesso file è un
   **riavvio spontaneo**, in evidenza; `App fault!` con le due righe PC/LR ripulite dagli ANSI.
2. **Orologio** — `watch: fw a.b.c model=n` e la riga `ui_time:` (content size, BT, locale, schermo,
   area non ostruita, layout, font, mode, fascia).
3. **Heap per fase** — `main`, `init`, `window_load`, `after first render`, `services`, `unsub`,
   `qv`, `shake`, `sync_end`, `tick`, `deinit`: primo, ultimo, minimo libero, delta e — per
   `heap tick` — campioni e pendenza in B/ora.
4. **Init** — `storage: quota=`, `settings:`, `sync: open(…)`.
5. **Sync** — una riga per `sync: end` (slot, code, n, commit, photo, `ch max`/`avg`, heap), la
   `sync: gap` accostata, la stima `photo − avg×n` (BLE + telefono), il conteggio dei `sync: msg=`
   per tipo con i `code≠0` in evidenza, la durata di ogni sync e i WARNING (`idle`, `outbox`,
   `inbox dropped`, `dict_write`).
6. **Foto da persist** — righe `photo: slot … persist crc …`: min/media/max/p95 dei ms, `MISMATCH` ed
   errori `read` contati (soglia di decisione O3: lettura > 200 ms).
7. **Rendering (build M)** — `draw:` raggruppato per (`mode`, `full`) con min/media/max/p95, il campo
   `info`, quanti superano `--threshold-ms`, e `tick:`.
8. **Rotazione** — righe `rot(…)` per motivo (init/tick/shake/focus/sync), con ultimo slot e `bad`.
9. **Colore** — tabella `luma(…)` (mean, bad w/b, `fg`, alone) e conteggio delle decisioni per `fg`.
10. **BT e batteria** — transizioni `bt: connected=` e righe `batt:` con la pendenza in %/h (è il
    numero di O7).
11. **PKJS** — conteggio per tag (`[album]`, `[sync]`, `[config]`, `[dev]`), eventi chiave con orario
    e statistica degli ack dei chunk, con la nota che l'app Android ne perde a raffica.
12. **Anomalie** — tutte le righe WARNING/ERROR deduplicate, con conteggio, prima occorrenza e file C
    che le ha emesse.
13. **Avvio/uscita (build M)** — le due righe di temporizzazione di `main.c` (vedi sotto): una riga
    per avvio con i campi di `init:` e di `deinit:`, poi min/media/max/p95 di ogni campo su tutti gli
    avvii dei file letti, e la riga di migrazione dello schema del manifest se c'è. Con una build di
    produzione la sezione resta vuota («nessuna riga `init:`/`deinit:`»): non è un errore.

#### Le righe della sezione 13

```
main.c:141> init: open=12 man=0 sto=13 set=1 mod=7 win=7 syn=2 tot=33 ms
main.c:177> deinit: mod=1 fl=0 win=0 tot=2 ms
storage.c:160> storage: manifest schema 1 -> 2 migrated (settings 1 shake 1)
```

Le prime due le emette solo la build M (`GALLERIA_DEFINES="GALLERIA_DEBUG_TIMING=1"`), una per
avvio, in fondo a `prv_init`/`prv_deinit`; sono millisecondi.

| Campo | Che cosa misura |
|---|---|
| `init: open` | la **prima** chiamata a persist: il firmware apre il file (due scansioni) e legge la chiave 0 |
| `init: man` | la ricerca del manifest |
| `init: sto` | `storage_init` per intero — **comprende `open` e `man`** |
| `init: set` | `settings_init` |
| `init: mod` | `model_init`, compresa la lettura della foto (già misurata dalla riga `photo: slot k persist crc ok … ms` della sezione 6) |
| `init: win` | `window_create` + `window_stack_push`, cioè il `window_load` (layout, strip delle cifre) |
| `init: syn` | `sync_init` (l'`app_message_open`: il suo esito sta nella riga `sync: open(…)` della sezione 4) |
| `init: tot` | tutta `prv_init` |
| `deinit: mod` | `model_deinit` |
| `deinit: fl` | `storage_flush` (scrittura delle impostazioni rimaste in sospeso) |
| `deinit: win` | `window_destroy` + `ui_photo_deinit` |
| `deinit: tot` | tutta `prv_deinit` |

Il tool aggiunge una colonna **`resto`**, che non è nel log: `tot − (sto+set+mod+win+syn)` per
`init:` e `tot − (mod+fl+win)` per `deinit:`, cioè quanto avanza dentro `tot` (`open` e `man` non
si sommano: stanno **dentro** `sto`). Se venisse negativo il riepilogo lo dice a chiare lettere
(«resto negativo su N riga/e»).

La riga `storage: manifest schema a -> b migrated (…)` è invece di **produzione** e compare una
volta sola, al primo avvio dopo l'aggiornamento che cambia lo schema: è informativa e non finisce
fra le anomalie della sezione 12. Da lì in poi la riga `storage: quota=… schema=N …` della sezione
4 riporta il numero nuovo (`schema=2`).

### Convenzioni di lettura

- Il riepilogo **ragiona per avvii**: un segmento nuovo comincia a ogni `heap main` e a ogni file
  nuovo. Anche la sezione 13 è divisa così: il `deinit:` di un avvio precede il `heap main` di
  quello dopo, quindi cade nella stessa riga del suo `init:`; se il log comincia (o finisce) a
  metà, una riga della tabella può avere solo l'uno o solo l'altro. Pendenze di heap e batteria, durate delle sync e stato BT non attraversano mai un riavvio,
  perché a cavallo di un riavvio la differenza non vorrebbe dire niente. Se una fase copre più avvii
  la tabella lo dice (colonna `avvii`) e mette `n/d` al posto dei delta.
- Gli orari hanno risoluzione **1 s**, quindi ogni durata ricavata dal log è dichiarata **±1 s**; il
  tempo è reso monotono attraverso la mezzanotte e fra file consecutivi.
- La stima `photo − avg×n` esce **`n/d`** quando sarebbe negativa: vuol dire che il campo `photo` di
  quella riga non è attendibile, non che la sync sia andata male.
- `[PHONESIM] [WARNING]` (pypkjs, solo in emulatore) è contato a parte e non è mai un'anomalia; le
  righe informative `digits: font=…` e `photo: bitmap …`/`resource … loaded=` nemmeno.
- Le tabelle lunghe (luma, foto, eventi PKJS, batteria) sono tagliate a 40 righe nel testo e nel
  markdown, con la nota «(+ altre N righe: vedi --json)»: il JSON è sempre completo.

### Esempio (reale, `test/fixtures/logs/run_s7_emery_b_synced.log`)

```
Galleria — riepilogo dei log
  file: run_s7_emery_b_synced.log (73 righe)
  righe: 73 totali, 23 orologio, 48 pkjs (0 PHONESIM), 0 fault, 2 ignorate
  filtri: --threshold-ms 10
…
=== 5. Sync ===
  ora       slot  code  n  commit  photo  ch max  ch avg  photo-avg*n  heap free  gap
  --------  ----  ----  -  ------  -----  ------  ------  -----------  ---------  ---
  10:46:51  0     0 OK  9  2       669    49      18      507          39712      -
  10:46:51  1     0 OK  9  5       0      103     54      n/d          39712      -
  foto concluse: 2 ok, 0 fallite
  ch avg: n=2 min 18 media 36.0 max 54 p95 54 ; ch max: n=2 min 49 media 76.0 max 103 p95 103
  inizio    fine      durata s (+/-1)  foto (END)  file                       nota
  --------  --------  ---------------  ----------  -------------------------  ----
  10:46:50  10:46:52  2                2           run_s7_emery_b_synced.log
  nessun WARNING di sync (idle/outbox/inbox/dict_write)
```

### Test

`make -C apps/galleria/test logstats` (dentro `make all`) esegue `galleria_logstats.py --selftest`
— **123** controlli sui campioni incorporati (orologio, pypkjs con prefisso
`./src/pkjs/index.js:97:0`, app Android con prefisso `Galleria:97`, PKJS senza prefisso, righe
estranee, ANSI, un riavvio spontaneo, un `App fault!`, le righe `init:`/`deinit:` e la migrazione
del manifest) — e poi `apps/galleria/test/test_logstats.py`, **295** controlli che lanciano il tool
sulle **14** fixture di `apps/galleria/test/fixtures/logs/` e confrontano i numeri con quelli contati
a mano. Le due fixture della build M del 04/09/2026 sono `run_s8_emu_m_init_emery.log` (riga `init:`
e migrazione dello schema 1 → 2) e `run_s8_emu_m_deinit_restart.log` (il `deinit:` di un avvio e
l'`init:` di quello dopo); sulle altre la sezione 13 deve restare vuota e tutti gli altri numeri
identici a prima (le 11 elencate in `SENZA_BUILD_M`, fra cui **`run_tool540_emery.log`** — avvio in
emulatore con l'album già in persist e il dev server spento, cioè il PKJS che riparte dall'album
locale — più `run_s8_phone_fresh.log`, l'estratto dall'orologio reale). In tutto ~3 s.

---

## 17. `gen_test_cards.py` – test card per soglie luma e LUT

Genera le immagini di prova del gate S8: invece di giudicare a occhio se il colore automatico del
testo ha ragione su una foto qualunque, si mandano all'orologio **card dai numeri noti**, costruite
con i soli colori esatti della palette (canali 0/85/170/255) e a **strisce verticali di larghezza
pari** — così il campionamento della luma (1 px su 2) dà percentuali esatte e le stesse valgono per
tutte le fasce. Dipendenze: **Pillow** + stdlib. Regola di riferimento: `apps/galleria/src/c/luma.h`
e `luma.c`; contratto: `docs/design/galleria-s8-hardware.md` §2.5.

```bash
python3 tools/gen_test_cards.py                    # 18 PNG in ~/galleria-gate/cards/ (fuori dal repo)
python3 tools/gen_test_cards.py --check            # le genera e le verifica con photo_prep.py
python3 tools/gen_test_cards.py --out /tmp/cards --emery   # solo le card emery, altrove
python3 tools/gen_test_cards.py --selftest         # autotest del tool (435 controlli, ~1 s)
```

| Opzione | Effetto |
|---|---|
| `--out DIR` | cartella delle card (default `~/galleria-gate/cards`, creata se manca) |
| `--emery` / `--flint` | solo le card di una piattaforma (default: tutte e 18) |
| `--check` | dopo la scrittura verifica ogni card e stampa la tabella; **uscita 1** se una previsione discorda |
| `--verbose` | con `--check`, stampa anche l'output di `photo_prep.py` |
| `--selftest` | autotest su cartella temporanea, poi esce |

Le 18 card (tutte PNG 200×228; quelle flint sono a tutta larghezza, perché la config page per un
Pebble 2 Duo **non** ritaglia un 144×168 1:1 ma riscala il sotto-rettangolo di rapporto 144:168):

| Card | Contenuto | Testo atteso | Alone |
|---|---|---|---|
| `c1_black` | tinta unita idx 0 (Y 0) | BIANCO | no |
| `c2_white` | tinta unita idx 63 (Y 255) | NERO | no |
| `c3_gray104` | tinta unita idx 42 `#AAAAAA` (Y 104) | NERO | no |
| `c4_y77` | idx 53 `#FF5555` (Y 77 = soglia, confronto stretto) | NERO | no |
| `c5_y25` | idx 32 `#AA0000` (Y 25 = soglia, confronto stretto) | BIANCO | no |
| `c6_tie_halo` | metà idx 21 / metà idx 42: pareggio 50/50, media 63 | NERO | SI |
| `c7a_halo12`, `c7b_halo15`, `c7c_halo18` | 12/15/18 % di colonne bianche su fondo nero | BIANCO | no, **SI**, SI |
| `c8a_hyst_hold`, `c8b_hyst_flip` | prova dell'**isteresi**: si caricano in layout B, poi si passa ad A | vedi sotto | SI (fascia A) |
| `palette64` | i 64 colori in tasselli 24×28 (idx = riga·8 + colonna, origine 4,2) — per O6 | BIANCO | SI |
| `gray4` | 4 bande da 50 px (idx 0/21/42/63) per la LUT sui neutri — per O6 | NERO | SI |
| `f1_black`, `f2_white` | flint, tutto nero / tutto bianco | BIANCO, NERO | SI (sempre su flint) |
| `f3_5050` | flint, 3 strisce bianche (72 colonne su 144): pareggio, media 127 | NERO | SI |
| `f4_40w`, `f5_60w` | flint, blocco bianco di 60 / 88 colonne su 144 (**41,7 %** e **61,1 %**) | BIANCO, NERO | SI |

⚠️ **S14/D140**: la soglia dell'alone è passata da `> 15 %` a `>= 15 %`, e tre card stavano
esattamente sul 15 %. `c7b_halo15` è quindi passata da «alone no» a «alone **SI**» e altrettanto
hanno fatto `c8a`/`c8b` sulla fascia A (bad_black 15 esatto); `c7a_halo12`, al 12 %, resta senza
alone — è lei a dire che la soglia non è scesa. Le card **non** cambiano un pixel: cambia solo la
colonna «alone atteso», quindi non c'è niente da rimandare all'orologio se erano già sul telefono.

Le c8 sono l'unica prova che non si legge a freddo: `c8a_hyst_hold` **resta** bianca passando da B ad
A (20 < 15 + 10 di isteresi), `c8b_hyst_flip` **passa** a nero (30 ≥ 15 + 10) e da S14/D140 prende
anche l'alone (bad_black 15 ≥ 15); la previsione di `photo_prep.py`, che l'isteresi non la modella,
dice NERO con alone per entrambe, ed è quello il valore in tabella. La prova va fatta con il **testo
di dimensione normale**: con ExtraLarge la fascia A passa da 106 a 110 px e i conti cambiano (il tool
lo scrive sotto la tabella).

`--check` esegue, per ogni card e per ogni fascia,
`python3 tools/photo_prep.py --dither none --bw-dither none --stats --band-h <fascia> --out <tmp>
<card>.png` (§9) e confronta bad w/b, Y medio, colore e alone con l'atteso: oggi **21 righe, 0
discordanti** in ~2 s. Verifica **anche** che la copia di `LUMA_SUN` e delle 5 soglie dentro il tool
coincida con `luma.c`/`luma.h`, e se divergono esce 1 dicendo quale: dopo una ritaratura delle soglie
(O5) vanno aggiornate la copia nel tool **e** rigenerate card e tabella. Il test completo è
`python3 apps/galleria/test/test_cards.py` (125 controlli: lancia da sé `--selftest` e `--check` in una
cartella temporanea, e si salta con un messaggio se Pillow manca; da S14 pinna anche la colonna
«alone atteso» delle card al limite del 15 %, la propria e quella di `photo_prep.py`).

### Come mandare le card all'orologio

Si copiano sul telefono (`adb push ~/galleria-gate/cards /sdcard/Pictures/GalleriaCards/`, §15) e si
inviano dalla config page **una per volta**. Perché i numeri attesi valgano, nell'editor:

- **dithering «Nessuno»**, **gamma 1**, **schiarisci le ombre (lift) 0**;
- **«Ottimizza per lo schermo dell'orologio» da SPEGNERE a mano** (`opt_sunlight`; fino a UX-1
  si chiamava «Ottimizza per il vetro»). ⚠️ Da **S14/D138** la casella è
  **spuntata di serie** per ogni foto nuova: prima bastava non toccarla, adesso è un passo in più e
  è la dimenticanza più cara di tutta la procedura (vedi sotto che cosa fa a `palette64`);
- **nessuno zoom né spostamento**: la card è già 200×228, basta il pulsante **«Riparti da capo»**
  (`btn_fit`, `#fit` nell'editor: fino a UX-3 si chiamava «Adatta»).

Con «Ottimizza per lo schermo dell'orologio» acceso `palette64` perde 41 tasselli su 64 (43 colori
invece di 64) e l'esperimento O6 verrebbe fatto su una card corrotta; con uno zoom o un ritaglio anche di 1 px la
pagina ricampiona con LANCZOS e **tutte** le percentuali cambiano. Se la riga `luma(photo)` sul vetro
non coincide con la tabella di `--check`, è successa una di queste due cose: riaprire l'editor con la
cornice più larga possibile e premere «Riparti da capo» (l'orientamento del telefono non conta: la
cornice è comunque limitata a 300 px). Lo stesso avviso lo stampa il tool a ogni esecuzione
(`SEND_HINT`), da S14 con lo stesso nome del pulsante e con l'avvertenza su D138;
`apps/galleria/test/test_cards.py` pinna tutte e due le formulazioni.

---

## 18. `build_i18n.py` – dizionari della config page di Galleria (S10, sei lingue da S11)

Genera i **dizionari** della config page dalla loro sorgente unica,
`apps/galleria/i18n/messages.json`: la pagina non contiene più testi, solo chiavi che
`build_config_page.py` (§13) trasforma in **indici**, e i sei dizionari viaggiano nell'hash
dell'URL. Solo stdlib (Python 3.8+). Spec: `docs/design/galleria-s10-i18n.md` §1 (D35) e
`docs/design/galleria-s11-lingue-es-pt.md` (D39: es e pt in coda), `apps/galleria/i18n/README.md`.

```bash
python3 tools/build_i18n.py             # rigenera i due file
python3 tools/build_i18n.py --check     # 0 se sono aggiornati, 1 altrimenti (dentro `pagecheck`)
python3 tools/build_i18n.py --selftest  # 32 controlli su una cartella temporanea
```

**Sorgente** (`{ "chiave": { "it": …, "en": …, "de": …, "fr": …, "es": …, "pt": … } }`, i campi che
iniziano con `_` sono commenti) → **due file identici**:

| File | A che serve |
|---|---|
| `apps/galleria/src/pkjs/i18n.js` | il PKJS lo carica pigramente e lo mette nello stato dell'hash (`configState`) |
| `apps/galleria/test/fixture_i18n.js` | gli stessi dati per i test node (`test_page.js` risolve i nomi delle chiavi) |

```js
module.exports = { keys: [...], en: [...], it: [...], de: [...], fr: [...], es: [...], pt: [...] };
```

ES5 e **ASCII** (accenti come `\uXXXX`), array **nell'ordine del file**: l'indice di una chiave è la
sua posizione.

**Misura corrente** (19/09/2026, fine S14): **134 chiavi × 6 lingue**, `i18n/messages.json`
**39.776 B**, `src/pkjs/i18n.js` e `test/fixture_i18n.js` **36.482 B**, **27.719 B** di JSON UTF-8
per i soli sei array (senza `keys`: è quello che manda `index.js`) = **36.959 caratteri** di
base64url dentro l'hash dell'URL. ⚠️ **I byte veri si leggono dalla riga che il tool stampa alla
rigenerazione** — `build_i18n: 134 chiavi × 6 lingue (36482 B) -> src/pkjs/i18n.js,
test/fixture_i18n.js`, e con `--check` `build_i18n --check: 134 chiavi × 6 lingue aggiornate (…)` —:
è quel numero, non una simulazione del patch, che va riportato qui e in
`apps/galleria/i18n/README.md` dopo ogni fusione del dizionario.

La **storia del conteggio** — 121 chiavi × 4 lingue a S10, 121 × 6 con lo spagnolo e il portoghese
di S11, 135 con l'anteprima di S12, 126 dopo la potatura di UX-1 (D72), 132 con UX-2, di nuovo 135
con UX-3 (D116), le stesse 135 con UX-4, che tocca **una sola stringa** (`preview_stale` in
francese, D133, +14 B), e **134 con S14**, che toglie `font_prev`/`font_next` insieme alle frecce
del font (D137), aggiunge `opt_layout_a_bottom` per la terza disposizione (D136) e riscrive
`lbl_info_row`, `preview_note_info` e `opt_font_leco` (D141) — sta nella tabella di
`apps/galleria/i18n/README.md` (sessione → chiavi → byte di `messages.json`; S10 e S11 nella riga in testa, le altre cinque nella tabella); le chiavi
entrate e uscite passaggio per passaggio e le riallineature delle traduzioni stanno in
`docs/design/galleria-s10-i18n.md` §3 «Storia del dizionario», che però non ha una riga per S10 né
per S12 e non porta i byte di S11 e UX-1. Il JSON UTF-8 dei soli sei array — quello che `index.js`
mette nell'hash — era **25.263 B** a fine UX-1, **27.686 B** a fine UX-3 e **27.700 B** a fine UX-4,
contro i **27.719 B** di oggi. Il tool era rimasto fermo da UX-3 (D123: nessuna chiave nuova era
una `<option>` o una `.rlab`); **S14 lo tocca in due punti** — `opt_layout_a_bottom` in `OPTIONS`
(D136: la terza voce di «Disposizione» è una `<option>` come le altre) e `RENDER_ARGS['opt_hours']`
da «3» a «12» (D139: la tendina arriva a «ogni 12 h», che è il valore più lungo che `page.js` ci
mette) —, mentre `--selftest` resta a **32**.

⚠️ **Aggiungere una chiave in mezzo cambia gli indici**: si rigenera sempre tutto insieme, e
`make -C apps/galleria/test pagecheck` esegue questo `--check` **prima** di quello della pagina.

**Controlli** (a ogni generazione e con `--check`, uscita 1 con un messaggio, mai un traceback):
JSON valido con un oggetto in cima e nessuna chiave doppia; nomi in `snake_case`; ogni voce con
**esattamente** le 6 lingue nell'ordine `it, en, de, fr, es, pt` (`LANGS`; gli array generati seguono
invece `OUT_LANGS` = `en, it, de, fr, es, pt`, cioè l'ordine dell'impostazione `lang`); testi non vuoti,
senza backtick (la pagina viene inlinata in una stringa) né CR; segnaposto solo `{0}`/`{1}` e lo **stesso insieme** in tutte le
lingue della voce; **tripwire di lunghezza** (qui sotto); i due file generati identici alla rigenerazione.

**Tripwire di lunghezza** (UX-1, D70; spec `docs/design/galleria-s13-ux-casual.md` §4 U-01 e
§6): nella config page due posti non vanno a capo ma si rompono — le `<option>` delle select e le
`lbl_*` della colonna delle etichette, larga 9,5 em. In testa al tool ci sono due **liste esplicite**
(non un prefisso del nome: le etichette delle caselle `opt_sunlight`, `opt_shake_next`, `opt_info_*`
stanno in un `<label>` a tutta larghezza e **non** sono in lista):

| Lista | Chiavi | Limite |
|---|---|---|
| `OPTIONS` | 27 delle 30 chiavi che finiscono in una `<option>` (`opt_*` + `dither_none`; da S14 anche `opt_layout_a_bottom`, D136) | **28** caratteri |
| `OPTIONS` (tre eccezioni) | `opt_font_leco`, `opt_lang_auto`, `opt_style_no_flint` | **36** caratteri |
| `LABELS` | le 16 `lbl_*` della colonna da 9,5 em | **22** caratteri |

⚠️ **S14/D141**: `lbl_font` è tornata sulla riga della sua tendina (la regola
`#fontRow .rlab { flex-basis: 100% }`, nata in UX-2 per le frecce, se n'è andata con loro, D137),
quindi i suoi 22 caratteri non sono più un limite «per prudenza» come dice ancora il commento in
testa a `LABELS`: sono di nuovo la larghezza vera della colonna.

Si misurano i **caratteri** (code point, non byte) del testo **renderizzato**, lingua per lingua:
i segnaposto vengono sostituiti con il valore più lungo che `page.js` ci mette davvero —
`RENDER_ARGS` per i valori fissi (`opt_minutes` → «60», `opt_hours` → **«12»** da S14/D139 —
la tendina ha 3, 6 e 12 —, `opt_lang_auto` → «Português») e `RENDER_LONGEST` per quelli che vengono da un'altra chiave (`opt_style_no_flint`
→ la più lunga, **della stessa lingua**, fra le quattro `opt_style_*` e — da UX-2/D86, che porta
il suffisso «(non sul Duo)» anche sulla select dei colori — `opt_color_yellow`/`opt_color_blue`). Un segnaposto senza regola di
rendering è un errore (la misura sarebbe falsa), e così un **nome sbagliato** in lista: una chiave
elencata che non esiste in `messages.json` esce con «lista da aggiornare» invece di sparire in
silenzio. Gli sforamenti vengono raccolti **tutti insieme** (chiave, lingua, lunghezza, limite e
testo, nell'ordine del file), così chi riscrive i testi li vede in un colpo solo. Nessuna tripwire
sul francese (D67: «KB» e spazio semplice restano come sono); nessuna eccezione per lingua.

**Autotest** (`--selftest`): su una cartella temporanea e con **fixture proprie a sei lingue** (mai i
file del repo), generazione e round trip, `--check` nei casi aggiornato/non aggiornato/mancante, lingua
mancante (5 su 6), lingue fuori ordine, segnaposto diversi fra lingue, backtick, chiave doppia, file
assente o non JSON, output ASCII e riproducibile, `LANGS`/`OUT_LANGS` con le stesse sei lingue; per la
tripwire (D70) una fixture con i testi **esattamente ai limiti** (28/36/22 renderizzati) che deve passare,
più option oltre il limite, etichetta oltre il limite, chiave in lista assente dal dizionario, segnaposto
senza regola di rendering, la scelta della `opt_style_*` più lunga nella stessa lingua, uno sforamento in **una sola lingua** (il messaggio nomina «/ de:», così una misura fatta sulla sola colonna italiana resterebbe verde) e un testo accentato entro il limite in **code point** ma oltre in byte UTF-8, che deve passare. Un controllo
in più guarda **le liste vere**, non la fixture: `OPTION_LIMIT`/`OPTION_LIMIT_WIDE`/`LABEL_LIMIT` a
28/36/22, **30** chiavi in `OPTIONS` (da S14: 27 + le tre a 36, esattamente `opt_font_leco`, `opt_lang_auto`,
`opt_style_no_flint`) e 16 in `LABELS` — così alzare un limite o togliere una chiave dalla lista non
spegne la tripwire in silenzio (D70: «non ci sono eccezioni»), ma diventa una modifica da fare anche
qui e nel selftest. Da **UX-2** due pin in più: le quattro «automatico» di U-11
(`opt_clock_auto`, `opt_leading_zero_auto`, `opt_color_auto`, `opt_outline_auto`) sono in `OPTIONS`
e `opt_auto` non c'è più; `RENDER_LONGEST['opt_style_no_flint']` elenca **sei** chiavi (i quattro
stili e i due colori, D86). Stampa `build_i18n --selftest: N ok` — oggi **32** — ed esce 0/1.

---

## 19. `galleria_gloss_check.py` – tripwire del glossario di Galleria (UX-4, D132)

Il glossario di `docs/design/galleria-s10-i18n.md` §3 è una **tabella scritta a mano**: le sei colonne
di lingua di ogni riga ripetono testi che vivono davvero in `apps/galleria/i18n/messages.json`
(134 chiavi × 6 lingue, §18). Finché la copia si controllava a occhio, la tabella poteva restare
indietro senza che nessuno se ne accorgesse — e restare **parziale** senza dirlo: a inizio UX-4
copriva 100 chiavi su 135, e una traduzione francese corretta nel dizionario (`preview_stale`, D133)
era rimasta nella versione vecchia nel glossario. Questo tool confronta i due file e **fallisce quando
divergono**. Solo stdlib (Python 3.8+), nessuna rete, niente SDK; deriva dallo script di ricognizione
di UX-4 (rapporto R2) e la decisione che lo mette nella build è **D132**.

```bash
python3 tools/galleria_gloss_check.py              # 0 = allineato, 1 = da correggere
python3 tools/galleria_gloss_check.py --verbose    # + le differenze di sola forma, con le due stringhe
python3 tools/galleria_gloss_check.py --doc D --json J   # altri percorsi (copie di prova, gate)
python3 tools/galleria_gloss_check.py --selftest   # autotest su una fixture sintetica -> "45 ok"
make -C apps/galleria/test glosscheck              # il bersaglio (il --selftest sta in `pyselftest`)
```

I percorsi di default sono **relativi alla radice del repo**, calcolata da `__file__` (il tool sta in
`tools/`): funziona da qualunque cartella, anche da `apps/galleria/test/`. Dura ~0,04 s, quindi sta
nella catena di `make -C apps/galleria/test` accanto a `pagecheck` senza pesare.

### Formato della tabella «viva» (il contratto che il tool legge)

```markdown
| it (riferimento) | en | de («du») | fr («vous») | es («tú») | pt («você») | chiavi |
|---|---|---|---|---|---|---|
| Salva · Esci senza salvare | Save · Leave without saving | Speichern · Ohne Speichern verlassen | Enregistrer · Quitter sans enregistrer | Guardar · Salir sin guardar | Salvar · Sair sem salvar | `btn_save`, `btn_cancel` |
| Pebble 2 Duo · bianco e nero | Pebble 2 Duo · black and white | Pebble 2 Duo · Schwarz-Weiß | Pebble 2 Duo · noir et blanc | Pebble 2 Duo · blanco y negro | Pebble 2 Duo · preto e branco | `watch_flint` |
```

- **Dove**: la sola §3, cioè da `## 3.` al `## ` successivo. Tutto il resto del documento è fuori.
- **Quale tabella**: l'unica con quell'intestazione — prima colonna `it (riferimento)`, ultima
  `chiavi`, **sette** colonne in tutto. Un'intestazione con un numero di colonne diverso è un errore
  esplicito, non una tabella ignorata in silenzio — e dev'essere l'unica tabella di §3 **dopo**
  l'intestazione: una seconda tabella lì fa uscire 1 con «riga N con X colonne invece di 7», mentre
  una tabella che sta **prima** dell'intestazione viene ignorata in silenzio.
- **Storia**: i blocchi «🔁 … riallineata il …» sono **blockquote** (`>` a inizio riga) e restano
  fuori per costruzione, prima o dopo la tabella che siano; non c'è nessuna lista di eccezioni.
- **Chiavi**: ultima colonna, **fra backtick**, una o più per riga (`` `sec_look`, `sec_rotation` ``);
  il resto della cella è commento libero ma **senza backtick** (`(**UX-3/D109**)` va bene; un
  identificatore fra backtick verrebbe letto come una chiave). Una riga senza nessuna chiave fra
  backtick è un errore. La stessa chiave può comparire in due righe (`opt_never` serve due select):
  **ogni occorrenza** viene confrontata.
- **Testi**: quando la riga tiene N chiavi, le sei celle di lingua tengono gli N testi separati da
  **« · »** (spazio, U+00B7, spazio), nell'ordine delle chiavi.
- **Testi che contengono essi stessi un « · »** (`watch_flint`, `preview_auto`): lo split darebbe più
  parti che chiavi, quindi il tool riassegna **gruppi contigui di parti alle chiavi** con una
  programmazione dinamica che massimizza la somiglianza (`difflib`) con il testo JSON di quella
  chiave. La cella viene **segnalata come riallineata** ma non fa fallire: se il riallineamento fosse
  sbagliato, i testi assegnati non coinciderebbero e la differenza uscirebbe al punto 3 del rapporto.

### Che cosa confronta, e che cosa fa uscire 1

Il confronto è a **tre livelli**, cella per cella: identico byte per byte → identico dopo
**normalizzazione di forma** (caporali e virgolette curve, apostrofi U+2019, spazi unificatori,
«…» → «...», trattini lunghi, `**` e backtick di markdown, spazi multipli — e, in coda, qualunque
differenza di sole maiuscole/minuscole o di sola punteggiatura) → **parole diverse** (token
alfanumerici minuscoli, senza punteggiatura). La normalizzazione **non tocca mai le parole**, quindi
non può nascondere una traduzione diversa.

| Condizione | Esito |
|---|---|
| una chiave del JSON non ha nessuna riga nel glossario | **1**, con l'elenco delle chiavi e il testo italiano |
| una chiave della tabella non esiste più nel JSON (residuo di una chiave eliminata) | **1** |
| una riga senza chiavi, o una cella con meno parti che chiavi | **1**, con riga e lingua |
| una cella con **parole diverse** | **1**, con le due stringhe e le parole che stanno solo da una parte |
| differenza di **sola forma** | **0**: elencata (`--verbose` mostra anche le due stringhe) |
| cella **riallineata** perché il testo contiene « · » | **0**: elencata con riga e lingua |
| file mancante, JSON non valido, §3 o intestazione assenti, lingua mancante | **1**, un messaggio di una riga, **mai** un traceback |

Un controllo in più, **informativo** (non cambia l'esito perché è una regola del dizionario, non del
glossario): i segnaposto `{0}`/`{1}` devono formare lo stesso insieme nelle sei lingue di ogni voce —
lo stesso controllo lo fa `build_i18n.py` (§18) prima di generare.

⚠️ Quando il tool è rosso **si corregge il glossario, non il dizionario**: la fonte unica dei testi è
`messages.json` (lo dice anche l'ultima riga del rapporto). Una riga nuova del glossario si scrive
copiando i testi dal JSON, non riscrivendoli a mano.

### Autotest

`--selftest` costruisce in una cartella temporanea un dizionario di **4 chiavi × 6 lingue** e un
documento con §3, due blockquote di storia e la tabella nel formato vero (mai i file del repo), poi
esercita **16 casi**: tabella allineata, chiave mancante, chiave in più, parola diversa in una sola
lingua, differenza di sola forma (caporali) con e senza `--verbose`, riga con due chiavi e « · »,
testo che contiene esso stesso un « · », blockquote di storia prima e dopo la tabella, cella con meno
parti che chiavi, riga senza chiavi, §3 assente, intestazione assente, intestazione con cinque lingue,
JSON assente e JSON rotto, chiave ripetuta in due righe (anche con una sola occorrenza sbagliata),
lingua mancante nel dizionario. Stampa `galleria_gloss_check --selftest: N ok` — oggi **45** — ed esce
0/1. I casi sono stati verificati con **nove mutanti** del tool (blockquote non ignorato,
riallineamento tolto, mancanti/in più/celle non allineate/parole diverse non fatali, forma contata
come mismatch, una sola occorrenza per chiave, controllo delle colonne tolto): tutti e nove fanno
diventare rosso il selftest.

**Misure del 14/09/2026** (UX-4, a tabella completata): 135 chiavi nel JSON, **135 nella tabella**
(68 righe di dati, 136 occorrenze), **816 celle confrontate, 816 identiche**, 0 di sola forma,
0 parole diverse, 12 celle riallineate (le sei della riga di `watch_flint`, 220, e le sei
della riga di `preview_auto` + 3 chiavi, 248), 0 segnaposto incoerenti → `ESITO: ALLINEATO`.
All'inizio della sessione lo stesso comando dava 100 chiavi su 135 e una cella con parole diverse.

**Misure del 19/09/2026** (S14, dopo D136–D141): 134 chiavi nel JSON, **134 nella tabella**
(**67 righe di dati**, 135 occorrenze: `opt_never` serve ancora due select), **810 celle confrontate,
810 identiche**, 0 di sola forma, 0 parole diverse, 12 celle riallineate (le sei di `watch_flint`,
riga 161, e le sei di `preview_auto` + 3 chiavi, riga 188), 0 segnaposto incoerenti →
`ESITO: ALLINEATO`. Rispetto a UX-4 il glossario perde la riga delle frecce del font (D137), guadagna
`opt_layout_a_bottom` sulla riga di «Disposizione» (D136) e riscrive tre testi (D141): una riga di
dati in meno, sei celle in meno. `--selftest` resta a **45**.

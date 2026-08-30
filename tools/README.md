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
| `pebble-watchface-agent-skill/` | Skill ufficiale Claude Code per generare watchface/watchapp Pebble (clone git) |
| `sdk-docs/` | Sorgenti di developer.repebble.com: guide, changelog, API C (clone git) |
| `svg2pdc.py` | Convertitore SVG → PDC (Pebble Draw Command), **portato a Python 3** |
| `pebble_image_routines.py` | Routine colore Pebble (palette a 64 colori), **portate a Python 3** |
| `photo_prep.py` | Foto → `raw6`/`raw1` per la watchface Galleria (Pillow, dithering FS/Bayer/Atkinson) — §9 |
| `gen_digits.py` | Cifre grandi come **strip PNG** (sprite) + `src/c/digit_metrics.h` per Galleria (freetype-py + Pillow) — §10 |
| `galleria_devserver.py` | **Dev server** di Galleria: in emulatore fa le veci della config page del telefono (solo stdlib) — §11 |
| `galleria_browser.py` | **Firefox headless** via WebDriver (solo stdlib): pilota la config page di Galleria per il gate S6 — §12 |
| `build_config_page.py` | Inlina le sorgenti della **config page** di Galleria in un unico HTML + `src/pkjs/config_page.js` (S6) — §13 |
| `gen_font_previews.py` | Anteprime «12:34» a 1 bit dei tre font per la config page (`previews.js`, S6) — §14 |
| `upstream-py2/` | Originali Python 2 non modificati, tenuti solo come riferimento |
| `palette/` | Palette ufficiale a 64 colori Pebble (`.gif`, `.act`, `.pal`) |
| `test/` | SVG di prova e output PDC generato |
| `setup-env.sh`, `pebble-env.sh`, `qemu-pebble-wrapper` | Installazione e caricamento dell'ambiente SDK Pebble in user space (vedi §8) |

---

## 1. `pebble-watchface-agent-skill/`

Clone di <https://github.com/coredevices/pebble-watchface-agent-skill> (`--depth 1`, ~2.7 MB).
È la skill ufficiale di Core Devices per Claude Code: genera watchface e watchapp completi,
compila il `.pbw` e li testa nell'emulatore QEMU.

### Struttura principale

```
.claude/skills/pebble-watchface/
├── SKILL.md              # workflow completo in 8 fasi (816 righe): scelta tipo progetto,
│                         # design, implementazione, build PBW, test QEMU, asset, publish
├── reference/            # documentazione di approfondimento caricata su richiesta
│   ├── pebble-api-reference.md   # API C principali (Window, Layer, GContext, servizi)
│   ├── drawing-guide.md          # coordinate schermo, disegno, GPath, colori
│   ├── animation-patterns.md     # pattern di animazione e loop di refresh
│   ├── watchapp-guide.md         # differenze watchapp vs watchface (bottoni, stack finestre)
│   └── alloy-guide.md            # framework Alloy: JavaScript eseguito sul watch (Moddable XS)
├── templates/            # file di partenza da copiare e adattare
│   ├── static-watchface.c        # watchface statico/analogico
│   ├── animated-watchface.c      # watchface animato
│   ├── weather-watchface.c       # watchface con meteo (lato C)
│   ├── pkjs-weather.js           # lato PebbleKit JS per il meteo
│   ├── alloy-watchface.js        # watchface minimale in Alloy (Poco/commodetto)
│   ├── alloy-mdbl.c              # stub C per progetti Alloy
│   ├── alloy-manifest.json       # manifest Moddable
│   ├── alloy-package.json.template
│   ├── package.json.template     # manifest progetto Pebble (con segnaposto)
│   └── wscript.template          # script di build waf
├── scripts/              # utility Python 3
│   ├── create_project.py         # crea lo scheletro del progetto
│   ├── validate_project.py       # valida struttura/configurazione prima della build
│   ├── generate_uuid.py          # genera lo UUID dell'app
│   ├── create_app_icons.py       # ricava le icone (80x80, 144x144) da uno screenshot
│   └── create_preview_gif.py     # crea GIF di anteprima catturando più frame
└── samples/aqua-pbw/     # vuota nel clone (artefatti .pbw esclusi dal .gitignore)
```

Fuori dalla skill: `samples/projects/` (7 progetti completi di esempio con sorgenti e screenshot:
batman, beach, castle, lightsaber-duel, persia-swordfight, pocket-garden, tumbling-monkeys)
e `tutorials/c-watchface-tutorial/part1..part6` (il tutorial ufficiale in C, progressivo).

### Come attivarla

Copiare o collegare la cartella della skill dentro il progetto in cui si lavora:

```bash
mkdir -p <progetto>/.claude/skills
ln -s /home/claudecode/ProgettiClaude/Pebble/tools/pebble-watchface-agent-skill/.claude/skills/pebble-watchface \
      <progetto>/.claude/skills/pebble-watchface
```

La skill presuppone l'SDK Pebble (`pebble` CLI) e QEMU: su questa macchina sono installati
in user space, vedi §8.

---

## 2. `sdk-docs/`

Clone di <https://github.com/coredevices/sdk-docs> (`--depth 1`, ~215 MB di cui 84 MB di `.git`
e 107 MB di asset immagini/video). È il sito Jekyll che genera developer.repebble.com.

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

Scaricata da developer.repebble.com:

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

Comando usato e risultato:

```
$ cd test && python3 ../svg2pdc.py icon.svg -v -o icon.pdc
Path parser: built-in (vendored)
/home/claudecode/ProgettiClaude/Pebble/tools/test/icon.svg:
Circle: [fill color:203; stroke color:192; stroke width:1] (12.0, 12.0) 10.0
Path: [fill color:240; stroke color:255; stroke width:1] [(4.0, 4.0), (10.0, 4.0), (10.0, 10.0), (4.0, 10.0)] False 
Path: [fill color:204; stroke color:192; stroke width:2] [(4.0, 20.0), (12.0, 14.0), (20.0, 20.0)] False 
```

Rilettura dell'header con `struct`:

```
total file size : 75 bytes
magic           : b'PDCI' -> PDC image
payload size    : 67 (header+payload = 75 == file size: True)
version         : 1
viewbox size    : 24x24
command count   : 3
  cmd 1: type=2(CIRCLE)  stroke=0xC0 width=1 fill=0xCB radius=10 points=1 [(12, 12)]
  cmd 2: type=1(PATH)    stroke=0xFF width=1 fill=0xF0 open=0     points=4 [(4, 4), (10, 4), (10, 10), (4, 10)]
  cmd 3: type=1(PATH)    stroke=0xC0 width=2 fill=0xCC open=0     points=3 [(4, 20), (12, 14), (20, 20)]
bytes consumed  : 75 / 75 -> OK, fully parsed
```

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
# le due foto demo del repo (comandi esatti in apps/galleria/resources/photos/README.md)
python3 tools/photo_prep.py --out apps/galleria/resources/photos --name demo_1 \
        --preview --preview-dir /tmp/prep --stats /usr/share/backgrounds/mizuno-as-Big_Dipper.jpg

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
| `--sunlight` | quantizza nello **spazio della resa** del pannello (LUT 32³): colori più fedeli, decisione D6 → default OFF |
| `--preview` `--preview-dir DIR` | `<nome>_emery_x2.png` e `<nome>_flint_x2.png` (ricostruite con la resa sunlight, ×2 NEAREST) |
| `--emit-idx` | scrive anche `<nome>.idx`, 1 byte per pixel (indici 0..63) |
| `--stats` | previsione del colore del testo con la regola di `apps/galleria/src/c/luma.h`; senza `--band-h` copre **solo** la fascia del layout A (106 px emery / 76 flint) |
| `--band-h E[,F]` | altezza della fascia di `--stats` in px (default `106,76`): `228,168` = layout B a tutto schermo, `78,52` = riga singola sotto Quick View, `110` = layout A con content size ExtraLarge (un valore solo ⇒ flint resta 76) |
| `--fixture DIR` | scrive `rt.idx`, `rt.raw6`, `rt.bits`, `rt.raw1`, `rt_meta.h` ed esce |
| `--selftest` | autotest (pack6/unpack6, pack1, CRC32, tabelle, determinismo del dithering) ed esce |

Stampa sempre, per ogni foto: rettangoli di crop, dimensioni dei raw, **CRC32** (`zlib.crc32`) e
numero di colori usati; con `--stats` anche `bad_white`/`bad_black`/Y medio e il colore di testo
previsto sulla fascia dell'ora (campionamento 1 px su 2). Senza opzioni la fascia è **solo** quella
del layout A: `y 0..105` su emery, `y 0..75` su flint — le altre si chiedono con
`--band-h EMERY[,FLINT]`, che sostituisce le due costanti sia nel conteggio sia nella riga stampata
(`fascia y 0..N`):

| caso | `--band-h` |
|---|---|
| layout A (default) | `106,76` |
| layout B a tutto schermo | `228,168` |
| riga singola sotto Quick View | `78,52` |
| layout A con content size ExtraLarge | `110` (solo emery; flint resta 76) |

`--band-h` tocca **solo** le statistiche: i `.raw6`/`.raw1` e i loro CRC32 non cambiano.

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
Esce con 0 se tutto passa, 1 altrimenti.

### Foto demo

`apps/galleria/resources/photos/demo_{1,2}.{raw6,raw1}` (provenienza, licenza, CRC32 e previsione del
colore del testo in `apps/galleria/resources/photos/README.md`). Le anteprime PNG **non** stanno nel
repo: generarle con `--preview --preview-dir` in una cartella temporanea.

---

## 10. `gen_digits.py` – cifre sprite per Galleria

Genera da TTF le **strip** delle cifre grandi della watchface **Galleria** (design
`docs/design/galleria.md` D3/D4 e §7, sessione S3) e l'header
`apps/galleria/src/c/digit_metrics.h` che `src/c/ui_digits.c` include.

Interprete: **`~/.local/share/uv/tools/pebble-tool/bin/python`** (freetype-py 2.5.1 su libfreetype 2.13.2 + Pillow 12.3).
Il Python di sistema **non** ha freetype-py: con `python3` il tool non parte.

### Uso

```bash
PY=~/.local/share/uv/tools/pebble-tool/bin/python

# generazione completa (12 PNG + header + foglio di contatto per il controllo visivo)
# --fit-width --no-colon-b --pack = comando CANONICO di Galleria (lo cita anche digit_metrics.h)
$PY tools/gen_digits.py \
    --fonts-dir apps/galleria/resources/fonts \
    --out       apps/galleria/resources/digits \
    --header    apps/galleria/src/c/digit_metrics.h \
    --preview   /tmp/digits --fit-width --no-colon-b --pack

# solo la tabella delle metriche, nessun file scritto
$PY tools/gen_digits.py --check --fit-width --no-colon-b --pack

# una sola combinazione (font,taglia,piattaforma; campi vuoti o `*` = tutti)
$PY tools/gen_digits.py --only barlow,a,color --out /tmp/d --preview /tmp/d
```

| Opzione | Effetto |
|---|---|
| `--fonts-dir DIR` | cartella dei TTF (default `apps/galleria/resources/fonts`) |
| `--out DIR` | cartella delle strip PNG (default `apps/galleria/resources/digits`) |
| `--header FILE` | header generato (default `apps/galleria/src/c/digit_metrics.h`) |
| `--preview DIR` | scrive `DIR/digits_preview.png`: tutte le strip ×2 su fondo grigio, con i colori resi |
| `--only F,T,P` | limita la generazione; con una selezione parziale l'**header non viene scritto** |
| `--check` | stampa solo la tabella delle metriche e le segnalazioni, non scrive nulla |
| `--fit-width` | se un glifo non entra nella sua cella — quella della strip, o quella del `':'` nel layout A — abbassa la pixel size invece di uscire con errore (vedi sotto) |
| `--no-colon-b` | la taglia **B** viene generata **senza la cella del `':'`**: 10 celle invece di 11, e nell'header `ink[DIGITS_GLYPH_COLON] = { 0, 0 }`. Il layout B non disegna mai i due punti (S3/S7 D16). La taglia A non cambia di un byte |
| `--pack` | strip **compatta**: i glifi vengono accostati e `strip_w` scende alla somma degli inchiostri (arrotondata a 4 px), invece delle celle fisse da `cell_w`. Stessi pixel di inchiostro, stessa `px`, stesso `digit_h`; `cell_w` nell'header resta il passo della griglia del layout (vedi sotto) |

Il tool è **deterministico**: nessuna data, nessun percorso assoluto e nessun timestamp finisce
nell'output (l'header cita `TOOL_VERSION` e il comando canonico con percorsi relativi), quindi due
esecuzioni danno gli stessi byte e `cmp` vale come controllo di non-derivazione:

```bash
$PY tools/gen_digits.py --out /tmp/d1 --header /tmp/d1.h --fit-width --no-colon-b --pack
$PY tools/gen_digits.py --out /tmp/d2 --header /tmp/d2.h --fit-width --no-colon-b --pack
for f in /tmp/d1/*.png; do cmp "$f" "/tmp/d2/$(basename "$f")"; done; cmp /tmp/d1.h /tmp/d2.h
```

### Formato della strip

Una strip per **(font, taglia, piattaforma)**, nell'ordine `'0'..'9'` poi `':'`. Il glifo si
estrae sempre con `gbitmap_create_as_sub_bitmap(strip, GRect(ink[k].x, 0, ink[k].w, strip_h))`
(nessuna copia): `ui_digits.c` conosce **solo** `ink[k].x` e `ink[k].w`, mai `cell_w`.
La taglia A porta **11 glifi**; con `--no-colon-b` (comando canonico di Galleria) la taglia B ne
ha **10**, solo le cifre.

Due disposizioni orizzontali:

- **a celle fisse** (default): glifo `k` in `[k*cell_w, (k+1)*cell_w)`, inchiostro centrato nella
  cella. `strip_w = celle × cell_w`, e fra un glifo e l'altro resta molto vuoto (le cifre sono
  molto più strette del passo del layout: in Anton B su emery 489 px di inchiostro su 640).
- **compatta** (`--pack`, comando canonico da S7): i glifi vengono copiati **adiacenti** da
  sinistra a destra nello stesso ordine, `ink[k].x` è l'offset progressivo e
  `strip_w = Σ ink[k].w` **arrotondata per eccesso a un multiplo di 4 px** (a 2 bit/px, 4 px = 1
  byte esatto: lo stride del PBI resta a byte interi). Le 0..3 colonne in coda sono trasparenti.
  I pixel di inchiostro sono **identici** a quelli della strip a celle fisse: `pack_strip()` li
  copia colonna per colonna dopo il disegno, quindi `px`, baseline, righe e `digit_h` non
  cambiano; sparisce solo il vuoto fra i glifi.

⚠️ Con `--pack` **`cell_w` nell'header resta il passo della griglia del LAYOUT** (40/64 su emery,
28/48 su flint), non la larghezza di una cella nel PNG — nella strip compatta le celle non
esistono più. È il valore che `ui_time.c` (`prv_strip_fits`) confronta con `a_cell`/`b_cell` per
rifiutare una strip che non corrisponde alla griglia cablata, ed è il vincolo che `pick_px` e
`--fit-width` continuano a usare per la scelta della `px`.

| Piattaforma (tag) | Taglia | `cell_w` × `strip_h` | glifi | `strip_w` celle fisse | `strip_w` con `--pack` | righe utili (`strip_h − 2`) | File |
|---|---|---|---|---|---|---|---|
| `emery` (`~color`) | A | 40 × 68 | 11 | 440 | 360 / 332 / 352 | 66 | `<font>_a~color.png` |
| `emery` (`~color`) | B | 64 × 96 | 10 | 640 | 492 / 448 / 512 | 94 | `<font>_b~color.png` |
| `flint` (`~bw`) | A | 28 × 44 | 11 | 308 | 248 / 216 / 252 | 42 | `<font>_a~bw.png` |
| `flint` (`~bw`) | B | 48 × 64 | 10 | 480 | 328 / 300 / 344 | 62 | `<font>_b~bw.png` |

(`strip_w` con `--pack` dipende dal font: anton / bebas / barlow.)

Senza `--no-colon-b` la taglia B torna a 11 glifi (`strip_w` a celle fisse 704 / 528). Senza
`--pack` i 12 PNG e l'header escono **byte-identici** a quelli generati prima della compattazione
(verificato con `cmp`): l'opzione non tocca nessun altro percorso del tool.

Le righe utili sono `strip_h − 2`: una riga di contorno sopra e una sotto. Il campo `digit_h`
dell'header **non** è questo numero ma l'altezza reale del riempimento (vedi sotto).
`package.json` dichiara 6 risorse
`DIGITS_<FONT>_<TAGLIA>` con `"file": "digits/<font>_<taglia>.png"` (senza tag): sono i tag
`~color`/`~bw` sul nome del file a far scegliere all'SDK la variante emery/flint.

### Palette: tre colori esatti

I PNG sono **RGBA** (`mode "RGBA"`) con esattamente tre colori:

| Pixel | RGBA | A runtime (`memoryFormat: "2BitPalette"`) |
|---|---|---|
| vuoto | `(0, 0, 0, 0)` | trasparente (alpha 0) |
| riempimento | `(255, 255, 255, 255)` | `palette[i]` = colore del testo (bianco/nero/giallo/Oxford, D7) |
| contorno | `(0, 0, 0, 255)` | `palette[i]` = alone, oppure `GColorClear` per spegnerlo |

Il contorno è la **dilatazione 8-connessa di 1 px** della maschera meno la maschera stessa, ritagliata
alla cella e alla strip: l'alone costa **un solo blit** (`GCompOpSet`), non gli 8 `draw_text` sfalsati
di S1. L'SDK genera la palette del `.pbi` in ordine arbitrario: `ui_digits.c` riconosce i due indici
dal colore (`0xFF` bianco, `0xC0` nero), non dalla posizione.

### Rasterizzazione e scelta della pixel size

Come `fontgen.py` dell'SDK: `face.load_char(c, FT_LOAD_RENDER | FT_LOAD_TARGET_MONO |
FT_LOAD_MONOCHROME)`, bitmap monocromatica (`pixel_mode == 1`, MSB-first, `pitch` in byte).

- **`px`**: la più grande pixel size per cui `max(altezza dell'inchiostro di '0'..'9') ≤ strip_h − 2`.
  La ricerca sale da 1 e si ferma alla prima `px` che sfora, così il risultato non dipende da
  eventuali non monotonie del hinting oltre il limite. `set_pixel_sizes(0, px)` **non** dà cifre alte
  `px` (dipende da unitsPerEm e dal disegno del font): la `px` trovata è molto più grande
  dell'altezza ottenuta — in taglia A su emery 74 per Anton, 92 per Bebas, 84 per Barlow (dopo
  `--fit-width`) — e finisce nel campo diagnostico `px`. I valori esatti sono nella tabella
  "Valori misurati". Il campo `px` dell'header è `uint8_t`: se la ricerca superasse 255 il tool si
  ferma con un errore invece di far troncare il valore al compilatore (oggi il massimo è 131).
- **Baseline comune**: `baseline_row = 1 + max(bitmap_top delle cifre)`, ogni glifo va a
  `y0 = baseline_row − bitmap_top`. La cifra più alta occupa quindi le righe `1..digit_h`.
  Il `':'` resta dove lo mette il font rispetto alla baseline; se il suo contorno uscirebbe dalla
  strip viene alzato (o abbassato) del minimo necessario, con segnalazione.
- **Glifi considerati**: i vincoli di larghezza guardano solo i glifi effettivamente generati,
  quindi con `--no-colon-b` la taglia B li valuta sulle sole cifre. Con i tre font attuali il `':'`
  non è mai il glifo più largo, perciò nessuna `px` cambia (verificato: `--check --fit-width` e
  `--check --fit-width --no-colon-b` danno le stesse `px` e gli stessi `digit_h`).
- **Orizzontale**: `x0 = k*cell_w + (cell_w − (bw + 2)) // 2 + 1` con `bw = bitmap.width`:
  inchiostro centrato nella cella con 1 px libero per il contorno. Se `bw + 2 > cell_w` il glifo non
  ci sta ed è un **errore** (uscita 1), a meno di `--fit-width`. Con `--pack` il disegno resta
  questo — la compattazione arriva **dopo**, e i vincoli di larghezza (`pick_px`, `--fit-width`)
  continuano a guardare `cell_w`, cioè il passo del layout. Con `--fit-width` la ricerca della
  `px` aggiunge, nella sola taglia A, anche il vincolo `bw(':') + 2 ≤ colon_cell` (16 su emery, 12 su
  flint): la cella dei due punti è più stretta di `cell_w`, quindi un `':'` largo di un font futuro
  fa scendere la `px` invece di sbordare sulle cifre. Con i tre font attuali non è vincolante
  (`':'` 15/12/15 px su emery A, 10/9/12 su flint A) e nessuna `px` cambia.

### Metriche generate (`digit_metrics.h`)

```c
#define DIGITS_GLYPHS 11
typedef struct { uint16_t x; uint8_t w; } DigitInk;      /* inchiostro, contorno compreso */
typedef struct {
  uint16_t strip_w, strip_h;
  uint8_t  cell_w, digit_h, px;   /* con --pack cell_w = passo della griglia del layout */
  DigitInk ink[DIGITS_GLYPHS];                            /* '0'..'9', ':' */
} DigitStripMetrics;
static const DigitStripMetrics DIGITS_METRICS[3][2];      /* [font][taglia], #if PBL_COLOR / #else */
static const uint32_t         DIGITS_RESOURCE_IDS[3][2];  /* RESOURCE_ID_DIGITS_<FONT>_<TAGLIA> */
```

`ink[k].x` è la prima colonna del glifo con inchiostro **o** contorno, `ink[k].w` la larghezza
totale (contorno compreso): sono i due valori della sub-bitmap. Senza `--pack` è la prima colonna
piena dentro la cella `k`; con `--pack` è l'offset progressivo (`ink[0].x == 0`, poi la somma
delle larghezze precedenti). Indici: font 0 Anton, 1 Bebas Neue, 2 Barlow Condensed Bold;
taglia 0 = A, 1 = B.

Il controllo di sintassi su host dell'header (compila con
`gcc -std=c99 -Wall -Wextra -Werror`, con e senza `-DPBL_COLOR`, definendo i sei
`RESOURCE_ID_DIGITS_*` che sull'orologio genera l'SDK) verifica anche che gli offset siano
progressivi e adiacenti e che `cell_w` valga 40/64 su emery e 28/48 su flint.

`DIGITS_GLYPHS` resta **11** anche con `--no-colon-b`: nella taglia B la voce del `':'`
(`ink[DIGITS_GLYPH_COLON]`) vale `{ 0, 0 }`, cioè **glifo assente** — `ui_digits.c` salta i glifi
con `w == 0` (nessuna sub-bitmap, `glyph[g] = NULL`; `ui_digits_draw` non disegna,
`ui_digits_ink_width` ritorna 0). Il controllo `b.size.w == m->strip_w` al caricamento vale come
prima ed è quello che accorge di un PNG rigenerato senza l'opzione (o viceversa).

`digit_h` è l'**altezza reale del riempimento**: le cifre occupano le righe `1..digit_h` della
strip, quindi il loro ultimo pixel di riempimento sta a `y + digit_h` quando la strip è disegnata
a `y` (`ui_time.c` ci allinea la base di AM/PM, §3.1). Vale `strip_h − 2` ovunque **tranne** dove
`--fit-width` ha dovuto abbassare la `px`: Barlow A 61 (emery) e 40 (flint), Barlow B 93 (emery).
Le righe utili restano ricavabili da `strip_h − 2`; la perdita è anche nel commento della voce
(`inchiostro 61 px su 66`) e nel blocco "Segnalazioni della generazione" in testa all'header.

Valori misurati (30/08/2026, `--check --fit-width --no-colon-b --pack`; larghezze **contorno
compreso**; `—` = glifo non generato). `px`, `digit_h` e le larghezze degli inchiostri sono gli
stessi di S3: né `--no-colon-b` né `--pack` toccano la rasterizzazione — la prima toglie un
glifo, la seconda sposta i glifi.

| font | piatt. | taglia | px | `digit_h` / righe utili | w max cifre | w `':'` | Σ ink | `strip_w` prima → dopo |
|---|---|---|---|---|---|---|---|---|
| anton | emery | A | 74 | 66 / 66 | 37 | 15 | 359 | 440 → **360** |
| anton | emery | B | 107 | 94 / 94 | 53 | — | 489 | 640 → **492** |
| anton | flint | A | 49 | 42 / 42 | 26 | 10 | 246 | 308 → **248** |
| anton | flint | B | 70 | 62 / 62 | 35 | — | 326 | 480 → **328** |
| bebas | emery | A | 92 | 66 / 66 | 37 | 12 | 332 | 440 → **332** |
| bebas | emery | B | 131 | 94 / 94 | 51 | — | 448 | 640 → **448** |
| bebas | flint | A | 58 | 42 / 42 | 23 | 9 | 216 | 308 → **216** |
| bebas | flint | B | 86 | 62 / 62 | 34 | — | 300 | 480 → **300** |
| barlow | emery | A | 84 | **61** / 66 | 40 | 15 | 350 | 440 → **352** |
| barlow | emery | B | 130 | 93 / 94 | 61 | — | 512 | 640 → **512** |
| barlow | flint | A | 58 | **40** / 42 | 28 | 12 | 249 | 308 → **252** |
| barlow | flint | B | 86 | 62 / 62 | 41 | — | 343 | 480 → **344** |

`strip_w = ceil(Σ ink / 4) × 4`: la coda trasparente è 0 px (Bebas ovunque, Barlow emery B) fino a
3 px (Anton emery B). Le colonne di inchiostro dei 12 PNG sono state confrontate pixel per pixel
con quelle delle strip a celle fisse (Pillow, `ink[k].x .. +w`): **identiche** in tutte e 12 le
combinazioni, con `px` e `digit_h` invariati.

### `--fit-width`: il `'4'` di Barlow Condensed Bold

Barlow Condensed Bold ha un `'4'` molto più largo delle altre cifre (42 px contro 35–37 alla `px`
che riempie la taglia A di emery). Con `cell_w = 40` non entra nemmeno senza contorno: il tool si
ferma con

```
ERRORE  barlow emery A     glifo '4' largo 42 px: 42 + 2 > cell_w 40
```

`--fit-width` aggiunge alla ricerca il vincolo `bw + 2 ≤ cell_w` e abbassa la `px` **solo** delle
combinazioni che non entrano (le altre dieci non cambiano di un byte): Barlow A scende a `px 84`
su emery (inchiostro 61 px invece di 66) e a `px 58` su flint (40 invece di 42). Le perdite di
altezza finiscono nel commento in testa a `digit_metrics.h`, insieme all'avviso sul layout 12 h.

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

Il tool confronta ogni glifo con la **sua** cella nei due layout — le cifre con `cell_w` (24 h) o
`cell_w − 2` (12 h), il `':'` sempre con `colon_cell` — e segnala chi sfora. Con i tre font attuali
sfora solo il `'4'` di Barlow, e solo in 12 h:

```
AVVISO  barlow emery A     layout 12 h (celle 38 cifre / 16 il ':'): glifi più larghi della cella: '4' 40>38
AVVISO  barlow flint A     layout 12 h (celle 26 cifre / 12 il ':'): glifi più larghi della cella: '4' 28>26
```

In 24 h nessuno sfora, e nemmeno il `':'` sfora mai (15 ≤ 16 su emery, 12 ≤ 12 su flint): l'unico
sforamento reale in 12 h è il `'4'` di Barlow Condensed Bold, 40 px su passo 38 (emery) e 28 su 26
(flint). Non è un errore: è una scelta di layout. **NOTA:** dopo il fix di `ui_time.c` i glifi più
larghi del passo ridotto ricevono l'**advance pieno** (la cella da 40 / 28 px) invece di quello
stretto, quindi il `'4'` non si sovrappone più ai vicini — l'avviso resta una segnalazione del
disallineamento fra inchiostro e passo nominale, non di una sovrapposizione.

### Costo delle strip

Formula del PBI a 2 bit/px (`memoryFormat: "2BitPalette"` + `spaceOptimization: "memory"`):

```
byte della voce nel pbpack = 12 (header) + ceil(strip_w / 4) × strip_h (pixel) + 4 (palette)
byte in heap                =              ceil(strip_w / 4) × strip_h (pixel)  + 12 GBitmap × 56 B
                                                                   (la strip + le 11 sub-bitmap)
```

Le voci di S3 (`A` e `B` a 11 celle) sono **misurate** su `build/<piatt>/app_resources.pbpack`
(tabella a 16 B per voce dopo un header di 12 B, contenuto da 0x100C) — **non** la dimensione dei
`.reso` in `build/`, che sono wrapper pickle di waf e pesano ~390 B in più a file. Tutte le altre
colonne sono **calcolate** con la formula qui sopra e vanno confermate alla prima build.

| voce nel pbpack | A, 11 celle (S3) | B, 11 celle (S3) | B, 10 celle (`--no-colon-b`) | A `--pack` (S7) | B `--pack` (S7) |
|---|---|---|---|---|---|
| emery, anton | 7.496 (mis.) | 16.912 (mis.) | 15.376 (calc.) | **6.136** (calc.) | **11.824** (calc.) |
| emery, bebas | 7.496 | 16.912 | 15.376 | **5.660** | **10.768** |
| emery, barlow | 7.496 | 16.912 | 15.376 | **6.000** | **12.304** |
| flint, anton | 3.404 (mis.) | 8.464 (mis.) | 7.696 (calc.) | **2.744** (calc.) | **5.264** (calc.) |
| flint, bebas | 3.404 | 8.464 | 7.696 | **2.392** | **4.816** |
| flint, barlow | 3.404 | 8.464 | 7.696 | **2.788** | **5.520** |

(Fino a S3 le sei voci di una piattaforma erano identiche fra i font: le celle avevano larghezza
fissa. Con `--pack` ogni font ha la sua larghezza.)

**pbpack, sei risorse** (calcolato): emery **52.692 B** (51,5 KiB) contro 68.616 con le celle fisse
a 10 celle, cioè **−15.924 B**; flint **23.524 B** (23,0 KiB) contro 33.300, cioè **−9.776 B**. Sul
budget risorse (≤ 256 KB) restano quindi ~15,5 KB liberi in più su emery.

**Heap**: in RAM è residente **una sola** strip per taglia caricata (quella del font attivo);
`--pack` toglie esattamente i byte dei pixel delle colonne vuote, perché il numero di `GBitmap`
(strip + 11 sub-bitmap) non cambia. Risparmi calcolati, per font:

| | emery A (era 7.480 B di pixel) | emery B (era 15.360) | flint A (era 3.388) | flint B (era 7.680) |
|---|---|---|---|---|
| anton | 6.120 → **−1.360** | 11.808 → **−3.552** | 2.728 → **−660** | 5.248 → **−2.432** |
| bebas | 5.644 → **−1.836** | 10.752 → **−4.608** | 2.376 → **−1.012** | 4.800 → **−2.880** |
| barlow | 5.984 → **−1.496** | 12.288 → **−3.072** | 2.772 → **−616** | 5.504 → **−2.176** |

Con il font predefinito (Anton) e il layout B — il caso critico dell'obiettivo O1 di S7, heap
libero ≥ 40 KB su emery — sono **+3.552 B** di heap libero (e altri +1.360 B quando la Quick View
tiene caricata anche la taglia A, cioè +4.912 B in totale); nel layout A sono +1.360 B. Il gate S7
misurava 39.920 B liberi dopo il primo render in layout B: con le strip compatte ci si attende
**≈ 43.472 B** (calcolato), sopra l'obiettivo. Su flint il layout B guadagna 2.432 B con Anton.

I 12 PNG passano da 29.981 B a 28.212 B in tutto, ma è la dimensione del sorgente: quello che
conta è il PBI generato dall'SDK.

---

## 11. `galleria_devserver.py` – dev server di Galleria (S5b + S6)

Sul telefono le foto e le impostazioni arrivano dalla **config page** (`Pebble.openURL` di un URL
`data:`); in **emulatore** quella strada non esiste — `pebble emu-app-config` 5.0.39 non apre pagine
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
| `--work DIR` | cartella dei `.raw6`/`.raw1`/anteprime (default: temporanea, **rimossa** all'uscita — sia con Ctrl-C sia con SIGTERM, cioè `kill`/`timeout`/`pkill`); una cartella non scrivibile è un errore che nomina `--work`, non la porta |
| `--page FILE` | serve questo HTML su `/config.html` al posto della pagina incorporata (è così che S6 proverà la config page vera); file mancante o illeggibile all'avvio = errore con messaggio. Il file viene **riletto a ogni `GET /config.html`**: in S6 basta salvare e ricaricare il browser, senza riavviare il server (cioè senza riconvertire l'album, ~300 ms per foto). Se sparisce o diventa illeggibile a server acceso si continua a servire l'ultima copia buona, con un avviso su stderr |
| `--page-dir DIR` | **config page vera (S6)**, esclusivo con `--page`: a ogni `GET /config.html` la pagina viene inlinata da `DIR` con `tools/build_config_page.py` (§13: `inline_page()`, importato pigramente dal `tools/` accanto), così si salva un file delle sorgenti e si ricarica il browser senza riavviare il server. Un errore di inlining (file mancante, `</script>` nel contenuto, pagina oltre 64 KB) è un **500** con il messaggio in chiaro nel corpo e una riga su stderr a **ogni** GET — niente «ultima copia buona», che nasconderebbe una pagina rotta proprio mentre la si scrive; gli avvisi non fatali del tool (attributi persi, ordine degli script, > 60 KB, `localStorage`) escono invece **una volta sola** per messaggio. La cartella viene riletta a ogni richiesta, ma `build_config_page.py` è importato una volta sola: modificare il **tool** richiede il riavvio del server. `DIR` inesistente o non una cartella = errore di argparse (uscita 2); `--dump-page` lo rispetta. Senza `--album` accende anche la modalità relay |
| `--relay` | **modalità relay (S6)**: nessun album sul server — `/state.json` diventa `{v:1, seq, settings?, hooks:{scenario}}`, **senza `full`**, che il PKJS applica come delta vuoto e quindi non cancella nulla. Le foto arrivano dalla config page con `POST /save` e restano nel `localStorage` del PKJS. Si accende da sé con `--page-dir` senza `--album`; **con `--album` è un errore** di riga di comando |
| `--photo-prep-args "…"` | opzioni extra per `photo_prep.py`. **Serve la forma con l'uguale** (`--photo-prep-args="--sunlight"`): senza `=`, argparse scambierebbe `--sunlight` per una propria opzione |
| `--selftest` | autotest di tutti gli endpoint, poi esce (0/1) |
| `--dump-page` | stampa su stdout la pagina di `/config.html` (quella incorporata, o il file di `--page`) ed esce **senza avviare il server**: è quello che usa `apps/galleria/test/test_devpage.js` per eseguire lo script della pagina sotto node |
| `--dump-json pool\|state` | stampa su stdout `/pool.json` o `/state.json` costruiti dalle opzioni date (`--album`, `--slots`, `--order`, `--settings`, `--scenario`) ed esce senza avviare il server; con `--album` converte le foto (in una temporanea, rimossa subito) e su stdout esce **solo il JSON** (niente righe `pool[..]`) |

Campi di `--settings` (stessi intervalli di `settings_validate()` in `apps/galleria/src/c/settings.c`;
un valore fuori intervallo è un **errore**, non viene sostituito in silenzio dal default):
`layout` 0..1, `font` 0..3, `clock_mode` 0..2, `leading_zero` 0..2, `text_color` 0..4,
`outline` 0..2, `interval_min` ∈ {0, 5, 15, 30, 60, 180, 1440}, `order` 0..1, `shake_next` 0..1,
`info_row` 0..15. Default: `30` per `interval_min`, `1` per `shake_next`, `15` per `info_row`, `0`
per tutto il resto.

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
| `GET /state.json` | **pool** (`--album`, o server nudo): payload **completo** `{v:1, full:true, seq, settings?, order, deleted:[], photos:[…], hooks:{scenario}}` — `settings` compare solo dopo `--settings` o un Save: senza, il PKJS (`album.settingsSet`) non sovrascrive le impostazioni dell'orologio. **Relay** (`--relay`, o `--page-dir` senza `--album`): `{v:1, seq, settings?, hooks:{scenario}}`, **senza `full`** e senza `photos`/`order`/`deleted`, così il PKJS lo applica come delta vuoto e non elimina nessuno slot |
| `GET /save.json` | quello che il PKJS legge dopo un Save. Prima di ogni Save — e in modalità pool — è l'**alias** di `/state.json`, come in S5b; dopo un Save della **config page vera** è il payload che la pagina ha mandato, con `seq` e `hooks` aggiunti e **senza `full`** (il PKJS lo applica come delta). Un Save della pagina di prova azzera il payload tenuto da parte e riporta `/save.json` allo stato del server |
| `GET /pool.json` | `{pool:[{i, name, photo_id, crc6, crc1, preview, preview_flint}…], slots_max:12, settings_defaults:{layout:0, …, interval_min:30, shake_next:1, info_row:15}}` — `settings_defaults` sono i 10 default di `settings_set_defaults()` (unica fonte: `SETTINGS_SPEC`): la pagina li usa quando `state.json` non porta `settings` |
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
⚠️ **TODO prima di S6** (non è una libertà del tool: è una riga di specifica rimasta indietro):
`docs/design/galleria.md` §6 riporta ancora `photo_id = crc32(raw6) | 1`, che per ~metà delle foto
(bit 31 acceso) dà un id **diverso** da quello del dev server. Se la config page vera di S6 seguisse
la riga del design, la stessa foto avrebbe due id e l'orologio non la riconoscerebbe più
(`sync_proto.c`: ripresa e "già committato" confrontano `photo_id`) → 34 KB ritrasmessi. Va allineata
la riga del design a `crc32(raw6) & 0x7FFFFFFF` (o cambiate insieme tool, `album.js` e design).
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
| `settings` | **tutti e 10** i campi, negli intervalli di `settings_validate()` |
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

Con la **config page vera** (`--page-dir` + relay) cambiano i due estremi: la pagina manda le foto
per intero e il PKJS applica un **delta**.

```
pebble emu-app-config              →  browser:  /config.html?return_to=http://localhost:<porta>/close?#<stato base64url>
pagina (foto, ordine, impostazioni)→  POST /save  (corpo con `deleted`, fino a ~600 KB)  →  {"ok":true,"seq":N}
pagina                             →  location.href = return_to + encodeURIComponent('{"v":1,"dev":true,"seq":N}')
pebble-tool                        →  Pebble.webviewclosed con quel testo
PKJS (dev)                         →  GET /save.json  →  album.applyPayload(payload, {full:false})  →  sync.resync()
```

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
Il primo **Salva** manda tutti e 10 i campi: da lì `settings` compare in `state.json` (`settings_set`)
e il dev server diventa l'**autorità** delle impostazioni, come il telefono dopo il primo Save
(design §5.1) — quelle eventualmente scritte sull'orologio (p.es. con `GALLERIA_DEBUG_SETTINGS_SAVE`)
vengono sovrascritte al `HELLO` successivo. «Annulla» non le tocca. La pagina costruisce i campi una
volta sola (`dataset.built`, marcato **a costruzione finita**: un errore a metà non blocca il
re-render né lascia campi doppi) e ha un fallback per campo sui default. Elementi con `id` (per i
test): `head`, `err`, `msg`, `pool`, `order`, `settings` (i campi sono `s_<chiave>`: `s_layout`,
`s_font`, `s_clock_mode`, `s_leading_zero`, `s_text_color`, `s_outline`, `s_interval_min`,
`s_order`, `s_shake_next`, `s_info_row`), `scenario`, `save`, `cancel`.

### Autotest (`--selftest`)

Genera tre PNG sintetici 400×456 (Pillow, colori diversi), li converte con `photo_prep.py`, avvia il
server su una porta effimera in un thread e con `http.client` esercita **ogni** endpoint: struttura di
`state.json` (due voci per slot, CRC senza segno, `url` coerenti), `pool.json`, foto grezze e
`?b64=1` (decodifica → stessa lunghezza e stesso CRC32), anteprime PNG (firma `\x89PNG`), 404 per
slot vuoto/percorso ignoto, `OPTIONS` (204 senza `Content-Length`), `POST` validi (riordino,
rimozione di una foto, impostazioni parziali, scenario → `seq` cresce e `state.json` riflette tutto)
e `POST` non validi (slot doppio, `src` fuori pool, impostazioni fuori intervallo, campo
sconosciuto in cima / in `settings` / in una voce di `photos`, `v` sbagliata o `true`, corpo non
JSON, `chunked` → 400/411 e **stato invariato**), il corpo troncato (`Content-Length` > byte
inviati → 408 e server ancora vivo), la 501 di un metodo non gestito **con la sua riga di log** e la
rilettura di `--page` a ogni richiesta (file modificato → nuovo contenuto; file rimosso → ultima
copia buona + avviso). Copre anche gli errori di riga di comando (`--page` su una directory,
`--slots 0,,1`, `--order 0,0`, `--port` fuori intervallo o non numerica, `--work` non scrivibile,
`--dump-json` con un valore ignoto: messaggio, mai un traceback) e, con un sottoprocesso vero, che
**SIGTERM** rimuova la cartella temporanea.

Casi aggiunti con i fix F13/F15 del code review (29/08/2026): `pool.json.settings_defaults` (= i 10
default di `SETTINGS_SPEC`) e il primo Save senza `--settings` che fa comparire `settings` in
`state.json`; la **keep-alive** — su un socket grezzo, `POST /save` con `Content-Length`
`9000000`/`abc`/`-1` e `POST /nope` seguiti da una `GET` nello stesso invio → una sola risposta
400/404 con `Connection: close` e socket chiuso (mai un 501 dal corpo residuo); con `http.client`
riusato la `GET` dopo il 400 è servita (200 su un socket nuovo); 411 e 408 dichiarano
`Connection: close`; `--dump-page` (anche con `--page`) e `--dump-json pool|state` in un
sottoprocesso (solo JSON su stdout, anche con `--album`); e — se `node` è nel `PATH` — la **pagina
incorporata eseguita davvero** (script della pagina sotto `vm` con un DOM finto) in tre varianti:
`state.json` senza `settings`, con `settings`, senza `return_to`. Per ognuna: nessuna eccezione al
caricamento, 10 campi con i default o con i valori di `state.json`, 6 scenari, secondo `render()`
senza doppioni e con il valore modificato conservato, Salva → **un solo** `POST /save` con 10
impostazioni + `order` + `photos` + `scenario` e redirect a `return_to` + token
`{"v":1,"dev":true,"seq":N}` (o «salvato (seq N)» senza `return_to`), Annulla → `return_to` senza
query / `location.reload()`. `node` **non** è una dipendenza dell'SDK: se manca lo dice e salta
(27 casi in meno); la stessa verifica, più estesa, sta in `apps/galleria/test/test_devpage.js`.
Casi **S6**, su un *secondo* server in modalità relay (così quello di S5b resta com'è):
`/state.json` = `{v, seq, hooks}` senza `full`/`photos`/`order`/`deleted` e `/save.json` che gli fa
da alias finché non arriva un Save; `--dump-json state --relay` (anche con `--settings`) e
`--page-dir` senza `--album` che accende la relay; gli errori di riga di comando `--relay` con
`--album`, `--page` con `--page-dir`, `--page-dir` su una cartella inesistente o su un file (uscita
2); `--page-dir` che inlina davvero il CSS e i JS di una cartella temporanea, il tag
`data-optional` che sparisce, il **500** con il messaggio quando un file delle sorgenti viene
rimosso, e `--dump-page --page-dir`; il `POST` della config page vera valido (una foto, poi dodici)
con `/save.json` che lo rende senza `full`, e **una regola per volta** violata (CRC dichiarato
diverso da quello calcolato, `len` sbagliato, `data` troppo corta / fuori alfabeto / con padding,
`thumb` di 6.001 caratteri, `name` di 65, slot ripetuto, `deleted` con lo slot 12, `v` `2`/`true`/
`1.0`, campo sconosciuto in cima o in una voce) con `/save.json` **invariato**; il corpo con
`{v, settings, order}` e senza `deleted` respinto con 400; il Save della pagina di prova che riporta
`/save.json` allo stato del pool; e l'avviso in due righe del server nudo.

Stampa `devserver selftest: N ok, M falliti` (oggi **230** con `node`; M7: +6 casi sui surrogati spaiati e su `ensure_ascii`) ed esce 0/1; gira in
circa 2,6 s. Lo esegue anche `make -C apps/galleria/test` (target `devtest`), come `pyselftest` per
`photo_prep.py` (§9).

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
`page.css` e, in quest'ordine, `pipeline.js`, `page_core.js`, `previews.js` (con
`data-optional="1"`, §14) e `page.js`.

**Errori** (uscita 1, messaggio in italiano, mai un traceback): cartella o `page.html` mancanti; file
inlinato mancante — a meno di `data-optional="1"`, e allora il tag sparisce insieme alla sua riga;
contenuto che chiuderebbe il **suo** tag (`</script` in un `.js`, `</style` in un `.css`,
riconosciuti anche scritti `</ SCRIPT >`); in un `.js`, un `<!--` seguito da un `<script` (il parser
HTML entra in «script data double escaped» e il `</script>` di chiusura non chiude più il tag); un
tag di apertura con una virgoletta non chiusa; una sorgente che non è UTF-8; HTML inlinato oltre
**65.536 B**. L'incrocio invece è **innocuo e ammesso**: un `</style>` dentro un `.js` e un
`</script>` dentro un `.css` in HTML non chiudono niente.

**Avvisi** non fatali (su stderr, la generazione prosegue): attributi persi; ordine degli script
diverso da `pipeline → page_core → previews → page`; HTML oltre l'obiettivo di 60 KB; riferimenti a
risorse esterne rimasti nella pagina; `@import` nel CSS; uso di `localStorage`/`sessionStorage`/
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
un commento aperto a metà riga non viene toccato. Con le sorgenti del 30/08/2026:

| | HTML inlinato | `config_page.js` |
|---|---|---|
| default (strip) | **58.659 B** (57,3 KB, S7: 5 migliorie della pagina; 58.141 B dopo la revisione S6) | 60.515 B |
| `--no-strip` | 65.385 B (63,9 KB, con l'avviso dei 60 KB) | 67.349 B |

Il tetto duro è 65.536 B (64 KB): senza lo strip la pagina del 30/08 (S6) ci stava per 151 B; con le migliorie di S7 non ci starebbe più (lo strip è obbligatorio).

### Il modulo generato, e la riproducibilità

```js
/* GENERATO da tools/build_config_page.py (S6): non modificare a mano. Sorgenti: src/pkjs/config/. Dimensione HTML: 54540 B. */
module.exports = "…";   // json.dumps(html, ensure_ascii=True): solo ASCII, tutto su una riga
```

Nessuna data, nessun percorso assoluto: BOM e CRLF delle sorgenti vengono normalizzati e la fine
riga è sempre `\n`, quindi due esecuzioni danno gli **stessi byte**. È ciò che rende sensato
`--check`.

⚠️ **`make -C apps/galleria/test pagecheck` prima di ogni `pebble build`: non è facoltativo.** Se
l'inlining fallisce (per esempio perché la pagina supera i 64 KB) il tool esce 1 ma **non tocca** il
`config_page.js` già sul disco, e lo dice a voce alta: un `pebble build` lanciato da solo
imbarcherebbe in silenzio la config page **precedente**. Il target `pagecheck` (dentro `make all`)
esegue `build_config_page.py --check`, `test/gen_page_fixture.py --check` e
`gen_font_previews.py --check` (§14).

### Autotest (`--selftest`)

Su una cartella temporanea: CSS e JS inlinati davvero, `<link>` non-stylesheet e `<script>` già
inline lasciati com'erano, commenti HTML intatti, ordine dei tre script, `data-optional` (tag e riga
rimossi, oppure file inlinato), `</script>` nel contenuto e cartella inesistente = errori,
avvisi di lint e di attributi persi, il tetto di 64 KB e l'avviso a 60, strip (righe di commento
via, stringhe e commenti a metà riga intatti, idempotenza, `--no-strip` che non tocca niente),
riproducibilità (due esecuzioni identiche, CRLF+BOM = LF), il modulo (solo ASCII, round trip JSON,
nessuna data) e la CLI: `--check` nei tre casi, e soprattutto che dopo un fallimento il file
precedente **resti intatto** con l'avviso. Stampa `build_config_page selftest: N ok, M falliti` —
oggi **83** controlli in meno di 0,1 s — ed esce 0/1.

---

## 14. `gen_font_previews.py` – anteprime dei font per la config page (S6)

Rasterizza `12:34` con i tre TTF di `apps/galleria/resources/fonts/` (Anton Regular, Bebas Neue
Regular, Barlow Condensed Bold) e scrive `apps/galleria/src/pkjs/config/previews.js`, che
`build_config_page.py` (§13) inlina nella pagina: nel browser `window.GalPreviews = {anton, bebas,
barlow}`, in node `module.exports`. Le chiavi sono gli **indici del campo `font`** delle
impostazioni — `anton` = 0, `bebas` = 1, `barlow` = 2; il font **3** (LECO, di sistema) non ha
anteprima, perché esiste solo nel layout A.

Dipendenza: **Pillow** sul Python di sistema (niente freetype-py, a differenza di `gen_digits.py`,
§10).

Ogni campione è un PNG **1 bit** bianco su nero (soglia 128, nessun dithering), ritagliato
sull'inchiostro e inlinato come data-URL. Per ogni font si cerca la pixel size **più grande** la cui
altezza d'inchiostro sta nei `--height` px (default 28) — stessa logica di `gen_digits.py` — così i
tre campioni si confrontano a occhio nella pagina. Se il file sfora `--max-bytes` l'altezza scende
di 2 px per volta e la cosa viene stampata; a 28 px non è servito.

```bash
python3 tools/gen_font_previews.py                        # rigenera previews.js
python3 tools/gen_font_previews.py --check                # 0 se è aggiornato (è in `make pagecheck`)
python3 tools/gen_font_previews.py --png-dir /tmp/prev    # salva anche i tre PNG
```

| Opzione | Effetto |
|---|---|
| `--fonts-dir DIR` | cartella dei TTF (default `apps/galleria/resources/fonts`) |
| `--out FILE` | `previews.js` da scrivere (default `apps/galleria/src/pkjs/config/previews.js`) |
| `--text T` | stringa da rasterizzare (default `12:34`) |
| `--height N` | altezza dell'**inchiostro** in px (default 28) |
| `--max-bytes N` | tetto del file generato (default 4096) |
| `--png-dir DIR` | salva anche i tre PNG in questa cartella |
| `--check` | verifica che `--out` sia aggiornato (uscita 1 se no) |

Misure del 30/08/2026 (`--height 28`):

| chiave | font (indice `font`) | px | PNG | byte | base64 |
|---|---|---|---|---|---|
| `anton` | Anton Regular (0) | 32 | 66×28 | 213 | 284 car. |
| `bebas` | Bebas Neue Regular (1) | 39 | 66×28 | 217 | 292 car. |
| `barlow` | Barlow Condensed Bold (2) | 40 | 76×28 | 236 | 316 car. |

`previews.js` pesa **1.722 B** sui 4.096 ammessi (v2: rasterizzazione a 4× + LANCZOS + soglia 100, `--selftest` 29 controlli; in pagina l'immagine va mostrata a dimensione naturale — `.fontprev` con `box-sizing: content-box` — altrimenti il ridimensionamento nearest la sgrana). È **generato**, e la prima riga lo dice («GENERATO
da tools/gen_font_previews.py (S6): non modificare a mano»): si rigenera, non si corregge a mano.
Deterministico — nessuna data e nessun percorso finiscono nell'output (Pillow non scrive il chunk
`tIME`) — quindi due esecuzioni danno gli stessi byte, ed è ciò che rende affidabile `--check`
dentro `make -C apps/galleria/test pagecheck`. In `page.html` il tag è
`<script src="previews.js" data-optional="1">`: se il file manca l'inlining non fallisce e la pagina
si costruisce lo stesso, senza anteprime.

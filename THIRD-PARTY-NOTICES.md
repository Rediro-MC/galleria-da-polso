# Avvisi su materiale di terzi (third-party notices)

Il **codice** di questo repository è distribuito sotto licenza **MIT**: il testo sta in
[`LICENSE`](LICENSE) («Copyright (c) 2026 Rediro»).

Questo file elenca il materiale **di terzi** che il repository ridistribuisce — codice portato o
copiato, immagini, font, foto — con la licenza sotto cui si trova, l'attribuzione richiesta e i file
interessati. I testi di licenza sono riportati **in originale** (inglese): tradurli li
invaliderebbe.

Le affermazioni qui sotto sono state verificate leggendo le intestazioni dei file, i README di
provenienza (`tools/README.md`, `apps/galleria/resources/fonts/README.md`,
`apps/galleria/resources/photos/README.md`) e i file di licenza dei pacchetti di sistema.

**Indice**

1. [Codice di Pebble Technology — MIT](#1-codice-di-pebble-technology--mit)
2. [Palette a 64 colori — Apache-2.0](#2-palette-a-64-colori--apache-20)
3. [Font delle cifre — SIL OFL 1.1](#3-font-delle-cifre--sil-ofl-11)
4. [Foto demo dell'app — CC0 1.0](#4-foto-demo-dellapp--cc0-10)
5. [Screenshot storici e foto di prova — CC-BY-SA-4.0](#5-screenshot-storici-e-foto-di-prova--cc-by-sa-40)
6. [SDK Pebble, PebbleOS, pebble-tool](#6-sdk-pebble-pebbleos-pebble-tool)

---

## 1. Codice di Pebble Technology — MIT

### 1.1 Strumenti in `tools/`

Quattro file derivano da codice pubblicato da Pebble Technology; tutti e quattro portano in testa
la riga `Copyright (c) 2015 Pebble Technology`.

| File nel repository | Che cos'è |
|---|---|
| `tools/upstream-py2/svg2pdc.py` | Originale Python 2 **non modificato**, scaricato da `https://raw.githubusercontent.com/pebble-examples/cards-example/master/tools/svg2pdc.py` (`tools/README.md` §3 e §5) |
| `tools/upstream-py2/pebble_image_routines.py` | Originale Python 2 **non modificato** dello stesso progetto (`tools/README.md` §5) |
| `tools/svg2pdc.py` | **Opera derivata**: port a Python 3 (2026) dell'originale qui sopra, con `pebble_image_routines` incorporato; l'elenco delle modifiche è nel commento in testa al file e in `tools/README.md` §3 |
| `tools/pebble_image_routines.py` | **Opera derivata**: port a Python 3 (2026) del modulo colore (`xrange` → `range`, `/` → `//`); vedi `tools/README.md` §4 |

I due port a Python 3 riportano in testa, oltre al copyright originale, la *permission notice* MIT
richiesta dalla licenza; le modifiche del port sono distribuite sotto la stessa licenza MIT di
[`LICENSE`](LICENSE).

### 1.2 Scheletri generati dai template di `pebble-tool` 5.0.40

Le app in `apps/` sono nate da `pebble new-project`. Alcuni file sono ancora, byte per byte, i
template di `pebble-tool` 5.0.40 (pacchetto Python `pebble-tool`, `License-Expression: MIT`, il cui
file `LICENSE` riporta «The MIT License (MIT) — Copyright (c) 2015 Pebble Technology»); i template
si trovano in `pebble_tool/sdk/templates/app/` dentro il pacchetto installato.

**Nessuno di questi file porta un'intestazione di copyright** (verificato leggendo le prime 10
righe di ciascuno): l'attribuzione è dovuta lo stesso ed è questa sezione.

Identici al template (`cmp` senza differenze):

| File nel repository | Template |
|---|---|
| `apps/galleria/.cursor/rules/pebble.mdc` | `templates/app/ai.md` |
| `apps/hello-emery/.cursor/rules/pebble.mdc` | `templates/app/ai.md` |
| `apps/hello-emery/CLAUDE.md` | `templates/app/ai.md` |
| `apps/hello-emery/wscript` | `templates/app/wscript` |
| `apps/heapprobe/wscript` | `templates/app/wscript` |
| `apps/hello-emery/src/c/hello-emery.c` | `templates/app/main.c` |

Derivati dal template con modifiche:

| File nel repository | Template | Modifiche |
|---|---|---|
| `apps/galleria/wscript` | `templates/app/wscript` | +7 righe per le define di test `GALLERIA_DEFINES` |
| `apps/hello-emery/README.md` | `templates/app/README.md` | solo il titolo (`${display_name}` → `hello-emery`) |
| `apps/heapprobe/README.md` | `templates/app/README.md` | solo il titolo (`${display_name}` → `heapprobe`) |
| `apps/galleria/package.json`, `apps/hello-emery/package.json`, `apps/heapprobe/package.json` | `templates/app/package.json` | metadati dell'app (nome, UUID, piattaforme, risorse, message keys) |

`apps/galleria/CLAUDE.md` **non** deriva dal template (è scritto per l'app).

### 1.3 Testo della licenza MIT (originale)

Vale per tutti i file delle sezioni 1.1 e 1.2:

```
The MIT License (MIT)

Copyright (c) 2015 Pebble Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. Palette a 64 colori — Apache-2.0

File: `tools/palette/pebble_colors_64.gif`, `tools/palette/pebble_colors_64.act`,
`tools/palette/pebble_colors_64.pal`.

Provenienza: repository **`coredevices/sdk-docs`** (i sorgenti del sito developer.repebble.com),
cartella `source/assets/other/`. Verificato con `md5sum`: i tre file nel repository sono
**identici byte per byte** agli originali — **non sono stati modificati**.

- Fonte: <https://github.com/coredevices/sdk-docs> (percorso `source/assets/other/pebble_colors_64.{gif,act,pal}`)
- Licenza: **Apache License 2.0** — il file `LICENSE` di quel repository è il testo Apache-2.0
  standard, senza un titolare indicato; le intestazioni dei sorgenti dello stesso repository
  riportano «Copyright 2025 Google LLC». Non c'è un file `NOTICE`.
- Testo della licenza: <https://www.apache.org/licenses/LICENSE-2.0>

Avviso richiesto dalla licenza (originale):

```
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## 3. Font delle cifre — SIL OFL 1.1

Cinque font in `apps/galleria/resources/fonts/`, tutti sotto **SIL Open Font License 1.1**. Il
**testo integrale** di ogni licenza è nel repository, accanto al font (file `OFL-*.txt`); qui sotto
la riga di copyright così come compare in testa a ciascuno di quei file.

| Font | File TTF | Testo della licenza | Copyright (dalla prima riga del file) |
|---|---|---|---|
| Anton | `Anton-Regular.ttf` | `OFL-Anton.txt` | `Copyright 2020 The Anton Project Authors (https://github.com/googlefonts/AntonFont.git)` |
| Bebas Neue | `BebasNeue-Regular.ttf` | `OFL-BebasNeue.txt` | `Copyright © 2010 by Dharma Type.` |
| Barlow Condensed | `BarlowCondensed-Bold.ttf` | `OFL-BarlowCondensed.txt` | `Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)` |
| Francois One | `FrancoisOne-Regular.ttf` | `OFL-FrancoisOne.txt` | `Copyright 2011 The Francois One Project Authors (contact@sansoxygen.com)` |
| Staatliches | `Staatliches-Regular.ttf` | `OFL-Staatliches.txt` | `Copyright 2018 The Staatliches Authors (https://github.com/googlefonts/staatliches)` |

Provenienza (URL, blob sha git e sha256 di ogni file) e verifica: `apps/galleria/resources/fonts/README.md`.

**Le strip di cifre in `apps/galleria/resources/digits/*.png` sono immagini generate da questi
font** con `tools/gen_digits.py` (rasterizzazione dei glifi `0`–`9` e `:`), non sono font.

**I `.ttf` non entrano nell'app**: `apps/galleria/package.json` dichiara 14 risorse — 10 `bitmap`
(le strip PNG) e 4 `raw` (le foto demo), nessuna di tipo font. I TTF restano nel repository solo
come sorgente riproducibile della generazione.

---

## 4. Foto demo dell'app — CC0 1.0

Le due foto demo incluse nell'app (`apps/galleria/resources/photos/demo_1.raw6`, `demo_1.raw1`,
`demo_2.raw6`, `demo_2.raw1`) derivano da due immagini in **CC0 1.0** (Creative Commons Zero:
rinuncia al diritto d'autore, **nessun obbligo di attribuzione**) prese da Wikimedia Commons:

| | `demo_1` (scura) | `demo_2` (chiara) |
|---|---|---|
| Titolo | *Northern Lights at Lauklines Norway* | *Bryce Canyon After Snow (Unsplash)* |
| Autore | Sebastian Kowalski | Emanuel Hahn (Unsplash: `hahnbo`) |
| Pagina `File:` | <https://commons.wikimedia.org/wiki/File:Northern_Lights_at_Lauklines_Norway.jpg> | <https://commons.wikimedia.org/wiki/File:Bryce_Canyon_After_Snow_(Unsplash).jpg> |
| Licenza | CC0 1.0 — wikitext `{{self\|cc-zero}}` (opera propria) | CC0 1.0 su Commons — template `{{Unsplash}}`, revisione umana conclusa il 2018-07-02 |

Testo della licenza: <https://creativecommons.org/publicdomain/zero/1.0/>

I crediti agli autori sono comunque riportati nel listing dello store per correttezza, pur non
essendo obbligatori. Dettagli, comandi di preparazione, CRC32 e verifiche in
`apps/galleria/resources/photos/README.md`.

---

## 5. Screenshot storici e foto di prova — CC-BY-SA-4.0

**Nessuno di questi file entra nell'app pubblicata.** Dal **05/09/2026** l'app e gli asset dello
store usano soltanto le foto CC0 della sezione 4. Restano però nel repository — e nella **storia
git** — immagini di lavoro in cui compaiono, come foto **di prova**, wallpaper del pacchetto Debian/
Ubuntu **`ubuntu-wallpapers`**, che sono sotto **CC-BY-SA-4.0**.

### File interessati

- Gli screenshot `docs/design/galleria/{s2,s3,s4,s5b,s6,s7,s8perf,s8stile,rev19}_*.png` in cui si
  vede una foto di prova (foto a schermo intero o miniature nella config page).
  **Non** rientrano: gli `s1_*` (nessuna foto), gli `s5a_*` e `s5b_*_fixture_*` (figura di prova
  sintetica a barre colorate), gli `s9_*` (foto demo CC0), le schermate della config page senza
  miniature (per esempio `rev19_page_slow_4foto.png`, che mostra solo i nomi dei file) e
  `rev19_watch_francois_3d.png` (fotografia personale dell'autore) è stato **rimosso dal repository e dalla sua storia** il 05/09/2026.
- Nella **storia git**: le versioni precedenti di `apps/galleria/resources/photos/demo_*` e di
  `apps/galleria/store/*.png` (icone e screenshot dello store, generati dagli screenshot del gate
  S7 — così dice la versione storica di `apps/galleria/store/README.md`).

### Attribuzione

I wallpaper riconosciuti nelle immagini di prova, tutti nella stessa voce del file
`/usr/share/doc/ubuntu-wallpapers/copyright` («`Copyright: 2016-2025 Canonical Ltd`» più l'elenco
degli autori, «`License: CC-BY-SA-4.0`»):

| Wallpaper | Autore (dal nome del file e dall'elenco autori) | Dove compare |
|---|---|---|
| `mizuno-as-Big_Dipper.jpg` | Hajime Mizuno | foto demo `demo_1` storica; foto di prova `dark_portrait.jpg` (ritaglio ruotato) |
| `moskalenko-v-Snowy_Ubuntu_Light.webp` | Vladimir Moskalenko | foto demo `demo_2` storica; foto di prova `light_landscape.jpg` |
| `osselo-Ask_a_friend.jpg` | osselo | foto di prova `mid_landscape.jpg` |
| `mendhak-Bluebells_Suspended_In_Time.jpg` | mendhak | foto di prova `big_12mp.jpg` |
| `mendhak-Red_Acer.jpg` | mendhak | foto di prova `red_exif6.jpg` |
| `jdituicha-raccoon1-light.jpg` | `jdituicha` (il file `copyright` non associa i nomi ai singoli file) | foto di prova `tiny.jpg` |

Attribuzione da usare: **© 2016-2025 Canonical Ltd e gli autori dei wallpaper `ubuntu-wallpapers`
(Hajime Mizuno, Vladimir Moskalenko, osselo, mendhak, jdituicha), CC-BY-SA-4.0**.

### Conseguenza sulla licenza

Poiché sono opere derivate di immagini CC-BY-SA-4.0, **quei file immagine** (gli screenshot elencati
qui sopra e le versioni storiche delle foto demo e degli asset dello store) **sono disponibili sotto
CC-BY-SA-4.0**, non sotto la MIT di [`LICENSE`](LICENSE), con l'attribuzione appena indicata.

Testo della licenza: <https://creativecommons.org/licenses/by-sa/4.0/>

### Marchio Ubuntu

In alcuni di quei wallpaper (per esempio `moskalenko-v-Snowy_Ubuntu_Light.webp` e
`osselo-Ask_a_friend.jpg`) è visibile il **logo Ubuntu**, marchio di **Canonical Ltd**. Compare
soltanto come **contenuto della foto di prova**: non c'è alcuna affiliazione, sponsorizzazione o
approvazione da parte di Canonical, e il logo non è usato come marchio di questo progetto.

---

## 6. SDK Pebble, PebbleOS, pebble-tool

**Nel repository non c'è nessun file dell'SDK Pebble** (né header, né librerie, né toolchain):
l'SDK 4.33.1 viene installato a parte da `tools/setup-env.sh` e resta fuori dall'albero dei
sorgenti. Anche il clone di riferimento `tools/sdk-docs/` è escluso da `.gitignore`. L'unico file
che *nomina* l'SDK è `apps/galleria/test/shim/pebble.h`, uno **shim scritto a mano** che riproduce
le firme necessarie ai test su host, non una copia dell'header dell'SDK.

Citati solo come dipendenze di build:

- **PebbleOS** — firmware, **Apache-2.0**, <https://github.com/coredevices/PebbleOS>
- **pebble-tool** 5.0.40 — **MIT**, «Copyright (c) 2015 Pebble Technology» (vedi §1.2 per i file
  generati dai suoi template)
- **SDK Pebble 4.33.1** — distribuito con una EULA proprietaria; non ridistribuito qui

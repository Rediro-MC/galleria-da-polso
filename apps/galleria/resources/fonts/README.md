# `resources/fonts/` — TTF sorgente per gli sprite delle cifre (S3, S8-stile)

File TTF **sorgente** da cui `tools/gen_digits.py` rasterizza le strip PNG delle cifre grandi
(design D3/D4, `docs/design/galleria.md` §2 e §7). Scaricati da `github.com/google/fonts`,
branch `main`, via `raw.githubusercontent.com`: i primi tre il **27/08/2026**, Francois One e
Staatliches il **04/09/2026** (sessione S8-stile, `docs/design/galleria-s8-stile.md` §2).

> ⚠️ **I `.ttf` NON entrano nel `.pbw`.** Non sono dichiarati in `package.json`
> (`pebble.resources.media` elenca solo le strip `bitmap` `digits/<font>_<taglia>.png`, generate da
> `tools/gen_digits.py`, più le foto demo `raw`). Restano nel repo solo come sorgente riproducibile
> della generazione: nessun byte di questi file finisce sull'orologio. Sull'orologio ci sono i PNG
> palettizzati (`DIGITS_ANTON_A/B`, `DIGITS_BEBAS_A/B`, `DIGITS_BARLOW_A/B`, `DIGITS_FRANCOIS_A/B`,
> `DIGITS_STAATLICHES_A/B`); il font di sistema LECO 60 (`font` = 3, solo layout A) non ha risorse.

## Inventario

| File | Famiglia | Stile | Versione (`name[5]`) | Dimensione | sha256 |
|---|---|---|---|---|---|
| `Anton-Regular.ttf` | Anton | Regular | 2.116 (ttfautohint v1.8.3) | 170.812 B | `a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab` |
| `BebasNeue-Regular.ttf` | Bebas Neue | Regular | 2.000 | 61.400 B | `08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73` |
| `BarlowCondensed-Bold.ttf` | Barlow Condensed | Bold | 1.408 | 109.912 B | `e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65` |
| `FrancoisOne-Regular.ttf` | Francois One | Regular | 2.000 | 79.356 B | `700fb5e4a5b6edb14dde2dcd481e5a9cac14281579cf42500170bae7cddd3609` |
| `Staatliches-Regular.ttf` | Staatliches | Regular | 1.000 (ttfautohint v1.8.2) | 63.316 B | `8395212aa4c6c3534bd39a745d956305ff080c3f3ed73ba61e4fbaae951e55cc` |
| `OFL-Anton.txt` | — | licenza di Anton | OFL 1.1 | 4.484 B | `ee67e6ee22790b7929f1a3769ca2801d565c64b5a9096942c1adf5596de9c9e4` |
| `OFL-BebasNeue.txt` | — | licenza di Bebas Neue | OFL 1.1 | 4.337 B | `72082f6cb4d04be2ecf7cc7d9e1e7d73787f0af8a5a278a47cade70c16b78341` |
| `OFL-BarlowCondensed.txt` | — | licenza di Barlow Condensed | OFL 1.1 | 4.377 B | `186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f` |
| `OFL-FrancoisOne.txt` | — | licenza di Francois One | OFL 1.1 | 4.376 B | `09685e225ba9b697b2ccd2d4098cac5ecbed0679960605258a271af60749887b` |
| `OFL-Staatliches.txt` | — | licenza di Staatliches | OFL 1.1 | 4.386 B | `72afba97d1ac9409a9fd3bb91a02a639427ca1988977909dad273e293a508d7e` |

Ordine dei font nelle impostazioni (`GalSettings.font`, design §4.1, **D22**): **0 = Anton** (default),
**1 = Bebas Neue**, **2 = Barlow Condensed Bold**, **3 = LECO 60** di sistema (solo layout A, nessuna
strip), **4 = Francois One**, **5 = Staatliches**. L'**indice di strip** è invece
`font < 3 ? font : font − 1` → 0 Anton, 1 Bebas, 2 Barlow, **3 Francois One**, **4 Staatliches**:
è l'ordine delle chiavi `anton`/`bebas`/`barlow`/`francois`/`staatliches` in `tools/gen_digits.py`,
delle righe di `DIGITS_METRICS[5][2]` e `DIGITS_RESOURCE_IDS[5][2]` in `src/c/digit_metrics.h`.

## Provenienza (27/08/2026 i primi tre, 04/09/2026 gli ultimi due)

| File locale | URL |
|---|---|
| `Anton-Regular.ttf` | `https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf` |
| `OFL-Anton.txt` | `https://raw.githubusercontent.com/google/fonts/main/ofl/anton/OFL.txt` |
| `BebasNeue-Regular.ttf` | `https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf` |
| `OFL-BebasNeue.txt` | `https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/OFL.txt` |
| `BarlowCondensed-Bold.ttf` | `https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf` |
| `OFL-BarlowCondensed.txt` | `https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt` |
| `FrancoisOne-Regular.ttf` | `https://raw.githubusercontent.com/google/fonts/main/ofl/francoisone/FrancoisOne-Regular.ttf` |
| `OFL-FrancoisOne.txt` | `https://raw.githubusercontent.com/google/fonts/main/ofl/francoisone/OFL.txt` |
| `Staatliches-Regular.ttf` | `https://raw.githubusercontent.com/google/fonts/main/ofl/staatliches/Staatliches-Regular.ttf` |
| `OFL-Staatliches.txt` | `https://raw.githubusercontent.com/google/fonts/main/ofl/staatliches/OFL.txt` |

Repository upstream dei due font nuovi (non usati per il download, solo tracciabilità):
`https://github.com/googlefonts/francoisoneFont` e `https://github.com/googlefonts/staatliches`.

`main` è un branch mobile: per fissare la revisione esatta, ogni file è identificato anche dal suo
**blob sha** git (verificato uguale a quello dell'API GitHub e a `git hash-object` in locale, quindi
il download è byte-identico all'originale):

```
4d65707db9d8663ccfa99cd28cd3a4e0025be178  ofl/anton/Anton-Regular.ttf
93feddee37145696e123ea65a6772cab09663f9e  ofl/anton/OFL.txt
c328c6e08b20a20a1de47d823e007ee73812a438  ofl/bebasneue/BebasNeue-Regular.ttf
da9571488f44176ef90d7f10c0f402c8be74db67  ofl/bebasneue/OFL.txt
9e480f467d703009e3abfce290b2ec2b7d24e188  ofl/barlowcondensed/BarlowCondensed-Bold.ttf
2f22ba6ca4dbc12145ae40b14c3368f387cba0e2  ofl/barlowcondensed/OFL.txt
6291b9854edc0e516e785fe6a0843dca7af581c6  ofl/francoisone/FrancoisOne-Regular.ttf
9a05c88a3401c21816594ce4b4eb556d53b2a6c0  ofl/francoisone/OFL.txt
9795b3a5734975b4d88fb24b2e3661f52ab1e498  ofl/staatliches/Staatliches-Regular.ttf
38df293632032a5a5e06a357c16fcd3c6211d3c3  ofl/staatliches/OFL.txt
```

Riscaricare (dalla cartella `resources/fonts/`):

```bash
curl -fsSL -o Anton-Regular.ttf        https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf
curl -fsSL -o OFL-Anton.txt            https://raw.githubusercontent.com/google/fonts/main/ofl/anton/OFL.txt
curl -fsSL -o BebasNeue-Regular.ttf    https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf
curl -fsSL -o OFL-BebasNeue.txt        https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/OFL.txt
curl -fsSL -o BarlowCondensed-Bold.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf
curl -fsSL -o OFL-BarlowCondensed.txt  https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt
curl -fsSL -o FrancoisOne-Regular.ttf  https://raw.githubusercontent.com/google/fonts/main/ofl/francoisone/FrancoisOne-Regular.ttf
curl -fsSL -o OFL-FrancoisOne.txt      https://raw.githubusercontent.com/google/fonts/main/ofl/francoisone/OFL.txt
curl -fsSL -o Staatliches-Regular.ttf  https://raw.githubusercontent.com/google/fonts/main/ofl/staatliches/Staatliches-Regular.ttf
curl -fsSL -o OFL-Staatliches.txt      https://raw.githubusercontent.com/google/fonts/main/ofl/staatliches/OFL.txt
sha256sum -c <<'EOF'
a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab  Anton-Regular.ttf
08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73  BebasNeue-Regular.ttf
e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65  BarlowCondensed-Bold.ttf
700fb5e4a5b6edb14dde2dcd481e5a9cac14281579cf42500170bae7cddd3609  FrancoisOne-Regular.ttf
8395212aa4c6c3534bd39a745d956305ff080c3f3ed73ba61e4fbaae951e55cc  Staatliches-Regular.ttf
ee67e6ee22790b7929f1a3769ca2801d565c64b5a9096942c1adf5596de9c9e4  OFL-Anton.txt
72082f6cb4d04be2ecf7cc7d9e1e7d73787f0af8a5a278a47cade70c16b78341  OFL-BebasNeue.txt
186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f  OFL-BarlowCondensed.txt
09685e225ba9b697b2ccd2d4098cac5ecbed0679960605258a271af60749887b  OFL-FrancoisOne.txt
72afba97d1ac9409a9fd3bb91a02a639427ca1988977909dad273e293a508d7e  OFL-Staatliches.txt
EOF
```

Se un file cambiasse a monte (nuova release upstream), **rigenerare le strip** con
`tools/gen_digits.py` e aggiornare questa tabella insieme a `src/c/digit_metrics.h`: le metriche
generate dipendono dai contorni del TTF.

## Licenza — SIL Open Font License 1.1

Tutti e cinque i font sono distribuiti sotto **SIL OFL 1.1**, il testo integrale è nei file allegati:

| Font | File di licenza | Copyright (`name[0]`) |
|---|---|---|
| Anton | `OFL-Anton.txt` | Copyright 2020 The Anton Project Authors (`https://github.com/googlefonts/AntonFont.git`) |
| Bebas Neue | `OFL-BebasNeue.txt` | Copyright 2019 The Bebas Neue Project Authors (`https://github.com/dharmatype/Bebas-Neue`) — il testo della licenza riporta «Copyright © 2010 by Dharma Type.» |
| Barlow Condensed | `OFL-BarlowCondensed.txt` | Copyright 2017 The Barlow Project Authors (`https://github.com/jpt/barlow`) |
| Francois One | `OFL-FrancoisOne.txt` | Copyright 2011 The Francois One Project Authors (`contact@sansoxygen.com`) — disegnato da Vernon Adams |
| Staatliches | `OFL-Staatliches.txt` | Copyright 2018 The Staatliches Project Authors (`https://github.com/googlefonts/staatliches`) — la riga in testa a `OFL-Staatliches.txt` dice «The Staatliches Authors», senza «Project»; disegnato da Brian LaRossa & Erica Carras |

L'OFL permette l'uso, l'incorporazione e la ridistribuzione (anche in software venduto) e non
richiede attribuzione nell'app; vieta la vendita dei font **da soli** e l'uso dei Reserved Font Name
per opere derivate. Qui i font non vengono ridistribuiti come font: dal TTF si ricavano immagini di
cifre (strip PNG), che l'OFL non vincola. I file `OFL-*.txt` restano nel repo per tracciabilità.
Nessuno dei cinque dichiara un **Reserved Font Name**: in tutti e cinque i `OFL-*.txt` la stringa
compare solo alla riga 33 (la definizione del testo standard), mai nella riga di copyright in testa
— quindi non c'è vincolo sul nome per eventuali derivati. Se in futuro servisse un TTF *modificato*,
la modifica va comunque ridistribuita sotto OFL.
Per il listing store (S9) basta una riga di credito, non obbligatoria: «Cifre: Anton, Bebas Neue,
Barlow Condensed, Francois One, Staatliches (SIL OFL 1.1)».

## Verifica eseguita (27/08/2026 i primi tre, **04/09/2026** Francois One e Staatliches)

Interprete con freetype-py + Pillow: `~/.local/share/uv/tools/pebble-tool/bin/python`
(il `python3` di sistema **non** ha freetype).

- magic dei 5 TTF = `00 01 00 00` (TrueType) ✅ — `file(1)`: «TrueType Font data, digitally signed, 18 tables»
- apertura con FreeType: OK per tutti e cinque (`num_faces = 1`, `is_scalable = True`, charmap Unicode
  `(3,1)` presente; Francois One ha anche una charmap Mac `(1,0)`)
- glifi `'0'`..`'9'` e `':'`: `get_char_index() != 0` per **tutti** e cinque i font (55 controlli) ✅
- render `FT_LOAD_RENDER|FT_LOAD_MONOCHROME|FT_LOAD_TARGET_MONO` alle 4 taglie di S3 (66 e 94 su
  emery, 42 e 62 su flint): `pixel_mode = 1` (mono) ✅

```
                     units/EM  glifi  ascender/descender
Anton Regular            2048   1373      2409 / -674
Bebas Neue Regular       1000    508       900 / -300
Barlow Condensed Bold    1000    694      1000 / -200
Francois One Regular     1000    612      1089 / -329
Staatliches Regular      1000    424       950 / -300
```

### Metriche misurate, utili a `tools/gen_digits.py`

`set_pixel_sizes(0, px)` non dà cifre alte `px`: l'altezza dell'inchiostro di `'0'` è molto minore
(la EM comprende ascendenti/discendenti). Misure di `'0'` (larghezza × altezza del bitmap mono) e
advance:

| Font | px 68 → `'0'` | px 96 → `'0'` | advance cifre (px 68) | advance `':'` |
|---|---|---|---|---|
| Anton | 31 × **60** | 44 × **84** | 34, tranne `'1'` = 22 | 16 |
| Bebas Neue | 23 × **49** | 32 × **69** | 27 (tutte uguali) | 13 |
| Barlow Cond. Bold | 27 × **50** | 38 × **69** | 31,19,30,30,33,30,30,28,30,30 | 19 |
| Francois One | 32 × **53** | 44 × **74** | 38 (`'0'`), 31 (`'1'`), 35 (le altre otto) | 17 |
| Staatliches | 29 × **49** | 41 × **69** | 34,14,30,30,31,29,31,30,31,31 | 14 |

Conseguenze per il generatore:

1. La `px` di FreeType va **cercata** (bisezione) perché l'altezza del riempimento arrivi a
   `digit_h` (= `rows_h`: 66 in A emery, 94 in B emery, 42 e 62 su flint), non impostata a
   68/96. Stima lineare del punto di partenza: Anton ≈ `px × 66/60`, Bebas ≈ `px × 66/49`,
   Barlow ≈ `px × 66/50`, Francois One ≈ `px × 66/53`, Staatliches ≈ `px × 66/49`.
   Il campo `px` di `DigitStripMetrics` serve proprio a registrare il valore trovato
   (diagnostica, contratto in `src/c/digit_metrics.h`).
2. **Solo Bebas Neue ha cifre tabulari.** Anton ha `'1'` più stretto di un terzo, Barlow Condensed,
   Francois One e Staatliches sono proporzionali (`'4'` o `'0'` più larghi, `'1'` molto stretto).
   Il contratto usa comunque celle a larghezza fissa `cell_w` con l'inchiostro centrato
   (`ui_digits_draw`), quindi la proporzionalità non è un problema: conta solo che il **riempimento
   più largo**, più 2 px, stia in `cell_w` (40 A / 64 B su emery, 28 / 48 su flint; D24: anello e
   ombra possono sporgere dal passo, ci pensa `prv_place_row`). Il generatore deve verificarlo e non
   solo assumerlo.
3. Anton è il più "grasso" (inchiostro più largo a parità di altezza) → è il caso peggiore per
   `cell_w`; Bebas il più stretto.
4. **Pixel size scelte da `pick_px` con `--fit-width`** (stessa regola del generatore: la px più
   grande con `max(h cifre) ≤ rows_h`, `max(w riempimento) + 2 ≤ cell_w` e, in A, `w(':') + 2 ≤ 16`
   emery / 12 flint). `digit_h` in **grassetto** quando il vincolo di larghezza costa altezza:

   | Font | emery A (40, 66) | emery B (64, 94) | flint A (28, 42) | flint B (48, 62) |
   |---|---|---|---|---|
   | Anton | px 74 → 66 | px 107 → 94 | px 49 → 42 | px 70 → 62 |
   | Bebas Neue | px 92 → 66 | px 131 → 94 | px 58 → 42 | px 86 → 62 |
   | Barlow Cond. Bold | px 84 → **61** (−5) | px 130 → 93 | px 58 → **40** (−2) | px 86 → 62 |
   | Francois One | px 79 → **61** (−5) | px 123 → 94 | px 53 → 41 | px 79 → 61 |
   | Staatliches | px 90 → **65** (−1) | px 132 → 94 | px 58 → 42 | px 86 → 62 |

   **Francois One perde 5 px in taglia A su emery, esattamente come Barlow**: il glifo limitante è
   il `'4'`, il cui riempimento arriva a 38 px e con i 2 px di margine satura la cella da 40
   (`0` 36, `1` 26, le altre 32–35). In B, dove la cella è 64, l'altezza è piena (94/94), e su flint
   il vincolo non morde (41/42 in A è solo arrotondamento della px, non `--fit-width`).
   **Staatliches tiene 65/66 in A** (limitanti `'0'` e `'4'` a 38 px) e 94/94 in B: è il font nuovo
   che rende meglio nella fascia stretta. Ha però l'`'1'` largo **11 px** con le cifre alte 65 px
   (7 px su flint A): nella griglia a celle fisse resta molto spazio ai lati dell'uno — l'inchiostro
   è centrato nella cella, quindi la riga resta bilanciata, ma un `'1'` accanto a uno `'0'` da 38 px
   è visibilmente "arioso". Anche l'anello e l'ombra di S8-stile non lo riempiono: crescono solo di
   R e S px per lato.

### Nota S8-stile (04/09/2026): anello spesso, ombra 3D e controforme

Dalla v2 di `gen_digits.py` (D20/D23) le strip non sono più «riempimento + contorno da 1 px»: ogni
glifo ha **quattro** livelli nella stessa immagine `2BitPalette` — trasparente, riempimento,
**anello** spesso `R` px (2 su emery, 1 su flint) e **ombra 3D** in diagonale profonda `S = 2`,
scritta nel PNG come quarto colore **rosso** `(255,0,0,255)`. Gli stili trasparenti (D21) spengono
il riempimento e lasciano leggere l'ora dal solo anello: la cifra diventa un contorno cavo sopra la
foto.

Per questo i due font nuovi sono stati scelti anche per le **controforme ampie** (§2 della spec):
con l'anello che entra di `R` px da ogni lato, una controforma si stringe di `2R = 4` px su emery.
Larghezza della controforma di `'0'` sulla riga mediana, alla px della taglia A emery, prima
dell'anello (misurata sul riempimento mono):

| Font | `'0'` | tratto verticale | controforma | dopo l'anello (−4 px) |
|---|---|---|---|---|
| Anton (px 74, h 66) | 34 px | 14 px | 6 px (18 %) | **2 px** — quasi chiusa |
| Bebas Neue (px 92, h 66) | 31 px | 10 px | 11 px (35 %) | 7 px |
| Barlow Cond. Bold (px 84, h 61) | 33 px | 11–12 px | 10 px (30 %) | 6 px |
| Francois One (px 79, h 61) | 36 px | 11 px | 14 px (39 %) | **10 px** |
| Staatliches (px 90, h 65) | 38 px | 10–11 px | 17 px (45 %) | **13 px** |

Anton resta il default (è il più solido nello stile Pieno), ma nello stile trasparente il suo occhio
si chiude quasi del tutto; Francois One e Staatliches restano aperti e leggibili anche con il solo
anello. Le anteprime dei quattro stili si generano con `gen_digits.py --preview DIR`.

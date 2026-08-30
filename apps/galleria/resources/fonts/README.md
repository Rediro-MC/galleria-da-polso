# `resources/fonts/` — TTF sorgente per gli sprite delle cifre (S3)

File TTF **sorgente** da cui `tools/gen_digits.py` rasterizza le strip PNG delle cifre grandi
(design D3/D4, `docs/design/galleria.md` §2 e §7). Scaricati il **27/08/2026** da
`github.com/google/fonts`, branch `main`, via `raw.githubusercontent.com`.

> ⚠️ **I `.ttf` NON entrano nel `.pbw`.** Non sono dichiarati in `package.json`
> (`pebble.resources.media` elenca solo le strip `bitmap` `digits/<font>_<taglia>.png`, generate da
> `tools/gen_digits.py`, più le foto demo `raw`). Restano nel repo solo come sorgente riproducibile
> della generazione: nessun byte di questi file finisce sull'orologio. Sull'orologio ci sono i PNG
> palettizzati; il font di sistema LECO 60 (4ª opzione del layout A) non ha risorse.

## Inventario

| File | Famiglia | Stile | Versione (`name[5]`) | Dimensione | sha256 |
|---|---|---|---|---|---|
| `Anton-Regular.ttf` | Anton | Regular | 2.116 (ttfautohint v1.8.3) | 170.812 B | `a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab` |
| `BebasNeue-Regular.ttf` | Bebas Neue | Regular | 2.000 | 61.400 B | `08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73` |
| `BarlowCondensed-Bold.ttf` | Barlow Condensed | Bold | 1.408 | 109.912 B | `e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65` |
| `OFL-Anton.txt` | — | licenza di Anton | OFL 1.1 | 4.484 B | `ee67e6ee22790b7929f1a3769ca2801d565c64b5a9096942c1adf5596de9c9e4` |
| `OFL-BebasNeue.txt` | — | licenza di Bebas Neue | OFL 1.1 | 4.337 B | `72082f6cb4d04be2ecf7cc7d9e1e7d73787f0af8a5a278a47cade70c16b78341` |
| `OFL-BarlowCondensed.txt` | — | licenza di Barlow Condensed | OFL 1.1 | 4.377 B | `186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f` |

Ordine dei font nelle impostazioni (`GalSettings.font`, design §4.1): **0 = Anton** (default),
**1 = Bebas Neue**, **2 = Barlow Condensed Bold**, 3 = LECO 60 di sistema (solo layout A).

## Provenienza (27/08/2026)

| File locale | URL |
|---|---|
| `Anton-Regular.ttf` | `https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf` |
| `OFL-Anton.txt` | `https://raw.githubusercontent.com/google/fonts/main/ofl/anton/OFL.txt` |
| `BebasNeue-Regular.ttf` | `https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf` |
| `OFL-BebasNeue.txt` | `https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/OFL.txt` |
| `BarlowCondensed-Bold.ttf` | `https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf` |
| `OFL-BarlowCondensed.txt` | `https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt` |

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
```

Riscaricare (dalla cartella `resources/fonts/`):

```bash
curl -fsSL -o Anton-Regular.ttf        https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf
curl -fsSL -o OFL-Anton.txt            https://raw.githubusercontent.com/google/fonts/main/ofl/anton/OFL.txt
curl -fsSL -o BebasNeue-Regular.ttf    https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf
curl -fsSL -o OFL-BebasNeue.txt        https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/OFL.txt
curl -fsSL -o BarlowCondensed-Bold.ttf https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf
curl -fsSL -o OFL-BarlowCondensed.txt  https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt
sha256sum -c <<'EOF'
a4ba3a92350ebb031da0cb47630ac49eb265082ca1bc0450442f4a83ab947cab  Anton-Regular.ttf
08e4623805102d819f58601e46e345648846075e363b2ceb23313c2d1c83ec73  BebasNeue-Regular.ttf
e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65  BarlowCondensed-Bold.ttf
ee67e6ee22790b7929f1a3769ca2801d565c64b5a9096942c1adf5596de9c9e4  OFL-Anton.txt
72082f6cb4d04be2ecf7cc7d9e1e7d73787f0af8a5a278a47cade70c16b78341  OFL-BebasNeue.txt
186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f  OFL-BarlowCondensed.txt
EOF
```

Se un file cambiasse a monte (nuova release upstream), **rigenerare le strip** con
`tools/gen_digits.py` e aggiornare questa tabella insieme a `src/c/digit_metrics.h`: le metriche
generate dipendono dai contorni del TTF.

## Licenza — SIL Open Font License 1.1

Tutti e tre i font sono distribuiti sotto **SIL OFL 1.1**, il testo integrale è nei file allegati:

| Font | File di licenza | Copyright (`name[0]`) |
|---|---|---|
| Anton | `OFL-Anton.txt` | Copyright 2020 The Anton Project Authors (`https://github.com/googlefonts/AntonFont.git`) |
| Bebas Neue | `OFL-BebasNeue.txt` | Copyright 2019 The Bebas Neue Project Authors (`https://github.com/dharmatype/Bebas-Neue`) — il testo della licenza riporta «Copyright © 2010 by Dharma Type.» |
| Barlow Condensed | `OFL-BarlowCondensed.txt` | Copyright 2017 The Barlow Project Authors (`https://github.com/jpt/barlow`) |

L'OFL permette l'uso, l'incorporazione e la ridistribuzione (anche in software venduto) e non
richiede attribuzione nell'app; vieta la vendita dei font **da soli** e l'uso dei Reserved Font Name
per opere derivate. Qui i font non vengono ridistribuiti come font: dal TTF si ricavano immagini di
cifre (strip PNG), che l'OFL non vincola. I file `OFL-*.txt` restano nel repo per tracciabilità.
Nessuno dei tre dichiara un **Reserved Font Name**: nei tre `OFL-*.txt` la stringa compare solo
alla riga 33 (la definizione del testo standard), mai nella riga di copyright in testa — quindi
non c'è vincolo sul nome per eventuali derivati. Se in futuro servisse un TTF *modificato*, la
modifica va comunque ridistribuita sotto OFL.
Per il listing store (S9) basta una riga di credito, non obbligatoria: «Cifre: Anton, Bebas Neue,
Barlow Condensed (SIL OFL 1.1)».

## Verifica eseguita (27/08/2026)

Interprete con freetype-py + Pillow: `~/.local/share/uv/tools/pebble-tool/bin/python`
(il `python3` di sistema **non** ha freetype).

- magic dei 3 TTF = `00 01 00 00` (TrueType) ✅ — `file(1)`: «TrueType Font data, digitally signed, 18 tables»
- apertura con FreeType: OK per tutti e tre (`num_faces = 1`, `is_scalable = True`, charmap Unicode `(3,1)` presente)
- glifi `'0'`..`'9'` e `':'`: `get_char_index() != 0` per **tutti** e tre i font (33 controlli) ✅
- render `FT_LOAD_RENDER|FT_LOAD_MONOCHROME|FT_LOAD_TARGET_MONO` alle 4 taglie di S3: `pixel_mode = 1` (mono) ✅

```
                     units/EM  glifi  ascender/descender
Anton Regular            2048   1373      2409 / -674
Bebas Neue Regular       1000    508       900 / -300
Barlow Condensed Bold    1000    694      1000 / -200
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

Conseguenze per il generatore:

1. La `px` di FreeType va **cercata** (bisezione) perché l'altezza del riempimento arrivi a
   `digit_h` (= `strip_h − 2`: 66 in A emery, 94 in B emery, 42 e 62 su flint), non impostata a
   68/96. Stima lineare del punto di partenza: Anton ≈ `px × 66/60`, Bebas ≈ `px × 66/49`,
   Barlow ≈ `px × 66/50`. Il campo `px` di `DigitStripMetrics` serve proprio a registrare il valore
   trovato (diagnostica, contratto in `src/c/digit_metrics.h`).
2. **Solo Bebas Neue ha cifre tabulari.** Anton ha `'1'` più stretto di un terzo, Barlow Condensed è
   del tutto proporzionale (`'4'` più largo, `'1'` molto stretto). Il contratto usa comunque celle a
   larghezza fissa `cell_w` con l'inchiostro centrato (`ui_digits_draw`), quindi la proporzionalità
   non è un problema: conta solo che l'inchiostro **più largo**, contorno di 1 px compreso, stia in
   `cell_w` (40 A / 64 B su emery, 28 / 48 su flint). Alle larghezze scalate a `digit_h` nessuno dei
   tre sfora, ma il generatore deve verificarlo e non solo assumerlo.
3. Anton è il più "grasso" (inchiostro più largo a parità di altezza) → è il caso peggiore per
   `cell_w`; Bebas il più stretto.

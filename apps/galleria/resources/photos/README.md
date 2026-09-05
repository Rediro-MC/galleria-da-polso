# Foto demo di Galleria (`apps/galleria/resources/photos/`)

> ✅ **Foto CC0 da Wikimedia Commons, utilizzabili anche nello store.** Dal 05/09/2026 (S9‑prep) le due
> demo derivano da due foto in **CC0 1.0** (Creative Commons Zero, rinuncia al diritto d'autore): nessun
> obbligo di attribuzione, nessun vincolo di ridistribuzione sul `.pbw`, nessun ostacolo alla
> pubblicazione. I crediti agli autori restano comunque nel listing (`store/LISTING.md` §4) per
> correttezza. Le versioni precedenti (wallpaper di Ubuntu, CC‑BY‑SA‑4.0, **solo test**) sono state
> sostituite proprio per questo.

## Provenienza

Licenza verificata con l'API di Commons (`action=query&prop=imageinfo&iiprop=url|size|sha1|extmetadata`,
User‑Agent esplicito) e con il wikitext della pagina `File:`.

| | `demo_1` (scura, testo bianco) | `demo_2` (chiara, testo nero) |
|---|---|---|
| File nel repo | `demo_1.raw6` + `demo_1.raw1` | `demo_2.raw6` + `demo_2.raw1` |
| Titolo | *Northern Lights at Lauklines Norway* | *Bryce Canyon After Snow (Unsplash)* |
| Pagina `File:` | https://commons.wikimedia.org/wiki/File:Northern_Lights_at_Lauklines_Norway.jpg | https://commons.wikimedia.org/wiki/File:Bryce_Canyon_After_Snow_(Unsplash).jpg |
| Autore | Sebastian Kowalski | Emanuel Hahn (Unsplash: `hahnbo`) |
| Licenza | **CC0 1.0** — wikitext `{{self\|cc-zero}}` (opera propria), categorie «CC‑Zero» e «Self‑published work», nessuna revisione pendente | **CC0 1.0** su Commons — template `{{Unsplash}}` (le foto pubblicate su Unsplash prima del 5/6/2017 erano CC0); in ogni caso la licenza Unsplash consente l'uso gratuito, anche commerciale, senza attribuzione |
| `LicenseUrl` | http://creativecommons.org/publicdomain/zero/1.0/deed.en | http://creativecommons.org/publicdomain/zero/1.0/deed.en |
| Originale | 6000×4000, 2.552.419 B | 3619×2413, 7.396.496 B |
| Scaricato | **l'originale** (sotto i 3 MB) | **il thumb a 1920 px** (l'originale supera i 3 MB; `iiurlwidth=1600` fa rispondere il bucket 1920: un thumb a 1600 non esiste) — 1920×1280, 954.356 B |
| URL scaricato | https://upload.wikimedia.org/wikipedia/commons/7/77/Northern_Lights_at_Lauklines_Norway.jpg | https://thumb.wikimedia.org/wikipedia/commons/thumb/1/16/Bryce_Canyon_After_Snow_%28Unsplash%29.jpg/1920px-Bryce_Canyon_After_Snow_%28Unsplash%29.jpg |
| SHA‑256 del file scaricato | `91a86dcda74f2dc2c09791b3ea9c5778625c94510380e8cc7503b08a2ac8ab06` | `580b50ea9fd241dc5e7284e32af80d963ddd8f96f7dcd0ba51205dd03abd01ee` |
| SHA‑1 dell'originale (API di Commons) | `388720906f88ad9ada8de41165775b8f64c66ecd` | `fa29edcd8fb343838e546225a6e41119504e4fdb` |

Lo SHA‑1 dell'API si riferisce sempre all'**originale** ed è immutabile; lo SHA‑256 di `demo_2` è quello
del **thumb**, che Wikimedia può rigenerare (il valore potrebbe cambiare). Il criterio di verità per la
riproducibilità sono quindi i **CRC32 dei `.raw`** più sotto.

Storia della pagina di `demo_2`: caricata su Commons il 2017‑09‑04 da *Fae*; la categoria «Images from
Unsplash (review needed)» è stata **rimossa** il 2018‑07‑02 da *An Errant Knight*, cioè la revisione umana
della licenza si è conclusa (così dice la descrizione della categoria).

I JPEG sorgente stanno in `~/galleria-gate/s9/src/` e **non** entrano nel repo: nel repo ci sono solo i
`.raw6`/`.raw1`.

## Perché proprio queste due

Criteri di scelta della spec `docs/design/galleria-s9-pubblicazione.md` §1, in ordine:

1. **Colore del testo opposto e alone spento**: `--stats` prevede **BIANCO** per `demo_1` (emery `bad_white`
   0 %) e **NERO** per `demo_2` (emery `bad_black` 0 % in layout A, 6 % in layout B), tutti sotto il 15 % di
   conflitto → contorno automatico spento su emery. Le due demo esercitano entrambi i rami del colore
   automatico.
2. **Stabilità fra layout A e B**: il colore previsto non cambia passando dalla fascia dell'ora (A) allo
   schermo intero (B) — vedi la tabella `--stats`.
3. **Nessuna persona riconoscibile, nessun marchio, nessun logo, nessun testo leggibile** in entrambe.
4. **flint** (`raw1`, dithering Floyd–Steinberg): la scena resta comprensibile. Su `demo_1` la resa è una
   «tessitura» — l'aurora si intuisce — e il testo è bianco con contorno; `demo_2` in B/N resta la più
   leggibile delle due (per questo è lei a fornire `flint_screenshot_1.png`, vedi `store/README.md`).
5. **Icona**: il ritaglio quadrato 200×200 centrato (`y` 14..214) resta gradevole e leggibile anche a 48×48.
6. **Varietà**: una naturale scura (aurora sul fiordo, notte) e una chiara (canyon dopo la neve).

Sono state valutate **26 candidate CC0** (12 scure, 14 chiare); la tabella completa è in
`~/galleria-gate/s9/candidates.md`, **fuori dal repo**. Riserve scartate:

| Candidata | Autore / licenza | Perché scartata |
|---|---|---|
| *Aurora Borealis Kiruna* | Martin Eklund, CC0 (confermata VRTS) | su flint si riduceva a rumore; `Lauklines` è opera propria CC0 senza rischio, stabile in A e B e leggibile anche a 48 px |
| *Polar lights over dark trees (Unsplash)* | CC0 dichiarata | revisione Unsplash ancora **pendente** su Commons |
| *Trees in the fog, Bornholm* | Socket0, CC0 | in layout B accende l'alone |
| *Snow-capped mountain range* | Mshuang2, CC0 | cambia colore del testo fra layout A e B e su flint |

## Comandi usati (05/09/2026)

```bash
cd ~/ProgettiClaude/Pebble
python3 tools/photo_prep.py --out apps/galleria/resources/photos --name demo_1 \
        --stats --preview --preview-dir ~/galleria-gate/s9/final_prev \
        ~/galleria-gate/s9/src/d10_lauklines.jpg
python3 tools/photo_prep.py --out apps/galleria/resources/photos --name demo_2 \
        --stats --preview --preview-dir ~/galleria-gate/s9/final_prev \
        ~/galleria-gate/s9/src/b06_bryce.jpg
```

Tutte le altre opzioni sono ai valori di **default**: crop centrato, `--dither fs`, `--bw-dither fs`,
`--gamma 1.0`, `--lift 0`, spazio RGB crudo (**niente `--sunlight`**: decisione D6 di
`docs/design/galleria.md`, default OFF). Il ritaglio centrato più grande possibile è

| Foto | Ritaglio emery (200:228) | Ritaglio flint (144:168) |
|---|---|---|
| `demo_1` (6000×4000) | `1246,0 3508×4000` | `1286,0 3428×4000` |
| `demo_2` (1920×1280) | `399,0 1122×1280` | `411,0 1097×1280` |

I comandi sono **deterministici**: rieseguirli riproduce gli stessi byte. Verificato il 05/09/2026
rigenerando le quattro risorse in una cartella temporanea e confrontandole con `cmp` — identiche.
Le anteprime PNG ×2 finiscono in `~/galleria-gate/s9/final_prev` e **non** stanno nel repo.

## Contenuto e verifica

| File | Byte | CRC32 (zlib) | Formato | Note |
|---|---|---|---|---|
| `demo_1.raw6` | 34.200 | `0x2B7BE24F` | raw6 emery 200×228 | 30 colori su 64 |
| `demo_1.raw1` | 3.024 | `0xA35A8FE7` | raw1 flint 144×168 | 23,5 % pixel bianchi |
| `demo_2.raw6` | 34.200 | `0xC91AE01B` | raw6 emery 200×228 | 32 colori su 64 |
| `demo_2.raw1` | 3.024 | `0xA7EF19B1` | raw1 flint 144×168 | 70,3 % pixel bianchi |

```bash
python3 - <<'EOF'
import zlib
for n in ('demo_1', 'demo_2'):
    for e in ('raw6', 'raw1'):
        d = open('apps/galleria/resources/photos/%s.%s' % (n, e), 'rb').read()
        print(n, e, len(d), hex(zlib.crc32(d)))
EOF
```

## Colore del testo previsto (`--stats`)

Previsione fatta dal tool con la stessa regola di `src/c/luma.h` (campionamento 1 px su 2); serve a
controllare che la watchface scelga il colore giusto senza dover leggere il bitmap a mano. Layout **A** =
fascia dell'ora (`y 0..105` su emery, `y 0..75` su flint, default di `--stats`); layout **B** = schermo
intero (`--band-h 228,168`, `y 0..227` / `y 0..167`).

| Foto | Layout | Piattaforma (campioni) | `bad_white` | `bad_black` | Y medio | Testo | Contorno |
|---|---|---|---|---|---|---|---|
| demo_1 | A | emery (5.300) | 0 % | 96 % | 15 | **BIANCO** | no |
| demo_1 | A | flint (2.736) | 21 % bianchi | 78 % neri | 54 | **BIANCO** | sì (sempre) |
| demo_1 | B | emery (11.400) | 1 % | 92 % | 19 | **BIANCO** | no |
| demo_1 | B | flint (6.048) | 22 % bianchi | 77 % neri | 57 | **BIANCO** | sì (sempre) |
| demo_2 | A | emery (5.300) | 95 % | 0 % | 134 | **NERO** | no |
| demo_2 | A | flint (2.736) | 86 % bianchi | 13 % neri | 221 | **NERO** | sì (sempre) |
| demo_2 | B | emery (11.400) | 84 % | 6 % | 133 | **NERO** | no |
| demo_2 | B | flint (6.048) | 76 % bianchi | 23 % neri | 195 | **NERO** | sì (sempre) |

Il colore **non cambia** fra layout A e B su nessuna delle due piattaforme: era un criterio di scelta.

**Verifica in emulatore** (gate S9‑prep, 05/09/2026 17:14–17:17, build normale, album vuoto → demo): le
righe `luma` della watchface riportano gli stessi numeri del tool. Per `demo_1`:

```
luma(photo): m=1 b=0+106 h=106 ph=1 w=1 bad=0(0/96) mean=15 fg=ff halo=0     (emery, layout A)
                                        bad=21(21/78) mean=54 fg=ff halo=1   (flint)
                                        bad=1(1/92)  mean=19 fg=ff halo=0    (emery, layout B, Francois One)
```

`fg=ff` = bianco, `halo=0` = contorno spento. Per `demo_2` il testo nero è visibile negli screenshot del
gate `docs/design/galleria/s9_emery_a_anton_chiara.png` e `s9_flint_a_anton_chiara.png`.

> **Nota su flint**: il contorno è **sempre acceso per scelta di design** (`src/c/luma.h`,
> `docs/design/galleria.md` §3.3) — non è una proprietà della foto. Su emery il contorno automatico si
> accende solo oltre il 15 % di conflitto: nessuna delle due demo ci arriva, quindi per vederlo si usa
> l'hook `GALLERIA_DEFINES="GALLERIA_DEBUG_OUTLINE=1" pebble build`.

## Formato dei file

Specifica esatta in [`../../src/c/photo_codec.h`](../../src/c/photo_codec.h) (e in
`docs/design/galleria.md` §4.3–4.4). In breve:

- **`.raw6`** – emery 200×228: indice di palette `idx = r2<<4 | g2<<2 | b2` (0..63), 4 pixel in 3
  byte MSB‑first (`b0 = p0<<2|p1>>4`, `b1 = (p1&15)<<4|p2>>2`, `b2 = (p2&3)<<6|p3`), riga 150 B,
  totale 34.200 B. Sull'orologio ogni pixel diventa un byte `GColor8` opaco `0xC0|idx`.
- **`.raw1`** – flint 144×168: `GBitmapFormat1BitPalette` MSB‑first (pixel `x` nel bit
  `0x80 >> (x & 7)` del byte `x/8`), `1` = bianco, riga 18 B, totale 3.024 B, copiato tal quale nel
  bitmap. **Non** è il packing LSB‑first di `GBitmapFormat1Bit`.

## Come vengono usati

Vanno dichiarati in `package.json` come risorse `"type": "raw"` con `targetPlatforms` per risorsa
(`DEMO_1_RAW6`/`DEMO_2_RAW6` solo `emery`, `DEMO_1_RAW1`/`DEMO_2_RAW1` solo `flint`) — vedi
`PIANO.md` §S2 punto 2 — e vengono letti a blocchi con `resource_load_byte_range()` dentro lo stesso
decoder a streaming che da S4 riceve i chunk persist da 256 B. Peso sulle risorse: 68.400 B su
emery (2 × 34.200) e 6.048 B su flint (2 × 3.024), ben sotto il tetto di 256 KB.

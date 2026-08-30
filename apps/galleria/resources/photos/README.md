# Foto demo di Galleria (`apps/galleria/resources/photos/`)

> ⚠️ **SOLO PER TEST LOCALE.** Queste due foto sono wallpaper di Ubuntu, usati qui per provare la
> pipeline e l'emulatore. **Prima della pubblicazione (S9) vanno sostituite con foto proprie o CC0**:
> la licenza CC‑BY‑SA‑4.0 obbligherebbe ad attribuire gli autori dentro l'app e a ridistribuire il
> `.pbw` con la stessa licenza. Nessuna delle due deve finire nello store.

## Provenienza

| File demo | Sorgente | Autore | Pacchetto | Licenza |
|---|---|---|---|---|
| `demo_1.raw6` / `demo_1.raw1` | `/usr/share/backgrounds/mizuno-as-Big_Dipper.jpg` (3840×2160) | Hajime Mizuno (`mizuno-as`) | `ubuntu-wallpapers` | CC‑BY‑SA‑4.0 |
| `demo_2.raw6` / `demo_2.raw1` | `/usr/share/backgrounds/moskalenko-v-Snowy_Ubuntu_Light.webp` (3840×2160) | Vladimir Moskalenko (`moskalenko-v`) | `ubuntu-wallpapers` | CC‑BY‑SA‑4.0 |

Autori e licenza vengono da `/usr/share/doc/ubuntu-wallpapers/copyright` (blocco che elenca
`mizuno-as-Big_Dipper.jpg` e `moskalenko-v-Snowy_Ubuntu_Light.webp`, `Copyright: 2016-2025
Canonical Ltd / … / Hajime Mizuno / … / Vladimir Moskalenko`, `License: CC-BY-SA-4.0`).
Scelta (S2): demo_1 è **scura** nella fascia dell'ora (testo bianco), demo_2 è **chiara** (testo nero),
così le due demo esercitano entrambi i rami del colore automatico. Un primo tentativo con
`mendhak-Bluebells_Suspended_In_Time.jpg` è stato scartato perché scuro in alto come demo_1.

## Comandi usati (27/08/2026)

```bash
cd ~/ProgettiClaude/Pebble
python3 tools/photo_prep.py --out apps/galleria/resources/photos --name demo_1 \
        --preview --preview-dir /tmp/prep --stats /usr/share/backgrounds/mizuno-as-Big_Dipper.jpg
python3 tools/photo_prep.py --out apps/galleria/resources/photos --name demo_2 \
        --preview --preview-dir /tmp/prep --stats \
        /usr/share/backgrounds/moskalenko-v-Snowy_Ubuntu_Light.webp
```

Tutte le opzioni sono ai valori di default: crop centrato, `--dither fs`, `--bw-dither fs`,
`--gamma 1.0`, `--lift 0`, spazio RGB crudo (niente `--sunlight`). Il ritaglio è quello centrato più
grande possibile: emery `973,0 1894×2160` (rapporto 200:228), flint `994,0 1851×2160` (144:168, il
sotto-rettangolo centrato del ritaglio di emery). Le anteprime PNG ×2 **non** stanno nel repo.
I comandi sono deterministici: rieseguirli riproduce gli stessi byte (stessi CRC32).

Varianti generate solo per confronto (in `/tmp/prep`, **non** nel repo): `--sunlight` e
`--gamma 0.85`. La `--sunlight` rende i colori più fedeli (più saturi, meno slavati) ma è la
decisione D6 di `docs/design/galleria.md`: **default OFF** finché S8 non la conferma sul pannello
vero.

## Contenuto e verifica

| File | Byte | CRC32 (zlib) | Formato | Note |
|---|---|---|---|---|
| `demo_1.raw6` | 34.200 | `0x3556EE89` | raw6 emery 200×228 | 35 colori su 64 |
| `demo_1.raw1` | 3.024 | `0x820C48EB` | raw1 flint 144×168 | 27,9 % pixel bianchi |
| `demo_2.raw6` | 34.200 | `0xBAC180D1` | raw6 emery 200×228 | 13 colori su 64 |
| `demo_2.raw1` | 3.024 | `0xD704FF85` | raw1 flint 144×168 | 94,1 % pixel bianchi |

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

Previsione fatta dal tool con la stessa regola di `src/c/luma.h` (campionamento 1 px su 2, fascia
dell'ora: `y 0..105` su emery, `y 0..75` su flint); serve a controllare che la watchface scelga il
colore giusto senza dover leggere il bitmap a mano.

| Foto | Piattaforma | `bad_white` | `bad_black` | Y medio | Testo | Contorno |
|---|---|---|---|---|---|---|
| demo_1 | emery (5.300 campioni) | 0 % | 65 % | 22 | **BIANCO** | no |
| demo_1 | flint (2.736 campioni) | 20 % bianchi | 79 % neri | 52 | **BIANCO** | sì (sempre) |
| demo_2 | emery (5.300 campioni) | 98 % | 1 % | 242 | **NERO** | no |
| demo_2 | flint (2.736 campioni) | 97 % bianchi | 2 % neri | 248 | **NERO** | sì (sempre) |

Verificato sull'emulatore (S2, 27/08/2026): il log `luma:` della watchface riporta esattamente
questi numeri (`w 0 / b 65, mean 22` per demo_1; `w 98 / b 1, mean 242` per demo_2). Nessuna delle
due supera il 15 % di conflitto su emery, quindi il contorno automatico resta spento: per vederlo
si usa l'hook `GALLERIA_DEFINES="GALLERIA_DEBUG_OUTLINE=1" pebble build`.

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
decoder a streaming che da S4 riceverà i chunk persist da 256 B. Peso sulle risorse: 68.400 B su
emery (2 × 34.200) e 6.048 B su flint (2 × 3.024), ben sotto il tetto di 256 KB.

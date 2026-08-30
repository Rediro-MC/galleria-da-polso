# Asset per lo store — Galleria (S7 §2.12)

Immagini di presentazione dell'app (icone + screenshot) per la pubblicazione con
`pebble publish`. **Generate**, mai ritoccate a mano: l'unica sorgente di verita' e'
`make_assets.py`. Nessuna cornice, nessun testo aggiunto, nessun fotoritocco.

## Provenienza

Gli asset derivano dagli screenshot del **gate S7** (emulatore, build normale,
layout A, font Anton, 24 h, foto demo):

| Sorgente | Piattaforma | Dimensioni |
|---|---|---|
| `../../../docs/design/galleria/s7_emery_a_anton_dark.png` (gate S7, 10:11, demo 1 aurora: testo bianco, più leggibile nelle icone) | `emery` (Pebble Time 2) | 200x228 |
| `../../../docs/design/galleria/s7_flint_a_anton.png` | `flint` (Pebble 2 Duo) | 144x168 |

Le **icone** sono un ritaglio quadrato 200x200 dello screenshot emery, centrato
verticalmente (`y` da 14 a 214, cioe' `(228-200)/2`): comprende l'ora grande, la riga
di stato (batteria / passi / data) e la parte alta della foto. Il ritaglio viene poi
ridimensionato con **LANCZOS** alle tre taglie richieste.

> Nota: la foto di sfondo delle demo e' **CC-BY-SA-4.0 e serve solo per i test**
> (vedi `CLAUDE.md` dell'app). Prima della pubblicazione vera (S9) le demo vanno
> sostituite e **questi asset vanno rigenerati** dagli screenshot nuovi.

## Rigenerazione

```bash
cd ~/ProgettiClaude/Pebble/apps/galleria
python3 store/make_assets.py            # rigenera (idempotente: riscrive solo cio' che cambia)
python3 store/make_assets.py --check     # verifica senza scrivere (exit 1 se qualcosa differisce)
```

Richiede solo la stdlib di Python 3 e **Pillow**. Lo script fallisce subito se una
sorgente manca o non ha le dimensioni attese.

## File prodotti

| File | Dimensioni | Mode | Uso |
|---|---|---|---|
| `icon_48.png` | 48x48 | RGB | `pebble publish --icon-small` |
| `icon_80.png` | 80x80 | RGB | taglia intermedia (listing / anteprime) |
| `icon_144.png` | 144x144 | RGB | `pebble publish --icon-large` |
| `emery_screenshot_1.png` | 200x228 | RGB | screenshot Pebble Time 2 (`pebble publish --screenshots`) |
| `flint_screenshot_1.png` | 144x168 | RGB | screenshot Pebble 2 Duo (`pebble publish --screenshots`) |

Gli screenshot conservano i pixel dello screenshot del gate (nessun ridimensionamento);
l'unica differenza rispetto ai file di `docs/design/galleria/` e' la conversione da
RGBA a **RGB** (canale alfa opaco e inutile, rimosso).

### Nome degli screenshot

`pebble publish --help` (Pebble Tool v5.0.39) dice, per `--screenshots`:

> Local screenshot/GIF files to upload in `--non-interactive` mode. Filenames must
> start with the platform name, e.g. `emery_screenshot.png`.

Il tool **richiede il prefisso di piattaforma all'inizio del nome**: per questo i file
si chiamano `<piattaforma>_screenshot_N.png` (la spec S7 §2.12 diceva
`screenshot_<piattaforma>_N.png`, corretta il 30/08/2026).

## Argomenti di `pebble publish`

```bash
pebble publish \
  --icon-small  store/icon_48.png \
  --icon-large  store/icon_144.png \
  --screenshots store/emery_screenshot_1.png store/flint_screenshot_1.png
```

Il comando completo per S9 (nome, versione, descrizione, categoria, `--source`,
`--release-notes`, `--is-published`) resta da definire: vedi `PIANO.md` §4 S9 e la
bozza in inglese della descrizione store in `apps/galleria/README.md`.
Galleria e' una **watchface**: nessun banner richiesto.

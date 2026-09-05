# Asset per lo store — Galleria (S7 §2.12, sorgenti aggiornate in S9-prep)

Immagini di presentazione dell'app (icone + screenshot) per la pubblicazione con
`pebble publish`. **Generate**, mai ritoccate a mano: l'unica sorgente di verita' e'
`make_assets.py`. Nessuna cornice, nessun testo aggiunto, nessun fotoritocco.

## Provenienza

Gli asset derivano dagli screenshot del **gate S9-prep** (05/09/2026, emulatore, build
normale, layout A, font Anton, 24 h, album vuoto -> foto demo **CC0**):

| Sorgente | Piattaforma | Dimensioni | Cosa ne esce |
|---|---|---|---|
| `../../../docs/design/galleria/s9_emery_a_anton_scura.png` (demo 1, aurora sul fiordo: testo bianco, piu' leggibile nelle icone) | `emery` (Pebble Time 2) | 200x228 | `icon_144/80/48.png` + `emery_screenshot_1.png` |
| `../../../docs/design/galleria/s9_flint_a_anton_chiara.png` (demo 2, Bryce Canyon: la scena si legge meglio in B/N) | `flint` (Pebble 2 Duo) | 144x168 | `flint_screenshot_1.png` |

Le **icone** sono un ritaglio quadrato 200x200 dello screenshot emery, centrato
verticalmente (`y` da 14 a 214, cioe' `(228-200)/2`): comprende l'ora grande, la riga
di stato (batteria / passi / data) e la parte alta della foto. Il ritaglio viene poi
ridimensionato con **LANCZOS** alle tre taglie richieste.

Le due foto demo sono **CC0 1.0** (Wikimedia Commons, S9-prep): si possono usare senza
problemi nelle immagini dello store. Provenienza, autori e verifica della licenza in
[`../resources/photos/README.md`](../resources/photos/README.md). Se le demo o il gate
cambiano, **questi asset vanno rigenerati** (`make_assets.py`).

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
| `icon_48.png` | 48x48 | RGB | listing / anteprime e procedura Rebble (taglia del vecchio portale) |
| `icon_80.png` | 80x80 | RGB | `pebble publish --icon-small` |
| `icon_144.png` | 144x144 | RGB | `pebble publish --icon-large` |
| `emery_screenshot_1.png` | 200x228 | RGB | screenshot Pebble Time 2 (`pebble publish --screenshots`) |
| `flint_screenshot_1.png` | 144x168 | RGB | screenshot Pebble 2 Duo (`pebble publish --screenshots`) |

Gli screenshot conservano i pixel dello screenshot del gate (nessun ridimensionamento);
l'unica differenza rispetto ai file di `docs/design/galleria/` e' la conversione da
RGBA a **RGB** (canale alfa opaco e inutile, rimosso).

### Nome degli screenshot

`pebble publish --help` (Pebble Tool v5.0.40, riverificato il 05/09/2026) dice, per `--screenshots`:

> Local screenshot/GIF files to upload in `--non-interactive` mode. Filenames must
> start with the platform name, e.g. `emery_screenshot.png`.

Il tool **richiede il prefisso di piattaforma all'inizio del nome**: per questo i file
si chiamano `<piattaforma>_screenshot_N.png` (la spec S7 §2.12 diceva
`screenshot_<piattaforma>_N.png`, corretta il 30/08/2026).

### Taglia delle icone (pebble-tool 5.0.40)

Nel **pebble-tool 5.0.40** i prompt interattivi dicono **`iconSmall` 80x80** e
**`iconLarge` 144x144** (`publish.py:759-760`): `--icon-small` vuole quindi
**`icon_80.png`**, non `icon_48.png` (48x48 era la taglia del vecchio portale Rebble e
resta buona per il listing e le anteprime).

Per una **watchface** il flusso interattivo **non chiede le icone** (il blocco e' dentro
`if app_type == "watchapp"`), ma in modalita' non interattiva i due flag vengono letti
**a prescindere dal tipo di app** (`publish.py:819-820`) e caricati come
`iconSmall`/`iconLarge` se valorizzati (`:871-889`): passarle funziona. Se il server
rispondesse 400, il comando fallisce **senza creare l'app** e basta rilanciarlo senza i
due flag `--icon-*` (vedi `PUBLISH.md` §5).

## Argomenti di `pebble publish`

```bash
pebble publish \
  --icon-small  store/icon_80.png \
  --icon-large  store/icon_144.png \
  --screenshots store/emery_screenshot_1.png store/flint_screenshot_1.png
```

Il **comando completo** per S9 (nome, versione, descrizione, release notes, `--source`,
`--non-interactive`, `--no-gif-all-platforms`) e i prerequisiti stanno in
[`LISTING.md`](LISTING.md) §6; la ricerca riga per riga sul sorgente del tool, con le
trappole (visibilita', GIF, sostituzione degli screenshot, procedura Rebble), sta in
[`PUBLISH.md`](PUBLISH.md). Galleria e' una **watchface**: nessun banner richiesto.

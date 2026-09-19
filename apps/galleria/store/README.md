# Asset per lo store — Galleria (S7 §2.12, sorgenti aggiornate in S9-prep e il 18-19/09/2026)

Immagini di presentazione dell'app (icone + screenshot) per la pubblicazione con
`pebble publish`. **Generate**, mai ritoccate a mano: l'unica sorgente di verità è
`make_assets.py`. Nessuna cornice, nessun testo aggiunto, nessun fotoritocco.

## Provenienza

Gli asset derivano da screenshot in `docs/design/galleria/`: i due storici dal **gate
S9-prep** (05/09/2026, emulatore, build normale, layout A, font Anton, 24 h, album vuoto
-> foto demo **CC0**); i **sei in più** sono stati chiesti dall'utente nella **notte del
18/09/2026**, a 0.4.0 già pubblicata: tre alle 01:13, tre «ora a tutto schermo» alle
01:21 (più un settimo, poi tolto), fra cui i due `store040_*` girati apposta con
l'emulatore sulla build 0.4.0. Quel settimo, `emery_screenshot_6.png` (layout B
Staatliches trasparente da uno screenshot **S8-stile** del 04/09/2026, con una foto di
prova **CC-BY-SA-4.0**), non è mai stato online ed è stato **tolto il 19/09/2026** su
decisione dell'utente: tutte le sorgenti di oggi sono foto demo CC0.

| Sorgente | Piattaforma | Dimensioni | Cosa ne esce |
|---|---|---|---|
| `../../../docs/design/galleria/s9_emery_a_anton_scura.png` (demo 1, aurora sul fiordo: testo bianco, più leggibile nelle icone) | `emery` (Pebble Time 2) | 200x228 | `icon_144/80/48.png` + `emery_screenshot_1.png` |
| `../../../docs/design/galleria/s9_flint_a_anton_chiara.png` (demo 2, Bryce Canyon: la scena si legge meglio in B/N) | `flint` (Pebble 2 Duo) | 144x168 | `flint_screenshot_1.png` |
| `../../../docs/design/galleria/s9_emery_b_francois_trasparente3d_scura.png` (layout B, Francois One trasparente 3D; chiesto dall'utente il 18/09/2026) | `emery` | 200x228 | `emery_screenshot_2.png` |
| `../../../docs/design/galleria/s9_emery_a_anton_chiara.png` (demo 2 chiara: mostra il colore del testo automatico, nero) | `emery` | 200x228 | `emery_screenshot_3.png` |
| `../../../docs/design/galleria/s9_flint_a_anton_scura.png` (demo 1 scura su flint, testo bianco) | `flint` | 144x168 | `flint_screenshot_2.png` |
| `../../../docs/design/galleria/store040_emery_b_anton_scura.png` (layout B «Ora grande», Anton pieno; emulatore, build 0.4.0 con `GALLERIA_DEBUG_LAYOUT=1`, 18/09/2026) | `emery` | 200x228 | `emery_screenshot_4.png` |
| `../../../docs/design/galleria/s9_emery_b_francois_trasparente3d_chiara.png` (layout B, Francois One trasparente 3D su demo chiara) | `emery` | 200x228 | `emery_screenshot_5.png` |
| `../../../docs/design/galleria/store040_flint_b_anton_chiara.png` (layout B su flint, Anton nero su demo chiara; emulatore, build 0.4.0, 18/09/2026) | `flint` | 144x168 | `flint_screenshot_3.png` |

Le **icone** sono un ritaglio quadrato 200x200 dello screenshot emery, centrato
verticalmente (`y` da 14 a 214, cioè `(228-200)/2`): comprende l'ora grande, la riga
di stato (batteria / passi / data) e la parte alta della foto. Il ritaglio viene poi
ridimensionato con **LANCZOS** alle tre taglie richieste.

Le due foto demo sono **CC0 1.0** (Wikimedia Commons, S9-prep): si possono usare senza
problemi nelle immagini dello store (vale per **tutti gli otto screenshot** dal
19/09/2026: il settimo degli extra, `emery_screenshot_6.png` con foto CC-BY-SA-4.0,
è stato tolto).
Provenienza, autori e verifica della licenza in
[`../resources/photos/README.md`](../resources/photos/README.md). Se le demo o il gate
cambiano, **questi asset vanno rigenerati** (`make_assets.py`).

## Rigenerazione

```bash
cd ~/ProgettiClaude/Pebble/apps/galleria
python3 store/make_assets.py            # rigenera (idempotente: riscrive solo ciò che cambia)
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
| `emery_screenshot_1.png` | 200x228 | RGB | screenshot Pebble Time 2 (`pebble publish --screenshots`; online dal 05/09/2026) |
| `flint_screenshot_1.png` | 144x168 | RGB | screenshot Pebble 2 Duo (`pebble publish --screenshots`; online dal 05/09/2026) |
| `emery_screenshot_2.png` | 200x228 | RGB | layout B trasparente 3D: **online al 19/09/2026** (verificato), caricato dall'utente dalla dashboard fra il 18/09 e il 19/09/2026 (la CLI carica screenshot solo dentro una release: `PUBLISH.md` §5) |
| `emery_screenshot_3.png` | 200x228 | RGB | layout A su foto chiara (testo nero automatico): **online al 19/09/2026**, dalla dashboard come sopra |
| `flint_screenshot_2.png` | 144x168 | RGB | flint su foto scura: **online al 19/09/2026**, dalla dashboard come sopra |
| `emery_screenshot_4.png` | 200x228 | RGB | layout B «Ora grande», Anton pieno su aurora: **online al 19/09/2026**, dalla dashboard come sopra |
| `emery_screenshot_5.png` | 200x228 | RGB | layout B, Francois One trasparente 3D su demo chiara: **online al 19/09/2026**, dalla dashboard come sopra |
| `flint_screenshot_3.png` | 144x168 | RGB | layout B su flint, Anton nero su demo chiara: **online al 19/09/2026**, dalla dashboard come sopra |

`store/` ha così **8 screenshot** (5 emery + 3 flint, esattamente quelli online al
19/09/2026) + 3 icone.

Gli screenshot conservano i pixel della sorgente in `docs/design/galleria/` (nessun
ridimensionamento); l'unica differenza rispetto a quei file è la conversione da RGBA
a **RGB** (canale alfa opaco e inutile, rimosso).

Le copie **online** non sono gli stessi file (verificato il 19/09/2026): lo store
**ri-codifica tutti i PNG in modalità palette** — gli emery (13-18 KB contro i 37-59 KB
del repo) con pochi pixel diversi (differenza media 0,04-0,14 su 255, 19-24 colori
online), i flint (2,8-3,1 KB) pixel-identici a 2 colori —, quindi **nessuno è
byte-identico**. `make_assets.py --check` confronta con i **file del repo**, non con lo
store.

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

Per una **watchface** il flusso interattivo **non chiede le icone** (il blocco è dentro
`if app_type == "watchapp"`), ma in modalità non interattiva i due flag vengono letti
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
trappole (visibilità, GIF, sostituzione degli screenshot, procedura Rebble), sta in
[`PUBLISH.md`](PUBLISH.md). Galleria è una **watchface**: nessun banner richiesto.

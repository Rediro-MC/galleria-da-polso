# Pebble 2026 — Risorse community, codice di riferimento e librerie riusabili

**Data ricerca:** 24 agosto 2026
**Target:** Pebble Time 2 (platform `emery`) come primario, Pebble 2 Duo (platform `flint`) come secondario
**Obiettivi del progetto:** performance, sfruttare il display di PT2, funzionamento offline-first, basso consumo di memoria
**Ambiente di sviluppo:** Ubuntu 26.04 x86_64, NO sudo, Python 3.14, Node 22 + npm, gcc 15, no Docker/QEMU/arm-none-eabi-gcc

> **Nota di lettura.** Ogni affermazione è marcata `[CONF]` (confermata da fonte primaria, con URL) oppure `[INF]` (inferenza/valutazione mia). Attenzione alla distinzione fondamentale fra il **Pebble Time 2 del 2016** (mai prodotto, Kickstarter cancellato, ma il cui platform `emery` era già nel SDK 4.2-beta4 dell'ottobre 2016) e il **Pebble Time 2 del 2025-2026** prodotto da Core Devices, che riusa lo stesso identificativo di platform `emery` e la stessa risoluzione 200x228, ma con SoC, firmware e SDK completamente diversi.

---

## 0. Sintesi esecutiva

L'ecosistema Pebble nel 2026 è **vivo e in forte crescita**, ma è **spaccato in due epoche** e questo è il rischio principale per chi inizia adesso:

1. **Il "layer 2016"** — `github.com/pebble-examples`, `github.com/pebble-hacks`, la maggior parte dei pacchetti npm con keyword `pebble-package`, i tutorial Rocky.js. Congelato fra il 2016 e il 2018. Compila ancora (spesso), ma contiene API rimosse e assunzioni su display 144x168.
2. **Il "layer 2026"** — `github.com/coredevices`, `github.com/pebble-dev`, ~20 pacchetti npm risuscitati fra dicembre 2025 e luglio 2026, il nuovo framework JavaScript **Alloy**, CloudPebble tornato online, e centinaia di watchface nuove su GitHub.

**Numeri chiave:** al 24/08/2026 la ricerca GitHub restituisce **411 repo** con "pebble watchface" pushati dopo il 2026-03-01 `[CONF]` — l'ecosistema di esempi è quindi enorme e recentissimo.

**Le tre cose più importanti da sapere subito:**
- **Rocky.js è morto.** Il runtime JerryScript/RockyJS è stato **rimosso** dal firmware nell'SDK 4.9.148 (26/03/2026). Non investire un minuto su quei tutorial. `[CONF]`
- **Alloy** (Moddable XS) è il nuovo JavaScript on-watch, ma gira **solo su emery e gabbro**. `[CONF]`
- Per i tuoi obiettivi (performance + memoria + offline) **la scelta corretta è C**, non Alloy. Vedi §8.

---

## 1. Dove vivono documentazione e guide nel 2026

### 1.1 I due siti developer — quale è canonico

Esistono **due** siti developer e la confusione è reale:

| Sito | Chi lo gestisce | Repo sorgente | Stato 2026 |
|---|---|---|---|
| **`developer.repebble.com`** | **Core Devices** | `github.com/coredevices/sdk-docs` (push 2026-08-14) | **CANONICO.** Contiene emery/flint/gabbro, Alloy, changelog SDK 4.33.1 |
| `developer.rebble.io` | Rebble (community) | `github.com/pebble-dev/developer.rebble.io` (push 2026-06-22) | Fork storico di `developer.pebble.com`. Utile come archivio, ma **non** documenta Alloy né i nuovi platform |

`[CONF]` — https://github.com/coredevices/sdk-docs · https://github.com/pebble-dev/developer.rebble.io

> **Azione:** usa **sempre** `developer.repebble.com`. Se un risultato Google ti manda su `developer.rebble.io`, sostituisci il dominio e ricontrolla: molte pagine hanno lo stesso path.

### 1.2 Struttura delle guide su developer.repebble.com

Indice completo: https://developer.repebble.com/guides/toc/ `[CONF]`

Le 12 sezioni sono: **Alloy** (17 guide, tutte nuove), **App Resources** (9), **Best Practices** (3), **Communication** (7), **Debugging** (5), **Design and Interaction** (6), **Events and Services** (13), **Graphics and Animations** (4), **Pebble Packages** (2), **Pebble Timeline** (6), **Tools and Resources** (7), **User Interfaces** (9).

Guide più rilevanti per i tuoi obiettivi:

- `/guides/best-practices/building-for-every-pebble/` — define e macro condizionali per platform
- `/guides/best-practices/conserving-battery-life/`
- `/guides/best-practices/modular-app-architecture/`
- `/guides/events-and-services/persistent-storage/` — **chiave per offline-first**
- `/guides/events-and-services/touch/` — **nuovo**, touch su emery/gabbro
- `/guides/graphics-and-animations/framebuffer-graphics/` — accesso diretto al framebuffer, massime performance
- `/guides/user-interfaces/unobstructed-area/` — Timeline Quick View
- `/guides/tools-and-resources/internationalization/`
- `/guides/app-resources/platform-specific/` — risorse `~emery`

### 1.3 API reference

- **SDK Documentation:** https://developer.repebble.com/docs/ — reference completa C + PebbleKit JS `[CONF]`
- Il repo `sdk-docs` contiene doxygen pre-generato per platform (`aplite/doxygen_sdk/`, `basalt/doxygen_sdk/`, ...) — utile per diff fra platform `[CONF]`

### 1.4 Changelog SDK — la fonte più densa di informazioni

https://developer.repebble.com/sdk/changelogs/ — sorgenti in `source/_changelogs/*.md` `[CONF]`

| Versione | Data | Contenuto principale |
|---|---|---|
| **4.33.1** | **2026-08-14** | **Ultima.** Hotfix crash recognizer touch; aggiorna solo l'emulatore (firmware 4.33.2) |
| 4.33 | 2026-08-12 | Touch API per app, HRV, app binary 128 KiB su emery/gabbro, picolibc |
| 4.9.169 | 2026-05-01 | Speaker API (`PBL_SPEAKER`), touch esposto (`PBL_TOUCH`), RGB backlight (`PBL_RGB_BACKLIGHT`), Moddable 8.0.0 |
| 4.9.148 | 2026-03-26 | **Rimozione RockyJS/JerryScript**, ebraico, spazi Unicode |
| 4.9.127 | 2026-02-20 | **Alloy**, platform `Flint` e `Gabbro`, toolchain GCC 14, WAF 2.1.4, tutti gli script SDK portati a Python 3 |

`[CONF]` — https://raw.githubusercontent.com/coredevices/sdk-docs/main/source/_changelogs/4.33.md e file adiacenti

### 1.5 PebbleOS — documentazione firmware

Repo: **https://github.com/coredevices/PebbleOS** (1.345 star, push 2026-08-24) `[CONF]`

- Docs pubblicate su **https://pebbleos-core.readthedocs.io** `[CONF]`
- `docs/development/qemu.md` — workflow emulatore
- `docs/development/sdk_export.md` — come il firmware esporta l'SDK
- `docs/development/contributing.md` — include regole esplicite sull'uso di AI
- Contiene `flake.nix` (build Nix del firmware), `crowdin.yml` (i18n via Crowdin/gettext), `AGENTS.md`, `.claude/CLAUDE.md`, `.agents/skills/working-with-qemu` `[CONF]`

Interessa a te soprattutto come **fonte di verità sul comportamento reale delle API**: quando la doc è ambigua, `src/` del firmware risponde.

---

## 2. Forum, chat, blog, newsletter

### 2.1 Canali ufficiali (link estratti dai sorgenti della doc, quindi affidabili)

| Canale | URL | Note |
|---|---|---|
| **Pebble Developer Forum** | https://forum.repebble.com/c/developers-ask-questions-and-get-help/7 | **Il posto giusto per domande tecniche.** Linkato esplicitamente dalla pagina di installazione SDK |
| **Rebble Discord** | https://discord.com/invite/aRUAYFN | Canale **`#sdk-dev`** indicato dalla doc ufficiale per problemi di SDK/emulatore |
| Community page | https://developer.repebble.com/community/online/ | |
| Blog Core Devices | https://repebble.com/blog | |
| Blog Eric Migicovsky | https://ericmigi.com/blog/ | CEO Core Devices |
| Blog Rebble | https://rebble.io/blog/ | |
| Reddit | r/pebble | Attivo, ma bassa densità tecnica `[INF]` |

`[CONF]` — link Discord e forum estratti da https://raw.githubusercontent.com/coredevices/sdk-docs/main/source/sdk/index.md

### 2.2 Post di blog 2025-2026 da leggere

- **2026-02-20** — *CloudPebble Returns! Plus New Pure JavaScript and Round 2 SDK* — https://repebble.com/blog/cloudpebble-returns-plus-pure-javascript-and-round-2-sdk `[CONF]`
- **2026-04-02** — *Spring 2026 Pebble App Contest + SDK Updates* — https://repebble.com/blog/spring-2026-pebble-app-contest — annuncia `pebble publish`, Quick View, Alloy fuori da developer preview, **schemi elettrici e CAD 3D di PT2 pubblicati** `[CONF]`
- **2026-04-28** — *Spring 2026 Dev Contest Results* — https://repebble.com/blog/spring-2026-dev-contest-results `[CONF]`
- **2026-03-24** — *Pebble Time 2 Is In Mass Production!* `[CONF]`
- **2026-01-02** — *Pebble Round 2* `[CONF]`

### 2.3 Stato Rebble come organizzazione

Prima **Rebble Board Election** conclusa il **31/03/2026**; il board sta pianificando il terzo hackathon e il ruolo di Rebble nel "mondo Pebble 2.0" `[CONF]` — https://rebble.io/blog/

`[INF]` Rebble resta rilevante per i servizi web (weather, timeline-sync, appstore, ASR, language packs) più che per l'SDK, che ora è di Core Devices.

---

## 3. Repository di esempio

### 3.1 Galleria ufficiale curata

**https://developer.repebble.com/examples/** — 20 esempi curati, con tag per categoria `[CONF]`

Watchface: **Mercury** (`JavierRizzoA/Pebble-Mercury`), **Halcyon** (`freakified/halcyon`), **TimeStyle** (`freakified/TimeStylePebble`), **Simple Analog**, **Concentricity**, **KS Clock Face**, **Classio Battery Connection**, **Isotime**, **Time Dots**, più tre watchface Alloy/Piu (**Cupertino**, **Redmond**, **Zurich**).
Giochi: **Pandas and Bananas**, **Block World**.
Utility/tecnici: **UI Patterns**, **Weather Cards** (Draw Commands API), **Pebble Compass**, **Pebble Faces**, **Piu Balls**, **Poco QR Code**.

### 3.2 Organizzazioni GitHub — chi è vivo e chi è morto

| Org | Repo | Ultimo push | Verdetto |
|---|---|---|---|
| **`coredevices`** | 51 | 2026-08-24 | **VIVO — fonte primaria** |
| **`pebble-dev`** (Rebble) | 86 | 2026-08-23 | **VIVO** |
| `pebble-examples` | 100 | **2018-10-10** | **CONGELATO 2016-2018** |
| `pebble-hacks` | 44 | 2025-12-06 (solo `pebble-compass`) | **CONGELATO** |

`[CONF]` — GitHub API `/orgs/{org}/repos`

> **Implicazione pratica:** gli esempi in `pebble-examples` sono **didatticamente ottimi ma tecnicamente datati**. Scritti per 144x168, non usano `PBL_TOUCH`, non hanno `emery` in `targetPlatforms`. Usali per capire le API, non come base di partenza.

### 3.3 Repo `coredevices` più rilevanti

| Repo | Linguaggio | Star | Push | Perché ti interessa |
|---|---|---|---|---|
| `PebbleOS` | C | 1.345 | 2026-08-24 | Verità sul comportamento delle API |
| `mobileapp` | Kotlin | 849 | 2026-08-20 | App companion Android/iOS |
| `pebble-tool` | Python | 72 | 2026-08-18 | La CLI |
| **`pebble-watchface-agent-skill`** | C | **70** | 2026-08-05 | **Claude Code skill ufficiale — vedi §7** |
| `cloudpebble` | Python | 31 | 2026-08-23 | IDE browser |
| `qemu` | C | — | 2026-08-18 | "QEMU, but Pebble" |
| `pebble-browser-app` | JavaScript | 8 | 2026-08-09 | Browser web per PT2/Round 2 — esempio Alloy avanzato |
| `pebble-compass` | C | 2 | 2026-07-27 | App compass ufficiale |

`[CONF]` — https://github.com/coredevices

### 3.4 App open-source moderne da cui imparare (aggiornate 2026)

Questi sono i riferimenti che consiglio davvero, tutti verificati con push nel 2026:

#### `freakified/halcyon` — **il miglior modello complessivo** ⭐
- 35 star, push **2026-07-06**, licenza aperta
- `targetPlatforms`: **tutti e 7** — `aplite, basalt, chalk, diorite, emery, flint, gabbro` `[CONF]`
- Architettura C modulare esemplare: `src/c/main.c`, `drawUtils_rect.c` + `drawUtils_round.c` (separazione forma display!), `settings.c/h`, `messaging.c/h`, `solarUtils.c/h`, `widgets.c/h`, `text_metrics.h`, `languages.c/h`
- **i18n con ~30 lingue** in `src/pkjs/languages/*.js` + script di verifica `scripts/check-languages.js`
- **Config page in React + TypeScript + Vite** (`config-page/`), deployata su GitHub Pages via `.github/workflows/deploy.yml` — alternativa moderna a Clay
- `capabilities`: `location`, `configurable`, `health`
- https://github.com/freakified/halcyon

#### `freakified/TimeStylePebble` — **228 star**, il watchface C più popolare
- Push 2026-06-06, C, 16 contributor
- Riferimento per configurazione estesa e gestione di molti moduli
- https://github.com/freakified/TimeStylePebble

#### `pebble-dev/bobby-assistant` ("Tiny Assistant") — app complessa reale
- 60 star, push 2026-05-01, **Apache 2.0**
- `package.json` reale del 2026: dipende da **`@rebble/clay ^1.0.6`** e **`pebble-events ^1.2.0`**, `enableMultiJS: true`, `targetPlatforms: ["basalt","diorite","emery"]` `[CONF]`
- Mostra: risorse platform-specific (`button_indicator~emery.png`), font `.pbf`, animazioni vettoriali `.pdcs`, icone `.pdc` con sorgente `.svg`, protocollo AppMessage ricco con `messageKeys` array (`"GET_ALARM_RESULT[9]"`)
- Include un `CMakeLists.txt` che **non builda nulla** — serve solo a far capire il progetto a CLion `[CONF]` (trucco utile per IDE/clangd)
- https://github.com/pebble-dev/bobby-assistant

#### `C-D-Lewis/pebble-dev` — 45 star, push 2026-08-19
Collezione di watchapp e watchface di uno storico sviluppatore Pebble.

#### `AKlitbo/pebble-watchfaces` — push 2026-08-14
"A collection of watchfaces for current Pebble hardware, **sharing one engine**" — pattern interessante: un motore condiviso, più watchface. `[CONF]`

#### Watchface nativamente emery (per vedere layout 200x228 reali)
- `gerbert/grid` — "//GRID: Pebble Time 2/Pebble 2 Duo (Emery/Flint) Watchface" (2026-08-22)
- `kooscode/kface` — "emery watchface: time, date, battery, weather, heart rate, steps" (2026-08-22)
- `cletqui/ticdot` — "Minimal analog watchface for Pebble Time 2" (2026-08-23)
- `bilarikan/pebble-watchface-weekface` — "A Pebble Time 2 watchface built around how weeks structure a year"
- `asebrech/fdf-time` — rendering 3D wireframe, **proiezione trimetrica solo-interi**, animazioni morph — ottimo esempio di grafica performante senza float `[CONF]`
- `lanrat/pebble-2048-touch` — gioco che usa il **touch** di PT2, con CI completa

`[INF]` Questi hanno poche star ma sono aggiornatissimi: la loro utilità è vedere costanti di layout reali per 200x228, non qualità architetturale.

#### Esempi Alloy (JavaScript/TypeScript on-watch)
- `Moddable-OpenSource/pebble-examples` — Piu (dichiarativo) e Poco (procedurale): watchface Cupertino/Redmond/Zurich, `hellopiu-balls`, `hellopoco-qrcode` `[CONF]`
- `emindeniz99/pebble-signals` — "Fine-grained reactive UI for Pebble watches — Solid-style signals + JSX, no VDOM, on Moddable XS/Piu (Pebble Alloy)" (2026-08-15) `[CONF]`

---

## 4. Librerie riusabili via Pebble Packages (npm)

### 4.1 Come funzionano

I Pebble Packages sono **pacchetti npm** con keyword `pebble-package`, installati con:

```bash
pebble package install pebble-somelib
```

In C: `#include <pebble-somelib/somelib.h>` — in JS: `var somelib = require('pebble-somelib');`

Registry: https://www.npmjs.com/search?q=keywords:pebble-package
Doc: https://developer.repebble.com/guides/pebble-packages/using-packages/ `[CONF]`

> **Avvertenza dalla doc ufficiale:** *"Packages that depend on being run in node, or in a real web browser, are likely to fail."* `[CONF]`

### 4.2 Censimento completo — MANTENUTI nel 2026

Ho interrogato il registry npm il 24/08/2026: **76 pacchetti** totali con keyword `pebble-package`, di cui **21 aggiornati fra dicembre 2025 e luglio 2026**. `[CONF]`

| Pacchetto | Versione | Ultima pubbl. | A cosa serve | Rilevanza per te |
|---|---|---|---|---|
| **`pebble-slide-layer`** | 1.2.0 | 2026-07-13 | Effetti slide per layer | Media |
| **`pebble-effect-layer`** | 1.5.0 | 2026-07-12 | Effetti visivi su layer (invert, blur, mirror...) | Media |
| **`pebble-scalable`** | 2.3.0 | 2026-07-08 | *"make it easy to make scaling layouts for different display sizes"* | **ALTA — pensato esattamente per il salto 144x168 → 200x228** |
| **`pebble-packet`** | 1.6.1 | 2026-07-04 | Wrapper AppMessage per int/bool/string con error reporting; evita `DictionaryIterator` a mano | **ALTA** |
| `pebble-clay-preview-component` | 0.0.3 | 2026-06-23 | Componente custom per Clay | Media |
| **`pebble-simple-health`** | 1.0.7 | 2026-06-12 | Wrapper HealthService | Alta se fai app health |
| **`pebble-events`** | 1.2.1 | 2026-05-24 | *"A library to fix the Pebble SDK's event services"* — permette **sottoscrizioni multiple** agli event service | **ALTISSIMA — vedi §4.4** |
| **`@rebble/clay`** | **1.0.10** | **2026-05-21** | **Fork mantenuto di Clay** (config page offline) | **ALTISSIMA** |
| `pebble-ifcalendar-complication` | 1.0.2 | 2026-05-04 | Complication calendario | Bassa |
| `pebble-isometric` | 1.6.0 | 2026-04-05 | Rendering isometrico | Bassa/creativa |
| **`enamel`** | 1.4.0 | 2026-03-25 | **Genera helper C dal file di config Clay** (script Python) | **ALTA** |
| `pebble-graph` | 1.0.1 | 2026-03-23 | Libreria grafici minimale | Media |
| `@rebble/linked-list` | 1.5.1 | 2026-03-17 | Linked list | Media |
| **`pebble-universal-fb`** | **1.11.0** | 2026-02-25 | **Framebuffer universale** — accesso diretto ai pixel astraendo i formati per platform | **ALTA per performance grafica** |
| **`pebble-fctx`** | **1.6.5** | 2026-02-22 | **Grafica vettoriale antialiased** con font vettoriali | **ALTISSIMA per sfruttare 202 PPI** |
| `pebble-utf8` | 1.0.4 | 2026-02-22 | Funzioni su stringhe UTF-8 | Media |
| `pebble-pge` / `pebble-pge-simple` | 1.8.0 / 1.1.0 | 2026-02-22 | Game engine a loop | Bassa |
| `pebble-timeline-js` | 2.2.0 | 2026-02-22 | Pin timeline personali + AppGlance | Media |
| `pebble-clay-kennedn` | 1.0.4 | 2026-01-18 | Fork alternativo di Clay | Bassa |
| `@rebble/sdk-c-utils` | 1.2.3 | 2025-12-08 | Macro C di comodità | Media |

Repo confermati attivi: `pebble-dev/clay` (push 2026-08-03), `Katharine/pebble-events` (2026-05-24), `gregoiresage/enamel` (2026-03-25), `jrmobley/pebble-fctx` (45 star, 2026-02-22). `[CONF]`

### 4.3 Censimento — ABBANDONATI (NON usare senza fork)

| Pacchetto | Ultima versione | Ultima pubbl. | Sostituto |
|---|---|---|---|
| **`pebble-clay`** | 1.0.4 | **2016-11-21** | → **`@rebble/clay`** |
| `pebble-generic-weather` | 1.1.6 | **2016-10-18** | Nessuno mantenuto — vedi §4.5 |
| `pebble-owm-weather` | 1.0.0 | **2016-06-07** | Nessuno mantenuto |
| `pebble-layout` | 2.1.0 | **2018-08-31** | Nessuno |
| `pebble-hourly-vibes` | 1.1.0 | 2016-11-22 | banale da reimplementare |
| `@smallstoneapps/*` (10 pacchetti) | varie | 2016 | `@rebble/linked-list`, `@rebble/sdk-c-utils` |
| `pebble-battery-bar`, `pebble-bluetooth-icon` | | 2016-10-19 | banali |
| `pebble-math-sll` (fixed point) | 1.19.2 | 2016-10-14 | ancora valido `[INF]`, è matematica pura |
| `pebble-fctx-compiler` | 1.2.2 | 2016-12-04 | ⚠️ **il compiler SVG→binario NON è stato aggiornato** mentre `pebble-fctx` sì |

`[CONF]` — dati dal registry npm, interrogato 2026-08-24

### 4.4 Le tre librerie che ti consiglio davvero

**1. `pebble-events` — quasi obbligatoria se usi altre librerie**
Il SDK Pebble permette **una sola** sottoscrizione per event service (tick, battery, connection, accel...). Se la tua app e una libreria si sottoscrivono entrambe al `TickTimerService`, una delle due viene silenziosamente scollegata. `pebble-events` risolve con `events_tick_timer_service_subscribe()` ecc. `[CONF]` — https://github.com/Katharine/pebble-events

**2. `@rebble/clay` — configurazione offline**
Clay genera una config page HTML **inclusa nel .pbw**, servita localmente dall'app telefono. Non richiede hosting né connessione a un tuo server. `[CONF]` — https://github.com/pebble-dev/clay
`[INF]` Perfettamente allineato al tuo requisito offline-first, a differenza di una config page su GitHub Pages (come Halcyon) che richiede rete.

**3. `enamel` — elimina il boilerplate Clay↔C**
Script Python che legge il `config.json` di Clay e genera getter C tipizzati (`enamel_get_BackgroundColor()`), gestendo persistenza e AppMessage. `[CONF]` — https://github.com/gregoiresage/enamel
`[INF]` Combinato con Clay riduce di molto il codice di settings, che è tipicamente il 30% di un watchface configurabile.

### 4.5 Il buco: nessuna libreria meteo mantenuta

`pebble-generic-weather` e `pebble-owm-weather` sono fermi al 2016 e puntano a endpoint API v2.5 di OpenWeatherMap ormai dismessi `[INF]`.

**Alternativa confermata:** Rebble gestisce `weather.rebble.io` — repo `pebble-dev/rebble-weather` (14 star, push 2026-07-04) `[CONF]`.
`[INF]` Per un'app offline-first la strategia giusta è comunque: PKJS fa il fetch quando il telefono c'è, l'app C persiste l'ultimo dato valido + timestamp, e mostra il dato con indicazione di "staleness" quando è offline.

---

## 5. Template, CI/CD, Nix, testing, linting, i18n

### 5.1 Installazione SDK — il percorso per il tuo ambiente (no sudo)

Istruzioni ufficiali: https://developer.repebble.com/sdk/ `[CONF]`

```bash
# 1. installa uv (Python package manager) in user space
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. installa la CLI (richiede Python >= 3.10)
uv tool install pebble-tool

# 3. scarica l'SDK (include toolchain ARM e QEMU)
pebble sdk install latest

# 4. nuovo progetto
pebble new-project myproject
cd myproject
pebble build
```

- **`pebble-tool` 5.0.39**, pubblicato **2026-06-30** su PyPI, `requires_python >= 3.10` `[CONF]` — https://pypi.org/pypi/pebble-tool/json
- `pebble sdk install` **scarica la toolchain ARM e QEMU** `[CONF]` → **non ti serve `arm-none-eabi-gcc` di sistema né sudo per compilare** ✅
- ⚠️ Le dipendenze Ubuntu elencate dalla doc (`libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g libsndio7.0`) richiedono sudo e servono **all'emulatore QEMU**, non alla compilazione `[CONF]` + `[INF]`

**Trucco utile per ambienti headless/CI**, estratto da una CI reale:
```bash
mkdir -p ~/.pebble-sdk && touch ~/.pebble-sdk/NO_TRACKING
```
disattiva il prompt di analytics al primo avvio `[CONF]` — https://github.com/Carles-Figuerola/home-assistant-shortcuts/blob/main/.github/workflows/release.yml

### 5.2 Se l'emulatore locale non parte: due vie di uscita

**A) `ericmigi/pebble-qemu-wasm` — emulatore Pebble nel browser** ⭐
- **67 star**, push 2026-08-24
- Port dell'emulatore QEMU Pebble a **WebAssembly** via Emscripten (backend TCI)
- **Istanza live: https://ericmigi.github.io/pebble-qemu-wasm/** — zero installazione
- **La piattaforma testata e funzionante è proprio `emery`** (le altre sono definite ma non verificate)
- ~8.500 righe di C, 27 file di device model portati su QEMU 10.1
`[CONF]` — https://github.com/ericmigi/pebble-qemu-wasm

**B) CloudPebble — https://cloudpebble.repebble.com**
IDE completo nel browser, tornato online il 20/02/2026. Compila e ha emulatore integrato. Il database originale è andato perso, quindi i progetti storici vanno reimportati; GitHub sync e linting non sono ancora riattivati. `[CONF]`

`[INF]` Con `pebble install --cloudpebble` puoi anche installare direttamente sull'orologio via telefono, saltando del tutto l'emulatore locale (richiede "Enable Dev Connect" nella app mobile + `pebble login` con GitHub) `[CONF]`.

### 5.3 Nix — `pebble-dev/pebble.nix` ⭐

**68 star, push 2026-07-23, licenza MIT** `[CONF]` — https://github.com/pebble-dev/pebble.nix

```bash
# nuovo progetto
nix run github:pebble-dev/pebble.nix#pebble-tool -- new-project <name>

# inizializza il template flake
nix flake init -t github:pebble-dev/pebble.nix

# entra nell'ambiente
nix develop
```

Fornisce toolchain ARM, SDK, emulatore e utility tramite la funzione `pebbleEnv`, parametrizzabile con `devServerIP`, `emulatorTarget`, `cloudPebble`, `CFLAGS`. Ha binary cache Cachix (`cachix use pebble`), supporto `direnv`, e build App Store con metadati.

`[INF]` **Nix si installa senza root** (single-user install) ed è quindi un'ottima opzione per il tuo vincolo no-sudo — potenzialmente risolve anche le librerie di sistema per QEMU, che verrebbero fornite dal Nix store invece che da apt. Da verificare praticamente.

### 5.4 GitHub Actions per buildare e rilasciare `.pbw`

Non esiste una action ufficiale marketplace `[INF]`, ma il pattern è consolidato: **75 repo** hanno workflow che chiamano `pebble sdk install` `[CONF]`.

**Ricetta minima 2026** (adattata da `lanrat/pebble-2048-touch`, `.github/workflows/release.yml`) `[CONF]`:

```yaml
name: Build Release
on:
  push:
    tags: ['v*.*']
  workflow_dispatch:
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Install uv
        uses: astral-sh/setup-uv@v7
        with:
          enable-cache: auto
      - name: Install Pebble SDK
        run: |
          uv tool install pebble-tool
          echo "$HOME/.local/bin" >> $GITHUB_PATH
      - run: pebble sdk install latest
      - run: pebble build
      - uses: actions/upload-artifact@v7
        with:
          name: my-watchface
          path: ${{ github.workspace }}/build/*.pbw
      - uses: softprops/action-gh-release@v2
        if: github.ref_type == 'tag'
        with:
          generate_release_notes: true
          files: ${{ github.workspace }}/build/*.pbw
```

Varianti utili viste in repo reali:
- **pinnare la versione SDK**: `pebble sdk install 4.9.148` (`Carles-Figuerola/home-assistant-shortcuts`) `[CONF]`
- **pinnare Python**: `uv tool install pebble-tool --python 3.13` `[CONF]` — ⚠️ `[INF]` **rilevante per te**: hai Python 3.14, e `pebble-tool` dichiara solo `>=3.10`; se incontri problemi di build con dipendenze native, forzare 3.13 con `uv tool install pebble-tool --python 3.13` è il workaround già usato in CI dalla community.
- **release-please** per versioning automatico (`Carles-Figuerola/home-assistant-shortcuts`) `[CONF]`
- **deploy config page su GitHub Pages** con Vite (`freakified/halcyon/.github/workflows/deploy.yml`) `[CONF]`

Repo con CI da copiare: `aveao/pebble-hvv`, `lanrat/pebble-2048-touch`, `ClusterM/pebble-totper`, `jccit/pebblerail`, `dungngminh/pebble_vacuum`, `piotrserafin/ReVolver`, `carlosperate/PebbleQuickHue`. `[CONF]`

### 5.5 Pubblicazione sull'App Store

Dal 02/04/2026 si pubblica **dalla CLI**: `pebble publish` — genera automaticamente GIF e screenshot **per ogni platform** e li carica. Disponibile anche da CloudPebble. `[CONF]` — https://repebble.com/blog/spring-2026-pebble-app-contest

App Store: https://apps.repebble.com/ · Portale dev: `pebble-dev/rebble-dev-portal` `[CONF]`

### 5.6 Unit testing — **il punto debole dell'ecosistema** ⚠️

**Non esiste alcun framework di unit testing per app Pebble C mantenuto nel 2026.** `[CONF]` (ricerca GitHub: solo 12 repo, il più recente rilevante fermo al 2021)

Storici, tutti abbandonati:
- `smallstoneapps/rockbed` — "A Pebble library for doing unit tests" — ultimo push **2015-04-06**, 2 star
- `muvr/pebble-mock` — mock & testing library, host-side
- `cdloh/pebble_unit_tests` — ultimo push 2021-01-14

**L'unica infrastruttura di test seria e viva è quella del firmware**, in `coredevices/PebbleOS/tests/`: contiene `fakes/`, `fakes_tests/`, `stubs/`, `overrides/`, `fixtures/`, `test_infra/`, `test_includes/` e un `wscript_build` (waf). Si esegue con `./pbl test`. `[CONF]` — https://github.com/coredevices/PebbleOS

`[INF]` **Raccomandazione concreta:** non cercare un framework Pebble. Struttura invece il codice in modo che la logica pura sia testabile sull'host:
- isola la logica (calcoli orari, parsing, layout math, state machine) in file `.c` che **non includono `pebble.h`**
- compila quei file con il tuo **gcc 15** nativo e testali con **cmocka**, **Unity** o **clar** (installabili in user space, cmocka via CMake locale o come sorgente vendored)
- lascia in `main.c` solo il codice che tocca il SDK
Questo è esattamente il pattern che `freakified/halcyon` rende possibile con `solarUtils.c`, `text_metrics.h`, `utils.c` separati. `[INF]`

### 5.7 Linting e analisi statica

- **Nessun linter specifico Pebble mantenuto.** CloudPebble aveva linting ma **non è stato riattivato** dopo il ritorno del 2026 `[CONF]`
- PebbleOS usa **clang-format** (`.clang-format`) per C e **ruff** per Python `[CONF]` — puoi riusare il loro `.clang-format` per coerenza stilistica
- `[INF]` Usa `gcc -Wall -Wextra` via `wscript`, e `cppcheck`/`clang-tidy` in user space sui file host-testabili
- ⚠️ La toolchain è passata a **GCC 14** con SDK 4.9.127 e questo **genera nuovi warning su codice vecchio**. Esiste un escape hatch ufficiale: aggiungi `ctx.pbl_suppress_newer_gcc_warnings()` nella funzione `configure` del tuo `wscript` `[CONF]`

### 5.8 Internazionalizzazione (i18n)

Tre approcci, in ordine di modernità:

**A) API di sistema** — `i18n_get_system_locale()`, `setlocale(LC_ALL, "")` / `setlocale(LC_TIME, "")`. Influenza anche `strftime()`. `[CONF]` — https://developer.repebble.com/guides/tools-and-resources/internationalization/

**B) Locale Framework (gettext-like)** — `pebble-hacks/locale_framework`: aggiungi `hash.h`, `localize.h`, `localize.c`, chiama `locale_init()`, avvolgi le stringhe in `_("...")`, poi esegui `get_dict.py` che produce un JSON hash→stringa da tradurre e impacchettare come risorsa binaria per lingua. `[CONF]`
⚠️ Repo ultimo push **2016-04-29** — funziona ma non è mantenuto `[CONF]`

**C) Traduzioni via PKJS (approccio Halcyon)** — dizionari JS per lingua in `src/pkjs/languages/*.js`, inviati al watch e persistiti lato C (`src/c/languages.c`). ~30 lingue. `[CONF]`
`[INF]` Più flessibile e aggiornabile senza ricompilare, ma **richiede il telefono almeno una volta**: va combinato con persistenza per restare offline-friendly.

**Nota:** il firmware stesso usa **gettext `.pot`/`.po` via Crowdin** (`crowdin.yml` → `resources/normal/base/lang/tintin.pot`) `[CONF]`. Non è direttamente riusabile per le app, ma indica la direzione.

⚠️ **La tabella dei locali nella guida ufficiale è obsoleta**: elenca 8 locali (en_US, fr_FR, de_DE, es_ES, it_IT, pt_PT, en_CN, en_TW), ma i changelog 4.9.127 e 4.9.148 hanno aggiunto **arabo con text shaping + RTL** ed **ebraico con font Heebo** `[CONF]`. La doc non è stata aggiornata.

---

## 6. Percorso di apprendimento consigliato

### 6.1 Tutorial ufficiali (developer.repebble.com/tutorials/)

| Tutorial | Parti | Stato |
|---|---|---|
| **Watchface Tutorial (C)** | 6 | **Attuale.** Part 5 aggiornata con **Quick View**; Part 6 = settings page con Clay |
| **Alloy Watchface Tutorial (JS/TS)** | 6 | **Nuovo 2026** |
| Advanced: Vector Animations | 1 | Valido |
| Rocky.js Tutorial | 2 | ❌ **OBSOLETO — runtime rimosso** |
| JS Watchface Tutorial | 2 | ❌ Obsoleto |

`[CONF]` — struttura da `github.com/coredevices/sdk-docs/source/tutorials/`

`[INF]` **Percorso che consiglio, nel tuo caso:**
1. Watchface Tutorial C, parti 1→6 (include Quick View e Clay)
2. Guide `best-practices/building-for-every-pebble` + `app-resources/platform-specific`
3. Guida `events-and-services/persistent-storage` + `communication/sending-and-receiving-data`
4. Guida `graphics-and-animations/framebuffer-graphics`
5. Leggi il sorgente di `freakified/halcyon` per intero — è il miglior "libro di testo" disponibile
6. Solo dopo, valuta Alloy per prototipi rapidi

### 6.2 Video e talk

- **"Tick Talk w/ Eric"** — canale YouTube di Eric Migicovsky: https://www.youtube.com/@TickTalk-with-Eric `[CONF]`
- **"Pebble App Demos Livestream and Dev Contest Results"** — https://www.youtube.com/watch?v=JAvHibORZ50 — demo di app reali del contest Spring 2026 `[CONF]`
- **CES 2026: Eric Migicovsky su Pebble Round 2, Time 2, 2 Duo** — https://www.youtube.com/watch?v=mcJsEaKZpE8 (05/01/2026) `[CONF]`

`[INF]` Non ho trovato una conference talk tecnica strutturata sullo sviluppo app 2025-2026: la comunicazione tecnica di Core Devices passa da blog, changelog e Discord.

### 6.3 Contest come fonte di esempi

Il **Spring 2026 Pebble App Contest** (2-19 aprile 2026) ha prodotto un'ondata di app nuove, con 25 orologi in palio `[CONF]`. Vincitori "Pebble Team Top Picks": **Quartz** (Dalpek), **Pebble Pillage** (grump), **Bearing** (astosia). Altri notevoli: **Time Traveler** (Freakified), **Natural Time**, **Circula**, **Playback for Spotify**, **Pebbal - Miniature Pinball**, **seiko-data**. `[CONF]` — https://repebble.com/blog/spring-2026-dev-contest-results

⚠️ Il post non linka i repo GitHub; vanno cercati per nome autore. `[CONF]`

---

## 7. Risorse LLM/AI per lo sviluppo Pebble

### 7.1 `coredevices/pebble-watchface-agent-skill` — **skill Claude Code ufficiale** ⭐⭐

**70 star, push 2026-08-05.** È un **fork** di `priyankark/pebble-wf-agent-skill` (35 star), adottato da Core Devices. `[CONF]`
https://github.com/coredevices/pebble-watchface-agent-skill

**Struttura:**
```
.claude/skills/pebble-watchface/
├── SKILL.md                          (816 righe)
├── reference/
│   ├── alloy-guide.md
│   ├── animation-patterns.md
│   ├── drawing-guide.md
│   ├── pebble-api-reference.md
│   └── watchapp-guide.md
├── scripts/
│   ├── create_project.py
│   ├── validate_project.py
│   ├── generate_uuid.py
│   ├── create_app_icons.py
│   └── create_preview_gif.py
└── templates/
    ├── static-watchface.c
    ├── animated-watchface.c
    ├── weather-watchface.c
    ├── pkjs-weather.js
    ├── wscript.template
    ├── package.json.template
    ├── alloy-watchface.js
    ├── alloy-manifest.json
    ├── alloy-mdbl.c
    └── alloy-package.json.template
samples/projects/   (batman, beach, castle, lightsaber-duel, persia-swordfight, ...)
tutorials/c-watchface-tutorial/
```

**Contenuti notevoli del `SKILL.md`** (citazioni testuali) `[CONF]`:
- *"**Default target platform: Emery (Pebble Time 2, 200x228 color rectangular display).**"*
- *"**Alloy runs JS on the watch (Moddable XS). It supports ONLY emery and gabbro.**"*
- Tabella decisionale C vs Alloy: **"Prefer C when... Game/animation needing max performance or tight memory control"**, e *"Needs MenuLayer/ActionBarLayer/system UI components (no Alloy equivalent)"*, *"Needs HealthService, App Glances, timeline, background workers"*
- Guida di default: *"watchfaces and web-API apps → Alloy; games and menu/list-driven apps → C"*
- Tabella watchface vs watchapp: nelle **watchface i bottoni non sono disponibili** (Up/Down = timeline, Select = launcher); l'unico input è il **tap dell'accelerometro**
- Vincolo: *"`targetPlatforms` must be `["emery"]` or `["emery", "gabbro"]` — nothing else"*
- Workflow end-to-end obbligatorio in 9 step: Research → Design → Implement → Build → **Test in QEMU** → Iterate → Generate Assets → Deliver → Publish
- Comandi operativi documentati:
  ```bash
  PYTHONUNBUFFERED=1 pebble logs --emulator emery > pebble-logs.txt 2>&1 &
  pebble install --emulator emery
  pebble emu-button click select --emulator emery
  pebble screenshot --no-open --emulator emery screenshot_emery.png
  ```
- Nota di troubleshooting preziosa: *"Install on an already-running emulator can land on the launcher with your app highlighted but not launched — looks like a crash but isn't."*

**Requisiti:** Claude Code CLI, Pebble SDK, QEMU, Python 3 con Pillow. ⚠️ Nessuna licenza esplicita (il README dice solo che le watchface generate sono tue). `[CONF]`

`[INF]` **Per te è la risorsa AI più preziosa in assoluto**: anche senza eseguirla, i 5 file `reference/*.md` e i `templates/*` sono documentazione condensata e orientata a emery. Vale la pena clonare il repo e leggere `reference/pebble-api-reference.md` e `reference/drawing-guide.md`.

### 7.2 Risorse agent nel firmware

`coredevices/PebbleOS` contiene `AGENTS.md`, `.claude/CLAUDE.md` (+ symlink `skills`), e `.agents/skills/working-with-qemu` `[CONF]`.
`AGENTS.md` documenta organizzazione del repo, code style, convenzioni di logging (`PBL_LOG_DBG` vs `PBL_LOG_INFO`), comandi `./pbl configure --board`, `./pbl build`, `./pbl test`, e la procedura per esporre una nuova funzione al SDK. `docs/development/contributing.md` contiene **regole esplicite sull'uso di AI**. `[CONF]`

### 7.3 App Pebble che usano LLM (esempi di integrazione, non tooling)

- `pebble-dev/bobby-assistant` — assistente Gemini, Apache 2.0, 60 star `[CONF]`
- `breitburg/claude-for-pebble` — "Claude AI client for Pebble smartwatch", 20 star, push 2026-01-06 `[CONF]`
- `kjullu/Pebble-AI-Assistant`, `kjames2001/pebble-jarvis` (per Pebble Time 2) `[CONF]`

### 7.4 Cosa NON esiste

- ❌ **Nessun server MCP** per Pebble (ricerca GitHub: 0 risultati) `[CONF]`
- ❌ **Nessun `llms.txt`** pubblicato da Core Devices o Rebble (0 risultati) `[CONF]`
- ❌ Nessun bundle di documentazione ufficiale per consumo LLM

`[INF]` **Opportunità concreta:** il repo `coredevices/sdk-docs` è interamente Markdown/HTML statico e clonabile. Puoi costruirti un bundle locale per LLM in pochi minuti (vedi §9, azione 8).

---

## 8. Note mirate ai tuoi 4 obiettivi

### 8.1 Vincoli numerici da tenere a mente (emery)

| Parametro | Valore | Fonte |
|---|---|---|
| Risoluzione | **200 x 228** | tabella hardware + blog `[CONF]` |
| Colori | **64** | `[CONF]` |
| Diagonale / densità | 1.5" / **202 PPI** | `[CONF]` |
| Display | JDI **LPM015M135A**, color e-paper | `[CONF]` |
| SoC / CPU | SiFli **SF32LB52J** / Star-MC1 (Cortex-M33-like) **240 MHz** | `[CONF]` |
| **Max app binary** | **128 KiB** (era 64 KiB prima di SDK 4.33) | changelog 4.33 `[CONF]` |
| **Loaded image** | **≤ 64 KiB** | changelog 4.33 `[CONF]` |
| **RAM footprint app** | **≤ 64 KiB** | changelog 4.33 `[CONF]` |
| Max resource size | **256 KiB** | tabella hardware `[CONF]` |
| **Persistent storage** | **4 kB per app** | guida persistent-storage `[CONF]` |
| **`PERSIST_DATA_MAX_LENGTH`** | **256 byte** per valore | `[CONF]` |
| Touch | **Sì** — define `PBL_TOUCH` | changelog 4.9.169 `[CONF]` |
| Speaker | **Sì** — define `PBL_SPEAKER` (emery + flint) | changelog 4.9.169 `[CONF]` |
| RGB backlight | **Sì** — define `PBL_RGB_BACKLIGHT` (solo emery) | changelog 4.9.169 `[CONF]` |
| `MAX_FONT_GLYPH_SIZE` | **512** su emery/gabbro | changelog 4.9.127 `[CONF]` |
| Batteria | ~14 giorni | `[CONF]` |

> ⚠️ **Il numero che conta davvero è 64 KiB di RAM**, non i 128 KiB di binario. L'aumento a 128 KiB serve ai dati di rilocazione, non a più memoria a runtime. `[CONF]`

Pebble 2 Duo (`flint`): **144 x 168, 2 colori (B/W)**, 1.26", 175 PPI, ~30 giorni di batteria, speaker sì, touch **no**. `[CONF]`

`[INF]` Il salto emery↔flint è enorme (colore/B-N e 200x228 vs 144x168): progetta il layout con costanti derivate da `layer_get_bounds()` e usa `PBL_IF_COLOR_ELSE()` / `PBL_IF_RECT_ELSE()`, oppure `pebble-scalable`.

### 8.2 Performance

- **`pebble-universal-fb`** (v1.11.0, 2026-02-25) per accesso diretto al framebuffer astraendo i formati per platform `[CONF]`
- Guida ufficiale `/guides/graphics-and-animations/framebuffer-graphics/` `[CONF]`
- **`pebble-fctx`** (v1.6.5) per grafica vettoriale antialiased — l'unico modo per sfruttare davvero 202 PPI su forme curve `[CONF]`. ⚠️ ma il compiler SVG associato è fermo al 2016 `[CONF]`
- **Alternativa nativa:** formato **PDC** (Pebble Draw Commands) con `/guides/app-resources/converting-svg-to-pdc/` — supportato ufficialmente e usato da `bobby-assistant` (`.pdc`/`.pdcs`) `[CONF]`
- `[INF]` Il pattern `asebrech/fdf-time` (proiezione 3D **solo con interi**, niente float) è la scuola giusta: il Cortex-M33 non ha FPU garantita per double.

### 8.3 Offline-first

- **`@rebble/clay`**: config page **inclusa nel .pbw** e servita localmente → configurazione senza rete `[CONF]`
- **Storage API**: 4 kB/app, valori ≤256 byte. `persist_exists()` → `persist_read_int()` con fallback a default `[CONF]`
- ⚠️ La doc avverte: *"Apps that make large use of the Storage API may experience small pauses due to underlying housekeeping operations"* → leggi/scrivi **all'avvio e all'uscita**, non nel tick handler `[CONF]`
- `[INF]` Se 4 kB non bastano, valuta la **Datalogging API** (`/guides/communication/datalogging/`) per accumulare dati in attesa di sync
- `[INF]` Per il meteo: nessuna libreria mantenuta → implementa cache+timestamp+staleness tu stesso, ispirandoti a `src/c/messaging.c` di Halcyon

### 8.4 Memoria

- `heap_bytes_free()` e `heap_bytes_used()` per il monitoraggio a runtime `[CONF]` — https://developer.repebble.com/faqs/
- `[INF]` Le tecniche classiche restano valide: lazy loading delle risorse, un solo `GBitmap` alla volta, evitare `snprintf` con buffer grandi sullo stack, riusare i buffer. I pacchetti `@smallstoneapps/bitmap-loader` e `font-loader` implementavano proprio questo ma sono del 2016 — il pattern è più utile del codice.
- ⚠️ La libreria C standard dietro `snprintf`/`strftime` è ora **picolibc** (SDK 4.33) `[CONF]` → possibili differenze di comportamento marginali rispetto al passato.

---

## 9. Azioni consigliate

1. **Installa la toolchain in user space, subito.**
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   uv tool install pebble-tool          # se fallisce: --python 3.13
   mkdir -p ~/.pebble-sdk && touch ~/.pebble-sdk/NO_TRACKING
   pebble sdk install latest            # scarica toolchain ARM + QEMU: niente sudo per compilare
   pebble new-project mywatchface && cd mywatchface && pebble build
   ```
   Verifica poi che `pebble install --emulator emery` parta. Se QEMU fallisce per librerie di sistema mancanti (`libsdl2`, `libpixman`, `libsndio`), **non cercare sudo**: passa al punto 2.

2. **Piano B per l'emulatore, in ordine di preferenza:**
   (a) `https://ericmigi.github.io/pebble-qemu-wasm/` — testato proprio su emery, zero installazione;
   (b) `https://cloudpebble.repebble.com` — IDE + emulatore nel browser;
   (c) `pebble.nix` con Nix single-user (senza root), che porta anche le librerie di sistema;
   (d) `pebble install --cloudpebble` direttamente sull'orologio via telefono.

3. **Scegli C, non Alloy.** I tuoi quattro obiettivi (performance, memoria, offline, sfruttare il display) puntano tutti a C. La stessa skill ufficiale di Core Devices raccomanda C per *"max performance or tight memory control"* e per app che usano MenuLayer/HealthService/App Glances. Tieni Alloy per prototipare velocemente un'idea grafica.

4. **Non toccare Rocky.js.** Il runtime è stato rimosso dal firmware nel marzo 2026: qualunque tutorial Rocky trovi è tempo perso.

5. **Parti da un fork mentale di `freakified/halcyon`**, non da `pebble-examples`. Clona e studia: separazione `drawUtils_rect.c`/`drawUtils_round.c`, `settings.c`, `messaging.c`, i18n via PKJS, e `targetPlatforms` con tutti e 7 i platform.
   ```bash
   git clone https://github.com/freakified/halcyon
   git clone https://github.com/pebble-dev/bobby-assistant
   git clone https://github.com/coredevices/pebble-watchface-agent-skill
   ```

6. **Metti in `package.json` solo pacchetti verificati 2026:**
   ```json
   "dependencies": {
     "@rebble/clay": "^1.0.10",
     "pebble-events": "^1.2.1",
     "pebble-packet": "^1.6.1"
   }
   ```
   Aggiungi `pebble-fctx` se ti serve vettoriale, `pebble-universal-fb` se vai di framebuffer, `pebble-scalable` per il multi-platform. **Non installare `pebble-clay`** (2016): usa `@rebble/clay`. Prima di aggiungere qualunque altro pacchetto, controlla la data su npm — 55 dei 76 pacchetti sono fermi al 2016.

7. **Imposta subito la CI** con la ricetta §5.4 (uv + `pebble sdk install latest` + upload artifact). Ti dà build riproducibili anche se il tuo ambiente locale è vincolato, e ti produce i `.pbw` da installare sull'orologio.

8. **Costruisci il tuo bundle di documentazione per LLM** — non esiste, ma è banale:
   ```bash
   git clone --depth 1 https://github.com/coredevices/sdk-docs
   # le guide sono in sdk-docs/source/_guides/**/*.md
   # i changelog in sdk-docs/source/_changelogs/*.md  <- densissimi di API nuove
   ```
   Aggiungi i 5 file `reference/*.md` della skill ufficiale. Questo diventa il contesto di riferimento offline per il tuo lavoro con Claude.

9. **Architetta per la testabilità dal primo giorno.** Non esiste un framework di test Pebble mantenuto: isola la logica pura in `.c` che non includono `pebble.h`, compilali con gcc 15 nativo e testali con cmocka/Unity. È l'unica strada praticabile nel 2026.

10. **Aggiungi `ctx.pbl_suppress_newer_gcc_warnings()`** nel `configure` del `wscript` se importi codice pre-2026: la toolchain GCC 14 è molto più rumorosa.

11. **Implementa Quick View** (`unobstructed_area_service_subscribe()`, `layer_get_unobstructed_bounds()`) — è una raccomandazione esplicita di Core Devices dell'aprile 2026, documentata in Part 5 del tutorial C. ⚠️ Attenzione all'avvertenza ufficiale: *"You must ensure you fill the entire window, not just the unobstructed area"*.

12. **Iscriviti ai canali giusti**: forum https://forum.repebble.com/c/developers-ask-questions-and-get-help/7 e Discord https://discord.com/invite/aRUAYFN canale `#sdk-dev`. Segui i changelog SDK — sono la fonte più densa di informazioni tecniche dell'intero ecosistema.

---

## 10. Domande aperte / non confermate

1. **Emery ha un heart rate monitor?** La tabella hardware ufficiale usa `colspan` HTML che rendono ambigua l'assegnazione delle righe "Heart Rate Monitor", "Microphone" e "Sensors". Alcune watchface community (`kooscode/kface`) dichiarano di mostrare heart rate su emery. Da verificare su https://developer.repebble.com/guides/tools-and-resources/hardware-information/
2. **Emery: 3-axis o 6-axis IMU?** La stessa ambiguità di colspan. La lettura più probabile della tabella dà "3-axis IMU, Compass" per emery.
3. **`pebble.nix` funziona davvero senza root e supporta emery/gabbro?** Il README non enumera i platform né dichiara i requisiti di root. Da testare praticamente.
4. **`pebble-tool` è compatibile con Python 3.14?** Dichiara solo `>=3.10`; le CI della community pinnano 3.13. Non confermato che 3.14 funzioni.
5. **Il `pebble-fctx-compiler` (2016) produce ancora output valido** per `pebble-fctx` 1.6.5 (2026)? Il compiler non è stato aggiornato.
6. **Repo GitHub dei vincitori del contest Spring 2026** — il post di annuncio non li linka.
7. **Licenza di `coredevices/pebble-watchface-agent-skill`** — nessun file LICENSE nel repo.
8. **Stato dei servizi Rebble** (weather, timeline-sync, appstore) rispetto ai nuovi orologi Core Devices: convivenza o migrazione? Non chiarito dalle fonti consultate.

---

## 11. Fonti (URL + data di consultazione: 2026-08-24)

**Documentazione ufficiale Core Devices**
- https://developer.repebble.com/ · /guides/toc/ · /faqs/ · /examples/ · /sdk/ · /docs/
- https://developer.repebble.com/guides/tools-and-resources/hardware-information/
- https://developer.repebble.com/guides/pebble-packages/using-packages/
- https://developer.repebble.com/guides/events-and-services/persistent-storage/
- https://developer.repebble.com/guides/tools-and-resources/internationalization/
- https://developer.repebble.com/guides/user-interfaces/unobstructed-area/
- https://developer.repebble.com/guides/alloy/ · https://www.moddable.com/blog/pebble/

**Changelog SDK (fonti primarie più dense)**
- https://github.com/coredevices/sdk-docs/blob/main/source/_changelogs/4.33.md (2026-08-12)
- .../4.33.1.md (2026-08-14) · .../4.9.169.md (2026-05-01) · .../4.9.148.md (2026-03-26) · .../4.9.127.md (2026-02-20)

**Blog**
- https://repebble.com/blog/cloudpebble-returns-plus-pure-javascript-and-round-2-sdk (2026-02-20)
- https://repebble.com/blog/spring-2026-pebble-app-contest (2026-04-02)
- https://repebble.com/blog/spring-2026-dev-contest-results (2026-04-28)
- https://ericmigi.com/blog/ · https://rebble.io/blog/

**GitHub**
- https://github.com/coredevices (org) · /PebbleOS · /pebble-tool · /sdk-docs · /cloudpebble · /pebble-watchface-agent-skill
- https://github.com/pebble-dev (org) · /pebble.nix · /clay · /bobby-assistant · /rebble-weather
- https://github.com/freakified/halcyon · /TimeStylePebble
- https://github.com/Katharine/pebble-events · https://github.com/gregoiresage/enamel · https://github.com/jrmobley/pebble-fctx
- https://github.com/ericmigi/pebble-qemu-wasm · https://github.com/Moddable-OpenSource/pebble-examples
- https://github.com/priyankark/pebble-wf-agent-skill · https://github.com/pebble-hacks/locale_framework
- CI di esempio: https://github.com/lanrat/pebble-2048-touch · /aveao/pebble-hvv · /Carles-Figuerola/home-assistant-shortcuts

**Registry**
- https://registry.npmjs.org/-/v1/search?text=keywords:pebble-package (76 pacchetti, interrogato 2026-08-24)
- https://pypi.org/pypi/pebble-tool/json (v5.0.39, 2026-06-30)

**Community**
- https://forum.repebble.com/c/developers-ask-questions-and-get-help/7
- https://discord.com/invite/aRUAYFN (canale `#sdk-dev`)
- https://cloudpebble.repebble.com · https://apps.repebble.com/
- https://www.youtube.com/@TickTalk-with-Eric · https://www.youtube.com/watch?v=JAvHibORZ50

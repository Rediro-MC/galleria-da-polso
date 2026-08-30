# Pubblicazione, compatibilità multi-piattaforma e QA per le nuove Pebble (2026)

> Report di ricerca — dati raccolti il **24 agosto 2026**.
> Fonti primarie: `developer.repebble.com`, `repebble.com/blog`, `github.com/coredevices/*`, `dev-portal.rebble.io`, `appstore-api.repebble.com`, `rebble.io`.
> Convenzione: **[CONFERMATO]** = verificato su fonte primaria (URL + data). **[INFERENZA]** = deduzione ragionata. **[INCERTO]** = non verificabile con le fonti disponibili.

---

## 0. Correzione critica prima di tutto: Pebble 2 Duo **NON è `diorite`**

Il brief di partenza assumeva "Pebble 2 Duo (B&W 144x168) = `diorite`". **È sbagliato.**

**[CONFERMATO]** La piattaforma della Pebble 2 Duo si chiama **`flint`**. `diorite` è la vecchia Pebble 2 (2016, Pebble Technology Corp.).
Fonte: <https://developer.repebble.com/faqs/> — sezione "Which platform name maps to which Pebble watch?":

- Aplite — Pebble originale e Pebble Steel (B&W, rettangolare)
- Basalt — Pebble Time / Pebble Time Steel (64 colori, rettangolare)
- Chalk — Pebble Time Round (64 colori, rotondo)
- Diorite — Pebble 2 (B&W, rettangolare, con cardio)
- **Flint — Pebble 2 Duo** (B&W, rettangolare, *re-released by Core Devices*)
- **Emery — Pebble Time 2** (64 colori, rettangolare, display più grande)
- **Gabbro — Pebble Round 2** (64 colori, rotondo)

Conseguenza pratica: se in `targetPlatforms` metti solo `["emery","diorite"]` **la tua app non gira nativamente sulla Pebble 2 Duo** — girerà solo in modalità compatibilità (vedi §4). Serve `flint`.

Esiste inoltre una **settima piattaforma nuova**: `gabbro` (Pebble Round 2, 260×260, in produzione di massa da fine luglio 2026). Vale la pena includerla fin da subito.

---

## 1. Matrice hardware/piattaforma definitiva (2026)

**[CONFERMATO]** Fonte primaria autorevole: `tools/pebble_sdk_platform.py` in PebbleOS
<https://raw.githubusercontent.com/coredevices/pebbleos/main/tools/pebble_sdk_platform.py>
(il file che il build system usa realmente per generare i `#define`), integrato con
<https://developer.repebble.com/guides/tools-and-resources/hardware-information/>.

| | aplite | basalt | chalk | diorite | **flint** | **emery** | **gabbro** |
|---|---|---|---|---|---|---|---|
| Orologio | Pebble/Steel | Time/Time Steel | Time Round | Pebble 2 | **Pebble 2 Duo** | **Pebble Time 2** | **Pebble Round 2** |
| Produttore | PTC | PTC | PTC | PTC | Core Devices | Core Devices | Core Devices |
| `PBL_DISPLAY_WIDTH` | 144 | 144 | 180 | 144 | **144** | **200** | **260** |
| `PBL_DISPLAY_HEIGHT` | 168 | 168 | 180 | 168 | **168** | **228** | **260** |
| Colore | `PBL_BW` | `PBL_COLOR` | `PBL_COLOR` | `PBL_BW` | **`PBL_BW`** | **`PBL_COLOR`** | **`PBL_COLOR`** |
| Forma | `PBL_RECT` | `PBL_RECT` | `PBL_ROUND` | `PBL_RECT` | `PBL_RECT` | `PBL_RECT` | `PBL_ROUND` |
| `MAX_APP_MEMORY_SIZE` | **24K** (0x6000) | 64K | 64K | 64K | **64K** | **128K** (0x20000) | **128K** |
| `MAX_APP_BINARY_SIZE` | 64K | 64K | 64K | 64K | **64K** | **128K** | **128K** |
| `MAX_RESOURCES_SIZE_APPSTORE` | 128K | 256K | 256K | 256K | **256K** | **256K** | **256K** |
| `MAX_RESOURCES_SIZE` (sideload) | 512K | 1024K | 1024K | 1024K | 1024K | 1024K | 1024K |
| `MAX_WORKER_MEMORY_SIZE` | 10K (0x2800) | 10K | 10K | 10K | 10K | 10K | 10K |
| `MAX_FONT_GLYPH_SIZE` | 256 | 256 | 256 | 256 | 256 | **512** | **512** |
| `PBL_SDK_FROZEN` | sì (rev 81) | sì (rev 89) | sì (rev 89) | sì (rev 89) | **no** | **no** | **no** |
| `HAS_MODDABLE_XS` (Alloy/JS) | no | no | no | no | **no** | **sì** | **sì** |
| `PBL_MICROPHONE` | — | sì | sì | sì | **sì** | **sì** | **sì** |
| `PBL_HEALTH` | — | sì | sì | sì | **sì** | **sì** | **sì** |
| `PBL_COMPASS` | sì | sì | sì | **no** | **sì** | **sì** | **sì** |
| `PBL_SMARTSTRAP` | — | sì | sì | sì | **no** | **sì** | **no** |
| `PBL_SMARTSTRAP_POWER` | — | sì | sì | — | no | **sì** | no |
| `PBL_TOUCH` | — | — | — | — | — | **sì** | **sì** |
| `PBL_SPEAKER` | — | — | — | — | **sì** | **sì** | **no** |
| `PBL_RGB_BACKLIGHT` | — | — | — | — | — | **sì (solo emery)** | — |
| SoC / CPU | STM32F205RE, M3 64 MHz | STM32F411, M4 100 MHz | STM32F411 | nRF52840, M4 64 MHz | nRF52840 | **SiFli SF32LB52J, Star-MC1 240 MHz** | SiFli SF32LB52J |
| Display PPI | 175 | 175 | 182 | 175 | 175 | **202** | 200 |
| Batteria (dichiarata) | ~7 gg | ~7–10 gg | ~2 gg | ~7 gg | **~30 gg** | **~14 gg** (blog lug-2026: **~21 gg**) | TBD |

**Osservazioni ad alto valore per i tuoi obiettivi:**

1. **Emery ha il budget di memoria doppio** (128K app heap + 128K binary vs 64K), ma **`MAX_RESOURCES_SIZE_APPSTORE` resta 256K** identico a basalt. È il vincolo che ti stringerà: un display con l'88% di pixel in più a colori, ma con lo stesso budget risorse. **Progetta le risorse per emery per prime**, non "scalate da 144×168".
2. **emery/flint/gabbro NON sono `PBL_SDK_FROZEN`** → ricevono nuove API. aplite/basalt/chalk/diorite sono congelate: non aspettarti API nuove lì.
3. **`MAX_FONT_GLYPH_SIZE` è 512 su emery/gabbro** (vs 256): puoi usare font custom molto più grandi senza che il compilatore di risorse tronchi i glifi.
4. **emery è l'unica piattaforma con `PBL_RGB_BACKLIGHT`** — leva di design esclusiva PT2.
5. **La CPU di emery è ~2,4–3,7× più veloce** (240 MHz Star-MC1 vs 64–100 MHz Cortex-M4). Animazioni fluide sono realistiche su PT2 in modo che non lo erano su basalt.

---

## 2. Pubblicazione nell'app store nel 2026

### 2.1 Il quadro è cambiato: adesso esistono **due store/feed distinti**

Questa è la parte con più cambiamenti rispetto a qualunque documentazione precedente al 2026, ed è il punto in cui è più facile sbagliare.

**Cronologia [CONFERMATO]:**

- **9 ott 2025** — Eric Migicovsky annuncia il ritorno dell'appstore su `apps.rePebble.com`, dichiarando la partnership con Rebble: *"We have partnered with Rebble to re-introduce the appstore. Their web services now power the Pebble appstore backend."* Le app caricate su `dev-portal.rebble.io` compaiono in **entrambi** gli store.
  <https://ericmigi.com/blog/re-introducing-the-pebble-appstore/>
- **9 ott 2025** — Rebble conferma: Core paga Rebble, backend unico, *"Rebble Web Services as the singular backend"*.
  <https://rebble.io/2025/10/09/rebbles-in-a-world-with-core.html>
- **17 nov 2025** — **Rottura.** Rebble pubblica "Core Devices Keeps Taking Advantage Of Our Work": accusa Core di aver fatto scraping del database dell'appstore e di non voler garantire il ruolo di Rebble.
  <https://rebble.io/2025/11/17/core-devices-keeps-stealing-our-work.html>
- **18 nov 2025** — Risposta di Migicovsky ("Pebble, Rebble, and a Path Forward"): trattativa a $0.20/utente/mese fallita; posizione di Core: le app appartengono agli sviluppatori originali.
  <https://ericmigi.com/blog/pebble-rebble-and-a-path-forward/>
- **~24 nov 2025** — Core apre il sorgente della mobile app, pubblica un archivio completo dell'appstore su Archive.org e **abilita "multiple appstore feeds"** nella app mobile (modello tipo APT/AUR: chiunque può gestire un feed).
- **2026** — Core gestisce il **proprio backend**: `appstore-api.repebble.com` (**[CONFERMATO]**: è l'endpoint hardcoded in `pebble publish`, vedi §2.3, ed è raggiungibile e funzionante — ho interrogato `/api/v1/home/emery` il 24 ago 2026 ottenendo dati live).
- **4 giu 2026** — Sul forum ufficiale Core esiste un thread intitolato *"Apps published via dev-portal.rebble.io never appear in the Core appstore feed"*.
  <https://forum.repebble.com/t/switch-from-rebble-app-store-to-core-app-store/38> (thread correlato)

**[INFERENZA, alta confidenza]** La sincronizzazione automatica Rebble → Core annunciata a ottobre 2025 **non è più affidabile**. Oggi ci sono due percorsi di pubblicazione paralleli e vanno usati entrambi se vuoi copertura totale.

| | **Store Core Devices** | **Store Rebble** |
|---|---|---|
| Frontend | `apps.repebble.com` | `apps.rebble.io` |
| Backend/API | `appstore-api.repebble.com` | `appstore-api.rebble.io` (Rebble Web Services) |
| Portale dev | `developer.repebble.com/dashboard` | `dev-portal.rebble.io` |
| Auth | **Firebase** (via `pebble login`, account GitHub) | account Rebble (OAuth Rebble/Discord) |
| CLI | **`pebble publish`** | nessuna (solo web) |
| Chi lo vede | **default sui PT2/PR2/Duo nuovi** | feed Rebble (attivabile nella app mobile), utenti storici |
| Costo | gratis | gratis |

**→ Raccomandazione operativa: pubblica su ENTRAMBI.** Il primario per raggiungere chi compra oggi una Pebble Time 2 è quello di Core.

### 2.2 Requisiti account

**Core Devices [CONFERMATO]** — `developer.repebble.com/dashboard`, sign-in via Firebase. Il codice di `pebble publish` fa:
- `GET {api_base}/api/v1/developer/me` per verificare il link dell'account
- se ritorna `403` con `code: "DEVELOPER_NOT_LINKED"`, chiama `POST /api/v1/developer/create` **creando automaticamente l'account developer**.
Non serve nessuna approvazione manuale, nessuna quota, nessuna carta di credito.
Fonte: <https://github.com/coredevices/pebble-tool/blob/main/pebble_tool/commands/publish.py>
Il login watch/dev usa **GitHub**: `pebble login` + nell'app mobile *Devices → ⋯ → Enable Dev Connect → sign in with GitHub* (<https://developer.repebble.com/faqs/>).

**Rebble [CONFERMATO]** — `dev-portal.rebble.io`. Onboarding: *"Setting up a new Rebble developer account is easy. There's only 1 question: What name should we publish your apps or watchfaces under?"*. Chi aveva un account pre-2018 può recuperarlo via Discord (`/recover-account`) o `support@rebble.io`. **Non serve un abbonamento Rebble** per pubblicare o per scaricare app.

### 2.3 `pebble publish` — la via CLI (novità 2026)

**[CONFERMATO]** Introdotto con SDK 4.9.148, annunciato il **2 aprile 2026**: *"CLI publishing now available via `pebble publish` with automatic asset generation"*.
<https://repebble.com/blog/spring-2026-pebble-app-contest>

Sorgente: `pebble_tool/commands/publish.py` (pebble-tool v5.0.39, 30 giu 2026, MIT).

Cosa fa, in ordine:
1. Auth preflight Firebase (`pebble login` o `--firebase-id-token` / env `PEBBLE_FIREBASE_ID_TOKEN` per CI).
2. Crea l'account developer se manca.
3. **Builda** il progetto.
4. Estrae i metadati dal `.pbw` (`appinfo.json`/`manifest.json`): `uuid`, `versionLabel`, `targetPlatforms`, `longName`, e determina `app_type` da `watchapp.watchface` → **`"watchface"` o `"watchapp"`**.
5. **Normalizza l'UUID in minuscolo** (riscrive il pbw se serve) — attenzione, l'UUID maiuscolo causa mismatch di lookup.
6. **Cattura automaticamente le GIF animate da emulatore per TUTTE le piattaforme in `targetPlatforms`** (default ON), avviando e spegnendo un emulatore per piattaforma. Facoltativamente anche screenshot statici.
7. Fa upload di release (app esistente, match per UUID) oppure crea una nuova app.

Opzioni esatte (`pebble publish --help`):

```
--sdk [VERSION]              versione SDK da usare
--api-base URL               default: https://appstore-api.repebble.com
                             (override anche con PEBBLE_APPSTORE_API_BASE)
--release-notes TEXT         note di rilascio
--is-published               pubblica subito come visibile (DEFAULT: false → bozza!)
--gif-all-platforms          cattura GIF rollover per tutte le piattaforme (DEFAULT: ON)
--no-gif-all-platforms       salta la cattura GIF
--all-platforms              cattura anche screenshot statici (DEFAULT: off)
--firebase-id-token TOKEN    auth non interattiva per CI
--non-interactive            nessun prompt (CI-friendly)
--name NAME                  nome app (solo creazione)
--version VERSION            override versione
--description TEXT           descrizione (OBBLIGATORIA con --non-interactive su app nuova)
--source URL                 URL sorgenti
--category KEY               categoria (solo creazione)
--icon-small PATH            iconSmall
--icon-large PATH            iconLarge
--screenshots FILE [FILE…]   file locali; IL NOME FILE DEVE INIZIARE CON LA PIATTAFORMA
                             es. emery_screenshot.png, flint_screenshot.png
--replace-screenshots        sostituisce invece di accodare (irreversibile via CLI)
```

**Nota importante:** `--is-published` è `False` di default → senza quel flag la release resta non visibile. E *"No screenshots were collected. Screenshot upload is required for publish."* → **gli screenshot sono obbligatori**.

**Vincolo pratico per te:** la cattura GIF/screenshot automatica **richiede l'emulatore QEMU funzionante** (e `ffmpeg`/dipendenze GIF). Sulla tua macchina senza sudo questo è il punto di attrito principale (vedi §7.1). Alternativa: `--non-interactive --screenshots emery_1.png flint_1.png …` con immagini prodotte altrove.

### 2.4 Asset richiesti — dimensioni esatte

**[CONFERMATO]** Ho scaricato il pacchetto ufficiale di template dal dev portal Rebble
(<https://dev-portal.rebble.io/res/zip/exampleImages.zip>) e misurato i PNG:

| Asset | Dimensione esatta | Note |
|---|---|---|
| **Appstore banner** | **720 × 320 px** | Richiesto per **watchapp**, opzionale per **watchface** |
| **Large icon** | **144 × 144 px** | mostrata nell'app locker |
| **Small icon** | **48 × 48 px** | |
| **Screenshot rettangolare** | **144 × 168 px** | template legacy |
| **Screenshot chalk** | **180 × 180 px** | template legacy |
| **Screenshot emery** | **200 × 228 px** | **[INFERENZA]** — risoluzione nativa, il template zip non è aggiornato |
| **Screenshot gabbro** | **260 × 260 px** | **[INFERENZA]** — risoluzione nativa |
| **Screenshot flint / diorite / aplite / basalt** | **144 × 168 px** | risoluzione nativa |

**[CONFERMATO]** L'API espone anche altre chiavi immagine (interrogazione live 24 ago 2026 su `appstore-api.repebble.com/api/v1/apps/id/…`):
- `list_image`: `{"144x144": …, "80x80": …}`
- `icon_image`: `{"28x28": …, "48x48": …}`
- `header_images`: `[{"720x320": …, "orig": …}]`
- `screenshot_images`: array di `{"<dim>": <url>}`; **le URL sono partizionate per piattaforma**: `https://assets.repebble.com/screenshots/<appId>/<platform>/<uuid>.png` (ho visto `/emery/`, `/chalk/`, `/basalt/`).
  ⚠️ La *chiave* JSON risulta `"144x168"` anche per screenshot emery: è un'etichetta legacy, **non** un vincolo di ridimensionamento. **[CONFERMATO]** per osservazione diretta.

**Regole sugli screenshot [CONFERMATO]:**
- Rebble dev portal: *"You must provide at least one for each platform you support."* — tab separate per **Aplite, Basalt, Chalk, Diorite, Emery, Flint, Gabbro**.
- Il portale accetta fino a **5 screenshot** e fino a **3 header image** per asset collection (guida legacy "Publishing an App").
- Gli screenshot nel listing **non devono essere incorniciati** ("must not be framed"); le cornici (frames) vanno usate solo dentro il banner marketing.
  <https://developer.repebble.com/guides/app-resources/…> / <https://developer.rebble.io/guides/appstore-publishing/appstore-assets/>
- Il banner è *"displayed above your app screenshots in the store"*.

### 2.5 Categorie

**[CONFERMATO]** Interrogazione live `GET https://appstore-api.repebble.com/api/v1/home/emery` (24 ago 2026) → 8 categorie con id e slug stabili:

| Nome | slug | id | colore |
|---|---|---|---|
| Daily | `daily` | `5261a8fb3b773043d500000c` | `3db9e6` |
| Faces | `faces` | `528d3ef2dc7b5f580700000a` | `ffffff` |
| Games | `games` | `5261a8fb3b773043d5000012` | `b57ad3` |
| Health & Fitness | `health-fitness` | `5261a8fb3b773043d5000004` | `98D500` |
| Index | `index` | `527509e36526cda2d4000019` | `ffffff` |
| Notifications | `notifications` | `5261a8fb3b773043d5000001` | `FF9000` |
| Remotes | `remotes` | `5261a8fb3b773043d5000008` | `fc4b4b` |
| Tools & Utilities | `tools-utilities` | `5261a8fb3b773043d500000f` | `fdbf37` |

**Watchapp vs watchface [CONFERMATO]:**
- Il tipo è derivato **automaticamente** da `package.json` → `pebble.watchapp.watchface` (`true`/`false`), non lo scegli a mano nello store.
- Se `watchface: true` → categoria forzata a **Faces** (in `publish.py`, `_prompt_category_key` chiede la categoria **solo** se `app_type == "watchapp"`).
- Nel dev portal Rebble scegli esplicitamente "Watchface" / "Watch App" e le categorie offerte per le app sono: Daily, Tools & Utilities, Notifications, Remotes, Health & Fitness, Games.

### 2.6 Versioning e aggiornamenti

**[CONFERMATO]**
- Il campo di versione è `version` in `package.json` (livello npm), mappato su `versionLabel` nel `.pbw`. Formato richiesto: **`major.minor.0`** (la patch **deve** essere 0). Fonte: <https://developer.repebble.com/guides/tools-and-resources/app-metadata/>
- Per aggiornare: nuova **release** con lo **stesso UUID**. Il matching lato Core avviene su `app_lookup.by_app_uuid` (case-insensitive, con normalizzazione a minuscolo).
- **Non cambiare mai l'UUID** tra le versioni: creeresti una app nuova e perderesti hearts, lockers e dati persistenti degli utenti.
- Rebble dev portal: *"Publishing a new release lets you update your app. To update other data such as the app name or website link, select 'Edit store listing' instead."* + *"Make sure you have incremented version"*.
- Release notes: obbligatorie sul portale Rebble *"(Still required for first upload.)"*.
- Visibilità: **Public** o **Unlisted** ("hide my app": accessibile solo via URL diretto, non indicizzata, nessun annuncio su Discord/Forum). Utile per beta.
- Rebble permette di collegare l'app a un thread del **Rebble Forum** per annunci automatici delle release.

### 2.7 Processo di review

**[CONFERMATO]** *"Applications submitted to the Pebble appstore will not go through a review process but Pebble can take down your app at any time if it does not comply with the full agreement and the Developer Program Policies."*
→ **Nessuna review preventiva. Pubblicazione immediata.** Moderazione solo a posteriori (takedown).
Requisiti formali minimi (guida "Appstore Publishing"): tutti gli asset richiesti, almeno un `.pbw`, **UUID unico e valido**, build con **SDK non-beta**, conformità agli accordi legali.
Fonte: <https://developer.rebble.io/guides/appstore-publishing/>

### 2.8 Monetizzazione

**[CONFERMATO]** **Non esistono app a pagamento.** Pebble Developer Distribution Agreement §8: *"At this time, Pebble does not charge any fees to upload a Product"*, e non è previsto alcun meccanismo di distribuzione a pagamento.
<https://developer.repebble.com/legal/distribution/>

**[INCERTO / medio]** L'unica monetizzazione praticata dalla community resta **KiezelPay** (in-app payment di terze parti, storico Pebble) e donazioni dirette (Ko-fi/GitHub Sponsors). Non ho trovato conferma primaria 2026 che l'infrastruttura KiezelPay sia ancora operativa sulle nuove watch — **da verificare prima di puntarci**.

---

## 3. Un solo codebase per Pebble Time 2 + Pebble 2 Duo (+ resto della famiglia)

### 3.1 `targetPlatforms` in `package.json`

**[CONFERMATO]** Il template ufficiale generato da `pebble new-project` include **tutte e 7** le piattaforme.
Fonte: <https://github.com/coredevices/pebble-tool/blob/main/pebble_tool/sdk/templates/app/package.json>

```json
{
  "name": "my-app",
  "author": "Il Tuo Nome",
  "version": "1.0.0",
  "keywords": ["pebble-app"],
  "private": true,
  "dependencies": {},
  "pebble": {
    "displayName": "My App",
    "uuid": "…v4…",
    "sdkVersion": "3",
    "enableMultiJS": true,
    "targetPlatforms": [
      "aplite", "basalt", "chalk", "diorite", "emery", "flint", "gabbro"
    ],
    "watchapp": { "watchface": false },
    "messageKeys": ["dummy"],
    "resources": { "media": [] }
  }
}
```

⚠️ **[CONFERMATO]** Se ometti `targetPlatforms`, il default è `get_pebble_platforms()` che ritorna **tutte e 7** (fallback hardcoded `('aplite','basalt','chalk','diorite','emery','flint','gabbro')` in `pebble_tool/sdk/manager.py`). La documentazione "App Metadata" dice ancora `["aplite","basalt","chalk"]`: **è obsoleta**, il codice vince.

**Per i tuoi obiettivi**, il set minimo consigliato è:
```json
"targetPlatforms": ["emery", "flint", "gabbro", "basalt", "diorite", "chalk"]
```
Ometti `aplite` se non vuoi combattere con 24K di heap e 128K di risorse: è la piattaforma che costringe ai compromessi peggiori, ed è hardware del 2013.

### 3.2 Risorse per piattaforma: due meccanismi

#### (a) Suffissi con tilde `~` (raccomandato)

**[CONFERMATO]** <https://developer.repebble.com/guides/app-resources/platform-specific/>

Sintassi: `nomefile~tag1~tag2.png`. **Tutti** i tag devono corrispondere; se più file sono validi vince quello **con più tag**.

I tag disponibili sono i `TAGS` di ogni piattaforma in `pebble_sdk_platform.py` **[CONFERMATO da sorgente]**:

| Piattaforma | Tag disponibili |
|---|---|
| aplite | `aplite` `bw` `rect` `compass` `144w` `168h` |
| basalt | `basalt` `color` `rect` `mic` `strap` `strappower` `compass` `health` `144w` `168h` |
| chalk | `chalk` `color` `round` `mic` `strap` `strappower` `compass` `health` `180w` `180h` |
| diorite | `diorite` `bw` `rect` `mic` `strap` `health` `144w` `168h` |
| **flint** | `flint` `bw` `rect` `mic` `health` `compass` **`speaker`** `144w` `168h` |
| **emery** | `emery` `color` `rect` `mic` `strap` `health` `strappower` `compass` **`touch`** **`speaker`** **`200w`** **`228h`** |
| **gabbro** | `gabbro` `color` `round` `mic` `health` `compass` **`touch`** **`260w`** **`260h`** |

Esempi:
```
resources/images/bg~color~rect~200w.png   → SOLO emery
resources/images/bg~color~rect.png        → basalt + emery
resources/images/bg~bw.png                → aplite, diorite, flint
resources/images/bg~round.png             → chalk + gabbro
resources/images/icon~touch.png           → emery + gabbro
```

**Best practice ufficiale [CONFERMATO]:** *"Avoid platform-specific tags (aplite, basalt). Using descriptive tags ensures automatic compatibility with future platforms."*
→ Preferisci `~color~rect~200w` a `~emery`. Questo è esattamente il motivo per cui le app scritte bene nel 2016 hanno funzionato su `flint` e `gabbro` nel 2026 senza toccare nulla.

**Attenzione ai tag dimensionali:** `~144w` copre aplite+basalt+diorite+flint insieme; `~200w` è di fatto un alias di emery; `~260w` di gabbro. Ma `~200w` sopravviverà se un giorno esce un'altra watch 200px.

#### (b) `targetPlatforms` a livello di singola risorsa

**[CONFERMATO]** Per escludere completamente una risorsa dal bundle di certe piattaforme (**risparmio di spazio nel budget 256K**):

```json
"resources": {
  "media": [
    {
      "type": "bitmap",
      "name": "BACKGROUND_HIRES",
      "file": "images/background_200x228.png",
      "targetPlatforms": ["emery"]
    },
    {
      "type": "font",
      "name": "FONT_BIG_48",
      "file": "fonts/big.ttf",
      "characterRegex": "[0-9:]",
      "targetPlatforms": ["emery", "gabbro"]
    }
  ]
}
```

**Questo è il tuo strumento numero uno per il consumo di memoria**: un PNG a 200×228 a colori non deve nemmeno esistere nel `.pbw` installato su una Pebble 2 Duo. Combinato con `characterRegex` sui font (che limita i glifi compilati) è la leva più efficace su `MAX_RESOURCES_SIZE_APPSTORE`.

Limite: **massimo 256 risorse `media` per app** **[CONFERMATO]**, <https://developer.repebble.com/guides/tools-and-resources/app-metadata/>.

### 3.3 Macro di compilazione condizionale — elenco esatto

**[CONFERMATO]** <https://developer.repebble.com/guides/best-practices/building-for-every-pebble/> + `pebble_sdk_platform.py`

**Feature flag (definiti o non definiti):**
```
PBL_COLOR      PBL_BW
PBL_RECT       PBL_ROUND
PBL_MICROPHONE PBL_HEALTH   PBL_COMPASS
PBL_SMARTSTRAP PBL_SMARTSTRAP_POWER
PBL_TOUCH      PBL_SPEAKER  PBL_RGB_BACKLIGHT
```

**Macro ternarie (compile-time, costo zero a runtime):**
```c
PBL_IF_COLOR_ELSE(a, b)
PBL_IF_BW_ELSE(a, b)
PBL_IF_RECT_ELSE(a, b)
PBL_IF_ROUND_ELSE(a, b)
PBL_IF_MICROPHONE_ELSE(a, b)
PBL_IF_HEALTH_ELSE(a, b)
PBL_IF_SMARTSTRAP_ELSE(a, b)
PBL_IF_COMPASS_ELSE(a, b)
```

**Dimensioni display:**
```c
PBL_DISPLAY_WIDTH    // 144 | 180 | 200 | 260
PBL_DISPLAY_HEIGHT   // 168 | 180 | 228 | 260
```

**Identificazione piattaforma:**
```c
PBL_PLATFORM_APLITE  PBL_PLATFORM_BASALT  PBL_PLATFORM_CHALK
PBL_PLATFORM_DIORITE PBL_PLATFORM_EMERY   PBL_PLATFORM_FLINT
PBL_PLATFORM_GABBRO
```

**Switch per piattaforma [CONFERMATO]** — <https://developer.repebble.com/docs/c/Foundation/Platform/>
```c
PBL_PLATFORM_TYPE_CURRENT   // → PlatformTypeEmery, ecc.
PBL_PLATFORM_SWITCH(aplite, basalt, chalk, diorite, emery, flint, gabbro)
PBL_PLATFORM_SWITCH_DEFAULT(default, aplite, basalt, chalk, diorite, emery, flint, gabbro)
```
Enum runtime: `PlatformTypeAplite`, `PlatformTypeBasalt`, `PlatformTypeChalk`, `PlatformTypeDiorite`, `PlatformTypeEmery`, `PlatformTypeFlint`, `PlatformTypeGabbro` (`src/fw/applib/platform.h`).

**Runtime:**
```c
watch_info_get_model()    // modello preciso
watch_info_get_color()    // colore scocca → temi
PBL_API_EXISTS(fn)        // esistenza di una API
```
JS (PKJS): `Pebble.getActiveWatchInfo()` → `{platform, model, language, firmware}`. **Controlla sempre l'esistenza:** `if (Pebble.getActiveWatchInfo) { … }`.

### 3.4 Strategia di layout — la parte che conta per "sfruttare al meglio il display PT2"

**Regola d'oro [CONFERMATO]:** *"Avoid hardcoding coordinates"* … *"calculate coordinates and dimensions based upon the size of the root layer, UnobstructedArea and ContentSize"*.

```c
Layer *window_layer = window_get_root_layer(window);
GRect bounds = layer_get_unobstructed_bounds(window_layer);   // NON layer_get_bounds()
```

Tre livelli di adattamento, in ordine di qualità crescente:

1. **Proporzionale puro** — tutto derivato da `bounds.size.w/h`. Funziona ovunque, ma su emery "spreca": ottieni un layout 144×168 stirato, non un layout progettato per 200×228.
2. **Breakpoint via `PBL_DISPLAY_WIDTH`** — costanti diverse per fascia:
   ```c
   #if PBL_DISPLAY_WIDTH >= 200
     #define MARGIN 14
     #define FONT_KEY_TIME FONT_KEY_LECO_42_NUMBERS
   #else
     #define MARGIN 8
     #define FONT_KEY_TIME FONT_KEY_BITHAM_42_MEDIUM_NUMBERS
   #endif
   ```
   Costo zero a runtime, ma raddoppia i percorsi di codice da testare.
3. **Layout "denso" dedicato a emery** — su 200×228 ci stanno **~88% di pixel in più** rispetto a 144×168: usa lo spazio per **informazione aggiuntiva** (una riga di dati in più, un grafico, una progress bar), non per ingrandire gli stessi elementi. Questo è ciò che distingue una app "portata" da una "nativa PT2".

**Libreria community [INCERTO / media]:** esiste `pebble-scalable`, usata per far scalare automaticamente layout 144×168 su emery preservando le proporzioni (documentata in un post del 1 feb 2026 su `blog.chrislewis.me.uk`, che non sono riuscito a leggere per intero — la pagina richiede JS). Utile come **scorciatoia per il porting**, ma per un'app nuova progettata per PT2 non è la strada giusta.

**Leve esclusive di emery da sfruttare:**
- 64 colori (`PBL_COLOR`) su un pannello JDI LPM015M135A a 202 PPI
- `PBL_RGB_BACKLIGHT` — retroilluminazione a colori (solo emery)
- `PBL_TOUCH` — touch screen, con API dedicate dal SDK 4.33 (§5.2)
- `PBL_SPEAKER` — altoparlante (anche flint)
- `MAX_FONT_GLYPH_SIZE = 512` → font custom davvero grandi
- 128K di heap → strutture dati e buffer che su basalt non stavano

### 3.5 `ContentSize` — il dettaglio emery che quasi tutti sbagliano

**[CONFERMATO]** <https://developer.repebble.com/guides/user-interfaces/content-size/>

API: `preferred_content_size()` → `PreferredContentSize` (valori `…Small`, `…Medium`, `…Large`, `…ExtraLarge`).
*"The ContentSize will never change during runtime"* → leggila **una volta** in init.

**Su emery la mappatura è SPOSTATA DI UNO:**

| Impostazione "Text Size" | aplite/basalt/chalk/diorite/**flint** | **emery** |
|---|---|---|
| Small | Small | **Medium** |
| Medium | Medium | **Large** |
| Large | Large | **Extra Large** |

Motivo storico [CONFERMATO, blog Emery SDK beta 11 ott 2016]: emery ha 202 PPI contro 182, quindi il testo apparirebbe più piccolo; *"the Emery platform uses larger fonts by default"*.

⚠️ Se il tuo layout emery assume `PreferredContentSizeMedium` come "default", **su emery il default è già Large**. Testa tutti e tre i setting *su emery* (che significa Medium/Large/ExtraLarge) prima di pubblicare.

---

## 4. Compatibilità delle app legacy sulle nuove watch

### 4.1 "Legacy App Display": Bezel vs Scaled — **confermato dal sorgente firmware**

Questa è la risposta precisa alla domanda "come vengono mostrate le app non-emery su Pebble Time 2".

**[CONFERMATO da sorgente PebbleOS]** `src/fw/shell/prefs.h`:

```c
#ifdef CONFIG_APP_SCALING
// Legacy app rendering mode - whether to use bezel or scaling for legacy apps
typedef enum LegacyAppRenderMode {
  LegacyAppRenderMode_Bezel = 0,           // Center with black bezel (original behavior)
  LegacyAppRenderMode_ScalingNearest = 1,  // Scale to fill screen (nearest-neighbor)
  LegacyAppRenderMode_ScalingBilinear = 2, // Scale to fill screen (bilinear)
  LegacyAppRenderModeCount
} LegacyAppRenderMode;

LegacyAppRenderMode shell_prefs_get_legacy_app_render_mode(void);
void shell_prefs_set_legacy_app_render_mode(LegacyAppRenderMode mode);
#endif
```

**[CONFERMATO]** `src/fw/shell/normal/prefs.c`:
```c
static uint8_t s_legacy_app_render_mode = 1; // Default to scaled mode
```
→ **Il default è `ScalingNearest` (nearest-neighbor a schermo pieno).**

**[CONFERMATO]** UI utente in `src/fw/apps/system/settings/display.c`:
- Voce di menu: **Settings → Display → "Legacy Apps"**, titolo sottomenu **"Legacy App Display"**
- Etichette esatte: **`"Centered"`**, **`"Scaled (Nearest)"`**, **`"Scaled (Bilinear)"`**

**[CONFERMATO]** `CONFIG_APP_SCALING=y` è attivo solo su:
- `boards/obelix/defconfig` → `CONFIG_PLATFORM_EMERY=y` (**Pebble Time 2**, codename hardware *obelix*)
- `boards/getafix/defconfig` → `CONFIG_PLATFORM_GABBRO=y` (**Pebble Round 2**, codename *getafix*)
- `boards/qemu_emery/defconfig` e `boards/qemu_gabbro/defconfig` → **quindi è testabile in emulatore**

**Conseguenza per la Pebble 2 Duo (flint, 144×168):** nessuno scaling. Un'app buildata per `diorite`/`basalt`/`aplite` gira 1:1 a piena risoluzione. **flint è quasi identica a diorite** (stesso display, stessa memoria; differenze: flint ha `PBL_COMPASS` e `PBL_SPEAKER`, non ha `PBL_SMARTSTRAP`).

### 4.2 Cronologia della funzione di upscaling

- **[CONFERMATO]** 2016, SDK 4.2-beta4 "Emery Edition": le app non aggiornate giravano in **Bezel Mode** — *"will appear centered on screen at their original resolution (144x168), but due to the change in PPI, they appear slightly smaller"*. <https://developer.rebble.io/blog/2016/10/11/Emery-SDK-Beta/>
- **[CONFERMATO]** ~1 ott 2025: Core aggiunge l'upscaling automatico. Nearest-neighbor scelto *"for performance reasons"* (bicubic/bilinear costerebbero CPU e batteria). Idea attribuita alla community member **Alina (lastfuture)**. *"developers won't need to lift a finger"*. <https://gadgetsandwearables.com/2025/10/01/pebble-time-2-old-watchfaces/>
- **[CONFERMATO]** 2026: nel firmware corrente esistono **tutte e tre** le modalità, con bilinear aggiunta come opzione utente.

**Implicazione di design [INFERENZA, alta confidenza]:** poiché il default è nearest-neighbor 144→200 (fattore **1,389×**, non intero), una app legacy su PT2 mostra **artefatti di pixel non uniformi**: alcune righe/colonne raddoppiate, altre no. Testo piccolo e linee sottili da 1px sono i più penalizzati. Una build nativa emery è **visibilmente** più nitida. Questo è esattamente il tuo obiettivo #2 e il motivo per cui vale la pena buildare `emery` nativamente invece di affidarsi allo scaling.

### 4.3 App SDK 2.x e app molto vecchie

**[CONFERMATO]**
- Il tool rifiuta progetti antichissimi: `OutdatedProjectException("This project is very outdated, and cannot be handled by this SDK.")` se trova `pebble_app.ld` come symlink, `resources/src/resource_map.json`, o manca `wscript`.
- `sdkVersion` deve essere `"3"` (`SDK_VERSION = "3"` in `pebble_tool/sdk/project.py`); `"2.9"` è tollerato solo se hai l'SDK 2.9 attivo. Qualsiasi altro valore → `PebbleProjectException`.
- Migrazione: **`pebble convert-project`** converte `appinfo.json` → `package.json`.
- Le app **aplite-only** (SDK 2.x) sono ancora *listate* e installabili: `MAX_RESOURCES_SIZE_APPSTORE_2_X = 0x18000` (96K) esiste ancora nella definizione aplite.

**[CONFERMATO]** Stato reale del parco app, parole di Migicovsky: *"All existing Pebble apps are compatible with the new watches, though some apps may not work anymore due to broken settings pages, obsolete APIs, etc."* — il problema pratico non è il rendering, sono le **configuration page ospitate su domini morti** e le API di servizi terzi dismesse.

### 4.4 Cambiamenti firmware 2025–2026 rilevanti

**[CONFERMATO]** Release PebbleOS su GitHub (interrogato 24 ago 2026): ultima **v4.35.0 del 19 ago 2026**; cadenza molto alta (v4.33.0 6 ago, v4.33.1 10 ago, v4.33.2 14 ago, v4.34.0 17 ago).

**SDK correnti [CONFERMATO]:**
- `pebble sdk install latest` → **SDK 4.33.1**, rilasciato **14 ago 2026** (verificato interrogando `https://sdk.repebble.com/v1/files/sdk-core/latest`).
- SDK 4.33 (**12 ago 2026**) consolida i firmware 4.18–4.33. Novità rilevanti:
  - **Touch abilitato di default**, gesture tradotte in eventi bottone; API custom: `tap_recognizer_create()`, `pan_recognizer_create()`, `swipe_recognizer_create()`
  - HRV: `health_service_peek_hrv_ppi_ms()`
  - Fix overflow: passi e calorie sopra 65.535 ora corretti
  - **Binary size limit portato a 128 KiB su Emery e Gabbro**
  - libc passata a **picolibc**
  - Alloy → Moddable SDK 8.3.1, `using` declarations, modulo `pebble/health`
- SDK 4.33.1 (14 ago 2026): hotfix crash sui nuovi touch recognizer (il fix vero è nel firmware 4.33.2); *"Apps built with SDK 4.33.1 remain compatible with firmware 4.33 and 4.33.1"*.

**⚠️ Regressione memoria Alloy/JS da conoscere [CONFERMATO]** — issue #1621 su coredevices/pebbleos:
Dopo l'update a PebbleOS **4.17.0**, ogni watchapp/watchface Alloy non banale crashava al caricamento con **`fxAbort memory full`** riavviando l'orologio.
Causa: la macchina XS ha un blocco **`static` fisso di 32 KB** (`"creation": { "static": 32768 }`) per slot+chunk+stack; Moddable 8.2.3 consuma quasi tutto il baseline prima che parta il codice app. Misure dall'issue: `App bytes free = 87908` (**~88 KB di heap inutilizzato e inaccessibile al motore JS**), `Chunk: used 4252/8192`, `Slot: used 7664/9200`.
**Le app C non sono toccate.**
<https://github.com/coredevices/pebbleos/issues/1621>

---

## 5. Metadata dell'app: `package.json`

**[CONFERMATO]** <https://developer.repebble.com/guides/tools-and-resources/app-metadata/> + `pebble_tool/sdk/project.py`

### 5.1 Campi, con nomi esatti

**Livello radice (npm):**

| Campo | Tipo | Note |
|---|---|---|
| `name` | string | nome breve, **URL-safe**. Mappa su `short_name`. |
| `author` | string | mappa su `company_name`. Default template: `"MakeAwesomeHappen"` |
| `version` | string | **`major.minor.0`** — la patch deve essere 0. Mappa su `versionLabel` |
| `keywords` | array | es. `["pebble-app"]` |
| `private` | bool | flag npm |
| `dependencies` / `devDependencies` | object | Pebble Packages; entrambi vengono uniti dal tool |

**Blocco `pebble`:**

| Campo | Tipo | Note |
|---|---|---|
| `uuid` | UUID v4 | **obbligatorio** salvo `projectType: "package"`. Tenerlo **minuscolo** (publish lo normalizza) |
| `displayName` | string | nome lungo su store e orologio. Mappa su `long_name` |
| `sdkVersion` | string | **`"3"`** |
| `targetPlatforms` | array | vedi §3.1 |
| `enableMultiJS` | bool | default `true` nel template; `require()` CommonJS multi-file |
| `projectType` | string | `native` (default) \| `package` \| `rocky` \| `moddable` — **`moddable` = Alloy** |
| `watchapp.watchface` | bool | **determina la categoria store** (`true` → Faces) |
| `watchapp.hiddenApp` | bool | non appare nel menu di sistema |
| `watchapp.onlyShownOnCommunication` | bool | visibile solo dopo interazione col companion. **Mutuamente esclusivo** con `hiddenApp`, che ha precedenza |
| `capabilities` | array | vedi sotto |
| `messageKeys` | array \| object | chiavi `AppMessage`/`AppSync`. (In `appinfo.json` si chiamava `appKeys`) |
| `resources.media` | array | **max 256 elementi**. `type`: `bitmap`\|`font`\|`raw`\|`pbi`; campi `name`, `file`, `targetPlatforms`, `characterRegex` (font) |
| `resources.publishedMedia` | array | immagini per **AppGlance Slices** e **Timeline Pins**; `name`, `id`, `glance`, `timeline.{tiny,small,large}` |

**`capabilities` — valori validi [CONFERMATO]:**
```json
"capabilities": ["location", "configurable", "health"]
```
- `"location"` — l'app usa la geolocalizzazione via PebbleKit JS
- `"configurable"` — l'app ha una configuration page (abilita l'ingranaggio nella app mobile)
- `"health"` — l'app usa Pebble Health (**necessario** per `health_service_*`)

⚠️ `capabilities` è **dichiarativo** e influenza sia lo store sia i permessi runtime. Se usi le Health API senza `"health"` in `capabilities`, le chiamate falliscono.
⚠️ Il dev portal Rebble ha una checkbox separata **"My app uses timeline"** (Special Permissions) da spuntare se usi i Timeline pins.

### 5.2 Migrazione da `appinfo.json`

**[CONFERMATO]** Comando: **`pebble convert-project`**

Mappature dei nomi che cambiano:

| `appinfo.json` (vecchio) | `package.json` (nuovo) |
|---|---|
| `shortName` | `name` (radice) |
| `longName` | `pebble.displayName` |
| `companyName` | `author` (radice) |
| `versionLabel` | `version` (radice) |
| `appKeys` | `pebble.messageKeys` |
| tutto il resto | dentro `pebble.*` |

Il `.pbw` prodotto contiene comunque un `appinfo.json`/`manifest.json` generato: è da lì che `pebble publish` rilegge `uuid`, `versionLabel`, `targetPlatforms`, `longName`, `watchapp.watchface`.

---

## 6. Checklist QA

### 6.1 Matrice di test emulatore

```bash
pebble build
for P in emery flint gabbro basalt diorite chalk; do
  pebble install --emulator $P
done
```
**[CONFERMATO]** La FAQ elenca ancora *"Valid platforms are aplite, basalt, chalk, diorite, and emery"* — **è obsoleta**: `flint` e `gabbro` sono supportati (il blog del 20 feb 2026 documenta `pebble install emulator --gabbro`, e i board `qemu_emery`/`qemu_gabbro` esistono in PebbleOS).

**Priorità di test per i tuoi obiettivi:**
1. `emery` — target primario, layout nativo
2. `flint` — target secondario B&W (**non `diorite`!**)
3. `emery` con Legacy App Display su `Centered` — per capire cosa vedono gli utenti se hanno cambiato l'impostazione
4. `basalt` — il "denominatore comune" colore
5. `gabbro` — se hai messo `PBL_ROUND` nel codice, va provato davvero

### 6.2 Timeline Quick View / area ostruita

**[CONFERMATO]** <https://developer.repebble.com/guides/user-interfaces/unobstructed-area/>

```bash
pebble emu-set-timeline-quick-view on
pebble emu-set-timeline-quick-view off
```

API:
```c
GRect bounds = layer_get_unobstructed_bounds(layer);   // invece di layer_get_bounds()

UnobstructedAreaHandlers handlers = {
  .will_change = prv_will_change,   // prima che l'ostruzione appaia/sparisca
  .change      = prv_change,        // ripetutamente durante l'animazione
  .did_change  = prv_did_change     // a transizione completata
};
unobstructed_area_service_subscribe(handlers, NULL);
```

⚠️ Regola critica citata testualmente: *"You must ensure you fill the entire window, not just the unobstructed area, when drawing the screen"* — altrimenti compaiono artefatti durante l'animazione.
⚠️ *"The obstruction height should always be calculated at runtime rather than hardcoded, as it may vary across platforms."* Su emery l'altezza dell'ostruzione **non** è quella di basalt.

### 6.3 Content Size

Testare **tutti e tre** i setting di "Text Size" **su emery**, ricordando lo shift (§3.5): su emery ottieni Medium/Large/**ExtraLarge**. Se il tuo layout non gestisce `PreferredContentSizeExtraLarge`, su emery+Large hai testo tagliato.

### 6.4 Test memoria

```c
heap_bytes_free()   // byte liberi
heap_bytes_used()   // byte usati
```
E la riga **`Free RAM`** nell'output di `pebble build`.
Comando utile: **`pebble analyze-size`** (esiste come `analyse_size.py` in pebble-tool).

Budget da rispettare: **flint 64K**, **emery 128K** app heap. Se `targetPlatforms` include `aplite`, il vincolo scende a **24K** e domina tutto il design.

Ricorda **[CONFERMATO]**: *"Apps (code and static variables) are loaded entirely in RAM when they are started. Your resources are only loaded in RAM when you call `resource_load()` … `fonts_load_custom_font()` … `gbitmap_create_with_resource_id()`"*. → Carica le risorse **lazy** e distruggile subito (`gbitmap_destroy`, `fonts_unload_custom_font`).

### 6.5 Test senza telefono (offline-first) — il tuo obiettivo #3

Comandi emulatore:
```bash
pebble emu-bt-connection --connected no
pebble emu-bt-connection --connected yes
pebble emu-battery --percent 15
pebble emu-battery --percent 80 --charging
pebble emu-time-format --format 12       # e --format 24
pebble emu-accel DIRECTION
pebble emu-tap --direction DIRECTION
pebble emu-compass --heading BEARING [--calibrated|--calibrating|--uncalibrated]
pebble emu-app-config [--file FILE]      # testa la config page
pebble wipe                              # reset stato emulatore (persistent storage incluso!)
pebble wipe --everything                 # + dati account
```

API da usare per il comportamento offline:
```c
connection_service_peek_pebble_app_connection()   // stato iniziale all'avvio — usalo SEMPRE
connection_service_subscribe(...)                 // ConnectionHandlers { .pebble_app_connection_handler, .pebbleapp_connection_handler }
```
**[CONFERMATO]** L'API "peek" serve proprio a *"show the correct state of the Bluetooth connection from the start of a watchface"* — senza di essa il primo frame mostra uno stato sbagliato finché non arriva il primo evento.

Checklist offline:
- [ ] L'app si avvia e mostra contenuto utile con BT disconnesso **al primo avvio assoluto** (nessun dato persistito)
- [ ] Nessuna schermata "Loading…" permanente in attesa di AppMessage
- [ ] Dati cache mostrati con **timestamp/età esplicita** ("2 h fa"), mai spacciati per freschi
- [ ] `app_message_outbox_send()` in fallimento è gestito (`APP_MSG_NOT_CONNECTED`) senza bloccare la UI
- [ ] Nessun retry loop aggressivo che drena la batteria a telefono spento
- [ ] Le funzioni core (ora, health, timer, storage) funzionano al 100% offline
- [ ] Riconnessione: l'app si aggiorna da sola, non richiede riavvio manuale

Fonti dati **completamente locali** (nessun telefono richiesto): `TickTimerService`, `HealthService` (passi/sonno/HR/HRV, calcolati sull'orologio), `BatteryStateService`, `AccelerometerService`, `CompassService`, `persist_*`, `WakeupService`, `AppTimer`.

### 6.6 Persistent storage e primo avvio

**[CONFERMATO]** <https://developer.repebble.com/guides/events-and-services/persistent-storage/>
- **4 kB totali per app**
- **`PERSIST_DATA_MAX_LENGTH` = 256 byte** per singolo valore
- API: `persist_exists()`, `persist_read_bool/int/string/data()`, `persist_write_bool/int/string/data()`, `persist_delete()`
- *"Apps that make large use of the Storage API may experience small pauses"* → leggi/scrivi in `init`/`deinit`, non nel tick handler
- I dati **sopravvivono agli update**, vengono **cancellati alla disinstallazione**
- **Versiona lo schema**: scrivi un `SCHEMA_VERSION` in una chiave e gestisci la migrazione

Checklist primo avvio:
- [ ] `persist_exists(KEY)` controllato **prima** di ogni `persist_read_*`
- [ ] Default sensati quando la chiave manca (testato con `pebble wipe`)
- [ ] Migrazione da schema v(N-1) a vN testata installando la versione vecchia, poi la nuova
- [ ] Nessun crash se `persist_read_data` ritorna meno byte del previsto

### 6.7 Localizzazione

**[CONFERMATO]** <https://developer.repebble.com/guides/tools-and-resources/internationalization/>

Locali supportate (valore ritornato da `i18n_get_system_locale()`):
`en_US`, `fr_FR`, `de_DE`, `es_ES`, `it_IT`, `pt_PT`, `en_CN` (cinese/Cina), `en_TW` (cinese/Taiwan).

API:
```c
char *sys_locale = setlocale(LC_ALL, "");   // dichiara supporto i18n + legge locale
setlocale(LC_TIME, "");                     // solo formato data/ora
setlocale(LC_ALL, "fr_FR");                 // forza una locale
i18n_get_system_locale();
```
Effetti di `setlocale()`: traduce `strftime()` `%a %A %b %B %c %x`.
⚠️ *"the SDK will not change the decimal separator added by the `printf()` family … it will always be a `.`"* — se mostri numeri decimali con virgola in italiano, devi farlo a mano.
⚠️ *"any custom fonts used should include the necessary locale-specific characters"* — con `characterRegex` ricordati accenti: `[0-9A-Za-zÀ-ÿ .:]`.

Per molte stringhe: **Locale Framework** (`hash.h`, `localize.h`, `localize.c`, macro `_()`, script `get_dict.py` e `dict2bin.py`, risorse binarie per lingua, fallback automatico all'inglese).

**Store [CONFERMATO]:** *"The appstore does not yet support localizing an app's resources (such as name, description, images etc)"* → metti **tutte le lingue nella stessa descrizione**, con l'elenco delle lingue supportate in cima.

### 6.8 Fuso orario, DST, 12/24h

```c
clock_is_24h_style()                         // preferenza utente 12/24h
strftime(buf, sizeof(buf), clock_is_24h_style() ? "%H:%M" : "%I:%M", tick_time);
time_t t = time(NULL);
struct tm *lt = localtime(&t);               // ora locale (già con TZ e DST)
clock_to_timestamp(...)                      // conversione con timezone
```
Test: `pebble emu-time-format --format 12` / `--format 24`.

Checklist:
- [ ] 12h: niente zero iniziale spurio (`%I` dà "09", spesso si vuole "9") — gestire manualmente
- [ ] 12h: AM/PM mostrato se il layout lo richiede
- [ ] DST: testare a cavallo del cambio ora (l'orologio prende il TZ dal telefono; **offline il TZ resta l'ultimo noto** → è corretto, ma il cambio DST automatico dipende dal database TZ del firmware)
- [ ] Mezzanotte / cambio giorno / cambio mese / anno bisestile
- [ ] `TickTimerService` sottoscritto con l'unità **minima necessaria** (`MINUTE_UNIT` invece di `SECOND_UNIT`) — è la singola scelta con più impatto sulla batteria

### 6.9 Checklist QA riassuntiva pre-pubblicazione

- [ ] Build pulita per **tutte** le `targetPlatforms` senza warning
- [ ] `pebble analyze-size` sotto i limiti su **ogni** piattaforma
- [ ] Risorse: `.pbw` sotto **256K** di risorse per piattaforma
- [ ] UUID minuscolo, v4, unico, invariato rispetto alla release precedente
- [ ] `version` in formato `major.minor.0`, incrementata
- [ ] `capabilities` coerenti con le API usate (`health`, `location`, `configurable`)
- [ ] `watchapp.watchface` corretto (determina la categoria store)
- [ ] Screenshot per **ogni** piattaforma dichiarata, a risoluzione nativa, **non incorniciati**
- [ ] Banner 720×320 (obbligatorio se watchapp)
- [ ] Icone 144×144 e 48×48
- [ ] Release notes scritte
- [ ] Testato con Timeline Quick View ON e OFF
- [ ] Testato con i 3 Content Size, **su emery**
- [ ] Testato con BT disconnesso, dal primo avvio
- [ ] Testato dopo `pebble wipe` (nessun dato persistito)
- [ ] Testato 12h e 24h
- [ ] Testato batteria bassa e in carica
- [ ] Nessuna memory leak dopo N cicli apri/chiudi (`heap_bytes_free()` stabile)
- [ ] Config page (se `configurable`) raggiungibile e su HTTPS con dominio che controlli
- [ ] Nome app conforme alle regole trademark (§8.3)

---

## 7. Note operative per il tuo ambiente (Ubuntu 26.04, no sudo)

### 7.1 Il problema dell'emulatore

**[CONFERMATO]** <https://developer.repebble.com/sdk/> e FAQ: l'emulatore QEMU Pebble richiede a runtime, non forniti da pebble-tool:
`libsdl2-2.0-0`, `libglib2.0-0`, `libpixman-1-0`, `zlib1g`, `libsndio7.0`
La documentazione istruisce `sudo apt install …`. **Tu non hai sudo.**

Percorsi possibili (in ordine di praticità) — **[INFERENZA]**, non testati in questa ricerca:
1. **CloudPebble** — <https://cloudpebble.repebble.com>, IDE browser, zero installazione, include emulatore. Tornato online il **20 feb 2026**. È la via meno resistente per screenshot e test rapidi. Limiti noti dichiarati: *"Most things work, but there will surely be some rough edges"*; il database originale è andato perduto (i progetti vecchi vanno reimportati); GitHub sync e linting non funzionanti.
2. **Estrarre i `.deb` in `~/.local`** con `dpkg -x` e impostare `LD_LIBRARY_PATH`. Le librerie richieste sono tutte runtime-only, quindi è plausibile.
3. **`pebble install --cloudpebble`** su **hardware reale** — **[CONFERMATO]**: il flusso di default oggi usa un **cloud relay**, *"so your computer and phone don't need to be on the same network"*. Setup: app mobile → Devices → ⋯ → **Enable Dev Connect** → login GitHub; poi `pebble login` con lo stesso account GitHub; poi `pebble build && pebble install --cloudpebble`. Log: `pebble logs --cloudpebble`.
   → **Questa è la via migliore se possiedi l'orologio**: bypassa completamente il problema QEMU.

⚠️ Ricorda che `pebble publish` **vuole l'emulatore** per generare le GIF. Senza emulatore: `pebble publish --non-interactive --no-gif-all-platforms --screenshots emery_1.png flint_1.png …` (nomi file con prefisso piattaforma obbligatorio), oppure usa il dev portal web.

### 7.2 Installazione tool

**[CONFERMATO]**
```bash
# uv (installabile in user space, no sudo)
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install pebble-tool          # richiede Python >= 3.10
pebble sdk install latest            # → SDK 4.33.1 (ago 2026)
pebble sdk list
pebble sdk activate VERSION
```
Il blog di febbraio 2026 suggeriva `uv tool install pebble-tool --python 3.13`. **Con Python 3.14 di sistema, forzare una versione supportata via `--python 3.13` è prudente** (uv scarica il runtime da solo) — **[INFERENZA]**.

`arm-none-eabi-gcc` **non serve installarlo a parte**: il toolchain è incluso nel bundle SDK scaricato da `pebble sdk install`.

### 7.3 Skill Claude Code ufficiale

**[CONFERMATO]** Core Devices mantiene <https://github.com/coredevices/pebble-watchface-agent-skill> — una **Agent Skill per Claude Code** che impacchetta la conoscenza SDK per scaffolding, build, test in emulatore e verifica visiva di watchface.
Default: **Emery (200×228, 64 colori)**. Include template C (statico/animato/weather), esempi, script Python di validazione, e una fase finale opzionale di **pubblicazione sull'App Store**.
Vincoli tecnici codificati nella skill: niente floating point, tick al minuto per la batteria, pre-allocazione delle strutture, cleanup rigoroso delle risorse.
Licenza: *"This skill and associated templates are provided for creating Pebble watchfaces. Individual watchfaces you create are your own."*

---

## 8. Vincoli legali e di licenza

### 8.1 Le licenze in gioco

**[CONFERMATO]**

| Componente | Licenza | Fonte |
|---|---|---|
| **PebbleOS** (firmware) | **Apache 2.0** | github.com/coredevices/pebbleos |
| Blob non liberi del firmware | proprietaria, repo separato | github.com/coredevices/pebbleos-nonfree |
| **pebble-tool** (CLI) | **MIT** | github.com/coredevices/pebble-tool |
| `tools/pebble_sdk_platform.py` | Apache 2.0, `SPDX-FileCopyrightText: 2024 Google LLC` | — |
| **Pebble SDK** (API, sample code, docs) | **Pebble SDK License Agreement** (proprietaria) | developer.repebble.com/legal/sdk-license/ |
| Componenti open source dentro l'SDK | licenza propria, prevale sull'EULA | rePebble.com/legal/open_source |

**La tua app è tua [CONFERMATO]:** *"Pebble does not obtain any ownership interest in any applications that you develop using the Pebble SDK"* e *"You retain ownership of any copyrights or other intellectual property rights applicable to your submissions."*

**Restrizioni della SDK License [CONFERMATO]**, §3 e §5:
- Licenza *"limited, non-transferable, non-sublicensable, non-exclusive, worldwide … solely to develop, test and operate applications that will run on the Pebble Platform"*
- Vietato: reverse engineering dell'SDK (**eccetto** modificare il sample code, che è esplicitamente permesso), redistribuire l'SDK, rimuovere note di copyright, usarlo per service bureau/time sharing
- Contiene una **clausola di arbitrato vincolante** e un limite temporale per i reclami

⚠️ **Osservazione [CONFERMATO ma anomalo]:** i documenti legali su `developer.repebble.com/legal/*` sono ancora **il testo storico di Pebble Technology Corp.** — indicano come controparte *"Pebble Technology Corp., a Delaware corporation, 900 Middlefield Road, 5th Floor, Redwood City, CA 94063"*, un'entità che **non esiste più**. Non sono stati riscritti per Core Devices. Praticamente irrilevante per un'app hobbistica; **rilevante se progetti qualcosa di commerciale** — in quel caso conviene chiedere chiarimenti a Core.

### 8.2 Developer Program Policies

**[CONFERMATO]** <https://developer.repebble.com/legal/program-policies/> — struttura: 1. Content Policies · 2. System Interference · 3. Network Usage and Terms · 4. Spam and Placement in the Marketplace · 5. Promotion · 6. Ad Policy · 7. Policy Enforcement.

Divieti principali: materiale sessualmente esplicito (**zero tolerance** su CSAM, con segnalazione alle autorità); violenza gratuita/bullismo; hate speech; impersonificazione e comportamenti ingannevoli (incluso *"names or icons that appear confusingly similar to existing products"*); violazione IP; dati personali/confidenziali; attività illegali; **gambling** (anche giochi di abilità con premi in denaro); malware/spyware.
Notevole §1.9: *"A Product downloaded from the Pebble Mobile App(s) may not modify, replace or update its own binary code using any method other than the update mechanism of the Pebble Mobile App(s)"* → **niente auto-update fuori dallo store**.
§2.2: niente pubblicità nelle notifiche di sistema. §4: niente contenuti ripetitivi, niente keyword stuffing.
Takedown: §6.2 del Distribution Agreement, *"Pebble may remove the Product … or reclassify the Product in its sole discretion"*.

### 8.3 Marchio "Pebble" nel nome dell'app — regole precise

**[CONFERMATO]** <https://developer.repebble.com/legal/pebble-trademark/>

✅ **Permesso** (uso referenziale):
- `"Awesome App for Pebble"` — il marchio deve essere **meno prominente** del nome del prodotto
- Formule ammesse: *"for"*, *"for use with"*, *"runs on"*, *"compatible with"*

❌ **Vietato:**
- `"Pebble Awesome"` — Pebble come parte del nome del prodotto
- *"You may not use or register, in whole or in part, Pebble or any other Pebble trademark … as or as part of a company name, trade name, product name, or service name"*
- Varianti/abbreviazioni/giochi di parole: **"Pebbletree"**, **"PebMart"** sono citati esplicitamente come vietati
- Qualsiasi **logo Pebble** o simbolo grafico di proprietà Pebble, senza autorizzazione scritta (riservato a rivenditori e licenziatari autorizzati)
- Implicare endorsement/sponsorizzazione; uso denigratorio; merchandising

Distribution Agreement §4.2: *"You will not otherwise use any trademark, service mark, commercial symbol or other proprietary right of Pebble as part of the title for any of your Products."*

**Regola pratica:** chiama la tua app `Nome for Pebble`, mai `Pebble Nome`, e non usare la P stilizzata nell'icona.

---

## 9. Azioni consigliate

### Priorità 1 — Correzioni immediate all'impostazione del progetto

1. **Correggi il target: la Pebble 2 Duo è `flint`, non `diorite`.** Se hai già del codice o dei piani con `diorite` come "il B&W", cambiali. Suggerimento di `targetPlatforms` iniziale:
   ```json
   "targetPlatforms": ["emery", "flint", "gabbro", "basalt", "diorite"]
   ```
   (`emery` = primario, `flint` = secondario reale, `gabbro` = futuro prossimo già in vendita, `basalt`+`diorite` = parco installato storico a costo quasi zero. Ometti `aplite`: il suo limite di 24K heap ti costringerebbe a compromessi su tutto il resto. Ometti `chalk` se non vuoi gestire il layout rotondo — ma se includi `gabbro` sei già rotondo-compatibile, quindi tanto vale tenerlo.)

2. **Scrivi in C, non in Alloy/JavaScript.** Motivazioni convergenti con tutti e quattro i tuoi obiettivi:
   - Alloy gira **solo su emery e gabbro** → escluderebbe del tutto la Pebble 2 Duo
   - La FAQ ufficiale dice di usare C quando vuoi *"the smallest possible memory footprint"*
   - La macchina XS ha un **tetto statico di 32 KB** con ~88 KB di heap inaccessibili (issue #1621): un bug architetturale aperto che ha già causato crash-loop e factory reset
   - Performance: nessun interprete tra te e i 240 MHz del SF32LB52J

3. **Genera l'UUID in minuscolo** e non cambiarlo mai più. `pebble publish` lo normalizza ma è meglio partire pulito.

### Priorità 2 — Design per sfruttare il display PT2

4. **Progetta a 200×228 per primo, poi degrada a 144×168.** Il contrario produce una app che sembra "portata". Usa i pixel extra per **più informazione**, non per elementi più grandi.

5. **Usa i suffissi descrittivi, non i nomi di piattaforma:** `~color~rect~200w` invece di `~emery`. Ti protegge da future piattaforme e rende esplicita l'intenzione.

6. **Metti `targetPlatforms` sulle singole risorse pesanti.** Un asset a colori 200×228 non deve esistere nel bundle flint. È la leva più diretta sul limite di 256K risorse, che è **identico** su emery e basalt nonostante l'88% di pixel in più.

7. **Usa `characterRegex` su ogni font custom.** Un font completo mangia il budget risorse; se ti servono solo cifre e due punti, `"characterRegex": "[0-9:]"`. Su emery puoi permetterti glifi fino a 512 byte (`MAX_FONT_GLYPH_SIZE`), quindi font grandi e nitidi sono possibili — ma solo se limiti il set di caratteri.

8. **Gestisci `PreferredContentSizeExtraLarge`.** Su emery esiste ed è raggiungibile con l'impostazione "Large": è il caso che rompe più layout. Leggi `preferred_content_size()` una volta sola in init.

9. **Valuta le API esclusive emery** come differenziatore: `PBL_TOUCH` (con `tap_recognizer_create()` / `pan_recognizer_create()` / `swipe_recognizer_create()` dal SDK 4.33), `PBL_RGB_BACKLIGHT`, `PBL_SPEAKER`. Guardale sempre con `#ifdef` o `PBL_IF_*_ELSE`.

### Priorità 3 — Offline-first

10. **Chiama `connection_service_peek_pebble_app_connection()` in `init`**, non aspettare il primo evento: altrimenti il primo frame mostra uno stato di connessione sbagliato.

11. **Nessuna schermata di attesa bloccante.** Ogni vista deve avere un rendering utile con soli dati locali. Se mostri dati in cache, mostra anche la loro **età**.

12. **`TickTimerService` con `MINUTE_UNIT`** salvo necessità reale del secondo. È la scelta singola con più impatto su batteria e CPU.

13. **Versiona lo schema del persistent storage** (4 kB totali, 256 byte per valore). Scrivi `SCHEMA_VERSION` in una chiave dedicata e gestisci la migrazione: gli aggiornamenti dell'app **non** cancellano i dati.

### Priorità 4 — Toolchain e QA

14. **Se possiedi l'orologio, usa `pebble install --cloudpebble`** (cloud relay + Dev Connect + login GitHub): aggira completamente il problema QEMU/SDL senza sudo. Altrimenti **CloudPebble** in browser per gli screenshot.

15. **Automatizza la matrice di test** con un loop su tutte le piattaforme, e includi tra i casi anche `emery` con Legacy App Display su `Centered`.

16. **Testa sempre dopo `pebble wipe`** — è l'unico modo di riprodurre davvero il primo avvio senza dati persistiti.

17. **Considera la skill ufficiale** <https://github.com/coredevices/pebble-watchface-agent-skill> come base di partenza per i watchface: è mantenuta da Core Devices e ha emery come default.

### Priorità 5 — Pubblicazione

18. **Pubblica su entrambi gli store.** La sincronizzazione automatica Rebble→Core annunciata a ottobre 2025 non è più affidabile (thread forum del 4 giu 2026). Ordine consigliato:
    - **Core (primario):** `pebble publish --is-published --release-notes "…"` oppure `developer.repebble.com/dashboard`
    - **Rebble (secondario):** upload manuale del `.pbw` su `dev-portal.rebble.io`
19. **Non dimenticare `--is-published`.** Senza quel flag la release resta invisibile (default `False`).
20. **Prepara gli asset una volta sola** nelle dimensioni esatte: banner **720×320**, large icon **144×144**, small icon **48×48**, screenshot a risoluzione nativa per piattaforma (**200×228** emery, **144×168** flint/diorite/basalt/aplite, **180×180** chalk, **260×260** gabbro). Screenshot del listing **senza cornice**.
21. **Nome dell'app:** `<Nome> for Pebble`, mai `Pebble <Nome>`. Niente logo Pebble nell'icona.
22. **Prima release come "Unlisted"/non pubblicata** per verificare il listing, poi passa a Public. Sul portale Rebble puoi anche collegare un thread del forum per gli annunci automatici.
23. **Non aspettarti una review:** la pubblicazione è immediata e la moderazione è solo a posteriori. La responsabilità di conformità a Program Policies è interamente tua.

---

## 10. Domande aperte / non confermate

1. **Sincronizzazione Rebble ↔ Core nel 2026.** Il titolo del thread del 4 giu 2026 ("Apps published via dev-portal.rebble.io never appear in the Core appstore feed") indica che è rotta, ma non ho potuto leggere le risposte né trovare una dichiarazione ufficiale di Core. *Confidenza media.*
2. **Dimensione esatta richiesta per gli screenshot emery/gabbro sul dev portal.** Lo zip di template ufficiale contiene solo 144×168 e 180×180. La risoluzione nativa (200×228 / 260×260) è l'inferenza logica e coerente con lo storage per-piattaforma dell'API, ma non è documentata.
3. **KiezelPay è ancora operativo sulle nuove watch?** Nessuna conferma primaria 2026.
4. **Stato di risoluzione dell'issue Alloy #1621** (32 KB static machine). Non ho verificato se un firmware post-4.17 abbia aumentato il limite. Irrilevante se scegli C.
5. **Testi legali aggiornati per Core Devices.** I documenti su `developer.repebble.com/legal/` nominano ancora Pebble Technology Corp. Non è chiaro chi sia la controparte contrattuale reale oggi.
6. **`pebble install --emulator flint`** — non documentato esplicitamente (la FAQ elenca solo fino a `emery`), ma i board QEMU e il supporto `flint` nell'SDK 4.9.127+ lo rendono quasi certo. Da verificare al primo run.
7. **Fattibilità pratica dell'emulatore QEMU senza sudo** su Ubuntu 26.04 estraendo i `.deb` in `~/.local`. Plausibile ma non testato.
8. **`MAX_RESOURCES_SIZE_APPSTORE` è verificato in fase di publish?** Il valore è nel platform file, ma non ho confermato che l'upload rifiuti un `.pbw` che lo supera.

---

## 11. Fonti

**Documentazione ufficiale Core Devices / Pebble**
- FAQ sviluppatori — <https://developer.repebble.com/faqs/> (contiene la mappa piattaforme definitiva, C vs Alloy, emulatore)
- Hardware Information — <https://developer.repebble.com/guides/tools-and-resources/hardware-information/>
- App Metadata — <https://developer.repebble.com/guides/tools-and-resources/app-metadata/>
- Platform-specific Resources — <https://developer.repebble.com/guides/app-resources/platform-specific/>
- Building for Every Pebble — <https://developer.repebble.com/guides/best-practices/building-for-every-pebble/>
- Content Size — <https://developer.repebble.com/guides/user-interfaces/content-size/>
- Unobstructed Area — <https://developer.repebble.com/guides/user-interfaces/unobstructed-area/>
- Persistent Storage — <https://developer.repebble.com/guides/events-and-services/persistent-storage/>
- Internationalization — <https://developer.repebble.com/guides/tools-and-resources/internationalization/>
- Platform (C API) — <https://developer.repebble.com/docs/c/Foundation/Platform/>
- Installazione SDK — <https://developer.repebble.com/sdk/>
- Changelog SDK 4.33 (12 ago 2026) — <https://developer.repebble.com/sdk/changelogs/4.33/>
- Changelog SDK 4.33.1 (14 ago 2026) — <https://developer.repebble.com/sdk/changelogs/4.33.1/>

**Legale**
- Distribution Agreement — <https://developer.repebble.com/legal/distribution/>
- SDK License Agreement — <https://developer.repebble.com/legal/sdk-license/>
- Program Policies — <https://developer.repebble.com/legal/program-policies/>
- Trademark Guidelines — <https://developer.repebble.com/legal/pebble-trademark/>
- Terms of Use — <https://developer.repebble.com/legal/terms-of-use/>

**Sorgenti (fonte più autorevole per i numeri)**
- `pebble_sdk_platform.py` — <https://raw.githubusercontent.com/coredevices/pebbleos/main/tools/pebble_sdk_platform.py>
- `publish.py` — <https://github.com/coredevices/pebble-tool/blob/main/pebble_tool/commands/publish.py>
- `package.json` template — <https://github.com/coredevices/pebble-tool/blob/main/pebble_tool/sdk/templates/app/package.json>
- `manager.py` (lista piattaforme) — <https://github.com/coredevices/pebble-tool/blob/main/pebble_tool/sdk/manager.py>
- `prefs.h` / `prefs.c` / `display.c` (Legacy App Render Mode) — <https://github.com/coredevices/PebbleOS/blob/main/src/fw/shell/prefs.h>
- `platform.h` — <https://github.com/coredevices/PebbleOS/blob/main/src/fw/applib/platform.h>
- Issue #1621 (memoria Alloy) — <https://github.com/coredevices/pebbleos/issues/1621>
- Agent Skill watchface — <https://github.com/coredevices/pebble-watchface-agent-skill>
- pebble-tool releases (v5.0.39, 30 giu 2026) — <https://github.com/coredevices/pebble-tool/releases>

**Blog e annunci (con date)**
- 9 ott 2025 — (re)Introducing the Pebble Appstore — <https://ericmigi.com/blog/re-introducing-the-pebble-appstore/>
- 9 ott 2025 — Rebbles in a World with Core — <https://rebble.io/2025/10/09/rebbles-in-a-world-with-core.html>
- 17 nov 2025 — Core Devices Keeps Taking Advantage Of Our Work — <https://rebble.io/2025/11/17/core-devices-keeps-stealing-our-work.html>
- 18 nov 2025 — Pebble, Rebble, and a Path Forward — <https://ericmigi.com/blog/pebble-rebble-and-a-path-forward/>
- 18 feb 2026 — February Pebble Production and Software Updates — <https://repebble.com/blog/february-pebble-production-and-software-updates>
- 20 feb 2026 — CloudPebble Returns! Plus New Pure JavaScript and Round 2 SDK — <https://repebble.com/blog/cloudpebble-returns-plus-pure-javascript-and-round-2-sdk>
- 24 mar 2026 — Pebble Time 2 Is In Mass Production! — <https://repebble.com/blog/pebble-time-2-is-in-mass-production>
- 2 apr 2026 — Spring 2026 Pebble App Contest + SDK Updates — <https://repebble.com/blog/spring-2026-pebble-app-contest>
- 14 lug 2026 — Pebble Mega Update - July 2026 — <https://repebble.com/blog/pebble-mega-update-july-2026>
- 11 ott 2016 — 4.2-beta4 SDK - Emery Edition! (Bezel Mode, storico) — <https://developer.rebble.io/blog/2016/10/11/Emery-SDK-Beta/>
- 1 ott 2025 — Pebble Time 2 will upscale all old watchfaces automatically — <https://gadgetsandwearables.com/2025/10/01/pebble-time-2-old-watchfaces/>

**Portali e API**
- Rebble Developer Portal — <https://dev-portal.rebble.io/>
- Template asset ufficiali Rebble — <https://dev-portal.rebble.io/res/zip/exampleImages.zip>
- Pebble Developer Dashboard (Core) — <https://developer.repebble.com/dashboard>
- Pebble App Store API — <https://appstore-api.repebble.com/>
- Appstore frontend Core — <https://apps.repebble.com/>
- Appstore frontend Rebble — <https://apps.rebble.io/>
- Guida legacy "Appstore Publishing" — <https://developer.rebble.io/guides/appstore-publishing/>
- Wiki: Preparing a new app for the Rebble App Store — <https://github.com/pebble-dev/wiki/wiki/Preparing-a-new-app-for-the-Rebble-App-Store>
- Forum Core (thread store) — <https://forum.repebble.com/t/switch-from-rebble-app-store-to-core-app-store/38>

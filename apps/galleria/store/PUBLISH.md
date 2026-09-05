# Galleria — pubblicazione con `pebble publish` (S9, P3)

> Preparato al banco il **5 settembre 2026** leggendo il **sorgente del pebble-tool 5.0.40 installato**
> (`~/.local/share/uv/tools/pebble-tool/lib/python3.13/site-packages/pebble_tool/`, d'ora in poi `<PT>/`) e la
> documentazione web. **Nessun comando di pubblicazione e nessun `pebble login` sono stati eseguiti.**
> Ogni riga marcata **[F]** e' un fatto verificato (file:riga o comando eseguito); **[I]** e' un'ipotesi da confermare.
> Versione dello strumento: `pebble --version` → `Pebble Tool v5.0.40 (active SDK: v4.33.1)` **[F]**.

---

## 1. Sintesi in cinque righe

1. `pebble publish` **ricostruisce da solo** il progetto, carica `build/galleria.pbw` e — se l'UUID non e' gia' noto
   all'account — **crea la voce dello store** (nome, descrizione, sorgente, icone, screenshot) in una sola chiamata.
2. **`--is-published` non fa niente nella 5.0.40**: il tool manda sempre `isPublished=true` (e `visible=true` alla
   creazione). Dalla CLI **non esiste** una bozza ne' una release unlisted. **[F]** `<PT>/commands/publish.py:548`, `:845-846`.
3. Per la prima pubblicazione servono **obbligatoriamente** `--description` (in `--non-interactive`) e **almeno uno
   screenshot**; il nome file dello screenshot deve **iniziare con il nome della piattaforma**.
4. La cattura automatica di GIF richiede **ffmpeg**, che in questa VM **non c'e'** (`which ffmpeg` → nessun risultato,
   exit 1 **[F]**): quindi **sempre `--no-gif-all-platforms`** e screenshot locali con `--screenshots`.
5. Se si omette `--source`, il tool ci mette **da solo** l'URL del remote git: qui `https://github.com/Rediro-MC/galleria-da-polso`.
   **Decisione U4 presa il 05/09/2026**: il repo viene **reso pubblico** (codice **MIT**, `LICENSE` in radice) e
   l'URL si passa **esplicito** nel comando di §4.

---

## 2. Prerequisiti

| # | Prerequisito | Come si verifica / nota |
|---|---|---|
| 1 | Login Firebase del pebble-tool | `pebble login` apre il browser su un callback `http://localhost:60000/` **[F]** `<PT>/firebase_account.py:199-201`; con VM senza browser: `pebble login --no-open-browser` stampa l'URL **[F]** `<PT>/commands/account.py:97-98`. Verifica **senza pubblicare**: `pebble login --status` **[F]** `<PT>/commands/account.py:83`, stampa email, User ID, Developer ID e «Developer link: linked/not linked». |
| 2 | Credenziali salvate | File `~/.local/share/pebble-sdk/firebase_oauth_storage.json` **[F]** `<PT>/firebase_account.py:38` + `<PT>/util/__init__.py:17-29`. **Oggi NON esiste** (`ls` del 05/09/2026 → «No such file or directory») **[F]**: l'account non e' ancora collegato su questa macchina. |
| 3 | Account developer sullo store | Non serve crearlo a mano: se `/api/v1/developer/me` risponde `403 DEVELOPER_NOT_LINKED`, il tool chiama `/api/v1/developer/create` e ricontrolla **[F]** `publish.py:124-136`, `:350-360`. |
| 4 | Progetto pronto | `pebble publish` **ricompila** con `BuildCommand` (equivalente di `pebble build`, `debug=False`) e nasconde l'output: lo mostra **solo se la build fallisce** **[F]** `publish.py:217-235`. Quindi: fare prima il gate (`pebble clean && pebble build`, `make -C test`, `python3 ../../tools/build_config_page.py --check`) e lanciare `publish` **con l'ambiente pulito, senza `GALLERIA_DEFINES`**. |
| 5 | `.pbw` atteso | `build/galleria.pbw` (il nome viene dal **basename della cartella del progetto**) **[F]** `publish.py:237-239`. La build S8 in `build_s8/` non c'entra. |
| 6 | Asset dello store | `python3 store/make_assets.py --check` verde **dopo** aver rigenerato gli screenshot con le foto demo nuove (P1/P6). Dimensioni attuali verificate con Pillow **[F]**: `icon_48.png` 48x48 RGB, `icon_80.png` 80x80 RGB, `icon_144.png` 144x144 RGB, `emery_screenshot_1.png` 200x228 RGB, `flint_screenshot_1.png` 144x168 RGB. |
| 7 | Testi del listing | `store/LISTING.md` (P2), con i due file di puro testo **gia' estratti**: `store/description.txt` (1.494 B con il newline finale = 1.493 caratteri, con la riga finale «Beta 0.1.0. Open source (MIT): github.com/Rediro-MC/galleria-da-polso») e `store/release_notes_0.1.0.txt` (522 B = 521 caratteri; il file si chiamava `release_notes_1.0.0.txt` fino al 05/09 sera), cosi' il comando qui sotto e' riproducibile e la lunghezza si controlla con `wc -m` **[F]**. |

---

## 3. Che cosa fa `pebble publish`, passo per passo **[F]**

Ordine reale delle operazioni in `<PT>/commands/publish.py:110-215`:

1. **Token**: `--firebase-id-token` → variabile `PEBBLE_FIREBASE_ID_TOKEN` → credenziali locali; se manca tutto, errore
   «Not logged in with Firebase. Run 'pebble login' first…» (`:114-122`).
2. **Preflight**: `GET <api-base>/api/v1/developer/me`; se l'account developer non e' collegato lo crea (`:124-136`).
   `--api-base` default `https://appstore-api.repebble.com` (`:26`, `:982-987`).
3. **Build** del progetto (`:138`), poi controllo che `build/galleria.pbw` esista (`:141-142`).
4. **Metadati dal `.pbw`** (`:241-272`): legge `appinfo.json` dentro lo zip →
   `app_uuid` = `uuid`, `version` = `versionLabel`, `platforms` = `targetPlatforms`,
   `app_name` = `longName` (poi `shortName`, poi `displayName`), `app_type` = `watchface` se `watchapp.watchface == true`.
   Verificato sul `.pbw` del 05/09 alle 17:17 (`unzip -p build/galleria.pbw appinfo.json`) **[F]**: `uuid` gia'
   minuscolo, `versionLabel` `1.0.0`, `longName`/`shortName`/`displayName` = **`Galleria`**, `watchapp.watchface` =
   `true`, `targetPlatforms` = `["emery","flint"]`, `companyName` = `Marco`. ⚠️ **Quel `.pbw` e' superato**: la sera
   del 05/09 `package.json` e' passato a `"version": "0.1.0"` e `"author": "Rediro"` (decisioni U7 e U2), e
   `appinfo.json` e' **generato** dalla build → dopo `pebble clean && pebble build` il `.pbw` avra' `versionLabel`
   **`0.1.0`** e `companyName` **`Rediro`**: ricontrollarlo con `unzip -p` prima di pubblicare. Il `.pbw` pesava
   **667.686 B** (`ls -l`) e conteneva anche `pebble-js-app.js.map` (209.681 B) **[F]** (`unzip -l`): il peso cambia
   a ogni build, va riletto dopo il gate.
5. **Normalizzazione UUID**: se l'UUID nel `.pbw` avesse maiuscole, il tool crea un `.pbw` temporaneo con l'UUID
   minuscolo (`:274-307`). Il nostro e' gia' minuscolo → nessuna copia.
6. **Versione pubblicata** = `--version` → `package.json`/`versionLabel` (`:149-153`). Dal 05/09/2026 (sera) e'
   **`0.1.0`**: prima release pubblica in **beta** (decisione U7, tag git `v0.1.0-beta`).
7. **Bivio** (`:162-186` vs `:188-207`): se l'UUID compare in `app_lookup.by_app_uuid` dell'account →
   **aggiunta di una release** a un'app esistente; altrimenti → **creazione di una nuova app**.
8. **Upload** in multipart con barra d'attesa, timeout **300 s** (`:571-578`, `:894-902`).
9. **Stampa finale** (`:961-976`): «Visit the dashboard…: https://appstore-api.repebble.com/dashboard» e
   «App page: https://apps.rePebble.com/<appId>», piu' il riepilogo `screenshotResults` (caricati / falliti).

### Campi che il tool manda davvero al server

| Chiamata | Campi form | Riga |
|---|---|---|
| Nuova app — `POST /api/dashboard/apps` | `name`, `type` (`watchface`), `version`, `expectedUuid`, `description`, `source`, `releaseNotes`, `visible="true"`, `isPublished="true"`, (`category` solo se valorizzata), `iconPrompt` **solo per le watchapp senza icone** | `:836-859` |
| File allegati | `pbwFile`, `iconSmall`, `iconLarge`, `screenshots_<piattaforma>` (uno per file) | `:869-892`, `:377-395` |
| Nuova release — `POST /api/dashboard/apps/<id>/releases` | `version`, `releaseNotes`, `isPublished="true"`, `replaceScreenshots`, `pbwFile`, `screenshots_<piattaforma>` | `:544-568` |

---

## 4. Comando consigliato per la PRIMA pubblicazione

```bash
. ~/ProgettiClaude/Pebble/tools/pebble-env.sh
cd ~/ProgettiClaude/Pebble/apps/galleria

# controlli prima di sparare (nessuno di questi pubblica niente)
pebble login --status                                          # prerequisito: account collegato (§2 punto 1)
wc -m store/description.txt store/release_notes_0.1.0.txt      # 1494 e 522 (con newline): descrizione <= 1600 (doc Rebble), tetto prudenziale 1500 (LISTING.md §2)
python3 store/make_assets.py --check
pebble clean && pebble build                                   # `version`/`author` cambiati il 05/09: appinfo.json e' generato
unzip -p build/galleria.pbw appinfo.json                       # atteso: versionLabel 0.1.0, companyName Rediro
unzip -l build/galleria.pbw

pebble publish \
  --non-interactive \
  --no-gif-all-platforms \
  --name        "Galleria for Pebble" \
  --version     0.1.0 \
  --description "$(cat store/description.txt)" \
  --release-notes "$(cat store/release_notes_0.1.0.txt)" \
  --source      "https://github.com/Rediro-MC/galleria-da-polso" \
  --icon-small  store/icon_80.png \
  --icon-large  store/icon_144.png \
  --screenshots store/emery_screenshot_1.png store/flint_screenshot_1.png
```

**Valori decisi dall'utente il 05/09/2026 (sera)** — il comando non ha piu' segnaposto: `--version 0.1.0` (U7: prima
release pubblica in **beta**, tag git `v0.1.0-beta` a carico dell'orchestratore), `--source` con l'URL esplicito del
repo **reso pubblico** (U4) sotto licenza **MIT** (U1, `LICENSE` in radice, «Copyright (c) 2026 Rediro»),
`--description` dal file che ora finisce con «Beta 0.1.0. Open source (MIT): github.com/Rediro-MC/galleria-da-polso»,
`--release-notes` dal file rinominato `store/release_notes_0.1.0.txt`. L'autore (U2: **Rediro**) non si passa dalla
CLI: sta in `package.json` → `companyName` del `.pbw`. La **visibilita'** (U6) non si passa dalla CLI: vedi §8.
**Omettere `--source` non e' un'opzione**: il tool ci mette da solo il remote git (`:808`, `:817`); passarlo esplicito
e' la stessa cosa ma senza sorprese.

Perche' cosi':

- **`--non-interactive`**: niente domande; i valori arrivano dai flag (`:796-821`). Senza questo flag, per una
  **watchface** il tool chiede a video solo: *App name*, *Version*, *Short description* (obbligatoria), *Source URL*
  (preimpostato con il remote git) e la sorgente degli screenshot — **non** chiede ne' categoria ne' icone
  (`:732-774`: quei due blocchi sono dentro `if app_type == "watchapp"`).
- **`--no-gif-all-platforms`**: la cattura GIF e' **accesa per default** (`:991-995`) e chiama `ffmpeg`, assente qui
  (`<PT>/commands/screenshot.py:154-160` → `ToolError: Missing required tool for GIF capture: ffmpeg`). In pratica,
  passando `--screenshots` in modalita' non interattiva l'emulatore non viene nemmeno toccato (`:451-461`), ma il flag
  resta la cintura di sicurezza per ogni chiamata futura **senza** `--screenshots` (per esempio un aggiornamento).
- **`--name`**: senza, il nome sarebbe **`Galleria`** (dal `longName` del `.pbw`) (`:806`, `:814`).
- **`--description`**: **obbligatoria** con `--non-interactive` quando l'app non esiste ancora, altrimenti
  `ToolError: Creating a new app in --non-interactive mode requires --description.` (`:800-804`).
- **`--source`**: vedi §6.
- **`--icon-small` / `--icon-large`**: vedi §5.
- **niente `--category`**: per una watchface il tool non manda categoria (`:777-779` → `None` → `:848` non la aggiunge
  al form). Vedi §7.
- **niente `--is-published`**: e' inerte (§8). Il comando qui sopra e quello «pubblico» fanno **la stessa cosa**.

**Variante «pubblica subito» (nominale)** — aggiungere `--is-published`: dichiara l'intenzione ed e' a prova di futuro,
ma **oggi non cambia nulla** perche' il campo inviato e' comunque `isPublished=true` (`:548`, `:846`).

**Variante «nuova release su app gia' esistente»** (dalla release dopo la 0.1.0 in poi): il tool riconosce l'app
dall'UUID e manda solo versione, note e `.pbw`; nome, descrizione, icone e sorgente **non** si aggiornano piu' dalla
CLI (§9).

```bash
pebble publish --non-interactive --no-gif-all-platforms \
  --release-notes "$(cat store/release_notes_<versione>.txt)"
# screenshot invariati: senza --screenshots non ne carica (allow_skip, publish.py:171 e :450-465)
# per SOSTITUIRE gli screenshot: aggiungere --screenshots ... --replace-screenshots (irreversibile da CLI, :1020-1023)
```

---

## 5. Icone e screenshot: regole del tool

**Screenshot [F]**

- Il nome del file **deve iniziare con il nome della piattaforma seguito da `_`**: il tool spezza il basename al primo
  underscore e usa la prima parte come piattaforma, costruendo il campo `screenshots_<piattaforma>`
  (`:369-375`, `:377-395`). Un file senza underscore → `ToolError: Could not infer platform from capture filename`.
  I nostri `emery_screenshot_1.png` / `flint_screenshot_1.png` sono gia' corretti (vedi `store/README.md`).
- Estensione `.gif` → trattato come GIF, tutto il resto → screenshot statico (`:457-458`). Il MIME viene indovinato
  dall'estensione (`.png` → `image/png`, verificato con `mimetypes` **[F]**).
- Il tool **non controlla ne' dimensioni ne' peso**: valida solo che il file esista (`:454-456`).
- Alla **creazione** di una nuova app almeno uno screenshot e' obbligatorio: senza, `ToolError: No screenshots were
  collected. Screenshot upload is required for publish.` (`:420-426`, `:459-464`).
- Nessun flag per il **banner**: dalla CLI non si carica (per una watchface e' comunque facoltativo, vedi §10).

**Icone [F]**

- I prompt interattivi dicono **iconSmall 80x80** e **iconLarge 144x144** (`:759-760`) → per `--icon-small` si usa
  **`icon_80.png`**; `icon_48.png` e' la taglia del **vecchio** portale Rebble e resta buona per il listing, le
  anteprime e la procedura Rebble di §10. `store/README.md` (§«Taglia delle icone», righe 42-43 e 65-68) dice gia'
  la stessa cosa: allineato il 05/09/2026.
- In modalita' non interattiva le icone vengono lette dai flag **a prescindere dal tipo di app** (`:819-820`) e
  caricate come `iconSmall`/`iconLarge` se il percorso e' valorizzato (`:871-889`): quindi **una watchface puo'
  mandare le icone**, anche se il flusso interattivo non le chiede.
- La generazione automatica dell'icona via `iconPrompt` riguarda **solo le watchapp** senza icone (`:850-859`):
  Galleria non la subisce.
- **[I]** Non e' scritto da nessuna parte che il server accetti icone per una watchface: se rispondesse 400, il comando
  fallisce **senza creare l'app** (`:933-938`) e basta rilanciarlo togliendo i due flag `--icon-*`.

---

## 6. `--source`: cosa succede se lo si omette

**[F]** In modalita' non interattiva, `source` = `--source` **oppure**, se assente, l'URL del remote git ricavato con
`git config --get remote.origin.url` eseguito nella cartella corrente (`:817`, `:623-650`); il suffisso `.git` viene
tolto e le forme `git@host:path` / `ssh://git@…` sono convertite in `https://…`.

Qui il remote e' `https://github.com/Rediro-MC/galleria-da-polso.git` (comando eseguito **[F]**) → **omettere
`--source` NON significa «nessun sorgente»**: il listing riceverebbe comunque il link al repo.

**Decisione U4 (05/09/2026, sera): il repo viene reso pubblico** con licenza **MIT** (U1, `LICENSE` in radice) →
si passa l'URL **esplicito**, come nel comando di §4. Le altre due strade restano documentate solo per memoria:

1. ~~repo privato~~ → si sarebbe passato **`--source ' '`** (un singolo spazio): e' «vero» per Python, ma `.strip()`
   lo riduce a stringa vuota (`:817` + `:843`) → il campo parte vuoto. **[F]** meccanica letta nel codice e provata
   con `python3`; **[I]** che il server accetti `source` vuoto non e' documentato;
2. sito web / e-mail di supporto: **non esistono flag** nella CLI (§9) → si compilano dalla dashboard.

⚠️ Il link nel listing funziona **solo se il repo e' davvero pubblico** al momento della pubblicazione: controllarlo
prima di lanciare il comando (la visibilita' del repo la cambia l'utente su GitHub, non un comando di questo progetto).

---

## 7. Campi, valori e limiti

| Campo | Da dove viene | Obbligatorio | Limite noto |
|---|---|---|---|
| `name` | `--name`, altrimenti `longName` del `.pbw` (= `Galleria`) | no (default = `longName` del `.pbw`) | **[I]** nessun limite nel sorgente; non documentato |
| `type` | dedotto dal `.pbw`: `watchface` (`watchapp.watchface = true`) | automatico | — |
| `version` | `--version` → `package.json` `0.1.0` | no (default = `versionLabel` del `.pbw`, che dopo la ricompilazione e' `0.1.0`) | formato `major.minor.0` per convenzione del progetto; U7: prima release **beta** |
| `expectedUuid` | `uuid` del `.pbw` = `6f2dd646-a76a-44ff-8719-b012d04c79a4` | automatico | deve essere minuscolo (normalizzato dal tool) |
| `description` | `--description` | **si'** con `--non-interactive` su app nuova | **1600 caratteri** secondo la doc Rebble **[I]** per lo store Core: non c'e' controllo nel tool |
| `releaseNotes` | `--release-notes` (default stringa vuota, `:988`) | no | **[I]** nessun limite noto; 3-5 righe come da spec |
| `source` | `--source` (deciso: `https://github.com/Rediro-MC/galleria-da-polso`) o, se assente, remote git | no | vedi §6 |
| `category` | `--category` (normalizzata) | **no per le watchface** | valori riconosciuti: `daily`, `tools`, `notifications`, `remotes`, `health`, `games`, piu' alias (`tools-utilities`→`tools`, `health-fitness`/`fitness`→`health`, `game`→`games`, `notification`→`notifications`, `remote`→`remotes`) **[F]** `:668-688` |
| `visible` / `isPublished` | costanti `"true"` | — | §8 |
| `iconSmall` / `iconLarge` | `--icon-small` / `--icon-large` | no | 80x80 / 144x144 secondo i prompt **[F]** `:759-760` |
| screenshot | `--screenshots` | **si'** alla creazione | max **5 per piattaforma**, PNG/GIF/GIF animata, **non incorniciati** (doc Rebble) **[I]** per lo store Core |

Sul **valore della categoria per una watchface**: il tool sa leggere l'elenco `category_options.watchface` restituito
da `/api/v1/developer/me` (`:690-702`), ma quel ramo e' irraggiungibile perche' viene chiamato solo per le watchapp
(`:745-746`), e il default per una watchface e' `None` (`:777-779`). **Conclusione [F]: per Galleria non si passa
`--category`.** Se in dashboard risultasse obbligatoria, la si imposta li'.

---

## 8. `--is-published`, bozze e release «unlisted»

**Fatti [F]:**

- L'opzione esiste e la sua guida dice «Create/publish release as visible immediately (default: false)» (`:989-990`).
- Il valore **viene passato alle funzioni ma mai usato** per costruire il corpo della richiesta: e' presente solo nelle
  firme (`:539`, `:832`) e nella ri-chiamata di ripiego (`:610`, `:930`).
- Il corpo inviato contiene **sempre** `"isPublished": "true"` (release, `:548`) e **sempre**
  `"visible": "true", "isPublished": "true"` (creazione, `:845-846`).

**Conseguenza:** con il pebble-tool 5.0.40 **non si puo' pubblicare una bozza ne' una release unlisted dalla CLI**;
la frase di `PIANO-SVILUPPO-PEBBLE.md` §13 («senza `--is-published` la release resta bozza») **e' superata** e va
corretta. Non esiste nessun flag di visibilita' (`--unlisted`, `--private`, `--draft`: assenti da `add_parser`,
`:978-1024`).

**Come ottenere allora il piano U6 (prima release riservata, poi pubblica) [I]:**

1. **Prima scelta** — controllare la dashboard (`https://appstore-api.repebble.com/dashboard`, link stampato dal tool a
   `:964`; il sito developer.repebble.com rimanda a `https://developer.rePebble.com/dashboard`) e vedere se offre una
   visibilita' *unlisted/hidden* come il portale Rebble: in quel caso, pubblicare dalla CLI e **subito dopo** mettere
   l'app in unlisted dalla dashboard. ⚠️ La doc Rebble avverte che «once made public, an app cannot then be made
   private»: se vale anche per lo store Core, **questa strada e' a senso unico**.
2. **Seconda scelta (piu' prudente)** — creare l'app **dalla dashboard web** (dove i campi di visibilita' esistono) e
   usare la CLI solo dopo, per le release successive.
3. **Terza scelta** — accettare che la 0.1.0 sia pubblica dal primo istante e **fare tutta la revisione del listing
   prima** (testi, screenshot, icone, foto demo): e' l'unica opzione totalmente sotto controllo da questa VM.

**Decisione U6 (05/09/2026, sera): la visibilita' si gestisce sul portale developer**, non dalla CLI. In pratica si
segue la prima o la seconda scelta qui sopra a seconda di cosa offre la dashboard quando si pubblica; il comando di
§4 resta identico (nessun flag di visibilita' esiste). ⚠️ Resta valido l'avviso Rebble: «once made public, an app
cannot then be made private».

---

## 9. Cosa NON si puo' fare dalla CLI **[F]**

- **Bozza / unlisted / nascondere l'app** (§8) e, in generale, cambiare la visibilita'.
- **Cancellare** un'app o una release; **annullare** una pubblicazione.
- **Modificare il listing di un'app gia' creata**: nome, descrizione, sorgente, icone e categoria vengono inviati
  **solo nella chiamata di creazione** (`:836-859`); la chiamata di release manda soltanto `version`, `releaseNotes`,
  `isPublished`, `replaceScreenshots`, il `.pbw` e gli screenshot (`:544-568`). Tutto il resto si corregge in dashboard.
- **Caricare un banner / header image**, un **sito web**, una **e-mail di supporto**, una **companion app**, o
  **tradurre** il listing: nessun flag corrispondente (`:978-1024`).
- **Aggiungere screenshot senza sostituirli** e' il comportamento di default; `--replace-screenshots` sostituisce ed e'
  **irreversibile da CLI** (`:1020-1023`), con conferma interattiva richiesta salvo `--non-interactive` (`:510-528`).
- **Scegliere il momento della pubblicazione** rispetto alla build: `publish` **ricompila sempre** (`:138`, `:217-235`).

### Trappole da conoscere prima di premere invio

- **Errore sugli screenshot = pubblicazione «monca» silenziosa [F]**: se il server risponde 400 con la parola
  `screenshot` nel messaggio, il tool **ripete l'upload senza screenshot** (`:600-613`, `:918-932`) stampando solo un
  avviso giallo → l'app puo' nascere **senza immagini**. Controllare sempre l'ultima riga «Uploaded screenshots: N»
  (`:968-976`).
- **`DEVELOPER_NOT_LINKED` in fase di upload** → messaggio «Run 'pebble publish' again to auto-create your developer
  account» (`:594-598`): si rilancia lo stesso comando.
- **Timeout 300 s** per creazione e release (`:576`, `:900`); il `.pbw` da caricare pesa 667.686 B **[F]** (05/09, dopo R01).
- **Output della build nascosto** (`:220`): i numeri di «APP MEMORY USAGE» non si vedono: prenderli dal gate P6.
- **Analytics**: ogni comando manda un evento `invoke_command_publish` (`<PT>/commands/base.py:59`).
- **[I]** Descrizione con accenti: `requests` invia il multipart in UTF-8, quindi il testo italiano dovrebbe passare
  intero. La regola «solo ASCII» del progetto (F-S8-2) riguarda i log del PKJS, non questo campo.

---

## 10. Procedura Rebble (store secondario, facoltativo)

Fonti web (**[F]** = citazione dalla pagina, **[I]** = interpretazione):

1. Il portale developer e' `https://dev-portal.rebble.io/`: chiede login, tipo di app (**Watchface** / Watch App),
   *Name*, *Category* (Daily, Tools & Utilities, Notifications, Remotes, Health & Fitness, Games), *Description*,
   *Release Notes*, **almeno uno screenshot per piattaforma** supportata (elenco che include **Emery** e **Flint**),
   icone «large e small» per l'app locker, **banner obbligatorio per le app e facoltativo per le watchface**, piu'
   campi facoltativi: *Website URL*, *Source code URL*, visibilita' **public o unlisted/hidden**, permesso timeline,
   «Do not announce release» **[F]** (dev-portal.rebble.io).
2. Vincoli dichiarati nella guida: **descrizione max 1600 caratteri**, **max 5 screenshot per piattaforma** in PNG,
   GIF o GIF animata, gli screenshot del listing **non devono avere cornici** **[F]**
   (developer.rebble.io/guides/appstore-publishing/preparing-a-submission/ e /appstore-assets/).
3. Si carica il `.pbw` come «release» con note facoltative, poi si preme **Publish** (o **Publish Privately** per la
   sola condivisione via link diretto). Attenzione: «once made public, an app cannot then be made private» **[F]**
   (developer.rebble.io/guides/appstore-publishing/publishing-an-app/).
4. Percorso alternativo documentato su `help.rebble.io/appstore-submission/`: compilare il modulo su `rebble.io/submit`,
   generare il *submission bundle* e mandarlo via e-mail a `support@rebble.io`; la pubblicazione «normally happens
   pretty quickly» **[F]**.
5. **[I]** Per Galleria (watchface) servirebbero: `store/icon_48.png` + `store/icon_144.png` (taglie storiche del
   portale Rebble), `store/emery_screenshot_1.png`, `store/flint_screenshot_1.png`, la stessa descrizione ≤ 1600
   caratteri e le stesse release notes. Nessun banner.
6. **Program policies** (valgono per lo store Core, `developer.repebble.com/legal/program-policies/`) **[F]**: nessuna
   revisione preventiva, ma rimozione a posteriori per contenuti illeciti/ingannevoli, violazioni di proprieta'
   intellettuale, pubblicita' che imita l'interfaccia di sistema, raccolta di dati senza consenso, gioco d'azzardo,
   software dannoso; violazioni ripetute → chiusura dell'account. Galleria (foto dell'utente, nessuna rete, nessuna
   pubblicita', font OFL, foto demo CC0) **[I]** non tocca nessuna di queste voci; l'unica cura richiesta e' che
   descrizione e screenshot non promettano cose non verificate (batteria, iPhone, Pebble 2 Duo reale).

> **[I]** Le pagine `developer.repebble.com/guides/appstore-publishing/*` rispondono **404** (verificato **[F]**): la
> versione Core della documentazione non ha piu' quella sezione, quindi i limiti citati (1600 caratteri, 5 screenshot)
> vengono dalla documentazione **Rebble** e sono da considerare **indicativi** per lo store Core, finche' non li
> conferma la dashboard.

---

## 11. Da confermare prima di pubblicare

> Le decisioni **U1–U9** sono state prese dall'utente il **05/09/2026 (sera)**: licenza **MIT**, autore **Rediro**,
> foto demo CC0 confermate, repo **pubblico** per `--source`, SDK **4.33.1**, visibilita' **dal portale**, versione
> **0.1.0 (beta)**. Qui restano solo i punti che dipendono dal server o dall'ambiente.

1. **U6 / visibilita' [presa]**: si gestisce **sul portale** (§8) — resta da vedere sul posto se la dashboard Core
   offre unlisted: in caso contrario vale la terza scelta di §8 (listing rivisto **prima** del publish).
2. **U4 / `--source` [presa]**: repo **pubblico**, URL esplicito nel comando (§6). Da controllare **prima di
   pubblicare** che il repo sia gia' pubblico su GitHub, altrimenti il link del listing da' 404.
3. **U2 / nome autore [presa]**: `package.json` ha ora `"author": "Rediro"` → dopo `pebble clean && pebble build`
   il `.pbw` porta `companyName: Rediro` (da riverificare con `unzip -p build/galleria.pbw appinfo.json`); lo store
   mostra comunque il nome del developer collegato all'account, non questo campo **[I]**.
4. **Limiti reali** di nome/descrizione/note nello store Core: nessun controllo nel tool, quindi si scoprono solo
   provando (o dalla dashboard). Tenere la descrizione **≤ 1600 caratteri** per sicurezza.
5. **Icone per una watchface**: accettate dal server? (§5) — piano B: rilanciare senza `--icon-*`.
6. Correggere `PIANO-SVILUPPO-PEBBLE.md` §13 (riga 515: «senza `--is-published` la release resta bozza») e §12
   (riga 37 della tabella): con il tool 5.0.40 `--is-published` e' **inerte** e la release nasce **pubblica** (§8).
   (`store/README.md` era gia' stato corretto il 05/09: cita `icon_80.png` per `--icon-small`.)

---

## 12. Fonti

**Sorgente letto** (pebble-tool 5.0.40, `~/.local/share/uv/tools/pebble-tool/lib/python3.13/site-packages/pebble_tool/`):
`commands/publish.py` (1024 righe, tutto), `commands/screenshot.py:154-160,287-406`, `commands/account.py:1-101`,
`account.py:182-191`, `firebase_account.py:36-48,190-201`, `util/__init__.py:17-29`, `commands/base.py:34-59`,
`sdk/project.py:100-186`, `pebble_tool-5.0.40.dist-info/METADATA`.

**Comandi eseguiti**: `pebble --version`; `which ffmpeg`; `git config --get remote.origin.url`;
`ls ~/.local/share/pebble-sdk/`; `unzip -l build/galleria.pbw`; `unzip -p build/galleria.pbw appinfo.json`;
`unzip -p build/galleria.pbw emery/manifest.json`; `ls -l store/`; dimensioni PNG via Pillow;
`python3 -c "import mimetypes; …"`.

**Web** (5 settembre 2026): developer.rebble.io/guides/appstore-publishing/preparing-a-submission/ ·
developer.rebble.io/guides/appstore-publishing/publishing-an-app/ ·
developer.rebble.io/guides/appstore-publishing/appstore-assets/ · dev-portal.rebble.io ·
help.rebble.io/appstore-submission/ · developer.repebble.com/legal/ · developer.repebble.com/legal/program-policies/ ·
appstore-api.repebble.com (documentazione API pubblica: nessun endpoint di dashboard documentato).

**Documenti di progetto**: `PIANO-SVILUPPO-PEBBLE.md` §13, `apps/galleria/store/README.md`,
`apps/galleria/README.md` §Licenze e §«Pubblicazione nello store (S9)», `docs/design/galleria-s9-pubblicazione.md`.

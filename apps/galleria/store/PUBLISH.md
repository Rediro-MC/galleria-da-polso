# Galleria — pubblicazione con `pebble publish` (S9, P3)

> **PUBBLICATA il 05/09/2026 alle 20:41** (0.1.0) e **release 0.2.0 la sera stessa** con la variante «nuova release» (`--release-notes` da `store/release_notes_0.2.0.txt`, log locale `publish_020.log`: «Resolved existing appstore app ID … Release created successfully»); con il comando di creazione (§4; testo intero in `LISTING.md` §6; esito in `apps/galleria/publish_010.log`, file locale): app **`cdf80cc3bf6745b1a310e4c8`**, pagina https://apps.rePebble.com/cdf80cc3bf6745b1a310e4c8, dashboard https://appstore-api.repebble.com/dashboard. Verificato via API (`/api/v1/apps/id/<id>`): title «Galleria for Pebble», type watchface, author «Rediro», category «Faces» (assegnata dal server), `visible: true`, release 0.1.0 con le note, `source` = repo GitHub, descrizione completa; **screenshot emery e flint online** (`hardware_platforms[].images.screenshot`); **`icon_image`/`list_image` vuoti** subito dopo la creazione (per una watchface lo store usa lo screenshot; da ricontrollare in dashboard dopo qualche minuto: il tool parlava di «icon generation may take ~2 min»). Il repo sorgente è **pubblico** dalla stessa sera (storia riscritta prima del push).
>
> **RELEASE 0.4.0 PUBBLICATA il 18/09/2026** (~00:50 locali; API `published_date` 2026-09-17T22:50 UTC) con il
> comando di `LISTING.md` §6 (`pebble publish --non-interactive --no-gif-all-platforms --version 0.4.0
> --release-notes …`; log locale `publish_040.log`: «Resolved existing appstore app ID … Release created
> successfully»). Pre-check tutti verdi (test, clean build 29.080/28.968 B, `make_assets.py --check`, 795/697 B,
> `versionLabel 0.4.0`). Quel giorno il `PATCH` di §0.1 **non è stato lanciato** (bloccato dal permission mode di
> Claude Code, «Create Public Surface»): alle 00:55 del 18/09 (commit `79abb57`) `title` era ancora «Galleria for
> Pebble» e la descrizione era la vecchia.
>
> **Stato al 19/09/2026, prima del `PATCH`** (API pubblica `GET /api/v1/apps/id/cdf80cc3bf6745b1a310e4c8`):
> `title` è **«Galleria»**, rinominata **dall'utente dalla dashboard** e **non** con il comando di §0.1; la
> **descrizione è ancora quella vecchia** — il testo della 0.2.0 senza il prefisso «Beta 0.2.0, », **777
> caratteri** (non è `store/description.txt`, che ne ha 794) —, quindi il `PATCH` di §0.1 **resta da lanciare per
> la sola descrizione** (→ fatto la sera stessa, sotto). Screenshot online: **5 emery + 3 flint**
> (`emery_screenshot_6.png` no: unico con foto CC-BY-SA-4.0, decisione dell'utente → tolto la sera stessa; lo
> store ri-codifica tutti i PNG in palette, flint pixel-identici ed emery quasi: §5). CI di GitHub Actions
> **verde** sui commit `6e79f6f` e `79abb57`.
>
> **19/09/2026 sera — PATCH ESEGUITO**: l'orchestratore ha lanciato la ricetta di §0.1 **tale e quale**, su
> richiesta esplicita dell'utente (questa volta il permission mode **non** ha bloccato): cookie di sessione
> (`POST /api/auth/firebase/session`) **HTTP 200**, `PATCH /api/dashboard/apps/cdf80cc3bf6745b1a310e4c8`
> **HTTP 200**. Verifica sull'API pubblica subito dopo: `title` **«Galleria»** e **descrizione online =
> `store/description.txt`** (**794 caratteri**, identica senza il newline finale); screenshot (5 emery + 3 flint),
> icone e release 0.4.0 **invariati**. Nello stesso giro `emery_screenshot_6.png` è stato **tolto da `store/` e
> dal repo** (non era online): la cartella ha ora **8 screenshot**, esattamente quelli dello store.
>
> **Stato al 14/09/2026 (UX-4, D126)**, verificato sull'API pubblica `GET /api/v1/apps/id/cdf80cc3bf6745b1a310e4c8`:
> `title` è **ancora «Galleria for Pebble»** e l'ultima release è **ancora la 0.2.0** (pubblicata il 05/09 alle 21:16).
> Il `PATCH` di §0.1 **non è mai stato lanciato** e la **0.3.0 non è mai stata pubblicata**: il nome «Galleria» (D42)
> e la descrizione nuova arrivano con la **0.4.0**. Le **icone 80/144 sono online** dal 05/09 alle 23:27 (§0), quindi
> il dubbio «`icon_image`/`list_image` vuoti, da ricontrollare» della riga qui sopra è **chiuso**: nell'API le
> icone 80/144 risultano presenti (campo `list_image`).
>
> Preparato al banco il **5 settembre 2026** leggendo il **sorgente del pebble-tool 5.0.40 installato**
> (`~/.local/share/uv/tools/pebble-tool/lib/python3.13/site-packages/pebble_tool/`, d'ora in poi `<PT>/`) e la
> documentazione web. **Nessun comando di pubblicazione e nessun `pebble login` sono stati eseguiti.**
> Ogni riga marcata **[F]** e' un fatto verificato (file:riga o comando eseguito); **[I]** e' un'ipotesi da confermare.
> Versione dello strumento: `pebble --version` → `Pebble Tool v5.0.40 (active SDK: v4.33.1)` **[F]**.

---

## 0. Aggiornare il listing SENZA la dashboard (verificato il 05/09/2026 sera)

La dashboard (Next.js) usa la stessa API del tool con un **cookie di sessione** ricavato dal token del `pebble login`
(`POST /api/auth/firebase/session` con `{"idToken": …}`; il token lo dà `pebble_tool.account.get_account(auth_provider='firebase').get_access_token()`
nel Python del pebble-tool). Con quel cookie l'app accetta **`PATCH /api/dashboard/apps/<id>`** come **form multipart**:
il campo `title` è obbligatorio in ogni PATCH (altrimenti 400 «Title is required»), i campi non inviati restano com'erano
(verificato: visibilità, sorgente, categoria e release intatte). Così il 05/09 alle 23:27 sono state aggiornate dal banco
la **descrizione** (789 caratteri, `--form-string "description=$(cat store/description.txt)"`) e le **icone**
(`-F "iconSmall=@store/icon_80.png;type=image/png" -F "iconLarge=@store/icon_144.png;type=image/png"`: il `pebble publish`
di una watchface le lascia vuote), entrambe verificate poi su `GET /api/v1/apps/id/<id>` (l'API pubblica riflette il cambio
in pochi secondi).

Note: un `PATCH` con `Content-Type: application/json` dà 500 («Content-Type was not one of multipart/form-data…»);
`GET /api/dashboard/apps/<id>` con il solo `Bearer` dà 401 (serve il cookie); `OPTIONS` sull'app elenca
`GET, HEAD, OPTIONS, PATCH, DELETE`. Il cookie e il token sono credenziali: file temporanei fuori dal repo, da cancellare dopo l'uso.

### 0.1 Comando pronto per la 0.4.0: nome «Galleria» + descrizione nuova

> Scritto in S11 per la 0.3.0, **mai lanciato** (→ lanciato il 19/09/2026 sera, esito sotto); la 0.3.0 non è uscita,
> quindi vale **tale e quale per la 0.4.0** (D126). Il corpo del comando **non cambia di una lettera**: cambiano
> solo il numero della release che gli sta accanto (`pebble publish --version 0.4.0`, `LISTING.md` §6) e il testo
> di `store/description.txt`, che oggi dice «Beta 0.4.0».

**Decisione D42** (`docs/design/galleria-s11-lingue-es-pt.md`): con la **0.4.0** l'app nello store si chiama
**«Galleria»** e non più «Galleria for Pebble». Il nome **non si cambia dalla CLI** (`--name` vale solo alla
creazione, §9): lo cambia il campo **`title`** di questo `PATCH`, che è **obbligatorio in ogni chiamata** — quindi
**lo stesso comando** rinomina l'app *e* carica la descrizione nuova (`store/description.txt`, 794 caratteri).
⚠️ Da qui in poi, ogni `PATCH` futuro deve portare `title=Galleria`: rimettere il vecchio testo rinominerebbe
l'app all'indietro. `store/LISTING.md` §1 (riga «Nome nello store») e §5 (riga 30) sono già allineati al nome nuovo.

**Nota del 19/09/2026**: il **titolo è già online** — l'app nello store si chiama «Galleria» perché l'utente l'ha
rinominata **dalla dashboard**, non con questo comando. Il comando qui sotto resta **identico** (`title` è
obbligatorio in ogni `PATCH`: il valore «Galleria» conferma quello che c'è già) e oggi serve **per la sola
descrizione**, che online è ancora quella vecchia della 0.2.0 (777 caratteri) → **eseguito la sera stessa**:
esito sotto il blocco di comandi.

```bash
cd ~/ProgettiClaude/Pebble/apps/galleria
APP=cdf80cc3bf6745b1a310e4c8                      # id dell'app (stampato dal publish, PUBLISH.md in testa)
API=https://appstore-api.repebble.com
JAR=$(mktemp -d)/cookies.txt                      # credenziale: FUORI dal repo, da cancellare dopo l'uso

# 1) token Firebase del pebble-tool (serve un `pebble login` gia' fatto)
TOK=$(~/.local/share/uv/tools/pebble-tool/bin/python -c \
  "from pebble_tool.account import get_account; print(get_account(auth_provider='firebase').get_access_token())")

# 2) cookie di sessione della dashboard (il PATCH con il solo Bearer da' 401)
curl -sS -c "$JAR" -X POST "$API/api/auth/firebase/session" \
  -H 'Content-Type: application/json' --data-binary "{\"idToken\": \"$TOK\"}" >/dev/null

# 3) PATCH multipart: title (obbligatorio; al 19/09/2026 CONFERMA il nome gia' online) + descrizione; il resto non cambia
curl -sS -b "$JAR" -X PATCH "$API/api/dashboard/apps/$APP" \
  --form-string "title=Galleria" \
  --form-string "description=$(cat store/description.txt)"

# 4) verifica sull'API pubblica (riflette in pochi secondi)
curl -sS "$API/api/v1/apps/id/$APP" | python3 -m json.tool | grep -m2 -E '"(title|description)"' | cut -c1-120

rm -f "$JAR"                                       # via il cookie appena finito
```

✅ **Eseguito il 19/09/2026 sera** dall'orchestratore, su richiesta esplicita dell'utente, **tale e quale** (scritto
in S11 per la 0.3.0 e mai lanciato né allora né in UX-4; **bloccato dal permission mode il 18/09/2026**): sessione
**HTTP 200**, `PATCH` **HTTP 200**; al punto 4 `title` **«Galleria»** (già così dalla mattina: rinominata
dall'utente dalla dashboard) e **descrizione = `store/description.txt`**, **794 caratteri** (per contarla,
`wc -m store/description.txt` = **795** con il newline finale — ricontato il 14/09/2026). Da qui in poi ogni
`PATCH` futuro porta `title=Galleria` (sopra). Il comando non era **legato al gate sul telefono**
(`docs/design/galleria-s13-ux4-gate-telefono.md`, D128), che resta una cosa a parte. Le **icone** non vanno
rimandate (sono gia' online dal 05/09); se servisse rifarle, si aggiungono allo stesso `PATCH`
`-F "iconSmall=@store/icon_80.png;type=image/png"` e `-F "iconLarge=@store/icon_144.png;type=image/png"`. Il
`PATCH` **non pubblica una release**: la **0.4.0** con `store/release_notes_0.4.0.txt` (**696** caratteri, 697 con
il newline) la fa `pebble publish` (`LISTING.md` §6 e §3.0), e i due passi sono indipendenti — si fanno però
**nello stesso giro**, perché è la stessa novità per chi legge la pagina dello store. Il giro si è chiuso il
**19/09/2026**: la release 0.4.0 il 18/09, il `PATCH` della descrizione la sera del 19/09.

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
   l'URL si passa **esplicito** nel comando di creazione (§4; testo intero in `LISTING.md` §6).

---

## 2. Prerequisiti

| # | Prerequisito | Come si verifica / nota |
|---|---|---|
| 1 | Login Firebase del pebble-tool | `pebble login` apre il browser su un callback `http://localhost:60000/` **[F]** `<PT>/firebase_account.py:199-201`; con VM senza browser: `pebble login --no-open-browser` stampa l'URL **[F]** `<PT>/commands/account.py:97-98`. Verifica **senza pubblicare**: `pebble login --status` **[F]** `<PT>/commands/account.py:83`, stampa email, User ID, Developer ID e «Developer link: linked/not linked». |
| 2 | Credenziali salvate | File `~/.local/share/pebble-sdk/firebase_oauth_storage.json` **[F]** `<PT>/firebase_account.py:38` + `<PT>/util/__init__.py:17-29`. **Oggi NON esiste** (`ls` del 05/09/2026 → «No such file or directory») **[F]**: l'account non e' ancora collegato su questa macchina. |
| 3 | Account developer sullo store | Non serve crearlo a mano: se `/api/v1/developer/me` risponde `403 DEVELOPER_NOT_LINKED`, il tool chiama `/api/v1/developer/create` e ricontrolla **[F]** `publish.py:124-136`, `:350-360`. |
| 4 | Progetto pronto | `pebble publish` **ricompila** con `BuildCommand` (equivalente di `pebble build`, `debug=False`) e nasconde l'output: lo mostra **solo se la build fallisce** **[F]** `publish.py:217-235`. Quindi: fare prima il gate (`pebble clean && pebble build`, `make -C test`, `python3 ../../tools/build_config_page.py --check`) e lanciare `publish` **con l'ambiente pulito, senza `GALLERIA_DEFINES`**. |
| 5 | `.pbw` atteso | `build/galleria.pbw` (il nome viene dal **basename della cartella del progetto**) **[F]** `publish.py:237-239`. La build S8 in `build_s8/` non c'entra. |
| 6 | Asset dello store | `python3 store/make_assets.py --check` verde **dopo** aver rigenerato gli screenshot con le foto demo nuove (P1/P6). Dimensioni attuali verificate con Pillow **[F]**: `icon_48.png` 48x48 RGB, `icon_80.png` 80x80 RGB, `icon_144.png` 144x144 RGB, `emery_screenshot_1.png` 200x228 RGB, `flint_screenshot_1.png` 144x168 RGB (19/09/2026 sera: `--check` verde con 8 screenshot + 3 icone, elenco in `store/README.md`). |
| 7 | Testi del listing | `store/LISTING.md` (P2), con i file di puro testo **gia' estratti**, cosi' i comandi sono riproducibili e la lunghezza si controlla con `wc -m` **[F]**. Oggi: `store/description.txt` **795 B con il newline finale = 794 caratteri** (riscritta il 06/09, chiusa con «Beta 0.4.0»; il tetto in vigore e' **800 caratteri**, chiesto dall'utente per la 0.4.0 — non i 1.500/1.600 della prima stesura, `LISTING.md` §2) e `store/release_notes_0.4.0.txt` **697 B = 696 caratteri**; restano anche `release_notes_0.2.0.txt` (473 B) e `release_notes_0.1.0.txt` (522 B; si chiamava `release_notes_1.0.0.txt` fino al 05/09 sera). |

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
   `true`, `targetPlatforms` = `["emery","flint"]`, `companyName` = il nome personale dell'autore di allora.
   ⚠️ **Quel `.pbw` e' superato**: la sera del 05/09 `package.json` e' passato a `"version": "0.1.0"` e `"author":
   "Rediro"` (decisioni U7 e U2), e `appinfo.json` e' **generato** dalla build → dopo `pebble clean && pebble build`
   il `.pbw` avra' `versionLabel` **`0.1.0`** e `companyName` **`Rediro`**: ricontrollarlo con `unzip -p` prima di
   pubblicare. Il `.pbw` pesava **667.686 B** (`ls -l`) e conteneva anche `pebble-js-app.js.map` (209.681 B) **[F]**
   (`unzip -l`): il peso cambia a ogni build, va riletto dopo il gate.
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

## 4. I comandi: prima pubblicazione (storico) e variante «nuova release»

> **La prima pubblicazione e' stata fatta il 05/09/2026** (0.1.0, esito in testa a questo file). Il
> comando di **creazione** — con `--name`, `--description`, `--icon-small`/`--icon-large`,
> `--screenshots` e `--source` — non si riusa piu': dalla seconda release in poi quei campi non si
> aggiornano dalla CLI (§9) e si cambiano con il `PATCH` di §0/§0.1. Resta scritto per intero in
> `LISTING.md` §6 (ultimo blocco «storico»), insieme ai prerequisiti e alla tabella dei valori
> U1–U9 che lo riempivano.

Di quella chiamata **vale ancora** questo:

- **`--no-gif-all-platforms` sempre**: la cattura GIF e' accesa per default (`:991-995`) e chiama
  `ffmpeg`, assente in questa VM (`<PT>/commands/screenshot.py:154-160`). Passando `--screenshots` in
  modalita' non interattiva l'emulatore non viene nemmeno toccato (`:451-461`), ma il flag resta la
  cintura di sicurezza per ogni chiamata **senza** `--screenshots`.
- **`--description` e' obbligatoria** con `--non-interactive` finche' l'app non esiste (`:800-804`);
  senza **`--name`** il nome sarebbe `Galleria`, il `longName` del `.pbw` (`:806`, `:814`); **niente
  `--category`** per una watchface (`:777-779` → `:848`, §7); **`--is-published`** e' inerte (§8),
  quindi la variante «pubblica subito» fa la stessa cosa.
- Senza `--non-interactive`, per una **watchface** il tool chiede a video solo *App name*, *Version*,
  *Short description* (obbligatoria), *Source URL* (preimpostato con il remote git) e la sorgente
  degli screenshot: **non** chiede ne' categoria ne' icone (`:732-774`, i due blocchi sono dentro
  `if app_type == "watchapp"`).
- **Omettere `--source` non e' un'opzione**: il tool ci mette da solo il remote git (`:808`, `:817`),
  quindi passarlo esplicito e' la stessa cosa senza sorprese (§6).
- Le tre trappole della chiamata (output della build nascosto, timeout di 300 s, errore 400 sugli
  screenshot che fa ripartire l'upload **senza immagini**) sono in §9.

### Variante «nuova release su app gia' esistente»

Dalla 0.2.0 in poi — quindi anche per la **0.4.0** — il tool riconosce l'app dall'UUID e manda solo
versione, note e `.pbw`; nome, descrizione, icone e sorgente **non** si aggiornano piu' dalla CLI
(§9). Il comando pronto per la 0.4.0, con i controlli da fare prima, e' in `LISTING.md` §6; qui la
forma, con i numeri della 0.2.0 gia' lanciata:

```bash
. ~/ProgettiClaude/Pebble/tools/pebble-env.sh
cd ~/ProgettiClaude/Pebble/apps/galleria

pebble login --status
make -C test pagecheck                                # dizionari (build_i18n) + config page inlinata
make -C test                                          # test host + node + Python
pebble clean && pebble build                          # gate emery + flint, senza GALLERIA_DEFINES
unzip -p build/galleria.pbw appinfo.json              # atteso: versionLabel 0.2.0, companyName Rediro
wc -m store/release_notes_0.2.0.txt                   # 473 (con il newline finale), tutto ASCII

pebble publish --non-interactive --no-gif-all-platforms \
  --version 0.2.0 \
  --release-notes "$(cat store/release_notes_0.2.0.txt)"
# screenshot invariati: senza --screenshots non ne carica (allow_skip, publish.py:171 e :450-465)
# per SOSTITUIRE gli screenshot: aggiungere --screenshots ... --replace-screenshots (irreversibile da CLI, :1020-1023)
```

⚠️ **`--version` vale anche qui**, malgrado il testo dell'aiuto («*Override version used when creating a new app*»):
`desired_version` viene calcolato una volta sola — flag, poi `project.version` (cioe' `package.json`), poi la
versione del `.pbw` — e passato **anche** a `_upload_release` per un'app che esiste gia' (`publish.py:149-159`,
`:179`). Passarlo esplicito e' quindi la cintura di sicurezza se `package.json` non fosse ancora allineato; con
`package.json` allineato il risultato e' lo stesso. La riga stampata `Publish Version: …` (`:159`) lo conferma
**prima** dell'invio.

⚠️ **La descrizione non passa dalla CLI** (§9): nella 0.2.0 e' stata caricata a parte (05/09, §0), e per la
**0.4.0** c'e' il `PATCH` di §0.1, che con lo stesso comando rinomina l'app in «Galleria» e manda
`store/description.txt`. I due passi — release e `PATCH` — sono indipendenti ma si fanno **nello stesso giro**
(19/09/2026: nome e descrizione online, il `PATCH` di §0.1 e' stato eseguito la sera).

---

## 5. Icone e screenshot: regole del tool

**Screenshot [F]**

- Il nome del file **deve iniziare con il nome della piattaforma seguito da `_`**: il tool spezza il basename al primo
  underscore e usa la prima parte come piattaforma, costruendo il campo `screenshots_<piattaforma>`
  (`:369-375`, `:377-395`). Un file senza underscore → `ToolError: Could not infer platform from capture filename`.
  I nostri `emery_screenshot_1..5.png` / `flint_screenshot_1..3.png` sono gia' corretti (vedi `store/README.md`).
- Estensione `.gif` → trattato come GIF, tutto il resto → screenshot statico (`:457-458`). Il MIME viene indovinato
  dall'estensione (`.png` → `image/png`, verificato con `mimetypes` **[F]**).
- Il tool **non controlla ne' dimensioni ne' peso**: valida solo che il file esista (`:454-456`).
- Alla **creazione** di una nuova app almeno uno screenshot e' obbligatorio: senza, `ToolError: No screenshots were
  collected. Screenshot upload is required for publish.` (`:420-426`, `:459-464`).
- Nessun flag per il **banner**: dalla CLI non si carica (per una watchface e' comunque facoltativo, vedi §10).
- **Nota del 19/09/2026**: dalla CLI gli screenshot si caricano **solo dentro una release** (§9), ma dalla
  **dashboard** si caricano anche fuori da una release: dei **7 PNG in piu'** preparati la notte del 18/09/2026
  (`store/README.md`), **sei** (emery 2-5 e flint 2-3) li ha caricati **l'utente da li'**, fra il 18/09 e il
  19/09/2026; il **settimo**, `emery_screenshot_6.png` (foto di prova CC-BY-SA-4.0 da uno screenshot S8-stile),
  non e' **mai** stato caricato ed e' stato **tolto dal repo la sera del 19/09/2026**, su decisione dell'utente.
  Oggi `store/` ha **8 screenshot**, esattamente quelli online: **5 emery** (`emery_screenshot_1..5.png`) e
  **3 flint** (`flint_screenshot_1..3.png`). Lo store **ri-codifica tutti i PNG in modalita' palette**: gli emery
  (13-18 KB contro i 37-59 KB del repo) hanno pochi pixel diversi (differenza media 0,04-0,14 su 255), i flint
  (2,8-3,1 KB contro 4-5,5 KB) restano **pixel-identici**; nessuno e' byte-identico al file del repo.

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
- **Risposta sul campo (05/09/2026)**: i due flag **sono stati passati** nel comando di creazione
  (`LISTING.md` §6, blocco «storico») e il server **non ha risposto 400** — l'app e' stata creata —,
  ma per una watchface `icon_image`/`list_image` sono rimasti **vuoti** (preambolo e §0): le icone sono
  arrivate online solo con il `PATCH`. L'ipotesi **[I]** qui sopra non si e' verificata.

---

## 6. `--source`: cosa succede se lo si omette

**[F]** In modalita' non interattiva, `source` = `--source` **oppure**, se assente, l'URL del remote git ricavato con
`git config --get remote.origin.url` eseguito nella cartella corrente (`:817`, `:623-650`); il suffisso `.git` viene
tolto e le forme `git@host:path` / `ssh://git@…` sono convertite in `https://…`.

Qui il remote e' `https://github.com/Rediro-MC/galleria-da-polso.git` (comando eseguito **[F]**) → **omettere
`--source` NON significa «nessun sorgente»**: il listing riceverebbe comunque il link al repo.

**Decisione U4 (05/09/2026, sera): il repo viene reso pubblico** con licenza **MIT** (U1, `LICENSE` in radice) → si
passa l'URL **esplicito**, come nel comando di creazione (§4; testo intero in `LISTING.md` §6). Le altre due strade
restano documentate solo per memoria:

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
creazione (§4; testo intero in `LISTING.md` §6) resta identico (nessun flag di visibilita' esiste). ⚠️ Resta valido
l'avviso Rebble: «once made public, an app cannot then be made private».

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
   pubblicare** che il repo sia gia' pubblico su GitHub, altrimenti il link del listing da' 404 (fatto: pubblico dal 05/09/2026 sera, prima del `pebble publish`).
3. **U2 / nome autore [presa]**: `package.json` ha ora `"author": "Rediro"` → dopo `pebble clean && pebble build`
   il `.pbw` porta `companyName: Rediro` (da riverificare con `unzip -p build/galleria.pbw appinfo.json`); lo store
   mostra comunque il nome del developer collegato all'account, non questo campo **[I]**.
4. **Limiti reali** di nome/descrizione/note nello store Core: nessun controllo nel tool, quindi si scoprono solo
   provando (o dalla dashboard). Tenere la descrizione **≤ 1600 caratteri** per sicurezza.
5. **[chiuso 05/09/2026]** Icone per una watchface: il comando di creazione **ha passato**
   `--icon-small`/`--icon-large` e il server **non ha risposto 400** (l'app e' stata creata), ma per una
   watchface ha lasciato `icon_image`/`list_image` vuoti: le icone sono arrivate online con il `PATCH` di §0.
   Nessun piano B da tenere pronto (§5).
6. **[chiuso 14/09/2026]** `--is-published` inerte: `PIANO-SVILUPPO-PEBBLE.md` §12 e §13 dicono gia' che
   con il tool 5.0.40 il flag non fa niente e la release nasce **pubblica** (§8).
7. **Versione [decisa, D126 del 14/09/2026]**: si pubblica la **0.4.0** (`package.json` gia' a 0.4.0), non la 0.3.0,
   **mai lanciata**: ne resta solo il testo delle note in `LISTING.md` §3.1 (il file `store/release_notes_0.3.0.txt`
   e' uscito dal repo il 17/09/2026). Conferma finale dell'utente **dopo il gate sul telefono**
   (`docs/design/galleria-s13-ux4-gate-telefono.md`). **[chiuso 18/09/2026]**: la 0.4.0 e' uscita il 18/09/2026
   (in testa al file) senza aspettare il gate; il gate P01-P20 del runbook resta utile a release uscita (19/09/2026).

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

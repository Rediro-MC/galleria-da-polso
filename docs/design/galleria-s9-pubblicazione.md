# Galleria — S9-prep: preparazione alla pubblicazione (al banco)

> Sessione del **5 settembre 2026, sera**. Perimetro: tutto ciò che S9 (`PIANO.md` §4) richiede e che si può fare
> **senza l'orologio e senza decisioni dell'utente**; le decisioni restano elencate in §7 con una raccomandazione.
> La pubblicazione vera (`pebble publish`, tag `v1.0.0`, Rebble) avviene **solo dopo la conferma dell'utente**.

## 0. Cosa deve esserci alla fine

| # | Obiettivo | Misura di "fatto" |
|---|---|---|
| P1 | **Foto demo sostituite**: `resources/photos/demo_1.raw6/.raw1` e `demo_2.*` derivate da 2 foto **CC0** (Wikimedia Commons) | licenza verificata via API (`extmetadata.LicenseShortName == "CC0"`, `LicenseUrl` con `publicdomain/zero`); byte riproducibili con il comando annotato (URL originale, SHA-256 del file scaricato, `--crop`); `--stats` su emery: demo_1 → testo **BIANCO**, demo_2 → testo **NERO**, entrambe con alone automatico spento (`bad` < 15 %); nessuna persona riconoscibile, nessun logo/marchio, nessun testo leggibile; ritaglio quadrato 200×200 centrato (icona dello store) gradevole; `resources/photos/README.md` riscritto (provenienza, CRC, stats) |
| P2 | **Listing dello store pronto**: `store/LISTING.md` | nome, categoria, descrizione (testo unico: inglese + paragrafo italiano), release notes 1.0.0, crediti (font OFL, foto CC0), procedura «rimuovi e reinstalla», limite 12 foto, firmware minimo, nota «stile trasparente pensato per il Pebble Time 2»; ogni affermazione verificata sul codice/documenti; entro i limiti di lunghezza dello store |
| P3 | **Comando di pubblicazione pronto** | `store/LISTING.md` §"Comando" con la riga `pebble publish …` completa, i prerequisiti (`pebble login`, account developer), il significato di `--is-published`/unlisted, i passi Rebble; fonti: `publish.py` del pebble-tool 5.0.40 e documentazione developer.repebble.com |
| P4 | **Residui di `PIANO.md` §7 riletti** ("Da riguardare a fine progetto" + aperti S8-stile + rimedi S8-perf) | ogni voce con verdetto `fix_now` / `v1.1` / `document` / `drop`, motivazione e prove; i `fix_now` applicati con test e gate, gli altri annotati in §7 |
| P5 | **Config page: font consigliati per lo stile trasparente** (§7 S8-stile) | sotto il select «Stile cifre» una riga di aiuto, visibile solo con stile ≠ pieno: «Per lo stile trasparente rendono meglio Francois One e Staatliches (Anton in layout A tende a chiudersi).»; `make -C test pagecheck` e `test_page.js` verdi; pagina inlinata ≤ 65.536 B (oggi 63.735: margine 1.801) |
| P6 | **Gate** | `pebble clean && pebble build` verde su emery+flint (memoria in `PIANO.md` §5); screenshot con le demo nuove (`docs/design/galleria/s9_emery_a_anton_<scura>.png`, `s9_emery_a_anton_<chiara>.png`, `s9_flint_a_anton.png`, uno per il layout B); `store/make_assets.py` puntato agli screenshot S9 e rigenerato; `make -C test` verde |
| P7 | **Documenti** | `PIANO.md` §4 (S9-prep), §5, §6, §7, §8; `docs/CONTINUA-QUI.md`; `docs/design/galleria.md` (D12, §10); `README.md` (licenze, demo, bozza → LISTING); `store/README.md`; root `README.md`; `CLAUDE.md` dell'app se cambia un comando |

## 1. Foto demo (P1) — contratto

- **Sorgente**: Wikimedia Commons, solo file con licenza **CC0** (Creative Commons Zero 1.0). Verifica **obbligatoria** con
  `https://commons.wikimedia.org/w/api.php?action=query&titles=File:…&prop=imageinfo&iiprop=url|size|sha1|extmetadata&format=json`
  (User-Agent esplicito). Registrare per ogni candidata: titolo, URL della pagina `File:`, autore (`Artist` senza HTML),
  `LicenseShortName`, `LicenseUrl`, dimensioni, `sha1` dichiarato dall'API e SHA-256 del file scaricato.
- **Scarico**: usare la versione ridimensionata a **1600 px di larghezza** (`iiurlwidth=1600` → `thumburl`) se
  l'originale supera i 3 MB; altrimenti l'originale. I file sorgente stanno in `~/galleria-gate/s9/src/` (fuori dal repo:
  nel repo entrano **solo** i `.raw6`/`.raw1`).
- **Preparazione**: `python3 tools/photo_prep.py --out <dir> --name <nome> --stats --preview --preview-dir <dir>/prev
  [--crop X,Y,W,H] <file>` con **tutte le altre opzioni ai default** (dithering `fs`, gamma 1.0, lift 0, niente
  `--sunlight`: D6). Il `--crop` è ammesso per centrare il soggetto (il rapporto viene forzato a 200:228).
- **Criteri di scelta** (in ordine): (1) colore del testo previsto da `--stats` su emery: una foto **BIANCO** (scura in
  alto) e una **NERO** (chiara in alto), entrambe con `bad_white`/`bad_black` sotto il 15 % (alone spento); (2) nessuna
  persona riconoscibile, nessun marchio/logo/testo; (3) soggetto leggibile anche a 48×48 px nel ritaglio quadrato
  centrale (icona: `y` 14..214); (4) su flint (`raw1`, dithering FS) la foto deve restare comprensibile; (5) varietà:
  una naturale/paesaggio scura (notte, aurora, cielo stellato, tramonto) e una chiara (neve, spiaggia, cielo, nebbia).
- **Riproducibilità**: annotare il comando esatto; i byte devono essere identici a una seconda esecuzione (CRC32 zlib).
- **Non** usare le foto di prova di `~/galleria-gate/photos/` (sintetiche/di test) né i wallpaper di Ubuntu (CC-BY-SA).

## 2. Listing (P2) — contenuto obbligatorio

Fonti di verità: `apps/galleria/README.md` (funzioni, requisiti, «Licenze», bozza attuale), `src/c/settings.h`
(intervalli 5/15/30/60/180/1440 min, 6 font, 4 stili), `src/pkjs/config/page.html`/`page.js` (testi della pagina,
limite 12 foto, procedura «Rimuovi (non Aggiorna) → reinstalla»), `docs/design/galleria.md` §2 (D5 firmware ≥ 4.32
con SDK 4.33.1, D13, D19, D26), `PIANO.md` §6 (D27/D28), `resources/fonts/README.md` (OFL).

- Nome store **`Galleria for Pebble`**; watchface; piattaforme Pebble Time 2 (emery) e Pebble 2 Duo (flint).
- Descrizione: **un solo testo** (lo store non è localizzato): inglese per primo, poi un paragrafo italiano più breve.
  Deve dire: foto proprie a schermo intero dal telefono (config page: aggiungi, ritaglia, salva), rotazione a
  intervalli, scossa = prossima (non persistita), ora grande con 6 font e 4 stili (trasparente pensato per il PT2:
  su Pebble 2 Duo gli stili 3D valgono come i piatti), colore del testo automatico, layout A (ora + passi/batteria/
  data) e B (solo ora), 12/24 h e zero iniziale, **fino a 12 foto**, nessun secondo/animazione, funziona senza telefono,
  firmware **≥ 4.32**, **avvio lento dopo molte sostituzioni di foto → «rimuovi e reinstalla» (le foto restano sul
  telefono)**, iOS non ancora provato (dire solo che il caricamento è stato provato con l'app Android), open source
  (se l'utente conferma: licenza e URL), crediti font «Anton, Bebas Neue, Barlow Condensed, Francois One,
  Staatliches (SIL OFL 1.1)» e foto demo CC0 (autori, facoltativo ma gradito).
- Release notes 1.0.0 (3–5 righe). Tag git `v1.0.0` **solo dopo conferma**.
- Nessuna promessa non verificata sul campo (batteria, iPhone, Pebble 2 Duo reale: O7/O11 non fatti).

## 3. Residui da rileggere (P4) — elenco e schema del verdetto

Ogni voce riceve: `verdict` ∈ {`fix_now`, `v1.1`, `document`, `drop`}, `rationale`, `evidence` (file:riga, log di
campo `apps/galleria/run_s8_*.log`, numeri di `docs/design/galleria-s8-risultati.md`), `fix_sketch` (se fix),
`test_sketch`, `effort_min`, `risk`. `fix_now` solo se: cambia ≤ ~30 righe, ha un test host, non tocca il protocollo
sul filo (17 messageKeys, 119 B di outbox) e non aumenta lo statico di più di ~200 B.

| ID | Voce (da `PIANO.md` §7 salvo nota) | Classe |
|---|---|---|
| R01 | «Foto k/n» resta indietro di uno per ogni foto saltata senza `PHOTO_BEGIN` accettato; rimedi senza chiavi nuove | C/protocollo |
| R02 | `applyPayload`: foto nuova a due voci con quota su un solo formato → registrato solo il formato entrato; S6 manda **un formato per foto**: la voce è ancora raggiungibile? | JS |
| R03 | `sync_env_settings_changed` con impostazioni identiche → redraw completo; `prv_pump` con `outbox_begin` fallito scarta la coda; `app_message_open` fallita → sync muta senza segnale | C |
| R04 | `galleria_devserver.py --dump-json --album`: SIGTERM durante la conversione lascia cartella temporanea e figlio `photo_prep`; `--work DIR` lascia i raw | tool |
| R05 | Backoff condiviso: i retry `photo` proseguono dal gradino raggiunto dai retry `link`; rivalutare con i tempi reali (2,3–7 s/foto su file nuovo, fino a ~55 s/foto su file pieno) | JS |
| R06 | F9(5): `STORAGE_ERR` permanente per uno slot sul PT2 → lista di esclusione in RAM; cercare `STORAGE_ERR` nei log di campo | C |
| R07 | Anomalia del gate S5b: riavvio pulito spontaneo 39 s dopo il primo avvio post-wipe (1/13), mai riprodotto; cercare riavvii non spiegati nei log di campo | C/log |
| R08 | `time_ms()` con salti di ±1 s nei primi secondi dopo l'avvio del PKJS (pypkjs): i timing per chunk in quella finestra non valgono | doc/tool |
| R09 | Rischi residui hardware: app Core su `SEND_TIMEOUT` dell'HELLO (F5), larghezza finestra F2 con persist reale, natura di `STORAGE_ERR` (F9): cosa dicono i 15 log di campo? | C/protocollo |
| R10 | Layout B senza indicazione della sync in corso (D13 «B = solo cifre», feedback utente 30/08): con i tempi reali, indicatore minimo in B (contatore piccolo nella fascia MM, stessa logica di `s_show_sync`): costo statico/heap, v1.0 o v1.1? | C/design |
| R11 | Alone a freddo al 15 % esatto di conflitto (`>=` invece di `>` o `LUMA_HALO_PCT` più basso), feedback utente su c8a/c8b; O5 (20 foto vere) non fatto | C/luma |
| R12 | `test_index_retry.js` ~5 s; `--dump-page`/`test_devpage.js` dipendono da `python3` nel PATH | test |
| R13 | Flint e stile trasparente: anello 1 px al limite (D26); O11 non fatto: cosa scrivere nel listing e nella pagina | pagina/doc |
| R14 | Dev server accetta `digit_style` 2/3 per scenario flint (normalizzazione D26 nella pagina); `AMPM_W` 24/20 in `gen_digits.py` da misurare | tool |
| R15 | `docs/design/galleria.md` §10.5: `createImageBitmap` e orientamento EXIF nelle WebView (fallback tag 0x0112): com'è gestito in `pipeline.js`/`page.js`? (`red_exif6.jpg` di `~/galleria-gate/photos/` è la foto di prova) | JS |
| R17 | Rimedio S8-perf (a): avvio in due fasi (ora a video prima di manifest e foto) + foto letta a fette da 16 chunk; con i numeri di campo (avvio 0,31–0,36 s su file nuovo, 2,7 s su file gonfio; `photo:` 15–62 ms) tenere per v1.1 o archiviare? | C/design |
| R18 | Rimedio S8-perf (c): issue a monte a coredevices/PebbleOS (page cache all'apertura dei settings file; compattazione a soglia di spazio morto; **non** proporre la patch `pfs_seek`/`curr_page`): bozza dell'issue in `docs/design/galleria-s9-issue-pebbleos.md` e controllo se esiste già un'issue simile | upstream/doc |

## 4. Audit di rilascio (medio-alta)

Controllare, con prove: `package.json` (`version` 1.0.0, `author`, `displayName`, UUID, `capabilities`, `messageKeys`
= 17, risorse dichiarate tutte usate e viceversa); contenuto del `.pbw` (`unzip -l build/galleria.pbw`: `appinfo.json`
con versione/uuid/capabilities, binari emery e flint, `pebble-js-app.js`); igiene della build di produzione (nessun
`GALLERIA_DEBUG_*`/`GALLERIA_LOG_VERBOSE` attivo senza `GALLERIA_DEFINES`, `SCENARIO`/modalità dev nel PKJS attive
solo con `Pebble.platform === 'pypkjs'`, volume dei log in produzione ≤ una riga per evento, nessun `console.log` di
sviluppo nel bundle); risorse ≤ 256 KB; statico ≤ 40/45 KB; requisiti di `pebble publish` (icone 48/144, screenshot
con prefisso piattaforma, GIF: `ffmpeg` **assente** in questa VM → `--no-gif-all-platforms`).

## 5. Compiti per importanza (regola a 4 livelli)

- **alta → Fable (orchestratore)**: perimetro e questa spec; scelta finale delle 2 foto e comandi `photo_prep`;
  triage dei verdetti P4 e ogni modifica al C; gate P6; PIANO/CONTINUA-QUI/design.
- **medio-alta → Fable (subagenti)**: triage R01, R03, R06, R07, R09, R10, R11, R17 (C/protocollo/design); audit di
  rilascio §4; revisori dei diff C (se ci sono `fix_now`).
- **medio-bassa → Opus**: candidate CC0 (cercatore → scettico); ricerca `pebble publish`/portale; listing (scrittore →
  scettico → correttore); triage R02, R04, R05, R08, R12, R13, R14, R15, R18; aiuto «font consigliati» nella pagina
  (costruttore → scettico); test JS/Python.
- **bassa → Opus**: coerenza dei documenti a fine sessione.

## 6. Regole per gli agenti

- Nessun agente lancia l'emulatore (`pebble install/screenshot/emu-*`): risorsa esclusiva dell'orchestratore.
- Nessun agente fa `git commit`/`push`. Nessun agente scrive in `resources/photos/` né in `src/c/` (salvo compito
  esplicito). I documenti `PIANO.md`, `CONTINUA-QUI.md`, `README.md` li aggiorna l'orchestratore: gli agenti
  restituiscono le frasi proposte.
- Log e testi del PKJS solo ASCII (F-S8-2); la pagina è in italiano, ES5, senza backtick, senza risorse esterne.
- Ogni numero citato viene da un file o da un comando eseguito (indicare quale).

## 7. Decisioni per l'utente (raccolte qui, risposte in `PIANO.md` §6)

| # | Decisione | Raccomandazione |
|---|---|---|
| U1 | Licenza del codice (README: TBD) | **MIT** (come il pebble-tool; semplice per una watchface) |
| U2 | `author` in `package.json` («Marco») e nome autore nello store | nome e cognome, o lasciare «Marco» |
| U3 | Foto demo: le 2 CC0 scelte in questa sessione oppure 2 foto proprie | tenere le CC0 (nessun obbligo di attribuzione, riproducibili) |
| U4 | `--source`: il repo GitHub era **privato** | **deciso il 05/09 sera: pubblico** (MIT), dopo la scansione dei dati sensibili e la riscrittura della storia (autore «Rediro», seriale/IP/URL bonificati, screenshot personale rimosso) |
| U5 | D5: SDK 4.33.1 (fw ≥ 4.32) | **confermare** (campo: PT2 con fw 4.36.2) |
| U6 | Prima release **unlisted** → controllo del listing → public | sì (piano §13) |
| U7 | Tag git `v1.0.0` e commit di S9-prep | dopo la conferma |

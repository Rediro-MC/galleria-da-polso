# Galleria — listing per lo store (S9, P2)

> Preparato il **05/09/2026** (sessione S9-prep, spec `../../../docs/design/galleria-s9-pubblicazione.md` §2),
> corretto la sera stessa con i 7 rilievi dello scettico L2, i rilievi dell'audit di rilascio e la seconda
> revisione (L4: citazioni di §5 riallineate a `page.js` dopo P5/R13, `--name` non è obbligatorio, preambolo di §5).
> Ogni affermazione della descrizione ha una fonte in §5. La ricerca su `pebble publish` (tool 5.0.40) sta in
> `PUBLISH.md`, in questa stessa cartella; qui c'è il comando pronto, ormai **senza segnaposto**: le decisioni
> **U1–U9** sono state prese dall'utente il **05/09/2026, sera** e sono riportate in §7 — licenza **MIT**
> (`LICENSE` in radice del repo), autore **Rediro**, foto demo CC0 confermate, repo GitHub **reso pubblico** per
> `--source`, SDK 4.33.1 confermato, visibilità gestita sul portale, prima release **0.1.0 (beta)**.
> **Niente viene pubblicato senza la conferma dell'utente** (spec §7): il comando di §6 si lancia a mano.

## 1. Identità dell'app

| Campo | Valore | Fonte |
|---|---|---|
| Nome nello store | **Galleria for Pebble** (`--name`: **serve** per non chiamarla «Galleria», ed è efficace **solo alla creazione**) | spec S9 §2; il flag ha un default — senza, il nome sarebbe «Galleria», il `longName` del `.pbw` (`publish.py:806`, `:814`; `PUBLISH.md`, campo *name*) |
| Nome sull'orologio | **Galleria** (`displayName`) | `package.json` → `pebble.displayName` |
| Tipo | **watchface** (dedotto dal `.pbw`, non si dichiara) | `package.json` → `pebble.watchapp.watchface = true`; `PUBLISH.md`, campo *type* |
| Categoria | **nessuna**: per una watchface la CLI non chiede e non invia il campo | `PUBLISH.md`, campo *category* (`publish.py:777-779`, `848`) — sul portale Rebble la categoria è richiesta per le app, non per le watchface |
| Piattaforme | **Pebble Time 2** (`emery`, 200×228, 64 colori) e **Pebble 2 Duo** (`flint`, 144×168 B/N) | `package.json` → `targetPlatforms`; `docs/design/galleria.md` §1 e §3.3 |
| Versione | **0.1.0** — prima release pubblica, **beta** (decisione **U7**; tag git `v0.1.0-beta`, lo fa l'orchestratore) | `package.json` → `version` = `0.1.0` (05/09/2026, prima era 1.0.0) |
| UUID | `6f2dd646-a76a-44ff-8719-b012d04c79a4` (minuscolo, immutabile) | `package.json` → `pebble.uuid` |
| Autore | **Rediro** — decisione **U2** presa il 05/09/2026 (nickname GitHub) | `package.json` → `"author": "Rediro"` (finisce in `companyName` del `.pbw` alla prima ricompilazione); nello store resta probabile che compaia il nome dell'account developer (`PUBLISH.md`, *uncertainties*) |
| Sorgente (`--source`) | `https://github.com/Rediro-MC/galleria-da-polso` — decisione **U4**: il repo viene **reso pubblico** (codice MIT), quindi si passa l'URL esplicito | spec §7 U4; `publish.py:808`, `:817`; `PUBLISH.md`, campo *source* e §6 |
| Licenza del codice | **MIT** — decisione **U1** del 05/09/2026 | `LICENSE` in radice del repo («Copyright (c) 2026 Rediro»); citata nella descrizione (§2) e in §4 |
| Visibilità | **sempre pubblica dalla CLI**: `--is-published` è **inerte** nella 5.0.40 → decisione **U6**: la visibilità (unlisted o pubblica) si gestisce **sul portale developer**, non da qui | `publish.py:548` e `:845-846` (`isPublished`/`visible` costanti `"true"`); `PUBLISH.md` §8 |
| Banner | non serve (obbligatorio solo per le watchapp) | `PUBLISH.md`, *rebble_steps*; `store/README.md` |

## 2. Descrizione per lo store (testo unico, pronto da incollare)

> **Riscritta il 05/09/2026 sera su richiesta dell'utente («più concisa»)**: **789 caratteri** ASCII invece di 1.493 (`wc -m store/description.txt` = 790 con il newline finale). Il testo pubblicato alle 20:41 è ancora quello lungo: la descrizione **non si aggiorna dalla CLI** (`PUBLISH.md` §9), va incollata in dashboard (https://appstore-api.repebble.com/dashboard) — **da fare insieme alla release 0.2.0 multilingua**, che è ciò che fa cadere la riga «the settings page is in Italian».
>
> **S10 (0.2.0)**: la riga sui limiti dice ora «Photo upload tested on Android. **Settings page in English, Italian, German and French**.» ⚠️ L'ultima riga porta ancora «Beta 0.1.0»: prima di incollare in dashboard va allineata alla versione pubblicata.

Lo store **non è localizzato**: un solo testo in inglese (la riga italiana della prima stesura è
caduta con la riscrittura corta). **789 caratteri**, **tutto ASCII**, 5 capoversi: foto e rotazione,
ora e layout, limiti e piattaforme, procedura «rimuovi e reinstalla», crediti e licenza.

> Il tetto reale dello store Core **non è noto**: nel sorgente di `pebble publish` non c'è nessun controllo di
> lunghezza e le pagine `developer.repebble.com/guides/appstore-publishing/…` danno 404 (`PUBLISH.md`,
> campo *description* e *uncertainties*). L'unico numero pubblicato è **1.600 caratteri** nella documentazione
> **Rebble** ("preparing a submission"), quindi indicativo: per prudenza il testo sta **sotto i 1.500**.
> Anche gli accenti sono evitati (il multipart va in UTF-8, ma il comportamento del server non è provato).

```text
Your photos as the watchface. Pick and crop them on your phone: up to 12 rotate on the watch, and a shake skips to the next one.

Big bitmap clock: 6 fonts, 4 styles (solid, transparent, 3D), white or black text chosen from the photo. Two layouts: time with steps, battery and date, or time only. 12 h or 24 h.

Works offline: photos and settings stay on the watch. Pebble Time 2 and Pebble 2 Duo, PebbleOS 4.32 or newer. Photo upload tested on Android. Settings page in English, Italian, German and French.

Slow to start after many photo swaps? Remove Galleria and install it again: your photos come back from the phone.

Beta 0.2.0, open source (MIT): github.com/Rediro-MC/galleria-da-polso. Fonts: Anton, Bebas Neue, Barlow Condensed, Francois One, Staatliches (OFL). Demo photos: CC0.
```

Lo stesso testo è in **`store/description.txt`** (usato dal comando di §6: `--description "$(cat store/description.txt)"`).
Se il testo qui sopra cambia, va riscritto **anche** lì: `wc -m store/description.txt` per ricontrollare la lunghezza
(i due blocchi devono restare byte-identici).

### Righe applicate e righe scartate (decisioni del 05/09/2026)

| Riga | Esito | Conti |
|---|---|---|
| `Beta 0.1.0. Open source (MIT): github.com/Rediro-MC/galleria-da-polso` | **applicata** (U1 licenza MIT, U4 repo pubblico, U7 versione 0.1.0 beta) | +69 caratteri, +71 con la riga vuota che la separa; compensati accorciando la riga italiana da 116 a 45 (−71): totale invariato, **1.493** |
| `Demo photos: "Northern Lights at Lauklines Norway" by Sebastian Kowalski and "Bryce Canyon After Snow" by Emanuel Hahn (CC0, Wikimedia Commons).` al posto dell'ultima frase | **scartata** | porterebbe a **1.600** caratteri, cioè esattamente il limite dichiarato da Rebble e ben oltre il tetto prudenziale di 1.500 |
| `Demo photos by Sebastian Kowalski and Emanuel Hahn (CC0, Wikimedia Commons).` al posto dell'ultima frase | **scartata** | porterebbe a **1.532** caratteri, sopra il tetto prudenziale di 1.500 |

Le due foto demo sono **CC0**: l'attribuzione non è obbligatoria (§4), quindi le due righe scartate erano una
cortesia; i nomi degli autori restano in §4, in `README.md` §Licenze e in `resources/photos/README.md`.

Due punti del testo inglese restano leggibili in due modi e sono stati lasciati **come sono**, di proposito:
«every 5 minutes to once a day» (senza «from» sembra un elenco monco; l'intervallo è quello scelto dall'utente,
`src/c/settings.c:31-32`) e «a shake skips ahead until the watchface restarts» (l'avanzamento **dura** fino al
riavvio — D19, offset solo in RAM — e non «continua a saltare»). Le due correzioni («from every 5 minutes…»,
«a shake jumps to the next one, until…») costerebbero +5 e +11 caratteri: il testo salirebbe a **1.509**, sopra il
tetto prudenziale di 1.500 (resterebbe comunque sotto i 1.600 dichiarati da Rebble). Se l'utente le vuole, va
accorciata prima un'altra frase.

## 3. Release notes

Sono l'**unico campo testuale che si aggiorna a ogni release** dalla CLI (`PUBLISH.md`, campo
*releaseNotes*, `publish.py:547`): nome, descrizione e icone no (§9 di `PUBLISH.md`).

### 3.1 Release notes 0.2.0 (S10, multilingua) — da usare con la prossima release

**472 caratteri** (`wc -m store/release_notes_0.2.0.txt` = 473 con il newline finale), **6 righe**,
**tutto ASCII** (niente accenti: `e'`, `Francais`, `reglages`) e nessuna virgoletta doppia, così la
riga `--release-notes "$(cat …)"` resta innocua.

```text
Galleria 0.2.0 - the settings page now speaks four languages.
- English: the page follows your watch language, or you can pick one under Language.
- Italiano: la pagina delle impostazioni e' in italiano, come la data sull'orologio.
- Deutsch: die Einstellungsseite ist auf Deutsch, ebenso das Datum auf der Uhr.
- Francais: la page de reglages est en francais, comme la date sur la montre.
- While photos are loading, the watch shows a sync icon and k/n instead of a word.
```

Copia in **`store/release_notes_0.2.0.txt`** (i due blocchi devono restare byte-identici).
Lo store non è localizzato, quindi il testo resta un blocco unico: **una riga per lingua**, scritta
in quella lingua, dice a chi legge che la pagina delle impostazioni parla anche la sua (decisione
**D38** della spec S10). L'ultima riga copre l'altra novità visibile sull'orologio: durante il
caricamento non c'è più la parola «Foto», ma un'**icona di sincronizzazione** e `k/n`
(D32; `src/c/ui_time.c` `prv_draw_sync_icon`) — coerente con una pagina in quattro lingue.
La data dell'orologio segue la stessa impostazione: in «Automatica» resta quella del firmware
(*language pack*), altrimenti usa le abbreviazioni della lingua scelta (D34, `src/c/datefmt.c`).

### 3.2 Release notes 0.1.0 (beta) — pubblicate il 05/09/2026

**521 caratteri** (`wc -m store/release_notes_0.1.0.txt` = 522 con il newline finale), **5 righe**, ASCII.
Riscritte la sera del 05/09/2026 per la prima release **0.1.0 (beta)** (decisione **U7**; il file si chiamava
`release_notes_1.0.0.txt`).

```text
Galleria 0.1.0 (beta) - first public release.
- Your photos, full screen: up to 12 on the watch, automatic rotation, shake to skip.
- Big bitmap clock: six fonts, four digit styles, automatic white or black text, two layouts.
- Photos and settings are kept on the watch; the phone is only needed to load them, with a photo counter on the screen while they arrive.
- Beta: tested on a Pebble Time 2 (PebbleOS 4.36.2) with the Android Pebble app; the Pebble 2 Duo build is checked in the emulator only, and iOS is untested.
```

Copia in **`store/release_notes_0.1.0.txt`** (anche qui i due blocchi devono restare byte-identici).
Il «photo counter» è il contatore «Foto k/n» mostrato durante la sync: nel **layout A** sta nella riga info
(`src/c/ui_time.h:47-48`; `src/c/ui_time.c:968-970`) e con **U8/R10** (applicato il 05/09/2026 dall'orchestratore)
compare anche nel **layout B**; per questo il testo dice solo «on the screen», senza nominare la riga info.
Con **R01** (05/09) contano anche le foto che il telefono salta, quindi il contatore arriva a `n/n` invece di
fermarsi prima (`src/c/sync_proto.h:35`). Residuo noto e accettato: se è **l'ultima** foto a essere saltata, la
sync si chiude prima che il contatore mostri `n/n`.
La riga «Beta: …» dice esplicitamente che è una **beta** e ripete i limiti di prova (Android sì, iOS no,
Pebble 2 Duo solo in emulatore).

## 4. Crediti

Da tenere nella descrizione (ultima riga) e, per esteso, qui e nel `README.md` dell'app.

- **Cifre**: Anton, Bebas Neue, Barlow Condensed (Bold), Francois One, Staatliches — tutti **SIL Open Font
  License 1.1**; i TTF non entrano nel `.pbw`, sull'orologio ci sono solo le strip PNG generate
  (`resources/fonts/README.md`: inventario con versione e sha256, `OFL-*.txt` per ognuno).
- **Foto demo** (2, mostrate quando l'album è vuoto): **CC0 1.0 (Creative Commons Zero)** da **Wikimedia Commons**,
  nessun obbligo di attribuzione, credito dato per correttezza:
  - demo 1 (scura, testo bianco): **«Northern Lights at Lauklines Norway» — Sebastian Kowalski**
    (`https://commons.wikimedia.org/wiki/File:Northern_Lights_at_Lauklines_Norway.jpg`, opera propria, `{{self|cc-zero}}`)
  - demo 2 (chiara, testo nero): **«Bryce Canyon After Snow» — Emanuel Hahn**
    (`https://commons.wikimedia.org/wiki/File:Bryce_Canyon_After_Snow_(Unsplash).jpg`, template `{{Unsplash}}` = CC0,
    revisione della licenza su Commons conclusa il 2018-07-02)

  Sostituite nel repo il **05/09/2026** (P1): `resources/photos/demo_1.raw6` 34.200 B CRC32 `0x2B7BE24F`,
  `demo_1.raw1` 3.024 B `0xA35A8FE7`, `demo_2.raw6` 34.200 B `0xC91AE01B`, `demo_2.raw1` 3.024 B `0xA7EF19B1`
  (verificati con `zlib.crc32` sui file del repo; stessi valori di `~/galleria-gate/s9/facts_s9.md`).
  Provenienza completa (URL, SHA-256/SHA-1, `--stats`, comandi `photo_prep.py` riproducibili, criteri di scelta)
  in **`resources/photos/README.md`**, riscritto il 05/09 con la chiusura di P1.
- **Licenza del codice**: **MIT** — decisione **U1** presa dall'utente il 05/09/2026. Testo in **`LICENSE`** nella
  radice del repo («Copyright (c) 2026 Rediro»); il repo diventa **pubblico** (U4) e la descrizione lo dichiara
  («Open source (MIT): github.com/Rediro-MC/galleria-da-polso»). `README.md` §Licenze allineato.
- SDK e strumenti Pebble: PebbleOS Apache-2.0, pebble-tool MIT, SDK con EULA proprietaria
  (`../../PIANO-SVILUPPO-PEBBLE.md` §13) — non serve citarli nel listing.

## 5. Affermazione → fonte

Ogni riga è una cosa che il **listing** dichiara **oggi**: una frase della descrizione (§2), una riga delle release
notes (§3) oppure un campo dell'identità (§1 — sono di questo tipo solo le righe 1 e 30, che il testo non scrive).
Le righe con ⚠️ dipendono da un lavoro non ancora chiuso.
I numeri di riga della config page si spostano a **ogni** intervento sulla pagina (P5 e R13 l'hanno già fatto il
05/09): il riferimento stabile è l'identificatore indicato accanto (`photosCap`, `NO_3D`, `FIX_STEPS`, `FIX_TAIL`) —
ricontrollare i numeri con `grep -n` prima di pubblicare.
⚠️ **Dopo S10 (0.2.0) i testi non sono più in `page.html`/`page.js`**: quei file portano solo chiavi
(`data-i18n="lbl_layout"`, `T('opt_order_random')`), e le frasi italiane citate qui sotto si cercano in
**`apps/galleria/i18n/messages.json`** (`grep -n "Aggiungi foto" i18n/messages.json`). I riferimenti a `page.js:NN`
delle righe 4–24 valgono quindi per la **struttura** (quale elemento mostra cosa), non per il testo.

| # | Affermazione (descrizione / release notes / campo di §1) | Fonte |
|---|---|---|
| 1 | Watchface per Pebble Time 2 e Pebble 2 Duo | `package.json`: `watchapp.watchface = true`, `targetPlatforms ["emery","flint"]` |
| 2 | Pebble Time 2 a colori, Pebble 2 Duo in bianco e nero | `docs/design/galleria.md` §1 (emery 200×228, 64 colori) e §3.3 (flint 144×168, 1 bit) |
| 3 | Le foto si vedono a schermo intero dietro l'ora | `docs/design/galleria.md` §1; §3.1/§3.2 (wireframe) |
| 4 | Le foto si **scelgono, si ritagliano e si salvano** dal telefono, nella pagina delle impostazioni | `src/pkjs/config/page.html:26` («Aggiungi foto»), `:35`/`:45` (editor di ritaglio, «Aggiungi all'album»), `:84` (pulsante «Salva»); `README.md` §«Caricare le foto (config page)» |
| 5 | L'orologio ne tiene **fino a 12** | `src/pkjs/config/page_core.js:8` (`MAX_SLOTS = 12`); `src/pkjs/config/page.js:172` (`photosCap`: «al massimo 12 foto»); `docs/design/galleria.md` §2 D8 (12 slot in persist) |
| 6 | La foto cambia da sola, **da ogni 5 minuti a una volta al giorno** | `src/c/settings.c:31-32` (`prv_interval_valid`: 0, 5, 15, 30, 60, 180, 1440); etichette in `src/pkjs/config/page.js:50` («mai», 5 min … 1 giorno) |
| 7 | …in ordine o in modo casuale | `src/c/settings.h` (`enum GalOrder`: sequenziale/casuale); default sequenziale in `src/c/settings.c:25`; etichette in `page.js:51` |
| 8 | Una **scossa** passa alla foto successiva, **fino al riavvio della watchface** | `docs/design/galleria.md` §2 D10 rivista da D19 (tap service, offset **solo in RAM**, mai persistito: vale fino al riavvio); default `shake_next = 1` in `src/c/settings.c:26` |
| 9 | Ora disegnata con **cifre bitmap** | `docs/design/galleria.md` §2 D3 (sprite `2BitPalette` generati da TTF); `package.json` risorse `DIGITS_*` |
| 10 | **Sei font** | `src/c/settings.h` (`enum GalFont` … `GAL_FONT_COUNT = 6`: Anton, Bebas, Barlow, LECO, Francois One, Staatliches); etichette in `src/pkjs/config/page.js:43-44`; `resources/fonts/README.md` |
| 11 | **Quattro stili** di cifre: pieno, trasparente, due con ombra 3D | `src/c/settings.h` (`enum GalDigitStyle`); `docs/design/galleria.md` §2 D21; etichette in `src/pkjs/config/page.js:45-47` |
| 12 | Gli stili trasparente/3D **sono pensati per il Pebble Time 2** e **sul Pebble 2 Duo i due 3D valgono come i piatti** | `docs/design/galleria.md` §2 D26 (su flint niente ombra: 2 → 1, 3 → 0); `src/pkjs/config/page.js:60-70` (`NO_3D`: le due opzioni 3D sono **disabilitate** su flint, «(non su Pebble 2 Duo)»); `src/pkjs/config/page.html:54` (aiuto sui font per lo stile trasparente) e `:55` (`styleFlintHelp`, R13: l'avviso «contorno di 1 px» sta **solo nella pagina**, non nella descrizione); `PIANO.md` §7 (anello 1 px al limite su flint, O11 non fatto) |
| 13 | Il colore del testo (bianco o nero) lo sceglie l'orologio dalla foto | `docs/design/galleria.md` §2 D7 (luma sulla fascia, isteresi, contorno automatico); `src/c/luma.c` |
| 14 | Due layout: l'**ora** su un terzo di schermo con **passi, batteria e data**, oppure sull'intero schermo da sola | `docs/design/galleria.md` §3.1 e §3.2; §2 D13 (B = solo cifre in v1); `src/c/settings.h` (`GalLayout`, `GalInfoRowBits`); etichette in `src/pkjs/config/page.js:42` («Un terzo con riga info» / «Tutto schermo») |
| 15 | **12 o 24 ore**, con o senza **zero iniziale** | `src/c/settings.h:20-21` (`GalClockMode`, `GalLeadingZero`, valore AUTO = come l'orologio); default AUTO in `src/c/settings.c:20-21`; etichette in `src/pkjs/config/page.js:48-49` («auto», «12 h», «24 h»; «auto», «sì», «no») |
| 16 | Si aggiorna **una volta al minuto**, mai i secondi, nessuna animazione | `CLAUDE.md` dell'app («`MINUTE_UNIT` sempre; mai secondi; nessun timer continuo; animazioni: nessuna»); `docs/design/galleria.md` §1 |
| 17 | Funziona **senza telefono**: foto e impostazioni stanno sull'orologio | `docs/design/galleria.md` §1 e §4.2 (persist: manifest + 12 slot); `README.md` §Requisiti |
| 18 | **Due foto demo** incluse (album vuoto) | `docs/design/galleria.md` §2 D12; `package.json` risorse `DEMO_1_*`/`DEMO_2_*`; `resources/photos/` (4 file, §4) |
| 19 | Serve **PebbleOS 4.32 o più recente** | `docs/design/galleria.md` §2 D5 (SDK 4.33.1 → fw ≥ 4.32), **confermato dall'utente il 05/09/2026** (U5: si usa l'ultimo SDK, D5 chiusa); `README.md` §Requisiti |
| 20 | Il caricamento delle foto **è provato con l'app Pebble per Android** | `docs/design/galleria-s8-risultati.md:11` (app Pebble **1.11.0.3**, LAN dev connection) e §O2 (sync di foto vere sul campo) |
| 21 | **iOS non è provato** | `PIANO.md` §7 («iOS mai provato»: file input nella WebView, limite del close URL sconosciuto); `docs/design/galleria.md` §2 D1 |
| 22 | La **pagina delle impostazioni è in inglese, italiano, tedesco e francese** (0.2.0) | `apps/galleria/i18n/messages.json` (**121 chiavi × 4 lingue**, sorgente unica) → `tools/build_i18n.py` → `src/pkjs/i18n.js`; `src/pkjs/config/page.html` e `page.js` non contengono più testi ma **chiavi** (`data-i18n`, `T(…)`), sostituite con indici da `tools/build_config_page.py`; `docs/design/galleria-s10-i18n.md` D35/D36. Fino alla 0.1.0 la descrizione diceva «the settings page is in Italian» |
| 22b | La pagina **segue da sola la lingua dell'orologio**, e la si può scegliere a mano | `src/pkjs/index.js` `langAuto()` (D33: `getActiveWatchInfo().language` → `navigator.language` → `en`; log `[config] lang auto=…`); select «Lingua» prima riga di `#settings` (`s_lang`, D36); impostazione `lang` al **byte 13** del blob (`src/c/settings.h`, `src/pkjs/album.js:78`, D31) |
| 22c | Anche **la data sull'orologio** segue la lingua scelta | `src/c/datefmt.c` (tabelle identiche ai language pack, formati per lingua: en «Sat 5 Sep», it «Sab 5 Set», de «Sa, 5. Sep», fr «Sam 5 Sept.»; separatore delle migliaia en `,` it/de `.` fr spazio) chiamato da `src/c/ui_time.c`; con «Automatica» resta `strftime` del firmware (D34) |
| 23 | Se l'avvio diventa lento dopo molte sostituzioni di foto: **Rimuovi (non Aggiorna) e reinstalla** | `src/pkjs/config/page.js:532-533` (`FIX_STEPS`: «scegli Rimuovi (non Aggiorna)», «reinstalla Galleria»); `README.md` §«Galleria si avvia lentamente?»; `docs/design/galleria.md` §2 D27 |
| 24 | Le foto **restano sul telefono** e tornano da sole | `src/pkjs/config/page.js:534` (`FIX_TAIL`); `docs/design/galleria.md` §5.1 (album in `localStorage`, diff stateless a ogni HELLO) |
| 25 | Cifre: Anton, Bebas Neue, Barlow Condensed, Francois One, Staatliches, **SIL OFL 1.1** | `resources/fonts/README.md` (inventario con versione, dimensione e sha256; `OFL-*.txt` per ogni famiglia) |
| 26 | Foto demo **CC0 (Wikimedia Commons)** | `resources/photos/README.md` (licenza verificata con l'API di Commons e con il wikitext della pagina `File:`, provenienza, SHA, CRC32); §4 di questo file; le due CC0 sono nei `.raw` del repo dal 05/09 (CRC32 ricontrollati con `zlib.crc32`) |
| 27 | Release notes: provata su un **Pebble Time 2 con PebbleOS 4.36.2** | `docs/design/galleria-s8-risultati.md:10` (PT2, PebbleOS v4.36.2, board obelix) |
| 28 | Release notes: il build **Pebble 2 Duo** è controllato **solo in emulatore** e **iOS non è provato** | `PIANO.md` §7 (O11 non fatto: «da vedere sul Pebble 2 Duo vero»; «iOS mai provato»); `docs/design/galleria-s8-risultati.md` (ambiente del test: un solo orologio, PT2) |
| 29 | Release notes: durante il caricamento un **contatore delle foto** è visibile **sullo schermo** (0.2.0: **icona di sincronizzazione + «k/n»**, senza parole — D32, `src/c/ui_time.c` `prv_draw_sync_icon`, arco 40°–335° + punta su `GPath` statico) | `src/c/ui_time.h:47-48` («Foto index/count» al posto di passi/icona BT nel layout A); `src/c/ui_time.c:968-970` (`"Foto %u/%u"`), `:680-682` (**U8/R10**: lo stesso contatore nella fascia dinamica del **layout B**, `MODE_B_SPRITE`) e `:425` (ridisegno al cambio layout / fine Quick View); `src/c/sync_proto.h:35` (R01, 05/09: le foto saltate contano, il contatore arriva a `n/n`) |
| 30 | Nome dello store «Galleria for Pebble», versione **0.2.0** (prima release **0.1.0**) | spec S9 §2; `package.json` (`displayName` «Galleria»), decisione **U7** del 05/09/2026 per la 0.1.0 e **D38** della spec S10 per la 0.2.0; il nome **non si cambia più dalla CLI** (`PUBLISH.md` §9) |
| 31 | Descrizione e release notes: è una **beta 0.1.0** | `package.json` → `version` `0.1.0`; decisione **U7** (prima release pubblica in beta, tag `v0.1.0-beta`) |
| 32 | Descrizione: **open source, licenza MIT**, sorgente `github.com/Rediro-MC/galleria-da-polso` | `LICENSE` in radice del repo (MIT, «Copyright (c) 2026 Rediro»), decisione **U1**; repo reso **pubblico**, decisione **U4** (`git config --get remote.origin.url` → `https://github.com/Rediro-MC/galleria-da-polso.git`, `PUBLISH.md` §6) |

**Cose che il testo NON dice, di proposito** (spec §2, ultimo punto): nessuna promessa sui consumi di **batteria**
(obiettivo **O7** «Batteria 48 h» non misurato, `docs/design/galleria-s8-hardware.md:17` e `:172`; `PIANO.md` §4 S8),
nessuna promessa su **iPhone** (il testo dice solo che non è provato), nessuna promessa su un **Pebble 2 Duo reale**
(O11), nessun numero di durata della sincronizzazione (i tempi per foto variano da ~2,3–7 s su file nuovo a ~55 s su
file pieno, `docs/design/galleria-s9-pubblicazione.md` §3 R05). L'indicatore di sync del **layout B** (U8/R10) è
invece **nella build della 0.1.0** (`src/c/ui_time.c:680-682`), quindi la riga «photo counter» delle release notes
vale per **entrambi** i layout: per questo dice «on the screen» e non «in the info row».

## 6. Comando di pubblicazione

Ricerca completa (sorgente di `pebble publish` 5.0.40, riga per riga) in **`PUBLISH.md`**. Qui la riga pronta.

### Prima (obbligatorio)

```bash
. ~/ProgettiClaude/Pebble/tools/pebble-env.sh
cd ~/ProgettiClaude/Pebble/apps/galleria
python3 ../../tools/build_config_page.py --check     # config page inlinata aggiornata
make -C test                                         # test host + node + Python
pebble clean && pebble build                         # gate: emery + flint verdi, senza GALLERIA_DEFINES
unzip -p build/galleria.pbw appinfo.json             # atteso: versionLabel = la versione da pubblicare, companyName Rediro (appinfo.json e' generato)
python3 store/make_assets.py --check                 # icone e screenshot rigenerati con le demo NUOVE
wc -m store/description.txt store/release_notes_0.2.0.txt   # 790 e 473 (con il newline finale)
pebble login --status                                # account: sulla VM non risulta collegato (nessun firebase_oauth_storage.json)
```

`pebble login` apre un callback su `http://localhost:60000/`; in VM senza browser: `pebble login --no-open-browser`
(stampa l'URL). L'account developer sullo store non va creato a mano: al primo `publish` il tool chiama
`/api/v1/developer/create` se serve. (`PUBLISH.md`, *prerequisites*.)

### Comando

**App già pubblicata**: la riga qui sotto è quella della **prima** pubblicazione (05/09/2026,
`cdf80cc3bf6745b1a310e4c8`). Per la **0.2.0** e per ogni release successiva serve solo la variante
«nuova release» — `--version` e `--release-notes`, niente nome/descrizione/icone, che dalla CLI non
si aggiornano più (`PUBLISH.md` §4 e §9):

```bash
pebble publish --non-interactive --no-gif-all-platforms \
  --version 0.2.0 \
  --release-notes "$(cat store/release_notes_0.2.0.txt)"
```

```bash
# storico: comando della PRIMA pubblicazione (0.1.0, 05/09/2026)
pebble publish --non-interactive --no-gif-all-platforms \
  --name "Galleria for Pebble" \
  --version 0.1.0 \
  --description "$(cat store/description.txt)" \
  --release-notes "$(cat store/release_notes_0.1.0.txt)" \
  --source "https://github.com/Rediro-MC/galleria-da-polso" \
  --icon-small store/icon_80.png \
  --icon-large store/icon_144.png \
  --screenshots store/emery_screenshot_1.png store/flint_screenshot_1.png
```

Decisioni **prese dall'utente il 05/09/2026 (sera)** e già scritte nel comando qui sopra:

| Voce | Decisione presa | Dov'è applicata |
|---|---|---|
| `--source` | **U4**: il repo GitHub viene **reso pubblico** → si passa l'URL esplicito `https://github.com/Rediro-MC/galleria-da-polso` | riga `--source` del comando. ⚠️ **Omettere il flag non lascia il campo vuoto**: il tool ci mette da solo il remote git (`publish.py:808`, `:817`; `PUBLISH.md` §6) — passarlo esplicito è comunque la scelta giusta |
| licenza citata nella descrizione | **U1: MIT** | `LICENSE` in radice del repo; ultima riga di `store/description.txt` («Beta 0.1.0. Open source (MIT): github.com/Rediro-MC/galleria-da-polso»), totale 1.493 caratteri (§2) |
| nome autore | **U2: Rediro** | `package.json` → `"author": "Rediro"` (non si passa dalla CLI). Serve `pebble clean && pebble build` prima di pubblicare, perché `appinfo.json` è generato e porta `companyName` nel `.pbw` |
| crediti demo | **U3: le due foto CC0 restano** | nessun cambiamento al testo: la descrizione dice «Demo photos: CC0 (Wikimedia Commons)», gli autori stanno in §4 (le righe lunghe sforerebbero il tetto, §2) |
| firmware minimo nel testo | **U5: SDK 4.33.1 confermato** (si usa l'ultimo SDK, D5 chiusa) | «PebbleOS 4.32 or newer» nella descrizione resta valido; `docs/design/galleria.md` §2 D5 |
| versione | **U7: 0.1.0 (beta)** | `--version 0.1.0`, `package.json` → `version`, release notes `store/release_notes_0.1.0.txt`; il tag git `v0.1.0-beta` lo fa **l'orchestratore** (nessun agente fa commit/tag) |
| visibilità | **U6: si gestisce sul portale** | nessun flag: **dalla CLI la release nasce pubblica** (`--is-published` è **ignorato** dalla 5.0.40: `isPublished: "true"` e, alla creazione, `visible: "true"`; non esistono `--unlisted/--private/--draft`). Unlisted o pubblica si decide sul portale developer (`https://dev-portal.rebble.io/`, «Publish Privately») prima o subito dopo il publish (`publish.py:548`, `:845-846`; `PUBLISH.md` §8) |
| indicatore di sync in layout B | **U8: applicato nella 0.1.0** (R10) | `src/c/ui_time.c:680-682`; le release notes dicono «a photo counter on the screen» perché ora vale per entrambi i layout (§3) |
| issue su PebbleOS | **U9: rimandata** | non tocca il listing (`docs/design/galleria-s9-issue-pebbleos.md` resta una bozza) |
| categoria | — | **non passare `--category`**: per una watchface la CLI non lo invia (`publish.py:777-779`, `848`) |

Da sapere prima di premere invio (tutto da `PUBLISH.md`):

- il comando **ricompila da solo** (`pebble build` interno, debug off) e **nasconde l'output**: i numeri di memoria
  non si vedono → fare il gate prima, con ambiente pulito e **senza** `GALLERIA_DEFINES`;
- carica `build/galleria.pbw` (il nome viene dalla cartella del progetto);
- `--name` vale **solo alla creazione dell'app**: dalla 1.0.1 in poi nome, descrizione, icone e sorgente non si
  aggiornano più dalla CLI (`PUBLISH.md` §9);
- `--is-published` **non fa niente**: non esiste un modo CLI per una prima release riservata (riga «visibilità» qui
  sopra);
- `ffmpeg` **non c'è** in questa VM: senza `--no-gif-all-platforms` il tool proverebbe a girare gli emulatori per
  la GIF e fallirebbe (`which ffmpeg` → nessun risultato; `screenshot.py:154-160`);
- i nomi degli screenshot **devono** cominciare con la piattaforma + `_` (i due file attuali vanno bene);
- **trappola**: se il server risponde 400 citando «screenshot», il tool ricarica **senza** immagini stampando solo
  un avviso giallo → controllare la riga finale `Uploaded screenshots: 2`;
- `--icon-small` vuole **80×80** secondo il prompt del tool 5.0.40 (`publish.py:759-760`) → `store/icon_80.png`
  (`store/README.md` §«Taglia delle icone» lo conferma; `icon_48.png` è la taglia del **vecchio** portale Rebble e
  resta buona per il listing, le anteprime e la procedura Rebble);
- percorso alternativo, se si preferisce il portale Rebble: `https://dev-portal.rebble.io/` (lì la categoria
  esiste, e c'è «Publish Privately»); attenzione, la doc Rebble avverte che *«once made public, an app cannot
  then be made private»*.

## 7. Decisioni U1–U9 (prese il 05/09/2026, sera) e punti ancora aperti

> **Esito: pubblicata il 05/09/2026 alle 20:41 (0.1.0); release 0.2.0 multilingua la sera stessa; descrizione corta (§2) e icone 80/144 caricate via API alle 23:27 (`PUBLISH.md` §0)** — app `cdf80cc3bf6745b1a310e4c8`, https://apps.rePebble.com/cdf80cc3bf6745b1a310e4c8 (dettagli in `PUBLISH.md`, in testa). Da qui in poi la CLI aggiorna solo versione, note e `.pbw` (§6, variante «nuova release»); nome, descrizione, icone e sorgente si cambiano in dashboard.


| # | Decisione | Risposta dell'utente | Applicata in |
|---|---|---|---|
| U1 | Licenza del codice | **MIT** | `LICENSE` in radice («Copyright (c) 2026 Rediro»); `README.md` §Licenze; ultima riga della descrizione (§2) |
| U2 | Nome dell'autore | **Rediro** (nickname GitHub) | `package.json` → `"author"`; §1 |
| U3 | Foto demo | **le due CC0 restano** | `resources/photos/` (§4); descrizione invariata su questo punto |
| U4 | `--source` | **repo GitHub reso pubblico** → `--source "https://github.com/Rediro-MC/galleria-da-polso"` | §1, §6; descrizione («Open source (MIT): …») |
| U5 | D5 / SDK | **SDK 4.33.1 confermato** (si usa l'ultimo SDK) | `docs/design/galleria.md` §2 D5; riga 19 di §5 (fw ≥ 4.32) |
| U6 | Visibilità della prima release | **si gestisce sul portale developer** (dalla CLI nasce pubblica) | §1, §6, `PUBLISH.md` §8 |
| U7 | Versione della prima release | **0.1.0 (beta)**, tag git `v0.1.0-beta` (lo fa l'orchestratore) | `package.json` → `version`; `store/release_notes_0.1.0.txt`; §1, §3, §6 |
| U8 | Indicatore di sync in layout B (R10) | **sì, nella 0.1.0** | `src/c/ui_time.c:680-682`; §3 e riga 29 di §5 |
| U9 | Issue su PebbleOS (avvio lento) | **rimandata** | nessun effetto sul listing; bozza in `docs/design/galleria-s9-issue-pebbleos.md` |

Restano aperte solo cose **non decidibili da qui**:

1. **Limiti reali dei campi dello store Core**: ignoti (nessun controllo nel tool, doc 404). La descrizione sta a
   **1.493 caratteri**, sotto il tetto prudenziale di 1.500 e ben sotto i 1.600 dichiarati dalla documentazione Rebble.
2. **Accenti**: la descrizione è tutta ASCII per prudenza (il campo va in multipart UTF-8, ma non è provato lato
   server). Se si vuole l'italiano con gli accenti, provarlo su una release successiva, non sulla prima.
3. **Icone per una watchface**: accettate dal server? (`PUBLISH.md` §5) — piano B: rilanciare senza `--icon-*`.
4. **Asset dello store**: rigenerati il 05/09 alle 17:18 dagli screenshot del gate S9-prep
   (`store/make_assets.py` righe 33-34 puntano a `docs/design/galleria/s9_emery_a_anton_scura.png` e
   `s9_flint_a_anton_chiara.png`, `--check` verde); se il gate finale rifà gli screenshot (per esempio dopo U8),
   rilanciare `python3 store/make_assets.py` e ricontrollare con `--check`.
5. **`package.json` cambiato** (`author`, `version`): serve `pebble clean && pebble build` prima di pubblicare,
   perché `appinfo.json` (e quindi `companyName`/`versionLabel` nel `.pbw`) è generato.

---

*Stato degli altri documenti (controllato il 05/09, dopo le correzioni di questa revisione):*

- `README.md` dell'app: §Licenze riscritta il 05/09 (sera) con **MIT**, autore **Rediro** e versione **0.1.0 beta**;
  §«Pubblicazione nello store (S9)» rimanda a `store/LISTING.md`/`store/PUBLISH.md` e cita le decisioni prese —
  **allineato**.
- `store/README.md`: §«Taglia delle icone» e §«Argomenti di `pebble publish`» citano già `icon_80.png` e rimandano a
  `LISTING.md` §6 / `PUBLISH.md` — **allineato**.
- `resources/photos/README.md`: riscritto con le due CC0 (provenienza, SHA, CRC32, `--stats`) — **allineato**.
- `../../PIANO-SVILUPPO-PEBBLE.md` §13 (riga 515) e §12 (riga 37 della tabella): dicono ancora «senza
  `--is-published` la release resta bozza» — **da correggere** (con la 5.0.40 il flag è inerte e la release nasce
  pubblica); è fuori dai file di questo compito, vedi `PUBLISH.md` §11 punto 6.

*Frase proposta per `PIANO.md` §4/§8 (l'orchestratore decide se metterla):* «Listing pronto in `store/LISTING.md`
(descrizione 1.493 caratteri in `store/description.txt` con la riga «Beta 0.1.0. Open source (MIT): …», release notes
521 in `store/release_notes_0.1.0.txt`, crediti CC0/OFL, comando `pebble publish` **senza segnaposto**); decisioni
U1–U9 prese il 05/09 (MIT, autore Rediro, foto CC0, repo pubblico, SDK 4.33.1, visibilità dal portale, versione
0.1.0 beta, indicatore di sync in B, issue PebbleOS rimandata): resta il gate e il `pebble login`.»

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
> **Rivisto il 14/09/2026 (sessione UX-4, decisioni D126/D131)**: lo store è ancora fermo alla **0.2.0**
> «Galleria for Pebble» e la **0.3.0 non è mai uscita**, quindi tutto il lavoro di S11/S12/UX-1/UX-2/UX-3 esce
> con **una sola release 0.4.0** — nuova §3.0 con le release notes 0.4.0, §2 con «Beta 0.4.0» e la variante
> «con anteprima» come alternativa, §5 ricontrollata **riga per riga** sui sorgenti di oggi, §6 e §7 riscritte
> su quello che resta da lanciare (lo fa l'utente, dopo il gate sul telefono).
>
> **Stato al 19/09/2026**: la **0.4.0 è pubblicata** dal **18/09/2026** e il titolo nello store è **«Galleria»**
> (rinominato **dall'utente dalla dashboard**, non con il `PATCH` di `PUBLISH.md` §0.1; verificato sull'API pubblica
> il 19/09/2026). La **mattina** del 19/09 la descrizione online era ancora quella della 0.2.0 — il testo del
> 05/09 senza il prefisso «Beta 0.2.0, », **777 caratteri** —, il `PATCH` di `PUBLISH.md` §0.1 restava da
> lanciare per la sola descrizione e in `store/` c'erano 9 screenshot (6 emery + 3 flint, `make_assets.py`
> esteso la notte del 18/09), 5 emery + 3 flint online.
>
> **Sera del 19/09/2026**: il `PATCH` di `PUBLISH.md` §0.1 è stato **eseguito** (descrizione online = §2, **794
> caratteri**; titolo «Galleria»); `emery_screenshot_6.png` (foto **CC-BY-SA-4.0**, mai online) è stato
> **tolto** su decisione dell'utente: **8 screenshot in `store/`** (5 emery + 3 flint), **tutti online**.

## 1. Identità dell'app

| Campo | Valore | Fonte |
|---|---|---|
| Nome nello store | **Galleria** dalla **0.4.0** (decisione **D42** di S11, 06/09/2026: si rinomina con il `PATCH` di `PUBLISH.md` §0/§0.1, `--form-string "title=Galleria"`). **Online «Galleria»** (verificato sull'API pubblica il 19/09/2026: rinominata **dall'utente dalla dashboard** fra il 18/09 e il 19/09, non con il `PATCH`, che è stato **eseguito la sera del 19/09/2026** per la **descrizione**, `PUBLISH.md` §0.1). Il nome era stato messo da `--name` alla creazione | spec S9 §2 e `galleria-s11-lingue-es-pt.md` D42; `--name` è efficace **solo alla creazione** (`publish.py:806`, `:814`; `PUBLISH.md`, campo *name* e §9), quindi il nome si cambia solo via API/dashboard (`PUBLISH.md` §0) |
| Nome sull'orologio | **Galleria** (`displayName`) | `package.json` → `pebble.displayName` |
| Tipo | **watchface** (dedotto dal `.pbw`, non si dichiara) | `package.json` → `pebble.watchapp.watchface = true`; `PUBLISH.md`, campo *type* |
| Categoria | **nessuna**: per una watchface la CLI non chiede e non invia il campo | `PUBLISH.md`, campo *category* (`publish.py:777-779`, `848`) — sul portale Rebble la categoria è richiesta per le app, non per le watchface |
| Piattaforme | **Pebble Time 2** (`emery`, 200×228, 64 colori) e **Pebble 2 Duo** (`flint`, 144×168 B/N) | `package.json` → `targetPlatforms`; `docs/design/galleria.md` §1 e §3.3 |
| Versione | **0.4.0** — **pubblicata il 18/09/2026** — beta: spagnolo e portoghese (S11) **più** la pagina delle impostazioni rifatta (S12 anteprima, UX-1/UX-2/UX-3). Già pubblicate: **0.1.0** (prima release, beta, decisione **U7**, tag `v0.1.0-beta`) e **0.2.0** (multilingua en/it/de/fr, tag `v0.2.0`), entrambe il 05/09/2026. La **0.3.0 non è mai stata pubblicata** (D126 di UX-4): ne resta solo il testo delle release notes in §3.1 — il file `store/release_notes_0.3.0.txt` è uscito dal repo il 17/09/2026 e il `.pbw` storico non è più in `build_s8/` | `package.json` → `version` = `0.4.0` (14/09/2026; 0.3.0 solo nel repo dal 06/09, 0.1.0 il 05/09, prima era 1.0.0) |
| UUID | `6f2dd646-a76a-44ff-8719-b012d04c79a4` (minuscolo, immutabile) | `package.json` → `pebble.uuid` |
| Autore | **Rediro** — decisione **U2** presa il 05/09/2026 (nickname GitHub) | `package.json` → `"author": "Rediro"` (finisce in `companyName` del `.pbw` alla prima ricompilazione); nello store resta probabile che compaia il nome dell'account developer (`PUBLISH.md`, *uncertainties*) |
| Sorgente (`--source`) | `https://github.com/Rediro-MC/galleria-da-polso` — decisione **U4**: il repo viene **reso pubblico** (codice MIT), quindi si passa l'URL esplicito | spec §7 U4; `publish.py:808`, `:817`; `PUBLISH.md`, campo *source* e §6 |
| Licenza del codice | **MIT** — decisione **U1** del 05/09/2026 | `LICENSE` in radice del repo («Copyright (c) 2026 Rediro»); citata nella descrizione (§2) e in §4 |
| Visibilità | **sempre pubblica dalla CLI**: `--is-published` è **inerte** nella 5.0.40 → decisione **U6**: la visibilità (unlisted o pubblica) si gestisce **sul portale developer**, non da qui | `publish.py:548` e `:845-846` (`isPublished`/`visible` costanti `"true"`); `PUBLISH.md` §8 |
| Banner | non serve (obbligatorio solo per le watchapp) | `PUBLISH.md`, *rebble_steps*; `store/README.md` |

## 2. Descrizione per lo store (testo unico, pronto da incollare)

> **Riscritta il 06/09/2026** (allora per la 0.3.0, che non è mai uscita; per D126 il testo era destinato alla **0.4.0**, uscita il 18/09/2026 **senza** questo testo, mandato poi la **sera del 19/09/2026**, vedi sotto): **794 caratteri** ASCII (`wc -m store/description.txt` = 795 con il newline finale), sotto il tetto di **800** chiesto dall'utente. Rispetto alla stesura corta del 05/09 (789 caratteri, online dalle 23:27 di quel giorno, `PUBLISH.md` §0; al 19/09/2026, prima del `PATCH`, online c'era quel testo senza il prefisso «Beta 0.2.0, »: **777 caratteri**) cambiano quattro cose, tutte volute: (1) «**Designed for Pebble Time 2 (colour display); also runs on Pebble 2 Duo**» nel primo capoverso al posto della riga piatta «Pebble Time 2 and Pebble 2 Duo» del terzo; (2) «Photo upload tested on Android **and iPhone**» (prova del 06/09, `galleria-s8-risultati.md` §S8b); (3) «Settings page in English, Italian, German, French, **Spanish and Portuguese**»; (4) «**Beta 0.4.0**» (era «Beta 0.3.0» fino al 14/09: D126, unica modifica di UX-4 al testo — *variante minima*, `diff` con la sola riga 9 cambiata). Per far posto: «Pick and crop them on your phone» → «Crop them on the phone», «a shake skips to the next one» → «shake for the next one», «4 styles (solid, transparent, 3D)» → «4 digit styles», «PebbleOS 4.32 or newer» → «PebbleOS 4.32+», «Remove Galleria and install it again» → «Remove and reinstall Galleria».
>
> ⚠️ La descrizione **non si aggiorna dalla CLI** (`PUBLISH.md` §9): si manda con il `PATCH` multipart di `PUBLISH.md` §0 — **lo stesso comando che porta `title=Galleria`** (D42; il nome è già online, verificato sull'API il 19/09/2026, §1) — oppure si incolla in dashboard (https://appstore-api.repebble.com/dashboard). La release **0.4.0** è uscita il **18/09/2026** e **dal 19/09/2026 sera** online c'è il testo di §2 (**794 caratteri**, `PATCH` di `PUBLISH.md` §0.1 **eseguito**); fino a quel momento c'era quella della 0.2.0, 777 caratteri (nota di testa del documento e blockquote qui sopra).

Lo store **non è localizzato**: un solo testo in inglese (la riga italiana della prima stesura è
caduta con la riscrittura corta). **794 caratteri**, **tutto ASCII**, 5 capoversi: foto e rotazione
(con le piattaforme), ora e layout, limiti e lingue, procedura «rimuovi e reinstalla», crediti e
licenza.

> Il tetto reale dello store Core **non è noto**: nel sorgente di `pebble publish` non c'è nessun controllo di
> lunghezza e le pagine `developer.repebble.com/guides/appstore-publishing/…` danno 404 (`PUBLISH.md`,
> campo *description* e *uncertainties*). L'unico numero pubblicato è **1.600 caratteri** nella documentazione
> **Rebble** ("preparing a submission"), quindi indicativo. Il tetto che conta oggi è quello chiesto
> dall'utente per la **0.4.0**: **800 caratteri** (il testo ne usa 794, margine 6). Anche gli accenti sono evitati
> (il multipart va in UTF-8, ma il comportamento del server non è provato).

```text
Your photos as the watchface. Designed for Pebble Time 2 (colour display); also runs on Pebble 2 Duo. Crop them on the phone: up to 12 rotate on the watch, shake for the next one.

Big bitmap clock: 6 fonts, 4 digit styles, white or black text from the photo. Two layouts: time with steps, battery and date, or time only. 12 h or 24 h.

Works offline: photos and settings stay on the watch. PebbleOS 4.32+. Photo upload tested on Android and iPhone. Settings page in English, Italian, German, French, Spanish and Portuguese.

Slow to start after many photo swaps? Remove and reinstall Galleria: photos come back from the phone.

Beta 0.4.0, open source (MIT): github.com/Rediro-MC/galleria-da-polso. Fonts: Anton, Bebas Neue, Barlow Condensed, Francois One, Staatliches (OFL). Demo photos: CC0.
```

Lo stesso testo è in **`store/description.txt`** (usato dal `PATCH` di `PUBLISH.md` §0:
`--form-string "description=$(cat store/description.txt)"`; alla prima pubblicazione era il
`--description` del comando di §6). Se il testo qui sopra cambia, va riscritto **anche** lì:
`wc -m store/description.txt` per ricontrollare la lunghezza (i due blocchi devono restare
byte-identici; tetto chiesto dall'utente per la **0.4.0**: **800 caratteri**).
Verificato il **14/09/2026**: il blocco qui sopra e `store/description.txt` sono byte-identici
(`python3 -c "len(open('store/description.txt').read())"` → **795** con il newline finale, **794**
senza; tutto ASCII, nessuna virgoletta doppia).

### Alternativa per l'utente: la variante «con anteprima» (798 caratteri)

> **Non scelta** (D126: con la 0.4.0 è andata in rete la *variante minima* qui sopra — **mandata la sera del
> 19/09/2026**, §2 —, cioè il testo del 06/09 con il solo «Beta 0.3.0» → «Beta 0.4.0»). Resta qui perché è
> l'unica alternativa preparata e l'utente può sceglierla senza rifare il lavoro: basta incollarla in
> `store/description.txt` e nel blocco di §2, e aggiungere a §5 la riga di fonte indicata sotto.

La novità più visibile della 0.4.0 — l'**anteprima della watchface dentro la pagina** — nel testo minimo
non è nominata. Questa variante la dice con una frase, «*The settings page previews it on your photo.*»
(+45 caratteri), e paga sei tagli piccoli per restare sotto gli 800:

```text
Your photos as the watchface. Designed for Pebble Time 2 (colour); also runs on Pebble 2 Duo. Crop them on the phone: up to 12 rotate on the watch, shake for the next.

Big bitmap clock: 6 fonts, 4 digit styles, white or black text from the photo. Two layouts: time with steps, battery and date, or time only. The settings page previews it on your photo.

Works offline: photos and settings stay on the watch. PebbleOS 4.32+. Upload tested on Android and iPhone. Settings page in English, Italian, German, French, Spanish, Portuguese.

Slow to start after many swaps? Remove and reinstall Galleria: photos come back from the phone.

Beta 0.4.0, open source (MIT): github.com/Rediro-MC/galleria-da-polso. Fonts: Anton, Bebas Neue, Barlow Condensed, Francois One, Staatliches (OFL). Demo photos: CC0.
```

**798 caratteri** senza il newline finale (799 con), ASCII, nessuna virgoletta doppia, 5 capoversi
(misurato il 14/09/2026 con `python3` sul testo qui sopra). Margine sul tetto di 800: **2 caratteri**.

| Taglio | Da | A | Costo | Effetto su §5 |
|---|---|---|---|---|
| «12 h or 24 h.» | presente | tolto | −14 | la **riga 15** resta senza fonte nel testo pubblicato: va marcata «non più dichiarata» |
| «(colour display)» | display | «(colour)» | −8 | riga 2 invariata nella sostanza |
| «shake for the next one» | one | «for the next» | −4 | riga 8 invariata |
| «Photo upload tested…» | Photo upload | «Upload tested…» | −6 | righe 20/21 invariate |
| «after many photo swaps?» | photo swaps | «swaps?» | −6 | riga 23 invariata |
| «Spanish **and** Portuguese» | and | virgola | −4 | riga 22 invariata |
| **frase nuova** | — | «The settings page previews it on your photo.» | **+45** | **riga nuova**: fonte `src/pkjs/config/preview.js` (modulo dell'anteprima), `src/pkjs/config/page.html:69-74` (`#wfPrev`, canvas `#wfPreview`, didascalia) e `page.js` `renderPreview()` — D43–D48 di S12, **D105** di UX-3 (motore unico, canvas scelto dallo stato; D92 per i 200/144 px CSS) |

Se l'utente la vuole, la strada più pulita **non** è limare ancora: è togliere un capoverso intero (per
esempio i crediti dei font, che stanno già in `THIRD-PARTY-NOTICES.md` e in §4 di questo file) e
scrivere la frase per esteso, invece di vivere con 2 caratteri di margine.

### Righe applicate e righe scartate (decisioni del 05/09/2026)

> **Storico, in due righe.** Nella prima stesura lunga (**1.493 caratteri**, 05/09/2026) è entrata la
> riga «Beta 0.1.0. Open source (MIT): github.com/Rediro-MC/galleria-da-polso» (U1, U4, U7), pagata
> accorciando la riga italiana di altrettanti caratteri; sono state **scartate** le due righe di
> attribuzione delle foto demo (avrebbero portato il testo a 1.532 e a 1.600 caratteri), perché le
> foto sono **CC0** e l'attribuzione non è obbligatoria — gli autori stanno in §4, in `README.md`
> §Licenze e in `resources/photos/README.md`. Quel testo non esiste più: in vigore è quello corto di
> §2 (**794 caratteri**, 0.4.0), quindi i conti su 1.500/1.600 caratteri sono solo storia.

## 3. Release notes

Sono l'**unico campo testuale che si aggiorna a ogni release** dalla CLI (`PUBLISH.md`, campo
*releaseNotes*, `publish.py:547`): nome, descrizione e icone no (§9 di `PUBLISH.md`).

> **Regola dal 18/09/2026 (richiesta dell'utente): le release notes dello store si scrivono SOLO IN INGLESE.**
> Niente più righe per lingua come nella 0.4.0 (§3.0) e nella 0.2.0 (§3.2): quelle restano come storia.
> Restano valide le regole di forma: ASCII puro, nessuna virgoletta doppia, poche righe (5–6 finora),
> `wc -m` annotato.

### 3.0 Release notes 0.4.0 (S11 + S12 + UX-1/UX-2/UX-3) — **pubblicate con la 0.4.0 il 18/09/2026**

**696 caratteri** (`wc -m store/release_notes_0.4.0.txt` = 697 con il newline finale), **6 righe**,
**tutto ASCII** (niente accenti: «Espanol», «Portugues», «pagina», «apercu», «heisst», «piu'») e
nessuna virgoletta doppia, così la riga `--release-notes "$(cat …)"` resta innocua.

```text
Galleria 0.4.0 - simpler settings page, a preview with your photo and the time, Spanish and Portuguese; now called Galleria.
- Italiano: pagina piu' semplice, anteprima con la tua foto e l'ora, spagnolo e portoghese; ora si chiama Galleria.
- Deutsch: einfachere Seite, Vorschau mit deinem Foto und der Uhrzeit, Spanisch und Portugiesisch; heisst jetzt Galleria.
- Francais: page plus simple, apercu avec votre photo et l'heure, espagnol et portugais ; nouveau nom : Galleria.
- Espanol: pagina mas simple, vista previa con tu foto y la hora, espanol y portugues; ya se llama Galleria.
- Portugues: pagina mais simples, previa com sua foto e a hora, espanhol e portugues; agora se chama Galleria.
```

Copia in **`store/release_notes_0.4.0.txt`** (i due blocchi devono restare byte-identici; verificato
il 14/09/2026 con `diff`).

**Perché così.** Una riga per lingua come nella 0.2.0 e nella 0.3.0 (**D38**), sei righe perché le
lingue sono sei, la prima fa da titolo e porta l'inglese. Ogni riga dice **le stesse tre cose**, nello
stesso ordine, e nessun'altra: (1) la **pagina delle impostazioni è più semplice** (è il lavoro di
UX-1/UX-2/UX-3: «Aggiungi foto» in cima, «Altre impostazioni» ripiegate, ✕ a due tocchi); (2) c'è
un'**anteprima con la tua foto e l'ora** (S12, D43–D48); (3) ci sono **spagnolo e portoghese** (S11,
D39–D41) e l'app **si chiama Galleria** (D42: il nome è online dal rinomino fatto dall'utente in
dashboard fra il 18/09 e il 19/09/2026, non dal `PATCH`, lanciato poi la sera del 19/09 per la
descrizione — §1). Le novità che l'utente **non vede** (statico invariato, tripwire, test) non
entrano nelle note.

Il testo è la **variante A** («naturale») delle tre preparate dalla ricognizione di UX-4, scelta da
**D126** perché in tutte e sei le lingue si legge come una frase e non come un telegramma. Le altre due
(«col pulsante», che nomina «Aggiungi foto» in ogni lingua, e «nome prima») stanno in
`~/galleria-gate/ux/ux4/rapporti/R1c.md` §4, entrambe a 698 caratteri.

**Un ritocco al francese** (revisione di UX-4, unico scostamento dalla variante A, che D126 prendeva
verbatim): la riga fr diceva «; s'appelle Galleria.» ed era **l'unica delle sei** a non dire che il
nome è **nuovo** (en «now called», it «ora si chiama», de «heisst jetzt», es «ya se llama», pt «agora
se chama»; anche le note 0.3.0 di §3.1 dicevano «s'appelle **maintenant** Galleria»), quindi la terza
delle «stesse tre cose» mancava. «; **nouveau nom : Galleria.**» costa **4 caratteri** (riga fr 109 →
**113**, totale 692 → **696**: restano dentro i limiti di D126, riga ≤ 120 e totale ≤ 700) e usa lo
spazio prima dei due punti come il resto della riga. La forma verbale piena «s'appelle maintenant»
costava +11 e avrebbe portato il totale a 703, sopra il tetto.

**Il ritocco previsto da D126 non si applica**, ed è un conto, non un'opinione: D126 ammetteva di dire
«pagina delle impostazioni» invece di «pagina» *dove la riga resta ≤ 120 caratteri e il totale ≤ 700*.
Il totale è **696** (692 della variante A più i 4 del ritocco al francese qui sopra), quindi il budget
è di **4 caratteri**; la sostituzione più corta possibile costa
**11** (es «pagina de ajustes»), le altre da 12 a 19 (de «Einstellungsseite» +12, fr «page de reglages»
+12, pt «pagina de configuracoes» +17, it «pagina delle impostazioni» +19). Nessuna riga soddisfa
**entrambe** le condizioni: la sola es resterebbe sotto i 120 (108 → 119), ma porterebbe il totale a
**707**, e le altre sfondano tutt'e due i limiti. La
**prima riga**, che è quella che si legge nello store sopra le altre, dice comunque già «simpler
**settings page**». Le righe 1 e 3 (124 e 121 caratteri) superano i 120: il tetto per riga vale come
condizione del ritocco, non come vincolo del testo scelto, che D126 prende verbatim (salvo i 4
caratteri del francese qui sopra).

**Portoghese**: la riga dice «agora se chama Galleria» (registro brasiliano neutro, come il dizionario:
`i18n/README.md`), non il «a app chama-se» delle note 0.3.0, che erano PT-PT.
La stessa riga usa però «previa» e non il «pre-visualizacao» del dizionario (`sec_preview` pt =
«Pré-visualização»; `i18n/README.md` §«Regole», «Un concetto, una parola per lingua») **solo per il budget**:
la forma piena costa **+10** caratteri sul margine di **4** contato qui sopra. Non è una svista: se un
giorno il tetto si alza, la riga pt va riportata al termine del dizionario.

### 3.1 Release notes 0.3.0 (S11, spagnolo e portoghese) — **scritte per la 0.3.0, mai pubblicate: il testo resta solo qui**

> **Storia.** La 0.3.0 **non è mai stata pubblicata**: lo store è passato dalla 0.2.0 (05/09/2026)
> alla **0.4.0**, e le novità di queste note — spagnolo, portoghese e nome «Galleria» — arrivano agli
> utenti con le note di §3.0. Il file `store/release_notes_0.3.0.txt` è stato **tolto dal repo il
> 17/09/2026** (release mai pubblicata, file mai committato): il blocco qui sotto è l'**unico record**
> del testo. Non si passa a `--release-notes` (D126).

**620 caratteri** (621 B con il newline finale, misurati sul file quando era ancora nel repo), **6 righe**,
**tutto ASCII** (niente accenti: «Espanol», «Portugues», «pagina», «definicoes», «relogio», «heisst»)
e nessuna virgoletta doppia, così la riga `--release-notes "$(cat …)"` resta innocua.

```text
Galleria 0.3.0 - Spanish and Portuguese, on the settings page and on the watch; the app is now called Galleria.
- Italiano: la pagina e la data parlano anche spagnolo e portoghese; l'app ora si chiama Galleria.
- Deutsch: Seite und Datum sprechen jetzt auch Spanisch und Portugiesisch; die App heisst jetzt Galleria.
- Francais: la page et la date parlent aussi espagnol et portugais; l'app s'appelle maintenant Galleria.
- Espanol: la pagina de ajustes y la fecha del reloj ya hablan espanol; la app se llama Galleria.
- Portugues: a pagina de definicoes e a data do relogio ja falam portugues; a app chama-se Galleria.
```

Il file `store/release_notes_0.3.0.txt` non esiste più: il blocco qui sopra è il testo per intero.
Una riga per lingua come nella 0.2.0 (**D38**), ma ora sono **sei**: la prima riga fa da titolo e
porta l'inglese. Ogni riga dice le due sole novità visibili: la pagina delle impostazioni **e la
data dell'orologio** parlano anche spagnolo e portoghese (D39–D41: `es` = 5 e `pt` = 6 in
`enum GalLang`, abbreviazioni dei language pack `es_ES`/`pt_PT` in `src/c/datefmt.c` — «sá 5 sep» e
«Sáb 5 de Set» — e separatore delle migliaia `.` in entrambe, D41), e il **nome nello store diventa
«Galleria»** (D42: lo cambia il `PATCH` di `PUBLISH.md` §0, non le release notes).
Registro portoghese **PT-PT** («a pagina de definicoes», «a app chama-se»), diverso dalla base
brasiliana neutra del dizionario (`i18n/README.md`): le note di §3.0 lo hanno corretto.

### 3.2 Release notes 0.2.0 (S10, multilingua) — pubblicate il 05/09/2026

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

### 3.3 Release notes 0.1.0 (beta) — pubblicate il 05/09/2026

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
(oggi `src/c/ui_time.h:51-57` e `src/c/ui_time.c:798-802`; nella build 0.1.0 la scritta era davvero «Foto k/n», da S10/D32 è icona + «k/n») e con **U8/R10** (applicato il 05/09/2026 dall'orchestratore)
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
  (`../../../PIANO-SVILUPPO-PEBBLE.md` §13) — non serve citarli nel listing.

## 5. Affermazione → fonte

Ogni riga è una cosa che il **listing** dichiara **oggi**: una frase della descrizione (§2), una riga delle release
notes (§3) oppure un campo dell'identità (§1 — sono di questo tipo solo le righe 1 e 30, che il testo non scrive).
Le righe con ⚠️ dipendono da un lavoro non ancora chiuso.
I numeri di riga della config page si spostano a **ogni** intervento sulla pagina (P5 e R13 l'hanno fatto il 05/09,
UX-1/UX-2/UX-3 li hanno spostati tutti): il riferimento stabile è l'**identificatore** indicato accanto —
oggi `photosCap` (`page.html:30`, scritto da `page.js:414`), `UNAVAIL` + `applyUnavailable()` (`page.js:201`, `:203`;
era `NO_3D` fino a UX-2/D86), `footerLabels()` (`page.js:554`) e le chiavi `fix_step_1`…`fix_step_4` / `fix_tail`
(erano `FIX_STEPS`/`FIX_TAIL`, identificatori che **non esistono più**: `grep -rn "FIX_STEPS\|FIX_TAIL\|NO_3D" src/pkjs/ test/`
non trova nulla) — **ricontrollare i numeri con `grep -n` prima di pubblicare**. Tutti i riferimenti di questa
tabella sono stati ricontrollati riga per riga il **14/09/2026** (UX-4).
⚠️ **Dopo S10 (0.2.0) i testi non sono più in `page.html`/`page.js`**: quei file portano solo chiavi
(`data-i18n="lbl_layout"`, `T('opt_order_random')`), e le frasi italiane citate qui sotto si cercano in
**`apps/galleria/i18n/messages.json`** (`grep -n "Aggiungi foto" i18n/messages.json`). I riferimenti a `page.js:NN`
delle righe 4–24 valgono quindi per la **struttura** (quale elemento mostra cosa), non per il testo. Da UX-3
questo vale anche per i **due pulsanti del footer**: `page.html:106-107` (`#save`, `#cancel`) sono vuoti e
**senza `data-i18n`**, perché le etichette cambiano con lo stato della pagina e le scrive `footerLabels()`
(`page.js:554-567`: «Usa questa foto / Non aggiungere» con l'editor aperto, «Salva / Esci senza salvare»
altrimenti).

| # | Affermazione (descrizione / release notes / campo di §1) | Fonte |
|---|---|---|
| 1 | Watchface per Pebble Time 2 e Pebble 2 Duo | `package.json`: `watchapp.watchface = true`, `targetPlatforms ["emery","flint"]` |
| 2 | Pebble Time 2 a colori, Pebble 2 Duo in bianco e nero | `docs/design/galleria.md` §1 (emery 200×228, 64 colori) e §3.3 (flint 144×168, 1 bit) |
| 3 | Le foto si vedono a schermo intero dietro l'ora | `docs/design/galleria.md` §1; §3.1/§3.2 (wireframe) |
| 4 | Le foto si **scelgono, si ritagliano e si salvano** dal telefono, nella pagina delle impostazioni | `src/pkjs/config/page.html:26-27` (`#file` + etichetta `#add`, chiave `add_photo` «Aggiungi foto», **in cima alla pagina** da UX-2/D80), `:39-57` (editor `#editor`: cornice `#crop` a `:42`, canvas dell'anteprima `#preview` a `:45`), `:106` (`#save`). ⚠️ **«Aggiungi all'album» non esiste più** (UX-3/**D107**, che porta la conferma del ritaglio nel footer): la conferma del ritaglio è `btn_add_ok` = «**Usa questa foto**», scritta **nel footer** da `footerLabels()` (`page.js:558`), mentre la vecchia coppia `#addRow` (`page.html:47`) resta `display:none` con i listener intatti (**D119**); «Salva» è `btn_save` (`page.js:562`). `README.md` §«Come si usa» |
| 5 | L'orologio ne tiene **fino a 12** | `src/pkjs/config/page_core.js:8` (`MAX_SLOTS = 12`); `src/pkjs/config/page.js:414` (`photosCap`: chiavi `photos_cap` «{0} di {1} foto» e `photos_cap_empty`); `docs/design/galleria.md` §2 D8 (12 slot in persist) |
| 6 | La foto cambia da sola, **da ogni 5 minuti a una volta al giorno** — ⚠️ **non più dichiarata**: la descrizione corta in vigore (§2) non contiene questa frase, che era della stesura lunga del 05/09. La riga resta perché la funzione c'è | `src/c/settings.c:31-32` (`prv_interval_valid`: 0, 5, 15, 30, 60, 180, 1440); etichette in `src/pkjs/config/page.js:135-137` (`o.interval_min`; testi dalle chiavi `opt_never`/`opt_minutes`/`opt_hours`/`opt_one_day` di `i18n/messages.json`: «mai», «ogni 5 min» … «ogni giorno (alle 4:00)») |
| 7 | …in ordine o in modo casuale — ⚠️ **non più dichiarata** nel testo pubblicato (come la riga 6) | `src/c/settings.h:24` (`enum GalOrder`: sequenziale/casuale); default sequenziale in `src/c/settings.c:25`; etichette in `src/pkjs/config/page.js:138` (`o.order`, chiavi `opt_order_seq` «come l'elenco» / `opt_order_random` «a caso») |
| 8 | Una **scossa** passa alla foto successiva, **fino al riavvio della watchface** | `docs/design/galleria.md` §2 D10 rivista da D19 (tap service, offset **solo in RAM**, mai persistito: vale fino al riavvio); default `shake_next = 1` in `src/c/settings.c:26` |
| 9 | Ora disegnata con **cifre bitmap** | `docs/design/galleria.md` §2 D3 (sprite `2BitPalette` generati da TTF); `package.json` risorse `DIGITS_*` |
| 10 | **Sei font** | `src/c/settings.h:15-16` (`enum GalFont` … `GAL_FONT_COUNT = 6`: Anton, Bebas, Barlow, LECO, Francois One, Staatliches); etichette in `src/pkjs/config/page.js:126-127` (`o.font`; da UX-2/D87 la riga ha anche le frecce `#fontPrev`/`#fontNext`, `page.html:64`); `resources/fonts/README.md`. ⚠️ uno dei sei, `GAL_FONT_LECO` = «Font di sistema (solo Ora in alto)» (chiave `opt_font_leco`), **non è una strip bitmap** (`src/c/settings.h:53-58`: `gal_font_strip()` ritorna −1 per LECO) ed è disponibile **solo in layout A** (`settings.h:13`; `page.js:215` disabilita l'option in «Ora grande»): il testo inglese lo conta dentro «Big bitmap clock» (scelta consapevole, il conteggio resta quello dell'enum) |
| 11 | **Quattro stili** di cifre: pieno, solo contorno, due con ombra 3D | `src/c/settings.h:19` (`enum GalDigitStyle`); `docs/design/galleria.md` §2 D21; etichette in `src/pkjs/config/page.js:128-130` (`o.digit_style`): da UX-1 sono «**pieno**», «**solo contorno**», «**contorno con ombra**», «**pieno con ombra**» (la parola «trasparente» è uscita dalla pagina; nel C l'enum resta `GAL_STYLE_OUTLINE`/`GAL_STYLE_OUTLINE_3D`) |
| 12 | Gli stili con contorno/ombra **sono pensati per il Pebble Time 2** e **sul Pebble 2 Duo i due 3D valgono come i piatti** | `docs/design/galleria.md` §2 D26 (su flint niente ombra: 2 → 1, 3 → 0); `src/pkjs/config/page.js:201-211` (`UNAVAIL` + `applyUnavailable()`, che sostituisce `NO_3D` da UX-2/D86) e `:220-221` (le due chiamate): su flint le due option 3D — e i due colori giallo/blu — sono `disabled` **e `hidden`**, con il testo `opt_style_no_flint` = «**{0} (non sul Duo)**»; `src/pkjs/config/page.html:66` (`#s_style_hint`, chiave `style_hint` «Con questo stile si leggono meglio Francois One e Staatliches.», mostrato da `page.js:230` **solo con stile 1 o 2 e font ≤ 2**, cioè Anton/Bebas/Barlow — D98) e `page.html:67` (`#styleFlintHelp`, chiave `style_flint_help`, mostrato da `page.js:233` solo su flint con lo stile 1: R13, l'avviso «contorno sottile» sta **solo nella pagina**, non nella descrizione); `PIANO.md` §7 (anello 1 px al limite su flint, O11 non fatto) |
| 13 | Il colore del testo (bianco o nero) lo sceglie l'orologio dalla foto | `docs/design/galleria.md` §2 D7 (luma sulla fascia, isteresi, contorno automatico); `src/c/luma.c` |
| 14 | Due layout: l'**ora** su un terzo di schermo con **passi, batteria e data**, oppure sull'intero schermo da sola | `docs/design/galleria.md` §3.1 e §3.2; §2 D13 (B = solo cifre in v1); `src/c/settings.h` (`GalLayout`, `GalInfoRowBits`); etichette in `src/pkjs/config/page.js:125` (`o.layout`: da UX-1 «**Ora in alto, info sotto**» / «**Ora grande, senza info**») |
| 15 | **12 o 24 ore**, con o senza **zero iniziale** | `src/c/settings.h:20-21` (`GalClockMode`, `GalLeadingZero`, valore AUTO = come l'orologio); default AUTO in `src/c/settings.c:20-21`; etichette in `src/pkjs/config/page.js:133-134` (`o.clock_mode`/`o.leading_zero`: da UX-2 — voce **U-11** di `docs/design/galleria-s13-ux-casual.md` §4, chiavi `opt_clock_auto`/`opt_leading_zero_auto` — «**come l'orologio**», «12 h», «24 h» e «**sì con 24 h, no con 12 h**», «sì (09:05)», «no (9:05)»); le due voci stanno sotto «Altre impostazioni» (`page.html:77-80`, **UX-2/D88**) |
| 16 | Si aggiorna **una volta al minuto**, mai i secondi, nessuna animazione — ⚠️ **non dichiarata**: nessun testo online lo dice (residuo della stesura lunga del 05/09); resta vera come vincolo di progetto | `CLAUDE.md` dell'app («`MINUTE_UNIT` sempre; mai secondi; nessun timer continuo; animazioni: nessuna»); `docs/design/galleria.md` §1 |
| 17 | Funziona **senza telefono**: foto e impostazioni stanno sull'orologio | `docs/design/galleria.md` §1 e §4.2 (persist: manifest + 12 slot); `README.md` §Requisiti |
| 18 | **Due foto demo** incluse (finché non arriva la prima foto dell'utente) — ⚠️ il testo online dice solo «**Demo photos: CC0.**», non quante sono; il numero lo dice la pagina (`photos_cap_empty`: «l'orologio mostra 2 foto di esempio») | `docs/design/galleria.md` §2 D12; `package.json` risorse `DEMO_1_*`/`DEMO_2_*`; `resources/photos/` (4 file, §4) |
| 19 | Serve **PebbleOS 4.32 o più recente** | `docs/design/galleria.md` §2 D5 (SDK 4.33.1 → fw ≥ 4.32), **confermato dall'utente il 05/09/2026** (U5: si usa l'ultimo SDK, D5 chiusa); `README.md` §Requisiti |
| 20 | Il caricamento delle foto **è provato su Android e su iPhone** | Android: `docs/design/galleria-s8-risultati.md` §«Ambiente del test» (app Pebble **1.11.0.3**, LAN dev connection) e §O2 (sync di foto vere sul campo). iPhone: stessa pagina, **§S8b** (06/09/2026, Galleria 0.2.0 dallo store su PT2 fw 4.36.2: pagina `data:` aperta **4 volte su 4** in WKWebView — **128.250**, **133.569** ×2 e **138.249** caratteri, quest'ultima in `apps/galleria/run_ios_04.log:4` —, 2 foto scelte dalla libreria, ritorno `pebblejs://close` applicato, una foto sincronizzata in 3,5 s) |
| 21 | Su iPhone **restano da provare** il salvataggio vicino al tetto dei 200 KB (4 foto), le **12 foto** e l'app in secondo piano: per questo la descrizione dice solo «tested», senza promesse | `docs/design/galleria-s8-risultati.md` §S8b («Da fare al prossimo incontro iOS»: test 6–8 non fatti, l'utente ha interrotto); `PIANO.md` §7; `docs/design/galleria.md` §2 D1. Sono le prove del **gate sul telefono** di UX-4, pensato prima della 0.4.0 e non fatto (la release è uscita senza, §7; resta utile a release uscita): runbook `docs/design/galleria-s13-ux4-gate-telefono.md` (D128) |
| 22 | La **pagina delle impostazioni è in inglese, italiano, tedesco, francese, spagnolo e portoghese** (0.4.0) | `apps/galleria/i18n/messages.json` (**135 chiavi × 6 lingue** il 14/09/2026 — `python3 -c "import json; len(json.load(open('i18n/messages.json')))"` → 135, file **39.834 B** → `src/pkjs/i18n.js` **36.500 B** —, sorgente unica, ordine it, en, de, fr, es, pt) → `tools/build_i18n.py` → `src/pkjs/i18n.js`; `src/pkjs/config/page.html` e `page.js` non contengono più testi ma **chiavi** (`data-i18n`, `T(…)`), sostituite con indici da `tools/build_config_page.py`; `docs/design/galleria-s10-i18n.md` D35/D36 e `galleria-s11-lingue-es-pt.md` **D39/D42** (registro es «tú», pt «você»). Fino alla 0.1.0 la descrizione diceva «the settings page is in Italian», la 0.2.0 «English, Italian, German and French» |
| 22b | La pagina **segue da sola la lingua dell'orologio**, e la si può scegliere a mano | `src/pkjs/index.js` `langAuto()` (D33: `getActiveWatchInfo().language` → `navigator.language` → `en`; log `[config] lang auto=…`); select «**Lingua (pagina e data)**» (`s_lang`, chiave `lbl_lang`) = **ultima riga visibile** della pagina, dentro `#misc` (`src/pkjs/config/page.html:76`), dopo l'Anteprima (`#wfPrev`, `:69-74`) e prima di «Altre impostazioni» (`#advBtn`, `:77`) — **UX-2/D49**; era la prima riga di `#settings` fino a UX-1 (D36). Impostazione `lang` al **byte 13** del blob (`src/c/settings.h:47`, `src/pkjs/album.js:78`, D31) |
| 22c | Anche **la data sull'orologio** segue la lingua scelta | `src/c/datefmt.c` (tabelle identiche ai language pack, formati per lingua: en «Sat 5 Sep», it «Sab 5 Set», de «Sa, 5. Sep», fr «Sam 5 Sept.», **es «sá 5 sep», pt «Sáb 5 de Set»**; separatore delle migliaia en `,` it/de/**es/pt** `.` fr spazio — S11 **D40/D41**) chiamato da `src/c/ui_time.c`; con «Automatica» resta `strftime` del firmware (D34) |
| 23 | Se l'avvio diventa lento dopo molte sostituzioni di foto: **Rimuovi (non Aggiorna) e reinstalla** | `src/pkjs/config/page.js:1055` (i quattro passi, chiavi `fix_step_1`…`fix_step_4` di `i18n/messages.json`: «apri l'app Pebble sul telefono», «tocca Galleria nell'elenco delle app», «rimuovi Galleria dall'orologio (non aggiornarla)», «reinstalla Galleria»); `README.md` §«Galleria si avvia lentamente?»; `docs/design/galleria.md` §2 D27 |
| 24 | Le foto **restano sul telefono** e tornano da sole | `src/pkjs/config/page.js:1061` (`T('fix_tail')`, chiave `fix_tail` di `i18n/messages.json`); `docs/design/galleria.md` §5.1 (album in `localStorage`, diff stateless a ogni HELLO) |
| 25 | Cifre: Anton, Bebas Neue, Barlow Condensed, Francois One, Staatliches, **SIL OFL 1.1** | `resources/fonts/README.md` (inventario con versione, dimensione e sha256; `OFL-*.txt` per ogni famiglia) |
| 26 | Foto demo **CC0 (Wikimedia Commons)** | `resources/photos/README.md` (licenza verificata con l'API di Commons e con il wikitext della pagina `File:`, provenienza, SHA, CRC32); §4 di questo file; le due CC0 sono nei `.raw` del repo dal 05/09 (CRC32 ricontrollati con `zlib.crc32`) |
| 27 | Release notes: provata su un **Pebble Time 2 con PebbleOS 4.36.2** | `docs/design/galleria-s8-risultati.md` §«Ambiente del test» (PT2, PebbleOS v4.36.2, board obelix) |
| 28 | Release notes **della 0.1.0**: il build **Pebble 2 Duo** è controllato **solo in emulatore** e **iOS non è provato** | `PIANO.md` §7 (O11 non fatto: «da vedere sul Pebble 2 Duo vero»); `docs/design/galleria-s8-risultati.md` (ambiente del test: un solo orologio, PT2). ⚠️ **Storia, non stato di oggi**: le note 0.1.0 restano visibili nello store e dicono «iOS is untested», mentre la descrizione dice «tested on Android and iPhone» (riga 20, prova del 06/09). Sulla stessa pagina le due frasi si contraddicono (**dal 19/09/2026 sera** lo store mostra la descrizione di §2, nota di testa): **le note 0.4.0 e la descrizione sono il testo che vale**, le 0.1.0 sono l'archivio della prima release. Il Pebble 2 Duo resta non provato su orologio vero |
| 29 | Release notes: durante il caricamento un **contatore delle foto** è visibile **sullo schermo** (0.2.0: **icona di sincronizzazione + «k/n»**, senza parole — D32, `src/c/ui_time.c` `prv_draw_sync_icon`, arco 40°–335° + punta su `GPath` statico) | `src/c/ui_time.h:51-57` (contratto di `ui_time_set_sync_progress`: icona di sincronizzazione + «index/count» al posto di passi/icona BT nel layout A, icona + «k/n» nella fascia MM in B); `src/c/ui_time.c:632` (`prv_draw_sync_icon`, arco + punta su `GPath` statico), `:1097-1099` (`snprintf(s_sync_buf, …, "%u/%u")`, `"%u"` senza totale: da S10/D32 **la parola «Foto» non c'è più**), `:798-802` (icona + «k/n» nella riga info del layout A), `:765-771` (**U8/R10**: lo stesso contatore nella fascia dinamica del **layout B**, `MODE_B_SPRITE`), `:438-440` (ridisegno al cambio layout / fine Quick View) e `:1108-1112` (`index` 0 → la fascia ridisegnata lo cancella); `src/c/sync_proto.h:34-35` (R01, 05/09: le foto saltate contano, il contatore arriva a `n/n`) |
| 30 | Nome dello store **«Galleria»** (era «Galleria for Pebble»), versione **0.4.0** (prima release **0.1.0**, poi **0.2.0**) | spec S9 §2; `package.json` (`displayName` «Galleria», `version` **0.4.0**, verificato il 14/09/2026), decisione **U7** del 05/09/2026 per la 0.1.0, **D38** (S10) per la 0.2.0, **D42** (S11) per il nome e **D126** (UX-4) per la 0.4.0 al posto della 0.3.0 mai uscita; il nome **non si cambia dalla CLI** (`PUBLISH.md` §9) ma con il `PATCH` di `PUBLISH.md` §0/§0.1 (`--form-string "title=Galleria"`) — ⚠️ il nome **online è «Galleria»** senza `PATCH` (verificato sull'API pubblica il 19/09/2026: rinominato dall'utente dalla dashboard fra il 18/09 e il 19/09, §1), mentre il `PATCH` è stato lanciato la **sera del 19/09/2026** per la **descrizione** |
| 31 | Descrizione e release notes: è una **beta 0.4.0** | `package.json` → `version` `0.4.0` (14/09/2026); resta una beta come la 0.1.0 (decisione **U7**, tag `v0.1.0-beta`) e la 0.2.0 (tag `v0.2.0`); la 0.3.0 non è mai stata pubblicata (D126): ne resta solo il testo delle note in §3.1 |
| 32 | Descrizione: **open source, licenza MIT**, sorgente `github.com/Rediro-MC/galleria-da-polso` | `LICENSE` in radice del repo (MIT, «Copyright (c) 2026 Rediro»), decisione **U1**; repo reso **pubblico**, decisione **U4** (`git config --get remote.origin.url` → `https://github.com/Rediro-MC/galleria-da-polso.git`, `PUBLISH.md` §6) |

**Cose che il testo NON dice, di proposito** (spec §2, ultimo punto): nessuna promessa sui consumi di **batteria**
(obiettivo **O7** «Batteria 48 h» non misurato, `docs/design/galleria-s8-hardware.md:17` e `:172`; `PIANO.md` §4 S8),
niente di più su **iPhone** del «tested» del 06/09 (i test 6–8 del runbook non sono stati fatti: riga 21), nessuna
promessa su un **Pebble 2 Duo reale** (O11), nessun numero di durata della sincronizzazione (i tempi per foto variano da ~2,3–7 s su file nuovo a ~55 s su
file pieno, `docs/design/galleria-s9-pubblicazione.md` §3 R05). L'indicatore di sync del **layout B** (U8/R10) è
invece **nella build della 0.1.0** (`src/c/ui_time.c:765-771`), quindi la riga «photo counter» delle release notes
vale per **entrambi** i layout: per questo dice «on the screen» e non «in the info row».

## 6. Comando di pubblicazione

Ricerca completa (sorgente di `pebble publish` 5.0.40, riga per riga) in **`PUBLISH.md`**. Qui la riga pronta.

### Prima (obbligatorio)

```bash
. ~/ProgettiClaude/Pebble/tools/pebble-env.sh
cd ~/ProgettiClaude/Pebble/apps/galleria
python3 ../../tools/build_i18n.py --check            # dizionario: 135 chiavi x 6 lingue (PRIMA di quello della pagina)
python3 ../../tools/build_config_page.py --check     # config page inlinata aggiornata
make -C test                                         # test host + node + Python (~60 s; comprende pagecheck e i due --check qui sopra)
pebble clean && pebble build                         # gate: emery + flint verdi, senza GALLERIA_DEFINES
unzip -p build/galleria.pbw appinfo.json             # atteso: versionLabel = la versione da pubblicare (0.4.0), companyName Rediro (appinfo.json e' generato)
#   0.4.0 e' quella pubblicata il 18/09/2026; per la prossima release il numero nuovo
python3 store/make_assets.py --check                 # icone e screenshot: --check e basta, NON si rigenerano (D131);
#   dal 19/09/2026 il check copre 8 screenshot (5 emery + 3 flint: il sesto emery tolto) e 3 icone: verde il 19/09
wc -m store/description.txt store/release_notes_0.4.0.txt   # 795 e 697 (con il newline finale)
grep -n "0\.3\.0" README.md                          # deve trovare solo storia datata: la 0.3.0 non e' mai uscita
pebble login --status                                # account: sulla VM non risulta collegato (nessun firebase_oauth_storage.json)
```

`pebble login` apre un callback su `http://localhost:60000/`; in VM senza browser: `pebble login --no-open-browser`
(stampa l'URL). L'account developer sullo store non va creato a mano: al primo `publish` il tool chiama
`/api/v1/developer/create` se serve. (`PUBLISH.md`, *prerequisites*.)

### Comando

**App già pubblicata**: dalla 0.2.0 in poi serve solo la variante «nuova release» — `--version` e
`--release-notes`, niente nome/descrizione/icone, che dalla CLI non si aggiornano più
(`PUBLISH.md` §4 e §9). Per la **0.4.0** (D126: si salta la 0.3.0, mai lanciata) — **lanciato il
18/09/2026**, la 0.4.0 è online; per la prossima release cambiano solo `--version` e il file delle note:

```bash
pebble publish --non-interactive --no-gif-all-platforms \
  --version 0.4.0 \
  --release-notes "$(cat store/release_notes_0.4.0.txt)"
```

Subito **prima o dopo**, il `PATCH` di `PUBLISH.md` §0/§0.1 per le due cose che la CLI non tocca: il
**nome** («Galleria», D42 — **fatto dall'utente dalla dashboard**, verificato sull'API il **19/09/2026**) e la
**descrizione** nuova (794 caratteri, §2 — **mandata la sera del 19/09/2026**). Il comando è lì, con
il cookie di sessione; qui basta ricordare che **`title` è obbligatorio in ogni `PATCH`** e che quindi
lo stesso comando fa entrambe le cose: oggi `title=Galleria` non cambia più nulla, ma va passato
ugualmente. ⚠️ La **release** 0.4.0 l'ha lanciata l'**orchestratore il 18/09/2026**, su richiesta
dell'utente; il `PATCH` della **descrizione** è stato lanciato la **sera del 19/09/2026**
dall'orchestratore su richiesta dell'utente: il giro della 0.4.0 è **completo**. Il gate sul telefono
(`docs/design/galleria-s13-ux4-gate-telefono.md`), **non più legato** a questo passo (D126/D128 lo volevano
dopo il gate, §7), resta utile a release uscita.

```bash
# storico: la 0.3.0 e' stata SCRITTA ma MAI lanciata (06/09/2026 -> 14/09/2026, D126).
# Il file store/release_notes_0.3.0.txt e' uscito dal repo il 17/09/2026: il testo resta solo in §3.1,
# le sue novita' escono con la 0.4.0. Il comando che NON e' mai stato dato era:
#   pebble publish --non-interactive --no-gif-all-platforms \
#     --version 0.3.0 \
#     --release-notes "$(cat store/release_notes_0.3.0.txt)"
```

```bash
# storico: 0.2.0 (05/09/2026, stessa sera della 0.1.0)
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
| indicatore di sync in layout B | **U8: applicato nella 0.1.0** (R10) | `src/c/ui_time.c:765-771`; le release notes dicono «a photo counter on the screen» perché ora vale per entrambi i layout (§3) |
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
- i nomi degli screenshot **devono** cominciare con la piattaforma + `_` (gli otto file attuali vanno bene);
- **trappola**: se il server risponde 400 citando «screenshot», il tool ricarica **senza** immagini stampando solo
  un avviso giallo → controllare la riga finale `Uploaded screenshots: N`, con N = i file passati a
  `--screenshots` (2 nel comando del 05/09; la variante «nuova release» non ne passa);
- `--icon-small` vuole **80×80** secondo il prompt del tool 5.0.40 (`publish.py:759-760`) → `store/icon_80.png`
  (`store/README.md` §«Taglia delle icone» lo conferma; `icon_48.png` è la taglia del **vecchio** portale Rebble e
  resta buona per il listing, le anteprime e la procedura Rebble);
- percorso alternativo, se si preferisce il portale Rebble: `https://dev-portal.rebble.io/` (lì la categoria
  esiste, e c'è «Publish Privately»); attenzione, la doc Rebble avverte che *«once made public, an app cannot
  then be made private»*.

## 7. Decisioni U1–U9 (prese il 05/09/2026, sera) e punti ancora aperti

> **Esito: pubblicata il 05/09/2026 alle 20:41 (0.1.0); release 0.2.0 multilingua la sera stessa; descrizione corta (§2) e icone 80/144 caricate via API alle 23:27 (`PUBLISH.md` §0)** — app `cdf80cc3bf6745b1a310e4c8`, https://apps.rePebble.com/cdf80cc3bf6745b1a310e4c8 (dettagli in `PUBLISH.md`, in testa). Da qui in poi la CLI aggiorna solo versione, note e `.pbw` (§6, variante «nuova release»); nome, descrizione, icone e sorgente si cambiano in dashboard o con il `PATCH` di `PUBLISH.md` §0.
>
> **Stato al 14/09/2026 (UX-4)**: **la 0.3.0 non è mai uscita**. Era programmata il 06/09 (S11) insieme al `PATCH` del nome, ma il gate sul telefono non c'è stato e nel frattempo sono arrivate S12 (anteprima nella pagina) e UX-1/UX-2/UX-3 (pagina rifatta): lo store è ancora fermo alla **0.2.0 «Galleria for Pebble»** (API pubblica, verificata il 14/09; `package.json` è già a **0.4.0**). Per **D126** tutto esce in **una sola release 0.4.0**, e le due cose si fanno **nello stesso giro**:
>
> 1. `pebble publish --version 0.4.0 --release-notes "$(cat store/release_notes_0.4.0.txt)"` (§6, note di §3.0);
> 2. il `PATCH` di `PUBLISH.md` §0/§0.1, che **rinomina l'app in «Galleria»** (D42, mai fatto) e carica la descrizione di §2 (794 caratteri, sei lingue, «tested on Android and iPhone», «Beta 0.4.0»).
>
> **Li lancia l'utente**, non questa sessione (D126), **dopo il gate sul telefono** — runbook `docs/design/galleria-s13-ux4-gate-telefono.md` (D128) — ed è lui a confermare il numero di versione. Le note della 0.3.0 (§3.1) restano nel repo come storia; gli screenshot e le icone **non si rigenerano** (D131).
>
> **Stato al 19/09/2026**: il punto 1 è **fatto** — la **0.4.0 è stata pubblicata il 18/09/2026** dall'orchestratore, su richiesta dell'utente e **senza** il gate sul telefono. Il punto 2 era **a metà** la mattina: il **nome** è online («Galleria», rinominato **dall'utente dalla dashboard**, verificato sull'API il 19/09), mentre la **descrizione** di §2 **non era ancora stata mandata** — online c'era ancora quella della 0.2.0, 777 caratteri — quindi il `PATCH` di `PUBLISH.md` §0.1 restava da lanciare → **sera del 19/09/2026**: punto 2 **completato** (`PATCH` eseguito, descrizione online = §2). Il **gate P01–P20 non è stato fatto** e resta utile a release uscita. **D131** valeva per la **release** del 18/09: la stessa notte sono stati aggiunti **7 screenshot in `store/`**, 6 dei quali poi caricati online dall'utente dalla dashboard; il settimo è stato **tolto la sera del 19/09** (punto 4 qui sotto).


| # | Decisione | Risposta dell'utente | Applicata in |
|---|---|---|---|
| U1 | Licenza del codice | **MIT** | `LICENSE` in radice («Copyright (c) 2026 Rediro»); `README.md` §Licenze; ultima riga della descrizione (§2) |
| U2 | Nome dell'autore | **Rediro** (nickname GitHub) | `package.json` → `"author"`; §1 |
| U3 | Foto demo | **le due CC0 restano** | `resources/photos/` (§4); descrizione invariata su questo punto |
| U4 | `--source` | **repo GitHub reso pubblico** → `--source "https://github.com/Rediro-MC/galleria-da-polso"` | §1, §6; descrizione («Open source (MIT): …») |
| U5 | D5 / SDK | **SDK 4.33.1 confermato** (si usa l'ultimo SDK) | `docs/design/galleria.md` §2 D5; riga 19 di §5 (fw ≥ 4.32) |
| U6 | Visibilità della prima release | **si gestisce sul portale developer** (dalla CLI nasce pubblica) | §1, §6, `PUBLISH.md` §8 |
| U7 | Versione della prima release | **0.1.0 (beta)**, tag git `v0.1.0-beta` (lo fa l'orchestratore) | `package.json` → `version`; `store/release_notes_0.1.0.txt`; §1, §3, §6 |
| U8 | Indicatore di sync in layout B (R10) | **sì, nella 0.1.0** | `src/c/ui_time.c:765-771`; §3 e riga 29 di §5 |
| U9 | Issue su PebbleOS (avvio lento) | **rimandata** | nessun effetto sul listing; bozza in `docs/design/galleria-s9-issue-pebbleos.md` |

Restano solo cose **non decidibili da qui** (il punto 3 si e' chiuso per un'altra strada):

1. **Limiti reali dei campi dello store Core**: ignoti (nessun controllo nel tool, doc 404). La descrizione sta a
   **794 caratteri** (tetto chiesto dall'utente per la **0.4.0**: 800), quindi molto sotto il tetto prudenziale di 1.500 e
   i 1.600 dichiarati dalla documentazione Rebble; la stesura lunga del 05/09 stava a 1.493.
2. **Accenti**: la descrizione è tutta ASCII per prudenza (il campo va in multipart UTF-8, ma non è provato lato
   server). Se si vuole l'italiano con gli accenti, provarlo su una release successiva, non sulla prima.
3. **Icone per una watchface**: **risolto**, ma per un'altra strada. Le icone **80×80** e **144×144**
   sono online dal **05/09/2026 alle 23:27**, caricate con il `PATCH` multipart della dashboard
   (`PUBLISH.md` §0), non con `pebble publish`. I due flag `--icon-small`/`--icon-large` **sono stati
   passati** nel comando di creazione del 05/09 (§6, ultimo blocco «storico»): il server **non ha
   rifiutato** la chiamata — nessun 400, l'app è stata creata — ma per una watchface ha lasciato
   `icon_image`/`list_image` **vuoti** (`PUBLISH.md`, preambolo e §0), quindi le icone sono arrivate
   online solo con il `PATCH`. Il dubbio di `PUBLISH.md` §5 («se rispondesse 400, il comando fallisce
   senza creare l'app») **non si è verificato**: nessun piano B da tenere pronto.
4. **Asset dello store**: rigenerati il 05/09 alle 17:18 dagli screenshot del gate S9-prep
   (`store/make_assets.py`, `SRC_EMERY`/`SRC_FLINT` — cercarli con `grep -n`: i numeri di riga si spostano a ogni
   aggiunta al modulo, erano 33-34 fino al 18/09/2026 — puntano a `docs/design/galleria/s9_emery_a_anton_scura.png`
   e `s9_flint_a_anton_chiara.png`); `--check` **verde anche il 14/09/2026** (5 file: `icon_144`, `icon_80`,
   `icon_48`, `emery_screenshot_1`, `flint_screenshot_1`).
   Per la 0.4.0 **restano questi** — **D131**: nessuno screenshot della pagina delle impostazioni nello store,
   niente `--replace-screenshots`, `make_assets.py` non si rilancia. Se un gate futuro rifà gli screenshot
   dell'orologio, allora sì: `python3 store/make_assets.py` e di nuovo `--check`.
   **Nota del 19/09/2026**: D131 valeva per la **release** 0.4.0 del 18/09, pubblicata con gli asset di allora;
   **dopo** la release, la stessa notte, `make_assets.py` è stato esteso a **9 screenshot** e poi, la **sera del
   19/09**, riportato a **8 screenshot** (5 emery + 3 flint) più le 3 icone. **Sei dei 7** screenshot in più
   (emery 2–5, flint 2–3) erano stati caricati **dall'utente dalla dashboard** (la CLI carica screenshot solo
   dentro una release, `PUBLISH.md` §5); il settimo, **`emery_screenshot_6.png`** — foto di prova
   **CC-BY-SA-4.0** da uno screenshot S8-stile del 04/09/2026 (`store/README.md`), **mai online** —, è stato
   **tolto su decisione dell'utente**. Gli **8 file di `store/`** sono esattamente quelli online — **5 emery**
   (`emery_screenshot_1` … `emery_screenshot_5`) e **3 flint** —, tutti con foto **CC0**; `--check` è **verde**
   con 8 screenshot + 3 icone.
5. **`package.json` cambiato** (`author`, `version`): serve `pebble clean && pebble build` prima di pubblicare,
   perché `appinfo.json` (e quindi `companyName`/`versionLabel` nel `.pbw`) è generato.


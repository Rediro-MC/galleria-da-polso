# Galleria — analisi del 06/09/2026: anteprima della watchface nella config page e lingue ES/PT

> **Solo analisi, nessuna implementazione** (richiesta dell'utente: «Non procedere con implementazione»). Repo intatto
> (`git status` vuoto a fine sessione). Metodo: workflow a 25 agenti — 8 lenti (5 sull'anteprima, 3 sulle lingue),
> 2 scettici per lente (fatti; stime/opzioni), 1 critico di completezza; 24 agenti su 25 conclusi (lo scettico «fatti»
> di L1 è caduto per errore API: L1 ha un solo scettico). Regola dei modelli a 4 livelli: lenti C/protocollo/design
> (P3 fedeltà, P4 rischi, L1 pack, L3 impatto), i loro scettici e il critico su **Fable**; lenti pagina/PKJS/ricerca
> (P1 budget, P2 pixel, P5 UX, L2 CLDR) e i loro scettici su **Opus**. I numeri qui sotto sono quelli sopravvissuti
> agli scettici (le lenti hanno avuto 34 affermazioni confutate e corrette: le versioni corrette sono quelle riportate).
> File di lavoro: `.po` di PebbleOS, JSON CLDR e prototipi di misura nello scratchpad della sessione (non nel repo).

> **Nota (17/09/2026): analisi chiusa.** Le quattro domande di §0 e le tredici decisioni di §4 hanno
> risposta: le lingue in **D39–D42** (`galleria-s11-lingue-es-pt.md`) e l'anteprima in **D43–D48**
> (`galleria-s12-anteprima.md`), tutte e due le sessioni poi eseguite il 06/09/2026. Restano validi e unici
> di questo documento i **fatti misurati** (§1–§3: tabelle dei pack e CLDR, misura di terser, livelli
> dell'anteprima con i loro costi); i **numeri del budget della pagina sono fermi al 06/09** e da allora sono
> cambiati più volte (tetto 96/84 KB con D43, pagina misurata a ogni gate: lo stato di oggi è in
> `galleria-s6-config-page.md` §1 e in `apps/galleria/CLAUDE.md`). Il §6 porta l'esito di ogni voce.

## 0. Le domande dell'utente

1. **Q1** — complessità di un'anteprima della watchface nella pagina del telefono: icona «occhio» sulle tessere delle
   foto per scegliere la foto, poi cambiando font si vede quella foto con i vari font; «abbastanza in basso».
2. **Q2** — «Potrebbe creare dei problemi questa funzione?»
3. **Q3** — «Potrebbe rallentare la watchface o solo la pagina settings sul telefono?»
4. **Q4** — aggiungere spagnolo e portoghese: le varianti regionali (Spagna/Messico/Argentina, Brasile/Portogallo)
   cambiano il modo di vedere la **data sull'orologio**? Se no, una sola voce per lingua.

## 1. Fatti misurati che vincolano tutto

| Fatto | Valore | Prova |
|---|---|---|
| Pagina inlinata oggi | **64.699 B** su un tetto di 65.536 (margine **837 B**) | `build_config_page.py --check` |
| Il tetto è del tool, non della piattaforma | D13-PIANO (`PIANO.md` §6), allora `MAX_BYTES = 64*1024` (oggi 96 KB, D43) | `tools/build_config_page.py` |
| Composizione della pagina | CSS 3.758 · pipeline.js 14.593 · page_core.js 10.922 · previews.js 1.859 · page.js 28.511 · markup ≈ 5,0 KB | estrazione dei blocchi dall'HTML |
| Densità del codice dopo lo strip del tool | page.js **50,2 B/riga**, pipeline.js 29,1 | `_strip_text` importata dal tool |
| Nucleo minimo «decodifica + resa di una foto» | **974 B** dopo lo strip (già > 837) | prototipo strippato con `_strip_text` |
| Minificazione con terser 5.46.1 (pacchetto di **sistema**, `/usr/share/nodejs`) | compress **senza** mangle: HTML **50.227 B** (margine 15.309) e `test_page.js` sull'artefatto minificato **1.452 ok / 0 fail**; con mangle 43.832 B ma **9 FAIL** strutturali | prova del critico, scratchpad |
| Altre leve di pagina | −1.876 B togliendo `previews.js`; −524 B minificando il CSS; −1,5/1,8 KB i commenti `/* */` a fine riga (**solo senza terser**: terser li toglie già) | misure P1/P5 + scettici |
| URL `data:` di oggi (0.2.0) | ≈ **128 k** caratteri con album vuoto, ≈ 141 k con 4 foto, ≈ **160 k** con 12 foto e miniature reali; 226 k solo con 12 miniature al tetto teorico | `node` sullo stato reale |
| URL massimo **mai aperto** su un telefono | **121.730** caratteri (Android, `run_s8_06.log:101`, 12 foto, 30/08); tutte le 10 aperture registrate sono **pre-S10** | grep sui `run_s8_*.log` |
| iOS | **nessun** URL `data:` mai aperto; D1 aperta da S6 | `galleria-s8-hardware.md`, PIANO |
| Canale pagina → PKJS | a senso unico per gli utenti dello store: `LibPebbleConfig.kt:101 enablePlugins = false` (master e tag 1.12.0.1); il bridge `Pebble.sendMessage`/`configmessage` esiste ma è spento | repo `coredevices/mobileapp` |
| Pixel disponibili nella pagina | foto già in album: **solo la miniatura JPEG 50×57** (≤ 6.000 caratteri, mostrata 100×114); i raw6/raw1 stanno nel `localStorage` del PKJS; pixel completi **solo per la foto nell'editor** (canvas 400×456 a ×2) | `album.js:751`, `page.js:501`, F12 |
| Strip delle cifre come asset | PNG originali 37.948 B emery / 19.559 flint (base64 50.600 / 26.080, **×4/3 in più dentro lo stato JSON**: 67,5 k / 35,1 k); anello e ombra sono ricostruibili **esattamente** dal solo riempimento (dilatazione di Chebyshev R + scorrimenti S: identità su 20/20 strip) → maschere 1 bit **16 k** caratteri emery A+B, **7,3 k** con i soli glifi «1234» | Pillow, `digit_metrics.h:38-41` |
| Font Gothic/LECO | font del firmware (`.pbf` in PebbleOS, licenza non chiara): **non riproducibili** nel browser | ricognizione P3 |
| `LUMA_SUN[64]` | coincide 64/64 con `round(255·Y_WCAG(SUN_RGB))` di `pipeline.js` (margine minimo 0,0019 sull'indice 43: da copiare come tabella e pinnare) | python3 |
| Costo CPU (node) | resa di una foto 200×228 + luma **0,7 ms**; `decodeState` 8 ms su un hash da 849 k; costruzione dell'URL 3–32 ms (iOS senza JIT ≈ ×2,2) | `node`, `node --jitless` |
| Distanza di scorrimento | con 12 foto la select **Font è a 2.394 px** (tessera 150 px: la colonna dei 3 pulsanti è 136 > miniatura 114); un 4° pulsante «occhio» = **+576 px** | Firefox headless a 400 px |
| Pack PebbleOS | esistono **solo `es_ES` e `pt_PT`** (niente es_MX/es_419/pt_BR); `i18n_get_system_locale()` ritorna `es_ES`/`pt_PT` | `resources/normal/base/lang/` |
| Tabelle del pack es_ES | giorni **«do lu ma mi ju vi sá»** (2 lettere minuscole), mesi **«ene feb mar abr mayo jun jul ago sep oct nov dic»** (un solo msgid «May» → «mayo»); `%c` lasciato in ordine inglese («%a %b %e») | `es_ES/tintin.po` |
| Tabelle del pack pt_PT | «Dom Seg Ter Qua Qui Sex **Sáb**» · «Jan Fev Mar Abr Mai Jun Jul Ago Set Out Nov Dez»; `%c` = «%a %e de %b» | `pt_PT/tintin.po` |
| Cosa vede oggi in AUTO un utente es/pt | l'app compone da sé «%a %d %b» (`ui_time.c:527-536`): **«sá 5 sep» / «mi 31 mayo»** con il pack es, **«Sáb 5 Set»** (senza «de») con il pack pt; separatore delle migliaia **'.'** (`ui_time.c:547-557`) | codice |
| CLDR spagnolo (24 locali) | giorni abbreviati **identici in tutti e 24** («dom lun mar mié jue vie sáb»); mesi: 19 «sept», es-MX «sep», es-PE/es-UY «set.» (punto su tutti i mesi), es-PY/es-VE «sept.» (punto su tutti) — **non** lungo il confine Spagna/America; separatore delle migliaia **12 virgola** (MX, US, 419, PE, GT, HN, NI, PA, SV, DO, PR, CU) / **11 punto** (ES, AR, CL, CO, EC, BO, PY, UY, VE, GQ, PH) / **1 spazio** (CR) | `cldr-json` |
| CLDR portoghese | mesi abbreviati **identici** BR/PT («jan. … set. … dez.»), giorni corti identici; separatore **'.'** in Brasile, **U+00A0** in Portogallo | `cldr-json` |
| Costo C di es+pt | tabelle `WDAY[6][7][5]` + `MON[6][12][7]` = 714 B (**+266**, perché «Sáb» = 4 B UTF-8 + NUL); `datefmt.o` 689 → **963 B** senza «de» / **1.019 B** con «de»; statico emery ≈ 29,1 KB su 40 | `arm-none-eabi-gcc -Os` dell'SDK |
| Costo pagina/hash di es+pt | pagina **+46 B** (64.745, margine 791); dizionari nell'hash 19.943 → ≈ **30 k** caratteri; `i18n.js` 20,8 → ≈ 30 KB; bundle PKJS ≈ +9 KB | simulazione con i tool del repo |

## 2. Anteprima della watchface (Q1–Q3)

### 2.1 L'orologio non rallenta (Q3, parte 1)

L'anteprima nasce e muore nel telefono: `showConfiguration` costruisce lo stato e chiama `Pebble.openURL`
(`index.js:426-447`) senza AppMessage; le 17 messageKeys, il `HELLO` da 119 B, i 20 B di `GalSettings`, il persist e
il tick `MINUTE_UNIT` restano identici; al ritorno viaggia lo stesso payload di oggi. Vale a **due condizioni** da
scrivere nella spec: (1) l'«occhio» **non** si memorizza in `GalSettings.reserved` (la validazione non lo guarda, ma il
CRC del `HELLO` copre i 18 B → `SETTINGS` + record del manifest da 234 B nel file persist + redraw completo);
(2) non si promette «la foto sul vetro adesso»: il `HELLO` non porta lo slot corrente e lo shake vive solo in RAM.

### 2.2 La pagina: CPU trascurabile, dimensione decisiva (Q3, parte 2)

- **CPU**: resa di una foto 0,7 ms, decodifica dello stato 8 ms su un hash da 849 k, URL costruito in 3–32 ms
  (×3–10 sul telefono, ×2,2 su iOS senza JIT): sempre sotto il timeout di 10 s dell'app.
- **Tetto della pagina** (D13-PIANO): 837 B liberi contro un nucleo di 974 B e livelli stimati da 4 a 19 KB
  (le lenti divergono di 2–4×: **nessun prototipo** è stato scritto). Senza una leva **nulla entra**.
- **URL `data:`**: oggi 128–160 k caratteri, già **5–30 % sopra** l'unico punto misurato su Android (121.730) e mai
  provato su iOS. Ogni opzione che ingrossa l'hash somma su questa incognita. La minificazione però **accorcia**
  l'URL (≈ 92 k con album vuoto): «minifica + maschere 1 bit via hash (+16 k)» resta sotto l'URL di oggi.
- **Esito di un URL rifiutato**: pagina bianca = impostazioni inaccessibili finché non si riduce l'album; l'orologio
  resta intatto.

### 2.3 Problemi (Q2): tre, tutti a monte del codice

1. **Budget della pagina**. Leva verificata: terser `compress` **senza** `mangle` (50.227 B, test verdi); con
   `mangle` i controlli strutturali di `test_page.js` si rompono. Porta però una dipendenza Node **di sistema non
   dichiarata** (nessun lockfile) in una catena Python-stdlib con `--check` byte-per-byte in un repo pubblico:
   va fissata la versione (vendoring/lockfile), o scritto un minificatore Python, o alzato il tetto a 80–96 KB
   (Android 2 MiB va bene; iOS ignoto). Da decidere **prima** di scrivere una riga.
2. **iOS**: nessuna misura, e la 0.2.0 in commercio è già oltre l'unico punto misurato. Una prova sull'iPhone con
   l'URL di oggi e uno da ~200 k sblocca tutto (anteprima e lingue).
3. **Fedeltà**. Per le foto già in album la pagina ha solo la miniatura 50×57 (il luma calcolato su di essa può
   scegliere un colore diverso da quello vero); LECO e Gothic non esistono nel browser; 12/24 h in auto, content
   size ExtraLarge, isteresi luma e Quick View non arrivano alla pagina; la LUT «sunlight» non è mai stata
   confermata sul vetro (O6). Un'anteprima etichettata «come sull'orologio» che poi tradisce è **peggio di nessuna**.

### 2.4 Livelli e costi (Q1)

| Livello | Cosa mostra | Codice (dopo strip) | Asset nell'hash | Sforzo | Giudizio |
|---|---|---|---|---|---|
| **Fedele** (come chiesto: occhio sulle tessere, ora vera, colore auto, riga info, A/B, foto dell'album) | tutto, ma resta **disonesto** su miniatura, riga info e 12/24 h senza C nuovo nel `HELLO` (+1–2 giorni Fable, 18ª messageKey, `pebble clean`) | 17–22 KB (350–450 righe) | 16 k (maschere) … 67 k (PNG) | **3–5 giorni-persona** + decisioni a monte | sconsigliato così com'è |
| **Onesta** (foto **nell'editor** con pixel esatti + ora campione «12:34» con le maschere **vere** del font/stile, palette esatta, colore auto dal porting di `luma.c` sulla fascia giusta; niente riga info; LECO = «nessuna anteprima»; Quick View ignorata) | ciò che l'orologio farà davvero con **quella** foto | 7–13 KB (150–250 righe): entra nei 15,3 KB della minificazione no-mangle | **7,3 k** («1234») – 16 k | **1,5–2,5 giorni** | la strada sensata |
| **Cosmetica** (PNG «12:34» a 28 px di `previews.js` sopra la miniatura, tinto) | una suggestione | ≈ 1 KB (oltre gli 837 B) | 0 | 0,5 giorno | sconsigliata: 28 px contro 61–93 px reali, niente anello/ombra (proprio ciò che `digit_style` cambia), `mask-image` non funziona su PNG senza alpha |
| **Previsione del colore** (solo testo sotto l'anteprima dell'editor: «ora bianca con contorno, 18 % di pixel difficili», stessa aritmetica intera di `luma.c`) | risponde a «si leggerà l'ora su questa foto?» | 25–55 righe | 0 | 0,5 giorno | primo passo a costo minimo; richiede comunque la leva di budget |

Porting necessario per i livelli «onesta» e «fedele»: griglia D25 (`prv_grid_steps`/`prv_place_row_fit`: 4 numeri
per strip + 11 larghezze d'inchiostro, JSON ≈ 0,45–1,2 KB), palette per stile (`ui_time.c:675-710`, 4 indici
riconoscibili dai colori RGBA puri dei PNG), `luma.c` (95 righe nette; campionamento 1 px su 2 dall'origine della
fascia), scelta della fascia per layout/piattaforma. Test: fixture Python (`photo_prep.py --stats` per il luma,
metriche da `digit_metrics.h`), canvas finto di `test_page.js` da estendere (oggi `drawImage` è no-op), un passo
del gate Firefox. Prove mai fatte sulla WebView: `<img src="data:png">` + `getImageData` dentro una pagina `data:`
(taint), costo del blit 596×100 e degli `onload` asincroni.

### 2.5 Dati per la foto sotto l'ora

| Opzione | Caratteri nell'hash | Qualità | Nota |
|---|---|---|---|
| (a) raw interi di tutte le foto | emery **+730 k** (URL ≈ 890 k, 43 % del tetto Chromium); flint +65 k (URL ≈ 224 k) | esatta | fuori scala su emery; su flint «abbordabile», non gratis (pagina e bundle sono condivisi: nessuna opzione «solo flint») |
| (b) miniature 100×114 JPEG | 2.151–5.419 caratteri l'una (entra nel tetto di 6.000 con ripiego a q0,5); URL 185–209 k | riconoscibile, dithering perso | viaggia anche nel payload di **ritorno** (cap iOS 200 KB) |
| (c) solo la foto nell'editor | 0 | esatta | l'occhio sulle tessere non ha senso |
| (d) «raw6 dimezzato» 100×114 salvato con ogni foto **nuova** | 11,4 k per foto (URL ≈ 345 k con 12) | **esatta per il colore** (luma campiona 1 px su 2) | solo foto aggiunte dopo; +9 k per foto nell'album JSON |
| (e) rigenerare dai file originali | — | — | impossibile: l'originale non esiste più |

La differenza fra (a) e (b) si vede solo se l'anteprima è disegnata ad **almeno 200×228 px fisici**: alla scala della
tessera (100×114 CSS) le distanze crollano. Prima dei dati va deciso **quanto grande** dev'essere l'anteprima.

### 2.6 UX

- Posizione: subito sotto «Stile cifre» batte «in fondo»: la select Font è già a ~2.400 px con 12 foto, e l'editor
  mostra già un canvas 400×456 a ×2 (364 px CSS a 400 px di larghezza).
- «Occhio»: un 4° pulsante costa +48 px per tessera (+576 px di scorrimento) e una voce in `FAM_BTN`; alternative:
  miniatura cliccabile o select «foto da mostrare». Ricordarlo fra un'apertura e l'altra: mai in `GalSettings`;
  eventualmente `localStorage` del PKJS via un campo facoltativo del payload.
- Etichetta: «anteprima» (approssimata, con nota), mai «come sull'orologio» finché O6 non è chiusa.
- Chiavi i18n nuove: 4–8 (≈ 660–1.320 caratteri di hash, ~172 B l'una in `i18n.js`); nessun byte in pagina.

### 2.7 Rischi in ordine

1. iOS/WKWebView senza misure (rende inutilizzabile la pagina **esistente**, non solo la nuova).
2. Tetto della pagina come prerequisito; la leva sicura introduce terser di sistema in una catena Python.
3. Anteprima che mente (miniatura, font di firmware, 12/24 h, isteresi, sunlight non confermato).
4. Scope creep verso l'orologio (occhio in `reserved[]`, slot corrente nel `HELLO`).
5. Prove mancanti sul percorso canvas nella WebView.
6. Payload di ritorno con miniature più grandi contro il cap iOS di 200 KB.

## 3. Lingue spagnola e portoghese (Q4)

### 3.1 Verdetto: **una** «Español» e **una** «Português»

- Il firmware ha **un solo pack** per lingua (`es_ES`, `pt_PT`) e l'app tronca il locale a due lettere: in auto la
  variante regionale **non è nemmeno esprimibile**; un messicano o un brasiliano vede già oggi «sá 5 sep» / «Sáb 5 Set».
- In CLDR i giorni spagnoli sono **identici in tutti i 24 locali**; i mesi cambiano solo su settembre e sul punto
  finale (4 locali), senza seguire il confine Spagna/America; il portoghese è identico BR/PT nella data.
- Il 12/24 h è già regionale per conto suo (`clock_is_24h_style()` del firmware, indipendente da `lang`);
  AM/PM resta la sigla inglese in entrambi i pack.
- L'**unica** differenza regionale visibile è il **separatore delle migliaia dei passi**: spagnolo spaccato
  12 virgola / 11 punto / 1 spazio, portoghese punto (Brasile) contro spazio (Portogallo). Oggi l'app forza '.' per
  ogni locale non en/it/de/fr: **già sbagliato per 13/24 locali spagnoli**, e né es/pt né due varianti spagnole lo
  curano (nove paesi con la virgola resterebbero nel gruppo «Spagna»). Va trattato a parte (§3.3).

### 3.2 Formati con lingua forzata (D34: tabelle identiche ai pack)

| Lingua | Pack alla lettera | = auto di Galleria | CLDR (deroga a D34) |
|---|---|---|---|
| es | «sá sep 5» (`%c` in ordine inglese; `%e` darebbe «sá sep  5» con doppio spazio) | **«sá 5 sep», «mi 31 mayo»** — giorni a 2 lettere minuscole, «mayo» intero: +274 B, `DATEFMT_MAX_LEN` invariato | «sáb 5 sept», «mié 31 may» (forma es-MX: «sep») — leggibile; forzata ≠ notifiche/calendario del firmware |
| pt | **«Sáb 5 de Set»** (`%c` del pack): +330 B, `DATEFMT_MAX_LEN` 13 → **14** (BUFSZ 15), livello 1 «Sáb 5» più frequente su flint | **«Sáb 5 Set»**: nessun ramo nuovo | «sáb., 5 de set.» |

Il pack spagnolo è un caso anomalo che it/de/fr non avevano posto: la scelta riguarda **tutti** gli ispanofoni
(non le varianti) e va presa prima di generare tabelle e pin (altrimenti `test_datefmt`, 1.565 asserzioni e 12
mutanti, si scrive due volte).

### 3.3 Separatore delle migliaia: opzioni

| | Comportamento | Costo | Chi resta sbagliato |
|---|---|---|---|
| (a) '.' per es e pt | come oggi in auto; pack «Kickstart» es/pt = '.'; CLDR Spagna/Brasile | 1 `case` (0 B: il compilatore fonde i range) | Messico, USA, America centrale/Caraibi, Perù; Portogallo, Costa Rica |
| (b) nessun separatore per i locali non en/it/de/fr («6532») | mai sbagliato in nessun paese | 1 carattere (`timefmt.c:76` lo supporta) | nessuno, ma meno leggibile |
| (c) impostazione «Separatore» (byte in `reserved[]`, CRC dei default invariato, precompilato dalla **pagina** da `navigator.language` — nel PKJS iOS non esiste, in pypkjs vale sempre en-GB) | corretto ovunque, modificabile | 400–550 B di pagina (contro 791 di margine: serve la leva di §2.3) + 5–6 chiavi × 6 lingue | nessuno |
| (d) spazio per pt come il francese | CLDR pt-PT (ma U+00A0 non è rappresentabile con `char`: U+0020) | 1 `case` | cambia **anche l'auto** dei portoghesi; Brasile sbagliato |

### 3.4 Impatto nel repo (es = 5, pt = 6, sempre in coda)

- **Orologio (alta, Fable)**: `settings.h` (enum +2, `gal_lang_from_locale` +2 rami; «es»/«en» distinti al secondo
  carattere), `settings.c:47` (validate ≤ PT), `datefmt.h/.c` (tabelle `[6][7][5]`/`[6][12][7]`, costanti, eventuale
  ramo pt «de» e `DATEFMT_MAX_LEN`), `ui_time.c:554-556` (lingue «note» del separatore), `GALLERIA_DEBUG_LANG`.
  Nessuna messageKey nuova, CRC dei default invariato, niente `pebble clean`, `s_date_buf[24]` regge.
  Trappola C: `"S\xC3\xA1b"` ingoia la «b» (scrivere «Sáb» in UTF-8 letterale come «Mär»).
- **Test C (alta, Fable)**: `test_datefmt.c` da 31.248 a 46.872 casi esaustivi, pin da riscrivere (lang 5/6 == EN,
  «byte ≥ 0x80 mai ai livelli 1/2» diventa **falso per costruzione** con «sá 5»/«Sáb 5»: regola per lingua),
  tabella dei mutanti nuova; `test_storage.c` (:2320, :2335, :2412), `test_sync.c:1419-1427` (`blob[13] = 5` →
  `BAD_FORMAT` **si inverte**: usare 7 come primo valore non valido e aggiungere un caso 5/6 accettato).
- **PKJS/pagina (medio-bassa, Opus)**: `page_core.js:25/28` (`LANGS`, `LANG_NAMES`), `album.js:78`, `index.js:340-341`
  (`LANG_ORDER`), `dec` (es/pt = virgola: coerente con CLDR e col pack es; il pack pt tiene il punto — solo gamma/lift);
  i test `test_index_retry.js:589`, `test_page.js:3148`, `test_album.js:501` si invertono; stub `test/shim/i18n_stub*.js`.
- **Tool (medio-bassa, Opus)**: `build_i18n.py:49-50` (`LANGS`/`OUT_LANGS`) + selftest con fixture a 4 lingue;
  `galleria_devserver.py` (`PAGE_LANGS`, `--lang es` che oggi **deve** fallire, :1993, :2387); `build_config_page.py`
  non dipende dal numero di lingue; da aggiungere un controllo «lingue di `i18n.js` == `LANGS`» (`_check_i18n_module`
  confronta solo `keys`).
- **Traduzioni (medio-bassa, Opus + revisori)**: 121 chiavi × 2 = 242 stringhe; registro tú/usted e você/tu da
  decidere; lessico neutro (il telefono può essere es-MX/pt-BR); log PKJS solo ASCII (F-S8-2).
- **Documenti/store (bassa)**: `galleria-s10-i18n.md`, `galleria-s6-config-page.md:65-69/129`, `i18n/README.md`,
  `tools/README.md`, `apps/galleria/CLAUDE.md:110-155` (righe 61-65 nella stesura del 06/09), `PIANO.md`, `CONTINUA-QUI.md`; versione **0.3.0**, release
  notes ASCII a 6 righe, descrizione dello store da aggiornare in dashboard.
- **Ordine di grandezza**: ~45 punti in ~30 file, 6 copie della lista lingue da tenere allineate, ≥ 10 casi di test
  oggi verdi che si invertono; 1–2 giorni-persona, 12–16 agenti in 3 workflow (S10 a 4 lingue da zero ne aveva 18).
- Downgrade 0.3.0 → 0.2.0 con `lang` 5/6 nel manifest: `storage.c:313-314` riporta **tutte** le impostazioni ai default
  (si autoguarisce al `HELLO` successivo perché `album.js` normalizza `lang` → 0); lo store non offre il downgrade.

## 4. Decisioni che spettano all'utente

**Anteprima**
1. iPhone: aprire una volta la config page della 0.2.0 (URL ≈ 128–160 k) e poi una prova a ≈ 200 k, prima di
   qualunque opzione che ingrossa l'hash? Sì / no (allora ogni aggiunta nasce con un ripiego «spenta su iOS»).
2. Tetto della pagina: (a) minificazione nel tool con terser no-mangle e versione fissata; (b) tetto a 80–96 KB dopo
   la prova iPhone; (c) restare a 64 KB e fare solo la previsione del colore in testo.
3. Cosa mostra: ora campione «12:34» (asset −65 %, niente dipendenza da 12/24 h) o ora vera?
4. Quale foto e quanto grande: solo l'editor / anche le tessere con miniatura dichiarata «approssimata» / «raw6
   dimezzato» per le foto nuove; tessera 100×114 o riquadro ≥ 200×228 fisici?
5. Colore automatico simulato (porting di `luma.c`) o dichiarato («lo deciderà l'orologio»)? Riga info e LECO
   omessi o approssimati e dichiarati?
6. Posizione (sotto «Stile cifre» o in fondo) e comando (4° pulsante, miniatura cliccabile, select)?
7. Conferme: l'occhio mai in `GalSettings`; nessuna promessa sulla foto sul vetro adesso; etichetta «anteprima».

**Lingue**
8. Spagnolo forzato: tabella del pack («sá 5 sep», = auto, D34) oppure CLDR leggibile («sáb 5 sept», deroga documentata)?
9. Portoghese forzato: «Sáb 5 de Set» (`%c` del pack, `DATEFMT_MAX_LEN` 14) oppure «Sáb 5 Set» (= auto)?
10. Separatore delle migliaia: (a) '.' / (b) nessuno per i locali ignoti / (c) impostazione / (d) spazio per pt.
11. Traduzioni: registro (tú/usted, você/tu), lessico neutro, rilettura delle 242 stringhe prima del gate?
12. Igiene: `GAL_LANG_LAST`/`DATEFMT_LANG_LAST` al posto dei confronti «≤ FR» e controllo «lingue di `i18n.js` ==
    `LANGS`» nel build tool?
13. Sequenza: prima es+pt (indipendente, nessun rischio sull'orologio), l'anteprima dopo la prova iPhone e la scelta
    sul tetto? Versione 0.3.0 con release notes e descrizione dello store.

## 5. Piano proposto (da confermare)

- **S11 — lingue es/pt** (dopo le decisioni 8–13): spec con D39 (criterio per pack incoerente e separatore),
  tabelle e test C (Fable), PKJS/pagina/tool/traduzioni (Opus), scettici Fable sul C, gate emulatore con
  `GALLERIA_DEBUG_LANG=5/6` (mostra solo la lingua forzata: la data in **auto** con pack es/pt non è mai stata vista,
  l'emulatore non ha i pack) + Firefox nelle 6 lingue; 0.3.0.
- **S12 — anteprima «onesta»** (dopo le decisioni 1–7 e la prova iPhone): leva di budget nel tool, maschere 1 bit
  generate da `gen_digits.py` con `--check` in `pagecheck`, modulo PKJS con `require` pigro, segmento dell'hash per
  gli asset, porting di griglia/palette/luma con fixture Python, canvas finto esteso, gate Firefox.

## 6. Drift documentale trovato (stato riverificato il 17/09/2026)

- **Ancora aperto.** «D13» è ambiguo: in `apps/galleria/PIANO.md` §6 è il **budget della pagina imposto dal
  tool** e in `docs/design/galleria.md` §2 è **«layout B solo cifre»**. Qui si scrive **«D13-PIANO»**; nei due
  documenti la disambiguazione non è stata fatta (i numeri di riga della prima stesura, `PIANO.md:471` (453 nella stesura del 06/09) e
  `galleria.md:28`, nel frattempo si sono spostati).
- **Corretto il 17/09/2026.** La frase di `galleria-s6-config-page.md` secondo cui l'inliner «non toglie i
  blocchi `/* */`» non c'è più: il tool li toglie quando **aprono una riga** (`_strip_text` in
  `tools/build_config_page.py`), e sopravvivono solo i commenti in **coda a una riga di codice** — è quello che
  dice oggi il documento, ed è la leva che in UX-3 ha reso 2.250 B. La leva «etichette di `OPTS.digit_style`
  ~270 B» non esiste più comunque: da S10 sono chiavi nell'hash.
- **Corretto.** Il modulo `config_page.js` di S10 non è 66.597 B ma **66.800**: la rettifica, con il motivo, sta nel
  punto elenco «**Dimensioni**» della sezione «Revisione S10 (05/09/2026) — la pagina in quattro lingue, sei da
  S11 (06/09/2026)» di `galleria-s6-config-page.md`.
- **Corretto.** In `galleria-s8-risultati.md` il tempo passato nella pagina non è più «22 s in media»: ci sono
  le due misure vere, **22,1 s** (05/09) e **~71,8 s** (30/08).

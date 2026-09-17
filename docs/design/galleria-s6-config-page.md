# Galleria — specifica S6: config page (crop, quantizzazione, anteprima, impostazioni)

> **Stato (17/09/2026)**: v1.1 del **30/08/2026** (1.0 del 29/08 + precisazioni dall'implementazione, segnate «impl.») **più 9 revisioni fino al 14/09/2026** (S7, v1.9, S8-stile, S9-prep, S10, S12, UX-2, UX-3, UX-4: sono le sezioni «Revisione» in fondo al file). La pagina di **oggi** è quella delle revisioni **UX-2/UX-3/UX-4** e del piano `docs/design/galleria-s13-ux-casual.md` §13–§15; restano contratto vivo §1–§4, di §5 l'elenco delle API e il blocco «Regole, id stabili e miniatura», §7, §8 e §9 (contratto dei test, aggiornato ai bersagli di oggi), mentre §5 bis, §6 e §10–§12 raccontano la sessione S6 com'era, con l'esito annotato in testa. Specifica operativa della sessione S6 (`apps/galleria/PIANO.md` §4 S6). Integra `docs/design/galleria.md` §6 (che a fine sessione ne riporterà la sintesi) e §5.1 (album e payload, S5b). Il riferimento byte-esatto della pipeline immagine è `tools/photo_prep.py` v1 (`tools/README.md` §9), **non** gli snippet di `docs/ricerca/galleria/05-colore-quantizzazione.md` (che per flint descrivono un packing diverso: il formato dell'orologio è raw1 = 1BitPalette MSB-first, 18 B/riga, 3.024 B, come in `photo_prep.pack1`).

Percorsi relativi a `apps/galleria/` salvo indicazione. Tutto il codice della pagina è **ES5** (var, function, niente arrow/let/const/class/template literal/spread), con typed array e API canvas (la pagina gira nella WebView di configurazione dell'app Pebble: Android Chrome ≥ 80, iOS WKWebView ≥ 16; e in Firefox/Chrome desktop dal dev server). Nella pagina **niente `localStorage`/`sessionStorage`/cookie** (origine opaca del `data:` URL: l'accesso lancia SecurityError) e nessuna risorsa esterna (font, CDN, immagini remote): tutto inlinato.

## 1. File e contratto di inlining

```
src/pkjs/config/page.html        markup (S10: testi via data-i18n, nodi vuoti), viewport mobile, nessuna risorsa esterna
src/pkjs/config/page.css         stile (19.215 B il 14/09/2026, a fine UX-4; 10.063 B a fine UX-2, ≤ 6 KB fino a UX-1): una colonna, max-width 480 px, usabile a 360–400 px
src/pkjs/config/pipeline.js      PURO (no DOM): pipeline immagine byte-esatta con photo_prep.py + CRC32 + base64url + rettangoli
src/pkjs/config/page_core.js     PURO (no DOM): stato ← hash, costruzione payload, slot, ordine, KB, validazione impostazioni
src/pkjs/config/preview.js       S12/D46: PURO (no DOM): window.GalPreview = motore dell'anteprima della watchface (usa GalPipeline; maschere da state.masks)
src/pkjs/config/page.js          UI (DOM, canvas, eventi, trasporto): usa GalPipeline, GalPageCore, GalPreview
src/pkjs/config_page.js          GENERATO da tools/build_config_page.py: module.exports = "<html inlinato>" (stringa JSON ASCII). Non modificare a mano.
tools/build_config_page.py       inliner (§7)
tools/galleria_browser.py        client WebDriver per Firefox headless (§9)
test/gen_page_fixture.py         genera test/fixture_page.js da photo_prep.py (§8)
test/test_pipeline.js            round trip Python ↔ JS + unit test della pipeline (§8)
test/test_page.js                test di page_core.js e page.js con DOM finto (§8)
```

`page.html` referenzia gli asset con tag normali, così la pagina si apre anche da disco durante lo sviluppo:
```html
<link rel="stylesheet" href="page.css">
<script src="pipeline.js"></script>
<script src="page_core.js"></script>
<script src="preview.js"></script>
<script src="page.js"></script>
```
L'inliner sostituisce **ogni** `<link rel="stylesheet" href="X">` con `<style>…</style>` e ogni `<script src="X">` con `<script>…</script>` (X = file locale nella stessa cartella; niente sottocartelle, niente URL). Un file mancante è un errore, salvo `data-optional="1"` (il tag viene rimosso). Il contenuto inlinato non può contenere il marcatore di chiusura del **proprio** tipo (`</script>` in un .js, `</style>` in un .css: l'inliner lo verifica e fallisce; impl.: un `<!--` seguito da `<script` in un .js è vietato — «script data double escaped»); gli attributi dei tag sostituiti (`defer`, `type="module"`, `media`) vengono scartati con un avviso: tenere i tag nudi. Ordine degli script obbligatorio: pipeline → page_core → preview → page (`preview.js` è il motore dell'anteprima della watchface, S12/D46). ⚠️ **UX-2/D95**: `previews.js` — le PNG «12:34» sotto la select dei font — è stato **cancellato** dalla cartella e da `SCRIPT_ORDER`; il meccanismo `data-optional="1"` resta (i selftest dell'inliner lo provano con un nome neutro, `extra.js`). I moduli puri espongono un oggetto globale nel browser **e** `module.exports` in node:
```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.GalPipeline = factory(); }
}(this, function () { … return api; }));
```
(stesso schema per `GalPageCore`, che in node fa `require('./pipeline')` se `GalPipeline` non è globale: usare `typeof GalPipeline !== 'undefined' ? GalPipeline : require('./pipeline')`).

Budget: HTML+CSS+JS inlinati **< 84 KB** (l'inliner lo misura e fallisce oltre **96 KB** = 98.304 B). **S12/D43**: il tetto era 64 KB con obiettivo 60 e li ha alzati l'anteprima della watchface; la prima stesura di D43 diceva 80/72 con l'obiettivo di «≈ 76 KB», ma la pagina misurata è 81.028 B — 892 B dal tetto di 80 KB e l'avviso dei 72 acceso a ogni generazione, cioè una tripwire spenta — e la revisione S12 ha portato le costanti a **96/84** (il vincolo che lega davvero è la lunghezza dell'URL sul telefono, §2, non i 64 KB storici). **Misura di fine S12 (06/09/2026): HTML inlinato 81.028 B (79,1 KB), modulo `config_page.js` 83.538 B, margine 17.276 B sul tetto e nessun avviso soft** (`preview.js` inlinato pesa 12.216 B). Misurare comunque la pagina a ogni aggiunta; se un giorno servisse spazio, le leve pronte sono un collasso degli spazi nell'inliner (~2,4 KB stimati sul solo `preview.js`) o commenti più corti nei sorgenti. **Misura di fine UX-2 (13/09/2026, dopo la correzione della revisione): HTML inlinato 83.865 B (81,9 KB), modulo `config_page.js` 86.544 B**, margine 14.439 B sul tetto e **nessun avviso soft** (135 B sotto il criterio del gate, «mai oltre 84.000 B»): **+2.837 B sulla pagina di fine S12** (81.028 B, lo stato che sarebbe dovuto uscire come 0.3.0, mai pubblicata) e **+1.699 B sulla pagina di fine UX-1** (82.166 B), cioè la struttura nuova (§«Revisione UX-2» in fondo) al netto di quello che aveva già aggiunto UX-1, pagata in parte dalla cancellazione di `previews.js`. **Misura di fine UX-3 (13/09/2026 notte, dopo la revisione): HTML inlinato 85.446 B (83,4 KB), modulo `config_page.js` 88.254 B** — **+1.581 B netti** su UX-2 (83.865) —: margine **12.858 B** sul tetto duro di 96 KB e **570 B sotto l'avviso soft** di 86.016 B, che **non si accende** (`--check` esce 0 senza avvisi). La storia della misura vale come lezione: all'integrazione la pagina era **87.244 B** (+3.379 lordi, tutto codice di pagina — editor, footer, ✕ a due tocchi, prevenzione del tetto —), 1.228 B **sopra** l'avviso soft; l'orchestratore ha usato la sola leva a costo zero — i **38 commenti a fine riga** di `page.js` (33) e `page_core.js` (5) spostati su righe proprie, che l'inliner toglie: **−2.250 B**, nessun codice tagliato — e le correzioni della revisione hanno poi aggiunto **+452 B**. Restano 1.446 B sopra il traguardo «mai oltre 84.000 B» che si era dato UX-2, criterio sostituito per UX-3 dall'avviso soft. Le leve (a) codice morto e regole CSS doppie e (b) le frecce del font (D63) **non sono state usate** e restano pronte se una sessione futura supera 86.016 B (decisione dell'orchestratore, §«Revisione UX-3» in fondo). **Misura di fine UX-4 (14/09/2026): HTML inlinato 85.476 B, modulo `config_page.js` 88.284 B** — **+30 B** su UX-3, cioè i soli due residui ammessi da D127 (+20 B il `pos()` della cornice in `page.js`, +10 B `.chk { gap: 4px }`): margine **12.828 B** sul tetto e **540 B sotto l'avviso soft**, che non si accende. Il dizionario (135 chiavi, +14 B con D133) **non entra nella pagina**: viaggia nell'hash. Impl.: l'inliner toglie per default le righe di commento intere, le righe vuote e l'indentazione dagli asset js/css (`--no-strip` per l'output grezzo; sicuro perché in ES5 una stringa non attraversa una riga) → sorgenti 65,5 KB ⇒ HTML inlinato 54.540 B (58.141 B dopo le correzioni della revisione; modulo 59.987 B). La LUT sunlight 32³ (32 KB) **si calcola a runtime** (non va inlinata).

## 2. Stato PKJS → pagina (hash dell'URL)

Il PKJS (`index.js`, `showConfiguration`) apre la pagina con lo stato nell'**hash**, identico sul telefono e in emulatore:
- telefono: `Pebble.openURL('data:text/html;charset=utf-8;base64,' + b64.encodeUtf8Std(html) + '#' + stateB64)` (**S12/D44**; fino a S11 era `charset=utf-8,` + `encodeURIComponent(html)`, che costa il 24 % di caratteri in più)
- emulatore (`Pebble.platform === 'pypkjs'`): `Pebble.openURL('http://localhost:8765/config.html#' + stateB64)`; `pebble emu-app-config` aggiunge `?return_to=http://localhost:<porta>/close?` **prima** dell'hash (`url_append_params` usa `urlparse`/`urlunparse`: il frammento sopravvive) e scrive un file `~/pebble-tool-emu-app-config-*.html` con `<meta http-equiv="refresh" content="0;URL=<url>">` che apre nel browser (con `BROWSER=true` non apre nulla: il gate legge l'URL da quel file).

`stateB64` = base64url **senza padding** (alfabeto `A-Za-z0-9-_`, come `b64.js`) dei byte UTF-8 di `JSON.stringify(state)`. Decodifica nella pagina: `location.hash.slice(1)` → base64url → byte → UTF-8 → JSON (implementare la decodifica UTF-8 a mano o con `TextDecoder` se esiste; provare con nomi tipo `città`). Hash assente o non decodificabile ⇒ stato vuoto di default + avviso "stato non ricevuto: modalità prova" (la pagina resta usabile).

```js
state = {
  v: 1,
  platform: 'emery' | 'flint' | 'unknown',   // Pebble.getActiveWatchInfo().platform (try/catch), oppure watch.format
  fmt: 1 | 2,                                 // formato dell'orologio collegato: 1 = raw6 200×228 (emery), 2 = raw1 144×168 (flint)
  cap_kb: 900 | 200,                          // tetto del payload per Save: 900 (Android, pypkjs), 200 (iOS: D1 ❓)
  dev: true | false,                          // Pebble.platform === 'pypkjs'
  settings: { layout, font, clock_mode, leading_zero, text_color, outline, interval_min, order, shake_next, info_row, digit_style, lang },   // 12 campi: digit_style da S8-stile/D21, lang da S10/D31
  settingsSet: bool,                          // false ⇒ la pagina mostra i default e avvisa "non ancora salvate"
  photos: [12 × (null | { id, name, thumb?, fmts: { "1"?: {len, crc}, "2"?: {len, crc} } })],   // indice = slot (album.state().photos)
  order: [slot…],                             // ordine di rotazione locale
  deleted: [slot…],                           // eliminazioni non ancora confermate dall'orologio (la pagina le tratta come "già eliminate")
  watch: null | { at, format, maxChunk, settingsCrc, openMs, slots: [12 × {state, crc}], foreign: [slot…] },  // ultimo HELLO
                                              // openMs (v1.9) = ms dell'apertura del file persist sull'orologio (HELLO.OPEN_MS); null = non noto (orologio o snapshot pre-v1.9), 0 = non misurato
  lang_auto: 'en'|'it'|'de'|'fr'|'es'|'pt',   // S10/D33 + S11/D39: lingua della pagina quando settings.lang vale 0 (dal PKJS: orologio → navigator → en; in DEV l'hook --lang)
  preview_time: '12:34',                      // S12/D45: ora campione dell'anteprima (decide quali glifi viaggiano in `masks`)
  masks: null | { v: 1, <platform>: { <font>: { a|b: { strip_h, digit_h, ring, shadow, cell_w, glyphs: { '<car>': { w, bits } } } } } },
                                              // S12/D45: maschere a 1 bit del RIEMPIMENTO, dal modulo generato src/pkjs/digit_masks.js.
                                              // Solo la piattaforma COLLEGATA e solo i glifi di preview_time (in taglia B niente ':') PIU' il solo `w`
                                              // degli altri digit (revisione S12: prv_grid_steps misura la cifra piu' larga fra le 10), tutti i font e
                                              // tutte e due le taglie (l'anteprima si ridisegna al cambio di font/layout senza tornare al PKJS);
                                              // `bits` = base64url senza padding delle righe della colonna d'inchiostro (ceil(w/8) byte per riga, MSB-first, 1 = riempimento).
                                              // null se il modulo manca o e' malformato (build senza --masks-js): la pagina mostra la sola foto.
  i18n: { en: [...], it: [...], de: [...], fr: [...], es: [...], pt: [...] }   // S10/D35 + S11/D39: TUTTI e sei i dizionari (135 voci l'uno il 14/09/2026, nell'ordine delle chiavi di messages.json): il cambio lingua nella pagina e' istantaneo
}
```
Dimensione: ≤ 12 miniature × ≤ 6.000 caratteri + JSON ≈ 75 KB → base64url ≈ 100 KB. **S10**: i dizionari aggiungono ≈ 19,9 k caratteri di base64url (misurati con `node` su `src/pkjs/i18n.js`); con l'album vuoto l'URL `data:` completo è ≈ 127 k caratteri (HTML percent-encoded 106.987 + hash 20.114), lontano dal tetto Android di 2 MiB. **S11** (sei lingue, misurato il 06/09/2026): i dizionari sono **30.012 caratteri** di base64url (`src/pkjs/i18n.js` 30.124 B) e l'URL con l'album vuoto sale a ≈ 137 k caratteri (stima dal +10 k di dizionari: l'HTML percent-encoded cresce solo dei 46 B di pagina in più); sull'iPhone la pagina si è aperta con **128–138 k** caratteri (06/09, `galleria-s8-risultati.md` §S8b: 128.250, 133.569 ×2 e **138.249**), quindi il margine resta ampio anche lì. **S12** (D44 + D45, **misure di fine sessione, 06/09/2026, sul modulo di maschere vero e sulla pagina vera**): la pagina passa al base64 e i suoi **81.028 B** costano **108.040** caratteri (con il percent-encoding sarebbero **135.932**: D44 ne toglie 27.892). Lo stato porta ora anche `preview_time` e `masks`, e le maschere sono il pezzo più grosso di tutti: con l'album vuoto l'hash vale **77.014** caratteri su emery — **43.276** di maschere, **33.394** di dizionari (sei lingue, 134 chiavi), il resto ≈ 350 — e l'URL completo **185.091 caratteri**; su flint **161.424** (maschere **19.610**). Lontanissimo dal tetto Android di 2 MiB, ma **oltre i 128–138 k già visti sull'iPhone**: da misurare sul telefono (gate punto 4). 🔁 **Misure di fine UX-4 (14/09/2026, calcolo con i moduli veri, `~/galleria-gate/ux/ux4/mkurl12.js`)**: pagina **85.476 B** = **113.968** caratteri di base64, hash ad album vuoto **81.218** su emery e **57.551** su flint, URL completo **195.223** / **171.556**; con **12 foto e le miniature vere** del gate **221.703** / **198.020**, e con 12 miniature al tetto di 6.000 caratteri l'una (caso peggiore) **292.908** / **269.225**. Android ha già aperto 198.455 e 201.484 caratteri (S12, 06/09). Se l'iPhone non regge, le leve in ordine sono l'**RLE delle maschere** (misurato con `node`: 29,8 k → 10,4 k caratteri, **×2,86**) e il mandare le maschere del **solo font scelto** (l'anteprima tornerebbe al PKJS a ogni cambio di font). `fmt` decide TUTTO nella pagina (formato prodotto, dithering offerti, anteprima, rettangolo flint); `platform` serve solo all'etichetta.

## 3. Payload pagina → PKJS

Sempre lo stesso oggetto, sui due trasporti:
```js
payload = {
  v: 1,
  settings: { …12 campi interi validati (§5) },          // SEMPRE presente: dopo il primo Salva il telefono è l'autorità (settingsSet)
  order: [slot…],                                        // SEMPRE: ordine finale delle tessere (foto dell'album tenute + estranee tenute + nuove), senza duplicati
  deleted: [slot…],                                      // SEMPRE (anche []): slot dell'album o estranei che l'utente ha eliminato
  photos: [ { slot, photo_id, fmt, len, crc, data, name, thumb? } … ]   // SOLO foto nuove (una voce per foto, nel formato dell'orologio)
}
```
- `slot` 0..11 = primo slot libero (§4.4); `photo_id = (crc32(raw) & 0x7FFFFFFF) || 1` (31 bit, mai 0, come il dev server); `fmt = state.fmt`; `len` 34.200 (fmt 1) o 3.024 (fmt 2); `crc` = CRC-32 zlib del raw, **senza segno** (0..2³²−1); `data` = base64url senza padding del raw (45.600 caratteri per raw6, 4.032 per raw1); `name` = nome del file troncato a 64 caratteri (`album.js` tronca comunque); `thumb` = data-URL JPEG (o PNG) 50×57, ≤ 6.000 caratteri, altrimenti omessa (§4.6).
- Il PKJS applica il payload come **delta** (`album.applyPayload(payload, {full:false})`, S5b): `deleted` svuota gli slot e accoda `ALBUM_DELETE`, `order` sostituisce l'ordine (gli slot senza foto locale vengono ignorati dall'album; quelli estranei restano visibili perché `plan()` li accoda), `photos` aggiunge/sostituisce; foto nuova su uno slot appena eliminato è ammessa (bug A di S5b corretto). Una foto eliminata e una nuova nello stesso slot nello stesso Save è quindi valida.
- **Formato per orologio**: la pagina produce solo `state.fmt`. Chiude il punto `[9]` di `PIANO.md` §7 ("payload a due voci con quota su un solo formato"): non accade più per costruzione; `applyPayload` resta com'è.

**Trasporto** (funzione unica `transport` in `page.js`, con `GalPage.setNavigate(fn)` per test e gate — di default `fn = function (url) { location.href = url; }`):
- **dev** (`return_to` presente in `location.search`, percent-decodificato): `POST /save` (stesso server della pagina, URL relativo, `Content-Type: application/json`, corpo = payload) → risposta `{ok:true, seq}` → `navigate(return_to + encodeURIComponent(JSON.stringify({v:1, dev:true, seq:seq})))`. POST fallito (rete, `ok:false`, status ≠ 200) ⇒ messaggio in pagina, nessuna navigazione. Il PKJS (`webviewclosed` con `dev`) rilegge `GET /save.json` = il payload salvato (§6) e lo applica come delta.
- **telefono** (nessun `return_to`): `navigate('pebblejs://close#' + encodeURIComponent(JSON.stringify(payload)))`. Il PKJS: `parseResponse` (già in `index.js`: `charAt(0) === '{' ? JSON.parse : JSON.parse(decodeURIComponent)`).
- **prova** (nessun `return_to` **e** `location.protocol` è `http:`/`https:`/`file:`): non si naviga: la pagina mostra "modalità prova: payload di N KB (non inviato)" e conserva il payload in `GalPage.lastPayload` (per il gate nel browser).
- **Annulla**: dev ⇒ `navigate(return_to)` (query vuota ⇒ `webviewclosed` con risposta vuota ⇒ "pagina chiusa senza modifiche"); telefono ⇒ `navigate('pebblejs://close#')`; prova ⇒ messaggio.
- Tetto: `kb = Math.ceil(JSON.stringify(payload).length / 1024)`; se `kb > state.cap_kb` il pulsante Salva è disabilitato e la pagina dice quante foto togliere ("Troppi dati per un solo invio (N KB su M): togli K foto o salva in più volte"). Il contatore è sempre visibile ("Da inviare: N KB / M KB").

## 4. `pipeline.js` (puro, byte-esatto con `tools/photo_prep.py`)

Porting **funzione per funzione** di `photo_prep.py` (leggerlo per intero: costanti `SUN_RGB`, `PAL_RGB`, `tone_lut`, `pack6`, `pack1`, `build_sun_lut`, `_quant_raw`, `dither_fs`, `dither_bayer`, `dither_none`, `to_gray16`, `dither1_fs`, `dither1_atkinson`, `dither1_none`, `fit_rect`, `crop_rect`, `flint_rect`, `_jsround`). Regole numeriche: interi JS a 32 bit (`|0` dove serve), `>>` aritmetico = floor come in Python (anche su negativi: `er * 7 >> 4` = `(er*7)>>4`), la LUT 32³ in **virgola mobile** (`R = r * 255 / 31`, distanza euclidea, primo minimo stretto in ordine k = 0..63), `Math.round` per la LUT di tono (Python usa `_jsround = floor(x+0.5)` proprio per coincidere con `Math.round` sui positivi). Tono: su emery la LUT si applica **per canale prima** del dithering (`px.translate(tone)`); su flint il grigio si calcola dai byte **non tonati** e la LUT si applica al grigio (`to_gray16`). Fixed point ×16, clamp 0..4080, `>>4`, serpentine (righe pari da sinistra), errore su due righe con margine (cur/nxt di `(w+2)*3`).

```js
GalPipeline = {
  EMERY_W: 200, EMERY_H: 228, FLINT_W: 144, FLINT_H: 168, RAW6_BYTES: 34200, RAW1_BYTES: 3024,
  SUN_RGB: [[r,g,b] × 64], PAL_RGB: [[r,g,b] × 64], SUN_LUT_CRC32: 0x48CBD990,
  toneLut(gamma, lift) → Uint8Array(256),                       // = tone_lut; gamma > 0, 0 ≤ lift ≤ 1 (clamp, mai NaN)
  applyTone(rgb, tone) → rgb (in place),                         // byte RGB piatti
  rgbaToRgb(rgba, w, h) → Uint8Array(w*h*3),                    // scarta alpha (la pagina disegna su fondo bianco)
  buildSunLut() → Uint8Array(32768) (memoizzata),  quantRaw(r, g, b) → 0..63,
  ditherFs(rgb, w, h, lutOrNull) → Uint8Array(w*h) di indici,   // idem ditherBayer, ditherNone
  pack6(idx, w, h) → Uint8Array(w*h*3/4)  (w multiplo di 4; 200 → 150 B/riga),
  toGray16(rgb, w, h, tone) → Int32Array(w*h),
  dither1Fs(g, w, h) → Uint8Array bit (g modificata),  dither1Atkinson, dither1None,
  pack1(bits, w, h) → Uint8Array(ceil(w/8)*h)  (MSB-first, 1 = bianco, 18 B/riga per 144),
  crc32(bytes, prev?) → intero senza segno (zlib; stessi vettori di crc.js: 'abc' … ; self-contained, niente require),
  b64url(bytes) → stringa senza padding (stesso alfabeto/risultato di b64.js: verificato nei test),
  fitRect(sw, sh, aw, ah) → {w, h},  cropRect(sw, sh, argOrNull) → {x, y, w, h},  flintRect(rect) → {x, y, w, h},
  photoId(rawBytes) → (crc32 & 0x7FFFFFFF) || 1,
  encodeEmery(rgb200x228, {gamma, lift, dither: 'fs'|'bayer'|'none', sunlight: bool}) → {idx, raw, len: 34200, crc, photo_id},
  encodeFlint(rgb144x168, {gamma, lift, dither: 'fs'|'atkinson'|'none'}) → {bits, raw, len: 3024, crc, photo_id},
  previewRgba(idx, w, h, sunlight, scale) → Uint8ClampedArray RGBA (w·scale × h·scale, pixel replicati),   // sunlight ⇒ SUN_RGB, altrimenti PAL_RGB
  preview1Rgba(bits, w, h, scale) → idem (1 = bianco 255, 0 = nero)
}
```
`encodeEmery` = `applyTone` (copia, non modifica l'input) → dither → `pack6` → `crc32` → `photoId`. `encodeFlint` = `toGray16` → dither1 → `pack1` → `crc32` → `photoId`. Prestazioni: FS su 45.600 px < 60 ms, `buildSunLut` < 80 ms (una volta). Nessuna allocazione in cicli interni. Il test di round trip (§8) confronta i CRC32 con quelli di `photo_prep.py` sulla stessa immagine 200×228 / 144×168 già ridimensionata, per ogni dithering, con/senza LUT sunlight e con più (gamma, lift).

## 5. `page_core.js` (puro) e regole della UI

> **Rimando (17/09/2026)**: l'elenco delle API di `GalPageCore` qui sotto è vivo; la **UI di oggi** non è più
> quella di S6 e sta nelle revisioni **UX-2** e **UX-3** in fondo a questo documento (struttura della pagina,
> editor, tessere, piè di pagina) e in `galleria-s13-ux-casual.md` §13–§14. I sei punti raccolti sotto
> «§5 bis» restano come storia della pagina appena nata.

```js
GalPageCore = {
  SETTINGS_FIELDS: [[nome, min, max, default] × 12]   // S8-stile e S10: digit_style e lang comprese (page_core.js:28-32)  (= album.js SETTINGS_FIELDS: layout 0-1/0, font 0-5/0, clock_mode 0-2/0, leading_zero 0-2/0,
                     text_color 0-4/0, outline 0-2/0, interval_min 0-1440/30 (valori ammessi 0,5,15,30,60,180,1440), order 0-1/0, shake_next 0-1/1, info_row 0-15/15,
                     digit_style 0-3/0 (S8-stile) e lang 0-6/0 (S10/D31 byte 13, S11/D39: 5 es, 6 pt), in coda: l'ordine dell'array non è quello dei byte),
  INTERVALS: [0, 5, 15, 30, 60, 180, 1440],  MAX_SLOTS: 12,  MAX_THUMB_CHARS: 6000,  MAX_NAME: 64,
  decodeState(hashString) → state normalizzato (default per ogni campo mancante; mai lancia; `ok:false` + `error` se l'hash non è valido),
  b64urlToBytes(str) → Uint8Array,  utf8Decode(bytes) → string,   // per l'hash
  normalizeSettings(obj) → {12 campi} (fuori intervallo ⇒ default del campo; interval_min non in INTERVALS ⇒ 30; font 3 con layout 1 ⇒ font 0; font 3 (LECO) ⇒ digit_style 0),
  buildTiles(state) → [tile…]   // tessere iniziali: per ogni slot in state.order con foto ⇒ {slot, kind:'album', name, thumb, hasFmt: !!fmts[state.fmt], pending: crc diverso da watch.slots[slot].crc o slot non VALID};
                                // foto dell'album fuori da order ⇒ accodate; poi watch.foreign (non in deleted) ⇒ {slot, kind:'foreign'}; slot in state.deleted esclusi
  freeSlot(tiles, deleted) → slot   // primo 0..11 non usato da nessuna tessera; preferisce gli slot MAI usati a quelli appena eliminati; -1 se pieno
  buildPayload(model) → payload (§3)   // model = {settings, tiles (ordine finale), deleted, added: [{slot, photo_id, fmt, len, crc, data, name, thumb}]}
  payloadKb(payload) → intero (ceil(JSON.stringify(payload).length / 1024)),
  capMessage(kb, capKb, nAdded, T) → string | null,   // S10: T facoltativo, ripiego inglese cablato senza dizionario
  thumbFits(dataUrl) → bool (≤ 6000 caratteri e inizia con 'data:image/'),
  truncateName(name) → ≤ 64 caratteri,
  SLOW_BASE_MS: 400, SLOW_PER_PHOTO_MS: 100,     // D27 (05/09): la soglia non e' piu' fissa ma PROPORZIONALE alle foto valide
  slowThresholdMs(watch) → 400 + 100 * n        //   n = slot con state === 1 (page_core.js:17, :254); SLOW_OPEN_MS non esiste piu'
  capForUa(cap, ua, nav) → cap | min(cap, 200)   // tetto del payload: 200 KB su iOS (userAgent iPhone/iPad/iPod, o iPadOS «MacIntel» con touch), altrimenti cap (900 se cap non è un intero > 0)
  NEXT_PHOTO_KB: { 1: 52, 2: 10 },               // UX-3/D117: costo della PROSSIMA foto per formato
  DEFAULTS_CRC: 0x7EE7, settingsDiffer(watch) → bool   // UX-2/D82: l'orologio si e' gia' fatto le sue impostazioni
  LANGS, langName(code), effectiveLang(settings, lang_auto), dec(v, lang),   // S10/D35 + S11/D39 (sei lingue)
  secondsText(ms, lang) → '2,2'                  // un decimale, separatore per lingua (en '.', le altre ','; 1001 ⇒ '1,0', mai '1')
  slowSeconds(watch, lang) → '2,2' | null        // null se openMs manca/e' null/e' 0/non supera slowThresholdMs(watch)
}
```

**UI (`page.html` + `page.js`)** — una colonna, italiano (🔁 oggi **sei lingue** dal dizionario: meccanismo S10/D35, es e pt da S11/D39), pulsanti ≥ 40 px di altezza, testo ≥ 14 px, nessun hover-only.
> ⚠️ I sei punti qui sotto descrivono la pagina **come nacque in S6** (testi italiani cablati, un solo blocco «Impostazioni», anteprime PNG dei font). Da allora l'hanno cambiata S10 (testi dal dizionario), S12 (anteprima della watchface) e soprattutto **UX-1, UX-2 e UX-3**: la **struttura di oggi** — sezioni «Aspetto dell'ora» e «Cambio foto», «Altre impostazioni» a fisarmonica, anteprima a grandezza naturale, niente PNG dei font (UX-2) e, per i punti **3 (editor)** e **6 (piè di pagina)**, l'editor con «Regolazioni della foto» e l'anteprima della watchface sotto la cornice, la ✕ a due tocchi e i due pulsanti che **cambiano nome invece di spegnersi** (UX-3) — è nelle sezioni **«Revisione UX-2»** e **«Revisione UX-3»** in fondo a questo documento: vince la **più recente** ogni volta che le due cose divergono.

### §5 bis — la pagina come nacque in S6 (storia)

1. **Intestazione**: "Galleria" + etichetta orologio (`emery` ⇒ "Pebble Time 2 · 200×228 a colori", `flint` ⇒ "Pebble 2 Duo · 144×168 bianco e nero", altrimenti "orologio sconosciuto: preparo foto a colori") + contatore "Da inviare: N KB / M KB" + eventuale avviso stato/prova + (v1.9) **avviso di avvio lento** `#slow` (classe `warn`, nascosto di default): compare solo se `watch.openMs > SLOW_OPEN_MS` e dice «Galleria si avvia lentamente (X s). Non è un guasto: la memoria dell'orologio si è riempita di vecchi dati.» seguito dalla procedura in 4 passi (apri l'app Pebble → tocca Galleria nell'elenco delle app → scegli Rimuovi (non Aggiorna) → reinstalla Galleria) e dalla rassicurazione «Le tue foto sono al sicuro nel telefono e torneranno da sole sull'orologio in circa un minuto.». 🔁 **Superato due volte**: la soglia è proporzionale dalla D27 (`slowThresholdMs` = 400 + 100 × n, §5) e da **UX-2/D81** il riquadro tiene **una frase sola** (`slow_lead`) più il pulsantino «Aiuto»: `#slowFix` resta vuoto e la procedura sta **una volta sola** nella sezione `#help` in fondo alla pagina. La procedura è **una sola stringa nel JS** (`FIX_STEPS`/`FIX_TAIL` di `page.js`, costruita nel DOM in `#slowFix` e `#helpFix`): non è duplicata nell'HTML, che ha il tetto di 64 KB.
2. **Foto** (`#photos`): tessere in ordine (miniatura 50×57 mostrata a 100×114 con `image-rendering: pixelated`; senza miniatura un riquadro grigio con "slot k"), nome, badge "da inviare" (`pending`), "sull'orologio" (`foreign`), "manca il formato per questo orologio: elimina e aggiungi di nuovo" (`!hasFmt`), "nuova" (aggiunte in questa sessione); pulsanti ▲ ▼ (riordino, disabilitati agli estremi) e ✕ (elimina: le tessere `album`/`foreign` vanno in `deleted`, le `new` vengono scartate e il loro slot liberato). Pulsante **"Aggiungi foto"** (`<label>` su `<input type="file" accept="image/*" id="file">`, **senza** `capture`; testo di aiuto "scegli dalla Libreria"), disabilitato con 12 tessere ("album pieno: elimina una foto").
3. **Editor** (`#editor`, visibile dopo la scelta del file):
   - caricamento con `createImageBitmap(file, {imageOrientation: 'from-image'})` dentro try/catch e fallback `new Image()` + `URL.createObjectURL` (+ `revokeObjectURL`); file non decodificabile ⇒ messaggio, editor chiuso;
   - **cornice fissa** con rapporto 200:228 (larghezza = min(larghezza utile, 300) px), immagine che **si sposta e si ingrandisce sotto** la cornice: `view = {scale, tx, ty}` (crop sorgente = `{x: -tx/scale, y: -ty/scale, w: Fw/scale, h: Fh/scale}`), vincoli: la cornice è sempre coperta (scale ≥ cover, traslazione limitata); drag con Pointer Events (`pointerdown/move/up`, `setPointerCapture`; fallback touch/mouse se `PointerEvent` manca), pinch con due puntatori (scala attorno al punto medio), rotellina (scala attorno al cursore), slider zoom `#zoom` (1×…4× rispetto a cover) e pulsante "Adatta" (cover centrato). Con `fmt === 2` sopra la cornice si disegna il rettangolo **flint** = `flintRect` (sotto-rettangolo centrato 144:168) tratteggiato; con `fmt === 1` non si mostra;
   - **ridimensionamento** del crop a 200×228 (e, per flint, del sotto-rettangolo a 144×168) con dimezzamenti successivi su canvas (`docs/ricerca/galleria/05` §1.2 A: `drawImage` a metà finché ≥ 2×, poi passo finale; `imageSmoothingEnabled = true`, `imageSmoothingQuality = 'high'` dove esiste) su **fondo bianco** (`fillStyle = '#fff'` prima di `drawImage`), `getContext('2d', {willReadFrequently: true})`; ricalcolato solo quando cambia il crop (drag/zoom), con debounce 150 ms;
   - controlli: "Luminosità (gamma)" slider 0,50–2,00 passo 0,05 default 1,00 (**valore = gamma**: < 1 schiarisce); "Schiarisci le ombre (lift)" slider 0–0,30 passo 0,01 default 0; **Dithering**: `fmt 1` ⇒ Floyd–Steinberg / Bayer 4×4 / Nessuno (default FS), `fmt 2` ⇒ Floyd–Steinberg / Atkinson / Nessuno (default FS); checkbox "Ottimizza per il vetro" (solo `fmt 1`, default OFF ⇒ LUT sunlight nel dithering); toggle anteprima "come sul vetro" (default ON: colori `SUN_RGB`) / "colori nominali" (`PAL_RGB`) — solo anteprima, non cambia i byte;
   - **anteprima ×2** (`#preview`, canvas 400×456 o 288×336, CSS `width: 100%; max-width: 400px; image-rendering: pixelated`), ricalcolata con debounce 150 ms a ogni cambio di slider/opzione (encode < 100 ms);
   - pulsanti "Aggiungi all'album" (⇒ `encode*` finale, `photo_id`, miniatura §4.6, tessera `new`, editor chiuso, contatore aggiornato) e "Annulla" (editor chiuso, nulla aggiunto). Un solo editor per volta; si può aggiungere finché ci sono slot liberi.
4. **Impostazioni** (`#settings`, id `s_<campo>`): Layout (select: "Un terzo con riga info" 0 / "Tutto schermo" 1); Font (select: Anton 0, Bebas Neue 1, Barlow Condensed 2, "LECO (sistema, solo layout Un terzo)" 3, "Francois One" 4, "Staatliches" 5 — S8-stile: l'opzione 3 è disabilitata e, se selezionata, torna a 0 quando il layout è 1); con `GalPreviews` presente, accanto al font l'anteprima PNG del font scelto (chiavi `anton`/`bebas`/`barlow`/`francois`/`staatliches`, le stesse di `gen_font_previews.py`; senza chiave l'immagine resta nascosta); **Stile cifre** (`s_digit_style`, subito dopo il Font: pieno 0 / trasparente (solo contorno) 1 / trasparente 3D (contorno + ombra) 2 / pieno 3D (con ombra) 3; disabilitato e riportato a 0 con il font LECO, che non ha sprite); Formato ora (auto 0 / 12 h 1 / 24 h 2); Zero iniziale (auto 0 / sì 1 / no 2); Intervallo foto (select: mai 0, 5 min, 15 min, 30 min, 1 h, 3 h, 1 giorno); Ordine (sequenziale 0 / casuale 1); Scossa = foto successiva (checkbox → 0/1); Colore testo (auto 0, bianco 1, nero 2, giallo pastello 3, blu Oxford 4); Contorno (auto 0, sempre 1, mai 2; **disabilitato**, con il valore conservato, quando lo stile cifre è 1 o 2: negli stili trasparenti l'anello c'è sempre); Riga info: 4 checkbox (passi bit0, batteria bit1, data bit2, Bluetooth bit3 → `info_row`). Con `settingsSet === false` una riga dice "Impostazioni non ancora salvate: l'orologio usa le sue finché non salvi".
5. **Aiuto** (`#help`, v1.9, in fondo alla pagina, prima del piè di pagina): sezione **sempre visibile** con un pulsante `#helpBtn` (`.btn.small`, `aria-expanded`/`aria-controls`) intitolato "Galleria si avvia lentamente?" che apre e chiude `#helpBody` (ripiegato di default; niente `<details>`: il toggle è esplicito, si prova nel DOM finto dei test e non dipende dal supporto del browser). Dentro: la stessa procedura in 4 passi dell'avviso e una riga (`#helpWhy`) che spiega **perché** succede (l'orologio tiene da parte anche i dati vecchi finché la memoria non è piena e la watchface deve rileggerli a ogni avvio) e che **con questa versione capita molto più di rado**.
6. **Piè di pagina** (`#footer`, sticky in basso): "Salva" (`#save`, primario; disabilitato sopra il tetto o mentre l'editor è aperto), "Annulla" (`#cancel`), messaggio `#msg`.

### Regole, id stabili e miniatura — le parti di §5 ancora valide

Regole: nessuna dipendenza esterna; nessun `alert/confirm/prompt` (i test girano senza); tutte le stringhe visibili dal **dizionario** (S10: chiavi `T(…)`/`data-i18n`, italiano di riferimento in `i18n/messages.json`); gli elementi della pagina hanno `id` stabili (elencati sopra + `#tiles`, `#add`, `#file`, `#crop` (canvas cornice), `#zoom`, `#gamma`, `#lift`, `#dither`, `#sunlight`, `#previewMode`, `#preview`, `#addOk`, `#addCancel`, `#kb`, `#head`, `#status`, `#slow`, `#slowLead`, `#slowFix`, `#help`, `#helpBtn`, `#helpBody`, `#helpWhy`, `#helpFix`; **UX-3**: `#editName`, `#cropWrap`, `#editPrevCap`, `#addRow` (la coppia inline `#addOk`/`#addCancel` resta nel markup, nascosta ma con gli id e i listener intatti, D119), `#editAdvBtn`, `#editAdvBody`, `#etime`, `#hint`); `page.js` espone `window.GalPage = { state, tiles, added, deleted, setNavigate(fn), lastPayload, buildPayload(), addFile(file) (usabile da test), version }` per test e gate. Niente `console.log` in ciclo; un `try/catch` attorno a inizializzazione e Salva con messaggio in `#msg` (mai pagina bianca).

**4.6 Miniatura**: dal risultato finale (`idx` o `bits`) si disegna su un canvas 50×57 (`drawImage` del canvas d'anteprima 200×228/144×168 con smoothing) e `toDataURL('image/jpeg', 0.7)`; se > 6.000 caratteri ⇒ 0,5 poi 0,3; se il browser non produce JPEG (`data:image/png` restituito) e supera i 6.000 ⇒ miniatura omessa. Colori `SUN_RGB` (come sul vetro).

## 6. Dev server (`tools/galleria_devserver.py`, modifiche S6)

> **Nota (17/09/2026)**: i sette punti qui sotto sono tutti fatti — i primi sei nel dev server, il settimo in `tools/README.md`
> §11, che è anche la documentazione **viva** di opzioni, endpoint e flussi; qui resta il contratto con cui furono scritti.

Oggi (S5b): `--album` converte le foto in un pool e `/state.json` è un payload **`full: true`**; `POST /save` accetta `{settings?, order?, photos?: [{slot, src}], scenario?}`; `/save.json` = alias di `/state.json`; `/config.html` = pagina di prova incorporata (`PAGE_HTML`) o `--page FILE`. Da aggiungere, **senza rompere** la pagina di prova, `--selftest` (148 controlli allora; oggi **257**, come dice `tools/README.md` §11), `test_devpage.js` e i flussi di S5b:
1. **`--page-dir DIR`** (esclusivo con `--page`): a ogni `GET /config.html` la pagina viene inlinata da `DIR` con `build_config_page.inline_page(DIR)` (import dal `tools/` accanto: `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))`, import pigro dentro il handler); errore di inlining ⇒ 500 con il messaggio in chiaro (testo) e riga su stderr; DIR inesistente ⇒ errore di `argparse` (exit 2). `--dump-page` rispetta `--page-dir`.
2. **Modalità relay**: `/state.json` = `{v: 1, seq, hooks: {scenario}}` **senza `full`** e senza `photos`/`order`/`deleted` (il PKJS lo applica come delta vuoto: nessuna eliminazione implicita — F10); `--settings` dato ⇒ aggiunge `settings` (delta). Attivata da **`--relay`** esplicito oppure **automaticamente da `--page-dir` senza `--album`** (il caso del gate); `--relay` con `--album` è un errore. Il server «nudo» (né `--album` né `--page-dir`) resta `full: true` con 0 foto come in S5b — `test_devpage.js` lo pretende — e all'avvio stampa un avviso in due righe («applicato dal PKJS CANCELLA TUTTI gli slot … usare --relay»). Con `--album` tutto resta `full: true`.
3. **`POST /save` in modalità pagina**: riconosciuta da **`'deleted' in body`** (la pagina lo manda sempre, anche `[]`; i POST della pagina di prova non lo hanno). Validazione severa (400 con messaggio chiaro, come oggi): `v == 1`; `deleted` lista di interi 0..11 senza duplicati; `order` lista di interi 0..11 senza duplicati; `settings` via `validate_settings_patch` (tutti e 10 i campi presenti); `photos` lista ≤ 12 di oggetti con **tutti** i campi `slot` (0..11, senza duplicati e non in `deleted`… no: ammesso anche in `deleted` — foto nuova su slot appena eliminato), `photo_id` (int 1..2³¹−1), `fmt` (1|2), `len` (34.200 per 1, 3.024 per 2), `crc` (int 0..2³²−1), `data` (stringa base64url senza padding di lunghezza `ceil(len*4/3)`, decodificabile a `len` byte con `zlib.crc32 == crc`), `name` (stringa ≤ 64), `thumb` (opzionale, stringa ≤ 6.000 che inizia con `data:image/`); campi sconosciuti ⇒ 400. Esito: `last_payload = body`, `seq += 1`, risposta `{ok: true, seq}`. Il corpo può arrivare a ~600 KB: il limite attuale (8 MiB) basta.
4. **`GET /save.json`**: in modalità pagina = `last_payload` + `seq` + `hooks` (**senza `full`**); prima di qualsiasi Save (o in modalità pool) come oggi. Un Save della pagina di prova (modalità pool) dopo uno della pagina vera riporta `/save.json` allo stato del pool (documentare).
5. In modalità pool un POST della pagina vera viene accettato lo stesso (utile per i test) ma al riavvio del PKJS `/state.json` full del pool torna autorità: scriverlo in `tools/README.md` §11.
6. `--selftest`: nuovi controlli (relay `/state.json` senza `full` e senza `photos`; `--settings` in relay; POST pagina valido ⇒ 200 + `/save.json` lo rende senza `full`; ogni regola di validazione con un caso negativo: CRC sbagliato, `len` sbagliato, `data` troppo corta, `thumb` troppo lunga, `name` troppo lungo, slot duplicato, campo sconosciuto, `deleted` con 12; `--page-dir` con una cartella temporanea (pagina minima con `<script src>` e `<link>`; file mancante ⇒ 500; `data-optional`); `--page` e `--page-dir` insieme ⇒ errore). `--dump-json state` in relay.
7. `tools/README.md` §11: nuove opzioni/endpoint/flusso S6 (schema dello stato nell'hash e del token di ritorno).

## 7. `tools/build_config_page.py`

Solo stdlib (Python 3.8+). **S10**: `inline_page`/`build_module` accettano anche `messages=` (default: `i18n/messages.json` accanto alle sorgenti) e prima del lint eseguono il **passo i18n** — `i18n_pass(html, messages)` sostituisce `T('chiave'` con `T(<indice>` e `data-i18n(-title)="chiave"` con l'indice, dove l'indice è la posizione della chiave in `messages.json` (la stessa degli array di `i18n.js`); una chiave che non esiste è un errore con numero di riga, e se nella pagina non c'è nessuna chiave il file dei messaggi non viene nemmeno aperto. ⚠️ La sostituzione guarda **tutto** l'HTML finito: un `T('nome')` scritto in un commento a fine riga (che lo strip non toglie) viene convertito lo stesso, e se il nome non esiste fa fallire la generazione. API: `inline_page(dir_path, entry='page.html', warn=None, strip=True, messages=None) -> str` (HTML inlinato, regole §1; lancia `PageBuildError(msg)`; `warn` per gli avvisi non fatali), `page_size_check(html) -> None|str`. Impl.: se l'inlining fallisce il `config_page.js` precedente resta sul disco (il tool lo dice): `make -C test pagecheck` prima di ogni `pebble build`. CLI: `--dir apps/galleria/src/pkjs/config` (default: relativo alla posizione del tool, cioè `../apps/galleria/src/pkjs/config`), `--out apps/galleria/src/pkjs/config_page.js` (default idem), `--html-out FILE` (opzionale: scrive anche l'HTML inlinato, per aprirlo nel browser), `--check` (rigenera in memoria e confronta con `--out`: exit 0 se identico, 1 se diverso o assente, con messaggio), `--selftest` (cartella temporanea: inlining, ordine — da UX-2/D95 la coppia sotto esame è `preview.js` prima di `page.js`, i due vicini rimasti in `SCRIPT_ORDER` —, file mancante, `data-optional` provato con un nome neutro (`extra.js`), `</script>` nel contenuto ⇒ errore, dimensione > **96 KB** ⇒ errore, output riproducibile: due esecuzioni ⇒ stesso file byte a byte). **S12/D43**: `MAX_BYTES` **96 KB** (98.304 B) e `SOFT_BYTES` **84 KB** (86.016 B) — erano 64 e 60, e 80/72 nella prima stesura di S12; i messaggi ricavano le cifre dalle costanti, il selftest le pinna a mano (`'x' * 100000` oltre il tetto, `'x' * 88000` fra obiettivo e tetto). Output `config_page.js`:
```js
/* GENERATO da tools/build_config_page.py (S6): non modificare a mano. Sorgenti: src/pkjs/config/. Dimensione HTML: N B. */
module.exports = "…";   // json.dumps(html, ensure_ascii=True): solo ASCII, una riga
```
Riproducibile (nessuna data). Stampa la dimensione dell'HTML e del `.js`. Esit 1 con messaggio chiaro su ogni errore, mai traceback.

## 8. Test (host, `make -C test`)

- **`test/gen_page_fixture.py`** (importa `tools/photo_prep.py` come modulo via `sys.path`; solo stdlib + le funzioni del tool, **niente Pillow**): genera `test/fixture_page.js` (`module.exports = {...}`): immagine sintetica 200×228 RGB deterministica (gradienti + bande + rumore LCG come `make_fixture_data`, tutti e 256 i livelli presenti su ogni canale, zone sature e neutre) in base64 dei byte RGB piatti, e una 144×168 per flint; per emery: per ogni `dither ∈ {fs, bayer, none}` × `sunlight ∈ {false, true}` × `(gamma, lift) ∈ {(1,0), (0.8,0.1), (1.6,0.3)}` ⇒ `{crc32 del raw6, photo_id}` e, per un caso, il raw6 intero in base64url (pin di `pack6` + `b64url`); per flint: `dither ∈ {fs, atkinson, none}` × le stesse 3 coppie ⇒ crc32 del raw1 (+ un raw1 intero); `toneLut` per le 3 coppie; `SUN_LUT_CRC32`; casi di `fit_rect`/`crop_rect`/`flint_rect`. `--check` verifica che la fixture su disco sia aggiornata. Lento va bene (< 60 s).
- **`test/test_pipeline.js`** (node, `NODE_PATH=shim` non serve): carica `src/pkjs/config/pipeline.js`, `test/fixture_page.js`, `src/pkjs/crc.js`, `src/pkjs/b64.js`, `test/fixtures/rt.idx|rt.raw6|rt.bits|rt.raw1` (fixture del test C: `pack6`/`pack1` su 40×12 e 24×8 devono dare `rt.raw6`/`rt.raw1` byte a byte); round trip di ogni combinazione (CRC uguale ⇒ raw uguale); `toneLut` = fixture; `quantRaw` ai bordi (q(v) = min(3, (v+42)//85): 42→0, 43→1, 127→1, 128→2, 212→2, 213→3, 255→3 — le soglie 84|85 scritte nella prima stesura erano sbagliate); `buildSunLut` CRC = 0x48CBD990 (la LUT NON è monotona lungo i grigi: il colore di resa più vicino può essere un colore, niente test di monotonia); `crc32` = `crc.js` su vettori; `b64url` = `b64.encode` su byte casuali (incluse lunghezze ≡ 0,1,2 mod 3); `photoId` (0 ⇒ 1, bit 31 azzerato); `previewRgba` scala/colori; mutation testing a mano di ≥ 8 mutanti (serpentine spenta, `>>4` → `/16`, clamp mancante, pesi FS scambiati, tono dopo il dithering, LUT in interi, `pack6` con ordine dei bit invertito, gray con pesi diversi) che DEVONO far fallire il test. Esito: "test_pipeline: N ok, M fail", exit 1 se fail.
- **`test/test_page.js`** (node): `page_core.js` puro (decodeState con hash valido/assente/rotto/`città`, normalizeSettings, buildTiles con foto, foreign, deleted, fmts mancante, pending; freeSlot; buildPayload; payloadKb; capMessage; truncateName; thumbFits) e `page.js` in `vm.runInNewContext` con un DOM finto sul modello di `test/test_devpage.js` (getElementById per id, createElement, appendChild, textContent, value, checked, disabled, classList minimo, addEventListener/dispatch a mano, `canvas.getContext('2d')` finto con `drawImage` no-op, `getImageData` che restituisce un `ImageData` deterministico, `toDataURL` che restituisce `data:image/jpeg;base64,AAAA`, `createImageBitmap` finto, `XMLHttpRequest` finto che registra i POST e consegna a `flush()`, `location` finta con `hash`/`search`/`protocol`): rendering delle tessere dallo stato, ▲▼✕ ⇒ `order`/`deleted`, aggiunta via `GalPage.addFile(file)` con encode vero (pipeline reale sui pixel finti) ⇒ tessera `new`, `photo_id`/`crc`/`len`/`data` coerenti, slot libero, Salva dev ⇒ un solo POST `/save` con payload completo + `navigate(return_to + token)`, Salva telefono ⇒ `pebblejs://close#` + JSON percent-encoded parsabile, Annulla nei due casi, tetto KB ⇒ Salva disabilitato + messaggio, LECO disabilitato con layout B, `settingsSet false` ⇒ avviso, album pieno ⇒ "Aggiungi" disabilitato, errori (POST 500 ⇒ messaggio e nessuna navigazione; file non decodificabile). Esito come sopra.
- **`Makefile`** (di proprietà dell'orchestratore): `JSTESTS` include `test_pipeline.js test_page.js`; `all` = i `run-<test C>` più `pyselftest jstest devtest dumbtest pagecheck glosscheck logstats cards`. **`pagecheck`** (da lanciare prima di ogni `pebble build`) esegue in quest'ordine `build_i18n.py --check` (**S10**: per primo), `build_config_page.py --check`, `gen_page_fixture.py --check`, `gen_digits.py --check` per le maschere (con il Python del pebble-tool: se manca, il passo è saltato con un avviso) e `gen_preview_fixture.py --check`; **UX-2/D95: `gen_font_previews.py --check` è uscito dalla lista**. **`glosscheck`** (**UX-4/D132**) confronta chiave per chiave il glossario di `galleria-s10-i18n.md` §3 con `i18n/messages.json`. Fuori da `all`: `browsertest` (`tools/galleria_browser.py --selftest`) e `mutants`. I conteggi dei test non stanno qui: vivono nelle revisioni in fondo al documento.

## 9. `tools/galleria_browser.py` — Firefox headless via WebDriver (solo stdlib)

Verificato il 29/08: `geckodriver` (`/snap/bin/geckodriver`, Firefox 154 snap) accetta sessioni headless (`moz:firefoxOptions.args = ['-headless', '-width', '500', '-height', '900']`; impl.: sotto 500 px la larghezza viene ignorata da Firefox/GTK → il comando `narrow URL 400` carica la pagina in un iframe da 400 px), naviga `data:` e `http:`, esegue script, fa screenshot (base64 nella risposta: nessun accesso a file) e imposta `<input type=file>` con un percorso **sotto `$HOME` e fuori dalle cartelle nascoste** (snap: né `/tmp` né i dot-dir come `~/.cache` sono leggibili — il nome arriva ma `FileReader` dà NotFoundError; usare `~/galleria-gate/photos/`; `set_file` del tool copia da solo in `~/galleria-browser-files/pid<N>/` i percorsi illeggibili e verifica la lettura con `FileReader`). Il tool: classe `Browser` (avvia `geckodriver --port P` su porta libera, `POST /session`, `open(url)`, `title()`, `exec(script, args)`, `find(css)`, `click(css)`, `set_file(css, path)`, `set_value(css, value)` (+ evento `input`/`change` via exec), `text(css)`, `wait_for(css_or_js, timeout)`, `drag(css, dx, dy)` e `wheel(css, dy)` con `POST /actions` (pointer/wheel), `screenshot(path)`, `close()`, tutto con timeout e messaggi chiari) + CLI con sottocomandi o `--script FILE.json` (lista di passi `{cmd, args}`) e `--selftest` (avvia il dev server in relay con una pagina minima in una cartella temporanea, apre `/config.html#<hash>`, verifica titolo e `location.hash`, un `set_file` da `~/.cache/galleria-gate/`, uno screenshot in una cartella temporanea, chiude; salta con messaggio "saltato" ed exit 0 se `geckodriver` o `firefox` mancano). Funzione `emu_config_url(timeout)` che attende e legge l'URL dal file `~/pebble-tool-emu-app-config-*.html` scritto da `pebble emu-app-config` (`content="0;URL=…"`, HTML-unescape). Documentare in `tools/README.md` §12.

## 10. `index.js` (orchestratore)

`showConfiguration`: `state` = `album.state()` + `{v:1, platform, fmt, cap_kb, dev}` (platform da `Pebble.getActiveWatchInfo()` in try/catch, `fmt` = `watch.format` se noto altrimenti 2 se platform === 'flint' altrimenti 1; `cap_kb` = 200 se `Pebble.platform === 'ios'` altrimenti 900) → `b64.encodeUtf8(JSON.stringify(state))` (nuova funzione in `b64.js`: UTF-8 via `unescape(encodeURIComponent(s))`) → hash; DEV ⇒ `Pebble.openURL(dev.base + '/config.html#' + hash)`, telefono ⇒ `Pebble.openURL('data:text/html;charset=utf-8;base64,' + b64.encodeUtf8Std(require('./config_page')) + '#' + hash)` (**S12/D44**: era `charset=utf-8,` + `encodeURIComponent(html)`; il ripiego è rimettere quella riga sola). `webviewclosed` resta (delta + `resync`); log della dimensione del payload. Bundle: **verificato il 17/09/2026** — `src/pkjs/config/*.js` **non** finiscono nel `.pbw`. In `build/pebble-js-app.js` (**367.747 B**) webpack include il solo `config_page.js`: i sorgenti della pagina compaiono unicamente dentro la sua stringa JSON (a capo scritti `\n`, tutto su una riga) e l'unica occorrenza in chiaro di `src/pkjs/config/preview.js` è una riga di commento del modulo generato `digit_masks.js`. Il rimedio previsto (spostare le sorgenti in `src/config_page/`) non è mai servito; nel bundle di oggi il modulo `digit_masks.js` (S12) occupa **≈ 122,2 KB** (121.107 B di sorgente più l'indentazione che webpack aggiunge a ogni riga) e il resto è cresciuto con la pagina inlinata (era 155.066 B a fine S6, `PIANO.md` §5).

## 11. Gate S6 (emulatore + Firefox headless)

1. `python3 ../../tools/build_config_page.py` → `pebble build` (emery+flint verdi, `MEMORY USAGE` annotato) → `make -C test` verde.
2. Dev server in relay: `python3 ../../tools/galleria_devserver.py --page-dir src/pkjs/config` (PID annotato; fermarlo con `kill PID`); `pebble kill; pebble wipe; pebble install --emulator emery --logs > log` in background.
3. `BROWSER=true pebble emu-app-config --emulator emery &` → `galleria_browser.py`: URL dal file temporaneo (`open-emu`) → screenshot della pagina (`narrow URL 400` + `screenshot`; `screenshot-full` per la pagina intera a 500 px) → `set_file` con una foto chiara (landscape, da `~/galleria-gate/photos/`) → cornice/zoom (drag + wheel) → slider → screenshot dell'anteprima → "Aggiungi all'album" → font Bebas + intervallo 5 min → Salva → `/close` ricevuto → log PKJS: `payload delta: ok … nuove [k]`, `resync`, foto in 9 messaggi, `SETTINGS OK`, `ALBUM_ORDER OK` → `pebble screenshot` mostra la foto con Bebas (senza riavvio).
4. Ripetere con una foto scura portrait (testo bianco atteso), una con EXIF orientation 6, una minuscola (120×100: ingrandita) e una da 12 MP (tempo di encode loggato); eliminare una foto e riordinare ⇒ `ALBUM_DELETE`/`ALBUM_ORDER`; Annulla ⇒ "pagina chiusa senza modifiche"; tetto: forzare `cap_kb` basso nell'hash ⇒ Salva disabilitato.
5. **Percorso telefono nel browser**: aprire la pagina come `data:` URL con lo stesso hash (da S12/D44 `open('data:text/html;charset=utf-8;base64,' + b64(html) + '#' + hash)`; prima era `charset=utf-8,` + `quote(html)`), verificare che lo stato venga letto (origine opaca: nessun `localStorage`), impostare `GalPage.setNavigate` per catturare l'URL `pebblejs://close#…`, Salva ⇒ decodificare il payload e darlo a `album.applyPayload` in node (smoke) ⇒ `ok`, CRC uguali.
6. flint: `pebble install --emulator flint`, stessa pagina con `fmt 2` (rettangolo flint, Atkinson), foto raw1 in un messaggio, screenshot.
7. Round trip: `make -C test run-… jstest` verde (test_pipeline = stessa immagine ⇒ stesso raw6/raw1).
Screenshot da conservare in `docs/design/galleria/s6_*.png`.

## 12. Compiti per importanza (regola del progetto)

| Grado | Compito | Modello |
|---|---|---|
| Alta | A1 questa specifica; A2 `pipeline.js`; A3 `page_core.js`/`page.js`/`page.html`/`page.css`; A4 `index.js`/`b64.js`, Makefile, integrazione e build; A5 gate; A6 verifica dei finding e correzioni; A7 documenti | Fable |
| Media | M1 `build_config_page.py`; M2 dev server (relay, `--page-dir`, `/save` pagina, selftest, README §11); M3 `gen_page_fixture.py` + `test_pipeline.js`; M4 `test_page.js`; M5 revisione a 5 lenti + scettici; M6 `galleria_browser.py` | Opus |
| Bassa | B1 `previews.js` (anteprime font, `tools/gen_font_previews.py` da `resources/fonts/*.ttf` con Pillow, 3 PNG 1-bit "12:34" alti 28 px, ≤ 4 KB totali); B2 foto di prova per il gate (`~/galleria-gate/photos/`: 7 JPEG/PNG generati con Pillow dai wallpaper di sistema — chiara landscape, scura portrait, EXIF 6, 12 MP, 120×100, PNG con alpha) | Opus |

## Revisione S7 (30/08/2026) — precisazioni
- **Stato nell'hash**: il campo `v` è obbligatorio e deve valere 1; con `v` assente o diverso `decodeState` torna lo stato di default con `ok:false` ed `error: 'versione dello stato non supportata'` (stesso trattamento dell'hash assente/rotto: avviso e Salva disabilitato). `index.js` manda già `v: 1`.
- **Miniatura facoltativa**: se `toDataURL` lancia (canvas «tainted», memoria) o il PNG supera i 6.000 caratteri, la foto viene aggiunta lo stesso senza `thumb`; il messaggio di conferma dice «, senza anteprima». All'apertura dell'editor la pagina fa `scrollIntoView({block:'start'})` su `#editor` (guardato).
- **Nomi**: il `div.name` della tessera porta `title` con il nome intero (le tessere aggiunte nella sessione tengono il nome non troncato in un campo `full`, solo in RAM; il payload spedisce il nome troncato a 64).
- **Pulsanti disabilitati (#41)**: la regola `.btn.off, .btn[disabled], button[disabled], .tbtns button[disabled]` deve **vincere la cascata** su ogni famiglia di pulsanti (le frecce `.tbtns button` hanno la stessa specificità di `button[disabled]` e stanno più in basso nel foglio: senza il selettore rafforzato restavano su fondo bianco); contrasto composto con l'opacity ≥ 3:1 sui fondi della pagina. `test/test_page.js` §4e lo pinna con un motore minimo di cascata (specificità + ordine) per 5 famiglie di pulsanti: un pulsante nuovo vuole una voce in `FAM_BTN`.
- Budget: HTML inlinato 58.684 B, modulo `config_page.js` 60.540 B (tetto 64 KB; lo strip dei commenti è obbligatorio).

## Revisione v1.9 (04/09/2026) — avviso di avvio lento del persist
Contesto (misure S8 sull'orologio reale, `docs/design/galleria.md` §4): il firmware scandisce tutto il file persist a ogni apertura e non lo ripulisce finché non supera ~615 KB, quindi un file pieno di record morti porta l'avvio della watchface da ~0,3 s a 2–3 s. L'unico rimedio in mano all'utente è **rimuovere e reinstallare** Galleria dall'app Pebble (l'album resta nel telefono e le foto tornano da sole). L'orologio misura l'apertura e la manda nel `HELLO` come `OPEN_MS` (uint16 ms, 0 = non misurato; protocollo v1.9, `galleria.md` §5).
- **PKJS**: `sync.js parseHello` legge `OPEN_MS` → `hello.openMs` (`null` se il campo manca = orologio vecchio, altrimenti `& 0xFFFF`) e lo logga nella riga dell'HELLO (`open=2150ms` / `open=-`); `album.plan()` lo salva nello snapshot `galleria.v1.watch` (`openMs`, `null` se non noto) e `album.state()` lo espone alla pagina insieme ad `at`. Uno snapshot scritto prima della v1.9 resta valido: `_loadWatch` normalizza il campo mancante a `null` (nessun avviso).
- **Pagina**: `#slow` in cima (solo sopra `SLOW_OPEN_MS = 1000` ms — 🔁 **superato da D27**: la soglia è `slowThresholdMs(watch)` = 400 + 100 × n, e `SLOW_OPEN_MS` non esiste più) e `#help` in fondo (sempre); testo e soglia in §5. Riferimenti misurati: ~90 ms con 4 foto e file sano, ~400–800 ms con 12 foto sane, ~2.150 ms con il file gonfio: la soglia lascia fuori il caso normale con 12 foto.
- **Dev server**: `--open-ms N` aggiunge `hooks.open_ms` a `/state.json`; in DEV `index.js` forza `hello.openMs` a quel valore prima di `album.plan()` (in emulatore l'apertura è quasi istantanea e l'avviso non si vedrebbe mai). Senza l'opzione `hooks` resta `{scenario}` come prima.
- **Test**: `test_sync_engine.js` §11b (0, valore, oltre 16 bit, campo assente), `test_album.js` (snapshot, `state()`, mascheratura, album pre-v1.9), `test_page.js` §4f (soglia in `page_core`, avviso nascosto con 0/null/assente/900/1000 e visibile con 1001 «1,0 s» e 2150 «2,2 s», procedura in 4 passi, Aiuto sempre visibile e ripiegabile con `aria-expanded`), `FAM_BTN` con la voce del pulsante Aiuto, selftest del dev server per `--open-ms`.
- Budget dopo la modifica: HTML inlinato **61.043 B**, modulo `config_page.js` **63.016 B** (tetto 64 KB: 2.520 B di margine; l'avviso mostrato non aggiunge byte alla pagina — il testo è costruito nel DOM).

## Revisione S8-stile (04/09/2026) — «Stile cifre» e sei font
Contratto: `docs/design/galleria-s8-stile.md` §5 (D21 stile delle cifre, D22 enum dei font). La pagina guadagna **un campo** e la select Font passa a **6 valori**; il payload §3 resta lo stesso oggetto `settings`, con una chiave in più.
- **`page_core.js`**: `SETTINGS_FIELDS` = 11 voci — `font` diventa `0..5` (0 Anton, 1 Bebas Neue, 2 Barlow Condensed, 3 LECO, **4 e 5 = i due font nuovi**) e in coda arriva `['digit_style', 0, 3, 0]` (stessa posizione di `album.js`: l'ordine dell'array non è quello dei byte del blob, dove `digit_style` è il byte 12). `normalizeSettings` tiene la regola LECO/layout (`font 3` + `layout 1` ⇒ `font 0`) e **poi** azzera lo stile se il font è ancora LECO (`font === 3` ⇒ `digit_style = 0`): un blob vecchio, che ha 0 in quel byte, resta «pieno» senza migrazioni.
- **`page.html`**: una riga in più subito dopo il Font — `<p class="row"><label for="s_digit_style" class="rlab">Stile cifre</label> <select id="s_digit_style"></select></p>`.
- **`page.js`**: `OPTS.digit_style` = `pieno` / `trasparente (solo contorno)` / `trasparente 3D (contorno + ombra)` / `pieno 3D (con ombra)`; `SELECTS` include `digit_style` (fra `font` e `clock_mode`); `applyLeco()` è diventata **`applyRules()`** (non riguarda più solo LECO) e applica quattro regole a ogni cambio di impostazione (e al caricamento dello stato, che passa dalla stessa funzione via `writeSettings`):
  1. font LECO ⇒ `#s_digit_style` **disabilitato e riportato a `0`** (l'orologio ignora lo stile senza sprite);
  2. stile 1 o 2 (trasparenti) ⇒ `#s_outline` **disabilitato con il valore conservato** (l'anello è sempre disegnato, «Contorno» non ha effetto): il valore continua a viaggiare nel payload, così tornando a uno stile pieno la scelta è ancora lì; 🔁 **Superata da UX-2/D98** (già D62): `#s_outline` non è **mai** disabilitato e la riga `el('s_outline').disabled = …` è uscita da `page.js` (vedi «Revisione UX-2» in fondo);
  3. **D26 — su `state.platform === 'flint'` niente ombra 3D**: le `<option>` 2 («trasparente 3D») e 3 («pieno 3D») prendono l'attributo `disabled` e l'etichetta con l'avvertenza «(non su Pebble 2 Duo)», e il valore scende allo stile equivalente senza ombra (**2 ⇒ 1, 3 ⇒ 0**) — sia leggendo lo stato sia a ogni `change`, così il payload porta sempre il valore normalizzato. Su `emery` e su piattaforma `unknown` non cambia nulla (opzioni attive, etichette pulite, valore conservato). Gli id delle due opzioni sono **stabili** (`s_digit_style_3d1`, `s_digit_style_3d2`), come `s_font_leco`: la tabella `NO_3D` in `page.js` tiene `[valore, valore su flint, id]` e la disabilitazione è idempotente (assegnazioni, mai append). L'orologio applicherebbe comunque 2 come 1 e 3 come 0 (`ui_digits_set_palette` ignora l'indice mancante): la pagina evita solo di far scegliere un'impostazione che non si vedrebbe.
  4. anteprima del font da `GalPreviews` per le chiavi note (`PREV_KEYS = ['anton','bebas','barlow','','francois','staatliches']`): chiave assente o `previews.js` non caricato ⇒ immagine nascosta, nessun errore. 🔁 **Superata da UX-2/D95**: `previews.js` è cancellato, `GalPreviews` e `PREV_KEYS` non esistono più e la pagina non mostra nessuna PNG «12:34».
  Nomi e chiavi sono quelli **definitivi** della spec S8-stile §2 (4 = **Francois One** → `francois`, 5 = **Staatliches** → `staatliches`, le stesse chiavi di `gen_font_previews.py` e `gen_digits.py`): `previews.js` ora le contiene davvero, e una chiave che mancasse lascerebbe comunque l'immagine nascosta senza errori.
- **Select e `<option>` disabilitate**: nessuna regola CSS nuova. La cascata di `#41` riguarda i pulsanti (`FAM_BTN` in `test_page.js` §4e resta a **6 famiglie**: né una `<select>` né una `<option>` sono pulsanti, quindi non serve una voce in più); una `<select>` disabilitata prende il grigio del browser sopra il fondo bianco della regola `select`, e una `<option disabled>` il grigio del menu a tendina di sistema.
- **Anteprime (`tools/gen_font_previews.py` v3)**: `FONTS` ha ora **cinque** voci — `('francois', 'FrancoisOne-Regular.ttf')` e `('staatliches', 'Staatliches-Regular.ttf')` in coda alle tre esistenti — e `previews.js` espone le cinque chiavi `GalPreviews.anton|bebas|barlow|francois|staatliches` (il font 3, LECO, è di sistema e non ha anteprima: in `PREV_KEYS` è la voce vuota). Le chiavi sono le stesse di `FONTS` in `tools/gen_digits.py`: **un font nuovo = una riga in ciascuna delle due tabelle**. `previews.js` passa da 1.722 a **2.500 B** (i due PNG in più pesano 237 e 219 B, 316 e 292 caratteri di base64) e l'altezza dell'inchiostro **resta 28 px** (il tetto di 4.096 B non viene sfiorato, quindi la riduzione automatica dell'altezza non scatta: le anteprime restano confrontabili a occhio e vanno mostrate 1:1). `--selftest` 41 controlli verdi, `--check` verde.
- **Test** (`test/test_page.js`, entrambi i giri sorgenti/inlinato): §1c normalizzazione (font 4/5/6/negativo, `digit_style` 0..3, stringa, non intero, LECO ⇒ 0, LECO+layout 1 che invece conserva lo stile), §1f/§2j payload a **11** impostazioni, §2a markup (esiste `#s_digit_style`, è una select vuota, sta fra Font e Formato ora, etichetta con `for`+`rlab`), §2b 6 opzioni font e 4 di stile, §2i payload completo, §3i 14 etichette-guida, **§4g** le quattro regole della UI, i 6 nomi dei font per esteso, le **anteprime vere** di `previews.js` (le 5 chiavi sono PNG data-URL: `francois` e `staatliches` non sono più iniettate a mano; `f4`/`f5` restano inutilizzate e Barlow resta sul suo indice), lo stato ricevuto dall'orologio riletto nei campi e la **regola D26** (id stabili sulle due opzioni 3D; stato flint con `digit_style` 2 ⇒ select a 1, opzioni spente, etichette con l'avvertenza, payload 1; `change` verso 3 ⇒ 0 e verso 2 ⇒ 1, con `#s_outline` che segue il valore normalizzato; stato emery con 2 ⇒ resta 2 ed etichette pulite; piattaforma sconosciuta come emery; su flint LECO, layout e anteprime si comportano come prima). Sensibilità verificata con 8 mutanti (regola LECO in `page_core`, disabilitazione di `#s_outline`, `PREV_KEYS` corte, `PREV_KEYS` con le chiavi vecchie `f4`/`f5`, etichette «Font 4»/«Font 5», forzatura a 0, `font 0..3`, riga HTML tolta) e, per D26, con altri **5** sulla nuova regola: chiamata ad `applyNo3d` tolta (12 fail), `disabled` non messo sulle `<option>` (4), regola applicata a ogni piattaforma invece che al solo flint (19), id tolti alle due opzioni 3D (2), normalizzazione `3 ⇒ 1` invece di `3 ⇒ 0` (3). Ognuno fa fallire almeno un'asserzione. Conteggio a fine S8-stile: **1.224 ok sui sorgenti e 1.245 sull'inlinato**, 0 fail (valore corrente dopo l'aiuto sui font di S9-prep: **1.327 / 1.348**).
- Budget dopo la modifica: HTML inlinato **62.893 B** (61,4 KB; era 61.732 B con le sole regole di stile e 60.989 B nella v1.9), modulo `config_page.js` **64.899 B**; **05/09 (revisione v1.9: soglia proporzionale alle foto e testo del rimedio): HTML 63.424 B, modulo 65.437 B; la sera, con il contatore «ora N su 12» (D28): HTML 63.735 B, modulo 65.761 B** (margine 1.801 B sotto il tetto); **S9-prep (05/09 sera), con l'aiuto sui font per lo stile trasparente: HTML 63.938 B, modulo 65.972 B** (margine **1.598 B**; superata da R13, vedi «Revisione S9-prep» sotto: 64.222/66.268 B, margine 1.314 B). Il tetto che `build_config_page.py` fa rispettare è sull'**HTML** (65.536 B → **2.643 B di margine**); il modulo è più grande per l'escaping JSON (637 B dal tetto, che però non è il suo). Dei +1.161 B rispetto alla misura precedente, ~780 sono le due anteprime PNG di `previews.js` e il resto la regola D26 in `page.js` (tabella `NO_3D`, `applyNo3d`, gli id e i commenti). **Obiettivo soft di 60 KB superato** (`SOFT_BYTES = 61.440 B`): ogni generazione stampa l'avviso «sopra l'obiettivo di 60 KB», che non blocca. Il margine va misurato a ogni aggiunta: le prime leve, se servisse spazio, sono le quattro etichette di `OPTS.digit_style` (~270 B, ma è il contratto della spec S8-stile §5) e i commenti lunghi delle sorgenti. ⚠️ **Correzione (17/09/2026)**: l'inliner toglie **anche** i blocchi `/* */` quando stanno su righe proprie, in js **e** in css (ramo `inblock` di `_strip_text` in `tools/build_config_page.py`); sopravvive solo il commento in **coda a una riga di codice** — ed è proprio la leva usata in UX-3, dove spostare 38 commenti di fine riga su righe proprie ha tolto 2.250 B.

## Revisione S9-prep (05/09/2026) — aiuto sui font (P5) e avviso flint sullo stile trasparente (R13)

- **Quinta regola di `applyRules()`** in `page.js` (le prime quattro sono nella revisione S8-stile qui sopra): sotto la select «Stile cifre» il paragrafo `#s_style_hint`
  (classe `help` già esistente in `page.css`, `style="display:none"` nel markup come `#settingsNote`/`#editor`/`#slow`,
  commutato da `show(e, on)`: la pagina non usa l'attributo `hidden`) porta il testo fisso, in italiano e ASCII:
  «Per lo stile trasparente rendono meglio Francois One e Staatliches (Anton in layout A tende a chiudersi).»
  Compare **solo con lo stile ≠ 0 (pieno)**, sia all'apertura (`writeSettings` ⇒ `applyRules`) sia a ogni `change`
  delle select (`settingsChanged` ⇒ `applyRules`); non c'è altro punto che scriva `#s_digit_style`.
  🔁 **Superato da UX-2/D98**: oggi l'aiuto compare solo con lo stile **1 o 2** (a contorno) **e** font
  **0–2** (Anton/Bebas/Barlow) — con Francois One e Staatliches il consiglio sarebbe già seguito, e con
  «pieno con ombra» (3) non c'entra —, cioè `page.js:230`
  `show(el('s_style_hint'), (sv === 1 || sv === 2) && +font.value <= 2)`.
- **Ordine rispetto a D26**: la riga sta **dopo** `applyNo3d(style)`, quindi legge il valore **già normalizzato** —
  come fa `#s_outline`. Su flint lo stile 2 (⇒ 1) mostra l'aiuto e lo stile 3 (⇒ 0 = pieno) **no**: un consiglio sullo
  stile trasparente accanto a una select che dice «pieno» sarebbe fuorviante. Con il font LECO (stile forzato a 0)
  l'aiuto è nascosto; su `emery` e su piattaforma sconosciuta gli stili 1, 2 e 3 lo mostrano tutti.
- **Test** (`test_page.js`, entrambi i giri): §2a l'id `#s_style_hint` nella lista degli id, la classe `help`,
  `display:none` nel markup e la posizione fra `#s_digit_style` e `#s_clock_mode`; §4g testo esatto e visibilità per
  gli stili 0/1/2/3 su emery (0 e ritorno a 0 nascosto), apertura con stato salvato a stile 1 e a stile 2, LECO
  nascosto (al `change` e all'apertura), uscita da LECO con stile 0 ancora nascosto, layout «Tutto schermo» che segue
  lo stile e layout che scaccia LECO, flint 2 ⇒ 1 visibile e 3 ⇒ 0 nascosto (sia all'apertura sia al `change`),
  flint + LECO nascosto, piattaforma sconosciuta come emery. Conteggio **1.327 / 1.348**, 0 fail.
- **Sensibilità**: 4 mutanti su copia in scratchpad, tutti rossi — `show()` tolta (11 fail), visibilità forzata a
  `true` (10), regola spostata **prima** di `applyNo3d` con `+style.value` (2: i due casi flint dello stile 3,
  all'apertura e al `change`), condizione `sv === 1 || sv === 2` invece di `sv !== 0` (1: «pieno 3D»).
- **Budget**: +203 B sull'HTML inlinato (63.735 ⇒ **63.938 B**, modulo **65.972 B**), margine **1.598 B** sotto il
  tetto di 65.536 B (`build_config_page.py --check`). L'avviso «sopra l'obiettivo di 60 KB» è preesistente e non
  blocca. Prima di aggiungere altro testo alla pagina rimisurare con
  `--check` (l'avviso R13 qui sotto e' stato misurato cosi'): le leve di recupero sono quelle elencate nella revisione S8-stile qui sopra.

### R13 — avviso su Pebble 2 Duo con lo stile trasparente (05/09/2026)

- **Sesta regola di `applyRules()`**: il paragrafo `#styleFlintHelp` (`<p class="help" style="display:none">`) sta
  in `page.html` **subito dopo `#s_style_hint`**, cioè i due aiuti restano nell'ordine P5 → R13 sotto la select
  «Stile cifre» e prima di «Formato ora». Testo fisso, in italiano: «Su Pebble 2 Duo il contorno delle cifre è di
  1 px: sulle foto molto dettagliate l'ora si legge male. Con quelle conviene lo stile pieno.» (l'accento sta
  nell'HTML come negli altri `<p class="help">`; `page.js` resta senza accenti e senza backtick, come vuole
  l'inliner — la regola ASCII di F-S8-2 riguarda i log del PKJS, non i testi della pagina).
- **Condizione**: `show(el('styleFlintHelp'), !!G.state && G.state.platform === 'flint' && sv === 1)`, riga scritta
  **accanto a quella di P5** e quindi **dopo `applyNo3d(style)`**: `sv` è già normalizzato da D26 (2 ⇒ 1, 3 ⇒ 0),
  perciò su flint tutti i casi trasparenti ricadono su `sv === 1` e lo stile 3 (⇒ 0 = pieno) non mostra nulla. Su
  `emery`, su piattaforma sconosciuta e senza stato l'avviso non compare mai; con il font LECO (stile forzato a 0)
  è nascosto. Nessun effetto sul payload (`buildPayload` non cambia), nessun byte di statico, protocollo intatto.
- **Perché**: su flint l'anello è di 1 px **per costruzione** — `src/c/digit_metrics.h`, blocco `#else /* flint */`,
  Anton taglia A `248, 44, 28, 42, 1, 0, 49` (ring 1, shadow 0) contro emery `404, 72, 40, 66, 2, 2, 74` (ring 2,
  ombra 2) — e D20 esclude R = 2 su flint (sforerebbe i 144 px in 12 h). Il testo descrive **solo** lo spessore del
  contorno e consiglia lo stile pieno: nessuna affermazione provata sul Pebble 2 Duo reale (O11 non fatto).
- **Test** (`test_page.js`, entrambi i giri sorgenti/inlinato): §2a l'id `#styleFlintHelp` nella lista degli id e
  `display:none` nel markup (come per `#s_style_hint`); §4g, blocco D26: posizione nel markup fra `#s_style_hint` e
  `#s_clock_mode`; stato flint con `digit_style` 2 (⇒ 1) ⇒ avviso visibile con il **testo esatto** (costante
  `FLINT_HELP`) e con «1 px» dentro; `change` a «pieno» ⇒ nascosto e ritorno al trasparente ⇒ di nuovo visibile;
  emery con lo stile 3 **e con lo stile 1** ⇒ nascosto; piattaforma sconosciuta con lo stile 2 **e con lo stile 1**
  ⇒ nascosto. I due casi «stile trasparente ma piattaforma non flint» sono quelli che provano la metà `platform ===
  'flint'` della condizione: senza di essi un codice che guardasse il solo `sv === 1` passerebbe i test (lacuna
  trovata dallo scettico e chiusa il 05/09). **12 asserzioni nuove per giro**: conteggio **1.339 / 1.360**, 0 fail
  (era 1.327 / 1.348 prima di R13). `make -C test pagecheck` e `make -C test jstest` verdi.
- **Sensibilità**: 5 mutanti su copia in scratchpad, tutti rossi. Misurati sul codice attuale: controllo di
  piattaforma tolto (`show(el('styleFlintHelp'), sv === 1)`) ⇒ **2 fail per giro** (emery e piattaforma sconosciuta
  con lo stile trasparente); `style="display:none"` tolto dal paragrafo ⇒ **1 fail per giro** (§2a); paragrafo tolto
  da `page.html` ⇒ **4 fail per giro** (id mancante e posizione, più le eccezioni «DOM finto» che interrompono §2a e
  §4g). Misurati prima delle due asserzioni nuove: `show()` di R13 tolta da `page.js` ⇒ 2 fail per giro; testo «1 px»
  ⇒ «2 px» ⇒ 3 fail per giro.
- **Budget**: +284 B sull'HTML inlinato (63.938 ⇒ **64.222 B**, modulo `config_page.js` **66.268 B**), margine
  **1.314 B** sotto il tetto di 65.536 B (`make -C test pagecheck`, che rigenera `src/pkjs/config_page.js` con
  `tools/build_config_page.py`: mai a mano).
- **Limite noto (ereditato da D26)**: con l'orologio scollegato `watchPlatform()` (`src/pkjs/index.js`) ritorna
  `'unknown'` — il formato ha un ripiego sullo snapshot dell'ultimo HELLO, la piattaforma no — quindi su un vero
  Pebble 2 Duo scollegato non compaiono né la normalizzazione D26 delle opzioni 3D né questo avviso. Non è una
  regressione di R13: è la regola già in vigore per D26. Chiusura possibile in v1.1, **per entrambe insieme**: una
  `isFlint()` = `platform === 'flint' || (platform === 'unknown' && fmt === 2)` con i test corrispondenti.
- **Se dopo O11 non bastasse**: in v1.1 una terza voce in `NO_3D` (`page.js`) spegne anche l'opzione «trasparente»
  su flint, senza toccare l'orologio.

---

## Revisione S10 (05/09/2026) — la pagina in quattro lingue, **sei da S11 (06/09/2026)**

Spec completa: `galleria-s10-i18n.md` (D31–D38) e `galleria-s11-lingue-es-pt.md` (D39–D42: **es** e **pt**
in coda alla lista, sempre nell'ordine en, it, de, fr, es, pt). Qui solo ciò che cambia per la config
page; dove sotto si legge «quattro», da S11 sono **sei**. I numeri sono quelli **misurati al gate
S11 del 06/09/2026** (quelli di S10, con 4 lingue, restano indicati come tali).

- **Dizionari fuori dall'HTML** (D35): sorgente unica `apps/galleria/i18n/messages.json`
  (**121 chiavi × 6 lingue** da S11, `{ "chiave": { "it", "en", "de", "fr", "es", "pt" } }`,
  **33.326 B**; con 4 lingue erano 23.089 B; con S12 sono diventate 134 chiavi e 37.078 B, le 13 nuove
  sono l'anteprima; da UX-1 (13/09/2026) sono 126 chiavi e 36.573 B — 11 in meno, cioè le 7 chiavi
  solo dev/prova, cablate in inglese in `page.js`, e le 4 fuse in `msg_err` (D72), più le 2 nuove
  `help_sync` e `photos_cap_empty`; 🔁 **poi 132 chiavi e 38.127 B con UX-2, 135 e 39.820 B con UX-3,
  135 e 39.834 B a fine UX-4** — 14/09/2026, unico ritocco `preview_stale` in francese, D133) →
  `tools/build_i18n.py` → `src/pkjs/i18n.js`
  (30.124 B con 6 lingue, 20.731 B con 4; 33.564 B da S12, 33.589 B da UX-1; 🔁 **36.500 B a fine
  UX-4**, 36.486 dopo UX-3, 34.859 dopo UX-2) e
  `test/fixture_i18n.js`, identici, ES5 e ASCII
  (`module.exports = { keys, en, it, de, fr, es, pt }`, array **nell'ordine del file**).
  `--check` fallisce su chiave mancante in una lingua, segnaposto diversi fra lingue, backtick, file
  non ordinato; da UX-1 anche la **tripwire di lunghezza** delle `<option>` e delle etichette (D70,
  `tools/README.md`); `--selftest` = **32** controlli (misurati il 14/09/2026; 28 nella prima stesura di UX-1, 21 fino a S12, 20 con 4 lingue).
  `make -C test pagecheck` lo esegue **prima** del `--check` della pagina, perché il secondo dipende
  dagli indici del primo.
- **Chiavi al posto dei testi**: nei sorgenti `T('chiave')` / `T('chiave', a, b)` (`{0}`/`{1}`
  sostituiti in **una passata**, così un valore che contiene `{1}` non viene risostituito) e
  `data-i18n` / `data-i18n-title` su nodi di testo **vuoti**; nell'artefatto inlinato restano solo
  **indici** (`T(12`, `data-i18n="12"`). `T` accetta numero **o** stringa: nei test sui sorgenti i
  nomi si risolvono con `window.GalI18nKeys` (da `fixture_i18n.js`). Senza dizionario (hash assente
  o rotto) la pagina mostra il **nome della chiave**, tranne i messaggi di stato mancante di
  `page_core.js`, che hanno un ripiego inglese cablato: è la «modalità prova», non raggiungibile dal
  telefono.
- **Stato**: `lang_auto` e `i18n` (tutti i dizionari — quattro in S10, **sei** da S11 —, **in coda** allo stato perché sono
  il pezzo grosso: l'inizio dell'hash resta leggibile). Lingua effettiva =
  `effectiveLang(settings, lang_auto)` = `LANGS[settings.lang - 1]` se `lang` ≠ 0, altrimenti
  `lang_auto` (o `en`).
- **`page.js`**: `applyLang()` ricostruisce `OPTS`, ripercorre `data-i18n`/`data-i18n-title`,
  riscrive i testi delle `<option>` **senza toccarne id e valori** (D26 e R13 restano validi),
  aggiorna `<html lang>`, la riga dell'orologio, il tono e gli aiuti; viene chiamata da
  `writeSettings` e dal `change` di `s_lang`. `dec2()` usa `C.dec(v, lang)` (en `.`, tutte le altre
  — it/de/fr e, da S11, es/pt — `,`).
- **`page_core.js`**: `LANGS`/`LANG_NAMES`, `langName`, `effectiveLang`, `dec`, `SETTINGS_FIELDS`
  con `['lang', 0, 4, 0]` → **`['lang', 0, 6, 0]`** da S11, `capMessage(kb, capKb, nAdded, T)` (il
  testo arriva dal chiamante).
- **Select «Lingua»** (D36): `s_lang`, opzioni con endonimi
  («Automatica (orologio: Italiano)», «English», «Italiano», «Deutsch», «Français» e, da S11,
  «Español», «Português»: 7 voci in tutto, ognuna con `lang="xx"` da D89/U-16); si salva come ogni
  altra impostazione (byte 13 del blob), nessuna sync speciale.
  🔁 **Posizione rivista da D49 (UX-2)**: non è più la **prima riga** di `#settings` ma l'**ultima
  riga visibile delle impostazioni**, dentro `#misc` (`page.html:75–76`) dopo l'anteprima `#wfPrev` e
  prima del pulsante «Altre impostazioni ▾»; l'etichetta è «Lingua (pagina e data)» (`lbl_lang`), che
  dice anche che l'impostazione vale per la data sull'orologio. Vedi `galleria-s10-i18n.md` §1, blocco
  «🔁 D36 rivista da D49».
- **Dev server**: `--lang en|it|de|fr|es|pt` → `hooks.lang` → in DEV `index.js` forza la lingua
  **automatica** (in emulatore l'orologio è sempre `en_US`); l'impostazione `lang` resta invece una
  voce di `--settings` (`{"lang": 3}`). Selftest **257** con 6 lingue (252 con 4).
- **Dimensioni** (misurate al gate S11 del 06/09/2026, cioè **senza** l'anteprima di S12, che le
  porta a 81.028 / 83.538 B con il tetto a 98.304 — vedi «Revisione S12»): HTML inlinato **64.745 B**
  (modulo `config_page.js`
  **66.849 B**), margine **791 B** sul tetto di 65.536; l'artefatto non contiene più nessun testo
  dell'interfaccia. Con 4 lingue (S10) erano **64.699 B** di HTML e **66.800 B** di modulo, margine
  837: es/pt hanno aggiunto **46 B** all'HTML — solo `LANGS`/`LANG_NAMES` e le due `<option>` in
  più, perché i dizionari restano **fuori** dall'artefatto e il tetto dei 64 KB non è mai stato in
  pericolo — e **+49 B** al modulo, dove «Español» e «Português» diventano due sequenze `\uXXXX`.
  (La cifra **66.597** che questa sezione riportava per S10 fino al 06/09/2026 era la misura fatta
  sul repo *prima* di S11 e non è più il modulo di riferimento: vale **66.800**, come in
  `tools/README.md` §13. Il tetto vero resta comunque solo quello sull'HTML.)
- **Test** (conteggi del gate S11, 06/09/2026; fra parentesi quelli di S10 con 4 lingue, cresciuti
  perché i giri «tutte le lingue» ne fanno sei): `test_page.js` **1.445** asserzioni sui sorgenti
  (1.427) + **1.470** sull'inlinato (1.452) (giro «tutte le lingue»: nessuna chiave vuota a schermo, nessun `{n}` residuo, `OPTS` con lo stesso numero di
  voci in ogni lingua, `s_lang` che cambia i testi, decimali per lingua; i controlli strutturali
  della sezione 0 verificano che nell'artefatto le chiamate a `T(` siano **numeriche**);
  `build_config_page.py --selftest` **99** (91), `build_i18n.py --selftest` **21** (20),
  `test_album.js` **1.341** (1.316: byte 13, round trip, CRC dei default invariato),
  `test_index_retry.js` **182** (174: `lang_auto`/`i18n` nello stato, hook `lang`),
  `test_devpage.js` **333**, `test_datefmt.c` **2.341** (data es/pt, `DATEFMT_MAX_LEN` 14).
- ⚠️ **I dizionari non passano mai per `log()`** (F-S8-2: una riga PKJS con un accento fa morire
  `pebble logs`): viaggiano solo nell'hash dell'URL, e della lingua si logga il solo codice a due
  lettere.

## Revisione S12 (06/09/2026) — anteprima della watchface, URL in base64, maschere delle cifre

Spec completa: `galleria-s12-anteprima.md` (D43–D48). Qui solo ciò che cambia per la config page e
per il PKJS che la apre. Il **codice C dell'orologio non cambia**: protocollo, impostazioni e
persist restano identici.

- **D43 — tetto della pagina 64 → 96 KB.** `tools/build_config_page.py`: `MAX_BYTES` **98.304**
  (96 KB), `SOFT_BYTES` **86.016** (84 KB). I messaggi
  d'errore e d'avviso ricavano le cifre dalle costanti; il selftest le scrive a mano proprio perché
  un cambio di tetto senza aggiornamento dei documenti si veda. `SCRIPT_ORDER` diventa
  `pipeline → page_core → previews → preview → page` (l'ordine sbagliato resta un **avviso**, non
  un errore) e il selftest ha tre controlli nuovi (ordine giusto, `preview.js` inlinato dopo
  `previews.js`, ordine invertito ⇒ avviso): **105** controlli, erano 102.
  🔁 **Superata da UX-2/D95**: `previews.js` esce dalla build e `SCRIPT_ORDER` diventa
  `pipeline → page_core → preview → page`; i controlli sono **106** e il file facoltativo del
  selftest si chiama `extra.js`.
  **Esito misurato**: HTML inlinato **81.028 B** (79,1 KB), modulo
  `config_page.js` **83.538 B**, **17.276 B** di margine sul tetto e nessun avviso soft.
  ⚠️ **Storia della decisione**: la prima stesura di D43 diceva `MAX_BYTES` 81.920 (80 KB) e
  `SOFT_BYTES` 73.728 (72 KB), con obiettivo di fine sessione **≈ 76 KB**. L'obiettivo è stato
  **mancato di 3.204 B**, perché la pagina senza il motore era già a ≈ 68,8 KB (sezione, CSS e i18n
  di S12 compresi) e a `preview.js` restavano ~9 KB mentre ne occupa **12.216** (sorgente 20.814 B,
  🔁 oggi 20.826 B di sorgente e 12.228 inlinati: `wc -c` del 14/09/2026,
  406 righe): con il tetto a 80 KB restavano **892 B** e l'avviso dei 72 KB usciva a **ogni**
  generazione — una tripwire spenta, e la prima riga di CSS in più avrebbe fatto uscire 1
  dall'inliner senza riscrivere `config_page.js` (insidia nota: `pebble build` imbarcherebbe la
  pagina precedente). La revisione S12 ha quindi alzato le costanti a **96/84**, perché il vincolo
  che lega davvero è la lunghezza dell'URL `data:` sul telefono (§2: 185.091 caratteri su emery),
  non i 64 KB storici. Leve pronte se un giorno servisse spazio: collasso degli spazi nell'inliner
  (≈ −2,4 KB sul solo `preview.js`, stima con `_strip_text`), commenti più corti nei sorgenti.
- **D44 — la pagina viaggia in base64.** Sul telefono
  `data:text/html;charset=utf-8;base64,<b64.encodeUtf8Std(html)>#<hash>`: 1,333 caratteri per byte
  invece degli 1,659 del percent-encoding (`encodeURIComponent` lascia in chiaro solo 71 caratteri
  su 128). Misura di metà sessione sull'HTML da 64.745 B: **86.328** caratteri contro 107.379,
  **−21.051**; sulla pagina **vera di fine S12** (81.028 B): **108.040** caratteri contro **135.932**,
  **−27.892**. L'**hash resta base64url senza padding** (in un frammento
  `+` e `/` non sarebbero al sicuro), quindi nell'URL c'è sempre un solo `#`. Il log di
  `showConfiguration` non cambia: `[config] apro la pagina (URL N car., stato M)`.
  `b64.js` guadagna `encodeUtf8Std(str)` (alfabeto standard, padding `=`, stesso motore di
  `encode`/`encodeUtf8`: `encodeAlpha(bytes, alfabeto, pad)`); il padding si tiene: è la forma
  canonica di RFC 4648 §4, `=` è legale in un `data:` URL, costa al massimo 2 caratteri e toglie
  ogni dubbio sui decodificatori non «forgiving» (nessuna WebView è stata vista troncare: la
  motivazione «senza padding qualcuna perde l'ultimo byte» era più forte di ciò che sappiamo). Il percorso **dev** (dev server)
  non cambia. ⚠️ Da provare sul telefono (Android **e** iPhone) nel gate: se una WebView non aprisse
  la forma base64 si torna al percent-encoding cambiando **una riga sola** di `index.js` (il
  commento sopra `showConfiguration` la riporta già scritta).
- **D45 — maschere delle cifre nello stato.** `src/pkjs/digit_masks.js` (generato da
  `tools/gen_digits.py --masks-js`, `--check` dentro `pagecheck`) porta, per piattaforma, font e
  taglia, la maschera a 1 bit del **solo riempimento**; anello e ombra la pagina li ricostruisce
  esattamente (anello = dilatazione di Chebyshev di R, ombra = scorrimenti (+k,+k), k = 1..S, di
  riempimento ∪ anello, meno riempimento ∪ anello: la regola di `digit_metrics.h`). `index.js` ne
  manda nell'hash **solo la piattaforma collegata** (da `fmt`: 2 = flint, altrimenti emery) e **solo
  i glifi di `preview_time`** (`'12:34'` ⇒ `1 2 3 4 :`; in taglia B il `:` non c'è perché la strip
  B è generata con `--no-colon-b`), con tutti i font e tutte e due le taglie: il cambio di font o di
  layout nella pagina deve ridisegnare l'anteprima **senza tornare al PKJS**. Le metriche della
  taglia (`strip_h`, `digit_h`, `ring`, `shadow`, `cell_w`, …) vengono copiate così come sono, i
  glifi assenti o di larghezza 0 saltati; un **font senza nemmeno una taglia valida** non entra
  nell'hash e non viene contato nel log (revisione S12: prima ci finiva come sottoalbero vuoto). **Correzione della revisione S12** (rilievo di V1): dei
  digit che *non* stanno in `preview_time` viaggia comunque il solo **`w`** (nessun bit: non si
  disegnano), perché `prv_grid_steps` misura il riempimento della cifra **più larga fra le dieci** —
  senza quelle larghezze il passo di flint Staatliches taglia A diventerebbe 28 invece di 29. Il log
  lo dice: `[config] masks emery: 5 font, 45 glifi + 60 larghezze, 29810 car. di bit` (flint 12069). Il modulo
  generato pesa **121.107 B** (la stima di D45, «≈ 26 KB», valeva per **un** font: sono 21,8–23,8 KB
  per font × 5, due piattaforme e due taglie). `require('./digit_masks')` è **pigro** come
  `./config_page` e `./i18n`, e un modulo mancante, con `v ≠ 1` o senza la piattaforma collegata dà
  `masks: null` — la pagina si apre lo stesso e mostra la sola foto, con un log ASCII (il messaggio
  del modulo mancante esce una volta sola: il require pigro non si ripete).
- **Peso nell'URL** (**misurato a fine S12, 06/09/2026, sul modulo di maschere vero e sulla pagina
  vera da 81.028 B**). `masks` è il pezzo più grosso dello stato, più dei dizionari: nell'hash pesa
  **43.276 caratteri** su emery e **19.610** su flint, contro i **33.394** dei sei dizionari
  (**33.684** dopo la ripulitura dei testi di UX-1, 13/09/2026). Con
  l'album vuoto: hash **77.014** e URL **185.091** caratteri su emery (pagina in base64 108.040 +
  `#` + hash + 36 del prefisso), hash 53.347 e URL **161.424** su flint. Android ha un tetto di
  2 MiB (198–201 k già aperti il 06/09), ma l'iPhone finora ha aperto **128–138 k** (128.250,
  133.569 ×2 e **138.249**: `galleria-s8-risultati.md` §S8b): il gate deve ancora misurare
  `apro la pagina (URL …)` sui due telefoni, ed è la prova decisiva della sessione.
  🔁 **A fine UX-4 (14/09/2026)** gli stessi numeri sono: hash **81.218** e URL **195.223** su emery,
  hash **57.551** e URL **171.556** su flint ad album vuoto; **221.703** / **198.020** con 12 foto e
  le miniature vere del gate; **292.908** / **269.225** con 12 miniature al tetto di 6.000 caratteri
  l'una. Se non regge, le
  leve sono l'**RLE delle maschere** (misurato con `node`: 29,8 k → 10,4 k caratteri, **×2,86**,
  cioè ≈ −26 k sull'URL) e poi le maschere dei **font non selezionati** (l'anteprima tornerebbe al
  PKJS a ogni cambio di font).
  ⚠️ La stima di D45 («≈ 7,3 k caratteri base64 per emery», ≈ 10 k di hash) è **sei volte più
  bassa** della misura: valeva per un font solo. Le cifre buone sono queste.
- **Test**: `test_b64.js` **2.729** (erano 2.444: §8 su `encodeUtf8`/`encodeUtf8Std` — vettori RFC
  4648 §10 con padding, confronto con `Buffer.toString('base64')` su accenti/emoji/CJK, surrogati
  spaiati, 60 stringhe casuali, pagina finta da 76 kB, forma del `data:` URL);
  `test_index_retry.js` **227** (erano 185: caso **o** = `masks`/`preview_time` nello stato con
  modulo finto in `require.cache`, filtri di piattaforma e glifi, modulo assente/malformato/senza
  piattaforma, font senza nemmeno una taglia valida che resta fuori dall'hash e dal conteggio del
  log (revisione S12); caso **p** = URL `data:…;base64,` con il corpo uguale a `config_page.js` byte a byte
  e l'hash ancora base64url); `smoke_s5b.js` **84** (lo step 10 controlla il prefisso nuovo);
  `build_config_page.py --selftest` **105** (erano 102).
- **D46/D47 — la sezione «Anteprima» nella pagina.** `#wfPrev` sta dentro `#settings` subito dopo
  `#styleFlintHelp`, cioè **sotto «Stile cifre»** — 🔁 **rivisto da UX-2**: sta **dopo la riga
  «Colore dell'ora»** (`s_text_color`), ultima voce di «Aspetto dell'ora», e subito prima di `#misc`
  (`page.html:68–69`; §«Revisione UX-2» in fondo a questo documento) —: titolo
  `data-i18n="sec_preview"`, `<canvas
  id="wfPreview">` (400×456 su emery, 288×336 su flint = backing store ×2, mostrato a
  `width: 100%; max-width: 400px; image-rendering: pixelated` — 🔁 **rivisto da D92/UX-2**: a
  **grandezza naturale**, `cv.style.width = (r.width / 2) + 'px'` = 200 px CSS su emery e 144 su
  flint, con `#wfPreview { box-sizing: content-box; width: auto; max-width: 100% }`: senza
  `content-box` il reset globale `border-box` lascerebbe 198 px e l'anteprima non sarebbe 1:1 —),
  didascalia `#wfPrevCap` e note
  `#wfPrevNote`. `preview.js` è un modulo **puro** che riusa `GalPipeline` e non tocca il DOM;
  `page.js` lo chiama da `applyRules` (quindi da `writeSettings` e da ogni `settingsChanged`), dal
  `drawPreview` dell'editor, da `addOk`, `closeEditor`, `deleteTile` e dall'occhio. I pixel stanno in
  `G.pixels` (slot → `raw`, riempito in `addOk`, tolto in `deleteTile`: fino a ≈ 410 KB su emery con
  12 foto, solo finché la pagina è aperta) e la foto mostrata è `G.pvSlot` — l'**occhio** `👁︎`
  (`#eye_<slot>`, 36×36 — 🔁 **40×40** nel CSS di oggi, regola `.eye` —, sovrapposto in basso a
  sinistra della miniatura, `aria-label` con il nome)
  che compare **solo sulle tessere `kind === 'new'`** — 🔁 da **D111/UX-3** solo da **due** tessere
  `new` in su: con una foto nuova sola non c'è niente da scegliere —, con la tessera scelta in classe `pv`; la
  scelta **non si ricorda** fra un'apertura e l'altra e non entra mai nel payload. Nel DOM l'occhio è
  l'**ultimo figlio** della tessera (sovrapposto solo per CSS: così miniatura, testi e pulsanti non
  si spostano, ma nell'ordine di tabulazione viene dopo ▲ ▼ ✕) e ha la sua voce in `FAM_BTN`.
  Didascalie: `preview_cap_photo` («{0}: ora campione {1} nel font e stile scelti»), `preview_cap_none`
  senza foto con pixel, `preview_auto` («Colore automatico: bianco, contorno no») **solo quando il
  colore è davvero automatico**, più le note `preview_note_leco` / `preview_note_ampm` e sempre in
  coda `preview_note_info` («Riga info, AM/PM e Quick View non sono mostrati»). Ogni errore è dentro
  un `try/catch` che nasconde il canvas e scrive `preview_unavailable`, senza toccare il resto della
  pagina. ⚠️ Due nomi di chiave **diversi dalla spec §1.3**: `preview_off` esisteva già (è
  l'anteprima del ritaglio non disegnabile), quindi la coppia del contorno è
  `preview_outline_on` / `preview_outline_off`. E la didascalia **non** porta la percentuale di
  «pixel difficili» dell'esempio di D46: `preview_auto` ha solo i due segnaposto del contratto (il
  dato c'è in `r.luma`, servirebbe un segnaposto in più).
- **Che cosa l'anteprima NON mostra** (elenco completo, aggiornato dalla revisione S12: la pagina è
  «onesta», quindi l'elenco deve esserlo altrettanto). (1) La **riga info** (data, passi, batteria,
  icona BT) e l'icona/contatore di sync. (2) L'**AM/PM**, e con esso la griglia del formato 12 h: la
  griglia dell'anteprima è **sempre quella a 24 h**, perché il PKJS non conosce
  `clock_is_24h_style()`; con il formato 12 h l'orologio stringe le celle del **layout A** di 2 px e
  aggiunge «PM». Ricalcolando `prv_grid_steps`/`prv_place_row_fit` dalle maschere vere, l'unica
  combinazione in cui la disposizione cambia davvero è **flint + Bebas in layout A** (passo 26
  invece di 28, riga 116 px invece di 124, blocco a x 10 invece di x 14: fino a 4 px di scarto); su
  emery le due celle danno le stesse posizioni per tutti e cinque i font, e su flint per quattro su
  cinque. È una limitazione **strutturale**, da dichiarare, non da correggere. (3) La **Quick View**
  e il content size **ExtraLarge**. (4) Con **LECO** (font di sistema) le cifre in layout **A**: lì
  l'anteprima mostra la sola foto con la didascalia «font di sistema: nessuna anteprima» — ma in
  layout **B** disegna le cifre **Anton**, esattamente come fa l'orologio (`ui_time.c
  prv_load_strips`: `strip_b = sprite ? strip : 0`), quindi «LECO → sola foto» vale **solo per il
  layout A**. (5) Qualunque errore del motore: il canvas sparisce e resta `preview_unavailable`.
- **D48 — fedeltà misurata**: `test/gen_preview_fixture.py` → `test/fixture_preview.js` (20 casi =
  2 piattaforme × 5 font × layout A/B, posizioni di «12:34» calcolate con le funzioni Python di
  `gen_digits.py`, CRC32 delle mappe di indici 0..3 e le 8 decisioni luma delle foto demo) e
  `test/test_preview.js` **1.675** controlli, 0 fail (il 1.670 scritto in S12 era un errore di
  trascrizione: file invariato, misura 1.675): 660 campi di posizione e 90 CRC identici alla
  fixture, luma identica al «Colore del testo previsto» di `resources/photos/README.md`, **30
  mutanti uccisi su 30** (i 6 chiesti da D48 compresi). `test_page.js` **1.592** sui sorgenti e
  **1.620** sull'inlinato (sezioni 6a–6f nuove). Gate in Firefox del 06/09 (screenshot in
  `docs/design/galleria/`): `s12_page_prev_dark_anton_a.png`,
  `s12_page_prev_dark_francois_t3d_b.png`, `s12_page_prev_light_francois_t3d_b.png` (nero
  automatico), `s12_page_tiles_eye.png`; e il **confronto al pixel** con l'emulatore sulla stessa
  foto e le stesse impostazioni (`s12_page_prev_canvas_dark_francois_t3d_b.png` contro
  `s12_emery_b_francois_t3d_dark.png`): riga HH «12» **identica**, bbox dell'anello bianco
  40,11,165,107 e **1.541 pixel** in entrambe.

## Revisione UX-2 (13/09/2026) — struttura nuova della pagina, via le anteprime PNG dei font

Sessione **UX-2** del piano `galleria-s13-ux-casual.md` (§3 «la pagina nuova», voci U-03, U-04,
U-08, U-09, U-10, U-11, U-12, U-16; contratto `~/galleria-gate/ux/ux2/CONTRATTO-UX2.md`, decisioni
**D80–D99**). **Nessuna modifica al C** (statico invariato 29.080 / 28.968 B) e nessuna al
protocollo: cambiano `page.html`, `page.css`, `page.js`, `page_core.js`, il dizionario e i tool.
Questa sezione è la **struttura di riferimento di oggi** e vince sull'elenco di §5.

**Ordine dei blocchi** (id fra parentesi; l'ordine è un contratto, i test lo verificano):
1. **Intestazione** (`#head`): `h1` «Galleria»; riga dell'orologio (`#watch`) con il **nome proprio**
   — «Pebble Time 2» cablato in `page.js`, `watch_flint` «Pebble 2 Duo · bianco e nero», altrimenti
   `watch_unknown` —; `#kb` in grigio (classe `help`), **scritto sempre** ma visibile solo da
   `kb >= cap / 2` in su (D91); `#status` (classi `warn err`) con la sola riga **inglese cablata**
   quando lo stato non è arrivato (D83: senza stato non c'è nemmeno il dizionario) e il dettaglio
   tecnico nel `title`; `#slow` ridotto a `slow_lead` + un pulsantino «Aiuto» (`#slowHelpBtn`) che
   apre `#helpBody` e fa `scrollInto(#help)`, con `#slowFix` **vuoto** (la procedura sta una volta
   sola, nell'Aiuto) — D81.
2. **«Le tue foto»** (`#photos`): riga «Aggiungi foto» **sopra** le tessere (`#file` prima di
   `#add`, poi `#addHelp` a larghezza piena), `#add` blu (`btn primary`) con posto e grigio
   (`btn off`) con l'album pieno; contatore `#photosCap`; `#tiles`; `#photosHint` («Questo è
   l'ordine delle foto: ▲ ▼ per cambiarlo») solo quando l'ordine conta davvero — almeno due foto
   riordinabili, ordine «come l'elenco» e una rotazione attiva (intervallo ≠ «mai» oppure la
   scossa), D93 —; poi l'`h3`
   **«Cambio foto»** (`sec_rotation`) con le tre righe della rotazione — `s_interval_min`,
   `s_order`, `s_shake_next` — **spostate qui da `#settings`** (D80).
3. **Editor** (`#editor`): invariato in UX-2 (tocca a UX-3), salvo la `label.chk` attorno a
   `#sunlight`. 🔁 **Rifatto da UX-3** (D104/D113/D114): nome del file, cornice con le corsie,
   anteprima della watchface sotto la cornice e blocco «Regolazioni della foto» — vedi
   §«Revisione UX-3» in fondo.
4. **Impostazioni** (`#settings`): `h2`, nota `#settingsNote` grigia mostrata **solo se vera**
   (D82: `!settingsSet && C.settingsDiffer(watch)`, con `DEFAULTS_CRC = 0x7EE7` in `page_core.js`);
   `h3` **«Aspetto dell'ora»** (`sec_look`) con Disposizione, **riga del Font** (`#fontRow`:
   etichetta, `#fontPrev` «‹», `select#s_font`, `#fontNext` «›» — D87, `cycleFont(dir)` salta le
   option `disabled` e gira), Stile cifre, i due aiuti (`#s_style_hint` con stile a contorno e font
   0–2, `#styleFlintHelp` solo su Duo), Colore dell'ora; poi **«Anteprima»** (`#wfPrev`) a
   **grandezza naturale** (D92: `cv.style.width = (r.width / 2) + 'px'` = 200 px CSS su emery,
   144 su flint, backing ×2 invariato) con una didascalia a tre stati e note solo quando vere
   (D90); infine il contenitore **`#misc`** (bordo superiore) con la **Lingua** come ultima riga
   visibile (D49; le sei option degli endonimi portano `lang="xx"`) e il pulsante **«Altre
   impostazioni»** (`#advBtn`, `aria-expanded`/`aria-controls`, freccia ▾/▴) che apre `#advBody`:
   Formato ora, Zero davanti all'ora, Bordo di contrasto (**mai disabilitato**, D62/D98) e la riga
   `#infoRow` «Sotto l'ora» con quattro caselle (`role="group"`/`aria-labelledby="infoRowLbl"`),
   nascosta con «Ora grande» ma con i bit **conservati** nel payload. `#advBody` si apre da solo
   all'avvio se uno di quei valori non è di fabbrica o se lo stato manca (D88).
5. **Aiuto** (`#help`) e **piè di pagina** (`#footer`): invariati (il footer tocca a UX-3).
   🔁 **Rifatto da UX-3** (D107/D120/D121): i due pulsanti cambiano nome invece di spegnersi e sotto
   il messaggio c'è la riga `#hint` — vedi §«Revisione UX-3» in fondo.

**Option non disponibili su Pebble 2 Duo** (D86): un solo meccanismo, `UNAVAIL` +
`applyUnavailable(name, sel)` in `page.js`, per **due** select — `digit_style` (le due con ombra) e
`text_color` (giallo e blu) —: `disabled` **e** `hidden` insieme (mai `hidden` da solo: iOS lo
ignora), testo avvolto da `opt_style_no_flint` «{0} (non sul Duo)» e rimappaggio del valore come in
`ui_time.c:683–684` (3 → 1, 4 → 2). Le due option di `s_text_color` hanno gli id
`s_text_color_y`/`s_text_color_b`.

**Via le anteprime PNG dei font (D95/U-10)**: `src/pkjs/config/previews.js` **cancellato**, il suo
`<script src="previews.js" data-optional="1">` e l'`<img id="fontPreview">` fuori da `page.html`,
la regola `.fontprev` fuori da `page.css`, `PREV_KEYS`/`GalPreviews` fuori da `page.js`,
`previews.js` fuori da `SCRIPT_ORDER`, `gen_font_previews.py --check` fuori da `pagecheck`. Il tool
**resta** in `tools/` (docstring e `tools/README.md` §14 dicono che non è più nella build): il nome
del font si giudica sull'anteprima vera della watchface, che è lì sotto.

**Reti a costo quasi zero (U-16)**: `<meta name="color-scheme" content="only light">` +
`html { color-scheme: only light }` (`only` è l'opt-out del Force Dark di Chromium/WebView),
`select { max-width: 100%; min-width: 0 }`, `.chk { display:inline-flex; align-items:center;
min-height:40px }` sulle sei label con casella, `.btn.small { min-width: 40px }`.
⚠️ Una regola in più rispetto al contratto, tenuta dopo misura in Firefox: `#fontRow .rlab
{ flex-basis: 100% }` (+37 B), senza la quale a 360 e 400 px la riga del Font si spezza male
(a 400 px resta orfana la freccia destra). Effetto: `#fontRow` sta su **due righe a ogni
larghezza**, ≈ +29 px di altezza della pagina.

**Misure di fine UX-2** (13/09/2026, rimisurate dopo le correzioni della revisione): HTML inlinato **83.865 B**
(81,9 KB; era 81.028 B a fine S12, lo stato che sarebbe dovuto uscire come 0.3.0, mai pubblicata, **+2.837 B**,
e 82.166 a fine UX-1, **+1.699 B**), modulo `config_page.js` **86.544 B**, margine **14.439 B** sul tetto di
96 KB e **135 B** sotto il criterio del gate («mai oltre 84.000 B»), nessun avviso soft (`SOFT_BYTES` 86.016). Sorgenti:
`page.html` 6.727 B (75 id, nessun duplicato), `page.css` 10.063 B, `page.js` 54.508 B,
`page_core.js` 17.380 B. Dizionario a **132 chiavi** (`i18n/messages.json` 38.127 B,
`src/pkjs/i18n.js` 34.859 B, **35.024 caratteri** di base64url nell'hash — 26.268 B di JSON UTF-8).
URL `data:` ad album vuoto (36 caratteri di prefisso + base64 della pagina + `#` + hash):
**191.164 caratteri su emery** (pagina in base64 111.820 + hash 79.306) e **167.497 su flint**
(hash 55.639). Test: `test_page.js` **2.122** controlli sui sorgenti e **2.147** sull'inlinato
(erano 1.718/1.746), `test_preview.js` **1.675**, `build_config_page.py --selftest` **106**,
`build_i18n.py --selftest` **32**, `gen_font_previews.py --selftest` **40**, suite intera verde.
⚠️ Con 135 B di margine sul criterio del gate, qualunque nodo o testo aggiunto in UX-3 se lo mangia:
misurare la pagina **prima** di aggiungere, non dopo.

## Revisione UX-3 (13/09/2026, notte) — il flusso della foto: editor, tessere, piè di pagina

Sessione **UX-3** del piano `galleria-s13-ux-casual.md` (§3.2–§3.3 e §3.7, voci U-04, U-05, U-06,
U-07, U-13, U-14; contratto `~/galleria-gate/ux/ux3/CONTRATTO-UX3.md`, decisioni **D104–D125**).
**Nessuna modifica al C** (statico invariato 29.080 / 28.968 B) né al protocollo: cambiano
`page.html`, `page.css`, `page.js`, `page_core.js`, il dizionario, `test/test_page.js` e il selftest
del dev server. Questa sezione **vince** su §5 e completa la «Revisione UX-2»: là c'è la struttura
della pagina, qui il pezzo che UX-2 aveva lasciato indietro — la foto, dal tocco su «Aggiungi» al
tocco su «Salva».

**1. Editor** (`#editor`, ordine dei nodi fissato da **D104**, i test lo verificano): `h2` «Ritaglio» →
**`#editName`** (solo il nome del file troncato da `C.truncateName`; i pixel `W×H px` stanno nel
`title` insieme al nome intero — nome proprio e numeri, fuori dal dizionario, **D115**) →
`#cropWrap` con `#crop` → l'aiuto `crop_hint` → riga Zoom + «Riparti da capo» → **canvas
`#preview`** → **`#editPrevCap`** → `#addRow` (la coppia inline «Usa questa foto»/«Non aggiungere»,
**nascosta** ma con id e listener intatti: **D119**, i test la cliccano ancora) → il pulsante
**«Regolazioni della foto»** (`#editAdvBtn`, `aria-expanded`/`aria-controls`, freccia ▾/▴, stessa
`initToggle` di UX-2) → `#editAdvBody` con Luminosità, Schiarisci le ombre, Sfumature, «Ottimizza
per lo schermo dell'orologio», Colori e `#etime`.
- **La cornice lascia le corsie** (**D113**): `#cropWrap { padding: 0 28px }` e `ed.Fw = max(120,
  min(300, clientWidth − 56, floor((innerHeight − 220) × 200 / 228)))`, `ed.Fh = round(Fw × 228/200)`
  — così il pollice ha 28 px per lato dove scorrere la pagina senza trascinare la foto, e la cornice
  non supera l'altezza utile. Senza misura (DOM finto, WebView non ancora impaginata) restano i
  300 px di sempre; si misura **solo** all'apertura, nessun handler di resize.
- **Un solo motore, due canvas** (**D105**): `renderPreview()` disegna in `#preview` quando l'editor
  è aperto e `ed.last.raw` esiste — con `sunlight` preso da «Colori» — e in `#wfPreview` altrimenti;
  `#wfPrev` sparisce finché l'editor è aperto e torna in `closeEditor` **prima** del render finale.
  Il canvas dell'editor mostra quindi la **watchface**, non più la sola foto quantizzata: stesse
  cifre, stesso colore automatico, stesso contorno della sezione «Anteprima». Backing ×2 e
  larghezza CSS a grandezza naturale (`pv.style.width = ed.w + 'px'`: 200 px su emery, 144 su
  flint), CSS `#preview { box-sizing: content-box; width: auto; max-width: 100%; … }` (senza
  `content-box` il bordo di 1 px toglierebbe 2 px al contenuto: la lezione di D92). Un cambio di
  font, stile o colore con l'editor aperto ridisegna **quel** canvas. `drawPreview(r)` è diventata
  `renderPreview()`; `G.timing.renderMs` misura l'ultimo `GalPreview.render`.
- **Didascalia dell'editor** (**D106**): dopo un render riuscito `edit_preview_cap` «Così si vede
  sull'orologio», **ma** una nota del motore vince sempre sulla frase fissa (`leco` prima di
  `no_masks`); se il render fallisce il canvas **non** si nasconde — sotto la cornice resterebbe un
  buco — e la didascalia diventa **`preview_stale`** «Anteprima non aggiornata: vale il ritaglio
  nella cornice» (la chiave sostituisce `preview_off`; senza punto finale, come tutta la famiglia
  `preview_*` che divide con lei il nodo `#editPrevCap`: revisione UX-3, G36). In nessuno dei due casi si scrive nel
  footer: quello è per gli eventi. Su `#wfPreview` il fallimento resta quello di S12
  (`preview_unavailable`, canvas nascosto).
- **«Regolazioni della foto»** (**D114**) nasce chiusa, ma i suoi valori restano da una foto
  all'altra: se gamma, lift, dithering, «Ottimizza» o «Colori» non sono più di fabbrica il blocco si
  apre **da solo** (altrimenti una foto scurita sarebbe un effetto senza causa visibile). `#etime`
  (tempi di resample/encode) si vede **solo** con `G.state.dev` ed è una stringa inglese cablata:
  `edit_time` esce dal dizionario.

**2. Tessere** (**D110–D112**): la **✕ chiede conferma con se stessa** — il primo tocco arma
(`G.armDel`, classe `arm` rossa sulla ✕, `aria-label` = `msg_del_arm`, messaggio «Tocca di nuovo ✕
per togliere *nome*» in giallo), il secondo toglie davvero; un tocco sulla ✕ di un'altra tessera
sposta l'arma e **qualunque altra azione** disarma (il disarmo sta in `updateKb`: frecce, aggiunta,
impostazione, lingua, chiusura dell'editor). **Nessun timer** (D66): lo stato si vede. La colonna
dei pulsanti diventa `flex-flow: row wrap` a 88 px (▲ ▼ affiancati, ✕ da sola 16 px sotto) con
`flex-shrink: 0` — misurato in Firefox: senza, le frecce si incolonnano —, e `.name` va **su due
righe** (`white-space: normal; overflow-wrap: break-word; overflow-wrap: anywhere; word-break:
normal; max-height: 2.8em`) invece dei puntini su una riga sola; il `title` col nome intero resta.
La rottura preferita è fra il nome e l'estensione: nel solo testo **visibile** `tileNode` infila uno
zero-width space (U+200B) prima dell'ultimo punto, mentre `title`, `aria-label` e messaggi tengono
il nome intatto (revisione UX-3, G19: con `break-all` si leggeva «light_landscap / e.jpg»; i due
`overflow-wrap` sono l'uno il ripiego dell'altro sulle WebView vecchie). L'**occhio** dell'anteprima compare solo quando c'è da
scegliere, cioè da **due foto nuove in su** (**D111**): con una sola l'anteprima la mostra lo
stesso e un interruttore a una via sarebbe un pulsante che non fa niente; il tocco sull'occhio porta
la vista sulla sezione «Anteprima».

**3. «Aggiungi foto»** (**D109** + **D117**): una sola funzione, `renderAdd()`, con quattro stati in
ordine di precedenza — **pieno** (grigio, spento, «Massimo 12 foto: togline una per aggiungerne un'altra») > **caricamento** (grigio,
«Un momento…», `#file` **attivo**: il doppio tocco lo neutralizza già la generazione `gen`) >
**tetto vicino** (grigio, spento, «Salva queste foto, poi riapri le impostazioni per aggiungerne
altre») > **normale** (blu). Il terzo stato è la **prevenzione del tetto** (U-14): `page_core.js`
esporta `NEXT_PHOTO_KB = { 1: 52, 2: 10 }` (il caso peggiore di una foto in più, dati + miniatura,
non la media) e `updateKb` calcola `G.capNext = !full && !G.overCap && (kb + NEXT_PHOTO_KB[fmt] >
cap)`: sopra il tetto comanda il messaggio rosso di sempre e `capNext` resta falso, perché lì la ✕
deve poter riportare sotto. `msg_loading` resta nel footer (dice il nome del file) accanto al
pulsante «Un momento…»: sono complementari (D124).

**4. Piè di pagina** (**D107**, **D120**, **D121**): i due pulsanti **cambiano nome invece di
spegnersi**. `footerLabels()` (chiamata da `footerButtons()`, e da `applyLang` in coda) ha quattro
stati in precedenza: **editor aperto** → «Usa questa foto» / «Non aggiungere», nessuno dei due
spento; **Esci armato** → «Esci comunque» in rosso (`.btn.danger`); **modifiche** → «Esci senza
salvare»; **pagina pulita** → «Chiudi». Salva resta spento solo sopra il tetto o senza stato. I
`data-i18n` sono usciti da `#save` e `#cancel` (i testi li scrive solo `footerLabels`). Sotto `#msg`
(`role="status" aria-live="polite"`; `#status` `role="alert"`, `#slow` `role="status"`) c'è la riga
grigia **`#hint`**, senza ruolo: `unsaved_hint` con modifiche, `footer_send` se fra le modifiche ci
sono foto nuove («Dopo Salva, le foto passano all'orologio una alla volta: tieni aperta l'app
Pebble»: stesso verbo di `help_sync`, revisione UX-3, G34), nascosta quando Salva non si può toccare o l'editor è aperto. `fitFooter()` — il
ricalcolo del `padding-bottom` del corpo, già dentro `setMsg` — è estratta e registrata anche su
`resize` e `orientationchange`; `.btn` diventa `inline-flex` con `min-height: 40px` e
`line-height: 1.2`, così un'etichetta a due righe (tedesco, francese a 360 px) resta dentro il box;
`body` ha `padding: 0 12px 150px` e `#footer p { max-height: 8em; overflow-y: auto }`. Sul telefono
(**D108**) Salva mostra `msg_sending` «Invio all'orologio…», si spegne e torna attivo dopo 5 s se la
WebView non si è chiusa; il messaggio resta. Dopo l'aggiunta la vista va sulla **tessera nuova**,
dopo «Non aggiungere» su «Aggiungi foto» (**D118**), e il verde `msg_added` compare solo se Salva è
davvero toccabile (con lo stato assente o sopra il tetto non si invita a un pulsante spento).

**5. Dizionario** (**D116**): **132 − 8 + 11 = 135 chiavi**. Escono `edit_name`, `edit_time`,
`preview_off` (→ `preview_stale`), `msg_close_crop` e i quattro `err_*` dell'editor, che vivevano
solo nel `title` di `#msg` e diventano stringhe inglesi cablate (stessa regola di D72); entrano in
coda `btn_loading`, `msg_del_arm`, `edit_adv_btn`, `preview_stale`, `edit_preview_cap`,
`msg_sending`, `btn_close`, `btn_cancel_armed`, `unsaved_hint`, `footer_send`, `cap_next_help`.
`edit_name` era la chiave **45**: gli indici scalano da lì, quindi `i18n.js`, `test/fixture_i18n.js`
e `config_page.js` si rigenerano insieme. `tools/build_i18n.py` **non cambia** (nessuna chiave nuova
è una `<option>` o una `.rlab`); del selftest del dev server cambia solo il nome dello script
facoltativo di prova, ora `extra.js` (G34 di UX-2).

**Misure di fine UX-3** (13/09/2026 notte, **dopo la revisione**): HTML inlinato **85.446 B**
(83,4 KB; era 83.865 a fine UX-2, **+1.581 B** netti), modulo `config_page.js` **88.254 B**, margine
**12.858 B** sul tetto di 96 KB e **570 B sotto l'avviso soft** di 86.016 B — **spento**
(`build_config_page.py --check` esce 0 senza avvisi). All'integrazione la pagina misurava 87.244 B
(+3.379 lordi, 1.228 sopra l'avviso): l'orchestratore l'ha riportata sotto con la sola leva a costo
zero, i **38 commenti a fine riga** di `page.js` (33) e `page_core.js` (5) spostati su righe proprie
— l'inliner toglie le righe di commento intere, non la coda di una riga di codice: **−2.250 B** —, e
le correzioni della revisione hanno poi aggiunto **+452 B**; le leve (a) codice morto e regole CSS
doppie e (b) frecce del font (D63) **non sono state usate**.
Sorgenti: `page.html` 7.196 B (81 id, nessun duplicato), `page.css` 19.205 B, `page.js` 71.106 B,
`page_core.js` 17.915 B; dopo lo strip dell'inliner — quello che conta — `page.js` 36.815 B,
`pipeline.js` 14.592, `preview.js` 12.228, `page_core.js` 11.315, `page.css` 5.264, `page.html`
7.190 (l'HTML perde solo le righe vuote: commenti e indentazione restano, `_strip_text(..., 'html')`).
Dizionario a **135 chiavi** (`i18n/messages.json` 39.820 B, `src/pkjs/i18n.js` e
`test/fixture_i18n.js` 36.486 B, **36.915 caratteri** di base64url nell'hash: +1.891 su UX-2).
URL `data:` ad album vuoto: **195.161 caratteri su emery** e **171.495 su flint** = **36** di
prefisso (`data:text/html;charset=utf-8;base64,`) + **113.928** di pagina in base64
(`b64.encodeUtf8Std`: +2.108 sui 111.820 di UX-2) + `#` + hash **81.196** / **57.530** —
in emulatore si leggono 81.210 / 57.543 perché in dev `"dev":true` costa un carattere meno di
`"dev":false` —; erano 191.164 / 167.497 a fine UX-2 (stessa aritmetica:
36 + 111.820 + 1 + hash 79.307 / 55.640 sul telefono, 79.306 / 55.639 letti in emulatore; il
prefisso è **36** caratteri, non 37 come si era scritto in un paio di documenti).
L'hash è stato letto in emulatore **prima** dei tre ritocchi del dizionario della revisione
(`unsaved_hint` de, `footer_send`, `preview_stale`: −10 B di JSON): una rimisura toglie 14
caratteri su emery e 13 su flint. Test:
`test_page.js` **2.680** controlli sui sorgenti e **2.705** sull'inlinato (erano 2.122 / 2.147),
`test_preview.js` **1.675** e `test_pipeline.js` **439** (i due file non sono stati toccati: md5
invariati, come vuole il gate), `build_config_page.py --selftest` **106**, `build_i18n.py --selftest`
**32**, dev server **257**, suite intera verde in ≈ 58 s.

## Revisione UX-4 (14/09/2026) — niente di nuovo nella pagina, numeri di fine sessione

Sessione **UX-4** (contratto `~/galleria-gate/ux/ux4/CONTRATTO-UX4.md`, decisioni **D126–D133**): la pagina
**non cambia comportamento**. **D127** ammette due soli ritocchi, entrambi residui di UX-3 giudicati veri e a
costo ≤ 30 B: il `pos()` della cornice in `page.js`, che toglieva 1 px di bordo e divideva per `r.width − 2`
mentre `#crop` è `content-box` con bordo di 1 px e il rect è il border box (**+20 B**), e `.chk { gap: 4px }`
in `page.css`, lo spazio fra casella e testo rimasto indietro da UX-2 (**+10 B**), con **7 pin nuovi** in
`test_page.js`. **D133** ritocca **una sola stringa del dizionario** (`preview_stale` in francese, che era
l'unica lingua senza il complemento di luogo: «… c'est le recadrage **dans le cadre** qui compte»), quindi
`i18n.js`, `fixture_i18n.js` e `config_page.js` sono stati rigenerati insieme, come sempre. Nessun altro
residuo è stato toccato: G19 (nome del file spezzato a 360 px), G18 (badge tedeschi su due righe a 360),
G23 (`aria-expanded` su `#slowHelpBtn` sarebbe **falsa**: quel pulsante è un «vai a», e `aria-controls` basta),
G37 (pagina senza stato: irraggiungibile dal telefono), G33 (de già distinto) e l'occhio con l'editor aperto
(scroll no-op, scelta applicata alla chiusura dell'editor) restano documentati con il loro motivo.

**Misure di fine UX-4.** Pagina inlinata **85.476 B**, modulo `config_page.js` **88.284 B**: **+30 B** su
UX-3 (85.446 / 88.254), cioè esattamente i due ritocchi; margine **12.828 B** sul tetto di 98.304 e **540 B
sotto** l'avviso soft di 86.016, che non si accende. Sorgenti a fine UX-4: `page.css` **19.215 B** (+10)
e `page.js` **71.315 B** (71.106 di fine UX-3 + i 20 B di `pos()` e 189 B di righe che l'inliner toglie);
`preview.js` **20.826 B** e `pipeline.js` **20.905 B** intatti. 🔁 **Misura del 17/09/2026**: `page.js` è
**invariato dal 14/09**, `page.css` è stata riscritta a **19.310 B** (+95 B di sole righe che l'inliner
toglie); dopo lo strip restano **36.835 B** di `page.js` e **5.274 B** di `page.css`, cioè i soli +20 e +10
B di D127 su UX-3, e `build_config_page.py --check` esce 0 rigenerando lo stesso artefatto (HTML **85.476 B**,
modulo **88.284 B**). Dizionario a **135 chiavi**:
`i18n/messages.json` **39.834 B** (+14), `src/pkjs/i18n.js` e `test/fixture_i18n.js` **36.500 B** ciascuno
(+14), **36.934 caratteri** di base64url nell'hash (+19). URL `data:` ad album vuoto **195.223 caratteri su
emery** e **171.556 su flint** = 36 di prefisso + **113.968** di pagina in base64 + `#` + hash **81.218** /
**57.551**; con **12 foto e le miniature vere** del gate **221.703** / **198.020**, e con 12 miniature al
tetto di 6.000 caratteri l'una (caso peggiore) **292.908** / **269.225** — da confrontare con i **128–138 k**
mai superati sull'iPhone e i **198–201 k** già aperti su Android: è la prova del gate U-18b. Test:
`test_page.js` **2.687** sui sorgenti e **2.712** sull'inlinato (+7 pin), `test_preview.js` **1.675** e
`test_pipeline.js` **439** con i file non toccati, `build_config_page.py --selftest` **106**,
`build_i18n.py --selftest` **32**, dev server **257**; a `make -C test` si aggiunge **`glosscheck`**
(`tools/galleria_gloss_check.py`, D132: il glossario di `galleria-s10-i18n.md` §3, ora **completo a 135
chiavi**, confrontato chiave per chiave con `messages.json`).

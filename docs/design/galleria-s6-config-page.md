# Galleria — specifica S6: config page (crop, quantizzazione, anteprima, impostazioni)

> Versione 1.1, 30/08/2026 (1.0 del 29/08 + precisazioni dall'implementazione, segnate «impl.»). Specifica operativa della sessione S6 (`apps/galleria/PIANO.md` §4 S6). Integra `docs/design/galleria.md` §6 (che a fine sessione ne riporterà la sintesi) e §5.1 (album e payload, S5b). Il riferimento byte-esatto della pipeline immagine è `tools/photo_prep.py` v1 (`tools/README.md` §9), **non** gli snippet di `docs/ricerca/galleria/05-colore-quantizzazione.md` (che per flint descrivono un packing diverso: il formato dell'orologio è raw1 = 1BitPalette MSB-first, 18 B/riga, 3.024 B, come in `photo_prep.pack1`).

Percorsi relativi a `apps/galleria/` salvo indicazione. Tutto il codice della pagina è **ES5** (var, function, niente arrow/let/const/class/template literal/spread), con typed array e API canvas (la pagina gira nella WebView di configurazione dell'app Pebble: Android Chrome ≥ 80, iOS WKWebView ≥ 16; e in Firefox/Chrome desktop dal dev server). Nella pagina **niente `localStorage`/`sessionStorage`/cookie** (origine opaca del `data:` URL: l'accesso lancia SecurityError) e nessuna risorsa esterna (font, CDN, immagini remote): tutto inlinato.

## 1. File e contratto di inlining

```
src/pkjs/config/page.html        markup (S10: testi via data-i18n, nodi vuoti), viewport mobile, nessuna risorsa esterna
src/pkjs/config/page.css         stile (≤ 6 KB): una colonna, max-width 480 px, usabile a 360–400 px
src/pkjs/config/pipeline.js      PURO (no DOM): pipeline immagine byte-esatta con photo_prep.py + CRC32 + base64url + rettangoli
src/pkjs/config/page_core.js     PURO (no DOM): stato ← hash, costruzione payload, slot, ordine, KB, validazione impostazioni
src/pkjs/config/previews.js      OPZIONALE (compito B1): window.GalPreviews = { anton: 'data:image/png;base64,…', bebas: …, barlow: … } (≤ 4 KB totali)
src/pkjs/config/page.js          UI (DOM, canvas, eventi, trasporto): usa GalPipeline, GalPageCore, GalPreviews
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
<script src="previews.js" data-optional="1"></script>
<script src="page.js"></script>
```
L'inliner sostituisce **ogni** `<link rel="stylesheet" href="X">` con `<style>…</style>` e ogni `<script src="X">` con `<script>…</script>` (X = file locale nella stessa cartella; niente sottocartelle, niente URL). Un file mancante è un errore, salvo `data-optional="1"` (il tag viene rimosso). Il contenuto inlinato non può contenere il marcatore di chiusura del **proprio** tipo (`</script>` in un .js, `</style>` in un .css: l'inliner lo verifica e fallisce; impl.: un `<!--` seguito da `<script` in un .js è vietato — «script data double escaped»); gli attributi dei tag sostituiti (`defer`, `type="module"`, `media`) vengono scartati con un avviso: tenere i tag nudi. Ordine degli script obbligatorio: pipeline → page_core → previews → page. I moduli puri espongono un oggetto globale nel browser **e** `module.exports` in node:
```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.GalPipeline = factory(); }
}(this, function () { … return api; }));
```
(stesso schema per `GalPageCore`, che in node fa `require('./pipeline')` se `GalPipeline` non è globale: usare `typeof GalPipeline !== 'undefined' ? GalPipeline : require('./pipeline')`).

Budget: HTML+CSS+JS inlinati **< 60 KB** (l'inliner lo misura e fallisce oltre 64 KB). Impl.: l'inliner toglie per default le righe di commento intere, le righe vuote e l'indentazione dagli asset js/css (`--no-strip` per l'output grezzo; sicuro perché in ES5 una stringa non attraversa una riga) → sorgenti 65,5 KB ⇒ HTML inlinato 54.540 B (58.141 B dopo le correzioni della revisione; modulo 59.987 B); `previews.js` è generato da `tools/gen_font_previews.py` (non modificare a mano). La LUT sunlight 32³ (32 KB) **si calcola a runtime** (non va inlinata).

## 2. Stato PKJS → pagina (hash dell'URL)

Il PKJS (`index.js`, `showConfiguration`) apre la pagina con lo stato nell'**hash**, identico sul telefono e in emulatore:
- telefono: `Pebble.openURL('data:text/html;charset=utf-8,' + encodeURIComponent(html) + '#' + stateB64)`
- emulatore (`Pebble.platform === 'pypkjs'`): `Pebble.openURL('http://localhost:8765/config.html#' + stateB64)`; `pebble emu-app-config` aggiunge `?return_to=http://localhost:<porta>/close?` **prima** dell'hash (`url_append_params` usa `urlparse`/`urlunparse`: il frammento sopravvive) e scrive un file `~/pebble-tool-emu-app-config-*.html` con `<meta http-equiv="refresh" content="0;URL=<url>">` che apre nel browser (con `BROWSER=true` non apre nulla: il gate legge l'URL da quel file).

`stateB64` = base64url **senza padding** (alfabeto `A-Za-z0-9-_`, come `b64.js`) dei byte UTF-8 di `JSON.stringify(state)`. Decodifica nella pagina: `location.hash.slice(1)` → base64url → byte → UTF-8 → JSON (implementare la decodifica UTF-8 a mano o con `TextDecoder` se esiste; provare con nomi tipo `città`). Hash assente o non decodificabile ⇒ stato vuoto di default + avviso "stato non ricevuto: modalità prova" (la pagina resta usabile).

```js
state = {
  v: 1,
  platform: 'emery' | 'flint' | 'unknown',   // Pebble.getActiveWatchInfo().platform (try/catch), oppure watch.format
  fmt: 1 | 2,                                 // formato dell'orologio collegato: 1 = raw6 200×228 (emery), 2 = raw1 144×168 (flint)
  cap_kb: 900 | 200,                          // tetto del payload per Save: 900 (Android, pypkjs), 200 (iOS: D1 ❓)
  dev: true | false,                          // Pebble.platform === 'pypkjs'
  settings: { layout, font, clock_mode, leading_zero, text_color, outline, interval_min, order, shake_next, info_row },
  settingsSet: bool,                          // false ⇒ la pagina mostra i default e avvisa "non ancora salvate"
  photos: [12 × (null | { id, name, thumb?, fmts: { "1"?: {len, crc}, "2"?: {len, crc} } })],   // indice = slot (album.state().photos)
  order: [slot…],                             // ordine di rotazione locale
  deleted: [slot…],                           // eliminazioni non ancora confermate dall'orologio (la pagina le tratta come "già eliminate")
  watch: null | { at, format, maxChunk, settingsCrc, openMs, slots: [12 × {state, crc}], foreign: [slot…] },  // ultimo HELLO
                                              // openMs (v1.9) = ms dell'apertura del file persist sull'orologio (HELLO.OPEN_MS); null = non noto (orologio o snapshot pre-v1.9), 0 = non misurato
  lang_auto: 'en' | 'it' | 'de' | 'fr',       // S10/D33: lingua della pagina quando settings.lang vale 0 (dal PKJS: orologio → navigator → en; in DEV l'hook --lang)
  i18n: { en: [...], it: [...], de: [...], fr: [...] }   // S10/D35: TUTTI e quattro i dizionari (121 voci l'uno, nell'ordine delle chiavi di messages.json): il cambio lingua nella pagina e' istantaneo
}
```
Dimensione: ≤ 12 miniature × ≤ 6.000 caratteri + JSON ≈ 75 KB → base64url ≈ 100 KB. **S10**: i dizionari aggiungono ≈ 19,9 k caratteri di base64url (misurati con `node` su `src/pkjs/i18n.js`); con l'album vuoto l'URL `data:` completo è ≈ 127 k caratteri (HTML percent-encoded 106.987 + hash 20.114), lontano dal tetto Android di 2 MiB. `fmt` decide TUTTO nella pagina (formato prodotto, dithering offerti, anteprima, rettangolo flint); `platform` serve solo all'etichetta.

## 3. Payload pagina → PKJS

Sempre lo stesso oggetto, sui due trasporti:
```js
payload = {
  v: 1,
  settings: { …10 campi interi validati (§5) },          // SEMPRE presente: dopo il primo Salva il telefono è l'autorità (settingsSet)
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

```js
GalPageCore = {
  SETTINGS_FIELDS: [[nome, min, max, default] × 11]  (= album.js SETTINGS_FIELDS: layout 0-1/0, font 0-5/0, clock_mode 0-2/0, leading_zero 0-2/0,
                     text_color 0-4/0, outline 0-2/0, interval_min 0-1440/30 (valori ammessi 0,5,15,30,60,180,1440), order 0-1/0, shake_next 0-1/1, info_row 0-15/15,
                     digit_style 0-3/0 (S8-stile) e lang 0-4/0 (S10/D31, byte 13), in coda: l'ordine dell'array non è quello dei byte),
  INTERVALS: [0, 5, 15, 30, 60, 180, 1440],  MAX_SLOTS: 12,  MAX_THUMB_CHARS: 6000,  MAX_NAME: 64,
  decodeState(hashString) → state normalizzato (default per ogni campo mancante; mai lancia; `ok:false` + `error` se l'hash non è valido),
  b64urlToBytes(str) → Uint8Array,  utf8Decode(bytes) → string,   // per l'hash
  normalizeSettings(obj) → {11 campi} (fuori intervallo ⇒ default del campo; interval_min non in INTERVALS ⇒ 30; font 3 con layout 1 ⇒ font 0; font 3 (LECO) ⇒ digit_style 0),
  buildTiles(state) → [tile…]   // tessere iniziali: per ogni slot in state.order con foto ⇒ {slot, kind:'album', name, thumb, hasFmt: !!fmts[state.fmt], pending: crc diverso da watch.slots[slot].crc o slot non VALID};
                                // foto dell'album fuori da order ⇒ accodate; poi watch.foreign (non in deleted) ⇒ {slot, kind:'foreign'}; slot in state.deleted esclusi
  freeSlot(tiles, deleted) → slot   // primo 0..11 non usato da nessuna tessera; preferisce gli slot MAI usati a quelli appena eliminati; -1 se pieno
  buildPayload(model) → payload (§3)   // model = {settings, tiles (ordine finale), deleted, added: [{slot, photo_id, fmt, len, crc, data, name, thumb}]}
  payloadKb(payload) → intero (ceil(JSON.stringify(payload).length / 1024)),
  capMessage(kb, capKb, nAdded) → string | null,
  thumbFits(dataUrl) → bool (≤ 6000 caratteri e inizia con 'data:image/'),
  truncateName(name) → ≤ 64 caratteri,
  SLOW_OPEN_MS: 1000,                            // v1.9: soglia dell'avviso di avvio lento (watch.openMs in ms)
  secondsText(ms) → '2,2'                        // un decimale, virgola italiana (1001 ⇒ '1,0', mai '1')
  slowSeconds(watch) → '2,2' | null              // null se openMs manca/è null/è 0/è ≤ SLOW_OPEN_MS
}
```

**UI (`page.html` + `page.js`)** — una colonna, italiano, pulsanti ≥ 40 px di altezza, testo ≥ 14 px, nessun hover-only:
1. **Intestazione**: "Galleria" + etichetta orologio (`emery` ⇒ "Pebble Time 2 · 200×228 a colori", `flint` ⇒ "Pebble 2 Duo · 144×168 bianco e nero", altrimenti "orologio sconosciuto: preparo foto a colori") + contatore "Da inviare: N KB / M KB" + eventuale avviso stato/prova + (v1.9) **avviso di avvio lento** `#slow` (classe `warn`, nascosto di default): compare solo se `watch.openMs > SLOW_OPEN_MS` e dice «Galleria si avvia lentamente (X s). Non è un guasto: la memoria dell'orologio si è riempita di vecchi dati.» seguito dalla procedura in 4 passi (apri l'app Pebble → tocca Galleria nell'elenco delle app → scegli Rimuovi (non Aggiorna) → reinstalla Galleria) e dalla rassicurazione «Le tue foto sono al sicuro nel telefono e torneranno da sole sull'orologio in circa un minuto.». La procedura è **una sola stringa nel JS** (`FIX_STEPS`/`FIX_TAIL` di `page.js`, costruita nel DOM in `#slowFix` e `#helpFix`): non è duplicata nell'HTML, che ha il tetto di 64 KB.
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

Regole: nessuna dipendenza esterna; nessun `alert/confirm/prompt` (i test girano senza); tutte le stringhe visibili dal **dizionario** (S10: chiavi `T(…)`/`data-i18n`, italiano di riferimento in `i18n/messages.json`); gli elementi della pagina hanno `id` stabili (elencati sopra + `#tiles`, `#add`, `#file`, `#crop` (canvas cornice), `#zoom`, `#gamma`, `#lift`, `#dither`, `#sunlight`, `#previewMode`, `#preview`, `#addOk`, `#addCancel`, `#kb`, `#head`, `#status`, `#slow`, `#slowLead`, `#slowFix`, `#help`, `#helpBtn`, `#helpBody`, `#helpWhy`, `#helpFix`); `page.js` espone `window.GalPage = { state, tiles, added, deleted, setNavigate(fn), lastPayload, buildPayload(), addFile(file) (usabile da test), version }` per test e gate. Niente `console.log` in ciclo; un `try/catch` attorno a inizializzazione e Salva con messaggio in `#msg` (mai pagina bianca).

**4.6 Miniatura**: dal risultato finale (`idx` o `bits`) si disegna su un canvas 50×57 (`drawImage` del canvas d'anteprima 200×228/144×168 con smoothing) e `toDataURL('image/jpeg', 0.7)`; se > 6.000 caratteri ⇒ 0,5 poi 0,3; se il browser non produce JPEG (`data:image/png` restituito) e supera i 6.000 ⇒ miniatura omessa. Colori `SUN_RGB` (come sul vetro).

## 6. Dev server (`tools/galleria_devserver.py`, modifiche S6)

Oggi (S5b): `--album` converte le foto in un pool e `/state.json` è un payload **`full: true`**; `POST /save` accetta `{settings?, order?, photos?: [{slot, src}], scenario?}`; `/save.json` = alias di `/state.json`; `/config.html` = pagina di prova incorporata (`PAGE_HTML`) o `--page FILE`. Da aggiungere, **senza rompere** la pagina di prova, `--selftest` (148), `test_devpage.js` e i flussi di S5b:
1. **`--page-dir DIR`** (esclusivo con `--page`): a ogni `GET /config.html` la pagina viene inlinata da `DIR` con `build_config_page.inline_page(DIR)` (import dal `tools/` accanto: `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))`, import pigro dentro il handler); errore di inlining ⇒ 500 con il messaggio in chiaro (testo) e riga su stderr; DIR inesistente ⇒ errore di `argparse` (exit 2). `--dump-page` rispetta `--page-dir`.
2. **Modalità relay**: `/state.json` = `{v: 1, seq, hooks: {scenario}}` **senza `full`** e senza `photos`/`order`/`deleted` (il PKJS lo applica come delta vuoto: nessuna eliminazione implicita — F10); `--settings` dato ⇒ aggiunge `settings` (delta). Attivata da **`--relay`** esplicito oppure **automaticamente da `--page-dir` senza `--album`** (il caso del gate); `--relay` con `--album` è un errore. Il server «nudo» (né `--album` né `--page-dir`) resta `full: true` con 0 foto come in S5b — `test_devpage.js` lo pretende — e all'avvio stampa un avviso in due righe («applicato dal PKJS CANCELLA TUTTI gli slot … usare --relay»). Con `--album` tutto resta `full: true`.
3. **`POST /save` in modalità pagina**: riconosciuta da **`'deleted' in body`** (la pagina lo manda sempre, anche `[]`; i POST della pagina di prova non lo hanno). Validazione severa (400 con messaggio chiaro, come oggi): `v == 1`; `deleted` lista di interi 0..11 senza duplicati; `order` lista di interi 0..11 senza duplicati; `settings` via `validate_settings_patch` (tutti e 10 i campi presenti); `photos` lista ≤ 12 di oggetti con **tutti** i campi `slot` (0..11, senza duplicati e non in `deleted`… no: ammesso anche in `deleted` — foto nuova su slot appena eliminato), `photo_id` (int 1..2³¹−1), `fmt` (1|2), `len` (34.200 per 1, 3.024 per 2), `crc` (int 0..2³²−1), `data` (stringa base64url senza padding di lunghezza `ceil(len*4/3)`, decodificabile a `len` byte con `zlib.crc32 == crc`), `name` (stringa ≤ 64), `thumb` (opzionale, stringa ≤ 6.000 che inizia con `data:image/`); campi sconosciuti ⇒ 400. Esito: `last_payload = body`, `seq += 1`, risposta `{ok: true, seq}`. Il corpo può arrivare a ~600 KB: il limite attuale (8 MiB) basta.
4. **`GET /save.json`**: in modalità pagina = `last_payload` + `seq` + `hooks` (**senza `full`**); prima di qualsiasi Save (o in modalità pool) come oggi. Un Save della pagina di prova (modalità pool) dopo uno della pagina vera riporta `/save.json` allo stato del pool (documentare).
5. In modalità pool un POST della pagina vera viene accettato lo stesso (utile per i test) ma al riavvio del PKJS `/state.json` full del pool torna autorità: scriverlo in `tools/README.md` §11.
6. `--selftest`: nuovi controlli (relay `/state.json` senza `full` e senza `photos`; `--settings` in relay; POST pagina valido ⇒ 200 + `/save.json` lo rende senza `full`; ogni regola di validazione con un caso negativo: CRC sbagliato, `len` sbagliato, `data` troppo corta, `thumb` troppo lunga, `name` troppo lungo, slot duplicato, campo sconosciuto, `deleted` con 12; `--page-dir` con una cartella temporanea (pagina minima con `<script src>` e `<link>`; file mancante ⇒ 500; `data-optional`); `--page` e `--page-dir` insieme ⇒ errore). `--dump-json state` in relay.
7. `tools/README.md` §11: nuove opzioni/endpoint/flusso S6 (schema dello stato nell'hash e del token di ritorno).

## 7. `tools/build_config_page.py`

Solo stdlib (Python 3.8+). **S10**: `inline_page`/`build_module` accettano anche `messages=` (default: `i18n/messages.json` accanto alle sorgenti) e prima del lint eseguono il **passo i18n** — `i18n_pass(html, messages)` sostituisce `T('chiave'` con `T(<indice>` e `data-i18n(-title)="chiave"` con l'indice, dove l'indice è la posizione della chiave in `messages.json` (la stessa degli array di `i18n.js`); una chiave che non esiste è un errore con numero di riga, e se nella pagina non c'è nessuna chiave il file dei messaggi non viene nemmeno aperto. ⚠️ La sostituzione guarda **tutto** l'HTML finito: un `T('nome')` scritto in un commento a fine riga (che lo strip non toglie) viene convertito lo stesso, e se il nome non esiste fa fallire la generazione. API: `inline_page(dir_path, entry='page.html', warn=None, strip=True, messages=None) -> str` (HTML inlinato, regole §1; lancia `PageBuildError(msg)`; `warn` per gli avvisi non fatali), `page_size_check(html) -> None|str`. Impl.: se l'inlining fallisce il `config_page.js` precedente resta sul disco (il tool lo dice): `make -C test pagecheck` prima di ogni `pebble build`. CLI: `--dir apps/galleria/src/pkjs/config` (default: relativo alla posizione del tool, cioè `../apps/galleria/src/pkjs/config`), `--out apps/galleria/src/pkjs/config_page.js` (default idem), `--html-out FILE` (opzionale: scrive anche l'HTML inlinato, per aprirlo nel browser), `--check` (rigenera in memoria e confronta con `--out`: exit 0 se identico, 1 se diverso o assente, con messaggio), `--selftest` (cartella temporanea: inlining, ordine, file mancante, `data-optional`, `</script>` nel contenuto ⇒ errore, dimensione > 64 KB ⇒ errore, output riproducibile: due esecuzioni ⇒ stesso file byte a byte). Output `config_page.js`:
```js
/* GENERATO da tools/build_config_page.py (S6): non modificare a mano. Sorgenti: src/pkjs/config/. Dimensione HTML: N B. */
module.exports = "…";   // json.dumps(html, ensure_ascii=True): solo ASCII, una riga
```
Riproducibile (nessuna data). Stampa la dimensione dell'HTML e del `.js`. Esit 1 con messaggio chiaro su ogni errore, mai traceback.

## 8. Test (host, `make -C test`)

- **`test/gen_page_fixture.py`** (importa `tools/photo_prep.py` come modulo via `sys.path`; solo stdlib + le funzioni del tool, **niente Pillow**): genera `test/fixture_page.js` (`module.exports = {...}`): immagine sintetica 200×228 RGB deterministica (gradienti + bande + rumore LCG come `make_fixture_data`, tutti e 256 i livelli presenti su ogni canale, zone sature e neutre) in base64 dei byte RGB piatti, e una 144×168 per flint; per emery: per ogni `dither ∈ {fs, bayer, none}` × `sunlight ∈ {false, true}` × `(gamma, lift) ∈ {(1,0), (0.8,0.1), (1.6,0.3)}` ⇒ `{crc32 del raw6, photo_id}` e, per un caso, il raw6 intero in base64url (pin di `pack6` + `b64url`); per flint: `dither ∈ {fs, atkinson, none}` × le stesse 3 coppie ⇒ crc32 del raw1 (+ un raw1 intero); `toneLut` per le 3 coppie; `SUN_LUT_CRC32`; casi di `fit_rect`/`crop_rect`/`flint_rect`. `--check` verifica che la fixture su disco sia aggiornata. Lento va bene (< 60 s).
- **`test/test_pipeline.js`** (node, `NODE_PATH=shim` non serve): carica `src/pkjs/config/pipeline.js`, `test/fixture_page.js`, `src/pkjs/crc.js`, `src/pkjs/b64.js`, `test/fixtures/rt.idx|rt.raw6|rt.bits|rt.raw1` (fixture del test C: `pack6`/`pack1` su 40×12 e 24×8 devono dare `rt.raw6`/`rt.raw1` byte a byte); round trip di ogni combinazione (CRC uguale ⇒ raw uguale); `toneLut` = fixture; `quantRaw` ai bordi (q(v) = min(3, (v+42)//85): 42→0, 43→1, 127→1, 128→2, 212→2, 213→3, 255→3 — le soglie 84|85 scritte nella prima stesura erano sbagliate); `buildSunLut` CRC = 0x48CBD990 (la LUT NON è monotona lungo i grigi: il colore di resa più vicino può essere un colore, niente test di monotonia); `crc32` = `crc.js` su vettori; `b64url` = `b64.encode` su byte casuali (incluse lunghezze ≡ 0,1,2 mod 3); `photoId` (0 ⇒ 1, bit 31 azzerato); `previewRgba` scala/colori; mutation testing a mano di ≥ 8 mutanti (serpentine spenta, `>>4` → `/16`, clamp mancante, pesi FS scambiati, tono dopo il dithering, LUT in interi, `pack6` con ordine dei bit invertito, gray con pesi diversi) che DEVONO far fallire il test. Esito: "test_pipeline: N ok, M fail", exit 1 se fail.
- **`test/test_page.js`** (node): `page_core.js` puro (decodeState con hash valido/assente/rotto/`città`, normalizeSettings, buildTiles con foto, foreign, deleted, fmts mancante, pending; freeSlot; buildPayload; payloadKb; capMessage; truncateName; thumbFits) e `page.js` in `vm.runInNewContext` con un DOM finto sul modello di `test/test_devpage.js` (getElementById per id, createElement, appendChild, textContent, value, checked, disabled, classList minimo, addEventListener/dispatch a mano, `canvas.getContext('2d')` finto con `drawImage` no-op, `getImageData` che restituisce un `ImageData` deterministico, `toDataURL` che restituisce `data:image/jpeg;base64,AAAA`, `createImageBitmap` finto, `XMLHttpRequest` finto che registra i POST e consegna a `flush()`, `location` finta con `hash`/`search`/`protocol`): rendering delle tessere dallo stato, ▲▼✕ ⇒ `order`/`deleted`, aggiunta via `GalPage.addFile(file)` con encode vero (pipeline reale sui pixel finti) ⇒ tessera `new`, `photo_id`/`crc`/`len`/`data` coerenti, slot libero, Salva dev ⇒ un solo POST `/save` con payload completo + `navigate(return_to + token)`, Salva telefono ⇒ `pebblejs://close#` + JSON percent-encoded parsabile, Annulla nei due casi, tetto KB ⇒ Salva disabilitato + messaggio, LECO disabilitato con layout B, `settingsSet false` ⇒ avviso, album pieno ⇒ "Aggiungi" disabilitato, errori (POST 500 ⇒ messaggio e nessuna navigazione; file non decodificabile). Esito come sopra.
- **`Makefile`** (di proprietà dell'orchestratore, già predisposto): `JSTESTS` include `test_pipeline.js test_page.js`; target `pagecheck` (**S10: `build_i18n.py --check` per primo**, poi `build_config_page.py --check` + `gen_page_fixture.py --check` + `gen_font_previews.py --check`) in `all`; `devtest` invariato; `browsertest` (fuori da `all`: `tools/galleria_browser.py --selftest`).

## 9. `tools/galleria_browser.py` — Firefox headless via WebDriver (solo stdlib)

Verificato il 29/08: `geckodriver` (`/snap/bin/geckodriver`, Firefox 154 snap) accetta sessioni headless (`moz:firefoxOptions.args = ['-headless', '-width', '500', '-height', '900']`; impl.: sotto 500 px la larghezza viene ignorata da Firefox/GTK → il comando `narrow URL 400` carica la pagina in un iframe da 400 px), naviga `data:` e `http:`, esegue script, fa screenshot (base64 nella risposta: nessun accesso a file) e imposta `<input type=file>` con un percorso **sotto `$HOME` e fuori dalle cartelle nascoste** (snap: né `/tmp` né i dot-dir come `~/.cache` sono leggibili — il nome arriva ma `FileReader` dà NotFoundError; usare `~/galleria-gate/photos/`; `set_file` del tool copia da solo in `~/galleria-browser-files/pid<N>/` i percorsi illeggibili e verifica la lettura con `FileReader`). Il tool: classe `Browser` (avvia `geckodriver --port P` su porta libera, `POST /session`, `open(url)`, `title()`, `exec(script, args)`, `find(css)`, `click(css)`, `set_file(css, path)`, `set_value(css, value)` (+ evento `input`/`change` via exec), `text(css)`, `wait_for(css_or_js, timeout)`, `drag(css, dx, dy)` e `wheel(css, dy)` con `POST /actions` (pointer/wheel), `screenshot(path)`, `close()`, tutto con timeout e messaggi chiari) + CLI con sottocomandi o `--script FILE.json` (lista di passi `{cmd, args}`) e `--selftest` (avvia il dev server in relay con una pagina minima in una cartella temporanea, apre `/config.html#<hash>`, verifica titolo e `location.hash`, un `set_file` da `~/.cache/galleria-gate/`, uno screenshot in una cartella temporanea, chiude; salta con messaggio "saltato" ed exit 0 se `geckodriver` o `firefox` mancano). Funzione `emu_config_url(timeout)` che attende e legge l'URL dal file `~/pebble-tool-emu-app-config-*.html` scritto da `pebble emu-app-config` (`content="0;URL=…"`, HTML-unescape). Documentare in `tools/README.md` §12.

## 10. `index.js` (orchestratore)

`showConfiguration`: `state` = `album.state()` + `{v:1, platform, fmt, cap_kb, dev}` (platform da `Pebble.getActiveWatchInfo()` in try/catch, `fmt` = `watch.format` se noto altrimenti 2 se platform === 'flint' altrimenti 1; `cap_kb` = 200 se `Pebble.platform === 'ios'` altrimenti 900) → `b64.encodeUtf8(JSON.stringify(state))` (nuova funzione in `b64.js`: UTF-8 via `unescape(encodeURIComponent(s))`) → hash; DEV ⇒ `Pebble.openURL(dev.base + '/config.html#' + hash)`, telefono ⇒ `Pebble.openURL('data:text/html;charset=utf-8,' + encodeURIComponent(require('./config_page')) + '#' + hash)`. `webviewclosed` resta (delta + `resync`); log della dimensione del payload. Bundle: verificare che `src/pkjs/config/*.js` NON finiscano nel `.pbw` (solo `config_page.js` richiesto): controllare `build/pebble-js-app.js`… se il bundler li include, spostare le sorgenti in `src/config_page/` e aggiornare tool e documenti.

## 11. Gate S6 (emulatore + Firefox headless)

1. `python3 ../../tools/build_config_page.py` → `pebble build` (emery+flint verdi, `MEMORY USAGE` annotato) → `make -C test` verde.
2. Dev server in relay: `python3 ../../tools/galleria_devserver.py --page-dir src/pkjs/config` (PID annotato; fermarlo con `kill PID`); `pebble kill; pebble wipe; pebble install --emulator emery --logs > log` in background.
3. `BROWSER=true pebble emu-app-config --emulator emery &` → `galleria_browser.py`: URL dal file temporaneo (`open-emu`) → screenshot della pagina (`narrow URL 400` + `screenshot`; `screenshot-full` per la pagina intera a 500 px) → `set_file` con una foto chiara (landscape, da `~/galleria-gate/photos/`) → cornice/zoom (drag + wheel) → slider → screenshot dell'anteprima → "Aggiungi all'album" → font Bebas + intervallo 5 min → Salva → `/close` ricevuto → log PKJS: `payload delta: ok … nuove [k]`, `resync`, foto in 9 messaggi, `SETTINGS OK`, `ALBUM_ORDER OK` → `pebble screenshot` mostra la foto con Bebas (senza riavvio).
4. Ripetere con una foto scura portrait (testo bianco atteso), una con EXIF orientation 6, una minuscola (120×100: ingrandita) e una da 12 MP (tempo di encode loggato); eliminare una foto e riordinare ⇒ `ALBUM_DELETE`/`ALBUM_ORDER`; Annulla ⇒ "pagina chiusa senza modifiche"; tetto: forzare `cap_kb` basso nell'hash ⇒ Salva disabilitato.
5. **Percorso telefono nel browser**: aprire la pagina come `data:` URL con lo stesso hash (`open('data:text/html;charset=utf-8,' + quote(html) + '#' + hash)`), verificare che lo stato venga letto (origine opaca: nessun `localStorage`), impostare `GalPage.setNavigate` per catturare l'URL `pebblejs://close#…`, Salva ⇒ decodificare il payload e darlo a `album.applyPayload` in node (smoke) ⇒ `ok`, CRC uguali.
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
- **Pagina**: `#slow` in cima (solo sopra `SLOW_OPEN_MS = 1000` ms) e `#help` in fondo (sempre); testo e soglia in §5. Riferimenti misurati: ~90 ms con 4 foto e file sano, ~400–800 ms con 12 foto sane, ~2.150 ms con il file gonfio: la soglia lascia fuori il caso normale con 12 foto.
- **Dev server**: `--open-ms N` aggiunge `hooks.open_ms` a `/state.json`; in DEV `index.js` forza `hello.openMs` a quel valore prima di `album.plan()` (in emulatore l'apertura è quasi istantanea e l'avviso non si vedrebbe mai). Senza l'opzione `hooks` resta `{scenario}` come prima.
- **Test**: `test_sync_engine.js` §11b (0, valore, oltre 16 bit, campo assente), `test_album.js` (snapshot, `state()`, mascheratura, album pre-v1.9), `test_page.js` §4f (soglia in `page_core`, avviso nascosto con 0/null/assente/900/1000 e visibile con 1001 «1,0 s» e 2150 «2,2 s», procedura in 4 passi, Aiuto sempre visibile e ripiegabile con `aria-expanded`), `FAM_BTN` con la voce del pulsante Aiuto, selftest del dev server per `--open-ms`.
- Budget dopo la modifica: HTML inlinato **61.043 B**, modulo `config_page.js` **63.016 B** (tetto 64 KB: 2.520 B di margine; l'avviso mostrato non aggiunge byte alla pagina — il testo è costruito nel DOM).

## Revisione S8-stile (04/09/2026) — «Stile cifre» e sei font
Contratto: `docs/design/galleria-s8-stile.md` §5 (D21 stile delle cifre, D22 enum dei font). La pagina guadagna **un campo** e la select Font passa a **6 valori**; il payload §3 resta lo stesso oggetto `settings`, con una chiave in più.
- **`page_core.js`**: `SETTINGS_FIELDS` = 11 voci — `font` diventa `0..5` (0 Anton, 1 Bebas Neue, 2 Barlow Condensed, 3 LECO, **4 e 5 = i due font nuovi**) e in coda arriva `['digit_style', 0, 3, 0]` (stessa posizione di `album.js`: l'ordine dell'array non è quello dei byte del blob, dove `digit_style` è il byte 12). `normalizeSettings` tiene la regola LECO/layout (`font 3` + `layout 1` ⇒ `font 0`) e **poi** azzera lo stile se il font è ancora LECO (`font === 3` ⇒ `digit_style = 0`): un blob vecchio, che ha 0 in quel byte, resta «pieno» senza migrazioni.
- **`page.html`**: una riga in più subito dopo il Font — `<p class="row"><label for="s_digit_style" class="rlab">Stile cifre</label> <select id="s_digit_style"></select></p>`.
- **`page.js`**: `OPTS.digit_style` = `pieno` / `trasparente (solo contorno)` / `trasparente 3D (contorno + ombra)` / `pieno 3D (con ombra)`; `SELECTS` include `digit_style` (fra `font` e `clock_mode`); `applyLeco()` è diventata **`applyRules()`** (non riguarda più solo LECO) e applica quattro regole a ogni cambio di impostazione (e al caricamento dello stato, che passa dalla stessa funzione via `writeSettings`):
  1. font LECO ⇒ `#s_digit_style` **disabilitato e riportato a `0`** (l'orologio ignora lo stile senza sprite);
  2. stile 1 o 2 (trasparenti) ⇒ `#s_outline` **disabilitato con il valore conservato** (l'anello è sempre disegnato, «Contorno» non ha effetto): il valore continua a viaggiare nel payload, così tornando a uno stile pieno la scelta è ancora lì;
  3. **D26 — su `state.platform === 'flint'` niente ombra 3D**: le `<option>` 2 («trasparente 3D») e 3 («pieno 3D») prendono l'attributo `disabled` e l'etichetta con l'avvertenza «(non su Pebble 2 Duo)», e il valore scende allo stile equivalente senza ombra (**2 ⇒ 1, 3 ⇒ 0**) — sia leggendo lo stato sia a ogni `change`, così il payload porta sempre il valore normalizzato. Su `emery` e su piattaforma `unknown` non cambia nulla (opzioni attive, etichette pulite, valore conservato). Gli id delle due opzioni sono **stabili** (`s_digit_style_3d1`, `s_digit_style_3d2`), come `s_font_leco`: la tabella `NO_3D` in `page.js` tiene `[valore, valore su flint, id]` e la disabilitazione è idempotente (assegnazioni, mai append). L'orologio applicherebbe comunque 2 come 1 e 3 come 0 (`ui_digits_set_palette` ignora l'indice mancante): la pagina evita solo di far scegliere un'impostazione che non si vedrebbe.
  4. anteprima del font da `GalPreviews` per le chiavi note (`PREV_KEYS = ['anton','bebas','barlow','','francois','staatliches']`): chiave assente o `previews.js` non caricato ⇒ immagine nascosta, nessun errore.
  Nomi e chiavi sono quelli **definitivi** della spec S8-stile §2 (4 = **Francois One** → `francois`, 5 = **Staatliches** → `staatliches`, le stesse chiavi di `gen_font_previews.py` e `gen_digits.py`): `previews.js` ora le contiene davvero, e una chiave che mancasse lascerebbe comunque l'immagine nascosta senza errori.
- **Select e `<option>` disabilitate**: nessuna regola CSS nuova. La cascata di `#41` riguarda i pulsanti (`FAM_BTN` in `test_page.js` §4e resta a **6 famiglie**: né una `<select>` né una `<option>` sono pulsanti, quindi non serve una voce in più); una `<select>` disabilitata prende il grigio del browser sopra il fondo bianco della regola `select`, e una `<option disabled>` il grigio del menu a tendina di sistema.
- **Anteprime (`tools/gen_font_previews.py` v3)**: `FONTS` ha ora **cinque** voci — `('francois', 'FrancoisOne-Regular.ttf')` e `('staatliches', 'Staatliches-Regular.ttf')` in coda alle tre esistenti — e `previews.js` espone le cinque chiavi `GalPreviews.anton|bebas|barlow|francois|staatliches` (il font 3, LECO, è di sistema e non ha anteprima: in `PREV_KEYS` è la voce vuota). Le chiavi sono le stesse di `FONTS` in `tools/gen_digits.py`: **un font nuovo = una riga in ciascuna delle due tabelle**. `previews.js` passa da 1.722 a **2.500 B** (i due PNG in più pesano 237 e 219 B, 316 e 292 caratteri di base64) e l'altezza dell'inchiostro **resta 28 px** (il tetto di 4.096 B non viene sfiorato, quindi la riduzione automatica dell'altezza non scatta: le anteprime restano confrontabili a occhio e vanno mostrate 1:1). `--selftest` 41 controlli verdi, `--check` verde.
- **Test** (`test/test_page.js`, entrambi i giri sorgenti/inlinato): §1c normalizzazione (font 4/5/6/negativo, `digit_style` 0..3, stringa, non intero, LECO ⇒ 0, LECO+layout 1 che invece conserva lo stile), §1f/§2j payload a **11** impostazioni, §2a markup (esiste `#s_digit_style`, è una select vuota, sta fra Font e Formato ora, etichetta con `for`+`rlab`), §2b 6 opzioni font e 4 di stile, §2i payload completo, §3i 14 etichette-guida, **§4g** le quattro regole della UI, i 6 nomi dei font per esteso, le **anteprime vere** di `previews.js` (le 5 chiavi sono PNG data-URL: `francois` e `staatliches` non sono più iniettate a mano; `f4`/`f5` restano inutilizzate e Barlow resta sul suo indice), lo stato ricevuto dall'orologio riletto nei campi e la **regola D26** (id stabili sulle due opzioni 3D; stato flint con `digit_style` 2 ⇒ select a 1, opzioni spente, etichette con l'avvertenza, payload 1; `change` verso 3 ⇒ 0 e verso 2 ⇒ 1, con `#s_outline` che segue il valore normalizzato; stato emery con 2 ⇒ resta 2 ed etichette pulite; piattaforma sconosciuta come emery; su flint LECO, layout e anteprime si comportano come prima). Sensibilità verificata con 8 mutanti (regola LECO in `page_core`, disabilitazione di `#s_outline`, `PREV_KEYS` corte, `PREV_KEYS` con le chiavi vecchie `f4`/`f5`, etichette «Font 4»/«Font 5», forzatura a 0, `font 0..3`, riga HTML tolta) e, per D26, con altri **5** sulla nuova regola: chiamata ad `applyNo3d` tolta (12 fail), `disabled` non messo sulle `<option>` (4), regola applicata a ogni piattaforma invece che al solo flint (19), id tolti alle due opzioni 3D (2), normalizzazione `3 ⇒ 1` invece di `3 ⇒ 0` (3). Ognuno fa fallire almeno un'asserzione. Conteggio a fine S8-stile: **1.224 ok sui sorgenti e 1.245 sull'inlinato**, 0 fail (valore corrente dopo l'aiuto sui font di S9-prep: **1.327 / 1.348**).
- Budget dopo la modifica: HTML inlinato **62.893 B** (61,4 KB; era 61.732 B con le sole regole di stile e 60.989 B nella v1.9), modulo `config_page.js` **64.899 B**; **05/09 (revisione v1.9: soglia proporzionale alle foto e testo del rimedio): HTML 63.424 B, modulo 65.437 B; la sera, con il contatore «ora N su 12» (D28): HTML 63.735 B, modulo 65.761 B** (margine 1.801 B sotto il tetto); **S9-prep (05/09 sera), con l'aiuto sui font per lo stile trasparente: HTML 63.938 B, modulo 65.972 B** (margine **1.598 B**; superata da R13, vedi «Revisione S9-prep» sotto: 64.222/66.268 B, margine 1.314 B). Il tetto che `build_config_page.py` fa rispettare è sull'**HTML** (65.536 B → **2.643 B di margine**); il modulo è più grande per l'escaping JSON (637 B dal tetto, che però non è il suo). Dei +1.161 B rispetto alla misura precedente, ~780 sono le due anteprime PNG di `previews.js` e il resto la regola D26 in `page.js` (tabella `NO_3D`, `applyNo3d`, gli id e i commenti). **Obiettivo soft di 60 KB superato** (`SOFT_BYTES = 61.440 B`): ogni generazione stampa l'avviso «sopra l'obiettivo di 60 KB», che non blocca. Il margine va misurato a ogni aggiunta: le prime leve, se servisse spazio, sono le quattro etichette di `OPTS.digit_style` (~270 B, ma è il contratto della spec S8-stile §5) e i commenti lunghi delle sorgenti (l'inliner toglie solo le righe che iniziano con `//`, non i blocchi `/* */`).

## Revisione S9-prep (05/09/2026) — aiuto sui font (P5) e avviso flint sullo stile trasparente (R13)

- **Quinta regola di `applyRules()`** in `page.js` (le prime quattro sono nella revisione S8-stile qui sopra): sotto la select «Stile cifre» il paragrafo `#s_style_hint`
  (classe `help` già esistente in `page.css`, `style="display:none"` nel markup come `#settingsNote`/`#editor`/`#slow`,
  commutato da `show(e, on)`: la pagina non usa l'attributo `hidden`) porta il testo fisso, in italiano e ASCII:
  «Per lo stile trasparente rendono meglio Francois One e Staatliches (Anton in layout A tende a chiudersi).»
  Compare **solo con lo stile ≠ 0 (pieno)**, sia all'apertura (`writeSettings` ⇒ `applyRules`) sia a ogni `change`
  delle select (`settingsChanged` ⇒ `applyRules`); non c'è altro punto che scriva `#s_digit_style`.
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

## Revisione S10 (05/09/2026) — la pagina in quattro lingue

Spec completa: `galleria-s10-i18n.md` (D31–D38). Qui solo ciò che cambia per la config page.

- **Dizionari fuori dall'HTML** (D35): sorgente unica `apps/galleria/i18n/messages.json`
  (**121 chiavi × 4 lingue**, `{ "chiave": { "it", "en", "de", "fr" } }`, 23.089 B) →
  `tools/build_i18n.py` → `src/pkjs/i18n.js` (20.731 B) e `test/fixture_i18n.js`, identici, ES5 e
  ASCII (`module.exports = { keys, en, it, de, fr }`, array **nell'ordine del file**).
  `--check` fallisce su chiave mancante in una lingua, segnaposto diversi fra lingue, backtick, file
  non ordinato; `--selftest` = **20** controlli. `make -C test pagecheck` lo esegue **prima** del
  `--check` della pagina, perché il secondo dipende dagli indici del primo.
- **Chiavi al posto dei testi**: nei sorgenti `T('chiave')` / `T('chiave', a, b)` (`{0}`/`{1}`
  sostituiti in **una passata**, così un valore che contiene `{1}` non viene risostituito) e
  `data-i18n` / `data-i18n-title` su nodi di testo **vuoti**; nell'artefatto inlinato restano solo
  **indici** (`T(12`, `data-i18n="12"`). `T` accetta numero **o** stringa: nei test sui sorgenti i
  nomi si risolvono con `window.GalI18nKeys` (da `fixture_i18n.js`). Senza dizionario (hash assente
  o rotto) la pagina mostra il **nome della chiave**, tranne i messaggi di stato mancante di
  `page_core.js`, che hanno un ripiego inglese cablato: è la «modalità prova», non raggiungibile dal
  telefono.
- **Stato**: `lang_auto` e `i18n` (tutti e quattro i dizionari, **in coda** allo stato perché sono
  il pezzo grosso: l'inizio dell'hash resta leggibile). Lingua effettiva =
  `effectiveLang(settings, lang_auto)` = `LANGS[settings.lang - 1]` se `lang` ≠ 0, altrimenti
  `lang_auto` (o `en`).
- **`page.js`**: `applyLang()` ricostruisce `OPTS`, ripercorre `data-i18n`/`data-i18n-title`,
  riscrive i testi delle `<option>` **senza toccarne id e valori** (D26 e R13 restano validi),
  aggiorna `<html lang>`, la riga dell'orologio, il tono e gli aiuti; viene chiamata da
  `writeSettings` e dal `change` di `s_lang`. `dec2()` usa `C.dec(v, lang)` (en `.`, it/de/fr `,`).
- **`page_core.js`**: `LANGS`/`LANG_NAMES`, `langName`, `effectiveLang`, `dec`, `SETTINGS_FIELDS`
  con `['lang', 0, 4, 0]`, `capMessage(kb, capKb, nAdded, T)` (il testo arriva dal chiamante).
- **Select «Lingua»** (D36): `s_lang`, **prima riga** di `#settings`, opzioni con endonimi
  («Automatica (orologio: Italiano)», «English», «Italiano», «Deutsch», «Français»); si salva come
  ogni altra impostazione (byte 13 del blob), nessuna sync speciale.
- **Dev server**: `--lang en|it|de|fr` → `hooks.lang` → in DEV `index.js` forza la lingua
  **automatica** (in emulatore l'orologio è sempre `en_US`); l'impostazione `lang` resta invece una
  voce di `--settings` (`{"lang": 3}`). Selftest **252**.
- **Dimensioni**: HTML inlinato **64.699 B** (modulo 66.597), margine **837 B** sul tetto di
  65.536; l'artefatto non contiene più nessun testo dell'interfaccia.
- **Test**: `test_page.js` **1.427** asserzioni sui sorgenti + **1.452** sull'inlinato (giro «tutte
  le lingue»: nessuna chiave vuota a schermo, nessun `{n}` residuo, `OPTS` con lo stesso numero di
  voci in ogni lingua, `s_lang` che cambia i testi, decimali per lingua; i controlli strutturali
  della sezione 0 verificano che nell'artefatto le chiamate a `T(` siano **numeriche**);
  `build_config_page.py --selftest` **91**, `build_i18n.py --selftest` **20**, `test_album.js`
  **1.316** (byte 13, round trip, CRC dei default invariato), `test_index_retry.js` **174**
  (`lang_auto`/`i18n` nello stato, hook `lang`).
- ⚠️ **I dizionari non passano mai per `log()`** (F-S8-2: una riga PKJS con un accento fa morire
  `pebble logs`): viaggiano solo nell'hash dell'URL, e della lingua si logga il solo codice a due
  lettere.

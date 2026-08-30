# Galleria — specifica S6: config page (crop, quantizzazione, anteprima, impostazioni)

> Versione 1.1, 30/08/2026 (1.0 del 29/08 + precisazioni dall'implementazione, segnate «impl.»). Specifica operativa della sessione S6 (`apps/galleria/PIANO.md` §4 S6). Integra `docs/design/galleria.md` §6 (che a fine sessione ne riporterà la sintesi) e §5.1 (album e payload, S5b). Il riferimento byte-esatto della pipeline immagine è `tools/photo_prep.py` v1 (`tools/README.md` §9), **non** gli snippet di `docs/ricerca/galleria/05-colore-quantizzazione.md` (che per flint descrivono un packing diverso: il formato dell'orologio è raw1 = 1BitPalette MSB-first, 18 B/riga, 3.024 B, come in `photo_prep.pack1`).

Percorsi relativi a `apps/galleria/` salvo indicazione. Tutto il codice della pagina è **ES5** (var, function, niente arrow/let/const/class/template literal/spread), con typed array e API canvas (la pagina gira nella WebView di configurazione dell'app Pebble: Android Chrome ≥ 80, iOS WKWebView ≥ 16; e in Firefox/Chrome desktop dal dev server). Nella pagina **niente `localStorage`/`sessionStorage`/cookie** (origine opaca del `data:` URL: l'accesso lancia SecurityError) e nessuna risorsa esterna (font, CDN, immagini remote): tutto inlinato.

## 1. File e contratto di inlining

```
src/pkjs/config/page.html        markup (italiano), viewport mobile, nessuna risorsa esterna
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
  watch: null | { at, format, maxChunk, settingsCrc, slots: [12 × {state, crc}], foreign: [slot…] }   // ultimo HELLO
}
```
Dimensione: ≤ 12 miniature × ≤ 6.000 caratteri + JSON ≈ 75 KB → base64url ≈ 100 KB. `fmt` decide TUTTO nella pagina (formato prodotto, dithering offerti, anteprima, rettangolo flint); `platform` serve solo all'etichetta.

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
  SETTINGS_FIELDS: [[nome, min, max, default] × 10]  (= album.js SETTINGS_FIELDS: layout 0-1/0, font 0-3/0, clock_mode 0-2/0, leading_zero 0-2/0,
                     text_color 0-4/0, outline 0-2/0, interval_min 0-1440/30 (valori ammessi 0,5,15,30,60,180,1440), order 0-1/0, shake_next 0-1/1, info_row 0-15/15),
  INTERVALS: [0, 5, 15, 30, 60, 180, 1440],  MAX_SLOTS: 12,  MAX_THUMB_CHARS: 6000,  MAX_NAME: 64,
  decodeState(hashString) → state normalizzato (default per ogni campo mancante; mai lancia; `ok:false` + `error` se l'hash non è valido),
  b64urlToBytes(str) → Uint8Array,  utf8Decode(bytes) → string,   // per l'hash
  normalizeSettings(obj) → {10 campi} (fuori intervallo ⇒ default del campo; interval_min non in INTERVALS ⇒ 30; font 3 con layout 1 ⇒ font 0),
  buildTiles(state) → [tile…]   // tessere iniziali: per ogni slot in state.order con foto ⇒ {slot, kind:'album', name, thumb, hasFmt: !!fmts[state.fmt], pending: crc diverso da watch.slots[slot].crc o slot non VALID};
                                // foto dell'album fuori da order ⇒ accodate; poi watch.foreign (non in deleted) ⇒ {slot, kind:'foreign'}; slot in state.deleted esclusi
  freeSlot(tiles, deleted) → slot   // primo 0..11 non usato da nessuna tessera; preferisce gli slot MAI usati a quelli appena eliminati; -1 se pieno
  buildPayload(model) → payload (§3)   // model = {settings, tiles (ordine finale), deleted, added: [{slot, photo_id, fmt, len, crc, data, name, thumb}]}
  payloadKb(payload) → intero (ceil(JSON.stringify(payload).length / 1024)),
  capMessage(kb, capKb, nAdded) → string | null,
  thumbFits(dataUrl) → bool (≤ 6000 caratteri e inizia con 'data:image/'),
  truncateName(name) → ≤ 64 caratteri
}
```

**UI (`page.html` + `page.js`)** — una colonna, italiano, pulsanti ≥ 40 px di altezza, testo ≥ 14 px, nessun hover-only:
1. **Intestazione**: "Galleria" + etichetta orologio (`emery` ⇒ "Pebble Time 2 · 200×228 a colori", `flint` ⇒ "Pebble 2 Duo · 144×168 bianco e nero", altrimenti "orologio sconosciuto: preparo foto a colori") + contatore "Da inviare: N KB / M KB" + eventuale avviso stato/prova.
2. **Foto** (`#photos`): tessere in ordine (miniatura 50×57 mostrata a 100×114 con `image-rendering: pixelated`; senza miniatura un riquadro grigio con "slot k"), nome, badge "da inviare" (`pending`), "sull'orologio" (`foreign`), "manca il formato per questo orologio: elimina e aggiungi di nuovo" (`!hasFmt`), "nuova" (aggiunte in questa sessione); pulsanti ▲ ▼ (riordino, disabilitati agli estremi) e ✕ (elimina: le tessere `album`/`foreign` vanno in `deleted`, le `new` vengono scartate e il loro slot liberato). Pulsante **"Aggiungi foto"** (`<label>` su `<input type="file" accept="image/*" id="file">`, **senza** `capture`; testo di aiuto "scegli dalla Libreria"), disabilitato con 12 tessere ("album pieno: elimina una foto").
3. **Editor** (`#editor`, visibile dopo la scelta del file): 
   - caricamento con `createImageBitmap(file, {imageOrientation: 'from-image'})` dentro try/catch e fallback `new Image()` + `URL.createObjectURL` (+ `revokeObjectURL`); file non decodificabile ⇒ messaggio, editor chiuso;
   - **cornice fissa** con rapporto 200:228 (larghezza = min(larghezza utile, 300) px), immagine che **si sposta e si ingrandisce sotto** la cornice: `view = {scale, tx, ty}` (crop sorgente = `{x: -tx/scale, y: -ty/scale, w: Fw/scale, h: Fh/scale}`), vincoli: la cornice è sempre coperta (scale ≥ cover, traslazione limitata); drag con Pointer Events (`pointerdown/move/up`, `setPointerCapture`; fallback touch/mouse se `PointerEvent` manca), pinch con due puntatori (scala attorno al punto medio), rotellina (scala attorno al cursore), slider zoom `#zoom` (1×…4× rispetto a cover) e pulsante "Adatta" (cover centrato). Con `fmt === 2` sopra la cornice si disegna il rettangolo **flint** = `flintRect` (sotto-rettangolo centrato 144:168) tratteggiato; con `fmt === 1` non si mostra;
   - **ridimensionamento** del crop a 200×228 (e, per flint, del sotto-rettangolo a 144×168) con dimezzamenti successivi su canvas (`docs/ricerca/galleria/05` §1.2 A: `drawImage` a metà finché ≥ 2×, poi passo finale; `imageSmoothingEnabled = true`, `imageSmoothingQuality = 'high'` dove esiste) su **fondo bianco** (`fillStyle = '#fff'` prima di `drawImage`), `getContext('2d', {willReadFrequently: true})`; ricalcolato solo quando cambia il crop (drag/zoom), con debounce 150 ms;
   - controlli: "Luminosità (gamma)" slider 0,50–2,00 passo 0,05 default 1,00 (**valore = gamma**: < 1 schiarisce); "Schiarisci le ombre (lift)" slider 0–0,30 passo 0,01 default 0; **Dithering**: `fmt 1` ⇒ Floyd–Steinberg / Bayer 4×4 / Nessuno (default FS), `fmt 2` ⇒ Floyd–Steinberg / Atkinson / Nessuno (default FS); checkbox "Ottimizza per il vetro" (solo `fmt 1`, default OFF ⇒ LUT sunlight nel dithering); toggle anteprima "come sul vetro" (default ON: colori `SUN_RGB`) / "colori nominali" (`PAL_RGB`) — solo anteprima, non cambia i byte;
   - **anteprima ×2** (`#preview`, canvas 400×456 o 288×336, CSS `width: 100%; max-width: 400px; image-rendering: pixelated`), ricalcolata con debounce 150 ms a ogni cambio di slider/opzione (encode < 100 ms);
   - pulsanti "Aggiungi all'album" (⇒ `encode*` finale, `photo_id`, miniatura §4.6, tessera `new`, editor chiuso, contatore aggiornato) e "Annulla" (editor chiuso, nulla aggiunto). Un solo editor per volta; si può aggiungere finché ci sono slot liberi.
4. **Impostazioni** (`#settings`, id `s_<campo>`): Layout (select: "Un terzo con riga info" 0 / "Tutto schermo" 1); Font (select: Anton 0, Bebas Neue 1, Barlow Condensed 2, "LECO (sistema, solo layout Un terzo)" 3 — l'opzione 3 è disabilitata e, se selezionata, torna a 0 quando il layout è 1); con `GalPreviews` presente, accanto al font l'anteprima PNG del font scelto; Formato ora (auto 0 / 12 h 1 / 24 h 2); Zero iniziale (auto 0 / sì 1 / no 2); Intervallo foto (select: mai 0, 5 min, 15 min, 30 min, 1 h, 3 h, 1 giorno); Ordine (sequenziale 0 / casuale 1); Scossa = foto successiva (checkbox → 0/1); Colore testo (auto 0, bianco 1, nero 2, giallo pastello 3, blu Oxford 4); Contorno (auto 0, sempre 1, mai 2); Riga info: 4 checkbox (passi bit0, batteria bit1, data bit2, Bluetooth bit3 → `info_row`). Con `settingsSet === false` una riga dice "Impostazioni non ancora salvate: l'orologio usa le sue finché non salvi".
5. **Piè di pagina** (`#footer`, sticky in basso): "Salva" (`#save`, primario; disabilitato sopra il tetto o mentre l'editor è aperto), "Annulla" (`#cancel`), messaggio `#msg`.

Regole: nessuna dipendenza esterna; nessun `alert/confirm/prompt` (i test girano senza); tutte le stringhe visibili in italiano; gli elementi della pagina hanno `id` stabili (elencati sopra + `#tiles`, `#add`, `#file`, `#crop` (canvas cornice), `#zoom`, `#gamma`, `#lift`, `#dither`, `#sunlight`, `#previewMode`, `#preview`, `#addOk`, `#addCancel`, `#kb`, `#head`, `#status`); `page.js` espone `window.GalPage = { state, tiles, added, deleted, setNavigate(fn), lastPayload, buildPayload(), addFile(file) (usabile da test), version }` per test e gate. Niente `console.log` in ciclo; un `try/catch` attorno a inizializzazione e Salva con messaggio in `#msg` (mai pagina bianca).

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

Solo stdlib (Python 3.8+). API: `inline_page(dir_path, entry='page.html', warn=None, strip=True) -> str` (HTML inlinato, regole §1; lancia `PageBuildError(msg)`; `warn` per gli avvisi non fatali), `page_size_check(html) -> None|str`. Impl.: se l'inlining fallisce il `config_page.js` precedente resta sul disco (il tool lo dice): `make -C test pagecheck` prima di ogni `pebble build`. CLI: `--dir apps/galleria/src/pkjs/config` (default: relativo alla posizione del tool, cioè `../apps/galleria/src/pkjs/config`), `--out apps/galleria/src/pkjs/config_page.js` (default idem), `--html-out FILE` (opzionale: scrive anche l'HTML inlinato, per aprirlo nel browser), `--check` (rigenera in memoria e confronta con `--out`: exit 0 se identico, 1 se diverso o assente, con messaggio), `--selftest` (cartella temporanea: inlining, ordine, file mancante, `data-optional`, `</script>` nel contenuto ⇒ errore, dimensione > 64 KB ⇒ errore, output riproducibile: due esecuzioni ⇒ stesso file byte a byte). Output `config_page.js`:
```js
/* GENERATO da tools/build_config_page.py (S6): non modificare a mano. Sorgenti: src/pkjs/config/. Dimensione HTML: N B. */
module.exports = "…";   // json.dumps(html, ensure_ascii=True): solo ASCII, una riga
```
Riproducibile (nessuna data). Stampa la dimensione dell'HTML e del `.js`. Esit 1 con messaggio chiaro su ogni errore, mai traceback.

## 8. Test (host, `make -C test`)

- **`test/gen_page_fixture.py`** (importa `tools/photo_prep.py` come modulo via `sys.path`; solo stdlib + le funzioni del tool, **niente Pillow**): genera `test/fixture_page.js` (`module.exports = {...}`): immagine sintetica 200×228 RGB deterministica (gradienti + bande + rumore LCG come `make_fixture_data`, tutti e 256 i livelli presenti su ogni canale, zone sature e neutre) in base64 dei byte RGB piatti, e una 144×168 per flint; per emery: per ogni `dither ∈ {fs, bayer, none}` × `sunlight ∈ {false, true}` × `(gamma, lift) ∈ {(1,0), (0.8,0.1), (1.6,0.3)}` ⇒ `{crc32 del raw6, photo_id}` e, per un caso, il raw6 intero in base64url (pin di `pack6` + `b64url`); per flint: `dither ∈ {fs, atkinson, none}` × le stesse 3 coppie ⇒ crc32 del raw1 (+ un raw1 intero); `toneLut` per le 3 coppie; `SUN_LUT_CRC32`; casi di `fit_rect`/`crop_rect`/`flint_rect`. `--check` verifica che la fixture su disco sia aggiornata. Lento va bene (< 60 s).
- **`test/test_pipeline.js`** (node, `NODE_PATH=shim` non serve): carica `src/pkjs/config/pipeline.js`, `test/fixture_page.js`, `src/pkjs/crc.js`, `src/pkjs/b64.js`, `test/fixtures/rt.idx|rt.raw6|rt.bits|rt.raw1` (fixture del test C: `pack6`/`pack1` su 40×12 e 24×8 devono dare `rt.raw6`/`rt.raw1` byte a byte); round trip di ogni combinazione (CRC uguale ⇒ raw uguale); `toneLut` = fixture; `quantRaw` ai bordi (q(v) = min(3, (v+42)//85): 42→0, 43→1, 127→1, 128→2, 212→2, 213→3, 255→3 — le soglie 84|85 scritte nella prima stesura erano sbagliate); `buildSunLut` CRC = 0x48CBD990 (la LUT NON è monotona lungo i grigi: il colore di resa più vicino può essere un colore, niente test di monotonia); `crc32` = `crc.js` su vettori; `b64url` = `b64.encode` su byte casuali (incluse lunghezze ≡ 0,1,2 mod 3); `photoId` (0 ⇒ 1, bit 31 azzerato); `previewRgba` scala/colori; mutation testing a mano di ≥ 8 mutanti (serpentine spenta, `>>4` → `/16`, clamp mancante, pesi FS scambiati, tono dopo il dithering, LUT in interi, `pack6` con ordine dei bit invertito, gray con pesi diversi) che DEVONO far fallire il test. Esito: "test_pipeline: N ok, M fail", exit 1 se fail.
- **`test/test_page.js`** (node): `page_core.js` puro (decodeState con hash valido/assente/rotto/`città`, normalizeSettings, buildTiles con foto, foreign, deleted, fmts mancante, pending; freeSlot; buildPayload; payloadKb; capMessage; truncateName; thumbFits) e `page.js` in `vm.runInNewContext` con un DOM finto sul modello di `test/test_devpage.js` (getElementById per id, createElement, appendChild, textContent, value, checked, disabled, classList minimo, addEventListener/dispatch a mano, `canvas.getContext('2d')` finto con `drawImage` no-op, `getImageData` che restituisce un `ImageData` deterministico, `toDataURL` che restituisce `data:image/jpeg;base64,AAAA`, `createImageBitmap` finto, `XMLHttpRequest` finto che registra i POST e consegna a `flush()`, `location` finta con `hash`/`search`/`protocol`): rendering delle tessere dallo stato, ▲▼✕ ⇒ `order`/`deleted`, aggiunta via `GalPage.addFile(file)` con encode vero (pipeline reale sui pixel finti) ⇒ tessera `new`, `photo_id`/`crc`/`len`/`data` coerenti, slot libero, Salva dev ⇒ un solo POST `/save` con payload completo + `navigate(return_to + token)`, Salva telefono ⇒ `pebblejs://close#` + JSON percent-encoded parsabile, Annulla nei due casi, tetto KB ⇒ Salva disabilitato + messaggio, LECO disabilitato con layout B, `settingsSet false` ⇒ avviso, album pieno ⇒ "Aggiungi" disabilitato, errori (POST 500 ⇒ messaggio e nessuna navigazione; file non decodificabile). Esito come sopra.
- **`Makefile`** (di proprietà dell'orchestratore, già predisposto): `JSTESTS` include `test_pipeline.js test_page.js`; target `pagecheck` (`build_config_page.py --check` + `gen_page_fixture.py --check`) in `all`; `devtest` invariato; `browsertest` (fuori da `all`: `tools/galleria_browser.py --selftest`).

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

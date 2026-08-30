# Design brief — watchface **Galleria** (`apps/galleria`) — v1.1

> Base per `docs/design/galleria.md`. 26/08/2026. Integra la ricerca multi-agente (`docs/ricerca/galleria/01…05`, citati come **R1–R5** + numero di finding) e le 8 verifiche adversariali (**V1–V8**; due parzialmente **confutate**: V4 e V6). Legenda: ✅ verificato su fonte primaria (sorgente/doc/emulatore) · ⚠️ stima/inferenza · ❓ da misurare su orologio/telefono reale · ✖ affermazione confutata, **non** usata.
> Vincoli invariati: `CLAUDE.md` (14 regole C), `PIANO-SVILUPPO-PEBBLE.md` §3/§7–§10, UUID `6f2dd646-a76a-44ff-8719-b012d04c79a4`, `capabilities ["configurable","health"]`, `MINUTE_UNIT`, mai secondi.

## 0. Le decisioni in una tabella

| # | Decisione | In breve |
|---|---|---|
| D1 | Acquisizione foto | Config page **in-app** (`data:` URL costruita dal PKJS) con `<input type="file" accept="image/*">` senza `capture`; crop/quantizzazione su `<canvas>` nella pagina; ritorno `pebblejs://close#` + `encodeURIComponent(JSON)` con foto in **base64url**. La pagina **non usa `localStorage`** (origine opaca): lo stato arriva dal PKJS nell'URL. In emulatore un **dev server locale** sostituisce `data:`/`pebblejs://` (V4/V7). |
| D2 | Formato foto | **raw6** (6 bpp impaccati, 34.200 B) su emery in un `GBitmap` 8Bit preallocato; **raw1** (1BitPalette, 3.024 B) su flint. Niente PNG sull'orologio in v1. |
| D3 | Protocollo | `JS_READY` → `HELLO{maxChunk, slot table}` → diff sul telefono → `SYNC_REQUEST` → inbox grande (chunk **7.936 B** = 31×256) → `PHOTO_BEGIN/DATA/END` con un messaggio in volo → `STATUS` → `SYNC_DONE` → inbox piccola. Chunk scritti in persist **dentro** `inbox_received` (l'ACK parte dopo). |
| D4 | Persist | Chiavi 0–9 meta, 10–99 impostazioni, `1000 + slot×256 + i` chunk; **12 slot**; manifest (con CRC32 per slot) scritto **per ultimo**; file ≤ ~430 KB. |
| D5 | Rotazione | Slot = funzione pura del tempo (`floor(min/intervallo)`), nessuna scrittura persist; sequenziale o permutazione pseudo-casuale; shake = avanza (RAM); mai fuori focus. |
| D6 | Ora | Layout A: sprite 2BitPalette 68 px (Anton/Bebas/Barlow) o LECO 60 di sistema; layout B: sprite 96 px HH/MM. Contorno = indice 2 della palette (un blit). |
| D7 | Colore testo | Calcolato sull'orologio sulla fascia delle cifre (LUT luminanza 64 voci, % pixel in conflitto, isteresi, contorno se > 15 %). |
| D8 | SDK | 4.33.1 (fw ≥ 4.32); superficie API ≤ 4.17; prova di build con SDK 4.17 in S7. |

## 1. Decisioni architetturali, motivazione, fonti

### 1.1 Acquisizione foto: config page in-app + file input (sì) + piano B

**Cosa è verificato** ✅
- La config page dell'app Pebble (Core Devices, `coredevices/mobileapp` @ d59fcf4) è una WebView **in-app** (`WatchappSettingsScreen`, libreria `compose-webview-multiplatform` 2.0.3: `android.webkit.WebView` su Android, `WKWebView` su iOS), JS attivo; l'URL passato a `Pebble.openURL()` è caricato **così com'è**, senza controlli di schema o dimensione (V1, V4). Il commento "hundreds of KB" sulla cache URL è del commit 452e344 (04/03/2026) — nulla cambia per noi.
- `<input type="file">` **funziona su Android** dall'app con il merge della PR #197 (28/07/2026; tag 1.8.0.7, 1.9.0, 1.9.1.3, 1.10.0), via `onShowFileChooser` + `fileChooserParams.createIntent()` (V2). Su iOS l'app non fa nulla (`rememberWebViewFileChooserParams() = null`) e WebKit presenta il pannello nativo "Photo Library / Take Photo / Choose File"; **mai testato da nessuno** ❓; il plist Core **non ha `NSCameraUsageDescription`** → la voce fotocamera terminerebbe l'app → **mai `capture`**, e la UI deve dire "scegli dalla Libreria" (V3).
- Ritorno dati: la WebView intercetta `^pebblejs://close(?:#|/\?|/)(.*)$`, applica `decodeURLPart()` (ktor 3.5.1: decodifica `%XX`, `+` resta `+`, **eccezione non gestita su `%` malformato**) e chiama `window.signalWebviewClosedEvent(<JSON string>)` (Android) / `globalThis.signalWebviewClosedEvent(...)` (iOS) → evento `webviewclosed` con `e.response` **già decodificato**; payload vuoto → nessun evento (V5). In emulatore `e.response` arriva **percent-encoded** e il cancel emette l'evento con `""` (V5).
- Limite di lunghezza: nell'app nessuno; Android/Chromium scarta silenziosamente URL > `kMaxURLChars` = 2 MiB (la navigazione diventa `about:blank#blocked`, `shouldOverrideUrlLoading` non viene mai chiamato). **iOS: nessun limite noto** — il limite WebKit da 2 MB del 28/07/2026 è stato **revertito il 12/08/2026** ✖ (V6). Budget progettuale: ≤ 900 KB per Save su Android, ≤ 200 KB su iOS finché non misurato ❓.

**Cosa era sbagliato nella v1.0 e viene corretto** ✖
- Una pagina `data:` ha **origine opaca**: in Blink `localStorage`/`sessionStorage`/IndexedDB lanciano `SecurityError` (`security_origin.h: CanAccessLocalStorage = !IsOpaque`); lo stesso vale per WKWebView ⚠️. Il bridge `_localStorage` dell'app (Android) e il data store per-UUID (iOS ≥ 17) **non servono a una pagina `data:`** (V4). → Le miniature e l'elenco dell'album **vivono nel `localStorage` del PKJS** e vengono passati alla pagina dentro l'URL (`#` + base64url(JSON)).
- `pebble emu-app-config` del pebble-tool **5.0.39 installato non apre pagine `data:`** (meta-refresh verso `data:` bloccato; il fix upstream 93768cf del 14/06/2026 non è nella versione locale) e comunque accetta al ritorno **≤ 65.514 B di query** (HTTP 414 oltre, e il tool resta appeso) (V4, V7). → In emulatore la pagina è servita via **http da un dev server locale** e le foto non passano dal close URL (§1.1.3).

**1.1.1 Pipeline nella pagina** (snippet completi in R5 §1; tutto in `src/pkjs/config/page.{html,js,css}` inlinati da `tools/build_config_page.py`, < 60 KB)
1. `createImageBitmap(file, {imageOrientation:'from-image'})` con fallback `<img>` (orientamento EXIF ❓ nelle WebView).
2. Crop interattivo con rapporto 200:228 (emery) — per flint 144:168 dentro lo stesso crop; downscale a dimezzamenti + passo finale (`imageSmoothingQuality` è solo un hint) → `getImageData` 200×228.
3. LUT di tono (slider luminosità/contrasto; il MiP ha nero ≈ 5 % del bianco) → **Floyd–Steinberg serpentine** a fixed point sulla palette RGB222 (`idx = r2<<4|g2<<2|b2`, valori esatti 0/85/170/255 perché `GColorFromRGB` **tronca** `>>6` — R5 F0 ✅). Opzioni: Bayer 4×4 ("compatto", griglia visibile), nessuno (posterizza, sconsigliato). "Ottimizza per il vetro" = quantizzazione nello spazio della LUT sunlight (R5 F9 ⚠️, LUT del pannello 2015): **default OFF finché S8 non la conferma sul vetro del PT2** (cambio rispetto alla v1.0).
4. Anteprima ×2 con la stessa LUT di `pebble screenshot` (identica a quella del color picker, R5 F3 ✅).
5. `pack6` (4 px → 3 B MSB-first, riga 150 B) o `pack1` (MSB-first, 18 B/riga) → CRC32 → base64url. Miniatura 50×57 via `canvas.toDataURL('image/png')` (≤ 4 KB) per l'elenco.
6. Save: `location.href = 'pebblejs://close#' + encodeURIComponent(JSON.stringify(payload))` con `payload = {v:1, settings, order, deleted:[…], photos:[{slot, photo_id, fmt, len, crc, data:<base64url>, thumb}]}` — solo foto **nuove/modificate**. Le stringhe base64url non contengono `+ / % =`: nessuna espansione oltre ×4/3 e nessun rischio in `decodeURLPart`. Contatore "KB per questo Save" con tetto per piattaforma (passato dal PKJS nello stato).
7. Il PKJS parsa in modo difensivo: `r.charAt(0)==='{' ? JSON.parse(r) : JSON.parse(decodeURIComponent(r))`; risposta vuota/non JSON → ignorata.

**1.1.2 Piano B (se il file input non funziona: iOS ❓, app Pebble < 1.8.0.7, Gadgetbridge)**: campo "URL immagine" nella stessa pagina (`<img crossorigin>` via proxy `https://wsrv.nl/?url=…&w=200&h=228&fit=cover` come Fields of Gold — R4 §1) → stessa pipeline canvas. Non offline-first, ma non richiede nulla all'app host. Esplicitamente **scartati**: browser di sistema (nessun ritorno dati: il deep-link `pebblejs://close` di sistema consegna `encodedFragment` grezzo alla prima sessione PKJS ed è soggetto al Binder da 1 MB — V6), "Condividi con Pebble" (nessun intent-filter), bridge nativo (PR #300 chiusa senza merge), companion app (niente iOS) (R1 F14).

**1.1.3 Percorso emulatore (deterministico, senza limiti)**: `tools/galleria_devserver.py` (Python 3 `ThreadingHTTPServer`, porta 8765) serve `config.html`, riceve `POST /save` (JSON qualsiasi dimensione) e serve `GET /save.json`, `GET /state.json`, `GET /photo/<k>.raw6`. Il PKJS, se `Pebble.platform === 'pypkjs'` (R1/Clay ✅), apre `http://localhost:8765/config.html` (pebble-tool aggiunge `?return_to=`), la pagina legge lo stato da `/state.json` (pushato dal PKJS con XHR POST: pypkjs è lanciato **senza** `--block-private-addresses`, V7 ✅), salva con `POST /save` e torna con `return_to + encodeURIComponent('{"token":"devserver"}')` (poche decine di byte); il PKJS su `webviewclosed` scarica `/save.json` con XHR `arraybuffer`/testo e prosegue **con lo stesso codice di sync del telefono**. Fixture: `python3 tools/galleria_devserver.py --album foto1.jpg foto2.jpg` genera i raw6/raw1 con `tools/photo_prep.py` (stessa pipeline in Python, per i test di round-trip).

### 1.2 Formato trasmesso e memorizzato: raw6 (emery) / raw1 (flint)

| Formato 200×228 | Byte | Chunk 7.936 B | Chiavi persist 256 B (B su disco) | Foto ≤ 75 % quota | RAM transiente al caricamento | Rischi |
|---|---|---|---|---|---|---|
| raw8 (1 B/px) | 45.600 | 6 | 179 (47.972) | 16 | 0 | nessuno |
| **raw6** (4 px → 3 B) | **34.200** | **5** | **134 (35.808)** | **21** | **0** | nessuno |
| PNG8 indexed FS | 17–21 K (R5 F11 ✅) | 3 | 70–85 | 25–33 | +PNG (≤ 24 K) +45.828 decodificato +1,7 K; picco 91 K se non si distrugge prima la foto vecchia | decoder usa **solo il primo IDAT** (PBL-14294), tinflate **senza bound check** → heap corrotto su dati corrotti; ritorna bitmap **non NULL** anche in errore (R2 F4–F5 ✅, riprodotto in emulatore) |
| 4BitPalette (16 colori adattivi) | 22.816 | 3 | 90 (23.924) | 32 | 0 | 16 colori/foto; blit per pixel ×3–5 (una volta al minuto: irrilevante) |

**Scelta: raw6** — RAM deterministica (nessuna `malloc` a regime: unpack a streaming nel `GBitmap` 8Bit da 45.640 B creato una volta in `init()`, R2 F7 ✅), nessun decoder, −25 % rispetto a raw8, 64 colori pieni (obiettivo "sfruttare il display"). Il numero massimo di foto **non** è limitato dalla quota (21 a 75 %) ma dal costo di scansione del file persist (§1.4) → **12 slot**. PNG8 e 4BitPalette restano possibili in v2 (campo `format` nel manifest): PNG solo con validazione completa del blob (IHDR, un solo IDAT, CRC32, `gbitmap_get_data()!=NULL`), 4-bit come "modalità compatta" a 24 foto.
Formato raw6: pixel in ordine riga-maggiore, `b0 = p0<<2 | p1>>4; b1 = (p1&15)<<4 | p2>>2; b2 = (p2&3)<<6 | p3`; sull'orologio byte 8Bit = `0xC0 | idx` (R2 F9 ✅ verificato visivamente in emulatore). Il codec accetta blocchi di qualsiasi lunghezza con carry di 0–2 byte (i chunk da 256 B non sono multipli di 3).
Formato raw1 (flint): `GBitmapFormat1BitPalette` 144×168, **MSB-first** (pixel 0 nel bit 0x80), riga 18 B, 3.024 B, palette statica `{GColorBlack, GColorWhite}` (`gbitmap_create_blank_with_palette`, array `static`, `free_on_destroy=false`) — R2 F9, F17 ✅. Non confondere con `GBitmapFormat1Bit` (LSB-first, stride 20 B, R5 F6 ✅). Dithering FS (opzione Atkinson) sul telefono; niente grigi (il firmware li rende a scacchiera, R2 F17 ✅).

### 1.3 Protocollo AppMessage

**Fatti** ✅: inbox massima 8.200 B (`APP_MSG_8K_DICT_SIZE`) sia con l'app Core (capability `Supports8kAppMessage`) sia in emulatore (`protocol_caps` tutti a 1) — R1 F10; l'ACK dell'orologio parte **solo dopo il ritorno di `inbox_received`** e il telefono aspetta ACK/NACK **10 s** — R1 F11; durante traffico AppMessage > 500 B il firmware forza già l'intervallo di connessione a 15 ms (`app_comm_set_sniff_interval(REDUCED)` non aggiunge nulla) — R1 F12; `app_message_close()` **deregistra i callback** e `app_message_open()` fallisce con `APP_MSG_INVALID_STATE` se ancora aperta → chiudi → ri-registra → riapri (PebbleOS `app_message.c` r.163–199, letto oggi ✅). Throughput reale **mai pubblicato** (stima 5–15 KB/s ⚠️, R1 F13).

**Dimensioni**: outbox `dict_calc_buffer_size(4, 1,1,2,60) = 93 → 128 B`; inbox di controllo **256 B** (messaggio più grande: `PHOTO_BEGIN` 69 B, `SETTINGS` 28 B); inbox di sync `dict_calc_buffer_size(4, 1,1,4,MAX_CHUNK)` = **7.971 B** su emery (MAX_CHUNK 7.936), 3.059 B su flint (MAX_CHUNK 3.072 ≥ 3.024: una foto = un chunk). Calcolo sull'orologio: `chunk = min(PLAT_MAX, ((app_message_inbox_size_maximum() − dict_calc_buffer_size(4,1,1,4,0)) / 256) × 256)` → con telefoni senza 8k diventa 512 B automaticamente. Mai `*_size_maximum()` come dimensione di apertura (regola 7).

**Sequenza** (un solo messaggio in volo; il successivo parte dal callback di successo di `Pebble.sendAppMessage`, mai da timer — guida SDK `advanced-communication.md` ✅):
1. `init()`: registra callback, `app_message_open(256, 128)`. L'orologio non manda nulla finché non riceve `JS_READY` (regola 7).
2. PKJS `ready` → `{MSG: JS_READY}`. Orologio → `{MSG: HELLO, PROTO: 1, MAX_CHUNK, SLOTS: 60 B}` (12 × `{state u8, crc32 u32}`; `connection_service` non serve: se il messaggio fallisce con `APP_MSG_NOT_CONNECTED` nessun retry).
3. PKJS confronta con l'album locale (`localStorage`): per ogni slot con `dirty` o crc diverso → da inviare; slot vuoti sull'orologio ma presenti localmente (dopo `pebble wipe`/reinstallazione) → da inviare. Se nulla: manda `SETTINGS`/`ALBUM_ORDER` se sporchi e finisce.
4. `{MSG: SYNC_REQUEST, COUNT}` → orologio: `app_message_close()`, ri-registra, `app_message_open(7971, 128)`, `{MSG: SYNC_READY, MAX_CHUNK}`. (Messaggi arrivati nella finestra di riapertura ricevono NACK → il PKJS ritenta.)
5. Per foto: `{MSG: PHOTO_BEGIN, SLOT, PHOTO_ID, FORMAT, LENGTH, CRC, OFFSET: start}` — l'orologio valida (formato = piattaforma, `LENGTH ≤ 256×256`, quota) e prepara `pending`; se `start > 0` accetta solo se coincide con un `pending` in RAM per lo stesso `PHOTO_ID` (ripresa nella stessa sessione), altrimenti `STATUS{SEQ_ERR, OFFSET: 0}`.
6. `{MSG: PHOTO_DATA, SLOT, OFFSET, DATA[≤ MAX_CHUNK]}` ×N: nel callback, 31 `persist_write_data(KEY_CHUNK(slot, OFFSET/256 + j), p + j×256, 256)` **direttamente dalla tuple**, `crc_running` aggiornato; `OFFSET == next` → scrivi; `OFFSET < next` (duplicato dopo ACK ambiguo) → ignora, ok; `OFFSET > next` → `STATUS{SEQ_ERR, OFFSET: next}` (il PKJS riparte da lì). `E_OUT_OF_STORAGE` → `STATUS{NO_SPACE}` e abort. L'ACK parte al ritorno del callback: **il flash è già scritto prima del chunk successivo** (flow control gratuito).
7. `{MSG: PHOTO_END, SLOT}` → confronto CRC → aggiorna `slots[k]` (`state=1, generation+1`) e scrive il **manifest** (chiave 1) → `STATUS{OK}`; CRC diverso → `STATUS{CRC_ERR}`, slot resta nello stato precedente (il manifest non è stato toccato; i chunk sovrascritti sono "sporchi" ma invisibili finché il manifest non li certifica: la prossima sync li riscrive).
8. `{MSG: SYNC_DONE}` (o 30 s senza traffico) → chiudi → ri-registra → `app_message_open(256, 128)`.
9. `SETTINGS` (blob 20 B) e `ALBUM_ORDER` (12 B) possono arrivare in qualsiasi fase; `ALBUM_DELETE{SLOT}` azzera `slots[k].state` nel manifest (nessun `persist_delete` dei chunk: le tombstone non liberano nulla, R2 F16 ✅).

**Retry lato PKJS**: fallimento di `sendAppMessage` → backoff 1, 2, 4, 8, 8, 8, 8 s (totale ≈ 45 s: copre una crescita/compattazione del file persist che sospende il watchdog fino a 60 s ❓, R2 F16), poi abort della foto (resta `dirty`). Nessun "resend on ready" incondizionato (difetto di Retro Photo Face, R4 F3). Album nel `localStorage` del PKJS: `galleria.v1.album` (JSON: slots, order, settings, thumb) + `galleria.v1.p<k>` (base64url) ≈ 12 × 45,6 KB + 60 KB ≈ **610 KB** — sotto i 4 MiB di NSUserDefaults iOS e la quota Chromium (R1 F16 ✅; SharedPreferences riscrive l'intero XML: accettabile).

**Tempi attesi** ⚠️: 34,2 KB a 5–15 KB/s ≈ 2,5–7 s + persist 134 × 5–7 ms (misura su PT2 con file piccolo, R4 F11 ✅) ≈ 0,9 s → **≈ 3–8 s per foto**, 12 foto ≈ 40–100 s una tantum; con file grande la scansione delle chiavi può salire (§1.4) ❓. L'orologio mostra "Foto 3/12" nella riga info durante la sync.

### 1.4 Schema persist

**Fatti** ✅ (R2 F11–F16): quota 1 MiB per app da fw 4.9.171 (`persist_get_max_size()` = 1.048.576 in emulatore emery e flint, V8); `persist_write_data` **tronca a 256 B**; record = 8 B header + 4 B chiave + valore (268 B per chunk); file "growable" 4 KiB → raddoppi con **riscrittura completa** (watchdog sospeso 60 s); compattazione quando lo spazio morto supera ≈ 20 % dell'allocazione; una chiave **nuova** scansiona tutti gli header (costo ∝ record × pagine, ≈ 15–80 ms per chiave su emery con file 128–512 KiB ⚠️, molto di più su flint per via delle letture QSPI transazionali); lettura sequenziale di chiavi scritte in ordine ≈ 3 letture header + 1 valore per chunk; atomicità **per record**.

```
chiave 0          uint32 schema (= 1)
chiave 1          GalManifest (214 B): magic, schema, slot_count, order[12], slots[12] {state, format, generation, length, crc32, photo_id}, crc16   ← scritto PER ULTIMO
chiave 2          GalRotState (4 B): posizione manuale/shake — scritto SOLO in deinit
chiave 3–9        riservate
chiave 10         GalSettings (20 B, versionata + crc16); 11–99 riservate
chiave 1000 + k×256 + i   chunk i (256 B) dello slot k, k = 0..11, i = 0..255 (capienza 64 KiB/slot; raw6 usa 134, raw1 12)
```
Regole: (1) chunk in ordine crescente di `i`, poi manifest con lunghezza+CRC32 → un manifest valido implica foto completa; (2) all'avvio: `persist_exists` + `persist_get_size == sizeof` + magic + crc16, altrimenti reset a default (mai crash); schema futuro → reset; (3) caricamento foto: 134 letture in ordine `i = 0..n−1` senza intercalare altre chiavi (ogni lookup fuori ordine costa una scansione con wrap), CRC32 accumulato, `layer_mark_dirty` solo se coincide (in caso contrario: slot marcato invalido in RAM e si passa al successivo); (4) sostituzione = sovrascrittura delle **stesse chiavi** (≈ 35,8 KB di spazio morto per foto sostituita → compattazione dopo ~3 sostituzioni a 512 KiB di allocazione: "many seconds" ❓, tollerato dal retry del PKJS); (5) impostazioni scritte al ricevimento (raro) e in `deinit`; nessuna scrittura nel tick; (6) `#if PBL_API_EXISTS(persist_get_max_size)` e valore ≥ 1.048.576, altrimenti **modalità demo** (foto da risorsa, album disabilitato); `E_OUT_OF_STORAGE` sempre gestito.
**Quante foto**: 12 slot → 12 × 35.808 + 214 + 20 + 4 ≈ **430 KB** (41 % della quota; allocazione 512 KiB). Su flint 12 × 3.196 ≈ 38 KB. Il tetto è dato dal costo di scansione/compattazione (file ≤ ~512 KiB), non dalla quota; da rivedere dopo le misure S8 ❓ (se il costo per "hop" fosse ~10 µs invece di 1–3, scendere a 8 slot).

### 1.5 Rotazione
- **Stateless**: al tick al minuto `t = now_min / interval` (`interval` ∈ {5, 15, 30, 60, 180, 1440} min; 0 = mai); ordine sequenziale `slot = order[t mod n]`, casuale `slot = order[perm(t, seed) mod n]` con LCG intero e regola "mai la stessa due volte di seguito"; "giornaliera" = cambio al primo tick dopo le 04:00. Nessuna scrittura persist, sopravvive ai riavvii per costruzione. Foto cambiata **solo** quando `slot` cambia (una lettura persist ogni intervallo, mai per tick).
- **Shake**: `accel_tap_service_subscribe` (rilevamento tap del firmware, non lo stream accelerometro) → `shake_offset++` in RAM → foto successiva; impostazione on/off (default on). Nessun feedback di vibrazione.
- **Focus**: `app_focus_service_subscribe`: coperta da notifica la watchface gira a ~0,4 fps, non sospesa (R4 F22 ✅) → nessun cambio foto fuori focus; al ritorno si ricalcola `slot` dal tempo.
- Album vuoto → 2 foto demo da risorsa (stesso codice di caricamento via `resource_load_byte_range` a blocchi di 1.536 B: le letture di risorsa costano ∝ offset iniziale su PT2, R4 F12 ✅, quindi blocchi grandi e una risorsa per foto).

### 1.6 Rendering dell'ora
**Fatti** ✅ (R3): limite hard `.pbf` **512 B/glifo** (area d'inchiostro ≤ 4.096 px; il build fallisce) → cifre 96 px impossibili con font; RLE4 non aiuta; `.notdef` conta; PDC non pixel-exact (fill AA) o a gradini; fctx toolchain 2016. Sprite `2BitPalette` (0 trasparente, 1 riempimento, 2 contorno) con `GCompOpSet`: pixel-exact, ricolorabili scrivendo `gbitmap_get_palette(b)[1/2]` (la palette è letta al blit, R2 F19 ✅), contorno **in un solo blit**; disegnabili anche su flint (il bitblt 1-bit supporta 1Bit/1BitPalette/2BitPalette, R2 F8 ✅). Il testo Pebble è 1-bit senza AA (R3 F5 ✅): nitido per natura; `graphics_context_set_antialiased(ctx,false)` per le primitive. LECO 60 Bold ha cifre alte **42 px** (non 60).
- **Layout A (1/3)**: strip sprite 68 px (cifre '0'–'9' + ':' a larghezza fissa: celle 40 px + 16 px per ':' → "HH:MM" = 176 px, x0 = 12) **oppure** `FONT_KEY_LECO_60_BOLD_NUMBERS_AM_PM` (zero risorse, contorno via 4–8 `graphics_draw_text` sfalsati nel colore opposto). Riga info in Gothic 18 Bold (Gothic 24 Bold con `preferred_content_size() == ExtraLarge`, letto una volta).
- **Layout B (tutto schermo)**: strip 96 px, celle **64×96** (Anton '0' ≈ 49 px, Bebas ≈ 45, Barlow ≈ 52), HH sopra MM. Riga 2-bit = 16 B → 1.536 B/cifra → **15.360 B** per strip; strip A (40×68) 10 B/riga → 680 B/glifo × 11 ≈ 7,5 KB. Solo la strip attiva è in heap; caricata in `window_load` e al cambio font/layout (`gbitmap_create_with_resource` + 11 `gbitmap_create_as_sub_bitmap`, nessuna copia).
- **Font** (3, SIL OFL 1.1, TTF **statici** verificati scaricabili, R3 F13 ✅; `OFL.txt` in `resources/fonts/`): **Anton** `https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf` (default; rapporto cifra/pixelHeight 0,88), **Bebas Neue** `https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf` (stretto, elegante), **Barlow Condensed Bold** `https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf`. (Oswald è variabile: richiederebbe `fontTools.varLib.instancer`; LECO 1976 e Avenir sono commerciali: LECO solo come font di sistema.) Generazione: `tools/gen_digits.py` con freetype-py del venv pebble-tool (`FT_LOAD_RENDER|FT_LOAD_MONOCHROME|FT_LOAD_TARGET_MONO`, identico a `fontgen.py`), stesso bounding box verticale, contorno = dilatazione 1 px − maschera; PNG a 3 colori con indice 0 trasparente; `package.json`: `"memoryFormat": "2BitPalette"`, `"spaceOptimization": "memory"`, `targetPlatforms` per risorsa, nomi `DIGITS_<FONT>_<H>~color` / `~bw`.
- **Ridisegno**: un solo `Layer` con `update_proc`; al tick solo la **fascia dinamica** (sub-bitmap della foto + sprite + riga info), foto intera solo al cambio foto/layout; `window_set_background_color(GColorClear)`; un `layer_mark_dirty()` per tick; buffer testo `static`; compositing riportato a `GCompOpAssign` prima del testo (in `GCompOpSet` il testo viene alpha-blended). Nota: `text_layer_set_should_cache_layout` **non esiste** in `pebble.h` 4.33.1 (grep oggi: 0 occorrenze) — non usiamo `TextLayer`, quindi la regola 12 si riduce a "`GSize` memorizzata".

### 1.7 Colore testo automatico (bianco/nero, halo)
Calcolato **sull'orologio** (il telefono non conosce layout/Quick View attivi), una volta per foto e per fascia, mai nel tick; C intero puro (`luma.c`): campiona 1 px su 2 della fascia delle cifre nel bitmap 8Bit (`gbitmap_get_data_row_info(bmp,y).data[x] & 0x3F` → `LUM_SUN[64]`, tabella in R5 F14; variante `LUM_RAW` se la LUT sunlight non sarà confermata), conta `bad_white` (Y > 77: bianco sotto 3:1 WCAG) e `bad_black` (Y < 25), sceglie il colore con meno conflitti (parità: media < 46 → bianco), **isteresi 10 punti** tra cambi consecutivi, **contorno** (palette[2] = colore opposto) se i conflitti superano il **15 %** (impostazione: auto/sempre/mai). Costo ≈ 7.600 letture + LUT < 1 ms ⚠️. `gcolor_legible_over()` del firmware usa lo stesso principio (Rec.709 a 2 bit, soglia 4510/10000) ma per un solo colore (R5 F13 ✅). Manuale: bianco, nero, **giallo pastello** (19:1 su nero) o **blu Oxford** (16,6:1 su bianco) come accenti (solo emery), sempre con contorno opposto. Su flint: conteggio dei pixel bianchi (bit MSB-first) nella fascia, contorno **sempre** (sfondo ditherato). Uno "scrim" via `graphics_fill_rect` con alpha **non** funziona (percorso assign, R5 F15 ⚠️): eventuale scrim v2 scurendo in place i byte della fascia (`0xC0 | ((p>>1)&0x15)`).

### 1.8 Quick View
Timeline peek: **59 px** in basso su emery (area 200×169), 51 px su flint (144×117) (`docs/ricerca/display.md` ✅). Layout A: la fascia dinamica sta in y ≤ 106 → invariante. Layout B: se `layer_get_unobstructed_bounds().size.h < 228` si passa alla **taglia A su una riga** (sprite 68 px, y 8, senza riga info); `unobstructed_area_service_subscribe(did_change)` → `layer_mark_dirty`.

### 1.9 12/24 h e zero iniziale
`clock_mode`: auto (`clock_is_24h_style()`), 12 h, 24 h; `leading_zero`: on/off (default: on in 24 h, off in 12 h). `timefmt.c` puro: `timefmt_hhmm(buf, n, h, m, is24h, lz)` e `timefmt_ampm()`. 12 h: "AM/PM" Gothic 14 Bold a destra delle cifre (A) o in basso a destra (B). Zero iniziale off in B: H1 non disegnato, H2 centrato.

### 1.10 flint (Pebble 2 Duo)
Foto 1BitPalette 3.024 B; strip sprite 2BitPalette 48×64 (12 B/riga → 768 B/cifra → 7,7 KB) per B e 28×44 (7 B/riga → 308 B × 11 ≈ 3,4 KB) per A, oppure `FONT_KEY_LECO_42_NUMBERS` (29 px) per A; riga info Gothic 14 Bold; contorno sempre; sync in un chunk. `gbitmap_create_blank` su BW accetta solo 1Bit/1BitPalette/2BitPalette (R2 F8 ✅).

### 1.11 SDK 4.33.1 vs 4.17
Build con **4.33.1** (unico installato; fw ≥ 4.32). Nessuna API oltre 4.17 è necessaria (niente touch: è una watchface; `persist_get_max_size` è 4.17; AppMessage 8k richiede solo SDK ≥ 5.63) → superficie API mantenuta ≤ 4.17 e in S7 `pebble sdk install 4.17` + build di prova; se verde, pubblicare con 4.17 (fw ≥ 4.17: base installata più ampia; il persist 1 MiB c'è comunque da fw 4.9.171). Decisione finale prima di S9.

### 1.12 Consumo
`MINUTE_UNIT`; nessun `app_timer` periodico (solo timeout di 30 s durante la sync); rotazione = contatore nel tick; AppMessage aperta con inbox da 256 B (nessun traffico a riposo: `SNIFF_INTERVAL_NORMAL`); tap service (a basso consumo, opzionale); `health_service_sum_today` una volta al minuto; niente animazioni; il dithering **non costa energia** (il driver invia le righe sporche a larghezza piena qualunque sia il contenuto, R5 F8 ✅); il ridisegno tocca solo le righe della fascia.

## 2. Wireframe

### 2.1 emery 200×228 — Layout A "un terzo" (default)
```
x:  0        12                          188      200
y 0 ┌─────────────────────────────────────────────┐
    │ foto raw6 a schermo intero (GCompOpAssign)   │
y 8 │  ┌────┬────┬──┬────┬────┐                    │ celle 40|40|16|40|40 = 176 px, x0 = 12
    │  │ 2  │ 3  │: │ 5  │ 9  │  [AM]              │ sprite 68 px (Anton_68), contorno 1 px = palette[2]
y 76│  └────┴────┴──┴────┴────┘                    │ (LECO 60: box (0,6,200,60), cifre 42 px, halo 4–8 draw)
y 82│   6.532 ▪   82 % ▪   mer 26 ago              │ riga info Gothic 18 Bold (24 se XL), 3 celle (4|68|132, w 64, h 22)
y106│ ─ ─ ─ ─ ─ fine fascia dinamica ─ ─ ─ ─ ─ ─   │ sotto: nulla cambia al tick
    │                                              │
y169│ ┈┈┈┈┈┈┈ Quick View 59 px (se attivo) ┈┈┈┈┈┈ │ nessun elemento nostro qui
y228└─────────────────────────────────────────────┘
```
Riga info: passi (`health_service_sum_today(HealthMetricStepCount)` se `health_service_metric_accessible`), batteria (`battery_state_service`, "⚡" in carica), data (`strftime "%a %e %b"`, `setlocale(LC_ALL,"")`); icona BT barrata al posto dei passi se `connection_service` dice disconnesso (nessuna vibrazione); "Foto 3/12" durante la sync.

### 2.2 emery — Layout B "tutto schermo"
```
y 12 ┌ H1 (32,12,64,96) ┐ ┌ H2 (104,12,64,96) ┐   sprite 96 px, celle 64 px, gap 8, blocco 136 px centrato
y108 └──────────────────┘ └───────────────────┘
y120 ┌ M1 (32,120,64,96)┐ ┌ M2 (104,120,64,96)┐   margine inferiore 12 px
y216 └──────────────────┘ └───────────────────┘   12 h: "PM" Gothic 14 Bold in (170,214,28,14)
Quick View attivo (h = 169): una riga "HH:MM" con la strip A (68 px) a y 8, niente riga info.
```
Zero iniziale off: H2 in (68,12,64,96). Nessuna riga info in B (v1).

### 2.3 flint 144×168 (1 bit)
```
Layout A: celle 28|28|12|28|28 = 124 px, x0 = 10, y 6..50 (sprite 44 px; o LECO 42 a y 4); riga info Gothic 14 a y 56 (h 18); fascia dinamica y ≤ 76
Layout B: H1 (20,12,48,64) H2 (76,12,48,64) · M1 (20,92,48,64) M2 (76,92,48,64); Quick View 51 px (h = 117) → riga singola A
Foto 1BitPalette FS; contorno sempre; colore = maggioranza dei pixel nella fascia
```

## 3. Modello dati C e messageKeys

```c
/* storage.h — tutte le struct packed, validate con persist_get_size() == sizeof */
#define GAL_MAX_SLOTS      12
#define GAL_KEYS_PER_SLOT  256
#define GAL_KEY_SCHEMA     0
#define GAL_KEY_MANIFEST   1
#define GAL_KEY_ROTSTATE   2
#define GAL_KEY_SETTINGS   10
#define GAL_KEY_CHUNK(k,i) (1000u + (uint32_t)(k) * GAL_KEYS_PER_SLOT + (i))
#define GAL_MAGIC          0x314C4147u          /* 'GAL1' */

enum { PHOTO_FMT_NONE = 0, PHOTO_FMT_RAW6_200x228 = 1, PHOTO_FMT_RAW1_144x168 = 2 };

typedef struct __attribute__((packed)) {
  uint8_t  state;        /* 0 vuoto, 1 valido */
  uint8_t  format;       /* PHOTO_FMT_* */
  uint16_t generation;   /* +1 a ogni sostituzione */
  uint32_t length;       /* 34200 | 3024 */
  uint32_t crc32;        /* sul payload */
  uint32_t photo_id;     /* id assegnato dal telefono (≠ 0) */
} GalSlotMeta;           /* 16 B */

typedef struct __attribute__((packed)) {
  uint32_t    magic;                    /* GAL_MAGIC */
  uint8_t     schema;                   /* 1 */
  uint8_t     slot_count;               /* 12 */
  uint8_t     order[GAL_MAX_SLOTS];     /* indici slot in ordine di rotazione, 0xFF = fine */
  uint16_t    reserved;
  GalSlotMeta slots[GAL_MAX_SLOTS];     /* 192 B */
  uint16_t    crc16;
} GalManifest;                          /* 214 B, chiave 1, scritto per ultimo */

typedef struct __attribute__((packed)) {
  uint8_t  schema;        /* 1 */
  uint8_t  layout;        /* 0 A (un terzo), 1 B (tutto schermo) */
  uint8_t  font;          /* 0 Anton, 1 Bebas Neue, 2 Barlow Condensed, 3 LECO sistema (solo A) */
  uint8_t  clock_mode;    /* 0 auto, 1 12 h, 2 24 h */
  uint8_t  leading_zero;  /* 0 auto, 1 on, 2 off */
  uint8_t  text_color;    /* 0 auto, 1 bianco, 2 nero, 3 giallo pastello, 4 blu Oxford */
  uint8_t  outline;       /* 0 auto (>15 % conflitti), 1 sempre, 2 mai */
  uint16_t interval_min;  /* 0 mai; 5,15,30,60,180,1440 */
  uint8_t  order;         /* 0 sequenziale, 1 casuale */
  uint8_t  shake_next;    /* 0/1 */
  uint8_t  info_row;      /* bit0 passi, bit1 batteria, bit2 data, bit3 BT */
  uint8_t  reserved[4];
  uint16_t crc16;
} GalSettings;            /* 20 B, chiave 10 */

typedef struct __attribute__((packed)) { uint8_t manual_pos; uint8_t shake_offset; uint16_t crc16; } GalRotState; /* 4 B, chiave 2, solo deinit */

/* sync.c — stato del trasferimento, solo RAM */
typedef struct {
  bool     active;
  uint8_t  slot, format;
  uint32_t photo_id, length, crc_expected, crc_running, next_offset;
} GalPending;
```
`photo_codec.h` (puro): `void raw6_unpack_init(Raw6State*)`, `size_t raw6_unpack(Raw6State*, const uint8_t *in, size_t n, uint8_t *dst8, size_t dst_cap)` (carry 0–2 B, scrive `0xC0|idx`), `raw1_copy(...)`, `raw6_pack()` (per i test host); `crc.h`: `crc32_update(uint32_t, const uint8_t*, size_t)` (tabella 256×4 B in flash) e `crc16_ccitt`; `luma.h`: `luma_compute(const uint8_t *row0, uint16_t stride, GalRect band, LumaResult*)` senza tipi Pebble; `timefmt.h`; `rotation.h`: `uint8_t rotation_slot(uint32_t now_min, const GalManifest*, const GalSettings*, uint8_t shake_offset)`.

**messageKeys** (`package.json`, valori assegnati dall'SDK; nessuna dipendenza da Clay):
```
MSG          u8   1 JS_READY · 2 HELLO · 3 SYNC_REQUEST · 4 SYNC_READY · 5 PHOTO_BEGIN · 6 PHOTO_DATA
                  7 PHOTO_END · 8 STATUS · 9 SYNC_DONE · 10 SETTINGS · 11 ALBUM_ORDER · 12 ALBUM_DELETE
PROTO        u8   versione protocollo (1)                      [orologio → telefono, in HELLO]
MAX_CHUNK    u16  7936 emery / 3072 flint / 512 senza 8k       [HELLO, SYNC_READY]
SLOTS        bytes 60 = 12 × {state u8, crc32 u32 LE}          [HELLO]
COUNT        u8   foto da inviare                              [SYNC_REQUEST]
SLOT         u8   0..11                                        [PHOTO_*, STATUS, ALBUM_DELETE]
PHOTO_ID     u32                                               [PHOTO_BEGIN]
FORMAT       u8   PHOTO_FMT_*                                  [PHOTO_BEGIN]
LENGTH       u32                                               [PHOTO_BEGIN]
CRC          u32  CRC32 payload                                [PHOTO_BEGIN]
OFFSET       u32  offset chunk / offset di ripresa             [PHOTO_BEGIN, PHOTO_DATA, STATUS]
DATA         bytes ≤ MAX_CHUNK                                 [PHOTO_DATA]
CODE         u8   0 OK · 1 CRC_ERR · 2 NO_SPACE · 3 BAD_FORMAT · 4 BUSY · 5 SEQ_ERR · 6 NOT_SUPPORTED   [STATUS]
ORDER        bytes 12                                          [ALBUM_ORDER]
SETTINGS     bytes 20 = GalSettings                            [SETTINGS]
```

## 4. Budget

| | emery (PT2) | flint (P2 Duo) |
|---|---|---|
| Statico | obiettivo ≤ 30 KB (tetto 40 KB; FoG con Clay+persist = 8,5 KB, TimeStyle 25 KB — R4 F17 ✅) | ≤ 30 KB (tetto 45) |
| Heap disponibile (modello misurato `131.072 − statico − 24` / `65.536 − statico − 28`) | ≈ 101 KB | ≈ 35,5 KB |
| Foto residente | 45.640 B (8Bit blank, misurato) | 3.072 B (1BitPalette + palette) |
| Strip sprite attiva | ≤ 15.360 B (B) / ≈ 7,5 KB (A) / 0 (LECO) | ≤ 7.680 B (B) / 3,4 KB (A) |
| Finestra, layer, sub-bitmap (11 × 20 B), font info | ≈ 1 KB | ≈ 1 KB |
| AppMessage a riposo (256 + 128 + overhead) | ≈ 0,6 KB | ≈ 0,6 KB |
| **Totale a regime** | **≈ 55–63 KB → margine ≈ 38–46 KB** | **≈ 8–12 KB → margine ≈ 23 KB** |
| In sync (inbox grande) | + 7.971 B → margine ≥ 30 KB | + 3.059 B |
| Stack | 4 KiB: nessun array > 200 B; staging chunk `static` 1.536 B (in .bss) | 2 KiB |
| Risorse (pack per piattaforma) | 3 font × (15,4 + 7,5 KB) ≈ 69 KB + 2 demo raw6 68,4 KB + icone PDC ≈ 1 KB ≈ **≤ 140 KB** | 3 × (7,7 + 3,4) ≈ 33 KB + 2 demo 6 KB ≈ **≤ 40 KB** |
| Persist | 12 × 35.808 + 238 ≈ **430 KB** (41 %; allocazione 512 KiB) | ≈ 38 KB |
| CPU per tick ⚠️ | blit fascia 200×100 ≈ 1–2 ms + 4–5 sprite 2-bit (per pixel con alpha) ≈ 3–6 ms + testo ≈ 1 ms → < 10 ms | ×3–4 (64 MHz), sprite più piccoli |
| Cambio foto ⚠️ | 134 letture persist ≈ 10 ms (file piccolo, misurato 70 µs/lettura) … 100–200 ms (file 512 KiB, stima) + unpack ≈ 2 ms + luma < 1 ms | 12 letture, trascurabile |

Ordine di allocazione in `init()`: foto (45.640) per prima, poi strip, poi il resto; mai `realloc`; mai `malloc` in `update_proc`; in emulatore una `malloc` da 45,6 KB è fallita per frammentazione con 57 KB liberi (R2 F22 ✅) → tutti i blocchi grandi una volta sola.

## 5. Piano a tappe (ogni tappa: cosa si vede nell'emulatore) e moduli

Moduli `src/c/`: `main.c` (init/deinit, servizi, tick, focus, tap, unobstructed) · `ui_time.c` (fascia dinamica: cifre, AM/PM, riga info; halo per testo) · `ui_digits.c` (strip sprite, sub-bitmap, palette) · `ui_photo.c` (bitmap foto, caricamento da persist/risorsa a streaming, sub-bitmap fascia) · `model.c` (stato in RAM: slot corrente, pending, focus, settings live) · `storage.c` (persist: manifest/settings/chunk, validazione, quota) · `sync.c` (AppMessage, macchina a stati, riapertura inbox) · `settings.c` (default, applicazione blob, debounce). Puri senza `pebble.h` (`apps/galleria/test/`, `make` con gcc host): `photo_codec.c`, `luma.c`, `crc.c`, `timefmt.c`, `rotation.c`. PKJS: `src/pkjs/index.js` (album, diff, coda, retry, dev server), `src/pkjs/config_page.js` (generato). Tool: `tools/photo_prep.py` (v1: raw6/raw1 + anteprima sunlight), `tools/gen_digits.py`, `tools/build_config_page.py`, `tools/galleria_devserver.py`.

| Tappa | Contenuto | Gate: cosa si vede/misura nell'emulatore |
|---|---|---|
| **S1** Motore ora (A) | `main.c`, `ui_time.c`, `settings.c` (default in RAM), `timefmt.c` + test; LECO 60 su sfondo nero; riga info; Quick View | Screenshot emery/flint con QV on/off; `emu-time-format 12/24`; content size M/L/XL; `MEMORY USAGE` annotato; test `timefmt` verdi |
| **S2** Foto + colore auto | `photo_prep.py` v1 → 2 demo raw6/raw1 (risorse `raw`, `targetPlatforms` per risorsa); `photo_codec.c`, `crc.c`, `luma.c` + test; `ui_photo.c` (bitmap preallocato, lettura risorsa a blocchi da 1.536 B); halo via draw_text sfalsati | Foto a schermo intero sotto l'ora; con foto chiara/scura il testo cambia colore; log heap −45.640 (emery) / −3.072 (flint); risorse < 256 KB |
| **S3** Layout B + font | `gen_digits.py` → 6 strip emery + 6 flint; `ui_digits.c`; layout B; switch font/layout; QV → riga singola | 8 screenshot emery (4 font × 2 layout) + 2 flint; nessun taglio; `pebble analyze-size` (strip non nello statico); heap dopo carico strip |
| **S4** Persist + rotazione | `storage.c` (schema §1.4), `rotation.c` + test, `model.c`; modalità debug `GALLERIA_DEBUG_SEED` (copia le demo in persist con il codice di scrittura di S5); shake; focus; `persist_get_max_size` | `pebble wipe` → demo; con seed: riavvio → log "slot k from persist, crc ok"; intervallo 5 min con `emu-set-time`? → si usa `interval` di test 1 min via `#ifdef`; `emu-tap` cambia foto; heap stabile dopo 10 cicli; test `crc/photo_codec/rotation` verdi |
| **S5a** Sync orologio | `sync.c`: `JS_READY/HELLO/SYNC_REQUEST/READY`, chiusura+riapertura inbox (verificare `APP_MSG_OK` al secondo `open`), chunk → persist nel callback, STATUS, timeout 30 s | Log: `app_message_inbox_size_maximum()=8200`, heap prima/dopo `open(7971)`, chunk offset/`time_ms()`; fixture PKJS con 1 foto in base64url costante (`localStorage.galleriaTest`) |
| **S5b** Sync telefono + dev server | `index.js` completo (album, diff, coda, backoff); `galleria_devserver.py` (`/state.json`, `/photo/k`, `/save`); `emu-bt-connection --connected no` a metà | 2 foto dal dev server arrivano in persist e sopravvivono al riavvio; interruzione a metà → manifest invariato, ripresa automatica alla riconnessione; heap uguale prima/dopo |
| **S6** Config page | `page.html/js/css` (crop, tono, FS/Bayer, sunlight opzionale, anteprima ×2, miniature, ordine, elimina, impostazioni), `build_config_page.js`; percorso `pypkjs` → http, telefono → `data:` + `pebblejs://close#` | `pebble emu-app-config --emulator emery`: carico foto, ritaglio, anteprima, Salva → foto sull'emulatore; impostazioni applicate senza riavvio; pagina usabile a 400 px; round-trip Python↔JS identico (stesso raw6 per la stessa immagine) |
| **S7** QA | Matrice §12 del piano generale; leak test 20 open/close; `time_ms()` in `update_proc` < 10 ms; `analyze-size`; flint polish; build di prova SDK 4.17 (D8) | Checklist spuntata; tabella memoria completa |
| **S8** Orologio + telefoni | Dev Connect; **iOS per primo** (file input); tempi per chunk, per `persist_write_data` con file 128/256/430 KB, crescita/compattazione; LUT sunlight vs foto del vetro; 48 h batteria | Note di campo con numeri; eventuale ritaratura di MAX_SLOTS, timeout, soglie luma |
| **S9** Pubblicazione | Con conferma utente | — |

## 6. Rischi residui e domande all'utente

Rischi: (1) iOS non validato (file input, lunghezza URL, PKJS solo con app aperta → risync dopo wipe solo con app Pebble aperta); (2) throughput BLE e costi persist con file grande **stimati**: se la scansione per chiave nuova fosse ~1 s (hop da 10 µs) il trasferimento di una foto salirebbe a ~2 min e servirebbe ridurre gli slot a 8; (3) compattazione del file persist (secondi, bloccante) durante una sync → coperta dal backoff fino a 45 s, ma da misurare; (4) LUT sunlight non confermata sul pannello PT2 → opzione OFF di default; (5) soglie del colore automatico (77/25/46, 15 %, isteresi 10) da tarare su 10–20 foto; (6) `createImageBitmap` con orientamento EXIF nelle WebView; (7) in emulatore la riapertura dell'inbox (chiudi→riapri) va provata in S5a prima di costruirci sopra (fallback: inbox grande sempre aperta, +8 KB di heap, margine comunque ≥ 30 KB).

Domande (massimo 4):
1. **iOS**: accetti che la v1 sia validata su Android (app Pebble ≥ 1.9.1.3) e che su iPhone il caricamento foto sia "best effort" (se il pannello nativo non funziona → campo URL in v1.1)? **Raccomandato: sì**, iOS provato per primo in S8.
2. **Album**: 12 foto a 64 colori (raw6) bastano? L'alternativa "24 foto a 16 colori adattivi" costa qualità e non è in v1. **Raccomandato: 12 × 64 colori**.
3. **Layout B**: solo cifre (come ora nel wireframe) o anche una piccola riga info in basso (12 px liberi: batteria e data in Gothic 14 sacrificando 10 px di cifre)? **Raccomandato: solo cifre in v1**, riga info opzionale in v1.1.
4. **Rotazione**: intervalli 5/15/30/60 min, 3 h, giornaliera, mai + "scossa = foto successiva" attivo di default vanno bene? **Raccomandato: sì**, default 30 min sequenziale, shake on.

## 7. Affermazioni confutate / non verificate (da controllare in emulatore o su orologio)

**Confutate — non usate** ✖
- "L'app Pebble aggiunge il prefisso `data:text/html;charset=utf-8,`": falso, la costante `URL_DATA_PREFIX` non è mai referenziata; il prefisso lo mette chi genera l'URL (Clay / il nostro PKJS). La cache URL "hundreds of KB" è del commit 452e344 (04/03/2026), non di 1447f5b (V4).
- "Il `localStorage` della config page è persistito per UUID e utilizzabile dalla pagina": vero solo per origini non opache; **una pagina `data:` non può usare `localStorage`** (SecurityError) (V4).
- "`pebble emu-app-config` apre la pagina `data:` e accetta ≤ ~64 KB": nel pebble-tool 5.0.39 installato la pagina `data:` **non si apre affatto**; il limite di 65.514 B di query vale per pagine http e al superamento il tool **resta appeso** senza errore (V4, V7).
- "WebKit ha un limite URL di 2 MB al confine IPC (28/07/2026)": **revertito il 12/08/2026**; su iOS non esiste alcun limite documentato (V6).
- "Chromium rifiuta l'URL > 2 MiB nel renderer": il meccanismo reale è la serializzazione mojo che svuota l'URL e `FilterURL` → `about:blank#blocked`; l'effetto (navigazione mai intercettata, silenziosa) resta (V6).
- "Il PDR 2015: 8K → 5× più veloce" e "throughput 5–15 KB/s": nessuna misura su PT2; solo stime (R1 F13).
- Regola 12 di `CLAUDE.md`: `text_layer_set_should_cache_layout` non esiste in `pebble.h` 4.33.1 (grep: 0).

**Non verificate — da misurare** ❓
- Emulatore (S5a/S6): riapertura `app_message_close()` → `app_message_open()` con dimensione diversa; `app_message_inbox_size_maximum()` = 8200; scrittura di 31 chiavi nel callback entro il timeout; comportamento di `webviewclosed` con la risposta minima del dev server; `unobstructed_area` con layout B; `accel_tap_service` (`emu-tap`).
- Telefono Android (S8): file input con `accept="image/*"` (l'autore ha provato solo `<input type=file>` generico); payload `pebblejs://close#` da 100/500/900 KB; tempo per chunk (7.936 B) e per foto; app Pebble 1.10.0.
- iPhone (S8): pannello file (Libreria/Scegli file) dentro la WebView dell'app Pebble; lunghezza massima del close URL (partire da 1 foto ≈ 46 KB, poi 200 KB, 500 KB); PKJS attivo con app in background; NSUserDefaults con 600 KB.
- Orologio PT2 (S8): `persist_get_max_size()`; `persist_write_data` con file 128/256/430 KB (scansione per chiave nuova); durata di crescita 256→512 KiB e di una compattazione; lettura di 134 chunk in fondo al file; `time_ms()` di `update_proc` con 4 sprite 2-bit; decodifica/blit su hardware (QEMU non è cycle-accurate); LUT sunlight vs foto del vetro; consumo in 48 h vs watchface di sistema.
- P2 Duo (S8, se disponibile): costo QSPI delle letture persist con file ~38 KB; contrasto testo su dithering.
- Gadgetbridge (se mai usato): file input, AppMessage 8k, `pebblejs://close#` grandi — nulla verificato.
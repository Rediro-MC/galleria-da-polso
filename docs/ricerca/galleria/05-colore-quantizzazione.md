# v2:e5fbec238e2a37b1f36102b666bf1af88f5a5bbbfba766402519495735cf8095

## Findings (21)

### F0 [verified CRIT] GColorFromRGB/GColorFromRGBA/GColorFromHEX quantizzano per TRONCAMENTO (`>> 6` per canale). I valori 0/85/170/255 mappano esattamente su 0/1/2/3 (85>>6=1, 170>>6=2, 255>>6=3); ma 84 → 0, 169 → 2. Quindi la palette che il telefono scrive nel PLTE del PNG deve contenere ESATTAMENTE i valori 0/85/170/255, perché il decoder PNG del firmware converte il PLTE con GColorFromRGBA (troncamento).
- evidenza: `#define GColorFromRGBA(red, green, blue, alpha) ((GColor8){ .b = (uint8_t)(blue) >> 6, .g = (uint8_t)(green) >> 6, .r = (uint8_t)(red) >> 6, .a = (uint8_t)(alpha) >> 6 })`; gbitmap_png.c usa `GColorFromRGBA(rgb_palette[i].r, ...)` per ogni voce PLTE.
- fonte: ~/.local/share/pebble-sdk/SDKs/4.33.1/sdk-core/pebble/emery/include/gcolor_definitions.h righe 22-40; PebbleOS src/fw/applib/graphics/gbitmap_png.c righe 234-239

### F1 [verified CRIT] I tool di build dell'SDK invece arrotondano al più vicino: `((v + 42) // 85) * 85` (NEAREST) e poi `argb8 = (a<<6)|(r<<4)|(g<<2)|b` con `>> 6`. Le due convenzioni coincidono solo se i valori sono già 0/85/170/255: per questo la quantizzazione lato telefono deve emettere solo quei 4 valori (o direttamente l'indice 0..63 = r<<4|g<<2|b).
- evidenza: `r = ((r + 42) // 85) * 85` in nearest_color_to_pebble64_palette; `a, r, g, b = (a >> 6, r >> 6, g >> 6, b >> 6)` in rgba32_triplet_to_argb8. Il byte GColor8 = 0b aa rr gg bb, quindi indice palette 0..63 = argb & 0x3F e colore opaco = 0xC0 | idx.
- fonte: ~/.local/share/pebble-sdk/SDKs/4.33.1/sdk-core/pebble/common/tools/pebble_image_routines.py righe 32-45 e 106-110; pebble.h righe 3522-3531 (union GColor8)

### F2 [verified] I file palette del repo sono coerenti con i 64 colori RGB222: `pebble_colors_64.gif` (GIF 177x177, modo P, 64 voci, 64 colori pixel unici = esattamente le 64 terne {0,85,170,255}^3), `pebble_colors_64.act` (772 B: 256 terne + 4 B coda `00 40 ff ff` = count 64; le prime 64 terne sono le 64 combinazioni), `pebble_colors_64.pal` (RIFF PAL, 256 entry, insieme = le 64 combinazioni).
- evidenza: Script Pillow: `pixels == expected 64 combos: True`, `ACT first 64 == expected: True`, `RIFF PAL count 256 == expected True`.
- fonte: /home/claudecode/ProgettiClaude/Pebble/tools/palette/pebble_colors_64.{gif,act,pal}; verifica eseguita con Pillow 12.1.1 (script nello scratchpad quant/)

### F3 [verified] La LUT 'sunlight' del color picker (JS) e quella di `pebble screenshot` (`_correct_colours`) sono identiche: 64 voci, stessi valori (es. #ff0000→#e35462, #ffff00→#ffeeab). È una tabella discreta 64→64: non è 'invertibile' per pre-compensare i colori, ma si può usare per scegliere il colore di palette in base alla RESA (quantizzazione nello spazio corretto).
- evidenza: Confronto programmatico dei due dizionari: `JS LUT entries 64 identical: True, diffs []`.
- fonte: tools/sdk-docs/source/assets/js/tools/color-mapping-sunlight.js; ~/.local/share/uv/tools/pebble-tool/lib/python3.13/site-packages/pebble_tool/commands/screenshot.py righe 482-548

### F4 [verified CRIT] Il decoder PNG del firmware (uPNG + tinflate) accetta SOLO: color type 3 (indexed) a 1/2/4/8 bit e color type 0 (grayscale) 1/2/4/8 bit; NIENTE interlace (errore UPNG_EUNINTERLACED); UN SOLO chunk IDAT (viene usato solo il primo: `// TODO : fix for multiple consecutive IDAT chunks (PBL-14294)`); zlib con CM=8, CINFO≤7, senza FDICT; qualsiasi chunk critico sconosciuto → errore. PNG8 indexed a 8 bit viene DE-PALETTIZZATO in place → GBitmapFormat8Bit (1 byte/px); 4 bit → GBitmapFormat4BitPalette (palette di 16 GColor8), 2 bit → 2BitPalette, 1 bit → 1BitPalette.
- evidenza: gbitmap_png.c: `prv_get_format_for_bpp`: 1→1BitPalette, 2→2BitPalette, 4→4BitPalette, altrimenti 8Bit; `if (format == GBitmapFormat8Bit) { for (...) upng_buffer[i] = palette[upng_buffer[i]].argb; applib_free(palette); }`. upng.c: `case CHUNK_IDAT: compressed = data; compressed_size = data_length; cursor_at_next_frame = true;`; `if (upng->source.buffer[28] != 0) SET_ERROR(UPNG_EUNINTERLACED)`; uz_inflate: `(in[0] & 15) != 8 || ((in[0] >> 4) & 15) > 7` → EMALFORMED, `((in[1] >> 5) & 1) != 0` → EMALFORMED.
- fonte: PebbleOS src/fw/applib/graphics/gbitmap_png.c righe 17-22, 90-167, 259-268; src/fw/applib/vendor/uPNG/upng.c righe 555-585, 741-813, 239-262, 445-470

### F5 [verified CRIT] Memoria del decode PNG sull'orologio: il buffer PNG sorgente NON viene copiato (`upng_load_bytes` → owning=0); viene allocato un buffer `(ceil(w*bpp/8)*h) + h` byte (una riga = byte filtro + dati), unfilter in place, e quel buffer diventa i dati del GBitmap (free_on_destroy=true). tinflate alloca TINF_DATA (~1.25 KB: 2 alberi da 16+288 short) + 320 B temporanei. Per 200x228 a 8 bit: 45.828 B risultato + PNG (8–21 KB) + ~1,7 KB transitori; a 4 bit: 23.028 B + 16 B palette. Coerente con la guida ufficiale ('compressed copy, uncompressed copy, ~2k overhead').
- evidenza: `inflated_size = (width_aligned_bytes * height) + height; inflated = task_malloc(inflated_size)`; `gbitmap_set_data(bitmap, upng_buffer, format, gbitmap_format_get_row_size_bytes(width, format), true)`; `TINF_TREE { unsigned short table[16]; unsigned short trans[288]; }` ×2 in TINF_DATA; `lengths = task_malloc(288+32)`.
- fonte: upng.c righe 824-841 e 873-877; gbitmap_png.c 145-165; src/fw/applib/vendor/tinflate/tinflate.c righe 84-105, 229, 450; tools/sdk-docs/source/_guides/communication/advanced-communication.md righe 400-405

### F6 [verified CRIT] ORDINE DEI BIT di GBitmapFormat1Bit (flint, framebuffer e bitmap raw B/N): LSB-first dentro ogni byte — il pixel x sta nel byte `x/8`, bit `x%8` (bit 0 = pixel più a sinistra); 1 = bianco, 0 = nero; ogni riga è allineata a 4 byte: stride = ((w+31)/32)*4 → 20 B per 144 px, 3.360 B per 144x168. Il framebuffer di flint è `(DISP_COLS/32 + 1)` word per riga = 5 word = 20 B.
- evidenza: bitset.h: `bitset[index / 8] |= (1 << (index % 8))`, `bitset32_set: bitset[index/32] |= (1 << (index % 32))` (usato da bitblt 1-bit e da set_pixel); bitmapgen.py: `word |= value << (column)` poi `struct.pack('<I', word)` (little-endian → stesso layout byte); libpebble2 screenshot `_decode_1bit`: `pixel = (data[row*row_bytes + column//8] >> (column % 8)) & 1`; gbitmap.c: `case GBitmapFormat1Bit: return ((width + 31) / 32 ) * 4;`; pebble.h: `GBitmapFormat1Bit = 0, //<! 1-bit black and white. 0 = black, 1 = white.`; 1_bit/framebuffer.h: `#define FRAMEBUFFER_WORDS_PER_ROW ((DISP_COLS / 32) + 1)`.
- fonte: PebbleOS src/fw/util/bitset.h righe 15-33 e 55-81; SDK common/tools/bitmapgen.py righe 186-207; libpebble2/services/screenshot.py righe 69-77; PebbleOS src/fw/applib/graphics/gbitmap.c righe 48-52; pebble.h riga 3681 e 2767-2783; src/fw/applib/graphics/1_bit/framebuffer.h righe 6-10

### F7 [verified CRIT] I formati PALETTIZZATI (GBitmapFormat1/2/4BitPalette) e i PNG usano invece il packing MSB-first dentro il byte (primo pixel nei bit alti), righe allineate al BYTE (non a 4 byte). Quindi: 1Bit raw = LSB-first + stride multiplo di 4; 1BitPalette/PNG 1-bit = MSB-first + stride byte. Non confondere i due.
- evidenza: util/graphics.h: `return (pixel_in_byte >> ((((8 / bitdepth) - 1) - (pixel_index % (8 / bitdepth))) * bitdepth)) & ~(~0U << bitdepth);` (usato da bitblt palettizzato e dal decoder PNG/APNG); bitmapgen.py: `packed_value |= color_index << (bitdepth * (8 // bitdepth - packed_count))`; gbitmap.c: `case GBitmapFormat1BitPalette/2/4: return ((width * bpp + 7) / 8); // byte aligned`.
- fonte: PebbleOS src/fw/util/graphics.h righe 17-26; SDK bitmapgen.py righe 244-256; gbitmap.c righe 54-57; pebble.h righe 2789-2796

### F8 [verified] Su flint (PBL_BW) `gbitmap_create_blank` supporta solo GBitmapFormat1Bit, 1BitPalette e 2BitPalette (niente 4Bit/8Bit). I bitmap palettizzati vengono disegnati su 1 bit convertendo ogni voce di palette con gcolor_get_grayscale e un pattern a scacchiera per i grigi (tabella `grays[]`: 0x5555/0xAAAA alternati per riga). Un'immagine 2-bit a 4 grigi su flint risulta quindi 'ditherata' dal firmware in modo grossolano (scacchiera): un dithering 1-bit a diffusione d'errore fatto sul telefono rende molto meglio.
- evidenza: `#if PBL_BW case GBitmapFormat1Bit: case GBitmapFormat1BitPalette: case GBitmapFormat2BitPalette: return true;`; `color = gcolor_get_grayscale(color); palette_pattern[i] = graphics_private_get_1bit_grayscale_pattern(color, row_number)`; `static const uint16_t grays[14] = {0x0000,0x0000, 0x1111,0x4444, 0x5555,0xAAAA, ...}`.
- fonte: PebbleOS gbitmap.c (prv_platform_supports_format); src/fw/applib/graphics/1_bit/bitblt_private.c righe 34-60 e 86-130; graphics_private.c righe 64-78

### F9 [verified] Il dithering NON costa energia/byte 'dirty' sul display: sia su emery sia su flint il driver invia l'intervallo di RIGHE sporche y0..y1 a larghezza piena, indipendentemente dal contenuto dei pixel (MiP: il costo dipende dalle righe riscritte, non dal pattern). Il dithering pesa solo sui byte del PNG (trasferimento + persist).
- evidenza: display_jdi.c: `HAL_LCDC_SetROIArea(&state->hlcdc, 0, s_update_y0, PBL_DISPLAY_WIDTH - 1, s_update_y1); HAL_LCDC_LayerSetData(..., s_framebuffer, 0, s_update_y0, PBL_DISPLAY_WIDTH - 1, s_update_y1)`; compositor_display.c: `s_current_flush_line = MAX(s_current_flush_line, fb->dirty_rect.origin.y); y_end = dirty_rect.origin.y + dirty_rect.size.h`; sharp driver: per ogni riga `memcpy(pbuf, row.data, DISP_LINE_BYTES)`.
- fonte: PebbleOS src/fw/drivers/display/sf32lb/display_jdi.c righe 175-185 e 404-420; src/fw/services/compositor/compositor_display.c righe 43-49; src/fw/drivers/display/sharp_ls013b7dh01/sharp_ls013b7dh01_nrf5.c righe 196-206

### F10 [verified] Dimensioni PNG misurate (Pillow 12.1.1, optimize=True, 5 foto reali ritagliate 200x228, palette 64 colori, PNG8 indexed a 8 bit): SENZA dithering 7.216–11.315 B; Floyd–Steinberg 18.360–21.289 B; Bayer 4x4 8.405–11.052 B (≈ come senza dithering: il pattern periodico comprime bene); Atkinson 15.233–17.053 B; FS serpentine 17.0–17.6 KB. zlib dei soli indici ≈ PNG (5,8–8,4 KB none / 16,5–18,3 KB FS). RLE (coppie count,val): 14,5–21,6 KB none ma 68–78 KB con FS (inutile). Raw: 8-bit 45.600 B, 6-bit packed 34.200 B, 4-bit 22.800 B. 16 colori RGB222 adattivi + FS come PNG a 4 bit: 19.663–22.429 B (non più piccolo del 64-colori, ma decodificato pesa 22,8 KB invece di 45,6 KB).
- evidenza: Output di exp.py: `pennapps 11037 / 20063 / 10523 | 8088 17068 | 21090 77290`; `pebble-on-plane 8754 / 19450 / 8405`; ecc. Sheet visivi: none = posterizzazione forte (bande piatte su pareti/pelle), Bayer = griglia regolare visibile, FS = aspetto fotografico; Atkinson brucia alte luci/ombre.
- fonte: scratchpad quant/exp.py e run successivi (foto da tools/sdk-docs/source/assets/images/blog/*.jpg); sheet PNG in scratchpad/quant/*_sheet.png

### F11 [verified] Per flint (144x168 1 bit) il PNG NON conviene: raw = 3.024 B (3.360 B con stride 20) mentre PNG 1-bit con FS = 2.856–5.595 B (spesso PIÙ GRANDE del raw), Atkinson 2.199–3.067 B, senza dithering 997–4.112 B. Inviare/salvare il raw 1-bit (3.360 B, 14 chiavi persist da 256 B).
- evidenza: Output exp.py sezione flint: `pennapps none 4112 FS 5335 Atkinson 3067 raw 1-bit 3024 (stride20: 3360)`.
- fonte: scratchpad quant/exp.py

### F12 [likely] Quantizzare nello 'spazio sunlight' (scegliere per ogni pixel il colore SDK la cui RESA corretta è più vicina al pixel originale, diffondendo l'errore rispetto alla resa) produce, nella simulazione con la LUT, un'immagine visibilmente più fedele all'originale rispetto alla quantizzazione RGB222 diretta (meno rosata/slavata), con PNG di dimensione simile (+3%: 18.167 vs 17.567 B).
- evidenza: Sheet `pennapps_2014_demohall.jpg_sunspace_sheet.png`: originale | FS-raw vista con LUT | FS-sunspace vista con LUT; la terza è più vicina alla prima. Dimensioni: `FS-serp 17567 Atkinson 17053 FS-sunspace 18167`.
- fonte: scratchpad quant/ (script errdiff con sunspace=True); LUT da color-mapping-sunlight.js

### F13 [verified] Il firmware ha già una funzione di riferimento per il colore leggibile: gcolor_legible_over(bg) calcola luminanza intera Rec.709 sui canali a 2 bit `(2126*r + 7152*g + 722*b) / 3` (0..10000) e restituisce Nero se ≥ 4510, altrimenti Bianco. gcolor_get_bw usa soglia 5000; gcolor_get_grayscale 3333/6666.
- evidenza: `static int32_t prv_get_luminance_10000(GColor8 color) { return (2126 * color.r + 7152 * color.g + 722 * color.b) / 3; }` ... `const int32_t MAGIC_THRESHOLD = 4510; return bright ? GColorBlack : GColorWhite;`
- fonte: PebbleOS src/fw/applib/graphics/gtypes.c righe 317-380; pebble.h riga ~3538 (gcolor_legible_over)

### F14 [verified] Tabelle di luminanza a 64 voci (indice = r<<4|g<<2|b) calcolate dalla LUT sunlight (Y lineare WCAG scalata 0..255): LUM_SUN = {0,3,15,36,14,18,28,49,65,69,80,100,160,165,175,195,5,8,19,39,20,23,34,54,71,74,85,105,167,170,181,201,25,28,39,59,39,42,53,73,90,94,104,125,185,189,201,219,60,62,74,94,74,77,87,108,125,129,140,160,218,223,234,255}; LUM_RAW (RGB222 puro) = {0,2,7,18,17,18,24,35,73,75,81,92,182,184,190,201,5,7,12,23,21,23,29,40,78,80,86,97,187,189,195,206,22,23,29,40,38,40,46,57,95,97,103,114,204,206,212,223,54,56,62,73,71,72,78,89,128,129,135,146,237,238,244,255}. Soglie WCAG su Y (0..255): crossover bianco/nero = 46 (Y=0,179); testo bianco scende sotto 3:1 se Y > 77; testo nero scende sotto 3:1 se Y < 25; 4,5:1 → 47 / 45.
- evidenza: Y = 0.2126 R_lin + 0.7152 G_lin + 0.0722 B_lin sui colori corretti; contrasto bianco = 1.05/(Y+0.05), nero = (Y+0.05)/0.05; uguali per Y = sqrt(0.0525)−0.05 = 0.1791.
- fonte: Calcolo nello scratchpad (script) a partire da color-mapping-sunlight.js; formula WCAG 2.x

### F15 [likely] Il testo su emery viene disegnato con alpha-blending per pixel (antialiasing dei glifi: `gcolor_alpha_blend(text_color, dest)`), quindi le cifre sono lisce anche sopra una foto ditherata. `graphics_fill_rect` (non-AA) invece usa `assign_horizontal_line` senza tener conto dell'alpha del fill color (e alpha ≤ 1 viene forzato a bianco): uno 'scrim' semitrasparente via fill_rect NON è disponibile — va fatto modificando i pixel del bitmap (o del framebuffer).
- evidenza: text_render.c:234 `dest_color = gcolor_alpha_blend(ctx->draw_state.text_color, ...)`; graphics.c:48 `if (gcolor_is_transparent(fill_color)) fill_color = GColorWhite;`; graphics.c:123 → graphics_private_draw_horizontal_line_integral → graphics_private.c:176 `draw_implementation->assign_horizontal_line(...)`.
- fonte: PebbleOS src/fw/applib/graphics/text_render.c riga 234; graphics.c righe 47-49, 123, 234; graphics_private.c righe 149-177

### F16 [likely CRIT] Capacità del browser per la pipeline: `CompressionStream('deflate')` produce esattamente zlib RFC 1950 (header + Adler-32, senza dizionario) — il formato che uz_inflate del firmware richiede — ed è disponibile da Chrome/Android WebView 80, Safari/iOS 16.4, Firefox 113 (Baseline maggio 2023). `imageSmoothingQuality` è un semplice hint: Chrome 54+, Safari 9.1+, ma NON supportato in Firefox (fino alla 157). Quindi: codificare PNG8 in puro JS senza librerie è fattibile (CRC32 + chunk + CompressionStream), e per il ridimensionamento non fidarsi del solo 'high' (usare dimezzamenti successivi o box-filter manuale).
- evidenza: MDN: '"deflate" — DEFLATE algorithm in ZLIB Compressed Data Format (RFC 1950)'; caniuse: CompressionStream Chrome 80, Safari 16.4, Firefox 113; imageSmoothingQuality Firefox 'Not supported' 2-157.
- fonte: https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream/CompressionStream ; https://caniuse.com/mdn-api_compressionstream ; https://caniuse.com/mdn-api_canvasrenderingcontext2d_imagesmoothingquality

### F17 [verified CRIT] UPNG.js (MIT) pesa 31.508 B (npm upng-js 2.1.0) e richiede pako (pako_deflate.min.js 27.876 B). `UPNG.encode([rgba.buffer], w, h, 0)` con un buffer RGBA che contiene ≤256 colori distinti scrive un PNG indexed (ctype 3) scegliendo la profondità dal numero di colori (≤2→1 bit, ≤4→2, ≤16→4, altrimenti 8), packing MSB-first, interlace 0, UN solo IDAT per immagine singola → compatibile con uPNG del firmware. Il PLTE è in ordine di prima occorrenza (irrilevante: l'orologio legge il PLTE). Ha anche un dithering interno (`UPNG.encode.dither`) ma legato al proprio quantizzatore adattivo, NON alla palette RGB222: non usarlo.
- evidenza: UPNG.js: `if(cc<=256 && forbidPlte==false) { if(cc<= 2) depth=1; else if(cc<= 4) depth=2; else if(cc<=16) depth=4; else depth=8; }`; `else if(depth==4) ... |= (inj[ii+x]<<(4-(x&1)*4))`; `data[offset] = 0; offset++; // interlace`; `wAs(data,offset,(j==0)?"IDAT":"fdAT")`; README: 'UPNG.js calls Pako.js for the Inflate and Deflate method'.
- fonte: https://raw.githubusercontent.com/photopea/UPNG.js/master/UPNG.js righe 609, 686, 770-790; https://github.com/photopea/UPNG.js (LICENSE MIT); dimensioni via jsdelivr

### F18 [verified CRIT] Canale di ritorno pagina di configurazione → PKJS nell'app Core Devices: la WebView intercetta `pebblejs://close#<dati>` (regex `^pebblejs://close(?:#|/\?|/)(.*)$`, `decodeURLPart()`), e passa la stringa a `window.signalWebviewClosedEvent(<JSON string>)` nel runtime PKJS. La WebView di configurazione Android ha `domStorageEnabled` e implementa `onShowFileChooser` (quindi `<input type=file accept="image/*">` apre il picker foto); su iOS è una WKWebView con javaScriptEnabled (file input nativo). PKJS gira in una WebView su Android (WebViewJsRunner) ma in JavaScriptCore su iOS (niente DOM/canvas): il lavoro su canvas va fatto nella pagina di configurazione. Nell'emulatore, `pebble emu-app-config` aggiunge `return_to=http://localhost:PORT/close?` e riceve i dati come query string di una GET su http.server di Python, che rifiuta request line > 65.536 B (414): il payload in emulatore deve restare sotto ~60 KB (base64url di un PNG da 20 KB ≈ 27 KB: ok).
- evidenza: WatchappSettingsScreen.kt: `private val PREFIX = "pebblejs://close"`, `val closeUrlRegex = Regex("""^pebblejs://close(?:#|/\?|/)(.*)$""")`, `data = ...decodeURLPart()`; WebViewJsRunner.kt:460 `webView?.evaluateJavascript("window.signalWebviewClosedEvent(${Json.encodeToString(data)})")`; WatchappSettingsScreen.android.kt:61-79 `rememberWebViewFileChooserParams ... onShowFileChooser ... launcher.launch(intent)`; browser.py:26 `url_append_params(url, {'return_to': 'http://localhost:{}/close?'})`, :53 `path, query = self.path.split('?', 1)`; CPython http/server.py `if len(self.raw_requestline) > 65536: ... 414`.
- fonte: github.com/coredevices/mobileapp: pebble/src/commonMain/kotlin/coredevices/pebble/ui/WatchappSettingsScreen.kt righe 205-232; pebble/src/androidMain/.../WatchappSettingsScreen.android.kt righe 41, 61-79; util/src/iosMain/kotlin/coredevices/ui/PebbleWebview.ios.kt riga 136; libpebble3/src/androidMain/.../js/WebViewJsRunner.kt riga 460; libpebble3/src/iosMain/.../js/JavascriptCoreJsRunner.kt; pebble_tool/util/browser.py righe 24-59; python3 http.server.BaseHTTPRequestHandler.handle_one_request

### F19 [verified] Pillow 12.1.1 (Python di sistema) genera asset di test corretti: `img.quantize(palette=Image.open('pebble_colors_64.gif').convert('P'), dither=Image.Dither.FLOYDSTEINBERG|NONE)` → PNG indexed con solo colori della palette (8 bit); con 16 colori: `img.putpalette(flat16)` + `save(..., bits=4)` → PNG depth 4 (verificato byte 24 = 4); 1 bit: `.convert('1')` (FS) o `.point(...)`. numpy NON è installato (fare i loop in puro Python: 45.600 px sono pochi). Il convertitore dell'SDK (png2pblpng.py) usa pypng con compression=9 e chunk_limit 2^20 → un solo IDAT, e ri-quantizza NEAREST: risorse già in palette passano invariate.
- evidenza: Esperimenti eseguiti: depth 4 confermato (`16col FS 4-bit PNG 22429 (depth 4)`); `ModuleNotFoundError: No module named 'numpy'`; png2pblpng.py: `png.Writer(width, height, compression=9, bitdepth=bitdepth, palette=palette, ...)`; png.py:371 `chunk_limit=2**20`.
- fonte: scratchpad quant/*.py; ~/.local/share/pebble-sdk/SDKs/4.33.1/sdk-core/pebble/common/tools/png2pblpng.py righe 139-147; ~/.local/share/pebble-sdk/SDKs/4.33.1/.venv/lib/python*/site-packages/png.py riga 371; docs/CONTINUA-QUI.md (Pillow 12.1.1)

### F20 [likely] Costo del calcolo del colore testo sull'orologio: leggere 200x76 = 15.200 byte dal GBitmap 8-bit (`gbitmap_get_data_row_info(bmp, y).data + x`, 1 byte = GColor8) con una LUT da 64 byte → ~6 operazioni intere per pixel ≈ 100 k operazioni → < 1 ms a 240 MHz (SF32LB52, Cortex-M33 compilato come Cortex-M3 soft-float), da eseguire una sola volta a ogni cambio foto/layout, non a ogni minuto. Campionando 1 pixel su 2 in x e y bastano 3.800 letture.
- evidenza: PIANO §2.2: SoC SiFli SF32LB52J 240 MHz; §9.1: ~984 CoreMark; API `GBitmapDataRowInfo gbitmap_get_data_row_info(const GBitmap*, uint16_t y)` con `.data` = indirizzo colonna 0.
- fonte: PIANO-SVILUPPO-PEBBLE.md righe 62 e 388; pebble.h righe 3936-3960

## Recommendation

## 0. Decisioni architetturali (sintesi)

1. **Formato di scambio e di archiviazione su emery: PNG8 indexed (color type 3), 8 bit, PLTE con ≤ 64 voci esattamente {0,85,170,255}^3, un solo IDAT, zlib RFC 1950, senza interlace.** Lo decodifica il firmware (`gbitmap_create_from_png_data`, uPNG+tinflate) senza codice nostro; costa 8–21 KB per foto (misurato) contro 45,6 KB raw. Il risultato è un `GBitmapFormat8Bit` da 45.600 B (+228 B) residente, disegnato con `graphics_draw_bitmap_in_rect`/`BitmapLayer` (GCompOpAssign = copia per riga). Picco heap al cambio foto ≈ PNG (≤ 24 KB) + 45.828 B + ~1,7 KB ≈ **72 KB**: sta nei 95–110 KiB di heap previsti per una watchface con 20–35 KB di statico (PIANO §3). Vincolo: liberare il buffer PNG subito dopo il decode; caricare PNG da persist a chunk da 256 B in un buffer allocato una volta.
   - **Variante 'risparmio RAM' (opzionale, selezionabile in configurazione): 16 colori RGB222 adattivi per foto → PNG a 4 bit → `GBitmapFormat4BitPalette` da 22.800 B (+228) residente.** Qualità quasi indistinguibile per la maggior parte delle foto (sheet `*_16sheet.png`), PNG di dimensione simile (19,7–22,4 KB). Il blit palettizzato costa una lookup per pixel (45.600/frame, una volta al minuto: trascurabile).
2. **Flint: raw 1 bit** (`GBitmapFormat1Bit`, LSB-first, 1 = bianco, stride 20 B → 3.360 B, 14 chiavi persist). Il PNG 1-bit ditherato è più grande del raw: non usarlo.
3. **Dithering: Floyd–Steinberg serpentine** come default per foto (qualità nettamente migliore; senza dithering la foto si posterizza in bande piatte; Bayer 4x4 mostra la griglia a 202 PPI ma dimezza il PNG: offrirlo come opzione 'compatto'). Il dithering **non ha alcun costo di energia sul display**: il driver spedisce l'intervallo di righe sporche a larghezza piena (display_jdi.c 183-185), il contenuto dei pixel è irrilevante. Costa solo byte PNG (≈ 2× rispetto a none/Bayer).
4. **Quantizzazione nello 'spazio sunlight' come opzione 'Ottimizza per il vetro'** (default ON per emery, con anteprima corretta come `pebble screenshot`): si sceglie il colore SDK la cui resa reale è più vicina al pixel e si diffonde l'errore rispetto alla resa. Nella simulazione rende la foto più fedele (meno rosata/slavata). ⚠️ La LUT viene dal pannello 2015: da confermare con una foto del PT2 reale (display.md §4.3 nota, PIANO §7.2).
5. **Colore testo automatico su orologio**, calcolato una volta per foto/layout sulla sola fascia del testo con LUT di luminanza a 64 voci (resa sunlight), regola 'meno pixel in conflitto' + isteresi 10 punti + **halo 1 px** nel colore opposto quando i pixel in conflitto superano il 15 %. Alternativa più radicale e a costo zero per frame: 'scrim' scurendo in place la fascia del bitmap al caricamento.
6. **Canale telefono → PKJS**: la pipeline (crop, resize, quantizzazione, PNG) gira nella **pagina di configurazione** (WebView Android/WKWebView iOS: canvas, file picker e CompressionStream disponibili); il risultato torna a PKJS in `pebblejs://close#` come **base64url** (niente `+`/`/`, niente percent-encoding necessario dato `decodeURLPart`), poi PKJS lo spezza in AppMessage. In emulatore il payload deve restare < ~60 KB (limite request line di http.server). Su telefono reale la lunghezza massima dell'URL intercettato va misurata (open question): progettare fin d'ora **una foto per sessione di configurazione** (≤ 24 KB PNG → ≤ 32 KB base64url) e, se necessario, più sessioni.

## 1. Pipeline JavaScript (pagina di configurazione)

### 1.1 Caricamento e crop
```js
// <input type="file" accept="image/*"> — su Android la WebView di config implementa onShowFileChooser (verificato), su iOS è nativo.
async function loadPhoto(file) {
  // 'from-image' applica l'orientamento EXIF (Chrome 81+, Safari 15+); fallback: <img> + CSS image-orientation (default from-image nei browser moderni)
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (e) { const img = new Image(); img.src = URL.createObjectURL(file); await img.decode(); return img; }
}
// Crop interattivo: mantenere un rettangolo con rapporto W:H (200:228 = 0,877; 144:168 = 0,857 — quasi uguali:
// usare lo stesso crop per entrambi e un secondo crop 'automatico' centrato per flint dentro quello scelto).
// sx, sy, sw, sh in pixel sorgente; la UI (touch/drag) manipola solo questi 4 numeri.
```

### 1.2 Ridimensionamento (deterministico, buona qualità)
`imageSmoothingQuality='high'` è solo un hint (assente in Firefox). Due opzioni robuste:
```js
// A) dimezzamenti successivi + passo finale (≈ box filter, funziona ovunque)
function downscale(src, sx, sy, sw, sh, dw, dh) {
  let c = document.createElement('canvas'); c.width = sw; c.height = sh;
  c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  let w = sw, h = sh;
  while (w >= 2 * dw && h >= 2 * dh) {
    const nw = w >> 1, nh = h >> 1, c2 = document.createElement('canvas'); c2.width = nw; c2.height = nh;
    const x2 = c2.getContext('2d'); x2.imageSmoothingEnabled = true; x2.imageSmoothingQuality = 'high';
    x2.drawImage(c, 0, 0, w, h, 0, 0, nw, nh); c = c2; w = nw; h = nh;
  }
  const out = document.createElement('canvas'); out.width = dw; out.height = dh;
  const o = out.getContext('2d', { willReadFrequently: true });
  o.imageSmoothingEnabled = true; o.imageSmoothingQuality = 'high';
  o.drawImage(c, 0, 0, w, h, 0, 0, dw, dh);
  return o.getImageData(0, 0, dw, dh);           // RGBA, dw*dh*4 byte
}
// B) box filter manuale (area averaging, interi) sull'ImageData del crop: identico su ogni browser;
//    per 200x228 in uscita costa (sw*sh) somme — ok fino a foto 12 MP (~50 ms in JS).
```
**Gamma**: per fedeltà, fare la media in luce lineare (LUT sRGB→lineare 256 voci, poi lineare→sRGB) — evita che le zone dettagliate si scuriscano nel downscale. Non è indispensabile: differenza piccola a questi fattori.

### 1.3 Tono per il MiP (contrasto ~20:1, riflettivo)
Il nero del pannello è ~5 % del bianco: i dettagli nelle ombre spariscono. Applicare una LUT di tono regolabile (slider 'Luminosità/Contrasto' con anteprima **corretta** con la LUT sunlight, cioè quello che l'utente vedrà davvero):
```js
function toneLUT(gamma = 0.85, lift = 0) { const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = Math.round(255 * Math.pow(Math.min(1, lift + (1 - lift) * i / 255), gamma)); return t; }
```
Non esiste una 'pre-compensazione inversa' della LUT: è una mappa discreta 64→64 sui soli colori SDK. Ciò che si può (e conviene) fare è la **quantizzazione nello spazio della resa** (§1.4).

### 1.4 Quantizzazione RGB222 + dithering
Palette: indice `idx = (r2 << 4) | (g2 << 2) | b2` con `r2 = round(r/85)`; byte GColor8 opaco = `0xC0 | idx`. Poiché la palette è un cubo uniforme 4×4×4, **il colore più vicino in RGB si ottiene per canale** (nessuna ricerca): `q(v) = Math.min(3, (v + 42) / 85 | 0)`.
```js
const PAL = new Array(64), PAL_SUN = new Array(64);   // [r,g,b]; PAL_SUN dalla tabella colorMappingSunlight (64 voci)
// Spazio 'sun': LUT 32x32x32 (32 K voci) → indice palette più vicino nella resa (costruita una volta: 32K*64 distanze)
function buildSunLUT() { const L = new Uint8Array(32768);
  for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
    const R = r * 255 / 31, G = g * 255 / 31, B = b * 255 / 31; let best = 0, bd = 1e12;
    for (let k = 0; k < 64; k++) { const p = PAL_SUN[k]; const d = (p[0]-R)**2 + (p[1]-G)**2 + (p[2]-B)**2; if (d < bd) { bd = d; best = k; } }
    L[(r << 10) | (g << 5) | b] = best; } return L; }

// Floyd–Steinberg serpentine, fixed point x16, errore su due righe (cur/next), target = PAL o PAL_SUN
function ditherFS(rgba, w, h, sunLUT /* null = spazio raw */) {
  const idx = new Uint8Array(w * h), tgt = sunLUT ? PAL_SUN : PAL;
  let cur = new Int32Array((w + 2) * 3), nxt = new Int32Array((w + 2) * 3);
  for (let y = 0; y < h; y++) {
    const ltr = (y & 1) === 0, dir = ltr ? 1 : -1;
    for (let i = 0; i < w; i++) {
      const x = ltr ? i : w - 1 - i, p = (y * w + x) * 4, e = (x + 1) * 3;
      let r = rgba[p] * 16 + cur[e], g = rgba[p+1] * 16 + cur[e+1], b = rgba[p+2] * 16 + cur[e+2];
      r = r < 0 ? 0 : r > 4080 ? 4080 : r; g = g < 0 ? 0 : g > 4080 ? 4080 : g; b = b < 0 ? 0 : b > 4080 ? 4080 : b;
      const R = r >> 4, G = g >> 4, B = b >> 4;
      const k = sunLUT ? sunLUT[((R >> 3) << 10) | ((G >> 3) << 5) | (B >> 3)]
                       : (Math.min(3, (R + 42) / 85 | 0) << 4) | (Math.min(3, (G + 42) / 85 | 0) << 2) | Math.min(3, (B + 42) / 85 | 0);
      idx[y * w + x] = k;
      const t = tgt[k], er = r - t[0] * 16, eg = g - t[1] * 16, eb = b - t[2] * 16;
      const a = (x + 1 + dir) * 3, c = (x + 1 - dir) * 3;          // 7/16 avanti, 3/16 dietro-sotto, 5/16 sotto, 1/16 avanti-sotto
      cur[a] += er * 7 >> 4; cur[a+1] += eg * 7 >> 4; cur[a+2] += eb * 7 >> 4;
      nxt[c] += er * 3 >> 4; nxt[c+1] += eg * 3 >> 4; nxt[c+2] += eb * 3 >> 4;
      nxt[e] += er * 5 >> 4; nxt[e+1] += eg * 5 >> 4; nxt[e+2] += eb * 5 >> 4;
      nxt[a] += er >> 4;     nxt[a+1] += eg >> 4;     nxt[a+2] += eb >> 4;
    }
    const t = cur; cur = nxt; nxt = t; nxt.fill(0);
  }
  return idx;   // 0..63 per pixel (= argb & 0x3F)
}
// Bayer 4x4 (opzione 'compatto': PNG ≈ metà, pattern regolare visibile)
const B4 = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];
function ditherBayer(rgba, w, h) { const idx = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = ((B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16 - 0.5) * 85, p = (y * w + x) * 4, q = v => Math.min(3, Math.max(0, Math.round((v + t) / 85)));
    idx[y * w + x] = (q(rgba[p]) << 4) | (q(rgba[p+1]) << 2) | q(rgba[p+2]); } return idx; }
```
Per la variante 16 colori: scegliere i 16 indici RGB222 più frequenti nell'immagine FS-64 (o median-cut sull'istogramma 64), costruire `sub[16]` e una mappa 64→16 'più vicino' e diffondere l'errore rispetto al colore scelto in `sub`.

### 1.5 Packing 6 bit (solo se si vuole un formato raw proprio; NON serve col PNG)
```js
function pack6(idx) { const out = new Uint8Array(Math.ceil(idx.length * 6 / 8)); let o = 0;
  for (let i = 0; i < idx.length; i += 4) { const a = idx[i], b = idx[i+1] | 0, c = idx[i+2] | 0, d = idx[i+3] | 0;
    out[o++] = (a << 2) | (b >> 4); out[o++] = ((b & 15) << 4) | (c >> 2); out[o++] = ((c & 3) << 6) | d; } return out; }
// 200x228 → 34.200 B; sull'orologio va comunque espanso a 1 byte/px (0xC0|idx) in un GBitmapFormat8Bit: nessun vantaggio rispetto al PNG.
```

### 1.6 Codifica PNG8 in puro JS (≈ 60 righe, nessuna libreria)
```js
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) { const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length))); return out; }
async function zlib(bytes) {                     // RFC 1950: esattamente ciò che uz_inflate accetta (CM=8, no FDICT, Adler-32)
  if (typeof CompressionStream === 'function') { const cs = new CompressionStream('deflate'); const wr = cs.writable.getWriter(); wr.write(bytes); wr.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
  if (window.pako) return pako.deflate(bytes, { level: 9 });      // fallback 27,9 KB
  return storedZlib(bytes);                                          // fallback estremo: blocchi 'stored' (nessuna compressione, +0,1 %)
}
async function encodePNG8(idx, w, h, palRGB /* Uint8Array 3*n, valori 0/85/170/255 */, depth /* 8 | 4 */) {
  const bpl = Math.ceil(w * depth / 8), raw = new Uint8Array((bpl + 1) * h);      // filtro 0 (None) per riga: su immagini ditherate i filtri non aiutano
  for (let y = 0; y < h; y++) { const o = y * (bpl + 1) + 1;
    if (depth === 8) raw.set(idx.subarray(y * w, (y + 1) * w), o);
    else for (let x = 0; x < w; x++) raw[o + (x >> 1)] |= idx[y * w + x] << (4 - (x & 1) * 4); }   // MSB-first come uPNG/raw_image_get_value_for_bitdepth
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer); dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = depth; ihdr[9] = 3 /* indexed */; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 /* NO interlace */;
  const idat = await zlib(raw);                                                      // UN SOLO IDAT (limite PBL-14294 del firmware)
  const sig = new Uint8Array([137,80,78,71,13,10,26,10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('PLTE', palRGB), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
```
Con depth 8 usare come indici **direttamente** `idx` (0..63) e un PLTE da 64 voci in ordine `idx` (r<<4|g<<2|b): sull'orologio il PLTE diventa `palette[i] = GColorFromRGBA(...)` = `0xC0|i` e la de-palettizzazione è l'identità. Con depth 4 remappare gli indici su `sub[16]` e scrivere un PLTE da 16 voci. Niente tRNS, niente chunk ancillari (gAMA, sRGB…): i critici sconosciuti fanno fallire uPNG.
Alternativa a libreria: `UPNG.encode([rgba.buffer], w, h, 0)` (31,5 KB + pako 27,9 KB, MIT) sull'RGBA già quantizzato → PNG indexed corretto (1 IDAT, no interlace, depth per numero di colori). Costa ~60 KB di JS in più: preferire l'encoder minimale.

### 1.7 Dimensioni attese (200x228, 64 colori)
none 7–11 KB · Bayer 4x4 8–11 KB · Atkinson 15–17 KB · **FS 17–21 KB** · 16 colori FS 4-bit 20–22 KB. Budget di progetto: **≤ 24 KB per foto** (96 chiavi persist da 256 B; 10 foto ≈ 240 KB ≈ 23 % del MiB). Base64url ≈ ×1,34 → ≤ 32 KB per sessione di configurazione.

## 2. Flint (144x168, 1 bit)
```js
// luminanza intera Rec.709 in spazio sRGB (percettivo: per un pannello B/N riflettivo dà il risultato più naturale), con LUT di tono
function toGray(rgba, w, h, tone) { const g = new Int32Array(w * h);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) g[i] = tone[(54 * rgba[p] + 183 * rgba[p+1] + 19 * rgba[p+2]) >> 8] * 16; return g; }
// FS serpentine 1 bit (Atkinson: stessi 6 vicini (1,0)(2,0)(-1,1)(0,1)(1,1)(0,2) con peso 1/8 ciascuno: più contrasto, brucia le luci; offrirlo come opzione)
function dither1(g, w, h) { const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const ltr = !(y & 1), dir = ltr ? 1 : -1;
    for (let i = 0; i < w; i++) { const x = ltr ? i : w - 1 - i, k = y * w + x, v = g[k], nv = v >= 2048 ? 4080 : 0; bits[k] = nv ? 1 : 0; const e = v - nv;
      const add = (xx, yy, wgt) => { if (xx >= 0 && xx < w && yy < h) g[yy * w + xx] += e * wgt >> 4; };
      add(x + dir, y, 7); add(x - dir, y + 1, 3); add(x, y + 1, 5); add(x + dir, y + 1, 1); } }
  return bits; }
// Packing GBitmapFormat1Bit: LSB-first, 1 = bianco, stride = ((w+31)>>5)<<2  (144 → 20 B; totale 3.360 B)
function pack1(bits, w, h) { const stride = ((w + 31) >> 5) << 2, out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bits[y * w + x]) out[y * stride + (x >> 3)] |= 1 << (x & 7); return out; }
```
Sull'orologio: `s_bmp = gbitmap_create_blank(GSize(144,168), GBitmapFormat1Bit)` (o `gbitmap_create_blank(layer_get_bounds size)`), poi copiare i chunk direttamente in `gbitmap_get_data(s_bmp)` (verificare `gbitmap_get_bytes_per_row(s_bmp) == 20`). Nessun decode, nessun buffer temporaneo. ⚠️ Non usare il packing MSB-first dei formati palettizzati/PNG per questo buffer.

## 3. Colore testo automatico (C, senza float)
Fascia = rettangolo del testo (es. 200x76 per il layout '1/3 schermo', o quello del layout 'cifre a tutto schermo'); ricalcolare a ogni cambio foto e a ogni cambio di fascia (Quick View/layout), mai nel tick.
```c
// Y lineare 0..255 della RESA sunlight, indice = argb & 0x3F (r<<4|g<<2|b). Alternativa: LUM_RAW (RGB222 puro).
static const uint8_t LUM_SUN[64] = {0,3,15,36,14,18,28,49,65,69,80,100,160,165,175,195,5,8,19,39,20,23,34,54,71,74,85,105,167,170,181,201,25,28,39,59,39,42,53,73,90,94,104,125,185,189,201,219,60,62,74,94,74,77,87,108,125,129,140,160,218,223,234,255};
#define Y_WHITE_BAD 77   // sopra: testo bianco < 3:1   (WCAG: 1.05/(Y+0.05) = 3)
#define Y_BLACK_BAD 25   // sotto: testo nero  < 3:1   ((Y+0.05)/0.05 = 3)
#define Y_CROSSOVER 46   // Y = 0.179: bianco e nero hanno lo stesso contrasto
typedef struct { bool white; bool halo; uint8_t bad_pct; } TextStyle;
static TextStyle s_style;      // stato persistente per l'isteresi

static void text_style_compute(const GBitmap *bmp, GRect band) {
  uint32_t n = 0, sum = 0, n_bright = 0, n_dark = 0;
  const int16_t y_end = band.origin.y + band.size.h, x_end = band.origin.x + band.size.w;
  for (int16_t y = band.origin.y; y < y_end; y += 2) {                       // 1 riga su 2: 7.600 px per 200x76
    const GBitmapDataRowInfo ri = gbitmap_get_data_row_info(bmp, y);          // 8Bit: 1 byte/px; per 4BitPalette usare palette[nibble]
    const uint8_t *p = ri.data;
    for (int16_t x = band.origin.x; x < x_end; x += 2) {
      const uint8_t l = LUM_SUN[p[x] & 0x3F];
      sum += l; n++;
      if (l > Y_WHITE_BAD) n_bright++; else if (l < Y_BLACK_BAD) n_dark++;
    }
  }
  if (n == 0) { s_style = (TextStyle){ .white = true, .halo = false, .bad_pct = 0 }; return; }
  const uint32_t bad_white = n_bright * 100 / n, bad_black = n_dark * 100 / n;   // % di pixel in conflitto per ciascuna scelta
  bool want_white = (bad_white != bad_black) ? (bad_white < bad_black) : (sum / n < Y_CROSSOVER);
  if (want_white != s_style.white) {                                          // isteresi: cambia solo con vantaggio ≥ 10 punti
    const uint32_t cur_bad = s_style.white ? bad_white : bad_black;
    const uint32_t new_bad = want_white ? bad_white : bad_black;
    if (cur_bad >= new_bad + 10) s_style.white = want_white;
  }
  s_style.bad_pct = s_style.white ? bad_white : bad_black;
  s_style.halo = (s_style.bad_pct > 15);                                      // >15 % di pixel 'ostili' → contorno 1 px
  APP_LOG(APP_LOG_LEVEL_DEBUG, "text %s bad=%u%% halo=%d", s_style.white ? "white" : "black", (unsigned)s_style.bad_pct, s_style.halo);
}

// Disegno: halo = testo ripetuto 8 volte (offset ±1) nel colore opposto, poi il testo. 9 draw_text al minuto: trascurabile.
static void draw_text_halo(GContext *ctx, const char *s, GFont f, GRect r, GTextAlignment al) {
  const GColor fg = s_style.white ? GColorWhite : GColorBlack, bg = s_style.white ? GColorBlack : GColorWhite;
  if (s_style.halo) {
    static const int8_t d[8][2] = {{-1,0},{1,0},{0,-1},{0,1},{-1,-1},{1,-1},{-1,1},{1,1}};
    graphics_context_set_text_color(ctx, bg);
    for (int i = 0; i < 8; i++) {
      const GRect o = { { r.origin.x + d[i][0], r.origin.y + d[i][1] }, r.size };
      graphics_draw_text(ctx, s, f, o, GTextOverflowModeFill, al, NULL);
    }
  }
  graphics_context_set_text_color(ctx, fg);
  graphics_draw_text(ctx, s, f, r, GTextOverflowModeFill, al, NULL);
}
```
Note: (a) il firmware fa lo stesso tipo di decisione in `gcolor_legible_over` (soglia 4510/10000 su Rec.709 a 2 bit) ma per un solo colore: qui si ragiona su una fascia intera. (b) La riga info (passi/batteria/data, Gothic 18–24) usa lo stesso colore; con `bad_pct` tra 5 e 15 % un halo 'a croce' (4 offset) basta per i font piccoli. (c) 'Terzo colore': se si vuole un accento invece di bianco/nero, scegliere dalla tabella §7.2: per fascia scura `GColorPastelYellow` (19:1 su nero), `GColorIcterine`, `GColorCeleste`; per fascia chiara `GColorOxfordBlue` (16,6:1 su bianco), `GColorBulgarianRose`, `GColorImperialPurple`; mantenere l'halo nel colore opposto (nero/bianco). (d) **Scrim** a costo zero per frame: al caricamento scurire in place la fascia del bitmap (`p[x] = 0xC0 | ((p[x] >> 1) & 0x15)` dimezza ogni canale: 3→1, 2→1, 1→0) e forzare testo bianco senza halo — ottima leggibilità, ma altera la foto: offrirlo come opzione. `graphics_fill_rect` con alpha NON blenda (assign path): non usarlo per lo scrim. (e) Il testo è antialiasato con alpha-blend per pixel (text_render.c) e resta liscio sopra la foto ditherata.
Costo: 7.600 letture + LUT ≈ < 0,5 ms a 240 MHz, una volta per foto; nessun `float`, nessuna divisione nel loop.

## 4. Lato orologio (emery): caricamento della foto
```c
// 1) leggere il PNG da persist (chunk da 256 B) in s_png (malloc una volta, dimensione = size salvata)
// 2) GBitmap *bmp = gbitmap_create_from_png_data(s_png, s_png_size);  → NULL se ENOMEM/formato: loggare e tenere la foto precedente
// 3) free(s_png) subito (il decoder non lo referenzia dopo il return)   → resident: 45.828 B (8Bit) o 23.044 B (4BitPalette)
// 4) text_style_compute(bmp, band); bitmap_layer_set_bitmap(...); un solo layer_mark_dirty()
// Log heap prima/dopo (regola 11). Verificare gbitmap_get_format(bmp) == GBitmapFormat8Bit (o 4BitPalette) e bounds 200x228.
```
Foto successive: distruggere il bitmap corrente PRIMA di decodificare la nuova (altrimenti picco ≈ 45,8 + 45,8 + 24 KB). Se si vuole una transizione, usare 4-bit (2 × 23 KB).

## 5. Asset di test a build-time con Pillow (12.1.1, presente)
```python
from PIL import Image
pal = Image.open('tools/palette/pebble_colors_64.gif').convert('P')
im = Image.open('foto.jpg').convert('RGB')                      # + crop/resize LANCZOS a 200x228
q64 = im.quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG)   # PNG8 a 8 bit, solo colori della palette
q64.save('resources/images/photo~color~rect~200w.png', optimize=True)
# variante 16 colori → 4 bit: cols = 16 indici RGB222 più usati; p16 = Image.new('P',(16,1)); p16.putpalette(flat); q16 = im.quantize(palette=p16, dither=FS); q16.putpalette(flat); q16.save(..., bits=4)
# flint: im.resize((144,168)).convert('L').convert('1').save('photo~bw.png')  (FS di Pillow)
```
Nel `package.json`: `{"type":"bitmap","name":"PHOTO_TEST","file":"images/photo.png","memoryFormat":"8Bit" (o "4BitPalette"),"spaceOptimization":"memory","targetPlatforms":["emery"]}`; l'SDK ri-quantizza NEAREST e i colori restano identici. Per testare proprio il decoder PNG a runtime (come farà l'app con i dati da persist), aggiungere la risorsa come `"type":"raw"` e passarla a `gbitmap_create_from_png_data`. Attenzione: il PNG scritto da Pillow è ok per uPNG (1 IDAT, no interlace, PLTE) — verificare che non contenga chunk critici extra (Pillow scrive solo IHDR/PLTE/IDAT/IEND più eventuali ancillari, ignorati).

## 6. Numeri da tenere a mente
- Palette: 64 colori = {0,85,170,255}^3; idx = r<<4|g<<2|b; GColor8 opaco = 0xC0|idx; `GColorFromRGB` tronca (>>6): emettere solo valori esatti.
- PNG accettato dal firmware: ctype 3/0, depth 1/2/4/8, 1 IDAT, no interlace, zlib CM8 senza FDICT; 8 bit → GBitmapFormat8Bit 45.828 B; 4 bit → 4BitPalette 23.028 B + 16 B.
- 1Bit raw (flint): LSB-first, 1 = bianco, stride ((w+31)/32)*4 = 20 B → 3.360 B. Palettizzati/PNG: MSB-first, stride byte.
- Dithering: nessun costo display; PNG FS ≈ 2× none/Bayer; FS = qualità migliore; Bayer = compatto ma griglia visibile; Atkinson = più contrasto, brucia le luci.
- Soglie testo (Y sunlight 0..255): crossover 46; conflitto bianco > 77; conflitto nero < 25; halo se > 15 % dei pixel della fascia in conflitto; isteresi 10 punti.
- Canale config → PKJS: `pebblejs://close#<base64url>`; emulatore ≤ ~60 KB per sessione (http.server 65.536 B); telefono reale: da misurare.

## Open questions
- Lunghezza massima del payload accettato in `pebblejs://close#…` dall'app Core Devices su Android (WebView `onInterceptUrlRequest`) e iOS (WKWebView `decidePolicyForNavigationAction`): serve un test con 32 KB e 64 KB di base64url. Nell'emulatore il limite è ~64 KB (request line di http.server). Se troppo basso, ripiego: una foto per sessione oppure invio via server (contro offline-first).
- La LUT 'sunlight' risale al pannello JDI del Pebble Time 2015 (display.md §4.3 nota; PIANO §7.2 ❓): confermare su un PT2 reale fotografando una scala di colori; finché non è confermata, la 'quantizzazione nello spazio della resa' e le tabelle LUM_SUN vanno considerate un'approssimazione (fallback: LUM_RAW).
- Tempo reale di `gbitmap_create_from_png_data` per un PNG da 20 KB → 45,8 KB su PT2 (stima < 50 ms a 240 MHz con tinflate, ma non misurato) e sull'emulatore; misurare con `time_ms()` e loggare heap prima/dopo.
- Picco heap effettivo al cambio foto con l'app completa (font, layer, buffer AppMessage 8200 B se aperto durante il caricamento): confermare che 8-bit 64 colori sia sostenibile o passare alla variante 4-bit/16 colori come default.
- Dithering in spazio lineare vs sRGB e valore ottimale di gamma/lift per il MiP riflettivo: da valutare a occhio sull'orologio reale (in interni, senza retroilluminazione).
- Supporto di `createImageBitmap(file, {imageOrientation:'from-image'})` nelle WebView dell'app (orientamento EXIF delle foto da fotocamera): verificare su Android WebView e iOS; altrimenti leggere l'orientamento EXIF a mano (tag 0x0112) e ruotare sul canvas.
- Se `graphics_fill_rect` con colore ad alpha 2 (66 %) blenda davvero su emery: dalla lettura del sorgente il percorso non-AA usa `assign_horizontal_line` (no blending); verifica empirica di 1 minuto nell'emulatore prima di scartare lo scrim via fill_rect.
- Percentuale di conflitto (15 %) e isteresi (10 punti) sono valori iniziali ragionati sulle soglie WCAG 3:1: tarare con 10–20 foto reali e i due layout (fascia 1/3 e cifre a tutto schermo), anche con Quick View attivo (fascia spostata).

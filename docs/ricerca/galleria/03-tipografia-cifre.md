# v2:5d81829efd85c42ac9a73b5a1a8f135dd0603d174638d756fbccbadcf4c89518

## Findings (22)

### F0 [verified CRIT] MAX_FONT_GLYPH_SIZE = 512 B su emery e gabbro, 256 B su aplite/basalt/chalk/diorite/flint. Il generatore di font dell'SDK passa questo valore per piattaforma a fontgen.py.
- evidenza: pebble_sdk_platform.py: riga 159 ("NAME": "emery" → "MAX_FONT_GLYPH_SIZE": 512), riga 197 (flint → 256), riga 233 (gabbro → 512). resource_generator_font.py:27-28 `return pebble_platforms[env.PLATFORM_NAME]["MAX_FONT_GLYPH_SIZE"]`, poi passato a `Font(ttf_path, height, max_glyphs, definition.max_glyph_size, …)` (riga 97-104).
- fonte: ~/.local/share/pebble-sdk/SDKs/4.33.1/sdk-core/pebble/common/tools/pebble_sdk_platform.py:159,197,233 ; …/common/waftools/resources/resource_map/resource_generator_font.py:27-28,97-104

### F1 [verified CRIT] La dimensione di un glifo è calcolata come ceil(width×height/8) byte del SOLO bounding box dell'inchiostro (1 bit/pixel, righe non allineate; header di 5 B escluso). Se supera il limite fontgen solleva un'eccezione e il build FALLISCE (nessun glifo saltato silenziosamente). Limite pratico su emery: area inchiostro ≤ 4096 px (es. 56×72 = 4032 px → 504 B ok; 45×90 = 4050 ok; 64×64 ok; 90×100 = 9000 px impossibile).
- evidenza: fontgen.py:362-375: `size = ((width * height) + (8 - 1)) // 8 ; if size > self.max_glyph_size: raise Exception("Glyph too large! codepoint {}: {} > {}…")`. Verificato con `pebble build` reale (progetto di test con Anton-Regular a pixelHeight 110 su emery): output `Exception: Glyph too large! codepoint 9647: 559 > 512 … Build failed.` (exit 1). Con pixelHeight 100 il build passa (cifra '0' = 45×88 px = 496 B).
- fonte: fontgen.py:362-375 ; test: /tmp/claude-1000/-home-claudecode-ProgettiClaude-Pebble/3a0edc64-8139-470b-b1b7-295a8aad8717/scratchpad/fonttest (package.json, build log)

### F2 [verified CRIT] La compressione RLE4 ("compress": "RLE4" in package.json) NON permette glifi più grandi: il numero di unità RLE deve stare in un byte (≤ 255 → al massimo 2040 px) e la decodifica avviene in-place nello stesso buffer da 512 B. Per cifre grandi fallisce con "Unable to RLE4 compress -- more than 255 units required".
- evidenza: fontgen.py:351-360 (`if height > 255: raise Exception("Unable to RLE4 compress…")`, poi `check_decompress_glyph_RLE4` che verifica la decodifica in-place entro max_glyph_size, righe 234-308). Firmware: text_resources.c:244 `PBL_ASSERTN(num_rle_units <= (CACHE_GLYPH_SIZE * RLE4_UNITS_PER_BYTE))`, 282 `PBL_ASSERTN(dst < &data[CACHE_GLYPH_SIZE])`. Test: tutti i 12 font provati a (altezza max + 2) px falliscono con RLE4 (es. Anton 102: 612 unità; Oswald 102: 572 unità).
- fonte: fontgen.py:234-308,351-360 ; pebbleos/src/fw/applib/graphics/text_resources.c:205-290 ; scratchpad/glyphtest3.py output

### F3 [verified CRIT] Trappola: il glifo .notdef (gindex 0) viene SEMPRE incluso come wildcard U+25AF e conta nel limite di 512 B; in molti font (Bebas Neue, Oswald, Antonio, Teko, Saira, Big Shoulders, Fjalla) è il .notdef, non le cifre, a far fallire il build. Rimedio verificato: svuotare il .notdef con fontTools prima del build (Bebas Neue: pixelHeight max da 96 a 124 → cifre da 69 a 89 px di altezza).
- evidenza: fontgen.py:466-470 `add_glyph(WILDCARD_CODEPOINT, next_offset, 0, …)` (gindex 0 = .notdef) prima del loop sui codepoint; il filtro characterRegex non lo esclude (righe 448-455). Misure: Bebas h=98 → `codepoint 9647: 535 > 512` mentre '0' è 32×69 = 276 B. Con .notdef vuoto (`f['glyf']['.notdef'] = TTGlyphPen(None).glyph()`, `uv run --with fonttools`): h=124 → '0' 42×89 px = 468 B, wildcard 1×1.
- fonte: fontgen.py:184-187,448-470 ; scratchpad/glyphtest3.py su fonts/BebasNeue-Regular.ttf e fonts/BebasNeue-notdef0.ttf

### F4 [verified CRIT] Un file .pbf pre-generato viene incluso RAW senza alcun controllo a build-time; a runtime il firmware fa PBL_ASSERT sulla dimensione del glifo → fault (assert), non glifo saltato.
- evidenza: resource_generator_font.py:77-78 `elif font_ext.lower() == ".pbf": font_data = open(font_path, "rb").read()`. text_resources.c:317-319 `PBL_ASSERT(glyph_size_bytes <= CACHE_GLYPH_SIZE, "text codepoint %x is %zu bytes, overflowing %zu max size"…)`; passert.c:23-34 `handle_passert_failed_vargs → trigger_fault(RebootReasonCode_Assert, lr)`. Non ho letto fault_handling.c: non so se il fault in task app uccide solo l'app o riavvia l'orologio.
- fonte: resource_generator_font.py:75-80 ; pebbleos/src/fw/applib/graphics/text_resources.c:306-320 ; pebbleos/src/fw/system/passert.c:23-34

### F5 [verified CRIT] Il rendering del testo Pebble è 1-bit senza antialias: i glifi sono rasterizzati mono da FreeType (o soglia >127 se grayscale) e ogni bit acceso scrive text_color (alpha=3) nel framebuffer 8-bit. `graphics_context_set_antialiased` non ha effetto sul testo. Se il contesto è in GCompOpSet il testo viene invece alpha-blended.
- evidenza: fontgen.py:310-342 (`FT_LOAD_RENDER | FT_LOAD_MONOCHROME | FT_LOAD_TARGET_MONO`; `1 if val > 127 else 0`). text_render.c:217-238: `if ((mask & src) & (1 << bitindex)) { if (compositing_mode == GCompOpSet) dest_color = gcolor_alpha_blend(text_color, …) else { dest_color = text_color; dest_color.a = 3; } dest_addr[bitindex] = dest_color.argb; }`. Screenshot emery del test: nella fascia LECO 60 i soli colori presenti sono i due grigi dello sfondo e (255,255,255); nella fascia Anton solo nero/grigi/bianco (nessun livello intermedio).
- fonte: fontgen.py:310-342 ; pebbleos/src/fw/applib/graphics/text_render.c:52-100,205-245 ; scratchpad/fonttest/shot_emery.png (analisi Pillow)

### F6 [verified] Costo RAM di un font custom: 56 B di heap (FontInfo) + FontCache in AppState (fuori dal budget app: offset table 1024 B, 30 entry, glyph_buffer 5+512 B); i glifi sono letti dalla flash a ogni miss. Misurato: font Anton_100 + sprite 51×101 1-bit = 916 B di heap totali.
- evidenza: text_resources.h:58-64,78-107 (`CACHE_GLYPH_SIZE MAX_FONT_GLYPH_SIZE`, `LINE_CACHE_SIZE 30`, `OFFSET_TABLE_MAX_SIZE 1024`, `glyph_buffer[sizeof(LineCacheData)+CACHE_GLYPH_SIZE]`). Log emulatore emery: `before load: heap used=244 free=128964` → `after font+sprite: heap used=1160 free=128048`.
- fonte: pebbleos/src/fw/applib/graphics/text_resources.h ; scratchpad/fonttest/run_emery.log

### F7 [verified] Altezze reali delle cifre dei font di sistema (inchiostro, in px, dai .pbf del firmware; 'max_height' = altezza riga, non delle cifre): LECO_60_BOLD 42 (':' 33; '0' 30×42, advance 38, top-offset 18, riga 60); LECO_60 regular 42 ('0' 29×42, adv 37); LECO_42 29 ('0' 20×29, adv 26); LECO_38 27; LECO_36 25; LECO_32 22; LECO_28_LIGHT 20; LECO_26 18; LECO_20 14; BITHAM_42_BOLD 30 ('0' 26×30, adv 29); BITHAM_42_LIGHT 31; BITHAM_42_MEDIUM_NUMBERS 30; BITHAM_34_MEDIUM_NUMBERS 24; BITHAM_30_BLACK 21; DROID_SERIF_28_BOLD 20; GOTHIC_28/28_BOLD 18; GOTHIC_24 14; GOTHIC_18 11; GOTHIC_14 9; ROBOTO_BOLD_SUBSET_49 35 (generato da Roboto-Bold.ttf a 49 px, regex [:0-9]); ROBOTO_CONDENSED_21 ≈15. Rapporto cifra/riga LECO 60 = 0,70.
- evidenza: Parser scritto sul formato v3 (docs/reference/formats/font.md) applicato a resources/normal/base/pbf/*.pbf; controllo incrociato con gli screenshot 200×228 della guida SDK (asset `leco_60_bold_emery.png`: righe con inchiostro 18-59 = 42 px; `roboto_49_bold_subset_emery.png`: 35 px; `bitham_42_bold_emery.png`: 30 px). Definizione ROBOTO_BOLD_SUBSET_49 in resources/normal/base/resource_map.json (`"file": "normal/base/ttf/Roboto-Bold.ttf", "characterRegex": "[:0-9]"`).
- fonte: scratchpad/pbfparse.py su pebbleos/resources/normal/base/pbf/ ; tools/sdk-docs/source/assets/images/guides/app-resources/fonts/*_emery.png ; pebbleos/resources/normal/base/resource_map.json

### F8 [verified] Su emery/gabbro esistono font di sistema NON dichiarati in pebble_fonts.h ma risolvibili per chiave stringa: RESOURCE_ID_AGENCY_FB_88_NUMBERS_AM_PM (cifre 67 px, '0' 20×67, adv 27, condensed sottile), AGENCY_FB_88_THIN ('0' 16×67, adv 24) e AGENCY_FB_46 ('0' 10×35). Assenti su flint (fallback a Gothic 14, senza crash). Dipendenza non documentata: da usare solo con controllo a runtime.
- evidenza: resource_map.json di obelix (PT2), qemu_emery e getafix contengono `{"type":"font","name":"AGENCY_FB_88_NUMBERS_AM_PM", "characterRegex":"[ 0-9:/.,°APMHIK+-%]"}`; qemu_flint/asterix no. generate_fonts.py:9-19 mette in `s_font_resource_keys[]` tutti i resource di tipo font; system_resource.c:49-61 li cerca con strcmp; fonts.c:27-48 fa fallback se NULL. Test emulatore emery 4.33.2: `fonts_get_system_font("RESOURCE_ID_AGENCY_FB_88_NUMBERS_AM_PM")` ptr=0x200015a4 ≠ Gothic14 (0x2000107c), diverso dal fallback di una chiave inesistente; "88" renderizzato 67 px (visibile 171-227 perché tagliato dal bordo).
- fonte: pebbleos/resources/normal/{obelix,qemu_emery,getafix,qemu_flint,asterix}/resource_map.json ; pebbleos/tools/resources/waftools/generate_fonts.py ; pebbleos/src/fw/resource/system_resource.c:49-92 ; pebbleos/src/fw/applib/fonts/fonts.c:27-48 ; scratchpad/fonttest/run_emery3.log, shot_emery3.png

### F9 [likely] LECO 1976 (font orologio di sistema) è un font commerciale (Carnoky Type, MyFonts): utilizzabile solo come font di sistema in ROM, non ridistribuibile in un TTF/pbf/sprite custom senza licenza. TimeStyle lo ridistribuisce come .ffont (vettoriale fctx) e come bitmap 48×71 per aplite senza dichiarare la licenza del font (la MIT del repo copre il codice).
- evidenza: system-fonts.md §Obtaining System Font Files: `LECO 1976 - https://www.myfonts.com/fonts/carnoky/leco-1976/ - Available from Myfonts.com`. TimeStyle package.json: `fonts/LECO1976-Regular.ffont` type raw; resources/images/digit_leco_0..9.png (48×71 RGBA, targetPlatforms aplite); LICENSE = MIT.
- fonte: tools/sdk-docs/source/_guides/app-resources/system-fonts.md:184-199 ; scratchpad/TimeStylePebble/package.json, LICENSE, resources/

### F10 [verified CRIT] Approccio (a) font .pbf custom su emery: cifre al massimo ~88-93 px di altezza e solo se condensed (area ≤ 4096 px). Misure fontgen (pixelHeight → altezza cifra × larghezza '0', byte '0'): Anton 100 → 88×45 (496); Antonio 700 106 → 93×42 (492); Oswald 700 100 → 84×45 (476); Oswald 500 100 → 83×42 (436); Roboto Condensed 700 114 → 83×47 (488); Barlow Condensed Bold 112 → 81×44 (448, limita il '4'); Big Shoulders 700 96 → 79×34; Fjalla One 88 → 76×36; Saira Condensed Bold 106 → 75×42; Teko 600 118 → 75×44; Bebas Neue 96 → 69×32 (124 → 89×42 con .notdef vuoto). Rapporto altezza-cifra/pixelHeight: Anton 0,88, Antonio 0,88, Fjalla 0,86, Oswald 0,84, Big Shoulders 0,82, Roboto Cond. 0,73, Barlow 0,72, Bebas 0,72, Saira 0,71, Teko 0,64. Su flint (256 B) si scende a ~62 px (Anton 70).
- evidenza: Script che importa il fontgen.py dell'SDK (stesso FreeType, stessa soglia) e scorre pixelHeight a passi di 2 fino all'eccezione; verifica sull'emulatore: Anton_100 su emery rende "23" con 87 righe di inchiostro (69-158 con contorno 1 px), pbf 6,6 KB per [0-9:].
- fonte: scratchpad/glyphtest3.py (output completo) ; scratchpad/fonttest/shot_emery.png ; fontgen.py

### F11 [verified CRIT] Approccio (b) sprite bitmap: PNG a 2 colori con trasparenza + "memoryFormat": "1BitPalette" → GBitmapFormat1BitPalette (fmt=2), righe allineate a 32 bit (ceil(w/32)×4 B): 90×100 px = 1200 B/cifra (10 cifre = 12 KB flash). La palette è modificabile a runtime (`gbitmap_get_palette(b)[i] = colore`, indice con a=0 = trasparente) e il blit con GCompOpSet passa dal percorso palette→8bit per-pixel con alpha blend (nessun fast path a parole). Precisione pixel-exact, colore libero, dimensione libera.
- evidenza: pebble.h emery: 3683-3684 GBitmapFormat1BitPalette/2BitPalette, 3748 `GColor* gbitmap_get_palette`, 3759 `gbitmap_set_palette`, 4286 `graphics_draw_bitmap_in_rect`. bitblt_private.c (8_bit): dispatcher 416-445 (`GBitmapFormat1BitPalette|2Bit|4Bit → bitblt_bitmap_into_bitmap_tiled_palette_to_8bit`), loop per-pixel con `gcolor_alpha_blend(actual_color, dest)` (righe ~239-249). Test: sprite '8' 51×101 caricato (fmt=2, pal0.a=0 pal1.a=3), palette cambiata nero→bianco fra i blit, 9 blit (8 offset contorno + 1 riempimento) = 4-7 ms su QEMU emery, 1-2 ms su QEMU flint.
- fonte: ~/.local/share/pebble-sdk/SDKs/4.33.1/sdk-core/pebble/emery/include/pebble.h:3683-3759,4286 ; pebbleos/src/fw/applib/graphics/8_bit/bitblt_private.c ; scratchpad/fonttest/src/c/fonttest.c, run_emery.log, shot_emery.png

### F12 [verified CRIT] Approccio (c) PDC: i comandi path sono riempiti con gpath_draw_filled (o gpath_fill_precise_internal per i path 'precise' a 1/8 px); su piattaforme colore il riempimento è antialiasato se ctx->draw_state.antialiased (default true), altrimenti scanline non-AA (bordi a gradini). Il PDC porta anche stroke color+width, quindi il contorno è gratis in un solo draw. svg2pdc appiattisce le curve ai soli estremi dei segmenti: le curve vanno pre-flattenate in polilinee nell'SVG. Non pixel-exact con AA; CPU per redraw più alta di un blit (fill poligonale con molti vertici).
- evidenza: gdraw_command.c:49-98 (`prv_draw_path`: `gpath_draw_filled` + `gpath_draw_stroke` se stroke_width>0; `prv_draw_precise_path`: `gpath_fill_precise_internal`). gpath.c:118-125 `if (ctx->draw_state.antialiased) { prv_fill_path_with_cb_aa(…); return; }`. tools/svg2pdc.py:113-115 "only .start/.end endpoints of each segment … curves are already flattened to their endpoints".
- fonte: pebbleos/src/fw/applib/graphics/gdraw_command.c ; pebbleos/src/fw/applib/graphics/gpath.c ; /home/claudecode/ProgettiClaude/Pebble/tools/svg2pdc.py:113-115,136-150

### F13 [verified] Costo della tecnica contorno via testo: disegnare la stringa 8 volte con offset ±1 px nel colore opposto e poi 1 volta nel colore principale funziona (verificato visivamente) e costa 3-5 ms su QEMU emery per "23" a 88 px con font .pbf (8-9 ms su QEMU flint). Tempi QEMU solo indicativi.
- evidenza: fonttest.c `draw_text_outlined` (8 offset {-1,-1}…{1,1}); log: `custom 9x text=3..5 ms` (emery), `8..9 ms` (flint); screenshot mostra contorno nero continuo di 1 px attorno alle cifre bianche su sfondo a bande.
- fonte: scratchpad/fonttest/src/c/fonttest.c ; run_emery.log, run_flint.log ; shot_emery.png, shot_flint.png

### F14 [verified] URL di download diretto verificati (HTTP 200, GitHub google/fonts, licenza OFL): Oswald[wght].ttf 172.088 B (variabile 200-700); BebasNeue-Regular.ttf 61.400 B; RobotoCondensed[wght].ttf 371.616 B (ora in ofl/); BarlowCondensed-Bold.ttf 109.912 B (statico); Anton-Regular.ttf 170.812 B; Teko[wght].ttf; Antonio[wght].ttf; FjallaOne-Regular.ttf; SairaCondensed-Bold.ttf; BigShouldersDisplay[wght].ttf. 404: apache/robotocondensed/RobotoCondensed-Bold.ttf e ofl/oswald/static/Oswald-Bold.ttf (nessuna cartella static).
- evidenza: `curl -s -L -o … -w %{http_code}` su https://raw.githubusercontent.com/google/fonts/main/ofl/<famiglia>/<file>; listing API `https://api.github.com/repos/google/fonts/contents/ofl/oswald` = ['DESCRIPTION.en_us.html','FONTLOG.txt','METADATA.pb','OFL.txt','Oswald[wght].ttf','upstream_info.md'].
- fonte: scratchpad/fonts/ (file scaricati) ; output curl/API GitHub

### F15 [verified] fontgen non imposta coordinate di variazione: con un TTF variabile usa l'istanza di default (Oswald 400, Teko 300, Antonio 400, Big Shoulders 100!). Per avere il peso Bold in un .pbf (o negli sprite) occorre istanziare un TTF statico prima del build (fontTools varLib.instancer) o usare famiglie con file statici (Barlow Condensed, Anton, Bebas).
- evidenza: fontgen.py: nessuna chiamata a set_var_design_coords/FT_Set_Var_Design_Coordinates; assi letti con freetype-py: Oswald wght (200,400,700) default 400, Teko (300,300,700), Antonio (100,400,700), BigShouldersDisplay (100,100,900).
- fonte: fontgen.py (intero) ; scratchpad/glyphtest3.py output ("axes")

### F16 [verified] TimeStyle (7.11.2) offre 6 opzioni font per l'ora tutte vettoriali via pebble-fctx (.ffont, risorse "type": "raw"): Avenir Next Regular, Avenir Next DemiBold (Regular/Bold/Bold-ore/Bold-minuti) e LECO 1976 Regular; nessun .pbf con characterRegex. Su aplite usa bitmap per cifra (digit_*.png 48×71, 3 set) con palette swap. Dimensione: em = 4/7 dell'altezza non ostruita (228 → 130 px; LECO +6), padding verticale h/16, LECO disegnato senza AA ("leco looks awful with antialiasing"); Avenir con AA ("palette swapping"). Sidebar 34 px (43 con large fonts) su emery/gabbro, 30 px altrove. La sidebar usa Gothic 18/24/28 Bold su emery.
- evidenza: package.json (resources media: LECO1976-Regular.ffont, AvenirNextRegular.ffont, AvenirNextDemiBold.ffont; dependencies pebble-fctx ^1.6.5); clock_area.c:80-131 (`font_size = 4 * bounds.size.h / 7`, `fctx_enable_aa(false)` per LECO, `layer_get_unobstructed_bounds`); sidebar.c:10-25; clock_digit_legacy.c:1-60; sidebar_widgets.c:144-150. Nessuna occorrenza di "Blocko" nel repo attuale.
- fonte: scratchpad/TimeStylePebble/{package.json,src/c/clock_area.c,src/c/sidebar.c,src/c/clock_digit_legacy.c,resources/images}

### F17 [verified] pebble-fctx 1.6.5 (npm 2026-02-22) supporta emery e flint; il compilatore .ffont (pebble-fctx-compiler 1.2.2) è fermo al 2016-12-04 e richiede font SVG. Alternativa vettoriale con AA, ma toolchain datata e non pixel-exact.
- evidenza: registry npm: pebble-fctx latest 1.6.5 time 2026-02-22T17:45:33Z; pebble-fctx-compiler latest 1.2.2 time 2016-12-04, bin fctx-compiler; README pebble-fctx: emery support v1.6.1, flint v1.6.3, AA su colore, `fctx_set_text_em_height` = scala.
- fonte: https://registry.npmjs.org/pebble-fctx ; https://registry.npmjs.org/pebble-fctx-compiler ; https://raw.githubusercontent.com/jrmobley/pebble-fctx/master/README.md

### F18 [verified] Non esiste una watchface "Tempest Time" nello store Rebble/rePebble né su GitHub. Esiste "Tempest" di Lukas (2015, solo binario basalt, nessun sorgente, id 55efdd697c6abbfd9d000094): layout 144×168 con icona batteria + "50 %" in alto al centro (~y 8-20), ore "09" grandi e sottili (~48 px) al centro-sinistra, minuti piccoli (~20 px) in apice a destra con icona meteo sotto, poi "SEP 09" (~22 px) e "WEDNESDAY" (~14 px) in basso; sfondo blu. NON è il layout "cifre a 1/3 con riga info": quel riferimento resta da identificare con l'utente.
- evidenza: Query Algolia index rebble-appstore-production ("tempest", "tempest time") → unico hit "Tempest | Lukas | watchface"; API https://appstore-api.rebble.io/api/v1/apps/id/55efdd697c6abbfd9d000094 (source: null, compatibility emery has_binary false); 3 screenshot scaricati e osservati.
- fonte: scratchpad/tempest/*.png ; appstore-api.rebble.io ; WebSearch (nessun risultato per "Tempest Time")

### F19 [verified] Layout nativi emery di riferimento: //GRID (gerbert): ora LECO_60 (24h) o LECO_42 (12h, spazio per AM/PM) in GRect(0,20,200,62), meteo Gothic 18 Bold y=84 h=22, data Gothic 24 Bold y=106 h=30, riga salute 4 celle Gothic 14 y=140 h=37, barra batteria 4 px in fondo, tutto scalato sull'altezza non ostruita. kface: Roboto Bold Subset 49 in box y=-7 h=54 (il font ha ~14 px di spazio morto sopra i glifi), data Bitham 42 Bold y=58 h=46, numeri Bitham 34; l'autore nota che le Y vanno tarate su screenshot perché il padding interno dei font di sistema non è deducibile dal box.
- evidenza: grid/src/c/layout.c:7-30,77-85 e clock.c:7-22 ; kface/src/c/mvc/views/view_time.c:1-40 ; kface/CLAUDE.md:60-70.
- fonte: scratchpad/grid/src/c/{layout.c,clock.c} ; scratchpad/kface/src/c/mvc/views/view_time.c

### F20 [likely] Timeline Quick View su emery ostruisce 59 px in basso (51 px sulle altre piattaforme); l'area non ostruita è quindi 200×169 e va gestita con layer_get_unobstructed_bounds + unobstructed_area_service_subscribe.
- evidenza: docs/ricerca/display.md:252 (tabella TIMELINE_PEEK_HEIGHT 59 px emery / 51 px), 279-283 (sorgente popups/timeline/peek.h con PREFERRED_CONTENT_SIZE_SWITCH); non riverificato in questa sessione sul sorgente.
- fonte: /home/claudecode/ProgettiClaude/Pebble/docs/ricerca/display.md:252-300

### F21 [verified] Tempi di rendering misurati su QEMU (solo indicativi, non cycle-accurate): LECO 60 "23:59" 0-4 ms; font .pbf 88 px "23" ×9 (contorno) 3-5 ms; sprite 51×101 1-bit ×9 blit 4-7 ms su emery; su flint 2-6 / 8-9 / 1-2 ms.
- evidenza: APP_LOG con time_ms() nell'update_proc del progetto di test, due passate per piattaforma.
- fonte: scratchpad/fonttest/run_emery.log, run_emery3.log, run_flint.log

## Recommendation

## Sintesi decisionale

1. **Cifre a tutto schermo (~90×100 px su 200×228): usare SPRITE BITMAP palettizzati generati a build-time (approccio b).** Il font .pbf è escluso dal limite hard di 4096 px di inchiostro per glifo (512 B, `fontgen.py:369-375`, build fallisce); il PDC non è pixel-exact (fill AA) o è a gradini (AA off) e costa più CPU; fctx ha toolchain del 2016. Gli sprite sono pixel-exact per costruzione, hanno colore libero via palette, e con una palette a 2 bit (trasparente/riempimento/contorno) il contorno per leggibilità sulla foto costa **un solo blit** per cifra.
2. **Layout "1/3 + riga info": font di sistema `FONT_KEY_LECO_60_BOLD_NUMBERS_AM_PM` (cifre 42 px) come default a costo zero**, oppure un .pbf custom (Anton/Oswald a pixelHeight 60-72 → cifre 53-63 px, ≤ 512 B/glifo) per la scelta di font; contorno = 8 draw offset + 1 (3-5 ms su QEMU, una volta al minuto → irrilevante).
3. Nitidezza: il testo Pebble è 1-bit senza AA (`text_render.c:217-238`) e gli sprite a soglia sono 1-bit: entrambi nitidi "per natura". Non usare AA (`graphics_context_set_antialiased(ctx,false)` per le primitive) e non scalare mai le bitmap a runtime.

## Numeri da tenere a mente (emery)
- Limite glifo .pbf: `ceil(w·h/8) ≤ 512` → area ≤ 4096 px. Header 5 B escluso. RLE4 inutile (≤ 255 unità). Il `.notdef` conta: svuotarlo con fontTools se limita (Bebas: da 69 a 89 px di altezza).
- Altezza massima cifre .pbf per font (pixelHeight → h×w '0'): Antonio 700 106→93×42; Anton 100→88×45; Bebas (notdef vuoto) 124→89×42; Oswald 700 100→84×45; Roboto Condensed 700 114→83×47; Barlow Cond. Bold 112→81×44. Su flint (256 B) ≈ Anton 70 → 62 px.
- Font di sistema: LECO 60 Bold cifre 42 px ('0' 30 px, advance 38; "23:59" ≈ 38·4+17 = 169 px di larghezza, top-offset 18 nel box da 60); LECO 42 → 29 px; Bitham 42 Bold → 30 px; Roboto Bold Subset 49 → 35 px (con ~14 px di spazio morto sopra); AGENCY_FB_88 (non in pebble_fonts.h, solo emery/gabbro) → 67 px sottile: opzione "gratis" ma undocumented, non adatta a foto (troppo sottile, no bold).
- Sprite 1-bit: riga = ceil(w/32)·4 B → 90×100 = 1200 B; 2-bit (con contorno) riga = ceil(2w/32)·4 → 90×100 = 2400 B; 10 cifre = 12 / 24 KB flash. Heap: caricare solo le ≤4 cifre visibili (≈5-10 KB) o tutte (12-24 KB). Budget con foto 8-bit full-screen 45,6 KB + stack 4 KB: ≈ 60-75 KB usati su ~129 KB → ok su emery; su flint (64 KB) usare sprite 1-bit più piccoli (60×64 = 512 B/cifra) e font di sistema.
- Quick View: 59 px in basso → area 200×169.

## Pipeline sprite (tools/gen_digits.py, Python del venv pebble-tool: ha freetype-py 2.5.1 e Pillow 12.3)
- Usare **freetype-py con `FT_LOAD_RENDER|FT_LOAD_MONOCHROME|FT_LOAD_TARGET_MONO`** (identico a fontgen.py:311-317) per avere lo stesso hinting mono del firmware; Pillow serve solo per comporre/salvare i PNG. Se si usa `ImageFont.truetype` + soglia 127 il risultato è simile ma non identico (hinting grayscale).
- Per ogni set (font, altezza): rasterizzare '0'..'9' (+ ':' per il layout compatto) alla dimensione pixel target; **ritagliare tutte le cifre con lo stesso bounding box verticale (unione)** e, per le cifre impilate HH/MM, **larghezza fissa = max width** (allineamento tabulare) con cifra centrata; contorno = `ImageFilter.MaxFilter(3)` (1 px) o `MaxFilter(5)` (2 px) sulla maschera, meno la maschera → indice 2. Salvare PNG in modalità P a 3 colori con indice 0 trasparente; in package.json `"memoryFormat": "2BitPalette"`, `"spaceOptimization": "memory"`, `"targetPlatforms": ["emery"]`, nomi `DIGIT_<FONT>_<SIZE>_<N>`; per flint set 1-bit 60×64 con `"1BitPalette"`.
- Font variabili (Oswald, Teko, Antonio, Big Shoulders): istanziare prima un TTF statico (`fontTools.varLib.instancer`), perché fontgen/FreeType usano l'istanza di default (Big Shoulders = peso 100!).
- Colore automatico: a ogni cambio foto calcolare la luminanza media della zona sotto le cifre (somma componenti RGB222 del GColor8) → palette `[1] = GColorWhite, [2] = GColorBlack` se scura, invertita se chiara: `GColor *p = gbitmap_get_palette(bmp); p[1] = fill; p[2] = outline;` (verificato: l'indice con `.a == 0` è lo sfondo trasparente). Disegnare con `graphics_context_set_compositing_mode(ctx, GCompOpSet)` e riportare a `GCompOpAssign` prima di disegnare testo (in GCompOpSet il testo viene alpha-blended, text_render.c:231-233).

## Tre font consigliati (SIL OFL, TTF verificati scaricabili)
1. **Anton** — https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf (170.812 B). Bold condensato, rapporto cifra/pixelHeight 0,88 (il più "denso"): a 100 px → cifre 88×45. Statico, .notdef piccolo. Default consigliato per foto.
2. **Oswald** — https://raw.githubusercontent.com/google/fonts/main/ofl/oswald/Oswald%5Bwght%5D.ttf (172.088 B, variabile 200-700 → istanziare 600/700). A 100 px → 84×45; forme più "orologio". Il .notdef (508 B a 100) limita il .pbf: svuotarlo.
3. **Bebas Neue** — https://raw.githubusercontent.com/google/fonts/main/ofl/bebasneue/BebasNeue-Regular.ttf (61.400 B). Stretto ed elegante (0,72): per .pbf svuotare il .notdef (124 px → 89×42). Alternative: Barlow Condensed Bold (statico, https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/BarlowCondensed-Bold.ttf), Roboto Condensed (ora OFL, variabile). Evitare LECO 1976 e Avenir (commerciali; usare LECO solo via font di sistema).

## Wireframe 200×228 (emery) — coordinate (x,y,w,h)

**Layout A "1/3 + riga info"** (contenuto dinamico solo nei primi 100 px → invariante con Quick View):
```
(0,0,200,228)   foto (GBitmap 8-bit o 4-bit palette), disegnata per prima in update_proc
(0,6,200,60)    ora "23:59" LECO_60_BOLD centrata: inchiostro y 24..65 (42 px), larghezza ≈169 → margini 15
                [variante font custom .pbf Anton_72: cifre ≈63 px, box (0,4,200,80)]
                contorno: 8 draw offset ±1 nel colore opposto + 1 draw; oppure banda semitrasparente
(0,72,200,22)   riga info Gothic 18 Bold (o LECO 20 per i numeri, 14 px): "6.532 passi · 82% · mer 25 ago"
                3 celle: (4,72,64,22) passi | (68,72,64,22) batteria | (132,72,64,22) data
(0,94,200,134)  foto libera; Quick View copre (0,169,200,59) senza toccare nulla
```
Variante "in basso" (ora a y 150): richiede spostare la banda a y 100 quando `layer_get_unobstructed_bounds` restituisce h=169 → più lavoro, sconsigliata.

**Layout B "cifre a tutto schermo" (HH sopra MM)**, sprite 2-bit 86×96 (fill+contorno 1-2 px), larghezza fissa:
```
(0,0,200,228)     foto
(10,10,86,96)     H1   (104,10,86,96)   H2      → riga HH y 10..106
(10,118,86,96)    M1   (104,118,86,96)  M2      → riga MM y 118..214, margine inferiore 14
zero iniziale: se off, H1 non disegnato e H2 centrato in (57,10,86,96)
12h: indicatore AM/PM Gothic 14 Bold in (168,214,28,14) (o omesso)
Quick View (h non ostruita 169): passare al Layout A compatto (LECO 60 a y 6 + riga info) invece di scalare:
  sprite non scalabili, e 2 righe da 96 px non entrano in 169 px. Set alternativo 60×68 (HH y 8..76, MM y 88..156) se si vuole restare "full".
```
Flint 144×168 (1-bit): Layout A con LECO 32 Bold (22 px) o LECO 42 (29 px) a y 4, riga info Gothic 14 a y 40; Layout B con sprite 1-bit 60×64: HH (10,8,60,64)+(74,8,60,64), MM y 88..152.

## Regole operative
- Un `layer_mark_dirty()` al minuto; in update_proc: blit foto → blit 2-4 sprite (o 1 draw_text) → riga info. Nessuna allocazione in update_proc: precaricare gli sprite delle cifre correnti in tick handler (destroy/create solo quando cambia una cifra: al massimo 1-2 al minuto).
- Font .pbf sempre con `characterRegex` (`[0-9:]` → ~6 KB a 100 px); nome risorsa che termina con l'altezza; `targetPlatforms` per risorsa (il limite flint è 256 B: lo stesso font a 100 px NON compila su flint).
- Non spedire mai .pbf pre-generati con glifi > 512 B: nessun controllo a build e assert a runtime.
- Test di regressione: screenshot emulatore + script Pillow che verifica righe di inchiostro attese e assenza di colori intermedi (come fatto in `scratchpad/fonttest`).

## Materiale prodotto (riutilizzabile)
- `scratchpad/glyphtest3.py`: misura per qualunque TTF l'altezza massima compatibile col limite (usa fontgen.py dell'SDK). `scratchpad/pbfparse.py`: metriche dei .pbf. `scratchpad/fonttest/`: app di test (font custom, sprite con palette swap, contorno, timing) con screenshot emery/flint.

## Open questions
- Comportamento del PBL_ASSERT in text_resources.c:317 (glifo > 512 B in un .pbf pre-generato): fault dell'intero orologio o solo kill dell'app? (fault_handling.c non letto) — rilevante solo se si spediscono .pbf non generati dall'SDK.
- Tempi reali su hardware PT2 (SF32LB52 a 96 MHz?) per blit di sprite 2-bit 86×96 e per la foto 8-bit full-screen: QEMU non è cycle-accurate; misurare con time_ms() sull'orologio.
- AGENCY_FB_88/46: garanzia di presenza nelle future release firmware (non esposti in pebble_fonts.h; presenti in obelix/getafix/qemu_emery 4.33.x). Usarli solo con controllo a runtime (confronto col risultato di una chiave inesistente).
- Quale watchface intendeva l'utente con "Tempest Time": nello store esiste solo "Tempest" (Lukas, 2015, basalt) con ore grandi + minuti in apice + data, non "1/3 + riga info". Chiedere screenshot/link.
- Cifre tabulari: Anton/Oswald/Bebas hanno larghezze proporzionali; per HH/MM impilati conviene forzare larghezza fissa negli sprite (verificare l'estetica dell'1 centrato).
- Luminanza della foto sotto le cifre: definire soglia e zona di campionamento (media su fascia ora vs. per singola cifra) e se serve una banda semitrasparente (GCompOpSet con alpha) oltre al contorno.
- Formato di memorizzazione delle foto (8-bit 45,6 KB vs 4-bit palette 22,8 KB) e dove vivono (persist 1 MiB, chunk da 256 B): condiziona quanti sprite tenere in heap su emery e rende il Layout B impraticabile su flint con foto 1-bit full-screen + 64 KiB.
- Identità di rasterizzazione Pillow vs fontgen: per sprite pixel-identici al .pbf usare freetype-py con FT_LOAD_TARGET_MONO (disponibile nel venv pebble-tool) invece di ImageFont + soglia; da verificare su 2-3 cifre.

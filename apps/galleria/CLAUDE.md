# CLAUDE.md — app **Galleria** (`apps/galleria`)

Watchface per Pebble Time 2 (`emery`) + Pebble 2 Duo (`flint`): foto dal telefono a rotazione come sfondo,
ora grande e nitida, colore testo automatico. Valgono **tutte** le regole di `../../CLAUDE.md` (root); qui solo
ciò che è specifico dell'app. I numeri qui sotto sono l'**ultima misura verificata (17/09/2026; stato dello store al
19/09/2026)**: la fonte unica dei numeri, con la loro storia, sono `PIANO.md` §5 e `../../docs/design/galleria.md` §8,
non questo file.

## Da leggere a inizio sessione
1. `PIANO.md` (piano a sessioni: fare la sessione indicata in §8 "Stato", una per volta) e `../../docs/CONTINUA-QUI.md`.
2. `../../docs/design/galleria.md` (scelte di design, wireframe, modello dati, protocollo, budget) e
   `../../docs/design/README.md` (indice dei documenti di design, dal 17/09/2026: quale documento vale per quale
   sessione e quali sono storici o bozze sospese).
3. Per il multilingua: `../../docs/design/galleria-s10-i18n.md` (D31–D38, glossario di traduzione),
   `../../docs/design/galleria-s11-lingue-es-pt.md` (D39–D42: spagnolo e portoghese) e `i18n/README.md`.
4. Per l'anteprima nella config page: `../../docs/design/galleria-s12-anteprima.md` (D43–D48: tetto della pagina
   a 96 KB, URL in base64, maschere delle cifre, che cosa mostra l'anteprima).
5. Per la config page **di oggi**: `../../docs/design/galleria-s13-ux-casual.md` §2 (principi e lessico), §3 (struttura),
   §13 (D80–D103 struttura), §14 (D104–D125 flusso della foto), §15 (D126–D135, UX-4: gate sul telefono, note di design,
   store, lettura pre-gate del 17/09); il gate sul telefono è `../../docs/design/galleria-s13-ux4-gate-telefono.md`.

## Comandi
```bash
. ~/ProgettiClaude/Pebble/tools/pebble-env.sh
cd ~/ProgettiClaude/Pebble/apps/galleria
pebble build 2>&1 | grep -A4 "MEMORY USAGE"            # annotare in PIANO.md §5
pebble install --emulator emery --logs                   # emulatore fresco: la watchface parte
pebble screenshot --emulator emery --no-open shot_emery.png
pebble install --emulator flint && pebble screenshot --emulator flint --no-open shot_flint.png
pebble emu-set-timeline-quick-view on --emulator emery   # Quick View (peek 59 px su emery)
pebble emu-time-format --format 12h --emulator emery     # 12h|24h (NON "12"/"24": fallisce in silenzio)
pebble emu-tap --direction x+ --emulator emery           # shake → foto successiva (S4: log "rot(shake)")
make -C test                                             # ~60 s, tutto: test host (gcc) timefmt, crc, photo_codec (+fixture), luma, rotation, storage,
#   sync_proto, model e sync (sync.c inalterato con lo shim AppMessage/dict; shim persist/timer/ui_fake in test/shim/; con SRC_DIR=<copia> usare anche
#   OUT=<altra dir> RELATIVO a test/: il target run-% antepone ./) + pyselftest + jstest (b64, album, motore sync con orologio finto, smoke, index_retry,
#   devstorage, devpage, pipeline, preview, page) + devtest (dev server --selftest) + dumbtest (dbm.dumb + SIGKILL) + pagecheck + glosscheck (UX-4/D132,
#   tools/galleria_gloss_check.py: la tabella di docs/design/galleria-s10-i18n.md §3 deve coprire TUTTE le chiavi di messages.json con testi uguali parola
#   per parola: ogni chiave nuova o riscritta vuole la sua riga nella tabella) + logstats (galleria_logstats.py --selftest + test_logstats.py) + cards (test_cards.py)
python3 test/gen_sync_fixture.py                         # rigenera test/fixture_photo.js (foto sintetica raw6/raw1 in base64url per i test node; --check la verifica)
python3 ../../tools/galleria_devserver.py --album a.jpg b.jpg [--scenario seq|dup|crc|interrupt] [--settings '{"font":1}']
#   S5b: dev server = config page dell'emulatore (porta 8765; tools/README.md §11; --dump-page/--dump-json per i test; fermarlo con il PID,
#   non con `pkill -f` da una Bash che contiene lo stesso testo: uccide la shell)
#   pebble wipe && pebble install --emulator emery --logs → il PKJS legge /state.json, scarica le foto a richiesta e le sincronizza (log "[album]"/"[dev]"/"[sync]")
BROWSER=true pebble emu-app-config --emulator emery &     # apre (senza browser) il ritorno della pagina: curl -X POST localhost:8765/save -d '{...}'
#   poi curl "localhost:<porta ss -ltnp>/close?<token>" (vedi PIANO §4 S5b)
rm ~/.local/share/pebble-sdk/4.33.1/emery/qemu_spi_flash.bin   # orologio azzerato con album del "telefono" intatto (pebble wipe cancella anche il localStorage di pypkjs)
GALLERIA_DEFINES="GALLERIA_DEMO_INDEX=1 GALLERIA_DEBUG_OUTLINE=1" pebble build   # define di test (wscript): demo 2 fissa (album vuoto), alone forzato;
#   anche GALLERIA_DEBUG_TEXT_COLOR=3 (giallo)/4 (Oxford), GALLERIA_DEBUG_BT_OFF, GALLERIA_DEBUG_PERSIST, GALLERIA_DEBUG_OUTBOX=100 (outbox troppo
#   piccola → WARNING tripwire `dict_write -> 2, msg 2 incompleto`, HELLO senza SLOTS)
GALLERIA_DEFINES="GALLERIA_DEBUG_SEED=1 GALLERIA_DEBUG_INTERVAL=1" pebble build   # S4: copia le demo in persist (slot 0/1, =2 riscrive) + rotazione ogni minuto
#   anche GALLERIA_DEBUG_ORDER=1 (casuale), GALLERIA_DEBUG_SETTINGS_SAVE=1 (salva in persist gli hook FONT/LAYOUT/…: poi una build normale li rilegge),
#   GALLERIA_DEBUG_CORRUPT_SLOT=1 (chunk 0 dello slot 1 alterato in lettura → CRC MISMATCH → fallback allo slot successivo)
python3 ../../tools/photo_prep.py --out resources/photos --name demo_1 --stats --preview --preview-dir /tmp/prep foto.jpg   # foto → raw6+raw1 (tools/README.md §9)
~/.local/share/uv/tools/pebble-tool/bin/python ../../tools/gen_digits.py --fonts-dir resources/fonts --out resources/digits --header src/c/digit_metrics.h --fit-width --no-colon-b --pack --masks-js src/pkjs/digit_masks.js
#   strip cifre + digit_metrics.h + MASCHERE per l'anteprima (S12/D45, 121.107 B: la stima di ~26 KB della spec valeva per UN font), comando
#   CANONICO: --check con le stesse opzioni verifica tabella e modulo (dentro pagecheck); --selftest 63 controlli
GALLERIA_DEFINES="GALLERIA_DEBUG_LAYOUT=1 GALLERIA_DEBUG_FONT=4 GALLERIA_DEBUG_STYLE=2" pebble build   # layout B con Francois One trasparente 3D
#   GALLERIA_DEBUG_FONT: 0 Anton, 1 Bebas, 2 Barlow, 3 LECO, 4 Francois One, 5 Staatliches; GALLERIA_DEBUG_STYLE (S8-stile): 0 pieno, 1 trasparente,
#   2 trasparente 3D, 3 pieno 3D (su flint 2 vale 1 e 3 vale 0, D26); GALLERIA_DEBUG_LANG (S10/D31, S11/D39): 0 auto (strftime del firmware),
#   1 en, 2 it, 3 de, 4 fr, 5 es, 6 pt → data da datefmt.c e separatore delle migliaia
GALLERIA_DEFINES="GALLERIA_LOG_VERBOSE=1 GALLERIA_DEBUG_HEAP=1 GALLERIA_DEBUG_TIMING=1" pebble build   # S7 (gal_log.h): LOGV = righe per chunk/strip/risorsa/bt;
#   LOGH = `heap <fase>` (services, unsub, qv, shake, sync_end); TIMING = `draw: mode=%u full=%d %d ms` per render e `tick: %d ms` per tick.
#   Log di produzione (≤ 80 car.): `sync: end s= c= n= commit photo ch max avg heap`, `sync: msg= f= -> act= out= code= off= st= heap`,
#   `photo: slot %u persist crc ok|MISMATCH %u ch %d ms heap u/f`, `luma(...): m= b= h= ph= w= bad=(w/b) mean= fg= halo=`,
#   `ui_time: cs= bt= loc= WxH unob= lay= font= mode= band=`
python3 ../../tools/build_i18n.py                        # i18n/messages.json (135 chiavi × 6 lingue it, en, de, fr, es, pt; 39.834 B) → src/pkjs/i18n.js (36.500 B)
#   + test/fixture_i18n.js (ASCII, array nell'ORDINE del file); --check dentro pagecheck (PRIMA di quello della pagina) con la TRIPWIRE di lunghezza
#   D70 (liste OPTIONS 28/36 e LABELS 22 sul testo renderizzato, nessuna eccezione); --selftest 32 (anche in `make -C test pyselftest`)
python3 ../../tools/build_config_page.py                 # S6: inlina src/pkjs/config/ → src/pkjs/config_page.js (strip dei commenti; --check = make -C test pagecheck,
#   DA FARE PRIMA DI OGNI pebble build; --html-out per il browser; --selftest 106). S10: passo i18n = `T('chiave'` → `T(n` e `data-i18n="chiave"` →
#   `data-i18n="n"` (indice in messages.json; chiave inesistente = errore) → mai scrivere T('nome') in un COMMENTO a fine riga: il tool lo converte lo stesso
python3 ../../tools/galleria_devserver.py --page-dir src/pkjs/config [--open-ms 2150] [--lang de]
#   S6: config page vera inlinata a ogni GET (v1.9: --open-ms N → hooks.open_ms → HELLO.openMs finto per provare l'avviso #slow; S10/S11: --lang
#   en|it|de|fr|es|pt → hooks.lang = lingua AUTOMATICA finta, l'impostazione `lang` resta una voce di --settings) + modalità relay (/state.json
#   senza `full`); senza --album né --page-dir il server è `full` con 0 foto e SVUOTA l'album; fermarlo con il PID
BROWSER=true pebble emu-app-config --emulator emery & python3 ../../tools/galleria_browser.py open-emu
#   S6: Firefox headless via geckodriver (WebDriver stdlib): open-emu legge l'URL dal file ~/pebble-tool-emu-app-config-*.html; poi set-file/drag/
#   wheel/click/set-value/screenshot/narrow URL 400/--script; foto SOTTO $HOME e FUORI dai dot-dir (~/galleria-gate/photos/); --selftest = make -C test browsertest
python3 store/make_assets.py [--check]                   # S7: icone 144/80/48 + 9 screenshot store da docs/design/galleria/ (s9_emery_a_anton_scura.png e
#   s9_flint_a_anton_chiara.png = `_screenshot_1`, S9-prep; dal 18/09/2026 altri 7: emery 2-6, flint 2-3, sorgenti `SRC_EMERY_2`…`SRC_EMERY_6`,
#   `SRC_FLINT_2`/`_3` in `make_assets.py`; --check verde il 19/09/2026); rigenerare dopo ogni gate che li cambia; nomi <piatt>_screenshot_N.png
#   come vuole `pebble publish --screenshots`
# --- S8: orologio REALE via telefono (runbook docs/design/galleria-s8-runbook-android.md; spec galleria-s8-hardware.md §2.1) ---
pebble ping --phone <IP> [-vvv 2>&1 | grep -i watchversion]   # app Pebble: Settings→Connectivity→"Use LAN developer connection" ON + scheda orologio
#   ⋯→"Dev Connection" ON (porta 9000); `--phone` SENZA IP = CloudPebble!
pebble install build_s8/galleria_p_0.4.0_ux4.pbw --phone <IP> --logs   # .pbw del gate sul telefono (UX-4); .pbw PRIMA delle opzioni (con --adb un percorso
#   dopo il flag = seriale); alternative: --adb (wireless debugging: adb pair/connect, app ≥ 1.10.0) o --cloudpebble (pebble login); il printer parte
#   DOPO l'install: per l'avvio completo `pebble logs` + riavvio (Giù/Su)
timeout -s INT 600 pebble logs --phone <IP> > run_s8_NN.log 2>&1   # SEMPRE -s INT (con SIGTERM il log shipping resta acceso: lo spegne solo il gestore
#   di Ctrl-C); exit 124 normale; poi python3 ../../tools/galleria_logstats.py --md run_s8_NN.log
pebble screenshot --phone <IP> [--no-correction] --no-open shot.png  # ok sull'orologio reale (lento, BLE); MAI emu-*/wipe/kill/insert-pin verso l'orologio
#   reale (non funzionano o sono dell'emulatore)
GALLERIA_DEFINES="GALLERIA_DEBUG_TIMING=1 GALLERIA_DEBUG_HEAP=1" pebble build   # build M di S8 (da rigenerare: build_s8/ non è versionato e in locale tiene
#   solo il .pbw del gate UX-4 con gli ELF in p040/ e i .pbw pubblicati 0.1.0 e 0.2.0): draw …info, tick, heap tick, sync: gap; MAI per la batteria.
#   Perf 04/09: `init: open= man= sto= set= mod= win= syn= tot= ms` (open = apertura del file persist da parte del firmware + chiave 0) e `deinit: mod= fl= win= tot= ms`
python3 ../../tools/gen_test_cards.py --check              # S8: test card (~/galleria-gate/cards/) per soglie luma/LUT: nella config page Sfumature «nessuna»,
#   Luminosita' 1, Schiarisci le ombre 0, Ottimizza OFF, «Riparti da capo» (il pulsante «Adatta» di S8 oggi si chiama cosi': `btn_fit`/`#fit`)
```

## Vincoli specifici
- `package.json`: UUID `6f2dd646-a76a-44ff-8719-b012d04c79a4` **immutabile**; `version` **0.4.0** (UX-4/D126: una sola
  release con es/pt di S11, l'anteprima di S12 e la pagina rifatta di UX-1…UX-3; **la 0.3.0 non è mai stata pubblicata**;
  prima di lei nello store: 0.2.0 «Galleria for Pebble», tag `v0.2.0`, e 0.1.0 beta, tag `v0.1.0-beta`, U7;
  la **0.4.0 è stata pubblicata il 18/09/2026**, tag `v0.4.0`, con `pebble publish` su richiesta dell'utente — il
  titolo «Galleria» è online (messo dall'utente dalla dashboard; verificato il 19/09/2026 sull'API pubblica), mentre
  la **descrizione online è ancora quella della 0.2.0** senza «Beta 0.2.0, » (777 car.): il `PATCH` di
  `store/PUBLISH.md` §0.1 resta da lanciare per la sola descrizione (porta comunque `title=Galleria`, obbligatorio;
  utente, o orchestratore su richiesta)); `author` **"Rediro"** (U2; finisce in `companyName` del `.pbw`); licenza del
  codice **MIT** (`LICENSE` in radice, U1; terze parti in `THIRD-PARTY-NOTICES.md`); `watchface: true`;
  `targetPlatforms ["emery","flint"]`; `capabilities ["configurable","health"]`; `sdkVersion "3"` non toccare.
- Budget: statico ≤ 40 KB emery / ≤ 45 KB flint (**29.080 / 28.968 B** = `arm-none-eabi-size -A` .text+.data+.bss + 256,
  raggiunti in S11, zero C da S12 in poi); risorse ≤ 256 KB; una sola foto in RAM (8Bit full-screen = 45.600 B su
  emery); heap libero a regime ≥ 40 KB emery.
- `MINUTE_UNIT` sempre; **mai secondi**; nessun timer continuo; rotazione foto legata al contatore dei minuti; animazioni: nessuna.
- Ridisegno mirato: al tick solo la fascia dinamica (layout A: fascia dell'ora `[0,106)`; layout B: riga MM + "PM" `[118,228)`
  — S8-stile: strip 100 righe da y 119; R10/U8: durante una sync anche il contatore in basso a sinistra della stessa fascia,
  cancellato dal repaint quando `index` torna 0). **S10 (D32): il contatore non ha più parole** — `prv_draw_sync_icon` (freccia
  circolare: `graphics_draw_arc` da 40 a 335 gradi + punta come `GPath` STATICO con i 3 vertici riscritti da `gpoint_from_polar`,
  nessun `gpath_create`; tratto 2 px su emery, 1 su flint; alone come l'icona BT) + `"k/n"` (`s_sync_buf[8]`) a `SYNC_GAP` 3 px;
  lato icona = altezza del font della riga (A 16, 20 con ExtraLarge; B e flint 12) come sub-bitmap della foto + testo/sprite;
  foto intera solo quando cambia foto, layout o (in B) le ore.
- Moduli C: `main.c`, `ui_time.c`, `ui_photo.c`, `ui_digits.c`, `model.c` (S4: slot corrente, shake, focus, seed di debug),
  `storage.c` (S4: persist), `sync.c` (S5a: trasporto AppMessage), `settings.c` (S8-stile: `font` 0..5 e `digit_style` — byte 12
  del blob, ex `reserved[0]` —, `gal_font_strip()` in `settings.h`; **S10/D31: `lang`** — byte 13, `enum GalLang` 0 auto / 1 en /
  2 it / 3 de / 4 fr / **5 es / 6 pt** (S11/D39, `GAL_LANG_LAST` = `GAL_LANG_PT`), `reserved[4]`, CRC dei default invariato
  `0x7EE7`, `gal_lang_from_locale()` puro in `settings.h`).
  - Logica pura senza `pebble.h`: `timefmt.c`, `luma.c`, `crc.c`, `photo_codec.c`, `rotation.c` (S4), `sync_proto.c` (S5a:
    macchina a stati della sync), **`datefmt.c`** (S10/D34 + S11/D40: data abbreviata con la lingua forzata — tabelle
    `WDAY[6][7][5]` + `MON[6][12][7]` = 714 B, identiche ai language pack, formato per lingua «Sat 5 Sep» / «Sab 5 Set» /
    «Sa, 5. Sep» / «Sam 5 Sept.» / «sá 5 sep» / «Sáb 5 de Set» —, `DATEFMT_MAX_LEN` 14, `datefmt_thousands_sep()` en `,`
    it/de/**es/pt** `.` fr **spazio** (D41: nessuna eccezione); in auto l'orologio resta su `strftime`) e gli header
    `gal_types.h`/`settings.h`; test in `test/` (`storage.c`, `settings.c` e `sync_proto.c` si testano su host con lo shim
    `test/shim/pebble.h`).
  - PKJS (S5b, ES5): `index.js` (eventi Pebble, modalità dev, retry), `album.js` (puro: album in `localStorage`, diff/piano),
    `sync.js` (motore), `devserver.js`, `crc.js`, `b64.js`; niente `atob`/`Uint8Array`/ES6.
- Persist (`docs/design/galleria.md` §4; **schema 2 dal 04/09/2026**): chiave 0 schema, 1 manifest unico da 234 B
  (`GalManifest` = slot + ordine + **impostazioni**; `shake_offset` riservato: l'app non lo legge né lo aggiorna — 0 su file
  nuovo, sul file migrato resta l'ultimo valore della chiave 2 — D19; scritto per ultimo nella sync), `1000 + slot·256 + i`
  chunk da 256 B; le chiavi 2 (rotstate) e 10 (impostazioni) dello schema 1 vengono lette una volta dalla migrazione in
  `storage_init` e mai più scritte né cancellate.
  12 slot; file ≤ ~512 KiB; `persist_get_max_size()` ≥ 1 MiB altrimenti modalità demo.
  - **Perché un solo record (revisione perf 04/09)**: sul PT2 reale il firmware apre il file persist senza page cache e ogni
    ricerca di chiave è una scansione lineare (~0,4 s con 12 foto; 2 scansioni già alla prima chiamata persist, che è
    l'apertura; una a vuoto per ogni chiave assente) → mai leggere chiavi che possono mancare; mai scrivere su persist in
    `deinit` (solo impostazioni pendenti via `storage_flush`); **lo shake vive solo in RAM** (D10 rivista: ogni record in più
    — anche 246 B — è un passo in più in ogni scansione, e il tap service scatta ~100 volte al giorno); `s_schema_ok` alzato
    già in `storage_init`; `settings_apply` identiche → nessuna scrittura; `storage_clear_slot` su uno slot già EMPTY →
    `STORAGE_OK` **senza scrivere**; `storage_set_order` con ordine identico non scrive (F9(4)).
  - Con l'album disabilitato (quota < 1 MiB) il record scritto conserva **slot e ordine letti dal file** (copia `s_backup`)
    mentre la copia in RAM resta azzerata: una quota bassa non deve cancellare l'album.
  - Il file si gonfia con le foto sostituite finché il firmware non compatta (~615 KB fisici): l'orologio misura la **prima
    chiamata persist** (`storage_open_ms` = apertura del file da parte del firmware, 2 scansioni, **più la ricerca della
    chiave 0**, la cui posizione dipende dalla storia del file: dopo i chunk della prima foto su un file nuovo, in coda dopo una
    migrazione 1 → 2 — F04) e la manda nel `HELLO` (`OPEN_MS`, 17ª messageKey, v1.9) → la config page la confronta con una
    soglia **proporzionale alle foto valide** (400 + 100 × n ms, n = slot `state 1` dello snapshot: 0 foto 400, 4 foto 800,
    12 foto 1.600) e mostra la procedura "rimuovi e reinstalla Galleria" (unica cura: la rimozione cancella il file persist,
    l'aggiornamento no). Costo di ogni chiave NUOVA in sync = una scansione (12ª foto ≈ 55 s): riempire l'album è cubico nelle foto.
  - ⚠️ `persist_write_int/data` ritornano i **byte scritti** (4/n) in caso di successo, non `S_SUCCESS`: controllare `< 0`
    (verificato in S4). Le righe `APP_LOG` vengono troncate a ~100 caratteri (prefisso `file:riga` compreso).
- Rotazione (S4, D10): stateless — `rotation_slot(minuti locali, manifest, formato nativo, skip_mask, intervallo, ordine, shake)`;
  ricalcolo nel tick, lettura persist **solo se lo slot cambia**; shake = `accel_tap_service` → offset solo in RAM (mai
  persistito, vale fino al riavvio della watchface); nessun cambio foto fuori focus (`app_focus_service`) né durante una sync
  (`model_sync_hold` da `sync.c`, rilascio a fine sync/timeout), recupero al ritorno; album vuoto/slot illeggibili → demo con
  la stessa rotazione (`GALLERIA_DEMO_INDEX` la fissa).
- Foto: **raw6** (4 px → 3 B, 34.200 B) su emery e **raw1** (1BitPalette MSB-first, 3.024 B) su flint, dithering
  Floyd–Steinberg sul telefono/`tools/photo_prep.py` (il tool è il riferimento byte-esatto per il JS: `pipeline.js`, e ogni
  modifica al tool va replicata in `test_pipeline.js`); un solo `GBitmap` preallocato in `init()` per primo (`ui_photo.c`;
  eccezione documentata alla regola 6 root), riempito a streaming dal `PhotoDecoder` (`photo_codec.h`). Niente PNG sull'orologio
  in v1. Le 2 demo in `resources/photos/` sono **CC0 1.0 da Wikimedia Commons** (S9-prep: *Northern Lights at Lauklines Norway*
  di Sebastian Kowalski e *Bryce Canyon After Snow (Unsplash)* di Emanuel Hahn): usabili anche nello store e negli asset di
  `store/`, rigenerabili byte per byte con i comandi `photo_prep.py` annotati in `resources/photos/README.md` (provenienza, SHA,
  CRC32, `--stats`).
- Colore testo: `ui_time_photo_changed()` a ogni cambio foto (luma a freddo), `ui_time_band_changed()` se cambia solo la fascia
  (isteresi), `ui_time_style_changed()`/`ui_time_layout_changed()` per le impostazioni e **`ui_time_lang_changed()`** (S10/D37:
  chiamata da `sync_env_settings_changed` quando cambia `lang` — ricalcola il separatore delle migliaia, riformatta la data,
  ridisegna la fascia info; log `ui_time: lang= sep=`); mai nel tick; colore, contorno e **stile delle cifre** (`digit_style`)
  diventano palette in `ui_time.c:prv_apply_text_style()` (S8-stile).
- Cifre (S3): sprite `2BitPalette` da `resources/digits/` (generate da `tools/gen_digits.py --fit-width --no-colon-b --pack`
  dai TTF OFL in `resources/fonts/`: rigenerare strip **e** `digit_metrics.h` insieme, mai a mano).
  - S7: la taglia B ha 10 glifi, `ink[DIGITS_GLYPH_COLON] = {0,0}` e `ui_digits` tratta i glifi con `w == 0` come assenti,
    `DIGITS_GLYPHS` resta 11; le strip sono **compatte** (glifi adiacenti, `strip_w` = somma degli inchiostri arrotondata a 4 px;
    S8-stile: A Anton 404×72, B Anton 532×100, B Francois One 596×100 su emery) mentre `cell_w` nell'header resta il **passo
    della griglia del layout** che `ui_time.c:prv_strip_fits` confronta con `a_cell`/`b_cell`; `ui_digits` ritaglia solo con
    `ink[].x/.w` e riconosce la palette dal colore (0xFF riempimento, 0xC0 anello, 0xF0 ombra).
  - **S8-stile (D20–D26)**: 4 indici (0 trasparente, 1 riempimento, 2 anello spesso `ring` = R, 3 ombra 3D `shadow` = S), R/S per
    piattaforma — emery 2/2, flint 1/0 (D26: flint senza ombra, strip a 3 colori, stili 3D = piatti) —, `strip_h = righe + 2R + S`
    (72/100 emery, 44/64 flint), `ring`/`shadow` nelle metriche generate; il layout è espresso come **riga del riempimento**
    (emery A 9, B 13/121; flint A 7, B 13/93) con `strip_y = fill_y − ring`; **passo allargato solo al riempimento** (D25:
    `adv = max(passo, ink.w − 2R − S)`, anello e ombra sporgono nei margini delle celle vicine); indice della strip da
    `gal_font_strip()` (0 Anton, 1 Bebas, 2 Barlow, 3 Francois One, 4 Staatliches; LECO nessuna strip); i 4 **stili**
    (`digit_style`) sono **solo palette** (`ui_digits_set_palette(size, fill, ring, shadow)`), stessa risorsa e stesso blit.
  - **Layout B tiene solo la strip B** (S7, D16: la A viene caricata solo per la durata della Quick View in `prv_refresh_mode`,
    mai in `update_proc`, e scaricata al `did_change` che la chiude; fallimento → LECO); LECO solo in A.
- AppMessage (S5a): **una sola inbox** da 4.153 B (emery: 41 B di intestazioni + 16 di margine + chunk 4.096 = 16 chunk persist
  per messaggio; flint 3.129 B) aperta in `init()` e mai chiusa: `app_message_close()` **non è nell'SDK** (D9 rivista); outbox
  esatta **119 B** da `dict_calc_buffer_size` (v1.9 con `OPEN_MS`: `SYNC_HELLO_VALUE_BYTES` = 69 in `sync_proto.h`) con WARNING
  tripwire se una tupla non entra; chunk rinegoziato a ogni `JS_READY`; `SYNC_REQUEST{COUNT, OFFSET}` (v1.8: "Foto k/n" riprende
  da k dopo un BUSY) e `PHOTO_BEGIN` porta anche `COUNT` = **k** facoltativo (numero d'ordine della foto nella sync, chiave già
  esistente: nessuna messageKey nuova, restano 17; R01: "Foto k/n" arriva a n/n contando le foto saltate, fallback al contatore
  locale se `COUNT` manca o è 0); protocollo in `sync_proto.c` (puro, stati IDLE/SYNCING, testato su host con lo shim) +
  `sync.c` (dizionari, coda outbox, timer 30 s); `HELLO` porta anche `CRC` delle impostazioni e ogni `STATUS` porta `REPLY_TO`
  = il `MSG` a cui risponde (v1.7) e `OPEN_MS` = ms della prima chiamata persist (v1.9, **17 messageKeys**: dopo un cambio
  `pebble clean`). Il timer di silenzio non allocabile abbandona la sync (WARNING) invece di lasciarla in SYNCING con la
  rotazione congelata; `prv_elapsed_ms` mai negativo.
  - Lato telefono (S5b, design §5.1): album in `localStorage` (`galleria.v1.album` + `galleria.v1.p<slot>.<fmt>`; S7/F12:
    `fmts[fmt].stored` dice se il payload è su disco e `plan()`/`summary()`/`state()`/`applyPayload()` non rileggono mai i
    payload; `load()` con payload sparito rimuove i metadati del formato, nessun ciclo di retry; album pre-S7 migrati con una
    sonda una tantum), **diff stateless a ogni `HELLO`** (foto per CRC, impostazioni per CRC + `settingsSet`, `ALBUM_ORDER`
    sempre completo, slot estranei mai eliminati), una foto decodificata per volta, HELLO atteso 10 s dopo il JS_READY
    (2 rinvii), retry lungo per classi (`link` senza tetto, `photo` ≤ 3 consecutivi, `permanent` mai), payload nuovo scritto
    prima di toccare la foto vecchia e rollback se il JSON non si scrive.
  - Config page: pagina `data:` **senza `localStorage`**; in emulatore il dev server `tools/galleria_devserver.py` fa le sue
    veci (`Pebble.platform === 'pypkjs'`; `localStorage` di pypkjs = `dbm.dumb` → `removeItem`+`setItem` dev-only in
    `index.js`: il padding a 64 KiB non reggeva con nomi non ASCII).
- Log (S7, `src/c/gal_log.h`, regola 11): in produzione una riga per fase/evento (heap per fase, init dei moduli, un rigo per
  messaggio di controllo della sync, uno per foto ricevuta/caricata, uno per cambio foto, uno per decisione di colore, tutti gli
  ERROR/WARNING), formati ≤ 80 caratteri; tutto il resto è `LOGV` (solo `GALLERIA_LOG_VERBOSE`)
  o `LOGH` (solo `GALLERIA_DEBUG_HEAP`).
- **Config page** — struttura (id, CSS, sezioni, footer, tessere, ARIA) in `docs/design/galleria-s6-config-page.md`, design §6
  e `docs/design/galleria-s13-ux-casual.md` §13–§14: **non duplicarla qui**; qui solo tripwire e regole che fanno sbagliare.
  - Sorgenti ES5 in `src/pkjs/config/` (niente `localStorage`, niente risorse esterne, nessun backtick: vengono inlinate in
    una stringa); **`config_page.js` generato** da `tools/build_config_page.py` (mai a mano; `make -C test pagecheck` prima di
    `pebble build`). S7: `state.v` obbligatorio = 1, miniatura facoltativa, `title` sui nomi, `scrollIntoView` dell'editor,
    regola dei pulsanti disabilitati che deve VINCERE la cascata (`test_page.js` §4e ha un motore minimo di specificità: un
    pulsante nuovo vuole una voce in `FAM_BTN`).
  - **Peso**: HTML inlinato **85.476 B** (modulo `config_page.js` 88.284 B); **tetto 96 KB = 98.304 B** (D43), **avviso soft**
    oltre **84 KB = 86.016 B** → margine 12.828 B sul tetto, 540 B sotto l'avviso. Leva a costo zero: i commenti a fine riga di
    `page.js`/`page_core.js` su righe proprie (l'inliner toglie le righe di commento intere, NON i commenti in coda al codice:
    38 spostati in UX-3 = −2.250 B); `preview.js` inlinato pesa 12.216 B. Il vincolo che lega davvero è la lunghezza dell'URL
    sul telefono: misurare la pagina a ogni aggiunta.
  - **URL `data:`** (D44): `data:text/html;charset=utf-8;base64,` + `b64.encodeUtf8Std(html)` + `#` + hash base64url (ripiego
    per una WebView che non aprisse la forma base64 = una riga in `index.js`, commento sopra `showConfiguration`). Album vuoto:
    **195.223 caratteri su emery / 171.556 su flint** (36 di prefisso + 113.968 di pagina + 1 + hash 81.218 / 57.551); **con 12
    foto e miniature vere 221.703 / 198.020, caso peggiore con miniature al tetto 292.908 / 269.225** (calcolo con i moduli veri
    in `~/galleria-gate/ux/ux4/mkurl12.js`, archivio locale fuori repo: il dev server non manda miniature e in emulatore il PKJS
    apre sempre il dev server, quindi l'URL si ricava dalla formula di `index.js`). Tetto Android 2 MiB (198–201 k aperti il
    06/09); iPhone aperto con 128–138 k il 06/09, **mai oltre**: gate zero D59 con 12 foto da fare dall'utente (runbook UX-4);
    se non regge, le leve sono l'RLE delle maschere (×2,86, −28 k) o mandare solo il font scelto. Hash =
    `b64.encodeUtf8(JSON(album.state()+{platform,fmt,cap_kb,dev}))` con `lang_auto`, `i18n` (**tutti e sei** i dizionari:
    36.934 caratteri), `masks`, `preview_time`; payload delta `{v:1, settings, order, deleted, photos}` con **un solo formato
    per foto** (quello dell'orologio); lo snapshot dell'HELLO si aggiorna con gli esiti della sync.
  - **i18n** (S10 D35/D36, S11 D39, UX-3 D116): **135 chiavi × 6 lingue** in `i18n/messages.json`, `src/pkjs/i18n.js` 36.500 B
    (cambio lingua istantaneo nella pagina). I sorgenti usano **chiavi** (`T('chiave')`, `T('chiave', a, b)` con `{0}`/`{1}`,
    `data-i18n`/`data-i18n-title` su nodi di testo vuoti) e il passo i18n le sostituisce con l'**indice**: nessun testo e nessun
    nome di chiave nell'artefatto, chiave inesistente = errore. ⚠️ **`T()` vuole la chiave LETTERALE nella chiamata**: il passo
    converte solo `T('nome'` e `data-i18n="nome"`; `T(KEYS[k])` nell'artefatto non viene convertito e `GalI18nKeys` non esiste
    → si vedrebbe il nome della chiave (tenere array di TESTI `[T('a'), T('b')]`); mai `T('nome')` in un commento a fine riga.
    Chiavi solo dev/prova e `err_*` (nel `title` di `#msg`) cablate in inglese (D72, D83);
    lessico unico di S13 §2.2 e §12 («le tue foto», «Foto N» = posizione visibile, «Togli», mai
    slot/album/vetro/watchface), option minuscole (D68); i pin dei test passano da `Tit('chiave')` (U-02: mai testi italiani
    cablati in `test_page.js` salvo i 3 load-bearing); select «Lingua (pagina e data)» = ultima riga visibile in `#misc` (D49);
    glossario S10 §3 con la tripwire `glosscheck` (D132).
  - Aiuti sotto «Stile cifre»: `#s_style_hint` **solo con stile 1 o 2 (a contorno) E font 0–2** (`page.js:230`, D98);
    `#styleFlintHelp` solo su flint con stile trasparente (R13: anello di 1 px).
- **Anteprima della watchface** (S12, D43–D48; zero C): `#wfPrev` con il canvas `#wfPreview` (400×456 emery / 288×336 flint a ×2,
  `image-rendering: pixelated`, mostrato a 200/144 px CSS), ultima voce di «Aspetto dell'ora».
  - ⚠️ 1:1 solo con `#wfPreview { box-sizing: content-box; width: auto; max-width: 100% }` e `cv.style.width = r.width/2`:
    senza `content-box` il `border-box` globale lascia 198 px e l'anteprima non è 1:1 (503 pixel diversi; con la regola giusta
    la riga «12» è identica all'emulatore, 1.541 pixel bianchi, `docs/design/galleria/s12_*.png`).
  - `preview.js` (modulo puro, UMD come `pipeline.js`): foto con i pixel esatti + ora campione **«12:34»**, porting di
    `prv_compute_layout`/`prv_grid_steps`/`prv_place_row_fit`/`prv_layout_time`/`ui_digits_draw`, di `luma.c` (colore automatico
    **a freddo**, senza isteresi) e di `prv_apply_text_style`; **non** mostra riga info, AM/PM, Quick View e ExtraLarge; la
    **griglia è sempre quella a 24 h** (il PKJS non conosce `clock_is_24h_style()`: cambia davvero solo flint + Bebas in A, passo
    26 invece di 28 e riga 116 px invece di 124). Pixel solo delle foto aggiunte in sessione (`G.pixels`/`G.pvSlot`, occhio sulle
    tessere `kind === 'new'`, D47); **LECO**: in A sola foto, in B cifre Anton (`prv_load_strips`: `strip_b = sprite ? strip : 0`);
    qualunque errore degrada a «Anteprima non disponibile» senza rompere la pagina.
  - **Maschere** (D45, `digit_masks.js` 121.107 B, solo il riempimento a 1 bit): nell'hash **solo la piattaforma collegata e solo
    i glifi di `preview_time`** più il solo `w` degli altri digit (`prv_grid_steps` misura la cifra più larga fra le 10: senza le
    larghezze flint Staatliches A sbaglia il passo di 1 px); modulo assente o malformato → `masks: null` e sola foto (un font
    malformato non viaggia come sottoalbero vuoto). Bundle PKJS `build/pebble-js-app.js` **367.747 B** (la crescita rispetto a
    S10 è tutta `digit_masks.js` + la pagina).
  - Test (rieseguiti il 17/09/2026): `test_preview.js` **1.675** (fixture `test/fixture_preview.js` da `gen_preview_fixture.py`,
    30 mutanti uccisi con `mutants_preview.js`), `test_page.js` **2.687 sorgenti / 2.712 inlinato**, `test_index_retry.js` **227**,
    `test_b64.js` **2.729**, `build_config_page.py --selftest` **106**, `gen_digits.py --selftest` **63**,
    `build_i18n.py --selftest` **32**.
- **Regole della pagina che fanno sbagliare** (UX-2 D80–D103, UX-3 D104–D125; il comportamento completo è in S13 §13–§14):
  - `applyRules` DEVE girare dopo `applyLang`: `optTexts()` riscrive le option e cancella il suffisso `opt_style_no_flint`
    (su flint stili 2/3 e colori 3/4 = `disabled` **+ `hidden`** con rimappaggio `UNAVAIL`/`applyUnavailable`, D86).
  - `updatePhotosCap()` da `renderTiles`/`settingsChanged`, mai da `applyLang` (all'avvio le select sono vuote).
  - Bordo di contrasto **mai disabilitato** (D62); `#infoRow` nascosta in «Ora grande» con i bit conservati;
    `initToggle(btnId, bodyId, scroll)` ritorna `setOpen` (usata anche da `#helpBtn`).
  - CSS: `.btn` è `inline-flex` e in un flex container lo spazio fra due `<span>` sparisce → serve `gap: 6px` (senza, la
    freccia ▾ si incolla al testo); `#fontPrev, #fontNext { font-size: 22px; line-height: 1 }` (altrimenti 44,4 px);
    `.btn.danger` e `.tbtns button.arm` scritte PRIMA della regola dei disabilitati (stessa specificità: vince l'ordine);
    `.tbtns` 88 px con **`flex-shrink: 0`** (senza, la colonna si restringe a 54/44 px); `#zoomRow .rlab` senza `min-width`
    («Riparti da capo» resta sulla riga dello slider).
  - Footer: con l'editor aperto `#save`/`#cancel` restano ATTIVI e dicono «Usa questa foto / Non aggiungere» (`save()` →
    `addOk()`, `cancel()` → `cancelCrop()`); «Esci comunque» rosso al primo tocco (`cancelArmed`, nessun timer, D66);
    `data-i18n` tolti dai due pulsanti (i testi li scrive `footerLabels`, anche al cambio lingua); i flag
    `msgIsCap`/`msgIsArm`/`msgIsUnsaved` dicono «a schermo c'è QUEL messaggio» e `setMsg` li azzera in testa: il disarmo di
    `updateKb` svuota `#msg` solo se contiene ancora il suo.
  - Tessere: ✕ a due tocchi (`G.armDel`; **disarmo = qualunque altra azione, perché tutte passano da `updateKb`**); `.name` su
    due righe con uno ZWSP U+200B prima dell'estensione nel SOLO testo visibile (`title`, `aria-label` e messaggi puliti);
    in «Aggiungi foto» durante il caricamento **`#file` NON è disabilitato** (il test 3f sceglie due file di fila).
  - Editor: UN solo `renderPreview()` (canvas scelto da `G.editorOpen && ed.last`; con `ed.last` nullo esce senza disegnare);
    `#preview` 200/144 px CSS `content-box` come `#wfPreview`; `#crop` è `content-box` con bordo 1 px e `getBoundingClientRect`
    è il border box → `pos()` toglie 1 px e divide per `r.width − 2` (G16: il solo CSS NON rendeva `pos()` esatta, 31 px di
    dito valevano 30,79; pin sull'asse y e tripwire `border-width`/`padding` in `test_page.js`, D135).
  - **Gate ripetibile** (script nell'archivio locale `~/galleria-gate/ux/ux2`, `ux3`, `ux4`, fuori repo): `node mkstate_ux*.js` →
    `python3 shots.py` (stati + flussi a 400 e 360 px, dev server `--page-dir` su 8765) → `scan_px.py` (scroll orizzontale) +
    `scan_words.py` + `prevshot*.py`/`cmp_preview.py` (canvas 1:1 contro `s12_emery_b_francois_t3d_dark.png`) + `canvas_eq.py`
    (`toDataURL` di `#preview` == `#wfPreview` dopo «Usa questa foto»). ⚠️ Insidie: **gli hash di stato vanno rigenerati DOPO
    ogni fusione del dizionario** (hash a 132 chiavi contro la pagina a 135 = OGNI etichetta scambiata: sembrava la pagina
    rotta, era il gate); lo screenshot di un elemento a **offset frazionario** (es. `#wfPreview` a y = 671,6 px) NON è
    confrontabile al pixel (mezzo pixel di ricampionamento): identità dei canvas con `toDataURL`, confronto con l'emulatore
    nascondendo il footer fisso (copre la parte bassa del canvas) e con `block: 'start'`; `ps | grep` + `kill` (come `pkill -f`)
    in una Bash il cui testo contiene il nome del processo **uccide la shell stessa**; con 2 foto del gate (47 KB l'una) il
    tetto di 150 KB non scatta (94 + 52 ≤ 150): lo stato del tetto vicino è `cap_kb: 140`; `HTML.length` in node conta
    caratteri UTF-16, i byte della pagina sono `wc -c` dell'HTML (85.476 vs 85.448); i **rapporti R3–R5** in
    `~/galleria-gate/ux/ux4/rapporti/` (archivio locale) hanno numeri di riga scritti prima di G16: dopo `pos()` (~703)
    `page.js` ha 2 righe in più e `test_page.js` 15 sparse → `grep -n` prima di copiarli in un documento; la dedup dei
    workflow per `file:riga/5` fonde finding su righe adiacenti. Misure: pagina
    it con 3 foto a 400 px ≈ 1.895 px (1.959 a fine UX-2; il «≤ 1.500» del piano era una stima sbagliata, D100), editor aperto
    +520 px; `G.timing` resample 1–4 ms + encode 1–7 + render 0–4 su Firefox desktop.
- **Stato (UX-4 14/09 + lettura pre-gate 17/09/2026; S13 §15, D126–D135)**: nella pagina solo G16 e `.chk { gap: 4px }` (+30 B),
  zero C. Il **gate sul telefono** è da fare dall'utente con il runbook `docs/design/galleria-s13-ux4-gate-telefono.md` (518
  righe, P01–P20; D134: un orologio e due telefoni, prima dell'iPhone svuotare l'album dall'Android; P09: le impostazioni
  applicate senza riavvio si leggono da `sync: msg=10 … code=0` e `luma(band|style)`, perché `settings: persist` è scritta solo
  in `settings_init`) con **`build_s8/galleria_p_0.4.0_ux4.pbw`** (ELF in `build_s8/p040/`; il `.pbw` **non è riproducibile al
  byte**: `manifest.json` porta un timestamp); log `run_s13_ux4_<and|ios>_<NN>.log`, screenshot `docs/design/galleria/s13_ux4_*.png`,
  mai foto personali nel repo; se l'iPhone non apre 12 foto → bisezione P15-bis e sessione RLE delle maschere a parte. Store:
  **0.4.0 pubblicata il 18/09/2026** su richiesta dell'utente **senza il gate P01–P20** (provata prima sul PT2 reale via
  Android: install + screenshot ok; `store/release_notes_0.4.0.txt`, `LISTING.md` §3.0/§6, `PUBLISH.md` in testa; le note
  della 0.3.0 mai uscita vivono solo in `LISTING.md` §3.1; screenshot dello store invariati alla release, D131); poi, la
  notte del 18/09, **7 screenshot extra** in `store/` (`make_assets.py` ne produce ora 9: 6 emery + 3 flint; online al
  19/09 5 emery + 3 flint, `emery_screenshot_6` no; lo store ri-codifica tutti i PNG in palette: flint pixel-identici,
  emery quasi; `emery_screenshot_6` è anche l'unico con foto CC-BY-SA-4.0, S8-stile: decisione dell'utente); titolo
  «Galleria» online al 19/09 (dashboard), **resta il `PATCH` della descrizione** (`PUBLISH.md` §0.1). **Regola dal
  18/09/2026: le release notes dello store si scrivono SOLO IN INGLESE** (niente righe per lingua; `LISTING.md` §3).
- **Screenshot nel repo** (politica dal 17/09/2026): `docs/design/galleria/` tiene **un set per gate** e ogni PNG è citato per
  nome in un `.md` (`docs/design/galleria/README.md` per le licenze delle immagini); le varianti di lingua/larghezza restano
  nell'archivio locale fuori repo (le serie `s13_ux1_*`/`s13_ux2_*` non sono versionate); `apps/*/*.png`, `*.pbw`, `build_s8/`
  e `.claude/settings.local.json` (pin del modello) sono in `.gitignore`.
- **Log del PKJS solo ASCII** (F-S8-2): l'app Core Devices inoltra le righe `log()` al tool contando i caratteri ma mandando i
  byte UTF-8 → un byte perso per ogni accento e, con un accento in fondo alla riga, `pebble logs` muore (`UnicodeDecodeError` in
  libpebble2). Scrivere `si'`, `gia'`, `piu'`, `e'`, `-` nei messaggi di `index.js`/`album.js`/`sync.js` (i commenti possono
  avere accenti). **I dizionari di `i18n/messages.json` non passano MAI per `log()`** — viaggiano solo nell'hash dell'URL della
  config page; di lingua si logga il solo codice a due lettere (`[config] lang auto=it (watch it_IT)`).
- Mai dichiarare una sessione finita senza build verde emery+flint, screenshot controllati e `PIANO.md`/`CONTINUA-QUI.md` aggiornati.

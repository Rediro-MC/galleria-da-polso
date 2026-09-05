# CLAUDE.md — progetto Pebble (ProgettiClaude/Pebble)

Piccole app in **C** per **Pebble Time 2** (`emery`, 200×228, 64 colori, touch) e **Pebble 2 Duo** (`flint`, 144×168 B/N). Obiettivi: performanti, sfruttare il display PT2, offline-first, poca memoria.

## A inizio sessione
1. Leggere `docs/CONTINUA-QUI.md` (stato lavori) e, se serve, `PIANO-SVILUPPO-PEBBLE.md` (§1 decisioni, §3 numeri, §7–§10 regole, §17 istruzioni). Dettagli in `docs/ricerca/*.md`.
2. `pebble --version && pebble sdk list` (atteso: Pebble Tool v5.0.40, SDK 4.33.1 attivo; 4.17 installato per la prova D5). Se manca: `tools/setup-env.sh`. Repo GitHub: vedi `README.md` radice (clonare in `~/ProgettiClaude/Pebble`).
3. L'ambiente viene da `tools/pebble-env.sh` (caricato da `~/.bashrc`): `PATH` con `~/.local/bin` e `PEBBLE_QEMU_PATH` → `tools/qemu-pebble-wrapper` (aggiunge le librerie SDL2/Xss/sndio estratte in `~/.local/lib/pebble-deps`). Nelle Bash non interattive: `. ~/ProgettiClaude/Pebble/tools/pebble-env.sh`.

## Comandi
```bash
cd apps/<app>
pebble build                                   # leggere "EMERY/FLINT APP MEMORY USAGE"
pebble install --emulator emery [--logs]       # emulatore fresco → l'app parte; già avviato: una watchface viene rilanciata, una watchapp resta nel launcher:
pebble emu-button click select --emulator emery   #   ...premere Select per lanciare la watchapp (su una watchface in esecuzione apre il launcher!)
pebble emu-steps 6532 --emulator emery ; pebble emu-set-time 09:07:00 --emulator emery   # passi Health; ora (pypkjs la risincronizza dopo pochi s: screenshot subito)
timeout 60 pebble install --emulator emery --logs > run.log 2>&1   # catturare APP_LOG senza bloccare la shell
pebble screenshot --emulator emery --no-open shot_emery.png       # colori "sunlight-corrected" (come sul vetro)
pebble install --emulator flint && pebble screenshot --emulator flint --no-open shot_flint.png
pebble emu-set-timeline-quick-view on|off --emulator emery ; pebble emu-set-content-size large|x-large --emulator emery
pebble emu-bt-connection --connected no --emulator emery ; pebble wipe ; pebble emu-battery --percent 10
pebble kill                                    # chiude tutti gli emulatori
pebble build --debug && pebble gdb             # crash (solo emulatore)
~/.local/share/pebble-sdk/SDKs/4.33.1/toolchain/arm-none-eabi/bin/arm-none-eabi-size -A build/emery/pebble-app.elf   # .text/.data/.bss (pebble analyze-size è rotto con sh 2.4.0: stampa 0)
~/.local/share/pebble-sdk/SDKs/4.33.1/toolchain/arm-none-eabi/bin/arm-none-eabi-nm -S --size-sort -td build/emery/pebble-app.elf | tail -30   # simboli più grandi
```
Emulatore che non lancia l'app o mostra un'app di test residua ("… is not responding"): `pebble kill && pebble wipe`. `emu-bt-connection` **non** consegna l'evento a `connection_service` (verificato 26/08/2026): l'icona BT si prova con un hook di debug; usato a metà di una sync AppMessage lascia l'emulatore irraggiungibile dal tool (S5b). `pebble wipe` cancella anche il `localStorage` di pypkjs (`~/.local/share/pebble-sdk/4.33.1/<piatt>/localstorage/`, un `dbm.dumb` che si chiude pulito solo a `pebble install`, non a `pebble kill`). `pebble emu-app-config` con `BROWSER=true` non apre finestre: si risponde con `curl "localhost:<porta>/close?<payload>"` (porta da `ss -ltnp`; Firefox snap perde la query di `--file`). Senza display X: aggiungere `--vnc` a ogni comando che usa l'emulatore. Touch in emulatore: click/drag del mouse nella finestra QEMU (nessun `emu-touch`). Dopo `emu-tap` o `emu-set-timeline-quick-view` pypkjs può stampare `[PHONESIM] [WARNING] Exception decoding QemuInboundPacket.footer`: rumore innocuo (verificato 30/08/2026). `pebble sdk install <ver>` **attiva** da solo l'SDK installato: riattivare 4.33.1 subito dopo.
Orologio reale: app Pebble → Devices → ⋯ → Enable Dev Connect; `pebble login`; `pebble install --cloudpebble --logs` (serve il telefono: da Linux non c'è BLE).
Mai dichiarare "fatto" senza build verde su emery+flint e screenshot controllato.

## Vincoli di progetto
- `package.json`: `"targetPlatforms": ["emery", "flint"]`, `"sdkVersion": "3"` (generato, non toccare), UUID minuscolo immutabile, `version` `major.minor.0`, `capabilities` coerenti.
- SDK 4.33.1 → le app richiedono firmware ≥ 4.32 (recognizer touch ≥ 4.33.2). Decidere per app se basta SDK 4.17 (fw ≥ 4.17).
- Budget: footprint statico ≤ 40 KB su emery (tetto hard 65.535 B), ≤ 45 KB su flint; risorse ≤ 256 KB; heap ≈ 131.072 − statico (emery) / 65.536 − statico (flint) — misurato in Fase 0 (`docs/CONTINUA-QUI.md`).
- Moduli C per responsabilità (`main.c`, `ui_*.c`, `model.c`, `storage.c`, `sync.c`, `settings.c`); logica pura in file senza `pebble.h` (testabile con gcc host).
- Risorse: tag descrittivi (`bg~color~rect~200w.png`, `bg~bw.png`), `targetPlatforms` per risorsa, `memoryFormat` palettizzato + `"spaceOptimization": "memory"`, font con `characterRegex`.

## Regole di codice C (sempre)
1. Feature flag (`PBL_COLOR`, `PBL_TOUCH`, `PBL_RGB_BACKLIGHT`, `PBL_API_EXISTS()`), mai nomi piattaforma; layout da `layer_get_unobstructed_bounds()` + `unobstructed_area_service_subscribe()`; costanti di sistema; `preferred_content_size()` una volta.
2. `tick_timer_service_subscribe(MINUTE_UNIT, …)`; un solo `layer_mark_dirty()` per tick; `window_set_background_color(w, GColorClear)` + repaint mirato; dinamico in una fascia verticale; animazioni solo su evento, ≤ 500 ms, e solo se `light_is_on()`.
3. Ogni `*_create()` ha il suo `*_destroy()` in `window_unload` (poi `NULL`); controllare i `NULL`; allocare in `window_load`, mai in `update_proc`.
4. Zero `float`/`double`: `sin_lookup`/`cos_lookup`/`atan2_lookup`, `DEG_TO_TRIGANGLE`, fixed-point; niente `%f`, `sqrt`, `qsort`, `strtol`, `alloca`.
5. Buffer `static` file-scope; nessun array > ~200 B sullo stack (4 KiB emery, 2 KiB flint); stringhe per `text_layer_set_text` mai locali; `snprintf` con `sizeof`.
6. Bitmap palettizzate, PDC per icone, mai `RotBitmapLayer`, `GCompOpSet` per trasparenza; mai bitmap full-screen 8-bit (45.600 B) salvo eccezione documentata (Galleria: una sola foto preallocata in `init()`, vedi `apps/galleria/CLAUDE.md`).
7. AppMessage: buffer da `dict_calc_buffer_size()` (mai `*_size_maximum()`); callback prima di `open`; **una sola `app_message_open()` per esecuzione: `app_message_close()` NON esiste nell'SDK 4.33.1** (né in `pebble.h` né in `libpebble.a`; verificato 29/08/2026) e un secondo `open` dà `APP_MSG_INVALID_STATE` → dimensionare l'inbox una volta per il messaggio più grande; handshake `JSReady`; mai retry su `APP_MSG_NOT_CONNECTED`; backoff con jitter; `SNIFF_INTERVAL_NORMAL`. Il JS manda ogni `Number` come **int32** (4 B): leggere le tuple in base a `length`.
8. Persist: `persist_exists()` prima di leggere; schema versionato + CRC; chunk poi lunghezza; scritture con debounce (≤ 1/min), flush in `deinit`; `persist_get_max_size()` con fallback 4096; ≤ 75% della quota; gestire `E_OUT_OF_STORAGE`.
9. Wakeup con retry su `E_RANGE` (+150 s × 6); niente worker se bastano wakeup + persist; AppGlance in `deinit` (solo watchapp).
10. Touch solo watchapp: `#if defined(PBL_TOUCH)`, `touch_service_is_enabled()`, recognizer con `watch_info_get_firmware_version()` ≥ 4.33.2 (o raw `touch_service_subscribe()`), unsubscribe in `disappear`, fallback pulsanti.
11. Un `APP_LOG` di memoria per fase (`heap_bytes_used/free`); nessun log nei loop caldi; timing con `time_ms()` una volta al minuto.
12. Testo: `GSize` del testo memorizzata (non ricalcolare `graphics_text_layout_get_content_size()` a ogni frame); antialias off per grafica ortogonale. (⚠️ `text_layer_set_should_cache_layout()` **non esiste** nell'SDK 4.33.1: verificato 26/08/2026.)
13. `ScrollLayer`/`MenuLayer` solo per puntatore; mai `realloc()` su blocchi ≥ 64 KiB; blocchi grandi allocati una volta in `init()`, dal più grande.
14. HRM: azzerare `health_service_set_heart_rate_sample_period(0)` in `deinit`; accelerometro 10 Hz + batch; mai `psleep()`, mai `light_enable(true)` prolungato.

## Regole operative
- Mai `git commit`/push/PR senza conferma esplicita dell'utente. Niente sudo; niente installazioni fuori da `$HOME`.
- **Modelli per grado di importanza (regola permanente, richiesta dall'utente il 27/08/2026; a 4 livelli dal 05/09/2026):** ogni sessione/lavoro va diviso in compiti classificati **alta / medio-alta / medio-bassa / bassa** importanza; i compiti di importanza **alta e medio-alta** (codice C sull'orologio, protocollo, integrazione, decisioni di design, lenti e scettici sul C, test-writer del C, revisioni adversariali) restano a **Fable** (orchestratore o subagenti senza override di modello); quelli di importanza **medio-bassa e bassa** (PKJS, config page, strumenti Python, dedup, scettici sui finding bassi, documenti, README) vanno ad agenti/workflow con modello **Opus**. Annotare la classificazione nel `PIANO.md` dell'app (esito della sessione).
- A fine sessione aggiornare `docs/CONTINUA-QUI.md` (e `docs/design/<app>.md` quando cambiano scelte).

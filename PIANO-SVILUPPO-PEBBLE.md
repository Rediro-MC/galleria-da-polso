# Piano di sviluppo — piccole app per Pebble Time 2 (e Pebble 2 Duo)

> **Stato:** v1.2 — redatto il 24 agosto 2026 a valle di una ricerca multi-agente (8 report, 3 verificatori adversariali, 3 approfondimenti); **Fase 0 (setup) completata** lo stesso giorno — vedi §18 e `docs/CONTINUA-QUI.md`.
> **Per chi:** l'utente (Marco) e Claude. Va letto a inizio di ogni sessione di lavoro sul progetto.
> **Obiettivi dichiarati:** (1) app **performanti**, (2) che **sfruttano al meglio il display del Pebble Time 2**, (3) che **funzionano bene senza connessione continua al telefono**, (4) che **consumano poca memoria**.
> **Ambiente:** Ubuntu 26.04 x86_64, **senza sudo**, Python 3.14 di sistema (senza pip/ensurepip), Node 22, gcc 15, niente Docker/QEMU/arm-gcc di sistema. 8 core, 5,3 GB RAM, 99 GB liberi su `/home`.
>
> Report di dettaglio (≈550 KB, con URL e date): [`docs/ricerca/`](docs/ricerca/) — `platform.md`, `toolchain.md`, `memory.md`, `display.md`, `offline.md`, `perf-battery.md`, `community-examples.md`, `publishing-compat.md`; verifica adversariale in `verifica.md` / `verifica-risultati.json`; approfondimenti `gap-1-memoria-emery.md` (modello RAM + app sonda), `gap-2-firmware-minimo.md` (compatibilità SDK/firmware), `gap-3-emulatore-touch.md` (cosa emula QEMU, touch via mouse/QMP). Questo piano è la sintesi operativa; i report sono la fonte quando serve il dettaglio. **Dove i report si contraddicono, vince il sorgente firmware** (le correzioni applicate sono elencate in §18).
>
> **Legenda confidenza:** ✅ = verificato su fonte primaria (docs/sorgente firmware/test locale) · ⚠️ = inferenza ragionata o fonte secondaria · ❓ = da verificare sul campo.

---

## 0. Come usare questo documento

- **Per l'utente:** la §1 riassume le 12 decisioni prese; la §5 è il setup passo-passo; la §11 è il workflow per ogni nuova app; la §14 è la roadmap.
- **Per Claude:** leggere §1, §3 (numeri), §7–§10 (regole), §17 (istruzioni operative). Le regole di codice in §17.3 vanno applicate a ogni riga di C scritta. Quando serve un dettaglio, aprire il report corrispondente in `docs/ricerca/` invece di cercare sul web (i report sono datati 24/08/2026: per novità successive consultare i changelog SDK, vedi §16).
- **Aggiornare il documento** quando una decisione cambia o un ❓ viene risolto; annotare data e motivo nella §18 (changelog del piano).

---

## 1. Sintesi decisionale (le 12 decisioni chiave)

| # | Decisione | Motivo (dettagli nelle sezioni indicate) |
|---|---|---|
| 1 | **Linguaggio: C nativo** (Pebble C SDK). Niente Alloy/JS per le app "vere"; niente Rocky.js (rimosso dal firmware). | Footprint minimo, controllo totale, unico linguaggio che gira anche su Pebble 2 Duo. Alloy solo per eventuali prototipi grafici rapidi su emery. §4 |
| 2 | **Target primario `emery`** (Pebble Time 2), secondario **`flint`** (Pebble 2 Duo — **non** `diorite`), opzionale `gabbro` (Round 2). In `package.json`: `"targetPlatforms": ["emery", "flint"]` (+ `"gabbro"` quando si gestisce il round). | Solo la build nativa emery ottiene 200×228, 128 KiB di RAM e le API touch/RGB/speaker. §2.3, §7.6 |
| 3 | **Progettare a 200×228 per primo**, poi degradare a 144×168 B/N. Layout derivato da `layer_get_unobstructed_bounds()`, mai coordinate hardcoded. | Un'app "portata" da 144×168 e scalata è visibilmente peggiore. §7 |
| 4 | **Dark mode di default** (sfondo nero, testo chiaro), max 3–4 colori oltre bianco/nero, scelti dalla tabella "resa reale" (§7.2). | Il pannello MiP ha contrasto ~20:1: i colori saturi su bianco collassano. §7.2 |
| 5 | **`MINUTE_UNIT` sempre** nelle watchface; nessuna animazione continua; animare solo su evento e solo se `light_is_on()`. | Backlight, watchface animate e health sono i 3 maggiori consumatori dichiarati da Core Devices. §9 |
| 6 | **Offline-first come architettura**: il telefono è un *sync worker opportunistico*, mai una dipendenza. Render sempre dalla cache locale (`persist`, fino a 1 MiB/app), 4 stati UI, backoff con jitter, nessun retry se disconnesso. | §10 |
| 7 | **Budget di memoria vincolanti**: footprint statico < 60 KiB (tetto hard 65.535 B), risorse < 256 KB per piattaforma (limite appstore), bitmap sempre palettizzate + `spaceOptimization: "memory"`, AppMessage dimensionato al minimo. | §8 |
| 8 | **Zero floating point**, fixed-point + `sin_lookup`/`cos_lookup`; buffer `static`, mai array grandi sullo stack (4 KiB su emery, 2 KiB su flint). | Le app sono compilate Cortex-M3 soft-float senza libm. §8.5 |
| 9 | **Touch solo nelle watchapp** (mai nelle watchface, non supportato), con fallback ai pulsanti; `app_touch_navigation_enable(true)` per menu/liste. | §7.8 |
| 10 | **Setup in user space con `uv`** (Python 3.13 gestito da uv) + `pebble sdk install latest`; librerie QEMU estratte dai `.deb` in `~/.local` (procedura verificata localmente). Piano B: CloudPebble / `pebble install --cloudpebble` sull'orologio reale. | §5 |
| 11 | **Un repo monoprogetto** `ProgettiClaude/Pebble/` con `apps/<nome>/` per ogni app, `docs/`, `tools/`, CI GitHub Actions che produce i `.pbw`. | §6 |
| 12 | **Pubblicare su entrambi gli store** (Core via `pebble publish --is-published`, Rebble via dev-portal), nome app `"<Nome> for Pebble"`, UUID minuscolo e immutabile, versione `major.minor.0`. | §13 |

---

## 2. Contesto piattaforma (agosto 2026)

### 2.1 Lineup Core Devices ✅

| Prodotto | Piattaforma SDK | Board fw | Prezzo | Stato (24/08/2026) |
|---|---|---|---|---|
| **Pebble Time 2** (ex Core Time 2) | **`emery`** | `obelix` | $225 | In stock, spedizione 1–2 gg; >25.000 vendute |
| **Pebble 2 Duo** (ex Core 2 Duo) | **`flint`** | `asterix` | $149 | Spedito 2025 (~6.000), oggi **sold out** |
| Pebble Round 2 | `gabbro` | `getafix` | $199 | In produzione da fine luglio; preordini entro fine settembre |
| Index 01 (anello) | — | — | $75 | Non esegue app |

Attenzione all'omonimia: `emery` era il nome della piattaforma del Pebble Time 2 **del 2016** (mai spedito). Il nuovo PT2 riusa nome e risoluzione ma è hardware completamente diverso; molte pagine web del 2016 sono ancora valide per l'SDK, **non** per compatibilità/hardware.

### 2.2 Hardware Pebble Time 2 ✅ (fonti: hardware matrix ufficiale, board Zephyr `pt2`, sorgente PebbleOS)

| Voce | Pebble Time 2 (`emery`) | Pebble 2 Duo (`flint`) |
|---|---|---|
| Display | JDI LPM015M135A **MiP riflettivo a colori** (non E Ink: niente ghosting, full-frame < 20 ms, 30 Hz), 1.5", **200×228**, **64 colori** (RGB222), 202 PPI, vetro piatto | Sharp LS013B7DH05, 1.26", 144×168, **B/N**, 175 PPI |
| Touch | **Sì** (CST816D) — API per watchapp, **non per watchface** | No |
| Pulsanti | 4 (Back/Up/Select/Down) | 4 |
| Backlight | **RGB** (unica piattaforma con `PBL_RGB_BACKLIGHT`) | bianco |
| SoC | **SiFli SF32LB52J**: Cortex-M33-like "Star-MC1" **240 MHz** + core BLE 24 MHz, **512 KiB SRAM**, 32 MB flash QSPI, BLE (⚠️ "5.3" è dichiarato solo dal brief SiFli, non da Core; PSRAM 16 MB presente ma **non abilitata**) | Nordic nRF52840: Cortex-M4F 64 MHz, 256 KiB SRAM |
| Corpo | 43,00 × 36,04 × 10,90 mm, 33 g senza cinturino (scheda ufficiale repebble.com/watch) | policarbonato |
| Sensori | IMU 6 assi (LSM6DSOW) + accel low-power, bussola, **HRM GH3026 con SpO2/HRV**, sensore luce sotto il display, 2 mic PDM (2° non attivo), speaker, LRA. **Nessun barometro.** | IMU 6 assi, bussola, **barometro**, mic, speaker, LRA. Nessun HRM |
| Batteria | dichiarata ~30 gg; **mediana reale ~21 gg** (luglio 2026) | ~30 gg (reale >30) |
| Acqua | 30 m / 3 ATM | 20 m |
| Limite app | **128 KiB code+heap**, 256 KB risorse | 64 KiB, 256 KB |

Problemi noti (blog 14/07/2026): alcune unità con consumo anomalo (difetto hw, sostituite), touch che a volte non registra (sospetto software), passi/sonno imprecisi per alcuni.

### 2.3 Mappa piattaforme SDK ✅

| Piattaforma | Orologio | Display | Colori | RAM app | Note |
|---|---|---|---|---|---|
| `aplite` | Pebble/Steel (2013) | 144×168 | B/N | 24 KiB | congelata; **da omettere** |
| `basalt` | Pebble Time/Steel | 144×168 | 64 | 64 KiB | congelata |
| `chalk` | Pebble Time Round | 180×180 | 64 | 64 KiB | congelata, rotonda |
| `diorite` | Pebble 2 (2016) | 144×168 | B/N | 64 KiB | congelata |
| **`flint`** | **Pebble 2 Duo** | 144×168 | B/N | 64 KiB | viva; `PBL_SPEAKER` |
| **`emery`** | **Pebble Time 2** | **200×228** | 64 | **128 KiB** | viva; `PBL_TOUCH`, `PBL_SPEAKER`, `PBL_RGB_BACKLIGHT` |
| `gabbro` | Pebble Round 2 | 260×260 | 64 | 128 KiB | viva, rotonda; `PBL_TOUCH` |

Le piattaforme "vive" (`emery`, `flint`, `gabbro`) ricevono nuove API; le altre sono `PBL_SDK_FROZEN`.

### 2.4 Firmware, SDK, tool ✅

- **PebbleOS** è open source (Apache-2.0) su `github.com/coredevices/PebbleOS`; driver proprietari (touch, HRM, HAL SiFli) in `pebbleos-nonfree`. Ultima release **v4.36.0 (24/08/2026)** (v4.35.0 era del 19/08: **un minor ogni pochi giorni**, i numeri di firmware in questo piano invecchiano in giorni); dal 2/6/2026 lo schema è `4.MINOR.PATCH`. Le release GitHub **non hanno note**: le novità per sviluppatori stanno nei **changelog SDK** (`developer.repebble.com/sdk/changelogs/` — esistono solo 4.17, 4.33, 4.33.1; 4.18–4.32 sono 404).
- **SDK corrente: 4.33.1 (14/08/2026)** = `pebble sdk install latest`. SDK scaricabili: 4.4, 4.5, 4.9.127, 4.9.148, 4.9.169, 4.17, 4.33.1. L'SDK segue la numerazione del firmware.
- **Firmware minimo = scelta dell'SDK** ✅ (gap-2): un `.pbw` compilato con SDK 4.33.1 è marcato `sdk_version 5.106` e **gira solo su PebbleOS ≥ 4.32.0**; con SDK 4.17 basta fw ≥ 4.17.0. Il minimo **non è dichiarabile** in `package.json` e né lo store né l'app mobile filtrano: è l'orologio che rifiuta l'app con il popup *"Incompatible SDK / This app requires a newer version of the Pebble firmware"* (nessun crash, nessun no-op). `PBL_API_EXISTS()` è **solo compile-time**: la rilevazione runtime delle API è impossibile e inutile. Regola: per app che non usano recognizer/HRV/`alarm_service_peek_next()` si può compilare con **SDK 4.17** (base installata più ampia); altrimenti 4.33.1 e chiedere di aggiornare l'orologio. ⚠️ Possibile linea di firmware "di fabbrica" 4.27.1: unità nuove potrebbero rifiutare app 4.33.1 finché non aggiornate.
- **pebble-tool 5.0.39** (30/06/2026, PyPI, Python ≥ 3.10). Toolchain ARM (xPack GCC 14.2.1), QEMU (`qemu-pebble` 10.1.5) e Moddable vengono scaricati da `pebble sdk install` in `~/.local/share/pebble-sdk/` (~770 MB).
- Novità API 2026 rilevanti: Touch raw (4.9.169, stabile da fw 4.9.164) + gesture recognizer e touch navigation (4.33; crash risolto in fw 4.33.2), Speaker (4.9.169), backlight RGB (4.9.169), persist a 1 MiB (fw ≥ 4.9.171, 30/04/2026; prima erano 6 KiB) e `persist_get_max_size()` (fw ≥ 4.9.172, SDK 4.17), `backlight_service_subscribe()`/`light_is_on()` (4.17), `app_launch_button()` / `app_launch_get_quick_launch_action()` (4.17), HRV (4.33), `alarm_service_peek_next()` (4.33), binario emery a 128 KiB (4.33), libc → picolibc (4.33), `pebble build --debug` (4.17), `pebble publish` (beta da pebble-tool 5.0.28, feb 2026; login Google/GitHub/Apple), CloudPebble tornato (feb 2026).
- **App mobile "Pebble"** di Core Devices (Android `coredevices.coreapp`, iOS "Pebble Core"), open source (KMP). Supporta developer connection LAN e **cloud relay** (`pebble install --cloudpebble`). Su iOS PebbleKit JS gira in JavaScriptCore "nudo": **niente `fetch`/DOM**, usare `XMLHttpRequest`.
- **App store**: due feed paralleli — Core (`apps.repebble.com`, backend `appstore-api.repebble.com`, CLI `pebble publish`) e Rebble (`apps.rebble.io`, `dev-portal.rebble.io`). La sincronizzazione Rebble→Core annunciata a ottobre 2025 **non è più affidabile** (⚠️ thread forum giugno 2026) → pubblicare su entrambi. Nessuna review preventiva, nessuna app a pagamento.

---

## 3. Numeri da tenere a mente (cheat sheet emery / flint)

```
                              emery (Pebble Time 2)     flint (Pebble 2 Duo)
Segmento RAM app              135.168 B (132 KiB)       67.584 B (66 KiB)
  stack (incluso)               4.096 B                   2.048 B
  budget code+data+bss+heap   131.072 B (128 KiB)       65.536 B (64 KiB)
  di cui statico (.text+.data+.bss, stringhe incluse)  ≤ 65.535 B  (uint16 virtual_size) — su ENTRAMBE
  → heap reale ≈ 131.072 − statico (emery)  |  65.536 − statico (flint)   [gap-1, dal sorgente]
  → una singola malloc > 64 KiB riesce (max blocco ~131.060 B); MAI realloc() su blocchi ≥ 64 KiB (bug troncamento uint16)
AppState runtime (fuori budget)  63.488 B (contiene il framebuffer app 45.600 B: NON costa heap)   30.720 B
Worker (unico nel sistema)       ~10,2 KiB heap + 1.400 B stack (uguale ovunque)
Framebuffer (RAM di sistema)     45.600 B (200×228×8bit) 3.360 B
Risorse per piattaforma          256 KB (appstore) / 1 MB (sideload)
Persist per app                  1 MiB (fw ≥ 4.9.171, 30/04/2026; 6 KiB prima) — 256 B per chiave — usare ≤ 75% della quota
DataLogging (sistema)            640 KiB, 20 sessioni, 300 B/item — ricevibile SOLO da PebbleKit Android/iOS
AppMessage                       min 124 (in) / 636 (out); max 8.200 ciascuno — allocati sull'heap app
malloc                           4 B overhead + allineamento 4; blocchi ≥256 B allocati dal fondo
Glifo font max                   512 B                     256 B
Animazioni                       30 Hz (33 ms/frame)       —
Status bar / Action bar          20 px / 34 px             16 px / 30 px
Menu cell basic / small          61 px / 42 px             44 px / 34 px
Timeline Quick View (peek)       59 px in basso            51 px
Content size default             Large (Small irraggiungibile, ExtraLarge raggiungibile)   Medium
Wakeup                           max 8 per app, non entro 30 s, finestra ±1 min esclusiva
AppGlance                        max 8 slice, sottotitolo ≤150 char — solo watchapp
```

Compilazione app (tutte le piattaforme): `-std=c99 -mcpu=cortex-m3 -mthumb -Os -fPIE -ffunction-sections -fdata-sections -Wall -Wextra -Werror`, **niente FPU, niente libm/libgcc** (`sqrt`, `sin`, `%f` non esistono).

✅ Riconciliazione 64/128 KiB (gap-1, dal sorgente `app_manager.c`, `inject_metadata.py`, `heap.c`, tag v4.33.2): il "64 KiB" del changelog 4.33 è il tetto di `load_size`/`virtual_size` (`uint16_t`) sull'immagine **statica**, non sull'heap. Il segmento è 135.168 B; tolti 4.096 B di stack restano **131.072 B = immagine caricata + heap**; il framebuffer e l'`AppState` stanno nella regione RUNTIME separata. Quindi una watchface con 20–35 KB di statico ha **~95–110 KiB di heap**; con statico ≤ 40 KB si garantiscono ≥ 88 KiB. La riga "Free RAM available (heap)" del build report coincide con l'heap reale a meno dell'allineamento. L'emulatore QEMU emery usa gli **stessi** valori dell'hardware. ✅ **Misurato in Fase 0 (24/08/2026, emulatore SDK 4.33.1, `apps/heapprobe`)**: emery `heap_bytes_free()` = 129.680 B a `main` con 1.368 B statici (build report 129.704 → costo runtime 24 B), `malloc(124 KiB)` riesce, 128 KiB no, `GBitmap` full-screen 8-bit costa 45.640 B; flint 64.144 B a `main`, `malloc(32 KiB)` ok, 64 KiB no. Log in `docs/fase0/`. ❓ Da ripetere sull'orologio reale (atteso identico).

---

## 4. Scelte tecnologiche

### 4.1 Linguaggio ✅

| Opzione | Verdetto | Perché |
|---|---|---|
| **C (Pebble C SDK)** | **Scelta** | App vuota: ~827 B RAM. Unico linguaggio per tutte le piattaforme (flint incluso). La FAQ ufficiale: *"Write in C when you want the smallest possible memory footprint"*. |
| PebbleKit JS (`src/pkjs/`) | Solo come **sync worker sul telefono** (fetch, geolocalizzazione, config Clay) | Gira sul telefono; zero RAM sull'orologio; non esiste offline. |
| Alloy (JS/TS su orologio, Moddable XS) | Solo per prototipi grafici rapidi, mai per le app finali | Solo emery/gabbro; motore XS ~29 KB; molte API C non esposte; `fetch()` è comunque un proxy via telefono. |
| Rocky.js / Pebble.js | **No** | Rimosso dal firmware (4.9.148) / morto dal 2016. |
| Rust / Zig | **No** | Rust: solo esperimenti obsoleti. Zig: esiste un SDK community attivo (`vsergeev/zig-pebble-sdk`, luglio 2026) ma non ufficiale, senza garanzie di ABI/toolchain: non per le nostre app. |

### 4.2 Librerie (Pebble Packages via npm, `pebble package install <nome>`) ✅ (registry interrogato 24/08/2026)

Usare **solo** pacchetti aggiornati nel 2026:

| Pacchetto | Versione | Uso | Quando |
|---|---|---|---|
| `pebble-events` | 1.2.1 | sottoscrizioni multiple agli event service (l'SDK ne permette una sola per servizio) | quasi sempre se si usano altre librerie |
| `@rebble/clay` | 1.0.10 | config page HTML inclusa nel `.pbw` (serve il telefono, non Internet) | app configurabili; **non** `pebble-clay` (2016) |
| `enamel` | 1.4.0 | genera getter C tipizzati dal `config.json` di Clay (persist + AppMessage automatici) | con Clay |
| `pebble-packet` | 1.6.1 | wrapper AppMessage (int/bool/string) | app con sync |
| `pebble-scalable` | 2.3.0 | layout in millesimi dello schermo | porting multi-piattaforma (non per layout emery dedicati) |
| `pebble-fctx` | 1.6.5 | vettoriale antialiased + font vettoriali | grafica curva ad alta qualità (⚠️ il compiler SVG associato è del 2016) |
| `pebble-universal-fb` | 1.11.0 | accesso framebuffer astratto per piattaforma | effetti full-screen |

Abbandonati (non usare): `pebble-clay`, `pebble-generic-weather`, `pebble-owm-weather`, `pebble-layout`, `@smallstoneapps/*`. Nessuna libreria meteo mantenuta: la cache meteo va scritta in proprio (pattern in §10).

### 4.3 Strumenti AI ✅

- `pebble new-project --ai <nome>` genera `CLAUDE.md` + `.cursor/rules/pebble.mdc` con i comandi corretti (incluso `--vnc` per ambienti headless).
- Skill ufficiale Claude Code **`coredevices/pebble-watchface-agent-skill`** (default emery; template C statici/animati/meteo, script icone/GIF, regole "no float, MINUTE_UNIT, destroy in unload"). Da clonare in `tools/` e usare come riferimento; ⚠️ contiene un errore (elenca `flint` come 64 colori: è B/N).
- Docs per LLM ✅ (verificato HTTP 200): `https://developer.repebble.com/llms.txt` (≈96 KB, indice completo) e ogni pagina in Markdown aggiungendo `.md` al path **senza slash finale** (`/sdk.md`, `/faqs.md`, `/sdk/changelogs/4.33.1.md`; `/sdk/index.md` è 404). Il template `--ai` punta già a `/llms.txt`. MCP community: `dbonomo/pebble-mcp` **è su PyPI** (0.1.0, `uvx pebble-mcp`: store search, tool palette 64 colori, build/emulatore/screenshot); esistono anche `jcrabapple/pebble-index-mcp` e `vishalsund/pebble-MCP` ❓ non provati.
- Estensione VS Code `coredevices.pebble-vscode` v0.0.8 è del **15/02/2026** e il repo è archiviato: usarla solo per i pulsanti Run/Logs.
- CloudPebble (`cloudpebble.repebble.com`) e `ericmigi/pebble-qemu-wasm` (emulatore emery nel browser) come piani B.

---

## 5. Setup dell'ambiente su questa macchina (senza sudo) — ✅ procedura verificata localmente il 24/08/2026 in sandbox

> Nulla di questo è ancora installato nell'HOME reale: è la Fase 0 della roadmap. Occupa ~1,2 GB in `$HOME` (SDK 770 MB + cache uv). **Non installare in `/tmp`** (tmpfs da 2,7 GB).

### 5.1 Toolchain

```bash
# 1) uv in ~/.local/bin (già nel PATH)
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# 2) Python gestito da uv: quello di sistema (3.14, senza ensurepip) fa fallire `pebble sdk install`
uv python install 3.13

# 3) CLI pinnata (riproducibilità)
uv tool install "pebble-tool==5.0.39" --python 3.13
pebble --version                     # Pebble Tool v5.0.39

# 4) SDK + toolchain ARM + QEMU (~40-80 s) → ~/.local/share/pebble-sdk/
pebble sdk install latest            # 4.33.1
pebble sdk list                      # "4.33.1 (active)"
```

Note: **non creare `~/.pebble-sdk`** (né il vecchio `NO_TRACKING`: l'analytics è disattivata in modo permanente nel codice, il file è inerte, e la sola esistenza di `~/.pebble-sdk` forza pebble-tool a usare quella directory legacy invece di `~/.local/share/pebble-sdk`, rompendo i path di `ldd`, clangd e cache CI). Python 3.14 gestito da uv funziona (testato), ma 3.13 è la scelta "ufficiale" di Core Devices. `uv tool install --force` cancella patch locali. `pebble sdk install` non è atomico: se manca `toolchain/` sotto `SDKs/<ver>/`, `pebble sdk uninstall <ver>` e reinstallare. "Already installed" esce con codice ≠ 0. Vincoli di versione: SDK 4.9.169 richiede pebble-tool ≥ 5.0.32, 4.17 ≥ 5.0.38; i comandi `emu-steps`/`emu-heart-rate` di 5.0.39 richiedono SDK 4.33. **Aggiornare il firmware dell'orologio a ≥ 4.32** prima di installare app compilate con SDK 4.33.1 (§2.4).

### 5.2 Emulatore QEMU senza sudo

Sulla macchina mancano `libSDL2-2.0.so.0` e `libXss.so.1` (glib, pixman, png16, zlib ci sono). Soluzione testata:

```bash
mkdir -p ~/.local/lib/pebble-deps && cd ~/.local/lib/pebble-deps
apt-get download libsdl2-classic libxss1 libsndio7.0      # non richiede root
for d in *.deb; do dpkg-deb -x "$d" root; done
# in ~/.bashrc:
export LD_LIBRARY_PATH="$HOME/.local/lib/pebble-deps/root/usr/lib/x86_64-linux-gnu:$HOME/.local/lib/pebble-deps/root/usr/lib/x86_64-linux-gnu/sdl2-classic${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
ldd ~/.local/share/pebble-sdk/SDKs/current/toolchain/bin/qemu-pebble | grep "not found"   # deve essere vuoto
```

Serve un display (Wayland/XWayland ok con `DISPLAY=:0`); in sessioni senza X aggiungere `--vnc` a **tutti** i comandi che toccano l'emulatore. Emulatori disponibili: `aplite basalt chalk diorite emery flint gabbro` (la FAQ ne elenca 5: riconfermare `flint`/`gabbro` al primo avvio ❓).

**Cosa emula QEMU emery** ✅ (gap-3, dal sorgente `coredevices/qemu` e `boards/qemu_emery/defconfig`): **touch sì** (`pebble_touch.c`, `CONFIG_TOUCH=y`) — si prova con **click/drag del mouse nella finestra SDL** (non documentato ma garantito dal codice; non esiste e non esisterà `pebble emu-touch`, il touch non passa dal protocollo seriale); per test scriptabili/CI serve QMP `input-send-event` (wrapper `PEBBLE_QEMU_PATH` che aggiunge `-qmp unix:/tmp/pebble-qmp.sock,server=on,wait=off` + uno script `tools/pbltouch.py` che replica `./pbl touch/swipe` del firmware — dettagli in `gap-3-emulatore-touch.md`). Emulati anche backlight RGB e speaker/mic; HRM è uno stub alimentato da `pebble emu-heart-rate`. **Non emulati**: sensore luce, modello di consumo batteria, vibrazione reale, multi-touch.

### 5.3 Primo progetto di verifica

```bash
cd ~/ProgettiClaude/Pebble/apps
pebble new-project --ai hello-emery && cd hello-emery
pebble build                                   # leggere il blocco "EMERY APP MEMORY USAGE"
pebble install --emulator emery --logs         # "App install succeeded."
pebble screenshot --emulator emery --no-open shot.png   # PNG 200×228, colori "sunlight-corrected"
pebble install --emulator flint                # verifica B/N
pebble kill
```

### 5.4 IDE

- `pebble compile-commands --platform emery` → `compile_commands.json`; clangd con `--query-driver=$HOME/.local/share/pebble-sdk/SDKs/current/toolchain/arm-none-eabi/bin/arm-none-eabi-gcc` (⚠️ config consigliata, non testata) oppure cpptools con `C_Cpp.default.compileCommands`.
- Estensione VS Code `coredevices.pebble-vscode` (Run su emulatore/telefono, log).
- Debug: `pebble build --debug` (`-O0 -DPBL_DEBUG`, `*_debug.pbw` — mai per misurare memoria) + `pebble gdb` (solo emulatore).

### 5.5 Test sull'orologio reale

1. App Pebble → **Devices → ⋯ → Enable Dev Connect** (login GitHub/account Pebble ❓ UI cambiata di recente); per la via LAN abilitare **anche** Settings → Developer Mode → Developer Connection (altrimenti `connection refused`).
2. `pebble login` (una volta), poi `pebble install --cloudpebble --logs` (relay cloud, funziona anche fuori LAN) oppure `pebble install --phone <IP> --logs`.
3. `pebble logs --cloudpebble`, `pebble screenshot --cloudpebble`.
4. In alternativa: aprire il `.pbw` dal file manager del telefono.
5. ✅ **Senza telefono non si può**: il PT2 parla solo BLE/PPoGATT, pebble-tool/libpebble2 non hanno trasporto BLE (`--serial` è Bluetooth Classic legacy), `libpebble3` compila solo per Android/iOS e `luigi311/cobble` (Rust/BlueZ) non supporta install né log. L'app mobile Core è obbligatoria per installare/loggare su hardware.

### 5.6 Piani B se l'emulatore non parte

(a) `pebble install --cloudpebble` sull'orologio; (b) CloudPebble in browser; (c) `ericmigi.github.io/pebble-qemu-wasm` (emery testato); (d) `pebble.nix` single-user ❓.

### 5.7 CI (GitHub Actions) — da creare in Fase 0

```yaml
name: build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    strategy: { matrix: { app: [hello-emery] } }        # aggiungere ogni app
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: astral-sh/setup-uv@v6
      - run: sudo apt-get update && sudo apt-get install -y libsdl2-2.0-0 libglib2.0-0t64 libpixman-1-0 zlib1g libsndio7.0
      - uses: actions/cache@v4
        with: { path: ~/.local/share/pebble-sdk, key: pebble-sdk-4.33.1-${{ runner.os }} }
      - run: uv tool install "pebble-tool==5.0.39" --python 3.13
      - run: pebble sdk list | grep -q "(active)" || pebble sdk install latest
      - run: cd apps/${{ matrix.app }} && pebble build
      - run: cd apps/${{ matrix.app }} && pebble install --emulator emery --vnc && pebble screenshot --emulator emery --vnc --no-open emery.png && pebble kill
      - uses: actions/upload-artifact@v4
        with: { name: ${{ matrix.app }}, path: apps/${{ matrix.app }}/build/*.pbw }
```

---

## 6. Struttura del repository e convenzioni

```
ProgettiClaude/Pebble/
├── PIANO-SVILUPPO-PEBBLE.md          ← questo documento
├── CLAUDE.md                          ← (Fase 0) regole operative per Claude, derivate da §17
├── docs/
│   ├── CONTINUA-QUI.md                ← (Fase 0) stato lavori, aggiornato a fine sessione
│   ├── ricerca/*.md                   ← report dettagliati (già presenti)
│   └── design/<app>.md                ← (per app) scelte di design, palette, layout, budget
├── tools/
│   ├── setup-env.sh                   ← §5.1–5.2 in forma di script idempotente
│   ├── svg2pdc.py                     ← port Python 3 dello script ufficiale (è Python 2)
│   ├── palette/pebble_colors_64.gif   ← palette ufficiale per ImageMagick
│   └── pebble-watchface-agent-skill/  ← clone della skill ufficiale (riferimento)
├── common/                            ← (opzionale) codice C condiviso come Pebble package locale
├── apps/
│   ├── hello-emery/                   ← smoke test Fase 0
│   └── <app>/                         ← un progetto pebble per app: package.json, wscript, src/c, src/pkjs, resources
└── .github/workflows/build.yml
```

Convenzioni per ogni app:
- `package.json`: `"sdkVersion": "3"` (valore generato, non cambiarlo), `targetPlatforms` esplicito, UUID v4 **minuscolo**, `version` `major.minor.0`, `capabilities` coerenti (`health`, `location`, `configurable`).
- Moduli C separati per responsabilità (pattern Halcyon): `main.c` (ciclo di vita), `ui_*.c` (disegno), `model.c` (stato), `storage.c` (persist + migrazioni), `sync.c` (AppMessage/connessione), `settings.c`. La **logica pura** (calcoli, parsing, layout math) in file che **non includono `pebble.h`**, così è testabile con gcc host + cmocka/Unity (non esiste un framework di test Pebble mantenuto).
- Risorse con tag descrittivi (`bg~color~rect~200w.png`, `bg~bw.png`), mai `~emery`; `targetPlatforms` per-risorsa per escludere gli asset 200×228 dal bundle flint.
- Ogni build in CI stampa e archivia il blocco `MEMORY USAGE`; soglie: footprint emery < 60 KiB, flint < 45 KiB, risorse < 256 KB.

---

## 7. Sfruttare al meglio il display del Pebble Time 2

### 7.1 Cosa è davvero il pannello ✅
MiP LCD riflettivo a 64 colori, **non** E Ink: si può animare liberamente (30 Hz), nessun ghosting. Ma: contrasto ~20:1, gamut ~17% NTSC, **backlight spento di default** → il design deve funzionare senza luce, in interni. Il driver trasferisce solo l'intervallo di **righe** sporche (`y0..y1`, larghezza piena): conta la località **verticale**, non quella orizzontale.

### 7.2 Colore e contrasto ✅ (LUT "sunlight" ufficiale, la stessa usata da `pebble screenshot`)
- I colori SDK escono molto più chiari sul vetro: `GColorRed` → #E35462, `GColorYellow` → #FFEEAB (quasi bianco), `GColorGreen` → #8EE391.
- **Regola: contrasto ≥ 4,5:1 calcolato sulla resa reale** (tabella completa in `docs/ricerca/display.md` §4.3).
- **Su sfondo nero** (consigliato): `GColorWhite` 21:1, `GColorPastelYellow` 19:1, `GColorIcterine`, `GColorCeleste`, `GColorYellow` 18:1, `GColorElectricBlue`, `GColorMintGreen`, `GColorCyan` 16:1, `GColorSpringBud`, `GColorGreen` 13,6:1, `GColorMelon` 12:1, `GColorRajah`, `GColorChromeYellow`, `GColorBabyBlueEyes` ~11:1.
- **Su sfondo bianco**: solo scuri — `GColorBlack`, `GColorOxfordBlue` 16,6:1, `GColorBulgarianRose`, `GColorImperialPurple`, `GColorDarkGreen`, `GColorDukeBlue` ~10:1, `GColorArmyGreen`, `GColorDarkGray` 7,6:1, `GColorDarkCandyAppleRed`, `GColorCobaltBlue`, `GColorBlue` 5,5:1. **Mai** giallo/verde/ciano su bianco (1,1–1,6:1); `GColorRed` su bianco è marginale (3,7:1).
- Solo 4 grigi utili (Black, DarkGray, LightGray, White): niente "mid gray".
- Non distinguere informazioni per sola tinta a luminanza simile; usare salti di luminanza, forma, spessore.
- Il backlight RGB (`light_set_color_rgb888()`) è un differenziatore PT2: usarlo per "carattere" quando si accende, **non** per compensare contrasto scarso; è il consumatore n. 1.
- Valutare sempre gli screenshot **con** correzione colore (default); `--no-correction` solo per debug palette. ❓ La LUT risale al pannello del Pebble Time 2015: confrontare con una foto del PT2 reale in Fase 1.

### 7.3 Tipografia ✅
- Font di sistema (già in ROM, zero heap): Gothic 14/18/24/28 (+Bold), Bitham 30/34/42, Roboto Condensed 21 / Bold Subset 49, Droid Serif 28, **LECO 20–42 e LECO 60 (solo numeri)** → `FONT_KEY_LECO_60_BOLD_NUMBERS_AM_PM` è il font "orologio" naturale su emery.
- A 202 PPI un font di N px è fisicamente più piccolo che su Pebble Time: aumentare le misure ≥ 11% + sfruttare la diagonale. Indicativamente: dato principale ≥ 36–42, testo 24, minimo 18.
- `preferred_content_size()` letto **una volta** in `init()`; su emery il default è `Large` e l'utente può arrivare a `ExtraLarge` (tema di sistema per Large: header Gothic 24 Bold, body/title Gothic 28, caption Gothic 18 — allinearsi a questi fa sembrare l'app "di sistema").
- Font custom: costano 56 B di heap (glifi letti on-demand dalla flash) ma pesano sul budget risorse → **`characterRegex` sempre** (es. `[0-9:]`, `[0-9A-Za-zÀ-ÿ .:]` se serve l'italiano). Glifi fino a 512 B su emery.

### 7.4 Layout ✅
- Mai 144/168/200/228 hardcoded: `layer_get_unobstructed_bounds(root)`; costanti di sistema (`STATUS_BAR_LAYER_HEIGHT` 20, `ACTION_BAR_WIDTH` 34, `menu_cell_basic_cell_height()` 61) invece di numeri.
- Timeline Quick View: `unobstructed_area_service_subscribe()`; su emery toglie **59 px** in basso (la doc dice ancora 51). Regola ufficiale: *"fill the entire window, not just the unobstructed area"*.
- Area utile caso peggiore watchapp: 166 × 149 px (senza action bar/status bar/peek). Dead zone touch: 16 px in alto.
- Tre livelli: proporzionale (`bounds.size.w/h`) → breakpoint `#if PBL_DISPLAY_WIDTH >= 200` → **layout dedicato emery** che usa l'88% di pixel in più per **informazione aggiuntiva** (riga dati, grafico, barra), non per ingrandire gli stessi elementi. Questo è ciò che distingue un'app "nativa PT2".
- Feature flag invece di nomi piattaforma: `PBL_COLOR/PBL_BW`, `PBL_RECT/PBL_ROUND`, `PBL_TOUCH`, `PBL_SPEAKER`, `PBL_RGB_BACKLIGHT`, `PBL_HEALTH`, `PBL_IF_COLOR_ELSE()`, `PBL_API_EXISTS(fn)` per le API 2026.
- Il firmware 4.33 supporta rotazione/left-handed mode: l'app non fa nulla, ma non presumere che "in alto a destra" sia fisicamente lì.

### 7.5 Immagini, PDC, animazioni ✅
- Costo RAM di una bitmap full-screen 200×228: **8Bit 45.600 B (35% del budget!)**, 4BitPalette 22.848, 2BitPalette 11.436, 1BitPalette 5.734. → `memoryFormat: "SmallestPalette"` (o `NBitPalette` esplicito); mai 8-bit full-screen.
- **Il default su emery è PNG (`spaceOptimization: "storage"`)** che a runtime alloca **due** buffer (PNG compresso + decodificato). Per il picco di heap: `"spaceOptimization": "memory"` (PBI) su ogni bitmap.
- Le risorse dell'app **non** sono zero-copy (lo XIP vale solo per le risorse di sistema): ogni risorsa caricata costa heap pari alla sua dimensione → caricare in `window_load`, distruggere in `window_unload`.
- Immagini: quantizzare con la palette ufficiale (`magick in.png +dither -remap pebble_colors_64.gif PNG8:out.png`; Floyd-Steinberg solo per foto — il dithering su MiP aumenta i pixel che cambiano ed è visibile a 202 PPI). Trasparenza solo con `GCompOpSet` (gli altri compositing mode sono indefiniti a colori).
- **PDC** (vettoriale, `svg2pdc.py`, solo `path/rect/polyline/polygon/line/circle`): 10–100× più piccolo di una bitmap, scala senza artefatti — ideale per icone; ma costa CPU a ogni frame → non per contenuto ridisegnato 30 volte/s.
- APNG/`GBitmapSequence`: file intero + frame buffer 8-bit sull'heap — il modo più costoso di animare; preferire disegno procedurale o PDC sequence.
- Icona menu 25×25 (per watchapp viene convertita in grigi per luminanza); icone ActionBar ≤ 28×18.

### 7.6 Compatibilità legacy ✅ (fonte: sorgente firmware)
Le app **senza** build emery vengono **scalate a schermo pieno con nearest-neighbour** per default (⚠️ `prefs.c`: `s_legacy_app_render_mode = 1 // Default to scaled mode`; un verificatore riporta "Bezel default" — controllare in emulatore) (fattori 1,389× / 1,357×, non interi → righe duplicate irregolari, testo sgranato); l'utente può scegliere Centered / Scaled (Nearest) / Scaled (Bilinear) in Settings → Display → Legacy Apps. Un binario SDK 3.x ottiene solo 67.584 B di RAM. **La build nativa emery è obbligatoria** per i nostri obiettivi.

### 7.7 Rendering: cosa è vero e cosa è mito ✅ (fonte: `layer.c`, `window.c`, `display_jdi.c`)
- **`layer_mark_dirty()` non fa redraw parziali**: imposta un flag sulla Window e al frame successivo viene ridisegnato **tutto l'albero** dei layer visibili. Marcare un layer piccolo non risparmia CPU. Ottimizzazioni vere: chiamarlo **una sola volta per tick**, pochi layer, `update_proc` economiche, `layer_set_hidden()` per sottoalberi non visibili (saltati), clipping (layer fuori schermo non costano).
- **Il costo di trasferimento** dipende dalle righe toccate nel framebuffer. Per default la Window riempie **tutto** lo schermo con il background a ogni render (228 righe sporche). Trucco ad alto impatto: `window_set_background_color(window, GColorClear)` + ridipingere solo l'area che cambia (es. la fascia dei minuti) → fino a −75% righe trasferite. Raggruppare gli elementi dinamici in **una banda verticale contigua**.
- Antialiasing attivo di default (no-op su flint): costa 2–3× sulle primitive curve; spegnerlo (`graphics_context_set_antialiased(ctx, false)`) per grafica ortogonale e animazioni; tenerlo per lancette e archi. `graphics_context_set_stroke_width()` accetta solo valori dispari.
- Costi crescenti: `fill_rect` < linee ortogonali < bitmap `GCompOpAssign` < `GCompOpSet` < linee diagonali AA < cerchi/radial < **testo** < `GPath` fill < PDC < **`RotBitmapLayer`** (evitare: lancette con `GPath` + `gpath_rotate_to()` o `graphics_fill_radial()`).
- Testo: (⚠️ `text_layer_set_should_cache_layout()` **non esiste** in `pebble.h` 4.33.1 — corretto il 26/08/2026); nelle `update_proc` custom non ricalcolare `graphics_text_layout_get_content_size()` a ogni frame; `snprintf` nel tick handler, mai nella `update_proc`; overflow "fill"/ellipsis più economico del word-wrap.
- Framebuffer diretto (`graphics_capture_frame_buffer()`, `gbitmap_get_data_row_info()` **una volta per riga**): l'unico modo per effetti full-screen a 30 fps; su emery 1 byte/pixel; ricordarsi che la scrittura diretta non aggiorna il dirty rect (fare prima un `fill_rect` sull'area).
- Budget per frame 33 ms; se una `update_proc` supera ~10–15 ms l'animazione scatta.

### 7.8 Touch e API esclusive emery ✅
- `#if defined(PBL_TOUCH)` + `touch_service_is_enabled()` (l'utente può disattivarlo). **Solo watchapp.** Preferire i recognizer (`tap_recognizer_create`, `pan_recognizer_create(axis)`, `swipe_recognizer_create(mask)`, `window_attach_recognizer()`) alla gestione raw; `app_touch_navigation_enable(true)` rende MenuLayer/ActionBar/ActionMenu usabili a dito senza codice; `window_set_touch_bridge_disabled(window, true)` per finestre che gestiscono il touch da sole (`ScrollLayer` non scrolla da solo: serve un pan recognizer). Il sensore consuma mentre è sottoscritto: subscribe in `appear`, unsubscribe in `disappear`. Ogni tocco accende il backlight. I recognizer **crashano su fw 4.32–4.33.1** (fix in 4.33.2): gating `watch_info_get_firmware_version()` ≥ 4.33.2 prima di `window_attach_recognizer()`/`app_touch_navigation_enable()`, oppure usare il raw `touch_service_subscribe()` (stabile da fw 4.9.164). Testabile in emulatore col mouse (§5.2).
- Speaker (`speaker_play_notes/tone`, PCM 8/16 kHz mono, max 16 KiB sample): feedback brevi; niente streaming continuo. `speaker_is_muted()`.
- Backlight RGB: `light_set_color_rgb888(0xRRGGBB)`, `light_set_system_color()`; si resetta all'uscita dell'app; `light_is_on()` e `backlight_service_subscribe()` per animare solo a schermo illuminato.
- HRV/SpO2 (`health_service_peek_hrv_ppi_ms`, `health_service_set_hrv_sample_period`): il sensore va alla frequenza più corta tra HR e HRV → azzerare i sample period all'uscita.

---

## 8. Consumare poca memoria

### 8.1 Regole ✅
1. Ogni `*_create()` ha il suo `*_destroy()` in `window_unload`; puntatore a `NULL` dopo. Controllare il ritorno di ogni `*_create()`/`malloc()` (ritornano `NULL` in OOM; usare NULL = app fault).
2. Statico vs heap sono lo **stesso budget**, ma lo statico è cappato a 65.535 B (e include `.rodata`: **le stringhe costanti costano RAM**). Buffer piccoli a vita-app → `static`; oggetti grandi legati a una Window → heap in `window_load`.
3. Tabelle di stringhe/dati grandi → risorsa `"type": "raw"` letta a blocchi con `resource_load_byte_range()` (streaming, zero RAM residente) — tecnica chiave per dataset offline.
4. Allocare **per prime e una sola volta** le allocazioni ≥ 256 B long-lived (finiscono in fondo all'heap, anti-frammentazione); niente `malloc`/`free` nei tick o nelle `update_proc`; `heap_bytes_free()` è un totale, non il blocco contiguo più grande (per sapere se un blocco grande è disponibile: tentare la `malloc` all'avvio). **Mai `realloc()` su blocchi ≥ 64 KiB** (`heap_realloc` tronca la dimensione a `uint16_t` → perdita dati silenziosa): dimensionarli una volta in `init()`, dal più grande al più piccolo.
5. AppMessage: `app_message_open()` con `dict_calc_buffer_size()` (o es. 256/128), **mai** `*_size_maximum()` per default (fino a 16,4 KB di heap; richieste oltre il massimo vengono **troncate in silenzio**, l'avviso è solo un log INFO); registrare i callback prima di `open`; `app_message_close()` a sync finita.
5b. Tetto di progetto sullo statico: **≤ 40 KB** su emery garantisce ≥ 88 KiB di heap (heap ≈ 131.072 − statico); non leggere "128KB" nel build report come budget di codice: il tetto statico reale è 65.535 B.
6. Bitmap palettizzate + `spaceOptimization: "memory"` + `targetPlatforms` per risorsa; PDC per icone; `characterRegex` su ogni font (§7.5).
7. Worker: 10 KiB, uno solo nel sistema (può essere "rubato" da un'altra app) → preferire `wakeup_schedule()` + `persist`.
8. `ScrollLayer`/`MenuLayer` mai embeddati per valore in struct (`sizeof` cresciuto in SDK 4.33).
9. Un log di memoria per fase (`init`, `window_load`, dopo il primo render, `deinit`): `APP_LOG(…, "heap used=%u free=%u", heap_bytes_used(), heap_bytes_free())`.
10. Dimensioni reali degli oggetti (da `applib_malloc.json`): Layer 60, Window 100, TextLayer 92, BitmapLayer 76, GBitmap 32, ScrollLayer 228, MenuLayer 476, SimpleMenuLayer 520, ActionBar 172, StatusBar 200, ActionMenu ~954, Dialog 640, DictationSession 1284, VoiceWindow 2384.

### 8.2 Misurare ✅
```bash
pebble build 2>&1 | grep -A4 "MEMORY USAGE"          # footprint statico + heap teorico, a ogni build
pebble analyze-size --verbose | head -60              # chi occupa .text/.data/.bss (⚠️ su app banali stampa zeri)
arm-none-eabi-nm --size-sort -S -C build/emery/pebble-app.elf | tail -30
pebble install --emulator emery --logs                # heap reale a runtime (l'emulatore ha lo STESSO budget RAM dell'hardware)
pebble build --debug && pebble install --emulator emery && pebble gdb   # crash
```

### 8.3 Trappole che crashano sull'hardware ma non in emulatore ✅
`text_layer_set_text()` con buffer locale (non copia!), use-after-free (il fuzzing dell'heap è disattivato per le app di terze parti), `app_message_inbox_size_maximum()` diverso tra emulatore e telefono reale, double free (`PBL_CROAK`), array grandi sullo stack (guard 32 B → fault), latenza flash reale, binari SDK 3.x in bezel mode con 64 KiB. Le watchface che crashano ripetutamente vengono sostituite automaticamente da quella di sistema.

---

## 9. Performance e batteria

### 9.1 Fatti ✅
- PT2: ~2,9× la CPU del Pebble Time (984 vs 339 CoreMark), ~4,6× il Pebble 2 Duo. Ma le app sono compilate Cortex-M3 soft-float: il guadagno è solo di clock/cache. Il vero guadagno viene dall'algoritmo (fixed point, tabelle, meno pixel).
- Durante ogni trasferimento del frame il SoC **non può** entrare in deep-WFI: ogni redraw è tempo di CPU sveglia. Il pannello MiP non consuma per i pixel invariati; il costo è il **wake della CPU**.
- Core Devices (14/07/2026): *"the biggest consumers of power are backlight, watchfaces with a lot of animations and health tracking"*. Preset backlight: Standard 50% / Battery Saver 25%.
- L'emulatore **non modella** consumo né timing: ogni misura di batteria va fatta sull'orologio (48 h con/senza la nostra app, confrontando la stima "giorni rimanenti" nell'app Pebble).

### 9.2 Regole ✅
1. `tick_timer_service_subscribe(MINUTE_UNIT, …)`; i secondi solo come opzione disattivabile e/o solo mentre `light_is_on()`.
2. Nessuna animazione continua: transizioni ≤ 300–500 ms su cambio minuto o `accel_tap_service_subscribe()`; `AppTimer` ≥ 33 ms; ogni `app_timer_register()` ha il suo `app_timer_cancel()` in `disappear/unload`; varietà visiva deterministica legata al contatore dei minuti invece di timer.
3. Accelerometro: `ACCEL_SAMPLING_10HZ` + batch 10 (1 risveglio/s), o solo tap service. Bussola: `compass_service_set_heading_filter(TRIG_MAX_ANGLE/36)`.
4. HRM: `health_service_set_heart_rate_sample_period()` sopravvive all'uscita → **azzerare con 0** in `deinit`.
5. Bluetooth: `SNIFF_INTERVAL_NORMAL` sempre (REDUCED costa 2–5× e solo durante trasferimenti voluminosi); cache in `persist` invece di richiedere al telefono.
6. Mai `psleep()`, mai busy loop, mai `light_enable(true)` prolungato (`light_enable_interaction()`).
7. Pattern "battery-aware": sotto il 20% (`battery_state_service`) rallentare/disattivare animazioni.
8. Flag compilatore: lasciare `-Os`; `CFLAGS="-O2" pebble build` solo per confronto misurato su hardware (rischio tetto 64 KiB); **mai** toccare `-mcpu`/`-mfpu` (rompe l'ABI); `-flto` non testato, evitare.
9. Timing: `time_ms()` attorno alla `update_proc`, loggato una volta al minuto (l'`APP_LOG` stesso costa).

---

## 10. Architettura offline-first

### 10.1 Cosa richiede il telefono e cosa no ✅
- ❌ Richiedono il telefono: PebbleKit JS (fetch, geolocalizzazione), Clay/config page (serve il telefono, non Internet), timeline pin (**la web API è morta**: solo `Pebble.insertTimelinePin()` locali, e solo mentre il JS gira), dictation, meteo, AppMessage, `fetch()` di Alloy (proxy).
- ✅ Funzionano sull'orologio: persist, wakeup, health (passi/sonno/HR/HRV), accelerometro/tap, bussola, batteria, tick/ora/`localtime`, AppGlance (persistito), DataLogging (scrittura), worker, sveglie (`alarm_service_peek_next()`), touch, speaker, backlight, i18n (locale utente persistito sull'orologio).
- **Nessun Wi-Fi** su nessun Pebble: qualsiasi dato da Internet passa dal telefono. Il `weather_service` del firmware non è esposto alle app.

### 10.2 Persist come database locale ✅ (fonte: `persist/service.c`, `settings_file.c`)
- 1 MiB per app (fw ≥ 4.9.171, 30/04/2026, incondizionato su tutte le piattaforme; prima 6 KiB), 256 B per chiave; `#if PBL_API_EXISTS(persist_get_max_size)` … `#else 4096` (serve solo a compilare con SDK < 4.17: a runtime il firmware è comunque ≥ quello richiesto dall'SDK). Dimensionare la cache su ≤ 75% della quota e gestire sempre `E_OUT_OF_STORAGE` / `status_t` negativi.
- È un **file log-strutturato su flash NOR**: ogni write appende; sovrascrivere marca "dead space"; a soglia → grow (raddoppio) o compact (riscrittura completa; a 1 MiB "many seconds"). Atomicità **per record**, non per transazione.
- Regole: **≤ 1 write/minuto** in regime stazionario; scrivere con debounce (AppTimer 10–30 s) e flush in `deinit()`, **mai** nel tick handler; non far crescere il file oltre il necessario.
- Blob > 256 B: chunking su chiavi consecutive; scrivere **prima i chunk, poi lunghezza + CRC** (interruzione → stato precedente coerente).
- Schema versionato: chiave 0 = `SCHEMA_VERSION`; range chiavi riservati (0–9 meta, 10–99 impostazioni, 1000+ cache); `switch` con fallthrough per migrazioni; **versione futura → reset**, mai crash. Struct `__attribute__((packed))`; validare `persist_exists()` + `persist_get_size(key) == sizeof(T)` + CRC + sanity del timestamp. `persist_read_int` ritorna 0 se la chiave manca: indistinguibile da un valore → sempre `persist_exists()` prima.

### 10.3 Connettività e sync ✅
- All'avvio `connection_service_peek_pebble_app_connection()` (non aspettare il primo evento); `connection_service_subscribe()` come **trigger di risincronizzazione** (non polling). `bluetooth_connection_service_*` è deprecato.
- 4 stati UI: `FRESH` (cache valida, età < TTL) · `STALE` (età ≥ TTL, telefono connesso → badge "aggiornamento…" + fetch) · `OFFLINE_CACHED` (dato + icona BT barrata + "agg. 2 h fa") · `OFFLINE_EMPTY` (placeholder `--°`, mai spinner infinito). Render **sempre prima dalla cache**; separare `model` da `view`; età calcolata sull'orologio da `time(NULL) − fetched_at`; dato > 24 h → placeholder; gestire skew (`age < 0`).
- Retry: backoff esponenziale con jitter (1 s → 5 min, reset su successo); **mai ritentare su `APP_MSG_NOT_CONNECTED`** (aspettare l'evento BT); `APP_MSG_BUSY` retry breve; `APP_MSG_APP_NOT_RUNNING` retry lungo.
- Handshake `JSReady` (il PKJS manda `{"JSReady":1}` su `ready`; l'orologio non invia prima). Liste lunghe: pompa su `AppMessageOutboxSent`, non timer. Meglio: **un solo messaggio binario** (`byte array`) invece di N tuple (7 B overhead ciascuna).
- Il PKJS invia **sempre `FetchedAt`** (UTC secondi) col dato, cacha anche lui (`localStorage` + TTL) e su errore rete rimanda la cache **col timestamp originale**. Su iOS niente `fetch`/DOM: `XMLHttpRequest`.
- Nessuna vibrazione automatica alla disconnessione (reclamo n. 1 degli utenti Pebble); niente icone BT lampeggianti.

### 10.4 Esecuzione senza telefono ✅
- **Wakeup API** per task schedulati: max 8 per app, non entro 30 s, finestra ±1 min esclusiva → `E_RANGE` è comune: ritentare con offset (+150 s × 6); persistere il `WakeupId`, validarlo con `wakeup_query()`; `clock_to_timestamp()` **gestisce il DST** nel firmware ✅ (un report diceva il contrario: smentito dal sorgente); `launch_reason() == APP_LAUNCH_WAKEUP`.
- **AppGlance** (solo watchapp) in `deinit()`: slice con template `{time_since(ts)|format('%aT')}` → il launcher mostra da solo l'età del dato, a costo ~zero.
- **Worker** solo per campionamento sensori continuo; altrimenti wakeup + persist. DataLogging solo se esiste una companion app nativa.
- Config senza telefono: un piccolo **menu impostazioni on-watch** (MenuLayer + persist; col touch su PT2 è comodo) **in aggiunta** a Clay. Non esiste una config on-watch ufficiale (solo un prototipo community non merged).
- Tempo: `time()`/RTC funzionano offline; il fuso resta l'ultimo noto; difendersi da `clock_is_timezone_set() == false` (orologio resettato → `localtime` = UTC). `clock_is_24h_style()`, `clock_copy_time_string()`.
- i18n: `setlocale(LC_ALL, "")`, `it_IT` supportato; il separatore decimale di `printf` resta `.` (formattare la virgola a mano); font custom con i glifi accentati.

### 10.5 Architettura di riferimento (C, emery)
```
OROLOGIO (sempre attivo)
  model.c    stato in RAM + specchio in persist (single source of truth): {data, fetched_at, version, crc}
  storage.c  migrate → load → validate → default; write con debounce + flush in deinit()
  sync.c     ConnectionService gate; AppMessage backoff+jitter; JSReady; buffer minimi
  ui_*.c     render SEMPRE dal model; 4 stati; età del dato; nessuna dipendenza dal fetch
  glance.c   app_glance_reload con time_since()          wakeup.c  schedule con jitter anti-E_RANGE
TELEFONO (opzionale, best-effort)
  pkjs/index.js  geolocation → XHR → localStorage(TTL) → send {…, FetchedAt}; Clay config
```
Budget indicativo emery: stack 4.096 · AppMessage 512+256 · cache in RAM ~2 KB · bitmap/font 20–40 KB · heap libero residuo > 80 KB.

---

## 11. Workflow per ogni nuova app (da seguire insieme)

| Fase | Attività | Output / gate |
|---|---|---|
| **A. Idea** | Una frase: cosa fa, per chi, cosa deve funzionare offline, dati in gioco, watchface o watchapp. Scegliere l'archetipo (§14.2). | `docs/design/<app>.md` §1 |
| **B. Design** | Wireframe testuale 200×228 **e** 144×168 B/N; palette (max 3–4 colori dalla tabella §7.2, sfondo nero); font; stati UI (i 4 dell'offline se c'è sync); modello dati (struct packed, chiavi persist, versione schema); budget (footprint, risorse, heap); input (pulsanti; touch opzionale). | `docs/design/<app>.md` completo |
| **C. Scaffold** | `pebble new-project --ai <nome>` (aggiungere `--javascript` se serve PKJS); `targetPlatforms`; UUID minuscolo; moduli C secondo §6; `CLAUDE.md` dell'app. | build verde su emery + flint, screenshot |
| **D. Implementazione** | Prima la UI dal model con dati finti, poi storage, poi sync. Regole §7–§10 e §17.3. Log di memoria per fase. | ogni commit compila senza warning; `MEMORY USAGE` entro soglie |
| **E. Test emulatore** | Matrice §12.1 (emery, flint; Quick View on/off; content size ×3; BT off dal primo avvio; `pebble wipe`; batteria 10%; 12/24 h). Screenshot per piattaforma. | checklist §12 spuntata |
| **F. Test orologio** | `pebble install --cloudpebble --logs`; verifica in interni senza backlight; touch; **48 h di batteria** confrontata con la watchface di sistema. | note in `docs/design/<app>.md` |
| **G. QA finale** | §12.4. Confronto con Legacy Apps = Centered/Scaled. Nessun leak dopo N apri/chiudi. | — |
| **H. Pubblicazione** | §13. Prima release non pubblicata/unlisted → controllo listing → public. Tag git `v<major>.<minor>.0`. | link store, `.pbw` in CI |
| **I. Manutenzione** | Seguire i changelog SDK; ricompilare con SDK nuovi solo se serve un'API (le app 4.33 richiedono fw ≥ 4.32). | `docs/CONTINUA-QUI.md` aggiornato |

Definition of Done per app: gate D–G superati, `docs/design/<app>.md` allineato, budget rispettati, pubblicata (o motivo per cui non lo è).

---

## 12. Test e QA

### 12.1 Matrice emulatore
```bash
pebble build
for P in emery flint; do pebble install --emulator $P && pebble screenshot --emulator $P --no-open shot_$P.png; done
pebble emu-set-timeline-quick-view on --emulator emery     # e off
pebble emu-set-content-size medium|large|x-large --emulator emery   # su emery: Medium/Large/ExtraLarge
pebble emu-bt-connection --connected no --emulator emery   # offline dal primo avvio
pebble wipe                                                 # primo avvio senza dati persistiti
pebble emu-battery --percent 10 --emulator emery ; pebble emu-battery --percent 80 --charging
pebble emu-time-format --format 12|24 ; pebble emu-set-time ...
pebble emu-tap --direction x+ ; pebble emu-accel ... ; pebble emu-compass --heading 90
pebble emu-steps/-heart-rate ...                            # health (heart-rate solo emery)
pebble emu-app-config                                       # pagina Clay
pebble logs --emulator emery
```
Nota: l'install su un emulatore già avviato può atterrare sul launcher con l'app evidenziata ma non lanciata (sembra un crash, non lo è): `pebble emu-button click select --emulator emery`.

### 12.2 Checklist offline
- [ ] Contenuto utile con BT disconnesso **al primo avvio assoluto** (dopo `pebble wipe`)
- [ ] Nessuna schermata "Loading…" permanente
- [ ] Dati cache con età esplicita, mai spacciati per freschi; > 24 h → placeholder
- [ ] `APP_MSG_NOT_CONNECTED` gestito senza retry loop
- [ ] Riconnessione: aggiornamento automatico senza riavvio
- [ ] Ora/health/timer/storage al 100% offline; `clock_is_timezone_set()` gestito

### 12.3 Checklist memoria/perf
- [ ] `Total footprint in RAM` < 60 KiB emery / < 45 KiB flint; risorse < 256 KB
- [ ] `heap_bytes_free()` stabile dopo N cicli apri/chiudi (no leak)
- [ ] Nessun `SECOND_UNIT`, nessuna animazione continua, timer cancellati in `disappear`
- [ ] `update_proc` < 10 ms (misurata con `time_ms()` sul dispositivo)
- [ ] Sample period HRM azzerato, sniff interval normale, touch unsubscribed fuori dalla finestra

### 12.4 Checklist pre-pubblicazione
- [ ] Build pulita per tutte le `targetPlatforms`, senza warning
- [ ] UUID minuscolo invariato; `version` `major.minor.0` incrementata; `capabilities` coerenti; `watchapp.watchface` corretto (determina la categoria)
- [ ] Screenshot per ogni piattaforma a risoluzione nativa (200×228 emery, 144×168 flint), **senza cornice**; banner 720×320 (obbligatorio per watchapp); icone 144×144 e 48×48
- [ ] Testato: Quick View on/off; 3 content size su emery; BT off; `wipe`; 12/24 h; batteria bassa/in carica; Legacy Apps Centered/Scaled
- [ ] Nome conforme al trademark (`<Nome> for Pebble`, mai `Pebble <Nome>`, niente logo Pebble)
- [ ] Config page (se `configurable`) raggiungibile; release notes scritte

---

## 13. Pubblicazione ✅

- **Core** (primario, default sui nuovi orologi): `pebble login` (GitHub) → `pebble publish --is-published --release-notes "…"` (senza `--is-published` la release resta bozza). Genera GIF/screenshot via emulatore per tutte le piattaforme (richiede QEMU + ffmpeg); alternativa `--non-interactive --no-gif-all-platforms --screenshots emery_1.png flint_1.png` (nome file con prefisso piattaforma). L'account developer viene creato automaticamente. Dashboard: `developer.repebble.com/dashboard`.
- **Rebble** (secondario): upload manuale del `.pbw` su `dev-portal.rebble.io` (account: solo il nome da pubblicare). Possibile collegare un thread del forum per annunci automatici. Visibilità Public/Unlisted.
- Nessuna review; takedown a posteriori per violazioni delle Program Policies (no auto-update fuori store, no pubblicità nelle notifiche, no gambling…). Nessuna app a pagamento (KiezelPay ❓ non confermato sui nuovi orologi). Store non localizzato: descrizione multilingua in un unico testo. Marcare l'app open source per il filtro store.
- Licenze: PebbleOS Apache-2.0, pebble-tool MIT, SDK con EULA proprietaria (testo ancora intestato a Pebble Technology Corp. ⚠️); l'app resta nostra.

---

## 14. Roadmap proposta

### 14.1 Fasi

| Fase | Contenuto | Esito atteso |
|---|---|---|
| **0 — Setup** ✅ **fatta il 24/08/2026** (stato in `docs/CONTINUA-QUI.md`) | §5.1–5.3 nell'HOME reale; `tools/setup-env.sh` (idempotente), `tools/pebble-env.sh` + hook `~/.bashrc`, `tools/qemu-pebble-wrapper` (`PEBBLE_QEMU_PATH`); `CLAUDE.md` + `docs/CONTINUA-QUI.md`; clone skill ufficiale e `sdk-docs` in `tools/`; `svg2pdc.py` Python 3; CI scritta (non eseguita); **app sonda memoria eseguita** su emery e flint (modello confermato, §3); emulatori emery/flint/gabbro verificati con screenshot; `git init` senza commit. Rimandati: prova touch col mouse (manuale), default Legacy Apps, `tools/pbltouch.py`, test su orologio. | `hello-emery` compila e gira su emery+flint+gabbro; heap misurato: 129.680 B (emery) / 64.144 B (flint) |
| **1 — Watchface pilota** | Archetipo W (§14.2). Esercita: display (LECO 60, dark, quick view, content size), `MINUTE_UNIT`, indicatori BT/batteria con `peek`, persist impostazioni, opzionale Clay+enamel. | pubblicata; 48 h di batteria misurate; palette confrontata con foto del vetro |
| **2 — Watchapp offline** | Archetipo U. Esercita: MenuLayer + touch navigation, menu impostazioni on-watch, persist versionato con CRC, wakeup con jitter, AppGlance con `time_since`, ActionBar/ActionMenu, speaker/backlight RGB come feedback. | pubblicata; heap e footprint documentati |
| **3 — App con sync opportunistica** | Archetipo S. Esercita: PKJS sync worker (XHR, cache telefono, `FetchedAt`), 4 stati UI, backoff, buffer minimi, messaggio binario unico. | pubblicata; test offline completo |
| **4 — Consolidamento** | Estrarre `common/` (storage/sync/ui helpers) come package locale; aggiungere `gabbro` se ha senso; iterare sulle app in base ai feedback store. | librerie riusabili; app successive in giorni, non settimane |

### 14.2 Archetipi di "piccola app" (per scegliere in fretta)
- **W — Watchface**: nessun pulsante (Up/Down = timeline, Select = launcher), solo tap accel; `MINUTE_UNIT`; niente touch; tutto ciò che mostra deve esistere senza telefono (ora, data, passi, batteria, BT); dati remoti solo come complication opzionale con età.
- **U — Utility offline** (timer, contatore, checklist, note, convertitore, dadi…): watchapp; tutto in persist; touch + pulsanti; AppGlance; wakeup per promemoria; nessun PKJS.
- **S — App con dati remoti** (meteo, trasporti, feed): watchapp o watchface; PKJS come sync worker; cache + 4 stati; mai bloccante.
- Da evitare come prime app: streaming audio, grafica 30 fps full-screen, app che dipendono da timeline web o DataLogging.

---

## 15. Rischi, incognite, cose da verificare (❓)

| # | Punto | Piano |
|---|---|---|
| 1 | Heap reale su emery: modello (heap ≈ 131.072 − statico − 24 B) **confermato in emulatore** (Fase 0), non ancora su PT2 reale | ripetere `apps/heapprobe` sull'orologio al primo accesso |
| 2 | Resa colori del pannello PT2 vs LUT "sunlight" (nata sul pannello 2015) | foto del vetro vs screenshot corretto in Fase 1 |
| 3 | UI attuale del Dev Connect nell'app mobile (login GitHub vs account Pebble) | al primo test su orologio |
| 4 | `app_message_inbox_size_maximum()` in emulatore vs telefono | log in Fase 3 |
| 5 | Stabilità touch (firmware) e unità con consumo anomalo | aggiornare sempre il firmware; misurare 48 h |
| 6 | Sync store Rebble→Core | pubblicare su entrambi |
| 7 | **Firmware installato sugli orologi degli utenti**: le app SDK 4.33.1 girano solo su fw ≥ 4.32; possibile firmware di fabbrica 4.27.1 su unità nuove; non è noto se l'app mobile forzi gli aggiornamenti | scegliere l'SDK per app (4.17 quando basta); scrivere nella descrizione store il firmware minimo |
| 8 | ~~Emulatore per `flint`/`gabbro`~~ ✅ verificati in Fase 0 (screenshot 144×168 e 260×260); resta la resa round reale | `gabbro` solo se si aggiunge |
| 9 | Doc ufficiali obsolete in più punti (persist "4 kB", FAQ emulatori, nota Python 3.14, peek 51 px, `targetPlatforms` di default, water resistance "TBD", guida "Conserving Battery" mai aggiornata) | fidarsi del sorgente firmware/SDK; annotare qui le discrepanze trovate |
| 10 | Cadenza altissima dei firmware (un minor ogni pochi giorni; v4.36.0 uscita il giorno di questa ricerca) | pinnare SDK e pebble-tool; aggiornare deliberatamente |
| 11 | Il binario `qemu-pebble` dell'SDK 4.33.1 (10.1.5-pebble14) è precedente ai tag pebble15–17 di `coredevices/qemu`: touch/decorazioni potrebbero differire | verificare touch col mouse in Fase 0 |
| 12 | Default "Legacy Apps" (scaled vs centered) | controllare in emulatore |

---

## 16. Riferimenti essenziali

- Docs ufficiali (canoniche): https://developer.repebble.com — installazione `/sdk/`, changelog `/sdk/changelogs/` (solo 4.17, 4.33, 4.33.1), API C `/docs/c/`, guide `/guides/toc/`, FAQ `/faqs/`, hardware `/guides/tools-and-resources/hardware-information/`, esempi `/examples/`; per LLM `/llms.txt` e `<pagina>.md`. Copia Rebble (parzialmente obsoleta): developer.rebble.io. Scheda prodotto ufficiale: https://repebble.com/watch.
- Sorgenti: `github.com/coredevices/PebbleOS` (firmware; `tools/pebble_sdk_platform.py`, `Kconfig`, `src/fw/applib/`), `pebble-tool`, `sdk-docs`, `example-apps`, `pebble-watchface-agent-skill`, `mobileapp`, `cloudpebble`.
- Community: forum https://forum.repebble.com/c/developers-ask-questions-and-get-help/7 · Discord Rebble `#sdk-dev` https://discord.com/invite/aRUAYFN · blog https://repebble.com/blog · https://ericmigi.com/blog.
- Codice di riferimento: `freakified/halcyon` (architettura modulare, 7 piattaforme, alba/tramonto calcolati on-watch), `freakified/TimeStylePebble`, `pebble-dev/bobby-assistant` (package.json 2026 reale), `coredevices/example-apps` (touch, RGB, speaker), `lanrat/pebble-2048-touch` (touch + CI), `asebrech/fdf-time` (3D solo interi), tutorial C ufficiale parti 1–6 (Quick View, Clay).
- Setup community verificato: `ArtRichards/pebble-time2-dev-setup` (patch IPv4 per pypkjs se manca IPv6).
- Palette: `developer.repebble.com/assets/other/pebble_colors_64.{gif,act,pal,ai}`, color picker `/guides/tools-and-resources/color-picker/`.

---

## 17. Istruzioni operative per Claude

### 17.1 A inizio sessione
1. Leggere questo piano (§1, §3, §7–§10, §17) e `docs/CONTINUA-QUI.md` (quando esiste).
2. Verificare l'ambiente con `pebble --version && pebble sdk list` prima di qualsiasi build; se manca, eseguire/proporre `tools/setup-env.sh`.
3. Per dettagli non coperti qui, aprire `docs/ricerca/<tema>.md`; solo se è una novità post-24/08/2026, consultare i changelog SDK (`…/sdk/changelogs/<ver>.md`).

### 17.2 Modo di lavorare
- Implementare → `pebble build` (leggere `MEMORY USAGE`) → `pebble install --emulator emery` → screenshot → controllare visivamente (colori con correzione) → ripetere su `flint`. Mai dichiarare "fatto" senza build verde e screenshot.
- Per ogni lavoro delegato ad agenti/workflow (ricerca, tool, test, codice, revisione): dividere in compiti di importanza **bassa / media / alta**; bassa e media → modello **Opus**, alta → **Fable** (regola permanente del progetto, 27/08/2026; vedi `CLAUDE.md`).
- Mai commit/PR/push senza conferma dell'utente (regola di progetto esistente). Mai installare nulla fuori dall'HOME; niente sudo.
- Aggiornare `docs/CONTINUA-QUI.md` a fine sessione e `docs/design/<app>.md` quando cambiano scelte.

### 17.3 Regole di codice C (da rispettare sempre)
1. `targetPlatforms` include `emery` (+`flint`); feature flag (`PBL_COLOR`, `PBL_TOUCH`, …) e `PBL_API_EXISTS()` invece di nomi piattaforma.
2. Layout da `layer_get_unobstructed_bounds()`; `unobstructed_area_service_subscribe()` nelle watchface; costanti di sistema; `preferred_content_size()` una volta.
3. `tick_timer_service_subscribe(MINUTE_UNIT, …)`; un solo `layer_mark_dirty()` per tick; `window_set_background_color(w, GColorClear)` + repaint mirato; elementi dinamici in una fascia verticale; animazioni solo su evento e ≤ 500 ms; `light_is_on()`.
4. Ogni `*_create()` ha `*_destroy()` in `window_unload`; controllare i NULL; allocare in `window_load`, mai in `update_proc`.
5. Zero `float`/`double`; `sin_lookup`/`cos_lookup`/`atan2_lookup`, `DEG_TO_TRIGANGLE`, fixed-point; niente `%f`, `sqrt`, `qsort`, `strtol`, `alloca`.
6. Buffer `static` file-scope (niente array > ~200 B sullo stack; stringhe per `text_layer_set_text` mai locali); `snprintf` con `sizeof`.
7. Bitmap: `memoryFormat` palettizzato + `"spaceOptimization": "memory"` + `targetPlatforms`; PDC per icone; font con `characterRegex`; niente `RotBitmapLayer`; `GCompOpSet` per la trasparenza.
8. AppMessage: buffer da `dict_calc_buffer_size()`; callback prima di `open`; `close` a fine sync; `JSReady`; mai retry su `APP_MSG_NOT_CONNECTED`; backoff con jitter; `SNIFF_INTERVAL_NORMAL`.
9. Persist: `persist_exists()` prima di leggere; schema versionato + CRC; chunk poi lunghezza; scritture con debounce, flush in `deinit`; `persist_get_max_size()` con fallback 4096.
10. Wakeup con retry su `E_RANGE`; niente worker se bastano wakeup + persist; AppGlance in `deinit` (watchapp).
11. Touch: solo watchapp, `#if defined(PBL_TOUCH)`, `touch_service_is_enabled()`, recognizer, unsubscribe in `disappear`, fallback pulsanti.
12. Un `APP_LOG` di memoria per fase; nessun log nei loop caldi; timing con `time_ms()` una volta al minuto.
13. Testo: `GSize` del testo memorizzata; antialias off per grafica ortogonale. (`text_layer_set_should_cache_layout()` non esiste nell'SDK 4.33.1.)
14. `ScrollLayer`/`MenuLayer` sempre per puntatore; `wscript` con `ctx.pbl_suppress_newer_gcc_warnings()` solo per codice importato.
15. Mai `realloc()` su blocchi ≥ 64 KiB; statico ≤ 40 KB su emery; blocchi grandi allocati una volta in `init()`.
16. L'SDK scelto fissa il firmware minimo (4.17 → fw ≥ 4.17; 4.33.1 → fw ≥ 4.32): dichiararlo in `docs/design/<app>.md` e nella descrizione store; recognizer touch solo con `watch_info_get_firmware_version()` ≥ 4.33.2.

### 17.4 Contenuto minimo del `CLAUDE.md` di progetto (da creare in Fase 0)
Comandi (`pebble build/install/screenshot/logs/kill`, `--vnc` se headless, `LD_LIBRARY_PATH`), piattaforme target, soglie di memoria, link a questo piano e a `docs/ricerca/`, le 14 regole di §17.3, la regola "nessun commit senza conferma".

---

## 18. Changelog del piano

- **2026-08-26 v1.2.1** — corretto un'API inesistente (`text_layer_set_should_cache_layout`, assente in `pebble.h` 4.33.1) in §7.7 e §17.3; Fase 1 avviata con la watchface Galleria (`apps/galleria/PIANO.md`, `docs/design/galleria.md`, ricerca in `docs/ricerca/galleria/`).

- **2026-08-24 v1.2** — Fase 0 eseguita: ambiente installato in user space (uv 0.12.5, Python 3.13.15, pebble-tool 5.0.39, SDK 4.33.1, librerie QEMU dai .deb, wrapper `PEBBLE_QEMU_PATH`, hook `~/.bashrc`); `hello-emery` e `heapprobe` compilati e provati su emulatori emery/flint/gabbro; modello RAM confermato (§3); creati `CLAUDE.md`, `docs/CONTINUA-QUI.md`, `tools/setup-env.sh`, CI, `.gitignore`, `git init` (nessun commit). §14.1 e §15 aggiornate.
- **2026-08-24 v1.1** — applicata la verifica adversariale (3 verificatori: 176 confermate, 15 confutate, 1 incerta) e i 3 gap-filling. Correzioni rispetto ai report: firmware corrente v4.36.0 (non 4.35.0); API `app_launch_button()`/`app_launch_get_quick_launch_action()`; `clock_to_timestamp()` gestisce il DST; `NO_TRACKING` inerte e `~/.pebble-sdk` da non creare; `llms.txt`, pagine `.md` e `pebble-mcp` (PyPI) esistono; VS Code ext v0.0.8 del 15/02/2026; persist 1 MiB da fw 4.9.171 (prima 6 KiB); `MMAP_RESOURCES` solo per risorse di sistema; il tetto Alloy 32 KB era una regressione già risolta (fw 4.21/4.22); SDK Zig community esistente; dimensioni PT2 ufficiali 43,00×36,04×10,90 mm / 33 g; BT "5.3" solo da SiFli. Aggiunti: modello RAM emery (gap-1) con bug `realloc` ≥ 64 KiB; firmware minimo per SDK e popup "Incompatible SDK" (gap-2); touch/RGB/speaker emulati in QEMU, touch via mouse/QMP, nessun accesso BLE da Linux senza telefono (gap-3).
- **2026-08-24 v1.0** — prima stesura da ricerca multi-agente (8 report in `docs/ricerca/`). Ambiente non ancora installato (Fase 0 da fare).

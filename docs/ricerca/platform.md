# Stato della piattaforma Pebble e hardware Pebble Time 2 (agosto 2026)

Data ricerca: 24 agosto 2026. Fonti primarie consultate: blog ufficiale Core Devices (repebble.com/blog), developer.repebble.com (docs SDK, changelog, FAQ, hardware matrix), GitHub `coredevices/*` (PebbleOS, mobileapp, pebble-tool, hardware, nonfree), Zephyr board docs, Rebble blog, PyPI, help center repebble, TechCrunch/Liliputing/9to5Google per conferme.

Legenda: **[CONFERMATO]** = fatto verificato su fonte primaria con URL; **[INFERENZA]** = deduzione ragionata; **[NON CONFERMATO]** = non trovata conferma.

> Attenzione alla omonimia: il nome piattaforma `emery` era già stato assegnato nel 2016 alla Pebble Time 2 originale (STM32F7, mai spedita). Il NUOVO Pebble Time 2 di Core Devices (2025-2026) riusa lo stesso nome `emery` e la stessa risoluzione 200x228, ma è hardware completamente diverso (SoC SiFli SF32LB52J, touch, speaker, RGB backlight). Tutto ciò che segue riguarda il nuovo hardware salvo dove indicato.

---

## 1. Lineup Core Devices e stato spedizioni (agosto 2026)

| Prodotto | Piattaforma SDK | Prezzo | Stato ad agosto 2026 |
|---|---|---|---|
| **Pebble 2 Duo** (ex Core 2 Duo) | `flint` | $149 | Spedito nel 2025 (edizione limitata, ~6.000 unità secondo Wareable). Homepage repebble.com lo mostra **SOLD OUT** (24/8/2026). Batteria portata da 17 a >30 giorni via firmware (luglio 2026). |
| **Pebble Time 2** (ex Core Time 2) | `emery` | $225 | **In stock, spedizione 1-2 giorni lavorativi** in tutti e 4 i colori (Black, Red, Grey, Blue) – help center aggiornato 14/8/2026. Mass production dal 9/3/2026; >23.000 unità prodotte al 14/7/2026 (>80% preordini evasi); >25.000 vendute in 93 paesi (TechCrunch 21/8/2026). |
| **Pebble Round 2** | `gabbro` | $199 | Annunciato 2/1/2026 (CES). ~14.000 preordini; mass production dall'ultima settimana di luglio 2026; completamento spedizioni preordini previsto **fine settembre 2026**. |
| **Pebble Index 01** (smart ring AI) | n/d (non esegue app) | $75 | Mass production dal 24/7/2026; quasi tutti i preordini spediti entro fine agosto, alcune varianti a settembre. |

- **[CONFERMATO]** Nessun altro orologio annunciato oltre a questi tre (nessun "Pebble Time Steel 2" o simili). Fonte: blog index repebble.com/blog (post fino al 24/7/2026) e ericmigi.com.
- **[CONFERMATO]** Slittamento PT2 di ~4 mesi rispetto alla stima originale (dicembre 2025 → prime unità aprile 2026). Motivo: verifica impermeabilità e PVT. Fonte: https://gadgetsandwearables.com/2026/02/23/pebble-time-2-shipping/ (23/2/2026) e https://repebble.com/blog/february-pebble-production-and-software-updates (18/2/2026).
- **[CONFERMATO]** Problemi hardware noti su PT2 (luglio 2026): 330 unità sostituite su 19.000+; principali cause: consumo anomalo, touch panel che non registra/registra male (forse software), 51 vetri crepati (0,25%), 32 problemi ai pulsanti. Fonte: https://repebble.com/blog/pebble-mega-update-july-2026 (14/7/2026).

Fonti:
- https://repebble.com/blog/pebble-mega-update-july-2026 (14/7/2026)
- https://help.repebble.com/en/articles/14892130-shipping-timelines (aggiornato 14/8/2026)
- https://techcrunch.com/2026/08/21/the-225-pebble-time-2-is-a-refreshingly-fun-smartwatch/ (21/8/2026)
- https://9to5google.com/2026/06/09/pebble-round-2-starts-shipping-in-july/ (9/6/2026)
- https://repebble.com/blog/pebble-round-2-the-most-stylish-pebble-ever (2/1/2026)
- https://repebble.com/blog/index-01-is-in-mass-production (24/7/2026)
- https://repebble.com/ (homepage, "Pebble 2 Duo – SOLD OUT", 24/8/2026)
- https://www.wareable.com/smartwatches/pebble-name-trademark-official-duo-time-2-shipping-update (6.000 P2D venduti nel 2025)

---

## 2. Specifiche hardware ESATTE del Pebble Time 2 (nuovo, 2026)

Fonti primarie: hardware matrix ufficiale https://developer.repebble.com/guides/tools-and-resources/hardware-information/ ; scheda board Zephyr https://docs.zephyrproject.org/latest/boards/coredevices/pt2/doc/index.html ; repo hardware https://github.com/coredevices/hardware (cartella "Pebble Time 2 (obelix)", schematici + CAD pubblicati 2/4/2026); blog 24/3/2026 https://repebble.com/blog/pebble-time-2-is-in-mass-production ; annuncio 18/3/2025 https://ericmigi.com/blog/introducing-two-new-pebbleos-watches/ .

### Display **[CONFERMATO]**
- Tecnologia: e-paper a colori **Memory-in-Pixel (MiP)** JDI **LPM015M135A**, always-on, riflettivo (stessa famiglia del Pebble Time Steel), otticamente bonded al vetro frontale piatto (Gorilla Glass / "hardened glass, flat").
- Diagonale **1.5"**, risoluzione **200 x 228 px**, **202 PPI**, **64 colori** (2 bit/canale, `GColor8`), forma rettangolare.
- Retroilluminazione **RGB multicolore** (driver AW2016) – unica piattaforma con `PBL_RGB_BACKLIGHT`.
- Confronto: Pebble Time (basalt) 144x168 @ 1.25"; PT2 ha +93% di pixel sulla stessa famiglia di pannello.

### Touchscreen **[CONFERMATO]**
- Sì: touch capacitivo, controller **CST816D** (driver in `pebbleos-nonfree/cst816`).
- **Le app possono usarlo** (vedi §4: `TouchService`, gesture recognizer). **Le watchface NO** (limite software dichiarato: "Touch input is currently not supported in watchfaces").
- L'utente può disattivarlo in Settings → Display → Touch; le app devono controllare `touch_service_is_enabled()`.
- Dal firmware 4.33 (6/8/2026) la "touch navigation" di sistema (tap/swipe tradotti in eventi pulsante in `MenuLayer`, `ScrollLayer`, `ActionBarLayer`, `ActionMenu`) è **attiva di default**.
- Nota: la recensione TechCrunch (21/8/2026) riporta "no touchscreen": è in contrasto con docs ufficiali, Zephyr board file e note di rilascio; va considerata un errore o riferita a quanto poco l'OS lo usava. Recensione ShaneCraig.Tech (giugno 2026): "ha il touch, ma PebbleOS lo usa poco: tap per accendere la retroilluminazione".

### Pulsanti **[CONFERMATO]**
- 4 pulsanti fisici (Back, Up, Select, Down) in acciaio 316 fresato CNC. Layout identico ai Pebble classici.

### Sensori **[CONFERMATO]** (scheda Zephyr + matrix)
- IMU 6 assi **LSM6DSOW** (accel + gyro) + accelerometro low-power **LIS2DW12**.
- Magnetometro/bussola **MMC5603NJ**.
- Cardiofrequenzimetro ottico **GH3026** (Goodix; driver `gh3x2x` non-free) con **SpO2** e **HRV** (HRV abilitato su obelix dal 6/7/2026; API HRV in SDK 4.33).
- Sensore luce ambientale **W1160**; sensore temperatura on-chip.
- **Nessun barometro** (matrix: "6-axis IMU, Compass"; il barometro BMP390 c'è solo su Pebble 2 Duo).
- Microfoni: **2 microfoni PDM** (il secondo per cancellazione rumore, **non ancora abilitato** a marzo/agosto 2026).
- **Speaker**: sì (amplificatore AW8155BFCR + codec audio integrato SF32LB); API Speaker disponibile alle app da SDK 4.9.169 (1/5/2026).
- Vibrazione: **LRA** (AW86225) invece del vecchio ERM.

### SoC / CPU / memoria **[CONFERMATO]**
- SoC **SiFli SF32LB52J** (variante SF32LB52JUD6 secondo Zephyr). NON è nRF52840 (quello è il Pebble 2 Duo).
- CPU: core applicativo **Star-MC1 (Arm Cortex-M33-like) a 240 MHz** + core low-power a 24 MHz per il Bluetooth (architettura big.LITTLE, fonte CNX Software 14/5/2025).
- RAM: **511 KiB SRAM** (Zephyr) – la famiglia SF32LB52x dichiara ">512 KB SRAM" e fino a 16 MB PSRAM integrata (CNX) **[la PSRAM su PT2 non è confermata]**.
- Flash esterna **GD25Q256E 256 Mbit (32 MB) QSPI NOR**.
- Bluetooth **5.3** (LE) – dato del SoC (CNX Software); PebbleOS usa lo stack NimBLE (aggiornato a 1.10.0 il 14/7/2026). Il firmware ha un bootloader con doppio slot (slot0/slot1) per aggiornamenti A/B.
- PMIC **nPM1300**.
- Bootloader: repo `coredevices/pblboot`. Programmazione via `sftool` / `pblprog-sifli`.
- Nome board firmware: **`obelix`** (varianti obelix_dvt, obelix_pvt nei release asset).

### Limiti per le app (matrix ufficiale) **[CONFERMATO]**
- **Max App Size (code + heap): 128 KB** su Emery e Gabbro (vs 64 KB su Basalt/Chalk/Diorite/Flint, 24 KB su Aplite).
- **Max Resource Size: 256 KB**.
- Limite glifo font aumentato a 512 px su emery/gabbro (SDK 4.9.127).
- Issue #1621 (28/6/2026): su fw 4.17.0 le app Alloy avevano "JS static machine" di 32 KB e ~88 KB di heap app liberi → conferma indirettamente che l'heap app su PT2 è dell'ordine di ~120 KB. Risolto via PR #1655. https://github.com/coredevices/pebbleos/issues/1621
- `persist_get_max_size()` (SDK 4.17) per conoscere il limite di storage persistente per app.

### Batteria, resistenza acqua, corpo
- Batteria: dichiarata ~30 giorni; reale: media 14 giorni a marzo 2026, **mediana ~21 giorni a luglio 2026** (ottimizzazione in corso). Ricarica con dongle magnetico "power only" (nessuna porta smartstrap). **[CONFERMATO]**
- Resistenza acqua: **30 m / 3 ATM** (nuoto ok, no immersioni). **[CONFERMATO]** (blog 24/3/2026; la matrix mostra ancora "TBD (target IPX8)" – dato stale).
- Cassa acciaio 316 con PVD ceramico, fondello a viti (batteria sostituibile), cinturino 22 mm quick release.
- Dimensioni: **40.5 x 37.5 x 10.8 mm**; peso **~32.5 g corpo / ~48 g con cinturino** (heise/pocket-lint, agosto 2025) **[medium – da verificare sul PDF "Pebble 2 Duo and Pebble Time 2 - dimensions.PDF" nel repo hardware]**.

### Pebble 2 Duo (riferimento secondario) **[CONFERMATO]**
- SoC **Nordic nRF52840** (Cortex-M4F 64 MHz, **256 KiB RAM**, 1 MiB flash interna + QSPI NOR GD25LE255E 256 Mbit). Board firmware `asterix`.
- Display Sharp **LS013B7DH05** 1.26" **144x168 B/N**, **no touch**, retroilluminazione bianca.
- Sensori: IMU LSM6DSOW, magnetometro MMC5603NJ, **barometro BMP390**, ALS OPT3001; **nessun HRM**; 1 microfono PDM + **speaker** (codec DA7212); LRA (DRV2604).
- Max App Size **64 KB**, resource 256 KB. Batteria ~30 giorni. Resistenza acqua 20 m (matrix). Policarbonato. Scheda: https://docs.zephyrproject.org/latest/boards/coredevices/p2d/doc/index.html

### Pebble Round 2 (per completezza)
- Stesso SoC SF32LB52J e progetto elettrico del PT2; display Sharp LS013B7DD02 1.3" **260x260** 64 colori, touch, **no HRM, no speaker**, backlight bianca, IMU 3 assi + bussola, 2 mic, ~14 giorni, 8.1 mm, 30 m target. Max App Size 128 KB.

---

## 3. Identificatore piattaforma SDK e `targetPlatforms`

**[CONFERMATO]** Mappa ufficiale (FAQ + hardware matrix + guida "Building for Every Pebble"):

| Piattaforma | Orologio | Macro compile-time | `PlatformType` |
|---|---|---|---|
| `aplite` | Pebble / Steel | `PBL_PLATFORM_APLITE` | `PlatformTypeAplite` |
| `basalt` | Pebble Time / Time Steel | `PBL_PLATFORM_BASALT` | `PlatformTypeBasalt` |
| `chalk` | Pebble Time Round | `PBL_PLATFORM_CHALK` | `PlatformTypeChalk` |
| `diorite` | **Pebble 2 (2016)** | `PBL_PLATFORM_DIORITE` | `PlatformTypeDiorite` |
| **`flint`** | **Pebble 2 Duo (2025)** | `PBL_PLATFORM_FLINT` | `PlatformTypeFlint` |
| **`emery`** | **Pebble Time 2 (2026)** | `PBL_PLATFORM_EMERY` | `PlatformTypeEmery` |
| **`gabbro`** | **Pebble Round 2 (2026)** | `PBL_PLATFORM_GABBRO` | `PlatformTypeGabbro` |

- Quindi: **PT2 → `emery`** (sì, il nome del 2016 è stato riusato); **Pebble 2 Duo → `flint`, NON `diorite`** (diorite resta il Pebble 2 originale, senza speaker e con 64 KB).
- `package.json`: `"targetPlatforms": ["emery", "flint"]` per il tuo caso (aggiungi `"gabbro"` se vuoi coprire il Round 2; `"basalt"`, `"diorite"` ecc. per i vecchi). Le risorse possono avere `targetPlatforms` per-risorsa e suffissi `~color`/`~bw`/`~rect`/`~round` (es. `img~color.png`).
- Emulatore: `pebble install --emulator emery` / `flint` / `gabbro` (immagini QEMU `qemu_emery`, `qemu_flint`, `qemu_gabbro` pubblicate con ogni release firmware, introdotte in SDK 4.9.169).
- Macro capability: `PBL_COLOR`/`PBL_BW`, `PBL_RECT`/`PBL_ROUND`, `PBL_DISPLAY_WIDTH`/`PBL_DISPLAY_HEIGHT`, `PBL_TOUCH`, `PBL_SPEAKER`, `PBL_RGB_BACKLIGHT`, `PBL_MICROPHONE`, `PBL_HEALTH`, `PBL_COMPASS`, `PBL_SMARTSTRAP`; helper `PBL_IF_COLOR_ELSE()`, `PBL_IF_RECT_ELSE()`, `PBL_IF_MICROPHONE_ELSE()`, `PBL_PLATFORM_SWITCH()`, `PBL_PLATFORM_SWITCH_DEFAULT()`, `PBL_API_EXISTS(fn)`; runtime `watch_info_get_model()`, `Pebble.getActiveWatchInfo()` in PebbleKit JS.
- Compatibilità legacy: dal fw 4.9.127 le app compilate per piattaforme più piccole (basalt/diorite) **girano in scaling** su emery/gabbro; l'appstore le mostra ma "beneficiano di ottimizzazione". Le app vecchie per `aplite` (24 KB) e le Rocky.js NON sono più supportate (JerryScript rimosso in 4.9.148).

Fonti: https://developer.repebble.com/faqs/ ; https://developer.repebble.com/guides/best-practices/building-for-every-pebble/ ; https://developer.repebble.com/docs/c/Foundation/Platform/ ; https://developer.repebble.com/sdk/changelogs/4.9.127/ (20/2/2026).

---

## 4. PebbleOS: open source, licenza, versioni, nuove API

### Repository e licenza **[CONFERMATO]**
- Repo attivo: **https://github.com/coredevices/PebbleOS** – licenza **Apache-2.0**, 1.345 stelle, ultimo push 24/8/2026. `google/pebble` è la release originale (gennaio 2025); lo sviluppo vive nel fork Core Devices.
- Componenti non-Apache separati in **https://github.com/coredevices/pebbleos-nonfree**: `as7000`, `cst816` (touch), `gh3x2x` (HRM), `npm1300`, `sf32lb52` (HAL/blob SiFli). Il firmware si compila senza (perdendo HRM ecc.).
- Board in-tree: `asterix` (Pebble 2 Duo), `obelix` (Pebble Time 2), `getafix` (Pebble Round 2), `qemu_emery`, `qemu_flint`, `qemu_gabbro`; SoC tree: `nrf`, `sf32lb`, `qemu`. RTOS: FreeRTOS (repo `coredevices/FreeRTOS-Kernel`); libc: **picolibc** dal 22/7/2026; BLE: NimBLE 1.10.0; Mbed TLS 3.6.7. Esiste anche un fork `coredevices/zephyr` (usato per i board file Zephyr, non per PebbleOS) **[INFERENZA]**.
- Docs firmware: https://pebbleos-core.readthedocs.io/ ; hardware aperto: https://github.com/coredevices/hardware (P2D KiCad da nov 2025; PT2 schematici + CAD da 2/4/2026).
- App mobile open source: https://github.com/coredevices/mobileapp (GPL-3.0 + licenza commerciale, eccezione MPL-2.0 per App Store).

### Numerazione versioni nel 2026 **[CONFERMATO da tag GitHub]**
- Fino a maggio 2026: linea **4.9.x** (4.9.127 → 20/2/2026; 4.9.148 → 26/3/2026; 4.9.169 → 1/5/2026; 4.9.184 → 29/5/2026).
- Dal **2/6/2026** nuovo schema **4.MINOR.PATCH** con un minor ogni pochi giorni: v4.10.0 (2/6), v4.17.0 (19/6), v4.20.0 (30/6), v4.30.0 (20/7), v4.32.0 (29/7), v4.33.0 (6/8), v4.33.2 (14/8), v4.34.0 (17/8), **v4.35.0 (19/8/2026, latest)**. Rami di manutenzione paralleli: 4.9.142.x (luglio), 4.27.1 (13/8).
- Le **release GitHub non hanno note** (body vuoto, solo asset firmware per asterix/obelix/getafix + immagini QEMU + `.pbz`). Le note utili per sviluppatori sono nei **changelog SDK**: https://developer.repebble.com/sdk/changelogs/<versione>/ (es. `4.9.169`, `4.17`, `4.33`, `4.33.1`).
- **L'SDK ora segue il numero del firmware**: SDK 4.17 (23/6/2026), SDK 4.33 (12/8/2026), SDK 4.33.1 (14/8/2026, ultimo alla data). Regola: "Apps built with SDK 4.33 require firmware 4.32 or later; older apps remain compatible with new firmware".
- File `SDK_VERSION` = 0.1.8 e repo `coredevices/PebbleOS-SDK` v0.1.8 (18/8/2026): è il nuovo packaging dell'SDK generato in-tree **[INFERENZA: in transizione; pebble-tool scarica ancora gli SDK "4.x" da `pebble sdk install`]**.

### Nuove API per sviluppatori (post open-source) **[CONFERMATO]**

**Touch (emery, gabbro) – SDK 4.9.169 (1/5/2026) + 4.33 (12/8/2026)**
- `touch_service_is_enabled()`, `touch_service_subscribe(TouchServiceHandler handler, void *context)`, `touch_service_unsubscribe()`.
- `TouchEvent { type, x, y, non_navigational }`; `TouchEventType`: `TouchEvent_Touchdown`, `TouchEvent_PositionUpdate`, `TouchEvent_Liftoff`.
- Gesture recognizer (4.33): `tap_recognizer_create()`, `pan_recognizer_create(axis)`, `swipe_recognizer_create()`, `window_attach_recognizer()`, `tap_recognizer_get_tap_point()`, `pan_recognizer_get_total_delta()`, `pan_recognizer_get_velocity()`, `swipe_recognizer_get_direction()`, `recognizer_set_simultaneous_with()`, `recognizer_set_fail_after()`, `recognizer_destroy()`; eventi `RecognizerEvent_Started/Updated/Completed/Cancelled`.
- Touch navigation: `app_touch_navigation_enable(bool)`, `window_set_touch_bridge_disabled(window, bool)`; richiede fw ≥ 4.32 (default on da 4.33; crash fix in 4.33.2).
- Solo watchapp; gating `#if defined(PBL_TOUCH)`. Il touch attivo consuma corrente: subscribe/unsubscribe solo quando serve. Esempio: https://github.com/coredevices/example-apps/tree/main/touch-thing . Guida: https://developer.repebble.com/guides/events-and-services/touch/

**Speaker (emery, flint) – SDK 4.9.169 + 4.17**
- `speaker_play_tone()`, `speaker_play_notes()`, `speaker_play_tracks()`, `speaker_stream_open()/write()/close()`, `speaker_stop()`, `speaker_set_volume(0-100)`, `speaker_get_status()`, `speaker_set_finish_callback()`, `speaker_is_muted()` (4.17).
- Tipi: `SpeakerNote` (MIDI 0-127, waveform, durata ≤ 10000 ms, velocity), `SpeakerSample`, `SpeakerTrack`; `SpeakerWaveform` Sine/Square/Triangle/Sawtooth; `SpeakerPcmFormat` 8/16 kHz × 8/16-bit mono; costanti `SPEAKER_MAX_NOTES`=256, `SPEAKER_MAX_TRACKS`=4, `SPEAKER_MAX_SAMPLE_BYTES_TOTAL`=16 KiB.
- Gating `PBL_SPEAKER`; le funzioni ritornano `false` su piattaforme senza speaker. Doc: https://developer.repebble.com/docs/c/User_Interface/Speaker/

**RGB backlight (solo emery) – SDK 4.9.169**
- `light_set_color(GColor)`, `light_set_color_rgb888(0x00RRGGBB)`, `light_set_system_color()`, più i classici `light_enable_interaction()`, `light_enable()`, `light_is_on()`; macro `PBL_RGB_BACKLIGHT`; no-op altrove; reset automatico all'uscita/preemption. Backlight service con callback (4.17). Doc: https://developer.repebble.com/docs/c/User_Interface/Light/

**Quick launch / launch reason – SDK 4.17 (fw 4.9.148 per Back+Up combo)**
- `launch_button()`, `launch_get_quick_launch_action()` → `APP_QUICK_LAUNCH_ACTION_NONE/HOLD/TAP/COMBO`; `launch_reason()` con `APP_LAUNCH_QUICK_LAUNCH`, ecc. Doc: https://developer.repebble.com/docs/c/Foundation/Launch_Reason/

**Health – SDK 4.9.127 / 4.33**
- SpO2 nel HRM manager; HRV: `HealthEventHRVUpdate`, `health_service_peek_hrv_ppi_ms()`, `health_service_set_hrv_sample_period()`.

**Altro**
- `persist_get_max_size()` (4.17); `alarm_service_peek_next()` (4.33); `AppGlanceSliceLayout`, `rot_bitmap_layer_get_layer()` (4.9.169); font `RESOURCE_ID_LECO_60_NUMBERS_AM_PM` (4.9.148); rendering QR code, testo arabo/RTL ed ebraico, pattern vibrazione custom (4.9.127/148); Emery layout dedicati per alarm/calendar/workout.
- Firmware agosto 2026 (commit): album art nell'app Musica (solo emery/gabbro), immagini nelle notifiche, nuova app Meteo completa (round + rect, weather DB v4), fling inerziale su `MenuLayer`/`ScrollLayer` da touch, `-fdata-sections` per il firmware, SDK che rispetta `MAX_APP_BINARY_SIZE` per piattaforma (1/8/2026).
- **Alloy** (JavaScript on-watch via Moddable XS): preview in SDK 4.9.127 (20/2/2026) → stabile in 4.9.148 → Moddable 8.2.3 (SDK 4.17) → **Moddable 8.3.1 / XS 17.8 (SDK 4.33)**; FFI verso C; debugger xsbug con `pebble build --debug`; moduli `pebble/health`, `pebble/button`, dictation, wakeup, vibration; UI Piu (dichiarativa) o Poco (procedurale). **Solo emery e gabbro**. Supporta watchface (`"watchface": true`). Guida: https://developer.repebble.com/guides/alloy/
- **Timeline local pins** (PebbleKit JS con la nuova app): `Pebble.insertTimelinePin()`, `Pebble.deleteTimelinePin()` – senza token né internet; non supportano `actions`/`createNotification`/colori. https://developer.repebble.com/guides/pebble-timeline/timeline-local-pins/

### Cosa NON c'è ancora **[CONFERMATO]**
- Nessuna API microfono raw per le app (solo dictation) – "microphone API" è nella lista community/roadmap.
- Nessun touch nelle watchface.
- Secondo microfono (ENC) non attivo.
- BLE "multiple clients"/HRM via BLE in roadmap community.

---

## 5. App companion mobile (2026)

**[CONFERMATO]**
- App ufficiale "Pebble" di Core Devices (nome store iOS "Pebble Core", id `6743771967`; Android package `coredevices.coreapp`). Kotlin Multiplatform + Compose; open source https://github.com/coredevices/mobileapp ; ultimo tag **1.10.0.2 (19/8/2026)**. Supporta **tutti** i Pebble (vecchi e nuovi) e Index 01.
- **Developer connection sì**: Settings → Developer Mode → Developer Connection (LAN) → nota "Server IP" → `pebble install --phone <IP>` (anche `pebble logs --phone <IP>`, `pebble screenshot`). Serve abilitare **sia** "LAN developer" nelle impostazioni **sia** "Dev Connect" sul singolo dispositivo (Devices → ⋯ → Enable Dev Connect), altrimenti "connection refused" (forum Rebble, dic. 2025).
- **Cloud dev connection**: per CloudPebble (https://cloudpebble.repebble.com) e per `pebble install --cloudpebble` dopo `pebble login`; dalla versione app 1.0.11.15 usa il login account Pebble (prima GitHub) – tweet di Eric Migicovsky 2026 **[medium]**.
- Sideload `.pbw`: apri il file con l'app (o `pebble install --phone`); su iOS esiste anche `pebble-dev/rebble-sideloader`.
- **PebbleKit JS**: su Android gira in un Chromium WebView (DOM completo); **su iOS gira in JavaScriptCore "nudo": niente `document`, `DOMParser`, `fetch`** (usa `XMLHttpRequest`). Fonte: README https://github.com/coredevices/pebble-browser-app (agosto 2026). Importante per codice companion portabile.
- Appstore nativo dentro l'app dalla v1.0.11.1 (feb 2026); web: https://apps.repebble.com ; filtro "open source".
- Rapporto con **Rebble Web Services**: accordo 9/10/2025 – **RWS è l'unico backend dell'appstore** per entrambi gli store; Core paga Rebble; **nessun abbonamento Rebble necessario** per usare l'appstore sui Core watch. Meteo: Core instrada l'API meteo legacy via **Open-Meteo** (feb 2026) e ha una nuova app Meteo on-watch (fw 4.3x). Dettatura: Core usa una propria "voice recognition API" (componente proprietario, nov 2025). Timeline: sync gestito dall'app Core; supportati pin locali. Fonti: https://ericmigi.com/blog/re-introducing-the-pebble-appstore/ ; https://rebble.io/2025/10/09/rebbles-in-a-world-with-core.html ; https://gadgetsandwearables.com/2025/11/24/pebble-open-source/ .
- Alternative community: Rebble **microPebble** (Android; PoC iOS 22/1/2026), **Cobble**, assistente **Bobby** (richiede abbonamento Rebble ~$3/mese che copre dettatura/meteo/timeline 30 min sui servizi Rebble). https://gadgetsandwearables.com/2026/01/22/micropebble/
- Limiti iOS (recensione TechCrunch 21/8/2026): niente azioni/risposte alle notifiche e molte integrazioni; sveglie da impostare sull'orologio. In roadmap: passaggio a "reverse PPoGATT" completo per usare AccessorySetupKit e il **Notification Forwarding iOS 26.3/26.5 (solo UE, DMA)**.

---

## 6. Distribuzione app **[CONFERMATO]**

- Store: **Pebble Appstore** (apps.repebble.com + in-app), backend Rebble; le app caricate sul **Rebble Developer Portal** (https://dev-portal.rebble.io) appaiono in entrambi gli store.
- Da SDK 4.9.148 (marzo/aprile 2026): **`pebble publish`** dalla CLI, con generazione automatica di screenshot/GIF per tutte le piattaforme target.
- Numeri: >2.120 app/watchface create per PT2/PR2 al 14/7/2026; >10.000 legacy; contest "Spring 2026" (25 orologi in premio, 2-19/4/2026). Fonti: https://repebble.com/blog/spring-2026-pebble-app-contest (2/4/2026); https://repebble.com/blog/pebble-mega-update-july-2026 .
- Skill Claude Code ufficiale per watchface: https://github.com/coredevices/pebble-watchface-agent-skill (target di default: emery 200x228).

---

## 7. Roadmap 2026 rilevante per sviluppatori (blog 14/7 e 24/7/2026) **[CONFERMATO]**

- Send text (Android), Find my phone, nuova app Meteo PT2/PR2 (già nei commit di agosto), ritocchi UI Round 2, UI app mobile, **editor watchface WYSIWYG**, transizione reverse PPoGATT → notifiche iOS UE, **sistema plugin** per l'app mobile, servizi cloud opzionali in TEE.
- Community/backlog: HRV (fatto in 4.33), SpO2, HRM via BLE, **microphone API**, multiple BLE clients.
- Hardware pendenti: secondo microfono, ottimizzazione batteria verso 30 giorni.

---

## 8. Implicazioni per l'ambiente Linux senza sudo (Python 3.14, Node 22, gcc 15, no Docker/QEMU)

**[CONFERMATO]**
- **pebble-tool 5.0.39** su PyPI (30/6/2026), `requires_python >=3.10`; docs ufficiali: `uv tool install pebble-tool --python 3.13` (i setup verificati usano 3.13, non 3.14). SDK 4.17 richiede pebble-tool ≥ 5.0.38; 4.9.169 ≥ 5.0.32.
- `pebble sdk install latest` scarica **toolchain arm-none-eabi e QEMU precompilati in `~/.pebble-sdk`** → **non serve sudo né arm-none-eabi-gcc di sistema**. Versione SDK attuale sul sito: **4.33.1**. `pebble sdk list` / `pebble sdk activate <ver>` / `pebble sdk uninstall <ver>`.
- Dipendenze runtime QEMU (Ubuntu): `libsdl2-2.0-0 libglib2.0-0(t64) libpixman-1-0 zlib1g libsndio7.0 libpng16-16(t64)` – su Ubuntu 26.04 senza sudo vanno verificate (probabilmente già presenti come librerie di sistema, altrimenti estraibili da .deb in user space) **[NON CONFERMATO per 26.04]**.
- Host senza IPv6: pypkjs può dare "connection refused"; patch in https://github.com/ArtRichards/pebble-time2-dev-setup (verificato 12/7/2026 con pebble-tool 5.0.39 + SDK 4.17).
- Alternativa zero-install: **CloudPebble** (cloudpebble.repebble.com) con emulatore emery in browser e install sull'orologio via cloud dev connection.

---

## 9. Azioni consigliate

1. **Target**: `"targetPlatforms": ["emery", "flint"]` (+ `"gabbro"` se vuoi il Round 2 quasi gratis: stesso SoC, 128 KB, touch). Non usare `diorite` per il Pebble 2 Duo.
2. **Installazione**: `uv` in `~/.local/bin` → `uv tool install pebble-tool --python 3.13` → `pebble sdk install latest` (4.33.1) → `pebble new-project myface && pebble build && pebble install --emulator emery`. Evita Python 3.14 per pebble-tool/pypkjs. Se QEMU fallisce per librerie mancanti, ripiega su CloudPebble.
3. **Firmware minimo**: se usi API touch navigation/recognizer compila con SDK ≥ 4.33 e dichiara che serve fw ≥ 4.32; per Speaker/RGB basta SDK ≥ 4.9.169. Aggiorna l'orologio (gli update escono "every few weeks", ora anche più spesso).
4. **Sfrutta il display PT2**: 200x228 @ 64 colori con `PBL_DISPLAY_WIDTH/HEIGHT`, risorse `~color`, font fino a 512 px; usa `layer_get_unobstructed_bounds()` per Quick View; PDC/vettoriali per pesare poco in flash (limite risorse 256 KB).
5. **Touch**: usalo solo nelle watchapp (`#if defined(PBL_TOUCH)` + `touch_service_is_enabled()`), preferisci i recognizer (`tap/pan/swipe_recognizer_create`) alla gestione raw, e disiscriviti quando la finestra non è visibile per risparmiare batteria. Per le watchface pianifica solo pulsanti/accelerometro (tap gesture) finché non arriverà il supporto.
6. **Offline-first**: tutta la logica sull'orologio (C o Alloy), stato in `persist_*` (controlla `persist_get_max_size()`), dati dal telefono via AppMessage con cache locale; i pin timeline locali (`Pebble.insertTimelinePin`) funzionano senza token ma richiedono che il JS del telefono giri. Non contare su `fetch`/DOM nel PebbleKit JS su iOS.
7. **Memoria**: budget 128 KB (code + heap) su emery, 64 KB su flint → misura con `heap_bytes_free()`; per Alloy tieni conto della "JS static machine" (32 KB) e del runtime XS; per app minime e veloci preferisci C.
8. **RGB backlight e speaker**: differenziatori PT2 (`light_set_color_rgb888`, `speaker_play_notes`) ma costosi in energia: usali per feedback brevi, no PCM streaming continuo.
9. **Pubblicazione**: `pebble publish` (o dev-portal.rebble.io); marca l'app open source per il filtro store.
10. **Monitoraggio**: segui https://developer.repebble.com/sdk/changelogs/ (non le release GitHub, prive di note) e il blog repebble.com; controlla `git log` di coredevices/PebbleOS per feature in arrivo (es. album art, weather DB v4).

---

## 10. Domande aperte

- Presenza/uso della PSRAM (fino a 16 MB) del SF32LB52J sul PT2 e se una parte sia mai esposta alle app (oggi il limite app dichiarato è 128 KB).
- Dimensioni/peso ufficiali PT2 (fonte terza; il PDF nel repo hardware non è stato letto).
- Se e quando il touch arriverà alle watchface.
- Disponibilità delle librerie QEMU (SDL2, pixman, sndio, libpng) su Ubuntu 26.04 senza sudo.
- Compatibilità pebble-tool/pypkjs con Python 3.14 (docs e setup verificati usano 3.13).
- Ruolo del nuovo packaging `PebbleOS-SDK` v0.1.x rispetto agli SDK "4.x" scaricati da pebble-tool.
- Data esatta e dettagli della modifica "Dev Connect via account Pebble" (app 1.0.11.15) – fonte solo social.
- Restock del Pebble 2 Duo (oggi SOLD OUT) – nessuna dichiarazione ufficiale trovata.

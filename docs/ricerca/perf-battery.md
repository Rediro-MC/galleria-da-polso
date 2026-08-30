# Performance e consumo batteria su Pebble Time 2 / Pebble 2 Duo (Core Devices)

**Data ricerca: 24 agosto 2026.** Tutte le informazioni sono verificate su fonti primarie (documentazione ufficiale
`developer.repebble.com`, blog Core Devices `repebble.com/blog`, sorgenti `github.com/coredevices/PebbleOS`,
tarball reale dell'SDK `sdk-core 4.33.1` scaricato e ispezionato). Dove non ho potuto confermare, è indicato
esplicitamente come *inferenza* o *da verificare*.

> **AVVERTENZA IMPORTANTE — errore di premessa da correggere subito.**
> Il **Pebble Time 2 NON usa un nRF52840**. Quello è il chip del **Pebble 2 Duo**.
> Il Pebble Time 2 usa un **SiFli SF32LB52J** (dual Cortex-M33 "Star-MC1", core HP a **240 MHz**).
> Questo cambia radicalmente le conclusioni su performance: il PT2 è **più veloce** del vecchio Pebble Time,
> non più lento. È il Pebble 2 Duo ad essere più lento del Pebble Time originale.

---

## 0. Sintesi esecutiva (TL;DR)

| Cosa | Pebble Time (basalt, 2015) | Pebble 2 Duo (flint, 2025) | **Pebble Time 2 (emery, 2026)** |
|---|---|---|---|
| SoC | STM32F411 | Nordic nRF52840 | **SiFli SF32LB52J** |
| Core | Cortex-M4 @ 100 MHz | Cortex-M4F @ 64 MHz | **Star-MC1 (Cortex-M33-like) @ 240 MHz** |
| CoreMark (dato del produttore) | 339 | 215 | **984** |
| DMIPS | 125 | ~80 (0,95 DMIPS/MHz × 64) | **370** |
| SRAM totale gestita da PebbleOS | — | 256 KiB (`0x3FF00`) | **512 KiB (`0x7FC00`)** |
| RAM segmento app (nativo) | 67 584 B | 67 584 B | **135 168 B** |
| Budget RAM app dichiarato dall'SDK | 64 KiB | 64 KiB | **128 KiB** |
| Display | 144×168, 64 colori | 144×168, B/N | **200×228, 64 colori, MiP JDI LPM015M135A** |
| Refresh pannello | — | — | **30 Hz (spec)** |
| Framebuffer | 144×168×1 B = 24 192 B | 144×168 / 8 = 3 024 B | **200×228×1 B = 45 600 B (~44,5 KB)** |
| Autonomia dichiarata | ~7 gg | **~30 gg** | **~30 gg** |
| Autonomia mediana reale (Core Devices, lug 2026) | — | **>30 gg** | **~21 gg** |

**I 5 fatti che cambiano il modo in cui scrivi il codice:**

1. **L'SDK compila tutte le app con `-mcpu=cortex-m3 -Os`, senza FPU e senza LTO** — anche su emery.
   Nessuna app di terze parti usa la FPU hardware, mai. Il floating point è emulato via software (libgcc).
2. Su emery il **budget RAM dell'app è 128 KiB**, ma l'**immagine statica (code+data+bss) è limitata a 65 535 byte**
   perché `load_size`/`virtual_size` in `PebbleProcessInfo` sono `uint16_t`. Lo spazio oltre i 64 KiB nel binario
   serve solo alla tabella di rilocazione.
3. Il driver display invia **solo la banda di righe "sporche"** (`y0..y1`, bounding box unico). Se sporchi una
   riga in alto e una in basso, spedisci **tutto lo schermo**.
4. Durante il trasferimento del frame PebbleOS **blocca il deep-WFI** (`soc_sf32lb_sleep_block(SOC_SF32LB_DEEPWFI)`).
   Ogni redraw è tempo in cui la CPU non può dormire profondamente.
5. Core Devices, luglio 2026: *"The biggest consumers of power are **backlight**, **watchfaces with a lot of
   animations** and **health tracking**"*. In quest'ordine.

---

## 1. Hardware: CPU nuova vs vecchia

### 1.1 Tabella ufficiale delle piattaforme

Fonte primaria: <https://developer.repebble.com/guides/tools-and-resources/hardware-information/> (consultata 24/08/2026).
Tabella estratta letteralmente (con gli span di colonna risolti):

| | Aplite | Basalt | Chalk | Diorite | **Flint** | **Emery** | **Gabbro** |
|---|---|---|---|---|---|---|---|
| Modello | Classic/Steel | Time/Time Steel | Time Round | Pebble 2 | **Pebble 2 Duo** | **Pebble Time 2** | **Pebble Round 2** |
| SOC | STM32F205RE | STM32F411 | STM32F411 | STM32F411 | **Nordic nRF52840** | **SiFli SF32LB52J** | SiFli SF32LB52J |
| CPU | Cortex-M3 64 MHz | Cortex-M4 100 MHz | Cortex-M4 100 MHz | Cortex-M4 100 MHz | **Cortex-M4 64 MHz** | **Star-MC1 (Cortex-M33-like) 240 MHz** | Star-MC1 240 MHz |
| Max Resource Size | 96k | 256k | 256k | 256k | 256k | **256k** | 256k |
| Max App Size (code+heap) | 24k | 64k | 64k | 64k | **64k** | **128k** | 128k |
| Risoluzione | 144×168 | 144×168 | 180×180 | 144×168 | **144×168** | **200×228** | 260×260 |
| PPI | 175 | 175 | 182 | 175 | **175** | **202** | 200 |
| Colori | 2 (B/W) | 64 | 64 | 2 (B/W) | **2 (B/W)** | **64** | 64 |
| Pannello | Sharp LS013B7DH05 | JDI | JDI | Sharp LS013B7DH05 | **Sharp LS013B7DH05** | **JDI LPM015M135A** | Sharp LS013B7DD02 |
| Touch | No | No | No | No | **No** | **Sì** | Sì |
| Retroilluminazione | White LED | White LED | White LED | White LED | **White LED** | **Multicolor RGB LED** | White LED |
| HRM | No | No | No | Sì | **No** | **Sì** | No |
| Speaker | No | No | No | No | **Sì** | **Sì** | No |
| Sensori | Accel+Compass | Accel+Compass | Accel+Compass | Accel | **6-axis IMU, Compass, Barometer** | **6-axis IMU, Compass** | 3-axis IMU, Compass |
| Vibrazione | ERM | ERM | ERM | ERM | **LRA** | **LRA** | LRA |
| Batteria dichiarata | ~7 gg | ~7/~10 gg | ~2 gg | ~7 gg | **~30 gg** | **~30 gg** | ~14 gg |

Nota: la tabella HTML usa `colspan`, quindi "~30 days" copre **sia Flint sia Emery**; "~14 days" è Gabbro
(coerente con l'annuncio "two-week battery life" del Pebble Round 2).

### 1.2 Dettagli SoC — Pebble Time 2 (emery / board `obelix`)

- **SiFli SF32LB52J** (package `SF32LB52JUD6`), architettura big.LITTLE:
  - **HCPU** Cortex-M33 (Star-MC1) @ **240 MHz**, 512 KB SRAM, **370 DMIPS / 984 CoreMark**
  - **LCPU** Cortex-M33 @ 24 MHz, 64 KB SRAM, gestisce il Bluetooth 5.3
  - GPU **ePicaso 2.0** (rotazione/scala/mirror HW fino a 512×512) e acceleratore **eZIP 2.0**
  - Consumi del chip: **2 µA in sleep**, **~50 µA in BLE connesso**
  - Fonte: <https://www.cnx-software.com/2025/05/14/sifli-sf32lb52j-big-little-arm-cortex-m33-bluetooth-mcu-powers-the-core-time-2-smartwatch/> (14/05/2025)
- Frequenza confermata nel firmware: `#define HCPU_FREQ_MHZ 240` in
  `soc/sf32lb/sf32lb52x/init.c` → <https://github.com/coredevices/PebbleOS/blob/main/soc/sf32lb/sf32lb52x/init.c>
- **La PSRAM esterna è disattivata**: `init.c` spegne l'LDO 1V8 e mette tutti i pin PSRAM in analogico
  ("low-power"). Quindi la RAM disponibile è **solo la SRAM interna** (512 KiB, ultimo KiB riservato all'IPC LCPU:
  `CONFIG_SRAM_SIZE default 0x7fc00`).
- **Flash**: 32 MiB QSPI NOR esterna (**GD25Q256E**) mappata in memoria via MPI a `0x12000000`. Layout:
  64 KiB partition table, 64 KiB bootloader, **2 slot firmware da 3 MiB**, **2 aree risorse da 2 MiB**, 576 KiB PRF.
  Fonte: `soc/sf32lb/Kconfig.defconfig`.
- **`CONFIG_MMAP_RESOURCES=y`** sul SF32LB52 → le risorse sono **eseguite/lette direttamente da flash mappata**
  (XIP), non copiate in RAM. Ottima notizia per la memoria delle app su PT2.
- Sensori (da `boards/obelix/defconfig` e dalla board Zephyr `pt2`): IMU **LSM6DSOW**, accelerometro low-power
  **LIS2DW12**, magnetometro **MMC5603NJ**, HRM **GH3026/GH3x2x** (con HRV abilitato: `CONFIG_HRM_HRV=y`),
  sensore luce ambientale **W1160** *sotto il display*, touch **CST816D**, backlight RGB **AW2016**,
  vibrazione LRA **AW86225**, PMIC **nPM1300**.

### 1.3 Dettagli SoC — Pebble 2 Duo (flint / board `asterix`)

- **nRF52840**: Cortex-M4F @ 64 MHz, **215 CoreMark**, **90 CoreMark/mA**, 39 µA/MHz da flash, 30 µA/MHz da RAM.
- 1 MiB flash interna (bootloader nei primi 32 KiB), **256 KiB SRAM** (`CONFIG_SRAM_SIZE 0x3ff00`), più flash
  esterna **GD25LQ255E**.
- `CONFIG_SCREEN_COLOR_DEPTH_BITS_1=y` → framebuffer 1 bpp.
- **Niente Moddable XS**: `HAS_MODDABLE_XS` è `True` solo per emery e gabbro → **Alloy (JS) non gira su Pebble 2 Duo**.

### 1.4 Implicazioni prestazionali reali

- **Emery vs Basalt: ~2,9× in CoreMark** (984 vs 339). Emery vs Flint: **~4,6×**.
- **MA**: l'SDK compila le app per **Cortex-M3**, quindi:
  - nessuna istruzione DSP/SIMD del M4/M33 (`SMLAL`, `QADD`, …)
  - **nessuna FPU** → `float`/`double` = routine software `__aeabi_fadd`, `__aeabi_fmul`, …
  - `SDIV`/`UDIV` hardware sì (presenti già sul M3)
  - il guadagno reale è quindi dovuto quasi solo alla **frequenza di clock** e al fetch da flash mappata con cache
- Non esistono benchmark pubblici comparativi di app Pebble su emery vs basalt: **non ne ho trovati** (vedi
  "Domande aperte").

---

## 2. Budget di memoria — numeri esatti

Fonte primaria: `pebble/common/tools/pebble_sdk_platform.py` dentro `sdk-core 4.33.1`
(scaricato da `https://sdk.repebble.com/releases/4.33.1/sdk-core.tar.gz`) e `Kconfig` di PebbleOS.

| Costante | emery (PT2) | flint (P2D) | gabbro (PR2) | basalt |
|---|---|---|---|---|
| `MAX_APP_BINARY_SIZE` | `0x20000` = **128 KiB** | `0x10000` = 64 KiB | 128 KiB | 64 KiB |
| `MAX_APP_MEMORY_SIZE` | `0x20000` = **128 KiB** | 64 KiB | 128 KiB | 64 KiB |
| `MAX_WORKER_MEMORY_SIZE` | `0x2800` = **10 KiB** | 10 KiB | 10 KiB | 10 KiB |
| `MAX_RESOURCES_SIZE_APPSTORE` | `0x40000` = **256 KiB** | 256 KiB | 256 KiB | 256 KiB |
| `MAX_RESOURCES_SIZE` | `0x100000` = **1024 KiB** | 1024 KiB | 1024 KiB | 1024 KiB |
| `MAX_FONT_GLYPH_SIZE` | **512** | 256 | 512 | 256 |
| `HAS_MODDABLE_XS` | **True** | assente | True | assente |

Lato firmware (`Kconfig` di PebbleOS, radice del repo):

```
CONFIG_APP_RAM_EMERY_SEGMENT_SIZE   = 135168   # 132 KiB: stack + text + data + bss + heap dell'app
CONFIG_APP_RAM_EMERY_RUNTIME_SIZE   =  63488   # 62 KiB: AppState lato kernel (incl. framebuffer app)
CONFIG_APP_RAM_FLINT_SEGMENT_SIZE   =  67584   # 66 KiB
CONFIG_APP_RAM_FLINT_RUNTIME_SIZE   =  30720
CONFIG_APP_RAM_GABBRO_SEGMENT_SIZE  = 135168
CONFIG_APP_RAM_GABBRO_RUNTIME_SIZE  =  96256
# "emery and gabbro use a 4 KiB app stack (APP_STACK_NORMAL_SIZE); their segment is sized 2 KiB
#  larger to compensate. All other platforms keep the 2 KiB stack."
# "The worker always gets 12k of RAM." (PBL_WORKER_RAM_SIZE, src/fw/linker/memory.ld)
```

**Vincolo nascosto importante** (SDK 4.33 changelog + commit del 03/08/2026):
> *"The maximum app binary size on Emery and Gabbro is now 128 KiB (up from 64 KiB). The **loaded image and RAM
> footprint are still limited to 64 KiB each**; the extra room is available for relocation data."*

Il motivo tecnico è nel commit `26de164` — `PebbleProcessInfo.load_size` e `.virtual_size` sono `uint16_t`,
quindi **≤ 65 535 byte ciascuno**. Traduzione pratica per te:

- **text + rodata + data + bss statici della tua app ≤ ~64 KiB**
- il resto dei 128 KiB va all'**heap** (`malloc`) e allo stack (4 KiB)
- il report di build stampa `... / 128KB` su emery, che è corretto per il totale ma **non** ti avvisa del tetto
  di 64 KiB sull'immagine: se lo superi ottieni un errore di `inject_metadata`.

**Ambienti di esecuzione 2x/3x/4x** (retrocompatibilità): su emery un'app compilata per *basalt* gira nell'ambiente
"3x" con **segmento da 67 584 B** e framebuffer 144×168 **scalato**; un'app aplite gira in "2x" con **25 952 B**.
Quindi ricompilare nativamente per `emery` ti dà **il doppio della RAM** oltre alla resa grafica corretta.

---

## 3. Display Pebble Time 2: costo reale del redraw

### 3.1 Come funziona (sorgente `src/fw/drivers/display/sf32lb/display_jdi.c`)

- Framebuffer di sistema **200×228 × 1 byte/pixel = 45 600 byte**; PebbleOS lo converte **in place** dal formato
  interno 2-2-2 (`GColor8`) al formato pannello 3-3-2, *"to save 44KB RAM"* (commento nel driver).
- La conversione è fatta a 32 bit per volta (4 pixel per iterazione), quindi il costo CPU è ~`righe_sporche × 50`
  operazioni a 32 bit + eventuale mirror orizzontale se il quadrante è ruotato di 180°.
- **Solo la banda `y0..y1` viene trasferita**: `HAL_LCDC_SetROIArea(..., 0, s_update_y0, WIDTH-1, s_update_y1)`.
  `y0`/`y1` derivano dal `dirty_rect` del framebuffer, che è **un unico bounding box**
  (`GRect dirty_rect; //!< Smallest rect covering all dirty pixels` in `applib/graphics/8_bit/framebuffer.h`).
- Il driver commenta: *"A normal full-frame transfer takes well under 20ms"*.
- Durante l'update: `soc_sf32lb_sleep_block(SOC_SF32LB_DEEPWFI)` … `soc_sf32lb_sleep_release(...)`.
  Display e audio **bloccano il deep-WFI**; i2c/pwm/button/uart bloccano solo il deep sleep
  (commit `9ffc706`, 18/06/2026).
- Livelli di sleep sul SF32LB52 (`include/pbl/soc/sf32lb/sleep.h`):
  `SOC_SF32LB_ACTIVE` → `SOC_SF32LB_WFI` → `SOC_SF32LB_DEEPWFI` → `SOC_SF32LB_DEEPSLEEP`, con refcount.

### 3.2 Frame rate delle animazioni

`src/fw/applib/ui/animation.h`:

```c
#if defined(CONFIG_PLATFORM_GABBRO)
#define ANIMATION_TARGET_FRAME_INTERVAL_MS 28   // ~21 Hz reale del pannello Sharp
#else
#define ANIMATION_TARGET_FRAME_INTERVAL_MS 33   // 1000ms / 30 Hz
#endif
```

Dal commit `d9091a4` (19/08/2026): *"Gabbro's Sharp LS013B7DD02 panel is spec-limited to ~21 Hz full-frame updates
… compared to **obelix (whose panel refreshes at its 30 Hz spec)**"*.

→ **Su Pebble Time 2 il tetto utile è 30 fps (33 ms)**. Chiedere più di 30 fps con `app_timer_register()` è
sprecato: i frame vengono coalescati e paghi solo CPU e mancata dormita.

### 3.3 Regole pratiche per il redraw su emery

1. **Raggruppa verticalmente ciò che cambia.** Orologio + secondi + icona batteria sparsi su tutto lo schermo →
   ogni tick spedisci 228 righe. Metti gli elementi dinamici in una fascia contigua → spedisci 30-40 righe.
2. **`layer_mark_dirty()` sul layer più piccolo possibile**, mai su `window_get_root_layer()`.
3. Usa **layer separati** per statico e dinamico; il dirty rect è calcolato dal frame del layer marcato.
4. Evita di ridisegnare lo sfondo intero in ogni `update_proc` se non serve.
5. `graphics_context_set_antialiased(ctx, false)` quando l'antialiasing non aggiunge nulla (linee orizzontali/
   verticali, riempimenti): riduce il lavoro per pixel.
6. Sfrutta i **64 colori** con `GColor8` (2 bit per canale). Attenzione: il pannello è MiP riflettivo, i colori
   sono "muted" (confermato da tutte le recensioni). Alto contrasto e colori saturi rendono molto meglio dei
   pastelli. `gcolor_definitions.h` di emery ha l'elenco completo dei nomi (`GColorJaegerGreen`, ecc.).
7. **`PBL_RGB_BACKLIGHT`** è definito **solo su emery**: puoi tingere il LED di retroilluminazione con
   `light_set_color(GColor)` o `light_set_color_rgb888(uint32_t)` (8 bit/canale, più fine dei 2 bit di `GColor`),
   e `light_set_system_color()` per ripristinare. Il colore si resetta da solo all'uscita dell'app.
   **Non è gratis**: il backlight è il consumatore #1 dichiarato da Core Devices.
8. Font: su emery `MAX_FONT_GLYPH_SIZE` è **512** (contro 256), quindi puoi usare font custom più grandi
   senza spezzare i glifi.

---

## 4. Batteria: linee guida ufficiali + dati reali 2026

### 4.1 Dati reali dichiarati da Core Devices

Fonte: **"Pebble Mega Update - July 2026"**, <https://repebble.com/blog/pebble-mega-update-july-2026> (14/07/2026):

> *"We've … worked extraordinarily hard over the last few months, optimizing and reducing power consumption in
> PebbleOS. As predicted, we boosted the **median battery life of Pebble 2 Duo from 17 days (last summer) to over
> 30 days**. **Pebble Time 2 median is currently around 21 days** — more improvements in the works here too!
> **The biggest consumers of power are backlight, watchfaces with a lot of animations and health tracking.**
> If you want to 'hypermile' your Pebble, try switching to a low-animation watchface and the new **Battery Saver**
> backlight mode (Settings → Display → Backlight)."*

Riscontri esterni (24/08/2026): TechCrunch (21/08/2026) misura *"about 21 days on a charge, depending on use"*;
le recensioni indipendenti riportano tipicamente **10-21 giorni**, con qualche caso a 4 settimane.
Sul forum ufficiale esistono segnalazioni di unità difettose che si scaricano in **3-3,6 giorni**, con ripartizione
in-app "System 47% / Bluetooth 30,3%" — Core Devices lo classifica come **difetto hardware** ("The most frequent
hardware issue we're seeing is very high power consumption (less than ~3 day battery life)") e sostituisce l'orologio.

**Preset di retroilluminazione** introdotti nel firmware (commit `81cc6fa`, 03/07/2026), valori esatti:

| Preset | Sensore ambientale | Dynamic | Intensità | Timeout |
|---|---|---|---|---|
| Max Brightness | on | off | 100% | 5 s |
| **Standard** (default) | on | Standard | **50%** | 3 s |
| **Battery Saver** | on | Dim | **25%** | 3 s |
| Advanced | invariato | invariato | invariato | invariato |

(Il default di intensità sulle board con dynamic backlight è passato da 25% a 50% per allinearsi a "Standard".)

### 4.2 Guida ufficiale "Conserving Battery Life" — contenuto verificato

<https://developer.repebble.com/guides/best-practices/conserving-battery-life/> — testo sorgente:
<https://github.com/coredevices/sdk-docs/blob/main/source/_guides/best-practices/conserving-battery-life.md>
(© 2025 Google LLC; **non è stata aggiornata per l'hardware nuovo**: cita ancora Pebble Time Round come caso critico).

Punti, con le API esatte:

**Tick / TickTimerService**
```c
tick_timer_service_subscribe(MINUTE_UNIT, tick_handler);   // default consigliato
```
- `SECOND_UNIT = 1<<0`, `MINUTE_UNIT`, `HOUR_UNIT`, `DAY_UNIT`, `MONTH_UNIT`, `YEAR_UNIT` (`TimeUnits`).
- `SECOND_UNIT` = **60 risvegli al minuto** invece di 1. La guida raccomanda `MINUTE_UNIT`, e `HOUR_UNIT` per
  watchface minimali.
- La skill ufficiale Core Devices per watchface è ancora più netta: *"**ALWAYS use `MINUTE_UNIT`** … NEVER use
  `SECOND_UNIT` unless the user explicitly requests a seconds display."*
  (<https://github.com/coredevices/pebble-watchface-agent-skill>, `.claude/skills/pebble-watchface/SKILL.md`)

**Animazioni / AppTimer**
- Anima **solo su evento**, non in continuo: `accel_tap_service_subscribe(tap_handler)` (scuotimento del polso) o
  solo al cambio di minuto (`if (tick_time->tm_sec == 0) play_animation();`).
- Per animazioni brevi: `app_timer_register(50 /*ms*/, cb, NULL)` (20 fps) e **`app_timer_cancel()` appena finita**;
  su emery il massimo utile è 33 ms (30 fps).
- Pattern "battery-aware" suggerito da Core Devices: rallentare a 100 ms sotto il 20% di carica leggendo
  `battery_state_service_subscribe()` → `BatteryChargeState.charge_percent`.
- Trucco ufficiale a costo zero (dalla skill Core Devices): **varietà visiva deterministica** legata al contatore
  dei minuti, senza alcun timer:
  ```c
  static int s_frame = 0;              // incrementato in tick_handler (MINUTE_UNIT)
  int rx = (i * 37 + s_frame * 7)  % bounds.size.w;
  int ry = 40 + (i * 23 + s_frame * 11) % sky_height;
  ```

**Accelerometro**
```c
accel_service_set_sampling_rate(ACCEL_SAMPLING_10HZ);  // 10/25(def)/50/100 Hz
accel_data_service_subscribe(10, accel_data_handler);  // samples_per_update: 0..25
```
- Con 10 Hz + batch 10 → **1 solo risveglio al secondo**.
- `accel_service_set_samples_per_update(n)` con `n` tra **0 e 25**.
- Se ti serve solo la gesture: `accel_tap_service_subscribe()` (costa molto meno dello streaming; l'IMU genera
  l'interrupt in hardware). Nota firmware 4.33: *"Shake and tap events caused by the watch's own vibration are now
  filtered out"*.
- `accel_service_peek()` **non** è utilizzabile mentre sei iscritto al data service.

**Bussola**
```c
compass_service_set_heading_filter(TRIG_MAX_ANGLE / 36);  // notifica solo ogni ~10°
```

**Health / HRM / HRV** — terzo consumatore per importanza secondo Core Devices
- `health_service_events_subscribe()`, `health_service_peek_current_value()`, `health_service_sum_today()`.
- `health_service_set_heart_rate_sample_period(uint16_t interval_sec)` — **la richiesta sopravvive all'uscita
  dell'app**; controlla con `health_service_get_heart_rate_sample_period_expiration_sec()` e **azzera con `0`
  quando hai finito**. Un intervallo aggressivo lasciato attivo è un drenaggio invisibile.
- Novità SDK 4.33: `health_service_set_hrv_sample_period()` + evento `HealthEventHRVUpdate` +
  `health_service_peek_hrv_ppi_ms()`. Doc esplicita: *"HRV and heart rate sample periods share the app's single
  sensor subscription: **the sensor is driven at the shorter of the two periods**"*.
- Commit 24/08/2026: `fw/services/hrm: stop unserved subscribers pinning the sensor on` → esisteva un bug in cui
  sottoscrittori non serviti tenevano acceso l'HRM.

**Bluetooth / AppMessage**
```c
app_comm_set_sniff_interval(SNIFF_INTERVAL_NORMAL);   // 0 = risparmio, default
app_comm_set_sniff_interval(SNIFF_INTERVAL_REDUCED);  // 1 = latenza bassa
SniffInterval app_comm_get_sniff_interval(void);
```
Commento nell'header `pebble.h`:
> *"Reduce the sniff interval to increase the responsiveness of the radio at the expense of **increasing Bluetooth
> energy consumption by a multiple of 2-5 (very significant)**. … Frequent switching between modes is thus
> discouraged. The Bluetooth module is a major consumer of the Pebble's energy."*
- Il sistema ripristina `SNIFF_INTERVAL_NORMAL` da solo dopo il `deinit` dell'app, ma **rimettilo tu appena finito
  il trasferimento**.
- Cachea con la Storage API: `persist_write_data/persist_read_data`, `PERSIST_DATA_MAX_LENGTH = 256` byte per chiave,
  `persist_get_max_size()` per il totale a runtime. Doc: *"when compared to using AppMessage to retrieve values from
  the phone, it provides you with a much faster way to restore state. In addition, **it draws less power**."*

**Retroilluminazione (Light API)**
```c
bool light_is_on(void);              // NUOVO: sapere se lo schermo è illuminato
void light_enable_interaction(void); // metodo preferito: accende + timer di spegnimento
void light_enable(bool enable);      // true = forzato ON (pericoloso), false = torna in automatico
void light_set_color(GColor);        // solo PBL_RGB_BACKLIGHT (emery)
void light_set_color_rgb888(uint32_t rgb);
void light_set_system_color(void);
```
Doc: *"Apps that keep the backlight on all the time will not last more than a few hours."*
`light_is_on()` è utile proprio per il pattern "anima solo quando lo schermo è illuminato".

**Vibrazione**
- `vibes_short_pulse()`, `vibes_long_pulse()`, `vibes_double_pulse()`, `vibes_enqueue_custom_pattern()`.
- Motore LRA su PT2/P2D. Accorcia le sequenze custom e offri un'opzione per disattivarle.

**app_worker (background worker)**
- `app_worker_launch()`, `app_worker_kill()`, `app_worker_is_running()`, `app_worker_message_subscribe()`.
- **RAM riservata: 12 KiB dal linker, 10 KiB (`0x2800`) usabili dal binario worker** — identico su tutte le
  piattaforme, emery incluso: il worker **non** beneficia dei 128 KiB.
- Un worker è un processo che resta vivo indipendentemente dall'app in foreground: è il modo più efficace per
  *rovinare* l'autonomia se fa polling. Usalo solo per logging a bassa frequenza, e mai con `psleep()`.

### 4.3 Cosa NON fare mai

- `psleep(int millis)` in un handler: è un **busy/blocking wait** sul task dell'app. Blocca l'event loop, impedisce
  al sistema di andare in idle, e su watchface è garanzia di watchdog/lag. Non usarlo mai al posto di `AppTimer`.
- Loop `while(1)` con `layer_mark_dirty()`.
- `app_timer_register(1, ...)` o intervalli < 33 ms su emery.
- Lasciare `SNIFF_INTERVAL_REDUCED` attivo.
- Lasciare `health_service_set_heart_rate_sample_period()` non azzerato.
- Chiamare `light_enable(true)` senza `light_enable(false)`.
- `layer_mark_dirty()` sul root layer a ogni secondo.

---

## 5. Regole specifiche per watchface

Una watchface gira **tutto il giorno**: ogni costo va moltiplicato per ~1440 minuti/giorno.

1. **`MINUTE_UNIT` sempre.** Se vuoi i secondi, offrili come opzione Clay disattivabile, e considera di attivarli
   solo mentre lo schermo è acceso (`light_is_on()`) o dopo un tap.
2. **Niente animazioni continue.** Anima al cambio di minuto (≤ 300-500 ms) o su `accel_tap_service_subscribe()`.
3. **Le watchface non hanno pulsanti**: Up/Down = timeline, Select = launcher. L'unico input è l'accelerometro
   (tap) e, su PT2, il touch (`touch_service_subscribe()` / recognizer API).
4. **Quick View / area non ostruita**: usa **sempre** `layer_get_unobstructed_bounds()` e
   `app_unobstructed_area_service_subscribe()` invece di `layer_get_bounds()`, altrimenti il tuo layout viene
   coperto dal timeline peek. Testabile con `pebble emu-set-timeline-quick-view on --emulator emery`.
5. **Zero hardcoding di 144/168/200/228.** Usa i bounds, oppure `PBL_DISPLAY_WIDTH` / `PBL_DISPLAY_HEIGHT`
   (definiti a compile time: 200/228 su emery, 144/168 su flint).
6. **Tempo di avvio**: l'app viene **caricata interamente in RAM** all'avvio (code + dati statici), poi rilocata
   (`-fPIE` + tabella di rilocazione). Su emery le **risorse sono memory-mapped** (`CONFIG_MMAP_RESOURCES=y`),
   quindi `gbitmap_create_with_resource_id()` non copia l'intera flash in RAM come sulle vecchie piattaforme —
   ma alloca comunque la bitmap. Per avviare in fretta: immagine statica piccola, pochi `fonts_load_custom_font()`,
   e alloca tutto in `window_load` (mai in `update_proc`).
7. **App Glance** (`app_glance_reload()`) per mostrare info nel launcher senza far girare l'app.
8. **`alarm_service_peek_next()`** (nuovo in SDK 4.33) per un indicatore sveglia senza worker né AppMessage.
9. Se pubblichi: `pebble publish` genera automaticamente screenshot e GIF per tutte le piattaforme.

---

## 6. Compilatore e ottimizzazione — flag REALI dell'SDK

Sorgente: `waflib/extras/pebble_sdk_gcc.py`, estratto dal binario `pebble/waf` dentro `sdk-core 4.33.1`.
Questi sono i flag **effettivi**, non quelli documentati:

```python
CROSS_COMPILE_PREFIX = "arm-none-eabi-"
optimize_flag = "-Os"

pebble_cflags = ["-std=c99", "-mcpu=cortex-m3", "-mthumb",
                 "-ffunction-sections", "-fdata-sections", "-fcommon",
                 "-g", "-fPIE", "-Os"]

c_warnings   = ["-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
                "-Wno-error=unused-function", "-Wno-error=unused-variable", ...]

pebble_linkflags = ["-mcpu=cortex-m3", "-mthumb",
                    "-Wl,--gc-sections", "-Wl,--warn-common",
                    "-fPIE", "-Os"]
```

**Conclusioni operative:**

| Domanda | Risposta verificata |
|---|---|
| Livello di ottimizzazione di default | **`-Os`** (dimensione), per **tutte** le piattaforme |
| `-O2` disponibile? | Non di default. Puoi forzarlo (vedi sotto), ma cresce l'immagine e il tetto di 64 KiB è vicino |
| LTO | **Assente**. Nessun `-flto` da nessuna parte |
| CPU target | **`cortex-m3` per tutte le piattaforme**, anche emery (M33) e flint (M4F) |
| FPU | **Mai usata** (nessun `-mfloat-abi=hard`, nessun `-mfpu=`) → soft-float |
| Dead-code elimination | Sì: `-ffunction-sections -fdata-sections` + `-Wl,--gc-sections` |
| PIC/PIE | **`-fPIE`** obbligatorio (le app sono rilocate a runtime) |
| Warning-as-error | **`-Werror`** attivo di default |
| Toolchain | ARM GNU Toolchain **14.2.rel1** + **picolibc 1.8.11-pebble1** (SDK 4.33: *"The firmware C library backing the SDK's standard library functions (snprintf, strftime, etc.) is now picolibc"*) |
| Debug build | `pebble build --debug` → aggiunge **`-O0 -DPBL_DEBUG`** e produce `build/<nome>_debug.pbw` |

**Come sovrascrivere i flag** (i flag SDK sono *prepended*, quindi ciò che aggiungi dopo **vince**, perché GCC
usa l'ultima `-O`):

```python
# wscript
def configure(ctx):
    ctx.load('pebble_sdk')
    # dopo il load: applica a tutte le piattaforme target
    for p in ctx.env.TARGET_PLATFORMS:
        ctx.all_envs[p].append_value('CFLAGS',    ['-O2'])
        ctx.all_envs[p].append_value('LINKFLAGS', ['-O2'])
```
oppure, senza toccare il wscript:
```bash
CFLAGS="-O2" pebble build          # pebble-tool passa CFLAGS all'ambiente di waf
```

**Attenzione:**
- `-O2`/`-O3` gonfiano `.text`; con il tetto **hard** di 65 535 byte su `load_size`/`virtual_size` puoi passare da
  "compila" a "non compila". Misura sempre dopo.
- **`-mcpu=cortex-m33 -mfpu=fpv5-sp-d16 -mfloat-abi=hard` NON è supportato**: l'ABI del jump table dell'SDK e
  `libpebble.a` sono compilati soft-float/M3. Cambiare CPU/ABI **romperà il link o l'app a runtime**. Non farlo.
- `-flto` non è testato dall'SDK; con `-fPIE` + `--emit-relocs` + `inject_metadata.py` è a rischio elevato.
  Se lo provi, verifica il `.pbw` sull'emulatore E su hardware reale.
- Il vero guadagno prestazionale **non** viene dai flag: viene dall'algoritmo (fixed point, tabelle, meno pixel).

**Regole di codice che valgono più di qualsiasi `-O`:**
- **Zero floating point.** Usa `sin_lookup(int32_t angle)` / `cos_lookup()` con `TRIG_MAX_ANGLE` (65536) e
  `TRIG_MAX_RATIO`; `DEG_TO_TRIGANGLE(deg)`; `gpoint_from_polar()`.
  Regola ufficiale Core Devices: *"**No Floating Point** — Use sin_lookup/cos_lookup only"*.
- **Pre-alloca**: `gpath_create()` in `window_load`, non in `update_proc`. (La skill ammette create/destroy solo
  per path piccolissimi, 3-6 punti, che cambiano ogni frame.)
- Evita `snprintf` nei percorsi caldi (è picolibc, non gratis). Per l'ora, formatta una volta per tick e tieni il
  buffer statico.
- **Funzioni proibite** (`pebble_warn_unsupported_functions.h`): `fopen/fread/fwrite/fseek/fprintf/sprintf/
  vsnprintf/open/read/write/stat/**alloca**/mmap/brk/sbrk` → `_Static_assert(0, ...)` a compile time.
  `printf(...)` è rimappato su `app_log(APP_LOG_LEVEL_DEBUG, ...)`.

---

## 7. Come misurare (comandi esatti)

### 7.1 Memoria — automatico a ogni build

Il target `memory_usage` (`waflib/extras/report_memory_usage.py` + `memory_reports.py`) stampa per piattaforma:

```
-------------------------------------------------------
EMERY APP MEMORY USAGE
Total size of resources:        NNNN bytes / 256KB
Total footprint in RAM:         NNNN bytes / 128KB
Free RAM available (heap):      NNNN bytes
-------------------------------------------------------
```
`Total footprint in RAM` = somma delle sezioni dell'ELF (`binutils.size`). `Free RAM` = `MAX_APP_MEMORY_SIZE - footprint`.

### 7.2 Analisi per simbolo

```bash
pebble analyze-size                       # usa build/<platform>/pebble-app.elf per ogni targetPlatform
pebble analyze-size --summary             # una riga per sezione
pebble analyze-size --verbose             # breakdown per simbolo
pebble analyze-size build/emery/pebble-app.elf
```
(Sotto usa `binutils.analyze_elf(path, 'bdt', use_fast_nm=True)` → sezioni `.bss`, `.data`, `.text`.)

### 7.3 Heap a runtime

```c
#include <pebble.h>
size_t heap_bytes_used(void);   // byte di heap attualmente usati dall'app
size_t heap_bytes_free(void);   // byte di heap liberi
APP_LOG(APP_LOG_LEVEL_INFO, "heap used=%u free=%u",
        (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
```

### 7.4 Timing a runtime

```c
uint16_t time_ms(time_t *tloc, uint16_t *out_ms);   // ritorna i millisecondi
static uint16_t t0 = time_ms(NULL, NULL);
// ... codice da misurare ...
uint16_t dt = (time_ms(NULL, NULL) - t0 + 1000) % 1000;
APP_LOG(APP_LOG_LEVEL_INFO, "draw=%ums", dt);
```
Risoluzione **1 ms**, wrap a 1000. Per misure > 1 s combina con `time()`.
Attenzione: `APP_LOG` stesso costa (serializzazione + BT/console): misura **senza** log nel loop caldo, o accumula
e stampa una volta al minuto. Il log verboso di Alloy è stato disattivato di default proprio per questo
(`kModdableCreationFlagLogInstrumentation`).

Livelli: `APP_LOG_LEVEL_ERROR=1`, `WARNING=50`, `INFO=100`, `DEBUG=200`, `DEBUG_VERBOSE=255`.

### 7.5 Emulatore (QEMU) e comandi `emu-*`

```bash
pebble install --emulator emery
pebble logs      --emulator emery
pebble screenshot --no-open --emulator emery shot.png
pebble kill
```
Comandi di simulazione disponibili (da `pebble_tool/commands/emucontrol.py`, versione 5.0.39):

| Comando | Uso |
|---|---|
| `pebble emu-battery --percent N [--charging]` | testare i percorsi low-battery |
| `pebble emu-bt-connection --connected no\|yes` | **test offline-first** |
| `pebble emu-accel <motion> [file]` | riprodurre dati accelerometro |
| `pebble emu-tap --direction x+\|x-\|y+\|y-\|z+\|z-` | evento tap |
| `pebble emu-compass --heading 0..359` | bussola |
| `pebble emu-button click\|push\|release BUTTON [-d ms] [-n N] [-i ms]` | pulsanti |
| `pebble emu-set-time`, `emu-time-format --format 12h\|24h` | ora |
| `pebble emu-set-timeline-quick-view on\|off` | **testare l'unobstructed area** |
| `pebble emu-set-content-size small\|medium\|large\|x-large` | `PreferredContentSize` |
| `pebble emu-steps N`, `emu-distance M`, `emu-calories A [--resting R]`, `emu-active-time M`, `emu-sleep T [--restful R]`, `emu-heart-rate BPM [--quality Q]` | **iniezione metriche Health** (nuovo in SDK 4.33) |
| `pebble emu-app-config [--file f]` | pagina di configurazione Clay |
| `pebble emu-control [--port P]` | pagina sensori nel browser |

**Limite fondamentale:** l'emulatore **non modella consumo né timing reale**. `qemu-pebble` (v10.1.5-pebble17)
emula funzionalità, non cicli. Non esiste un profiler di cicli lato app (`CONFIG_PROFILER` esiste ma è solo
firmware, non esposto alle app). → **Ogni misura di performance/batteria va fatta su hardware reale.**

### 7.6 Misura su orologio reale

```bash
pebble login                    # GitHub, una volta
pebble install --cloudpebble    # relay cloud (app Pebble: Devices → ⋯ → Enable Dev Connect)
pebble logs --cloudpebble
# rotta legacy Wi-Fi locale:
pebble install --phone <IP>
```
Per l'autonomia: usa la schermata batteria dell'app Pebble (mostra la ripartizione System / Bluetooth / app) e
confronta la stima "giorni rimanenti" con e senza la tua watchface attiva per 24-48 h. È l'unico metodo pratico
attualmente disponibile: **non esiste più il "battery grade" del vecchio developer portal** nel nuovo
`apps.repebble.com` (non ho trovato traccia pubblica di quella metrica nel 2026).

### 7.7 Debug

```bash
pebble build --debug      # -O0 -DPBL_DEBUG, produce build/<nome>_debug.pbw
pebble install --debug ...# per Alloy avvia anche xsbug
pebble gdb                # (comando debug.py presente nel tool)
```

---

## 8. PebbleOS 2025-2026: cosa è cambiato per performance e batteria

Versione firmware più recente al 24/08/2026: **v4.35.0 (19/08/2026)**.
SDK più recente: **4.33.1 (14/08/2026)**. `pebble-tool` **5.0.39** (30/06/2026).
Changelog SDK: <https://developer.repebble.com/sdk/changelogs/> — changelog firmware: <https://ndocs.repebble.com/PebbleOS-Changelog-25efbb55ea84801da04bfcf73c9346e1>
(le release GitHub non hanno note; le note stanno sul sito).

**Lavoro di power optimization tracciabile nei commit (tutti verificabili su github.com/coredevices/PebbleOS):**

| Data | Commit / cambiamento | Perché conta |
|---|---|---|
| 18/06/2026 | `soc/nrf52: add full sleep block/release API` + `soc/sf32lb: add sleep level block/release API` | Nuova infrastruttura di sleep refcounted per SoC |
| 18/06/2026 | `drivers/sf32lb: use sleep level API instead of stop mode` | display+audio bloccano DEEPWFI; i2c/pwm/button/uart solo deep sleep |
| 18/06/2026 | `kernel/util/stop: remove stop mode mechanism` | rimosso il vecchio inibitore generico |
| 18/06/2026 | `drivers/nrf5/qspi: block full sleep during erase` | correttezza durante scritture flash |
| 23/06/2026 | `services/battery: sample nRF battery state every minute` | meno polling |
| 29/06/2026 | `fw/services/light: add under-display ALS screen-luminance compensation` | il sensore luce del PT2 è **sotto il display**: la luminanza dei pixel falsava la lettura → backlight acceso a sproposito |
| 03/07/2026 | `fw: add backlight preset modes` | Max/Standard/Battery Saver/Advanced (vedi §4.1) |
| 13/07/2026 | `shell/prefs: make backlight presets available on all platforms` | |
| **17/07/2026** | `cron: arm a one-shot timer for the next job instead of polling at 1 Hz` | eliminati **86 400 wake-up/giorno** del servizio cron |
| 22/07/2026 | `fw: remove power mode setting and its users` | rimossa la vecchia preferenza "high performance / low power" |
| 24/07/2026 | `drivers/imu: recover stuck INT1 in shake-only mode` | bug che poteva tenere sveglio l'IMU |
| 05/08/2026 | `fw/comm/ble: track slave-latency-0 time and conn param update churn` | telemetria per il consumo BLE |
| 05/08/2026 | `fw/services/analytics: add battery temp, i2c error, and driver health metrics` | |
| 11/08/2026 | `fw/drivers/pmic/npm1300: fix truncated battery current and temperature readings` | le misure di corrente erano troncate |
| **19/08/2026** | `fw/applib/ui: tune animation pacing for gabbro's 21 Hz display` | conferma 30 Hz su obelix/emery |
| **21/08/2026** | `fw/light: give each dynamic backlight mode its own intensity floor` | |
| **24/08/2026** | `fw/services/hrm: stop unserved subscribers pinning the sensor on` | HRM restava acceso per sottoscrittori non serviti |

**Novità SDK rilevanti (SDK 4.17, 23/06/2026 e SDK 4.33, 12/08/2026):**
- `pebble build --debug` (`-O0`, `PBL_DEBUG`, bundle `_debug.pbw`) — richiede pebble-tool ≥ 5.0.38
- `backlight_service_subscribe()` / `backlight_service_unsubscribe()` con `BacklightHandler` → **sai quando il
  backlight si accende/spegne**: è il gancio perfetto per "anima solo quando lo schermo è illuminato"
- `light_is_on()`, `light_set_color()`, `light_set_color_rgb888()`, `light_set_system_color()`
- `app_launch_button()` e `launch_get_quick_launch_action()` (`APP_QUICK_LAUNCH_ACTION_NONE/HOLD/TAP/COMBO`)
- `persist_get_max_size()`
- Speaker API con limiti espliciti: `SPEAKER_MAX_NOTES` (256), `SPEAKER_MAX_TRACKS` (4),
  `SPEAKER_MAX_SAMPLE_BYTES_TOTAL` (16 KiB); `speaker_is_muted()`
- Touch API: `touch_service_subscribe()`, `app_touch_navigation_enable()`,
  `window_set_touch_bridge_disabled()`, recognizer `tap_recognizer_create()` / `pan_recognizer_create()` /
  `swipe_recognizer_create()`, `window_attach_recognizer()`
  ⚠ `sizeof(ScrollLayer)` (e quindi `MenuLayer`) **è cresciuto**: ricompilando app che li incorporano *by value*
  aumenta l'impronta RAM
- HRV: `HealthEventHRVUpdate`, `health_service_peek_hrv_ppi_ms()`, `health_service_set_hrv_sample_period()`
- `alarm_service_peek_next()`
- libc del firmware ora **picolibc**
- Alloy/Moddable XS 17.8; **le app Alloy compilate con SDK 4.33 richiedono firmware ≥ 4.32**

**Problemi noti dichiarati da Core Devices (14/07/2026):** metriche passi/sonno non accurate per alcuni utenti;
accelerometro che a volte smette di funzionare; touch screen che a volte smette o registra tocchi nel punto
sbagliato. Il touch è sospettato essere un **bug software**, non hardware.

---

## 9. Offline-first (senza telefono)

Il PT2 funziona bene scollegato, ma **PebbleKit JS gira sul telefono**: se l'app dipende da `src/pkjs/index.js`,
offline non hai dati. Strategia:

1. **Cache locale con la Storage API.** `persist_write_data()/persist_read_data()`, max **256 byte per chiave**,
   totale interrogabile con `persist_get_max_size()`. Salva timestamp insieme al dato e mostra "stale" invece di
   niente. La doc dice esplicitamente che la Storage API costa **meno batteria** di rileggere via AppMessage.
2. **Stato di connessione**: `connection_service_subscribe(ConnectionHandlers)` +
   `connection_service_peek_pebble_app_connection()`. (Le versioni `bluetooth_connection_service_*` sono
   deprecate.) Non tentare AppMessage se non sei connesso: fallisce e sveglia la radio.
3. **`wakeup_schedule(time_t timestamp, int32_t cookie, bool notify_if_missed)`** + `wakeup_service_subscribe()`
   per aggiornamenti pianificati senza worker persistente. `wakeup_get_launch_event()`, `wakeup_query()`,
   `wakeup_cancel()`.
4. **`launch_reason()`** → `APP_LAUNCH_WAKEUP`, `APP_LAUNCH_QUICK_LAUNCH`, ecc.: comportati diversamente a
   seconda di come sei stato avviato.
5. Tutto ciò che è puramente locale (ora, data, batteria, passi/HR via `HealthService`, bussola, barometro su
   P2D) funziona senza telefono. **Progetta la watchface perché sia completa senza meteo**, e il meteo sia
   un'aggiunta opzionale.
6. Su emery, **Alloy ha `fetch()` lato orologio** (via `@moddable/pebbleproxy` + shim pkjs) — ma il proxy passa
   comunque dal telefono. Non è vera indipendenza.
7. `app_glance_reload()` per lasciare informazioni utili nel launcher anche quando l'app non gira.

---

## 10. Setup su Linux (Ubuntu 26.04 x86_64, senza sudo)

Istruzioni ufficiali: <https://developer.repebble.com/sdk/>

```bash
# 1) uv in user space (nessun sudo)
curl -LsSf https://astral.sh/uv/install.sh | sh     # installa in ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"

# 2) pebble-tool (richiede Python >= 3.10; uv può installare il suo interprete)
uv tool install pebble-tool --python 3.13
#   (per riprodurre un setup verificato: uv tool install --force "pebble-tool==5.0.39" --python 3.13)

# 3) SDK
pebble sdk install latest        # oggi: 4.33.1
pebble sdk list
pebble sdk activate 4.33.1       # se "No SDK installed" persiste, attiva esplicitamente

# 4) progetto
pebble new-project miaface
cd miaface
pebble build
```

**Punti di attenzione specifici per il tuo ambiente:**

- **Python 3.14 non è supportato** dal toolchain (`pebble-tool` dichiara `requires_python >=3.10`, ma il setup
  verificato dalla community usa 3.13 e la stessa Core Devices scrive `uv tool upgrade pebble-tool --python 3.13`).
  **Fai gestire a `uv` un CPython 3.13**: `uv python install 3.13`, poi `--python 3.13`.
- **`uv` risolve il problema "no pip/pipx"**: installa tutto in `~/.local/share/uv` + shim in `~/.local/bin`.
- **L'emulatore QEMU richiede librerie di sistema** che su Ubuntu si installano con `sudo apt`:
  `libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g libsndio7.0` (+ `libpng16-16`).
  **Senza sudo** hai tre opzioni:
  1. verificare se sono già presenti (`ldconfig -p | grep -E 'libSDL2|libpixman|libglib-2.0'`);
  2. estrarre i `.deb` a mano in `~/.local` e usare `LD_LIBRARY_PATH` (`dpkg -x pkg.deb ~/.local/opt/x`);
  3. installarle via **conda-forge / micromamba** in user space (`micromamba install -c conda-forge sdl2 pixman glib zlib libpng`).
  In alternativa: **CloudPebble** (<https://cloudpebble.net> / link da developer.repebble.com) esegue build ed
  emulatore nel browser — zero installazione.
- L'emulatore ha bisogno di un **display X/Wayland** per la finestra SDL; su host headless puoi solo buildare.
- Se non hai IPv6, pypkjs può fallire il bind: patch nota che riscrive il bind del WebSocket a `0.0.0.0`
  (<https://github.com/ArtRichards/pebble-time2-dev-setup>).
- **Node 22 + npm** sono già presenti: servono per PebbleKit JS/webpack e per Alloy.
- `gcc 15` di sistema **non serve**: `pebble sdk install` scarica `arm-none-eabi-gcc` (ARM GNU Toolchain 14.2.rel1).
- Non serve Docker né QEMU di sistema: `pebble sdk install` porta il suo `qemu-pebble`.

---

## 11. Azioni consigliate

**Priorità 1 — decisioni di progetto (fallo prima di scrivere codice)**

1. **Targetta `emery` nativamente.** In `package.json`: `"targetPlatforms": ["emery"]` (aggiungi `"flint"` solo
   se vuoi davvero il Pebble 2 Duo: è B/N, 144×168, metà RAM). Non lasciare che il PT2 esegua un binario basalt
   scalato: perdi metà RAM e la resa a 200×228.
2. **Scrivi in C**, non in Alloy, per watchface ad alte prestazioni e basso consumo. La FAQ ufficiale dice che C
   serve quando vuoi *"the smallest possible memory footprint"*; Alloy inoltre non esiste su flint.
3. **Progetta il layout a fasce orizzontali**: elementi statici sopra/sotto, tutto ciò che cambia in **una banda
   contigua**. È la singola scelta architetturale che riduce di più il costo di redraw sul PT2.
4. **Deciditi su `MINUTE_UNIT`** e costruisci l'estetica intorno a quello (varietà deterministica per minuto).

**Priorità 2 — regole di codice da applicare sempre**

5. `tick_timer_service_subscribe(MINUTE_UNIT, tick_handler)`.
6. **Zero `float`/`double`**: `sin_lookup`/`cos_lookup`, `TRIG_MAX_ANGLE`, `DEG_TO_TRIGANGLE()`, aritmetica
   fixed-point Q16.
7. `layer_get_unobstructed_bounds()` + `app_unobstructed_area_service_subscribe()` invece di `layer_get_bounds()`.
8. Alloca in `window_load`, libera in `window_unload`. `gpath_create` una volta sola.
9. `layer_mark_dirty()` solo sul layer minimo; mai sul root layer a ogni tick.
10. `graphics_context_set_antialiased(ctx, false)` dove non serve.
11. Ogni `app_timer_register()` ha un `app_timer_cancel()` in `window_disappear`/`window_unload`.
12. Mai `psleep()`, mai busy loop.
13. Se usi l'accelerometro: `ACCEL_SAMPLING_10HZ` + batch 10, oppure solo `accel_tap_service_subscribe()`.
14. Se usi HRM: azzera `health_service_set_heart_rate_sample_period(0)` all'uscita.
15. Se usi AppMessage: `SNIFF_INTERVAL_NORMAL` di default, cache in `persist_*`, controlla
    `connection_service_peek_pebble_app_connection()` prima di inviare.
16. Se accendi il backlight: `light_enable_interaction()`, mai `light_enable(true)` prolungato.
    Se usi il colore RGB: solo su `#if defined(PBL_RGB_BACKLIGHT)`.

**Priorità 3 — misurazione e tuning**

17. Ad ogni build leggi il blocco `EMERY APP MEMORY USAGE`; tieni `Total footprint in RAM` **sotto 60 KiB**
    (margine sul tetto hard di 65 535).
18. `pebble analyze-size --verbose` quando l'immagine cresce: di solito i colpevoli sono font custom e tabelle.
19. Instrumenta `update_proc` con `time_ms()` e loggane il valore **una volta al minuto**, non ad ogni frame.
20. Log `heap_bytes_free()` in `window_load` e dopo il primo redraw per vedere il picco di allocazione.
21. Prova `CFLAGS="-O2" pebble build` e confronta size + tempo di `update_proc` misurato **su hardware reale**;
    tieni `-Os` se il guadagno è < 10%. **Non toccare `-mcpu`/`-mfpu`.**
22. Test offline: `pebble emu-bt-connection --connected no --emulator emery` e verifica che la faccia resti
    completa e non tenti AppMessage.
23. Test Quick View: `pebble emu-set-timeline-quick-view on --emulator emery`.
24. Test batteria bassa: `pebble emu-battery --percent 10 --emulator emery`.
25. **Validazione finale su orologio reale per 48 h**, confrontando la stima "giorni rimanenti" nell'app Pebble
    con quella della watchface di sistema. L'emulatore non dice nulla sui consumi.

**Priorità 4 — strumenti**

26. Considera la skill ufficiale Core Devices <https://github.com/coredevices/pebble-watchface-agent-skill>
    (`.claude/skills/pebble-watchface/`): contiene template, `wscript`, script per icone e GIF di preview, e le
    regole di performance ufficiali. Include anche `pebble emu-button click select --emulator emery` per il caso
    in cui l'install atterri sul launcher invece di lanciare l'app.
27. Aggiungi `#if PBL_API_EXISTS(nome_funzione)` per le API nuove (HRV, touch, RGB backlight) se vuoi restare
    compatibile con firmware più vecchi.

---

## 12. Fonti (con data di consultazione: 24/08/2026)

**Primarie — Core Devices / Pebble**
- Hardware Information (tabella piattaforme): <https://developer.repebble.com/guides/tools-and-resources/hardware-information/>
- Conserving Battery Life: <https://developer.repebble.com/guides/best-practices/conserving-battery-life/> — sorgente Markdown: <https://github.com/coredevices/sdk-docs/blob/main/source/_guides/best-practices/conserving-battery-life.md>
- Building for Every Pebble (defines/macro): <https://developer.repebble.com/guides/best-practices/building-for-every-pebble/>
- Installing the Pebble SDK: <https://developer.repebble.com/sdk/>
- FAQ sviluppatori: <https://developer.repebble.com/faqs/>
- Changelog SDK 4.33 (12/08/2026): <https://developer.repebble.com/sdk/changelogs/4.33/>
- Changelog SDK 4.33.1 (14/08/2026): <https://developer.repebble.com/sdk/changelogs/4.33.1/>
- Changelog SDK 4.17 (23/06/2026): <https://developer.repebble.com/sdk/changelogs/4.17/>
- Blog "Pebble Mega Update - July 2026" (14/07/2026): <https://repebble.com/blog/pebble-mega-update-july-2026>
- Blog "Spring 2026 Pebble App Contest + SDK Updates" (02/04/2026): <https://repebble.com/blog/spring-2026-pebble-app-contest>
- Blog Eric Migicovsky, annuncio (18/03/2025): <https://ericmigi.com/blog/introducing-two-new-pebbleos-watches/>
- Changelog firmware PebbleOS: <https://ndocs.repebble.com/PebbleOS-Changelog-25efbb55ea84801da04bfcf73c9346e1>
- Release firmware: <https://github.com/coredevices/PebbleOS/releases> (v4.35.0, 19/08/2026)

**Primarie — codice sorgente**
- `Kconfig` (dimensioni APP_RAM): <https://github.com/coredevices/PebbleOS/blob/main/Kconfig>
- `src/fw/linker/memory.ld` (worker 12 KiB, layout SRAM): <https://github.com/coredevices/PebbleOS/blob/main/src/fw/linker/memory.ld>
- `soc/sf32lb/sf32lb52x/init.c` (`HCPU_FREQ_MHZ 240`): <https://github.com/coredevices/PebbleOS/blob/main/soc/sf32lb/sf32lb52x/init.c>
- `soc/sf32lb/Kconfig.defconfig` (512 KiB SRAM, 32 MiB flash, MMAP_RESOURCES): <https://github.com/coredevices/PebbleOS/blob/main/soc/sf32lb/Kconfig.defconfig>
- `soc/nrf/Kconfig.defconfig` (256 KiB SRAM, 1 MiB flash): <https://github.com/coredevices/PebbleOS/blob/main/soc/nrf/Kconfig.defconfig>
- `include/pbl/soc/sf32lb/sleep.h` (livelli di sleep): <https://github.com/coredevices/PebbleOS/blob/main/include/pbl/soc/sf32lb/sleep.h>
- `src/fw/drivers/display/sf32lb/display_jdi.c` (ROI, conversione 222→332, blocco DEEPWFI): <https://github.com/coredevices/PebbleOS/blob/main/src/fw/drivers/display/sf32lb/display_jdi.c>
- `src/fw/applib/ui/animation.h` (33 ms / 30 Hz): <https://github.com/coredevices/PebbleOS/blob/main/src/fw/applib/ui/animation.h>
- `src/fw/applib/graphics/8_bit/framebuffer.h` (dirty_rect): <https://github.com/coredevices/PebbleOS/blob/main/src/fw/applib/graphics/8_bit/framebuffer.h>
- `boards/obelix/defconfig` (PLATFORM_EMERY, sensori): <https://github.com/coredevices/PebbleOS/blob/main/boards/obelix/defconfig>
- `boards/asterix/defconfig` (PLATFORM_FLINT): <https://github.com/coredevices/PebbleOS/blob/main/boards/asterix/defconfig>
- Commit "animation pacing / 21 Hz vs 30 Hz" (19/08/2026): <https://github.com/coredevices/PebbleOS/commit/d9091a401dc03ea298ad3af8bc683f7044b9fcbc>
- Commit "backlight preset modes" (03/07/2026): <https://github.com/coredevices/PebbleOS/commit/81cc6fa34b7c9157a8ad18f8025a950c9664020a>
- Commit "cron one-shot timer" (17/07/2026): <https://github.com/coredevices/PebbleOS/commit/c5e1fa9848fc01b39c81a2b34a5b856ebdf78be1>
- Commit "sleep level API" (18/06/2026): <https://github.com/coredevices/PebbleOS/commit/9ffc706de9f72970bbcbc15b2c84ce70256c4d95>
- Commit "MAX_APP_BINARY_SIZE + limiti uint16" (03/08/2026): <https://github.com/coredevices/PebbleOS/commit/26de164c6cd8cd5eff3cca8a16c0574ae0265b4d>
- `pebble-tool` (comandi, `--debug`, `analyze-size`): <https://github.com/coredevices/pebble-tool>
- `PebbleOS-SDK` (toolchain ARM 14.2.rel1, picolibc, QEMU 10.1.5-pebble17): <https://github.com/coredevices/PebbleOS-SDK>
- Skill ufficiale watchface Core Devices: <https://github.com/coredevices/pebble-watchface-agent-skill>
- Artefatti ispezionati localmente: `sdk-core 4.33.1` da `https://sdk.repebble.com/releases/4.33.1/sdk-core.tar.gz`
  → `pebble/common/tools/pebble_sdk_platform.py`, `pebble/emery/include/pebble.h` (9 138 righe),
  `pebble/emery/include/pebble_warn_unsupported_functions.h`, e `waflib/extras/pebble_sdk_gcc.py` estratto da `pebble/waf`.

**Secondarie**
- SF32LB52J, specifiche e motivazione della scelta (14/05/2025): <https://www.cnx-software.com/2025/05/14/sifli-sf32lb52j-big-little-arm-cortex-m33-bluetooth-mcu-powers-the-core-time-2-smartwatch/>
- Board Zephyr "Pebble Time 2" (componenti): <https://docs.zephyrproject.org/latest/boards/coredevices/pt2/doc/index.html>
- nRF52840 CoreMark 215 / 90 CoreMark/mA: <https://devzone.nordicsemi.com/f/nordic-q-a/48898/coremark-and-dhrystone-benchmark-numbers-for-the-nrf52840>
- STM32F411 125 DMIPS / 339 CoreMark: <https://www.st.com/en/microcontrollers-microprocessors/stm32f411.html>
- Recensione TechCrunch (21/08/2026, ~21 giorni misurati): <https://techcrunch.com/2026/08/21/the-225-pebble-time-2-is-a-refreshingly-fun-smartwatch/>
- Thread forum "Pebble Time 2. Battery problems": <https://forum.repebble.com/t/pebble-time-2-battery-problems/1156>
- Setup Linux verificato (community): <https://github.com/ArtRichards/pebble-time2-dev-setup>

---

## 13. Domande aperte / non confermate

1. **Nessun benchmark pubblico di app Pebble** (non microcontroller) che confronti emery/flint/basalt.
   I numeri CoreMark/DMIPS sono dei produttori dei chip, non misure su PebbleOS.
2. **Non ho trovato dati mA-per-funzione** pubblicati da Core Devices (quanto costa un redraw, un tick, un
   sample accelerometro). Esiste `src/fw/debug/power_tracking.h` con `PWR_TRACK_*` e `SW_POWER_TRACKING`, ma è
   codice legacy STM32 (enum con `PowerSystemMcuSpi6`, ecc.) e **non è esposto alle app**.
3. **DVFS/scalatura di frequenza sull'HCPU**: il firmware imposta 240 MHz fisso in `soc_early_init`; non ho
   trovato codice che abbassi il clock a runtime. Non escludo che il HAL SiFli lo faccia internamente.
4. **Contraddizione formale sui 128 KiB**: `pebble_sdk_platform.py` e il memory report dicono 128 KiB per emery,
   il changelog SDK 4.33 dice "RAM footprint still limited to 64 KiB". La lettura che propongo (64 KiB statici +
   resto heap, totale 132 KiB di segmento) è **coerente con `CONFIG_APP_RAM_EMERY_SEGMENT_SIZE=135168`** ma non
   l'ho verificata scrivendo un'app che allochi >64 KiB di heap su hardware reale. **Da testare.**
5. **`-flto`**: non testato da nessuno che io abbia trovato. Rischio con `-fPIE` + rilocazioni.
6. **"Battery grade" nell'app store**: la vecchia doc lo cita, ma non ho trovato traccia della metrica nel nuovo
   `apps.repebble.com` nel 2026. Probabilmente rimosso.
7. **Emulatore per `flint` e `gabbro`**: l'SDK 4.33.1 include `pebble/flint/qemu/` e `pebble/gabbro/qemu/`, ma la
   FAQ ufficiale elenca solo `aplite, basalt, chalk, diorite, emery` come piattaforme valide per `--emulator`.
   Probabilmente la FAQ è obsoleta. **Da verificare provando.**
8. **Nota di attenzione**: la tabella nella skill ufficiale Core Devices marca `flint` come "64-color" — è
   **sbagliata**. `pebble_sdk_platform.py` definisce `PBL_BW` per flint. Fidati dell'SDK.
9. La documentazione "Conserving Battery Life" **non è mai stata aggiornata** per emery/flint/gabbro: gli esempi
   parlano ancora di Pebble Time Round. Le API citate restano tutte valide.

# Ottimizzazione della memoria per app Pebble in C
## Focus: Pebble Time 2 (platform `emery`) e Pebble 2 Duo (platform `flint`) — Core Devices, 2025‑2026

> Documento di ricerca — data di redazione: **24 agosto 2026**.
> Tutti i dati sono verificati su fonti primarie (documentazione ufficiale `developer.repebble.com`, sorgenti `github.com/coredevices/pebbleos` branch `main`, changelog SDK, blog Core Devices). Le inferenze sono marcate esplicitamente come **[INFERENZA]**.

---

## 0. Riepilogo esecutivo e correzione di due premesse

### 0.1 Correzione importante: `emery` NON è nRF52840

La premessa "il nuovo Pebble Time 2 usa nRF52840 con 256 KB di RAM" è **errata**. Dalla tabella hardware ufficiale e dai `defconfig` del firmware:

| | Pebble Time 2 | Pebble 2 Duo |
|---|---|---|
| Platform SDK | **`emery`** | **`flint`** |
| Board firmware | `obelix` | `asterix` |
| SoC | **SiFli SF32LB52J** | **Nordic nRF52840** |
| CPU | Star‑MC1 (Cortex‑M33‑like) **240 MHz** | Cortex‑M4 **64 MHz** |
| SRAM totale (`CONFIG_SRAM_SIZE`) | **0x7FC00 = 523.264 B (512 KiB − 1 KiB IPC LCPU)** | **0x3FF00 = 261.888 B (256 KiB − 256 B RETAINED)** |
| Flash | 32 MiB esterna **memory‑mapped (XIP)** | 1 MiB interna (bootloader 32 KiB) |
| Display | 200 × 228, 64 colori, 8 bpp, **touch** | 144 × 168, **2 colori (B/N)** |
| Backlight | RGB (`PBL_RGB_BACKLIGHT`) | LED bianco |

L'nRF52840 con 256 KB di RAM è il SoC del **Pebble 2 Duo (`flint`)**, non del Time 2.
Fonti: <https://developer.repebble.com/guides/tools-and-resources/hardware-information/> (consultata 24/08/2026); `boards/obelix/defconfig`, `boards/asterix/defconfig`, `soc/sf32lb/Kconfig.defconfig`, `soc/nrf/Kconfig.defconfig` in <https://github.com/coredevices/pebbleos>.

Nota utile per il futuro: il SF32LB52J ha **16 MB di PSRAM attualmente NON abilitata in PebbleOS**, "may be enabled in future versions" (nota `*5` della tabella hardware).

### 0.2 Correzione: `flint` è bianco/nero, non a colori

Alcuni tool di terze parti (incluso lo skill agent `coredevices/pebble-watchface-agent-skill`) elencano flint come "64‑color". La fonte primaria dice il contrario: `flint_platform` in `tools/pebble_sdk_platform.py` definisce `PBL_BW`, e la tabella hardware dice "2 (B/W)". **Fidarsi di `PBL_BW` / `PBL_COLOR`, mai di tabelle riassuntive.**

### 0.3 Le 6 cose che contano di più

1. Su `emery` un'app SDK 4.x ha **128 KiB per code + data + bss + heap** (segmento reale 132 KiB, di cui 4 KiB di stack). Su `flint` sono **64 KiB** (segmento 66 KiB, stack 2 KiB).
2. Il **footprint statico** (`.text + .data + .bss`) è comunque limitato a **65.535 byte** su tutte le piattaforme (campo `virtual_size` a 16 bit). Quindi su `emery` avrai **almeno ~64 KiB di heap libero**, tipicamente 90‑110 KiB.
3. Le app di terze parti **non** beneficiano del memory‑mapping zero‑copy delle risorse: ogni risorsa caricata è una `malloc` sull'app heap pari alla dimensione del file.
4. Le app di terze parti sono compilate **`-mcpu=cortex-m3` senza FPU e senza `libm`/`libgcc`**: niente `sqrt()`, `sin()`, `%f` in `snprintf`. Il floating point è da evitare sempre.
5. `persist` è passato da 4 KB a **1 MiB per app** (febbraio 2026) → è la base per app offline‑first.
6. `app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum())` può allocare **16.400 byte** di heap. Non farlo per default.

---

## 1. Limiti di memoria per piattaforma

### 1.1 Limiti "SDK" (quelli che vede il build system)

Fonte primaria: `tools/pebble_sdk_platform.py`, <https://github.com/coredevices/pebbleos/blob/main/tools/pebble_sdk_platform.py> (letto 24/08/2026).

| Platform | `MAX_APP_MEMORY_SIZE` | `MAX_APP_BINARY_SIZE` | `MAX_RESOURCES_SIZE_APPSTORE` | `MAX_RESOURCES_SIZE` (sideload) | `MAX_WORKER_MEMORY_SIZE` | `MAX_FONT_GLYPH_SIZE` |
|---|---|---|---|---|---|---|
| `aplite` | 0x6000 = **24 KB** | 0x10000 = 64 KB | 0x20000 = 128 KB (96 KB per SDK 2.x) | 0x80000 = 512 KB | 0x2800 = 10 KB | 256 B |
| `basalt` | 0x10000 = **64 KB** | 0x10000 = 64 KB | 0x40000 = 256 KB | 0x100000 = 1024 KB | 0x2800 = 10 KB | 256 B |
| `chalk` | 0x10000 = **64 KB** | 0x10000 = 64 KB | 0x40000 = 256 KB | 0x100000 = 1024 KB | 0x2800 = 10 KB | 256 B |
| `diorite` | 0x10000 = **64 KB** | 0x10000 = 64 KB | 0x40000 = 256 KB | 0x100000 = 1024 KB | 0x2800 = 10 KB | 256 B |
| `flint` | 0x10000 = **64 KB** | 0x10000 = 64 KB | 0x40000 = 256 KB | 0x100000 = 1024 KB | 0x2800 = 10 KB | 256 B |
| **`emery`** | 0x20000 = **128 KB** | **0x20000 = 128 KB** | 0x40000 = 256 KB | 0x100000 = 1024 KB | 0x2800 = 10 KB | **512 B** |
| `gabbro` | 0x20000 = **128 KB** | **0x20000 = 128 KB** | 0x40000 = 256 KB | 0x100000 = 1024 KB | 0x2800 = 10 KB | **512 B** |

Osservazioni operative:
* `MAX_APP_MEMORY_SIZE` è la **lunghezza della regione `APP` nel linker script dell'app** (`sdk/pebble_app.ld.template`: `APP (rwx) : ORIGIN = 0, LENGTH = @MAX_APP_MEMORY_SIZE@`) ed è il denominatore del report "Free RAM" del build.
* `MAX_RESOURCES_SIZE_APPSTORE` = 256 KB è il limite **per pubblicare sull'appstore**; puoi sideloadare fino a 1024 KB di risorse ma il build stampa un `WARNING: Your <platform> app resources are too large (...) You will not be able to publish your app.` (vedi `sdk/tools/memory_reports.py`).
* **Non esiste un limite di RAM diverso per watchface e watchapp.** In `app_manager.c` la dimensione del segmento dipende **solo** dal tipo di SDK del binario (2x / 3x / 4x / system), mai dal flag `watchface`.

### 1.2 Limiti reali del firmware (dove va davvero la RAM)

Fonte primaria: `Kconfig` (root) di PebbleOS, sezione "App RAM sizes", <https://github.com/coredevices/pebbleos/blob/main/Kconfig>; commit "fw: move APP_RAM_SIZES from wscript to Kconfig" (24/06/2026) e "kconfig: add memory layout symbols" (16/07/2026).

Il firmware definisce, per ogni piattaforma "logica", due valori:
* **SEGMENT** = RAM data all'app stessa = `stack + .text + .data + .bss + heap`
* **RUNTIME** = RAM riservata al runtime applicativo (`AppState`), **non** contabilizzata nel budget dell'app

| Costante | Valore (byte) | ≈ |
|---|---|---|
| `CONFIG_APP_RAM_APLITE_SEGMENT_SIZE` | 25.952 | 25,3 KiB |
| `CONFIG_APP_RAM_APLITE_RUNTIME_SIZE` | 6.820 | 6,7 KiB |
| `CONFIG_APP_RAM_BASALT_SEGMENT_SIZE` | 67.584 | 66 KiB |
| `CONFIG_APP_RAM_BASALT_RUNTIME_SIZE` | 30.720 | 30 KiB |
| `CONFIG_APP_RAM_CHALK_SEGMENT_SIZE` / `RUNTIME` | 67.584 / 30.720 | 66 / 30 KiB |
| `CONFIG_APP_RAM_FLINT_SEGMENT_SIZE` / `RUNTIME` | 67.584 / 30.720 | 66 / 30 KiB |
| **`CONFIG_APP_RAM_EMERY_SEGMENT_SIZE`** | **135.168** | **132 KiB** |
| **`CONFIG_APP_RAM_EMERY_RUNTIME_SIZE`** | **63.488** | **62 KiB** |
| `CONFIG_APP_RAM_GABBRO_SEGMENT_SIZE` / `RUNTIME` | 135.168 / 96.256 | 132 / 94 KiB |
| `PBL_WORKER_RAM_SIZE` (`src/fw/linker/memory.ld`) | 12.288 | 12 KiB |

Commento del sorgente (testuale):
> `emery` and `gabbro` use a 4 KiB app stack (see `APP_STACK_NORMAL_SIZE`); their segment is sized 2 KiB larger to compensate. All other platforms keep the 2 KiB stack and the historical segment sizes.

Quindi: **132 KiB − 4 KiB di stack = 128 KiB** utili per code+data+bss+heap su emery. Coerente con `MAX_APP_MEMORY_SIZE = 0x20000`.

RAM totale usata da un'app emery attiva: `132 KiB (segment) + 62 KiB (AppState runtime) = 194 KiB`, più 12 KiB di worker, su 512 KiB di SRAM. Il resto è kernel + framebuffer.

### 1.3 I tre "ambienti" 2x / 3x / 4x — trappola da conoscere

Il firmware Time 2 supporta **tre ambienti di esecuzione** e assegna un segmento diverso a seconda della **versione di SDK con cui il binario è stato compilato** (non della piattaforma target):

```c
// src/fw/process_management/app_manager.c
static size_t prv_get_app_segment_size(const PebbleProcessMd *app_md) {
  switch (process_metadata_get_app_sdk_type(app_md)) {
    case ProcessAppSDKType_Legacy2x: return CONFIG_APP_RAM_2X_SEGMENT_SIZE;
    case ProcessAppSDKType_Legacy3x: return CONFIG_APP_RAM_3X_SEGMENT_SIZE;
    case ProcessAppSDKType_4x:       return CONFIG_APP_RAM_4X_SEGMENT_SIZE;
    ...
```

Mappatura su `emery` (dal `Kconfig`):

| Ambiente | Segmento usato su emery | Byte |
|---|---|---|
| `Legacy2x` (app compilata con SDK 2.x) | = APLITE | 25.952 |
| `Legacy3x` (SDK 3.x) | = BASALT | 67.584 |
| **`4x` (SDK ≥ 4.0)** | **= EMERY** | **135.168** |

Su `flint` invece: 2x → APLITE, **3x → APLITE (25.952!)**, 4x → FLINT (67.584).

**Conseguenza pratica:** per ottenere i 128 KiB su Pebble Time 2 devi compilare con l'SDK 4.x corrente. Un `.pbw` vecchio (SDK 3.x) girerà in "bezel mode" con soli 64 KiB e display 144×168 scalato (comportamento introdotto già nel changelog SDK 4.2‑beta4 del 12/10/2016: "Emery can now run apps compiled for Basalt (SDK 4.1 or earlier) or Aplite (SDK 3.7 or earlier) in *bezel mode*").
Fonte: <https://developer.repebble.com/sdk/changelogs/4.2-beta4/>.

### 1.4 Background worker

* Regione `WORKER_RAM` = **12 KiB** totali (`src/fw/linker/memory.ld`).
* `prv_get_worker_segment_size()` ritorna **11.648 byte** ("12 KiB − 640 bytes workerlib static").
* `prv_get_worker_stack_size()` ritorna **1.400 byte**.
* Linker SDK del worker: `MAX_WORKER_MEMORY_SIZE = 0x2800 = 10.240 byte`.
* La documentazione dice: *"The worker is constrained to 10.5 kB of memory"* — <https://developer.repebble.com/guides/events-and-services/background-worker/>.
* **Solo un worker per volta in tutto il sistema**: se un'altra app ne lancia uno, l'utente deve scegliere. Il worker è quindi una risorsa condivisa scarsa.

### 1.5 Limiti del binario (aggiornati ad agosto 2026)

Da `sdk/tools/inject_metadata.py`:
* `MAX_PROCESS_INFO_SIZE_FIELD = 0xFFFF`: sia `PebbleProcessInfo.load_size` sia `PebbleProcessInfo.virtual_size` sono **`uint16_t`** → **massimo 65.535 byte** ciascuno, su qualunque piattaforma.
  * `load_size` = immagine caricata (header + text + data)
  * `virtual_size` = `.text + .data + .bss`
* `max_binary_size` (immagine + tabella di rilocazione) = `MAX_APP_BINARY_SIZE` della piattaforma.

Changelog **SDK 4.33, 12 agosto 2026** (<https://developer.repebble.com/sdk/changelogs/4.33/>):
> "The maximum app binary size on Emery and Gabbro is now **128 KiB** (up from 64 KiB). **The loaded image and RAM footprint are still limited to 64 KiB each**; the extra room is available for relocation data."

Errori di build che vedrai:
```
App image size is %u (app %u relocation table %u). Must be smaller than %u
App load size is %u bytes. The loaded image must be %u bytes or smaller,
  because PebbleProcessInfo.load_size is a uint16_t. ...
App virtual size is %u bytes (.text + .data + .bss). Must be %u bytes or smaller,
  because PebbleProcessInfo.virtual_size is a uint16_t.
```

### 1.6 Cosa ha cambiato Core Devices nel 2025‑2026 (con date)

| Data | Cambiamento | Fonte |
|---|---|---|
| 15/10/2025 | Aggiunta piattaforma `flint` | commit `treewide: add support for flint platform` |
| 28/10/2025 | Aggiunta piattaforma `gabbro` | commit `tools/pebble_sdk_platform: add gabbro` |
| 07/01/2026 | `MAX_FONT_GLYPH_SIZE` aumentato (→ 512 su emery/gabbro) | commit `tools/pebble_sdk_platform: increase MAX_FONT_GLYPH_SIZE` |
| **23/02/2026** | **Limite `persist` per app da 4 KB → 1 MiB** | commit `fw/services/persist: raise per-app storage limit to 1 MiB` |
| 20/02/2026 | SDK 4.9.127: CloudPebble, Alloy (JS/Moddable XS), piattaforma `gabbro` | <https://repebble.com/blog/cloudpebble-returns-plus-pure-javascript-and-round-2-sdk> |
| 22/04/2026 | Aggiunti define `PBL_TOUCH`, `PBL_RGB_BACKLIGHT`, `PBL_SPEAKER` a emery | commit su `pebble_sdk_platform.py` |
| **30/04/2026** | **Aggiunta `persist_get_max_size()`** + settings file "growable" | commit `sdk: add persist_get_max_size()` |
| **01/06/2026** | **Risorse di sistema mappate zero‑copy su flash XIP** (`CONFIG_MMAP_RESOURCES`, solo SF32LB52) | commit `fw/resource: map system resources zero-copy on XIP flash` |
| **12/06/2026** | **Stack app raddoppiato a 4 KiB** | commit `fw/process_management: double the app stack to 4 KiB` |
| **18/06/2026** | Stack 4 KiB limitato a emery/gabbro | commit `fw: limit the 4 KiB app stack to emery and gabbro` |
| 23/06/2026 | **SDK 4.17**: `persist_get_max_size()`, `backlight_service_subscribe()`, `pebble build --debug` (`-O0` + `PBL_DEBUG`) | <https://developer.repebble.com/sdk/changelogs/4.17/> |
| **12/08/2026** | **SDK 4.33**: binario max 128 KiB su emery/gabbro; touch Recognizer API; **libc del firmware ora è picolibc**; app loader tollerante a toolchain ARM recenti | <https://developer.repebble.com/sdk/changelogs/4.33/> |
| 14/08/2026 | SDK 4.33.1 (hotfix emulatore, fw 4.33.2) | <https://developer.repebble.com/sdk/changelogs/4.33.1/> |

**Risposta secca alla domanda "Core Devices ha alzato i limiti sul nuovo hardware?"**
Per la **RAM delle app in C: no, non oltre i valori storici di emery** (128 KB), che risalgono all'SDK 4.2 del 2016. Hanno però:
(a) raddoppiato lo **stack** (2 → 4 KiB) su emery/gabbro nel giugno 2026,
(b) portato il **binario** a 128 KiB (agosto 2026),
(c) portato **`persist` a 1 MiB** (febbraio 2026),
(d) reso le risorse **di sistema** zero‑copy su flash XIP (giugno 2026).
I 512 KiB di SRAM del SF32LB52J e i 16 MB di PSRAM non sono ancora esposti alle app.

---

## 2. Layout della memoria: heap, stack, OOM, strumenti

### 2.1 Come è disposto il segmento dell'app

Da `src/fw/process_management/app_manager.c` (`app_manager_launch_new_app`):

```
APP_RAM  ┌──────────────────────────┐  indirizzo basso
         │ stack guard (32 byte)    │  __stack_guard_size__ = 32
         ├──────────────────────────┤
         │ stack (4096 − 32 byte)   │  cresce verso il basso: overflow → colpisce la guard
         ├──────────────────────────┤
         │ .text / .data / .bss     │  = virtual_size (≤ 65.535 B)
         ├──────────────────────────┤
         │ HEAP (tutto il resto)    │  heap_init(app_heap, app_segment.start, app_segment.end, ...)
         └──────────────────────────┘  indirizzo alto
```

Costanti esatte:
```c
#define APP_STACK_JS_SIZE     (8 * 1024)   // app Moddable/Alloy
#if defined(CONFIG_PLATFORM_EMERY) || defined(CONFIG_PLATFORM_GABBRO)
#define APP_STACK_NORMAL_SIZE (4 * 1024)   // emery, gabbro
#else
#define APP_STACK_NORMAL_SIZE (2 * 1024)   // aplite, basalt, chalk, diorite, flint
#endif
// app legacy 2x/3x: sempre 2 * 1024
__stack_guard_size__ = 32;                  // src/fw/linker/regions.ld
```

**Stack utilizzabile su emery: 4.064 byte. Su flint: 2.016 byte.**
Lo stack è **incluso** nel budget: ogni KiB di stack è un KiB in meno di heap.

### 2.2 L'allocatore heap (`lib/util/heap.c`)

Dettagli che cambiano le decisioni di design:

* Header per allocazione: `HeapInfo_t` = `uint16_t PrevSize` + `bool:1` + `uint16_t Size:15` = **4 byte**, allineamento `sizeof(unsigned long)` = **4 byte**.
  → `malloc(n)` costa `4 + round_up_4(n)` byte. 100 `malloc(12)` costano 1600 byte, non 1200.
* `#define LARGE_SIZE (256/ALIGNMENT_SIZE)` — commento del sorgente:
  > "Allocations that are equal to and larger than this value will be allocated **from the end of the buffer**."
  Le allocazioni **≥ 256 byte** vengono cercate a ritroso dalla fine dell'heap; quelle < 256 byte dall'inizio. È una strategia anti‑frammentazione: **blocchi grandi e long‑lived stanno in fondo, i piccoli e volatili in testa**.
* `SEGMENT_SIZE_MAX = 0x7FFF` unità da 4 byte → heap massimo teorico 131.068 byte (non un vincolo pratico).
* `heap->high_water_mark` esiste nel firmware ma **non è esposto** alle app; solo `current_size`.
* `enable_heap_fuzzing` è attivo **solo per le app di sistema**:
  > "Don't fuzz 3rd party app heaps because likely many of them rely on accessing free'd memory"
  → **un use‑after‑free nella tua app può sembrare funzionare.** Non fidarti dei test manuali.

### 2.3 API di misura

```c
size_t heap_bytes_free(void);   // heap_size(heap) - heap->current_size
size_t heap_bytes_used(void);   // heap->current_size
void   memory_cache_flush(void *start, size_t size);  // solo per codice auto-modificante
```
Fonte: <https://developer.repebble.com/docs/c/Foundation/Memory_Management/>. Implementazione: `src/fw/applib/app_heap_util.c`.

Nota: `heap_bytes_free()` restituisce il **totale libero**, non il **blocco contiguo più grande**. Con heap frammentato una `malloc` grande può fallire pur avendo `heap_bytes_free()` alto. Non esiste API pubblica per il "largest free block" (il firmware la calcola internamente ma non la esporta) — **[INFERENZA]** vanno evitate allocazioni grandi ripetute a runtime.

Pattern di logging consigliato:
```c
static void log_mem(const char *tag) {
  APP_LOG(APP_LOG_LEVEL_INFO, "[%s] heap used=%u free=%u",
          tag, (unsigned)heap_bytes_used(), (unsigned)heap_bytes_free());
}
```
(`APP_LOG` supporta `%u`/`%d`/`%s`/`%p`/`%x` — vedi §5.4.)

### 2.4 Cosa succede in OOM

| Evento | Comportamento | Fonte |
|---|---|---|
| `malloc()` esaurisce l'heap | ritorna **NULL** (nessun crash automatico) | `lib/util/heap.c` |
| `window_create()`, `text_layer_create()`, `gbitmap_create_*()`, ... | ritornano **NULL** | <https://developer.repebble.com/guides/debugging/common-runtime-errors/> |
| Uso di un puntatore NULL | **App fault** → app terminata, log `E ault_handling.c:77 App fault! {uuid} PC: 0x... LR: 0x...` | idem |
| **Double free** (app compilata con SDK > 5.1) | `APP_LOG` "Double free detected on pointer <%p>" + **`PBL_CROAK`** → crash immediato | `src/fw/process_management/process_heap.c` |
| **Heap corruption** rilevata (SDK ≥ 5.0x38 ≈ 3.2) | `APP_LOG` "Error: Heap corrupt around <%p>" + **`PBL_CROAK`** | idem |
| `app_message_open()` senza RAM | ritorna **`APP_MSG_OUT_OF_MEMORY`** | `src/fw/applib/app_message/*` |
| Overflow dello stack | tocca la **stack guard** (32 B) protetta da MPU → fault | `app_manager.c`, `regions.ld` |
| Watchface che crasha ripetutamente | il firmware conta gli eventi "watchface crash‑and‑revert" e torna alla watchface di default | commit `fw/process_management: log and count watchface crash-and-revert events` (04/05/2026) |

### 2.5 Report di memoria del build

`pebble build` stampa, per ogni piattaforma (`sdk/tools/memory_reports.py` + `sdk/waftools/report_memory_usage.py`):

```
-------------------------------------------------------
EMERY APP MEMORY USAGE
Total size of resources:        12345 bytes / 256KB
Total footprint in RAM:         23456 bytes / 128KB
Free RAM available (heap):      107616 bytes
-------------------------------------------------------
```

* "Total footprint in RAM" = `sum(size(pebble-app.elf))` = **text + data + bss**
* "Free RAM available (heap)" = `MAX_APP_MEMORY_SIZE − footprint` — **questo è il tetto teorico dell'heap prima che lo stack e AppState facciano la loro parte**; è la metrica da monitorare a ogni commit.
* Errori/warning risorse:
  * `Build failed: <platform>\nError: Resource pack is too large (XKB / YKB)`
  * `WARNING: Your <platform> app resources are too large (XKB / YKB). You will not be able to publish your app.`

### 2.6 `pebble analyze-size`

Il comando **esiste** nel pebble‑tool attuale: `pebble_tool/commands/sdk/project/analyse_size.py`, `command = "analyze-size"` (<https://github.com/coredevices/pebble-tool>, aggiornato 18/08/2026).

```bash
pebble analyze-size                 # analizza build/<platform>/pebble-app.elf per ogni target
pebble analyze-size path/to/app.elf # ELF specifico
pebble analyze-size --summary       # una riga per sezione
pebble analyze-size --verbose       # breakdown per simbolo
```
Internamente usa `binutils.analyze_elf(path, 'bdt', use_fast_nm=True)` → sezioni **b**ss, **d**ata, **t**ext, con dettaglio per file sorgente e per simbolo. È lo strumento giusto per capire *quale* file/funzione ti sta mangiando il footprint statico.

Alternative dirette (il toolchain ARM è dentro l'SDK, in `~/.local/share/pebble-sdk/SDKs/<ver>/toolchain/`):
```bash
arm-none-eabi-size -A build/emery/pebble-app.elf
arm-none-eabi-nm --size-sort -S -C build/emery/pebble-app.elf | tail -40
arm-none-eabi-objdump -h build/emery/pebble-app.elf
```

### 2.7 Ispezione della memoria nell'emulatore

```bash
pebble install --emulator emery
pebble logs --emulator emery
pebble gdb                     # "Only works in the emulator"
```
`pebble gdb` (`GdbCommand`, `valid_connections = {'emulator'}`) carica i simboli con `add-symbol-file` agli offset corretti; da lì `p heap_bytes_free()`, `x/…`, `bt full`, breakpoint su `<app_crashed>` (già inserito dal tool).
Comandi utili documentati: <https://developer.repebble.com/guides/tools-and-resources/pebble-tool/> e <https://developer.repebble.com/guides/debugging/debugging-with-gdb/>.

**L'emulatore ha lo stesso budget di RAM dell'hardware**: `soc/qemu/Kconfig.defconfig` dice esplicitamente *"QEMU mirrors the SRAM layout of the platform it emulates"* (`SRAM_SIZE = 0x3ff00 if PLATFORM_FLINT`, altrimenti `0x7fc00`), e `boards/qemu_emery/defconfig` imposta `CONFIG_PLATFORM_EMERY=y`. Quindi i test di memoria in emulatore sono rappresentativi.

---

## 3. Bitmap, font, risorse: costo in RAM

### 3.1 Formule esatte di dimensione bitmap

Da `src/fw/applib/graphics/gbitmap.c`, `gbitmap_format_get_row_size_bytes()`:

| `GBitmapFormat` | bit/pixel | byte per riga | palette |
|---|---|---|---|
| `GBitmapFormat1Bit` | 1 | `((w + 31) / 32) * 4` (allineato a word) | — |
| `GBitmapFormat1BitPalette` | 1 | `((w * 1 + 7) / 8)` | 2 × `GColor8` = 2 B |
| `GBitmapFormat2BitPalette` | 2 | `((w * 2 + 7) / 8)` | 4 × `GColor8` = 4 B |
| `GBitmapFormat4BitPalette` | 4 | `((w * 4 + 7) / 8)` | 16 × `GColor8` = 16 B |
| `GBitmapFormat8Bit` | 8 | `w` | — |
| `GBitmapFormat8BitCircular` | 8 | variabile (solo framebuffer chalk) | — |

**Costo di un'immagine a schermo intero su emery (200 × 228):**

| Formato | byte pixel | + palette | + `GBitmap` (32 B) | **totale heap** |
|---|---|---|---|---|
| `8Bit` | 200 × 228 = 45.600 | 0 | 32 | **45.632 B** (~44,6 KiB) |
| `4BitPalette` (≤16 colori) | 100 × 228 = 22.800 | 16 | 32 | **22.848 B** |
| `2BitPalette` (≤4 colori) | 50 × 228 = 11.400 | 4 | 32 | **11.436 B** |
| `1BitPalette` (2 colori) | 25 × 228 = 5.700 | 2 | 32 | **5.734 B** |
| `1Bit` (non palettizzato) | 28 × 228 = 6.384 | 0 | 32 | **6.416 B** |

Su `flint` (144 × 168, B/N): `1Bit` = `((144+31)/32)*4 = 20` B/riga × 168 = **3.360 B**.

Struttura `GBitmap` = **32 byte** (3.x) / 16 byte (legacy 2.x) — da `src/fw/applib/applib_malloc.json`.

### 3.2 `memoryFormat`, `storageFormat`, `spaceOptimization`

Documentazione: <https://developer.repebble.com/guides/app-resources/images/>.
Implementazione: `tools/resources/resource_map/resource_generator_bitmap.py`.

```json
{
  "type": "bitmap",
  "name": "IMAGE_EXAMPLE",
  "file": "images/example_image.png",
  "memoryFormat": "Smallest",
  "spaceOptimization": "memory",
  "targetPlatforms": ["emery"]
}
```

* `memoryFormat` ∈ `Smallest`, `SmallestPalette`, `1Bit`, `8Bit`, `1BitPalette`, `2BitPalette`, `4BitPalette`. **Default: `Smallest`** su tutte le piattaforme.
  * `Smallest` → `smallestpalette` se l'immagine sta in ≤ 4 bit (≤16 colori), altrimenti `8Bit`.
  * `SmallestPalette` → **errore di build** se l'immagine ha più di 16 colori.
  * Su piattaforma B/N (`flint`, `diorite`, `aplite`): *"can't use more than two bits on a black-and-white platform"* → max `2BitPalette`.
* `storageFormat` ∈ `pbi` | `png`. **Preferire `spaceOptimization`.**
* `spaceOptimization` ∈ `storage` | `memory` — mappa **1:1** su `storageFormat`:
  ```python
  format_mapping = {"storage": "png", "memory": "pbi"}
  ```
* **Default se non specifichi nulla** (fonte: sorgente del generatore):
  ```python
  PNG_MIN_APP_MEMORY = 0x8000  # 32k
  if pebble_platforms[PLATFORM]["MAX_APP_MEMORY_SIZE"] < PNG_MIN_APP_MEMORY:
      storage_format = "pbi"     # solo aplite (24K)
  else:
      storage_format = "png"     # basalt, chalk, diorite, flint, emery, gabbro
  ```
  **Quindi su emery e flint il default è PNG, cioè ottimizzato per lo spazio su flash, NON per la RAM.**
* Combinazioni vietate (build fallisce): `spaceOptimization: memory` + `storageFormat: png`; `spaceOptimization: storage` + `storageFormat: pbi`; `storageFormat: png` + `memoryFormat: 1Bit` (PNG non supporta 1‑bit non palettizzato).
* Equivalenze storiche: `png` ≡ `bitmap` senza specificatori; `pbi` ≡ `bitmap` + `"memoryFormat": "1Bit"`; `pbi8` ≡ `bitmap` + `"memoryFormat": "8Bit"` + `"storageFormat": "pbi"`.

### 3.3 PNG vs PBI: il costo runtime è molto diverso

Da `gbitmap_init_with_resource_system()` (`gbitmap.c`) e `gbitmap_init_with_png_data()` (`gbitmap_png.c`):

**Percorso PBI** (`spaceOptimization: "memory"`):
1. `applib_malloc(file_size)` — i byte del file **sono già** il pixel buffer
2. Fine. **Picco RAM ≈ dimensione risorsa.**

**Percorso PNG** (default su emery!):
1. `applib_malloc(file_size)` per i byte PNG compressi
2. `upng_create()` + `upng_decode_image()` → **secondo buffer** con i pixel decompressi + eventuale palette
3. `applib_resource_munmap_or_free(data)` libera il PNG compresso
4. **Picco RAM ≈ dimensione file PNG + dimensione decompressa + struct upng + palette**

Commento nel sorgente: *"the actual pixels live uncompressed on the heap now, we can free the PNG data"*.

→ **Se il picco di heap conta più dello spazio su flash (ed è il tuo caso: 1 MB di risorse sideload vs 128 KB di RAM), usa `"spaceOptimization": "memory"` su ogni bitmap.**

### 3.4 Le risorse **dell'app** non sono zero‑copy

`src/fw/applib/applib_resource.c`:
```c
void *applib_resource_mmap_or_load(ResAppNum app_num, uint32_t resource_id, ...) {
  const uint8_t *mapped_data = (app_num == SYSTEM_APP) ?
      sys_resource_read_only_bytes(SYSTEM_APP, resource_id, NULL) : NULL;
  ...
  result = applib_malloc(num_bytes + (used_aligned ? 7 : 0));
```
E in `resource_storage_flash.c`:
```c
// Bank is XIP-mapped ... Only privileged callers get the raw pointer;
// unprivileged apps use the copy path.
```

**Conclusione: il memory‑mapping XIP di giugno 2026 vale solo per le risorse di sistema (font di sistema, icone di sistema). Ogni risorsa della tua app costa heap pari alla sua dimensione.** Non contare sullo zero‑copy.

### 3.5 PDC (Pebble Draw Commands) — grafica vettoriale

```c
GDrawCommandImage *gdraw_command_image_create_with_resource(uint32_t resource_id);
void gdraw_command_image_draw(GContext *ctx, GDrawCommandImage *img, GPoint offset);
void gdraw_command_image_destroy(GDrawCommandImage *img);
// sequenze: gdraw_command_sequence_create_with_resource(), ..._get_frame_by_elapsed()
```

Costo in RAM (da `gdraw_command_image.c`): `applib_resource_mmap_or_load(app_num, resource_id, PDCI_DATA_OFFSET, data_size, false)` → **`malloc` della dimensione del file PDC (meno l'header)**. Nessuna decompressione, nessun buffer aggiuntivo.

**Un PDC è tipicamente 10‑100× più piccolo della bitmap equivalente**: un'icona vettoriale da 400 byte occupa 400 byte di heap contro i 22.848 di una `4BitPalette` a schermo intero. Per icone, lancette, forme geometriche piatte, il PDC è **la scelta migliore su emery** sia per RAM sia per nitidezza a 200×228.

Tool: `svg2pdc.py` (incluso nell'SDK) — <https://developer.repebble.com/guides/app-resources/converting-svg-to-pdc/>; editor web community (Heiko Behrens) linkato dalle FAQ ufficiali.

Attenzione: il rendering PDC è **path filling software** → costa CPU a ogni frame. Per animazioni ad alto frame rate su emery valuta il pre‑rendering in bitmap. **[INFERENZA]**

### 3.6 APNG / `GBitmapSequence`

<https://developer.repebble.com/guides/app-resources/animated-images/>

```c
s_sequence = gbitmap_sequence_create_with_resource(RESOURCE_ID_ANIMATION); // risorsa "raw"
GSize frame_size = gbitmap_sequence_get_bitmap_size(s_sequence);
s_bitmap = gbitmap_create_blank(frame_size, GBitmapFormat8Bit);            // buffer frame
```
Costo = `sizeof(GBitmapSequence)` **88 B** + **intero file APNG sull'heap** + **buffer del frame** (`w*h` byte in `8Bit`). Un'animazione 100×100 in 8Bit costa 10.000 B di frame buffer **più** il file APNG completo. È il modo più costoso di animare: preferisci `gbitmap_create_blank(..., GBitmapFormat4BitPalette)` quando i colori lo permettono, o PDC sequences, o disegno procedurale.

### 3.7 Font

Documentazione: <https://developer.repebble.com/guides/app-resources/fonts/>.

**Costo reale in app heap di un font custom: molto basso.** Da `src/fw/applib/fonts/fonts.c`:
```c
GFont fonts_load_custom_font_system(ResAppNum app_num, uint32_t resource_id) {
  FontInfo *font_info = applib_type_malloc(FontInfo);   // 56 byte (applib_malloc.json)
  ...
```
Il file del font **non** viene caricato interamente in RAM: i glifi sono letti on‑demand dalla flash e messi in cache in un `FontCache` che vive nell'`AppState` (area RUNTIME, **fuori** dal budget dell'app). Da `src/fw/applib/graphics/text_resources.h`:
```c
#define OFFSET_TABLE_MAX_SIZE (1024)   // tabella offset del font corrente
#define LINE_CACHE_SIZE 30             // 30 glifi in cache
#define CACHE_GLYPH_SIZE MAX_FONT_GLYPH_SIZE  // 512 su emery/gabbro, 256 altrove
uint8_t glyph_buffer[sizeof(LineCacheData) + CACHE_GLYPH_SIZE];
```
`FontCache` ≈ **2 KB** (1024 + 30 chiavi + 30 × `LineCacheData` + scratch + `glyph_buffer`), nell'AppState.

Quindi:
* **`fonts_get_system_font(FONT_KEY_...)`**: zero heap dell'app, il font è di sistema (e su emery è pure XIP zero‑copy). Non va distrutto.
* **`fonts_load_custom_font(resource_get_handle(RESOURCE_ID_X))`**: **56 byte di heap** + I/O flash sui glifi. Va distrutto con `fonts_unload_custom_font()`.
* Il costo vero dei font custom è **sulla flash/resource pack**, non sull'heap.

**`characterRegex`** — riduce drasticamente la dimensione della risorsa font:
```json
{ "type": "font", "name": "TIME_48", "file": "font.ttf", "characterRegex": "[0-9:]" }
```
Regex utili dalla doc ufficiale:

| Regex | Set |
|---|---|
| `[ -~]` | solo ASCII |
| `[0-9]` | solo cifre |
| `[0-9 ]` | cifre e spazio |
| `[a-zA-Z]` | solo lettere |
| `[0-9:APM ]` | stringhe orario "12:45 AM" |
| `[0-9:A-Za-z ]` | orario + data |
| `[0-9:A-Za-z° ]` | + simbolo grado |
| `[0-9°CF ]` | temperature |

Altre note: dimensione massima raccomandata **48**; il nome della risorsa **deve terminare con la dimensione** (`EXAMPLE_FONT_20`); `"compatibility": "2.7"` torna al rendering pre‑SDK 2.8.
Su emery `MAX_FONT_GLYPH_SIZE = 512` byte: un singolo glifo bitmap non può superare 512 byte → limite pratico per font molto grandi/pesanti.

### 3.8 Lazy loading e streaming

```c
ResHandle resource_get_handle(uint32_t resource_id);
size_t    resource_size(ResHandle h);
size_t    resource_load(ResHandle h, uint8_t *buffer, size_t max_length);
size_t    resource_load_byte_range(ResHandle h, uint32_t start_offset,
                                   uint8_t *buffer, size_t num_bytes);  // <-- streaming
```
Dalla doc: *"Resources are stored on Pebble's flash memory and only loaded in RAM when you load them."*
`resource_load_byte_range()` permette di **streammare** grandi risorse `raw` (tabelle, dataset offline, stringhe) a blocchi senza mai materializzarle in RAM. È la tecnica chiave per un'app offline‑first con molti dati.

Regola di ciclo di vita:
```c
static void window_load(Window *w)   { s_bmp = gbitmap_create_with_resource(RESOURCE_ID_X); ... }
static void window_unload(Window *w) { gbitmap_destroy(s_bmp); s_bmp = NULL; ... }
```
Le FAQ ufficiali lo dicono esplicitamente: *"Resources are only loaded into RAM when you ask for them, so **destroy them as soon as you're done**."*

---

## 4. AppMessage, persist, DataLogging

### 4.1 AppMessage — dimensionamento dei buffer

Macro (da <https://developer.repebble.com/docs/c/Foundation/AppMessage/>):
```c
#define APP_MESSAGE_INBOX_SIZE_MINIMUM   124   // garantito su tutte le Pebble
#define APP_MESSAGE_OUTBOX_SIZE_MINIMUM  636   // garantito su tutte le Pebble
```

Massimi dinamici (da `src/fw/applib/app_message/app_message.c`):
```c
#define APP_MSG_8K_DICT_SIZE (sizeof(Dictionary) + sizeof(Tuple) + (8 * 1024))  // = 1 + 7 + 8192 = 8200
uint32_t app_message_inbox_size_maximum(void);   // 8200 se telefono+app supportano "8k", altrimenti legacy
uint32_t app_message_outbox_size_maximum(void);  // idem
```

**Entrambi i buffer sono allocati sull'app heap:**
* outbox: `applib_zalloc(sizeof(AppMessageAppOutboxData) + size_outbound + APP_MSG_HDR_OVRHD_SIZE)` (`app_message_outbox.c`)
* inbox: `applib_zalloc(buffer_size + min_num_messages * sizeof(AppInboxMessageHeader))` (`app_inbox.c`)

Il firmware stesso ti avvisa:
```
app_message_open() called with app_message_inbox_size_maximum().
This consumes %u bytes of heap memory, potentially more in the future!
```

→ **`app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum())` può costare 16.400 byte di heap** su firmware/telefono moderni. Sulla carta è "best practice" nella doc, in pratica su un'app che deve stare leggera è uno spreco enorme.

**Dimensionamento corretto** con `dict_calc_buffer_size()` — formula esatta da `src/fw/util/dict.c` + `dict.h`:
```
size = sizeof(Dictionary) + Σ (sizeof(Tuple) + value_len)
     = 1 + Σ (7 + value_len)
```
(`Dictionary` = 1 byte `count`; `Tuple` packed = `uint32_t key` + `uint8_t type` + `uint16_t length` = **7 byte**.)

Esempi:
* 3 interi 32‑bit: `1 + 3*(7+4) = 34` byte
* 1 stringa da 32 caratteri + 2 interi: `1 + (7+33) + 2*(7+4) = 63` byte

```c
// Runtime, sicuro:
const uint32_t need = dict_calc_buffer_size(3, 4, 4, 33);
app_message_open(need, need);

// Oppure semplicemente, per un'app leggera:
app_message_open(128, 128);   // scelta dello skill ufficiale Core Devices
```

Altre note:
* Registra **tutti** i callback (`app_message_register_inbox_received/dropped/outbox_sent/outbox_failed`) **prima** di `app_message_open()`.
* Un messaggio più grande del buffer viene **droppato** (`inbox_dropped` con `AppMessageResult`).
* `app_message_close()` libera i buffer: se l'app usa AppMessage solo in fase di sync, **apri, sincronizza, chiudi** e riprenditi 16 KB di heap.
* Calcolo della dimensione di un dizionario ricevuto (FAQ ufficiali):
  ```c
  int size = (int)received->end - (int)received->dictionary;
  ```

### 4.2 Persistent Storage — **il cambiamento più importante per l'offline‑first**

<https://developer.repebble.com/docs/c/Foundation/Storage/>

```c
#define PERSIST_DATA_MAX_LENGTH   256                        // per chiave
#define PERSIST_STRING_MAX_LENGTH PERSIST_DATA_MAX_LENGTH    // NUL incluso
size_t persist_get_max_size(void);                           // NUOVO in SDK 4.17 (23/06/2026)
```

* **Per chiave: 256 byte** (invariato).
* **Totale per app: 1 MiB** — `#define PERSIST_STORAGE_MAX_SPACE MiBYTES(1)` in `src/fw/services/persist/service.c`; allocazione iniziale 4 KiB, file "growable".
  Commit `fw/services/persist: raise per-app storage limit to 1 MiB`, **23/02/2026**.
* Doc di `persist_get_max_size()`: *"Gets the maximum total size in bytes of all persisted values for the current app on this firmware. **Apps targeting older SDKs that don't have this function should assume a 4 KB limit.**"*
* Pattern di compatibilità:
  ```c
  #if PBL_API_EXISTS(persist_get_max_size)
    const size_t budget = persist_get_max_size();
  #else
    const size_t budget = 4096;
  #endif
  ```
* Chiavi: `uint32_t` arbitrario. Con 256 B/chiave e 1 MiB totale puoi tenere **~4000 record da 256 byte** sul polso, senza telefono. Perfetto per cache offline (previsioni, calendario, dataset).
* API: `persist_exists`, `persist_get_size`, `persist_read_bool/int/data/string`, `persist_write_bool/int/data/string`, `persist_delete`. Ritornano `status_t` / `StatusCode` (`E_OUT_OF_STORAGE`, `E_DOES_NOT_EXIST`, ...).
* La doc sottolinea che persist è **più veloce e consuma meno batteria** che ri‑chiedere i dati al telefono via AppMessage.

### 4.3 DataLogging

<https://developer.repebble.com/guides/communication/datalogging/>

* *"Datalogging also allows **up to 640 kB of data** to be buffered on the watch until a connection is available"* → progettato esattamente per l'uso disconnesso.
* API: `data_logging_create(tag, DataLoggingItemType, item_length, resume)`, `data_logging_log()`, `data_logging_finish()`. Tipi: `DATA_LOGGING_BYTE_ARRAY`, `DATA_LOGGING_UINT`, `DATA_LOGGING_INT`.
* Risultati: `DATA_LOGGING_SUCCESS`, `DATA_LOGGING_BUSY`, `DATA_LOGGING_FULL`, `DATA_LOGGING_NOT_FOUND`, `DATA_LOGGING_CLOSED`, `DATA_LOGGING_INVALID_PARAMS`.
* **Limite importante: i dati DataLogging NON sono ricevibili da PebbleKit JS.** Servono PebbleKit Android o iOS (cioè un'app companion nativa). Per un'app offline‑first "solo watch + PKJS", `persist` è la scelta giusta; DataLogging serve solo se hai un'app companion nativa.
* Debug da CLI: `pebble data-logging list`, `pebble data-logging download --session-id ID FILE`, `pebble data-logging disable-sends` / `enable-sends` / `get-sends-enabled`.
* Il buffer di DataLogging vive nel **kernel/flash**, non nell'app heap. **[INFERENZA basata su `applib/data_logging.c` che usa syscall verso il servizio di sistema]**

---

## 5. Tecniche a livello di codice

### 5.1 Statico vs dinamico

Sono **lo stesso budget**: `.bss` e heap stanno entrambi nei 128 KiB (emery) / 64 KiB (flint). Ma non sono equivalenti:

| | `static` / `.bss` | heap (`malloc`) |
|---|---|---|
| Overhead per oggetto | 0 | 4 byte header + padding a 4 |
| Frammentazione | impossibile | possibile |
| Contabilizzato in | `virtual_size` (≤ 65.535 B!) | "Free RAM available" |
| Fallimento | a **build time** (linker error) | a **runtime** (`NULL`) |
| Vita | tutta l'app | controllabile |

**Regola pratica:** buffer piccoli, a vita‑app e di dimensione nota (stringhe di formattazione, stati, array fissi) → `static`. Oggetti grandi legati a una `Window` o transitori → heap, creati in `window_load` e distrutti in `window_unload`.
Attenzione al tetto di 64 KiB su `virtual_size`: se metti tutto in `.bss` su emery **non potrai mai superare i 64 KiB e sprecherai metà del budget**. Su emery, per usare oltre 64 KiB di RAM devi passare dall'heap.

### 5.2 Evitare la frammentazione

Sfruttando `LARGE_SIZE = 256`:
1. **Alloca per prime, e una sola volta, tutte le allocazioni ≥ 256 byte** e tienile per tutta la vita dell'app: finiscono in fondo all'heap, lontano dal churn.
2. Evita cicli `malloc`/`free` di dimensioni variabili nella `LayerUpdateProc` o nei tick handler.
3. Preferisci **buffer riutilizzati** a `realloc()` ripetuti.
4. Se devi cambiare "schermata", **distruggi tutto e ricrea** invece di accumulare: `window_stack_pop()` con `window_unload` che libera tutto.
5. Non allocare a partire da `heap_bytes_free()`: quel numero non garantisce un blocco contiguo.

### 5.3 Ciclo di vita di Window e Layer — dimensioni reali

Da `src/fw/applib/applib_malloc.json` (i valori sono **congelati per compatibilità binaria** tra release):

| Oggetto | byte (3.x/4.x) | Oggetto | byte |
|---|---|---|---|
| `Layer` | 60 | `Window` | 100 |
| `TextLayer` | 92 | `BitmapLayer` | 76 |
| `GBitmap` | 32 | `GBitmapSequence` | 88 |
| `ScrollLayer` | 228 | `MenuLayer` | **476** |
| `SimpleMenuLayer` | **520** | `ActionBarLayer` | 172 |
| `StatusBarLayer` | 200 | `RotBitmapLayer` | 96 |
| `FontInfo` | 56 | `ContentIndicator` | 108 |
| `AnimationPrivate` | 76 | `PropertyAnimationPrivate` | 144 |
| `NumberWindow` | 568 | `OptionMenu` | 904 |
| `ActionMenuData` | **954** | `Dialog` | **640** |
| `ExpandableDialog` | **1296** | `DictationSession` | **1284** |
| `VoiceWindow` | **2384** | `HealthServiceCache` | **2048** |
| `QRCode` | 72 | `KinoLayer` | 164 |

Nota: il changelog **SDK 4.33** avverte che *"`ScrollLayer` (and by extension `MenuLayer`) carries internal touch navigation state; `sizeof(ScrollLayer)` grows when recompiling apps that embed one by value."* → se hai `ScrollLayer` **per valore** dentro una struct, ricompilando cresce.

Pattern canonico:
```c
static Window *s_window;
static TextLayer *s_time_layer;

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_unobstructed_bounds(root);   // MAI hardcodare 144/168/200/228
  s_time_layer = text_layer_create(GRect(0, bounds.size.h/2 - 30, bounds.size.w, 60));
  layer_add_child(root, text_layer_get_layer(s_time_layer));
}
static void window_unload(Window *window) {
  text_layer_destroy(s_time_layer);
  s_time_layer = NULL;
}
static void init(void) {
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){ .load = window_load, .unload = window_unload });
  window_stack_push(s_window, true);
}
```

### 5.4 Buffer di testo e `snprintf` — niente `%f`

Specificatori supportati dallo `snprintf` di Pebble (<https://developer.repebble.com/docs/c/Standard_C/Format/>): `d`, `i`, `u`, `o`, `x`, `X`, `c`, `s`, `p`, `%`, con modificatori `h` e `l`.
**Non esistono `%f`, `%e`, `%g`.**

```c
// Sbagliato: non stampa nulla di utile e trascina in libgcc
snprintf(buf, sizeof(buf), "%.1f", temp_c);

// Giusto: fixed-point intero
int t10 = temp_c_x10;                       // temperatura × 10, come intero
snprintf(buf, sizeof(buf), "%d.%d°", t10 / 10, abs(t10 % 10));
```

Dimensionamento buffer: usa `static char s_buf[N]` **file‑scope**, mai `char buf[N]` grande sullo stack (§5.6), e passa sempre `sizeof(s_buf)`.
**Trappola classica:** `text_layer_set_text()` **non copia** la stringa — memorizza il puntatore. Se passi un buffer locale che esce dallo scope, disegnerai memoria morta (che in emulatore spesso "sembra" funzionare perché lo stack non è ancora stato riusato). Usa sempre buffer `static`.

Funzioni della libreria C effettivamente esportate alle app (da `tools/generate_native_sdk/exported_symbols.json`, gruppo Standard C):
`malloc`, `calloc`, `realloc`, `free`, `memcmp`, `memcpy`, `memmove`, `memset`, `strcmp`, `strncmp`, `strcpy`, `strncpy`, `strcat`, `strlen`, `snprintf`, `atoi`, `rand`, `srand`, `time`, `mktime`, `localtime`, `gmtime`, `strftime`, `setlocale`, `i18n`…
**Non ci sono**: `sqrt`, `sin`, `cos`, `pow`, `floor`, `ceil`, `fabs`, `atof`, `strtod`, `qsort`, `strtol`.
Da SDK 4.33 la libc del firmware è **picolibc** (changelog 12/08/2026).

### 5.5 Floating point: perché evitarlo (e la risposta sulla FPU)

**Le app di terze parti sono compilate come Cortex‑M3, senza FPU, su tutte le piattaforme.** Da `tools/waf/pebble_sdk_gcc.py` (*"setup the environment variables for compiling a 3rd party app"*):

```python
optimize_flag = "-Os"
pebble_cflags = ["-std=c99", "-mcpu=cortex-m3", "-mthumb",
                 "-ffunction-sections", "-fdata-sections", "-fcommon",
                 "-g", "-fPIE", "-Os", ...]
pebble_linkflags = ["-mcpu=cortex-m3", "-mthumb", "-Wl,--gc-sections",
                    "-Wl,--warn-common", "-fPIE", "-Os"]
```

Il SoC del Time 2 (Star‑MC1, Cortex‑M33‑like) **ha** una FPU hardware e l'nRF52840 (Cortex‑M4F) pure, ma **il tuo codice non la userà mai**: l'ABI del binario app è fissata a Cortex‑M3 soft‑float per compatibilità binaria fra piattaforme e generazioni.

Peggio: `sdk/pebble_app.ld.template` **scarta esplicitamente le librerie**:
```ld
DISCARD :
{
    libc.a ( * )
    libm.a ( * )
    libgcc.a ( * )
    *(.eh_frame)
}
```
→ nessuna routine matematica di `libm` e nessun helper `libgcc` finisce nel binario dell'app.

**Sostituti da usare** (`<pebble.h>`, gruppo Foundation/Math):
```c
int32_t sin_lookup(int32_t angle);    // angle: 0x10000 == 360°
int32_t cos_lookup(int32_t angle);
int32_t atan2_lookup(int16_t y, int16_t x);
#define TRIG_MAX_ANGLE 0x10000
#define TRIG_MAX_RATIO 0xffff
#define DEG_TO_TRIGANGLE(angle)  /* gradi -> fixed point */
#define TRIGANGLE_TO_DEG(t)      /* fixed point -> gradi */
```
Esempio ufficiale (lancetta dei secondi), tutto in interi:
```c
int32_t a = TRIG_MAX_ANGLE * tick_time->tm_sec / 60;
hand.x = ( sin_lookup(a) * len / TRIG_MAX_RATIO) + center.x;
hand.y = (-cos_lookup(a) * len / TRIG_MAX_RATIO) + center.y;
```
Per il resto: **fixed point** (`int32_t` con scala 1/256 o 1/1000) e attenzione all'overflow nei prodotti intermedi (`(int64_t)` dove serve, ma anche la divisione 64‑bit è emulata).

### 5.6 Stack: mai array grandi come locali

Stack utile: **4.064 byte su emery**, **2.016 su flint**, meno i frame delle chiamate SDK e delle syscall. Un `char buf[1024]` in una `LayerUpdateProc` consuma un quarto dello stack di emery e **metà** di quello di flint.

```c
// PERICOLOSO
static void update_proc(Layer *l, GContext *ctx) {
  char line[512];  GPoint pts[64];  /* 512 + 512 = 1 KiB di stack */
}
// SICURO
static char s_line[512];
static GPoint s_pts[64];
```
Un overflow tocca la **stack guard di 32 byte** protetta da MPU e fa fault. In emulatore lo stack "sporco" spesso non produce sintomi immediati; su hardware sì.

Anche `dict_write_begin()` con `uint8_t buffer[size]` VLA sullo stack (esempio della doc Dictionary) va evitato se `size` non è banale.

### 5.7 Flag di compilazione e `wscript`

Default già ottimali: `-Os`, `-ffunction-sections -fdata-sections` + `-Wl,--gc-sections` (dead code elimination per funzione/variabile), `-fPIE`, `-std=c99`, `-Wall -Wextra -Werror`.

Cosa puoi fare nel `wscript` del progetto:
```python
def configure(ctx):
    ctx.load('pebble_sdk')
    ctx.env.append_value('CFLAGS', ['-flto', '-ffast-math'])   # sconsigliato: vedi sotto
```
* **`-O0` per il debug**: `pebble build --debug` (SDK 4.17+, 23/06/2026) compila senza ottimizzazioni, definisce `PBL_DEBUG` e produce `<app>_debug.pbw`. Il footprint cresce parecchio — usalo solo per il debug, **mai** per misurare la memoria.
* Non toccare `-mcpu`/`-mfloat-abi`: cambierebbe l'ABI e il binario non caricherebbe.
* `ctx.load('pebble_sdk')` gestisce i flag; `pbl_suppress_newer_gcc_warnings(conf)` esiste per zittire i `-Werror` dei GCC recenti (workaround, non fix).
* Tieni **una sola** `targetPlatforms` in fase di iterazione (`["emery"]`) per build più veloci; aggiungi le altre alla fine.

### 5.8 Stringhe e tabelle nelle risorse

Le stringhe letterali finiscono in `.rodata` che, nel linker script dell'app, è **dentro `.text` → dentro `virtual_size` → dentro il budget RAM**:
```ld
.text : { *(.text) *(.text.*) *(.rodata) *(.rodata*) } > APP
```
**Su Pebble le stringhe costanti costano RAM, non solo flash.** Con molte stringhe (menu lunghi, localizzazione, tabelle di lookup) conviene:
1. metterle in una risorsa `"type": "raw"` e leggerle con `resource_load_byte_range()` quando servono;
2. oppure usare `i18n` / `setlocale` dell'SDK.

Una tabella di 200 stringhe da 30 caratteri = 6 KB di `virtual_size` che potresti recuperare interamente.

### 5.9 Usare il worker con parsimonia

* Solo **10,5 KB** totali (code+data+bss+heap+stack di 1.400 B).
* **Uno solo nel sistema**: se l'utente ne ha già uno attivo, il tuo lancio chiede conferma (`APP_WORKER_RESULT_ASKING_CONFIRMATION`).
* API disponibili nel worker: sottoinsieme (niente UI).
* La doc dice esplicitamente: *"This API should **not** be used to build background timers; use the **Wakeup API** instead."*
* Comunicazione FG↔BG: `AppWorkerMessage` (`data0`, `data1`, `data2` — 3 × `uint16_t`), `persist`, o DataLogging.

**Per un'app offline‑first, quasi sempre `wakeup_schedule()` + `persist` batte il worker**: zero RAM residente, zero conflitti con altre app, meno batteria.

### 5.10 Performance grafica su emery

* Framebuffer emery = **`GBitmapFormat8Bit`, 200 × 228 = 45.600 byte**, in RAM di sistema (non nel tuo budget). Fonte: <https://developer.repebble.com/guides/graphics-and-animations/framebuffer-graphics/>.
* Accesso diretto (il modo più veloce di disegnare, **zero allocazioni**):
  ```c
  static void update_proc(Layer *layer, GContext *ctx) {
    GBitmap *fb = graphics_capture_frame_buffer(ctx);
    for (int y = 0; y < bounds.size.h; y++) {
      GBitmapDataRowInfo info = gbitmap_get_data_row_info(fb, y);  // 1 volta per riga!
      for (int x = info.min_x; x <= info.max_x; x++) { info.data[x] = ...; }
    }
    graphics_release_frame_buffer(ctx, fb);
  }
  ```
  La doc avverte: chiamare `gbitmap_get_data_row_info()` per ogni pixel *"will incur a significant speed penalty"*.
* `layer_mark_dirty()` solo sul layer effettivamente cambiato, non sul root layer.
* Il team Pebble segnala che *"the biggest consumers of power are backlight, **watchfaces with a lot of animations** and health tracking"* (<https://repebble.com/blog/pebble-mega-update-july-2026>, 14/07/2026) — su una watchface preferisci `MINUTE_UNIT` a `SECOND_UNIT`.
* Layout: mai valori hardcoded. Usa `layer_get_unobstructed_bounds()`, `PBL_DISPLAY_WIDTH` / `PBL_DISPLAY_HEIGHT`, `ACTION_BAR_WIDTH`, `STATUS_BAR_LAYER_HEIGHT`, `PBL_IF_COLOR_ELSE()`, `PBL_IF_RECT_ELSE()`, `PBL_API_EXISTS(fn)`.

---

## 6. Trappole che crashano sull'hardware reale (ma non in emulatore)

**Premessa importante:** contrariamente a un mito diffuso, **l'emulatore ha esattamente lo stesso budget di RAM dell'hardware** (`soc/qemu/Kconfig.defconfig`: *"QEMU mirrors the SRAM layout of the platform it emulates"*). Le differenze sono altrove.

| # | Trappola | Perché in emulatore non si vede | Stato |
|---|---|---|---|
| 1 | **Puntatori a buffer di stack passati a `text_layer_set_text()`** | l'API non copia; in emulatore lo stack non viene riusato subito, su hardware sì (interrupt, BT, sensori) | **[INFERENZA forte]** |
| 2 | **Use‑after‑free** | il fuzzing dell'heap su free è **disabilitato per le app di terze parti** (`enable_heap_fuzzing = (sdk_type == ProcessAppSDKType_System)`): la memoria liberata resta leggibile finché non viene riusata | **CONFERMATO** (`app_manager.c`) |
| 3 | **`app_message_open(app_message_inbox_size_maximum(), ...)`** alloca 8200+8200 B | `app_message_inbox_size_maximum()` dipende da `sys_app_pp_has_capability(CommSessionAppMessage8kSupport)`, cioè **dalle capability del telefono connesso**: emulatore (pypkjs) e telefono reale possono restituire valori diversi → l'app "entra" in RAM in emulatore e va OOM col telefono vero (o viceversa) | **CONFERMATO nel codice**, valore emulatore non verificato |
| 4 | **Doppia `free()` / `*_destroy()` chiamata due volte** | su SDK moderni è `PBL_CROAK` **ovunque**, ma spesso emerge solo in sessioni lunghe reali | **CONFERMATO** (`process_heap.c`) |
| 5 | **Binari da toolchain ARM recenti** con tabelle di rilocazione non allineate | prima dell'SDK 4.33 l'app loader poteva **corrompere memoria** invece di rifiutare il binario | **CONFERMATO** — changelog 4.33: *"The app loader now accepts binaries produced by newer ARM toolchains (unaligned relocation tables and targets) and rejects malformed binaries cleanly instead of corrupting memory."* |
| 6 | **Latenza di lettura risorse** | su hardware le risorse dell'app stanno su flash esterna SPI/MPI; in emulatore la flash è emulata in RAM → timer/animazioni tarati sull'emulatore possono saltare frame su hardware | **[INFERENZA]** |
| 7 | **`CONFIG_MMAP_RESOURCES`** attivo solo su SF32LB52 | in emulatore le risorse **di sistema** vengono copiate, su PT2 reale sono XIP zero‑copy → pressione diversa sull'heap **kernel** (non sul tuo) | **CONFERMATO** (`soc/sf32lb/Kconfig.defconfig` vs `soc/qemu/`) |
| 8 | **App SDK 3.x installata su PT2** gira in "bezel mode" con 64 KiB e 144×168 | l'emulatore `emery` con un binario emery non riproduce lo scenario | **CONFERMATO** (changelog 4.2‑beta4 + `Kconfig` 3X→BASALT) |
| 9 | **Watchface che crasha → revert automatico** alla watchface di sistema | comportamento del firmware, poco visibile in emulatore | **CONFERMATO** (commit 04/05/2026) |
| 10 | **`ScrollLayer` / `MenuLayer` embeddati per valore** | `sizeof(ScrollLayer)` è cresciuto in SDK 4.33: ricompilando cambia il layout della tua struct | **CONFERMATO** (changelog 4.33) |
| 11 | **Alloy/JS: `fxAbort memory full`** con ~88 KB di heap app liberi e inutilizzati (PT2, fw 4.17.0) → reboot e in casi estremi factory reset | riproducibile **anche** in emulatore, ma è la prova che il runtime JS ha una macchina statica da 32 KB indipendente dall'heap | **CONFERMATO** — <https://github.com/coredevices/pebbleos/issues/1621> (28/06/2026, chiuso) |
| 12 | Sensori/BT/batteria reali generano eventi e callback che l'emulatore non produce → race e riusi di memoria | — | **[INFERENZA]** |

Dato quantitativo utile dall'issue #1621: strumentazione su **Pebble Time 2 reale, fw 4.17.0**, `App bytes free = 87908` (~88 KB) all'avvio di un'app Alloy. Per un'app **in C** l'heap libero è ancora maggiore (128 KiB meno il tuo `virtual_size`).

---

## 7. Numeri di riferimento rapidi (cheat sheet)

```
emery (Pebble Time 2)          flint (Pebble 2 Duo)
─────────────────────────      ─────────────────────────
segmento app   135.168 B       segmento app    67.584 B
  stack          4.096 B         stack           2.048 B
  stack guard       32 B         stack guard        32 B
  budget       131.072 B       budget          65.536 B   (= MAX_APP_MEMORY_SIZE)
  di cui statico ≤ 65.535 B    di cui statico ≤ 65.535 B  (uint16 virtual_size)
AppState runtime 63.488 B      AppState runtime 30.720 B  (fuori budget)
worker           11.648 B      worker           11.648 B  (10.240 B linkati)
framebuffer      45.600 B      framebuffer       3.360 B  (RAM di sistema)
display        200 × 228 8bpp  display        144 × 168 1bpp
risorse appstore  262.144 B    risorse appstore 262.144 B
risorse sideload 1.048.576 B   risorse sideload 1.048.576 B
persist/app      1.048.576 B   persist/app     1.048.576 B  (256 B per chiave)
DataLogging        ~640 KB     DataLogging        ~640 KB
AppMessage min   124 / 636 B   AppMessage min   124 / 636 B
AppMessage max  8.200 / 8.200  AppMessage max  8.200 / 8.200
malloc overhead        4 B     LARGE_SIZE          256 B
```

---

## 8. Azioni consigliate

### 8.1 Setup dell'ambiente (Ubuntu 26.04, senza sudo)

1. **Installa `uv` in user space** (nessun sudo, va in `~/.local/bin`):
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   export PATH="$HOME/.local/bin:$PATH"
   ```
   (Python 3.14 di sistema va bene per lanciare `uv`, ma `pebble-tool` gira con un Python gestito da uv.)
2. **Installa il pebble-tool con un Python pinnato**:
   ```bash
   uv tool install pebble-tool --python 3.13
   pebble --version
   ```
   La doc ufficiale usa `--python 3.13`; il repo di riferimento `ArtRichards/pebble-time2-dev-setup` (verificato 12/07/2026) consiglia di **pinnare anche la versione del tool** (`uv tool install --force "pebble-tool==5.0.39" --python 3.13`).
3. **Installa l'SDK** — include il toolchain `arm-none-eabi-*`, quindi **non ti serve installare GCC ARM a parte**:
   ```bash
   pebble sdk install latest
   pebble sdk list
   pebble sdk activate 4.33.1      # o la versione risolta da "latest"
   ```
   Attenzione (documentato nel repo di setup): l'installazione **non è atomica**; se manca la directory `toolchain/` sotto `~/.local/share/pebble-sdk/SDKs/<ver>/`, disinstalla e reinstalla. Inoltre `pebble sdk install` **esce con codice ≠ 0** se l'SDK è già presente.
4. **Emulatore**: `pebble install --emulator emery` richiede a runtime `libsdl2`, `libglib2.0`, `libpixman-1`, `zlib`, `libsndio`, `libpng16` **e un display X/Wayland**. Su Ubuntu 26.04 desktop sono quasi certamente già installate; verifica **senza sudo** con:
   ```bash
   ldd ~/.local/share/pebble-sdk/SDKs/*/sdk-core/pebble/*/qemu/qemu-pebble 2>/dev/null | grep 'not found'
   ```
   Se manca qualcosa e non hai sudo: usa **CloudPebble** (<https://cloudpebble.repebble.com>) per l'emulatore, oppure `pebble install --cloudpebble` su un orologio reale.
5. **Node 22 + npm** che hai già bastano per la parte PKJS/risorse.

### 8.2 Configurazione di progetto (`package.json`) da adottare subito

```json
{
  "pebble": {
    "targetPlatforms": ["emery", "flint"],
    "sdkVersion": "4",
    "resources": {
      "media": [
        {
          "type": "bitmap", "name": "BG",
          "file": "images/bg.png",
          "memoryFormat": "SmallestPalette",
          "spaceOptimization": "memory",
          "targetPlatforms": ["emery"]
        },
        {
          "type": "bitmap", "name": "BG",
          "file": "images/bg_bw.png",
          "memoryFormat": "1BitPalette",
          "spaceOptimization": "memory",
          "targetPlatforms": ["flint"]
        },
        {
          "type": "font", "name": "TIME_48",
          "file": "fonts/myfont.ttf",
          "characterRegex": "[0-9:]"
        }
      ]
    }
  }
}
```

Checklist risorse:
- [ ] **`"spaceOptimization": "memory"` su ogni bitmap** (dimezza o più il picco di heap; il default su emery è `storage` = PNG).
- [ ] `memoryFormat` il più stretto possibile (`SmallestPalette` → 4/2/1 bit; `8Bit` solo se >16 colori davvero necessari).
- [ ] `characterRegex` su **ogni** font custom.
- [ ] **Icone e forme piatte in PDC**, non in bitmap.
- [ ] Asset separati per `emery` (colore, 200×228) e `flint` (B/N, 144×168) via `targetPlatforms` o suffissi `~color` / `~bw`.
- [ ] `menuIcon` 25×25; su `flint` serve `"memoryFormat": "1Bit"` per le watchface.

### 8.3 Regole di codice da mettere nel CLAUDE.md / code review

1. **Ogni `*_create()` ha il suo `*_destroy()` nello stesso file, in `window_unload`.** Setta il puntatore a `NULL` dopo.
2. **Controlla il ritorno di ogni `*_create()` e `malloc()`.** Su OOM degrada elegantemente, non crashare.
3. **Zero floating point.** Fixed point + `sin_lookup`/`cos_lookup`/`atan2_lookup`. Nessun `%f`.
4. **Nessun array > ~200 byte sullo stack.** Buffer `static` file‑scope.
5. **Le stringhe passate a `text_layer_set_text()` devono essere `static` o su heap**, mai locali.
6. **`app_message_open()` dimensionato con `dict_calc_buffer_size()`**, mai con `*_size_maximum()` a meno di averne davvero bisogno; `app_message_close()` quando la sync è finita.
7. **Alloca prima tutto ciò che è ≥ 256 byte e long‑lived**, poi il resto.
8. **Un solo log di memoria per fase** (`init`, `window_load`, `window_unload`, `deinit`) con `heap_bytes_free()`/`heap_bytes_used()`.
9. **Mai valori di layout hardcoded**: `layer_get_unobstructed_bounds()`, `PBL_DISPLAY_*`, `ACTION_BAR_WIDTH`, `STATUS_BAR_LAYER_HEIGHT`.
10. **Niente `SECOND_UNIT`** su una watchface, salvo animazione voluta e limitata nel tempo.
11. **Niente `app_worker_launch()`** se `wakeup_schedule()` + `persist` bastano.
12. **`#if PBL_API_EXISTS(fn)`** per ogni API introdotta dopo il 2026 (`persist_get_max_size`, `alarm_service_peek_next`, `tap_recognizer_create`, `backlight_service_subscribe`, ...).

### 8.4 Strategia offline‑first (obiettivo 3)

* **`persist` come database locale**: fino a 1 MiB per app, 256 byte per chiave. Schema tipico: chiave 0 = header/versione/contatore, chiavi 1..N = record. Verifica il budget con `persist_get_max_size()` e degrada a 4 KB se l'API non esiste.
* **Dataset statici in risorse `raw`** letti con `resource_load_byte_range()`: fino a 1 MB sideload / 256 KB appstore, **zero costo di RAM** se streammi.
* **`wakeup_schedule()`** per il refresh periodico invece di un worker sempre acceso.
* **AppMessage opportunistico**: `connection_service_subscribe()` per sapere se il telefono c'è; se non c'è, lavora sulla cache e non aprire i buffer.
* **`app_glance_reload()`** per mostrare informazioni aggiornate nel launcher anche ad app chiusa.
* **DataLogging solo se hai un'app companion nativa** (Android/iOS): PebbleKit JS non può riceverlo.

### 8.5 Strategia "sfruttare al meglio il display PT2" (obiettivo 2)

* 200 × 228 @ 202 PPI, 64 colori, 8 bpp, **touch** (`PBL_TOUCH`) e **backlight RGB** (`PBL_RGB_BACKLIGHT`) — define esclusivi di emery.
* Usa la **palette a 64 colori ufficiale** (file `.act` / `.aseprite` / `.pal` / `.gif` scaricabili da <https://developer.repebble.com/guides/app-resources/images/>) per evitare dithering imprevisto in fase di conversione.
* Con 22.848 byte si copre l'intero schermo in `4BitPalette`: un fondo full‑screen a 16 colori è perfettamente sostenibile su emery (≈18% del budget). **Su flint lo stesso design va rifatto in 1 bit.**
* Per grafica nitida e leggera preferisci **PDC + `graphics_fill_radial()` / `graphics_draw_arc()` / `gpath`** invece di grandi bitmap.
* SDK 4.33 (12/08/2026) ha aggiunto le **Recognizer API touch** (`tap_recognizer_create`, `pan_recognizer_create`, `swipe_recognizer_create`, `window_attach_recognizer`, `app_touch_navigation_enable`): sono l'unico modo per sfruttare davvero il touch del PT2. Costano heap (i recognizer sono oggetti) → attivarli solo dove servono.
* Supporta il **Timeline Quick View** nelle watchface (`layer_get_unobstructed_bounds()` + `unobstructed_area_service_subscribe()`); Core Devices lo raccomanda esplicitamente nel post del 02/04/2026.

### 8.6 Misurazione continua

```bash
# 1. Budget statico e heap teorico, a ogni build
pebble build 2>&1 | grep -A4 "MEMORY USAGE"

# 2. Chi occupa il footprint statico
pebble analyze-size --verbose | head -60
arm-none-eabi-nm --size-sort -S -C build/emery/pebble-app.elf | tail -30

# 3. Heap reale a runtime
pebble install --emulator emery && pebble logs --emulator emery

# 4. Debug approfondito
pebble build --debug && pebble install --emulator emery && pebble gdb
```
Metti "Free RAM available (heap)" in un check CI: se scende sotto una soglia (es. 60 KB su emery), fallisci la build.

---

## 9. Domande aperte / non verificate

1. Non ho trovato un valore ufficiale per **il blocco contiguo libero più grande** esposto alle app: `heap_bytes_free()` è un totale. (Il firmware calcola `max_free` internamente in `lib/util/heap.c` ma non lo esporta.)
2. Non ho verificato **quale valore restituisce `app_message_inbox_size_maximum()` nell'emulatore emery** (dipende da `CommSessionAppMessage8kSupport` annunciato da pypkjs).
3. Il SoC del **Pebble Time 2 del 2016** (progetto cancellato) non è documentato nelle fonti attuali; so solo che il nome piattaforma `emery`, la risoluzione 200×228 e il limite di 128 KB risalgono all'SDK 4.2‑beta4 (12/10/2016).
4. Non ho trovato documentazione ufficiale che dica se e quando i **16 MB di PSRAM** del SF32LB52J saranno esposti alle app (la nota `*5` dice solo "may be enabled in future versions").
5. Non ho verificato se e come il firmware **scala graficamente** un'app basalt (144×168) sul display 200×228 in "bezel mode" (letterbox vs upscaling).
6. Il costo esatto in RAM della **struct `upng_t`** e della finestra di inflate durante la decodifica PNG non è quantificato nelle fonti; ho verificato solo il pattern di doppia allocazione.
7. Non ho trovato conferma su dove risieda fisicamente il **buffer di 640 kB di DataLogging** (probabilmente PFS su flash, non RAM).

---

## 10. Fonti

**Documentazione ufficiale (developer.repebble.com — consultata il 24/08/2026)**
* Hardware Information — <https://developer.repebble.com/guides/tools-and-resources/hardware-information/>
* FAQ (sezioni Memory Management, Memory and Resources, Platforms and Devices) — <https://developer.repebble.com/faqs/>
* Building for Every Pebble — <https://developer.repebble.com/guides/best-practices/building-for-every-pebble/>
* Images (memoryFormat / storageFormat / spaceOptimization) — <https://developer.repebble.com/guides/app-resources/images/>
* Fonts (characterRegex) — <https://developer.repebble.com/guides/app-resources/fonts/>
* Animated Images — <https://developer.repebble.com/guides/app-resources/animated-images/>
* Framebuffer Graphics — <https://developer.repebble.com/guides/graphics-and-animations/framebuffer-graphics/>
* Background Worker — <https://developer.repebble.com/guides/events-and-services/background-worker/>
* Datalogging — <https://developer.repebble.com/guides/communication/datalogging/>
* Sending and Receiving Data — <https://developer.repebble.com/guides/communication/sending-and-receiving-data/>
* Common Runtime Errors — <https://developer.repebble.com/guides/debugging/common-runtime-errors/>
* Command Line Tool — <https://developer.repebble.com/guides/tools-and-resources/pebble-tool/>
* API C: Memory Management — <https://developer.repebble.com/docs/c/Foundation/Memory_Management/>
* API C: Storage — <https://developer.repebble.com/docs/c/Foundation/Storage/>
* API C: AppMessage — <https://developer.repebble.com/docs/c/Foundation/AppMessage/>
* API C: Dictionary — <https://developer.repebble.com/docs/c/Foundation/Dictionary/>
* API C: Resources — <https://developer.repebble.com/docs/c/Foundation/Resources/>
* API C: Math — <https://developer.repebble.com/docs/c/Foundation/Math/>
* API C: Standard_C/Format, /Memory, /Math — <https://developer.repebble.com/docs/c/Standard_C/Format/>
* Graphics Types (GBitmapFormat) — <https://developer.repebble.com/docs/c/Graphics/Graphics_Types/>
* Installazione SDK — <https://developer.repebble.com/sdk/>

**Changelog SDK**
* 4.33.1 — 14/08/2026 — <https://developer.repebble.com/sdk/changelogs/4.33.1/>
* 4.33 — 12/08/2026 — <https://developer.repebble.com/sdk/changelogs/4.33/>
* 4.17 — 23/06/2026 — <https://developer.repebble.com/sdk/changelogs/4.17/>
* 4.2-beta4 ("Emery Edition") — 12/10/2016 — <https://developer.repebble.com/sdk/changelogs/4.2-beta4/>

**Sorgenti PebbleOS (github.com/coredevices/pebbleos, branch `main`, letti il 24/08/2026)**
* `Kconfig` (App RAM sizes) · `src/fw/linker/memory.ld` · `src/fw/linker/regions.ld`
* `src/fw/process_management/app_manager.c` · `worker_manager.c` · `process_heap.c` · `pebble_process_md.c`
* `lib/util/heap.c` · `include/pbl/util/heap.h` · `src/fw/applib/app_heap_util.c`
* `src/fw/applib/applib_resource.c` · `src/fw/resource/resource_storage_flash.c`
* `src/fw/applib/graphics/gbitmap.c` · `gbitmap_png.c` · `gdraw_command_image.c` · `text_resources.h`
* `src/fw/applib/fonts/fonts.c` · `src/fw/applib/applib_malloc.json`
* `src/fw/applib/app_message/app_message.c` · `app_message_inbox.c` · `app_message_outbox.c` · `app_message_internal.h` · `src/fw/applib/app_inbox.c`
* `src/fw/applib/persist.h` · `src/fw/services/persist/service.c` · `src/fw/util/dict.c` · `dict.h`
* `tools/pebble_sdk_platform.py` · `tools/waf/pebble_sdk_gcc.py` · `sdk/pebble_app.ld.template`
* `sdk/tools/inject_metadata.py` · `sdk/tools/memory_reports.py` · `sdk/waftools/report_memory_usage.py`
* `tools/resources/resource_map/resource_generator_bitmap.py` · `tools/generate_native_sdk/exported_symbols.json`
* `soc/sf32lb/Kconfig.defconfig` · `soc/nrf/Kconfig.defconfig` · `soc/qemu/Kconfig.defconfig`
* `boards/obelix/defconfig` · `boards/asterix/defconfig` · `boards/qemu_emery/defconfig`
* Issue #1621 — 28/06/2026 — <https://github.com/coredevices/pebbleos/issues/1621>

**pebble-tool**
* <https://github.com/coredevices/pebble-tool> — `pebble_tool/commands/sdk/project/analyse_size.py`, `commands/debug.py` (letti 24/08/2026)

**Blog Core Devices**
* "CloudPebble Returns! Plus New Pure JavaScript and Round 2 SDK" — 20/02/2026 — <https://repebble.com/blog/cloudpebble-returns-plus-pure-javascript-and-round-2-sdk>
* "Spring 2026 Pebble App Contest + SDK Updates" — 02/04/2026 — <https://repebble.com/blog/spring-2026-pebble-app-contest>
* "Pebble Mega Update - July 2026" — 14/07/2026 — <https://repebble.com/blog/pebble-mega-update-july-2026>

**Community (confidenza minore)**
* `coredevices/pebble-watchface-agent-skill` — skill ufficiale Claude Code, aggiornata 05/08/2026 — <https://github.com/coredevices/pebble-watchface-agent-skill> (⚠ contiene un errore: elenca `flint` come 64‑color)
* `ArtRichards/pebble-time2-dev-setup` — setup Linux verificato il 12/07/2026 — <https://github.com/ArtRichards/pebble-time2-dev-setup>
* Mirror storico documentazione Rebble — <https://developer.rebble.io/guides/tools-and-resources/hardware-information/>

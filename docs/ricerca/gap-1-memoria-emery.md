# Gap 1 — Budget RAM reale di un'app nativa `emery` (Pebble Time 2) con SDK 4.33.1

*Ricerca del 2026-08-24. Fonti primarie: sorgenti `coredevices/PebbleOS` (branch `main` e tag `v4.33.2`, che è il firmware eseguito dall'emulatore dell'SDK 4.33.1), changelog SDK 4.33/4.33.1, issue/PR GitHub di Core Devices. Le informazioni del 2016 sulla vecchia Pebble Time 2 (mai spedita) sono citate solo dove servono a spiegare la genesi dei numeri.*

---

## 0. Risposta breve (TL;DR)

| Domanda | Risposta | Livello di conferma |
|---|---|---|
| Quanto heap ottiene a runtime un'app nativa `emery` costruita con SDK 4.33.1? | **`heap ≈ 131 072 B − virtual_size`**, dove `virtual_size = .text + .data + .bss` dell'app (≤ 65 535 B). Quindi **tra ~64 KiB (app al massimo statico) e ~128 KiB (app minuscola)**; per una watchface tipica di 20–35 KiB di immagine: **~95–110 KiB di heap**. | CONFERMATO dai sorgenti firmware (Kconfig + `app_manager.c` + `heap.c`), non ancora misurato su hardware da fonti pubbliche |
| Una singola `malloc()` > 64 KiB riesce? | **Sì.** L'allocatore accetta blocchi fino a **~131 060 B** (campo `Size:15` in unità da 4 B, `SEGMENT_SIZE_MAX 0x7FFF`). Una `malloc(96*1024)` riesce se l'heap è ≥ ~98,3 KB, cioè se `virtual_size ≤ ~32,7 KB`. **Attenzione:** `realloc()` di un blocco ≥ 65 536 B è bacato (troncamento `uint16_t` in `heap_realloc`) — allocare una volta sola, mai `realloc()` su blocchi grandi. | CONFERMATO (lettura del codice); bug realloc INFERITO dal codice, non testato |
| Come si riconciliano `SEGMENT_SIZE=135 168`, `RUNTIME_SIZE=63 488` e la frase del changelog 4.33 «loaded image and RAM footprint are still limited to 64 KiB each»? | `135 168 = 4 096 (stack+guard) + 131 072 (immagine + heap)`. Il «64 KiB» del changelog è il **limite statico** `PebbleProcessInfo.virtual_size`/`load_size` (`uint16_t`), **non** l'heap. `RUNTIME 63 488` è la regione separata per `AppState` (che contiene il framebuffer 200×228×8 bit = 45 600 B): **non sottrae nulla all'heap**. | CONFERMATO |
| L'emulatore QEMU `emery` applica lo stesso budget dell'hardware? | **Sì a livello di configurazione**: `boards/qemu_emery/defconfig` seleziona `PLATFORM_EMERY`; `soc/qemu/Kconfig.defconfig` usa `SRAM_SIZE 0x7fc00` identico all'SF32LB52 («QEMU mirrors the SRAM layout of the platform it emulates»). Stessi `CONFIG_APP_RAM_4X_*`, stesso stack da 4 KiB. | CONFERMATO nei sorgenti; il binario QEMU distribuito con l'SDK è compilato da questi stessi file (assunzione ragionevole, non verificata bit a bit) |
| Quanto heap resta dopo framebuffer/AppState? | **Tutto**: framebuffer e `AppState` vivono nella regione RUNTIME (63 488 B), fuori dal segmento app. L'heap è ridotto solo da `virtual_size` e dallo stack (4 KiB). | CONFERMATO |

---

## 1. La mappa di memoria di `emery` ricavata dai sorgenti

### 1.1 Costanti Kconfig (identiche su `main` e sul tag `v4.33.2`)

Da `Kconfig` (righe ~104–206), commento originale:

> «For each environment, SEGMENT is the RAM given to the app itself (stack + text + data + bss + heap) and RUNTIME is the RAM reserved for the application runtime (AppState). […] emery and gabbro use a 4 KiB app stack (see APP_STACK_NORMAL_SIZE); their segment is sized 2 KiB larger to compensate. All other platforms keep the 2 KiB stack and the historical segment sizes.»

| Piattaforma | `APP_RAM_*_SEGMENT_SIZE` | `APP_RAM_*_RUNTIME_SIZE` | Stack app | Immagine+heap = SEGMENT − stack |
|---|---:|---:|---:|---:|
| aplite | 25 952 | 6 820 | 2 048 | 23 904 |
| basalt / chalk | 67 584 | 30 720 | 2 048 | 65 536 (64 KiB) |
| **flint (Pebble 2 Duo)** | **67 584** | **30 720** | 2 048 | **65 536 (64 KiB)** |
| **emery (Pebble Time 2)** | **135 168** | **63 488** | **4 096** | **131 072 (128 KiB)** |
| gabbro | 135 168 | 96 256 | 4 096 | 131 072 (128 KiB) |

Nota storica: 135 168 = 133 120 (i «130K» del 2016, con stack 2 KiB) + 2 048. Il budget «128 KiB per immagine+heap» di emery è quindi lo stesso dal 2016; Core Devices ha solo raddoppiato lo stack.

Gli ambienti «2X/3X/4X» sono gli ambienti di esecuzione per app compilate con SDK 2.x/3.x/4.x. Su emery: `2X → aplite (25 952+6 820)`, `3X → basalt (67 584+30 720)`, `4X → emery`. Un'app compilata con SDK 4.33.1 riceve `sdk_version 5.106` (`PROCESS_INFO_CURRENT_SDK_VERSION 0x5.0x6a` in `inject_metadata.py`) ≥ `first_4x_version 5.80` → è un'app **4.x** e riceve il segmento pieno (`process_metadata_get_app_sdk_type()` in `pebble_process_md.c`).

### 1.2 Layout SRAM (da `src/fw/linker/memory.ld` + `soc/sf32lb/Kconfig.defconfig`)

- SRAM SF32LB52 (obelix = Pebble Time 2): `SRAM_SIZE = 0x7fc00` = 523 264 B («512 KiB of SRAM, last 1 KiB reserved for LCPU IPC»).
- `APP_RAM = max_env(SEGMENT + RUNTIME) = 135 168 + 63 488 = 198 656 B` (194 KiB), in cima alla SRAM.
- `WORKER_RAM = 12 288 B` fissi (`PBL_WORKER_RAM_SIZE`); l'SDK dà al worker `MAX_WORKER_MEMORY_SIZE 0x2800` = 10 KiB.
- `KERNEL_RAM = 523 264 − 12 288 − 198 656 = 312 320 B` (305 KiB).

### 1.3 Cosa succede al lancio (da `src/fw/process_management/app_manager.c`, `prv_app_start()`)

1. `app_segment_size = CONFIG_APP_RAM_4X_SEGMENT_SIZE` = 135 168 (per app Alloy/Moddable: `135 168 − (8 192 − 4 096)` = 131 072, perché lo stack JS è 8 KiB).
2. `memory_segment_split(&app_ram, &app_segment, 135 168)`: il resto di `app_ram` (63 488 B) va ad `app_state_configure()`.
3. Dalla cima di `app_segment` si ritagliano `stack_guard 32 B` + `stack 4 064 B` (= 4 096 B; `APP_STACK_NORMAL_SIZE (4*1024)` solo se `CONFIG_PLATFORM_EMERY || CONFIG_PLATFORM_GABBRO`).
4. `process_loader_load()` copia l'immagine (`load_size` + tabella rilocazioni) all'inizio del segmento, applica le rilocazioni, azzera `.bss`, e poi fa `memory_segment_split(destination, NULL, virtual_size)` (allineamento a 8 B).
5. `heap_init(app_heap, app_segment.start, app_segment.end)` → **heap = tutto ciò che resta**: `131 072 − align8(virtual_size)` meno 0–7 B di allineamento.

`heap.c` (`lib/util/heap.c`): `heap_size = MIN(SEGMENT_SIZE_MAX, heap_size)` con `SEGMENT_SIZE_MAX 0x7FFF` unità da 4 B = 131 068 B → non morde mai su emery (l'heap è sempre < 131 072 − virtual_size).

### 1.4 La regione RUNTIME (63 488 B) e il framebuffer

`app_state_configure()` (`src/fw/process_state/app_state/app_state.c`) ritaglia `sizeof(AppState)` dalla regione RUNTIME. `AppState` contiene per valore `FrameBuffer framebuffer` che, con `CONFIG_SCREEN_COLOR_DEPTH_BITS_8`, è `uint8_t buffer[DISPLAY_FRAMEBUFFER_BYTES]` = `200 × 228` = **45 600 B** (`src/fw/applib/graphics/8_bit/framebuffer.h`, `display_qemu_emery.h`), più `GContext`, `RecognizerManager`, stati dei servizi, ecc. Per app 4.x `app_manager_get_framebuffer_size()` restituisce `GSize(200, 228)`. Lo spazio RUNTIME avanzato dopo `AppState` è usato **solo** per app Legacy2x (framebuffer 1-bit 144×168); per app 4.x resta inutilizzato. **Conclusione: il framebuffer non consuma heap dell'app.**

Per `flint` (Pebble 2 Duo, 1-bit): framebuffer = 200/8 × 228 = 5 700 B, sempre in RUNTIME (30 720 B); heap = `65 536 − virtual_size`, stack 2 KiB.

---

## 2. Riconciliazione con il changelog SDK 4.33 («64 KiB each»)

Testo esatto del changelog SDK 4.33 (2026-08-12):

> «The maximum app binary size on Emery and Gabbro is now 128 KiB (up from 64 KiB). The loaded image and RAM footprint are still limited to 64 KiB each; the extra room is available for relocation data.»

Interpretazione confermata dai sorgenti e dalla PR #1827 (merged 2026-08-03, «sdk: honour the platform's MAX_APP_BINARY_SIZE when injecting metadata»):

- `PebbleProcessInfo.load_size` e `.virtual_size` sono **`uint16_t`** (`pebble_process_info.h` righe 219 e 248) → immagine caricata (`.text+.data`) ≤ 65 535 B e footprint statico (`.text+.data+.bss`) ≤ 65 535 B. L'SDK lo verifica in `sdk/tools/inject_metadata.py` (`MAX_PROCESS_INFO_SIZE_FIELD = 0xFFFF`); il firmware lo verifica in `app_storage.c` (`APP_MAX_SIZE = 0x10000` su `virtual_size`) e in `process_loader_storage.c` (`virtual_size > segment_size`).
- Il «128 KiB binary» (`MAX_APP_BINARY_SIZE 0x20000` in `tools/pebble_sdk_platform.py` per emery/gabbro) riguarda solo il file `.bin`: i byte oltre `load_size` sono la tabella rilocazioni, caricata temporaneamente sopra `.bss` e poi azzerata; non occupano RAM dopo il load.
- **«RAM footprint» nel changelog = footprint statico, non heap.** L'heap non è limitato a 64 KiB: heap + immagine = 128 KiB. Dalla PR #1827: «This does not give emery/gabbro 128 KB of application memory […] `virtual_size` still caps static footprint at 65535 on every platform; widening that would need a `PROCESS_INFO_CURRENT_STRUCT_VERSION` bump and matching changes in the mobile bundle parsers.»
- L'issue #1873 (aperta il 2026-08-16, «Emery/Gabbro apps are capped at ~64K virtual_size everywhere, despite docs/tooling advertising 128K») documenta empiricamente con SDK 4.33.1: `Total footprint in RAM: 60232 bytes / 128.0KB`; aggiungendo 8 KiB di `.bss` (→ 68 440 B) il build fallisce con «App virtual size is 68440 bytes (.text + .data + .bss). Must be 65535 bytes or smaller, because PebbleProcessInfo.virtual_size is a uint16_t». Il commento del 2026-08-20 nota che il changelog PebbleOS su ndocs.repebble.com dice «SDK: emery/gabbro apps can now use the full 128 KB binary limit, was wrongly capped at 64 KB» (formulazione ottimistica) mentre quello SDK è «più onesto». **Stato: ancora aperta alla data odierna.**
- La tabella hardware Rebble («Max App Size (code + heap): 128k*5» per Emery; nota 5: «SF32LB52J SoCs also have 16MB of PSRAM that is not currently enabled in PebbleOS») è corretta come somma code+heap, fuorviante sul codice. La PR #1602 «enable psram on emery/gabbro» (2026-06-24) è stata **chiusa senza merge**: nessuna PSRAM per le app oggi.

---

## 3. La riga «Free RAM available (heap)» del build report: quanto è affidabile su emery?

`sdk/waftools/report_memory_usage.py`: `ram_size = sum(size(bin_path))` (text+data+bss via binutils `size`), `free_ram = MAX_APP_MEMORY_SIZE − ram_size` con `MAX_APP_MEMORY_SIZE = 0x20000` per emery; stampa (`sdk/tools/memory_reports.py`):

```
-------------------------------------------------------
EMERY APP MEMORY USAGE
Total size of resources:        N bytes / 256.0KB
Total footprint in RAM:         X bytes / 128.0KB
Free RAM available (heap):      131072 - X bytes
-------------------------------------------------------
```

Poiché `135 168 − 4 096 = 131 072 = 0x20000` esatto, **su emery la riga «Free RAM available (heap)» coincide con l'heap reale a meno di 0–7 B di allineamento** (a differenza di aplite dove sovrastima di ~670 B). Il commento «This number is a rough estimate» in `inject_metadata.py` è un residuo. Due avvertenze:

1. La riga mostra «/ 128.0KB» ma il **build fallisce comunque a 65 535 B** di footprint statico (vedi §2).
2. Il linker (`sdk/pebble_app.ld.template`: `APP (rwx) : ORIGIN = 0, LENGTH = @MAX_APP_MEMORY_SIZE@` = 128 K) non ti protegge: è `inject_metadata.py` a fermarti.

Tabella heap atteso (app 4.x nativa su emery):

| `virtual_size` (.text+.data+.bss) | Heap atteso | `malloc` singola massima (~) |
|---:|---:|---:|
| 10 000 | ~121 000 | ~120 KiB (cap allocatore ~131 060 B non raggiunto) |
| 20 000 | ~111 000 | ~108 KiB |
| 30 000 | ~101 000 | ~98 KiB |
| 40 000 | ~91 000 | ~88 KiB |
| 50 000 | ~81 000 | ~79 KiB |
| 60 232 (esempio issue #1873) | 70 840 | ~69 KiB |
| 65 535 (massimo) | ~65 536 | ~64 KiB |

Per app Alloy/Moddable (stack 8 KiB): sottrarre altri 8 192 B (`122 880 − virtual_size`).

---

## 4. Semantica dell'allocatore e delle API di misura

- `heap_bytes_free()` = `heap_size(heap) − heap->current_size`; `heap_bytes_used()` = `heap->current_size` (`src/fw/applib/app_heap_util.c`). `current_size` include gli header dei blocchi (4 B senza `CONFIG_MALLOC_INSTRUMENTATION`, 8 B con). **È il totale libero, non il blocco contiguo massimo**; `heap_calc_totals()` (che calcola `max_free`) è solo kernel. Per sapere se una `malloc` grande riesce bisogna provarla.
- Header blocco `HeapInfo_t`: `uint16_t PrevSize; bool is_allocated:1; uint16_t Size:15;` in unità di `Alignment_t` (= `unsigned long` = 4 B su Cortex-M33). Limite blocco: `allocation_size >= SEGMENT_SIZE_MAX (0x7FFF)` → NULL, cioè **max ≈ 131 060 B per singola allocazione**. Allocazioni ≥ 256 B (`LARGE_SIZE`) vengono prese dalla fine dell'heap, quelle piccole dall'inizio: buona resistenza alla frammentazione se i buffer grandi sono allocati una volta all'avvio.
- `applib_malloc()` (`tools/applib_malloc.template.c`): per app di terze parti un fallimento restituisce semplicemente `NULL` (il croak OOM scatta solo per task privilegiati). Controllare sempre il ritorno.
- **Bug `heap_realloc()`** (`lib/util/heap.c` riga 532, presente sia su `main` sia su `v4.33.2`): `const uint16_t original_size = heap_info_ptr->Size * ALIGNMENT_SIZE;` → per blocchi ≥ 65 536 B la dimensione viene troncata modulo 65 536 e `memcpy` copia troppo poco: **perdita silenziosa di dati**. Mai `realloc()` su blocchi ≥ 64 KiB (allocare la dimensione finale subito). Vale la pena segnalarlo come issue upstream.
- Stack app = 4 096 B (incl. guard 32 B): array locali > ~3,5 KiB o ricorsioni profonde crashano l'app.

---

## 5. Emulatore QEMU `emery` vs hardware

- `boards/qemu_emery/defconfig`: `CONFIG_SOC_QEMU=y`, `CONFIG_CORTEX_M33=y`, `CONFIG_PLATFORM_EMERY=y`, `CONFIG_SCREEN_COLOR_DEPTH_BITS_8=y`, `CONFIG_MODDABLE_XS=y`, `CONFIG_APP_SCALING=y`.
- `soc/qemu/Kconfig.defconfig`: «QEMU mirrors the SRAM layout of the platform it emulates», `SRAM_BASE 0x20000000`, `SRAM_SIZE 0x7fc00` (0x3ff00 solo per flint).
- `boards/obelix/defconfig` (Pebble Time 2 reale): `CONFIG_SOC_SF32LB52=y`, `CONFIG_PLATFORM_EMERY=y`, `CONFIG_SCREEN_COLOR_DEPTH_BITS_8=y`, `CONFIG_MODDABLE_XS=y`.
- Nessuna delle due board sovrascrive `APP_RAM_*`: quindi **stesso segmento (135 168), stesso RUNTIME (63 488), stesso stack (4 KiB), stesso heap risultante**. Il changelog SDK 4.33.1 (2026-08-14) dice che l'emulatore esegue il firmware 4.33.2; il tag `v4.33.2` ha esattamente questi valori (verificato).
- Misure pubbliche coerenti: issue #1621 (2026-06-28, fw 4.17.0, app Alloy, «Testing: real hardware and emery emulator (both affected)») riporta «App bytes free = 87 908» a creazione della VM XS; issue #1592 (2026-06-23, hardware, fw 4.17.0) riporta «App bytes free ~66 000–70 000» per un'altra app Alloy. Entrambe compatibili con `122 880 − immagine`. PR #1827: un'immagine da 126 932 B (load_size 64 132 + 15 700 rilocazioni) «installs in the emery emulator and reports all 15700 pointers correctly relocated at runtime».
- Residuo non verificabile senza test: eventuali differenze di `CONFIG_MALLOC_INSTRUMENTATION` (4 B/blocco) e la versione esatta del binario QEMU scaricato da `pebble sdk install`. Impatto trascurabile.

**Nessuna misura pubblica di `heap_bytes_free()` da app C nativa su Pebble Time 2 reale è stata trovata** (Discord/Reddit non indicizzati; changelog 4.17/4.9.x non parlano di memoria). Il numero va misurato con il probe qui sotto: la derivazione dai sorgenti è però solida.

---

## 6. Probe empirico pronto all'uso

### 6.1 Setup su Linux senza sudo (Ubuntu 26.04, Python 3.14, Node 22)

```bash
# uv in user space (se manca)
curl -LsSf https://astral.sh/uv/install.sh | sh          # installa in ~/.local/bin
# pebble-tool: la doc ufficiale usa "uv tool install pebble-tool" (Python >= 3.10);
# il setup verificato il 2026-07-12 pinna 5.0.39 con Python 3.13 gestito da uv:
uv tool install --force "pebble-tool==5.0.39" --python 3.13
pebble sdk install latest        # scarica SDK 4.33.1 + toolchain arm-none-eabi + QEMU
pebble sdk activate 4.33.1
```

Il README di `coredevices/pebble-tool` conferma: «The toolchain (arm-none-eabi) and QEMU binary are no longer bundled, but instead installed when `pebble sdk install` is run» (percorso tipo `~/.local/share/pebble-sdk/SDKs/<ver>/toolchain/` o `~/.pebble-sdk`). Quindi **niente `arm-none-eabi-gcc` di sistema né sudo per il compilatore**. L'unico rischio senza sudo sono le librerie condivise del QEMU precompilato (`libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g libsndio7.0 libpng16`): verificare con

```bash
Q=$(find ~/.local/share/pebble-sdk ~/.pebble-sdk -name 'qemu-system-arm*' -type f 2>/dev/null | head -1)
ldd "$Q" | grep 'not found'
```

Se manca qualcosa, installare le librerie in user space (es. micromamba da conda-forge: `sdl2 glib pixman zlib libsndio libpng`) ed esportare `LD_LIBRARY_PATH` prima di `pebble install --emulator` (workaround non testato). L'emulatore richiede un display X/Wayland.

### 6.2 Progetto

```bash
pebble new-project heapprobe && cd heapprobe
# package.json -> "targetPlatforms": ["emery", "flint"]
```

`src/c/heapprobe.c`:

```c
#include <pebble.h>

static Window *s_window;
static Layer *s_layer;
static bool s_probe_done;

// Sposta qui 8 KiB in .bss per vedere l'effetto 1:1 su "Free RAM available (heap)"
// static uint8_t s_pad[8 * 1024];

static void prv_log_heap(const char *tag) {
  APP_LOG(APP_LOG_LEVEL_INFO, "[%s] heap free=%u used=%u",
          tag, (unsigned)heap_bytes_free(), (unsigned)heap_bytes_used());
}

static void prv_probe(void) {
  static const size_t kSizesKiB[] = {8, 16, 32, 64, 96, 112, 120, 124, 128};
  for (size_t i = 0; i < ARRAY_LENGTH(kSizesKiB); i++) {
    const size_t bytes = kSizesKiB[i] * 1024;
    uint8_t *p = malloc(bytes);
    APP_LOG(APP_LOG_LEVEL_INFO, "malloc(%u KiB) -> %s (free after=%u)",
            (unsigned)kSizesKiB[i], p ? "OK" : "NULL", (unsigned)heap_bytes_free());
    if (p) { memset(p, 0xA5, bytes); free(p); }
  }
  // Quanti blocchi da 8 KiB coesistono (misura la frammentazione residua)
  void *blocks[32]; int n = 0;
  while (n < 32 && (blocks[n] = malloc(8 * 1024)) != NULL) n++;
  APP_LOG(APP_LOG_LEVEL_INFO, "8 KiB blocks alive at once: %d (free=%u)", n, (unsigned)heap_bytes_free());
  for (int i = 0; i < n; i++) free(blocks[i]);
  // Bitmap full-screen 8 bit: 45 600 B + header
  GBitmap *bmp = gbitmap_create_blank(GSize(PBL_DISPLAY_WIDTH, PBL_DISPLAY_HEIGHT),
                                      PBL_IF_COLOR_ELSE(GBitmapFormat8Bit, GBitmapFormat1Bit));
  APP_LOG(APP_LOG_LEVEL_INFO, "full-screen GBitmap -> %s (free=%u)", bmp ? "OK" : "NULL", (unsigned)heap_bytes_free());
  if (bmp) gbitmap_destroy(bmp);
  prv_log_heap("after probe");
}

static void prv_update_proc(Layer *layer, GContext *ctx) {
  graphics_context_set_fill_color(ctx, PBL_IF_COLOR_ELSE(GColorDarkCandyAppleRed, GColorBlack));
  graphics_fill_rect(ctx, layer_get_bounds(layer), 0, GCornerNone);
  if (!s_probe_done) {           // primo render
    s_probe_done = true;
    prv_log_heap("first render");
    prv_probe();
  }
}

static void prv_window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  s_layer = layer_create(layer_get_bounds(root));
  layer_set_update_proc(s_layer, prv_update_proc);
  layer_add_child(root, s_layer);
  prv_log_heap("window_load");
}

static void prv_window_unload(Window *window) { layer_destroy(s_layer); }

static void prv_init(void) {
  prv_log_heap("main entry");    // baseline: cosa ha già allocato il runtime prima di main()
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = prv_window_load, .unload = prv_window_unload,
  });
  window_stack_push(s_window, true);
  prv_log_heap("after init");
}

static void prv_deinit(void) { window_destroy(s_window); }

int main(void) { prv_init(); app_event_loop(); prv_deinit(); }
```

### 6.3 Esecuzione e lettura

```bash
pebble build                                   # leggere "EMERY APP MEMORY USAGE" -> Total footprint / Free RAM available (heap)
pebble install --emulator emery --logs         # avvia QEMU emery (fw 4.33.2) e mostra APP_LOG
# oppure, separatamente:  pebble logs --emulator emery
pebble install --emulator flint --logs         # Pebble 2 Duo
# su hardware (developer connection nell'app Pebble):  pebble install --phone <IP> --logs
```

Cosa attendersi (app 4.x nativa, emery): `heap free` a «main entry» ≈ `131 072 − virtual_size − (poche decine di byte di allocazioni del runtime)`; le `malloc` da 8/16/32/64/96 KiB → `OK` finché `bytes + 8 ≤ free`; 128 KiB → `NULL` sempre (cap allocatore 131 060 B e heap < 131 072). Confrontare «Free RAM available (heap)» del build con il primo `heap free`: la differenza è il costo fisso del runtime + allineamento (atteso < 1 KiB; è il numero che manca in letteratura). Ripetere con `s_pad[8*1024]` attivo: `free` deve scendere di 8 192 B esatti, confermando che `.bss` si paga 1:1 e non 2:1.

---

## 7. Implicazioni architetturali (bitmap, cache offline, UI)

1. **Budget reale = 128 KiB condivisi tra footprint statico e heap.** Ogni byte in `.data/.bss` costa un byte di heap; il footprint statico non può superare 65 535 B. Tenere `.bss` piccolo e mettere i buffer grandi sull'heap (è l'unico modo per avere > 64 KiB «vivi»).
2. **Bitmap:** un `GBitmap` full-screen 8 bit = 45 600 B (+~40 B header). Due full-screen (double buffering manuale, sprite grandi) = 91,2 KB → possibile solo con footprint statico ≤ ~35 KB. Preferire risorse `pbi`/PNG con palette (`GBitmapFormat4BitPalette`: 22 800 B a schermo pieno; 2 bit: 11 400 B; 1 bit: 5 700 B) e caricare on demand con `gbitmap_create_with_resource()`; il framebuffer di sistema (45 600 B) non è a carico dell'app.
3. **Cache offline in RAM:** 32–64 KiB in un singolo blocco allocato all'avvio sono realistici se l'immagine resta sotto ~40 KB; non usare `realloc()` per farlo crescere oltre 64 KiB (bug §4); dimensionare a priori.
4. **Strutture UI:** `ScrollLayer`/`MenuLayer` sono cresciute in 4.33 (`sizeof(ScrollLayer)` maggiore per lo stato touch). Nessun problema di budget, ma ricompilare e non incorporare per valore in strutture con dimensioni cablate.
5. **Pebble 2 Duo (flint):** metà budget (64 KiB immagine+heap, stack 2 KiB). Progettare i buffer con `#if defined(PBL_PLATFORM_EMERY)` / `PBL_IF_COLOR_ELSE`.
6. **Prospettiva:** issue #1873 aperta (allargare `virtual_size` a `uint32_t` = cambio ABI con app mobile); PSRAM 16 MB non abilitata (PR #1602 chiusa senza merge). Non pianificare su budget > 128 KiB nel 2026.

---

## 8. Azioni consigliate

1. **Eseguire il probe §6 in emulatore `emery` e `flint` entro il primo giorno di lavoro** e annotare: «Free RAM available (heap)» del build, `heap free` a main entry / after init / first render, esito di `malloc(96 KiB)`. È l'unico dato che manca in letteratura; costo < 1 ora.
2. **Adottare la regola `heap ≈ 131 072 − virtual_size`** nel piano; fissare un tetto di progetto per il footprint statico (es. ≤ 40 KB) così da garantire ≥ ~88 KiB di heap.
3. **Allocare i buffer grandi (cache offline, bitmap 8 bit) una sola volta in `init()`**, in ordine decrescente di dimensione, e non usare mai `realloc()` su blocchi ≥ 64 KiB.
4. **Controllare sempre il ritorno di `malloc()`** e degradare (es. bitmap a palette 4 bit) invece di crashare.
5. **Usare `heap_bytes_free()` come telemetria, non come garanzia** di blocco contiguo: fare una `malloc` di prova della dimensione target all'avvio.
6. **Formati bitmap a palette** (1/2/4 bit) per tutto ciò che non richiede 64 colori pieni; riservare l'8 bit a poche superfici.
7. **Non contare sull'emulatore per differenze di budget**: è identico all'hardware per configurazione; validare su hardware solo prestazioni e tempi di rendering.
8. **Segnalare upstream** (coredevices/PebbleOS) il troncamento `uint16_t` in `heap_realloc()` e seguire l'issue #1873.
9. **Ambiente:** `uv tool install pebble-tool` (Python 3.13 via uv, nessun sudo); verificare con `ldd` le dipendenze del QEMU scaricato prima di contare sull'emulatore.

---

## 9. Fonti (URL, data di pubblicazione/consultazione)

Sorgenti firmware/SDK (coredevices/PebbleOS, consultati 2026-08-24; `main` e tag `v4.33.2`):
- `Kconfig` — https://github.com/coredevices/PebbleOS/blob/main/Kconfig e https://github.com/coredevices/PebbleOS/blob/v4.33.2/Kconfig (valori APP_RAM_* identici)
- `src/fw/linker/memory.ld` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/linker/memory.ld
- `src/fw/process_management/app_manager.c` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/process_management/app_manager.c
- `src/fw/process_state/app_state/app_state.c` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/process_state/app_state/app_state.c
- `src/fw/applib/graphics/8_bit/framebuffer.h` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/applib/graphics/8_bit/framebuffer.h
- `src/fw/board/displays/display_qemu_emery.h` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/board/displays/display_qemu_emery.h
- `lib/util/heap.c` — https://github.com/coredevices/PebbleOS/blob/main/lib/util/heap.c
- `src/fw/applib/app_heap_util.c` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/applib/app_heap_util.c
- `src/fw/process_management/pebble_process_info.h` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/process_management/pebble_process_info.h
- `src/fw/process_management/pebble_process_md.c` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/process_management/pebble_process_md.c
- `src/fw/services/process_management/process_loader_storage.c` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/services/process_management/process_loader_storage.c
- `src/fw/services/process_management/app_storage.c` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/services/process_management/app_storage.c
- `src/fw/kernel/util/segment.c` — https://github.com/coredevices/PebbleOS/blob/main/src/fw/kernel/util/segment.c
- `tools/applib_malloc.template.c` — https://github.com/coredevices/PebbleOS/blob/main/tools/applib_malloc.template.c
- `tools/pebble_sdk_platform.py` — https://github.com/coredevices/PebbleOS/blob/main/tools/pebble_sdk_platform.py
- `sdk/tools/inject_metadata.py` — https://github.com/coredevices/PebbleOS/blob/main/sdk/tools/inject_metadata.py
- `sdk/waftools/report_memory_usage.py` — https://github.com/coredevices/PebbleOS/blob/main/sdk/waftools/report_memory_usage.py
- `sdk/tools/memory_reports.py` — https://github.com/coredevices/PebbleOS/blob/main/sdk/tools/memory_reports.py
- `sdk/pebble_app.ld.template` — https://github.com/coredevices/PebbleOS/blob/main/sdk/pebble_app.ld.template
- `boards/qemu_emery/defconfig` — https://github.com/coredevices/PebbleOS/blob/main/boards/qemu_emery/defconfig
- `soc/qemu/Kconfig.defconfig` — https://github.com/coredevices/PebbleOS/blob/main/soc/qemu/Kconfig.defconfig
- `soc/sf32lb/Kconfig.defconfig` — https://github.com/coredevices/PebbleOS/blob/main/soc/sf32lb/Kconfig.defconfig
- `boards/obelix/defconfig` — https://github.com/coredevices/PebbleOS/blob/main/boards/obelix/defconfig
- `docs/development/qemu.md` — https://github.com/coredevices/PebbleOS/blob/main/docs/development/qemu.md

Changelog, issue, PR:
- Pebble SDK 4.33 changelog (2026-08-12) — https://developer.repebble.com/sdk/changelogs/4.33/
- Pebble SDK 4.33.1 changelog (2026-08-14; emulatore = fw 4.33.2) — https://developer.repebble.com/sdk/changelogs/4.33.1/
- Issue #1873 (2026-08-16, aperta; commento 2026-08-20) — https://github.com/coredevices/PebbleOS/issues/1873
- PR #1827 (merged 2026-08-03) — https://github.com/coredevices/PebbleOS/pull/1827
- Issue #1621 (2026-06-28, chiusa) — https://github.com/coredevices/PebbleOS/issues/1621
- Issue #1592 (2026-06-23, chiusa) — https://github.com/coredevices/PebbleOS/issues/1592
- PR #1602 «enable psram on emery/gabbro» (2026-06-24, chiusa senza merge) — https://github.com/coredevices/PebbleOS/pull/1602
- PebbleOS releases (v4.36.0 del 2026-08-24; corpi note vuoti su GitHub) — https://github.com/coredevices/PebbleOS/releases
- PebbleOS changelog (Notion, non fetchabile; citato via issue #1873) — https://ndocs.repebble.com/pebbleos-changelog

Documentazione:
- Hardware Information (Rebble) — https://developer.rebble.io/guides/tools-and-resources/hardware-information/
- FAQ sviluppatori — https://developer.repebble.com/faqs/
- Memory Management (`heap_bytes_free`/`heap_bytes_used`) — https://developer.rebble.io/docs/c/Foundation/Memory_Management/
- Installazione SDK — https://developer.repebble.com/sdk/
- README pebble-tool — https://github.com/coredevices/pebble-tool
- Setup PT2 su Linux verificato 2026-07-12 (pebble-tool 5.0.39, uv, toolchain scaricata da `pebble sdk install`) — https://github.com/ArtRichards/pebble-time2-dev-setup
- DeepWiki pebble-dev/pebble-firmware, build system («Emery (SDK 4.x): 130K + 62K runtime», fonte secondaria sul wscript 2016) — https://deepwiki.com/pebble-dev/pebble-firmware/4-build-system
- Blog «4.2-beta4 SDK - Emery Edition!» (2016-10-11; contesto storico, nessun numero di RAM) — https://developer.rebble.io/blog/2016/10/11/Emery-SDK-Beta/

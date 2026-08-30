# Gap 3 — Cosa e' realmente validabile su questa macchina senza orologio fisico

**Data della ricerca:** 24 agosto 2026
**Ambiente di riferimento:** Ubuntu 26.04 LTS "resolute" x86_64, no sudo, Python 3.14.4, Node 22, gcc 15, cargo/rustc presenti in `~/.cargo/bin`, sessione grafica Wayland attiva (`DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`)
**Target:** Pebble Time 2 (piattaforma SDK `emery`, board firmware `obelix`, macchina QEMU `pebble-emery`) e secondariamente Pebble 2 Duo (piattaforma `flint`, board `asterix`, macchina QEMU `pebble-flint`)

---

## 0. Risposta breve (TL;DR)

1. **Il touch e' emulato, e in modo completo.** L'emulatore QEMU di Core Devices contiene un device `pebble-touch` (`hw/misc/pebble_touch.c`) istanziato sulla macchina `pebble-emery`, con `display-width=200`, `display-height=228`. Il firmware `qemu_emery` compila il driver `CONFIG_TOUCH_QEMU` (`src/fw/drivers/qemu/qemu_touch.c`). Quindi `TouchService`, `tap_recognizer_create()`, `pan_recognizer_create()`, `swipe_recognizer_create()` e `app_touch_navigation_enable()` **sono testabili nell'emulatore**.

2. **NON esiste un comando `pebble emu-touch` / `emu-swipe`, e non esistera'**: il touch **non passa** dal canale `QemuProtocol_*` che alimenta tutti i comandi `emu-*`. L'enum in `include/pbl/drivers/qemu/qemu_serial.h` arriva a 13 (`QemuProtocol_HeartRate`) e non contiene alcun protocollo touch. Il touch entra dal **sottosistema di input di QEMU** (eventi `abs` + `btn`).

3. **Ci sono quindi due vie reali per iniettare tap/pan/swipe:**
   - **(a) Mouse nella finestra SDL** — click e drag col mouse *sono* touchdown/position-update/liftoff. Confermato dal sorgente (`pebble_touch.c`: *"Receives mouse events from QemuConsole and provides touch coordinates"*, maschera `INPUT_EVENT_MASK_BTN | INPUT_EVENT_MASK_ABS`; `ui/sdl2.c` chiama `qemu_input_queue_abs()` su movimento e click). **Non e' documentato in nessuna pagina di developer.repebble.com**, ma e' garantito dal codice.
   - **(b) QMP `input-send-event`** — via programmatica/scriptabile, e' esattamente quello che fanno `./pbl touch X Y` e `./pbl swipe X1 Y1 X2 Y2` di PebbleOS. Richiede che QEMU sia stato lanciato con un socket `-qmp`, cosa che **`pebble-tool` NON fa**: va aggiunto con un wrapper su `PEBBLE_QEMU_PATH` oppure lanciando QEMU a mano e collegandosi con `pebble ... --qemu localhost:12344`.
   - **(non funziona)** il monitor HMP che `pebble-tool` espone su TCP: il suo `mouse_move` genera eventi **relativi** (`qemu_input_queue_rel`) che `pebble-touch` ignora perche' ascolta solo `abs`.

4. **Speaker, microfono e backlight RGB sono emulati**; l'HRM e' presente ma come **stub** alimentato da `pebble emu-heart-rate`. **Non** sono emulati: sensore di luce ambientale (ALS), modello energetico della batteria, vibrazione reale (solo notifica verso host), bussola fisica, PMIC.

5. **Sull'orologio reale senza telefono: oggi non c'e' un percorso praticabile.** La FAQ ufficiale dice esplicitamente che per lo sviluppo su orologio reale **serve il telefono** (app Pebble con Dev Connect, poi `pebble install --cloudpebble` oppure `--phone IP`). `pebble install --serial` e' un residuo dell'era Bluetooth Classic/SPP su macOS e non si applica al PT2, che usa uno stack **NimBLE (BLE-only) con PPoGATT**. `libpebble2`/`pebble-tool` non hanno alcun transport BLE (nessuna dipendenza `bleak`/`dbus`). `libpebble3` (Kotlin) ha solo target Android/iOS. Esiste un progetto community Linux (`luigi311/cobble`, Rust + BlueZ + PPoGATT) che **si connette davvero** al PT2, ma **non implementa PutBytes (installazione .pbw) ne' l'endpoint AppLogs**, quindi non sostituisce il telefono per il ciclo build → install → logs.

**Conseguenza per il piano:** UI touch e menu impostazioni on-watch **sono testabili prima di acquistare l'orologio**. Batteria e performance **no** (nessun modello energetico; QEMU TCG non e' cycle-accurate). Il telefono resta obbligatorio per il deploy su hardware.

---

## 1. Cosa emula davvero la macchina QEMU `pebble-emery`

### 1.1 Da dove viene l'emulatore

`pebble sdk install latest` scarica un binario `qemu-pebble` costruito dal fork <https://github.com/coredevices/qemu>, branch **`pebble-10.1`** (QEMU 10.1). Lo stesso binario e' usato sia da `pebble-tool` sia da `./pbl qemu` di PebbleOS (doc: *"The QEMU binary ships with the PebbleOS SDK"*).

`pebble-tool` sceglie la macchina in base alla versione SDK (`pebble_tool/sdk/emulator.py`, ultima modifica 2026-05-22):

```python
use_new_boards = sdk_version is None or sdk_version > parse_version('4.9.148')
if use_new_boards:
    emery_machine = 'pebble-emery'   # cortex-m33
```

Con **SDK 4.33.1** (> 4.9.148) la macchina e' quindi **`pebble-emery`** con CPU **Cortex-M33** — la stessa che `boards/qemu_emery/Kconfig.defconfig` dichiara (`config QEMU_MACHINE / default "pebble-emery"`).

Riga di comando effettiva prodotta da `pebble-tool` 5.0.39 (ricostruita dal sorgente):

```
qemu-pebble -rtc base=localtime \
  -serial null \
  -serial tcp::<qemu_port>,server=on,wait=off \
  -serial tcp::<qemu_serial_port>,server=on,wait=off \
  -kernel <SDK>/pebble/emery/qemu/qemu_micro_flash.bin \
  -gdb tcp::<gdb_port>,server=on,wait=off \
  -monitor tcp::<monitor_port>,server=on,wait=off \
  -machine pebble-emery -cpu cortex-m33 \
  -drive if=mtd,format=raw,file=<qemu_spi_flash.bin> \
  -audio driver=sdl,id=audio0 \
  -display sdl,show-cursor=on
```

Nota: **nessun `-qmp`**. Le porte scelte sono scritte in `/tmp/pb-emulator.json` (funzione `get_emulator_info_path()`), campi `qemu.port`, `qemu.serial`, `qemu.gdb`, `qemu.monitor`, `qemu.pid`.

### 1.2 Periferiche istanziate sulla macchina `pebble-emery`

Da `hw/arm/pebble_generic.c` (fork coredevices/qemu, branch `pebble-10.1`):

```c
static const PblGenericBoardConfig board_cfg_emery = {
    .name          = "pebble-emery",
    .desc          = "Pebble Emery (obelix, Cortex-M33)",
    .display_width = 200,
    .display_height = 228,
    .has_touch     = true,
    .has_audio     = true,
};
```

| Periferica | Device QEMU | Emulata su `pebble-emery`? | Note |
|---|---|---|---|
| Display 200x228, 8bpp ARGB2222 (64 colori) | `TYPE_PEBBLE_DISPLAY` (`hw/display/pebble_display.c`) | **Si'** | `A: bit 7-6, R: 5-4, G: 3-2, B: 1-0` = `GColor8` |
| **Touchscreen** | `TYPE_PEBBLE_TOUCH` = `pebble-touch` (`hw/misc/pebble_touch.c`) | **Si'** | single-touch, `display-width=200`, `display-height=228` |
| **Backlight + RGB** | registri del device display | **Si'** | `DISP_BRIGHTNESS 0x18`, `BL_RED 0x24`, `BL_GREEN 0x28`, `BL_BLUE 0x2C` (0-255 ciascuno) |
| **Speaker / audio DAC** | `TYPE_PEBBLE_AUDIO` (`hw/misc/pebble_audio.c`) | **Si'** | driver host `sdl` su Linux, `coreaudio` su macOS |
| Pulsanti | `TYPE_PEBBLE_GPIO` | Si' | tasti freccia + `pebble emu-button` |
| Flash esterna XIP | `TYPE_PEBBLE_EXTFLASH` | Si' | `-drive if=mtd` |
| RTC | `TYPE_PEBBLE_GENERIC_RTC` | Si' | `-rtc base=localtime` |
| **HRM** | — nessun device QEMU | **Stub firmware** | `CONFIG_HRM_STUB=y`, valori iniettati via protocollo 13 |
| **Batteria** | — nessun device QEMU | **Stub firmware** | `BATTERY_QEMU`: *"Stub battery driver for QEMU (fixed values)"* |
| **Luce ambientale (ALS)** | — | **NO** | `CONFIG_AMBIENT_LIGHT` presente solo su `obelix`, non su `qemu_emery` |
| Vibrazione | — | Solo notifica | `QemuProtocol_Vibration = 7`, watch → host |
| PMIC / temperatura reale | — | NO | `CONFIG_TEMPERATURE_STUB=y` |

Confronto con le altre macchine (utile per il Pebble 2 Duo):

| Macchina | Piattaforma SDK | Display | `has_touch` | `has_audio` | CPU |
|---|---|---|---|---|---|
| `pebble-emery` | emery (Pebble Time 2, obelix) | 200x228 | **true** | true | cortex-m33 |
| `pebble-flint` | flint (Pebble 2 Duo, asterix) | 144x168 | **false** | true | cortex-m4 |
| `pebble-gabbro` | gabbro (Pebble Round 2, getafix) | 260 (round) | true | **false** | cortex-m33 |

Sulle board **senza** touch il fork installa un `TYPE_PEBBLE_NULL_INPUT`, con questo commento: *"Non-touch boards: install a no-op absolute-pointer handler so the UI does not grab the host cursor on click."*

### 1.3 Configurazione del firmware emulatore (`boards/qemu_emery/defconfig`)

```
CONFIG_SOC_QEMU=y
CONFIG_CORTEX_M33=y
CONFIG_PLATFORM_EMERY=y
CONFIG_SCREEN_COLOR_DEPTH_BITS_8=y
CONFIG_DISPLAY=y
CONFIG_TOUCH=y                 <-- touchscreen attivo
CONFIG_BACKLIGHT=y
CONFIG_BACKLIGHT_QEMU_COLOR=y  <-- backlight RGB
CONFIG_MIC=y
CONFIG_SPEAKER=y
CONFIG_HRM=y
CONFIG_HRM_STUB=y              <-- HRM stub, non simulazione PPG
CONFIG_BATTERY=y
CONFIG_TEMPERATURE_STUB=y
CONFIG_MODDABLE_XS=y           <-- Alloy/Moddable disponibile
```

`src/fw/drivers/touch/Kconfig`:

```
config TOUCH_QEMU
    bool "QEMU Touchscreen"
    default y if SOC_QEMU
```

e `src/fw/drivers/touch/wscript_build` compila `../qemu/qemu_touch.c` quando `CONFIG_TOUCH_QEMU`.

Per confronto, il defconfig dell'hardware reale `boards/obelix/defconfig` (PT2) mostra cosa **manca** nell'emulatore:

```
CONFIG_SOC_SF32LB52=y            (SoC SiFli SF32LB52)
CONFIG_BACKLIGHT_AW2016=y        (driver LED RGB reale)
CONFIG_VIBE_AW86225=y            (LRA haptic)
CONFIG_PMIC_NPM1300=y
CONFIG_AMBIENT_LIGHT_W1160=y + CONFIG_ALS_SCREEN_COMPENSATION=y
CONFIG_MIC=y  CONFIG_SPEAKER=y
CONFIG_TOUCH_CST816=y            (Hynitron CST816, capacitivo single-touch)
CONFIG_HRM_GH3X2X=y  CONFIG_HRM_HRV=y
CONFIG_ACCEL_LSM6DSO=y
CONFIG_FLASH_GD25Q256E=y         (32 MB flash esterna)
```

---

## 2. Iniezione di tap / pan / swipe: le tre vie

### 2.1 Perche' non esiste `pebble emu-touch`

Tutti i comandi `emu-*` viaggiano sul canale seriale "QEMU protocol" fra `pebble-tool` e il firmware. L'enum completo, da `include/pbl/drivers/qemu/qemu_serial.h` di PebbleOS, e':

```c
typedef enum {
  QemuProtocol_SPP = 1,
  QemuProtocol_Tap = 2,                  // tap accelerometro, NON touchscreen
  QemuProtocol_BluetoothConnection = 3,
  QemuProtocol_Compass = 4,
  QemuProtocol_Battery = 5,
  QemuProtocol_Accel = 6,
  QemuProtocol_Vibration = 7,            // watch -> host
  QemuProtocol_Button = 8,
  QemuProtocol_TimeFormat = 9,
  QemuProtocol_TimelinePeek = 10,
  QemuProtocol_ContentSize = 11,
  QemuProtocol_HealthMetric = 12,
  QemuProtocol_HeartRate = 13,
} QemuProtocol;
```

**Non c'e' nessun `QemuProtocol_Touch`.** Il touch e' modellato come periferica hardware (`pebble-touch`) che riceve eventi dal sottosistema input di QEMU, non come messaggio di protocollo. Ecco perche' la matrice `emu-*` "sembra" incompleta: non lo e', il touch semplicemente sta su un altro canale.

### 2.2 Via (a): mouse nella finestra SDL — **funziona, non documentato**

Catena confermata nel sorgente:

1. `hw/misc/pebble_touch.c`, commento di intestazione: *"Simple touch input device for Pebble generic machines (Emery, Gabbro). **Receives mouse events from QemuConsole** and provides touch coordinates."*
2. L'handler registrato e':
   ```c
   static const QemuInputHandler pbl_touch_input_handler = {
       .name  = "Pebble Touch",
       .mask  = INPUT_EVENT_MASK_BTN | INPUT_EVENT_MASK_ABS,
       .event = pbl_touch_input_event,
   };
   ...
   s->input_handler = qemu_input_handler_register(dev, &pbl_touch_input_handler);
   qemu_input_handler_activate(s->input_handler);
   ```
   Tasto sinistro giu' → `state = 1` (dito appoggiato); eventi `abs` X/Y → coordinate scalate su `display_w`/`display_h`.
3. `ui/sdl2.c` → `sdl_send_mouse_event()`:
   ```c
   if (qemu_input_is_absolute(scon->dcl.con)) {
       qemu_input_queue_abs(scon->dcl.con, INPUT_AXIS_X, x, 0, surface_width(scon->surface));
       qemu_input_queue_abs(scon->dcl.con, INPUT_AXIS_Y, y, 0, surface_height(scon->surface));
   }
   ```
   `qemu_input_is_absolute()` e' vero perche' `pebble-touch` dichiara `INPUT_EVENT_MASK_ABS`.
4. `handle_mousemotion()` invia eventi anche durante il **drag** (`ev->motion.state`), quindi pan e swipe col mouse premuto producono la sequenza completa touchdown → position-update → liftoff.

Il flag `show-cursor=on` che `pebble-tool` passa a `-display sdl` conferma che l'interazione col mouse e' prevista.

**Conclusione:** su `pebble install --emulator emery`, **cliccare e trascinare col mouse nella finestra SDL equivale a toccare lo schermo**. Questo non compare in nessuna pagina di `developer.repebble.com` (verificato con `grep -ri mouse` su tutto `coredevices/sdk-docs`: zero occorrenze fuori dai post di blog storici) — e' un fatto del codice, non della documentazione.

### 2.3 Bonus: decorazioni "corpo orologio" con pulsanti cliccabili

Il fork QEMU ha una feature di decorazione della finestra SDL (commit *"ui/sdl2: add Pebble watch-frame window decorations"*, 2026-05-08), `ui/sdl2-decoration.c`:

| Preset | File PNG | `screen_rect` (x, y, w, h) | Modello |
|---|---|---|---|
| `pt2-sb` / `pt2-br` | `pebble-decorations/pt2-*.png` | 46, 102, **200x228** | Pebble Time 2 |
| `pr2-bk20` / `pr2-gd14` | `pebble-decorations/pr2-*.png` | 35, 99, **262x262** | Pebble Round 2 |
| `p2d-bk` / `p2d-wh` | `pebble-decorations/p2d-*.png` | 38, 117, **144x168** | Pebble 2 Duo |

Con decorazione attiva:
- `sdl2_decoration_map_mouse()` rimappa correttamente le coordinate del mouse nell'area schermo → **il touch continua a funzionare**;
- `sdl2_decoration_button_at()` + `sdl2_decoration_send_button()`: **cliccare sui pulsanti disegnati sulla cornice sintetizza una pressione tasto Pebble** (4 pulsanti per preset, mappati a `Q_KEY_CODE_*`).

Si attiva con `-display sdl,decoration=pt2-br`. `./pbl qemu` di PebbleOS lo fa di default (`QEMU_DECORATIONS = {"qemu_emery": ["pt2-br", "pt2-sb"], ...}`); **`pebble-tool` no**. Il PNG viene cercato con `qemu_find_file(QEMU_FILE_TYPE_BIOS, ...)`, cioe' nelle directory `-L` piu' `CONFIG_QEMU_DATADIR` (nell'SDK: `<SDK_ROOT>/toolchain/lib/pc-bios`). **Da verificare** se l'SDK 4.33.1 spedisce effettivamente `pebble-decorations/*.png`.

### 2.4 Via (b): QMP `input-send-event` — scriptabile

E' esattamente quello che fa `./pbl touch` / `./pbl swipe` (commit *"tools/pbl: add QEMU touch injection (touch/swipe commands)"*, 2026-07-29). Documentazione ufficiale in `docs/development/qemu.md`:

```shell
./pbl touch 130 130                          # tap at (130, 130)
./pbl swipe 130 220 130 40                   # swipe up (finger bottom -> top)
./pbl swipe 130 220 130 40 --steps 20 --duration 0.4
```

> *"On touch-capable boards you can inject touch events into a running QEMU. Coordinates are given in screen pixels; the display size is read from the emulated `pebble-touch` device and scaled automatically. [...] A tap is a finger down then up; a swipe streams intermediate moves so that drag gestures are seen as continuous. **Injection uses the absolute-pointer input path; multi-touch is not wired up in the device.**"*

Implementazione (da `pbl`, riscrivibile in ~50 righe):

```python
QMP_ABS_MAX = 32767

# 1) connessione al socket QMP + handshake
cmd({"execute": "qmp_capabilities"})

# 2) scoperta del device e delle sue dimensioni (walk di /machine con qom-list)
#    -> qom-get "display-width" / "display-height" sul figlio il cui nome/tipo contiene "touch"

# 3) tap
events = [{"type": "abs", "data": {"axis": "x", "value": int(px/width*32767)}},
          {"type": "abs", "data": {"axis": "y", "value": int(py/height*32767)}},
          {"type": "btn", "data": {"button": "left", "down": True}}]
cmd({"execute": "input-send-event", "arguments": {"events": events}})
time.sleep(0.05)
cmd({"execute": "input-send-event", "arguments": {"events":
     [{"type": "btn", "data": {"button": "left", "down": False}}]}})
```

Per lo swipe: `abs` X/Y + `btn down`, poi `steps` invii di soli `abs` con `sleep(duration/steps)`, poi `btn up`. Default di `./pbl swipe`: `--steps 20`, `--duration 0.4` s.

**Il problema:** `pebble-tool` non apre alcun socket QMP. Due soluzioni:

**Soluzione 1 — wrapper su `PEBBLE_QEMU_PATH`** (il sorgente e' `qemu_bin = os.environ.get('PEBBLE_QEMU_PATH', 'qemu-pebble')`):

```bash
REAL=$(find ~/.local/share/pebble-sdk -name qemu-pebble -type f | head -1)
mkdir -p ~/.local/bin
cat > ~/.local/bin/qemu-pebble-qmp <<EOF
#!/bin/sh
exec "$REAL" -qmp unix:/tmp/pebble-qmp.sock,server=on,wait=off "\$@"
EOF
chmod +x ~/.local/bin/qemu-pebble-qmp
export PEBBLE_QEMU_PATH="$HOME/.local/bin/qemu-pebble-qmp"
pebble install --emulator emery      # ora /tmp/pebble-qmp.sock esiste
```

**Soluzione 2 — lanciare QEMU a mano e agganciare `pebble-tool`.** `pebble-tool` accetta `--qemu HOST:PORT` (default `localhost:12344`); basta replicare le porte seriali che usa `./pbl qemu`:

```
qemu-pebble -rtc base=localtime \
  -kernel <SDK>/pebble/emery/qemu/qemu_micro_flash.bin \
  -machine pebble-emery -cpu cortex-m33 \
  -drive if=mtd,format=raw,file=<qemu_spi_flash.bin> \
  -audio driver=sdl,id=audio0 -display sdl,show-cursor=on \
  -qmp unix:/tmp/pebble-qmp.sock,server=on,wait=off \
  -monitor unix:/tmp/pebble-mon.sock,server=on,wait=off \
  -serial file:uart1.log \
  -serial tcp::12344,server=on,wait=off \
  -serial tcp::12345,server=on,wait=off

pebble install build/app.pbw --qemu localhost:12344
pebble logs --qemu localhost:12344
```

Attenzione: `pebble install --emulator` avvia anche **pypkjs** (per PebbleKit JS/Clay). Con `--qemu` bisogna aggiungere `--pypkjs --platform emery` se l'app ha componenti JS.

### 2.5 Via (c) che NON funziona: il monitor HMP

`pebble-tool` espone un monitor **HMP** su TCP (`-monitor tcp::<monitor_port>`). Non basta: `hmp_mouse_move` in `ui/ui-hmp-cmds.c` fa

```c
qemu_input_queue_rel(NULL, INPUT_AXIS_X, dx);
qemu_input_queue_rel(NULL, INPUT_AXIS_Y, dy);
```

cioe' eventi **relativi**, che `pebble-touch` (maschera `BTN|ABS`) **scarta**. `mouse_button` da solo genererebbe un touchdown all'ultima coordinata assoluta nota (0,0 all'avvio) — inutilizzabile. Il monitor HMP resta utile per `screendump` e `sendkey`.

---

## 3. Matrice reale dei comandi `emu-*` (pebble-tool 5.0.39)

La documentazione pubblica su `developer.repebble.com/guides/tools-and-resources/pebble-tool/` e' **arretrata**: elenca solo `emu-control`, `emu-app-config`, `emu-tap`, `emu-bt-connection`, `emu-compass`, `emu-battery`, `emu-accel`, `emu-time-format`, `emu-set-timeline-quick-view`. La lista vera, estratta da `pebble_tool/commands/emucontrol.py`:

| Comando | Argomenti | Meccanismo |
|---|---|---|
| `emu-accel` | `MOTION` ∈ {tilt-left, tilt-right, tilt-forward, tilt-back, gravity±x/y/z, none, custom} `[--file F]` | protocollo 6 |
| `emu-tap` | `[--direction {x+,x-,y+,y-,z+,z-}]` (default `x+`) | protocollo 2 — **tap accelerometro, non touch** |
| `emu-button` | `{click,push,release} [back up select down]... [--duration ms=100] [--repeat n=1] [--interval ms=200]` | protocollo 8 |
| `emu-battery` | `[--percent 0-100 (def. 80)] [--charging]` | protocollo 5 |
| `emu-bt-connection` | `--connected {yes,no}` | protocollo 3 |
| `emu-compass` | `--heading 0-359 [--uncalibrated|--calibrating|--calibrated]` | protocollo 4 |
| `emu-time-format` | `--format {12h,24h}` | protocollo 9 |
| `emu-set-time` | `TIME` (HH:MM:SS o epoch) `[--utc]` | `TimeMessage/SetUTC` |
| `emu-set-timeline-quick-view` | `{on,off}` | protocollo 10 |
| `emu-set-content-size` | `{small,medium,large,x-large}` | protocollo 11 |
| `emu-steps` | `COUNT` | protocollo 12, metric id 0 |
| `emu-distance` | `METERS` | protocollo 12, metric id 4 |
| `emu-calories` | `ACTIVE [--resting N]` | protocollo 12, id 3 / 2 |
| `emu-active-time` | `MINUTES` | protocollo 12, id 1 |
| `emu-sleep` | `TOTAL [--restful N]` | protocollo 12, id 5 / 6 |
| `emu-heart-rate` | `BPM 0-255 [--quality {off-wrist,worst,poor,acceptable,good,excellent}]` | **protocollo 13** |
| `emu-app-config` | `[--file F]` | apre Clay nel browser |
| `emu-control` | `[--port P]` | UI web sensori (accel/bussola) + QR code |

Altri comandi utili: `analyze-size`, `send-app-message`, `gdb`, `screenshot [--gif-all-platforms] [--gif-fps N] [--all-platforms] [--no-correction]`, `logs`, `repl`, `transcribe`, `data-logging`, `wipe`, `kill`, `fw`.

Mappatura qualita' HRM (da `emucontrol.py`, deve combaciare con `HRMQuality`): `off-wrist=-1, worst=0, poor=1, acceptable=2, good=3, excellent=4`.

---

## 4. Cosa e' testabile e cosa NO senza orologio

### 4.1 Testabile in emulatore — **SI'**

| Ambito | Come | Note |
|---|---|---|
| **UI touch completa** | mouse in finestra SDL, oppure QMP `input-send-event` | `TouchService`, `TouchEvent_Touchdown/PositionUpdate/Liftoff`, `tap/pan/swipe_recognizer_create()`, `window_attach_recognizer()`, `window_set_touch_bridge_disabled()`, `app_touch_navigation_enable()` |
| **Menu impostazioni on-watch** | tasti freccia nella finestra SDL o `pebble emu-button` | l'emulatore esegue il **firmware reale** (4.33.2 con SDK 4.33.1), quindi `Settings → Display → Touch` esiste davvero |
| `touch_service_is_enabled()` / `PBL_TOUCH` | naturale | il percorso "touch disabilitato" si prova disattivandolo dal menu on-watch |
| Rendering colore 64 (`GColor8`/ARGB2222) 200x228 | `pebble screenshot` | correzione colore attiva di default, `--no-correction` per il raw |
| **Backlight incl. tinta RGB** | visivo nella finestra | il display QEMU applica `brightness` e i canali `BL_RED/GREEN/BLUE` al frame |
| **Speaker** (`SPEAKER_MAX_NOTES=256`, `SPEAKER_MAX_TRACKS=4`, `SPEAKER_MAX_SAMPLE_BYTES_TOTAL=16 KiB`) | `-audio driver=sdl` | audio host necessario |
| Health, HR, HRV (`HealthEventHRVUpdate`, `health_service_peek_hrv_ppi_ms()`, `health_service_set_hrv_sample_period()`) | `emu-steps`, `emu-heart-rate`, ... | valori iniettati, non simulati |
| Comportamento **offline / disconnesso** | `pebble emu-bt-connection --connected no` | anche `PEBBLE_QEMU_START_CONNECTED=0` come env var letta dalla board QEMU |
| Persistenza (`persist_*`, `persist_get_max_size()`) | naturale, con `--keep-flash-image` lato `pbl` | `pebble wipe` azzera lo stato |
| Dimensione binario e footprint statico | `pebble analyze-size` | limite app su Emery/Gabbro: **128 KiB** di binario, ma **64 KiB** di immagine caricata e **64 KiB** di RAM (SDK 4.33) |
| Heap runtime | `heap_bytes_free()`/`heap_bytes_used()` in-app + `pebble gdb` (`pbl heap`, `pbl heapstats`, `pbl sbt`, `pbl layer-tree`) | i comandi `pbl` GDB vivono in PebbleOS (`tools/gdb_scripts/gdb_tintin.py`) |
| Regressione visiva automatizzata | `pebble screenshot out.png` in loop | e' il flusso ufficiale della skill Core Devices `pebble-watchface-agent-skill` |

### 4.2 NON testabile / inaffidabile in emulatore — **NO**

| Ambito | Perche' |
|---|---|
| **Consumo batteria / autonomia** | `BATTERY_QEMU` e' descritto in Kconfig come *"Stub battery driver for QEMU (fixed values)"*. `emu-battery` cambia solo il livello **riportato**; non esiste alcun modello energetico. Nessuna correlazione fra codice e mA. |
| **Performance assolute / frame rate** | QEMU 10.1 in TCG non e' cycle-accurate e non modella wait-state della flash esterna, DMA del display, ne' il clock reale del SF32LB52. Utili solo i confronti *relativi* (A e' 3x piu' lento di B) e le metriche deterministiche (allocazioni, byte, chiamate). |
| **Luce ambientale / auto-brightness** | `CONFIG_AMBIENT_LIGHT_W1160` e `CONFIG_ALS_SCREEN_COMPENSATION` esistono solo su `obelix`, non su `qemu_emery`. Il comportamento reale del backlight in funzione della luce ambientale non e' riproducibile. |
| **Leggibilita' reale del display transflettivo** | `pebble_display.c` approssima il comportamento ("*RGB backlight on a transflective LCD: ambient light reflects off the panel (neutral white) while the backlight shines through it*"), ma il contrasto reale al sole/al buio va visto sull'hardware. |
| **Vibrazione** | solo notifica `QemuProtocol_Vibration` verso host; nessun feedback percepibile. Nota: da SDK 4.33 il firmware **filtra** shake/tap causati dalla vibrazione stessa — comportamento verificabile solo su HW. |
| **HRM reale / qualita' del segnale** | `CONFIG_HRM_STUB=y`; il sensore reale e' un GH3X2X con HRV. Latenze, dropout, `off-wrist` reali non emulati. |
| **Multi-touch** | esplicitamente escluso: *"multi-touch is not wired up in the device"*. Il CST816 reale e' comunque single-touch. |
| **Microfono / dictation reale** | c'e' `pebble transcribe [message] [--error {connectivity,disabled,no-speech-detected}]` per **simulare** l'esito, non l'audio. |
| **Bluetooth/BLE reale, pairing, riconnessione** | il transport BT dell'emulatore e' `src/bluetooth-fw/qemu/qemu_transport.c`, non uno stack BLE. |

### 4.3 Punto critico per il piano: **touch e watchface**

Dalla guida ufficiale `Touch` (SDK 4.33, 2026-08-12):

> *"Touch input is currently **not supported in watchfaces**. While we work out how we want to expose it, touch is intentionally restricted to watchapps — it is easier to allow it later than to take it away once apps depend on it. For now, only use the `TouchService` from a watchapp."*

Inoltre:
- La *touch navigation* di sistema (dal firmware 4.32, **abilitata di default** dal 4.33) e' vincolata a una **interaction session**: l'utente deve prima premere un tasto o svegliare l'orologio, altrimenti i tocchi non navigano (`TouchEvent.non_navigational` = true).
- Le **watchapp sono opt-out di default**: serve `app_touch_navigation_enable(true)` per far scorrere menu/scroll view col dito.
- Ogni evento touch riaccende il backlight come farebbe un tasto: non serve chiamare l'API Light.
- Il sensore touch consuma corrente in modo continuo mentre e' attivo: `touch_service_subscribe()` solo quando serve, `touch_service_unsubscribe()` nel `disappear` della window.

**Implicazione diretta:** se il progetto e' una *watchface*, il touch non e' usabile oggi e questo gap si riduce molto d'importanza. Se e' una *watchapp*, il touch e' pienamente sviluppabile e testabile in emulatore.

---

## 5. PT2 reale da Linux senza app mobile: percorsi valutati

### 5.1 Posizione ufficiale

FAQ ufficiale (<https://developer.repebble.com/faqs/>, consultata 24/08/2026): per lo sviluppo su orologio reale **serve il telefono**. Flusso standard: app mobile Pebble → *Dev Connect* → `pebble install --cloudpebble`; in alternativa "legacy" su Wi-Fi: abilitare la Developer Connection e usare `pebble install --phone IP_ADDRESS`. La guida `Developer Connection` documenta solo i passaggi Android e iOS.

### 5.2 `pebble install --serial` — non applicabile al PT2

- `pebble-tool` implementa `--serial` via `libpebble2.communication.transports.serial.SerialTransport` (dipendenza `pyserial>=3.5`).
- La documentazione lo descrive come *"Connect directly to a watch using a local Bluetooth connection [...] On OS X, this is similar to `/dev/cu.PebbleTimeXXXX-SerialPo`"* — cioe' un nodo **RFCOMM/SPP su Bluetooth Classic**, tecnologia dei Pebble 2013-2016.
- Il PT2 (`obelix`) usa **NimBLE** (`src/bluetooth-fw/nimble/`, `mynewt-nimble` fra i repo di Core Devices), stack **BLE-only**, con **PPoGATT** (`src/fw/comm/ble/kernel_le_client/ppogatt/`). Non c'e' SPP.
- Su Linux non esiste comunque un `/dev/rfcomm*` verso un dispositivo BLE.

**Verdetto: `--serial` non e' una strada per il PT2.**

### 5.3 `libpebble2` / `pebble-tool` — nessun transport BLE

Dipendenze dichiarate in `pyproject.toml` di pebble-tool 5.0.39: `cobs, colorama, freetype-py, google-auth, google-auth-oauthlib, httplib2, libpebble2>=0.0.31, oauth2client, Pillow, packaging, progressbar2, pyasn1*, pypkjs>=2.0.7, pypng, pyqrcode, pyserial, requests, rsa, six, sourcemap, websocket-client, websockify, wheel`. **Nessun `bleak`, `dbus-next`, `pydbus`, `gatt`.** I transport di `libpebble2` sono `qemu`, `websocket`, `serial`, `cloudpebble`, `adb`. Nessuna implementazione PPoGATT lato host.

### 5.4 `libpebble3` (app mobile ufficiale) — solo Android/iOS

`coredevices/mobileapp` (GPL-3.0, ultimo push 2026-08-20) e' Kotlin Multiplatform; il README dice che `libpebble3` e' *"Also usable as a standalone library"*. Ma `libpebble3/build.gradle.kts` dichiara solo target **android** e **ios** (quest'ultimo solo su host macOS). **Nessun target JVM/desktop**, quindi non e' eseguibile su Linux senza portare lo strato BLE (`expect`/`actual`).

### 5.5 Alternativa community: `luigi311/cobble` — funziona, ma non fa quello che serve

Repo: <https://github.com/luigi311/cobble> — *"Talk to a Pebble smartwatch over Bluetooth Low Energy from Linux"*, Rust, GPL-3.0, creato 2026-06-10, ultimo push **2026-08-23**, 1 stella (progetto personale, non ufficiale).

Architettura: `crates/libpebble-ble` (BlueZ via `bluer`, GATT server PPoGATT ospitato dal PC, pairing, codec endpoint) → `crates/cobbled` (daemon D-Bus `org.cobble.Daemon`) → `packages/cobble-client` (client Python).

Endpoint implementati (`crates/libpebble-ble/src/endpoints/`): `app_message` (48), `app_run_state` (52), `blob_db` (0xb1db/0xb2db), `datalog` (0x11), `health`, `watch_pref`, `music` (32), `phone_control`, `phone_version` (17), `ping` (2001), `reset` (2003), `screenshot` (8000), `system` (16/18/5001), `time` (11).

**Cosa manca per il ciclo di sviluppo:**
- **Nessun PutBytes / app install**: non c'e' `endpoints/put_bytes.rs`; "putbytes" compare solo come voce nell'enum `mod.rs`. → **non si puo' installare un .pbw**.
- **Nessun endpoint AppLogs**: nessun file `logs.rs`, zero occorrenze di `app_logs`. → **non si possono leggere i log dell'app**.

Cosa **si** puo' gia' fare con cobble: connettersi, sincronizzare l'ora, inviare/ricevere `AppMessage`, lanciare/fermare watchapp (`app_run_state`), leggere la versione firmware/board/seriale/piattaforma, fare **screenshot del framebuffer reale**, leggere le WatchPrefs, inviare notifiche desktop. Non banale, ma non e' un sostituto del telefono.

Nota positiva: **`cargo` e `rustc` sono gia' installati** su questa macchina (`~/.cargo/bin`), quindi cobble e' compilabile in user space. Serve pero' un adattatore BLE funzionante e BlueZ (BlueZ e' un servizio di sistema: registrare un GATT server come peripheral **richiede accesso a D-Bus di sistema**, tipicamente il gruppo `bluetooth` — da verificare, potrebbe richiedere sudo).

### 5.6 Percorso "firmware-level" (sconsigliato qui)

PebbleOS offre `./pbl console --tty` per la console firmware su hardware reale e `./pbl debug` via OpenOCD — ma:
- `./pbl debug` e' disponibile **solo sulle board con runner OpenOCD (es. asterix)**; *"boards flashed via sftool do not support it"* — e `obelix` (PT2) usa **sftool**.
- Richiede accesso fisico alla UART (accessorio di debug / apertura dell'orologio) e la toolchain firmware, che si installa con `sudo apt install bison clang flex gcc gcc-multilib gettext gperf libfreetype6-dev libglib2.0-dev libgtk-3-dev libncurses-dev librsvg2-bin openocd python3-dev python3-venv` → **non fattibile senza sudo**.
- I log firmware sono hashati a compile-time e vanno de-hashati con `build/src/fw/loghash_dict.json` — inutilizzabile senza aver compilato quel firmware.

### 5.7 Verdetto sulla parte 2

**Il telefono e' di fatto obbligatorio, ad agosto 2026, per installare .pbw e leggere `pebble logs` su un PT2 reale.** Non esiste un percorso supportato (ne' un percorso community completo) da Linux via BLE. L'unico "spiraglio" architetturale sarebbe scrivere un ponte che esponga il protocollo WebSocket della Developer Connection (quello che `pebble --phone IP` si aspetta) sopra un transport PPoGATT Linux — il repo `coredevices/cloudpebble-ws-proxy-standalone` documenta il lato proxy, e cobble fornirebbe il lato BLE, ma mancherebbero comunque PutBytes e AppLogs: e' un progetto, non una configurazione.

---

## 6. Vincoli specifici di QUESTA macchina (Ubuntu 26.04, no sudo)

Verifiche fatte oggi sulla macchina:

```
DISPLAY=:0   WAYLAND_DISPLAY=wayland-0   XDG_SESSION_TYPE=wayland   -> GUI disponibile
python3      /usr/bin/python3  (3.14.4)
node         /usr/bin/node ; npm ~/.npm-global/bin/npm
gcc          /usr/bin/gcc
cargo/rustc  ~/.cargo/bin      -> presenti
uv/pipx/pip  MANCANTI
libglib-2.0.so.0   OK
libpixman-1.so.0   OK
libz.so.1          OK
libpng16.so.16     OK
libSDL2-2.0.so.0   *** MANCANTE ***
libsndio.so.7      *** MANCANTE ***
```

L'emulatore QEMU dell'SDK linka **SDL2, glib, pixman, zlib, sndio, libpng**. Mancano SDL2 e sndio: **`qemu-pebble` non partira'** senza intervento. Senza sudo la strada e' estrarre i `.deb` in user space — verificato che funziona:

```bash
cd ~/.local/debs 2>/dev/null || mkdir -p ~/.local/debs && cd ~/.local/debs
apt-get download libsdl2-2.0-0 libsndio7.0     # NON richiede root
# -> libsdl2-2.0-0_2.32.10+dfsg-6_amd64.deb   (main, Ubuntu 26.04 resolute)
# -> libsndio7.0_1.10.0-0.2_amd64.deb          (universe)
for d in *.deb; do dpkg -x "$d" ~/.local/usrlibs; done
export LD_LIBRARY_PATH="$HOME/.local/usrlibs/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
```

(Se SDL2 tira altre dipendenze non presenti, ripetere `apt-get download` per quelle che `ldd` segnala come "not found".)

Installazione della toolchain, in user space:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh      # uv in ~/.local/bin
uv tool install "pebble-tool==5.0.39"                # richiede Python >= 3.10
export PATH="$HOME/.local/bin:$PATH"
pebble sdk install latest                            # scarica SDK 4.33.1 + toolchain + qemu-pebble
```

Percorsi risultanti (da `pebble_tool/util/__init__.py`, `get_persist_dir()`): su Linux, se non esiste `~/.pebble-sdk`, si usa `${XDG_DATA_HOME:-~/.local/share}/pebble-sdk`, con `SDKs/<versione>/sdk-core/` e `SDKs/<versione>/toolchain/`.

Riferimento community verificato su Ubuntu 24.04 (<https://github.com/ArtRichards/pebble-time2-dev-setup>, verificato 12/07/2026):
- nomi pacchetti cambiati in 24.04+: `libglib2.0-0t64`, `libpng16-16t64`;
- `libfdt1` non serve;
- **serve un display X/Wayland attivo**: *"A headless host can build PBWs but cannot open the emulator window"* (qui il display c'e');
- patch IPv4 per pypkjs su host senza IPv6 (`scripts/patch-pypkjs-ipv4.sh`) — sintomo: l'emulatore non si aggancia.

Alternativa headless/remota: `pebble install --emulator emery --vnc` avvia `-vnc :1` + `websockify`; in quel caso `pebble-tool` imposta `audio driver=none` (niente speaker) e non apre finestra SDL. Il touch continuerebbe a funzionare dal puntatore VNC (anche VNC usa il percorso assoluto), ma **da verificare sul campo**.

---

## 7. Verifiche da eseguire per confermare (comandi esatti)

```bash
# 1. la macchina pebble-emery esiste nel binario dell'SDK?
qemu-pebble -M help | grep -i pebble

# 2. il device pebble-touch e' compilato nel binario?
qemu-pebble -device help 2>&1 | grep -i pebble
#    (pebble-touch e' sysbus-only: se non compare, usare il punto 4)

# 3. l'SDK spedisce le decorazioni?
find ~/.local/share/pebble-sdk -name 'pt2-*.png' -o -name 'pebble-decorations' -type d

# 4. con l'emulatore avviato e un socket QMP (wrapper PEBBLE_QEMU_PATH):
python3 - <<'PY'
import socket, json
s = socket.socket(socket.AF_UNIX); s.connect("/tmp/pebble-qmp.sock")
f = s.makefile("rw"); f.readline()
def cmd(o):
    f.write(json.dumps(o)+"\n"); f.flush(); return json.loads(f.readline())
cmd({"execute":"qmp_capabilities"})
stack=["/machine"]
while stack:
    p=stack.pop()
    for e in cmd({"execute":"qom-list","arguments":{"path":p}}).get("return",[]):
        if not e.get("type","").startswith("child<"): continue
        c=p+"/"+e["name"]
        if "touch" in e["name"].lower() or "touch" in e.get("type","").lower():
            print("TROVATO:", c,
                  cmd({"execute":"qom-get","arguments":{"path":c,"property":"display-width"}}),
                  cmd({"execute":"qom-get","arguments":{"path":c,"property":"display-height"}}))
        stack.append(c)
PY

# 5. tap col mouse: aprire l'emulatore e cliccare al centro dello schermo
#    su una watchapp che logga TouchEvent_Touchdown; verificare con:
pebble logs --emulator emery

# 6. porte dell'emulatore in corso (monitor HMP, seriale, gdb):
cat /tmp/pb-emulator.json
```

---

## 8. Azioni consigliate

1. **Dare per acquisito che il touch e' testabile in emulatore** e rimuovere questo dalla lista dei rischi "solo hardware". La conferma e' a livello di sorgente: `hw/misc/pebble_touch.c` + `boards/qemu_emery/defconfig` (`CONFIG_TOUCH=y`) + `src/fw/drivers/touch/Kconfig` (`TOUCH_QEMU default y if SOC_QEMU`).

2. **Prima di tutto, sbloccare l'emulatore su questa macchina**: `apt-get download libsdl2-2.0-0 libsndio7.0` + `dpkg -x` in `~/.local/usrlibs` + `LD_LIBRARY_PATH`. Senza questo passo nulla di cio' che segue e' verificabile. Poi `uv tool install pebble-tool==5.0.39` e `pebble sdk install latest` (4.33.1).

3. **Creare subito il wrapper `PEBBLE_QEMU_PATH` che aggiunge `-qmp unix:/tmp/pebble-qmp.sock,server=on,wait=off`** e scriversi un `tools/pbltouch.py` di ~50 righe che replichi `cmd_touch` / `cmd_swipe` di `pbl` (codice completo in sezione 2.4). Questo rende **il touch scriptabile in CI/regressione**, non solo manuale col mouse.
   API da usare: `qmp_capabilities` → `qom-list`/`qom-get` per trovare `pebble-touch` e leggere `display-width`/`display-height` → `input-send-event` con `{"type":"abs","data":{"axis":"x","value": px/width*32767}}` + `{"type":"btn","data":{"button":"left","down":true|false}}`.

4. **Se il progetto e' una watchface, non progettare interazioni touch**: la guida ufficiale (SDK 4.33) vieta `TouchService` nelle watchface. Progettare l'interazione con i 4 pulsanti; eventualmente separare una *watchapp companion* per la configurazione, dove il touch e' lecito.

5. **Costruire un loop di regressione visiva** con `pebble screenshot` (piu' `--gif-fps` per le animazioni): e' il flusso che Core Devices stessa raccomanda nella sua `pebble-watchface-agent-skill` (*"Test in the QEMU emulator → Verify visually with screenshots"*, target di default **emery 200x228**).

6. **Testare esplicitamente il percorso offline** con `pebble emu-bt-connection --connected no` fin dal primo giorno, e valutare `PEBBLE_QEMU_START_CONNECTED=0` per far partire l'emulatore gia' disconnesso (variabile letta da `pebble_generic.c`).

7. **Per la configurazione phone-free**, progettare un menu on-watch dentro l'app (MenuLayer / ActionMenu) e persistere con `persist_*`; verificare il limite runtime con `persist_get_max_size()` (aggiunto in SDK 4.17). L'emulatore esegue il firmware reale, quindi questo percorso e' **interamente testabile** senza hardware. Non contare su Clay/`emu-app-config` come unico percorso: richiede pypkjs/telefono.

8. **Impostare i budget di memoria adesso**, non a fine progetto: su Emery il binario puo' arrivare a **128 KiB** ma l'immagine caricata e la RAM restano a **64 KiB ciascuna** (SDK 4.33). Misurare con `pebble analyze-size` a ogni build e con `heap_bytes_free()` a runtime. Attenzione: `sizeof(ScrollLayer)` (e quindi `MenuLayer`) e' **cresciuto** in 4.33 per lo stato di touch navigation — se qualche struct li incorpora per valore, ricontrollare il footprint.

9. **Non tentare misure di batteria o di performance assolute in emulatore**: batteria = stub a valori fissi, timing = TCG non cycle-accurate. Usare solo metriche deterministiche (byte allocati, numero di redraw, dimensione binario, chiamate a `graphics_*`) e confronti relativi. Rimandare le misure reali al momento in cui l'orologio arriva.

10. **Mettere in conto il telefono nel piano**: per il primo deploy su PT2 reale serve l'app Pebble (Android/iOS) con *Developer Mode* + *Developer Connection*, poi `pebble install --phone <IP>` (stessa Wi-Fi) o `pebble install --cloudpebble`. Non esiste oggi un'alternativa Linux completa.

11. **Opzionale, solo se si vuole ridurre la dipendenza dal telefono in futuro**: tenere d'occhio `luigi311/cobble` (Rust/BlueZ/PPoGATT). Se aggiungera' PutBytes + AppLogs diventerebbe un vero percorso Linux-only. `cargo` e' gia' presente su questa macchina; verificare pero' i permessi D-Bus di BlueZ (registrare un GATT server peripheral potrebbe richiedere appartenenza al gruppo `bluetooth`).

12. **Testare anche `flint` (Pebble 2 Duo) per differenza**: `pebble-flint` ha `has_touch=false` e schermo 144x168 1bpp. Un layout che dipende dal touch o dai 200x228 va degradato con `#if defined(PBL_TOUCH)` e con i define di piattaforma; l'emulatore permette di verificarlo subito (`pebble install --emulator flint`).

---

## 9. Fonti (primarie, con date)

| Fonte | URL | Data |
|---|---|---|
| PebbleOS — `docs/development/qemu.md` (sezioni **Touch**, Interaction, Install .pbw) | https://github.com/coredevices/PebbleOS/blob/main/docs/development/qemu.md | ultimo commit 2026-08-19 |
| PebbleOS — `pbl` (implementazione `cmd_touch`/`cmd_swipe` via QMP) | https://github.com/coredevices/PebbleOS/blob/main/pbl | commit "tools/pbl: add QEMU touch injection (touch/swipe commands)" 2026-07-29 |
| PebbleOS — `boards/qemu_emery/defconfig` | https://github.com/coredevices/PebbleOS/blob/main/boards/qemu_emery/defconfig | 2026-07-22 |
| PebbleOS — `boards/obelix/defconfig` (HW reale PT2) | https://github.com/coredevices/PebbleOS/blob/main/boards/obelix/defconfig | 2026-07-29 |
| PebbleOS — `include/pbl/drivers/qemu/qemu_serial.h` (enum `QemuProtocol`) | https://github.com/coredevices/PebbleOS/blob/main/include/pbl/drivers/qemu/qemu_serial.h | consultato 2026-08-24 |
| PebbleOS — `src/fw/drivers/touch/Kconfig` + `wscript_build` | https://github.com/coredevices/PebbleOS/tree/main/src/fw/drivers/touch | consultato 2026-08-24 |
| PebbleOS — `docs/development/debugging.md` | https://github.com/coredevices/PebbleOS/blob/main/docs/development/debugging.md | consultato 2026-08-24 |
| PebbleOS — `docs/development/getting_started.md` (dipendenze con sudo) | https://github.com/coredevices/PebbleOS/blob/main/docs/development/getting_started.md | consultato 2026-08-24 |
| QEMU fork Core Devices — `hw/misc/pebble_touch.c` | https://github.com/coredevices/qemu/blob/pebble-10.1/hw/misc/pebble_touch.c | commit 2026-04-20 |
| QEMU fork — `hw/arm/pebble_generic.c` (board config emery/flint/gabbro) | https://github.com/coredevices/qemu/blob/pebble-10.1/hw/arm/pebble_generic.c | consultato 2026-08-24 |
| QEMU fork — `hw/display/pebble_display.c` (BRIGHTNESS/BL_RED/GREEN/BLUE) | https://github.com/coredevices/qemu/blob/pebble-10.1/hw/display/pebble_display.c | consultato 2026-08-24 |
| QEMU fork — `ui/sdl2.c` (mouse → `qemu_input_queue_abs`, decorazioni) | https://github.com/coredevices/qemu/blob/pebble-10.1/ui/sdl2.c | commit 2026-05-08 |
| QEMU fork — `ui/sdl2-decoration.c` (preset pt2-br/pt2-sb/p2d/pr2) | https://github.com/coredevices/qemu/blob/pebble-10.1/ui/sdl2-decoration.c | consultato 2026-08-24 |
| QEMU fork — `ui/ui-hmp-cmds.c` (`hmp_mouse_move` = REL) | https://github.com/coredevices/qemu/blob/pebble-10.1/ui/ui-hmp-cmds.c | consultato 2026-08-24 |
| pebble-tool 5.0.39 — `pebble_tool/commands/emucontrol.py` | https://github.com/coredevices/pebble-tool/blob/main/pebble_tool/commands/emucontrol.py | commit 2026-06-30 |
| pebble-tool — `pebble_tool/sdk/emulator.py` (riga di comando QEMU, `PEBBLE_QEMU_PATH`) | https://github.com/coredevices/pebble-tool/blob/main/pebble_tool/sdk/emulator.py | commit 2026-05-22 |
| pebble-tool — `pyproject.toml` (v5.0.39, Python >= 3.10, dipendenze) | https://github.com/coredevices/pebble-tool/blob/main/pyproject.toml | consultato 2026-08-24 |
| Guida ufficiale **Touch** (TouchService, recognizer, no-watchface) | https://developer.repebble.com/guides/events-and-services/touch/ | pubblicata con SDK 4.33, 2026-08-12 |
| Changelog SDK 4.33 | https://developer.repebble.com/sdk/changelogs/4.33/ | 2026-08-12 |
| Changelog SDK 4.33.1 (firmware emulatore 4.33.2) | https://developer.repebble.com/sdk/changelogs/4.33.1/ | 2026-08-14 |
| Changelog SDK 4.17 (backlight service, speaker limits, `persist_get_max_size`) | https://developer.repebble.com/sdk/changelogs/4.17/ | 2026-06-23 |
| Guida **Command Line Tool** (elenco `emu-*` pubblicato, `--serial`, `--phone`) | https://developer.repebble.com/guides/tools-and-resources/pebble-tool/ | consultata 2026-08-24 |
| Guida **Developer Connection** (Android/iOS) | https://developer.repebble.com/guides/tools-and-resources/developer-connection/ | consultata 2026-08-24 |
| FAQ ufficiale ("per l'orologio reale serve il telefono") | https://developer.repebble.com/faqs/ | consultata 2026-08-24 |
| Pagina SDK / installazione Linux (uv, deps, SDK 4.33.1) | https://developer.repebble.com/sdk/ | consultata 2026-08-24 |
| App mobile ufficiale, `libpebble3` (target solo android/ios) | https://github.com/coredevices/mobileapp | push 2026-08-20 |
| `luigi311/cobble` — PPoGATT su BlueZ da Linux | https://github.com/luigi311/cobble | creato 2026-06-10, push 2026-08-23 |
| `ArtRichards/pebble-time2-dev-setup` — setup Linux verificato | https://github.com/ArtRichards/pebble-time2-dev-setup | verificato 2026-07-12 |
| `coredevices/pebble-watchface-agent-skill` — flusso build→emulatore→screenshot | https://github.com/coredevices/pebble-watchface-agent-skill | push 2026-08-05 |

---

## 10. Domande ancora aperte

1. Il bundle SDK 4.33.1 contiene i PNG `pebble-decorations/pt2-*.png` (per usare `-display sdl,decoration=pt2-br` con `pebble-tool`)? Da verificare con `find ~/.local/share/pebble-sdk -name 'pt2-*.png'` dopo l'installazione.
2. Il binario `qemu-pebble` spedito nell'SDK 4.33.1 e' compilato dallo stesso branch `pebble-10.1` con `pebble_touch.c`? Molto probabile (la macchina si chiama `pebble-emery` e il firmware `qemu_emery` ha `CONFIG_TOUCH=y`), ma non verificato con il binario alla mano.
3. Il touch funziona anche in modalita' `--vnc` di `pebble-tool` (puntatore VNC → eventi assoluti)? Coerente col codice, non verificato.
4. Registrare un GATT server peripheral con BlueZ (necessario a `cobble`) e' possibile senza sudo su questa macchina? Dipende dai permessi D-Bus/gruppo `bluetooth`.
5. Esiste un percorso ufficiale di "sideload" del .pbw dal PC al PT2 (es. via Pebble Appstore web o Web Bluetooth) non documentato nella FAQ? Non trovato nelle fonti primarie consultate.
6. Il firmware 4.33.x espone un menu on-watch di configurazione **per app di terze parti** (oltre a `Settings → Display → Touch` di sistema)? Non trovato: la configurazione per app resta Clay/PebbleKit JS lato telefono, quindi un menu on-watch va implementato dall'app.

# SDK, toolchain e workflow di sviluppo per i nuovi Pebble (Core Devices) su Linux — stato ad agosto 2026

Data ricerca: 2026-08-24. Macchina di riferimento: Ubuntu 26.04 LTS x86_64, senza sudo, Python di sistema 3.14.4, Node 22.22.1, gcc 15.2.

Legenda: **[CONFERMATO]** = verificato su fonte primaria o riprodotto localmente; **[INFERENZA]** = deduzione ragionevole non verificata direttamente; **[DA VERIFICARE]** = non confermabile.

Nota storica importante: il nome piattaforma `emery` esisteva già nel 2016 (SDK 4.2, Pebble Time 2 originale, mai spedito per l'insolvenza di Pebble). Core Devices (Eric Migicovsky) ha riusato il nome `emery` per il **nuovo** Pebble Time 2 (annunciato 18/3/2025 come "Core Time 2", rinominato "Pebble Time 2" a luglio 2025, in produzione di massa dal 9/3/2026, >25.000 unità spedite in 93 paesi al 21/8/2026). Tutto ciò che segue riguarda il **nuovo** hardware e il **nuovo** toolchain (pebble-tool 5.x in Python 3), non l'SDK 4.x del 2016 (Python 2.7, tarball `pebble-sdk-4.5-linux64`), che è obsoleto.

---

## 0. Riepilogo esecutivo (TL;DR)

- **Installazione ufficiale 2026**: `uv tool install pebble-tool` + `pebble sdk install latest`. Niente Docker, niente apt per il toolchain ARM: tutto va in `~/.local/share/pebble-sdk/` (o `~/.pebble-sdk` se già esiste). **[CONFERMATO, riprodotto localmente]**
- **Versioni correnti**: pebble-tool **5.0.39** (30/6/2026, PyPI); SDK **4.33.1** (14/8/2026) = `latest`; firmware PebbleOS **v4.35.0** (19/8/2026). Toolchain ARM = xPack `arm-none-eabi-gcc 14.2.1`; emulatore = `qemu-pebble` **QEMU 10.1.5-pebble14** (nel pacchetto SDK 4.33.1); Moddable SDK 8.3.1 (XS 17.8) per Alloy. **[CONFERMATO]**
- **Python 3.14**: pebble-tool 5.0.38+ dichiara supporto 3.10–3.14 e localmente funziona **sia** con Python 3.14.7 gestito da uv **sia** con 3.13.15. **ATTENZIONE**: con il Python 3.14 **di sistema** di Ubuntu (`/usr/bin/python3`) `pebble sdk install` fallisce perché manca `ensurepip` (pacchetto `python3.14-venv` → serve sudo). Soluzione senza sudo: `uv python install 3.13` (o 3.14) e `uv tool install pebble-tool --python 3.13`. **[CONFERMATO localmente]**
- **Emulatore Pebble Time 2**: esiste (`pebble install --emulator emery`), così come `flint` (Pebble 2 Duo) e `gabbro` (Pebble Round 2). Su questa macchina mancano `libSDL2-2.0.so.0` e `libXss.so.1`; senza sudo si risolve estraendo i .deb (`apt-get download libsdl2-classic libxss1` + `dpkg-deb -x`) e usando `LD_LIBRARY_PATH`. Verificato: emulatore emery avviato, app installata, screenshot 200×228 salvato. **[CONFERMATO localmente]**
- **Linguaggio consigliato per i tuoi obiettivi** (performance, memoria, offline): **C nativo** (`pebble new-project`), eventualmente con PebbleKit JS (`src/pkjs`) solo per la configurazione/fetch lato telefono. **Alloy** (JavaScript/TypeScript su orologio, motore Moddable XS) è la novità 2026, ufficiale e fuori dalla preview da aprile 2026, ma solo per `emery`/`gabbro`, con overhead di RAM (macchina XS ~29 KB dopo il fix di luglio 2026) e API C non tutte esposte. **Rocky.js è deprecato**; Pebble.js è morto; Rust/Zig sono solo esperimenti community non ufficiali.
- **AI tooling**: Core Devices mantiene la skill ufficiale per Claude Code/Codex `coredevices/pebble-watchface-agent-skill` (aggiornata 4/8/2026 con supporto watchapp + Alloy), `pebble new-project --ai` genera `CLAUDE.md` + `.cursor/rules/pebble.mdc`, la documentazione ha `https://developer.repebble.com/llms.txt` e ogni pagina è disponibile come `.md`. Esiste un MCP server community (`dbonomo/pebble-mcp`). **CloudPebble è tornato**: `https://cloudpebble.repebble.com` (emulatori aplite→gabbro incluso emery).
- **Test su orologio reale**: la nuova app mobile Core Devices ("Pebble", Android `coredevices.coreapp`; iOS "Pebble Core") supporta la developer connection: *Devices → ⋯ → Enable Dev Connect* + login GitHub, poi `pebble login` e `pebble install --cloudpebble` (relay cloud, funziona anche fuori dalla LAN) oppure la via legacy `pebble install --phone <IP>`.
- **Docs ufficiali**: `https://developer.repebble.com` (sorgente: `github.com/coredevices/sdk-docs`). `developer.rebble.io` è la copia di Rebble, leggermente disallineata.

---

## 1. Installazione ufficiale dell'SDK su Linux nel 2026

### 1.1 Cosa dice la documentazione ufficiale (developer.repebble.com/sdk)

Pagina: https://developer.repebble.com/sdk/ (Core Devices, consultata 2026-08-24). Passi per Ubuntu:

```bash
# 1) dipendenze di sistema (richiedono sudo — vedi §1.5 per la via senza sudo)
sudo apt install nodejs npm libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g libsndio7.0
# 2) uv (installer user-space in ~/.local/bin)
curl -LsSf https://astral.sh/uv/install.sh | sh
# 3) CLI
uv tool install pebble-tool
# 4) SDK (scarica sdk-core + toolchain ARM + QEMU + Moddable)
pebble sdk install latest
```

Requisito dichiarato: "pebble-tool requires Python 3.10 or later" (pyproject: `requires-python = ">=3.10"`). **[CONFERMATO]**

Il README di `github.com/coredevices/pebble-tool` chiarisce il modello: "The toolchain (arm-none-eabi) and QEMU binary are no longer bundled, but instead installed when `pebble sdk install` is run". Data dir: Linux `~/.pebble-sdk` (legacy) — in realtà dal 5.0.36 il codice (`pebble_tool/util/__init__.py::get_persist_dir`) usa `~/.pebble-sdk` **solo se esiste già**, altrimenti `$XDG_DATA_HOME/pebble-sdk` = `~/.local/share/pebble-sdk`. **[CONFERMATO nel sorgente e localmente]**

Repo GitHub rilevanti (org `coredevices`, tutti attivi ad agosto 2026):

| Repo | Ruolo | Ultimo update |
|---|---|---|
| `coredevices/pebble-tool` | CLI `pebble` (PyPI `pebble-tool`) | 2026-08-24 |
| `coredevices/sdk-core` | contenuto SDK (header, lib, waf, immagini QEMU) | 2026-02-22 |
| `coredevices/sdk-packager` | costruisce i tar.gz SDK/toolchain caricati su Cloudflare (`https://sdk.repebble.com`) | 2026-08-17 |
| `coredevices/PebbleOS` | firmware (release v4.35.0 il 19/8/2026) | 2026-08-24 |
| `coredevices/PebbleOS-SDK` | "self-contained firmware SDK" (ARM GNU toolchain + picolibc + Pebble QEMU + sftool) — serve per compilare **il firmware**, non le app; v0.1.8 (18/8/2026) porta QEMU a v10.1.5-pebble16 | 2026-08-18 |
| `coredevices/qemu` | fork QEMU, branch `pebble-10.1` | 2026-08-23 |
| `coredevices/pypkjs` | PebbleKit JS in Python per l'emulatore | 2026-07-05 |
| `coredevices/sdk-docs` | sorgente di developer.repebble.com (Jekyll) | 2026-08-14 |
| `coredevices/cloudpebble` | IDE web | 2026-08-23 |
| `coredevices/pebble-watchface-agent-skill` | skill AI ufficiale | 2026-08-24 |
| `coredevices/codespaces-pebble` | devcontainer "Pebble Cloud IDE" | 2026-01-08 |
| `coredevices/pebble-vscode` | estensione VS Code (repo archiviato 2/7/2026, ma l'estensione è sul Marketplace v0.0.8) | — |
| `coredevices/example-apps` | esempi C per Time 2/Round 2 (touch, RGB backlight, speaker) | 2026-05-01 |
| `coredevices/mobileapp` | app mobile (Kotlin Multiplatform, GPLv3) | 2026-08-24 |

Non esistono un'immagine Docker ufficiale "pebble-sdk" né un pacchetto Nix ufficiale: la via ufficiale è **uv**. (Docker/Nix community: vedi §6.)

### 1.2 Versioni correnti **[CONFERMATO]**

- **pebble-tool**: 5.0.39 (PyPI, 30/6/2026). Storico 2026: 5.0.28 (28/2) … 5.0.30 (31/3: aggiunta piattaforma `flint`), 5.0.32 (23/4: `pebble publish --screenshots`, rilevamento versione QEMU), 5.0.33 (28/4: Linux usa backend SDL), 5.0.35 (7/5: `send-app-message`, `--throttle`), 5.0.36 (3/6: `pebble compile-commands`, `pebble sdk --server`), 5.0.38 (11/6: "Python 3.10–3.14 support", fix `--help` su 3.14, `pebble build --debug` → `PBL_DEBUG`, avvio automatico xsbug), 5.0.39 (30/6: `emu-distance`, `emu-calories`, `emu-active-time`, `emu-sleep`, `emu-heart-rate`).
- **SDK** (`pebble sdk list`, 24/8/2026): 4.4, 4.5, 4.9.127, 4.9.148, 4.9.169, 4.17, **4.33.1** (= `latest`). Date: 4.9.127 (20/2/2026, Alloy dev preview + piattaforma gabbro), 4.9.148 (2/4/2026, Alloy fuori preview, `pebble publish`), 4.9.169 (1/5/2026, Speaker API `PBL_SPEAKER`, Touch API `PBL_TOUCH`, `light_set_color()`, Moddable 8.0.0, richiede pebble-tool ≥5.0.32), 4.17 (23/6/2026: `persist_get_max_size()`, `speaker_is_muted()`, `backlight_service_subscribe()`, `app_launch_get_quick_launch_action()`, Alloy FFI, Moddable 8.2.3, `pebble build --debug`, richiede pebble-tool ≥5.0.38), 4.33 (12/8/2026: touch recognizers `tap_recognizer_create()`/`pan_recognizer_create()`/`swipe_recognizer_create()`, `window_attach_recognizer()`, `app_touch_navigation_enable()`, HRV `health_service_peek_hrv_ppi_ms()`, `alarm_service_peek_next()`, **max app binary su emery/gabbro portato a 128 KiB da 64 KiB**, Moddable 8.3.1/XS 17.8, modulo `pebble/health`; le app compilate richiedono firmware ≥4.32), 4.33.1 (14/8/2026: hotfix emulatore, firmware 4.33.2).
- La numerazione SDK segue ora quella del firmware PebbleOS (4.17, 4.33…); le app 4.33 richiedono firmware 4.32+.
- Nel pacchetto SDK 4.33.1 scaricato localmente: `toolchain/bin/qemu-pebble` → "QEMU emulator version 10.1.5-pebble14"; `toolchain/arm-none-eabi/bin/arm-none-eabi-gcc` → "xPack GNU Arm Embedded GCC x86_64 14.2.1 20241119"; `toolchain/moddable`, `toolchain/moddable-tools`. Dimensione SDK installato: ~770 MB.
- `sdk-packager/download-toolchain.sh` (24/8/2026): `VERSION="${1:-14.2.1-1.1}"` (xpack-dev-tools/arm-none-eabi-gcc-xpack), `MODDABLE_VERSION="${2:-8.3.1}"`, build per linux-x64, linux-arm64, darwin-x64, darwin-arm64.

### 1.3 Python 3.14: funziona? **[CONFERMATO localmente il 24/8/2026]**

- Documentazione Core Devices: solo ">= 3.10". La copia Rebble (`developer.rebble.io/sdk/`) contiene ancora la nota "As of version 5.0.18, Core Devices' pebble-tool does not yet support Python 3.14, so we currently recommend installing under Python 3.13" — **obsoleta**: le release notes di 5.0.38 (11/6/2026) dicono "Python 3.10–3.14 support" e "Fixed --help generation crashing on Python 3.14".
- Il blog Core Devices (2/4/2026) e il devcontainer ufficiale usano ancora `--python 3.13` (`uv tool upgrade pebble-tool --python 3.13`; devcontainer: `uv tool install pebble-tool --python 3.13 && pebble sdk install latest`).
- Test locali (sandbox in scratchpad, HOME reindirizzata):
  1. `uv tool install pebble-tool --python /usr/bin/python3` (Python **3.14.4 di sistema**): installazione OK in 9 s, `pebble --version` → "Pebble Tool v5.0.39" (solo `SyntaxWarning: "\ " is an invalid escape sequence` da `libpebble2/protocol/base/types.py`, innocui). **MA** `pebble sdk install latest` fallisce: `subprocess.CalledProcessError: Command '[.../python', '-m', 'venv', '.../SDKs/4.33.1/.venv']' returned non-zero exit status 1` perché il Python di sistema di Ubuntu non ha `ensurepip` (`ModuleNotFoundError: No module named 'ensurepip'`; servirebbe `apt install python3.14-venv`).
  2. `uv python install 3.13` (3.13.15) + `uv tool install --force pebble-tool --python 3.13` + `pebble sdk install latest`: **OK in 36 s** (venv creata con il Python gestito da uv, che include ensurepip).
  3. `uv python install 3.14` (3.14.7) + `uv tool install pebble-tool --python 3.14` + `pebble sdk install latest` + `pebble new-project --simple t && pebble build` + `pebble new-project --alloy a && pebble build`: **tutto OK** (SDK venv "Python 3.14.7", `.pbw` prodotti per C e Alloy).
- Conclusione: Python 3.14 va bene, purché l'interprete abbia `venv`+`ensurepip` → su Ubuntu senza sudo usare **sempre un Python gestito da uv** (`--python 3.13` resta la scelta "ufficiale" e più conservativa; 3.14 funziona).
- L'SDK crea una propria venv per versione (`SDKs/4.33.1/.venv`) con `requirements.txt` = `freetype-py>=2.5.1 sh>=2.2.1 pypng>=0.20220715.0` e fa `npm install` dei moduli JS dell'SDK: **Node/npm sono necessari** (Node 22 presente sulla macchina).

### 1.4 Toolchain ARM senza sudo **[CONFERMATO]**

Non serve installare `gcc-arm-none-eabi` da apt: `pebble sdk install` scarica `https://sdk.repebble.com/releases/<versione>/toolchain-linux-x86_64.tar.gz` (fallback `toolchain-linux.tar.gz`; codice in `pebble_tool/sdk/manager.py`, `DOWNLOAD_SERVER = "https://sdk.repebble.com"`) e lo estrae in `~/.local/share/pebble-sdk/SDKs/<ver>/toolchain/`. `pebble` aggiunge da solo `toolchain/bin` al `PATH` a runtime (`pebble_tool/__init__.py`). Nessuna operazione richiede root. Il gcc 15 di sistema **non** viene usato.

### 1.5 Emulatore/QEMU senza sudo: il vero ostacolo su questa macchina **[CONFERMATO localmente]**

- `qemu-pebble` è un binario dinamico che richiede a runtime `libSDL2-2.0.so.0`, `libglib-2.0.so.0`, `libpixman-1.so.0`, `libpng16.so.16`, `libz.so.1` (e SDL2 a sua volta `libXss.so.1` ecc.). Sulla macchina di sviluppo erano presenti glib, pixman, png16, zlib (`libglib2.0-0t64 2.88`, `libpixman-1-0 0.46.4`, `libpng16-16t64 1.6.57`) ma **mancavano `libSDL2-2.0.so.0` e `libXss.so.1`**. Errore: `Couldn't launch emulator: qemu-pebble: error while loading shared libraries: libSDL2-2.0.so.0: cannot open shared object file`.
- Su Ubuntu 26.04 `libsdl2-2.0-0` è un **metapacchetto** (14 KB, solo symlink verso `sdl2-classic/`) che dipende da `libsdl2-classic`; esiste anche `libsdl2-compat-shim` (SDL2 emulato su SDL3, non testato).
- Workaround senza sudo (testato, funziona; `apt-get download` non richiede root):

```bash
mkdir -p ~/.local/lib/pebble-deps && cd ~/.local/lib/pebble-deps
apt-get download libsdl2-classic libxss1 libsndio7.0      # scarica solo i .deb
for d in *.deb; do dpkg-deb -x "$d" root; done             # estrae in ./root
# da mettere in ~/.bashrc (o in uno script wrapper):
export LD_LIBRARY_PATH="$HOME/.local/lib/pebble-deps/root/usr/lib/x86_64-linux-gnu:$HOME/.local/lib/pebble-deps/root/usr/lib/x86_64-linux-gnu/sdl2-classic${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
ldd ~/.local/share/pebble-sdk/SDKs/current/toolchain/bin/qemu-pebble | grep "not found"   # deve essere vuoto
```

  Risultato locale: `qemu-pebble --version` → `QEMU emulator version 10.1.5-pebble14`; `pebble install --emulator emery` → "App install succeeded." in 3,8 s; `pebble screenshot --emulator emery --no-open shot.png` → PNG 200×228 con la UI dell'app di esempio ("Press a button"). Ha funzionato in sessione Wayland con `DISPLAY=:0` (XWayland). `libsndio` non risultava richiesta direttamente dal binario 10.1.5-pebble14 (ArtRichards la elenca per la sua build; tenerla estratta non costa nulla).
- Alternativa headless (CI, SSH senza X): `--vnc` su **tutti** i comandi che toccano l'emulatore (`pebble install --emulator emery --vnc`, `pebble screenshot --emulator emery --vnc`), documentato nel `CLAUDE.md` generato da `pebble new-project --ai` ("Headless Environments … you must add --vnc to all commands that interact with the emulator"); pebble-tool lancia anche `websockify`. Nota: la libreria SDL2 deve comunque essere risolvibile dal loader.
- Emulatori disponibili in SDK 4.33.1 (directory `sdk-core/pebble/<plat>/qemu/` con `qemu_micro_flash.bin`, `qemu_spi_flash.bin.bz2`, `layouts.json`, `<plat>_sdk_debug.elf`): **aplite, basalt, chalk, diorite, emery, flint, gabbro**. `pebble install --help` → `--emulator {flint,emery,diorite,chalk,basalt,aplite,gabbro}`. Quindi **sì, esiste un emulatore per il Pebble Time 2 (emery)**, per il Pebble 2 Duo (flint) e per il Round 2 (gabbro). **[CONFERMATO]** L'emulatore è un modello QEMU "Pebble" (fork 10.1) e non un'emulazione ciclo-accurata del SiFli SF32LB52J: `emu-heart-rate` è "emery board only"; prestazioni/timing reali vanno verificati sull'orologio. **[INFERENZA]**
- Immagine firmware emulatore 4.33.1: `emery_sdk_debug.elf`/`qemu_micro_flash.bin` ≈ 19,6 MB.

### 1.6 Percorso completo user-space (ricetta consigliata per questa macchina) **[CONFERMATO]**

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh           # uv in ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"
uv python install 3.13                                     # Python con ensurepip (3.14 funziona ugualmente)
uv tool install pebble-tool --python 3.13                  # ~9 s
pebble sdk install latest                                  # SDK 4.33.1 + toolchain + QEMU, ~770 MB, ~40-80 s
pebble sdk list                                            # "4.33.1 (active)"
# librerie runtime QEMU senza sudo: vedi §1.5 (libsdl2-classic, libxss1)
pebble new-project --ai myface && cd myface && pebble build && pebble install --emulator emery
```

Aggiornamenti: `uv tool upgrade pebble-tool --python 3.13` e `pebble sdk install latest` (come nel blog del 2/4/2026). Nota `--force` di uv reinstalla e cancella eventuali patch locali (es. quella IPv4 di ArtRichards).

### 1.7 Problemi noti su Ubuntu (2026)

1. **Python di sistema senza ensurepip** → `pebble sdk install` fallisce nel creare la venv (visto sopra). Usare Python gestito da uv. **[CONFERMATO]**
2. **Nomi pacchetti cambiati su 24.04/26.04**: `libglib2.0-0t64`, `libpng16-16t64`, `libsdl2-2.0-0` → metapacchetto su `libsdl2-classic`. Il comando apt della doc ufficiale funziona comunque grazie ai transitional. **[CONFERMATO]**
3. **libSDL2/libXss mancanti senza sudo** → §1.5. **[CONFERMATO]**
4. **Host senza IPv6**: `pypkjs` fa bind su socket IPv6 e l'emulatore non parte; patch `scripts/patch-pypkjs-ipv4.sh` (bind su `0.0.0.0`) nel repo `ArtRichards/pebble-time2-dev-setup` (12/7/2026), da riapplicare dopo ogni `uv tool install --force`. Su questa macchina IPv6 è attivo (`/proc/sys/net/ipv6/conf/all/disable_ipv6 = 0`), quindi non serve. **[CONFERMATO fonte; non riprodotto]**
5. **Install interrotti** lasciano directory incomplete → `pebble sdk uninstall <ver>` e reinstallare; "Already installed" esce con codice ≠0 (rompe script CI); a volte serve `pebble sdk activate <ver>` (ArtRichards, 12/7/2026). **[CONFERMATO fonte]**
6. **Emulatore richiede display**: la build è headless, `install/screenshot --emulator` no (SDL) → `--vnc`. **[CONFERMATO]**
7. `SyntaxWarning` da libpebble2 su Python 3.14: cosmetici. **[CONFERMATO]**
8. Stato emulatore in `/tmp/pb-emulator.json` (pid/porte QEMU, pypkjs, gdb, monitor): utile per debug; `pebble kill` chiude tutto, `pebble wipe [--everything]` resetta lo storage emulato. **[CONFERMATO]**
9. Disco: SDK ≈770 MB + cache uv (≈440 MB dopo l'install): su `/tmp` tmpfs (2,7 GB) si va a quota; installare in `$HOME`. **[CONFERMATO]**

---

## 2. Comandi principali e struttura del progetto

### 2.1 Comandi (`pebble --help`, 5.0.39) **[CONFERMATO]**

`sdk, build, clean, install, logs, screenshot, insert-pin, delete-pin, emu-accel, emu-app-config, emu-battery, emu-bt-connection, emu-compass, emu-control, emu-tap, emu-time-format, emu-set-time, emu-set-timeline-quick-view, emu-set-content-size, emu-button, emu-steps, emu-distance, emu-calories, emu-active-time, emu-sleep, emu-heart-rate, ping, login, logout, repl, transcribe, data-logging, publish, fw, send-app-message, new-project, new-package, kill, wipe, package, analyze-size, convert-project, gdb, compile-commands`.

Dettagli utili:

- `pebble new-project NAME [--c | --alloy | --rocky] [--simple] [--javascript] [--worker] [--ai]` — `--ai` "Generate templates for Claude Code and Cursor" (crea `CLAUDE.md` e `.cursor/rules/pebble.mdc`); `--javascript` aggiunge `src/pkjs/index.js` (PebbleKit JS); `--worker` aggiunge `worker_src/`; `--alloy` crea un progetto Moddable. `pebble new-package NAME [--javascript]` per librerie npm Pebble.
- `pebble build [--debug]` — `--debug`: `-O0`, define `PBL_DEBUG`, output `*_debug.pbw`, per Alloy abilita xsbug. Stampa per ogni piattaforma "APP MEMORY USAGE: Total size of resources / Total footprint in RAM / Free RAM available (heap)".
- `pebble install [FILE.pbw] (--emulator PLAT | --phone [IP] | --cloudpebble | --qemu [host:port] | --serial DEV) [--logs] [--qemu_logs] [--force] [--throttle [s]] [--sdk VER] [--vnc] [--pypkjs --platform PLAT]`. Variabili: `PEBBLE_PHONE`, `PEBBLE_EMULATOR`, `PEBBLE_QEMU`, `PEBBLE_QEMU_PATH`.
- `pebble logs [--color|--no-color]` (stesse opzioni di connessione), `pebble screenshot [FILE] [--no-correction] [--no-open] [--all-platforms] [--gif-all-platforms] [--gif-fps N]`.
- `pebble emu-app-config [--file FILE]` apre la pagina di configurazione (Clay) per l'emulatore; `pebble emu-button`, `emu-tap`, `emu-accel`, `emu-compass`, `emu-battery`, `emu-bt-connection --connected yes|no`, `emu-time-format --format 12h|24h`, `emu-set-time`, `emu-set-timeline-quick-view on|off`, `emu-set-content-size`, health: `emu-steps/-distance/-calories/-active-time/-sleep/-heart-rate` (heart-rate solo emery).
- `pebble analyze-size` — nel test locale su un'app banale stampa `.text/.data/.bss: count 0 size 0` per ogni ELF (poco utile così; per il footprint reale usare la tabella di `pebble build` e `heap_bytes_free()`/`heap_bytes_used()` a runtime).
- `pebble compile-commands [--platform PLAT] [--sdk VER]` (5.0.36+) — scrive `compile_commands.json` nella root del progetto ("default: emery if targeted").
- `pebble sdk {list, install, activate, uninstall, set-channel, include-path PLAT}` (`pebble sdk install latest|4.17|…`, `pebble sdk --server URL`).
- `pebble wipe [--everything]`, `pebble kill`, `pebble gdb` (debug su emulatore con breakpoint), `pebble repl`, `pebble ping`, `pebble send-app-message` (5.0.35), `pebble data-logging …`, `pebble insert-pin/delete-pin`, `pebble transcribe` (mock dettatura).
- `pebble login/logout` (Firebase auth: serve per `--cloudpebble` e `publish`), `pebble publish [--release-notes …] [--is-published] [--all-platforms] [--gif-all-platforms] [--non-interactive] [--name] [--version] [--description]` — pubblica sull'appstore da CLI (dal 2/4/2026).
- `pebble convert-project` (migra progetti vecchi con `appinfo.json` a `package.json`), `pebble package` (build di pacchetti), `pebble fw` (gestione firmware).

### 2.2 Struttura progetto C (generata da `pebble new-project`) **[CONFERMATO]**

```
myapp/
├── package.json     # manifest: name, version, "pebble": { uuid, sdkVersion:"3", enableMultiJS:true,
│                    #   targetPlatforms:[aplite,basalt,chalk,diorite,emery,flint,gabbro],
│                    #   watchapp:{watchface:false}, messageKeys:[…], resources:{media:[…]} }
├── wscript          # build waf (ctx.load('pebble_sdk')); si può personalizzare
├── src/c/myapp.c    # codice C
├── src/pkjs/index.js  (con --javascript) # PebbleKit JS lato telefono
├── worker_src/      (con --worker)       # background worker
├── resources/       # immagini (png → bitmap/pdc), font (ttf), raw; dichiarati in package.json "media"
├── CLAUDE.md, .cursor/rules/pebble.mdc (con --ai)
└── build/           # <plat>/pebble-app.elf|.bin, app_resources.pbpack, myapp.pbw
```

`targetPlatforms` decide per quali orologi si compila: per Time 2 + 2 Duo lasciare almeno `["emery","flint"]` (consiglio: tenere anche `basalt`/`diorite` costa poco e serve per la compatibilità con i vecchi Pebble supportati da Rebble/nuova app).

Flag compilatore reali per `emery` (da `compile_commands.json`): `arm-none-eabi-gcc -std=c99 -mcpu=cortex-m3 -mthumb -ffunction-sections -fdata-sections -fcommon -g -fPIE -Os … -DRELEASE -DPBL_PLATFORM_EMERY -DPBL_COLOR -DPBL_RECT -DPBL_MICROPHONE -DPBL_SMARTSTRAP -DPBL_HEALTH -DPBL_SMARTSTRAP_POWER -DPBL_COMPASS -DPBL_TOUCH -DPBL_RGB_BACKLIGHT -DPBL_SPEAKER -DPBL_DISPLAY_WIDTH=200 -DPBL_DISPLAY_HEIGHT=228 -DPBL_SDK_3 -I~/.local/share/pebble-sdk/SDKs/current/sdk-core/pebble/emery/include …`. Nota: si compila per **Cortex-M3/Thumb, `-Os`, PIE**, anche se l'MCU reale è un Star-MC1 (Cortex-M33-like): niente FPU/DSP in user space, niente `-O3`. **[CONFERMATO]**

Header disponibili in `sdk-core/pebble/emery/include/`: `pebble.h`, `pebble_fonts.h`, `pebble_worker.h`, `pebble_process_info.h`, `gcolor_definitions.h`, `xsffi.h` (FFI Alloy).

### 2.3 Struttura progetto Alloy (`pebble new-project --alloy`) **[CONFERMATO]**

```
src/embeddedjs/main.js        # codice JS sull'orologio (XS)
src/embeddedjs/manifest.json  # include $(MODDABLE)/examples/manifest_mod.json + manifest_typings.json; "modules": {"*": "./main"}
src/pkjs/index.js             # PebbleKit JS sul telefono (proxy rete)
src/c/mdbl.c                  # entry C che crea la macchina Moddable (di solito non si tocca; qui si passano ModdableCreationRecord/FFI)
package.json                  # targetPlatforms: ["emery","gabbro"] (solo questi)
```

La build esegue `xsc`/`xsl`/`mcrun` (Moddable) e inietta un `MOD` come risorsa (`mc.xsa`): nel test l'app Alloy vuota produce risorse 7.828 byte e binario C 276 byte su emery.

---

## 3. Linguaggi: opzioni e raccomandazione

| Opzione | Stato 2026 | Piattaforme | Memoria/performance | Offline |
|---|---|---|---|---|
| **C nativo (Pebble C SDK)** | ufficiale, primario | tutte (aplite→gabbro) | footprint minimo (app vuota: 827 B RAM), controllo totale, `-Os` Thumb | totale: nessuna dipendenza dal telefono |
| **PebbleKit JS** (`src/pkjs`) | ufficiale, gira **sul telefono** | tutte | zero RAM sull'orologio; serve Bluetooth + app mobile attiva | no: serve solo per config (Clay), fetch web, GPS del telefono |
| **Alloy** (JS/TS su orologio, Moddable XS) | ufficiale, fuori preview dal 2/4/2026 | solo **emery, gabbro** | motore XS ~29 KB (chunk+slot) dopo fix luglio 2026, prima 49 KB; heap app emery ~130 KB totali; "many C APIs remain unavailable"; FFI verso C dal 4.17 | sì (gira sull'orologio), ma `fetch`/WebSocket passano dal telefono |
| **Rocky.js** | **deprecato** ("RockyJS is deprecated and is not recommended for new development… we recommend Alloy") | vecchie | JerryScript, mai completato | — |
| **Pebble.js** | morto (2016; UI renderizzata dal telefono) | — | inutilizzabile offline per design | no |
| **Rust** | solo esperimenti community obsoleti: `Tamschi/pebble-sys`/`pebble-skip` (SDK 4.3, archiviati 18/10/2022, nightly 2020), `andars/pebble.rs` (SDK 3.0), crate `pebble-rust` | — | — | — |
| **Zig** | un solo repo trovato: `SX-7/pebble-watchface-zig` (15/8/2026, 0 star, 8 commit; usa `build.zig`) | ? | ? | ? |
| Altro ufficiale | nessun nuovo linguaggio annunciato oltre Alloy | | | |

Fonti: FAQ ufficiale ("Write in C when you need to support the full lineup of Pebble watches (Aplite through Gabbro), use the classic Pebble SDK UI primitives, or want the smallest possible memory footprint. Write in JavaScript with Alloy when you want modern JS (ES2025, modules, classes, async/await), the Piu or Poco UI frameworks, and built-in fetch, WebSockets. Alloy currently only targets Emery and Gabbro"); blog 20/2/2026 e 2/4/2026; `docs/rockyjs/`; issue PebbleOS #1621.

Numeri di memoria (SDK 4.33.1, output `pebble build` locale, app C minimale): **emery/gabbro: 128 KB max app (code+heap), heap libero 130.245 B; flint/basalt/chalk/diorite: 64 KB, heap libero 64.709 B; aplite: 24 KB, 23.749 B. Risorse max: 256 KB (128 KB su aplite)**. Tabella hardware ufficiale: "Max App Size (code + heap)" 24k / 64k / 128k, "Max Resource Size" 96k / 256k. Persist storage: `persist_get_max_size()` (4.17). **[CONFERMATO]**

Alloy e memoria (issue `coredevices/PebbleOS#1621`, aperta 28/6/2026): su firmware 4.17.0 tutte le app Alloy non banali crashavano con `fxAbort memory full` perché la macchina XS era un blocco statico di 32 KB (insufficiente per XS 8.2.3) mentre ~88–122 KB di heap restavano inutilizzati; Peter Hoddie (Moddable) ha trovato "a copy/paste bug in memory allocation", fix commit `76cd73282` ("moddable: fix ffi memory crash and memory allocation") in firmware **4.21.0/4.22.0**; allocazione XS ridotta da 49 KB a 29 KB; baseline default ~512 slot/~8 KB. Per app JS grandi si passano parametri espliciti in `ModdableCreationRecord` da `mdbl.c`. **[CONFERMATO]** Implicazione: Alloy è ora utilizzabile, ma ogni KB di RAM per la logica JS è sottratto ai ~130 KB dell'app, e la tabella `pebble build` non mostra il consumo runtime del motore.

Alloy, altri vincoli documentati: strict mode obbligatorio, primordiali congelati, **niente `eval()`**, moduli non elencati nel `manifest.json` → "module-not-found" a runtime; TypeScript: serve **TypeScript 6** e `skipLibCheck: true` (rossng/pebble-watchfaces, esperienza pratica 2026); debugger xsbug via `pebble build --debug`; UI Piu (dichiarativa) o Poco (procedurale, `render.begin(x,y,w,h)` per redraw parziali); eventi `minutechange`/`secondchange` sul global `watch`.

**Raccomandazione per i tuoi 4 obiettivi** (performance, resa grafica su Time 2, offline-first, poca memoria): **C nativo**, con queste linee guida:
- usare `TickTimerService` con `MINUTE_UNIT` quando possibile; `layer_mark_dirty()` mirato; `GBitmap`/PDC (Pebble Draw Commands) per grafica vettoriale 64 colori; `gbitmap_create_with_resource()` con immagini già quantizzate a 64 colori (`resources` tipo `bitmap`); font custom solo nei glifi usati (`characterRegex`);
- per il Time 2 sfruttare i define `PBL_DISPLAY_WIDTH/HEIGHT` (200×228), `PBL_TOUCH` (touch recognizers 4.33), `PBL_RGB_BACKLIGHT` (`light_set_color()`), `PBL_SPEAKER`, `PBL_HEALTH`, `PBL_COMPASS`, `preferred_content_size()`/ContentSize e Timeline Quick View (`unobstructed area`);
- offline: `persist_*` per dati e preferenze, `AppMessage`/PebbleKit JS solo come sorgente opportunistica con cache (guida ufficiale "Conserving Battery Life": mantenere `SNIFF_INTERVAL_NORMAL`, cache con Storage API, ridurre la frequenza di comunicazione); gestire `connection_service` per mostrare stato "offline" senza bloccare la UI;
- misurare con `heap_bytes_free()`/`heap_bytes_used()` e la tabella `pebble build`; `pebble gdb` sull'emulatore per crash.
- Usare Alloy solo se vuoi TypeScript e non ti servono i vecchi Pebble; in tal caso preferire Poco a Piu per watchface leggere e `minutechange`.

---

## 4. AI / LLM tooling e CloudPebble

**Ufficiali (Core Devices)** **[CONFERMATO]**:
- `github.com/coredevices/pebble-watchface-agent-skill` — "Agent Skills for making pebble watchfaces": skill per **Claude Code** (struttura `.claude/skills/pebble-watchface/` con `SKILL.md`, `reference/` API+animazioni+drawing, `samples/`, `scripts/`, `templates/`, `tutorials/c-watchface-tutorial/`); copre design → C + `package.json` + `wscript` + PebbleKit JS → build → test su QEMU → screenshot/GIF → publish. Requisiti: Claude Code, Pebble SDK, QEMU, Python 3 + Pillow. Target di default **emery (200×228)**, supporta gabbro/basalt/chalk/aplite/diorite/flint. Ultimo commit 4/8/2026: "Add watchapp + Alloy (JS) support to pebble-watchface skill". Uso: `git clone … && cd pebble-watchface-agent-skill && claude` e poi descrivere la watchface. Il blog del 2/4/2026 la chiama "Claude/Codex skill".
- `pebble new-project --ai` (5.0.39) genera `CLAUDE.md` (piattaforme, comandi `pebble build/clean/install/screenshot`, note headless `--vnc`) e `.cursor/rules/pebble.mdc`.
- Docs per LLM: `https://developer.repebble.com/llms.txt` (indice completo: tutorial C e Alloy, SDK/changelog 2.0→4.33.1, guide, API C/PebbleKit JS/Rocky, community); **ogni pagina esiste in Markdown aggiungendo `.md`** (es. `…/guides/alloy/ffi.md`, `…/sdk/changelogs/4.33.md`). Ideale per dare contesto a Claude senza scraping.
- CloudPebble modernizzato "by Eric Migicovsky with assistance from Claude Code" (README coredevices/cloudpebble).
- Rebble/Core non hanno annunciato un "build a Pebble app with AI" web tool a sé stante; il Watchface Generator (`developer.repebble.com/community/tools/watchface-generator/`) è un tool community non-AI. **[DA VERIFICARE se esistono annunci più recenti sul Discord Rebble]**

**Community (2026)**:
- `github.com/dbonomo/pebble-mcp` (aggiornato 2/8/2026): MCP server con tool `store_search/store_app/store_download_pbw…`, design toolkit 64 colori (`color_nearest`, `palette_swatch`, `image_quantize`, `image_prep`, `font_plan`, `pdc_convert`), loop di sviluppo (`pebble_build`, `pebble_install`, `emu_start/stop`, `emu_screenshot`, `emu_input`, `emu_logs`, `flow_validate/run`) e operazioni autenticate (`PEBBLE_API_TOKEN`). Config: `claude mcp add pebble-mcp -- uvx pebble-mcp` (non ancora su PyPI: installazione da checkout locale). **[CONFERMATO README; non testato]**
- Plugin JetBrains "Pebble Watchface/App Development" (id 30556, Changing LLC, 14/1/2026, MIT, CLion/WebStorm: build/run/debug, vista emulatore, SDK management, IP telefono) — non ufficiale, 357 download.
- `ericmigi/pebble-qemu-wasm` — PebbleOS in QEMU compilato in WebAssembly nel browser (`https://ericmigi.github.io/pebble-qemu-wasm/`), macchina emery testata; non documenta il caricamento di .pbw propri.
- Blog "Making pebble apps in 2026" (coconauts.net, 8/5/2026): workflow C + "Claude and the official Pebble-development skill", partendo dal tutorial ufficiale; target iniziale flint poi estensione alle altre piattaforme con Claude.

**CloudPebble (IDE web) 2026** **[CONFERMATO]**: tornato il 20/2/2026 su `https://cloudpebble.repebble.com` (open source `coredevices/cloudpebble`, self-host con Docker Compose). Progetti C e Alloy, compilazione e **emulatore in browser per aplite, basalt, chalk, diorite, emery, gabbro** (flint non elencato nel README), deploy sull'orologio "via the Pebble mobile app" (Dev Connect). Limiti dichiarati: sync GitHub/linting/completamento non ancora completi, DB originale perso (progetti 2016 non recuperabili). Il Dockerfile di CloudPebble (`python:3.11-slim-trixie` + `uv tool install pebble-tool --python 3.11` + `pebble sdk install $PEBBLE_SDK_VERSION`) è di fatto l'unica "immagine Docker" mantenuta da Core Devices.

---

## 5. Test su orologio reale da Linux

**[CONFERMATO da FAQ ufficiale + forum Rebble]**
- Nuova app mobile: "Pebble" (Google Play `coredevices.coreapp`; App Store "Pebble Core", id 6743771967), open source `coredevices/mobileapp` (Kotlin Multiplatform, libpebble3). Supporta tutti i Pebble (vecchi e nuovi) e l'anello Index 01.
- FAQ ufficiale: "Install the new Pebble mobile app from repebble.com/app. In the app: **Devices → ⋯ → Enable Dev Connect**, then **sign in with GitHub**. On your computer, run `pebble login`", poi `pebble build` e **`pebble install --cloudpebble`** (relay cloud: il CLI manda comandi via HTTP all'app che li inoltra via Bluetooth; funziona anche se PC e telefono non sono nella stessa LAN). "Legacy Wi-Fi route: `pebble install --phone IP_ADDRESS`" (`pebble logs --phone IP`, `pebble screenshot --phone IP`). La pagina Developer Connection descrive ancora la UI vecchia (Settings → Developer Mode → Developer Connection → "Server IP").
- Forum Rebble (dic. 2025, "Pebble-tool and the new Core Devices app"): con la nuova app bisogna abilitare **sia** la modalità LAN developer nelle impostazioni **sia** "Dev Connection" per-dispositivo nella pagina del device, altrimenti `connection refused`; con entrambe attive "screenshots (etc.) worked fine". **[CONFERMATO fonte; UI esatta può essere cambiata — medium]**
- Alternative senza CLI: aprire il `.pbw` dal file manager del telefono (si apre con l'app Pebble); su Android `pebble-dev/rebble-sideloader` (help.rebble.io/sideloading); pubblicazione privata/beta tramite `pebble publish` e appstore Core Devices.
- Log sul dispositivo: `pebble logs --phone IP` o `--cloudpebble`; `APP_LOG(APP_LOG_LEVEL_DEBUG, …)`. Per Alloy: `trace()` finisce nei log app se xsbug non è collegato (4.33).
- Il vecchio connettore Bluetooth diretto `--serial` resta per chi ha adattatori seriali; `--adb` esiste nel codice per relay via ADB. **[CONFERMATO nel codice base.py; non testato]**

---

## 6. VS Code, CI GitHub Actions, Nix, Docker

### 6.1 VS Code **[CONFERMATO]**
- Estensione ufficiale Marketplace `coredevices.pebble-vscode` (anche Open-VSX), v0.0.8 aggiornata 18/8/2026, 3.133 install: pulsante Run su telefono/emulatore con/senza log, nuovo progetto dalla sidebar, command palette; impostazioni `pebble.defaultPlatform`, `pebble.phoneIp`. Richiede `pebble` nel PATH. Il repo GitHub è archiviato (2/7/2026) ma l'estensione risulta ancora pubblicata e aggiornata. Non fornisce IntelliSense.
- IntelliSense C: `pebble compile-commands --platform emery` → `compile_commands.json` con include `…/SDKs/current/sdk-core/pebble/emery/include` e tutti i `-D`. Poi: (a) **clangd** (`llvm-vs-code-extensions.vscode-clangd`) con `.clangd` o argomento `--query-driver=$HOME/.local/share/pebble-sdk/SDKs/current/toolchain/arm-none-eabi/bin/arm-none-eabi-gcc` per risolvere gli header di sistema ARM; oppure (b) `ms-vscode.cpptools` con `"C_Cpp.default.compileCommands": "${workspaceFolder}/compile_commands.json"` e `"C_Cpp.default.compilerPath"` = il gcc sopra. Il devcontainer ufficiale installa `ms-vscode.cpptools-extension-pack` + `coredevices.pebble-vscode`. `pebble sdk include-path emery` stampa il path degli header. **[la configurazione clangd è una RACCOMANDAZIONE, non testata]**
- Devcontainer/Codespaces ufficiale `coredevices/codespaces-pebble`: base `mcr.microsoft.com/devcontainers/base:noble` + feature node/python/github-cli, `apt install libsdl2-dev`, `curl -LsSf https://astral.sh/uv/install.sh | sh && uv tool install pebble-tool --python 3.13 && pebble sdk install latest`, porta 6080 (noVNC per l'emulatore con `--vnc`).

### 6.2 GitHub Actions **[CONFERMATO l'esempio; il template è una RACCOMANDAZIONE]**
Esempio reale (rossng/pebble-watchfaces, `.github/workflows/smoke.yml`, 2026): `ubuntu-latest`, cache di `~/.local/share/pebble-sdk` (`actions/cache@v4`, chiave `pebble-sdk-${{ runner.os }}-v1`), `pebble sdk install latest` solo se `pebble sdk list` non mostra "(active)", build → `test -f build/*.pbw` → `actions/upload-artifact@v4`. Template minimale senza Nix (da adattare):

```yaml
name: build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - uses: astral-sh/setup-uv@v6
      - run: sudo apt-get update && sudo apt-get install -y libsdl2-2.0-0 libglib2.0-0t64 libpixman-1-0 zlib1g libsndio7.0
      - uses: actions/cache@v4
        with:
          path: ~/.local/share/pebble-sdk
          key: pebble-sdk-4.33.1-${{ runner.os }}
      - run: uv tool install "pebble-tool==5.0.39" --python 3.13
      - run: pebble sdk list | grep -q "(active)" || pebble sdk install latest
      - run: pebble build
      # opzionale: screenshot headless
      - run: pebble install --emulator emery --vnc && pebble screenshot --emulator emery --vnc --no-open shot.png && pebble kill
      - uses: actions/upload-artifact@v4
        with: { name: pbw, path: build/*.pbw }
```
Note: pinnare pebble-tool (le minor cambiano comportamento), gestire l'exit code ≠0 di "Already installed", usare `--vnc` per l'emulatore in CI.

### 6.3 Nix **[CONFERMATO]**
- `pebble-dev/pebble.nix` (Rebble): dev shell `pebbleEnv`, `buildPebbleApp`; ultimo commit 23/7/2026 "pebble-tool: 5.0.35 -> 5.0.39" → segue il nuovo tool. Non documenta esplicitamente emery/flint/gabbro.
- `rossng/pebble-watchfaces`: flake con Node 22, pnpm, Python, uv e le librerie native dell'emulatore; installa pebble-tool con uv in `./.pebble-tooling` al primo ingresso perché "pebble sdk install downloads emulator/toolchain binaries at runtime, which doesn't fit a pure Nix derivation"; `nix/pebble-tool.nix` sperimentale; usa `mkShellNoCC` per evitare che `STRINGS/AR/CC` inquinino il make di Moddable. Buon riferimento per Alloy+TypeScript 6.
- Nix non è installato sulla macchina e l'installer multi-user richiede root (single-user possibile senza sudo solo con `/nix` scrivibile: **[DA VERIFICARE]**).

### 6.4 Docker
- Non ci sono immagini community aggiornate per il nuovo tool: `pebble-dev/rebble-docker` (8 commit, SDK legacy), `abaez/docker-pebble`, `bboehmke/docker-pebble-dev`, `andredumas/docker-pebble-dev` sono del periodo 2016–2020 (Python 2, SDK 4.5). **[CONFERMATO]**
- Riferimenti aggiornati: Dockerfile di `coredevices/cloudpebble` (python:3.11 + uv + pebble-tool) e il devcontainer di `coredevices/codespaces-pebble`. `coredevices/PebbleOS-docker` è per compilare il firmware. Su questa macchina Docker non è disponibile comunque.

---

## 7. Dove vive la documentazione ufficiale nel 2026 **[CONFERMATO]**

- **`https://developer.repebble.com`** — sito ufficiale Core Devices (sorgente `coredevices/sdk-docs`, Jekyll, aggiornato 14/8/2026): `/sdk/` (installazione), `/sdk/changelogs/<ver>/`, `/docs/c/` (C API, es. `/docs/c/Foundation/Event_Service/TouchService/`), `/docs/pebblekit-js/`, `/docs/rockyjs/` (deprecato), `/guides/alloy/…`, `/guides/tools-and-resources/{pebble-tool,developer-connection,hardware-information}/`, `/faqs/`, `/tutorials/watchface-tutorial/` (C) e `/tutorials/alloy-watchface-tutorial/`, `/llms.txt`, suffisso `.md` su ogni pagina.
- **`https://developer.rebble.io`** — copia mantenuta da Rebble (repo `pebble-dev/developer.rebble.io`); utile ma con note non aggiornate (es. la nota Python 3.14/5.0.18).
- **Repo PebbleOS** (`coredevices/PebbleOS`): sorgente firmware + release; le API pubbliche esposte alle app sono quelle degli header `sdk-core/pebble/<plat>/include/pebble.h`. Le release notes dei firmware sono spesso vuote su GitHub; i cambiamenti utili agli sviluppatori sono nei changelog SDK.
- Blog: `https://repebble.com/blog/…` (post 20/2, 2/4, 14/7/2026), `https://ericmigi.com/blog/`, aggiornamenti Kickstarter.
- Tabella hardware ufficiale (`hardware-information`): **Emery / Pebble Time 2**: SoC SiFli SF32LB52J (Star-MC1 "Cortex-M33-like" 240 MHz, 512 KB SRAM + 64 KB LP, 16 MB PSRAM non abilitata in PebbleOS — CNX 14/5/2025), display JDI LPM015M135A 1.5" **200×228, 64 colori, 202 PPI, rettangolare, touch**, backlight RGB multicolore, HRM sì, 2 microfoni (ENC), speaker sì, 6-axis IMU + bussola, LRA, ~30 giorni, max app 128k, risorse 256k. **Flint / Pebble 2 Duo**: nRF52840 Cortex-M4 64 MHz, Sharp LS013B7DH05 1.26" 144×168 B/N 175 PPI, no touch, backlight bianca, no HRM, mic sì, speaker sì, 6-axis IMU + bussola, ~30 giorni, max app 64k. **Gabbro / Pebble Round 2**: SF32LB52J, Sharp LS013B7DD02 1.3" 260×260 64 colori 200 PPI rotondo touch, no speaker/HRM, ~14 giorni, max app 128k (spedizioni da settembre 2026).

---

## 8. Azioni consigliate

1. **Setup (10 minuti, senza sudo)**: installare uv → `uv python install 3.13` → `uv tool install pebble-tool --python 3.13` → `pebble sdk install latest` (4.33.1). Pinnare la versione in uno script (`pebble-tool==5.0.39`) per riproducibilità.
2. **Emulatore**: estrarre `libsdl2-classic` e `libxss1` (e `libsndio7.0` per sicurezza) con `apt-get download` + `dpkg-deb -x` in `~/.local/lib/pebble-deps` e aggiungere `LD_LIBRARY_PATH` a `~/.bashrc`; verificare con `ldd …/toolchain/bin/qemu-pebble | grep "not found"`. Poi `pebble install --emulator emery` / `flint` / `gabbro`. In sessioni senza X usare `--vnc`.
3. **Linguaggio**: C nativo per watchface/app "core"; `--javascript` (PebbleKit JS) solo per configurazione Clay e fetch opportunistici con cache in `persist_*`. Valutare Alloy solo per prototipi rapidi su emery/gabbro, tenendo conto dei ~29 KB di motore XS e delle API mancanti. Ignorare Rocky.js/Pebble.js/Rust/Zig.
4. **Targeting**: `targetPlatforms: ["emery","flint"]` (+ `basalt`,`diorite` se vuoi i vecchi Pebble); usare `#if defined(PBL_PLATFORM_EMERY)`, `PBL_COLOR`/`PBL_BW`, `PBL_DISPLAY_WIDTH/HEIGHT`, `PBL_TOUCH`, `PBL_RGB_BACKLIGHT` per layout e feature specifiche; testare con `pebble screenshot --all-platforms`.
5. **Memoria/performance**: leggere la tabella "APP MEMORY USAGE" a ogni build (budget 128 KB emery, 64 KB flint); evitare allocazioni nei tick; PDC/bitmap pre-quantizzate a 64 colori; `MINUTE_UNIT`; `pebble gdb` per i crash; `pebble build --debug` solo in sviluppo.
6. **Offline-first**: tutto lo stato in `persist_*` (limite via `persist_get_max_size()`), UI che non dipende da AppMessage; `connection_service_subscribe()` per indicare lo stato BT senza bloccare; sincronizzazioni rare e batch (SNIFF normal).
7. **IDE**: `pebble new-project --ai` + `pebble compile-commands --platform emery` + clangd (`--query-driver` verso l'`arm-none-eabi-gcc` dell'SDK) + estensione `coredevices.pebble-vscode` per i pulsanti Run/Logs.
8. **AI**: clonare `coredevices/pebble-watchface-agent-skill` e usarla con Claude Code; dare a Claude `https://developer.repebble.com/llms.txt` e le pagine `.md` (changelog 4.33, `docs/c/...`); valutare `dbonomo/pebble-mcp` per screenshot/emulatore automatizzati (installazione da sorgente).
9. **Test reale**: nuova app Pebble → Devices → ⋯ → Enable Dev Connect + login GitHub → `pebble login` → `pebble install --cloudpebble --logs`; in LAN `pebble install --phone <IP> --logs`. Abilitare entrambe le opzioni (LAN dev mode e Dev Connection per-device) se compare `connection refused`.
10. **CI**: workflow GitHub Actions come in §6.2 con cache di `~/.local/share/pebble-sdk`, pin di pebble-tool e `--vnc`; artefatto `.pbw`; opzionale `pebble publish --non-interactive` con token Firebase per release automatiche.
11. **Aggiornamenti**: seguire `pebble sdk list`, le release di `coredevices/pebble-tool` e i changelog SDK (cadenza ~mensile: 4.17 giugno, 4.33 agosto 2026); le nuove API sono gated da firmware ≥4.32 → chiedere agli utenti di aggiornare l'orologio.

---

## 9. Domande aperte / non confermate

- Contenuti dei digest del Discord Rebble e dei thread r/pebble 2026 (non accessibili/indicizzati): eventuali issue Ubuntu 26.04 specifiche non emerse.
- Se `libsdl2-compat-shim` (SDL3) funzioni con `qemu-pebble` al posto di `libsdl2-classic` (non testato).
- Esatta UI della developer connection nella versione corrente (agosto 2026) dell'app mobile Core Devices (la doc mostra la UI legacy; FAQ e forum descrivono "Dev Connect" per-device + LAN mode).
- Quanto l'emulatore emery (modello QEMU derivato dai vecchi board Pebble) sia rappresentativo delle prestazioni del SiFli SF32LB52J reale (timing, touch, speaker).
- Se la PSRAM da 16 MB verrà esposta alle app in futuro (oggi max app 128 KB).
- Perché `coredevices/pebble-vscode` sia archiviato (2/7/2026) pur restando pubblicato sul Marketplace (v0.0.8 del 18/8/2026): possibile spostamento in altro repo.
- `pebble analyze-size` ha restituito tutti zeri sull'app di prova: da capire se richiede simboli/opzioni particolari.
- Stato/maturità di `SX-7/pebble-watchface-zig` e di eventuali binding Rust per SDK 4.33 (nessuno trovato).

---

## 10. Fonti (URL, data)

- https://developer.repebble.com/sdk/ — pagina installazione ufficiale (consultata 2026-08-24)
- https://github.com/coredevices/pebble-tool — README, `pyproject.toml` (5.0.39, `>=3.10`), sorgenti `sdk/manager.py`, `util/__init__.py`, `commands/*`; releases 5.0.30 (2026-03-31) … 5.0.39 (2026-06-30)
- https://pypi.org/project/pebble-tool/ — 5.0.39 (2026-06-30), storico release 2026
- https://developer.rebble.io/sdk/ — copia Rebble (nota Python 3.14 obsoleta, "as of 5.0.18")
- https://github.com/ArtRichards/pebble-time2-dev-setup — setup Linux Mint 22, pebble-tool 5.0.39 + SDK 4.17, patch IPv4 (2026-07-12)
- https://repebble.com/blog/cloudpebble-returns-plus-pure-javascript-and-round-2-sdk (2026-02-20)
- https://repebble.com/blog/spring-2026-pebble-app-contest (2026-04-02)
- https://repebble.com/blog/pebble-mega-update-july-2026 (2026-07-14)
- https://developer.repebble.com/sdk/changelogs/4.9.169/ (2026-05-01), /4.17/ (2026-06-23), /4.33/ (2026-08-12), /4.33.1/ (2026-08-14)
- https://developer.repebble.com/faqs/ — Dev Connect, `--cloudpebble`, piattaforme emulatore, C vs Alloy, skill Claude, heap per piattaforma
- https://developer.repebble.com/guides/alloy/ , /guides/alloy/getting-started/ , /guides/alloy/ffi/ , /guides/alloy/watchfaces/
- https://developer.repebble.com/docs/rockyjs/ — "RockyJS is deprecated"
- https://developer.repebble.com/guides/tools-and-resources/hardware-information/ — tabella hardware (aplite→gabbro)
- https://developer.repebble.com/guides/tools-and-resources/developer-connection/ — developer connection (UI legacy)
- https://developer.repebble.com/guides/tools-and-resources/pebble-tool/ — riferimento CLI (parzialmente datato)
- https://developer.repebble.com/guides/best-practices/conserving-battery-life/
- https://developer.repebble.com/llms.txt
- https://github.com/coredevices/pebbleos/issues/1621 — memoria Alloy (2026-06-28 → fix 76cd73282 in 4.21/4.22)
- https://github.com/coredevices/PebbleOS/releases — v4.33.0 (2026-08-06), v4.34.0 (2026-08-17), v4.35.0 (2026-08-19)
- https://github.com/coredevices/PebbleOS-SDK — v0.1.8 (2026-08-18), QEMU v10.1.5-pebble16
- https://github.com/coredevices/sdk-packager — `download-toolchain.sh` (xpack 14.2.1-1.1, Moddable 8.3.1)
- https://github.com/coredevices/qemu — branch pebble-10.1
- https://github.com/coredevices/pebble-watchface-agent-skill — commit 2026-08-04
- https://github.com/coredevices/codespaces-pebble — `.devcontainer/devcontainer.json`
- https://github.com/coredevices/cloudpebble — README + `cloudpebble/Dockerfile`; https://cloudpebble.repebble.com
- https://github.com/coredevices/pebble-vscode (archiviato 2026-07-02); https://marketplace.visualstudio.com/items?itemName=coredevices.pebble-vscode (v0.0.8, 2026-08-18)
- https://github.com/coredevices/mobileapp ; https://play.google.com/store/apps/details?id=coredevices.coreapp ; https://apps.apple.com/us/app/pebble-core/id6743771967
- https://github.com/coredevices/example-apps ; https://github.com/coredevices/sdk-docs
- https://forum.rebble.io/t/pebble-tool-and-the-new-core-devices-app/256 (dic. 2025)
- https://github.com/pebble-dev/pebble.nix (commit 2026-07-23) ; https://github.com/rossng/pebble-watchfaces (flake + smoke.yml)
- https://github.com/pebble-dev/rebble-docker ; https://github.com/andyburris/pebble-setup (guide legacy Python 2.7/SDK 4.5)
- https://github.com/dbonomo/pebble-mcp (2026-08-02) ; https://plugins.jetbrains.com/plugin/30556-pebble-watchface-app-development (2026-01-14)
- https://github.com/ericmigi/pebble-qemu-wasm ; https://github.com/therealjasonlin/pebble-studio (GUI Windows)
- https://coconauts.net/blog/2026/05/08/pebble-apps/ (2026-05-08)
- https://github.com/Tamschi/pebble-sys (archiviato 2022-10-18) ; https://github.com/andars/pebble.rs ; https://crates.io/crates/pebble-rust ; https://github.com/SX-7/pebble-watchface-zig (2026-08-15)
- https://techcrunch.com/2026/08/21/the-225-pebble-time-2-is-a-refreshingly-fun-smartwatch/ (2026-08-21)
- https://www.cnx-software.com/2025/05/14/sifli-sf32lb52j-big-little-arm-cortex-m33-bluetooth-mcu-powers-the-core-time-2-smartwatch/ (2025-05-14)
- https://ericmigi.com/blog/introducing-two-new-pebbleos-watches/ (2025-03-18) ; https://docs.zephyrproject.org/latest/boards/coredevices/pt2/doc/index.html
- https://gadgetsandwearables.com/2026/02/23/pebble-time-2-shipping/ ; https://repebble.com/blog/pebble-time-2-is-in-mass-production
- Verifica locale 2026-08-24 (sandbox in scratchpad): uv 0.12.5, pebble-tool 5.0.39 su Python 3.14.4 (sistema), 3.13.15 e 3.14.7 (uv); SDK 4.33.1; `qemu-pebble` 10.1.5-pebble14; build C/Alloy; emulatore emery + screenshot 200×228.

# Gap 2 — Firmware minimo dell'orologio e degradazione delle API 2026 su firmware vecchi

Ricerca eseguita il **2026-08-24** su fonti primarie: sorgenti `coredevices/PebbleOS` (clone del repo, tag e cronologia git), tarball ufficiali dell'SDK scaricati da `sdk.repebble.com`, sorgenti `coredevices/pebble-tool` e `coredevices/mobileapp`, documentazione `developer.repebble.com`, API dell'appstore `appstore-api.repebble.com`.
Tutto quanto segue riguarda i **nuovi** Pebble di Core Devices (Pebble Time 2 = piattaforma `emery`, Pebble 2 Duo = `flint`, Pebble Round 2 = `gabbro`) e PebbleOS 4.9.x–4.36 (2026); non ha nulla a che fare con il Pebble Time 2 cancellato del 2016.

---

## 0. Risposte in sintesi (TL;DR)

| Domanda | Risposta (CONFERMATA salvo dove indicato) |
|---|---|
| Firmware minimo per un `.pbw` compilato con **SDK 4.33.1** (emery/flint/gabbro) | **PebbleOS v4.32.0** (release GitHub 2026-07-29). Il binario viene marchiato `sdk_version = 5.106` (`0x5.0x6a`); i firmware 4.10–4.31 espongono solo `0x64`–`0x66` e quindi **rifiutano l'app**. |
| Come si dichiara il firmware minimo | **Non si dichiara**: non esiste alcun campo in `package.json`/`appinfo.json` (`sdkVersion` accetta solo `"2"`/`"3"` = major), né un filtro per firmware nell'appstore Core (l'API espone solo `compatibility.<platform>.firmware.major = 3`) né nell'app telefono (filtra solo per piattaforma hardware). Il valore è **stampato automaticamente dal build** prendendo `PROCESS_INFO_CURRENT_SDK_VERSION_MINOR` dall'header `pebble_process_info.h` incluso nell'SDK, *indipendentemente dalle API effettivamente usate*. |
| Cosa succede a runtime su PT2 con fw 4.10–4.31 se l'app chiama API più recenti | **Nessuna delle tre ipotesi** (crash della jump table / ritorno nullo / no-op): l'app **non viene proprio avviata**. Il firmware confronta `sdk_version` dell'app con la propria e mostra il dialog **"Incompatible SDK" — "This app requires a newer version of the Pebble firmware."** Il crash da jump table è esattamente ciò che questo gate previene (documentato in `docs/development/sdk_export.md`). |
| La quota persist da 1 MiB dipende dal firmware? | Sì, ma è presente da **PebbleOS v4.9.171** (commit `48f15c09`, 2026-02-23, "raise per-app storage limit to 1 MiB"), quindi su **tutti** i firmware 4.10–4.36. `persist_get_max_size()` esiste da **v4.9.172** (esposta dall'SDK 4.17 in poi). |
| `PBL_API_EXISTS()` è compile-time? | Sì: `#define PBL_API_EXISTS(x) defined(_PBL_API_EXISTS_##x)` (generato in `pebble_sdk_version.h`). Non esiste e **non serve** un check a runtime dell'esistenza di una API: se l'app parte, il gate garantisce che ogni simbolo dell'SDK usato esista nel firmware (ABI = ordine per `addedRevision`). |
| Pattern corretto per quota e disponibilità | Scegliere l'SDK = firmware minimo che si vuole supportare; usare `#if PBL_API_EXISTS(persist_get_max_size)` → `persist_get_max_size()` altrimenti `4096`; gestire sempre `E_OUT_OF_STORAGE` a runtime; per differenze di *comportamento* (non di ABI) fra firmware compatibili usare `watch_info_get_firmware_version()`. |

---

## 1. Il meccanismo: ABI a jump table + gate sulla `sdk_version`

### 1.1 Come l'app chiama il firmware
- Le app non linkano il firmware: `libpebble.a` contiene un trampolino per ogni funzione esportata (`tools/generate_native_sdk/generate_app_shim.py`): `ldr r1, =<indice*4>` → `b jump_to_pbl_function` → legge `pbl_table_addr` (patchata dal loader con l'indirizzo di `g_pbl_system_tbl` in `pebble.auto.c`) → `bx r12`.
- L'ordine della tabella è l'ABI: le funzioni sono ordinate per `addedRevision` (poi alfabeticamente). `tools/generate_native_sdk/exported_symbols.json` è a **revision 109** su `main`.
- Avvertenza ufficiale (`docs/development/sdk_export.md`, repo PebbleOS): *"It is not possible to add publicly exposed functions to an already released firmware/SDK combination … an app built against a newer SDK calls a trampoline that indexes past the end of an older firmware's table and crashes. New exports always ship as a new firmware plus a new SDK build."*

### 1.2 Il gate
`src/fw/process_management/app_install_manager.c`:
```c
bool app_install_entry_is_SDK_compatible(const AppInstallEntry *entry) {
  return (entry->sdk_version.major == PROCESS_INFO_CURRENT_SDK_VERSION_MAJOR &&
          entry->sdk_version.minor <= PROCESS_INFO_CURRENT_SDK_VERSION_MINOR);
}
```
`src/fw/process_management/process_manager.c` (`process_manager_check_SDK_compatible`, chiamata da `process_manager_launch_process` prima di caricare qualsiasi app di terze parti):
```c
PBL_LOG_WRN("App requires support for SDK version (%u.%u), we only support version (%u.%u).", ...);
ExpandableDialog *expandable_dialog = expandable_dialog_create("Incompatible SDK");
const char *error_text = i18n_noop("This app requires a newer version of the Pebble firmware.");
```
e la launch termina con `return;` (nessun caricamento). Un secondo controllo equivalente è in `src/fw/services/process_management/app_storage.c` (`GET_APP_INFO_INCOMPATIBLE_SDK`).

Conseguenza: **il caso "API mancante chiamata a runtime" non può verificarsi** su firmware rilasciati; la degradazione è "tutto o niente" a livello di app.

### 1.3 Chi stampa `sdk_version` nel `.pbw`
- `tools/waf/pebble_sdk_version.py` (`set_env_sdk_version`) legge `PROCESS_INFO_CURRENT_SDK_VERSION_MAJOR/MINOR` da `sdk-core/pebble/<platform>/include/pebble_process_info.h` dell'SDK installato.
- `sdk/waftools/process_bundle.py` scrive `manifest.json` → `"sdk_version": {"major": …, "minor": …}` per ogni piattaforma; `sdk/tools/inject_metadata.py` scrive gli stessi 2 byte nell'header `PBLAPP` del binario (`SDK_VERSION_ADDR = 0xA`).
- Nessuna analisi dei simboli usati: **il minor è sempre il massimo dell'SDK**, anche per un watchface che usa solo `text_layer_*`.
- L'app telefono (`coredevices/mobileapp`, `LockerEntry.asMetadata`) legge `sdkVersionMajor/Minor` dal `.pbw` e li invia all'orologio nel record BlobDB `AppMetadata`; l'orologio li conserva in `app_db` e li usa nel gate al lancio.

---

## 2. Ledger minor SDK → API → primo firmware che la contiene

Ricavato da `git log -p src/fw/process_management/pebble_process_info.h` + `git tag --contains` sul repo `coredevices/PebbleOS` (major sempre `0x5`). Date = data della release su GitHub quando disponibile.

| minor | dec | Contenuto (commit) | Primo tag firmware | Data release GitHub |
|---|---|---|---|---|
| 0x56 | 86 | Base ereditata da Pebble Technology (import 2024-12-12); è anche il valore "congelato" di basalt/chalk/diorite (aplite: 0x4e = 78) | v4.9.9-core0 … | — |
| 0x57 | 87 | Moddable stubs (Alloy) | v4.9.127 | feb 2026 |
| 0x5a | 90 | `rot_bitmap_layer_get_layer()`, `AppGlanceSliceLayout` | v4.9.156 | apr 2026 |
| 0x5b | 91 | `app_light_set_color()` / `app_light_set_system_color()` | v4.9.161 | apr 2026 |
| 0x5c | 92 | **Touch service** (`touch_service_subscribe/unsubscribe/is_enabled`), `light_is_on` | v4.9.164 | apr 2026 |
| 0x5d | 93 | `light_set_color_rgb888()` | v4.9.164 | apr 2026 |
| 0x5e | 94 | **Speaker API** (`speaker_play_notes/tracks/tone`, `speaker_stream_*`, `speaker_stop`, `speaker_set_volume`, `speaker_get_status`, `speaker_set_finish_callback`); semver nel package | v4.9.164 / v4.9.167 | apr 2026 |
| 0x5f | 95 | `speaker_play_tone()` frequenza esatta | v4.9.169 | 2026-05-01 (SDK 4.9.169) |
| 0x60 | 96 | **`persist_get_max_size()`** (commit `1ec96db3`, 2026-04-30) | **v4.9.172** | 2026-05-05 (tag) |
| 0x61 | 97 | `speaker_is_muted()` | v4.9.173 | mag 2026 |
| 0x62 | 98 | **`backlight_service_subscribe()` / `backlight_service_unsubscribe()`** | **v4.9.175** | 2026-05-07 (tag) |
| 0x63 | 99 | `app_launch_button()`, `app_launch_get_quick_launch_action()` | v4.10.0 | 2026-06-02 |
| 0x64 | 100 | Moddable debug flag | v4.10.0 | 2026-06-02 |
| 0x65 | 101 | `SPEAKER_MAX_NOTES/TRACKS/SAMPLE_BYTES_TOTAL` | **v4.17.0** | 2026-06-19 |
| 0x66 | 102 | **`alarm_service_peek_next()`** | **v4.18.0** | 2026-06-23 |
| 0x67 | 103 | Moddable 8.3.1 | v4.32.0 | 2026-07-29 |
| 0x68 | 104 | **Gesture recognizers** (`tap/pan/swipe_recognizer_create`, `window_attach_recognizer`, `recognizer_set_simultaneous_with`, `recognizer_set_fail_after`, …) | v4.32.0 | 2026-07-29 |
| 0x69 | 105 | **`app_touch_navigation_enable()`** / `window_set_touch_bridge_disabled()` (touch-nav twin gate) | v4.32.0 | 2026-07-29 |
| 0x6a | 106 | **HRV**: `HealthEventHRVUpdate`, `health_service_peek_hrv_ppi_ms()`, `health_service_set_hrv_sample_period()` (rev 109) | **v4.32.0** | 2026-07-29 |

Minor per firmware nell'intervallo chiesto: **4.10.0–4.16 → 0x64; 4.17.0 → 0x65; 4.18.0–4.31.2 (e 4.27.1) → 0x66; 4.32.0–4.36.0 → 0x6a**. Verificato direttamente: `git show v4.27.1:…/pebble_process_info.h` → `0x66`.

Sequenza release GitHub (`coredevices/PebbleOS/releases`, `published_at`): v4.9.184 (05-29), v4.10.0 (06-02), v4.11.0 (06-03), v4.12.0 (06-05), v4.13.0 (06-15), v4.14.0/v4.15.0 (06-16), v4.16.0 (06-18), **v4.17.0 (06-19)**, v4.18.0 (06-23), v4.19.0 (06-24), v4.20.0 (06-30), v4.21.0/4.22.0 (07-03), v4.23.0 (07-07), v4.24.0 (07-10), v4.25.0 (07-13), v4.26.0 (07-14), v4.27.0 (07-15), v4.28.0 (07-16), v4.29.0 (07-17), v4.30.0 (07-20), v4.31.0 (07-21), v4.31.1 (07-23), **v4.32.0 (07-29)**, v4.31.2 (08-03), v4.33.0 (08-06), v4.33.1 (08-10), **v4.27.1 (08-13, hotfix OTP/QSPI SF32LB52)**, **v4.33.2 (08-14)**, v4.34.0 (08-17), v4.35.0 (08-19), v4.36.0 (08-24). Cadenza: circa una release ogni 2–5 giorni.

---

## 3. Gli SDK effettivamente scaricabili e il minor che stampano (verificato sui tarball)

`pebble sdk list` interroga `https://sdk.repebble.com/v1/files/sdk-core?channel=`; il 2026-08-24 elenca **7 SDK: 4.4, 4.5, 4.9.127, 4.9.148, 4.9.169, 4.17, 4.33.1** (nessun 4.32, nessun 4.33.0; `EMERY_SDK_VERSION` nel repo sdk-docs = `v4.33.0`).
Ho scaricato `https://sdk.repebble.com/releases/<ver>/sdk-core.tar.gz` (48 MB per 4.33.1) e letto `sdk-core/pebble/<platform>/include/pebble_process_info.h` e `pebble_sdk_version.h` (emery):

| SDK | minor stampato emery/flint/gabbro | Firmware minimo risultante | `touch_service_*` | `speaker_*` | `persist_get_max_size` | `backlight_service_subscribe` | `alarm_service_peek_next` | recognizers + `app_touch_navigation_enable` | `health_service_peek_hrv_ppi_ms` |
|---|---|---|---|---|---|---|---|---|---|
| 4.9.169 (2026-05-01) | 0x5f (5.95) | ≥ v4.9.169 | sì | sì (no `speaker_is_muted`) | **no** | no | no | no | no |
| 4.17 (2026-06-23) | 0x65 (5.101) | **≥ v4.17.0** | sì | sì | **sì** | **sì** | no | no | no |
| 4.33.1 (2026-08-14) | 0x6a (5.106) | **≥ v4.32.0** | sì | sì | sì | sì | sì | sì | sì |

Per le piattaforme legacy ogni SDK stampa sempre basalt/chalk/diorite = 0x56 (5.86) e aplite = 0x4e (5.78) (`FROZEN_AT_REVISION`), confermato dal maintainer nel thread del forum (mag 2026). Tutti i `requirements` = `pebble-tool>=5.0.38` (4.17/4.33.1) o `>=5.0.32` (4.9.169).

Defines per piattaforma nell'SDK 4.33.1 (`sdk-core/pebble/common/tools/pebble_sdk_platform.py`):
- **emery**: `PBL_PLATFORM_EMERY, PBL_COLOR, PBL_RECT, PBL_MICROPHONE, PBL_SMARTSTRAP, PBL_HEALTH, PBL_SMARTSTRAP_POWER, PBL_COMPASS, PBL_TOUCH, PBL_RGB_BACKLIGHT, PBL_SPEAKER, PBL_DISPLAY_WIDTH=200, PBL_DISPLAY_HEIGHT=228`; `MAX_APP_BINARY_SIZE = MAX_APP_MEMORY_SIZE = 0x20000` (128 KiB), worker 10 KiB, risorse 256 KiB (appstore) / 1 MiB.
- **flint**: `PBL_PLATFORM_FLINT, PBL_BW, PBL_RECT, PBL_MICROPHONE, PBL_HEALTH, PBL_COMPASS, PBL_SPEAKER, 144x168`; **niente `PBL_TOUCH` né `PBL_RGB_BACKLIGHT`**; binario/memoria 64 KiB.

---

## 4. Cosa succede davvero a runtime, caso per caso

### 4.1 App SDK 4.33.1 su PT2 con firmware 4.10–4.31
1. L'app si installa normalmente (telefono e appstore non controllano il minor) e compare nel launcher.
2. Al lancio: `process_manager_check_SDK_compatible()` fallisce → log `App requires support for SDK version (5.106), we only support version (5.102)` → dialog modale **"Incompatible SDK / This app requires a newer version of the Pebble firmware."** → l'app non viene caricata. Nessuna API viene mai eseguita, quindi non esiste "degradazione": né crash, né NULL, né no-op.
3. Se è un **watchface** impostato come predefinito, il lancio fallisce allo stesso modo; il codice di fallback automatico al watchface di sistema in `app_manager.c` è previsto per i *crash* (non per il rifiuto SDK) → comportamento esatto in questo caso **non verificato** (vedi domande aperte).

### 4.2 App SDK 4.33.1 su firmware 4.32.0 / 4.33.0 / 4.33.1
- Parte regolarmente (minor 0x6a). MA il changelog SDK 4.33.1 (2026-08-14) dice: *"Fixed a crash when adding the new touch recognizers (`app_touch_navigation_enable()`) … The emulator now runs firmware 4.33.2, which includes the recognizer crash fix."* Il fix è il commit `09131922` "applib/recognizer: read nav gates and ticks through syscalls" (unico commit tra v4.33.1 e v4.33.2). Quindi **i recognizer richiedono di fatto firmware ≥ 4.33.2**, anche se l'ABI li accetta da 4.32.0. Questo è un caso reale di "API presente ma che crasha" e va gestito con `watch_info_get_firmware_version()` (vedi §6).
- Changelog SDK 4.33 (2026-08-12): le app **Alloy** (JS) "use XS 17.8 byte code and require firmware 4.32 or later"; "Touch navigation is now enabled by default on watches with a touchscreen"; guida Touch: nav di default "since firmware 4.32", gating per sessione "in firmware 4.33".

### 4.3 App SDK 4.17 su firmware 4.17–4.36
- Parte ovunque (0x65 ≤ 0x65…0x6a): il firmware è retro-compatibile con le app vecchie per costruzione (tabella append-only).
- Ha `persist_get_max_size()`, speaker, backlight service, touch service grezzo (`touch_service_subscribe`, eventi `TouchEvent_Touchdown/PositionUpdate/Liftoff`), quick-launch args. Non ha alarm/HRV/recognizers/`app_touch_navigation_enable`.

### 4.4 Differenze di comportamento (non di ABI) fra firmware compatibili
Queste sì vanno rilevate a runtime, e le API lo prevedono:
- `touch_service_is_enabled()` → `false` su flint e quando l'utente disattiva il touch (Settings → Display → Touch); i watchface non ricevono touch.
- `speaker_is_muted()`; `speaker_stream_write()` può scrivere meno byte.
- `persist_get_max_size()` → valore *del firmware corrente* (syscall che ritorna `PERSIST_STORAGE_MAX_SPACE`).
- `watch_info_get_firmware_version()` → `WatchInfoVersion {uint8_t major, minor, patch}` (es. 4.33.2) — esiste da SDK 3.x, presente in tutti gli SDK considerati.

---

## 5. Persist: quota, funzione e pattern offline-first

### 5.1 Fatti dal sorgente (`src/fw/services/persist/service.c`, `src/fw/services/settings/settings_file.c`, `src/fw/applib/persist.[ch]`)
- Import originale Pebble (2024-12-12): `#define PERSIST_STORAGE_MAX_SPACE KiBYTES(6)` (la doc pubblica dice "4 kB").
- Commit `48f15c09` (2026-02-23) "fw/services/persist: raise per-app storage limit to 1 MiB" → **primo tag v4.9.171** (2026-04-30). Oggi: `#define PERSIST_STORAGE_MAX_SPACE MiBYTES(1)` e `PERSIST_STORAGE_INITIAL_ALLOC KiBYTES(4)`; il file viene aperto con `settings_file_open_growable(&file, name, 1 MiB, 4 KiB)`: parte da 4 KiB e **raddoppia** (`prv_grow`) fino a 1 MiB; ogni crescita fa `settings_file_rewrite_filtered` (riscrittura completa → pausa percepibile, come avverte la guida).
- La costante è **incondizionata** (stessa per emery, flint, gabbro).
- `PERSIST_DATA_MAX_LENGTH` resta **256 byte per chiave**; `persist_write_data()` tronca silenziosamente a 256 (`MIN(buffer_size, PERSIST_DATA_MAX_LENGTH)`) e ritorna i byte scritti; superata la quota totale ritorna **`E_OUT_OF_STORAGE`** (`prv_settings_file_set_internal` / `prv_grow`); chiave/valore fuori range → `E_RANGE`.
- `size_t persist_get_max_size(void)` (doc ufficiale: *"Gets the maximum total size in bytes of all persisted values for the current app on this firmware. Apps targeting older SDKs that don't have this function should assume a 4 KB limit."*) — syscall aggiunta nel commit `1ec96db3` (2026-04-30), primo tag **v4.9.172**, esposta da **SDK 4.17** (assente in 4.9.169).
- Quindi: su **ogni firmware 4.10–4.36 la quota è 1 MiB** e `persist_get_max_size()` esiste; l'unica finestra "1 MiB senza funzione" è v4.9.171 (un solo tag).

### 5.2 Pattern corretto
Poiché il gate garantisce l'ABI, il rilevamento "di esistenza" è **solo compile-time**; il valore è runtime:
```c
#include <pebble.h>

static size_t prv_persist_quota_bytes(void) {
#if PBL_API_EXISTS(persist_get_max_size)
  return persist_get_max_size();          // 1 MiB su PebbleOS >= 4.9.171 (syscall: valore del firmware corrente)
#else
  return 4096;                             // SDK < 4.17: assumere il limite legacy
#endif
}

// Scrittura difensiva di un blob > 256 B: spezzare in record da PERSIST_DATA_MAX_LENGTH
static bool prv_cache_write(uint32_t base_key, const uint8_t *data, size_t len) {
  size_t budget = prv_persist_quota_bytes();
  // margine per header record (sizeof(SettingsRecordHeader) + 4 B chiave) e per il raddoppio del file
  if (len + (len / PERSIST_DATA_MAX_LENGTH + 1) * 16 > budget * 3 / 4) return false;
  for (size_t off = 0, i = 0; off < len; off += PERSIST_DATA_MAX_LENGTH, i++) {
    size_t n = MIN(len - off, (size_t)PERSIST_DATA_MAX_LENGTH);
    int rc = persist_write_data(base_key + i, data + off, n);
    if (rc == E_OUT_OF_STORAGE || rc < 0) return false;   // fallback runtime: quota esaurita
  }
  persist_write_int(base_key - 1, (int32_t)len);            // lunghezza totale in una chiave "indice"
  return true;
}

// Gate runtime per comportamenti (non ABI) legati al firmware
static bool prv_fw_at_least(uint8_t maj, uint8_t min, uint8_t pat) {
  WatchInfoVersion v = watch_info_get_firmware_version();
  return (v.major > maj) || (v.major == maj && (v.minor > min || (v.minor == min && v.patch >= pat)));
}
// es.: attaccare i recognizer solo se prv_fw_at_least(4, 33, 2)
```
Consigli pratici derivati dai sorgenti: scrivere la cache all'avvio/uscita (le crescite del file riscrivono tutto); tenere un record-indice con versione dello schema; dimensionare la cache su una frazione della quota (≤ 512–768 KiB) per lasciare spazio a `dead_space` prima del compattamento; ricordare che 1 MiB / 256 B ≈ 4.000 chiavi massime.

---

## 6. Dove (non) si dichiara la compatibilità: package.json, appstore, telefono

- **`package.json`** (`sdk/tools/schemas/attributes.json`): `"sdkVersion": { "enum": ["2","3"] }`; campi `pebble.targetPlatforms`, `watchapp`, `capabilities`, `resources`, `messageKeys`… **Nessun campo "minimumFirmware"** (confermato anche dalla guida App Metadata).
- **`manifest.json` nel `.pbw`**: `sdk_version: {major, minor}` per piattaforma, calcolato dall'SDK (vedi §1.3).
- **Appstore Core** (`appstore-api.repebble.com`, `GET /api/v1/apps/id/{id}?hardware=emery`): `compatibility.<platform>.{supported, firmware:{major:3}}` (major 3 per tutte le piattaforme in un record reale) e `hardware_platforms[].sdk_version` (es. emery `"5.95"`, flint `"5.95"`, basalt `"5.86"`, aplite `"5.78"`) — lo store *registra* il minor ma **non filtra** per firmware; il parametro di query è solo `hardware`. Il dev-portal chiede solo il `.pbw` + release notes; la vecchia issue Rebble "Add firmware checks" (#151, 2019) è ancora aperta.
- **App telefono** (`coredevices/mobileapp`): `isCompatible = compatibility.isCompatible(watchType, platform)` / `WatchType.getCompatibleAppVariants()` (emery accetta binari emery→basalt→diorite→aplite; flint: flint→diorite→aplite; gabbro: gabbro→chalk). Nessun confronto fra minor SDK e firmware dell'orologio; la scritta "Not Compatible with <watch>" riguarda solo la piattaforma. Il thread forum di maggio 2026 ("CloudPebble injects SDK 5.86…") si è chiuso come problema di configurazione, non di versione.
- **Orologio**: unico punto di enforcement (§1.2).

Conseguenza per il piano: un utente con PT2 non aggiornato può installare dallo store un'app SDK 4.33.1 e vedersi mostrare "Incompatible SDK" al primo tap. L'unica leva del developer è **la scelta dell'SDK** e le note di rilascio.

---

## 7. Azioni consigliate

1. **Fissare il "firmware floor" scegliendo l'SDK, non il codice.** Due opzioni ragionevoli:
   - **SDK 4.33.1 → richiede PebbleOS ≥ 4.32.0** (29 lug 2026). Da scegliere se servono `alarm_service_peek_next()`, HRV, recognizer/`app_touch_navigation_enable()`. In questo caso proteggere i recognizer con `prv_fw_at_least(4,33,2)` (crash noto su 4.32–4.33.1) oppure usare il touch grezzo (`touch_service_subscribe`) che è stabile da 4.9.164.
   - **SDK 4.17 → richiede PebbleOS ≥ 4.17.0** (19 giu 2026). Copre tutto l'intervallo 4.17–4.36 e ha già `persist_get_max_size()`, speaker, backlight service, touch grezzo, quick-launch. È il floor consigliato per watchface/app "offline-first" che non usano alarm/HRV/recognizer.
   - Evitare SDK 4.9.169 come floor: manca `persist_get_max_size()` e su 4.9.169/4.9.170 la quota è ancora 6 KiB.
2. **Mantenere un'unica code-base compilabile con entrambi gli SDK** usando `PBL_API_EXISTS()` per i simboli (alarm, HRV, recognizer, `persist_get_max_size`) e `PBL_TOUCH`/`PBL_SPEAKER`/`PBL_RGB_BACKLIGHT`/`PBL_PLATFORM_FLINT` per le piattaforme; produrre due `.pbw` (uno "4.17" e uno "4.33.1") o pubblicare quello 4.17 finché la base installata non è migrata.
3. **Dimensionare la cache locale su 1 MiB con verifica runtime**: `persist_get_max_size()` + gestione `E_OUT_OF_STORAGE` + chunking a 256 B (§5.2); non fidarsi della doc "4 kB" ma nemmeno cablare 1 MiB.
4. **Non tentare rilevamento runtime dell'esistenza di API in C**: è impossibile (nessun `dlsym`) e inutile (gate). Il rilevamento runtime serve solo per *comportamenti*: `watch_info_get_firmware_version()`, `touch_service_is_enabled()`, `speaker_is_muted()`, `persist_get_max_size()`.
5. **Test della matrice firmware con gli emulatori dell'SDK**: l'emulatore di SDK 4.33.1 gira firmware 4.33.2, quello di SDK 4.17 gira 4.17. Installare un `.pbw` costruito con 4.33.1 sull'emulatore 4.17 riproduce il dialog "Incompatible SDK" (da verificare la combinazione esatta di `pebble install --emulator emery --sdk 4.17`).
6. **Setup Linux senza sudo** (dalla pagina ufficiale d'installazione + sorgente pebble-tool):
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh          # uv in ~/.local/bin
   uv tool install pebble-tool                              # Python >= 3.10
   pebble sdk list                                          # 4.4 4.5 4.9.127 4.9.148 4.9.169 4.17 4.33.1
   pebble sdk install 4.33.1 && pebble sdk install 4.17     # toolchain arm-none-eabi scaricato da sdk.repebble.com/releases/<ver>/toolchain-linux-x86_64.tar.gz
   pebble sdk activate 4.17                                 # oppure per singolo comando: pebble build --sdk 4.33.1
   ```
   Le librerie richieste dall'emulatore (`libsdl2-2.0-0 libglib2.0-0 libpixman-1-0 zlib1g libsndio7.0`) sono pacchetti apt: senza sudo la **build funziona**, l'emulatore potrebbe non avviarsi (da verificare sul sistema; eventuale workaround con librerie estratte in user-space).
7. **Nelle release notes dell'appstore scrivere esplicitamente "Requires PebbleOS 4.32+" (o 4.17+)**, dato che né lo store né l'app telefono lo mostrano.
8. **Monitorare `pebble_process_info.h` su `main`** (ledger append-only) e la pagina changelog SDK: ogni nuovo SDK alza il floor di tutte le app ricompilate, anche se non usano le nuove API.

---

## 8. Fonti (URL, data di consultazione 2026-08-24)

Sorgenti / repo
- https://github.com/coredevices/PebbleOS — `src/fw/process_management/pebble_process_info.h` (ledger minor, `PROCESS_INFO_CURRENT_SDK_VERSION_MINOR 0x6a` su `main` @ `b2467a0`, 2026-08-24); `app_install_manager.c` (`app_install_entry_is_SDK_compatible`); `process_manager.c` (dialog "Incompatible SDK"); `src/fw/services/process_management/app_storage.c` (`GET_APP_INFO_INCOMPATIBLE_SDK`); `src/fw/services/persist/service.c` (`PERSIST_STORAGE_MAX_SPACE MiBYTES(1)`, commit `48f15c09` 2026-02-23); `src/fw/services/settings/settings_file.c` (`E_OUT_OF_STORAGE`, `prv_grow`); `src/fw/applib/persist.h`, `touch_service.h`, `alarm_service.h`, `backlight_service.h`, `health_service.h`, `app_watch_info.h`; `docs/development/sdk_export.md`; `tools/generate_native_sdk/generate_app_shim.py`, `generate_app_sdk_version_header.py`, `exported_symbols.json` (revision 109); `tools/waf/pebble_sdk_version.py`; `sdk/waftools/process_bundle.py`, `sdk_helpers.py`; `sdk/tools/inject_metadata.py`; `sdk/tools/schemas/attributes.json`.
- https://github.com/coredevices/PebbleOS/releases — date `published_at` di v4.9.184 … v4.36.0 (via `gh api`, 2026-08-24).
- https://github.com/coredevices/pebble-tool — `pebble_tool/sdk/manager.py` (`DOWNLOAD_SERVER = "https://sdk.repebble.com"`, `/v1/files/sdk-core?channel=`), `pebble_tool/commands/sdk/__init__.py` (`--sdk`), `commands/sdk/manage.py` (`list/install/activate/uninstall/set-channel`).
- https://github.com/coredevices/mobileapp — `libpebble3/.../metadata/WatchType.kt` (`getCompatibleAppVariants`), `.../database/entity/LockerEntry.kt` (`asMetadata` → `sdkVersionMajor/Minor`), `.../disk/pbw/PbwApp.kt`, `pebble/.../ui/LockerUtil.kt` (`isCompatible`), `LockerAppScreen.kt` ("Not Compatible with …").
- https://github.com/coredevices/sdk-docs — file `EMERY_SDK_VERSION` = `v4.33.0`.
- Tarball SDK verificati: https://sdk.repebble.com/releases/4.33.1/sdk-core.tar.gz , https://sdk.repebble.com/releases/4.17/sdk-core.tar.gz , https://sdk.repebble.com/releases/4.9.169/sdk-core.tar.gz ; manifest https://sdk.repebble.com/v1/files/sdk-core?channel= (7 versioni).

Documentazione ufficiale
- https://developer.repebble.com/sdk/changelogs/4.33.1/ (2026-08-14: fix crash recognizer, emulatore su fw 4.33.2)
- https://developer.repebble.com/sdk/changelogs/4.33/ (2026-08-12: recognizer, HRV, alarm, touch nav default, 128 KiB emery/gabbro, "require firmware 4.32 or later" per Alloy)
- https://developer.repebble.com/sdk/changelogs/4.17/ (2026-06-23: `persist_get_max_size()`, backlight service, `speaker_is_muted()`, quick launch)
- https://developer.repebble.com/sdk/changelogs/4.9.169/ (2026-05-01: Speaker API, Touch service, `PBL_TOUCH`, `PBL_RGB_BACKLIGHT`)
- https://developer.repebble.com/sdk/ (installazione: `uv tool install pebble-tool`, `pebble sdk install latest`, Python ≥ 3.10)
- https://developer.repebble.com/docs/c/Foundation/Storage/ (`persist_get_max_size`, `PERSIST_DATA_MAX_LENGTH 256`, "assume a 4 KB limit")
- https://developer.repebble.com/guides/events-and-services/persistent-storage/ (guida legacy "4 kB")
- https://developer.repebble.com/guides/events-and-services/touch/ (touch nav default da fw 4.32, gating fw 4.33, `touch_service_is_enabled`, watchface esclusi)
- https://developer.repebble.com/docs/c/User_Interface/Speaker/ e https://developer.repebble.com/docs/c/Foundation/Event_Service/BacklightService/ ("only work with SDK 4.9+")
- https://developer.repebble.com/guides/best-practices/building-for-every-pebble/ (`PBL_API_EXISTS`, `PBL_PLATFORM_*`, `PBL_TOUCH`)
- https://developer.repebble.com/guides/tools-and-resources/app-metadata/ (campi `package.json`, nessun campo firmware)
- https://appstore-api.repebble.com/ (endpoint, `compatibility`, `hardware_platforms`, query `hardware`) e record reale `GET /api/v1/apps/id/567312691a9a82d62800003d`
- https://developer.rebble.io/guides/appstore-publishing/publishing-an-app/ (solo `.pbw` + note di rilascio)
- https://repebble.com/blog/pebble-mega-update-july-2026 (2026-07-14: nuove API touch/speaker/backlight, PT2 spedizioni finali 28–31 lug 2026, 2.120 app per PT2/PR2)
- https://forum.repebble.com/t/solved-bug-cloudpebble-compiler-injects-sdk-5-86-into-manifest-json-breaking-sideloading/739 (mag 2026: 5.86 basalt/chalk/diorite, 5.78 aplite)
- https://github.com/pebble-dev/rebble-store/issues/151 (2019, aperta: "Add firmware checks")

---

## 9. Domande aperte (non confermate)
1. **Distribuzione reale dei firmware sul parco PT2/P2 Duo**: non esistono statistiche pubbliche. Indizio: **v4.27.1** (2026-08-13, minor 0x66) è un hotfix di 2 commit su driver OTP/QSPI del SoC SF32LB52 del PT2, pubblicato dopo 4.33.x → plausibile firmware di fabbrica per unità nuove; se così, le unità appena spedite **rifiutano le app SDK 4.33.1 finché non aggiornano** (inferenza, da verificare su un'unità nuova o chiedendo a Core su Discord/forum).
2. Se l'app telefono Core forzi o solo proponga l'aggiornamento firmware (nessun riscontro nel codice cercato) e se esistano canali stable/beta per il firmware.
3. Comportamento preciso quando il **watchface predefinito** è "Incompatible SDK" (fallback al watchface di sistema o schermata bloccata) — nel codice il fallback automatico è legato ai crash.
4. Se Core manterrà online l'SDK 4.17 (oggi l'unico floor intermedio) e se pubblicherà un SDK "4.36"; la lista del server cambia senza preavviso.
5. Applicabilità esatta di `--sdk` a `pebble install --emulator` per riprodurre il dialog di incompatibilità in locale.
6. Esecuzione dell'emulatore QEMU senza `sudo` su Ubuntu 26.04 (dipendenze SDL2/glib/pixman/sndio): da provare.

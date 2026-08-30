# Architettura offline-first per app Pebble (Pebble Time 2 / Pebble 2 Duo)

**Data ricerca:** 24 agosto 2026
**Target primario:** Pebble Time 2 (piattaforma SDK `emery`) — secondario: Pebble 2 Duo (piattaforma SDK `flint`)
**Fonti:** documentazione ufficiale Core Devices (`developer.repebble.com`), sorgente firmware `github.com/coredevices/PebbleOS` (branch `main`), blog `repebble.com` e `ericmigi.com`, changelog SDK.

> **Nota metodologica.** Tutte le affermazioni marcate **[CONFERMATO]** hanno una URL di fonte primaria (spesso il sorgente del firmware). Quelle marcate **[INFERENZA]** sono deduzioni mie da fonti primarie. Attenzione: le informazioni del 2016 sul *vecchio* Pebble Time 2 cancellato riusano lo stesso nome di piattaforma `emery` e la stessa risoluzione 200x228 — in questo report tutto si riferisce al **nuovo** PT2 di Core Devices, spedito da gennaio 2026.

---

## 0. Sintesi esecutiva (leggi almeno questo)

1. **Il cambiamento più importante del 2026 per l'offline-first: la quota di persistent storage per app è passata da 4 KiB a 1 MiB.** Nel sorgente: `#define PERSIST_STORAGE_MAX_SPACE MiBYTES(1)`. Commit `fw/services/persist: raise per-app storage limit to 1 MiB` del **23 febbraio 2026**. Il limite per singolo valore resta però **256 byte** (`PERSIST_DATA_MAX_LENGTH`). Questo trasforma il persist da "posto dove salvare 10 preferenze" a "vera cache locale" (~4000 chiavi da 256 B).
2. **Nuova API `persist_get_max_size()`** (SDK 4.17, 23 giugno 2026) per interrogare la quota a runtime. Non hardcodare 4096 né 1048576.
3. **Sul Pebble Time 2 NON c'è Wi-Fi.** Solo Bluetooth 5.3. Non esiste alcun percorso di rete che bypassi il telefono. Qualsiasi dato da Internet passa **obbligatoriamente** da PebbleKit JS sul telefono. Anche `fetch()` di Alloy è un proxy su PKJS.
4. **Il nuovo Pebble mobile app NON supporta più la timeline web API.** Solo "local pin" creati da `Pebble.insertTimelinePin()` dal JS della tua app sul telefono. I pin non possono più essere pushati da un backend.
5. **Rocky.js è deprecato** (febbraio 2026). Il JS che gira *sull'orologio* oggi è **Alloy** (Moddable XS). Alloy è genuinamente on-watch (quindi offline) per UI, sensori, storage, wakeup, health — ma **non** per la rete.
6. **RAM app su emery: segmento di 135.168 byte (132 KiB)** — ma solo se compili nativamente per `emery` come app SDK 4.x. Un binario `basalt`/3.x in compatibilità ottiene 67.584 byte (66 KiB). **Compila sempre nativo per emery.**
7. **DataLogging bufferizza fino a 640 KiB sull'orologio** ma i dati sono ricevibili **solo** da PebbleKit Android/iOS, **mai** da PebbleKit JS. Se non stai scrivendo una app companion nativa, DataLogging non ti serve.

---

## 1. Piattaforma hardware 2026 — numeri concreti

### 1.1 Tabella piattaforme SDK

| | **Emery** | **Flint** | **Gabbro** |
|---|---|---|---|
| Modello | **Pebble Time 2** | **Pebble 2 Duo** | Pebble Round 2 |
| Board firmware | `obelix` | `asterix` | `getafix` |
| Display | 200 x 228 | 144 x 168 | 260 x 260 |
| Colori | 64 (color) | 2 (B/N) | 64 (color) |
| Dimensione / PPI | 1.5" / 202 | 1.26" / 175 | 1.3" / 200 |
| Forma | rettangolo | rettangolo | tondo |
| SoC | SiFli SF32LB52J | Nordic nRF52840 | SiFli SF32LB52J |
| CPU | Star-MC1 (Cortex-M33-like) **240 MHz** | Cortex-M4 **64 MHz** | Star-MC1 240 MHz |
| Touch screen | **Sì** | No | **Sì** |
| Backlight | RGB multicolore | LED bianco | LED bianco |
| Sensori | IMU 6 assi, bussola | IMU 6 assi, bussola, **barometro** | IMU 3 assi, bussola |
| HRM | **Sì** | No | No |
| Speaker / Mic | Sì / Sì (2 mic, ENC) | Sì / Sì | No / Sì (2 mic, ENC) |
| Max Resource Size | 256k | 256k | 256k |
| Max App Size (binario) | 128k | 64k | 128k |
| Autonomia dichiarata | ~30 giorni (mediana reale ~21) | ~30 giorni (mediana reale >30) | ~14 giorni |

Fonte: <https://developer.repebble.com/guides/tools-and-resources/hardware-information/> (letto 2026-08-24). Autonomie reali: <https://repebble.com/blog/pebble-mega-update-july-2026> (luglio 2026). **[CONFERMATO]**

### 1.2 Memoria: i numeri veri (dal Kconfig del firmware)

Da `Kconfig` alla radice di `coredevices/PebbleOS` (branch `main`, letto 2026-08-24). Commento nel sorgente: *"For each environment, SEGMENT is the RAM given to the app itself (stack + text + data + bss + heap) and RUNTIME is the RAM reserved for the application runtime (AppState)."*

| Costante | Valore (byte) | = |
|---|---|---|
| `APP_RAM_EMERY_SEGMENT_SIZE` | **135168** | 132 KiB |
| `APP_RAM_EMERY_RUNTIME_SIZE` | 63488 | 62 KiB |
| `APP_RAM_FLINT_SEGMENT_SIZE` | **67584** | 66 KiB |
| `APP_RAM_FLINT_RUNTIME_SIZE` | 30720 | 30 KiB |
| `APP_RAM_GABBRO_SEGMENT_SIZE` | 135168 | 132 KiB |
| `APP_RAM_GABBRO_RUNTIME_SIZE` | 96256 | 94 KiB |
| `APP_RAM_BASALT_SEGMENT_SIZE` | 67584 | 66 KiB |
| `APP_RAM_APLITE_SEGMENT_SIZE` | 25952 | ~25 KiB |

**Il punto critico** — su `emery` il firmware espone TRE ambienti di esecuzione e il segmento dipende da come è compilata la tua app:

```
APP_RAM_2X_SEGMENT_SIZE = APP_RAM_APLITE_SEGMENT_SIZE  (25952)  # app SDK 2.x
APP_RAM_3X_SEGMENT_SIZE = APP_RAM_BASALT_SEGMENT_SIZE  (67584)  # app SDK 3.x
APP_RAM_4X_SEGMENT_SIZE = APP_RAM_EMERY_SEGMENT_SIZE   (135168) # app SDK 4.x nativa emery
```

Su `emery`/`gabbro` lo stack app è 4 KiB (contro 2 KiB delle altre piattaforme), da cui il segmento "132 KiB" = 128 KiB + 4 KiB di stack. **[CONFERMATO]** — <https://github.com/coredevices/PebbleOS/blob/main/Kconfig>

Il changelog SDK 4.33 (12 agosto 2026) precisa: *"The maximum app binary size on Emery and Gabbro is now 128 KiB (up from 64 KiB). The loaded image and RAM footprint are still limited to 64 KiB each; the extra room is available for relocation data."*
**[INFERENZA]** Riconciliazione: il segmento totale è 132 KiB (stack+text+data+bss+heap); dentro di esso l'*immagine caricata* è cappata a 64 KiB e la *RAM statica* (data+bss) a 64 KiB; il resto è heap. Conferma indiretta: l'issue #1621 riporta *"App bytes free: ~87,908 bytes"* di heap libero in una app Alloy su PT2.

### 1.3 SoC / flash (Pebble Time 2)

Da `soc/sf32lb/Kconfig.defconfig`:
- **SRAM: 512 KiB** (`CONFIG_SRAM_SIZE = 0x7fc00` = 523.264 B; l'ultimo 1 KiB è riservato all'IPC con l'LCPU).
- **Flash esterna: 32 MiB** memory-mapped via MPI. Layout: 64 KiB partition table, 64 KiB bootloader, **2 x 3 MiB slot firmware**, **2 x 2 MiB aree risorse**, 576 KiB recovery firmware (PRF).
- `CONFIG_SCREEN_COLOR_DEPTH_BITS_8=y` → framebuffer a 8 bpp = 200 x 228 = **45.600 byte**.
- **[CONFERMATO]** <https://github.com/coredevices/PebbleOS/blob/main/soc/sf32lb/Kconfig.defconfig>, <https://github.com/coredevices/PebbleOS/blob/main/boards/obelix/defconfig>

**Nessun Wi-Fi.** Il SF32LB52J è un MCU Bluetooth 5.3 big.LITTLE (240 MHz app core + 24 MHz core BT). I 16 MB di PSRAM del SoC **non sono abilitati** in PebbleOS (nessuna `CONFIG_PSRAM` nel branch `main`).
Fonte hardware: <https://www.cnx-software.com/2025/05/14/sifli-sf32lb52j-big-little-arm-cortex-m33-bluetooth-mcu-powers-the-core-time-2-smartwatch/> (14 maggio 2025). **[CONFERMATO / PSRAM: INFERENZA da assenza nel Kconfig]**

---

## 2. Cosa richiede il telefono e cosa no

### 2.1 Richiede una connessione attiva al telefono (❌ offline)

| Funzionalità | Perché | Note |
|---|---|---|
| **PebbleKit JS** (`src/pkjs/index.js`) | Il JS gira *dentro* la Pebble mobile app | Qualsiasi `XMLHttpRequest`/`fetch` verso Internet |
| **Alloy `fetch()` / `WebSocket`** | Proxati su PKJS via `@moddable/pebbleproxy` | Vedi §2.3 — insidia comune |
| **Geolocalizzazione** (`navigator.geolocation`) | API del telefono | |
| **Clay / config page** | Pagina HTML servita e renderizzata dalla mobile app | Clay funziona *senza Internet* ma **non senza telefono** |
| **Timeline pin** | I local pin sono creati dal PKJS della tua app sul telefono e sincronizzati | Vedi §2.4 |
| **Dictation API** | Audio inviato al servizio di trascrizione via telefono | |
| **Meteo / dati da web** | Nessun percorso di rete sull'orologio | |
| **AppMessage** | È il trasporto watch↔phone stesso | Ritorna `APP_MSG_NOT_CONNECTED` |
| **DataLogging → ricezione** | Serve PebbleKit Android/iOS in ascolto | Il *buffering* però è offline (§5) |

### 2.2 Funziona interamente sull'orologio (✅ offline)

| Funzionalità | API principali |
|---|---|
| **Persistent Storage** | `persist_read/write_{bool,int,data,string}`, `persist_exists`, `persist_delete`, `persist_get_size`, `persist_get_max_size` |
| **Wakeup API** | `wakeup_schedule`, `wakeup_query`, `wakeup_cancel`, `wakeup_cancel_all`, `wakeup_service_subscribe`, `wakeup_get_launch_event` |
| **HealthService** | `health_service_sum_today`, `health_service_peek_current_value`, `health_service_events_subscribe`, `health_service_peek_hrv_ppi_ms` (4.33) |
| **Accelerometro / tap** | `accel_data_service_subscribe`, `accel_tap_service_subscribe`, `accel_service_peek`, `accel_service_set_sampling_rate` |
| **Bussola** | `compass_service_subscribe`, `compass_service_set_heading_filter` |
| **Batteria** | `battery_state_service_subscribe`, `battery_state_service_peek` |
| **Tick timer / orologio** | `tick_timer_service_subscribe`, `time()`, `localtime()`, `strftime()`, `clock_is_24h_style()` |
| **AppGlance** | `app_glance_reload`, `app_glance_add_slice` — persistito su watch (§6.3) |
| **DataLogging (scrittura)** | `data_logging_create`, `data_logging_log`, `data_logging_finish` — bufferizza offline |
| **Background worker** | `app_worker_launch`, `app_worker_send_message`, ... |
| **Sveglie di sistema** | `alarm_service_peek_next()` (nuovo in SDK 4.33) |
| **Touch (PT2)** | `app_touch_navigation_enable()`, `tap_recognizer_create`, `pan_recognizer_create`, `swipe_recognizer_create` (SDK 4.33) |
| **Speaker (PT2)** | Speaker API, `speaker_is_muted()` (4.17) |
| **Backlight** | `backlight_service_subscribe()` + `BacklightHandler` (4.17), RGB backlight API |
| **Alloy: storage, sensori, UI, wakeup, health, vibes** | `localStorage`, `device.keyValue`, `device.files`, `pebble/wakeup`, `pebble/health`, `pebble/vibes` |

Fonti: <https://developer.repebble.com/guides/events-and-services/events/>, <https://developer.repebble.com/sdk/changelogs/4.17/>, <https://developer.repebble.com/sdk/changelogs/4.33/>

### 2.3 ⚠️ Insidia: Alloy `fetch()` NON è offline

La guida ufficiale Alloy Networking è esplicita:

> *"Alloy apps can communicate with the internet by proxying network requests through PebbleKit JS (PKJS) running on the phone."*
> *"To use `fetch()` or `WebSocket` on the watch, install the `@moddable/pebbleproxy` package"*

Le due sandbox JS:

| Ambiente | File | Gira su | Scopo |
|---|---|---|---|
| `embeddedjs` | `src/embeddedjs/main.js` | **Orologio** | UI e logica dell'app |
| `PKJS` | `src/pkjs/index.js` | **Telefono** | Proxy di rete, location, config |

**[CONFERMATO]** <https://developer.repebble.com/guides/alloy/networking/>

### 2.4 ⚠️ Timeline: la web API è morta

> *"The new Pebble app does not support the timeline web API, so pins can no longer be pushed to users from a web server. Local pins are the only way to add pins to the timeline."*
> *"Pins ... cannot be created while your app's JS is not running."*

API: `Pebble.insertTimelinePin({id, time, layout})`, `Pebble.deleteTimelinePin(id)`. Campi ignorati nei local pin: `createNotification`, `updateNotification`, `actions` (ogni pin ottiene solo "Remove"), `primaryColor`/`secondaryColor`/`backgroundColor`.
Compatibilità: le richieste del *tuo* PKJS verso `timeline-api.rebble.io` o `timeline-api.getpebble.com` su `/v1/user/pins` vengono **intercettate** dal telefono e convertite in local pin (l'utente può disattivare l'intercettazione con l'impostazione "Emulate Timeline Webservice").

**[CONFERMATO]** <https://developer.repebble.com/guides/pebble-timeline/timeline-local-pins/>

**Conseguenza per l'offline-first:** i pin timeline non sono un canale affidabile per una app offline. Se ti serve una notifica a orario fisso senza telefono, usa la **Wakeup API** (§6.1), non i pin.

### 2.5 ⚠️ Il servizio meteo di sistema esiste ma non è pubblico

Il firmware ha un `weather_service` che mantiene una cache di previsioni **sull'orologio** (`weather_db`, un blob_db). Header: *"The weather service manages the store of weather forecast data on the watch. Forecast data and location data is sent from the phone to the watch. No requests for data are made from the watch."* Ma nel sorgente c'è: *"NOTE: ListNode and list.h are not exposed, so if this function becomes part of the public API, refactoring will be needed."* → **non è esposto all'SDK di terze parti**. Devi cachare il meteo per conto tuo.
**[CONFERMATO]** <https://github.com/coredevices/PebbleOS/blob/main/include/pbl/services/weather/weather_service.h>

Curiosità utile (febbraio 2026): la Pebble mobile app **intercetta** le chiamate a vecchie API meteo morte (Yahoo, OpenWeather) e risponde con dati Open-Meteo, così le vecchie watchface continuano a funzionare.
<https://repebble.com/blog/february-pebble-production-and-software-updates>

---

## 3. Persistent Storage: limiti, performance, versioning, recupero

### 3.1 Limiti esatti

| Costante / limite | Valore | Fonte |
|---|---|---|
| `PERSIST_DATA_MAX_LENGTH` | **256 byte** | `src/fw/applib/persist.h` |
| `PERSIST_STRING_MAX_LENGTH` | **256 byte** (incluso `\0`) | idem (`= PERSIST_DATA_MAX_LENGTH`) |
| `PERSIST_STORAGE_MAX_SPACE` | **1 MiB (1.048.576 B)** per app | `src/fw/services/persist/service.c` |
| `PERSIST_STORAGE_INITIAL_ALLOC` | **4 KiB** | idem |
| Tipo chiave | `uint32_t` | — |
| Quota a runtime | `persist_get_max_size()` | SDK 4.17+ |

```c
// src/fw/services/persist/service.c (branch main, 2026-08-24)
#define PERSIST_STORAGE_MAX_SPACE     MiBYTES(1)
#define PERSIST_STORAGE_INITIAL_ALLOC KiBYTES(4)

size_t persist_service_get_max_size(void) {
  return PERSIST_STORAGE_MAX_SPACE;
}
```

Storia (dai commit su `src/fw/services/persist/service.c`):
- **2026-02-23** — `fw/services/persist: raise per-app storage limit to 1 MiB`
- **2026-04-30** — `fw/services/settings: add growable settings files`
- **2026-04-30** — `sdk: add persist_get_max_size() for runtime persist storage capacity`
- **2026-06-19 / 2026-06-23** — i file persist sono ora nominati per UUID (`ps<uuid-hex>`) invece che per id volatile; migrazione automatica dai vecchi `ps%06d`. *"The UUID is stable across reinstalls, so the file follows the app regardless of its (volatile) AppInstallId."*

**[CONFERMATO]** <https://github.com/coredevices/PebbleOS/blob/main/src/fw/services/persist/service.c> · <https://api.github.com/repos/coredevices/PebbleOS/commits?path=src/fw/services/persist/service.c>

⚠️ La documentazione guida (`/guides/events-and-services/persistent-storage/`) dice ancora **"4 kB"**: è **obsoleta** rispetto al firmware. La pagina API C invece è aggiornata: *"The total size of an app's persisted values is capped; call `persist_get_max_size` to query the limit at runtime."*
<https://developer.repebble.com/docs/c/Foundation/Storage/>

### 3.2 Come funziona davvero (implicazioni su performance e wear)

Il persist NON è una key-value map in RAM: è un **file log-strutturato** (`SettingsFile`) su PFS (flash NOR esterna).

- Ogni `persist_write_*` **appende** un record `[header][key][value]`. Sovrascrivere una chiave marca il vecchio record come "dead space", non lo cancella.
- Quando `used_space + dead_space + rec_size > max_space_total` il firmware fa **grow** (raddoppio dell'allocazione) oppure **compact** (riscrittura completa del file).
- `prv_grow()` raddoppia `alloc_used_space` fino a `max_used_space`; si parte da 4 KiB.
- Commento letterale nel sorgente: **`// A 1 MiB grow can take many seconds of pure flash erase + write time. Pause the task watchdog rather than letting it trip and kick App Throttling.`** → `task_watchdog_pause(60)`.
- `settings_file_compact()` fa anche **shrink**: se i dati vivi sono molto meno dell'allocazione, riduce verso il minimo *"Without this, a file that burst to e.g. 256 KiB and then idled would hold that flash forever ... slowly bleeding free PFS space across device lifetime."*
- **Atomicità garantita**: *"either the new value will be completely written and returned for all future queries, or, if we reboot/lose power/run into an error, then we will continue to return the previous value. We should never run into a case where neither value exists."*

**[CONFERMATO]** <https://github.com/coredevices/PebbleOS/blob/main/src/fw/services/settings/settings_file.c>

**Conseguenze pratiche:**

1. **Scrivere spesso la stessa chiave costa.** Ogni write è un nuovo record; il costo si paga tutto insieme alla compattazione, che può bloccare l'app per centinaia di ms (o secondi se il file è grosso). La doc ufficiale conferma: *"Apps that make large use of the Storage API may experience small pauses due to underlying housekeeping operations."*
2. **Non scrivere nel `tick_handler` ogni minuto.** Scrivi a `deinit()`, all'uscita, o con debounce (`AppTimer` di 5–30 s che coalesce le modifiche).
3. **Wear della flash:** NOR con erase a blocchi. Un pattern "log append + compattazione" è già wear-friendly, ma un write al secondo per giorni no. Regola pratica: **≤ 1 write al minuto in regime stazionario**.
4. **Non far crescere il file a 1 MiB se non serve.** Una crescita a 1 MiB è "many seconds" di erase+write. Se ti servono 200 KB di cache, tienili sotto e il file resterà su uno step di raddoppio più basso.
5. **Rileggere è economico** rispetto ad AppMessage: *"when compared to using AppMessage to retrieve values from the phone, it provides you with a much faster way to restore state. In addition, it draws less power from the battery."*

### 3.3 Pattern: struct grandi > 256 byte (chunking)

`persist_write_data` è cappato a 256 byte. Per blob più grandi, spezza su chiavi consecutive.

```c
#define PERSIST_CHUNK_SIZE   256
#define KEY_CACHE_BASE       1000   // 1000..1999 riservate ai chunk
#define KEY_CACHE_LEN        999    // lunghezza totale in byte

static bool cache_write(const void *data, size_t len) {
  if (persist_write_int(KEY_CACHE_LEN, (int32_t)len) < 0) return false;
  const uint8_t *p = data;
  for (size_t off = 0, i = 0; off < len; off += PERSIST_CHUNK_SIZE, i++) {
    size_t n = len - off;
    if (n > PERSIST_CHUNK_SIZE) n = PERSIST_CHUNK_SIZE;
    if (persist_write_data(KEY_CACHE_BASE + i, p + off, n) < 0) return false;
  }
  return true;
}

static size_t cache_read(void *out, size_t out_size) {
  if (!persist_exists(KEY_CACHE_LEN)) return 0;
  size_t len = (size_t)persist_read_int(KEY_CACHE_LEN);
  if (len == 0 || len > out_size) return 0;
  uint8_t *p = out;
  for (size_t off = 0, i = 0; off < len; off += PERSIST_CHUNK_SIZE, i++) {
    size_t n = len - off;
    if (n > PERSIST_CHUNK_SIZE) n = PERSIST_CHUNK_SIZE;
    int r = persist_read_data(KEY_CACHE_BASE + i, p + off, n);
    if (r != (int)n) return 0;   // chunk mancante/corrotto
  }
  return len;
}
```

> **Ordine di scrittura importante:** scrivi prima i chunk, poi la lunghezza (o meglio: la lunghezza + un checksum) **per ultima**, così un'interruzione lascia lo stato precedente coerente. L'atomicità del firmware è per-record, non per-transazione.

### 3.4 Pattern: versioning degli struct persistiti

La guida ufficiale raccomanda un intero di versione. Versione robusta con checksum:

```c
#define KEY_SCHEMA_VERSION  0
#define SCHEMA_VERSION      3

typedef struct __attribute__((packed)) {
  uint16_t version;      // ridondante ma utile per validare il blob
  uint16_t crc;          // CRC16 dei byte successivi
  int32_t  last_sync_utc;
  int16_t  temp_c;
  uint8_t  condition;
  uint8_t  flags;
} CacheV3;               // 12 byte -> sta comodamente in un persist value

static void storage_migrate(void) {
  uint32_t v = persist_exists(KEY_SCHEMA_VERSION)
             ? (uint32_t)persist_read_int(KEY_SCHEMA_VERSION) : 0;
  if (v == SCHEMA_VERSION) return;

  switch (v) {
    case 0:  /* installazione nuova: scrivi i default */  defaults_write(); break;
    case 1:  migrate_v1_to_v2(); /* fallthrough */
    case 2:  migrate_v2_to_v3(); break;
    default:
      // versione FUTURA (downgrade del firmware / rollback dell'app):
      // NON provare a interpretare. Azzera e riparti pulito.
      storage_reset_all();
      defaults_write();
      break;
  }
  persist_write_int(KEY_SCHEMA_VERSION, SCHEMA_VERSION);
}
```

**Regole d'oro:**
- **Mai** riusare un numero di chiave con semantica diversa tra versioni. Alloca range: `0–9` meta/versione, `10–99` impostazioni, `1000+` cache.
- Usa `__attribute__((packed))` sugli struct persistiti e non fidarti mai del `sizeof` tra build diverse: valida sempre con `persist_get_size(key) == sizeof(T)`.
- Gestisci il caso **versione più alta di quella attesa** (l'utente può fare downgrade dell'app): reset, non crash.

### 3.5 Recupero da dati corrotti o mancanti

```c
static bool cache_load(CacheV3 *out) {
  if (!persist_exists(KEY_CACHE)) return false;                 // mai scritto
  if (persist_get_size(KEY_CACHE) != (int)sizeof(CacheV3)) {    // dimensione errata
    persist_delete(KEY_CACHE);
    return false;
  }
  if (persist_read_data(KEY_CACHE, out, sizeof(*out)) != (int)sizeof(*out)) return false;
  if (out->version != SCHEMA_VERSION)                  { persist_delete(KEY_CACHE); return false; }
  if (out->crc != crc16(((uint8_t*)out) + 4, sizeof(*out) - 4)) {
    persist_delete(KEY_CACHE);                         // corrotto: butta
    return false;
  }
  if (out->last_sync_utc <= 0 || out->last_sync_utc > time(NULL) + 86400) {
    persist_delete(KEY_CACHE);                         // timestamp assurdo
    return false;
  }
  return true;
}
```

Codici di ritorno utili (enum `StatusCode`): `S_SUCCESS`, `S_TRUE`, `E_DOES_NOT_EXIST`, `E_OUT_OF_MEMORY`, `E_OUT_OF_STORAGE`, `E_RANGE`, `E_INVALID_ARGUMENT`, `E_INTERNAL`.
- `persist_read_data`/`persist_read_string` ritornano il numero di byte scritti nel buffer, oppure `E_DOES_NOT_EXIST`.
- `persist_get_size` ritorna la dimensione o `E_DOES_NOT_EXIST`.
- `persist_delete` ritorna `S_TRUE` se ha cancellato, `E_DOES_NOT_EXIST` se non c'era.
- ⚠️ `persist_read_int` ritorna **0** e `persist_read_bool` ritorna **false** se la chiave non esiste: indistinguibile da un valore legittimo. **Usa sempre `persist_exists()` prima**, o incapsula il valore in uno struct con flag di validità.

**[CONFERMATO]** <https://developer.repebble.com/docs/c/Foundation/Storage/>

### 3.6 Storage lato Alloy (JS on-watch)

Tre API, tutte on-watch quindi offline:

| API | Uso | Metodi |
|---|---|---|
| `localStorage` (**consigliata**) | stringhe semplici | `setItem`, `getItem`, `removeItem`, `clear` |
| Key-Value ECMA-419 | binario e stringhe | `device.keyValue.open({path, format})` → `write/read/delete/close` |
| File System ECMA-419 | dati grandi, accesso random | `device.files.openFile({path, mode, size})`, `device.files.delete(path)` |

Persiste attraverso restart dell'app, reboot dell'orologio e update; si cancella a disinstallazione / factory reset. La doc non pubblica limiti in byte espliciti: *"limited storage space"*, *"store only essential data"*.
**[CONFERMATO]** <https://developer.repebble.com/guides/alloy/storage/>

⚠️ **Vincolo di memoria Alloy:** la macchina XS ha un blocco statico di **32.768 byte** (chunk 8192, slot 9200, stack 384, heap 512). L'issue #1621 (28 giugno 2026, chiusa con PR #1655) documentava che su firmware 4.17.0 *"the 8.2.3 engine baseline already consumes most of it before any app code runs"*, con ~88 KB di app heap inutilizzati. Se sviluppi in Alloy su PT2, **testa il consumo memoria presto** e assicurati di essere su firmware/SDK ≥ 4.32/4.33.
<https://github.com/coredevices/pebbleos/issues/1621>

---

## 4. Rilevare la connettività e progettare per il disconnesso

### 4.1 ConnectionService — API esatte

```c
static void app_connection_handler(bool connected) { /* Pebble mobile app */ }
static void kit_connection_handler(bool connected) { /* companion PebbleKit */ }

connection_service_subscribe((ConnectionHandlers) {
  .pebble_app_connection_handler = app_connection_handler,
  .pebblekit_connection_handler  = kit_connection_handler
});

bool app_conn = connection_service_peek_pebble_app_connection();
bool kit_conn = connection_service_peek_pebblekit_connection();

connection_service_unsubscribe();
```

Semantica ufficiale:
- `pebble_app_connection_handler` — connessione alla Pebble mobile app; **"when the Pebble app is connected, you can assume PebbleKit JS apps will also be running correctly"**. È questo il segnale da usare per decidere se PKJS è utilizzabile.
- `pebblekit_connection_handler` — su **Android** ritorna `true` ogni volta che c'è connessione alla mobile app (i messaggi PebbleKit sono instradati dall'app Android). Su **iOS** ritorna `true` solo quando una companion app PebbleKit ha stabilito la connessione diretta.
- Almeno uno dei due handler deve essere non-NULL.
- Deprecati (evitare in codice nuovo): `bluetooth_connection_service_peek/subscribe/unsubscribe`, typedef `BluetoothConnectionHandler`.

**[CONFERMATO]** <https://developer.repebble.com/docs/c/Foundation/Event_Service/ConnectionService/> · <https://developer.repebble.com/guides/events-and-services/events/>

### 4.2 Macchina a stati UI consigliata

Progetta **quattro** stati, non due. Il bug più comune è confondere "disconnesso" con "dati vecchi".

| Stato | Condizione | UI |
|---|---|---|
| `FRESH` | cache valida e `age < TTL` | dato pieno, nessun badge |
| `STALE` | cache valida ma `age >= TTL`, phone connesso | dato + badge "aggiornamento…"; avvia fetch |
| `OFFLINE_CACHED` | phone disconnesso, cache valida | dato + **icona BT barrata** + "agg. 2h fa" |
| `OFFLINE_EMPTY` | phone disconnesso, nessuna cache | placeholder (`--°`), mai spinner infinito |

Principi:
1. **Renderizza sempre prima dalla cache**, poi eventualmente aggiorna. Zero schermate "Loading…" all'avvio. La guida ufficiale Alloy usa esattamente questo pattern: *"This gives users instant weather display on app launch instead of 'Loading...' while waiting for the phone connection and API response."*
2. **Mostra sempre l'età del dato**, non solo il valore. Timestamp relativo (`"12 min fa"`), calcolato on-watch da `time(NULL) - last_sync_utc`.
3. **Non far lampeggiare l'icona BT.** Su e-paper le animazioni costano batteria e leggibilità.
4. **Nessuna vibrazione automatica alla disconnessione** salvo esplicita richiesta utente: è il reclamo #1 degli utenti Pebble.
5. **Il rendering non deve mai dipendere dal fetch.** Separa `model` (dati + timestamp + stato) da `view` (disegno). La `view` legge solo il model.

### 4.3 Timeout, retry e backoff per AppMessage

Il pattern raccomandato dalla doc ufficiale è "timeout and retry":
1. Invia il messaggio e arma un `AppTimer`.
2. Se `AppMessageOutboxSent` arriva → `app_timer_cancel()`.
3. Se il timer scade o arriva `AppMessageOutboxFailed` → ritenta.
4. *"The first failure should be reattempted fairly quickly (one second), with the interval increasing as successive failures occurs. If the connection is not available the timer interval should be even longer, or wait until the connection is restored."*

Implementazione con backoff esponenziale + jitter e **gating sulla connessione** (cruciale per la batteria):

```c
static AppTimer *s_retry_timer;
static uint32_t  s_backoff_ms = 1000;
#define BACKOFF_MAX_MS (5 * 60 * 1000)   // 5 minuti

static void sync_attempt(void *ctx) {
  s_retry_timer = NULL;

  // 1) Se il telefono non c'e', NON ritentare a vuoto: risveglia solo la radio.
  //    Aspetta l'evento di riconnessione.
  if (!connection_service_peek_pebble_app_connection()) return;
  // 2) Se il JS non ha ancora mandato il suo 'ready', aspetta.
  if (!comm_is_js_ready()) { schedule_retry(); return; }

  DictionaryIterator *iter;
  AppMessageResult r = app_message_outbox_begin(&iter);
  if (r != APP_MSG_OK) { schedule_retry(); return; }   // tipicamente APP_MSG_BUSY
  dict_write_uint8(iter, MESSAGE_KEY_RequestSync, 1);
  if (app_message_outbox_send() != APP_MSG_OK) { schedule_retry(); return; }
  // il timer di timeout viene armato qui; cancellato in outbox_sent_handler
}

static void schedule_retry(void) {
  if (s_retry_timer) return;                       // gia' in coda: mai duplicare
  uint32_t jitter = (uint32_t)(rand() % (s_backoff_ms / 4 + 1));
  s_retry_timer = app_timer_register(s_backoff_ms + jitter, sync_attempt, NULL);
  s_backoff_ms = (s_backoff_ms * 2 > BACKOFF_MAX_MS) ? BACKOFF_MAX_MS : s_backoff_ms * 2;
}

static void outbox_sent_handler(DictionaryIterator *iter, void *ctx) {
  s_backoff_ms = 1000;                             // reset del backoff
  if (s_timeout_timer) { app_timer_cancel(s_timeout_timer); s_timeout_timer = NULL; }
}

static void outbox_failed_handler(DictionaryIterator *iter,
                                  AppMessageResult reason, void *ctx) {
  if (reason & APP_MSG_NOT_CONNECTED)   { /* niente retry: aspetta l'evento BT */ return; }
  if (reason & APP_MSG_APP_NOT_RUNNING) { /* il PKJS non gira: retry lento */ }
  schedule_retry();
}

// La riconnessione e' il trigger giusto, non un polling.
static void app_connection_handler(bool connected) {
  if (connected) { s_backoff_ms = 1000; sync_attempt(NULL); }
  else           { ui_set_state(OFFLINE_CACHED); }
}
```

**`AppMessageResult` — codici che devi gestire** (`docs/c/Foundation/AppMessage/`):

| Codice | Significato | Azione consigliata |
|---|---|---|
| `APP_MSG_OK` | avvio elaborazione ok (≠ consegnato) | attendi callback |
| `APP_MSG_BUSY` | outbox occupata | retry breve (200–500 ms) |
| `APP_MSG_NOT_CONNECTED` | nessun telefono | **NON ritentare**: aspetta ConnectionService |
| `APP_MSG_APP_NOT_RUNNING` | il PKJS non è in esecuzione | retry lungo |
| `APP_MSG_SEND_TIMEOUT` | timeout di trasporto | backoff |
| `APP_MSG_SEND_REJECTED` | rifiutato dal peer | non ritentare identico |
| `APP_MSG_BUFFER_OVERFLOW` (128) | buffer troppo piccolo | riduci payload / aumenta inbox |
| `APP_MSG_OUT_OF_MEMORY` | heap insufficiente | riduci le dimensioni dei buffer |
| `APP_MSG_CLOSED` (8192) | AppMessage chiuso | riapri |
| `APP_MSG_INVALID_STATE` / `APP_MSG_INTERNAL_ERROR` | — | log + degrado |

### 4.4 Dimensionamento dei buffer AppMessage

```c
app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());
```

- `APP_MESSAGE_INBOX_SIZE_MINIMUM` = **124** byte (garantito ovunque)
- `APP_MESSAGE_OUTBOX_SIZE_MINIMUM` = **636** byte (garantito ovunque)
- Massimi a runtime: `app_message_inbox_size_maximum()`, `app_message_outbox_size_maximum()`. La guida indica *"current buffer sizes of up to 8k for each an outbox"*.
- ⚠️ **AppMessage usa lo heap dell'app.** Su emery hai ~132 KiB di segmento: 8 KiB + 8 KiB di buffer sono l'~11% del segmento. Per una watchface che riceve solo 40 byte di meteo, **non chiedere il massimo**: `app_message_open(256, 128)` è più che sufficiente e libera heap per il framebuffer/bitmap. Chiedi il massimo solo se trasferisci davvero blob grandi.
- La doc lo dice esplicitamente: *"The more you use for AppMessage, the less space you'll have for the rest of your app."*

**[CONFERMATO]** <https://developer.repebble.com/docs/c/Foundation/AppMessage/>

### 4.5 Batching e coda dei messaggi

- **Handshake obbligatorio**: se l'orologio deve *inviare* dati, deve prima ricevere il `ready` del PKJS. Pattern ufficiale: chiave `JSReady` in `package.json`; il PKJS fa `Pebble.sendAppMessage({'JSReady': 1})` sull'evento `ready`; l'orologio setta `s_js_ready = true` in `inbox_received_handler`. *(Un'app che solo riceve non deve aspettare.)*
- **Liste lunghe**: non usare timer per scaglionare i messaggi. Usa `AppMessageOutboxSent` come pompa: incrementa l'indice e invia il successivo. Schema chiavi: `MESSAGE_KEY_someArray + index` (dichiarare `"someArray[6]"` in `package.json`).
- **Meglio ancora**: comprimi tutto in **un solo messaggio** con un `byte array` binario. Un `Tuple` per campo ha overhead di ~7 byte ciascuno; 24 ore di previsione come 24 `int8` = 24 byte in un solo tuple contro ~200 byte in 24 tuple.
- **Coda offline**: mantieni una piccola coda FIFO in RAM (max 4–8 elementi) e **persistila** in `persist` a `deinit()` se contiene operazioni utente non ancora inviate. Non accodare richieste di refresh: quelle sono idempotenti, tienine una sola pendente.

**[CONFERMATO]** <https://developer.repebble.com/guides/communication/advanced-communication/>

### 4.6 Sniff interval e batteria

```c
app_comm_set_sniff_interval(SNIFF_INTERVAL_NORMAL);   // torna sempre qui
```
*"frequent use of the AppMessage API ... will cause the Bluetooth connection to enter a more responsive state, which consumes much more power"*. Usa `SNIFF_INTERVAL_REDUCED` **solo** durante un trasferimento voluminoso e ripristina `NORMAL` subito dopo.
**[CONFERMATO]** <https://developer.repebble.com/guides/best-practices/conserving-battery-life/>

### 4.7 PebbleKit JS come "sync worker"

Modello mentale corretto: **il telefono è un worker opportunistico, non una dipendenza**.

```js
// src/pkjs/index.js
var TTL_MS = 30 * 60 * 1000;

Pebble.addEventListener('ready', function() {
  Pebble.sendAppMessage({ 'JSReady': 1 });
});

Pebble.addEventListener('appmessage', function(e) {
  if (e.payload.RequestSync === undefined) return;

  // 1) cache lato telefono: evita di colpire la rete a ogni apertura app
  var cached = localStorage.getItem('wx');
  var cachedAt = Number(localStorage.getItem('wxAt') || 0);
  if (cached && (Date.now() - cachedAt) < TTL_MS) {
    return sendToWatch(JSON.parse(cached), cachedAt);
  }

  navigator.geolocation.getCurrentPosition(function(pos) {
    fetchWeather(pos.coords.latitude, pos.coords.longitude, function(err, data) {
      if (err) {
        // 2) fallback: manda comunque la cache vecchia col suo timestamp reale
        if (cached) sendToWatch(JSON.parse(cached), cachedAt);
        return;
      }
      localStorage.setItem('wx', JSON.stringify(data));
      localStorage.setItem('wxAt', String(Date.now()));
      sendToWatch(data, Date.now());
    });
  }, function() { if (cached) sendToWatch(JSON.parse(cached), cachedAt); },
     { timeout: 15000, maximumAge: 10 * 60 * 1000 });
});

function sendToWatch(d, fetchedAtMs) {
  Pebble.sendAppMessage({
    'Temp':      d.temp,
    'Condition': d.code,
    // SEMPRE il timestamp di quando il dato e' stato PRODOTTO, in UTC secondi
    'FetchedAt': Math.floor(fetchedAtMs / 1000)
  });
}
```

**Regole:**
- Il telefono manda **sempre** `FetchedAt` insieme al dato. L'orologio persiste entrambi e calcola l'età localmente. Mai far calcolare "quanto è vecchio" al telefono.
- Il telefono cacha anche lui: due livelli di cache riducono radio e rete.
- In caso di errore di rete, il telefono rimanda comunque la cache **con il timestamp originale** — mai con `Date.now()`.

### 4.8 Cache on-watch e "ultimo aggiornamento"

```c
typedef struct __attribute__((packed)) {
  uint16_t version;
  uint16_t crc;
  int32_t  fetched_at;   // UTC secondi, dal telefono
  int16_t  temp_c;
  uint8_t  condition;
  uint8_t  flags;
} WxCache;

static void render_age(char *buf, size_t n, int32_t fetched_at) {
  if (fetched_at <= 0) { snprintf(buf, n, "--"); return; }
  int32_t age = (int32_t)time(NULL) - fetched_at;
  if (age < 0)      snprintf(buf, n, "ora");            // clock skew
  else if (age < 120)    snprintf(buf, n, "ora");
  else if (age < 3600)   snprintf(buf, n, "%ld min fa", (long)(age / 60));
  else if (age < 86400)  snprintf(buf, n, "%ldh fa",    (long)(age / 3600));
  else                   snprintf(buf, n, "%ldg fa",    (long)(age / 86400));
}
```

⚠️ Il timestamp arriva dal telefono ma `time()` è l'orologio locale: gestisci `age < 0` (skew) e considera un dato con `age > 24h` come **non mostrabile** (mostra il placeholder invece di un numero vecchio e falso).

---

## 5. DataLogging come canale offline-first

### 5.1 Cosa è

*"Datalogging also allows up to 640 kB of data to be buffered on the watch until a connection is available, instead of requiring a connection be present at all times. If data is logged while the watch is disconnected, it will be transferred to the Pebble mobile app in batches for processing at the next opportunity."*

```c
#define TIMESTAMP_LOG 1
static DataLoggingSessionRef s_session_ref;

// tag, tipo, dimensione elemento, resume
s_session_ref = data_logging_create(TIMESTAMP_LOG, DATA_LOGGING_INT, sizeof(int), true);

DataLoggingResult r = data_logging_log(s_session_ref, &value, 1);
if (r != DATA_LOGGING_SUCCESS) { APP_LOG(APP_LOG_LEVEL_ERROR, "DL err %d", (int)r); }

data_logging_finish(s_session_ref);
```
Il 4° parametro `true` di `data_logging_create()` **riprende** una sessione precedente invece di ricominciare da zero a ogni lancio: fondamentale per l'offline-first.

### 5.2 Limiti esatti (dal sorgente firmware)

Da `include/pbl/services/data_logging/dls_private.h` (branch `main`):

| Costante | Valore |
|---|---|
| `DLS_TOTAL_STORAGE_BYTES` | **640 KiB** (di *sistema*, condiviso da tutte le app) |
| `DLS_MAX_NUM_SESSIONS` | **20** |
| `DLS_FILE_INIT_SIZE_BYTES` | 4 KiB |
| `DLS_MAX_DATA_BYTES` | `640 KiB - (20 x 4 KiB)` = **560 KiB** effettivi |
| `DLS_SESSION_MAX_BUFFERED_ITEM_SIZE` | **300 byte** per elemento |
| `DLS_MIN_FILE_FREE_BYTES` / `DLS_MAX_FILE_FREE_BYTES` | 8 KiB / 100 KiB |
| `DLS_MAX_CHUNK_SIZE_BYTES` (in `dls_storage.c`) | 100 |
| Tipi | `DataLoggingItemType`: byte array, `DATA_LOGGING_UINT`, `DATA_LOGGING_INT` |

**[CONFERMATO]** <https://github.com/coredevices/PebbleOS/blob/main/include/pbl/services/data_logging/dls_private.h>

### 5.3 ⚠️ Il limite che decide tutto

> *"Note: Datalogging data cannot be received via PebbleKit JS."*

I dati sono ricevibili **solo** da:
- **PebbleKit Android** — `PebbleKit.PebbleDataLogReceiver` + `receiveData()` / `onFinishSession()` (legacy v1), oppure **PebbleKit Android 2** (Kotlin, consigliato): `BasePebbleListenerService.onDataLogReceived()` / `onDataLogSessionFinished()`, dipendenza `io.rebble.pebblekit2:client`.
- **PebbleKit iOS** — `PBDataLoggingServiceDelegate`, `dataLoggingService:hasSInt32s:...`, `dataLoggingService:logDidFinish:`.

**[CONFERMATO]** <https://developer.repebble.com/guides/communication/datalogging/> · <https://github.com/pebble-dev/PebbleKitAndroid2>

### 5.4 Verdetto per il tuo caso d'uso

Se il piano è "piccole app/watchface senza app companion nativa", **DataLogging non è il tuo canale**. Serve un'app Android/iOS che tu scrivi e che l'utente installa.

**Alternativa corretta per app auto-contenute:** ring buffer in `persist`. Con 1 MiB di quota puoi tenere, ad es., 30 giorni x 24 campioni orari x 8 byte = 5.760 byte — banale. Il persist è locale, non richiede companion e sopravvive a reboot.

DataLogging ha senso solo se: (a) scrivi anche l'app mobile, (b) devi esfiltrare volumi (accelerometro raw), (c) accetti la dipendenza dalla companion.

---

## 6. Esecuzione senza telefono: Wakeup, Worker, AppGlance

### 6.1 Wakeup API — task schedulati senza telefono

```c
time_t ts = time(NULL) + (30 * SECONDS_PER_MINUTE);      // oppure:
time_t ts = clock_to_timestamp(MONDAY, 17, 0);           // prossimo lunedì 17:00

WakeupId id = wakeup_schedule(ts, /*cookie*/ 42, /*notify_if_missed*/ true);
if (id >= 0) persist_write_int(KEY_WAKEUP_ID, id);

time_t when;
if (wakeup_query(id, &when)) { /* ancora schedulato */ }
wakeup_cancel(id);
wakeup_cancel_all();

// al lancio
if (launch_reason() == APP_LAUNCH_WAKEUP) {
  WakeupId wid; int32_t cookie;
  wakeup_get_launch_event(&wid, &cookie);
}
// se scatta mentre l'app e' aperta
wakeup_service_subscribe(wakeup_handler);   // void h(WakeupId, int32_t reason)
```

**Limiti (documentazione ufficiale):**
1. **Massimo 8 wakeup schedulati per app** contemporaneamente.
2. Non si può schedulare **entro 30 secondi** dall'ora corrente.
3. Ogni wakeup ha una **finestra di ±1 minuto** in cui nessun'altra app può schedulare.

| StatusCode | Valore | Significato |
|---|---|---|
| `E_RANGE` | -8 | conflitto con un altro evento in quella finestra |
| `E_INVALID_ARGUMENT` | -4 | orario nel passato |
| `E_OUT_OF_RESOURCES` | -7 | già 8 wakeup schedulati |
| `E_INTERNAL` | -3 | errore di sistema |

⚠️ **`E_RANGE` è comune**: due app che vogliono svegliarsi "alle 8:00 in punto" collidono. **Implementa sempre un retry con offset**:

```c
static WakeupId schedule_with_jitter(time_t target, int32_t cookie) {
  for (int i = 0; i < 6; i++) {
    WakeupId id = wakeup_schedule(target + (i * 150), cookie, true);  // +0, +2.5m, +5m...
    if (id >= 0) return id;
  }
  return -1;
}
```

⚠️ `clock_to_timestamp()` **non gestisce il DST**: *"events scheduled during a DST change will be off by an hour."*

**[CONFERMATO]** <https://developer.repebble.com/guides/events-and-services/wakeups/>

**Alloy (JS on-watch)** — `pebble/wakeup`, disponibile **solo su Emery e Gabbro**:
```js
import WakeUp from "pebble/wakeup";
const id = WakeUp.schedule(Date.now() + 3000, 12345678, false);
WakeUp.query(id);   // { time, scheduled } o falsy
WakeUp.cancel(id);
if (watch.wake) { /* watch.wake.id, watch.wake.cookie */ }
watch.addEventListener("wakeup", wake => { /* ... */ });
```
**[CONFERMATO]** <https://developer.repebble.com/guides/alloy/wakeups/>

### 6.2 Background worker (`app_worker`)

**Numeri reali dal sorgente** (`src/fw/process_management/worker_manager.c`):
```c
static size_t prv_get_worker_segment_size(const PebbleProcessMd *app_md) {
  // 12 KiB - 640 bytes workerlib static = 11648 bytes
  return 11648;
}
static size_t prv_get_worker_stack_size(const PebbleProcessMd *app_md) {
  return 1400;
}
```
→ segmento **11.648 byte**, stack **1.400 byte** → heap utile ≈ **10,2 KiB** (la doc dice "10.5 KB"). **Identico su tutte le piattaforme**, PT2 compreso: il worker NON beneficia dei 132 KiB di emery.
**[CONFERMATO]** <https://github.com/coredevices/PebbleOS/blob/main/src/fw/process_management/worker_manager.c>

**Restrizioni:**
- **Un solo worker attivo su tutto il sistema.** Se un'altra app lancia il suo worker, l'utente deve scegliere quale tenere. → **Non puoi contare sul tuo worker.**
- Il worker deve appartenere alla **stessa app** (stesso UUID); vive in `worker_src/`.
- **Non disponibili nel worker:** UI (nessuna `Window`/`Layer`), `AppMessage`, caricamento risorse. Il compilatore dà errore.
- **Disponibili:** `AccelerometerService`, `CompassService`, `HealthService`, `ConnectionService`, `BatteryStateService`, `TickTimerService`, `Storage` (persist), `DataLogging`.

**API:** `app_worker_launch()`, `app_worker_kill()`, `app_worker_is_running()`, `app_worker_message_subscribe()`, `app_worker_message_unsubscribe()`, `app_worker_send_message()`.
**Scaffolding:** `pebble new-project --worker <nome>`.

**Comunicazione app↔worker:** (1) via `persist` (asincrona, sopravvive alla chiusura), (2) via `DataLogging`, (3) via `AppWorkerMessage` (bidirezionale, solo mentre entrambi girano).

**[CONFERMATO]** <https://developer.repebble.com/guides/events-and-services/background-worker/>

**Raccomandazione:** dato il vincolo "un worker per sistema" + 10 KiB, **preferisci Wakeup + persist** al worker per la raccolta dati periodica, salvo che ti serva davvero un campionamento continuo dei sensori. Se usi il worker, gestisci il caso "l'utente ha dato lo slot a un'altra app": controlla `app_worker_is_running()` e degrada.

### 6.3 AppGlance — stato offline nel launcher

Le slice sono salvate nel **blob_db `app_glance_db` sull'orologio** → **persistono a telefono spento e a reboot**. Una volta impostate, non serve connessione per mostrarle.

```c
static void prv_update_glance(AppGlanceReloadSession *session, size_t limit, void *ctx) {
  if (limit < 1) return;
  const AppGlanceSlice entry = (AppGlanceSlice) {
    .layout = {
      .icon = PUBLISHED_ID_WEATHER_HOT,          // o APP_GLANCE_SLICE_DEFAULT_ICON
      .subtitle_template_string = (const char *)ctx
    },
    .expiration_time = APP_GLANCE_SLICE_NO_EXPIRATION
  };
  AppGlanceResult r = app_glance_add_slice(session, entry);
  if (r != APP_GLANCE_RESULT_SUCCESS) APP_LOG(APP_LOG_LEVEL_ERROR, "glance %d", r);
}

static void prv_deinit(void) { app_glance_reload(prv_update_glance, s_subtitle); }
```

**Limiti (dal sorgente `include/pbl/services/blob_db/app_glance_db_private.h`):**
- `APP_GLANCE_DB_MAX_SLICES_PER_GLANCE` = **8** (il valore 2 nell'header vale solo sotto `#if UNITTEST`)
- `APP_GLANCE_DB_MAX_NUM_APP_GLANCES` = **50** (numero di app con glance)
- `ATTRIBUTE_APP_GLANCE_SUBTITLE_MAX_LEN` = **150** caratteri
- La doc avvisa: usa sempre il parametro `limit` passato alla callback, non l'8 hardcoded.
- ⚠️ **Solo watchapp, non watchface.**

**Template string — il trucco offline più potente:** una singola slice può aggiornare il proprio testo nel tempo senza che l'app giri.
```
{evaluation(timestamp)|format(parameters)}
"Prossimo aggiornamento tra {time_until(1467834606)|format('%aT')}"
"Dati di {time_since(1467834606)|format('%aT')} fa"
```
Predicati: `>1d`, `<12m`, `>=6m`, `<=1d12h` (unità `d` giorno, `H` ora, `M` minuto, `S` secondo). Formato: `'%aT'` (abbreviato: "1 hr 10 min 4 sec").

**Pattern consigliato:** in `deinit()` scrivi una glance con `time_since(last_sync)` → il launcher mostra da solo quanto è vecchio il dato, **senza mai risvegliare la tua app**. È essenzialmente gratis in batteria.

Icone custom: PNG **25 x 25 px**, dichiarate in `package.json` sotto `resources.media` + `publishedMedia`, referenziate con prefisso `PUBLISHED_ID_`.

**[CONFERMATO]** <https://developer.repebble.com/guides/user-interfaces/appglance-c/> · <https://github.com/coredevices/PebbleOS/blob/main/include/pbl/services/blob_db/app_glance_db_private.h>

---

## 7. Ora, fuso orario e locale senza telefono

### 7.1 API

| API | Descrizione |
|---|---|
| `time(NULL)` | UTC epoch — mantenuto dall'RTC dell'orologio, **funziona offline** |
| `localtime()` / `gmtime()` | conversione; se il TZ non è impostato, `localtime == gmtime` |
| `clock_is_timezone_set()` | `true` se il fuso è impostato |
| `clock_get_timezone(char *buf, size_t n)` | nome lungo Olson, es. `"America/Chicago"`; buffer ≥ `TIMEZONE_NAME_LENGTH` = **32** |
| `clock_is_24h_style()` | preferenza 12h/24h dell'utente |
| `clock_copy_time_string(char *buf, uint8_t size)` | ora già formattata secondo le preferenze utente |
| `clock_to_timestamp(WeekDay, hour, minute)` | prossima occorrenza — **non gestisce il DST** |
| `strftime()` | dipende dal locale attivo |

`TIMEZONE_NAME_LENGTH` = 32. `WeekDay`: `TODAY`, `SUNDAY`…`SATURDAY`.

**[CONFERMATO]** <https://developer.repebble.com/docs/c/Foundation/Wall_Time/>

### 7.2 Comportamento offline

- **L'ora corrente non richiede il telefono.** L'RTC gira autonomamente; il firmware ha un `timezone_database` on-watch (`src/fw/services/timezone_database`) con le regole DST.
- **La sincronizzazione dell'ora e il cambio di fuso vengono dal telefono.** Il fuso resta quello impostato l'ultima volta; se ti sposti di fuso senza telefono, l'orologio non se ne accorge. Il drift dell'RTC in giorni di disconnessione è tipicamente di secondi.
- ⚠️ **Difendi il codice da `clock_is_timezone_set() == false`** (orologio appena resettato, mai accoppiato): in quel caso `localtime()` restituisce UTC. Ogni calcolo di alba/tramonto, "giorno corrente", o allarmi ne risente.

```c
if (!clock_is_timezone_set()) {
  // niente TZ: mostra l'ora ma disabilita feature dipendenti dal fuso
  s_show_sun_times = false;
}
```

### 7.3 Internazionalizzazione

- `setlocale(LC_ALL, "")` → dichiara che l'app supporta l'i18n e restituisce il locale di sistema. `setlocale(LC_TIME, "")` per il solo formato data/ora. `setlocale(LC_ALL, "fr_FR")` per forzare.
- `i18n_get_system_locale()` per leggere il locale.
- Locale supportati: `en_US`, `fr_FR`, `de_DE`, `es_ES`, `it_IT`, `pt_PT`, `en_CN`, `en_TW`.
- Effetti: traduce `%a %A %b %B` di `strftime()`, e le rappresentazioni `%c` e `%x`.
- ⚠️ **Il separatore decimale di `printf()` NON cambia col locale**: resta sempre `.`. Se ti serve la virgola in italiano, formattala a mano.
- ⚠️ I glifi delle lingue non-latine sono caricati sull'orologio in base alla scelta utente nella mobile app; **i font custom devono includere i caratteri necessari**.
- Per molte stringhe: Locale Framework (`_()` macro + `localize.c`/`hash.h`, `get_dict.py`, `dict2bin.py`), con fallback automatico all'inglese.
- **Nota offline:** il locale è impostato dall'utente e persiste sull'orologio → funziona offline. È `navigator.language` (PKJS) a richiedere il telefono.

**[CONFERMATO]** <https://developer.repebble.com/guides/tools-and-resources/internationalization/>

---

## 8. Novità PebbleOS / SDK 2025-2026 rilevanti per l'offline

| Data | Novità | Impatto offline |
|---|---|---|
| **2026-02-23** | Quota persist per app **4 KiB → 1 MiB** (`PERSIST_STORAGE_MAX_SPACE`) | ⭐ **Enorme** — abilita cache locali reali |
| **2026-04-30** | `settings_file` "growable" (parte da 4 KiB, raddoppia) | Costo I/O ammortizzato |
| **2026-04-30 / SDK 4.17** | `persist_get_max_size()` | Quota interrogabile a runtime |
| **2026-02 (blog)** | **Rocky.js deprecato**, arriva **Alloy** (Moddable XS on-watch) | JS che gira davvero sull'orologio |
| **2026-02 (blog)** | Impostazioni orologio configurabili dalla mobile app e sincronizzate su tutti gli orologi | Comodità, ma **sempre via telefono** |
| **2026-02 (blog)** | La mobile app intercetta le vecchie API meteo (Yahoo/OpenWeather) e risponde con Open-Meteo | Vecchie watchface risuscitate |
| **2026-06-19/23** | File persist nominati per **UUID** (stabili tra reinstallazioni) + migrazione automatica | Dati più robusti agli update |
| **SDK 4.17 (2026-06-23)** | `speaker_is_muted()`; `backlight_service_subscribe()`; `app_launch_button()` / `app_launch_get_quick_launch_action()`; FFI in Alloy; `pebble/wakeup`, `pebble/vibes`, `pebble/dictation` in Alloy; `pebble build --debug` + xsbug | Wakeup schedulabile da JS on-watch |
| **SDK 4.33 (2026-08-12)** | Touch recognizers (`tap/pan/swipe_recognizer_create`, `app_touch_navigation_enable()`); HRV (`health_service_peek_hrv_ppi_ms`, `health_service_set_hrv_sample_period`); **`alarm_service_peek_next()`**; step/calorie non più saturate a 16 bit; binario app 128 KiB su emery/gabbro; libc → **picolibc**; Alloy XS 17.8 + `pebble/health` | `alarm_service_peek_next()` = indicatore sveglia **senza telefono** |
| **SDK 4.33.1 (2026-08-14)** | Hotfix crash recognizer (fw 4.33.2) | — |
| **luglio 2026** | Autonomia mediana PT2 ~21 giorni; Pebble 2 Duo >30 giorni; modalità "Battery Saver" del backlight | Meno ricariche = più tempo offline |

**⚠️ Nessun Wi-Fi, nessuna rete autonoma, in nessuna delle nuove piattaforme.** Non è previsto in roadmap pubblica.

Fonti: <https://developer.repebble.com/sdk/changelogs/4.33/> · <https://developer.repebble.com/sdk/changelogs/4.17/> · <https://repebble.com/blog/february-pebble-production-and-software-updates> · <https://repebble.com/blog/cloudpebble-returns-plus-pure-javascript-and-round-2-sdk> · <https://repebble.com/blog/pebble-mega-update-july-2026>

### 8.1 On-watch settings: stato reale

Un panel di preferenze globali on-watch con un nuovo syscall (`watchface_settings_declare()`, array di `WatchfaceSetting` con nome, chiave persist, tipo, default e palette) è stato **prototipato** da Rich Infante (**21 maggio 2026**) ma è dichiarato dall'autore stesso *"just a hacking project"*, su un branch, **non merged** in PebbleOS.
**Conclusione: oggi non esiste una config on-watch ufficiale. Clay + telefono resta l'unica via standard.**
<https://www.richinfante.com/2026/05/21/pebbleos-hacking-global-color-prefs>

**Workaround pratico:** implementa tu un piccolo menu di impostazioni on-watch (`MenuLayer` + `persist`) **in aggiunta** a Clay. È l'unica soluzione realmente offline oggi, e sul PT2 il touch la rende usabile.

---

## 9. App open source di riferimento

| Progetto | Perché è rilevante | URL |
|---|---|---|
| **Halcyon** (freakified) | ⭐ **Calcolo alba/tramonto on-device** — zero dipendenza dal telefono per un dato tipicamente "da web". Il pattern da copiare: calcola invece di scaricare. Ring solare 24h, 10 preset colore. | <https://github.com/freakified/halcyon> |
| **TimeStyle** (freakified) | La watchface Pebble più matura: 200+ star, 16 contributor, complications (meteo, passi, sonno, batteria, fuso alternativo), 20+ preset, 30 lingue. Riferimento per gestione cache meteo + Clay + i18n su scala reale. | <https://github.com/freakified/TimeStylePebble> |
| **ForecasWatch2** (mattrossman) | Previsioni 24h in grafico; refresh ~ogni mezz'ora; caso di studio su come trasferire e disegnare una serie temporale con pochi byte. | <https://github.com/mattrossman/forecaswatch2> |
| **classio-battery-connection** (pebble-examples) | Esempio ufficiale minimale di **indicatore di connessione BT + batteria** in una watchface. Punto di partenza per la UI "disconnesso". | <https://github.com/pebble-examples/classio-battery-connection> |
| **Mercury** (JavaierRizzoA) | Watchface analogica che supporta *tutte* le piattaforme con rendering platform-appropriate. Riferimento per `PBL_IF_*_ELSE()` e build multi-piattaforma. | <https://github.com/JavierRizzoA/Pebble-Mercury> |
| **Moddable pebble-examples** | Decine di esempi Alloy ufficiali, incluso `hellowakeup` (wakeup on-watch da JS). | <https://github.com/Moddable-OpenSource/pebble-examples> |
| **Tutorial Alloy ufficiale, parte 6** | ⭐ Pattern di cache offline **scritto da Core Devices**: `loadCachedWeather()` / `saveWeather()` con `localStorage` + TTL di 1 ora + rendering immediato dalla cache. | <https://developer.repebble.com/tutorials/alloy-watchface-tutorial/part6/> |
| **AppGlance-Hello-World** | Esempio ufficiale citato dalla guida AppGlance C. | (linkato da <https://developer.repebble.com/guides/user-interfaces/appglance-c/>) |
| **Archivio appstore** | ~15.000 app/watchface storiche con PBW e metadati — miniera di pattern. | <https://archive.org/details/pebble-appstore-archive> |
| **Filtro open source** | L'appstore permette di filtrare solo le app open source. | <https://apps.repebble.com/apps> |

Il codice del tutorial ufficiale (cache con TTL, fonte primaria):
```js
function loadCachedWeather() {
  const cached = localStorage.getItem("weather");
  const cachedTime = localStorage.getItem("weatherTime");
  if (cached && cachedTime) {
    const age = Date.now() - Number(cachedTime);
    if (age < 60 * 60 * 1000) {                 // usa la cache se < 1 ora
      try { weather = JSON.parse(cached); return true; }
      catch (e) { console.log("Failed to parse cached weather"); }
    }
  }
  return false;
}
function saveWeather() {
  if (weather) {
    localStorage.setItem("weather", JSON.stringify(weather));
    localStorage.setItem("weatherTime", String(Date.now()));
  }
}
```

---

## 10. Architettura di riferimento consigliata (C, emery)

```
┌──────────────────────────── OROLOGIO (sempre attivo) ────────────────────────────┐
│                                                                                  │
│  model.c    stato in RAM + specchio in persist (single source of truth)          │
│             { data[], fetched_at, schema_version, crc }                          │
│                        ▲                    │                                    │
│                        │                    ▼                                    │
│  storage.c  persist: migrate → load → validate(crc,size,ts) → fallback default    │
│             write con debounce (AppTimer 10 s) + flush in deinit()                │
│                        ▲                                                          │
│  sync.c     ConnectionService → gate                                              │
│             AppMessage con backoff esponenziale + jitter, max 5 min               │
│             mai retry su APP_MSG_NOT_CONNECTED (aspetta l'evento)                 │
│                        ▲                                                          │
│  ui.c       render SEMPRE dal model; 4 stati (FRESH/STALE/OFFLINE_*)              │
│             badge età dato calcolato con time(NULL) - fetched_at                  │
│                                                                                  │
│  glance.c   in deinit(): app_glance_reload con "{time_since(ts)|format('%aT')}"   │
│  wakeup.c   wakeup_schedule con jitter anti-E_RANGE, id in persist                │
└──────────────────────────────────────────────────────────────────────────────────┘
                                    ▲ AppMessage (opportunistico)
┌──────────────────────── TELEFONO (opzionale, best-effort) ───────────────────────┐
│  pkjs/index.js   sync worker: geolocation → fetch → localStorage(TTL) → send      │
│                  invia SEMPRE {data..., FetchedAt: <utc_secondi>}                 │
│                  su errore rete: rimanda la cache col timestamp ORIGINALE         │
│  config.js       Clay (impostazioni; richiede telefono)                           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Budget di memoria proposto (emery, segmento 135.168 B)

| Voce | Byte | Note |
|---|---|---|
| Stack | 4.096 | fisso |
| AppMessage inbox + outbox | 512 + 256 | **non** chiedere il massimo se non serve |
| Cache dati in RAM | ~2.000 | struct packed |
| Bitmap / font custom | 20.000–40.000 | il grosso del budget su un display 200x228 |
| Heap libero residuo | > 80.000 | margine ampio |

**Verifica sempre con `heap_bytes_free()` e `heap_bytes_used()` durante lo sviluppo.**

---

## 11. Azioni consigliate

### Setup e build

1. **Installa il toolchain in user space** (nessun sudo, coerente col tuo ambiente):
   ```bash
   # uv in ~/.local/bin (Python 3.14 di sistema non serve toccarlo)
   curl -LsSf https://astral.sh/uv/install.sh | sh
   uv tool install pebble-tool --python 3.13
   pebble sdk install latest       # scarica anche arm-none-eabi e il binario QEMU
   ```
   `pebble sdk install` porta il toolchain ARM e QEMU: **non ti serve `arm-none-eabi-gcc` di sistema né Docker**.
2. **Fallback zero-setup:** <https://cloudpebble.repebble.com> (browser, nessuna installazione).
3. **Compila SEMPRE nativamente per `emery`.** Nel `package.json`, `targetPlatforms` deve includere `"emery"`. Un binario in compatibilità 3.x ottiene 67.584 B invece di 135.168 B di segmento RAM.
   ```bash
   pebble build && pebble install --emulator emery
   pebble install --emulator flint    # verifica il fallback B/N
   ```

### Persist

4. **Non hardcodare la quota.** Alla prima esecuzione:
   ```c
   size_t quota = persist_get_max_size();   // 1 MiB su fw recenti, 4 KiB su vecchi
   ```
   Se compili con un SDK più vecchio o punti a firmware legacy, guarda con `#ifdef` e assumi 4096 come fallback.
5. **Chunking obbligatorio oltre 256 byte.** Scrivi i chunk **prima**, la lunghezza + CRC **dopo**.
6. **Debounce delle scritture**: al massimo ~1 write/minuto in regime stazionario. Flush in `deinit()`. Mai scrivere nel `tick_handler` a ogni secondo.
7. **Riserva range di chiavi** (`0–9` meta, `10–99` config, `1000+` cache) e implementa `storage_migrate()` con `switch` + fallthrough dal giorno 1, incluso il ramo "versione futura → reset".
8. **Valida sempre** con `persist_exists()` + `persist_get_size() == sizeof(T)` + CRC + sanity-check del timestamp. Mai fidarsi di `persist_read_int()` che ritorna 0.
9. **Non far esplodere il file oltre il necessario**: una crescita a 1 MiB costa "many seconds" di erase+write.

### Connettività e sync

10. **Renderizza dalla cache prima di qualunque I/O.** Nessuno spinner all'avvio, mai.
11. **Implementa 4 stati UI** (`FRESH`/`STALE`/`OFFLINE_CACHED`/`OFFLINE_EMPTY`) e mostra sempre l'età del dato, calcolata on-watch.
12. **Non ritentare mai su `APP_MSG_NOT_CONNECTED`.** Usa `connection_service_subscribe()` come trigger di riconnessione: risparmia batteria e evita il thrashing della radio.
13. **Backoff esponenziale con jitter**, cap a 5 minuti, reset su successo.
14. **Il PKJS manda sempre `FetchedAt`** in UTC secondi insieme ai dati; su errore di rete rimanda la cache col timestamp originale.
15. **Dimensiona i buffer AppMessage al minimo necessario** (es. `app_message_open(256, 128)`), non con `*_size_maximum()` per default.
16. **Un solo messaggio binario** invece di N tuple: risparmia ~7 byte/tuple di overhead e riduce il tempo radio.
17. Ripristina `app_comm_set_sniff_interval(SNIFF_INTERVAL_NORMAL)` dopo ogni trasferimento intenso.

### Background e schedulazione

18. **Preferisci Wakeup + persist al background worker.** Il worker è unico per sistema (te lo possono portare via) e ha solo ~10 KiB.
19. **Wakeup con jitter anti-collisione**: ritenta con offset di 150 s fino a 6 volte su `E_RANGE`. Persiste il `WakeupId`, validalo con `wakeup_query()` all'avvio e ripulisci gli id morti.
20. **Non affidarti a `clock_to_timestamp()` attraverso i cambi di DST** — è documentato come non-DST-aware.
21. **Usa AppGlance con `time_since()`** in `deinit()`: il launcher mostra da solo l'età del dato senza risvegliare l'app. Costo batteria ~zero.

### Design specifico Pebble Time 2

22. **Sfrutta i 200x228 a 64 colori con una palette limitata e coerente.** Il framebuffer è a 8 bpp (45.600 B); il display e-paper è sempre acceso: prediligi contrasto alto e forme piene rispetto ad antialiasing sottile.
23. **Aggiorna una volta al minuto** (`MINUTE_UNIT`), non `SECOND_UNIT`. È il singolo fattore di batteria più impattante lato app (confermato dal blog: i maggiori consumatori sono backlight, watchface animate e health tracking).
24. **Usa il touch** (`app_touch_navigation_enable()`, SDK 4.33) per un menu impostazioni on-watch: è oggi l'unico modo di configurare l'app senza telefono.
25. **Testa anche su `flint`** (Pebble 2 Duo): 144x168 **B/N**, 66 KiB di segmento, niente touch, niente HRM. Usa `PBL_IF_COLOR_ELSE()`, `PBL_IF_RECT_ELSE()`, `PBL_IF_HEALTH_ELSE()` e `#ifdef PBL_PLATFORM_EMERY`.

### Da evitare

26. ❌ **Non progettare intorno ai timeline pin** — la web API è morta, i local pin richiedono il PKJS attivo.
27. ❌ **Non usare DataLogging** se non scrivi anche una companion Android/iOS: PebbleKit JS non può riceverne i dati.
28. ❌ **Non usare Rocky.js** — deprecato da febbraio 2026.
29. ❌ **Non aspettarti che `fetch()` di Alloy funzioni offline** — è un proxy su PKJS.
30. ❌ **Non assumere che il fuso orario sia impostato**: controlla `clock_is_timezone_set()`.

---

## 12. Domande aperte / non confermate

1. **Valore reale di `app_message_inbox_size_maximum()` su emery con firmware 4.33.** La guida cita "up to 8k" ma non ho trovato la costante nel sorgente per la nuova piattaforma. Da misurare a runtime sull'hardware/emulatore.
2. **Esiste un'API di stato connessione in Alloy?** La guida Alloy documenta `pebble/app-messages`, `device-info`, `health`, `wakeup`, ma non ho trovato un equivalente JS di `ConnectionService`. Da verificare in `pebble/app-messages` o `watch`.
3. **Limiti in byte dello storage Alloy** (`localStorage`, `device.keyValue`, `device.files`): la doc dice solo "limited storage space", nessun numero. Probabilmente condivide la quota persist di 1 MiB, ma non confermato.
4. **Riconciliazione esatta "segmento 132 KiB" vs "RAM footprint 64 KiB"** del changelog 4.33 — la mia interpretazione (immagine caricata ≤64 KiB, RAM statica ≤64 KiB, il resto heap) è un'inferenza supportata dall'issue #1621 ma non da una dichiarazione esplicita.
5. **Spazio PFS effettivamente disponibile** per persist + datalogging + app sul PT2. Il layout dei 32 MiB di flash è documentato per firmware/risorse/PRF, ma non ho trovato la dimensione della partizione filesystem.
6. **PSRAM (16 MB) del SF32LB52J**: dichiarata "non abilitata in PebbleOS" da una fonte di maggio 2025; non ho trovato `CONFIG_PSRAM` nel branch `main` di agosto 2026, ma l'assenza non è una conferma formale.
7. **Comportamento reale del drift RTC** dopo giorni di disconnessione: nessun dato pubblicato.
8. **Se e quando le on-watch settings** (prototipo Infante) verranno integrate ufficialmente.
9. **Stato di maturità di PebbleKit Android 2** (versione stabile, minSdk, compatibilità con la Pebble app di Core Devices vs microPebble): il README cita "Core app (v1.0.7.7+)" e "microPebble (v1.0.0-alpha35+)" ma non ho verificato le release.

---

## 13. Fonti (con date di consultazione/pubblicazione)

**Documentazione ufficiale Core Devices** (consultata 2026-08-24)
- Persistent Storage (guida): <https://developer.repebble.com/guides/events-and-services/persistent-storage/>
- Storage (API C): <https://developer.repebble.com/docs/c/Foundation/Storage/>
- Wall Time (API C): <https://developer.repebble.com/docs/c/Foundation/Wall_Time/>
- ConnectionService (API C): <https://developer.repebble.com/docs/c/Foundation/Event_Service/ConnectionService/>
- AppMessage (API C): <https://developer.repebble.com/docs/c/Foundation/AppMessage/>
- Event Services (guida): <https://developer.repebble.com/guides/events-and-services/events/>
- Wakeups: <https://developer.repebble.com/guides/events-and-services/wakeups/>
- Background Worker: <https://developer.repebble.com/guides/events-and-services/background-worker/>
- Pebble Health: <https://developer.repebble.com/guides/events-and-services/health/>
- Datalogging: <https://developer.repebble.com/guides/communication/datalogging/>
- Advanced Communication: <https://developer.repebble.com/guides/communication/advanced-communication/>
- PebbleKit Android: <https://developer.repebble.com/guides/communication/using-pebblekit-android/>
- AppGlance C API: <https://developer.repebble.com/guides/user-interfaces/appglance-c/>
- App Configuration (Clay): <https://developer.repebble.com/guides/user-interfaces/app-configuration/>
- Local Pins: <https://developer.repebble.com/guides/pebble-timeline/timeline-local-pins/>
- Internationalization: <https://developer.repebble.com/guides/tools-and-resources/internationalization/>
- Hardware Information: <https://developer.repebble.com/guides/tools-and-resources/hardware-information/>
- Conserving Battery Life: <https://developer.repebble.com/guides/best-practices/conserving-battery-life/>
- Alloy Storage: <https://developer.repebble.com/guides/alloy/storage/>
- Alloy Networking: <https://developer.repebble.com/guides/alloy/networking/>
- Alloy Wakeups: <https://developer.repebble.com/guides/alloy/wakeups/>
- Tutorial Alloy watchface parte 6: <https://developer.repebble.com/tutorials/alloy-watchface-tutorial/part6/>
- Esempi ufficiali: <https://developer.repebble.com/examples/>
- Changelog SDK 4.17 (**pubblicato 2026-06-23**): <https://developer.repebble.com/sdk/changelogs/4.17/>
- Changelog SDK 4.33 (**pubblicato 2026-08-12**): <https://developer.repebble.com/sdk/changelogs/4.33/>
- Changelog SDK 4.33.1 (**pubblicato 2026-08-14**): <https://developer.repebble.com/sdk/changelogs/4.33.1/>

**Sorgente firmware `coredevices/PebbleOS`, branch `main`** (letto 2026-08-24)
- `Kconfig` (APP_RAM_*): <https://github.com/coredevices/PebbleOS/blob/main/Kconfig>
- `src/fw/services/persist/service.c` (PERSIST_STORAGE_MAX_SPACE = 1 MiB): <https://github.com/coredevices/PebbleOS/blob/main/src/fw/services/persist/service.c>
- Storia commit persist: <https://api.github.com/repos/coredevices/PebbleOS/commits?path=src/fw/services/persist/service.c>
- `src/fw/applib/persist.h` (PERSIST_DATA_MAX_LENGTH = 256): <https://github.com/coredevices/PebbleOS/blob/main/src/fw/applib/persist.h>
- `src/fw/services/settings/settings_file.c` (grow/compact/atomicità): <https://github.com/coredevices/PebbleOS/blob/main/src/fw/services/settings/settings_file.c>
- `include/pbl/services/data_logging/dls_private.h` (640 KiB, 20 sessioni, 300 B/item): <https://github.com/coredevices/PebbleOS/blob/main/include/pbl/services/data_logging/dls_private.h>
- `src/fw/process_management/worker_manager.c` (11648 B / 1400 B): <https://github.com/coredevices/PebbleOS/blob/main/src/fw/process_management/worker_manager.c>
- `include/pbl/services/blob_db/app_glance_db_private.h`: <https://github.com/coredevices/PebbleOS/blob/main/include/pbl/services/blob_db/app_glance_db_private.h>
- `include/pbl/services/weather/weather_service.h`: <https://github.com/coredevices/PebbleOS/blob/main/include/pbl/services/weather/weather_service.h>
- `soc/sf32lb/Kconfig.defconfig` (512 KiB SRAM, 32 MiB flash): <https://github.com/coredevices/PebbleOS/blob/main/soc/sf32lb/Kconfig.defconfig>
- `boards/obelix/defconfig` (PLATFORM_EMERY, 8 bpp): <https://github.com/coredevices/PebbleOS/blob/main/boards/obelix/defconfig>
- Issue #1621, memoria Alloy/XS (**2026-06-28**, chiusa): <https://github.com/coredevices/pebbleos/issues/1621>

**Blog e altre fonti**
- Pebble Mega Update (**luglio 2026**): <https://repebble.com/blog/pebble-mega-update-july-2026>
- February Pebble Production and Software Updates (**febbraio 2026**): <https://repebble.com/blog/february-pebble-production-and-software-updates>
- CloudPebble Returns + Alloy (**febbraio 2026**): <https://repebble.com/blog/cloudpebble-returns-plus-pure-javascript-and-round-2-sdk>
- Spring 2026 Pebble App Contest + SDK Updates: <https://repebble.com/blog/spring-2026-pebble-app-contest>
- PebbleOS Hacking — Global Watch Preferences Panel (**2026-05-21**): <https://www.richinfante.com/2026/05/21/pebbleos-hacking-global-color-prefs>
- SiFli SF32LB52J, specifiche SoC (**2025-05-14**): <https://www.cnx-software.com/2025/05/14/sifli-sf32lb52j-big-little-arm-cortex-m33-bluetooth-mcu-powers-the-core-time-2-smartwatch/>
- PebbleKit Android 2: <https://github.com/pebble-dev/PebbleKitAndroid2>
- Rocky.js API docs (marcate deprecate): <https://developer.repebble.com/docs/rockyjs/>
- Appstore (filtro open source): <https://apps.repebble.com/apps>

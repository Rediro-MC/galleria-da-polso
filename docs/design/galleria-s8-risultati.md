# Galleria — S8: risultati sul campo (tabella da compilare)

> Unico posto dove finiscono i numeri misurati sull'orologio reale (spec `galleria-s8-hardware.md` §2.6). Ogni riga cita il file di log (`apps/galleria/run_s8_*.log`, riassunto con `python3 tools/galleria_logstats.py --md`) e lo screenshot. Vuoto = non ancora misurato.

## Ambiente del test

| Voce | Valore |
|---|---|
| Data / luogo | 30/08/2026, sera (passi 1–5); **04/09/2026, sera** (O4b: avvio/uscita con la build M dopo S8-perf) |
| Orologio (modello, firmware, colore) | Pebble Time 2, **PebbleOS v4.36.2** (git f1a41a4), board obelix (hardware 18 = PVT), seriale <omesso>, lingua it_IT; recovery v4.9.142 |
| Telefono (modello, Android, versione app Pebble) | app Pebble **1.11.0.3**; IP <IP del telefono> |
| Trasporto usato (`--phone IP` / `--adb` / `--cloudpebble`) | `--phone <IP del telefono>` (LAN dev connection; ping 25 ms; senza il toggle LAN l'app mostra «Connected to Pebble cloud») |
| Build P (`MEMORY USAGE`) | 25.364 / 25.252 B (risorse 125.200 / 33.680) |
| Build M (define) | `GALLERIA_DEBUG_TIMING=1 GALLERIA_DEBUG_HEAP=1` → 26.280 / 26.168 B (04/09, dopo S8-perf: **27.756 / 27.644 B**; build P 26.256 / 26.144) |
| Wi‑Fi / rete | |

## O1 — Collegamento, installazione, screenshot

| Misura | Valore | Fonte |
|---|---|---|
| `pebble ping` ok, firmware | ✅ `Pong!`; fw v4.36.2 da `ping -vvv` (30/08) | |
| `heap main` used/free | 24 / 105.680 | |
| `storage: quota=` (persist_get_max_size) | **1.048.576** (esatta: album abilitato, 12 slot ok) | |
| `heap after first render` (layout A) | used 58.992 / **free 46.712** | |
| Screenshot | ✅ Anton su demo aurora, passi 7.509, 79%, «Dom 30 Ago» (it_IT) | `shot_s8_02.png` |
| Log PKJS visibili nel tool? (formato) | ✅ `[HH:MM:SS] pkjs> Galleria:193:28) [tag] …` (riga del bundle). **F-S8-1**: payload in ingresso a chiavi-NOME → fix `gv()` in `sync.js` (PIANO §4); dopo il fix handshake completo (HELLO→piano→fine) | |

## O2 — Sync di foto vere (Android)

| Giro | Foto (n tot.) | Payload pagina (KB) | Salva → HELLO (s) | Durata sync (s, orologio del tool) | Messaggi | `ch max/avg` (ms) | `photo` (ms) | `commit` (ms) | heap | Esito |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 46 KB delta (46.978 car.) | < 1 s | 3 s (22:17:25→28) | 14 (9 DATA, ack 111–308 ms) | 203 / 88 | 1.922 | 8 | 46.792 (identico) | ✅ c=0; foto a video subito; riletta da persist in 16 ms |
| 2 | 4 (+3) | ~140 KB delta | < 1 s | 17 s | 3×9 DATA | 426/224 → 1426/483 → 886/631 (**crescono col file**) | 3.188 / 5.402 / 6.804 | 20 / 31 / 54 | 46.792 | ✅ 3/3 ok; nessun WARNING |
| 3 | 9 (+5) | ~235 KB delta (235.343 car., `payload applicato` 106 ms) | < 1 s | 2 min 32 s | 5×9 DATA (+1 dup) | fino a 13.297 / **3.940** (super-lineare) | 8.297 / 18.590 / 23.145 / 31.321 / **43.570** | 106→218 | 46.792 | ✅ 5/5; 1 `inbox dropped (64)` recuperato dal retry; 2 riavvii della watchface A METÀ sync → ripresa dall'offset giusto |
| 4 | 12 (+3) | ~140 KB delta (`payload applicato` 58 ms) | < 1 s | 2 min 32 s | 3×9 DATA | 5.035/2.531 → 5.781/4.940 → **6.879/5.867** | 24.774 / 46.414 / **54.894** | 293 / 347 / 414 | 46.792 | ✅ 3/3, `SYNC_DONE`, album 12/12 ordine giusto; riavvio a inizio foto 10 → ripresa ok |
| 5d | 12 in un solo Salva (~550–600 KB) | | | | | | | | | |

## O3 — Persist reale

| Foto nell'album | File persist stimato (KB) | Lettura foto (`photo: … ch 134 N ms`) min/avg/max | Scrittura per chunk (`ch max/avg` della END) | Note (compattazione, `STORAGE_ERR`) |
|---|---|---|---|---|
| 1 | ≈ 36 | | | |
| 4 | ≈ 140 | 24–27 ms (dopo riavvio; 16 ms con 1 foto) | avg per messaggio 224→631 ms nel riempimento iniziale (≈ 14→39 ms a chiave nuova: il file cresce a ogni chiave) | commit 20→54 ms; da vedere se la sovrascrittura (chiavi esistenti) resta cara |
| 8 | → 9 foto, ≈ 320 | 230 ms subito dopo la sync (slot 7); **180–187 ms a freddo** (2 riavvii, slot 8) | avg/messaggio 723→**3.940** ms nel riempimento (≈ 45→246 ms a chiave nuova) | ack BLE mediana 1.113 ms, max 15.658; **entrambi i criteri §6 scattati** (scrittura ≫ 250, lettura > 200): decidere dopo il giro a 12 + prova di sovrascrittura |
| 12 | ≈ 430 | 78 ms slot 0 subito dopo la sync (vedi la nota qui sotto: il costo dipende dalla **dimensione del file**, non dallo slot) | ultima chiave nuova ≈ **367 ms** (avg 5.867/16); riempimento completo 12 foto ≈ 4 min 40 s di trasferimento | commit fino a 414 ms; nessun errore in tutta la serie. **Sostituzione** (✕ + nuova foto, slot 8, file pieno ~430 KB): **37,9 s** (~4,2 s/messaggio, ~262 ms a chiave GIÀ esistente) → la degradazione è **strutturale** (dimensione del file), non solo del primo riempimento |

> **Correzione (S8-perf, 04/09/2026).** La prima lettura di questa tabella diceva che «il costo di lettura dipende dalla posizione dello slot»: **è sbagliato**. Le letture di chunk costano in base alla **dimensione del file** (numero di pagine PFS attraversate a ogni passo dell'iteratore), non a dove sta lo slot: il firmware apre i settings file senza page cache e `pfs_seek` azzera `curr_page`, così ogni ricerca di chiave ricammina la catena delle pagine da 4 KB. I **180–230 ms** annotati sopra sono **tempo di parete sotto carico** (letture fatte all'avvio o subito dopo una sync, mentre il firmware sta facendo altro), non costo persist puro: **a riposo, con 12 foto, lo slot 8 sta a 55 ms**. Analisi completa e rimedio in `apps/galleria/PIANO.md` §4 (esito S8-perf) e §6 (D18).

## O4 — Timing reale (build M)

| Piattaforma | Layout/font | `draw` fascia (n / min / avg / max / p95 ms) | `draw` full | `tick` (avg / max) | Quick View | Content size | Giudizio (< 10 ms?) |
|---|---|---|---|---|---|---|---|
| emery | A Anton | | | | | | |
| emery | A LECO | | | | | | |
| emery | B Anton | | | | | | |
| flint | A Anton | | | | | | |
| flint | A LECO | | | | | | |
| flint | B Anton | | | | | | |

### O4b — Avvio/uscita (S8-perf, 04/09/2026)

> Prova del rimedio **D18** (schema persist 2) sull'orologio reale, la sera del 04/09 con l'utente: album di 4 foto, intervallo 180 min, shake ON, batteria 56 %. Righe `init:`/`deinit:` della build M (sezione 13 di `tools/galleria_logstats.py --md`). Log: `apps/galleria/run_s8_07_baseline.log` (versione vecchia, schema 1), `run_s8_09_new.log` (build M sullo **stesso** file persist, dopo migrazione), `run_s8_10_fresh.log` (build M dopo **rimozione dell'app dal telefono e reinstallazione** = file persist nuovo).

| Condizione | `open` (ms) | `man` (ms) | `mod` (foto, ms) | `tot` init (ms) | `deinit` (ms) | `photo` (ms) | Note |
|---|---|---|---|---|---|---|---|
| Vecchia (schema 1, file gonfio) | ~2.000 (stimato) | ~400 (stimato) | — | **~3.000** (log a 1 s di risoluzione) | **~800** dopo uno shake | 410–457 | 4 foto ma **688 scosse** accumulate: 688 record morti della chiave 2 + le foto sostituite. A riposo lo stesso file si legge in 75 ms |
| Build M (schema 2) sullo **stesso** file | 2.145–2.160 | 0–4 | 434–453 | **2.710–2.750** (3 avvii: 2.710/2.750/2.723) | **12–16** | 414–434 | Migrazione riuscita (`schema=2`, impostazioni e shake conservati). Uscita risolta; l'avvio resta dominato dall'apertura del file **dentro il firmware** |
| Build M (schema 2) su file **nuovo** | 90–94 | 43–47 | 39–82 | **309–356** | **11–16** | 15–62 | Dopo rimozione + reinstallazione dell'app e risincronizzazione delle 4 foto. `set=7–12`, `sto=148–149`, `win=66–70`, `syn=19–23`; shake conservato dopo 13 s (`shk=1` al riavvio) |

Riga di riferimento della build M sullo stesso file: `init: open=2145 man=3 sto=2156 set=12 mod=434 win=66 syn=15 tot=2710 ms`; uscita `deinit: mod=0 fl=0 win=0 tot=12–16 ms` **anche subito dopo uno shake**.

**Letture.**
1. **L'uscita è risolta**: da ~0,8 s (scrittura della chiave 2 in `deinit` dopo uno shake) a **11–16 ms**, in tutte e due le condizioni. È il merito diretto di D18 (nessuna scrittura persist in `deinit` + `s_schema_ok`).
2. **L'avvio non si aggiusta da solo su un file già gonfio**: 2,1 s dei 2,7 s stanno in `open`, cioè nelle scansioni che il firmware fa dentro la prima syscall persist. Non è aggirabile dall'app: il file contiene i record morti delle 688 scritture della chiave 2 e delle foto sostituite, e il firmware compatta solo oltre ~615 KB fisici (mai raggiunti qui).
   > **Nota del 05/09 (F04)**: `open` non misura *solo* l'apertura. La prima chiamata persist è `persist_exists(0)`, quindi i 2.145 ms comprendono anche la **ricerca della chiave 0**, che dalla migrazione 1 → 2 in poi sta **in coda** al file (riscritta = appesa, alla prima scrittura dopo l'avvio che migra; questi tre avvii vengono dopo): fino a una scansione in più, che è anche il motivo per cui su questa riga `man=3` (il manifest, riscritto subito dopo, è a un passo dal cursore) mentre sul file nuovo il rapporto si inverte (`open=90 man=47`). Il totale `sto` = 2.156 ms e la conclusione non cambiano: la spesa è la scansione lineare del file gonfio, dovunque la si attribuisca fra `open` e `man`. È la ragione per cui la soglia dell'avviso nella config page è **proporzionale al numero di foto** (400 + 100 × n ms) e non un 1.000 fisso.
3. **Su un file nuovo il rimedio si vede tutto**: avvio **2,7 s → 0,31–0,36 s (−88 %)**, `open` 2.145 → 90–94 ms, lettura della foto 414–434 → 15–62 ms. Il vero nemico è quindi **il record morto**, e la versione nuova non ne produce più a ogni scossa né a ogni HELLO.
4. **Rimessa in ordine di un file già gonfio**: rimuovere l'app dall'app Pebble e reinstallarla. La rimozione cancella il file persist (verificato in `app_install_manager.c`: `APP_REMOVED` con `!app_upgrade` → `persist_service_delete_file`; un **aggiornamento** invece lo conserva). Le foto tornano dal telefono da sole: 4 foto in ~30 s (7,1–7,4 s a foto, `ch max 813–2539 avg 595–630`, commit 31–66 ms).

**Dopo la prova**: installata la **build P** (`build_s8/galleria_p.pbw`, schema 2) alle 20:38 per l'uso quotidiano.

Nota operativa: `pkill -f "pebble logs"` uccide anche la shell che lo lancia (già noto) → fermare il printer con `kill -INT $(pgrep -f "^pebble logs --phone")`.

## O5 — Colore automatico (foto vere + card)

| # | Foto / card | `mean` | `bad` % | `fg` | `halo` | Leggibile sul vetro? (sì/no, commento) | Sbagliata? |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |

Totale sbagliate su n: … → decisione soglie (spec §6).

## O6 — LUT sunlight (D6)

| Immagine | File |
|---|---|
| Foto del vetro alla luce del giorno | `docs/design/galleria/s8_lut_glass.jpg` |
| `pebble screenshot` (LUT) | `docs/design/galleria/s8_lut_screenshot.png` |
| Colori nominali | `docs/design/galleria/s8_lut_nominal.png` |
| Giudizio / decisione | |

## O7 — Batteria 48 h

| Watchface | % a 0 h | % a 24 h | % a 48 h | Stima "giorni" dell'app | Note (uso, notifiche, BT) |
|---|---|---|---|---|---|
| Galleria (A, Anton, 30 min, 12 foto) | 78–79% (30/08 ~23:00, dopo ~1 h di test intensi con Dev Connection accesa) | | | | inizio possibile stanotte |
| Sistema | | | | | |

## O8 — Robustezza sul campo

| Prova | Esito | Log |
|---|---|---|
| BT off 2 min → icona barrata | | |
| BT on → riconnessione, sync ripresa | | |
| App Pebble chiusa e riaperta | | |
| Sync interrotta a metà (telefono lontano) → ripresa | ✅ (variante migliore: 2 riavvii della watchface a metà foto → `foto 1/5` ripresa dall'offset, 0 corruzioni; + `inbox dropped (64)` con retry del telefono, `n=10`) | run_s8_05.log 22:27:35–22:29:47 |
| Riavvio orologio → foto e impostazioni | | |
| Riavvii spontanei (secondo `heap main`) | | |

## O9 — D5 (SDK 4.17)

| Misura | Valore |
|---|---|
| Firmware dell'orologio | v4.36.2 (≥ 4.32: la build 4.33.1 gira; D5 → proposta 4.33.1) |
| `.pbw` 4.17 installato e avviato | |
| Log identici alla build 4.33.1 | |
| Decisione | |

## O10 — Config page sul telefono

> **05/09/2026 pomeriggio (revisione v1.9, build `galleria_p_rev.pbw` poi `galleria_p_rev2.pbw`)**: pagina aperta dall'app Pebble alle 15:49:41 (URL `data:` 117.206 car., stato nell'hash 12.560), chiusa dopo 22,1 s con risposta di 215 car., `payload applicato in 10 ms`; **nessun avviso «Galleria si avvia lentamente»** (utente: «il riquadro giallo non c'era») con `HELLO.OPEN_MS` 121 ms e 4 foto (soglia D27 = 800 ms); Font «Francois One» + Stile «trasparente 3D» salvati dalla pagina e **applicati sull'orologio senza riavvio** (`docs/design/galleria/rev19_watch_francois_3d.png`); al riavvio `settings: persist font=4 sty=2`, heap dopo il primo render 44.100 B, `open=94ms`. **F-S8-2**: `pebble logs` morto alle 15:50:04 (`UnicodeDecodeError … position 81`) sulla riga `[album] piano: … impostazioni sì`: l'app dimensiona il payload del log in caratteri e manda byte UTF-8 → un byte perso per ogni accento; mitigato con log PKJS solo ASCII.

| Misura | Valore |
|---|---|
| Apertura pagina (s), con n miniature | ✅ URL `data:` 98.555 car. (0 miniature): la WebView la apre; ~71,8 s passati nella pagina (incluso l'uso) |
| File input: selettore, foto EXIF ruotata ok | ✅ selettore ok, foto scelta e ritagliata (passo 3) |
| Editor touch (pinch, trascinamento) | |
| Anteprime font visibili | |
| Salva con payload delta ≈ 50 / 140–190 KB e pieno ~550–600 KB (passo 5d) → tempo fino a `HELLO` | 46 KB: `webviewclosed` → HELLO nello stesso secondo |
| `[config] payload applicato` (ms) con 1 / 4 / 8 / 12 foto | 1 foto: **15 ms** |
| Limiti incontrati | |

## O11 — Pebble 2 Duo (flint)

| Misura | Valore |
|---|---|
| Firmware, `heap main`, quota | |
| Sync 1–2 foto raw1 (ms) | |
| `draw` A Anton / A LECO / B (ms) | |
| Colore su 5 foto | |

## Decisioni prese (spec §6)

| Decisione | Esito | Data |
|---|---|---|
| D5 SDK | | |
| D6 LUT | | |
| Chunk AppMessage | parte non-persist ~125 ms/msg a file piccolo: da solo non giustifica 6.400; da rivalutare dentro il rimedio persist | 30/08 |
| Slot / persist | rilevato il 30/08: scritture a chiave nuova 5,5→367 ms e sostituzione 262 ms/chiave con file da 430 KB; letture 78–230 ms (dipendono dalla **dimensione del file**, vedi la correzione in O3). **Rimedio applicato il 04/09 (S8-perf): schema persist 2** — un solo record di metadati (manifest 234 B con impostazioni e `shake_offset` dentro), migrazione una tantum dalle chiavi 2/10, nessuna scrittura persist in `deinit`, shake **non più persistito** (D19 della seconda tornata del 04/09: solo RAM, `shake_offset` resta 0; il debounce da 10 s vale solo per le impostazioni): taglia le ricerche di chiave all'avvio e all'uscita, **non** il tempo per foto della sync. Numero di slot invariato (12). Vedi `apps/galleria/PIANO.md` §6 **D18**; **verificato sul campo la sera del 04/09** (O4b): uscita 11–16 ms, avvio 2,7 s sul file gonfio e **0,31–0,36 s su file nuovo** (−88 %). Su un file già gonfio l'unica cura è **rimuovere e reinstallare l'app** (le foto tornano dal telefono in ~30 s per 4 foto). Restano da decidere con l'utente: avvio in due fasi + foto a fette (ora vale meno: 0,3 s), tetto al numero di foto lato telefono, issue a coredevices/PebbleOS (page cache sui settings file + compattazione a soglia di spazio morto), `raw4`, chunk adattivo | 30/08 · **04/09** |
| Soglie luma | | |
| Riga info flint | | |
| Backoff PKJS | | |
| Batteria | | |

## S8b — iPhone (dopo Android; spec §5)

| Misura | Valore |
|---|---|
| iPhone (modello, iOS, versione app Pebble) | |
| Trasporto (`--phone` / `--cloudpebble`) | |
| O1: ping, firmware, install, log | |
| O10: pagina `data:` (~100–200 KB) si apre in WKWebView? | |
| O10: `<input type=file>` apre la libreria? | |
| O10: Salva ≤ 200 KB ok? close URL con 500 KB? | |
| O2: sync di 1–2 foto | |
| O8: sync con app in background 5 min (PKJS sospeso?) | |
| `localStorage` (NSUserDefaults) con 12 foto | |

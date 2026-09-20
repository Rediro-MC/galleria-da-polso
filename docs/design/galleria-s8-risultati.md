# Galleria — S8: risultati sul campo (tabella da compilare)

> Unico posto dove finiscono i numeri misurati sull'orologio reale (spec `galleria-s8-hardware.md` §2.6). Ogni riga cita il file di log (`apps/galleria/run_s8_*.log`, riassunto con `python3 tools/galleria_logstats.py --md`) e lo screenshot. Vuoto = non ancora misurato.

> **Nota (17/09/2026) — che cosa manca e dove va il resto.** Le celle vuote sono misure **mai fatte**, non
> dimenticanze: restano senza numeri **O4** (timing della build M sul vetro), **O5** (colore automatico su 20 foto
> vere e sulle test card), **O6/D6** (LUT sunlight), **O7** (batteria 48 h) e **O11** (Pebble 2 Duo reale), più la
> parte di **O8** che chiede BT off/on, app chiusa e riavvio dell'orologio; **O9** è chiuso per *decisione* (U5 del
> 05/09/2026: D5 sull'SDK 4.33.1) e non per misura. L'elenco con i passi del runbook che li produrrebbero sta in
> `galleria-s8-hardware.md` §9.
>
> Il **gate sul telefono della 0.4.0** (UX-4, runbook `galleria-s13-ux4-gate-telefono.md`, prove P01–P20) non
> rifà questa tabella: i numeri nuovi dell'orologio (heap, tempi di sync, `open`) si aggiungono **qui**, mentre
> l'esito prova per prova va nella riga di risultato del runbook (§3) e da lì in `apps/galleria/PIANO.md` §8
> e nel riassunto di `docs/design/galleria-s13-ux-casual.md` §15.

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
| Screenshot | ✅ Anton su demo aurora, passi 7.509, 79%, «Dom 30 Ago» (it_IT) | `galleria/s8_02_emery_a_anton_reale.png` (dall'orologio reale) |
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
| Vecchia (schema 1, file gonfio) | ~2.000 (stimato) | ~400 (stimato) | — | **~3.000** (log a 1 s di risoluzione) | **~800** dopo uno shake | 410–457 | 4 foto ma **688 scosse** accumulate (`shk=688`, il contatore): record morti delle 12 foto tenute nei giorni prima (chiavi mai cancellate) e delle foto sostituite, più le riscritture della chiave 2 (4 B, al più una per uscita: nota del 20/09 sotto). A riposo lo stesso file si legge in 75 ms |
| Build M (schema 2) sullo **stesso** file | 2.145–2.160 | 0–4 | 434–453 | **2.710–2.750** (3 avvii: 2.710/2.750/2.723) | **12–16** | 414–434 | Migrazione riuscita (`schema=2`, impostazioni e shake conservati). Uscita risolta; l'avvio resta dominato dall'apertura del file **dentro il firmware** |
| Build M (schema 2) su file **nuovo** | 90–94 | 43–47 | 39–82 | **309–356** | **11–16** | 15–62 | Dopo rimozione + reinstallazione dell'app e risincronizzazione delle 4 foto. `set=7–12`, `sto=148–149`, `win=66–70`, `syn=19–23`; shake conservato dopo 13 s (`shk=1` al riavvio) |

Riga di riferimento della build M sullo stesso file: `init: open=2145 man=3 sto=2156 set=12 mod=434 win=66 syn=15 tot=2710 ms`; uscita `deinit: mod=0 fl=0 win=0 tot=12–16 ms` **anche subito dopo uno shake**.

**Letture.**
1. **L'uscita è risolta**: da ~0,8 s (scrittura della chiave 2 in `deinit` dopo uno shake) a **11–16 ms**, in tutte e due le condizioni. È il merito diretto di D18 (nessuna scrittura persist in `deinit` + `s_schema_ok`).
2. **L'avvio non si aggiusta da solo su un file già gonfio**: 2,1 s dei 2,7 s stanno in `open`, cioè nelle scansioni che il firmware fa dentro la prima syscall persist. Non è aggirabile dall'app: il file contiene i record morti delle 12 foto tenute nei giorni prima (chiavi mai cancellate dall'app), delle foto sostituite e delle riscritture della chiave 2, e il firmware riscrive il file solo quando una scrittura supera la soglia di spazio (**630.458 B** per un file cresciuto a 512 KiB, mai raggiunta qui: nota del 20/09 sotto).
   > **Nota del 05/09 (F04)**: `open` non misura *solo* l'apertura. La prima chiamata persist è `persist_exists(0)`, quindi i 2.145 ms comprendono anche la **ricerca della chiave 0**, che dalla migrazione 1 → 2 in poi sta **in coda** al file (riscritta = appesa, alla prima scrittura dopo l'avvio che migra; questi tre avvii vengono dopo): fino a una scansione in più, che è anche il motivo per cui su questa riga `man=3` (il manifest, riscritto subito dopo, è a un passo dal cursore) mentre sul file nuovo il rapporto si inverte (`open=90 man=47`). Il totale `sto` = 2.156 ms e la conclusione non cambiano: la spesa è la scansione lineare del file gonfio, dovunque la si attribuisca fra `open` e `man`. È la ragione per cui la soglia dell'avviso nella config page è **proporzionale al numero di foto** (400 + 100 × n ms) e non un 1.000 fisso.
   > **Nota del 20/09/2026 (F28)**: **688 è il valore del contatore delle scosse** (`shk=688` nel log), non un numero di record: il record della chiave 2 (4 B, 16 B su flash) veniva riscritto **solo in `deinit`** e solo se il contatore era cambiato (`model.c` al commit `9afe0f0`, riga 221), quindi al più una volta per uscita. Il file gonfio conteneva soprattutto i **~1.600 record delle 12 foto** tenute cinque giorni prima (l'app non cancellava le chiavi) più le 4 foto correnti, ~600 KB stimati; la soglia di riscrittura è **630.458 B** per un file cresciuto a 512 KiB, non «~615 KB». Dettagli in `galleria-s9-issue-pebbleos.md` §«Verifica del 20/09/2026»: l'issue #2106 rimanda a questo file per le misure.
3. **Su un file nuovo il rimedio si vede tutto**: avvio **2,7 s → 0,31–0,36 s (−88 %)**, `open` 2.145 → 90–94 ms, lettura della foto 414–434 → 15–62 ms. Il vero nemico è quindi **il record morto**, e la versione nuova non ne produce più a ogni uscita dopo una scossa né a ogni HELLO.
4. **Rimessa in ordine di un file già gonfio**: rimuovere l'app dall'app Pebble e reinstallarla. La rimozione cancella il file persist (verificato in `app_install_manager.c`: `APP_REMOVED` con `!app_upgrade` → `persist_service_delete_file`; un **aggiornamento** invece lo conserva). Le foto tornano dal telefono da sole: 4 foto in ~30 s (7,1–7,4 s a foto, `ch max 813–2539 avg 595–630`, commit 31–66 ms).

**Dopo la prova**: installata la **build P** (`build_s8/galleria_p.pbw`, schema 2) alle 20:38 per l'uso quotidiano.

Nota operativa: `pkill -f "pebble logs"` uccide anche la shell che lo lancia (già noto) → fermare il printer con `kill -INT $(pgrep -f "^pebble logs --phone")`.

## O5 — Colore automatico (foto vere + card)

> 🔁 **19/09/2026 (S14/D140) — R11 chiusa senza questa tabella.** Su decisione esplicita dell'utente
> («F01 – procedi») la soglia dell'alone automatico è passata da `>` a `>=`: l'alone si accende già al
> **15 % esatto** di pixel in conflitto, in tutte e cinque le copie della regola (`src/c/luma.c`,
> `src/c/ui_time.c:prv_apply_text_style`, `src/pkjs/config/preview.js`, `tools/photo_prep.py`,
> `tools/gen_test_cards.py`; `LUMA_HALO_PCT` resta **15** e una tripwire `grep` in `make -C test pagecheck`
> tiene allineate C e JS). Chiude **R11** di `apps/galleria/PIANO.md` §7.1 — che rimandava la scelta
> «`>=` oppure `LUMA_HALO_PCT` 12–13» proprio a **O5** —, **senza** che O5 sia stato fatto: la spinta erano
> le card **c7b** e **c8b** a freddo (le sole righe di campo a `bad = 15` esatto), giudicate illeggibili sul
> vetro il 30/08/2026. **Questa tabella resta vuota e resta da fare**: O5 (20 foto vere, stile pieno,
> layout A) e O6 sono ancora l'unico modo di tarare davvero soglie e LUT, e servirebbero se un giorno si
> volesse toccare `LUMA_HALO_PCT` invece del solo confronto.

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

> **05/09/2026 pomeriggio (revisione v1.9, build `galleria_p_rev.pbw` poi `galleria_p_rev2.pbw`)**: pagina aperta dall'app Pebble alle 15:49:41 (URL `data:` 117.206 car., stato nell'hash 12.560), chiusa dopo 22,1 s con risposta di 215 car., `payload applicato in 10 ms`; **nessun avviso «Galleria si avvia lentamente»** (utente: «il riquadro giallo non c'era») con `HELLO.OPEN_MS` 121 ms e 4 foto (soglia D27 = 800 ms); Font «Francois One» + Stile «trasparente 3D» salvati dalla pagina e **applicati sull'orologio senza riavvio** (screenshot dal vetro non pubblicato: sfondo con una foto personale dell'utente, rimosso dal repo il 05/09/2026); al riavvio `settings: persist font=4 sty=2`, heap dopo il primo render 44.100 B, `open=94ms`. **F-S8-2**: `pebble logs` morto alle 15:50:04 (`UnicodeDecodeError … position 81`) sulla riga `[album] piano: … impostazioni sì`: l'app dimensiona il payload del log in caratteri e manda byte UTF-8 → un byte perso per ogni accento; mitigato con log PKJS solo ASCII.

| Misura | Valore |
|---|---|
| Apertura pagina (s), con n miniature | ✅ URL `data:` 98.555 car. (0 miniature): la WebView la apre; ~71,8 s passati nella pagina (incluso l'uso) |
| File input: selettore, foto EXIF ruotata ok | ✅ selettore ok, foto scelta e ritagliata (passo 3) |
| Editor touch (pinch, trascinamento) | |
| Anteprime font visibili | |
| Salva con payload delta ≈ 50 / 140–190 KB e pieno ~550–600 KB (passo 5d) → tempo fino a `HELLO` | 46 KB: `webviewclosed` → HELLO nello stesso secondo |
| `[config] payload applicato` (ms) con 1 / 4 / 8 / 12 foto | 1 foto: **15 ms** |
| Limiti incontrati | |

**S12 (06/09/2026, 13:03–13:07, Android)**: config page in **base64** con le maschere delle cifre nell'hash → URL **198.455** caratteri (4 foto in album) e **201.484** (5 foto): si apre; sezione «Anteprima» con foto aggiunta, occhio, cambio font/stile ok; Salva → foto in 9 messaggi / 14,1 s (chunk medi 1.410 ms, max 5.414: molto più lenti del 05/09; telefono lontano o occupato?). Log `apps/galleria/run_and_s12_0[12].log`. iPhone: da provare con la nuova pagina.

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

**Primo test: 06/09/2026, 09:38–09:53** (interrotto dall'utente dopo i test 1–5; 6–8 non fatti). Galleria **0.2.0 dallo store**, PT2 firmware **v4.36.2**, lingua dell'orologio it_IT, album dell'iPhone vuoto all'inizio. Log in `apps/galleria/run_ios_0*.log` (ignorati da git: contengono seriale e coordinate di un'altra watchface).

| Misura | Valore |
|---|---|
| iPhone (modello, iOS, versione app Pebble) | non annotati (da chiedere all'utente) |
| Trasporto (`--phone` / `--cloudpebble`) | `--phone <IP>` via LAN (porta 9000): `Pong!` al primo colpo. La Dev Connection dell'app iOS **cade spesso**: dopo la chiusura della pagina con sync, dopo riavvii ripetuti della watchface, al cambio di watchface, e quando l'app va in secondo piano (`Connection refused` finché lo switch non viene spento e riacceso). Rimedio usato: ciclo di ritentativi ogni 5 s (`for i in $(seq 1 120); do timeout -s INT 900 pebble logs --phone IP >> log; grep refused && sleep 5 || break; done`). |
| O1: ping, firmware, install, log | `WatchVersion v4.36.2`, avvio pulito: `heap init` 59.796 usati / **42.476 liberi** (layout A, demo). L'errore all'avvio riferito dall'utente **prima** del collegamento non si è ripresentato e non è in nessun log (causa ignota). I log PKJS arrivano con prefisso fisso `pkjs> Galleria:196:31` (riga del wrapper del bundle, non del sorgente). |
| O10: pagina `data:` (~100–200 KB) si apre in WKWebView? | **Sì, 4 aperture su 4** (rilettura dei log, 14/09/2026): URL **128.250** car. (album vuoto, stato 20.907, `run_ios_01.log:48`), **133.569** car. ×2 (1 foto, stato 26.226, `run_ios_03.log:30` e `:47`) e **138.249** car. (**2 foto**, stato 30.906, `run_ios_04.log:4` → chiusa con 220 car. dopo 5,6 s, `:5`): il massimo aperto finora su iPhone è **138.249**, non 133.569. Una **quinta** richiesta (128.249 car., album svuotato, `run_ios_04.log:33`) non ha una riga di chiusura: il log finisce lì con la caduta della Dev Connection, quindi non la contiamo. Contatore «**1 KB / 200 KB**»: cap iOS riconosciuto. Tempo di caricamento non cronometrato; tempo nella pagina 119,6 s / 94,4 s / 43,7 s / 5,6 s. |
| O10: `<input type=file>` apre la libreria? | **Sì**: 2 foto aggiunte dalla libreria (orientamento/EXIF non annotato). |
| O10: Salva ≤ 200 KB ok? close URL con 500 KB? | Ritorno via `pebblejs://close`: **49.806** e **49.327** car. (una foto ciascuno) e 218 car. (solo impostazioni) → `payload applicato` in 13 / 18 / 6 ms. **Non provato** il salvataggio con 4 foto (~185 KB, test 6) né 500 KB. |
| O2: sync di 1–2 foto | Foto slot 0: log interrotto al 4º chunk su 9 dalla caduta della Dev Connection, ma al riavvio `photo: slot 0 persist crc ok` (arrivata intera). Foto slot 1: **9 messaggi, 3.496 ms** (chunk ack 150–672 ms, media 249, max 547 visto dall'orologio; `commit 16 ms`). `SETTINGS` (cambio font) applicate in ~3 s senza riavvio; `ALBUM_ORDER` ok; luma: foto 1 bianco+alone (bad 32 %), foto 2 nero+alone (bad 20 %); rotazione `valid=2`; 9 scosse → cambio foto in **16–24 ms** l'una. |
| O8: sync con app in background 5 min (PKJS sospeso?) | non provato (test 8 interrotto: l'utente è passato a TimeStyle e la Dev Connection è caduta). Nota: con l'app in secondo piano cade anche la Dev Connection, quindi la misura richiede i contatori dell'orologio, non il log. |
| `localStorage` (NSUserDefaults) con 12 foto | non provato (album a 2 foto). |
| Heap a regime sull'orologio | A demo 42.476; **B Francois One + foto 36.900**; B Anton 38.580 (≈ 1,8 KB meno che in emulatore, D28 resta valida). |

**Da fare al prossimo incontro iOS** (runbook §8, in quest'ordine): test 6 = 4 foto in un solo salvataggio (contatore ~185/200 KB, chiusura della pagina con quel payload: D1); test 7 = lingua forzata «English» → «Sun 6 Sep» e passi con la virgola, poi «Automatica»; test 8 = app chiusa, riavvio della watchface, scosse; album a 12 foto e `localStorage` (⚠️ URL **non** «~160 k»: misurato al banco il 14/09/2026 con le miniature vere, **221.703** car. su emery e 198.020 su flint, fino a **292.908** / 269.225 con le miniature al tetto di 6.000 car. l'una — contratto UX-4 §2 —, cioè **da 1,6 a 2,1 volte** il massimo mai aperto su iPhone: è il gate U-18b); annotare modello iPhone/iOS/versione app; cronometrare l'apertura della pagina; una foto scattata in verticale (R15/O10).

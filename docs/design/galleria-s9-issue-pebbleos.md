# Bozza di issue a monte — coredevices/PebbleOS (rimedio S8-perf (c))

> **Stato: PUBBLICATA il 20/09/2026 come [coredevices/PebbleOS#2106](https://github.com/coredevices/PebbleOS/issues/2106)**
> (account GitHub **Rediro-MC**, `gh issue create`, **nessuna label**), dopo la verifica contro `main` 749c8cf
> (18/09/2026, tag più recente v4.37.0) e contro i log grezzi (F28). Scritta il **05/09/2026** (S9-prep, triage R18
> di `apps/galleria/PIANO.md` §7), riverificata il 20/09 con un workflow di 9 agenti Fable (6 verificatori adversariali
> sulle affermazioni tecniche + 3 lenti: manutentore, scettico sulla causa, sovrapposizioni). Template scelto: **Bug**
> (`.github/ISSUE_TEMPLATE/bug.yml`: la label `RFC` **non esiste** nel repo e le due issue RFC #1205/#1839 sono senza
> etichetta; la label `bug` esiste; l'account Rediro-MC ha solo `pull`, quindi le label via API vengono ignorate).
> Su richiesta esplicita dell'utente («procedi con invio ma aggiungi che l'issue è stato scritto da Claude») il corpo
> finisce con la dichiarazione che l'issue è stata **scritta da Claude, non da un umano**.
> Comando usato: `gh issue create -R coredevices/PebbleOS --title "<titolo>" --body-file <(sed -n '/^<!-- BODY-START -->/,/^<!-- BODY-END -->/p' docs/design/galleria-s9-issue-pebbleos.md | sed '1d;$d')`.

## Perché (contesto nostro, non va nell'issue)

Rimedio (c) di S8-perf (`apps/galleria/PIANO.md` §4 «esito S8-perf» e §7; misure in `docs/design/galleria-s8-risultati.md`
**O4b** e **O3**): dall'app **non esiste una cura** al file persist che si gonfia — solo il firmware compatta, e solo
oltre ~615 KiB. Le tre mosse lato app sono già fatte (D18/D19: schema 2, shake solo in RAM, `OPEN_MS` nell'HELLO,
avviso `#slow` nella config page). Resta la cura vera, che è **a monte**.

## Ricerca dei duplicati (05/09/2026, sola lettura)

- `gh issue list -R coredevices/PebbleOS --search "<q>" --state all` con `q` ∈ {`settings file page cache`, `persist slow`,
  `pfs`, `settings_file`, `compaction`, `persist`, `page cache`, `curr_page`, `search_forward`, `dead space`,
  `storage slow`, `app launch slow`, `watchface slow`, `flash read performance`, `linear scan`,
  `persistent storage performance`} → **nessuna issue sul tema**. Uniche pertinenti come contesto:
  **#416** «Raise 4K storage limit» (CLOSED 30/04/2026: è l'issue che ha portato la quota a 1 MiB) e la PR **#1198**
  «open settings files as growable» (MERGED 30/04/2026).
- `gh pr list -R coredevices/PebbleOS --search "settings_file OR pfs OR page cache" --state all` → nessuna PR su page
  cache dei settings file (le PR `pfs`/`settings` trovate riguardano corruzione header, magic, race, non le prestazioni).
- `gh search code "OP_FLAG_USE_PAGE_CACHE" --owner coredevices` → il flag è usato **solo** da
  `src/fw/resource/resource_storage_file.c` (file di risorse, sola lettura) e da `tests/fw/services/test_pfs.c`.
- **Aggiornamento del 20/09/2026** (ricerche rifatte prima della pubblicazione): **nessuna issue né PR nuova** sul tema.
  Correzione della lettura del 05/09: la PR che ha portato la quota persist a 1 MiB e i settings file «growable» è la
  **#1197** «Raise 4K storage» (la **#1198** riguarda i blob DB). Nell'issue sono citate come contesto anche **#1279**
  (compattazione al boot, solo blob DB), **#1106** (stalli da compattazione dentro una scrittura, FIRM-1649), **#1839**
  (nessuna API file system per le app), **#2049** (slot pool solo kernel), **#2047** (driver flash: cambia il costo per
  lettura, non il numero di letture) e **#345** (`flash benchmark`).

## Cosa NON proporre (regola di `PIANO.md` §7)

La patch «far conservare `curr_page` a `pfs_seek()`» **corromperebbe il file system**: `curr_page` è la pagina fisica
dell'offset corrente, tenerla dopo un seek arbitrario fa leggere/scrivere sulla pagina sbagliata. Nella bozza la
scelta è **dichiarata esplicitamente** (sezione *What we are explicitly not proposing*), così nessuno ci arriva da solo
guardando dove si spende il tempo.

## Provenienza di ogni numero della bozza

| Numero | Fonte |
|---|---|
| intervalli **grezzi su 4 avvii** per ciascun file (**file gonfio / file fresco**): `open` **2.140–2.160 / 90–94 ms**, `tot` **2.707–2.750 / 309–356 ms**, `photo` **414–434 e 558–563 / 15–62 ms**, `deinit` 12–16 ms | `apps/galleria/run_s8_09_new.log` (file gonfio) e `run_s8_10_fresh.log` (stesso album, file persist nuovo) — 04/09/2026, PT2 reale, build M; **20/09/2026: i valori singoli della bozza (2.145/2.160, 2.710/2.750, 90/93, 343/352, 31–59) sostituiti dagli intervalli veri** |
| 2ª foto 3.188 ms (`ch avg 224`), 12ª foto 54.894 ms (`ch avg 5.867`) | `apps/galleria/run_s8_05.log` / `run_s8_06.log`, righe `sync: end` |
| sostituzione di una foto su file da ~430 KB: **37,9 s misurati dal telefono** (`run_s8_06.log:129`; ack 4,2–5,2 s per messaggio da 16 chiavi) ≈ **280 ms a chiave** | `docs/design/galleria-s8-risultati.md` §O3 (30/08/2026); **corretto il 20/09/2026**: era «262 ms a chiave» e non è una misura dell'orologio (nessuna riga `sync: end` per una sostituzione) |
| quota persist 1.048.576 B | `docs/design/galleria-s8-risultati.md` §O1 (`storage: quota=` dall'orologio) |
| 268 B per chunk da 256 B (header 8 + chiave 4 + valore) | `docs/ricerca/galleria/02-storage-png-persist.md` F12 |
| **688 = contatore degli shake** (`shk=688` in `run_s8_07_baseline.log`), **non** 688 record morti: il record di stato dello schema 1 era di **4 B** (16 B su flash) e veniva scritto **solo in `deinit`**; il file gonfio conteneva invece i **~1.600 record delle 12 foto precedenti** (chiavi mai cancellate) | `PIANO.md` §4, seconda tornata 04/09 (D19) + log grezzi; **corretto il 20/09/2026** (vedi sotto) |
| firmware v4.36.2, board obelix PVT | `docs/design/galleria-s8-risultati.md` intestazione |
| righe di sorgente PebbleOS | file scaricati con `gh api .../contents/<path>` (sola lettura); la bozza citava `main` del **05/09/2026**, le citazioni pubblicate sono rimappate su **`main` 749c8cf (18/09/2026), scaricato il 20/09/2026** |
| log grezzi `run_s8_{05,06,07_baseline,09_new,10_fresh}.log` | copie in `~/galleria-archivio-2026-09-17/logs-s8-persist/` (archivio locale fuori repo; gli originali erano nel Cestino della pulizia del 17/09) |

---

## Verifica del 20/09/2026 (F28) — che cosa è cambiato rispetto alla bozza del 05/09

- **Righe**: i file citati hanno avuto solo clang-format (b5dae343, 16/09), refusi (b15ff5b1) e rinomine di macro: la logica è
  identica e `settings_file.c` è **identico** fra il tag v4.36.2 (l'orologio) e `main` a meno della formattazione. Tutte le
  citazioni sono state rimappate su `main` 749c8cf (p.es. flag di apertura `settings_file.c:129`/`:137`, `pfs_seek`
  `pfs.c:1114-1117`, `scan_to_offset` `pfs.c:906-956`, iteratore `settings_raw_iter.c:144-156`, soglia `settings_file.c:517-529`).
- **Byte utili per pagina PFS: 4.068, non 4.084** (`PageHeader` = 28 B, `pfs.c:76-86`, `free_bytes_in_page()` `:283-285`).
- **I 2,1 s della prima chiamata persist sono 2–3 passate, non 2**: `compute_stats()` lascia l'iteratore sull'EOF, la ricerca
  della chiave 0 riparte dal primo record e sul file migrato la chiave stava in coda (terza passata). Calibrazione dai log:
  una passata ≈ 45 ms sul file fresco a 4 foto (`man=43–47`), ≈ 0,35 s sul file da 430 KB, ≈ 0,7 s sul file gonfio.
- **Condizione di compattazione letta male il 05/09**: quando `used + dead + rec > max_space_total` il file viene **sempre**
  riscritto — raddoppiato (`prv_grow`) se i soli dati vivi non entrano, altrimenti compattato — e ogni riscrittura scarta i
  record morti; la soglia per un file cresciuto a 512 KiB è **630.458 B** (`pfs_sector_optimal_size`, riadottata a ogni
  apertura da `settings_file.c:91-97`), non «~614 KiB». Nulla compatta all'apertura o in background; #1279 lo fa solo per i
  blob DB di sistema.
- **Il file gonfio del 04/09 non era «4 foto + 688 record morti da 246 B»**: 688 è il **contatore** degli shake
  (`shk=688`), il record di stato dello schema 1 era di 4 B (16 B su flash) e veniva scritto solo all'uscita; il file conteneva
  i ~1.600 record delle 12 foto tenute 5 giorni prima (chiavi mai cancellate dall'app) più le 4 foto correnti: ~600 KB stimati.
- **Numeri per chiave**: 224 → 5.867 ms per messaggio da 16 chiavi = ~15 → ~390 ms per chiave sulle 134 (9 messaggi, l'ultimo
  da 6); la sostituzione da 37,9 s è **misurata dal telefono** (~280 ms/chiave), nessuna riga `sync: end` lato orologio.
  Intervalli grezzi: open 90–94 / 2.140–2.160 ms, init 309–356 / 2.707–2.750 ms, foto 15–62 / 414–434 (558–563) ms, 4 avvii.
- **PR giusta**: la quota a 1 MiB e i settings file «growable» del persist sono la **#1197** «Raise 4K storage» (non la #1198,
  che riguarda i blob DB); da citare anche **#1279** (compattazione al boot, solo blob DB), **#1106** (stalli da compattazione
  dentro una scrittura, FIRM-1649), #1839 (nessuna API file system per le app), #2049 (slot pool solo kernel), #2047 (driver
  flash: cambia il costo per lettura, non il numero di letture).
- **Proposta 1 corretta**: la catena di pagine di un file PFS è **fissa alla creazione** (`pfs_write` non estende mai un file,
  la GC ripristina le pagine in posto), quindi la page cache costruita all'apertura non può invecchiare: via la variante
  «aggiornarla quando una scrittura aggiunge pagine»; resta la sola obiezione dell'heap corrotto (`pfs.h:86-91`).
- **Proposta 3**: «all'apertura» è sul percorso critico e un task in background non può farlo (`SettingsFile` non è
  thread-safe, mutex del persist): il momento giusto è `persist_service_client_close()` (`service.c:259-275`).
- **Log originali**: nel Cestino della pulizia del 17/09 (`~/.local/share/Trash/files/old/apps/galleria/run_s8_{05,06,07_baseline,09_new,10_fresh}.log`),
  copiati il 20/09/2026 in `~/galleria-archivio-2026-09-17/logs-s8-persist/` (archivio locale fuori repo, con un `README.txt`).

---

## Draft (English) — Bug template, copy from the title below

**Title:** `settings_file: every record step re-walks the PFS page chain; large persist files open in seconds`

<!-- BODY-START -->
**Is there an existing issue for this?**

- [x] I have searched the existing issues

Searched issues, PRs and discussions on 2026-09-20 (`settings_file`, `persist`, `pfs`, `page cache`, `compaction`, `dead space`, `storage slow`, `app launch slow`, ...): nothing reports this. Related: #416 and PR #1197 (persist quota 4 KiB -> 1 MiB, growable settings files), PR #1279 (boot-time compaction, only for the system blob DBs), PR #1106 (compaction inside a write traced to multi-second stalls, FIRM-1649).

### Current Behavior

On a Pebble Time 2 (PebbleOS v4.36.2) the time of every persist call grows with the number of records in the app's persist file, live or dead, until a watchface takes 2.7 s to start and a 34 KB photo takes 55 s to store. The app keeps up to 12 photos in persistent storage: 34,200 B each, i.e. 134 `persist_write_data()` of 256 B (`PERSIST_DATA_MAX_LENGTH`), so ~1,600 records of 268 B, ~430 KB of the 1 MiB quota. Timings are `time_ms()` around the persist calls, printed by the app and captured with `pebble logs --phone`; the whole-photo times and the 37.9 s below are wall-clock and include the Bluetooth round trips.

**1. Filling the album (12 photos, 2026-08-30).** The watch times the 16 `persist_write_data()` of each 4 KB chunk it receives: 224 ms per chunk while storing the 2nd photo (file ~70 KB), 5,867 ms per chunk while storing the 12th (~400 KB), same payload, same code path: about 15 ms -> 390 ms per new key (the slowest 16-key chunk of the 12th photo took 6.9 s). Wall-clock per photo went from 3.2 s to 54.9 s; the phone saw each 16-key message acknowledged in 0.24-0.60 s at the 2nd photo and in 4.2-5.2 s at the 12th, so the growth is inside the persist calls. Overwriting the 134 existing keys of one photo in that file then took 37.9 s (~280 ms per existing key, phone-side).

**2. The same 4-photo album on a fresh file and on a bloated one (2026-09-04).** Same four photos (536 live records, ~144 KB), same build, four starts each:

| measured at app start | fresh persist file | bloated persist file |
|---|---|---|
| first persist call (`persist_exists()` + `persist_read_int()` of one key; includes the lazy open of the file) | 90-94 ms | 2,140-2,160 ms |
| whole watchface `init()` (persist + settings + window) | 309-356 ms | 2,707-2,750 ms |
| reading one photo back (134 sequential `persist_read_data()`) | 15-62 ms (15-16 for the first photo written, 58-62 for the last) | 414-434 ms; 558-563 ms for a photo stored further into the file |

The bloated file had held 12 different photos five days earlier and still contained their ~1,600 chunk records (the app had not deleted the keys; `persist_delete()` would only have added ~1,600 tombstones, see 6 below), plus a few hundred rewrites of a 4-byte state record, one per wrist shake (the app no longer persists it). An app cannot read the size of its own persist file; the open time suggests ~600 KB. The only cure available to the user is to remove and reinstall the app: removal deletes the file (`app_install_manager.c:430-436` -> `persist_service_delete_file()`), an update keeps it.

**Why.** Line numbers refer to `main` at 749c8cf (2026-09-18); `4.36-branch` has the same code modulo formatting.

1. Settings files are opened `OP_FLAG_READ | OP_FLAG_WRITE`, without `OP_FLAG_USE_PAGE_CACHE` (`settings_file.c:129`, `:137`; persist files go through `settings_file_open_growable()`, `persist/service.c:222-223`).
2. `pfs_seek()` sets `curr_page = INVALID_PAGE` whenever the offset changes (`pfs.c:1114-1117`), so the next read walks the page chain again from `start_page`: one 3-byte flash read per 4 KiB page (`scan_to_offset()`, `pfs.c:906-956`; `get_next_page()`, `pfs.c:786-803`). Without the cache flag there is no closer starting point.
3. The record iterator seeks before every header read (`settings_raw_iter_next()`, `settings_raw_iter.c:144-156`), so visiting record *i* costs about offset_i / 4,068 flash reads (a page holds 4,068 data bytes, `pfs.c:283-285`), and one full pass over a file of N records on P pages costs about N x P / 2 reads: quadratic in the file size. Calibrated on this watch, one pass is ~45 ms on the fresh 4-photo file (~540 records, ~10,000 reads, so ~4.5 us per read), ~0.35 s on the 430 KB file (~85,000 reads) and, inferred from the 2.1 s, ~0.7 s on the bloated one.
4. Every lookup is such a walk: `settings_file_get_len()` / `settings_file_get()` -> `search_forward()` resumes at the current record and wraps around (`settings_file.c:357-379`, `423-454`), so a key that was never written always costs a full pass, and writing a new key is that pass plus the append (`settings_file.c:533-561`). Overwriting an existing key finds its record cheaply when keys are written in order but then walks to the EOF marker before appending (`settings_file.c:540-542`), which is why replacing a photo costs almost as much as adding one. `persist_read_data()` is `settings_file_get_len()` + `settings_file_get()` (`applib/persist.c:58-77`): about four chain walks per record, each proportional to the record's offset, which is the "reading one photo back" row.
5. The file is opened lazily on the app's first persist call (`persist/service.c:215-227`), and that call pays two full passes before the lookup itself: `bootup_check()` -> `cleanup_partial_transactions()` (`settings_file.c:99` -> `381-417`) and `compute_stats()` (`:123` -> `197-214`). `compute_stats()` leaves the iterator on the EOF marker, so the lookup that follows wraps around and walks from the first record to the key; on our file that key had been re-appended near the end, so the first call was three passes: the 2.1 s above. On the fresh file the same call is 90 ms and one pass (the manifest at the end of the file) is 43-47 ms.
6. Dead records are reclaimed only by a whole-file rewrite, and the rewrite is triggered by the space budget, never by the amount of dead data. An overwrite appends a new record and marks the old one dead; `persist_delete()` appends a 12-byte tombstone that is dead at once (`DELETED_LIFETIME (0 * SECONDS_PER_DAY)`, `settings_file.h:17`) and marks the old record dead too. A rewrite happens only inside a write, when `used_space + dead_space + rec_size > max_space_total` (`settings_file.c:517-529`): the file is doubled (`prv_grow()`, `:474-493`) if the live data alone no longer fits, otherwise compacted (`settings_file_compact()`, `:307-331`); both go through `settings_file_rewrite_filtered()` (`:216-301`, dead records skipped at `:260-262`). `max_space_total = pfs_sector_optimal_size(alloc_used_space * 12 / 10, ...)` (`:39`), adopted again from the on-flash size at every later open (`:91-97`). For a persist file that has grown to the 512 KiB step (a 12-photo album does, after six doublings) the threshold is 630,458 B: with 430 KB of live data ~200 KB of dead records are tolerated, with a 4-photo album on the same file ~490 KB, while every lookup walks past all of them. Nothing compacts at open or in the background: #1279 added boot-time and Debug-menu compaction, but only for the system blob DBs (`blob_db_compact_growable_dbs()`), never for a per-app persist file.

### Expected Behavior

A persist lookup should not cost one flash read per 4 KiB page before the record, and dead records should be reclaimed before they dominate the file. App start and per-key write time should not grow with the number of records already in the file.

### Steps To Reproduce

1. A watchapp that writes ~1,600 keys of 256 B with `persist_write_data()` (~430 KB), timing each write with `time_ms()`: the cost per new key grows from a few ms to a few hundred ms.
2. Relaunch it and time its first `persist_exists()`: seconds.
3. Overwrite the last 134 keys a few times (dead records) and relaunch again: the first call grows further although the live data is unchanged.

Off-device, `tests/fw/services/test_pfs.c`, `tests/fw/services/settings/test_settings_file.c` and `tests/fw/applib/test_persist.c` already drive these paths, and `settings_raw_iter.c` counts record steps under `UNITTEST`; counting `get_next_page()` calls per lookup (or reads in `tests/fakes/fake_spi_flash.c`, which counts writes and erases only) would make the regression measurable in CI. The `flash benchmark` console command (#345) or `src/fw/apps/demo/flash_prof` give the per-read cost.

### Version

v4.36.2 on the watch (the app logs `fw 4.36.2`, model `COREDEVICES_PT2`; board obelix, hardware rev 18). Code cited from `main` at 749c8cf.

### Host OS

N/A (the phone is not on the path)

### Watch

Pebble Time 2 (Obelix)

### Anything else?

**Proposed changes**, in the order we think is worth the effort:

1. **Open settings files with `OP_FLAG_USE_PAGE_CACHE`** (the two `prv_open()` calls at `settings_file.c:129` and `:137`). The cache already exists; its only in-firmware user is the read-only resource path (`resource_storage_file.c:78, 90, 142, 227, 239`). `allocate_page_cache()` walks the chain once at `pfs_open()` and keeps at most `MAX_PAGE_CACHE_ENTRIES (10) x 6 B` of kernel heap per open file (`pfs.c:1592`, `1622-1672`, `1845-1846`); `scan_to_offset()` then starts from the nearest cached run instead of `start_page` (`pfs.c:915-943`). It cannot go stale: a PFS file's page chain is fixed at creation (`pfs_write()` never extends a file, `pfs.c:1144-1146`; pages are allocated in `create_flash_file()`, `pfs.c:835-882`), garbage collection restores live pages in place (`garbage_collect_sector()`, `pfs.c:2002-2026`), and a settings file grows or compacts by being rewritten into a new file that gets its own cache at its own `pfs_open()`. What remains is the caveat in `pfs.h:86-91` (a corrupted cache entry could misdirect a write); if that matters, consult the cache in `pfs_read()` only and let `pfs_write()` keep re-walking from `start_page` (a write must then also ignore a `curr_page` inherited from a cached read, since `pfs_seek()` keeps it when the offset is unchanged, `pfs.c:1114-1116`). Record scans and key lookups are reads, so that keeps nearly all of the win. On our watch the first persist call (two passes plus a lookup) is 2.1 s of a 2.7 s app start, so this is where most of the win is.
2. **One pass at open instead of two.** `cleanup_partial_transactions()` and `compute_stats()` are back-to-back full iterations in `prv_open()` (`settings_file.c:99`, `:123`). Compute the stats in the same pass (when recovery compacts, the nested `prv_open()` of the rewritten file already computes them), or lazily before the first write, since they only feed the space check at `settings_file.c:514-517`. A self-contained ~2x win on the open, independent of PFS.
3. **Reclaim dead space on a ratio, not only on the space budget** (for example when `dead_space > used_space / 2`), at a predictable moment rather than inside the write that crosses the threshold: at open for a file whose ratio is bad, or better in `persist_service_client_close()` (`persist/service.c:259-275`), which runs in the process manager after the app has exited (an idle task cannot do it while the app runs: a `SettingsFile` is not thread-safe and sits behind the persist mutex). Compaction inside a write is already a known stall source (#1106), and #1279 already does a one-off compaction for the blob DBs; extending it to per-app persist files would remove the "remove and reinstall" cure.
4. **(Independent) An escape hatch for apps.** The persist API (`include/pbl/services/persist.h`) exposes neither the file's size nor any way to shrink or reset it; a public call meaning "discard my persist file and start over" (what `persist_service_delete_file()`, `persist/service.c:75-83`, already does on app removal) would let an app recover without asking the user to uninstall it.

**What we are explicitly not proposing.** Making `pfs_seek()` keep `curr_page` across an offset change. It looks like a two-line fix exactly in the hot spot, but `curr_page` is the physical page of the current offset and `pfs_read()` / `pfs_write()` address flash from it (`pfs.c:910`, `1073-1074`, `1160-1161`): keeping it after an arbitrary seek makes the next read or write land on the wrong page, i.e. silent file system corruption. Any speed-up here has to know which page the new offset is on: a page map (1), or a seek that walks forward from a still-valid `curr_page` when the target is at or after it (the chain is singly linked forward and the settings iterator only ever seeks forward), never a stale pointer.

**Why persist for photos.** It is the only writable storage the SDK gives an app (no `sys_pfs_*` / `sys_blobdb_*` syscalls, as #1839 also notes), and `PERSIST_DATA_MAX_LENGTH` is 256 B, so a 34 KB blob has to be 134 keys: the record count is imposed by the API. The 1 MiB quota from #416 / #1197 was sized for this kind of app, and the cost described here is per record, so it will hit any app that fills the quota with 256 B keys, photos or not. (#2049's flash slot pool is kernel-internal with no SDK surface, so it does not change the picture; #2047 changes the cost of each flash read, not how many reads a lookup makes.)

App: Galleria (MIT, https://github.com/Rediro-MC/galleria-da-polso; measurements and provenance in `docs/design/galleria-s8-risultati.md` there). We can run experiments on the watch and share the raw logs. Disclosure, with apologies: this issue was written by Claude (an AI), not by a human. The measurements are our own logs from the watch, and every code citation was re-checked against `main` 749c8cf before posting.
<!-- BODY-END -->

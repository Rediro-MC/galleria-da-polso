# Bozza di issue a monte — coredevices/PebbleOS (rimedio S8-perf (c))

> **Stato: BOZZA. Non aprire l'issue senza conferma esplicita dell'utente.** Scritta il **05/09/2026** (S9-prep, triage
> R18 di `apps/galleria/PIANO.md` §7). Quando l'utente dà l'ok: template **RFC** del repo
> (`.github/ISSUE_TEMPLATE/rfc.yml`, campi *Problem* / *Proposed change* / *Anything else?*, label `RFC`), account
> GitHub dell'utente, p.es. `gh issue create -R coredevices/PebbleOS --title "…" --body-file <(sed -n '/^## Draft/,$p' …)`.

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

## Cosa NON proporre (regola di `PIANO.md` §7)

La patch «far conservare `curr_page` a `pfs_seek()`» **corromperebbe il file system**: `curr_page` è la pagina fisica
dell'offset corrente, tenerla dopo un seek arbitrario fa leggere/scrivere sulla pagina sbagliata. Nella bozza la
scelta è **dichiarata esplicitamente** (sezione *What we are explicitly not proposing*), così nessuno ci arriva da solo
guardando dove si spende il tempo.

## Provenienza di ogni numero della bozza

| Numero | Fonte |
|---|---|
| `open` 2.145/2.160 ms, `tot` 2.710/2.750 ms, `photo` 414/434 ms, `deinit` 12–16 ms | `apps/galleria/run_s8_09_new.log` (04/09/2026, PT2 reale, build M) |
| `open` 90/93 ms, `tot` 343/352 ms, `photo` 31–59 ms | `apps/galleria/run_s8_10_fresh.log` (stesso album, file persist nuovo) |
| 2ª foto 3.188 ms (`ch avg 224`), 12ª foto 54.894 ms (`ch avg 5.867`) | `apps/galleria/run_s8_05.log` / `run_s8_06.log`, righe `sync: end` |
| sostituzione di una foto su file da ~430 KB: 37,9 s ≈ 262 ms a chiave | `docs/design/galleria-s8-risultati.md` §O3 (30/08/2026) |
| quota persist 1.048.576 B | `docs/design/galleria-s8-risultati.md` §O1 (`storage: quota=` dall'orologio) |
| 268 B per chunk da 256 B (header 8 + chiave 4 + valore) | `docs/ricerca/galleria/02-storage-png-persist.md` F12 |
| 688 record morti in ~5 giorni (contatore shake) | `PIANO.md` §4, seconda tornata 04/09 (D19) |
| firmware v4.36.2, board obelix PVT | `docs/design/galleria-s8-risultati.md` intestazione |
| righe di sorgente PebbleOS | file scaricati da `main` il 05/09/2026 con `gh api .../contents/<path>` (sola lettura) |

---

## Draft (English) — copy from the title below

**Title:** `settings/pfs: every key lookup re-walks the page chain — large persist files make app start and writes quadratic`

**Is there an existing issue for this?** — searched (`page cache`, `pfs`, `settings_file`, `compaction`, `persist`,
`curr_page`, `search_forward`, `dead space`, `persistent storage performance`, …): nothing on this. Closest context:
#416 (raise the 4K persist limit) and PR #1198 (open settings files as growable).

### Problem

On a Pebble Time 2 (PebbleOS **v4.36.2**, board obelix PVT) a watchface that keeps 12 photos in persistent storage
(12 × 134 records of 256 B ≈ 430 KB of a 1 MiB per-app quota) degrades until it is unusable, and **no app-side change
can fix it**. Timings below come from `time_ms()` around the persist calls, printed by the app and captured with
`pebble logs --phone` on the real watch (30/08 and 04/09/2026):

| operation | fresh persist file | same album, file bloated by ~5 days of normal use |
|---|---|---|
| first persist syscall of the app (`persist_exists()`) | **90–93 ms** | **2,145–2,160 ms** |
| whole watchface `init()` (persist + settings + window) | **343–352 ms** | **2,710–2,750 ms** |
| reading one photo back = 134 sequential `persist_read_data()` of 256 B | **31–59 ms** | **414–434 ms** |

Writing degrades with the size of the file, not with the amount of data written. Storing one 34 KB photo
(134 *new* 256 B keys) took **3.2 s** when it was the 2nd photo in the file (~70 KB) and **54.9 s** when it was the
12th (~400 KB) — same payload, same code path, ~14 ms → ~367 ms per key. Overwriting the 134 keys of an existing photo
in a 430 KB file took **37.9 s** (~262 ms per existing key).

Reading `main` today, this is all explained by one thing — **every key lookup walks the file, and every record read
walks the page chain**:

1. Settings files are opened `OP_FLAG_READ | OP_FLAG_WRITE`, i.e. **without** `OP_FLAG_USE_PAGE_CACHE`
   (`src/fw/services/settings/settings_file.c:129-141`).
2. `pfs_seek()` sets `curr_page = INVALID_PAGE` on every offset change
   (`src/fw/services/filesystem/pfs.c:1142-1145`), so `scan_to_offset()` restarts from `start_page` and does one
   `get_next_page()` flash read per 4 KB page; without the cache flag there is no closer starting point
   (`pfs.c:927-980`).
3. The record iterator seeks before every header read — `sfs_seek(iter, hdr_pos + record_len, FSeekSet)` then
   `sfs_read(hdr, 8)` (`settings_raw_iter.c:145-153`) — so each of the N records costs `O(offset / 4084)` flash reads:
   **one full scan is quadratic in the file size**. On this watch a scan of a ~430 KB file is ≈ 0.3–0.4 s — which is
   what the ~367 ms measured for storing one *new* 256 B key in such a file is: one scan, then the append.
4. Every lookup is such a scan: `settings_file_get_len()` / `settings_file_get()` → `search_forward()`, which resumes
   at the current record and wraps around (`settings_file.c:359-381, 428-459`). A key that does not exist always costs
   a full scan.
5. The settings file is opened lazily on the app's first persist call (`src/fw/services/persist/service.c:208-231`) and
   that single syscall pays **two** full scans: `bootup_check()` → `cleanup_partial_transactions()` iterates the whole
   file (`settings_file.c:101` → `383-426`), then `compute_stats()` iterates it again (`settings_file.c:124` → `200-217`). That is the
   2.1 s `persist_exists()` above.
6. Dead records are effectively never reclaimed. An overwrite appends a new record and marks the old one dead;
   `persist_delete()` appends a tombstone that is dead immediately (`DELETED_LIFETIME (0 * SECONDS_PER_DAY)`,
   `include/pbl/services/settings/settings_file.h:17`) but still occupies a record. The only reclaim path is
   `settings_file_compact()`, which runs only when `used_space + dead_space + rec_size > max_space_total` **and** the
   file cannot grow (`settings_file.c:523-530`), where
   `max_space_total = pfs_sector_optimal_size(alloc_used_space * 12 / 10, …)` (`settings_file.c:40`). For a growable
   persist file (1 MiB max, 4 KiB initial: `persist/service.c:25-26, 226-228`) sitting on a 512 KiB allocation that
   threshold is ~614 KiB, so **hundreds of KB of dead records are tolerated** while every lookup pays for them.

The cost is per **record**, not per byte: in our case ~688 dead metadata records of 246 B, accumulated in ~5 days
(the app rewrote one small state record on every wrist shake — it no longer does), were enough, together with a few
replaced photos, to take the very same 4-photo album from a 0.34 s start to a 2.7 s start. The only cure available to the user is to **remove and reinstall the app** —
removal deletes the persist file, an update keeps it — which is not something a user can be expected to know.

flint / Pebble 2 Duo is not affected in practice (the same app keeps ~37 KB there), but the mechanism is the same and
the nRF52840 QSPI flash is much slower per read, so a large settings file there would be worse.

### Proposed change

In the order we believe is worth the effort:

1. **Use the page cache PFS already has for settings files.** `OP_FLAG_USE_PAGE_CACHE` exists and is used today only by
   resource files (`src/fw/resource/resource_storage_file.c`); `allocate_page_cache()` costs
   `MAX_PAGE_CACHE_ENTRIES (10) × 6 B = 60 B` of kernel heap per open file (`pfs.c:1636, 1668-1725`) and turns each
   chain walk into "jump to the nearest cached page, then a few hops". The header notes it should ideally be used for
   read-only files so that heap corruption cannot corrupt a file (`include/pbl/services/filesystem/pfs.h:87-92`), so a
   safe shape could be (a) build it at open and refresh it when a write appends pages, or (b) keep it in the
   settings-file *read* path only and drop it on any write, or (c) enable it only above some file size. On our watch
   the two scans inside the open account for 2.1 s of a 2.7 s app start, so this is where most of the win is.
2. **One scan at open instead of two.** `cleanup_partial_transactions()` and `compute_stats()` are two back-to-back
   full iterations inside `prv_open()` (called at `settings_file.c:101` and `:124`). Merging them into a single pass (compute the stats
   while checking for partially written records, recompute only if the recovery path actually rewrites the file) is a
   self-contained ~2× win on the open, independent of PFS.
3. **Compact on a dead-space ratio, not only when the space budget is exceeded.** For example also compact when
   `dead_space > used_space / 2`, or above a number of dead records — but **off the critical path**, since compaction
   is a whole-file rewrite that already pauses the watchdog for 60 s (`settings_file.c:235`): at open time for a file
   whose ratio is bad, or from an idle/background task, not inside the write that crosses the threshold.
4. **(Independent) An escape hatch for apps.** Today an app cannot shrink its own persist file: `persist_delete()` only
   appends. A public API meaning "discard my persist file and start over" (what `persist_service_delete_file()` already
   does on app removal) would let an app recover without asking the user to uninstall it.

### What we are explicitly *not* proposing

Making `pfs_seek()` keep `curr_page` across an offset change. It looks like a two-line fix exactly in the hot spot, but
`curr_page` is the physical page of the *current* offset: keeping it after an arbitrary seek makes the following read —
or write — land on the wrong page, i.e. silent file system corruption. Any speed-up here has to be a real
virtual→physical page map (proposal 1), never a stale pointer.

### Anything else?

- Watch: Pebble Time 2, PebbleOS v4.36.2 (obelix, PVT), phone app 1.11.0.3 (Android), app installed over the LAN
  developer connection. App: an SDK 4.33.1 watchface that stores up to 12 full-screen photos of 34,200 B each as
  256 B persist chunks (134 chunks per photo), i.e. the pattern any "many blobs in persistent storage" app produces
  now that the quota is 1 MiB.
- Reproducing it without our app: a watchapp that writes ~1,600 persist keys of 256 B (~430 KB) and then, on a fresh
  launch, times its first `persist_exists()` and a sequential read of 134 keys. On hardware the first call takes
  seconds. Off-device, `tests/fw/services/test_pfs.c` and `tests/fw/services/settings/test_settings_file.c` already
  drive these paths; counting flash reads per scan there would make the regression measurable in CI.
- We are happy to run any experiment on the watch and to publish the log files behind the numbers above.

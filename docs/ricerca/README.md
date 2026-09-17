# Ricerca di piattaforma (Fase 0) — indice

> **Snapshot del 24/08/2026, non aggiornato.** Sono i report a fonte primaria (con URL e data di
> consultazione) da cui è nato `PIANO-SVILUPPO-PEBBLE.md`. Dove contraddicono il sorgente del
> firmware o le misure fatte dopo (Fase 0, S8 sull'orologio reale), **vincono queste ultime**: le
> correzioni sono in `verifica.md` e in `PIANO-SVILUPPO-PEBBLE.md` §18 (changelog, voce v1.1).
> La ricerca specifica della watchface Galleria sta in `galleria/`, con un indice suo.

| File | Tema | Dove è ancora fonte viva |
|---|---|---|
| `platform.md` | lineup Core Devices, hardware PT2, piattaforme SDK, PebbleOS | §2 specifiche `emery`, §3 `targetPlatforms` e macro |
| `display.md` | pannello MiP, 64 colori, font di sistema, rendering | §4.3 contrasto sulla resa reale e §4.5 palettizzazione/dithering (citate da `PIANO-SVILUPPO-PEBBLE.md` §7.2 e da `apps/galleria/PIANO.md`) |
| `memory.md` | limiti di RAM per piattaforma, heap, costo di bitmap e risorse | budget RAM: §1 limiti, §3 bitmap/font, §7 cheat sheet |
| `offline.md` | offline-first, connettività, wakeup, DataLogging | §3 persist (limiti, costi, versioning, recupero) |
| `perf-battery.md` | CPU, costo del redraw, batteria, flag del compilatore | numeri confluiti in `PIANO-SVILUPPO-PEBBLE.md` §9 |
| `publishing-compat.md` | store, un solo codebase, `package.json`, QA | §3–§6 (multi-piattaforma, app legacy, metadati, checklist QA) |
| `toolchain.md` | SDK, pebble-tool, emulatore, CI, CloudPebble | quadro d'insieme; la procedura operativa è in `tools/README.md` |
| `community-examples.md` | ecosistema: repo di esempio, pacchetti npm, guide | conteggi deperibili; la conclusione (C nativo, non Alloy) è `PIANO-SVILUPPO-PEBBLE.md` §1 decisione 1 |
| `gap-1-memoria-emery.md` | mappa della RAM di `emery`, affidabilità di «Free RAM», sonda | modello dell'heap: §1 e §6 (l'app sonda è `apps/heapprobe`) |
| `gap-2-firmware-minimo.md` | firmware minimo per SDK, degradazione delle API | firmware ≥ 4.32 per le app SDK 4.33.x (§2–§4), persist 1 MiB (§5) |
| `gap-3-emulatore-touch.md` | cosa è validabile in QEMU senza orologio, iniezione touch | touch in emulatore (§2) e matrice dei comandi `emu-*` (§3) |
| `verifica.md` | verifica adversariale del 24/08: sintesi leggibile | le tre liste dei punti da correggere (hardware, API, toolchain) |
| `verifica-risultati.json` | output grezzo della stessa verifica: 192 affermazioni con verdetto, evidenza e `source_url` | audit trail (176 confermate, 15 confutate, 1 incerta) e motivazione dei tre gap report; il file non porta un campo di data, la porta questa intestazione |

**Superato da (non leggere qui, leggere là):**

- pubblicazione nello store (`publishing-compat.md` §2) → `apps/galleria/store/PUBLISH.md` e `apps/galleria/store/LISTING.md`
  (API e comandi eseguiti davvero, con pebble-tool 5.0.40, il 05/09/2026).
- installazione dell'ambiente (`toolchain.md` §1 e §8, `platform.md` §8) → `tools/README.md`,
  `tools/setup-env.sh`, `tools/pebble-env.sh` e la sezione «Comandi» di `CLAUDE.md`.
- heap stimato → heap **misurato** in Fase 0: `docs/fase0/heapprobe-emery-4.33.1.log` (129.680 B liberi
  all'ingresso di `main`) e `docs/fase0/heapprobe-flint-4.33.1.log`, sintesi in `PIANO-SVILUPPO-PEBBLE.md` §3.

**Errata (vale per tutti i report):**

- **Firmware**: «ultima release v4.35.0 (19/08/2026)» è sbagliato già il 24/08 (era uscita la **v4.36.0**,
  `verifica.md`); sull'orologio di prova gira **v4.36.2**, uscito il 26/08/2026
  (`docs/design/galleria-s8-risultati.md`, «Ambiente del test»; la data di uscita è in
  `apps/galleria/README.md`).
- **pebble-tool**: i report dicono **5.0.39** (12 righe nel corpo di `toolchain.md`, più il titolo di `gap-3` §3);
  la versione installata e attesa da `CLAUDE.md` è **5.0.40**.
- **Emulatori**: la FAQ citata come dubbio («aplite, basalt, chalk, diorite, emery») è obsoleta: `flint` e
  `gabbro` funzionano, provati in Fase 0 (`docs/fase0/hello-emery-flint.png`, `hello-emery-gabbro.png`).

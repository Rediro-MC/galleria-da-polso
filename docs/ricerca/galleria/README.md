# Ricerca per la watchface Galleria (25–26/08/2026)

> **Documenti storici, output grezzo degli agenti.** Le **raccomandazioni** sono superate da
> `docs/design/galleria.md` e da `apps/galleria/PIANO.md`, che riportano le scelte davvero fatte; restano
> validi i **finding** con fonte primaria `file:riga`, ed è per quelli che questi file sono ancora citati
> dal codice. Le evidenze che rimandano a `scratchpad/…` **non sono più risolvibili**: quella cartella di
> sessione non esiste più, e i file e i cloni che citano non sono stati conservati.

Output grezzo della ricerca multi-agente (5 temi + verifiche adversariali) che ha portato a `docs/design/galleria.md`.
Ogni file: elenco di affermazioni con confidenza (`verified`/`likely`/`uncertain`) e flag `CRIT`, evidenza con riferimenti a file:riga
dei sorgenti (coredevices/mobileapp, PebbleOS, pebble-tool, pypkjs), una raccomandazione dettagliata (con snippet JS/C riusabili) e domande aperte.

| File | Tema | Ancora citato da |
|---|---|---|
| `01-trasferimento-config-page.md` | webview della config page nell'app Pebble (file input, `pebblejs://close#`, limiti), AppMessage/BLE, localStorage PKJS | F0–F2 (WebView in-app, `<input type=file>` su Android e iOS) restano la base del gate sul telefono di UX-4 |
| `02-storage-png-persist.md` | decoder PNG del firmware (vincoli), formati GBitmap, persist (costi, crescita, compattazione), sprite ricolorabili, budget RAM | `apps/galleria/src/c/storage.h` (F16) e `storage.c` (F14/F16), `docs/design/galleria-s9-issue-pebbleos.md` (F12) |
| `03-tipografia-cifre.md` | limite glifo 512 B, font di sistema (altezze reali), sprite vs .pbf vs PDC, font OFL, wireframe, pipeline `gen_digits.py` | nessuno per nome (solo il collettivo «01…07» di `docs/design/galleria.md` §11): il tool vivo è `tools/gen_digits.py` e i font scelti sono in `apps/galleria/CLAUDE.md` |
| `04-esempi-esistenti.md` | Fields of Gold (MIT), Retro Photo Face, img999, Face Boss, TimeStyle; misure persist su PT2 reale | `apps/galleria/src/c/ui_photo.h` e `ui_photo.c` (F12) |
| `05-colore-quantizzazione.md` | palette RGB222, LUT sunlight, dithering, encoder PNG8 in JS, colore testo automatico (C senza float, tabella LUM_SUN) | `src/c/luma.c` e `test/test_luma.c` (F14), `src/c/luma.h` (§3), `tools/photo_prep.py` e `tools/README.md` (§1.3–1.5 e §2), `apps/galleria/PIANO.md` (S6), `docs/design/galleria.md` §6 (rimanda a §1–2 per gli snippet della pipeline JS) |
| `06-verifiche-adversariali.md` | **10 blocchi di verdetto** (5 del 25/08 con il solo hash come titolo, `# v2:…`, + 5 del 26/08 con riga `CLAIM:`) per le 8 verifiche V1–V8 citate da `07`; **2 confutano in parte**: una pagina `data:` non può usare `localStorage` e il prefisso `data:` lo mette chi genera l'URL (V4, che porta anche `emu-app-config` 5.0.39: le pagine `data:` non si aprono affatto), nessun limite di lunghezza dell'URL documentato su iOS (V6) | nessuno per nome (solo il collettivo «01…07» di `docs/design/galleria.md` §11): le due confutazioni sono riassunte in `07` §7 |
| `07-brief-sintesi.md` | brief di sintesi v1.1 (architetto indipendente): decisioni, protocollo dettagliato, schema persist, wireframe con coordinate, struct C, messageKeys, budget, tappe | `docs/design/galleria.md`, `apps/galleria/PIANO.md` (input di S5a) |

Le decisioni prese a valle (e dove i report si contraddicono, chi ha vinto) sono in `docs/design/galleria.md` §2.

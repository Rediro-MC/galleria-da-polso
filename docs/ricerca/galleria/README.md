# Ricerca per la watchface Galleria (25–26/08/2026)

Output grezzo della ricerca multi-agente (5 temi + verifiche adversariali) che ha portato a `docs/design/galleria.md`.
Ogni file: elenco di affermazioni con confidenza (`verified`/`likely`/`uncertain`) e flag `CRIT`, evidenza con riferimenti a file:riga
dei sorgenti (coredevices/mobileapp, PebbleOS, pebble-tool, pypkjs), una raccomandazione dettagliata (con snippet JS/C riusabili) e domande aperte.

| File | Tema | Da usare in |
|---|---|---|
| `01-trasferimento-config-page.md` | webview della config page nell'app Pebble (file input, `pebblejs://close#`, limiti), AppMessage/BLE, localStorage PKJS | S5, S6 |
| `02-storage-png-persist.md` | decoder PNG del firmware (vincoli), formati GBitmap, persist (costi, crescita, compattazione), sprite ricolorabili, budget RAM | S2, S3, S4 |
| `03-tipografia-cifre.md` | limite glifo 512 B, font di sistema (altezze reali), sprite vs .pbf vs PDC, font OFL, wireframe, pipeline `gen_digits.py` | S1, S3 |
| `04-esempi-esistenti.md` | Fields of Gold (MIT), Retro Photo Face, img999, Face Boss, TimeStyle; misure persist su PT2 reale | S4, S5, S6 |
| `05-colore-quantizzazione.md` | palette RGB222, LUT sunlight, dithering, encoder PNG8 in JS, colore testo automatico (C senza float, tabella LUM_SUN) | S2, S6 |
| `06-verifiche-adversariali.md` | 8 verifiche indipendenti (6 confermate con precisazioni, **2 confutate in parte**: la pagina `data:` non può usare `localStorage`; `emu-app-config` 5.0.39 non apre pagine `data:`; nessun limite URL noto su iOS) | tutte |
| `07-brief-sintesi.md` | brief di sintesi v1.1 (architetto indipendente): decisioni, protocollo dettagliato, schema persist, wireframe con coordinate, struct C, messageKeys, budget, tappe | S1–S6 |

Le decisioni prese a valle (e dove i report si contraddicono, chi ha vinto) sono in `docs/design/galleria.md` §2.

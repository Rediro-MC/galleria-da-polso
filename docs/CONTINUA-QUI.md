# CONTINUA QUI — stato lavori progetto Pebble

> **Aggiornato: 18/09/2026.** Questo file dice **dove siamo** e **qual è il passo successivo**, e si legge in un
> minuto. Il dettaglio di ogni sessione (compiti per importanza, numeri, decisioni) sta in
> `apps/galleria/PIANO.md` §8 (stato ed esiti) e §4 (sessione per sessione): qui resta una riga per sessione.

## Stato corrente

- **Fase 0 (setup) chiusa il 24/08/2026, Fase 1 in corso**: la watchface **Galleria** (`apps/galleria`) è l'unica
  app in sviluppo; `apps/hello-emery` e `apps/heapprobe` restano come smoke test della CI e sonda di memoria.
- **0.4.0 PUBBLICATA nello store il 18/09/2026** (~00:50 locali; API `published_date` 2026-09-17T22:50 UTC) con
  `pebble publish --version 0.4.0` e le note di `store/release_notes_0.4.0.txt` (log locale `publish_040.log`,
  «Release created successfully», app `cdf80cc3bf6745b1a310e4c8`). Su richiesta esplicita dell'utente, che prima
  l'aveva provata sul PT2 reale via Android (install + screenshot ok); il **gate completo P01–P20 del runbook non
  è stato eseguito** (scelta dell'utente). ⚠️ **Manca il `PATCH title=Galleria` + descrizione** (`PUBLISH.md`
  §0.1): il permission mode l'ha bloccato («Create Public Surface»), quindi nello store il nome è ancora
  «Galleria for Pebble» e la descrizione è la vecchia — lo lancia l'utente (comando pronto in §0.1).
- **Ultima sessione, 18/09/2026 — prova sull'orologio reale + release 0.4.0**: install del `.pbw` UX-4 sul PT2
  via Android (`--phone 192.168.188.29`, IP nuovo; ping/install/screenshot ok, log a riposo vuoti = attesi),
  poi su richiesta dell'utente commit `6e79f6f` + tag `v0.4.0` + push (145 file: S11, S12, UX-1…UX-4, pulizia)
  e `pebble publish` della 0.4.0. Pre-publish rifatti tutti verdi: `make -C test`, `pebble clean && build`
  (29.080 / 28.968 B), `make_assets.py --check`, testi 795/697 B, `versionLabel 0.4.0`.
- **Sessione 17/09/2026 — lettura pre-gate ✅ al banco**: rieseguite le tre lenti alte di UX-4; runbook del
  gate 460 → **518 righe** (D134 «un orologio, due telefoni», D135 pin sull'asse y), `test_page` 2.687 / 2.712,
  C invariato **29.080 / 28.968 B**, pagina inlinata **85.476 B** (modulo `config_page.js` **88.284 B**).
- **17/09/2026 — pulizia del repo** per la pubblicazione su GitHub: tolti i percorsi personali e il nome
  dell'autore (resta «Rediro»), `nuova-app-galleria.txt` → `docs/design/galleria-richiesta-iniziale.txt`,
  screenshot ridotti a quelli citati per nome in un `.md` (politica: **un set per gate**, le varianti restano
  nell'archivio locale fuori repo), via i template Cursor e i testi di release mai uscite, `.gitignore` riscritto,
  nuovi indici `docs/design/README.md` e `docs/ricerca/README.md`. Copia pulita in `~/ProgettiClaude/Pebble-pulito`
  (build e test verdi), archivio di ciò che sparisce in `~/galleria-archivio-2026-09-17/`, rapporto e decisioni
  aperte in `~/ProgettiClaude/pulizia-2026-09-17/RAPPORTO.md`. **Su conferma dell'utente**: scambio delle cartelle,
  cancellazione della vecchia, commit e push (dettagli in `apps/galleria/PIANO.md` §4 «Pulizia del repo»).
- **Tutto committato e pushato**: commit `6e79f6f` + tag `v0.4.0` del 18/09/2026 (chiesti dall'utente) portano su
  GitHub tutto il lavoro da S11 alla pulizia del 17/09. **Commit e push restano solo su richiesta esplicita.**
- **CI**: 10 esecuzioni verdi fra il 30/08 e il 05/09/2026; il push del 18/09 è il primo passaggio in CI del
  lavoro da S11 in poi — **esito da controllare** su GitHub Actions.

## Prossimo passo — il PATCH del nome, poi (se si vuole) il gate sul telefono

1. **`PATCH title=Galleria` + descrizione nuova** (`apps/galleria/store/PUBLISH.md` §0.1): la release 0.4.0 è
   fuori ma il nome nello store è ancora «Galleria for Pebble». Lo lancia l'utente (in sessione basta
   `! <comando>`); poi verifica al punto 4 di §0.1.
2. Il **gate P01–P20** del runbook resta utile anche a release uscita (config page, flusso foto, P15 sull'iPhone
   con 12 foto): da fare quando l'utente vuole.

### Il gate sul telefono (runbook)

**Runbook: `docs/design/galleria-s13-ux4-gate-telefono.md`** (518 righe). Prima le **11 domande** di §1.1 (telefoni
e versioni, album di partenza, foto del gate, tedesco temporaneo, persona non tecnica, tempo), poi le **20 prove
P01–P20** su Android e iPhone, con Claude al banco per install, log e screenshot via `--phone <IP>`. Un orologio e
due telefoni: fra Android e iPhone l'album va svuotato (**D134**, §0 del runbook).

**P15 è la prova decisiva**: l'URL `data:` con 12 foto e miniature vere misura **221.703 caratteri su emery** e
198.020 su flint, contro i **138.249** aperti finora dall'iPhone. Se non regge, prima della release serve una
sessione a parte per l'**RLE delle maschere** (−28 k).

La **0.4.0 è già pubblicata** (18/09, su richiesta dell'utente senza il gate completo): del giro di release manca
solo il `PATCH title=Galleria` (`apps/galleria/store/PUBLISH.md` §0.1). I risultati del gate, quando si farà,
vanno in `apps/galleria/PIANO.md` §8 e in `docs/design/galleria-s13-ux-casual.md` §15.

## Da leggere a inizio sessione

1. `CLAUDE.md` (radice) e `apps/galleria/CLAUDE.md` — regole di progetto, regole di codice C, comandi.
2. **Piano a sessioni: `apps/galleria/PIANO.md`** — §8 «Stato» dice quale fare, **una per volta**; §4 il
   dettaglio, §5 la tabella memoria, §6 le decisioni, §7 i problemi aperti.
3. `docs/design/galleria.md` (design; D1–D48, con D14–D19 e D29 in `apps/galleria/PIANO.md` §6) e
   `docs/design/galleria-s13-ux-casual.md` (D49–D135); indice di tutte le specifiche in `docs/design/README.md`.
   Richiesta iniziale: `docs/design/galleria-richiesta-iniziale.txt`.
4. `PIANO-SVILUPPO-PEBBLE.md` (§1 decisioni, §3 numeri, §7–§10 regole, §15 rischi aperti, §17 istruzioni) e
   `README.md` (§«Ripartire su un computer nuovo», §«Struttura»).

## Le sessioni fatte, una riga ciascuna

Esito e numeri in `apps/galleria/PIANO.md` **§8**; il dettaglio dei compiti in **§4**. Le sessioni marcate «§4» non
hanno una voce propria in §8 (sono più vecchie della sezione).

- **25/08/2026 — S0** scaffold, ricerca multi-agente, `docs/design/galleria.md` v1.1, D1–D4. (§4)
- **26/08/2026 — S1** motore ora, layout A, riga info, `timefmt.c` puro; statico 5.172 B. (§4)
- **27/08/2026 — S2** sfondo foto raw6/raw1, colore testo automatico, alone; `photo_prep.py` v1. (§4)
- **27/08/2026 — S3** layout B e cifre sprite da 3 font OFL; 12 strip `2BitPalette`. (§4)
- **28/08/2026 — S4** persist (manifest + chunk), rotazione stateless, shake. (§4)
- **29/08/2026 — S5a** sync lato orologio: protocollo, `sync_proto.c`, una sola inbox da 4.153 B. (§4)
- **29/08/2026 — S5b** sync lato telefono: album in `localStorage`, motore, dev server. (§4)
- **29/08/2026 — revisione post `/code-review`**: 15 finding, 14 corretti.
- **30/08/2026 — S6** config page vera (ES5 inlinata) e pipeline immagine byte-esatta.
- **30/08/2026 — S7** QA, memoria e perf: heap layout B 29.944 → 43.472 B, log asciugati, asset store.
- **30/08/2026 — S8 preparazione** (spec, runbook, build P/M/4.17) e **prima serata sul campo** con Android + PT2.
- **02–04/09/2026 — S8-perf** persist schema 2: avvio 2,7 s → 0,31–0,36 s su file nuovo, uscita 11–16 ms; poi
  la seconda tornata della sera (v1.9: shake solo in RAM, `OPEN_MS` nell'HELLO, avviso «si avvia lentamente»).
- **04/09/2026 sera — S8-stile** due font nuovi (Francois One, Staatliches) e «ora trasparente» a 4 stili.
- **05/09/2026 — revisione v1.9**: 37 finding confermati e corretti; test sul campo lo stesso pomeriggio.
- **05/09/2026 sera — S9-prep** foto demo CC0, listing e comando `publish` pronti, 17 residui riletti.
- **05/09/2026 ore 20:41 — S9 pubblicazione**: **0.1.0 beta** nello store Core, repo pubblico, tag `v0.1.0-beta`.
- **05/09/2026 notte — S10 multilingua** EN/IT/DE/FR su pagina e orologio; **0.2.0 pubblicata** alle 23:16.
- **06/09/2026 mattina — analisi** anteprima nella config page e lingue es/pt (13 decisioni per l'utente).
- **06/09/2026 mattina — S8b iPhone, primo test** (interrotto dopo 5 prove su 8): la pagina `data:` **si apre**
  su iOS fino a 128–138 k caratteri.
- **06/09/2026 mezzogiorno — S11** spagnolo e portoghese sulla pagina e sulla data dell'orologio (D39–D42).
- **06/09/2026 pomeriggio — S12** anteprima «onesta» della watchface nella config page (D43–D48); gate Android
  superato con 198–201 k caratteri di URL.
- **12–13/09/2026 — analisi S13** «config page per un utente casual»: diagnosi, 18 voci U-01…U-18, D49–D67.
- **13/09/2026 pomeriggio — UX-1** parole, test sbloccati, tripwire, budget (D68–D79; 126 chiavi).
- **13/09/2026 sera — UX-2** struttura e aspetto della pagina (D80–D103; 132 chiavi, anteprima 1:1).
- **13/09/2026 notte — UX-3** il flusso della foto: editor, footer a stati, ✕ a due tocchi (D104–D125; 135 chiavi).
- **14/09/2026 — UX-4** gate sul telefono preparato, note di design, documenti e store (D126–D133; zero C).
- **17/09/2026 — lettura pre-gate**: le tre lenti alte di UX-4 rieseguite, runbook e numeri corretti (D134–D135).
- **17–18/09/2026 — pulizia del repo**: copia pulita, screenshot un set per gate, indici `docs/design`/`docs/ricerca`.
- **18/09/2026 — release 0.4.0**: prova sul PT2 reale via Android, commit `6e79f6f` + tag `v0.4.0` + push,
  `pebble publish` 0.4.0 nello store; resta il `PATCH title=Galleria` (utente, `PUBLISH.md` §0.1).

## Fase 0, ambiente, verifiche in emulatore

- **Ambiente e ripartenza su un computer nuovo**: `README.md` §«Ripartire su un computer nuovo» e
  `tools/setup-env.sh` (idempotente). Versioni e procedura verificata: `PIANO-SVILUPPO-PEBBLE.md` §5;
  ricerca sulla piattaforma e sulla toolchain in `docs/ricerca/` (indice in `docs/ricerca/README.md`).
- **Smoke test (24/08/2026, `apps/hello-emery`)**: `pebble build` (statico 833 B), install e screenshot su emery
  200×228, flint 144×168 e gabbro 260×260 (`docs/fase0/hello-emery-*.png`): tutti e 7 gli emulatori dell'SDK
  4.33.1 ci sono e `flint`/`gabbro` funzionano (la FAQ ufficiale ne elenca 5).
- **Sonda di memoria (24/08/2026, `apps/heapprobe`, emulatore SDK 4.33.1)**: `heap_bytes_free()` a `main`
  **129.680 B** su emery (1.368 B statici, build report 129.704 B) e **64.144 B** su flint (1.364 B statici,
  build report 64.172 B) → modello **heap ≈ 131.072 − statico − 24 B** (emery) e **65.536 − statico − 28 B**
  (flint), confermato; `malloc` massima riuscita **124 KiB** su emery e **32 KiB** su flint (128 KiB e 64 KiB →
  `NULL`), `GBitmap` full-screen −45.640 B (8 bit) / −3.400 B (1 bit); log completi in
  `docs/fase0/heapprobe-*.log`, sintesi in `PIANO-SVILUPPO-PEBBLE.md` §3. ❓ Da ripetere sull'orologio reale
  (atteso identico: stesso `Kconfig`).

## Cose NON fatte / da fare a mano

- **Gate sul telefono di UX-4** (P01–P20, serve l'utente): vedi «Prossimo passo» qui sopra.
- **O7, batteria 48 h**: mai misurata (in `docs/design/galleria-s8-risultati.md` §O7 c'è solo la lettura a 0 h
  del 30/08; le colonne 24 h e 48 h sono vuote). L'unico dato è il consumo ordinario del 30/08–02/09:
  78–79 % → 65 %, cioè 4,3–5,5 %/giorno (≈ 18–23 giorni per carica).
- **O11, Pebble 2 Duo (flint) reale**: mai provato (tabella vuota in `galleria-s8-risultati.md` §O11).
- **`apps/heapprobe` sull'orologio reale**: `PIANO-SVILUPPO-PEBBLE.md` §15 #1.
- **S8 sul campo, passi 6–12** (rotazione/shake, build M, BT/aereo, 20 foto con card e LUT, D5 4.17) e **test 6–8
  di S8b iPhone**: `apps/galleria/PIANO.md` §4 S8 e `galleria-s8-risultati.md` §S8b. Le card dei passi 9–10 si
  generano con `tools/gen_test_cards.py` in `~/galleria-gate/cards/` (il 30/08 erano state mostrate all'utente
  come pagina privata, «opzione B» scelta da lui).
- **Touch in emulatore col mouse** mai provato e **`tools/pbltouch.py` mai scritto**: oggi **non serve** — nessuna
  app del repo usa il touch (nessun `PBL_TOUCH`/`touch_service_*` in `apps/*/src`). Resta aperto solo se l'utente
  vuole provarlo (`PIANO-SVILUPPO-PEBBLE.md` §15 #11, `docs/ricerca/gap-3-emulatore-touch.md`).
- **Default «Legacy Apps»** (scaled vs centered) in Settings → Display dell'emulatore emery: mai controllato
  (`PIANO-SVILUPPO-PEBBLE.md` §15 #12).
- **Già fatte, non più in sospeso**: S8 sul campo (30/08, 04/09 sera e 05/09 pomeriggio, Android + PT2 con
  PebbleOS 4.36.2) e S8b iPhone (06/09); config page aperta su telefono vero: Android dal 30/08 (98.555 car.),
  poi il 05/09 (117.206) e il 06/09 (198–201 k, gate S12); iPhone il 06/09 (128–138 k); CI eseguita e verde dal
  30/08/2026.
- **SDK**: 4.33.1 attivo, **4.17 installato accanto** (D5 chiusa: si pubblica con 4.33.1, il firmware in campo è
  ≥ 4.32). Per una prova: `pebble sdk activate 4.17 && pebble clean && pebble build`, poi riattivare 4.33.1
  (⚠️ `pebble sdk install` attiva da solo l'SDK che installa).
- **Git/GitHub**: repo **pubblico** `https://github.com/Rediro-MC/galleria-da-polso` (MIT, branch `main`, remote
  `origin`); identità git «Rediro» impostata **solo in questo repo** (su un altro computer va rifatta). Non
  versionati: `tools/sdk-docs/` e `tools/pebble-watchface-agent-skill/` (riclonarli con `tools/README.md` §1–2),
  `~/galleria-gate/` (foto e script dei gate), build, log e screenshot di lavoro.

## Struttura del repository

Una sola fonte: **`README.md` §«Struttura»** (e `PIANO-SVILUPPO-PEBBLE.md` §6 per le convenzioni). L'albero che
stava qui era fermo a S8 e in più punti sbagliato: è stato tolto invece di essere mantenuto in tre copie.

## Scoperte sull'emulatore non scritte altrove

Il resto delle scoperte operative (comandi, insidie, `pebble kill && pebble wipe`, `dbm.dumb`, `emu-bt-connection`
che non consegna l'evento…) sta in `CLAUDE.md` di radice e in `apps/galleria/CLAUDE.md`. Qui restano le due che
non compaiono altrove:

- **pypkjs** (29/08/2026, S5b): `XMLHttpRequest` verso `localhost` funziona, `block_private_addresses` non è
  attivo; `pebble emu-app-config` apre l'URL di `Pebble.openURL` con `?return_to=http://localhost:<porta>/close?`
  e consegna a `webviewclosed` la query grezza (≤ 64 KB).
- **`pebble emu-set-content-size`** (26/08/2026, S1) ha effetto **al riavvio dell'app** (`preferred_content_size()`
  1/2/3 loggato).

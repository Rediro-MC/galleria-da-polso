# CONTINUA QUI — stato lavori progetto Pebble

> **Aggiornato: 20/09/2026 (1.0.0 pubblicata, F28 = issue #2106, README allineati).** Questo file dice **dove siamo** e **qual è il passo successivo**, e si legge in un
> minuto. Il dettaglio di ogni sessione (compiti per importanza, numeri, decisioni) sta in
> `apps/galleria/PIANO.md` §8 (stato ed esiti) e §4 (sessione per sessione): qui resta una riga per sessione.

## Stato corrente

- **Fase 0 (setup) chiusa il 24/08/2026, Fase 1 in corso**: la watchface **Galleria** (`apps/galleria`) è l'unica
  app in sviluppo; `apps/hello-emery` e `apps/heapprobe` restano come smoke test della CI e sonda di memoria.
- **0.4.0 PUBBLICATA nello store il 18/09/2026** (~00:50 locali; API `published_date` 2026-09-17T22:50 UTC) con
  `pebble publish --version 0.4.0` e le note di `store/release_notes_0.4.0.txt` (log locale `publish_040.log`,
  «Release created successfully», app `cdf80cc3bf6745b1a310e4c8`). Su richiesta esplicita dell'utente, che prima
  l'aveva provata sul PT2 reale via Android (install + screenshot ok); il **gate completo P01–P20 del runbook non
  è stato eseguito** (scelta dell'utente). **Stato dello store al 19/09/2026 sera**: titolo **«Galleria»**
  (rinominato dall'utente dalla dashboard; il `PATCH` di `PUBLISH.md` §0.1 il 18/09 era stato bloccato dal
  permission mode) e **descrizione nuova online** (`PATCH` di `PUBLISH.md` §0.1 eseguito dall'orchestratore la
  sera del 19/09 su richiesta dell'utente: **794 caratteri = `store/description.txt`**, «Beta 0.4.0», sei lingue,
  «tested on Android and iPhone»); screenshot online **5 emery + 3 flint** = gli 8 di `store/`.
- **20/09/2026, 00:14 — 1.0.0 PUBBLICATA**: **1.0.0 pubblicata il 20/09/2026 alle 00:14 locali** (API `published_date` 2026-09-19T22:14 UTC) con `pebble publish --non-interactive --no-gif-all-platforms --version 1.0.0 --release-notes …` (`store/release_notes_1.0.0.txt`, 506 caratteri, solo inglese; log locale `publish_100.log`: «Release created successfully»), su richiesta dell'utente «carica su github e su pebble store» dopo la prova sul PT2 reale; commit `dd628c0` + tag `v1.0.0` su GitHub; `PATCH` della descrizione (`PUBLISH.md` §0.1, HTTP 200): online **827 caratteri = `store/description.txt`** («Three layouts», «Version 1.0.0», niente «Beta»), titolo «Galleria» invariato, verificato sull'API pubblica; poi questo commit docs. Resta aperto F11 (O5/O6); **F28 fatta il 20/09/2026** (issue #2106, voce qui sotto).
- **20/09/2026 — F28: issue #2106 su coredevices/PebbleOS pubblicata**: `https://github.com/coredevices/PebbleOS/issues/2106`,
  account **Rediro-MC**, `gh issue create` sul template **Bug** e **senza label** (la label `RFC` non esiste nel repo,
  l'account ha solo `pull`). L'issue dice che i settings file del persist sono aperti **senza page cache**, che l'apertura
  costa **2–3 passate** complete sul file prima ancora della ricerca della chiave, che i record morti vengono scartati solo
  quando una scrittura supera la soglia di spazio (**630.458 B** per un file cresciuto a 512 KiB) e propone **quattro**
  rimedi (page cache all'apertura, una sola passata invece di due, compattazione a rapporto fuori dal percorso critico,
  un'API per azzerare il proprio file persist). Bozza del 05/09/2026 **riverificata** il 20/09 con **9 agenti Fable**
  (6 verificatori + 3 lenti): causa confermata, sette correzioni. In fondo al corpo, su richiesta dell'utente, la
  dichiarazione che l'issue è stata **scritta da Claude**, non da un umano. Log grezzi archiviati in
  `~/galleria-archivio-2026-09-17/logs-s8-persist/` (fuori repo); bozza pubblicata e correzioni in
  `docs/design/galleria-s9-issue-pebbleos.md` (§«Verifica del 20/09/2026»). Commit e push restano su richiesta esplicita
  dell'utente.
- **20/09/2026 — README allineati alla 1.0.0** (richiesta «aggiorna README del repo Galleria su github»): `README.md` di
  radice e `apps/galleria/README.md` corretti con un workflow di 63 agenti (7 lenti, 2 scettici per rilievo, un redattore
  per file, 2 rilettori: 17 rilievi confermati + 5 residui applicati, zero errori introdotti; dettagli in `PIANO.md` §8).
  Superati: «0.4.0 ultima release», «794 caratteri», U9 «rimandata», 171 screenshot, il `.pbw` 0.4.0 locale nel comando
  di install, il «pin di `test_index_retry.js`» per 113.412 (corretto anche in `apps/galleria/CLAUDE.md`). Poi, su
  richiesta dell'utente, anche **`store/LISTING.md` allineato alla 1.0.0** (secondo workflow, 83 agenti: testa e §7 con lo
  «Stato al 20/09/2026», §1 1.0.0, §2 = testo della 1.0.0 da 827 caratteri byte-identico a `description.txt`, §3.S14
  byte-identico a `release_notes_1.0.0.txt`, §5/§6 riportati a oggi; dettagli in `PIANO.md` §8). `make -C test` verde.
  **Commit e push fatti su richiesta dell'utente** («carica tutto su github»).
- **Sessione 19/09/2026 sera/notte — S14, cinque feature per la v1.0 ✅ al banco e sul PT2 reale**: dal
  pannello «nuove feature per una watchface minimale» (38 proposte, archivio locale `~/galleria-gate/feature-2026-09-19/`)
  e dalle risposte dell'utente: **F01** alone già al 15 % (`>=`, D140), **F03 «Ora in basso»** = terza disposizione
  (`layout = 2`: il layout A specchiato nella fascia ancorata al fondo dell'area non ostruita, riga info sopra, cifre a
  filo del fondo; sale con la Quick View; D136), **F04** «Ottimizza per lo schermo» spuntata di serie (D138, rovescia
  D6 senza O6), **F09** intervalli 6 h/12 h (D139), **F25** via le frecce del font (D137), lessico **D141**
  («Insieme all'ora», «Font di sistema (tranne Ora grande)»). Spec `docs/design/galleria-s14-feature-v1.md`. Numeri:
  statico **29.300 / 29.188 B** (+220), pagina **85.058 B** (−418, 958 B sotto l'avviso soft), 134 chiavi,
  `test_preview` 2.511, `test_page` 2.694/2.719, `make -C test` verde in 61 s; gate in emulatore e nel browser con 13
  screenshot `docs/design/galleria/s14_*.png` (inchiostro delle cifre alle righe 154..217, specchio esatto di «Ora in
  alto»; anteprima della pagina identica). Tre workflow (14 + 49 + 5 agenti; revisione 8 confermati / 22 refutati,
  nessun difetto funzionale). F02 no, F11 (O5/O6) sospesa, P15 iPhone «mai probabilmente», F28 dopo la v1.0 (**fatta il 20/09/2026: issue #2106**).
  **Provata sul PT2 reale via Android** (23:48–23:54): «Ora in basso» con tre font, «ogni 12 h» (`int=720`), foto nuova in
  15 s, 5 foto a scosse, URL 206.331 caratteri, zero errori (12 h con «PM» provato; Quick View vista al riavvio delle 00:01 con la fascia a 63+106; cambio foto a mezzanotte con «ogni 12 h»).
  Poi commit `dd628c0` + tag `v1.0.0` + push e `pebble publish` 1.0.0 (sopra). Dettagli in `PIANO.md` §4 «S14», §5, §8.
- **Ultima sessione, 19/09/2026 sera — PATCH della descrizione, sesto screenshot tolto, commit**: su richiesta
  esplicita dell'utente l'orchestratore ha lanciato il `PATCH` di `PUBLISH.md` §0.1 (HTTP 200) e verificato sull'API
  pubblica: **descrizione online = `store/description.txt`, 794 caratteri**; titolo, screenshot, icone e release
  invariati. `emery_screenshot_6.png` (unico con foto CC-BY-SA-4.0) **cancellato** su decisione dell'utente:
  `make_assets.py` a **8 screenshot** (5 emery + 3 flint = quelli online) + 3 icone, `--check` verde; il PNG resta
  solo nella storia git (`3504762`–`7a6ed8f`), la sorgente `s8stile_*` resta (171 PNG). Nessuna decisione aperta
  sullo store. Zero C, zero pagina, zero `description.txt`. **Commit di fine sessione, push su richiesta.**
- **19/09/2026 — allineamento dei documenti** (dopo «a che punto siamo del PIANO?»): verifiche al banco sullo
  store (API pubblica: titolo «Galleria» ok, descrizione vecchia — mandata poi la sera stessa —, **5 screenshot
  emery + 3 flint online**, `emery_screenshot_6.png` no; `make_assets.py --check` verde), CI verde (3 run `success`
  su `6e79f6f` e `79abb57`), poi `PIANO.md`, `CONTINUA-QUI.md`, `apps/galleria/CLAUDE.md`, i documenti di
  `store/`, i due `README.md` e la nota di testa di `docs/design/galleria-s11-lingue-es-pt.md` allineati allo stato
  reale (più note datate 19/09 in `THIRD-PARTY-NOTICES.md`, `docs/design/README.md`,
  `docs/design/galleria/README.md`, nel runbook del gate, in `galleria-s9-pubblicazione.md` e in `galleria.md` §10).
  Zero C, zero pagina, zero `description.txt`; commit `3504762` + push su `main` il 19/09/2026 (richiesta
  dell'utente «carica su github ultimo aggiornamento»), poi il commit docs `7a6ed8f` che lo registra qui e in
  `PIANO.md`.
- **18/09/2026 notte — screenshot extra dello store** (sessione non registrata, ricostruita il 19/09 dal diff e
  dai timestamp, file delle 01:13 e 01:21): su richiesta dell'utente 7 screenshot in più in `store/`
  (`emery_screenshot_2…6`, `flint_screenshot_2…3`; due nuovi dall'emulatore, `store040_*` in
  `docs/design/galleria/`), `make_assets.py` esteso (`--check` verde), `store/README.md`, `LISTING.md` §3,
  `apps/galleria/CLAUDE.md` e `docs/design/galleria/README.md` aggiornati; online il 19/09 **5 emery + 3 flint**
  (i 6 extra caricati dall'utente dalla dashboard), `emery_screenshot_6` no (unico con foto CC-BY-SA-4.0) → tolto
  la sera del 19/09. **Regola nuova: le release notes dello store si scrivono solo in inglese.** Committata il
  19/09/2026 con l'allineamento (`3504762`).
- **Sessione 18/09/2026 — prova sull'orologio reale + release 0.4.0**: install del `.pbw` UX-4 sul PT2
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
- **Committato e pushato**: commit `6e79f6f` + tag `v0.4.0` (chiesti dall'utente) e il commit docs `79abb57`
  del 18/09/2026 portano su GitHub tutto il lavoro da S11 alla pulizia del 17/09 e la release; **il commit
  `3504762` del 19/09/2026** porta i 7 screenshot extra con `make_assets.py`, `store/README.md`, `LISTING.md`,
  `apps/galleria/CLAUDE.md`, `docs/design/galleria/README.md`, i due `store040_*` e l'allineamento dei documenti
  del 19/09, poi il commit docs `7a6ed8f` (push su `main`). **Commit e push restano solo su richiesta esplicita.**
- **CI**: 10 esecuzioni verdi fra il 30/08 e il 05/09/2026; il push del 18/09 era il primo passaggio in CI del
  lavoro da S11 in poi — **verde** (verificato il 19/09/2026: 3 run `success`, due su `6e79f6f` e uno su `79abb57`).

## Prossimo passo — il gate sul telefono (se si vuole)

0. **Dopo S14 (20/09)**: (a) ~~commit/push e release~~ **fatti**: `dd628c0`, tag `v1.0.0`, 1.0.0 nello store con descrizione nuova;
   resta da provare la pagina su **iPhone** (tendina del font con il picker a ruota, URL con 5+ foto). (b) **O5/O6 (F11)** quando l'utente ha 2–3 h con il
   PT2 alla luce del giorno: conferma o correzione di D138/D140. (c) ~~**F28** issue a PebbleOS dopo la v1.0~~ **fatta il 20/09/2026: issue #2106** (`coredevices/PebbleOS#2106`).
1. **Fatti il 19/09/2026 sera**: `PATCH` della descrizione (online **794 caratteri = `store/description.txt`**, titolo
   «Galleria») e `emery_screenshot_6.png` cancellato (`store/` = 8 screenshot, tutti online): nulla resta aperto
   sullo store.
2. Il **gate P01–P20** del runbook resta utile anche a release uscita (config page, flusso foto, P15 sull'iPhone
   con 12 foto): da fare quando l'utente vuole.
3. **Commit**: `3504762` + `7a6ed8f` del 19/09/2026 (push su `main`, su richiesta dell'utente); **commit di fine
   sessione del 19/09 sera (push su richiesta)**; i prossimi restano solo su richiesta esplicita.

### Il gate sul telefono (runbook)

**Runbook: `docs/design/galleria-s13-ux4-gate-telefono.md`** (518 righe). Prima le **11 domande** di §1.1 (telefoni
e versioni, album di partenza, foto del gate, tedesco temporaneo, persona non tecnica, tempo), poi le **20 prove
P01–P20** su Android e iPhone, con Claude al banco per install, log e screenshot via `--phone <IP>`. Un orologio e
due telefoni: fra Android e iPhone l'album va svuotato (**D134**, §0 del runbook).

**P15 è la prova decisiva**: l'URL `data:` con 12 foto e miniature vere misura **221.703 caratteri su emery** e
198.020 su flint, contro i **138.249** aperti finora dall'iPhone. Se non regge, serve una sessione a parte per
l'**RLE delle maschere** (−28 k), in una release successiva (la 0.4.0 è già uscita).

La **0.4.0 è già pubblicata** (18/09, su richiesta dell'utente senza il gate completo) e **il giro di release è
completo** (19/09/2026 sera): 0.4.0, titolo «Galleria», descrizione nuova, 8 screenshot. I risultati del gate,
quando si farà, vanno in `apps/galleria/PIANO.md` §8 e in `docs/design/galleria-s13-ux-casual.md` §15.

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
  `pebble publish` 0.4.0 nello store; il titolo «Galleria» l'ha poi messo l'utente dalla dashboard, la
  descrizione è stata mandata il 19/09 sera.
- **18/09/2026 notte — screenshot extra dello store**: 7 screenshot in più (6 online; il settimo tolto il 19/09),
  regola release notes solo in inglese; sessione ricostruita il 19/09.
- **19/09/2026 — allineamento dei documenti**: stato dello store verificato sull'API (titolo ok, descrizione
  vecchia, 5+3 screenshot online), CI verde, `PIANO`/`CONTINUA-QUI`/`CLAUDE.md`/`store` allineati.
- **19/09/2026 sera — PATCH della descrizione + sesto screenshot tolto**: descrizione nuova online (794 car.),
  `emery_screenshot_6` cancellato (foto CC-BY-SA), `make_assets.py` a 8 screenshot; commit di fine sessione.

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

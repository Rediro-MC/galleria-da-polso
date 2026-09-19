# Indice di `docs/design`

Documenti di progettazione della watchface **Galleria** (`apps/galleria`), in ordine di sessione. Il flusso di lavoro
resta quello dei `CLAUDE.md`: si parte da `docs/CONTINUA-QUI.md` e da `apps/galleria/PIANO.md`, i documenti qui sotto
sono il dettaglio. Gli screenshot stanno in `galleria/` (politica e licenze in `galleria/README.md`).

**Stato**: *vivo* = si legge e si aggiorna ancora · *storico* = sessione chiusa, si legge per capire perché una cosa
è come è · *bozza sospesa* = scritta e mai usata, in attesa di una decisione dell'utente.

**Alias delle sessioni**: le sessioni che il `PIANO.md` chiama **UX-1, UX-2, UX-3, UX-4** stanno tutte nei file
`galleria-s13-*` (S13 = la config page per un utente non tecnico): UX-1 in §12, UX-2 in §13, UX-3 in §14, UX-4 e la
lettura pre-gate del 17/09 in §15 di `galleria-s13-ux-casual.md`; il gate sul telefono di UX-4 ha un file suo.

| Documento | Sessione / data | Stato | Che cosa contiene / dove cercare oggi |
|---|---|---|---|
| `galleria-richiesta-iniziale.txt` | S0 · 25/08/2026 | storico | La richiesta dell'utente com'è arrivata, prima di ogni decisione. Il seguito è in `galleria.md` §1–§2 |
| `galleria.md` | design · v2.0, 14/09/2026 (banner e §2/§3.1 aggiornati il 19/09/2026 con S14) | **vivo** | Il design: decisioni **D1–D13, D20–D28, D31–D48**, modello dati, protocollo, budget, wireframe. §«Dove vivono le decisioni» dice in quale file stanno le altre |
| `galleria-s6-config-page.md` | S6 · v1.1, 30/08/2026, aggiornato fino a UX-4 | **vivo** | Config page: sorgenti, inliner, budget della pagina, stato nell'hash, contratti dei test. Aggiornato a ogni sessione che tocca la pagina |
| `galleria-s7-qa.md` | S7 · 30/08/2026 | storico | QA, memoria e perf in emulatore, primi asset dello store. Nota in testa: brief congelato, foto demo e listing sono andati altrove |
| `galleria-s8-hardware.md` | S8 · v1.1, 30/08/2026 | storico | Specifica dell'orologio reale: obiettivi O1–O11, righe di log, criteri di decisione. §9 rimanda ai risultati e al gate di oggi |
| `galleria-s8-runbook-android.md` | S8 · 30/08/2026 | **vivo** (parziale) | Le tre vie di collegamento (§0–§1), le test card e il **glossario delle righe di log** (§5). Per il gate della 0.4.0 si usa il runbook di UX-4 |
| `galleria-s8-risultati.md` | S8 e S8b · 30/08–06/09/2026, riletto il 14/09 | **vivo** | L'unico posto con i numeri misurati sull'**orologio vero** (Android e iPhone). Le celle vuote sono misure mai fatte; qui finiscono anche gli esiti del gate UX-4 |
| `galleria-s8-stile.md` | S8-stile · 04/09/2026 | storico | Font Francois One e Staatliches, «ora trasparente», ombra 3D: decisioni **D20–D26** (le versioni di D25 in §1) |
| `galleria-s9-pubblicazione.md` | S9-prep · 05/09/2026 | storico | Preparazione al rilascio: foto demo CC0, listing, licenza, residui riletti, decisioni U1–U7 (U8 e U9 solo in `apps/galleria/PIANO.md` §6). Esito e numeri di oggi in `apps/galleria/store/` |
| `galleria-s9-issue-pebbleos.md` | S9-prep · 05/09/2026 | **bozza mai aperta upstream** (U9 rimandata) | Analisi del persist di PebbleOS con file e riga, pronta da mandare a `coredevices/PebbleOS`: non è mai stata aperta e non si apre senza l'ok dell'utente |
| `galleria-s10-i18n.md` | S10 · 5–6/09/2026 | **vivo** | Multilingua: decisioni **D31–D38** e il **glossario §3**, che una tripwire (`tools/galleria_gloss_check.py`) confronta con `i18n/messages.json` a ogni `make -C test` |
| `galleria-s11-analisi-anteprima-lingue.md` | analisi · 06/09/2026 | storico | Analisi chiusa: le domande hanno risposta in D39–D42 e D43–D48. Restano unici i fatti misurati (pack CLDR, terser, livelli e costi) e il §6 «drift documentale» |
| `galleria-s11-lingue-es-pt.md` | S11 · 06/09/2026 | **vivo** (D39–D42) | Spagnolo e portoghese sull'orologio e nella pagina: enum delle lingue, date dei pack, separatore delle migliaia |
| `galleria-s12-anteprima.md` | S12 · 06/09/2026 | **vivo** (D43–D48) | Anteprima della watchface dentro la config page: tetto della pagina, URL in base64, maschere delle cifre, che cosa mostra |
| `galleria-s13-ux-casual.md` | S13 / UX-1…UX-4 · 12–17/09/2026 (§16 del 19/09/2026) | **vivo** | Il rifacimento della pagina per un utente non tecnico: lessico (§2), struttura (§3), decisioni **D49–D135** e l'esecuzione di ogni sessione (§12–§15) |
| `galleria-s13-ux4-gate-telefono.md` | UX-4 · 14/09/2026, riscritto il 17/09 | **vivo** (utile a release uscita: la 0.4.0 è uscita il 18/09/2026 senza il gate; il prossimo passo è in `docs/CONTINUA-QUI.md`) | Le venti prove P01–P20 sul telefono vero con la 0.4.0, da fare quando l'utente vuole; i risultati vanno in §3, poi in `PIANO.md` §8 |
| `galleria-s14-feature-v1.md` | S14 · 19/09/2026 | **vivo** | Le cinque feature della v1.0 e le decisioni **D136–D141**: «Ora in basso» (`layout 2`, geometria in §2.3), via le frecce del font, «Ottimizza» spuntata di serie, intervalli 6 h e 12 h, alone ≥ 15 %, lessico delle tre disposizioni. §0 ordine di lavoro, §2–§6 contratti per file, §8 gate in emulatore; gli esiti e i numeri finali stanno in `apps/galleria/PIANO.md` §4–§5 |
| `galleria/` | tutte | **vivo** | Gli screenshot citati per nome dai documenti, un set per gate. `galleria/README.md` ha la politica della cartella e le licenze delle immagini |

Tolto il **17/09/2026**: `galleria-s9-r10-sync-b.diff`, la patch dell'indicatore di sync in layout B (R10), applicata
al codice fin dal 05/09/2026. Resta nella storia git, nel commit `87a4562` che l'aveva introdotta.

Aggiunto il **19/09/2026**: `galleria-s14-feature-v1.md` (sessione S14). Le sue decisioni ne rovesciano o
rivedono altre più vecchie — D138 rovescia **D6** (`galleria.md` §2), D137 rovescia **U-10/D63/D87** e D141 tocca
il lessico di **D54/D96** (`galleria-s13-ux-casual.md` §16), D140 fissa la soglia di **D7** e chiude **R11** senza
O5 (`galleria-s8-risultati.md` §O5), D136 aggiunge una disposizione all'anteprima di **D46**
(`galleria-s12-anteprima.md`) e alla pagina (`galleria-s6-config-page.md`, «Revisione S14»): i documenti vecchi
restano come sono, con una nota datata che rimanda qui.

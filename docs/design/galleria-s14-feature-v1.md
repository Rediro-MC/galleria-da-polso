# Galleria — S14: cinque feature per la v1.0 (F01, F03, F04, F09, F25)

> **v1.0 — 19/09/2026 sera.** Specifica di sessione (contratti per file, numeri, test, gate) e decisioni **D136–D141** (D141 aggiunta al banco).
> Nasce dal pannello «nuove feature per una watchface minimale» del 19/09/2026 (12 agenti, 38 proposte, archivio
> locale `~/galleria-gate/feature-2026-09-19/PANNELLO.md`, fuori repo) e dalle risposte dell'utente: **F01, F03,
> F04 (solo il default), F09, F25 → procedere**; F02 no («lascia come è»); F11 (taratura O5/O6) in sospeso; P15
> sull'iPhone «mai probabilmente» (le leve sull'URL F07/F16/F17/F08 restano in tasca); F28 (issue a PebbleOS) dopo la
> v1.0, in una sessione a parte. L'ordine di lavoro è scelto dall'orchestratore (§0). Valgono tutte le regole di
> `apps/galleria/CLAUDE.md` e del `CLAUDE.md` di radice; i numeri di partenza sono quelli del 19/09/2026 (statico
> **29.080 / 28.968 B**, pagina inlinata **85.476 B**, avviso soft 86.016, 135 chiavi × 6 lingue).

## 0. Ordine di lavoro e classificazione (regola a 4 livelli)

Ordine logico (dal più piccolo che **restituisce** byte al più grande che ne **consuma**, così il budget della pagina
si misura pulito e F03 entra sotto l'avviso soft senza leve straordinarie):

1. **F25** via le frecce ‹ › del font (pagina −≈ 800 B) e **F04** «Ottimizza per lo schermo» spuntato di serie
   (pagina ≈ 0 B): solo pagina, zero C.
2. **F09** intervalli «ogni 6 h» e «ogni 12 h» (C +≈ 16 B, pagina +≈ 60 B).
3. **F01** alone al 15 % (`>=`): C 2 caratteri, `preview.js` 2 caratteri, tool e fixture.
4. **F03** «Ora in basso» (C +350…600 B, pagina +≈ 400 B con `preview.js`): l'unica con layout nuovo, gate su
   emery/flint, Quick View, ExtraLarge, 12 h, LECO.

Le catene lavorano in parallelo su **file disgiunti** (§7); l'ordine sopra è quello delle misure e dei commit.

| Importanza | Compiti | Modello |
|---|---|---|
| alta | perimetro e questa spec, scelta delle decisioni D136–D141, revisione finale del diff C, gate in emulatore, `PIANO.md`/`CONTINUA-QUI.md` | Fable (orchestratore) |
| medio-alta | codice C (`settings.h/.c`, `ui_time.c`, `luma.c/.h`), test-writer adversariale del C, correttore C, scettico sul diff di `ui_time.c`, lenti sul C | Fable (subagenti senza override) |
| medio-bassa | `preview.js` + fixture + mutanti, pagina (`page.html/.css/.js`, `page_core.js`, `test_page.js`), dizionario e `build_i18n.py`, `album.js`/`fakewatch.js`, dev server, `photo_prep.py`, `gen_test_cards.py`, scettici e correttori di queste catene, dedup | Opus |
| bassa | documenti (README, CLAUDE.md dell'app, design §2/§3, S13, tools/README), glossario S10 §3 | Opus |

## 1. Decisioni

| # | Decisione | Perché |
|---|---|---|
| **D136** | **F03 «Ora in basso» = terza voce di «Disposizione»**, valore **`layout = 2`** (`GAL_LAYOUT_A_BOTTOM`, `GAL_LAYOUT_LAST`), nessun byte nuovo nel blob (CRC dei default `0x7EE7` invariato: il default resta 0). Sull'orologio è il **layout A specchiato dentro la sua fascia**: stessa fascia dinamica (106 emery / 110 ExtraLarge / 76 flint), **ancorata al fondo dell'area non ostruita** (`band_y = unob_h − band_h`, mai < 0); dentro la fascia ogni elemento sta a `y' = band_y + band_h − (y + h)` dove `(y, h)` è il suo box nel disegno di §3.1 del design: **riga info sopra, cifre a filo del fondo** (riempimento a 9 px dal bordo su emery, 7 su flint, come i 9/7 px sopra il riempimento in «Ora in alto»). Le cifre si specchiano sul **box del riempimento** (`a_fill_y`, `digit_h` reale della strip: il fondo del riempimento è sempre a 219 su emery, 161 su flint, qualunque font), il LECO sul suo box di testo (`leco_y`, `leco_h`), la riga info sul suo (`info_y`, `info_h`). **Quick View**: la fascia sale con l'area non ostruita (emery `[63,169)`, flint `[41,117)`) con redraw completo e ricalcolo del colore **con isteresi** (`ui_time_band_changed`), come in B; ostruzione più alta della fascia → percorso `compact` esistente. Luma sulla fascia **effettiva** (`LumaRect.y = band_y`). LECO ammesso (come in A). Modalità di rendering invariate (`MODE_A_LECO`/`MODE_A_SPRITE` + flag di specchio), `prv_compute_layout` **non cambia** (il parser di `gen_preview_fixture.py` la legge alla lettera). | Terza voce = nessun controllo nuovo e nessuna chiave di blob (la casella avrebbe voluto un byte in `album.js`, `fakewatch`, dev server, payload). Specchio sul riempimento = «ora a filo del bordo» costante per tutti i font; ancoraggio all'area non ostruita = una sola formula per Quick View e schermo intero. La riga info sopra lascia libera la parte alta della foto (il bisogno di F03: volti, cieli) e l'elemento grande sta dove l'occhio lo cerca in «Ora grande». |
| **D137** | **F25: via le frecce ‹ › accanto al font**: resta la sola tendina; l'anteprima si aggiorna a ogni scelta. Escono `#fontPrev`/`#fontNext`, `cycleFont`, `arrowLabel`/`fontArrowLabels`, la regola CSS dedicata, la voce in `FAM_BTN`, le chiavi `font_prev`/`font_next` (135 → **134** chiavi con la chiave di D136). **Rovescia U-10/D63/D87** (delega del 13/09) su decisione esplicita dell'utente del 19/09. | Due pulsanti che fanno ciò che la select già fa; −≈ 800 B di pagina che F03 consuma. Rischio accettato: su iPhone il picker a ruota rende lo sfoglio dei 6 font più lento. |
| **D138** | **F04: «Ottimizza per lo schermo dell'orologio» spuntato di serie** (`checked` nel markup) per le **foto nuove**; «Colori» e «Sfumature» restano come sono; le foto già sull'orologio non cambiano. «Regolazioni della foto» si apre da solo (D114) quando un valore **non è di fabbrica**: ora la fabbrica è *spuntato*, quindi si apre se la casella è **spenta**. Le card di O5/O6 (`gen_test_cards.py`) si passano ora con «Ottimizza **OFF**» spegnendo la casella (istruzioni aggiornate). **Rovescia D6** («default OFF finché S8 non la conferma») su decisione dell'utente; O6 resta aperto in §7.1 del PIANO. | Risposta 1 e riga F04 dell'utente («“ottimizza per lo schermo” predefinito. Resto lascia così»). Costo 0 B, zero C. |
| **D139** | **F09: intervalli «ogni 6 h» (360) e «ogni 12 h» (720)** fra «ogni 3 h» e «ogni giorno (alle 4:00)»: tendina da 7 a **9** voci con la chiave esistente `opt_hours` («ogni {0} h»), `prv_interval_valid` + `INTERVALS` + `SETTINGS_SPEC` + `fakewatch` + `GAL_INTERVALS` dei test. Rotazione stateless invariata: `t = now_min / interval` → 720 cambia alle **0:00 e 12:00 locali**, 360 alle 0/6/12/18 (multipli dei minuti locali dall'epoca: 1440 è multiplo di entrambi). Downgrade a una build vecchia: un blob con 360/720 (o con `layout` 2, D136) viene rifiutato **per intero** da `settings_validate` — sull'orologio `storage.c` rimette **tutte** le impostazioni di fabbrica, e via sync il blob del telefono riceve lo STATUS di rifiuto — accettato: la 0.4.0 non torna indietro da sola e il caso è solo di laboratorio. | Risposta 4 («si»). Nessuna chiave i18n nuova (tripwire D70: «toutes les 12 h» = 15 ≤ 28); nessun rischio di tetto. |
| **D140** | **F01: alone automatico già al 15 % di conflitto**: `>=` al posto di `>` in `luma.c` (`r->halo`), `ui_time.c:prv_apply_text_style`, `preview.js` (`luma8` e `palette`), `photo_prep.py` (`_decide`), `gen_test_cards.py`; `LUMA_HALO_PCT` resta 15 e il commento diventa «≥ 15 %». **Chiude R11** (PIANO §7.1) **senza O5**, su decisione dell'utente («F01 – procedi»); O5/O6 (F11) restano aperti per la taratura vera. | Le card c7b/c8b «a freddo, 15 % esatto» erano illeggibili sul vetro (30/08). Costo 0 B; le **cinque** copie della regola (`luma.c`, `ui_time.c`, `preview.js`, `photo_prep.py`, `gen_test_cards.py`) cambiano insieme e `test_cards`/`test_preview` le pinnano. |

| **D141** | **Lessico con tre disposizioni** (deciso dall'orchestratore al banco, 19/09 sera, dopo lo scettico della pagina; parole riviste dalla lente «utente» della revisione, che ha refutato un primo «Accanto all'ora»: l'orologio non mette mai la riga di fianco): con «Ora in basso» la riga info sta **sopra** le cifre, quindi l'etichetta delle caselle `lbl_info_row` passa da «Sotto l'ora» a **«Insieme all'ora»** (en «With the time», de «Mit der Uhrzeit», fr «Avec l'heure», es «Con la hora», pt «Com a hora»; tutte ≤ 22, tripwire delle etichette) e la nota dell'anteprima `preview_note_info` dice «Sull'orologio, **sopra o sotto** l'ora, compare quello che hai scelto: {0}» (en «above or below the time», de «über oder unter der Uhrzeit», fr «au-dessus ou en dessous de l'heure», es «encima o debajo de la hora», pt «acima ou abaixo da hora»). `opt_font_leco` nomina il solo layout escluso: «Font di sistema (tranne Ora grande)» (en «System font (except Big clock)», de «Systemschrift (außer Große Uhrzeit)», fr «Police système (sauf Grande heure)», es «Fuente del sistema (no Hora grande)», pt «Fonte do sistema (não Hora grande)»; ≤ 36). **Corollario di D137**: senza le frecce la riga Font torna «etichetta [select]» sulla stessa riga come «Disposizione»: via `#fontRow .rlab { flex-basis: 100% }` (nata in UX-2 per le frecce); resta invece `select#s_font { flex: 1 1 140px; min-width: 0 }`, perché la voce «System font (except Big clock)» dà alla tendina ~244 px di larghezza intrinseca e il flexbox va a capo sulle larghezze ipotetiche prima di restringere: misurato al gate, con la sola flex-basis 140 la riga sta su una riga (40 px) a 400 e a 360 px. Pin di `test_page.js` rovesciati di conseguenza. D89 resta (la riga compare con «Ora in alto» e «Ora in basso», sparisce con «Ora grande»); la prosa di `README.md` che dice «sotto l'ora» è allineata dalla catena documenti. | Un testo che afferma una posizione falsa in un layout su tre; una riga che, sola fra tutte, andava a capo per un controllo che non c'è più. |

Versione: `package.json` resta **0.4.0** (la release — 0.5.0 o 1.0.0 — è una decisione dell'utente).

## 2. F03 «Ora in basso» — contratto del C (`src/c`)

### 2.1 `settings.h` / `settings.c`
- `enum GalLayout { GAL_LAYOUT_A = 0, GAL_LAYOUT_B = 1, GAL_LAYOUT_A_BOTTOM = 2, GAL_LAYOUT_LAST = GAL_LAYOUT_A_BOTTOM }`
  con commento (D136: A specchiato, riga info sopra, cifre in basso; 2 e non un bit: nessun byte nuovo).
- `settings_validate`: `s->layout <= GAL_LAYOUT_LAST`.
- `prv_interval_valid`: aggiunge `360` e `720` (D139); commento del campo `interval_min` in `settings.h`:
  «0 mai; 5, 15, 30, 60, 180, 360, 720, 1440».
- Hook `GALLERIA_DEBUG_LAYOUT`: commento «0 A, 1 B, 2 A in basso».
- Tutti i confronti con `GAL_LAYOUT_B` restano validi (2 ≠ 1): `prv_load_strips`, `sync_env_settings_changed`
  (cambio 0 ↔ 2 → `ui_time_layout_changed`, già così perché confronta i byte), `page_core.normalizeSettings`.

### 2.2 `ui_time.c`
Invarianti: `prv_compute_layout` **identica** (costanti di §3.1/§3.3 del design; il parser della fixture la legge);
`prv_strip_fits` **identica** (controlla la strip contro la griglia di «Ora in alto»; per simmetria vale anche
specchiata); modalità `MODE_*` invariate; nessuna allocazione nuova; **nessun cambiamento nella riga `ui_time:`
dell'init** (`galleria_logstats.py` la parsa) — la posizione della fascia si legge già in `luma(...): b=y+h`.

Aggiunte:
- `UiLayout.bottom` (bool): vero quando `settings_get()->layout == GAL_LAYOUT_A_BOTTOM` **e** la modalità è A
  (`MODE_A_LECO`/`MODE_A_SPRITE`); in `MODE_B_QV` è falso (B sotto Quick View resta la riga singola in alto).
  `UiLayout.luma_y` (int16): origine y della fascia di luma (= `band_y`; 0 in tutti gli altri casi).
- `prv_pick_mode`: nel ramo `default` (A) dopo `band_h`: `s_lay.bottom = (st->layout == GAL_LAYOUT_A_BOTTOM)`;
  se `bottom`: `band_y = s_unob_h − band_h` (se < 0 → 0); `luma_y = band_y`. Negli altri rami `bottom = false`,
  `luma_y = 0`.
- Helper puro `static int16_t prv_ay(int16_t y, int16_t h)`: `bottom ? band_y + band_h − y − h : y`
  (in A alto `band_y` è 0). Effettivi:
  - riempimento cifre A: `prv_ay(a_fill_y, digit_h)` con `digit_h` dalle metriche della taglia A (`m ? m->digit_h : 0`);
  - LECO: `leco_y' = prv_ay(leco_y, leco_h)`, `leco_bottom' = leco_y' + (leco_bottom − leco_y)`;
  - riga info: `prv_ay(info_y, info_h)`.
  Usati in `prv_layout_time` (`s_row1_y`, `digits_bottom`, `s_rc_time`, `s_rc_ampm`), `prv_layout_info` (`y`),
  nel ramo `compact` di `prv_update_proc` (`y` del centraggio).
- `prv_compute_luma`: `LumaRect band = { 0, s_lay.luma_y, sz.w, h }` con `h` ritagliata a `sz.h − luma_y`
  (mai negativa; `luma_y ≤ sz.h`).
- Guardie delle icone in `prv_update_proc` (sync e BT): confronto con **`band_y + band_h`**, non con `band_h`
  (in A alto `band_y` = 0: identico a oggi).
- `prv_refresh_mode`: rifà **`prv_layout_time` e (in A) `prv_read_steps` + `prv_layout_info` anche quando cambia
  solo la fascia** (oggi solo al cambio di modalità): in «Ora in basso» la Quick View sposta la fascia senza
  cambiare modalità e le posizioni assolute vanno ricalcolate prima del redraw; `prv_apply_text_style` resta solo
  al cambio di modalità. `ui_time_layout_changed` invariata (il cambio 0 ↔ 2 passa da `prv_refresh_mode`:
  fascia diversa → `ui_photo_set_band` + posizioni + `ui_time_band_changed`).
- `ui_time_photo_changed`/`band_changed`/`style_changed`/`tick`/`set_sync_progress`: invariati (usano le rect
  effettive).
- Commenti: `MODE_*` (nota «+ bottom»), `band_y` («0 salvo B e A in basso»), riga di `prv_compute_luma` (D7:
  fascia effettiva).

### 2.3 Numeri attesi (per il gate e per la fixture dell'anteprima)
| Piattaforma | fascia | riga info | riempimento cifre (Anton) | strip | LECO box | Quick View |
|---|---|---|---|---|---|---|
| emery normale | `[122,228)` | y 124, h 22 | 153..218 (fill_y' 153, digit_h 66; Barlow/Francois 61 → 158, Staatliches 65 → 154) | 151..222 | 162..221 (ink 180..221), `leco_bottom'` 222 | unob 169 → fascia `[63,169)`, info 65, fill 94 |
| emery ExtraLarge | `[118,228)` | y 120, h 28 | 153..218 | 151..222 | 162..221 | `[59,169)` |
| flint | `[92,168)` | y 94, h 18 | 119..160 (digit_h 42; Barlow 40 → 121, Francois 41 → 120) | 118..161 | 118..161 (ink 131..159) | unob 117 → `[41,117)`, info 43, fill 68 |

### 2.4 `luma.c` / `luma.h` (D140)
`r->halo = r->bad_pct >= LUMA_HALO_PCT;` in `luma_compute_8bit`; commento di `luma.h` («contorno se bad_pct ≥ 15 %»,
`LUMA_HALO_PCT` «≥ 15 % di pixel in conflitto → contorno consigliato»). In `ui_time.c:prv_apply_text_style`:
`(light ? s_luma.bad_white : s_luma.bad_black) >= LUMA_HALO_PCT` e commento.

### 2.5 Test C (`test/`, `make -C test`) — test-writer «non correggere `src/c`, riporta»
- `test_luma.c`: le 5 attese cambiano (30/15 → halo **sì** con bad 15; 25/15 → sì; 15/30 → sì; 20/15 «senza stato»
  → nero, bad 15 → **sì**; 15/20 → bianco, bad 15 → **sì**) + casi nuovi «alone spento a 14 %» e «acceso a 15 %»
  in entrambe le direzioni, e **fascia con `y > 0`** (band.y 122, h 106 su un'immagine 200×228: campiona le righe
  122, 124, …, 226, mai la 121 né la 228) con un'immagine che è nera sopra la 122 e bianca sotto (il risultato non
  deve vedere il nero).
- `test_storage.c` / `test_storage_adv.c`: `GAL_INTERVALS` a 9 voci (`seed % 9`), `layout = seed % 3`; casi:
  `layout 2` valido, `3` rifiutato; `360`/`720` validi, `361` rifiutato; record letto con `layout 2` conservato.
- `test_rotation.c`: 720 → cambio a 0:00 e 12:00 locali (non alle 4:00: `t(23:59) == t(12:00)`, `t(0:00) == t(23:59)+1`,
  `t(11:59) == t(0:00)`, `t(12:00) == t(0:00)+1`); 360 → 0/6/12/18; con n = 12 e ordine casuale la sequenza cambia
  fra 11:59 e 12:00 e resta uguale fra 12:00 e 23:59.
- `test_sync.c`: `env_case` con `layout = GAL_LAYOUT_A_BOTTOM` → `layout_changed` 1 (come B); `A_BOTTOM` → `A` idem.
- `test_model.c`: nessun cambiamento atteso (il modello non legge `layout`); se il test-writer trova un ramo che lo
  legge, lo segnala.

## 3. F03 — contratto dell'anteprima (`src/pkjs/config/preview.js`, medio-bassa)
- `isB(l)` invariata; nuova `isBottom(l)`: `l === 2 || l === 'C' || l === 'c'` (accetta la stessa forma lasca di `isB`).
- `layoutRows(fmt, layout, metrics, time)`: in A con `bottom` la riga sta a `y = L.h − L.a_fill_y − sz.digit_h − R`
  (specchio del box del riempimento, D136: `digit_h` c'è nelle maschere); ritorna anche **`lumaY`** (`L.h − lumaH`
  in basso, 0 altrimenti); `lumaH` invariata (106/76).
- `render(o)`: `lumaY` come sopra; `luma8/luma1(px, W, H, { x: 0, y: lumaY, w: W, h: lumaH })` quando `lumaY > 0`
  (con `bandOf` a oggetto: campionamento da `y = lumaY` a passi di 2, come il C); nel risultato anche `lumaY`.
- D140: `r.halo = r.bad_pct >= HALO_PCT` in `luma8`; in `palette` `… >= HALO_PCT`; commento di testa «contorno ≥ 15 %».
- `test/gen_preview_fixture.py`: casi anche per il layout **C** (= 2, «A in basso») per piattaforma × font (riga a
  `y` specchiata, `band_h` 106/76, **`band_y`** 122/92) e luma delle foto demo sulla fascia in basso:
  `photo_prep.stats_emery/stats_flint` prendono un **`y0`** facoltativo (default 0) → `for y in range(y0, y0 + band_h, 2)`;
  `_c_luma_h`/`_c_layout` invariati (leggono `prv_compute_layout`); il pin «contorno ≥ 15 %» (`test_preview.js:152`)
  resta sulla costante, e un caso di fixture deve avere `bad_pct == 15` (immagine sintetica) per pinnare il `>=`.
- `test/test_preview.js`: casi nuovi (layout 2: `lumaY`, riga specchiata per Anton/Barlow/Francois/Staatliches su
  emery e flint, luma sulla fascia bassa delle due demo ≠ da quella alta), `isBottom`, `>=`; `mutants_preview.js`:
  mutanti nuovi («specchio sulla strip invece che sul riempimento», «`lumaY` 0», «`>` invece di `>=`»), tutti uccisi.
- Conteggi attesi: `test_preview.js` > 1.675; il modulo cresce di ≈ 200–350 B (misurare con `build_config_page.py --check`).

## 4. Contratto della pagina (`src/pkjs/config/`, medio-bassa)
### 4.1 `page.html`
- F25: riga Font → `<p class="row" id="fontRow"><label for="s_font" class="rlab" data-i18n="lbl_font"></label> <select id="s_font"></select></p>`.
- F04: `<input type="checkbox" id="sunlight" checked>`.
### 4.2 `page.css`
- F25: via la regola `#fontPrev, #fontNext { font-size: 22px; line-height: 1; }` **e il suo blocco di commento**
  (D87/G17). Nessun'altra regola cambia.
### 4.3 `page.js`
- F25: via `arrowLabel`, `fontArrowLabels` (e la sua chiamata in `applyLang`), `cycleFont`, le due `on()` del
  blocco «D87» in `init`; il commento D87 sparisce.
- F03: `o.layout = [[0, T('opt_layout_a')], [2, T('opt_layout_a_bottom')], [1, T('opt_layout_b')]]` (ordine
  semantico: alto, basso, grande); i tre `layout === 0` (riga «Sotto l'ora» `show(el('infoRow'), …)`, nota
  dell'anteprima `preview_note_info`, `advOpen`) diventano **`!== 1`**; `leco.disabled = (layout === 1)` e
  `if (layout === 1 && font.value === '3')` restano. Commento D89: «esiste con «Ora in alto» e «Ora in basso»».
- F09: `o.interval_min`: `[180, T('opt_hours', 3)], [360, T('opt_hours', 6)], [720, T('opt_hours', 12)], [1440, …]`.
- F04: in `openEditor`, `setEditAdvOpen(… || !el('sunlight').checked || …)` con il commento D114 aggiornato (D138:
  la fabbrica è spuntato). `encodeNow`, `renderPreview` (`sunlight: … : true`), `show(el('sunlightRow'), …)`
  invariati.
### 4.4 `page_core.js`
- `INTERVALS = [0, 5, 15, 30, 60, 180, 360, 720, 1440]`; `SETTINGS_FIELDS`: `['layout', 0, 2, 0]` con commento D136;
  `normalizeSettings`: `if (s.font === 3 && s.layout === 1) { s.font = 0; }` invariata (LECO ammesso con 2).
### 4.5 `test/test_page.js`
- Pin da rifare: via ogni riferimento a `fontPrev`/`fontNext`/`font_prev`/`font_next` (24 + 19 + 12 occorrenze,
  la voce «frecce» di `FAM_BTN` — attenzione alla nota «le frecce restano ULTIME: il caso 4e legge
  `FAM_BTN[length − 1]`»: dopo la rimozione l'ultima voce deve restare un pulsante che ha davvero lo stato
  disabilitato, o il caso 4e va adattato), lista degli id del markup (riga ≈ 1157), pin `#fontPrev` CSS;
  intervallo: 9 opzioni, valori `= C.INTERVALS`, testi `[…, Tit('opt_hours', 3), Tit('opt_hours', 6), Tit('opt_hours', 12), Tit('opt_one_day')]`;
  `normalizeSettings({ interval_min: 360 })` e `720` ammessi, `361` → 30; layout: 3 opzioni **nell'ordine 0, 2, 1**
  con i testi `Tit('opt_layout_a')`, `Tit('opt_layout_a_bottom')`, `Tit('opt_layout_b')`; `normalizeSettings({ layout: 2 })` → 2,
  `{ layout: 3 }` → 0, `{ font: 3, layout: 2 }` → 3 (LECO ammesso); con `s_layout` = 2: LECO attivo, `#infoRow`
  visibile, `preview_note_info` mostrata (con almeno una casella), payload `layout 2`, anteprima ridisegnata
  (`GalPreview.render` chiamato con `settings.layout === 2`); `advOpen` con `layout 2` e `info_row ≠ 15` → aperto;
  F04: `#sunlight` **spuntato** all'apertura dell'editor, `encodeEmery` chiamata con `sunlight: true` di default (le
  attese `expectEmery({ …, sunlight: false })` delle sezioni 2f/2e vanno riviste: default → `true`; spegnendo la
  casella → `false`), `editAdvBody` chiuso con i valori di fabbrica (casella spuntata) e **aperto** se la casella
  è spenta; §4e: nessun pulsante nuovo.
- Tripwire nuove: `page.html` senza `fontPrev`/`fontNext`; `page.js` senza `cycleFont`; `#sunlight` con `checked`.
### 4.6 Budget
Pagina inlinata attesa ≈ **85.100–85.500 B** (−800 F25, +60 F09, +≈ 150 F03 in `page.js`, +≈ 250 in `preview.js`):
**sotto l'avviso soft di 86.016 B senza leve**; misurare con `python3 ../../tools/build_config_page.py --check` e
annotare in `PIANO.md` §5 e `CLAUDE.md` dell'app (riga «Peso»).

## 5. Dizionario (`i18n/`, medio-bassa) — **prima** della catena della pagina
- `i18n/messages.json`: via `font_prev` e `font_next`; nuova **`opt_layout_a_bottom`** subito dopo `opt_layout_a`:
  it «Ora in basso, info sopra» · en «Clock at bottom, info above» · de «Uhrzeit unten, Info oben» ·
  fr «Heure en bas, infos dessus» · es «Hora abajo, info encima» · pt «Hora embaixo, info em cima»
  (tutte ≤ 28 caratteri: tripwire D70). 135 → **134** chiavi.
- `tools/build_i18n.py`: `opt_layout_a_bottom` nella lista delle chiavi-option (limite 28); `RENDER_ARGS['opt_hours']`
  → `'12'` (il valore più lungo che `page.js` ci mette); selftest aggiornato se conta le chiavi.
- Rigenerare `src/pkjs/i18n.js` e `test/fixture_i18n.js` (`python3 ../../tools/build_i18n.py`), poi `--check`.
- `docs/design/galleria-s10-i18n.md` §3: la riga «Disposizione · …» prende il testo nuovo in tutte e sei le lingue
  (stesso ordine delle celle: it, en, de, fr, es, pt, chiavi), la riga «Font precedente · Font successivo» sparisce;
  la nota di testa passa a **134 chiavi** e alla data del 19/09/2026; `make -C test glosscheck` verde.
- `i18n/README.md`: conteggi (134 chiavi) e la chiave nuova nella descrizione delle option.

## 6. Tool, PKJS di supporto e test JS (medio-bassa)
- `src/pkjs/album.js`: `['layout', 0, 2, 0]`; `test/test_album.js`: `layout 2` ammesso, `3` → 0 (riga 391 e vicine).
- `test/shim/fakewatch.js`: `settings_validate` finta con `layout <= 2` e intervalli 360/720 (commento).
- `tools/galleria_devserver.py`: `SETTINGS_SPEC` `layout range(0, 3)` «0..2», `interval_min` con 360 e 720 e la
  descrizione «0/5/15/30/60/180/360/720/1440»; la pagina di prova (`--dump-page`, riga ≈ 942/951) con la terza voce
  «C — ora in basso» e i due intervalli; selftest allineato (`layout 7` resta fuori intervallo). `test/test_devpage.js`:
  `OPTION_COUNT.layout` 3, intervalli 9, pin dei valori.
- `tools/gen_test_cards.py`: `halo = 'SI' if bad_pct >= LUMA_HALO_PCT` e docstring; `test/test_cards.py`: c7b (15 %)
  → halo **SI**, c8b/c8a a freddo dove `bad == 15` → SI; `make -C test cards` verde.
- `tools/photo_prep.py`: `_decide` con `>=`; `stats_emery/stats_flint(…, y0=0)`; `--stats` stampa **anche** la riga
  della fascia in basso («fascia y 122..227» / «92..167»); `--selftest` (in `pyselftest`) con un caso `bad_pct == 15`
  → halo e un caso `y0 > 0`.
- `tools/README.md`: §9 (`photo_prep --stats`, regola ≥ 15 %), §11 (dev server: intervalli e layout 0..2),
  riga sui `gen_test_cards` («Ottimizza» va **spenta**).

## 7. Catene, file e sequenza
| Catena | File (disgiunti) | Modello |
|---|---|---|
| C | `src/c/settings.h`, `settings.c`, `ui_time.c`, `luma.c`, `luma.h`; poi test-writer su `test/test_luma.c`, `test_storage.c`, `test_storage_adv.c`, `test_rotation.c`, `test_sync.c` (+ `test/shim/pebble.h` solo se serve un contatore nuovo) | Fable |
| anteprima | `src/pkjs/config/preview.js`, `test/test_preview.js`, `test/mutants_preview.js`, `test/gen_preview_fixture.py`, `test/fixture_preview.js` (generata), `tools/photo_prep.py` | Opus |
| dizionario → pagina | `i18n/messages.json`, `tools/build_i18n.py`, `src/pkjs/i18n.js` + `test/fixture_i18n.js` (generati), `docs/design/galleria-s10-i18n.md` §3, `i18n/README.md`; **poi** `page.html`, `page.css`, `page.js`, `page_core.js`, `test/test_page.js`, `src/pkjs/config_page.js` (generato) | Opus |
| tool e PKJS | `src/pkjs/album.js`, `test/test_album.js`, `test/shim/fakewatch.js`, `tools/galleria_devserver.py`, `test/test_devpage.js`, `tools/gen_test_cards.py`, `test/test_cards.py`, `tools/README.md` | Opus |
| documenti (dopo il gate) | `apps/galleria/README.md`, `apps/galleria/CLAUDE.md`, `docs/design/galleria.md` (§2 indice D136–D140 e D6, §3.1 wireframe «Ora in basso», §10 punto 4), `docs/design/galleria-s13-ux-casual.md` (nota su U-10/D63 e D105/D114), `docs/design/galleria-s8-risultati.md` (O5: R11 chiusa con D140), `docs/design/README.md`, `store/LISTING.md` (bozza note EN della prossima release) | Opus |

Regole per tutte le catene: nessun backtick nei sorgenti inlinati; `T('chiave')` letterale; commenti nuovi in
`page.js`/`preview.js` **su righe proprie**; niente `localStorage`; ogni catena esegue i **suoi** test
(`make -C test run-test_luma`, `node test/test_page.js`, ecc.) e riporta i conteggi; `make -C test` intero lo esegue
l'integratore alla fine, dopo `python3 ../../tools/build_config_page.py --check` e `pebble build` (emery + flint).

## 8. Gate in emulatore (alta, Fable)
1. `pebble build` (emery, flint): statico atteso ≤ 29.700 / 29.600 B; `MEMORY USAGE` annotato.
2. Emery, `GALLERIA_DEBUG_LAYOUT=2`: screenshot 24 h Anton pieno (foto demo), 12 h («PM» accanto alle cifre a
   filo del fondo), Quick View on/off (`emu-set-timeline-quick-view`), ExtraLarge (`emu-set-content-size x-large`),
   `GALLERIA_DEBUG_FONT=3` (LECO in basso), `GALLERIA_DEBUG_FONT=4 GALLERIA_DEBUG_STYLE=2` (Francois One 3D:
   riempimento a 158), sync in corso (icona dentro la fascia bassa: `GALLERIA_DEBUG_SEED`/dev server); log
   `luma(photo): b=122+106` e, in Quick View, `b=63+106` con `luma(band)`; `heap` invariato a regime.
3. Flint, `GALLERIA_DEBUG_LAYOUT=2`: 24 h, Quick View.
4. Riga «Ottimizza» spuntata di serie (dev server `--page-dir`), tendina Font senza frecce a 400 e 360 px,
   «Disposizione» con 3 voci, «Ogni quanto» con 9 voci, anteprima 1:1 di «Ora in basso» confrontata con lo
   screenshot dell'emulatore (`toDataURL` del canvas contro il PNG: stesse posizioni delle cifre).
5. Screenshot nel repo: `docs/design/galleria/s14_*.png` (un set: emery A-basso 24 h, 12 h, Quick View, LECO,
   flint, pagina), citati in `docs/design/galleria/README.md`.

## 9. Esito (19/09/2026 notte)
Tutto fatto al banco: statico **29.300 / 29.188 B** (+220 per piattaforma, contro i 350–600 stimati), pagina **85.058 B** (−418;
modulo 87.832), 134 chiavi (39.776 B, `i18n.js` 36.482 B, hash 36.959 car.), `make -C test` verde in 61 s (`luma` 133, `rotation`
711, `storage` 1.703, `storage_adv` 673, `sync` 1.983, `sync_proto` 2.596, `test_preview` 2.511 con 37 mutanti, `test_page`
2.694 / 2.719, `test_album` 1.395); gate §8 completo su emery (24 h, 12 h, Quick View, ExtraLarge, LECO, Francois One 3D, sync)
e flint (24 h, Quick View): inchiostro Anton alle righe 154..217 = specchio esatto delle 10..73 di «Ora in alto», Quick View
95..158; pagina a 400/360 px con 3 disposizioni, 9 intervalli, «Ottimizza» spuntata, riga Font a 40 px; anteprima della pagina
identica all'emulatore (154..217). Screenshot `docs/design/galleria/s14_*.png` (13). Tre workflow: costruzione 14 agenti,
revisione 49 (31 → 30 → 8 confermati / 22 refutati, nessun difetto funzionale), documenti 5. Deviazioni dalla spec, tutte
volute: `album.js` con `INTERVALS` a 9 (necessaria), `test_sync_proto.c` allineato (layout 2 ora valido), tripwire `grep` di
`>= LUMA_HALO_PCT` in `pagecheck` (la copia di `ui_time.c` non ha test host), D141 riscritta dalla lente «utente», la
regola `select#s_font { flex: 1 1 140px }` tenuta (vedi D141). Esito e classificazione in `apps/galleria/PIANO.md` §4 «S14», §5, §8.

**Prova sul PT2 reale via Android (19/09/2026, 23:48–23:54, `--phone 192.168.188.29`, `.pbw` di produzione 0.4.0+S14):** install ok, apertura del file persist 94 ms con 4 foto; «Ora in basso» applicato senza riavvio (`sync: msg=10 code=0`, `luma(band): b=122+106`) con Anton, un font largo e il Font di sistema (`m=0`, heap libero 49.416 B); «ogni 12 h» arrivato (`rot(...): int=720`); foto nuova dalla pagina (risposta di 48.010 caratteri) trasferita in 9 messaggi e 15 s con CRC ok, poi 5 foto scorse a scosse (27–94 ms l'una, colore deciso sulla fascia bassa: la nuova bianca senza alone, le altre nere con alone); config page aperta 7 volte con URL di 206.331 caratteri; zero WARNING/ERROR, heap libero ≈ 42 KB. 12 h provato («11:57 PM» in basso, PM allineato al riempimento). Alle 00:01:38 (20/09) riavvio della watchface con la **Quick View attiva**: `ui_time: unob=169 lay=2 font=5` e `luma(photo): b=63+106` (fascia sopra il riquadro fin dall'avvio), impostazioni rilette da persist (`layout=2 font=5 interval=720`), apertura del file **168 ms con 5 foto**, e **cambio foto a mezzanotte** (slot 4 → 5: confine delle 0:00 di «ogni 12 h»). Tutti i punti del gate §8 sono quindi confermati anche sul PT2 reale. Log e screenshot in `~/galleria-gate/s14/phone/` (fuori repo).

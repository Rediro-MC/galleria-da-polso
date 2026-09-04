# Galleria — sessione **S8-stile**: due font nuovi + «ora trasparente» (contorno spesso, ombra 3D)

> Specifica e contratti della sessione (04/09/2026). Richiesta dell'utente: aggiungere **un paio di font** (pubblici,
> liberi, belli e leggibili, scelti anche perché rendono bene senza riempimento) e una modalità **ora trasparente**:
> le cifre lasciano vedere la foto, con un **contorno «cicciotto»** e/o un **effetto 3D di ombreggiatura**, in
> entrambi i layout (A un terzo, B tutto schermo, e la riga singola sotto Quick View). Vale tutto ciò che sta in
> `galleria.md` (design) e nei `CLAUDE.md`; qui solo le novità. Compiti per importanza in §9.

## 1. Decisioni

| # | Decisione | Perché |
|---|---|---|
| **D20** | **Quarto indice della palette 2 bit = ombra 3D (solo emery, D26); l'indice del contorno diventa un anello spesso R px.** Strip sempre `2BitPalette`: 0 trasparente, 1 riempimento, 2 anello (dilatazione Chebyshev di R px del riempimento, meno il riempimento), 3 ombra (unione degli spostamenti diagonali (+k,+k), k = 1..S, di riempimento ∪ anello, meno riempimento ∪ anello). **R = 2, S = 2 su emery; R = 1, S = 0 su flint** (taglie A e B; D26: su flint l'ombra non esiste). Colori nel PNG: (0,0,0,0), (255,255,255,255), (0,0,0,255), **(255,0,0,255)** = ombra (GColor8 `0xF0`, riconosciuto dal colore come gli altri). | Un solo blit per glifo (regola 6/13), stessa risorsa per tutti gli stili: cambiano solo 3 byte di palette a runtime. Un 4BitPalette raddoppierebbe l'heap delle strip (layout B sotto i 40 KB). Ombra come blit sfalsato è impossibile: il riempimento trasparente farebbe vedere la sagoma dentro la cifra. La geometria di riga (12 h «10:44 PM» ≤ 200 px) impone S = 2 nella taglia A emery; flint con R = 2 sforerebbe i 144 px in 12 h. |
| **D21** | **Impostazione `digit_style`** nel primo byte di `GalSettings.reserved` (byte 12 del blob, schema 1 invariato, 20 B): **0 Pieno** (com'è oggi), **1 Trasparente** (riempimento `GColorClear`, anello = colore testo), **2 Trasparente 3D** (+ ombra = colore opposto), **3 Pieno 3D** (riempimento = testo, anello secondo «Contorno», ombra = colore opposto). Il colore del testo (auto/luma o manuale) e «Contorno» restano come sono; negli stili trasparenti «Contorno» non ha effetto (l'anello è sempre disegnato) e la pagina lo disabilita. Con il font LECO (nessuno sprite) lo stile è ignorato dall'orologio e forzato a 0 dalla pagina. | Blob vecchi hanno 0 = Pieno: nessuna migrazione. Quattro valori espliciti, niente regole implicite fra due impostazioni. |
| **D22** | **Enum dei font stabile**: 0 Anton, 1 Bebas Neue, 2 Barlow Condensed Bold, **3 LECO** (sistema, solo A), **4 = Francois One, 5 = Staatliches** (i due font nuovi, §2). Indice della strip = `font < 3 ? font : font − 1` (LECO nessuna strip). Tabelle generate `DIGITS_METRICS[5][2]` e `DIGITS_RESOURCE_IDS[5][2]` nell'ordine 0 Anton, 1 Bebas, 2 Barlow, 3 Francois One, 4 Staatliches. | Le impostazioni già salvate (font 3 = LECO) restano valide; `settings_validate` accetta font ≤ 5 e `digit_style` ≤ 3. |
| **D23** | **Anello di 2 px anche per lo stile Pieno con «Contorno»** su emery (prima 1 px); su flint resta 1 px. | Un solo indice per l'anello: lo spessore è quello della strip. A 66/94 px il contorno da 1 px era sottile (feedback S8 sulle foto a righe); 2 px è il minimo per leggere l'anello da solo. |
| **D24** | **Pixel del riempimento invariati** per Anton/Bebas/Barlow: `pick_px`/`--fit-width` misurano ancora `riempimento + 2 ≤ cell_w` (e `':' + 2 ≤ cella del ':'`), NON `+ 2R + S`; anello e ombra possono sporgere dal passo di cella (D25). Il generatore verifica che la riga peggiore stia nello schermo (§3.4) e si ferma con errore se no. | Altrimenti Anton (riempimento 35 px in A) e Barlow perderebbero altezza. |
| **D26** | **Su flint niente ombra (S = 0): strip a 3 colori** (trasparente, riempimento, anello 1 px, `strip_h` 44/64 come prima). Gli stili 2 e 3 valgono come 1 e 0 sull'orologio (l'indice dell'ombra manca: `ui_digits_set_palette` lo ignora) e la config page, quando `state.platform === 'flint'`, disabilita le due opzioni 3D e normalizza 2 → 1, 3 → 0. | Verificato in emulatore (04/09, prima build): per le piattaforme B/N la SDK riduce ogni pixel con `nearest_color_to_pebble2_palette` (luma → 0/255, alpha → 0/255), quindi in un `.pbi` `~bw` esistono solo tre valori (0x00, 0xC0, 0xFF): il rosso diventa nero e si fonde con l'anello (l'ombra usciva del colore dell'anello). Non c'è un quarto colore possibile senza una seconda risorsa e un secondo blit. |
| **D25** (rivista dopo la revisione, 05/09/2026) | **Il passo di un glifo si allarga al RIEMPIMENTO PIÙ UN ANELLO**, non all'inchiostro totale: in `prv_place_row` (ui_time.c) e in `place_row` (gen_digits.py) `adv = max(passo, w − 2R − S + R)`, cioè `max(passo, ui_digits_fill_width + R)`. Gli **anelli** dei glifi vicini possono ancora sovrapporsi fra loro (stesso colore: l'unione è invisibile) e l'**ombra** può sporgere di 1 px nel margine interno del vicino (solo negli stili 3D); il blocco centrato può sporgere di ≤ R a sinistra e ≤ R + S a destra (clip del layer). | **Finding F1 della revisione**: con il solo `max(passo, riempimento)` l'anello del glifo successivo **mordeva 1–2 px lo stelo** del precedente — in 12 h (celle da 38 px) con Barlow, Francois One e Staatliches, che hanno riempimenti da 37–38 px. Il `+ R` è il minimo che tiene l'anello fuori dal riempimento del vicino, e costa 2 px per glifo largo: la riga 12 h passa da 190 a 194 px (Barlow, Francois One) e 196 (Staatliches), sempre dentro i 200. Con `max(passo, inchiostro)` sarebbe invece 201 px (Anton) … 208 (Staatliches) > 200. Con Anton e Bebas resta 168 + 4 + 18 = 190 come nel design §3.1. |

## 2. Font nuovi (slot 4 e 5)

Criteri: SIL OFL 1.1, TTF **statico** su `github.com/google/fonts` (`ofl/<dir>/…`), nessun Reserved Font Name, tratti spessi
(≥ 7 px a 66 px di altezza) e controforme ampie (leggibili con il solo anello), aspetto ≤ 0,62 (poca o nessuna perdita per
`--fit-width` in A), stile diverso dai tre presenti e fra loro. Provenienza pinnata (sha256 + blob sha) in `resources/fonts/README.md`.

| Slot | Font | File | Chiave (`gen_digits.py`) | Risorsa | Nome nella pagina | Enum C |
|---|---|---|---|---|---|---|
| 4 | **Francois One** (Vernon Adams, OFL 1.1) | `FrancoisOne-Regular.ttf` | `francois` | `DIGITS_FRANCOIS_A/B` | Francois One | `GAL_FONT_FRANCOIS` |
| 5 | **Staatliches** (Brian LaRossa, OFL 1.1) | `Staatliches-Regular.ttf` | `staatliches` | `DIGITS_STAATLICHES_A/B` | Staatliches | `GAL_FONT_STAATLICHES` |

**Scelta (Fable, 04/09/2026, sui fogli di contatto di 15 candidati OFL statici + metriche + giuria a 3 lenti):**
Francois One = poster grotesque pesante e rotondo (tratto 14 px a 61 px di altezza in A, controforme aperte al 60–73 % nello
stile trasparente), il più leggibile con il solo anello e diverso da Anton (più tozzo e rotondo); perde 5 px in A per
`--fit-width` come Barlow (riempimento `4` 38 px), altezza piena in B. Staatliches = geometrico da insegna, altezza piena
(65/66 in A, 94/94 in B), le controforme più ampie di tutti (67–77 %), stile che non c'era (deco/segnaletica). Riserva: Squada One
(retro-digitale, altezza piena; scartato per il `4` a «Ч», divisivo). Scartati: Passion One, Lilita One, Alfa Slab One, Chakra
Petch, Archivo Black, Rubik Mono One, Russo One (aspetto ≥ 0,78: in A resterebbero alti 38–49 px), Saira Condensed/ExtraCondensed
Black e Fira Sans ExtraCondensed Black (controforme chiuse dall'anello: 0–29 % aperte), Fjalla One e Khand Bold (doppioni di
Bebas/Barlow). Fogli e metriche: `scratchpad/fonts_eval/` (sessione), tabella in `resources/fonts/README.md`.

## 3. Generatore `tools/gen_digits.py` v2 (contratto)

### 3.1 Geometria
- `GEOM[(piattaforma, taglia)] = (cell_w, rows_h, R, S)`: emery A (40, 66, 2, 2), emery B (64, 94, 2, 2); flint A (28, 42, 1, 0), flint B (48, 62, 1, 0) (D26). `rows_h` = righe disponibili al riempimento (invariate: oggi `strip_h − 2`).
- **`strip_h = rows_h + 2R + S`** (emery A 72, B 100; flint A 44, B 64: come oggi). Il riempimento occupa le righe `R .. R + digit_h − 1` (baseline comune come oggi: la cifra più alta parte dalla riga R); sotto restano `R` righe per l'anello e `S` per l'ombra. Il `':'` resta dove lo mette il font rispetto alla baseline, alzato/abbassato del minimo se il suo anello+ombra uscirebbe dalla strip (nota).
- Strip **compatta** (`--pack`, comportamento di default nel comando canonico): i glifi si disegnano prima in celle di lavoro larghe `cell_w + 2R + S + 2` (mai tagliare anello/ombra: se un pixel di anello o ombra dovesse uscire dalla cella di lavoro è un ERRORE, non un avviso), poi si ricompattano adiacenti; `ink[k].x/w` = colonne con almeno un pixel non trasparente (riempimento ∪ anello ∪ ombra); `strip_w` = somma degli inchiostri arrotondata al multiplo di 4. `cell_w` nell'header resta il passo del layout.
- Taglia B senza `':'` (`--no-colon-b`): `ink[10] = {0, 0}` come oggi.

### 3.2 Pixel
- Riempimento: come oggi (FreeType mono, `pick_px` con `--fit-width` su `riempimento + 2 ≤ cell_w`, D24).
- Anello: pixel a distanza di Chebyshev 1..R dal riempimento (R iterazioni di dilatazione 8-connessa), non riempimento.
- Ombra: `∪_{k=1..S} shift(riempimento ∪ anello, +k, +k)` meno `(riempimento ∪ anello)`.
- Ordine di priorità dove le regioni si toccano fra glifi: non si toccano (celle di lavoro separate, poi pack adiacente: i glifi compatti sono affiancati senza sovrapposizione perché ogni `ink` è un intervallo di colonne disgiunto).
- PNG RGBA a **4 colori esatti** (3 dove S = 0: nessun pixel d'ombra): (0,0,0,0) vuoto, (255,255,255,255) riempimento, (0,0,0,255) anello, (255,0,0,255) ombra. `strip_h` e `strip_w` del PNG uguali all'header.

### 3.3 Header `src/c/digit_metrics.h` (generato)
```c
#define DIGITS_GLYPHS 11
#define DIGITS_FONT_COUNT 5            /* righe di DIGITS_METRICS: 0 Anton, 1 Bebas, 2 Barlow, 3 Francois One, 4 Staatliches (LECO non ha strip) */
typedef struct { uint16_t x; uint8_t w; } DigitInk;      /* colonne con inchiostro (riempimento ∪ anello ∪ ombra) */
typedef struct {
  uint16_t strip_w, strip_h;   /* PNG; strip_h = rows_h + 2·ring + shadow */
  uint8_t  cell_w;             /* passo della griglia del LAYOUT (ui_time.c) */
  uint8_t  digit_h;            /* altezza reale del riempimento: righe ring .. ring + digit_h − 1 */
  uint8_t  ring;               /* R: spessore dell'anello = righe sopra il riempimento */
  uint8_t  shadow;             /* S: profondità dell'ombra (colonne/righe in più a destra e in basso) */
  uint8_t  px;                 /* pixel size FreeType (diagnostica) */
  DigitInk ink[DIGITS_GLYPHS];
} DigitStripMetrics;
static const DigitStripMetrics DIGITS_METRICS[DIGITS_FONT_COUNT][2];   /* #if PBL_COLOR … #else … */
static const uint32_t DIGITS_RESOURCE_IDS[DIGITS_FONT_COUNT][2];
```
Prima della scelta il generatore produce `DIGITS_FONT_COUNT 3` (stesse tre voci); con `francois` e `staatliches` in `FONTS`
(tabella **data-driven**: aggiungere una voce = una riga) la macro segue `len(FONTS)` = 5. Il commento in testa documenta i 4 colori,
R/S per piattaforma, la regola delle righe e il comando canonico (`--fit-width --no-colon-b --pack`).

### 3.4 Controlli del generatore (errore = exit 1, come oggi per i glifi troppo larghi)
- Riga peggiore nel layout A come la calcola `ui_time.c` (`prv_place_row`, **D25 rivista**: ogni glifo occupa
  `max(passo, RIEMPIMENTO + R)` con riempimento = `ink.w − 2R − S`; passo cifre = `cell_w` in 24 h, `cell_w − 2` in 12 h;
  passo `':'` = 16 emery / 12 flint): **24 h «20:44»** ≤ larghezza schermo (200/144), **12 h «10:44» + 4 + PM** e
  **12 h «09:44» + 4 + PM** (la riga con lo **zero iniziale**, `GAL_LZ_ON`: il primo glifo è uno `0` largo e non l'`1`;
  oggi misura quanto «10:44» con tutti e cinque i font, ma stringe il margine sinistro fino a 1 px con Staatliches su emery)
  ≤ larghezza schermo, con **PM = 18 px su entrambe le piattaforme** (Gothic 14 Bold,
  misurato: stesso font, stessa larghezza; prima si assumevano 24/20);
  in più la sporgenza dell'anello a sinistra (R) e di anello+ombra a destra (R + S) del blocco centrato deve restare nello
  schermo, altrimenti AVVISO (non errore: si perde qualche pixel di anello al bordo). Stampare i valori nella tabella.
- Taglia B: `2·max(passo, riempimento + R) + gap 8` ≤ larghezza schermo (banale, ma stampato).
- Anello/ombra tagliati dalla cella di lavoro = errore; PNG con più di 4 colori = errore (autocontrollo prima di scrivere).
- `--check` non scrive; output deterministico (`cmp` di due esecuzioni).
- `--preview DIR`: foglio di contatto con **i 4 stili** (pieno, pieno 3D, trasparente, trasparente 3D) resi con palette
  bianco/nero sopra un grigio medio, più la strip grezza a 4 colori.

## 4. Orologio (C, importanza alta — Fable)

- `settings.h`: `uint8_t digit_style; uint8_t reserved[5];` al posto di `reserved[6]` (20 B, schema 1); `enum GalDigitStyle
  { GAL_STYLE_FILL = 0, GAL_STYLE_OUTLINE = 1, GAL_STYLE_OUTLINE_3D = 2, GAL_STYLE_FILL_3D = 3 }`; `GAL_FONT_FRANCOIS = 4,
  GAL_FONT_STAATLICHES = 5`, `GAL_FONT_COUNT 6`; `static inline int8_t gal_font_strip(uint8_t font)` (−1 per LECO/fuori intervallo);
  `settings_validate`: `font < GAL_FONT_COUNT`, `digit_style <= GAL_STYLE_FILL_3D`; hook `GALLERIA_DEBUG_STYLE`.
- `ui_digits`: palette a 4 indici riconosciuti dal colore (0xFF riempimento, 0xC0 anello, 0xF0 ombra; ombra facoltativa →
  indice «assente» se il colore manca); `ui_digits_set_palette(size, fill, ring, shadow)` (ognuno può essere `GColorClear`);
  `ui_digits_draw` centra nel passo il **nucleo** (`w − shadow`), così l'ombra sporge a destra e il riempimento resta
  centrato in tutti gli stili; `ui_digits_load(size, strip_index)`; metriche esposte con `ring`/`shadow`.
- `ui_time`: costanti di layout espresse come **riga del riempimento** (A: 9 emery / 7 flint; B: HH 13, MM 121 emery, 13/93
  flint) e `strip_y = fill_y − ring`; `prv_strip_fits` controlla `strip_y ≥ 0` e `strip_y + strip_h ≤ limite` (A: `info_y`;
  B: altezza schermo); fascia in B da `strip_y` della riga MM; base di AM/PM = `strip_y + ring + digit_h`; `prv_apply_text_style`
  applica lo stile (tabella D21) alle strip caricate; log `ui_time:` con `sty=`; mapping font → strip via `gal_font_strip`.
- `sync.c` `sync_env_settings_changed`: `digit_style` diverso → `ui_time_style_changed()` (palette + redraw, nessuna strip da
  ricaricare).
- `package.json`: 4 risorse `DIGITS_FRANCOIS_A/B`, `DIGITS_STAATLICHES_A/B` (`2BitPalette`, `spaceOptimization memory`).
- Budget atteso (emery): strip A Anton 360×68 → ≈ 404×72 (+1,1 KB), strip B 492×96 → ≈ 552×100 (+2 KB): layout B ≥ 40 KB
  liberi da verificare nel gate per il font più largo; risorse ≈ 125 → ≈ 180 KB (< 256 KB).

## 5. Telefono (PKJS) e config page (importanza media — Opus)

- `album.js`: `SETTINGS_FIELDS` → `font` 0..5, nuova voce `['digit_style', 0, 3, 0]` (posizione: dopo `info_row`, l'ordine
  dell'array non è quello dei byte); `settingsBytes`: byte 12 = `digit_style` (poi 5 byte 0); commento della struct aggiornato.
- `page_core.js`: stessi `SETTINGS_FIELDS`; `normalizeSettings`: `font === 3 ⇒ digit_style = 0` (LECO non ha stile), regola
  LECO/layout invariata. `page.html`: riga `<p class="row"><label for="s_digit_style" class="rlab">Stile cifre</label>
  <select id="s_digit_style"></select></p>` subito dopo la riga Font. `page.js`: `OPTS.digit_style = [[0,'pieno'],
  [1,'trasparente (solo contorno)'],[2,'trasparente 3D (contorno + ombra)'],[3,'pieno 3D (con ombra)']]`, `SELECTS` +
  `'digit_style'`; regole UI in `applyLeco()` (rinominarla se serve): font LECO ⇒ `#s_digit_style` disabilitato e valore 0;
  stile 1 o 2 ⇒ `#s_outline` disabilitato (valore conservato); `state.platform === 'flint'` ⇒ opzioni 2 e 3 di `#s_digit_style`
  disabilitate e valore normalizzato 2 → 1, 3 → 0 (D26; anche in `normalizeSettings`? no: lì manca la piattaforma — la regola sta in page.js);
  font 4/5 con anteprima PNG (`GalPreviews.francois` / `.staatliches`).
  Font nella select: 0 Anton, 1 Bebas Neue, 2 Barlow Condensed, 3 LECO, 4 Francois One, 5 Staatliches (ordine per valore).
- `gen_font_previews.py`: `FONTS` + `francois`/`staatliches` (tetto 4.096 B del file: se sfora scende di altezza come oggi).
- `tools/galleria_devserver.py`: `SETTINGS_SPEC` `font` 0..5 e `digit_style` 0..3 (validazione di `--settings`/`/save`).
- `test/shim/fakewatch.js`: `DEFAULT_SETTINGS[12]` è già 0 (nessuna modifica necessaria; commento).
- Tetto della pagina inlinata: 65.536 B (oggi 61.043 B di HTML): misurare dopo ogni modifica (`make -C test pagecheck`).
- Test: `test_page.js` (nuova select, regole di disabilitazione, payload con `digit_style`, 6 opzioni font, anteprime Francois One/Staatliches),
  `test_album.js` (byte 12, CRC, normalizzazione font 4/5 e digit_style), `test_devpage.js`/selftest del dev server.

## 6. Documentazione da aggiornare a fine sessione
`galleria.md` (D3/D4 + D20–D24, §3 numeri delle strip, §4.1 `GalSettings`, §7 rendering, §8 budget), `galleria-s6-config-page.md`
§5 (campo e regole), `resources/fonts/README.md` (Francois One/Staatliches con sha256/blob, licenze, metriche), `tools/README.md` §10 (v2),
`apps/galleria/CLAUDE.md` (comandi, `GALLERIA_DEBUG_STYLE`, 4 colori), `PIANO.md` (§4 esito S8-stile, §5 memoria, §6 D20–D24, §8),
`docs/CONTINUA-QUI.md`, `store/` (screenshot da rifare solo in S9).

## 7. Gate (emulatore, prima di dichiarare finita la sessione)
1. `pebble build` verde emery+flint; `MEMORY USAGE` in PIANO §5; `make -C test` verde; `make -C test pagecheck`.
2. Screenshot emery: layout A × {Pieno, Trasparente, Trasparente 3D, Pieno 3D} con Anton su foto scura e chiara; layout B idem;
   Francois One e Staatliches in A e in B (pieno e trasparente 3D); 12 h «10:44 PM» in A con il font più largo (nessun taglio, PM dentro lo schermo);
   Quick View in B (riga singola con anello/ombra); flint: A e B Anton trasparente 3D, Francois One/Staatliches pieno.
3. Heap `after first render` per A e B con il font più largo (B ≥ 40 KB), nessun ERROR nei log, tick che ridisegna solo la fascia.
4. Cambio stile e font dal dev server (`--settings '{"digit_style":2,"font":4}'`) applicati senza riavvio.

## 8. Rischi
- ~~Quantizzazione del rosso (0xF0) nel `.pbi` per `~bw` (flint)~~ → **confermata** il 04/09 (prima build in emulatore: `digits: strip 3
  size=0 senza colore ombra`, ombra resa del colore dell'anello): risolta con D26 (flint senza ombra).
- Larghezza delle righe in 12 h con anello+ombra (§3.4): il generatore blocca, ma il controllo va rifatto in emulatore.
- Heap del layout B con il font più largo: se < 40 KB, S = 1 nella taglia B o font più stretto.

## 9. Compiti per importanza (regola permanente del progetto)
- **Alta (Fable)**: D20–D24, scelta di Francois One/Staatliches, codice C (§4), `package.json`, gate (§7), sintesi delle revisioni, PIANO/CONTINUA-QUI.
- **Media (Opus)**: valutazione dei candidati (fogli di contatto, metriche, giuria), `gen_digits.py` v2 (§3) + verifica
  adversariale, `gen_font_previews.py`, config page + PKJS + dev server + test (§5), revisori a lenti + scettici sul diff.
- **Bassa (Opus)**: download e pinning dei TTF/OFL, README dei font, `tools/README.md`, bozze di documentazione (§6).

## 10. Esito del gate (04/09/2026, emulatore, build P della sessione)

- Build verde emery+flint: statico **27.020 B** emery (.text 24.876, .data 112, .bss 1.776; +784 su v1.9), **26.908 B** flint; risorse
  **176.668 B** emery (10 strip: pbpack 108.268 B), **50.596 B** flint. `make -C test` verde (15.064 asserzioni + le aggiunte della pagina).
- Screenshot (scratchpad `gate/`): emery A Anton × 4 stili (e01–e04), Francois/Staatliches trasparente 3D (e05–e06), foto chiara con testo
  nero pieno e solo anello (e07–e08), layout B Anton/Francois/Staatliches (e09–e12), LECO con stile 2 → LECO normale (e13), 12 h «10:44 PM»
  Francois trasparente 3D dentro i 200 px (e14), Quick View in B → riga singola A con anello e ombra e ritorno (e15/e15b); flint: A Anton solo
  anello (f01), B Francois «3D» → solo anello senza avviso (f02), A Staatliches pieno su foto chiara (f03), A Anton «pieno 3D» → pieno (f04).
  Nessun ERROR/WARNING nei log; cambio stile/font dal dev server applicato senza riavvio (`luma(style)`/`luma(band)`).
- **Dopo la revisione finale** (sub-bitmap unica per taglia con `gbitmap_set_bounds`, metriche `packed`, D25 v2 poi v3 griglia adattiva del 05/09): statico
  **27.032 B** emery / **26.920 B** flint (26.844 / 26.732 prima della griglia adattiva); heap emery A Staatliches **44.356 B**, **B Anton 40.452 ✓ /
  Staatliches 39.952 / Francois One 38.852 B** (+500 B rispetto ai valori sotto); «09:44 PM» Staatliches pieno + contorno senza morsi
  (`s8stile_emery_a_staatliches_12h_contorno.png`); `make -C test` verde. I valori seguenti sono quelli della prima build.
- Heap libero dopo il primo render (prima build): emery **A 43.892 B** (Anton), 43.676 (Francois One), 43.820 (Staatliches); **B 39.952 B (Anton),
  39.452 (Staatliches), 38.352 (Francois One)** → ⚠️ **sotto l'obiettivo di 40 KB di S7 (O1)**: la strip B è cresciuta di 6 px per glifo e 4 righe
  (Anton 532×100 = 13.300 B contro 492×96 = 11.808) e lo statico di 784 B. Deviazione da decidere con l'utente (§11). flint: A 26.612 B, B 25.668 B.
- Riga 12 h con Francois One: «10:44 PM» = **194 px** (x0 = 3), PM leggibile; su flint 140/144. Con la D25 rivista e PM = 18 px
  la riga peggiore di tutte è **Staatliches = 196/200** (margini 13/2 in «10:44 PM»; «09:44 PM», la riga con lo zero iniziale,
  misura anch'essa 196); Anton e Bebas stanno a 190.

## 11. Problemi aperti / da decidere
- **Heap layout B < 40 KB su emery** (38,4–40,0 KB secondo il font). Opzioni: accettare (nessuna allocazione a regime oltre la strip A da 7,3 KB
  della Quick View, che resta a ~31 KB liberi); S = 1 nella taglia B (−0,3 KB, poco); anello 1 px in B (−0,5 KB, contro lo scopo);
  ridurre il chunk AppMessage da 4.096 a 2.048 B (−2 KB di inbox, ma 17 messaggi per foto invece di 9 → sync più lenta sul BLE reale);
  struct `DigitInk` packed (−120 B), **applicata** nella revisione (F4: `DigitInk` e `DigitStripMetrics` sono generate
  `__attribute__((packed))`). Le altre nessuna: decisione dell'utente.
- **Flint, stile trasparente**: l'anello da 1 px sul dithering Floyd–Steinberg è al limite della leggibilità (f01); R = 2 chiuderebbe le
  controforme di Anton (4 px). Da vedere sul Pebble 2 Duo vero; alternativa: su flint forzare «Contorno» pieno... no — proposta: lasciare così
  e documentare che lo stile trasparente è pensato per il Pebble Time 2.
- **Anton in stile trasparente, taglia A**: controforma dello `0` di 6 px → 2 px con l'anello (28 % aperta): le cifre tendono a chiudersi; in B
  (9 px) va bene. Francois One e Staatliches sono i font consigliati per lo stile trasparente: suggerire nella pagina (help) in S9.
- **Staatliches «1» = asta di 11 px**: nella griglia a celle fisse resta spazio ai lati («I0:44»). Accettato (carattere del font).
- Il dev server accetta `digit_style` 2/3 anche per scenario flint (la normalizzazione D26 sta nella pagina, non nel server).
- **Ombra che sporge di 1 px nel margine interno del vicino** (solo stili 3D, riga 12 h, cifre larghe adiacenti: il passo di
  D25 rivista copre riempimento + anello, non l'ombra, profonda S = 2 su emery): **accettato** — l'ombra cade sull'anello del
  glifo successivo, disegnato dopo, quindi si vede al più 1 px di rosso-opposto contro l'alone. Su flint non esiste (S = 0, D26).| **D25** | **Griglia UNIFORME adattata al font (terza versione, 05/09; segnalazione dell'utente: con Francois One in trasparenza le cifre si toccavano, e con tutti i font tranne Bebas Neue gli anelli erano a 0–1 px)**: `prv_place_row_fit` prova nell'ordine uno spazio minimo di **2, 1, 0 px fra gli anelli** con passo delle cifre = max(cella, nucleo della cifra **più larga** + gap) e passo del `:` = max(16, nucleo del `:` + gap) — nucleo = riempimento + 2R — e tiene il primo per cui la riga (+ 4 + «PM» in 12 h) sta in 200 − 2·2 px; in riserva max(cella, riempimento più largo + R) (sempre accettata: è l'unica che il generatore garantisce con errore; anelli sovrapposti al massimo di 1 px, mai sul riempimento). La griglia dipende solo da font, taglia e numero di glifi: **le cifre non si spostano al cambio di minuto** (D3/S3 rispettata). Righe emery A: 24 h gap 2 per tutti (Anton 183, Bebas 180, Barlow 195, Francois 193, Staatliches 192); 12 h + PM: Anton 195 e Bebas 194 (gap 0), Barlow/Francois/Staatliches 198 (riserva: gli anelli delle cifre larghe si toccano ancora, solo in 12 h). Storia: 1ª versione max(passo, riempimento) → l'anello mordeva lo stelo (F1); 2ª max(passo, riempimento + R) → anelli adiacenti/sovrapposti per i font larghi; 3ª bis (passi proporzionali per glifo) scartata perché il blocco centrato spostava le ore di ±4 px al cambio di minuto. | Con l'inchiostro totale «10:44 PM» sarebbe 207 px > 200 per tutti i font; la griglia fissa 40|40|16|40|40 era dimensionata per il riempimento con 1 px di margine, non per un anello da 2 px. |

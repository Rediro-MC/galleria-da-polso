# `i18n/` — dizionari della config page (S10/D35; S11: es e pt; S12: anteprima; UX-1: lessico unico; UX-2: struttura; UX-3: flusso della foto; UX-4: una stringa fr; S14: «Ora in basso», via le frecce del font)

`messages.json` è la **sorgente unica** dei testi della config page di Galleria in **italiano,
inglese, tedesco, francese, spagnolo e portoghese**. Sta fuori da `src/pkjs/` di proposito:
webpack non deve imbarcarlo com'è, il PKJS carica il modulo generato.

```json
{
  "chiave_parlante": { "it": "…", "en": "…", "de": "…", "fr": "…", "es": "…", "pt": "…" }
}
```

Oggi: **134 chiavi × 6 lingue**, 39.776 B (`wc -c i18n/messages.json`, 19/09/2026, S14 —
entra `opt_layout_a_bottom` (**D136**, terza voce di «Disposizione») ed escono `font_prev` e
`font_next` con le frecce del font (**D137**): 135 − 2 + 1 = 134; **D141** riscrive inoltre i testi
di `opt_font_leco`, `lbl_info_row` e `preview_note_info` senza muovere nessun indice; in tutto
−58 B; erano 39.834 B a fine
UX-4, 39.820 B a fine
UX-3, 132 × 6 e 38.127 B a fine UX-2, 126 × 6 e 36.573 B a fine UX-1, 135 × 6 e 37.529 B dopo S12,
121 × 6 e 33.326 B prima di S12, 121 × 4 e 23.128 B nella 0.2.0).
Testo per lingua: it 3.951 car., en 3.858, de 4.369, fr 4.516, es 4.012, pt 4.086 (la voce più lunga
è `help_why` in tutte e sei le lingue, fra 238 e 284 caratteri; il francese è cresciuto di 14
caratteri con D133).
Le **13** chiavi dell'anteprima della watchface (S12, D46/D47; in UX-2 due sono uscite e una è
entrata) sono `sec_preview`, `preview_cap_photo`, `preview_cap_none`,
**`preview_cap_none_album`**, `preview_auto`, `preview_outline_on`, `preview_outline_off`,
`preview_note_leco`, `preview_note_ampm`, `preview_note_info`, `preview_eye`,
`preview_unavailable` e `preview_note_no_masks`. Le **ultime due** dicono cose diverse e non vanno
scambiate: `preview_unavailable` è per l'anteprima che **non si vede** (motore assente o guasto,
canvas nascosto), `preview_note_no_masks` per l'anteprima che si vede **senza le cifre** (maschere
mancanti nello stato: c'è solo la foto). Da **UX-3** lo stesso motore disegna anche il canvas
dell'editor (D105), che ha due didascalie sue: `edit_preview_cap` quando il disegno riesce e
`preview_stale` quando no (lì il canvas resta com'è: sotto la cornice un buco si noterebbe).
`preview_white` e `preview_black` sono state **cancellate** in UX-2 (D84): erano identiche a
`opt_color_white`/`opt_color_black` in tutte e sei le lingue, e la nota del colore automatico usa
quelle.

## Che cosa è cambiato, sessione per sessione

Il diario chiave per chiave (quali sono uscite, quali sono entrate, con che testo e perché) sta nel
piano delle sessioni: `../../../docs/design/galleria-s13-ux-casual.md` §12 (UX-1, D68–D79), §13
(UX-2, D80–D103), §14 (UX-3, D104–D125) e §15 (UX-4, D126–D133); per S12 in
`../../../docs/design/galleria-s12-anteprima.md` (D46/D47, le chiavi dell'anteprima: 14 allora, 13 oggi). Il
glossario di `../../../docs/design/galleria-s10-i18n.md` §3 copre **tutte e 134** le chiavi con i
testi di oggi ed è una tripwire (`tools/galleria_gloss_check.py`, D132). Qui resta il conto.

| Sessione | Chiavi | `messages.json` | In una riga |
|---|---|---|---|
| **S12** (06/09/2026) | 121 → **135** | 33.326 → 37.529 B | le **14** chiavi dell'anteprima della watchface (D46/D47; oggi ne restano 13: in UX-2 due sono uscite e una è entrata) |
| **UX-1** (13/09/2026) | 135 → **126** | 37.529 → 36.573 B | lessico unico, 58 voci riscritte; **7** chiavi solo dev/prova diventano stringhe inglesi cablate in `page.js` e 4 `msg_*_err` si fondono in `msg_err` (**11 eliminate in tutto**, D72); entrano `help_sync` e `photos_cap_empty` |
| **UX-2** (13/09, sera) | 126 → **132** | 36.573 → 38.127 B | struttura della pagina: 6 eliminate (`watch_emery`, `status_no_state`, `msg_no_state_save`, `opt_auto`, `preview_white`, `preview_black`), 12 nuove in coda, 19 riscritte (D80–D103) |
| **UX-3** (13/09, notte) | 132 → **135** | 38.127 → 39.820 B | flusso della foto: 8 eliminate (la prima è `edit_name`, che era la chiave 45), 11 nuove in coda, nessuna riscritta (**D116**) |
| **UX-4** (14/09/2026) | 135 → **135** | 39.820 → **39.834 B** | una sola stringa, `preview_stale` in francese: «… c'est le recadrage **dans le cadre** qui compte» (**D133**, +14 B) |
| **S14** (19/09/2026) | 135 → **134** | 39.834 → **39.776 B** | cinque feature per la v1.0: entra `opt_layout_a_bottom` («Ora in basso, info sopra», **D136**) subito dopo `opt_layout_a`, escono `font_prev` e `font_next` con le frecce accanto al font (**D137**), e **tre sono riscritte** a indici fermi (**D141**, il lessico delle tre disposizioni): `opt_font_leco` «tranne Ora grande», `lbl_info_row` «Insieme all'ora» e `preview_note_info` «sopra o sotto l'ora» («Accanto all'ora», prima scelta del 19/09 sera, diceva una posizione che l'orologio non fa mai) |

⚠️ Una chiave che esce o entra **in mezzo** sposta gli indici di tutte quelle dopo (UX-1 da
`msg_crop_cancel`, UX-2 da `watch_flint`, UX-3 da `edit_name`): `src/pkjs/i18n.js`,
`test/fixture_i18n.js` e `src/pkjs/config_page.js` vanno rigenerati **insieme**, e
`make -C test pagecheck` se ne accorge. Né in UX-3 né in UX-4 le chiavi nuove finiscono in una
`<option>` o in una `.rlab`, quindi le due liste della tripwire di lunghezza (sezione «Regole»)
restavano a 29 e 16 e `tools/build_i18n.py` non cambiava (D123). In **S14** invece la chiave nuova
è proprio un'`<option>`: `OPTIONS` passa a **30** (`opt_layout_a_bottom`), `LABELS` resta 16 e
`RENDER_ARGS['opt_hours']` rende ora **«12»** e non più «3», perché D139 aggiunge le voci
«ogni 6 h» e «ogni 12 h».

## Come si rigenera (mai a mano)

Tutti i comandi si lanciano dalla **cartella dell'app** (`apps/galleria`):

```bash
python3 ../../tools/build_i18n.py            # messages.json → src/pkjs/i18n.js + test/fixture_i18n.js
python3 ../../tools/build_i18n.py --check    # 0 se sono aggiornati, 1 altrimenti (dentro `make -C test pagecheck`)
python3 ../../tools/build_i18n.py --selftest # 32 controlli su una cartella temporanea
make -C test pagecheck                       # build_i18n --check + build_config_page --check + fixture della pagina + maschere delle cifre + fixture dell'anteprima
```

I due file generati sono identici e **ASCII** (accenti come `\uXXXX`):
`module.exports = { keys: [...], en: [...], it: [...], de: [...], fr: [...], es: [...], pt: [...] }`,
array **nell'ordine del file**. `src/pkjs/i18n.js` (**36.482 B** misurati il 19/09/2026 in S14;
36.500 B a fine UX-4, 36.486 B a fine UX-3, 34.859 B a fine UX-2, 33.589 B a fine UX-1, 34.031 B con 135 chiavi dopo S12,
30.124 prima di S12)
finisce nello stato dell'hash della pagina (tutte e sei le lingue: il cambio lingua nella pagina è
istantaneo, senza tornare al PKJS; i sei dizionari pesano **36.959 caratteri** di base64url
— 27.719 B di JSON UTF-8 × 4/3 —, erano 36.934 a fine UX-4, 36.915 a fine UX-3, 35.024 a fine UX-2, 33.684 a fine UX-1,
≈ 33,4 k con le 135 chiavi di S12, ≈ 30,0 k con 121 e ≈ 19,9 k con quattro lingue);
`test/fixture_i18n.js` è la stessa cosa per i test node (stessi 36.482 B).
Nell'hash viaggiano i **soli sei array** (`i18nDicts()` in `src/pkjs/index.js` scarta `keys`): la
misura si rifà con `JSON.stringify({en,it,de,fr,es,pt})` passato per `b64.encodeUtf8`.

⚠️ L'elenco delle lingue è ripetuto in cinque posti e **deve coincidere ovunque** (D39, ordine
`en, it, de, fr, es, pt` negli array): `LANGS`/`OUT_LANGS` di `tools/build_i18n.py`, `LANGS` di
`src/pkjs/config/page_core.js`, `LANG_ORDER` di `src/pkjs/index.js`, `PAGE_LANGS` di
`tools/galleria_devserver.py` e l'`enum GalLang` dell'orologio (`src/c/settings.h`, 1..6).
`tools/build_config_page.py` confronta i primi tre a ogni `--check` e si ferma nominando il file
rimasto indietro.

## Regole

- **L'ordine delle chiavi conta**: l'indice di una chiave è la sua posizione, ed è quello che
  `tools/build_config_page.py` scrive nell'artefatto al posto del nome (`T('chiave'` → `T(12`,
  `data-i18n="chiave"` → `data-i18n="12"`). Aggiungere una chiave in mezzo cambia gli indici:
  rigenerare **tutto insieme** (`pagecheck` esegue prima `build_i18n --check`, poi quello della
  pagina).
- Chiavi in `snake_case`, nomi parlanti; i campi che iniziano con `_` sono commenti. **Mai
  riusare un nome già in elenco**: in S12 `preview_off` esisteva già (è il messaggio dell'anteprima
  del ritaglio che non si è potuta disegnare), quindi la coppia sì/no del contorno si chiama
  `preview_outline_on`/`preview_outline_off`. Un doppione fa fallire `build_i18n.py`. In **UX-3**
  quel messaggio è stato riscritto e rinominato **`preview_stale`** e `preview_off` è uscito: il
  nome libero **non si ricicla** e `preview_outline_on`/`preview_outline_off` restano quelli.
- Ogni voce ha **esattamente** le 6 lingue nell'ordine `it, en, de, fr, es, pt`; testi non vuoti,
  **senza backtick** (la pagina viene inlinata in una stringa) e senza CR.
- Segnaposto solo `{0}` e `{1}`, con lo **stesso insieme** in tutte le lingue della voce
  (`T('chiave', a, b)` li sostituisce in una passata sola).
- **Niente plurali**: si riformula (« Foto da togliere: 3 »), niente doppie forme.
- **Un concetto, una parola per lingua**: prima di aggiungere una voce si cerca come è già
  tradotto lo stesso termine (`grep`), soprattutto nelle lingue arrivate dopo (es, pt). In S12 le
  voci nuove dell'anteprima dicevano «prévia» mentre quelle vecchie dicevano **«pré-visualização»**:
  nella stessa pagina si leggevano due parole per la stessa cosa, ed è quella neutra
  Brasile/Portogallo che vince. Oggi la parola è in `preview_stale` (ex `preview_off`, UX-3), `preview_note_leco` e
  `preview_eye` (in es «vista previa» nelle stesse tre); `lbl_preview` è diventata «Colori» in UX-1
  e `msg_preview_err` è sparita con la fusione in `msg_err`.
- **Nomi propri fuori dal dizionario**: Galleria, Pebble, Pebble Time 2, Pebble 2 Duo, Anton, Bebas
  Neue, Barlow Condensed, Francois One, Staatliches, LECO, Floyd–Steinberg, Atkinson, Bayer 4×4,
  «KB». Da UX-2 (**D99**) anche la riga dell'orologio nell'intestazione: «Pebble Time 2» è **cablato
  in `page.js`** (`watch_emery` cancellata), mentre `watch_flint` resta in dizionario solo perché
  porta una coda traducibile («Pebble 2 Duo · bianco e nero»). ⚠️ Da UX-1 **«slot», gamma, lift e dithering non sono più nomi propri**: «slot» non compare
  più in nessun testo (è «foto»), «dithering» è diventato «Sfumature» (`lbl_dither`), gamma e lift
  sono «Luminosità» e «Schiarisci le ombre»; restano nomi propri i tre algoritmi del dithering.
- **Registro**: it «tu», en neutro, **de «du»**, **fr «vous»**, **es «tú»**, **pt «você»** (D42;
  lessico neutro per Spagna/America e Brasile/Portogallo, con la forma brasiliana dove le varianti
  divergono: «Salvar», «Configurações»); spazio prima di `: ; ! ?` in francese; maiuscole tedesche
  sui sostantivi; in spagnolo i punti interrogativi/esclamativi si aprono (`¿`, `¡`). In francese lo
  spazio è **semplice** (U+0020, mai U+00A0) e l'unità resta «KB» (D67).
- **Le `<option>` sono minuscole** (D68): maiuscola iniziale solo se il testo comincia con un nome
  proprio o con «Ora»/«Font» («Ora in alto, info sotto», «Font di sistema (tranne Ora grande)»);
  dentro una stessa select lo stile è uniforme in tutte e sei le lingue. **Deroga tedesca**: in de
  il **sostantivo resta maiuscolo** anche in apertura di `<option>` — è ortografia, non stile:
  «nur Kontur», «Kontur mit Schatten», «Systemschrift (außer Große Uhrzeit)» —, quindi in tedesco
  l'uniformità dentro la select si giudica sui **non-sostantivi** («gefüllt», «automatisch»,
  «nie», «zufällig» minuscoli). Unica select maiuscola in tutte e sei le lingue: quella della
  Lingua, dove `opt_lang_auto` («Automatica (orologio: {0})», de «Automatisch (Uhr: {0})») segue
  gli **endonimi** «English», «Italiano», «Deutsch», «Français», «Español», «Português», che sono
  nomi propri e stanno fuori dal dizionario.
- **Tripwire di lunghezza** (D70, in `tools/build_i18n.py`, attiva sia in generazione sia in
  `--check`): la vecchia raccomandazione «≤ 28 caratteri dove si può» è diventata un controllo per
  **lista esplicita di chiavi**, misurato in code point sul testo **renderizzato** (segnaposto
  sostituiti con il valore più lungo che la pagina ci mette davvero):
  - `OPTIONS`, le **30** chiavi che finiscono in una `<option>` (da **S14** c'è anche
    `opt_layout_a_bottom`, la terza voce di «Disposizione», D136): **≤ 28**, con tre eccezioni a **36**
    (`opt_font_leco`; `opt_lang_auto` reso con «Português»; `opt_style_no_flint` reso con la più
    lunga fra le quattro `opt_style_*` **e i due colori spenti su Duo** della stessa lingua) e
    `opt_minutes`/`opt_hours` resi con «60» e «12» (S14/D139: la pagina mette 3, 6 e 12);
  - `LABELS`, le **16** `lbl_*` della colonna da 9,5 em: **≤ 22**.
  Le etichette di casella (`opt_sunlight`, `opt_shake_next`, `opt_info_*`, `opt_info_bt`) e i
  paragrafi **non** sono in lista. Una chiave elencata che non esiste in `messages.json` è un
  **errore** («lista da aggiornare»), non un controllo che sparisce in silenzio.
  ⚠️ **Margini al 13/09/2026, fine UX-2: quattro chiavi a zero.** `lbl_lang` **22/22** in it
  («Lingua (pagina e data)»), de («Sprache (Seite, Datum)»), es («Idioma (página, fecha)») e pt
  («Idioma (página e data)»); `opt_color_auto` in fr **28/28** («automatique (selon la photo)»);
  `opt_layout_a` in fr 28/28; `opt_style_no_flint` in en 36/36. Una parola in più su una di queste e
  la tripwire si accende: prima di allungare un testo, misurare.
- **I testi solo dev/prova non stanno qui** (D72): quello che si vede unicamente con
  `mode() === 'dev'` o `'test'` è una stringa inglese cablata in `page.js`, come il ripiego di
  `page_core.js` quando lo stato manca. Una chiave in più costa byte nell'URL in tutte e sei le
  lingue anche quando il telefono non la mostra mai.
- I numeri decimali **non** stanno qui: li formatta `dec()` (en `.`, it/de/fr/es/pt `,`).
- ⚠️ Questi testi hanno accenti: **non devono mai passare per `log()`** del PKJS (F-S8-2: una riga
  con un accento fa morire `pebble logs`). I dizionari viaggiano solo nell'hash dell'URL.

Glossario e criteri di traduzione: `../../../docs/design/galleria-s10-i18n.md` §3; lingue spagnola
e portoghese (D39–D42): `../../../docs/design/galleria-s11-lingue-es-pt.md`.

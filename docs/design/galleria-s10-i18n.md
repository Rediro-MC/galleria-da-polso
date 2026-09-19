# Galleria — S10: multilingua sull'orologio e nella config page (EN / IT / DE / FR; **sei lingue da S11**: + ES / PT)

> Sessione del **5–6 settembre 2026**. Richiesta dell'utente (05/09 sera): «Aggiungiamo il supporto multilingua alla
> watchface: inglese, italiano, tedesco e francese. Sia nella parte di app che sulla watchface». Decisioni prese con
> l'utente la sera stessa: (1) impostazione «Lingua» (auto/en/it/de/fr) valida per pagina e orologio; (2) sull'orologio
> **niente parole**: simbolo di caricamento universale + «k/n»; (3) pagina con dizionari fuori dall'HTML; (4) store in
> inglese, testo corto (già fatto: `store/description.txt`, 789 caratteri; va incollato in dashboard con la 0.2.0);
> lingua automatica = **quella dell'orologio**; registro **DE «du», FR «vous»**; simbolo = **freccia circolare**.
> Ricognizione (3 agenti, 05/09): esiti in `PIANO.md` §4 S10 e nei fatti citati qui sotto.

> ⚠️ **Superata in parte da S11** (06/09/2026, `galleria-s11-lingue-es-pt.md`, decisioni **D39–D42**): le lingue sono
> **sei** — en, it, de, fr, **es**, **pt** — e la versione allora prevista era la **0.3.0**, mai pubblicata:
> oggi la release è la **0.4.0** (UX-4/D126). Dove qui si legge «quattro lingue», `lang <= 4`,
> `LANGS = ['en','it','de','fr']`, `WDAY[4][7][4]`/`MON[4][12][7]` = 448 B, `DATEFMT_MAX_LEN` 13 o
> «121 chiavi × 4 lingue», vale la versione a sei di S11 (`GAL_LANG_LAST` = `GAL_LANG_PT` = 6, tabelle `[6][7][5]` e
> `[6][12][7]` = 714 B, `DATEFMT_MAX_LEN` 14, 121 chiavi × 6 lingue — 🔁 **oggi 134 chiavi × 6**, dopo S12, UX-1, UX-2, UX-3 e S14: il conteggio vivo sta in §3). Le decisioni D31–D38 restano valide così come
> sono scritte: S11 le **estende**, non le cambia (il registro es è «tú», pt «você»; il separatore delle migliaia di
> es e pt è `.`, senza eccezioni — D41). Il **glossario §3** qui sotto ha già le colonne es/pt.

## 0. Fatti che vincolano il design

| Fatto | Prova |
|---|---|
| 🔁 **Fatto di S10, superato da S12/D43** (misure del 05/09/2026): l'HTML inlinato della config page era **64.222 B** su un tetto duro di **65.536 B** (`tools/build_config_page.py` MAX_BYTES), 1.314 B di margine. Oggi il tetto è **98.304 B** (avviso soft 86.016) e la pagina misura **85.476 B** (14/09/2026, fine UX-4). Il testo italiano vale ≈ 3,4 KB (163 stringhe distinte: 41 nodi in `page.html`, ~110 in `page.js`, 13 in `page_core.js`, di cui ~22 concatenazioni con valori). Una lingua in più **non entra**; tre nemmeno. Misurato: pagina a chiavi senza testi = **62.093 B**. | ricognizione «pagina», simulazione con `build_config_page.py --dir` |
| Il bundle PKJS (173 KB) e l'hash dello stato (2–24 KB oggi, URL `data:` misurato 100–122 k caratteri su Android, tetto Android 2 MiB) **non hanno** il tetto dei 64 KB. 🔁 **Numeri di oggi** (14/09/2026, fine UX-4): bundle PKJS ≈ **368 KB** (le maschere delle cifre di S12 pesano 121.107 B), hash **81.218** caratteri su emery e **57.551** su flint ad album vuoto, URL `data:` **195.223** / **171.556** (fino a **221.703** su emery con 12 foto e miniature vere). | `run_s8_06.log`, `run_s8_12_rev_page.log` |
| Sull'orologio l'**unica parola** è «Foto %u/%u» (`ui_time.c:985/987`); la data usa `strftime %a/%b` con `setlocale(LC_ALL, "")` (`main.c:89`) → il **firmware** la traduce se sull'orologio c'è il language pack (PT2 dell'utente: it_IT → «Sab 5 Set»; emulatore: en_US fisso, pack non installabile). AM/PM invariati in it/de/fr. | `ui_time.c:509-518`, PebbleOS `strftime.c`, `tintin.po` it/de/fr |
| Abbreviazioni dei pack: it `Dom Lun Mar Mer Gio Ven Sab / Gen Feb Mar Apr Mag Giu Lug Ago Set Ott Nov Dic`; de `So Mo Di Mi Do Fr Sa / Jan Feb Mär Apr Mai Jun Jul Aug Sep Okt Nov Dez`; fr `Dim Lun Mar Mer Jeu Ven Sam / Janv. Févr. Mars Avr. Mai Juin Juill. Août Sept. Oct. Nov. Déc.`; en `Sun…Sat / Jan…Dec`. I font Gothic 14/18/24 Bold di sistema hanno i glifi accentati (U+00A0–017F) ma **non** U+202F. | `tintin.po`, `.pbf` di PebbleOS |
| `GalSettings` (20 B): byte 12 `digit_style`, **byte 13 = primo di `reserved[5]`** → `lang`; CRC-16 sui 18 B; default a 0 ⇒ CRC dei default invariato (`0x7EE7`); `settings_validate` non controlla i reserved (orologio vecchio + PKJS nuovo: ok); PKJS vecchio + orologio nuovo: azzera l'override a ogni HELLO (accettato: il valore lo imposta la pagina). | `settings.h:27-42`, `album.js:140-151`, `test_album.js:327` |
| `Pebble.getActiveWatchInfo().language` = lingua **dell'orologio** («it_IT», «en_GB»…); `null` con orologio scollegato (già gestito per `platform`). `navigator.language` esiste nella WebView della pagina (telefono), **non** nel PKJS su iOS (JavaScriptCore) e vale sempre `en-GB` in pypkjs. | doc SDK, `pypkjs/javascript/navigator`, `index.js:310-315` |
| Bug pregresso: separatore delle migliaia dei passi = `,` se il locale inizia per `en`, altrimenti `.`; in francese è lo **spazio** (`1 234`). | `ui_time.c:820-821` |
| Lo store non localizza nome/descrizione/immagini (doc SDK); la descrizione si cambia **solo in dashboard** (`PUBLISH.md` §9); le release notes sì a ogni release. | `PUBLISH.md`, record live dell'app |

## 1. Decisioni (D31–D38)

- **D31 — impostazione `lang`**: `GalSettings.lang` al byte 13 (`enum GalLang { GAL_LANG_AUTO = 0, GAL_LANG_EN = 1, GAL_LANG_IT = 2, GAL_LANG_DE = 3, GAL_LANG_FR = 4 }`), `reserved[4]` residui, `settings_validate` ⇒ `lang <= 4`, default 0 (🔁 **S11/D39**: l'enum arriva a `GAL_LANG_ES = 5` e `GAL_LANG_PT = 6` con `GAL_LANG_LAST = GAL_LANG_PT`, e `settings_validate` confronta con `GAL_LANG_LAST` ⇒ **`lang <= 6`**; `settings.h:30-31`, `settings.c:47`). Nessuna messageKey nuova, HELLO 119 B invariato, schema persist invariato (i blob vecchi leggono 0 = auto). Vale per **la pagina** (lingua dei testi) e per **l'orologio** (data e separatore delle migliaia).
- **D32 — sync senza parole**: «Foto k/n» diventa **icona di sincronizzazione + «k/n»** (`"%u/%u"`, buffer «255/255»), in entrambi i layout e su entrambe le piattaforme. Icona = **freccia circolare** disegnata con primitive (arco ≈ 300° + punta di freccia), nel colore del testo con la stessa regola di alone/contorno dell'icona BT (`prv_draw_bt_lines`); taglia = altezza del font della riga (A: 16 px con Gothic 18, 20 px con Gothic 24 ExtraLarge; B e flint: 12 px con Gothic 14); spessore tratto 2 px su emery, 1 px su flint; spazio icona–testo 3 px. Il testo della sync non contiene più lettere: nessun problema di discendenti in B.
- **D33 — lingua automatica = orologio**: nel PKJS `langAuto = map(getActiveWatchInfo().language)` con `it*→it`, `de*→de`, `fr*→fr`, `en*→en`, altro/assente → **en** (ripiego 2: `navigator.language` se disponibile nel runtime; ripiego 3: `en`). In DEV (emulatore) l'hook `hooks.lang` del dev server (`--lang it|en|de|fr`) forza `langAuto`. L'orologio in auto continua a usare **`strftime`** (rispetta qualunque pack, anche es/pt/ru, e coincide con notifiche/calendario).
- **D34 — override sull'orologio**: con `lang` 1–4 la data usa **tabelle proprie** identiche alle abbreviazioni dei pack (tabella qui sopra) e un **formato per lingua**: en «Sat 5 Sep», it «Sab 5 Set», fr «Sam 5 Sept.», de «Sa, 5. Sep» (la convenzione del `%c` del pack tedesco). 🔁 **S11/D39–D41**: le lingue sono **sei** (`lang` 1–6, es «sá 5 sep» e pt «Sáb 5 de Set»), le tabelle di `datefmt.c` sono `WDAY[6][7][5]` + `MON[6][12][7]` = **714 B** (erano `[4][7][4]` + `[4][12][7]` = 448 B con quattro lingue; `datefmt.c:14` e `:22`), `DATEFMT_MAX_LEN` è **14** (`datefmt.h:18`) e il separatore delle migliaia di es/pt è `.` senza eccezioni. Livelli di accorciamento invariati: livello 1 «Sab 5» (de «Sa, 5.»), livello 2 «5». Separatore delle migliaia: en `,`; it/de `.`; fr **spazio normale** (U+0020: U+202F non è nei font). In auto il separatore segue il prefisso del locale di sistema con la stessa tabella (en `,`, fr ` `, altro `.`) — corregge il bug pregresso.
- **D35 — dizionari fuori dall'HTML**: sorgente unica `apps/galleria/i18n/messages.json` (fuori da `src/pkjs/`: webpack non deve vederlo) (`{ "chiave": { "it": "…", "en": "…", "de": "…", "fr": "…" } }`, chiavi parlanti `snake_case`, ordine = ordine del file). Il tool `tools/build_i18n.py` genera **`src/pkjs/i18n.js`** (ES5: `module.exports = { keys: [...], en: [...], it: [...], de: [...], fr: [...] }`, array nell'ordine delle chiavi, ASCII con `\uXXXX`) e **`apps/galleria/test/fixture_i18n.js`** (stessa cosa per i test node); `--check` fallisce se una chiave manca in una lingua, se i segnaposto `{0}`/`{1}` non coincidono fra le lingue, se un testo ha backtick o se `messages.json` non è ordinato/valido; `make -C test pagecheck` esegue anche `build_i18n.py --check`. I sorgenti della pagina usano **chiavi**: in JS `T('chiave')` e `T('chiave', a, b)` (sostituisce `{0}`,`{1}`), nell'HTML `data-i18n="chiave"` (testo dell'elemento) e `data-i18n-title="chiave"` (attributo `title`), nodi di testo **vuoti** nel markup. `tools/build_config_page.py` converte, nell'artefatto inlinato, `T('chiave'` → `T(n` e `data-i18n="chiave"` → `data-i18n="n"` (indice della chiave) e fallisce se una chiave non esiste; `T` accetta numero **o** stringa (nei test sui sorgenti le stringhe vengono risolte con `fixture_i18n.js`). Il PKJS mette nello stato dell'hash `i18n: { en: [...], it: [...], de: [...], fr: [...] }` (tutti e quattro: cambio lingua **istantaneo** nella pagina) e `lang_auto: "it"`; la pagina calcola `lingua effettiva = settings.lang ? nome(settings.lang) : lang_auto` e applica il dizionario a markup, `OPTS`, messaggi; al `change` del select «Lingua» ri-applica subito. Senza stato (pagina aperta a mano, hash assente o rotto) la pagina resta in **inglese minimo**: i 4 messaggi di errore di `page_core.js` (`decodeState`, `capMessage`) hanno un ripiego inglese cablato, tutto il resto mostra la chiave (modalità prova, non raggiungibile dal telefono). Numeri: separatore decimale per lingua (en `.`; it/de/fr `,`) in `page.js:316` `it()` (rinominare `dec()`), `page_core.js:198` `secondsText`, valori iniziali di `page.html:38-39`; unità «KB» invariata in tutte le lingue. **Plurali**: si riformula per evitarli (es. «Foto da togliere: 3», «Photos to remove: 3»); niente doppie forme. Nomi propri fuori dal dizionario: Galleria, Pebble, Pebble Time 2, Pebble 2 Duo, Anton, Bebas Neue, Barlow Condensed, Francois One, Staatliches, LECO, Floyd–Steinberg, Atkinson, Bayer 4×4 (**rivisto da UX-1**: «slot», gamma, lift e dithering NON sono più nomi propri — si traducono o spariscono, §3). Le voci dell'app Pebble nella procedura «rimuovi e reinstalla» si descrivono **senza citare il nome esatto dei pulsanti** (che non conosciamo in de/fr): «rimuovi Galleria dall'orologio (non aggiornarla)». Registro: it «tu», en neutro, **de «du»**, **fr «vous»**.
  > 🔁 **D35 rivista da UX-1** (13/09/2026, decisioni D69/D70/D72 del contratto UX-1; il meccanismo — sorgente unica,
  > indici, `build_i18n.py`, stato nell'hash — resta identico, cambia solo che cosa sta nel dizionario):
  > • **«slot» esce dai testi** in tutte e sei le lingue (nel codice resta): l'insieme è «le tue foto», la tessera
  >   «Foto {0}» con la posizione visibile; **«dithering» esce dai nomi propri** e diventa «Sfumature» (`lbl_dither`,
  >   con «nessuna» come prima option e i soli Floyd–Steinberg/Bayer 4×4/Atkinson invariati); **gamma** e **lift**
  >   spariscono dalle etichette («Luminosità», «Schiarisci le ombre») e saranno ammessi al più dentro il blocco
  >   «Regolazioni della foto» dell'editor, che arriva in **UX-3** (fatto: chiave `edit_adv_btn`, D114).
  > • **Chiavi solo dev/prova fuori dal dizionario (D72)**: `msg_sending`, `msg_saved`, `msg_save_fail`,
  >   `err_no_reply`, `err_no_dev_server`, `msg_test_payload`, `msg_test_close` sono stringhe **inglesi cablate** in
  >   `page.js` (raggiungibili solo con `mode()` 'dev' o 'test'); `msg_editor_err`, `msg_preview_err`, `msg_save_err`
  >   e `msg_boot_err` si fondono in **`msg_err`** (senza segnaposto: il dettaglio tecnico va nel `title` di `#msg`) e
  >   il catch di avvio usa una frase inglese cablata, perché senza dizionario `T()` stamperebbe un numero. Il ripiego
  >   inglese cablato di `page_core.js` (`decodeState`, `capMessage`) resta e segue i testi en di `cap_over`/
  >   `cap_over_fix`.
  > • **Due chiavi nuove in coda**: `help_sync` (che cosa succede dopo Salva) e `photos_cap_empty` (contatore con
  >   zero foto). Bilancio: 135 − 11 + 2 = **126 chiavi**, di cui **58 riscritte** in tutte e sei le lingue.
  >   L'ordine delle 124 chiavi rimaste non cambia, ma gli indici sì (le eliminate stavano in mezzo, le prime
  >   due subito dopo `msg_read_fail`): `src/pkjs/i18n.js`, `test/fixture_i18n.js` e `src/pkjs/config_page.js` si rigenerano
  >   sempre insieme.
  > • **D35 sui numeri confermata**: nessuna quota di sistema cablata nei testi (il 12 arriva sempre da
  >   `C.MAX_SLOTS` come `{0}`) e nessuna chiave con lo stesso testo in sei lingue, con **due eccezioni** oggi in
  >   file, entrambe fuori dal perimetro UX-1: `lbl_zoom` («Zoom») e `edit_name` («{0} · {1} px», che sparisce con
  >   U-06 in UX-3). **Fatto in UX-3** (D115): `edit_name` è uscita dal dizionario — nome del file e pixel li
  >   scrive `page.js` —, quindi l'unica eccezione rimasta è `lbl_zoom`.
  > • **Lunghezze**: la raccomandazione «≤ 28 dove possibile» diventa la **tripwire D70** di `tools/build_i18n.py`
  >   (liste esplicite `OPTIONS`/`LABELS`, misura sul testo renderizzato): vedi §3.
  > 🔁 **D35 rivista da UX-2/UX-3 e riletta in UX-4** (13–14/09/2026; decisioni D80–D103 e D104–D125 di
  > `galleria-s13-ux-casual.md` §13–§14; il meccanismo — sorgente unica, indici, `build_i18n.py`, dizionari
  > nell'hash — resta quello di S10):
  > • **Lessico unico di S13 §2.2** (U-01, vincolante per ogni chiave nuova o riscritta): «le tue foto» (mai
  >   «album» né «elenco» come nome dell'insieme, D75), «Foto {0}» con la posizione visibile, «Galleria» (mai
  >   watchface/esfera/mostrador), «l'orologio», «il telefono» (de «Telefon», D60), «app Pebble», «lo schermo
  >   dell'orologio» (mai vetro/Glas/vidro), un solo verbo per togliere (`btn_delete` «Togli»), «inviare» (mai
  >   «mandare»), «avviarsi» (mai «accendersi»), it/es mai in prima persona, pt base BR neutra, fr con spazio
  >   semplice prima di «:» e «KB» ovunque (D67), option minuscole (D68). La tabella di §3 è la sola fonte e si
  >   riallinea a `messages.json` a fine di ogni sessione.
  > • **Conteggio**: 126 (UX-1) → **132** (UX-2, D80–D99: −6 `watch_emery`, `status_no_state`,
  >   `msg_no_state_save`, `opt_auto`, `preview_white`, `preview_black`, +12 in coda) → **135** (UX-3, D116:
  >   −8 `edit_name`, `edit_time`, `preview_off`, `msg_close_crop` e i quattro `err_*`, +11 in coda). Le eliminate
  >   stavano in mezzo (`edit_name` era la 45): `i18n.js`, `fixture_i18n.js` e `config_page.js` si rigenerano
  >   sempre insieme.
  > • **D72 corretta ed estesa**: le stringhe inglesi cablate sono quelle che si vedono solo sul dev server
  >   (`page.js:981–995`: «Saved (seq …)», «Save failed: …», «no reply in 30 s», «Sending N KB…»), il `title`
  >   di `#msg` per i quattro `err_*` dell'editor e la riga dei tempi `#etime` (D114/D116). **`msg_sending` è
  >   invece tornata nel dizionario** («Invio all'orologio…», D108): la vede chi salva dal telefono
  >   (`page.js:1017`), quindi l'elenco del punto D72 qui sopra vale al netto di questa chiave.
  > • **Nomi propri fuori dal dizionario, confermato**: nome dell'orologio («Pebble Time 2» cablato, D99), nome
  >   del file e pixel (`page.js` scrive `#editName` e il suo `title`, D115), «12:34» (`preview_time` dallo
  >   stato). Unica chiave con lo stesso testo in sei lingue: `lbl_zoom` (verificato il 14/09/2026 su 135 chiavi).
  > • **Ripiego senza stato**: `#status` e il rifiuto di Salva sono frasi inglesi cablate con l'errore nel
  >   `title` (D83); il ripiego inglese di `page_core.js` (`decodeState`, `capMessage`) resta. (I `file:riga` di questo blocco sono righe del working tree del 14/09/2026 dopo D127.)
- **D36 — select «Lingua»**: in `#settings` come **prima riga** delle impostazioni (id `s_lang`, opzioni con endonimi: «Automatica (orologio: Italiano)», «English», «Italiano», «Deutsch», «Français»; l'etichetta «Automatica» mostra fra parentesi la lingua che risulterebbe), presente anche in modalità prova (disabilitata come tutto il resto). Cambia `settings.lang` nel payload come le altre impostazioni (nessuna sync speciale).
  > 🔁 **D36 rivista da D49** (UX-2, `galleria-s13-ux-casual.md` §7 e §13; riletta in UX-4 contro il codice):
  > la Lingua non è più la **prima** riga di `#settings` ma l'**ultima riga visibile delle impostazioni**:
  > `page.html:75–76`, dentro il contenitore `#misc` (bordo superiore, `page.css:191`) che chiude `#settings`
  > dopo l'anteprima `#wfPrev` (:69–74) e prima del pulsante «Altre impostazioni ▾» (:77, chiuso di default);
  > sotto di lei restano solo il blocco ripiegato, la sezione «Aiuto» (:95) e il footer fisso. Chi la cerca la
  > trova in fondo alle impostazioni senza aprire niente (lo scopo di D36 è conservato) e la prima riga letta
  > è ora «Aspetto dell'ora». Etichetta `lbl_lang` «Lingua (pagina e data)», che dice anche che l'impostazione
  > vale per la data sull'orologio (D34/D37), non solo per i testi della pagina. Le `<option>` sono **sette**:
  > `opt_lang_auto` «Automatica (orologio: {0})» con {0} = endonimo della lingua automatica, più i sei endonimi
  > «English», «Italiano», «Deutsch», «Français», «Español», «Português» (S11/D39), ognuno con `lang="xx"`
  > (D89/U-16; `fill()` in `page.js:107–114`) perché uno screen reader pronunci ogni endonimo nella sua lingua.
  > Al `change` (`settingsChanged`, `page.js:255–258`) la pagina riapplica il dizionario e ricostruisce le
  > tessere, poi `applyRules` (D86: dopo `applyLang`, mai prima). Pin: `test_page.js:1214–1218`
  > (`#wfPrev` < `#misc` < `#s_lang` < `#advBtn`). Byte 13 del blob e nessuna sync speciale: invariati. (I `file:riga` di questo blocco sono righe del working tree del 14/09/2026 dopo D127.)
- **D37 — orologio**: `sync_env_settings_changed` con `lang` diverso → `ui_time_lang_changed()` (ricalcola separatore, riformatta data, ridisegna la fascia info); log `settings:` e `ui_time:` con `lang=`. Nessuna scrittura persist in più (le impostazioni si salvano già con debounce).
- **D38 — store e documenti**: descrizione **inglese, corta** (fatto: 789 car.), da incollare in dashboard con la **0.2.0** togliendo «the settings page is in Italian for now» e dicendo «Settings page in English, Italian, German and French»; release notes 0.2.0 con una riga per lingua; README: l'attuale blockquote inglese in radice basta (README multilingua rimandato). Versione **0.2.0** a fine sessione.

## 2. Contratti

### 2.1 C (alta importanza, Fable)
- `settings.h/.c`: `uint8_t lang;` al posto di `reserved[0]` (commento «S10, byte 13»), `reserved[4]`; `GalLang`; validate; log `settings: … lang=%u`; `settings.h` `static inline uint8_t gal_lang_from_locale(const char *loc)` (prefisso `en/it/de/fr` → 1..4, altro → 1) **puro**.
- Nuovo modulo puro **`datefmt.c/.h`** (nessun `pebble.h`, testabile su host): `void datefmt_format(char *out, size_t cap, uint8_t lang /*1..4*/, uint8_t wday /*0=dom*/, uint8_t mday, uint8_t mon /*0..11*/, uint8_t level /*0,1,2*/)`; tabelle `static const char[4][7][4]` e `[4][12][7]`; formati per lingua (D34); `char datefmt_thousands_sep(uint8_t lang /*1..4*/)`; indici clampati; `snprintf` con `cap`. Test `test/test_datefmt.c` (tutti i giorni × mesi × lingue × livelli: lunghezza ≤ 12+1, nessun overflow, stringhe attese campionate, separatori).
- `ui_time.c`: in `prv_format_date` se `settings->lang` ≠ 0 → `datefmt_format`, altrimenti `strftime` come oggi (**buffer `mon[8]` → `mon[12]`**: «Juill.» via pack è 7 B con NUL, margine 1); separatore delle migliaia da `datefmt_thousands_sep(lang ? lang : gal_lang_from_locale(i18n_get_system_locale()))` ricalcolato in `ui_time_lang_changed()` e in init; sync: `snprintf(s_sync_buf, "%u/%u")` / `"%u"`, icona `prv_draw_sync_icon(ctx, GPoint o, int16_t size, bool thin)` con `graphics_draw_arc` (`GOvalScaleModeFitCircle`, da `DEG_TO_TRIGANGLE(40)` a `DEG_TO_TRIGANGLE(330)`) + punta di freccia (3 segmenti o `GPath` statico ruotato con `gpath_rotate_to` **fuori** da update_proc, oppure due `graphics_draw_line`), colore e alone come l'icona BT; larghezza del blocco sync = `size + 3 + text_w` sia in A (`prv_layout_info`, `left_w`) sia in B (`prv_layout_sync_b`, `s_rc_sync_b` allargato a sinistra dell'icona: l'icona sta a `MARGIN_X`, il testo dopo); nessuna allocazione; `s_sync_buf[8]`.
- `sync.c`: `sync_env_settings_changed`: `if (b->lang != n->lang) ui_time_lang_changed();` (prima dei rami esistenti; se cambia anche altro il redraw completo vince).
- Statico atteso: +≈ 600 B (tabelle 472 + codice); heap 0; tempo: l'icona è ≤ 3 primitive.

### 2.2 PKJS (medio-bassa, Opus)
- `index.js`: `watchLanguage()` accanto a `watchPlatform()` (`info.language`, stringa o `null`); `langAuto` (D33) con log ASCII `[config] lang auto=it (watch it_IT)`; hook `hooks.lang` in DEV; `configState()` aggiunge `lang_auto` e `i18n` (`require('./i18n')` pigro come `config_page`); il resto invariato.
- `album.js`: `SETTINGS_FIELDS` + `['lang', 0, 4, 0]` e byte 13 in `settingsBytes()`; `applyPayload`/normalizzazione come `digit_style`.
- `tools/galleria_devserver.py`: `--lang {en,it,de,fr}` → `hooks.lang`; `SETTINGS_ALLOWED`/`SAVE_ALLOWED` + `lang` (0..4); selftest.
- `test/shim/fakewatch.js`: nessuna modifica (il blob resta 20 B); `test_album.js`: byte 13, round trip, CRC dei default invariato; `test_index_retry.js`/`smoke`: `lang_auto` e `i18n` nello stato, hook `lang`.

### 2.3 Config page (medio-bassa, Opus)
- `messages.json` con **tutte** le chiavi (estratte dai testi italiani attuali: l'italiano è il riferimento; inglese scritto nello stesso passo); DE e FR scritti da agenti traduttori distinti e riletti da revisori (glossario §3).
- `page.html`: `<html lang="">` impostato a runtime; testi → `data-i18n`; select `s_lang` (D36).
- `page.js`: `T()`, `fmt` con `{0}`; `OPTS` costruite da chiavi (`layout_a`, `font_leco`, …) e **rigenerate** al cambio lingua (le `<option>` esistenti cambiano solo il testo: id e valori stabili, regola D26 e R13 intatte); `FIX_STEPS`/`FIX_TAIL`/`HELP_WHY` da chiavi; messaggi `setMsg` da `T(...)` con segnaposto; `dec()`; `applyLang()` chiamato in `writeSettings` e al `change` di `s_lang`; l'etichetta di «Automatica» con la lingua risultante.
- `page_core.js`: `SETTINGS_FIELDS` + `['lang', 0, 4, 0]`; `LANGS = ['en','it','de','fr']`, `langName(code)`, `effectiveLang(settings, lang_auto)`, `dec(v, lang)`, `capMessage(kb, capKb, nAdded, T)`; ripiego inglese per i messaggi di stato mancante.
- `tools/build_config_page.py`: passo i18n (chiavi → indici) + `--check` incrociato con `build_i18n.py`; `test/test_page.js`: carica `fixture_i18n.js`, gira i controlli di testo in **italiano** (come oggi, tramite dizionario) e un giro «tutte le lingue» che verifica: nessuna chiave vuota a schermo, nessun `{n}` residuo, `OPTS` con lo stesso numero di voci, select `s_lang` funzionante, decimali per lingua; controlli strutturali della sezione 0 aggiornati (l'artefatto non contiene testi italiani; `T(` numerici).
- Tetto: pagina inlinata attesa ≈ 62,5 KB (+ `T`, select, applyLang); `--check` invariato (65.536). 🔁 **Contratto storico di S10**: dalla revisione S12/D43 il tetto è **98.304 B** con avviso soft a **86.016**, e la pagina misura **85.476 B** (14/09/2026).

### 2.4 Gate (alta, orchestratore)
- `make -C test` verde (nuovi: `test_datefmt`, `test_page` in 4 lingue, album/index/devserver aggiornati).
- Emulatore emery: dev server `--album … --lang de --settings '{"lang":0}'` → pagina in Firefox (headless) in **de**, poi select → fr/it/en con screenshot a 400 px (`docs/design/galleria/s10_page_<lang>.png`); sync di 10 foto in A e B → icona + «k/n» (`s10_emery_a_sync.png`, `s10_emery_b_sync.png`); data con `--settings '{"lang":3}'` e `emu-set-time` (es. 2026-09-05 → «Sa, 5. Sep»; fr «Sam 5 Sept.»; it «Sab 5 Set»; en «Sat 5 Sep») e passi con separatore (fr `6 532`); flint: sync in A e B + data de/fr.
- Orologio reale (utente): data in auto («Sab 5 Set» invariata), pagina in italiano automatico, cambio lingua dalla pagina.

## 3. Glossario e regole di traduzione

✅ **Tabella completa e riallineata a `apps/galleria/i18n/messages.json`** (ultima riallineatura: 19/09/2026,
in S14): copre **tutte e 134** le chiavi in **67 righe**. Le celle si **generano da `messages.json`**, mai
a mano, e nella colonna «chiavi» le righe portano fra parentesi un **tag di zona** — intestazione e stato,
foto e tessere, editor, aspetto dell'ora, aiuto e avvio lento, tetto e messaggi, anteprima — che dice dove la
chiave si vede nella pagina. La **fonte unica** resta `messages.json`: se cambia, questa tabella si corregge,
mai il contrario.

**Verifica**: non si fa a occhio. `tools/galleria_gloss_check.py` (**D132**) confronta chiave per chiave e
lingua per lingua la tabella con `messages.json` ed è il bersaglio **`glosscheck`** di `make -C test`: una
cella che si allontana dalla sorgente, o una chiave nuova senza la sua riga, fermano la suite.

⚠️ **Due righe hanno più «·» che chiavi, e va bene così**: `watch_flint` («Pebble 2 Duo · bianco e nero») e
`preview_auto` («Colore automatico: {0} · bordo di contrasto: {1}») contengono il separatore **dentro il
testo**, quindi lo strumento le riallinea da sé (somiglianza con la sorgente) e le elenca come avviso, non come
errore: i testi restano byte-esatti e non vanno «raddrizzati» spezzandoli. Per una riga nuova la regola pratica
è l'opposto: **se un testo contiene « · », gli si dà una riga tutta sua**.

Le riallineature (S11, UX-1, UX-2, UX-3, UX-4) e le misure dei dizionari stanno in «Storia del dizionario», in
fondo a questa sezione.

| it (riferimento) | en | de («du») | fr («vous») | es («tú») | pt («você») | chiavi |
|---|---|---|---|---|---|---|
| Pebble 2 Duo · bianco e nero | Pebble 2 Duo · black and white | Pebble 2 Duo · Schwarz-Weiß | Pebble 2 Duo · noir et blanc | Pebble 2 Duo · blanco y negro | Pebble 2 Duo · preto e branco | `watch_flint` |
| Galleria ci mette {0} secondi ad avviarsi quando torni all'orologio. Non è un guasto e non perdi nessuna foto: vedi Aiuto, in fondo alla pagina. | Galleria takes {0} seconds to start when you go back to the watch. Nothing is broken and no photo is lost: see Help, at the bottom of the page. | Galleria braucht {0} Sekunden zum Starten, wenn du zur Uhr zurückkehrst. Das ist kein Defekt und kein Foto geht verloren: Siehe Hilfe unten auf der Seite. | Galleria met {0} s à démarrer quand vous revenez à la montre. Ce n'est pas une panne et aucune photo n'est perdue : voir Aide, en bas de la page. | Galleria tarda {0} segundos en iniciarse cuando vuelves al reloj. No es una avería y no pierdes ninguna foto: mira Ayuda, al final de la página. | Galleria leva {0} segundos para iniciar quando você volta ao relógio. Não é um defeito e nenhuma foto se perde: veja Ajuda, no fim da página. | `slow_lead` |
| Aggiungi foto | Add photo | Foto hinzufügen | Ajouter une photo | Añadir foto | Adicionar foto | `add_photo` |
| Un momento… · Salva queste foto, poi riapri le impostazioni per aggiungerne altre | One moment… · Save these photos, then reopen the settings to add more | Einen Moment… · Speichere diese Fotos und öffne die Einstellungen dann neu, um weitere hinzuzufügen | Un instant… · Enregistrez ces photos, puis rouvrez les réglages pour en ajouter d'autres | Un momento… · Guarda estas fotos y vuelve a abrir los ajustes para añadir más | Um momento… · Salve estas fotos e reabra as configurações para adicionar mais | `btn_loading`, `cap_next_help` (**UX-3/D109/D117**) |
| Salva · Esci senza salvare | Save · Leave without saving | Speichern · Ohne Speichern verlassen | Enregistrer · Quitter sans enregistrer | Guardar · Salir sin guardar | Salvar · Sair sem salvar | `btn_save`, `btn_cancel` |
| Chiudi · Esci comunque | Close · Leave anyway | Schließen · Trotzdem verlassen | Fermer · Quitter quand même | Cerrar · Salir igualmente | Fechar · Sair mesmo assim | `btn_close`, `btn_cancel_armed` (**UX-3/D107**) |
| Impostazioni | Settings | Einstellungen | Réglages | Ajustes | Configurações | `sec_settings` |
| Aspetto dell'ora · Cambio foto · Altre impostazioni | How the time looks · Photo changes · More settings | Aussehen der Uhrzeit · Fotowechsel · Weitere Einstellungen | Aspect de l'heure · Changement de photo · Autres réglages | Aspecto de la hora · Cambio de foto · Más ajustes | Aparência da hora · Troca de foto · Mais configurações | `sec_look`, `sec_rotation`, `adv_btn` |
| L'orologio usa le sue impostazioni: queste valgono quando tocchi Salva. | The watch is using its own settings: these apply when you tap Save. | Die Uhr nutzt ihre eigenen Einstellungen: Diese gelten, wenn du auf Speichern tippst. | La montre utilise ses propres réglages : ceux-ci s'appliquent quand vous appuyez sur Enregistrer. | El reloj usa sus propios ajustes: estos se aplican cuando tocas Guardar. | O relógio usa as próprias configurações: estas valem quando você toca em Salvar. | `settings_note` |
| Le tue foto · Foto {0} · {0} di {1} foto | Your photos · Photo {0} · {0} of {1} photos | Deine Fotos · Foto {0} · {0} von {1} Fotos | Vos photos · Photo {0} · {0} sur {1} photos | Tus fotos · Foto {0} · {0} de {1} fotos | Suas fotos · Foto {0} · {0} de {1} fotos | `sec_photos`, `tile_slot`, `photos_cap` |
| Senza foto tue, l'orologio mostra 2 foto di esempio: spariscono quando arriva la tua prima foto. Ne puoi mettere fino a {0}. | Without photos of yours, the watch shows 2 sample photos: they go away when your first photo arrives. You can have up to {0} photos. | Ohne eigene Fotos zeigt die Uhr 2 Beispielfotos; sie verschwinden, sobald dein erstes Foto ankommt. Du kannst bis zu {0} Fotos haben. | Sans vos photos, la montre affiche 2 photos d'exemple : elles disparaissent quand votre première photo arrive. Vous pouvez en mettre jusqu'à {0}. | Sin fotos tuyas, el reloj muestra 2 fotos de ejemplo: desaparecen cuando llega tu primera foto. Puedes tener hasta {0} fotos. | Sem fotos suas, o relógio mostra 2 fotos de exemplo: elas somem quando a sua primeira foto chegar. Você pode ter até {0} fotos. | `photos_cap_empty` (**D77**) |
| Togli · Foto tolta: sparirà dall'orologio quando salvi | Remove · Photo removed: it will disappear from the watch when you save | Entfernen · Foto entfernt: Es verschwindet von der Uhr, wenn du speicherst | Retirer · Photo retirée : elle disparaîtra de la montre quand vous enregistrerez | Quitar · Foto quitada: desaparecerá del reloj cuando guardes | Remover · Foto removida: ela some do relógio quando você salvar | `btn_delete`, `msg_removed` |
| Tocca di nuovo ✕ per togliere {0} | Tap ✕ again to remove {0} | Tippe erneut auf ✕, um {0} zu entfernen | Appuyez de nouveau sur ✕ pour retirer {0} | Toca ✕ de nuevo para quitar {0} | Toque em ✕ de novo para remover {0} | `msg_del_arm` (**UX-3/D110**) |
| da salvare · non è ancora sull'orologio · solo sull'orologio · da togliere e riaggiungere | to save · not on the watch yet · only on the watch · remove it and add it again | zu speichern · noch nicht auf der Uhr · nur auf der Uhr · entfernen, neu hinzufügen | à enregistrer · pas encore sur la montre · uniquement sur la montre · à retirer et rajouter | por guardar · aún no está en el reloj · solo en el reloj · quítala y añádela otra vez | para salvar · ainda não está no relógio · só no relógio · remova e adicione de novo | `badge_new`, `badge_pending`, `badge_foreign`, `badge_no_fmt` |
| Questo è l'ordine delle foto: ▲ ▼ per cambiarlo | This is the photo order: ▲ ▼ to change it | Das ist die Reihenfolge der Fotos: ▲ ▼ zum Ändern | Voici l'ordre des photos : ▲ ▼ pour le changer | Este es el orden de las fotos: ▲ ▼ para cambiarlo | Esta é a ordem das fotos: ▲ ▼ para mudar | `photos_cap_hint` |
| Disposizione · Ora in alto, info sotto · Ora in basso, info sopra · Ora grande, senza info | Layout · Clock on top, info below · Clock at bottom, info above · Big clock, no info | Anordnung · Uhrzeit oben, Info unten · Uhrzeit unten, Info oben · Große Uhrzeit, ohne Info | Disposition · Heure en haut, infos dessous · Heure en bas, infos dessus · Grande heure, sans infos | Disposición · Hora arriba, info debajo · Hora abajo, info encima · Hora grande, sin info | Disposição · Hora em cima, info embaixo · Hora embaixo, info em cima · Hora grande, sem info | `lbl_layout`, `opt_layout_a`, `opt_layout_a_bottom` (**S14/D136**), `opt_layout_b` |
| Font · Font di sistema (tranne Ora grande) | Font · System font (except Big clock) | Schriftart · Systemschrift (außer Große Uhrzeit) | Police · Police système (sauf Grande heure) | Fuente · Fuente del sistema (no Hora grande) | Fonte · Fonte do sistema (não Hora grande) | `lbl_font`, `opt_font_leco` (**S14/D136**: LECO vale anche con «Ora in basso», la parentesi nomina il solo layout escluso) |
| Stile cifre · pieno · solo contorno · contorno con ombra · pieno con ombra · {0} (non sul Duo) | Digit style · solid · outline only · outline with shadow · solid with shadow · {0} (not on the Duo) | Ziffernstil · gefüllt · nur Kontur · Kontur mit Schatten · gefüllt mit Schatten · {0} (nicht am Duo) | Style des chiffres · plein · contour seul · contour avec ombre · plein avec ombre · {0} (pas sur le Duo) | Estilo de dígitos · relleno · solo contorno · contorno con sombra · relleno con sombra · {0} (no en el Duo) | Estilo dos dígitos · preenchido · só contorno · contorno com sombra · preenchido com sombra · {0} (não no Duo) | `lbl_digit_style`, `opt_style_solid`, `opt_style_transp`, `opt_style_transp_3d`, `opt_style_solid_3d`, `opt_style_no_flint` |
| Formato ora · come l'orologio | Time format · as on the watch | Zeitformat · wie auf der Uhr | Format de l'heure · comme la montre | Formato de hora · como el reloj | Formato da hora · como o relógio | `lbl_clock_mode`, `opt_clock_auto` |
| Zero davanti all'ora · sì con 24 h, no con 12 h · sì (09:05) · no (9:05) | Zero before the hour · yes with 24 h, no with 12 h · yes (09:05) · no (9:05) | Null vor der Stunde · ja bei 24 h, nein bei 12 h · ja (09:05) · nein (9:05) | Zéro devant l'heure · oui en 24 h, non en 12 h · oui (09:05) · non (9:05) | Cero antes de la hora · sí con 24 h, no con 12 h · sí (09:05) · no (9:05) | Zero antes da hora · sim com 24 h, não com 12 h · sim (09:05) · não (9:05) | `lbl_leading_zero`, `opt_leading_zero_auto`, `opt_yes`, `opt_no` |
| Ogni quanto · mai · ogni {0} min · ogni {0} h · ogni giorno (alle 4:00) | How often · never · every {0} min · every {0} h · every day (at 4 am) | Wie oft · nie · alle {0} Min · alle {0} Std · täglich (um 4 Uhr) | À quelle fréquence · jamais · toutes les {0} min · toutes les {0} h · chaque jour (à 4 h) | Cada cuánto · nunca · cada {0} min · cada {0} h · cada día (a las 4:00) | A cada quanto tempo · nunca · a cada {0} min · a cada {0} h · todos os dias (às 4:00) | `lbl_interval`, `opt_never`, `opt_minutes`, `opt_hours`, `opt_one_day` |
| Ordine · come l'elenco · a caso | Order · as listed · at random | Reihenfolge · wie in der Liste · zufällig | Ordre · suivant la liste · au hasard | Orden · como en la lista · al azar | Ordem · como na lista · aleatória | `lbl_order`, `opt_order_seq`, `opt_order_random` |
| Scuoti il polso per cambiare foto | Shake your wrist for the next photo | Handgelenk schütteln für das nächste Foto | Secouez le poignet pour changer de photo | Sacude la muñeca para cambiar de foto | Sacuda o pulso para trocar de foto | `opt_shake_next` |
| Colore dell'ora · automatico (dalla foto) · bianco · nero · giallo chiaro · blu scuro | Time color · automatic (from the photo) · white · black · light yellow · dark blue | Farbe der Uhrzeit · automatisch (vom Foto) · weiß · schwarz · hellgelb · dunkelblau | Couleur de l'heure · automatique (selon la photo) · blanc · noir · jaune clair · bleu foncé | Color de la hora · automático (según la foto) · blanco · negro · amarillo claro · azul oscuro | Cor da hora · automática (da foto) · branco · preto · amarelo claro · azul escuro | `lbl_text_color`, `opt_color_auto`, `opt_color_white`, `opt_color_black`, `opt_color_yellow`, `opt_color_blue` |
| Bordo di contrasto · solo se serve · sempre · mai | Contrast edge · only when needed · always · never | Kontrastrand · nur bei Bedarf · immer · nie | Bord de contraste · seulement si nécessaire · toujours · jamais | Borde de contraste · solo si es necesario · siempre · nunca | Borda de contraste · só se for preciso · sempre · nunca | `lbl_outline`, `opt_outline_auto`, `opt_outline_always`, `opt_never` |
| Insieme all'ora · passi · batteria · data · telefono scollegato | With the time · steps · battery · date · phone disconnected | Mit der Uhrzeit · Schritte · Akku · Datum · Telefon getrennt | Avec l'heure · pas · batterie · date · téléphone déconnecté | Con la hora · pasos · batería · fecha · teléfono desconectado | Com a hora · passos · bateria · data · telefone desconectado | `lbl_info_row`, `opt_info_steps`, `opt_info_battery`, `opt_info_date`, `opt_info_bt` |
| Anteprima · {0}: così si vede con l'ora ({1} è solo un esempio) · Aggiungi una foto e la vedrai qui con l'ora · Aggiungi una foto e la vedrai qui con l'ora: quelle già presenti no | Preview · {0}: this is how it looks with the time ({1} is just an example) · Add a photo and you'll see it here with the time · Add a photo and you'll see it here with the time: not the ones already in your photos | Vorschau · {0}: So sieht es mit der Uhrzeit aus ({1} ist nur ein Beispiel) · Füge ein Foto hinzu, dann siehst du es hier mit der Uhrzeit · Füge ein Foto hinzu, dann siehst du es hier mit der Uhrzeit: die schon vorhandenen nicht | Aperçu · {0} : voici le rendu avec l'heure ({1} n'est qu'un exemple) · Ajoutez une photo et vous la verrez ici avec l'heure · Ajoutez une photo et vous la verrez ici avec l'heure : pas celles déjà présentes | Vista previa · {0}: así se ve con la hora ({1} es solo un ejemplo) · Añade una foto y la verás aquí con la hora · Añade una foto y la verás aquí con la hora: las que ya están, no | Pré-visualização · {0}: é assim que fica com a hora ({1} é só um exemplo) · Adicione uma foto e você vai vê-la aqui com a hora · Adicione uma foto e você vai vê-la aqui com a hora: as que já estão, não | `sec_preview`, `preview_cap_photo`, `preview_cap_none`, `preview_cap_none_album` |
| Colore automatico: {0} · bordo di contrasto: {1} · Sull'orologio, sopra o sotto l'ora, compare quello che hai scelto: {0} · Con le 12 h sull'orologio compare anche PM · Font di sistema: qui non si vedono, sull'orologio sì | Automatic color: {0} · contrast edge: {1} · On the watch, above or below the time, you see what you chose: {0} · In 12-hour format the watch also shows PM · System font: the digits don't appear here, but they do on the watch | Automatische Farbe: {0} · Kontrastrand: {1} · Auf der Uhr steht über oder unter der Uhrzeit, was du gewählt hast: {0} · Im 12-Stunden-Format zeigt die Uhr auch PM · Systemschrift: Die Ziffern sind hier nicht zu sehen, auf der Uhr schon | Couleur automatique : {0} · bord de contraste : {1} · Sur la montre, au-dessus ou en dessous de l'heure, vous voyez ce que vous avez choisi : {0} · Au format 12 h, la montre affiche aussi PM · Police système : les chiffres ne s'affichent pas ici, mais sur la montre oui | Color automático: {0} · borde de contraste: {1} · En el reloj, encima o debajo de la hora, aparece lo que has elegido: {0} · Con el formato de 12 h el reloj muestra también PM · Fuente del sistema: los dígitos no se ven aquí, en el reloj sí | Cor automática: {0} · borda de contraste: {1} · No relógio, acima ou abaixo da hora, aparece o que você escolheu: {0} · No formato de 12 h o relógio mostra também PM · Fonte do sistema: os dígitos não aparecem aqui, no relógio sim | `preview_auto`, `preview_note_info`, `preview_note_ampm`, `preview_note_leco` |
| Regolazioni della foto | Photo adjustments | Foto anpassen | Réglages de la photo | Ajustes de la foto | Ajustes da foto | `edit_adv_btn` (**UX-3/D114**) |
| Luminosità · Schiarisci le ombre · Sfumature · nessuna | Brightness · Lighten the shadows · Shading · none | Helligkeit · Schatten aufhellen · Rasterung · keine | Luminosité · Éclaircir les ombres · Tramage · aucun | Brillo · Aclarar las sombras · Tramado · ninguno | Brilho · Clarear as sombras · Pontilhado · nenhum | `lbl_gamma`, `lbl_lift`, `lbl_dither`, `dither_none` |
| Ottimizza per lo schermo dell'orologio | Optimize for the watch screen | Für den Bildschirm der Uhr optimieren | Optimiser pour l'écran de la montre | Optimizar para la pantalla del reloj | Otimizar para a tela do relógio | `opt_sunlight` |
| Colori · come sull'orologio · senza correzione | Colors · as on the watch · uncorrected | Farben · wie auf der Uhr · ohne Korrektur | Couleurs · comme sur la montre · sans correction | Colores · como en el reloj · sin corrección | Cores · como no relógio · sem correção | `lbl_preview`, `opt_prev_sun`, `opt_prev_nominal` |
| Riparti da capo · Usa questa foto · Non aggiungere | Start over · Use this photo · Don't add | Neu anfangen · Foto verwenden · Nicht hinzufügen | Recommencer · Utiliser la photo · Ne pas ajouter | Empezar de nuevo · Usar esta foto · No añadir | Começar de novo · Usar esta foto · Não adicionar | `btn_fit`, `btn_add_ok`, `btn_add_cancel` |
| Così si vede sull'orologio · Anteprima non aggiornata: vale il ritaglio nella cornice | This is how it looks on the watch · Preview not updated: the crop in the frame is what counts | So sieht es auf der Uhr aus · Vorschau nicht aktualisiert: Es gilt der Zuschnitt im Rahmen | Voici le rendu sur la montre · Aperçu non actualisé : c'est le recadrage dans le cadre qui compte | Así se ve en el reloj · Vista previa no actualizada: vale el recorte del marco | É assim que fica no relógio · Pré-visualização desatualizada: vale o recorte na moldura | `edit_preview_cap`, `preview_stale` (**UX-3/D105/D106**) |
| caricamento di {0}… | loading {0}… | {0} wird geladen… | chargement de {0}… | cargando {0}… | carregando {0}… | `msg_loading` |
| Foto aggiunta: tocca Salva per inviarla all'orologio · Foto aggiunta (senza miniatura): tocca Salva per inviarla all'orologio | Photo added: tap Save to send it to the watch · Photo added (no thumbnail): tap Save to send it to the watch | Foto hinzugefügt: Tippe auf Speichern, um es an die Uhr zu senden · Foto hinzugefügt (ohne Miniaturbild): Tippe auf Speichern, um es an die Uhr zu senden | Photo ajoutée : appuyez sur Enregistrer pour l'envoyer à la montre · Photo ajoutée (sans vignette) : appuyez sur Enregistrer pour l'envoyer à la montre | Foto añadida: toca Guardar para enviarla al reloj · Foto añadida (sin miniatura): toca Guardar para enviarla al reloj | Foto adicionada: toque em Salvar para enviá-la ao relógio · Foto adicionada (sem miniatura): toque em Salvar para enviá-la ao relógio | `msg_added`, `msg_added_no_thumb` (**D78**) |
| Invio all'orologio… | Sending to the watch… | Wird an die Uhr gesendet… | Envoi à la montre… | Enviando al reloj… | Enviando ao relógio… | `msg_sending` (**UX-3/D108**) |
| Galleria si avvia lentamente? | Is Galleria slow to start? | Startet Galleria langsam? | Galleria démarre lentement ? | ¿Galleria tarda en iniciarse? | Galleria inicia lentamente? | `help_btn` |
| Modifiche da salvare: tocca Salva per inviarle all'orologio · Dopo Salva, le foto passano all'orologio una alla volta: tieni aperta l'app Pebble | Changes to save: tap Save to send them to the watch · After Save, the photos go to the watch one at a time: keep the Pebble app open | Zu speichernde Änderungen: Tippe auf Speichern, um sie an die Uhr zu senden · Nach dem Speichern gehen die Fotos nacheinander an die Uhr: Lass die Pebble-App geöffnet | Modifications à enregistrer : appuyez sur Enregistrer pour les envoyer à la montre · Après Enregistrer, les photos passent à la montre une par une : gardez l'app Pebble ouverte | Cambios por guardar: toca Guardar para enviarlos al reloj · Después de Guardar, las fotos pasan al reloj una a una: mantén abierta la app Pebble | Alterações a salvar: toque em Salvar para enviá-las ao relógio · Depois de Salvar, as fotos vão para o relógio uma de cada vez: mantenha o app Pebble aberto | `unsaved_hint`, `footer_send` (**UX-3/D121**) |
| Dopo Salva, le foto passano all'orologio una alla volta (circa mezzo minuto l'una): l'orologio conta 1/3, 2/3… Tieni aperta l'app Pebble fino alla fine. | After you tap Save, photos go to the watch one at a time (about half a minute each): the watch counts 1/3, 2/3… Keep the Pebble app open until it is done. | Nach dem Speichern gehen die Fotos eins nach dem anderen an die Uhr (etwa eine halbe Minute pro Foto): Die Uhr zählt 1/3, 2/3… Lass die Pebble-App geöffnet, bis alles fertig ist. | Une fois que vous avez appuyé sur Enregistrer, les photos passent à la montre une par une (environ une demi-minute chacune) : la montre compte 1/3, 2/3… Gardez l'app Pebble ouverte jusqu'à la fin. | Después de Guardar, las fotos pasan al reloj de una en una (alrededor de medio minuto cada una): el reloj cuenta 1/3, 2/3… Mantén abierta la app Pebble hasta el final. | Depois de Salvar, as fotos vão para o relógio uma de cada vez (cerca de meio minuto cada): o relógio conta 1/3, 2/3… Mantenha o app Pebble aberto até o fim. | `help_sync` |
| Lingua (pagina e data) · Automatica (orologio: {0}) | Language (page, date) · Automatic (watch: {0}) | Sprache (Seite, Datum) · Automatisch (Uhr: {0}) | Langue (page et date) · Automatique (montre : {0}) | Idioma (página, fecha) · Automático (reloj: {0}) | Idioma (página e data) · Automático (relógio: {0}) | `lbl_lang`, `opt_lang_auto` |
| Orologio non collegato: foto {0} | Watch not connected: photos {0} | Uhr nicht verbunden: Fotos {0} | Montre non connectée : photos {0} | Reloj no conectado: fotos {0} | Relógio não conectado: fotos {0} | `watch_unknown` (intestazione e stato) |
| a colori · in bianco e nero | in color · in black and white | in Farbe · in Schwarzweiß | en couleur · en noir et blanc | en color · en blanco y negro | em cores · em preto e branco | `watch_fmt_color`, `watch_fmt_bw` (intestazione e stato) |
| Da inviare: {0} KB / {1} KB | To send: {0} KB / {1} KB | Zu senden: {0} KB / {1} KB | À envoyer : {0} KB / {1} KB | Por enviar: {0} KB / {1} KB | Para enviar: {0} KB / {1} KB | `kb_line` (intestazione e stato) |
| scegli una foto dal telefono | pick a photo from your phone | Wähle ein Foto auf dem Telefon | choisissez une photo sur votre téléphone | elige una foto del teléfono | escolha uma foto do telefone | `add_help` (foto e tessere) |
| Massimo {0} foto: togline una per aggiungerne un'altra | Maximum {0} photos: remove one to add another | Maximal {0} Fotos: Entferne eins, um ein neues hinzuzufügen | Maximum {0} photos : retirez-en une pour en ajouter une autre | Máximo {0} fotos: quita una para añadir otra | Máximo de {0} fotos: remova uma para adicionar outra | `album_full` (foto e tessere) |
| Sposta su · Sposta giù | Move up · Move down | Nach oben · Nach unten | Monter · Descendre | Mover arriba · Mover abajo | Mover para cima · Mover para baixo | `btn_up`, `btn_down` (foto e tessere) |
| {0}: {1} | {0}: {1} | {0}: {1} | {0} : {1} | {0}: {1} | {0}: {1} | `aria_tile_btn` (foto e tessere) |
| Foto nuova tolta · foto | New photo removed · photo | Neues Foto entfernt · Foto | Nouvelle photo retirée · photo | Foto nueva quitada · foto | Foto nova removida · foto | `msg_new_dropped`, `photo_name_default` (foto e tessere) |
| Ritaglio · Zoom | Crop · Zoom | Zuschnitt · Zoom | Recadrage · Zoom | Recorte · Zoom | Recorte · Zoom | `sec_crop`, `lbl_zoom` (editor) |
| Trascina per spostare, due dita per ingrandire o ridurre. | Drag to move, two fingers to zoom in or out. | Ziehe zum Verschieben, vergrößere oder verkleinere mit zwei Fingern. | Faites glisser pour déplacer, deux doigts pour agrandir ou réduire. | Arrastra para mover, dos dedos para acercar o alejar. | Arraste para mover, dois dedos para ampliar ou reduzir. | `crop_hint` (editor) |
| Impossibile aprire {0}. Prova con un'altra foto. | Can't open {0}. Try another photo. | {0} lässt sich nicht öffnen. Versuche es mit einem anderen Foto. | Impossible d'ouvrir {0}. Essayez une autre photo. | No se puede abrir {0}. Prueba con otra foto. | Não foi possível abrir {0}. Tente outra foto. | `msg_read_fail` (editor) |
| Foto non aggiunta | Photo not added | Foto nicht hinzugefügt | Photo non ajoutée | Foto no añadida | Foto não adicionada | `msg_crop_cancel` (editor) |
| Con questo stile si leggono meglio Francois One e Staatliches. | With this style, Francois One and Staatliches read better. | Mit diesem Stil sind Francois One und Staatliches besser lesbar. | Avec ce style, Francois One et Staatliches se lisent mieux. | Con este estilo se leen mejor Francois One y Staatliches. | Com este estilo, Francois One e Staatliches ficam mais fáceis de ler. | `style_hint` (aspetto dell'ora) |
| Sul Pebble 2 Duo il contorno è sottile: con foto molto dettagliate scegli lo stile pieno. | On the Pebble 2 Duo the outline is thin: with very detailed photos choose the solid style. | Auf dem Pebble 2 Duo ist die Kontur dünn: Wähle bei sehr detailreichen Fotos den gefüllten Stil. | Sur le Pebble 2 Duo, le contour est fin : avec des photos très détaillées, choisissez le style plein. | En el Pebble 2 Duo el contorno es fino: con fotos muy detalladas elige el estilo relleno. | No Pebble 2 Duo o contorno é fino: em fotos com muitos detalhes escolha o estilo preenchido. | `style_flint_help` (aspetto dell'ora) |
| Aiuto | Help | Hilfe | Aide | Ayuda | Ajuda | `sec_help` (aiuto e avvio lento) |
| L'orologio tiene al massimo {0} foto e le rilegge tutte a ogni avvio: più foto ci sono, più Galleria è lenta ad avviarsi. Se ci mette molto di più del solito è perché tiene da parte anche le foto sostituite, finché la memoria non è piena. | The watch holds up to {0} photos and reads them all again every time it starts: the more photos there are, the slower Galleria is to start. If it takes much longer than usual, it is because the watch also keeps the photos you replaced until the memory is full. | Die Uhr fasst höchstens {0} Fotos und liest bei jedem Start alle neu ein: Je mehr Fotos, desto langsamer startet Galleria. Wenn es viel länger dauert als sonst, liegt es daran, dass die Uhr auch die ersetzten Fotos aufbewahrt, bis der Speicher voll ist. | La montre garde au maximum {0} photos et les relit toutes à chaque démarrage : plus il y a de photos, plus Galleria est lente à démarrer. Si elle met beaucoup plus de temps que d'habitude, c'est que la montre conserve aussi les photos remplacées, tant que la mémoire n'est pas pleine. | El reloj guarda como máximo {0} fotos y las vuelve a leer todas cada vez que se inicia: cuantas más fotos hay, más tarda Galleria en iniciarse. Si tarda mucho más de lo normal, es porque el reloj conserva también las fotos sustituidas, hasta que la memoria se llena. | O relógio guarda no máximo {0} fotos e lê todas de novo toda vez que inicia: quanto mais fotos, mais devagar Galleria inicia. Se ela demorar muito mais do que o normal, é porque o relógio conserva também as fotos substituídas, até a memória ficar cheia. | `help_why` (aiuto e avvio lento) |
| In quel caso, per sistemare: | In that case, to fix it: | Dann so beheben: | Dans ce cas, pour y remédier : | En ese caso, para arreglarlo: | Nesse caso, para resolver: | `fix_lead` (aiuto e avvio lento) |
| apri l'app Pebble sul telefono · tocca Galleria nell'elenco delle app · rimuovi Galleria dall'orologio (non aggiornarla) · reinstalla Galleria | open the Pebble app on your phone · tap Galleria in the list of apps · remove Galleria from the watch (do not update it) · install Galleria again | öffne die Pebble-App auf dem Telefon · tippe in der Liste der Apps auf Galleria · entferne Galleria von der Uhr (nicht aktualisieren) · installiere Galleria erneut | ouvrez l'app Pebble sur votre téléphone · appuyez sur Galleria dans la liste des apps · retirez Galleria de la montre (ne la mettez pas à jour) · réinstallez Galleria | abre la app Pebble en el teléfono · toca Galleria en la lista de apps · quita Galleria del reloj (no la actualices) · vuelve a instalar Galleria | abra o app Pebble no telefone · toque em Galleria na lista de apps · remova Galleria do relógio (não atualize) · instale Galleria de novo | `fix_step_1`, `fix_step_2`, `fix_step_3`, `fix_step_4` (aiuto e avvio lento) |
| Le tue foto sono al sicuro nel telefono e torneranno da sole sull'orologio in pochi minuti (circa mezzo minuto per foto). | Your photos are safe on your phone and will come back to the watch on their own in a few minutes (about half a minute per photo). | Deine Fotos sind sicher auf dem Telefon und kommen in wenigen Minuten von allein auf die Uhr zurück (etwa eine halbe Minute pro Foto). | Vos photos sont en sécurité sur votre téléphone et reviendront toutes seules sur la montre en quelques minutes (environ une demi-minute par photo). | Tus fotos están a salvo en el teléfono y volverán solas al reloj en unos minutos (alrededor de medio minuto por foto). | Suas fotos estão seguras no telefone e voltam sozinhas para o relógio em poucos minutos (cerca de meio minuto por foto). | `fix_tail` (aiuto e avvio lento) |
| Modifiche non salvate: tocca di nuovo per uscire senza salvare | Unsaved changes: tap again to leave without saving | Nicht gespeicherte Änderungen: Tippe erneut zum Verlassen ohne Speichern | Modifications non enregistrées : appuyez de nouveau pour quitter sans enregistrer | Cambios sin guardar: toca de nuevo para salir sin guardar | Alterações não salvas: toque de novo para sair sem salvar | `msg_unsaved` (tetto e messaggi) |
| Qualcosa non ha funzionato: riprova. Se continua, riapri le impostazioni. | Something went wrong: try again. If it keeps happening, reopen the settings. | Etwas hat nicht geklappt: Versuche es noch einmal. Wenn es weiter passiert, öffne die Einstellungen neu. | Un problème est survenu : réessayez. Si cela persiste, rouvrez les réglages. | Algo no ha funcionado: inténtalo otra vez. Si sigue, vuelve a abrir los ajustes. | Algo não funcionou: tente de novo. Se continuar, reabra as configurações. | `msg_err` (tetto e messaggi) |
| Troppe foto per un solo invio ({0} KB su {1}) · {0}: togli con ✕ {1} foto fra quelle da salvare, poi salva; le altre le aggiungi riaprendo le impostazioni | Too many photos for one transfer ({0} KB of {1}) · {0}. Photos to remove with ✕ (among those to save): {1}. Then save; add the others by reopening the settings | Zu viele Fotos für eine Übertragung ({0} KB von {1}) · {0}. Mit ✕ zu entfernende Fotos (von den noch zu speichernden): {1}. Dann speichere; füge die anderen beim erneuten Öffnen der Einstellungen hinzu | Trop de photos pour un seul envoi ({0} KB sur {1}) · {0}. Photos à retirer avec ✕ (parmi celles à enregistrer) : {1}. Enregistrez, puis ajoutez les autres en rouvrant les réglages | Demasiadas fotos para un solo envío ({0} KB de {1}) · {0}. Fotos por quitar con ✕ (entre las que están por guardar): {1}. Luego guarda; añade las demás volviendo a abrir los ajustes | Fotos demais para um único envio ({0} KB de {1}) · {0}. Fotos para remover com ✕ (entre as que estão para salvar): {1}. Depois salve; adicione as outras reabrindo as configurações | `cap_over`, `cap_over_fix` (tetto e messaggi) |
| sì · no | on · off | ein · aus | oui · non | sí · no | sim · não | `preview_outline_on`, `preview_outline_off` (anteprima) |
| Mostra in anteprima {0} | Show {0} in the preview | {0} in der Vorschau zeigen | Afficher {0} dans l'aperçu | Mostrar {0} en la vista previa | Mostrar {0} na pré-visualização | `preview_eye` (anteprima) |
| Anteprima non disponibile | Preview not available | Vorschau nicht verfügbar | Aperçu non disponible | Vista previa no disponible | Pré-visualização não disponível | `preview_unavailable` (anteprima) |
| Cifre non disponibili: si vede solo la foto | Digits not available: only the photo is shown | Ziffern nicht verfügbar: Nur das Foto wird gezeigt | Chiffres non disponibles : seule la photo est affichée | Dígitos no disponibles: solo se ve la foto | Dígitos não disponíveis: aparece apenas a foto | `preview_note_no_masks` (anteprima) |

**Regole** (invariate salvo dove detto): spazio **semplice** U+0020 prima di `: ; ! ?` in francese e «KB» in tutte
le lingue (**D67**: nessuna tripwire sul francese, nessun U+00A0); maiuscole tedesche sui sostantivi; numeri con
`dec()`; niente plurali (si riformula); segnaposto `{0}`/`{1}` con lo **stesso insieme** in tutte e sei le lingue
della voce; nomi propri fuori dal dizionario (D35, rivista da UX-1). Lunghezza: dal 13/09/2026 non è più «≤ 28
dove possibile» ma una **tripwire** in `tools/build_i18n.py` (**D70**) che misura il testo *renderizzato* — i
segnaposto sostituiti con il valore più lungo che la pagina ci mette davvero — delle chiavi elencate: le
`<option>` ≤ **28** caratteri (≤ **36** per `opt_font_leco`, `opt_lang_auto` con «Português» e `opt_style_no_flint`
reso con la più lunga fra le quattro `opt_style_*` **e i due colori spenti su Duo** della stessa lingua — D86: da
UX-2 il suffisso «{0} (non sul Duo)» avvolge anche `opt_color_yellow` e `opt_color_blue`) e le `lbl_*` della
colonna da 9,5 em ≤ **22**. Le etichette di casella (`opt_sunlight`, `opt_shake_next`, `opt_info_*`,
`opt_info_bt`) e i paragrafi restano fuori dalla lista. La lista `OPTIONS` conta **30** chiavi (`opt_auto` è
uscita, le quattro «automatico» sono entrate e in **S14** è entrata `opt_layout_a_bottom`, D136) e `LABELS` **16**;
da S14 `opt_hours` si misura reso con **«12»** e non più con «3» (D139: la pagina offre 3, 6 e 12 ore).
Margini più stretti oggi (13/09/2026, fine UX-2): `lbl_lang` **22/22** in it, de, es e pt; `opt_color_auto` in
fr **28/28**; `opt_layout_a` in fr 28/28; `opt_style_no_flint` in en 36/36. Quattro chiavi a margine zero: una
parola in più su una di queste e la tripwire si accende. **UX-3 non tocca né le liste né i margini** (D123):
nessuna delle 11 chiavi nuove finisce in una `<option>` o in una `.rlab` — sono pulsanti, messaggi e didascalie —,
quindi `OPTIONS` restava a **29** e `LABELS` a **16**, `tools/build_i18n.py` era invariato e le quattro chiavi a
margine zero restano quelle. **S14** invece tocca la lista: `opt_layout_a_bottom` è un'`<option>` (28 al massimo,
la più lunga è l'inglese con 27) e `OPTIONS` passa a **30**.

Regole aggiunte da **S11 (D42)** per le due lingue nuove: registro **es «tú»**, **pt «você»** (informale come it «tu»
e de «du»); lessico neutro, valido in Spagna e in America per lo spagnolo, in Brasile e in Portogallo per il
portoghese; lo spazio prima di `: ; ! ?` è **solo** francese (in es e pt niente spazio), mentre lo spagnolo apre le
domande con «¿» e le esclamazioni con «¡»; decimali con la **virgola** in es e pt (`dec()`), separatore delle
migliaia `.` sull'orologio (D41); «KB», nomi propri e segnaposto `{0}`/`{1}` come nelle altre lingue. (Le due
etichette più lunghe citate qui in S11, «Aclarar las sombras (lift)» e «Clarear as sombras (lift)», in UX-1 hanno
perso il gergo fra parentesi, e la più lunga restava `lbl_lift` in fr, «Éclaircir les ombres», 20 caratteri; da
**UX-2** la `lbl_*` più lunga è `lbl_lang` — «Lingua (pagina e data)» e le sue traduzioni —, a **22/22** in
quattro lingue su sei: margine zero, non due caratteri.)

**Tre righe nuove del glossario (UX-1, 13/09/2026)**
1. **«slot» non è più invariante**: la parola esce da tutte e sei le colonne. L'insieme è «le tue foto»
   (`sec_photos`), la singola tessera è «Foto {0}» (`tile_slot`) con **{0} = la posizione visibile** (`page.js`
   passa `i + 1`), il contatore è «{0} di {1} foto». «slot» resta solo nel codice, nel persist e nei documenti.
   Fuori dai testi anche «album» come nome dell'insieme, «vetro»/«glass»/«vidro» (→ «lo schermo dell'orologio»,
   `opt_sunlight`) e «watchface»/«esfera»/«mostrador» (→ «Galleria»). **D75**: «elenco» è vietato solo come *nome*
   delle foto, non come parola — `fix_step_2` «l'elenco delle app» e `opt_order_seq` «come l'elenco» (l'ordine
   delle tessere) restano.
2. **pt = base BR neutra**: dove brasiliano e portoghese europeo divergono vince la forma brasiliana, purché si
   capisca in Portogallo: «Salvar», «Configurações», «tela», «arquivo», «app Pebble», «Remover» (mai «Apagar» né
   «Tirar»), «pré-visualização» (mai «prévia»: `i18n/README.md`).
3. **Attività in corso**: forma **nominale/impersonale** in it, de e fr («caricamento di {0}…», «{0} wird
   geladen…», «chargement de {0}…»), **gerundio** in es e pt («cargando {0}…», «carregando {0}…»); it ed es non
   vanno **mai** in prima persona (niente «sto caricando», «estoy cargando»).

**Tre righe nuove del glossario (UX-2, 13/09/2026)**
4. **Quattro «automatico» al posto di uno** (U-11): `opt_auto` esce, e ogni select dice **da dove** viene il
   valore — `opt_clock_auto` «come l'orologio», `opt_leading_zero_auto` «sì con 24 h, no con 12 h»,
   `opt_color_auto` «automatico (dalla foto)», `opt_outline_auto` «solo se serve». Il valore resta **0** in
   tutte e quattro: cambia solo il testo. ⚠️ **Su Pebble 2 Duo «solo se serve» coincide con «sempre»**: il ramo
   automatico dell'alone su un display in bianco e nero è `s_halo = s_luma.valid` (`ui_time.c:697`), cioè acceso
   ogni volta che c'è una foto valida. Il testo non cambia per piattaforma (la pagina non ha una parola per
   orologio), ma chi legge una segnalazione dal Duo deve saperlo. Allo stesso modo, su Duo `opt_color_yellow` e
   `opt_color_blue` non esistono e vengono rimappati su bianco e nero (`ui_time.c:683–684`): la pagina li mostra
   con il suffisso `opt_style_no_flint` «{0} (non sul Duo)», `disabled` **e** `hidden` insieme (D86: iOS ignora
   `hidden` da solo).
5. **Il nome dell'orologio è un nome proprio** (D35/D99): `watch_emery` esce dal dizionario — «Pebble Time 2» è
   cablato in `page.js` — e `watch_flint` diventa «Pebble 2 Duo · bianco e nero», **senza preposizione** in
   tutte e sei (en «black and white», de «Schwarz-Weiß»). `watch_unknown` resta. Fuori dal dizionario anche i
   due testi della pagina **senza stato**: senza stato non c'è nemmeno un dizionario da leggere (`decodeState`
   esce prima di `normI18n`), quindi `status_no_state` e `msg_no_state_save` sono due stringhe **inglesi
   cablate** in `page.js` (D83).
6. **Un nome per ogni blocco della pagina** (U-08): `sec_look` «Aspetto dell'ora» (en «How the time looks», mai
   «Clock look»), `sec_rotation` «Cambio foto» (en «Photo changes», mai «rotation»: «rotazione» resta parola
   del codice) e `adv_btn` «Altre impostazioni», che **non** va confusa con «Regolazioni della foto»
   dell'editor: sono due pulsanti a fisarmonica diversi e **ognuno dice il proprio oggetto**. In it, en, de e
   pt è diverso anche il sostantivo (Regolazioni/Impostazioni, adjustments/settings, anpassen/Einstellungen,
   Ajustes da foto/Mais configurações); in **fr** ed **es** il sostantivo è lo stesso — «Réglages de la photo»
   accanto ad «Autres réglages» e all'h2 «Réglages», «Ajustes de la foto» accanto a «Más ajustes» e all'h2
   «Ajustes» — e a distinguerli è il complemento «de la photo» / «de la foto». È una scelta dichiarata
   (revisione UX-3, G09; A2 aveva già respinto «Retouches/Retoques de la foto»: cambiare una sola lingua
   romperebbe il parallelo a sei colonne «<nome> della foto»), non una svista: chi ritocca fr o es tenga il
   complemento. La freccia ▾/▴ sta nel markup, fuori dal dizionario.

**Due righe nuove del glossario (UX-3, 13/09/2026 notte)**
7. **Un pulsante dice che cosa fa, e chi lo cita usa la sua parola**: il piè di pagina cambia nome invece di
   spegnersi — `btn_close` «Chiudi» a pagina pulita, `btn_cancel` «Esci senza salvare» con modifiche da salvare,
   `btn_cancel_armed` «Esci comunque» al secondo tocco (che riprende il **primo verbo** di `btn_cancel` in tutte e
   sei le lingue: Esci / Leave / verlassen / Quitter / Salir / Sair) — e ogni testo che **nomina** un pulsante lo
   scrive **identico** alla sua chiave: `unsaved_hint` e `footer_send` dicono «Salva» come `btn_save` (Save,
   Speichern, Enregistrer, Guardar, Salvar), `msg_del_arm` usa il verbo di `btn_delete` (togliere, remove,
   entfernen, retirer, quitar, remover). Mai un sinonimo: chi legge il messaggio deve ritrovare la stessa parola
   sotto il pollice. Lo stesso vale per i due pulsanti a fisarmonica, che restano **distinti per oggetto**
   (regola 6, anche dove il sostantivo coincide): `edit_adv_btn` «Regolazioni della foto» è dell'editor,
   `adv_btn` «Altre impostazioni» è delle impostazioni. La regola vale per le **citazioni** del pulsante
   («tocca Salva», «tap Save»), **non** per gli imperativi coniugati: `cap_next_help` de/fr/es/pt dice
   «Speichere/Enregistrez/Guarda/Salve queste foto…» con la voce del verbo, non con l'infinito dell'etichetta,
   esattamente come facevano già `msg_removed` («quando salvi») e `cap_over_fix` («poi salva»); accolto così
   nella revisione di UX-3 (G35), senza toccare le quattro colonne.
8. **Un testo che si vede solo in un `title` non sta in dizionario** (estensione di D72): i quattro `err_*`
   dell'editor finivano unicamente nell'attributo `title` di `#msg` — sul telefono non si legge — e sono
   diventate stringhe **inglesi cablate** in `page.js`; con loro escono il nome del file con i pixel
   (`edit_name`: nome proprio + numeri, D35) e la riga dei tempi solo-dev (`edit_time`). Una chiave in più costa
   byte nell'URL in tutte e sei le lingue anche quando nessuno la legge. Al contrario `msg_sending` **rientra**:
   da D108 quella frase la vede anche chi salva dal telefono, non solo la modalità dev che l'aveva fatta uscire
   in UX-1.

**Vocabolario unico fissato in UX-1** (§2.2 del piano S13, sorgente `messages.json`): un solo verbo per togliere una
foto (Togli / Remove / Entfernen / Retirer / Quitar / Remover, `btn_delete`), un solo verbo per l'invio («inviare»,
mai «mandare»), «l'orologio», «il telefono» (de «Telefon», **D60**), «app Pebble», «Galleria» soggetto quando si
parla dell'avvio («si avvia lentamente», mai «si accende»). Le `<option>` restano **minuscole** (**D68**): la
maiuscola solo quando il testo comincia con un nome proprio o con «Ora»/«Font» («Ora in alto, info sotto», «Font di
sistema (tranne Ora grande)»), e dentro una stessa select lo stile è uniforme. **Deroga tedesca**: in de il
**sostantivo resta maiuscolo** anche in apertura di `<option>` — è ortografia, non stile: «nur Kontur»,
«Kontur mit Schatten», «Systemschrift (außer Große Uhrzeit)» —, quindi in tedesco l'uniformità dentro la
select si giudica sui **non-sostantivi** («gefüllt», «automatisch», «nie», «zufällig» minuscoli). Unica
select maiuscola in tutte e sei le lingue: quella della Lingua, dove `opt_lang_auto` («Automatica
(orologio: {0})», de «Automatisch (Uhr: {0})») segue gli **endonimi** «English», «Italiano», «Deutsch»,
«Français», «Español», «Português», che sono nomi propri e stanno fuori dal dizionario.

> **Storia del dizionario** — una riga per riallineatura; per il **testo di oggi** vale sempre la tabella
> qui sopra, mai questa nota. Misure di **fine UX-4** (14/09/2026): `i18n/messages.json` **39.834 B**,
> `src/pkjs/i18n.js` e `test/fixture_i18n.js` **36.500 B** ciascuno, i sei dizionari nell'hash della pagina
> **36.934 caratteri** di base64url; testo per lingua it **3.944** caratteri, en 3.846, de 4.372, fr **4.496**,
> es 4.014, pt 4.083, con `help_why` voce più lunga in tutte e sei (fra 238 e 284 caratteri). Ogni
> riallineatura rigenera insieme `src/pkjs/i18n.js`, `test/fixture_i18n.js` e `src/pkjs/config_page.js`.
>
> • **S11** (06/09/2026, revisione TR): celle **es/pt** riallineate dopo le traduzioni, dove traduttore e
>   revisore hanno scelto altro rispetto alla proposta scritta prima (`Salvar`, `Sair sem salvar`,
>   `Configurações`, `Layout`/`Tela cheia`, `linha de info`, `relleno`/`preenchido`, `Estilo de dígitos`,
>   `Zero à esquerda`, `Intervalo de fotos`, `secuencial`/`em sequência`, `próxima foto`,
>   `Otimizar para o vidro`, `Cancelar recorte`, `para enviar`, `iniciarse`/`inicia lentamente`).
>   ⚠️ Otto di quelle stringhe **non esistono più** in `messages.json`, riscritte da UX-1:
>   `Layout`/`Tela cheia` (`opt_layout_a`/`opt_layout_b`), `linha de info` (`lbl_info_row`),
>   `Intervalo de fotos` (`lbl_interval`), `secuencial`/`em sequência` (`opt_order_seq`), `próxima foto`
>   (`opt_shake_next`), `Otimizar para o vidro` (`opt_sunlight`: «vetro»/«vidro» è parola vietata dal
>   lessico), `Cancelar recorte` (`msg_crop_cancel`) e `para enviar` (`badge_new`); restano in file `Salvar`,
>   `Sair sem salvar`, `Configurações`, `relleno`/`preenchido`, `Estilo de dígitos` (es), `Zero à esquerda`
>   e `tarda en iniciarse`/`inicia lentamente`.
> • **UX-1** (13/09/2026, D68–D79): da **135 a 126** chiavi, **58 riscritte**, lessico unico di
>   `galleria-s13-ux-casual.md` §2.2 (fuori «slot», «album», «vetro»).
> • **UX-2** (13/09/2026, D80–D99): da **126 a 132** chiavi — **6 eliminate** (`watch_emery`,
>   `status_no_state`, `msg_no_state_save`, `opt_auto`, `preview_white`, `preview_black`) e **12 nuove in
>   coda** — e **19 voci riscritte** (fra cui `preview_note_info` nella forma con `{0}` di **D102**,
>   `preview_note_no_masks` in tedesco, `help_why` e `fix_lead` di **D103**). `watch_emery` era la chiave
>   **0**, quindi scalarono **tutti** gli indici. Misure: `messages.json` 38.127 B, `i18n.js` e fixture
>   34.859 B, hash 35.024 caratteri.
> • **UX-3** (13/09/2026 notte, D104–D125): da **132 a 135** chiavi — **8 eliminate** (`edit_name` e
>   `edit_time`, `preview_off` sostituita da **`preview_stale`**, `msg_close_crop` e i quattro `err_*`
>   dell'editor, diventati stringhe inglesi cablate in `page.js`) e **11 nuove in coda** —, **nessuna
>   riscritta**; `edit_name` era la chiave **45**, quindi gli indici scalano da lì. Misure:
>   `messages.json` 39.820 B, `i18n.js` e fixture 36.486 B, hash 36.915 caratteri.
> • **UX-4** (14/09/2026, D130/D132/D133): la tabella smette di essere una **selezione** — copriva **100**
>   delle 135 chiavi, esatta al byte su quelle (606 celle confrontate, 606 identiche, rapporto R2 §4) — e
>   passa a **tutte e 135** in **68 righe**: le **35** mancanti aggiunte in coda, generate da
>   `messages.json` e raggruppate per zona (intestazione e stato 4, foto e tessere 7, editor 5, aspetto
>   dell'ora 2 — i due aiuti sotto «Stile cifre» —, aiuto e avvio lento 8, tetto e messaggi 4,
>   anteprima 5). Unico ritocco di testo: `preview_stale` in **francese** («… c'est le recadrage **dans le
>   cadre** qui compte», R2 §6.1), che non muove nessun indice.
> • **S14** (19/09/2026, D136/D137/D141): da **135 a 134** chiavi — entra `opt_layout_a_bottom` («Ora in
>   basso, info sopra») subito **dopo** `opt_layout_a`, quindi gli indici scalano da lì, ed escono
>   `font_prev` e `font_next` con le frecce accanto al font —, con **tre riscritte per D141** (indici
>   fermi, testi nuovi): `opt_font_leco` («tranne Ora grande»: LECO vale anche con «Ora in basso»),
>   `lbl_info_row` e `preview_note_info`, che con tre disposizioni non possono più dire «sotto l'ora» —
>   «Accanto all'ora»/«accanto all'ora», prima scelta del 19/09 sera, **non** ha retto la revisione (la riga
>   info non sta mai di fianco alle cifre: sta **sopra** in «Ora in basso» e **sotto** in «Ora in alto»),
>   quindi l'etichetta dice «Insieme all'ora» (en «With the time», de «Mit der Uhrzeit», fr «Avec
>   l'heure», es «Con la hora», pt «Com a hora»; ≤ 22, tripwire delle etichette) e la nota
>   dell'anteprima, che non ha tetto, è esatta: «Sull'orologio, **sopra o sotto l'ora**, compare quello che
>   hai scelto: {0}». La tabella passa da 68 a **67 righe**. Misure: `messages.json` 39.776 B, `i18n.js` e
>   fixture 36.482 B, hash 36.959 caratteri.

## 4. Compiti per importanza (regola a 4 livelli)
- **alta → Fable**: questa spec; C (`settings`, `datefmt`, `ui_time` icona e data, `sync.c`); integrazione; gate; PIANO/CONTINUA-QUI/design.
- **medio-alta → Fable**: test-writer adversariale di `datefmt`/`settings`; scettici sui diff C; scettico sull'integrazione PKJS↔pagina (stato `i18n`/`lang_auto`, byte 13).
- **medio-bassa → Opus**: `messages.json` + `build_i18n.py` + passo i18n di `build_config_page.py`; refactor della pagina; PKJS (`index.js`, `album.js`); dev server; test JS/Python; traduzioni DE/FR (traduttore + revisore per lingua) e revisione EN.
- **bassa → Opus**: README/CLAUDE.md/design (documenti), release notes 0.2.0.

## 5. Regole per gli agenti
Nessun emulatore (esclusivo dell'orchestratore); nessun git; solo i file assegnati; `PIANO.md`/`CONTINUA-QUI.md` all'orchestratore; log PKJS solo ASCII (i dizionari con accenti non si stampano mai con `log()`); pagina ES5 senza backtick né risorse esterne; ogni numero da un comando.

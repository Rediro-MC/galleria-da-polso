#!/usr/bin/env node
/* test_page.js — Galleria S6 (M4): test host di src/pkjs/config/page_core.js (puro) e page.js
 * (UI) con un DOM finto, secondo docs/design/galleria-s6-config-page.md §8.
 *
 * Parte 1 — page_core.js richiesto come modulo node (UMD): decodeState (hash valido/assente/
 * rotto/«città»/emoji), b64urlToBytes + utf8Decode, normalizeSettings, buildTiles, freeSlot,
 * buildPayload, payloadKb, capMessage, truncateName, thumbFits.
 *
 * Parte 2 — pipeline.js + page_core.js + preview.js + page.js girano nello stesso contesto
 * (vm.runInContext) con:
 *   - un DOM finto costruito PARSANDO page.html (tag, id, attributi, <option> comprese): un id
 *     sbagliato in page.js trova null e il test esplode; getContext/toDataURL esistono solo sui
 *     <canvas>, e gli eventi non partono sugli elementi disabled (come nel browser);
 *   - GalPreview (S12, contratto §1.2 della spec S12): il motore vero se preview.js esiste,
 *     altrimenti uno stub; in ogni caso dietro un involucro che registra chiamate e risultati
 *     (env.previewCalls/previewResults) — qui si prova la PAGINA, non il motore;
 *   - canvas finto: drawImage/fillRect/strokeRect/setLineDash no-op ma registrati,
 *     getImageData deterministico (lo stesso pattern che il test usa per calcolare l'atteso),
 *     createImageData/putImageData (registra l'ultima immagine), toDataURL configurabile;
 *   - createImageBitmap finto (thenable sincrono: niente attese), Image + URL per il fallback;
 *   - XMLHttpRequest finto con coda e flush(), setTimeout/clearTimeout finti con run();
 *   - location finta {hash, search, protocol, href}, navigazione catturata con
 *     GalPage.setNavigate (l'href della location resta come rete di sicurezza).
 * La codifica delle foto e' quella VERA (GalPipeline sui pixel finti): crc/len/photo_id/data
 * dell'entry si confrontano con encodeEmery/encodeFlint chiamati direttamente dal test.
 *
 * Sezioni: 1a-1f page_core puro; 2a markup di page.html; 2b avvio (emery, dev); 2c avvisi
 * (hash assente/rotto, settingsSet, flint, orologio sconosciuto); 2d riordino ed eliminazione;
 * 2e aggiunta con codifica vera, slot libero, nome troncato; 2f controlli dell'editor e Annulla;
 * 2g gesti (drag, rotellina, zoom, Adatta, pinch, fallback touch); 2h album pieno; 2i impostazioni
 * (LECO/layout, riga info); 2j Salva dev; 2k Salva telefono/prova e Annulla; 2l tetto KB;
 * 2m errori (POST 500/ok:false/rete, immagine illeggibile, miniature); 2n flint; 2o robustezza;
 * 2p stato ostile, nomi strani, immagini estreme.
 * Parte 3 — un caso per ogni finding confermato dalla revisione S6 (compito A6): 3a #1 stato non
 * ricevuto ⇒ Salva disabilitato; 3b #3 truncateName senza surrogato spaiato; 3c #4 cap_kb su iOS
 * (capForUa); 3d #6 estranee in coda senza frecce; 3e #10 pulsanti ≥ 40 px + messaggio dopo ✕;
 * 3f #12 due file in rapida successione (generazione); 3g #20 etichette distinte, Esci in due
 * tocchi; 3h #23 aria-label; 3i #24 classe rlab; 3j #27 ed.last dopo un resample fallito;
 * 3k #33 return_to solo http(s)/relativo; 3l #35 scratch azzerati; 3m #42 padding del body;
 * 3n #28 badge 14 px.
 * Parte 4 — S7 (4a-4e), v1.9: 4f-pin autoprova del pin F11 (il consiglio rovesciato deve
 * fallire in tutte e sei le lingue), 4f avviso di avvio lento #slow (soglia openMs) e sezione
 * Aiuto #help (riga help_sync compresa);
 * S8-stile / UX-2: 4g campo «Stile cifre» (digit_style), font 0..5 con le frecce ‹ › (U-10),
 * regola D26 (su flint le due opzioni 3D sono spente E nascoste, e il valore scende a 1/0) e
 * «Bordo di contrasto» mai disabilitato (D62/D98).
 * Parte 5 — S10 lingua della pagina (D33/D35/D36): 5a automatica dall'orologio e override dalla
 * select; 5b id e valori delle <option> stabili, nessun segnaposto residuo, decimali per lingua;
 * 5c il rovescio della 5b — dopo applyLang nessuna etichetta (.rlab, h2, h3, .btn) resta vuota a
 * schermo, cioe' nessun data-i18n perso nel markup (i testi non stanno piu' nell'HTML).
 * Parte 6 — S12 anteprima della watchface (D46/D47/D48): 6a che cosa la pagina passa al motore
 * (formato, misure, scala 2x, maschere, ora campione) e le didascalie senza foto; 6b l'occhio
 * (solo sulle tessere nuove, classe pv, default all'ultima aggiunta, scelta mai salvata);
 * 6c il ridisegno a ogni cambio di font/stile/layout/colore/contorno/lingua e la nota LECO;
 * 6d la foto vera (editor in corso, aggiunta, chiusura); 6e il degrado quando il motore manca o
 * lancia; 6f un giro con il motore vero (src/pkjs/config/preview.js), se e' gia' in cartella.
 * Parte 7 — UX-2 struttura e aspetto: 7a la riga dei KB solo da meta' tetto in su (U-03/D91);
 * 7b la riga «Questo e' l'ordine delle foto» (U-04/D93); 7c «Altre impostazioni» ripiegate,
 * l'apertura derivata dallo stato e la riga «Sotto l'ora» (U-08/D88/D89); 7d le frecce ‹ › che
 * sfogliano i font, giro compreso e LECO saltato (U-10/D87); 7e i quattro «automatico» e le
 * option che su Duo non esistono, disabled + hidden (U-11/D86). Le altre voci di UX-2 stanno
 * nelle sezioni di sempre: 1g/2c la nota sulle impostazioni (D82), 1h l'anagrafe del dizionario,
 * 2a il markup (§3 del contratto), 4e le famiglie di pulsanti nuove, 4f l'avviso di avvio lento
 * (D81), 4g gli stili con il bordo mai disabilitato (D62/D98), 6a l'anteprima (D90/D92).
 *
 * DUE GIRI (revisione S6, finding #8: nessun test eseguiva l'artefatto davvero spedito). Le
 * sezioni si registrano e girano identiche su due varianti:
 *   1) «sorgenti»  = i file di src/pkjs/config/ (page.html, page.css, i 4 .js via require);
 *   2) «inlinato»  = l'HTML dentro src/pkjs/config_page.js (require: e' cio' che index.js manda
 *      nel data: URL). I corpi degli <script> e dello <style> si estraggono nell'ordine del
 *      documento; l'HTML costruisce il DOM finto come per page.html, gli script girano nello
 *      stesso contesto, e i due moduli puri si prendono da vm.runInThisContext (stesso realm).
 *      In piu' la sezione 0 controlla la struttura del modulo: intestazione «GENERATO», 4
 *      <script> nell'ordine pipeline -> page_core -> preview -> page (riconosciuti da quale
 *      globale assegnano), un solo <style>, nessun src=/link= rimasto, nessuna riga che inizia
 *      con «//» (lo strip dell'inliner), tetto di 96 KB. Se una foto della struttura e' sbagliata
 *      le sezioni del 2o giro si saltano (l'errore sarebbe illeggibile); se config_page.js manca
 *      il 2o giro e' «saltato» senza fallire (make resta verde).
 *
 * Sensibilita' verificata a mano con mutanti su page.js/page_core.js (freeSlot senza deleted,
 * token non percent-encoded, LECO non forzato, sunlight ignorato, flintRect non applicato,
 * dimensioni flint, miniatura senza ripiego, pending, frecce, nome non troncato, clamp della
 * vista, order/data/hash; S10: data-i18n tolto dalla label di #s_layout -> 5c rossa in entrambi i
 * giri): ognuno fa fallire almeno un'asserzione. Sul 2o giro, con mutanti
 * sull'artefatto: testo cambiato in un <script> (fallisce solo «inlinato»), riga «//» rimasta,
 * preview e page scambiati (sezioni saltate), module.exports non stringa (1 fail).
 * UX-2 (revisione 13/09/2026, lente «test»): mutanti sulla struttura nuova — box-sizing di
 * #wfPreview tolto, #fontRow .rlab cancellata, nm >= 2 -> n >= 2, il suffisso «(non sul Duo)»
 * scritto una volta sola (cambio di lingua), #advBtn spostato fuori da #misc, .opts gap 10 -> 4,
 * regola h3 cancellata, #misc senza margin/padding, .chk senza align-items, .kb{...} risorta
 * compatta, kb >= cap/2 -> kb > cap/2: ognuno fa fallire almeno un'asserzione (2a, 6a, 7a, 7b, 7e).
 *
 * UX-1 / U-02 (13/09/2026): le asserzioni NON confrontano piu' testi italiani cablati. Ogni pin
 * che leggeva una parola della pagina passa dal dizionario — `Tit('chiave', a, b)` per il testo
 * intero, `Tpre('chiave')` per il prefisso invariante di una chiave con segnaposto — cosi' una
 * riscrittura di `i18n/messages.json` non costa una passata sul test. Restano letterali SOLO i
 * tre pin load-bearing: (1) F11, il passo 3 dell'Aiuto, pinnato come invariante semantico
 * in TUTTE E SEI le lingue — `LANG_PIN` / `pinStep3()`, al posto dei vecchi confronti con
 * «scegli Rimuovi (non Aggiorna)»: la negazione deve stare ENTRO 20 CARATTERI PRIMA della
 * radice di «aggiornare» (cosi' nega quel verbo, non un altro) e la radice del verbo
 * «togliere» deve comparire nella stessa riga; la sezione 4f-pin prova che il consiglio
 * ROVESCIATO («aggiorna Galleria (non rimuoverla)»), che la regola di prima lasciava passare,
 * adesso fallisce in tutte e sei le lingue; (2) F06, la stima del ritorno delle foto («in pochi
 * minuti», mai «circa un minuto», nelle sei lingue); (3) il «12»
 * del contatore nel giro 5b (su una pagina con foto e su una senza: `photos_cap` e
 * `photos_cap_empty`). `Trx('chiave', p0, p1)` costruisce dal dizionario la regex di una riga
 * con numeri variabili (contatore KB, tempi dell'editor), cosi' nemmeno quelle cablano il testo.
 * `Tit` NON e' una rete contro una chiave SPARITA dal dizionario: per una chiave senza segnaposto
 * ripiega su `String(chiave)` esattamente come il `T()` della pagina, quindi i due lati
 * coinciderebbero e il test resterebbe verde (in certi `contains` nasconderebbe perfino un fail).
 * Quello che `Tit` distingue e' la chiave SBAGLIATA; le chiavi mancanti le trovano
 * `tools/build_i18n.py --check` e `tools/build_config_page.py` (chiave inesistente = errore).
 * Prerequisito: `python3 tools/build_i18n.py` PRIMA di `node test_page.js` (Tit legge la fixture).
 *
 * UX-2 (13/09/2026, contratto ~/galleria-gate/ux/ux2/CONTRATTO-UX2.md §3 e D80–D99): la pagina
 * cambia STRUTTURA. previews.js esce dalla build (D95: niente PNG «12:34», niente #fontPreview,
 * niente .fontprev) e restano quattro <script>; «Cambio foto» (intervallo, ordine, scossa) scende
 * in coda a «Le tue foto» (D51/D80) con la riga #photosHint (D93); le impostazioni si aprono con
 * l'h3 «Aspetto dell'ora» e finiscono in #misc — Lingua (D49) + «Altre impostazioni»
 * (#advBtn/#advBody, D88) con Formato ora, Zero davanti all'ora, Bordo di contrasto e la riga
 * «Sotto l'ora» (#infoRow, D89); l'avviso #slow porta solo la frase e un pulsantino che apre
 * l'Aiuto (D81), #slowFix resta vuoto; senza stato l'avviso e il messaggio di Salva sono in
 * inglese cablato (D83: status_no_state/msg_no_state_save cancellate); #settingsNote si vede solo
 * se l'orologio ha davvero impostazioni sue (D82: C.DEFAULTS_CRC / C.settingsDiffer, con
 * album.settingsCrc(defaultSettings()) come tripwire); le frecce ‹ › sfogliano i font (D87);
 * l'anteprima e' a grandezza naturale (D92: #wfPreview width auto + cv.style.width) e la sua nota
 * non ha piu' coda fissa (D90). Le asserzioni restano pinnate al dizionario (U-02).
 *
 * UX-3 (13/09/2026 notte, contratto ~/galleria-gate/ux/ux3/CONTRATTO-UX3.md §1, D104–D125):
 * cambia il FLUSSO DELLA FOTO. L'editor mostra la watchface intera nel suo canvas (#preview) con
 * lo STESSO motore di #wfPreview, che intanto sparisce (D105), e la sua didascalia e' fissa
 * (#editPrevCap, D106); i comandi fini scendono in «Regolazioni della foto» (#editAdvBtn /
 * #editAdvBody, D114) e #etime resta solo in dev, in inglese cablato; la coppia «Usa questa
 * foto»/«Non aggiungere» (#addRow) e' nascosta a id intatti (D119) e a comandare e' il footer,
 * che cambia parola da solo — Salva/«Usa questa foto», «Chiudi»/«Esci senza salvare»/«Esci
 * comunque» — e porta una riga di aiuto #hint (D107/D121); la ✕ delle tessere vuole DUE tocchi
 * (D110) e l'occhio compare solo con almeno due foto nuove (D111); mentre la foto si carica
 * «Aggiungi foto» dice «Un momento…» (D109) e, quando la prossima foto sforerebbe il tetto, si
 * spegne PRIMA (D117). Il dizionario passa da 132 a 135 chiavi: 8 escono (edit_name, edit_time,
 * preview_off, msg_close_crop e i quattro err_*, che diventano stringhe inglesi cablate nel
 * title) e 11 entrano in coda (D116). Sezioni nuove: 8a stato di caricamento (U-04), 8b la ✕ a
 * due tocchi (U-05), 8c cornice e regolazioni (U-06), 8d un solo motore (U-07), 8e il footer
 * (U-13), 8f la prevenzione del tetto (U-14).
 *
 * UX-3 rev (13/09/2026 notte, revisione del contratto §7: gruppi Gnn di ~/galleria-gate/ux/ux3/
 * rapporti/DEDUP.md). Le asserzioni marcate «Gnn» coprono i buchi che la revisione ha trovato —
 * quattro invarianti che nessun caso poteva far fallire e sei comportamenti nuovi:
 *   G03 (8e) l'avviso «tocca di nuovo per uscire» se ne va con l'arma, e SOLO lui (il rovescio
 *   con msg_read_fail); G07 (8b) la ✕ armata si riprende il fuoco, che renderTiles le toglie —
 *   El.prototype.focus installata per il solo caso; G12 (8b) il rovescio di msgIsArm: un
 *   messaggio ESTRANEO (Salva in prova, che non passa da updateKb) sopravvive al disarmo;
 *   G13 (3g/h6) se la pagina non si chiude, il footer torna «Esci senza salvare»; G14 (8d, in
 *   coda) con l'editor aperto e il debounce non ancora scaduto renderPreview esce subito;
 *   G16/G17/G20/G05/G15 (8c, 7d, 8e, 8b) le cinque dichiarazioni nuove del foglio; G19 (2b, 4c,
 *   8b) lo zero-width space del nome — noZw() lo toglie dai confronti, un pin ne fissa la
 *   posizione, title/aria-label/messaggi restano puliti; G22 (4e) il selettore morto
 *   .tile.pv .eye[disabled] esce dal foglio: la famiglia dell'occhio scelto perde lo stato
 *   «spento» (offDead) e al suo posto si pinna che nessuna riga di page.js disabilita un occhio;
 *   G24/G25/G26/G28/G29/G30/G31/G32 sparse nelle sezioni 8a-8f.
 *
 * Esecuzione: `node test_page.js` dalla cartella test/, oppure `make -C test jstest`.
 * Esito: "test_page: sorgenti N ok, inlinato N ok" (o «saltato»), exit 1 se un giro ha fail.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var CFG = path.join(__dirname, '..', 'src', 'pkjs', 'config');
/* l'artefatto spedito. GAL_CONFIG_PAGE lo fa leggere da un'altra cartella: serve a provare il
 * giro «inlinato» su una rigenerazione di prova senza scrivere il file in repo (che non e' del
 * test). Senza la variabile il percorso e' quello di sempre. */
var MOD = process.env.GAL_CONFIG_PAGE || path.join(__dirname, '..', 'src', 'pkjs', 'config_page.js');
if (process.env.GAL_CONFIG_PAGE) {            /* detto subito: il giro «inlinato» non e' quello di repo */
  console.log('test_page: GAL_CONFIG_PAGE = ' + MOD);
}
/* UX-2 (D95): previews.js e' uscito dalla build — la pagina non mostra piu' la PNG «12:34»
 * (U-10). Restano i quattro script di page.html e di SCRIPT_ORDER in build_config_page.py. */
var SCRIPTS = ['pipeline.js', 'page_core.js', 'preview.js', 'page.js'];
var b64 = require(path.join(__dirname, '..', 'src', 'pkjs', 'b64.js'));
/* S10: gli stessi dizionari che il PKJS mette nello stato (generati da tools/build_i18n.py).
 * La pagina li riceve in state.i18n; nei test sui SORGENTI le chiavi sono ancora nomi, quindi
 * il contesto espone anche GalI18nKeys (nell'artefatto sono gia' indici e non serve). */
var I18N = require(path.join(__dirname, 'fixture_i18n.js'));
var DICTS = { en: I18N.en, it: I18N.it, de: I18N.de, fr: I18N.fr, es: I18N.es, pt: I18N.pt };
/* Chiave come appare nella variante in prova: nome nei sorgenti, indice nell'artefatto (dove
 * build_config_page.py le ha gia' convertite). Serve solo dove la pagina mostra la CHIAVE,
 * cioe' quando non c'e' stato e quindi nessun dizionario (D35). */
function K(name) { return V.inlined ? String(I18N.keys.indexOf(name)) : name; }
/* T italiano, identico a quello della pagina: i confronti restano sui testi veri */
function Tit(k, a, b) {
  var i = (typeof k === 'number') ? k : I18N.keys.indexOf(k);   /* l'artefatto passa gia' l'indice */
  var t = (i >= 0 && i < I18N.it.length) ? I18N.it[i] : String(k), v = [a, b];
  return t.replace(/\{([01])\}/g, function (m, n) { return v[+n] === undefined ? m : v[+n]; });
}
/* U-02: prefisso invariante di una chiave con segnaposto — il testo italiano fino al primo {n}
 * (senza spazi, due punti o parentesi in coda), per i `contains` che non conoscono i valori.
 * Cosi' una riscrittura del testo non costringe a ritoccare il test e la chiave resta pinnata. */
function Tpre(k) {
  var i = (typeof k === 'number') ? k : I18N.keys.indexOf(k);
  var t = (i >= 0 && i < I18N.it.length) ? I18N.it[i] : String(k), m = /\{[01]\}/.exec(t);
  return (m ? t.slice(0, m.index) : t).replace(/[\s:(]+$/, '');
}

/* U-02 (revisione): regex costruita dal dizionario, per le righe che contengono numeri variabili
 * (contatore KB, tempi dell'editor, tetto). Il testo italiano della chiave viene escapato e i due
 * segnaposto sostituiti dai frammenti passati, gia' in sintassi regex; con `anchor` la regex e'
 * ancorata a tutta la riga. Cosi' una riscrittura del testo non costa una passata sul test e la
 * chiave resta pinnata. */
function Trx(k, p0, p1, anchor) {
  var t = Tit(k, '\u0000', '\u0001');
  var e = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
           .replace(/\u0000/g, p0 === undefined ? '' : p0)
           .replace(/\u0001/g, p1 === undefined ? '' : p1);
  return new RegExp(anchor ? '^' + e + '$' : e);
}
/* D72 (UX-1): le stringhe di dev/prova non stanno piu' nel dizionario — sono cablate in inglese in
 * page.js e si vedono solo con mode() 'dev'/'test'. Qui restano letterali per forza: sono il testo
 * vero dell'artefatto, non una traduzione (nessuna parola italiana, nessuna chiave da pinnare). */
var EN_DEV = {
  sending: 'Sending ', saved: 'Saved (seq ', saveFail: 'Save failed: ',
  noReply: 'no reply in 30 s', noServer: 'dev server unreachable',
  testPayload: 'Test mode: payload of ', testClose: 'Test mode: closed without changes'
};

/* Sorgenti in uso: li imposta runVariant() prima di ogni giro, cosi' le STESSE sezioni girano
 * sui file di src/pkjs/config/ e poi sull'HTML inlinato di src/pkjs/config_page.js (finding #8:
 * nessun test eseguiva l'artefatto davvero spedito, con lo strip delle righe di commento). */
var V = null, PAGE_HTML = '', PAGE_CSS = '', SRC = {}, C = null, P = null;

var g_ok = 0, g_fail = 0, g_tag = '';

function check(cond, what) {
  if (cond) { g_ok++; } else { g_fail++; console.log('FAIL ' + g_tag + what); }
}
function eq(got, exp, what) {
  if (got === exp) { g_ok++; }
  else { g_fail++; console.log('FAIL ' + g_tag + what + ': ' + JSON.stringify(got) + ' invece di ' + JSON.stringify(exp)); }
}
function eqJson(got, exp, what) { eq(JSON.stringify(got), JSON.stringify(exp), what); }
function contains(str, sub, what) {
  if (typeof str === 'string' && str.indexOf(sub) >= 0) { g_ok++; }
  else { g_fail++; console.log('FAIL ' + g_tag + what + ': ' + JSON.stringify(str) + ' non contiene ' + JSON.stringify(sub)); }
}
function notContains(str, sub, what) {
  if (typeof str === 'string' && str.indexOf(sub) < 0) { g_ok++; }
  else { g_fail++; console.log('FAIL ' + g_tag + what + ': ' + JSON.stringify(str) + ' contiene ' + JSON.stringify(sub)); }
}
function errText(e) {
  if (!e) { return String(e); }
  return (e.name ? e.name + ': ' + e.message : String(e)) +
         (e.stack ? ' | ' + String(e.stack).split('\n').slice(1, 4).join(' <- ').replace(/\s+/g, ' ') : '');
}
/* Le sezioni si REGISTRANO e girano alla fine, una volta per variante (sorgenti, inlinato).
 * Una sezione che esplode conta un FAIL e non ferma le altre: la riga finale arriva sempre. */
var SECTIONS = [];
function section(name, fn) { SECTIONS.push({ name: name, fn: fn }); }
function runGuard(name, fn) {
  try { return fn(); }
  catch (e) { g_fail++; console.log('FAIL ' + g_tag + 'sezione ' + name + ': eccezione ' + errText(e)); return null; }
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
/* base64url dei byte UTF-8: lo stesso produttore del PKJS (index.js usa b64.encodeUtf8) */
function hashOf(state) { return b64.encodeUtf8(JSON.stringify(state)); }

var DEFAULT_SETTINGS = { layout: 0, font: 0, clock_mode: 0, leading_zero: 0, text_color: 0,
                         outline: 0, interval_min: 30, order: 0, shake_next: 1, info_row: 15,
                         digit_style: 0, lang: 0 };
var SETTINGS_KEYS = ['layout', 'font', 'clock_mode', 'leading_zero', 'text_color', 'outline',
                     'interval_min', 'order', 'shake_next', 'info_row', 'digit_style', 'lang'];
var N_SETTINGS = SETTINGS_KEYS.length;                       /* S10: 12 con lang */

/* ============================================================ 1. page_core.js (puro) ==== */

section('1a. decodeState', function () {
  var d = C.decodeState('');
  eq(d.ok, false, 'hash vuoto: ok false');
  eq(d.error, 'state missing', 'hash vuoto: error in inglese (nessun dizionario, D35)');
  eq(d.platform, 'unknown', 'hash vuoto: platform unknown');
  eq(d.fmt, 1, 'hash vuoto: fmt 1');
  eq(d.cap_kb, 900, 'hash vuoto: cap_kb 900');
  eq(d.dev, false, 'hash vuoto: dev false');
  eq(d.settingsSet, false, 'hash vuoto: settingsSet false');
  eqJson(d.settings, DEFAULT_SETTINGS, 'hash vuoto: impostazioni di default');
  eq(d.photos.length, 12, 'hash vuoto: 12 slot');
  eq(d.photos[0], null, 'hash vuoto: slot vuoti');
  eqJson(d.order, [], 'hash vuoto: order []');
  eqJson(d.deleted, [], 'hash vuoto: deleted []');
  eq(d.watch, null, 'hash vuoto: watch null');

  eq(C.decodeState(undefined).ok, false, 'hash undefined: ok false');
  eq(C.decodeState(null).ok, false, 'hash null: ok false');
  eq(C.decodeState('#').ok, false, 'hash "#": ok false');

  var st = { v: 1, platform: 'emery', fmt: 1, cap_kb: 200, dev: true, settingsSet: true,
             settings: { layout: 1, font: 2, interval_min: 60, info_row: 5 },
             photos: [{ id: 7, name: 'città al tramonto 😀.jpg', thumb: 'data:image/jpeg;base64,AAAA',
                        fmts: { 1: { len: 1, crc: 4294967000 } } }],
             order: [0], deleted: [3],
             watch: { at: 5, format: 1, maxChunk: 4096, settingsCrc: 9,
                      slots: [{ state: 1, crc: 4294967000 }], foreign: [9, 9, 20] } };
  var h = hashOf(st), s = C.decodeState(h);
  eq(s.ok, true, 'hash valido: ok true');
  eq(s.error, undefined, 'hash valido: nessun error');
  eqJson(C.decodeState('#' + h), s, 'hash con e senza "#" iniziale: stesso stato');
  eq(s.platform, 'emery', 'hash valido: platform');
  eq(s.fmt, 1, 'hash valido: fmt');
  eq(s.cap_kb, 200, 'hash valido: cap_kb 200');
  eq(s.dev, true, 'hash valido: dev true');
  eq(s.settingsSet, true, 'hash valido: settingsSet true');
  eq(s.photos[0].name, 'città al tramonto 😀.jpg', 'hash valido: nome UTF-8 (accento + emoji) intatto');
  eq(s.photos[0].id, 7, 'hash valido: id della foto');
  eq(s.photos[0].thumb, 'data:image/jpeg;base64,AAAA', 'hash valido: miniatura');
  eq(s.photos[0].fmts[1].len, 34200, 'hash valido: len del formato 1 forzato a 34200');
  eq(s.photos[0].fmts[1].crc, 4294967000, 'hash valido: crc senza segno');
  eq(s.photos[0].fmts[2], undefined, 'hash valido: formato 2 assente');
  eq(s.photos[1], null, 'hash valido: slot mancanti a null');
  eqJson(s.order, [0], 'hash valido: order');
  eqJson(s.deleted, [3], 'hash valido: deleted');
  eq(s.watch.slots.length, 12, 'hash valido: 12 slot nel watch');
  eqJson(s.watch.slots[1], { state: 0, crc: 0 }, 'hash valido: slot del watch mancante = {0,0}');
  eqJson(s.watch.foreign, [9], 'hash valido: foreign senza duplicati ne slot fuori intervallo');
  eq(s.settings.layout, 1, 'hash valido: layout 1');
  eq(s.settings.font, 2, 'hash valido: font 2 (ammesso anche con layout 1)');

  /* fmt e cap_kb di ripiego (v: 1 sempre presente: senza, dalla S7 lo stato e' "non ricevuto", #31) */
  eq(C.decodeState(hashOf({ v: 1, platform: 'flint' })).fmt, 2, 'platform flint senza fmt: fmt 2');
  eq(C.decodeState(hashOf({ v: 1, platform: 'pippo' })).platform, 'unknown', 'platform sconosciuta: unknown');
  eq(C.decodeState(hashOf({ v: 1, platform: 'pippo' })).fmt, 1, 'platform sconosciuta senza fmt: fmt 1');
  eq(C.decodeState(hashOf({ v: 1, fmt: 3 })).fmt, 1, 'fmt 3 non valido: ripiego 1');
  eq(C.decodeState(hashOf({ v: 1, fmt: 2, platform: 'emery' })).fmt, 2, 'fmt 2 esplicito vince sulla platform');
  eq(C.decodeState(hashOf({ v: 1, cap_kb: 0 })).cap_kb, 900, 'cap_kb 0: default 900');
  eq(C.decodeState(hashOf({ v: 1, cap_kb: -3 })).cap_kb, 900, 'cap_kb negativo: default 900');
  eq(C.decodeState(hashOf({ v: 1, cap_kb: '200' })).cap_kb, 900, 'cap_kb stringa: default 900');
  eq(C.decodeState(hashOf({ v: 1, cap_kb: 60 })).cap_kb, 60, 'cap_kb 60 (tetto forzato dal gate)');
  eq(C.decodeState(hashOf({ v: 1, dev: 'si' })).dev, false, 'dev non booleano: false');
  eqJson(C.decodeState(hashOf({ v: 1, order: [2, 2, 15, -1, 0] })).order, [2, 0], 'order: duplicati e fuori intervallo scartati');
  eqJson(C.decodeState(hashOf({ v: 1, deleted: [11, 12] })).deleted, [11], 'deleted: 12 fuori intervallo');
  eq(C.decodeState(hashOf({ v: 1, photos: 'x' })).photos[0], null, 'photos non array: slot vuoti');
  eq(C.decodeState(hashOf({ v: 1, photos: [{ name: 5 }] })).photos[0].name, '', 'nome non stringa: vuoto');
  eq(C.decodeState(hashOf({ v: 1, photos: [{ thumb: 'http://x/y.png' }] })).photos[0].thumb, undefined,
     'miniatura non data: scartata');
  eq(C.decodeState(hashOf({ v: 1, watch: 5 })).watch, null, 'watch non oggetto: null');

  /* hash rotti: mai un'eccezione, sempre ok:false */
  var bad = ['!!!', '@@@@', 'YWJj', 'Zm9v', b64.encodeUtf8('null'), b64.encodeUtf8('[1,2]'),
             b64.encodeUtf8('{"v":1'), b64.encodeUtf8('42'), 'A'];
  var i, r;
  for (i = 0; i < bad.length; i++) {
    r = null;
    try { r = C.decodeState(bad[i]); } catch (e) { r = 'ECCEZIONE ' + errText(e); }
    check(r && r.ok === false && typeof r.error === 'string',
          'hash rotto ' + JSON.stringify(bad[i]) + ': ok false + error (' + (r && r.error) + ')');
  }
  eqJson(C.decodeState('!!!').settings, DEFAULT_SETTINGS, 'hash rotto: impostazioni di default');
  eq(C.decodeState('!!!').photos.length, 12, 'hash rotto: 12 slot vuoti');
});

section('1b. b64urlToBytes e utf8Decode', function () {
  eqJson(Array.prototype.slice.call(C.b64urlToBytes('YWJj')), [97, 98, 99], 'b64urlToBytes: "YWJj" = abc');
  eqJson(Array.prototype.slice.call(C.b64urlToBytes('')), [], 'b64urlToBytes: vuoto');
  eqJson(Array.prototype.slice.call(C.b64urlToBytes('YQ')), [97], 'b64urlToBytes: senza padding');
  eqJson(Array.prototype.slice.call(C.b64urlToBytes('YQ==')), [97], 'b64urlToBytes: padding ignorato');
  eqJson(Array.prototype.slice.call(C.b64urlToBytes('-_8')), [251, 255], 'b64urlToBytes: alfabeto url -_');
  eqJson(Array.prototype.slice.call(C.b64urlToBytes('+/8')), [251, 255], 'b64urlToBytes: alfabeto standard +/');
  var threw = false;
  try { C.b64urlToBytes('YWJ*'); } catch (e) { threw = true; }
  check(threw, 'b64urlToBytes: carattere non valido lancia');
  threw = false;
  try { C.b64urlToBytes('YWJjZ'); } catch (e) { threw = true; }
  check(threw, 'b64urlToBytes: lunghezza congrua a 1 mod 4 lancia');
  threw = false;
  try { C.b64urlToBytes(null); } catch (e) { threw = true; }
  check(threw, 'b64urlToBytes: non stringa lancia');

  /* round trip con il produttore vero (b64.js), su tutte le lunghezze mod 3 */
  var i, k, bytes, s = 12345, okrt = true;
  for (k = 0; k < 40; k++) {
    bytes = [];
    for (i = 0; i < k; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; bytes.push((s >> 7) & 255); }
    if (String(Array.prototype.slice.call(C.b64urlToBytes(b64.encode(bytes)))) !== String(bytes)) { okrt = false; }
  }
  check(okrt, 'b64urlToBytes(b64.encode(x)) = x per 0..39 byte');

  var txt = 'città 😀 日本 — «Ok»';
  eq(C.utf8Decode(C.b64urlToBytes(b64.encodeUtf8(txt))), txt, 'utf8Decode: accenti, emoji, CJK, virgolette');
  eq(C.utf8Decode(new Uint8Array([0xC3, 0xA0])), 'à', 'utf8Decode: 2 byte');
  eq(C.utf8Decode(new Uint8Array([0xE6, 0x97, 0xA5])), '日', 'utf8Decode: 3 byte');
  eq(C.utf8Decode(new Uint8Array([0xF0, 0x9F, 0x98, 0x80])), '😀', 'utf8Decode: 4 byte (coppia surrogata)');
  eq(C.utf8Decode(new Uint8Array([0xFF])), '�', 'utf8Decode: byte non valido = U+FFFD');
  var big = '', j;
  for (j = 0; j < 3000; j++) { big += 'à'; }
  eq(C.utf8Decode(C.b64urlToBytes(b64.encodeUtf8(big))).length, 3000, 'utf8Decode: oltre il blocco da 4096');
});

section('1c. normalizeSettings', function () {
  eqJson(C.normalizeSettings({}), DEFAULT_SETTINGS, 'normalizeSettings({}) = default');
  eqJson(C.normalizeSettings(null), DEFAULT_SETTINGS, 'normalizeSettings(null) = default');
  eqJson(C.normalizeSettings(undefined), DEFAULT_SETTINGS, 'normalizeSettings(undefined) = default');
  eqJson(Object.keys(C.normalizeSettings({})), SETTINGS_KEYS, 'normalizeSettings: le chiavi nell\'ordine di album.js');
  eq(C.normalizeSettings({ layout: 5 }).layout, 0, 'layout fuori intervallo: default');
  eq(C.normalizeSettings({ text_color: 4 }).text_color, 4, 'text_color 4 ammesso');
  eq(C.normalizeSettings({ text_color: 5 }).text_color, 0, 'text_color 5: default');
  eq(C.normalizeSettings({ info_row: 16 }).info_row, 15, 'info_row 16: default 15');
  eq(C.normalizeSettings({ info_row: 0 }).info_row, 0, 'info_row 0 ammesso');
  eq(C.normalizeSettings({ interval_min: 45 }).interval_min, 30, 'interval_min 45 (non in INTERVALS): 30');
  eq(C.normalizeSettings({ interval_min: 0 }).interval_min, 0, 'interval_min 0 (mai) ammesso');
  eq(C.normalizeSettings({ interval_min: 1440 }).interval_min, 1440, 'interval_min 1440 ammesso');
  eq(C.normalizeSettings({ interval_min: 1441 }).interval_min, 30, 'interval_min 1441: 30');
  eq(C.normalizeSettings({ interval_min: '60' }).interval_min, 60, 'stringa numerica convertita');
  eq(C.normalizeSettings({ shake_next: false }).shake_next, 0, 'booleano false = 0');
  eq(C.normalizeSettings({ shake_next: true }).shake_next, 1, 'booleano true = 1');
  eq(C.normalizeSettings({ font: 1.5 }).font, 0, 'non intero: default');
  eq(C.normalizeSettings({ font: '' }).font, 0, 'stringa vuota: default');
  eq(C.normalizeSettings({ font: 3, layout: 0 }).font, 3, 'LECO ammesso con layout 0');
  eq(C.normalizeSettings({ font: 3, layout: 1 }).font, 0, 'LECO con layout 1 (tutto schermo): torna ad Anton');
  eq(C.normalizeSettings({ font: 2, layout: 1 }).font, 2, 'font 2 con layout 1 resta');
  /* S8-stile (D22): i due font nuovi sono 4 e 5, il 6 non esiste */
  eq(C.normalizeSettings({ font: 4 }).font, 4, 'font 4 (nuovo) ammesso');
  eq(C.normalizeSettings({ font: 5 }).font, 5, 'font 5 (nuovo) ammesso');
  eq(C.normalizeSettings({ font: 6 }).font, 0, 'font 6: default');
  eq(C.normalizeSettings({ font: -1 }).font, 0, 'font negativo: default');
  eq(C.normalizeSettings({ font: 5, layout: 1 }).font, 5, 'font 5 con layout 1 resta (solo il 3 e\' vincolato)');
  /* S8-stile (D21): digit_style 0..3, con LECO sempre 0 */
  eq(C.normalizeSettings({}).digit_style, 0, 'digit_style: default 0 (pieno)');
  eq(C.normalizeSettings({ digit_style: 3 }).digit_style, 3, 'digit_style 3 ammesso');
  eq(C.normalizeSettings({ digit_style: 4 }).digit_style, 0, 'digit_style 4: default');
  eq(C.normalizeSettings({ digit_style: -1 }).digit_style, 0, 'digit_style negativo: default');
  eq(C.normalizeSettings({ digit_style: '2' }).digit_style, 2, 'digit_style: stringa numerica convertita');
  eq(C.normalizeSettings({ digit_style: 1.5 }).digit_style, 0, 'digit_style non intero: default');
  eq(C.normalizeSettings({ font: 3, digit_style: 2 }).digit_style, 0, 'LECO (font 3): digit_style forzato a 0');
  eq(C.normalizeSettings({ font: 3, layout: 1, digit_style: 2 }).digit_style, 2,
     'LECO con layout 1 diventa font 0: lo stile resta quello scelto');
  eq(C.normalizeSettings({ font: 4, digit_style: 2 }).digit_style, 2, 'font 4: stile conservato');
  eqJson(C.SETTINGS_FIELDS[C.SETTINGS_FIELDS.length - 2], ['digit_style', 0, 3, 0],
         'SETTINGS_FIELDS: digit_style (0..3, default 0)');
  eqJson(C.SETTINGS_FIELDS[C.SETTINGS_FIELDS.length - 1], ['lang', 0, 6, 0],
         'SETTINGS_FIELDS: lang in coda (0..6, default 0 = automatica; S10 D31 + S11 D39)');
  eqJson(C.SETTINGS_FIELDS[1], ['font', 0, 5, 0], 'SETTINGS_FIELDS: font 0..5');
  eqJson(C.SETTINGS_FIELDS.map(function (f) { return f[0]; }), SETTINGS_KEYS, 'SETTINGS_FIELDS: nomi e ordine');
  eq(C.SETTINGS_FIELDS.length, N_SETTINGS, 'SETTINGS_FIELDS: ' + N_SETTINGS + ' campi');
  eqJson(C.INTERVALS, [0, 5, 15, 30, 60, 180, 1440], 'INTERVALS');
  eq(C.MAX_SLOTS, 12, 'MAX_SLOTS 12');
  eq(C.MAX_THUMB_CHARS, 6000, 'MAX_THUMB_CHARS 6000');
  eq(C.MAX_NAME, 64, 'MAX_NAME 64');
});

/* stato di comodo: foto negli slot indicati, con nome e crc del formato chiesto */
function mkState(over) {
  var s = { v: 1, platform: 'emery', fmt: 1, cap_kb: 900, dev: true, settingsSet: true,
            settings: {}, photos: [], order: [], deleted: [], watch: null,
            i18n: DICTS, lang_auto: 'it' }, k;
  for (k = 0; k < 12; k++) { s.photos.push(null); }
  for (k in over) { if (Object.prototype.hasOwnProperty.call(over, k)) { s[k] = over[k]; } }
  return s;
}
function photo(name, fmtNum, crc, thumb) {
  var p = { id: crc, name: name, fmts: {} };
  p.fmts[fmtNum] = { len: fmtNum === 1 ? 34200 : 3024, crc: crc };
  if (thumb) { p.thumb = thumb; }
  return p;
}
function slotsOf(list) { return list.map(function (t) { return t.slot; }); }
function kindsOf(list) { return list.map(function (t) { return t.kind; }); }

section('1d. buildTiles', function () {
  var s = mkState({});
  s.photos[0] = photo('a.jpg', 1, 111, 'data:image/jpeg;base64,AA');
  s.photos[2] = photo('b.jpg', 1, 222);
  s.photos[5] = photo('c.jpg', 2, 333);        /* solo formato flint: su emery manca il formato */
  s.photos[7] = photo('gia-eliminata.jpg', 1, 444);
  s.order = [2, 0];
  s.deleted = [7];
  s.watch = { at: 1, format: 1, maxChunk: 4096, settingsCrc: 0,
              slots: [{ state: 1, crc: 111 }, null, { state: 1, crc: 999 }], foreign: [9, 7] };
  var st = C.decodeState(hashOf(s)), t = C.buildTiles(st);
  eqJson(slotsOf(t), [2, 0, 5, 9], 'buildTiles: order, poi le foto fuori order, poi le estranee');
  eqJson(kindsOf(t), ['album', 'album', 'album', 'foreign'], 'buildTiles: kind di ogni tessera');
  eq(t[1].name, 'a.jpg', 'buildTiles: nome dal manifest');
  eq(t[1].thumb, 'data:image/jpeg;base64,AA', 'buildTiles: miniatura');
  eq(t[0].thumb, null, 'buildTiles: senza miniatura = null');
  eq(t[1].hasFmt, true, 'buildTiles: slot 0 ha il formato 1');
  eq(t[1].pending, false, 'buildTiles: slot 0 con lo stesso crc sull\'orologio non e\' da inviare');
  eq(t[0].pending, true, 'buildTiles: slot 2 con crc diverso e\' da inviare');
  eq(t[2].hasFmt, false, 'buildTiles: slot 5 senza formato 1 (solo flint)');
  eq(t[2].pending, false, 'buildTiles: senza formato non e\' "da inviare"');
  eq(t[3].kind, 'foreign', 'buildTiles: slot 9 estraneo');
  eq(t[3].name, '', 'buildTiles: estranea senza nome');
  eq(t[3].hasFmt, true, 'buildTiles: estranea hasFmt true (il formato sull\'orologio non si conosce)');
  check(slotsOf(t).indexOf(7) < 0, 'buildTiles: lo slot in deleted e\' escluso (anche se estraneo)');

  var s2 = mkState({ photos: [] });
  for (var k = 0; k < 12; k++) { s2.photos.push(null); }
  s2.photos[3] = photo('x.jpg', 1, 1);
  s2.order = [3, 3, 4];                          /* duplicati e slot vuoti nell'ordine */
  var t2 = C.buildTiles(C.decodeState(hashOf(s2)));
  eqJson(slotsOf(t2), [3], 'buildTiles: order con duplicati e slot vuoti da una sola tessera');
  eq(t2[0].pending, true, 'buildTiles: senza HELLO tutto e\' "da inviare"');
  eqJson(C.buildTiles(C.decodeState('')), [], 'buildTiles: stato vuoto = nessuna tessera');
});

section('1e. freeSlot', function () {
  eq(C.freeSlot([], []), 0, 'freeSlot: album vuoto = 0');
  eq(C.freeSlot([{ slot: 0 }, { slot: 1 }], []), 2, 'freeSlot: primo libero');
  eq(C.freeSlot([{ slot: 1 }], []), 0, 'freeSlot: buco iniziale');
  eq(C.freeSlot([{ slot: 0 }, { slot: 1 }], [2]), 3, 'freeSlot: preferisce uno slot mai usato a uno appena eliminato');
  var t = [], k;
  for (k = 0; k < 11; k++) { t.push({ slot: k }); }
  eq(C.freeSlot(t, [11]), 11, 'freeSlot: se restano solo slot eliminati, usa quelli');
  t.push({ slot: 11 });
  eq(C.freeSlot(t, []), -1, 'freeSlot: album pieno = -1');
  eq(C.freeSlot(t, [3]), -1, 'freeSlot: pieno anche con deleted');
  eq(C.freeSlot([{ slot: 0 }], undefined), 1, 'freeSlot: deleted mancante');
});

section('1f. buildPayload, payloadKb, capMessage, truncateName, thumbFits', function () {
  var longName = '';
  while (longName.length < 80) { longName += 'nome-lunghissimo-'; }
  var model = {
    settings: { layout: 1, font: 3, interval_min: 45 },     /* LECO con layout 1 e intervallo strano */
    tiles: [{ slot: 4 }, { slot: 0 }, { slot: 4 }, { slot: 99 }],
    deleted: [2, 2, 30],
    added: [{ slot: 7, photo_id: 5, fmt: 1, len: 34200, crc: 9, data: 'AAAA', name: longName, thumb: 'data:image/jpeg;base64,AA' },
            { slot: 0, photo_id: 6, fmt: 1, len: 34200, crc: 10, data: 'BBBB', name: 'b.jpg', thumb: 'x' }]
  };
  var p = C.buildPayload(model);
  eqJson(Object.keys(p), ['v', 'settings', 'order', 'deleted', 'photos'], 'buildPayload: chiavi del payload');
  eq(p.v, 1, 'buildPayload: v 1');
  eq(p.settings.font, 0, 'buildPayload: impostazioni normalizzate (LECO con layout 1)');
  eq(p.settings.interval_min, 30, 'buildPayload: intervallo non ammesso -> 30');
  eq(Object.keys(p.settings).length, N_SETTINGS, 'buildPayload: ' + N_SETTINGS + ' impostazioni');
  eq(p.settings.digit_style, 0, 'buildPayload: digit_style di default nel payload');
  eqJson(p.order, [4, 0, 7], 'buildPayload: order dalle tessere (senza duplicati/slot non validi) + le nuove');
  eqJson(p.deleted, [2], 'buildPayload: deleted normalizzato');
  eq(p.photos.length, 2, 'buildPayload: solo le foto nuove');
  eqJson(Object.keys(p.photos[0]), ['slot', 'photo_id', 'fmt', 'len', 'crc', 'data', 'name', 'thumb'],
         'buildPayload: chiavi di una foto nuova');
  eq(p.photos[0].name.length, 64, 'buildPayload: nome troncato a 64');
  eq(p.photos[1].thumb, undefined, 'buildPayload: miniatura non valida omessa');
  eqJson(Object.keys(p.photos[1]), ['slot', 'photo_id', 'fmt', 'len', 'crc', 'data', 'name'],
         'buildPayload: foto senza miniatura');
  eqJson(C.buildPayload({}).order, [], 'buildPayload: modello vuoto');
  eqJson(C.buildPayload({}).photos, [], 'buildPayload: modello vuoto, nessuna foto');
  eqJson(C.buildPayload({}).deleted, [], 'buildPayload: deleted sempre presente');

  eq(C.payloadKb({ a: 'x' }), 1, 'payloadKb: arrotonda per eccesso');
  var big = { d: new Array(2049).join('x') };                 /* 2048 caratteri + involucro */
  eq(C.payloadKb(big), Math.ceil(JSON.stringify(big).length / 1024), 'payloadKb: ceil(len/1024)');

  eq(C.capMessage(10, 900, 0), null, 'capMessage: sotto il tetto = null');
  eq(C.capMessage(900, 900, 1), null, 'capMessage: uguale al tetto = null');
  eq(C.capMessage(901, 900, 0, Tit), Tit('cap_over', 901, 900),
     'capMessage: sopra il tetto senza foto nuove');
  eq(C.capMessage(93, 60, 2, Tit), Tit('cap_over_fix', Tit('cap_over', 93, 60), 1),
     'capMessage: 93 su 60 con 2 nuove = togli 1');
  eq(C.capMessage(200, 60, 3, Tit), Tit('cap_over_fix', Tit('cap_over', 200, 60), 3),
     'capMessage: 200 su 60 con 3 nuove = togli 3');
  eq(C.capMessage(61, 60, 1, Tit), Tit('cap_over_fix', Tit('cap_over', 61, 60), 1),
     'capMessage: una sola foto');
  /* S10 D35: senza T (page_core usato da solo) il ripiego e' inglese, mai una chiave */
  eq(C.capMessage(901, 900, 0), Ten('cap_over', 901, 900),
     'capMessage senza T: ripiego inglese allineato al testo en di cap_over (contratto A4 §9)');
  eq(C.capMessage(93, 60, 2), Ten('cap_over_fix', Ten('cap_over', 93, 60), 1),
     'capMessage senza T: anche il consiglio, allineato a cap_over_fix en');
  /* D35 «niente plurali»: con una foto sola il testo inglese resta grammaticale (mai «1 photos») */
  notContains(C.capMessage(93, 60, 2), '1 photos', 'capMessage senza T: nessun plurale sbagliato');
  notContains(Ten('cap_over_fix').replace('{1}', '1'), '1 photos', 'cap_over_fix in inglese: nessun plurale sbagliato');

  eq(C.truncateName('abc'), 'abc', 'truncateName: corto invariato');
  eq(C.truncateName(longName).length, 64, 'truncateName: 64 caratteri');
  eq(C.truncateName(5), '', 'truncateName: non stringa = vuoto');
  eq(C.truncateName(undefined), '', 'truncateName: undefined = vuoto');
  eq(C.thumbFits('data:image/jpeg;base64,AA'), true, 'thumbFits: data-URL corto');
  eq(C.thumbFits('data:image/png;base64,AA'), true, 'thumbFits: png va bene');
  eq(C.thumbFits('http://x/y.jpg'), false, 'thumbFits: non data-URL');
  eq(C.thumbFits('data:text/plain,ciao'), false, 'thumbFits: non immagine');
  eq(C.thumbFits(new Array(6002).join('a')), false, 'thumbFits: troppo lunga');
  eq(C.thumbFits('data:image/jpeg;base64,' + new Array(6000).join('a')), false, 'thumbFits: oltre 6000 caratteri');
  eq(C.thumbFits(null), false, 'thumbFits: null');
});

/* UX-2 / D82: la nota «L'orologio usa le sue impostazioni» si vede solo se e' VERA, cioe' se
 * l'orologio ha gia' parlato (snapshot HELLO) e il CRC delle sue impostazioni e' diverso da
 * quello di fabbrica. La costante vive in page_core.js; la sua verita' la garantisce il
 * TRIPWIRE qui sotto, che la ricalcola con il CRC vero del PKJS (album.js, lo stesso codice che
 * l'orologio confronta nella sync): se un giorno i default cambiassero, questo test lo dice. */
section('1g. D82: CRC delle impostazioni di fabbrica e settingsDiffer', function () {
  var album = require(path.join(__dirname, '..', 'src', 'pkjs', 'album.js'));
  eq(C.DEFAULTS_CRC, 0x7EE7, 'DEFAULTS_CRC = 0x7EE7 (CRC-16 del blob di fabbrica)');
  eq(C.DEFAULTS_CRC, album.settingsCrc(C.defaultSettings()),
     'tripwire: DEFAULTS_CRC = album.settingsCrc(defaultSettings()) — la costante non e\' un numero magico');
  eq(album.settingsCrc(album.defaultSettings()), C.DEFAULTS_CRC,
     'tripwire: i default di page_core e quelli del PKJS danno lo stesso CRC');
  eq(typeof C.settingsDiffer, 'function', 'settingsDiffer esportata da page_core');
  eq(C.settingsDiffer(null), false, 'settingsDiffer: nessuno snapshot -> false (orologio mai sentito)');
  eq(C.settingsDiffer(undefined), false, 'settingsDiffer: snapshot undefined -> false');
  eq(C.settingsDiffer({}), false, 'settingsDiffer: snapshot senza settingsCrc -> false');
  eq(C.settingsDiffer({ settingsCrc: null }), false, 'settingsDiffer: settingsCrc null (HELLO vecchio) -> false');
  eq(C.settingsDiffer({ settingsCrc: 'x' }), false, 'settingsDiffer: settingsCrc non numerico -> false');
  eq(C.settingsDiffer({ settingsCrc: 0x7EE7 }), false, 'settingsDiffer: CRC di fabbrica -> false');
  eq(C.settingsDiffer({ settingsCrc: 0x17EE7 }), false,
     'settingsDiffer: solo i 16 bit bassi contano (0x17EE7 & 0xFFFF = 0x7EE7)');
  eq(C.settingsDiffer({ settingsCrc: 7 }), true, 'settingsDiffer: CRC diverso -> true');
  eq(C.settingsDiffer({ settingsCrc: 0 }), true, 'settingsDiffer: CRC 0 e\' comunque diverso da 0x7EE7');
  /* e il caso vero: un orologio con una impostazione cambiata */
  var s2 = C.defaultSettings(); s2.font = 4;
  eq(C.settingsDiffer({ settingsCrc: album.settingsCrc(s2) }), true,
     'settingsDiffer: impostazioni davvero diverse (font 4) -> true');
});

/* UX-2 §4: la tabella delle chiavi e' un contratto. Qui si controlla solo l'ANAGRAFE (che cosa
 * esiste e che cosa no): i testi li guardano build_i18n.py --check (tripwire D70) e il gate sulle
 * sei colonne. Serve a non lasciare in giro chiavi morte che nessuno mostra piu'. */
section('1h. UX-2 e UX-3: chiavi uscite e chiavi nuove del dizionario (§4)', function () {
  /* UX-2 (D83/D84/D99): sei chiavi cancellate e dodici nuove. UX-3 (D116): altre OTTO escono —
   * edit_name e edit_time (nome del file e tempi dell'editor: nome proprio e numeri, D115/D114),
   * preview_off (sostituita da preview_stale, D106), msg_close_crop (con l'editor aperto il
   * footer non e' piu' spento, quindi quel testo non e' piu' raggiungibile) e i quattro err_*,
   * che finiscono solo nel title di #msg, dove sul telefono non si leggono: per D72 diventano
   * stringhe inglesi cablate in page.js — e UNDICI entrano, in coda. */
  var via2 = ['watch_emery', 'status_no_state', 'msg_no_state_save', 'opt_auto', 'preview_white', 'preview_black'];
  var via3 = ['edit_name', 'edit_time', 'preview_off', 'msg_close_crop',
              'err_no_decoder', 'err_bad_file', 'err_bad_image', 'err_bad_size'];
  var nuove2 = ['sec_look', 'sec_rotation', 'adv_btn', 'opt_info_bt', 'photos_cap_hint', 'font_prev',
                'font_next', 'opt_clock_auto', 'opt_leading_zero_auto', 'opt_color_auto',
                'opt_outline_auto', 'preview_cap_none_album'];
  var nuove3 = ['btn_loading', 'msg_del_arm', 'edit_adv_btn', 'preview_stale', 'edit_preview_cap',
                'msg_sending', 'btn_close', 'btn_cancel_armed', 'unsaved_hint', 'footer_send',
                'cap_next_help'];
  var mancanti = [], residue = [], i;
  for (i = 0; i < via2.length; i++) { if (I18N.keys.indexOf(via2[i]) >= 0) { residue.push(via2[i]); } }
  for (i = 0; i < via3.length; i++) { if (I18N.keys.indexOf(via3[i]) >= 0) { residue.push(via3[i]); } }
  for (i = 0; i < nuove2.length; i++) { if (I18N.keys.indexOf(nuove2[i]) < 0) { mancanti.push(nuove2[i]); } }
  for (i = 0; i < nuove3.length; i++) { if (I18N.keys.indexOf(nuove3[i]) < 0) { mancanti.push(nuove3[i]); } }
  eq(residue.join(','), '', 'UX-2/UX-3: le 6 + 8 chiavi cancellate non sono piu\' nel dizionario');
  eq(mancanti.join(','), '', 'UX-2/UX-3: le 12 + 11 chiavi nuove ci sono');
  /* i18n/README.md e contratto §5 A2: le chiavi nuove vanno IN CODA, nell'ordine di §4.
   * L'appartenenza da sola non lo prova (un dizionario con le nuove in testa passerebbe), e
   * l'ordine conta davvero: gli indici sono quel che finisce nell'artefatto. */
  eqJson(I18N.keys.slice(-nuove3.length), nuove3,
         'UX-3: le 11 chiavi nuove sono le ultime, nell\'ordine di §4 (D116)');
  eqJson(I18N.keys.slice(-(nuove2.length + nuove3.length), -nuove3.length), nuove2,
         'UX-3: e subito prima ci sono le 12 di UX-2, nello stesso ordine di allora');
  eq(I18N.keys.length, 135, 'UX-3: 132 - 8 + 11 = 135 chiavi (D116)');
  /* le chiavi che restano e che UX-2/UX-3 riusano: nessuna di queste puo' sparire */
  ['sec_help', 'sec_photos', 'sec_settings', 'sec_preview', 'settings_note', 'slow_lead', 'help_sync',
   'watch_flint', 'watch_unknown', 'lbl_interval', 'lbl_info_row', 'lbl_outline', 'opt_color_white',
   'opt_color_black', 'preview_cap_photo', 'preview_cap_none', 'preview_note_info', 'photos_cap',
   'photos_cap_empty', 'album_full',
   'btn_save', 'btn_cancel', 'msg_unsaved', 'btn_add_ok', 'btn_add_cancel', 'msg_added',
   'msg_added_no_thumb', 'msg_crop_cancel', 'msg_loading', 'msg_read_fail', 'msg_err',
   'crop_hint', 'btn_fit', 'lbl_gamma', 'lbl_lift', 'lbl_dither', 'dither_none', 'opt_sunlight',
   'lbl_preview', 'opt_prev_sun', 'opt_prev_nominal', 'cap_over', 'cap_over_fix', 'preview_eye',
   'preview_note_leco', 'preview_note_no_masks', 'preview_unavailable', 'tile_slot',
   'aria_tile_btn'].forEach(function (k) {
    check(I18N.keys.indexOf(k) >= 0, 'UX-2/UX-3: la chiave ' + k + ' resta in elenco');
  });
});

/* ================================ 2. DOM finto e caricamento di page.js ================= */

var VOID_TAGS = { meta: 1, link: 1, input: 1, img: 1, br: 1, hr: 1, source: 1, area: 1, base: 1,
                  col: 1, embed: 1, param: 1, track: 1, wbr: 1 };
var KEEP_PROPS = { id: 1, 'class': 1, value: 1, style: 1, checked: 1, disabled: 1, width: 1,
                   height: 1, children: 1, tagName: 1 };

function El(tag) {
  this.tagName = String(tag).toUpperCase();
  this.children = [];
  this.parentNode = null;
  this.style = {};
  this.attrs = {};
  this.className = '';
  this.id = '';
  this._text = '';
  this._value = '';
  this._sel = undefined;        /* select: undefined = mai impostato (prima option), -1 = valore ignoto */
  this._l = {};
  this.disabled = false;
  this.checked = false;
  this.width = 0;
  this.height = 0;
  this.clientWidth = 0;
  this._calls = [];             /* canvas: chiamate al contesto, in ordine */
  this._put = null;             /* canvas: ultima putImageData */
  this._ctx = null;
  this._env = null;
}
Object.defineProperty(El.prototype, 'textContent', {
  get: function () {
    if (!this.children.length) { return this._text; }
    var out = '', k;
    for (k = 0; k < this.children.length; k++) { out += this.children[k].textContent; }
    return out;
  },
  set: function (v) {
    var k;
    for (k = 0; k < this.children.length; k++) { this.children[k].parentNode = null; }
    this.children = [];
    this._text = String(v);
  }
});
El.prototype.options = function () {
  var out = [], k;
  for (k = 0; k < this.children.length; k++) { if (this.children[k].tagName === 'OPTION') { out.push(this.children[k]); } }
  return out;
};
Object.defineProperty(El.prototype, 'value', {
  get: function () {
    var o;
    if (this.tagName !== 'SELECT') { return this._value; }
    o = this.options();
    if (this._sel === undefined) { return o.length ? o[0]._value : ''; }
    return this._sel < 0 ? '' : o[this._sel]._value;
  },
  set: function (v) {
    var o, k;
    v = String(v);
    if (this.tagName !== 'SELECT') { this._value = v; return; }
    o = this.options();
    this._sel = -1;                                    /* come nel browser: valore senza <option> = "" */
    for (k = 0; k < o.length; k++) { if (o[k]._value === v) { this._sel = k; break; } }
  }
});
El.prototype.appendChild = function (c) {
  if (!(c instanceof El)) { throw new TypeError('appendChild: non e\' un nodo (' + c + ')'); }
  if (c.parentNode) { c.parentNode.removeChild(c); }
  this.children.push(c);
  c.parentNode = this;
  if (!c._env) { c._env = this._env; }
  return c;
};
El.prototype.removeChild = function (c) {
  var i = this.children.indexOf(c);
  if (i < 0) { throw new Error('removeChild: non e\' un figlio'); }
  this.children.splice(i, 1);
  c.parentNode = null;
  return c;
};
El.prototype.addEventListener = function (type, fn) { (this._l[type] = this._l[type] || []).push(fn); };
El.prototype.setAttribute = function (k, v) { this.setAttr(String(k).toLowerCase(), String(v)); };
El.prototype.getAttribute = function (k) { k = String(k).toLowerCase(); return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
/* #2: scrollIntoView esiste nel browser vero: qui registra chi l'ha chiamata, con quale
 * opzione e se l'elemento era gia' visibile. Un test la toglie o la fa lanciare. */
El.prototype.scrollIntoView = function (o) {
  if (this._env) { this._env.scrolls.push({ id: this.id, opt: o, disp: this.style.display }); }
};
El.prototype.setPointerCapture = function () { this._captured = true; };
El.prototype.releasePointerCapture = function () { this._captured = false; };
El.prototype.getBoundingClientRect = function () {
  /* UX-4 (G16 lato JS): il rect e' il BORDER box, come nel browser: #crop ha un bordo da 1 px
   * (page.css) e pos() lo toglie prima di dividere per i soli pixel disegnati. */
  return { left: 0, top: 0, width: this.width + 2, height: this.height + 2, right: this.width + 2, bottom: this.height + 2 };
};
El.prototype.setAttr = function (k, v) {
  this.attrs[k] = v;
  if (k === 'id') { this.id = v; }
  else if (k === 'class') { this.className = v; }
  else if (k === 'value') { this._value = v; }
  else if (k === 'checked') { this.checked = true; }
  else if (k === 'disabled') { this.disabled = true; }
  else if (k === 'width' || k === 'height') { this[k] = +v || 0; }
  else if (k === 'style') {
    String(v).split(';').forEach(function (d) {
      var i = d.indexOf(':');
      if (i > 0) { this.style[d.slice(0, i).trim().replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); })] = d.slice(i + 1).trim(); }
    }, this);
  } else if (!KEEP_PROPS[k]) { this[k] = v; }
};
/* contesto 2D finto: niente disegna davvero, ma tutto viene registrato e getImageData e'
 * deterministico (stesso pattern del test) */
function Ctx(cv) {
  this.canvas = cv;
  this.fillStyle = '#000';
  this.strokeStyle = '#000';
  this.lineWidth = 1;
  this.imageSmoothingEnabled = false;
  this.imageSmoothingQuality = 'low';
}
Ctx.prototype._log = function (s) { this.canvas._calls.push(s); };
Ctx.prototype.drawImage = function () { this._log('drawImage ' + Array.prototype.slice.call(arguments, 1).join(',')); };
Ctx.prototype.fillRect = function (x, y, w, h) { this._log('fillRect ' + this.fillStyle + ' ' + [x, y, w, h].join(',')); };
Ctx.prototype.strokeRect = function (x, y, w, h) { this._log('strokeRect ' + [x, y, w, h].join(',')); };
Ctx.prototype.setLineDash = function (a) { this._log('setLineDash ' + a.join(',')); };
Ctx.prototype.getImageData = function (x, y, w, h) {
  var env = this.canvas._env;
  this._log('getImageData ' + [x, y, w, h].join(','));
  if (env && env.imageDataThrow > 0) { env.imageDataThrow--; throw new Error('getImageData negato'); }
  return { data: pixels(w, h, env ? env.pixelSeed : 0), width: w, height: h };
};
Ctx.prototype.createImageData = function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; };
Ctx.prototype.putImageData = function (img) {
  this.canvas._put = { w: img.width, h: img.height, data: img.data };
  this._log('putImageData ' + img.width + 'x' + img.height);
};
El.prototype.getContext = function (type, opts) {
  if (this.tagName !== 'CANVAS') { throw new TypeError('getContext su <' + this.tagName + '> (id ' + this.id + ')'); }
  if (this._env) { this._env.ctxOpts.push({ id: this.id, type: type, read: !!(opts && opts.willReadFrequently) }); }
  if (!this._ctx) { this._ctx = new Ctx(this); }
  return this._ctx;
};
El.prototype.toDataURL = function (type, q) {
  if (this.tagName !== 'CANVAS') { throw new TypeError('toDataURL su <' + this.tagName + '>'); }
  this._env.dataUrls.push([type, q, this.width, this.height]);
  return this._env.toDataURL(type, q, this);
};

function findById(node, id) {
  var k, r;
  if (node.id === id) { return node; }
  for (k = 0; k < node.children.length; k++) { r = findById(node.children[k], id); if (r) { return r; } }
  return null;
}
function parseAttrs(s) {
  var re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, m, a = [];
  while ((m = re.exec(s)) !== null) {
    a.push([m[1].toLowerCase(), m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''))]);
  }
  return a;
}
/* parser HTML minimo ma fedele: tag, id, attributi, <option>, nodi di testo */
function parseHtml(src) {
  src = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<!doctype[^>]*>/ig, '')
           .replace(/<script\b[\s\S]*?<\/script>/ig, '')
           .replace(/<style\b[\s\S]*?<\/style>/ig, '');   /* nell'inlinato il CSS e' in pagina */
  var root = new El('body'), stack = [root], re, m, tag, e, i, at, txt;
  re = /<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) {
      if (stack.length > 1) { stack.pop(); }
    } else if (m[2]) {
      tag = m[2].toLowerCase();
      e = new El(tag);
      at = parseAttrs(m[3] || '');
      for (i = 0; i < at.length; i++) { e.setAttr(at[i][0], at[i][1]); }
      stack[stack.length - 1].appendChild(e);
      if (!VOID_TAGS[tag] && !/\/\s*$/.test(m[3] || '')) { stack.push(e); }
    } else if (m[4]) {
      txt = m[4];
      if (/\S/.test(txt)) {
        e = new El('#text');
        e._text = txt.replace(/\s+/g, ' ');
        stack[stack.length - 1].appendChild(e);
      }
    }
  }
  return root;
}
function setEnv(node, env) {
  var k;
  node._env = env;
  for (k = 0; k < node.children.length; k++) { setEnv(node.children[k], env); }
}
/* eventi: niente parte sugli elementi disabled, come nel browser */
function fire(e, type, props) {
  var ev, k, ls, i;
  if (!e) { throw new Error('fire(' + type + '): elemento inesistente'); }
  if (e.disabled) { return false; }
  ev = { type: type, target: e, defaultPrevented: false,
         preventDefault: function () { ev.defaultPrevented = true; }, stopPropagation: function () {} };
  for (k in props) { if (Object.prototype.hasOwnProperty.call(props, k)) { ev[k] = props[k]; } }
  ls = (e._l[type] || []).slice();
  for (i = 0; i < ls.length; i++) { ls[i].call(e, ev); }
  return true;
}
function rep(ch, n) { return new Array(n + 1).join(ch); }

/* pixel finti deterministici: gradienti + rumore LCG (tutti i canali usati); seed (default 0) cambia il rumore */
function pixels(w, h, seed) {
  var d = new Uint8ClampedArray(w * h * 4), i = 0, x, y, s = 1 + ((seed | 0) * 7919);
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      s = (s * 1103515245 + 12345 + x * 7 + y * 13) & 0x7fffffff;
      d[i++] = ((x * 255) / (w - 1)) | 0;
      d[i++] = ((y * 255) / (h - 1)) | 0;
      d[i++] = (((x ^ y) * 3) + ((s >> 9) & 31)) & 255;
      d[i++] = 255;
    }
  }
  return d;
}
function expectEmery(o, seed) { return P.encodeEmery(P.rgbaToRgb(pixels(200, 228, seed), 200, 228), o); }
function expectFlint(o) { return P.encodeFlint(P.rgbaToRgb(pixels(144, 168), 144, 168), o); }

/* --------------------------------------------------------------- timer, rete, location --- */

function Timers() { this.q = []; this.seq = 1; }
Timers.prototype.set = function (fn, ms) { var id = this.seq++; this.q.push({ id: id, fn: fn, ms: ms }); return id; };
Timers.prototype.clear = function (id) {
  var i;
  for (i = 0; i < this.q.length; i++) { if (this.q[i].id === id) { this.q.splice(i, 1); return; } }
};
Timers.prototype.run = function () {
  var n = 0, t;
  while (this.q.length && n < 200) { t = this.q.shift(); n++; t.fn(); }
  return n;
};

function Net() {
  this.posts = [];               /* {url, body, headers} */
  this.pending = [];
  this.seq = 6;
  this.reply = null;             /* function(body) -> {status, text} */
}
Net.prototype.xhrClass = function () {
  var net = this;
  function XHR() { this.readyState = 0; this.status = 0; this.responseText = ''; this._headers = {}; }
  XHR.prototype.open = function (m, u, a) { this._method = m; this._url = u; this._async = a; this.readyState = 1; };
  XHR.prototype.setRequestHeader = function (k, v) { this._headers[String(k).toLowerCase()] = String(v); };
  XHR.prototype.send = function (body) {
    if (this._method === 'POST') { net.posts.push({ url: this._url, body: body, headers: this._headers }); }
    net.pending.push({ xhr: this, body: body });
  };
  return XHR;
};
Net.prototype.flush = function () {
  var n = 0, p, r;
  while (this.pending.length && n < 50) {
    p = this.pending.shift(); n++;
    r = this.reply ? this.reply(p.body, p.xhr) : { status: 200, text: JSON.stringify({ ok: true, seq: ++this.seq }) };
    p.xhr.status = r.status; p.xhr.responseText = r.text; p.xhr.readyState = 4;
    if (typeof p.xhr.onreadystatechange === 'function') { p.xhr.onreadystatechange(); }
  }
  return n;
};

function Loc(hash, search, protocol) {
  this.hash = hash || '';
  this.search = search || '';
  this.protocol = protocol || 'http:';
  this.hrefs = [];
}
Object.defineProperty(Loc.prototype, 'href', {
  get: function () { return this.hrefs.length ? this.hrefs[this.hrefs.length - 1] : ''; },
  set: function (v) { this.hrefs.push(String(v)); }
});

/* --------------------------------------------------------- S12: motore dell'anteprima --- */

/* Il motore vero (src/pkjs/config/preview.js, contratto §1.2) si carica quando c'e'; in ogni caso
 * la pagina lo vede attraverso un involucro che registra le chiamate (env.previewCalls) e i
 * risultati (env.previewResults): qui si prova la PAGINA — che cosa passa al motore e che cosa fa
 * del risultato —, mentre il motore ha i suoi test in test_preview.js. Le sezioni che devono
 * decidere l'esito (colore automatico, «PM», guasto) passano opts.previewResult e il motore vero
 * non viene chiamato affatto; se invece il motore vero lancia su una chiamata della pagina
 * l'errore finisce in env.previewFails (la 6f lo dice a voce alta) e la pagina riceve il
 * risultato finto, cosi' le asserzioni sulla pagina restano leggibili. */
function fakePreview(o) {
  var sc = (o.scale | 0) || 1, W = (o.w | 0) * sc, H = (o.h | 0) * sc, notes = [];
  if (o.settings && o.settings.font === 3) { notes.push('leco'); }
  if (!o.raw) { notes.push('no_photo'); }
  if (!o.masks) { notes.push('no_masks'); }
  return { rgba: new Uint8ClampedArray(W * H * 4), width: W, height: H,
           luma: { white: true, halo: false, bad_white: 12, bad_black: 44, mean: 30, valid: !!o.raw },
           pal: { fg: [255, 255, 255], bg: [0, 0, 0], fill: [255, 255, 255], ring: null, shadow: null,
                  light: true, halo: true, name: 'white' },
           drawn: !!o.raw && notes.length === 0, rows: [], notes: notes };
}
/* maschere finte per l'hash: la pagina non le guarda dentro, le passa e basta (D45/D46) */
function fakeMasks() {
  return { v: 1, emery: { anton: { a: { strip_h: 72, digit_h: 68, ring: 2, shadow: 2, cell_w: 40,
                                        glyphs: { '1': { w: 20, bits: 'AAAA' } } } } } };
}
/* le maschere VERE, se gen_digits.py --masks-js le ha gia' scritte (agente G1) */
function realMasks() {
  var f = path.join(__dirname, '..', 'src', 'pkjs', 'digit_masks.js');
  if (!fs.existsSync(f)) { return null; }
  try { return require(f); } catch (e) { return null; }
}
function lastCall(h) { return h.env.previewCalls[h.env.previewCalls.length - 1] || null; }
/* UX-2 (U-12, D90): la nota dell'anteprima non ha piu' nessuna CODA FISSA. Sono spariti sia
 * «Colori: come sull'orologio» sia `preview_note_info` incondizionata: quel che resta e' tutto
 * condizionato (colore automatico, note del motore, e `preview_note_info` solo con la riga info
 * accesa in layout A). Con la coda e' sparita anche la vecchia expTail(). */
function pvNoteParts(h) { return String(h.txt('wfPrevNote')).split(' \u00b7 '); }
/* D102 (revisione UX-2, G01): `preview_note_info` ha un segnaposto e la pagina ci mette le SOLE
 * caselle accese di «Sotto l'ora», nell'ordine dei bit e unite da «, » (l'elenco fisso di prima
 * prometteva la data a chi l'aveva tolta e taceva la quarta casella). Qui si ricompone con le
 * stesse chiavi del gruppo, cosi' il pin resta sul dizionario (U-02) e non sul testo italiano. */
var INFO_KEYS = ['opt_info_steps', 'opt_info_battery', 'opt_info_date', 'opt_info_bt'];
function noteInfo(bits) {
  var lst = [], i;
  for (i = 0; i < INFO_KEYS.length; i++) { if (bits & (1 << i)) { lst.push(Tit(INFO_KEYS[i])); } }
  return Tit('preview_note_info', lst.join(', '));
}
/* attributo scritto dalla pagina: setAttribute (finisce in attrs) oppure proprieta' diretta
 * (el.title = ...). Le asserzioni non devono dipendere da quale delle due usa page.js. */
function attrOf(e, name) {
  if (e && e.attrs && Object.prototype.hasOwnProperty.call(e.attrs, name)) { return e.attrs[name]; }
  return e ? e[name] : undefined;
}
function eyeOf(h, slot) { return h.doc.getElementById('eye_' + slot); }
function nEye(h) {
  var n = 0, tiles = h.el('tiles').children, i, j, c;
  for (i = 0; i < tiles.length; i++) {
    c = tiles[i].children;
    for (j = 0; j < c.length; j++) { if (/\beye\b/.test(c[j].className || '')) { n++; } }
  }
  return n;
}

var DEV_RT = 'http://127.0.0.1:5555/close?';
var DEV_SEARCH = '?return_to=' + encodeURIComponent(DEV_RT);

/* opts: {state|hash, search, protocol, bitmap ('ok'|'zero'|'reject'|'throw'|'none'|'defer': le promesse
 *        restano in env.deferred finche' il test non le risolve), imgW, imgH, imgFail, toDataURL,
 *        pointer (false = niente Pointer Events), cropWidth,
 *        noCapture, noPerformance, navigator ({userAgent, platform, maxTouchPoints}: assente di default),
 *        S12: preview (false = nessun GalPreview nel contesto), previewThrow (il motore lancia sempre),
 *        previewResult (function(o, n) -> risultato finto, o che lancia: il motore vero non si chiama)} */
function loadPage(opts) {
  opts = opts || {};
  var root = parseHtml(PAGE_HTML), clock = 1000, h;
  var env = { ctxOpts: [], closed: 0, revoked: 0, objectUrls: 0, bitmapOpts: null, images: 0,
              created: [], dataUrls: [], deferred: [], pixelSeed: 0, imageDataThrow: 0, scrolls: [],
              previewCalls: [], previewResults: [], previewFails: [],
              toDataURL: opts.toDataURL || function () { return 'data:image/jpeg;base64,' + rep('A', 120); } };
  setEnv(root, env);
  var doc = {
    body: root,
    documentElement: new El('html'),          /* S10: applyLang ci scrive la lingua effettiva */
    getElementById: function (id) { return findById(root, String(id)); },
    createElement: function (tag) { var e = new El(tag); e._env = env; env.created.push(e); return e; },
    createTextNode: function (t) { var e = new El('#text'); e._text = String(t); e._env = env; return e; }
  };
  if (opts.cropWidth) { findById(root, 'cropWrap').clientWidth = opts.cropWidth; }
  var timers = new Timers(), net = new Net();
  var loc = new Loc(opts.hash !== undefined ? opts.hash : ('#' + hashOf(opts.state || {})),
                    opts.search || '', opts.protocol || 'http:');
  function Img() {
    var self = this;
    env.images++;
    this.onload = null; this.onerror = null;
    /* UX-3 (8a): `imgW: 0` deve valere ZERO, non il default — e' l'unico modo per far fallire
     * startEditor DOPO un caricamento riuscito (dimensioni nulle -> err_bad_size). Tutti gli
     * altri casi passano misure vere, quindi il ripiego a 640x480 resta quello di prima. */
    this.naturalWidth = (opts.imgW === undefined) ? 640 : opts.imgW;
    this.naturalHeight = (opts.imgH === undefined) ? 480 : opts.imgH;
    this.width = this.naturalWidth; this.height = this.naturalHeight;
    Object.defineProperty(this, 'src', {
      set: function () { if (opts.imgFail) { if (self.onerror) { self.onerror(); } } else if (self.onload) { self.onload(); } }
    });
  }
  var sb = {
    document: doc,
    location: loc,
    console: console,
    setTimeout: function (fn, ms) { return timers.set(fn, ms); },
    clearTimeout: function (id) { timers.clear(id); },
    XMLHttpRequest: net.xhrClass(),
    URL: { createObjectURL: function () { env.objectUrls++; return 'blob:finto'; },
           revokeObjectURL: function () { env.revoked++; } },
    Image: Img,
    GalI18nKeys: I18N.keys        /* S10: solo il giro «sorgenti» ne ha bisogno (chiavi per nome) */
  };
  if (!opts.noPerformance) { sb.performance = { now: function () { clock += 1; return clock; } }; }
  if (opts.navigator) { sb.navigator = opts.navigator; }
  if (opts.pointer !== false) { sb.PointerEvent = function PointerEvent() {}; }
  if (opts.bitmap !== 'none') {
    sb.createImageBitmap = function (file, o) {
      env.bitmapOpts = o;
      if (opts.bitmap === 'throw') { throw new Error('createImageBitmap non supportata'); }
      return { then: function (res, rej) {
        if (opts.bitmap === 'reject') { rej(new Error('immagine rotta')); return; }
        if (opts.bitmap === 'zero') { res({ width: 0, height: 0 }); return; }
        if (opts.bitmap === 'defer') {                     /* il test decide quando (e in che ordine) arrivano */
          env.deferred.push({ file: file, res: function (w, h) {
            var b = { width: w || opts.imgW || 640, height: h || opts.imgH || 480, closed: false,
                      close: function () { env.closed++; b.closed = true; } };
            res(b); return b;
          }, rej: function () { rej(new Error('immagine rotta')); } });
          return;
        }
        res({ width: opts.imgW || 640, height: opts.imgH || 480, close: function () { env.closed++; } });
      } };
    };
  }
  vm.createContext(sb);
  ['pipeline.js', 'page_core.js'].forEach(function (f) { vm.runInContext(SRC[f], sb, { filename: f }); });
  var realPrev = null;
  if (opts.preview !== false) {
    if (SRC['preview.js']) { vm.runInContext(SRC['preview.js'], sb, { filename: 'preview.js' }); realPrev = sb.GalPreview; }
    sb.GalPreview = { render: function (o) {
      var r;
      env.previewCalls.push(o);
      if (opts.previewThrow) { throw new Error('motore rotto'); }
      if (opts.previewResult) { r = opts.previewResult(o, env.previewCalls.length); }
      else if (realPrev) {
        try { r = realPrev.render(o); } catch (e) { env.previewFails.push(errText(e)); r = fakePreview(o); }
      } else { r = fakePreview(o); }
      env.previewResults.push(r);
      return r;
    } };
  }
  vm.runInContext(SRC['page.js'], sb, { filename: 'page.js' });

  h = { sb: sb, doc: doc, root: root, env: env, net: net, timers: timers, loc: loc, navs: [], G: sb.GalPage };
  h.el = function (id) {
    var e = doc.getElementById(id);
    if (!e) { throw new Error('DOM finto: nessun elemento con id "' + id + '"'); }
    return e;
  };
  h.txt = function (id) { return h.el(id).textContent; };
  h.disp = function (id) { return h.el(id).style.display; };
  h.click = function (id) { return fire(h.el(id), 'click'); };
  h.select = function (id, v) { var e = h.el(id); e.value = v; return fire(e, 'change'); };
  h.range = function (id, v) { var e = h.el(id); e.value = String(v); return fire(e, 'input'); };
  h.checkbox = function (id, v) { var e = h.el(id); e.checked = !!v; return fire(e, 'change'); };
  h.chooseFile = function (name) {
    var e = h.el('file');
    e.files = [{ name: name }];
    return fire(e, 'change');
  };
  h.tileIds = function () {
    return h.el('tiles').children.map(function (c) { return c.id; });
  };
  h.kbNum = function () { var m = Trx('kb_line', '(\\d+)', '\\d+').exec(h.txt('kb')); return m ? +m[1] : -1; };
  if (!opts.noCapture) { h.G.setNavigate(function (u) { h.navs.push(u); }); }
  return h;
}

/* UX-3 (D117): quando la PROSSIMA foto sforerebbe il tetto la pagina spegne anche #file, quindi
 * un test che vuole arrivare al tetto non puo' passare dall'input (fire() non parte sui disabled).
 * GalPage.addFile e' la stessa porta che usano il gate e l'emulatore: salta #file e apre l'editor
 * lo stesso, cosi' i casi «sopra il tetto» restano provabili. */
function pickFile(h, name) { return h.G.addFile({ name: name }); }

/* stato di prova per emery: 3 foto (una senza il formato giusto), una estranea, una eliminata */
function stateEmery(over) {
  var s = mkState({}), k;
  s.settings = { layout: 0, font: 2, clock_mode: 1, leading_zero: 2, text_color: 3, outline: 1,
                 interval_min: 60, order: 1, shake_next: 0, info_row: 5 };
  s.photos[0] = photo('città.jpg', 1, 111, 'data:image/jpeg;base64,AAAB');
  s.photos[3] = photo('mare.jpg', 2, 222);          /* solo raw1: su emery manca il formato */
  s.photos[5] = photo('sole.jpg', 1, 333);
  s.photos[7] = photo('via.jpg', 1, 444);
  s.order = [3, 0];
  s.deleted = [7];
  s.watch = { at: 100, format: 1, maxChunk: 4096, settingsCrc: 7, slots: [], foreign: [9] };
  for (k = 0; k < 12; k++) { s.watch.slots.push({ state: 0, crc: 0 }); }
  s.watch.slots[0] = { state: 1, crc: 111 };
  s.watch.slots[5] = { state: 1, crc: 999 };
  for (k in over) { if (Object.prototype.hasOwnProperty.call(over, k)) { s[k] = over[k]; } }
  return s;
}

section('2a. page.html: id, tag e vincoli del markup', function () {
  var root = parseHtml(PAGE_HTML), get = function (id) { return findById(root, id); };
  /* UX-2: via #fontPreview (D95), dentro i nodi nuovi di §3 del contratto */
  var ids = ['head', 'watch', 'kb', 'status', 'photos', 'photosCap', 'tiles', 'add', 'file', 'addHelp',
             'photosHint', 'editor',
             'editName', 'cropWrap', 'crop', 'zoomRow', 'zoom', 'fit', 'gamma', 'gammaVal', 'lift', 'liftVal',
             'dither', 'sunlight', 'sunlightRow', 'previewMode', 'previewModeRow', 'preview', 'etime',
             'editPrevCap', 'addRow', 'editAdvBtn', 'editAdvBody',
             'addOk', 'addCancel', 'settings', 'settingsNote', 's_layout', 'fontRow', 'fontPrev', 's_font', 'fontNext',
             's_clock_mode', 's_leading_zero', 's_interval_min', 's_order', 's_shake_next',
             's_text_color', 's_outline', 's_digit_style', 's_style_hint', 'styleFlintHelp', 's_info_row',
             's_info_row_b0', 's_info_row_b1', 's_info_row_b2', 's_info_row_b3',
             'slow', 'slowLead', 'slowHelpBtn', 'slowFix',
             'wfPrev', 'wfPreview', 'wfPrevCap', 'wfPrevNote',
             'misc', 'advBtn', 'advBody', 'infoRow', 'infoRowLbl',
             'help', 'helpBtn', 'helpBody', 'helpWhy', 'helpFix',
             'footer', 'save', 'cancel', 'msg', 'hint'], i;
  /* ordine nel documento: una lista piatta nell'ordine di visita, per confrontare posizioni
   * senza dipendere dal testo dell'HTML (nell'artefatto i data-i18n sono indici). */
  function flat(node, out) {
    var k;
    for (k = 0; k < node.children.length; k++) { out.push(node.children[k]); flat(node.children[k], out); }
    return out;
  }
  var DOC = flat(root, []);
  function inOrder(list, what) {
    var k, a, b, bad = [];
    for (k = 0; k + 1 < list.length; k++) {
      a = list[k][1] ? DOC.indexOf(list[k][1]) : -1;
      b = list[k + 1][1] ? DOC.indexOf(list[k + 1][1]) : -1;
      if (!(a >= 0 && b >= 0 && a < b)) { bad.push(list[k][0] + ' < ' + list[k + 1][0]); }
    }
    eq(bad.join(' | '), '', what);
  }
  function tagsIn(node, tag) {
    var out = [], all = flat(node, []), k;
    for (k = 0; k < all.length; k++) { if (all[k].tagName === tag) { out.push(all[k]); } }
    return out;
  }
  function childCls(node, cls) {
    var k, c = node.children;
    for (k = 0; k < c.length; k++) { if (new RegExp('\\b' + cls + '\\b').test(c[k].className || '')) { return c[k]; } }
    return null;
  }
  for (i = 0; i < ids.length; i++) { check(get(ids[i]) !== null, 'markup: esiste #' + ids[i]); }
  eq(get('crop').tagName, 'CANVAS', 'markup: #crop e\' un canvas');
  eq(get('preview').tagName, 'CANVAS', 'markup: #preview e\' un canvas');
  eq(get('file').tagName, 'INPUT', 'markup: #file e\' un input');
  eq(get('file').type, 'file', 'markup: #file di tipo file');
  eq(get('file').accept, 'image/*', 'markup: #file accetta image/*');
  eq(get('file').attrs.capture, undefined, 'markup: #file SENZA capture (si sceglie dalla libreria foto)');
  eq(get('add').tagName, 'LABEL', 'markup: #add e\' una label');
  eq(get('add').attrs['for'], 'file', 'markup: la label #add apre #file');
  eq(get('save').tagName, 'BUTTON', 'markup: #save e\' un button');
  eq(get('save').type, 'button', 'markup: #save type=button (niente submit)');
  eq(get('cancel').type, 'button', 'markup: #cancel type=button');
  eq(get('addOk').type, 'button', 'markup: #addOk type=button');
  eq(get('fit').type, 'button', 'markup: #fit type=button');
  eq(get('s_font').tagName, 'SELECT', 'markup: #s_font e\' una select');
  eq(get('s_font').children.length, 0, 'markup: #s_font vuota (la riempie page.js)');
  /* UX-2 D49/D89 (revisione di D36): la Lingua lascia la prima riga e diventa l'ultima riga
   * VISIBILE di #settings, dentro il contenitore #misc, dopo l'anteprima e prima del pulsante
   * «Altre impostazioni». */
  eq(get('s_lang').tagName, 'SELECT', 'markup: #s_lang e\' una select');
  eq(get('s_lang').children.length, 0, 'markup: #s_lang vuota (la riempie page.js)');
  check(findById(get('misc'), 's_lang') !== null, 'markup: la Lingua sta dentro #misc');
  check(findById(get('settings'), 'misc') !== null, 'markup: #misc sta dentro le impostazioni');
  inOrder([['#wfPrev', get('wfPrev')], ['#misc', get('misc')], ['#s_lang', get('s_lang')],
           ['#advBtn', get('advBtn')], ['#advBody', get('advBody')]],
          'markup: Lingua dopo #wfPrev dentro #misc, prima di «Altre impostazioni» (D49)');
  check(DOC.indexOf(get('s_lang')) > DOC.indexOf(get('s_layout')),
        'markup: la Lingua non e\' piu\' la prima riga delle impostazioni');
  /* S8-stile: la riga "Stile cifre" sta subito dopo la riga Font */
  eq(get('s_digit_style').tagName, 'SELECT', 'markup: #s_digit_style e\' una select');
  eq(get('s_digit_style').children.length, 0, 'markup: #s_digit_style vuota (la riempie page.js)');
  check(PAGE_HTML.indexOf('id="s_digit_style"') > PAGE_HTML.indexOf('id="s_font"'),
        'markup: Stile cifre dopo Font');
  check(DOC.indexOf(get('s_digit_style')) < DOC.indexOf(get('s_text_color')),
        'markup: Stile cifre prima di «Colore dell\'ora» (U-08: Formato ora e\' sceso in #advBody)');
  check(/<label for="s_digit_style" class="rlab" data-i18n="[^"]+"><\/label>/.test(PAGE_HTML),
        'markup: etichetta "Stile cifre" con for, classe rlab e chiave (S10: testo vuoto)');
  /* S9 P5: l'aiuto sui font per lo stile trasparente, subito sotto la select e nascosto all'avvio */
  eq(get('s_style_hint').style.display, 'none', 'markup: aiuto dello stile nascosto all\'inizio');
  eq(get('s_style_hint').className, 'help', 'markup: l\'aiuto dello stile ha la classe help');
  /* S9 R13: l'avviso per flint sta nello stesso punto ed e' nascosto all'avvio come l'aiuto di P5 */
  eq(get('styleFlintHelp').style.display, 'none', 'markup: avviso flint nascosto all\'inizio');
  check(PAGE_HTML.indexOf('id="s_style_hint"') > PAGE_HTML.indexOf('id="s_digit_style"'),
        'markup: l\'aiuto sta sotto la select Stile cifre');
  check(DOC.indexOf(get('s_style_hint')) < DOC.indexOf(get('s_text_color')),
        'markup: l\'aiuto sta prima di «Colore dell\'ora»');
  /* S12 D46: l'anteprima della watchface sta dentro #settings, subito sotto «Stile cifre»
   * (dopo l'avviso flint) e prima di «Formato ora». */
  eq(get('wfPreview').tagName, 'CANVAS', 'markup: #wfPreview e\' un canvas');
  eq(get('wfPrevCap').className, 'help', 'markup: la didascalia dell\'anteprima ha la classe help');
  eq(get('wfPrevNote').className, 'help', 'markup: la nota dell\'anteprima ha la classe help');
  eq(get('wfPrevCap').textContent, '', 'markup: didascalia vuota (la scrive la pagina)');
  eq(get('wfPrevNote').textContent, '', 'markup: nota vuota (la scrive la pagina)');
  check(DOC.indexOf(get('wfPrev')) > DOC.indexOf(get('s_text_color')),
        'markup: l\'anteprima sta sotto «Colore dell\'ora» (U-08: ultima riga di «Aspetto dell\'ora»)');
  check(DOC.indexOf(get('wfPrev')) < DOC.indexOf(get('misc')),
        'markup: l\'anteprima sta prima del blocco Lingua/«Altre impostazioni»');
  check(PAGE_HTML.indexOf('id="wfPrev"') < PAGE_HTML.indexOf('<section id="help">'),
        'markup: l\'anteprima e\' dentro le impostazioni');
  check(/<h3 data-i18n="[^"]+"><\/h3>/.test(PAGE_HTML), 'markup: titolo dell\'anteprima con chiave e testo vuoto');
  eq(get('dither').children.length, 0, 'markup: #dither vuota (dipende dal formato)');
  eq(get('previewMode').options().length, 2, 'markup: #previewMode con 2 opzioni');
  eqJson(get('previewMode').options().map(function (o) { return o._value; }), ['sun', 'nominal'],
         'markup: opzioni sun/nominal');
  /* UX-3 rev (G20): la riga dello Zoom ha un id proprio perche' il foglio le tolga i 9,5em di
   * «.row > .rlab»: senza, «Riparti da capo» cadeva da solo sulla riga sotto (92 px invece di 40). */
  check(findById(get('zoomRow'), 'zoom') !== null, 'markup: #zoom sta dentro #zoomRow (G20)');
  check(findById(get('zoomRow'), 'fit') !== null, 'markup: anche «Riparti da capo» sta in #zoomRow (G20)');
  eq(get('zoomRow').className, 'row', 'markup: #zoomRow e\' una .row come le altre');
  eq(get('zoom').attrs.min, '1', 'markup: zoom da 1');
  eq(get('zoom').attrs.max, '4', 'markup: zoom fino a 4');
  eq(get('gamma').attrs.min, '0.5', 'markup: gamma da 0,50');
  eq(get('gamma').attrs.max, '2', 'markup: gamma fino a 2,00');
  eq(get('gamma').attrs.step, '0.05', 'markup: passo gamma 0,05');
  eq(get('gamma').attrs.value, '1', 'markup: gamma parte da 1,00');
  eq(get('lift').attrs.max, '0.3', 'markup: lift fino a 0,30');
  eq(get('lift').attrs.step, '0.01', 'markup: passo lift 0,01');
  eq(get('lift').attrs.value, '0', 'markup: lift parte da 0');
  eq(get('sunlight').type, 'checkbox', 'markup: #sunlight checkbox');
  eq(get('s_info_row').type, 'hidden', 'markup: #s_info_row nascosto (lo compongono le 4 caselle)');
  eq(get('editor').style.display, 'none', 'markup: editor nascosto all\'inizio');
  eq(get('status').style.display, 'none', 'markup: avviso di stato nascosto');
  eq(get('settingsNote').style.display, 'none', 'markup: nota impostazioni nascosta');
  /* v1.9: avviso di avvio lento e sezione Aiuto */
  eq(get('slow').style.display, 'none', 'markup: avviso di avvio lento nascosto');
  eq(get('slow').className, 'warn', 'markup: #slow ha la classe warn');
  eq(get('helpBody').style.display, 'none', 'markup: corpo dell\'Aiuto ripiegato');
  eq(get('help').style.display, undefined, 'markup: la sezione Aiuto e\' sempre visibile');
  eq(get('helpBtn').tagName, 'BUTTON', 'markup: #helpBtn e\' un button');
  eq(get('helpBtn').type, 'button', 'markup: #helpBtn type=button');
  eq(get('helpBtn').attrs['aria-expanded'], 'false', 'markup: #helpBtn aria-expanded=false');
  eq(get('helpBtn').attrs['aria-controls'], 'helpBody', 'markup: #helpBtn aria-controls=helpBody');
  eq(get('helpBtn').textContent, '', 'markup: titolo dell\'Aiuto vuoto (lo scrive applyLang)');
  check(!!get('helpBtn').attrs['data-i18n'], 'markup: #helpBtn ha la chiave data-i18n');
  /* UX-1 (U-15): la riga sulla sincronizzazione e' il PRIMO paragrafo dell'Aiuto, subito dopo
   * l'h2 e FUORI dal corpo ripiegabile: si legge senza aprire niente. Il paragrafo non ha id
   * (nel markup e' un nodo vuoto con la sola chiave), quindi si guardano posizione e chiave. */
  eq(get('help').children[0].tagName, 'H2', 'markup: #help comincia con il titolo di sezione');
  eq(get('help').children[1].tagName, 'P', 'markup: subito dopo l\'h2 c\'e\' un paragrafo');
  eq(get('help').children[1].className, 'help', 'markup: il paragrafo ha la classe help');
  eq(get('help').children[1].attrs['data-i18n'], K('help_sync'),
     'markup: il primo paragrafo dell\'Aiuto porta la chiave help_sync');
  eq(get('help').children[1].textContent, '', 'markup: help_sync vuoto nel markup (lo scrive applyLang)');
  check(PAGE_HTML.indexOf('<section id="help">') > PAGE_HTML.indexOf('<section id="settings">'),
        'markup: la sezione Aiuto sta in fondo (dopo le impostazioni)');
  check(PAGE_HTML.indexOf('id="slow"') < PAGE_HTML.indexOf('<section id="photos">'),
        'markup: l\'avviso #slow sta in cima (prima delle foto)');
  /* S10 D35: <html lang> vuoto nel markup, scritto a runtime con la lingua effettiva */
  check(/<html lang="">/.test(PAGE_HTML), 'markup: <html lang=""> (lo riempie applyLang)');
  check(!/lang="it"/.test(PAGE_HTML), 'markup: nessuna lingua fissa nel markup');
  check(/<meta name="viewport"/.test(PAGE_HTML), 'markup: meta viewport');
  check(/charset="utf-8"/.test(PAGE_HTML), 'markup: charset utf-8');
  notContains(PAGE_HTML, 'http://', 'markup: nessuna risorsa http://');
  notContains(PAGE_HTML, 'https://', 'markup: nessuna risorsa https://');
  if (V.inlined) {                                  /* nell'artefatto spedito non resta nessun riferimento */
    notContains(PAGE_HTML, '<script src=', 'markup: nell\'inlinato nessuno <script src=');
    notContains(PAGE_HTML, '<link rel=', 'markup: nell\'inlinato nessun <link>');
    contains(PAGE_HTML, '<style>', 'markup: nell\'inlinato il CSS sta in <style>');
  } else {
    var srcs = (PAGE_HTML.match(/<script src="([^"]+)"/g) || []).join('|');
    eq(srcs, '<script src="pipeline.js"|<script src="page_core.js"|' +
             '<script src="preview.js"|<script src="page.js"',
       'markup: ordine degli script pipeline, page_core, preview, page (D95: previews.js via)');
    notContains(PAGE_HTML, 'previews.js', 'markup: nessun riferimento a previews.js (D95)');
    contains(PAGE_HTML, '<link rel="stylesheet" href="page.css">', 'markup: un solo foglio di stile locale');
  }

  /* ============ UX-3: editor, footer e ruoli ARIA (contratto §3, D104–D121) ============ */
  /* D104: l'ordine dentro #editor e' un contratto — nome del file, cornice, zoom, anteprima,
   * didascalia, la coppia nascosta, poi il pulsante delle regolazioni e il blocco che apre. */
  eq(get('editPrevCap').className, 'help', 'markup: la didascalia dell\'editor e\' una riga di aiuto');
  eq(get('editPrevCap').textContent, '', 'markup: didascalia dell\'editor vuota (la scrive la pagina)');
  inOrder([['#editName', get('editName')], ['#cropWrap', get('cropWrap')], ['#zoom', get('zoom')],
           ['#fit', get('fit')], ['#preview', get('preview')], ['#editPrevCap', get('editPrevCap')],
           ['#addRow', get('addRow')], ['#editAdvBtn', get('editAdvBtn')],
           ['#editAdvBody', get('editAdvBody')]],
          'markup: ordine dentro #editor (D104)');
  inOrder([['#gamma', get('gamma')], ['#lift', get('lift')], ['#dither', get('dither')],
           ['#sunlightRow', get('sunlightRow')], ['#previewModeRow', get('previewModeRow')],
           ['#etime', get('etime')]],
          'markup: ordine dentro «Regolazioni della foto» (D104)');
  ['gamma', 'lift', 'dither', 'sunlightRow', 'previewModeRow', 'etime'].forEach(function (id) {
    check(findById(get('editAdvBody'), id) !== null, 'markup: #' + id + ' sta dentro #editAdvBody (D114)');
  });
  /* D119: la coppia inline resta nel markup, con i suoi id e le sue chiavi, ma nascosta: a
   * comandare e' il footer fisso, e i test possono continuare a premerla. */
  eq(get('addRow').style.display, 'none', 'markup: #addRow nascosto nel markup (D119)');
  check(findById(get('addRow'), 'addOk') !== null, 'markup: #addOk sta dentro #addRow');
  check(findById(get('addRow'), 'addCancel') !== null, 'markup: #addCancel sta dentro #addRow');
  eq(get('addOk').attrs['data-i18n'], K('btn_add_ok'), 'markup: #addOk tiene la sua chiave');
  eq(get('addCancel').attrs['data-i18n'], K('btn_add_cancel'), 'markup: #addCancel tiene la sua chiave');
  /* D114: «Regolazioni della foto», stesso meccanismo di «Altre impostazioni» */
  eq(get('editAdvBody').style.display, 'none', 'markup: «Regolazioni della foto» ripiegate nel markup');
  eq(get('editAdvBtn').tagName, 'BUTTON', 'markup: #editAdvBtn e\' un button');
  eq(get('editAdvBtn').type, 'button', 'markup: #editAdvBtn type=button');
  eq(get('editAdvBtn').className, 'btn small', 'markup: #editAdvBtn e\' un pulsantino (.btn.small)');
  eq(get('editAdvBtn').attrs['aria-expanded'], 'false', 'markup: #editAdvBtn aria-expanded=false');
  eq(get('editAdvBtn').attrs['aria-controls'], 'editAdvBody', 'markup: #editAdvBtn aria-controls=editAdvBody');
  eq(get('editAdvBtn').children[0].attrs['data-i18n'], K('edit_adv_btn'),
     'markup: il testo di #editAdvBtn viene da edit_adv_btn');
  eq(childCls(get('editAdvBtn'), 'arrow') && childCls(get('editAdvBtn'), 'arrow').textContent, '▾',
     'markup: #editAdvBtn ha la freccia ▾ (chiusa)');
  eq(childCls(get('editAdvBtn'), 'arrow').attrs['aria-hidden'], 'true',
     'markup: anche qui la freccia e\' decorativa (aria-hidden)');
  eq(get('etime').style.display, 'none', 'markup: #etime nasce nascosto (D114: si vede solo in dev)');
  /* D115: nell'editor si legge il NOME del file; i pixel vanno nel title, edit_name e\' uscita */
  eq(get('editName').className, 'help', 'markup: #editName e\' una riga di aiuto');
  eq(get('editName').textContent, '', 'markup: #editName vuoto (lo scrive startEditor)');
  check(!get('editName').attrs['data-i18n'], 'markup: #editName senza chiave (edit_name e\' uscita, D116)');
  /* D107: le etichette del footer le scrive footerLabels, non walkI18n */
  check(!get('save').attrs['data-i18n'], 'markup: #save senza data-i18n (lo scrive footerLabels, D107)');
  check(!get('cancel').attrs['data-i18n'], 'markup: #cancel senza data-i18n (D107)');
  eq(get('save').textContent, '', 'markup: #save vuoto nel markup');
  eq(get('cancel').textContent, '', 'markup: #cancel vuoto nel markup');
  /* D121: la riga di aiuto del footer, subito dopo il messaggio */
  eq(get('hint').tagName, 'P', 'markup: #hint e\' un paragrafo');
  eq(get('hint').className, 'help', 'markup: #hint e\' una riga grigia (classe help)');
  eq(get('hint').style.display, 'none', 'markup: #hint nasce nascosto');
  eq(get('hint').textContent, '', 'markup: #hint vuoto nel markup (lo scrive updateKb)');
  check(findById(get('footer'), 'hint') !== null, 'markup: #hint sta dentro il footer');
  inOrder([['#save', get('save')], ['#cancel', get('cancel')], ['#msg', get('msg')], ['#hint', get('hint')]],
          'markup: ordine nel footer — Salva, Esci, messaggio, aiuto (D121)');
  /* D120: i ruoli ARIA. #msg e' cortese (non interrompe la lettura), #status interrompe. */
  eq(get('msg').attrs.role, 'status', 'markup: #msg role=status (D120)');
  eq(get('msg').attrs['aria-live'], 'polite', 'markup: #msg aria-live=polite (D120)');
  eq(get('status').attrs.role, 'alert', 'markup: #status role=alert (D120)');
  eq(get('slow').attrs.role, 'status', 'markup: #slow role=status (D120)');
  eq(get('hint').attrs.role, undefined, 'markup: #hint senza ruolo, e\' una riga statica (D120)');

  /* ================= UX-2: struttura nuova (contratto §3, D80–D99) ================= */
  /* «Le tue foto» (D80): Aggiungi in cima (input PRIMA della label, cosi' #file:focus + #add
   * disegna il contorno), contatore, tessere, riga sull'ordine, poi «Cambio foto» (D51). */
  var photos = get('photos'), settings = get('settings'), h3p = tagsIn(photos, 'H3'), h3s = tagsIn(settings, 'H3');
  var h2s = tagsIn(settings, 'H2');
  eq(h3p.length, 1, 'markup: un solo h3 in «Le tue foto» (D51: «Cambio foto»)');
  eq(h3p[0].attrs['data-i18n'], K('sec_rotation'), 'markup: l\'h3 di «Le tue foto» porta la chiave sec_rotation');
  eq(h3p[0].textContent, '', 'markup: h3 vuoto (lo scrive applyLang)');
  inOrder([['#file', get('file')], ['#add', get('add')], ['#addHelp', get('addHelp')],
           ['#photosCap', get('photosCap')], ['#tiles', get('tiles')], ['#photosHint', get('photosHint')],
           ['h3 sec_rotation', h3p[0]], ['#s_interval_min', get('s_interval_min')],
           ['#s_order', get('s_order')], ['#s_shake_next', get('s_shake_next')]],
          'markup: ordine di «Le tue foto» (D80)');
  ['photosHint', 's_interval_min', 's_order', 's_shake_next'].forEach(function (id) {
    check(findById(photos, id) !== null, 'markup: #' + id + ' sta dentro «Le tue foto» (D51/D80)');
    check(findById(settings, id) === null, 'markup: #' + id + ' non sta piu\' nelle impostazioni');
  });
  eq(get('photosHint').className, 'help', 'markup: #photosHint e\' una riga di aiuto');
  eq(get('photosHint').style.display, 'none', 'markup: #photosHint nascosto all\'avvio');
  eq(get('photosHint').attrs['data-i18n'], K('photos_cap_hint'), 'markup: #photosHint porta la chiave photos_cap_hint');
  eq(get('photosHint').textContent, '', 'markup: #photosHint vuoto nel markup');
  eq(get('add').className, 'btn primary', 'markup: «Aggiungi foto» parte blu (U-04: .btn.primary)');

  /* Impostazioni (D80/D88/D89): «Aspetto dell\'ora», poi l\'anteprima, poi #misc con Lingua e
   * «Altre impostazioni» ripiegate. */
  eq(h3s.length, 2, 'markup: due h3 nelle impostazioni («Aspetto dell\'ora» e «Anteprima»)');
  eq(h3s[0].attrs['data-i18n'], K('sec_look'), 'markup: il primo h3 e\' «Aspetto dell\'ora» (sec_look)');
  eq(h3s[1].attrs['data-i18n'], K('sec_preview'), 'markup: il secondo h3 e\' quello dell\'anteprima');
  check(findById(get('wfPrev'), 'wfPreview') !== null, 'markup: l\'h3 dell\'anteprima sta dentro #wfPrev');
  eq(h2s.length, 1, 'markup: un solo h2 nelle impostazioni');
  eq(h2s[0].attrs['data-i18n'], K('sec_settings'), 'markup: l\'h2 delle impostazioni porta la chiave sec_settings');
  /* D82: la nota sta in cima a #settings ma SOTTO il titolo di sezione (non nell'header) */
  inOrder([['h2 sec_settings', h2s[0]], ['#settingsNote', get('settingsNote')],
           ['h3 sec_look', h3s[0]], ['#s_layout', get('s_layout')],
           ['#fontPrev', get('fontPrev')], ['#s_font', get('s_font')], ['#fontNext', get('fontNext')],
           ['#s_digit_style', get('s_digit_style')], ['#s_style_hint', get('s_style_hint')],
           ['#styleFlintHelp', get('styleFlintHelp')], ['#s_text_color', get('s_text_color')],
           ['#wfPrev', get('wfPrev')], ['#misc', get('misc')]],
          'markup: ordine delle impostazioni (D80)');
  inOrder([['#s_clock_mode', get('s_clock_mode')], ['#s_leading_zero', get('s_leading_zero')],
           ['#s_outline', get('s_outline')], ['#infoRow', get('infoRow')]],
          'markup: ordine dentro «Altre impostazioni» (D88)');
  ['s_clock_mode', 's_leading_zero', 's_outline', 'infoRow', 's_info_row', 's_info_row_b3'].forEach(function (id) {
    check(findById(get('advBody'), id) !== null, 'markup: #' + id + ' sta dentro #advBody (D88)');
  });
  /* G11: l'ordine nel documento NON implica il contenimento — spostando «Altre impostazioni»
   * subito DOPO la </div> di #misc gli indici resterebbero crescenti, ma il riquadro col filetto
   * (D89) perderebbe il pulsante e la catena inMisc di §4e descriverebbe un markup che non c'e'. */
  ['advBtn', 'advBody'].forEach(function (id) {
    check(findById(get('misc'), id) !== null, 'markup: #' + id + ' sta dentro #misc (D88/D89: stesso riquadro della Lingua)');
  });
  eq(get('advBody').style.display, 'none', 'markup: «Altre impostazioni» ripiegate nel markup');
  eq(get('advBtn').tagName, 'BUTTON', 'markup: #advBtn e\' un button');
  eq(get('advBtn').type, 'button', 'markup: #advBtn type=button');
  eq(get('advBtn').className, 'btn small', 'markup: #advBtn e\' un pulsantino (.btn.small)');
  eq(get('advBtn').attrs['aria-expanded'], 'false', 'markup: #advBtn aria-expanded=false');
  eq(get('advBtn').attrs['aria-controls'], 'advBody', 'markup: #advBtn aria-controls=advBody');
  eq(get('advBtn').children[0].attrs['data-i18n'], K('adv_btn'), 'markup: il testo di #advBtn viene da adv_btn');
  eq(childCls(get('advBtn'), 'arrow') && childCls(get('advBtn'), 'arrow').textContent, '\u25be',
     'markup: #advBtn ha la freccia ▾ (chiusa)');
  eq(childCls(get('advBtn'), 'arrow').attrs['aria-hidden'], 'true', 'markup: la freccia e\' decorativa (aria-hidden)');

  /* Frecce del font (D87): stessa riga di #s_font, nell\'ordine label, prev, select, next */
  ['fontPrev', 'fontNext'].forEach(function (id) {
    eq(get(id).tagName, 'BUTTON', 'markup: #' + id + ' e\' un button');
    eq(get(id).type, 'button', 'markup: #' + id + ' type=button');
    eq(get(id).className, 'btn small', 'markup: #' + id + ' e\' un pulsantino (.btn.small)');
    eq(findById(get('fontRow'), id), get(id), 'markup: #' + id + ' sta nella riga del Font');
  });
  eq(get('fontPrev').textContent, '\u2039', 'markup: freccia indietro ‹ (U+2039 letterale)');
  eq(get('fontNext').textContent, '\u203a', 'markup: freccia avanti › (U+203A letterale)');

  /* Intestazione (D91/D83/D82/D81) */
  eq(get('kb').className, 'help', 'markup: #kb e\' una riga grigia (D91)');
  eq(get('kb').style.display, 'none', 'markup: #kb nascosto all\'avvio');
  eq(get('status').className, 'warn err', 'markup: #status ha le classi warn err (D83)');
  eq(get('settingsNote').className, 'help', 'markup: #settingsNote e\' una riga grigia (D82)');
  eq(get('settingsNote').attrs['data-i18n'], K('settings_note'), 'markup: #settingsNote porta la chiave settings_note');
  check(findById(settings, 'settingsNote') !== null, 'markup: la nota sta in cima a #settings, non nell\'header (D82)');
  eq(get('slowHelpBtn').tagName, 'BUTTON', 'markup: #slowHelpBtn e\' un button (D81)');
  eq(get('slowHelpBtn').type, 'button', 'markup: #slowHelpBtn type=button');
  eq(get('slowHelpBtn').className, 'btn small', 'markup: #slowHelpBtn e\' un pulsantino');
  eq(get('slowHelpBtn').attrs['data-i18n'], K('sec_help'), 'markup: il pulsantino riusa la chiave sec_help (nessuna chiave nuova)');
  check(findById(get('slow'), 'slowHelpBtn') !== null, 'markup: il pulsantino sta dentro l\'avviso #slow');
  eq(get('slowFix').textContent, '', 'markup: #slowFix vuoto (la procedura sta solo nell\'Aiuto, D81)');

  /* U-16: accessibilita\' e reti a costo zero */
  check(/<meta name="color-scheme" content="only light">/.test(PAGE_HTML),
        'markup: <meta name="color-scheme" content="only light"> (U-16: opt-out dal Force Dark)');
  var opts4 = get('s_info_row_b0').parentNode.parentNode;
  eq(opts4.attrs.role, 'group', 'markup: le 4 caselle sono un gruppo (role=group)');
  eq(opts4.attrs['aria-labelledby'], 'infoRowLbl', 'markup: il gruppo e\' etichettato da #infoRowLbl');
  eq(get('infoRowLbl').tagName, 'SPAN', 'markup: #infoRowLbl e\' lo span della riga «Sotto l\'ora»');
  contains(get('infoRowLbl').className, 'rlab', 'markup: #infoRowLbl ha la classe rlab');
  var chkLabels = [], allL = flat(root, []), z;
  for (z = 0; z < allL.length; z++) {
    if (allL[z].tagName === 'LABEL' && allL[z].children[0] && allL[z].children[0].type === 'checkbox') { chkLabels.push(allL[z]); }
  }
  eq(chkLabels.length, 6, 'markup: sei label con casella (scossa, Ottimizza, le 4 di «Sotto l\'ora»)');
  eq(chkLabels.filter(function (e) { return /\bchk\b/.test(e.className || ''); }).length, 6,
     'markup: tutte e sei portano la classe chk (U-09: area di tocco da 40 px)');

  /* CSS: le regole nuove e quelle morte (D87, D92, D97, U-16) */
  var CSSR = cssRuleList(PAGE_CSS);
  function declFor(sel, prop) {
    var k, d, v = null;
    for (k = 0; k < CSSR.length; k++) {
      if (CSSR[k].sel === sel) { d = cssDecl(CSSR[k].block, prop); if (d !== null) { v = d; } }
    }
    return v;
  }
  eq(declFor('html', 'color-scheme'), 'only light', 'CSS: html { color-scheme: only light } (U-16)');
  eq(declFor('select', 'max-width'), '100%', 'CSS: select max-width 100% (U-16)');
  eq(declFor('select', 'min-width'), '0', 'CSS: select min-width 0 (U-16)');
  eq(declFor('select#s_font', 'flex'), '1 1 140px',
     'CSS: select#s_font flex 1 1 140px (D87: il select si restringe; l\'a-capo lo fa #fontRow .rlab)');
  eq(declFor('select#s_font', 'min-width'), '0', 'CSS: select#s_font min-width 0 (D87)');
  eq(declFor('.btn.small', 'min-width'), '40px', 'CSS: .btn.small min-width 40px (frecce da 40 px, D87)');
  eq(declFor('.chk', 'min-height'), '40px', 'CSS: .chk min-height 40px (U-09)');
  eq(declFor('.chk', 'display'), 'inline-flex', 'CSS: .chk e\' un inline-flex');
  eq(declFor('#misc', 'border-top'), '1px solid #ccd', 'CSS: #misc bordo superiore (D89)');
  check(declFor('#addHelp', 'flex-basis') === '100%', 'CSS: #addHelp va su una riga sua (U-04)');
  /* G08 (deviazione accettata): l'a-capo della riga del Font non lo fa la flex-basis del select
   * — il flexbox spezza sulle flex-basis — ma l'etichetta che prenota tutta la prima riga. */
  eq(declFor('#fontRow .rlab', 'flex-basis'), '100%',
     'CSS: l\'etichetta del Font prenota la prima riga (D87: senza, a 360/400 px va a capo la sola freccia)');
  /* G26: le misure della struttura nuova (§3 del contratto). Senza pin si possono cambiare o
   * cancellare e il gate se ne accorge solo come altezza totale della pagina. */
  eq(declFor('.opts', 'gap'), '10px', 'CSS: .opts gap 10px (U-09)');
  eq(declFor('.chk', 'align-items'), 'center', 'CSS: .chk allinea al centro (U-09)');
  eq(declFor('.chk', 'gap'), '4px', 'UX-4: .chk gap 4px (spazio fra casella e testo: residuo UX-2)');
  eq(declFor('#misc', 'margin-top'), '12px', 'CSS: #misc staccato da sopra (D89)');
  eq(declFor('#misc', 'padding-top'), '6px', 'CSS: #misc con aria sotto il filetto (D89)');
  eq(declFor('h3', 'font-size'), '15px', 'CSS: h3 dei gruppi a 15 px (U-08)');
  eq(declFor('h3', 'margin'), '14px 0 4px', 'CSS: h3 dei gruppi staccato da sopra (U-08)');
  eq(declFor('#wfPrev h3', 'margin'), '0 0 4px', 'CSS: l\'h3 dell\'anteprima tiene il suo margine (U-08)');
  /* G07: il reset globale e' border-box; #wfPreview lo scavalca, altrimenti il bordo da 1 px
   * lascerebbe 198 px di contenuto e l'anteprima non sarebbe piu' 1:1 con l'orologio (D92). */
  eq(declFor('*', 'box-sizing'), 'border-box', 'CSS: border-box su tutto (per questo #wfPreview lo scavalca, D92)');
  eq(declFor('#wfPreview', 'box-sizing'), 'content-box', 'CSS: #wfPreview torna a content-box (D92: anteprima 1:1)');
  notContains(PAGE_CSS, '.fontprev', 'CSS: via la regola .fontprev (D95/D97)');
  notContains(PAGE_CSS, '.thumb.empty', 'CSS: via la regola .thumb.empty (D97)');
  /* G27: il vecchio notContains cercava «.kb » con lo spazio, quindi una regola compatta
   * (.kb{font-weight:bold}) rientrava senza far fallire nulla: si guarda l'elenco dei selettori. */
  check(!CSSR.some(function (r) { return r.sel === '.kb'; }),
        'CSS: nessuna regola .kb (D91/D97: #kb usa la classe help, non il grassetto)');

  var js = SRC['page.js'] + SRC['page_core.js'];
  notContains(js, 'localStorage', 'page.js/page_core.js: niente localStorage (origine opaca)');
  notContains(js, 'sessionStorage', 'page.js/page_core.js: niente sessionStorage');
  check(!/\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/.test(js), 'page.js: niente alert/confirm/prompt');
  check(!/=>|\blet\s|\bconst\s|`/.test(js), 'page.js/page_core.js: ES5 (niente arrow/let/const/backtick)');
});

section('2b. avvio con stato completo (emery, dev)', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH, protocol: 'http:' });
  var G = h.G;
  check(!!G, 'window.GalPage esiste');
  eq(G.version, '1.1', 'GalPage.version');
  eq(G.state.ok, true, 'stato letto dall\'hash');
  eq(G.state.fmt, 1, 'fmt 1');
  eq(h.txt('watch'), 'Pebble Time 2', 'etichetta orologio emery: nome proprio cablato (D99)');
  eq(h.disp('status'), 'none', 'stato valido: nessun avviso');
  eq(h.disp('settingsNote'), 'none', 'settingsSet true: nessuna nota');
  eq(h.disp('editor'), 'none', 'editor chiuso all\'avvio');
  eq(G.mode(), 'dev', 'modalita\' dev (return_to nella query)');
  eq(h.txt('msg'), '', 'nessun messaggio all\'avvio');

  eqJson(slotsOf(G.tiles), [3, 0, 5, 9], 'tessere: order, resto dell\'album, estranee');
  eqJson(kindsOf(G.tiles), ['album', 'album', 'album', 'foreign'], 'tessere: kind');
  eqJson(h.tileIds(), ['tile_3', 'tile_0', 'tile_5', 'tile_9'], 'DOM: una tessera per slot, nell\'ordine');
  contains(noZw(h.txt('tile_3')), 'mare.jpg', 'tessera 3: nome');
  contains(h.txt('tile_3'), Tit('badge_no_fmt'), 'tessera 3: avviso formato mancante');
  contains(noZw(h.txt('tile_0')), 'città.jpg', 'tessera 0: nome con accento');
  notContains(h.txt('tile_0'), Tit('badge_pending'), 'tessera 0: gia\' sull\'orologio con lo stesso crc');
  contains(h.txt('tile_5'), Tit('badge_pending'), 'tessera 5: crc diverso');
  contains(h.txt('tile_9'), Tit('badge_foreign'), 'tessera 9: estranea');
  /* U-01/A4 §1: il nome di ripiego e' la POSIZIONE visibile (i + 1), non il numero di slot */
  contains(h.txt('tile_9'), Tit('tile_slot', idxOfSlot(G.tiles, 9) + 1),
           'tessera 9 (slot estraneo): senza nome mostra la posizione');
  eq(h.el('tile_0').children[0].tagName, 'IMG', 'tessera 0: miniatura come <img>');
  eq(h.el('tile_0').children[0].src, 'data:image/jpeg;base64,AAAB', 'tessera 0: src della miniatura');
  eq(h.el('tile_5').children[0].tagName, 'DIV', 'tessera 5: senza miniatura, riquadro grigio');
  eq(h.el('tile_5').children[0].className, 'thumb empty', 'tessera 5: classe thumb empty');
  eq(h.el('tile_5').children[0].textContent, '', 'tessera 5: riquadro vuoto (il nome compare una volta sola, A4 §1)');
  eq(h.el('up_3').disabled, true, 'prima tessera: freccia su disabilitata');
  eq(h.el('down_3').disabled, false, 'prima tessera: freccia giu\' attiva');
  eq(h.el('down_9').disabled, true, 'ultima tessera: freccia giu\' disabilitata');
  eq(h.el('del_9').disabled, false, 'estranea: si puo\' eliminare');
  eq(h.el('file').disabled, false, 'album non pieno: input file attivo');
  eq(h.txt('addHelp'), Tit('add_help'), 'aiuto per l\'aggiunta');
  /* U-02: il contatore si confronta con il testo del dizionario, non con le sue parole: il
   * numero di foto in elenco e il massimo restano pinnati come argomenti. */
  eq(h.txt('photosCap'), Tit('photos_cap', h.el('tiles').children.length, C.MAX_SLOTS),
     'contatore: photos_cap con le foto in elenco e il massimo');

  /* impostazioni scritte nei campi */
  eq(h.el('s_layout').value, '0', 'campo layout');
  eq(h.el('s_layout').options().length, 2, 'layout: 2 opzioni');
  eq(h.el('s_font').value, '2', 'campo font');
  eq(h.el('s_font').options().length, 6, 'font: 6 opzioni (S8-stile: 4 e 5 sono i font nuovi)');
  eqJson(h.el('s_font').options().map(function (o) { return +o._value; }), [0, 1, 2, 3, 4, 5],
         'font: valori 0..5 in ordine');
  eq(h.el('s_font').options()[3].id, 's_font_leco', 'font: l\'opzione LECO ha id s_font_leco');
  eq(h.el('s_font_leco').disabled, false, 'LECO attivo con layout 0');
  eq(h.el('s_digit_style').value, '0', 'campo stile cifre');
  eq(h.el('s_digit_style').options().length, 4, 'stile cifre: 4 opzioni');
  eqJson(h.el('s_digit_style').options().map(function (o) { return +o._value; }), [0, 1, 2, 3],
         'stile cifre: valori 0..3 in ordine');
  eq(h.el('s_digit_style').options()[0].textContent, Tit('opt_style_solid'), 'stile cifre: la prima opzione e\' opt_style_solid');
  eq(h.el('s_digit_style').disabled, false, 'font Barlow: stile cifre attivo');
  eq(h.el('s_outline').disabled, false, 'stile pieno: "Contorno" attivo');
  eq(h.el('s_clock_mode').value, '1', 'campo formato ora');
  eq(h.el('s_leading_zero').value, '2', 'campo zero iniziale');
  eq(h.el('s_interval_min').value, '60', 'campo intervallo');
  eq(h.el('s_interval_min').options().length, 7, 'intervallo: 7 opzioni');
  eqJson(h.el('s_interval_min').options().map(function (o) { return +o._value; }), C.INTERVALS,
         'intervallo: i valori di INTERVALS');
  /* U-09: i testi vengono dal dizionario con il numero al posto di {0} — 60 minuti dalla chiave
   * dei minuti e 180 minuti dalla chiave delle ORE, con 3 (non 180) dentro la frase. */
  eqJson(optTexts(h, 's_interval_min'),
         [Tit('opt_never'), Tit('opt_minutes', 5), Tit('opt_minutes', 15), Tit('opt_minutes', 30),
          Tit('opt_minutes', 60), Tit('opt_hours', 3), Tit('opt_one_day')],
         'intervallo: i 7 testi dal dizionario (60 -> opt_minutes 60, 180 -> opt_hours 3)');
  eq(h.el('s_order').value, '1', 'campo ordine');
  eq(h.el('s_text_color').value, '3', 'campo colore testo');
  eq(h.el('s_text_color').options().length, 5, 'colore testo: 5 opzioni');
  eq(h.el('s_outline').value, '1', 'campo contorno');
  eq(h.el('s_shake_next').checked, false, 'scossa: 0');
  eq(h.el('s_info_row').value, '5', 'riga info: valore composto');
  eqJson([0, 1, 2, 3].map(function (i) { return h.el('s_info_row_b' + i).checked; }), [true, false, true, false],
         'riga info: caselle da info_row 5 (passi + data)');
  /* U-10/D87: al posto della PNG «12:34» ci sono le frecce, col nome accessibile dal dizionario */
  eq(attrOf(h.el('fontPrev'), 'aria-label'), Tit('font_prev'), 'freccia indietro: aria-label dal dizionario');
  eq(attrOf(h.el('fontPrev'), 'title'), Tit('font_prev'), 'freccia indietro: title dal dizionario');
  eq(attrOf(h.el('fontNext'), 'aria-label'), Tit('font_next'), 'freccia avanti: aria-label dal dizionario');
  eq(attrOf(h.el('fontNext'), 'title'), Tit('font_next'), 'freccia avanti: title dal dizionario');
  eq(h.el('fontPrev').disabled, false, 'le frecce non si disabilitano mai');
  eq(h.el('fontNext').disabled, false, 'le frecce non si disabilitano mai (avanti)');

  /* dithering e righe dipendenti dal formato */
  eqJson(h.el('dither').options().map(function (o) { return o._value; }), ['fs', 'bayer', 'none'],
         'emery: Floyd-Steinberg, Bayer, Nessuno');
  eq(h.el('dither').value, 'fs', 'dithering di default: fs');
  eq(h.disp('sunlightRow'), '', 'emery: riga "Ottimizza per il vetro" visibile');
  eq(h.disp('previewModeRow'), '', 'emery: riga anteprima visibile');

  /* contatore KB */
  check(Trx('kb_line', '\\d+', '900', true).test(h.txt('kb')), 'contatore KB: "' + h.txt('kb') + '"');
  eq(h.kbNum(), C.payloadKb(G.buildPayload()), 'contatore KB = payloadKb del payload corrente');
  /* D91: il testo c'e' sempre, ma la riga si vede solo da meta' tetto in su */
  check(h.kbNum() < 450, 'D91 payload ben sotto meta\' tetto (' + h.kbNum() + ' KB di 900)');
  eq(h.disp('kb'), 'none', 'D91 sotto meta\' tetto la riga dei KB resta nascosta');
  eq(h.el('save').disabled, false, 'Salva attivo');
  eqJson(G.buildPayload().order, [3, 0, 5, 9], 'payload iniziale: order = tessere');
  eqJson(G.buildPayload().deleted, [], 'payload iniziale: nessuna eliminazione nuova');
  eqJson(G.buildPayload().photos, [], 'payload iniziale: nessuna foto nuova');
  eq(G.buildPayload().settings.font, 2, 'payload iniziale: impostazioni dai campi');
});

/* snapshot minimo dell'orologio con un CRC delle impostazioni scelto (D82): serve solo a dire
 * alla pagina «l'orologio ha gia' parlato, e le sue impostazioni sono queste». */
function watchCrc(crc) {
  var w = { at: 100, format: 1, maxChunk: 4096, settingsCrc: crc, slots: [], foreign: [] }, k;
  for (k = 0; k < 12; k++) { w.slots.push({ state: 0, crc: 0 }); }
  return w;
}

section('2c. avvisi: hash assente, settingsSet false, orologio sconosciuto, flint', function () {
  var h = loadPage({ hash: '', search: '', protocol: 'file:' });
  eq(h.G.state.ok, false, 'hash assente: stato non valido');
  eq(h.disp('status'), '', 'hash assente: avviso visibile');
  /* UX-2 D83: senza stato non c'e' dizionario (decodeState esce prima di normI18n), quindi
   * status_no_state e msg_no_state_save sono state CANCELLATE e la riga e' inglese cablata,
   * con il dettaglio tecnico nel title (U-14: un formato solo per gli errori). */
  eq(h.el('status').className, 'warn err', 'hash assente: l\'avviso e\' rosso (classi warn err)');
  contains(h.txt('status'), 'Settings not received', 'hash assente: avviso in inglese cablato (D83)');
  notContains(h.txt('status'), 'state missing', 'hash assente: il dettaglio NON sta nel testo');
  eq(h.el('status').title, h.G.state.error, 'hash assente: il dettaglio tecnico sta nel title');
  contains(h.el('status').title, 'state missing', 'hash assente: e il title dice l\'errore vero');
  eq(h.txt('watch'), K('watch_unknown') + ' ' + K('watch_fmt_color'),
     'hash assente: orologio sconosciuto (chiave + valore, senza dizionario)');
  /* D82: senza stato non c'e' nemmeno lo snapshot dell'orologio, quindi la nota e' FALSA e tace */
  eq(h.disp('settingsNote'), 'none', 'hash assente: nessuno snapshot, nessuna nota sulle impostazioni (D82)');
  eqJson(h.G.tiles, [], 'hash assente: nessuna tessera');
  eq(h.G.mode(), 'test', 'file: senza return_to = modalita\' prova');

  var h2 = loadPage({ hash: '#!!!rotto!!!', search: '', protocol: 'http:' });
  eq(h2.G.state.ok, false, 'hash rotto: stato non valido');
  contains(h2.txt('status'), 'Settings not received', 'hash rotto: stessa riga inglese');
  contains(h2.el('status').title, 'invalid state', 'hash rotto: dettaglio dell\'errore nel title');

  /* D82: la nota si vede solo se l'orologio ha impostazioni SUE (CRC diverso dai default) */
  var h3 = loadPage({ state: mkState({ settingsSet: false, platform: 'flint', fmt: 2, watch: watchCrc(7) }) });
  eq(h3.disp('settingsNote'), '', 'settingsSet false + CRC diverso: nota visibile');
  eq(h3.txt('settingsNote'), Tit('settings_note'), 'settingsSet false: testo della nota');
  eq(h3.el('settingsNote').className, 'help', 'la nota e\' grigia (classe help)');
  eq(h3.txt('watch'), Tit('watch_flint'), 'etichetta orologio flint');
  eqJson(h3.el('dither').options().map(function (o) { return o._value; }), ['fs', 'atkinson', 'none'],
         'flint: Floyd-Steinberg, Atkinson, Nessuno');
  eq(h3.disp('sunlightRow'), 'none', 'flint: niente "Ottimizza per il vetro"');
  eq(h3.disp('previewModeRow'), 'none', 'flint: niente scelta dei colori d\'anteprima');

  /* gli altri tre casi di D82: nessuno snapshot, CRC di fabbrica, impostazioni gia' salvate */
  eq(loadPage({ state: mkState({ settingsSet: false, watch: null }) }).disp('settingsNote'), 'none',
     'D82 settingsSet false ma orologio mai sentito: nota nascosta');
  eq(loadPage({ state: mkState({ settingsSet: false, watch: watchCrc(0x7EE7) }) }).disp('settingsNote'), 'none',
     'D82 orologio con le impostazioni di fabbrica: nota nascosta (non e\' vera)');
  eq(loadPage({ state: mkState({ settingsSet: true, watch: watchCrc(7) }) }).disp('settingsNote'), 'none',
     'D82 impostazioni gia\' salvate dalla pagina: nota nascosta');
  eq(loadPage({ state: mkState({ settingsSet: false, watch: watchCrc(7) }) }).disp('settingsNote'), '',
     'D82 controprova su emery: nota visibile');

  var h4 = loadPage({ state: mkState({ platform: 'sconosciuta', fmt: 2, settingsSet: true }) });
  eq(h4.txt('watch'), Tit('watch_unknown', Tit('watch_fmt_bw')),
     'orologio sconosciuto con fmt 2: lo dice');
});

section('2d. tessere: riordino ed eliminazione', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), G = h.G;
  eq(fire(h.el('up_3'), 'click'), false, 'freccia su della prima tessera: disabilitata, non parte');
  eqJson(slotsOf(G.tiles), [3, 0, 5, 9], 'ordine invariato');
  h.click('down_3');
  eqJson(slotsOf(G.tiles), [0, 3, 5, 9], 'giu\' sulla prima: scende di uno');
  eqJson(h.tileIds(), ['tile_0', 'tile_3', 'tile_5', 'tile_9'], 'DOM ricostruito nel nuovo ordine');
  eq(h.el('up_0').disabled, true, 'ora la prima e\' la 0');
  eq(h.el('up_3').disabled, false, 'la 3 puo\' risalire');
  h.click('up_3');
  eqJson(slotsOf(G.tiles), [3, 0, 5, 9], 'su: torna com\'era');
  h.click('down_9');
  eqJson(slotsOf(G.tiles), [3, 0, 5, 9], 'giu\' sull\'ultima: disabilitata');
  eqJson(G.buildPayload().order, [3, 0, 5, 9], 'payload: order dalle tessere');

  /* UX-3 (D110): la ✕ vuole DUE tocchi — il primo arma e lo dice, il secondo elimina davvero.
   * Qui basta il giro di base: arm, disarmo, nomi e messaggi hanno la loro sezione (8b). */
  h.click('del_0');
  eqJson(slotsOf(G.tiles), [3, 0, 5, 9], 'D110 primo tocco sulla ✕: la tessera c\'e\' ancora');
  eq(h.el('del_0').className, 'arm', 'D110 primo tocco: la ✕ si arma');
  eq(h.txt('msg'), Tit('msg_del_arm', 'città.jpg'), 'D110 primo tocco: il messaggio dice quale foto');
  eq(h.el('msg').className, 'warn', 'D110 primo tocco: messaggio in giallo');
  h.click('del_0');
  eqJson(slotsOf(G.tiles), [3, 5, 9], 'elimina la 0: tessera via');
  eqJson(G.deleted, [0], 'elimina la 0: finisce in deleted');
  eq(h.doc.getElementById('tile_0'), null, 'DOM: tessera 0 sparita');
  eqJson(G.buildPayload().deleted, [0], 'payload: deleted');
  eqJson(G.buildPayload().order, [3, 5, 9], 'payload: order senza la 0');
  h.click('del_9'); h.click('del_9');
  eqJson(G.deleted, [0, 9], 'anche l\'estranea finisce in deleted');
  eq(h.doc.getElementById('del_9'), null, 'eliminata: niente piu\' pulsante (non si elimina due volte)');
  eqJson(G.buildPayload().deleted, [0, 9],
         'payload: solo le eliminazioni di questa sessione (lo slot 7, gia\' in state.deleted, non si rimanda)');
  eq(h.kbNum(), C.payloadKb(G.buildPayload()), 'contatore KB aggiornato dopo le eliminazioni');

  /* U-04/D71: il contatore. Con almeno una tessera e' `photos_cap` («{0} di {1} foto») con le
   * foto in elenco e il massimo; svuotando l'elenco passa a un'ALTRA chiave, `photos_cap_empty`,
   * che spiega le due foto di esempio dell'orologio e porta solo il massimo. */
  eq(h.txt('photosCap'), Tit('photos_cap', 2, C.MAX_SLOTS), 'contatore: 2 foto rimaste');
  h.click('del_3'); h.click('del_3');
  eq(h.txt('photosCap'), Tit('photos_cap', 1, C.MAX_SLOTS), 'contatore: 1 foto rimasta');
  h.click('del_5'); h.click('del_5');
  eqJson(slotsOf(G.tiles), [], 'eliminate tutte: nessuna tessera');
  eq(h.txt('photosCap'), Tit('photos_cap_empty', C.MAX_SLOTS),
     'album vuoto: il contatore diventa photos_cap_empty, con il massimo (D71)');
  eq(h.txt('addHelp'), Tit('add_help'), 'album vuoto: l\'aiuto resta quello dell\'aggiunta');
});

section('2e. aggiunta di una foto con codifica vera (emery)', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), G = h.G, ed = G.editor;
  var exp = expectEmery({ gamma: 1, lift: 0, dither: 'fs', sunlight: false });
  h.chooseFile('foto di prova città.jpg');
  eq(G.editorOpen, true, 'scelto il file: editor aperto');
  eq(h.disp('editor'), '', 'editor visibile');
  /* UX-3 (D107): il footer non si spegne piu' — prende le due parole dell'editor */
  eq(h.el('save').disabled, false, 'D107 con l\'editor aperto Salva resta premibile');
  eq(h.txt('save'), Tit('btn_add_ok'), 'D107 ...e dice «Usa questa foto»');
  eq(h.txt('cancel'), Tit('btn_add_cancel'), 'D107 ...mentre Esci dice «Non aggiungere»');
  eq(h.env.bitmapOpts && h.env.bitmapOpts.imageOrientation, 'from-image',
     'createImageBitmap con imageOrientation from-image (EXIF)');
  /* D115: nell'editor si legge il solo NOME del file, troncato come nella tessera; i pixel
   * (numeri, fuori dal dizionario) stanno nel title insieme al nome intero. */
  eq(h.txt('editName'), C.truncateName('foto di prova città.jpg'), 'D115 nome del file nell\'editor');
  eq(attrOf(h.el('editName'), 'title'), 'foto di prova città.jpg · 640×480 px',
     'D115 nome intero e pixel nel title');
  eq(h.el('crop').width, 300, 'cornice: larghezza 300 (nessuna larghezza utile nota)');
  eq(h.el('crop').height, 342, 'cornice: altezza 342 (rapporto 200:228)');
  eq(h.el('preview').width, 400, 'anteprima 2x: 400 px');
  eq(h.el('preview').height, 456, 'anteprima 2x: 456 px');
  eq(Math.round(ed.cover * 1000) / 1000, 0.713, 'cover = max(300/640, 342/480)');
  eq(ed.scale, ed.cover, 'apertura: scala = cover');
  eq(Math.round(ed.tx), -78, 'apertura: immagine centrata in orizzontale');
  eq(Math.round(ed.ty), 0, 'apertura: centrata in verticale');
  eq(h.el('zoom').value, '1', 'slider zoom a 1x');
  eq(ed.last, null, 'anteprima non ancora calcolata (debounce)');
  check(h.el('crop')._calls.join('|').indexOf('fillRect #fff') >= 0, 'cornice disegnata su fondo bianco');
  check(h.el('crop')._calls.join('|').indexOf('strokeRect') < 0, 'emery: nessun rettangolo flint');

  eq(h.timers.run() > 0, true, 'il debounce da 150 ms ha un timer in coda');
  check(!!ed.last, 'dopo il debounce: codifica fatta');
  eq(ed.last.crc, exp.crc, 'anteprima: crc uguale a encodeEmery sugli stessi pixel');
  eq(h.el('preview')._put.w, 400, 'anteprima disegnata a 400 px');
  eq(h.el('preview')._put.h, 456, 'anteprima disegnata a 456 px');
  /* D114/D116: i tempi dell'editor sono roba da dev — riga visibile solo con dev nello stato e
   * testo inglese cablato (edit_time e' uscita dal dizionario). */
  eq(h.disp('etime'), '', 'D114 stato con dev: la riga dei tempi si vede');
  check(/^resize \d+ ms · encode \d+ ms$/.test(h.txt('etime')), 'D114 riga dei tempi: "' + h.txt('etime') + '"');
  eqJson(ed.crop, P.cropRect(ed.sw, ed.sh, [Math.round(-ed.tx / ed.scale), Math.round(-ed.ty / ed.scale),
                                            Math.round(ed.Fw / ed.scale), Math.round(ed.Fh / ed.scale)]),
         'emery: ritaglio sorgente calcolato dalla vista (nessun sotto-rettangolo)');
  check(Math.abs(ed.crop.w / ed.crop.h - 200 / 228) < 0.01, 'emery: ritaglio in rapporto 200:228');
  check(h.env.ctxOpts.some(function (c) { return c.read; }), 'getContext con willReadFrequently per la lettura dei pixel');

  h.click('addOk');
  eq(G.added.length, 1, 'una foto aggiunta');
  var a = G.added[0];
  eq(a.slot, 1, 'slot libero scelto: 1 (0 occupato, 7 eliminato in precedenza)');
  eq(a.fmt, 1, 'formato 1 (emery)');
  eq(a.len, 34200, 'len raw6');
  eq(a.crc, exp.crc, 'crc = pipeline');
  eq(a.photo_id, exp.photo_id, 'photo_id = pipeline');
  check(a.photo_id > 0 && a.photo_id <= 0x7FFFFFFF, 'photo_id a 31 bit, mai 0');
  eq(a.data.length, 45600, 'data: 45.600 caratteri base64url');
  eq(a.data, P.b64url(exp.raw), 'data = base64url del raw6');
  check(!/[^A-Za-z0-9_-]/.test(a.data), 'data: alfabeto base64url senza padding');
  eq(a.name, 'foto di prova città.jpg', 'nome del file');
  eq(a.thumb, 'data:image/jpeg;base64,' + rep('A', 120), 'miniatura JPEG');
  eqJson(h.env.dataUrls[0].slice(0, 2), ['image/jpeg', 0.7], 'miniatura: JPEG a qualita\' 0,7 al primo tentativo');
  eq(h.env.dataUrls.length, 1, 'miniatura: un solo tentativo (entra nei 6.000 caratteri)');
  eqJson(h.env.dataUrls[0].slice(2), [50, 57], 'miniatura: canvas 50×57');
  var tc = h.env.created.filter(function (e) { return e.tagName === 'CANVAS' && e.width === 50 && e.height === 57; });
  eq(tc.length, 1, 'miniatura: un canvas 50×57 creato');
  contains(tc[0]._calls.join('|'), 'fillRect #fff 0,0,50,57', 'miniatura: fondo bianco');
  contains(tc[0]._calls.join('|'), 'drawImage 0,0,200,228,0,0,50,57', 'miniatura: ridotta dai 200×228 dell\'anteprima');
  var sc = h.env.created.filter(function (e) { return e.tagName === 'CANVAS' && e._put && e._put.w === 200 && e._put.h === 228; });
  eq(sc.length, 1, 'miniatura: sorgente 200×228 disegnata pixel per pixel');
  eq(P.crc32(sc[0]._put.data), P.crc32(P.previewRgba(exp.idx, 200, 228, true, 1)),
     'miniatura: colori "come sul vetro" (SUN_RGB)');
  eqJson(Object.keys(a), ['slot', 'photo_id', 'fmt', 'len', 'crc', 'data', 'name', 'thumb'],
         'chiavi della foto nuova');

  eq(G.editorOpen, false, 'editor chiuso dopo l\'aggiunta');
  eq(h.disp('editor'), 'none', 'editor nascosto');
  eq(h.env.closed, 1, 'ImageBitmap.close() chiamato');
  eq(h.el('file').value, '', 'input file svuotato (si puo\' riscegliere la stessa foto)');
  eqJson(slotsOf(G.tiles), [3, 0, 5, 1, 9], 'tessera nuova in fondo alle foto dell\'album, prima dell\'estranea (#6)');
  eq(G.tiles[3].kind, 'new', 'tessera nuova: kind new');
  contains(h.txt('tile_1'), Tit('badge_new'), 'tessera nuova: badge');
  eq(h.el('tile_1').children[0].src, a.thumb, 'tessera nuova: miniatura');
  /* U-07: msg_added non porta piu' ne' lo slot ne' i KB (la dimensione la dice il contatore qui
   * sotto, che e' anche il posto dove l'utente la cerca) */
  eq(h.txt('msg'), Tit('msg_added'), 'messaggio di conferma');
  /* D118: dopo «Usa questa foto» la pagina porta in vista la tessera appena creata */
  eq(h.env.scrolls[h.env.scrolls.length - 1].id, 'tile_' + a.slot,
     'D118 dopo l\'aggiunta si scorre sulla tessera nuova');
  eq(h.el('save').disabled, false, 'Salva di nuovo attivo');
  eq(h.txt('save'), Tit('btn_save'), 'D107 e il footer torna «Salva»');
  eq(h.kbNum() >= 45, true, 'contatore KB sopra i 45 KB (' + h.txt('kb') + ')');
  eq(h.kbNum(), C.payloadKb(G.buildPayload()), 'contatore = payloadKb');

  /* seconda foto: lo slot libero preferisce quelli mai usati */
  h.chooseFile('due.jpg');
  h.timers.run();
  h.click('addOk');
  eq(G.added.length, 2, 'seconda foto aggiunta');
  eq(G.added[1].slot, 2, 'seconda foto: slot 2');
  eq(G.added[1].crc, exp.crc, 'seconda foto: stessi pixel finti, stesso crc');
  eqJson(G.buildPayload().order, [3, 0, 5, 1, 2, 9], 'payload: order con le due nuove dopo l\'album e l\'estranea in coda');
  eq(G.buildPayload().photos.length, 2, 'payload: 2 foto nuove');

  /* eliminare una tessera nuova la scarta e libera lo slot */
  h.click('del_1'); h.click('del_1');
  eq(G.added.length, 1, 'tessera nuova eliminata: scartata da added');
  eqJson(G.deleted, [], 'tessera nuova eliminata: NON finisce in deleted');
  eqJson(slotsOf(G.tiles), [3, 0, 5, 2, 9], 'tessera nuova via dalle tessere');
  h.chooseFile('tre.jpg');
  h.timers.run();
  h.click('addOk');
  eq(G.added[1].slot, 1, 'slot 1 tornato libero e riusato');

  /* nome di file lunghissimo: troncato a 64 caratteri gia' nella tessera */
  var lungo = '';
  while (lungo.length < 90) { lungo += 'nome-lunghissimo-di-una-foto-'; }
  h.chooseFile(lungo + '.jpg');
  h.timers.run();
  h.click('addOk');
  var last = G.added[G.added.length - 1];
  eq(last.name.length, 64, 'nome troncato a 64 caratteri nella foto nuova');
  eq(last.name, lungo.slice(0, 64), 'nome troncato dall\'inizio');
  eq(G.tiles.filter(function (t) { return t.slot === last.slot; })[0].name.length, 64, 'anche la tessera mostra il nome troncato');
  eq(G.buildPayload().photos[G.buildPayload().photos.length - 1].name.length, 64, 'payload: nome troncato');

  /* D73: mentre la foto si carica il messaggio dice «caricamento di …» con il nome TRONCATO a 64
   * caratteri, non quello intero (in un <p> a schermo stretto andrebbe a capo tre volte). Con la
   * decodifica differita (bitmap defer) il messaggio resta a schermo: appena l'editor si apre
   * startEditor lo pulisce, quindi e' l'unico momento in cui si puo' leggere. */
  var hl = loadPage({ state: mkState({ settingsSet: true }), bitmap: 'defer' });
  hl.chooseFile(lungo + '.jpg');
  eq(hl.G.editorOpen, false, 'caricamento: l\'editor si apre solo a immagine pronta');
  eq(hl.txt('msg'), Tit('msg_loading', C.truncateName(lungo + '.jpg')),
     'caricamento: testo dal dizionario con il nome troncato a 64 caratteri');
  check(hl.txt('msg').indexOf(lungo + '.jpg') < 0, 'caricamento: il nome intero non compare');
  eq(hl.el('msg').className, '', 'caricamento: messaggio neutro (non un errore)');
  eq(hl.el('msg').title, '', 'caricamento: nessun dettaglio tecnico nel title');
  /* D109/D124: intanto il pulsante dice «Un momento…» e il footer tiene il nome del file:
   * sono complementari, il dettaglio dello stato di caricamento sta in 8a. */
  eq(hl.el('add').className, 'btn off', 'D109 caricamento: «Aggiungi foto» si spegne');
  eq(hl.txt('add'), Tit('btn_loading'), 'D109 caricamento: e dice «Un momento…»');
  hl.env.deferred[0].res(640, 480);
  eq(hl.G.editorOpen, true, 'immagine arrivata: editor aperto');
  eq(hl.el('add').className, 'btn primary', 'D109 immagine arrivata: il pulsante torna blu');
  eq(hl.txt('add'), Tit('add_photo'), 'D109 ...e torna «Aggiungi foto»');
  eq(hl.txt('msg'), '', 'a editor aperto il messaggio di caricamento sparisce');

  /* uno slot appena eliminato si riusa solo se non ne restano di mai usati */
  var s2 = mkState({ settingsSet: true });
  s2.photos[0] = photo('a.jpg', 1, 1);
  s2.photos[1] = photo('b.jpg', 1, 2);
  s2.order = [0, 1];
  var h2 = loadPage({ state: s2, search: DEV_SEARCH });
  h2.click('del_0'); h2.click('del_0');
  h2.chooseFile('nuova.jpg');
  h2.timers.run();
  h2.click('addOk');
  eq(h2.G.added[0].slot, 2, 'slot libero: il 2 (mai usato), non lo 0 appena eliminato');
  eqJson(h2.G.deleted, [0], 'lo slot 0 resta fra le eliminazioni');
  eqJson(h2.G.buildPayload().order, [1, 2], 'payload: order senza lo slot eliminato');
});

section('2f. editor: Annulla, gamma/lift, dithering, anteprima, sunlight', function () {
  /* UX-3 (D105/D106): nel canvas dell'editor c'e' la watchface, quindi lo stato porta anche le
   * maschere: senza, il motore avviserebbe che le cifre non ci sono e la nota prenderebbe il
   * posto della didascalia fissa (la precedenza si prova in 8d). */
  var h = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks() }), search: DEV_SEARCH,
                     cropWidth: 260 }), G = h.G, ed = G.editor;
  h.chooseFile('a.jpg');
  eq(h.el('crop').width, 204, 'D113 cornice: larghezza utile 260 meno le due corsie da 28 px');
  eq(h.el('crop').height, Math.round(204 * 228 / 200), 'cornice: altezza in rapporto');
  h.timers.run();
  eq(ed.last.crc, expectEmery({ gamma: 1, lift: 0, dither: 'fs', sunlight: false }).crc, 'default: fs, gamma 1, lift 0');

  h.range('gamma', 1.5);
  eq(h.txt('gammaVal'), '1,50', 'etichetta gamma con la virgola');
  h.timers.run();
  eq(ed.last.crc, expectEmery({ gamma: 1.5, lift: 0, dither: 'fs', sunlight: false }).crc, 'gamma 1,5 applicata');
  h.range('lift', 0.2);
  eq(h.txt('liftVal'), '0,20', 'etichetta lift');
  h.timers.run();
  eq(ed.last.crc, expectEmery({ gamma: 1.5, lift: 0.2, dither: 'fs', sunlight: false }).crc, 'lift 0,20 applicato');
  h.range('gamma', 1); h.range('lift', 0); h.timers.run();

  h.select('dither', 'bayer');
  h.timers.run();
  eq(ed.last.crc, expectEmery({ gamma: 1, lift: 0, dither: 'bayer', sunlight: false }).crc, 'Bayer 4x4');
  h.select('dither', 'none');
  h.timers.run();
  eq(ed.last.crc, expectEmery({ gamma: 1, lift: 0, dither: 'none', sunlight: false }).crc, 'nessun dithering');
  h.select('dither', 'fs');

  /* UX-3 (D105): nel canvas dell'editor non c'e' piu' il solo dithering della foto ma la
   * watchface intera, disegnata dallo STESSO motore di #wfPreview. Il «come sul vetro» si legge
   * nella chiamata al motore (sunlight), non confrontando due putImageData. */
  eq(lastCall(h).raw, ed.last.raw, 'D105 il motore riceve i pixel in lavorazione');
  eq(lastCall(h).sunlight, true, 'D105 con «come sul vetro»: sunlight true');
  eq(h.el('preview')._put.w, 400, 'D105 e il disegno finisce nel canvas dell\'editor, a 2x');
  eq(h.txt('editPrevCap'), Tit('edit_preview_cap'), 'D106 didascalia fissa dell\'editor');
  h.select('previewMode', 'nominal');
  eq(h.el('previewMode').value, 'nominal', 'anteprima: modalita\' colori nominali');
  eq(lastCall(h).sunlight, false, 'D105 colori nominali: sunlight false nella chiamata');
  eq(h.el('preview')._put.w, 400, 'anteprima nominale: sempre 2x');
  h.select('previewMode', 'sun');
  eq(lastCall(h).sunlight, true, 'D105 e si torna a «come sul vetro»');

  h.checkbox('sunlight', true);
  h.timers.run();
  eq(ed.last.crc, expectEmery({ gamma: 1, lift: 0, dither: 'fs', sunlight: true }).crc,
     '"Ottimizza per il vetro": LUT sunlight nel dithering');
  h.checkbox('sunlight', false);
  h.timers.run();

  var nTiles = G.tiles.length;
  h.click('addCancel');
  eq(G.editorOpen, false, 'Annulla: editor chiuso');
  eq(h.disp('editor'), 'none', 'Annulla: editor nascosto');
  eq(G.tiles.length, nTiles, 'Annulla: nessuna tessera aggiunta');
  eq(G.added.length, 0, 'Annulla: nessuna foto in added');
  contains(h.txt('msg'), Tit('msg_crop_cancel'), 'Annulla: messaggio');
  eq(h.el('save').disabled, false, 'Annulla: Salva riattivato');
  eq(h.txt('save'), Tit('btn_save'), 'D107 Annulla: il footer torna «Salva»');
  eq(h.timers.q.length, 0, 'Annulla: nessun lavoro in sospeso');
});

section('2g. gesti: trascinamento, rotellina, zoom, Adatta, pinch, fallback touch', function () {
  var h = loadPage({ state: mkState({ settingsSet: true }), imgW: 800, imgH: 600 }), ed = h.G.editor;
  var cv = h.el('crop');
  h.chooseFile('g.jpg');
  h.timers.run();
  var tx0 = ed.tx, scale0 = ed.scale;
  fire(cv, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
  eq(cv._captured, true, 'pointerdown: setPointerCapture');
  fire(cv, 'pointermove', { pointerId: 1, clientX: 130, clientY: 100 });
  eq(Math.round(ed.tx - tx0), 30, 'trascinamento: sposta l\'immagine di 30 px');
  /* UX-4 (G16 lato JS): 31 px di dito = 31,0 px di cornice, non 30,79 (300/302): pos() divide per
   * r.width - 2 partendo da r.left + 1. Pin esatti, senza Math.round. */
  fire(cv, 'pointermove', { pointerId: 1, clientX: 100, clientY: 100 });
  fire(cv, 'pointermove', { pointerId: 1, clientX: 131, clientY: 100 });
  eq(ed.tx - tx0, 31, 'G16 pos() esatta: 31 px di dito = 31 px di cornice (niente 300/302)');
  fire(cv, 'pointermove', { pointerId: 1, clientX: 3000, clientY: 100 });
  eq(ed.tx, 0, 'trascinamento oltre il bordo: la cornice resta coperta (tx <= 0)');
  fire(cv, 'pointerup', { pointerId: 1 });
  fire(cv, 'pointermove', { pointerId: 1, clientX: 0, clientY: 0 });
  eq(ed.tx, 0, 'dopo pointerup il movimento non sposta piu\' nulla');

  /* UX-4 (G16): rotellina sull'angolo esterno (1,1) = punto (0,0) della cornice: lo zoom scala
   * attorno all'origine, tx e ty diventano tx * k e ty * k senza il px del bordo. */
  var txB = ed.tx, tyB = ed.ty, sB = ed.scale;
  fire(cv, 'wheel', { deltaY: -100, clientX: 1, clientY: 1 });
  eq(ed.tx, txB * (ed.scale / sB), 'G16 pos() esatta: zoom ancorato all\'angolo (0,0) della cornice');
  eq(ed.ty, tyB * (ed.scale / sB), 'G16 pos() esatta: zoom ancorato all\'angolo (0,0) anche in verticale');
  fire(cv, 'wheel', { deltaY: 100, clientX: 1, clientY: 1 });
  fire(cv, 'wheel', { deltaY: -100, clientX: 150, clientY: 171 });
  eq(Math.round(ed.scale / scale0 * 100) / 100, 1.1, 'rotellina in su: ingrandisce del 10%');
  eq(h.el('zoom').value, '1.1', 'slider zoom aggiornato dalla rotellina');
  fire(cv, 'wheel', { deltaY: 100, clientX: 150, clientY: 171 });
  eq(Math.round(ed.scale / scale0 * 1000) / 1000, 1, 'rotellina in giu\': torna indietro');

  h.range('zoom', 3);
  eq(Math.round(ed.scale / ed.cover * 100) / 100, 3, 'slider zoom: scala 3x rispetto a cover');
  var tyA = ed.ty;
  fire(cv, 'pointerdown', { pointerId: 2, clientX: 100, clientY: 100, button: 0 });
  fire(cv, 'pointermove', { pointerId: 2, clientX: 100, clientY: 131 });
  eq(ed.ty - tyA, 31, 'G16 pos() esatta: 31 px di dito in verticale = 31 px di cornice');
  fire(cv, 'pointerup', { pointerId: 2 });
  h.range('zoom', 9);
  eq(Math.round(ed.scale / ed.cover * 100) / 100, 4, 'zoom oltre il massimo: fermato a 4x');
  h.click('fit');
  eq(ed.scale, ed.cover, 'Adatta: torna a cover');
  eq(h.el('zoom').value, '1', 'Adatta: slider a 1x');

  /* pinch: due dita che si allontanano ingrandiscono */
  fire(cv, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 150, button: 0 });
  fire(cv, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 150, button: 0 });
  var sBefore = ed.scale;
  fire(cv, 'pointermove', { pointerId: 2, clientX: 260, clientY: 150 });
  check(ed.scale > sBefore, 'pinch: due dita che si allontanano ingrandiscono (' + sBefore + ' -> ' + ed.scale + ')');
  fire(cv, 'pointerup', { pointerId: 1 }); fire(cv, 'pointerup', { pointerId: 2 });

  /* senza Pointer Events si usano gli eventi touch */
  var h2 = loadPage({ state: mkState({ settingsSet: true }), pointer: false, imgW: 800, imgH: 600 });
  var cv2 = h2.el('crop'), ed2 = h2.G.editor;
  h2.chooseFile('t.jpg');
  h2.timers.run();
  var tx2 = ed2.tx;
  fire(cv2, 'touchstart', { changedTouches: [{ identifier: 5, clientX: 100, clientY: 100 }] });
  fire(cv2, 'touchmove', { changedTouches: [{ identifier: 5, clientX: 120, clientY: 100 }] });
  eq(Math.round(ed2.tx - tx2), 20, 'fallback touch: trascinamento');
  fire(cv2, 'touchend', { changedTouches: [{ identifier: 5, clientX: 120, clientY: 100 }] });
  fire(cv2, 'touchmove', { changedTouches: [{ identifier: 5, clientX: 0, clientY: 100 }] });
  eq(Math.round(ed2.tx - tx2), 20, 'fallback touch: dopo touchend non si sposta piu\'');
  /* senza Pointer Events anche il mouse trascina (desktop vecchio, spec §5.3: fallback touch/mouse) */
  fire(cv2, 'mousedown', { clientX: 100, clientY: 100, button: 0 });
  fire(cv2, 'mousemove', { clientX: 90, clientY: 100 });
  eq(Math.round(ed2.tx - tx2), 10, 'fallback mouse: trascinamento di -10 px');
  fire(cv2, 'mouseup', { clientX: 90, clientY: 100 });
  fire(cv2, 'mousemove', { clientX: 0, clientY: 100 });
  eq(Math.round(ed2.tx - tx2), 10, 'fallback mouse: dopo mouseup non si sposta piu\'');
  fire(cv2, 'mousedown', { clientX: 100, clientY: 100, button: 2 });
  fire(cv2, 'mousemove', { clientX: 50, clientY: 100 });
  eq(Math.round(ed2.tx - tx2), 10, 'fallback mouse: il tasto destro non trascina');
  fire(cv2, 'mouseleave', {}); fire(cv2, 'mouseleave', {});
  fire(cv2, 'mousedown', { clientX: 100, clientY: 100, button: 0 });
  fire(cv2, 'mousemove', { clientX: 95, clientY: 100 });
  eq(Math.round(ed2.tx - tx2), 5, 'fallback mouse: dopo mouseleave ripetuti si trascina ancora (contatore dei puntatori sano)');
  fire(cv2, 'mouseup', {});
});

section('2h. album pieno', function () {
  var s = mkState({ settingsSet: true }), k;
  for (k = 0; k < 12; k++) { s.photos[k] = photo('f' + k + '.jpg', 1, 100 + k); }
  var h = loadPage({ state: s, search: DEV_SEARCH }), G = h.G;
  eq(G.tiles.length, 12, '12 tessere');
  eq(h.el('file').disabled, true, 'album pieno: input file disabilitato');
  eq(h.el('add').disabled, true, 'album pieno: pulsante Aggiungi disabilitato');
  eq(h.el('add').className, 'btn off', 'album pieno: classe off');
  eq(h.txt('add'), Tit('add_photo'), 'D109 album pieno: il testo resta «Aggiungi foto»');
  eq(h.el('add').disabled, true, 'album pieno: la label e\' spenta');
  eq(h.txt('addHelp'), Tit('album_full', C.MAX_SLOTS), 'album pieno: testo di aiuto');
  eq(h.txt('photosCap'), Tit('photos_cap', C.MAX_SLOTS, C.MAX_SLOTS), 'album pieno: contatore al massimo');
  eq(fire(h.el('file'), 'change'), false, 'album pieno: l\'input disabilitato non manda change');
  G.addFile({ name: 'tredicesima.jpg' });
  eq(G.editorOpen, false, 'album pieno: l\'editor non si apre');
  contains(h.txt('msg'), Tit('album_full', C.MAX_SLOTS), 'album pieno: messaggio');
  h.click('del_4'); h.click('del_4');             /* D110: due tocchi */
  eq(h.el('file').disabled, false, 'eliminata una foto: si puo\' aggiungere');
  eq(h.el('add').className, 'btn primary', 'U-04: tornato il posto, «Aggiungi foto» torna blu');
  eq(h.txt('add'), Tit('add_photo'), 'D109 e il testo e\' sempre «Aggiungi foto»');
  eq(h.txt('addHelp'), Tit('add_help'), 'aiuto ripristinato');
  h.chooseFile('nuova.jpg');
  h.timers.run();
  h.click('addOk');
  eq(G.added[0].slot, 4, 'unico slot disponibile: il 4 appena eliminato');
  eqJson(G.deleted, [4], 'lo slot 4 resta in deleted (l\'album lo svuota e poi lo riempie)');
  eq(G.buildPayload().photos[0].slot, 4, 'payload: foto nuova sullo slot 4');

  /* U-01: anche la CONFERMA dell'editor ripete il massimo con {0} = MAX_SLOTS, non solo
   * l'apertura. Il ramo e' difensivo — dall'interfaccia l'album non si riempie mentre l'editor
   * e' aperto — e si provoca rimettendo a mano una tessera sullo slot liberato, fra l'apertura
   * e il tocco su «Usa questa foto»: freeSlot torna -1 e addOk deve rifiutare con lo stesso
   * testo dell'aiuto sotto il pulsante Aggiungi. */
  h.click('del_2'); h.click('del_2');
  h.chooseFile('quattordicesima.jpg');
  h.timers.run();
  eq(G.editorOpen, true, 'liberato uno slot: l\'editor si apre');
  var nAdd = G.added.length;
  G.tiles.push({ slot: 2, kind: 'album', name: 'tornata.jpg', thumb: null, hasFmt: true, pending: false });
  h.click('addOk');
  eq(G.added.length, nAdd, 'album tornato pieno alla conferma: nessuna foto aggiunta');
  eq(h.txt('msg'), Tit('album_full', C.MAX_SLOTS), 'conferma con album pieno: album_full con il massimo');
  eq(h.el('msg').className, 'err', 'conferma con album pieno: messaggio in rosso');
});

section('2i. impostazioni: LECO e layout, riga info, lettura nel payload', function () {
  var h = loadPage({ state: mkState({ settingsSet: true, settings: { layout: 0, font: 3, info_row: 0 } }),
                     search: DEV_SEARCH }), G = h.G;
  eq(h.el('s_font').value, '3', 'layout 0: LECO ammesso');
  eq(h.el('s_font_leco').disabled, false, 'layout 0: opzione LECO attiva');
  eqJson([0, 1, 2, 3].map(function (i) { return h.el('s_info_row_b' + i).checked; }),
         [false, false, false, false], 'info_row 0: nessuna casella');
  eq(h.el('s_info_row').value, '0', 'info_row 0 nel campo nascosto');

  h.select('s_layout', '1');
  eq(h.el('s_font_leco').disabled, true, 'layout Tutto schermo: LECO disabilitato');
  eq(h.el('s_font').value, '0', 'layout Tutto schermo: LECO selezionato torna ad Anton');
  eq(G.buildPayload().settings.font, 0, 'payload: font 0');
  eq(G.buildPayload().settings.layout, 1, 'payload: layout 1');
  h.select('s_layout', '0');
  eq(h.el('s_font_leco').disabled, false, 'tornando al layout Un terzo LECO si riattiva');
  eq(h.el('s_font').value, '0', 'il font resta quello scelto');

  h.select('s_font', '1');
  h.checkbox('s_info_row_b1', true);
  h.checkbox('s_info_row_b3', true);
  eq(h.el('s_info_row').value, '10', 'riga info: batteria + telefono scollegato = 10');
  eq(G.buildPayload().settings.info_row, 10, 'payload: info_row 10');
  h.checkbox('s_shake_next', true);
  h.select('s_interval_min', '5');
  h.select('s_text_color', '4');
  h.select('s_outline', '2');
  h.select('s_clock_mode', '2');
  h.select('s_leading_zero', '1');
  h.select('s_order', '1');
  h.select('s_digit_style', '3');
  eqJson(G.buildPayload().settings,
         { layout: 0, font: 1, clock_mode: 2, leading_zero: 1, text_color: 4, outline: 2,
           interval_min: 5, order: 1, shake_next: 1, info_row: 10, digit_style: 3, lang: 0 },
         'payload: le impostazioni lette dai campi');
  h.select('s_digit_style', '0');

  /* UX-2 D95: previews.js non esiste piu'. Nel contesto non c'e' nessun GalPreviews e la pagina
   * non lo cerca: niente <img id="fontPreview">, niente chiavi anton/bebas/... */
  var h2 = loadPage({ state: mkState({ settingsSet: true }) });
  eq(h2.sb.GalPreviews, undefined, 'D95: nessun GalPreviews nel contesto');
  eq(h2.doc.getElementById('fontPreview'), null, 'D95: nessun #fontPreview nel markup');
  eq(h2.el('s_font').value, '0', 'la pagina si avvia senza anteprime PNG');
  eq(h2.txt('msg'), '', 'e senza errori');
  notContains(SRC['page.js'], 'GalPreviews', 'D95: page.js non nomina piu\' GalPreviews');
  notContains(SRC['page.js'], 'fontPreview', 'D95: page.js non nomina piu\' fontPreview');

  /* il contatore KB e il tetto seguono anche le impostazioni: con la miniatura si porta il payload a
   * 1 byte da un multiplo di 1024, poi "5" -> "180" (+2 byte) sfora e info_row 15 -> 7 (-1) rientra */
  var st3 = mkState({ settingsSet: true, settings: { interval_min: 5 } });
  var h3 = loadPage({ state: st3, search: DEV_SEARCH });
  h3.chooseFile('kb.jpg'); h3.timers.run(); h3.click('addOk');
  var len0 = JSON.stringify(h3.G.buildPayload()).length;                  /* miniatura di 120 'A' */
  var n = 120 + ((1023 - (len0 % 1024)) + 1024) % 1024, len1 = len0 + n - 120, kb1 = Math.ceil(len1 / 1024);
  var st4 = mkState({ settingsSet: true, settings: { interval_min: 5 }, cap_kb: kb1 });
  var h4 = loadPage({ state: st4, search: DEV_SEARCH, toDataURL: function () { return 'data:image/jpeg;base64,' + rep('A', n); } });
  /* D117: con un tetto cosi' stretto la pagina spegne gia' #file (la prossima foto sforerebbe):
   * si passa da GalPage.addFile, la stessa porta del gate. */
  pickFile(h4, 'kb.jpg'); h4.timers.run(); h4.click('addOk');
  eq(JSON.stringify(h4.G.buildPayload()).length, len1, 'payload a 1 byte da un multiplo di 1024');
  eq(h4.kbNum(), kb1, 'contatore dopo l\'aggiunta');
  eq(h4.el('save').disabled, false, 'al tetto esatto Salva e\' attivo');
  h4.select('s_interval_min', '180');
  eq(h4.kbNum(), kb1 + 1, 'contatore KB ricalcolato dopo un cambio di select');
  eq(h4.G.overCap, true, 'cambio di impostazione sopra il tetto: overCap');
  eq(h4.el('save').disabled, true, 'cambio di impostazione sopra il tetto: Salva disabilitato');
  contains(h4.txt('msg'), Tpre('cap_over'), 'cambio di impostazione sopra il tetto: messaggio');
  h4.checkbox('s_info_row_b3', false);
  eq(h4.kbNum(), kb1, 'contatore KB ricalcolato dopo una casella della riga info');
  eq(h4.el('save').disabled, false, 'rientrati nel tetto: Salva riattivato');
  eq(h4.txt('msg'), '', 'rientrati nel tetto: messaggio ripulito');
  h4.checkbox('s_shake_next', false);
  eq(h4.kbNum(), kb1, 'casella scossa: contatore coerente');
  eq(h4.G.buildPayload().settings.shake_next, 0, 'casella scossa letta nel payload');
});

section('2j. Salva in modalita\' dev (POST /save + token di ritorno)', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH, protocol: 'http:' }), G = h.G;
  h.chooseFile('salva.jpg');
  h.timers.run();
  h.click('addOk');
  h.click('del_5'); h.click('del_5');
  h.click('save');
  eq(h.net.posts.length, 1, 'un solo POST');
  eq(h.net.posts[0].url, '/save', 'POST su /save (URL relativo)');
  eq(h.net.posts[0].headers['content-type'], 'application/json', 'Content-Type: application/json');
  eq(h.el('save').disabled, true, 'durante l\'invio Salva e\' disabilitato');
  contains(h.txt('msg'), EN_DEV.sending, 'messaggio di invio in corso (D72: inglese cablato)');
  eq(h.click('save'), false, 'secondo clic su Salva: bloccato (pulsante disabilitato)');
  eq(h.net.posts.length, 1, 'nessun secondo POST');

  var body = JSON.parse(h.net.posts[0].body);
  eqJson(Object.keys(body), ['v', 'settings', 'order', 'deleted', 'photos'], 'corpo: chiavi del payload');
  eq(body.v, 1, 'corpo: v 1');
  eq(Object.keys(body.settings).length, N_SETTINGS, 'corpo: ' + N_SETTINGS + ' impostazioni');
  check(Object.keys(body.settings).every(function (k) { return body.settings[k] === (body.settings[k] | 0); }),
        'corpo: impostazioni tutte intere');
  eqJson(body.order, [3, 0, 1, 9], 'corpo: order (senza la 5 eliminata, la nuova dopo l\'album, l\'estranea in coda)');
  eqJson(body.deleted, [5], 'corpo: deleted');
  eq(body.photos.length, 1, 'corpo: una foto nuova');
  eq(body.photos[0].len, 34200, 'corpo: len raw6');
  eq(body.photos[0].data.length, 45600, 'corpo: data completa');
  eq(body.photos[0].crc, expectEmery({ gamma: 1, lift: 0, dither: 'fs', sunlight: false }).crc, 'corpo: crc');
  eqJson(body, G.lastPayload, 'corpo = GalPage.lastPayload');
  eq(h.navs.length, 0, 'nessuna navigazione prima della risposta');

  h.net.flush();
  eq(h.navs.length, 1, 'risposta ok: una navigazione');
  eq(h.navs[0], DEV_RT + encodeURIComponent(JSON.stringify({ v: 1, dev: true, seq: 7 })),
     'navigazione: return_to + token {v,dev,seq} percent-encoded');
  eqJson(JSON.parse(decodeURIComponent(h.navs[0].slice(DEV_RT.length))), { v: 1, dev: true, seq: 7 },
         'token decodificabile');
  contains(h.txt('msg'), EN_DEV.saved + '7', 'messaggio di conferma (D72: inglese cablato, con il seq)');
  eq(h.el('msg').className, 'okmsg', 'messaggio di conferma in verde');
  eqJson(h.loc.hrefs, [], 'nessun location.href (la navigazione e\' catturata da setNavigate)');
});

section('2k. Salva sul telefono, in prova, e Annulla', function () {
  var h = loadPage({ state: stateEmery(), search: '', protocol: 'data:' }), G = h.G;
  eq(G.mode(), 'phone', 'data: senza return_to = telefono');
  h.chooseFile('tel.jpg');
  h.timers.run();
  h.click('addOk');
  h.click('save');
  /* D108: il messaggio dice che sta inviando e Salva si spegne; la navigazione parte lo stesso */
  eq(h.txt('msg'), Tit('msg_sending'), 'D108 telefono: «Invio all\'orologio…»');
  eq(h.el('msg').className, '', 'D108 telefono: messaggio neutro, non un errore');
  eq(h.el('save').disabled, true, 'D108 telefono: Salva spento durante l\'invio');
  eq(h.net.posts.length, 0, 'telefono: nessun POST');
  eq(h.navs.length, 1, 'telefono: una navigazione');
  check(h.navs[0].indexOf('pebblejs://close#') === 0, 'telefono: pebblejs://close#…');
  var payload = JSON.parse(decodeURIComponent(h.navs[0].slice('pebblejs://close#'.length)));
  eqJson(Object.keys(payload), ['v', 'settings', 'order', 'deleted', 'photos'], 'telefono: payload completo');
  eq(payload.photos[0].data.length, 45600, 'telefono: la foto viaggia intera');
  eqJson(payload, G.lastPayload, 'telefono: lastPayload');
  notContains(h.navs[0].slice(17), '"', 'telefono: JSON percent-encoded (nessun apice nudo)');
  /* D108: se la WebView non si chiude, dopo 5 s Salva torna premibile (il messaggio resta) */
  check(h.timers.q.length === 1 && h.timers.q[0].ms === 5000, 'D108 un timer da 5 s in coda');
  h.timers.run();
  eq(h.el('save').disabled, false, 'D108 dopo 5 s Salva torna premibile');
  eq(h.txt('msg'), Tit('msg_sending'), 'D108 ...e il messaggio d\'invio resta');
  h.click('cancel');
  eq(h.navs.length, 1, 'telefono: con una foto aggiunta il primo tocco su Esci non chiude (#20)');
  h.click('cancel');
  eq(h.navs[1], 'pebblejs://close#', 'telefono: il secondo tocco chiude senza payload');

  /* dev: Annulla torna a return_to senza token */
  var h2 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h2.click('cancel');
  eqJson(h2.navs, [DEV_RT], 'dev: Annulla = return_to senza query');
  eq(h2.net.posts.length, 0, 'dev: Annulla non manda POST');

  /* prova: nessuna navigazione */
  var h3 = loadPage({ state: stateEmery(), search: '', protocol: 'http:' });
  eq(h3.G.mode(), 'test', 'http senza return_to = prova');
  h3.click('save');
  eq(h3.navs.length, 0, 'prova: nessuna navigazione');
  eq(h3.net.posts.length, 0, 'prova: nessun POST');
  contains(h3.txt('msg'), EN_DEV.testPayload, 'prova: messaggio con i KB (D72)');
  check(!!h3.G.lastPayload, 'prova: payload conservato in GalPage.lastPayload');
  h3.click('cancel');
  eq(h3.navs.length, 0, 'prova: Annulla non naviga');
  contains(h3.txt('msg'), EN_DEV.testClose, 'prova: messaggio di Annulla (D72)');

  /* senza setNavigate si usa location.href */
  var h4 = loadPage({ state: stateEmery(), search: '', protocol: 'data:', noCapture: true });
  h4.click('save');
  eq(h4.loc.hrefs.length, 1, 'senza setNavigate: location.href impostato');
  check(h4.loc.hrefs[0].indexOf('pebblejs://close#') === 0, 'senza setNavigate: pebblejs://close#…');
});

section('2l. tetto KB', function () {
  var h = loadPage({ state: stateEmery({ cap_kb: 30 }), search: DEV_SEARCH }), G = h.G;
  eq(G.state.cap_kb, 30, 'tetto 30 KB dallo stato');
  check(Trx('kb_line', '\\d+', '30', true).test(h.txt('kb')), 'contatore con il tetto: "' + h.txt('kb') + '"');
  eq(G.overCap, false, 'all\'inizio si sta sotto il tetto');
  /* D117: con 30 KB di tetto la PROSSIMA foto sforerebbe di sicuro, quindi la pagina ha gia'
   * spento #file (la sezione 8f ci sta sopra): per arrivare al tetto si passa da addFile. */
  eq(G.capNext, true, 'D117 tetto 30 KB: «Aggiungi foto» e\' gia\' frenato');
  eq(fire(h.el('file'), 'change'), false, 'D117 e l\'input spento non manda change');
  pickFile(h, 'grossa.jpg');
  h.timers.run();
  h.click('addOk');
  eq(G.overCap, true, 'con una foto da 45 KB si sfora');
  eq(h.el('save').disabled, true, 'sopra il tetto: Salva disabilitato');
  eq(h.txt('msg'), C.capMessage(h.kbNum(), 30, 1, Tit), 'messaggio del tetto');
  eq(h.el('msg').className, 'err', 'messaggio del tetto in rosso');
  notContains(h.txt('msg'), Tpre('msg_added'), 'sopra il tetto non si annuncia l\'aggiunta');
  eq(h.click('save'), false, 'sopra il tetto il clic su Salva non parte');
  eq(h.net.posts.length, 0, 'sopra il tetto: nessun POST');

  var oldSlot = G.added[0].slot;
  h.click('del_' + oldSlot); h.click('del_' + oldSlot);
  eq(G.overCap, false, 'tolta la foto si torna sotto il tetto');
  eq(h.el('save').disabled, false, 'Salva riattivato');
  notContains(h.txt('msg'), Tpre('cap_over'), 'messaggio del tetto ripulito');
  contains(h.txt('msg'), Tpre('msg_new_dropped'), 'al suo posto il messaggio dell\'eliminazione (#10)');
  h.click('save');
  eq(h.net.posts.length, 1, 'ora il salvataggio parte');
});

section('2m. errori: POST fallito, immagine illeggibile, miniatura troppo grande', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h.net.reply = function () { return { status: 500, text: 'errore interno' }; };
  h.click('save');
  h.net.flush();
  contains(h.txt('msg'), EN_DEV.saveFail, 'POST 500: messaggio (D72)');
  contains(h.txt('msg'), 'HTTP 500', 'POST 500: codice');
  eq(h.el('msg').className, 'err', 'POST 500: messaggio in rosso');
  eq(h.navs.length, 0, 'POST 500: nessuna navigazione');
  eq(h.el('save').disabled, false, 'POST 500: Salva riattivato per riprovare');
  h.net.reply = function () { return { status: 200, text: JSON.stringify({ ok: false, error: 'slot doppio' }) }; };
  h.click('save');
  h.net.flush();
  contains(h.txt('msg'), EN_DEV.saveFail + 'slot doppio', 'ok:false: messaggio del server (D72)');
  eq(h.navs.length, 0, 'ok:false: nessuna navigazione');
  h.net.reply = function () { return { status: 0, text: '' }; };
  h.click('save');
  h.net.flush();
  contains(h.txt('msg'), EN_DEV.noServer, 'rete giu\': messaggio (D72)');
  h.net.reply = null;
  h.click('save');
  h.net.flush();
  eq(h.navs.length, 1, 'al tentativo successivo il salvataggio riesce');

  /* immagine non decodificabile: createImageBitmap rifiuta e anche il fallback <img> */
  var h2 = loadPage({ state: stateEmery(), bitmap: 'reject', imgFail: true });
  h2.chooseFile('rotta.jpg');
  eq(h2.G.editorOpen, false, 'immagine rotta: editor non aperto');
  eq(h2.disp('editor'), 'none', 'immagine rotta: editor nascosto');
  contains(h2.txt('msg'), Tpre('msg_read_fail') + ' rotta.jpg', 'immagine rotta: messaggio');
  eq(h2.el('msg').className, 'err', 'immagine rotta: messaggio in rosso');
  /* D72: il testo e' SOLO quello del dizionario (msg_read_fail non ha piu' il secondo
   * segnaposto); il dettaglio tecnico, illeggibile per chi legge, sta nel title di #msg. */
  eq(h2.txt('msg'), Tit('msg_read_fail', 'rotta.jpg'), 'immagine rotta: testo senza dettaglio tecnico');
  check(h2.el('msg').title !== '' && h2.el('msg').title !== undefined,
        'immagine rotta: il dettaglio tecnico sta nel title («' + h2.el('msg').title + '»)');
  eq(h2.el('msg').title, 'image cannot be decoded',
     'D116: il dettaglio e\' inglese cablato (err_bad_image e\' uscita dal dizionario)');
  notContains(h2.txt('msg'), h2.el('msg').title, 'immagine rotta: il dettaglio non entra nel testo');
  eq(h2.env.revoked, 1, 'immagine rotta: objectURL revocato');

  /* createImageBitmap assente: fallback su <img> */
  var h3 = loadPage({ state: stateEmery(), bitmap: 'none', imgW: 300, imgH: 400 });
  h3.chooseFile('fallback.jpg');
  eq(h3.G.editorOpen, true, 'senza createImageBitmap l\'editor si apre lo stesso');
  eq(h3.txt('editName'), 'fallback.jpg', 'D115 fallback: nel testo il solo nome del file');
  eq(attrOf(h3.el('editName'), 'title'), 'fallback.jpg · 300×400 px',
     'D115 fallback: dimensioni da naturalWidth/Height, nel title');
  eq(h3.env.revoked, 1, 'fallback: objectURL revocato dopo il caricamento');
  h3.timers.run();
  h3.click('addOk');
  eq(h3.G.added.length, 1, 'fallback: la foto si aggiunge');
  eq(h3.env.closed, 0, 'fallback: nessun ImageBitmap da chiudere');
  /* D78: con la miniatura la conferma e' msg_added, e un messaggio normale lascia il title VUOTO
   * (il title e' riservato al dettaglio tecnico degli errori). */
  eq(h3.txt('msg'), Tit('msg_added'), 'fallback: messaggio di conferma con la miniatura');
  eq(h3.el('msg').title, '', 'messaggio normale: nessun dettaglio nel title');

  /* createImageBitmap che restituisce un bitmap vuoto: si ripiega su <img> */
  var h4 = loadPage({ state: stateEmery(), bitmap: 'zero', imgW: 500, imgH: 500 });
  h4.chooseFile('vuota.jpg');
  eq(h4.G.editorOpen, true, 'bitmap vuoto: fallback <img>');
  eq(h4.txt('editName'), 'vuota.jpg', 'D115 bitmap vuoto: fallback <img>, nome nell\'editor');
  eq(attrOf(h4.el('editName'), 'title'), 'vuota.jpg · 500×500 px',
     'D115 bitmap vuoto: dimensioni dal fallback, nel title');

  /* createImageBitmap che lancia subito */
  var h5 = loadPage({ state: stateEmery(), bitmap: 'throw' });
  h5.chooseFile('boom.jpg');
  eq(h5.G.editorOpen, true, 'createImageBitmap che lancia: fallback <img>');

  /* miniatura: JPEG troppo lunga a 0,7 e 0,5, buona a 0,3 */
  var h6 = loadPage({ state: stateEmery(), toDataURL: function (type, q) {
    return 'data:image/jpeg;base64,' + rep('A', q > 0.4 ? 7000 : 1000);
  } });
  h6.chooseFile('grossa.jpg');
  h6.timers.run();
  h6.click('addOk');
  eq(h6.G.added[0].thumb.length, 23 + 1000, 'miniatura: si scende di qualita\' finche\' entra nei 6.000 caratteri');
  eqJson(h6.env.dataUrls.map(function (d) { return d[1]; }), [0.7, 0.5, 0.3], 'miniatura: qualita\' 0,7 poi 0,5 poi 0,3');

  /* browser senza JPEG: PNG troppo lunga = niente miniatura */
  var h7 = loadPage({ state: stateEmery(), toDataURL: function () {
    return 'data:image/png;base64,' + rep('A', 7000);
  } });
  h7.chooseFile('png.jpg');
  h7.timers.run();
  h7.click('addOk');
  eq(h7.G.added[0].thumb, undefined, 'PNG oltre i 6.000 caratteri: miniatura omessa');
  eq(h7.G.tiles[h7.G.tiles.length - 1].thumb, null, 'tessera senza miniatura');
  check(!('thumb' in h7.G.buildPayload().photos[0]), 'payload: nessuna chiave thumb');

  /* browser che dà un PNG corto: si tiene */
  var h8 = loadPage({ state: stateEmery(), toDataURL: function () { return 'data:image/png;base64,AAAA'; } });
  h8.chooseFile('png2.jpg');
  h8.timers.run();
  h8.click('addOk');
  eq(h8.G.added[0].thumb, 'data:image/png;base64,AAAA', 'PNG corto: miniatura tenuta');

  /* GalPage.addFile(null) dal gate: createImageBitmap rifiuta e createObjectURL lancia TypeError
   * (WHATWG): niente eccezione fuori dalla pagina, messaggio in #msg, editor chiuso */
  var h9 = loadPage({ state: stateEmery(), bitmap: 'reject' }), threw9 = false;
  h9.sb.URL.createObjectURL = function () { throw new TypeError('Argument 1 is not valid for any of the 1-argument overloads'); };
  try { h9.G.addFile(null); } catch (e) { threw9 = true; }
  eq(threw9, false, 'addFile(null): nessuna eccezione fuori dalla pagina');
  eq(h9.G.editorOpen, false, 'addFile(null): editor chiuso');
  eq(h9.disp('editor'), 'none', 'addFile(null): editor nascosto');
  contains(h9.txt('msg'), Tpre('msg_read_fail'), 'addFile(null): messaggio');
  eq(h9.el('msg').className, 'err', 'addFile(null): messaggio in rosso');
  eq(h9.el('save').disabled, false, 'addFile(null): Salva resta attivo');

  /* dev server che non risponde piu' (processo fermato a meta' invio): timer di guardia, Salva torna attivo */
  var h10 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h10.click('save');
  eq(h10.el('save').disabled, true, 'timeout: durante l\'invio Salva e\' disabilitato');
  check(h10.timers.q.length === 1 && h10.timers.q[0].ms >= 10000 && h10.timers.q[0].ms <= 120000,
        'timeout: un timer di guardia fra 10 e 120 s in coda (' + (h10.timers.q[0] && h10.timers.q[0].ms) + ')');
  h10.timers.run();
  contains(h10.txt('msg'), EN_DEV.saveFail, 'timeout: messaggio di errore (D72)');
  contains(h10.txt('msg'), EN_DEV.noReply, 'timeout: dice che il server non ha risposto (D72)');
  eq(h10.el('msg').className, 'err', 'timeout: messaggio in rosso');
  eq(h10.el('save').disabled, false, 'timeout: Salva riattivato');
  eq(h10.navs.length, 0, 'timeout: nessuna navigazione');
  h10.net.flush();
  eq(h10.navs.length, 0, 'risposta arrivata dopo il timeout: ignorata (non si naviga due volte)');
  h10.click('save');
  eq(h10.net.posts.length, 2, 'dopo il timeout si puo\' riprovare');
  h10.net.flush();
  eq(h10.navs.length, 1, 'secondo tentativo: salvato e navigato');
  eq(h10.timers.q.length, 0, 'risposta arrivata: timer di guardia cancellato');
});

section('2n. flint (fmt 2): rettangolo, Atkinson, raw1', function () {
  var s = mkState({ platform: 'flint', fmt: 2, settingsSet: true, cap_kb: 900 });
  s.photos[0] = photo('bn.jpg', 2, 555);
  s.order = [0];
  var h = loadPage({ state: s, search: DEV_SEARCH }), G = h.G, ed = G.editor;
  eq(G.state.fmt, 2, 'fmt 2');
  eq(G.tiles[0].hasFmt, true, 'la foto ha il formato flint');
  h.chooseFile('bn2.jpg');
  eq(ed.w, 144, 'flint: larghezza di destinazione 144');
  eq(ed.h, 168, 'flint: altezza 168');
  eq(h.el('preview').width, 288, 'flint: anteprima 288 px');
  eq(h.el('preview').height, 336, 'flint: anteprima 336 px');
  eq(h.el('crop').width, 300, 'flint: la cornice resta 200:228');
  eq(h.el('crop').height, 342, 'flint: altezza della cornice');
  var r = P.flintRect({ x: 0, y: 0, w: 300, h: 342 });
  var calls = h.el('crop')._calls.join('|');
  contains(calls, 'strokeRect ' + [r.x + 1, r.y + 1, r.w - 2, r.h - 2].join(','),
           'flint: rettangolo 144:168 tratteggiato sulla cornice');
  contains(calls, 'setLineDash 6,4', 'flint: tratteggio');
  h.timers.run();
  eq(ed.last.crc, expectFlint({ gamma: 1, lift: 0, dither: 'fs' }).crc, 'flint: encodeFlint sugli stessi pixel');
  eqJson(ed.crop, P.flintRect(P.cropRect(ed.sw, ed.sh, [Math.round(-ed.tx / ed.scale), Math.round(-ed.ty / ed.scale),
                                                        Math.round(ed.Fw / ed.scale), Math.round(ed.Fh / ed.scale)])),
         'flint: si ritaglia il sotto-rettangolo 144:168 dentro la cornice');
  check(Math.abs(ed.crop.w / ed.crop.h - 144 / 168) < 0.01, 'flint: ritaglio in rapporto 144:168');
  eq(h.el('preview')._put.w, 288, 'flint: anteprima disegnata a 288 px');
  h.select('dither', 'atkinson');
  h.timers.run();
  eq(ed.last.crc, expectFlint({ gamma: 1, lift: 0, dither: 'atkinson' }).crc, 'flint: Atkinson');
  h.click('addOk');
  var a = G.added[0];
  eq(a.fmt, 2, 'flint: fmt 2 nel payload');
  eq(a.len, 3024, 'flint: len raw1');
  eq(a.data.length, 4032, 'flint: 4.032 caratteri base64url');
  eq(a.crc, expectFlint({ gamma: 1, lift: 0, dither: 'atkinson' }).crc, 'flint: crc del raw1');
  eq(a.data, P.b64url(expectFlint({ gamma: 1, lift: 0, dither: 'atkinson' }).raw), 'flint: data = base64url del raw1');
  eq(a.slot, 1, 'flint: slot libero');
  eq(h.kbNum() < 10, true, 'flint: il payload sta in pochi KB (' + h.txt('kb') + ')');
  h.click('save');
  eq(JSON.parse(h.net.posts[0].body).photos[0].fmt, 2, 'flint: il POST porta il formato 2');
});

section('2o. robustezza: performance assente, doppia apertura dell\'editor, addFile due volte', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH, noPerformance: true });
  eq(h.txt('msg'), '', 'senza performance.now la pagina si avvia');
  h.chooseFile('uno.jpg');
  h.timers.run();
  check(typeof h.G.timing.encodeMs === 'number', 'tempi misurati anche con Date');
  var kbBefore = h.kbNum();
  h.click('del_5'); h.click('del_5');            /* tessere vive con l'editor aperto; D110: due tocchi */
  eqJson(h.G.deleted, [5], 'si puo\' eliminare una tessera con l\'editor aperto');
  /* UX-3 (D107): con l'editor aperto Salva non e' piu' spento — e' «Usa questa foto», e resta
   * acceso anche dopo un ricalcolo dei KB (updateKb richiama footerButtons). */
  eq(h.el('save').disabled, false, 'D107 Salva resta acceso con l\'editor aperto');
  eq(h.txt('save'), Tit('btn_add_ok'), 'D107 ...e dice ancora «Usa questa foto»');
  eq(h.kbNum(), kbBefore, 'contatore KB ricalcolato');
  h.chooseFile('due.jpg');                       /* seconda apertura senza chiudere la prima */
  eq(h.G.editorOpen, true, 'seconda apertura: editor ancora aperto');
  eq(h.txt('editName'), 'due.jpg', 'seconda apertura: la nuova foto sostituisce la vecchia');
  eq(attrOf(h.el('editName'), 'title'), 'due.jpg · 640×480 px', 'seconda apertura: il title porta le misure nuove');
  eq(h.env.closed, 1, 'seconda apertura: il primo ImageBitmap e\' stato chiuso');
  h.timers.run();
  h.click('addOk');
  eq(h.G.added.length, 1, 'una sola foto aggiunta');
  eq(h.G.added[0].name, 'due.jpg', 'la foto aggiunta e\' la seconda');
  eq(h.G.flush(), false, 'flush senza lavoro in coda: false');
  eq(h.click('addOk'), true, 'clic su "Aggiungi" con l\'editor chiuso: nessun effetto');
  eq(h.G.added.length, 1, 'nessuna foto doppia');
});

section('2p. robustezza: stato ostile, nomi strani, immagini estreme, XHR assente', function () {
  /* piu' di 12 foto nello stato: si leggono solo i 12 slot */
  var s = mkState({ settingsSet: true }), k;
  for (k = 0; k < 20; k++) { s.photos[k] = photo('f' + k + '.jpg', 1, k + 1); }
  s.order = [19, 18, 0];
  var h = loadPage({ state: s });
  eq(h.G.tiles.length, 12, 'stato con 20 foto: solo 12 tessere');
  eqJson(slotsOf(h.G.tiles), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'stato con 20 foto: gli slot 0..11');

  /* miniatura troppo lunga nello stato: scartata (non finisce nel DOM) */
  var s2 = mkState({ settingsSet: true });
  s2.photos[0] = photo('a.jpg', 1, 1, 'data:image/jpeg;base64,' + rep('A', 6000));
  s2.order = [0];
  var h2 = loadPage({ state: s2 });
  eq(h2.G.tiles[0].thumb, null, 'miniatura oltre i 6.000 caratteri: scartata');
  eq(h2.el('tile_0').children[0].className, 'thumb empty', 'senza miniatura: riquadro grigio');

  /* nome ostile: solo testo, nessun HTML (page.js usa textContent) */
  var h3 = loadPage({ state: mkState({ settingsSet: true }), search: '', protocol: 'data:' });
  h3.chooseFile('a"</script><b>&.jpg');
  h3.timers.run();
  h3.click('addOk');
  eq(h3.G.added[0].name, 'a"</script><b>&.jpg', 'nome con virgolette e tag: conservato tale e quale');
  contains(h3.txt('tile_' + h3.G.added[0].slot), '</script>', 'nome ostile: mostrato come testo');
  notContains(SRC['page.js'], 'innerHTML', 'page.js: mai innerHTML (niente iniezione dal nome del file)');
  h3.click('save');
  var back = JSON.parse(decodeURIComponent(h3.navs[0].slice('pebblejs://close#'.length)));
  eq(back.photos[0].name, 'a"</script><b>&.jpg', 'nome ostile: sopravvive al giro nell\'URL pebblejs://');

  /* immagine minuscola: ingrandita, il formato resta quello dell\'orologio */
  var h4 = loadPage({ state: mkState({ settingsSet: true }), imgW: 120, imgH: 100 });
  h4.chooseFile('mini.jpg');
  h4.timers.run();
  h4.click('addOk');
  eq(h4.G.added[0].len, 34200, 'immagine 120×100: comunque un raw6 intero');
  check(h4.G.editor.cover > 1, 'immagine piccola: cover > 1 (si ingrandisce)');

  /* immagine da 12 MP: il ritaglio ha il rapporto giusto */
  var h5 = loadPage({ state: mkState({ settingsSet: true }), imgW: 4000, imgH: 3000 });
  h5.chooseFile('12mp.jpg');
  h5.timers.run();
  var cr = h5.G.editor.crop;
  eq(cr.h, 3000, '12 MP: il ritaglio prende tutta l\'altezza');
  check(Math.abs(cr.w / cr.h - 200 / 228) < 0.01, '12 MP: ritaglio in rapporto 200:228');
  check(h5.el('preview')._put.w === 400, '12 MP: anteprima comunque 400 px');

  /* XMLHttpRequest assente: messaggio, nessuna pagina bianca */
  var h6 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h6.sb.XMLHttpRequest = undefined;
  h6.click('save');
  eq(h6.txt('msg'), Tit('msg_err'), 'XHR assente: messaggio d\'errore (D72: msg_err unico)');
  eq(h6.el('msg').className, 'err', 'XHR assente: messaggio in rosso');
  eq(h6.navs.length, 0, 'XHR assente: nessuna navigazione');

  /* return_to malformato: si naviga comunque a qualcosa, senza eccezioni */
  var h7 = loadPage({ state: stateEmery(), search: '?return_to=%zz/close?' });
  eq(h7.G.mode(), 'dev', 'return_to malformato: sempre modalita\' dev');
  h7.click('cancel');
  eqJson(h7.navs, ['%zz/close?'], 'return_to malformato: usato cosi\' com\'e\'');

  /* piu' foto nuove in un solo invio */
  var h8 = loadPage({ state: mkState({ settingsSet: true }), search: DEV_SEARCH });
  for (k = 0; k < 3; k++) { h8.chooseFile('m' + k + '.jpg'); h8.timers.run(); h8.click('addOk'); }
  eq(h8.G.added.length, 3, 'tre foto nuove');
  eqJson(slotsOf(h8.G.tiles), [0, 1, 2], 'tre slot consecutivi');
  eq(h8.el('save').disabled, false, '3 foto (135 KB) stanno sotto i 900 KB');
  h8.click('save');
  var body = JSON.parse(h8.net.posts[0].body);
  eq(body.photos.length, 3, 'POST: tre foto');
  eqJson(body.order, [0, 1, 2], 'POST: order delle tre');
  eqJson(body.photos.map(function (p) { return p.slot; }), [0, 1, 2], 'POST: uno slot per foto, senza duplicati');
});


/* ===================================== 3. revisione S6: un caso per finding (A6) ========= */

section('3a. #1 stato non ricevuto: Salva disabilitato, nessun payload autorevole', function () {
  var h = loadPage({ hash: '', search: DEV_SEARCH });
  eq(h.G.state.ok, false, '#1 hash assente: stato non valido');
  eq(h.G.mode(), 'dev', '#1 dev: c\'e\' return_to');
  eq(h.el('save').disabled, true, '#1 dev senza stato: Salva disabilitato');
  contains(h.txt('status'), 'Settings not received', '#1 avviso: riga inglese cablata (D83)');
  eq(h.click('save'), false, '#1 il clic su Salva non parte');
  eq(h.net.posts.length, 0, '#1 nessun POST');
  eq(h.navs.length, 0, '#1 nessuna navigazione');
  h.chooseFile('prova.jpg'); h.timers.run(); h.click('addOk');   /* l'editor resta usabile */
  eq(h.G.added.length, 1, '#1 modalita\' prova: l\'editor aggiunge la foto');
  eq(h.el('save').disabled, true, '#1 dopo l\'aggiunta Salva resta disabilitato');
  h.select('s_font', '1');
  eq(h.el('save').disabled, true, '#1 dopo un cambio di impostazione Salva resta disabilitato');
  h.el('save').disabled = false;                             /* pulsante riabilitato a mano: save() rifiuta lo stesso */
  h.click('save');
  eq(h.net.posts.length, 0, '#1 save() forzato: nessun POST');
  /* D83: msg_no_state_save e' uscita dal dizionario — senza stato non c'e' dizionario da cui
   * prenderla. Il messaggio e' inglese cablato e il dettaglio tecnico sta nel title (U-14). */
  contains(h.txt('msg'), 'Settings not received', '#1 save() forzato: messaggio inglese cablato (D83)');
  eq(h.el('msg').title, h.G.state.error, '#1 save() forzato: il dettaglio tecnico sta nel title');
  eq(h.el('msg').className, 'err', '#1 messaggio in rosso');
  eq(h.G.lastPayload, null, '#1 nessun payload costruito');
  var h2 = loadPage({ hash: '#!!!', search: '', protocol: 'data:' });
  eq(h2.G.mode(), 'phone', '#1 telefono con hash rotto');
  eq(h2.el('save').disabled, true, '#1 telefono senza stato: Salva disabilitato');
  h2.el('save').disabled = false; h2.click('save');
  eq(h2.navs.length, 0, '#1 telefono: nessun pebblejs://close con payload');
  eq(h2.el('cancel').disabled, false, '#1 Esci resta attivo');
  h2.click('cancel');
  eqJson(h2.navs, ['pebblejs://close#'], '#1 telefono: Esci chiude senza payload');
  var h3 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  eq(h3.el('save').disabled, false, '#1 controprova: con lo stato Salva e\' attivo');
  h3.click('save');
  eq(h3.net.posts.length, 1, '#1 controprova: il POST parte');
});

section('3b. #3 truncateName: mai un surrogato alto spaiato in coda', function () {
  var base63 = rep('a', 63), n1 = base63 + '😀.jpg';   /* l'emoji e' a cavallo dell'indice 64 */
  var t = C.truncateName(n1);
  eq(t.length, 63, '#3 63 + emoji: il surrogato alto spaiato viene scartato');
  eq(t, base63, '#3 risultato = i 63 caratteri interi');
  check(!/[\uD800-\uDBFF]$/.test(t), '#3 nessun surrogato alto in coda');
  eq(C.truncateName(rep('a', 62) + '😀.jpg'), rep('a', 62) + '😀', '#3 62 + emoji: la coppia intera resta (64 code unit)');
  eq(C.truncateName(rep('a', 64) + '😀'), rep('a', 64), '#3 64 ASCII + emoji: 64');
  eq(C.truncateName('ab'), 'ab', '#3 corto invariato');
  eq(C.truncateName('a\uD83D'), 'a', '#3 surrogato alto spaiato gia\' in coda: scartato anche sotto i 64');
  eq(C.truncateName('😀'), '😀', '#3 una sola emoji: intera');
  eq(C.truncateName('a\uDE00'), 'a\uDE00', '#3 surrogato basso in coda: non e\' il caso del taglio, invariato');
  eq(C.truncateName(''), '', '#3 vuoto');
  notContains(JSON.stringify(C.truncateName(n1)), '\\ud83d', '#3 JSON senza \\ud83d spaiato');
  var s = mkState({ settingsSet: true });
  s.photos[0] = photo(n1, 1, 1);
  s.order = [0];
  eq(C.decodeState(hashOf(s)).photos[0].name, base63, '#3 nome dallo stato (normPhoto): troncato senza surrogato spaiato');
  var h = loadPage({ state: s, search: '', protocol: 'data:' });
  eq(h.G.tiles[0].name, base63, '#3 tessera dallo stato: nome pulito');
  h.chooseFile(n1); h.timers.run(); h.click('addOk');
  eq(h.G.added[0].name, base63, '#3 foto nuova: nome pulito');
  h.click('save');
  var back = JSON.parse(decodeURIComponent(h.navs[0].slice('pebblejs://close#'.length)));
  eq(back.photos[0].name, base63, '#3 telefono: il nome sopravvive intero al giro pebblejs://close');
  check(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(JSON.stringify(h.G.lastPayload)), '#3 payload: nessun surrogato alto spaiato');
});

section('3c. #4 cap_kb su iOS: la pagina scende a 200 KB (capForUa)', function () {
  var IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  var AND = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  var MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  eq(typeof C.capForUa, 'function', '#4 GalPageCore.capForUa esiste');
  eq(C.capForUa(900, IOS), 200, '#4 iPhone: 900 -> 200');
  eq(C.capForUa(900, 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)'), 200, '#4 iPad: 200');
  eq(C.capForUa(900, 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0)'), 200, '#4 iPod: 200');
  eq(C.capForUa(900, AND), 900, '#4 Android: invariato');
  eq(C.capForUa(60, IOS), 60, '#4 iOS con tetto gia\' piu\' basso (gate): min(60, 200) = 60');
  eq(C.capForUa(900, MAC, { platform: 'MacIntel', maxTouchPoints: 5 }), 200, '#4 iPadOS "desktop" (MacIntel + touch): 200');
  eq(C.capForUa(900, MAC, { platform: 'MacIntel', maxTouchPoints: 0 }), 900, '#4 Mac vero (senza touch): 900');
  eq(C.capForUa(900, MAC, { platform: 'MacIntel' }), 900, '#4 MacIntel senza maxTouchPoints: 900');
  eq(C.capForUa(900, undefined, undefined), 900, '#4 senza navigator: invariato');
  eq(C.capForUa(900, null, null), 900, '#4 null: invariato');
  eq(C.capForUa(0, IOS), 200, '#4 cap non valido: 900 poi 200 su iOS');
  eq(C.capForUa('x', AND), 900, '#4 cap non numerico: 900');
  var h = loadPage({ state: stateEmery({ cap_kb: 900 }), search: '', protocol: 'data:',
                     navigator: { userAgent: IOS, platform: 'iPhone', maxTouchPoints: 5 } });
  eq(h.G.state.cap_kb, 200, '#4 pagina su iPhone con cap_kb 900 dal PKJS: 200');
  check(Trx('kb_line', '\\d+', '200', true).test(h.txt('kb')), '#4 contatore con il tetto iOS: "' + h.txt('kb') + '"');
  var h2 = loadPage({ state: stateEmery({ cap_kb: 900 }), navigator: { userAgent: AND, platform: 'Linux armv8l', maxTouchPoints: 5 } });
  eq(h2.G.state.cap_kb, 900, '#4 pagina su Android: 900');
  eq(loadPage({ state: stateEmery({ cap_kb: 900 }) }).G.state.cap_kb, 900, '#4 senza navigator (test): 900');
  eq(loadPage({ hash: '', navigator: { userAgent: IOS } }).G.state.cap_kb, 200, '#4 anche senza stato: 200 su iOS');
  /* D117: dalla quarta foto in poi la pagina spegne #file (la PROSSIMA sforerebbe i 200 KB):
   * per arrivare davvero al tetto si passa da GalPage.addFile, come fa il gate. */
  for (var k = 0; k < 5; k++) { pickFile(h, 'i' + k + '.jpg'); h.timers.run(); h.click('addOk'); }
  eq(h.G.overCap, true, '#4 iPhone: 5 foto (~225 KB) sopra il tetto');
  eq(h.el('save').disabled, true, '#4 iPhone: Salva disabilitato');
  check(Trx('cap_over', '\\d+', '200').test(h.txt('msg')), '#4 messaggio del tetto con 200: "' + h.txt('msg') + '"');
});

section('3d. #6 estranee sempre in coda, senza frecce, riordino rifiutato', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), G = h.G, l;   /* tessere [3, 0, 5, 9*] */
  eqJson(kindsOf(G.tiles), ['album', 'album', 'album', 'foreign'], '#6 estranea in coda all\'avvio');
  eq(h.el('up_9').disabled, true, '#6 estranea: freccia su disabilitata');
  eq(h.el('down_9').disabled, true, '#6 estranea: freccia giu\' disabilitata');
  eq(h.el('del_9').disabled, false, '#6 estranea: si puo\' eliminare');
  eq(h.el('down_5').disabled, true, '#6 ultima foto dell\'album: giu\' disabilitata (sotto c\'e\' solo l\'estranea)');
  eq(h.el('up_5').disabled, false, '#6 ultima foto dell\'album: su attiva');
  contains(h.txt('tile_9'), Tit('badge_foreign'), '#6 badge che lo dice');
  eq(fire(h.el('down_5'), 'click'), false, '#6 il clic su giu\' non parte');
  eqJson(slotsOf(G.tiles), [3, 0, 5, 9], '#6 ordine invariato');
  l = h.el('down_5')._l.click[0]; l.call(h.el('down_5'), {});   /* listener chiamato a mano: moveTile rifiuta */
  eqJson(slotsOf(G.tiles), [3, 0, 5, 9], '#6 moveTile rifiuta lo scambio con un\'estranea');
  l = h.el('up_9')._l.click[0]; l.call(h.el('up_9'), {});
  eqJson(slotsOf(G.tiles), [3, 0, 5, 9], '#6 moveTile rifiuta di spostare un\'estranea');
  h.chooseFile('n.jpg'); h.timers.run(); h.click('addOk');
  eqJson(slotsOf(G.tiles), [3, 0, 5, 1, 9], '#6 la nuova va prima dell\'estranea');
  eq(h.el('down_1').disabled, true, '#6 la nuova e\' l\'ultima spostabile');
  eq(h.el('up_1').disabled, false, '#6 la nuova puo\' salire');
  eq(h.el('down_5').disabled, false, '#6 la 5 ora puo\' scendere (sotto c\'e\' la nuova)');
  h.click('up_1');
  eqJson(slotsOf(G.tiles), [3, 0, 1, 5, 9], '#6 la nuova sale sopra la 5');
  eqJson(G.buildPayload().order, [3, 0, 1, 5, 9], '#6 payload: estranea in coda');
  var s = stateEmery(); s.watch.foreign = [9, 11, 10];
  var h2 = loadPage({ state: s, search: DEV_SEARCH });
  eqJson(slotsOf(h2.G.tiles), [3, 0, 5, 9, 11, 10], '#6 tre estranee in coda');
  check([9, 11, 10].every(function (k) { return h2.el('up_' + k).disabled && h2.el('down_' + k).disabled; }), '#6 tutte senza frecce');
  h2.click('del_11'); h2.click('del_11');
  eqJson(slotsOf(h2.G.tiles), [3, 0, 5, 9, 10], '#6 eliminata una: le altre restano in coda');
  h2.chooseFile('x.jpg'); h2.timers.run(); h2.click('addOk');
  eqJson(slotsOf(h2.G.tiles), [3, 0, 5, 1, 9, 10], '#6 nuova prima delle estranee');
  h2.chooseFile('y.jpg'); h2.timers.run(); h2.click('addOk');
  eqJson(slotsOf(h2.G.tiles), [3, 0, 5, 1, 2, 9, 10], '#6 seconda nuova dopo la prima, prima delle estranee');
  eqJson(JSON.parse(JSON.stringify(h2.G.buildPayload().order)), [3, 0, 5, 1, 2, 9, 10], '#6 payload con tre nuove/album e due estranee in coda');
  var s3 = stateEmery(); s3.watch.foreign = [];
  var h3 = loadPage({ state: s3, search: DEV_SEARCH });
  eq(h3.el('down_5').disabled, true, '#6 senza estranee: l\'ultima ha giu\' disabilitata');
  h3.chooseFile('y.jpg'); h3.timers.run(); h3.click('addOk');
  eq(h3.el('down_5').disabled, false, '#6 senza estranee: dopo la nuova la 5 puo\' scendere');
  h3.click('down_5');
  eqJson(slotsOf(h3.G.tiles), [3, 0, 1, 5], '#6 senza estranee: scambio normale');
});

section('3e. #10 pulsanti delle tessere >= 40 px, gap 8 px, messaggio dopo l\'eliminazione', function () {
  var css = PAGE_CSS.replace(/\s+/g, ' ');
  var tb = /\.tbtns button \{([^}]*)\}/.exec(css), tg = /\.tbtns \{([^}]*)\}/.exec(css), sm = /\.btn\.small \{([^}]*)\}/.exec(css);
  var bt = /\.btn \{([^}]*)\}/.exec(css);
  var ey = /\.eye \{([^}]*)\}/.exec(css);
  check(tb && /min-height: ?40px/.test(tb[1]), '#10 .tbtns button min-height 40px');
  check(tg && /gap: ?8px/.test(tg[1]), '#10 .tbtns gap 8px');
  check(bt && /min-height: ?40px/.test(bt[1]), '#10 .btn min-height 40px');
  /* S12 (ru): anche l'occhio dell'anteprima e' un pulsante della tessera, niente deroghe a #10 */
  check(ey && /min-height: ?40px/.test(ey[1]), '#10 .eye min-height 40px (occhio dell\'anteprima)');
  check(ey && /width: ?40px/.test(ey[1]) && /height: ?40px/.test(ey[1]), '#10 .eye 40x40 px');
  check(sm && !/min-height|line-height/.test(sm[1]), '#10 .btn.small non abbassa i 40 px di .btn');
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), slot;
  h.click('del_0'); h.click('del_0');             /* D110: due tocchi */
  eq(h.txt('msg'), Tit('msg_removed'), '#10 eliminazione: messaggio');
  h.click('del_9'); h.click('del_9');
  eq(h.txt('msg'), Tit('msg_removed'), '#10 anche per un\'estranea');
  h.chooseFile('n.jpg'); h.timers.run(); h.click('addOk');
  slot = h.G.added[0].slot;
  h.click('del_' + slot); h.click('del_' + slot);
  eq(h.txt('msg'), Tit('msg_new_dropped'), '#10 tessera nuova eliminata: messaggio diverso');
  notContains(h.txt('msg'), Tit('msg_removed'), '#10 ...e non e\' quello delle foto gia\' salvate');
  /* U-01: msg_new_dropped non nomina piu' lo slot. Che torni libero si guarda dove il fatto vive
   * davvero — le tessere e la coda delle foto nuove — non nel testo del messaggio. */
  eq(idxOfSlot(h.G.tiles, slot), -1, '#10 la tessera nuova sparisce dall\'elenco');
  eq(h.G.added.length, 0, '#10 lo slot torna libero: nessuna foto nuova in coda');
  var h2 = loadPage({ state: stateEmery({ cap_kb: 60 }), search: DEV_SEARCH });
  h2.chooseFile('a.jpg'); h2.timers.run(); h2.click('addOk');
  /* D117: con la prima foto dentro, la seconda sforerebbe i 60 KB e #file e' gia' spento */
  pickFile(h2, 'b.jpg'); h2.timers.run(); h2.click('addOk');
  eq(h2.G.overCap, true, '#10 due foto su 60 KB: sopra il tetto');
  h2.click('del_0'); h2.click('del_0');
  contains(h2.txt('msg'), Tpre('cap_over'), '#10 sopra il tetto resta il messaggio del tetto');
});

section('3f. #12 due file in rapida successione: vale solo l\'ultimo, l\'altro bitmap si chiude', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH, bitmap: 'defer' }), G = h.G, env = h.env;
  h.chooseFile('A.jpg');
  h.chooseFile('B.jpg');
  eq(env.deferred.length, 2, '#12 due decodifiche in corso');
  eq(G.editorOpen, false, '#12 nessun editor finche\' non arriva nulla');
  var a = env.deferred[0].res(640, 480);                    /* A arriva per prima: e' superata */
  eq(G.editorOpen, false, '#12 A (superata) non apre l\'editor');
  eq(a.closed, true, '#12 il bitmap di A viene chiuso');
  eq(env.closed, 1, '#12 un solo close()');
  var b = env.deferred[1].res(800, 600);
  eq(G.editorOpen, true, '#12 B apre l\'editor');
  eq(h.txt('editName'), 'B.jpg', '#12 nome di B nell\'editor (D115)');
  eq(attrOf(h.el('editName'), 'title'), 'B.jpg · 800×600 px', '#12 e le dimensioni di B nel title');
  eq(G.editor.src, b, '#12 sorgente = bitmap di B');
  h.timers.run(); h.click('addOk');
  eq(G.added.length, 1, '#12 una sola foto');
  eq(G.added[0].name, 'B.jpg', '#12 la foto aggiunta e\' B (non A con il nome di B)');
  eq(b.closed, true, '#12 B chiuso dopo l\'aggiunta');

  var h2 = loadPage({ state: stateEmery(), search: DEV_SEARCH, bitmap: 'defer' }), env2 = h2.env;
  h2.chooseFile('A.jpg'); h2.chooseFile('B.jpg');
  var b2 = env2.deferred[1].res(800, 600);                  /* ordine inverso: B prima di A */
  eq(h2.G.editorOpen, true, '#12 inverso: B apre l\'editor');
  var a2 = env2.deferred[0].res(640, 480);
  eq(h2.txt('editName'), 'B.jpg', '#12 inverso: A in ritardo non sostituisce B');
  eq(attrOf(h2.el('editName'), 'title'), 'B.jpg · 800×600 px', '#12 inverso: e nemmeno le sue misure');
  eq(a2.closed, true, '#12 inverso: A chiusa');
  eq(b2.closed, false, '#12 inverso: B ancora aperta');
  eq(h2.G.editor.src, b2, '#12 inverso: sorgente ancora B');
  eq(h2.G.editorOpen, true, '#12 inverso: editor ancora aperto');

  var h3 = loadPage({ state: stateEmery(), search: DEV_SEARCH, bitmap: 'defer', imgFail: true }), env3 = h3.env;
  h3.chooseFile('A.jpg'); h3.chooseFile('B.jpg');
  env3.deferred[0].rej();                                   /* A rotta (anche il fallback <img> fallisce) */
  notContains(h3.txt('msg'), Tpre('msg_read_fail'), '#12 errore di una scelta superata: nessun messaggio');
  env3.deferred[1].res();
  eq(h3.G.editorOpen, true, '#12 B si apre lo stesso');

  var h4 = loadPage({ state: stateEmery(), search: DEV_SEARCH, bitmap: 'defer' }), env4 = h4.env;
  h4.chooseFile('A.jpg'); env4.deferred[0].res();
  eq(h4.G.editorOpen, true, '#12 A aperta');
  h4.chooseFile('B.jpg');
  eq(env4.closed, 1, '#12 scelta B con A aperta: A chiusa subito');
  eq(h4.G.editorOpen, false, '#12 in attesa di B l\'editor e\' chiuso');
  env4.deferred[1].res();
  eq(h4.G.editorOpen, true, '#12 B aperta');
  eq(env4.closed, 1, '#12 nessun close doppio');
  h4.click('addCancel');
  eq(env4.closed, 2, '#12 Annulla ritaglio chiude B');
});

section('3g. #20 etichette distinte, il footer che cambia parola, uscita in due tocchi', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  eq(h.txt('addCancel'), Tit('btn_add_cancel'), '#20 editor: btn_add_cancel');
  eq(h.txt('cancel'), Tit('btn_close'), 'D107 pagina pulita: il footer dice «Chiudi»');
  eq(h.el('cancel').disabled, false, '#20 all\'avvio Esci e\' attivo');
  h.chooseFile('a.jpg');
  /* UX-3 (D107): con l'editor aperto il footer non si spegne piu' — prende le due parole
   * dell'editor, cosi' i pulsanti fissi in fondo valgono anche per il ritaglio (U-07). */
  eq(h.el('cancel').disabled, false, 'D107 editor aperto: Esci resta premibile');
  eq(h.el('save').disabled, false, 'D107 editor aperto: anche Salva');
  eq(h.txt('save'), Tit('btn_add_ok'), 'D107 editor aperto: Salva dice «Usa questa foto»');
  eq(h.txt('cancel'), Tit('btn_add_cancel'), 'D107 editor aperto: Esci dice «Non aggiungere»');
  notContains(h.el('cancel').className, 'danger', 'D107 editor aperto: e non e\' rosso');
  h.env.scrolls.length = 0;
  eq(h.click('cancel'), true, 'D107 editor aperto: il clic su Esci parte');
  eq(h.G.editorOpen, false, 'D107 ...e chiude l\'editor invece di uscire dalla pagina');
  eq(h.txt('msg'), Tit('msg_crop_cancel'), 'D107 ...con il messaggio di «Non aggiungere»');
  eq(h.navs.length, 0, '#20 nessuna navigazione');
  eq(h.env.scrolls.length, 1, 'D118 ...e si torna in vista su «Aggiungi foto»');
  eq(h.env.scrolls[0].id, 'add', 'D118 la scroll e\' su #add');
  eq(h.el('cancel').disabled, false, '#20 editor chiuso: Esci riattivato');
  eq(h.txt('cancel'), Tit('btn_close'), 'D107 editor chiuso senza modifiche: torna «Chiudi»');
  h.click('cancel');
  eqJson(h.navs, [DEV_RT], '#20 senza modifiche: esce al primo tocco');

  var h2 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h2.chooseFile('a.jpg'); h2.timers.run(); h2.click('addOk');
  eq(h2.txt('cancel'), Tit('btn_cancel'), 'D107 con una foto aggiunta: «Esci senza salvare»');
  notContains(h2.el('cancel').className, 'danger', 'D107 ...ma non ancora rosso');
  h2.click('cancel');
  eq(h2.navs.length, 0, '#20 foto aggiunta: il primo tocco non esce');
  eq(h2.txt('cancel'), Tit('btn_cancel_armed'), 'D107 primo tocco: il pulsante dice «Esci comunque»');
  contains(h2.el('cancel').className, 'danger', 'D107 primo tocco: e diventa rosso (.btn.danger)');
  eq(h2.el('cancel').disabled, false, 'D107 armato ma sempre premibile');
  contains(h2.txt('msg'), Tit('msg_unsaved'), '#20 messaggio del primo tocco');
  eq(h2.el('msg').className, 'warn', '#20 messaggio in giallo');
  h2.click('cancel');
  eqJson(h2.navs, [DEV_RT], '#20 secondo tocco: esce');

  var h3 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h3.click('del_0'); h3.click('del_0');
  h3.click('cancel');
  eq(h3.navs.length, 0, '#20 eliminazione: primo tocco non esce');
  eq(h3.txt('cancel'), Tit('btn_cancel_armed'), 'D107 armato dopo l\'eliminazione');
  h3.select('s_font', '1');
  eq(h3.txt('cancel'), Tit('btn_cancel'), 'D107 un\'altra modifica disarma: torna «Esci senza salvare»');
  notContains(h3.el('cancel').className, 'danger', 'D107 ...e il rosso se ne va');
  h3.click('cancel');
  eq(h3.navs.length, 0, '#20 dopo un\'altra modifica il tocco su Esci torna ad avvisare');
  contains(h3.txt('msg'), Tit('msg_unsaved'), '#20 avviso ripetuto');
  h3.click('cancel');
  eq(h3.navs.length, 1, '#20 poi esce');

  var h4 = loadPage({ state: stateEmery(), search: '', protocol: 'data:' });
  h4.checkbox('s_shake_next', true);
  h4.click('cancel');
  eq(h4.navs.length, 0, '#20 impostazione cambiata: primo tocco non esce');
  h4.checkbox('s_shake_next', false);
  eq(h4.txt('cancel'), Tit('btn_close'), 'D107 impostazioni tornate come prima: il pulsante torna «Chiudi»');
  h4.click('cancel');
  eqJson(h4.navs, ['pebblejs://close#'], '#20 impostazioni tornate come prima: esce subito');

  var h5 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h5.click('down_3');
  h5.click('cancel');
  eq(h5.navs.length, 0, '#20 riordino: primo tocco non esce');
  h5.click('cancel');
  eq(h5.navs.length, 1, '#20 riordino: secondo tocco esce');

  var h6 = loadPage({ state: stateEmery(), search: '', protocol: 'http:' });
  h6.click('del_5'); h6.click('del_5'); h6.click('cancel');
  contains(h6.txt('msg'), Tit('msg_unsaved'), '#20 prova: avviso');
  h6.click('cancel');
  contains(h6.txt('msg'), EN_DEV.testClose, '#20 prova: secondo tocco (D72)');
  /* UX-3 rev (G13): il secondo tocco fa uscire, ma se la pagina NON si chiude — modalita' prova,
   * o una WebView che ignora pebblejs://close# — il footer deve tornare «Esci senza salvare»:
   * senza il footerButtons() del ramo di uscita resterebbe rosso «Esci comunque» con l'arma
   * gia' caduta, e il tocco successivo riarmerebbe invece di uscire. */
  eq(h6.txt('cancel'), Tit('btn_cancel'), 'G13 pagina che non si chiude: Esci torna «Esci senza salvare»');
  notContains(h6.el('cancel').className, 'danger', 'G13 ...e perde il rosso dell\'arma');
  h6.click('cancel');
  contains(h6.txt('msg'), Tit('msg_unsaved'), 'G13 controprova: il tocco dopo riarma da capo');
  check(!/\bconfirm\s*\(/.test(SRC['page.js']), '#20 nessuna finestra di conferma nativa');
});

section('3h. #23 nome accessibile dei pulsanti delle tessere', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), all, ok = true, i, k, b, pos9;
  /* I tre prefissi arrivano dal DIZIONARIO (btn_up/btn_down/btn_delete dentro aria_tile_btn):
   * cablarli qui vorrebbe dire riscrivere il test a ogni ritocco dei verbi (U-01 ha gia' fatto
   * «Elimina» -> «Togli»). Il pin resta: ogni pulsante ha un verbo noto e un nome non vuoto. */
  var pre = [Tit('btn_up'), Tit('btn_down'), Tit('btn_delete')].map(function (v) {
    return Tit('aria_tile_btn', v, '\u0000').split('\u0000')[0];
  }), bad = [];
  eq(h.el('up_3').getAttribute('aria-label'), Tit('aria_tile_btn', Tit('btn_up'), 'mare.jpg'),
     '#23 ▲ con il nome della foto');
  eq(h.el('down_3').getAttribute('aria-label'), Tit('aria_tile_btn', Tit('btn_down'), 'mare.jpg'), '#23 ▼');
  eq(h.el('del_3').getAttribute('aria-label'), Tit('aria_tile_btn', Tit('btn_delete'), 'mare.jpg'), '#23 ✕');
  pos9 = Tit('tile_slot', idxOfSlot(h.G.tiles, 9) + 1);       /* A4 §1: posizione visibile */
  eq(h.el('del_9').getAttribute('aria-label'), Tit('aria_tile_btn', Tit('btn_delete'), pos9),
     '#23 estranea senza nome: nome dalla posizione');
  eq(h.el('up_9').getAttribute('aria-label'), Tit('aria_tile_btn', Tit('btn_up'), pos9),
     '#23 anche i pulsanti disabilitati hanno il nome');
  h.chooseFile('nuova.jpg'); h.timers.run(); h.click('addOk');
  eq(h.el('del_1').getAttribute('aria-label'), Tit('aria_tile_btn', Tit('btn_delete'), 'nuova.jpg'),
     '#23 tessera nuova');
  all = h.el('tiles').children;
  for (i = 0; i < all.length; i++) {
    b = all[i].children[2].children;
    for (k = 0; k < b.length; k++) {
      var lab = b[k].getAttribute('aria-label') || '', good = false, p;
      for (p = 0; p < pre.length; p++) {
        if (lab.length > pre[p].length && lab.slice(0, pre[p].length) === pre[p]) { good = true; }
      }
      if (!good) { ok = false; bad.push(b[k].id + '=' + JSON.stringify(lab)); }
    }
  }
  check(ok && all.length === 5, '#23 ogni pulsante di ogni tessera ha un aria-label' +
        (bad.length ? ' (senza verbo o senza nome: ' + bad.slice(0, 3).join(', ') + ')' : '') +
        (all.length === 5 ? '' : ' (tessere: ' + all.length + ')'));
});

section('3i. #24 etichette-guida con classe rlab; le label delle caselle no', function () {
  var root = parseHtml(PAGE_HTML), rows = [], labels = [], i, lab, forLabels = 0, cbLabels = 0, bad = [], rigaRow, opts;
  function walk(n) {
    var j;
    if (n.className && /\brow\b/.test(n.className)) { rows.push(n); }
    if (n.tagName === 'LABEL') { labels.push(n); }
    for (j = 0; j < n.children.length; j++) { walk(n.children[j]); }
  }
  walk(root);
  check(rows.length >= 15, '#24 righe .row trovate: ' + rows.length);
  for (i = 0; i < labels.length; i++) {
    lab = labels[i];
    if (/\bbtn\b/.test(lab.className)) { continue; }
    if (lab.attrs['for']) { forLabels++; if (!/\brlab\b/.test(lab.className)) { bad.push(lab.attrs['for']); } }
    else { cbLabels++; if (/\brlab\b/.test(lab.className)) { bad.push('checkbox:' + (lab.children[0] && lab.children[0].id)); } }
  }
  eq(bad.join(','), '', '#24 le label con for=… hanno rlab, quelle delle caselle no');
  eq(forLabels, 15, '#24 etichette-guida (label con for=…, S10: +Lingua): ' + forLabels);
  eq(cbLabels, 6, '#24 label delle caselle: ' + cbLabels);
  opts = findById(root, 's_info_row_b0').parentNode.parentNode;
  rigaRow = opts.parentNode;
  eq(rigaRow.children[0].tagName, 'SPAN', '#24 "Riga info:" e\' uno span (non un nodo di testo nudo)');
  contains(rigaRow.children[0].className, 'rlab', '#24 lo span ha la classe rlab');
  check(!!rigaRow.children[0].attrs['data-i18n'], '#24 lo span "Riga info" ha la chiave data-i18n');
  eq(opts.tagName + '.' + opts.className, 'SPAN.opts', '#24 le 4 caselle stanno in uno span.opts (vanno a capo allineate sotto la prima riga)');
  eq(opts.children.length, 4, '#24 quattro caselle nello span.opts');
  check(opts.children.every(function (c) { return c.tagName === 'LABEL' && !/rlab/.test(c.className) && c.children[0].type === 'checkbox'; }), '#24 le 4 caselle della riga info senza rlab');
  eq(findById(root, 's_info_row').parentNode, rigaRow, '#24 il campo nascosto resta nella riga');
  notContains(PAGE_CSS, 'label:first-child', '#24 CSS: niente selettore label:first-child');
  check(/\.row > \.rlab \{[^}]*min-width: ?9\.5em/.test(PAGE_CSS), '#24 CSS: min-width sulla classe rlab');
  check(/\.opts \{[^}]*flex-wrap: ?wrap/.test(PAGE_CSS), '#24 CSS: .opts e\' un flex che va a capo');
  eq(findById(root, 'add').className, 'btn primary', '#24 la label "Aggiungi foto" non e\' una guida (U-04: parte blu)');
});

section('3j. #27 dopo un resample fallito e poi riuscito si salva la codifica nuova', function () {
  var h = loadPage({ state: mkState({ settingsSet: true }), search: DEV_SEARCH, imgW: 800, imgH: 600 }), G = h.G, ed = G.editor, env = h.env;
  var cv = h.el('crop'), crc0, crc1;
  h.chooseFile('r.jpg'); h.timers.run();
  crc0 = expectEmery({ gamma: 1, lift: 0, dither: 'fs', sunlight: false }, 0).crc;
  crc1 = expectEmery({ gamma: 1, lift: 0, dither: 'fs', sunlight: false }, 1).crc;
  check(crc1 !== crc0, '#27 i due seed di pixel danno crc diversi (test sensibile)');
  eq(ed.last.crc, crc0, '#27 prima codifica (seed 0)');
  env.pixelSeed = 1; env.imageDataThrow = 1;                /* il ritaglio cambia, il primo resample fallisce */
  fire(cv, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100, button: 0 });
  fire(cv, 'pointermove', { pointerId: 1, clientX: 80, clientY: 100 });
  fire(cv, 'pointerup', { pointerId: 1 });
  h.timers.run();
  eq(h.txt('msg'), Tit('msg_err'), '#27 resample fallito: messaggio (D72: msg_err unico)');
  eq(ed.last, null, '#27 resample fallito: la codifica precedente non vale piu\'');
  eq(ed.dirtyCrop, true, '#27 il ritaglio resta da rifare');
  h.click('addOk');
  eq(G.added.length, 1, '#27 foto aggiunta');
  eq(G.added[0].crc, crc1, '#27 salvata la codifica del ritaglio NUOVO, non quella precedente');
  var h2 = loadPage({ state: mkState({ settingsSet: true }), search: DEV_SEARCH, imgW: 800, imgH: 600 }), ed2 = h2.G.editor;
  h2.chooseFile('r2.jpg'); h2.timers.run();
  h2.env.pixelSeed = 2; h2.env.imageDataThrow = 1;
  h2.range('zoom', 2); h2.timers.run();
  eq(ed2.last, null, '#27 variante: nessuna codifica dopo il fallimento');
  h2.range('zoom', 2.5); h2.timers.run();
  eq(ed2.last && ed2.last.crc, expectEmery({ gamma: 1, lift: 0, dither: 'fs', sunlight: false }, 2).crc, '#27 variante: il debounce successivo ricodifica');
  h2.select('previewMode', 'nominal');
  eq(h2.el('preview')._put.w, 400, '#27 variante: anteprima ridisegnata');
});

section('3k. #33 return_to: solo http(s) o relativo', function () {
  function page(rt) { return loadPage({ state: stateEmery(), search: '?return_to=' + encodeURIComponent(rt), protocol: 'http:' }); }
  var h = page('javascript:alert(1)');
  eq(h.G.mode(), 'test', '#33 javascript: ignorato -> modalita\' prova');
  h.click('cancel');
  eq(h.navs.length, 0, '#33 javascript: nessuna navigazione da Esci');
  h.click('save');
  eq(h.navs.length, 0, '#33 javascript: Salva non naviga');
  eq(h.net.posts.length, 0, '#33 javascript: nessun POST');
  eq(page('JAVASCRIPT:alert(1)').G.mode(), 'test', '#33 maiuscole');
  eq(page(' \tjava\nscript:alert(1)').G.mode(), 'test', '#33 spazi e caratteri di controllo nello schema');
  eq(page('data:text/html,<script>alert(1)</script>').G.mode(), 'test', '#33 data: ignorato');
  eq(page('vbscript:x').G.mode(), 'test', '#33 vbscript: ignorato');
  eq(page('file:///etc/passwd').G.mode(), 'test', '#33 file: ignorato');
  eq(page('http://127.0.0.1:5555/close?').G.mode(), 'dev', '#33 http: accettato');
  eq(page('https://x/close?').G.mode(), 'dev', '#33 https: accettato');
  eq(page('HTTP://x/close?').G.mode(), 'dev', '#33 HTTP: accettato');
  eq(page('/close?').G.mode(), 'dev', '#33 relativo assoluto accettato');
  eq(page('close?').G.mode(), 'dev', '#33 relativo accettato');
  eq(page('%zz/close?').G.mode(), 'dev', '#33 malformato ma senza schema: accettato (come prima)');
  eq(page('/close?x=javascript:1').G.mode(), 'dev', '#33 "javascript:" nella query di un URL relativo: va bene');
  var h2 = page('https://x/close?');
  h2.click('cancel');
  eqJson(h2.navs, ['https://x/close?'], '#33 https: Esci naviga a return_to');
  var h3 = loadPage({ state: stateEmery(), search: '?return_to=javascript%3Aalert(1)', protocol: 'data:' });
  eq(h3.G.mode(), 'phone', '#33 su data: con return_to javascript: si resta in modalita\' telefono');
  h3.click('cancel');
  eqJson(h3.navs, ['pebblejs://close#'], '#33 telefono: Esci chiude con pebblejs://');
});

section('3l. #35 chiudendo l\'editor i canvas dei dimezzamenti vengono azzerati', function () {
  var h = loadPage({ state: mkState({ settingsSet: true }), search: DEV_SEARCH, imgW: 4000, imgH: 3000 }), G = h.G, sc = G.scratch, disp;
  function zero() { return sc.every(function (c) { return !c || (c.width === 0 && c.height === 0); }); }
  check(sc && sc.length >= 2, '#35 GalPage.scratch esposto');
  h.chooseFile('12mp.jpg'); h.timers.run();
  check(sc.filter(function (c) { return c && c.width * c.height > 0; }).length >= 2,
        '#35 con l\'editor aperto gli scratch sono dimensionati (' + sc.map(function (c) { return c ? c.width + 'x' + c.height : '-'; }).join(' ') + ')');
  disp = G.editor.disp;
  check(disp && disp.tagName === 'CANVAS' && disp.width === 1024, '#35 copia ridotta a 1024 px su canvas');
  h.click('addOk');
  check(zero(), '#35 dopo la chiusura tutti gli scratch sono 0×0');
  eq(disp.width, 0, '#35 anche la copia ridotta e\' azzerata');
  eq(G.editor.disp, null, '#35 disp scollegata');
  h.chooseFile('altra.jpg'); h.timers.run();
  eq(G.editorOpen, true, '#35 seconda apertura ok');
  check(!!G.editor.last, '#35 seconda codifica ok (gli scratch si ridimensionano da soli)');
  eq(G.editor.last.crc, G.added[0].crc, '#35 stessa codifica della prima (stessi pixel finti)');
  h.click('addCancel');
  check(zero(), '#35 anche dopo Annulla ritaglio: 0×0');
  var h2 = loadPage({ state: mkState({ settingsSet: true }), imgW: 120, imgH: 100 });
  h2.chooseFile('mini.jpg'); h2.timers.run(); h2.click('addOk');
  eq(h2.G.added.length, 1, '#35 immagine minuscola (nessun dimezzamento): chiusura senza errori');
});

section('3m. #42 il body riserva lo spazio del footer che cresce con #msg', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), f = h.el('footer'), body = h.doc.body, css, fp;
  eq(body.style.paddingBottom, undefined, '#42 senza offsetHeight (DOM finto) non si tocca il padding');
  f.offsetHeight = 96;
  h.click('del_0');                              /* D110: il primo tocco arma e scrive il messaggio */
  eq(body.style.paddingBottom, '104px', '#42 padding = altezza del footer + 8');
  h.click('del_0');                              /* ...il secondo elimina e sporca la pagina */
  f.offsetHeight = 140;
  h.click('cancel');
  eq(body.style.paddingBottom, '148px', '#42 ricalcolato a ogni messaggio');
  f.offsetHeight = 0;
  h.click('del_5'); h.click('del_5');
  eq(body.style.paddingBottom, '148px', '#42 footer senza altezza: il padding non viene azzerato');
  /* UX-3 (D121): fitFooter e' uscita da setMsg e la chiama anche updateKb, DOPO aver scritto
   * #hint — un cambio di impostazione senza nessun messaggio deve bastare a rifare il conto,
   * perche' e' proprio #hint che fa crescere il footer. */
  f.offsetHeight = 200;
  h.select('s_font', '1');
  eq(body.style.paddingBottom, '208px', 'D121 anche updateKb da solo ricalcola il padding (fitFooter)');
  css = PAGE_CSS.replace(/\s+/g, ' ');
  fp = /#footer p \{([^}]*)\}/.exec(css);
  check(fp && /max-height/.test(fp[1]) && /overflow(-y)?: ?auto/.test(fp[1]), '#42 CSS: #msg con max-height e overflow');
  eq(declOf(PAGE_CSS, '#footer p', 'max-height'), '8em', 'D121 CSS: le righe del footer arrivano a 8em');
  check(/body \{[^}]*padding: 0 12px 150px/.test(css), 'D121 CSS: il body parte con 150 px di riserva');
});

section('3n. #28 badge a 14 px', function () {
  var css = PAGE_CSS.replace(/\s+/g, ' '), b = /\.badge \{([^}]*)\}/.exec(css), sizes;
  check(b && /font-size: ?14px/.test(b[1]), '#28 .badge font-size 14px');
  check(b && /padding: ?2px 8px/.test(b[1]), '#28 .badge padding 2px 8px');
  sizes = (PAGE_CSS.match(/font-size: ?(\d+)px/g) || []).map(function (m) { return +/(\d+)/.exec(m)[1]; });
  check(sizes.length >= 8 && sizes.every(function (v) { return v >= 14; }), '#28 CSS: nessun font-size sotto i 14 px (' + sizes.join(',') + ')');
});

/* ============================== 4. S7 (compito P): le 5 migliorie della config page ====== */
/* Contratto: docs/design/galleria-s7-qa.md §2.9 — #2 scrollIntoView all'apertura dell'editor,
 * #11 foto aggiunta anche senza miniatura, #26 title col nome intero, #31 stato di versione
 * ignota = non ricevuto, #41 contrasto dei pulsanti disabilitati >= 3:1. */

/* indice della tessera con quello slot (le tessere non stanno in ordine di slot) */
function idxOfSlot(tiles, slot) {
  var k;
  for (k = 0; k < tiles.length; k++) { if (tiles[k].slot === slot) { return k; } }
  return -1;
}
/* stato con tutti e 12 gli slot occupati */
function fullState() {
  var s = mkState({ settingsSet: true }), k;
  for (k = 0; k < 12; k++) { s.photos[k] = photo('f' + k + '.jpg', 1, 100 + k); }
  return s;
}
/* nodo del nome dentro una tessera: [miniatura, meta[nome, badge…], pulsanti] */
function nameNode(h, slot) { return h.el('tile_' + slot).children[1].children[0]; }
/* UX-3 rev (G19): nel solo testo VISIBILE del nome c'e' uno zero-width space prima dell'ultimo
 * punto, cosi' la riga si spezza fra il nome e l'estensione invece che a meta' parola. Non e' un
 * carattere del nome: i pin che confrontano quel testo con il nome vero lo tolgono con noZw(),
 * mentre title, aria-label e messaggi restano puliti e si pinnano come sempre. */
var ZW = '\u200B';
function noZw(s) { return String(s).replace(/\u200B/g, ''); }

/* contrasto WCAG 2.x fra due colori gia' composti sul fondo (nessuna trasparenza residua) */
function hex2rgb(h) {
  if (h.length === 4) { h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; }
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function relLum(rgb) {
  var s = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
}
function contrast(a, b) {
  var l1 = relLum(a), l2 = relLum(b), t;
  if (l1 < l2) { t = l1; l1 = l2; l2 = t; }
  return (l1 + 0.05) / (l2 + 0.05);
}
/* opacity su un elemento compone TUTTO l'elemento (testo e fondo) sul colore dietro */
function overBackdrop(rgb, backdrop, alpha) {
  return rgb.map(function (v, i) { return alpha * v + (1 - alpha) * backdrop[i]; });
}
function cssRule(css, re) { var m = re.exec(css.replace(/\s+/g, ' ')); return m ? m[1] : null; }
/* UX-3: la dichiarazione che resta in piedi fra le regole con QUEL selettore esatto (l'ultima nel
 * file vince). L'elenco arriva da cssRuleList, che toglie i commenti e spezza le liste di
 * selettori: piu' sicuro di una regex sul foglio grezzo, dove una parola in un commento basta. */
function declOf(css, sel, prop) {
  var rules = cssRuleList(css), k, d, v = null;
  for (k = 0; k < rules.length; k++) {
    if (rules[k].sel === sel) { d = cssDecl(rules[k].block, prop); if (d !== null) { v = d; } }
  }
  return v;
}
function cssDecl(block, prop) {
  var m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(block || '');
  return m ? m[1].trim() : null;
}
/* UX-3 rev (G19): la stessa proprieta' dichiarata PIU' VOLTE nello stesso blocco — il valore
 * nuovo dopo il ripiego per le WebView che non lo conoscono e scartano la riga —: declOf/cssDecl
 * tengono la prima, qui servono tutte, nell'ordine del file. */
function declsAllOf(css, sel, prop) {
  var rules = cssRuleList(css), out = [], k, re, m;
  for (k = 0; k < rules.length; k++) {
    if (rules[k].sel !== sel) { continue; }
    re = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)', 'g');
    while ((m = re.exec(rules[k].block || '')) !== null) { out.push(m[1].trim()); }
  }
  return out;
}

section('4a. #2 apertura dell\'editor: scrollIntoView guardato', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h.chooseFile('a.jpg');
  eq(h.G.editorOpen, true, '#2 editor aperto');
  eq(h.env.scrolls.length, 1, '#2 una sola scrollIntoView all\'apertura');
  eq(h.env.scrolls[0].id, 'editor', '#2 si porta in vista #editor, non altro');
  eqJson(h.env.scrolls[0].opt, { block: 'start' }, '#2 opzione {block: "start"}');
  eq(h.env.scrolls[0].disp, '', '#2 chiamata quando l\'editor e\' gia\' visibile');
  h.click('addCancel');
  /* UX-3 (D118): chiudere l'editor non lascia piu' a meta' pagina — si torna in vista su
   * «Aggiungi foto», che e' il punto da cui si riparte. */
  eq(h.env.scrolls.length, 2, 'D118 «Non aggiungere» riporta in vista «Aggiungi foto»');
  eq(h.env.scrolls[1].id, 'add', 'D118 ...e la scroll e\' su #add');
  h.chooseFile('b.jpg');
  eq(h.env.scrolls.length, 3, '#2 alla foto successiva si scorre di nuovo');
  eq(h.env.scrolls[2].id, 'editor', '#2 ...di nuovo su #editor');
  /* nessuna scrollIntoView (WebView vecchia): la proprieta' propria nasconde quella del prototipo */
  var h2 = loadPage({ state: stateEmery(), search: DEV_SEARCH }), threw2 = false;
  h2.el('editor').scrollIntoView = undefined;
  try { h2.chooseFile('c.jpg'); } catch (e) { threw2 = true; }
  eq(threw2, false, '#2 senza scrollIntoView: nessuna eccezione');
  eq(h2.G.editorOpen, true, '#2 senza scrollIntoView: l\'editor si apre lo stesso');
  eq(h2.env.scrolls.length, 0, '#2 senza scrollIntoView: nessuna chiamata registrata');
  eq(h2.txt('msg'), '', '#2 senza scrollIntoView: nessun messaggio d\'errore');
  /* scrollIntoView che rifiuta l'oggetto (browser vecchi: solo il booleano) */
  var h3 = loadPage({ state: stateEmery(), search: DEV_SEARCH }), threw3 = false, called3 = 0;
  h3.el('editor').scrollIntoView = function () { called3++; throw new TypeError('argomento non valido'); };
  try { h3.chooseFile('d.jpg'); } catch (e) { threw3 = true; }
  eq(threw3, false, '#2 scrollIntoView che lancia: nessuna eccezione fuori dalla pagina');
  eq(called3, 1, '#2 scrollIntoView che lancia: chiamata comunque');
  eq(h3.G.editorOpen, true, '#2 scrollIntoView che lancia: editor aperto');
  h3.timers.run();
  h3.click('addOk');
  eq(h3.G.added.length, 1, '#2 scrollIntoView che lancia: la foto si aggiunge lo stesso');
  /* D118: la scroll sulla tessera nuova passa dalla stessa scrollInto guardata */
  var sc3 = h3.env.scrolls[h3.env.scrolls.length - 1];
  eq(sc3 && sc3.id, 'tile_' + h3.G.added[0].slot, 'D118 dopo l\'aggiunta si scorre sulla tessera nuova');
  eqJson(sc3 && sc3.opt, { block: 'start' }, 'D118 con la stessa opzione {block: "start"}');
});

section('4b. #11 la foto si aggiunge anche senza miniatura', function () {
  /* toDataURL che lancia (canvas "tainted", memoria): prima la foto andava persa */
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH,
                     toDataURL: function () { throw new Error('SecurityError: canvas tainted'); } });
  h.chooseFile('senza-thumb.jpg');
  h.timers.run();
  h.click('addOk');
  eq(h.G.added.length, 1, '#11 toDataURL che lancia: la foto e\' aggiunta lo stesso');
  eq(h.G.added[0].thumb, undefined, '#11 nessuna miniatura nell\'entry');
  eqJson(Object.keys(h.G.added[0]), ['slot', 'photo_id', 'fmt', 'len', 'crc', 'data', 'name'],
         '#11 chiavi dell\'entry senza thumb');
  eq(h.G.added[0].crc, expectEmery({ gamma: 1, lift: 0, dither: 'fs', sunlight: false }).crc,
     '#11 i byte della foto sono quelli veri (la miniatura non c\'entra)');
  check(!('thumb' in h.G.buildPayload().photos[0]), '#11 payload: nessuna chiave thumb');
  eq(h.G.editorOpen, false, '#11 editor chiuso');
  eq(h.el('msg').className, 'okmsg', '#11 messaggio di conferma, non di errore');
  eq(h.txt('msg'), Tit('msg_added_no_thumb'), '#11 messaggio: foto aggiunta, e dice che manca la miniatura (D78: frase intera)');
  notContains(h.txt('msg'), '{0}', '#11 messaggio senza segnaposto residui');
  eq(h.G.tiles[idxOfSlot(h.G.tiles, h.G.added[0].slot)].thumb, null, '#11 tessera senza miniatura');
  eq(nameNode(h, h.G.added[0].slot).parentNode.parentNode.children[0].className, 'thumb empty',
     '#11 tessera: riquadro grigio al posto della miniatura');
  eq(h.el('save').disabled, false, '#11 Salva resta attivo');
  /* miniatura semplicemente omessa (PNG oltre i 6.000 caratteri): stesso messaggio */
  var h2 = loadPage({ state: stateEmery(), search: DEV_SEARCH,
                      toDataURL: function () { return 'data:image/png;base64,' + rep('A', 7000); } });
  h2.chooseFile('png.jpg');
  h2.timers.run();
  h2.click('addOk');
  eq(h2.G.added.length, 1, '#11 PNG troppo lunga: foto aggiunta');
  eq(h2.txt('msg'), Tit('msg_added_no_thumb'), '#11 PNG troppo lunga: il messaggio lo dice');
  /* miniatura buona: il messaggio NON parla di anteprima mancante */
  var h3 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h3.chooseFile('ok.jpg');
  h3.timers.run();
  h3.click('addOk');
  check(!!h3.G.added[0].thumb, '#11 caso normale: miniatura presente');
  eq(h3.txt('msg'), Tit('msg_added'), '#11 caso normale: messaggio senza avviso di miniatura');
});

section('4c. #26 title con il nome intero sui nomi troncati', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), nd;
  nd = nameNode(h, 0);
  eq(nd.className, 'name', '#26 il title sta sull\'elemento .name (quello che il CSS ferma a due righe, D112)');
  eq(noZw(nd.textContent), 'città.jpg', '#26 testo visibile: il nome');
  eq(nd.title, 'città.jpg', '#26 nome corto: title uguale al testo');
  eq(nameNode(h, 9).title, Tit('tile_slot', idxOfSlot(h.G.tiles, 9) + 1),
     '#26 estranea senza nome: title = nome di ripiego con la posizione');
  /* nome oltre i 64 caratteri: la tessera mostra il troncato, il title il nome intero */
  var lungo = '';
  while (lungo.length < 90) { lungo += 'nome-lunghissimo-di-una-foto-'; }
  lungo = lungo.slice(0, 90) + '.jpg';
  h.chooseFile(lungo);
  h.timers.run();
  h.click('addOk');
  var slot = h.G.added[0].slot;
  nd = nameNode(h, slot);
  eq(nd.textContent.length, 64, '#26 testo visibile troncato a 64 caratteri');
  eq(nd.textContent, C.truncateName(lungo), '#26 testo visibile = truncateName');
  /* UX-3 rev (G19): il troncamento a 64 caratteri ha portato via il punto, quindi qui non c'e'
   * niente davanti a cui spezzare e lo zero-width space non si mette: la rottura resta quella
   * libera dell'overflow-wrap. Senza questo pin l'inserimento potrebbe finire in coda a un
   * nome qualunque e allungare il testo di un carattere invisibile. */
  eq(nd.textContent.indexOf(ZW), -1, 'G19 nome senza punti: nessuno zero-width space');
  eq(nd.title, lungo, '#26 title: nome intero (' + lungo.length + ' caratteri)');
  check(nd.title.length > nd.textContent.length, '#26 il title dice piu\' del testo mostrato');
  eq(h.G.added[0].name.length, 64, '#26 nel payload resta il nome troncato');
  eq(h.G.buildPayload().photos[0].name, C.truncateName(lungo), '#26 payload: nome troncato, non quello intero');
  /* riordino e nuovo render: il title sopravvive */
  h.click('up_' + slot);
  eq(nameNode(h, slot).title, lungo, '#26 il title resta dopo il riordino');
  /* le tessere che arrivano dallo stato non hanno il nome intero: title = nome (gia' troncato dal PKJS) */
  eq(nameNode(h, 5).title, 'sole.jpg', '#26 tessera dall\'album: title = nome ricevuto');
});

section('4d. #31 stato di versione ignota = stato non ricevuto', function () {
  var d = C.decodeState(hashOf({ v: 2, platform: 'flint', fmt: 2, cap_kb: 60, dev: true,
                                 settingsSet: true, order: [1], deleted: [2] }));
  eq(d.ok, false, '#31 v: 2 => ok false');
  eq(d.error, 'unsupported state version', '#31 v: 2 => messaggio');
  eq(d.fmt, 1, '#31 v: 2 => nessun campo dello stato ignoto viene usato (fmt di default)');
  eq(d.cap_kb, 900, '#31 v: 2 => cap_kb di default');
  eq(d.platform, 'unknown', '#31 v: 2 => platform unknown');
  eq(d.settingsSet, false, '#31 v: 2 => settingsSet false');
  eqJson(d.order, [], '#31 v: 2 => order vuoto');
  eqJson(d.deleted, [], '#31 v: 2 => deleted vuoto');
  eqJson(d.settings, DEFAULT_SETTINGS, '#31 v: 2 => impostazioni di default');
  eq(C.decodeState(hashOf({ platform: 'emery' })).error, 'unsupported state version',
     '#31 v assente: stesso trattamento');
  eq(C.decodeState(hashOf({ v: '1', platform: 'emery' })).ok, false, '#31 v stringa "1": non supportata');
  eq(C.decodeState(hashOf({ v: 0 })).ok, false, '#31 v: 0 non supportata');
  eq(C.decodeState(hashOf({ v: 1, platform: 'emery' })).ok, true, '#31 v: 1: stato valido');
  /* la pagina: avviso, Salva disabilitato, nessun payload autorevole spedito */
  var s = stateEmery(); s.v = 2;
  var h = loadPage({ state: s, search: DEV_SEARCH });
  eq(h.G.state.ok, false, '#31 pagina: stato non ricevuto');
  eq(h.disp('status'), '', '#31 pagina: avviso visibile');
  contains(h.txt('status'), 'Settings not received', '#31 pagina: avviso "impostazioni non ricevute" (D83)');
  contains(h.el('status').title, 'unsupported state version',
           '#31 pagina: il motivo (inglese cablato) sta nel title, non nel testo (D83)');
  eq(h.el('save').disabled, true, '#31 pagina: Salva disabilitato');
  eqJson(h.G.tiles, [], '#31 pagina: nessuna tessera (nessuna foto dello stato ignoto)');
  eq(h.click('save'), false, '#31 pagina: il click su Salva disabilitato non parte');
  eq(h.net.posts.length, 0, '#31 pagina: nessun POST');
  eq(h.navs.length, 0, '#31 pagina: nessuna navigazione');
  h.el('save').disabled = false;                     /* forzato: nemmeno cosi' si salva (#1) */
  h.click('save');
  contains(h.txt('msg'), 'Settings not received', '#31 pagina: Salva forzato risponde comunque di no (D83)');
  eq(h.net.posts.length, 0, '#31 pagina: Salva forzato non manda niente');
  /* Esci funziona lo stesso: si torna all'app senza toccare l'album */
  h.click('cancel');
  eq(h.navs.length, 1, '#31 pagina: Esci naviga comunque');
  eq(h.navs[0], DEV_RT, '#31 pagina: Esci torna al return_to senza payload');
});

/* --- motore minimo di cascata CSS (specificita' + ordine) per la #41 -------------------
 * Serve a chiedere "quale regola VINCE su questo elemento", non "quale regola esiste": il
 * difetto del pulsante spento era proprio una regola giusta battuta da una successiva con la
 * stessa specificita'. Copre quello che il foglio usa: tag, .classe, #id, [attr] / [attr=val],
 * discendente e figlio (>). Niente pseudo-classi, media query, !important. */
function cssRuleList(css) {
  var clean = css.replace(/\/\*[\s\S]*?\*\//g, ''), re = /([^{}]+)\{([^{}]*)\}/g, m, i, s, sel, out = [];
  while ((m = re.exec(clean)) !== null) {
    s = m[1].split(',');
    for (i = 0; i < s.length; i++) {
      sel = s[i].replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
      if (sel) { out.push({ sel: sel, list: m[1].replace(/\s+/g, ' ').replace(/^ | $/g, ''),
                            block: m[2], order: out.length }); }
    }
  }
  return out;
}
/* [id, classi+attributi, tag]: le pseudo-classi non compaiono nel foglio */
function specificity(sel) {
  var noAttr = sel.replace(/\[[^\]]*\]/g, ' ');
  return [(sel.match(/#[\w-]+/g) || []).length,
          (sel.match(/\.[\w-]+/g) || []).length + (sel.match(/\[[^\]]*\]/g) || []).length,
          (noAttr.replace(/[#.][\w-]+/g, ' ').match(/[a-zA-Z][\w-]*/g) || []).length];
}
function cmpSpec(a, b) {
  var i;
  for (i = 0; i < 3; i++) { if (a[i] !== b[i]) { return a[i] < b[i] ? -1 : 1; } }
  return 0;
}
function specStr(s) { return '(' + s.join(',') + ')'; }
/* un "compound" e' un pezzo di selettore senza combinatori: div.tile, button[disabled], … */
function parseCompound(s) {
  var o = { tag: null, id: null, cls: [], attrs: [] },
      re = /\[\s*([\w-]+)\s*(?:([~|^$*]?)=\s*"?([^\]"]*)"?\s*)?\]|\.([\w-]+)|#([\w-]+)|\*|([a-zA-Z][\w-]*)/g, m;
  while ((m = re.exec(s)) !== null) {
    if (m[1]) { o.attrs.push({ n: m[1], v: m[3] === undefined ? null : m[3] }); }
    else if (m[4]) { o.cls.push(m[4]); }
    else if (m[5]) { o.id = m[5]; }
    else if (m[6]) { o.tag = m[6].toLowerCase(); }
  }
  return o;
}
function matchCompound(c, el) {
  var i;
  if (c.tag && c.tag !== el.tag) { return false; }
  if (c.id && c.id !== el.id) { return false; }
  for (i = 0; i < c.cls.length; i++) { if (el.cls.indexOf(c.cls[i]) < 0) { return false; } }
  for (i = 0; i < c.attrs.length; i++) {
    if (!(c.attrs[i].n in el.attrs)) { return false; }
    if (c.attrs[i].v !== null && String(el.attrs[c.attrs[i].n]) !== c.attrs[i].v) { return false; }
  }
  return true;
}
/* chain = catena di elementi dalla radice alla foglia (l'elemento in esame e' l'ultimo) */
function selMatch(sel, chain) {
  var parts = sel.replace(/\s*>\s*/g, ' > ').split(' ');
  function rec(pi, ei) {
    var k;
    if (pi < 0) { return true; }
    if (ei < 0) { return false; }
    if (!matchCompound(parseCompound(parts[pi]), chain[ei])) { return false; }
    if (pi === 0) { return true; }
    if (parts[pi - 1] === '>') { return rec(pi - 2, ei - 1); }
    for (k = ei - 1; k >= 0; k--) { if (rec(pi - 1, k)) { return true; } }
    return false;
  }
  return rec(parts.length - 1, chain.length - 1);
}
/* la dichiarazione che vince: specificita' piu' alta, a parita' l'ultima nel file */
function cssWinner(rules, chain, prop) {
  var best = null, i, v, sp, d;
  for (i = 0; i < rules.length; i++) {
    if (!selMatch(rules[i].sel, chain)) { continue; }
    v = cssDecl(rules[i].block, prop);
    if (v === null) { continue; }
    sp = specificity(rules[i].sel);
    d = best ? cmpSpec(sp, best.sp) : 1;
    if (d > 0 || (d === 0 && rules[i].order > best.order)) {
      best = { sp: sp, order: rules[i].order, val: v, sel: rules[i].sel };
    }
  }
  return best;
}
function nd(tag, cls, id, attrs) {
  return { tag: tag, cls: cls ? cls.split(' ') : [], id: id || null, attrs: attrs || {} };
}
/* catene reali di page.html */
function inFooter(el) { return [nd('body'), nd('footer', null, 'footer'), el]; }
function inEditor(el) { return [nd('body'), nd('section', null, 'editor'), nd('p', 'row'), el]; }
function inPhotos(el) { return [nd('body'), nd('section', null, 'photos'), nd('p', 'row'), el]; }
function inHelp(el) { return [nd('body'), nd('section', null, 'help'), nd('p', 'row'), el]; }
/* UX-2: le tre catene nuove del contratto §5 A1(3) — l'avviso di avvio lento (D81), una riga
 * qualunque delle impostazioni (le frecce del font, D87) e il blocco Lingua/«Altre impostazioni»
 * (D88/D89). Servono al motore di cascata: un pulsante nuovo = una voce in FAM_BTN. */
function inSlow(el) { return [nd('body'), nd('header', null, 'head'), nd('div', 'warn', 'slow'), nd('p', 'row'), el]; }
/* G25: il <p> delle frecce ha id="fontRow" — senza id nella catena, una regola futura del tipo
 * «#fontRow .btn.small» (1,2,0) batterebbe quella dei disabilitati (0,2,0) e riaccenderebbe un
 * pulsante spento senza che il motore se ne accorga. */
function inSettingsRow(el) { return [nd('body'), nd('section', null, 'settings'), nd('p', 'row', 'fontRow'), el]; }
function inMisc(el) { return [nd('body'), nd('section', null, 'settings'), nd('div', null, 'misc'), nd('p', 'row'), el]; }
function inTile(el) {
  return [nd('body'), nd('section', null, 'photos'), nd('div', null, 'tiles'),
          nd('div', 'tile'), nd('div', 'tbtns'), el];
}
/* S12 D47: l'occhio non sta nella colonna dei pulsanti, e' sovrapposto alla miniatura. La
 * tessera SCELTA porta anche la classe pv, e .tile.pv .eye (0,3,0) batterebbe la regola dei
 * disabilitati se questa non fosse rafforzata: le due catene si provano tutte e due (ru). */
function inTileEye(el, cls) {
  return [nd('body'), nd('section', null, 'photos'), nd('div', null, 'tiles'),
          nd('div', cls || 'tile new'), el];
}
/* una voce per famiglia di pulsanti: com'e' acceso e com'e' spento (le classi le scrivono
 * renderTiles per «Aggiungi foto» e le tessere, initToggle per le frecce dei pannelli) */
var FAM_BTN = [
  { nome: 'Salva (.btn.primary)', on: inFooter(nd('button', 'btn primary', 'save')),
    off: inFooter(nd('button', 'btn primary', 'save', { disabled: '' })) },
  { nome: 'Esci (.btn)', on: inFooter(nd('button', 'btn', 'cancel')),
    off: inFooter(nd('button', 'btn', 'cancel', { disabled: '' })) },
  { nome: 'Adatta (.btn.small)', on: inEditor(nd('button', 'btn small', 'fit')),
    off: inEditor(nd('button', 'btn small', 'fit', { disabled: '' })) },
  /* U-04: la label parte BLU (.btn.primary) quando c'e' posto e diventa .btn.off con l'album
   * pieno: la regola dei disabilitati deve batterla come fa con #save. */
  { nome: 'Aggiungi foto (label .btn.primary -> .btn.off)', on: inPhotos(nd('label', 'btn primary', 'add')),
    off: inPhotos(nd('label', 'btn off', 'add')) },
  /* v1.9: il pulsante che apre/chiude la sezione Aiuto; non si disabilita mai, ma la famiglia
   * deve reggere lo stesso la regola dei disabilitati (§4e: un pulsante nuovo = una voce qui).
   * Le frecce restano ULTIME: il caso 4e legge FAM_BTN[length - 1]. */
  { nome: 'Aiuto (.btn.small in #help)', on: inHelp(nd('button', 'btn small', 'helpBtn')),
    off: inHelp(nd('button', 'btn small', 'helpBtn', { disabled: '' })) },
  /* S12 (D47): l'occhio dell'anteprima. Non si disabilita mai, ma la regola dei disabilitati
   * deve valere anche per lui (§4e: un pulsante nuovo = una voce qui). Due voci: sulla tessera
   * qualunque e su quella SCELTA (.tile.pv .eye lo ricolora, ru). */
  { nome: 'occhio dell\'anteprima (.eye)', on: inTileEye(nd('button', 'eye')),
    off: inTileEye(nd('button', 'eye', null, { disabled: '' })) },
  /* UX-3 rev (G22): il selettore rafforzato .tile.pv .eye[disabled] e' uscito dal foglio perche'
   * l'occhio non viene mai disabilitato (nessuna riga di page.js lo spegne, §4e piu' sotto lo
   * pinna). Finche' non c'e', questa famiglia non ha uno stato «spento» da giudicare: offDead
   * dice al motore di saltarlo. Se il selettore torna nel foglio, torna anche il giudizio, e con
   * lui il mutante di 4e — nessuna delle due prove si perde per sempre. */
  { nome: 'occhio nella tessera scelta (.tile.pv .eye)', on: inTileEye(nd('button', 'eye'), 'tile new pv'),
    off: inTileEye(nd('button', 'eye', null, { disabled: '' }), 'tile new pv'),
    offDead: '.tile.pv .eye[disabled]' },
  /* UX-2: i tre pulsantini nuovi (D87 frecce del font, D88 «Altre impostazioni», D81 «Aiuto»
   * dentro l'avviso). Non si disabilitano mai, ma ogni famiglia nuova vuole la sua voce qui.
   * Le frecce della tessera restano ULTIME: il caso 4e legge FAM_BTN[length - 1]. */
  { nome: 'frecce del font (.btn.small in #settings)', on: inSettingsRow(nd('button', 'btn small', 'fontPrev')),
    off: inSettingsRow(nd('button', 'btn small', 'fontPrev', { disabled: '' })) },
  { nome: 'Altre impostazioni (.btn.small in #misc)', on: inMisc(nd('button', 'btn small', 'advBtn')),
    off: inMisc(nd('button', 'btn small', 'advBtn', { disabled: '' })) },
  { nome: 'Aiuto nell\'avviso (.btn.small in #slow)', on: inSlow(nd('button', 'btn small', 'slowHelpBtn')),
    off: inSlow(nd('button', 'btn small', 'slowHelpBtn', { disabled: '' })) },
  /* UX-3 (D110): la ✕ armata dal primo tocco (.tbtns button.arm, 0,2,1). Non si disabilita
   * mai, ma la regola dei disabilitati deve batterla lo stesso: nel foglio sta PRIMA proprio
   * per questo, perche' a parita' di specificita' vince l'ultima. */
  { nome: '✕ armata (.tbtns button.arm)', on: inTile(nd('button', 'arm')),
    off: inTile(nd('button', 'arm', null, { disabled: '' })) },
  /* UX-3 (D107/D121): «Esci comunque», il secondo stato di Esci (.btn.danger, 0,2,0). */
  { nome: 'Esci armato (.btn.danger)', on: inFooter(nd('button', 'btn danger', 'cancel')),
    off: inFooter(nd('button', 'btn danger', 'cancel', { disabled: '' })) },
  /* UX-3 (D114): il pulsantino che apre «Regolazioni della foto» dentro l'editor. */
  { nome: 'Regolazioni della foto (.btn.small in #editor)',
    on: inEditor(nd('button', 'btn small', 'editAdvBtn')),
    off: inEditor(nd('button', 'btn small', 'editAdvBtn', { disabled: '' })) },
  { nome: 'frecce della tessera (.tbtns button)', on: inTile(nd('button')),
    off: inTile(nd('button', null, null, { disabled: '' })) }
];
var FONDI = [['#f4f4f6', 'body'], ['#ffffff', 'tessere/footer']];
/* colore di un <button> senza regole: ButtonText del browser (nero). Se una famiglia ci
 * cascasse davvero sarebbe un difetto a se': il foglio oggi copre tutte e cinque. */
var UA_FG = '#000000';
function stileVincente(rules, chain) {
  var c = cssWinner(rules, chain, 'color'), b = cssWinner(rules, chain, 'background'),
      o = cssWinner(rules, chain, 'opacity');
  return { fg: c ? c.val : UA_FG, bg: b ? b.val : null, op: o ? parseFloat(o.val) : 1,
           selFg: c ? c.sel : '(browser)', selBg: b ? b.sel : '(browser)',
           spec: b ? specStr(b.sp) : '' };
}
/* contrasto testo/fondo del pulsante composto (opacity) sul fondo della pagina */
function contrastoSu(st, fondo) {
  return contrast(overBackdrop(hex2rgb(st.fg), hex2rgb(fondo), st.op),
                  overBackdrop(hex2rgb(st.bg), hex2rgb(fondo), st.op));
}
/* elenco dei difetti del foglio: vuoto = tutte le famiglie a posto (usato anche sul mutante) */
function hasSel(rules, sel) {
  var k;
  for (k = 0; k < rules.length; k++) { if (rules[k].sel === sel) { return true; } }
  return false;
}
/* «strict» = giudica lo stato spento anche delle famiglie con offDead: serve ai MUTANTI, che
 * costruiscono apposta un foglio senza il selettore rafforzato e vogliono vederne l'effetto. */
function problemiPulsanti(css, strict) {
  var rules = cssRuleList(css), out = [], i, j, f, st, c, stati;
  for (i = 0; i < FAM_BTN.length; i++) {
    f = FAM_BTN[i];
    f.stOn = stileVincente(rules, f.on);
    /* UX-3 rev (G22): niente selettore rafforzato nel foglio = quel pulsante non si disabilita
     * mai, quindi non c'e' uno stato spento da giudicare (giudicarlo direbbe solo che .tile.pv
     * .eye vince su se stesso). */
    f.stOff = (!strict && f.offDead && !hasSel(rules, f.offDead)) ? null : stileVincente(rules, f.off);
    stati = f.stOff ? [['acceso', f.stOn], ['spento', f.stOff]] : [['acceso', f.stOn]];
    stati.forEach(function (s) {
      st = s[1];
      if (st.bg === null) { out.push(f.nome + ' ' + s[0] + ': nessuna regola fissa il fondo'); return; }
      for (j = 0; j < FONDI.length; j++) {
        c = contrastoSu(st, FONDI[j][0]);
        if (!(c >= 3)) {
          out.push(f.nome + ' ' + s[0] + ': contrasto ' + c.toFixed(2) + ':1 su ' + FONDI[j][1] +
                   ' (' + st.fg + ' su ' + st.bg + ', opacity ' + st.op + ')');
        }
      }
    });
    if (!f.stOff) { continue; }
    if (f.stOff.bg !== null && f.stOff.bg === f.stOn.bg) {
      out.push(f.nome + ' spento: stesso fondo dell\'acceso (' + f.stOff.bg + ' da "' +
               f.stOff.selBg + '" ' + f.stOff.spec + '): sembra attivo');
    }
    if (!(f.stOff.op < 1)) { out.push(f.nome + ' spento: opacity 1 (nessun aspetto spento)'); }
  }
  return out;
}

section('4e. #41 pulsanti disabilitati: contrasto >= 3:1 in cima alla cascata', function () {
  var rules = cssRuleList(PAGE_CSS), dis = null, i, sp, mut, prob, mprob, frecce, dng, armR;
  var eyeDis, eyeLines;
  /* UX-3: ordine nel file di un selettore (l'ultima occorrenza: e' quella che conta) */
  function selOrder(sel) {
    var k, o = -1;
    for (k = 0; k < rules.length; k++) { if (rules[k].sel === sel) { o = rules[k].order; } }
    return o;
  }
  for (i = 0; i < rules.length; i++) { if (rules[i].sel === '.btn[disabled]') { dis = rules[i]; } }
  check(!!dis, '#41 esiste la regola dei pulsanti disabilitati (.btn[disabled])');
  var list = dis ? dis.list : '', block = dis ? dis.block : '';
  check(list.indexOf('.btn[disabled]') >= 0, '#41 la regola copre .btn[disabled] (batte .btn.primary: stessa specificita\', dopo nel file)');
  check(list.indexOf('button[disabled]') >= 0, '#41 la regola copre button[disabled] (pulsanti senza .btn)');
  check(list.indexOf('.btn.off') >= 0, '#41 la regola copre .btn.off (la label "Aggiungi foto")');
  /* il selettore rafforzato: .tbtns button (0,1,1) sta piu' sotto nel file e a parita' di
   * specificita' rimetterebbe il fondo bianco alle frecce spente */
  check(list.indexOf('.tbtns button[disabled]') >= 0,
        '#41 la regola copre .tbtns button[disabled] (0,2,1: batte .tbtns button)');
  /* S12 (ru): stesso problema con l'occhio della tessera scelta, .tile.pv .eye (0,3,0).
   * UX-3 rev (G22): il selettore rafforzato e' uscito dal foglio — l'occhio non si disabilita mai
   * —, quindi la copertura si controlla solo se c'e' ancora; l'aritmetica della cascata resta
   * scritta qui sotto, perche' e' la ragione per cui dovrebbe tornare se l'occhio si spegnesse. */
  eyeDis = hasSel(rules, '.tile.pv .eye[disabled]');
  if (eyeDis) {
    check(list.indexOf('.tile.pv .eye[disabled]') >= 0,
          '#41 la regola copre .tile.pv .eye[disabled] (0,4,0: batte .tile.pv .eye)');
  } else {
    eq(list.indexOf('.tile.pv .eye[disabled]'), -1,
       'G22 .tile.pv .eye[disabled] e\' uscito dalla regola dei disabilitati (selettore morto)');
    eyeLines = String(SRC['page.js'] || '').split('\n').filter(function (l) {
      return /\beye\b/i.test(l) && /disabled/.test(l);
    });
    eqJson(eyeLines, [], 'G22 ...e nessuna riga di page.js disabilita un occhio: non serve a niente');
  }
  eqJson(specificity('.tile.pv .eye[disabled]'), [0, 4, 0], '#41 specificita\' di .tile.pv .eye[disabled]');
  eqJson(specificity('.tile.pv .eye'), [0, 3, 0], '#41 specificita\' di .tile.pv .eye');
  eq(cmpSpec(specificity('.tile.pv .eye[disabled]'), specificity('.tile.pv .eye')), 1,
     '#41 .tile.pv .eye[disabled] vince su .tile.pv .eye');
  eq(cmpSpec(specificity('button[disabled]'), specificity('.tile.pv .eye')), -1,
     '#41 il solo button[disabled] (0,1,0) perderebbe contro .tile.pv .eye (0,3,0)');
  sp = specificity('.tbtns button[disabled]');
  eqJson(sp, [0, 2, 1], '#41 specificita\' di .tbtns button[disabled]');
  eqJson(specificity('.tbtns button'), [0, 1, 1], '#41 specificita\' di .tbtns button');
  eq(cmpSpec(sp, specificity('.tbtns button')), 1, '#41 .tbtns button[disabled] vince su .tbtns button');
  eq(cmpSpec(specificity('button[disabled]'), specificity('.tbtns button')), 0,
     '#41 button[disabled] e .tbtns button hanno la stessa specificita\' (0,1,1): decide l\'ordine');
  check(rules[rules.length - 1].order >= 0, '#41 foglio letto: ' + rules.length + ' selettori');
  var op = parseFloat(cssDecl(block, 'opacity'));
  var fg = cssDecl(block, 'color'), bg = cssDecl(block, 'background');
  check(op >= 0.6, '#41 opacity ' + op + ' >= 0,6 (aspetto spento ma non sbiadito)');
  check(/^#[0-9a-f]{3,6}$/i.test(String(fg)), '#41 la regola fissa il colore del testo (' + fg + ')');
  check(/^#[0-9a-f]{3,6}$/i.test(String(bg)), '#41 la regola fissa il fondo (' + bg + ')');
  /* fondo del body e del footer/tessere: il pulsante disabilitato compare su entrambi */
  eq(cssDecl(cssRule(PAGE_CSS, /(?:^| )body \{([^}]*)\}/), 'background'), '#f4f4f6',
     '#41 fondo del body (per il calcolo)');
  eq(cssDecl(cssRule(PAGE_CSS, /(?:^| )\.tile \{([^}]*)\}/), 'background'), '#fff',
     '#41 fondo delle tessere (per il calcolo)');

  /* --- il calcolo vero: per ogni famiglia si guarda la regola che VINCE la cascata --- */
  prob = problemiPulsanti(PAGE_CSS);
  eqJson(prob, [], '#41 nessun problema di contrasto/aspetto sulle ' + FAM_BTN.length +
                   ' famiglie di pulsanti');
  FAM_BTN.forEach(function (f) {
    /* UX-3 rev (G22): una famiglia che non si disabilita mai e che il foglio non copre piu' con
     * un selettore rafforzato ha il solo stato acceso (stOff nullo). */
    (f.stOff ? [['acceso', f.stOn], ['spento', f.stOff]] : [['acceso', f.stOn]]).forEach(function (s) {
      var c0 = contrastoSu(s[1], FONDI[0][0]), c1 = contrastoSu(s[1], FONDI[1][0]);
      check(c0 >= 3 && c1 >= 3, '#41 ' + f.nome + ' ' + s[0] + ': ' + s[1].fg + ' su ' + s[1].bg +
            ' (regola "' + s[1].selBg + '", opacity ' + s[1].op + ') = ' + c0.toFixed(2) +
            ':1 su body e ' + c1.toFixed(2) + ':1 su bianco');
    });
    if (!f.stOff) { return; }
    eq(f.stOff.bg, bg, '#41 ' + f.nome + ': da spento vince il fondo dei disabilitati (' + bg +
       ' da "' + f.stOff.selBg + '")');
    eq(f.stOff.fg, fg, '#41 ' + f.nome + ': da spento vince il testo dei disabilitati (' + fg + ')');
    eq(f.stOff.op, op, '#41 ' + f.nome + ': da spento vince l\'opacity dei disabilitati');
    check(f.stOn.bg !== f.stOff.bg, '#41 ' + f.nome + ': spento e acceso hanno fondi diversi (' +
          f.stOn.bg + ' -> ' + f.stOff.bg + ')');
  });
  frecce = FAM_BTN[FAM_BTN.length - 1];
  eq(frecce.stOn.bg, '#fff', '#41 freccia accesa: fondo bianco da .tbtns button');
  eq(frecce.stOff.selBg, '.tbtns button[disabled]', '#41 freccia spenta: vince .tbtns button[disabled]');

  /* mutante: la regola dei disabilitati senza il selettore rafforzato, al suo posto (PRIMA di
   * .tbtns button) = il difetto trovato in S7. Il test deve accorgersene. */
  mut = PAGE_CSS.replace(/,\s*\.tbtns button\[disabled\]/, '');
  check(mut !== PAGE_CSS, '#41 mutante costruito (selettore rafforzato tolto)');
  check(cssRuleList(mut).length === rules.length - 1, '#41 mutante: un selettore in meno');
  mprob = problemiPulsanti(mut);
  check(mprob.length > 0, '#41 mutante bocciato: ' + (mprob[0] || 'nessun problema!'));
  check(mprob.join(' | ').indexOf('frecce della tessera') >= 0,
        '#41 mutante: il problema e\' proprio sulle frecce della tessera');
  /* secondo mutante (S12, ru): senza .tile.pv .eye[disabled] l'occhio spento della tessera
   * scelta resterebbe blu, pieno e con opacity 1. UX-3 rev (G22): il selettore e' uscito dal
   * foglio, quindi il mutante non si puo' piu' costruire — e non c'e' piu' niente da proteggere,
   * perche' un occhio spento non esiste. Il ramo resta scritto: se l'occhio tornasse a
   * disabilitarsi e il selettore tornasse nel foglio, il mutante si riaccende da solo. */
  if (eyeDis) {
    mut = PAGE_CSS.replace(/,\s*\.tile\.pv \.eye\[disabled\]/, '');
    check(mut !== PAGE_CSS, '#41 secondo mutante costruito (.tile.pv .eye[disabled] tolto)');
    mprob = problemiPulsanti(mut, true);
    check(mprob.length > 0, '#41 secondo mutante bocciato: ' + (mprob[0] || 'nessun problema!'));
    check(mprob.join(' | ').indexOf('tessera scelta') >= 0,
          '#41 secondo mutante: il problema e\' proprio sull\'occhio della tessera scelta');
  }
  /* --- UX-3: i due rossi (D107 «Esci comunque», D110 ✕ armata) stanno SOPRA la regola dei
   * disabilitati. Hanno la stessa specificita' dei selettori che devono perdere — .btn.danger
   * (0,2,0) contro .btn[disabled] (0,2,0), .tbtns button.arm (0,2,1) contro
   * .tbtns button[disabled] (0,2,1) —, quindi l'unica cosa che decide e' l'ordine nel file. */
  eqJson(specificity('.btn.danger'), [0, 2, 0], 'UX-3 specificita\' di .btn.danger');
  eqJson(specificity('.tbtns button.arm'), [0, 2, 1], 'UX-3 specificita\' di .tbtns button.arm');
  eq(cmpSpec(specificity('.btn.danger'), specificity('.btn[disabled]')), 0,
     'UX-3 .btn.danger e .btn[disabled] pari (0,2,0): decide l\'ordine');
  eq(cmpSpec(specificity('.tbtns button.arm'), specificity('.tbtns button[disabled]')), 0,
     'UX-3 .tbtns button.arm e .tbtns button[disabled] pari (0,2,1): decide l\'ordine');
  check(selOrder('.btn.danger') >= 0, 'UX-3 il foglio ha la regola .btn.danger (D107)');
  check(selOrder('.tbtns button.arm') >= 0, 'UX-3 il foglio ha la regola .tbtns button.arm (D110)');
  check(selOrder('.btn.danger') >= 0 && selOrder('.btn.danger') < selOrder('.btn[disabled]'),
        'UX-3 D107: .btn.danger e\' scritta PRIMA della regola dei disabilitati');
  check(selOrder('.tbtns button.arm') >= 0 &&
        selOrder('.tbtns button.arm') < selOrder('.tbtns button[disabled]'),
        'UX-3 D110: .tbtns button.arm e\' scritta PRIMA della regola dei disabilitati');
  /* terzo mutante (UX-3, D107): .btn.danger spostata DOPO i disabilitati. Stessa specificita',
   * quindi vincerebbe lei: «Esci comunque» spento resterebbe bianco e rosso, identico all'acceso. */
  dng = (/\.btn\.danger \{[^}]*\}/.exec(PAGE_CSS) || [''])[0];
  mut = PAGE_CSS.replace(/\.btn\.danger \{[^}]*\}/, '').replace(/(\.btn\.off,[^{]*\{[^}]*\})/, '$1 ' + dng);
  check(dng !== '' && mut !== PAGE_CSS, '#41 terzo mutante costruito (.btn.danger sotto i disabilitati)');
  mprob = problemiPulsanti(mut);
  check(mprob.length > 0, '#41 terzo mutante bocciato: ' + (mprob[0] || 'nessun problema!'));
  check(mprob.join(' | ').indexOf('Esci armato') >= 0,
        '#41 terzo mutante: il problema e\' proprio su «Esci comunque»');
  /* quarto mutante (UX-3, D110): la ✕ armata spostata sotto i disabilitati */
  armR = (/\.tbtns button\.arm \{[^}]*\}/.exec(PAGE_CSS) || [''])[0];
  mut = PAGE_CSS.replace(/\.tbtns button\.arm \{[^}]*\}/, '').replace(/(\.btn\.off,[^{]*\{[^}]*\})/, '$1 ' + armR);
  check(armR !== '' && mut !== PAGE_CSS, '#41 quarto mutante costruito (.tbtns button.arm sotto i disabilitati)');
  mprob = problemiPulsanti(mut);
  check(mprob.length > 0, '#41 quarto mutante bocciato: ' + (mprob[0] || 'nessun problema!'));
  check(mprob.join(' | ').indexOf('armata') >= 0,
        '#41 quarto mutante: il problema e\' proprio sulla ✕ armata');
  problemiPulsanti(PAGE_CSS);                       /* ripristina stOn/stOff sul foglio vero */

  /* la vecchia regola (solo opacity 0.45 sul .btn bianco) NON passerebbe: prova di sensibilita' */
  var vecchio = contrast(overBackdrop(hex2rgb('#222'), hex2rgb('#ffffff'), 0.45),
                         overBackdrop(hex2rgb('#ffffff'), hex2rgb('#ffffff'), 0.45));
  check(vecchio < 3, '#41 controprova: opacity 0,45 sul .btn normale darebbe ' + vecchio.toFixed(2) + ':1');
  /* i pulsanti che si disabilitano davvero portano le classi/attributi delle famiglie di sopra */
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h.chooseFile('a.jpg');
  /* UX-3 (D107): con l'editor aperto il footer NON si spegne piu' — prende le parole dell'editor.
   * Il pulsante che si disabilita davvero e' Salva senza stato (#1) o sopra il tetto, e li' deve
   * restare .btn.primary, cosi' la regola dei disabilitati lo prende come prima. */
  eq(h.el('save').disabled, false, '#41 D107: con l\'editor aperto Salva resta acceso');
  eq(h.el('cancel').disabled, false, '#41 D107: e anche Esci');
  h.click('addCancel');
  var hns = loadPage({ hash: '', search: DEV_SEARCH });
  eq(hns.el('save').disabled, true, '#41 senza stato Salva e\' disabilitato');
  eq(hns.el('save').className, 'btn primary', '#41 Salva disabilitato resta .btn.primary (serve .btn[disabled])');
  eq(hns.el('cancel').disabled, false, '#41 D107: Esci non si disabilita mai piu\'');
  var s0 = h.G.tiles[0].slot, up = h.el('up_' + s0);
  eq(up.disabled, true, '#41 la freccia su della prima tessera e\' disabilitata');
  eq(up.className, '', '#41 la freccia non ha classi: la regola la prende come .tbtns button[disabled]');
  eq(up.tagName, 'BUTTON', '#41 la freccia e\' un <button> (l\'attributo disabled vale davvero)');
  var full = loadPage({ state: fullState(), search: DEV_SEARCH });
  eq(full.el('add').className, 'btn off', '#41 album pieno: "Aggiungi foto" prende la classe off');
  eq(h.el('add').className, 'btn primary', '#41 con posto "Aggiungi foto" e\' .btn.primary (U-04)');

  /* --- UX-2: le regole nuove del foglio non devono rubare la cascata ai pulsanti (§5 A1(3)) --- */
  var addOn = inPhotos(nd('label', 'btn primary', 'add')), addOff = inPhotos(nd('label', 'btn off', 'add')), w;
  w = cssWinner(rules, addOn, 'background');
  eq(w && w.sel, '.btn.primary', '#41 «Aggiungi foto» acceso: vince .btn.primary (nessuna regola piu\' specifica)');
  w = cssWinner(rules, addOff, 'background');
  eq(w && w.sel, '.btn.off', '#41 «Aggiungi foto» spento: vince .btn.off');
  /* il motore ignora le pseudo-classi: #file:focus + #add non deve mai applicarsi al riposo */
  check(cssRuleList(PAGE_CSS).some(function (r) { return /#file:focus/.test(r.sel); }),
        '#41 il foglio ha la regola del focus su #file (U-04)');
  eq(cssWinner(rules, addOn, 'outline'), null,
     '#41 #file:focus + #add non si applica al pulsante a riposo (pseudo-classe ignorata, niente cascata rubata)');
  eq(cssWinner(rules, addOn, 'opacity'), null, '#41 e non gli mette nessuna opacity');
  /* select#s_font (1,0,1) vale per la sola select, non per le frecce accanto */
  var fontSel = [nd('body'), nd('section', null, 'settings'), nd('p', 'row', 'fontRow'), nd('select', null, 's_font')];
  check(cssWinner(rules, fontSel, 'flex') !== null, '#41 select#s_font ha la sua regola flex (D87)');
  eq(cssWinner(rules, inSettingsRow(nd('button', 'btn small', 'fontPrev')), 'flex'), null,
     '#41 la regola di select#s_font non arriva alle frecce');
  eqJson(specificity('select#s_font'), [1, 0, 1], '#41 specificita\' di select#s_font');
  /* .chk (U-09) vale sulle label con casella e non tocca «Aggiungi foto» */
  w = cssWinner(rules, inPhotos(nd('label', 'chk')), 'min-height');
  eq(w && w.sel, '.chk', '#41 .chk fissa i 40 px sulle label con casella');
  check(!selMatch('.chk', addOn), '#41 .chk non tocca la label «Aggiungi foto» (mai «.row label» nudo)');
  check(!cssRuleList(PAGE_CSS).some(function (r) { return r.sel === '.row label'; }),
        '#41 nessuna regola «.row label» nuda (batterebbe .btn)');
});

/* v1.9 (perf 04/09, revisione F04): stato di prova con un OPEN_MS scelto ('via' = campo assente,
 * orologio vecchio) e, se dato, con n foto valide sull'orologio (slot con state 1). La soglia
 * dell'avviso dipende da n: senza n vale lo stato standard di emery, 2 slot pieni -> 600 ms. */
function pageOpenMs(ms, n) {
  var st = stateEmery(), k;
  if (typeof n === 'number') {
    for (k = 0; k < 12; k++) { st.watch.slots[k] = { state: (k < n) ? 1 : 0, crc: (k < n) ? 111 : 0 }; }
  }
  if (ms === 'via') { delete st.watch.openMs; } else { st.watch.openMs = ms; }
  return loadPage({ state: st, search: DEV_SEARCH });
}
/* snapshot minimo per la logica pura: n slot con state 1, piu' openMs se dato */
function watchOf(n, ms) {
  var w = { slots: [] }, k;
  for (k = 0; k < 12; k++) { w.slots.push({ state: (k < n) ? 1 : 0, crc: 0 }); }
  if (ms !== undefined) { w.openMs = ms; }
  return w;
}
/* Il paragrafo di `help_sync` non ha id: nel markup e' un <p class="help"> vuoto con la sola
 * chiave (nome nei sorgenti, indice nell'artefatto). Si cerca per data-i18n; se non c'e' la
 * sezione fallisce con un'eccezione invece di saltare in silenzio il controllo. */
function helpSyncNode(h) {
  var c = h.el('help').children, i;
  for (i = 0; i < c.length; i++) {
    if (c[i].attrs && c[i].attrs['data-i18n'] === K('help_sync')) { return c[i]; }
  }
  throw new Error('nessun paragrafo con data-i18n = help_sync dentro #help');
}
function liTexts(el) {
  var out = [], k;
  for (k = 0; k < el.children.length; k++) {
    if (el.children[k].tagName === 'LI') { out.push(el.children[k].textContent); }
    else { out = out.concat(liTexts(el.children[k])); }
  }
  return out;
}

/* F11 (pin load-bearing, U-02; rinforzato nella revisione UX-1): il passo 3 deve dire di
 * TOGLIERE Galleria e di NON aggiornarla (Aggiorna non cancella il file persist). Il nome esatto
 * del pulsante non e' un fatto verificato in nessuna lingua (D55: passo descrittivo), quindi si
 * pinna il solo invariante semantico, insensibile a maiuscole e desinenza, nelle sei lingue.
 * Pretendere «una negazione da qualche parte» e «la radice di aggiornare da qualche altra» non
 * bastava: passava anche il consiglio ROVESCIATO, «aggiorna Galleria (non rimuoverla)», che e'
 * il contrario. Adesso servono due cose: (1) la negazione ENTRO 20 CARATTERI PRIMA della radice
 * di «aggiornare» — cioe' la negazione che nega QUEL verbo — e (2) la radice del verbo
 * «togliere» nella stessa riga. La sezione 4f-pin prova le due parti su testi veri e rovesciati.
 * F06: la stima del ritorno non promette mai «circa un minuto», in nessuna lingua.
 * Colonne: valore della select, lingua, negazione, radice di «aggiornare» (le prime due come
 * SORGENTI di regex, per comporle), radice di «togliere», promessa vietata di F06. */
var LANG_PIN = [
  ['1', 'en', '\\bnot\\b',                   'updat',              /remov/i,        /about a minute/i],
  ['2', 'it', '\\bnon\\b',                   'aggiorn',            /rimuov|togli/i, /circa un minuto/i],
  ['3', 'de', '\\bnicht\\b',                 'aktualis',           /entfern/i,      /etwa eine minute/i],
  ['4', 'fr', '\\bne\\b|\\bn[\u0027\u2019]', '(mettre|mettez|mise)[\\s\\S]{0,12}jour', /retir/i, /environ une minute/i],
  ['5', 'es', '\\bno\\b',                    'actualic|actualiz',  /quit/i,         /(alrededor|cerca) de un minuto/i],
  ['6', 'pt', '\\bn[\u00e3a]o\\b',            'atualiz',            /remov/i,        /cerca de um minuto/i]
];
var STEP3_GAP = 20;                            /* caratteri ammessi fra la negazione e il verbo */
function langPin(code) {
  var i;
  for (i = 0; i < LANG_PIN.length; i++) { if (LANG_PIN[i][1] === code) { return LANG_PIN[i]; } }
  return null;
}
/* «non ... aggiornare» nello stesso pezzo di frase: la negazione prima, il verbo entro 20
 * caratteri (in francese «ne la mettez pas a jour» sono 4, in italiano 1). */
function step3Negates(txt, code) {
  var p = langPin(code);
  return new RegExp('(?:' + p[2] + ')[^\\n]{0,' + STEP3_GAP + '}?(?:' + p[3] + ')', 'i').test(String(txt));
}
function step3Removes(txt, code) { return langPin(code)[4].test(String(txt)); }
function pinStep3(txt, code, where) {
  check(step3Negates(txt, code),
        'F11 ' + code + ' ' + where + ': il passo 3 NEGA l\'aggiornamento, e lo nega VICINO al verbo (' + txt + ')');
  check(step3Removes(txt, code),
        'F11 ' + code + ' ' + where + ': ...e dice di TOGLIERE Galleria (' + txt + ')');
}

/* Autoprova del pin (revisione UX-1): i sei passi 3 veri devono passarlo e i sei ROVESCIATI —
 * il consiglio sbagliato, che con la regola di prima passava — devono fallirlo. I testi
 * rovesciati stanno qui e non nel dizionario: sono mutanti del test, non traduzioni. */
var STEP3_ROVESCIATO = {
  en: 'update Galleria (do not remove it)',
  it: 'aggiorna Galleria (non rimuoverla)',
  de: 'aktualisiere Galleria (nicht entfernen)',
  fr: 'mettez a jour Galleria (ne la retirez pas)',
  es: 'actualiza Galleria (no la quites)',
  pt: 'atualize Galleria (não remova)'
};
section('4f-pin. il pin del passo 3 (F11) boccia il consiglio rovesciato', function () {
  var i, c, vero, falso;
  for (i = 0; i < LANG_PIN.length; i++) {
    c = LANG_PIN[i];
    vero = Tlang(I18N[c[1]], 'fix_step_3');
    falso = STEP3_ROVESCIATO[c[1]];
    check(step3Negates(vero, c[1]) && step3Removes(vero, c[1]),
          'F11 ' + c[1] + ': il passo 3 vero passa il pin («' + vero + '»)');
    check(!step3Negates(falso, c[1]),
          'F11 ' + c[1] + ': il rovesciato NON passa («' + falso + '»)');
    check(step3Removes(falso, c[1]),
          'F11 ' + c[1] + ': ...e non passa per merito della radice di «togliere», che c\'e\' anche li\'');
    check(new RegExp(c[2], 'i').test(falso) && new RegExp(c[3], 'i').test(falso),
          'F11 ' + c[1] + ': con la regola vecchia (negazione e verbo slegati) il rovesciato sarebbe passato');
  }
});

section('4f. v1.9 avviso di avvio lento (#slow) e sezione Aiuto (#help)', function () {
  /* --- soglia proporzionale alle foto, in page_core (logica pura; revisione F04) ---
   * OPEN_MS comprende la ricerca della chiave 0, cioe' una scansione del file persist: il tempo
   * "normale" cresce con le foto tenute sull'orologio, quindi la soglia e' 400 + 100 x foto. */
  eq(C.SLOW_BASE_MS, 400, 'soglia: base 400 ms (orologio senza foto)');
  eq(C.SLOW_PER_PHOTO_MS, 100, 'soglia: 100 ms per ogni foto valida');
  eq(C.SLOW_OPEN_MS, undefined, 'la vecchia soglia fissa non esiste piu\'');
  eq(C.slowThresholdMs(null), 400, 'soglia: nessuno snapshot -> 400 ms');
  eq(C.slowThresholdMs({}), 400, 'soglia: snapshot senza slots -> 400 ms');
  eq(C.slowThresholdMs({ slots: 'x' }), 400, 'soglia: slots non un array -> 400 ms');
  eq(C.slowThresholdMs(watchOf(0)), 400, 'soglia: 0 foto -> 400 ms');
  eq(C.slowThresholdMs(watchOf(4)), 800, 'soglia: 4 foto -> 800 ms');
  eq(C.slowThresholdMs(watchOf(12)), 1600, 'soglia: 12 foto (album pieno) -> 1600 ms');
  eq(C.slowThresholdMs({ slots: [null, { state: 1 }, { state: 0 }, { state: 1, crc: 5 }] }), 600,
     'soglia: contati solo gli slot con state 1 (le voci vuote non contano)');
  eq(C.slowThresholdMs({ slots: watchOf(12).slots.concat(watchOf(8).slots) }), 1600,
     'soglia: mai oltre i 12 slot, anche con un array piu\' lungo');
  eq(C.secondsText(2150), '2,2', 'secondsText: 2150 ms -> "2,2"');
  eq(C.secondsText(1001), '1,0', 'secondsText: 1001 ms -> "1,0" (mai "1")');
  eq(C.secondsText(0), '0,0', 'secondsText: 0');
  eq(C.slowSeconds(null), null, 'slowSeconds: nessuno snapshot -> null');
  eq(C.slowSeconds({ openMs: null }), null, 'slowSeconds: openMs null (orologio vecchio) -> null');
  eq(C.slowSeconds({}), null, 'slowSeconds: openMs assente -> null');
  eq(C.slowSeconds(watchOf(12)), null, 'slowSeconds: album pieno ma openMs assente -> null');
  eq(C.slowSeconds({ openMs: 0 }), null, 'slowSeconds: 0 (non misurato/istantaneo) -> null');
  /* 0 foto: soglia 400 */
  eq(C.slowSeconds(watchOf(0, 400)), null, 'slowSeconds: 0 foto, 400 ms (sulla soglia) -> nessun avviso');
  eq(C.slowSeconds(watchOf(0, 401)), '0,4', 'slowSeconds: 0 foto, 401 ms -> avviso');
  /* 4 foto: soglia 800; misure di campo 90 ms (file nuovo) e 2.145 ms (file gonfio) */
  eq(C.slowSeconds(watchOf(4, 90)), null, 'slowSeconds: 4 foto, file nuovo (90 ms) -> nessun avviso');
  eq(C.slowSeconds(watchOf(4, 800)), null, 'slowSeconds: 4 foto, 800 ms (sulla soglia) -> nessun avviso');
  eq(C.slowSeconds(watchOf(4, 801)), '0,8', 'slowSeconds: 4 foto, 801 ms -> avviso');
  eq(C.slowSeconds(watchOf(4, 2145)), '2,1', 'slowSeconds: 4 foto, file gonfio (2145 ms) -> avviso');
  /* 12 foto sane: 650-1.200 ms stimati devono restare sotto la soglia di 1.600 (F07) */
  eq(C.slowSeconds(watchOf(12, 650)), null, 'slowSeconds: 12 foto sane (650 ms) -> nessun avviso');
  eq(C.slowSeconds(watchOf(12, 1200)), null, 'slowSeconds: 12 foto sane (1200 ms) -> nessun avviso');
  eq(C.slowSeconds(watchOf(12, 1600)), null, 'slowSeconds: 12 foto, 1600 ms (sulla soglia) -> nessun avviso');
  eq(C.slowSeconds(watchOf(12, 1601)), '1,6', 'slowSeconds: 12 foto, 1601 ms -> avviso');
  /* lo stesso openMs vale o non vale un avviso a seconda delle foto */
  eq(C.slowSeconds(watchOf(2, 1000)), '1,0', 'slowSeconds: 1000 ms con 2 foto -> avviso');
  eq(C.slowSeconds(watchOf(12, 1000)), null, 'slowSeconds: gli stessi 1000 ms con 12 foto -> nessun avviso');
  /* normWatch: il campo arriva dallo stato dell'hash, con i valori strani neutralizzati */
  eq(C.decodeState('#' + hashOf(stateEmery())).watch.openMs, null, 'normWatch: snapshot senza openMs -> null');
  (function () {
    var st = stateEmery(); st.watch.openMs = 2150;
    eq(C.decodeState('#' + hashOf(st)).watch.openMs, 2150, 'normWatch: openMs letto dall\'hash');
    st.watch.openMs = -5;
    eq(C.decodeState('#' + hashOf(st)).watch.openMs, null, 'normWatch: openMs negativo -> null');
    st.watch.openMs = 'x';
    eq(C.decodeState('#' + hashOf(st)).watch.openMs, null, 'normWatch: openMs non numerico -> null');
    /* la soglia si calcola sullo stato normalizzato dell'hash come sullo snapshot grezzo */
    eq(C.slowThresholdMs(C.decodeState('#' + hashOf(stateEmery())).watch), 600,
       'soglia dallo stato dell\'hash: le 2 foto valide di stateEmery -> 600 ms');
  })();

  /* --- avviso nascosto: file sano, campo assente, orologio vecchio, sotto o sulla soglia --- */
  [[0, null, 'openMs 0'], ['via', null, 'campo assente'], [null, null, 'openMs null'],
   [599, null, 'openMs 599 con 2 foto'], [600, null, 'openMs 600, sulla soglia con 2 foto'],
   [400, 0, 'openMs 400 senza foto (sulla soglia)'], [90, 4, 'openMs 90 con 4 foto (file nuovo)'],
   [800, 4, 'openMs 800 con 4 foto (sulla soglia)'], [1200, 12, 'openMs 1200 con 12 foto sane'],
   [1600, 12, 'openMs 1600 con 12 foto (sulla soglia)']].forEach(function (c) {
    var h = pageOpenMs(c[0], c[1] === null ? undefined : c[1]);
    eq(h.disp('slow'), 'none', 'avviso nascosto con ' + c[2]);
    eq(h.txt('slowLead'), '', 'nessun testo dell\'avviso con ' + c[2]);
    eq(h.txt('slowFix'), '', 'nessuna procedura nell\'avviso con ' + c[2]);
    /* D81: l'Aiuto si apre da solo SOLO quando l'avviso c'e' */
    eq(h.disp('helpBody'), 'none', 'senza avviso l\'Aiuto resta ripiegato con ' + c[2]);
    eq(h.env.scrolls.length, 0, 'senza avviso nessuno scorrimento all\'avvio con ' + c[2]);
  });
  (function () {                                     /* hash assente: nessuno snapshot, nessun avviso */
    var h = loadPage({ hash: '' });
    eq(h.disp('slow'), 'none', 'stato non ricevuto: avviso nascosto');
    check(h.disp('help') !== 'none', 'stato non ricevuto: l\'Aiuto resta disponibile');
  })();

  /* --- avviso visibile: appena sopra la soglia con 0, 2 e 12 foto --- */
  [[401, 0, '0,4'], [601, 2, '0,6'], [1601, 12, '1,6']].forEach(function (c) {
    var h = pageOpenMs(c[0], c[1]), lead = h.txt('slowLead');
    eq(h.disp('slow'), '', 'openMs ' + c[0] + ' con ' + c[1] + ' foto: avviso visibile');
    /* U-03/D81: l'avviso e' la sola frase del dizionario, con i secondi al posto di {0} */
    eq(lead, Tit('slow_lead', c[2]), 'openMs ' + c[0] + ': l\'avviso e\' slow_lead con "' + c[2] + '"');
    eq(h.txt('slowFix'), '', 'openMs ' + c[0] + ': la procedura NON sta piu\' nell\'avviso (D81)');
    eq(h.disp('helpBody'), '', 'openMs ' + c[0] + ': con l\'avviso l\'Aiuto e\' gia\' aperto');
    eq(h.env.scrolls.length, 0, 'openMs ' + c[0] + ': ...ma senza scorrere la pagina all\'avvio (D81)');
  });
  /* il caso di campo: 4 foto e file gonfio di record morti (run_s8_09_new.log, open = 2145 ms).
   * U-03/D81: l'avviso e' ridotto a una frase + un pulsantino «Aiuto»; la procedura sta una
   * volta sola, nella sezione Aiuto, che con l'avviso e' gia' aperta (senza scroll all'avvio). */
  (function () {
    var h = pageOpenMs(2145, 4), lead = h.txt('slowLead'), passi = liTexts(h.el('helpFix')), fix = h.txt('helpFix');
    eq(h.disp('slow'), '', 'openMs 2145 con 4 foto: avviso visibile');
    eq(h.el('slow').className, 'warn', 'l\'avviso usa la classe warn');
    eq(lead, Tit('slow_lead', '2,1'), 'testo dell\'avviso con i secondi: ' + lead);
    eq(h.txt('slowFix'), '', 'D81: #slowFix resta VUOTO (la procedura non si ripete)');
    eq(h.el('slowFix').children.length, 0, 'D81: e non ci si costruisce dentro nemmeno un nodo');
    eq(h.disp('helpBody'), '', 'D81: con l\'avviso l\'Aiuto e\' gia\' aperto');
    eq(h.el('helpBtn').attrs['aria-expanded'], 'true', 'D81: e il pulsante dell\'Aiuto lo dice');
    eq(h.env.scrolls.length, 0, 'D81: nessuno scorrimento all\'avvio');
    eq(passi.length, 4, 'procedura in 4 passi, nell\'Aiuto');
    eq(passi[0], Tit('fix_step_1'), '1) primo passo dal dizionario');
    eq(passi[1], Tit('fix_step_2'), '2) secondo passo dal dizionario');
    eq(passi[2], Tit('fix_step_3'), '3) terzo passo dal dizionario');
    pinStep3(passi[2], 'it', '3) Aiuto con avviso');        /* F11, pin load-bearing (U-02) */
    eq(passi[3], Tit('fix_step_4'), '4) quarto passo dal dizionario');
    contains(fix, Tit('fix_tail'), 'la coda rassicurante e\' quella del dizionario');
    /* F06 (pin load-bearing, U-02): con l'album pieno il ritorno delle foto dura minuti; il
     * testo lo dice e non promette mai "circa un minuto". Restano letterali di proposito. */
    check(fix.indexOf('in pochi minuti') >= 0, 'F06: la stima dice "in pochi minuti": ' + fix);
    check(fix.indexOf('circa un minuto') < 0, 'F06: niente promessa di "circa un minuto"');
    /* il pulsantino dell'avviso: riusa sec_help, apre l'Aiuto e porta la sezione in vista */
    eq(h.txt('slowHelpBtn'), Tit('sec_help'), 'D81: il pulsantino dice «Aiuto» (chiave sec_help)');
    h.click('slowHelpBtn');
    eq(h.disp('helpBody'), '', 'D81: dopo il tocco l\'Aiuto e\' (resta) aperto');
    eq(h.el('helpBtn').attrs['aria-expanded'], 'true', 'D81: aria-expanded di #helpBtn a true');
    eq(h.env.scrolls.length, 1, 'D81: il tocco porta in vista l\'Aiuto, una volta sola');
    eq(h.env.scrolls[0].id, 'help', 'D81: si porta in vista la SEZIONE #help (niente href="#help")');
    /* l'avviso non tocca il resto della pagina */
    eq(h.disp('status'), 'none', 'avviso di stato ancora nascosto');
    check(h.kbNum() >= 0, 'contatore KB calcolato lo stesso');
  })();
  /* il pulsantino c'e' anche quando l'Aiuto e' chiuso? no: senza avviso il riquadro e' nascosto,
   * ma il nodo resta nel markup e non deve fare niente di suo (nessuno scroll, nessun errore) */
  (function () {
    var h = pageOpenMs(0);
    eq(h.disp('slow'), 'none', 'senza avvio lento il riquadro e\' nascosto');
    eq(h.disp('helpBody'), 'none', 'e l\'Aiuto parte ripiegato');
    h.click('slowHelpBtn');                                 /* il nodo c'e' comunque: deve reggere */
    eq(h.disp('helpBody'), '', 'il pulsantino apre l\'Aiuto anche a riquadro nascosto');
    eq(h.env.scrolls[0].id, 'help', 'e porta in vista #help');
  })();

  /* --- sezione Aiuto: sempre presente, ripiegabile, stesso rimedio --- */
  (function () {
    var h = pageOpenMs(0), passi;
    check(h.disp('help') !== 'none', 'la sezione Aiuto è sempre visibile');
    eq(h.disp('helpBody'), 'none', 'il corpo dell\'Aiuto parte ripiegato');
    eq(h.el('helpBtn').textContent, Tit('help_btn'), 'titolo/pulsante dell\'Aiuto');
    eq(h.env.scrolls.length, 0, '#42 con l\'Aiuto chiuso non si e\' ancora scorso');
    h.click('helpBtn');
    eq(h.disp('helpBody'), '', 'un tocco apre l\'Aiuto');
    eq(h.el('helpBtn').attrs['aria-expanded'], 'true', 'aria-expanded true da aperto');
    /* #42: l'Aiuto e' l'ultima sezione sopra il footer fisso: aprendolo lo si porta in vista */
    eq(h.env.scrolls.length, 1, '#42 aprendo l\'Aiuto si scorre una volta sola');
    eq(h.env.scrolls[0].id, 'helpBody', '#42 si porta in vista #helpBody');
    eqJson(h.env.scrolls[0].opt, { block: 'start' }, '#42 opzione {block: "start"}');
    eq(h.env.scrolls[0].disp, '', '#42 chiamata quando il pannello e\' gia\' visibile');
    passi = liTexts(h.el('helpFix'));
    eq(passi.length, 4, 'Aiuto: la stessa procedura in 4 passi');
    eq(passi[2], Tit('fix_step_3'), 'Aiuto: il terzo passo dal dizionario');
    pinStep3(passi[2], 'it', 'Aiuto');                     /* F11, pin load-bearing (U-02) */
    contains(h.txt('helpFix'), Tit('fix_tail'), 'Aiuto: la stessa coda rassicurante');
    check(h.txt('helpFix').indexOf('in pochi minuti') >= 0,
          'F06: Aiuto, la stessa stima "in pochi minuti"');
    /* U-15: la spiegazione e' quella del dizionario, parola per parola, con il massimo delle
     * foto al posto di {0} (il vecchio pin — «non dice più di rado», «e' lunga» — lasciava
     * passare qualunque altro testo, segnaposto non sostituito compreso). Che il testo non
     * prometta una frequenza diversa lo garantisce il gate sulle sei colonne di messages.json. */
    eq(h.txt('helpWhy'), Tit('help_why', C.MAX_SLOTS),
       'Aiuto: la spiegazione dal dizionario, con {0} = il massimo delle foto');
    h.click('helpBtn');
    eq(h.disp('helpBody'), 'none', 'un secondo tocco lo richiude');
    eq(h.el('helpBtn').attrs['aria-expanded'], 'false', 'aria-expanded false da chiuso');
    eq(h.env.scrolls.length, 1, '#42 chiudendo l\'Aiuto non si scorre');
    h.click('helpBtn');
    eq(h.disp('helpBody'), '', 'si riapre (nessuno stato bloccato)');
    eq(h.env.scrolls.length, 2, '#42 riaprendolo si scorre di nuovo');
  })();
  /* U-15: la riga sulla sincronizzazione e' il primo paragrafo dell'Aiuto, si legge con il
   * corpo ancora ripiegato e segue la lingua come tutto il resto della pagina. */
  (function () {
    var h = pageOpenMs(0), p = helpSyncNode(h);
    eq(h.el('help').children.indexOf(p), 1, 'help_sync: primo paragrafo, subito dopo l\'h2');
    eq(h.disp('helpBody'), 'none', 'help_sync: si legge con l\'Aiuto ancora ripiegato');
    eq(p.textContent, Tit('help_sync'), 'help_sync: il testo viene dal dizionario');
    h.select('s_lang', '1');
    eq(p.textContent, Ten('help_sync'), 'help_sync: in inglese');
    h.select('s_lang', '3');
    eq(p.textContent, Tde('help_sync'), 'help_sync: in tedesco');
    h.select('s_lang', '6');
    eq(p.textContent, Tpt('help_sync'), 'help_sync: in portoghese');
  })();
  /* U-03/D81: con l'avviso l'Aiuto e' GIA' aperto all'avvio (senza scroll) e la procedura si
   * legge senza toccare niente; il pulsante resta un interruttore normale. */
  (function () {
    var h = pageOpenMs(2145, 4);
    eq(h.disp('helpBody'), '', 'Aiuto gia\' aperto con l\'avviso visibile, senza toccare niente');
    eq(h.env.scrolls.length, 0, 'D81: e senza scorrere la pagina all\'avvio');
    eqJson(liTexts(h.el('helpFix')), [Tit('fix_step_1'), Tit('fix_step_2'), Tit('fix_step_3'), Tit('fix_step_4')],
           'Aiuto con avviso: i 4 passi parola per parola');
    h.click('helpBtn');
    eq(h.disp('helpBody'), 'none', 'il pulsante lo richiude come sempre');
    eq(h.el('helpBtn').attrs['aria-expanded'], 'false', 'aria-expanded false da chiuso');
    eq(h.env.scrolls.length, 0, '#42 chiudendo non si scorre');
    h.click('helpBtn');
    eq(h.disp('helpBody'), '', 'e si riapre');
    eq(h.env.scrolls[0].id, 'helpBody', '#42 riaprendolo si scorre anche con l\'avviso visibile');
  })();
  /* F11 e F06 in tutte e sei le lingue (U-02): i due fatti load-bearing dell'Aiuto non
   * dipendono dall'italiano. Sostituiscono i vecchi pin letterali del passo 3. */
  (function () {
    var h = pageOpenMs(0), i, c, passi;
    for (i = 0; i < LANG_PIN.length; i++) {
      c = LANG_PIN[i];
      h.select('s_lang', c[0]);
      passi = liTexts(h.el('helpFix'));
      eq(passi.length, 4, 'F11 ' + c[1] + ': la procedura ha 4 passi');
      pinStep3(passi[2], c[1], 'Aiuto');
      check(!c[5].test(h.txt('helpFix')), 'F06 ' + c[1] + ': nessuna promessa di "circa un minuto"');
    }
  })();

  /* #42 guardato: DOM senza scrollIntoView (WebView vecchia) e scrollIntoView che lancia */
  (function () {
    var h = pageOpenMs(0), threw = false, called = 0, h2;
    h.el('helpBody').scrollIntoView = undefined;
    try { h.click('helpBtn'); } catch (e) { threw = true; }
    eq(threw, false, '#42 senza scrollIntoView: nessuna eccezione');
    eq(h.disp('helpBody'), '', '#42 senza scrollIntoView: l\'Aiuto si apre lo stesso');
    eq(h.env.scrolls.length, 0, '#42 senza scrollIntoView: nessuna chiamata registrata');
    h2 = pageOpenMs(0);
    h2.el('helpBody').scrollIntoView = function () { called++; throw new TypeError('argomento non valido'); };
    threw = false;
    try { h2.click('helpBtn'); } catch (e) { threw = true; }
    eq(threw, false, '#42 scrollIntoView che lancia: nessuna eccezione fuori dalla pagina');
    eq(called, 1, '#42 scrollIntoView che lancia: chiamata comunque');
    eq(h2.disp('helpBody'), '', '#42 scrollIntoView che lancia: l\'Aiuto resta aperto');
  })();
});

/* S8-stile (docs/design/galleria-s8-stile.md §5, D21/D22), rivista in UX-2: il campo «Stile
 * cifre» e i 6 font. Le regole stanno in applyRules() di page.js: LECO senza stile; «Bordo di
 * contrasto» MAI disabilitato (D62/D98: in layout B l'alone governa ancora «PM» e il contatore
 * di sync, e la pagina non conosce il formato effettivo); aiuto sui font solo con uno stile a
 * contorno E un font fra Anton/Bebas/Barlow (D98); niente piu' anteprima PNG (D95). */
section('4g. S8-stile: stile cifre (digit_style) e font 0..5', function () {
  var h = loadPage({ state: mkState({ settingsSet: true, settings: { layout: 0, font: 0, outline: 2 } }),
                     search: DEV_SEARCH }), G = h.G;
  /* S9 P5: riga di aiuto sotto «Stile cifre», visibile solo con lo stile diverso da pieno */
  var STYLE_HINT = Tit('style_hint');
  /* S9 R13: avviso in piu' solo su flint con lo stile trasparente (anello 1 px, D26) */
  var FLINT_HELP = Tit('style_flint_help');
  /* --- opzioni ed etichette --- */
  eqJson(h.el('s_digit_style').options().map(function (o) { return o.textContent; }),
         [Tit('opt_style_solid'), Tit('opt_style_transp'), Tit('opt_style_transp_3d'), Tit('opt_style_solid_3d')],
         'stile cifre: le 4 etichette in italiano');
  eqJson(h.el('s_font').options().map(function (o) { return o.textContent; }),
         ['Anton', 'Bebas Neue', 'Barlow Condensed', Tit('opt_font_leco'),
          'Francois One', 'Staatliches'],
         'font: i 6 nomi veri (S8-stile §2: 4 Francois One, 5 Staatliches; nessun segnaposto)');
  check(h.el('s_font').options().every(function (o) { return o.id !== 's_font_leco' || +o._value === 3; }),
        'font: l\'id s_font_leco resta solo sull\'opzione 3');

  /* --- stile pieno: niente disabilitato --- */
  eq(h.el('s_digit_style').value, '0', 'partenza: stile pieno');
  eq(h.el('s_outline').disabled, false, 'stile pieno: «Bordo di contrasto» attivo');
  eq(h.el('s_outline').value, '2', 'partenza: contorno "mai"');
  eq(h.txt('s_style_hint'), STYLE_HINT, 'aiuto dello stile: testo esatto (P5)');
  eq(h.disp('s_style_hint'), 'none', 'stile pieno: aiuto nascosto');

  /* --- UX-2/D62/D98: «Bordo di contrasto» resta scegliibile con OGNI stile --- */
  h.select('s_digit_style', '1');
  eq(h.el('s_outline').disabled, false, 'stile trasparente: «Bordo di contrasto» NON si disabilita (D62)');
  eq(h.el('s_outline').value, '2', 'stile trasparente: il valore del bordo resta');
  eq(G.buildPayload().settings.outline, 2, 'payload: bordo conservato');
  eq(G.buildPayload().settings.digit_style, 1, 'payload: digit_style 1');
  eq(fire(h.el('s_outline'), 'change'), true, 'D62: il campo e\' attivo, quindi il change parte davvero');
  eq(h.disp('s_style_hint'), '', 'stile trasparente + font Anton: aiuto visibile');
  h.select('s_digit_style', '2');
  eq(h.el('s_outline').disabled, false, 'stile trasparente 3D: bordo ancora attivo (D62)');
  eq(G.buildPayload().settings.digit_style, 2, 'payload: digit_style 2');
  eq(h.disp('s_style_hint'), '', 'stile trasparente 3D: aiuto visibile');
  eq(h.txt('s_style_hint'), STYLE_HINT, 'aiuto dello stile: il testo non cambia col valore');
  h.select('s_digit_style', '3');
  eq(h.el('s_outline').disabled, false, 'stile pieno 3D: bordo attivo');
  eq(G.buildPayload().settings.digit_style, 3, 'payload: digit_style 3');
  /* D98: «pieno con ombra» non e' uno stile a contorno: l'aiuto sui font non c'entra */
  eq(h.disp('s_style_hint'), 'none', 'D98: stile pieno 3D, aiuto NASCOSTO');
  h.select('s_digit_style', '0');
  eq(h.disp('s_style_hint'), 'none', 'ritorno a pieno: aiuto ancora nascosto');
  h.select('s_digit_style', '2');

  /* --- LECO: nessuno sprite, quindi nessuno stile (D21) --- */
  h.select('s_font', '3');
  eq(h.el('s_digit_style').disabled, true, 'LECO: stile cifre disabilitato');
  eq(h.el('s_digit_style').value, '0', 'LECO: stile cifre riportato a pieno');
  eq(h.disp('s_style_hint'), 'none', 'LECO: stile 0, aiuto nascosto');
  eq(h.el('s_outline').disabled, false, 'LECO: bordo attivo (lo stile vale 0)');
  eq(G.buildPayload().settings.digit_style, 0, 'payload: con LECO lo stile e\' 0');
  eq(fire(h.el('s_digit_style'), 'change'), false, 'stile cifre disabilitato non manda change');
  h.select('s_font', '0');
  eq(h.el('s_digit_style').disabled, false, 'via da LECO: stile cifre riattivato');
  eq(h.el('s_digit_style').value, '0', 'via da LECO: lo stile resta pieno');
  eq(h.disp('s_style_hint'), 'none', 'via da LECO: stile 0, aiuto ancora nascosto');
  /* anche il layout Tutto schermo, che scaccia LECO, lascia lo stile utilizzabile */
  h.select('s_digit_style', '2');
  h.select('s_layout', '1');
  eq(h.el('s_digit_style').disabled, false, 'layout Tutto schermo: stile cifre attivo');
  eq(h.el('s_digit_style').value, '2', 'layout Tutto schermo: lo stile scelto resta');
  eq(h.disp('s_style_hint'), '', 'layout Tutto schermo: l\'aiuto segue lo stile 2');
  /* il layout che scaccia LECO passa comunque da applyRules: font 0, stile 0, aiuto via */
  h.select('s_layout', '0');
  h.select('s_font', '3');
  h.select('s_layout', '1');
  eq(h.el('s_font').value, '0', 'layout Tutto schermo: LECO sostituito dal font 0');
  eq(h.el('s_digit_style').value, '0', 'layout che scaccia LECO: lo stile resta 0');
  eq(h.disp('s_style_hint'), 'none', 'layout che scaccia LECO: aiuto nascosto');
  h.select('s_digit_style', '2');                 /* stato ripristinato per il blocco dei font */

  /* --- font nuovi: valore nel payload; l'anteprima adesso e' quella della watchface (D95) --- */
  h.select('s_font', '4');
  eqJson([G.buildPayload().settings.font, G.buildPayload().settings.digit_style], [4, 2],
         'payload: font 4 con stile trasparente 3D');
  /* D98: con Francois One (4) l'aiuto «rendono meglio Francois One e Staatliches» sarebbe un
   * consiglio gia' seguito: si nasconde, pur restando uno stile a contorno */
  eq(h.disp('s_style_hint'), 'none', 'D98: font 4 con stile trasparente 3D, aiuto nascosto');
  h.select('s_font', '5');
  eq(G.buildPayload().settings.font, 5, 'payload: font 5');
  eq(h.disp('s_style_hint'), 'none', 'D98: font 5 (Staatliches), aiuto nascosto');
  h.select('s_font', '2');
  eq(h.disp('s_style_hint'), '', 'D98: font 2 (Barlow) con stile a contorno, aiuto di nuovo visibile');
  eq(G.buildPayload().settings.font, 2, 'payload: font 2');

  /* --- le impostazioni ricevute dall'orologio si rileggono nei campi --- */
  var h2 = loadPage({ state: mkState({ settingsSet: true, settings: { font: 5, digit_style: 2, outline: 1 } }),
                      search: DEV_SEARCH });
  eq(h2.el('s_font').value, '5', 'stato con font 5: campo scritto');
  eq(h2.el('s_digit_style').value, '2', 'stato con digit_style 2: campo scritto');
  eq(h2.el('s_outline').disabled, false, 'D62: il bordo resta attivo anche all\'apertura con uno stile a contorno');
  eq(h2.el('s_outline').value, '1', 'stato con stile trasparente: valore del bordo conservato');
  eq(h2.disp('s_style_hint'), 'none', 'D98: stato con font 5 e stile 2, aiuto nascosto (il font e\' gia\' uno dei due)');
  eq(h2.txt('s_style_hint'), STYLE_HINT, 'il testo dell\'aiuto c\'e\' comunque nel nodo');
  eqJson([h2.G.buildPayload().settings.font, h2.G.buildPayload().settings.digit_style,
          h2.G.buildPayload().settings.outline], [5, 2, 1], 'payload: font 5, stile 2, contorno 1');
  /* anche lo stile 1 (trasparente semplice) apre con l'aiuto gia' a video */
  var h1 = loadPage({ state: mkState({ settingsSet: true, settings: { font: 4, digit_style: 1 } }),
                      search: DEV_SEARCH });
  eq(h1.el('s_digit_style').value, '1', 'stato con digit_style 1: campo scritto');
  eq(h1.disp('s_style_hint'), 'none', 'D98: font 4 con stile 1, aiuto nascosto all\'apertura');
  eq(loadPage({ state: mkState({ settingsSet: true, settings: { font: 1, digit_style: 1 } }),
                search: DEV_SEARCH }).disp('s_style_hint'), '',
     'D98: font 1 (Bebas) con stile 1, aiuto visibile all\'apertura');
  /* uno stato con LECO e uno stile: normalizeSettings lo azzera prima ancora della UI */
  var h3 = loadPage({ state: mkState({ settingsSet: true, settings: { font: 3, digit_style: 3 } }),
                      search: DEV_SEARCH });
  eq(h3.el('s_digit_style').value, '0', 'stato LECO + stile: il campo parte da 0');
  eq(h3.el('s_digit_style').disabled, true, 'stato LECO: campo disabilitato all\'avvio');
  eq(h3.disp('s_style_hint'), 'none', 'stato LECO: aiuto nascosto all\'apertura');
  eq(h3.G.buildPayload().settings.digit_style, 0, 'stato LECO: payload con stile 0');

  /* --- D26: su Pebble 2 Duo (flint) non c'e' l'ombra 3D --- */
  /* le due opzioni con ombra hanno un id stabile, come l'opzione LECO del font (le altre no) */
  eqJson(h.el('s_digit_style').options().map(function (o) { return o.id; }),
         ['', '', 's_digit_style_3d1', 's_digit_style_3d2'],
         'stile cifre: id stabili sulle due opzioni 3D');
  /* emery: niente disabilitato, niente normalizzazione, etichette invariate */
  var he = loadPage({ state: mkState({ settingsSet: true, settings: { font: 0, digit_style: 2 } }),
                      search: DEV_SEARCH });
  eq(he.el('s_digit_style').value, '2', 'emery: lo stile trasparente 3D resta 2');
  eq(he.el('s_digit_style_3d1').disabled, false, 'emery: opzione trasparente 3D attiva');
  eq(he.el('s_digit_style_3d2').disabled, false, 'emery: opzione pieno 3D attiva');
  check(!he.el('s_digit_style_3d1').hidden, 'D86: su emery le option 3D non sono nascoste');
  check(!he.el('s_digit_style_3d2').hidden, 'D86: nemmeno «pieno con ombra»');
  eq(he.el('s_digit_style_3d1').textContent, Tit('opt_style_transp_3d'),
     'emery: etichetta senza avvertenza');
  eq(he.G.buildPayload().settings.digit_style, 2, 'emery: payload con stile 2');
  eq(he.disp('s_style_hint'), '', 'emery: stile 2, aiuto visibile');
  he.select('s_digit_style', '3');
  eq(he.el('s_digit_style').value, '3', 'emery: anche lo stile pieno 3D resta scegliibile');

  /* flint: le due opzioni 3D spente e il valore che scende (2 -> 1) gia' al caricamento */
  var hf = loadPage({ state: mkState({ platform: 'flint', fmt: 2, settingsSet: true,
                                       settings: { font: 0, digit_style: 2, outline: 1 } }),
                      search: DEV_SEARCH });
  eq(hf.G.state.platform, 'flint', 'stato flint');
  eq(hf.el('s_digit_style').value, '1', 'flint: stile 2 normalizzato a 1 (trasparente senza ombra)');
  eq(hf.el('s_digit_style_3d1').disabled, true, 'flint: opzione trasparente 3D disabilitata');
  eq(hf.el('s_digit_style_3d2').disabled, true, 'flint: opzione pieno 3D disabilitata');
  /* D86: disabled E hidden insieme, mai hidden da solo (iOS lo ignora e da solo non spegnerebbe
   * nulla). Si guarda la verita' dell'attributo, non come page.js lo scrive. */
  check(!!hf.el('s_digit_style_3d1').hidden, 'D86: «contorno con ombra» e\' anche nascosta (hidden)');
  check(!!hf.el('s_digit_style_3d2').hidden, 'D86: idem per «pieno con ombra»');
  check(!hf.el('s_digit_style').options()[0].hidden, 'D86: «pieno» resta visibile su flint');
  check(!hf.el('s_digit_style').options()[1].hidden, 'D86: e anche «solo contorno»');
  eq(hf.el('s_digit_style').options()[0].disabled, false, 'flint: "pieno" resta scegliibile');
  eq(hf.el('s_digit_style').options()[1].disabled, false, 'flint: "trasparente" resta scegliibile');
  eq(hf.el('s_digit_style').disabled, false, 'flint: la select resta usabile');
  eq(hf.el('s_digit_style_3d1').textContent, Tit('opt_style_no_flint', Tit('opt_style_transp_3d')),
     'flint: l\'etichetta dice perche\' l\'opzione e\' spenta');
  eq(hf.el('s_digit_style_3d2').textContent, Tit('opt_style_no_flint', Tit('opt_style_solid_3d')),
     'flint: avvertenza anche sullo stile pieno 3D');
  eq(hf.G.buildPayload().settings.digit_style, 1, 'flint: payload con lo stile normalizzato');
  eq(fire(hf.el('s_digit_style_3d1'), 'click'), false, 'flint: l\'opzione spenta non riceve eventi');
  /* D62/D98: il bordo non si disabilita mai, nemmeno su flint con lo stile a contorno */
  eq(hf.el('s_outline').disabled, false, 'flint: stile 1, «Bordo di contrasto» sempre scegliibile (D62)');
  eq(hf.el('s_outline').value, '1', 'flint: valore del bordo conservato');
  /* D26: l'aiuto segue il valore NORMALIZZATO, come "Contorno": 2 -> 1 resta uno stile
   * trasparente (aiuto visibile), 3 -> 0 e' pieno (aiuto nascosto) */
  eq(hf.disp('s_style_hint'), '', 'flint: stile 2 normalizzato a 1, aiuto visibile');
  eq(hf.txt('s_style_hint'), STYLE_HINT, 'flint: stesso testo dell\'aiuto');

  /* apertura di uno stato flint con lo stile 3: la normalizzazione scatta gia' nei campi */
  var hf3 = loadPage({ state: mkState({ platform: 'flint', fmt: 2, settingsSet: true,
                                        settings: { font: 0, digit_style: 3 } }),
                       search: DEV_SEARCH });
  eq(hf3.el('s_digit_style').value, '0', 'flint: stile 3 normalizzato a 0 all\'apertura');
  eq(hf3.G.buildPayload().settings.digit_style, 0, 'flint: payload con stile 0 all\'apertura');
  eq(hf3.disp('s_style_hint'), 'none', 'flint: stile 3 -> 0 all\'apertura, aiuto nascosto');

  /* change su flint: 3 -> 0 (pieno senza ombra), 2 -> 1 */
  hf.select('s_digit_style', '3');
  eq(hf.el('s_digit_style').value, '0', 'flint: al change lo stile 3 diventa 0 (pieno)');
  eq(hf.G.buildPayload().settings.digit_style, 0, 'flint: payload con stile 0 dopo il change');
  eq(hf.el('s_outline').disabled, false, 'flint: con lo stile pieno il bordo resta attivo');
  eq(hf.disp('s_style_hint'), 'none', 'flint: stile 3 normalizzato a 0 (pieno), aiuto nascosto');
  hf.select('s_digit_style', '2');
  eq(hf.el('s_digit_style').value, '1', 'flint: al change anche lo stile 2 diventa 1');
  eq(hf.G.buildPayload().settings.digit_style, 1, 'flint: payload 1 dopo il change');
  eq(hf.disp('s_style_hint'), '', 'flint: stile 2 -> 1 al change, aiuto visibile');
  hf.select('s_digit_style', '1');
  eq(hf.el('s_digit_style').value, '1', 'flint: lo stile trasparente si sceglie normalmente');
  eq(hf.disp('s_style_hint'), '', 'flint: stile 1, aiuto visibile');

  /* R13 (05/09): su flint l'anello e' 1 px (D26) -> avviso sotto la select, solo con lo stile
   * trasparente. Il paragrafo sta subito dopo l'aiuto sui font di P5 (stesso punto del markup). */
  check(PAGE_HTML.indexOf('id="styleFlintHelp"') > PAGE_HTML.indexOf('id="s_style_hint"') &&
        PAGE_HTML.indexOf('id="styleFlintHelp"') < PAGE_HTML.indexOf('id="s_text_color"'),
        'markup: l\'avviso flint sta fra l\'aiuto dei font e «Colore dell\'ora» (U-08)');
  eq(hf.disp('styleFlintHelp'), '', 'flint + trasparente: avviso sul contorno da 1 px visibile');
  eq(hf.txt('styleFlintHelp'), FLINT_HELP, 'flint: testo esatto dell\'avviso (R13)');
  eq(he.disp('styleFlintHelp'), 'none', 'emery: nessun avviso sul contorno');
  /* il caso che conta per il controllo di piattaforma: emery CON lo stile trasparente (sv 1).
   * Senza questa riga un codice che guardasse solo lo stile passerebbe i test. */
  he.select('s_digit_style', '1');
  eq(he.disp('styleFlintHelp'), 'none', 'emery + stile trasparente: nessun avviso sul contorno');
  hf.select('s_digit_style', '0');
  eq(hf.disp('styleFlintHelp'), 'none', 'flint + pieno: avviso nascosto');
  hf.select('s_digit_style', '1');
  eq(hf.disp('styleFlintHelp'), '', 'flint: tornando al trasparente l\'avviso ricompare');

  /* su flint le altre regole non cambiano: LECO azzera lo stile, l'anteprima segue il font */
  hf.select('s_font', '3');
  eq(hf.el('s_digit_style').disabled, true, 'flint + LECO: stile cifre disabilitato (D21)');
  eq(hf.el('s_digit_style').value, '0', 'flint + LECO: stile 0');
  eq(hf.disp('s_style_hint'), 'none', 'flint + LECO: aiuto nascosto');
  hf.select('s_font', '5');
  eq(hf.el('s_digit_style').disabled, false, 'flint: via da LECO lo stile torna scegliibile');
  eq(hf.el('s_digit_style').value, '0', 'flint: lo stile resta pieno');
  eq(hf.disp('s_style_hint'), 'none', 'flint: via da LECO con lo stile 0, aiuto ancora nascosto');
  hf.select('s_layout', '1');
  eq(hf.el('s_font_leco').disabled, true, 'flint: layout Tutto schermo disabilita LECO (regola invariata)');
  eq(hf.el('s_digit_style_3d1').disabled, true, 'flint: le opzioni 3D restano spente dopo altri cambi');

  /* orologio sconosciuto: la regola vale solo per flint */
  var hu = loadPage({ state: mkState({ platform: 'sconosciuta', fmt: 2, settingsSet: true,
                                       settings: { font: 0, digit_style: 2 } }),
                      search: DEV_SEARCH });
  eq(hu.G.state.platform, 'unknown', 'piattaforma sconosciuta: platform "unknown"');
  eq(hu.el('s_digit_style').value, '2', 'piattaforma sconosciuta: stile 2 conservato');
  eq(hu.el('s_digit_style_3d1').disabled, false, 'piattaforma sconosciuta: opzioni 3D attive');
  eq(hu.el('s_digit_style_3d2').disabled, false, 'piattaforma sconosciuta: nessuna disabilitazione');
  check(!hu.el('s_digit_style_3d1').hidden, 'D86: piattaforma sconosciuta, nessuna option nascosta');
  eq(hu.el('s_digit_style_3d2').textContent, Tit('opt_style_solid_3d'),
     'piattaforma sconosciuta: etichetta invariata');
  eq(hu.G.buildPayload().settings.digit_style, 2, 'piattaforma sconosciuta: payload con stile 2');
  eq(hu.disp('s_style_hint'), '', 'piattaforma sconosciuta: stile 2, aiuto visibile');
  eq(hu.disp('styleFlintHelp'), 'none', 'piattaforma sconosciuta: nessun avviso sul contorno');
  hu.select('s_digit_style', '1');
  eq(hu.disp('styleFlintHelp'), 'none', 'piattaforma sconosciuta + stile trasparente: nessun avviso');
});

/* ======================= 5. S10: lingua della config page (D33, D35, D36) =============== */

function optTexts(h, id) { return h.el(id).options().map(function (o) { return o.textContent; }); }
function optVals(h, id) { return h.el(id).options().map(function (o) { return o._value; }); }
function optIds(h, id) { return h.el(id).options().map(function (o) { return o.id; }); }
/* stesso T() delle altre lingue: con a/b sostituisce i segnaposto come Tit, senza li lascia */
function Tlang(col, k, a, b) {
  var i = I18N.keys.indexOf(k), t = (i >= 0) ? col[i] : String(k), v = [a, b];
  return t.replace(/\{([01])\}/g, function (m, x) { return v[+x] === undefined ? m : v[+x]; });
}
function Ten(k, a, b) { return Tlang(I18N.en, k, a, b); }
function Tde(k, a, b) { return Tlang(I18N.de, k, a, b); }
function Tes(k, a, b) { return Tlang(I18N.es, k, a, b); }
function Tpt(k, a, b) { return Tlang(I18N.pt, k, a, b); }

section('5a. lingua: automatica dall\'orologio, override dalla select', function () {
  var h = loadPage({ state: mkState({ settings: { lang: 0 } }) }), kb = h.kbNum();
  eq(h.el('s_lang').value, '0', 'parte da Automatica (lang 0)');
  eq(h.el('s_lang').options().length, 7, 'Lingua: Automatica + 6 lingue (S11/D39)');
  eqJson(optVals(h, 's_lang'), ['0', '1', '2', '3', '4', '5', '6'], 'valori 0..6 (= GalSettings.lang, D31/D39)');
  eqJson(optTexts(h, 's_lang').slice(1), ['English', 'Italiano', 'Deutsch', 'Français', 'Español', 'Português'],
         'le 6 lingue con il loro nome (endonimi), es e pt in coda (D39)');
  contains(optTexts(h, 's_lang')[0], 'Italiano', 'Automatica dice quale lingua risulta (orologio it)');
  eq(optTexts(h, 's_lang')[0], Tit('opt_lang_auto', 'Italiano'), 'etichetta di Automatica dal dizionario');
  /* UX-2 D99: watch_emery e' uscita dal dizionario — «Pebble Time 2» e' un NOME PROPRIO, cablato
   * in page.js e identico in tutte e sei le lingue (D35). La lingua della pagina si legge quindi
   * su un testo che si traduce davvero: il pulsante dell'Aiuto e il contatore dei KB. */
  eq(h.txt('watch'), 'Pebble Time 2', 'auto it: emery e\' sempre «Pebble Time 2» (D99)');
  eq(h.txt('helpBtn'), Tit('help_btn'), 'auto it: pulsante dell\'Aiuto in italiano');
  eq(h.txt('kb'), Tit('kb_line', kb, 900), 'auto it: contatore KB in italiano');
  eq(optTexts(h, 's_digit_style')[0], Tit('opt_style_solid'), 'auto it: prima voce di Stile cifre');

  /* override: la select vince sulla lingua dell'orologio, subito e senza salvare */
  h.select('s_lang', '1');
  eq(h.txt('helpBtn'), Ten('help_btn'), 'inglese: pulsante dell\'Aiuto');
  eq(h.txt('watch'), 'Pebble Time 2', 'inglese: il nome dell\'orologio non si traduce (D99)');
  eq(h.txt('kb'), Ten('kb_line').replace('{0}', kb).replace('{1}', '900'), 'inglese: contatore KB');
  eq(optTexts(h, 's_digit_style')[0], Ten('opt_style_solid'), 'inglese: prima voce di Stile cifre');
  eq(optTexts(h, 's_lang')[0], Ten('opt_lang_auto').replace('{0}', 'Italiano'),
     'inglese: Automatica resta l\'italiano dell\'orologio');
  h.select('s_lang', '3');
  eq(h.txt('helpBtn'), Tde('help_btn'), 'tedesco: pulsante dell\'Aiuto');
  h.select('s_lang', '5');
  eq(h.txt('helpBtn'), Tes('help_btn'), 'spagnolo: pulsante dell\'Aiuto (S11)');
  eq(optTexts(h, 's_digit_style')[0], Tes('opt_style_solid'), 'spagnolo: prima voce di Stile cifre');
  h.select('s_lang', '6');
  eq(h.txt('helpBtn'), Tpt('help_btn'), 'portoghese: pulsante dell\'Aiuto (S11)');
  eq(h.txt('kb'), Tpt('kb_line').replace('{0}', kb).replace('{1}', '900'), 'portoghese: contatore KB');
  eq(h.txt('watch'), 'Pebble Time 2', 'portoghese: nome dell\'orologio invariato');
  h.select('s_lang', '2');
  eq(h.txt('helpBtn'), Tit('help_btn'), 'italiano: si torna indietro');
  /* la lingua e' un'impostazione come le altre */
  eq(h.G.buildPayload().settings.lang, 2, 'la lingua entra nel payload');
  eq(h.el('save').disabled, false, 'nessun blocco: si salva come sempre');

  /* D99: su flint la riga resta una chiave del dizionario e segue la lingua */
  var hfl = loadPage({ state: mkState({ platform: 'flint', fmt: 2, settings: { lang: 0 } }) });
  eq(hfl.txt('watch'), Tit('watch_flint'), 'auto it: riga di flint dal dizionario');
  hfl.select('s_lang', '1');
  eq(hfl.txt('watch'), Ten('watch_flint'), 'inglese: riga di flint');
  hfl.select('s_lang', '3');
  eq(hfl.txt('watch'), Tde('watch_flint'), 'tedesco: riga di flint');

  /* lingua dell'orologio diversa: in automatica la pagina la segue (D33) */
  var h2 = loadPage({ state: mkState({ lang_auto: 'de', settings: { lang: 0 } }) });
  eq(h2.txt('helpBtn'), Tde('help_btn'), 'auto de: pagina in tedesco');
  contains(optTexts(h2, 's_lang')[0], 'Deutsch', 'auto de: l\'etichetta lo dice');
  var h3 = loadPage({ state: mkState({ lang_auto: 'de', settings: { lang: 2 } }) });
  eq(h3.txt('helpBtn'), Tit('help_btn'), 'override it su orologio de');
  /* orologio spagnolo: dopo S11 e' una lingua vera della pagina (D39), non piu' un ripiego */
  var h4 = loadPage({ state: mkState({ lang_auto: 'es', settings: { lang: 0 } }) });
  eq(h4.txt('helpBtn'), Tes('help_btn'), 'auto es: pagina in spagnolo (S11/D39)');
  contains(optTexts(h4, 's_lang')[0], 'Español', 'auto es: l\'etichetta lo dice');
  /* lingua sconosciuta (orologio russo, o PKJS vecchio): ripiego inglese */
  var h5 = loadPage({ state: mkState({ lang_auto: 'ru', settings: { lang: 0 } }) });
  eq(h5.txt('helpBtn'), Ten('help_btn'), 'lingua ignota: ripiego inglese');
});

section('5b. lingua: id e valori stabili, niente segnaposto, decimali (D35/D36)', function () {
  var h = loadPage({ state: mkState({ settings: { lang: 2, font: 4, digit_style: 1 } }) });
  var ids0 = {}, vals0 = {}, i, k, sel = ['lang', 'layout', 'font', 'digit_style', 'clock_mode',
    'leading_zero', 'interval_min', 'order', 'text_color', 'outline'];
  for (i = 0; i < sel.length; i++) { ids0[sel[i]] = optIds(h, 's_' + sel[i]).join(','); vals0[sel[i]] = optVals(h, 's_' + sel[i]).join(','); }
  /* decimali: virgola in it/de/fr/es/pt (D42), punto in inglese */
  h.range('gamma', 1.5); h.range('lift', 0.2);
  eq(h.txt('gammaVal'), '1,50', 'italiano: 1,50');
  eq(h.txt('liftVal'), '0,20', 'italiano: 0,20');
  h.select('s_lang', '1');
  eq(h.txt('gammaVal'), '1.50', 'inglese: 1.50');
  eq(h.txt('liftVal'), '0.20', 'inglese: 0.20');
  h.select('s_lang', '4');
  eq(h.txt('gammaVal'), '1,50', 'francese: 1,50');
  h.select('s_lang', '5');
  eq(h.txt('gammaVal'), '1,50', 'spagnolo: 1,50 (D42: nessuna eccezione al separatore)');
  h.select('s_lang', '6');
  eq(h.txt('liftVal'), '0,20', 'portoghese: 0,20');
  /* le <option> hanno cambiato solo il testo */
  for (i = 0; i < sel.length; i++) {
    k = sel[i];
    eq(optIds(h, 's_' + k).join(','), ids0[k], 'id delle option invariati: ' + k);
    eq(optVals(h, 's_' + k).join(','), vals0[k], 'valori delle option invariati: ' + k);
  }
  eq(h.el('s_font').value, '4', 'la scelta del font non si perde cambiando lingua');
  eq(h.el('s_digit_style').value, '1', 'ne\' quella dello stile');
  eq(h.el('dither').value, 'fs', 'ne\' il dithering (la select si rifa\' col formato)');
  eqJson(optVals(h, 'dither'), ['fs', 'bayer', 'none'], 'dithering: valori invariati');
  /* nessun testo vuoto e nessun segnaposto rimasto, in tutte e 6 le lingue */
  function scan(node, out) {
    var c = node.children, j, e, key;
    for (j = 0; j < c.length; j++) {
      e = c[j];
      key = e.attrs && e.attrs['data-i18n'];
      if (key) {
        if (!e.textContent) { out.push('vuoto:' + key); }
        if (/\{[01]\}/.test(e.textContent)) { out.push('segnaposto:' + key); }
      }
      scan(e, out);
    }
    return out;
  }
  var codes = ['1', '2', '3', '4', '5', '6'], n;
  /* pin load-bearing (3): il «12» del contatore arriva sempre da C.MAX_SLOTS, mai cablato in una
   * lingua. Servono DUE pagine: quella di 5b ha l'album vuoto e mostra `photos_cap_empty` (D71),
   * quindi da sola non pinnerebbe piu' `photos_cap` «{0} di {1} foto». */
  var hp = loadPage({ state: stateEmery() });
  for (i = 0; i < codes.length; i++) {
    h.select('s_lang', codes[i]);
    hp.select('s_lang', codes[i]);
    eqJson(scan(h.root, []), [], 'lingua ' + codes[i] + ': nessun nodo vuoto o con segnaposto');
    n = optTexts(h, 's_interval_min');
    eq(n.length, 7, 'lingua ' + codes[i] + ': 7 intervalli');
    check(n.every(function (t) { return t && t.indexOf('{') < 0; }), 'lingua ' + codes[i] + ': intervalli scritti');
    check(h.txt('photosCap').indexOf('12') >= 0,
          'lingua ' + codes[i] + ': album vuoto, il contatore dice 12 ("' + h.txt('photosCap') + '")');
    check(hp.txt('photosCap').indexOf('12') >= 0,
          'lingua ' + codes[i] + ': album pieno, il contatore dice 12 ("' + hp.txt('photosCap') + '")');
  }
  /* le <option> del markup (Anteprima) e l'attributo title (data-i18n-title) */
  h.select('s_lang', '2');
  eqJson(optTexts(h, 'previewMode'), [Tit('opt_prev_sun'), Tit('opt_prev_nominal')],
         'anteprima: le due opzioni del markup tradotte');
  h.el('helpBtn').setAttribute('data-i18n-title', K('help_why'));
  h.select('s_lang', '1');
  eq(h.el('helpBtn').title, Ten('help_why'), 'data-i18n-title: anche l\'attributo title si traduce');
  eqJson(optTexts(h, 'previewMode'), [Ten('opt_prev_sun'), Ten('opt_prev_nominal')],
         'anteprima: opzioni in inglese');
  /* UX-2 D87: le frecce del font non hanno testo da tradurre (‹ ›), ma il loro nome accessibile
   * (aria-label e title) viene dal dizionario come tutto il resto e segue la lingua. */
  h.select('s_lang', '2');
  eq(attrOf(h.el('fontPrev'), 'aria-label'), Tit('font_prev'), 'frecce: aria-label indietro in italiano');
  eq(attrOf(h.el('fontNext'), 'aria-label'), Tit('font_next'), 'frecce: aria-label avanti in italiano');
  eq(attrOf(h.el('fontPrev'), 'title'), Tit('font_prev'), 'frecce: title indietro in italiano');
  h.select('s_lang', '3');
  eq(attrOf(h.el('fontPrev'), 'aria-label'), Tde('font_prev'), 'frecce: aria-label indietro in tedesco');
  eq(attrOf(h.el('fontNext'), 'aria-label'), Tde('font_next'), 'frecce: aria-label avanti in tedesco');
  eq(attrOf(h.el('fontNext'), 'title'), Tde('font_next'), 'frecce: title avanti in tedesco');
  eq(h.el('fontPrev').textContent, '\u2039', 'frecce: il glifo ‹ non cambia con la lingua');
  eq(h.el('fontNext').textContent, '\u203a', 'frecce: il glifo › non cambia con la lingua');
  /* UX-2 D89/U-16: le sei option degli endonimi portano lang="xx", cosi' lo screen reader le
   * pronuncia nella loro lingua; «Automatica», che e' nella lingua della pagina, no. */
  eqJson(h.el('s_lang').options().slice(1).map(function (o) { return attrOf(o, 'lang'); }), C.LANGS,
         'D89: le sei option degli endonimi portano lang="en".."pt"');
  check(!attrOf(h.el('s_lang').options()[0], 'lang'),
        'D89: «Automatica» non ha lang (e\' scritta nella lingua della pagina)');
  /* <html lang> segue la lingua effettiva */
  h.select('s_lang', '3');
  eq(h.doc.documentElement.lang, 'de', '<html lang> aggiornato');
  h.select('s_lang', '0');
  eq(h.doc.documentElement.lang, 'it', '<html lang> torna alla lingua dell\'orologio');
});

/* 5c — il rovescio della 5b. Dopo S10 il markup non porta piu' i testi (nodi vuoti riempiti da
 * applyLang): togliere o sbagliare un data-i18n lascia l'etichetta VUOTA a schermo per sempre, e
 * la scansione della 5b non se ne accorge perche' guarda solo i nodi CHE HANNO data-i18n. Qui si
 * guarda il risultato a schermo: nessuna etichetta-guida (.rlab), nessun titolo di sezione (h2) e
 * nessun pulsante (.btn) puo' restare senza testo, in Automatica e in tutte e 6 le lingue.
 * Sensibilita' verificata con un mutante su una copia dell'albero (data-i18n tolto dalla label di
 * #s_layout, config_page.js rigenerato): rosso in entrambi i giri, verde sul codice vero. */
section('5c. lingua: nessuna etichetta vuota a schermo dopo applyLang', function () {
  var h = loadPage({ state: mkState({}) }), codes = ['0', '1', '2', '3', '4', '5', '6'], i, n = 0, col;
  /* colonna del dizionario per ogni valore della select: 0 = automatica, e l'orologio finto
   * di mkState e' italiano (lang_auto 'it'). */
  var LC = ['it', 'en', 'it', 'de', 'fr', 'es', 'pt'];
  function watched(e) { return e.tagName === 'H2' || e.tagName === 'H3' || /\b(rlab|btn)\b/.test(e.className || ''); }
  function nameOf(e) {
    var a = e.attrs || {};
    return e.tagName + ':' + (e.id || a['for'] || a['data-i18n'] || '?');
  }
  function scan(node, out) {
    var c = node.children, j, e;
    for (j = 0; j < c.length; j++) {
      e = c[j];
      if (watched(e) && !/\S/.test(String(e.textContent || ''))) { out.push(nameOf(e)); }
      scan(e, out);
    }
    return out;
  }
  function count(node) {
    var c = node.children, j;
    for (j = 0; j < c.length; j++) { if (watched(c[j])) { n++; } count(c[j]); }
  }
  count(h.root);
  check(n >= 32, 'la scansione copre le etichette del markup (h2 + h3 + .rlab + .btn): ' + n);
  for (i = 0; i < codes.length; i++) {
    h.select('s_lang', codes[i]);
    eqJson(scan(h.root, []), [], 'lingua ' + codes[i] + ': nessuna etichetta .rlab/.btn/h2 vuota');
    /* UX-3 (D107): #save e #cancel non hanno piu' data-i18n — li scrive footerLabels, che
     * applyLang chiama in coda, dopo walkI18n. La scansione qui sopra li vedrebbe vuoti se
     * saltasse; qui si controlla che dicano anche la cosa GIUSTA. Attenzione: scegliere una
     * lingua E' una modifica, quindi da «1» in poi la pagina e' sporca e Esci passa da
     * «Chiudi» a «Esci senza salvare». */
    /* UX-3: #editAdvBtn e' un .btn il cui testo sta in uno SPAN senza classe, accanto alla
     * freccia ▾: la scansione qui sopra lo vedrebbe pieno anche con lo span vuoto (il ▾ basta
     * a non farlo sembrare vuoto), quindi lo span si guarda a parte. #editPrevCap invece non
     * e' fra i nodi sorvegliati (e' un <p class="help">) e a editor chiuso e' vuoto per
     * costruzione: le sue didascalie si provano in 2f, 6d e 8d. */
    check(/\S/.test(h.el('editAdvBtn').children[0].textContent),
          'lingua ' + codes[i] + ': l\'etichetta di «Regolazioni della foto» non e\' vuota');
    col = I18N[LC[+codes[i]]];
    eq(h.txt('save'), Tlang(col, 'btn_save'), 'lingua ' + codes[i] + ': «Salva» tradotto dal footer');
    eq(h.txt('cancel'), Tlang(col, codes[i] === '0' ? 'btn_close' : 'btn_cancel'),
       'lingua ' + codes[i] + ': anche l\'altro pulsante del footer');
  }
});

/* ============================== 6. S12: anteprima della watchface ======================= */

section('6a. S12 anteprima: che cosa riceve il motore, canvas 2x, didascalia senza foto', function () {
  var h = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks(), preview_time: '12:34' }),
                     search: DEV_SEARCH });
  var cv = h.el('wfPreview'), o, hf, h2;
  check(h.env.previewCalls.length >= 1, 'all\'avvio l\'anteprima si disegna (' + h.env.previewCalls.length + ' chiamate)');
  o = lastCall(h);
  eq(o.fmt, 1, 'anteprima: formato 1 (emery)');
  eq(o.w, 200, 'anteprima: larghezza 200');
  eq(o.h, 228, 'anteprima: altezza 228');
  eq(o.scale, 2, 'anteprima: scala 2x come il canvas dell\'editor (D46)');
  eq(o.sunlight, true, 'anteprima: colori «come sul vetro»');
  eq(o.raw, null, 'senza foto aggiunte qui non ci sono pixel da mostrare');
  eq(o.time, '12:34', 'ora campione: quella dello stato');
  eqJson(o.masks, fakeMasks(), 'le maschere dello stato arrivano al motore come sono');
  eqJson(o.settings, h.G.state.settings, 'al motore vanno le impostazioni correnti della pagina');
  eq(cv.width, 400, 'canvas: backing store 400 px');
  eq(cv.height, 456, 'canvas: backing store 456 px');
  eq(cv._put && cv._put.w, 400, 'putImageData a 400 px');
  eq(cv._put && cv._put.h, 456, 'putImageData a 456 px');
  /* UX-2 D92/D56: il backing resta 2x, ma il canvas si MOSTRA a grandezza naturale — un pixel
   * dell'orologio, un pixel CSS: 200 px su emery. */
  eq(cv.style.width, '200px', 'D92 canvas largo 200 px CSS (grandezza naturale su emery)');
  eq(h.disp('wfPreview'), '', 'canvas visibile');
  eq(h.txt('wfPrevCap'), Tit('preview_cap_none'), 'didascalia: nessuna foto e nessuna tessera');
  /* U-12/D90: la nota non ha piu' NESSUNA coda fissa. Con layout A e riga info accesa resta la
   * riga che dice che cosa compare sotto l'ora; «Colori: come sull'orologio» e' sparita. */
  contains(h.txt('wfPrevNote'), noteInfo(15), 'nota: layout A con riga info accesa (D102: le quattro voci)');
  eqJson(pvNoteParts(h), [noteInfo(15)],
         'D90 senza foto (niente colore automatico) la nota e\' una riga sola: nessuna coda');
  notContains(h.txt('wfPrevNote'), Tit('aria_tile_btn', Tit('lbl_preview'), Tit('opt_prev_sun')),
              'D90: via la coda fissa «Colori: come sull\'orologio»');
  h.select('previewMode', 'nominal');
  notContains(h.txt('wfPrevNote'), Tit('aria_tile_btn', Tit('lbl_preview'), Tit('opt_prev_sun')),
              'D90: nemmeno con l\'anteprima del ritaglio sui colori nominali');
  eq(lastCall(h).sunlight, true, 'e al motore va comunque sunlight: true');
  h.select('previewMode', 'sun');
  /* D90: la didascalia ha tre stati. Con delle tessere in elenco ma nessuna foto AGGIUNTA ORA
   * la pagina non ha i pixel di nessuna: lo dice con la chiave sua. */
  (function () {
    var ha = loadPage({ state: stateEmery({ masks: fakeMasks() }), search: DEV_SEARCH });
    check(ha.G.tiles.length > 0, 'D90 controprova: ci sono tessere in elenco');
    eq(ha.G.pvSlot, null, 'D90 ...ma nessuna foto aggiunta adesso');
    eq(ha.txt('wfPrevCap'), Tit('preview_cap_none_album'),
       'D90 didascalia «senza foto ma con tessere» = preview_cap_none_album');
  })();
  /* D90/D102: preview_note_info si vede solo con layout A E almeno una casella accesa, e dice
   * le SOLE caselle accese (l'assenza si prova con Tpre: il testo intero ha un segnaposto). */
  (function () {
    var hb = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks(), settings: { layout: 1 } }),
                        search: DEV_SEARCH }), hd;
    notContains(hb.txt('wfPrevNote'), Tpre('preview_note_info'), 'D90 layout B: niente riga info nella nota');
    var hc = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks(), settings: { layout: 0, info_row: 0 } }),
                        search: DEV_SEARCH });
    notContains(hc.txt('wfPrevNote'), Tpre('preview_note_info'),
                'D90 layout A con la riga info spenta: niente nota sulla riga info');
    hc.checkbox('s_info_row_b0', true);
    contains(hc.txt('wfPrevNote'), noteInfo(1),
             'D90 accesa una casella, la nota torna (D102: con quella sola voce)');
    notContains(hc.txt('wfPrevNote'), Tit('opt_info_date'),
                'D102 con i soli passi la nota non promette la data, che e\' spenta');
    hc.checkbox('s_info_row_b2', true);
    contains(hc.txt('wfPrevNote'), noteInfo(5),
             'D102 passi e data accese: due voci, nell\'ordine dei bit');
    hd = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks(),
                                     settings: { layout: 0, info_row: 8 } }), search: DEV_SEARCH });
    eqJson(pvNoteParts(hd), [noteInfo(8)],
           'D102 sola casella «telefono scollegato»: la nota elenca quella e basta');
    hb.select('s_layout', '0');
    contains(hb.txt('wfPrevNote'), noteInfo(15), 'D90 tornando in layout A la nota torna');
  })();
  eq(h.G.pvSlot, null, 'nessuna foto scelta con l\'occhio');
  eq(h.G.pvError, null, 'nessun errore dell\'anteprima');

  /* il foglio (D92, revisione di D46): la larghezza la decide page.js (style.width), il CSS
   * lascia comandare quella misura e tiene solo la rete a 360 px. La regex vuole una regola che
   * comincia ESATTAMENTE con «#wfPreview {». */
  var pvCss = cssRule(PAGE_CSS, /(?:^| )#wfPreview \{([^}]*)\}/);
  check(pvCss !== null, 'D92 esiste una regola che comincia con «#wfPreview {»');
  eq(cssDecl(pvCss, 'width'), 'auto', 'D92 width: auto (comanda style.width scritto da page.js)');
  eq(cssDecl(pvCss, 'max-width'), '100%', 'D92 max-width: 100% (rete a 360 px)');
  eq(cssDecl(pvCss, 'image-rendering'), 'pixelated', 'D92 pixel non interpolati');
  eq(cssDecl(pvCss, 'box-sizing'), 'content-box',
     'D92 box-sizing: content-box (col border-box globale il bordo da 1 px lascerebbe 198 px di contenuto)');

  /* la decisione del colore automatico si legge nella nota, ma solo quando e' automatica */
  h2 = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks() }), search: DEV_SEARCH,
                  previewResult: function (op) { var r = fakePreview(op); r.luma.valid = true; return r; } });
  /* D84: preview_white/preview_black erano identiche a opt_color_white/opt_color_black in tutte
   * e sei le lingue e sono uscite dal dizionario: la nota usa le seconde, quelle del controllo. */
  eq(h2.txt('wfPrevNote'),
     Tit('preview_auto', Tit('opt_color_white'), Tit('preview_outline_on')) + ' · ' + noteInfo(15),
     'colore automatico: bianco con contorno, poi la riga info (D84/D90: nessuna coda fissa)');
  h2 = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks() }), search: DEV_SEARCH,
                  previewResult: function (op) {
                    var r = fakePreview(op);
                    r.luma.valid = true; r.pal.light = false; r.pal.halo = false;
                    return r;
                  } });
  contains(h2.txt('wfPrevNote'), Tit('preview_auto', Tit('opt_color_black'), Tit('preview_outline_off')),
           'colore automatico: nero senza contorno');
  h2.select('s_text_color', '1');                        /* colore scelto a mano: niente riga «automatico» */
  notContains(h2.txt('wfPrevNote'), Tit('preview_auto', Tit('opt_color_black'), Tit('preview_outline_off')),
              'colore manuale: la riga del colore automatico sparisce');
  contains(h2.txt('wfPrevNote'), noteInfo(15), 'colore manuale: resta la riga info');
  /* ru: la riga dice SOLO i pezzi davvero automatici — con il colore scelto a mano resta il
   * contorno (che e' ancora su «auto»), mai spacciato come parte di una decisione sul colore */
  contains(h2.txt('wfPrevNote'), Tit('aria_tile_btn', Tit('lbl_outline'), Tit('preview_outline_off')),
           'colore manuale, contorno automatico: la riga resta sul solo contorno');
  h2.select('s_outline', '1');                           /* contorno forzato: niente piu' «automatico» */
  notContains(h2.txt('wfPrevNote'), Tit('aria_tile_btn', Tit('lbl_outline'), Tit('preview_outline_off')),
              'contorno forzato: non viene piu\' presentato come automatico');
  eq(h2.txt('wfPrevNote'), noteInfo(15),
     'D90 colore e contorno scelti a mano: resta la sola riga info (nessuna coda fissa)');
  h2.select('s_text_color', '0');                        /* colore automatico, contorno forzato */
  contains(h2.txt('wfPrevNote'), Tit('aria_tile_btn', Tit('lbl_text_color'), Tit('opt_color_black')),
           'colore automatico con contorno forzato: la riga dice il solo colore');
  notContains(h2.txt('wfPrevNote'), Tit('preview_auto', Tit('opt_color_black'), Tit('preview_outline_off')),
              'e non attribuisce al calcolo il contorno scelto a mano');
  h2.select('s_outline', '0');                           /* tutti e due automatici: riga intera */
  contains(h2.txt('wfPrevNote'), Tit('preview_auto', Tit('opt_color_black'), Tit('preview_outline_off')),
           'colore e contorno automatici: torna la riga intera');
  /* D90: e in nessuno dei quattro casi ricompare la coda fissa dei colori */
  notContains(h2.txt('wfPrevNote'), Tit('aria_tile_btn', Tit('lbl_preview'), Tit('opt_prev_sun')),
              'D90: mai «Colori: come sull\'orologio» nella nota');

  /* flint: 144x168 -> canvas 288x336 */
  hf = loadPage({ state: mkState({ settingsSet: true, platform: 'flint', fmt: 2, masks: fakeMasks() }),
                  search: DEV_SEARCH });
  eq(lastCall(hf).fmt, 2, 'flint: formato 2');
  eq(lastCall(hf).w, 144, 'flint: larghezza 144');
  eq(lastCall(hf).h, 168, 'flint: altezza 168');
  eq(hf.el('wfPreview')._put.w, 288, 'flint: canvas 288 px');
  eq(hf.el('wfPreview')._put.h, 336, 'flint: canvas 336 px');
  eq(hf.el('wfPreview').style.width, '144px', 'D92 flint: 144 px CSS (backing 288, grandezza naturale)');

  /* stato senza masks/preview_time (PKJS di prima della S12): nessun errore, ora campione 12:34 */
  h2 = loadPage({ state: mkState({ settingsSet: true }), search: DEV_SEARCH });
  eq(lastCall(h2).masks, null, 'stato senza maschere: masks null');
  eq(lastCall(h2).time, '12:34', 'stato senza preview_time: ora campione 12:34');
  eq(h2.G.pvError, null, 'stato senza maschere: nessun errore, l\'anteprima mostra la sola foto');
  /* ru: qui l'anteprima si VEDE (mancano solo le cifre): la nota lo dice con una chiave sua,
   * «non disponibile» resta al solo guasto del motore (§6e), dove il canvas sparisce */
  contains(h2.txt('wfPrevNote'), Tit('preview_note_no_masks'), 'senza maschere il motore lo dice nella nota');
  notContains(h2.txt('wfPrevNote'), Tit('preview_unavailable'),
              'e non dice «anteprima non disponibile» sotto un\'anteprima che si vede');
  eq(h2.disp('wfPreview'), '', 'senza maschere il canvas resta visibile');
});

section('6b. S12 occhio (D47): solo sulle tessere nuove, classe pv, scelta mai salvata', function () {
  var h = loadPage({ state: stateEmery({ masks: fakeMasks() }), search: DEV_SEARCH }), G = h.G;
  var s0, s1, e0, n, tileCss, eyeCss;
  /* il foglio: l'occhio e' sovrapposto DENTRO la tessera (senza position: relative sulla tessera
   * finirebbe in un angolo della pagina) e non aggiunge righe alla tessera. */
  tileCss = cssRule(PAGE_CSS, /(?:^| )\.tile \{([^}]*)\}/);
  eq(cssDecl(tileCss, 'position'), 'relative', 'D47 la tessera e\' il riferimento dell\'occhio');
  eyeCss = cssRule(PAGE_CSS, /(?:^| )\.eye \{([^}]*)\}/);
  eq(cssDecl(eyeCss, 'position'), 'absolute', 'D47 l\'occhio e\' sovrapposto alla miniatura');
  eq(cssDecl(eyeCss, 'width'), '40px', 'D47 occhio largo 40 px (regola #10, ru)');
  eq(cssDecl(eyeCss, 'height'), '40px', 'D47 occhio alto 40 px (regola #10, ru)');
  eq(cssDecl(eyeCss, 'margin-top'), '13px',
     'D47 occhio appoggiato 4 px sopra il bordo inferiore della miniatura (57 - 40 - 4)');
  check(cssRule(PAGE_CSS, /(?:^| )\.tile\.pv \{([^}]*)\}/) !== null,
        'D47 la tessera scelta si riconosce a colpo d\'occhio (.tile.pv)');
  eq(nEye(h), 0, 'senza foto aggiunte adesso non c\'e\' nessun occhio');
  h.chooseFile('prima.jpg'); h.timers.run(); h.click('addOk');
  s0 = G.added[0].slot;
  eq(G.pvSlot, s0, 'l\'ultima foto aggiunta e\' quella in anteprima');
  check(!!G.pixels[s0], 'i pixel della foto restano in memoria (G.pixels)');
  eq(G.pixels[s0], G.added[0] && G.pixels[s0], 'G.pixels e\' indicizzato per slot');
  /* UX-3 (D111): con UNA sola foto nuova l'occhio non sceglierebbe niente — e non c'e'.
   * L'anteprima mostra quella foto lo stesso (G.pvSlot), ma la tessera non prende il bordo blu. */
  eq(nEye(h), 0, 'D111 una sola foto nuova: nessun occhio');
  eq(eyeOf(h, s0), null, 'D111 ...proprio nessun nodo #eye_<slot>');
  notContains(h.el('tile_' + s0).className, 'pv', 'D111 ...e nemmeno la classe pv');
  eq(lastCall(h).raw, G.pixels[s0], 'al motore vanno comunque i pixel di quella foto');
  eq(h.txt('wfPrevCap'), Tit('preview_cap_photo', 'prima.jpg', '12:34'), 'didascalia con nome e ora campione');

  h.chooseFile('seconda.jpg'); h.timers.run(); h.click('addOk');
  s1 = G.added[1].slot;
  eq(G.pvSlot, s1, 'una seconda foto: l\'anteprima passa all\'ultima aggiunta');
  eq(nEye(h), 2, 'D111 due foto nuove: adesso l\'occhio serve, e ce n\'e\' uno per tessera');
  e0 = eyeOf(h, s0);
  eq(e0.tagName, 'BUTTON', 'l\'occhio e\' un <button>');
  eq(e0.type, 'button', 'l\'occhio e\' type=button (niente submit)');
  eq(e0.className, 'eye', 'l\'occhio ha la classe eye');
  eq(e0.textContent, '👁︎', 'glifo dell\'occhio U+1F441 U+FE0E');
  eq(e0.attrs['aria-label'], Tit('preview_eye', 'prima.jpg'), 'aria-label con il nome della foto');
  notContains(h.el('tile_' + s0).className, 'pv', 'la prima tessera non e\' piu\' quella scelta');
  contains(h.el('tile_' + s1).className, 'pv', 'la seconda tessera e\' quella scelta');
  eq(eyeOf(h, 0), null, 'nessun occhio sulle foto gia\' sull\'orologio (slot 0)');
  eq(eyeOf(h, 9), null, 'nessun occhio sulle foto estranee (slot 9)');
  eq(eyeOf(h, s0).attrs['aria-pressed'], 'false', 'ru: l\'occhio non scelto e\' aria-pressed=false');
  eq(eyeOf(h, s1).attrs['aria-pressed'], 'true', 'ru: e quello della nuova scelta e\' true');

  n = h.env.previewCalls.length;
  h.env.scrolls.length = 0;
  h.click('eye_' + s0);
  eq(G.pvSlot, s0, 'l\'occhio sceglie la foto da mostrare');
  check(h.env.previewCalls.length > n, 'l\'occhio ridisegna l\'anteprima');
  eq(lastCall(h).raw, G.pixels[s0], 'e il motore riceve i pixel della foto scelta');
  contains(h.txt('wfPrevCap'), 'prima.jpg', 'la didascalia segue la scelta');
  contains(h.el('tile_' + s0).className, 'pv', 'la classe pv si sposta sulla tessera scelta');
  eq(eyeOf(h, s0).attrs['aria-pressed'], 'true', 'ru: aria-pressed segue la scelta (s0 true)');
  eq(eyeOf(h, s1).attrs['aria-pressed'], 'false', 'ru: e l\'altra torna a false');
  /* D111: scegliere con l'occhio porta anche l'anteprima sotto gli occhi */
  eq(h.env.scrolls.length, 1, 'D111 il tocco sull\'occhio scorre una volta sola');
  eq(h.env.scrolls[0].id, 'wfPrev', 'D111 ...e porta in vista l\'anteprima');

  h.click('del_' + s0); h.click('del_' + s0);
  eq(G.pvSlot, s1, 'eliminata la foto scelta: si passa all\'ultima rimasta');
  eq(G.pixels[s0], undefined, 'e i suoi pixel se ne vanno con lei');
  eq(nEye(h), 0, 'D111 rimasta una foto nuova sola: l\'occhio sparisce di nuovo');
  h.click('del_' + s1); h.click('del_' + s1);
  eq(G.pvSlot, null, 'eliminate tutte le foto nuove: nessuna foto in anteprima');
  eq(lastCall(h).raw, null, 'il motore riceve «nessun pixel»');
  /* D90: le tessere dell'album ci sono ancora, ma di quelle la pagina non ha i pixel: la
   * didascalia e' quella dei tre stati che dice proprio questo (preview_cap_none_album). */
  check(h.G.tiles.length > 0, 'D90 controprova: restano le tessere gia\' in elenco');
  eq(h.txt('wfPrevCap'), Tit('preview_cap_none_album'),
     'D90 e la didascalia torna a quella senza foto AGGIUNTE, con l\'elenco pieno');

  /* D47: la scelta non si ricorda — non e' un'impostazione e non entra nel payload */
  h = loadPage({ state: stateEmery({ masks: fakeMasks() }), search: DEV_SEARCH });
  h.chooseFile('a.jpg'); h.timers.run(); h.click('addOk');
  eqJson(Object.keys(h.G.buildPayload().settings).sort(), SETTINGS_KEYS.slice().sort(),
         'le impostazioni salvate sono sempre le stesse ' + N_SETTINGS + ' (nessuna voce per l\'occhio)');
  eqJson(Object.keys(h.G.buildPayload()).sort(), ['deleted', 'order', 'photos', 'settings', 'v'],
         'il payload ha sempre gli stessi campi: la scelta dell\'occhio non ne fa parte');
  eq(loadPage({ state: stateEmery({ masks: fakeMasks() }), search: DEV_SEARCH }).G.pvSlot, null,
     'riaprendo la pagina la scelta riparte da zero');
});

section('6c. S12 ridisegno a ogni cambio di impostazioni (font, stile, layout, colore, contorno)', function () {
  var h = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks() }), search: DEV_SEARCH });
  var casi = [['s_font', '4'], ['s_layout', '1'], ['s_text_color', '2'], ['s_outline', '1'],
              ['s_clock_mode', '1'], ['s_digit_style', '1'], ['s_lang', '2']], i, n, o;
  for (i = 0; i < casi.length; i++) {
    n = h.env.previewCalls.length;
    check(h.select(casi[i][0], casi[i][1]), 'cambio di ' + casi[i][0] + ': il controllo e\' attivo');
    check(h.env.previewCalls.length > n, 'cambio di ' + casi[i][0] + ': l\'anteprima si rifa\'');
  }
  o = lastCall(h);
  eq(o.settings.font, 4, 'al motore va il font scelto');
  eq(o.settings.layout, 1, 'al motore va il layout scelto');
  eq(o.settings.text_color, 2, 'al motore va il colore scelto');
  eq(o.settings.outline, 1, 'al motore va il contorno scelto');
  eq(o.settings.digit_style, 1, 'al motore va lo stile scelto');
  eq(o.settings.clock_mode, 1, 'al motore va il formato dell\'ora');
  eq(o.settings.lang, 2, 'al motore vanno anche le impostazioni che non lo riguardano (una copia sola)');

  /* LECO (font 3, solo in layout A): il motore lo dice con la nota, la pagina la mostra */
  h = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks(), settings: { layout: 0, font: 3 } }),
                 search: DEV_SEARCH });
  eq(lastCall(h).settings.font, 3, 'LECO: il motore riceve il font 3');
  contains(h.txt('wfPrevNote'), Tit('preview_note_leco'), 'LECO: «font di sistema, nessuna anteprima delle cifre»');
  h.select('s_font', '0');
  notContains(h.txt('wfPrevNote'), Tit('preview_note_leco'), 'tornando a uno sprite la nota di LECO sparisce');

  /* «PM»: l'anteprima non lo mostra e lo dice (nota ampm del motore) */
  h = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks() }), search: DEV_SEARCH,
                 previewResult: function (op) {
                   var r = fakePreview(op);
                   if (op.settings.clock_mode === 1) { r.notes.push('ampm'); }
                   return r;
                 } });
  notContains(h.txt('wfPrevNote'), Tit('preview_note_ampm'), 'formato automatico: nessuna nota su «PM»');
  h.select('s_clock_mode', '1');
  contains(h.txt('wfPrevNote'), Tit('preview_note_ampm'), '12 h: l\'anteprima avvisa che «PM» non si vede');
});

section('6d. S12/UX-3 anteprima con la foto vera: editor in corso, aggiunta, chiusura', function () {
  var h = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks() }), search: DEV_SEARCH });
  var G = h.G, ed = G.editor, n, raw, slot;
  /* UX-3 (D105): con l'editor aperto l'anteprima grande sparisce e lo STESSO motore disegna nel
   * canvas dell'editor; la didascalia di #wfPrevCap resta ferma a quel che diceva prima. */
  h.chooseFile('mare.jpg');
  eq(h.disp('wfPrev'), 'none', 'D105 aperto l\'editor l\'anteprima grande si nasconde');
  n = h.env.previewCalls.length;
  h.timers.run();                                        /* debounce: ritaglio + codifica */
  check(h.env.previewCalls.length > n, 'la codifica del ritaglio ridisegna la watchface');
  eq(lastCall(h).raw, ed.last.raw, 'con l\'editor aperto l\'anteprima usa i pixel in lavorazione');
  eq(h.el('preview')._put.w, 400, 'D105 e il disegno finisce nel canvas dell\'editor');
  eq(h.txt('editPrevCap'), Tit('edit_preview_cap'), 'D106 didascalia fissa dell\'editor');
  n = h.env.previewCalls.length;
  h.range('gamma', 1.4); h.timers.run();
  check(h.env.previewCalls.length > n, 'cambiando gamma l\'anteprima si rifa\'');
  raw = ed.last.raw;
  n = h.env.previewCalls.length;
  h.click('addOk');
  slot = G.added[0].slot;
  eq(G.pixels[slot], raw, 'aggiunta: i pixel dell\'ultima codifica finiscono in G.pixels');
  eq(lastCall(h).raw, raw, 'e l\'anteprima continua a mostrarli a editor chiuso');
  /* ru: un solo ridisegno (ogni render alloca 400x456x4 = 729.600 B): closeEditor lo fa gia' */
  eq(h.env.previewCalls.length - n, 1, 'aggiunta: l\'anteprima si ridisegna UNA volta sola');
  eq(h.disp('wfPrev'), '', 'D105 chiuso l\'editor l\'anteprima grande torna');
  eq(h.txt('wfPrevCap'), Tit('preview_cap_photo', 'mare.jpg', '12:34'), 'e con la didascalia della foto');

  /* seconda foto abbandonata: si torna a quella scelta con l'occhio */
  h.chooseFile('scartata.jpg'); h.timers.run();
  eq(h.disp('wfPrev'), 'none', 'D105 di nuovo nell\'editor: l\'anteprima grande si nasconde');
  eq(lastCall(h).raw, ed.last.raw, 'la foto in lavorazione ha la precedenza');
  h.click('addCancel');
  eq(G.editorOpen, false, 'editor chiuso');
  eq(h.disp('wfPrev'), '', 'D105 e l\'anteprima grande torna anche dopo «Non aggiungere»');
  eq(lastCall(h).raw, G.pixels[slot], 'annullando si torna alla foto scelta con l\'occhio');
  eq(h.txt('wfPrevCap'), Tit('preview_cap_photo', 'mare.jpg', '12:34'), 'e alla sua didascalia');

  /* UX-3 (D105): editor APPENA aperto, ed.last ancora nullo (debounce non scaduto). Adesso
   * renderPreview non disegna NIENTE — non c'e' ancora una foto da mostrare nell'editor e
   * l'anteprima grande e' nascosta —, quindi il motore non viene nemmeno chiamato e la
   * didascalia grande resta quella di prima. */
  h.chooseFile('nuova.jpg');
  eq(G.editorOpen, true, 'editor aperto');
  eq(ed.last, null, 'nessuna codifica ancora fatta (debounce non scaduto)');
  n = h.env.previewCalls.length;
  check(h.select('s_font', '1'), 'con l\'editor aperto le select delle impostazioni restano attive');
  eq(h.env.previewCalls.length, n, 'D105 senza codifica renderPreview torna subito, senza disegnare');
  eq(h.txt('wfPrevCap'), Tit('preview_cap_photo', 'mare.jpg', '12:34'),
     'D105 e la didascalia grande resta quella della foto di prima');
  h.timers.run();                                        /* ora la codifica c'e': si passa alla nuova */
  eq(lastCall(h).raw, ed.last.raw, 'fatta la codifica, l\'anteprima passa alla foto in lavorazione');
  eq(lastCall(h).settings.font, 1, 'D105 con il font scelto mentre l\'editor era aperto');
  /* D106: qui il font e' Bebas e le maschere finte coprono solo Anton, quindi il motore avvisa
   * che le cifre non ci sono — e quella nota VINCE sulla didascalia fissa. L'esito e'
   * deterministico (motore vero, stato fisso): accettare l'una O l'altra renderebbe
   * l'asserzione incapace di fallire. La precedenza fra le note si prova in 8d con risultati
   * pilotati. */
  eq(h.txt('editPrevCap'), Tit('preview_note_no_masks'),
     'D106 con un font senza maschere la nota del motore vince sulla didascalia fissa');
  h.click('addCancel');

  /* ru: nome lungo tagliato come nella tessera e nel payload (#26): la didascalia e' un <p> di
   * aiuto e il nome intero andrebbe a capo piu' volte */
  var lungo = rep('n', 80) + '.jpg';
  h.chooseFile(lungo); h.timers.run(); h.click('addOk');
  eq(h.txt('wfPrevCap'), Tit('preview_cap_photo', C.truncateName(lungo), '12:34'),
     'didascalia: nome troncato con truncateName');
  check(h.txt('wfPrevCap').indexOf(lungo) < 0, 'il nome intero non compare nella didascalia');
});

section('6e. S12 degrado: senza motore o con il motore rotto la pagina resta viva', function () {
  var h = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks() }), search: DEV_SEARCH, preview: false });
  var h2;
  eq(h.txt('wfPrevCap'), Tit('preview_unavailable'), 'senza GalPreview: «anteprima non disponibile»');
  eq(h.txt('wfPrevNote'), '', 'senza GalPreview: nessuna nota');
  eq(h.disp('wfPreview'), 'none', 'senza GalPreview: canvas nascosto');
  check(!!h.G.pvError, 'il motivo resta in G.pvError (' + h.G.pvError + ')');
  h.chooseFile('a.jpg'); h.timers.run(); h.click('addOk');
  eq(h.G.added.length, 1, 'senza anteprima si aggiungono foto lo stesso');
  eq(h.el('save').disabled, false, 'e si puo\' salvare');
  eq(h.txt('msg').indexOf('Errore') < 0, true, 'nessun errore a schermo per colpa dell\'anteprima');

  h2 = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks() }), search: DEV_SEARCH, previewThrow: true });
  eq(h2.txt('wfPrevCap'), Tit('preview_unavailable'), 'motore che lancia: stessa degradazione');
  contains(h2.G.pvError, 'motore rotto', 'e il messaggio del motore resta in G.pvError');
  eq(h2.disp('wfPreview'), 'none', 'canvas nascosto');
  h2.select('s_font', '1');
  eq(h2.txt('wfPrevCap'), Tit('preview_unavailable'), 'e resta cosi\' anche cambiando impostazioni');

  /* un guasto passeggero non e' definitivo: alla chiamata dopo l'anteprima torna */
  h2 = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks() }), search: DEV_SEARCH,
                  previewResult: function (op, k) {
                    if (k === 1) { throw new Error('primo giro'); }
                    return fakePreview(op);
                  } });
  eq(h2.txt('wfPrevCap'), Tit('preview_unavailable'), 'prima chiamata fallita: didascalia di ripiego');
  h2.select('s_font', '1');
  eq(h2.disp('wfPreview'), '', 'seconda chiamata riuscita: il canvas torna visibile');
  eq(h2.G.pvError, null, 'e G.pvError si azzera');
});

section('6f. S12 motore vero (src/pkjs/config/preview.js) se e\' gia\' in cartella', function () {
  var masks = realMasks(), h;
  if (!SRC['preview.js']) {
    console.log('  6f: src/pkjs/config/preview.js non c\'e\' ancora (agente V1): sezione saltata');
    return;
  }
  h = loadPage({ state: mkState({ settingsSet: true, masks: masks || fakeMasks(), preview_time: '12:34' }),
                 search: DEV_SEARCH });
  h.chooseFile('vera.jpg'); h.timers.run(); h.click('addOk');
  eq(h.el('wfPreview')._put.w, 400, 'il motore vero riempie il canvas a 400 px');
  eq(h.el('wfPreview')._put.h, 456, 'il motore vero riempie il canvas a 456 px');
  eq(h.txt('wfPrevCap'), Tit('preview_cap_photo', 'vera.jpg', '12:34'), 'didascalia con la foto vera');
  if (masks) {
    eqJson(h.env.previewFails, [], 'con le maschere vere il motore non lancia mai');
    eq(h.G.pvError, null, 'e la pagina non degrada');
    check(h.env.previewResults[h.env.previewResults.length - 1].drawn === true,
          'con foto e maschere vere le cifre vengono disegnate (drawn)');
  } else {
    console.log('  6f: src/pkjs/digit_masks.js non c\'e\' ancora (agente G1): provato solo il degrado');
  }
});

/* ====================== 7. UX-2: struttura e aspetto (U-03, U-04, U-08, U-10, U-11) ===== */
/* Le voci che cambiano COMPORTAMENTO, non solo markup. Ognuna sta nel contratto UX-2 §1 con la
 * sua decisione: D91 (riga dei KB), D93 (riga sull'ordine delle foto), D88/D89 («Altre
 * impostazioni» e «Sotto l'ora»), D87 (frecce del font), D86 (option che su Duo non esistono). */

/* il primo figlio con classe arrow del pulsante (D88: ▾ chiuso, ▴ aperto) */
function arrowOf(e) {
  var k, c = (e && e.children) || [];
  for (k = 0; k < c.length; k++) { if (/\barrow\b/.test(c[k].className || '')) { return c[k]; } }
  return null;
}
/* testo della casella i-esima della riga «Sotto l'ora»: <label class="chk"><input><span></label> */
function chkText(h, id) {
  var lab = h.el(id).parentNode;
  return lab.children[1] ? lab.children[1].textContent : '';
}

section('7a. U-03 (D91): la riga dei KB si vede solo da meta\' tetto in su', function () {
  /* Il testo c'e' sempre (kbNum lo legge anche da nascosto), ma la riga si MOSTRA solo quando il
   * payload ha passato meta' tetto: su Android (900 KB) non si vede mai, su iPhone (200 KB) dalla
   * terza foto. La vecchia condizione «oppure ci sono foto nuove» e' sparita. */
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), h2, slot;
  check(h.kbNum() >= 0, 'il contatore e\' calcolato: ' + h.txt('kb'));
  check(h.kbNum() < 450, 'payload sotto meta\' tetto (' + h.kbNum() + ' KB di 900)');
  eq(h.disp('kb'), 'none', 'sotto meta\' tetto: riga nascosta');
  h.chooseFile('una.jpg'); h.timers.run(); h.click('addOk');
  eq(h.G.added.length, 1, 'una foto aggiunta');
  check(h.kbNum() >= 40 && h.kbNum() < 450,
        'con una foto il payload e\' ancora sotto meta\' tetto (' + h.kbNum() + ' KB)');
  eq(h.disp('kb'), 'none', 'D91 con una foto nuova la riga resta nascosta (via «G.added.length > 0»)');
  /* stesso payload, tetto piccolo: adesso la riga si vede */
  h2 = loadPage({ state: mkState({ settingsSet: true, cap_kb: 60 }), search: DEV_SEARCH });
  eq(h2.disp('kb'), 'none', 'tetto 60 KB, album vuoto: ancora nascosta');
  h2.chooseFile('una.jpg'); h2.timers.run(); h2.click('addOk');
  check(h2.kbNum() >= 30, 'con una foto si passa meta\' di 60 KB (' + h2.kbNum() + ' KB)');
  check(h2.kbNum() <= 60, 'ma si resta dentro il tetto: nessun avviso (' + h2.kbNum() + ' KB)');
  eq(h2.G.overCap, false, 'niente overCap');
  eq(h2.disp('kb'), '', 'D91 da meta\' tetto in su la riga si vede');
  eq(h2.el('kb').className, 'help', 'D91 e resta una riga grigia (classe help, non piu\' in grassetto)');
  check(Trx('kb_line', '\\d+', '60', true).test(h2.txt('kb')), 'testo del contatore: ' + h2.txt('kb'));
  slot = h2.G.added[0].slot;
  h2.click('del_' + slot); h2.click('del_' + slot);       /* D110: due tocchi */
  eq(h2.disp('kb'), 'none', 'D91 tolta la foto si torna sotto meta\' tetto e la riga sparisce');
  /* G28: il confine. Con un payload ben sotto e uno ben sopra, «>=» e «>» sono indistinguibili:
   * qui il tetto e' esattamente il doppio del payload (kb === cap / 2). */
  (function () {
    var kb0 = loadPage({ state: mkState({ settingsSet: true }), search: DEV_SEARCH }).kbNum();
    check(kb0 > 0, 'D91 payload dell\'album vuoto: ' + kb0 + ' KB');
    eq(loadPage({ state: mkState({ settingsSet: true, cap_kb: 2 * kb0 }), search: DEV_SEARCH }).disp('kb'), '',
       'D91 payload esattamente a meta\' del tetto: la riga si vede (>=, non >)');
    eq(loadPage({ state: mkState({ settingsSet: true, cap_kb: 2 * kb0 + 1 }), search: DEV_SEARCH }).disp('kb'), 'none',
       'D91 un filo sotto meta\' tetto: la riga resta nascosta');
  })();
});

section('7b. U-04 (D93): la riga «Questo e\' l\'ordine delle foto»', function () {
  var s = mkState({ settingsSet: true }), s1 = mkState({ settingsSet: true }), h, h3;
  s.photos[0] = photo('a.jpg', 1, 11); s.photos[1] = photo('b.jpg', 1, 22);
  s1.photos[0] = photo('a.jpg', 1, 11);
  h = loadPage({ state: s, search: DEV_SEARCH });
  eq(h.G.tiles.length, 2, 'due foto in elenco');
  eq(h.txt('photosHint'), Tit('photos_cap_hint'), 'il testo viene dal dizionario');
  eq(h.disp('photosHint'), '', 'due foto, ordine «come l\'elenco», intervallo 30: riga visibile');
  h.select('s_order', '1');
  eq(h.disp('photosHint'), 'none', 'D93 ordine a caso: le frecce non contano, riga nascosta');
  h.select('s_order', '0');
  eq(h.disp('photosHint'), '', 'tornando a «come l\'elenco» la riga torna');
  eq(h.el('s_shake_next').checked, true, 'controprova: la scossa e\' accesa di fabbrica');
  h.select('s_interval_min', '0');
  eq(h.disp('photosHint'), '', 'D93 intervallo «mai» ma scossa accesa: la riga resta');
  h.checkbox('s_shake_next', false);
  eq(h.disp('photosHint'), 'none', 'D93 intervallo «mai» e scossa spenta: la foto non cambia mai, riga nascosta');
  h.checkbox('s_shake_next', true);
  eq(h.disp('photosHint'), '', 'riaccesa la scossa la riga torna');
  h.select('s_interval_min', '30');
  eq(h.disp('photosHint'), '', 'e con l\'intervallo rimesso pure');
  /* con una foto sola non c'e' nessun ordine da spiegare: ricalcolata dopo l'eliminazione */
  var dslot = h.G.tiles[0].slot;
  h.click('del_' + dslot); h.click('del_' + dslot);       /* D110: due tocchi */
  eq(h.G.tiles.length, 1, 'rimasta una foto sola');
  eq(h.disp('photosHint'), 'none', 'D93 con una foto la riga sparisce');
  eq(loadPage({ state: s1, search: DEV_SEARCH }).disp('photosHint'), 'none',
     'D93 una foto sola all\'apertura: riga nascosta');
  eq(loadPage({ state: mkState({ settingsSet: true }), search: DEV_SEARCH }).disp('photosHint'), 'none',
     'D93 album vuoto: riga nascosta');
  /* e una foto AGGIUNTA ORA porta a due: la riga compare senza ricaricare la pagina */
  h3 = loadPage({ state: s1, search: DEV_SEARCH });
  h3.chooseFile('nuova.jpg'); h3.timers.run(); h3.click('addOk');
  eq(h3.G.tiles.length, 2, 'due tessere dopo l\'aggiunta');
  eq(h3.disp('photosHint'), '', 'D93 la riga compare appena le foto sono due');
  /* G09 (deviazione accettata: nMovable() >= 2, non n >= 2): le tessere estranee hanno le frecce
   * sempre spente, quindi con una foto tua e una estranea non c'e' nessun ordine da suggerire.
   * Senza questo caso «nm» e «n» sarebbero indistinguibili (nessun altro stato di 7b ha estranee). */
  (function () {
    var sf = mkState({ settingsSet: true, watch: { at: 100, format: 1, maxChunk: 4096,
                                                   settingsCrc: 7, slots: [], foreign: [9] } }), k, hf;
    for (k = 0; k < 12; k++) { sf.watch.slots.push({ state: 0, crc: 0 }); }
    sf.photos[0] = photo('a.jpg', 1, 11);
    hf = loadPage({ state: sf, search: DEV_SEARCH });
    eqJson(kindsOf(hf.G.tiles), ['album', 'foreign'], 'D93 controprova: una foto tua e una estranea');
    eq(hf.el('up_9').disabled, true, 'D93 controprova: l\'estranea non si sposta');
    eq(hf.disp('photosHint'), 'none', 'D93 due tessere ma una sola spostabile: riga nascosta (nm, non n)');
    sf.photos[1] = photo('b.jpg', 1, 22);
    eq(loadPage({ state: sf, search: DEV_SEARCH }).disp('photosHint'), '',
       'D93 due foto tue piu\' l\'estranea: la riga torna');
  })();
});

section('7c. U-08 (D88/D89): «Altre impostazioni» ripiegate e la riga «Sotto l\'ora»', function () {
  function adv(over) { return loadPage({ state: mkState({ settingsSet: true, settings: over }), search: DEV_SEARCH }); }
  var h = adv({}), h2, h3;
  eq(h.disp('advBody'), 'none', 'D88 valori di fabbrica: blocco chiuso');
  eq(h.el('advBtn').attrs['aria-expanded'], 'false', 'D88 aria-expanded false da chiuso');
  eq(arrowOf(h.el('advBtn')).textContent, '\u25be', 'D88 freccia ▾ da chiuso');
  eq(h.env.scrolls.length, 0, 'D88 all\'avvio non si scorre');
  h.click('advBtn');
  eq(h.disp('advBody'), '', 'D88 un tocco apre il blocco');
  eq(h.el('advBtn').attrs['aria-expanded'], 'true', 'D88 aria-expanded true da aperto');
  eq(arrowOf(h.el('advBtn')).textContent, '\u25b4', 'D88 freccia ▴ da aperto');
  eq(h.env.scrolls.length, 0, 'D88 il blocco NON fa scorrere la pagina (a differenza dell\'Aiuto)');
  h.click('advBtn');
  eq(h.disp('advBody'), 'none', 'D88 un secondo tocco lo richiude');
  eq(h.el('advBtn').attrs['aria-expanded'], 'false', 'D88 aria-expanded torna false');
  eq(arrowOf(h.el('advBtn')).textContent, '\u25be', 'D88 e la freccia torna ▾');
  /* apertura derivata dallo stato, calcolata UNA volta all'avvio (la pagina non ha memoria) */
  eq(adv({ clock_mode: 1 }).disp('advBody'), '', 'D88 formato ora 12 h: aperto da solo');
  eq(adv({ leading_zero: 1 }).disp('advBody'), '', 'D88 zero davanti all\'ora scelto: aperto');
  eq(adv({ outline: 2 }).disp('advBody'), '', 'D88 bordo «mai»: aperto');
  eq(adv({ layout: 0, info_row: 7 }).disp('advBody'), '', 'D88 layout A con la riga info ritoccata: aperto');
  eq(adv({ layout: 1, info_row: 7 }).disp('advBody'), 'none',
     'D88 layout B: la riga info non si vede e non conta, blocco chiuso');
  eq(adv({ layout: 1 }).disp('advBody'), 'none', 'D88 solo il layout cambiato: chiuso (non sta li\' dentro)');
  eq(adv({ layout: 0, info_row: 15 }).disp('advBody'), 'none', 'D88 riga info di fabbrica: chiuso');
  eq(adv({ font: 5, digit_style: 2 }).disp('advBody'), 'none',
     'D88 font e stile cambiati: sono in «Aspetto dell\'ora», il blocco resta chiuso');
  eq(loadPage({ hash: '', search: DEV_SEARCH }).disp('advBody'), '',
     'D88 stato non arrivato: aperto (i valori a video non sono quelli dell\'orologio)');
  h2 = adv({ clock_mode: 1 });
  eq(h2.el('advBtn').attrs['aria-expanded'], 'true', 'D88 aperto da solo: aria-expanded true');
  eq(arrowOf(h2.el('advBtn')).textContent, '\u25b4', 'D88 aperto da solo: freccia ▴');
  eq(h2.env.scrolls.length, 0, 'D88 aperto da solo senza scorrere');
  h2 = adv({});
  h2.select('s_clock_mode', '1');
  eq(h2.disp('advBody'), 'none',
     'D88 l\'apertura si calcola una volta sola all\'avvio: cambiare un valore non riapre il blocco');

  /* D89: la riga «Sotto l'ora» esiste solo con «Ora in alto»; i bit restano nel payload */
  h3 = adv({ layout: 0, info_row: 7 });
  eq(h3.disp('infoRow'), '', 'D89 layout A: riga «Sotto l\'ora» visibile');
  h3.select('s_layout', '1');
  eq(h3.disp('infoRow'), 'none', 'D89 layout B: riga nascosta');
  eq(h3.G.buildPayload().settings.info_row, 7, 'D89 i bit restano nel payload anche da nascosti');
  h3.select('s_layout', '0');
  eq(h3.disp('infoRow'), '', 'D89 tornando in layout A la riga torna');
  eq(h3.G.buildPayload().settings.info_row, 7, 'D89 e i bit sono ancora quelli');
  eqJson([0, 1, 2, 3].map(function (i) { return h3.el('s_info_row_b' + i).checked; }),
         [true, true, true, false], 'D89 le caselle di info_row 7');
  /* U-08: la quarta casella non dice piu' «Bluetooth» ma «telefono scollegato» */
  eqJson([0, 1, 2, 3].map(function (i) { return chkText(h3, 's_info_row_b' + i); }),
         [Tit('opt_info_steps'), Tit('opt_info_battery'), Tit('opt_info_date'), Tit('opt_info_bt')],
         'U-08: le quattro caselle con i testi del dizionario (la quarta e\' opt_info_bt)');
});

section('7d. U-10 (D87): le frecce ‹ › sfogliano i font', function () {
  var h = loadPage({ state: mkState({ settingsSet: true, masks: fakeMasks(), settings: { layout: 0, font: 0 } }),
                     search: DEV_SEARCH }), n;
  eq(h.el('s_font').value, '0', 'partenza: Anton');
  ['1', '2', '3', '4', '5', '0'].forEach(function (v) {
    h.click('fontNext');
    eq(h.el('s_font').value, v, 'freccia avanti: font ' + v + ' (giro compreso)');
  });
  ['5', '4', '3', '2', '1', '0'].forEach(function (v) {
    h.click('fontPrev');
    eq(h.el('s_font').value, v, 'freccia indietro: font ' + v + ' (giro compreso)');
  });
  /* ogni tocco e' un cambio di impostazione: anteprima, contatore e payload seguono */
  n = h.env.previewCalls.length;
  h.click('fontNext');
  eq(h.el('s_font').value, '1', 'un tocco: font 1');
  check(h.env.previewCalls.length > n, 'D87 il tocco ridisegna l\'anteprima');
  eq(lastCall(h).settings.font, 1, 'D87 e al motore va il font nuovo');
  eq(h.G.buildPayload().settings.font, 1, 'D87 il payload porta il font nuovo');
  eq(h.kbNum(), C.payloadKb(h.G.buildPayload()), 'D87 il contatore KB e\' ricalcolato');
  /* layout B: LECO e' disabilitato e la freccia lo salta (D87: solo le option non disabled) */
  h.select('s_font', '2'); h.select('s_layout', '1');
  eq(h.el('s_font_leco').disabled, true, 'layout B: LECO disabilitato');
  eq(h.el('s_font').value, '2', 'controprova: si parte da Barlow');
  h.click('fontNext');
  eq(h.el('s_font').value, '4', 'D87 la freccia salta LECO (3) e va a Francois One (4)');
  h.click('fontPrev');
  eq(h.el('s_font').value, '2', 'D87 e al contrario torna a Barlow, saltando di nuovo LECO');
  h.select('s_font', '5');
  h.click('fontNext');
  eq(h.el('s_font').value, '0', 'D87 dal 5 si torna al 0 (giro)');
  h.click('fontPrev');
  eq(h.el('s_font').value, '5', 'D87 e dal 0 si va al 5');
  /* D87 dice «poi settingsChanged()», non «poi renderPreview()»: l'anteprima da sola non
   * basta. Le due prove che li distinguono sono applyRules (in layout A la freccia arriva a
   * LECO e lo stile deve spegnersi: senza applyRules la select resta accesa su LECO) e
   * updateKb (il contatore viene riscritto da capo, anche quando il numero non cambia). */
  h.select('s_layout', '0'); h.select('s_font', '2');
  h.click('fontNext');
  eq(h.el('s_font').value, '3', 'D87 in layout A la freccia arriva a LECO');
  eq(h.el('s_digit_style').disabled, true, 'D87 il tocco passa da applyRules (LECO spegne lo stile)');
  eq(h.el('s_digit_style').value, '0', 'D87 e applyRules riporta lo stile a 0');
  h.el('kb').textContent = 'XXX';                  /* il contatore deve essere riscritto */
  h.click('fontNext');
  check(Trx('kb_line', '\\d+', '\\d+', true).test(h.txt('kb')),
        'D87 il tocco rifa il contatore KB (updateKb): "' + h.txt('kb') + '"');
  eq(h.el('fontPrev').disabled, false, 'D87 freccia indietro sempre attiva (il giro non finisce mai)');
  eq(h.el('fontNext').disabled, false, 'D87 freccia avanti sempre attiva');
  /* UX-3 rev (G17): sono gli unici due pulsanti a corpo 22 px e con la .btn di D121
   * (line-height 1.2 + 8 px di padding) venivano alti 22 x 1,2 + 16 + 2 = 44,4 px — il
   * min-height da 40 non li trattiene —, cioe' 2,2 px sopra e sotto la select. Con line-height 1
   * tornano ai 40x40 del bersaglio (regola #10) e #fontRow da 73,4 a 69 px. */
  ['#fontPrev', '#fontNext'].forEach(function (sel) {
    eq(declOf(PAGE_CSS, sel, 'line-height'), '1',
       'G17 ' + sel + ' torna alta 40 px (22 + 16 + 2), come il bersaglio della regola #10');
    eq(declOf(PAGE_CSS, sel, 'font-size'), '22px', 'G17 ' + sel + ': il corpo di D87 non cambia');
  });
  eq(declOf(PAGE_CSS, '.btn', 'line-height'), '1.2', 'G17 controprova: gli altri .btn restano a 1.2');
});

section('7e. U-11 (D86): i quattro «automatico» e i colori che su Duo non esistono', function () {
  var h = loadPage({ state: mkState({ settingsSet: true }), search: DEV_SEARCH }), hf, hf2, hu;
  /* la voce 0 di ognuna delle quattro select dice DA DOVE viene l'automatismo: opt_auto, che
   * valeva per tutte e quattro, e' uscita dal dizionario. */
  eq(optTexts(h, 's_clock_mode')[0], Tit('opt_clock_auto'), 'Formato ora: «come l\'orologio»');
  eq(optTexts(h, 's_leading_zero')[0], Tit('opt_leading_zero_auto'), 'Zero davanti all\'ora: la voce parlante');
  eq(optTexts(h, 's_text_color')[0], Tit('opt_color_auto'), 'Colore dell\'ora: «automatico (dalla foto)»');
  eq(optTexts(h, 's_outline')[0], Tit('opt_outline_auto'), 'Bordo di contrasto: «solo se serve»');
  eqJson([optVals(h, 's_clock_mode')[0], optVals(h, 's_leading_zero')[0],
          optVals(h, 's_text_color')[0], optVals(h, 's_outline')[0]], ['0', '0', '0', '0'],
         'U-11: le quattro voci nuove restano sul valore 0 (nessun riordino)');
  /* i colori: 5 option, le ultime due con un id stabile come le 3D dello stile */
  eqJson(optIds(h, 's_text_color'), ['', '', '', 's_text_color_y', 's_text_color_b'],
         'D86: id stabili su «giallo chiaro» e «blu scuro»');
  eqJson(optTexts(h, 's_text_color').slice(1),
         [Tit('opt_color_white'), Tit('opt_color_black'), Tit('opt_color_yellow'), Tit('opt_color_blue')],
         'emery: i quattro colori con i loro nomi');
  eq(h.el('s_text_color_y').disabled, false, 'emery: giallo scegliibile');
  eq(h.el('s_text_color_b').disabled, false, 'emery: blu scegliibile');
  check(!h.el('s_text_color_y').hidden, 'emery: giallo non nascosto');
  check(!h.el('s_text_color_b').hidden, 'emery: blu non nascosto');
  h.select('s_text_color', '3');
  eq(h.G.buildPayload().settings.text_color, 3, 'emery: il giallo entra nel payload');
  h.select('s_text_color', '4');
  eq(h.G.buildPayload().settings.text_color, 4, 'emery: e anche il blu');

  /* flint: i due colori non esistono; la pagina rimappa come ui_time.c:683-684 (3 -> 1, 4 -> 2) */
  hf = loadPage({ state: mkState({ platform: 'flint', fmt: 2, settingsSet: true, settings: { text_color: 3 } }),
                  search: DEV_SEARCH });
  eq(hf.el('s_text_color').value, '1', 'D86 flint: il giallo scende a bianco (3 -> 1) gia\' all\'apertura');
  eq(hf.G.buildPayload().settings.text_color, 1, 'D86 flint: e il payload porta 1');
  eq(hf.el('s_text_color_y').disabled, true, 'D86 flint: giallo spento');
  eq(hf.el('s_text_color_b').disabled, true, 'D86 flint: blu spento');
  check(!!hf.el('s_text_color_y').hidden, 'D86 flint: e anche nascosto (hidden INSIEME a disabled)');
  check(!!hf.el('s_text_color_b').hidden, 'D86 flint: idem per il blu');
  eq(hf.el('s_text_color_y').textContent, Tit('opt_style_no_flint', Tit('opt_color_yellow')),
     'D86 flint: l\'etichetta dice perche\' (lo stesso suffisso delle option 3D)');
  eq(hf.el('s_text_color_b').textContent, Tit('opt_style_no_flint', Tit('opt_color_blue')),
     'D86 flint: avvertenza anche sul blu');
  /* G10: applyLang -> optTexts riscrive TUTTE le option dal dizionario, cancellando il suffisso;
   * a rimetterlo e' applyRules -> applyUnavailable subito dopo. Su iOS, che ignora hidden, quel
   * suffisso e' l'unica cosa che spiega perche' la voce e' spenta: va provato in un'altra lingua. */
  hf.select('s_lang', '3');
  eq(hf.el('s_text_color_y').textContent, Tde('opt_style_no_flint', Tde('opt_color_yellow')),
     'D86 flint: dopo un cambio di lingua l\'avvertenza c\'e\' ancora, in tedesco');
  eq(hf.el('s_digit_style_3d1').textContent, Tde('opt_style_no_flint', Tde('opt_style_transp_3d')),
     'D86 flint: e lo stesso sulle cifre 3D');
  eq(hf.el('s_text_color_y').disabled, true, 'D86 flint: e la voce resta spenta');
  check(!!hf.el('s_text_color_y').hidden, 'D86 flint: e nascosta');
  hf.select('s_lang', '2');
  eq(hf.el('s_text_color').options()[0].disabled, false, 'flint: «automatico» resta scegliibile');
  eq(hf.el('s_text_color').options()[1].disabled, false, 'flint: bianco resta scegliibile');
  eq(fire(hf.el('s_text_color_y'), 'click'), false, 'flint: l\'option spenta non riceve eventi');
  hf2 = loadPage({ state: mkState({ platform: 'flint', fmt: 2, settingsSet: true, settings: { text_color: 4 } }),
                   search: DEV_SEARCH });
  eq(hf2.el('s_text_color').value, '2', 'D86 flint: il blu scende a nero (4 -> 2)');
  eq(hf2.G.buildPayload().settings.text_color, 2, 'D86 flint: payload con 2');
  hf2.select('s_text_color', '3');
  eq(hf2.el('s_text_color').value, '1', 'D86 flint: anche al change il 3 diventa 1');
  hf2.select('s_text_color', '4');
  eq(hf2.el('s_text_color').value, '2', 'D86 flint: e il 4 diventa 2');
  /* orologio sconosciuto: nessuna regola, come per le option 3D */
  hu = loadPage({ state: mkState({ platform: 'sconosciuta', fmt: 2, settingsSet: true, settings: { text_color: 3 } }),
                  search: DEV_SEARCH });
  eq(hu.el('s_text_color').value, '3', 'piattaforma sconosciuta: il giallo resta');
  eq(hu.el('s_text_color_y').disabled, false, 'piattaforma sconosciuta: nessuna option spenta');
  check(!hu.el('s_text_color_y').hidden, 'piattaforma sconosciuta: nessuna option nascosta');
  eq(hu.el('s_text_color_y').textContent, Tit('opt_color_yellow'), 'piattaforma sconosciuta: etichetta invariata');
});

/* ============ 8. UX-3: il flusso della foto (U-04, U-05, U-06, U-07, U-13, U-14) ======== */
/* Contratto ~/galleria-gate/ux/ux3/CONTRATTO-UX3.md §1 (D104–D125) e §5 A1(4): una sezione per
 * voce. Le altre voci di UX-3 stanno dove sono sempre state: 2a il markup (§3 del contratto),
 * 4e le tre famiglie di pulsanti nuove, 3g e 2k il footer nei casi di sempre, 6b/6d l'anteprima. */

section('8a. U-04 (D109): «Un momento…» mentre la foto si carica', function () {
  var h = loadPage({ state: mkState({}), search: DEV_SEARCH, bitmap: 'defer' });
  eq(h.G.loading, false, 'D109 G.loading parte falso');
  eq(h.el('add').className, 'btn primary', 'prima di scegliere «Aggiungi foto» e\' blu');
  eq(h.txt('add'), Tit('add_photo'), '...e dice «Aggiungi foto»');
  h.chooseFile('lenta.jpg');
  eq(h.G.loading, true, 'D109 scelta la foto: G.loading acceso');
  eq(h.G.editorOpen, false, 'D109 l\'editor si apre solo a immagine pronta');
  eq(h.el('add').className, 'btn off', 'D109 durante il caricamento il pulsante e\' spento');
  eq(h.txt('add'), Tit('btn_loading'), 'D109 ...e dice «Un momento…»');
  eq(h.el('add').disabled, false, 'D109 la label NON si disabilita (il doppio tocco lo neutralizza gen, #12)');
  eq(h.el('file').disabled, false, 'D109 e #file resta attivo: si puo\' scegliere un\'altra foto');
  eq(h.txt('addHelp'), Tit('add_help'), 'D109 l\'aiuto resta quello dell\'aggiunta');
  eq(h.txt('msg'), Tit('msg_loading', 'lenta.jpg'), 'D124 e nel footer resta il nome del file');
  /* il cambio di lingua passa da applyLang: il pulsante deve restare «Un momento…», tradotto */
  h.select('s_lang', '3');
  eq(h.txt('add'), Tde('btn_loading'), 'D109 lingua cambiata durante il caricamento: «Einen Moment…»');
  eq(h.el('add').className, 'btn off', 'D109 ...e il pulsante resta spento');
  h.select('s_lang', '2');
  h.env.deferred[0].res(640, 480);
  eq(h.G.loading, false, 'D109 immagine arrivata: G.loading spento');
  eq(h.G.editorOpen, true, 'D109 ...e l\'editor si apre');
  eq(h.el('add').className, 'btn primary', 'D109 il pulsante torna blu');
  eq(h.txt('add'), Tit('add_photo'), 'D109 ...e torna «Aggiungi foto»');

  /* immagine illeggibile: stesso ripristino, piu' il messaggio d'errore nel footer */
  var h2 = loadPage({ state: mkState({}), search: DEV_SEARCH, bitmap: 'defer', imgFail: true });
  /* UX-3 rev (G25): il browser scrive in #file il percorso del file scelto; qui lo scrive il
   * test, perche' il DOM finto non lo fa da solo (chooseFile riempie solo .files). */
  h2.el('file').value = 'C:\\fakepath\\rotta.jpg';
  h2.chooseFile('rotta.jpg');
  eq(h2.el('add').className, 'btn off', 'D109 errore: prima si stava caricando');
  h2.env.deferred[0].rej();
  eq(h2.G.loading, false, 'D109 errore: G.loading spento');
  eq(h2.el('add').className, 'btn primary', 'D109 errore: il pulsante torna blu');
  eq(h2.txt('add'), Tit('add_photo'), 'D109 errore: e torna «Aggiungi foto»');
  eq(h2.txt('msg'), Tit('msg_read_fail', 'rotta.jpg'), 'D109 errore: il footer lo dice');
  eq(h2.el('msg').className, 'err', 'D109 errore: messaggio in rosso');
  /* UX-3 rev (G25): l'input tiene ancora il file appena fallito e i WebView Chromium non
   * emettono «change» a parita' di selezione: senza azzerarlo, riscegliere LA STESSA foto dopo
   * un errore transitorio non farebbe partire niente e la pagina sembrerebbe rotta. Le altre
   * uscite dall'editor lo azzerano gia' da closeEditor (3l), questa no. */
  eq(h2.el('file').value, '', 'G25 dopo un caricamento fallito #file e\' vuoto: la stessa foto si riprova');

  /* scelta superata (#12): il ramo «g !== gen» non deve spegnere il caricamento della seconda */
  var h3 = loadPage({ state: mkState({}), search: DEV_SEARCH, bitmap: 'defer' });
  h3.chooseFile('A.jpg'); h3.chooseFile('B.jpg');
  eq(h3.env.deferred.length, 2, 'D109 due decodifiche in corso');
  h3.env.deferred[0].res(640, 480);
  eq(h3.G.loading, true, 'D109 la scelta superata non spegne il caricamento della seconda');
  eq(h3.el('add').className, 'btn off', 'D109 ...e il pulsante resta «Un momento…»');
  h3.env.deferred[1].res(800, 600);
  eq(h3.G.loading, false, 'D109 arrivata la seconda: caricamento finito');
  eq(h3.el('add').className, 'btn primary', 'D109 ...e il pulsante torna blu');

  /* startEditor che lancia (immagine 0x0): il catch chiude l'editor e updateKb rimette tutto */
  var h4 = loadPage({ state: mkState({}), search: DEV_SEARCH, bitmap: 'zero', imgW: 0, imgH: 0 });
  h4.chooseFile('vuota.jpg');
  eq(h4.G.editorOpen, false, 'D109 immagine 0x0: l\'editor non resta aperto');
  eq(h4.G.loading, false, 'D109 immagine 0x0: caricamento spento');
  eq(h4.el('add').className, 'btn primary', 'D109 immagine 0x0: il pulsante torna blu');
  eq(h4.txt('msg'), Tit('msg_err'), 'D109 immagine 0x0: messaggio d\'errore');
  eq(h4.el('msg').title, 'invalid dimensions',
     'D116 il dettaglio e\' inglese cablato (err_bad_size e\' uscita dal dizionario)');

  /* album pieno: vince sul caricamento (la scelta non parte nemmeno) */
  var h5 = loadPage({ state: fullState(), search: DEV_SEARCH, bitmap: 'defer' });
  eq(h5.el('add').className, 'btn off', 'D109 album pieno: pulsante spento');
  eq(h5.txt('add'), Tit('add_photo'), 'D109 album pieno: il testo resta «Aggiungi foto»');
  eq(h5.el('add').disabled, true, 'D109 album pieno: e la label e\' davvero disabilitata');
  eq(h5.el('file').disabled, true, 'D109 album pieno: anche #file');
  h5.G.addFile({ name: 'tredicesima.jpg' });
  eq(h5.G.loading, false, 'D109 album pieno: nessun caricamento');
  eq(h5.txt('add'), Tit('add_photo'), 'D109 album pieno: il pulsante non dice «Un momento…»');
  eq(h5.txt('addHelp'), Tit('album_full', C.MAX_SLOTS), 'D109 album pieno: l\'aiuto spiega il perche\'');
});

section('8b. U-05 (D110-D112): la ✕ vuole due tocchi, e ogni altra azione disarma', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), G = h.G;   /* tessere [3, 0, 5, 9*] */
  var pos9, nm, arm;
  eq(G.armDel, null, 'D110 all\'avvio nessuna ✕ e\' armata');
  eq(h.el('del_0').className, '', 'D110 la ✕ a riposo non ha classi');
  h.click('del_0');
  eq(G.armDel, 0, 'D110 primo tocco: lo slot 0 e\' armato');
  eq(G.tiles.length, 4, 'D110 primo tocco: la tessera c\'e\' ancora');
  eqJson(G.deleted, [], 'D110 primo tocco: niente in deleted');
  eq(h.el('del_0').className, 'arm', 'D110 primo tocco: la ✕ prende la classe arm');
  eq(h.el('del_0').getAttribute('aria-label'), Tit('msg_del_arm', 'città.jpg'),
     'D110 primo tocco: anche il nome accessibile dice che il prossimo tocco toglie');
  eq(h.txt('msg'), Tit('msg_del_arm', 'città.jpg'), 'D110 primo tocco: messaggio con il nome della foto');
  eq(h.el('msg').className, 'warn', 'D110 primo tocco: messaggio in giallo');
  eq(h.el('del_3').className, '', 'D110 le altre ✕ restano a riposo');
  eq(h.el('del_3').getAttribute('aria-label'), Tit('aria_tile_btn', Tit('btn_delete'), 'mare.jpg'),
     'D110 ...con il loro aria-label di sempre');
  /* un tocco su un'ALTRA ✕ sposta l'arma, non elimina niente */
  h.click('del_3');
  eq(G.armDel, 3, 'D110 tocco su un\'altra ✕: si arma quella');
  eq(h.el('del_0').className, '', 'D110 ...e la prima si disarma');
  eq(h.el('del_3').className, 'arm', 'D110 ...la classe si sposta');
  eq(G.tiles.length, 4, 'D110 nessuna tessera eliminata');
  eq(h.txt('msg'), Tit('msg_del_arm', 'mare.jpg'), 'D110 e il messaggio nomina la nuova');
  /* secondo tocco sulla STESSA: elimina davvero */
  h.click('del_3');
  eq(G.armDel, null, 'D110 secondo tocco: disarmata');
  eqJson(slotsOf(G.tiles), [0, 5, 9], 'D110 secondo tocco: la tessera se ne va');
  eqJson(G.deleted, [3], 'D110 secondo tocco: lo slot finisce in deleted');
  eq(h.txt('msg'), Tit('msg_removed'), 'D110 secondo tocco: messaggio dell\'eliminazione');
  /* tessera senza nome (estranea): il messaggio usa la POSIZIONE visibile, come l'aria-label */
  pos9 = Tit('tile_slot', idxOfSlot(G.tiles, 9) + 1);
  h.click('del_9');
  eq(h.txt('msg'), Tit('msg_del_arm', pos9), 'D110 tessera senza nome: il messaggio usa la posizione');
  eq(h.el('del_9').getAttribute('aria-label'), Tit('msg_del_arm', pos9), 'D110 ...e cosi\' l\'aria-label');
  h.click('del_9');
  eqJson(G.deleted, [3, 9], 'D110 anche l\'estranea vuole due tocchi');

  /* una foto nuova: stesso giro, ma il secondo tocco la scarta (msg_new_dropped) */
  var hn = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  hn.chooseFile('nuova.jpg'); hn.timers.run(); hn.click('addOk');
  nm = hn.G.added[0].slot;
  hn.click('del_' + nm);
  eq(hn.G.armDel, nm, 'D110 anche la tessera nuova si arma');
  eq(hn.txt('msg'), Tit('msg_del_arm', 'nuova.jpg'), 'D110 ...col suo nome');
  eq(hn.G.added.length, 1, 'D110 ...e la foto e\' ancora in coda');
  hn.click('del_' + nm);
  eq(hn.G.added.length, 0, 'D110 secondo tocco: la foto nuova viene scartata');
  eq(hn.txt('msg'), Tit('msg_new_dropped'), 'D110 ...con il messaggio delle foto nuove');

  /* --- disarmo: ogni altra azione toglie l'arma e pulisce il messaggio (D110) --- */
  var h2 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h2.click('del_0');
  eq(h2.G.armDel, 0, 'D110 armata');
  h2.click('down_3');
  eq(h2.G.armDel, null, 'D110 una freccia disarma');
  eq(h2.txt('msg'), '', 'D110 ...e il messaggio dell\'arma se ne va');
  eq(h2.el('del_0').className, '', 'D110 ...e la ✕ torna a riposo');
  h2.click('del_0');
  eqJson(h2.G.deleted, [], 'D110 dopo un disarmo il tocco successivo e\' di nuovo il PRIMO');
  h2.select('s_font', '1');
  eq(h2.G.armDel, null, 'D110 un cambio di impostazione disarma');
  h2.click('del_0');
  h2.select('s_lang', '1');
  eq(h2.G.armDel, null, 'D110 un cambio di lingua disarma');
  h2.click('del_0');
  h2.chooseFile('n.jpg'); h2.timers.run(); h2.click('addOk');
  eq(h2.G.armDel, null, 'D110 aggiungere una foto disarma');
  h2.click('del_0');
  h2.chooseFile('m.jpg'); h2.timers.run();
  eq(h2.G.editorOpen, true, 'controprova: l\'editor e\' aperto');
  eq(h2.G.armDel, null, 'D110 gia\' scegliere una foto disarma (startEditor passa da updateKb)');
  /* il disarmo con la CHIUSURA dell'editor va provato armando la ✕ con l'editor GIA' aperto: le
   * tessere restano vive (2o) e scegliere la foto ha gia' disarmato, quindi armare prima di
   * aprire non proverebbe niente (l'asserzione sarebbe vera senza mai poter fallire). */
  h2.click('del_0');
  eq(h2.G.armDel, 0, 'controprova: la ✕ si arma anche con l\'editor aperto');
  h2.click('addCancel');
  eq(h2.G.armDel, null, 'D110 e chiudere l\'editor disarma (updateKb da closeEditor)');
  eq(h2.el('del_0').className, '', 'D110 ...e la ✕ torna a riposo');

  /* il disarmo cancella SOLO il messaggio dell'arma, non uno qualunque */
  var h3 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h3.click('del_0'); h3.click('del_0');
  eq(h3.txt('msg'), Tit('msg_removed'), 'controprova: il messaggio dell\'eliminazione');
  h3.click('down_3');
  eq(h3.txt('msg'), Tit('msg_removed'), 'D110 senza ✕ armata updateKb non cancella il messaggio');

  /* UX-3 rev (G07): renderTiles ricostruisce le tessere, quindi la ✕ appena premuta viene
   * distrutta e il fuoco cade sul <body>: con dodici foto la ✕ della decima sta a una trentina
   * di tabulazioni dall'inizio, e il secondo tocco — che e' la CONFERMA — andrebbe ricercato da
   * capo. Il DOM finto non ha focus(): qui gliene si mette uno per la durata del caso (e lo si
   * toglie subito dopo, perche' page.js ne chiama un altro su #helpBtn e le altre sezioni
   * contano di non averlo). */
  var hfoc = loadPage({ state: stateEmery(), search: DEV_SEARCH }), focused = [];
  El.prototype.focus = function () { focused.push(this.id); };
  hfoc.click('del_0');
  eqJson(focused, ['del_0'], 'G07 armando la ✕ il fuoco torna sulla STESSA ✕, ora armata');
  focused.length = 0;
  hfoc.click('del_3');
  eqJson(focused, ['del_3'], 'G07 ...e segue l\'arma quando si sposta su un\'altra tessera');
  focused.length = 0;
  hfoc.click('del_3');
  eqJson(focused, [], 'G07 il secondo tocco elimina: nessun fuoco da rimettere (il pulsante non c\'e\' piu\')');
  delete El.prototype.focus;
  eq(typeof hfoc.el('del_0').focus, 'undefined', 'G07 controprova: il DOM finto e\' tornato senza focus()');

  /* UX-3 rev (G32): l'occhio e' «un'altra azione» come le frecce e le impostazioni (D110), non
   * un'eccezione: senza il disarmo resterebbe a schermo «tocca di nuovo ✕ per togliere …»
   * mentre la vista scorre sull'anteprima, e il tocco dopo sulla ✕ eliminerebbe davvero. */
  var hpv = loadPage({ state: stateEmery(), search: DEV_SEARCH }), pvA;
  hpv.chooseFile('a.jpg'); hpv.timers.run(); hpv.click('addOk');
  hpv.chooseFile('b.jpg'); hpv.timers.run(); hpv.click('addOk');
  pvA = hpv.G.added[0].slot;
  eq(nEye(hpv), 2, 'controprova: con due foto nuove l\'occhio c\'e\' (D111)');
  hpv.click('del_0');
  eq(hpv.G.armDel, 0, 'controprova: la ✕ di una tessera dell\'album e\' armata');
  hpv.env.scrolls.length = 0;
  hpv.click('eye_' + pvA);
  eq(hpv.G.armDel, null, 'G32 l\'occhio disarma la ✕ come ogni altra azione');
  eq(hpv.txt('msg'), '', 'G32 ...e con l\'arma se ne va il suo messaggio');
  eq(hpv.el('del_0').className, '', 'G32 ...e la ✕ torna a riposo');
  eq(hpv.G.pvSlot, pvA, 'G32 controprova: l\'occhio ha comunque scelto la foto');
  eq(hpv.env.scrolls.length, 1, 'D111 controprova: e ha portato in vista l\'anteprima');

  /* UX-3 rev (G12): il rovescio della controprova qui sopra, che non puo' provarlo perche' gira
   * con G.armDel gia' nullo. Qui la ✕ resta armata mentre a schermo arriva un messaggio
   * ESTRANEO — Salva in modalita' prova, che non passa da updateKb e non tocca G.armDel —: la
   * freccia disarma, ma quel testo (e la sua classe) devono restare. Senza la guardia
   * «if (msgIsArm)» di page.js, o senza l'azzeramento di msgIsArm in testa a setMsg, la prima
   * freccia se lo porterebbe via: sono i due pezzi dell'invariante che D110 prescrive. */
  var h4 = loadPage({ state: stateEmery(), search: '', protocol: 'http:' });
  h4.click('del_0');
  eq(h4.G.armDel, 0, 'controprova: la ✕ e\' armata');
  h4.click('save');
  contains(h4.txt('msg'), EN_DEV.testPayload, 'controprova: a schermo c\'e\' il messaggio di Salva (D72)');
  eq(h4.G.armDel, 0, 'controprova: Salva non passa da updateKb, la ✕ resta armata');
  h4.click('down_3');
  eq(h4.G.armDel, null, 'D110 la freccia disarma lo stesso');
  contains(h4.txt('msg'), EN_DEV.testPayload, 'G12 ma con msgIsArm falso il disarmo non tocca #msg');
  eq(h4.el('msg').className, 'okmsg', 'G12 ...ne\' la sua classe');

  /* --- il foglio (D110/D112) --- */
  arm = cssRuleList(PAGE_CSS).filter(function (r) { return r.sel === '.tbtns button.arm'; });
  eq(arm.length, 1, 'D110 una regola .tbtns button.arm');
  eq(declOf(PAGE_CSS, '.tbtns button.arm', 'color'), '#b71c1c', 'D110 la ✕ armata e\' rossa');
  eq(declOf(PAGE_CSS, '.tbtns button.arm', 'background'), '#fff', 'D110 ...su fondo bianco');
  eq(declOf(PAGE_CSS, '.tbtns button.arm', 'border-color'), '#b71c1c', 'D110 ...col bordo dello stesso rosso');
  eq(declOf(PAGE_CSS, '.tbtns', 'flex-flow'), 'row wrap', 'D112 .tbtns va a capo (▲ ▼ sulla prima riga)');
  eq(declOf(PAGE_CSS, '.tbtns', 'width'), '88px', 'D112 .tbtns larga 88 px = due pulsanti piu\' il gap');
  eq(declOf(PAGE_CSS, '.tbtns', 'gap'), '8px', 'D112 .tbtns gap 8 px (regola #10)');
  /* UX-3 rev (G30): flex-shrink: 0 e' una DEVIAZIONE dal testo di D112, non un di piu'. .tbtns e'
   * un flex item di .tile: con lo shrink di fabbrica la riga si prende anche i suoi 88 px (72,48
   * a 400 px e 59,88 a 360, misurati in Firefox), i tre pulsanti tornano incolonnati e scendono
   * sotto i 40x40 della regola #10. Senza questo pin la prossima passata la toglierebbe. */
  eq(declOf(PAGE_CSS, '.tbtns', 'flex-shrink'), '0',
     'G30 .tbtns non si restringe: con lo shrink i pulsanti scendono sotto i 40 px (regola #10)');
  eq(declOf(PAGE_CSS, '.tbtns button:last-child', 'margin-top'), '8px',
     'D112 la ✕ sta 16 px sotto le frecce (8 di gap + 8 di margine)');
  /* UX-3 rev (G15): la ✕ a due tocchi (D110) e «Esci comunque» (D107) sono gesti nuovi su
   * bersagli da 40x40, senza intervallo minimo; il viewport della pagina resta ingrandibile di
   * proposito, quindi su WebKit il secondo tocco ravvicinato potrebbe ingrandire la pagina oltre
   * a togliere la foto. manipulation spegne il solo doppio-tocco-per-ingrandire sui pulsanti.
   * La regola dichiara solo touch-action: resta fuori dalla cascata di §4e. */
  eq(declOf(PAGE_CSS, '.btn, .tbtns button, .eye', 'touch-action'), null,
     'G15 controprova: cssRuleList spezza le liste, il selettore composto non esiste come regola');
  ['.btn', '.tbtns button', '.eye'].forEach(function (sel) {
    eq(declOf(PAGE_CSS, sel, 'touch-action'), 'manipulation',
       'G15 ' + sel + ': niente doppio-tocco-per-ingrandire sui pulsanti');
  });
  eq(declOf(PAGE_CSS, '.name', 'white-space'), 'normal', 'D112 il nome non e\' piu\' su una riga sola');
  /* UX-3 rev (G19): la rottura preferita e' lo zero-width space che page.js mette prima
   * dell'ultimo punto, non piu' «dove capita» (break-all spezzava «light_landscap» + «e.jpg»).
   * I due overflow-wrap di fila sono voluti: «anywhere» vince dove c'e', «break-word» resta per
   * le WebView vecchie che scartano la seconda riga — per questo servono TUTTE e due. */
  eq(declOf(PAGE_CSS, '.name', 'word-break'), 'normal',
     'G19 word-break normal: non si spezza piu\' a meta\' parola');
  eqJson(declsAllOf(PAGE_CSS, '.name', 'overflow-wrap'), ['break-word', 'anywhere'],
         'G19 overflow-wrap: il ripiego break-word e poi anywhere (i nomi di una parola sola)');
  eq(declOf(PAGE_CSS, '.name', 'max-height'), '2.8em', 'D112 al massimo due righe: la tessera non cresce');
  eq(declOf(PAGE_CSS, '.name', 'overflow'), 'hidden', 'D112 e il resto si taglia');
  eq(declOf(PAGE_CSS, '.name', 'text-overflow'), null, 'D112 via i puntini di sospensione');
  /* #26: il title con il nome intero resta, ed e' l'unico posto dove si legge tutto */
  eq(nameNode(h, 0).title, 'città.jpg', 'D112 il title della tessera porta ancora il nome intero');
  /* UX-3 rev (G19): lo zero-width space sta SOLO nel testo visibile e SOLO prima dell'ultimo
   * punto. Il pin confronta la stringa intera, posizione compresa: uno ZWSP messo in coda o
   * davanti al nome passerebbe un semplice «indexOf >= 0». Title e aria-label, che i lettori di
   * schermo pronunciano, restano puliti (e cosi' i messaggi: li pinna msg_del_arm qui sopra). */
  eq(nameNode(h, 0).textContent, 'citt\u00e0' + ZW + '.jpg',
     'G19 il nome visibile si spezza fra il nome e l\'estensione');
  eq(nameNode(h, 0).title.indexOf(ZW), -1, 'G19 ...ma il title non porta lo zero-width space');
  h.click('del_0');
  eq(String(h.el('del_0').getAttribute('aria-label')).indexOf(ZW), -1,
     'G19 ...e nemmeno l\'aria-label della ✕ armata, che si legge ad alta voce');
  eq(h.txt('msg').indexOf(ZW), -1, 'G19 ...ne\' il messaggio del footer');
});

section('8c. U-06 (D113-D115): cornice con le corsie, «Regolazioni della foto», nome del file', function () {
  /* D113: la cornice e' larga quanto il contenitore MENO le due corsie da 28 px (clientWidth le
   * comprende), e non supera mai quel che resta in altezza. */
  var h = loadPage({ state: mkState({}), search: DEV_SEARCH, cropWidth: 260 });
  h.chooseFile('a.jpg');
  /* UX-3 rev (G31): la didascalia la scrive startEditor, PRIMA che il debounce faccia il primo
   * render: senza quella riga sotto il canvas resterebbe quella della foto precedente (o
   * «Anteprima non aggiornata») per tutto il tempo della codifica. Tutte le altre asserzioni su
   * #editPrevCap arrivano dopo timers.run(), cioe' dopo che renderPreview l'ha riscritta. */
  eq(h.txt('editPrevCap'), Tit('edit_preview_cap'),
     'G31 appena aperto l\'editor la didascalia c\'e\' gia\' (prima del debounce)');
  eq(h.el('crop').width, 204, 'D113 cornice = 260 - 56 (le due corsie)');
  eq(h.G.editor.Fw, 204, 'D113 ed.Fw = 204');
  eq(h.el('crop').height, Math.round(204 * 228 / 200), 'D113 altezza in rapporto 200:228');
  var h2 = loadPage({ state: mkState({}), search: DEV_SEARCH });
  h2.chooseFile('a.jpg');
  eq(h2.el('crop').width, 300, 'D113 senza clientWidth utile: 300 come prima');
  var h3 = loadPage({ state: mkState({}), search: DEV_SEARCH, cropWidth: 150 });
  h3.chooseFile('a.jpg');
  eq(h3.el('crop').width, 120, 'D113 contenitore strettissimo (150 - 56 = 94): resta il minimo di 120');
  var h4 = loadPage({ state: mkState({}), search: DEV_SEARCH, cropWidth: 400 });
  h4.sb.innerHeight = 500;
  h4.chooseFile('a.jpg');
  eq(h4.el('crop').width, Math.floor((500 - 220) * 200 / 228),
     'D113 finestra bassa: comanda l\'altezza (245), non la larghezza');
  eq(declOf(PAGE_CSS, '#cropWrap', 'padding'), '0 28px', 'D113 il foglio riserva le corsie da 28 px per lato');
  /* UX-3 rev (G16): col box-sizing: border-box globale il bordo da 1 px mangiava la larghezza
   * che startEditor scrive in style.width, cosi' il bitmap di ed.Fw px viveva in ed.Fw - 2 px
   * CSS e pos() — che divide per r.width partendo dal bordo esterno — sbagliava fino a 1 px per
   * lato; UX-4 (D127): la meta' JS sta in pos(), che ora toglie il bordo e divide per r.width - 2.
   * Stessa cura di #preview e #wfPreview (D92/D105): la regola si cerca per selettore
   * esatto, come si fa per «#wfPreview {». */
  check(cssRule(PAGE_CSS, /(?:^| )#crop \{([^}]*)\}/) !== null,
        'G16 esiste una regola che comincia con «#crop {»');
  eq(declOf(PAGE_CSS, '#crop', 'box-sizing'), 'content-box',
     'G16 #crop e\' content-box: la cornice e\' 1:1 (pos() toglie il bordo in page.js)');
  check(/^1px\b/.test(declOf(PAGE_CSS, '#crop', 'border') || ''),
        'G16 il bordo di #crop e\' 1 px: pos() sottrae proprio 1 e 2 (tripwire del legame CSS-JS)');
  check(declOf(PAGE_CSS, '#crop', 'border-width') === null && declOf(PAGE_CSS, '#crop', 'padding') === null,
        'G16 #crop senza border-width ne\' padding propri: il rect e\' bordo da 1 px + contenuto e basta');
  /* UX-3 rev (G20): la riga dello Zoom e' l'unica con tre parti (etichetta, cursore, pulsante):
   * con i 9,5em di «.row > .rlab» servivano 403 px dei 388 disponibili a 400 px e «Riparti da
   * capo» finiva da solo sulla riga sotto, +52 px di editor. */
  eq(declOf(PAGE_CSS, '#zoomRow .rlab', 'min-width'), '0',
     'G20 l\'etichetta «Zoom» si stringe sul suo testo: una riga sola anche a 360 px');
  eq(declOf(PAGE_CSS, '.row > .rlab', 'min-width'), '9.5em',
     'G20 controprova: le altre etichette-guida tengono i loro 9,5em');

  /* D114: «Regolazioni della foto» nasce chiusa e si apre da sola se dentro c'e' qualcosa di
   * diverso dalla fabbrica (i valori restano da una foto all'altra). */
  eq(h.disp('editAdvBody'), 'none', 'D114 valori di fabbrica: blocco chiuso');
  eq(h.el('editAdvBtn').attrs['aria-expanded'], 'false', 'D114 aria-expanded false da chiuso');
  eq(arrowOf(h.el('editAdvBtn')).textContent, '▾', 'D114 freccia ▾ da chiuso');
  eq(h.env.scrolls.length, 1, 'D114 all\'apertura dell\'editor si e\' scorso una volta sola (su #editor)');
  h.click('editAdvBtn');
  eq(h.disp('editAdvBody'), '', 'D114 un tocco apre');
  eq(h.el('editAdvBtn').attrs['aria-expanded'], 'true', 'D114 aria-expanded true da aperto');
  eq(arrowOf(h.el('editAdvBtn')).textContent, '▴', 'D114 freccia ▴ da aperto');
  eq(h.env.scrolls.length, 1, 'D114 il blocco non fa scorrere la pagina');
  h.click('editAdvBtn');
  eq(h.disp('editAdvBody'), 'none', 'D114 un secondo tocco richiude');
  eq(arrowOf(h.el('editAdvBtn')).textContent, '▾', 'D114 e la freccia torna ▾');
  /* i cinque valori che aprono il blocco alla foto SUCCESSIVA, uno per volta */
  function edOpen(setup) {
    var p = loadPage({ state: mkState({}), search: DEV_SEARCH });
    p.chooseFile('x.jpg'); p.timers.run();
    setup(p);
    p.click('addCancel');
    p.chooseFile('y.jpg');
    return p.disp('editAdvBody');
  }
  eq(edOpen(function () { /* niente */ }), 'none', 'D114 controprova: niente toccato, resta chiuso');
  eq(edOpen(function (p) { p.range('gamma', 1.5); p.timers.run(); }), '', 'D114 gamma 1,50: aperto da solo');
  eq(edOpen(function (p) { p.range('lift', 0.1); p.timers.run(); }), '', 'D114 lift 0,10: aperto da solo');
  eq(edOpen(function (p) { p.select('dither', 'bayer'); p.timers.run(); }), '', 'D114 dithering diverso: aperto');
  eq(edOpen(function (p) { p.checkbox('sunlight', true); p.timers.run(); }), '', 'D114 «Ottimizza per il vetro»: aperto');
  eq(edOpen(function (p) { p.select('previewMode', 'nominal'); }), '', 'D114 colori nominali: aperto');

  /* D114/D116: i tempi dell'editor solo in dev, in inglese cablato */
  var hd = loadPage({ state: mkState({}), search: DEV_SEARCH });
  hd.chooseFile('t.jpg'); hd.timers.run();
  eq(hd.disp('etime'), '', 'D114 stato con dev: la riga dei tempi si vede');
  check(/^resize \d+ ms · encode \d+ ms$/.test(hd.txt('etime')), 'D114 riga dei tempi: "' + hd.txt('etime') + '"');
  var hnd = loadPage({ state: mkState({ dev: false }), search: '', protocol: 'data:' });
  hnd.chooseFile('t.jpg'); hnd.timers.run();
  eq(hnd.disp('etime'), 'none', 'D114 senza dev la riga dei tempi non si vede');
  eq(hnd.txt('etime'), '', 'D114 ...e resta vuota');

  /* D115: nome del file (troncato) nel testo, nome intero e pixel nel title */
  var hl = loadPage({ state: mkState({}), search: DEV_SEARCH, imgW: 4000, imgH: 3000 });
  var lungo = rep('z', 80) + '.jpg';
  hl.chooseFile(lungo);
  eq(hl.txt('editName'), C.truncateName(lungo), 'D115 nome troncato a 64 caratteri, come nella tessera');
  check(hl.txt('editName').indexOf(lungo) < 0, 'D115 il nome intero non compare nel testo');
  eq(attrOf(hl.el('editName'), 'title'), lungo + ' · 4000×3000 px', 'D115 il title porta nome intero e pixel');
  notContains(hl.txt('editName'), '4000', 'D115 i pixel non stanno nel testo');
});

section('8d. U-07 (D105-D108, D118/D119): un solo motore e il footer che conferma', function () {
  var h = loadPage({ state: mkState({ masks: fakeMasks() }), search: DEV_SEARCH }), G = h.G, ed = G.editor;
  var n, slot, putWf, crcEd, crcWf, sc;
  /* all'avvio #wfPrev non ha nessuno style inline: si guarda che NON sia nascosto */
  check(h.disp('wfPrev') !== 'none', 'all\'avvio l\'anteprima grande si vede');
  h.chooseFile('mare.jpg');
  eq(h.disp('wfPrev'), 'none', 'D105 con l\'editor aperto l\'anteprima grande sparisce');
  eq(h.el('preview').width, 400, 'D105 il canvas dell\'editor ha il backing a 2x (400)');
  eq(h.el('preview').height, 456, 'D105 ...e 456 in altezza');
  eq(h.el('preview').style.width, '200px', 'D105 ...ma si mostra a grandezza naturale (200 px su emery)');
  n = h.env.previewCalls.length;
  h.timers.run();
  check(h.env.previewCalls.length > n, 'D105 finita la codifica il motore disegna');
  /* D105: il gate di UX-3 legge G.timing (resample + encode + render) sul dev server; senza
   * questa riga la misura del render sparirebbe in silenzio */
  check(typeof G.timing.renderMs === 'number' && G.timing.renderMs >= 0,
        'D105 G.timing.renderMs misura l\'ultimo render');
  eq(lastCall(h).raw, ed.last.raw, 'D105 e riceve i PIXEL IN LAVORAZIONE');
  eq(lastCall(h).sunlight, true, 'D105 con «come sul vetro»: sunlight true');
  eq(lastCall(h).scale, 2, 'D105 stessa scala 2x dell\'anteprima grande');
  eq(lastCall(h).fmt, 1, 'D105 e lo stesso formato');
  eq(h.el('preview')._put.w, 400, 'D105 il disegno finisce nel canvas dell\'editor');
  eq(h.txt('editPrevCap'), Tit('edit_preview_cap'), 'D106 didascalia fissa dell\'editor');
  /* un cambio di font con l'editor aperto ridisegna QUEL canvas, non quello nascosto */
  putWf = h.el('wfPreview')._put;
  n = h.env.previewCalls.length;
  check(h.select('s_font', '4'), 'con l\'editor aperto le impostazioni restano attive');
  check(h.env.previewCalls.length > n, 'D105 il cambio di font ridisegna');
  eq(lastCall(h).settings.font, 4, 'D105 ...con il font nuovo');
  eq(lastCall(h).raw, ed.last.raw, 'D105 ...e sempre sui pixel in lavorazione');
  eq(h.el('wfPreview')._put, putWf, 'D105 e il canvas nascosto non riceve nessun disegno');
  h.select('previewMode', 'nominal');
  eq(lastCall(h).sunlight, false, 'D105 colori nominali: sunlight false');
  h.select('previewMode', 'sun');
  eq(lastCall(h).sunlight, true, 'D105 e si torna a «come sul vetro»');
  /* un solo motore: i pixel del canvas grande dopo l'aggiunta sono quelli dell'editor */
  crcEd = P.crc32(h.el('preview')._put.data);
  h.env.scrolls.length = 0;
  h.click('addOk');
  slot = G.added[0].slot;
  eq(h.disp('wfPrev'), '', 'D105 chiuso l\'editor l\'anteprima grande torna');
  crcWf = P.crc32(h.el('wfPreview')._put.data);
  eq(crcWf, crcEd, 'D105 stessa foto e stesse impostazioni: i due canvas hanno gli stessi pixel');
  /* D118: si torna in vista sulla tessera nuova, e il verde conferma */
  sc = h.env.scrolls[h.env.scrolls.length - 1];
  eq(sc && sc.id, 'tile_' + slot, 'D118 dopo «Usa questa foto» si scorre sulla tessera nuova');
  eq(h.txt('msg'), Tit('msg_added'), 'D118 e il messaggio verde conferma');
  eq(h.el('msg').className, 'okmsg', 'D118 ...in verde');
  /* D119: la coppia inline resta nascosta ma funzionante */
  eq(h.disp('addRow'), 'none', 'D119 la coppia inline resta nascosta');
  h.chooseFile('due.jpg'); h.timers.run();
  eq(h.disp('addRow'), 'none', 'D119 nascosta anche con l\'editor aperto: comanda il footer');
  h.click('addOk');
  eq(G.added.length, 2, 'D119 ...ma #addOk funziona lo stesso (i test lo premono)');
  h.chooseFile('tre.jpg'); h.timers.run();
  h.env.scrolls.length = 0;
  h.click('addCancel');
  eq(G.editorOpen, false, 'D119 e #addCancel chiude l\'editor');
  eq(h.txt('msg'), Tit('msg_crop_cancel'), 'D118 «Non aggiungere»: il messaggio lo dice');
  eq(h.env.scrolls.length, 1, 'D118 e si torna in vista su «Aggiungi foto»');
  eq(h.env.scrolls[0].id, 'add', 'D118 la scroll e\' su #add');

  /* il footer fa le stesse due cose (D107) */
  var h5 = loadPage({ state: mkState({ masks: fakeMasks() }), search: DEV_SEARCH });
  h5.chooseFile('a.jpg'); h5.timers.run();
  h5.click('save');
  eq(h5.G.added.length, 1, 'D107 Salva con l\'editor aperto = «Usa questa foto»');
  eq(h5.G.editorOpen, false, 'D107 ...e l\'editor si chiude');
  eq(h5.net.posts.length, 0, 'D107 ...senza mandare niente all\'orologio');
  h5.chooseFile('b.jpg'); h5.timers.run();
  h5.env.scrolls.length = 0;
  h5.click('cancel');
  eq(h5.G.added.length, 1, 'D107 Esci con l\'editor aperto = «Non aggiungere»');
  eq(h5.G.editorOpen, false, 'D107 ...e chiude l\'editor');
  eq(h5.navs.length, 0, 'D107 ...senza uscire dalla pagina');
  eq(h5.txt('msg'), Tit('msg_crop_cancel'), 'D107 con lo stesso messaggio di «Non aggiungere»');
  eq(h5.env.scrolls.length, 1, 'D107 ...e la stessa scroll su #add');

  /* D106: un render fallito nell'editor non nasconde il canvas e non parla nel footer */
  var h6 = loadPage({ state: mkState({ masks: fakeMasks() }), search: DEV_SEARCH, previewThrow: true });
  h6.chooseFile('a.jpg'); h6.timers.run();
  eq(h6.txt('editPrevCap'), Tit('preview_stale'), 'D106 render fallito: «Anteprima non aggiornata»');
  check(h6.disp('preview') !== 'none', 'D106 e il canvas dell\'editor resta com\'e\'');
  check(!!h6.G.pvError, 'D106 il motivo resta in G.pvError (' + h6.G.pvError + ')');
  eq(h6.txt('msg'), '', 'D106 nel footer non compare niente (il footer e\' per gli eventi)');
  h6.click('addOk');
  eq(h6.G.added.length, 1, 'D106 e la foto si aggiunge lo stesso');
  eq(h6.txt('wfPrevCap'), Tit('preview_unavailable'), 'D106 a editor chiuso il guasto resta «non disponibile»');
  eq(h6.disp('wfPreview'), 'none', 'D106 ...e li\' il canvas si nasconde');
  /* UX-3 rev (G31): e' qui che la riga di startEditor serve davvero — la foto SUCCESSIVA deve
   * ripartire dalla didascalia dell'editor, non da «Anteprima non aggiornata» lasciata li' dal
   * render fallito di quella prima, che parlerebbe di un ritaglio che non c'e' piu'. */
  eq(h6.txt('editPrevCap'), Tit('preview_stale'), 'controprova: la didascalia e\' ancora quella del guasto');
  h6.chooseFile('b.jpg');
  eq(h6.txt('editPrevCap'), Tit('edit_preview_cap'),
     'G31 foto nuova dopo un render fallito: la didascalia riparte da capo');
  h6.timers.run();
  eq(h6.txt('editPrevCap'), Tit('preview_stale'), 'D106 controprova: il motore lancia ancora, e lo dice');

  /* D106: le note del motore vincono sulla didascalia fissa, e leco vince su no_masks */
  var h7 = loadPage({ state: mkState({ masks: fakeMasks(), settings: { layout: 0, font: 3 } }), search: DEV_SEARCH });
  h7.chooseFile('a.jpg'); h7.timers.run();
  eq(h7.txt('editPrevCap'), Tit('preview_note_leco'), 'D106 con LECO la didascalia dell\'editor lo dice');
  var h8 = loadPage({ state: mkState({}), search: DEV_SEARCH });          /* stato senza maschere */
  h8.chooseFile('a.jpg'); h8.timers.run();
  eq(h8.txt('editPrevCap'), Tit('preview_note_no_masks'), 'D106 senza maschere la didascalia lo dice');
  /* UX-3 rev (G29): il motore vero non emette mai le due note insieme (in preview.js sono i due
   * rami di un if/else), quindi «leco vince su no_masks» va provato imponendo il risultato — e
   * nell'ordine sfavorevole, con no_masks PRIMA: cosi' un editCap che guardasse le note
   * nell'ordine in cui arrivano, invece che per specificita', fallirebbe. */
  var h9 = loadPage({ state: mkState({ masks: fakeMasks(), settings: { layout: 0, font: 3 } }), search: DEV_SEARCH,
                      previewResult: function (op) { var r = fakePreview(op); r.notes = ['no_masks', 'leco']; return r; } });
  h9.chooseFile('a.jpg'); h9.timers.run();
  eqJson(h9.env.previewResults[h9.env.previewResults.length - 1].notes, ['no_masks', 'leco'],
         'controprova: il motore ha davvero emesso le due note, no_masks per prima');
  eq(h9.txt('editPrevCap'), Tit('preview_note_leco'), 'G29 leco e no_masks insieme: vince leco (la piu\' specifica)');
  var h10 = loadPage({ state: mkState({ masks: fakeMasks() }), search: DEV_SEARCH,
                       previewResult: function (op) { var r = fakePreview(op); r.luma.valid = true; return r; } });
  h10.chooseFile('a.jpg'); h10.timers.run();
  eq(h10.txt('editPrevCap'), Tit('edit_preview_cap'),
     'D106 nell\'editor nessuna nota del colore automatico: la didascalia resta quella fissa');

  /* D108: sul telefono Salva dice che sta inviando e si spegne, ma non per sempre */
  var hp = loadPage({ state: stateEmery(), search: '', protocol: 'data:' });
  hp.chooseFile('t.jpg'); hp.timers.run(); hp.click('addOk');
  hp.click('save');
  eq(hp.txt('msg'), Tit('msg_sending'), 'D108 telefono: «Invio all\'orologio…»');
  eq(hp.el('save').disabled, true, 'D108 e Salva si spegne');
  check(hp.navs[0].indexOf('pebblejs://close#') === 0, 'D108 la navigazione parte lo stesso');
  check(hp.timers.q.length === 1 && hp.timers.q[0].ms === 5000, 'D108 un timer da 5 s in coda');
  hp.timers.run();
  eq(hp.el('save').disabled, false, 'D108 dopo 5 s Salva torna premibile');
  eq(hp.txt('msg'), Tit('msg_sending'), 'D108 ...e il messaggio resta');

  /* D118: il verde «foto aggiunta» solo se Salva e' davvero premibile */
  var hns = loadPage({ hash: '', search: DEV_SEARCH });
  hns.G.addFile({ name: 'senza-stato.jpg' });
  hns.timers.run();
  hns.click('addOk');
  eq(hns.G.added.length, 1, 'D118 senza stato la foto si aggiunge lo stesso');
  notContains(hns.el('msg').className, 'okmsg', 'D118 ...ma niente verde: Salva e\' spento, non si invita a toccarlo');
  var hoc = loadPage({ state: stateEmery({ cap_kb: 30 }), search: DEV_SEARCH });
  pickFile(hoc, 'grossa.jpg'); hoc.timers.run(); hoc.click('addOk');
  eq(hoc.G.overCap, true, 'D118 sopra il tetto');
  notContains(hoc.el('msg').className, 'okmsg', 'D118 sopra il tetto comanda il rosso, non il verde');
  /* UX-3 rev (G24): sopra il tetto «Aggiungi foto» resta attivo (D117: la ✕ deve poter
   * riportare sotto), quindi si apre l'editor e si puo' rinunciare. «Foto non aggiunta»
   * cancellerebbe il rosso che closeEditor -> updateKb ha appena rimesso e la pagina resterebbe
   * muta sul guasto che tiene spento Salva: stessa guardia della ✕ (#10) e di msg_added (D118). */
  pickFile(hoc, 'altra.jpg'); hoc.timers.run();
  hoc.env.scrolls.length = 0;
  hoc.click('addCancel');
  eq(hoc.G.editorOpen, false, 'controprova: «Non aggiungere» ha chiuso l\'editor');
  contains(hoc.txt('msg'), Tpre('cap_over'), 'G24 sopra il tetto il messaggio del tetto resta');
  eq(hoc.el('msg').className, 'err', 'G24 ...in rosso');
  eq(hoc.env.scrolls.length, 1, 'G24 ...e si torna in vista su «Aggiungi foto» lo stesso');
  eq(hoc.env.scrolls[0].id, 'add', 'G24 ...con la scroll su #add');

  /* UX-3 rev (G26): «Usa questa foto» faceva DUE giri di updateKb — closeEditor ne fa gia' uno
   * con tessere e G.added aggiornati, perche' insertTile viene prima —, cioe' due volte il
   * JSON.stringify di tutte le foto aggiunte per lo stesso risultato. Il conto si fa sulle
   * chiamate a G.buildPayload, che e' il pezzo caro di updateKb. */
  var hbp = loadPage({ state: mkState({ masks: fakeMasks() }), search: DEV_SEARCH }), nbp = 0, bp0;
  hbp.chooseFile('c.jpg'); hbp.timers.run();
  bp0 = hbp.G.buildPayload;
  hbp.G.buildPayload = function () { nbp++; return bp0.apply(this, arguments); };
  hbp.click('addOk');
  eq(nbp, 1, 'G26 «Usa questa foto» ricalcola il payload una volta sola');
  hbp.G.buildPayload = bp0;
  eq(hbp.G.added.length, 1, 'controprova: la foto e\' comunque entrata');

  /* flint: stesso canvas, backing 288x336 e 144 px CSS */
  var hf = loadPage({ state: mkState({ platform: 'flint', fmt: 2, masks: fakeMasks() }), search: DEV_SEARCH });
  hf.chooseFile('bn.jpg');
  eq(hf.el('preview').width, 288, 'D105 flint: backing 288');
  eq(hf.el('preview').height, 336, 'D105 flint: backing 336');
  eq(hf.el('preview').style.width, '144px', 'D105 flint: 144 px CSS (grandezza naturale)');
  hf.timers.run();
  eq(lastCall(hf).fmt, 2, 'D105 flint: al motore va il formato 2');
  eq(lastCall(hf).raw, hf.G.editor.last.raw, 'D105 flint: e i pixel in lavorazione');

  /* UX-3 rev (G14): fra l'apertura dell'editor e la scadenza del debounce non c'e' ancora un
   * ritaglio codificato (ed.last e' nullo, e ci resta anche dopo un resample fallito, #27), ma
   * le impostazioni restano attive e ogni cambio passa da applyRules -> renderPreview: la
   * funzione deve uscire subito, senza chiamare il motore e senza degradare la didascalia
   * (senza la guardia il ramo dell'editor leggerebbe ed.last.raw, lancerebbe, e scriverebbe
   * «Anteprima non aggiornata» su un'anteprima che nessuno ha ancora disegnato).
   * Handle a parte, in coda: cambiare il font su quello di sopra falserebbe D106, perche'
   * fakeMasks ha solo Anton e il primo render emetterebbe no_masks. */
  var hpre = loadPage({ state: mkState({ masks: fakeMasks() }), search: DEV_SEARCH }), npre;
  hpre.chooseFile('presto.jpg');
  npre = hpre.env.previewCalls.length;
  eq(hpre.G.editor.last, null, 'controprova: prima del debounce non c\'e\' ancora un ritaglio codificato');
  check(hpre.select('s_font', '1'), 'G14 prima del debounce le impostazioni restano attive');
  eq(hpre.env.previewCalls.length, npre, 'G14 ...ma senza ed.last il motore non viene chiamato');
  eq(hpre.txt('editPrevCap'), Tit('edit_preview_cap'), 'G14 ...la didascalia resta quella dell\'editor');
  eq(hpre.G.pvError, null, 'G14 ...e nessun errore finto finisce in G.pvError');
  hpre.timers.run();
  check(hpre.env.previewCalls.length > npre, 'G14 finita la codifica il motore disegna');
  eq(lastCall(hpre).settings.font, 1, 'G14 ...con il font scelto durante l\'attesa');

  /* il foglio (D105): le stesse dichiarazioni di #wfPreview, content-box compreso (D92) */
  check(cssRule(PAGE_CSS, /(?:^| )#preview \{([^}]*)\}/) !== null,
        'D105 esiste una regola che comincia con «#preview {»');
  eq(declOf(PAGE_CSS, '#preview', 'box-sizing'), 'content-box',
     'D105 #preview torna a content-box (col border-box globale il bordo lascerebbe 198 px)');
  eq(declOf(PAGE_CSS, '#preview', 'width'), 'auto', 'D105 width auto: comanda lo style.width di page.js');
  eq(declOf(PAGE_CSS, '#preview', 'max-width'), '100%', 'D105 max-width 100%: rete a 360 px');
  eq(declOf(PAGE_CSS, '#preview', 'image-rendering'), 'pixelated', 'D105 pixel non interpolati');
});

section('8e. U-13 (D107/D120/D121): i quattro stati del footer e la riga di aiuto', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  /* 1. pagina pulita */
  eq(h.txt('save'), Tit('btn_save'), 'D107 pulita: «Salva»');
  eq(h.txt('cancel'), Tit('btn_close'), 'D107 pulita: «Chiudi» (non c\'e\' niente da perdere)');
  eq(h.el('cancel').className, 'btn', 'D107 pulita: nessun rosso');
  eq(h.disp('hint'), 'none', 'D121 pulita: nessuna riga di aiuto');
  eq(h.txt('hint'), '', 'D121 pulita: e la riga e\' vuota');
  /* 2. una modifica: la riga grigia dice che cosa manca */
  h.select('s_font', '1');
  eq(h.txt('cancel'), Tit('btn_cancel'), 'D107 con modifiche: «Esci senza salvare»');
  eq(h.disp('hint'), '', 'D121 con modifiche: la riga di aiuto si vede');
  eq(h.txt('hint'), Tit('unsaved_hint'), 'D121 ...e dice di toccare Salva');
  eq(h.el('hint').className, 'help', 'D121 ...restando una riga grigia');
  /* 3. primo tocco su Esci: armato e rosso */
  h.click('cancel');
  eq(h.txt('cancel'), Tit('btn_cancel_armed'), 'D107 armato: «Esci comunque»');
  contains(h.el('cancel').className, 'danger', 'D107 armato: classe .btn.danger');
  eq(h.el('cancel').disabled, false, 'D107 armato: mai disabilitato');
  eq(h.txt('msg'), Tit('msg_unsaved'), 'D107 armato: il messaggio avvisa');
  eq(h.navs.length, 0, 'D107 armato: nessuna uscita');
  h.timers.run();
  eq(h.txt('cancel'), Tit('btn_cancel_armed'), 'D66 nessun timer disarma «Esci comunque»');
  /* 4. una seconda modifica disarma (stateEmery parte da font 2: il 2 rimetterebbe tutto a posto
   * e il pulsante tornerebbe «Chiudi», che e' un altro stato) */
  h.select('s_font', '0');
  eq(h.txt('cancel'), Tit('btn_cancel'), 'D107 una modifica disarma');
  notContains(h.el('cancel').className, 'danger', 'D107 ...e toglie il rosso');
  /* UX-3 rev (G03): con l'arma se ne va anche il suo avviso. Altrimenti resterebbe a schermo
   * «tocca di nuovo per uscire senza salvare» sotto un pulsante che dice «Esci senza salvare»
   * — o «Chiudi», se la modifica ha riportato la pagina com'era —, cioe' un'istruzione che non
   * funziona piu': il gesto che prescrive adesso riarma. Stessa regola della ✕ (D110). */
  eq(h.txt('msg'), '', 'G03 ...e l\'avviso dell\'uscita armata se ne va con l\'arma');
  eq(h.el('msg').className, '', 'G03 ...classe compresa');
  /* 5. l'editor prende il footer, la riga di aiuto tace e il rosso dell'arma se ne va. Si apre
   * con Esci GIA' armato apposta: D107 vuole che il ramo «editor aperto» azzeri cancelArmed e
   * riscriva la classe, e senza quelle due righe «Non aggiungere» resterebbe rosso da pulsante
   * distruttivo (mutante che nessun altro caso ucciderebbe: tutti aprono l'editor da un footer
   * gia' a riposo). Per questo la classe si confronta ESATTA, non con notContains. */
  h.click('cancel');
  contains(h.el('cancel').className, 'danger', 'controprova: armato prima di aprire l\'editor');
  h.chooseFile('n.jpg'); h.timers.run();
  eq(h.disp('hint'), 'none', 'D121 con l\'editor aperto la riga di aiuto tace');
  eq(h.txt('save'), Tit('btn_add_ok'), 'D107 editor aperto: «Usa questa foto»');
  eq(h.txt('cancel'), Tit('btn_add_cancel'), 'D107 editor aperto: «Non aggiungere»');
  eq(h.el('cancel').className, 'btn', 'D107 editor aperto: via il rosso dell\'arma');
  h.click('addOk');
  eq(h.txt('save'), Tit('btn_save'), 'D107 chiuso l\'editor il footer torna «Salva»');
  /* 6. con una foto nuova la riga cambia frase */
  eq(h.txt('hint'), Tit('footer_send'), 'D121 con una foto nuova la riga spiega come arrivano all\'orologio');
  eq(h.disp('hint'), '', 'D121 ...e si vede');
  /* Salva spento: nessun consiglio da dare */
  var hoc = loadPage({ state: stateEmery({ cap_kb: 30 }), search: DEV_SEARCH });
  pickFile(hoc, 'g.jpg'); hoc.timers.run(); hoc.click('addOk');
  eq(hoc.el('save').disabled, true, 'D121 sopra il tetto Salva e\' spento');
  eq(hoc.disp('hint'), 'none', 'D121 ...e la riga di aiuto tace');
  var hns = loadPage({ hash: '', search: DEV_SEARCH });
  eq(hns.el('save').disabled, true, 'D121 senza stato Salva e\' spento');
  eq(hns.disp('hint'), 'none', 'D121 ...e la riga di aiuto tace');
  /* UX-3 rev (G03), il rovescio: il disarmo svuota SOLO l'avviso dell'uscita armata. Un
   * messaggio qualunque gia' a schermo (qui l'errore di lettura di una foto, che non passa da
   * updateKb) deve sopravvivere alla modifica successiva, altrimenti la pagina si zittirebbe da
   * sola su un guasto. */
  var hm = loadPage({ state: stateEmery(), search: DEV_SEARCH, bitmap: 'defer', imgFail: true });
  hm.select('s_font', '1');
  hm.click('cancel');
  eq(hm.txt('msg'), Tit('msg_unsaved'), 'controprova: l\'uscita e\' armata e il suo avviso e\' a schermo');
  /* un messaggio qualunque prende il posto dell'avviso: da qui in poi #msg non e' piu' «suo»,
   * e msgIsUnsaved deve essere gia' caduto (lo azzera setMsg, come msgIsArm per la ✕). */
  hm.chooseFile('rotta.jpg');
  hm.env.deferred[0].rej();
  eq(hm.txt('msg'), Tit('msg_read_fail', 'rotta.jpg'), 'controprova: ora a schermo c\'e\' l\'errore di lettura');
  hm.select('s_font', '0');
  eq(hm.txt('msg'), Tit('msg_read_fail', 'rotta.jpg'), 'G03 il disarmo non tocca un messaggio che non e\' il suo');
  eq(hm.el('msg').className, 'err', 'G03 ...ne\' la sua classe');

  /* Salva azzera l'arma prima di navigare */
  var hs = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  hs.select('s_font', '1');
  hs.click('cancel');
  contains(hs.el('cancel').className, 'danger', 'controprova: armato');
  hs.click('save');
  notContains(hs.el('cancel').className, 'danger', 'D107 Salva disarma Esci prima di navigare');
  eq(hs.txt('cancel'), Tit('btn_cancel'), 'D107 ...e rimette l\'etichetta normale');
  /* cambio di lingua: i tre testi del footer seguono */
  var hl = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  hl.select('s_lang', '3');
  eq(hl.txt('save'), Tde('btn_save'), 'D107 tedesco: Salva tradotto');
  eq(hl.txt('cancel'), Tde('btn_cancel'), 'D107 tedesco: Esci tradotto (la lingua e\' una modifica)');
  eq(hl.txt('hint'), Tde('unsaved_hint'), 'D121 tedesco: anche la riga di aiuto');
  hl.click('cancel');
  eq(hl.txt('cancel'), Tde('btn_cancel_armed'), 'D107 tedesco: «Trotzdem verlassen»');
  /* D121: fitFooter chiamata anche da updateKb, DOPO #hint (nessun messaggio di mezzo) */
  var hf2 = loadPage({ state: stateEmery(), search: DEV_SEARCH }), body = hf2.doc.body;
  eq(body.style.paddingBottom, undefined, 'D121 il DOM finto non ha altezze: nessun padding all\'avvio');
  hf2.el('footer').offsetHeight = 120;
  hf2.select('s_font', '1');
  eq(body.style.paddingBottom, '128px', 'D121 updateKb ricalcola il padding dopo aver scritto #hint');
  /* ruoli ARIA (D120) e foglio (D121) */
  eq(h.el('msg').attrs.role, 'status', 'D120 #msg role=status');
  eq(h.el('msg').attrs['aria-live'], 'polite', 'D120 #msg aria-live=polite');
  eq(h.el('status').attrs.role, 'alert', 'D120 #status role=alert');
  eq(h.el('slow').attrs.role, 'status', 'D120 #slow role=status');
  eq(declOf(PAGE_CSS, '.btn', 'display'), 'inline-flex', 'D121 .btn e\' un inline-flex');
  eq(declOf(PAGE_CSS, '.btn', 'line-height'), '1.2', 'D121 ...con line-height 1.2, non 38px');
  eq(declOf(PAGE_CSS, '.btn', 'padding'), '8px 16px', 'D121 ...e il padding verticale che centra');
  /* UX-3 rev (G05): in un contenitore flex la sequenza di soli spazi fra due figli non viene
   * resa (CSS Flexbox 1 §4), quindi da quando .btn e' inline-flex la freccia ▾ si incollava
   * all'ultima lettera nei due soli .btn con due figli («Weitere Einstellungen▾»). gap dichiara
   * solo se stesso: resta fuori dalla cascata dei pulsanti (§4e). */
  eq(declOf(PAGE_CSS, '.btn', 'gap'), '6px',
     'G05 .btn ha il gap: la freccia ▾ non e\' incollata all\'etichetta');
  eq(declOf(PAGE_CSS, '.btn', 'align-items'), 'center', 'D121 ...allineato al centro');
  eq(declOf(PAGE_CSS, '.btn', 'min-height'), '40px', 'D121 e i 40 px di bersaglio restano (regola #10)');
  eq(declOf(PAGE_CSS, '.btn.small', 'padding'), '8px 12px', 'D121 anche i pulsantini hanno il padding verticale');
  eq(declOf(PAGE_CSS, '.btn.danger', 'color'), '#b71c1c', 'D107 «Esci comunque» e\' rosso');
  eq(declOf(PAGE_CSS, '.btn.danger', 'background'), '#fff', 'D107 ...su fondo bianco');
  notContains(PAGE_CSS, 'env(', 'D121 nessun env(safe-area-inset-bottom)');
  /* D121: i due eventi nel DOM finto non possono scattare (root non ha addEventListener e on()
   * lo ignora apposta), quindi si pinna il SORGENTE, come si fa in 3g per la finestra di
   * conferma nativa. Vale anche nel giro «inlinato»: l'inliner toglie solo i commenti. */
  check(/on\(\s*root\s*,\s*'resize'\s*,\s*fitFooter\s*\)/.test(SRC['page.js']) &&
        /on\(\s*root\s*,\s*'orientationchange'\s*,\s*fitFooter\s*\)/.test(SRC['page.js']),
        'D121 fitFooter registrata su resize e orientationchange');
});

section('8f. U-14 (D117): «Aggiungi foto» si spegne PRIMA di sforare il tetto', function () {
  /* Ogni foto vera pesa fino a 52 KB su emery (45.600 caratteri di dati + 6.000 di miniatura +
   * involucro) e 10 su flint: qui la miniatura finta e' grande apposta, per stare ai numeri veri. */
  var THUMB = function () { return 'data:image/jpeg;base64,' + rep('A', 5900); };
  var h, hf, ho, hb, hb2, ha, sfull, s1;
  eqJson(C.NEXT_PHOTO_KB, { 1: 52, 2: 10 }, 'D117 il costo massimo della prossima foto, per formato');
  h = loadPage({ state: mkState({ cap_kb: 150 }), search: DEV_SEARCH, toDataURL: THUMB });
  eq(h.G.capNext, false, 'D117 album vuoto e tetto 150: si puo\' aggiungere');
  eq(h.el('add').className, 'btn primary', 'D117 ...e il pulsante e\' blu');
  h.chooseFile('a.jpg'); h.timers.run(); h.click('addOk');
  check(h.kbNum() + C.NEXT_PHOTO_KB[1] <= 150,
        'D117 una foto (' + h.kbNum() + ' KB): la seconda ci sta ancora');
  eq(h.G.capNext, false, 'D117 una foto: nessun freno');
  eq(h.el('add').className, 'btn primary', 'D117 ...pulsante ancora blu');
  eq(h.txt('addHelp'), Tit('add_help'), 'D117 ...e aiuto normale');
  h.chooseFile('b.jpg'); h.timers.run(); h.click('addOk');
  check(h.kbNum() + C.NEXT_PHOTO_KB[1] > 150,
        'D117 due foto (' + h.kbNum() + ' KB): la terza sforerebbe i 150');
  eq(h.G.overCap, false, 'D117 due foto: ancora dentro il tetto');
  eq(h.G.capNext, true, 'D117 ...ma la terza no: il freno si accende');
  eq(h.el('add').className, 'btn off', 'D117 il pulsante si spegne PRIMA di sforare');
  eq(h.el('add').disabled, true, 'D117 ...ed e\' davvero disabilitato');
  eq(h.el('file').disabled, true, 'D117 ...e anche #file');
  eq(h.txt('add'), Tit('add_photo'), 'D117 ma il testo resta «Aggiungi foto» (non «Un momento…»)');
  eq(h.txt('addHelp'), Tit('cap_next_help'), 'D117 il perche\' lo dice l\'aiuto sotto');
  eq(h.el('save').disabled, false, 'D117 e Salva resta premibile: le due foto si mandano');
  notContains(h.txt('msg'), Tpre('cap_over'), 'D117 nessun messaggio rosso: non si e\' sforato niente');
  /* una ✕ (due tocchi) riporta «Aggiungi foto» alla normalita' */
  s1 = h.G.added[1].slot;
  h.click('del_' + s1); h.click('del_' + s1);
  eq(h.G.capNext, false, 'D117 tolta una foto si torna a poterne aggiungere');
  eq(h.el('add').className, 'btn primary', 'D117 ...e il pulsante torna blu');
  eq(h.el('file').disabled, false, 'D117 ...con #file di nuovo attivo');
  eq(h.txt('addHelp'), Tit('add_help'), 'D117 ...e l\'aiuto normale');

  /* album pieno: vince sul freno del tetto.
   * UX-3 rev (G28): il tetto dev'essere DAVVERO superato, altrimenti il caso gira a vuoto — con
   * cap_kb 60 il payload di un album pieno pesa 1 KB e 1 + 52 = 53 sta sotto i 60, quindi
   * capNext resterebbe falso anche togliendo il «!full» dal codice. Con 20 la condizione del
   * tetto e' vera e a tenerlo spento resta solo l'album pieno. */
  sfull = fullState(); sfull.cap_kb = 20;
  hf = loadPage({ state: sfull, search: DEV_SEARCH });
  check(hf.kbNum() + C.NEXT_PHOTO_KB[1] > 20,
        'G28 controprova: senza il pieno il tetto scatterebbe (' + hf.kbNum() + ' + 52 > 20)');
  eq(hf.G.overCap, false, 'G28 controprova: il tetto non e\' ancora superato, il rosso tace');
  eq(hf.G.capNext, false, 'D117 album pieno: capNext resta falso (comanda il pieno)');
  eq(hf.el('add').className, 'btn off', 'D117 album pieno: pulsante spento');
  eq(hf.txt('addHelp'), Tit('album_full', C.MAX_SLOTS), 'D117 album pieno: l\'aiuto e\' quello del pieno');

  /* sopra il tetto: comanda il rosso e «Aggiungi foto» resta normale (la ✕ deve poter rientrare) */
  ho = loadPage({ state: mkState({ cap_kb: 30 }), search: DEV_SEARCH, toDataURL: THUMB });
  pickFile(ho, 'g.jpg'); ho.timers.run(); ho.click('addOk');
  eq(ho.G.overCap, true, 'D117 sopra il tetto');
  eq(ho.G.capNext, false, 'D117 ...capNext resta falso');
  eq(ho.el('add').className, 'btn primary', 'D117 ...e «Aggiungi foto» resta blu');
  eq(ho.el('file').disabled, false, 'D117 ...con #file attivo');
  contains(ho.txt('msg'), Tpre('cap_over'), 'D117 a parlare e\' il messaggio rosso del tetto');

  /* flint: la soglia e' 10 KB, non 52 */
  hb = loadPage({ state: mkState({ platform: 'flint', fmt: 2, cap_kb: 10 }), search: DEV_SEARCH });
  eq(hb.G.state.fmt, 2, 'flint: formato 2');
  check(hb.kbNum() + C.NEXT_PHOTO_KB[2] > 10, 'D117 flint: ' + hb.kbNum() + ' + 10 sfora i 10 KB');
  eq(hb.G.capNext, true, 'D117 flint: il freno si accende');
  eq(hb.txt('addHelp'), Tit('cap_next_help'), 'D117 flint: con lo stesso aiuto');
  hb2 = loadPage({ state: mkState({ platform: 'flint', fmt: 2, cap_kb: 40 }), search: DEV_SEARCH });
  eq(hb2.G.capNext, false,
     'D117 flint con 40 KB di tetto: nessun freno (con la soglia di emery, 52, si accenderebbe)');
  eq(hb2.el('add').className, 'btn primary', 'D117 flint: pulsante blu');

  /* G.addFile (la porta del gate e dei test) passa anche col freno acceso */
  ha = loadPage({ state: mkState({ cap_kb: 150 }), search: DEV_SEARCH, toDataURL: THUMB });
  ha.chooseFile('a.jpg'); ha.timers.run(); ha.click('addOk');
  ha.chooseFile('b.jpg'); ha.timers.run(); ha.click('addOk');
  eq(ha.G.capNext, true, 'controprova: il freno e\' acceso');
  eq(fire(ha.el('file'), 'change'), false, 'D117 l\'input spento non manda change');
  ha.G.addFile({ name: 'terza.jpg' });
  eq(ha.G.editorOpen, true, 'D117 ma GalPage.addFile passa lo stesso (D117: salta #file)');
});

/* ==================================== varianti: sorgenti e artefatto inlinato =========== */

/* corpi di <script>/<style> nell'ordine del documento. L'inliner garantisce che il contenuto non
 * contenga il marcatore di chiusura del proprio tipo, quindi il non-greedy e' esatto. */
function splitTags(html) {
  var re = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi, m, out = [];
  while ((m = re.exec(html)) !== null) {
    out.push({ tag: m[1].toLowerCase(), attrs: m[2] || '', body: m[3],
               line: html.slice(0, m.index).split('\n').length });
  }
  return out;
}

/* 1o giro: i file di src/pkjs/config/ (page.html + page.css + i 4 .js) */
function sourceVariant() {
  var src = {};
  /* S12: preview.js puo' non esserci ancora (motore scritto in parallelo): in quel caso le
   * sezioni girano con lo stub e la 6f si salta, senza far fallire il resto. */
  SCRIPTS.forEach(function (f) {
    var full = path.join(CFG, f);
    src[f] = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  });
  return { name: 'sorgenti', inlined: false,
           html: fs.readFileSync(path.join(CFG, 'page.html'), 'utf8'),
           css: fs.readFileSync(path.join(CFG, 'page.css'), 'utf8'),
           src: src,
           core: require(path.join(CFG, 'page_core.js')),      /* GalPageCore */
           pipe: require(path.join(CFG, 'pipeline.js')) };     /* GalPipeline */
}

/* 2o giro: l'HTML che il PKJS spedisce davvero (src/pkjs/config_page.js, generato da
 * tools/build_config_page.py con lo strip delle righe di commento). null se il modulo manca. */
function inlinedVariant() {
  var raw, html, parts, scripts = [], styles = [], src = {}, i;
  if (!fs.existsSync(MOD)) { return null; }
  raw = fs.readFileSync(MOD, 'utf8');
  html = require(MOD);
  if (typeof html !== 'string' || !html) { throw new Error('config_page.js non esporta la stringa dell\'HTML'); }
  parts = splitTags(html);
  for (i = 0; i < parts.length; i++) { (parts[i].tag === 'script' ? scripts : styles).push(parts[i]); }
  /* UX-2 (come in S12): finche' l'artefatto non viene rigenerato con lo SCRIPT_ORDER nuovo
   * (senza previews.js) il modulo e' quello di prima e ogni sezione fallirebbe dicendo la stessa
   * cosa: meglio saltarlo e dirlo una volta. */
  var bodies = scripts.map(function (x) { return x.body; }).join('');
  if (/root\.GalPreviews\s*=/.test(bodies) || scripts.length < ROLES.length ||
      !/root\.GalPreview\s*=/.test(bodies)) {
    console.log('test_page: src/pkjs/config_page.js non e\' ancora quello di UX-2 (' + scripts.length +
                ' script): giro sull\'inlinato saltato ' +
                '(python3 ../../tools/build_config_page.py dalla cartella apps/galleria per rigenerarlo)');
    return null;
  }
  for (i = 0; i < SCRIPTS.length && i < scripts.length; i++) { src[SCRIPTS[i]] = scripts[i].body; }
  return { name: 'inlinato', inlined: true, html: html, src: src, raw: raw, parts: parts,
           scripts: scripts, styles: styles, css: styles.length ? styles[0].body : '',
           core: null, pipe: null };
}

/* i due moduli puri dell'inlinato, eseguiti nel contesto di node (stesso realm del test, come il
 * require dei sorgenti): senza `module` in scope l'UMD assegna i globali, poi si ripristinano */
function pureFromInlined(v) {
  var hadP = ('GalPipeline' in global), hadC = ('GalPageCore' in global);
  var savedP = global.GalPipeline, savedC = global.GalPageCore, out;
  try {
    vm.runInThisContext(v.src['pipeline.js'], { filename: 'inlinato:pipeline.js' });
    vm.runInThisContext(v.src['page_core.js'], { filename: 'inlinato:page_core.js' });
    out = { pipe: global.GalPipeline, core: global.GalPageCore };
  } finally {
    if (hadP) { global.GalPipeline = savedP; } else { delete global.GalPipeline; }
    if (hadC) { global.GalPageCore = savedC; } else { delete global.GalPageCore; }
  }
  if (!out.pipe || !out.core) { throw new Error('l\'inlinato non definisce GalPipeline/GalPageCore'); }
  return out;
}

/* struttura dell'artefatto spedito (specifica §1/§7): 4 script nell'ordine giusto, un solo
 * <style>, nessun riferimento esterno, nessuna riga di commento sopravvissuta allo strip.
 * Torna l'elenco dei problemi che rendono inutile far girare le sezioni. */
var ROLES = [['pipeline.js', /root\.GalPipeline\s*=/], ['page_core.js', /root\.GalPageCore\s*=/],
             ['preview.js', /root\.GalPreview\s*=/], ['page.js', /root\.GalPage\s*=/]];
function checkInlinedModule(v) {
  var fatal = [], i, j, n, ok, lines, bad = [], nb;
  contains(v.raw, 'GENERATO da tools/build_config_page.py', 'inlinato: intestazione «generato»');
  contains(v.raw, 'module.exports = "', 'inlinato: il modulo esporta la stringa dell\'HTML');
  nb = v.raw.split('\n').length;
  check(nb <= 3, 'inlinato: modulo su una riga di dati (' + nb + ' righe con l\'intestazione)');
  eq(v.scripts.length, ROLES.length, 'inlinato: ' + ROLES.length + ' sezioni <script>');
  eq(v.styles.length, 1, 'inlinato: un solo <style>');
  check(v.parts.length > 0 && v.parts[0].tag === 'style', 'inlinato: il <style> precede gli script');
  for (i = 0; i < ROLES.length; i++) {
    ok = !!(v.scripts[i] && ROLES[i][1].test(v.scripts[i].body));
    check(ok, 'inlinato: script ' + (i + 1) + ' = ' + ROLES[i][0] +
              ' (ordine pipeline, page_core, preview, page)');
    if (!ok) { fatal.push('script ' + (i + 1) + ' non e\' ' + ROLES[i][0]); }
    if (v.scripts[i]) {
      check(!/\bsrc\s*=/.test(v.scripts[i].attrs), 'inlinato: script ' + (i + 1) + ' senza src (inlinato davvero)');
    }
  }
  for (i = 0; i < ROLES.length; i++) {                 /* nessuno script ne assegna due: l'ordine e' univoco */
    if (!v.scripts[i]) { continue; }
    for (j = 0, n = 0; j < ROLES.length; j++) { if (ROLES[j][1].test(v.scripts[i].body)) { n++; } }
    eq(n, 1, 'inlinato: script ' + (i + 1) + ' assegna un solo globale noto');
  }
  /* S10 (D35): nell'artefatto le chiavi sono indici e non c'e' NESSUN testo tradotto: i
   * dizionari viaggiano nello stato. Si controllano le stringhe italiane che differiscono
   * dall'inglese e sono lunghe abbastanza da non comparire per caso. */
  var itLeft = [], attrs = [], m, re;
  for (i = 0; i < I18N.keys.length; i++) {
    if (I18N.it[i] !== I18N.en[i] && I18N.it[i].length >= 8 && v.html.indexOf(I18N.it[i]) >= 0) {
      itLeft.push(I18N.keys[i]);
    }
  }
  eq(itLeft.join(','), '', 'inlinato: nessun testo italiano nell\'artefatto');
  re = /(?:^|[^A-Za-z0-9_$.])T\(\s*['"]/g;
  eq((v.html.match(re) || []).length, 0, 'inlinato: nessuna chiamata a T con il nome della chiave');
  check(/[^A-Za-z0-9_$.]T\(\d+[,)]/.test(v.html), 'inlinato: le chiamate a T portano l\'indice');
  re = /data-i18n(?:-title)?="([^"]*)"/g;
  while ((m = re.exec(v.html)) !== null) { if (!/^[0-9]+$/.test(m[1])) { attrs.push(m[1]); } }
  eq(attrs.join(','), '', 'inlinato: data-i18n con il solo indice numerico');
  lines = v.html.split('\n');
  for (i = 0; i < lines.length; i++) { if (/^\s*\/\//.test(lines[i])) { bad.push(i + 1); } }
  eq(bad.length, 0, 'inlinato: nessuna riga di commento // (strip dell\'inliner; righe ' +
                    bad.slice(0, 5).join(',') + ')');
  check(v.html.indexOf('\r') < 0, 'inlinato: fine riga sempre \\n');
  nb = Buffer.byteLength(v.html, 'utf8');
  /* S12 D43 (numeri della revisione): tetto duro 96 KB e obiettivo morbido 84 KB, gli stessi
   * MAX_BYTES/SOFT_BYTES di build_config_page.py — qui si controlla il tetto duro (quello che
   * fa fallire il tool), l'obiettivo e' un avviso del tool e il margine lo misura il gate. */
  check(nb <= 98304, 'inlinato: HTML di ' + nb + ' B (' + (nb / 1024).toFixed(1) +
                     ' KB) entro il tetto di 96 KB, obiettivo 84 KB');
  return fatal;
}

/* ============================================================ esecuzione ================ */

function runVariant(v) {
  var ok0 = g_ok, fail0 = g_fail, fatal = [], pure, i;
  V = v; PAGE_HTML = v.html; PAGE_CSS = v.css; SRC = v.src; C = v.core; P = v.pipe;
  g_tag = '[' + v.name + '] ';
  if (v.inlined) {
    fatal = runGuard('0. struttura del modulo inlinato', function () { return checkInlinedModule(v); }) || [];
    pure = runGuard('0. moduli puri dell\'inlinato', function () { return pureFromInlined(v); });
    if (pure) { v.core = pure.core; v.pipe = pure.pipe; C = v.core; P = v.pipe; }
    else { fatal.push('GalPipeline/GalPageCore non caricabili'); }
  }
  if (fatal.length) { console.log(g_tag + 'sezioni saltate: ' + fatal.join('; ')); }
  else { for (i = 0; i < SECTIONS.length; i++) { runGuard(SECTIONS[i].name, SECTIONS[i].fn); } }
  return { ok: g_ok - ok0, fail: g_fail - fail0 };
}

function tally(r) { return r.ok + ' ok' + (r.fail ? ' e ' + r.fail + ' fail' : ''); }

var R_SRC = runVariant(sourceVariant()), R_INL = null, V_INL;
g_tag = '[inlinato] ';
V_INL = runGuard('0. lettura di src/pkjs/config_page.js', inlinedVariant);
if (V_INL) {
  R_INL = runVariant(V_INL);
} else if (!fs.existsSync(MOD)) {
  console.log('test_page: ' + MOD + ' assente, giro sull\'inlinato saltato ' +
              '(python3 ../../tools/build_config_page.py dalla cartella apps/galleria per generarlo)');
}

/* ============================================================ riepilogo ================= */

console.log('test_page: sorgenti ' + tally(R_SRC) + ', inlinato ' + (R_INL ? tally(R_INL) : 'saltato'));
process.exit(g_fail > 0 ? 1 : 0);

#!/usr/bin/env node
/* test_page.js — Galleria S6 (M4): test host di src/pkjs/config/page_core.js (puro) e page.js
 * (UI) con un DOM finto, secondo docs/design/galleria-s6-config-page.md §8.
 *
 * Parte 1 — page_core.js richiesto come modulo node (UMD): decodeState (hash valido/assente/
 * rotto/«città»/emoji), b64urlToBytes + utf8Decode, normalizeSettings, buildTiles, freeSlot,
 * buildPayload, payloadKb, capMessage, truncateName, thumbFits.
 *
 * Parte 2 — pipeline.js + page_core.js + previews.js + page.js girano nello stesso contesto
 * (vm.runInContext) con:
 *   - un DOM finto costruito PARSANDO page.html (tag, id, attributi, <option> comprese): un id
 *     sbagliato in page.js trova null e il test esplode; getContext/toDataURL esistono solo sui
 *     <canvas>, e gli eventi non partono sugli elementi disabled (come nel browser);
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
 *
 * DUE GIRI (revisione S6, finding #8: nessun test eseguiva l'artefatto davvero spedito). Le
 * sezioni si registrano e girano identiche su due varianti:
 *   1) «sorgenti»  = i file di src/pkjs/config/ (page.html, page.css, i 4 .js via require);
 *   2) «inlinato»  = l'HTML dentro src/pkjs/config_page.js (require: e' cio' che index.js manda
 *      nel data: URL). I corpi degli <script> e dello <style> si estraggono nell'ordine del
 *      documento; l'HTML costruisce il DOM finto come per page.html, gli script girano nello
 *      stesso contesto, e i due moduli puri si prendono da vm.runInThisContext (stesso realm).
 *      In piu' la sezione 0 controlla la struttura del modulo: intestazione «GENERATO», 4
 *      <script> nell'ordine pipeline -> page_core -> previews -> page (riconosciuti da quale
 *      globale assegnano), un solo <style>, nessun src=/link= rimasto, nessuna riga che inizia
 *      con «//» (lo strip dell'inliner), tetto di 64 KB. Se una foto della struttura e' sbagliata
 *      le sezioni del 2o giro si saltano (l'errore sarebbe illeggibile); se config_page.js manca
 *      il 2o giro e' «saltato» senza fallire (make resta verde).
 *
 * Sensibilita' verificata a mano con mutanti su page.js/page_core.js (freeSlot senza deleted,
 * token non percent-encoded, LECO non forzato, sunlight ignorato, flintRect non applicato,
 * dimensioni flint, miniatura senza ripiego, pending, frecce, nome non troncato, clamp della
 * vista, order/data/hash): ognuno fa fallire almeno un'asserzione. Sul 2o giro, con mutanti
 * sull'artefatto: testo cambiato in un <script> (fallisce solo «inlinato»), riga «//» rimasta,
 * previews e page scambiati (sezioni saltate), module.exports non stringa (1 fail).
 *
 * Esecuzione: `node test_page.js` dalla cartella test/, oppure `make -C test jstest`.
 * Esito: "test_page: sorgenti N ok, inlinato N ok" (o «saltato»), exit 1 se un giro ha fail.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var CFG = path.join(__dirname, '..', 'src', 'pkjs', 'config');
var MOD = path.join(__dirname, '..', 'src', 'pkjs', 'config_page.js');   /* l'artefatto spedito */
var SCRIPTS = ['pipeline.js', 'page_core.js', 'previews.js', 'page.js'];
var b64 = require(path.join(__dirname, '..', 'src', 'pkjs', 'b64.js'));

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
                         outline: 0, interval_min: 30, order: 0, shake_next: 1, info_row: 15 };
var SETTINGS_KEYS = ['layout', 'font', 'clock_mode', 'leading_zero', 'text_color', 'outline',
                     'interval_min', 'order', 'shake_next', 'info_row'];

/* ============================================================ 1. page_core.js (puro) ==== */

section('1a. decodeState', function () {
  var d = C.decodeState('');
  eq(d.ok, false, 'hash vuoto: ok false');
  eq(d.error, 'hash assente', 'hash vuoto: error');
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
  eqJson(Object.keys(C.normalizeSettings({})), SETTINGS_KEYS, 'normalizeSettings: le 10 chiavi nell\'ordine di album.js');
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
  eqJson(C.SETTINGS_FIELDS.map(function (f) { return f[0]; }), SETTINGS_KEYS, 'SETTINGS_FIELDS: nomi e ordine');
  eqJson(C.INTERVALS, [0, 5, 15, 30, 60, 180, 1440], 'INTERVALS');
  eq(C.MAX_SLOTS, 12, 'MAX_SLOTS 12');
  eq(C.MAX_THUMB_CHARS, 6000, 'MAX_THUMB_CHARS 6000');
  eq(C.MAX_NAME, 64, 'MAX_NAME 64');
});

/* stato di comodo: foto negli slot indicati, con nome e crc del formato chiesto */
function mkState(over) {
  var s = { v: 1, platform: 'emery', fmt: 1, cap_kb: 900, dev: true, settingsSet: true,
            settings: {}, photos: [], order: [], deleted: [], watch: null }, k;
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
  eq(Object.keys(p.settings).length, 10, 'buildPayload: 10 impostazioni');
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
  eq(C.capMessage(901, 900, 0), 'Troppi dati per un solo invio (901 KB su 900)',
     'capMessage: sopra il tetto senza foto nuove');
  eq(C.capMessage(93, 60, 2), 'Troppi dati per un solo invio (93 KB su 60): togli 1 foto o salva in più volte',
     'capMessage: 93 su 60 con 2 nuove = togli 1');
  eq(C.capMessage(200, 60, 3), 'Troppi dati per un solo invio (200 KB su 60): togli 3 foto o salva in più volte',
     'capMessage: 200 su 60 con 3 nuove = togli 3');
  contains(C.capMessage(61, 60, 1), 'togli 1 foto', 'capMessage: una sola foto');

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
  return { left: 0, top: 0, width: this.width, height: this.height, right: this.width, bottom: this.height };
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

var DEV_RT = 'http://127.0.0.1:5555/close?';
var DEV_SEARCH = '?return_to=' + encodeURIComponent(DEV_RT);

/* opts: {state|hash, search, protocol, bitmap ('ok'|'zero'|'reject'|'throw'|'none'|'defer': le promesse
 *        restano in env.deferred finche' il test non le risolve), imgW, imgH, imgFail, toDataURL,
 *        previews (false = non caricare previews.js), pointer (false = niente Pointer Events), cropWidth,
 *        noCapture, noPerformance, navigator ({userAgent, platform, maxTouchPoints}: assente di default)} */
function loadPage(opts) {
  opts = opts || {};
  var root = parseHtml(PAGE_HTML), clock = 1000, h;
  var env = { ctxOpts: [], closed: 0, revoked: 0, objectUrls: 0, bitmapOpts: null, images: 0,
              created: [], dataUrls: [], deferred: [], pixelSeed: 0, imageDataThrow: 0, scrolls: [],
              toDataURL: opts.toDataURL || function () { return 'data:image/jpeg;base64,' + rep('A', 120); } };
  setEnv(root, env);
  var doc = {
    body: root,
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
    this.naturalWidth = opts.imgW || 640; this.naturalHeight = opts.imgH || 480;
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
    Image: Img
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
  if (opts.previews !== false) { vm.runInContext(SRC['previews.js'], sb, { filename: 'previews.js' }); }
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
  h.kbNum = function () { var m = /Da inviare: (\d+) KB/.exec(h.txt('kb')); return m ? +m[1] : -1; };
  if (!opts.noCapture) { h.G.setNavigate(function (u) { h.navs.push(u); }); }
  return h;
}

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
  var ids = ['head', 'watch', 'kb', 'status', 'photos', 'tiles', 'add', 'file', 'addHelp', 'editor',
             'editName', 'cropWrap', 'crop', 'zoom', 'fit', 'gamma', 'gammaVal', 'lift', 'liftVal',
             'dither', 'sunlight', 'sunlightRow', 'previewMode', 'previewModeRow', 'preview', 'etime',
             'addOk', 'addCancel', 'settings', 'settingsNote', 's_layout', 's_font', 'fontPreview',
             's_clock_mode', 's_leading_zero', 's_interval_min', 's_order', 's_shake_next',
             's_text_color', 's_outline', 's_info_row', 's_info_row_b0', 's_info_row_b1',
             's_info_row_b2', 's_info_row_b3', 'footer', 'save', 'cancel', 'msg'], i;
  for (i = 0; i < ids.length; i++) { check(get(ids[i]) !== null, 'markup: esiste #' + ids[i]); }
  eq(get('crop').tagName, 'CANVAS', 'markup: #crop e\' un canvas');
  eq(get('preview').tagName, 'CANVAS', 'markup: #preview e\' un canvas');
  eq(get('file').tagName, 'INPUT', 'markup: #file e\' un input');
  eq(get('file').type, 'file', 'markup: #file di tipo file');
  eq(get('file').accept, 'image/*', 'markup: #file accetta image/*');
  eq(get('file').attrs.capture, undefined, 'markup: #file SENZA capture (si sceglie dalla Libreria)');
  eq(get('add').tagName, 'LABEL', 'markup: #add e\' una label');
  eq(get('add').attrs['for'], 'file', 'markup: la label #add apre #file');
  eq(get('save').tagName, 'BUTTON', 'markup: #save e\' un button');
  eq(get('save').type, 'button', 'markup: #save type=button (niente submit)');
  eq(get('cancel').type, 'button', 'markup: #cancel type=button');
  eq(get('addOk').type, 'button', 'markup: #addOk type=button');
  eq(get('fit').type, 'button', 'markup: #fit type=button');
  eq(get('s_font').tagName, 'SELECT', 'markup: #s_font e\' una select');
  eq(get('s_font').children.length, 0, 'markup: #s_font vuota (la riempie page.js)');
  eq(get('dither').children.length, 0, 'markup: #dither vuota (dipende dal formato)');
  eq(get('previewMode').options().length, 2, 'markup: #previewMode con 2 opzioni');
  eqJson(get('previewMode').options().map(function (o) { return o._value; }), ['sun', 'nominal'],
         'markup: opzioni sun/nominal');
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
  check(/lang="it"/.test(PAGE_HTML), 'markup: lang="it"');
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
    eq(srcs, '<script src="pipeline.js"|<script src="page_core.js"|<script src="previews.js"|<script src="page.js"',
       'markup: ordine degli script pipeline, page_core, previews, page');
    contains(PAGE_HTML, '<script src="previews.js" data-optional="1">', 'markup: previews.js opzionale');
    contains(PAGE_HTML, '<link rel="stylesheet" href="page.css">', 'markup: un solo foglio di stile locale');
  }
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
  eq(h.txt('watch'), 'Pebble Time 2 · 200×228 a colori', 'etichetta orologio emery');
  eq(h.disp('status'), 'none', 'stato valido: nessun avviso');
  eq(h.disp('settingsNote'), 'none', 'settingsSet true: nessuna nota');
  eq(h.disp('editor'), 'none', 'editor chiuso all\'avvio');
  eq(G.mode(), 'dev', 'modalita\' dev (return_to nella query)');
  eq(h.txt('msg'), '', 'nessun messaggio all\'avvio');

  eqJson(slotsOf(G.tiles), [3, 0, 5, 9], 'tessere: order, resto dell\'album, estranee');
  eqJson(kindsOf(G.tiles), ['album', 'album', 'album', 'foreign'], 'tessere: kind');
  eqJson(h.tileIds(), ['tile_3', 'tile_0', 'tile_5', 'tile_9'], 'DOM: una tessera per slot, nell\'ordine');
  contains(h.txt('tile_3'), 'mare.jpg', 'tessera 3: nome');
  contains(h.txt('tile_3'), 'manca il formato per questo orologio', 'tessera 3: avviso formato mancante');
  contains(h.txt('tile_0'), 'città.jpg', 'tessera 0: nome con accento');
  notContains(h.txt('tile_0'), 'da inviare', 'tessera 0: gia\' sull\'orologio con lo stesso crc');
  contains(h.txt('tile_5'), 'da inviare', 'tessera 5: crc diverso');
  contains(h.txt('tile_9'), 'sull\'orologio', 'tessera 9: estranea');
  contains(h.txt('tile_9'), 'slot 9', 'tessera 9: senza nome mostra "slot 9"');
  eq(h.el('tile_0').children[0].tagName, 'IMG', 'tessera 0: miniatura come <img>');
  eq(h.el('tile_0').children[0].src, 'data:image/jpeg;base64,AAAB', 'tessera 0: src della miniatura');
  eq(h.el('tile_5').children[0].tagName, 'DIV', 'tessera 5: senza miniatura, riquadro grigio');
  eq(h.el('tile_5').children[0].className, 'thumb empty', 'tessera 5: classe thumb empty');
  eq(h.el('tile_5').children[0].textContent, 'slot 5', 'tessera 5: riquadro con "slot 5"');
  eq(h.el('up_3').disabled, true, 'prima tessera: freccia su disabilitata');
  eq(h.el('down_3').disabled, false, 'prima tessera: freccia giu\' attiva');
  eq(h.el('down_9').disabled, true, 'ultima tessera: freccia giu\' disabilitata');
  eq(h.el('del_9').disabled, false, 'estranea: si puo\' eliminare');
  eq(h.el('file').disabled, false, 'album non pieno: input file attivo');
  eq(h.txt('addHelp'), 'scegli dalla Libreria', 'aiuto per l\'aggiunta');

  /* impostazioni scritte nei campi */
  eq(h.el('s_layout').value, '0', 'campo layout');
  eq(h.el('s_layout').options().length, 2, 'layout: 2 opzioni');
  eq(h.el('s_font').value, '2', 'campo font');
  eq(h.el('s_font').options().length, 4, 'font: 4 opzioni');
  eq(h.el('s_font').options()[3].id, 's_font_leco', 'font: l\'opzione LECO ha id s_font_leco');
  eq(h.el('s_font_leco').disabled, false, 'LECO attivo con layout 0');
  eq(h.el('s_clock_mode').value, '1', 'campo formato ora');
  eq(h.el('s_leading_zero').value, '2', 'campo zero iniziale');
  eq(h.el('s_interval_min').value, '60', 'campo intervallo');
  eq(h.el('s_interval_min').options().length, 7, 'intervallo: 7 opzioni');
  eqJson(h.el('s_interval_min').options().map(function (o) { return +o._value; }), C.INTERVALS,
         'intervallo: i valori di INTERVALS');
  eq(h.el('s_order').value, '1', 'campo ordine');
  eq(h.el('s_text_color').value, '3', 'campo colore testo');
  eq(h.el('s_text_color').options().length, 5, 'colore testo: 5 opzioni');
  eq(h.el('s_outline').value, '1', 'campo contorno');
  eq(h.el('s_shake_next').checked, false, 'scossa: 0');
  eq(h.el('s_info_row').value, '5', 'riga info: valore composto');
  eqJson([0, 1, 2, 3].map(function (i) { return h.el('s_info_row_b' + i).checked; }), [true, false, true, false],
         'riga info: caselle da info_row 5 (passi + data)');
  eq(h.el('fontPreview').src, h.sb.GalPreviews.barlow, 'anteprima del font (Barlow) da GalPreviews');
  eq(h.disp('fontPreview'), '', 'anteprima del font visibile');

  /* dithering e righe dipendenti dal formato */
  eqJson(h.el('dither').options().map(function (o) { return o._value; }), ['fs', 'bayer', 'none'],
         'emery: Floyd-Steinberg, Bayer, Nessuno');
  eq(h.el('dither').value, 'fs', 'dithering di default: fs');
  eq(h.disp('sunlightRow'), '', 'emery: riga "Ottimizza per il vetro" visibile');
  eq(h.disp('previewModeRow'), '', 'emery: riga anteprima visibile');

  /* contatore KB */
  check(/^Da inviare: \d+ KB \/ 900 KB$/.test(h.txt('kb')), 'contatore KB: "' + h.txt('kb') + '"');
  eq(h.kbNum(), C.payloadKb(G.buildPayload()), 'contatore KB = payloadKb del payload corrente');
  eq(h.el('save').disabled, false, 'Salva attivo');
  eqJson(G.buildPayload().order, [3, 0, 5, 9], 'payload iniziale: order = tessere');
  eqJson(G.buildPayload().deleted, [], 'payload iniziale: nessuna eliminazione nuova');
  eqJson(G.buildPayload().photos, [], 'payload iniziale: nessuna foto nuova');
  eq(G.buildPayload().settings.font, 2, 'payload iniziale: impostazioni dai campi');
});

section('2c. avvisi: hash assente, settingsSet false, orologio sconosciuto, flint', function () {
  var h = loadPage({ hash: '', search: '', protocol: 'file:' });
  eq(h.G.state.ok, false, 'hash assente: stato non valido');
  eq(h.disp('status'), '', 'hash assente: avviso visibile');
  contains(h.txt('status'), 'Stato non ricevuto', 'hash assente: testo dell\'avviso');
  contains(h.txt('status'), 'modalità prova', 'hash assente: parla di modalita\' prova');
  eq(h.txt('watch'), 'orologio sconosciuto: preparo foto a colori', 'hash assente: orologio sconosciuto');
  eq(h.disp('settingsNote'), '', 'hash assente: impostazioni non salvate');
  eqJson(h.G.tiles, [], 'hash assente: nessuna tessera');
  eq(h.G.mode(), 'test', 'file: senza return_to = modalita\' prova');

  var h2 = loadPage({ hash: '#!!!rotto!!!', search: '', protocol: 'http:' });
  eq(h2.G.state.ok, false, 'hash rotto: stato non valido');
  contains(h2.txt('status'), 'Stato non ricevuto', 'hash rotto: avviso');
  contains(h2.txt('status'), 'hash non valido', 'hash rotto: dettaglio dell\'errore');

  var h3 = loadPage({ state: mkState({ settingsSet: false, platform: 'flint', fmt: 2 }) });
  eq(h3.disp('settingsNote'), '', 'settingsSet false: nota visibile');
  contains(h3.txt('settingsNote'), 'non ancora salvate', 'settingsSet false: testo della nota');
  eq(h3.txt('watch'), 'Pebble 2 Duo · 144×168 bianco e nero', 'etichetta orologio flint');
  eqJson(h3.el('dither').options().map(function (o) { return o._value; }), ['fs', 'atkinson', 'none'],
         'flint: Floyd-Steinberg, Atkinson, Nessuno');
  eq(h3.disp('sunlightRow'), 'none', 'flint: niente "Ottimizza per il vetro"');
  eq(h3.disp('previewModeRow'), 'none', 'flint: niente scelta dei colori d\'anteprima');

  var h4 = loadPage({ state: mkState({ platform: 'sconosciuta', fmt: 2, settingsSet: true }) });
  eq(h4.txt('watch'), 'orologio sconosciuto: preparo foto in bianco e nero',
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

  h.click('del_0');
  eqJson(slotsOf(G.tiles), [3, 5, 9], 'elimina la 0: tessera via');
  eqJson(G.deleted, [0], 'elimina la 0: finisce in deleted');
  eq(h.doc.getElementById('tile_0'), null, 'DOM: tessera 0 sparita');
  eqJson(G.buildPayload().deleted, [0], 'payload: deleted');
  eqJson(G.buildPayload().order, [3, 5, 9], 'payload: order senza la 0');
  h.click('del_9');
  eqJson(G.deleted, [0, 9], 'anche l\'estranea finisce in deleted');
  eq(h.doc.getElementById('del_9'), null, 'eliminata: niente piu\' pulsante (non si elimina due volte)');
  eqJson(G.buildPayload().deleted, [0, 9],
         'payload: solo le eliminazioni di questa sessione (lo slot 7, gia\' in state.deleted, non si rimanda)');
  eq(h.kbNum(), C.payloadKb(G.buildPayload()), 'contatore KB aggiornato dopo le eliminazioni');
});

section('2e. aggiunta di una foto con codifica vera (emery)', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), G = h.G, ed = G.editor;
  var exp = expectEmery({ gamma: 1, lift: 0, dither: 'fs', sunlight: false });
  h.chooseFile('foto di prova città.jpg');
  eq(G.editorOpen, true, 'scelto il file: editor aperto');
  eq(h.disp('editor'), '', 'editor visibile');
  eq(h.el('save').disabled, true, 'Salva disabilitato con l\'editor aperto');
  eq(h.env.bitmapOpts && h.env.bitmapOpts.imageOrientation, 'from-image',
     'createImageBitmap con imageOrientation from-image (EXIF)');
  eq(h.txt('editName'), 'foto di prova città.jpg · 640×480 px', 'nome e dimensioni della foto');
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
  contains(h.txt('etime'), 'codifica', 'riga dei tempi');
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
  contains(h.txt('tile_1'), 'nuova', 'tessera nuova: badge');
  eq(h.el('tile_1').children[0].src, a.thumb, 'tessera nuova: miniatura');
  contains(h.txt('msg'), 'Foto aggiunta nello slot 1', 'messaggio di conferma');
  contains(h.txt('msg'), '45 KB', 'messaggio con la dimensione');
  eq(h.el('save').disabled, false, 'Salva di nuovo attivo');
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
  h.click('del_1');
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

  /* uno slot appena eliminato si riusa solo se non ne restano di mai usati */
  var s2 = mkState({ settingsSet: true });
  s2.photos[0] = photo('a.jpg', 1, 1);
  s2.photos[1] = photo('b.jpg', 1, 2);
  s2.order = [0, 1];
  var h2 = loadPage({ state: s2, search: DEV_SEARCH });
  h2.click('del_0');
  h2.chooseFile('nuova.jpg');
  h2.timers.run();
  h2.click('addOk');
  eq(h2.G.added[0].slot, 2, 'slot libero: il 2 (mai usato), non lo 0 appena eliminato');
  eqJson(h2.G.deleted, [0], 'lo slot 0 resta fra le eliminazioni');
  eqJson(h2.G.buildPayload().order, [1, 2], 'payload: order senza lo slot eliminato');
});

section('2f. editor: Annulla, gamma/lift, dithering, anteprima, sunlight', function () {
  var h = loadPage({ state: mkState({ settingsSet: true }), search: DEV_SEARCH, cropWidth: 260 }), G = h.G, ed = G.editor;
  h.chooseFile('a.jpg');
  eq(h.el('crop').width, 260, 'cornice: usa la larghezza utile del contenitore');
  eq(h.el('crop').height, Math.round(260 * 228 / 200), 'cornice: altezza in rapporto');
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

  var putSun = Array.prototype.slice.call(h.el('preview')._put.data);
  h.select('previewMode', 'nominal');
  var putNom = Array.prototype.slice.call(h.el('preview')._put.data);
  eq(h.el('previewMode').value, 'nominal', 'anteprima: modalita\' colori nominali');
  check(String(putSun) !== String(putNom), 'anteprima: i colori nominali sono diversi da quelli sul vetro');
  eq(h.el('preview')._put.w, 400, 'anteprima nominale: sempre 2x');
  h.select('previewMode', 'sun');

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
  contains(h.txt('msg'), 'ritaglio annullato', 'Annulla: messaggio');
  eq(h.el('save').disabled, false, 'Annulla: Salva riattivato');
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
  fire(cv, 'pointermove', { pointerId: 1, clientX: 3000, clientY: 100 });
  eq(ed.tx, 0, 'trascinamento oltre il bordo: la cornice resta coperta (tx <= 0)');
  fire(cv, 'pointerup', { pointerId: 1 });
  fire(cv, 'pointermove', { pointerId: 1, clientX: 0, clientY: 0 });
  eq(ed.tx, 0, 'dopo pointerup il movimento non sposta piu\' nulla');

  fire(cv, 'wheel', { deltaY: -100, clientX: 150, clientY: 171 });
  eq(Math.round(ed.scale / scale0 * 100) / 100, 1.1, 'rotellina in su: ingrandisce del 10%');
  eq(h.el('zoom').value, '1.1', 'slider zoom aggiornato dalla rotellina');
  fire(cv, 'wheel', { deltaY: 100, clientX: 150, clientY: 171 });
  eq(Math.round(ed.scale / scale0 * 1000) / 1000, 1, 'rotellina in giu\': torna indietro');

  h.range('zoom', 3);
  eq(Math.round(ed.scale / ed.cover * 100) / 100, 3, 'slider zoom: scala 3x rispetto a cover');
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
  eq(h.txt('addHelp'), 'album pieno: elimina una foto', 'album pieno: testo di aiuto');
  eq(fire(h.el('file'), 'change'), false, 'album pieno: l\'input disabilitato non manda change');
  G.addFile({ name: 'tredicesima.jpg' });
  eq(G.editorOpen, false, 'album pieno: l\'editor non si apre');
  contains(h.txt('msg'), 'album pieno', 'album pieno: messaggio');
  h.click('del_4');
  eq(h.el('file').disabled, false, 'eliminata una foto: si puo\' aggiungere');
  eq(h.txt('addHelp'), 'scegli dalla Libreria', 'aiuto ripristinato');
  h.chooseFile('nuova.jpg');
  h.timers.run();
  h.click('addOk');
  eq(G.added[0].slot, 4, 'unico slot disponibile: il 4 appena eliminato');
  eqJson(G.deleted, [4], 'lo slot 4 resta in deleted (l\'album lo svuota e poi lo riempie)');
  eq(G.buildPayload().photos[0].slot, 4, 'payload: foto nuova sullo slot 4');
});

section('2i. impostazioni: LECO e layout, riga info, lettura nel payload', function () {
  var h = loadPage({ state: mkState({ settingsSet: true, settings: { layout: 0, font: 3, info_row: 0 } }),
                     search: DEV_SEARCH }), G = h.G;
  eq(h.el('s_font').value, '3', 'layout 0: LECO ammesso');
  eq(h.el('s_font_leco').disabled, false, 'layout 0: opzione LECO attiva');
  eq(h.disp('fontPreview'), 'none', 'LECO non ha anteprima PNG');
  eqJson([0, 1, 2, 3].map(function (i) { return h.el('s_info_row_b' + i).checked; }),
         [false, false, false, false], 'info_row 0: nessuna casella');
  eq(h.el('s_info_row').value, '0', 'info_row 0 nel campo nascosto');

  h.select('s_layout', '1');
  eq(h.el('s_font_leco').disabled, true, 'layout Tutto schermo: LECO disabilitato');
  eq(h.el('s_font').value, '0', 'layout Tutto schermo: LECO selezionato torna ad Anton');
  eq(h.el('fontPreview').src, h.sb.GalPreviews.anton, 'anteprima del font Anton');
  eq(h.disp('fontPreview'), '', 'anteprima visibile');
  eq(G.buildPayload().settings.font, 0, 'payload: font 0');
  eq(G.buildPayload().settings.layout, 1, 'payload: layout 1');
  h.select('s_layout', '0');
  eq(h.el('s_font_leco').disabled, false, 'tornando al layout Un terzo LECO si riattiva');
  eq(h.el('s_font').value, '0', 'il font resta quello scelto');

  h.select('s_font', '1');
  eq(h.el('fontPreview').src, h.sb.GalPreviews.bebas, 'anteprima Bebas');
  h.checkbox('s_info_row_b1', true);
  h.checkbox('s_info_row_b3', true);
  eq(h.el('s_info_row').value, '10', 'riga info: batteria + Bluetooth = 10');
  eq(G.buildPayload().settings.info_row, 10, 'payload: info_row 10');
  h.checkbox('s_shake_next', true);
  h.select('s_interval_min', '5');
  h.select('s_text_color', '4');
  h.select('s_outline', '2');
  h.select('s_clock_mode', '2');
  h.select('s_leading_zero', '1');
  h.select('s_order', '1');
  eqJson(G.buildPayload().settings,
         { layout: 0, font: 1, clock_mode: 2, leading_zero: 1, text_color: 4, outline: 2,
           interval_min: 5, order: 1, shake_next: 1, info_row: 10 },
         'payload: le 10 impostazioni lette dai campi');

  /* senza previews.js la pagina funziona lo stesso (script data-optional) */
  var h2 = loadPage({ state: mkState({ settingsSet: true }), previews: false });
  eq(h2.sb.GalPreviews, undefined, 'previews.js non caricato');
  eq(h2.disp('fontPreview'), 'none', 'senza GalPreviews: nessuna anteprima del font');
  eq(h2.el('s_font').value, '0', 'senza previews la pagina si avvia lo stesso');
  eq(h2.txt('msg'), '', 'senza previews: nessun errore');

  /* il contatore KB e il tetto seguono anche le impostazioni: con la miniatura si porta il payload a
   * 1 byte da un multiplo di 1024, poi "5" -> "180" (+2 byte) sfora e info_row 15 -> 7 (-1) rientra */
  var st3 = mkState({ settingsSet: true, settings: { interval_min: 5 } });
  var h3 = loadPage({ state: st3, search: DEV_SEARCH });
  h3.chooseFile('kb.jpg'); h3.timers.run(); h3.click('addOk');
  var len0 = JSON.stringify(h3.G.buildPayload()).length;                  /* miniatura di 120 'A' */
  var n = 120 + ((1023 - (len0 % 1024)) + 1024) % 1024, len1 = len0 + n - 120, kb1 = Math.ceil(len1 / 1024);
  var st4 = mkState({ settingsSet: true, settings: { interval_min: 5 }, cap_kb: kb1 });
  var h4 = loadPage({ state: st4, search: DEV_SEARCH, toDataURL: function () { return 'data:image/jpeg;base64,' + rep('A', n); } });
  h4.chooseFile('kb.jpg'); h4.timers.run(); h4.click('addOk');
  eq(JSON.stringify(h4.G.buildPayload()).length, len1, 'payload a 1 byte da un multiplo di 1024');
  eq(h4.kbNum(), kb1, 'contatore dopo l\'aggiunta');
  eq(h4.el('save').disabled, false, 'al tetto esatto Salva e\' attivo');
  h4.select('s_interval_min', '180');
  eq(h4.kbNum(), kb1 + 1, 'contatore KB ricalcolato dopo un cambio di select');
  eq(h4.G.overCap, true, 'cambio di impostazione sopra il tetto: overCap');
  eq(h4.el('save').disabled, true, 'cambio di impostazione sopra il tetto: Salva disabilitato');
  contains(h4.txt('msg'), 'Troppi dati', 'cambio di impostazione sopra il tetto: messaggio');
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
  h.click('del_5');
  h.click('save');
  eq(h.net.posts.length, 1, 'un solo POST');
  eq(h.net.posts[0].url, '/save', 'POST su /save (URL relativo)');
  eq(h.net.posts[0].headers['content-type'], 'application/json', 'Content-Type: application/json');
  eq(h.el('save').disabled, true, 'durante l\'invio Salva e\' disabilitato');
  contains(h.txt('msg'), 'Invio', 'messaggio di invio in corso');
  eq(h.click('save'), false, 'secondo clic su Salva: bloccato (pulsante disabilitato)');
  eq(h.net.posts.length, 1, 'nessun secondo POST');

  var body = JSON.parse(h.net.posts[0].body);
  eqJson(Object.keys(body), ['v', 'settings', 'order', 'deleted', 'photos'], 'corpo: chiavi del payload');
  eq(body.v, 1, 'corpo: v 1');
  eq(Object.keys(body.settings).length, 10, 'corpo: 10 impostazioni');
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
  contains(h.txt('msg'), 'Salvato (seq 7)', 'messaggio di conferma');
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
  eq(h.net.posts.length, 0, 'telefono: nessun POST');
  eq(h.navs.length, 1, 'telefono: una navigazione');
  check(h.navs[0].indexOf('pebblejs://close#') === 0, 'telefono: pebblejs://close#…');
  var payload = JSON.parse(decodeURIComponent(h.navs[0].slice('pebblejs://close#'.length)));
  eqJson(Object.keys(payload), ['v', 'settings', 'order', 'deleted', 'photos'], 'telefono: payload completo');
  eq(payload.photos[0].data.length, 45600, 'telefono: la foto viaggia intera');
  eqJson(payload, G.lastPayload, 'telefono: lastPayload');
  notContains(h.navs[0].slice(17), '"', 'telefono: JSON percent-encoded (nessun apice nudo)');
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
  contains(h3.txt('msg'), 'modalità prova: payload di', 'prova: messaggio con i KB');
  check(!!h3.G.lastPayload, 'prova: payload conservato in GalPage.lastPayload');
  h3.click('cancel');
  eq(h3.navs.length, 0, 'prova: Annulla non naviga');
  contains(h3.txt('msg'), 'chiusura senza modifiche', 'prova: messaggio di Annulla');

  /* senza setNavigate si usa location.href */
  var h4 = loadPage({ state: stateEmery(), search: '', protocol: 'data:', noCapture: true });
  h4.click('save');
  eq(h4.loc.hrefs.length, 1, 'senza setNavigate: location.href impostato');
  check(h4.loc.hrefs[0].indexOf('pebblejs://close#') === 0, 'senza setNavigate: pebblejs://close#…');
});

section('2l. tetto KB', function () {
  var h = loadPage({ state: stateEmery({ cap_kb: 30 }), search: DEV_SEARCH }), G = h.G;
  eq(G.state.cap_kb, 30, 'tetto 30 KB dallo stato');
  contains(h.txt('kb'), '/ 30 KB', 'contatore con il tetto');
  eq(G.overCap, false, 'all\'inizio si sta sotto il tetto');
  h.chooseFile('grossa.jpg');
  h.timers.run();
  h.click('addOk');
  eq(G.overCap, true, 'con una foto da 45 KB si sfora');
  eq(h.el('save').disabled, true, 'sopra il tetto: Salva disabilitato');
  eq(h.txt('msg'), C.capMessage(h.kbNum(), 30, 1), 'messaggio del tetto');
  contains(h.txt('msg'), 'togli 1 foto o salva in più volte', 'messaggio: quante foto togliere');
  eq(h.el('msg').className, 'err', 'messaggio del tetto in rosso');
  notContains(h.txt('msg'), 'Foto aggiunta', 'sopra il tetto non si annuncia l\'aggiunta');
  eq(h.click('save'), false, 'sopra il tetto il clic su Salva non parte');
  eq(h.net.posts.length, 0, 'sopra il tetto: nessun POST');

  h.click('del_' + G.added[0].slot);
  eq(G.overCap, false, 'tolta la foto si torna sotto il tetto');
  eq(h.el('save').disabled, false, 'Salva riattivato');
  notContains(h.txt('msg'), 'Troppi dati', 'messaggio del tetto ripulito');
  contains(h.txt('msg'), 'Foto nuova scartata', 'al suo posto il messaggio dell\'eliminazione (#10)');
  h.click('save');
  eq(h.net.posts.length, 1, 'ora il salvataggio parte');
});

section('2m. errori: POST fallito, immagine illeggibile, miniatura troppo grande', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h.net.reply = function () { return { status: 500, text: 'errore interno' }; };
  h.click('save');
  h.net.flush();
  contains(h.txt('msg'), 'Salvataggio fallito', 'POST 500: messaggio');
  contains(h.txt('msg'), 'HTTP 500', 'POST 500: codice');
  eq(h.el('msg').className, 'err', 'POST 500: messaggio in rosso');
  eq(h.navs.length, 0, 'POST 500: nessuna navigazione');
  eq(h.el('save').disabled, false, 'POST 500: Salva riattivato per riprovare');
  h.net.reply = function () { return { status: 200, text: JSON.stringify({ ok: false, error: 'slot doppio' }) }; };
  h.click('save');
  h.net.flush();
  contains(h.txt('msg'), 'Salvataggio fallito: slot doppio', 'ok:false: messaggio del server');
  eq(h.navs.length, 0, 'ok:false: nessuna navigazione');
  h.net.reply = function () { return { status: 0, text: '' }; };
  h.click('save');
  h.net.flush();
  contains(h.txt('msg'), 'dev server non raggiungibile', 'rete giu\': messaggio');
  h.net.reply = null;
  h.click('save');
  h.net.flush();
  eq(h.navs.length, 1, 'al tentativo successivo il salvataggio riesce');

  /* immagine non decodificabile: createImageBitmap rifiuta e anche il fallback <img> */
  var h2 = loadPage({ state: stateEmery(), bitmap: 'reject', imgFail: true });
  h2.chooseFile('rotta.jpg');
  eq(h2.G.editorOpen, false, 'immagine rotta: editor non aperto');
  eq(h2.disp('editor'), 'none', 'immagine rotta: editor nascosto');
  contains(h2.txt('msg'), 'Non riesco a leggere rotta.jpg', 'immagine rotta: messaggio');
  eq(h2.el('msg').className, 'err', 'immagine rotta: messaggio in rosso');
  eq(h2.env.revoked, 1, 'immagine rotta: objectURL revocato');

  /* createImageBitmap assente: fallback su <img> */
  var h3 = loadPage({ state: stateEmery(), bitmap: 'none', imgW: 300, imgH: 400 });
  h3.chooseFile('fallback.jpg');
  eq(h3.G.editorOpen, true, 'senza createImageBitmap l\'editor si apre lo stesso');
  eq(h3.txt('editName'), 'fallback.jpg · 300×400 px', 'fallback: dimensioni da naturalWidth/Height');
  eq(h3.env.revoked, 1, 'fallback: objectURL revocato dopo il caricamento');
  h3.timers.run();
  h3.click('addOk');
  eq(h3.G.added.length, 1, 'fallback: la foto si aggiunge');
  eq(h3.env.closed, 0, 'fallback: nessun ImageBitmap da chiudere');

  /* createImageBitmap che restituisce un bitmap vuoto: si ripiega su <img> */
  var h4 = loadPage({ state: stateEmery(), bitmap: 'zero', imgW: 500, imgH: 500 });
  h4.chooseFile('vuota.jpg');
  eq(h4.G.editorOpen, true, 'bitmap vuoto: fallback <img>');
  eq(h4.txt('editName'), 'vuota.jpg · 500×500 px', 'bitmap vuoto: dimensioni dal fallback');

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
  contains(h9.txt('msg'), 'Non riesco a leggere', 'addFile(null): messaggio');
  eq(h9.el('msg').className, 'err', 'addFile(null): messaggio in rosso');
  eq(h9.el('save').disabled, false, 'addFile(null): Salva resta attivo');

  /* dev server che non risponde piu' (processo fermato a meta' invio): timer di guardia, Salva torna attivo */
  var h10 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h10.click('save');
  eq(h10.el('save').disabled, true, 'timeout: durante l\'invio Salva e\' disabilitato');
  check(h10.timers.q.length === 1 && h10.timers.q[0].ms >= 10000 && h10.timers.q[0].ms <= 120000,
        'timeout: un timer di guardia fra 10 e 120 s in coda (' + (h10.timers.q[0] && h10.timers.q[0].ms) + ')');
  h10.timers.run();
  contains(h10.txt('msg'), 'Salvataggio fallito', 'timeout: messaggio di errore');
  contains(h10.txt('msg'), 'nessuna risposta', 'timeout: dice che il server non ha risposto');
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
  h.click('del_5');                              /* le tessere restano vive con l'editor aperto */
  eqJson(h.G.deleted, [5], 'si puo\' eliminare una tessera con l\'editor aperto');
  eq(h.el('save').disabled, true, 'Salva resta disabilitato con l\'editor aperto (anche dopo un ricalcolo dei KB)');
  eq(h.kbNum(), kbBefore, 'contatore KB ricalcolato');
  h.chooseFile('due.jpg');                       /* seconda apertura senza chiudere la prima */
  eq(h.G.editorOpen, true, 'seconda apertura: editor ancora aperto');
  eq(h.txt('editName'), 'due.jpg · 640×480 px', 'seconda apertura: la nuova foto sostituisce la vecchia');
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
  contains(h6.txt('msg'), 'Errore nel salvataggio', 'XHR assente: messaggio d\'errore');
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
  contains(h.txt('status'), 'riapri le impostazioni', '#1 avviso: dice di riaprire le impostazioni dall\'app');
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
  contains(h.txt('msg'), 'stato non ricevuto: riapri le impostazioni dall\'app', '#1 save() forzato: messaggio');
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
  contains(h.txt('kb'), '/ 200 KB', '#4 contatore con il tetto iOS');
  var h2 = loadPage({ state: stateEmery({ cap_kb: 900 }), navigator: { userAgent: AND, platform: 'Linux armv8l', maxTouchPoints: 5 } });
  eq(h2.G.state.cap_kb, 900, '#4 pagina su Android: 900');
  eq(loadPage({ state: stateEmery({ cap_kb: 900 }) }).G.state.cap_kb, 900, '#4 senza navigator (test): 900');
  eq(loadPage({ hash: '', navigator: { userAgent: IOS } }).G.state.cap_kb, 200, '#4 anche senza stato: 200 su iOS');
  for (var k = 0; k < 5; k++) { h.chooseFile('i' + k + '.jpg'); h.timers.run(); h.click('addOk'); }
  eq(h.G.overCap, true, '#4 iPhone: 5 foto (~225 KB) sopra il tetto');
  eq(h.el('save').disabled, true, '#4 iPhone: Salva disabilitato');
  contains(h.txt('msg'), 'su 200', '#4 messaggio del tetto con 200');
});

section('3d. #6 estranee sempre in coda, senza frecce, riordino rifiutato', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), G = h.G, l;   /* tessere [3, 0, 5, 9*] */
  eqJson(kindsOf(G.tiles), ['album', 'album', 'album', 'foreign'], '#6 estranea in coda all\'avvio');
  eq(h.el('up_9').disabled, true, '#6 estranea: freccia su disabilitata');
  eq(h.el('down_9').disabled, true, '#6 estranea: freccia giu\' disabilitata');
  eq(h.el('del_9').disabled, false, '#6 estranea: si puo\' eliminare');
  eq(h.el('down_5').disabled, true, '#6 ultima foto dell\'album: giu\' disabilitata (sotto c\'e\' solo l\'estranea)');
  eq(h.el('up_5').disabled, false, '#6 ultima foto dell\'album: su attiva');
  contains(h.txt('tile_9'), 'solo sull\'orologio: resta in coda', '#6 badge che lo dice');
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
  h2.click('del_11');
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
  check(tb && /min-height: ?40px/.test(tb[1]), '#10 .tbtns button min-height 40px');
  check(tg && /gap: ?8px/.test(tg[1]), '#10 .tbtns gap 8px');
  check(bt && /min-height: ?40px/.test(bt[1]), '#10 .btn min-height 40px');
  check(sm && !/min-height|line-height/.test(sm[1]), '#10 .btn.small non abbassa i 40 px di .btn');
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), slot;
  h.click('del_0');
  eq(h.txt('msg'), 'Foto rimossa dall\'elenco (si applica al Salva)', '#10 eliminazione: messaggio');
  h.click('del_9');
  eq(h.txt('msg'), 'Foto rimossa dall\'elenco (si applica al Salva)', '#10 anche per un\'estranea');
  h.chooseFile('n.jpg'); h.timers.run(); h.click('addOk');
  slot = h.G.added[0].slot;
  h.click('del_' + slot);
  contains(h.txt('msg'), 'Foto nuova scartata', '#10 tessera nuova eliminata: messaggio diverso');
  contains(h.txt('msg'), 'slot ' + slot, '#10 dice quale slot torna libero');
  var h2 = loadPage({ state: stateEmery({ cap_kb: 60 }), search: DEV_SEARCH });
  h2.chooseFile('a.jpg'); h2.timers.run(); h2.click('addOk');
  h2.chooseFile('b.jpg'); h2.timers.run(); h2.click('addOk');
  eq(h2.G.overCap, true, '#10 due foto su 60 KB: sopra il tetto');
  h2.click('del_0');
  contains(h2.txt('msg'), 'Troppi dati', '#10 sopra il tetto resta il messaggio del tetto');
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
  eq(h.txt('editName'), 'B.jpg · 800×600 px', '#12 nome e dimensioni di B');
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
  eq(h2.txt('editName'), 'B.jpg · 800×600 px', '#12 inverso: A in ritardo non sostituisce B');
  eq(a2.closed, true, '#12 inverso: A chiusa');
  eq(b2.closed, false, '#12 inverso: B ancora aperta');
  eq(h2.G.editor.src, b2, '#12 inverso: sorgente ancora B');
  eq(h2.G.editorOpen, true, '#12 inverso: editor ancora aperto');

  var h3 = loadPage({ state: stateEmery(), search: DEV_SEARCH, bitmap: 'defer', imgFail: true }), env3 = h3.env;
  h3.chooseFile('A.jpg'); h3.chooseFile('B.jpg');
  env3.deferred[0].rej();                                   /* A rotta (anche il fallback <img> fallisce) */
  notContains(h3.txt('msg'), 'Non riesco', '#12 errore di una scelta superata: nessun messaggio');
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

section('3g. #20 etichette distinte, Esci disabilitato con l\'editor aperto, uscita in due tocchi', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  eq(h.txt('addCancel'), 'Annulla ritaglio', '#20 editor: "Annulla ritaglio"');
  eq(h.txt('cancel'), 'Esci senza salvare', '#20 footer: "Esci senza salvare"');
  eq(h.el('cancel').disabled, false, '#20 all\'avvio Esci e\' attivo');
  h.chooseFile('a.jpg');
  eq(h.el('cancel').disabled, true, '#20 editor aperto: Esci disabilitato');
  eq(h.el('save').disabled, true, '#20 editor aperto: Salva disabilitato');
  eq(h.click('cancel'), false, '#20 editor aperto: il clic su Esci non parte');
  eq(h.navs.length, 0, '#20 nessuna navigazione');
  h.click('addCancel');
  eq(h.el('cancel').disabled, false, '#20 editor chiuso: Esci riattivato');
  h.click('cancel');
  eqJson(h.navs, [DEV_RT], '#20 senza modifiche: esce al primo tocco');

  var h2 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h2.chooseFile('a.jpg'); h2.timers.run(); h2.click('addOk');
  h2.click('cancel');
  eq(h2.navs.length, 0, '#20 foto aggiunta: il primo tocco non esce');
  contains(h2.txt('msg'), 'tocca di nuovo per uscire senza salvare', '#20 messaggio del primo tocco');
  eq(h2.el('msg').className, 'warn', '#20 messaggio in giallo');
  h2.click('cancel');
  eqJson(h2.navs, [DEV_RT], '#20 secondo tocco: esce');

  var h3 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h3.click('del_0');
  h3.click('cancel');
  eq(h3.navs.length, 0, '#20 eliminazione: primo tocco non esce');
  h3.select('s_font', '1');
  h3.click('cancel');
  eq(h3.navs.length, 0, '#20 dopo un\'altra modifica il tocco su Esci torna ad avvisare');
  contains(h3.txt('msg'), 'tocca di nuovo', '#20 avviso ripetuto');
  h3.click('cancel');
  eq(h3.navs.length, 1, '#20 poi esce');

  var h4 = loadPage({ state: stateEmery(), search: '', protocol: 'data:' });
  h4.checkbox('s_shake_next', true);
  h4.click('cancel');
  eq(h4.navs.length, 0, '#20 impostazione cambiata: primo tocco non esce');
  h4.checkbox('s_shake_next', false);
  h4.click('cancel');
  eqJson(h4.navs, ['pebblejs://close#'], '#20 impostazioni tornate come prima: esce subito');

  var h5 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h5.click('down_3');
  h5.click('cancel');
  eq(h5.navs.length, 0, '#20 riordino: primo tocco non esce');
  h5.click('cancel');
  eq(h5.navs.length, 1, '#20 riordino: secondo tocco esce');

  var h6 = loadPage({ state: stateEmery(), search: '', protocol: 'http:' });
  h6.click('del_5'); h6.click('cancel');
  contains(h6.txt('msg'), 'tocca di nuovo', '#20 prova: avviso');
  h6.click('cancel');
  contains(h6.txt('msg'), 'chiusura senza modifiche', '#20 prova: secondo tocco');
  check(!/\bconfirm\s*\(/.test(SRC['page.js']), '#20 nessuna finestra di conferma nativa');
});

section('3h. #23 nome accessibile dei pulsanti delle tessere', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), all, ok = true, i, k, b;
  eq(h.el('up_3').getAttribute('aria-label'), 'Sposta su: mare.jpg', '#23 ▲ con il nome della foto');
  eq(h.el('down_3').getAttribute('aria-label'), 'Sposta giù: mare.jpg', '#23 ▼');
  eq(h.el('del_3').getAttribute('aria-label'), 'Elimina: mare.jpg', '#23 ✕');
  eq(h.el('del_9').getAttribute('aria-label'), 'Elimina: slot 9', '#23 estranea senza nome: "slot 9"');
  eq(h.el('up_9').getAttribute('aria-label'), 'Sposta su: slot 9', '#23 anche i pulsanti disabilitati hanno il nome');
  h.chooseFile('nuova.jpg'); h.timers.run(); h.click('addOk');
  eq(h.el('del_1').getAttribute('aria-label'), 'Elimina: nuova.jpg', '#23 tessera nuova');
  all = h.el('tiles').children;
  for (i = 0; i < all.length; i++) {
    b = all[i].children[2].children;
    for (k = 0; k < b.length; k++) { if (!/^(Sposta su|Sposta giù|Elimina): .+/.test(b[k].getAttribute('aria-label') || '')) { ok = false; } }
  }
  check(ok && all.length === 5, '#23 ogni pulsante di ogni tessera ha un aria-label');
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
  eq(forLabels, 13, '#24 etichette-guida (label con for=…): ' + forLabels);
  eq(cbLabels, 6, '#24 label delle caselle: ' + cbLabels);
  opts = findById(root, 's_info_row_b0').parentNode.parentNode;
  rigaRow = opts.parentNode;
  eq(rigaRow.children[0].tagName, 'SPAN', '#24 "Riga info:" e\' uno span (non un nodo di testo nudo)');
  contains(rigaRow.children[0].className, 'rlab', '#24 lo span ha la classe rlab');
  eq(rigaRow.children[0].textContent.trim(), 'Riga info:', '#24 testo dello span');
  eq(opts.tagName + '.' + opts.className, 'SPAN.opts', '#24 le 4 caselle stanno in uno span.opts (vanno a capo allineate sotto la prima riga)');
  eq(opts.children.length, 4, '#24 quattro caselle nello span.opts');
  check(opts.children.every(function (c) { return c.tagName === 'LABEL' && !/rlab/.test(c.className) && c.children[0].type === 'checkbox'; }), '#24 le 4 caselle della riga info senza rlab');
  eq(findById(root, 's_info_row').parentNode, rigaRow, '#24 il campo nascosto resta nella riga');
  notContains(PAGE_CSS, 'label:first-child', '#24 CSS: niente selettore label:first-child');
  check(/\.row > \.rlab \{[^}]*min-width: ?9\.5em/.test(PAGE_CSS), '#24 CSS: min-width sulla classe rlab');
  check(/\.opts \{[^}]*flex-wrap: ?wrap/.test(PAGE_CSS), '#24 CSS: .opts e\' un flex che va a capo');
  eq(findById(root, 'add').className, 'btn', '#24 la label "Aggiungi foto" non e\' una guida');
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
  contains(h.txt('msg'), 'Errore di anteprima', '#27 resample fallito: messaggio');
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
  h.click('del_0');
  eq(body.style.paddingBottom, '104px', '#42 padding = altezza del footer + 8');
  f.offsetHeight = 140;
  h.click('cancel');
  eq(body.style.paddingBottom, '148px', '#42 ricalcolato a ogni messaggio');
  f.offsetHeight = 0;
  h.click('del_5');
  eq(body.style.paddingBottom, '148px', '#42 footer senza altezza: il padding non viene azzerato');
  css = PAGE_CSS.replace(/\s+/g, ' ');
  fp = /#footer p \{([^}]*)\}/.exec(css);
  check(fp && /max-height/.test(fp[1]) && /overflow(-y)?: ?auto/.test(fp[1]), '#42 CSS: #msg con max-height e overflow');
  check(/body \{[^}]*padding: 0 12px 96px/.test(css), '#42 CSS: il body parte con 96 px di riserva');
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
function cssDecl(block, prop) {
  var m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(block || '');
  return m ? m[1].trim() : null;
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
  eq(h.env.scrolls.length, 1, '#2 chiudendo l\'editor non si scorre');
  h.chooseFile('b.jpg');
  eq(h.env.scrolls.length, 2, '#2 alla foto successiva si scorre di nuovo');
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
  contains(h.txt('msg'), 'Foto aggiunta nello slot ' + h.G.added[0].slot, '#11 messaggio: foto aggiunta');
  contains(h.txt('msg'), 'senza anteprima', '#11 messaggio: dice che manca l\'anteprima');
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
  contains(h2.txt('msg'), 'senza anteprima', '#11 PNG troppo lunga: il messaggio lo dice');
  /* miniatura buona: il messaggio NON parla di anteprima mancante */
  var h3 = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h3.chooseFile('ok.jpg');
  h3.timers.run();
  h3.click('addOk');
  check(!!h3.G.added[0].thumb, '#11 caso normale: miniatura presente');
  notContains(h3.txt('msg'), 'senza anteprima', '#11 caso normale: nessun avviso di anteprima');
});

section('4c. #26 title con il nome intero sui nomi troncati', function () {
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH }), nd;
  nd = nameNode(h, 0);
  eq(nd.className, 'name', '#26 il title sta sull\'elemento .name (quello con text-overflow)');
  eq(nd.textContent, 'città.jpg', '#26 testo visibile: il nome');
  eq(nd.title, 'città.jpg', '#26 nome corto: title uguale al testo');
  eq(nameNode(h, 9).title, 'slot 9', '#26 estranea senza nome: title = "slot 9"');
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
  eq(d.error, 'versione dello stato non supportata', '#31 v: 2 => messaggio');
  eq(d.fmt, 1, '#31 v: 2 => nessun campo dello stato ignoto viene usato (fmt di default)');
  eq(d.cap_kb, 900, '#31 v: 2 => cap_kb di default');
  eq(d.platform, 'unknown', '#31 v: 2 => platform unknown');
  eq(d.settingsSet, false, '#31 v: 2 => settingsSet false');
  eqJson(d.order, [], '#31 v: 2 => order vuoto');
  eqJson(d.deleted, [], '#31 v: 2 => deleted vuoto');
  eqJson(d.settings, DEFAULT_SETTINGS, '#31 v: 2 => impostazioni di default');
  eq(C.decodeState(hashOf({ platform: 'emery' })).error, 'versione dello stato non supportata',
     '#31 v assente: stesso trattamento');
  eq(C.decodeState(hashOf({ v: '1', platform: 'emery' })).ok, false, '#31 v stringa "1": non supportata');
  eq(C.decodeState(hashOf({ v: 0 })).ok, false, '#31 v: 0 non supportata');
  eq(C.decodeState(hashOf({ v: 1, platform: 'emery' })).ok, true, '#31 v: 1: stato valido');
  /* la pagina: avviso, Salva disabilitato, nessun payload autorevole spedito */
  var s = stateEmery(); s.v = 2;
  var h = loadPage({ state: s, search: DEV_SEARCH });
  eq(h.G.state.ok, false, '#31 pagina: stato non ricevuto');
  eq(h.disp('status'), '', '#31 pagina: avviso visibile');
  contains(h.txt('status'), 'Stato non ricevuto', '#31 pagina: avviso "stato non ricevuto"');
  contains(h.txt('status'), 'versione dello stato non supportata', '#31 pagina: dice il motivo');
  eq(h.el('save').disabled, true, '#31 pagina: Salva disabilitato');
  eqJson(h.G.tiles, [], '#31 pagina: nessuna tessera (nessuna foto dello stato ignoto)');
  eq(h.click('save'), false, '#31 pagina: il click su Salva disabilitato non parte');
  eq(h.net.posts.length, 0, '#31 pagina: nessun POST');
  eq(h.navs.length, 0, '#31 pagina: nessuna navigazione');
  h.el('save').disabled = false;                     /* forzato: nemmeno cosi' si salva (#1) */
  h.click('save');
  contains(h.txt('msg'), 'stato non ricevuto', '#31 pagina: Salva forzato risponde comunque di no');
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
function inTile(el) {
  return [nd('body'), nd('section', null, 'photos'), nd('div', null, 'tiles'),
          nd('div', 'tile'), nd('div', 'tbtns'), el];
}
/* una voce per famiglia di pulsanti: com'e' acceso e com'e' spento (page.js:88-110, 133, 141) */
var FAM_BTN = [
  { nome: 'Salva (.btn.primary)', on: inFooter(nd('button', 'btn primary', 'save')),
    off: inFooter(nd('button', 'btn primary', 'save', { disabled: '' })) },
  { nome: 'Esci (.btn)', on: inFooter(nd('button', 'btn', 'cancel')),
    off: inFooter(nd('button', 'btn', 'cancel', { disabled: '' })) },
  { nome: 'Adatta (.btn.small)', on: inEditor(nd('button', 'btn small', 'fit')),
    off: inEditor(nd('button', 'btn small', 'fit', { disabled: '' })) },
  { nome: 'Aggiungi foto (label .btn -> .btn.off)', on: inPhotos(nd('label', 'btn', 'add')),
    off: inPhotos(nd('label', 'btn off', 'add')) },
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
function problemiPulsanti(css) {
  var rules = cssRuleList(css), out = [], i, j, f, st, c;
  for (i = 0; i < FAM_BTN.length; i++) {
    f = FAM_BTN[i];
    f.stOn = stileVincente(rules, f.on);
    f.stOff = stileVincente(rules, f.off);
    [['acceso', f.stOn], ['spento', f.stOff]].forEach(function (s) {
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
    if (f.stOff.bg !== null && f.stOff.bg === f.stOn.bg) {
      out.push(f.nome + ' spento: stesso fondo dell\'acceso (' + f.stOff.bg + ' da "' +
               f.stOff.selBg + '" ' + f.stOff.spec + '): sembra attivo');
    }
    if (!(f.stOff.op < 1)) { out.push(f.nome + ' spento: opacity 1 (nessun aspetto spento)'); }
  }
  return out;
}

section('4e. #41 pulsanti disabilitati: contrasto >= 3:1 in cima alla cascata', function () {
  var rules = cssRuleList(PAGE_CSS), dis = null, i, sp, mut, prob, mprob, frecce;
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
    [['acceso', f.stOn], ['spento', f.stOff]].forEach(function (s) {
      var c0 = contrastoSu(s[1], FONDI[0][0]), c1 = contrastoSu(s[1], FONDI[1][0]);
      check(c0 >= 3 && c1 >= 3, '#41 ' + f.nome + ' ' + s[0] + ': ' + s[1].fg + ' su ' + s[1].bg +
            ' (regola "' + s[1].selBg + '", opacity ' + s[1].op + ') = ' + c0.toFixed(2) +
            ':1 su body e ' + c1.toFixed(2) + ':1 su bianco');
    });
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
  problemiPulsanti(PAGE_CSS);                       /* ripristina stOn/stOff sul foglio vero */

  /* la vecchia regola (solo opacity 0.45 sul .btn bianco) NON passerebbe: prova di sensibilita' */
  var vecchio = contrast(overBackdrop(hex2rgb('#222'), hex2rgb('#ffffff'), 0.45),
                         overBackdrop(hex2rgb('#ffffff'), hex2rgb('#ffffff'), 0.45));
  check(vecchio < 3, '#41 controprova: opacity 0,45 sul .btn normale darebbe ' + vecchio.toFixed(2) + ':1');
  /* i pulsanti che si disabilitano davvero portano le classi/attributi delle famiglie di sopra */
  var h = loadPage({ state: stateEmery(), search: DEV_SEARCH });
  h.chooseFile('a.jpg');
  eq(h.el('save').disabled, true, '#41 con l\'editor aperto Salva e\' disabilitato');
  eq(h.el('save').className, 'btn primary', '#41 Salva disabilitato resta .btn.primary (serve .btn[disabled])');
  eq(h.el('cancel').disabled, true, '#41 anche Esci e\' disabilitato');
  h.click('addCancel');
  var s0 = h.G.tiles[0].slot, up = h.el('up_' + s0);
  eq(up.disabled, true, '#41 la freccia su della prima tessera e\' disabilitata');
  eq(up.className, '', '#41 la freccia non ha classi: la regola la prende come .tbtns button[disabled]');
  eq(up.tagName, 'BUTTON', '#41 la freccia e\' un <button> (l\'attributo disabled vale davvero)');
  var full = loadPage({ state: fullState(), search: DEV_SEARCH });
  eq(full.el('add').className, 'btn off', '#41 album pieno: "Aggiungi foto" prende la classe off');
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
  SCRIPTS.forEach(function (f) { src[f] = fs.readFileSync(path.join(CFG, f), 'utf8'); });
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
             ['previews.js', /root\.GalPreviews\s*=/], ['page.js', /root\.GalPage\s*=/]];
function checkInlinedModule(v) {
  var fatal = [], i, j, n, ok, lines, bad = [], nb;
  contains(v.raw, 'GENERATO da tools/build_config_page.py', 'inlinato: intestazione «generato»');
  contains(v.raw, 'module.exports = "', 'inlinato: il modulo esporta la stringa dell\'HTML');
  nb = v.raw.split('\n').length;
  check(nb <= 3, 'inlinato: modulo su una riga di dati (' + nb + ' righe con l\'intestazione)');
  eq(v.scripts.length, 4, 'inlinato: 4 sezioni <script>');
  eq(v.styles.length, 1, 'inlinato: un solo <style>');
  check(v.parts.length > 0 && v.parts[0].tag === 'style', 'inlinato: il <style> precede gli script');
  for (i = 0; i < ROLES.length; i++) {
    ok = !!(v.scripts[i] && ROLES[i][1].test(v.scripts[i].body));
    check(ok, 'inlinato: script ' + (i + 1) + ' = ' + ROLES[i][0] +
              ' (ordine pipeline, page_core, previews, page)');
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
  lines = v.html.split('\n');
  for (i = 0; i < lines.length; i++) { if (/^\s*\/\//.test(lines[i])) { bad.push(i + 1); } }
  eq(bad.length, 0, 'inlinato: nessuna riga di commento // (strip dell\'inliner; righe ' +
                    bad.slice(0, 5).join(',') + ')');
  check(v.html.indexOf('\r') < 0, 'inlinato: fine riga sempre \\n');
  nb = Buffer.byteLength(v.html, 'utf8');
  check(nb <= 65536, 'inlinato: HTML di ' + nb + ' B entro il tetto di 64 KB');
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
  console.log('test_page: src/pkjs/config_page.js assente, giro sull\'inlinato saltato ' +
              '(python3 ../../../tools/build_config_page.py per generarlo)');
}

/* ============================================================ riepilogo ================= */

console.log('test_page: sorgenti ' + tally(R_SRC) + ', inlinato ' + (R_INL ? tally(R_INL) : 'saltato'));
process.exit(g_fail > 0 ? 1 : 0);

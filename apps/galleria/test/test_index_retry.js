#!/usr/bin/env node
/* test_index_retry.js — test end-to-end della politica di ripresa automatica di index.js
 * (revisione post code-review 29/08, F9 + F5) con album.js, sync.js, Pebble finto e orologio
 * finto veri: non stubba nulla del PKJS. Ogni caso ricarica index.js (require.cache) su un Pebble
 * finto nuovo, con l'album già in localStorage (1 foto nello slot 0, ordine [0]); i guasti si
 * iniettano avvolgendo watch.handle (STATUS con un codice scelto al posto della risposta vera).
 * I timer ≥ 30 s (RETRY_MS di index.js) sono compressi (/1000, /100 nel caso f) e tracciati: fra
 * un caso e l'altro vengono tutti cancellati, così un retry pendente di un caso non inquina il
 * successivo.
 *
 * Casi (index.js: retryClass / scheduleRetry / cancelRetry / onReadyFailed):
 *   a  STORAGE_ERR persistente al PHOTO_END → classe 'photo': 1 sync + 3 retry (30/60/120 s),
 *      poi "rinuncio fino al prossimo HELLO", nessun altro JS_READY; il prossimo HELLO spontaneo
 *      (ready) riparte con il contatore azzerato "(1)"
 *   b  BAD_FORMAT al PHOTO_BEGIN → 'permanent': 1 sync, "errore permanente", nessun retry
 *   c  orologio scollegato (NACK su tutto): onReadyFailed → retry senza tetto (6 tentativi, backoff
 *      saturo a 600 s), poi la riconnessione fa riuscire il retry pendente
 *   c2 'send failed' a metà foto → summary.error → classe 'link' via onDone ("sync con errori
 *      (send failed)"), poi JS_READY non consegnato, poi ripresa alla riconnessione
 *   d  guasto che sparisce al 2° tentativo → sync OK, slot VALID, contatore azzerato: il guasto
 *      successivo ricomincia da "30 s (1)"
 *   e  ALBUM_ORDER → STORAGE_ERR con 0 foto → 'photo' (retry con tetto), non successo
 *   f  esito 'none' (sync riuscita da un HELLO spontaneo) cancella il retry pendente
 *   g  HELLO con MAX_CHUNK 0 → error NOT_SUPPORTED → 'permanent'
 *   h  'link' poi 'photo': photoRetries separato
 *   i  SETTINGS/ALBUM_DELETE → STORAGE_ERR: etichette settings:/delete:
 *   j  dev (v1.9, F09/F45): hooks.open_ms forza HELLO.OPEN_MS nel piano — log della sostituzione col
 *      valore VERO dell'orologio, snapshot dell'album (= config page) col valore forzato — e uno
 *      stato dev successivo SENZA l'hook (dev server riavviato senza --open-ms) lo azzera
 *   k  dev: hooks.open_ms 0 (valido: avviso spento), non numerico e negativo (ignorati)
 *   l  fuori dall'emulatore (platform android) l'hook non ha alcun effetto: il token dev è rifiutato
 *   m  S10 (D33/D35): lingua automatica nello stato della config page (orologio, ripiego
 *      navigator, ripiego 'en') e dizionari `i18n` (modulo assente/malformato → null)
 *   n  S10: in dev l'hook `lang` forza la lingua automatica, uno stato senza l'hook la ridà
 *      all'orologio e un valore ignoto viene rifiutato
 *
 * I casi j-l girano con platform 'pypkjs' e devserver.js stubbato via require.cache (nessun server:
 * lo stato dev arriva da devStub.state / devStub.saveState), come in test_devstorage.js.
 *
 * Esecuzione: cd test && NODE_PATH=shim node test_index_retry.js (oppure make -C test jstest). */
var FakeWatch = require('fakewatch');
var FakePebble = require('fake_pebble');
var keys = require('message_keys');
var b64 = require('../src/pkjs/b64');
var crc = require('../src/pkjs/crc');
var fixture = require('./fixture_photo');
var Album = require('../src/pkjs/album');
var Module = require('module');
var INDEX = require.resolve('../src/pkjs/index');
var DEVSERVER = require.resolve('../src/pkjs/devserver');

/* devserver.js stubbato PRIMA di caricare index.js: `require('./devserver')` risolve allo stesso
 * path, quindi in modalità dev (casi j-l) lo stato arriva da devStub.state (/state.json) e
 * devStub.saveState (/save.json) senza nessun server. Nei casi android index.js non lo usa. */
var devStub = {
  base: 'http://localhost:8765',
  state: null,                           /* risposta di /state.json, altrimenti 'no server' */
  saveState: null,                       /* risposta di /save.json, altrimenti 'no server' */
  fetchState: function (cb) { if (devStub.state) { cb(null, devStub.state); } else { cb('no server'); } },
  fetchSave: function (cb) { if (devStub.saveState) { cb(null, devStub.saveState); } else { cb('no server'); } },
  fetchPhotoB64: function (slot, fmt, cb) { cb('no server'); }
};
(function stubDevserver() {
  var m = new Module(DEVSERVER, null);
  m.filename = DEVSERVER; m.loaded = true;
  m.exports = devStub;
  require.cache[DEVSERVER] = m;
})();

/* `navigator` del runtime: node 22 ne ha uno proprio (language 'en-US') e la proprieta' NON si
 * sovrascrive con un assegnamento. Nei test di S10 serve poterlo togliere (PKJS su iOS: non esiste)
 * o sostituire (WebView Android). */
var NAV_DESC = Object.getOwnPropertyDescriptor(global, 'navigator');
function setNavigator(lang) {
  if (lang === null) { delete global.navigator; return; }
  Object.defineProperty(global, 'navigator', { value: { language: lang }, configurable: true, writable: true });
}
function restoreNavigator() {
  delete global.navigator;
  if (NAV_DESC) { Object.defineProperty(global, 'navigator', NAV_DESC); }
}

/* S10/D35: `require('./i18n')` di index.js dirottato sugli stub di shim/ — i test non dipendono da
 * src/pkjs/i18n.js, che genera tools/build_i18n.py da i18n/messages.json. i18nTarget = null simula
 * il modulo ASSENTE (require che lancia MODULE_NOT_FOUND). */
var I18N_OK = require.resolve('i18n_stub');
var I18N_BAD = require.resolve('i18n_stub_bad');
var i18nTarget = I18N_OK;
(function hijackI18n() {
  var orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent) {
    var e;
    if (request === './i18n' && parent && /src[\/\\]pkjs[\/\\]index\.js$/.test(parent.filename || '')) {
      if (i18nTarget === null) { e = new Error("Cannot find module './i18n'"); e.code = 'MODULE_NOT_FOUND'; throw e; }
      return i18nTarget;
    }
    return orig.apply(this, arguments);
  };
})();

var pass = 0, fail = 0;
var origLog = console.log;
function check(c, what) { if (c) { pass++; } else { fail++; origLog('FAIL ' + what); } }

/* ---- timer: tracciati tutti; quelli ≥ 30 s compressi di `divisor` ---- */
var realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
var live = {}, tid = 0, divisor = 1000;
var longTimers = [];                 /* {id, ms} dei timer ≥ 30 s creati, nell'ordine */
global.setTimeout = function (fn, ms) {
  var id = ++tid, real = ms;
  if (ms >= 30000) { longTimers.push({ id: id, ms: ms }); real = ms / divisor; }
  live[id] = { ms: ms, h: realSetTimeout(function () { delete live[id]; fn(); }, real) };
  return id;
};
global.clearTimeout = function (id) { if (live[id]) { realClearTimeout(live[id].h); delete live[id]; } };
function liveLong() { return Object.keys(live).filter(function (k) { return live[k].ms >= 30000; }).length; }
function sweepTimers() { Object.keys(live).forEach(function (k) { realClearTimeout(live[k].h); delete live[k]; }); }
function longSince(en) { return longTimers.slice(en.longStart).map(function (t) { return t.ms; }).join(','); }

/* ---- log del PKJS: catturati (FAIL e riepilogo via origLog) ---- */
var logs = [];
console.log = function (m) { logs.push(String(m)); };
function findLog(en, needle, from) {
  var i;
  for (i = (from === undefined) ? en.logStart : from; i < logs.length; i++) {
    if (typeof needle === 'string' ? logs[i] === needle : needle.test(logs[i])) { return i; }
  }
  return -1;
}
function hasLog(en, needle, from) { return findLog(en, needle, from) >= 0; }
function countLog(en, re, from) {
  var n = 0, i;
  for (i = (from === undefined) ? en.logStart : from; i < logs.length; i++) { if (re.test(logs[i])) { n++; } }
  return n;
}
function count(en, msg) { return en.watch.received.filter(function (x) { return x === msg; }).length; }
var RETRY = /: nuovo tentativo fra /;      /* il log di scheduleRetry (non "nessun nuovo tentativo automatico") */
var FINE = /^\[sync\] fine:/;

function waitFor(pred, cb, timeoutMs) {
  var t0 = Date.now();
  (function poll() {
    if (pred()) { return cb(null); }
    if (Date.now() - t0 > (timeoutMs || 8000)) { return cb('timeout'); }
    realSetTimeout(poll, 10);
  })();
}

/* ---- album di partenza: 1 foto (slot 0), ordine [0], impostazioni mai impostate ---- */
var raw6 = b64.decode(fixture.raw6.b64), crcA = crc.crc32(raw6);
function memStorage() {
  var mem = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}
function seededStorage() {
  var st = memStorage(), r;
  r = new Album(st, function () {}).applyPayload({ v: 1, photos: [
    { slot: 0, photo_id: 0x1111, fmt: 1, len: 34200, crc: crcA, data: fixture.raw6.b64, name: 'a' }
  ], order: [0] }, {});
  if (!r.ok || r.added.join() !== '0') { throw new Error('album di partenza non valido: ' + r.errors.join('; ')); }
  return st;
}

var sync = require('../src/pkjs/sync');          /* UN SOLO require: index.js riusa lo stesso modulo */
sync.configure({ statusTimeoutMs: 200, watchdogMs: 2000, backoffMs: [10, 10, 10], helloTimeoutMs: 200 });

/* Ambiente nuovo: timer del caso precedente cancellati, motore azzerato, Pebble/orologio finti nuovi,
 * album in localStorage, index.js ricaricato (stato di modulo: retryCount/retryTimer/album azzerati),
 * opts.setup(en) prima del 'ready'. en.fault(msg, dict, replies) → risposte sostitutive | undefined. */
function env(opts) {
  opts = opts || {};
  var en = { fault: null, faults: 0 }, origHandle;
  sweepTimers();
  sync._reset();
  divisor = opts.divisor || 1000;
  en.watch = new FakeWatch({ format: 1, maxChunk: 4096, albumEnabled: opts.albumEnabled !== false,
                             openMs: opts.openMs || 0, log: function () {} });
  en.pebble = new FakePebble(en.watch, { platform: opts.platform || 'android' });
  if (opts.watchInfo !== undefined) { en.pebble.watchInfo = opts.watchInfo; }   /* S10: lingua dell'orologio */
  devStub.state = opts.devState || null;         /* /state.json del caso (solo con platform 'pypkjs') */
  devStub.saveState = null;
  global.Pebble = en.pebble;
  global.localStorage = seededStorage();
  origHandle = en.watch.handle;
  en.watch.handle = function (d) {
    var msg = d[keys.MSG] | 0, out = origHandle.call(en.watch, d), alt;
    alt = en.fault ? en.fault(msg, d, out) : undefined;
    return (alt === undefined) ? out : alt;
  };
  en.logStart = logs.length;
  en.longStart = longTimers.length;
  if (opts.setup) { opts.setup(en); }
  /* node tiene una cache request->file per (parent, './i18n'): finche' il modulo risolto resta in
   * require.cache, Module._load NON richiama _resolveFilename e il dirottamento non cambierebbe piu'
   * bersaglio. Cancellare gli stub invalida anche quella cache. */
  delete require.cache[I18N_OK];
  delete require.cache[I18N_BAD];
  delete require.cache[INDEX];
  require(INDEX);
  en.pebble.fire('ready');
  return en;
}

/* STORAGE_ERR al PHOTO_END (persistente, o per i primi `times` PHOTO_END): l'orologio non registra la foto. */
function storageErrAtEnd(en, times) {
  return function (msg, d) {
    var slot;
    if (msg !== 7 || (times !== undefined && en.faults >= times)) { return undefined; }
    slot = d[keys.SLOT];
    en.faults++;
    en.watch.pending = null;
    en.watch.slots[slot] = { state: 0, crc: 0, photoId: 0, generation: 0 };
    en.watch.buffers[slot] = null;
    en.watch.order = en.watch.order.filter(function (k) { return k !== slot; });
    return [en.watch._status(7, slot, 0)];
  };
}

/* openMs dello snapshot dell'ultimo HELLO (galleria.v1.watch): è il valore che la config page
 * legge dall'hash, quindi quello che decide l'avviso di avvio lento. */
function snapOpenMs() {
  var raw = null, w = null;
  try { raw = global.localStorage.getItem(Album.WKEY); } catch (e) { raw = null; }
  try { w = raw ? JSON.parse(raw) : null; } catch (e2) { w = null; }
  return w ? w.openMs : undefined;
}

/* Stato che la config page riceve nell'HASH dell'URL (b64url dei byte UTF-8 del JSON): è quello che
 * la pagina legge davvero, quindi ciò che conta per lang_auto e i dizionari (S10). */
function pageState(en) {
  var url, hash;
  en.pebble.fire('showConfiguration');
  url = en.pebble.opened[en.pebble.opened.length - 1] || '';
  hash = url.slice(url.indexOf('#') + 1);
  try { return JSON.parse(Buffer.from(b64.decode(hash)).toString('utf8')); } catch (e) { return null; }
}

/* Save della pagina di prova in dev: /save.json risponde `state`, index.js lo applica e risincronizza.
 * cb(l) riceve l'indice dei log da cui guardare (prima del Save). */
function devSave(en, state, cb) {
  var l = logs.length;
  devStub.saveState = state;
  en.pebble.fire('webviewclosed', { response: JSON.stringify({ v: 1, dev: true, seq: state.seq }) });
  waitFor(function () { return findLog(en, FINE, l) >= 0; }, function (err) {
    check(!err, 'devSave seq ' + state.seq + ': sync conclusa');
    cb(l);
  });
}

var cases = [];

cases.push(['a STORAGE_ERR persistente al PHOTO_END: 1 sync + 3 retry, poi rinuncia', function (next) {
  var en = env();
  en.fault = storageErrAtEnd(en);
  waitFor(function () { return hasLog(en, /rinuncio fino al prossimo HELLO/); }, function (err) {
    var n, l;
    check(!err, 'a: log di rinuncia');
    check(count(en, 3) === 4, 'a: 4 SYNC_REQUEST (1 sync + 3 retry), got ' + count(en, 3));
    check(count(en, 1) === 4, 'a: 4 JS_READY, got ' + count(en, 1));
    check(en.faults === 4, 'a: 4 PHOTO_END falliti, got ' + en.faults);
    check(hasLog(en, '[sync] fine: {"photosOk":0,"photosFailed":1,"settings":null,"order":"OK","deletes":[],"photoCodes":["0:STORAGE_ERR"]}'), 'a: summary con photoCodes');
    check(hasLog(en, '[sync] sync con errori (0:STORAGE_ERR): nuovo tentativo fra 30 s (1)'), 'a: retry 1 (30 s)');
    check(hasLog(en, '[sync] sync con errori (0:STORAGE_ERR): nuovo tentativo fra 60 s (2)'), 'a: retry 2 (60 s)');
    check(hasLog(en, '[sync] sync con errori (0:STORAGE_ERR): nuovo tentativo fra 120 s (3)'), 'a: retry 3 (120 s)');
    check(hasLog(en, '[sync] 1 esiti falliti dopo 3 tentativi (0:STORAGE_ERR): rinuncio fino al prossimo HELLO'), 'a: log esatto di rinuncia');
    check(countLog(en, RETRY) === 3, 'a: esattamente 3 retry, got ' + countLog(en, RETRY));
    check(longSince(en) === '30000,60000,120000', 'a: timer lunghi 30/60/120 s, got ' + longSince(en));
    check(liveLong() === 0, 'a: nessun timer lungo vivo dopo la rinuncia');
    check(en.watch.slots[0].state === 0, 'a: slot 0 mai registrato');
    n = count(en, 1); l = logs.length;
    realSetTimeout(function () {
      check(count(en, 1) === n, 'a: nessun JS_READY dopo la rinuncia (700 ms)');
      check(!sync.isRunning(), 'a: motore fermo');
      /* HELLO spontaneo (riconnessione → ready): si riprova, e il contatore riparte da (1) */
      en.pebble.fire('ready');
      waitFor(function () { return hasLog(en, RETRY, l); }, function (err2) {
        check(!err2, 'a: dopo il ready si riprova');
        check(hasLog(en, '[sync] sync con errori (0:STORAGE_ERR): nuovo tentativo fra 30 s (1)', l), 'a: contatore azzerato dalla rinuncia → (1)');
        check(count(en, 1) === n + 1, 'a: un JS_READY dal ready');
        next();
      });
    }, 700);
  });
}]);

cases.push(['b BAD_FORMAT al PHOTO_BEGIN: errore permanente, nessun retry', function (next) {
  var en = env();
  en.fault = function (msg, d) {
    if (msg !== 5) { return undefined; }
    en.faults++;
    en.watch.pending = null;
    return [en.watch._status(3, d[keys.SLOT], 0)];
  };
  waitFor(function () { return hasLog(en, /errore permanente/); }, function (err) {
    var n = count(en, 1);
    check(!err, 'b: log di errore permanente');
    check(hasLog(en, '[sync] errore permanente (0:BAD_FORMAT): nessun nuovo tentativo automatico'), 'b: log esatto');
    check(hasLog(en, '[sync] fine: {"photosOk":0,"photosFailed":1,"settings":null,"order":"OK","deletes":[],"photoCodes":["0:BAD_FORMAT"]}'), 'b: summary con photoCodes');
    check(count(en, 3) === 1, 'b: 1 SYNC_REQUEST');
    check(count(en, 6) === 0, 'b: nessun PHOTO_DATA');
    check(en.faults === 1, 'b: un solo PHOTO_BEGIN');
    check(!hasLog(en, RETRY), 'b: nessun retry');
    check(longSince(en) === '', 'b: nessun timer lungo creato');
    realSetTimeout(function () {
      check(count(en, 1) === n && n === 1, 'b: un solo JS_READY anche dopo 500 ms, got ' + count(en, 1));
      check(liveLong() === 0, 'b: nessun timer lungo vivo');
      next();
    }, 500);
  });
}]);

cases.push(['c orologio scollegato (NACK): retry senza tetto, poi ripresa alla riconnessione', function (next) {
  var en = env({ setup: function (e) { e.pebble.nackNext = 1000; } });
  waitFor(function () { return hasLog(en, /nuovo tentativo fra 600 s \(6\)/); }, function (err) {
    var l = logs.length;
    check(!err, 'c: 6 retry consecutivi (oltre RETRY_PHOTO_MAX)');
    check(hasLog(en, '[sync] JS_READY non consegnato'), 'c: log di readyFailed');
    check(hasLog(en, '[sync] JS_READY non consegnato: nuovo tentativo fra 30 s (1)'), 'c: retry 1');
    check(hasLog(en, '[sync] JS_READY non consegnato: nuovo tentativo fra 300 s (4)'), 'c: retry 4 (300 s)');
    check(hasLog(en, '[sync] JS_READY non consegnato: nuovo tentativo fra 600 s (5)'), 'c: retry 5 (600 s)');
    check(longSince(en) === '30000,60000,120000,300000,600000,600000', 'c: backoff 30/60/120/300/600/600, got ' + longSince(en));
    check(en.watch.received.length === 0, 'c: l\'orologio non ha ricevuto nulla');
    check(en.pebble.outbox.length === 24, 'c: 6 tentativi × 4 invii (1 + 3 backoff), got ' + en.pebble.outbox.length);
    check(!hasLog(en, /rinuncio|errore permanente/), 'c: mai rinuncia né errore permanente (classe link)');
    check(liveLong() === 1, 'c: il 6° retry è pendente');
    /* riconnessione: il retry pendente (600 s → 600 ms) riesce */
    en.pebble.nackNext = 0;
    waitFor(function () { return hasLog(en, FINE, l); }, function (err2) {
      check(!err2, 'c: sync conclusa dopo la riconnessione');
      check(en.watch.slots[0].state === 1 && en.watch.slots[0].crc === crcA, 'c: foto arrivata al retry');
      check(countLog(en, RETRY) === 6, 'c: nessun retry dopo il successo');
      check(liveLong() === 0, 'c: nessun timer lungo vivo (cancelRetry)');
      next();
    });
  });
}]);

cases.push(['c2 send failed a metà foto: classe link via onDone, poi ripresa', function (next) {
  var en = env(), fired = false;
  en.fault = function (msg) {
    /* dal primo PHOTO_DATA in poi il telefono è "scollegato" (una volta sola) */
    if (msg === 5 && !fired) { fired = true; en.pebble.nackNext = 1000; }
    return undefined;
  };
  waitFor(function () { return hasLog(en, /nuovo tentativo fra 60 s \(2\)/); }, function (err) {
    var l = logs.length;
    check(!err, 'c2: due retry');
    check(hasLog(en, '[sync] sync abbandonata: send failed'), 'c2: sync abbandonata');
    check(hasLog(en, '[sync] fine: {"photosOk":0,"photosFailed":1,"settings":null,"order":"OK","deletes":[],"photoCodes":[],"error":"send failed"}'), 'c2: summary con error (photoCodes vuoto: abortSync non aggiunge voci)');
    check(hasLog(en, '[sync] sync con errori (send failed): nuovo tentativo fra 30 s (1)'), 'c2: classe link → retry 1');
    check(hasLog(en, '[sync] JS_READY non consegnato: nuovo tentativo fra 60 s (2)'), 'c2: JS_READY non consegnato → retry 2 (contatore continua)');
    check(count(en, 6) === 0, 'c2: nessun PHOTO_DATA arrivato');
    en.pebble.nackNext = 0;
    waitFor(function () { return hasLog(en, FINE, l); }, function (err2) {
      check(!err2, 'c2: sync conclusa dopo la riconnessione');
      check(en.watch.slots[0].state === 1 && en.watch.slots[0].crc === crcA, 'c2: foto arrivata');
      check(countLog(en, RETRY) === 2, 'c2: nessun altro retry');
      check(liveLong() === 0, 'c2: nessun timer lungo vivo');
      next();
    });
  });
}]);

cases.push(['d guasto che sparisce al 2° tentativo: sync OK, contatore azzerato', function (next) {
  var en = env();
  en.fault = storageErrAtEnd(en, 1);                 /* solo il primo PHOTO_END fallisce */
  waitFor(function () { return countLog(en, FINE) >= 2; }, function (err) {
    var l = logs.length, n = count(en, 1);
    check(!err, 'd: seconda sync conclusa');
    check(hasLog(en, '[sync] sync con errori (0:STORAGE_ERR): nuovo tentativo fra 30 s (1)'), 'd: retry 1');
    check(en.watch.slots[0].state === 1 && en.watch.slots[0].crc === crcA, 'd: slot 0 VALID al 2° tentativo');
    check(hasLog(en, '[sync] fine: {"photosOk":1,"photosFailed":0,"settings":null,"order":"OK","deletes":[],"photoCodes":[]}'), 'd: summary della sync riuscita');
    check(countLog(en, RETRY) === 1, 'd: un solo retry');
    check(!hasLog(en, /rinuncio/), 'd: nessuna rinuncia');
    check(liveLong() === 0, 'd: nessun timer lungo vivo (cancelRetry)');
    /* nuovo guasto persistente dopo un wipe: il contatore riparte da (1), non da (2) */
    en.fault = storageErrAtEnd(en);
    en.watch.wipe();
    en.pebble.fire('ready');
    waitFor(function () { return hasLog(en, RETRY, l); }, function (err2) {
      check(!err2, 'd: nuovo guasto → retry');
      check(hasLog(en, '[sync] sync con errori (0:STORAGE_ERR): nuovo tentativo fra 30 s (1)', l), 'd: il guasto successivo ricomincia da 30 s (1)');
      check(count(en, 1) === n + 1, 'd: un JS_READY dal ready');
      next();
    });
  });
}]);

cases.push(['e ALBUM_ORDER → STORAGE_ERR con 0 foto: classe photo (con tetto), non successo', function (next) {
  var en = env({ setup: function (e) { e.watch._commit(0, 1, 34200, crcA, 0x1111); } });   /* foto già sull'orologio */
  en.fault = function (msg) {
    if (msg !== 11) { return undefined; }
    en.faults++;
    return [en.watch._status(7)];
  };
  waitFor(function () { return hasLog(en, /rinuncio fino al prossimo HELLO/); }, function (err) {
    check(!err, 'e: rinuncia dopo 3 retry');
    check(hasLog(en, '[sync] fine: {"photosOk":0,"photosFailed":0,"settings":null,"order":"STORAGE_ERR","deletes":[],"photoCodes":[]}'), 'e: summary con order STORAGE_ERR');
    check(hasLog(en, '[sync] sync con errori (order:STORAGE_ERR): nuovo tentativo fra 30 s (1)'), 'e: retry 1 con etichetta order:');
    check(hasLog(en, '[sync] 1 esiti falliti dopo 3 tentativi (order:STORAGE_ERR): rinuncio fino al prossimo HELLO'), 'e: log di rinuncia');
    check(count(en, 11) === 4 && en.faults === 4, 'e: 4 ALBUM_ORDER, got ' + count(en, 11));
    check(count(en, 3) === 0 && count(en, 5) === 0, 'e: nessuna SYNC_REQUEST/PHOTO_BEGIN (foto già sull\'orologio)');
    check(longSince(en) === '30000,60000,120000', 'e: timer lunghi 30/60/120 s, got ' + longSince(en));
    check(liveLong() === 0, 'e: nessun timer lungo vivo');
    check(en.watch.order.join(',') === '0', 'e: ordine dell\'orologio invariato');
    next();
  });
}]);

cases.push(['f esito none da un HELLO spontaneo: il retry pendente viene cancellato', function (next) {
  var en = env({ divisor: 100 });                    /* 30 s → 300 ms: la sync dal ready finisce prima */
  var pendingId;
  en.fault = storageErrAtEnd(en, 1);
  waitFor(function () { return hasLog(en, RETRY); }, function (err) {
    var l = logs.length;
    check(!err, 'f: primo guasto → retry pendente');
    check(liveLong() === 1, 'f: un timer lungo vivo');
    pendingId = longTimers.length ? longTimers[longTimers.length - 1].id : -1;
    en.pebble.fire('ready');                         /* riconnessione: sync riuscita prima che il retry scatti */
    waitFor(function () { return hasLog(en, FINE, l); }, function (err2) {
      var n = count(en, 1);
      check(!err2, 'f: sync dal ready conclusa');
      check(en.watch.slots[0].state === 1, 'f: slot 0 VALID');
      check(!live[pendingId], 'f: il timer del retry è stato cancellato (cancelRetry)');
      check(liveLong() === 0, 'f: nessun timer lungo vivo');
      check(n === 2, 'f: 2 JS_READY (sync fallita + ready), got ' + n);
      realSetTimeout(function () {
        check(count(en, 1) === 2, 'f: nessun JS_READY dal retry cancellato (500 ms > 300 ms)');
        check(countLog(en, RETRY) === 1, 'f: un solo retry programmato');
        next();
      }, 500);
    });
  });
}]);

cases.push(['g MAX_CHUNK 0: error NOT_SUPPORTED → permanente', function (next) {
  var en = env({ albumEnabled: false });
  waitFor(function () { return hasLog(en, /errore permanente/); }, function (err) {
    check(!err, 'g: log di errore permanente');
    check(hasLog(en, '[sync] errore permanente (NOT_SUPPORTED): nessun nuovo tentativo automatico'), 'g: log esatto (summary.error)');
    check(hasLog(en, '[sync] fine: {"photosOk":0,"photosFailed":1,"settings":null,"order":"OK","deletes":[],"photoCodes":["0:NOT_SUPPORTED"],"error":"NOT_SUPPORTED"}'), 'g: summary');
    check(count(en, 3) === 0, 'g: nessuna SYNC_REQUEST');
    check(!hasLog(en, RETRY) && longSince(en) === '', 'g: nessun retry');
    next();
  });
}]);

cases.push(['h link poi foto: photoRetries separato → la foto ha comunque i suoi 3 tentativi', function (next) {
  /* Revisione 29/08: prima retryCount era condiviso e dopo 2 retry di collegamento una foto fallita
   * trovava gia' quasi esaurito il tetto. Ora la classe 'link' azzera photoRetries. */
  var en = env({ setup: function (e) { e.pebble.nackNext = 1000; } });
  waitFor(function () { return hasLog(en, /JS_READY non consegnato: nuovo tentativo fra 60 s \(2\)/); }, function (err) {
    check(!err, 'h: due retry di collegamento');
    en.pebble.nackNext = 0;                             /* riconnessione: il retry pendente riesce... */
    en.fault = storageErrAtEnd(en);                     /* ...ma l'orologio non registra la foto */
    waitFor(function () { return hasLog(en, /rinuncio fino al prossimo HELLO/); }, function (err2) {
      var n = countLog(en, /sync con errori \(0:STORAGE_ERR\)/);
      check(!err2, 'h: rinuncia');
      check(n === 3, 'h: 3 retry di classe photo nonostante i 2 di link, got ' + n);
      check(hasLog(en, '[sync] sync con errori (0:STORAGE_ERR): nuovo tentativo fra 120 s (3)'), 'h: il gradino del backoff prosegue da quello del link (120 s = 3°)');
      check(hasLog(en, '[sync] sync con errori (0:STORAGE_ERR): nuovo tentativo fra 600 s (5)'), 'h: 3° retry photo al gradino 5 (600 s)');
      check(hasLog(en, '[sync] 1 esiti falliti dopo 3 tentativi (0:STORAGE_ERR): rinuncio fino al prossimo HELLO'), 'h: rinuncia dopo 3 tentativi di classe photo');
      check(liveLong() === 0, 'h: nessun timer lungo vivo');
      next();
    });
  });
}]);

cases.push(['i SETTINGS e ALBUM_DELETE → STORAGE_ERR: etichette settings:/delete:, classe photo con tetto', function (next) {
  var s0;
  var en = env({ setup: function (e) {
    e.watch._commit(0, 1, 34200, crcA, 0x1111);        /* foto gia' sull'orologio... */
    s0 = e.watch.settings.slice();
    var a = new Album(global.localStorage, function () {});
    var r = a.applyPayload({ v: 1, deleted: [0], settings: { font: 1 } }, {});   /* ...eliminata sul telefono + impostazioni */
    if (!r.ok) { throw new Error('setup i: ' + r.errors.join('; ')); }
  } });
  en.fault = function (msg) {
    /* persist fallita = nulla applicato: l'orologio finto ha gia' applicato, quindi si annulla */
    if (msg === 10) { en.faults++; en.watch.settings = s0.slice(); return [en.watch._status(7)]; }                    /* SETTINGS → STORAGE_ERR */
    if (msg === 12) { en.faults++; en.watch._commit(0, 1, 34200, crcA, 0x1111); return [en.watch._status(7, 0)]; }   /* ALBUM_DELETE slot 0 → STORAGE_ERR */
    return undefined;
  };
  waitFor(function () { return hasLog(en, /rinuncio fino al prossimo HELLO/); }, function (err) {
    check(!err, 'i: rinuncia dopo 3 retry');
    check(hasLog(en, '[sync] fine: {"photosOk":0,"photosFailed":0,"settings":"STORAGE_ERR","order":"OK","deletes":["0:STORAGE_ERR"],"photoCodes":[]}'), 'i: summary con settings/deletes STORAGE_ERR');
    check(hasLog(en, '[sync] sync con errori (settings:STORAGE_ERR,delete:0:STORAGE_ERR): nuovo tentativo fra 30 s (1)'), 'i: retry 1 con le etichette settings:/delete:');
    check(hasLog(en, '[sync] 2 esiti falliti dopo 3 tentativi (settings:STORAGE_ERR,delete:0:STORAGE_ERR): rinuncio fino al prossimo HELLO'), 'i: log di rinuncia');
    check(count(en, 10) === 4 && count(en, 12) === 4, 'i: 4 SETTINGS e 4 ALBUM_DELETE, got ' + count(en, 10) + '/' + count(en, 12));
    check(count(en, 5) === 0, 'i: nessun PHOTO_BEGIN');
    check(en.watch.slots[0].state === 1, 'i: slot 0 ancora VALID sull\'orologio (eliminazione fallita)');
    check(liveLong() === 0, 'i: nessun timer lungo vivo');
    next();
  });
}]);

cases.push(['j dev: hooks.open_ms forza HELLO.OPEN_MS (log della sostituzione), uno stato senza hook lo azzera', function (next) {
  /* v1.9 (F45/F09): l'unico modo di provare in emulatore l'avviso "Galleria si avvia lentamente".
   * Il log '[sync] HELLO ... open=' resta quello VERO dell'orologio (sync.js lo scrive prima del
   * piano): la riga '[dev] HELLO.OPEN_MS forzato ...' è ciò che impedisce a run.log e config page
   * di contraddirsi. */
  var en = env({ platform: 'pypkjs', openMs: 7,
                 devState: { v: 1, seq: 1, hooks: { scenario: 'photo', open_ms: 2150 } } });
  waitFor(function () { return countLog(en, FINE) >= 1; }, function (err) {
    check(!err, 'j: prima sync conclusa');
    check(hasLog(en, '[dev] hook open_ms: HELLO.OPEN_MS forzato a 2150 ms (avviso di avvio lento)'), 'j: hook letto da /state.json');
    check(hasLog(en, '[dev] HELLO.OPEN_MS forzato a 2150 ms (orologio: 7 ms)'), 'j: log della sostituzione, col valore vero dell\'orologio');
    check(hasLog(en, /^\[sync\] HELLO proto=1 .* open=7ms /), 'j: il log dell\'HELLO resta quello vero (non falsificato)');
    check(snapOpenMs() === 2150, 'j: snapshot dell\'HELLO (config page) col valore forzato, got ' + snapOpenMs());
    check(en.watch.slots[0].state === 1, 'j: la sync gira normalmente');
    /* controprova: dev server riavviato senza --open-ms → hooks senza open_ms */
    devSave(en, { v: 1, seq: 2, hooks: { scenario: 'photo' } }, function (l) {
      check(hasLog(en, '[dev] hook open_ms rimosso: HELLO.OPEN_MS torna quello dell\'orologio', l), 'j: hook azzerato dallo stato senza open_ms');
      check(!hasLog(en, /HELLO\.OPEN_MS forzato/, l), 'j: nessuna sostituzione dopo l\'azzeramento');
      check(snapOpenMs() === 7, 'j: snapshot col valore vero dopo l\'azzeramento, got ' + snapOpenMs());
      next();
    });
  });
}]);

cases.push(['k dev: hooks.open_ms 0 (valido), non numerico e negativo (ignorati)', function (next) {
  var en = env({ platform: 'pypkjs', openMs: 7,
                 devState: { v: 1, seq: 1, hooks: { scenario: 'photo', open_ms: 0 } } });
  waitFor(function () { return countLog(en, FINE) >= 1; }, function (err) {
    check(!err, 'k: prima sync conclusa');
    /* 0 è un valore, non un hook assente (l'orologio sano manda 0): l'avviso resta spento */
    check(hasLog(en, '[dev] hook open_ms: HELLO.OPEN_MS forzato a 0 ms (avviso di avvio lento)'), 'k: 0 accettato');
    check(hasLog(en, '[dev] HELLO.OPEN_MS forzato a 0 ms (orologio: 7 ms)'), 'k: sostituzione con 0');
    check(snapOpenMs() === 0, 'k: snapshot 0, got ' + snapOpenMs());
    devSave(en, { v: 1, seq: 2, hooks: { scenario: 'photo', open_ms: 'x' } }, function (l1) {
      check(hasLog(en, '[dev] hook open_ms non valido (x): ignorato', l1), 'k: hook non numerico rifiutato');
      check(hasLog(en, '[dev] hook open_ms rimosso: HELLO.OPEN_MS torna quello dell\'orologio', l1), 'k: e il valore forzato azzerato');
      check(snapOpenMs() === 7, 'k: valore vero dopo un hook non numerico, got ' + snapOpenMs());
      devSave(en, { v: 1, seq: 3, hooks: { scenario: 'photo', open_ms: -1 } }, function (l2) {
        check(hasLog(en, '[dev] hook open_ms non valido (-1): ignorato', l2), 'k: hook negativo rifiutato');
        check(!hasLog(en, /HELLO\.OPEN_MS forzato/, l2), 'k: nessuna sostituzione con un hook negativo');
        check(snapOpenMs() === 7, 'k: valore vero dopo un hook negativo, got ' + snapOpenMs());
        next();
      });
    });
  });
}]);

cases.push(['l fuori dall\'emulatore l\'hook open_ms non ha effetto (token dev rifiutato)', function (next) {
  /* platform 'android': DEV è false, /state.json non viene nemmeno letto e il token dev del
   * webviewclosed è rifiutato → devOpenMs resta null e l'HELLO non viene mai falsificato. */
  var en = env({ openMs: 7, devState: { v: 1, seq: 1, hooks: { scenario: 'photo', open_ms: 2150 } } });
  waitFor(function () { return countLog(en, FINE) >= 1; }, function (err) {
    var l = logs.length;
    check(!err, 'l: prima sync conclusa');
    check(!hasLog(en, /^\[dev\]/), 'l: nessuna riga [dev] sul telefono');
    check(snapOpenMs() === 7, 'l: snapshot col valore vero, got ' + snapOpenMs());
    devStub.saveState = { v: 1, seq: 2, hooks: { scenario: 'photo', open_ms: 2150 } };
    en.pebble.fire('webviewclosed', { response: JSON.stringify({ v: 1, dev: true, seq: 2 }) });
    realSetTimeout(function () {
      check(hasLog(en, '[config] token dev fuori dall\'emulatore: ignorato', l), 'l: token dev rifiutato');
      check(!hasLog(en, /HELLO\.OPEN_MS forzato/), 'l: mai una sostituzione fuori DEV');
      check(snapOpenMs() === 7, 'l: snapshot invariato, got ' + snapOpenMs());
      next();
    }, 300);
  });
}]);

/* ---- S10: lingua automatica (D33) e dizionari (D35) ---- */

/* Un ambiente "telefono" con la lingua dell'orologio scelta dal caso: `lang` è il locale di
 * getActiveWatchInfo() (null = campo assente, false = getActiveWatchInfo() che non torna nulla). */
function langEnv(loc) {
  var info = { platform: 'emery', model: 'qemu', firmware: { major: 4, minor: 33, patch: 2, suffix: '' } };
  if (loc !== null) { info.language = loc; }
  return env({ watchInfo: (loc === false) ? null : info });
}

cases.push(['m lingua automatica dall\'orologio, ripieghi e dizionari nello stato della config page', function (next) {
  var en, st, i, want = [['it_IT', 'it'], ['de_DE', 'de'], ['fr_FR', 'fr'], ['en_GB', 'en'],
                         ['de-CH', 'de'], ['IT_it', 'it']];
  setNavigator(null);                    /* PKJS su iOS: `navigator` non esiste (ripiego 3 = 'en') */
  for (i = 0; i < want.length; i++) {
    en = langEnv(want[i][0]);
    st = pageState(en);
    check(!!st && st.lang_auto === want[i][1], 'm: watch ' + want[i][0] + ' -> lang_auto ' + want[i][1] + ' (got ' + (st && st.lang_auto) + ')');
    check(hasLog(en, '[config] lang auto=' + want[i][1] + ' (watch ' + want[i][0] + ')'), 'm: log ASCII per ' + want[i][0]);
  }
  /* lingua fuori dalle quattro, campo assente, getActiveWatchInfo() muta: niente navigator in node → 'en' */
  en = langEnv('es_ES');
  st = pageState(en);
  check(!!st && st.lang_auto === 'en', 'm: watch es_ES (lingua non tradotta) -> en, got ' + (st && st.lang_auto));
  check(hasLog(en, '[config] lang auto=en (default, watch es_ES)'), 'm: log del ripiego con il locale dell\'orologio');
  en = langEnv(null);
  check(pageState(en).lang_auto === 'en', 'm: watchInfo senza `language` -> en');
  check(hasLog(en, '[config] lang auto=en (default, watch assente)'), 'm: log del ripiego senza lingua');
  en = langEnv(false);
  check(pageState(en).lang_auto === 'en', 'm: getActiveWatchInfo() nullo (orologio scollegato) -> en');
  /* ripiego 2 (D33): navigator.language, quando il runtime ce l'ha (WebView Android, pypkjs) */
  setNavigator('fr-CA');
  en = langEnv(null);
  check(pageState(en).lang_auto === 'fr', 'm: ripiego navigator.language -> fr');
  check(hasLog(en, '[config] lang auto=fr (navigator fr-CA)'), 'm: log del ripiego navigator');
  setNavigator('ja-JP');
  en = langEnv(null);
  check(pageState(en).lang_auto === 'en', 'm: navigator con una lingua non tradotta -> en');
  check(hasLog(en, '[config] lang auto=en (default, watch assente)'), 'm: log del ripiego finale');
  setNavigator('de-DE');
  en = langEnv('it_IT');
  check(pageState(en).lang_auto === 'it', 'm: l\'orologio vince su navigator (D33)');
  setNavigator(null);
  /* dizionari: tutte e quattro le lingue, senza `keys` (la pagina lavora per indice) */
  en = langEnv('it_IT');
  st = pageState(en);
  check(!!st && !!st.i18n, 'm: i18n presente nello stato');
  check(!!st && st.i18n && JSON.stringify(Object.keys(st.i18n)) === '["en","it","de","fr"]',
        'm: i18n con le quattro lingue, senza `keys` (got ' + (st && st.i18n && Object.keys(st.i18n).join(',')) + ')');
  check(!!st && st.i18n.it[0] === 'Salva' && st.i18n.de[1] === 'Foto hinzuf\u00fcgen' && st.i18n.fr[2] === 'Photos : {0}',
        'm: i dizionari arrivano interi (accenti compresi)');
  check(st.i18n.en.length === 3 && st.i18n.it.length === 3 && st.i18n.de.length === 3 && st.i18n.fr.length === 3,
        'm: array paralleli della stessa lunghezza');
  check(st.settings && st.settings.lang === 0, 'm: settings.lang (byte 13) nello stato, 0 = automatica');
  check(!hasLog(en, /Salva|hinzuf/), 'm: nessun testo dei dizionari nei log (F-S8-2)');
  /* modulo assente: la pagina resta in inglese minimo invece di non aprirsi */
  i18nTarget = null;
  en = langEnv('it_IT');
  st = pageState(en);
  check(!!st && st.i18n === null, 'm: i18n.js assente -> i18n null nello stato');
  check(hasLog(en, /^\[config\] i18n\.js mancante \(.*\): eseguire tools\/build_i18n\.py$/), 'm: log del modulo mancante');
  check(!!st && st.lang_auto === 'it', 'm: senza dizionari lang_auto resta calcolata');
  check(countLog(en, /i18n\.js mancante/) === 1, 'm: il require pigro non si ripete a ogni apertura');
  pageState(en);
  check(countLog(en, /i18n\.js mancante/) === 1, 'm: seconda apertura della pagina, nessun secondo log');
  /* modulo malformato (una lingua che non è un array) */
  i18nTarget = I18N_BAD;
  en = langEnv('it_IT');
  st = pageState(en);
  check(!!st && st.i18n === null, 'm: i18n.js malformato -> i18n null');
  check(hasLog(en, '[config] i18n.js malformato (it): pagina senza dizionari'), 'm: log del modulo malformato');
  i18nTarget = I18N_OK;
  restoreNavigator();
  next();
}]);

cases.push(['n dev: hooks.lang forza la lingua automatica, uno stato senza hook la ridà all\'orologio', function (next) {
  /* In emulatore la lingua dell'orologio è en_US e non si cambia: `--lang de` del dev server è
   * l'unico modo di vedere la config page "in automatico" in tedesco (D33). */
  var en = env({ platform: 'pypkjs',
                 devState: { v: 1, seq: 1, hooks: { scenario: 'photo', lang: 'de' } } });
  waitFor(function () { return countLog(en, FINE) >= 1; }, function (err) {
    var st;
    check(!err, 'n: prima sync conclusa');
    check(hasLog(en, '[dev] hook lang: lingua automatica forzata a de'), 'n: hook letto da /state.json');
    st = pageState(en);
    check(!!st && st.lang_auto === 'de', 'n: lang_auto = de nonostante l\'orologio it_IT, got ' + (st && st.lang_auto));
    check(hasLog(en, '[config] lang auto=de (hook dev)'), 'n: log dell\'hook');
    check(!!st && st.dev === true, 'n: stato dev (pagina servita dal dev server)');
    /* dev server riavviato senza --lang: hooks senza `lang` → si torna alla lingua dell'orologio */
    devSave(en, { v: 1, seq: 2, hooks: { scenario: 'photo' } }, function (l) {
      var st2;
      check(hasLog(en, '[dev] hook lang rimosso: lingua automatica dall\'orologio', l), 'n: hook azzerato');
      st2 = pageState(en);
      check(!!st2 && st2.lang_auto === 'it', 'n: lang_auto torna quella dell\'orologio (it_IT), got ' + (st2 && st2.lang_auto));
      /* valore ignoto: rifiutato e azzerato, mai spedito alla pagina */
      devSave(en, { v: 1, seq: 3, hooks: { scenario: 'photo', lang: 'italiano' } }, function (l2) {
        var st3;
        check(hasLog(en, '[dev] hook lang non valido (italiano): ignorato', l2), 'n: hook ignoto rifiutato');
        st3 = pageState(en);
        check(!!st3 && st3.lang_auto === 'it', 'n: lang_auto resta quella dell\'orologio dopo un hook ignoto');
        next();
      });
    });
  });
}]);

(function run(i) {
  if (i >= cases.length) {
    sweepTimers();
    origLog('test_index_retry: ' + pass + ' ok, ' + fail + ' falliti');
    if (fail) { origLog(logs.slice(-60).join('\n')); }
    process.exit(fail ? 1 : 0);
  }
  cases[i][1](function () { run(i + 1); });
})(0);

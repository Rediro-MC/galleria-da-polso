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
 *
 * Esecuzione: cd test && NODE_PATH=shim node test_index_retry.js (oppure make -C test jstest). */
var FakeWatch = require('fakewatch');
var FakePebble = require('fake_pebble');
var keys = require('message_keys');
var b64 = require('../src/pkjs/b64');
var crc = require('../src/pkjs/crc');
var fixture = require('./fixture_photo');
var Album = require('../src/pkjs/album');
var INDEX = require.resolve('../src/pkjs/index');

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
  en.watch = new FakeWatch({ format: 1, maxChunk: 4096, albumEnabled: opts.albumEnabled !== false, log: function () {} });
  en.pebble = new FakePebble(en.watch, { platform: 'android' });
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

(function run(i) {
  if (i >= cases.length) {
    sweepTimers();
    origLog('test_index_retry: ' + pass + ' ok, ' + fail + ' falliti');
    if (fail) { origLog(logs.slice(-60).join('\n')); }
    process.exit(fail ? 1 : 0);
  }
  cases[i][1](function () { run(i + 1); });
})(0);

#!/usr/bin/env node
/* smoke_s5b.js — smoke test end-to-end del PKJS di S5b in node: album.js + sync.js + index.js
 * (con Pebble finto e orologio finto). Non è il test adversariale (test_album.js,
 * test_sync_engine.js): verifica solo che il flusso principale funzioni prima del gate in
 * emulatore. Esecuzione: NODE_PATH=shim node smoke_s5b.js (cwd = test/).
 *
 * Revisione post code-review 29/08 (F5): il primo HELLO viene perso (pebble.dropInbound) al
 * primo 'ready' (passo 1), a una riconnessione con orologio azzerato (passo 8: la foto arriva
 * senza Save e senza retry lungo) e tre volte di fila (passo 9: 1 JS_READY + 2 rinvii, poi
 * provider.onReadyFailed → scheduleRetry di index.js "nuovo tentativo fra 30 s (1)", timer da
 * 30 s compresso a 30 ms → sync riuscita → contatore azzerato). Le politiche di retry di
 * index.js nel dettaglio sono in test_index_retry.js.
 * Passo 11 (v1.9, perf 04/09): HELLO.OPEN_MS → snapshot dell'album → hash della config page →
 * page_core.slowSeconds (l'avviso di avvio lento che vedrebbe l'utente). */
var FakeWatch = require('fakewatch');
var FakePebble = require('fake_pebble');
var b64 = require('../src/pkjs/b64');
var crc = require('../src/pkjs/crc');
var fixture = require('./fixture_photo');
var Album = require('../src/pkjs/album');

var pass = 0, fail = 0;
var origLog = console.log;
function check(c, what) { if (c) { pass++; } else { fail++; origLog('FAIL ' + what); } }

function memStorage() {
  var mem = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    keys: function () { return Object.keys(mem); }
  };
}

/* Timer ≥ 30 s (RETRY_MS di index.js) compressi /1000: il retry lungo scatta davvero (30 ms) e la
 * ripresa si vede fino in fondo. I timer del test usano realSetTimeout. */
var realSetTimeout = global.setTimeout;
var longTimers = [];                 /* ms originali dei timer lunghi, nell'ordine di creazione */
global.setTimeout = function (fn, ms) {
  if (ms >= 30000) { longTimers.push(ms); ms = ms / 1000; }
  return realSetTimeout(fn, ms);
};

var raw6 = b64.decode(fixture.raw6.b64);
var raw6b = raw6.slice(); raw6b[100] ^= 0x3F; raw6b[20000] ^= 0x15;
var crcA = crc.crc32(raw6), crcB = crc.crc32(raw6b);
check(crcA === (fixture.raw6.crc >>> 0), 'crc fixture');

var watch = new FakeWatch({ format: 1, maxChunk: 4096, log: function () {} });
var pebble = new FakePebble(watch, { platform: 'android' });
global.Pebble = pebble;
global.localStorage = memStorage();

/* Tutti i log del PKJS finiscono in `logs` (e sullo stdout, come prima): i passi 1/8/9 li asseriscono. */
var logs = [];
console.log = function (m) { logs.push(String(m)); origLog(m); };
var sync = require('../src/pkjs/sync');
sync.configure({ statusTimeoutMs: 200, watchdogMs: 2000, backoffMs: [10, 10, 10], helloTimeoutMs: 100 });
require('../src/pkjs/index');

function delta() {
  return { v: 1, photos: [
    { slot: 0, photo_id: 0x1111, fmt: 1, len: 34200, crc: crcA, data: fixture.raw6.b64, name: 'a' },
    { slot: 3, photo_id: 0x2222, fmt: 1, len: 34200, crc: crcB, data: b64.encode(raw6b), name: 'b' }
  ], order: [3, 0], settings: { layout: 1, font: 2, interval_min: 15 } };
}

function waitIdle(cb) {
  var t0 = Date.now();
  (function poll() {
    if (!sync.isRunning() && Date.now() - t0 > 60) { return cb(); }
    if (Date.now() - t0 > 8000) { return cb('timeout'); }
    realSetTimeout(poll, 20);
  })();
}

/* Attende una condizione (al più 8 s): serve dove il motore NON è "running" mentre aspetta
 * l'HELLO (helloTimer), quindi waitIdle tornerebbe troppo presto. */
function waitFor(pred, cb) {
  var t0 = Date.now();
  (function poll() {
    if (pred()) { return cb(); }
    if (Date.now() - t0 > 8000) { return cb('timeout'); }
    realSetTimeout(poll, 10);
  })();
}

function countLog(re, from) {
  var n = 0, i;
  for (i = from || 0; i < logs.length; i++) { if (re.test(logs[i])) { n++; } }
  return n;
}
function hasLog(needle, from) {
  var i;
  for (i = from || 0; i < logs.length; i++) {
    if (typeof needle === 'string' ? logs[i] === needle : needle.test(logs[i])) { return true; }
  }
  return false;
}
function countMsg(list, m) { return list.filter(function (x) { return x === m; }).length; }
var FINE = /^\[sync\] fine:/;

var steps = [];
steps.push(function (next) {
  /* 1. ready con album vuoto e primo HELLO perso (F5): rinvio del JS_READY dopo 100 ms, poi HELLO, nulla da fare */
  pebble.dropInbound = 1;
  pebble.fire('ready');
  waitFor(function () { return countLog(FINE) >= 1; }, function (err) {
    check(!err, 'step1 idle');
    check(watch.received.indexOf(1) >= 0, 'JS_READY ricevuto');
    check(watch.received.indexOf(3) < 0, 'nessuna SYNC_REQUEST con album vuoto');
    check(watch.received.indexOf(10) < 0, 'nessun SETTINGS (crc uguale ai default)');
    check(countMsg(watch.received, 1) === 2, 'step1: 2 JS_READY (originale + rinvio), got ' + countMsg(watch.received, 1));
    check(hasLog('[sync] nessun HELLO entro 100 ms: rinvio JS_READY (1/2)'), 'step1: log del rinvio');
    check(hasLog('[sync] JS_READY (rinvio 1/2)'), 'step1: log del JS_READY rinviato');
    check(hasLog(/^\[album\] piano: 0 foto/), 'step1: la sync parte comunque (piano)');
    check(!hasLog(/nuovo tentativo fra/), 'step1: nessun retry lungo');
    next();
  });
});
steps.push(function (next) {
  /* 2. webviewclosed con 2 foto + ordine + settings → sync completa */
  pebble.fire('webviewclosed', { response: encodeURIComponent(JSON.stringify(delta())) });
  waitIdle(function (err) {
    check(!err, 'step2 idle');
    check(watch.slots[0].state === 1 && watch.slots[0].crc === crcA, 'slot 0 sull\'orologio');
    check(watch.slots[3].state === 1 && watch.slots[3].crc === crcB, 'slot 3 sull\'orologio');
    check(watch.order.join(',') === '3,0', 'ordine 3,0 (got ' + watch.order.join(',') + ')');
    check(watch.settings[1] === 1 && watch.settings[2] === 2 && watch.settings[7] === 15, 'settings applicate');
    check(watch.buffers[0].length === 34200 && crc.crc32(watch.buffers[0]) === crcA, 'payload slot 0 integro');
    check(watch.buffers[3].length === 34200 && crc.crc32(watch.buffers[3]) === crcB, 'payload slot 3 integro');
    check(watch.received.filter(function (m) { return m === 10; }).length === 1, 'SETTINGS una volta');
    check(global.localStorage.getItem('galleria.v1.p0.1') === fixture.raw6.b64, 'payload in localStorage');
    next();
  });
});
steps.push(function (next) {
  /* 3. resync senza modifiche: nessuna foto, nessun SETTINGS, nessun ORDER */
  var n3 = watch.received.length;
  sync.resync();
  waitIdle(function (err) {
    var got = watch.received.slice(n3);
    check(!err, 'step3 idle');
    check(got.join(',') === '1', 'solo JS_READY (got ' + got.join(',') + ')');
    next();
  });
});
steps.push(function (next) {
  /* 4. wipe dell'orologio → tutto rimandato */
  watch.wipe();
  var n4 = watch.received.length;
  sync.resync();
  waitIdle(function (err) {
    var got = watch.received.slice(n4);
    check(!err, 'step4 idle');
    check(watch.slots[0].state === 1 && watch.slots[3].state === 1, 'foto rimandate dopo wipe');
    check(got.indexOf(10) >= 0, 'SETTINGS rimandate dopo wipe');
    check(got.indexOf(11) >= 0, 'ORDER rimandato dopo wipe');
    check(watch.order.join(',') === '3,0', 'ordine dopo wipe');
    next();
  });
});
steps.push(function (next) {
  /* 5. delta: elimina slot 0, riordina */
  var n5 = watch.received.length;
  pebble.fire('webviewclosed', { response: JSON.stringify({ v: 1, deleted: [0], order: [3] }) });
  waitIdle(function (err) {
    var got = watch.received.slice(n5);
    check(!err, 'step5 idle');
    check(watch.slots[0].state === 0, 'slot 0 eliminato');
    check(got.indexOf(12) >= 0, 'ALBUM_DELETE inviato');
    check(got.indexOf(5) < 0, 'nessun PHOTO_BEGIN');
    next();
  });
});
steps.push(function (next) {
  /* 6. STATUS persi (SYNC_READY e primo STATUS) + NACK: tutto si ripara */
  watch.wipe();
  watch.dropStatus = 2;
  pebble.nackNext = 1;
  var n6 = watch.received.length;
  sync.resync();
  waitIdle(function (err) {
    check(!err, 'step6 idle');
    check(watch.slots[3].state === 1 && watch.slots[3].crc === crcB, 'foto arrivata nonostante guasti');
    check(watch.received.slice(n6).filter(function (m) { return m === 10; }).length >= 2, 'SETTINGS rinviate dopo gli STATUS persi');
    next();
  });
});
steps.push(function (next) {
  /* 7. riavvio del PKJS: nuovo Album dallo stesso storage → HELLO → nulla */
  var a2 = new Album(global.localStorage, function () {});
  check(a2.count() === 1 && a2.data.order.join(',') === '3', 'album riletto: ' + a2.summary());
  check(a2.data.deleted.length === 0, 'eliminazione confermata e rimossa');
  check(a2.data.orderDirty === false, 'orderDirty azzerato');
  next();
});
steps.push(function (next) {
  /* 8. riconnessione (secondo 'ready' → resync) con orologio azzerato e primo HELLO perso (F5):
   *    la foto arriva senza Save della pagina e senza retry lungo */
  watch.wipe();
  pebble.dropInbound = 1;
  var n8 = watch.received.length, l8 = logs.length;
  check(countLog(/rinvio JS_READY/) === 1, 'step8: fino a qui un solo rinvio (nessun rinvio spurio nei passi 2-7)');
  pebble.fire('ready');
  waitFor(function () { return countLog(FINE, l8) >= 1; }, function (err) {
    var got = watch.received.slice(n8);
    check(!err, 'step8 sync conclusa');
    check(hasLog('[sync] motore già avviato: resync', l8), 'step8: secondo ready → resync');
    check(countMsg(got, 1) === 2, 'step8: 2 JS_READY (originale + rinvio), got ' + countMsg(got, 1));
    check(hasLog('[sync] nessun HELLO entro 100 ms: rinvio JS_READY (1/2)', l8), 'step8: log del rinvio');
    check(watch.slots[3].state === 1 && watch.slots[3].crc === crcB, 'step8: foto arrivata dopo l\'HELLO perso');
    check(!hasLog(/nuovo tentativo fra/, l8), 'step8: nessun retry lungo');
    check(longTimers.length === 0, 'step8: nessun timer lungo creato');
    next();
  });
});
steps.push(function (next) {
  /* 9. tre HELLO persi: 1 JS_READY + 2 rinvii, poi provider.onReadyFailed → scheduleRetry di index.js
   *    ("nuovo tentativo fra 30 s (1)", timer compresso a 30 ms) → resync → sync riuscita */
  watch.wipe();
  pebble.dropInbound = 3;
  var n9 = watch.received.length, l9 = logs.length;
  pebble.fire('ready');
  waitFor(function () { return countLog(FINE, l9) >= 1; }, function (err) {
    var got = watch.received.slice(n9);
    check(!err, 'step9 sync conclusa dopo il retry');
    check(hasLog('[sync] nessun HELLO entro 100 ms: rinvio JS_READY (2/2)', l9), 'step9: secondo rinvio');
    check(hasLog('[sync] nessun HELLO dopo 2 rinvii di JS_READY', l9), 'step9: log di readyFailed');
    check(hasLog('[sync] nessun HELLO dopo 2 rinvii di JS_READY: nuovo tentativo fra 30 s (1)', l9), 'step9: retry lungo di index.js (onReadyFailed → scheduleRetry)');
    check(longTimers.length === 1 && longTimers[0] === 30000, 'step9: un timer da 30 s (got ' + longTimers.join(',') + ')');
    check(countMsg(got, 1) === 4, 'step9: 4 JS_READY (3 senza HELLO + 1 del retry), got ' + countMsg(got, 1));
    check(watch.slots[3].state === 1 && watch.slots[3].crc === crcB, 'step9: foto arrivata dopo il retry');
    check(countLog(/nuovo tentativo fra/, l9) === 1, 'step9: un solo retry');
    /* 3 × helloTimeout dopo la fine: nessun rinvio spurio né altro retry (sync riuscita → cancelRetry) */
    var nEnd = watch.received.length, lEnd = logs.length;
    realSetTimeout(function () {
      check(watch.received.length === nEnd, 'step9: nessun messaggio dopo la sync riuscita');
      check(!hasLog(/rinvio JS_READY|nuovo tentativo fra/, lEnd), 'step9: nessun rinvio/retry spurio');
      check(!sync.isRunning(), 'step9: motore fermo');
      next();
    }, 350);
  });
});

steps.push(function (next) {
  /* 10. S6: showConfiguration apre la pagina con lo stato nell'hash (base64url dei byte UTF-8 del
   *     JSON): sul "telefono" (platform android) un data: URL; fmt dal formato dell'ultimo HELLO,
   *     cap_kb 900 (Android), foto e slot dell'orologio presenti. */
  var nOpened = pebble.opened.length, l10 = logs.length, url, hashPos, hash, st;
  pebble.fire('showConfiguration');
  check(pebble.opened.length === nOpened + 1, 'step10: openURL chiamata una volta');
  url = pebble.opened[pebble.opened.length - 1] || '';
  check(url.indexOf('data:text/html;charset=utf-8,') === 0, 'step10: data: URL sul telefono');
  hashPos = url.indexOf('#');
  check(hashPos > 0, 'step10: hash presente');
  hash = hashPos > 0 ? url.slice(hashPos + 1) : '';
  check(/^[A-Za-z0-9_-]+$/.test(hash), 'step10: hash base64url puro');
  try { st = JSON.parse(Buffer.from(b64.decode(hash)).toString('utf8')); } catch (e) { st = null; }
  check(!!st && st.v === 1, 'step10: stato JSON v1');
  check(!!st && st.fmt === 1 && st.platform === 'emery', 'step10: fmt 1 / platform emery (got ' + (st && st.fmt) + '/' + (st && st.platform) + ')');
  check(!!st && st.cap_kb === 900 && st.dev === false, 'step10: cap 900 KB, dev false');
  check(!!st && st.settingsSet === true && st.settings && st.settings.font === 2 && st.settings.layout === 1 && st.settings.interval_min === 15, 'step10: impostazioni salvate nello stato (got ' + JSON.stringify(st && st.settings) + ')');
  check(!!st && st.photos && st.photos.length === 12 && st.photos[3] && st.photos[3].fmts && st.photos[3].fmts[1], 'step10: foto dello slot 3 nello stato');
  check(!!st && st.watch && st.watch.format === 1 && st.watch.slots && st.watch.slots.length === 12 && st.watch.slots[3].state === 1 && st.watch.slots[3].crc === crcB, 'step10: snapshot HELLO aggiornato dagli esiti (slot 3 VALID dopo il reinvio; got ' + JSON.stringify(st && st.watch && st.watch.slots[3]) + ')');
  check(!!st && st.order && st.order.join(',') === '3', 'step10: ordine (got ' + (st && st.order && st.order.join(',')) + ')');
  check(hasLog(/^\[config\] apro la pagina \(URL \d+ car\., stato \d+\)/, l10), 'step10: log di apertura');
  /* pagina chiusa senza modifiche: nessuna sync */
  var n10 = watch.received.length;
  pebble.fire('webviewclosed', { response: '' });
  check(hasLog('[config] pagina chiusa senza modifiche', l10), 'step10: chiusura senza modifiche');
  realSetTimeout(function () {
    check(watch.received.length === n10, 'step10: nessun messaggio dopo la chiusura vuota');
    next();
  }, 150);
});

steps.push(function (next) {
  /* 11. v1.9 (perf 04/09): HELLO.OPEN_MS -> snapshot dell'album -> hash della config page -> la
   *     pagina (page_core, lo stesso codice che gira nella WebView) decide di mostrare l'avviso. */
  var l11 = logs.length;
  watch.openMs = 2150;                              /* orologio con il file persist gonfio */
  pebble.fire('ready');                             /* motore gia' avviato -> resync -> nuovo HELLO */
  realSetTimeout(function () {
    var url, hash, st, core, dec;
    check(hasLog(/HELLO .*open=2150ms/, l11), 'step11: il PKJS legge OPEN_MS dal HELLO');
    pebble.fire('showConfiguration');
    url = pebble.opened[pebble.opened.length - 1] || '';
    hash = url.slice(url.indexOf('#') + 1);
    try { st = JSON.parse(Buffer.from(b64.decode(hash)).toString('utf8')); } catch (e) { st = null; }
    check(!!st && st.watch && st.watch.openMs === 2150, 'step11: watch.openMs nello stato della pagina (got ' +
          (st && st.watch && st.watch.openMs) + ')');
    core = require('../src/pkjs/config/page_core');
    dec = core.decodeState('#' + hash);
    check(dec.watch && dec.watch.openMs === 2150, 'step11: la pagina rilegge openMs dall\'hash');
    check(core.slowSeconds(dec.watch) === '2,2', 'step11: la pagina mostrerebbe l\'avviso "2,2 s"');
    pebble.fire('webviewclosed', { response: '' });
    realSetTimeout(next, 50);
  }, 400);
});

(function run() {
  var f = steps.shift();
  if (!f) {
    origLog('smoke_s5b: ' + pass + ' ok, ' + fail + ' falliti');
    process.exit(fail ? 1 : 0);
  }
  f(run);
})();

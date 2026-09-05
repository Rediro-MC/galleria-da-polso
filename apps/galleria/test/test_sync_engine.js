#!/usr/bin/env node
/* test_sync_engine.js — test ADVERSARIALE del motore di sync del PKJS (src/pkjs/sync.js, S5a/S5b)
 * contro l'orologio finto shim/fakewatch.js + shim/fake_pebble.js.
 *
 * Non usa album.js: il "provider" e' costruito qui a mano (piani con foto esplicite, bytes
 * diretti o load(cb) pigro), cosi' i guasti si iniettano dove serve e i casi restano
 * deterministici (nessun Math.random, photo_id sempre espliciti, foto dalla fixture di
 * test/fixture_photo.js o sue varianti con CRC ricalcolato da src/pkjs/crc.js).
 *
 * Copre (docs/design/galleria.md §5, lato telefono):
 *   1  flusso felice 1/2/3 foto + SETTINGS/ORDER/DELETE, ordine dei messaggi, byte sull'orologio,
 *      summary, callback del provider, flint (fmt 2, chunk 3072 -> un solo PHOTO_DATA), chunk
 *      rinegoziato dal SYNC_READY
 *   2  invariante "un solo messaggio in volo" (contatore di invii senza ACK su FakePebble)
 *   3  hooks.beforeData 'skip' (SEQ_ERR -> ripresa), 'dup' (duplicato ignorato), 'stop' (watchdog)
 *   4  CRC dichiarato sbagliato -> CRC_ERR -> una ripetizione -> foto fallita, la successiva parte;
 *      BAD_FORMAT sul BEGIN e NO_SPACE sull'END -> foto scartata senza ripetizioni
 *   5  STATUS persi su BEGIN / END (idempotente) / SETTINGS / ORDER / DELETE / SYNC_READY, e
 *      oltre STATUS_RESENDS -> 'send failed' ma sync che termina; 5g (F7): rinvio della
 *      SYNC_REQUEST NACKato fino in fondo -> dopo la fine nessuna attesa/gestore stantio
 *   6  NACK: uno solo (backoff e ripresa), oltre BACKOFF_MS.length (foto fallita), sul JS_READY
 *   7  BUSY durante i dati e sul PHOTO_BEGIN (orologio tornato IDLE) -> nuova SYNC_REQUEST ->
 *      ripresa da 0; oltre BUSY_RETRIES la foto viene scartata; 7d (F3): la SYNC_REQUEST di
 *      ripresa porta OFFSET = foto concluse e "Foto k/n" sull'orologio finto riprende da k
 *      7f (S7 §2.10): clamp OFFSET >= COUNT dell'orologio finto, dizionario costruito a mano (il
 *      motore non puo' produrre quel caso: invariante globale sulle SYNC_REQUEST spedite)
 *   8  MAX_CHUNK 0 (nessun PHOTO_*, ma SETTINGS/ORDER/DELETE si') e SYNC_REQUEST -> NOT_SUPPORTED
 *   9  HELLO durante una sync (ignorato), resync() durante/a riposo, plan che lancia, plan vuoto,
 *      start() due volte, onDone che lancia; 9f (F14): _reset() stacca il listener 'appmessage'
 *      (startSync() verifica sempre che il listener sia UNO solo)
 *  10  caricamento pigro: errore, lunghezza sbagliata, load lento, bytes liberati, cb doppia,
 *      bytes diretti di lunghezza sbagliata
 *  11  parseSlots / parseHello (settingsCrc assente o presente), PROTO diverso
 *  11b parseHello: OPEN_MS (v1.9) = 0, valore, oltre 16 bit, assente (orologio vecchio)
 *  11c chiavi-NOME dell'app Core Devices (bug di campo F-S8-1, 30/08/2026): sync completa (SETTINGS,
 *      ALBUM_ORDER, ALBUM_DELETE, 2 foto con chunk rinegoziato) con i payload IN INGRESSO consegnati
 *      per NOME ('MSG', 'PROTO', ...) e i byte array in int8 con segno -> parseHello (OPEN_MS, CRC,
 *      SLOTS con CRC >= 0x80000000), STATUS con CODE/SLOT/OFFSET/REPLY_TO, SYNC_READY{MAX_CHUNK}
 *  12  STATUS non pertinenti (OK{offset<LENGTH} in attesa dell'END, SEQ_ERR in attesa del BEGIN,
 *      OK in attesa del SYNC_READY, NO_SPACE durante i dati, MSG ignoti, SYNC_READY ripetuto)
 *  13  watchdog: orologio muto -> sync chiusa, running false, un HELLO successivo riparte
 *  14  regressione S5b (corretta: photoFailed con guardia su s.cur): watchdog durante una catena di
 *      backoff non deve far dereferenziare s.cur nullo (TypeError). Il caso e' VERDE e deve restarlo.
 *  15  attesa dell'HELLO dopo il JS_READY (F5): HELLO perso -> rinvio del JS_READY (2 volte) ->
 *      provider.onReadyFailed(why); nessun rinvio spurio (piano vuoto, HELLO prima dell'ACK, PROTO
 *      diverso, resync() durante l'attesa)
 *
 * Il summary di onDone porta photoCodes ['slot:CODE'] per ogni foto fallita (F9): asserito nei casi
 * 1a/1c/4/4b/4c/5c/5e/6b/7c/8a/8b/9c/10a/12d. Ogni setTimeout creato da src/pkjs/sync.js viene
 * tracciato (checkNoTimers): a fine scenario il motore non deve lasciare timer vivi.
 *
 * Esecuzione: cd test && NODE_PATH=shim node test_sync_engine.js  (oppure make -C test jstest).
 * GAL_NAMEKEYS=1 nell'ambiente fa girare TUTTA la suite nella forma dell'app Core Devices (chiavi-NOME
 * e byte con segno in ingresso: shim/fakewatch.js): l'esito deve essere identico, perche' src/pkjs/
 * sync.js legge le due forme con gv(). I dizionari IN USCITA dal PKJS restano numerici in entrambe.
 */

var FakeWatch = require('fakewatch');
var FakePebble = require('fake_pebble');
var keys = require('message_keys');
var b64 = require('../src/pkjs/b64');
var crc = require('../src/pkjs/crc');
var fixture = require('./fixture_photo');
var sync = require('../src/pkjs/sync');          /* UN SOLO require per processo (stato di modulo) */

var MSG = FakeWatch.MSG;
var CODE = FakeWatch.CODE;

/* ------------------------------------------------------------------ contatori e utilita' --- */

var g_pass = 0, g_fail = 0, g_case = '?', g_env = null, g_failAtCaseStart = 0;
var g_maxDataInFlight = 0;
var g_syncReq = 0, g_syncReqBad = 0;   /* SYNC_REQUEST spedite dal motore: OFFSET deve sempre essere < COUNT (caso 7f) */

function show(v) {
  if (v === undefined) { return 'undefined'; }
  if (v === null) { return 'null'; }
  if (typeof v === 'object') { try { return JSON.stringify(v); } catch (err) { return '' + v; } }
  return '' + v;
}

function check(cond, what) {
  if (cond) { g_pass++; } else { g_fail++; console.log('FAIL [' + g_case + '] ' + what); }
}

function eq(got, exp, what) {
  if (got === exp) { g_pass++; } else {
    g_fail++;
    console.log('FAIL [' + g_case + '] ' + what + ': ottenuto ' + show(got) + ', atteso ' + show(exp));
  }
}

function bytesEq(got, exp, what) {
  var i;
  if (!got || got.length !== (exp ? exp.length : -1)) {
    g_fail++; console.log('FAIL [' + g_case + '] ' + what + ': ' + (got ? got.length : 'null') +
                          ' byte invece di ' + (exp ? exp.length : 'null'));
    return;
  }
  for (i = 0; i < exp.length; i++) {
    if ((got[i] & 255) !== (exp[i] & 255)) {
      g_fail++; console.log('FAIL [' + g_case + '] ' + what + ': byte ' + i + ' = ' + got[i] + ' invece di ' + exp[i]);
      return;
    }
  }
  g_pass++;
}

/* Strumentazione dei timer (F5/F7): ogni setTimeout viene registrato finche' non scatta o viene
 * cancellato, con il frame che lo ha creato. liveSyncTimers() elenca solo quelli creati da
 * src/pkjs/sync.js (HELLO, STATUS, watchdog, backoff): a fine scenario devono essere zero. I timer
 * del test e dei finti (fake_pebble) non contano. */
var g_timers = {}, g_timerId = 0;
var realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout;
global.setTimeout = function (fn, ms) {
  var id = ++g_timerId;
  var from = ((new Error().stack || '').split('\n')[2] || '').replace(/^\s+at\s+/, '');
  var h = realSetTimeout(function () { delete g_timers[id]; fn(); }, ms);
  g_timers[id] = { ms: ms, from: from, h: h };
  return id;
};
global.clearTimeout = function (id) {
  if (g_timers[id]) { realClearTimeout(g_timers[id].h); delete g_timers[id]; }
};

function liveSyncTimers() {
  var out = [], k;
  for (k in g_timers) {
    if (Object.prototype.hasOwnProperty.call(g_timers, k) && /[\/\\]sync\.js:/.test(g_timers[k].from)) {
      out.push(g_timers[k].ms + ' ms @ ' + g_timers[k].from);
    }
  }
  return out;
}

function checkNoTimers(what) {
  var t = liveSyncTimers();
  check(t.length === 0, (what || 'nessun timer vivo in sync.js') + (t.length ? ' [' + t.join('; ') + ']' : ''));
}

/* ------------------------------------------------------------------------- foto di prova --- */

var RAW6 = b64.decode(fixture.raw6.b64);         /* 34.200 B, emery */
var RAW1 = b64.decode(fixture.raw1.b64);         /*  3.024 B, flint */

/* Variante deterministica della fixture: cambia 2 byte, CRC ricalcolato (foto "diverse" senza
 * dipendere da Math.random). seed 0 = fixture originale. */
function variant(base, seed) {
  var a = base.slice();
  if (seed) {
    a[7] = (a[7] + seed) & 255;
    a[a.length - 3] = (a[a.length - 3] ^ ((seed * 37) & 255)) & 255;
  }
  return a;
}

/* opts: {fmt, seed, bytes, crc, lazy, loadErr, loadBytes, loadDelay, loadTwice, loadNever} */
function mkPhoto(slot, id, opts) {
  opts = opts || {};
  var fmt = opts.fmt || 1;
  var bytes = opts.bytes || variant(fmt === 2 ? RAW1 : RAW6, opts.seed || 0);
  var p = {
    slot: slot, photoId: id, format: fmt, length: bytes.length,
    crc: (opts.crc !== undefined ? opts.crc : crc.crc32(bytes)) | 0
  };
  p._expected = bytes;
  p.loadCalls = 0;
  if (opts.lazy || opts.loadErr || opts.loadBytes || opts.loadDelay || opts.loadTwice || opts.loadNever) {
    p.load = function (cb) {
      p.loadCalls++;
      if (opts.loadNever) { return; }
      var deliver = function () {
        if (opts.loadErr) { cb(opts.loadErr); return; }
        cb(null, opts.loadBytes ? opts.loadBytes : bytes.slice());
        if (opts.loadTwice) { cb(null, bytes.slice()); }     /* cb doppia: deve essere ignorata */
      };
      if (opts.loadDelay) { setTimeout(deliver, opts.loadDelay); } else { deliver(); }
    };
  } else {
    p.bytes = bytes;
  }
  return p;
}

var SETTINGS20 = [1, 1, 2, 0, 0, 0, 0, 15, 0, 0, 1, 15, 0, 0, 0, 0, 0, 0, 0, 0];   /* valido per fakewatch */
function order12(list) {
  var o = [], i;
  for (i = 0; i < 12; i++) { o.push(i < list.length ? list[i] : 0xFF); }
  return o;
}

/* ------------------------------------------------------------- ambiente di un singolo caso --- */

/* opts: {format, maxChunk, albumEnabled, nameKeys, statusTimeoutMs, watchdogMs, backoffMs,
 *        statusResends, busyRetries, helloTimeoutMs, helloResends}. configure() e' cumulativo (variabili di modulo):
 * OGNI parametro viene passato sempre, cosi' un caso non eredita i tempi di quello precedente. */
function env(opts) {
  opts = opts || {};
  sync._reset();
  sync.configure({
    statusTimeoutMs: opts.statusTimeoutMs || 150,
    watchdogMs: opts.watchdogMs || 1500,
    backoffMs: opts.backoffMs || [10, 10, 10],
    statusResends: (opts.statusResends === undefined) ? 2 : opts.statusResends,
    busyRetries: (opts.busyRetries === undefined) ? 5 : opts.busyRetries,
    helloTimeoutMs: opts.helloTimeoutMs || 150,
    helloResends: (opts.helloResends === undefined) ? 2 : opts.helloResends
  });
  var en = { logs: [], inFlight: 0, maxInFlight: 0, dataInFlight: 0, maxDataInFlight: 0 };
  var lg = function (m) { en.logs.push(String(m)); };
  en.log = lg;
  en.watch = new FakeWatch({ format: opts.format || 1, maxChunk: opts.maxChunk,
                             albumEnabled: opts.albumEnabled, nameKeys: opts.nameKeys, log: lg });
  en.pebble = new FakePebble(en.watch, { log: lg });

  /* Strumentazione: invii senza ACK/NACK. `settle` PRIMA del callback, perche' il callback di
   * successo e' proprio il punto in cui il motore spedisce il messaggio successivo. */
  var orig = en.pebble.sendAppMessage;
  en.pebble.sendAppMessage = function (dict, ok, fail) {
    var isData = ((dict[keys.MSG] | 0) === MSG.PHOTO_DATA), done = false;
    if ((dict[keys.MSG] | 0) === MSG.SYNC_REQUEST) {
      /* 7f: il motore reale non deve mai produrre OFFSET >= COUNT (il clamp dell'orologio e' solo una
       * rete di sicurezza). L'invariante e' verificata su TUTTI i casi della suite. */
      g_syncReq++;
      if (!(((dict[keys.OFFSET] | 0) >>> 0) < ((dict[keys.COUNT] | 0) >>> 0))) { g_syncReqBad++; }
    }
    en.inFlight++;
    if (en.inFlight > en.maxInFlight) { en.maxInFlight = en.inFlight; }
    if (isData) {
      en.dataInFlight++;
      if (en.dataInFlight > en.maxDataInFlight) { en.maxDataInFlight = en.dataInFlight; }
      if (en.dataInFlight > g_maxDataInFlight) { g_maxDataInFlight = en.dataInFlight; }
    }
    function settle() {
      if (done) { return; }
      done = true;
      en.inFlight--;
      if (isData) { en.dataInFlight--; }
    }
    orig.call(en.pebble, dict, function (r) { settle(); if (ok) { ok(r); } },
              function (r) { settle(); if (fail) { fail(r); } });
  };

  global.Pebble = en.pebble;
  g_env = en;
  return en;
}

/* Listener 'appmessage' registrati sul Pebble finto del caso (F14: _reset() deve staccare il suo). */
function listeners(en) { return (en.pebble.listeners.appmessage || []).length; }

function startSync(en, provider, hooks) {
  global.Pebble = en.pebble;
  sync.start({ provider: provider, log: en.log, hooks: hooks || {} });
  eq(listeners(en), 1, 'un solo listener appmessage');
}

/* provider minimo: plan fisso (o funzione), con contatori e registrazione degli esiti */
function mkProvider(planOrFn) {
  var pr = {
    planCalls: 0, plans: [], hellos: [], results: [], summaries: [], readyFailed: [],
    plan: function (hello) {
      pr.planCalls++;
      pr.hellos.push(hello);
      var p = (typeof planOrFn === 'function') ? planOrFn(hello, pr.planCalls) : planOrFn;
      pr.plans.push(p);
      return p;
    },
    onPhotoResult: function (photo, ok, code) { pr.results.push({ slot: photo.slot, ok: ok, code: code }); },
    onDone: function (summary) { pr.summaries.push(summary); },
    onReadyFailed: function (why) { pr.readyFailed.push(why); }     /* F5: JS_READY non consegnato / nessun HELLO */
  };
  return pr;
}

/* Summary i-esimo del provider, o {} se onDone non e' stato chiamato (un'asserzione rossa non deve
 * far crollare la suite con un TypeError: i casi 5g/7d/9f/15 lo usano). */
function summary(pr, i) { return pr.summaries[i || 0] || {}; }

/* Attende che il motore sia fermo (isRunning false e nessuna ripartenza entro `settle` ms). */
function waitIdle(cb, opts) {
  opts = opts || {};
  var limit = opts.timeout || 8000, settle = opts.settle || 40, grace = opts.grace || 110;
  var t0 = Date.now(), saw = false;
  (function poll() {
    if (sync.isRunning()) { saw = true; }
    if (!sync.isRunning() && (saw || Date.now() - t0 > grace)) {
      setTimeout(function () {
        if (sync.isRunning()) { poll(); return; }
        cb(null);
      }, settle);
      return;
    }
    if (Date.now() - t0 > limit) { cb('timeout'); return; }
    setTimeout(poll, 10);
  })();
}

/* --------------------------------------------------------- iniezione di guasti sull'orologio --- */

/* Perde la risposta ai prossimi `times` messaggi di tipo `msg` (usa watch.dropStatus, che il
 * filtro di FakeWatch.handle decrementa). Solo per messaggi che rispondono sempre. */
function dropReplyTo(en, msg, times) {
  var orig = en.watch.handle;
  en.watch.handle = function (d) {
    if (((d[keys.MSG] | 0) === msg) && times > 0) { times--; this.dropStatus++; }
    return orig.call(this, d);
  };
}

/* Dopo aver gestito `msg` (le prime `times` volte) recapita al PKJS un dizionario finto: serve
 * per gli STATUS "non pertinenti" (risposte tardive a messaggi precedenti). */
function injectAfter(en, msg, times, make) {
  var orig = en.watch.handle;
  en.watch.handle = function (d) {
    var r = orig.call(this, d), payload;
    if (((d[keys.MSG] | 0) === msg) && times > 0) {
      times--;
      payload = make(this, d);
      setTimeout(function () { en.pebble.fire('appmessage', { payload: payload }); }, 0);
    }
    return r;
  };
}

function statusDict(code, slot, offset, replyTo) {
  var d = {};
  d[keys.MSG] = MSG.STATUS; d[keys.CODE] = code;
  d[keys.SLOT] = (slot === undefined) ? 0xFF : slot;
  d[keys.OFFSET] = (offset || 0) | 0;
  if (replyTo !== undefined) { d[keys.REPLY_TO] = replyTo; }     /* S5b: a quale MSG risponde */
  return d;
}

/* Indice dell'ultima riga di log che soddisfa `re` (-1 se nessuna). */
function lastLogIndex(en, re) {
  var i;
  for (i = en.logs.length - 1; i >= 0; i--) { if (re.test(en.logs[i])) { return i; } }
  return -1;
}

/* Campo di un payload CONSEGNATO AL PKJS, in qualunque forma: chiavi numeriche (pypkjs) o chiavi-NOME
 * (app Core Devices, caso 11c e GAL_NAMEKEYS=1). E' l'equivalente di gv() in src/pkjs/sync.js: i test
 * che ispezionano il ritorno di watch.handle() devono passare di qui per valere in tutte e due le
 * modalita' (i dizionari in USCITA dal PKJS, in FakePebble.outbox, sono sempre numerici). */
function inField(d, name) { return FakeWatch.get(d, name); }

/* Dizionari spediti dal PKJS (copie in FakePebble.outbox, NACK compresi) con un dato MSG. */
function outbox(en, msg) {
  return en.pebble.outbox.filter(function (d) { return (d[keys.MSG] | 0) === msg; });
}

/* Le SYNC_REQUEST spedite, come {count, offset} (F3: OFFSET = foto gia' concluse). */
function syncRequests(en) {
  return outbox(en, MSG.SYNC_REQUEST).map(function (d) { return { count: d[keys.COUNT], offset: d[keys.OFFSET] }; });
}

/* Sequenza "Foto k/n" mostrata dall'orologio finto (watch.progress), come 'k/n k/n ...'. */
function progressSeq(en) {
  return en.watch.progress.map(function (x) { return x[0] + '/' + x[1]; }).join(' ');
}

function u8(v) { return (v === undefined || v === null) ? undefined : ((v >>> 0) > 255 ? 255 : (v >>> 0)); }

function count(arr, v) {
  var n = 0, i;
  for (i = 0; i < arr.length; i++) { if (arr[i] === v) { n++; } }
  return n;
}

function hasLog(en, re) {
  var i;
  for (i = 0; i < en.logs.length; i++) { if (re.test(en.logs[i])) { return true; } }
  return false;
}

/* Sequenza attesa dei MSG ricevuti dall'orologio per una foto: BEGIN, n x DATA, END. */
function photoSeq(nData) {
  var a = [MSG.PHOTO_BEGIN], i;
  for (i = 0; i < nData; i++) { a.push(MSG.PHOTO_DATA); }
  a.push(MSG.PHOTO_END);
  return a;
}

/* Verifica dell'invariante "un solo messaggio in volo". I messaggi DI DATI sono sempre uno solo;
 * il totale puo' arrivare a 2 solo dopo una ripartenza (SEQ_ERR/BUSY), perche' per progetto lo
 * STATUS fuori sequenza arriva DOPO l'ACK del suo chunk, cioe' dopo l'invio del successivo
 * (docs/design/galleria.md §5). `maxAll` dichiara il limite atteso del caso. */
function checkInFlight(en, maxAll) {
  check(en.maxDataInFlight <= 1, 'PHOTO_DATA in volo <= 1 (max ' + en.maxDataInFlight + ')');
  check(en.maxInFlight <= maxAll, 'messaggi in volo <= ' + maxAll + ' (max ' + en.maxInFlight + ')');
}

/* ================================================================================ i casi === */

var cases = [];
function testcase(name, fn) { cases.push({ name: name, fn: fn }); }

/* ---- 1. flusso felice --------------------------------------------------------------------- */

testcase('1a felice: 1 foto emery (9 PHOTO_DATA)', function (next) {
  var en = env({});
  var photo = mkPhoto(0, 0x1001, {});
  var pr = mkProvider({ photos: [photo] });
  var chunks = [];
  startSync(en, pr, { beforeData: function (p, off, n) { chunks.push(off + ':' + n); return undefined; } });
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(en.watch.received.join(','), [MSG.JS_READY, MSG.SYNC_REQUEST].concat(photoSeq(9)).concat([MSG.SYNC_DONE]).join(','),
       'sequenza dei messaggi ricevuti');
    eq(count(en.watch.received, MSG.PHOTO_DATA), 9, '9 PHOTO_DATA (8 x 4096 + 1432)');
    eq(chunks.join(' '), '0:4096 4096:4096 8192:4096 12288:4096 16384:4096 20480:4096 24576:4096 28672:4096 32768:1432',
       'offset/dimensione di ogni chunk (l\'ultimo e\' il resto, non MAX_CHUNK)');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte sull\'orologio = byte inviati');
    eq(en.watch.slots[0].state, 1, 'slot 0 valido');
    eq(en.watch.slots[0].crc, crc.crc32(photo._expected), 'CRC dello slot 0');
    eq(en.watch.slots[0].photoId, 0x1001, 'photo_id dello slot 0');
    eq(pr.summaries.length, 1, 'onDone chiamato una volta');
    eq(show(pr.summaries[0]), show({ photosOk: 1, photosFailed: 0, settings: null, order: null, deletes: [], photoCodes: [] }), 'summary');
    eq(show(pr.results), show([{ slot: 0, ok: true, code: 'OK' }]), 'onPhotoResult');
    checkInFlight(en, 1);
    next();
  });
});

testcase('1b felice: 2 foto', function (next) {
  var en = env({});
  var p0 = mkPhoto(0, 0x2001, { seed: 1 });
  var p1 = mkPhoto(5, 0x2002, { seed: 2 });
  var pr = mkProvider({ photos: [p0, p1] });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(en.watch.received.join(','),
       [MSG.JS_READY, MSG.SYNC_REQUEST].concat(photoSeq(9)).concat(photoSeq(9)).concat([MSG.SYNC_DONE]).join(','),
       'sequenza dei messaggi ricevuti');
    bytesEq(en.watch.buffers[0], p0._expected, 'byte slot 0');
    bytesEq(en.watch.buffers[5], p1._expected, 'byte slot 5');
    check(en.watch.slots[0].crc !== en.watch.slots[5].crc, 'le due foto sono diverse');
    eq(pr.summaries[0].photosOk, 2, 'photosOk');
    eq(pr.summaries[0].photosFailed, 0, 'photosFailed');
    eq(en.watch.order.join(','), '0,5', 'ordine implicito dei commit');
    checkInFlight(en, 1);
    next();
  });
});

testcase('1c felice: 3 foto + SETTINGS + ORDER + 2 DELETE', function (next) {
  var en = env({});
  var ph = [mkPhoto(0, 0x3001, { seed: 3 }), mkPhoto(1, 0x3002, { seed: 4 }), mkPhoto(2, 0x3003, { seed: 5 })];
  var pr = mkProvider({ photos: ph, settings: SETTINGS20, order: order12([2, 0, 1]), deletes: [7, 9] });
  startSync(en, pr);
  waitIdle(function (err) {
    var exp = [MSG.JS_READY, MSG.SETTINGS, MSG.ALBUM_ORDER, MSG.ALBUM_DELETE, MSG.ALBUM_DELETE, MSG.SYNC_REQUEST]
      .concat(photoSeq(9)).concat(photoSeq(9)).concat(photoSeq(9)).concat([MSG.SYNC_DONE]);
    check(!err, 'sync terminata');
    eq(en.watch.received.join(','), exp.join(','), 'ordine SETTINGS ORDER DELETE* SYNC_REQUEST ... SYNC_DONE');
    eq(en.watch.settings.slice(0, 18).join(','), SETTINGS20.slice(0, 18).join(','), 'settings applicate');
    eq(en.watch.order.join(','), '2,0,1', 'ordine applicato');
    bytesEq(en.watch.buffers[0], ph[0]._expected, 'byte slot 0');
    bytesEq(en.watch.buffers[1], ph[1]._expected, 'byte slot 1');
    bytesEq(en.watch.buffers[2], ph[2]._expected, 'byte slot 2');
    eq(show(pr.summaries[0]), show({ photosOk: 3, photosFailed: 0, settings: 'OK', order: 'OK', deletes: ['7:OK', '9:OK'], photoCodes: [] }), 'summary');
    eq(pr.results.length, 3, 'tre onPhotoResult');
    checkInFlight(en, 1);
    next();
  });
});

testcase('1d felice: flint (fmt 2, chunk 3072 -> un solo PHOTO_DATA)', function (next) {
  var en = env({ format: 2 });
  var photo = mkPhoto(4, 0x4001, { fmt: 2 });
  var pr = mkProvider({ photos: [photo] });
  var chunks = [];
  eq(en.watch.maxChunk, 3072, 'chunk di default su flint');
  startSync(en, pr, { beforeData: function (p, off, n) { chunks.push(off + ':' + n); return undefined; } });
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(en.watch.received.join(','), [MSG.JS_READY, MSG.SYNC_REQUEST].concat(photoSeq(1)).concat([MSG.SYNC_DONE]).join(','),
       'un solo PHOTO_DATA');
    eq(photo.length, 3024, 'lunghezza raw1');
    eq(chunks.join(' '), '0:3024', 'chunk unico limitato alla lunghezza della foto, non a MAX_CHUNK');
    bytesEq(en.watch.buffers[4], photo._expected, 'byte slot 4');
    eq(pr.hellos[0].format, 2, 'HELLO.FORMAT = 2');
    eq(pr.hellos[0].maxChunk, 3072, 'HELLO.MAX_CHUNK = 3072');
    eq(pr.summaries[0].photosOk, 1, 'photosOk');
    checkInFlight(en, 1);
    next();
  });
});

testcase('1e SYNC_READY rinegozia MAX_CHUNK (4096 -> 2048)', function (next) {
  var en = env({});
  var photo = mkPhoto(0, 0x4002, { seed: 36 });
  var pr = mkProvider(function (hello) {
    eq(hello.maxChunk, 4096, 'HELLO annuncia 4096');
    en.watch.maxChunk = 2048;                    /* il chunk cala fra HELLO e SYNC_READY */
    return { photos: [photo] };
  });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(hasLog(en, /SYNC_READY chunk=2048/), 'il motore adotta il chunk rinegoziato');
    eq(count(en.watch.received, MSG.PHOTO_DATA), 17, '17 PHOTO_DATA da 2048 (16 x 2048 + 1432)');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 1, 'nessuna ripartenza per chunk troppo grandi');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

/* ---- 3. hooks.beforeData ------------------------------------------------------------------ */

testcase('3a hook skip -> SEQ_ERR -> PHOTO_BEGIN{OFFSET} -> ripresa', function (next) {
  var en = env({});
  var photo = mkPhoto(0, 0x5001, {});
  var pr = mkProvider({ photos: [photo] });
  var skipped = false;
  startSync(en, pr, {
    beforeData: function (p, off, n) {
      if (off === 4096 && !skipped) { skipped = true; return 'skip'; }
      return undefined;
    }
  });
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(skipped, 'hook skip attivato');
    eq(pr.summaries[0].photosOk, 1, 'foto OK nonostante il salto');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 2, 'un secondo PHOTO_BEGIN per la ripresa');
    check(hasLog(en, /SEQ_ERR durante i dati: riprendo da 4096/), 'log della ripresa da 4096');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri (nessun chunk duplicato/mancante)');
    eq(en.watch.slots[0].crc, crc.crc32(photo._expected), 'CRC sull\'orologio');
    /* 4 chunk spediti prima della ripartenza (0 accettato, 3 SEQ_ERR) + 8 dopo */
    eq(count(en.watch.received, MSG.PHOTO_DATA), 12, 'PHOTO_DATA totali');
    checkInFlight(en, 2);
    next();
  });
});

testcase('3b hook dup -> duplicato ignorato dall\'orologio', function (next) {
  var en = env({});
  var photo = mkPhoto(3, 0x5002, { seed: 6 });
  var pr = mkProvider({ photos: [photo] });
  var duped = false;
  startSync(en, pr, {
    beforeData: function (p, off, n) {
      if (off === 8192 && !duped) { duped = true; return 'dup'; }
      return undefined;
    }
  });
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(duped, 'hook dup attivato');
    eq(count(en.watch.received, MSG.PHOTO_DATA), 10, '10 PHOTO_DATA (9 + 1 duplicato)');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 1, 'nessuna ripartenza');
    check(hasLog(en, /duplicato off=8192 ignorato/), 'l\'orologio ha ignorato il duplicato');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[3], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('3c hook stop + watch.idle() -> silenzio -> watchdog -> HELLO riparte', function (next) {
  var en = env({ watchdogMs: 1500 });
  var ph = [mkPhoto(0, 0x5003, { seed: 7 }), mkPhoto(1, 0x5004, { seed: 8 })];
  var pr = mkProvider({ photos: ph });
  var stopped = 0, nAtStop = 0;
  startSync(en, pr, {
    beforeData: function (p, off, n) {
      if (off === 8192 && !stopped) {
        stopped = 1;
        en.watch.idle();                       /* 30 s di silenzio sull'orologio */
        nAtStop = en.watch.received.length;
        return 'stop';
      }
      return undefined;
    }
  });
  waitIdle(function (err) {
    check(!err, 'sync chiusa dal watchdog');
    check(stopped === 1, 'hook stop attivato');
    eq(en.watch.received.length, nAtStop, 'nessun messaggio dopo lo stop');
    eq(sync.isRunning(), false, 'motore fermo');
    eq(pr.summaries.length, 1, 'onDone chiamato');
    eq(pr.summaries[0].error, 'watchdog', 'summary.error');
    eq(pr.summaries[0].photosFailed, 2, 'le 2 foto rimaste risultano fallite');
    eq(pr.summaries[0].photosOk, 0, 'nessuna foto OK');
    check(hasLog(en, /nessun evento per 1500 ms/), 'log del watchdog');
    /* dopo il watchdog un HELLO nuovo fa ripartire tutto */
    sync.setHooks({});
    en.pebble.fire('appmessage', { payload: en.watch._hello() });
    waitIdle(function (err2) {
      check(!err2, 'seconda sync terminata');
      eq(pr.planCalls, 2, 'un secondo piano dopo il watchdog');
      eq(pr.summaries[1].photosOk, 2, 'le 2 foto arrivano alla ripartenza');
      bytesEq(en.watch.buffers[0], ph[0]._expected, 'byte slot 0');
      bytesEq(en.watch.buffers[1], ph[1]._expected, 'byte slot 1');
      next();
    });
  }, { timeout: 6000, grace: 800 });
});

/* ---- 4. CRC_ERR --------------------------------------------------------------------------- */

testcase('4 CRC dichiarato sbagliato -> CRC_ERR x2 -> foto fallita, la successiva parte', function (next) {
  var en = env({});
  var bad = variant(RAW6, 9);
  var p0 = mkPhoto(0, 0x6001, { bytes: bad, crc: (crc.crc32(bad) ^ 0x12345678) | 0 });
  var p1 = mkPhoto(2, 0x6002, { seed: 10 });
  var pr = mkProvider({ photos: [p0, p1] });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.PHOTO_END), 3, '2 END per la foto rifiutata + 1 per la seconda');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 3, '2 BEGIN per la prima (una ripetizione da 0) + 1');
    check(hasLog(en, /CRC_ERR: ripeto la foto da 0/), 'una sola ripetizione');
    eq(pr.summaries[0].photosFailed, 1, 'photosFailed');
    eq(pr.summaries[0].photosOk, 1, 'photosOk');
    eq(show(pr.results), show([{ slot: 0, ok: false, code: 'CRC_ERR' }, { slot: 2, ok: true, code: 'OK' }]), 'onPhotoResult');
    eq(show(pr.summaries[0].photoCodes), show(['0:CRC_ERR']), 'summary.photoCodes (F9)');
    eq(pr.summaries[0].error, undefined, 'una foto fallita non e\' un errore di sync');
    eq(en.watch.slots[0].state, 0, 'lo slot rifiutato resta vuoto');
    bytesEq(en.watch.buffers[2], p1._expected, 'la foto successiva e\' arrivata');
    checkInFlight(en, 1);
    next();
  });
});

testcase('4b formato diverso da quello dell\'orologio -> BAD_FORMAT, foto scartata', function (next) {
  var en = env({});
  var p0 = mkPhoto(0, 0xF001, { fmt: 2 });                 /* raw1 su un orologio raw6 */
  var p1 = mkPhoto(1, 0xF002, { seed: 37 });
  var pr = mkProvider({ photos: [p0, p1] });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 2, 'un BEGIN per foto, nessuna ripetizione');
    eq(count(en.watch.received, MSG.PHOTO_DATA), 9, 'nessun dato per la foto scartata');
    eq(show(pr.results[0]), show({ slot: 0, ok: false, code: 'BAD_FORMAT' }), 'esito della prima foto');
    eq(pr.summaries[0].photosFailed, 1, 'photosFailed');
    eq(pr.summaries[0].photosOk, 1, 'photosOk');
    eq(show(pr.summaries[0].photoCodes), show(['0:BAD_FORMAT']), 'summary.photoCodes (F9)');
    bytesEq(en.watch.buffers[1], p1._expected, 'la seconda foto e\' arrivata');
    checkInFlight(en, 1);
    next();
  });
});

testcase('4c NO_SPACE sul PHOTO_END -> foto scartata senza ripetizioni', function (next) {
  var en = env({});
  var p0 = mkPhoto(0, 0xF003, { seed: 38 });
  var p1 = mkPhoto(1, 0xF004, { seed: 39 });
  var pr = mkProvider({ photos: [p0, p1] });
  var once = true, orig = en.watch.handle;
  en.watch.handle = function (d) {
    if (once && (d[keys.MSG] | 0) === MSG.PHOTO_END) {
      once = false; this.pending = null; this.received.push(MSG.PHOTO_END);
      return [statusDict(CODE.NO_SPACE, 0, 0)];
    }
    return orig.call(this, d);
  };
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(show(pr.results[0]), show({ slot: 0, ok: false, code: 'NO_SPACE' }), 'esito della prima foto');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 2, 'nessuna ripetizione della foto scartata');
    eq(pr.summaries[0].photosOk, 1, 'la seconda foto arriva');
    eq(show(pr.summaries[0].photoCodes), show(['0:NO_SPACE']), 'summary.photoCodes (F9)');
    checkInFlight(en, 1);
    next();
  });
});

/* ---- 5. STATUS persi ---------------------------------------------------------------------- */

testcase('5a STATUS del PHOTO_BEGIN perso -> rinvio -> OK', function (next) {
  var en = env({ statusTimeoutMs: 150 });
  var photo = mkPhoto(0, 0x7001, {});
  var pr = mkProvider({ photos: [photo] });
  dropReplyTo(en, MSG.PHOTO_BEGIN, 1);
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 2, 'PHOTO_BEGIN rinviato una volta');
    check(hasLog(en, /nessuno STATUS entro 150 ms: rinvio \(1\/2\)/), 'log del rinvio');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('5b STATUS del PHOTO_END perso -> rinvio -> OK{LENGTH} idempotente', function (next) {
  var en = env({ statusTimeoutMs: 150 });
  var photo = mkPhoto(1, 0x7002, { seed: 11 });
  var pr = mkProvider({ photos: [photo] });
  dropReplyTo(en, MSG.PHOTO_END, 1);
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.PHOTO_END), 2, 'PHOTO_END rinviato una volta');
    eq(count(en.watch.received, MSG.PHOTO_DATA), 9, 'nessun dato ritrasmesso');
    eq(en.watch.slots[1].generation, 1, 'un solo commit (risposta idempotente)');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[1], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('5c STATUS di SETTINGS / ORDER / DELETE persi -> rinvio -> OK', function (next) {
  var en = env({ statusTimeoutMs: 150 });
  var pr = mkProvider({ photos: [], settings: SETTINGS20, order: order12([1, 0]), deletes: [4] });
  dropReplyTo(en, MSG.SETTINGS, 1);
  dropReplyTo(en, MSG.ALBUM_ORDER, 1);
  dropReplyTo(en, MSG.ALBUM_DELETE, 1);
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.SETTINGS), 2, 'SETTINGS rinviato');
    eq(count(en.watch.received, MSG.ALBUM_ORDER), 2, 'ALBUM_ORDER rinviato');
    eq(count(en.watch.received, MSG.ALBUM_DELETE), 2, 'ALBUM_DELETE rinviato');
    eq(show(pr.summaries[0]), show({ photosOk: 0, photosFailed: 0, settings: 'OK', order: 'OK', deletes: ['4:OK'], photoCodes: [] }), 'summary');
    eq(en.watch.order.join(','), '1,0', 'ordine applicato');
    checkInFlight(en, 1);
    next();
  });
});

testcase('5d 3 STATUS di SETTINGS persi di fila (> STATUS_RESENDS) -> send failed: sync abbandonata (S5b), foto non tentata', function (next) {
  var en = env({ statusTimeoutMs: 100 });
  var photo = mkPhoto(0, 0x7004, { seed: 12 });
  var pr = mkProvider({ photos: [photo], settings: SETTINGS20 });
  dropReplyTo(en, MSG.SETTINGS, 3);                 /* invio + 2 rinvii tutti senza risposta */
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata comunque');
    eq(count(en.watch.received, MSG.SETTINGS), 3, 'SETTINGS inviato 3 volte (1 + 2 rinvii)');
    eq(pr.summaries[0].settings, 'send failed', 'esito SETTINGS');
    check(hasLog(en, /nessuno STATUS dopo 2 rinvii: abbandono/), 'log dell\'abbandono');
    eq(pr.summaries[0].error, 'send failed', 'summary.error: la sync si chiude (index.js ritenta)');
    eq(pr.summaries[0].photosOk, 0, 'la foto non viene tentata');
    eq(pr.summaries[0].photosFailed, 1, 'la foto è contata come fallita');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 0, 'nessun PHOTO_BEGIN');
    eq(sync.isRunning(), false, 'motore fermo');
    checkInFlight(en, 1);
    next();
  });
});

testcase('5e 3 STATUS del PHOTO_BEGIN persi -> l\'orologio non risponde: sync abbandonata (S5b), foto rimaste fallite', function (next) {
  var en = env({ statusTimeoutMs: 100 });
  var p0 = mkPhoto(0, 0x7005, { seed: 13 });
  var p1 = mkPhoto(1, 0x7006, { seed: 14 });
  var pr = mkProvider({ photos: [p0, p1] });
  dropReplyTo(en, MSG.PHOTO_BEGIN, 3);
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 3, '3 BEGIN (1 + 2 rinvii) e basta: la seconda foto non viene tentata');
    eq(pr.summaries[0].photosFailed, 2, 'entrambe le foto contate come fallite');
    eq(pr.summaries[0].photosOk, 0, 'nessuna foto OK');
    eq(pr.summaries[0].error, 'send failed', 'summary.error = send failed (index.js ritenta più tardi)');
    eq(show(pr.results[0]), show({ slot: 0, ok: false, code: 'send failed' }), 'esito della prima foto');
    eq(show(pr.summaries[0].photoCodes), show([]), 'sync abbandonata: nessuna voce in photoCodes (solo error)');
    eq(en.watch.buffers[1], null, 'la seconda foto non è arrivata');
    eq(count(en.watch.received, MSG.SYNC_DONE), 0, 'nessun SYNC_DONE (la sync è abbandonata)');
    eq(sync.isRunning(), false, 'motore fermo');
    checkInFlight(en, 1);
    next();
  });
});

testcase('5f SYNC_READY perso -> SYNC_REQUEST rinviata', function (next) {
  var en = env({ statusTimeoutMs: 150 });
  var photo = mkPhoto(0, 0x7007, { seed: 15 });
  var pr = mkProvider({ photos: [photo] });
  dropReplyTo(en, MSG.SYNC_REQUEST, 1);
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.SYNC_REQUEST), 2, 'SYNC_REQUEST rinviata');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('5g SYNC_READY perso + rinvio NACKato fino in fondo -> sync chiusa, nessuna attesa stantia dopo la fine (F7)', function (next) {
  /* Il rinvio della SYNC_REQUEST fallisce dopo il backoff: l'onFail del rinvio (armStatusTimer) chiude la
   * sync con 'send failed'. Prima di F7 gestore e messaggio da rinviare sopravvivevano a finish(): uno
   * STATUS tardivo con REPLY_TO 3 richiamava il gestore stantio (secondo onDone, o riarmo del timer e
   * SYNC_REQUEST spuria fuori da una sync). Ora finish() chiama cancelWait(): fuori da una sync ogni
   * STATUS e' "inatteso". */
  var en = env({ statusTimeoutMs: 100, backoffMs: [10, 10, 10] });
  var photo = mkPhoto(0, 0x7008, { seed: 62 });
  var pr = mkProvider({ photos: [photo] });
  var first = true, orig = en.watch.handle;
  en.watch.handle = function (d) {
    /* la risposta alla prima SYNC_REQUEST si perde; il rinvio (1 invio + 3 backoff) viene NACKato */
    if ((d[keys.MSG] | 0) === MSG.SYNC_REQUEST && first) { first = false; this.dropStatus++; en.pebble.nackNext = 4; }
    return orig.call(this, d);
  };
  startSync(en, pr);
  waitIdle(function (err) {
    var fineAt, after;
    check(!err, 'sync terminata');
    eq(pr.summaries.length, 1, 'un onDone');
    eq(summary(pr, 0).error, 'send failed', 'summary.error = send failed (rinvio della SYNC_REQUEST fallito)');
    eq(summary(pr, 0).photosFailed, 1, 'la foto risulta fallita');
    eq(count(en.watch.received, MSG.SYNC_REQUEST), 1, 'l\'orologio ha ricevuto UNA SYNC_REQUEST (i 4 tentativi del rinvio sono NACK: non gli arrivano)');
    eq(outbox(en, MSG.SYNC_REQUEST).length, 5, '5 SYNC_REQUEST in uscita: 1 + rinvio con 3 backoff');
    check(hasLog(en, /nessuno STATUS entro 100 ms: rinvio \(1\/2\)/), 'log del rinvio');
    check(hasLog(en, /invio fallito definitivamente/), 'backoff esaurito sul rinvio');
    eq(sync.isRunning(), false, 'motore fermo');
    checkNoTimers('nessun timer vivo dopo la fine');
    fineAt = lastLogIndex(en, /^\[sync\] fine:/);
    check(fineAt >= 0, 'riga "[sync] fine:" presente');
    /* STATUS tardivi DOPO la fine: risposta a un altro messaggio (REPLY_TO 5) e due con REPLY_TO 3 (il
     * primo prima di F7 produceva un secondo onDone, il secondo un riarmo del timer fuori sync) */
    en.pebble.fire('appmessage', { payload: statusDict(CODE.OK, 0, 0, MSG.PHOTO_BEGIN) });
    en.pebble.fire('appmessage', { payload: statusDict(CODE.NOT_SUPPORTED, 0xFF, 0, MSG.SYNC_REQUEST) });
    en.pebble.fire('appmessage', { payload: statusDict(CODE.OK, 0xFF, 0, MSG.SYNC_REQUEST) });
    after = en.logs.slice(fineAt + 1);
    eq(after.filter(function (l) { return /STATUS inatteso: ignorato/.test(l); }).length, 3, 'i 3 STATUS dopo la fine sono "inattesi"');
    check(!after.some(function (l) { return /mentre attendo MSG 3|non pertinente|SYNC_REQUEST rifiutata/.test(l); }),
          'dopo "[sync] fine:" nessun gestore ne\' attesa stantia (nessun "mentre attendo MSG 3" / "non pertinente")');
    setTimeout(function () {
      eq(pr.summaries.length, 1, 'onDone ancora una volta sola (nessun finish() doppio)');
      eq(outbox(en, MSG.SYNC_REQUEST).length, 5, 'nessuna SYNC_REQUEST spuria dopo la fine');
      eq(sync.isRunning(), false, 'motore ancora fermo');
      checkNoTimers('nessun timer riarmato dagli STATUS tardivi');
      /* un HELLO (il retry di index.js) riparte pulito */
      en.pebble.fire('appmessage', { payload: en.watch._hello() });
      waitIdle(function (err2) {
        check(!err2, 'seconda sync terminata');
        eq(pr.summaries.length, 2, 'un secondo onDone');
        eq(summary(pr, 1).photosOk, 1, 'foto OK alla ripartenza');
        bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
        checkInFlight(en, 1);
        checkNoTimers();
        next();
      });
    }, 350);
  });
});

/* ---- 6. NACK ------------------------------------------------------------------------------ */

testcase('6a un NACK durante i dati -> backoff e ripresa', function (next) {
  var en = env({ backoffMs: [10, 10, 10] });
  var photo = mkPhoto(0, 0x8001, { seed: 16 });
  var pr = mkProvider({ photos: [photo] });
  var armed = false;
  startSync(en, pr, {
    beforeData: function (p, off, n) {
      if (off === 4096 && !armed) { armed = true; en.pebble.nackNext = 1; }
      return undefined;
    }
  });
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(armed, 'NACK armato');
    check(hasLog(en, /invio fallito .*riprovo fra 10 ms \(1\/3\)/), 'log del backoff');
    eq(pr.summaries[0].photosOk, 1, 'foto OK dopo il NACK');
    eq(count(en.watch.received, MSG.PHOTO_DATA), 9, 'nessun chunk perso o duplicato');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('6b NACK oltre BACKOFF_MS.length -> telefono scollegato: sync abbandonata (S5b), nessuna foto successiva', function (next) {
  var en = env({ backoffMs: [10, 10, 10] });
  var p0 = mkPhoto(0, 0x8002, { seed: 17 });
  var p1 = mkPhoto(1, 0x8003, { seed: 18 });
  var pr = mkProvider({ photos: [p0, p1] });
  var armed = false;
  startSync(en, pr, {
    beforeData: function (p, off, n) {
      if (off === 4096 && !armed) { armed = true; en.pebble.nackNext = 4; }   /* 1 + 3 backoff */
      return undefined;
    }
  });
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(hasLog(en, /invio fallito definitivamente/), 'backoff esaurito');
    check(hasLog(en, /sync abbandonata: send failed/), 'sync abbandonata');
    eq(pr.summaries[0].photosFailed, 2, 'entrambe le foto contate come fallite');
    eq(pr.summaries[0].photosOk, 0, 'nessuna foto OK');
    eq(pr.summaries[0].error, 'send failed', 'summary.error');
    eq(show(pr.results[0]), show({ slot: 0, ok: false, code: 'send failed' }), 'esito della prima foto');
    eq(pr.results.length, 1, 'onPhotoResult solo per la foto in corso');
    eq(show(pr.summaries[0].photoCodes), show([]), 'sync abbandonata: nessuna voce in photoCodes (solo error)');
    eq(en.watch.buffers[1], null, 'la seconda foto non è stata tentata');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 1, 'un solo PHOTO_BEGIN');
    checkInFlight(en, 1);
    next();
  });
});

testcase('6c NACK sul JS_READY iniziale -> log, nessun crash, resync riparte', function (next) {
  var en = env({ backoffMs: [10, 10, 10] });
  var photo = mkPhoto(0, 0x8004, { seed: 19 });
  var pr = mkProvider({ photos: [photo] });
  en.pebble.nackNext = 4;                        /* invio + 3 backoff: JS_READY non consegnato */
  startSync(en, pr);
  setTimeout(function () {
    eq(en.watch.received.length, 0, 'l\'orologio non ha ricevuto nulla');
    eq(pr.planCalls, 0, 'nessun piano');
    eq(sync.isRunning(), false, 'motore fermo');
    check(hasLog(en, /JS_READY non consegnato/), 'log del JS_READY perso');
    sync.resync();
    waitIdle(function (err) {
      check(!err, 'sync terminata dopo la resync');
      eq(pr.planCalls, 1, 'un piano dopo la resync');
      eq(pr.summaries[0].photosOk, 1, 'foto OK');
      checkInFlight(en, 1);
      next();
    });
  }, 200);
});

/* ---- 7. BUSY ------------------------------------------------------------------------------ */

testcase('7 BUSY durante i dati -> nuova SYNC_REQUEST -> ripresa da 0', function (next) {
  var en = env({});
  var photo = mkPhoto(0, 0x9001, { seed: 20 });
  var pr = mkProvider({ photos: [photo] });
  var idled = false;
  startSync(en, pr, {
    beforeData: function (p, off, n) {
      if (off === 8192 && !idled) { idled = true; en.watch.idle(); }   /* orologio tornato IDLE */
      return undefined;
    }
  });
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(idled, 'orologio messo in IDLE');
    check(hasLog(en, /BUSY durante i dati/), 'log del BUSY');
    eq(count(en.watch.received, MSG.SYNC_REQUEST), 2, 'una seconda SYNC_REQUEST');
    eq(show(syncRequests(en)), show([{ count: 1, offset: 0 }, { count: 1, offset: 0 }]), 'SYNC_REQUEST{COUNT 1, OFFSET 0} entrambe (nessuna foto conclusa, F3)');
    check(count(en.watch.received, MSG.PHOTO_BEGIN) >= 2, 'almeno un secondo PHOTO_BEGIN');
    check(hasLog(en, /STATUS OK slot=0 offset=0/), 'l\'orologio riparte da 0 (pending perso)');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri dopo la ripresa');
    eq(en.watch.slots[0].crc, crc.crc32(photo._expected), 'CRC sull\'orologio');
    checkInFlight(en, 2);
    next();
  });
});

testcase('7b BUSY sul PHOTO_BEGIN -> nuova SYNC_REQUEST -> foto OK', function (next) {
  var en = env({});
  var photo = mkPhoto(0, 0x9002, { seed: 40 });
  var pr = mkProvider({ photos: [photo] });
  var once = true, orig = en.watch.handle;
  en.watch.handle = function (d) {
    if (once && (d[keys.MSG] | 0) === MSG.PHOTO_BEGIN) { once = false; this.idle(); }
    return orig.call(this, d);
  };
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(hasLog(en, /PHOTO_BEGIN: orologio BUSY \(IDLE\?\): rinnovo la SYNC_REQUEST/), 'log del BUSY sul BEGIN');
    eq(count(en.watch.received, MSG.SYNC_REQUEST), 2, 'una seconda SYNC_REQUEST');
    eq(show(syncRequests(en)), show([{ count: 1, offset: 0 }, { count: 1, offset: 0 }]), 'SYNC_REQUEST{COUNT 1, OFFSET 0} entrambe (F3)');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 2, 'un secondo PHOTO_BEGIN');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('7e BUSY sul PHOTO_BEGIN -> SYNC_REQUEST di ripresa NACKata fino in fondo -> sync chiusa (send failed), foto NON scartata', function (next) {
  /* Revisione 29/08: l'invio fallito della SYNC_REQUEST di ripresa e' un guasto di collegamento come
   * ogni altro (abortSync → summary.error 'send failed' → retry lungo di index.js), non un esito per
   * foto: prima finiva in photoCodes come '0:send failed' senza error e index.js non ritentava. */
  var en = env({});
  var photo = mkPhoto(0, 0x9005, { seed: 45 });
  var pr = mkProvider({ photos: [photo] });
  var once = true, orig = en.watch.handle;
  en.watch.handle = function (d) {
    if (once && (d[keys.MSG] | 0) === MSG.PHOTO_BEGIN) { once = false; this.idle(); en.pebble.nackNext = 1000; }
    return orig.call(this, d);
  };
  startSync(en, pr);
  waitIdle(function (err) {
    var sm = pr.summaries[0] || {};
    check(!err, 'sync terminata');
    check(hasLog(en, /PHOTO_BEGIN: orologio BUSY \(IDLE\?\): rinnovo la SYNC_REQUEST/), 'log del BUSY sul BEGIN');
    check(hasLog(en, /invio fallito definitivamente/), 'SYNC_REQUEST di ripresa non consegnata');
    check(hasLog(en, /sync abbandonata: send failed/), 'la sync si chiude (abortSync), non scarta la foto');
    eq(sm.error, 'send failed', 'summary.error = send failed (classe link per index.js)');
    eq(show(sm.photoCodes), show([]), 'nessun codice per foto (niente "0:send failed")');
    eq(sm.photosFailed, 1, 'la foto conta come non inviata');
    eq(count(en.watch.received, MSG.SYNC_REQUEST), 1, 'la seconda SYNC_REQUEST non e\' mai arrivata');
    eq(en.watch.slots[0].state, 0, 'slot 0 vuoto');
    eq(pr.summaries.length, 1, 'un solo onDone');
    /* riconnessione: la resync riparte pulita e la foto arriva */
    en.pebble.nackNext = 0;
    sync.resync();
    waitIdle(function (err2) {
      check(!err2, 'seconda sync terminata');
      eq(pr.summaries.length, 2, 'secondo onDone');
      eq((pr.summaries[1] || {}).photosOk, 1, 'foto OK alla ripresa');
      bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
      next();
    });
  });
});

testcase('7c BUSY sempre -> dopo BUSY_RETRIES la foto viene scartata', function (next) {
  var en = env({ busyRetries: 2 });
  var p0 = mkPhoto(0, 0x9003, { seed: 41 });
  var p1 = mkPhoto(1, 0x9004, { seed: 42 });
  var pr = mkProvider({ photos: [p0, p1] });
  var orig = en.watch.handle, nBusy = 0;
  en.watch.handle = function (d) {
    if ((d[keys.MSG] | 0) === MSG.PHOTO_BEGIN && (u8(d[keys.SLOT])) === 0) { nBusy++; this.idle(); }
    return orig.call(this, d);
  };
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(nBusy, 3, '3 PHOTO_BEGIN per lo slot 0 (busyRetries 2)');
    eq(show(pr.results[0]), show({ slot: 0, ok: false, code: 'BUSY' }), 'esito della prima foto');
    eq(pr.summaries[0].photosFailed, 1, 'photosFailed');
    eq(pr.summaries[0].photosOk, 1, 'la seconda foto arriva');
    eq(show(pr.summaries[0].photoCodes), show(['0:BUSY']), 'summary.photoCodes (F9)');
    bytesEq(en.watch.buffers[1], p1._expected, 'byte della seconda foto');
    /* F3: 1 + 2 rinnovi per lo slot 0 (OFFSET 0) + 1 rinnovo per lo slot 1 con OFFSET 1 (una foto conclusa,
     * anche se fallita): l'orologio annuncia la seconda foto come 2/2, non 1/2 */
    eq(syncRequests(en).map(function (r) { return r.offset; }).join(','), '0,0,0,1', 'OFFSET delle 4 SYNC_REQUEST');
    eq(progressSeq(en).split(' ').slice(-3).join(' '), '1/2 2/2 0/0', 'la seconda foto e\' annunciata come 2/2');
    checkInFlight(en, 2);
    next();
  });
});

testcase('7d BUSY a meta\' album (IDLE durante la 2a di 3 foto) -> SYNC_REQUEST{OFFSET 1}: "Foto k/n" riprende da 2/3 (F3)', function (next) {
  /* Prima di F3 la SYNC_REQUEST di ripresa non portava OFFSET e l'orologio ripartiva da "Foto 1/3" per
   * la seconda foto. Ora porta OFFSET = photoIndex (foto concluse) e l'orologio finto, con lo stesso clamp
   * di sync_proto.c, riparte da k: 1/3 per il solo round trip della SYNC_REQUEST, poi 2/3 al PHOTO_BEGIN. */
  var en = env({});
  var ph = [mkPhoto(0, 0x9005, { seed: 73 }), mkPhoto(1, 0x9006, { seed: 74 }), mkPhoto(2, 0x9007, { seed: 75 })];
  var pr = mkProvider({ photos: ph });
  var idled = false;
  startSync(en, pr, {
    beforeData: function (p, off, n) {
      if (p.slot === 1 && off === 8192 && !idled) { idled = true; en.watch.idle(); }   /* 30 s di silenzio durante la foto 2 */
      return undefined;
    }
  });
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(idled, 'orologio messo in IDLE durante la seconda foto');
    check(hasLog(en, /BUSY durante i dati: rinnovo la SYNC_REQUEST/), 'log del BUSY');
    eq(show(syncRequests(en)), show([{ count: 3, offset: 0 }, { count: 3, offset: 1 }]), 'la SYNC_REQUEST di ripresa porta OFFSET 1 = foto gia\' concluse');
    check(hasLog(en, /^\[sync\] SYNC_REQUEST count=3 from=1$/), 'log della ripresa (count=3 from=1)');
    /* 0/3 richiesta, 1/3 2/3 le prime due foto, 0/0 IDLE, 1/3 la ripresa (un round trip), 2/3 3/3, 0/0 SYNC_DONE:
     * dopo la ripresa la seconda foto e' di nuovo 2/3 (senza OFFSET: 0/3 1/3 2/3 0/0) */
    eq(progressSeq(en), '0/3 1/3 2/3 0/0 1/3 2/3 3/3 0/0', 'sequenza "Foto k/n" sull\'orologio');
    eq(summary(pr, 0).photosOk, 3, 'le 3 foto arrivano');
    eq(show(summary(pr, 0).photoCodes), show([]), 'nessuna foto fallita');
    bytesEq(en.watch.buffers[0], ph[0]._expected, 'byte slot 0');
    bytesEq(en.watch.buffers[1], ph[1]._expected, 'byte slot 1 (ripresa da 0 dopo il BUSY)');
    bytesEq(en.watch.buffers[2], ph[2]._expected, 'byte slot 2');
    checkInFlight(en, 2);
    checkNoTimers();
    next();
  });
});

testcase('7f clamp OFFSET >= COUNT sull\'orologio finto (parita\' con sync_proto.c prv_sync_request)', function (next) {
  /* Il MOTORE REALE non puo' produrre OFFSET >= COUNT: requestSync (src/pkjs/sync.js) manda
   * COUNT = s.photos.length e OFFSET = s.photoIndex, viene chiamata solo con almeno una foto in piano
   * (runPlan) e s.photoIndex resta < s.photos.length (la ripresa dopo un BUSY riguarda la foto
   * corrente; photoIndex avanza solo in photoDone/photoFailed, che chiamano subito nextPhoto).
   * L'invariante e' controllata su tutta la suite (g_syncReqBad, caso "2 invariante"). Il ramo del
   * clamp di shim/fakewatch.js si esercita quindi costruendo il dizionario a mano contro il finto,
   * come fa test_sync_proto.c per la versione C (che cerca "clamp"). */
  var en = env({});
  var w = en.watch;

  /* Manda SYNC_REQUEST{COUNT, OFFSET} direttamente all'orologio finto e ritorna la sequenza "Foto k/n"
   * prodotta da quella sola richiesta. */
  function request(count, offset) {
    var d = {}, out;
    d[keys.MSG] = MSG.SYNC_REQUEST;
    if (count !== undefined) { d[keys.COUNT] = count; }
    if (offset !== undefined) { d[keys.OFFSET] = offset; }
    w.progress = [];
    out = w.handle(d);
    eq(out.length, 1, 'una risposta a SYNC_REQUEST(count ' + count + ', offset ' + offset + ')');
    eq(inField(out[0], 'MSG'), MSG.SYNC_READY, 'risposta SYNC_READY (count ' + count + ', offset ' + offset + ')');
    eq(w.state, 'SYNCING', 'orologio in SYNCING (count ' + count + ', offset ' + offset + ')');
    return progressSeq(en);
  }

  eq(request(3, 3), '2/3', 'OFFSET == COUNT -> count - 1');
  eq(request(3, 9), '2/3', 'OFFSET > COUNT -> count - 1');
  eq(request(3, 0xFFFFFFFF), '2/3', 'OFFSET u32 alto (int32 -1 del JS) -> u8 255 -> clamp');
  eq(request(255, 300), '254/255', 'COUNT massimo: u8(300) = 255 >= 255 -> 254');
  eq(request(0, 0), '0/0', 'COUNT 0 con OFFSET 0');
  eq(request(0, 3), '0/0', 'COUNT 0 con OFFSET > 0');
  eq(request(0, undefined), '0/0', 'COUNT 0 senza OFFSET');
  eq(request(3, 0), '0/3', 'OFFSET 0: nessun clamp');
  eq(request(7, 6), '6/7', 'OFFSET = COUNT - 1: nessun clamp');

  /* Dopo il clamp il PHOTO_BEGIN successivo mostra al piu' n/n, mai n+1/n (test_sync_proto.c, "clamp"). */
  eq(request(3, 9), '2/3', 'clamp prima del PHOTO_BEGIN');
  var ph = mkPhoto(4, 0x7F01, { seed: 91 });
  var b = {}, out;
  b[keys.MSG] = MSG.PHOTO_BEGIN; b[keys.SLOT] = ph.slot; b[keys.FORMAT] = ph.format;
  b[keys.LENGTH] = ph.length; b[keys.CRC] = ph.crc; b[keys.OFFSET] = 0; b[keys.PHOTO_ID] = ph.photoId;
  out = w.handle(b);
  eq(out.length, 1, 'STATUS al PHOTO_BEGIN');
  eq(inField(out[0], 'CODE'), CODE.OK, 'PHOTO_BEGIN accettato');
  eq(progressSeq(en), '2/3 3/3', 'dopo il clamp il BEGIN mostra 3/3, mai 4/3');
  checkNoTimers();
  next();
});

/* ---- 8. MAX_CHUNK 0 / NOT_SUPPORTED ------------------------------------------------------- */

testcase('8a MAX_CHUNK 0 -> nessun PHOTO_*, ma SETTINGS/ORDER/DELETE inviati', function (next) {
  var en = env({ maxChunk: 0 });
  var ph = [mkPhoto(0, 0xA001, { seed: 21 }), mkPhoto(1, 0xA002, { seed: 22 })];
  var pr = mkProvider({ photos: ph, settings: SETTINGS20, order: order12([1, 0]), deletes: [6] });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(pr.hellos[0].maxChunk, 0, 'HELLO.MAX_CHUNK = 0');
    eq(en.watch.received.join(','), [MSG.JS_READY, MSG.SETTINGS, MSG.ALBUM_ORDER, MSG.ALBUM_DELETE].join(','),
       'solo JS_READY, SETTINGS, ORDER, DELETE');
    eq(count(en.watch.received, MSG.SYNC_REQUEST), 0, 'nessuna SYNC_REQUEST');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 0, 'nessun PHOTO_BEGIN');
    eq(pr.summaries[0].photosFailed, 2, 'tutte le foto contate come fallite');
    eq(pr.summaries[0].settings, 'OK', 'SETTINGS applicate');
    eq(pr.summaries[0].order, 'OK', 'ORDER applicato');
    check(hasLog(en, /non supporta il trasferimento \(MAX_CHUNK 0\)/), 'log di MAX_CHUNK 0');
    eq(pr.results.length, 2, 'onPhotoResult per ogni foto non inviata (esito uniforme, S5b)');
    eq(show(pr.results[0]), show({ slot: 0, ok: false, code: 'NOT_SUPPORTED' }), 'esito NOT_SUPPORTED');
    eq(pr.summaries[0].error, 'NOT_SUPPORTED', 'summary.error = NOT_SUPPORTED');
    eq(show(pr.summaries[0].photoCodes), show(['0:NOT_SUPPORTED', '1:NOT_SUPPORTED']), 'summary.photoCodes (F9)');
    checkInFlight(en, 1);
    next();
  });
});

testcase('8b SYNC_REQUEST -> NOT_SUPPORTED -> error e fine', function (next) {
  var en = env({});
  var ph = [mkPhoto(0, 0xA003, { seed: 23 }), mkPhoto(1, 0xA004, { seed: 24 })];
  var pr = mkProvider(function (hello) {
    en.watch.albumEnabled = false;               /* l'album si disabilita dopo l'HELLO */
    return { photos: ph };
  });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.SYNC_REQUEST), 1, 'una sola SYNC_REQUEST');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 0, 'nessun PHOTO_BEGIN');
    eq(pr.summaries[0].error, 'NOT_SUPPORTED', 'summary.error');
    eq(pr.summaries[0].photosFailed, 2, 'photosFailed');
    check(hasLog(en, /SYNC_REQUEST rifiutata: NOT_SUPPORTED/), 'log del rifiuto');
    eq(show(pr.summaries[0].photoCodes), show([]), 'SYNC_REQUEST rifiutata: nessuna voce in photoCodes (solo error)');
    checkInFlight(en, 1);
    next();
  });
});

/* ---- 9. HELLO / resync / plan -------------------------------------------------------------- */

testcase('9a HELLO durante una sync -> ignorato (nessun secondo piano)', function (next) {
  var en = env({});
  var photo = mkPhoto(0, 0xB001, { seed: 25 });
  var pr = mkProvider({ photos: [photo] });
  var fired = false;
  startSync(en, pr, {
    beforeData: function (p, off, n) {
      if (off === 4096 && !fired) {
        fired = true;
        en.pebble.fire('appmessage', { payload: en.watch._hello() });
      }
      return undefined;
    }
  });
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(fired, 'HELLO iniettato');
    eq(pr.planCalls, 1, 'un solo piano');
    check(hasLog(en, /HELLO durante una sync: ignorato/), 'log dell\'HELLO ignorato');
    eq(pr.summaries.length, 1, 'un solo onDone');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('9b resync() durante una sync -> nuovo JS_READY e nuovo piano alla fine', function (next) {
  var en = env({});
  var photo = mkPhoto(0, 0xB002, { seed: 26 });
  var pr = mkProvider(function (hello, n) { return (n === 1) ? { photos: [photo] } : {}; });
  var fired = false;
  startSync(en, pr, {
    beforeData: function (p, off, n) {
      if (off === 4096 && !fired) { fired = true; sync.resync(); }
      return undefined;
    }
  });
  waitIdle(function (err) {
    check(!err, 'entrambe le sync terminate');
    check(fired, 'resync chiesta durante la sync');
    check(hasLog(en, /resync durante una sync: rinviata alla fine/), 'log del rinvio');
    check(hasLog(en, /resync rinviata: nuovo JS_READY/), 'log del JS_READY differito');
    eq(pr.planCalls, 2, 'due piani');
    eq(pr.summaries.length, 2, 'due onDone');
    eq(pr.summaries[0].photosOk, 1, 'prima sync: foto OK');
    eq(count(en.watch.received, MSG.JS_READY), 2, 'due JS_READY');
    checkInFlight(en, 1);
    next();
  });
});

testcase('9c resync() a riposo -> JS_READY subito; plan {} -> fine immediata con onDone', function (next) {
  var en = env({});
  var pr = mkProvider({});
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'prima sync (vuota) terminata');
    eq(pr.planCalls, 1, 'un piano');
    eq(show(pr.summaries[0]), show({ photosOk: 0, photosFailed: 0, settings: null, order: null, deletes: [], photoCodes: [] }), 'summary vuoto');
    eq(en.watch.received.join(','), '' + MSG.JS_READY, 'solo JS_READY');
    sync.resync();
    waitIdle(function (err2) {
      check(!err2, 'seconda sync terminata');
      eq(count(en.watch.received, MSG.JS_READY), 2, 'un secondo JS_READY');
      eq(pr.planCalls, 2, 'un secondo piano');
      eq(pr.summaries.length, 2, 'due onDone');
      checkInFlight(en, 1);
      next();
    });
  });
});

testcase('9d provider.plan che lancia -> log, nessuna sync, nessun crash', function (next) {
  var en = env({});
  var boom = 0;
  var pr = mkProvider(function () { boom++; throw new Error('plan rotto'); });
  startSync(en, pr);
  setTimeout(function () {
    eq(boom, 1, 'plan chiamato una volta');
    eq(sync.isRunning(), false, 'motore fermo');
    eq(pr.summaries.length, 0, 'nessun onDone');
    eq(en.watch.received.join(','), '' + MSG.JS_READY, 'solo JS_READY');
    check(hasLog(en, /provider.plan ha lanciato: Error: plan rotto/), 'log dell\'eccezione');
    /* e una resync successiva con un piano buono funziona */
    var photo = mkPhoto(0, 0xB004, { seed: 27 });
    var pr2 = mkProvider({ photos: [photo] });
    sync._reset();
    en.watch.wipe();
    startSync(en, pr2);                           /* stesso Pebble finto: il listener del primo start e' stato staccato (F14) */
    waitIdle(function (err) {
      check(!err, 'sync successiva terminata');
      eq(pr2.summaries[0].photosOk, 1, 'foto OK dopo l\'eccezione');
      eq(pr2.hellos.length, 1, 'un solo HELLO consegnato al piano (un listener)');
      eq(pr2.summaries.length, 1, 'un solo onDone');
      eq(en.logs.filter(function (l) { return /ignorato/.test(l); }).length, 0, 'nessun messaggio consegnato due volte');
      checkInFlight(en, 1);
      next();
    });
  }, 150);
});

testcase('9e start() due volte e onDone che lancia -> nessun crash', function (next) {
  var en = env({});
  var photo = mkPhoto(0, 0xB005, { seed: 43 });
  var pr = mkProvider({ photos: [photo] });
  var thrown = 0;
  pr.onDone = function () { thrown++; throw new Error('onDone rotto'); };
  startSync(en, pr);
  startSync(en, pr);                              /* secondo start: deve essere ignorato */
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.JS_READY), 1, 'un solo JS_READY (start idempotente)');
    eq(pr.planCalls, 1, 'un solo piano (un solo listener appmessage)');
    eq(thrown, 1, 'onDone chiamato una volta');
    check(hasLog(en, /onDone: Error: onDone rotto/), 'eccezione di onDone catturata');
    eq(sync.isRunning(), false, 'motore fermo');
    bytesEq(en.watch.buffers[0], photo._expected, 'foto comunque arrivata');
    checkInFlight(en, 1);
    next();
  });
});

testcase('9f _reset() stacca il listener appmessage: start -> _reset -> start sullo stesso Pebble, un HELLO -> un piano (F14)', function (next) {
  /* Il listener e' la stessa funzione onMessage: impilata due volte, ogni messaggio veniva gestito due
   * volte (HELLO -> piano doppio, STATUS/SYNC_READY -> "ignorato"). */
  var en = env({});
  var pr = mkProvider({});
  var pr2 = mkProvider({});
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'prima sync terminata');
    eq(pr.planCalls, 1, 'un piano per il primo start');
    sync._reset();
    eq(listeners(en), 0, 'nessun listener dopo _reset()');
    startSync(en, pr2);                           /* startSync verifica: un solo listener */
    waitIdle(function (err2) {
      var before = pr2.planCalls;
      check(!err2, 'seconda sync terminata');
      eq(before, 1, 'un piano per il JS_READY del secondo start');
      en.pebble.fire('appmessage', { payload: en.watch._hello() });
      eq(pr2.planCalls - before, 1, 'un HELLO -> un solo piano (nessun listener impilato)');
      eq(listeners(en), 1, 'ancora un solo listener');
      eq(en.logs.filter(function (l) { return /ignorato/.test(l); }).length, 0, 'nessun messaggio consegnato due volte');
      checkNoTimers();
      next();
    });
  });
});

/* ---- 10. caricamento pigro ----------------------------------------------------------------- */

testcase('10a load(cb(err)) -> foto fallita, la successiva OK', function (next) {
  var en = env({});
  var p0 = mkPhoto(0, 0xC001, { loadErr: 'niente rete' });
  var p1 = mkPhoto(1, 0xC002, { seed: 28, lazy: true });
  var pr = mkProvider({ photos: [p0, p1] });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 1, 'nessun PHOTO_BEGIN per la foto non caricata');
    eq(pr.summaries[0].photosFailed, 1, 'photosFailed');
    eq(pr.summaries[0].photosOk, 1, 'photosOk');
    eq(show(pr.results[0]), show({ slot: 0, ok: false, code: 'load: niente rete' }), 'esito della prima foto');
    eq(show(pr.summaries[0].photoCodes), show(['0:load: niente rete']), 'summary.photoCodes (F9)');
    bytesEq(en.watch.buffers[1], p1._expected, 'byte della seconda foto');
    eq(p1.bytes, null, 'byte liberati dopo l\'esito (load presente)');
    checkInFlight(en, 1);
    next();
  });
});

testcase('10b load con bytes di lunghezza sbagliata -> foto fallita', function (next) {
  var en = env({});
  var p0 = mkPhoto(0, 0xC003, { loadBytes: variant(RAW6, 29).slice(0, 34199) });
  var pr = mkProvider({ photos: [p0] });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 0, 'nessun PHOTO_BEGIN');
    eq(pr.summaries[0].photosFailed, 1, 'photosFailed');
    eq(show(pr.results[0]), show({ slot: 0, ok: false, code: 'load: lunghezza 34199' }), 'esito');
    checkInFlight(en, 1);
    next();
  });
});

testcase('10c load asincrono lento (50 ms) + cb doppia -> un solo invio', function (next) {
  var en = env({});
  var p0 = mkPhoto(0, 0xC004, { seed: 30, loadDelay: 50, loadTwice: true });
  var p1 = mkPhoto(1, 0xC005, { seed: 31 });               /* bytes diretti (S5a) */
  var pr = mkProvider({ photos: [p0, p1] });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(p0.loadCalls, 1, 'load chiamato una volta');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 2, 'un BEGIN per foto (nessun doppio invio)');
    eq(count(en.watch.received, MSG.PHOTO_DATA), 18, '9 + 9 PHOTO_DATA');
    eq(pr.summaries[0].photosOk, 2, 'entrambe OK');
    bytesEq(en.watch.buffers[0], p0._expected, 'byte slot 0');
    bytesEq(en.watch.buffers[1], p1._expected, 'byte slot 1 (bytes diretti, S5a)');
    eq(p0.bytes, null, 'byte della foto pigra liberati');
    check(p1.bytes !== null && p1.bytes.length === 34200, 'i bytes diretti restano al chiamante');
    checkInFlight(en, 1);
    next();
  });
});

testcase('10d bytes diretti di lunghezza sbagliata (nessun load) -> "bytes mancanti"', function (next) {
  var en = env({});
  var short = variant(RAW6, 44).slice(0, 34100);
  var p0 = { slot: 0, photoId: 0xC006, format: 1, length: 34200, crc: crc.crc32(short) | 0, bytes: short };
  var p1 = mkPhoto(1, 0xC007, { seed: 45 });
  var pr = mkProvider({ photos: [p0, p1] });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 1, 'nessun BEGIN per la foto senza byte');
    eq(show(pr.results[0]), show({ slot: 0, ok: false, code: 'bytes mancanti' }), 'esito della prima foto');
    eq(pr.summaries[0].photosFailed, 1, 'photosFailed');
    eq(pr.summaries[0].photosOk, 1, 'photosOk');
    check(p0.bytes !== null, 'i bytes diretti non vengono azzerati');
    checkInFlight(en, 1);
    next();
  });
});

/* ---- 11. parseSlots / parseHello ----------------------------------------------------------- */

testcase('11 parseSlots e parseHello (settingsCrc, PROTO)', function (next) {
  var en = env({});
  var slots, arr, k;
  /* parseSlots diretto */
  eq(sync.parseSlots(null).length, 0, 'parseSlots(null)');
  eq(sync.parseSlots(undefined).length, 0, 'parseSlots(undefined)');
  eq(sync.parseSlots([]).length, 0, 'parseSlots([])');
  eq(sync.parseSlots([1, 2, 3]).length, 0, 'parseSlots di un array corto (< 5 B)');
  eq(sync.parseSlots([1, 2, 3, 4, 5, 6]).length, 1, 'parseSlots di 6 B -> 1 slot');
  arr = [1, 0xFF, 0xFF, 0xFF, 0xFF, 0, 0x78, 0x56, 0x34, 0x12];
  slots = sync.parseSlots(arr);
  eq(slots.length, 2, 'parseSlots di 10 B -> 2 slot');
  eq(slots[0].state, 1, 'state del primo slot');
  eq(slots[0].crc, 0xFFFFFFFF, 'CRC senza segno (0xFFFFFFFF)');
  eq(slots[1].state, 0, 'state del secondo slot');
  eq(slots[1].crc, 0x12345678, 'CRC little endian');
  /* parseHello attraverso il provider */
  en.watch.slots[2].state = 1; en.watch.slots[2].crc = 0xDEADBEEF;
  var pr = mkProvider({});
  startSync(en, pr);
  waitIdle(function (err) {
    var h = pr.hellos[0];
    check(!err, 'sync terminata');
    eq(h.proto, 1, 'hello.proto');
    eq(h.format, 1, 'hello.format');
    eq(h.maxChunk, 4096, 'hello.maxChunk');
    eq(h.slots.length, 12, '12 slot');
    eq(h.slots[2].crc, 0xDEADBEEF, 'CRC dello slot 2 senza segno');
    eq(h.settingsCrc, en.watch.settingsCrc(), 'settingsCrc presente');
    check(h.settingsCrc >= 0 && h.settingsCrc <= 65535, 'settingsCrc in 0..65535');
    /* HELLO senza il campo CRC (orologio vecchio) -> null */
    sync._reset();
    en.watch.noSettingsCrc = true;
    var pr2 = mkProvider({});
    startSync(en, pr2);
    waitIdle(function (err2) {
      check(!err2, 'seconda sync terminata');
      eq(pr2.hellos[0].settingsCrc, null, 'settingsCrc assente -> null');
      eq(pr2.hellos.length, 1, 'un solo HELLO per un JS_READY (un listener, F14)');
      eq(pr2.summaries.length, 1, 'una sola sync per un JS_READY');
      /* HELLO con CRC oltre i 16 bit: deve essere troncato a 0..65535 */
      sync._reset();
      en.watch.noSettingsCrc = false;
      var prc = mkProvider({});
      startSync(en, prc);
      var hi = en.watch._hello(); hi[keys.CRC] = 0x1FFF0;
      en.pebble.fire('appmessage', { payload: hi });
      eq(prc.hellos.length, 1, 'un solo HELLO per un fire (un listener, F14)');
      eq(prc.hellos[prc.hellos.length - 1].settingsCrc, 0xFFF0, 'settingsCrc mascherato a 16 bit');
      /* PROTO diverso -> nessun piano */
      sync._reset();
      var orig = en.watch._hello;
      en.watch._hello = function () { var d = orig.call(this); d[keys.PROTO] = 2; return d; };
      var pr3 = mkProvider({});
      startSync(en, pr3);
      setTimeout(function () {
        eq(pr3.planCalls, 0, 'PROTO 2: nessun piano');
        eq(sync.isRunning(), false, 'motore fermo');
        check(hasLog(en, /protocollo 2 non supportato/), 'log del protocollo non supportato');
        /* due HELLO con PROTO 2 (quello del JS_READY di prc, ancora in volo al _reset, e quello di pr3), un listener */
        eq(en.logs.filter(function (l) { return /non supportato/.test(l); }).length, 2, 'log "non supportato" 2 volte (non 8: nessun listener impilato)');
        eq(pr3.readyFailed.length, 0, 'PROTO diverso: l\'HELLO e\' arrivato, nessun onReadyFailed');
        checkNoTimers();
        next();
      }, 120);
    });
  });
});

/* ---- 11b. OPEN_MS (v1.9, perf 04/09) ------------------------------------------------------- */

testcase('11b parseHello: OPEN_MS (0, valore, oltre 16 bit, assente)', function (next) {
  var en = env({}), pr = mkProvider({});
  eq(en.watch.openMs, 0, 'fakewatch: OPEN_MS 0 di default (file persist sano)');
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(pr.hellos[0].openMs, 0, 'hello.openMs 0 (misurato e trascurabile)');
    /* orologio con il file persist gonfio */
    sync._reset();
    var en2 = env({}), pr2 = mkProvider({});
    en2.watch.openMs = 2150;
    startSync(en2, pr2);
    waitIdle(function (err2) {
      check(!err2, 'seconda sync terminata');
      eq(pr2.hellos[0].openMs, 2150, 'hello.openMs = OPEN_MS del HELLO');
      check(hasLog(en2, /HELLO .*open=2150ms/), 'log del HELLO con open=2150ms');
      /* valore oltre i 16 bit (runtime che consegna un int32): mascherato */
      sync._reset();
      var en3 = env({}), pr3 = mkProvider({});
      startSync(en3, pr3);
      var hb = en3.watch._hello(); hb[keys.OPEN_MS] = 0x12345;
      en3.pebble.fire('appmessage', { payload: hb });
      eq(pr3.hellos.length, 1, 'un solo HELLO per un fire');
      eq(pr3.hellos[0].openMs, 0x2345, 'openMs mascherato a 16 bit');
      /* orologio vecchio: il campo non c'e' proprio -> null (nessun avviso nella config page) */
      sync._reset();
      var en4 = env({}), pr4 = mkProvider({});
      en4.watch.noOpenMs = true;
      startSync(en4, pr4);
      waitIdle(function (err4) {
        check(!err4, 'quarta sync terminata');
        eq(pr4.hellos[0].openMs, null, 'OPEN_MS assente -> openMs null');
        check(hasLog(en4, /HELLO .*open=- /), 'log del HELLO con open=-');
        checkNoTimers();
        next();
      });
    });
  });
});

/* ---- 11c. chiavi-NOME dell'app Core Devices (F-S8-1, 30/08/2026) --------------------------- */

testcase('11c chiavi-NOME (app Core Devices): sync completa (SETTINGS/ORDER/DELETE + 2 foto) con byte int8', function (next) {
  /* Bug di campo del 30/08/2026: sull'orologio VERO il PKJS gira dentro l'app Core Devices, che
   * (PKJSApp.toJSData) consegna i payload in ingresso con le chiavi-NOME ('MSG', 'PROTO', ...) e i
   * byte array come array di int8 CON SEGNO (cast Kotlin: 200 -> -56); pypkjs invece manda le chiavi
   * numeriche e i byte 0..255. src/pkjs/sync.js legge le due forme con gv() e rimaschera i byte in
   * u32le: qui l'INTERA sync gira nella forma dell'app Core Devices, non solo il parseHello.
   * Vale in entrambi i sensi: se gv() sparisse da una chiave, il caso diventa rosso. */
  var en = env({ nameKeys: true });

  /* Controllo dell'opzione stessa: il default (nameKeys false, senza GAL_NAMEKEYS) non deve cambiare
   * di una virgola, altrimenti tutti gli altri casi proverebbero la stessa cosa di questo. */
  var wDef = new FakeWatch({ nameKeys: false }), dj = {}, o0;
  wDef.slots[0].state = 1; wDef.slots[0].crc = 0xDEADBEEF;
  dj[keys.MSG] = MSG.JS_READY;
  o0 = wDef.handle(dj)[0];
  eq(o0[keys.MSG], MSG.HELLO, 'nameKeys false: HELLO con le chiavi numeriche (come pypkjs)');
  eq(o0.MSG, undefined, 'nameKeys false: nessuna chiave-nome');
  eq(o0[keys.SLOTS][1], 0xEF, 'nameKeys false: byte 0..255 (0xEF, non -17)');
  eq(new FakeWatch({}).nameKeys, FakeWatch.NAMEKEYS_DEFAULT, 'il default di fakewatch segue GAL_NAMEKEYS');

  /* Payload consegnati al PKJS (dopo la conversione di fakewatch): li controllo uno per uno. */
  var inbound = [], origHandle = en.watch.handle;
  en.watch.handle = function (d) {
    var out = origHandle.call(this, d);
    out.forEach(function (r) { inbound.push(r); });
    return out;
  };

  en.watch.openMs = 2150;                                              /* file persist gonfio (v1.9) */
  en.watch.slots[3].state = 1; en.watch.slots[3].crc = 0xDEADBEEF;     /* >= 0x80000000: 4 byte int8 negativi */
  en.watch.slots[9].state = 1; en.watch.slots[9].crc = 0x000000FF;     /* 0xFF -> -1 in int8 */
  var crc0 = en.watch.settingsCrc();     /* CRC PRIMA della sync: il MSG.SETTINGS lo cambia */
  var p0 = mkPhoto(0, 0x11C1, { seed: 41 });
  var p1 = mkPhoto(7, 0x11C2, { seed: 42 });
  var pr = mkProvider(function (hello) {
    eq(hello.maxChunk, 4096, 'HELLO annuncia 4096');
    en.watch.maxChunk = 2048;      /* rinegoziato dal SYNC_READY: prova che MAX_CHUNK e' letto per nome */
    return { settings: SETTINGS20, order: order12([0, 7]), deletes: [3], photos: [p0, p1] };
  });
  startSync(en, pr);
  waitIdle(function (err) {
    /* Accessi difensivi come summary(): un'asserzione rossa non deve far crollare la suite con un
     * TypeError (con gv() rotta il piano non parte nemmeno e pr.hellos resta vuoto). */
    var h = pr.hellos[0] || { slots: [] }, hp = inbound[0] || {}, sum = summary(pr, 0);
    function sb(i) { return hp.SLOTS ? hp.SLOTS[i] : undefined; }        /* byte i-esimo di SLOTS */
    function hs(i) { return (h.slots && h.slots[i]) || {}; }             /* slot i-esimo di parseHello */
    check(!err, 'sync terminata');

    /* a) i payload sono DAVVERO nella forma dell'app Core Devices */
    eq(inbound.length, 9, '9 payload verso il PKJS (HELLO, 3 STATUS, SYNC_READY, BEGIN/END x2)');
    eq(inbound.filter(function (d) { return d[keys.MSG] !== undefined; }).length, 0,
       'nessun payload con le chiavi numeriche');
    eq(inbound.filter(function (d) { return d.MSG === undefined; }).length, 0, 'ogni payload ha la chiave "MSG"');
    eq(hp.MSG, MSG.HELLO, 'primo payload: HELLO');
    eq(hp.OPEN_MS, 2150, 'OPEN_MS nel payload (per nome)');
    eq(sb(15), 1, 'SLOTS: stato dello slot 3');
    eq(sb(16), -17, 'SLOTS: byte 0 del CRC 0xDEADBEEF come int8 (-17)');
    eq(sb(17), -66, 'SLOTS: byte 1 (-66)');
    eq(sb(18), -83, 'SLOTS: byte 2 (-83)');
    eq(sb(19), -34, 'SLOTS: byte 3 (-34)');
    eq(sb(46), -1, 'SLOTS: 0xFF come int8 (-1)');

    /* b) parseHello: byte con segno rimascherati (u32le), CRC/OPEN_MS letti per nome */
    eq(h.proto, 1, 'hello.proto');
    eq(h.format, 1, 'hello.format');
    eq(h.maxChunk, 4096, 'hello.maxChunk');
    eq(h.openMs, 2150, 'hello.openMs (OPEN_MS per nome)');
    eq(h.settingsCrc, crc0, 'hello.settingsCrc (CRC per nome, quello di prima della sync)');
    check(h.settingsCrc !== en.watch.settingsCrc(), 'le impostazioni sono cambiate durante la sync');
    eq(h.slots.length, 12, '12 slot');
    eq(hs(3).state, 1, 'slot 3 valido');
    eq(hs(3).crc, 0xDEADBEEF, 'CRC >= 0x80000000 ricomposto senza segno dai byte int8');
    eq(hs(9).crc, 0x000000FF, 'CRC 0x000000FF (byte -1) ricomposto senza segno');
    eq(hs(0).state, 0, 'slot 0 vuoto');
    eq(hs(0).crc, 0, 'CRC dello slot vuoto');
    check(hasLog(en, /HELLO proto=1 maxChunk=4096 open=2150ms/), 'log del HELLO');

    /* c) SYNC_READY{MAX_CHUNK} per nome: senza gv() il chunk resterebbe 4096 e l'orologio finto
     *    (maxChunk 2048) risponderebbe SEQ_ERR a ogni chunk. */
    check(hasLog(en, /SYNC_READY chunk=2048/), 'MAX_CHUNK del SYNC_READY letto per nome');
    eq(count(en.watch.received, MSG.PHOTO_DATA), 34, '34 PHOTO_DATA (17 per foto, chunk 2048)');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 2, 'nessuna ripartenza (2 soli PHOTO_BEGIN)');

    /* d) STATUS: CODE, SLOT, OFFSET e REPLY_TO letti per nome */
    check(hasLog(en, /STATUS OK slot=255 offset=0 re=10/), 'STATUS di SETTINGS (SLOT 0xFF, REPLY_TO 10)');
    check(hasLog(en, /STATUS OK slot=255 offset=0 re=11/), 'STATUS di ALBUM_ORDER (REPLY_TO 11)');
    check(hasLog(en, /STATUS OK slot=3 offset=0 re=12/), 'STATUS di ALBUM_DELETE (SLOT 3, REPLY_TO 12)');
    check(hasLog(en, /STATUS OK slot=0 offset=0 re=5/), 'STATUS del PHOTO_BEGIN (REPLY_TO 5)');
    check(hasLog(en, /STATUS OK slot=0 offset=34200 re=7/), 'STATUS del PHOTO_END (OFFSET = LENGTH, REPLY_TO 7)');
    check(hasLog(en, /STATUS OK slot=7 offset=34200 re=7/), 'STATUS del PHOTO_END della 2a foto');
    check(!hasLog(en, /STATUS non pertinente/), 'nessuno STATUS scambiato per non pertinente');
    check(!hasLog(en, /nessuno STATUS entro/), 'nessuna attesa scaduta');

    /* e) esito: la sync e' andata a buon fine come in modalita' numerica */
    eq(en.watch.received.join(','),
       [MSG.JS_READY, MSG.SETTINGS, MSG.ALBUM_ORDER, MSG.ALBUM_DELETE, MSG.SYNC_REQUEST]
         .concat(photoSeq(17)).concat(photoSeq(17)).concat([MSG.SYNC_DONE]).join(','),
       'sequenza dei messaggi ricevuti');
    bytesEq(en.watch.buffers[0], p0._expected, 'byte della foto nello slot 0');
    bytesEq(en.watch.buffers[7], p1._expected, 'byte della foto nello slot 7');
    eq(en.watch.slots[0].crc, crc.crc32(p0._expected), 'CRC dello slot 0');
    eq(en.watch.slots[7].photoId, 0x11C2, 'photo_id dello slot 7');
    eq(en.watch.slots[3].state, 0, 'slot 3 eliminato dall\'ALBUM_DELETE');
    eq(en.watch.order.join(','), '0,7', 'ordine sull\'orologio');
    eq(en.watch.settings.slice(0, 3).join(','), '1,1,2', 'impostazioni memorizzate (schema, layout, font)');
    eq(show(sum), show({ photosOk: 2, photosFailed: 0, settings: 'OK', order: 'OK',
                         deletes: ['3:OK'], photoCodes: [] }), 'summary');
    eq(show(pr.results), show([{ slot: 0, ok: true, code: 'OK' }, { slot: 7, ok: true, code: 'OK' }]),
       'onPhotoResult per tutte e due le foto');
    checkInFlight(en, 1);
    checkNoTimers();
    next();
  });
});

/* ---- 12. STATUS non pertinenti ------------------------------------------------------------- */

testcase('12a STATUS OK{offset < LENGTH} mentre si attende l\'END -> ignorato, attesa intatta', function (next) {
  var en = env({ statusTimeoutMs: 150 });
  var photo = mkPhoto(0, 0xD001, { seed: 32 });
  var pr = mkProvider({ photos: [photo] });
  /* la vera risposta al primo END viene persa e al suo posto arriva un OK tardivo di un BEGIN */
  dropReplyTo(en, MSG.PHOTO_END, 1);
  injectAfter(en, MSG.PHOTO_END, 1, function (w, d) { return statusDict(CODE.OK, 0, 100); });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(hasLog(en, /STATUS OK slot=0 offset=100/), 'lo STATUS tardivo e\' arrivato');
    check(hasLog(en, /STATUS non pertinente: continuo ad aspettare/), 'ignorato, attesa mantenuta');
    check(hasLog(en, /nessuno STATUS entro 150 ms: rinvio \(1\/2\)/), 'timer riarmato -> rinvio dell\'END');
    eq(count(en.watch.received, MSG.PHOTO_END), 2, 'END rinviato una volta');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('12b SEQ_ERR mentre si attende l\'OK del BEGIN -> ignorato, attesa intatta', function (next) {
  var en = env({ statusTimeoutMs: 150 });
  var photo = mkPhoto(0, 0xD002, { seed: 33 });
  var pr = mkProvider({ photos: [photo] });
  dropReplyTo(en, MSG.PHOTO_BEGIN, 1);
  injectAfter(en, MSG.PHOTO_BEGIN, 1, function (w, d) { return statusDict(CODE.SEQ_ERR, 0, 0); });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(hasLog(en, /STATUS SEQ_ERR slot=0 offset=0/), 'lo SEQ_ERR tardivo e\' arrivato');
    check(hasLog(en, /STATUS non pertinente: continuo ad aspettare/), 'ignorato, attesa mantenuta');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 2, 'BEGIN rinviato una volta (non per lo SEQ_ERR)');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('12c STATUS OK mentre si attende il SYNC_READY -> ignorato', function (next) {
  var en = env({ statusTimeoutMs: 150 });
  var photo = mkPhoto(0, 0xD003, { seed: 46 });
  var pr = mkProvider({ photos: [photo] });
  dropReplyTo(en, MSG.SYNC_REQUEST, 1);           /* il vero SYNC_READY si perde */
  injectAfter(en, MSG.SYNC_REQUEST, 1, function () { return statusDict(CODE.OK, 0, 0); });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(hasLog(en, /STATUS non pertinente: continuo ad aspettare/), 'OK tardivo ignorato');
    eq(count(en.watch.received, MSG.SYNC_REQUEST), 2, 'SYNC_REQUEST rinviata');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 1, 'un solo PHOTO_BEGIN');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('12d STATUS NO_SPACE durante i dati -> foto scartata, la successiva parte', function (next) {
  var en = env({});
  var p0 = mkPhoto(0, 0xD004, { seed: 47 });
  var p1 = mkPhoto(1, 0xD005, { seed: 48 });
  var pr = mkProvider({ photos: [p0, p1] });
  injectAfter(en, MSG.PHOTO_DATA, 1, function () { return statusDict(CODE.NO_SPACE, 0, 0); });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(show(pr.results[0]), show({ slot: 0, ok: false, code: 'NO_SPACE' }), 'esito della prima foto');
    eq(pr.summaries[0].photosFailed, 1, 'photosFailed');
    eq(pr.summaries[0].photosOk, 1, 'photosOk');
    eq(show(pr.summaries[0].photoCodes), show(['0:NO_SPACE']), 'summary.photoCodes (F9)');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 2, 'nessuna ripetizione della foto scartata');
    bytesEq(en.watch.buffers[1], p1._expected, 'byte della seconda foto');
    checkInFlight(en, 2);
    next();
  });
});

testcase('12f SYNC_READY ripetuto mentre si attende un altro STATUS -> non tocca l\'attesa', function (next) {
  var en = env({ statusTimeoutMs: 150 });
  var photo = mkPhoto(0, 0xD007, { seed: 50 });
  var pr = mkProvider({ photos: [photo] });
  /* la risposta al primo BEGIN si perde e al suo posto arriva un SYNC_READY tardivo */
  dropReplyTo(en, MSG.PHOTO_BEGIN, 1);
  injectAfter(en, MSG.PHOTO_BEGIN, 1, function (w) {
    var d = {}; d[keys.MSG] = MSG.SYNC_READY; d[keys.MAX_CHUNK] = w.maxChunk; return d;
  });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    check(hasLog(en, /SYNC_READY ripetuto: ignorato/), 'SYNC_READY ripetuto ignorato');
    check(hasLog(en, /nessuno STATUS entro 150 ms: rinvio \(1\/2\)/), 'attesa del BEGIN intatta -> rinvio');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 2, 'BEGIN rinviato una volta');
    eq(count(en.watch.received, MSG.SYNC_REQUEST), 1, 'nessuna SYNC_REQUEST in piu\'');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    checkInFlight(en, 1);
    next();
  });
});

testcase('12e MSG ignoto e STATUS inatteso a riposo -> log, nessun crash', function (next) {
  var en = env({});
  var photo = mkPhoto(0, 0xD006, { seed: 49 });
  var pr = mkProvider({ photos: [photo] });
  startSync(en, pr);
  waitIdle(function (err) {
    var d = {};
    check(!err, 'prima sync terminata');
    d[keys.MSG] = 99;
    en.pebble.fire('appmessage', { payload: d });
    en.pebble.fire('appmessage', { payload: statusDict(CODE.OK, 0, 0) });
    en.pebble.fire('appmessage', { payload: {} });
    setTimeout(function () {
      check(hasLog(en, /messaggio ignoto MSG=99/), 'log del MSG ignoto');
      check(hasLog(en, /STATUS inatteso: ignorato/), 'log dello STATUS inatteso');
      check(hasLog(en, /messaggio ignoto MSG=0/), 'payload vuoto -> MSG 0 ignoto');
      eq(sync.isRunning(), false, 'motore fermo');
      eq(pr.summaries.length, 1, 'nessun onDone in piu\'');
      next();
    }, 60);
  });
});

/* ---- 13. watchdog --------------------------------------------------------------------------- */

testcase('12g STATUS tardivi delle copie di SETTINGS mentre ALBUM_ORDER attende: REPLY_TO li scarta, l\'esito vero arriva', function (next) {
  /* STATUS ritardato di 300 ms con timeout 100 ms: SETTINGS viene spedito 3 volte (l'orologio risponde a
   * ogni copia), le 2 risposte in più arrivano mentre ALBUM_ORDER (non valido: slot doppio → BAD_FORMAT)
   * aspetta la sua. Senza REPLY_TO il motore leggeva "OK" per l'ordine e ignorava il BAD_FORMAT vero. */
  var en = env({ statusTimeoutMs: 100, statusResends: 2, helloTimeoutMs: 1000 });   /* HELLO ritardato di 300 ms: niente rinvii del JS_READY */
  en.pebble.replyDelayMs = 300;
  var pr = mkProvider({ photos: [], settings: SETTINGS20, order: [0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255] });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.SETTINGS), 3, 'SETTINGS spedito 3 volte (1 + 2 rinvii)');
    eq(pr.summaries[0].settings, 'OK', 'SETTINGS -> OK');
    eq(pr.summaries[0].order, 'BAD_FORMAT', 'ALBUM_ORDER -> BAD_FORMAT (non "OK" rubato a una copia di SETTINGS)');
    check(hasLog(en, /STATUS per MSG 10 mentre attendo MSG 11: ignorato/), 'STATUS di una copia di SETTINGS scartato');
    checkInFlight(en, 1);
    next();
  }, { timeout: 6000, grace: 800 });
});

testcase('12h orologio SENZA REPLY_TO (vecchio): il motore funziona come prima', function (next) {
  var en = env({});
  en.watch.noReplyTo = true;
  var photo = mkPhoto(0, 0xE0E0, { seed: 61 });
  var pr = mkProvider({ photos: [photo], settings: SETTINGS20, order: order12([0]) });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(pr.summaries[0].photosOk, 1, 'foto OK');
    eq(pr.summaries[0].settings, 'OK', 'SETTINGS OK');
    eq(pr.summaries[0].order, 'OK', 'ORDER OK');
    checkInFlight(en, 1);
    next();
  });
});

testcase('13a caricamento che non torna mai -> watchdog -> HELLO successivo riparte', function (next) {
  var en = env({ watchdogMs: 1500 });
  var stuck = mkPhoto(0, 0xE001, { loadNever: true });
  var good = mkPhoto(1, 0xE002, { seed: 34 });
  var pr = mkProvider(function (hello, n) { return (n === 1) ? { photos: [stuck] } : { photos: [good] }; });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync chiusa dal watchdog');
    eq(sync.isRunning(), false, 'motore fermo');
    eq(pr.summaries[0].error, 'watchdog', 'summary.error');
    eq(pr.summaries[0].photosFailed, 1, 'photosFailed');
    check(hasLog(en, /nessun evento per 1500 ms: sync abbandonata/), 'log del watchdog');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 0, 'nessun PHOTO_BEGIN');
    en.pebble.fire('appmessage', { payload: en.watch._hello() });
    waitIdle(function (err2) {
      check(!err2, 'seconda sync terminata');
      eq(pr.planCalls, 2, 'un secondo piano');
      eq(pr.summaries[1].photosOk, 1, 'foto OK alla ripartenza');
      bytesEq(en.watch.buffers[1], good._expected, 'byte della foto buona');
      checkInFlight(en, 1);
      next();
    });
  }, { timeout: 6000, grace: 800 });
});

testcase('13b orologio muto (dropInbound) -> la sync termina comunque e un HELLO la fa ripartire', function (next) {
  var en = env({ statusTimeoutMs: 100, watchdogMs: 1500 });
  var photo = mkPhoto(0, 0xE003, { seed: 35 });
  var pr = mkProvider(function (hello, n) {
    if (n === 1) { en.pebble.dropInbound = 100; }        /* nessuna risposta arriva piu' al PKJS */
    return { photos: [photo] };
  });
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata (non bloccata per sempre)');
    eq(sync.isRunning(), false, 'motore fermo');
    check(!!pr.summaries[0].error, 'summary.error valorizzato (' + pr.summaries[0].error + ')');
    eq(pr.summaries[0].photosFailed, 1, 'photosFailed');
    eq(count(en.watch.received, MSG.SYNC_REQUEST), 3, 'SYNC_REQUEST inviata 3 volte (1 + 2 rinvii)');
    /* con l'orologio di nuovo udibile un HELLO fa ripartire tutto */
    en.pebble.dropInbound = 0;
    en.pebble.fire('appmessage', { payload: en.watch._hello() });
    waitIdle(function (err2) {
      check(!err2, 'seconda sync terminata');
      eq(pr.planCalls, 2, 'un secondo piano');
      eq(pr.summaries[1].photosOk, 1, 'foto OK alla ripartenza');
      bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
      checkInFlight(en, 1);
      next();
    }, { timeout: 6000, grace: 800 });
  }, { timeout: 6000, grace: 800 });
});

/* ---- 14. BUG NOTO: photoFailed() dereferenzia s.cur senza controllarlo -------------------- */

/* Se il watchdog chiude la sync MENTRE una catena di backoff e' ancora in volo (i NACK non
 * chiamano touchWatchdog: src/pkjs/sync.js:96 e' solo nel ramo di successo), il watchdog azzera
 * s.cur (sync.js:82) e poi il fallimento definitivo dell'invio chiama photoFailed(), che legge
 * `s.cur.photo` senza guardia (sync.js:328-329) -> TypeError e PKJS morto.
 * sendData protegge il suo onFail con `if (s.cur === c && c.gen === gen)` (sync.js:426), ma
 * sendBegin (sync.js:386) e sendEnd (sync.js:491) no.
 * Bug corretto in S5b (photoFailed: `if (!c) return;`): il caso e' verde e un rosso qui e' una
 * regressione reale, non un "caso rosso noto". I riferimenti alle righe sono quelli del sorgente
 * di allora. */
testcase('14 regressione S5b: watchdog durante il backoff -> photoFailed() su s.cur nullo (TypeError)', function (next) {
  var en = env({ watchdogMs: 1500, backoffMs: [900, 900], statusTimeoutMs: 5000 });
  var photo = mkPhoto(0, 0xFF01, { seed: 51 });
  var pr = mkProvider({ photos: [photo] });
  var crashed = null;
  var onCrash = function (e) { crashed = e; };
  process.on('uncaughtException', onCrash);
  /* i 3 invii del PHOTO_BEGIN (1 + 2 backoff) falliscono: 900 + 900 ms > watchdog 1500 ms */
  var orig = en.watch.handle;
  en.watch.handle = function (d) {
    if ((d[keys.MSG] | 0) === MSG.SYNC_REQUEST) { en.pebble.nackNext = 3; }
    return orig.call(this, d);
  };
  startSync(en, pr);
  setTimeout(function () {
    process.removeListener('uncaughtException', onCrash);
    eq(pr.summaries[0].error, 'watchdog', 'il watchdog ha chiuso la sync durante il backoff');
    check(!hasLog(en, /invio fallito definitivamente/), 'il backoff muore con la sync (S5b: run annullata), nessun invio dopo il watchdog');
    eq(count(en.watch.received, MSG.PHOTO_BEGIN), 0, 'nessun PHOTO_BEGIN consegnato dopo la chiusura');
    eq(pr.summaries.length, 1, 'onDone una volta sola');
    check(crashed === null,
          'BUG src/pkjs/sync.js:328 — photoFailed() legge s.cur.photo senza controllare che s.cur ' +
          'sia ancora valido: dopo il watchdog (sync.js:82 azzera s.cur) l\'onFail non protetto di ' +
          'sendBegin (sync.js:386) / sendEnd (sync.js:491) lo chiama comunque. Ottenuto: ' +
          (crashed ? crashed : 'nessuna eccezione'));
    next();
  }, 2600);
});

/* ---- 15. attesa dell'HELLO dopo il JS_READY (F5) ------------------------------------------- */

/* L'HELLO nasce solo dal JS_READY e l'outbox dell'orologio non ritenta: se dopo l'ACK del JS_READY non
 * arriva entro helloTimeoutMs il motore rinvia il JS_READY (helloResends volte), poi chiama
 * provider.onReadyFailed(why) e index.js programma il retry lungo. Nessun rinvio se l'HELLO arriva
 * (anche prima dell'ACK, anche con PROTO diverso) o se resync() ha gia' rispedito il JS_READY. */

testcase('15a HELLO perso una volta -> rinvio del JS_READY -> piano e foto OK, onReadyFailed mai', function (next) {
  var en = env({ helloTimeoutMs: 100 });
  var photo = mkPhoto(0, 0x1501, { seed: 70 });
  var pr = mkProvider({ photos: [photo] });
  en.pebble.dropInbound = 1;                        /* il primo HELLO non arriva al PKJS */
  startSync(en, pr);
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.JS_READY), 2, 'l\'orologio ha ricevuto 2 JS_READY (1 + 1 rinvio)');
    check(hasLog(en, /^\[sync\] nessun HELLO entro 100 ms: rinvio JS_READY \(1\/2\)$/), 'log del rinvio (1/2)');
    check(hasLog(en, /^\[sync\] JS_READY \(rinvio 1\/2\)$/), 'log del JS_READY rinviato');
    check(!hasLog(en, /rinvio JS_READY \(2\/2\)/), 'nessun secondo rinvio');
    eq(pr.planCalls, 1, 'un solo piano');
    eq(pr.summaries.length, 1, 'un solo onDone');
    eq(summary(pr, 0).photosOk, 1, 'foto OK');
    bytesEq(en.watch.buffers[0], photo._expected, 'byte integri');
    eq(pr.readyFailed.length, 0, 'onReadyFailed mai chiamato');
    checkInFlight(en, 1);
    checkNoTimers();
    next();
  }, { grace: 400 });
});

testcase('15b HELLO perso 3 volte -> 3 JS_READY, onReadyFailed una volta, zero timer; resync() riparte e tollera un altro HELLO perso', function (next) {
  var en = env({ helloTimeoutMs: 100 });
  var photo = mkPhoto(0, 0x1502, { seed: 71 });
  var pr = mkProvider({ photos: [photo] });
  en.pebble.dropInbound = 3;                        /* JS_READY + 2 rinvii: nessun HELLO */
  startSync(en, pr);
  setTimeout(function () {                          /* 3 attese da 100 ms + margine */
    eq(count(en.watch.received, MSG.JS_READY), 3, '3 JS_READY (1 + 2 rinvii)');
    check(hasLog(en, /^\[sync\] nessun HELLO entro 100 ms: rinvio JS_READY \(2\/2\)$/), 'log del secondo rinvio');
    check(hasLog(en, /^\[sync\] JS_READY \(rinvio 2\/2\)$/), 'log del secondo JS_READY rinviato');
    eq(pr.readyFailed.length, 1, 'onReadyFailed una volta');
    eq(pr.readyFailed[0], 'nessun HELLO dopo 2 rinvii di JS_READY', 'motivo passato a onReadyFailed');
    check(hasLog(en, /^\[sync\] nessun HELLO dopo 2 rinvii di JS_READY$/), 'log del fallimento');
    eq(pr.planCalls, 0, 'nessun piano');
    eq(sync.isRunning(), false, 'motore fermo');
    checkNoTimers('zero timer vivi dopo onReadyFailed');
    /* retry lungo di index.js = resync(): il contatore dei rinvii riparte da 0, un altro HELLO perso e' tollerato */
    en.pebble.dropInbound = 1;
    sync.resync();
    waitIdle(function (err) {
      check(!err, 'sync dopo la resync terminata');
      eq(count(en.watch.received, MSG.JS_READY), 5, '5 JS_READY in tutto (3 + resync + 1 rinvio)');
      eq(en.logs.filter(function (l) { return /rinvio JS_READY \(1\/2\)/.test(l); }).length, 2, 'dopo la resync il rinvio riparte da 1/2');
      eq(pr.planCalls, 1, 'un piano dopo la resync');
      eq(summary(pr, 0).photosOk, 1, 'foto OK');
      eq(pr.readyFailed.length, 1, 'nessun altro onReadyFailed');
      checkInFlight(en, 1);
      checkNoTimers();
      next();
    }, { grace: 400 });
  }, 500);
});

testcase('15c piano vuoto: HELLO subito, attesa 4x il timeout -> un solo JS_READY (nessun rinvio spurio)', function (next) {
  var en = env({ helloTimeoutMs: 100 });
  var pr = mkProvider({});
  startSync(en, pr);
  setTimeout(function () {
    eq(count(en.watch.received, MSG.JS_READY), 1, 'un solo JS_READY');
    check(!hasLog(en, /rinvio JS_READY/), 'nessun rinvio');
    eq(pr.summaries.length, 1, 'una sync (vuota)');
    eq(pr.readyFailed.length, 0, 'onReadyFailed mai');
    checkNoTimers();
    next();
  }, 450);
});

testcase('15d HELLO consegnato PRIMA dell\'ACK del JS_READY (piano vuoto) -> nessun rinvio, nessun timer', function (next) {
  var en = env({ helloTimeoutMs: 100 });
  var pr = mkProvider({});
  /* sul telefono la risposta puo' precedere l'ACK: qui il JS_READY riceve l'HELLO e POI l'ACK; con un
   * piano vuoto la sync e' gia' finita (running false) quando l'ACK arriva: il timer non va armato */
  var orig = en.pebble.sendAppMessage;
  en.pebble.sendAppMessage = function (dict, ok, fail) {
    var self = this, copy;
    if ((dict[keys.MSG] | 0) !== MSG.JS_READY) { return orig.call(this, dict, ok, fail); }
    copy = {}; Object.keys(dict).forEach(function (k) { copy[k] = dict[k]; });
    setTimeout(function () {
      self.watch.handle(copy).forEach(function (r) { self.fire('appmessage', { payload: r }); });
      if (ok) { ok({ data: { transactionId: 0 } }); }
    }, 0);
  };
  startSync(en, pr);
  setTimeout(function () {
    /* subito dopo HELLO + ACK (pochi ms): un timer HELLO armato per errore sarebbe ancora vivo qui
     * (scatterebbe a 100 ms senza effetti visibili: il controllo va fatto PRIMA) */
    eq(pr.summaries.length, 1, 'una sync (finita prima dell\'ACK)');
    checkNoTimers('nessun timer HELLO armato dopo l\'ACK (l\'HELLO era gia\' arrivato)');
  }, 40);
  setTimeout(function () {
    eq(count(en.watch.received, MSG.JS_READY), 1, 'un solo JS_READY');
    eq(pr.planCalls, 1, 'un piano');
    eq(pr.summaries.length, 1, 'ancora una sola sync');
    check(!hasLog(en, /rinvio JS_READY/), 'nessun rinvio');
    eq(pr.readyFailed.length, 0, 'onReadyFailed mai');
    checkNoTimers();
    next();
  }, 450);
});

testcase('15e HELLO con PROTO diverso -> nessun rinvio del JS_READY (l\'orologio ha risposto)', function (next) {
  var en = env({ helloTimeoutMs: 100 });
  var pr = mkProvider({});
  var orig = en.watch._hello;
  en.watch._hello = function () { var d = orig.call(this); d[keys.PROTO] = 2; return d; };
  startSync(en, pr);
  setTimeout(function () {
    eq(count(en.watch.received, MSG.JS_READY), 1, 'un solo JS_READY');
    eq(en.logs.filter(function (l) { return /protocollo 2 non supportato/.test(l); }).length, 1, 'un solo HELLO (PROTO 2) ricevuto');
    check(!hasLog(en, /rinvio JS_READY/), 'nessun rinvio');
    eq(pr.planCalls, 0, 'nessun piano');
    eq(pr.readyFailed.length, 0, 'onReadyFailed mai');
    checkNoTimers();
    next();
  }, 450);
});

testcase('15f resync() mentre si attende un HELLO perso -> nuovo JS_READY subito, nessun rinvio ne\' onReadyFailed', function (next) {
  var en = env({ helloTimeoutMs: 100 });
  var photo = mkPhoto(0, 0x1503, { seed: 72 });
  var pr = mkProvider({ photos: [photo] });
  en.pebble.dropInbound = 1;
  startSync(en, pr);
  setTimeout(function () { sync.resync(); }, 20);   /* ben prima del timeout di 100 ms */
  waitIdle(function (err) {
    check(!err, 'sync terminata');
    eq(count(en.watch.received, MSG.JS_READY), 2, '2 JS_READY (iniziale + resync)');
    check(!hasLog(en, /rinvio JS_READY/), 'nessun rinvio: la resync ha cancellato l\'attesa');
    eq(pr.planCalls, 1, 'un piano');
    eq(summary(pr, 0).photosOk, 1, 'foto OK');
    eq(pr.readyFailed.length, 0, 'onReadyFailed mai');
    checkInFlight(en, 1);
    checkNoTimers();
    next();
  }, { grace: 400 });
});

/* ================================================================================= runner === */

function run() {
  var c = cases.shift(), en;
  if (!c) {
    /* 2. invariante globale su tutti i casi */
    g_case = '2 invariante';
    check(g_maxDataInFlight <= 1, 'mai piu\' di un PHOTO_DATA in volo in tutta la suite (max ' + g_maxDataInFlight + ')');
    check(g_syncReq > 0, 'almeno una SYNC_REQUEST spedita dal motore (' + g_syncReq + ')');
    check(g_syncReqBad === 0, 'nessuna SYNC_REQUEST del motore con OFFSET >= COUNT (' + g_syncReqBad + ')');
    console.log('test_sync_engine: ' + g_pass + ' ok, ' + g_fail + ' falliti');
    process.exit(g_fail ? 1 : 0);
    return;
  }
  g_case = c.name;
  g_failAtCaseStart = g_fail;
  c.fn(function () {
    if (g_fail > g_failAtCaseStart && g_env) {
      console.log('--- log del caso "' + g_case + '" (ultime 40 righe) ---');
      console.log(g_env.logs.slice(-40).join('\n'));
      console.log('---');
    }
    setTimeout(run, 20);
  });
}

run();

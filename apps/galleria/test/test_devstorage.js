#!/usr/bin/env node
/* test_devstorage.js — il wrapper safeStorage() di index.js in modalità dev (revisione post
 * code-review 29/08, F11): con Pebble.platform === 'pypkjs' ogni setItem(k) è preceduto
 * IMMEDIATAMENTE da removeItem(k) (dbm.dumb: __delitem__ riscrive l'indice .dir e la chiave
 * "nuova" viene appesa all'indice subito → durabile anche con `pebble kill`), i valori sono nudi
 * (niente padding: JSON che finisce con '}', payload base64url a lunghezza esatta); sul telefono
 * (platform 'android') solo setItem, mai removeItem prima. Un album già su disco con i valori
 * paddati della versione precedente si rilegge (JSON.parse e b64.decode ignorano gli spazi) e
 * viene riscritto nudo alla prima scrittura. Passo 4 (F8): setItem del JSON dell'album che lancia
 * (quota) → album.js annulla la modifica (rollback del payload, album riletto dal disco) e index.js
 * logga '[config] modifiche annullate: nessuna sync' SENZA resync, sia dal webviewclosed del telefono
 * sia dal token dev (/save.json). index.js vero + album.js + sync.js + orologio finto; devserver.js
 * stubbato via require.cache (nessun server: fetchState/fetchPhotoB64 → 'no server'; fetchSave →
 * `devStub.saveState` se impostato).
 *
 * Esecuzione: cd test && NODE_PATH=shim node test_devstorage.js (oppure make -C test jstest). */
var Module = require('module');
var FakeWatch = require('fakewatch');
var FakePebble = require('fake_pebble');
var b64 = require('../src/pkjs/b64');
var crc = require('../src/pkjs/crc');
var fixture = require('./fixture_photo');
var Album = require('../src/pkjs/album');
var INDEX = require.resolve('../src/pkjs/index');
var DEVSERVER = require.resolve('../src/pkjs/devserver');

var pass = 0, fail = 0;
var origLog = console.log;
function check(c, what) { if (c) { pass++; } else { fail++; origLog('FAIL ' + what); } }

var PROBE = 'galleria.v1.probe';
var KEY = Album.KEY, WKEY = Album.WKEY, P01 = Album.payloadKey(0, 1);
var raw6 = b64.decode(fixture.raw6.b64), crcA = crc.crc32(raw6);
var THUMB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/* devserver.js stubbato PRIMA di caricare index.js: `require('./devserver')` risolve allo stesso path */
var devStub = {
  base: 'http://localhost:8765',
  saveState: null,                       /* risposta di /save.json (passo 4), altrimenti 'no server' */
  fetchState: function (cb) { cb('no server'); },
  fetchSave: function (cb) { if (devStub.saveState) { cb(null, devStub.saveState); } else { cb('no server'); } },
  fetchPhotoB64: function (slot, fmt, cb) { cb('no server'); }
};
(function stubDevserver() {
  var m = new Module(DEVSERVER, null);
  m.filename = DEVSERVER; m.loaded = true;
  m.exports = devStub;
  require.cache[DEVSERVER] = m;
})();

/* localStorage finto con registro delle chiamate: ['get'|'set'|'del', chiave, valore?];
 * st.failSet = function (key, valore) → true fa lanciare setItem (quota, passi 4 e 5). */
function loggedStorage(seed) {
  var mem = {}, calls = [], k, st;
  for (k in (seed || {})) { if (Object.prototype.hasOwnProperty.call(seed, k)) { mem[k] = seed[k]; } }
  st = {
    calls: calls,
    failSet: null,
    getItem: function (key) { calls.push(['get', key]); return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; },
    setItem: function (key, v) {
      if (st.failSet && st.failSet(key, String(v))) { calls.push(['fail', key]); throw new Error('QuotaExceededError (test)'); }
      calls.push(['set', key, String(v)]); mem[key] = String(v);
    },
    removeItem: function (key) { calls.push(['del', key]); delete mem[key]; },
    keys: function () { return Object.keys(mem); }
  };
  return st;
}

var logs = [];
console.log = function (m) { logs.push(String(m)); };
function hasLog(needle, from) {
  var i;
  for (i = from || 0; i < logs.length; i++) {
    if (typeof needle === 'string' ? logs[i] === needle : needle.test(logs[i])) { return true; }
  }
  return false;
}
var FINE = /^\[sync\] fine:/;
function countLog(re, from) {
  var n = 0, i;
  for (i = from || 0; i < logs.length; i++) { if (re.test(logs[i])) { n++; } }
  return n;
}

var realSetTimeout = global.setTimeout;
function waitFor(pred, cb) {
  var t0 = Date.now();
  (function poll() {
    if (pred()) { return cb(null); }
    if (Date.now() - t0 > 8000) { return cb('timeout'); }
    realSetTimeout(poll, 10);
  })();
}

var sync = require('../src/pkjs/sync');          /* UN SOLO require: index.js riusa lo stesso modulo */
sync.configure({ statusTimeoutMs: 200, watchdogMs: 2000, backoffMs: [10, 10, 10], helloTimeoutMs: 200 });

function delta() {
  return { v: 1, photos: [
    { slot: 0, photo_id: 0x1111, fmt: 1, len: 34200, crc: crcA, data: fixture.raw6.b64, name: 'città', thumb: THUMB }
  ], order: [0], settings: { font: 1 } };
}

/* Carica index.js su un Pebble finto della piattaforma data, con lo storage dato; 'ready' subito. */
function boot(platform, storage) {
  var en = {};
  sync._reset();
  en.watch = new FakeWatch({ format: 1, maxChunk: 4096, log: function () {} });
  en.pebble = new FakePebble(en.watch, { platform: platform });
  en.storage = storage;
  global.Pebble = en.pebble;
  global.localStorage = storage;
  en.logStart = logs.length;
  delete require.cache[INDEX];
  require(INDEX);
  en.pebble.fire('ready');
  return en;
}

/* Le scritture dell'album (tutto tranne la probe di safeStorage) e i controlli di adiacenza. */
function albumCalls(calls) { return calls.filter(function (c) { return c[1] !== PROBE; }); }
function setsPrecededByDel(calls) {
  var i, n = 0;
  for (i = 0; i < calls.length; i++) {
    if (calls[i][0] === 'set' && calls[i][1] !== PROBE && i > 0 && calls[i - 1][0] === 'del' && calls[i - 1][1] === calls[i][1]) { n++; }
  }
  return n;
}
function countOp(calls, op, key) {
  return calls.filter(function (c) { return c[0] === op && c[1] !== PROBE && (key === undefined || c[1] === key); }).length;
}
function lastSet(calls, key) {
  var i;
  for (i = calls.length - 1; i >= 0; i--) { if (calls[i][0] === 'set' && calls[i][1] === key) { return calls[i][2]; } }
  return null;
}
/* removeItem (non probe) NON seguiti immediatamente dal setItem della stessa chiave */
function standaloneDels(calls) {
  var out = [], i;
  for (i = 0; i < calls.length; i++) {
    if (calls[i][0] === 'del' && calls[i][1] !== PROBE &&
        !(i + 1 < calls.length && calls[i + 1][0] === 'set' && calls[i + 1][1] === calls[i][1])) { out.push(calls[i][1]); }
  }
  return out;
}
function probeOk(calls) {
  return calls.length >= 2 && calls[0][0] === 'set' && calls[0][1] === PROBE && calls[0][2] === '1' &&
         calls[1][0] === 'del' && calls[1][1] === PROBE;
}

var steps = [];

/* ---- 1. emulatore (pypkjs): removeItem immediatamente prima di ogni setItem, valori nudi ---- */
steps.push(function (next) {
  var st = loggedStorage(), en = boot('pypkjs', st);
  waitFor(function () { return countLog(FINE, en.logStart) >= 1; }, function (err) {
    var calls;
    check(!err, 'dev: prima sync (album vuoto) conclusa');
    check(hasLog('[album] pronto (dev server http://localhost:8765): 0 foto [] ordine [] eliminazioni [] settings crc 0x7ee7', en.logStart), 'dev: log di ready');
    check(hasLog('[dev] dev server non raggiungibile (no server): parto con l\'album locale', en.logStart), 'dev: senza server si parte con l\'album locale');
    check(probeOk(st.calls), 'dev: probe di safeStorage = set + del (direttamente su localStorage)');
    calls = albumCalls(st.calls);
    check(countOp(calls, 'set') === 1 && countOp(calls, 'set', WKEY) === 1, 'dev: al primo HELLO una sola scrittura (snapshot watch)');
    check(setsPrecededByDel(st.calls) === 1, 'dev: lo snapshot watch è preceduto da removeItem');
    en.pebble.fire('webviewclosed', { response: JSON.stringify(delta()) });
    waitFor(function () { return countLog(FINE, en.logStart) >= 2; }, function (err2) {
      var a2, v;
      check(!err2, 'dev: seconda sync (foto) conclusa');
      check(en.watch.slots[0].state === 1 && en.watch.slots[0].crc === crcA, 'dev: foto sull\'orologio');
      calls = albumCalls(st.calls);
      check(countOp(calls, 'set') >= 5, 'dev: almeno 5 setItem (watch, payload, album, watch, album), got ' + countOp(calls, 'set'));
      check(countOp(calls, 'set', KEY) >= 2 && countOp(calls, 'set', WKEY) >= 2 && countOp(calls, 'set', P01) === 1, 'dev: scritte album, watch e payload p0.1');
      check(setsPrecededByDel(st.calls) === countOp(calls, 'set'), 'dev: OGNI setItem(k) è preceduto immediatamente da removeItem(k), got ' + setsPrecededByDel(st.calls) + '/' + countOp(calls, 'set'));
      /* gli unici removeItem NON seguiti dal setItem della stessa chiave sono quelli di album.js: la
       * rimozione (rimandata a dopo _save, F6) del payload dell'altro formato della foto nuova, p0.2 */
      check(standaloneDels(st.calls).join(',') === Album.payloadKey(0, 2), 'dev: removeItem "da soli" = solo il payload p0.2 di album.js, got [' + standaloneDels(st.calls).join(',') + ']');
      check(countOp(calls, 'del') === countOp(calls, 'set') + 1, 'dev: removeItem = setItem + 1 (p0.2), got ' + countOp(calls, 'del') + '/' + countOp(calls, 'set'));
      v = lastSet(st.calls, KEY);
      check(v !== null && v.charAt(v.length - 1) === '}' && v.charAt(0) === '{', 'dev: album JSON nudo (senza padding)');
      check(v !== null && JSON.parse(v).photos[0].name === 'città', 'dev: nome "città" nel JSON');
      v = lastSet(st.calls, WKEY);
      check(v !== null && v.charAt(v.length - 1) === '}', 'dev: snapshot watch JSON nudo');
      v = lastSet(st.calls, P01);
      check(v === fixture.raw6.b64 && v.length === 45600, 'dev: payload p0.1 a lunghezza esatta (45600), got ' + (v ? v.length : null));
      check(st.getItem(P01) === fixture.raw6.b64, 'dev: payload riletto identico');
      a2 = new Album(st, function () {});
      check(a2.data.photos[0] && a2.data.photos[0].name === 'città', 'dev: new Album(localStorage).data.photos[0].name === "città"');
      check(a2.data.photos[0] && a2.data.photos[0].thumb === THUMB, 'dev: thumb conservata');
      check(a2.data.photos[0] && a2.data.photos[0].fmts[1].crc === crcA, 'dev: crc del formato 1');
      check(a2.data.order.join(',') === '0' && a2.data.orderDirty === false, 'dev: ordine [0] confermato');
      check(a2.data.settingsSet === true && a2.data.settings.font === 1, 'dev: impostazioni salvate');
      check(st.keys().sort().join(',') === [KEY, P01, WKEY].sort().join(','), 'dev: chiavi in localStorage: album, p0.1, watch (got ' + st.keys().sort().join(',') + ')');
      next();
    });
  });
});

/* ---- 2. controprova telefono (android): solo setItem, nessun removeItem prima ---- */
steps.push(function (next) {
  var st = loggedStorage(), en = boot('android', st);
  waitFor(function () { return countLog(FINE, en.logStart) >= 1; }, function (err) {
    check(!err, 'android: prima sync conclusa');
    check(hasLog(/^\[album\] pronto \(telefono\): 0 foto/, en.logStart), 'android: log di ready (telefono)');
    en.pebble.fire('webviewclosed', { response: encodeURIComponent(JSON.stringify(delta())) });
    waitFor(function () { return countLog(FINE, en.logStart) >= 2; }, function (err2) {
      var calls = albumCalls(st.calls), v, a2;
      check(!err2, 'android: seconda sync conclusa');
      check(en.watch.slots[0].state === 1 && en.watch.slots[0].crc === crcA, 'android: foto sull\'orologio');
      check(probeOk(st.calls), 'android: probe di safeStorage = set + del');
      check(countOp(calls, 'set') >= 5, 'android: almeno 5 setItem, got ' + countOp(calls, 'set'));
      check(setsPrecededByDel(st.calls) === 0, 'android: nessun setItem preceduto da removeItem');
      check(countOp(calls, 'del') === 1 && standaloneDels(st.calls).join(',') === Album.payloadKey(0, 2), 'android: l\'unico removeItem è quello di album.js (p0.2), got ' + countOp(calls, 'del'));
      v = lastSet(st.calls, KEY);
      check(v !== null && v.charAt(v.length - 1) === '}' && JSON.parse(v).photos[0].name === 'città', 'android: album JSON nudo con "città"');
      check(lastSet(st.calls, P01) === fixture.raw6.b64, 'android: payload a lunghezza esatta');
      a2 = new Album(st, function () {});
      check(a2.data.photos[0] && a2.data.photos[0].name === 'città' && a2.data.photos[0].thumb === THUMB, 'android: album riletto');
      next();
    });
  });
});

/* ---- 3. migrazione: valori paddati (versione precedente di index.js) su disco in dev → riletti e riscritti nudi ---- */
steps.push(function (next) {
  var pad = function (s, n) { while (s.length < n) { s += ' '; } return s; };
  var seedAlbum = JSON.stringify({ v: 1, photos: [{ id: 0x3333, name: 'perù', fmts: { 1: { len: 34200, crc: crcA } } }],
                                   order: [0], orderGen: 1, settings: {}, settingsSet: false, deleted: [], orderDirty: true });   /* orderDirty: onDone riscrive l'album */
  var seed = {};
  seed[KEY] = pad(seedAlbum, 65536);
  seed[P01] = pad(fixture.raw6.b64, 65536);
  var st = loggedStorage(seed);
  /* S7 (F12): l'album seminato non ha il campo `stored`, quindi il primo `new Album` lo migra e
   * riscrive subito il JSON (nudo): il padding di partenza va controllato PRIMA del boot. */
  check(st.getItem(KEY).length === 65536 && st.getItem(P01).length === 65536, 'migrazione: valori paddati a 64 Ki caratteri in partenza');
  var en = boot('pypkjs', st);
  check(st.getItem(KEY).length !== 65536 && JSON.parse(st.getItem(KEY)).photos[0].fmts[1].stored === true,
        'migrazione S7: il campo stored viene sondato e il JSON riscritto nudo al primo caricamento');
  check(hasLog(/^\[album\] pronto \(dev server http:\/\/localhost:8765\): 1 foto \[0:6\] ordine \[0\]\*/, en.logStart), 'migrazione: album paddato riletto (1 foto, ordine sporco)');
  waitFor(function () { return countLog(FINE, en.logStart) >= 1; }, function (err) {
    var a2;
    check(!err, 'migrazione: sync conclusa');
    check(en.watch.slots[0].state === 1 && en.watch.slots[0].crc === crcA, 'migrazione: payload paddato decodificato e inviato (b64.decode ignora gli spazi)');
    check(hasLog('[sync] fine: {"photosOk":1,"photosFailed":0,"settings":null,"order":"OK","deletes":[],"photoCodes":[]}', en.logStart), 'migrazione: summary');
    check(setsPrecededByDel(st.calls) === countOp(albumCalls(st.calls), 'set') && countOp(albumCalls(st.calls), 'set') >= 2, 'migrazione: ogni riscrittura è removeItem + setItem');
    check(st.getItem(KEY).charAt(st.getItem(KEY).length - 1) === '}', 'migrazione: album riscritto nudo (onDone dopo ALBUM_ORDER OK)');
    check(st.getItem(P01).length === 65536, 'migrazione: il payload non viene riscritto se non cambia (resta paddato, innocuo)');
    a2 = new Album(st, function () {});
    check(a2.data.photos[0] && a2.data.photos[0].name === 'perù' && a2.data.orderDirty === false, 'migrazione: album riletto nudo: ' + a2.summary());
    next();
  });
});

/* ---- 4. F8: quota sul JSON dell'album → modifiche annullate → nessuna sync (telefono e token dev) ---- */
steps.push(function (next) {
  var st = loggedStorage(), en = boot('android', st);
  waitFor(function () { return countLog(FINE, en.logStart) >= 1; }, function (err) {
    var n1 = en.watch.received.length, l1 = logs.length;
    check(!err, 'quota: prima sync conclusa');
    st.failSet = function (key) { return key === KEY; };            /* il payload si scrive, il JSON no */
    en.pebble.fire('webviewclosed', { response: encodeURIComponent(JSON.stringify(delta())) });
    waitFor(function () { return hasLog('[config] modifiche annullate: nessuna sync', l1); }, function (err2) {
      check(!err2, 'quota (telefono): log "modifiche annullate"');
      check(hasLog('[album] album non salvato: 1 payload annullati, album riletto dal disco', l1), 'quota (telefono): rollback di album.js (1 payload)');
      check(hasLog(/^\[album\] payload delta: ERRORE, cambiato false, nuove \[\] aggiornate \[\] eliminate \[\] errori: .*album non salvato: modifiche annullate$/, l1), 'quota (telefono): log del payload (ERRORE, cambiato false)');
      check(st.getItem(P01) === null && st.getItem(KEY) === null, 'quota (telefono): payload rimosso dal rollback, album mai scritto');
      check(new Album(st, function () {}).count() === 0, 'quota (telefono): album riletto vuoto');
      realSetTimeout(function () {
        check(en.watch.received.length === n1, 'quota (telefono): NESSUN JS_READY (nessuna resync)');
        check(!sync.isRunning(), 'quota (telefono): motore fermo');
        /* stesso esito dal token dev: /save.json (stato completo) applicato con applyDevState */
        st.failSet = null;
        var st2 = loggedStorage(), en2 = boot('pypkjs', st2);
        waitFor(function () { return countLog(FINE, en2.logStart) >= 1; }, function (err3) {
          var n2 = en2.watch.received.length, l2 = logs.length, full = delta();
          check(!err3, 'quota (dev): prima sync conclusa');
          full.full = true;
          devStub.saveState = full;
          st2.failSet = function (key) { return key === KEY; };
          en2.pebble.fire('webviewclosed', { response: encodeURIComponent(JSON.stringify({ v: 1, dev: true, seq: 1 })) });
          waitFor(function () { return hasLog('[config] modifiche annullate: nessuna sync', l2); }, function (err4) {
            check(!err4, 'quota (dev): log "modifiche annullate" dopo /save.json');
            check(hasLog('[dev] salvataggio seq 1: rileggo lo stato', l2), 'quota (dev): token dev letto');
            check(hasLog(/^\[album\] payload completo: ERRORE, cambiato false/, l2), 'quota (dev): /save.json con full:true applicato come stato completo (F10)');
            check(st2.getItem(P01) === null, 'quota (dev): payload annullato (removeItem del rollback)');
            realSetTimeout(function () {
              check(en2.watch.received.length === n2, 'quota (dev): NESSUN JS_READY (nessuna resync)');
              devStub.saveState = null;
              /* controprova: senza quota lo stesso Save fa la sync */
              st2.failSet = null;
              devStub.saveState = full;
              en2.pebble.fire('webviewclosed', { response: encodeURIComponent(JSON.stringify({ v: 1, dev: true, seq: 2 })) });
              waitFor(function () { return countLog(FINE, en2.logStart) >= 2; }, function (err5) {
                check(!err5, 'quota (dev): senza quota il Save fa la sync');
                check(en2.watch.slots[0].state === 1 && en2.watch.slots[0].crc === crcA, 'quota (dev): foto sull\'orologio');
                check(hasLog(/^\[album\] payload completo: ok, cambiato true, nuove \[0\]/, l2), 'quota (dev): payload completo ok');
                devStub.saveState = null;
                next();
              });
            }, 300);
          });
        });
      }, 300);
    });
  });
});

/* 5. quota in DEV con un album GIA' su disco: removeItem+setItem non deve perdere il valore vecchio
 * quando setItem lancia (revisione 29/08): il wrapper lo rimette e il rollback di album.js (F8) rilegge
 * l'album di prima, come sul telefono. */
steps.push(function (next) {
  var st = loggedStorage(), seed = new Album(st, function () {});
  var r0 = seed.applyPayload({ v: 1, photos: [
    { slot: 0, photo_id: 0x1111, fmt: 1, len: 34200, crc: crcA, data: fixture.raw6.b64, name: 'a' }
  ], order: [0] }, {});
  if (!r0.ok) { throw new Error('seed passo 5: ' + r0.errors.join('; ')); }
  var before, P11 = Album.payloadKey(1, 1);
  var en = boot('pypkjs', st);
  waitFor(function () { return countLog(FINE, en.logStart) >= 1; }, function (err) {
    var l = logs.length, n = en.watch.received.length;
    before = st.getItem(KEY);                                       /* dopo la prima sync (onDone riscrive l'album) */
    check(!err, 'quota (dev, album su disco): prima sync conclusa');
    check(en.watch.slots[0].state === 1, 'quota (dev, album su disco): foto 0 sull\'orologio');
    st.failSet = function (key, v) { return key === KEY && v !== before; };   /* il payload nuovo si scrive, il JSON nuovo no (quello vecchio, piu' corto, si') */
    en.pebble.fire('webviewclosed', { response: encodeURIComponent(JSON.stringify({ v: 1, photos: [
      { slot: 1, photo_id: 0x2222, fmt: 1, len: 34200, crc: crcA, data: fixture.raw6.b64, name: 'b' }
    ], order: [0, 1] })) });
    waitFor(function () { return hasLog('[config] modifiche annullate: nessuna sync', l); }, function (err2) {
      var calls = albumCalls(st.calls.slice()), i, lastKeyOps = [];
      check(!err2, 'quota (dev, album su disco): log "modifiche annullate"');
      check(st.getItem(KEY) !== null, 'quota (dev, album su disco): l\'album di prima e\' ANCORA su disco');
      check(st.getItem(KEY) === before, 'quota (dev, album su disco): ...identico a prima (valore rimesso dal wrapper)');
      check(st.getItem(P01) !== null, 'quota (dev, album su disco): payload della foto 0 intatto');
      check(st.getItem(P11) === null, 'quota (dev, album su disco): payload della foto 1 annullato');
      check(new Album(st, function () {}).count() === 1, 'quota (dev, album su disco): album riletto = 1 foto (come sul telefono)');
      for (i = 0; i < calls.length; i++) { if (calls[i][1] === KEY && calls[i][0] !== 'get') { lastKeyOps.push(calls[i][0]); } }
      check(lastKeyOps.slice(-3).join(',') === 'del,fail,set', 'quota (dev, album su disco): sequenza del → fail → set (ripristino), got ' + lastKeyOps.join(','));
      realSetTimeout(function () {
        check(en.watch.received.length === n, 'quota (dev, album su disco): nessun JS_READY');
        st.failSet = null;                                          /* quota liberata: lo stesso Save riesce */
        en.pebble.fire('webviewclosed', { response: encodeURIComponent(JSON.stringify({ v: 1, photos: [
          { slot: 1, photo_id: 0x2222, fmt: 1, len: 34200, crc: crcA, data: fixture.raw6.b64, name: 'b' }
        ], order: [0, 1] })) });
        waitFor(function () { return countLog(FINE, l) >= 1; }, function (err3) {
          check(!err3, 'quota (dev, album su disco): senza quota il Save fa la sync');
          check(new Album(st, function () {}).count() === 2, 'quota (dev, album su disco): 2 foto su disco');
          check(en.watch.slots[1].state === 1, 'quota (dev, album su disco): foto 1 sull\'orologio');
          next();
        });
      }, 300);
    });
  });
});

(function run() {
  var f = steps.shift();
  if (!f) {
    origLog('test_devstorage: ' + pass + ' ok, ' + fail + ' falliti');
    if (fail) { origLog(logs.slice(-40).join('\n')); }
    process.exit(fail ? 1 : 0);
  }
  f(run);
})();

#!/usr/bin/env node
/* test_album.js — test ADVERSARIALE di src/pkjs/album.js (+ src/pkjs/crc.js), S5b.
 *
 * Specifica: docs/design/galleria.md §5 (protocollo) e §5.1 (album, diff, piano).
 * Esecuzione:  cd apps/galleria/test && NODE_PATH=shim node test_album.js
 *              (oppure `make -C apps/galleria/test jstest`).
 * Nessuna dipendenza esterna (la sola §2 usa gli shim `fakewatch`/`message_keys` per il contratto
 * blob ↔ orologio: da qui il NODE_PATH), nessuna sorgente di non determinismo: i CRC di riferimento sono
 * calcolati con una seconda implementazione (bit a bit) e con zlib.crc32 di node, i buffer
 * "casuali" con un LCG a seme fisso, i photo_id sono sempre espliciti tranne dove è proprio il
 * caso "photo_id assente" a essere sotto test (lì si verifica solo che sia ≠ 0 e coerente).
 *
 * Lo storage finto (memStorage) sa guastarsi: setItem che lancia dopo N scritture o sulle chiavi
 * che matchano un pattern (quota), getItem che ritorna `undefined` invece di `null` (WebView).
 *
 * Revisione post code-review S5b (F6/F8/F10): le sezioni 5 e 6 pinnano la semantica "una modifica è
 * registrata solo se è INTERA su disco" (payload nuovo prima della foto vecchia, rimozioni dopo il JSON,
 * rollback + rilettura se il JSON non si scrive, eliminazioni implicite solo con voci tutte identificabili).
 *
 * I controlli marcati `bug('X', …)` documentano i difetti A–D trovati in S5b: sono stati corretti in
 * album.js, quindi oggi PASSANO (stampano "NOTA: il bug X sembra corretto"); un FAIL (BUG X) e' una
 * regressione reale. L'elenco e' in fondo al file e nel rapporto della sessione.
 *
 * S7 (F12): la sezione 11 pinna il campo `stored` dei metadati — plan()/summary()/state()/applyPayload()
 * non leggono piu' le chiavi dei payload (45,6 KB l'una): lo storage finto conta i getItem PER CHIAVE.
 * Mutation testing: GAL_ALBUM=/percorso/album.js sostituisce il modulo sotto test (la copia mutata va
 * in una cartella con accanto b64.js e crc.js, p.es. `cp -r src/pkjs /tmp/mut && sed -i ... /tmp/mut/album.js
 * && GAL_ALBUM=/tmp/mut/album.js NODE_PATH=shim node test/test_album.js`): il test DEVE diventare rosso.
 */

/* GAL_ALBUM (solo mutation testing): modulo album.js da usare al posto di quello del progetto. */
var Album = require(process.env.GAL_ALBUM ? require('path').resolve(process.env.GAL_ALBUM) : '../src/pkjs/album');
var crcm = require('../src/pkjs/crc');
var b64 = require('../src/pkjs/b64');
var fixture = require('./fixture_photo');
var zlib = require('zlib');

/* ---------------------------------------------------------------- contatori */

var g_ok = 0, g_fail = 0;
var g_bugs = {};                     /* id bug noto → n. di asserzioni fallite */

function check(cond, what) {
  if (cond) { g_ok++; } else { g_fail++; console.log('FAIL ' + what); }
}

function eq(got, exp, what) {
  if (got === exp) { g_ok++; }
  else { g_fail++; console.log('FAIL ' + what + ': ottenuto ' + fmt(got) + ', atteso ' + fmt(exp)); }
}

function eqJson(got, exp, what) {
  var a = JSON.stringify(got), b = JSON.stringify(exp);
  if (a === b) { g_ok++; }
  else { g_fail++; console.log('FAIL ' + what + ': ottenuto ' + a + ', atteso ' + b); }
}

/* Asserzione su un bug STORICO (A–D di S5b, oggi corretti): se fallisce conta come fallimento (la
 * suite esce 1) e resta riconoscibile nell'output come regressione. */
function bug(id, cond, what) {
  if (cond) { g_ok++; console.log('NOTA: il bug ' + id + ' sembra corretto (' + what + ')'); }
  else { g_fail++; g_bugs[id] = (g_bugs[id] || 0) + 1; console.log('FAIL (BUG ' + id + ') ' + what); }
}

function fmt(v) {
  if (typeof v === 'string') { return '"' + (v.length > 60 ? v.slice(0, 57) + '...' : v) + '"'; }
  if (v && typeof v === 'object') { return JSON.stringify(v); }
  return String(v);
}

function sec(name) { console.log('-- ' + name); }

/* ------------------------------------------------------- storage finto */

/* opts: failPattern (RegExp: setItem lancia su queste chiavi), failAfter (setItem lancia dalla
 * scrittura numero N in poi), undefinedOnMiss (getItem torna undefined invece di null). */
function memStorage(opts) {
  opts = opts || {};
  var mem = {};
  var st = {
    mem: mem,
    gets: 0, sets: 0, removes: 0, throws: 0,
    writes: {},                       /* chiave → n. scritture riuscite */
    reads: {},                        /* chiave → n. getItem (S7/F12: i payload non si rileggono) */
    failPattern: opts.failPattern || null,
    failAfter: (opts.failAfter === undefined) ? -1 : opts.failAfter,
    undefinedOnMiss: !!opts.undefinedOnMiss,
    getItem: function (k) {
      st.gets++;
      st.reads[k] = (st.reads[k] || 0) + 1;
      if (Object.prototype.hasOwnProperty.call(mem, k)) { return mem[k]; }
      return st.undefinedOnMiss ? undefined : null;
    },
    setItem: function (k, v) {
      if ((st.failPattern && st.failPattern.test(k)) ||
          (st.failAfter >= 0 && st.sets >= st.failAfter)) {
        st.throws++;
        throw new Error('QuotaExceededError (finto) su ' + k);
      }
      st.sets++;
      st.writes[k] = (st.writes[k] || 0) + 1;
      mem[k] = String(v);
    },
    removeItem: function (k) { st.removes++; delete mem[k]; },
    keys: function () { return Object.keys(mem).sort(); },
    has: function (k) { return Object.prototype.hasOwnProperty.call(mem, k); },
    writesOf: function (k) { return st.writes[k] || 0; },
    readsOf: function (k) { return st.reads[k] || 0; },
    /* letture delle sole chiavi dei payload (galleria.v1.p<slot>.<fmt>) */
    payloadReads: function () {
      var n = 0, k;
      for (k in st.reads) {
        if (Object.prototype.hasOwnProperty.call(st.reads, k) && k.indexOf('galleria.v1.p') === 0) { n += st.reads[k]; }
      }
      return n;
    },
    resetReads: function () { st.reads = {}; }
  };
  return st;
}

/* getItem che LANCIA sulle sole chiavi dei payload (localStorage negato/rotto per una lettura
 * grossa): il contatore delle letture conta lo stesso, così si vede quante sonde sono partite. */
function throwOnPayloads(st, on) {
  if (on) {
    if (!st.realGet) { st.realGet = st.getItem; }
    st.getItem = function (k) {
      if (k.indexOf('galleria.v1.p') === 0) {
        st.gets++; st.reads[k] = (st.reads[k] || 0) + 1;
        throw new Error('SecurityError (finto) su ' + k);
      }
      return st.realGet(k);
    };
  } else if (st.realGet) {
    st.getItem = st.realGet; st.realGet = null;
  }
  return st;
}

var LOGS = [];
function log(m) { LOGS.push(String(m)); }
function logsSince(n) { return LOGS.slice(n).join(' | '); }

/* ------------------------------------------------------- dati di prova */

var R6 = fixture.raw6.b64, C6 = fixture.raw6.crc >>> 0, LEN6 = 34200;
var R1 = fixture.raw1.b64, C1 = fixture.raw1.crc >>> 0, LEN1 = 3024;
var PKEY = Album.payloadKey;

/* Un base64url alterato in mezzo: stessi caratteri validi, byte (e quindi CRC) diversi. */
function corruptB64(str) {
  var i = Math.floor(str.length / 2), c = str.charAt(i);
  return str.substring(0, i) + (c === 'A' ? 'B' : 'A') + str.substring(i + 1);
}

/* Un secondo raw6/raw1 valido con CRC diverso (un byte alterato e ricodificato): la "foto B" dei
 * test di sostituzione e ri-ritaglio (revisione post code-review, F6/F8). */
var bytes6b = b64.decode(R6); bytes6b[100] ^= 1;
var R6b = b64.encode(bytes6b), C6b = crcm.crc32(bytes6b) >>> 0;
var bytes1b = b64.decode(R1); bytes1b[10] ^= 1;
var R1b = b64.encode(bytes1b), C1b = crcm.crc32(bytes1b) >>> 0;

/* failPattern che colpisce SOLO il JSON dell'album (i payload e il watch si scrivono). */
var ALBUM_RE = new RegExp('^' + Album.KEY.replace(/\./g, '\\.') + '$');
/* messaggi di applyPayload pinnati dai test (F10, F8) */
var SKIPPED = 'stato completo con voci non identificabili: eliminazioni implicite saltate';
var ROLLED_BACK = 'album non salvato: modifiche annullate';

function hasErr(r, s) { return r.errors.join(';').indexOf(s) >= 0; }

function freshAlbum(opts) {
  var st = memStorage(opts);
  return { st: st, a: new Album(st, log) };
}

/* Un album salvato "a mano" nello storage, per i test di caricamento. */
function storedAlbum(over, opts) {
  var st = memStorage(opts), d = { v: 1, photos: [], order: [], settings: {}, deleted: [],
                                   orderDirty: false, watch: null }, k;
  for (k = 0; k < 12; k++) { d.photos.push(null); }
  for (k in over) { if (Object.prototype.hasOwnProperty.call(over, k)) { d[k] = over[k]; } }
  st.setItem(Album.KEY, JSON.stringify(d));
  return { st: st, load: function () { return new Album(st, log); } };
}

function rec(id, crc6, crc1) {
  var p = { id: id, name: '', fmts: {} };
  if (crc6 !== undefined && crc6 !== null) { p.fmts[1] = { len: LEN6, crc: crc6 }; }
  if (crc1 !== undefined && crc1 !== null) { p.fmts[2] = { len: LEN1, crc: crc1 }; }
  return p;
}

/* hello finto: {valid: [[slot, crc], …]} */
function hello(o) {
  o = o || {};
  var slots = [], i;
  for (i = 0; i < 12; i++) { slots.push({ state: 0, crc: 0 }); }
  (o.valid || []).forEach(function (v) { slots[v[0]] = { state: 1, crc: v[1] >>> 0 }; });
  return { format: (o.format === undefined) ? 1 : o.format,
           maxChunk: (o.maxChunk === undefined) ? 4096 : o.maxChunk,
           settingsCrc: o.settingsCrc, openMs: o.openMs, slots: slots };
}

function planSlots(plan) { return plan.photos.map(function (p) { return p.slot; }); }

/* id e CRC di una foto in RAM senza lanciare su uno slot vuoto (un mutante deve dare FAIL, non un crash) */
function pid(a, k) { var p = a.data.photos[k]; return p ? p.id : null; }
function pcrc(a, k, f) { var p = a.data.photos[k]; return (p && p.fmts[f]) ? p.fmts[f].crc : null; }
/* fmts SENZA il campo `stored` (S7): le asserzioni storiche restano leggibili; il campo ha i suoi
 * controlli in sezione 11 (pstored). */
function pfmts(a, k) {
  var p = a.data.photos[k], out = {}, f;
  if (!p) { return null; }
  for (f = 1; f <= 2; f++) {
    if (p.fmts[f]) { out[f] = { len: p.fmts[f].len, crc: p.fmts[f].crc }; }
  }
  return out;
}
/* `stored` grezzo del formato (undefined se il formato non c'è, null se non ancora sondato) */
function pstored(a, k, f) {
  var p = a.data.photos[k];
  return (p && p.fmts[f]) ? p.fmts[f].stored : undefined;
}
/* CRC dei byte consegnati da load() della prima foto del piano ('ERR …' se manca o fallisce) */
function loadCrc(plan) {
  var got = 'ERR nessuna foto nel piano';
  if (plan.photos[0]) { plan.photos[0].load(function (err, bytes) { got = err ? ('ERR ' + err) : crcm.crc32(bytes); }); }
  return got;
}

/* ============================================================ 1. crc.js */

sec('1. crc.js');

/* CRC-32 riflesso, bit a bit: implementazione di riferimento indipendente dalla tabella. */
function refCrc32(bytes, prev) {
  var c = (((prev === undefined) ? 0 : prev) >>> 0) ^ 0xFFFFFFFF, i, k;
  for (i = 0; i < bytes.length; i++) {
    c = (c ^ bytes[i]) >>> 0;
    for (k = 0; k < 8; k++) { c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    c = c >>> 0;
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function refCrc16(bytes) {
  var c = 0xFFFF, i, k;
  for (i = 0; i < bytes.length; i++) {
    c ^= (bytes[i] & 0xFF) << 8;
    for (k = 0; k < 8; k++) { c = (c & 0x8000) ? (((c << 1) ^ 0x1021) & 0xFFFF) : ((c << 1) & 0xFFFF); }
  }
  return c & 0xFFFF;
}

function str2bytes(s) { var o = [], i; for (i = 0; i < s.length; i++) { o.push(s.charCodeAt(i) & 0xFF); } return o; }

var V9 = str2bytes('123456789');
eq(crcm.crc32(V9), 0xCBF43926, 'crc32("123456789")');
eq(crcm.crc16(V9), 0x29B1, 'crc16("123456789") CCITT-FALSE');
eq(crcm.crc32([]), 0, 'crc32 del vuoto');
eq(crcm.crc16([]), 0xFFFF, 'crc16 del vuoto');
eq(crcm.crc32(null), 0, 'crc32(null) = 0 (nessuna eccezione)');
eq(crcm.crc16(undefined), 0xFFFF, 'crc16(undefined) = 0xFFFF');
eq(crcm.crc32([0]), 0xD202EF8D, 'crc32([0])');
eq(crcm.crc32([0, 0, 0, 0]), 0x2144DF1C, 'crc32(4 zeri)');
check(crcm.crc32(V9) >= 0, 'crc32 senza segno');
eq(crcm.crc32(str2bytes('a')) >>> 0, refCrc32(str2bytes('a')), 'crc32("a") = riferimento bit a bit');

/* continuazione: crc32(b, crc32(a)) === crc32(a+b) */
(function () {
  var a = str2bytes('12345'), b = str2bytes('6789');
  eq(crcm.crc32(b, crcm.crc32(a)), 0xCBF43926, 'crc32 continuato su "12345"+"6789"');
  eq(crcm.crc32([], crcm.crc32(a)), crcm.crc32(a), 'crc32 continuato con buffer vuoto');
  eq(crcm.crc16(b, crcm.crc16(a)), crcm.crc16(a.concat(b)), 'crc16 continuato');
})();

/* buffer casuali (LCG a seme fisso) contro zlib.crc32 di node e contro il riferimento. */
(function () {
  var seed = 0x12345678, i, n, buf, j, got, exp, exp2, splits = 0;
  function next() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 24) & 0xFF; }
  var bad = 0, badSplit = 0;
  for (i = 0; i < 60; i++) {
    n = (i * 7) % 300;
    buf = [];
    for (j = 0; j < n; j++) { buf.push(next()); }
    got = crcm.crc32(buf);
    exp = refCrc32(buf);
    exp2 = zlib.crc32 ? (zlib.crc32(Buffer.from(buf)) >>> 0) : exp;
    if (got !== exp || got !== exp2) { bad++; }
    if (crcm.crc16(buf) !== refCrc16(buf)) { bad++; }
    /* continuazione su un punto di taglio arbitrario */
    if (n > 4) {
      splits++;
      if (crcm.crc32(buf.slice(3), crcm.crc32(buf.slice(0, 3))) !== got) { badSplit++; }
    }
  }
  eq(bad, 0, 'crc32/crc16 su 60 buffer LCG = zlib.crc32 + riferimento bit a bit');
  eq(badSplit, 0, 'crc32 continuato su ' + splits + ' buffer LCG');
})();

/* la fixture: i CRC dichiarati devono essere quelli dei byte decodificati */
eq(crcm.crc32(b64.decode(R6)), C6, 'crc32 della fixture raw6');
eq(crcm.crc32(b64.decode(R1)), C1, 'crc32 della fixture raw1');
eq(b64.decode(R6).length, LEN6, 'lunghezza della fixture raw6');
eq(b64.decode(R1).length, LEN1, 'lunghezza della fixture raw1');
check(crcm.crc32(b64.decode(corruptB64(R6))) !== C6, 'la fixture alterata ha un CRC diverso');

/* ============================================== 2. album vuoto e impostazioni */

sec('2. album vuoto e impostazioni');

(function () {
  var f = freshAlbum(), a = f.a;
  eq(a.count(), 0, 'album vuoto: 0 foto');
  eqJson(a.data.order, [], 'album vuoto: ordine vuoto');
  eqJson(a.data.deleted, [], 'album vuoto: nessuna eliminazione');
  eq(a.data.orderDirty, false, 'album vuoto: orderDirty falso');
  eq(a.data.watch, null, 'album vuoto: nessun watch');
  eq(a.data.photos.length, 12, 'album vuoto: 12 slot');
  eqJson(a.data.settings, { layout: 0, font: 0, clock_mode: 0, leading_zero: 0, text_color: 0,
                            outline: 0, interval_min: 30, order: 0, shake_next: 1, info_row: 15,
                            digit_style: 0 },
         'impostazioni di default (settings.c): i vecchi campi invariati, digit_style 0 (S8)');
  eqJson(Album.defaultSettings(), a.data.settings, 'Album.defaultSettings() = quelle dell\'album vuoto');
  eq(f.st.keys().length, 0, 'costruire un album non scrive nulla');

  var bytes = a.settingsBytes();
  eq(bytes.length, 20, 'GalSettings: 20 byte');
  eqJson(bytes, [1, 0, 0, 0, 0, 0, 0, 30, 0, 0, 1, 15, 0, 0, 0, 0, 0, 0, 0xE7, 0x7E],
         'blob dei default (schema 1, interval 30 LE, shake 1, info_row 15, digit_style 0, crc16 0x7EE7)');
  eq(a.settingsCrc(), 0x7EE7, 'settingsCrc dei default = 0x7EE7 (uguale a quello del C)');
  eq(bytes[18] | (bytes[19] << 8), a.settingsCrc(), 'crc16 in coda, little endian');
  eq(crcm.crc16(bytes.slice(0, 18)), a.settingsCrc(), 'settingsCrc = crc16 dei primi 18 byte');
  eq(Album.settingsCrc(Album.defaultSettings()), 0x7EE7, 'Album.settingsCrc esportata');

  /* i campi devono stare al posto giusto: un blob "tutto diverso" */
  var s2 = Album.normalizeSettings({ layout: 1, font: 5, clock_mode: 2, leading_zero: 1, text_color: 4,
                                     outline: 2, interval_min: 1440, order: 1, shake_next: 0, info_row: 3,
                                     digit_style: 2 }, null);
  var b2 = Album.settingsBytes(s2);
  eq(b2.length, 20, 'settingsBytes: 20 byte anche con digit_style');
  eqJson(b2.slice(0, 12), [1, 1, 5, 2, 1, 4, 2, 1440 & 0xFF, 1440 >> 8, 1, 0, 3],
         'ordine dei campi nel blob (font 5, interval_min u16 LE = 1440)');
  eq(b2[12], 2, 'byte 12 = digit_style (S8/D21, ex primo `reserved`)');
  eqJson(b2.slice(13, 18), [0, 0, 0, 0, 0], 'reserved[5] a zero');
  check(Album.settingsCrc(s2) !== 0x7EE7, 'impostazioni diverse → crc diverso');

  /* digit_style entra nel CRC: due impostazioni che differiscono solo per lo stile devono
   * far ripartire una sync delle impostazioni (design §5.1, HELLO.CRC) */
  var sFill = Album.defaultSettings();
  var s3D = Album.normalizeSettings({ digit_style: 3 }, sFill);
  eq(Album.settingsBytes(s3D)[12], 3, 'digit_style 3 → byte 12 = 3');
  eqJson(Album.settingsBytes(s3D).slice(0, 12), Album.settingsBytes(sFill).slice(0, 12),
         'digit_style non tocca i primi 12 byte');
  check(Album.settingsCrc(s3D) !== Album.settingsCrc(sFill), 'digit_style diverso → CRC diverso');
  var s3Dbis = Album.normalizeSettings({ digit_style: 3 }, sFill);
  eq(Album.settingsCrc(s3Dbis), Album.settingsCrc(s3D), 'stesso digit_style → stesso CRC');
})();

/* normalizeSettings: intervalli di settings_validate() */
(function () {
  var d = Album.defaultSettings();
  eq(Album.normalizeSettings({ layout: 2 }, null).layout, 0, 'layout 2 fuori intervallo → 0');
  eq(Album.normalizeSettings({ font: 3 }, null).font, 3, 'font 3 (LECO) valido');
  eq(Album.normalizeSettings({ font: 4 }, null).font, 4, 'font 4 valido (S8/D22)');
  eq(Album.normalizeSettings({ font: 5 }, null).font, 5, 'font 5 valido (S8/D22)');
  eq(Album.normalizeSettings({ font: 6 }, null).font, 0, 'font 6 fuori intervallo → 0');
  eq(Album.normalizeSettings({ digit_style: 0 }, null).digit_style, 0, 'digit_style 0 (pieno) valido');
  eq(Album.normalizeSettings({ digit_style: 3 }, null).digit_style, 3, 'digit_style 3 (pieno 3D) valido');
  eq(Album.normalizeSettings({ digit_style: 4 }, null).digit_style, 0, 'digit_style 4 fuori intervallo → 0');
  eq(Album.normalizeSettings({ digit_style: -1 }, null).digit_style, 0, 'digit_style negativo → 0');
  eq(Album.normalizeSettings({ digit_style: '2' }, null).digit_style, 2, 'digit_style "2" (stringa) accettato');
  eq(Album.normalizeSettings({}, null).digit_style, 0, 'digit_style di default = 0 (pieno)');
  eq(Album.normalizeSettings({ info_row: 16 }, null).info_row, 15, 'info_row 16 → 15');
  eq(Album.normalizeSettings({ info_row: 0 }, null).info_row, 0, 'info_row 0 valido');
  eq(Album.normalizeSettings({ interval_min: 7 }, null).interval_min, 30, 'interval_min 7 non in lista → 30');
  eq(Album.normalizeSettings({ interval_min: 0 }, null).interval_min, 0, 'interval_min 0 (mai) valido');
  eq(Album.normalizeSettings({ interval_min: 1440 }, null).interval_min, 1440, 'interval_min 1440 valido');
  eq(Album.normalizeSettings({ interval_min: 1441 }, null).interval_min, 30, 'interval_min 1441 → 30');
  eq(Album.normalizeSettings({ interval_min: '15' }, null).interval_min, 15, 'stringa numerica accettata');
  eq(Album.normalizeSettings({ layout: '1' }, null).layout, 1, 'layout "1" accettato');
  eq(Album.normalizeSettings({ layout: '' }, null).layout, 0, 'stringa vuota → default');
  eq(Album.normalizeSettings({ layout: 'x' }, null).layout, 0, 'stringa non numerica → default');
  eq(Album.normalizeSettings({ layout: 1.5 }, null).layout, 0, 'non intero → default');
  eq(Album.normalizeSettings({ layout: true }, null).layout, 0, 'booleano → default');
  eq(Album.normalizeSettings({ layout: -1 }, null).layout, 0, 'negativo → default');
  eq(Album.normalizeSettings({ layout: null }, null).layout, 0, 'null → default');
  eq(Album.normalizeSettings({}, null).shake_next, 1, 'shake_next di default = 1');
  /* merge con la base */
  var base = Album.normalizeSettings({ layout: 1, font: 2, interval_min: 60 }, null);
  var m = Album.normalizeSettings({ font: 1 }, base);
  eq(m.layout, 1, 'merge: layout dalla base');
  eq(m.font, 1, 'merge: font dal nuovo');
  eq(m.interval_min, 60, 'merge: interval_min dalla base');
  eq(Album.normalizeSettings({ layout: 9 }, base).layout, 0, 'merge: valore non valido → default del campo, non la base');
  eq(Object.keys(m).length, 11, '11 campi');
  eq(Album.SETTINGS_FIELDS.length, 11, 'SETTINGS_FIELDS: 11 campi (S8: + digit_style)');
  /* un album salvato prima di S8 non ha digit_style: si rilegge con 0, senza sporcare il resto */
  var old8 = storedAlbum({ settings: { layout: 1, font: 2, clock_mode: 0, leading_zero: 0, text_color: 0,
                                       outline: 0, interval_min: 15, order: 0, shake_next: 1, info_row: 15 },
                           settingsSet: true }).load();
  eq(old8.data.settings.digit_style, 0, 'album pre-S8 (senza digit_style): riletto con 0');
  eq(old8.data.settings.layout, 1, 'album pre-S8: gli altri campi restano');
  eq(old8.data.settings.interval_min, 15, 'album pre-S8: interval_min resta');
  eq(old8.settingsBytes()[12], 0, 'album pre-S8: byte 12 = 0 (blob vecchio, nessuna migrazione)');
})();

/* Contratto con l'orologio: ogni blob che album.js accetta come valido deve essere accettato anche
 * dal modello dell'orologio (shim/fakewatch.js, specchio di settings_validate() in src/c/settings.c),
 * e viceversa un blob fuori intervallo deve essere rifiutato da tutti e due. Senza questo controllo
 * la fake watch resta ferma agli intervalli pre-S8 (font <= 3, nessun controllo sul byte 12) e i test
 * del motore di sync non possono esercitare i font 4/5 ne' `digit_style` (revisione S8-stile). */
(function () {
  var FakeWatch = require('fakewatch');
  var mkeys = require('message_keys');

  function sendBlob(blob) {
    var w = new FakeWatch({}), d = {};
    d[mkeys.MSG] = FakeWatch.MSG.SETTINGS; d[mkeys.SETTINGS] = blob;
    var out = w.handle(d);
    /* FakeWatch.get: con GAL_NAMEKEYS=1 (shim/fakewatch.js) i payload verso il PKJS hanno le
     * chiavi-NOME dell'app Core Devices, qui leggo il CODE in tutte e due le forme. */
    return { code: out.length ? FakeWatch.get(out[0], 'CODE') : -1, watch: w };
  }

  var font, style, s, r;
  for (font = 0; font <= 5; font++) {
    for (style = 0; style <= 3; style++) {
      s = Album.normalizeSettings({ font: font, digit_style: style }, null);
      r = sendBlob(Album.settingsBytes(s));
      eq(r.code, FakeWatch.CODE.OK, 'fakewatch accetta font ' + font + ' + digit_style ' + style);
      eq(r.watch.settings[2], font, 'fakewatch: font ' + font + ' memorizzato nel byte 2');
      eq(r.watch.settings[12], style, 'fakewatch: digit_style ' + style + ' memorizzato nel byte 12');
      eq(r.watch.settingsCrc(), Album.settingsCrc(s),
         'CRC dell\'orologio = settingsCrc(album) con font ' + font + ' + digit_style ' + style);
    }
  }
  /* blob grezzi fuori intervallo: il C risponde BAD_FORMAT, la fake watch deve fare altrettanto */
  var bad = Album.settingsBytes(Album.defaultSettings()); bad[12] = 4;
  eq(sendBlob(bad).code, FakeWatch.CODE.BAD_FORMAT, 'fakewatch rifiuta digit_style 4 (blob grezzo)');
  bad = Album.settingsBytes(Album.defaultSettings()); bad[12] = 255;
  eq(sendBlob(bad).code, FakeWatch.CODE.BAD_FORMAT, 'fakewatch rifiuta digit_style 255 (blob grezzo)');
  bad = Album.settingsBytes(Album.defaultSettings()); bad[2] = 6;
  eq(sendBlob(bad).code, FakeWatch.CODE.BAD_FORMAT, 'fakewatch rifiuta font 6 (blob grezzo)');
})();

/* ================================================== 3. caricamento da storage */

sec('3. caricamento (JSON ostile)');

(function () {
  var st = memStorage(), a, n;
  st.setItem(Album.KEY, '{questo non e json');
  n = LOGS.length;
  a = new Album(st, log);
  eq(a.count(), 0, 'JSON corrotto → album vuoto');
  check(logsSince(n).indexOf('non valido') >= 0, 'JSON corrotto → log ("' + logsSince(n) + '")');
  eqJson(a.state().settings, Album.defaultSettings(), 'JSON corrotto → impostazioni di default');
})();

(function () {
  var st = memStorage(), a;
  st.setItem(Album.KEY, JSON.stringify({ v: 2, photos: [rec(1, C6)] }));
  a = new Album(st, log);
  eq(a.count(), 0, 'v diverso → album vuoto');
})();

(function () {
  var st = memStorage(), a;
  st.setItem(Album.KEY, JSON.stringify({ v: 1, photos: { 0: rec(1, C6) } }));
  a = new Album(st, log);
  eq(a.count(), 0, 'photos non array → album vuoto');
  st.setItem(Album.KEY, JSON.stringify({ v: 1 }));
  eq(new Album(st, log).count(), 0, 'photos assente → album vuoto');
  st.setItem(Album.KEY, 'null');
  eq(new Album(st, log).count(), 0, 'JSON "null" → album vuoto');
  st.setItem(Album.KEY, '[1,2,3]');
  eq(new Album(st, log).count(), 0, 'JSON array → album vuoto');
  st.setItem(Album.KEY, '"stringa"');
  eq(new Album(st, log).count(), 0, 'JSON stringa → album vuoto');
})();

(function () {
  /* record foto malformati: id 0/mancante/non intero, fmts con len sbagliata o vuoti */
  var photos = [], k;
  for (k = 0; k < 12; k++) { photos.push(null); }
  photos[0] = { id: 0, fmts: { 1: { len: LEN6, crc: C6 } } };
  photos[1] = { fmts: { 1: { len: LEN6, crc: C6 } } };
  photos[2] = { id: 1.5, fmts: { 1: { len: LEN6, crc: C6 } } };
  photos[3] = { id: 3, fmts: { 1: { len: 99, crc: C6 } } };
  photos[4] = { id: 4, fmts: {} };
  photos[5] = { id: 5 };
  photos[6] = 'boh';
  photos[7] = { id: 7, fmts: { 1: { len: LEN6 } } };                       /* crc mancante */
  photos[8] = { id: 8, fmts: { 1: { len: LEN6, crc: C6 }, 2: { len: 7, crc: 1 } } };  /* solo fmt 1 valido */
  photos[9] = { id: 9, name: 12, thumb: 34, fmts: { 2: { len: LEN1, crc: -1 } } };
  var s = storedAlbum({ photos: photos, order: [0, 1, 8, 9] });
  var a = s.load();
  eq(a.count(), 2, 'solo gli slot 8 e 9 sopravvivono');
  eq(a.data.photos[0], null, 'id 0 → scartato');
  eq(a.data.photos[1], null, 'id mancante → scartato');
  eq(a.data.photos[2], null, 'id non intero → scartato');
  eq(a.data.photos[3], null, 'len sbagliata → scartato');
  eq(a.data.photos[4], null, 'fmts vuoto → scartato');
  eq(a.data.photos[5], null, 'fmts assente → scartato');
  eq(a.data.photos[6], null, 'record non oggetto → scartato');
  eq(a.data.photos[7], null, 'crc mancante → scartato');
  eqJson(pfmts(a, 8), { 1: { len: LEN6, crc: C6 } }, 'slot 8: solo il formato valido');
  eq(pcrc(a, 9, 2), 0xFFFFFFFF, 'crc -1 riletto come uint32');
  eq(a.data.photos[9].name, '', 'name non stringa → ""');
  eq(a.data.photos[9].thumb, undefined, 'thumb non stringa → assente');
  eqJson(a.data.order, [8, 9], 'ordine: via gli slot senza foto');
})();

(function () {
  /* order con slot vuoti, duplicati, fuori range: _fixOrder corregge e (da specifica) marca orderDirty */
  var photos = [], k;
  for (k = 0; k < 12; k++) { photos.push(null); }
  photos[0] = rec(1, C6); photos[3] = rec(2, C6);

  var a = storedAlbum({ photos: photos, order: [5, 0, 3] }).load();
  eqJson(a.data.order, [0, 3], 'order con slot vuoto → filtrato');
  bug('B', a.data.orderDirty === true, 'order con slot vuoto corretto al caricamento → orderDirty');

  a = storedAlbum({ photos: photos, order: [0, 0, 3, 3] }).load();
  eqJson(a.data.order, [0, 3], 'order con duplicati → deduplicato');
  bug('B', a.data.orderDirty === true, 'order con duplicati corretto al caricamento → orderDirty');

  a = storedAlbum({ photos: photos, order: [12, -1, 0, 3, '3', 1.5] }).load();
  eqJson(a.data.order, [0, 3], 'order con valori fuori range → filtrato');
  bug('B', a.data.orderDirty === true, 'order fuori range corretto al caricamento → orderDirty');

  a = storedAlbum({ photos: photos, order: [3] }).load();
  eqJson(a.data.order, [3, 0], 'slot mancante dall\'ordine → accodato');
  eq(a.data.orderDirty, true, 'slot accodato → orderDirty');

  a = storedAlbum({ photos: photos, order: [3, 0] }).load();
  eqJson(a.data.order, [3, 0], 'ordine già coerente → invariato');
  eq(a.data.orderDirty, false, 'ordine già coerente → orderDirty invariato');

  a = storedAlbum({ photos: photos, order: [3, 0], orderDirty: true }).load();
  eq(a.data.orderDirty, true, 'orderDirty salvato viene conservato');

  a = storedAlbum({ photos: photos, order: 'ciao' }).load();
  eqJson(a.data.order, [0, 3], 'order non array → ricostruito');
  a = storedAlbum({ photos: photos }).load();
  eqJson(a.data.order, [0, 3], 'order assente → ricostruito');
})();

(function () {
  /* deleted non validi + deleted che si sovrappone alle foto */
  var photos = [], k;
  for (k = 0; k < 12; k++) { photos.push(null); }
  photos[0] = rec(1, C6);
  var a = storedAlbum({ photos: photos, order: [0], deleted: [1, '2', 12, -1, 1, 3.5, null, 4] }).load();
  eqJson(a.data.deleted, [1, 4], 'deleted: solo gli slot validi, senza duplicati');

  a = storedAlbum({ photos: photos, order: [0], deleted: [0] }).load();
  bug('C', a.data.deleted.indexOf(0) < 0,
      'uno slot con foto non può restare fra le eliminazioni pendenti dopo il caricamento');
  var p = a.plan(hello({ valid: [[0, C6]], settingsCrc: a.settingsCrc() }));
  bug('C', !(p.order && p.order.indexOf(0) >= 0 && p.deletes.indexOf(0) >= 0),
      'lo stesso slot non può stare sia in ALBUM_ORDER sia fra le ALBUM_DELETE');
})();

(function () {
  var photos = [], k;
  for (k = 0; k < 12; k++) { photos.push(null); }
  eq(storedAlbum({ photos: photos, watch: 42 }).load().data.watch, null, 'watch numero → null');
  eq(storedAlbum({ photos: photos, watch: 'x' }).load().data.watch, null, 'watch stringa → null');
  eq(storedAlbum({ photos: photos, watch: null }).load().data.watch, null, 'watch null → null');
  eq(storedAlbum({ photos: photos, watch: { a: 1 } }).load().data.watch, null, 'watch dentro l\'album ignorato (vive nella chiave galleria.v1.watch, S5b)');
  (function () {
    var f2 = storedAlbum({ photos: photos });
    f2.st.setItem('galleria.v1.watch', JSON.stringify({ at: 1, format: 1, slots: [] }));
    eq(f2.load().data.watch.format, 1, 'watch riletto dalla chiave separata');
    f2.st.setItem('galleria.v1.watch', '{corrotto');
    eq(f2.load().data.watch, null, 'watch corrotto → null');
  })();
  eq(storedAlbum({ photos: photos, settings: 'x' }).load().data.settings.interval_min, 30,
     'settings non oggetto → default');
  eq(storedAlbum({ photos: photos, orderDirty: 'sì' }).load().data.orderDirty, true, 'orderDirty coercizzato');
})();

(function () {
  /* getItem che ritorna undefined invece di null (WebView): niente log, album vuoto */
  var st = memStorage({ undefinedOnMiss: true }), n = LOGS.length, a = new Album(st, log);
  eq(a.count(), 0, 'getItem undefined → album vuoto');
  eq(logsSince(n), '', 'getItem undefined → nessun log di album corrotto');
  eq(a.getPayload(0, 1), null, 'getPayload con getItem undefined → null');
  eq(a.hasPayload(0, 1), false, 'hasPayload con getItem undefined → false');
})();

(function () {
  /* storage che lancia in lettura */
  var st = {
    getItem: function () { throw new Error('SecurityError'); },
    setItem: function () {},
    removeItem: function () {}
  };
  var a = new Album(st, log);
  eq(a.count(), 0, 'getItem che lancia → album vuoto, nessuna eccezione');
  eq(a.getPayload(0, 1), null, 'getPayload con getItem che lancia → null');
  eq(a.hasPayload(3, 2), false, 'hasPayload con getItem che lancia → false');
})();

(function () {
  /* payload vuoto o non stringa in localStorage */
  var f = freshAlbum(), st = f.st;
  st.setItem(PKEY(0, 1), '');
  eq(f.a.getPayload(0, 1), null, 'payload stringa vuota → null');
  eq(f.a.hasPayload(0, 1), false, 'payload stringa vuota → hasPayload false');
})();

/* ================================================ 4. applyPayload — delta */

sec('4. applyPayload (delta)');

function entry(slot, id, fmt, over) {
  var e = { slot: slot, photo_id: id, fmt: fmt,
            len: (fmt === 1) ? LEN6 : LEN1,
            crc: (fmt === 1) ? C6 : C1,
            data: (fmt === 1) ? R6 : R1 };
  for (var k in over) { if (Object.prototype.hasOwnProperty.call(over, k)) { e[k] = over[k]; } }
  return e;
}

/* La stessa voce con la "foto B": payload valido a CRC diverso (sostituzione o ri-ritaglio). */
function entryB(slot, id, fmt, over) {
  var e = entry(slot, id, fmt, { crc: (fmt === 1) ? C6b : C1b, data: (fmt === 1) ? R6b : R1b });
  for (var k in over) { if (Object.prototype.hasOwnProperty.call(over, k)) { e[k] = over[k]; } }
  return e;
}

(function () {
  /* voce valida: foto registrata, payload salvato, added, ordine accodato, orderDirty */
  var f = freshAlbum(), a = f.a, st = f.st;
  var r = a.applyPayload({ v: 1, photos: [entry(2, 0x1234, 1, { name: 'foto A' })] }, {});
  eq(r.ok, true, 'esito ok');
  eq(r.changed, true, 'changed');
  eqJson(r.added, [2], 'added = [2]');
  eqJson(r.updated, [], 'updated vuoto');
  eqJson(r.deleted, [], 'deleted vuoto');
  eqJson(r.errors, [], 'nessun errore');
  eq(a.count(), 1, 'una foto');
  eq(pid(a, 2), 0x1234, 'photo_id registrato');
  eq(a.data.photos[2].name, 'foto A', 'name registrato');
  eqJson(pfmts(a, 2), { 1: { len: LEN6, crc: C6 } }, 'fmts registrati');
  eq(st.mem[PKEY(2, 1)], R6, 'payload in galleria.v1.p2.1');
  eq(a.hasPayload(2, 1), true, 'hasPayload');
  eq(a.hasPayload(2, 2), false, 'nessun payload per l\'altro formato');
  eqJson(a.data.order, [2], 'slot accodato all\'ordine');
  eq(a.data.orderDirty, true, 'orderDirty');
  eq(st.writesOf(Album.KEY), 1, 'una sola scrittura del JSON dell\'album per applyPayload');
  eq(st.writesOf(PKEY(2, 1)), 1, 'una sola scrittura del payload');
  /* seconda foto: accodata */
  a.applyPayload({ v: 1, photos: [entry(0, 0x5678, 1)] }, {});
  eqJson(a.data.order, [2, 0], 'seconda foto accodata in fondo');
  eq(a.data.photos[2].name, 'foto A', 'la prima foto non è toccata');

  /* idempotenza: stesso payload due volte */
  var setsBefore = st.sets, r2 = a.applyPayload({ v: 1, photos: [entry(2, 0x1234, 1, { name: 'foto A' })] }, {});
  eq(r2.ok, true, 'idempotente: ok');
  eq(r2.changed, false, 'idempotente: changed false');
  eqJson(r2.added, [], 'idempotente: nessun added');
  eqJson(r2.updated, [], 'idempotente: nessun updated');
  eqJson(r2.errors, [], 'idempotente: nessun errore');
  eq(st.writesOf(PKEY(2, 1)), 1, 'idempotente: nessuna riscrittura del payload');
  eq(st.sets - setsBefore, 1, 'idempotente: solo il JSON dell\'album viene riscritto');
  eqJson(a.data.order, [2, 0], 'idempotente: ordine invariato');

  /* stesso id, crc diverso → updated, payload sostituito */
  var bad = corruptB64(R6), badCrc = crcm.crc32(b64.decode(bad));
  var r3 = a.applyPayload({ v: 1, photos: [entry(2, 0x1234, 1, { crc: badCrc, data: bad })] }, {});
  eq(r3.changed, true, 'stesso id crc diverso: changed');
  eqJson(r3.updated, [2], 'stesso id crc diverso: updated');
  eqJson(r3.added, [], 'stesso id crc diverso: non added');
  eq(pid(a, 2), 0x1234, 'stesso id conservato');
  eq(a.data.photos[2].crc, undefined, 'il crc sta dentro fmts');
  eq(pcrc(a, 2, 1), badCrc, 'crc aggiornato');
  eq(st.mem[PKEY(2, 1)], bad, 'payload sostituito');
  eqJson(a.data.order, [2, 0], 'aggiornamento: ordine invariato');
})();

(function () {
  /* id diverso nello stesso slot: foto nuova, via il payload dell'ALTRO formato */
  var f = freshAlbum(), a = f.a, st = f.st;
  a.applyPayload({ v: 1, photos: [entry(1, 0xAAAA, 1), entry(1, 0xAAAA, 2)] }, {});
  eq(a.hasPayload(1, 1) && a.hasPayload(1, 2), true, 'due formati presenti');
  eqJson(pfmts(a, 1), { 1: { len: LEN6, crc: C6 }, 2: { len: LEN1, crc: C1 } },
         'due voci (fmt 1 e 2) stesso slot stesso id → entrambi i formati');
  var r = a.applyPayload({ v: 1, photos: [entry(1, 0xBBBB, 1)] }, {});
  eqJson(r.added, [1], 'id diverso → added');
  eq(pid(a, 1), 0xBBBB, 'nuovo id nello slot');
  eqJson(pfmts(a, 1), { 1: { len: LEN6, crc: C6 } }, 'solo il formato ricevuto');
  eq(a.hasPayload(1, 2), false, 'payload dell\'altro formato rimosso');
  eq(st.has(PKEY(1, 2)), false, 'chiave dell\'altro formato sparita dallo storage');
  eq(a.hasPayload(1, 1), true, 'payload del formato ricevuto presente');
})();

(function () {
  /* photo_id 0 o assente: generato ≠ 0 e uguale per le due voci dello stesso slot */
  var f = freshAlbum(), a = f.a;
  var r = a.applyPayload({ v: 1, photos: [entry(4, 0, 1), entry(4, undefined, 2)] }, {});
  eqJson(r.errors, [], 'photo_id assente: nessun errore');
  var id = pid(a, 4);
  check(id !== 0 && id === (id >>> 0) && Math.floor(id) === id, 'photo_id generato ≠ 0 e uint32 (' + id + ')');
  eqJson(pfmts(a, 4), { 1: { len: LEN6, crc: C6 }, 2: { len: LEN1, crc: C1 } },
         'stesso id generato per le due voci → entrambi i formati nello stesso record');
  eq(a.count(), 1, 'una sola foto');
  /* slot diversi → id diversi (nessuna condivisione) */
  var f2 = freshAlbum();
  f2.a.applyPayload({ v: 1, photos: [entry(0, 0, 1), entry(1, 0, 1)] }, {});
  check(pid(f2.a, 0) !== pid(f2.a, 1) ||
        pid(f2.a, 0) !== 0, 'id generati per slot diversi');
})();

(function () {
  /* voci non valide: errors, nessuna modifica, nessun payload scritto */
  var f = freshAlbum(), a = f.a, st = f.st, i, snap, keys, r;
  a.applyPayload({ v: 1, photos: [entry(1, 0x1111, 1)] }, {});
  var casi = [
    ['slot 12', entry(12, 1, 1)],
    ['slot -1', entry(-1, 1, 1)],
    ['slot "3"', entry('3', 1, 1)],
    ['slot 1.5', entry(1.5, 1, 1)],
    ['slot assente', entry(undefined, 1, 1)],
    ['fmt 3', entry(5, 1, 1, { fmt: 3 })],
    ['fmt 0', entry(5, 1, 1, { fmt: 0 })],
    ['fmt "1"', entry(5, 1, 1, { fmt: '1' })],
    ['len sbagliata', entry(5, 1, 1, { len: 34199 })],
    ['len del formato sbagliato', entry(5, 1, 1, { len: LEN1 })],
    ['len stringa', entry(5, 1, 1, { len: '34200' })],
    ['crc mancante', entry(5, 1, 1, { crc: undefined })],
    ['crc stringa', entry(5, 1, 1, { crc: '' + C6 })],
    ['data troppo corta', entry(5, 1, 1, { data: R1 })],
    ['data con crc sbagliato', entry(5, 1, 1, { crc: (C6 ^ 1) >>> 0 })],
    ['data base64 non valida', entry(5, 1, 1, { data: R6.substring(0, 100) + '!!!' })],
    ['voce null', null],
    ['voce numero', 7],
    ['voce stringa', 'x'],
    ['sovrascrittura di uno slot pieno con crc sbagliato', entry(1, 0x2222, 1, { crc: (C6 ^ 0xFF) >>> 0 })]
  ];
  snap = JSON.stringify(a.state());
  keys = st.keys().join(',');
  var setsBefore = st.sets;
  for (i = 0; i < casi.length; i++) {
    r = a.applyPayload({ v: 1, photos: [casi[i][1]] }, {});
    check(r.errors.length === 1, casi[i][0] + ': un errore (' + JSON.stringify(r.errors) + ')');
    eq(r.changed, false, casi[i][0] + ': nessuna modifica');
    eq(r.ok, true, casi[i][0] + ': ok resta true (il JSON si salva)');
  }
  eq(JSON.stringify(a.state()), snap, 'voci non valide: stato invariato');
  eq(st.keys().join(','), keys, 'voci non valide: nessuna chiave nuova nello storage');
  eq(st.sets - setsBefore, casi.length, 'voci non valide: solo il JSON dell\'album viene riscritto');
  /* più voci: quella buona passa, quelle rotte no */
  r = a.applyPayload({ v: 1, photos: [entry(99, 1, 1), entry(6, 0x3333, 1), entry(7, 1, 1, { data: 'zz' })] }, {});
  eq(r.errors.length, 2, 'due voci rotte su tre');
  eqJson(r.added, [6], 'la voce buona passa lo stesso');
})();

(function () {
  /* crc negativo (int32 dal JS) accettato come uint32 */
  var f = freshAlbum(), a = f.a;
  var r = a.applyPayload({ v: 1, photos: [entry(0, 0x9999, 1, { crc: fixture.raw6.crc })] }, {});
  eqJson(r.errors, [], 'crc negativo: nessun errore');
  eq(pcrc(a, 0, 1), C6, 'crc negativo memorizzato come uint32');
  /* anche photo_id negativo */
  r = a.applyPayload({ v: 1, photos: [entry(1, -2, 1)] }, {});
  eq(pid(a, 1), 0xFFFFFFFE, 'photo_id negativo → uint32');
})();

(function () {
  /* data assente: errore senza allowUrl, solo metadati con allowUrl */
  var f = freshAlbum(), a = f.a, st = f.st;
  var e = entry(0, 0x4444, 1); delete e.data; e.url = 'http://localhost:8765/photo/0.raw6';
  var r = a.applyPayload({ v: 1, photos: [e] }, {});
  eq(r.errors.length, 1, 'senza data e senza allowUrl: errore');
  check(r.errors[0].indexOf('senza data') >= 0, 'messaggio "senza data" (' + r.errors[0] + ')');
  eq(a.count(), 0, 'senza data: nessuna foto registrata');
  r = a.applyPayload({ v: 1, photos: [e] }, { allowUrl: true });
  eqJson(r.errors, [], 'con allowUrl: nessun errore');
  eqJson(r.added, [0], 'con allowUrl: foto registrata');
  eq(a.hasPayload(0, 1), false, 'con allowUrl: nessun payload salvato');
  eq(st.has(PKEY(0, 1)), false, 'con allowUrl: nessuna chiave payload');
  eqJson(pfmts(a, 0), { 1: { len: LEN6, crc: C6 } }, 'con allowUrl: metadati completi');
  /* url non stringa → errore anche con allowUrl */
  var e2 = entry(1, 5, 1); delete e2.data; e2.url = 42;
  eq(a.applyPayload({ v: 1, photos: [e2] }, { allowUrl: true }).errors.length, 1, 'url non stringa → errore');
  /* data vuota → come assente */
  var e3 = entry(2, 6, 1, { data: '' });
  eq(a.applyPayload({ v: 1, photos: [e3] }, {}).errors.length, 1, 'data stringa vuota → errore');
})();

(function () {
  /* deleted */
  var f = freshAlbum(), a = f.a, st = f.st;
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(0, 1, 2), entry(3, 2, 1)] }, {});
  eqJson(a.data.order, [0, 3], 'ordine iniziale');
  var r = a.applyPayload({ v: 1, deleted: [0] }, {});
  eq(r.changed, true, 'delete: changed');
  eqJson(r.deleted, [0], 'delete: res.deleted');
  eq(a.data.photos[0], null, 'delete: slot svuotato');
  eq(st.has(PKEY(0, 1)), false, 'delete: payload fmt 1 rimosso');
  eq(st.has(PKEY(0, 2)), false, 'delete: payload fmt 2 rimosso');
  eqJson(a.data.deleted, [0], 'delete: slot fra le eliminazioni pendenti');
  eqJson(a.data.order, [3], 'delete: slot fuori dall\'ordine');
  eq(a.data.orderDirty, true, 'delete: orderDirty');
  /* delete di uno slot già vuoto: comunque in deleted (foto estranee, S6) */
  var r2 = a.applyPayload({ v: 1, deleted: [9] }, {});
  eqJson(r2.deleted, [], 'delete di slot vuoto: res.deleted vuoto');
  eq(r2.changed, true, 'delete di slot vuoto: changed (la lista è cambiata)');
  eqJson(a.data.deleted, [0, 9], 'delete di slot vuoto: comunque fra le eliminazioni pendenti');
  /* ripetuto: nessun cambiamento */
  eq(a.applyPayload({ v: 1, deleted: [9] }, {}).changed, false, 'delete ripetuto: nessun cambiamento');
  /* valori non validi ignorati */
  a.applyPayload({ v: 1, deleted: [12, -1, '2', 1.5] }, {});
  eqJson(a.data.deleted, [0, 9], 'delete: valori non validi ignorati');
  /* uno slot in deleted che torna a riempirsi in un payload SUCCESSIVO esce da deleted */
  a.applyPayload({ v: 1, photos: [entry(9, 77, 1)] }, {});
  eqJson(a.data.deleted, [0], 'slot riempito da un payload successivo: fuori da deleted');
  eq(pid(a, 9), 77, 'la foto è al suo posto');
})();

(function () {
  /* BUG A: lo stesso payload elimina e riempie lo stesso slot */
  var f = freshAlbum(), a = f.a;
  var r = a.applyPayload({ v: 1, deleted: [8], photos: [entry(8, 0x8888, 1)] }, {});
  bug('A', a.data.photos[8] !== null && a.data.photos[8] !== undefined,
      'slot eliminato e riempito nello stesso payload: la foto nuova deve restare');
  bug('A', a.data.deleted.indexOf(8) < 0,
      'slot riempito dallo stesso payload: non deve restare fra le eliminazioni pendenti');
  /* stesso caso con lo slot già pieno prima */
  var f2 = freshAlbum(), a2 = f2.a;
  a2.applyPayload({ v: 1, photos: [entry(8, 0x1000, 1)] }, {});
  a2.applyPayload({ v: 1, deleted: [8], photos: [entry(8, 0x2000, 1)] }, {});
  bug('A', pid(a2, 8) === 0x2000,
      'sostituzione con delete nello stesso payload: resta la foto nuova');
})();

(function () {
  /* order */
  var f = freshAlbum(), a = f.a;
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(3, 2, 1), entry(5, 3, 1)] }, {});
  eqJson(a.data.order, [0, 3, 5], 'ordine di arrivo');
  var r = a.applyPayload({ v: 1, order: [5, 0, 3] }, {});
  eqJson(a.data.order, [5, 0, 3], 'order esplicito applicato');
  eq(r.changed, true, 'order nuovo: changed');
  eq(a.data.orderDirty, true, 'order nuovo: orderDirty');
  /* order uguale → orderDirty invariato */
  a.data.orderDirty = false;
  var r2 = a.applyPayload({ v: 1, order: [5, 0, 3] }, {});
  eq(r2.changed, false, 'order uguale: nessun cambiamento');
  eq(a.data.orderDirty, false, 'order uguale: orderDirty invariato');
  /* slot sconosciuti/duplicati/fuori range → filtrati, i mancanti accodati */
  var r3 = a.applyPayload({ v: 1, order: [7, 3, 3, 12, -1, 'x'] }, {});
  eqJson(a.data.order, [3, 0, 5], 'order filtrato (7 vuoto, duplicati e fuori range via) + mancanti accodati');
  eq(a.data.orderDirty, true, 'order corretto: orderDirty');
  /* order vuoto → tutti gli slot accodati nell'ordine naturale */
  a.applyPayload({ v: 1, order: [] }, {});
  eqJson(a.data.order, [0, 3, 5], 'order vuoto → ordine naturale');
  /* order assente → invariato */
  a.data.orderDirty = false;
  var r4 = a.applyPayload({ v: 1 }, {});
  eqJson(a.data.order, [0, 3, 5], 'order assente → invariato');
  eq(a.data.orderDirty, false, 'order assente → orderDirty invariato');
})();

(function () {
  /* settings */
  var f = freshAlbum(), a = f.a;
  var r = a.applyPayload({ v: 1, settings: { layout: 1, font: 2 } }, {});
  eq(r.changed, true, 'settings: changed');
  eq(a.data.settings.layout, 1, 'settings: layout applicato');
  eq(a.data.settings.font, 2, 'settings: font applicato');
  eq(a.data.settings.interval_min, 30, 'settings: campo non citato resta al default');
  /* merge con i correnti */
  a.applyPayload({ v: 1, settings: { interval_min: 60 } }, {});
  eq(a.data.settings.layout, 1, 'settings parziali: merge con i correnti');
  eq(a.data.settings.interval_min, 60, 'settings parziali: campo nuovo');
  /* fuori intervallo → default del campo (non il valore corrente) */
  a.applyPayload({ v: 1, settings: { layout: 9 } }, {});
  eq(a.data.settings.layout, 0, 'settings fuori intervallo → default del campo');
  eq(a.data.settings.interval_min, 60, 'settings fuori intervallo: gli altri campi restano');
  /* interval_min non in lista → 30 */
  a.applyPayload({ v: 1, settings: { interval_min: 45 } }, {});
  eq(a.data.settings.interval_min, 30, 'interval_min 45 non in lista → 30');
  /* stringhe numeriche */
  a.applyPayload({ v: 1, settings: { font: '3', interval_min: '180' } }, {});
  eq(a.data.settings.font, 3, 'settings: stringa numerica accettata');
  eq(a.data.settings.interval_min, 180, 'settings: interval_min "180"');
  /* uguali → changed false */
  var r2 = a.applyPayload({ v: 1, settings: { font: 3, interval_min: 180 } }, {});
  eq(r2.changed, false, 'settings uguali: changed false');
  /* settings non oggetto → ignorate */
  var before = JSON.stringify(a.data.settings);
  a.applyPayload({ v: 1, settings: 'x' }, {});
  eq(JSON.stringify(a.data.settings), before, 'settings non oggetto: ignorate');
  a.applyPayload({ v: 1, settings: null }, {});
  eq(JSON.stringify(a.data.settings), before, 'settings null: ignorate');
})();

(function () {
  /* payload non valido */
  var f = freshAlbum(), a = f.a, snap;
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1)] }, {});
  snap = JSON.stringify(a.state());
  [null, undefined, {}, { v: 2 }, { v: '1' }, [], 'x', 42].forEach(function (p) {
    var r = a.applyPayload(p, {});
    eq(r.ok, false, 'payload ' + fmt(p) + ': ok false');
    eq(r.changed, false, 'payload ' + fmt(p) + ': nessuna modifica');
    eq(r.errors.length, 1, 'payload ' + fmt(p) + ': un errore');
  });
  eq(JSON.stringify(a.state()), snap, 'payload non validi: stato invariato');
  /* photos non array e deleted non array non fanno danni */
  eq(a.applyPayload({ v: 1, photos: 'ciao' }, {}).errors.length, 1, 'photos stringa: UN errore (non uno per carattere, S5b)');
  eq(a.applyPayload({ v: 1, photos: {} }, {}).errors.length, 1, 'photos oggetto: un errore, nessun danno');
  eq(a.applyPayload({ v: 1, deleted: 'x', order: 'y' }, {}).errors.length, 0, 'deleted/order non array: ignorati');
  (function () {
    /* 25 voci: solo le prime 24 vengono lette (una per formato × 12 slot) + un errore (album a parte) */
    var f3 = freshAlbum(), a3 = f3.a, many = [], k;
    for (k = 0; k < 25; k++) { many.push(entry(k % 12, 0x9000 + (k % 12), (k < 12) ? 1 : 2)); }
    var rr = a3.applyPayload({ v: 1, photos: many }, {});
    check(rr.errors.length >= 1 && /24/.test(rr.errors.join(' ')), 'oltre 24 voci: errore esplicito');
    eq(a3.count(), 12, '12 foto registrate dalle prime 24 voci');
  })();
  (function () {
    /* data con lunghezza sbagliata non viene nemmeno decodificata */
    var f3 = freshAlbum(), a3 = f3.a;
    var rr = a3.applyPayload({ v: 1, photos: [entry(1, 0x9999, 1, { data: R6 + 'AAAAAAAAAAAAAAAA' })] }, {});
    check(rr.errors.length === 1 && /caratteri/.test(rr.errors[0]), 'data troppo lunga: errore di lunghezza prima della decodifica');
    var rr2 = a3.applyPayload({ v: 1, photos: [entry(1, 0x9999, 1, { data: R6.slice(0, 100) })] }, {});
    check(rr2.errors.length === 1 && /caratteri/.test(rr2.errors[0]), 'data troppo corta: errore di lunghezza');
    eq(a3.count(), 0, 'nessuna foto registrata');
  })();
  (function () {
    /* thumb oltre 6.000 caratteri: scartata, la foto resta */
    var f3 = freshAlbum(), a3 = f3.a, big = new Array(6002).join('x');
    var rr = a3.applyPayload({ v: 1, photos: [entry(2, 0x9998, 1, { thumb: big })] }, {});
    eq(rr.errors.length, 0, 'thumb enorme: nessun errore');
    eq(a3.data.photos[2].thumb, undefined, 'thumb enorme scartata');
    a3.applyPayload({ v: 1, photos: [entry(2, 0x9998, 1, { thumb: 'data:image/png;base64,AAAA' })] }, {});
    eq(a3.data.photos[2].thumb, 'data:image/png;base64,AAAA', 'thumb piccola conservata');
  })();
  eq(a.applyPayload({ v: 1, deleted: 5 }, {}).changed, false, 'deleted numero: ignorato');
  eq(a.count(), 1, 'la foto è ancora lì');
})();

/* ================================================= 5. applyPayload — full */

sec('5. applyPayload (full: stato completo)');

(function () {
  var f = freshAlbum(), a = f.a, st = f.st;
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(0, 1, 2), entry(3, 2, 1), entry(7, 3, 1)] }, {});
  eq(a.count(), 3, 'tre foto prima del payload completo');
  /* stato completo che elenca solo lo slot 3 (idempotente) e ne aggiunge uno nuovo */
  var r = a.applyPayload({ v: 1, photos: [entry(3, 2, 1), entry(5, 4, 1)] }, { full: true });
  eq(a.count(), 2, 'full: restano solo gli slot elencati');
  eq(pid(a, 3), 2, 'full: lo slot elencato e invariato è conservato');
  eq(pid(a, 5), 4, 'full: lo slot nuovo è aggiunto');
  eq(a.data.photos[0], null, 'full: slot 0 non elencato → eliminato');
  eq(a.data.photos[7], null, 'full: slot 7 non elencato → eliminato');
  eq(st.has(PKEY(0, 1)) || st.has(PKEY(0, 2)) || st.has(PKEY(7, 1)), false,
     'full: payload degli slot eliminati rimossi');
  eqJson(r.deleted.slice().sort(), [0, 7], 'full: res.deleted');
  eqJson(a.data.deleted.slice().sort(), [0, 7], 'full: eliminazioni pendenti da confermare all\'orologio');
  eqJson(a.data.order, [3, 5], 'full: ordine ripulito');
  eq(a.data.orderDirty, true, 'full: orderDirty');
  /* payload completo senza foto: album svuotato */
  var r2 = a.applyPayload({ v: 1, photos: [] }, { full: true });
  eq(a.count(), 0, 'full senza foto: album svuotato');
  eqJson(a.data.deleted.slice().sort(), [0, 3, 5, 7], 'full senza foto: tutti in deleted');
  eqJson(a.data.order, [], 'full senza foto: ordine vuoto');
  /* full senza il campo photos: nessuna foto elencata → svuota comunque */
  var f2 = freshAlbum();
  f2.a.applyPayload({ v: 1, photos: [entry(1, 9, 1)] }, {});
  f2.a.applyPayload({ v: 1 }, { full: true });
  eq(f2.a.count(), 0, 'full senza campo photos: album svuotato');
  /* delta: gli slot non elencati NON si toccano */
  var f3 = freshAlbum();
  f3.a.applyPayload({ v: 1, photos: [entry(1, 9, 1), entry(2, 10, 1)] }, {});
  f3.a.applyPayload({ v: 1, photos: [entry(1, 9, 1)] }, {});
  eq(f3.a.count(), 2, 'delta: gli slot non elencati restano');
})();

(function () {
  /* full con una voce rotta: lo slot è comunque "elencato" e la foto locale non viene buttata
   * (la lettura prudente della specifica: un errore di trasferimento non deve cancellare nulla) */
  var f = freshAlbum(), a = f.a;
  a.applyPayload({ v: 1, photos: [entry(2, 5, 1)] }, {});
  var r = a.applyPayload({ v: 1, photos: [entry(2, 6, 1, { crc: (C6 ^ 3) >>> 0 })] }, { full: true });
  eq(r.errors.length, 1, 'full con voce rotta: errore');
  eq(a.count(), 1, 'full con voce rotta: la foto locale resta');
  eq(pid(a, 2), 5, 'full con voce rotta: metadati invariati');
  eqJson(a.data.deleted, [], 'full con voce rotta: nessuna eliminazione');
})();

/* ---- F10 (revisione post code-review): in `full` le eliminazioni implicite si fanno solo se OGNI
 * voce era identificabile; una voce rotta con slot valido conta come "elencata" (foto e payload
 * locali conservati, nessuna eliminazione nemmeno esplicita). ---- */

/* album con tre foto (slot 0 in due formati, 3, 7) */
function threePhotos(st) {
  var a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(0, 1, 2), entry(3, 2, 1), entry(7, 3, 1)] }, {});
  if (a.count() !== 3) { throw new Error('threePhotos: seed fallito'); }
  return a;
}

(function () {
  /* photos non array ({}, stringa, numero): nessuna eliminazione, due errori, il piano non manda ALBUM_DELETE */
  [{}, 'abc', 5].forEach(function (bad) {
    var st = memStorage(), a = threePhotos(st), what = 'full photos ' + fmt(bad);
    var r = a.applyPayload({ v: 1, photos: bad }, { full: true });
    eq(r.ok, true, what + ': ok (album salvato)');
    eq(r.changed, false, what + ': nessuna modifica');
    eq(a.count(), 3, what + ': nessuna foto eliminata');
    eqJson(r.deleted, [], what + ': res.deleted vuoto');
    eqJson(a.data.deleted, [], what + ': nessuna eliminazione pendente');
    check(hasErr(r, 'photos non e\' un array'), what + ': errore "photos non e\' un array"');
    check(hasErr(r, SKIPPED), what + ': errore "eliminazioni implicite saltate"');
    eq(r.errors.length, 2, what + ': esattamente due errori');
    eqJson(a.data.order, [0, 3, 7], what + ': ordine invariato');
    var p = a.plan(hello({ valid: [[0, C6], [3, C6], [7, C6]], settingsCrc: a.settingsCrc() }));
    eqJson(p.deletes, [], what + ': plan.deletes vuoto');
    eqJson(planSlots(p), [], what + ': nessuna foto da mandare');
  });
})();

(function () {
  /* voce dello slot 3 rotta per ciascun gate (prima e dopo la decodifica): slot elencato → foto 3
   * (id, crc e payload) e slot 0/7 conservati, nessun errore "saltate", nessuna eliminazione */
  var broken = [
    ['fmt 3',           { slot: 3, photo_id: 2, fmt: 3, len: LEN6, crc: C6, data: R6 }, /foto 1: fmt 3 non valido/],
    ['len 34199',       entry(3, 2, 1, { len: 34199 }),                                /slot 3: len 34199 non valida/],
    ['crc mancante',    { slot: 3, photo_id: 2, fmt: 1, len: LEN6, data: R6 },         /slot 3: crc mancante/],
    ['data corta',      entry(3, 2, 1, { data: R6.slice(0, 100) }),                    /slot 3 fmt 1: data di 100 caratteri/],
    ['base64 corrotto', entry(3, 2, 1, { data: corruptB64(R6) }),                      /slot 3 fmt 1: crc 0x/],
    ['senza data',      { slot: 3, photo_id: 2, fmt: 1, len: LEN6, crc: C6 },          /slot 3 fmt 1: senza data/]
  ];
  broken.forEach(function (c) {
    var st = memStorage(), a = threePhotos(st), what = 'full voce rotta (' + c[0] + ')';
    var r = a.applyPayload({ v: 1, photos: [entry(0, 1, 1), c[1], entry(7, 3, 1)] }, { full: true });
    eq(r.ok, true, what + ': ok');
    eq(r.changed, false, what + ': nessuna modifica');
    eq(r.errors.length, 1, what + ': un solo errore');
    check(c[2].test(r.errors[0]), what + ': errore della voce (' + r.errors[0] + ')');
    check(!hasErr(r, 'saltate'), what + ': nessun errore "saltate" (slot identificabile)');
    eq(a.count(), 3, what + ': tre foto');
    eq(pid(a, 3), 2, what + ': foto 3 conservata (id)');
    eq(pcrc(a, 3, 1), C6, what + ': foto 3 conservata (crc)');
    eq(st.mem[PKEY(3, 1)], R6, what + ': payload p3.1 intatto');
    eq(pid(a, 0), 1, what + ': slot 0 conservato');
    eq(pid(a, 7), 3, what + ': slot 7 conservato');
    eqJson(r.deleted, [], what + ': nessuna eliminazione');
    eqJson(a.data.deleted, [], what + ': nessuna eliminazione pendente');
    eqJson(a.data.order, [0, 3, 7], what + ': ordine invariato');
    var p = a.plan(hello({ valid: [[0, C6], [3, C6], [7, C6]], settingsCrc: a.settingsCrc() }));
    eqJson(p.deletes, [], what + ': plan.deletes vuoto (nessun ALBUM_DELETE)');
    eqJson(planSlots(p), [], what + ': nessuna foto da mandare');
  });
})();

(function () {
  /* voce non identificabile (null, numero, slot 12, slot 'x', slot -1): nessuna eliminazione
   * implicita degli slot 0/7 + errore della voce + "saltate" */
  var cases = [
    ['voce null',  null,               /foto 1: voce non valida/],
    ['voce 7',     7,                  /foto 1: voce non valida/],
    ['slot 12',    entry(12, 9, 1),    /foto 1: slot 12 non valido/],
    ['slot "x"',   entry('x', 9, 1),   /foto 1: slot x non valido/],
    ['slot -1',    entry(-1, 9, 1),    /foto 1: slot -1 non valido/]
  ];
  cases.forEach(function (c) {
    var st = memStorage(), a = threePhotos(st), what = 'full voce non identificabile (' + c[0] + ')';
    var r = a.applyPayload({ v: 1, photos: [entry(3, 2, 1), c[1]] }, { full: true });
    eq(r.ok, true, what + ': ok');
    eq(a.count(), 3, what + ': nessuna foto eliminata');
    eq(pid(a, 0), 1, what + ': slot 0 conservato');
    eq(pid(a, 7), 3, what + ': slot 7 conservato');
    eqJson(r.deleted, [], what + ': res.deleted vuoto');
    eqJson(a.data.deleted, [], what + ': nessuna eliminazione pendente');
    check(c[2].test(r.errors.join(';')), what + ': errore della voce (' + r.errors.join(';') + ')');
    check(hasErr(r, SKIPPED), what + ': errore "saltate"');
    eq(r.errors.length, 2, what + ': due errori');
  });
})();

(function () {
  /* 25 voci (una di troppo, solo slot 3 e 5): stato completo non affidabile → gli slot 0/7 non
   * elencati restano; le 24 voci lette si applicano (3 sostituita, 5 nuova) */
  var st = memStorage(), a = threePhotos(st), many = [], i;
  for (i = 0; i < 25; i++) {
    many.push({ slot: (i % 2) ? 5 : 3, photo_id: (i % 2) ? 105 : 103, fmt: 1, len: LEN6, crc: 1, url: 'x' });
  }
  var r = a.applyPayload({ v: 1, photos: many }, { full: true, allowUrl: true });
  eq(r.ok, true, '25 voci full: ok');
  check(hasErr(r, 'photos: 25 voci, al piu\' 24'), '25 voci full: errore "al piu\' 24"');
  check(hasErr(r, SKIPPED), '25 voci full: errore "saltate"');
  eq(r.errors.length, 2, '25 voci full: due errori');
  eq(a.count(), 4, '25 voci full: 0 e 7 conservati, 3 sostituita, 5 nuova');
  eq(pid(a, 0), 1, '25 voci full: slot 0 conservato');
  eq(pid(a, 7), 3, '25 voci full: slot 7 conservato');
  eq(pid(a, 3), 103, '25 voci full: slot 3 sostituito');
  eq(pid(a, 5), 105, '25 voci full: slot 5 nuovo');
  eqJson(r.added.slice().sort(), [3, 5], '25 voci full: added [3,5]');
  eqJson(r.deleted, [], '25 voci full: nessuna eliminazione');
  eqJson(a.data.deleted, [], '25 voci full: nessuna eliminazione pendente');
  eq(st.has(PKEY(3, 1)), false, '25 voci full: payload della vecchia 3 rimosso (voce dev senza data)');
})();

(function () {
  /* 24 voci tutte rotte ma con slot valido: elencato, niente "saltate"; oltre 24 voci rotte: fullUnsafe
   * (MAX_ERRORS=32 non è raggiungibile con 24 voci: al più 25 errori prima delle eliminazioni) */
  var st = memStorage(), a = threePhotos(st), many = [], i;
  for (i = 0; i < 24; i++) { many.push(entry(3, 2, 1, { len: 1 })); }   /* 24 voci rotte con slot valido */
  var r = a.applyPayload({ v: 1, photos: many }, { full: true });
  eq(r.errors.length, 24, 'voci tutte rotte: 24 errori');
  check(!hasErr(r, SKIPPED), 'voci tutte rotte (slot valido): slot elencato, niente "saltate"');
  eq(pid(a, 3), 2, 'voci tutte rotte (slot valido): foto 3 conservata');
  eq(st.mem[PKEY(3, 1)], R6, 'voci tutte rotte (slot valido): payload 3 intatto');
  eqJson(r.deleted.slice().sort(), [0, 7], 'voci tutte rotte (slot valido): stato completo affidabile → 0/7 non elencati eliminati');
  eq(a.count(), 1, 'voci tutte rotte (slot valido): resta la 3');
  var st2 = memStorage(), a2 = threePhotos(st2), many2 = [], j;
  for (j = 0; j < 24; j++) { many2.push({ slot: 3, fmt: 3, len: 1 }); }
  for (j = 0; j < 9; j++) { many2.push({ slot: 3, fmt: 3, len: 1 }); }    /* 33 > MAX_PHOTO_ENTRIES → fullUnsafe */
  var r2 = a2.applyPayload({ v: 1, photos: many2 }, { full: true });
  eq(a2.count(), 3, '33 voci: nessuna eliminazione');
  check(hasErr(r2, SKIPPED), '33 voci: "saltate"');
})();

(function () {
  /* regressione: full valido (anche con quota su una foto nuova) → gli slot non elencati si eliminano */
  var st = memStorage({ failPattern: /\.p5\.1$/ }), a = threePhotos(st);
  var r = a.applyPayload({ v: 1, photos: [entry(3, 2, 1), entry(5, 4, 1)] }, { full: true });
  eq(r.ok, true, 'full valido + quota su slot nuovo: ok');
  check(hasErr(r, 'slot 5 fmt 1: quota, foto non registrata'), 'full valido + quota: errore quota');
  check(!hasErr(r, 'saltate'), 'full valido + quota: nessun "saltate"');
  eqJson(r.deleted.slice().sort(), [0, 7], 'full valido + quota: slot 0/7 non elencati eliminati');
  eq(a.count(), 1, 'full valido + quota: resta solo lo slot 3');
  eq(a.data.photos[5], null, 'full valido + quota: slot 5 non registrato');
  eq(st.has(PKEY(0, 1)) || st.has(PKEY(0, 2)) || st.has(PKEY(7, 1)), false, 'full valido + quota: payload 0/7 rimossi');
  eqJson(a.data.deleted.slice().sort(), [0, 7], 'full valido + quota: eliminazioni pendenti');
  /* {v:1} full senza photos → svuota (comportamento invariato) */
  var st2 = memStorage(), a2 = threePhotos(st2);
  var r2 = a2.applyPayload({ v: 1 }, { full: true });
  eq(a2.count(), 0, '{v:1} full: album svuotato');
  eqJson(r2.deleted.slice().sort(), [0, 3, 7], '{v:1} full: tutti eliminati');
  eqJson(r2.errors, [], '{v:1} full: nessun errore');
})();

(function () {
  /* delta: deleted [3] + voce rotta nello slot 3 → slot "elencato": non si elimina (lato prudente) */
  var st = memStorage(), a = threePhotos(st);
  var r = a.applyPayload({ v: 1, deleted: [3], photos: [{ slot: 3, photo_id: 2, fmt: 3, len: 1, crc: 1 }] }, {});
  eq(r.ok, true, 'delta voce rotta + deleted [3]: ok');
  eq(r.errors.length, 1, 'delta voce rotta + deleted [3]: un errore');
  eq(r.changed, false, 'delta voce rotta + deleted [3]: nessuna modifica');
  eqJson(r.deleted, [], 'delta voce rotta + deleted [3]: res.deleted vuoto');
  eq(pid(a, 3), 2, 'delta voce rotta + deleted [3]: foto 3 conservata');
  eq(st.has(PKEY(3, 1)), true, 'delta voce rotta + deleted [3]: payload conservato');
  eqJson(a.data.deleted, [], 'delta voce rotta + deleted [3]: nessuna eliminazione pendente');
  /* stesso caso in full con 0/7 validi: 3 resta, 0/7 restano */
  var r2 = a.applyPayload({ v: 1, deleted: [3], photos: [entry(0, 1, 1), { slot: 3, photo_id: 2, fmt: 1, len: 1, crc: 1 }, entry(7, 3, 1)] }, { full: true });
  eq(a.count(), 3, 'full voce rotta + deleted [3]: tre foto');
  eqJson(r2.deleted, [], 'full voce rotta + deleted [3]: nessuna eliminazione');
  eqJson(a.data.deleted, [], 'full voce rotta + deleted [3]: deleted vuoto');
  /* deleted [7] senza voce per 7: eliminazione esplicita ancora fatta (regressione) */
  var r3 = a.applyPayload({ v: 1, deleted: [7] }, {});
  eqJson(r3.deleted, [7], 'delta deleted [7]: eliminato');
  eq(a.data.photos[7], null, 'delta deleted [7]: slot vuoto');
  eq(st.has(PKEY(7, 1)), false, 'delta deleted [7]: payload rimosso');
})();

/* ============================================================ 6. quota */

sec('6. quota (setItem che lancia)');

(function () {
  /* il payload non si scrive: foto non registrata, album coerente */
  var st = memStorage({ failPattern: /\.p2\.1$/ }), a = new Album(st, log);
  var r = a.applyPayload({ v: 1, photos: [entry(2, 0x1234, 1)] }, {});
  eq(r.errors.length, 1, 'quota payload: un errore');
  check(r.errors[0].indexOf('quota') >= 0, 'quota payload: messaggio "quota" (' + r.errors[0] + ')');
  eq(r.changed, false, 'quota payload: nessun cambiamento registrato');
  eq(a.data.photos[2], null, 'quota payload: la foto nuova non resta a metà');
  eq(a.count(), 0, 'quota payload: album vuoto');
  eqJson(a.data.order, [], 'quota payload: ordine vuoto');
  eq(st.has(PKEY(2, 1)), false, 'quota payload: nessuna chiave scritta');
  eq(r.ok, true, 'quota payload: il JSON dell\'album è salvato lo stesso');
  /* e il JSON salvato è coerente: rileggendolo l'album è vuoto */
  var a2 = new Album(st, log);
  eq(a2.count(), 0, 'quota payload: album riletto vuoto');
  eqJson(a2.data.order, [], 'quota payload: ordine riletto vuoto');
})();

(function () {
  /* quota sul secondo formato: la foto resta con il formato riuscito */
  var st = memStorage({ failPattern: /\.p4\.2$/ }), a = new Album(st, log);
  var r = a.applyPayload({ v: 1, photos: [entry(4, 0x55, 1), entry(4, 0x55, 2)] }, {});
  eq(r.errors.length, 1, 'quota sul fmt 2: un errore');
  eq(a.count(), 1, 'quota sul fmt 2: la foto resta');
  eqJson(pfmts(a, 4), { 1: { len: LEN6, crc: C6 } }, 'quota sul fmt 2: solo il formato riuscito');
  eq(a.hasPayload(4, 1), true, 'quota sul fmt 2: il payload raw6 c\'è');
  eq(a.hasPayload(4, 2), false, 'quota sul fmt 2: il payload raw1 no');
  eqJson(a.data.order, [4], 'quota sul fmt 2: ordine coerente');
  eq(JSON.stringify(new Album(st, log).state().photos), JSON.stringify(a.state().photos),
     'quota sul fmt 2: album riletto identico');
})();

(function () {
  /* il JSON dell'album non si scrive (F8): la modifica è annullata per intero — RAM = disco, il
   * payload scritto viene tolto (nessun orfano), il riavvio è identico e il piano non manda la foto */
  var st = memStorage({ failPattern: ALBUM_RE });
  var a = new Album(st, log), n0 = LOGS.length;
  var r = a.applyPayload({ v: 1, photos: [entry(1, 0x77, 1)] }, {});
  eq(r.ok, false, 'quota album: ok false');
  check(hasErr(r, ROLLED_BACK), 'quota album: messaggio "album non salvato: modifiche annullate"');
  eqJson(r.errors, [ROLLED_BACK], 'quota album: è l\'unico errore');
  eq(r.changed, false, 'quota album: changed false (nulla è registrato)');
  eqJson(r.added, [], 'quota album: added vuoto');
  eqJson(r.updated, [], 'quota album: updated vuoto');
  eq(a.count(), 0, 'quota album: RAM = disco (album vuoto)');
  eq(a.data.photos[1], null, 'quota album: la foto non resta in RAM');
  eqJson(a.data.order, [], 'quota album: ordine vuoto');
  eq(st.has(Album.KEY), false, 'quota album: nessun JSON salvato');
  eq(st.has(PKEY(1, 1)), false, 'quota album: il payload scritto è stato tolto (nessun orfano)');
  eqJson(st.keys(), [], 'quota album: storage vuoto');
  var lg = logsSince(n0);
  var i1 = lg.indexOf('[album] salvataggio dell\'album fallito: ');
  var i2 = lg.indexOf('[album] album non salvato: 1 payload annullati, album riletto dal disco');
  var i3 = lg.indexOf('[album] applyPayload: ' + ROLLED_BACK);
  check(i1 >= 0 && i2 > i1 && i3 > i2, 'quota album: log in ordine (fallito → rollback → applyPayload) [' + lg + ']');
  eq(JSON.stringify(new Album(st, log).state().photos), JSON.stringify(a.state().photos), 'quota album: riavvio identico alla RAM');
  /* plan() non deve lanciare nemmeno se non riesce a salvare l'album; la foto annullata non si manda */
  var p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eq(planSlots(p).join(','), '', 'quota album: il piano non manda la foto annullata');
  eq(p.order, null, 'quota album: nessun ordine da mandare');
  eq(a.data.watch !== null, true, 'quota album: watch in RAM');
  /* quota liberata: lo stesso payload riapplicato riesce */
  st.failPattern = null;
  var r2 = a.applyPayload({ v: 1, photos: [entry(1, 0x77, 1)] }, {});
  eq(r2.ok && r2.changed, true, 'quota album liberata: ok e changed');
  eqJson(r2.added, [1], 'quota album liberata: added [1]');
  eq(a.count(), 1, 'quota album liberata: una foto');
  eq(st.mem[PKEY(1, 1)], R6, 'quota album liberata: payload scritto');
  eq(st.has(Album.KEY), true, 'quota album liberata: JSON salvato');
})();

(function () {
  /* storage che si riempie a metà strada (failAfter 2): la terza foto non si scrive e nemmeno il JSON
   * → tutto annullato, anche le due foto già scritte (nessun payload orfano p0.1/p1.1) */
  var st = memStorage({ failAfter: 2 }), a = new Album(st, log), n0 = LOGS.length;
  var r = a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(1, 2, 1), entry(2, 3, 1)] }, {});
  eq(st.sets, 2, 'due scritture riuscite, poi la quota (payload 3 e JSON dell\'album)');
  eq(r.errors.length, 2, 'quota a metà: due errori (payload + album non salvato)');
  eq(r.errors[0], 'slot 2 fmt 1: quota, foto non registrata', 'quota a metà: errore della terza foto');
  eq(r.errors[1], ROLLED_BACK, 'quota a metà: l\'annullamento è l\'ultimo errore');
  eq(r.ok, false, 'quota a metà: ok false');
  eq(r.changed, false, 'quota a metà: changed false');
  eqJson(r.added, [], 'quota a metà: added vuoto');
  eq(a.count(), 0, 'quota a metà: RAM = disco (nessuna foto)');
  eq(a.data.photos[2], null, 'quota a metà: la terza non è registrata');
  eqJson(a.data.order, [], 'quota a metà: ordine vuoto');
  eqJson(st.keys(), [], 'quota a metà: nessun payload orfano (p0.1/p1.1 tolti)');
  check(logsSince(n0).indexOf('[album] album non salvato: 2 payload annullati') >= 0, 'quota a metà: log del rollback (2 payload)');
  eq(new Album(st, log).count(), 0, 'quota a metà: riavvio vuoto');
  /* nessuna eccezione da nessun metodo pubblico */
  check(a.summary().length > 0, 'quota a metà: summary()');
  a.onDone({ order: 'OK', deletes: ['0:OK'] });
  a.reset();
  eq(a.count(), 0, 'quota a metà: reset()');
})();

(function () {
  /* removeItem che lancia: nessuna eccezione */
  var st = memStorage(), a;
  st.removeItem = function () { throw new Error('boom'); };
  a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1)] }, {});
  a.applyPayload({ v: 1, deleted: [0] }, {});
  eq(a.data.photos[0], null, 'removeItem che lancia: slot svuotato lo stesso');
  a.reset();
  eq(a.count(), 0, 'removeItem che lancia: reset() non lancia');
})();

/* ---- F6 (revisione post code-review): il payload nuovo si scrive PRIMA di toccare la foto vecchia;
 * quota sulla chiave ⇒ la vecchia resta intatta (metadati e ENTRAMBI i payload). ---- */

check(C6b !== C6 && R6b !== R6 && R6b.length === R6.length && C1b !== C1 && R1b !== R1 && R1b.length === R1.length,
      'fixture B: secondo payload valido a CRC diverso per raw6 e raw1');

(function () {
  /* sostituzione (id nuovo) nello slot occupato con quota sulla chiave: X resta intatta */
  var st = memStorage(), a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [entry(3, 0x1111, 1), entry(3, 0x1111, 2)] }, {});
  eq(a.count(), 1, 'sostituzione con quota: X in 3');
  st.failPattern = /\.p3\.1$/;
  var n0 = LOGS.length;
  var r = a.applyPayload({ v: 1, photos: [entryB(3, 0x2222, 1)] }, {});
  eq(r.ok, true, 'sostituzione con quota: ok (JSON salvato)');
  eq(r.changed, false, 'sostituzione con quota: changed false');
  eqJson(r.added, [], 'sostituzione con quota: added vuoto');
  eqJson(r.updated, [], 'sostituzione con quota: updated vuoto');
  eqJson(r.deleted, [], 'sostituzione con quota: deleted vuoto');
  eqJson(r.errors, ['slot 3 fmt 1: quota, foto non registrata'], 'sostituzione con quota: il solo errore');
  eq(pid(a, 3), 0x1111, 'sostituzione con quota: id di X');
  eqJson(pfmts(a, 3), { 1: { len: LEN6, crc: C6 }, 2: { len: LEN1, crc: C1 } }, 'sostituzione con quota: entrambi i formati di X');
  eq(st.mem[PKEY(3, 1)], R6, 'sostituzione con quota: payload raw6 di X intatto');
  eq(st.mem[PKEY(3, 2)], R1, 'sostituzione con quota: payload raw1 di X intatto');
  eqJson(a.data.order, [3], 'sostituzione con quota: ordine invariato');
  eqJson(a.data.deleted, [], 'sostituzione con quota: deleted invariato');
  eq(JSON.stringify(new Album(st, log).state().photos), JSON.stringify(a.state().photos), 'sostituzione con quota: riavvio identico');
  st.failPattern = null;
  var p = a.plan(hello({ valid: [[3, C6]], settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p), [], 'sostituzione con quota: X è già sull\'orologio (0 foto)');
  eqJson(p.deletes, [], 'sostituzione con quota: nessuna eliminazione');
  check(logsSince(n0).indexOf('estranei') < 0, 'sostituzione con quota: nessuno slot estraneo nel log');
  /* stesso caso su flint (fmt 2) */
  var st2 = memStorage(), a2 = new Album(st2, log);
  a2.applyPayload({ v: 1, photos: [entry(3, 0x1111, 1), entry(3, 0x1111, 2)] }, {});
  st2.failPattern = /\.p3\.2$/;
  var r2 = a2.applyPayload({ v: 1, photos: [entryB(3, 0x2222, 2)] }, {});
  eqJson(r2.errors, ['slot 3 fmt 2: quota, foto non registrata'], 'sostituzione con quota (fmt 2): errore');
  eq(pid(a2, 3), 0x1111, 'sostituzione con quota (fmt 2): X resta');
  eq(st2.mem[PKEY(3, 2)] === R1 && st2.mem[PKEY(3, 1)] === R6, true, 'sostituzione con quota (fmt 2): payload di X intatti');
})();

(function () {
  /* ri-ritaglio (stesso id, CRC nuovo) con quota: CRC e payload restano quelli vecchi, coerenti fra loro */
  var st = memStorage(), a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [entry(5, 0x1111, 1)] }, {});
  st.failPattern = /\.p5\.1$/;
  var r = a.applyPayload({ v: 1, photos: [entryB(5, 0x1111, 1)] }, {});
  eq(r.ok, true, 'ri-ritaglio con quota: ok');
  eq(r.changed, false, 'ri-ritaglio con quota: changed false');
  eqJson(r.updated, [], 'ri-ritaglio con quota: updated vuoto');
  eqJson(r.errors, ['slot 5 fmt 1: quota, foto non registrata'], 'ri-ritaglio con quota: errore');
  eq(pid(a, 5), 0x1111, 'ri-ritaglio con quota: stesso id');
  eq(pcrc(a, 5, 1), C6, 'ri-ritaglio con quota: CRC vecchio');
  eq(st.mem[PKEY(5, 1)], R6, 'ri-ritaglio con quota: payload vecchio');
  st.failPattern = null;
  /* dopo un wipe dell'orologio il piano rimanda la vecchia e load() la consegna */
  var n0 = LOGS.length, p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p), [5], 'ri-ritaglio con quota: dopo il wipe si rimanda la vecchia');
  check(logsSince(n0).indexOf('assente') < 0, 'ri-ritaglio con quota: nessun log "payload assente"');
  eq(p.photos[0].crc, C6, 'ri-ritaglio con quota: il piano porta il CRC vecchio');
  var got = loadCrc(p);
  eq(got, C6, 'ri-ritaglio con quota: load() consegna i byte vecchi (CRC coerente)');
  check(logsSince(n0).indexOf('corrotto') < 0, 'ri-ritaglio con quota: nessun _dropCorrupt');
  /* ri-ritaglio riuscito: CRC e payload nuovi, updated [5] */
  var r2 = a.applyPayload({ v: 1, photos: [entryB(5, 0x1111, 1)] }, {});
  eqJson(r2.updated, [5], 'ri-ritaglio riuscito: updated [5]');
  eq(pcrc(a, 5, 1), C6b, 'ri-ritaglio riuscito: CRC nuovo');
  eq(st.mem[PKEY(5, 1)], R6b, 'ri-ritaglio riuscito: payload nuovo');
})();

(function () {
  /* sostituzione riuscita: il payload nuovo nello stesso formato, l'ALTRO formato della vecchia rimosso */
  var st = memStorage(), a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [entry(3, 0x1111, 1), entry(3, 0x1111, 2)] }, {});
  var r = a.applyPayload({ v: 1, photos: [entryB(3, 0x2222, 1)] }, {});
  eq(r.ok && r.changed, true, 'sostituzione riuscita: ok e changed');
  eqJson(r.added, [3], 'sostituzione riuscita: added [3]');
  eqJson(r.errors, [], 'sostituzione riuscita: nessun errore');
  eq(pid(a, 3), 0x2222, 'sostituzione riuscita: id nuovo');
  eqJson(pfmts(a, 3), { 1: { len: LEN6, crc: C6b } }, 'sostituzione riuscita: solo il formato ricevuto');
  eq(st.mem[PKEY(3, 1)], R6b, 'sostituzione riuscita: p3.1 = payload nuovo');
  eq(st.has(PKEY(3, 2)), false, 'sostituzione riuscita: p3.2 (altro formato di X) rimosso');
  eq(JSON.stringify(new Album(st, log).state().photos), JSON.stringify(a.state().photos), 'sostituzione riuscita: riavvio identico');
  /* Y con due voci (fmt 1 e 2) nello stesso payload: la rimozione dell'altro formato di X non deve
   * cancellare il raw1 di Y scritto dalla seconda voce */
  var st2 = memStorage(), a2 = new Album(st2, log);
  a2.applyPayload({ v: 1, photos: [entry(4, 0x1111, 1), entry(4, 0x1111, 2)] }, {});
  var r2 = a2.applyPayload({ v: 1, photos: [entryB(4, 0x2222, 1), entryB(4, 0x2222, 2)] }, {});
  eqJson(r2.errors, [], 'Y due formati: nessun errore');
  eq(st2.mem[PKEY(4, 1)], R6b, 'Y due formati: p4.1 nuovo');
  eq(st2.mem[PKEY(4, 2)], R1b, 'Y due formati: p4.2 nuovo (non cancellato dalla rimozione pendente)');
  eqJson(pfmts(a2, 4), { 1: { len: LEN6, crc: C6b }, 2: { len: LEN1, crc: C1b } }, 'Y due formati: metadati');
  /* ordine inverso (prima fmt 2 poi fmt 1): stesso esito */
  var st3 = memStorage(), a3 = new Album(st3, log);
  a3.applyPayload({ v: 1, photos: [entry(4, 0x1111, 1), entry(4, 0x1111, 2)] }, {});
  a3.applyPayload({ v: 1, photos: [entryB(4, 0x2222, 2), entryB(4, 0x2222, 1)] }, {});
  eq(st3.mem[PKEY(4, 1)] === R6b && st3.mem[PKEY(4, 2)] === R1b, true, 'Y due formati (fmt 2 prima): entrambi i payload nuovi');
  /* Y con 2 voci e la seconda in quota: Y resta col formato riuscito, l'altro formato di X è via */
  var st4 = memStorage(), a4 = new Album(st4, log);
  a4.applyPayload({ v: 1, photos: [entry(3, 0x1111, 1), entry(3, 0x1111, 2)] }, {});
  st4.failPattern = /\.p3\.2$/;
  var r4 = a4.applyPayload({ v: 1, photos: [entryB(3, 0x2222, 1), entryB(3, 0x2222, 2)] }, {});
  eqJson(r4.added, [3], 'Y fmt 2 in quota: added [3]');
  eqJson(r4.errors, ['slot 3 fmt 2: quota, foto non registrata'], 'Y fmt 2 in quota: errore');
  eqJson(pfmts(a4, 3), { 1: { len: LEN6, crc: C6b } }, 'Y fmt 2 in quota: solo il formato riuscito');
  eq(st4.mem[PKEY(3, 1)], R6b, 'Y fmt 2 in quota: p3.1 = Y');
  eq(st4.has(PKEY(3, 2)), false, 'Y fmt 2 in quota: p3.2 di X rimosso (non appartiene a Y)');
  /* dev: voce solo metadati (allowUrl, senza data) → entrambi i payload di X via, dopo il JSON */
  var st5 = memStorage(), a5 = new Album(st5, log);
  a5.applyPayload({ v: 1, photos: [entry(6, 0x1111, 1), entry(6, 0x1111, 2)] }, {});
  var r5 = a5.applyPayload({ v: 1, photos: [{ slot: 6, photo_id: 0x2222, fmt: 1, len: LEN6, crc: C6b, url: '/photo/6.raw6' }] }, { allowUrl: true });
  eqJson(r5.errors, [], 'dev solo metadati: nessun errore');
  eq(pid(a5, 6), 0x2222, 'dev solo metadati: id nuovo');
  eq(st5.has(PKEY(6, 1)) || st5.has(PKEY(6, 2)), false, 'dev solo metadati: entrambi i payload di X rimossi');
  /* dev: voce senza data seguita da una con data per la stessa chiave → la rimozione è annullata */
  var st6 = memStorage(), a6 = new Album(st6, log);
  var r6 = a6.applyPayload({ v: 1, photos: [{ slot: 7, photo_id: 0x3333, fmt: 1, len: LEN6, crc: C6, url: 'x' }, entry(7, 0x3333, 1)] }, { allowUrl: true });
  eqJson(r6.errors, [], 'url poi data: nessun errore');
  eq(st6.mem[PKEY(7, 1)], R6, 'url poi data: il payload scritto resta');
  eq(pcrc(a6, 7, 1), C6, 'url poi data: metadati');
})();

(function () {
  /* deleted [3] + foto nuova nello slot 3 nello stesso payload, con quota: X resta e NON viene
   * eliminata (slot elencato → lato prudente, design §5.1) */
  var st = memStorage(), a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [entry(3, 0x1111, 1)] }, {});
  st.failPattern = /\.p3\.1$/;
  var r = a.applyPayload({ v: 1, deleted: [3], photos: [entryB(3, 0x2222, 1)] }, {});
  eq(r.ok, true, 'deleted + sostituzione con quota: ok');
  eq(r.changed, false, 'deleted + sostituzione con quota: nessuna modifica');
  eqJson(r.deleted, [], 'deleted + sostituzione con quota: nessuna eliminazione');
  eq(pid(a, 3), 0x1111, 'deleted + sostituzione con quota: X resta');
  eq(st.mem[PKEY(3, 1)], R6, 'deleted + sostituzione con quota: payload di X intatto');
  eqJson(a.data.deleted, [], 'deleted + sostituzione con quota: deleted vuoto');
  eqJson(a.data.order, [3], 'deleted + sostituzione con quota: ordine');
  eq(new Album(st, log).count(), 1, 'deleted + sostituzione con quota: riavvio con X');
})();

/* ---- F8 (revisione post code-review): JSON dell'album non scritto ⇒ rollback dei payload scritti
 * in questa chiamata, nessuna rimozione pendente eseguita, album riletto dal disco (RAM = disco). ---- */

(function () {
  /* 12ª foto con JSON che lancia: le 11 foto restano, nessun orfano p11.1, riavvio identico */
  var st = memStorage(), a = new Album(st, log), k, ph = [];
  for (k = 0; k < 11; k++) { ph.push(entry(k, 100 + k, 1, { name: 'f' + k, thumb: 'data:image/png;base64,AAAA' })); }
  a.applyPayload({ v: 1, photos: ph }, {});
  eq(a.count(), 11, '12ª foto: 11 foto di partenza');
  var before = JSON.stringify(a.state()), keysBefore = st.keys().join(',');
  st.failPattern = ALBUM_RE;
  var n0 = LOGS.length;
  var r = a.applyPayload({ v: 1, photos: [entry(11, 111, 1)] }, {});
  eq(r.ok, false, '12ª foto con JSON che lancia: ok false');
  eq(r.changed, false, '12ª foto: changed false');
  eqJson(r.added, [], '12ª foto: added vuoto');
  eqJson(r.errors, [ROLLED_BACK], '12ª foto: il solo errore è l\'annullamento');
  var lg = logsSince(n0);
  var i1 = lg.indexOf('[album] salvataggio dell\'album fallito: ');
  var i2 = lg.indexOf('[album] album non salvato: 1 payload annullati, album riletto dal disco');
  var i3 = lg.indexOf('[album] applyPayload: ' + ROLLED_BACK);
  check(i1 >= 0 && i2 > i1 && i3 > i2, '12ª foto: log in ordine (fallito → rollback → applyPayload) [' + lg + ']');
  eq(a.count(), 11, '12ª foto: count 11 (RAM = disco)');
  eq(a.data.photos[11], null, '12ª foto: slot 11 vuoto in RAM');
  eq(st.has(PKEY(11, 1)), false, '12ª foto: nessun orfano p11.1');
  eq(st.keys().join(','), keysBefore, '12ª foto: chiavi dello storage invariate');
  eq(JSON.stringify(a.state()), before, '12ª foto: stato in RAM identico a prima (foto, ordine, nomi, thumb)');
  eq(a.data.order.length, 11, '12ª foto: ordine di 11');
  eq(JSON.stringify(new Album(st, log).state()), JSON.stringify(a.state()), '12ª foto: riavvio identico alla RAM');
  var valid = [], j;
  for (j = 0; j < 12; j++) { valid.push([j, C6]); }
  var p = a.plan(hello({ valid: valid, settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p), [], '12ª foto: plan 0 foto');
  eqJson(a.data.watch.foreign, [11], '12ª foto: watch.foreign [11] (solo l\'orologio la tiene)');
  st.failPattern = null;
})();

(function () {
  /* sostituzione + JSON che lancia: RAM slot 3 = A (id/crc), p3.1 ripristinato ai byte di A, nessun
   * "corrotto" a un load() successivo; quota liberata → lo stesso payload riapplicato riesce */
  var st = memStorage(), a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [entry(3, 0x1111, 1), entry(3, 0x1111, 2)] }, {});
  st.failPattern = ALBUM_RE;
  var n0 = LOGS.length;
  var r = a.applyPayload({ v: 1, photos: [entryB(3, 0x2222, 1)] }, {});
  eq(r.ok, false, 'sostituzione + JSON che lancia: ok false');
  eq(r.changed, false, 'sostituzione + JSON che lancia: changed false');
  eqJson(r.added, [], 'sostituzione + JSON che lancia: added vuoto');
  eq(a.count(), 1, 'sostituzione + JSON che lancia: una foto');
  eq(pid(a, 3), 0x1111, 'sostituzione + JSON che lancia: RAM slot 3 = A (id)');
  eq(pcrc(a, 3, 1), C6, 'sostituzione + JSON che lancia: RAM slot 3 = A (crc)');
  eq(pcrc(a, 3, 2), C1, 'sostituzione + JSON che lancia: RAM slot 3 = A (fmt 2)');
  eq(st.mem[PKEY(3, 1)], R6, 'sostituzione + JSON che lancia: p3.1 ripristinato ai byte di A');
  eq(st.mem[PKEY(3, 2)], R1, 'sostituzione + JSON che lancia: p3.2 intatto (rimozione pendente non eseguita)');
  eq(JSON.stringify(new Album(st, log).state().photos), JSON.stringify(a.state().photos), 'sostituzione + JSON che lancia: riavvio identico');
  /* dopo un wipe: il piano rimanda A e load() la consegna senza _dropCorrupt */
  var p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p), [3], 'sostituzione + JSON che lancia: plan dopo wipe → A');
  var got = loadCrc(p);
  eq(got, C6, 'sostituzione + JSON che lancia: load() consegna A');
  check(logsSince(n0).indexOf('corrotto') < 0, 'sostituzione + JSON che lancia: nessun log "corrotto"');
  /* quota liberata: lo stesso payload riapplicato riesce */
  st.failPattern = null;
  var r2 = a.applyPayload({ v: 1, photos: [entryB(3, 0x2222, 1)] }, {});
  eq(r2.ok && r2.changed, true, 'quota liberata: ok e changed');
  eqJson(r2.added, [3], 'quota liberata: added [3]');
  eqJson(r2.errors, [], 'quota liberata: nessun errore');
  eq(a.count(), 1, 'quota liberata: count 1');
  eq(pid(a, 3), 0x2222, 'quota liberata: id di B');
  eq(st.mem[PKEY(3, 1)], R6b, 'quota liberata: p3.1 = payload di B');
  eq(st.has(PKEY(3, 2)), false, 'quota liberata: altro formato di A rimosso');
  eq(JSON.stringify(new Album(st, log).state().photos), JSON.stringify(a.state().photos), 'quota liberata: riavvio identico');
})();

(function () {
  /* primo Save su storage vuoto con JSON che lancia: entrambe le foto annullate, nessuna chiave */
  var st = memStorage({ failPattern: ALBUM_RE }), a = new Album(st, log), n0 = LOGS.length;
  var r = a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(0, 1, 2), entry(1, 2, 1)], order: [1, 0], settings: { font: 2 } }, {});
  eq(r.ok, false, 'primo Save fallito: ok false');
  eq(r.changed, false, 'primo Save fallito: changed false');
  eq(a.count(), 0, 'primo Save fallito: album vuoto (disco assente)');
  eqJson(a.data.order, [], 'primo Save fallito: ordine vuoto');
  eq(a.data.settings.font, 0, 'primo Save fallito: impostazioni ai default');
  eq(a.data.settingsSet, false, 'primo Save fallito: settingsSet false');
  eqJson(st.keys(), [], 'primo Save fallito: nessuna chiave (3 payload tolti)');
  check(logsSince(n0).indexOf('[album] album non salvato: 3 payload annullati') >= 0, 'primo Save fallito: log "3 payload annullati"');
  var p = a.plan(hello({ settingsCrc: 0 }));
  eq(p.settings, null, 'primo Save fallito: nessuna impostazione da mandare (mai impostate)');
})();

(function () {
  /* solo impostazioni/ordine con JSON che lancia: RAM torna a ciò che è su disco, "0 payload annullati" */
  var st = memStorage(), a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(1, 2, 1)], settings: { font: 1 } }, {});
  eqJson(a.data.order, [0, 1], 'impostazioni + JSON che lancia: ordine di partenza');
  st.failPattern = ALBUM_RE;
  var n0 = LOGS.length;
  var r = a.applyPayload({ v: 1, settings: { font: 2 }, order: [1, 0] }, {});
  eq(r.ok, false, 'impostazioni + JSON che lancia: ok false');
  eq(r.changed, false, 'impostazioni + JSON che lancia: changed false');
  eq(a.data.settings.font, 1, 'impostazioni + JSON che lancia: font come su disco');
  eqJson(a.data.order, [0, 1], 'impostazioni + JSON che lancia: ordine come su disco');
  check(logsSince(n0).indexOf('[album] album non salvato: 0 payload annullati') >= 0, 'impostazioni + JSON che lancia: log "0 payload annullati"');
  eq(st.has(PKEY(0, 1)) && st.has(PKEY(1, 1)), true, 'impostazioni + JSON che lancia: payload intatti');
  st.failPattern = null;
})();

(function () {
  /* full + eliminazioni implicite + JSON che lancia: i payload degli slot "eliminati" sono ANCORA lì,
   * le foto tornano in RAM, deleted come su disco; riapplicato a quota liberata → eliminazioni fatte */
  var st = memStorage(), a = threePhotos(st);
  st.failPattern = ALBUM_RE;
  var r = a.applyPayload({ v: 1, photos: [entry(3, 2, 1)] }, { full: true });
  eq(r.ok, false, 'eliminazioni + JSON che lancia: ok false');
  eq(r.changed, false, 'eliminazioni + JSON che lancia: changed false');
  eqJson(r.deleted, [], 'eliminazioni + JSON che lancia: res.deleted vuoto');
  eq(a.count(), 3, 'eliminazioni + JSON che lancia: le tre foto in RAM');
  eq(pid(a, 0), 1, 'eliminazioni + JSON che lancia: foto 0 ripristinata');
  eq(pid(a, 7), 3, 'eliminazioni + JSON che lancia: foto 7 ripristinata');
  eqJson(a.data.deleted, [], 'eliminazioni + JSON che lancia: deleted come su disco');
  eq(st.has(PKEY(0, 1)) && st.has(PKEY(0, 2)) && st.has(PKEY(7, 1)), true, 'eliminazioni + JSON che lancia: payload degli slot eliminati ANCORA presenti');
  eqJson(a.data.order, [0, 3, 7], 'eliminazioni + JSON che lancia: ordine come su disco');
  /* eliminazione esplicita (delta) con JSON che lancia: idem */
  var r1 = a.applyPayload({ v: 1, deleted: [7] }, {});
  eq(r1.ok, false, 'deleted [7] + JSON che lancia: ok false');
  eqJson(r1.deleted, [], 'deleted [7] + JSON che lancia: res.deleted vuoto');
  eq(pid(a, 7), 3, 'deleted [7] + JSON che lancia: foto 7 ripristinata');
  eq(st.has(PKEY(7, 1)), true, 'deleted [7] + JSON che lancia: payload ancora presente');
  eqJson(a.data.deleted, [], 'deleted [7] + JSON che lancia: deleted vuoto');
  var p = a.plan(hello({ valid: [[0, C6], [3, C6], [7, C6]], settingsCrc: a.settingsCrc() }));
  eqJson(p.deletes, [], 'deleted [7] + JSON che lancia: nessun ALBUM_DELETE');
  /* quota liberata: riapplicato → eliminazioni fatte, payload rimossi */
  st.failPattern = null;
  var r2 = a.applyPayload({ v: 1, photos: [entry(3, 2, 1)] }, { full: true });
  eq(r2.ok, true, 'riapplicato: ok');
  eqJson(r2.deleted.slice().sort(), [0, 7], 'riapplicato: eliminazioni fatte');
  eq(st.has(PKEY(0, 1)) || st.has(PKEY(0, 2)) || st.has(PKEY(7, 1)), false, 'riapplicato: payload rimossi');
  eqJson(a.data.deleted.slice().sort(), [0, 7], 'riapplicato: eliminazioni pendenti');
  eq(a.count(), 1, 'riapplicato: resta lo slot 3');
})();

(function () {
  /* ramo idempotente "payload mancante" (S7/F12: `stored` false, voce dev "solo metadati") + JSON che
   * lancia: il payload riscritto viene tolto (prev null); quota liberata → riscritto */
  var st = memStorage(), a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [{ slot: 2, photo_id: 5, fmt: 1, len: LEN6, crc: C6, url: '/photo/2.raw6' }] }, { allowUrl: true });
  eq(pstored(a, 2, 1), false, 'voce solo metadati: stored false');
  eq(st.has(PKEY(2, 1)), false, 'voce solo metadati: nessun payload');
  st.failPattern = ALBUM_RE;
  var r = a.applyPayload({ v: 1, photos: [entry(2, 5, 1)] }, {});
  eq(r.ok, false, 'payload mancante + JSON che lancia: ok false');
  eqJson(r.updated, [], 'payload mancante + JSON che lancia: updated vuoto');
  eq(st.has(PKEY(2, 1)), false, 'payload mancante + JSON che lancia: payload riscritto tolto (prev null)');
  eq(pid(a, 2), 5, 'payload mancante + JSON che lancia: metadati invariati');
  eq(pstored(a, 2, 1), false, 'payload mancante + JSON che lancia: stored torna false (RAM = disco)');
  st.failPattern = null;
  var r2 = a.applyPayload({ v: 1, photos: [entry(2, 5, 1)] }, {});
  eqJson(r2.updated, [2], 'payload mancante, quota liberata: updated [2]');
  eq(st.mem[PKEY(2, 1)], R6, 'payload mancante, quota liberata: payload riscritto');
  eq(pstored(a, 2, 1), true, 'payload mancante, quota liberata: stored true');
  eq(JSON.stringify(new Album(st, log).state().photos), JSON.stringify(a.state().photos), 'payload mancante: riavvio identico');
})();

(function () {
  /* due scritture sulla stessa chiave nella stessa chiamata + JSON che lancia: la chiave torna al
   * valore ORIGINALE (rollback in ordine inverso) */
  var st = memStorage(), a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [entry(3, 0x1111, 1)] }, {});
  st.failPattern = ALBUM_RE;
  var r = a.applyPayload({ v: 1, photos: [entryB(3, 0x2222, 1), entry(3, 0x3333, 1)] }, {});
  eq(r.ok, false, 'doppia scrittura + JSON che lancia: ok false');
  eq(st.mem[PKEY(3, 1)], R6, 'doppia scrittura + JSON che lancia: p3.1 = byte originali di A');
  eq(pid(a, 3), 0x1111, 'doppia scrittura + JSON che lancia: RAM = A');
  eq(pcrc(a, 3, 1), C6, 'doppia scrittura + JSON che lancia: CRC di A');
  st.failPattern = null;
})();

(function () {
  /* storage pieno anche per il ripristino (failAfter): il payload sovrascritto viene RIMOSSO — mai
   * byte con CRC diverso dai metadati; il piano poi salta lo slot ("assente") senza _dropCorrupt */
  var st = memStorage(), a = new Album(st, log);
  a.applyPayload({ v: 1, photos: [entry(3, 0x1111, 1)] }, {});
  eq(st.sets, 2, 'ripristino in quota: due scritture di partenza');
  st.failAfter = 3;                                    /* p3.1 = B riesce (3ª), il JSON e il ripristino no */
  var n0 = LOGS.length;
  var r = a.applyPayload({ v: 1, photos: [entryB(3, 0x2222, 1)] }, {});
  eq(r.ok, false, 'ripristino in quota: ok false');
  eq(pid(a, 3), 0x1111, 'ripristino in quota: RAM = A');
  eq(pcrc(a, 3, 1), C6, 'ripristino in quota: CRC di A');
  eq(st.has(PKEY(3, 1)), false, 'ripristino in quota: p3.1 rimosso (niente byte di B con il CRC di A)');
  check(logsSince(n0).indexOf('scrittura del payload slot 3 fmt 1 fallita') >= 0, 'ripristino in quota: log della scrittura fallita');
  /* S7/F12: i metadati su disco dicono `stored` (il payload c'era prima del rollback), quindi il piano
   * la mette e il buco si scopre in load(): errore, metadati del formato rimossi, NESSUN ciclo di retry
   * (il piano successivo non la contiene). Prima di F12 il piano rileggeva il payload e la saltava. */
  st.resetReads();
  var n1 = LOGS.length, p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eq(pstored(a, 3, 1), true, 'ripristino in quota: i metadati su disco dicono stored');
  eqJson(planSlots(p), [3], 'ripristino in quota: il piano la contiene (decide sui metadati, non rilegge)');
  eq(st.payloadReads(), 0, 'ripristino in quota: il piano non ha letto nessuna chiave di payload');
  st.failAfter = -1;                                   /* quota liberata: il _dropCorrupt può salvare */
  var got1 = loadCrc(p);
  eq(got1, 'ERR payload assente', 'ripristino in quota: load() dà "payload assente"');
  check(logsSince(n1).indexOf('payload locale corrotto (payload assente)') >= 0, 'ripristino in quota: log del _dropCorrupt');
  eq(a.data.photos[3], null, 'ripristino in quota: i metadati del formato (e la foto) sono rimossi');
  eqJson(a.data.order, [], 'ripristino in quota: ordine ripulito');
  var p2 = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p2), [], 'ripristino in quota: il piano successivo NON la ripropone (nessun retry infinito)');
  eq(new Album(st, log).count(), 0, 'ripristino in quota: la rimozione è su disco');
})();

/* ============================================================ 7. plan(hello) */

sec('7. plan(hello)');

(function () {
  /* album vuoto + orologio vuoto → niente da fare */
  var f = freshAlbum(), a = f.a;
  var p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eqJson(p.photos, [], 'vuoto+vuoto: nessuna foto');
  eqJson(p.deletes, [], 'vuoto+vuoto: nessuna eliminazione');
  eq(p.order, null, 'vuoto+vuoto: nessun ordine');
  eq(p.settings, null, 'vuoto+vuoto: nessuna impostazione (stesso CRC)');
  check(a.data.watch !== null, 'vuoto+vuoto: watch salvato');
})();

(function () {
  /* foto locale + slot vuoto sull'orologio → da inviare */
  var f = freshAlbum(), a = f.a, st = f.st;
  a.applyPayload({ v: 1, photos: [entry(2, 0xABCD, 1, { name: 'sole' })] }, {});
  var p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eq(p.photos.length, 1, 'slot vuoto: foto da inviare');
  var ph = p.photos[0];
  eq(ph.slot, 2, 'piano: slot');
  eq(ph.photoId, 0xABCD, 'piano: photoId');
  eq(ph.format, 1, 'piano: format');
  eq(ph.length, LEN6, 'piano: length');
  eq(ph.crc, C6, 'piano: crc');
  eq(ph.name, 'sole', 'piano: name');
  eq(typeof ph.load, 'function', 'piano: load(cb) presente');
  eq(ph.bytes, undefined, 'piano: i byte NON sono decodificati finché non si chiama load');
  var got = null;
  ph.load(function (e, b) { got = { e: e, n: b ? b.length : -1, crc: b ? crcm.crc32(b) : 0 }; });
  eq(got && got.e, null, 'load: nessun errore');
  eq(got && got.n, LEN6, 'load: byte decodificati');
  eq(got && got.crc, C6, 'load: CRC dei byte');
  /* due chiamate a load danno lo stesso risultato (nessuno stato consumato) */
  var got2 = null;
  ph.load(function (e, b) { got2 = b ? b.length : -1; });
  eq(got2, LEN6, 'load due volte: stesso risultato');

  /* slot VALID con lo stesso crc → non inviata */
  var p2 = a.plan(hello({ valid: [[2, C6]], settingsCrc: a.settingsCrc() }));
  eq(p2.photos.length, 0, 'stesso CRC sull\'orologio: non inviata');
  /* crc diverso → inviata */
  var p3 = a.plan(hello({ valid: [[2, (C6 ^ 0x1234) >>> 0]], settingsCrc: a.settingsCrc() }));
  eq(p3.photos.length, 1, 'CRC diverso: inviata');
  /* crc "firmato" (int32) dall'orologio: confronto come uint32 */
  var p4 = a.plan(hello({ valid: [[2, C6 | 0]], settingsCrc: a.settingsCrc() }));
  eq(p4.photos.length, 0, 'CRC negativo (int32) confrontato come uint32');
  /* slot VALID ma con state 2 (valore strano) */
  var h = hello({ settingsCrc: a.settingsCrc() });
  h.slots[2] = { state: 2, crc: C6 };
  eq(a.plan(h).photos.length, 0, 'state != 0 vale VALID');
})();

(function () {
  /* formato che l'album non ha (orologio flint, album solo raw6) */
  var f = freshAlbum(), a = f.a, n;
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1)] }, {});
  n = LOGS.length;
  var p = a.plan(hello({ format: 2, settingsCrc: a.settingsCrc() }));
  eq(p.photos.length, 0, 'formato mancante: nessuna foto');
  check(logsSince(n).indexOf('ritaglio') >= 0, 'formato mancante: log esplicativo');
  eq(p.settings !== null || p.order !== null, true, 'formato mancante: il resto del piano c\'è');
  /* formato sconosciuto */
  n = LOGS.length;
  var p2 = a.plan(hello({ format: 7, settingsCrc: a.settingsCrc() }));
  eq(p2.photos.length, 0, 'formato sconosciuto: nessuna foto');
  check(logsSince(n).indexOf('sconosciuto') >= 0, 'formato sconosciuto: log');
  var hNoFmt = hello({ settingsCrc: a.settingsCrc() });
  delete hNoFmt.format;
  eq(a.plan(hNoFmt).photos.length, 0, 'formato assente: nessuna foto');
  /* album con entrambi i formati: flint prende raw1 */
  var f2 = freshAlbum(), a2 = f2.a;
  a2.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(0, 1, 2)] }, {});
  var p3 = a2.plan(hello({ format: 2, settingsCrc: a2.settingsCrc() }));
  eq(p3.photos.length, 1, 'flint: una foto');
  eq(p3.photos[0].format, 2, 'flint: formato raw1');
  eq(p3.photos[0].length, LEN1, 'flint: lunghezza raw1');
  eq(p3.photos[0].crc, C1, 'flint: crc raw1');
  var b = null;
  p3.photos[0].load(function (e, x) { b = x; });
  eq(b && b.length, LEN1, 'flint: load dà 3.024 byte');
})();

(function () {
  /* payload mai scritto (voce dev "solo metadati", `stored` false): saltata senza loader, inviata con
   * loader. S7/F12: il piano lo sa dai metadati, senza rileggere la chiave del payload. */
  var f = freshAlbum(), a = f.a, st = f.st, n;
  a.applyPayload({ v: 1, photos: [{ slot: 6, photo_id: 0x99, fmt: 1, len: LEN6, crc: C6, url: '/photo/6.raw6' }] }, { allowUrl: true });
  eq(pstored(a, 6, 1), false, 'voce solo metadati: stored false');
  n = LOGS.length;
  st.resetReads();
  var p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eq(p.photos.length, 0, 'payload assente e nessun loader: saltata');
  eq(st.payloadReads(), 0, 'payload assente: il piano non legge le chiavi dei payload');
  check(logsSince(n).indexOf('nessun loader') >= 0, 'payload assente: log');

  var calls = [];
  a.setLoader(function (slot, fmt, cb) { calls.push([slot, fmt]); cb(null, R6); });
  var p2 = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eq(p2.photos.length, 1, 'con loader: inviata');
  eq(calls.length, 0, 'con loader: il loader non viene chiamato dal piano');
  var got = null;
  p2.photos[0].load(function (e, b) { got = { e: e, n: b ? b.length : -1 }; });
  eqJson(calls, [[6, 1]], 'load: loader chiamato con slot e formato');
  eq(got && got.e, null, 'load con loader: nessun errore');
  eq(got && got.n, LEN6, 'load con loader: byte');
  eq(st.mem[PKEY(6, 1)], R6, 'load con loader: b64 salvato in localStorage');
  /* da qui in poi il payload è locale: il loader non serve più */
  calls.length = 0;
  a.plan(hello({ settingsCrc: a.settingsCrc() })).photos[0].load(function () {});
  eqJson(calls, [], 'load: payload ormai locale, loader non chiamato');

  /* loader che ritorna una stringa corrotta: errore, nessun salvataggio */
  st.removeItem(PKEY(6, 1));
  a.setLoader(function (slot, fmt, cb) { cb(null, corruptB64(R6)); });
  var e1 = 'nessuno';
  a.plan(hello({ settingsCrc: a.settingsCrc() })).photos[0].load(function (e, b) { e1 = e; });
  check(typeof e1 === 'string' && e1.indexOf('loader') >= 0, 'loader corrotto: cb(err) (' + e1 + ')');
  eq(st.has(PKEY(6, 1)), false, 'loader corrotto: nessun salvataggio');
  /* loader che sbaglia lunghezza */
  a.setLoader(function (slot, fmt, cb) { cb(null, R1); });
  e1 = 'nessuno';
  a.plan(hello({ settingsCrc: a.settingsCrc() })).photos[0].load(function (e) { e1 = e; });
  check(typeof e1 === 'string' && e1.indexOf('lunghezza') >= 0, 'loader con lunghezza sbagliata: cb(err)');
  eq(st.has(PKEY(6, 1)), false, 'loader con lunghezza sbagliata: nessun salvataggio');
  /* loader che fallisce */
  a.setLoader(function (slot, fmt, cb) { cb('rete'); });
  e1 = 'nessuno';
  a.plan(hello({ settingsCrc: a.settingsCrc() })).photos[0].load(function (e) { e1 = e; });
  check(typeof e1 === 'string' && e1.indexOf('rete') >= 0, 'loader in errore: cb(err) (' + e1 + ')');
  /* loader che non ritorna una stringa */
  a.setLoader(function (slot, fmt, cb) { cb(null, 42); });
  e1 = 'nessuno';
  a.plan(hello({ settingsCrc: a.settingsCrc() })).photos[0].load(function (e) { e1 = e; });
  check(typeof e1 === 'string', 'loader senza stringa: cb(err)');
})();

(function () {
  /* payload locale corrotto: load dà errore e il payload viene rimosso */
  var f = freshAlbum(), a = f.a, st = f.st;
  a.applyPayload({ v: 1, photos: [entry(1, 0x33, 1)] }, {});
  st.mem[PKEY(1, 1)] = corruptB64(R6);
  var p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eq(p.photos.length, 1, 'payload corrotto: la foto è nel piano (il CRC si scopre in load)');
  var err = null;
  p.photos[0].load(function (e) { err = e; });
  check(typeof err === 'string' && err.indexOf('corrotto') >= 0, 'payload locale corrotto: cb(err) (' + err + ')');
  eq(st.has(PKEY(1, 1)), false, 'payload locale corrotto: rimosso dallo storage');
  /* al piano successivo la foto viene saltata (nessun payload, nessun loader) */
  eq(a.plan(hello({ settingsCrc: a.settingsCrc() })).photos.length, 0, 'dopo la rimozione: foto saltata');
  /* payload di lunghezza sbagliata */
  var f2 = freshAlbum(), a2 = f2.a;
  a2.applyPayload({ v: 1, photos: [entry(1, 0x33, 1)] }, {});
  f2.st.mem[PKEY(1, 1)] = R6.substring(0, 1000);
  err = null;
  f2.a.plan(hello({ settingsCrc: a2.settingsCrc() })).photos[0].load(function (e) { err = e; });
  check(typeof err === 'string', 'payload troppo corto: cb(err)');
  eq(f2.st.has(PKEY(1, 1)), false, 'payload troppo corto: rimosso');
})();

(function () {
  /* eliminazioni: solo per gli slot ancora VALID */
  var f = freshAlbum(), a = f.a;
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(3, 2, 1), entry(5, 3, 1)] }, {});
  a.applyPayload({ v: 1, deleted: [0, 3, 9] }, {});
  eqJson(a.data.deleted, [0, 3, 9], 'tre eliminazioni pendenti');
  var p = a.plan(hello({ valid: [[0, C6], [5, C6]], settingsCrc: a.settingsCrc() }));
  eqJson(p.deletes, [0], 'deletes: solo lo slot VALID sull\'orologio');
  eqJson(a.data.deleted, [0], 'gli slot già vuoti sull\'orologio escono da deleted');
  eq(JSON.stringify(new Album(f.st, log).data.deleted), '[0]', 'la lista ripulita è salvata');
  /* slot 5: foto locale ancora presente e già sull'orologio con lo stesso crc */
  eq(p.photos.length, 0, 'nessuna foto da inviare');
  check(p.order !== null, 'con eliminazioni: ordine presente');
  check(p.order.indexOf(0) < 0, 'lo slot eliminato non sta nell\'ordine');
})();

(function () {
  /* ordine: presente se orderDirty o foto o eliminazioni, assente altrimenti */
  var f = freshAlbum(), a = f.a;
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(3, 2, 1)] }, {});
  eq(a.data.orderDirty, true, 'orderDirty dopo l\'aggiunta');
  var p = a.plan(hello({ valid: [[0, C6], [3, C6]], settingsCrc: a.settingsCrc() }));
  check(p.order !== null, 'orderDirty → ordine presente');
  eq(p.photos.length + p.deletes.length, 0, 'ordine presente anche senza foto/eliminazioni');
  a.onDone({ order: 'OK' });
  eq(a.data.orderDirty, false, 'onDone azzera orderDirty');
  var p2 = a.plan(hello({ valid: [[0, C6], [3, C6]], settingsCrc: a.settingsCrc() }));
  eq(p2.order, null, 'niente da fare → nessun ordine');
  /* una foto da inviare lo fa tornare */
  var p3 = a.plan(hello({ valid: [[0, C6]], settingsCrc: a.settingsCrc() }));
  check(p3.order !== null, 'con foto da inviare → ordine presente');
  /* solo eliminazioni */
  a.applyPayload({ v: 1, deleted: [3] }, {});
  a.data.orderDirty = false;
  var p4 = a.plan(hello({ valid: [[0, C6], [3, C6]], settingsCrc: a.settingsCrc() }));
  eqJson(p4.deletes, [3], 'una eliminazione');
  check(p4.order !== null, 'con eliminazioni → ordine presente');
})();

(function () {
  /* forma dell'ordine: 12 byte, ordine locale + estranei, 0xFF in coda, senza duplicati */
  var f = freshAlbum(), a = f.a, i;
  a.applyPayload({ v: 1, photos: [entry(4, 1, 1), entry(1, 2, 1)], order: [4, 1] }, {});
  var p = a.plan(hello({ valid: [[7, 111], [9, 222]], settingsCrc: a.settingsCrc() }));
  eq(p.order.length, 12, 'ordine: 12 byte');
  eqJson(p.order, [4, 1, 7, 9, 255, 255, 255, 255, 255, 255, 255, 255],
         'ordine locale + slot VALID estranei accodati + 0xFF di riempimento');
  eqJson(a.data.watch.foreign, [7, 9], 'estranei annotati nel watch');
  /* estranei già in deleted: non vanno nell'ordine */
  a.applyPayload({ v: 1, deleted: [7] }, {});
  var p2 = a.plan(hello({ valid: [[7, 111], [9, 222]], settingsCrc: a.settingsCrc() }));
  eqJson(p2.order, [4, 1, 9, 255, 255, 255, 255, 255, 255, 255, 255, 255],
         'lo slot estraneo in eliminazione non entra nell\'ordine');
  eqJson(p2.deletes, [7], 'lo slot estraneo in eliminazione viene eliminato');
  eqJson(a.data.watch.foreign, [9], 'estranei: solo quelli non in eliminazione');
  /* nessun duplicato, nessun valore fuori range, mai più di 12 */
  var seen = {}, dup = 0, bad = 0;
  for (i = 0; i < p2.order.length; i++) {
    if (p2.order[i] !== 255) {
      if (seen[p2.order[i]]) { dup++; }
      seen[p2.order[i]] = true;
      if (p2.order[i] < 0 || p2.order[i] > 11) { bad++; }
    }
  }
  eq(dup, 0, 'ordine senza duplicati');
  eq(bad, 0, 'ordine: solo slot 0..11 e 0xFF');
  /* album pieno + estranei impossibili: 12 voci senza 0xFF */
  var f2 = freshAlbum(), a2 = f2.a, list = [];
  for (i = 0; i < 12; i++) { list.push(entry(i, 100 + i, 1)); }
  a2.applyPayload({ v: 1, photos: list }, {});
  var p3 = a2.plan(hello({ settingsCrc: a2.settingsCrc() }));
  eq(p3.order.length, 12, 'album pieno: 12 byte');
  eq(p3.order.indexOf(255), -1, 'album pieno: nessun 0xFF');
  eqJson(p3.order, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'album pieno: tutti gli slot');
  /* 11 foto + 2 estranei: si accoda solo il primo che ci sta */
  var f3 = freshAlbum(), a3 = f3.a;
  list = [];
  for (i = 0; i < 11; i++) { list.push(entry(i, 200 + i, 1)); }
  a3.applyPayload({ v: 1, photos: list }, {});
  var p4 = a3.plan(hello({ valid: [[11, 5]], settingsCrc: a3.settingsCrc() }));
  eq(p4.order.length, 12, '11 foto + 1 estraneo: 12 byte');
  eq(p4.order[11], 11, '11 foto + 1 estraneo: l\'estraneo in coda');
})();

(function () {
  /* invariante: nell'ordine non ci sono slot senza foto locale che non siano estranei VALID */
  var f = freshAlbum(), a = f.a;
  a.applyPayload({ v: 1, photos: [entry(2, 1, 1), entry(8, 2, 1)] }, {});
  a.applyPayload({ v: 1, deleted: [8] }, {});
  var p = a.plan(hello({ valid: [[8, C6], [5, 9]], settingsCrc: a.settingsCrc() }));
  var i, k, bad = 0;
  for (i = 0; i < p.order.length; i++) {
    k = p.order[i];
    if (k === 255) { continue; }
    if (!a.data.photos[k] && a.data.watch.foreign.indexOf(k) < 0) { bad++; }
    if (p.deletes.indexOf(k) >= 0) { bad++; }
  }
  eq(bad, 0, 'ordine: solo slot con foto locale o estranei, mai slot da eliminare');
})();

(function () {
  /* impostazioni: solo se l'utente le ha mai espresse (settingsSet) E il CRC dell'orologio manca o è
   * diverso — un telefono nuovo non sovrascrive con i default quelle dell'orologio (S5b, design §5.1) */
  var f = freshAlbum(), a = f.a;
  eq(a.data.settingsSet, false, 'album nuovo: settingsSet false');
  eq(a.plan(hello({ settingsCrc: 0 })).settings, null, 'mai impostate → niente SETTINGS anche con CRC diverso');
  eq(a.plan(hello({ settingsCrc: undefined })).settings, null, 'mai impostate → niente SETTINGS anche senza CRC');
  a.applyPayload({ v: 1, settings: {} }, {});
  eq(a.data.settingsSet, true, 'payload con settings (anche vuoto = default) → settingsSet');
  eq(new Album(f.st, function () {}).data.settingsSet, true, 'settingsSet sopravvive al riavvio');
  eq(a.plan(hello({ settingsCrc: a.settingsCrc() })).settings, null, 'stesso CRC → niente SETTINGS');
  check(a.plan(hello({ settingsCrc: undefined })).settings !== null, 'CRC assente → SETTINGS');
  check(a.plan(hello({ settingsCrc: null })).settings !== null, 'CRC null → SETTINGS');
  check(a.plan(hello({ settingsCrc: 0 })).settings !== null, 'CRC 0 (≠ 0x7EE7) → SETTINGS');
  check(a.plan(hello({ settingsCrc: (a.settingsCrc() ^ 1) })).settings !== null, 'CRC diverso → SETTINGS');
  eqJson(a.plan(hello({ settingsCrc: 0 })).settings, a.settingsBytes(), 'SETTINGS = blob da 20 byte');
  eq(a.plan(hello({ settingsCrc: 0 })).settings.length, 20, 'SETTINGS: 20 byte');
  /* CRC "sporco" nei bit alti (int32 dall'orologio) */
  eq(a.plan(hello({ settingsCrc: 0x7EE7 | 0x10000 })).settings, null, 'solo i 16 bit bassi contano');
  /* cambiando le impostazioni cambia il CRC */
  a.applyPayload({ v: 1, settings: { layout: 1 } }, {});
  check(a.settingsCrc() !== 0x7EE7, 'CRC cambiato dopo le nuove impostazioni');
  check(a.plan(hello({ settingsCrc: 0x7EE7 })).settings !== null, 'CRC vecchio → SETTINGS');
  eq(a.plan(hello({ settingsCrc: a.settingsCrc() })).settings, null, 'CRC nuovo → niente SETTINGS');
})();

(function () {
  /* watch: snapshot dell'HELLO */
  var f = freshAlbum(), a = f.a;
  var t0 = new Date().getTime();
  a.plan(hello({ valid: [[3, 0x11223344]], maxChunk: 3072, format: 2, settingsCrc: 0x1234 }));
  var w = a.data.watch;
  check(w && w.at >= t0, 'watch.at aggiornato');
  eq(w.format, 2, 'watch.format');
  eq(w.maxChunk, 3072, 'watch.maxChunk');
  eq(w.settingsCrc, 0x1234, 'watch.settingsCrc');
  eq(w.slots.length, 12, 'watch.slots: 12 voci');
  eqJson(w.slots[3], { state: 1, crc: 0x11223344 }, 'watch.slots[3]');
  eqJson(w.slots[0], { state: 0, crc: 0 }, 'watch.slots[0]');
  eqJson(w.foreign, [3], 'watch.foreign');
  eq(JSON.stringify(new Album(f.st, log).data.watch), JSON.stringify(w), 'watch salvato in localStorage (chiave separata)');
  check(typeof f.st.getItem('galleria.v1.watch') === 'string', 'chiave galleria.v1.watch presente');
  (function () {
    var rawAlbum = f.st.getItem('galleria.v1.album');   /* può mancare: plan() non riscrive l'album */
    check(rawAlbum === null || JSON.parse(rawAlbum).watch === undefined, 'watch NON dentro il JSON dell\'album (S5b: non riscritto a ogni HELLO)');
  })();
  /* settingsCrc assente → null nello snapshot */
  a.plan(hello({}));
  eq(a.data.watch.settingsCrc, null, 'watch.settingsCrc = null se l\'HELLO non lo porta');
})();

(function () {
  /* v1.9 (perf 04/09): watch.openMs = apertura del file persist, per l'avviso della config page */
  var f = freshAlbum(), a = f.a;
  eq(a.plan(hello({ openMs: 0 })) && a.data.watch.openMs, 0, 'watch.openMs = 0 (file sano)');
  a.plan(hello({ openMs: 2150 }));
  eq(a.data.watch.openMs, 2150, 'watch.openMs dal HELLO');
  eq(a.state().watch.openMs, 2150, 'state(): openMs esposto alla config page');
  check(a.state().watch.at > 0, 'state(): `at` dello snapshot esposto');
  a.plan(hello({}));
  eq(a.data.watch.openMs, null, 'watch.openMs = null se l\'HELLO non lo porta (orologio vecchio)');
  eq(a.state().watch.openMs, null, 'state(): openMs null se non noto');
  a.plan(hello({ openMs: 0x12345 }));
  eq(a.data.watch.openMs, 0x2345, 'watch.openMs mascherato a 16 bit');
  a.plan(hello({ openMs: 'x' }));
  eq(a.data.watch.openMs, null, 'watch.openMs non numerico → null');
  a.plan(hello({ openMs: 900 }));
  eq(JSON.parse(f.st.getItem('galleria.v1.watch')).openMs, 900, 'openMs salvato nella chiave watch');
  /* snapshot scritto prima della v1.9: resta valido, openMs null (nessun avviso) */
  f.st.setItem('galleria.v1.watch', JSON.stringify({ at: 1, format: 1, maxChunk: 4096, settingsCrc: 1, slots: [], foreign: [] }));
  var a2 = new Album(f.st, log);
  check(a2.data.watch !== null, 'snapshot pre-v1.9 ancora valido');
  eq(a2.data.watch.openMs, null, 'snapshot pre-v1.9: openMs null');
  eq(a2.state().watch.openMs, null, 'state() di un album pre-v1.9: openMs null');
})();

(function () {
  /* HELLO malformati: nessuna eccezione */
  var f = freshAlbum(), a = f.a;
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1)] }, {});
  var p = a.plan({ format: 1 });
  eq(p.photos.length, 1, 'HELLO senza slots: la foto va inviata (orologio vuoto)');
  eq(a.data.watch.slots.length, 12, 'HELLO senza slots: watch riempito di slot vuoti');
  p = a.plan({ format: 1, slots: [] });
  eq(p.photos.length, 1, 'HELLO con slots vuoto');
  p = a.plan({ format: 1, slots: [{ state: 1, crc: C6 }] });
  eq(p.photos.length, 0, 'HELLO con un solo slot: quello conta');
  p = a.plan({ format: 1, slots: [null, undefined, 3] });
  eq(p.photos.length, 1, 'HELLO con slot non oggetti');
  p = a.plan({ format: 1, slots: [{ state: 1 }] });
  eq(p.photos.length, 1, 'slot VALID senza crc → crc 0 ≠ il nostro → da inviare');
  eq(a.plan({ format: 1, maxChunk: undefined, slots: [] }).photos.length, 1, 'maxChunk assente');
  eq(a.data.watch.maxChunk, 0, 'watch.maxChunk = 0 se assente');
})();

(function () {
  /* caso limite: impostazioni il cui crc16 vale 0 — "CRC 0" è un valore legittimo, non
   * "campo assente": con settingsCrc null il blob va mandato lo stesso, con settingsCrc 0 no. */
  var f = freshAlbum(), a = f.a;
  var zero = { layout: 0, font: 0, clock_mode: 1, leading_zero: 0, text_color: 1, outline: 1,
               interval_min: 5, order: 0, shake_next: 1, info_row: 8 };
  a.applyPayload({ v: 1, settings: zero }, {});
  eq(a.settingsCrc(), 0, 'impostazioni con crc16 = 0 (caso limite costruito apposta)');
  check(a.plan(hello({ settingsCrc: null })).settings !== null,
        'settingsCrc null con crc locale 0 → SETTINGS inviate (null ≠ 0)');
  check(a.plan(hello({ settingsCrc: undefined })).settings !== null,
        'settingsCrc assente con crc locale 0 → SETTINGS inviate');
  eq(a.plan(hello({ settingsCrc: 0 })).settings, null,
     'settingsCrc 0 con crc locale 0 → niente SETTINGS');
  eq(a.plan(hello({ settingsCrc: 1 })).settings !== null, true,
     'settingsCrc 1 con crc locale 0 → SETTINGS inviate');
})();

/* ============================================================ 8. onDone */

sec('8. onDone(summary)');

(function () {
  var f = freshAlbum(), a = f.a;
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(3, 2, 1)] }, {});
  a.applyPayload({ v: 1, deleted: [0, 3] }, {});
  eq(a.data.orderDirty, true, 'orderDirty prima di onDone');
  eqJson(a.data.deleted, [0, 3], 'due eliminazioni pendenti');
  a.onDone({ order: 'OK' });
  eq(a.data.orderDirty, true, 'order OK senza un piano che lo abbia mandato: orderDirty resta (S5b, orderGen)');
  (function () {
    /* riordino DOPO il piano (Save durante la sync): l'OK dell'ALBUM_ORDER vecchio non azzera orderDirty */
    var f2 = freshAlbum(), a2 = f2.a;
    a2.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(3, 2, 1)], order: [0, 3] }, {});
    var p1 = a2.plan(hello({ valid: [[0, C6], [3, C6]], settingsCrc: a2.settingsCrc() }));
    check(p1.order !== null, 'piano con ALBUM_ORDER (orderDirty)');
    a2.applyPayload({ v: 1, order: [3, 0] }, {});
    a2.onDone({ order: 'OK' });
    eq(a2.data.orderDirty, true, 'order OK di un piano superato da un riordino: orderDirty resta');
    var p2 = a2.plan(hello({ valid: [[0, C6], [3, C6]], settingsCrc: a2.settingsCrc() }));
    eqJson(p2.order.slice(0, 2), [3, 0], 'il piano nuovo manda l\'ordine nuovo');
    a2.onDone({ order: 'OK' });
    eq(a2.data.orderDirty, false, 'order OK del piano corrente → orderDirty falso');
  })();
  a.plan(hello({ valid: [[0, C6], [3, C6]], settingsCrc: a.settingsCrc() }));
  a.onDone({ order: 'OK' });
  eq(a.data.orderDirty, false, 'order OK del piano corrente → orderDirty falso');
  eqJson(a.data.deleted, [0, 3], 'order OK: le eliminazioni restano');
  a.onDone({ deletes: ['3:OK'] });
  eqJson(a.data.deleted, [0], 'delete 3 OK → fuori da deleted');
  a.onDone({ deletes: ['0:BAD_FORMAT'] });
  eqJson(a.data.deleted, [0], 'delete 0 fallito → resta');
  a.onDone({ deletes: ['0:OK', '9:OK', 'x:OK', '0:OK'] });
  eqJson(a.data.deleted, [], 'delete 0 OK → fuori; valori strani ignorati');
  /* stato salvato */
  eq(JSON.stringify(new Album(f.st, log).data.deleted), '[]', 'onDone salva l\'album');
  /* summary null/strani: niente */
  a.data.orderDirty = true;
  a.onDone(null); a.onDone(undefined); a.onDone({}); a.onDone({ order: 'BAD' }); a.onDone({ deletes: null });
  eq(a.data.orderDirty, true, 'summary null/vuoto: orderDirty invariato');
  a.plan(hello({ settingsCrc: a.settingsCrc() }));
  a.onDone({ order: 'OK', deletes: [] });
  eq(a.data.orderDirty, false, 'order OK con deletes vuoto (piano corrente)');
  /* order OK quando orderDirty è già falso: nessuna scrittura inutile */
  var setsBefore = f.st.sets;
  a.onDone({ order: 'OK' });
  eq(f.st.sets - setsBefore, 0, 'onDone senza cambiamenti non riscrive il JSON');
  /* onPhotoResult non lancia; S6: un esito OK aggiorna SOLO lo snapshot dell'HELLO (watch.slots[k]
   * → VALID con il CRC inviato, una scrittura della chiave watch), un esito fallito non tocca nulla */
  var snap = JSON.stringify(a.state());
  var w0 = JSON.stringify(a.data.watch.slots[0]);
  var wsets = f.st.sets;
  a.onPhotoResult({ slot: 0, crc: 0xDEADBEEF }, true, 0);
  eq(JSON.stringify(a.data.watch.slots[0]), JSON.stringify({ state: 1, crc: 0xDEADBEEF }), 'S6: esito OK → slot VALID nello snapshot');
  eq(f.st.sets - wsets, 1, 'S6: esito OK → una scrittura (snapshot)');
  var s2 = JSON.parse(JSON.stringify(a.state()));
  s2.watch.slots[0] = JSON.parse(w0);
  eq(JSON.stringify(s2), snap, 'S6: esito OK tocca solo watch.slots[0]');
  wsets = f.st.sets;
  var snapOk = JSON.stringify(a.state());
  a.onPhotoResult({ slot: 3 }, false, 1);
  a.onPhotoResult({ slot: 12 }, true, 0);
  a.onPhotoResult(null, true, 0);
  eq(JSON.stringify(a.state()), snapOk, 'esito fallito / slot non valido / photo null: stato invariato');
  eq(f.st.sets - wsets, 0, 'esito fallito: nessuna scrittura');
  /* S6: ALBUM_DELETE k OK → slot k vuoto nello snapshot (anche se non era in deleted) e via da foreign */
  a.data.watch.foreign = [0, 5];
  wsets = f.st.sets;
  a.onDone({ deletes: ['0:OK', '5:STORAGE_ERR'] });
  eq(JSON.stringify(a.data.watch.slots[0]), JSON.stringify({ state: 0, crc: 0 }), 'S6: delete OK → slot vuoto nello snapshot');
  eq(a.data.watch.foreign.join(','), '5', 'S6: delete OK → via da foreign; delete fallita resta');
  eq(f.st.sets - wsets, 1, 'S6: delete OK → una scrittura (snapshot, album invariato)');
  /* snapshot assente (nessun HELLO): nessun errore, nessuna scrittura */
  a.data.watch = undefined;
  wsets = f.st.sets;
  a.onPhotoResult({ slot: 0, crc: 1 }, true, 0);
  a.onDone({ deletes: ['0:OK'] });
  eq(f.st.sets - wsets, 0, 'S6: senza snapshot nessuna scrittura');
})();

/* ================================================= 9. riavvio (round trip) */

sec('9. riavvio del PKJS');

(function () {
  var f = freshAlbum(), a = f.a;
  a.applyPayload({ v: 1, photos: [entry(0, 0x111, 1), entry(0, 0x111, 2), entry(5, 0x222, 1, { name: 'x' })],
                   order: [5, 0], settings: { layout: 1, font: 2, interval_min: 15 } }, {});
  a.applyPayload({ v: 1, deleted: [7] }, {});
  a.plan(hello({ valid: [[9, 3]], settingsCrc: 0 }));
  var before = JSON.stringify(a.state());
  var a2 = new Album(f.st, log);
  eq(JSON.stringify(a2.state()), before, 'riavvio: stesso stato (round trip JSON)');
  eq(a2.count(), 2, 'riavvio: due foto');
  eqJson(a2.data.order, [5, 0], 'riavvio: ordine');
  eq(a2.data.settings.layout, 1, 'riavvio: impostazioni');
  eq(a2.settingsCrc(), a.settingsCrc(), 'riavvio: stesso CRC delle impostazioni');
  eq(a2.hasPayload(0, 2), true, 'riavvio: payload ancora al loro posto');
  eq(a2.summary(), a.summary(), 'riavvio: stesso summary');
  /* e il piano è identico */
  var h = hello({ valid: [[0, C6]], settingsCrc: a.settingsCrc() });
  eqJson(planSlots(a2.plan(h)), planSlots(a.plan(h)), 'riavvio: stesso piano');
})();

/* ============================================== 10. API varie */

sec('10. state/count/summary/reset');

(function () {
  var f = freshAlbum(), a = f.a;
  check(typeof a.summary() === 'string' && a.summary().length > 0, 'summary() su album vuoto');
  eq(a.count(), 0, 'count() su album vuoto');
  check(a.state().v === 1, 'state().v');
  a.applyPayload({ v: 1, photos: [entry(0, 1, 1), entry(0, 1, 2), entry(3, 2, 1)] }, {});
  eq(a.count(), 2, 'count()');
  check(a.summary().indexOf('2 foto') === 0, 'summary(): conteggio (' + a.summary() + ')');
  check(a.summary().indexOf('0:61') >= 0, 'summary(): due formati per lo slot 0');
  eqJson(a.state().order, [0, 3], 'state().order');
  check(a.state().order !== a.data.order, 'state().order è una copia');
  check(a.state().deleted !== a.data.deleted, 'state().deleted è una copia');
  /* summary NON rilegge i payload (45 KB l'uno): niente marcatore "?" (revisione S5b) */
  f.st.removeItem(PKEY(3, 1));
  check(a.summary().indexOf('3:6') >= 0 && a.summary().indexOf('?') < 0, 'summary(): nessuna rilettura dei payload (' + a.summary() + ')');
  eq(a.hasPayload(3, 1), false, 'hasPayload dice il vero');
  /* reset */
  a.plan(hello({}));
  a.applyPayload({ v: 1, deleted: [9] }, {});
  check(f.st.keys().length >= 3, 'prima del reset ci sono chiavi');
  a.reset();
  eqJson(f.st.keys(), [], 'reset(): tutte le chiavi galleria.v1.* rimosse');
  eq(a.count(), 0, 'reset(): album vuoto');
  eqJson(a.data.order, [], 'reset(): ordine vuoto');
  eqJson(a.data.deleted, [], 'reset(): eliminazioni azzerate');
  eq(a.data.watch, null, 'reset(): watch azzerato');
  eq(a.data.orderDirty, false, 'reset(): orderDirty falso');
  eqJson(a.data.settings, Album.defaultSettings(), 'reset(): impostazioni di default');
  /* dopo il reset l'album funziona ancora */
  a.applyPayload({ v: 1, photos: [entry(1, 5, 1)] }, {});
  eq(a.count(), 1, 'dopo il reset si può riempire di nuovo');
  eq(new Album(f.st, log).count(), 1, 'dopo il reset il salvataggio funziona');
})();

(function () {
  /* costanti esportate */
  eq(Album.MAX_SLOTS, 12, 'MAX_SLOTS');
  eq(Album.FMT_RAW6, 1, 'FMT_RAW6');
  eq(Album.FMT_RAW1, 2, 'FMT_RAW1');
  eq(Album.FMT_LEN[1], 34200, 'FMT_LEN raw6');
  eq(Album.FMT_LEN[2], 3024, 'FMT_LEN raw1');
  eq(Album.KEY, 'galleria.v1.album', 'chiave dell\'album');
  eq(Album.payloadKey(3, 2), 'galleria.v1.p3.2', 'chiave del payload');
})();

/* ================================= 11. campo `stored` dei metadati (S7, F12) */

sec('11. campo stored (F12): il piano non rilegge i payload');

/* 11.1 — plan()/summary()/state()/count() su un album pieno: nessun getItem sulle chiavi dei payload
 * (45,6 KB l'una su emery: erano 12 letture per HELLO). */
(function () {
  var f = freshAlbum(), a = f.a, st = f.st, list = [], k, nStored = 0;
  for (k = 0; k < 12; k++) { list.push(entry(k, 100 + k, 1)); }
  a.applyPayload({ v: 1, photos: list }, {});
  eq(a.count(), 12, '12 foto: album pieno');
  for (k = 0; k < 12; k++) { if (pstored(a, k, 1) === true) { nStored++; } }
  eq(nStored, 12, '12 foto: stored true su tutti i formati scritti');
  st.resetReads();
  var p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eq(p.photos.length, 12, 'plan con 12 foto: tutte da inviare');
  eq(st.payloadReads(), 0, 'plan con 12 foto: 0 letture delle chiavi p<slot>.<fmt>');
  eq(st.readsOf(PKEY(0, 1)) + st.readsOf(PKEY(11, 1)), 0, 'plan: nessuna lettura nemmeno del primo/ultimo payload');
  st.resetReads();
  a.summary(); a.state(); a.count();
  eq(st.payloadReads(), 0, 'summary()/state()/count(): 0 letture dei payload');
  /* orologio aggiornato: piano vuoto, sempre senza letture */
  var valid = [];
  for (k = 0; k < 12; k++) { valid.push([k, C6]); }
  st.resetReads();
  var p2 = a.plan(hello({ valid: valid, settingsCrc: a.settingsCrc() }));
  eq(p2.photos.length, 0, 'plan: niente da inviare');
  eq(st.payloadReads(), 0, 'plan (niente da fare): 0 letture dei payload');
  /* le foto del piano leggono il payload SOLO quando il motore chiama load() */
  st.resetReads();
  var got = loadCrc(p);
  eq(got, C6, 'load(): consegna i byte');
  eq(st.readsOf(PKEY(0, 1)), 1, 'load(): una sola lettura, e solo della sua chiave');
  eq(st.payloadReads(), 1, 'load(): nessun altro payload letto');
})();

/* 11.2 — applyPayload: idempotente = 0 letture; foto nuova = 0 letture (il `prev` del rollback si
 * rilegge solo se i metadati dicono che un payload c'è). */
(function () {
  var f = freshAlbum(), a = f.a, st = f.st;
  a.applyPayload({ v: 1, photos: [entry(2, 0x1234, 1), entry(2, 0x1234, 2)] }, {});
  st.resetReads();
  var r = a.applyPayload({ v: 1, photos: [entry(2, 0x1234, 1), entry(2, 0x1234, 2)] }, {});
  eq(r.changed, false, 'applyPayload idempotente: nessun cambiamento');
  eq(st.payloadReads(), 0, 'applyPayload idempotente: 0 letture dei payload (decide su stored)');
  eqJson(r.updated, [], 'applyPayload idempotente: updated vuoto');
  /* foto nuova in uno slot vuoto: niente da salvare per il rollback, niente da rileggere */
  st.resetReads();
  a.applyPayload({ v: 1, photos: [entry(5, 0x9999, 1)] }, {});
  eq(st.payloadReads(), 0, 'foto nuova in slot vuoto: 0 letture dei payload');
  eq(pstored(a, 5, 1), true, 'foto nuova: stored true');
  /* sostituzione: si rilegge SOLO la chiave che si sta per sovrascrivere (rollback F6/F8) */
  st.resetReads();
  a.applyPayload({ v: 1, photos: [entryB(5, 0xAAAA, 1)] }, {});
  eq(st.readsOf(PKEY(5, 1)), 1, 'sostituzione: una lettura della chiave sovrascritta (prev del rollback)');
  eq(st.payloadReads(), 1, 'sostituzione: nessun altro payload letto');
  /* voce dev "solo metadati": stored false e nessuna lettura */
  st.resetReads();
  a.applyPayload({ v: 1, photos: [{ slot: 8, photo_id: 0x77, fmt: 1, len: LEN6, crc: C6, url: '/photo/8.raw6' }] }, { allowUrl: true });
  eq(pstored(a, 8, 1), false, 'voce dev senza data: stored false');
  eq(st.payloadReads(), 0, 'voce dev senza data: 0 letture dei payload');
  eq(JSON.stringify(new Album(st, log).state().photos), JSON.stringify(a.state().photos), 'stored: riavvio identico alla RAM');
})();

/* 11.3 — load() con il payload sparito e `stored` true: via i metadati di QUEL formato, errore, e il
 * piano successivo non la contiene (nessun ciclo di retry). */
(function () {
  var f = freshAlbum(), a = f.a, st = f.st;
  a.applyPayload({ v: 1, photos: [entry(1, 0x55, 1), entry(1, 0x55, 2), entry(4, 0x66, 1)] }, {});
  st.removeItem(PKEY(1, 1));                       /* il sistema ha ripulito il localStorage */
  var n0 = LOGS.length;
  var p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p), [1, 4], 'payload sparito: il piano la contiene ancora (i metadati dicono stored)');
  var err = 'nessuno';
  p.photos[0].load(function (e) { err = e; });
  eq(err, 'payload assente', 'payload sparito: load() → "payload assente"');
  check(logsSince(n0).indexOf('payload locale corrotto (payload assente)') >= 0, 'payload sparito: log del _dropCorrupt');
  eq(pstored(a, 1, 1), undefined, 'payload sparito: metadati del formato 1 rimossi');
  eq(pstored(a, 1, 2), true, 'payload sparito: l\'ALTRO formato resta (stored true)');
  eq(pid(a, 1), 0x55, 'payload sparito: la foto resta (ha ancora il formato 2)');
  var p2 = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p2), [4], 'payload sparito: il piano successivo NON la ripropone');
  eq(new Album(st, log).data.photos[1].fmts[1], undefined, 'payload sparito: la rimozione è su disco');
  /* unico formato: sparisce la foto e l'ordine si ripulisce */
  st.removeItem(PKEY(4, 1));
  var p3 = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p3), [4], 'unico formato: nel piano');
  p3.photos[0].load(function (e) { err = e; });
  eq(err, 'payload assente', 'unico formato: load() → errore');
  eq(a.data.photos[4], null, 'unico formato: la foto sparisce');
  eq(a.data.order.indexOf(4), -1, 'unico formato: via anche dall\'ordine');
  eqJson(planSlots(a.plan(hello({ settingsCrc: a.settingsCrc() }))), [], 'unico formato: piano vuoto');
})();

/* 11.4 — migrazione degli album scritti prima di S7 (senza il campo): una sonda per formato, UNA
 * volta sola, poi il JSON viene riscritto (`v` resta 1). */
(function () {
  var photos = [], k, s0, a, st;
  for (k = 0; k < 12; k++) { photos.push(null); }
  photos[0] = rec(0x11, C6, C1);                   /* due formati, payload presenti */
  photos[3] = rec(0x22, C6);                       /* payload mai scritto (o perso) */
  s0 = storedAlbum({ photos: photos, order: [0, 3] });
  st = s0.st;
  st.setItem(PKEY(0, 1), R6); st.setItem(PKEY(0, 2), R1);
  check(st.mem[Album.KEY].indexOf('stored') < 0, 'migrazione: il JSON di partenza non ha il campo stored');
  st.resetReads();
  var w0 = st.writesOf(Album.KEY), n0 = LOGS.length;
  a = s0.load();
  eq(pstored(a, 0, 1), true, 'migrazione: payload presente → stored true (fmt 1)');
  eq(pstored(a, 0, 2), true, 'migrazione: payload presente → stored true (fmt 2)');
  eq(pstored(a, 3, 1), false, 'migrazione: payload assente → stored false');
  eq(st.payloadReads(), 3, 'migrazione: esattamente una sonda per formato (3 letture)');
  eq(st.readsOf(PKEY(0, 1)), 1, 'migrazione: una sola lettura di p0.1');
  eq(st.writesOf(Album.KEY) - w0, 1, 'migrazione: il JSON viene riscritto una volta');
  check(logsSince(n0).indexOf('migrazione: campo stored sondato per 3 formati') >= 0, 'migrazione: log');
  check(st.mem[Album.KEY].indexOf('"stored":true') >= 0 && st.mem[Album.KEY].indexOf('"stored":false') >= 0,
        'migrazione: il JSON riscritto porta il campo');
  eq(JSON.parse(st.mem[Album.KEY]).v, 1, 'migrazione: v resta 1');
  /* seconda lettura: nessuna sonda, nessuna riscrittura */
  st.resetReads();
  var w1 = st.writesOf(Album.KEY), a2 = s0.load();
  eq(st.payloadReads(), 0, 'migrazione: al secondo caricamento nessuna sonda');
  eq(st.writesOf(Album.KEY) - w1, 0, 'migrazione: al secondo caricamento nessuna riscrittura');
  eq(pstored(a2, 0, 1), true, 'migrazione: stored riletto dal JSON');
  eq(pstored(a2, 3, 1), false, 'migrazione: stored false riletto dal JSON');
  /* e il piano si comporta come deve: la foto senza payload viene saltata, l'altra no */
  st.resetReads();
  var n1 = LOGS.length, p = a2.plan(hello({ settingsCrc: a2.settingsCrc() }));
  eqJson(planSlots(p), [0], 'migrazione: il piano manda solo la foto con il payload');
  check(logsSince(n1).indexOf('nessun loader') >= 0, 'migrazione: log "nessun loader" per la foto senza payload');
  eq(st.payloadReads(), 0, 'migrazione: il piano non legge i payload');
  /* stored non booleano nel JSON = campo assente (da sondare) */
  photos[0] = { id: 0x11, fmts: { 1: { len: LEN6, crc: C6, stored: 'sì' } } };
  photos[3] = null;
  var s1 = storedAlbum({ photos: photos, order: [0] });
  s1.st.setItem(PKEY(0, 1), R6);
  eq(s1.load().data.photos[0].fmts[1].stored, true, 'migrazione: stored non booleano → risondato');
  var s2 = storedAlbum({ photos: photos, order: [0] });
  eq(s2.load().data.photos[0].fmts[1].stored, false, 'migrazione: stored non booleano senza payload → false');
  /* migrazione con storage che lancia in lettura: nessuna eccezione e — revisione S7 — il campo
   * resta NON DECISO (null). Prima ci finiva `false` per sempre: la foto non sarebbe mai più stata
   * pianificata. Il resto del caso sta in 11.7. */
  (function () {
    var s3 = storedAlbum({ photos: photos, order: [0] });
    throwOnPayloads(s3.st, true);
    eq(s3.load().data.photos[0].fmts[1].stored, null, 'migrazione: getItem che lancia → stored non deciso (null)');
  })();
})();

/* 11.5 — loader dev: il payload scaricato viene registrato (`stored` true) e salvato; un payload
 * corrotto rimette `stored` a false senza buttare i metadati (la foto si può riscaricare). */
(function () {
  var f = freshAlbum(), a = f.a, st = f.st;
  a.applyPayload({ v: 1, photos: [{ slot: 6, photo_id: 0x99, fmt: 1, len: LEN6, crc: C6, url: '/photo/6.raw6' }] }, { allowUrl: true });
  eq(pstored(a, 6, 1), false, 'dev: voce solo metadati, stored false');
  a.setLoader(function (slot, fmt, cb) { cb(null, R6); });
  var p = a.plan(hello({ settingsCrc: a.settingsCrc() })), got = null;
  eqJson(planSlots(p), [6], 'dev: con il loader la foto è nel piano');
  p.photos[0].load(function (e, b) { got = e ? ('ERR ' + e) : b.length; });
  eq(got, LEN6, 'dev: load() consegna i byte scaricati');
  eq(pstored(a, 6, 1), true, 'dev: dopo il download stored diventa true');
  eq(new Album(st, log).data.photos[6].fmts[1].stored, true, 'dev: stored true anche su disco (JSON salvato)');
  /* senza loader (telefono) la foto ora è pianificabile da sola */
  var a2 = new Album(st, log);
  st.resetReads();
  eqJson(planSlots(a2.plan(hello({ settingsCrc: a2.settingsCrc() }))), [6], 'dev→telefono: pianificata senza loader');
  eq(st.payloadReads(), 0, 'dev→telefono: sempre senza letture dei payload');
  /* payload locale corrotto CON loader: metadati conservati, stored false */
  st.mem[PKEY(6, 1)] = corruptB64(R6);
  a.data.photos[6].fmts[1].stored = true;
  var p2 = a.plan(hello({ settingsCrc: a.settingsCrc() })), err = 'nessuno';
  a.setLoader(function (slot, fmt, cb) { cb('rete'); });
  p2.photos[0].load(function (e) { err = e; });
  check(typeof err === 'string' && err.indexOf('corrotto') >= 0, 'dev: payload corrotto → errore (' + err + ')');
  eq(pid(a, 6), 0x99, 'dev: con il loader i metadati restano');
  eq(pstored(a, 6, 1), false, 'dev: payload corrotto → stored torna false (invariante stored ⇒ payload su disco)');
  eq(new Album(st, log).data.photos[6].fmts[1].stored, false, 'dev: stored false salvato su disco');
})();

/* 11.6 — REGRESSIONE (revisione S7): due voci per lo STESSO slot (una per formato) di una foto
 * NUOVA + JSON che non si scrive. I byte da rimettere nel rollback vanno decisi sui metadati con
 * cui lo slot è ENTRATO nella chiamata: alla seconda voce `d.photos[slot]` è già il record nuovo
 * (fmts vuoto per l'altro formato) mentre sul disco c'è ancora il payload della foto VECCHIA (la
 * rimozione è solo PENDENTE, si esegue dopo _save()). Decidendolo su quel record `prev` veniva null
 * e il rollback RIMUOVEVA il payload della vecchia: metadati riletti con `stored` true e nessun
 * byte = foto zombie (pianificata a ogni HELLO, buttata da load()). */
(function () {
  var st = memStorage(), a = new Album(st, log), n0, before, keysBefore, r, p, n1;
  a.applyPayload({ v: 1, photos: [entry(3, 0x1111, 1), entry(3, 0x1111, 2)] }, {});
  eq(st.mem[PKEY(3, 1)] === R6 && st.mem[PKEY(3, 2)] === R1, true, 'zombie: A di partenza con due payload');
  before = JSON.stringify(a.state().photos);
  keysBefore = st.keys().join(',');
  st.failPattern = ALBUM_RE;                 /* il JSON non si scrive: SOLO da questa applyPayload in poi */
  n0 = LOGS.length;
  r = a.applyPayload({ v: 1, photos: [entryB(3, 0x2222, 1), entryB(3, 0x2222, 2)] }, {});
  eq(r.ok, false, 'zombie: ok false');
  eq(r.changed, false, 'zombie: changed false');
  eqJson(r.added, [], 'zombie: added vuoto');
  eqJson(r.errors, [ROLLED_BACK], 'zombie: il solo errore è l\'annullamento');
  check(logsSince(n0).indexOf('[album] album non salvato: 2 payload annullati') >= 0, 'zombie: log "2 payload annullati"');
  eq(st.mem[PKEY(3, 1)], R6, 'zombie: p3.1 riportato ai byte di A');
  eq(st.mem[PKEY(3, 2)], R1, 'zombie: p3.2 riportato ai byte di A (NON rimosso)');
  eq(st.keys().join(','), keysBefore, 'zombie: chiavi dello storage invariate');
  eq(pid(a, 3), 0x1111, 'zombie: RAM = A');
  eq(JSON.stringify(a.state().photos), before, 'zombie: RAM = disco (A con due formati)');
  eq(pstored(a, 3, 1), true, 'zombie: stored true sul fmt 1');
  eq(pstored(a, 3, 2), true, 'zombie: stored true sul fmt 2');
  eq(JSON.stringify(new Album(st, log).state().photos), before, 'zombie: riavvio identico alla RAM');
  /* metadati riletti coerenti coi byte: entrambi i formati si consegnano senza _dropCorrupt */
  st.failPattern = null;
  n1 = LOGS.length;
  p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p), [3], 'zombie: il piano manda A (fmt 1)');
  eq(loadCrc(p), C6, 'zombie: load() consegna i byte di A');
  var p2 = a.plan(hello({ format: 2, settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p2), [3], 'zombie: il piano manda A anche in raw1');
  eq(loadCrc(p2), C1, 'zombie: load() consegna i byte raw1 di A (il payload c\'è ancora)');
  check(logsSince(n1).indexOf('corrotto') < 0 && logsSince(n1).indexOf('assente') < 0, 'zombie: nessun _dropCorrupt, nessun "payload assente"');
  eq(pstored(a, 3, 2), true, 'zombie: il fmt 2 è ancora inviabile (nessuno zombie)');
})();

(function () {
  /* stesso caso con le voci in ordine inverso (fmt 2 prima) e con la vecchia che aveva un solo
   * formato: il payload dell'altro formato non esiste, `prev` deve restare null senza letture */
  var st = memStorage(), a = new Album(st, log), r;
  a.applyPayload({ v: 1, photos: [entry(5, 0x1111, 1), entry(5, 0x1111, 2)] }, {});
  st.failPattern = ALBUM_RE;
  r = a.applyPayload({ v: 1, photos: [entryB(5, 0x2222, 2), entryB(5, 0x2222, 1)] }, {});
  eq(r.ok, false, 'zombie (ordine inverso): ok false');
  eq(st.mem[PKEY(5, 1)] === R6 && st.mem[PKEY(5, 2)] === R1, true, 'zombie (ordine inverso): entrambi i payload di A ripristinati');
  eq(JSON.stringify(new Album(st, log).state().photos), JSON.stringify(a.state().photos), 'zombie (ordine inverso): riavvio identico');
  /* vecchia con il solo fmt 1: la chiave p6.2 non è mai esistita, il rollback la rimuove */
  var st2 = memStorage(), a2 = new Album(st2, log);
  a2.applyPayload({ v: 1, photos: [entry(6, 0x1111, 1)] }, {});
  st2.failPattern = ALBUM_RE;
  st2.resetReads();
  var r2 = a2.applyPayload({ v: 1, photos: [entryB(6, 0x2222, 1), entryB(6, 0x2222, 2)] }, {});
  eq(r2.ok, false, 'zombie (un solo formato prima): ok false');
  eq(st2.mem[PKEY(6, 1)], R6, 'zombie (un solo formato prima): p6.1 = byte di A');
  eq(st2.has(PKEY(6, 2)), false, 'zombie (un solo formato prima): p6.2 rimosso (non esisteva)');
  eq(st2.readsOf(PKEY(6, 2)), 0, 'zombie (un solo formato prima): nessuna lettura di una chiave che i metadati dicono assente');
  eq(st2.readsOf(PKEY(6, 1)), 1, 'zombie (un solo formato prima): una sola lettura del payload sovrascritto');
  eq(JSON.stringify(new Album(st2, log).state().photos), JSON.stringify(a2.state().photos), 'zombie (un solo formato prima): riavvio identico');
})();

(function () {
  /* variante dev della stessa trappola: prima voce "solo metadati" (url) della foto NUOVA, seconda
   * voce con i dati per l'ALTRO formato. La prima voce sostituisce il record senza scrivere niente
   * (nessuna prevOf): se i metadati originali non sono già stati fotografati, la seconda voce li
   * legge dal record nuovo e il rollback butta il payload della vecchia. */
  var st = memStorage(), a = new Album(st, log), r;
  a.applyPayload({ v: 1, photos: [entry(7, 0x1111, 1), entry(7, 0x1111, 2)] }, {});
  st.failPattern = ALBUM_RE;
  r = a.applyPayload({ v: 1, photos: [{ slot: 7, photo_id: 0x2222, fmt: 1, len: LEN6, crc: C6b, url: '/photo/7.raw6' },
                                      entryB(7, 0x2222, 2)] }, { allowUrl: true });
  eq(r.ok, false, 'zombie (url + data): ok false');
  eq(st.mem[PKEY(7, 1)], R6, 'zombie (url + data): p7.1 di A intatto (rimozione pendente non eseguita)');
  eq(st.mem[PKEY(7, 2)], R1, 'zombie (url + data): p7.2 riportato ai byte di A');
  eq(pid(a, 7), 0x1111, 'zombie (url + data): RAM = A');
  eq(pstored(a, 7, 2), true, 'zombie (url + data): stored true e payload sul disco');
  eq(JSON.stringify(new Album(st, log).state().photos), JSON.stringify(a.state().photos), 'zombie (url + data): riavvio identico');
})();

(function () {
  /* due scritture sulla STESSA chiave in una chiamata: i byte originali si leggono UNA volta sola
   * (45,6 KB l'una; il rollback in ordine inverso finisce comunque sull'originale) */
  var st = memStorage(), a = new Album(st, log), r;
  a.applyPayload({ v: 1, photos: [entry(9, 0x1111, 1)] }, {});
  st.failPattern = ALBUM_RE;
  st.resetReads();
  r = a.applyPayload({ v: 1, photos: [entryB(9, 0x2222, 1), entry(9, 0x3333, 1)] }, {});
  eq(r.ok, false, 'doppia scrittura: ok false');
  eq(st.readsOf(PKEY(9, 1)), 1, 'doppia scrittura: una sola lettura dei byte originali');
  eq(st.mem[PKEY(9, 1)], R6, 'doppia scrittura: la chiave torna ai byte originali');
})();

/* 11.7 — sonda `stored` a TRE esiti (revisione S7): true / false / null quando getItem lancia. Un
 * errore di lettura transitorio non deve diventare un `false` permanente (foto mai più inviata):
 * il campo resta da sondare, la migrazione non è fatta e plan() ci riprova una volta sola. */
(function () {
  var photos = [], k, s0, st, a, w0, n0, p;
  for (k = 0; k < 12; k++) { photos.push(null); }
  photos[0] = rec(0x11, C6);                        /* album pre-S7: nessun campo stored */
  s0 = storedAlbum({ photos: photos, order: [0] });
  st = s0.st;
  st.setItem(PKEY(0, 1), R6);                       /* il payload C'È: un `false` sarebbe una bugia */
  throwOnPayloads(st, true);
  st.resetReads();
  w0 = st.writesOf(Album.KEY); n0 = LOGS.length;
  a = s0.load();
  eq(pstored(a, 0, 1), null, 'sonda che lancia: stored non deciso');
  eq(st.readsOf(PKEY(0, 1)), 1, 'sonda che lancia: una sola sonda al caricamento');
  eq(st.writesOf(Album.KEY) - w0, 0, 'sonda che lancia: il JSON non viene riscritto (migrazione non fatta)');
  check(logsSince(n0).indexOf('sonda del payload slot 0 fmt 1 fallita') >= 0, 'sonda che lancia: log della sonda fallita');
  check(logsSince(n0).indexOf('1 formati non sondabili') >= 0, 'sonda che lancia: log della migrazione rimandata');
  check(st.mem[Album.KEY].indexOf('stored') < 0, 'sonda che lancia: il JSON su disco resta senza il campo');
  /* plan(): riprova la sonda; se lancia ancora la foto salta SOLO per questo piano */
  st.resetReads(); n0 = LOGS.length;
  p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p), [], 'sonda che lancia: piano senza la foto');
  eq(st.readsOf(PKEY(0, 1)), 1, 'sonda che lancia: una sola sonda anche nel piano');
  check(logsSince(n0).indexOf('stato del payload fmt 1 illeggibile') >= 0, 'sonda che lancia: log "illeggibile"');
  eq(pstored(a, 0, 1), null, 'sonda che lancia: il campo resta da sondare (nessun false permanente)');
  /* lettura tornata a posto: il piano risonda, decide true e salva */
  throwOnPayloads(st, false);
  st.resetReads(); w0 = st.writesOf(Album.KEY);
  p = a.plan(hello({ settingsCrc: a.settingsCrc() }));
  eqJson(planSlots(p), [0], 'sonda ok nel piano: la foto torna pianificata');
  eq(pstored(a, 0, 1), true, 'sonda ok nel piano: stored true');
  eq(st.readsOf(PKEY(0, 1)), 1, 'sonda ok nel piano: una sola lettura');
  eq(st.writesOf(Album.KEY) - w0, 1, 'sonda ok nel piano: l\'esito viene salvato');
  eq(loadCrc(p), C6, 'sonda ok nel piano: load() consegna i byte');
  /* e da lì in poi nessuna lettura: i metadati bastano */
  st.resetReads();
  eqJson(planSlots(a.plan(hello({ settingsCrc: a.settingsCrc() }))), [0], 'sonda decisa: ancora pianificata');
  eq(st.payloadReads(), 0, 'sonda decisa: piano senza letture dei payload');
  eq(new Album(st, log).data.photos[0].fmts[1].stored, true, 'sonda decisa: stored true anche su disco');
})();

(function () {
  /* sonda che lancia al primo caricamento e funziona al secondo: stored true (payload presente) e
   * false (payload assente), JSON riscritto una volta sola */
  var photos = [], k, s0, st, a2;
  for (k = 0; k < 12; k++) { photos.push(null); }
  photos[0] = rec(0x11, C6);
  photos[3] = rec(0x22, C6);
  s0 = storedAlbum({ photos: photos, order: [0, 3] });
  st = s0.st;
  st.setItem(PKEY(0, 1), R6);                       /* lo slot 3 non ha payload */
  throwOnPayloads(st, true);
  eq(s0.load().data.photos[0].fmts[1].stored, null, 'sonda 2 tentativi: primo caricamento non deciso (slot 0)');
  eq(s0.load().data.photos[3].fmts[1].stored, null, 'sonda 2 tentativi: primo caricamento non deciso (slot 3)');
  throwOnPayloads(st, false);
  st.resetReads();
  var w0 = st.writesOf(Album.KEY);
  a2 = s0.load();
  eq(pstored(a2, 0, 1), true, 'sonda 2 tentativi: al secondo caricamento stored true');
  eq(pstored(a2, 3, 1), false, 'sonda 2 tentativi: payload davvero assente → false');
  eq(st.payloadReads(), 2, 'sonda 2 tentativi: due sonde (una per formato)');
  eq(st.writesOf(Album.KEY) - w0, 1, 'sonda 2 tentativi: JSON riscritto una volta');
  st.resetReads();
  var a3 = s0.load();
  eq(st.payloadReads(), 0, 'sonda 2 tentativi: al terzo caricamento nessuna sonda');
  eq(pstored(a3, 0, 1), true, 'sonda 2 tentativi: stored riletto dal JSON');
})();

(function () {
  /* `stored` non deciso (sonda fallita) + rollback: i byte sul disco ci sono davvero, quindi vanno
   * RIMESSI. Trattare "non deciso" come "assente" farebbe perdere il payload a ogni Save che non
   * riesce a scrivere il JSON. */
  var photos = [], k, s0, st, a, r;
  for (k = 0; k < 12; k++) { photos.push(null); }
  photos[2] = rec(0x33, C6);                        /* album pre-S7, payload presente */
  s0 = storedAlbum({ photos: photos, order: [2] });
  st = s0.st;
  st.setItem(PKEY(2, 1), R6);
  throwOnPayloads(st, true);
  a = s0.load();
  eq(pstored(a, 2, 1), null, 'stored non deciso + rollback: campo non deciso di partenza');
  throwOnPayloads(st, false);
  st.failPattern = ALBUM_RE;
  r = a.applyPayload({ v: 1, photos: [entry(2, 0x33, 1)] }, {});   /* stessi metadati: ramo "payload mancante" */
  eq(r.ok, false, 'stored non deciso + rollback: ok false');
  eq(st.mem[PKEY(2, 1)], R6, 'stored non deciso + rollback: il payload sul disco resta (byte originali rimessi)');
  eq(pstored(a, 2, 1), true, 'stored non deciso + rollback: la rilettura risonda e trova il payload');
  st.failPattern = null;
  eq(new Album(st, log).data.photos[2].fmts[1].stored, true, 'stored non deciso + rollback: riavvio con stored true');
})();

/* ============================================================ esito */

var bugIds = Object.keys(g_bugs).sort();
console.log('album: ' + g_ok + ' ok, ' + g_fail + ' falliti' +
            (bugIds.length ? ' (di cui ' + bugIds.reduce(function (n, k) { return n + g_bugs[k]; }, 0) +
             ' asserzioni sui BUG NOTI del sorgente: ' + bugIds.join(', ') + ')' : ''));
if (bugIds.length) {
  console.log('  BUG A — album.js:319-331 applyPayload: le eliminazioni sono applicate DOPO le foto, quindi');
  console.log('          un payload che elimina e riempie lo stesso slot perde la foto nuova e lascia lo');
  console.log('          slot fra le eliminazioni pendenti (design §5.1: "uno slot riempito da questo');
  console.log('          payload non può restare fra le eliminazioni pendenti").');
  console.log('  BUG B — album.js:171-178 _load: l\'ordine viene già ripulito prima di _fixOrder, che quindi');
  console.log('          non si accorge della correzione e non marca orderDirty: l\'ordine corretto non');
  console.log('          viene mai inviato all\'orologio.');
  console.log('  BUG C — album.js:175 _load: `deleted` non viene filtrato contro le foto presenti, così un');
  console.log('          JSON incoerente fa mandare ALBUM_ORDER e ALBUM_DELETE per lo stesso slot.');
}
process.exit(g_fail ? 1 : 0);

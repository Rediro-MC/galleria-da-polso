#!/usr/bin/env node
/* test_b64.js — test host di src/pkjs/b64.js (node, nessuna dipendenza).
 *
 * Copre: vettori RFC 4648 §10, round trip di tutti i 256 byte, buffer casuali (LCG con seme
 * fisso) di ogni lunghezza 0..70, un buffer da 34.200 B (una foto raw6), confronto con
 * Buffer.from(...).toString('base64url') di node, decodifica dell'alfabeto standard, del
 * padding e degli spazi, errori sugli input non validi, e infine la fixture di
 * test/fixture_photo.js (i byte decodificati devono avere il CRC32 dichiarato).
 *
 * Si esegue da solo (`node test/test_b64.js`) o con `make -C test jstest`.
 */

var b64 = require('../src/pkjs/b64');
var fixture = require('./fixture_photo');
var zlib = require('zlib');

var g_pass = 0, g_fail = 0;

function check(cond, what) {
  if (cond) { g_pass++; } else { g_fail++; console.log('FAIL ' + what); }
}

function eq(got, exp, what) {
  if (got === exp) { g_pass++; } else { g_fail++; console.log('FAIL ' + what + ': "' + got + '" invece di "' + exp + '"'); }
}

function eqBytes(got, exp, what) {
  var i;
  if (got.length !== exp.length) {
    g_fail++; console.log('FAIL ' + what + ': ' + got.length + ' byte invece di ' + exp.length);
    return;
  }
  for (i = 0; i < exp.length; i++) {
    if (got[i] !== exp[i]) {
      g_fail++; console.log('FAIL ' + what + ': byte ' + i + ' = ' + got[i] + ' invece di ' + exp[i]);
      return;
    }
  }
  g_pass++;
}

function expectError(fn, what) {
  try { fn(); } catch (e) { g_pass++; return; }
  g_fail++; console.log('FAIL ' + what + ': nessun errore');
}

function bytesOf(str) {                       /* stringa ASCII -> Array di byte */
  var a = [], i;
  for (i = 0; i < str.length; i++) { a.push(str.charCodeAt(i)); }
  return a;
}

/* LCG a 32 bit (Math.imul: niente perdita di precisione come con la moltiplicazione a
 * virgola mobile), stesso schema delle fixture di photo_prep.py. Seme fisso = test ripetibile. */
function Lcg(seed) { this.x = seed | 0; }
Lcg.prototype.byte = function () {
  this.x = (Math.imul(this.x, 1103515245) + 12345) | 0;
  return (this.x >>> 16) & 255;
};

function crc32(buf) {
  return zlib.crc32 ? zlib.crc32(buf) >>> 0 : legacyCrc32(buf);
}

function legacyCrc32(buf) {                   /* node < 20.15: zlib.crc32 non c'è */
  var table = [], c, n, k, crc = 0xFFFFFFFF;
  for (n = 0; n < 256; n++) {
    c = n;
    for (k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    table[n] = c >>> 0;
  }
  for (n = 0; n < buf.length; n++) { crc = table[(crc ^ buf[n]) & 255] ^ (crc >>> 8); }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/* ------------------------------------------------ 1. vettori RFC 4648 §10 --- */
/* base64url senza padding: gli stessi vettori del §10 con '=' tolti. */
var RFC = [
  ['', ''],
  ['f', 'Zg'],
  ['fo', 'Zm8'],
  ['foo', 'Zm9v'],
  ['foob', 'Zm9vYg'],
  ['fooba', 'Zm9vYmE'],
  ['foobar', 'Zm9vYmFy']
];
var RFC_PAD = ['', 'Zg==', 'Zm8=', 'Zm9v', 'Zm9vYg==', 'Zm9vYmE=', 'Zm9vYmFy'];

(function () {
  var i;
  for (i = 0; i < RFC.length; i++) {
    eq(b64.encode(bytesOf(RFC[i][0])), RFC[i][1], 'encode("' + RFC[i][0] + '")');
    eqBytes(b64.decode(RFC[i][1]), bytesOf(RFC[i][0]), 'decode("' + RFC[i][1] + '")');
    eqBytes(b64.decode(RFC_PAD[i]), bytesOf(RFC[i][0]), 'decode con padding "' + RFC_PAD[i] + '"');
  }
})();

/* ------------------------------------- 2. round trip di tutti i 256 byte --- */
(function () {
  var all = [], i;
  for (i = 0; i < 256; i++) { all.push(i); }
  var enc = b64.encode(all);
  eq(enc, Buffer.from(all).toString('base64url'), 'encode dei 256 byte = base64url di node');
  eqBytes(b64.decode(enc), all, 'round trip dei 256 byte');
  check(/^[A-Za-z0-9_-]*$/.test(enc), 'alfabeto base64url (niente + / =)');
  /* ogni singolo byte da solo */
  for (i = 0; i < 256; i++) {
    eqBytes(b64.decode(b64.encode([i])), [i], 'round trip del byte ' + i);
  }
})();

/* ------------- 3. buffer casuali: 10 per ogni lunghezza da 0 a 70 (LCG) --- */
(function () {
  var rnd = new Lcg(1), len, k, j, buf, enc;
  for (len = 0; len <= 70; len++) {
    for (k = 0; k < 10; k++) {
      buf = [];
      for (j = 0; j < len; j++) { buf.push(rnd.byte()); }
      enc = b64.encode(buf);
      eq(enc, Buffer.from(buf).toString('base64url'), 'encode casuale len ' + len + ' #' + k);
      eqBytes(b64.decode(enc), buf, 'round trip casuale len ' + len + ' #' + k);
      /* la stessa stringa con l'alfabeto standard e il padding deve dare gli stessi byte */
      eqBytes(b64.decode(Buffer.from(buf).toString('base64')), buf,
              'decode standard+padding len ' + len + ' #' + k);
    }
  }
})();

/* ------------------------------------ 4. buffer da 34.200 B (foto raw6) --- */
(function () {
  var rnd = new Lcg(20260829), buf = [], i, t0, enc, dec;
  for (i = 0; i < 34200; i++) { buf.push(rnd.byte()); }
  t0 = Date.now();
  enc = b64.encode(buf);
  var tEnc = Date.now() - t0;
  eq(enc.length, 45600, 'lunghezza base64url di 34.200 B');
  eq(enc, Buffer.from(buf).toString('base64url'), 'encode 34.200 B = base64url di node');
  t0 = Date.now();
  dec = b64.decode(enc);
  var tDec = Date.now() - t0;
  eqBytes(dec, buf, 'round trip 34.200 B');
  console.log('  34.200 B: encode ' + tEnc + ' ms, decode ' + tDec + ' ms');
})();

/* ---------------------- 5. spazi, a capo, padding, alfabeto standard misti --- */
(function () {
  var atteso = bytesOf('foobar');
  eqBytes(b64.decode('Zm9v\nYmFy'), atteso, 'decode con a capo');
  eqBytes(b64.decode('  Zm9v YmFy  '), atteso, 'decode con spazi');
  eqBytes(b64.decode('Zm9v\r\nYmFy\n'), atteso, 'decode con CRLF');
  eqBytes(b64.decode('Zm9vYmE=\n'), bytesOf('fooba'), 'decode con padding e a capo');
  /* '+' e '/' (standard) vs '-' e '_' (url): stessi byte */
  eqBytes(b64.decode('+/A='), b64.decode('-_A'), "'+/' e '-_' danno gli stessi byte");
  eqBytes(b64.decode('/w=='), [255], "decode('/w==') = [255]");
  eqBytes(b64.decode('_w'), [255], "decode('_w') = [255]");
})();

/* ------------------------------------------------ 6. input non validi --- */
(function () {
  eqBytes(b64.decode('Zg==='), [102], "padding in eccesso ('Zg===') tollerato");
  expectError(function () { b64.decode('Z'); }, 'lunghezza con resto 1');
  expectError(function () { b64.decode('Zm9vYmFyZ'); }, 'lunghezza 9 (resto 1)');
  expectError(function () { b64.decode('Zm9v*mFy'); }, "carattere '*' non valido");
  expectError(function () { b64.decode('Zm9vYmF!'); }, "carattere '!' non valido");
  expectError(function () { b64.decode('Zm9vYmà'); }, 'carattere non ASCII');
  expectError(function () { b64.decode('Zg==Zg'); }, 'simbolo dopo il padding');
  expectError(function () { b64.decode(null); }, 'decode(null)');
  expectError(function () { b64.decode(42); }, 'decode(numero)');
  expectError(function () { b64.encode(null); }, 'encode(null)');
  expectError(function () { b64.encode('foo'); }, 'encode(stringa)');
})();

/* ------------------------------- 7. la fixture di test/gen_sync_fixture.py --- */
(function () {
  var casi = [['raw6', fixture.raw6], ['raw1', fixture.raw1]], i, nome, f, t0, bytes, ms;
  eq(fixture.name, 'sync_fixture', 'nome della fixture');
  for (i = 0; i < casi.length; i++) {
    nome = casi[i][0]; f = casi[i][1];
    check(/^[A-Za-z0-9_-]+$/.test(f.b64), nome + ': base64url puro (niente + / =)');
    t0 = Date.now();
    bytes = b64.decode(f.b64);
    ms = Date.now() - t0;
    eq(bytes.length, f.len, nome + ': byte decodificati');
    eq(crc32(Buffer.from(bytes)), f.crc >>> 0, nome + ': CRC32 dei byte decodificati');
    eq(b64.encode(bytes), f.b64, nome + ': ri-codifica identica alla stringa del modulo');
    eqBytes(bytes, Array.prototype.slice.call(Buffer.from(f.b64, 'base64url')),
            nome + ': stessi byte di Buffer.from(..., base64url)');
    console.log('  fixture ' + nome + ': ' + bytes.length + ' B, CRC32 0x' +
                (f.crc >>> 0).toString(16).toUpperCase() + ', decodifica ' + ms + ' ms');
  }
  eq(fixture.raw6.len, 34200, 'raw6.len = 34.200 (photo_codec.h)');
  eq(fixture.raw1.len, 3024, 'raw1.len = 3.024 (photo_codec.h)');
})();

console.log('b64: ' + g_pass + ' ok, ' + g_fail + ' falliti');
process.exit(g_fail ? 1 : 0);

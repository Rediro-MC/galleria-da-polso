#!/usr/bin/env node
/* test_pipeline.js — test host di src/pkjs/config/pipeline.js (S6, node, nessuna dipendenza).
 *
 * Verifica che il porting JS della pipeline immagine sia BYTE-ESATTO con tools/photo_prep.py:
 * la fixture test/fixture_page.js (generata da test/gen_page_fixture.py, che importa il tool)
 * porta l'immagine di prova e i CRC32 attesi di ogni combinazione; qui si rifà il percorso in
 * JS e si confrontano CRC32, photo_id e — per un caso emery e uno flint — il raw INTERO in
 * base64url. Coperti anche: le fixture del test C (fixtures/rt.*, dimensioni da rt_meta.h),
 * quantRaw ai bordi, la LUT sunlight (CRC + riderivazione completa cella per cella), crc32
 * contro src/pkjs/crc.js, b64url contro src/pkjs/b64.js (lunghezze 0, 1, 2 mod 3), photoId,
 * toGray16, i rettangoli, le anteprime RGBA e gli errori (lunghezza, dithering sconosciuto).
 *
 * Si esegue da solo (`node test/test_pipeline.js`, da qualunque cwd) o con `make -C test jstest`.
 * GAL_PIPELINE=/percorso/pipeline.js sostituisce il modulo sotto test: serve SOLO al mutation
 * testing (si applica un mutante a una copia e si controlla che il test diventi rosso).
 */

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var PIPE = process.env.GAL_PIPELINE
  ? path.resolve(process.env.GAL_PIPELINE)
  : path.join(__dirname, '..', 'src', 'pkjs', 'config', 'pipeline.js');
var P = require(PIPE);
var fx = require('./fixture_page');
var crcjs = require('../src/pkjs/crc');
var b64js = require('../src/pkjs/b64');

var g_pass = 0, g_fail = 0;

function check(cond, what) {
  if (cond) { g_pass++; } else { g_fail++; console.log('FAIL ' + what); }
}

function eq(got, exp, what) {
  if (got === exp) { g_pass++; } else { g_fail++; console.log('FAIL ' + what + ': ' + got + ' invece di ' + exp); }
}

function eqHex(got, exp, what) {
  if (got === exp) { g_pass++; return; }
  g_fail++;
  console.log('FAIL ' + what + ': 0x' + (got >>> 0).toString(16).toUpperCase() +
              ' invece di 0x' + (exp >>> 0).toString(16).toUpperCase());
}

/* Confronto byte a byte con diagnostica sul primo byte diverso (accetta Uint8Array/Array/Buffer). */
function eqBytes(got, exp, what) {
  var i;
  if (got.length !== exp.length) {
    g_fail++; console.log('FAIL ' + what + ': ' + got.length + ' byte invece di ' + exp.length);
    return;
  }
  for (i = 0; i < exp.length; i++) {
    if ((got[i] & 255) !== (exp[i] & 255)) {
      g_fail++; console.log('FAIL ' + what + ': byte ' + i + ' = ' + got[i] + ' invece di ' + exp[i]);
      return;
    }
  }
  g_pass++;
}

function eqNums(got, exp, what) {
  var i;
  if (got.length !== exp.length) {
    g_fail++; console.log('FAIL ' + what + ': lunghezza ' + got.length + ' invece di ' + exp.length);
    return;
  }
  for (i = 0; i < exp.length; i++) {
    if (got[i] !== exp[i]) {
      g_fail++; console.log('FAIL ' + what + ': elemento ' + i + ' = ' + got[i] + ' invece di ' + exp[i]);
      return;
    }
  }
  g_pass++;
}

function expectError(fn, what) {
  try { fn(); } catch (e) { g_pass++; return; }
  g_fail++; console.log('FAIL ' + what + ': nessun errore');
}

function label(c) {                      /* etichetta leggibile di un caso della fixture */
  return c.dither + (c.sunlight === undefined ? '' : (c.sunlight ? '+sun' : '')) +
         ' g' + c.gamma + '/l' + c.lift;
}

function bytesOf(str) {
  var a = [], i;
  for (i = 0; i < str.length; i++) { a.push(str.charCodeAt(i) & 255); }
  return a;
}

/* LCG a 32 bit come nelle fixture di photo_prep.py (Math.imul: nessuna perdita di precisione). */
function Lcg(seed) { this.x = seed | 0; }
Lcg.prototype.byte = function () {
  this.x = (Math.imul(this.x, 1103515245) + 12345) | 0;
  return (this.x >>> 16) & 255;
};

function lcgBytes(n, seed) {
  var g = new Lcg(seed), a = new Uint8Array(n), i;
  for (i = 0; i < n; i++) { a[i] = g.byte(); }
  return a;
}

function fromB64(str) {                  /* base64 standard -> Uint8Array (immagini di prova) */
  var b = Buffer.from(str, 'base64');
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}

/* ------------------------------------------------------------ 1. costanti --- */

eq(P.EMERY_W, 200, 'EMERY_W');
eq(P.EMERY_H, 228, 'EMERY_H');
eq(P.FLINT_W, 144, 'FLINT_W');
eq(P.FLINT_H, 168, 'FLINT_H');
eq(P.RAW6_BYTES, 34200, 'RAW6_BYTES = 150 * 228');
eq(P.RAW1_BYTES, 3024, 'RAW1_BYTES = 18 * 168');
eq(P.RAW6_BYTES, P.EMERY_W * P.EMERY_H * 3 / 4, 'RAW6_BYTES coerente con 200x228');
eq(P.RAW1_BYTES, ((P.FLINT_W + 7) >> 3) * P.FLINT_H, 'RAW1_BYTES coerente con 144x168');
eqHex(P.SUN_LUT_CRC32 >>> 0, fx.sun_lut_crc32 >>> 0, 'SUN_LUT_CRC32 dichiarato = fixture');
eq(P.SUN_RGB.length, 64, 'SUN_RGB ha 64 colori');
eq(P.PAL_RGB.length, 64, 'PAL_RGB ha 64 colori');
eq(P.PAL_RGB[63].join(','), '255,255,255', 'PAL_RGB[63] = bianco');
eq(P.PAL_RGB[42].join(','), '170,170,170', 'PAL_RGB[42] = grigio 170');
eq(P.SUN_RGB[0].join(','), '0,0,0', 'SUN_RGB[0] = nero');
eq(P.SUN_RGB[63].join(','), '255,255,255', 'SUN_RGB[63] = bianco');

/* --------------------------------------------------- 2. immagini di prova --- */

var img200 = fromB64(fx.img200.b64);
var img144 = fromB64(fx.img144.b64);
eq(img200.length, fx.img200.len, 'img200: byte attesi');
eq(img200.length, fx.img200.w * fx.img200.h * 3, 'img200: 200 * 228 * 3');
eq(img144.length, fx.img144.len, 'img144: byte attesi');
eqHex(P.crc32(img200), fx.img200.crc >>> 0, 'img200: CRC32');
eqHex(P.crc32(img144), fx.img144.crc >>> 0, 'img144: CRC32');
/* zlib.crc32 esiste da node 20.15: se manca il confronto si salta (non e' un errore). */
var HAS_ZCRC = (typeof zlib.crc32 === 'function');
if (HAS_ZCRC) {
  eqHex(zlib.crc32(Buffer.from(img200)) >>> 0, fx.img200.crc >>> 0,
        'img200: stesso CRC32 anche secondo zlib di node');
} else {
  console.log('(zlib.crc32 assente in questo node: confronto saltato)');
}

(function () {                            /* la fixture deve coprire tutti i 256 livelli */
  var c, i, seen = [{}, {}, {}], n = [0, 0, 0];
  for (i = 0; i < img200.length; i += 3) {
    for (c = 0; c < 3; c++) {
      if (!seen[c][img200[i + c]]) { seen[c][img200[i + c]] = 1; n[c]++; }
    }
  }
  check(n[0] === 256 && n[1] === 256 && n[2] === 256,
        'img200 usa tutti i 256 livelli su ogni canale (' + n.join('/') + ')');
}());

/* --------------------------------------------------------- 3. LUT di tono --- */

var i, t, ok;
for (i = 0; i < fx.tone.length; i++) {
  t = P.toneLut(fx.tone[i].gamma, fx.tone[i].lift);
  eq(t.length, 256, 'toneLut lunga 256 (' + fx.tone[i].gamma + '/' + fx.tone[i].lift + ')');
  eqNums(t, fx.tone[i].lut, 'toneLut(' + fx.tone[i].gamma + ', ' + fx.tone[i].lift + ') = tone_lut');
}
eqNums(P.toneLut(1, 0), fx.tone_ident, 'toneLut(1, 0) = identita\' della fixture');
ok = true;
for (i = 0; i < 256; i++) { if (fx.tone_ident[i] !== i) { ok = false; } }
check(ok, 'la LUT identita\' e\' davvero t[i] = i');
eqNums(P.toneLut(NaN, NaN), fx.tone_ident, 'toneLut(NaN, NaN) ricade sull\'identita\'');
eqNums(P.toneLut(undefined, undefined), fx.tone_ident, 'toneLut(undefined) ricade sull\'identita\'');
eq(P.toneLut(1, 1)[0], 255, 'lift 1 porta tutto a bianco');
eq(P.toneLut(-5, 0)[255], 255, 'gamma negativa viene clampata (nessun NaN)');
check(P.toneLut(0.5, 0)[64] > 64, 'gamma < 1 schiarisce');
check(P.toneLut(2.0, 0)[64] < 64, 'gamma > 1 scurisce');

/* applyTone in place e rgbaToRgb */
(function () {
  var src = new Uint8Array([0, 1, 2, 253, 254, 255]);
  var neg = new Uint8Array(256), k, out;
  for (k = 0; k < 256; k++) { neg[k] = 255 - k; }
  out = P.applyTone(src, neg);
  check(out === src, 'applyTone lavora in place e ritorna lo stesso buffer');
  eqBytes(src, [255, 254, 253, 2, 1, 0], 'applyTone applica la LUT a ogni byte');
  eqBytes(P.rgbaToRgb(new Uint8Array([1, 2, 3, 255, 4, 5, 6, 0]), 2, 1), [1, 2, 3, 4, 5, 6],
          'rgbaToRgb scarta l\'alpha');
}());

/* --------------------------------------------------- 4. quantizzazione RGB --- */

for (i = 0; i < fx.quant.length; i++) {
  var v = fx.quant[i].v, idx = P.quantRaw(v, v, v);
  eq(idx & 3, fx.quant[i].q, 'quantRaw(' + v + ') canale B');
  eq((idx >> 2) & 3, fx.quant[i].q, 'quantRaw(' + v + ') canale G');
  eq((idx >> 4) & 3, fx.quant[i].q, 'quantRaw(' + v + ') canale R');
}
for (i = 0; i < fx.quant_rgb.length; i++) {
  var q = fx.quant_rgb[i];
  eq(P.quantRaw(q.rgb[0], q.rgb[1], q.rgb[2]), q.idx,
     'quantRaw(' + q.rgb.join(', ') + ')');
}
/* Le soglie vere di q(v) = min(3, (v + 42) // 85) sono 42|43, 127|128, 212|213 (photo_prep). */
eq(P.quantRaw(42, 43, 127) & 3, 1, 'soglia 127 -> 1');
eq((P.quantRaw(42, 43, 127) >> 4) & 3, 0, 'soglia 42 -> 0');
eq((P.quantRaw(42, 43, 127) >> 2) & 3, 1, 'soglia 43 -> 1');
eq(P.quantRaw(128, 212, 213), (2 << 4) | (2 << 2) | 3, 'soglie 128/212/213 -> 2/2/3');
eq(P.quantRaw(255, 255, 255), 63, 'bianco -> 63');
eq(P.quantRaw(0, 0, 0), 0, 'nero -> 0');

/* --------------------------------------------------------- 5. LUT sunlight --- */

var sunLut = P.buildSunLut();
eq(sunLut.length, 32768, 'buildSunLut: 32^3 celle');
eqHex(P.crc32(sunLut), fx.sun_lut_crc32 >>> 0, 'buildSunLut: CRC32 = photo_prep');
check(P.buildSunLut() === sunLut, 'buildSunLut e\' memoizzata (stesso oggetto)');
eq(sunLut[0], 0, 'LUT: (0,0,0) -> indice 0');
eq(sunLut[32767], 63, 'LUT: (31,31,31) -> indice 63');
/* Rideriva l'intera LUT (32.768 celle x 64 colori, ~150 ms): ogni cella deve contenere il PRIMO
 * indice a distanza euclidea minima dalla RESA, con le distanze in virgola mobile. E' il
 * controllo che smaschera una LUT costruita in aritmetica intera (che sposta centinaia di celle)
 * anche prima di guardare i CRC. */
(function () {
  var pal = P.SUN_RGB, bad = 0, first = null, used = {}, nused = 0;
  var r, g, b, k, rr, gg, bb, dr, dg, db, d, best, bd, cell;
  for (r = 0; r < 32; r++) {
    rr = r * 255 / 31;
    for (g = 0; g < 32; g++) {
      gg = g * 255 / 31;
      for (b = 0; b < 32; b++) {
        bb = b * 255 / 31;
        best = 0; bd = 1e12;
        for (k = 0; k < 64; k++) {
          dr = pal[k][0] - rr; dg = pal[k][1] - gg; db = pal[k][2] - bb;
          d = dr * dr + dg * dg + db * db;
          if (d < bd) { bd = d; best = k; }
        }
        cell = (r << 10) | (g << 5) | b;
        if (sunLut[cell] !== best) {
          bad++;
          if (!first) { first = '(' + r + ',' + g + ',' + b + ') = ' + sunLut[cell] + ' invece di ' + best; }
        }
        if (!used[sunLut[cell]]) { used[sunLut[cell]] = 1; nused++; }
      }
    }
  }
  eq(bad, 0, 'LUT: ogni cella e\' il primo minimo stretto in double' + (first ? ' [' + first + ']' : ''));
  eq(nused, 64, 'LUT: tutti i 64 indici di palette vengono usati almeno una volta');
}());

/* --------------------------------------------- 6. round trip emery (raw6) --- */

var imgCrcBefore = P.crc32(img200);
for (i = 0; i < fx.emery_cases.length; i++) {
  var c = fx.emery_cases[i];
  var r = P.encodeEmery(img200, { gamma: c.gamma, lift: c.lift, dither: c.dither, sunlight: c.sunlight });
  var what = 'emery ' + label(c);
  eq(r.len, 34200, what + ': len');
  eq(r.raw.length, 34200, what + ': byte del raw6');
  eqHex(r.crc >>> 0, c.crc >>> 0, what + ': CRC32 del raw6');
  eq(r.photo_id, c.photo_id, what + ': photo_id');
  eqBytes(r.raw.subarray(0, 12), c.head, what + ': primi 12 byte');
  eq(r.idx.length, 200 * 228, what + ': indici');
  (function () {
    var seen = {}, n = 0, k;
    for (k = 0; k < r.idx.length; k++) {
      if (r.idx[k] > 63) { n = -1; break; }
      if (!seen[r.idx[k]]) { seen[r.idx[k]] = 1; n++; }
    }
    eq(n, c.colors, what + ': colori distinti');
  }());
}
eqHex(P.crc32(img200), imgCrcBefore, 'encodeEmery non modifica l\'immagine di ingresso');
check(fx.emery_cases.length === 18, 'la fixture ha 18 casi emery (3 dither x 2 sunlight x 3 toni)');

/* pin: il raw6 intero in base64url (pack6 + b64url insieme) */
(function () {
  var p = fx.emery_pin;
  var r = P.encodeEmery(img200, { gamma: p.gamma, lift: p.lift, dither: p.dither, sunlight: p.sunlight });
  var s = P.b64url(r.raw);
  eq(r.raw.length, p.len, 'pin emery: lunghezza del raw6');
  eqHex(r.crc >>> 0, p.crc >>> 0, 'pin emery: CRC32');
  eq(s.length, 45600, 'pin emery: 45.600 caratteri base64url');
  check(s === p.b64url, 'pin emery: raw6 in base64url identico a photo_prep');
  eqBytes(b64js.decode(p.b64url), r.raw, 'pin emery: b64.js decodifica al raw6 prodotto');
}());

/* --------------------------------------------- 7. round trip flint (raw1) --- */

var img144CrcBefore = P.crc32(img144);
for (i = 0; i < fx.flint_cases.length; i++) {
  var fc = fx.flint_cases[i];
  var fr = P.encodeFlint(img144, { gamma: fc.gamma, lift: fc.lift, dither: fc.dither });
  var fwhat = 'flint ' + label(fc);
  eq(fr.len, 3024, fwhat + ': len');
  eq(fr.raw.length, 3024, fwhat + ': byte del raw1');
  eqHex(fr.crc >>> 0, fc.crc >>> 0, fwhat + ': CRC32 del raw1');
  eq(fr.photo_id, fc.photo_id, fwhat + ': photo_id');
  eqBytes(fr.raw.subarray(0, 12), fc.head, fwhat + ': primi 12 byte');
  (function () {
    var n = 0, k, bad = 0;
    for (k = 0; k < fr.bits.length; k++) {
      if (fr.bits[k] > 1) { bad++; }
      n += fr.bits[k];
    }
    eq(bad, 0, fwhat + ': i bit valgono 0 o 1');
    eq(n, fc.white, fwhat + ': pixel bianchi');
  }());
}
eqHex(P.crc32(img144), img144CrcBefore, 'encodeFlint non modifica l\'immagine di ingresso');
check(fx.flint_cases.length === 9, 'la fixture ha 9 casi flint (3 dither x 3 toni)');

(function () {
  var p = fx.flint_pin;
  var r = P.encodeFlint(img144, { gamma: p.gamma, lift: p.lift, dither: p.dither });
  var s = P.b64url(r.raw);
  eq(s.length, 4032, 'pin flint: 4.032 caratteri base64url');
  check(s === p.b64url, 'pin flint: raw1 in base64url identico a photo_prep');
  eqBytes(b64js.decode(p.b64url), r.raw, 'pin flint: b64.js decodifica al raw1 prodotto');
}());

/* to_gray16: pin dei pesi 54/183/19 (e del x16) */
for (i = 0; i < fx.gray.length; i++) {
  var gc = fx.gray[i];
  eq(P.toGray16(new Uint8Array(gc.rgb), 1, 1, P.toneLut(1, 0))[0], gc.g16,
     'toGray16(' + gc.rgb.join(', ') + ')');
  eq(P.toGray16(new Uint8Array(gc.rgb), 1, 1, null)[0], gc.g16,
     'toGray16 senza LUT = identita\' (' + gc.rgb.join(', ') + ')');
}

/* ---------------------------------- 8. fixture del test C (pack6 / pack1) --- */

(function () {
  var dir = path.join(__dirname, 'fixtures');
  var meta, m, RT_W, RT_H, RT1_W, RT1_H, crc6, crc1, idx, raw6, bits, raw1;
  if (!fs.existsSync(path.join(dir, 'rt_meta.h'))) {
    g_fail++; console.log('FAIL fixtures/rt_meta.h assente (photo_prep.py --fixture)');
    return;
  }
  meta = fs.readFileSync(path.join(dir, 'rt_meta.h'), 'utf8');
  function def(name) {
    var re = new RegExp('#define\\s+' + name + '\\s+(0x[0-9A-Fa-f]+|\\d+)');
    var mm = re.exec(meta);
    return mm ? Number(mm[1]) : -1;
  }
  RT_W = def('RT_W'); RT_H = def('RT_H'); RT1_W = def('RT1_W'); RT1_H = def('RT1_H');
  crc6 = def('RT_RAW6_CRC32') >>> 0; crc1 = def('RT_RAW1_CRC32') >>> 0;
  eq(RT_W * RT_H, 480, 'rt_meta.h: RT_W * RT_H');
  eq(RT1_W * RT1_H, 192, 'rt_meta.h: RT1_W * RT1_H');
  idx = new Uint8Array(fs.readFileSync(path.join(dir, 'rt.idx')));
  raw6 = new Uint8Array(fs.readFileSync(path.join(dir, 'rt.raw6')));
  bits = new Uint8Array(fs.readFileSync(path.join(dir, 'rt.bits')));
  raw1 = new Uint8Array(fs.readFileSync(path.join(dir, 'rt.raw1')));
  eq(idx.length, RT_W * RT_H, 'rt.idx: dimensione dichiarata in rt_meta.h');
  eq(raw6.length, def('RT_RAW6_LEN'), 'rt.raw6: dimensione dichiarata in rt_meta.h');
  eq(bits.length, RT1_W * RT1_H, 'rt.bits: dimensione dichiarata in rt_meta.h');
  eq(raw1.length, def('RT_RAW1_LEN'), 'rt.raw1: dimensione dichiarata in rt_meta.h');
  eqBytes(P.pack6(idx, RT_W, RT_H), raw6, 'pack6(rt.idx) = rt.raw6 byte a byte');
  eqBytes(P.pack1(bits, RT1_W, RT1_H), raw1, 'pack1(rt.bits) = rt.raw1 byte a byte');
  eqHex(P.crc32(P.pack6(idx, RT_W, RT_H)), crc6, 'pack6(rt.idx): CRC32 di rt_meta.h');
  eqHex(P.crc32(P.pack1(bits, RT1_W, RT1_H)), crc1, 'pack1(rt.bits): CRC32 di rt_meta.h');
  /* pack6 su un gruppo incompleto: gli indici mancanti valgono 0 (come raw6_pack) */
  eqBytes(P.pack6(new Uint8Array([63, 63]), 2, 1), [0xFF, 0xF0, 0x00], 'pack6: ultimo gruppo incompleto');
  eqBytes(P.pack6(new Uint8Array([1, 2, 3, 4]), 4, 1), [0x04, 0x20, 0xC4], 'pack6: 4 indici -> 3 byte');
  eqBytes(P.pack1(new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0, 1]), 9, 1), [0x80, 0x80],
          'pack1: MSB-first, 1 = bianco');
}());

/* ------------------------------------------------------ 9. CRC32 e base64 --- */

for (i = 0; i < fx.crc_vectors.length; i++) {
  var cv = fx.crc_vectors[i], bts = bytesOf(cv.s);
  eqHex(P.crc32(bts), cv.crc >>> 0, 'crc32("' + cv.s.slice(0, 12) + '")');
  eqHex(P.crc32(bts), crcjs.crc32(bts), 'crc32 = crc.js su "' + cv.s.slice(0, 12) + '"');
}
eqHex(P.crc32(new Uint8Array(0)), 0, 'crc32 del buffer vuoto = 0');
eqHex(P.crc32(bytesOf('56789'), P.crc32(bytesOf('1234'))), 0xCBF43926,
      'crc32 con prev continua il calcolo');
(function () {
  var big = lcgBytes(34200, 7);
  eqHex(P.crc32(big), crcjs.crc32(big), 'crc32 = crc.js su 34.200 byte');
  if (HAS_ZCRC) {
    eqHex(P.crc32(big), zlib.crc32(Buffer.from(big)) >>> 0, 'crc32 = zlib.crc32 di node su 34.200 byte');
  }
  check(P.crc32(bytesOf('a')) === 0xE8B7BE43 && P.crc32(bytesOf('a')) > 0x7FFFFFFF,
        'crc32 ritorna un numero senza segno (bit 31 acceso -> 3,9 miliardi)');
}());

for (i = 0; i < fx.b64_vectors.length; i++) {
  var bv = fx.b64_vectors[i];
  eq(P.b64url(new Uint8Array(bv.bytes)), bv.s, 'b64url di ' + bv.bytes.length + ' byte = photo_prep');
  eq(P.b64url(new Uint8Array(bv.bytes)), b64js.encode(bv.bytes),
     'b64url = b64.js su ' + bv.bytes.length + ' byte');
}
(function () {                            /* lunghezze 0..40: tutti i resti 0, 1, 2 mod 3 */
  var n, buf, s, bad = 0, badLen = 0;
  for (n = 0; n <= 40; n++) {
    buf = lcgBytes(n, 1000 + n);
    s = P.b64url(buf);
    if (s !== b64js.encode(Array.prototype.slice.call(buf))) { bad++; }
    if (s.length !== Math.ceil(n * 4 / 3)) { badLen++; }
    if (/[^A-Za-z0-9_-]/.test(s)) { bad++; }
  }
  eq(bad, 0, 'b64url = b64.js (alfabeto url, niente padding) su tutte le lunghezze 0..40');
  eq(badLen, 0, 'b64url: ceil(n * 4 / 3) caratteri per ogni lunghezza');
  buf = lcgBytes(34200, 3);
  eq(P.b64url(buf).length, 45600, 'b64url di un raw6: 45.600 caratteri');
  eqBytes(b64js.decode(P.b64url(buf)), buf, 'b64.js decodifica quello che b64url produce');
}());

/* photoId */
eq(P.photoId(new Uint8Array(0)), 1, 'photoId: crc 0 -> 1 (mai zero)');
(function () {
  var k, r, bad = 0;
  for (k = 0; k < fx.emery_cases.length; k++) {
    r = fx.emery_cases[k];
    if (r.photo_id !== ((r.crc & 0x7FFFFFFF) || 1)) { bad++; }
    if (r.photo_id < 0 || r.photo_id > 0x7FFFFFFF) { bad++; }
  }
  eq(bad, 0, 'photo_id della fixture = (crc & 0x7FFFFFFF) || 1, bit 31 sempre a zero');
  eq(P.photoId(lcgBytes(100, 5)), (P.crc32(lcgBytes(100, 5)) & 0x7FFFFFFF) || 1,
     'photoId = crc32 & 0x7FFFFFFF');
}());

/* ------------------------------------------------------------ 10. ritagli --- */

for (i = 0; i < fx.rects.length; i++) {
  var rc = fx.rects[i], tag = rc.sw + 'x' + rc.sh + ' arg ' + JSON.stringify(rc.arg);
  var ft = P.fitRect(rc.sw, rc.sh, P.EMERY_W, P.EMERY_H);
  var cr = P.cropRect(rc.sw, rc.sh, rc.arg);
  var flr = P.flintRect(cr);
  eq(ft.w + 'x' + ft.h, rc.fit.w + 'x' + rc.fit.h, 'fitRect ' + tag);
  eq(cr.x + ',' + cr.y + ',' + cr.w + ',' + cr.h,
     rc.crop.x + ',' + rc.crop.y + ',' + rc.crop.w + ',' + rc.crop.h, 'cropRect ' + tag);
  eq(flr.x + ',' + flr.y + ',' + flr.w + ',' + flr.h,
     rc.flint.x + ',' + rc.flint.y + ',' + rc.flint.w + ',' + rc.flint.h, 'flintRect ' + tag);
  check(cr.x >= 0 && cr.y >= 0 && cr.x + cr.w <= rc.sw && cr.y + cr.h <= rc.sh,
        'cropRect resta dentro l\'immagine ' + tag);
}
(function () {                            /* l'oggetto {x,y,w,h} vale come [x,y,w,h] */
  var a = P.cropRect(4000, 3000, [100, 200, 1500, 900]);
  var b = P.cropRect(4000, 3000, { x: 100, y: 200, w: 1500, h: 900 });
  eq(a.x + ',' + a.y + ',' + a.w + ',' + a.h, b.x + ',' + b.y + ',' + b.w + ',' + b.h,
     'cropRect accetta sia array sia oggetto');
  eq(P.cropRect(4000, 3000, undefined).w, P.cropRect(4000, 3000, null).w,
     'cropRect: undefined come null');
}());

/* ---------------------------------------------------------- 11. anteprime --- */

(function () {
  var idxs = new Uint8Array([0, 63, 42, 21]);
  var a = P.previewRgba(idxs, 2, 2, true, 2), b = P.previewRgba(idxs, 2, 2, false, 1), k;
  eq(a.length, 4 * 4 * 4, 'previewRgba: 2x2 a scala 2 -> 4x4 RGBA');
  eq(a[0] + ',' + a[1] + ',' + a[2] + ',' + a[3], '0,0,0,255', 'previewRgba: indice 0 nero opaco');
  /* il pixel (1,0) replicato a scala 2 occupa le colonne 2 e 3 della riga 0 e della riga 1 */
  eq(a[8] + ',' + a[9] + ',' + a[10], P.SUN_RGB[63].join(','), 'previewRgba: sunlight usa SUN_RGB');
  /* riga 1 dell'uscita (stesso pixel sorgente): base = 1 * W * 4 = 16, colonna 2 -> +8 */
  eq(a[16 + 8] + ',' + a[16 + 9], P.SUN_RGB[63][0] + ',' + P.SUN_RGB[63][1],
     'previewRgba: i pixel sono replicati anche in verticale');
  eq(a[2 * 16 + 0] + ',' + a[2 * 16 + 1] + ',' + a[2 * 16 + 2], P.SUN_RGB[42].join(','),
     'previewRgba: la riga 2 riprende dalla seconda riga di indici');
  eq(b.length, 2 * 2 * 4, 'previewRgba: scala 1');
  eq(b[4] + ',' + b[5] + ',' + b[6], P.PAL_RGB[63].join(','), 'previewRgba: senza sunlight PAL_RGB');
  eq(b[8] + ',' + b[9] + ',' + b[10], '170,170,170', 'previewRgba: indice 42 = grigio nominale');
  var bits = new Uint8Array([1, 0, 0, 1]);
  var c = P.preview1Rgba(bits, 2, 2, 3);
  eq(c.length, 6 * 6 * 4, 'preview1Rgba: 2x2 a scala 3 -> 6x6 RGBA');
  eq(c[0] + ',' + c[3], '255,255', 'preview1Rgba: 1 = bianco opaco');
  eq(c[3 * 4] + ',' + c[3 * 4 + 3], '0,255', 'preview1Rgba: 0 = nero opaco');
  var ok1 = true;
  for (k = 3; k < c.length; k += 4) { if (c[k] !== 255) { ok1 = false; } }
  check(ok1, 'preview1Rgba: alpha sempre 255');
}());

/* ------------------------------------------------------------- 12. errori --- */

expectError(function () { P.encodeEmery(new Uint8Array(10), {}); }, 'encodeEmery: RGB troppo corto');
expectError(function () { P.encodeEmery(null, {}); }, 'encodeEmery: RGB assente');
expectError(function () { P.encodeEmery(img200, { dither: 'atkinson' }); },
            'encodeEmery: dithering sconosciuto (atkinson e\' solo flint)');
expectError(function () { P.encodeFlint(new Uint8Array(10), {}); }, 'encodeFlint: RGB troppo corto');
expectError(function () { P.encodeFlint(img144, { dither: 'bayer' }); },
            'encodeFlint: dithering sconosciuto (bayer e\' solo emery)');
(function () {                            /* opzioni assenti = fs, gamma 1, lift 0, no sunlight */
  var a = P.encodeEmery(img200, {});
  var b = P.encodeEmery(img200, { gamma: 1, lift: 0, dither: 'fs', sunlight: false });
  eqHex(a.crc >>> 0, b.crc >>> 0, 'encodeEmery: default = fs, gamma 1, lift 0, senza sunlight');
  var c = P.encodeFlint(img144, {});
  var d = P.encodeFlint(img144, { gamma: 1, lift: 0, dither: 'fs' });
  eqHex(c.crc >>> 0, d.crc >>> 0, 'encodeFlint: default = fs, gamma 1, lift 0');
}());

/* ----------------------------------------- 13. il file resta inlinabile ---- */

/* pipeline.js finisce dentro una stringa JS in config_page.js e gira in WebView vecchie:
 * niente backtick, niente sintassi ES6, niente </script> (l'inliner fallirebbe). */
(function () {
  var src = fs.readFileSync(PIPE, 'utf8');
  check(src.indexOf('`') < 0, 'pipeline.js: nessun backtick (viene inlinato in una stringa)');
  check(!/=>/.test(src), 'pipeline.js: nessuna arrow function');
  check(!/\b(let|const|class)\s+[A-Za-z_$]/.test(src), 'pipeline.js: niente let/const/class (ES5)');
  check(!/<\/(script|style)/i.test(src), 'pipeline.js: nessun </script> o </style>');
  check(src.indexOf('require(') < 0, 'pipeline.js: nessun require (deve girare anche nel browser)');
  check(/module\.exports/.test(src) && /GalPipeline/.test(src), 'pipeline.js: UMD node + browser');
}());

/* --------------------------------------------------------------- esito ---- */

console.log('test_pipeline: ' + g_pass + ' ok, ' + g_fail + ' fail');
process.exit(g_fail ? 1 : 0);

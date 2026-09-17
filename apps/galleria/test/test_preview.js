#!/usr/bin/env node
/* test_preview.js - test host di src/pkjs/config/preview.js (S12/D48, node, nessuna dipendenza).
 *
 * preview.js e' il porting JS di ui_time.c (griglia e posizioni delle cifre), ui_digits.c (blit) e
 * luma.c (colore automatico) per l'anteprima "onesta" della config page. Qui si confronta con:
 *   - test/fixture_preview.js (generata da test/gen_preview_fixture.py con le funzioni di
 *     tools/gen_digits.py e tools/photo_prep.py): posizioni di "12:34" per 2 piattaforme x 5 font x
 *     2 layout, CRC32 della mappa di indici 0..3 di ogni glifo ricostruita dalle maschere di
 *     src/pkjs/digit_masks.js, decisioni luma delle due foto demo (= resources/photos/README.md);
 *   - le foto demo vere (resources/photos/demo_*.raw6|raw1, lette con fs, CRC pinnati);
 *   - casi sintetici scritti a mano (mappe 7x7 e 3x3, soglie di luma esatte, campionamento, isteresi,
 *     palette D21/D26 per stile e piattaforma, round trip unpack6/pack6 e unpack1/pack1, render).
 *
 * Si esegue da solo (`node test/test_preview.js`, da qualunque cwd) o con `make -C test jstest`.
 * GAL_PREVIEW=/percorso/preview.js sostituisce il modulo sotto test: serve SOLO al mutation testing
 * di test/mutants_preview.js (`make -C test mutants`, fuori da `all` come browsertest: ogni mutante
 * di D48 viene applicato a una copia in test/build/ e questo test deve diventare rosso); la copia
 * trova GalPipeline nel globale, cosi' non le serve pipeline.js accanto. */

var fs = require('fs');
var path = require('path');

var APP = path.join(__dirname, '..');
var P = require(path.join(APP, 'src', 'pkjs', 'config', 'pipeline.js'));
global.GalPipeline = P;                                   /* per la copia mutante (vedi sopra) */
var PREV = process.env.GAL_PREVIEW
  ? path.resolve(process.env.GAL_PREVIEW)
  : path.join(APP, 'src', 'pkjs', 'config', 'preview.js');
var V = require(PREV);
var fx = require('./fixture_preview');
var M = require(path.join(APP, 'src', 'pkjs', 'digit_masks.js'));
var PHOTOS = path.join(APP, 'resources', 'photos');

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

function eqBytes(got, exp, what) {
  var i;
  if (got.length !== exp.length) {
    g_fail++; console.log('FAIL ' + what + ': ' + got.length + ' elementi invece di ' + exp.length);
    return;
  }
  for (i = 0; i < exp.length; i++) {
    if ((got[i] & 255) !== (exp[i] & 255)) {
      g_fail++; console.log('FAIL ' + what + ': elemento ' + i + ' = ' + got[i] + ' invece di ' + exp[i]);
      return;
    }
  }
  g_pass++;
}

function eqRgb(got, exp, what) {
  eq(got[0] + ',' + got[1] + ',' + got[2], exp[0] + ',' + exp[1] + ',' + exp[2], what);
}

function expectError(fn, what) {
  try { fn(); } catch (e) { g_pass++; return; }
  g_fail++; console.log('FAIL ' + what + ': nessun errore');
}

/* come expectError, ma l'errore deve essere un Error del modulo con `re` nel messaggio (non un
 * TypeError accidentale su null/undefined) */
function expectErrorMsg(fn, re, what) {
  try { fn(); } catch (e) {
    if (e instanceof Error && !(e instanceof TypeError) && re.test(String(e.message))) { g_pass++; return; }
    g_fail++; console.log('FAIL ' + what + ': errore sbagliato (' + e + ')'); return;
  }
  g_fail++; console.log('FAIL ' + what + ': nessun errore');
}

function readPhoto(name) {
  return new Uint8Array(fs.readFileSync(path.join(PHOTOS, name)));
}

/* LCG deterministico per i dati sintetici */
function lcg(seed) {
  var s = seed >>> 0;
  return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s >>> 8; };
}

/* mappa di indici -> righe di testo ('0'..'3'), per i casi scritti a mano */
function mapRows(map, w) {
  var rows = [], y, x, r;
  for (y = 0; y < map.length / w; y++) {
    r = '';
    for (x = 0; x < w; x++) { r += String(map[y * w + x]); }
    rows.push(r);
  }
  return rows;
}

/* maschera 1 bit da righe di testo ('1' = riempimento) -> {w, bits} come digit_masks.js */
function glyphFromRows(rows) {
  var w = rows[0].length, stride = (w + 7) >> 3, bytes = new Uint8Array(stride * rows.length), y, x;
  for (y = 0; y < rows.length; y++) {
    for (x = 0; x < w; x++) {
      if (rows[y].charAt(x) === '1') { bytes[y * stride + (x >> 3)] |= 0x80 >> (x & 7); }
    }
  }
  return { w: w, bits: P.b64url(bytes) };
}

function countIdx(map, v) {
  var n = 0, i;
  for (i = 0; i < map.length; i++) { if (map[i] === v) { n++; } }
  return n;
}

/* pixel RGB dell'RGBA scalato in (x, y) di schermo (angolo in alto a sinistra del blocco s x s) */
function pixelAt(r, x, y, s) {
  var o = ((y * s) * r.width + x * s) * 4;
  return [r.rgba[o], r.rgba[o + 1], r.rgba[o + 2]];
}

/* prima posizione (xx, yy) della mappa con indice v, cercando dalla riga centrale in giu' */
function findIdx(map, w, v) {
  var h = map.length / w, y, x;
  for (y = (h / 2) | 0; y < h; y++) {
    for (x = 0; x < w; x++) { if (map[y * w + x] === v) { return { x: x, y: y }; } }
  }
  for (y = 0; y < ((h / 2) | 0); y++) {
    for (x = 0; x < w; x++) { if (map[y * w + x] === v) { return { x: x, y: y }; } }
  }
  return null;
}

/* ---------------------------------------------------------------- 1. costanti pinnate ---- */

(function () {
  var sum = 0, i, bytes = new Uint8Array(64);
  eq(V.LUMA_SUN.length, fx.luma.sun_len, 'LUMA_SUN: 64 valori');
  for (i = 0; i < 64; i++) { sum += V.LUMA_SUN[i]; bytes[i] = V.LUMA_SUN[i]; }
  eq(sum, fx.luma.sun_sum, 'LUMA_SUN: somma');
  eqHex(P.crc32(bytes), fx.luma.sun_crc, 'LUMA_SUN: CRC32');
  eq(V.LUMA_Y_WHITE_BAD, fx.luma.white_bad, 'soglia bianco 77');
  eq(V.LUMA_Y_BLACK_BAD, fx.luma.black_bad, 'soglia nero 25');
  eq(V.LUMA_Y_CROSSOVER, fx.luma.crossover, 'crossover 46');
  eq(V.LUMA_HALO_PCT, fx.luma.halo_pct, 'contorno > 15 %');
  eq(V.FIT_MARGIN, 2, 'FIT_MARGIN 2');
  eq(V.MAX_GLYPHS, 5, 'MAX_GLYPHS 5');
  eq(V.RING_GAPS.join(','), '2,1,0,-1', 'RING_GAPS');
  ['emery', 'flint'].forEach(function (plat) {
    var L = V.LAYOUT[plat], F = fx.layout[plat], k;
    for (k in F) {
      if (k === 'fmt' || k === 'band_a' || k === 'band_b') { continue; }
      eq(L[k], F[k], 'LAYOUT.' + plat + '.' + k);
    }
  });
  eq(V.FONT_KEYS.join(','), 'anton,bebas,barlow,,francois,staatliches', 'FONT_KEYS = gal_font_strip');
  eq(V.GREY_IDX, 21, 'grigio neutro 21');
  /* fmt: 1|2, 'raw6'|'raw1', nome della piattaforma (via layoutRows, che lo risolve) */
  eq(V.layoutRows('raw6', 0, M.emery.anton, '1').lumaH, 106, "platformOf('raw6')");
  eq(V.layoutRows('raw1', 0, M.flint.anton, '1').lumaH, 76, "platformOf('raw1')");
  eq(V.layoutRows('flint', 0, M.flint.anton, '1').lumaH, 76, "platformOf('flint')");
  expectError(function () { V.layoutRows(3, 0, M.emery.anton, '1'); }, 'platformOf(3)');
}());

/* ---------------------------------------------------------------- 2. base64url ---- */

(function () {
  var rnd = lcg(7), n, i, bytes, s, got;
  for (n = 0; n < 40; n++) {
    bytes = new Uint8Array(n);
    for (i = 0; i < n; i++) { bytes[i] = rnd() & 255; }
    s = P.b64url(bytes);
    if (n === 0) { continue; }
    got = V.decodeMask({ w: n * 8, bits: s });
    eq(got.length, n * 8, 'decodeMask ' + n + ' B: bit');
    for (i = 0; i < n * 8; i++) { if (got[i] !== ((bytes[i >> 3] >> (7 - (i & 7))) & 1)) { break; } }
    eq(i, n * 8, 'b64urlDecode ' + n + ' B (via decodeMask)');
  }
  expectError(function () { V.decodeMask({ w: 24, bits: 'AB*D' }); }, 'b64urlDecode carattere non valido');
  expectError(function () { V.decodeMask({ w: 24, bits: 'ABCDE' }); }, 'b64urlDecode lunghezza 1 mod 4');
}());

/* ---------------------------------------------------------------- 3. unpack6 / unpack1 ---- */

(function () {
  var rnd = lcg(11), idx = new Uint8Array(200 * 228), i, raw, back, bits, w, h, raw1;
  for (i = 0; i < idx.length; i++) { idx[i] = rnd() & 63; }
  raw = P.pack6(idx, 200, 228);
  eq(raw.length, 34200, 'pack6 34.200 B');
  eqBytes(V.unpack6(raw, 200, 228), idx, 'unpack6(pack6(idx)) == idx');
  eqBytes(V.unpack6(raw), idx, 'unpack6 senza w/h');
  back = P.pack6(V.unpack6(raw, 200, 228), 200, 228);
  eqBytes(back, raw, 'pack6(unpack6(raw)) == raw');
  /* gruppo incompleto: 6 pixel -> 2 gruppi (6 B), unpack6 con npix 6 */
  eqBytes(V.unpack6(P.pack6(new Uint8Array([1, 2, 3, 4, 5, 6]), 6, 1), 6, 1), [1, 2, 3, 4, 5, 6], 'unpack6 npix non multiplo di 4');
  eq(V.unpack6(new Uint8Array([0xFF, 0xFF, 0xFF]))[3], 63, 'unpack6 d = b2 & 63');
  eq(V.unpack6(new Uint8Array([0x04, 0x10, 0x40]))[0], 1, 'unpack6 a = b0 >> 2');
  eq(V.unpack6(new Uint8Array([0x04, 0x10, 0x40]))[1], 1, 'unpack6 b');
  eq(V.unpack6(new Uint8Array([0x04, 0x10, 0x40]))[2], 1, 'unpack6 c');
  expectError(function () { V.unpack6(new Uint8Array(100), 200, 228); }, 'unpack6 raw corto');
  /* guardia su raw assente (revisione S12, rv): Error('raw6 0') del modulo, non un TypeError su raw.length */
  expectErrorMsg(function () { V.unpack6(null); }, /^raw6 0$/, 'unpack6(null) senza w/h: guardia');
  expectErrorMsg(function () { V.unpack6(undefined); }, /^raw6 0$/, 'unpack6(undefined) senza w/h: guardia');
  expectErrorMsg(function () { V.unpack6(null, 200, 228); }, /^raw6 0$/, 'unpack6(null, w, h): guardia');
  expectErrorMsg(function () { V.unpack6(new Uint8Array(100), 200, 228); }, /^raw6 100$/, 'unpack6 raw corto: messaggio con la lunghezza');
  expectErrorMsg(function () { V.unpack1(null, 144, 168); }, /^raw1 0$/, 'unpack1(null): guardia');
  ['demo_1.raw6', 'demo_2.raw6'].forEach(function (f) {
    var r = readPhoto(f);
    eqBytes(P.pack6(V.unpack6(r, 200, 228), 200, 228), r, 'round trip ' + f);
  });

  /* raw1: larghezze non multiple di 8 */
  [[144, 168], [13, 5], [8, 3], [1, 7]].forEach(function (d) {
    w = d[0]; h = d[1];
    bits = new Uint8Array(w * h);
    for (i = 0; i < bits.length; i++) { bits[i] = rnd() & 1; }
    raw1 = P.pack1(bits, w, h);
    eq(raw1.length, ((w + 7) >> 3) * h, 'pack1 ' + w + 'x' + h);
    eqBytes(V.unpack1(raw1, w, h), bits, 'unpack1(pack1(bits)) ' + w + 'x' + h);
  });
  eq(V.unpack1(new Uint8Array([0x80]), 8, 1)[0], 1, 'unpack1 MSB-first: bit 0x80 = pixel 0');
  eq(V.unpack1(new Uint8Array([0x01]), 8, 1)[7], 1, 'unpack1 MSB-first: bit 0x01 = pixel 7');
  expectError(function () { V.unpack1(new Uint8Array(10), 144, 168); }, 'unpack1 raw corto');
  ['demo_1.raw1', 'demo_2.raw1'].forEach(function (f) {
    var r = readPhoto(f);
    eqBytes(P.pack1(V.unpack1(r, 144, 168), 144, 168), r, 'round trip ' + f);
  });
}());

/* ---------------------------------------------------------------- 4. maschere e mappe (D45/D20) ---- */

(function () {
  var g, map, rows, i, exp, size, cases = 0;

  /* 7x7, un pixel al centro, R 2 S 2: anello = quadrato 5x5 meno il centro (serve la dilatazione
   * DIAGONALE: gli angoli stanno a distanza di Chebyshev 2), ombra = scorrimenti (+1,+1) e (+2,+2)
   * del quadrato, meno il quadrato: la L in basso a destra. */
  g = glyphFromRows(['0000000', '0000000', '0000000', '0001000', '0000000', '0000000', '0000000']);
  eq(V.decodeMask(g).length, 49, 'decodeMask 7x7');
  eq(V.decodeMask(g)[3 * 7 + 3], 1, 'decodeMask: il pixel (3,3)');
  eq(countIdx(V.decodeMask(g), 1), 1, 'decodeMask: un solo pixel');
  map = V.glyphMap(g, 2, 2, 7);
  exp = ['0000000', '0222220', '0222223', '0221223', '0222223', '0222223', '0033333'];
  eq(mapRows(map, 7).join('/'), exp.join('/'), 'glyphMap 7x7 R2 S2');
  /* stesso glifo con S 0 (flint, D26): niente indice 3 */
  map = V.glyphMap(g, 2, 0, 7);
  exp = ['0000000', '0222220', '0222220', '0221220', '0222220', '0222220', '0000000'];
  eq(mapRows(map, 7).join('/'), exp.join('/'), 'glyphMap 7x7 R2 S0');
  /* R 1: anello 3x3 (8-connesso) */
  map = V.glyphMap(g, 1, 0, 7);
  exp = ['0000000', '0000000', '0022200', '0021200', '0022200', '0000000', '0000000'];
  eq(mapRows(map, 7).join('/'), exp.join('/'), 'glyphMap 7x7 R1 S0');
  /* R 1 S 1: l'ombra parte da riempimento U anello (non dal solo riempimento) */
  map = V.glyphMap(g, 1, 1, 7);
  exp = ['0000000', '0000000', '0022200', '0021230', '0022230', '0003330', '0000000'];
  eq(mapRows(map, 7).join('/'), exp.join('/'), 'glyphMap 7x7 R1 S1');

  /* 3x3 con il riempimento nell'angolo: la dilatazione NON viene ritagliata durante il calcolo (D45), quindi
   * l'anello fuori casella (-1,-1)..(1,-1),(-1,0),(-1,1) proietta la sua ombra dentro: (2,0) e (0,2); il
   * ritaglio e' solo alla fine (stesso risultato di gen_digits.glyph_index_map; nelle strip vere non
   * capita, perche' la casella e' per costruzione l'inchiostro intero) */
  g = glyphFromRows(['100', '000', '000']);
  map = V.glyphMap(g, 1, 1, 3);
  eq(mapRows(map, 3).join('/'), '123/223/333', 'glyphMap 3x3 angolo R1 S1 (senza ritaglio durante il calcolo)');
  /* la strip_h passata deve coincidere con i byte */
  expectError(function () { V.glyphMap(g, 1, 1, 4); }, 'glyphMap strip_h sbagliata');
  expectError(function () { V.decodeMask({ w: 3 }); }, 'decodeMask senza bits');
  expectError(function () { V.decodeMask({ w: 0, bits: 'AA' }); }, 'decodeMask w 0');
  /* w 9: due byte per riga, l'ultimo bit del secondo byte non usato */
  g = glyphFromRows(['000000001', '000000000']);
  eq(V.decodeMask(g)[8], 1, 'decodeMask w 9: pixel 8 nel secondo byte');
  eq(countIdx(V.decodeMask(g), 1), 1, 'decodeMask w 9: un solo pixel');

  /* i 90 glifi della fixture: CRC della mappa e conteggi per indice */
  fx.cases.forEach(function (c) {
    size = M[c.platform][c.font][c.size];
    c.rows.forEach(function (row) {
      row.glyphs.forEach(function (gl) {
        var m = V.glyphMap(size.glyphs[gl.ch], size.ring, size.shadow, size.strip_h);
        cases++;
        eq(m.length, gl.w * size.strip_h, 'mappa ' + c.platform + ' ' + c.font + ' ' + c.size + " '" + gl.ch + "': dimensione");
        eqHex(P.crc32(m), gl.crc, 'mappa ' + c.platform + ' ' + c.font + ' ' + c.size + " '" + gl.ch + "': CRC32");
        eq(countIdx(m, 1), gl.fill, 'mappa ' + c.font + ' ' + c.size + " '" + gl.ch + "': riempimento");
        eq(countIdx(m, 2), gl.ring, 'mappa ' + c.font + ' ' + c.size + " '" + gl.ch + "': anello");
        eq(countIdx(m, 3), gl.shadow, 'mappa ' + c.font + ' ' + c.size + " '" + gl.ch + "': ombra");
      });
    });
  });
  eq(cases, 90, '90 glifi nella fixture');
  /* su flint (S 0) nessun glifo ha l'indice 3 */
  for (i in M.flint) {
    if (Object.prototype.hasOwnProperty.call(M.flint, i)) {
      size = M.flint[i].b;
      eq(countIdx(V.glyphMap(size.glyphs['8'], size.ring, size.shadow, size.strip_h), 3), 0, 'flint ' + i + " B '8': senza ombra");
    }
  }
}());

/* ---------------------------------------------------------------- 5. griglia e posizioni ---- */

(function () {
  var n = 0, size, r, i, j, q, h, gl, rows, red, k, wide;
  fx.cases.forEach(function (c) {
    size = M[c.platform][c.font][c.size];
    r = V.layoutRows(c.fmt, c.layout, M[c.platform][c.font], fx.time);
    eq(r.lumaH, c.band_h, c.platform + ' ' + c.font + ' ' + c.layout + ': fascia di luma');
    eq(r.size, c.size, c.platform + ' ' + c.layout + ': taglia');
    eq(r.rows.length, c.rows.length, c.platform + ' ' + c.font + ' ' + c.layout + ': numero di righe');
    for (i = 0; i < c.rows.length; i++) {
      q = r.rows[i];
      ['y', 'total', 'x0', 'ring_gap'].forEach(function (key) {
        n++;
        eq(q[key], c.rows[i][key], c.platform + ' ' + c.font + ' ' + c.layout + ' riga ' + i + ': ' + key);
      });
      eq(q.glyphs.length, c.rows[i].glyphs.length, c.platform + ' ' + c.font + ' ' + c.layout + ' riga ' + i + ': glifi');
      for (j = 0; j < c.rows[i].glyphs.length; j++) {
        gl = c.rows[i].glyphs[j];
        h = q.glyphs[j];
        ['ch', 'g', 'w', 'x', 'adv', 'gx'].forEach(function (key) {
          n++;
          eq(h[key], gl[key], c.platform + ' ' + c.font + ' ' + c.layout + " '" + gl.ch + "': " + key);
        });
      }
    }
    /* la voce della taglia passata direttamente e gli alias di fmt danno lo stesso risultato */
    eq(JSON.stringify(V.layoutRows(c.platform, c.layout === 'B' ? 1 : 0, size, fx.time).rows),
       JSON.stringify(r.rows), c.platform + ' ' + c.font + ' ' + c.layout + ': voce della taglia + fmt nome');
    eq(JSON.stringify(V.layoutRows(c.platform === 'emery' ? 1 : 2, c.layout === 'B' ? 'b' : 'a', size, fx.time).rows),
       JSON.stringify(r.rows), c.platform + ' ' + c.font + ' ' + c.layout + ': fmt numerico');
  });
  eq(n, 660, '660 campi di posizione confrontati');

  /* commento di prv_place_row_fit: 24 h con spazio 2 per tutti i font, Francois «00:44» 193 px, Anton 183 */
  eq(V.layoutRows('emery', 0, M.emery.francois.a, '00:44').rows[0].total, 193, 'Francois One A «00:44» 193 px');
  eq(V.layoutRows('emery', 0, M.emery.anton.a, '00:44').rows[0].total, 183, 'Anton A «00:44» 183 px');
  eq(V.layoutRows('emery', 0, M.emery.anton.a, '00:44').rows[0].ring_gap, 2, 'Anton A: spazio 2');

  /* griglia: passo dalla cifra PIU' LARGA fra le 10 (staatliches: '0' e' piu' largo di '1'..'4') */
  size = M.flint.staatliches.a;
  eq(V.gridSteps(size, 28, 12, 2).digit, 29, 'flint staatliches A: passo 29 (riempimento 25 + 2 + 2)');
  eq(V.gridSteps(size, 28, 12, -1).digit, 28, 'flint staatliches A: riserva 28');
  eq(V.fillWidth(size, 0), 25, "flint staatliches A '0': riempimento 25");
  eq(V.fillWidth(M.emery.anton.a, 10), 13, "emery anton A ':': riempimento 19 - 4 - 2");
  eq(V.fillWidth(M.emery.anton.b, 10), 0, "emery anton B ':': assente");
  eq(V.fillWidth({ ring: 2, shadow: 2, glyphs: { '1': { w: 5 } } }, 1), 1, 'riempimento minimo 1');
  /* un glifo con il solo `w` (senza bits) conta per la griglia: cosi' il PKJS puo' mandare le larghezze
   * delle cifre non presenti nell'ora campione senza le loro maschere */
  red = { strip_h: size.strip_h, digit_h: size.digit_h, ring: size.ring, shadow: size.shadow, cell_w: size.cell_w, glyphs: {} };
  for (k in size.glyphs) {
    if (Object.prototype.hasOwnProperty.call(size.glyphs, k)) {
      red.glyphs[k] = ('1234:'.indexOf(k) >= 0) ? size.glyphs[k] : { w: size.glyphs[k].w };
    }
  }
  eq(JSON.stringify(V.layoutRows('flint', 0, red, '12:34').rows), JSON.stringify(V.layoutRows('flint', 0, size, '12:34').rows),
     'flint staatliches A: maschere ridotte con le sole larghezze delle altre cifre = griglia completa');
  /* SENZA le larghezze delle altre cifre la griglia cambia (28 invece di 29): lo pinna, perche' e' cio' che
   * il PKJS NON deve fare (D45: nell'hash servono anche i `w` dei glifi assenti) */
  red.glyphs = {};
  for (k = 0; k < '1234:'.length; k++) { red.glyphs['1234:'.charAt(k)] = size.glyphs['1234:'.charAt(k)]; }
  eq(V.layoutRows('flint', 0, red, '12:34').rows[0].glyphs[0].adv, 28, 'flint staatliches A con i soli glifi 1234: passo 28 (diverso dall orologio)');

  /* layout B: ore fino al primo ':' (1 cifra centrata), minuti dopo; una riga piu' larga dello schermo
   * cade nella riserva (barlow B: spazio 2 = 211 px, 1 = 208, 0 = 205, tutti > 196 -> riserva max(64, 59 + 2)
   * = 64 -> 208 px, x0 = -4, nessun clamp) */
  rows = V.layoutRows('emery', 1, M.emery.anton, '9:05').rows;
  eq(rows[0].glyphs.length, 1, 'B «9:05»: 1 glifo nelle ore');
  eq(rows[0].x0, 68, 'B «9:05»: ora centrata ((200 - 64) / 2)');
  eq(rows[1].glyphs.length, 2, 'B «9:05»: 2 glifi nei minuti');
  eq(rows[1].glyphs[0].ch + rows[1].glyphs[1].ch, '05', 'B «9:05»: minuti 0 e 5');
  rows = V.layoutRows('emery', 1, M.emery.barlow, '123:45').rows;
  eq(rows[0].total, 208, 'B barlow «123»: riserva, 208 px');
  eq(rows[0].ring_gap, null, 'B barlow «123»: griglia di riserva');
  eq(rows[0].x0, -4, 'B barlow «123»: x0 = (200 - 208) / 2 = -4');
  eq(rows[0].glyphs[0].x, -4, 'B barlow «123»: prima cella a -4');
  /* centratura troncata verso lo zero (cdiv) e clamp di A: metriche sintetiche con riserva DISPARI
   * (riempimento 65 + R 2 = 67 > 64): «123» = 3 * 67 + 16 = 217 px -> (200 - 217) / 2 = -8,5 -> -8 in B
   * (floor darebbe -9); in A «1234» = 268 px -> x0 negativo riportato a 0 */
  wide = { strip_h: 100, digit_h: 94, ring: 2, shadow: 2, cell_w: 64, glyphs: { '1': { w: 71 }, '2': { w: 71 }, '3': { w: 71 }, '4': { w: 71 } } };
  rows = V.layoutRows('emery', 1, wide, '123:45').rows;
  eq(rows[0].total + '/' + rows[0].ring_gap, '217/null', 'B sintetico «123»: riserva 67 -> 217 px');
  eq(rows[0].x0, -8, 'B sintetico «123»: x0 = -8 (troncato verso lo zero, non -9)');
  eq(rows[0].glyphs[2].x, -8 + 2 * (67 + 8), 'B sintetico «123»: terza cella');
  rows = V.layoutRows('emery', 0, { a: wide }, '1234').rows;
  eq(rows[0].total, 268, 'A sintetico «1234»: 268 px');
  eq(rows[0].x0, 0, 'A sintetico «1234»: x0 < 0 riportato a 0');
  rows = V.layoutRows('emery', 1, M.emery.anton, '1234').rows;
  eq(rows[0].glyphs.length, 4, 'B senza ":": tutte le cifre nelle ore');
  eq(rows[1].glyphs.length, 0, 'B senza ":": minuti vuoti');
  eq(rows[1].total, 0, 'B senza ":": riga vuota larga 0');
  /* layout A: al massimo 5 glifi, x0 mai negativo, caratteri non cifra = ':' */
  rows = V.layoutRows('emery', 0, M.emery.anton, '12:34:56').rows;
  eq(rows[0].glyphs.length, 5, 'A: al massimo MAX_GLYPHS');
  eq(V.layoutRows('emery', 0, M.emery.anton, '1.2').rows[0].glyphs[1].g, 10, "A: '.' -> glifo ':'");
  eq(V.layoutRows('emery', 0, M.emery.anton, '').rows[0].glyphs.length, 0, 'A: ora vuota');
  eq(V.layoutRows('emery', 0, M.emery.anton, '').rows[0].x0, 100, 'A: ora vuota centrata a 100');
  /* gx (ui_digits_draw): nucleo w - S centrato nel passo, troncato verso lo zero; glifo assente -> gx = x;
   * nucleo < 1 -> w. Metriche sintetiche: cella 40 in A, '1' w 27 -> nucleo 25 -> 8 + (40 - 25) / 2 = 15 */
  function gxOf(sz, t) { return V.layoutRows('emery', 0, sz, t).rows[0].glyphs[0]; }
  eq(gxOf({ ring: 2, shadow: 2, glyphs: { '1': { w: 27 } } }, '1').gx, 87, 'drawX: 80 + (40 - 25) / 2 = 87');
  eq(gxOf({ ring: 2, shadow: 2, glyphs: { '1': { w: 39 } } }, '1').gx, 81, 'drawX: (40 - 37) / 2 = 1 troncato');
  eq(gxOf({ ring: 2, shadow: 2, glyphs: { '1': { w: 43 } } }, '1').gx, 79, 'drawX: riempimento 37 -> passo 43, x0 78, nucleo 41: 78 + (43 - 41) / 2 = 79');
  eq(gxOf({ ring: 2, shadow: 2, glyphs: { '2': { w: 27 } } }, '1').gx, 80, 'drawX: glifo assente -> gx = x');
  eq(gxOf({ ring: 0, shadow: 5, glyphs: { '1': { w: 4 } } }, '1').gx, 98, 'drawX: nucleo < 1 -> w: 80 + (40 - 4) / 2 = 98');
  expectError(function () { V.layoutRows('emery', 0, null, '12:34'); }, 'layoutRows senza metriche');
  expectError(function () { V.layoutRows('emery', 1, { a: M.emery.anton.a }, '12:34'); }, 'layoutRows B senza la taglia B');
  expectError(function () { V.layoutRows(9, 0, M.emery.anton, '12:34'); }, 'layoutRows fmt sconosciuto');
}());

/* ---------------------------------------------------------------- 6. luma ---- */

(function () {
  var W = 200, H = 228, idx, r, i, x, y, n, bits;

  /* foto demo: le decisioni di resources/photos/README.md (fixture) su fascia A e B */
  fx.photos.forEach(function (p) {
    var raw = readPhoto(p.file), px;
    eq(raw.length, p.bytes, p.file + ': byte');
    eqHex(P.crc32(raw), p.crc, p.file + ': CRC32');
    px = (p.fmt === 'raw6') ? V.unpack6(raw, p.w, p.h) : V.unpack1(raw, p.w, p.h);
    p.bands.forEach(function (b) {
      var lm = (p.fmt === 'raw6') ? V.luma8(px, p.w, p.h, b.h) : V.luma1(px, p.w, p.h, b.h);
      var who = p.name + ' ' + p.platform + ' ' + b.layout;
      eq(lm.valid, true, who + ': valid');
      eq(lm.samples, b.samples, who + ': campioni');
      eq(lm.bad_white, b.bad_white, who + ': bad_white');
      eq(lm.bad_black, b.bad_black, who + ': bad_black');
      eq(lm.mean, b.mean, who + ': mean');
      eq(lm.white, b.white, who + ': bianco');
      eq(lm.bad_pct, b.bad_pct, who + ': bad_pct');
      eq(lm.halo, b.halo, who + ': contorno');
      /* la fascia come rettangolo esplicito da' lo stesso risultato */
      eq(JSON.stringify((p.fmt === 'raw6') ? V.luma8(px, p.w, p.h, { x: 0, y: 0, w: p.w, h: b.h })
                                           : V.luma1(px, p.w, p.h, { x: 0, y: 0, w: p.w, h: b.h })),
         JSON.stringify(lm), who + ': fascia come rettangolo');
    });
  });

  /* soglie esatte: Y 77 (indice 53) NON e' chiaro, Y 80 (10) si'; Y 25 (32) NON e' scuro, Y 14 (4) si' */
  eq(V.LUMA_SUN[53], 77, 'LUMA_SUN[53] = 77'); eq(V.LUMA_SUN[10], 80, 'LUMA_SUN[10] = 80');
  eq(V.LUMA_SUN[32], 25, 'LUMA_SUN[32] = 25'); eq(V.LUMA_SUN[4], 14, 'LUMA_SUN[4] = 14');
  idx = new Uint8Array(W * H);
  function fillAll(v) { for (i = 0; i < idx.length; i++) { idx[i] = v; } }
  fillAll(53); r = V.luma8(idx, W, H, 106);
  eq(r.samples, 5300, 'fascia A: 100 x 53 campioni');
  eq(r.bad_white + '/' + r.bad_black + '/' + r.mean, '0/0/77', 'tutto Y 77: nessun conflitto, media 77');
  eq(r.white, false, 'tutto Y 77: parita -> media 77 >= 46 -> nero');
  eq(r.halo, false, 'tutto Y 77: senza contorno');
  fillAll(10); r = V.luma8(idx, W, H, 106);
  eq(r.bad_white + '/' + r.bad_black + '/' + r.white, '100/0/false', 'tutto Y 80: ostile al bianco -> nero');
  eq(r.bad_pct, 0, 'tutto Y 80: bad_pct del nero = 0');
  fillAll(32); r = V.luma8(idx, W, H, 106);
  eq(r.bad_white + '/' + r.bad_black + '/' + r.mean + '/' + r.white, '0/0/25/true', 'tutto Y 25: parita, media 25 < 46 -> bianco');
  fillAll(4); r = V.luma8(idx, W, H, 106);
  eq(r.bad_white + '/' + r.bad_black + '/' + r.white + '/' + r.bad_pct, '0/100/true/0', 'tutto Y 14: ostile al nero -> bianco');
  /* bit alpha ignorati (& 0x3F): 0xFF = bianco 63 */
  fillAll(0xFF); r = V.luma8(idx, W, H, 106);
  eq(r.mean, 255, 'indice con bit alpha: & 0x3F');
  /* parita' con media ESATTAMENTE 46: 2.000 campioni a Y 42 (indice 21) e 3.300 a Y 49 (indice 7) ->
   * (84.000 + 161.700) / 5.300 = 46,36 -> 46 -> non < 46 -> nero (indice 37 = Y 42, indice 7 = Y 49) */
  eq(V.LUMA_SUN[37], 42, 'LUMA_SUN[37] = 42'); eq(V.LUMA_SUN[7], 49, 'LUMA_SUN[7] = 49');
  fillAll(7); n = 0;
  for (y = 0; y < 106 && n < 2000; y += 2) { for (x = 0; x < W && n < 2000; x += 2) { idx[y * W + x] = 37; n++; } }
  r = V.luma8(idx, W, H, 106);
  eq(r.mean, 46, 'media esattamente 46');
  eq(r.white, false, 'parita a media 46: nero (bianco solo se < 46)');
  /* campionamento 1 su 2: i pixel a x o y dispari NON contano (tutti bianchi 63 nelle posizioni dispari) */
  fillAll(0);
  for (y = 0; y < H; y++) { for (x = 0; x < W; x++) { if ((x & 1) || (y & 1)) { idx[y * W + x] = 63; } } }
  r = V.luma8(idx, W, H, 106);
  eq(r.bad_white + '/' + r.mean + '/' + r.samples, '0/0/5300', 'posizioni dispari ignorate');
  /* soglia del contorno: 15 % esatto -> no, 16 % -> si' (795 e 848 campioni chiari su 5.300) */
  function brightFirst(k) {
    fillAll(0); n = 0;
    for (y = 0; y < 106 && n < k; y += 2) { for (x = 0; x < W && n < k; x += 2) { idx[y * W + x] = 63; n++; } }
    return V.luma8(idx, W, H, 106);
  }
  r = brightFirst(795);
  eq(r.bad_white + '/' + r.white + '/' + r.bad_pct + '/' + r.halo, '15/true/15/false', '15 % di conflitto: senza contorno');
  r = brightFirst(848);
  eq(r.bad_white + '/' + r.white + '/' + r.bad_pct + '/' + r.halo, '16/true/16/true', '16 % di conflitto: contorno');
  /* percentuali troncate: 794 -> 14 */
  eq(brightFirst(794).bad_white, 14, '794 / 5300 -> 14 %');
  /* fascia: origine spostata, ritaglio all altezza del bitmap, fascia vuota */
  fillAll(0); idx[0] = 63;
  r = V.luma8(idx, W, H, { x: 2, y: 2, w: 10, h: 10 });
  eq(r.samples + '/' + r.bad_white, '25/0', 'fascia (2,2,10,10): 25 campioni, (0,0) fuori');
  r = V.luma8(idx, W, H, { x: 0, y: 0, w: 10, h: 10 });
  eq(r.bad_white, 4, 'fascia (0,0,10,10): 1 su 25 = 4 %');
  r = V.luma8(idx, W, H, 1000);
  eq(r.samples, 11400, 'altezza oltre il bitmap: ritagliata a 228');
  r = V.luma8(idx, W, H, 0);
  eq(r.valid + '/' + r.white + '/' + r.halo, 'false/true/false', 'fascia vuota: reset intatto, senza contorno');
  r = V.luma8(null, W, H, 106);
  eq(r.valid, false, 'dati assenti: valid false');
  eq(JSON.stringify(V.lumaReset()), JSON.stringify({ valid: false, white: true, halo: false, bad_pct: 0, bad_white: 0, bad_black: 0, mean: 0, samples: 0 }), 'lumaReset');
  /* parita' e vantaggio di 1 punto, sempre a freddo (nessuna isteresi: spec 1.2) */
  fillAll(0); n = 0;
  for (y = 0; y < 106 && n < 2650; y += 2) { for (x = 0; x < W && n < 2650; x += 2) { idx[y * W + x] = 63; n++; } }
  r = V.luma8(idx, W, H, 106);
  eq(r.bad_white + '/' + r.bad_black + '/' + r.white, '50/50/false', '50/50: parita, media 127 -> nero');
  idx[0] = 0;   /* 2649 chiari: 49 % vs 50 % -> bianco, anche con un solo punto di vantaggio */
  r = V.luma8(idx, W, H, 106);
  eq(r.bad_white + '/' + r.bad_black + '/' + r.white + '/' + r.bad_pct, '49/50/true/49', '49/50 a freddo: bianco, bad_pct 49');

  /* 1 bit: 50/50 -> parita, media 127 -> nero; contorno sempre; campionamento 1 su 2 */
  bits = new Uint8Array(144 * 168);
  r = V.luma1(bits, 144, 168, 76);
  eq(r.samples, 2736, 'flint fascia A: 72 x 38 campioni');
  eq(r.bad_white + '/' + r.bad_black + '/' + r.mean + '/' + r.white + '/' + r.halo, '0/100/0/true/true', 'tutto nero: bianco con contorno');
  n = 0;
  for (y = 0; y < 76 && n < 1368; y += 2) { for (x = 0; x < 144 && n < 1368; x += 2) { bits[y * 144 + x] = 1; n++; } }
  r = V.luma1(bits, 144, 168, 76);
  eq(r.bad_white + '/' + r.bad_black + '/' + r.mean + '/' + r.white, '50/50/127/false', 'flint 50/50: media 127 -> nero');
  for (y = 0; y < 168; y++) { for (x = 0; x < 144; x++) { if ((x & 1) || (y & 1)) { bits[y * 144 + x] = 1; } } }
  eq(V.luma1(bits, 144, 168, 76).bad_white, 50, 'flint: posizioni dispari ignorate');
  r = V.luma1(bits, 144, 168, 0);
  eq(r.valid + '/' + r.halo, 'false/true', 'flint fascia vuota: contorno comunque');
  eq(V.luma1(bits, 144, 168, 168).samples, 6048, 'flint fascia B: 72 x 84');
}());

/* ---------------------------------------------------------------- 7. palette (prv_apply_text_style, D21/D26) ---- */

(function () {
  var lumaW = { valid: true, white: true, bad_white: 20, bad_black: 80 };    /* bianco con conflitto > 15 */
  var lumaWok = { valid: true, white: true, bad_white: 15, bad_black: 80 };  /* bianco, conflitto 15: no */
  var lumaB = { valid: true, white: false, bad_white: 90, bad_black: 3 };    /* nero senza conflitto */
  var lumaBbad = { valid: true, white: false, bad_white: 90, bad_black: 16 };
  var none = V.lumaReset(), p;

  function pal(tc, ol, style, luma, plat, sun) {
    return V.palette({ text_color: tc, outline: ol, digit_style: style }, luma, plat, sun);
  }
  /* colore */
  p = pal(0, 0, 0, lumaW, 'emery');
  eq(p.fgIdx + '/' + p.bgIdx + '/' + p.light, '63/0/true', 'auto bianco');
  p = pal(0, 0, 0, lumaB, 'emery');
  eq(p.fgIdx + '/' + p.bgIdx + '/' + p.light, '0/63/false', 'auto nero');
  p = pal(0, 0, 0, none, 'emery');
  eq(p.fgIdx + '/' + p.light + '/' + p.halo, '63/true/false', 'auto senza luma: bianco senza contorno');
  p = pal(0, 0, 0, none, 'flint');
  eq(p.fgIdx + '/' + p.light + '/' + p.halo, '63/true/false', 'flint auto senza luma: bianco senza contorno');
  eq(pal(1, 0, 0, lumaB, 'emery').fgIdx, 63, 'bianco forzato');
  eq(pal(2, 0, 0, lumaW, 'emery').fgIdx, 0, 'nero forzato');
  p = pal(3, 0, 0, lumaB, 'emery');
  eq(p.fgIdx + '/' + p.bgIdx + '/' + p.light, '62/0/true', 'giallo pastello su emery');
  p = pal(3, 0, 0, lumaB, 'flint');
  eq(p.fgIdx + '/' + p.light, '63/true', 'giallo pastello su flint = bianco');
  p = pal(4, 0, 0, lumaW, 'emery');
  eq(p.fgIdx + '/' + p.bgIdx + '/' + p.light, '1/63/false', 'Oxford su emery');
  eq(pal(4, 0, 0, lumaW, 'flint').fgIdx, 0, 'Oxford su flint = nero');
  eqRgb(pal(3, 0, 0, lumaB, 'emery').fg, P.SUN_RGB[62], 'giallo: RGB sunlight');
  eqRgb(pal(3, 0, 0, lumaB, 'emery', false).fg, [255, 255, 170], 'giallo: RGB nominale (PAL_RGB[62])');
  eqRgb(pal(4, 0, 0, lumaW, 'emery').bg, [255, 255, 255], 'Oxford: alone bianco');
  /* alone */
  eq(pal(0, 0, 0, lumaW, 'emery').halo, true, 'auto emery: 20 % > 15 -> contorno');
  eq(pal(0, 0, 0, lumaWok, 'emery').halo, false, 'auto emery: 15 % -> niente');
  eq(pal(0, 0, 0, lumaB, 'emery').halo, false, 'auto emery nero: 3 % -> niente');
  eq(pal(0, 0, 0, lumaBbad, 'emery').halo, true, 'auto emery nero: 16 % -> contorno');
  eq(pal(1, 0, 0, lumaB, 'emery').halo, true, 'bianco forzato su foto chiara: bad_white 90 > 15 -> contorno');
  eq(pal(2, 0, 0, lumaW, 'emery').halo, true, 'nero forzato su foto scura: bad_black 80 > 15 -> contorno');
  eq(pal(4, 0, 0, lumaWok, 'emery').halo, true, 'Oxford (scuro): bad_black 80 -> contorno');
  eq(pal(0, 0, 0, lumaB, 'flint').halo, true, 'flint auto: sempre con luma valida');
  eq(pal(0, 2, 0, lumaW, 'flint').halo, false, 'flint mai');
  eq(pal(0, 1, 0, none, 'emery').halo, true, 'sempre');
  eq(pal(0, 2, 0, lumaW, 'emery').halo, false, 'mai');
  /* stile -> palette */
  p = pal(0, 0, 0, lumaW, 'emery');
  eq(p.fillIdx + '/' + p.ringIdx + '/' + p.shadowIdx, '63/0/null', 'pieno con alone: riempimento fg, anello bg');
  p = pal(0, 0, 0, lumaB, 'emery');
  eq(p.fillIdx + '/' + p.ringIdx + '/' + p.shadowIdx, '0/null/null', 'pieno senza alone: anello trasparente');
  p = pal(0, 0, 1, lumaB, 'emery');
  eq(p.fillIdx + '/' + p.ringIdx + '/' + p.shadowIdx, 'null/0/null', 'trasparente: riempimento clear, anello fg sempre');
  p = pal(0, 0, 2, lumaB, 'emery');
  eq(p.fillIdx + '/' + p.ringIdx + '/' + p.shadowIdx, 'null/0/63', 'trasparente 3D: ombra bg');
  p = pal(0, 0, 3, lumaW, 'emery');
  eq(p.fillIdx + '/' + p.ringIdx + '/' + p.shadowIdx, '63/0/0', 'pieno 3D con alone: ombra bg');
  p = pal(0, 2, 3, lumaW, 'emery');
  eq(p.fillIdx + '/' + p.ringIdx + '/' + p.shadowIdx, '63/null/0', 'pieno 3D senza alone: anello clear, ombra si');
  p = pal(0, 0, 2, lumaB, 'flint');
  eq(p.fillIdx + '/' + p.ringIdx + '/' + p.shadowIdx, 'null/0/null', 'flint trasparente 3D = trasparente (D26)');
  p = pal(0, 0, 3, lumaW, 'flint');
  eq(p.fillIdx + '/' + p.ringIdx + '/' + p.shadowIdx, '63/0/null', 'flint pieno 3D = pieno');
  eqRgb(p.fill, [255, 255, 255], 'flint pieno 3D: fill RGB bianco');
  eq(pal(0, 0, 1, lumaB, 'emery').fill, null, 'trasparente: fill RGB null');
  eqRgb(pal(0, 0, 1, lumaB, 'emery').ring, [0, 0, 0], 'trasparente: ring RGB nero');
  eqRgb(pal(0, 0, 2, lumaB, 'emery').shadow, [255, 255, 255], '3D: shadow RGB bianco');
  eq(V.palette(null, null, 'emery').fgIdx, 63, 'palette senza impostazioni ne luma: bianco');
}());

/* ---------------------------------------------------------------- 8. render ---- */

(function () {
  var raw1 = readPhoto('demo_1.raw6'), raw2 = readPhoto('demo_2.raw6'), rawf1 = readPhoto('demo_1.raw1'), rawf2 = readPhoto('demo_2.raw1');
  var idx1 = V.unpack6(raw1, 200, 228), bitsf2 = V.unpack1(rawf2, 144, 168);
  var base = { fmt: 1, w: 200, h: 228, raw: raw1, masks: M, time: '12:34', sunlight: true, scale: 2 };
  var st0 = { layout: 0, font: 0, digit_style: 0, text_color: 0, outline: 0, clock_mode: 0 };
  var r, c, size, map, pos, fxA = fx.cases[0], gl2 = fxA.rows[0].glyphs[1], x, y, o, ok, i, photo;

  function opts(over, s) {
    var k, out = {};
    for (k in base) { if (Object.prototype.hasOwnProperty.call(base, k)) { out[k] = base[k]; } }
    for (k in over) { if (Object.prototype.hasOwnProperty.call(over, k)) { out[k] = over[k]; } }
    out.settings = s || st0;
    return out;
  }
  function settings(over) {
    var k, out = {};
    for (k in st0) { if (Object.prototype.hasOwnProperty.call(st0, k)) { out[k] = st0[k]; } }
    for (k in over) { if (Object.prototype.hasOwnProperty.call(over, k)) { out[k] = over[k]; } }
    return out;
  }

  /* demo_1, anton, layout A, tutto auto: bianco senza contorno (fixture photos[0].bands[0]) */
  r = V.render(opts({}));
  eq(r.width + 'x' + r.height, '400x456', 'render emery x2: 400x456');
  eq(r.rgba.length, 400 * 456 * 4, 'render: RGBA');
  eq(r.drawn, true, 'render: cifre disegnate');
  eq(r.notes.join(','), '', 'render: nessuna avvertenza');
  eq(r.lumaH, 106, 'render: fascia di luma A');
  photo = fx.photos[0].bands[0];
  eq(r.luma.valid + '/' + r.luma.white + '/' + r.luma.bad_white + '/' + r.luma.bad_black + '/' + r.luma.mean + '/' + r.luma.halo,
     'true/' + photo.white + '/' + photo.bad_white + '/' + photo.bad_black + '/' + photo.mean + '/' + photo.halo, 'render: luma = fixture demo_1 A');
  eq(r.pal.light + '/' + r.pal.halo + '/' + r.pal.fgIdx, 'true/false/63', 'render: palette auto bianco senza contorno');
  eq(r.rows.length, 1, 'render A: una riga');
  eq(JSON.stringify(r.rows[0].glyphs.map(function (g) { return [g.ch, g.x, g.adv, g.gx]; })),
     JSON.stringify(fxA.rows[0].glyphs.map(function (g) { return [g.ch, g.x, g.adv, g.gx]; })), 'render A: posizioni = fixture');
  /* pixel: un riempimento del '2' e' bianco (SUN 63), replicato 2x2; un anello (contorno spento) lascia la foto */
  size = M.emery.anton.a;
  map = V.glyphMap(size.glyphs['2'], size.ring, size.shadow, size.strip_h);
  pos = findIdx(map, gl2.w, 1);
  x = gl2.gx + pos.x; y = fxA.rows[0].y + pos.y;
  eqRgb(pixelAt(r, x, y, 2), [255, 255, 255], 'render: riempimento bianco');
  o = ((y * 2 + 1) * 400 + x * 2 + 1) * 4;
  eq(r.rgba[o] + '/' + r.rgba[o + 1] + '/' + r.rgba[o + 2] + '/' + r.rgba[o + 3], '255/255/255/255', 'render: blocco 2x2 replicato, alpha 255');
  pos = findIdx(map, gl2.w, 2);
  x = gl2.gx + pos.x; y = fxA.rows[0].y + pos.y;
  eqRgb(pixelAt(r, x, y, 2), P.SUN_RGB[idx1[y * 200 + x]], 'render: anello trasparente = foto');
  /* sfondo lontano dalle cifre = foto come sul vetro; con sunlight false = nominale */
  eqRgb(pixelAt(r, 3, 220, 2), P.SUN_RGB[idx1[220 * 200 + 3]], 'render: sfondo SUN_RGB');
  eqRgb(pixelAt(V.render(opts({ sunlight: false })), 3, 220, 2), P.PAL_RGB[idx1[220 * 200 + 3]], 'render: sfondo PAL_RGB');
  eqRgb(pixelAt(V.render(opts({ scale: 1 })), 3, 220, 1), P.SUN_RGB[idx1[220 * 200 + 3]], 'render x1');
  eq(V.render(opts({ scale: 1 })).width, 200, 'render x1: 200');
  eq(V.render(opts({ scale: 0 })).width, 200, 'render scala 0 -> 1');
  /* contorno sempre: l'anello prende il colore opposto (nero) */
  r = V.render(opts({}, settings({ outline: 1 })));
  eqRgb(pixelAt(r, x, y, 2), [0, 0, 0], 'render: anello nero con contorno sempre');
  eq(r.pal.halo, true, 'render: halo');
  /* stile trasparente: il riempimento lascia la foto, l'anello e' bianco */
  r = V.render(opts({}, settings({ digit_style: 1 })));
  pos = findIdx(map, gl2.w, 1);
  eqRgb(pixelAt(r, gl2.gx + pos.x, fxA.rows[0].y + pos.y, 2), P.SUN_RGB[idx1[(fxA.rows[0].y + pos.y) * 200 + gl2.gx + pos.x]], 'render trasparente: riempimento = foto');
  pos = findIdx(map, gl2.w, 2);
  eqRgb(pixelAt(r, gl2.gx + pos.x, fxA.rows[0].y + pos.y, 2), [255, 255, 255], 'render trasparente: anello bianco');
  /* 3D pieno: l'ombra e' nera (colore opposto) */
  r = V.render(opts({}, settings({ digit_style: 3 })));
  pos = findIdx(map, gl2.w, 3);
  eqRgb(pixelAt(r, gl2.gx + pos.x, fxA.rows[0].y + pos.y, 2), [0, 0, 0], 'render pieno 3D: ombra nera');
  r = V.render(opts({}, settings({ digit_style: 0 })));
  eqRgb(pixelAt(r, gl2.gx + pos.x, fxA.rows[0].y + pos.y, 2), P.SUN_RGB[idx1[(fxA.rows[0].y + pos.y) * 200 + gl2.gx + pos.x]], 'render pieno: senza ombra');
  /* demo_2: nero automatico, senza contorno (bad_black 0) */
  r = V.render(opts({ raw: raw2 }));
  eq(r.pal.light + '/' + r.pal.halo + '/' + r.luma.bad_white, 'false/false/95', 'render demo_2: nero senza contorno');
  pos = findIdx(map, gl2.w, 1);
  eqRgb(pixelAt(r, gl2.gx + pos.x, fxA.rows[0].y + pos.y, 2), [0, 0, 0], 'render demo_2: riempimento nero');
  /* LECO in A: foto sola, identica a previewRgba */
  r = V.render(opts({}, settings({ font: 3 })));
  eq(r.drawn + '/' + r.notes.join(','), 'false/leco', 'render LECO: niente cifre');
  eq(r.rows, null, 'render LECO: rows null');
  eqBytes(r.rgba, P.previewRgba(idx1, 200, 228, true, 2), 'render LECO: rgba = foto');
  r = V.render(opts({}, settings({ font: 9 })));
  eq(r.drawn + '/' + r.notes.join(','), 'false/leco', 'render font ignoto: come LECO');
  /* LECO in B: l'orologio usa Anton (prv_load_strips) */
  r = V.render(opts({}, settings({ font: 3, layout: 1 })));
  eq(r.drawn + '/' + r.notes.join(','), 'true/', 'render LECO in B: Anton');
  eq(JSON.stringify(r.rows.map(function (rw) { return rw.y; })), JSON.stringify(fx.cases[1].rows.map(function (rw) { return rw.y; })), 'render LECO in B: righe di Anton B');
  /* layout B: due righe, fascia intera, luma della fixture band B */
  r = V.render(opts({}, settings({ layout: 1, font: 4 })));
  c = fx.cases[7];   /* emery francois B */
  eq(c.font + c.layout, 'francoisB', 'fixture[7] = francois B');
  eq(r.lumaH, 228, 'render B: fascia intera');
  eq(r.rows.length, 2, 'render B: due righe');
  eq(JSON.stringify(r.rows.map(function (rw) { return [rw.y, rw.x0, rw.total]; })),
     JSON.stringify(c.rows.map(function (rw) { return [rw.y, rw.x0, rw.total]; })), 'render B francois: righe = fixture');
  photo = fx.photos[0].bands[1];
  eq(r.luma.bad_white + '/' + r.luma.bad_black + '/' + r.luma.mean, photo.bad_white + '/' + photo.bad_black + '/' + photo.mean, 'render B: luma demo_1 B');
  /* 12 h: avvertenza AM/PM (le celle restano quelle delle 24 h) */
  r = V.render(opts({}, settings({ clock_mode: 1 })));
  eq(r.notes.join(','), 'ampm', 'render 12 h: avvertenza');
  eq(r.rows[0].glyphs[0].adv, 41, 'render 12 h: celle 24 h');
  /* senza foto: grigio 21, luma non valida, bianco senza contorno */
  r = V.render(opts({ raw: null }));
  eq(r.notes.join(','), 'no_photo', 'render senza foto: avvertenza');
  eq(r.luma.valid + '/' + r.pal.light + '/' + r.pal.halo, 'false/true/false', 'render senza foto: bianco senza contorno');
  eqRgb(pixelAt(r, 3, 220, 2), P.SUN_RGB[21], 'render senza foto: grigio 21 sunlight');
  eqRgb(pixelAt(V.render(opts({ raw: null, sunlight: false })), 3, 220, 2), [85, 85, 85], 'render senza foto: grigio nominale');
  eq(r.drawn, true, 'render senza foto: cifre comunque');
  pos = findIdx(map, gl2.w, 1);
  eqRgb(pixelAt(r, gl2.gx + pos.x, fxA.rows[0].y + pos.y, 2), [255, 255, 255], 'render senza foto: riempimento bianco');
  r = V.render(opts({ raw: new Uint8Array(0) }));
  eq(r.notes.join(','), 'no_photo', 'render raw vuoto = senza foto');
  r = V.render(opts({ raw: null }, settings({ text_color: 2, outline: 0 })));
  eq(r.pal.light + '/' + r.pal.halo, 'false/false', 'render senza foto, nero forzato: senza contorno (luma non valida)');
  /* maschere assenti / font mancante / piattaforma mancante */
  r = V.render(opts({ masks: null }));
  eq(r.drawn + '/' + r.notes.join(','), 'false/no_masks', 'render masks null');
  eqBytes(r.rgba, P.previewRgba(idx1, 200, 228, true, 2), 'render masks null: rgba = foto');
  r = V.render(opts({ masks: { v: 1, emery: { bebas: M.emery.bebas } } }, settings({ font: 0 })));
  eq(r.notes.join(','), 'no_masks', 'render font senza voce');
  r = V.render(opts({ masks: { v: 1, flint: M.flint } }));
  eq(r.notes.join(','), 'no_masks', 'render piattaforma senza voce');
  r = V.render(opts({ masks: { v: 1, emery: { anton: { a: { strip_h: 72, ring: 2, shadow: 2 } } } } }));
  eq(r.notes.join(','), 'no_masks', 'render taglia senza glyphs');
  /* maschere ridotte come le manda il PKJS (solo i glifi dell'ora, larghezze delle altre cifre): stesse posizioni */
  (function () {
    var red = { v: 1, emery: {} }, f, s, k, sz;
    for (f in M.emery) {
      if (!Object.prototype.hasOwnProperty.call(M.emery, f)) { continue; }
      red.emery[f] = {};
      for (s in M.emery[f]) {
        if (!Object.prototype.hasOwnProperty.call(M.emery[f], s)) { continue; }
        sz = M.emery[f][s];
        red.emery[f][s] = { strip_h: sz.strip_h, digit_h: sz.digit_h, ring: sz.ring, shadow: sz.shadow, cell_w: sz.cell_w, glyphs: {} };
        for (k in sz.glyphs) {
          if (!Object.prototype.hasOwnProperty.call(sz.glyphs, k)) { continue; }
          red.emery[f][s].glyphs[k] = ('1234:'.indexOf(k) >= 0) ? sz.glyphs[k] : { w: sz.glyphs[k].w };
        }
      }
    }
    var a = V.render(opts({ masks: red }, settings({ font: 5, layout: 1 })));
    var b = V.render(opts({}, settings({ font: 5, layout: 1 })));
    eq(a.drawn, true, 'render maschere ridotte: disegnate');
    eq(JSON.stringify(a.rows), JSON.stringify(b.rows), 'render maschere ridotte: posizioni = complete');
    eqBytes(a.rgba, b.rgba, 'render maschere ridotte: pixel identici');
    /* un glifo con il solo w non viene disegnato ma tiene il posto */
    a = V.render(opts({ masks: red, time: '15:34' }, settings({ font: 5 })));
    eq(a.rows[0].glyphs[1].ch, '5', 'render «15:34»: il 5 e in riga');
    eq(a.rows[0].glyphs[1].w, M.emery.staatliches.a.glyphs['5'].w, 'render «15:34»: il 5 ha la sua larghezza');
    map = V.glyphMap(M.emery.staatliches.a.glyphs['5'], 2, 2, 72);
    pos = findIdx(map, M.emery.staatliches.a.glyphs['5'].w, 1);
    x = a.rows[0].glyphs[1].gx + pos.x; y = a.rows[0].y + pos.y;
    eqRgb(pixelAt(a, x, y, 2), P.SUN_RGB[idx1[y * 200 + x]], 'render «15:34» ridotto: il 5 senza bits non viene disegnato');
  }());
  /* raw di lunghezza sbagliata: errore (la pagina lo cattura) */
  expectError(function () { V.render(opts({ raw: new Uint8Array(100) })); }, 'render raw6 corto');
  expectError(function () { V.render(opts({ fmt: 2, w: 144, h: 168, raw: new Uint8Array(100) })); }, 'render raw1 corto');
  /* flint: demo_2 B, staatliches trasparente: nero automatico con contorno (sempre), 288x336 */
  r = V.render(opts({ fmt: 2, w: 144, h: 168, raw: rawf2 }, settings({ font: 5, layout: 1, digit_style: 2 })));
  c = fx.cases[19];
  eq(c.platform + c.font + c.layout, 'flintstaatlichesB', 'fixture[19] = flint staatliches B');
  eq(r.width + 'x' + r.height, '288x336', 'render flint x2');
  photo = fx.photos[3].bands[1];
  eq(r.luma.white + '/' + r.luma.bad_white + '/' + r.luma.bad_black + '/' + r.luma.mean + '/' + r.luma.halo,
     photo.white + '/' + photo.bad_white + '/' + photo.bad_black + '/' + photo.mean + '/' + photo.halo, 'render flint: luma demo_2 B');
  eq(r.pal.light + '/' + r.pal.halo + '/' + r.pal.shadowIdx + '/' + r.pal.fillIdx + '/' + r.pal.ringIdx, 'false/true/null/null/0', 'render flint trasparente 3D: anello nero, niente ombra');
  eq(JSON.stringify(r.rows.map(function (rw) { return [rw.y, rw.x0, rw.total]; })),
     JSON.stringify(c.rows.map(function (rw) { return [rw.y, rw.x0, rw.total]; })), 'render flint B: righe = fixture');
  size = M.flint.staatliches.b;
  map = V.glyphMap(size.glyphs['3'], size.ring, size.shadow, size.strip_h);
  pos = findIdx(map, size.glyphs['3'].w, 2);
  x = c.rows[1].glyphs[0].gx + pos.x; y = c.rows[1].y + pos.y;
  eqRgb(pixelAt(r, x, y, 2), [0, 0, 0], 'render flint: anello nero');
  pos = findIdx(map, size.glyphs['3'].w, 1);
  x = c.rows[1].glyphs[0].gx + pos.x; y = c.rows[1].y + pos.y;
  eqRgb(pixelAt(r, x, y, 2), bitsf2[y * 144 + x] ? [255, 255, 255] : [0, 0, 0], 'render flint trasparente: riempimento = foto');
  eqRgb(pixelAt(r, 2, 160, 2), bitsf2[160 * 144 + 2] ? [255, 255, 255] : [0, 0, 0], 'render flint: sfondo 1 bit');
  r = V.render(opts({ fmt: 2, w: 144, h: 168, raw: rawf1 }, settings({ font: 3 })));
  eq(r.drawn + '/' + r.notes.join(','), 'false/leco', 'render flint LECO');
  eqBytes(r.rgba, P.preview1Rgba(V.unpack1(rawf1, 144, 168), 144, 168, 2), 'render flint LECO: rgba = foto');
  r = V.render(opts({ fmt: 2, w: 144, h: 168, raw: null }, settings({ font: 0 })));
  eq(r.notes.join(','), 'no_photo', 'render flint senza foto');
  eqRgb(pixelAt(r, 2, 160, 2), P.SUN_RGB[21], 'render flint senza foto: grigio');
  /* ritaglio ai bordi: una riga piu' larga dello schermo non fa uscire il blit dall RGBA */
  ok = true;
  r = V.render(opts({ time: '123:45' }, settings({ font: 2, layout: 1 })));
  eq(r.rows[0].x0, -4, 'render «123:45» barlow B: x0 -4 (riserva)');
  for (i = 3; i < r.rgba.length; i += 4) { if (r.rgba[i] !== 255) { ok = false; break; } }
  eq(ok, true, 'render «123:45»: alpha 255 ovunque (nessuna scrittura fuori)');
  eq(r.rgba.length, 400 * 456 * 4, 'render «123:45»: RGBA della dimensione giusta');
  /* w/h assenti: quelli della piattaforma */
  eq(V.render({ fmt: 2, raw: rawf1, settings: st0, masks: M }).width, 144, 'render senza w/h: 144');
  eq(V.render({ fmt: 1, raw: null, settings: null, masks: M }).width, 200, 'render senza impostazioni');
}());

/* ---------------------------------------------------------------- esito ---- */

console.log('test_preview: ' + g_pass + ' ok, ' + g_fail + ' fail' + (process.env.GAL_PREVIEW ? ' (modulo: ' + PREV + ')' : ''));
process.exit(g_fail ? 1 : 0);

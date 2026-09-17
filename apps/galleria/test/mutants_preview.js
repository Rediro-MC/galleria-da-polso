#!/usr/bin/env node
/* mutants_preview.js - mutation testing di src/pkjs/config/preview.js (S12/D48; revisione S12, rv).
 *
 * D48 chiede che almeno 6 mutanti "a mano" del porting JS (passo D25 senza -2R-S, anello senza
 * dilatazione diagonale, ombra dal solo riempimento, LUMA_SUN spostata, soglia 77 -> 78,
 * campionamento 1 su 1) rendano ROSSO test/test_preview.js. Qui ce ne sono di piu': ogni mutante e'
 * una sostituzione testuale applicata a una COPIA di preview.js scritta in test/build/
 * (preview_mut<N>.js), e test_preview.js viene eseguito con GAL_PREVIEW=copia (la copia trova
 * GalPipeline nel globale: non le serve pipeline.js accanto). Un mutante che sopravvive = un buco
 * nei test: il runner esce con 1 (2 se un pattern non si trova piu' nel sorgente: il mutante va
 * riscritto, non tolto). Le copie dei mutanti uccisi vengono cancellate; quelle dei sopravvissuti
 * restano in test/build/ per il debug (`make -C test clean` le toglie).
 *
 * Uso: `make -C test mutants` (fuori da `all`, come browsertest: ~6 s) oppure
 *      `node test/mutants_preview.js` da qualunque cwd; GAL_MUT_OUT=DIR cambia la cartella delle copie.
 * Mutanti EQUIVALENTI conosciuti e volutamente assenti (sopravviverebbero): `pad = R` in glyphMap
 * (con S <= R lo scorrimento che esce dall'area va comunque fuori casella: stesso ritaglio). */

var fs = require('fs'), path = require('path'), cp = require('child_process');
var APP = path.join(__dirname, '..');
var SRC = path.join(APP, 'src', 'pkjs', 'config', 'preview.js');
var TEST = path.join(__dirname, 'test_preview.js');
var OUT = process.env.GAL_MUT_OUT ? path.resolve(process.env.GAL_MUT_OUT) : path.join(__dirname, 'build');
var src = fs.readFileSync(SRC, 'utf8');

/* [nome, testo da cercare, testo sostitutivo, occorrenze attese (default 1)] */
var MUT = [
  /* --- i 6 di D48 --- */
  ['passo D25 senza -2R-S (riempimento = inchiostro)', "f = w - 2 * (sz.ring | 0) - (sz.shadow | 0);", "f = w;"],
  ['anello senza dilatazione diagonale (Manhattan invece di Chebyshev)', "for (dx = -R; dx <= R; dx++) { q = p + dy * W + dx; if (st[q] === 0) { st[q] = 2; } }", "for (dx = -R; dx <= R; dx++) { q = p + dy * W + dx; if (Math.abs(dx) + Math.abs(dy) <= R && st[q] === 0) { st[q] = 2; } }"],
  ['ombra dal solo riempimento (non riempimento u anello)', "if ((st[p] === 1 || st[p] === 2) && st[q] === 0) { st[q] = 3; }", "if (st[p] === 1 && st[q] === 0) { st[q] = 3; }"],
  ['LUMA_SUN spostata di un indice', "l = LUMA_SUN[idx[y * w + x] & 63];", "l = LUMA_SUN[(idx[y * w + x] + 1) & 63];"],
  ['soglia bianco 77 -> 78 (equivalente sulla tabella: muore solo per il pin)', "var Y_WHITE = 77,", "var Y_WHITE = 78,"],
  ['campionamento 1 su 1 in x (luma8 e luma1)', "for (x = b.x; x < b.x + b.w; x += 2) {", "for (x = b.x; x < b.x + b.w; x += 1) {", 2],
  /* --- anello / ombra --- */
  ['anello di raggio R-1', "for (dy = -R; dy <= R; dy++) {", "for (dy = -R + 1; dy <= R - 1; dy++) {"],
  ['ombra di profondita S-1', "for (k = 1; k <= (S | 0); k++) {", "for (k = 1; k < (S | 0); k++) {"],
  ['ombra 3D anche su flint (D26 ignorata)', "sd = (style === 2 || style === 3) && !bw ? bg : null;", "sd = (style === 2 || style === 3) ? bg : null;"],
  /* --- luma --- */
  ['soglia bianco 77 -> 76 (Y 77 diventa ostile)', "var Y_WHITE = 77,", "var Y_WHITE = 76,"],
  ['soglia nero 25 -> 26 (Y 25 diventa ostile)', "Y_BLACK = 25,", "Y_BLACK = 26,"],
  ['crossover 46 -> 47', "Y_CROSS = 46,", "Y_CROSS = 47,"],
  ['campionamento 1 su 1 in y (luma8 e luma1)', "for (y = b.y; y < b.y + b.h; y += 2) {", "for (y = b.y; y < b.y + b.h; y += 1) {", 2],
  ['contorno con >= 15 invece di > 15', "r.halo = r.bad_pct > HALO_PCT;", "r.halo = r.bad_pct >= HALO_PCT;"],
  ['parita: bianco se media <= 46', "(m < Y_CROSS)", "(m <= Y_CROSS)"],
  ['fascia di luma in A +3 invece di +2 (layoutRows e render)', "L.info_y + L.info_h + 2", "L.info_y + L.info_h + 3", 2],
  ['contorno auto su flint come su emery', "(bw || (light ? lm.bad_white : lm.bad_black) > HALO_PCT)", "((light ? lm.bad_white : lm.bad_black) > HALO_PCT)"],
  /* --- griglia e posizioni --- */
  ['FIT_MARGIN 2 -> 3', "FIT_MARGIN = 2,", "FIT_MARGIN = 3,"],
  ['griglia di riserva senza + R', "return gap >= 0 ? v + 2 * R + gap : v + R;", "return gap >= 0 ? v + 2 * R + gap : v;"],
  ['gx senza nucleo (centra l inchiostro intero, ombra compresa)', "c = w - (sz.shadow | 0);", "c = w;"],
  ['centratura con floor invece del troncamento del C', "return (a / b) | 0;", "return Math.floor(a / b);"],
  ['clamp di x0 in A rimosso', "      if (x0 < 0) { x0 = 0; }\n", ""],
  ['griglia sul massimo delle cifre presenti nell ora invece delle 10', "for (g = 0; g < 10; g++) { f = fillWidth(sz, g);", "for (g = 1; g < 5; g++) { f = fillWidth(sz, g);"],
  ['glifo con il solo w escluso dalla griglia', "return (e && e.w > 0) ? e.w | 0 : 0;", "return (e && e.w > 0 && typeof e.bits === 'string') ? e.w | 0 : 0;"],
  ['ore fino al primo : ignorato (tutta la stringa nelle ore)', "if (n < 0) { n = s.length; }", "n = s.length;"],
  ['LECO in B non ripiega su Anton', "if (!fk && B) { fk = FONT_KEYS[0]; }", ""],
  /* --- palette e blit --- */
  ['giallo pastello su flint non riportato a bianco', "3: [62, 63, 1]", "3: [62, 62, 1]"],
  ['blit: GColorClear del riempimento disegnato come nero', "c = v === 1 ? pal.fill : v === 2 ? pal.ring : v === 3 ? pal.shadow : null;", "c = v === 1 ? (pal.fill || [0, 0, 0]) : v === 2 ? pal.ring : v === 3 ? pal.shadow : null;"],
  /* --- foto --- */
  ['unpack6 con a = b0 & 63', "out[i] = a >> 2;", "out[i] = a & 63;"],
  ['unpack1 LSB-first', "(raw[r + (x >> 3)] >> (7 - (x & 7))) & 1", "(raw[r + (x >> 3)] >> (x & 7)) & 1"],
  ['unpack6 senza la guardia su raw assente (TypeError su raw.length)', "(raw ? ((raw.length / 3) | 0) * 4 : 0)", "((raw.length / 3) | 0) * 4"]
];

if (!fs.existsSync(OUT)) { fs.mkdirSync(OUT, { recursive: true }); }
var killed = 0, survived = [];
MUT.forEach(function (m, i) {
  var name = m[0], from = m[1], to = m[2], times = m[3] || 1, n = src.split(from).length - 1, mut, file, res, line;
  if (n !== times) {
    console.log('ERRORE mutante ' + (i + 1) + ' (' + name + '): pattern trovato ' + n + ' volte, attese ' + times);
    process.exit(2);
  }
  mut = src.split(from).join(to);
  if (mut === src) { console.log('ERRORE mutante ' + (i + 1) + ' (' + name + '): sorgente invariato'); process.exit(2); }
  file = path.join(OUT, 'preview_mut' + (i + 1) + '.js');
  fs.writeFileSync(file, mut);
  res = cp.spawnSync(process.execPath, [TEST], { env: Object.assign({}, process.env, { GAL_PREVIEW: file }), encoding: 'utf8' });
  line = ((res.stdout || '').trim().split('\n').pop() || '').replace(/ \(modulo.*$/, '');
  if (res.status !== 0) {
    killed++;
    console.log('UCCISO        ' + (i + 1) + '. ' + name + '  [' + (line || ('exit ' + res.status)) + ']');
    fs.unlinkSync(file);
  } else {
    survived.push(name);
    console.log('SOPRAVVISSUTO ' + (i + 1) + '. ' + name + '  (copia: ' + file + ')');
  }
});
console.log('mutants_preview: ' + MUT.length + ' mutanti, ' + killed + ' uccisi, ' + survived.length + ' sopravvissuti');
process.exit(survived.length ? 1 : 0);

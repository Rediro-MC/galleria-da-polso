/* preview.js - Galleria S12 (D46/D48): motore PURO dell'anteprima "onesta" della watchface nella
 * config page (niente DOM, niente localStorage). Porting riga per riga del C dell'orologio:
 *   ui_time.c   prv_compute_layout (costanti), prv_grid_steps, prv_place_row, prv_place_row_fit,
 *               prv_shift_row, prv_layout_time (MODE_A_SPRITE / MODE_B_SPRITE, celle 24 h),
 *               prv_pick_mode (fascia di luma), prv_apply_text_style (colore, alone, palette D21/D26);
 *   ui_digits.c ui_digits_fill_width (riempimento = inchiostro - 2R - S, minimo 1), ui_digits_draw
 *               (nucleo = w - S centrato nel passo, ombra che sporge a destra);
 *   luma.c      LUMA_SUN, luma_compute_8bit / luma_compute_1bit, prv_decide SENZA isteresi
 *               (decisione a freddo: campionamento 1 px su 2 dall'origine della fascia, soglie
 *               77 / 25 / 46, contorno >= 15 %, D140).
 * Le cifre arrivano come maschere a 1 bit del solo riempimento (state.masks, D45: digit_masks.js
 * filtrato dal PKJS: un glifo con il solo w conta per la griglia e non viene disegnato); anello e
 * ombra si ricostruiscono con la regola di D20 (glyphMap). Le foto sono i raw6/raw1 della pagina
 * (unpack6/unpack1 = inversi di GalPipeline.pack6/pack1). Divisioni del C troncate verso lo zero
 * ("| 0"). ES5 + typed array, UMD come pipeline.js; viene inlinato in una stringa: niente backtick.
 * Il file pesa nel budget della pagina (D43): commenti SOLO su righe intere (l'inliner le toglie),
 * locali corti come in pipeline.js. Riferimento dei test: test/test_preview.js +
 * test/fixture_preview.js (posizioni, CRC delle mappe, luma delle foto demo). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(typeof GalPipeline !== 'undefined' ? GalPipeline : require('./pipeline'));
  } else {
    root.GalPreview = factory(root.GalPipeline);
  }
}(this, function (P) {
  'use strict';

  /* costanti di ui_time.c:prv_compute_layout (content size normale, D46) */
  var LAYOUT = {
    emery: { w: 200, h: 228, a_fill_y: 9, a_cell: 40, a_colon: 16, b_hh_fill_y: 13, b_mm_fill_y: 121, b_cell: 64, b_gap: 8, info_y: 82, info_h: 22 },
    flint: { w: 144, h: 168, a_fill_y: 7, a_cell: 28, a_colon: 12, b_hh_fill_y: 13, b_mm_fill_y: 93, b_cell: 48, b_gap: 8, info_y: 56, info_h: 18 }
  };
  /* fmt accettati: 1|2 (state.fmt), 'raw6'|'raw1', nome della piattaforma */
  var PLAT = { 1: 'emery', 2: 'flint', raw6: 'emery', raw1: 'flint', emery: 'emery', flint: 'flint' };
  /* prv_place_row_fit: spazio fra gli anelli provato in ordine (-1 = riserva), px liberi per lato, "HH:MM" */
  var RING_GAPS = [2, 1, 0, -1], FIT_MARGIN = 2, MAX_GLYPHS = 5, COLON = 10;
  /* luma.c: Y lineare WCAG x 255 della resa "sunlight" dei 64 colori, indice = GColor8 & 0x3F */
  var LUMA_SUN = [
    0, 3, 15, 36, 14, 18, 28, 49, 65, 69, 80, 100, 160, 165, 175, 195,
    5, 8, 19, 39, 20, 23, 34, 54, 71, 74, 85, 105, 167, 170, 181, 201,
    25, 28, 39, 59, 39, 42, 53, 73, 90, 94, 104, 125, 185, 189, 201, 219,
    60, 62, 74, 94, 74, 77, 87, 108, 125, 129, 140, 160, 218, 223, 234, 255
  ];
  /* luma.h: Y > 77 ostile al bianco, Y < 25 ostile al nero, parita' -> bianco se Y medio < 46, contorno >= 15 % (D140) */
  var Y_WHITE = 77, Y_BLACK = 25, Y_CROSS = 46, HALO_PCT = 15;
  /* impostazione font -> chiave di digit_masks.js (= gal_font_strip; LECO = 3 nessuna strip) */
  var FONT_KEYS = ['anton', 'bebas', 'barlow', null, 'francois', 'staatliches'];
  /* text_color forzato -> [indice emery, indice flint, chiaro]: bianco GColorWhite 63, nero GColorBlack 0,
   * giallo GColorPastelYellow 62 (flint: bianco), Oxford GColorOxfordBlue 1 (flint: nero); 0 = automatico (luma) */
  var FG = { 1: [63, 63, 1], 2: [0, 0, 0], 3: [62, 63, 1], 4: [1, 0, 0] };
  /* sfondo senza foto (D46): grigio neutro; alfabeto base64url di b64.js */
  var GREY = 21, B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  /* divisione del C su int16_t: troncamento verso lo zero (ui_time.c / ui_digits.c centrano con "/ 2") */
  function cdiv(a, b) { return (a / b) | 0; }

  function platformOf(f) {
    var p = PLAT[f];
    if (!p) { throw new Error('fmt ' + f); }
    return p;
  }

  /* base64url senza padding -> Uint8Array */
  function b64urlDecode(s) {
    var n = s.length, out, i, v, acc = 0, nb = 0, o = 0;
    if ((n & 3) === 1) { throw new Error('b64 ' + n); }
    out = new Uint8Array((n * 6) >> 3);
    for (i = 0; i < n; i++) {
      v = B64.indexOf(s.charAt(i));
      if (v < 0) { throw new Error('b64 ' + i); }
      acc = ((acc << 6) | v) & 0xFFFF;
      nb += 6;
      if (nb >= 8) { nb -= 8; out[o++] = (acc >> nb) & 255; }
    }
    return out;
  }

  /* unpack6: 3 B -> 4 indici (a = b0>>2, b = (b0&3)<<4 | b1>>4, c = (b1&15)<<2 | b2>>6, d = b2&63);
   * npix = w*h se dati, altrimenti tutti i gruppi del flusso */
  function unpack6(raw, w, h) {
    var n = (w > 0 && h > 0) ? w * h : (raw ? ((raw.length / 3) | 0) * 4 : 0), g = (n + 3) >> 2, out, i, o = 0, a, b, c;
    if (!raw || raw.length < g * 3) { throw new Error('raw6 ' + (raw ? raw.length : 0)); }
    out = new Uint8Array(g * 4);
    for (i = 0; i < out.length; i += 4) {
      a = raw[o++]; b = raw[o++]; c = raw[o++];
      out[i] = a >> 2;
      out[i + 1] = ((a & 3) << 4) | (b >> 4);
      out[i + 2] = ((b & 15) << 2) | (c >> 6);
      out[i + 3] = c & 63;
    }
    return out.length === n ? out : out.subarray(0, n);
  }

  /* unpack1: 1BitPalette MSB-first (pixel x nel bit 0x80 >> (x & 7) del byte x >> 3), riga ceil(w/8) B, 1 = bianco */
  function unpack1(raw, w, h) {
    var st = (w + 7) >> 3, out, y, x, r;
    if (!raw || raw.length < st * h) { throw new Error('raw1 ' + (raw ? raw.length : 0)); }
    out = new Uint8Array(w * h);
    for (y = 0; y < h; y++) {
      r = y * st;
      for (x = 0; x < w; x++) { out[y * w + x] = (raw[r + (x >> 3)] >> (7 - (x & 7))) & 1; }
    }
    return out;
  }

  /* luma_reset: valid false, bianco, senza contorno, percentuali 0 */
  function lumaReset() {
    return { valid: false, white: true, halo: false, bad_pct: 0, bad_white: 0, bad_black: 0, mean: 0, samples: 0 };
  }

  /* fascia {x, y, w, h} (un numero = altezza dall'origine) ritagliata al bitmap (precondizione di
   * luma.h, in C prv_compute_luma); null se non c'e' nulla da campionare */
  function bandOf(data, band, w, h) {
    var b = (typeof band === 'number') ? { x: 0, y: 0, w: w, h: band | 0 } : { x: band.x | 0, y: band.y | 0, w: band.w | 0, h: band.h | 0 };
    if (b.x + b.w > w) { b.w = w - b.x; }
    if (b.y + b.h > h) { b.h = h - b.y; }
    return (!data || b.x < 0 || b.y < 0 || b.w <= 0 || b.h <= 0) ? null : b;
  }

  /* prv_decide (n > 0) a freddo: percentuali intere, bianco se meno ostile, a parita' se Y medio < 46 */
  function decide(r, n, sum, nb, nd) {
    var bw = ((nb * 100) / n) | 0, bb = ((nd * 100) / n) | 0, m = (sum / n) | 0;
    r.white = (bw !== bb) ? (bw < bb) : (m < Y_CROSS);
    r.bad_white = bw; r.bad_black = bb; r.mean = m; r.bad_pct = r.white ? bw : bb;
    r.valid = true; r.samples = n;
  }

  /* luma_compute_8bit su indici spacchettati (stride = w): 1 riga su 2 e 1 colonna su 2 dall'origine della fascia */
  function luma8(idx, w, h, band) {
    var r = lumaReset(), b = bandOf(idx, band, w, h), n = 0, s = 0, nb = 0, nd = 0, x, y, l;
    if (!b) { return r; }
    for (y = b.y; y < b.y + b.h; y += 2) {
      for (x = b.x; x < b.x + b.w; x += 2) {
        l = LUMA_SUN[idx[y * w + x] & 63];
        s += l; n++;
        if (l > Y_WHITE) { nb++; } else if (l < Y_BLACK) { nd++; }
      }
    }
    decide(r, n, s, nb, nd);
    r.halo = r.bad_pct >= HALO_PCT;
    return r;
  }

  /* luma_compute_1bit su bit spacchettati (1 = bianco): bad_white = % bianchi, bad_black = % neri,
   * mean = bianchi x 255 / campioni, contorno sempre */
  function luma1(bits, w, h, band) {
    var r = lumaReset(), b = bandOf(bits, band, w, h), n = 0, nw = 0, x, y;
    r.halo = true;
    if (!b) { return r; }
    for (y = b.y; y < b.y + b.h; y += 2) {
      for (x = b.x; x < b.x + b.w; x += 2) { n++; if (bits[y * w + x]) { nw++; } }
    }
    decide(r, n, nw * 255, nw, n - nw);
    return r;
  }

  /* decodeMask: {w, bits} -> Uint8Array(w * strip_h) di 0/1; strip_h ricavata dai byte (ceil(w/8) per riga)
   * e, se passata, verificata */
  function decodeMask(g, stripH) {
    var w = g ? g.w | 0 : 0, bytes, st, rows, out, y, x;
    if (w <= 0 || typeof g.bits !== 'string') { throw new Error('maschera'); }
    bytes = b64urlDecode(g.bits);
    st = (w + 7) >> 3;
    rows = (bytes.length / st) | 0;
    if (rows * st !== bytes.length || (stripH > 0 && rows !== stripH)) { throw new Error('maschera ' + w + 'x' + rows); }
    out = new Uint8Array(w * rows);
    for (y = 0; y < rows; y++) {
      for (x = 0; x < w; x++) { out[y * w + x] = (bytes[y * st + (x >> 3)] >> (7 - (x & 7))) & 1; }
    }
    return out;
  }

  /* glyphMap: mappa di indici 0..3 (0 vuoto, 1 riempimento, 2 anello, 3 ombra) della casella w x strip_h.
   * Anello = pixel a distanza di Chebyshev 1..R dal riempimento (= R dilatazioni 8-connesse: il quadrato
   * (2R+1)^2 attorno a ogni pixel di riempimento, su un'area allargata di R + S per lato, senza ritaglio
   * durante il calcolo), meno il riempimento; ombra = scorrimenti (+k, +k), k = 1..S, di (riempimento u
   * anello), meno (riempimento u anello); alla fine si ritaglia alla casella. Stessa regola di
   * gen_digits.glyph_index_map (D45), verificata sulle 20 strip. */
  function glyphMap(g, R, S, stripH) {
    var m = decodeMask(g, stripH), w = g.w | 0, H = m.length / w, pad = (R | 0) + (S | 0), W = w + 2 * pad;
    var st = new Uint8Array(W * (H + 2 * pad)), k, p, q, x, y, dx, dy, out;
    for (y = 0; y < H; y++) {
      for (x = 0; x < w; x++) { if (m[y * w + x]) { st[(y + pad) * W + x + pad] = 1; } }
    }
    for (p = st.length - 1; p >= 0; p--) {
      if (st[p] !== 1) { continue; }
      for (dy = -R; dy <= R; dy++) {
        for (dx = -R; dx <= R; dx++) { q = p + dy * W + dx; if (st[q] === 0) { st[q] = 2; } }
      }
    }
    for (k = 1; k <= (S | 0); k++) {
      for (p = st.length - 1 - k * W - k; p >= 0; p--) {
        q = p + k * W + k;
        if ((st[p] === 1 || st[p] === 2) && st[q] === 0) { st[q] = 3; }
      }
    }
    out = new Uint8Array(w * H);
    for (y = 0; y < H; y++) {
      for (x = 0; x < w; x++) { out[y * w + x] = st[(y + pad) * W + x + pad]; }
    }
    return out;
  }

  /* ui_digits_ink_width: colonne d'inchiostro del glifo g (0..9, 10 = ':'); 0 se assente */
  function inkWidth(sz, g) {
    var e = sz.glyphs[g === COLON ? ':' : g];
    return (e && e.w > 0) ? e.w | 0 : 0;
  }

  /* ui_digits_fill_width: riempimento = inchiostro - 2R - S, minimo 1 se il glifo esiste */
  function fillWidth(sz, g) {
    var w = inkWidth(sz, g), f = w - 2 * (sz.ring | 0) - (sz.shadow | 0);
    return w <= 0 ? 0 : (f < 1 ? 1 : f);
  }

  /* prv_grid_steps: passo cifre = max(cell, riempimento della cifra PIU' LARGA fra le 10 + 2R + gap),
   * passo ':' = max(colon, riempimento del ':' + 2R + gap); gap < 0 = riserva (+ R) */
  function gridSteps(sz, cell, colon, gap) {
    var R = sz.ring | 0, mf = 0, cf = fillWidth(sz, COLON), g, f, need;
    for (g = 0; g < 10; g++) { f = fillWidth(sz, g); if (f > mf) { mf = f; } }
    need = function (v) { return gap >= 0 ? v + 2 * R + gap : v + R; };
    return { digit: (mf > 0 && need(mf) > cell) ? need(mf) : cell, colon: (cf > 0 && need(cf) > colon) ? need(cf) : colon };
  }

  /* prv_place_row: al piu' count caratteri e MAX_GLYPHS glifi da x 0; prv_glyph_of: non cifra = ':' */
  function placeRow(text, count, adD, adC, gap) {
    var gl = [], x = 0, i, g, adv;
    for (i = 0; i < count && i < text.length && gl.length < MAX_GLYPHS; i++) {
      g = text.charCodeAt(i) - 48;
      if (g < 0 || g > 9) { g = COLON; }
      adv = g === COLON ? adC : adD;
      gl.push({ ch: g === COLON ? ':' : String(g), g: g, x: x, adv: adv });
      x += adv + gap;
    }
    return { glyphs: gl, total: x - (gl.length ? gap : 0) };
  }

  /* prv_place_row_fit: prova 2, 1, 0 px fra gli anelli e tiene il primo per cui riga + extra sta in
   * max_w - 2 * FIT_MARGIN; altrimenti la riserva (sempre accettata) */
  function placeRowFit(sz, text, count, cell, colon, gap, extra, maxW) {
    var k, st, row, rg;
    for (k = 0; k < RING_GAPS.length; k++) {
      rg = RING_GAPS[k];
      st = gridSteps(sz, cell, colon, rg);
      row = placeRow(text, count, st.digit, st.colon, gap);
      if (rg < 0 || row.total + extra <= maxW - 2 * FIT_MARGIN) { break; }
    }
    row.ring_gap = rg < 0 ? null : rg;
    return row;
  }

  /* ui_digits_draw: x del blit = cella + (passo - nucleo) / 2 troncato, nucleo = w - S (>= 1, altrimenti w) */
  function drawX(sz, g, x, adv) {
    var w = inkWidth(sz, g), c = w - (sz.shadow | 0);
    if (w <= 0) { return x; }
    if (c < 1) { c = w; }
    return x + cdiv(adv - c, 2);
  }

  /* prv_shift_row + larghezza d'inchiostro, x del blit e riga 0 della strip (fill_y - ring) */
  function shiftRow(sz, row, dx, y) {
    var i, g;
    for (i = 0; i < row.glyphs.length; i++) {
      g = row.glyphs[i];
      g.x += dx;
      g.w = inkWidth(sz, g.g);
      g.gx = drawX(sz, g.g, g.x, g.adv);
    }
    row.x0 = dx; row.y = y;
    return row;
  }

  /* la taglia da metrics: una voce {strip_h, ring, shadow, cell_w, glyphs} oppure la voce del font {a, b} */
  function sizeOf(m, B) { return (m && m.glyphs) ? m : (m ? m[B ? 'b' : 'a'] : null); }
  function isB(l) { return l === 1 || l === 'B' || l === 'b'; }
  /* D136 "ora in basso": layout 2 = A specchiato nella sua fascia, ancorata al fondo */
  function isBottom(l) { return l === 2 || l === 'C' || l === 'c'; }
  /* origine y della fascia (band_y del C: 0 salvo "ora in basso") */
  function lumaTop(L, bot, h) { return bot ? L.h - h : 0; }

  /* layoutRows (prv_layout_time, MODE_A_SPRITE / MODE_B_SPRITE, celle 24 h, senza AM/PM):
   *   A: riga unica di MAX_GLYPHS glifi con a_cell / a_colon, blocco centrato ((w - total) / 2, mai < 0),
   *      y = a_fill_y - ring; fascia di luma = info_y + info_h + 2;
   *   B: ore fino al primo ':' e minuti dopo (2 glifi), celle b_cell con b_gap, ogni riga centrata
   *      (nessun clamp), y = b_hh_fill_y - ring / b_mm_fill_y - ring; fascia di luma = schermo intero;
   *   C (D136): come A specchiata nella fascia in basso, riempimento a h - a_fill_y - digit_h
   *      (fondo del riempimento sempre a h - a_fill_y) e fascia di luma da lumaY = h - lumaH.
   * -> { rows: [{ y, total, x0, ring_gap, glyphs: [{ ch, g, w, x, adv, gx }] }], lumaH, lumaY, size } */
  function layoutRows(fmt, layout, metrics, time) {
    var p = platformOf(fmt), L = LAYOUT[p], B = isB(layout), sz = sizeOf(metrics, B), s = String(time || '');
    var R, rows = [], row, x0, n, lumaH, bot = !B && isBottom(layout);
    if (!sz || !sz.glyphs) { throw new Error('metriche ' + (B ? 'B' : 'A')); }
    R = sz.ring | 0;
    if (!B) {
      row = placeRowFit(sz, s, MAX_GLYPHS, L.a_cell, L.a_colon, 0, 0, L.w);
      x0 = cdiv(L.w - row.total, 2);
      if (x0 < 0) { x0 = 0; }
      rows.push(shiftRow(sz, row, x0, bot ? L.h - L.a_fill_y - (sz.digit_h | 0) - R : L.a_fill_y - R));
      lumaH = L.info_y + L.info_h + 2;
    } else {
      n = s.indexOf(':');
      if (n < 0) { n = s.length; }
      row = placeRowFit(sz, s, n, L.b_cell, L.b_cell, L.b_gap, 0, L.w);
      rows.push(shiftRow(sz, row, cdiv(L.w - row.total, 2), L.b_hh_fill_y - R));
      row = placeRowFit(sz, s.slice(n + 1), 2, L.b_cell, L.b_cell, L.b_gap, 0, L.w);
      rows.push(shiftRow(sz, row, cdiv(L.w - row.total, 2), L.b_mm_fill_y - R));
      lumaH = L.h;
    }
    return { rows: rows, lumaH: lumaH, lumaY: lumaTop(L, bot, lumaH), size: B ? 'b' : 'a' };
  }

  function rgb(k, sun) {
    var c = (sun ? P.SUN_RGB : P.PAL_RGB)[k];
    return [c[0], c[1], c[2]];
  }

  /* prv_apply_text_style: colore (auto -> luma.white), alone (sempre / mai / auto: emery luma valida e
   * % in conflitto con il colore EFFETTIVO >= 15, flint luma valida), stile D21 (pieno: riempimento fg,
   * anello bg se alone; trasparente: riempimento nullo, anello fg; 3D: in piu' ombra bg; flint mai
   * ombra, D26). Indici della palette a 64 (null = GColorClear) e RGB con SUN_RGB (sun, default) o PAL_RGB */
  function palette(st, lm, fmt, sun) {
    var o = st || {}, bw = platformOf(fmt) === 'flint', f = FG[o.text_color | 0], ol = o.outline | 0, style = o.digit_style | 0;
    var light, fg, bg, halo, tr, fi, ri, sd;
    lm = lm || lumaReset();
    sun = sun === undefined ? true : !!sun;
    if (f) { fg = f[bw ? 1 : 0]; light = !!f[2]; }
    else { light = !!lm.white; fg = light ? 63 : 0; }
    bg = light ? 0 : 63;
    halo = ol === 1 || (ol !== 2 && !!lm.valid && (bw || (light ? lm.bad_white : lm.bad_black) >= HALO_PCT));
    tr = style === 1 || style === 2;
    fi = tr ? null : fg;
    ri = tr ? fg : (halo ? bg : null);
    sd = (style === 2 || style === 3) && !bw ? bg : null;
    return { light: light, halo: halo, fgIdx: fg, bgIdx: bg, fillIdx: fi, ringIdx: ri, shadowIdx: sd, fg: rgb(fg, sun), bg: rgb(bg, sun),
             fill: fi === null ? null : rgb(fi, sun), ring: ri === null ? null : rgb(ri, sun), shadow: sd === null ? null : rgb(sd, sun) };
  }

  /* blit di una mappa di indici in (gx, y) sullo schermo w x h scalato s: 1/2/3 -> colore della palette
   * (null = GColorClear: non si tocca), 0 = niente; ritaglio ai bordi come il compositing */
  function blit(rgba, w, h, s, m, mw, gx, y, pal) {
    var mh = m.length / mw, yy, xx, sx, sy, v, c, k, j, o, W = w * s;
    for (yy = 0; yy < mh; yy++) {
      sy = y + yy;
      if (sy < 0 || sy >= h) { continue; }
      for (xx = 0; xx < mw; xx++) {
        sx = gx + xx;
        v = m[yy * mw + xx];
        c = v === 1 ? pal.fill : v === 2 ? pal.ring : v === 3 ? pal.shadow : null;
        if (!c || sx < 0 || sx >= w) { continue; }
        for (k = 0; k < s; k++) {
          o = ((sy * s + k) * W + sx * s) * 4;
          for (j = 0; j < s; j++) { rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; o += 4; }
        }
      }
    }
  }

  /* render(o): o = { fmt, w, h, raw (Uint8Array raw6/raw1 o null), settings, masks (state.masks), time,
   * sunlight (default true), scale (default 1) } ->
   * { rgba (Uint8ClampedArray w*s x h*s), width, height, luma, pal, drawn, rows, notes, lumaH, lumaY }.
   * Foto (o grigio 21 senza foto) + cifre dell'ora campione nel font/stile/layout/colore delle impostazioni;
   * drawn = false per LECO in layout A (in B l'orologio usa Anton, come prv_load_strips) o maschere assenti;
   * notes: 'no_photo', 'ampm' (formato 12 h: la pagina non mostra AM/PM), 'leco', 'no_masks'. */
  function render(o) {
    var p = platformOf(o.fmt), L = LAYOUT[p], bw = p === 'flint', W = o.w > 0 ? o.w | 0 : L.w, H = o.h > 0 ? o.h | 0 : L.h;
    var s = (o.scale | 0) > 0 ? o.scale | 0 : 1, sun = o.sunlight === undefined ? true : !!o.sunlight, st = o.settings || {};
    var B = isB(st.layout), bot = !B && isBottom(st.layout), time = (typeof o.time === 'string' && o.time) ? o.time : '12:34', notes = [], px, lm, rgba, pal;
    var lumaH = B ? H : L.info_y + L.info_h + 2, fk = FONT_KEYS[st.font | 0], sz, rows = null, drawn = false, cache = {};
    var lumaY = lumaTop(L, bot, lumaH), band = lumaY > 0 ? { x: 0, y: lumaY, w: W, h: lumaH } : lumaH;
    var i, j, r, gl, g, m;
    if (o.raw && o.raw.length) {
      px = bw ? unpack1(o.raw, W, H) : unpack6(o.raw, W, H);
      lm = bw ? luma1(px, W, H, band) : luma8(px, W, H, band);
      rgba = bw ? P.preview1Rgba(px, W, H, s) : P.previewRgba(px, W, H, sun, s);
    } else {
      lm = lumaReset();
      rgba = new Uint8ClampedArray(W * H * s * s * 4);
      g = rgb(GREY, sun);
      for (i = 0; i < rgba.length; i += 4) { rgba[i] = g[0]; rgba[i + 1] = g[1]; rgba[i + 2] = g[2]; rgba[i + 3] = 255; }
      notes.push('no_photo');
    }
    pal = palette(st, lm, p, sun);
    if ((st.clock_mode | 0) === 1) { notes.push('ampm'); }
    /* prv_load_strips: LECO (o font ignoto) in B -> strip 0 (Anton); in A -> testo di sistema, niente sprite */
    if (!fk && B) { fk = FONT_KEYS[0]; }
    sz = sizeOf(fk && o.masks && o.masks[p] ? o.masks[p][fk] : null, B);
    if (!fk) { notes.push('leco'); }
    else if (!sz || !sz.glyphs) { notes.push('no_masks'); }
    else {
      rows = layoutRows(p, B ? 1 : (bot ? 2 : 0), sz, time).rows;
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        for (j = 0; j < r.glyphs.length; j++) {
          gl = r.glyphs[j];
          g = sz.glyphs[gl.ch];
          if (!g || !(g.w > 0) || typeof g.bits !== 'string') { continue; }
          m = cache[gl.ch] || (cache[gl.ch] = glyphMap(g, sz.ring, sz.shadow, sz.strip_h));
          blit(rgba, W, H, s, m, g.w | 0, gl.gx, r.y, pal);
          drawn = true;
        }
      }
    }
    return { rgba: rgba, width: W * s, height: H * s, luma: lm, pal: pal, drawn: drawn, rows: rows, notes: notes, lumaH: lumaH, lumaY: lumaY };
  }

  /* API (spec S12 1.2) + costanti pinnate dai test; il resto e' interno */
  return {
    VERSION: 'S12.3', LAYOUT: LAYOUT, RING_GAPS: RING_GAPS, FIT_MARGIN: FIT_MARGIN, MAX_GLYPHS: MAX_GLYPHS, LUMA_SUN: LUMA_SUN,
    LUMA_Y_WHITE_BAD: Y_WHITE, LUMA_Y_BLACK_BAD: Y_BLACK, LUMA_Y_CROSSOVER: Y_CROSS, LUMA_HALO_PCT: HALO_PCT, FONT_KEYS: FONT_KEYS, GREY_IDX: GREY,
    unpack6: unpack6, unpack1: unpack1, lumaReset: lumaReset, luma8: luma8, luma1: luma1, decodeMask: decodeMask, glyphMap: glyphMap,
    gridSteps: gridSteps, fillWidth: fillWidth, isBottom: isBottom, layoutRows: layoutRows, palette: palette, render: render
  };
}));

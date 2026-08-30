/* pipeline.js - Galleria S6: pipeline immagine della config page, PURA (niente DOM ne'
 * localStorage), senza dipendenze (CRC32 e base64url = crc.js e b64.js). Porting funzione per
 * funzione di tools/photo_prep.py v1, riferimento byte-esatto (test/test_pipeline.js): interi a
 * 32 bit, ">>" = floor anche sui negativi, fixed point x16 con clamp 0..4080, serpentine, LUT
 * sunlight in double, jsround = floor(x + 0.5). Tono: emery per canale prima del dithering, flint
 * sul grigio. ES5 + typed array, UMD; viene inlinato in una stringa: niente backtick. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.GalPipeline = factory(); }
}(this, function () {
  'use strict';

  var EMERY_W = 200, EMERY_H = 228, FLINT_W = 144, FLINT_H = 168;
  var RAW6_BYTES = 34200;        /* 150 * 228 */
  var RAW1_BYTES = 3024;         /* 18 * 168 */
  var SUN_LUT_CRC32 = 0x48CBD990; /* = selftest del tool */

  /* Resa dei 64 colori sul pannello (sunlight di pebble screenshot); indice = GColor8 & 0x3F. */
  var SUN_RGB = [
    [0, 0, 0], [0, 30, 65], [0, 67, 135], [0, 104, 202],
    [43, 74, 44], [39, 81, 79], [22, 99, 141], [0, 125, 206],
    [94, 152, 96], [92, 155, 114], [87, 165, 162], [76, 180, 219],
    [142, 227, 145], [142, 230, 158], [138, 235, 192], [132, 245, 241],
    [74, 22, 27], [72, 39, 72], [64, 72, 138], [47, 107, 204],
    [86, 78, 54], [84, 84, 84], [79, 103, 144], [65, 128, 208],
    [117, 154, 100], [117, 157, 118], [113, 166, 164], [105, 181, 221],
    [158, 229, 148], [157, 231, 160], [155, 236, 194], [149, 246, 242],
    [153, 53, 63], [152, 62, 90], [149, 86, 148], [143, 116, 210],
    [157, 91, 77], [157, 96, 100], [154, 112, 153], [149, 135, 213],
    [175, 160, 114], [174, 163, 130], [171, 171, 171], [167, 186, 226],
    [201, 232, 157], [201, 234, 167], [199, 240, 200], [195, 249, 247],
    [227, 84, 98], [226, 88, 116], [225, 106, 163], [222, 131, 220],
    [230, 110, 107], [230, 114, 124], [227, 127, 167], [225, 148, 223],
    [241, 170, 134], [241, 173, 147], [239, 181, 184], [236, 195, 235],
    [255, 238, 171], [255, 241, 181], [255, 246, 211], [255, 255, 255]
  ];

  /* Palette RGB222 cruda (0/85/170/255). */
  var PAL_RGB = (function () {
    var t = [], k;
    for (k = 0; k < 64; k++) {
      t[k] = [((k >> 4) & 3) * 85, ((k >> 2) & 3) * 85, (k & 3) * 85];
    }
    return t;
  }());

  /* Palette piatta (k*3 + canale) per i cicli interni. */
  function flatten(pal) {
    var t = new Int32Array(192), k;
    for (k = 0; k < 64; k++) {
      t[k * 3] = pal[k][0];
      t[k * 3 + 1] = pal[k][1];
      t[k * 3 + 2] = pal[k][2];
    }
    return t;
  }
  var SUN_FLAT = flatten(SUN_RGB);
  var PAL_FLAT = flatten(PAL_RGB);

  /* _jsround del tool (= Math.round sui positivi). */
  function jsround(x) {
    return Math.floor(x + 0.5);
  }

  /* ---- tono ---- */

  /* tone_lut: t[i] = jsround(255 * min(1, lift + (1-lift)*i/255) ^ gamma); NaN e valori fuori
   * intervallo vengono clampati (mai NaN). */
  function toneLut(gamma, lift) {
    var t = new Uint8Array(256), i;
    gamma = +gamma;
    lift = +lift;
    if (gamma !== gamma) { gamma = 1; }
    if (lift !== lift) { lift = 0; }
    if (gamma < 0.01) { gamma = 0.01; } else if (gamma > 100) { gamma = 100; }
    if (lift < 0) { lift = 0; } else if (lift > 1) { lift = 1; }
    for (i = 0; i < 256; i++) {
      t[i] = jsround(255 * Math.pow(Math.min(1, lift + (1 - lift) * i / 255), gamma));
    }
    return t;
  }

  var IDENT = toneLut(1, 0);

  /* LUT di tono sui byte RGB, in place (= translate(tone)). */
  function applyTone(rgb, tone) {
    var n = rgb.length, i;
    for (i = 0; i < n; i++) {
      rgb[i] = tone[rgb[i]];
    }
    return rgb;
  }

  /* RGBA -> RGB piatto (alpha scartata: fondo bianco). */
  function rgbaToRgb(rgba, w, h) {
    var n = w * h, out = new Uint8Array(n * 3), i, s = 0, d = 0;
    for (i = 0; i < n; i++) {
      out[d] = rgba[s];
      out[d + 1] = rgba[s + 1];
      out[d + 2] = rgba[s + 2];
      s += 4;
      d += 3;
    }
    return out;
  }

  /* ---- quantizzazione ---- */

  /* build_sun_lut: per ogni colore a 5 bit/canale l'indice della RESA piu' vicina, in double come
   * il tool (in interi 2 celle cambierebbero). Memoizzata. */
  var sunLutCache = null;
  function buildSunLut() {
    if (sunLutCache) { return sunLutCache; }
    var lut = new Uint8Array(32768), pal = SUN_FLAT;
    var r, g, b, k, rr, gg, bb, baseR, baseG, best, bd, dr, dg, db, d;
    for (r = 0; r < 32; r++) {
      rr = r * 255 / 31;
      baseR = r << 10;
      for (g = 0; g < 32; g++) {
        gg = g * 255 / 31;
        baseG = baseR | (g << 5);
        for (b = 0; b < 32; b++) {
          bb = b * 255 / 31;
          best = 0;
          bd = 1e12;
          for (k = 0; k < 64; k++) {
            dr = pal[k * 3] - rr;
            dg = pal[k * 3 + 1] - gg;
            db = pal[k * 3 + 2] - bb;
            d = dr * dr + dg * dg + db * db;
            if (d < bd) {
              bd = d;
              best = k;
            }
          }
          lut[baseG | b] = best;
        }
      }
    }
    sunLutCache = lut;
    return lut;
  }

  /* q(v) = min(3, (v + 42) // 85) tabellata (= _quant_raw). */
  var Q85 = (function () {
    var t = new Uint8Array(256), v;
    for (v = 0; v < 256; v++) {
      t[v] = (v + 42 >= 255) ? 3 : ((v + 42) / 85) | 0;
    }
    return t;
  }());

  /* Colore piu' vicino nello spazio RGB crudo. */
  function quantRaw(r, g, b) {
    return (Q85[r] << 4) | (Q85[g] << 2) | Q85[b];
  }

  /* ---- dithering 64 ---- */

  /* dither_fs: Floyd-Steinberg serpentine x16, errore su due righe (cur/nxt di (w+2)*3, un pixel
   * di margine). lut null -> RGB crudo (errore vs PAL_RGB), altrimenti LUT 32^3 (errore vs
   * SUN_RGB). */
  function ditherFs(px, w, h, lut) {
    var idx = new Uint8Array(w * h);
    var tgt = lut ? SUN_FLAT : PAL_FLAT;
    var n = (w + 2) * 3;
    var cur = new Int32Array(n), nxt = new Int32Array(n), tmp;
    var y, i, x, p, e, a, c, r, g, b, rr, gg, bb, k, k3, er, eg, eb, row, ltr, d;
    for (y = 0; y < h; y++) {
      ltr = (y & 1) === 0;
      d = ltr ? 1 : -1;
      row = y * w;
      for (i = 0; i < w; i++) {
        x = ltr ? i : w - 1 - i;
        p = (row + x) * 3;
        e = (x + 1) * 3;
        r = px[p] * 16 + cur[e];
        g = px[p + 1] * 16 + cur[e + 1];
        b = px[p + 2] * 16 + cur[e + 2];
        if (r < 0) { r = 0; } else if (r > 4080) { r = 4080; }
        if (g < 0) { g = 0; } else if (g > 4080) { g = 4080; }
        if (b < 0) { b = 0; } else if (b > 4080) { b = 4080; }
        rr = r >> 4;
        gg = g >> 4;
        bb = b >> 4;
        if (lut) {
          k = lut[((rr >> 3) << 10) | ((gg >> 3) << 5) | (bb >> 3)];
        } else {
          k = (Q85[rr] << 4) | (Q85[gg] << 2) | Q85[bb];
        }
        idx[row + x] = k;
        k3 = k * 3;
        er = r - tgt[k3] * 16;
        eg = g - tgt[k3 + 1] * 16;
        eb = b - tgt[k3 + 2] * 16;
        a = (x + 1 + d) * 3;      /* pixel successivo nel verso di scansione */
        c = (x + 1 - d) * 3;      /* pixel precedente */
        cur[a] += er * 7 >> 4;
        cur[a + 1] += eg * 7 >> 4;
        cur[a + 2] += eb * 7 >> 4;
        nxt[c] += er * 3 >> 4;
        nxt[c + 1] += eg * 3 >> 4;
        nxt[c + 2] += eb * 3 >> 4;
        nxt[e] += er * 5 >> 4;
        nxt[e + 1] += eg * 5 >> 4;
        nxt[e + 2] += eb * 5 >> 4;
        nxt[a] += er >> 4;
        nxt[a + 1] += eg >> 4;
        nxt[a + 2] += eb >> 4;
      }
      tmp = cur;
      cur = nxt;
      nxt = tmp;
      for (i = 0; i < n; i++) { nxt[i] = 0; }
    }
    return idx;
  }

  var BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  /* ((bayer + 0.5) / 16 - 0.5) * 85, come il tool. */
  var BAYER_T = (function () {
    var t = new Float64Array(16), i;
    for (i = 0; i < 16; i++) {
      t[i] = ((BAYER4[i] + 0.5) / 16 - 0.5) * 85;
    }
    return t;
  }());

  /* dither_bayer: Bayer 4x4, nessuna diffusione; con lut la scelta passa dalla LUT. */
  function ditherBayer(px, w, h, lut) {
    var idx = new Uint8Array(w * h), y, x, row, p, t, q0, q1, q2;
    for (y = 0; y < h; y++) {
      row = y * w;
      for (x = 0; x < w; x++) {
        t = BAYER_T[((y & 3) << 2) | (x & 3)];
        p = (row + x) * 3;
        if (lut) {
          q0 = jsround(px[p] + t);
          q1 = jsround(px[p + 1] + t);
          q2 = jsround(px[p + 2] + t);
          if (q0 < 0) { q0 = 0; } else if (q0 > 255) { q0 = 255; }
          if (q1 < 0) { q1 = 0; } else if (q1 > 255) { q1 = 255; }
          if (q2 < 0) { q2 = 0; } else if (q2 > 255) { q2 = 255; }
          idx[row + x] = lut[((q0 >> 3) << 10) | ((q1 >> 3) << 5) | (q2 >> 3)];
        } else {
          q0 = jsround((px[p] + t) / 85);
          q1 = jsround((px[p + 1] + t) / 85);
          q2 = jsround((px[p + 2] + t) / 85);
          if (q0 < 0) { q0 = 0; } else if (q0 > 3) { q0 = 3; }
          if (q1 < 0) { q1 = 0; } else if (q1 > 3) { q1 = 3; }
          if (q2 < 0) { q2 = 0; } else if (q2 > 3) { q2 = 3; }
          idx[row + x] = (q0 << 4) | (q1 << 2) | q2;
        }
      }
    }
    return idx;
  }

  /* dither_none: colore piu' vicino pixel per pixel. */
  function ditherNone(px, w, h, lut) {
    var n = w * h, idx = new Uint8Array(n), i, p = 0;
    for (i = 0; i < n; i++) {
      if (lut) {
        idx[i] = lut[((px[p] >> 3) << 10) | ((px[p + 1] >> 3) << 5) | (px[p + 2] >> 3)];
      } else {
        idx[i] = (Q85[px[p]] << 4) | (Q85[px[p + 1]] << 2) | Q85[px[p + 2]];
      }
      p += 3;
    }
    return idx;
  }

  /* pack6: 4 indici -> 3 B MSB-first sul flusso piatto (w multiplo di 4); un gruppo incompleto
   * viene completato con 0. */
  function pack6(idx, w, h) {
    var npix = (w > 0 && h > 0) ? w * h : idx.length;
    var out = new Uint8Array(((npix + 3) >> 2) * 3), o = 0, i, a, b, c, d;
    for (i = 0; i < npix; i += 4) {
      a = idx[i] & 63;
      b = (i + 1 < npix) ? idx[i + 1] & 63 : 0;
      c = (i + 2 < npix) ? idx[i + 2] & 63 : 0;
      d = (i + 3 < npix) ? idx[i + 3] & 63 : 0;
      out[o] = (a << 2) | (b >> 4);
      out[o + 1] = ((b & 15) << 4) | (c >> 2);
      out[o + 2] = ((c & 3) << 6) | d;
      o += 3;
    }
    return out;
  }

  /* ---- dithering 1 ---- */

  /* to_gray16: (54R + 183G + 19B) >> 8, LUT di tono, x16. */
  function toGray16(px, w, h, tone) {
    var n = w * h, g = new Int32Array(n), i, p = 0;
    if (!tone) { tone = IDENT; }
    for (i = 0; i < n; i++) {
      g[i] = tone[(54 * px[p] + 183 * px[p + 1] + 19 * px[p + 2]) >> 8] * 16;
      p += 3;
    }
    return g;
  }

  /* dither1_fs: FS serpentine a 1 bit, soglia 2048, errore diffuso in g (modificata).
   * 1 = bianco. */
  function dither1Fs(g, w, h) {
    var bits = new Uint8Array(w * h);
    var y, i, x, k, v, e, xa, xc, row, nrow, ltr, d, last;
    for (y = 0; y < h; y++) {
      ltr = (y & 1) === 0;
      d = ltr ? 1 : -1;
      row = y * w;
      nrow = row + w;
      last = (y + 1 >= h);
      for (i = 0; i < w; i++) {
        x = ltr ? i : w - 1 - i;
        k = row + x;
        v = g[k];
        if (v >= 2048) {
          bits[k] = 1;
          e = v - 4080;
        } else {
          e = v;
        }
        xa = x + d;
        xc = x - d;
        if (xa >= 0 && xa < w) { g[row + xa] += e * 7 >> 4; }
        if (!last) {
          if (xc >= 0 && xc < w) { g[nrow + xc] += e * 3 >> 4; }
          g[nrow + x] += e * 5 >> 4;
          if (xa >= 0 && xa < w) { g[nrow + xa] += e >> 4; }
        }
      }
    }
    return bits;
  }

  var ATK_DX = [1, 2, -1, 0, 1, 0];
  var ATK_DY = [0, 0, 1, 1, 1, 2];

  /* dither1_atkinson: 6 vicini a 1/8, serpentine (dx specchiato da destra a sinistra). */
  function dither1Atkinson(g, w, h) {
    var bits = new Uint8Array(w * h);
    var y, i, x, k, v, e, e8, j, xx, yy, row, ltr, d;
    for (y = 0; y < h; y++) {
      ltr = (y & 1) === 0;
      d = ltr ? 1 : -1;
      row = y * w;
      for (i = 0; i < w; i++) {
        x = ltr ? i : w - 1 - i;
        k = row + x;
        v = g[k];
        if (v >= 2048) {
          bits[k] = 1;
          e = v - 4080;
        } else {
          e = v;
        }
        e8 = e >> 3;
        for (j = 0; j < 6; j++) {
          xx = x + ATK_DX[j] * d;
          yy = y + ATK_DY[j];
          if (xx >= 0 && xx < w && yy < h) { g[yy * w + xx] += e8; }
        }
      }
    }
    return bits;
  }

  /* dither1_none: sola soglia a 2048. */
  function dither1None(g, w, h) {
    var n = w * h, bits = new Uint8Array(n), i;
    for (i = 0; i < n; i++) {
      if (g[i] >= 2048) { bits[i] = 1; }
    }
    return bits;
  }

  /* pack1: 1BitPalette MSB-first (pixel x nel bit 0x80 >> (x & 7)), riga ceil(w/8) B,
   * 1 = bianco. */
  function pack1(bits, w, h) {
    var stride = (w + 7) >> 3, out = new Uint8Array(stride * h), y, x, base, row;
    for (y = 0; y < h; y++) {
      base = y * stride;
      row = y * w;
      for (x = 0; x < w; x++) {
        if (bits[row + x]) { out[base + (x >> 3)] |= 0x80 >> (x & 7); }
      }
    }
    return out;
  }

  /* ---- CRC / base64 ---- */

  /* CRC-32 zlib (poly riflesso 0xEDB88320), senza segno; prev continua il calcolo (= crc.js). */
  var T32 = (function () {
    var t = new Uint32Array(256), n, k, c;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[n] = c >>> 0;
    }
    return t;
  }());

  function crc32(bytes, prev) {
    var c = ((prev === undefined || prev === null) ? 0 : (prev >>> 0)) ^ 0xFFFFFFFF;
    var n = bytes ? bytes.length : 0, i;
    for (i = 0; i < n; i++) {
      c = T32[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* base64url senza padding (= b64.encode). */
  var ENC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('');

  function b64url(bytes) {
    var n = bytes.length, full = n - (n % 3), parts = [], j = 0, i = 0, b0, b1, b2;
    while (i < full) {
      b0 = bytes[i] & 255;
      b1 = bytes[i + 1] & 255;
      b2 = bytes[i + 2] & 255;
      parts[j++] = ENC[b0 >> 2] + ENC[((b0 & 3) << 4) | (b1 >> 4)] +
                   ENC[((b1 & 15) << 2) | (b2 >> 6)] + ENC[b2 & 63];
      i += 3;
    }
    if (n - i === 1) {
      b0 = bytes[i] & 255;
      parts[j++] = ENC[b0 >> 2] + ENC[(b0 & 3) << 4];
    } else if (n - i === 2) {
      b0 = bytes[i] & 255;
      b1 = bytes[i + 1] & 255;
      parts[j++] = ENC[b0 >> 2] + ENC[((b0 & 3) << 4) | (b1 >> 4)] + ENC[(b1 & 15) << 2];
    }
    return parts.join('');
  }

  /* photo_id = (crc32 & 0x7FFFFFFF) || 1: mai 0. */
  function photoId(raw) {
    return (crc32(raw) & 0x7FFFFFFF) || 1;
  }

  /* ---- ritagli ---- */

  /* fit_rect: rettangolo piu' grande con rapporto aw:ah dentro sw x sh. */
  function fitRect(sw, sh, aw, ah) {
    var w, h;
    if (sw * ah >= sh * aw) {
      h = sh;
      w = Math.floor(sh * aw / ah);
    } else {
      w = sw;
      h = Math.floor(sw * ah / aw);
    }
    return { w: Math.max(1, Math.min(w, sw)), h: Math.max(1, Math.min(h, sh)) };
  }

  /* Argomento rettangolo: {x,y,w,h} oppure [x,y,w,h]. */
  function rectArg(a) {
    if (a.length === 4) { return { x: a[0], y: a[1], w: a[2], h: a[3] }; }
    return a;
  }

  /* crop_rect (200:228): arg null -> centrato e massimo; altrimenti ritagliato all'immagine,
   * rapporto forzato riducendo il lato lungo, ricentrato. */
  function cropRect(sw, sh, arg) {
    var f, x, y, w, h, r;
    if (arg === null || arg === undefined) {
      f = fitRect(sw, sh, EMERY_W, EMERY_H);
      return { x: Math.floor((sw - f.w) / 2), y: Math.floor((sh - f.h) / 2), w: f.w, h: f.h };
    }
    r = rectArg(arg);
    x = Math.max(0, Math.min(r.x, sw - 1));
    y = Math.max(0, Math.min(r.y, sh - 1));
    w = Math.max(1, Math.min(r.w, sw - x));
    h = Math.max(1, Math.min(r.h, sh - y));
    f = fitRect(w, h, EMERY_W, EMERY_H);
    return { x: x + Math.floor((w - f.w) / 2), y: y + Math.floor((h - f.h) / 2), w: f.w, h: f.h };
  }

  /* flint_rect: sotto-rettangolo centrato 144:168 del crop. */
  function flintRect(rect) {
    var r = rectArg(rect), f = fitRect(r.w, r.h, FLINT_W, FLINT_H);
    return { x: r.x + Math.floor((r.w - f.w) / 2), y: r.y + Math.floor((r.h - f.h) / 2), w: f.w, h: f.h };
  }

  /* ---- pipeline ---- */

  /* encodeEmery: tono (su copia) -> dithering -> pack6 -> crc32 -> photo_id.
   * opts = {gamma, lift, dither: 'fs'|'bayer'|'none', sunlight}. */
  function encodeEmery(rgb, opts) {
    var need = EMERY_W * EMERY_H * 3, px, lut, dither, idx, raw, crc;
    opts = opts || {};
    if (!rgb || rgb.length !== need) {
      throw new Error('encodeEmery: servono ' + need + ' byte RGB (200x228), non ' + (rgb ? rgb.length : 0));
    }
    px = new Uint8Array(rgb);          /* copia: l'input non viene toccato */
    applyTone(px, toneLut(opts.gamma === undefined ? 1 : opts.gamma, opts.lift === undefined ? 0 : opts.lift));
    lut = opts.sunlight ? buildSunLut() : null;
    dither = opts.dither || 'fs';
    if (dither === 'fs') { idx = ditherFs(px, EMERY_W, EMERY_H, lut); }
    else if (dither === 'bayer') { idx = ditherBayer(px, EMERY_W, EMERY_H, lut); }
    else if (dither === 'none') { idx = ditherNone(px, EMERY_W, EMERY_H, lut); }
    else { throw new Error('encodeEmery: dithering sconosciuto "' + dither + '"'); }
    raw = pack6(idx, EMERY_W, EMERY_H);
    crc = crc32(raw);
    return { idx: idx, raw: raw, len: RAW6_BYTES, crc: crc, photo_id: (crc & 0x7FFFFFFF) || 1 };
  }

  /* encodeFlint: grigio + tono -> dithering 1 bit -> pack1 -> crc32 -> photo_id.
   * opts = {gamma, lift, dither: 'fs'|'atkinson'|'none'}. */
  function encodeFlint(rgb, opts) {
    var need = FLINT_W * FLINT_H * 3, g, dither, bits, raw, crc;
    opts = opts || {};
    if (!rgb || rgb.length !== need) {
      throw new Error('encodeFlint: servono ' + need + ' byte RGB (144x168), non ' + (rgb ? rgb.length : 0));
    }
    g = toGray16(rgb, FLINT_W, FLINT_H,
                 toneLut(opts.gamma === undefined ? 1 : opts.gamma, opts.lift === undefined ? 0 : opts.lift));
    dither = opts.dither || 'fs';
    if (dither === 'fs') { bits = dither1Fs(g, FLINT_W, FLINT_H); }
    else if (dither === 'atkinson') { bits = dither1Atkinson(g, FLINT_W, FLINT_H); }
    else if (dither === 'none') { bits = dither1None(g, FLINT_W, FLINT_H); }
    else { throw new Error('encodeFlint: dithering sconosciuto "' + dither + '"'); }
    raw = pack1(bits, FLINT_W, FLINT_H);
    crc = crc32(raw);
    return { bits: bits, raw: raw, len: RAW1_BYTES, crc: crc, photo_id: (crc & 0x7FFFFFFF) || 1 };
  }

  /* ---- anteprime ---- */

  /* previewRgba: indici -> RGBA w*scale x h*scale (pixel replicati); sunlight -> SUN_RGB,
   * altrimenti PAL_RGB. */
  function previewRgba(idx, w, h, sunlight, scale) {
    var pal = sunlight ? SUN_FLAT : PAL_FLAT;
    var s = (scale | 0) || 1, W, out, y, x, sy, sx, k3, o, base;
    if (s < 1) { s = 1; }
    W = w * s;
    out = new Uint8ClampedArray(W * h * s * 4);
    for (y = 0; y < h; y++) {
      for (sy = 0; sy < s; sy++) {
        base = (y * s + sy) * W * 4;
        for (x = 0; x < w; x++) {
          k3 = idx[y * w + x] * 3;
          o = base + x * s * 4;
          for (sx = 0; sx < s; sx++) {
            out[o] = pal[k3];
            out[o + 1] = pal[k3 + 1];
            out[o + 2] = pal[k3 + 2];
            out[o + 3] = 255;
            o += 4;
          }
        }
      }
    }
    return out;
  }

  /* preview1Rgba: 1 = bianco, 0 = nero. */
  function preview1Rgba(bits, w, h, scale) {
    var s = (scale | 0) || 1, W, out, y, x, sy, sx, v, o, base;
    if (s < 1) { s = 1; }
    W = w * s;
    out = new Uint8ClampedArray(W * h * s * 4);
    for (y = 0; y < h; y++) {
      for (sy = 0; sy < s; sy++) {
        base = (y * s + sy) * W * 4;
        for (x = 0; x < w; x++) {
          v = bits[y * w + x] ? 255 : 0;
          o = base + x * s * 4;
          for (sx = 0; sx < s; sx++) {
            out[o] = v;
            out[o + 1] = v;
            out[o + 2] = v;
            out[o + 3] = 255;
            o += 4;
          }
        }
      }
    }
    return out;
  }

  return {
    VERSION: 'S6.1',
    EMERY_W: EMERY_W, EMERY_H: EMERY_H, FLINT_W: FLINT_W, FLINT_H: FLINT_H,
    RAW6_BYTES: RAW6_BYTES, RAW1_BYTES: RAW1_BYTES,
    SUN_RGB: SUN_RGB, PAL_RGB: PAL_RGB, SUN_LUT_CRC32: SUN_LUT_CRC32,
    toneLut: toneLut, applyTone: applyTone, rgbaToRgb: rgbaToRgb,
    buildSunLut: buildSunLut, quantRaw: quantRaw,
    ditherFs: ditherFs, ditherBayer: ditherBayer, ditherNone: ditherNone, pack6: pack6,
    toGray16: toGray16, dither1Fs: dither1Fs, dither1Atkinson: dither1Atkinson,
    dither1None: dither1None, pack1: pack1,
    crc32: crc32, b64url: b64url, photoId: photoId,
    fitRect: fitRect, cropRect: cropRect, flintRect: flintRect,
    encodeEmery: encodeEmery, encodeFlint: encodeFlint,
    previewRgba: previewRgba, preview1Rgba: preview1Rgba
  };
}));

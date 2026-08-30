/* page_core.js — Galleria S6: logica pura della config page (stato dall'hash, tessere, payload §3).
 * UMD: window.GalPageCore nel browser, module.exports in node. ES5, nessun DOM. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.GalPageCore = factory(); }
}(this, function () {
  'use strict';
  var MAX_SLOTS = 12, MAX_THUMB_CHARS = 6000, MAX_NAME = 64, INTERVALS = [0, 5, 15, 30, 60, 180, 1440];
  var FMT_LEN = { 1: 34200, 2: 3024 };
  /* [nome, min, max, default] = album.js / settings_validate() */
  var SETTINGS_FIELDS = [['layout', 0, 1, 0], ['font', 0, 3, 0], ['clock_mode', 0, 2, 0], ['leading_zero', 0, 2, 0],
    ['text_color', 0, 4, 0], ['outline', 0, 2, 0], ['interval_min', 0, 1440, 30], ['order', 0, 1, 0],
    ['shake_next', 0, 1, 1], ['info_row', 0, 15, 15]];
  var ENC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var DEC = (function () {
    var t = [], i;
    for (i = 0; i < 256; i++) { t[i] = -1; }
    for (i = 0; i < 64; i++) { t[ENC.charCodeAt(i)] = i; }
    t[43] = 62; t[47] = 63;                                      /* alfabeto standard */
    t[61] = -2; t[32] = -2; t[10] = -2; t[13] = -2; t[9] = -2;   /* '=' e spazi: ignorati */
    return t;
  })();

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isSlot(v) { return isInt(v) && v >= 0 && v < MAX_SLOTS; }
  function has(list, v) { return list.indexOf(v) >= 0; }
  function slotList(v) {                                         /* interi 0..11 senza duplicati */
    var out = [], i;
    if (isArray(v)) { for (i = 0; i < v.length; i++) { if (isSlot(v[i]) && !has(out, v[i])) { out.push(v[i]); } } }
    return out;
  }

  function b64urlToBytes(str) {
    if (typeof str !== 'string') { throw new Error('base64url: serve una stringa'); }
    var n = str.length, out = new Uint8Array(((n * 3) >> 2) + 3), k = 0, acc = 0, nb = 0, ns = 0, i, c, v;
    for (i = 0; i < n; i++) {
      c = str.charCodeAt(i); v = c < 256 ? DEC[c] : -1;
      if (v >= 0) {
        acc = (acc << 6) | v; nb += 6; ns++;
        if (nb >= 8) { nb -= 8; out[k++] = (acc >> nb) & 255; acc &= (1 << nb) - 1; }
      } else if (v === -1) { throw new Error('base64url: carattere non valido alla posizione ' + i); }
    }
    if ((ns & 3) === 1) { throw new Error('base64url: lunghezza non valida'); }
    return out.subarray(0, k);
  }

  function utf8Decode(b) {
    var s = '', buf = [], i = 0, n = b.length, c, cp;
    while (i < n) {
      c = b[i++];
      if (c < 0x80) { cp = c; }
      else if ((c & 0xE0) === 0xC0 && i < n) { cp = ((c & 0x1F) << 6) | (b[i++] & 0x3F); }
      else if ((c & 0xF0) === 0xE0 && i + 1 < n) { cp = ((c & 0x0F) << 12) | ((b[i++] & 0x3F) << 6) | (b[i++] & 0x3F); }
      else if ((c & 0xF8) === 0xF0 && i + 2 < n) { cp = ((c & 7) << 18) | ((b[i++] & 0x3F) << 12) | ((b[i++] & 0x3F) << 6) | (b[i++] & 0x3F); }
      else { cp = 0xFFFD; }
      if (cp > 0xFFFF) { cp -= 0x10000; buf.push(0xD800 | (cp >> 10), 0xDC00 | (cp & 0x3FF)); } else { buf.push(cp); }
      if (buf.length >= 4096) { s += String.fromCharCode.apply(null, buf); buf = []; }
    }
    return s + String.fromCharCode.apply(null, buf);
  }

  function defaultSettings() { return normalizeSettings({}); }
  function normalizeSettings(obj) {
    var s = {}, i, f, v;
    obj = (obj && typeof obj === 'object') ? obj : {};
    for (i = 0; i < SETTINGS_FIELDS.length; i++) {
      f = SETTINGS_FIELDS[i]; v = obj[f[0]];
      if (typeof v === 'string' && v !== '' && isFinite(+v)) { v = +v; }
      if (typeof v === 'boolean') { v = v ? 1 : 0; }
      s[f[0]] = (isInt(v) && v >= f[1] && v <= f[2]) ? v : f[3];
    }
    if (!has(INTERVALS, s.interval_min)) { s.interval_min = 30; }
    if (s.font === 3 && s.layout === 1) { s.font = 0; }         /* LECO solo in layout A */
    return s;
  }

  function defaultState() {
    var photos = [], k;
    for (k = 0; k < MAX_SLOTS; k++) { photos.push(null); }
    return { v: 1, ok: true, platform: 'unknown', fmt: 1, cap_kb: 900, dev: false, settings: defaultSettings(),
             settingsSet: false, photos: photos, order: [], deleted: [], watch: null };
  }
  function normPhoto(p) {
    var out, f, fm;
    if (!p || typeof p !== 'object') { return null; }
    out = { id: isInt(p.id) ? (p.id >>> 0) : 0, name: truncateName(p.name), fmts: {} };
    if (thumbFits(p.thumb)) { out.thumb = p.thumb; }
    for (f = 1; f <= 2; f++) {
      fm = p.fmts && p.fmts[f];
      if (fm && typeof fm === 'object' && isInt(fm.crc)) { out.fmts[f] = { len: FMT_LEN[f], crc: fm.crc >>> 0 }; }
    }
    return out;
  }
  function normWatch(w) {
    var out, k, s;
    if (!w || typeof w !== 'object') { return null; }
    out = { at: w.at, format: w.format, maxChunk: w.maxChunk, settingsCrc: w.settingsCrc, slots: [], foreign: slotList(w.foreign) };
    for (k = 0; k < MAX_SLOTS; k++) {
      s = isArray(w.slots) ? w.slots[k] : null;
      out.slots.push({ state: (s && s.state === 1) ? 1 : 0, crc: (s && isInt(s.crc)) ? (s.crc >>> 0) : 0 });
    }
    return out;
  }
  /* location.hash ('#…' o senza) → stato normalizzato; mai lancia: ok:false + error se non decodificabile */
  function decodeState(hash) {
    var s = defaultState(), str = (typeof hash === 'string') ? hash : '', o, k;
    if (str.charAt(0) === '#') { str = str.slice(1); }
    if (!str) { s.ok = false; s.error = 'hash assente'; return s; }
    try {
      o = JSON.parse(utf8Decode(b64urlToBytes(str)));
      if (!o || typeof o !== 'object' || isArray(o)) { throw new Error('non è un oggetto'); }
    } catch (e) { s.ok = false; s.error = 'hash non valido (' + (e && e.message ? e.message : e) + ')'; return s; }
    /* S7 #31: uno stato di un'altra versione non si sa leggere (campi diversi, significati diversi):
     * vale come "non ricevuto" — default, ok:false e Salva disabilitato, come per l'hash rotto. */
    if (o.v !== 1) { s.ok = false; s.error = 'versione dello stato non supportata'; return s; }
    if (o.platform === 'emery' || o.platform === 'flint') { s.platform = o.platform; }
    s.fmt = (o.fmt === 1 || o.fmt === 2) ? o.fmt : (s.platform === 'flint' ? 2 : 1);
    if (isInt(o.cap_kb) && o.cap_kb > 0) { s.cap_kb = o.cap_kb; }
    s.dev = o.dev === true; s.settingsSet = o.settingsSet === true;
    s.settings = normalizeSettings(o.settings);
    if (isArray(o.photos)) { for (k = 0; k < MAX_SLOTS; k++) { s.photos[k] = normPhoto(o.photos[k]); } }
    s.order = slotList(o.order); s.deleted = slotList(o.deleted); s.watch = normWatch(o.watch);
    return s;
  }

  /* tessere: order → foto fuori da order → estranee dell'HELLO; gli slot in deleted sono esclusi */
  function buildTiles(state) {
    var tiles = [], used = [], del = state.deleted, w = state.watch, f = w ? w.foreign : [], i, k, p, fm, ws;
    function take(k) {
      p = state.photos[k]; fm = p.fmts[state.fmt]; ws = w && w.slots[k];
      used.push(k);
      tiles.push({ slot: k, kind: 'album', name: p.name, thumb: p.thumb || null, hasFmt: !!fm,
                   pending: !!fm && !(ws && ws.state === 1 && ws.crc === fm.crc) });
    }
    for (i = 0; i < state.order.length; i++) { k = state.order[i]; if (state.photos[k] && !has(del, k) && !has(used, k)) { take(k); } }
    for (k = 0; k < MAX_SLOTS; k++) { if (state.photos[k] && !has(del, k) && !has(used, k)) { take(k); } }
    for (i = 0; i < f.length; i++) {
      k = f[i];
      if (!has(del, k) && !has(used, k)) { used.push(k); tiles.push({ slot: k, kind: 'foreign', name: '', thumb: null, hasFmt: true, pending: false }); }
    }
    return tiles;
  }
  /* primo slot libero: prima quelli mai usati, poi quelli appena eliminati; -1 se pieno */
  function freeSlot(tiles, deleted) {
    var used = [], k, pass;
    for (k = 0; k < tiles.length; k++) { used.push(tiles[k].slot); }
    deleted = deleted || [];
    for (pass = 0; pass < 2; pass++) {
      for (k = 0; k < MAX_SLOTS; k++) { if (!has(used, k) && (pass === 1 || !has(deleted, k))) { return k; } }
    }
    return -1;
  }

  /* <= 64 code unit; un surrogato alto rimasto spaiato in coda (emoji a cavallo del taglio) viene scartato:
   * altrimenti JSON.stringify produce "\ud83d" e il JSON non e' ben formato in UTF-8 (revisione S6 #3) */
  function truncateName(name) {
    var s = (typeof name === 'string') ? name.slice(0, MAX_NAME) : '', c = s.length ? s.charCodeAt(s.length - 1) : 0;
    return (c >= 0xD800 && c <= 0xDBFF) ? s.slice(0, s.length - 1) : s;
  }
  /* tetto per l'OS del telefono: Pebble.platform nel PKJS e' il runtime, non l'OS, quindi e' la pagina a
   * riconoscere iOS (userAgent iPhone/iPad/iPod, o iPadOS "MacIntel" con touch) e a scendere a 200 KB (#4) */
  function capForUa(cap, ua, nav) {
    var ios = /iPhone|iPad|iPod/.test(String(ua || '')) ||
              !!(nav && nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    cap = (isInt(cap) && cap > 0) ? cap : 900;
    return ios ? Math.min(cap, 200) : cap;
  }
  function thumbFits(t) { return typeof t === 'string' && t.length <= MAX_THUMB_CHARS && t.indexOf('data:image/') === 0; }
  /* model = {settings, tiles (ordine finale), deleted, added: [{slot, photo_id, fmt, len, crc, data, name, thumb?}]} */
  function buildPayload(model) {
    var tiles = model.tiles || [], added = model.added || [], order = [], photos = [], i, a, e;
    for (i = 0; i < tiles.length; i++) { if (isSlot(tiles[i].slot) && !has(order, tiles[i].slot)) { order.push(tiles[i].slot); } }
    for (i = 0; i < added.length; i++) {
      a = added[i];
      e = { slot: a.slot, photo_id: a.photo_id, fmt: a.fmt, len: a.len, crc: a.crc, data: a.data, name: truncateName(a.name) };
      if (thumbFits(a.thumb)) { e.thumb = a.thumb; }
      photos.push(e);
      if (isSlot(a.slot) && !has(order, a.slot)) { order.push(a.slot); }
    }
    return { v: 1, settings: normalizeSettings(model.settings), order: order, deleted: slotList(model.deleted), photos: photos };
  }
  function payloadKb(payload) { return Math.ceil(JSON.stringify(payload).length / 1024); }
  function capMessage(kb, capKb, nAdded) {
    var k;
    if (!(kb > capKb)) { return null; }
    if (!(nAdded > 0)) { return 'Troppi dati per un solo invio (' + kb + ' KB su ' + capKb + ')'; }
    k = Math.min(nAdded, Math.max(1, Math.ceil((kb - capKb) / (kb / nAdded))));
    return 'Troppi dati per un solo invio (' + kb + ' KB su ' + capKb + '): togli ' + k + ' foto o salva in più volte';
  }

  return { SETTINGS_FIELDS: SETTINGS_FIELDS, INTERVALS: INTERVALS, MAX_SLOTS: MAX_SLOTS, MAX_THUMB_CHARS: MAX_THUMB_CHARS,
    MAX_NAME: MAX_NAME, FMT_LEN: FMT_LEN, decodeState: decodeState, b64urlToBytes: b64urlToBytes, utf8Decode: utf8Decode,
    defaultSettings: defaultSettings, normalizeSettings: normalizeSettings, defaultState: defaultState, buildTiles: buildTiles,
    freeSlot: freeSlot, buildPayload: buildPayload, payloadKb: payloadKb, capMessage: capMessage, thumbFits: thumbFits,
    truncateName: truncateName, capForUa: capForUa };
}));

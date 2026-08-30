/* page.js — Galleria S6: UI della config page (DOM, canvas, gesti, trasporto). ES5; window.GalPage per test e gate. */
(function (root) {
  'use strict';
  var doc = root.document, C = root.GalPageCore, P = root.GalPipeline, fmt = 1, msgIsCap = false;
  var G = { version: '1.1', state: null, tiles: [], added: [], deleted: [], lastPayload: null, timing: {}, editorOpen: false, overCap: false };
  /* editor: sorgente, copia ≤ 1024 px (disp), cornice Fw×Fh, vista {scale, tx, ty}, ultimo encode */
  var ed = { src: null, bmp: null, sw: 0, sh: 0, disp: null, dw: 0, dh: 0, name: '', Fw: 300, Fh: 342, cover: 1, scale: 1, tx: 0, ty: 0,
             w: 200, h: 228, rgb: null, crop: null, last: null, dirtyCrop: true, timer: null };
  var scratch = [null, null], ptr = {}, nPtr = 0, EV = ['input', 'change'], navigate = nav;
  var gen = 0, cancelArmed = false, base = '';       /* #12 generazione dei caricamenti; #20 Esci in due tocchi; snapshot iniziale */
  root.GalPage = G;

  function el(id) { return doc.getElementById(id); }
  function nav(url) { root.location.href = url; }
  function mk(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.textContent = text; }
    return e;
  }
  function show(e, on) { if (e) { e.style.display = on ? '' : 'none'; } }
  function on(e, type, fn) { if (e && e.addEventListener) { e.addEventListener(type, fn); } }
  function setMsg(text, cls) {
    var m = el('msg'), f = el('footer');
    m.textContent = text || ''; m.className = text ? (cls || '') : '';
    if (f && f.offsetHeight > 0 && doc.body) { doc.body.style.paddingBottom = (f.offsetHeight + 8) + 'px'; }   /* #42 */
  }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : new Date().getTime(); }
  function errText(e) { return (e && e.message) || String(e); }
  function fill(sel, opts) {
    var i, o;
    sel.textContent = '';
    for (i = 0; i < opts.length; i++) {
      o = mk('option', null, opts[i][1]); o.value = String(opts[i][0]);
      if (opts[i][2]) { o.id = opts[i][2]; }
      sel.appendChild(o);
    }
  }

  /* -- impostazioni (#settings, id s_<campo>) -- */
  var OPTS = {
    layout: [[0, 'Un terzo con riga info'], [1, 'Tutto schermo']],
    font: [[0, 'Anton'], [1, 'Bebas Neue'], [2, 'Barlow Condensed'], [3, 'LECO (sistema, solo layout Un terzo)', 's_font_leco']],
    clock_mode: [[0, 'auto'], [1, '12 h'], [2, '24 h']],
    leading_zero: [[0, 'auto'], [1, 'sì'], [2, 'no']],
    interval_min: [[0, 'mai'], [5, '5 min'], [15, '15 min'], [30, '30 min'], [60, '1 h'], [180, '3 h'], [1440, '1 giorno']],
    order: [[0, 'sequenziale'], [1, 'casuale']],
    text_color: [[0, 'auto'], [1, 'bianco'], [2, 'nero'], [3, 'giallo pastello'], [4, 'blu Oxford']],
    outline: [[0, 'auto'], [1, 'sempre'], [2, 'mai']]
  };
  var SELECTS = ['layout', 'font', 'clock_mode', 'leading_zero', 'interval_min', 'order', 'text_color', 'outline'];
  function applyLeco() {                                  /* LECO solo in layout A; anteprima PNG del font */
    var layout = +el('s_layout').value, font = el('s_font'), leco = el('s_font_leco'), img = el('fontPreview'), pv = root.GalPreviews, key;
    if (leco) { leco.disabled = (layout === 1); }
    if (layout === 1 && font.value === '3') { font.value = '0'; }
    key = ['anton', 'bebas', 'barlow'][+font.value];
    if (pv && key && typeof pv[key] === 'string') { img.src = pv[key]; show(img, true); } else { show(img, false); }
  }
  function settingsChanged() { applyLeco(); updateKb(); }  /* contatore KB e tetto anche sulle impostazioni */
  function writeSettings(s) {
    var i;
    for (i = 0; i < SELECTS.length; i++) { fill(el('s_' + SELECTS[i]), OPTS[SELECTS[i]]); el('s_' + SELECTS[i]).value = String(s[SELECTS[i]]); }
    el('s_shake_next').checked = s.shake_next === 1;
    for (i = 0; i < 4; i++) { el('s_info_row_b' + i).checked = !!(s.info_row & (1 << i)); }
    el('s_info_row').value = String(s.info_row);
    applyLeco();
  }
  function readSettings() {
    var s = {}, i, bits = 0;
    for (i = 0; i < SELECTS.length; i++) { s[SELECTS[i]] = +el('s_' + SELECTS[i]).value; }
    s.shake_next = el('s_shake_next').checked ? 1 : 0;
    for (i = 0; i < 4; i++) { if (el('s_info_row_b' + i).checked) { bits |= 1 << i; } }
    s.info_row = bits; el('s_info_row').value = String(bits);
    return C.normalizeSettings(s);
  }

  /* -- tessere (#tiles): ▲ ▼ ✕ con id up_/down_/del_<slot> -- */
  function allDeleted() { return G.deleted.concat(G.state.deleted); }
  function idx(slot) { var i; for (i = 0; i < G.tiles.length; i++) { if (G.tiles[i].slot === slot) { return i; } } return -1; }
  /* le estranee (foto solo sull'orologio) stanno sempre in coda: album.applyPayload ignora gli slot senza foto
   * locale e plan() le accoda comunque, quindi un loro riordino andrebbe perso (#6) */
  function nMovable() { var n = 0; while (n < G.tiles.length && G.tiles[n].kind !== 'foreign') { n++; } return n; }
  function insertTile(t) { G.tiles.splice(nMovable(), 0, t); }
  function tileNode(t, i, nm) {
    var d = mk('div', 'tile' + (t.kind === 'new' ? ' new' : '')), img, nd, meta = mk('div', 'meta'), btns = mk('div', 'tbtns');
    var fo = t.kind === 'foreign', who = t.name || ('slot ' + t.slot);
    function badge(text, cls) { meta.appendChild(mk('span', 'badge' + (cls ? ' ' + cls : ''), text)); }
    function btn(id, text, label, dis, fn) {
      var b = mk('button', null, text);
      b.id = id + t.slot; b.type = 'button'; b.disabled = dis; b.setAttribute('aria-label', label + ': ' + who);   /* #23 */
      on(b, 'click', fn); btns.appendChild(b);
    }
    d.id = 'tile_' + t.slot;
    if (t.thumb) { img = mk('img', 'thumb'); img.src = t.thumb; img.alt = ''; } else { img = mk('div', 'thumb empty', 'slot ' + t.slot); }
    d.appendChild(img);
    nd = mk('div', 'name', who);
    /* #26: il nome viene tagliato due volte — da MAX_NAME (64 caratteri) e dal text-overflow del
     * CSS su una riga sola. Il title porta comunque il nome intero, quando lo conosciamo (t.full
     * lo tiene per le foto aggiunte qui: nello stato dal telefono arriva gia' troncato). */
    nd.title = t.full || who;
    meta.appendChild(nd);
    if (t.kind === 'new') { badge('nuova', 'newb'); }
    if (fo) { badge('solo sull\'orologio: resta in coda'); }
    if (t.pending) { badge('da inviare'); }
    if (!t.hasFmt) { badge('manca il formato per questo orologio: elimina e aggiungi di nuovo', 'warnb'); }
    d.appendChild(meta);
    btn('up_', '▲', 'Sposta su', fo || i === 0, function () { moveTile(t.slot, -1); });
    btn('down_', '▼', 'Sposta giù', fo || i >= nm - 1, function () { moveTile(t.slot, 1); });
    btn('del_', '✕', 'Elimina', false, function () { deleteTile(t.slot); });
    d.appendChild(btns);
    return d;
  }
  function moveTile(slot, dir) {
    var i = idx(slot), j = i + dir, t;
    if (i < 0 || j < 0 || j >= G.tiles.length) { return; }
    if (G.tiles[i].kind === 'foreign' || G.tiles[j].kind === 'foreign') { return; }   /* #6: le estranee non si spostano */
    t = G.tiles[i]; G.tiles[i] = G.tiles[j]; G.tiles[j] = t;
    renderTiles(); updateKb();
  }
  function deleteTile(slot) {
    var i = idx(slot), t, k;
    if (i < 0) { return; }
    t = G.tiles.splice(i, 1)[0];
    if (t.kind === 'new') { for (k = G.added.length - 1; k >= 0; k--) { if (G.added[k].slot === slot) { G.added.splice(k, 1); } } }
    else if (G.deleted.indexOf(slot) < 0) { G.deleted.push(slot); }
    renderTiles(); updateKb();
    if (!G.overCap) { setMsg(t.kind === 'new' ? 'Foto nuova scartata: slot ' + slot + ' di nuovo libero' : 'Foto rimossa dall\'elenco (si applica al Salva)'); }   /* #10 */
  }
  function renderTiles() {
    var box = el('tiles'), i, n = G.tiles.length, nm = nMovable(), full = C.freeSlot(G.tiles, allDeleted()) < 0;
    box.textContent = '';
    for (i = 0; i < n; i++) { box.appendChild(tileNode(G.tiles[i], i, nm)); }
    el('file').disabled = full; el('add').disabled = full; el('add').className = 'btn' + (full ? ' off' : '');
    el('addHelp').textContent = full ? 'album pieno: elimina una foto' : 'scegli dalla Libreria';
  }

  /* -- contatore KB e tetto -- */
  G.buildPayload = function () { return C.buildPayload({ settings: readSettings(), tiles: G.tiles, deleted: G.deleted, added: G.added }); };
  /* Salva: mai sopra il tetto, con l'editor aperto o senza stato (#1: un payload "autorevole" con default e
   * order vuoto azzererebbe l'album); Esci: mai con l'editor aperto (#20) */
  function footerButtons() { el('save').disabled = G.overCap || G.editorOpen || !G.state.ok; el('cancel').disabled = G.editorOpen; }
  function snapshot() { return JSON.stringify([readSettings(), G.tiles.map(function (t) { return t.slot; }), G.deleted, G.added.length]); }
  function dirty() { return snapshot() !== base; }
  function updateKb() {
    var kb = C.payloadKb(G.buildPayload()), cap = G.state.cap_kb, m = C.capMessage(kb, cap, G.added.length);
    el('kb').textContent = 'Da inviare: ' + kb + ' KB / ' + cap + ' KB';
    G.overCap = !!m; cancelArmed = false;
    footerButtons();
    if (m) { setMsg(m, 'err'); } else if (msgIsCap) { setMsg(''); }
    msgIsCap = !!m;
  }

  /* -- editor: caricamento (createImageBitmap + EXIF, fallback <img>) -- */
  function loadViaImg(file, cb) {
    var img, url, U = root.URL || root.webkitURL;
    if (typeof root.Image !== 'function' || !U || !U.createObjectURL) { cb(new Error('nessun decoder di immagini')); return; }
    try { url = U.createObjectURL(file); } catch (e) { cb(new Error('file non valido')); return; }
    img = new root.Image();
    img.onload = function () { U.revokeObjectURL(url); cb(null, img); };
    img.onerror = function () { U.revokeObjectURL(url); cb(new Error('immagine non decodificabile')); };
    img.src = url;
  }
  function loadImage(file, cb) {
    var p = null, done = false;
    function fin(err, img) { if (!done) { done = true; cb(err, img); } }
    function fallback() { if (!done) { loadViaImg(file, fin); } }
    try { if (typeof root.createImageBitmap === 'function') { p = root.createImageBitmap(file, { imageOrientation: 'from-image' }); } } catch (e) { p = null; }
    if (p && typeof p.then === 'function') { p.then(function (b) { if (b && b.width > 0) { fin(null, b); } else { fallback(); } }, fallback); } else { fallback(); }
  }

  /* -- editor: canvas (dimezzamenti su fondo bianco) -- */
  function ctx2d(c, read) {
    var x = null;
    try { x = c.getContext('2d', read ? { willReadFrequently: true } : undefined); } catch (e) { x = null; }
    return x || c.getContext('2d');
  }
  function prep(ctx, w, h) {
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  }
  function downscale(src, sx, sy, sw, sh, dst, dw, dh) {
    var cur = src, cw = sw, ch = sh, i = 0, nw, nh, c, ctx;
    while (cw >= 2 * dw && ch >= 2 * dh) {
      nw = Math.max(dw, Math.round(cw / 2)); nh = Math.max(dh, Math.round(ch / 2));
      c = scratch[i & 1] || (scratch[i & 1] = doc.createElement('canvas'));
      c.width = nw; c.height = nh; ctx = ctx2d(c, false); prep(ctx, nw, nh);
      ctx.drawImage(cur, sx, sy, cw, ch, 0, 0, nw, nh);
      cur = c; sx = 0; sy = 0; cw = nw; ch = nh; i++;
    }
    dst.width = dw; dst.height = dh; ctx = ctx2d(dst, true); prep(ctx, dw, dh);
    ctx.drawImage(cur, sx, sy, cw, ch, 0, 0, dw, dh);
    return ctx;
  }
  function putRgba(ctx, rgba, w, h) { var img = ctx.createImageData(w, h); img.data.set(rgba); ctx.putImageData(img, 0, 0); }

  /* -- editor: vista (cornice fissa 200:228) -- */
  function clampView() {
    ed.scale = Math.min(Math.max(ed.scale, ed.cover), ed.cover * 4);
    ed.tx = Math.min(0, Math.max(ed.Fw - ed.sw * ed.scale, ed.tx));
    ed.ty = Math.min(0, Math.max(ed.Fh - ed.sh * ed.scale, ed.ty));
  }
  function zoomAt(px, py, s) {
    var k;
    s = Math.min(Math.max(s, ed.cover), ed.cover * 4); k = s / ed.scale;
    ed.tx = px - (px - ed.tx) * k; ed.ty = py - (py - ed.ty) * k; ed.scale = s;
  }
  function changed() {
    clampView();
    el('zoom').value = String(Math.round(ed.scale / ed.cover * 100) / 100);
    drawFrame(); scheduleWork(true);
  }
  function fitView() {
    ed.cover = ed.scale = Math.max(ed.Fw / ed.sw, ed.Fh / ed.sh);
    ed.tx = (ed.Fw - ed.sw * ed.scale) / 2; ed.ty = (ed.Fh - ed.sh * ed.scale) / 2;
    changed();
  }
  function drawFrame() {
    var ctx = ctx2d(el('crop'), false), r;
    prep(ctx, ed.Fw, ed.Fh);
    ctx.drawImage(ed.disp, 0, 0, ed.dw, ed.dh, ed.tx, ed.ty, ed.sw * ed.scale, ed.sh * ed.scale);
    if (fmt === 2) {                                        /* sotto-rettangolo flint 144:168 tratteggiato, fuori velato */
      r = P.flintRect({ x: 0, y: 0, w: ed.Fw, h: ed.Fh });
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(0, 0, r.x, ed.Fh); ctx.fillRect(r.x + r.w, 0, ed.Fw - r.x - r.w, ed.Fh);
      ctx.fillRect(r.x, 0, r.w, r.y); ctx.fillRect(r.x, r.y + r.h, r.w, ed.Fh - r.y - r.h);
      ctx.lineWidth = 2; ctx.strokeStyle = '#000';
      if (ctx.setLineDash) { ctx.setLineDash([6, 4]); }
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      if (ctx.setLineDash) { ctx.setLineDash([]); }
    }
  }

  /* -- editor: gesti (Pointer Events; fallback touch + mouse) -- */
  function ptrIds() { return Object.keys(ptr); }
  function pos(e) {
    var cv = el('crop'), r = cv.getBoundingClientRect ? cv.getBoundingClientRect() : null;
    if (!r || !r.width) { return { x: e.clientX, y: e.clientY }; }
    return { x: (e.clientX - r.left) * ed.Fw / r.width, y: (e.clientY - r.top) * ed.Fh / r.height };
  }
  function pDown(id, p) { ptr[id] = p; nPtr = ptrIds().length; }
  function pUp(id) { if (ptr[id]) { delete ptr[id]; nPtr = ptrIds().length; } }
  function dist(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
  function pMove(id, p) {
    var o = ptr[id], ids, a, b, d0, d1, mx, my;
    if (!o || !ed.src) { return; }
    if (nPtr < 2) { ed.tx += p.x - o.x; ed.ty += p.y - o.y; ptr[id] = p; changed(); return; }
    ids = ptrIds(); a = ptr[ids[0]]; b = ptr[ids[1]];      /* pinch: scala attorno al punto medio, poi trascina */
    d0 = dist(a, b); mx = (a.x + b.x) / 2; my = (a.y + b.y) / 2;
    ptr[id] = p; a = ptr[ids[0]]; b = ptr[ids[1]]; d1 = dist(a, b);
    if (d0 > 0 && d1 > 0) { zoomAt(mx, my, ed.scale * d1 / d0); }
    ed.tx += (a.x + b.x) / 2 - mx; ed.ty += (a.y + b.y) / 2 - my;
    changed();
  }
  function bindGestures() {
    var cv = el('crop'), i;
    function each(e, fn) { var t = e.changedTouches || [], k; for (k = 0; k < t.length; k++) { fn(t[k]); } }
    if (root.PointerEvent) {
      on(cv, 'pointerdown', function (e) {
        if (e.button > 0) { return; }
        try { cv.setPointerCapture(e.pointerId); } catch (x) { /* niente */ }
        pDown(e.pointerId, pos(e)); e.preventDefault();
      });
      on(cv, 'pointermove', function (e) { if (ptr[e.pointerId]) { pMove(e.pointerId, pos(e)); e.preventDefault(); } });
      on(cv, 'pointerup', function (e) { pUp(e.pointerId); }); on(cv, 'pointercancel', function (e) { pUp(e.pointerId); });
    } else {
      on(cv, 'touchstart', function (e) { each(e, function (t) { pDown('t' + t.identifier, pos(t)); }); e.preventDefault(); });
      on(cv, 'touchmove', function (e) { each(e, function (t) { pMove('t' + t.identifier, pos(t)); }); e.preventDefault(); });
      on(cv, 'touchend', function (e) { each(e, function (t) { pUp('t' + t.identifier); }); }); on(cv, 'touchcancel', function (e) { each(e, function (t) { pUp('t' + t.identifier); }); });
      on(cv, 'mousedown', function (e) { if (!(e.button > 0)) { pDown('m', pos(e)); e.preventDefault(); } });
      on(cv, 'mousemove', function (e) { if (ptr.m) { pMove('m', pos(e)); e.preventDefault(); } });
      on(cv, 'mouseup', function () { pUp('m'); }); on(cv, 'mouseleave', function () { pUp('m'); });
    }
    on(cv, 'wheel', function (e) {
      var p = pos(e);
      if (ed.src) { zoomAt(p.x, p.y, ed.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); changed(); e.preventDefault(); }
    });
    function zoomInput() { if (ed.src) { zoomAt(ed.Fw / 2, ed.Fh / 2, ed.cover * (+el('zoom').value || 1)); changed(); } }
    function it(v) { return (+v).toFixed(2).replace('.', ','); }
    function tone() { el('gammaVal').textContent = it(el('gamma').value); el('liftVal').textContent = it(el('lift').value); scheduleWork(false); }
    for (i = 0; i < 2; i++) { on(el('zoom'), EV[i], zoomInput); on(el('gamma'), EV[i], tone); on(el('lift'), EV[i], tone); }
    on(el('fit'), 'click', function () { if (ed.src) { fitView(); } });
    on(el('dither'), 'change', function () { scheduleWork(false); });
    on(el('sunlight'), 'change', function () { scheduleWork(false); });
    on(el('previewMode'), 'change', function () { if (ed.last) { drawPreview(ed.last); } });
    on(el('addOk'), 'click', addOk);
    on(el('addCancel'), 'click', function () { closeEditor(); setMsg('ritaglio annullato'); });
  }

  /* -- editor: ridimensionamento, codifica, anteprima ×2 (debounce 150 ms) -- */
  function scheduleWork(cropChanged) {
    if (cropChanged) { ed.dirtyCrop = true; }
    if (ed.timer) { root.clearTimeout(ed.timer); }
    ed.timer = root.setTimeout(doWork, 150);
  }
  function doWork() {
    ed.timer = null;
    if (!ed.src) { return; }
    try {
      if (ed.dirtyCrop || !ed.rgb) { resample(); }
      encodeNow();
    } catch (e) { setMsg('Errore di anteprima: ' + errText(e), 'err'); }
  }
  G.flush = function () { if (ed.timer) { root.clearTimeout(ed.timer); doWork(); return true; } return false; };
  function resample() {
    var t0 = now(), s = ed.scale, r, ctx;
    ed.last = null;                                         /* #27: la codifica del ritaglio precedente non vale più */
    r = P.cropRect(ed.sw, ed.sh, [Math.round(-ed.tx / s), Math.round(-ed.ty / s), Math.round(ed.Fw / s), Math.round(ed.Fh / s)]);
    if (fmt === 2) { r = P.flintRect(r); }
    scratch[2] = scratch[2] || doc.createElement('canvas');
    ctx = downscale(ed.src, r.x, r.y, r.w, r.h, scratch[2], ed.w, ed.h);
    ed.rgb = P.rgbaToRgb(ctx.getImageData(0, 0, ed.w, ed.h).data, ed.w, ed.h);
    ed.crop = r; ed.dirtyCrop = false;
    G.timing.resampleMs = Math.round(now() - t0);
  }
  function encodeNow() {
    var t0 = now(), o = { gamma: +el('gamma').value || 1, lift: +el('lift').value || 0, dither: el('dither').value || 'fs', sunlight: fmt === 1 && !!el('sunlight').checked };
    ed.last = (fmt === 2) ? P.encodeFlint(ed.rgb, o) : P.encodeEmery(ed.rgb, o);
    G.timing.encodeMs = Math.round(now() - t0);
    drawPreview(ed.last);
    el('etime').textContent = 'ridimensionamento ' + G.timing.resampleMs + ' ms · codifica ' + G.timing.encodeMs + ' ms';
  }
  function rgbaOf(r, sun, sc) { return (fmt === 2) ? P.preview1Rgba(r.bits, ed.w, ed.h, sc) : P.previewRgba(r.idx, ed.w, ed.h, sun, sc); }
  function drawPreview(r) {
    try { putRgba(ctx2d(el('preview'), false), rgbaOf(r, el('previewMode').value !== 'nominal', 2), ed.w * 2, ed.h * 2); }
    catch (e) { el('etime').textContent = 'anteprima non disponibile'; }
  }
  /* miniatura 50×57 (colori sul vetro): JPEG 0,7 → 0,5 → 0,3, ≤ 6.000 car. o omessa */
  function makeThumb(r) {
    var src = doc.createElement('canvas'), t = doc.createElement('canvas'), tc, q = [0.7, 0.5, 0.3], i, d;
    src.width = ed.w; src.height = ed.h;
    putRgba(ctx2d(src, false), rgbaOf(r, true, 1), ed.w, ed.h);
    t.width = 50; t.height = 57; tc = ctx2d(t, false); prep(tc, 50, 57);
    tc.drawImage(src, 0, 0, ed.w, ed.h, 0, 0, 50, 57);
    for (i = 0; i < q.length; i++) {
      d = t.toDataURL('image/jpeg', q[i]);
      if (typeof d !== 'string' || d.indexOf('data:image/jpeg') !== 0) { return C.thumbFits(d) ? d : null; }
      if (d.length <= C.MAX_THUMB_CHARS) { return d; }
    }
    return null;
  }

  /* -- editor: apertura, aggiunta, chiusura -- */
  /* #2: su telefono l'editor nasce sotto l'elenco delle foto e non si vede: lo si porta in cima.
   * Guardato due volte perche' non c'e' un DOM garantito (test, WebView vecchie): la funzione puo'
   * mancare, e chi non conosce l'oggetto {block} puo' lanciare invece di ignorarlo. */
  function scrollToEditor() {
    var e = el('editor');
    if (!e || typeof e.scrollIntoView !== 'function') { return; }
    try { e.scrollIntoView({ block: 'start' }); } catch (x) { /* niente: resta dov'e' */ }
  }
  function openEditor(file) {
    var name = (file && file.name) ? String(file.name) : 'foto', g = ++gen;   /* #12: vale solo l'ultimo file scelto */
    if (G.editorOpen) { closeEditor(); }
    if (C.freeSlot(G.tiles, allDeleted()) < 0) { setMsg('album pieno: elimina una foto', 'err'); return; }
    ed.name = name;
    setMsg('carico ' + name + '…');
    loadImage(file, function (err, img) {
      if (g !== gen) {                                      /* superato da una scelta successiva: si scarta (e si libera) */
        if (img && typeof img.close === 'function') { try { img.close(); } catch (e) { /* niente */ } }
        return;
      }
      if (err) { setMsg('Non riesco a leggere ' + name + ': ' + errText(err), 'err'); return; }
      ed.name = name;
      try { startEditor(img); } catch (e) { closeEditor(); setMsg('Errore nell\'editor: ' + errText(e), 'err'); }
    });
  }
  function startEditor(img) {
    var t0 = now(), f, c, wrap, cv, pv;
    if (ed.bmp && ed.bmp !== img) { try { ed.bmp.close(); } catch (e) { /* niente */ } }   /* #12 */
    ed.src = img; ed.sw = img.naturalWidth || img.width; ed.sh = img.naturalHeight || img.height;
    if (!(ed.sw > 0 && ed.sh > 0)) { throw new Error('dimensioni non valide'); }
    ed.bmp = (typeof img.close === 'function') ? img : null;
    f = 1024 / Math.max(ed.sw, ed.sh);                       /* copia ridotta per la cornice */
    if (f >= 1) { ed.disp = img; ed.dw = ed.sw; ed.dh = ed.sh; }
    else { c = doc.createElement('canvas'); downscale(img, 0, 0, ed.sw, ed.sh, c, Math.max(1, Math.round(ed.sw * f)), Math.max(1, Math.round(ed.sh * f))); ed.disp = c; ed.dw = c.width; ed.dh = c.height; }
    G.timing.loadMs = Math.round(now() - t0);
    show(el('editor'), true); G.editorOpen = true; footerButtons();
    wrap = el('cropWrap');
    ed.Fw = Math.max(120, Math.min(300, Math.floor((wrap && wrap.clientWidth > 0) ? wrap.clientWidth : 300))); ed.Fh = Math.round(ed.Fw * 228 / 200);
    cv = el('crop'); cv.width = ed.Fw; cv.height = ed.Fh; cv.style.width = ed.Fw + 'px'; cv.style.height = ed.Fh + 'px';
    pv = el('preview'); pv.width = ed.w * 2; pv.height = ed.h * 2;
    el('editName').textContent = ed.name + ' · ' + ed.sw + '×' + ed.sh + ' px';
    el('etime').textContent = ''; ed.rgb = null; ed.last = null; setMsg('');
    fitView();
    scrollToEditor();
  }
  function closeEditor() {
    var i;
    if (ed.timer) { root.clearTimeout(ed.timer); ed.timer = null; }
    if (ed.bmp) { try { ed.bmp.close(); } catch (e) { /* niente */ } }
    for (i = 0; i < scratch.length; i++) { if (scratch[i]) { scratch[i].width = 0; scratch[i].height = 0; } }   /* #35: memoria dei dimezzamenti */
    if (ed.disp && ed.disp !== ed.src) { try { ed.disp.width = 0; ed.disp.height = 0; } catch (e) { /* niente */ } }
    ed.src = ed.bmp = ed.disp = ed.rgb = ed.last = null; ptr = {}; nPtr = 0;
    show(el('editor'), false); G.editorOpen = false;
    try { el('file').value = ''; } catch (e) { /* niente */ }
    updateKb();
  }
  function addOk() {
    var slot, r, entry, th;
    try {
      if (!ed.src) { return; }
      G.flush();
      if (ed.dirtyCrop || !ed.rgb) { resample(); }
      if (!ed.last) { encodeNow(); }
      slot = C.freeSlot(G.tiles, allDeleted());
      if (slot < 0) { setMsg('album pieno: elimina una foto', 'err'); return; }
      r = ed.last;
      /* #11: la miniatura e' un di piu'. toDataURL puo' lanciare (canvas "tainted", memoria) e
       * makeThumb puo' tornare null (nessun JPEG e PNG oltre i 6.000 caratteri): in entrambi i
       * casi la foto si aggiunge lo stesso, senza thumb nel payload, e il messaggio lo dice. */
      try { th = makeThumb(r); } catch (te) { th = null; }
      entry = { slot: slot, photo_id: r.photo_id, fmt: fmt, len: r.len, crc: r.crc, data: P.b64url(r.raw), name: C.truncateName(ed.name) };
      if (th) { entry.thumb = th; }
      G.added.push(entry);
      insertTile({ slot: slot, kind: 'new', name: entry.name, thumb: th, hasFmt: true, pending: false, full: ed.name });   /* #6: prima delle estranee; #26: nome intero */
      closeEditor(); renderTiles(); updateKb();
      if (!G.overCap) { setMsg('Foto aggiunta nello slot ' + slot + ' (' + Math.ceil(entry.data.length / 1024) + ' KB)' + (th ? '' : ', senza anteprima'), 'okmsg'); }
    } catch (e) { setMsg('Errore: ' + errText(e), 'err'); }
  }
  G.addFile = openEditor; G.editor = ed; G.scratch = scratch;

  /* -- trasporto: dev (POST /save + token), telefono (pebblejs://close#), prova -- */
  function loc() { return root.location || {}; }
  function returnTo() {
    var m = /[?&]return_to=([^&#]*)/.exec(String(loc().search || '')), v, sch;
    if (!m) { return null; }
    try { v = decodeURIComponent(m[1]); } catch (e) { v = m[1]; }
    sch = /^([a-z][a-z0-9+.\-]*):/i.exec(v.replace(/[\s\u0000-\u001f]/g, ''));   /* #33: solo http(s) o relativo, mai javascript:/data: */
    return (sch && !/^https?$/i.test(sch[1])) ? null : v;
  }
  function mode() {
    var p = String(loc().protocol || '');
    return returnTo() ? 'dev' : ((p === 'http:' || p === 'https:' || p === 'file:') ? 'test' : 'phone');
  }
  G.mode = mode;
  G.setNavigate = function (fn) { navigate = (typeof fn === 'function') ? fn : nav; };
  function postSave(payload, kb) {
    var x = new root.XMLHttpRequest(), rt = returnTo(), fin = false, why = '', tm;
    function done() {                                       /* un solo esito */
      var r = null;
      if (fin) { return; }
      fin = true; root.clearTimeout(tm);
      try { r = JSON.parse(x.responseText); } catch (e) { r = null; }
      if (x.status === 200 && r && r.ok === true) {
        setMsg('Salvato (seq ' + r.seq + '): torno all\'app', 'okmsg');
        navigate(rt + encodeURIComponent(JSON.stringify({ v: 1, dev: true, seq: r.seq })));
      } else {
        setMsg('Salvataggio fallito: ' + ((r && r.error) || why || (x.status ? 'HTTP ' + x.status : 'dev server non raggiungibile')), 'err');
        footerButtons();
      }
    }
    x.open('POST', '/save', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () { if (x.readyState === 4) { done(); } };
    tm = root.setTimeout(function () {                      /* dev server fermo: non restare su "Invio…" */
      why = 'nessuna risposta in 30 s'; try { x.abort(); } catch (e) { /* niente */ } done();
    }, 30000);
    el('save').disabled = true; setMsg('Invio ' + kb + ' KB…');
    try { x.send(JSON.stringify(payload)); } catch (e) { why = errText(e); done(); }
  }
  function save() {
    var payload, kb, m;
    try {
      if (G.editorOpen) { setMsg('Chiudi prima il ritaglio', 'err'); return; }
      if (!G.state.ok) { setMsg('stato non ricevuto: riapri le impostazioni dall\'app', 'err'); return; }   /* #1 */
      payload = G.buildPayload(); kb = C.payloadKb(payload); m = mode();
      if (kb > G.state.cap_kb) { setMsg(C.capMessage(kb, G.state.cap_kb, G.added.length), 'err'); return; }
      G.lastPayload = payload;
      if (m === 'dev') { postSave(payload, kb); }
      else if (m === 'phone') { navigate('pebblejs://close#' + encodeURIComponent(JSON.stringify(payload))); }
      else { setMsg('modalità prova: payload di ' + kb + ' KB (non inviato)', 'okmsg'); }
    } catch (e) { setMsg('Errore nel salvataggio: ' + errText(e), 'err'); }
  }
  function cancel() {
    var m = mode();
    try {
      if (G.editorOpen) { setMsg('Chiudi prima il ritaglio', 'err'); return; }
      if (dirty() && !cancelArmed) {                        /* #20: nessuna finestra di conferma: il secondo tocco esce davvero */
        cancelArmed = true; setMsg('Modifiche non salvate: tocca di nuovo per uscire senza salvare', 'warn'); return;
      }
      cancelArmed = false;
      if (m === 'dev') { navigate(returnTo()); }
      else if (m === 'phone') { navigate('pebblejs://close#'); }
      else { setMsg('modalità prova: chiusura senza modifiche'); }
    } catch (e) { setMsg('Errore: ' + errText(e), 'err'); }
  }

  /* -- avvio -- */
  function init() {
    var s = G.state = C.decodeState(String(loc().hash || '')), i, nv = root.navigator;
    s.cap_kb = C.capForUa(s.cap_kb, nv && nv.userAgent, nv);   /* #4: iOS → 200 KB */
    fmt = s.fmt; ed.w = (fmt === 2) ? 144 : 200; ed.h = (fmt === 2) ? 168 : 228;
    G.tiles = C.buildTiles(s);
    el('watch').textContent = (s.platform === 'emery') ? 'Pebble Time 2 · 200×228 a colori' : (s.platform === 'flint') ? 'Pebble 2 Duo · 144×168 bianco e nero'
                              : 'orologio sconosciuto: preparo foto ' + (fmt === 2 ? 'in bianco e nero' : 'a colori');
    if (!s.ok) { el('status').textContent = 'Stato non ricevuto: modalità prova (' + s.error + '). Salva è disabilitato: riapri le impostazioni dall\'app Pebble.'; show(el('status'), true); }
    show(el('settingsNote'), !s.settingsSet);
    writeSettings(s.settings);
    fill(el('dither'), (fmt === 2) ? [['fs', 'Floyd–Steinberg'], ['atkinson', 'Atkinson'], ['none', 'Nessuno']]
                                    : [['fs', 'Floyd–Steinberg'], ['bayer', 'Bayer 4×4'], ['none', 'Nessuno']]);
    show(el('sunlightRow'), fmt === 1); show(el('previewModeRow'), fmt === 1);
    renderTiles();
    for (i = 0; i < SELECTS.length; i++) { on(el('s_' + SELECTS[i]), 'change', settingsChanged); }
    for (i = 0; i < 5; i++) { on(el(i < 4 ? 's_info_row_b' + i : 's_shake_next'), 'change', settingsChanged); }
    on(el('file'), 'change', function () { var f = this.files && this.files[0]; if (f) { openEditor(f); } });
    on(el('save'), 'click', save); on(el('cancel'), 'click', cancel);
    bindGestures();
    base = snapshot();
    updateKb();
  }
  try { init(); } catch (e) { try { setMsg('Errore di avvio: ' + errText(e), 'err'); } catch (x) { /* niente */ } }
}(this));

/* page.js — Galleria S6: UI della config page (DOM, canvas, gesti, trasporto). ES5; window.GalPage per test e gate.
 * S10 (D35/D36): nessun testo qui dentro — solo chiavi T('…') e data-i18n nel markup. I dizionari
 * arrivano dallo stato (state.i18n) e la lingua da settings.lang / state.lang_auto. */
(function (root) {
  'use strict';
  var doc = root.document, C = root.GalPageCore, P = root.GalPipeline, fmt = 1, msgIsCap = false;
  var G = { version: '1.1', state: null, tiles: [], added: [], deleted: [], lastPayload: null, timing: {}, editorOpen: false, overCap: false };
  /* editor: sorgente, copia ≤ 1024 px (disp), cornice Fw×Fh, vista {scale, tx, ty}, ultimo encode */
  var ed = { src: null, bmp: null, sw: 0, sh: 0, disp: null, dw: 0, dh: 0, name: '', Fw: 300, Fh: 342, cover: 1, scale: 1, tx: 0, ty: 0,
             w: 200, h: 228, rgb: null, crop: null, last: null, dirtyCrop: true, timer: null };
  var scratch = [null, null], ptr = {}, nPtr = 0, EV = ['input', 'change'], navigate = nav;
  var gen = 0, cancelArmed = false, base = '';       /* #12 generazione dei caricamenti; #20 Esci in due tocchi; snapshot iniziale */
  /* S10: lingua in uso, dizionario di quella lingua, settings.lang, voci delle select */
  var lang = 'en', dict = null, langVal = 0, OPTS = {};
  root.GalPage = G;

  /* -- lingua (S10 D35) --
   * Nell'artefatto inlinato le chiavi sono gia' NUMERI: build_config_page.py sostituisce il nome
   * della chiave con il suo indice, sia nelle chiamate a T sia negli attributi del markup, e T
   * riceve l'indice. Nei test sui SORGENTI arrivano ancora i nomi e si risolvono con l'elenco
   * delle chiavi (window.GalI18nKeys, da fixture_i18n.js). Senza dizionario (pagina aperta a
   * mano, stato assente) si vede il nome della chiave: modalita' prova. */
  /* I segnaposto si sostituiscono in UNA passata: cosi' un valore che contenesse a sua volta
   * {1} (il nome di una foto…) non viene risostituito. */
  function T(k, a, b) {
    var i = (typeof k === 'number') ? k : (root.GalI18nKeys ? root.GalI18nKeys.indexOf(k) : -1);
    var t = (dict && i >= 0 && typeof dict[i] === 'string') ? dict[i] : null, v = [a, b];
    /* Senza dizionario: chiave e valori in fila, cosi' i messaggi cablati in inglese di
     * page_core (l'unica cosa che conta in modalita' prova) restano leggibili. */
    if (t === null) { return String(k) + (a === undefined ? '' : ' ' + a) + (b === undefined ? '' : ' ' + b); }
    return t.replace(/\{([01])\}/g, function (m, n) { return v[+n] === undefined ? m : v[+n]; });
  }
  /* data-i18n: indice nell'artefatto, nome della chiave nei sorgenti */
  function ikey(v) { return /^\d+$/.test(v) ? +v : v; }
  function walkI18n(node) {
    var c = node.children || [], i, e, k;
    for (i = 0; i < c.length; i++) {
      e = c[i];
      if (e.getAttribute) {
        k = e.getAttribute('data-i18n');
        if (k) { e.textContent = T(ikey(k)); }
        k = e.getAttribute('data-i18n-title');
        if (k) { e.title = T(ikey(k)); }
      }
      walkI18n(e);
    }
  }
  /* 1,00 in it/de/fr, 1.00 in inglese */
  function dec2(v) { return C.dec((+v).toFixed(2), lang); }

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

  /* -- impostazioni (#settings, id s_<campo>) --
   * Le voci si ricostruiscono a ogni cambio di lingua (D36: valori e id delle <option> restano
   * quelli, cambia solo il testo). I nomi propri (font, 12 h/24 h) non stanno nel dizionario. */
  function buildOpts() {
    var o = { lang: [[0, T('opt_lang_auto', C.langName(G.state.lang_auto))]] }, i;
    for (i = 0; i < C.LANGS.length; i++) { o.lang.push([i + 1, C.langName(C.LANGS[i])]); }
    o.layout = [[0, T('opt_layout_a')], [1, T('opt_layout_b')]];
    o.font = [[0, 'Anton'], [1, 'Bebas Neue'], [2, 'Barlow Condensed'], [3, T('opt_font_leco'), 's_font_leco'],
              [4, 'Francois One'], [5, 'Staatliches']];
    o.digit_style = [[0, T('opt_style_solid')], [1, T('opt_style_transp')],
                     [2, T('opt_style_transp_3d'), 's_digit_style_3d1'],
                     [3, T('opt_style_solid_3d'), 's_digit_style_3d2']];
    o.clock_mode = [[0, T('opt_auto')], [1, '12 h'], [2, '24 h']];
    o.leading_zero = [[0, T('opt_auto')], [1, T('opt_yes')], [2, T('opt_no')]];
    o.interval_min = [[0, T('opt_never')], [5, T('opt_minutes', 5)], [15, T('opt_minutes', 15)],
                      [30, T('opt_minutes', 30)], [60, T('opt_hours', 1)], [180, T('opt_hours', 3)],
                      [1440, T('opt_one_day')]];
    o.order = [[0, T('opt_order_seq')], [1, T('opt_order_random')]];
    o.text_color = [[0, T('opt_auto')], [1, T('opt_color_white')], [2, T('opt_color_black')],
                    [3, T('opt_color_yellow')], [4, T('opt_color_blue')]];
    o.outline = [[0, T('opt_auto')], [1, T('opt_outline_always')], [2, T('opt_never')]];
    return o;
  }
  /* #dither dipende dal formato: si rifa' a ogni lingua conservando la scelta */
  function fillDither() {
    var e = el('dither'), v = e.value;
    fill(e, [['fs', 'Floyd–Steinberg'], (fmt === 2) ? ['atkinson', 'Atkinson'] : ['bayer', 'Bayer 4×4'],
             ['none', T('dither_none')]]);
    if (v) { e.value = v; }
  }
  /* solo il TESTO delle <option> gia' presenti: id, valori e posizione non si toccano (D36) */
  function optTexts() {
    var i, j, o, list;
    for (i = 0; i < SELECTS.length; i++) {
      list = OPTS[SELECTS[i]]; o = el('s_' + SELECTS[i]).children;
      for (j = 0; j < list.length && j < o.length; j++) { o[j].textContent = list[j][1]; }
    }
  }
  /* lingua effettiva (D33/D36) + tutti i testi che non si ridisegnano da soli */
  function applyLang() {
    var p;
    lang = C.effectiveLang({ lang: langVal }, G.state.lang_auto);
    dict = (G.state.i18n && G.state.i18n[lang]) || null;
    if (doc.documentElement) { doc.documentElement.lang = lang; }
    OPTS = buildOpts();
    walkI18n(doc.body);
    optTexts();
    fillDither();
    p = G.state.platform;
    el('watch').textContent = (p === 'emery') ? T('watch_emery') : (p === 'flint') ? T('watch_flint')
                              : T('watch_unknown', fmt === 2 ? T('watch_fmt_bw') : T('watch_fmt_color'));
    showTone();
    helpTexts();
  }
  var SELECTS = ['lang', 'layout', 'font', 'digit_style', 'clock_mode', 'leading_zero', 'interval_min', 'order', 'text_color', 'outline'];
  /* chiave dell'anteprima per indice del font ('' = nessuna: il 3 e' LECO, font di sistema).
   * Le chiavi arrivano da previews.js (GalPreviews) e sono le stesse di gen_font_previews.py
   * e gen_digits.py (S8-stile §2: 4 = Francois One, 5 = Staatliches). */
  var PREV_KEYS = ['anton', 'bebas', 'barlow', '', 'francois', 'staatliches'];
  /* D26: su Pebble 2 Duo (flint) la strip ha 3 colori e l'ombra 3D non esiste. Le due opzioni con
   * ombra restano spente (id stabili nell'HTML) e il valore scende allo stile equivalente senza
   * ombra: 2 -> 1, 3 -> 0. Su emery e su orologio sconosciuto non cambia nulla.
   * [valore, valore su flint, id dell'option]; l'indice in OPTS.digit_style coincide col valore. */
  var NO_3D = [[2, '1', 's_digit_style_3d1'], [3, '0', 's_digit_style_3d2']];
  function applyNo3d(style) {
    var i, o;
    if (!G.state || G.state.platform !== 'flint') { return; }
    for (i = 0; i < NO_3D.length; i++) {
      o = el(NO_3D[i][2]);
      if (o) { o.disabled = true; o.textContent = T('opt_style_no_flint', OPTS.digit_style[NO_3D[i][0]][1]); }
      if (style.value === String(NO_3D[i][0])) { style.value = NO_3D[i][1]; }
    }
  }
  function applyRules() {            /* LECO solo in layout A; stile cifre (D21, D26); anteprima PNG del font */
    var layout = +el('s_layout').value, font = el('s_font'), leco = el('s_font_leco'), style = el('s_digit_style'),
        img = el('fontPreview'), pv = root.GalPreviews, key, sv;
    if (leco) { leco.disabled = (layout === 1); }
    if (layout === 1 && font.value === '3') { font.value = '0'; }
    /* LECO non ha sprite: lo stile non si applica e vale 0 (come normalizeSettings) */
    style.disabled = (font.value === '3');
    if (style.disabled) { style.value = '0'; }
    applyNo3d(style);
    sv = +style.value;
    /* stili trasparenti: l'anello c'e' sempre, "Contorno" non ha effetto (valore conservato) */
    el('s_outline').disabled = (sv === 1 || sv === 2);
    /* S9 P5: consiglio sui font, solo se lo stile NON e' pieno. sv e' gia' normalizzato da
     * applyNo3d, quindi su flint lo stile 3 (= pieno) non mostra l'aiuto e il 2 (= 1) si'. */
    show(el('s_style_hint'), sv !== 0);
    /* S9 R13: su flint l'anello e' 1 px (D26) e sul dithering si legge male: avviso in piu',
     * solo con lo stile trasparente (sv 1: su flint il 2 e' gia' sceso a 1). */
    show(el('styleFlintHelp'), !!G.state && G.state.platform === 'flint' && sv === 1);
    key = PREV_KEYS[+font.value];
    if (pv && key && typeof pv[key] === 'string') { img.src = pv[key]; show(img, true); } else { show(img, false); }
  }
  /* contatore KB e tetto anche sulle impostazioni; la Lingua (D36) ricostruisce testi e tessere */
  function settingsChanged() {
    var v = +el('s_lang').value || 0;
    if (v !== langVal) { langVal = v; applyLang(); renderTiles(); }
    applyRules(); updateKb();
  }
  function writeSettings(s) {
    var i;
    for (i = 0; i < SELECTS.length; i++) { fill(el('s_' + SELECTS[i]), OPTS[SELECTS[i]]); el('s_' + SELECTS[i]).value = String(s[SELECTS[i]]); }
    el('s_shake_next').checked = s.shake_next === 1;
    for (i = 0; i < 4; i++) { el('s_info_row_b' + i).checked = !!(s.info_row & (1 << i)); }
    el('s_info_row').value = String(s.info_row);
    applyRules();
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
    var fo = t.kind === 'foreign', who = t.name || T('tile_slot', t.slot);
    function badge(text, cls) { meta.appendChild(mk('span', 'badge' + (cls ? ' ' + cls : ''), text)); }
    function btn(id, text, label, dis, fn) {
      var b = mk('button', null, text);
      b.id = id + t.slot; b.type = 'button'; b.disabled = dis; b.setAttribute('aria-label', T('aria_tile_btn', label, who));   /* #23 */
      on(b, 'click', fn); btns.appendChild(b);
    }
    d.id = 'tile_' + t.slot;
    if (t.thumb) { img = mk('img', 'thumb'); img.src = t.thumb; img.alt = ''; } else { img = mk('div', 'thumb empty', T('tile_slot', t.slot)); }
    d.appendChild(img);
    nd = mk('div', 'name', who);
    /* #26: il nome viene tagliato due volte — da MAX_NAME (64 caratteri) e dal text-overflow del
     * CSS su una riga sola. Il title porta comunque il nome intero, quando lo conosciamo (t.full
     * lo tiene per le foto aggiunte qui: nello stato dal telefono arriva gia' troncato). */
    nd.title = t.full || who;
    meta.appendChild(nd);
    if (t.kind === 'new') { badge(T('badge_new'), 'newb'); }
    if (fo) { badge(T('badge_foreign')); }
    if (t.pending) { badge(T('badge_pending')); }
    if (!t.hasFmt) { badge(T('badge_no_fmt'), 'warnb'); }
    d.appendChild(meta);
    btn('up_', '▲', T('btn_up'), fo || i === 0, function () { moveTile(t.slot, -1); });
    btn('down_', '▼', T('btn_down'), fo || i >= nm - 1, function () { moveTile(t.slot, 1); });
    btn('del_', '✕', T('btn_delete'), false, function () { deleteTile(t.slot); });
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
    if (!G.overCap) { setMsg(t.kind === 'new' ? T('msg_new_dropped', slot) : T('msg_removed')); }   /* #10 */
  }
  function renderTiles() {
    var box = el('tiles'), i, n = G.tiles.length, nm = nMovable(), full = C.freeSlot(G.tiles, allDeleted()) < 0;
    box.textContent = '';
    for (i = 0; i < n; i++) { box.appendChild(tileNode(G.tiles[i], i, nm)); }
    el('file').disabled = full; el('add').disabled = full; el('add').className = 'btn' + (full ? ' off' : '');
    el('addHelp').textContent = full ? T('album_full') : T('add_help');
    /* limite di 12 foto spiegato nella pagina (richiesta dell'utente, 05/09): contatore + perché */
    el('photosCap').textContent = T('photos_cap', n, C.MAX_SLOTS);
  }

  /* -- contatore KB e tetto -- */
  G.buildPayload = function () { return C.buildPayload({ settings: readSettings(), tiles: G.tiles, deleted: G.deleted, added: G.added }); };
  /* Salva: mai sopra il tetto, con l'editor aperto o senza stato (#1: un payload "autorevole" con default e
   * order vuoto azzererebbe l'album); Esci: mai con l'editor aperto (#20) */
  function footerButtons() { el('save').disabled = G.overCap || G.editorOpen || !G.state.ok; el('cancel').disabled = G.editorOpen; }
  function snapshot() { return JSON.stringify([readSettings(), G.tiles.map(function (t) { return t.slot; }), G.deleted, G.added.length]); }
  function dirty() { return snapshot() !== base; }
  function updateKb() {
    var kb = C.payloadKb(G.buildPayload()), cap = G.state.cap_kb, m = C.capMessage(kb, cap, G.added.length, T);
    el('kb').textContent = T('kb_line', kb, cap);
    G.overCap = !!m; cancelArmed = false;
    footerButtons();
    if (m) { setMsg(m, 'err'); } else if (msgIsCap) { setMsg(''); }
    msgIsCap = !!m;
  }

  /* -- editor: caricamento (createImageBitmap + EXIF, fallback <img>) -- */
  function loadViaImg(file, cb) {
    var img, url, U = root.URL || root.webkitURL;
    if (typeof root.Image !== 'function' || !U || !U.createObjectURL) { cb(new Error(T('err_no_decoder'))); return; }
    try { url = U.createObjectURL(file); } catch (e) { cb(new Error(T('err_bad_file'))); return; }
    img = new root.Image();
    img.onload = function () { U.revokeObjectURL(url); cb(null, img); };
    img.onerror = function () { U.revokeObjectURL(url); cb(new Error(T('err_bad_image'))); };
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
    function tone() { showTone(); scheduleWork(false); }
    for (i = 0; i < 2; i++) { on(el('zoom'), EV[i], zoomInput); on(el('gamma'), EV[i], tone); on(el('lift'), EV[i], tone); }
    on(el('fit'), 'click', function () { if (ed.src) { fitView(); } });
    on(el('dither'), 'change', function () { scheduleWork(false); });
    on(el('sunlight'), 'change', function () { scheduleWork(false); });
    on(el('previewMode'), 'change', function () { if (ed.last) { drawPreview(ed.last); } });
    on(el('addOk'), 'click', addOk);
    on(el('addCancel'), 'click', function () { closeEditor(); setMsg(T('msg_crop_cancel')); });
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
    } catch (e) { setMsg(T('msg_preview_err', errText(e)), 'err'); }
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
    el('etime').textContent = T('edit_time', G.timing.resampleMs, G.timing.encodeMs);
  }
  function rgbaOf(r, sun, sc) { return (fmt === 2) ? P.preview1Rgba(r.bits, ed.w, ed.h, sc) : P.previewRgba(r.idx, ed.w, ed.h, sun, sc); }
  function drawPreview(r) {
    try { putRgba(ctx2d(el('preview'), false), rgbaOf(r, el('previewMode').value !== 'nominal', 2), ed.w * 2, ed.h * 2); }
    catch (e) { el('etime').textContent = T('preview_off'); }
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
  /* #2: su telefono l'editor nasce sotto l'elenco delle foto e non si vede: lo si porta in cima
   * (#42: stessa cosa per il pannello dell'Aiuto). Guardato due volte perche' non c'e' un DOM
   * garantito (test, WebView vecchie): la funzione puo' mancare, e chi non conosce l'oggetto
   * {block} puo' lanciare invece di ignorarlo. */
  function scrollInto(e) {
    if (!e || typeof e.scrollIntoView !== 'function') { return; }
    try { e.scrollIntoView({ block: 'start' }); } catch (x) { /* niente: resta dov'e' */ }
  }
  function scrollToEditor() { scrollInto(el('editor')); }
  function openEditor(file) {
    var name = (file && file.name) ? String(file.name) : T('photo_name_default'), g = ++gen;   /* #12: vale solo l'ultimo file scelto */
    if (G.editorOpen) { closeEditor(); }
    if (C.freeSlot(G.tiles, allDeleted()) < 0) { setMsg(T('album_full'), 'err'); return; }
    ed.name = name;
    setMsg(T('msg_loading', name));
    loadImage(file, function (err, img) {
      if (g !== gen) {                                      /* superato da una scelta successiva: si scarta (e si libera) */
        if (img && typeof img.close === 'function') { try { img.close(); } catch (e) { /* niente */ } }
        return;
      }
      if (err) { setMsg(T('msg_read_fail', name, errText(err)), 'err'); return; }
      ed.name = name;
      try { startEditor(img); } catch (e) { closeEditor(); setMsg(T('msg_editor_err', errText(e)), 'err'); }
    });
  }
  function startEditor(img) {
    var t0 = now(), f, c, wrap, cv, pv;
    if (ed.bmp && ed.bmp !== img) { try { ed.bmp.close(); } catch (e) { /* niente */ } }   /* #12 */
    ed.src = img; ed.sw = img.naturalWidth || img.width; ed.sh = img.naturalHeight || img.height;
    if (!(ed.sw > 0 && ed.sh > 0)) { throw new Error(T('err_bad_size')); }
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
    el('editName').textContent = T('edit_name', ed.name, ed.sw + '×' + ed.sh);
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
    var slot, r, entry, th, msg;
    try {
      if (!ed.src) { return; }
      G.flush();
      if (ed.dirtyCrop || !ed.rgb) { resample(); }
      if (!ed.last) { encodeNow(); }
      slot = C.freeSlot(G.tiles, allDeleted());
      if (slot < 0) { setMsg(T('album_full'), 'err'); return; }
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
      if (!G.overCap) {
        msg = T('msg_added', slot, Math.ceil(entry.data.length / 1024));
        setMsg(th ? msg : T('msg_added_no_thumb', msg), 'okmsg');
      }
    } catch (e) { setMsg(T('msg_err', errText(e)), 'err'); }
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
        setMsg(T('msg_saved', r.seq), 'okmsg');
        navigate(rt + encodeURIComponent(JSON.stringify({ v: 1, dev: true, seq: r.seq })));
      } else {
        setMsg(T('msg_save_fail', (r && r.error) || why || (x.status ? 'HTTP ' + x.status : T('err_no_dev_server'))), 'err');
        footerButtons();
      }
    }
    x.open('POST', '/save', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () { if (x.readyState === 4) { done(); } };
    tm = root.setTimeout(function () {                      /* dev server fermo: non restare su "Invio…" */
      why = T('err_no_reply'); try { x.abort(); } catch (e) { /* niente */ } done();
    }, 30000);
    el('save').disabled = true; setMsg(T('msg_sending', kb));
    try { x.send(JSON.stringify(payload)); } catch (e) { why = errText(e); done(); }
  }
  function save() {
    var payload, kb, m;
    try {
      if (G.editorOpen) { setMsg(T('msg_close_crop'), 'err'); return; }
      if (!G.state.ok) { setMsg(T('msg_no_state_save'), 'err'); return; }   /* #1 */
      payload = G.buildPayload(); kb = C.payloadKb(payload); m = mode();
      if (kb > G.state.cap_kb) { setMsg(C.capMessage(kb, G.state.cap_kb, G.added.length, T), 'err'); return; }
      G.lastPayload = payload;
      if (m === 'dev') { postSave(payload, kb); }
      else if (m === 'phone') { navigate('pebblejs://close#' + encodeURIComponent(JSON.stringify(payload))); }
      else { setMsg(T('msg_test_payload', kb), 'okmsg'); }
    } catch (e) { setMsg(T('msg_save_err', errText(e)), 'err'); }
  }
  function cancel() {
    var m = mode();
    try {
      if (G.editorOpen) { setMsg(T('msg_close_crop'), 'err'); return; }
      if (dirty() && !cancelArmed) {                        /* #20: nessuna finestra di conferma: il secondo tocco esce davvero */
        cancelArmed = true; setMsg(T('msg_unsaved'), 'warn'); return;
      }
      cancelArmed = false;
      if (m === 'dev') { navigate(returnTo()); }
      else if (m === 'phone') { navigate('pebblejs://close#'); }
      else { setMsg(T('msg_test_close')); }
    } catch (e) { setMsg(T('msg_err', errText(e)), 'err'); }
  }

  /* -- avvio lento del persist (v1.9, perf 04/09) -- */
  /* Stessa procedura in due posti: l'avviso #slow (solo se l'orologio ha misurato un'apertura del
   * file persist oltre C.slowThresholdMs(), che cresce col numero di foto) e la sezione #help,
   * sempre disponibile. Il testo sta qui una volta sola e viene costruito nel DOM: nessuna
   * duplicazione nell'HTML inlinato (tetto 64 KB). */
  function fixProcedure(box) {
    var steps = [T('fix_step_1'), T('fix_step_2'), T('fix_step_3'), T('fix_step_4')], ol = mk('ol'), i;
    box.textContent = '';
    box.appendChild(mk('p', null, T('fix_lead')));
    for (i = 0; i < steps.length; i++) { ol.appendChild(mk('li', null, steps[i])); }
    box.appendChild(ol);
    /* 05/09: niente promesse sulla frequenza (richiesta utente) */
    box.appendChild(mk('p', null, T('fix_tail')));
  }
  function showTone() { el('gammaVal').textContent = dec2(el('gamma').value); el('liftVal').textContent = dec2(el('lift').value); }
  /* testi dell'avviso #slow e della sezione Aiuto: rifatti a ogni cambio di lingua */
  function helpTexts() {
    var sec = C.slowSeconds(G.state.watch, lang);
    if (sec) {
      el('slowLead').textContent = T('slow_lead', sec);
      fixProcedure(el('slowFix'));
    }
    show(el('slow'), !!sec);
    el('helpWhy').textContent = T('help_why');
    fixProcedure(el('helpFix'));
  }
  function initHelp() {
    var body = el('helpBody'), btn = el('helpBtn');
    on(btn, 'click', function () {
      var open = body.style.display === 'none';
      show(body, open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { scrollInto(body); }        /* #42: sotto c'e' solo il footer fisso: aperto non si vedrebbe */
    });
  }

  /* -- avvio -- */
  function init() {
    var s = G.state = C.decodeState(String(loc().hash || '')), i, nv = root.navigator;
    s.cap_kb = C.capForUa(s.cap_kb, nv && nv.userAgent, nv);   /* #4: iOS → 200 KB */
    fmt = s.fmt; ed.w = (fmt === 2) ? 144 : 200; ed.h = (fmt === 2) ? 168 : 228;
    G.tiles = C.buildTiles(s);
    /* S10: la lingua prima di ogni testo (applyLang riempie anche #dither e l'Aiuto) */
    langVal = s.settings.lang;
    applyLang();
    initHelp();
    if (!s.ok) {                       /* senza stato non c'e' dizionario: avviso in inglese minimo (D35) */
      el('status').textContent = dict ? T('status_no_state', s.error) : 'State not received (' + s.error + '). Save is disabled: reopen the settings from the Pebble app.';
      show(el('status'), true);
    }
    show(el('settingsNote'), !s.settingsSet);
    writeSettings(s.settings);
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
  try { init(); } catch (e) { try { setMsg(T('msg_boot_err', errText(e)), 'err'); } catch (x) { /* niente */ } }
}(this));

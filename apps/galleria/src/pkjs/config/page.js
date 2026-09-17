/* page.js — Galleria S6: UI della config page (DOM, canvas, gesti, trasporto). ES5; window.GalPage per test e gate.
 * S10 (D35/D36): nessun testo qui dentro — solo chiavi T('…') e data-i18n nel markup. I dizionari
 * arrivano dallo stato (state.i18n) e la lingua da settings.lang / state.lang_auto.
 * UX-1 (D72): eccezione, le poche frasi raggiungibili SOLO in modalita' dev/prova (postSave,
 * rami di prova di save/cancel) e il catch di avvio, cablate in inglese: sul telefono non si
 * vedono mai e senza dizionario T() stamperebbe un numero.
 * UX-2 (D83): seconda eccezione, le due frasi dello stato mancante (#status e il rifiuto di
 * Salva). Li' il dizionario NON c'e' davvero — decodeState esce prima di leggere state.i18n —,
 * quindi una chiave sarebbe testo morto: stanno in inglese, cablate, col dettaglio nel title.
 * UX-2 (D99): «Pebble Time 2» e' un nome proprio, uguale in tutte le lingue: cablato anche lui.
 * UX-3 (D116): terza eccezione, i quattro guasti del caricamento di un file e i tempi di
 * #etime: finiscono nel title di #msg (dettaglio tecnico che sul telefono non si legge) o in
 * una riga visibile solo sul dev server, quindi stanno in inglese e fuori dal dizionario. */
(function (root) {
  'use strict';
  var doc = root.document, C = root.GalPageCore, P = root.GalPipeline, fmt = 1, msgIsCap = false, msgIsArm = false, msgIsUnsaved = false;
  var G = { version: '1.1', state: null, tiles: [], added: [], deleted: [], lastPayload: null, timing: {}, editorOpen: false, overCap: false,
            /* S12: pixel delle foto aggiunte ora e foto scelta con l'occhio */
            pixels: {}, pvSlot: null, pvError: null,
            /* UX-3: foto in caricamento, ✕ armata, un'altra foto non entrerebbe nell'invio */
            loading: false, armDel: null, capNext: false };
  /* editor: sorgente, copia ≤ 1024 px (disp), cornice Fw×Fh, vista {scale, tx, ty}, ultimo encode */
  var ed = { src: null, bmp: null, sw: 0, sh: 0, disp: null, dw: 0, dh: 0, name: '', Fw: 300, Fh: 342, cover: 1, scale: 1, tx: 0, ty: 0,
             w: 200, h: 228, rgb: null, crop: null, last: null, dirtyCrop: true, timer: null };
  var scratch = [null, null], ptr = {}, nPtr = 0, EV = ['input', 'change'], navigate = nav;
  /* #12 generazione dei caricamenti; #20 Esci in due tocchi; snapshot iniziale */
  var gen = 0, cancelArmed = false, base = '';
  /* D114: apre/chiude «Regolazioni della foto» nell'editor; la crea init (initToggle) */
  var setEditAdvOpen = null;
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
  /* 1,00 in it/de/fr/es/pt (D42), 1.00 in inglese */
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
  function setTxt(id, t) { var e = el(id); if (e) { e.textContent = t; } }
  /* #42 + D121: il footer e' fisso e la sua altezza cambia di continuo — messaggio, riga #hint,
   * etichette su due righe, rotazione dello schermo —, quindi il fondo del body la insegue: cosi'
   * l'ultima riga della pagina resta raggiungibile. Mai azzerato: con un footer non ancora
   * misurato (DOM finto, pagina appena aperta) vale il valore del foglio. */
  function fitFooter() {
    var f = el('footer');
    if (f && f.offsetHeight > 0 && doc.body) { doc.body.style.paddingBottom = (f.offsetHeight + 8) + 'px'; }
  }
  function setMsg(text, cls, detail) {
    var m = el('msg');
    /* D110 (C-A5/F2): msgIsArm vuol dire «a schermo c'e' il messaggio della ✕ armata», e solo
     * finche' e' vero il disarmo ha il diritto di svuotare #msg. Qualunque altro messaggio
     * (caricamento, errore di lettura, uscita non salvata) lo spegne qui: deleteTile lo rialza
     * subito dopo la sua setMsg, che e' l'unico punto in cui quel messaggio va davvero a schermo. */
    /* UX-3 rev (G03): msgIsUnsaved e' il gemello di msgIsArm per l'avviso dell'uscita armata
     * («tocca di nuovo per uscire senza salvare»). Stessa regola: vale «a schermo c'e' ancora
     * QUEL messaggio», e qualunque altro messaggio lo spegne qui; cancel() lo rialza subito
     * dopo la sua setMsg, l'unico punto in cui quell'avviso va davvero a schermo. */
    msgIsArm = false; msgIsUnsaved = false;
    m.textContent = text || ''; m.className = text ? (cls || '') : '';
    /* U-14 (D72): il dettaglio tecnico sta nel title, non nel testo */
    m.title = detail ? String(detail) : '';
    fitFooter();
  }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : new Date().getTime(); }
  function errText(e) { return (e && e.message) || String(e); }
  /* [valore, testo, id facoltativo, lingua facoltativa]: la lingua (D89) serve agli endonimi di
   * #s_lang, che sono gli unici testi della pagina a NON essere nella lingua della pagina. */
  function fill(sel, opts) {
    var i, o;
    sel.textContent = '';
    for (i = 0; i < opts.length; i++) {
      o = mk('option', null, opts[i][1]); o.value = String(opts[i][0]);
      if (opts[i][2]) { o.id = opts[i][2]; }
      if (opts[i][3]) { o.setAttribute('lang', opts[i][3]); }
      sel.appendChild(o);
    }
  }

  /* -- impostazioni (id s_<campo>: in #settings, in #photos «Cambio foto» (D80) e in
   * #advBody (D88); SELECTS/readSettings/writeSettings lavorano per id, non per sezione) --
   * Le voci si ricostruiscono a ogni cambio di lingua (D36: valori e id delle <option> restano
   * quelli, cambia solo il testo). I nomi propri (font, 12 h/24 h) non stanno nel dizionario. */
  function buildOpts() {
    var o = { lang: [[0, T('opt_lang_auto', C.langName(G.state.lang_auto))]] }, i;
    for (i = 0; i < C.LANGS.length; i++) { o.lang.push([i + 1, C.langName(C.LANGS[i]), null, C.LANGS[i]]); }
    o.layout = [[0, T('opt_layout_a')], [1, T('opt_layout_b')]];
    o.font = [[0, 'Anton'], [1, 'Bebas Neue'], [2, 'Barlow Condensed'], [3, T('opt_font_leco'), 's_font_leco'],
              [4, 'Francois One'], [5, 'Staatliches']];
    o.digit_style = [[0, T('opt_style_solid')], [1, T('opt_style_transp')],
                     [2, T('opt_style_transp_3d'), 's_digit_style_3d1'],
                     [3, T('opt_style_solid_3d'), 's_digit_style_3d2']];
    /* U-11: ogni «automatico» dice da DOVE viene il valore, e sono quattro chiavi diverse
     * (opt_auto, una sola per tutte e quattro, e' uscita dal dizionario). */
    o.clock_mode = [[0, T('opt_clock_auto')], [1, '12 h'], [2, '24 h']];
    o.leading_zero = [[0, T('opt_leading_zero_auto')], [1, T('opt_yes')], [2, T('opt_no')]];
    o.interval_min = [[0, T('opt_never')], [5, T('opt_minutes', 5)], [15, T('opt_minutes', 15)],
                      [30, T('opt_minutes', 30)], [60, T('opt_minutes', 60)], [180, T('opt_hours', 3)],
                      [1440, T('opt_one_day')]];
    o.order = [[0, T('opt_order_seq')], [1, T('opt_order_random')]];
    /* giallo e blu hanno un id perche' su flint non esistono (D86: applyUnavailable li spegne) */
    o.text_color = [[0, T('opt_color_auto')], [1, T('opt_color_white')], [2, T('opt_color_black')],
                    [3, T('opt_color_yellow'), 's_text_color_y'], [4, T('opt_color_blue'), 's_text_color_b']];
    o.outline = [[0, T('opt_outline_auto')], [1, T('opt_outline_always')], [2, T('opt_never')]];
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
    /* D99: il Pebble Time 2 si chiama con il suo nome proprio, uguale in tutte le lingue e quindi
     * fuori dal dizionario (watch_emery non esiste piu'); per il Duo la chiave dice anche che lo
     * schermo e' in bianco e nero, e per un orologio sconosciuto resta la frase sul formato. */
    el('watch').textContent = (p === 'emery') ? 'Pebble Time 2' : (p === 'flint') ? T('watch_flint')
                              : T('watch_unknown', fmt === 2 ? T('watch_fmt_bw') : T('watch_fmt_color'));
    fontArrowLabels();
    showTone();
    helpTexts();
    /* D109/D107: i due testi che NON stanno nel markup — il pulsante «Aggiungi foto», che
     * walkI18n ha appena riscritto e che durante un caricamento dice «Un momento…», e i due
     * pulsanti del footer, che cambiano nome con lo stato — si riscrivono qui in coda. */
    renderAdd();
    footerButtons();
  }
  /* D87: le frecce del font non hanno testo da tradurre («‹» e «›» stanno nel markup): il nome
   * sta in aria-label per chi legge con la voce e in title per chi ci passa sopra, e va rifatto a
   * ogni cambio di lingua come tutto il resto. */
  function arrowLabel(b, t) { if (b) { b.setAttribute('aria-label', t); b.setAttribute('title', t); } }
  function fontArrowLabels() {
    arrowLabel(el('fontPrev'), T('font_prev'));
    arrowLabel(el('fontNext'), T('font_next'));
  }
  var SELECTS = ['lang', 'layout', 'font', 'digit_style', 'clock_mode', 'leading_zero', 'interval_min', 'order', 'text_color', 'outline'];
  /* D86 (U-10/U-11): voci che sul Pebble 2 Duo (flint) non esistono — le due cifre con ombra 3D
   * (la strip ha 3 colori, D26) e i due colori dell'ora (lo schermo e' in bianco e nero). Restano
   * nel markup con id stabili ma spente in DUE modi insieme, disabled E hidden: hidden da solo
   * lo ignora Safari su iOS, disabled da solo le lascia in elenco a fare confusione. Il
   * valore scende a quello equivalente che l'orologio sa davvero fare: stile 2 -> 1 e 3 -> 0,
   * colore 3 -> 1 e 4 -> 2, lo stesso rimappaggio di ui_time.c:683-684.
   * [valore, valore su flint, id dell'option]; l'indice in OPTS.<campo> coincide col valore. */
  var UNAVAIL = { digit_style: [[2, '1', 's_digit_style_3d1'], [3, '0', 's_digit_style_3d2']],
                  text_color: [[3, '1', 's_text_color_y'], [4, '2', 's_text_color_b']] };
  function applyUnavailable(name, sel) {
    var list = UNAVAIL[name], i, o;
    if (!G.state || G.state.platform !== 'flint') { return; }
    for (i = 0; i < list.length; i++) {
      o = el(list[i][2]);
      if (o) { o.disabled = true; o.hidden = true; o.textContent = T('opt_style_no_flint', OPTS[name][list[i][0]][1]); }
      if (sel.value === String(list[i][0])) { sel.value = list[i][1]; }
    }
  }
  /* LECO solo in layout A; stile cifre (D21, D26); voci assenti sul Duo (D86) */
  function applyRules() {
    var layout = +el('s_layout').value, font = el('s_font'), leco = el('s_font_leco'), style = el('s_digit_style'), sv;
    if (leco) { leco.disabled = (layout === 1); }
    if (layout === 1 && font.value === '3') { font.value = '0'; }
    /* LECO non ha sprite: lo stile non si applica e vale 0 (come normalizeSettings) */
    style.disabled = (font.value === '3');
    if (style.disabled) { style.value = '0'; }
    applyUnavailable('digit_style', style);
    applyUnavailable('text_color', el('s_text_color'));
    sv = +style.value;
    /* D62/D98: «Bordo di contrasto» non si disabilita MAI. Anche nel layout B l'alone governa
     * ancora «PM» in 12 h e l'icona di sync col contatore, e la pagina non sa che formato ora
     * usera' davvero l'orologio: spegnere il controllo direbbe una cosa falsa. */
    /* D98: il consiglio sui font vale per i due stili a contorno (1 e 2) e solo per i tre font
     * stretti (Anton, Bebas, Barlow): con «pieno con ombra» (3) non serve, e Francois One e
     * Staatliches sono gia' quelli consigliati. sv e' gia' normalizzato da applyUnavailable,
     * quindi su flint lo stile 2 e' sceso a 1 e il 3 a 0. */
    show(el('s_style_hint'), (sv === 1 || sv === 2) && +font.value <= 2);
    /* S9 R13: su flint l'anello e' 1 px (D26) e sul dithering si legge male: avviso in piu',
     * solo con lo stile trasparente (sv 1: su flint il 2 e' gia' sceso a 1). */
    show(el('styleFlintHelp'), !!G.state && G.state.platform === 'flint' && sv === 1);
    /* D89: «Sotto l'ora» esiste solo con «Ora in alto»; nel layout B la riga sparisce ma i bit
     * restano quelli che sono (il payload li conserva: si ritrovano tornando al layout A). */
    show(el('infoRow'), layout === 0);
    /* S12 D46: font, stile, layout, colore e contorno si vedono subito */
    renderPreview();
  }
  /* D87: le frecce accanto al font passano all'option seguente o precedente fra quelle
   * disponibili (in layout B «Font di sistema» e' disabled) e girano in tondo: dall'ultima si
   * torna alla prima. Poi il giro normale di settingsChanged — anteprima, KB, payload —, lo
   * stesso che farebbe il menu a tendina. */
  function cycleFont(dir) {
    var sel = el('s_font'), o = sel.children, n = o.length, i, k, j;
    for (i = 0; i < n; i++) { if (o[i].value === sel.value) { break; } }
    if (i >= n) { i = 0; }
    for (k = 1; k < n; k++) {
      j = ((i + dir * k) % n + n) % n;
      if (!o[j].disabled) { sel.value = o[j].value; settingsChanged(); return; }
    }
  }
  /* contatore KB e tetto anche sulle impostazioni; la Lingua (D36) ricostruisce testi e tessere.
   * D93: anche la riga sull'ordine delle foto dipende da qui (ordine, intervallo, scossa). */
  function settingsChanged() {
    var v = +el('s_lang').value || 0;
    if (v !== langVal) { langVal = v; applyLang(); renderTiles(); }
    applyRules(); updatePhotosCap(); updateKb();
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
  /* D111: quante foto sono state aggiunte ADESSO — sotto le due l'occhio non ha niente da scegliere */
  function nNew() { var n = 0, i; for (i = 0; i < G.tiles.length; i++) { if (G.tiles[i].kind === 'new') { n++; } } return n; }
  function insertTile(t) { G.tiles.splice(nMovable(), 0, t); }
  function tileNode(t, i, nm, nn) {
    var d = mk('div', 'tile' + (t.kind === 'new' ? ' new' : '') + (t.slot === G.pvSlot && nn >= 2 ? ' pv' : ''));
    var img, nd, eye, x, meta = mk('div', 'meta'), btns = mk('div', 'tbtns');
    /* U-01: POSIZIONE visibile, non lo slot */
    var fo = t.kind === 'foreign', who = t.name || T('tile_slot', i + 1);
    function badge(text, cls) { meta.appendChild(mk('span', 'badge' + (cls ? ' ' + cls : ''), text)); }
    function btn(id, text, label, dis, fn) {
      var b = mk('button', null, text);
      /* #23 */
      b.id = id + t.slot; b.type = 'button'; b.disabled = dis; b.setAttribute('aria-label', T('aria_tile_btn', label, who));
      on(b, 'click', fn); btns.appendChild(b); return b;
    }
    d.id = 'tile_' + t.slot;
    /* U-01: il nome compare una volta sola, nella riga del nome */
    if (t.thumb) { img = mk('img', 'thumb'); img.src = t.thumb; img.alt = ''; } else { img = mk('div', 'thumb empty', ''); }
    d.appendChild(img);
    /* UX-3 rev (G19): uno zero-width space prima dell'ultimo punto rende la rottura preferita
     * «light_landscape» / «.jpg» invece di «light_landscap» / «e.jpg» (il CSS lascia la rottura
     * libera solo come ripiego, per i nomi senza punti). Sta SOLO nel testo visibile: who resta
     * intatto nel title, negli aria-label e nei messaggi, che si leggono ad alta voce. */
    nd = mk('div', 'name', who.replace(/(\.[^.]*)$/, '\u200B$1'));
    /* #26: il nome viene tagliato da MAX_NAME (64 caratteri) e, da UX-3 (D112), va a capo: il
     * CSS di .name lascia due righe (max-height 2.8em) invece dei puntini di sospensione su una
     * riga sola. Il title porta comunque il nome intero, quando lo conosciamo (t.full lo tiene
     * per le foto aggiunte qui: nello stato dal telefono arriva gia' troncato). */
    nd.title = t.full || who;
    meta.appendChild(nd);
    if (t.kind === 'new') { badge(T('badge_new'), 'newb'); }
    if (fo) { badge(T('badge_foreign')); }
    if (t.pending) { badge(T('badge_pending')); }
    if (!t.hasFmt) { badge(T('badge_no_fmt'), 'warnb'); }
    d.appendChild(meta);
    btn('up_', '▲', T('btn_up'), fo || i === 0, function () { moveTile(t.slot, -1); });
    btn('down_', '▼', T('btn_down'), fo || i >= nm - 1, function () { moveTile(t.slot, 1); });
    x = btn('del_', '✕', T('btn_delete'), false, function () { deleteTile(t.slot); });
    /* D110: la ✕ chiede conferma con se stessa. Armata cambia colore e aria-label, cosi' chi
     * legge lo schermo e chi lo ascolta sanno tutti e due che il tocco dopo toglie davvero. */
    if (t.slot === G.armDel) { x.className = 'arm'; x.setAttribute('aria-label', T('msg_del_arm', who)); }
    d.appendChild(btns);
    /* D47: l'occhio solo sulle foto aggiunte adesso (delle altre la pagina ha la sola miniatura,
     * non i pixel). E' sovrapposto alla miniatura — la tessera non cresce di una riga — ma nel
     * DOM sta in fondo: cosi' l'ordine di lettura e di tabulazione resta nome, frecce, elimina,
     * e le tessere continuano ad avere miniatura, testi e pulsanti nelle stesse posizioni. */
    /* D111: l'occhio compare solo quando c'e' da SCEGLIERE, cioe' da due foto nuove in su; con
     * una sola l'anteprima la mostra lo stesso (G.pvSlot) e un interruttore a una via sarebbe
     * un pulsante che non fa niente. Senza occhio niente cornice blu: la classe pv segue. */
    if (t.kind === 'new' && nn >= 2) {
      eye = mk('button', 'eye', '\uD83D\uDC41\uFE0E');
      eye.id = 'eye_' + t.slot; eye.type = 'button';
      eye.setAttribute('aria-label', T('preview_eye', who));
      /* ru: e' un interruttore */
      eye.setAttribute('aria-pressed', t.slot === G.pvSlot ? 'true' : 'false');
      on(eye, 'click', function () { pickPreview(t.slot); });
      d.appendChild(eye);
    }
    return d;
  }
  function moveTile(slot, dir) {
    var i = idx(slot), j = i + dir, t;
    if (i < 0 || j < 0 || j >= G.tiles.length) { return; }
    /* #6: le estranee non si spostano */
    if (G.tiles[i].kind === 'foreign' || G.tiles[j].kind === 'foreign') { return; }
    t = G.tiles[i]; G.tiles[i] = G.tiles[j]; G.tiles[j] = t;
    renderTiles(); updateKb();
  }
  function deleteTile(slot) {
    var i = idx(slot), t, k;
    if (i < 0) { return; }
    /* D110 (U-05): il primo tocco ARMA la ✕ — nessuna finestra di conferma, la tessera resta al
     * suo posto — e il messaggio dice quale foto se ne andrebbe; il secondo la toglie davvero.
     * Un tocco sulla ✕ di un'altra tessera sposta l'arma; ogni altra azione la disarma (updateKb). */
    if (G.armDel !== slot) {
      G.armDel = slot; renderTiles();
      setMsg(T('msg_del_arm', G.tiles[i].name || T('tile_slot', i + 1)), 'warn'); msgIsArm = true;
      /* UX-3 rev (G07, addendum a D110): renderTiles ricostruisce le tessere, quindi la ✕ appena
       * premuta viene distrutta e il fuoco cade sul <body>: da tastiera o con un lettore di
       * schermo il secondo tocco — che e' la conferma — andrebbe ricercato da capo. L'id
       * 'del_' + slot e' stabile, cosi' il fuoco torna sulla STESSA ✕, ora armata. Va per
       * ultimo, dopo setMsg: setMsg passa da fitFooter e cambia il padding del body, e cosi'
       * l'eventuale scroll di focus() cade su un layout gia' assestato. try/catch come per il
       * fuoco di #helpBtn: il DOM finto dei test non ha focus(). */
      try { el('del_' + slot).focus(); } catch (e) { /* niente */ }
      return;
    }
    G.armDel = null;
    t = G.tiles.splice(i, 1)[0];
    if (t.kind === 'new') { for (k = G.added.length - 1; k >= 0; k--) { if (G.added[k].slot === slot) { G.added.splice(k, 1); } } }
    else if (G.deleted.indexOf(slot) < 0) { G.deleted.push(slot); }
    /* S12: i pixel se ne vanno con la tessera */
    delete G.pixels[slot];
    if (G.pvSlot === slot) { G.pvSlot = pvPick(); }
    renderTiles(); updateKb(); renderPreview();
    /* #10 */
    if (!G.overCap) { setMsg(t.kind === 'new' ? T('msg_new_dropped') : T('msg_removed')); }
  }
  function renderTiles() {
    var box = el('tiles'), i, n = G.tiles.length, nm = nMovable(), nn = nNew();
    box.textContent = '';
    for (i = 0; i < n; i++) { box.appendChild(tileNode(G.tiles[i], i, nm, nn)); }
    updatePhotosCap();
    renderAdd();
  }
  /* UX-3 (D109/D117, U-04 + U-14): «Aggiungi foto» e' il gesto principale della pagina ed e'
   * anche l'unico posto in cui si puo' dire perche' a volte non si tocca. Quattro stati, in
   * ordine di precedenza: elenco pieno > foto in caricamento > un'altra foto non entrerebbe in
   * un invio solo > normale (blu). Il caricamento e' solo un ASPETTO — #file resta attivo —
   * perche' il doppio tocco lo neutralizza gia' la generazione «gen» (#12) e il test 3f sceglie
   * due file di fila; spegnere l'input toglierebbe anche la seconda scelta. */
  function renderAdd() {
    var a = el('add'), full = C.freeSlot(G.tiles, allDeleted()) < 0;
    var load = !full && G.loading, cap = !full && !load && G.capNext, dis = full || cap;
    a.className = 'btn' + ((full || load || cap) ? ' off' : ' primary');
    a.textContent = load ? T('btn_loading') : T('add_photo');
    a.disabled = dis; el('file').disabled = dis;
    setTxt('addHelp', full ? T('album_full', C.MAX_SLOTS) : cap ? T('cap_next_help') : T('add_help'));
  }
  /* Contatore e riga sull'ordine, sotto le tessere (D93).
   * - #photosCap: limite spiegato nella pagina (richiesta dell'utente, 05/09) — contatore, oppure,
   *   senza nemmeno una foto, la riga sulle due foto di esempio dell'orologio (D71/D77).
   * - #photosHint: «▲ ▼ per cambiarlo» solo quando quell'ordine conta DAVVERO — almeno due foto
   *   SPOSTABILI (nm, non n: le estranee stanno solo sull'orologio e hanno le frecce spente, quindi
   *   con una foto tua e una estranea non c'e' nessun riordino da suggerire), ordine «come l'elenco»
   *   (a caso l'ordine non si vede) e qualcosa che faccia cambiare foto (intervallo o scossa: senza
   *   nessuno dei due l'orologio resta sulla prima).
   * Dipende dalle impostazioni, quindi si rifa' anche da settingsChanged; mai da applyLang, che
   * gira prima che writeSettings abbia riempito le select (le leggerebbe vuote). */
  function updatePhotosCap() {
    var n = G.tiles.length, nm = nMovable(), st = readSettings();
    el('photosCap').textContent = (n === 0) ? T('photos_cap_empty', C.MAX_SLOTS) : T('photos_cap', n, C.MAX_SLOTS);
    show(el('photosHint'), nm >= 2 && st.order === 0 && (st.interval_min !== 0 || st.shake_next === 1));
  }

  /* -- anteprima della watchface (S12, D46/D47) --
   * Mostra la foto con i PIXEL VERI e l'ora campione nel font, stile, layout, colore e contorno
   * delle impostazioni: il conto lo fa il motore puro GalPreview (preview.js), che porta in JS la
   * griglia e il luma dell'orologio. La pagina conosce i pixel solo delle foto aggiunte adesso
   * (delle altre ha soltanto la miniatura): G.pixels tiene i raw6/raw1 per slot e G.pvSlot dice
   * quale mostrare — l'occhio (D47), che non si ricorda fra un'apertura e l'altra. */
  var PREVIEW_TIME = '12:34';
  function pvTime() { return G.state.preview_time || PREVIEW_TIME; }
  /* Nome e pixel della foto scelta con l'occhio. UX-3 (D105): niente ramo «editor aperto» —
   * con l'editor aperto l'anteprima si disegna nell'altro canvas, quello sotto la cornice, e
   * la sua didascalia non nomina la foto (ce l'ha davanti). Il nome passa da truncateName come
   * nella tessera e nel payload (#26): la didascalia e' un <p class="help"> e un nome
   * lunghissimo andrebbe a capo piu' volte. */
  function pvName() {
    var i = (G.pvSlot === null) ? -1 : idx(G.pvSlot);
    return (i >= 0) ? C.truncateName(G.tiles[i].full || G.tiles[i].name) : '';
  }
  function pvRaw() { return (G.pvSlot !== null && G.pixels[G.pvSlot]) || null; }
  /* ultima foto aggiunta ancora in elenco */
  function pvPick() {
    var i;
    for (i = G.tiles.length - 1; i >= 0; i--) { if (G.tiles[i].kind === 'new') { return G.tiles[i].slot; } }
    return null;
  }
  /* D111: l'occhio sceglie e porta in vista l'anteprima, che sta sotto le impostazioni: senza
   * lo scroll il tocco cambierebbe qualcosa fuori dallo schermo. */
  /* UX-3 rev (G32): l'occhio e' «un'altra azione» come le frecce e le impostazioni, quindi
   * disarma la ✕ (D110) invece di lasciare a schermo «tocca di nuovo ✕ per togliere …» mentre
   * la vista scorre sull'anteprima. Il disarmo passa da updateKb, che con la ✕ armata rifa' le
   * tessere: il renderTiles qui sotto e' allora il secondo: costo accettato, l'alternativa era
   * duplicare il disarmo. */
  function pickPreview(slot) { G.pvSlot = slot; updateKb(); renderTiles(); renderPreview(); scrollInto(el('wfPrev')); }
  /* seconda riga: che cosa ha deciso il calcolo automatico (SOLO i pezzi che sono davvero
   * automatici: un contorno «sempre»/«mai» scelto a mano non va presentato come esito del luma —
   * ru), le avvertenze del motore e, alla fine, la riga sotto l'ora quando c'e' (D90).
   * UX-2 (D90): sparisce la coda fissa «Colori: come sull'orologio» — era vera sempre, quindi non
   * diceva niente — e i due nomi dei colori sono quelli del menu «Colore dell'ora»
   * (opt_color_white/black: preview_white e preview_black erano gli stessi testi in 6 lingue su 6).
   * aria_tile_btn e' il «{0}: {1}» generico gia' in elenco (con lo spazio prima dei due punti
   * in francese): serve da unione per le mezze righe, senza chiavi nuove. */
  function pvNote(r, st) {
    var out = [], n = (r && r.notes) || [], pal = (r && r.pal) || {}, i;
    var col = pal.light ? T('opt_color_white') : T('opt_color_black');
    var hal = pal.halo ? T('preview_outline_on') : T('preview_outline_off');
    if (r && r.luma && r.luma.valid) {
      if (st.text_color === 0 && st.outline === 0) { out.push(T('preview_auto', col, hal)); }
      else if (st.text_color === 0) { out.push(T('aria_tile_btn', T('lbl_text_color'), col)); }
      else if (st.outline === 0) { out.push(T('aria_tile_btn', T('lbl_outline'), hal)); }
    }
    for (i = 0; i < n.length; i++) {
      if (n[i] === 'leco') { out.push(T('preview_note_leco')); }
      else if (n[i] === 'ampm') { out.push(T('preview_note_ampm')); }
      else if (n[i] === 'no_masks') { out.push(T('preview_note_no_masks')); }
    }
    /* D102 (era D90): l'anteprima non disegna la riga info, e lo dice solo quando quella riga
     * sull'orologio c'e' davvero — layout A e almeno una casella accesa —, elencando le SOLE
     * caselle accese nell'ordine dei bit. L'elenco fisso di prima prometteva la data (o la
     * batteria) a chi le aveva tolte e taceva la quarta casella: le etichette sono quelle del
     * gruppo «Sotto l'ora», quindi niente chiavi nuove e niente testi doppi da tradurre. */
    if (st.layout === 0 && (st.info_row & 15) !== 0) {
      /* Le quattro etichette si chiedono per esteso, una chiamata ciascuna: il passo i18n
       * dell'inliner sostituisce con l'indice solo le chiavi scritte LETTERALI nella
       * chiamata, e un nome di chiave chiuso in un array resterebbe tale nella pagina. */
      var lab = [T('opt_info_steps'), T('opt_info_battery'), T('opt_info_date'), T('opt_info_bt')];
      var lst = [];
      for (i = 0; i < lab.length; i++) { if (st.info_row & (1 << i)) { lst.push(lab[i]); } }
      out.push(T('preview_note_info', lst.join(', ')));
    }
    return out.join(' \u00b7 ');
  }
  /* D106: sotto il canvas dell'editor una frase sola, la piu' specifica che c'e' da dire: le
   * cifre non sono quelle del font scelto (LECO, che l'orologio in layout B disegna con Anton),
   * oppure mancano le maschere; altrimenti si dice semplicemente che cosa si sta guardando. Le
   * note del colore automatico restano all'anteprima grande: qui contano ritaglio e cifre. */
  function editCap(r) {
    var n = ((r && r.notes) || []).join(' ');
    return n.indexOf('leco') >= 0 ? T('preview_note_leco')
         : n.indexOf('no_masks') >= 0 ? T('preview_note_no_masks') : T('edit_preview_cap');
  }
  /* -- UX-3 (D105 / U-07): un solo motore, due canvas --
   * Con l'editor aperto la watchface si disegna SOTTO la cornice (#preview), con i colori scelti
   * in «Colori» e #wfPrev nascosto; chiuso l'editor, al suo posto di sempre (#wfPreview), con la
   * foto scelta dall'occhio e i colori del vetro. Prima del primo debounce (ed.last nullo) non
   * c'e' ancora un ritaglio codificato: si esce e il canvas resta com'e'.
   * Un guasto dell'anteprima non deve portarsi via la pagina (le foto e le impostazioni contano
   * di piu'): motore assente, maschere strane o canvas negato degradano a una didascalia. */
  function renderPreview() {
    var edit = G.editorOpen, cv, st, raw, r, t0;
    if (edit && !(ed.last && ed.last.raw)) { return; }
    cv = el(edit ? 'preview' : 'wfPreview');
    try {
      if (!root.GalPreview || typeof root.GalPreview.render !== 'function') { throw new Error('GalPreview'); }
      st = readSettings(); raw = edit ? ed.last.raw : pvRaw(); t0 = now();
      r = root.GalPreview.render({ fmt: fmt, w: ed.w, h: ed.h, raw: raw, settings: st, masks: G.state.masks,
                                   time: pvTime(), sunlight: edit ? el('previewMode').value !== 'nominal' : true, scale: 2 });
      G.timing.renderMs = Math.round(now() - t0);
      cv.width = r.width; cv.height = r.height;
      /* D56/D92: grandezza naturale — il disegno resta a ×2 (backing) ma il canvas occupa i
       * pixel dell'orologio, 200 px CSS su emery e 144 su flint: l'anteprima e' grande quanto
       * l'orologio vero invece di essere il doppio. */
      cv.style.width = (r.width / 2) + 'px';
      putRgba(ctx2d(cv, false), r.rgba, r.width, r.height);
      show(cv, true);
      G.pvError = null;
      if (edit) { setTxt('editPrevCap', editCap(r)); return; }
      /* D90: tre stati, tutti positivi — la foto che si vede, «aggiungine una» quando l'elenco
       * e' vuoto e, quando qualche foto c'e' ma non l'abbiamo in pixel (arriva dallo stato del
       * telefono), la stessa frase che spiega perche' quelle non si vedono qui. */
      setTxt('wfPrevCap', raw ? T('preview_cap_photo', pvName(), pvTime())
                              : (G.tiles.length ? T('preview_cap_none_album') : T('preview_cap_none')));
      setTxt('wfPrevNote', pvNote(r, st));
    } catch (e) {
      G.pvError = errText(e);
      /* D106: nell'editor il canvas NON si nasconde — sotto la cornice resterebbe un buco — e
       * la didascalia avverte che a valere e' il ritaglio; fuori dall'editor resta il «non
       * disponibile» di S12. In nessuno dei due casi si scrive nel footer: quello e' per gli
       * eventi, e un'anteprima e' un di piu'. */
      if (edit) { setTxt('editPrevCap', T('preview_stale')); return; }
      show(cv, false);
      setTxt('wfPrevCap', T('preview_unavailable'));
      setTxt('wfPrevNote', '');
    }
  }

  /* -- contatore KB e tetto -- */
  G.buildPayload = function () { return C.buildPayload({ settings: readSettings(), tiles: G.tiles, deleted: G.deleted, added: G.added }); };
  /* UX-3 (D107 / U-07 b + U-13): i due pulsanti del footer sono gli unici comandi sempre sotto
   * il pollice, e cambiano nome con lo stato invece di spegnersi. Precedenza:
   *   editor aperto  -> «Usa questa foto» / «Non aggiungere» (nessuno dei due spento: con
   *                     l'editor aperto sono gli unici due gesti che contano);
   *   Esci armato    -> «Esci comunque» in rosso (D66: nessun timer, lo stato si vede);
   *   modifiche      -> «Esci senza salvare»;
   *   pagina pulita  -> «Chiudi» (non c'e' niente da perdere: non lo si deve far credere).
   * Salva resta spento solo sopra il tetto o senza stato (#1: un payload "autorevole" con i
   * default e l'ordine vuoto azzererebbe l'album). I testi li scrive SOLO questa funzione — nel
   * markup #save e #cancel non hanno data-i18n — e applyLang la richiama in coda. */
  function footerLabels() {
    var sv = el('save'), cn = el('cancel'), d;
    if (G.editorOpen) {
      cancelArmed = false;
      sv.textContent = T('btn_add_ok'); sv.disabled = false;
      cn.textContent = T('btn_add_cancel'); cn.className = 'btn'; cn.disabled = false;
      return;
    }
    sv.textContent = T('btn_save'); sv.disabled = G.overCap || !G.state.ok;
    d = dirty();
    if (!d) { cancelArmed = false; }
    cn.textContent = d ? (cancelArmed ? T('btn_cancel_armed') : T('btn_cancel')) : T('btn_close');
    cn.className = cancelArmed ? 'btn danger' : 'btn'; cn.disabled = false;
  }
  function footerButtons() { footerLabels(); }
  function snapshot() { return JSON.stringify([readSettings(), G.tiles.map(function (t) { return t.slot; }), G.deleted, G.added.length]); }
  function dirty() { return snapshot() !== base; }
  function updateKb() {
    var kb = C.payloadKb(G.buildPayload()), cap = G.state.cap_kb, m = C.capMessage(kb, cap, G.added.length, T);
    var full = C.freeSlot(G.tiles, allDeleted()) < 0, hint;
    setTxt('kb', T('kb_line', kb, cap));
    /* D91: il conto dei KB e' una cosa da tecnici e per quasi tutti non arriva mai a contare
     * (su Android il tetto e' 900 KB). Si scrive sempre — i test e chi apre la pagina col
     * browser lo leggono — ma si vede solo da meta' tetto in su, quando puo' diventare vero. */
    show(el('kb'), kb >= cap / 2);
    G.overCap = !!m; cancelArmed = false;
    /* UX-3 rev (G03): ogni modifica disarma l'uscita (D107) e con l'arma se ne va anche il suo
     * avviso, come per la ✕ (D110): altrimenti resterebbe a schermo «tocca di nuovo per uscire
     * senza salvare» sotto un pulsante che dice «Esci senza salvare» — o «Chiudi», se la
     * modifica ha riportato la pagina com'era —, cioe' un'istruzione che non funziona piu'.
     * Nessuna guardia su cancelArmed: applyLang passa da footerLabels, che con la pagina
     * pulita lo ha gia' azzerato per conto suo, e l'avviso resterebbe orfano. */
    if (msgIsUnsaved) { setMsg(''); }
    /* D117 (U-14): il tetto si previene, non si spiega dopo. Se un'altra foto non ci starebbe
     * (NEXT_PHOTO_KB = il caso peggiore, dati + miniatura) «Aggiungi foto» si spegne e dice che
     * cosa fare. L'elenco pieno ha il suo messaggio e viene prima; sopra il tetto comanda il
     * rosso di capMessage e questo resta falso, perche' li' la ✕ deve poter riportare sotto. */
    G.capNext = !full && !G.overCap && (kb + C.NEXT_PHOTO_KB[fmt] > cap);
    /* D110: qualunque altra azione — frecce, aggiunta, impostazioni, lingua, chiusura
     * dell'editor — disarma la ✕ e si riprende il footer, se il messaggio era ancora il suo. */
    if (G.armDel !== null) {
      G.armDel = null;
      if (msgIsArm) { setMsg(''); }
      renderTiles();
    }
    renderAdd();
    footerButtons();
    /* D121: la riga grigia sotto il messaggio dice che cosa manca — e con foto nuove che cosa
     * succede dopo Salva —, ma solo quando Salva si puo' davvero toccare: altrimenti sarebbe un
     * invito a un pulsante spento. Sta fuori da #msg, che e' aria-live e lo ripeterebbe a ogni
     * tocco. */
    hint = dirty() && !el('save').disabled && !G.editorOpen;
    setTxt('hint', hint ? (G.added.length ? T('footer_send') : T('unsaved_hint')) : '');
    show(el('hint'), hint);
    fitFooter();
    if (m) { setMsg(m, 'err'); } else if (msgIsCap) { setMsg(''); }
    msgIsCap = !!m;
  }

  /* -- editor: caricamento (createImageBitmap + EXIF, fallback <img>) -- */
  /* D116: i quattro guasti del caricamento non arrivano mai sotto gli occhi di chi usa la
   * pagina — la riga visibile e' sempre msg_read_fail, e questi finiscono nel title di #msg come
   * dettaglio tecnico —, quindi sono in inglese e fuori dal dizionario (quattro chiavi in meno
   * da tradurre in sei lingue). */
  function loadViaImg(file, cb) {
    var img, url, U = root.URL || root.webkitURL;
    if (typeof root.Image !== 'function' || !U || !U.createObjectURL) { cb(new Error('no image decoder')); return; }
    try { url = U.createObjectURL(file); } catch (e) { cb(new Error('invalid file')); return; }
    img = new root.Image();
    img.onload = function () { U.revokeObjectURL(url); cb(null, img); };
    img.onerror = function () { U.revokeObjectURL(url); cb(new Error('image cannot be decoded')); };
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
    /* sotto-rettangolo flint 144:168 tratteggiato, fuori velato */
    if (fmt === 2) {
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
    /* UX-4 (G16 lato JS): r e' il BORDER box e #crop ha 1 px di bordo (page.css): si parte dal
     * primo pixel disegnato e si divide per i soli pixel disegnati, ed.Fw = r.width - 2. */
    return { x: (e.clientX - r.left - 1) * ed.Fw / (r.width - 2), y: (e.clientY - r.top - 1) * ed.Fh / (r.height - 2) };
  }
  function pDown(id, p) { ptr[id] = p; nPtr = ptrIds().length; }
  function pUp(id) { if (ptr[id]) { delete ptr[id]; nPtr = ptrIds().length; } }
  function dist(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }
  function pMove(id, p) {
    var o = ptr[id], ids, a, b, d0, d1, mx, my;
    if (!o || !ed.src) { return; }
    if (nPtr < 2) { ed.tx += p.x - o.x; ed.ty += p.y - o.y; ptr[id] = p; changed(); return; }
    /* pinch: scala attorno al punto medio, poi trascina */
    ids = ptrIds(); a = ptr[ids[0]]; b = ptr[ids[1]];
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
    /* D105: «Colori» cambia solo il sunlight del disegno, non la codifica */
    on(el('previewMode'), 'change', renderPreview);
    /* D119: la coppia inline resta nel markup (nascosta) con i suoi id e i suoi listener — i
     * test la usano —, ma fa esattamente quello che fanno i due pulsanti del footer. */
    on(el('addOk'), 'click', addOk);
    on(el('addCancel'), 'click', cancelCrop);
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
    } catch (e) { setMsg(T('msg_err'), 'err', errText(e)); }
  }
  G.flush = function () { if (ed.timer) { root.clearTimeout(ed.timer); doWork(); return true; } return false; };
  function resample() {
    var t0 = now(), s = ed.scale, r, ctx;
    /* #27: la codifica del ritaglio precedente non vale più */
    ed.last = null;
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
    /* D105: sotto la cornice si vede la watchface, non il solo ritaglio */
    renderPreview();
    /* D114: i tempi servono a chi sviluppa e si vedono solo sul dev server: riga inglese cablata. */
    if (G.state.dev) { setTxt('etime', 'resize ' + G.timing.resampleMs + ' ms · encode ' + G.timing.encodeMs + ' ms'); }
  }
  /* solo per la miniatura: il canvas dell'editor passa da GalPreview come l'anteprima grande */
  function rgbaOf(r, sun, sc) { return (fmt === 2) ? P.preview1Rgba(r.bits, ed.w, ed.h, sc) : P.previewRgba(r.idx, ed.w, ed.h, sun, sc); }
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
    /* #12: vale solo l'ultimo file scelto */
    var name = (file && file.name) ? String(file.name) : T('photo_name_default'), g = ++gen;
    if (G.editorOpen) { closeEditor(); }
    if (C.freeSlot(G.tiles, allDeleted()) < 0) { setMsg(T('album_full', C.MAX_SLOTS), 'err'); return; }
    ed.name = name;
    /* D109 (U-04): decodificare una foto da 12 Mpx sul telefono prende qualche secondo e finora
     * il solo segno era una riga nel footer, lontana dal dito. Il pulsante appena toccato dice
     * «Un momento…» finche' non c'e' un esito; msg_loading resta, perche' dice anche QUALE foto. */
    G.loading = true; renderAdd();
    setMsg(T('msg_loading', C.truncateName(name)));
    loadImage(file, function (err, img) {
      /* superato da una scelta successiva: si scarta (e si libera) */
      if (g !== gen) {
        if (img && typeof img.close === 'function') { try { img.close(); } catch (e) { /* niente */ } }
        /* G.loading lo governa il caricamento nuovo, che l'ha gia' rialzato */
        return;
      }
      G.loading = false; renderAdd();
      if (err) {
        /* UX-3 rev (G25): l'input tiene ancora il file appena fallito e i WebView Chromium non
         * emettono «change» a parita' di selezione: senza azzerarlo, riscegliere LA STESSA foto
         * dopo un errore transitorio non farebbe partire niente. closeEditor lo azzera gia' per
         * tutte le altre uscite. */
        try { el('file').value = ''; } catch (e) { /* niente */ }
        setMsg(T('msg_read_fail', C.truncateName(name)), 'err', errText(err)); return;
      }
      ed.name = name;
      try { startEditor(img); } catch (e) { closeEditor(); setMsg(T('msg_err'), 'err', errText(e)); }
    });
  }
  function startEditor(img) {
    var t0 = now(), f, c, wrap, cv, pv, cw, hl;
    /* #12 */
    if (ed.bmp && ed.bmp !== img) { try { ed.bmp.close(); } catch (e) { /* niente */ } }
    ed.src = img; ed.sw = img.naturalWidth || img.width; ed.sh = img.naturalHeight || img.height;
    /* D116: inglese cablato, finisce nel title di #msg */
    if (!(ed.sw > 0 && ed.sh > 0)) { throw new Error('invalid dimensions'); }
    ed.bmp = (typeof img.close === 'function') ? img : null;
    /* copia ridotta per la cornice */
    f = 1024 / Math.max(ed.sw, ed.sh);
    if (f >= 1) { ed.disp = img; ed.dw = ed.sw; ed.dh = ed.sh; }
    else { c = doc.createElement('canvas'); downscale(img, 0, 0, ed.sw, ed.sh, c, Math.max(1, Math.round(ed.sw * f)), Math.max(1, Math.round(ed.sh * f))); ed.disp = c; ed.dw = c.width; ed.dh = c.height; }
    G.timing.loadMs = Math.round(now() - t0);
    /* D121 + D110 (C-A5/F1): si passa da updateKb, non dal solo footerButtons, perche' aprire
     * l'editor cambia tre cose insieme — i due pulsanti diventano «Usa questa foto»/«Non
     * aggiungere», la riga #hint deve tacere (Salva non e' piu' Salva) e scegliere una foto e'
     * «un'altra azione», quindi disarma la ✕ rimasta rossa sotto l'editor. */
    show(el('editor'), true); G.editorOpen = true; updateKb();
    wrap = el('cropWrap');
    /* D113 (U-06): la cornice lascia una corsia di 28 px per lato (il padding di #cropWrap, che
     * clientWidth COMPRENDE) cosi' il pollice puo' scorrere la pagina senza trascinare la foto,
     * e non supera l'altezza utile dello schermo meno cio' che le sta intorno (~220 px fra
     * intestazione, didascalie, zoom e footer fisso). Senza una misura — DOM finto, WebView che
     * non ha ancora impaginato — restano i 300 px di sempre. Si misura all'apertura e basta:
     * nessun handler di resize sull'editor. */
    cw = (wrap && wrap.clientWidth > 0) ? wrap.clientWidth - 56 : 300;
    hl = Math.floor(((root.innerHeight || 600) - 220) * 200 / 228);
    ed.Fw = Math.max(120, Math.min(300, cw, hl)); ed.Fh = Math.round(ed.Fw * 228 / 200);
    cv = el('crop'); cv.width = ed.Fw; cv.height = ed.Fh; cv.style.width = ed.Fw + 'px'; cv.style.height = ed.Fh + 'px';
    /* D105: il canvas sotto la cornice e' l'anteprima della watchface e prende il posto di
     * quella grande (#wfPrev sparisce finche' l'editor e' aperto): backing a ×2, larghezza CSS
     * pari ai pixel dell'orologio, 200 px su emery e 144 su flint. */
    pv = el('preview'); pv.width = ed.w * 2; pv.height = ed.h * 2; pv.style.width = ed.w + 'px';
    show(el('wfPrev'), false);
    setTxt('editPrevCap', T('edit_preview_cap'));
    /* D115: il nome del file e' un nome proprio e i pixel sono numeri: fuori dal dizionario. */
    setTxt('editName', C.truncateName(ed.name));
    el('editName').title = ed.name + ' · ' + ed.sw + '×' + ed.sh + ' px';
    setTxt('etime', ''); ed.rgb = null; ed.last = null; setMsg('');
    fitView();
    /* D114: «Regolazioni della foto» nasce chiuso, ma i suoi valori restano da una foto
     * all'altra: se uno non e' piu' quello di fabbrica il blocco si apre da solo, altrimenti
     * l'effetto (una foto scurita, un dithering diverso) sarebbe senza causa visibile. */
    setEditAdvOpen(+el('gamma').value !== 1 || +el('lift').value !== 0 || el('dither').value !== 'fs' ||
                   !!el('sunlight').checked || el('previewMode').value !== 'sun');
    scrollToEditor();
  }
  function closeEditor() {
    var i;
    if (ed.timer) { root.clearTimeout(ed.timer); ed.timer = null; }
    if (ed.bmp) { try { ed.bmp.close(); } catch (e) { /* niente */ } }
    /* #35: memoria dei dimezzamenti */
    for (i = 0; i < scratch.length; i++) { if (scratch[i]) { scratch[i].width = 0; scratch[i].height = 0; } }
    if (ed.disp && ed.disp !== ed.src) { try { ed.disp.width = 0; ed.disp.height = 0; } catch (e) { /* niente */ } }
    ed.src = ed.bmp = ed.disp = ed.rgb = ed.last = null; ptr = {}; nPtr = 0;
    show(el('editor'), false); G.editorOpen = false;
    try { el('file').value = ''; } catch (e) { /* niente */ }
    /* D105: l'anteprima grande torna al suo posto */
    show(el('wfPrev'), true);
    /* ru: da qui passa anche il footer, che torna «Salva / Chiudi» dopo un errore dell'editor */
    updateKb();
    /* S12: si torna alla foto scelta con l'occhio */
    renderPreview();
  }
  function addOk() {
    var slot, r, entry, th, msg;
    try {
      if (!ed.src) { return; }
      G.flush();
      if (ed.dirtyCrop || !ed.rgb) { resample(); }
      if (!ed.last) { encodeNow(); }
      slot = C.freeSlot(G.tiles, allDeleted());
      if (slot < 0) { setMsg(T('album_full', C.MAX_SLOTS), 'err'); return; }
      r = ed.last;
      /* #11: la miniatura e' un di piu'. toDataURL puo' lanciare (canvas "tainted", memoria) e
       * makeThumb puo' tornare null (nessun JPEG e PNG oltre i 6.000 caratteri): in entrambi i
       * casi la foto si aggiunge lo stesso, senza thumb nel payload, e il messaggio lo dice. */
      try { th = makeThumb(r); } catch (te) { th = null; }
      entry = { slot: slot, photo_id: r.photo_id, fmt: fmt, len: r.len, crc: r.crc, data: P.b64url(r.raw), name: C.truncateName(ed.name) };
      if (th) { entry.thumb = th; }
      G.added.push(entry);
      /* #6: prima delle estranee; #26: nome intero */
      insertTile({ slot: slot, kind: 'new', name: entry.name, thumb: th, hasFmt: true, pending: false, full: ed.name });
      /* S12 D47: l'ultima aggiunta e' quella in anteprima */
      G.pixels[slot] = r.raw; G.pvSlot = slot;
      /* ru: l'anteprima la rifa' closeEditor */
      /* UX-3 rev (G26): niente terzo updateKb. insertTile e G.added sono gia' aggiornati quando
       * closeEditor chiama il suo, quindi il secondo ricalcolerebbe lo stesso payload (un
       * JSON.stringify di tutte le foto aggiunte) per lo stesso risultato. */
      closeEditor(); renderTiles();
      /* D118: la foto appena aggiunta si vede dov'e' finita */
      scrollInto(el('tile_' + slot));
      /* D118: il verde invita a toccare Salva, quindi si mostra solo quando Salva si puo'
       * davvero toccare; sopra il tetto o senza stato comanda il rosso di updateKb. */
      if (!G.overCap && G.state.ok) {
        /* D78: due frasi complete, nessuna composizione */
        msg = th ? T('msg_added') : T('msg_added_no_thumb');
        setMsg(msg, 'okmsg');
      }
    } catch (e) { setMsg(T('msg_err'), 'err', errText(e)); }
  }
  G.addFile = openEditor; G.editor = ed; G.scratch = scratch;

  /* -- trasporto: dev (POST /save + token), telefono (pebblejs://close#), prova -- */
  function loc() { return root.location || {}; }
  function returnTo() {
    var m = /[?&]return_to=([^&#]*)/.exec(String(loc().search || '')), v, sch;
    if (!m) { return null; }
    try { v = decodeURIComponent(m[1]); } catch (e) { v = m[1]; }
    /* #33: solo http(s) o relativo, mai javascript:/data: */
    sch = /^([a-z][a-z0-9+.\-]*):/i.exec(v.replace(/[\s\u0000-\u001f]/g, ''));
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
    /* un solo esito */
    function done() {
      var r = null;
      if (fin) { return; }
      fin = true; root.clearTimeout(tm);
      try { r = JSON.parse(x.responseText); } catch (e) { r = null; }
      if (x.status === 200 && r && r.ok === true) {
        setMsg('Saved (seq ' + r.seq + '): back to the app', 'okmsg');
        navigate(rt + encodeURIComponent(JSON.stringify({ v: 1, dev: true, seq: r.seq })));
      } else {
        setMsg('Save failed: ' + ((r && r.error) || why || (x.status ? 'HTTP ' + x.status : 'dev server unreachable')), 'err');
        footerButtons();
      }
    }
    x.open('POST', '/save', true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onreadystatechange = function () { if (x.readyState === 4) { done(); } };
    /* dev server fermo: non restare su "Invio…" */
    tm = root.setTimeout(function () {
      why = 'no reply in 30 s'; try { x.abort(); } catch (e) { /* niente */ } done();
    }, 30000);
    el('save').disabled = true; setMsg('Sending ' + kb + ' KB…');
    try { x.send(JSON.stringify(payload)); } catch (e) { why = errText(e); done(); }
  }
  function save() {
    var payload, kb, m;
    try {
      /* D107: con l'editor aperto Salva e' «Usa questa foto» */
      if (G.editorOpen) { addOk(); return; }
      /* #1 + D83: senza stato il payload sarebbe "autorevole" con i default e l'ordine vuoto, e
       * azzererebbe l'album. Il rifiuto e' in inglese cablato: qui il dizionario non esiste. */
      if (!G.state.ok) { setMsg('Settings not received: reopen them from the Pebble app.', 'err', G.state.error); return; }
      payload = G.buildPayload(); kb = C.payloadKb(payload); m = mode();
      if (kb > G.state.cap_kb) { setMsg(C.capMessage(kb, G.state.cap_kb, G.added.length, T), 'err'); return; }
      G.lastPayload = payload;
      /* D107: un Salva disarma l'uscita */
      cancelArmed = false; footerButtons();
      if (m === 'dev') { postSave(payload, kb); }
      else if (m === 'phone') {
        /* D108: la WebView la chiude l'app Pebble quando riceve il payload, ma se l'evento si
         * perde (app in background, telefono lento) resta una pagina con Salva spento e nessuna
         * via d'uscita: dopo 5 s il pulsante torna attivo e si puo' riprovare. Il messaggio
         * resta, perche' l'invio potrebbe essere andato a buon fine lo stesso. */
        setMsg(T('msg_sending')); el('save').disabled = true;
        root.setTimeout(function () { footerButtons(); }, 5000);
        navigate('pebblejs://close#' + encodeURIComponent(JSON.stringify(payload)));
      } else { setMsg('Test mode: payload of ' + kb + ' KB (not sent)', 'okmsg'); }
    } catch (e) { setMsg(T('msg_err'), 'err', errText(e)); }
  }
  /* D107/D118: «Non aggiungere» — dal footer o dalla coppia inline — chiude l'editor, lo dice e
   * riporta in vista «Aggiungi foto», che e' il punto da cui si riprova. */
  /* UX-3 rev (G24): sopra il tetto comanda il rosso che closeEditor -> updateKb ha appena
   * rimesso; «Foto non aggiunta» lo cancellerebbe e la pagina tornerebbe muta sul guasto che
   * blocca Salva. Stessa guardia della ✕ (#10) e di msg_added (D118). */
  function cancelCrop() { closeEditor(); if (!G.overCap) { setMsg(T('msg_crop_cancel')); } scrollInto(el('add')); }
  function cancel() {
    var m = mode();
    try {
      /* D107: con l'editor aperto Esci e' «Non aggiungere» */
      if (G.editorOpen) { cancelCrop(); return; }
      /* #20/D66: nessuna finestra di conferma e nessun timer: avverte il pulsante stesso */
      if (dirty() && !cancelArmed) {
        cancelArmed = true; footerButtons(); setMsg(T('msg_unsaved'), 'warn'); msgIsUnsaved = true; return;
      }
      /* C-A5/F3: se la pagina NON si chiude (modalita' prova, WebView che ignora la
       * navigazione) il pulsante deve tornare «Esci senza salvare»: altrimenti resta rosso
       * «Esci comunque» mentre l'arma e' gia' caduta e il tocco dopo riarma invece di uscire. */
      cancelArmed = false; footerButtons();
      if (m === 'dev') { navigate(returnTo()); }
      else if (m === 'phone') { navigate('pebblejs://close#'); }
      else { setMsg('Test mode: closed without changes'); }
    } catch (e) { setMsg(T('msg_err'), 'err', errText(e)); }
  }

  /* -- avvio lento del persist (v1.9, perf 04/09) -- */
  /* La procedura sta in UN POSTO SOLO (D81): la sezione #help, sempre disponibile. L'avviso
   * #slow — che compare quando l'orologio ha misurato un'apertura del file persist oltre
   * C.slowThresholdMs(), soglia che cresce col numero di foto — ha soltanto una frase e un
   * pulsantino che porta li'. Il testo viene costruito nel DOM: nessuna duplicazione nell'HTML
   * inlinato (tetto della pagina). */
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
  /* testi dell'avviso #slow e della sezione Aiuto: rifatti a ogni cambio di lingua.
   * D81: nell'avviso c'e' la sola frase (#slowFix resta nel markup, vuoto: la procedura sta
   * nell'Aiuto, dove il pulsantino #slowHelpBtn porta chi legge). */
  function helpTexts() {
    var sec = C.slowSeconds(G.state.watch, lang);
    if (sec) { el('slowLead').textContent = T('slow_lead', sec); }
    show(el('slow'), !!sec);
    el('helpWhy').textContent = T('help_why', C.MAX_SLOTS);
    fixProcedure(el('helpFix'));
  }
  /* D88: due pannelli a fisarmonica con lo stesso meccanismo — l'Aiuto e «Altre impostazioni» —,
   * il secondo con una freccia da girare (▾ chiuso, ▴ aperto). Torna setOpen(open), che serve ad
   * aprirli da fuori senza un secondo giro di codice: l'Aiuto dal pulsantino dell'avviso di avvio
   * lento, «Altre impostazioni» all'avvio quando dentro c'e' un valore non di fabbrica.
   * scroll = portare in vista il pannello aperto (#42: sotto l'Aiuto c'e' solo il footer fisso,
   * aperto non si vedrebbe; «Altre impostazioni» invece ha sotto tutta la pagina). */
  function initToggle(btnId, bodyId, scroll) {
    var body = el(bodyId), btn = el(btnId), arrow = null, c = (btn && btn.children) || [], i;
    for (i = 0; i < c.length; i++) { if (/(^|\s)arrow(\s|$)/.test(c[i].className || '')) { arrow = c[i]; break; } }
    function setOpen(open) {
      show(body, open);
      if (btn) { btn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
      if (arrow) { arrow.textContent = open ? '▴' : '▾'; }
    }
    on(btn, 'click', function () {
      var open = body.style.display === 'none';
      setOpen(open);
      if (open && scroll) { scrollInto(body); }
    });
    return setOpen;
  }

  /* -- avvio -- */
  function init() {
    var s = G.state = C.decodeState(String(loc().hash || '')), i, nv = root.navigator, setHelpOpen, setAdvOpen, advOpen;
    /* #4: iOS → 200 KB */
    s.cap_kb = C.capForUa(s.cap_kb, nv && nv.userAgent, nv);
    fmt = s.fmt; ed.w = (fmt === 2) ? 144 : 200; ed.h = (fmt === 2) ? 168 : 228;
    G.tiles = C.buildTiles(s);
    /* S10: la lingua prima di ogni testo (applyLang riempie anche #dither e l'Aiuto) */
    langVal = s.settings.lang;
    applyLang();
    setHelpOpen = initToggle('helpBtn', 'helpBody', true);
    setAdvOpen = initToggle('advBtn', 'advBody', false);
    /* D114: «Regolazioni della foto», terzo pannello a fisarmonica */
    setEditAdvOpen = initToggle('editAdvBtn', 'editAdvBody', false);
    /* D81: dall'avviso di avvio lento si arriva all'Aiuto con un tocco (niente href="#help":
     * l'hash della pagina e' lo stato, riscriverlo la ricaricherebbe). */
    on(el('slowHelpBtn'), 'click', function () {
      setHelpOpen(true); scrollInto(el('help'));
      /* G22: il fuoco segue lo scroll e finisce sul pulsante che porta aria-expanded="true",
       * cosi' il Tab prosegue da li' e non torna in cima alla pagina. */
      try { el('helpBtn').focus(); } catch (e) { /* niente */ }
    });
    /* D81: gia' aperto, ma senza scroll all'avvio */
    if (C.slowSeconds(s.watch, lang)) { setHelpOpen(true); }
    /* D83: senza stato il dizionario non c'e' — riga in inglese cablata */
    if (!s.ok) {
      el('status').textContent = 'Settings not received: Save is disabled. Reopen the settings from the Pebble app.';
      el('status').title = String(s.error || '');
      show(el('status'), true);
    }
    /* D82: la nota sulle impostazioni dell'orologio solo quando e' vera — nessuna impostazione
     * arrivata con lo stato e un orologio che si e' gia' fatto le sue (CRC ≠ default). */
    show(el('settingsNote'), !s.settingsSet && C.settingsDiffer(s.watch));
    writeSettings(s.settings);
    /* D88: «Altre impostazioni» si apre da solo se dentro c'e' qualcosa di diverso dalla
     * fabbrica — le caselle «Sotto l'ora» contano solo con «Ora in alto», dove si vedono — o se
     * lo stato non e' arrivato (l'unico caso in cui conviene mostrare tutto). Si calcola UNA
     * volta, all'avvio: da li' in poi comanda il pulsante, la pagina non ha memoria. */
    advOpen = s.settings.clock_mode !== 0 || s.settings.leading_zero !== 0 || s.settings.outline !== 0 ||
              (s.settings.layout === 0 && s.settings.info_row !== 15) || !s.ok;
    setAdvOpen(advOpen);
    show(el('sunlightRow'), fmt === 1); show(el('previewModeRow'), fmt === 1);
    /* D114: i tempi del ritaglio solo sul dev server */
    show(el('etime'), !!s.dev);
    renderTiles();
    for (i = 0; i < SELECTS.length; i++) { on(el('s_' + SELECTS[i]), 'change', settingsChanged); }
    for (i = 0; i < 5; i++) { on(el(i < 4 ? 's_info_row_b' + i : 's_shake_next'), 'change', settingsChanged); }
    /* D87 */
    on(el('fontPrev'), 'click', function () { cycleFont(-1); });
    on(el('fontNext'), 'click', function () { cycleFont(1); });
    on(el('file'), 'change', function () { var f = this.files && this.files[0]; if (f) { openEditor(f); } });
    on(el('save'), 'click', save); on(el('cancel'), 'click', cancel);
    bindGestures();
    base = snapshot();
    updateKb();
    /* D121: il fondo della pagina segue l'altezza vera del footer, anche quando cambia perche'
     * lo schermo gira o un'etichetta va su due righe. la on() della pagina ignora chi non ha addEventListener
     * (il root finto dei test): niente listener, nessun errore. */
    fitFooter();
    on(root, 'resize', fitFooter); on(root, 'orientationchange', fitFooter);
  }
  try { init(); } catch (e) { try { setMsg(dict ? T('msg_err') : 'Something went wrong while opening the page. Reopen the settings from the Pebble app.', 'err', errText(e)); } catch (x) { /* niente */ } }
}(this));

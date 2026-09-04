#!/usr/bin/env node
/* test_devpage.js — test host della config page incorporata nel dev server
 * (tools/galleria_devserver.py, PAGE_HTML). Revisione post code-review 29/08 (F13).
 *
 * La pagina si ottiene con `python3 galleria_devserver.py --dump-page` e pool.json/state.json
 * reali con `--dump-json pool|state` (nessun server, nessuna foto: niente Pillow). Lo <script>
 * gira in vm.runInNewContext con uno stub DOM minimo (solo quello che la pagina usa:
 * getElementById sugli elementi della pagina o creati E appesi, createElement/createTextNode,
 * appendChild, textContent, value, dataset, style, addEventListener) e un XMLHttpRequest finto
 * che mette in coda le richieste (si consegnano con flush(): così si prova anche un clic prima
 * dell'arrivo di pool/stato) e registra i POST.
 *
 * Copre: caricamento senza `settings` in state.json (F13: campi dai default di
 * pool.json.settings_defaults, #head lo dice) e con; i campi s_<chiave> di SETTINGS_SPEC
 * (S8: 11, con `digit_style`) + dataset.built;
 * <select id=scenario> con 6 opzioni; Salva → un solo POST /save {settings (tutti interi), order,
 * photos, scenario} e redirect a return_to + token; Salva senza return_to → #msg e re-render;
 * Annulla → href = return_to oppure reload(); errori (POST fallito, campo non numerico, clic
 * prima del caricamento, GET falliti); render() ripetuto senza campi doppi; interazioni su
 * ordine e checkbox del pool; return_to malformato.
 *
 * Si esegue da solo (`node test/test_devpage.js`, python3 nel PATH) o con `make -C test jstest`.
 * Senza python3 stampa "saltato" ed esce 0 (node non è una dipendenza dell'SDK, python3 sì,
 * ma il test non deve rompere `make` su una macchina spoglia).
 */

'use strict';

var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var DEVSERVER = path.join(__dirname, '..', '..', '..', 'tools', 'galleria_devserver.py');
/* S8 (D21/D22): + `digit_style` in coda (byte 12 del blob) e font fino a 5. */
var SETTINGS_KEYS = ['layout', 'font', 'clock_mode', 'leading_zero', 'text_color', 'outline',
                     'interval_min', 'order', 'shake_next', 'info_row', 'digit_style'];
var NKEYS = SETTINGS_KEYS.length;                 /* campi resi dalla pagina = SETTINGS_SPEC */
var SETTINGS_DEFAULTS = { layout: 0, font: 0, clock_mode: 0, leading_zero: 0, text_color: 0,
                          outline: 0, interval_min: 30, order: 0, shake_next: 1, info_row: 15,
                          digit_style: 0 };
/* opzioni attese per campo (settings.c: settings_validate(); info_row è un <input number>) */
var OPTION_COUNT = { layout: 2, font: 6, clock_mode: 3, leading_zero: 3, text_color: 5,
                     outline: 3, interval_min: 7, order: 2, shake_next: 2, digit_style: 4 };
var SCENARIOS = ['photo', 'seq', 'dup', 'crc', 'interrupt', 'none'];
var RT = 'http://127.0.0.1:5555/close?';
var TOKEN2 = '%7B%22v%22%3A1%2C%22dev%22%3Atrue%2C%22seq%22%3A2%7D';

var g_ok = 0, g_fail = 0;

function check(cond, what) {
  if (cond) { g_ok++; } else { g_fail++; console.log('FAIL ' + what); }
}

function eq(got, exp, what) {
  if (got === exp) { g_ok++; }
  else { g_fail++; console.log('FAIL ' + what + ': ' + JSON.stringify(got) + ' invece di ' + JSON.stringify(exp)); }
}

function eqJson(got, exp, what) {                 /* confronto ordinato (l'ordine delle chiavi conta) */
  eq(JSON.stringify(got), JSON.stringify(exp), what);
}

function contains(str, sub, what) {
  if (typeof str === 'string' && str.indexOf(sub) >= 0) { g_ok++; }
  else { g_fail++; console.log('FAIL ' + what + ': ' + JSON.stringify(str) + ' non contiene ' + JSON.stringify(sub)); }
}

function notContains(str, sub, what) {
  if (typeof str === 'string' && str.indexOf(sub) < 0) { g_ok++; }
  else { g_fail++; console.log('FAIL ' + what + ': ' + JSON.stringify(str) + ' contiene ' + JSON.stringify(sub)); }
}

function errText(e) { return e && e.name ? e.name + ': ' + e.message : String(e); }

/* una sezione che esplode (p.es. campo mancante su una pagina rotta) conta un FAIL e non ferma
 * le altre: la riga di riepilogo arriva sempre */
function section(name, fn) {
  try { fn(); } catch (e) { g_fail++; console.log('FAIL sezione ' + name + ': eccezione ' + errText(e)); }
}

/* ------------------------------------------------ 0. la pagina e i JSON reali dal server --- */

function runServer(args) {
  return cp.execFileSync('python3', [DEVSERVER].concat(args),
                         { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 << 20 })
           .toString('utf8');
}

/* TEST_DEVPAGE_FILE=… prova un HTML alternativo (--page): serve alla prova negativa sulla pagina
 * pre-F13 (deve fallire) e, in S6, a una pagina esterna con lo stesso contratto. */
var PAGE, PAGE_ARGS = ['--dump-page'];
if (process.env.TEST_DEVPAGE_FILE) { PAGE_ARGS.push('--page', process.env.TEST_DEVPAGE_FILE); }
try {
  PAGE = runServer(PAGE_ARGS);
} catch (e) {
  if (e.code === 'ENOENT') {
    console.log('test_devpage: saltato (python3 non trovato)');
    process.exit(0);
  }
  console.log('FAIL --dump-page: ' + errText(e) + (e.stderr ? '\n' + String(e.stderr).slice(-400) : ''));
  console.log('test_devpage: 0 ok, 1 falliti');
  process.exit(1);
}

var REAL_POOL = JSON.parse(runServer(['--dump-json', 'pool']));
var REAL_STATE = JSON.parse(runServer(['--dump-json', 'state']));
var REAL_STATE_SET = JSON.parse(runServer(['--dump-json', 'state', '--settings',
                                           '{"layout": 1, "info_row": 7}', '--scenario', 'dup']));

section('0. pagina e JSON reali', function () {
  check(PAGE.length > 1000 && PAGE.indexOf('<!doctype html>') === 0, '--dump-page: pagina HTML intera');
  contains(PAGE, '<meta charset="utf-8">', '--dump-page: charset utf-8');
  contains(PAGE, 'è', '--dump-page: UTF-8 intatto (contiene «è»)');
  var scripts = PAGE.match(/<script>[\s\S]*?<\/script>/g) || [];
  eq(scripts.length, 1, 'pagina: uno e un solo <script> incorporato');
  check(!/<script\s+src=/.test(PAGE), 'pagina: nessuno script esterno');
  contains(PAGE, '"use strict";', 'pagina: strict mode');
  check(!/\b(let|const)\s+\w+\s*=/.test(scripts[0] || '') && !/=>/.test(scripts[0] || ''),
        'pagina: niente let/const/arrow (ES5, come il PKJS)');

  eqJson(Object.keys(REAL_POOL), ['pool', 'slots_max', 'settings_defaults'],
         'pool.json reale: chiavi pool, slots_max, settings_defaults (F13)');
  eq(REAL_POOL.slots_max, 12, 'pool.json reale: slots_max 12');
  eqJson(REAL_POOL.pool, [], 'pool.json reale senza --album: pool vuoto');
  eqJson(Object.keys(REAL_POOL.settings_defaults), SETTINGS_KEYS,
         'pool.json reale: settings_defaults con le ' + NKEYS + ' chiavi nell\'ordine di SETTINGS_SPEC');
  eqJson(REAL_POOL.settings_defaults, SETTINGS_DEFAULTS,
         'pool.json reale: settings_defaults = settings_set_defaults() (interval 30, shake 1, info_row 15)');

  check(!('settings' in REAL_STATE), 'state.json reale senza --settings: nessuna chiave `settings`');
  eqJson(Object.keys(REAL_STATE), ['v', 'full', 'seq', 'order', 'deleted', 'photos', 'hooks'],
         'state.json reale: chiavi del payload full');
  eq(REAL_STATE.seq, 1, 'state.json reale: seq 1');
  eq(REAL_STATE.hooks.scenario, 'photo', 'state.json reale: scenario photo');
  check(REAL_STATE_SET.settings && Object.keys(REAL_STATE_SET.settings).length === NKEYS,
        'state.json reale con --settings: ' + NKEYS + ' impostazioni');
  eq(REAL_STATE_SET.settings.layout, 1, 'state.json reale con --settings: layout 1');
  eq(REAL_STATE_SET.settings.info_row, 7, 'state.json reale con --settings: info_row 7');
  eq(REAL_STATE_SET.settings.interval_min, 30, 'state.json reale con --settings: il resto ai default');
  eq(REAL_STATE_SET.hooks.scenario, 'dup', 'state.json reale con --scenario dup');
});

var SCRIPT_M = /<script>([\s\S]*?)<\/script>/.exec(PAGE);
if (!SCRIPT_M) {
  console.log('FAIL pagina: nessun <script> incorporato, impossibile eseguirla');
  console.log('test_devpage: ' + g_ok + ' ok, ' + (g_fail + 1) + ' falliti');
  process.exit(1);
}
var SCRIPT = SCRIPT_M[1];
var MARKUP = PAGE.replace(/<script>[\s\S]*?<\/script>/g, '');

/* --------------------------------------------------------------- fixture: pool e stato --- */

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* n foto finte sopra il pool reale (vuoto): stesse chiavi di pool_dict() */
function poolFixture(n, dupId) {
  var p = clone(REAL_POOL), k;
  for (k = 0; k < n; k++) {
    p.pool.push({ i: k, name: 'foto' + k + '.jpg', photo_id: dupId ? 1000 : 1000 + k,
                  crc6: 0x10 + k, crc1: 0x20 + k,
                  preview: '/preview/' + k + '.png', preview_flint: '/preview/' + k + '.png?flint=1' });
  }
  return p;
}

/* slot k = foto k, una voce per FORMATO come state_dict() */
function stateFixture(base, n, dupId) {
  var s = clone(base), k;
  s.order = []; s.photos = [];
  for (k = 0; k < n; k++) {
    s.order.push(k);
    s.photos.push({ slot: k, photo_id: dupId ? 1000 : 1000 + k, name: 'foto' + k + '.jpg', fmt: 1,
                    len: 34200, crc: 0x10 + k, url: '/photo/' + k + '.raw6?b64=1' });
    s.photos.push({ slot: k, photo_id: dupId ? 1000 : 1000 + k, name: 'foto' + k + '.jpg', fmt: 2,
                    len: 3024, crc: 0x20 + k, url: '/photo/' + k + '.raw1?b64=1' });
  }
  return s;
}

/* -------------------------------------------------------------------------- stub DOM --- */

function El(tag) {
  this.tagName = String(tag).toUpperCase();
  this.children = [];
  this.parentNode = null;
  this.dataset = {};
  this.style = {};
  this.className = '';
  this._text = '';
  this._value = '';
  this._sel = undefined;        /* select: undefined = mai impostato (→ prima option), -1 = valore ignoto */
  this._id = '';
  this._listeners = {};
  this.checked = false;
  this.disabled = false;
}
Object.defineProperty(El.prototype, 'id', {
  get: function () { return this._id; },
  set: function (v) { this._id = String(v); }
});
Object.defineProperty(El.prototype, 'textContent', {
  get: function () {
    if (!this.children.length) { return this._text; }
    var out = '', k;
    for (k = 0; k < this.children.length; k++) { out += this.children[k].textContent; }
    return out;
  },
  set: function (v) {
    var k;
    for (k = 0; k < this.children.length; k++) { this.children[k].parentNode = null; }
    this.children = [];
    this._text = String(v);
  }
});
Object.defineProperty(El.prototype, 'value', {
  get: function () {
    if (this.tagName !== 'SELECT') { return this._value; }
    if (this._sel === undefined) { return this.children.length ? this.children[0]._value : ''; }
    return this._sel < 0 ? '' : this.children[this._sel]._value;
  },
  set: function (v) {
    v = String(v);
    if (this.tagName !== 'SELECT') { this._value = v; return; }
    var k;
    this._sel = -1;                                    /* come nel browser: valore senza <option> → "" */
    for (k = 0; k < this.children.length; k++) {
      if (this.children[k].tagName === 'OPTION' && this.children[k]._value === v) { this._sel = k; break; }
    }
  }
});
El.prototype.appendChild = function (c) {
  if (!(c instanceof El)) { throw new TypeError('appendChild: non è un nodo'); }
  if (c.parentNode) { c.parentNode.removeChild(c); }
  this.children.push(c);
  c.parentNode = this;
  return c;
};
El.prototype.removeChild = function (c) {
  var i = this.children.indexOf(c);
  if (i < 0) { throw new Error('removeChild: non è un figlio'); }
  this.children.splice(i, 1);
  c.parentNode = null;
  return c;
};
El.prototype.addEventListener = function (type, fn) {
  (this._listeners[type] = this._listeners[type] || []).push(fn);
};
El.prototype.fire = function (type) {              /* on<type> + addEventListener (l'ordine del browser) */
  var fn = this['on' + type], ls = this._listeners[type] || [], k;
  if (typeof fn === 'function') { fn.call(this, { type: type, target: this }); }
  for (k = 0; k < ls.length; k++) { ls[k].call(this, { type: type, target: this }); }
};

function findById(node, id) {
  var k, r;
  if (node._id === id) { return node; }
  for (k = 0; k < node.children.length; k++) {
    r = findById(node.children[k], id);
    if (r) { return r; }
  }
  return null;
}

/* gli elementi statici della pagina: <tag … id="…"> del markup, con il tag vero */
function makeDocument() {
  var root = new El('body'), re = /<([a-z0-9]+)\b[^>]*\bid="([^"]+)"/g, m, e;
  while ((m = re.exec(MARKUP)) !== null) {
    e = new El(m[1]);
    e.id = m[2];
    root.appendChild(e);
  }
  return {
    root: root,
    getElementById: function (id) { return findById(root, String(id)); },
    createElement: function (tag) { return new El(tag); },
    createTextNode: function (t) { var e = new El('#text'); e._text = String(t); return e; }
  };
}

/* ------------------------------------------------------------- XMLHttpRequest finto --- */

function Net(pool, state) {
  this.pool = pool;
  this.state = state;
  this.log = [];                 /* "GET /pool.json", "POST /save" … nell'ordine di send() */
  this.posts = [];               /* {url, body (stringa), headers} */
  this.pending = [];
  this.saveReply = null;         /* function(bodyObj) → {status, text} per forzare un errore */
  this.override = null;          /* function(xhr) → {status, text} | null: forza una risposta a un GET */
}
Net.prototype.xhrClass = function () {
  var net = this;
  function XHR() {
    this.readyState = 0; this.status = 0; this.responseText = ''; this._headers = {};
  }
  XHR.prototype.open = function (method, url, async) {
    this._method = method; this._url = url; this._async = async; this.readyState = 1;
  };
  XHR.prototype.setRequestHeader = function (k, v) { this._headers[String(k).toLowerCase()] = String(v); };
  XHR.prototype.send = function (body) {
    net.log.push(this._method + ' ' + this._url);
    if (this._method === 'POST') { net.posts.push({ url: this._url, body: body, headers: this._headers }); }
    net.pending.push({ xhr: this, body: body });
  };
  return XHR;
};
Net.prototype.respond = function (p) {
  var x = p.xhr, status = 404, text = '{"ok":false,"error":"not found"}', r;
  if (x._method === 'GET' && x._url === '/pool.json') {
    status = 200; text = JSON.stringify(this.pool);
  } else if (x._method === 'GET' && x._url === '/state.json') {
    status = 200; text = JSON.stringify(this.state);
  } else if (x._method === 'POST' && x._url === '/save') {
    if (this.saveReply) {
      r = this.saveReply(p.body);
      status = r.status; text = r.text;
    } else {
      this.state.seq += 1;
      status = 200; text = JSON.stringify({ ok: true, seq: this.state.seq });
    }
  }
  if (this.override) { r = this.override(x); if (r) { status = r.status; text = r.text; } }
  x.status = status; x.responseText = text; x.readyState = 4;
  if (typeof x.onreadystatechange === 'function') { x.onreadystatechange(); }
};
Net.prototype.flush = function () {          /* consegna tutto, anche le richieste nate dai callback */
  var n = 0;
  while (this.pending.length) { this.respond(this.pending.shift()); n++; }
  return n;
};

/* ------------------------------------------------------------- caricamento della pagina --- */

function Loc(search) {
  this.search = search;
  this.hrefs = [];
  this.reloads = 0;
}
Object.defineProperty(Loc.prototype, 'href', {
  get: function () { return this.hrefs.length ? this.hrefs[this.hrefs.length - 1] : ''; },
  set: function (v) { this.hrefs.push(String(v)); }
});
Loc.prototype.reload = function () { this.reloads += 1; };

/* opts: {pool, state, returnTo, search, deliver (default true)} → {sb, doc, net, loc, error} */
function loadPage(opts) {
  var doc = makeDocument();
  var net = new Net(clone(opts.pool), clone(opts.state));
  if (opts.saveReply) { net.saveReply = opts.saveReply; }
  if (opts.override) { net.override = opts.override; }
  var search = opts.search !== undefined ? opts.search
             : (opts.returnTo ? '?return_to=' + encodeURIComponent(opts.returnTo) : '');
  var loc = new Loc(search);
  var sb = { document: doc, XMLHttpRequest: net.xhrClass(), location: loc, console: console };
  var out = { sb: sb, doc: doc, net: net, loc: loc, error: null };
  try {
    vm.runInNewContext(SCRIPT, sb, { filename: 'config.html' });
    if (opts.deliver !== false) { net.flush(); }
  } catch (e) { out.error = errText(e); }
  return out;
}

function fields(doc) {                       /* {chiave: <input/select>} dei campi in #settings */
  var box = doc.getElementById('settings'), out = {}, k, lab, j, c;
  for (k = 0; k < box.children.length; k++) {
    lab = box.children[k];
    for (j = 0; j < lab.children.length; j++) {
      c = lab.children[j];
      if (c._id && c._id.indexOf('s_') === 0) { out[c._id.slice(2)] = c; }
    }
  }
  return out;
}

function clickSave(p) {
  var err = null;
  try { p.doc.getElementById('save').fire('click'); p.net.flush(); } catch (e) { err = errText(e); }
  return err;
}

function clickCancel(p) {
  var err = null;
  try { p.doc.getElementById('cancel').fire('click'); } catch (e) { err = errText(e); }
  return err;
}

function lastPostBody(p) {
  var post = p.net.posts[p.net.posts.length - 1];
  try { return JSON.parse(post.body); } catch (e) { return null; }
}

function allInt(o) {
  var k;
  for (k in o) { if (typeof o[k] !== 'number' || o[k] !== Math.floor(o[k])) { return false; } }
  return true;
}

/* ------------------------------------- 1. markup statico e stub DOM (prima di caricare) --- */
section('1. markup e stub', function () {
  var doc = makeDocument(), ids = ['head', 'err', 'msg', 'pool', 'order', 'settings', 'scenario', 'save', 'cancel'], k;
  for (k = 0; k < ids.length; k++) {
    check(doc.getElementById(ids[k]) !== null, 'markup: esiste #' + ids[k]);
  }
  eq(doc.getElementById('scenario').tagName, 'SELECT', 'markup: #scenario è un <select>');
  eq(doc.getElementById('save').tagName, 'BUTTON', 'markup: #save è un <button>');
  eq(doc.getElementById('cancel').tagName, 'BUTTON', 'markup: #cancel è un <button>');
  eq(doc.getElementById('settings').tagName, 'DIV', 'markup: #settings è un <div>');
  eq(doc.getElementById('order').tagName, 'OL', 'markup: #order è un <ol>');
  eq(doc.getElementById('s_layout'), null, 'markup: i campi s_<chiave> NON stanno nel markup (li costruisce lo script)');
  eq(doc.getElementById('settings').children.length, 0, 'markup: #settings parte vuoto');
  check(!doc.getElementById('settings').dataset.built, 'markup: #settings senza dataset.built');
  /* lo stub: un elemento creato ma non appeso non si trova; appeso sì */
  var e = doc.createElement('input'); e.id = 'x_orfano';
  eq(doc.getElementById('x_orfano'), null, 'stub: elemento creato ma non appeso → null');
  doc.getElementById('settings').appendChild(e);
  eq(doc.getElementById('x_orfano'), e, 'stub: elemento appeso → trovato');
  var sel = doc.createElement('select'), o1 = doc.createElement('option'), o2 = doc.createElement('option');
  o1.value = 5; o2.value = 'dup'; sel.appendChild(o1); sel.appendChild(o2);
  eq(sel.value, '5', 'stub: select senza selezione → prima option');
  sel.value = 'dup';
  eq(sel.value, 'dup', 'stub: select.value = option esistente');
  sel.value = 'boh';
  eq(sel.value, '', 'stub: select.value = valore ignoto → "" (come nel browser)');
});

/* ------------- 2. state.json SENZA settings (F13), 2 foto, con return_to: carico e Salva --- */
section('2. senza settings + Salva/Annulla', function () {
  var p = loadPage({ pool: poolFixture(2), state: stateFixture(REAL_STATE, 2), returnTo: RT });
  var sb = p.sb, doc = p.doc, net = p.net, loc = p.loc, f, k, key, box, sc;
  eq(p.error, null, 'senza settings: nessuna eccezione al caricamento');
  eqJson(net.log, ['GET /pool.json', 'GET /state.json'], 'senza settings: GET /pool.json poi GET /state.json');
  eq(sb.RT, RT, 'senza settings: RT decodificato da location.search');
  eq(typeof sb.render, 'function', 'globali: render()');
  eq(typeof sb.renderSettings, 'function', 'globali: renderSettings()');
  eq(typeof sb.readSettings, 'function', 'globali: readSettings()');
  eq(typeof sb.save, 'function', 'globali: save()');
  eq(typeof sb.cancel, 'function', 'globali: cancel()');
  eq(typeof sb.fieldDefault, 'function', 'globali: fieldDefault()');
  eq(typeof sb.initModel, 'function', 'globali: initModel()');
  eqJson(sb.SCENARIOS, SCENARIOS, 'globali: SCENARIOS = photo, seq, dup, crc, interrupt, none');
  eq(sb.MAX_SLOTS, 12, 'globali: MAX_SLOTS = pool.slots_max');
  eqJson(sb.SETTINGS_FIELDS.map(function (x) { return x.key; }), SETTINGS_KEYS,
         'globali: SETTINGS_FIELDS con le ' + NKEYS + ' chiavi nell\'ordine di GalSettings');
  eqJson(sb.POOL.settings_defaults, SETTINGS_DEFAULTS, 'globali: POOL = pool.json (settings_defaults)');
  check(sb.MODEL !== null && typeof sb.MODEL === 'object', 'MODEL costruito');
  eq(sb.MODEL.settingsSet, false, 'MODEL.settingsSet false senza `settings` in state.json');
  eqJson(sb.MODEL.settings, SETTINGS_DEFAULTS, 'MODEL.settings = pool.json.settings_defaults');
  eq(sb.MODEL.scenario, 'photo', 'MODEL.scenario = hooks.scenario');
  eq(sb.MODEL.seq, 1, 'MODEL.seq = state.seq');
  eqJson(sb.MODEL.entries, [{ i: 0, slot: 0 }, { i: 1, slot: 1 }], 'MODEL.entries: pool 0→slot 0, pool 1→slot 1');
  eqJson(sb.MODEL.order, [0, 1], 'MODEL.order = state.order');

  box = doc.getElementById('settings');
  eq(box.children.length, NKEYS, '#settings: ' + NKEYS + ' campi');
  eq(box.dataset.built, '1', '#settings: dataset.built = "1"');
  f = fields(doc);
  eqJson(Object.keys(f), SETTINGS_KEYS, '#settings: input s_<chiave> nell\'ordine delle ' + NKEYS + ' chiavi');
  for (k = 0; k < box.children.length; k++) {
    check(box.children[k].tagName === 'LABEL', '#settings: figlio ' + k + ' è una <label>');
  }
  for (k = 0; k < SETTINGS_KEYS.length; k++) {
    key = SETTINGS_KEYS[k];
    eq(doc.getElementById('s_' + key), f[key], 'getElementById("s_' + key + '") trova il campo appeso');
    eq(f[key].value, String(SETTINGS_DEFAULTS[key]), 'senza settings: s_' + key + ' = default ' + SETTINGS_DEFAULTS[key]);
    if (key === 'info_row') {
      eq(f[key].tagName, 'INPUT', 's_info_row è un <input>');
      eq(f[key].type, 'number', 's_info_row: type number');
      eq(String(f[key].min), '0', 's_info_row: min 0');
      eq(String(f[key].max), '15', 's_info_row: max 15');
    } else {
      eq(f[key].tagName, 'SELECT', 's_' + key + ' è un <select>');
      eq(f[key].children.length, OPTION_COUNT[key], 's_' + key + ': ' + OPTION_COUNT[key] + ' opzioni');
    }
  }
  eqJson(f.interval_min.children.map(function (o) { return o.value; }),
         ['0', '5', '15', '30', '60', '180', '1440'], 's_interval_min: valori 0/5/15/30/60/180/1440 (settings.c)');
  eqJson(f.font.children.map(function (o) { return o.textContent; }),
         ['Anton', 'Bebas', 'Barlow', 'LECO', 'Francois One', 'Staatliches'],
         's_font: etichette Anton, Bebas, Barlow, LECO, Francois One, Staatliches (S8/D22, valori 0..5)');
  eqJson(f.font.children.map(function (o) { return o.value; }), ['0', '1', '2', '3', '4', '5'],
         's_font: valori 0..5');
  eqJson(f.digit_style.children.map(function (o) { return o.value; }), ['0', '1', '2', '3'],
         's_digit_style: valori 0..3 (S8/D21)');
  eq(f.digit_style.value, '0', 's_digit_style: default 0 (pieno)');

  sc = doc.getElementById('scenario');
  eq(sc.children.length, 6, '#scenario: 6 opzioni');
  eqJson(sc.children.map(function (o) { return o.value; }), SCENARIOS, '#scenario: valori nell\'ordine di SCENARIOS');
  eq(sc.value, 'photo', '#scenario: value photo');

  eq(doc.getElementById('head').textContent,
     'seq 1 · 2 foto in album · 2 nel pool · impostazioni: default (non ancora salvate) · ritorno a ' + RT,
     '#head: seq, foto, pool, "default (non ancora salvate)", ritorno a return_to');
  contains(doc.getElementById('head').textContent, 'default (non ancora salvate)', '#head contiene "default (non ancora salvate)"');
  eq(doc.getElementById('err').textContent, '', '#err vuoto');
  check(doc.getElementById('err').style.display !== 'block', '#err non visibile');
  eq(doc.getElementById('pool').children.length, 2, '#pool: 2 righe');
  eq(doc.getElementById('order').children.length, 2, '#order: 2 righe');
  eq(doc.getElementById('order').children[0].tagName, 'LI', '#order: righe <li>');
  contains(doc.getElementById('order').children[0].textContent, 'slot 0 — foto0.jpg', '#order: riga 1 = slot 0');
  contains(doc.getElementById('order').children[1].textContent, 'slot 1 — foto1.jpg', '#order: riga 2 = slot 1');

  /* un campo modificato + secondo render() (come dopo ↑/↓): niente doppioni, stesso oggetto, valore tenuto */
  f.font.value = '2';
  f.info_row.value = '7';
  var err2 = null;
  try { sb.render(); } catch (e) { err2 = errText(e); }
  eq(err2, null, 'secondo render(): nessuna eccezione');
  eq(box.children.length, NKEYS, 'secondo render(): ancora ' + NKEYS + ' campi (nessun doppione)');
  eq(doc.getElementById('s_font'), f.font, 'secondo render(): stesso <select> s_font (non ricostruito)');
  eq(f.font.value, '2', 'secondo render(): valore modificato tenuto');
  eq(sc.children.length, 6, 'secondo render(): #scenario ancora 6 opzioni');
  eq(sc.value, 'photo', 'secondo render(): #scenario tiene il valore');
  var err3 = null;
  try { sb.renderSettings(); sb.renderSettings(); } catch (e) { err3 = errText(e); }
  eq(err3, null, 'renderSettings() ripetuta: nessuna eccezione');
  eq(box.children.length, NKEYS, 'renderSettings() ripetuta: ancora ' + NKEYS + ' campi');
  eq(doc.getElementById('pool').children.length, 2, 'secondo render(): #pool ricostruito, 2 righe');
  eq(doc.getElementById('order').children.length, 2, 'secondo render(): #order ricostruito, 2 righe');

  var rs = sb.readSettings();
  eqJson(Object.keys(rs), SETTINGS_KEYS, 'readSettings(): ' + NKEYS + ' chiavi nell\'ordine');
  check(allInt(rs), 'readSettings(): tutti interi');
  eq(rs.font, 2, 'readSettings(): font 2 (modificato)');
  eq(rs.info_row, 7, 'readSettings(): info_row 7 (modificato)');
  eq(rs.interval_min, 30, 'readSettings(): interval_min 30 (default)');

  /* Salva */
  eq(clickSave(p), null, 'Salva: nessuna eccezione');
  eq(net.posts.length, 1, 'Salva: esattamente un POST');
  eq(net.posts[0].url, '/save', 'Salva: POST /save');
  eq(net.posts[0].headers['content-type'], 'application/json', 'Salva: Content-Type application/json');
  eqJson(net.log, ['GET /pool.json', 'GET /state.json', 'POST /save'], 'Salva: 3 richieste in tutto');
  var body = lastPostBody(p);
  check(body !== null, 'Salva: corpo JSON valido');
  eqJson(Object.keys(body), ['settings', 'order', 'photos', 'scenario'], 'Salva: chiavi settings, order, photos, scenario');
  eqJson(Object.keys(body.settings), SETTINGS_KEYS, 'Salva: settings con le ' + NKEYS + ' chiavi');
  check(allInt(body.settings), 'Salva: settings tutti interi');
  var want = clone(SETTINGS_DEFAULTS); want.font = 2; want.info_row = 7;
  eqJson(body.settings, want, 'Salva: settings = default + font 2 + info_row 7');
  eqJson(body.order, [0, 1], 'Salva: order [0,1]');
  eqJson(body.photos, [{ slot: 0, src: 0 }, { slot: 1, src: 1 }], 'Salva: photos [{slot,src}]');
  eq(body.scenario, 'photo', 'Salva: scenario photo');
  eqJson(loc.hrefs, [RT + TOKEN2], 'Salva ok con return_to: location.href = return_to + token (seq 2)');
  var tok = null;
  try { tok = JSON.parse(decodeURIComponent(loc.hrefs[0].slice(RT.length))); } catch (e) { tok = null; }
  eqJson(tok, { v: 1, dev: true, seq: 2 }, 'Salva: il token decodifica in {"v":1,"dev":true,"seq":2}');
  eq(loc.reloads, 0, 'Salva: nessun reload');
  eq(sb.MODEL.seq, 2, 'Salva: MODEL.seq aggiornato dalla risposta');
  eq(sb.MODEL.settingsSet, true, 'Salva: MODEL.settingsSet true dopo il POST');
  eq(doc.getElementById('err').textContent, '', 'Salva: #err vuoto');
  eq(doc.getElementById('msg').textContent, '', 'Salva con return_to: #msg vuoto (si torna alla pagina di ritorno)');

  /* Annulla */
  loc.hrefs.length = 0;
  eq(clickCancel(p), null, 'Annulla: nessuna eccezione');
  eqJson(loc.hrefs, [RT], 'Annulla con return_to: location.href = return_to (senza token)');
  eq(net.posts.length, 1, 'Annulla: nessun POST in più');
  eq(loc.reloads, 0, 'Annulla con return_to: nessun reload');
});

/* ---------------------------- 3. state.json CON settings (layout 1, info_row 7, scenario dup) --- */
section('3. con settings', function () {
  var p = loadPage({ pool: poolFixture(2), state: stateFixture(REAL_STATE_SET, 2), returnTo: RT });
  var sb = p.sb, doc = p.doc, f, k, key, exp;
  eq(p.error, null, 'con settings: nessuna eccezione al caricamento');
  eq(sb.MODEL.settingsSet, true, 'con settings: MODEL.settingsSet true');
  eq(doc.getElementById('settings').children.length, NKEYS, 'con settings: ' + NKEYS + ' campi');
  eq(doc.getElementById('settings').dataset.built, '1', 'con settings: dataset.built');
  f = fields(doc);
  for (k = 0; k < SETTINGS_KEYS.length; k++) {
    key = SETTINGS_KEYS[k];
    exp = key === 'layout' ? '1' : key === 'info_row' ? '7' : String(SETTINGS_DEFAULTS[key]);
    eq(f[key].value, exp, 'con settings: s_' + key + ' = ' + exp);
  }
  eq(doc.getElementById('scenario').value, 'dup', 'con settings: #scenario = hooks.scenario dup');
  eq(doc.getElementById('head').textContent, 'seq 1 · 2 foto in album · 2 nel pool · ritorno a ' + RT,
     'con settings: #head senza "default (non ancora salvate)"');
  notContains(doc.getElementById('head').textContent, 'default', 'con settings: #head non parla di default');

  f.interval_min.value = '1440';
  doc.getElementById('scenario').value = 'crc';
  eq(clickSave(p), null, 'con settings, Salva: nessuna eccezione');
  eq(p.net.posts.length, 1, 'con settings, Salva: un POST');
  var body = lastPostBody(p);
  eq(body.settings.layout, 1, 'con settings, Salva: layout 1 (dallo stato)');
  eq(body.settings.info_row, 7, 'con settings, Salva: info_row 7 (dallo stato)');
  eq(body.settings.interval_min, 1440, 'con settings, Salva: interval_min 1440 (modificato)');
  eq(body.scenario, 'crc', 'con settings, Salva: scenario crc (modificato)');
  eqJson(p.loc.hrefs, [RT + TOKEN2], 'con settings, Salva: redirect a return_to + token');
});

/* ------------------------- 4. senza return_to, pool e stato reali (vuoti): Salva e Annulla --- */
section('4. senza return_to', function () {
  var p = loadPage({ pool: REAL_POOL, state: REAL_STATE, returnTo: '' });
  var sb = p.sb, doc = p.doc;
  eq(p.error, null, 'pool vuoto: nessuna eccezione al caricamento');
  eq(sb.RT, '', 'senza return_to: RT vuoto');
  eq(doc.getElementById('head').textContent,
     'seq 1 · 0 foto in album · 0 nel pool · impostazioni: default (non ancora salvate) · nessun return_to',
     'senza return_to: #head "nessun return_to"');
  eq(doc.getElementById('pool').children.length, 1, 'pool vuoto: una riga di avviso');
  eq(doc.getElementById('pool').children[0].className, 'empty', 'pool vuoto: classe empty');
  contains(doc.getElementById('pool').children[0].textContent, 'nessuna foto', 'pool vuoto: testo "nessuna foto"');
  eq(doc.getElementById('order').children.length, 1, 'ordine vuoto: una riga di avviso');
  eq(doc.getElementById('order').children[0].className, 'empty', 'ordine vuoto: classe empty');
  contains(doc.getElementById('order').children[0].textContent, 'album vuoto', 'ordine vuoto: "album vuoto"');
  eq(doc.getElementById('settings').children.length, NKEYS, 'pool vuoto: ' + NKEYS + ' campi lo stesso (F13)');
  eq(fields(doc).interval_min.value, '30', 'pool vuoto: s_interval_min = default 30');
  eq(fields(doc).shake_next.value, '1', 'pool vuoto: s_shake_next = default 1');
  eq(fields(doc).info_row.value, '15', 'pool vuoto: s_info_row = default 15');

  eq(clickSave(p), null, 'senza return_to, Salva: nessuna eccezione');
  eq(p.net.posts.length, 1, 'senza return_to, Salva: un POST');
  var body = lastPostBody(p);
  eqJson(body.settings, SETTINGS_DEFAULTS, 'senza return_to, Salva: settings = i ' + NKEYS + ' default');
  eqJson(body.order, [], 'senza return_to, Salva: order []');
  eqJson(body.photos, [], 'senza return_to, Salva: photos []');
  eq(body.scenario, 'photo', 'senza return_to, Salva: scenario photo');
  eqJson(p.loc.hrefs, [], 'senza return_to, Salva: nessun redirect');
  eq(doc.getElementById('msg').textContent, 'salvato (seq 2)', 'senza return_to, Salva: #msg "salvato (seq 2)"');
  eq(doc.getElementById('head').textContent, 'seq 2 · 0 foto in album · 0 nel pool · nessun return_to',
     'senza return_to, Salva: render() con seq 2 e senza "default" (settingsSet ora true)');
  eq(doc.getElementById('settings').children.length, NKEYS, 'senza return_to, Salva: il render() non duplica i campi');
  eq(doc.getElementById('err').textContent, '', 'senza return_to, Salva: #err vuoto');

  eq(clickCancel(p), null, 'senza return_to, Annulla: nessuna eccezione');
  eq(p.loc.reloads, 1, 'senza return_to, Annulla: location.reload() una volta');
  eqJson(p.loc.hrefs, [], 'senza return_to, Annulla: nessun href');
  eq(p.net.posts.length, 1, 'senza return_to, Annulla: nessun POST in più');
});

/* --------------------------------------------------------------------------- 5. errori --- */
section('5. errori', function () {
  /* POST rifiutato dal server (400 con error) */
  var p = loadPage({ pool: poolFixture(1), state: stateFixture(REAL_STATE, 1), returnTo: RT,
                     saveReply: function () { return { status: 400, text: '{"ok":false,"error":"campo sconosciuto: pippo"}' }; } });
  eq(p.error, null, 'errore POST 400: caricamento ok');
  eq(clickSave(p), null, 'errore POST 400: nessuna eccezione');
  eq(p.net.posts.length, 1, 'errore POST 400: un POST');
  eq(p.doc.getElementById('err').textContent, 'salvataggio fallito: campo sconosciuto: pippo', 'errore POST 400: #err con l\'errore del server');
  eq(p.doc.getElementById('err').style.display, 'block', 'errore POST 400: #err visibile');
  eqJson(p.loc.hrefs, [], 'errore POST 400: nessun redirect');
  eq(p.sb.MODEL.seq, 1, 'errore POST 400: seq invariato');
  eq(p.sb.MODEL.settingsSet, false, 'errore POST 400: settingsSet resta false');
  contains(p.doc.getElementById('head').textContent, 'default (non ancora salvate)', 'errore POST 400: #head ancora "default"');

  /* POST 500 non JSON */
  p = loadPage({ pool: poolFixture(1), state: stateFixture(REAL_STATE, 1), returnTo: RT,
                 saveReply: function () { return { status: 500, text: 'Internal Server Error' }; } });
  eq(clickSave(p), null, 'errore POST 500: nessuna eccezione');
  eq(p.doc.getElementById('err').textContent, 'salvataggio fallito: HTTP 500', 'errore POST 500: #err "HTTP 500"');
  eqJson(p.loc.hrefs, [], 'errore POST 500: nessun redirect');

  /* campo non numerico */
  p = loadPage({ pool: poolFixture(1), state: stateFixture(REAL_STATE, 1), returnTo: RT });
  fields(p.doc).info_row.value = 'abc';
  eq(clickSave(p), null, 'info_row non numerico: nessuna eccezione');
  eq(p.net.posts.length, 0, 'info_row non numerico: nessun POST');
  contains(p.doc.getElementById('err').textContent, 'valore non numerico', 'info_row non numerico: #err');
  contains(p.doc.getElementById('err').textContent, 'Riga info', 'info_row non numerico: #err nomina il campo');
  eq(p.doc.getElementById('err').style.display, 'block', 'info_row non numerico: #err visibile');
  eqJson(p.loc.hrefs, [], 'info_row non numerico: nessun redirect');
  /* corretto → il POST parte e #err si pulisce */
  fields(p.doc).info_row.value = '3';
  eq(clickSave(p), null, 'info_row corretto: nessuna eccezione');
  eq(p.net.posts.length, 1, 'info_row corretto: un POST');
  eq(lastPostBody(p).settings.info_row, 3, 'info_row corretto: info_row 3 nel POST');
  eq(p.doc.getElementById('err').textContent, '', 'info_row corretto: #err ripulito');
  eq(p.doc.getElementById('err').style.display, 'none', 'info_row corretto: #err nascosto');

  /* clic Salva PRIMA che pool/stato arrivino (F13: guardia, niente TypeError) */
  p = loadPage({ pool: poolFixture(1), state: stateFixture(REAL_STATE, 1), returnTo: RT, deliver: false });
  eq(p.error, null, 'clic prima del caricamento: script eseguito');
  eq(p.sb.POOL, null, 'clic prima del caricamento: POOL ancora null');
  eq(p.doc.getElementById('settings').children.length, 0, 'clic prima del caricamento: nessun campo ancora');
  var errEarly = null;
  try { p.doc.getElementById('save').fire('click'); } catch (e) { errEarly = errText(e); }
  eq(errEarly, null, 'clic prima del caricamento: nessuna eccezione');
  eq(p.net.posts.length, 0, 'clic prima del caricamento: nessun POST');
  eq(p.doc.getElementById('err').textContent, 'attendere: pool e stato non sono ancora arrivati', 'clic prima del caricamento: #err "attendere"');
  var errLate = null;
  try { p.net.flush(); } catch (e) { errLate = errText(e); }
  eq(errLate, null, 'poi arrivano pool e stato: nessuna eccezione');
  eq(p.doc.getElementById('settings').children.length, NKEYS, 'poi arrivano pool e stato: ' + NKEYS + ' campi');
  eq(p.net.posts.length, 0, 'poi arrivano pool e stato: ancora nessun POST');
  eq(clickSave(p), null, 'poi Salva: nessuna eccezione');
  eq(p.net.posts.length, 1, 'poi Salva: un POST');

  /* GET /state.json fallito */
  p = loadPage({ pool: poolFixture(1), state: stateFixture(REAL_STATE, 1), returnTo: RT,
                 override: function (x) { return x._url === '/state.json' ? { status: 500, text: 'boom' } : null; } });
  eq(p.error, null, 'GET /state.json 500: nessuna eccezione');
  eq(p.doc.getElementById('err').textContent, 'GET /state.json → HTTP 500', 'GET /state.json 500: #err');
  eq(p.sb.MODEL, null, 'GET /state.json 500: MODEL null');
  eq(p.doc.getElementById('settings').children.length, 0, 'GET /state.json 500: nessun campo');
  eq(clickSave(p), null, 'GET /state.json 500, Salva: nessuna eccezione');
  eq(p.net.posts.length, 0, 'GET /state.json 500, Salva: nessun POST');

  /* GET /pool.json non JSON */
  p = loadPage({ pool: poolFixture(1), state: stateFixture(REAL_STATE, 1), returnTo: RT,
                 override: function (x) { return x._url === '/pool.json' ? { status: 200, text: '<html>' } : null; } });
  eq(p.error, null, 'GET /pool.json non JSON: nessuna eccezione');
  eq(p.doc.getElementById('err').textContent, 'GET /pool.json: risposta non JSON', 'GET /pool.json non JSON: #err');
  eqJson(p.net.log, ['GET /pool.json'], 'GET /pool.json non JSON: /state.json non richiesto');
});

/* ------------------------------------------------------------------ 6. return_to strani --- */
section('6. return_to strani', function () {
  var p = loadPage({ pool: REAL_POOL, state: REAL_STATE, search: '?foo=1&bar=2' });
  eq(p.error, null, 'query senza return_to: caricamento ok');
  eq(p.sb.RT, '', 'query senza return_to: RT vuoto');
  contains(p.doc.getElementById('head').textContent, 'nessun return_to', 'query senza return_to: #head');

  p = loadPage({ pool: REAL_POOL, state: REAL_STATE, search: '?x=1&return_to=' + encodeURIComponent(RT) + '&y=2' });
  eq(p.sb.RT, RT, 'return_to in mezzo ad altri parametri: decodificato');

  p = loadPage({ pool: REAL_POOL, state: REAL_STATE, search: '?return_to=%E0%A4%A' });
  eq(p.error, null, 'return_to con percent-encoding rotto: nessuna eccezione');
  eq(p.sb.RT, '%E0%A4%A', 'return_to con percent-encoding rotto: tenuto grezzo');
  eq(clickCancel(p), null, 'return_to rotto, Annulla: nessuna eccezione');
  eqJson(p.loc.hrefs, ['%E0%A4%A'], 'return_to rotto, Annulla: href = RT grezzo');
});

/* ------------------------------------------------- 7. interazioni: ordine e checkbox pool --- */
section('7. interazioni', function () {
  var p = loadPage({ pool: poolFixture(3), state: stateFixture(REAL_STATE, 2), returnTo: RT });
  var sb = p.sb, doc = p.doc, order, row, k, btnDown, btnUp;
  eq(p.error, null, 'interazioni: caricamento ok');
  eq(doc.getElementById('pool').children.length, 3, 'interazioni: 3 righe nel pool');
  eq(doc.getElementById('order').children.length, 2, 'interazioni: 2 righe nell\'ordine');

  /* ↓ sulla prima riga dell'ordine */
  order = doc.getElementById('order');
  row = order.children[0];
  btnUp = null; btnDown = null;
  for (k = 0; k < row.children.length; k++) {
    if (row.children[k].tagName === 'BUTTON') { if (btnUp === null) { btnUp = row.children[k]; } else { btnDown = row.children[k]; } }
  }
  check(btnUp && btnDown, 'ordine: due bottoni ↑/↓ per riga');
  eq(btnUp.disabled, true, 'ordine: ↑ disabilitato sulla prima riga');
  eq(btnDown.disabled, false, 'ordine: ↓ abilitato sulla prima riga');
  btnDown.fire('click');
  eqJson(sb.MODEL.order, [1, 0], 'ordine: ↓ scambia → [1,0]');
  eq(doc.getElementById('order').children.length, 2, 'ordine: render() dopo ↓, 2 righe');
  contains(doc.getElementById('order').children[0].textContent, 'slot 1', 'ordine: prima riga ora slot 1');
  eq(doc.getElementById('settings').children.length, NKEYS, 'ordine: render() dopo ↓ non duplica i campi');

  /* checkbox: togli la foto 1 dall'album */
  row = doc.getElementById('pool').children[1];
  var chk = null, num = null;
  for (k = 0; k < row.children.length; k++) {
    if (row.children[k].tagName === 'INPUT' && row.children[k].type === 'checkbox') { chk = row.children[k]; }
    if (row.children[k].tagName === 'LABEL') { num = row.children[k].children[1]; }
  }
  check(chk && num && num.type === 'number', 'pool: riga con checkbox e <input number> dello slot');
  eq(chk.checked, true, 'pool: la foto 1 è spuntata');
  eq(num.value, '1', 'pool: slot della foto 1 = 1');
  chk.checked = false;
  chk.fire('change');
  eqJson(sb.MODEL.entries, [{ i: 0, slot: 0 }], 'pool: tolta la foto 1 → entries solo pool 0');
  eqJson(sb.MODEL.order, [0], 'pool: tolta la foto 1 → order [0]');
  eq(doc.getElementById('order').children.length, 1, 'pool: ordine ridisegnato con 1 riga');

  /* le righe non in album propongono slot liberi DISTINTI in sequenza (riga 1 → 1, riga 2 → 2);
     slot occupato → errore */
  row = doc.getElementById('pool').children[1];
  for (k = 0; k < row.children.length; k++) {
    if (row.children[k].tagName === 'LABEL') { num = row.children[k].children[1]; }
  }
  eq(num.value, '1', 'pool: alla foto 1 (tolta) si propone lo slot libero 1');
  row = doc.getElementById('pool').children[2];
  chk = null; num = null;
  for (k = 0; k < row.children.length; k++) {
    if (row.children[k].tagName === 'INPUT' && row.children[k].type === 'checkbox') { chk = row.children[k]; }
    if (row.children[k].tagName === 'LABEL') { num = row.children[k].children[1]; }
  }
  eq(chk.checked, false, 'pool: la foto 2 non è in album');
  eq(num.value, '2', 'pool: alla foto 2 si propone il successivo slot libero (2)');
  num.value = '0';
  chk.checked = true;
  chk.fire('change');
  eq(chk.checked, false, 'pool: slot 0 occupato → checkbox riportata a false');
  eq(doc.getElementById('err').textContent, 'slot 0 già occupato', 'pool: slot occupato → #err');
  eqJson(sb.MODEL.entries, [{ i: 0, slot: 0 }], 'pool: slot occupato → entries invariati');
  num.value = '5';
  chk.checked = true;
  chk.fire('change');
  eqJson(sb.MODEL.entries, [{ i: 0, slot: 0 }, { i: 2, slot: 5 }], 'pool: foto 2 nello slot 5');
  eqJson(sb.MODEL.order, [0, 5], 'pool: order [0,5]');
  eq(doc.getElementById('err').textContent, '', 'pool: #err ripulito');

  eq(clickSave(p), null, 'interazioni, Salva: nessuna eccezione');
  var body = lastPostBody(p);
  eqJson(body.photos, [{ slot: 0, src: 0 }, { slot: 5, src: 2 }], 'interazioni, Salva: photos [{0,0},{5,2}]');
  eqJson(body.order, [0, 5], 'interazioni, Salva: order [0,5]');

  /* lo stesso photo_id in due righe del pool e due slot → due righe diverse */
  p = loadPage({ pool: poolFixture(2, true), state: stateFixture(REAL_STATE, 2, true), returnTo: RT });
  eq(p.error, null, 'photo_id doppio: caricamento ok');
  eqJson(p.sb.MODEL.entries, [{ i: 0, slot: 0 }, { i: 1, slot: 1 }], 'photo_id doppio: slot 0 → pool 0, slot 1 → pool 1');
});

/* ---------------------------------------------------------- 8. fieldDefault() e initModel() --- */
section('8. fieldDefault/initModel', function () {
  var p = loadPage({ pool: poolFixture(1), state: stateFixture(REAL_STATE, 1), returnTo: RT });
  var sb = p.sb;
  eq(sb.fieldDefault({ key: 'interval_min', opts: [[0, 'mai']] }), 30, 'fieldDefault: da POOL.settings_defaults (30)');
  eq(sb.fieldDefault({ key: 'info_row', number: [0, 15] }), 15, 'fieldDefault: number da settings_defaults (15)');
  eq(sb.fieldDefault({ key: 'inesistente', opts: [[4, 'x']] }), 4, 'fieldDefault: chiave ignota → prima option');
  delete sb.POOL.settings_defaults;
  eq(sb.fieldDefault({ key: 'interval_min', opts: [[0, 'mai']] }), 0, 'fieldDefault: senza settings_defaults → prima option');
  eq(sb.fieldDefault({ key: 'info_row', number: [0, 15] }), 0, 'fieldDefault: senza settings_defaults → number[0]');
  /* pool.json vecchio (senza settings_defaults) e state senza settings: initModel non esplode */
  var err = null, st = stateFixture(REAL_STATE, 1);
  try { sb.initModel(st); } catch (e) { err = errText(e); }
  eq(err, null, 'initModel senza settings_defaults né settings: nessuna eccezione');
  eqJson(sb.MODEL.settings, {}, 'initModel senza settings_defaults né settings: settings {}');
  eq(sb.MODEL.settingsSet, false, 'initModel: settingsSet false');
  /* initModel con settings esplicite */
  st.settings = clone(SETTINGS_DEFAULTS); st.settings.font = 3;
  sb.initModel(st);
  eq(sb.MODEL.settingsSet, true, 'initModel con settings: settingsSet true');
  eq(sb.MODEL.settings.font, 3, 'initModel con settings: font 3');
  /* slot ripetuti nello stato (una voce per formato): un solo entry per slot */
  eqJson(sb.MODEL.entries, [{ i: 0, slot: 0 }], 'initModel: due voci (raw6+raw1) dello stesso slot → un entry');
  /* photo_id assente dal pool: ignorato */
  st.photos.push({ slot: 3, photo_id: 9999, name: 'x', fmt: 1, len: 1, crc: 0, url: '/photo/3.raw6' });
  st.order.push(3);
  sb.initModel(st);
  eqJson(sb.MODEL.entries, [{ i: 0, slot: 0 }], 'initModel: photo_id non nel pool → ignorato');
  eqJson(sb.MODEL.order, [0], 'initModel: syncOrder toglie gli slot senza foto');
});

console.log('test_devpage: ' + g_ok + ' ok, ' + g_fail + ' falliti');
process.exit(g_fail ? 1 : 0);

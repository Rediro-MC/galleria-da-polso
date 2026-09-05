/* album.js — l'album del telefono (S5b): foto, ordine, impostazioni ed eliminazioni pendenti
 * in localStorage, e il "piano" di sync calcolato a ogni HELLO (docs/design/galleria.md §5.1).
 *
 * Modulo PURO: nessun `Pebble`, nessun XHR. Riceve uno `storage` con getItem/setItem/removeItem
 * (localStorage sul telefono e in pypkjs, un oggetto in memoria nei test node) e un `log`.
 * ES5 (WebView Android, JavaScriptCore iOS, pypkjs); nessuna eccezione esce dai metodi pubblici:
 * gli errori tornano nei risultati e nel log.
 *
 * Chiavi:
 *   galleria.v1.album        JSON {v, photos[12], order[], orderGen, settings{}, settingsSet, deleted[], orderDirty}
 *   galleria.v1.watch        JSON {at, format, maxChunk, settingsCrc, openMs, slots[12], foreign[]} = ultimo HELLO (per la config page)
 *                            (`openMs`, v1.9: ms dell'apertura del file persist sull'orologio; null se l'HELLO non lo porta)
 *   galleria.v1.p<slot>.<fmt>  payload base64url senza padding (fmt 1 raw6 emery, 2 raw1 flint)
 *
 * Campo `stored` (S7, F12): ogni formato dei metadati (`photos[k].fmts[fmt].stored`) dice se il
 * payload è su disco. Il JSON dell'album è la SOLA fonte per plan()/summary()/state()/applyPayload():
 * nessuno di questi legge le chiavi `p<slot>.<fmt>` (45,6 KB l'una su emery). `true` = setPayload
 * riuscito, `false` = voce "solo metadati" (dev, `url`); il campo sparisce col formato. Un payload
 * sparito con `stored` true si scopre in load(): i metadati del formato vengono rimossi
 * (_dropCorrupt) e il prossimo HELLO non la ripianifica — nessun ciclo di retry. Gli album scritti
 * prima di S7 (senza il campo) vengono migrati alla rilettura: una sonda per formato, UNA sola
 * volta, poi il JSON viene riscritto (`v` resta 1). La sonda ha TRE esiti (_probeStored): se il
 * getItem lancia il campo resta null = "non deciso" e la migrazione non è fatta (si riprova al
 * prossimo _load e nel primo plan() che tocca quel formato) — un errore di lettura transitorio non
 * deve mai registrare un `false` permanente, che impedirebbe per sempre l'invio della foto.
 *
 * Regole del piano (stateless come le foto sull'orologio):
 *   foto → da inviare se lo slot sull'orologio non è VALID con lo stesso CRC del formato nativo;
 *   deletes → slot in `deleted` ancora VALID sull'orologio;
 *   order → se orderDirty o se il piano contiene foto/eliminazioni (ordine locale + slot VALID
 *           "estranei": il telefono non elimina mai ciò che l'utente non ha eliminato);
 *   settings → se l'utente le ha mai impostate (settingsSet) e HELLO.CRC (CRC-16 dei primi 18 B di
 *              GalSettings) è assente o diverso dal nostro.
 * Le foto del piano hanno load(cb) al posto di bytes: il motore decodifica una foto per volta.
 *
 * Regole di applyPayload (revisione post code-review S5b, F6/F8/F10):
 *   una modifica è registrata solo se è INTERA su disco: payload nuovo scritto PRIMA di toccare la
 *   foto vecchia (quota ⇒ la vecchia resta intatta), rimozioni di payload solo DOPO il JSON
 *   dell'album, JSON non scritto ⇒ rollback dei payload + rilettura dal disco (ok=false,
 *   changed=false); una voce rotta con slot valido è "elencata" (la foto locale non si tocca) e in
 *   `full` le eliminazioni implicite si fanno solo se ogni voce era identificabile. I byte da
 *   rimettere in caso di rollback si decidono sui metadati con cui lo slot è ENTRATO nella chiamata
 *   (snapOrig/prevOf), non su quelli già sostituiti: le rimozioni sono pendenti fino a _save(), sul
 *   disco c'è ancora il payload della foto vecchia (revisione S7). */
var b64 = require('./b64');
var crc = require('./crc');

var V = 1;
var KEY = 'galleria.v1.album';
var WKEY = 'galleria.v1.watch';           /* ultimo HELLO: chiave separata, riscritta a ogni HELLO senza toccare l'album */
var PKEY = 'galleria.v1.p';
var MAX_SLOTS = 12;
var MAX_PHOTO_ENTRIES = 2 * MAX_SLOTS;    /* voci foto per payload (una per formato) — dopo MAX_SLOTS: var hoisting! */
var MAX_THUMB_CHARS = 6000;               /* miniatura ≤ 4 KB PNG in data-URL (design §6) */
var MAX_ERRORS = 32;
var SLOT_NONE = 0xFF;
var FMT_RAW6 = 1, FMT_RAW1 = 2;
var FMT_LEN = {};
FMT_LEN[FMT_RAW6] = 34200;                 /* photo_codec.h: 150 B × 228 righe */
FMT_LEN[FMT_RAW1] = 3024;                  /* 18 B × 168 righe */
var INTERVALS = [0, 5, 15, 30, 60, 180, 1440];
var SETTINGS_SCHEMA = 1;
var SETTINGS_BYTES = 20;

/* [nome, min, max, default] — stessi intervalli di settings_validate() (settings.c). */
var SETTINGS_FIELDS = [
  ['layout', 0, 1, 0],
  ['font', 0, 5, 0],
  ['clock_mode', 0, 2, 0],
  ['leading_zero', 0, 2, 0],
  ['text_color', 0, 4, 0],
  ['outline', 0, 2, 0],
  ['interval_min', 0, 1440, 30],
  ['order', 0, 1, 0],
  ['shake_next', 0, 1, 1],
  ['info_row', 0, 15, 15],
  ['digit_style', 0, 3, 0]        /* S8: byte 12 del blob (ex primo `reserved`); l'ordine dell'array non e' quello dei byte */
];

/* ---- helper puri ---- */

function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
function isSlot(v) { return isInt(v) && v >= 0 && v < MAX_SLOTS; }
function isFmt(v) { return v === FMT_RAW6 || v === FMT_RAW1; }
function u32(v) { return isInt(v) ? (v >>> 0) : 0; }   /* -123 (int32 dal JS) → uint32 */

function sameArray(a, b) {
  var i;
  if (!a || !b || a.length !== b.length) { return false; }
  for (i = 0; i < a.length; i++) { if (a[i] !== b[i]) { return false; } }
  return true;
}

function uniqueSlots(list) {
  var out = [], seen = {}, i, v;
  if (!list || typeof list.length !== 'number') { return out; }
  for (i = 0; i < list.length; i++) {
    v = list[i];
    if (isSlot(v) && !seen[v]) { seen[v] = true; out.push(v); }
  }
  return out;
}

function defaultSettings() {
  var s = {}, i;
  for (i = 0; i < SETTINGS_FIELDS.length; i++) { s[SETTINGS_FIELDS[i][0]] = SETTINGS_FIELDS[i][3]; }
  return s;
}

/* Impostazioni validate campo per campo: valore mancante o fuori intervallo → default del campo
 * (mai un blob che l'orologio rifiuterebbe con BAD_FORMAT). `base` = valori correnti per un
 * aggiornamento parziale. */
function normalizeSettings(obj, base) {
  var s = {}, i, f, v;
  for (i = 0; i < SETTINGS_FIELDS.length; i++) {
    f = SETTINGS_FIELDS[i];
    v = (obj && obj[f[0]] !== undefined) ? obj[f[0]] : (base ? base[f[0]] : undefined);
    if (typeof v === 'string' && v !== '' && isFinite(+v)) { v = +v; }
    if (!isInt(v) || v < f[1] || v > f[2]) { v = f[3]; }
    if (f[0] === 'interval_min' && INTERVALS.indexOf(v) < 0) { v = f[3]; }
    s[f[0]] = v;
  }
  return s;
}

function sameSettings(a, b) {
  var i, k;
  for (i = 0; i < SETTINGS_FIELDS.length; i++) {
    k = SETTINGS_FIELDS[i][0];
    if (a[k] !== b[k]) { return false; }
  }
  return true;
}

/* GalSettings (settings.h, 20 B packed): schema, layout, font, clock_mode, leading_zero,
 * text_color, outline, interval_min u16 LE, order, shake_next, info_row, digit_style,
 * reserved[5], crc16 LE. Il byte 12 (`digit_style`, S8/D21) era il primo dei sei `reserved`:
 * i blob vecchi valgono 0 = "pieno", nessuna migrazione. */
function settingsBytes(s) {
  var b = [SETTINGS_SCHEMA, s.layout, s.font, s.clock_mode, s.leading_zero, s.text_color, s.outline,
           s.interval_min & 0xFF, (s.interval_min >> 8) & 0xFF, s.order, s.shake_next, s.info_row,
           s.digit_style, 0, 0, 0, 0, 0];   /* byte 12 = digit_style, poi reserved[5] */
  var c = crc.crc16(b);
  b.push(c & 0xFF, (c >> 8) & 0xFF);
  return b;
}

function settingsCrc(s) {
  return crc.crc16(settingsBytes(s).slice(0, SETTINGS_BYTES - 2));
}

function newPhotoId() {
  var t = (new Date().getTime()) & 0x7FFFFFFF;
  var r = Math.floor(Math.random() * 0x7FFFFFFF);
  return ((t ^ r) >>> 0) || 1;
}

function emptyData() {
  var photos = [], k;
  for (k = 0; k < MAX_SLOTS; k++) { photos.push(null); }
  return { v: V, photos: photos, order: [], orderGen: 0, settings: defaultSettings(), settingsSet: false, deleted: [], orderDirty: false, watch: null };
}

/* Rilegge un record foto dal JSON, scartando ciò che non torna. `stored` assente o non booleano
 * (album scritto prima di S7) → null = "da sondare": lo risolve _migrateStored(). */
function sanitizePhoto(p) {
  var out, f, fm, n = 0;
  if (!p || typeof p !== 'object' || !isInt(p.id) || p.id === 0) { return null; }
  out = { id: u32(p.id), name: (typeof p.name === 'string') ? p.name.slice(0, 64) : '', fmts: {} };
  if (typeof p.thumb === 'string' && p.thumb.length <= MAX_THUMB_CHARS) { out.thumb = p.thumb; }
  for (f = 1; f <= 2; f++) {
    fm = p.fmts ? p.fmts[f] : null;
    if (fm && fm.len === FMT_LEN[f] && isInt(fm.crc)) {
      out.fmts[f] = { len: fm.len, crc: u32(fm.crc),
                      stored: (fm.stored === true) ? true : ((fm.stored === false) ? false : null) };
      n++;
    }
  }
  return n ? out : null;
}

/* ---- Album ---- */

function Album(storage, log) {
  this.s = storage;
  this.log = log || function () {};
  this.loader = null;                      /* dev: function (slot, fmt, cb(err, b64str)) */
  this.data = null;
  this._load();
}

Album.prototype._load = function () {
  var raw = null, d = null, k, self = this;
  try { raw = this.s.getItem(KEY); } catch (e) { raw = null; }
  if (raw !== null && raw !== undefined) {
    try { d = JSON.parse(raw); } catch (e) { d = null; }
  }
  if (!d || typeof d !== 'object' || d.v !== V || !d.photos || typeof d.photos.length !== 'number') {
    if (raw !== null && raw !== undefined) { this.log('[album] album in localStorage non valido: azzerato'); }
    this.data = emptyData();
    this.data.watch = this._loadWatch();   /* lo snapshot dell'HELLO ha la sua chiave: vale anche con album vuoto */
    return;
  }
  this.data = emptyData();
  for (k = 0; k < MAX_SLOTS; k++) { this.data.photos[k] = sanitizePhoto(d.photos[k]); }
  /* ordine GREZZO: lo ripulisce _fixOrder, che marca orderDirty se deve correggerlo (test S5b, bug B) */
  this.data.order = (d.order && typeof d.order.length === 'number') ? Array.prototype.slice.call(d.order) : [];
  this.data.settings = normalizeSettings(d.settings, null);
  this.data.settingsSet = !!d.settingsSet;
  this.data.deleted = uniqueSlots(d.deleted).filter(function (k) { return !self.data.photos[k]; });   /* bug C */
  this.data.orderDirty = !!d.orderDirty;
  this.data.orderGen = isInt(d.orderGen) ? d.orderGen : 0;
  this.data.watch = this._loadWatch();
  this._fixOrder();
  if (this._migrateStored()) { this._save(); }
};

/* Migrazione una tantum (S7, F12): i formati senza il campo `stored` (album di S5b/S6) vengono
 * sondati UNA volta per formato e il JSON viene riscritto; da lì in poi nessuna lettura dei payload
 * fuori da load(). Ritorna il numero di formati DECISI (0 = niente da migrare, niente da riscrivere).
 * Una sonda che non risponde (getItem che lancia) lascia il campo a null: la migrazione non è fatta
 * e si riprova al prossimo _load (o nel primo plan che tocca quel formato) — mai un `false`
 * permanente per un errore di lettura transitorio (revisione S7). */
Album.prototype._migrateStored = function () {
  var d = this.data, fmts = [FMT_RAW6, FMT_RAW1], k, p, i, f, v, n = 0, pend = 0;
  for (k = 0; k < MAX_SLOTS; k++) {
    p = d.photos[k];
    if (!p) { continue; }
    for (i = 0; i < fmts.length; i++) {
      f = fmts[i];
      if (p.fmts[f] && p.fmts[f].stored === null) {
        v = this._probeStored(k, f);
        if (v === null) { pend++; continue; }       /* non deciso: ci si riprova, il campo resta null */
        p.fmts[f].stored = v;
        n++;
      }
    }
  }
  if (n) { this.log('[album] migrazione: campo stored sondato per ' + n + ' formati'); }
  if (pend) { this.log('[album] migrazione: ' + pend + ' formati non sondabili, riprovo piu\' avanti'); }
  return n;
};

/* Sonda a TRE esiti dell'esistenza di un payload: true = c'è, false = non c'è, null = non si sa
 * (getItem ha lanciato). Serve solo alla migrazione e al primo plan che trova un campo non deciso:
 * a regime `stored` viene dai metadati e nessun payload si rilegge (F12). */
Album.prototype._probeStored = function (slot, fmt) {
  var v;
  try {
    v = this.s.getItem(pkey(slot, fmt));
  } catch (e) {
    this.log('[album] sonda del payload slot ' + slot + ' fmt ' + fmt + ' fallita: ' + e);
    return null;
  }
  return (typeof v === 'string' && v.length > 0);
};

Album.prototype._loadWatch = function () {
  var raw = null, w = null;
  try { raw = this.s.getItem(WKEY); } catch (e) { raw = null; }
  if (typeof raw !== 'string') { return null; }
  try { w = JSON.parse(raw); } catch (e) { w = null; }
  if (!w || typeof w !== 'object' || !w.slots || typeof w.slots.length !== 'number') { return null; }
  /* Snapshot scritto prima di v1.9 (senza `openMs`): resta valido, il campo vale null. */
  w.openMs = isInt(w.openMs) ? (w.openMs & 0xFFFF) : null;
  return w;
};

/* L'album (senza `watch`, che ha la sua chiave): una scrittura per applyPayload/onDone. */
Album.prototype._save = function () {
  var d = this.data, w = d.watch;
  try {
    d.watch = undefined;
    this.s.setItem(KEY, JSON.stringify(d));
    d.watch = w;
    return true;
  } catch (e) {
    d.watch = w;
    this.log('[album] salvataggio dell\'album fallito: ' + e);
    return false;
  }
};

Album.prototype._saveWatch = function () {
  try { this.s.setItem(WKEY, JSON.stringify(this.data.watch)); } catch (e) { this.log('[album] snapshot HELLO non salvato: ' + e); }
};

/* Ogni slot con foto sta nell'ordine (una volta sola) e nessuno slot vuoto ci sta: se serve
 * correggere, orderDirty. */
Album.prototype._fixOrder = function () {
  var d = this.data, out = [], k;
  uniqueSlots(d.order).forEach(function (k) { if (d.photos[k]) { out.push(k); } });
  for (k = 0; k < MAX_SLOTS; k++) {
    if (d.photos[k] && out.indexOf(k) < 0) { out.push(k); }
  }
  if (!sameArray(out, d.order)) {
    d.order = out;
    d.orderDirty = true;
    d.orderGen++;
  }
};

function pkey(slot, fmt) { return PKEY + slot + '.' + fmt; }

Album.prototype.getPayload = function (slot, fmt) {
  var v = null;
  try { v = this.s.getItem(pkey(slot, fmt)); } catch (e) { v = null; }
  return (typeof v === 'string' && v.length > 0) ? v : null;
};

Album.prototype.hasPayload = function (slot, fmt) {
  return this.getPayload(slot, fmt) !== null;
};

Album.prototype.setPayload = function (slot, fmt, str) {
  try {
    this.s.setItem(pkey(slot, fmt), str);
    return true;
  } catch (e) {
    this.log('[album] scrittura del payload slot ' + slot + ' fmt ' + fmt + ' fallita: ' + e);
    return false;
  }
};

Album.prototype.removePayload = function (slot, fmt) {
  try { this.s.removeItem(pkey(slot, fmt)); } catch (e) { /* già assente */ }
};

/* Solo per reset(): dentro applyPayload le rimozioni di payload sono rimandate a dopo _save(). */
Album.prototype._clearSlot = function (slot) {
  this.data.photos[slot] = null;
  this.removePayload(slot, FMT_RAW6);
  this.removePayload(slot, FMT_RAW1);
};

/* Decodifica e verifica un payload base64url: ritorna i byte oppure una stringa di errore. */
function decodeChecked(str, fmt, expectedCrc) {
  var bytes, c;
  try { bytes = b64.decode(str); } catch (e) { return 'base64: ' + e.message; }
  if (bytes.length !== FMT_LEN[fmt]) { return 'lunghezza ' + bytes.length + ' invece di ' + FMT_LEN[fmt]; }
  c = crc.crc32(bytes);
  if (c !== expectedCrc) { return 'crc 0x' + c.toString(16) + ' invece di 0x' + expectedCrc.toString(16); }
  return bytes;
}

/* payload = {v:1, settings?, order?, deleted?, photos?: [{slot, photo_id, fmt, len, crc, data?, url?, name?, thumb?}]}
 * opts.full: stato completo (slot non elencati → eliminati); opts.allowUrl: voci senza `data`
 * ammesse come "solo metadati" (dev server, payload scaricato a richiesta dal loader).
 *
 * Una voce con slot valido conta come "elencata" anche se il resto è rotto (fmt/len/crc/data): la
 * foto locale di quello slot non si tocca e non finisce nemmeno fra le eliminazioni esplicite. Se
 * qualche voce NON è identificabile (photos non array, troppe voci, voce non oggetto, slot non
 * valido, payload interrotto per troppi errori) in modalità `full` le eliminazioni implicite vengono
 * saltate (errore "eliminazioni implicite saltate"): il telefono non elimina mai per un errore di
 * trasferimento. `{v:1}` full senza `photos` resta "album svuotato".
 *
 * Ordine delle scritture: il payload nuovo si scrive PRIMA di toccare la foto vecchia (stessa chiave,
 * si sovrascrive: quota ⇒ "foto non registrata" e la vecchia resta intatta, metadati e payload); le
 * RIMOZIONI di payload (altro formato della foto sostituita, voce dev senza data, slot eliminati) si
 * eseguono SOLO dopo un _save() riuscito. Se _save() fallisce, ogni payload scritto in questa chiamata
 * viene riportato al valore precedente (o rimosso), l'album viene riletto dal disco e l'esito è
 * ok=false, changed=false, added/updated/deleted vuoti: RAM = disco, mai payload orfani né metadati
 * che puntano a byte diversi (revisione post code-review, F6/F8/F10).
 * Ritorna {ok, changed, added[], updated[], deleted[], errors[]}. */
Album.prototype.applyPayload = function (payload, opts) {
  var d = this.data;
  var self = this;
  var res = { ok: true, changed: false, added: [], updated: [], deleted: [], errors: [] };
  var ids = {}, listed = {}, i, e, slot, fmt, id, crcv, cur, bytes, payload64, prev, k, key, order, st, w;
  var fullUnsafe = false;   /* voci non identificabili: in `full` niente eliminazioni implicite */
  var written = [];         /* [slot, fmt, valore precedente | null] per ogni setPayload riuscito (rollback) */
  var pending = {};         /* 'slot.fmt' → [slot, fmt]: rimozioni di payload rimandate a dopo _save() */
  var orig = {};            /* slot → {fmt: stored} dei metadati ORIGINALI, prima di ogni mutazione */
  var prevs = {};           /* 'slot.fmt' → byte del payload ORIGINALE (o null): letti una volta sola */
  opts = opts || {};
  if (!payload || typeof payload !== 'object' || payload.v !== V) {
    res.ok = false;
    res.errors.push('payload non valido (v ' + (payload ? payload.v : '?') + ')');
    return res;
  }
  function pendRemove(s, f) { pending[s + '.' + f] = [s, f]; }
  /* un payload scritto ora annulla una rimozione decisa prima per la stessa chiave (voce dev senza
   * data seguita da una con data; secondo formato della stessa foto nuova) */
  function wrote(s, f, p) { delete pending[s + '.' + f]; written.push([s, f, p]); }
  /* Metadati con cui lo slot è entrato in QUESTA chiamata, copiati la prima volta che lo si tocca:
   * dopo una sostituzione `d.photos[s]` è già il record NUOVO (fmts vuoto per l'altro formato) e non
   * direbbe più che sul disco c'è ancora il payload della foto vecchia — la rimozione è solo
   * PENDENTE, si esegue dopo _save() (revisione S7). */
  function snapOrig(s) {
    var p, f, m = null;
    if (Object.prototype.hasOwnProperty.call(orig, s)) { return orig[s]; }
    p = d.photos[s];
    if (p) {
      m = {};
      for (f = 1; f <= 2; f++) { if (p.fmts[f]) { m[f] = p.fmts[f].stored; } }
    }
    orig[s] = m;
    return m;
  }
  /* Byte da rimettere su questa chiave se _save() fallisce: quelli con cui la chiamata è iniziata.
   * Si leggono SOLO se i metadati originali non dicono "assente" (F12: mai un getItem da 45,6 KB
   * alla cieca; `stored` null = non deciso ⇒ si legge, il rollback deve essere esatto) e una volta
   * sola per chiave, sempre PRIMA della prima setPayload su quella chiave. */
  function prevOf(s, f) {
    var kk = s + '.' + f, m;
    if (!Object.prototype.hasOwnProperty.call(prevs, kk)) {
      m = snapOrig(s);
      prevs[kk] = (m && m[f] !== undefined && m[f] !== false) ? self.getPayload(s, f) : null;
    }
    return prevs[kk];
  }

  /* 1. foto: una voce per formato (al più 24 voci; gli errori si fermano a MAX_ERRORS) */
  if (payload.photos !== undefined && !isArray(payload.photos)) { res.errors.push('photos non e\' un array'); fullUnsafe = true; }
  if (isArray(payload.photos)) {
    if (payload.photos.length > MAX_PHOTO_ENTRIES) { res.errors.push('photos: ' + payload.photos.length + ' voci, al piu\' ' + MAX_PHOTO_ENTRIES); fullUnsafe = true; }
    for (i = 0; i < payload.photos.length && i < MAX_PHOTO_ENTRIES; i++) {
      if (res.errors.length >= MAX_ERRORS) { res.errors.push('troppi errori: payload interrotto'); fullUnsafe = true; break; }
      e = payload.photos[i];
      if (!e || typeof e !== 'object') { res.errors.push('foto ' + i + ': voce non valida'); fullUnsafe = true; continue; }
      slot = e.slot; fmt = e.fmt;
      if (!isSlot(slot)) { res.errors.push('foto ' + i + ': slot ' + slot + ' non valido'); fullUnsafe = true; continue; }
      listed[slot] = true;      /* elencato appena lo slot è noto: una voce rotta non cancella la foto locale */
      if (!isFmt(fmt)) { res.errors.push('foto ' + i + ': fmt ' + fmt + ' non valido'); continue; }
      if (e.len !== FMT_LEN[fmt]) { res.errors.push('slot ' + slot + ': len ' + e.len + ' non valida per fmt ' + fmt); continue; }
      if (!isInt(e.crc)) { res.errors.push('slot ' + slot + ': crc mancante'); continue; }
      crcv = u32(e.crc);
      id = u32(e.photo_id);
      if (!id) {
        if (!ids[slot]) { ids[slot] = newPhotoId(); }
        id = ids[slot];
      }
      payload64 = null;                                       /* i byte base64url da scrivere (null = voce dev "solo metadati") */
      if (typeof e.data === 'string' && e.data.length) {
        /* lunghezza base64url attesa (senza padding) prima di decodificare: niente lavoro su stringhe enormi */
        if (e.data.length < Math.ceil(FMT_LEN[fmt] * 4 / 3) || e.data.length > Math.ceil(FMT_LEN[fmt] * 4 / 3) + 8) {
          res.errors.push('slot ' + slot + ' fmt ' + fmt + ': data di ' + e.data.length + ' caratteri');
          continue;
        }
        bytes = decodeChecked(e.data, fmt, crcv);
        if (typeof bytes === 'string') { res.errors.push('slot ' + slot + ' fmt ' + fmt + ': ' + bytes); continue; }
        payload64 = e.data;
      } else if (!(opts.allowUrl && typeof e.url === 'string')) {
        res.errors.push('slot ' + slot + ' fmt ' + fmt + ': senza data');
        continue;
      }
      snapOrig(slot);                                         /* prima di ogni mutazione dello slot */
      cur = d.photos[slot];
      if (cur && cur.id === id && cur.fmts[fmt] && cur.fmts[fmt].crc === crcv) {
        if (payload64 && !cur.fmts[fmt].stored) {              /* stessi metadati, payload mancante: lo aggiungo */
          prev = prevOf(slot, fmt);
          if (this.setPayload(slot, fmt, payload64)) { cur.fmts[fmt].stored = true; wrote(slot, fmt, prev); res.updated.push(slot); res.changed = true; }
          else { res.errors.push('slot ' + slot + ': quota'); }
        }
        if (typeof e.name === 'string' && e.name !== cur.name) { cur.name = e.name.slice(0, 64); res.changed = true; }
        if (typeof e.thumb === 'string' && e.thumb.length <= MAX_THUMB_CHARS && e.thumb !== cur.thumb) { cur.thumb = e.thumb; res.changed = true; }
        continue;                                               /* idempotente */
      }
      /* PRIMA il payload nuovo (la stessa chiave si sovrascrive), POI la foto vecchia: se setItem
       * lancia (quota) l'album resta com'era — mai distruggere prima di aver scritto */
      if (payload64) {
        /* per il rollback: i byte con cui la chiamata ha trovato la chiave (o null). Si decide sui
         * metadati ORIGINALI dello slot, non su `cur`: due voci (una per formato) della stessa foto
         * nuova lasciano `cur` con fmts vuoto, ma il payload dell'altro formato della VECCHIA è
         * ancora sul disco (rimozione pendente) — revisione S7. */
        prev = prevOf(slot, fmt);
        if (!this.setPayload(slot, fmt, payload64)) {
          res.errors.push('slot ' + slot + ' fmt ' + fmt + ': quota, foto non registrata');
          continue;
        }
        wrote(slot, fmt, prev);
      } else {
        pendRemove(slot, fmt);                                  /* dev, solo metadati: il payload vecchio di questo formato non vale più */
      }
      if (!cur || cur.id !== id) {
        /* foto nuova (o sostituita) nello slot: via i metadati e, dopo il salvataggio, il payload
         * dell'ALTRO formato della vecchia (quello di questo formato è già stato sovrascritto) */
        pendRemove(slot, (fmt === FMT_RAW6) ? FMT_RAW1 : FMT_RAW6);
        cur = { id: id, name: (typeof e.name === 'string') ? e.name.slice(0, 64) : '', fmts: {} };
        if (typeof e.thumb === 'string' && e.thumb.length <= MAX_THUMB_CHARS) { cur.thumb = e.thumb; }
        d.photos[slot] = cur;
        if (res.added.indexOf(slot) < 0) { res.added.push(slot); }
      } else {
        /* stesso id, CRC diverso (o formato in più) */
        if (res.updated.indexOf(slot) < 0 && res.added.indexOf(slot) < 0) { res.updated.push(slot); }
      }
      cur.fmts[fmt] = { len: FMT_LEN[fmt], crc: crcv, stored: payload64 ? true : false };
      res.changed = true;
    }
  }

  /* 2. eliminazioni esplicite (ma uno slot elencato da questo stesso payload resta: test S5b, bug A);
   * 3. stato completo: slot locali non elencati — solo se ogni voce era identificabile */
  var toDelete = (isArray(payload.deleted) ? uniqueSlots(payload.deleted) : []).filter(function (k) { return !listed[k]; });
  if (opts.full && fullUnsafe) { res.errors.push('stato completo con voci non identificabili: eliminazioni implicite saltate'); }
  if (opts.full && !fullUnsafe) {
    for (k = 0; k < MAX_SLOTS; k++) {
      if (d.photos[k] && !listed[k] && toDelete.indexOf(k) < 0) { toDelete.push(k); }
    }
  }
  toDelete.forEach(function (k) {
    if (d.photos[k]) {
      d.photos[k] = null;                                       /* subito in RAM; i payload dopo _save() */
      pendRemove(k, FMT_RAW6); pendRemove(k, FMT_RAW1);
      res.deleted.push(k); res.changed = true;
    }
    if (d.deleted.indexOf(k) < 0) { d.deleted.push(k); res.changed = true; }
  });
  /* uno slot riempito da questo payload non può restare fra le eliminazioni pendenti */
  d.deleted = d.deleted.filter(function (k) { return !d.photos[k]; });

  /* 4. ordine */
  if (isArray(payload.order)) {
    order = [];
    uniqueSlots(payload.order).forEach(function (k) { if (d.photos[k]) { order.push(k); } });
    for (k = 0; k < MAX_SLOTS; k++) { if (d.photos[k] && order.indexOf(k) < 0) { order.push(k); } }
    if (!sameArray(order, d.order)) { d.order = order; d.orderDirty = true; d.orderGen++; res.changed = true; }
  } else {
    /* senza ordine esplicito: via gli slot vuoti, in coda gli slot nuovi (fatto da _fixOrder) */
  }
  this._fixOrder();
  if (res.added.length || res.deleted.length) { d.orderDirty = true; }

  /* 5. impostazioni: l'utente le ha espresse (anche uguali ai default) → da qui in poi il telefono
   * è l'autorità e le manda quando il CRC dell'orologio differisce; un telefono che non le ha mai
   * impostate (installazione nuova) NON sovrascrive con i default quelle dell'orologio. */
  if (payload.settings && typeof payload.settings === 'object') {
    st = normalizeSettings(payload.settings, d.settings);
    if (!sameSettings(st, d.settings)) { d.settings = st; res.changed = true; }
    if (!d.settingsSet) { d.settingsSet = true; res.changed = true; }
  }

  /* 6. salvataggio: a JSON scritto si eseguono le rimozioni rimandate; se il JSON non si scrive
   * la modifica viene annullata per intero (payload riportati al valore precedente o rimossi, in
   * ordine inverso; album riletto dal disco) e l'esito lo dice: RAM = disco. */
  if (this._save()) {
    for (key in pending) {
      if (Object.prototype.hasOwnProperty.call(pending, key)) { this.removePayload(pending[key][0], pending[key][1]); }
    }
  } else {
    for (i = written.length - 1; i >= 0; i--) {
      w = written[i];
      if (w[2] !== null && this.setPayload(w[0], w[1], w[2])) { continue; }
      this.removePayload(w[0], w[1]);
    }
    this._load();
    res.ok = false; res.changed = false;
    res.added = []; res.updated = []; res.deleted = [];
    res.errors.push('album non salvato: modifiche annullate');
    this.log('[album] album non salvato: ' + written.length + ' payload annullati, album riletto dal disco');
  }
  if (res.errors.length) { this.log('[album] applyPayload: ' + res.errors.join('; ')); }
  return res;
};

/* Piano di sync per l'HELLO ricevuto (sync.js provider.plan). hello = {format, maxChunk,
 * settingsCrc|null|undefined, slots: [12 × {state, crc}]}. */
Album.prototype.plan = function (hello) {
  var d = this.data, self = this;
  var fmt = hello.format, slots = hello.slots || [];
  var out = { photos: [], settings: null, order: null, deletes: [] };
  var k, p, w, valid, myCrc, foreign = [], orderBytes, i, wslots = [], stored, probed = false;

  for (k = 0; k < MAX_SLOTS; k++) {
    w = slots[k] || { state: 0, crc: 0 };
    wslots.push({ state: w.state ? 1 : 0, crc: u32(w.crc) });
  }

  if (!isFmt(fmt)) {
    this.log('[album] HELLO con formato ' + fmt + ' sconosciuto: nessuna foto');
  }
  for (k = 0; k < MAX_SLOTS; k++) {
    p = d.photos[k];
    w = wslots[k];
    valid = w.state === 1;
    if (!p) {
      if (valid && d.deleted.indexOf(k) < 0) { foreign.push(k); }
      continue;
    }
    if (!isFmt(fmt)) { continue; }
    if (!p.fmts[fmt]) {
      this.log('[album] slot ' + k + ': nessun payload nel formato ' + fmt + ' dell\'orologio (da rifare il ritaglio)');
      continue;
    }
    if (valid && w.crc === p.fmts[fmt].crc) { continue; }          /* già sull'orologio */
    stored = p.fmts[fmt].stored;
    if (stored === null) {
      /* migrazione non conclusa (la sonda di _load non aveva risposto): una sonda UNA TANTUM qui,
       * e l'esito finisce nel JSON insieme al resto del piano. Se anche questa non risponde la foto
       * salta SOLO per questo piano: il campo resta da sondare, mai un `false` permanente. */
      stored = this._probeStored(k, fmt);
      if (stored === null) {
        this.log('[album] slot ' + k + ': stato del payload fmt ' + fmt + ' illeggibile: saltata');
        continue;
      }
      p.fmts[fmt].stored = stored;
      probed = true;
    }
    if (!stored && !this.loader) {                                 /* F12: mai un getItem del payload nel piano */
      this.log('[album] slot ' + k + ': payload fmt ' + fmt + ' assente e nessun loader: saltata');
      continue;
    }
    out.photos.push(this._planPhoto(k, fmt, p));
  }

  /* eliminazioni: solo quelle ancora VALID; le altre sono già fatte */
  var deletedBefore = d.deleted.length;
  d.deleted = d.deleted.filter(function (k) {
    if (wslots[k].state === 1) { out.deletes.push(k); return true; }
    return false;
  });

  if (d.orderDirty || out.photos.length || out.deletes.length) {
    this._planOrderGen = d.orderGen;      /* onDone azzera orderDirty solo se l'ordine è ancora questo (revisione S5b) */
    orderBytes = [];
    d.order.forEach(function (k) { if (orderBytes.length < MAX_SLOTS) { orderBytes.push(k); } });
    foreign.forEach(function (k) { if (orderBytes.length < MAX_SLOTS && orderBytes.indexOf(k) < 0) { orderBytes.push(k); } });
    while (orderBytes.length < MAX_SLOTS) { orderBytes.push(SLOT_NONE); }
    out.order = orderBytes;
  }

  myCrc = settingsCrc(d.settings);
  if (d.settingsSet &&
      (hello.settingsCrc === undefined || hello.settingsCrc === null || (hello.settingsCrc & 0xFFFF) !== myCrc)) {
    out.settings = settingsBytes(d.settings);
  }

  d.watch = { at: new Date().getTime(), format: fmt, maxChunk: hello.maxChunk | 0,
              settingsCrc: (hello.settingsCrc === undefined) ? null : hello.settingsCrc,
              /* v1.9 (perf 04/09): tempo di apertura del file persist; la config page avvisa se e'
               * sopra la soglia. Orologio vecchio (campo assente) -> null, mai un avviso. */
              openMs: isInt(hello.openMs) ? (hello.openMs & 0xFFFF) : null,
              slots: wslots, foreign: foreign };
  this._saveWatch();
  /* eliminazioni già fatte sull'orologio: via dalla lista; `probed` = campi `stored` appena decisi */
  if (deletedBefore !== d.deleted.length || probed) { this._save(); }
  this.log('[album] piano: ' + out.photos.length + ' foto, ' + out.deletes.length + ' eliminazioni, ordine ' +
           (out.order ? 'si\'' : 'no') + ', impostazioni ' + (out.settings ? 'si\'' : (d.settingsSet ? 'no' : 'mai impostate')) +
           (foreign.length ? ', estranei [' + foreign.join(',') + ']' : ''));
  return out;
};

/* Un payload locale che non torna con i metadati CORRENTI è corrotto: via il payload e, senza un
 * loader che possa riscaricarlo, anche i metadati del formato (mai una foto "zombie" che non si può
 * più inviare, revisione S5b). */
Album.prototype._dropCorrupt = function (slot, fmt, why) {
  var p = this.data.photos[slot];
  this.log('[album] slot ' + slot + ' fmt ' + fmt + ': payload locale corrotto (' + why + '): rimosso');
  this.removePayload(slot, fmt);
  if (!p) { return; }
  if (this.loader) {
    /* il payload si può riscaricare: i metadati restano, ma l'invariante "stored ⇒ payload su
     * disco" va ristabilita */
    if (p.fmts[fmt] && p.fmts[fmt].stored) { p.fmts[fmt].stored = false; this._save(); }
    return;
  }
  delete p.fmts[fmt];
  if (!p.fmts[FMT_RAW6] && !p.fmts[FMT_RAW1]) { this.data.photos[slot] = null; this._fixOrder(); }
  this._save();
};

Album.prototype._planPhoto = function (slot, fmt, p) {
  var self = this;
  var photo = { slot: slot, photoId: p.id, format: fmt, length: FMT_LEN[fmt], crc: p.fmts[fmt].crc, name: p.name };
  photo.load = function (cb) {
    /* L'album può essere cambiato dopo il piano (Save durante la sync): il piano vale solo se lo slot
     * ha ancora la stessa foto; altrimenti la foto salta e il prossimo HELLO rifà il piano. */
    var cur = self.data.photos[slot], str, r;
    if (!cur || cur.id !== photo.photoId || !cur.fmts[fmt] || cur.fmts[fmt].crc !== photo.crc) {
      return cb('foto cambiata dopo il piano');
    }
    str = self.getPayload(slot, fmt);
    if (str !== null) {
      r = decodeChecked(str, fmt, photo.crc);
      if (typeof r === 'string') {
        self._dropCorrupt(slot, fmt, r);
        return cb('payload corrotto');
      }
      return cb(null, r);
    }
    if (!self.loader) {
      /* i metadati dicono `stored` ma il payload non c'è più (localStorage ripulito dal sistema,
       * rollback che non ha potuto ripristinarlo): via i metadati del formato, così il prossimo
       * HELLO non la ripianifica all'infinito (F12) */
      if (cur.fmts[fmt].stored) { self._dropCorrupt(slot, fmt, 'payload assente'); }
      return cb('payload assente');
    }
    self.loader(slot, fmt, function (err, s) {
      var r2, cur2 = self.data.photos[slot];
      if (err || typeof s !== 'string') { return cb('loader: ' + (err || 'vuoto')); }
      if (!cur2 || cur2.id !== photo.photoId || !cur2.fmts[fmt] || cur2.fmts[fmt].crc !== photo.crc) {
        return cb('foto cambiata durante il caricamento');
      }
      r2 = decodeChecked(s, fmt, photo.crc);
      if (typeof r2 === 'string') { return cb('loader: ' + r2); }
      if (!self.setPayload(slot, fmt, s)) { self.log('[album] slot ' + slot + ': payload non salvato (quota), invio comunque'); }
      else if (!cur2.fmts[fmt].stored) { cur2.fmts[fmt].stored = true; self._save(); }   /* F12: da qui il piano lo sa senza rileggerlo */
      cb(null, r2);
    });
  };
  return photo;
};

/* Esiti della sync (sync.js provider.onDone). */
Album.prototype.onDone = function (summary) {
  var d = this.data, changed = false, watchChanged = false, self = this;
  if (!summary) { return; }
  if (summary.order === 'OK' && d.orderDirty && this._planOrderGen === d.orderGen) { d.orderDirty = false; changed = true; }
  (summary.deletes || []).forEach(function (s) {
    var parts = String(s).split(':'), k = +parts[0];
    if (parts[1] === 'OK' && isSlot(k) && d.deleted.indexOf(k) >= 0) {
      d.deleted.splice(d.deleted.indexOf(k), 1);
      changed = true;
    }
    if (parts[1] === 'OK' && self._watchSlot(k, 0, 0)) { watchChanged = true; }   /* S6: snapshot per la config page */
  });
  if (changed) { this._save(); }
  if (watchChanged) { this._saveWatch(); }
};

/* S6: lo snapshot dell'HELLO (`watch`, stato per la config page) viene aggiornato con gli esiti della
 * sync, così la pagina aperta subito dopo non mostra "da inviare" foto appena arrivate né slot
 * appena eliminati. Il prossimo HELLO lo sostituisce comunque per intero. */
Album.prototype._watchSlot = function (slot, state, crc) {
  var w = this.data.watch, i;
  if (!w || !w.slots || !isSlot(slot)) { return false; }
  w.slots[slot] = { state: state, crc: crc };
  if (w.foreign) {
    i = w.foreign.indexOf(slot);
    if (i >= 0) { w.foreign.splice(i, 1); }
  }
  return true;
};

Album.prototype.onPhotoResult = function (photo, ok, code) {
  this.log('[album] foto slot ' + (photo ? photo.slot : '?') + ': ' + (ok ? 'OK' : 'fallita (' + code + ')'));
  if (ok && photo && this._watchSlot(photo.slot, 1, u32(photo.crc))) { this._saveWatch(); }
};

Album.prototype.setLoader = function (fn) { this.loader = fn; };

Album.prototype.settingsBytes = function () { return settingsBytes(this.data.settings); };
Album.prototype.settingsCrc = function () { return settingsCrc(this.data.settings); };

/* Stato per la config page (S6) e per i log. `watch` e' lo snapshot dell'ultimo HELLO: porta anche
 * `at` (quando) e `openMs` (v1.9: apertura del file persist sull'orologio, null se non noto), da cui
 * la pagina ricava l'avviso di avvio lento. */
Album.prototype.state = function () {
  var d = this.data;
  return { v: V, photos: d.photos, order: d.order.slice(), settings: d.settings, settingsSet: d.settingsSet,
           deleted: d.deleted.slice(), orderDirty: d.orderDirty, watch: d.watch };
};

Album.prototype.count = function () {
  var n = 0, k;
  for (k = 0; k < MAX_SLOTS; k++) { if (this.data.photos[k]) { n++; } }
  return n;
};

Album.prototype.summary = function () {
  var d = this.data, parts = [], k, p;
  for (k = 0; k < MAX_SLOTS; k++) {
    p = d.photos[k];
    if (p) { parts.push(k + ':' + (p.fmts[1] ? '6' : '') + (p.fmts[2] ? '1' : '')); }   /* niente getItem dei payload: costano 45 KB l'uno */
  }
  return this.count() + ' foto [' + parts.join(' ') + '] ordine [' + d.order.join(',') + ']' + (d.orderDirty ? '*' : '') +
         ' eliminazioni [' + d.deleted.join(',') + '] settings crc 0x' + settingsCrc(d.settings).toString(16);
};

Album.prototype.reset = function () {
  var k;
  for (k = 0; k < MAX_SLOTS; k++) { this._clearSlot(k); }
  this.data = emptyData();
  try { this.s.removeItem(KEY); } catch (e) { /* niente */ }
  try { this.s.removeItem(WKEY); } catch (e) { /* niente */ }
};

module.exports = Album;
module.exports.MAX_SLOTS = MAX_SLOTS;
module.exports.FMT_RAW6 = FMT_RAW6;
module.exports.FMT_RAW1 = FMT_RAW1;
module.exports.FMT_LEN = FMT_LEN;
module.exports.KEY = KEY;
module.exports.WKEY = WKEY;
module.exports.payloadKey = pkey;
module.exports.defaultSettings = defaultSettings;
module.exports.normalizeSettings = normalizeSettings;
module.exports.settingsBytes = settingsBytes;
module.exports.settingsCrc = settingsCrc;
module.exports.SETTINGS_FIELDS = SETTINGS_FIELDS;

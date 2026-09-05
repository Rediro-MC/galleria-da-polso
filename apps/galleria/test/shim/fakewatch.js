/* fakewatch.js — orologio FINTO per i test node del PKJS (S5b): un modello JavaScript della
 * macchina a stati di src/c/sync_proto.c secondo docs/design/galleria.md §5 (v1.7). Riceve i
 * dizionari che il PKJS manda con Pebble.sendAppMessage e ritorna le risposte (0 o 1 dizionario,
 * come l'orologio: al più un messaggio per direzione). Non sostituisce il test host C di
 * sync_proto (test_sync_proto.c): serve a esercitare il motore JS e l'album con sequenze
 * realistiche, guasti compresi (STATUS persi, NACK, timeout di silenzio, wipe).
 *
 *   var FakeWatch = require('fakewatch');            // NODE_PATH=test/shim
 *   var w = new FakeWatch({ format: 1, maxChunk: 4096, log: console.log });
 *   var replies = w.handle(dict);                    // dict con chiavi numeriche (message_keys)
 *   w.wipe(); w.slots[k]; w.settings; w.order; w.dropStatus = 1; w.idle();
 *   w.openMs = 2150;                                 // HELLO.OPEN_MS (v1.9); w.noOpenMs = orologio vecchio
 *   w.progress                                        // [k, n] di "Foto k/n" (SYNC_REQUEST{OFFSET}: F3)
 *
 * `nameKeys` (S8, bug di campo F-S8-1 del 30/08/2026): l'app Core Devices (Android) NON consegna al
 * PKJS le chiavi numeriche di pypkjs ma i NOMI ('MSG', 'PROTO', ...), e i byte array come array di
 * int8 CON SEGNO (cast Kotlin: 200 -> -56). Con `new FakeWatch({ nameKeys: true })` (o GAL_NAMEKEYS=1
 * nell'ambiente, che cambia il default di TUTTI i FakeWatch del processo) ogni payload consegnato al
 * PKJS viene riscritto in quella forma; i dizionari IN USCITA dal PKJS restano numerici, come sul
 * telefono vero. Un test che legge direttamente il ritorno di handle() deve usare FakeWatch.get(d,
 * 'MSG') invece di d[keys.MSG], altrimenti in questa modalita' non trova nulla.
 */
var keys = require('message_keys');
var crc = require('../../src/pkjs/crc');

/* Nome della chiave a partire dal suo numero (10000 + i): l'inverso di message_keys.js. */
var NAME_OF = {};
(function () {
  var k;
  for (k in keys) { if (Object.prototype.hasOwnProperty.call(keys, k)) { NAME_OF['' + keys[k]] = k; } }
})();

/* GAL_NAMEKEYS=1: default `nameKeys` per tutti i FakeWatch (l'intera suite gira come sull'app Core
 * Devices). Assente/0 -> comportamento di sempre (chiavi numeriche, byte 0..255). */
var NAMEKEYS_DEFAULT = (typeof process !== 'undefined' && process.env &&
                        process.env.GAL_NAMEKEYS && process.env.GAL_NAMEKEYS !== '0') ? true : false;

/* Riscrittura di un payload nella forma dell'app Core Devices: chiavi-NOME e byte array in int8 con
 * segno (PKJSApp.toJSData; i valori scalari restano interi). Le chiavi che non hanno un nome (nessuna,
 * oggi) restano come sono. */
function toNameKeys(d) {
  var out = {}, k, v;
  for (k in d) {
    if (!Object.prototype.hasOwnProperty.call(d, k)) { continue; }
    v = d[k];
    if (Array.isArray(v)) {
      v = v.map(function (x) { return (((x | 0) & 0xFF) << 24) >> 24; });   /* 200 -> -56 (cast Kotlin) */
    }
    out[NAME_OF['' + k] || k] = v;
  }
  return out;
}

var MSG = { JS_READY: 1, HELLO: 2, SYNC_REQUEST: 3, SYNC_READY: 4, PHOTO_BEGIN: 5, PHOTO_DATA: 6,
            PHOTO_END: 7, STATUS: 8, SYNC_DONE: 9, SETTINGS: 10, ALBUM_ORDER: 11, ALBUM_DELETE: 12 };
var CODE = { OK: 0, CRC_ERR: 1, NO_SPACE: 2, BAD_FORMAT: 3, BUSY: 4, SEQ_ERR: 5, NOT_SUPPORTED: 6, STORAGE_ERR: 7 };
var FMT_LEN = { 1: 34200, 2: 3024 };
var MAX_SLOTS = 12, SLOT_NONE = 0xFF, CHUNK = 256;
var DEFAULT_SETTINGS = [1, 0, 0, 0, 0, 0, 0, 30, 0, 0, 1, 15, 0, 0, 0, 0, 0, 0];   /* settings.c, 18 B senza crc16 */
/* S8/D21: il byte 12 e' `digit_style` (0 = pieno), ex primo dei sei `reserved`; il default resta 0,
 * quindi il blob e il CRC di un orologio appena azzerato non cambiano. La validazione del blob in
 * MSG.SETTINGS e' lo specchio di settings_validate() (src/c/settings.c): S8 alza il font a <= 5
 * (D22: 4 Francois One, 5 Staatliches) e aggiunge il controllo digit_style <= 3 (D21). */

function FakeWatch(opts) {
  opts = opts || {};
  this.format = opts.format || 1;
  this.maxChunk = (opts.maxChunk !== undefined) ? opts.maxChunk : (this.format === 2 ? 3072 : 4096);
  this.albumEnabled = (opts.albumEnabled !== undefined) ? opts.albumEnabled : true;
  /* v1.9: HELLO.OPEN_MS = ms dell'apertura del file persist (0 = misurato e trascurabile, come un
   * orologio con il file sano). `noOpenMs` = orologio vecchio, che il campo non lo manda affatto. */
  this.openMs = (opts.openMs !== undefined) ? opts.openMs : 0;
  this.noOpenMs = !!opts.noOpenMs;
  this.log = opts.log || function () {};
  /* F-S8-1: payload verso il PKJS con le chiavi-NOME e i byte con segno (app Core Devices). */
  this.nameKeys = (opts.nameKeys !== undefined) ? !!opts.nameKeys : NAMEKEYS_DEFAULT;
  this.dropStatus = 0;          /* > 0: i prossimi N STATUS/SYNC_READY non vengono spediti (persi) */
  this.received = [];           /* log dei MSG ricevuti (numeri) */
  this.sent = [];               /* log dei MSG spediti */
  this.progress = [];           /* [index, count] di "Foto k/n" */
  this.wipe();
}

FakeWatch.prototype.wipe = function () {
  var k;
  this.slots = [];
  this.buffers = [];
  for (k = 0; k < MAX_SLOTS; k++) { this.slots.push({ state: 0, crc: 0, photoId: 0, generation: 0 }); this.buffers.push(null); }
  this.order = [];
  this.settings = DEFAULT_SETTINGS.slice();
  this.state = 'IDLE';
  this.pending = null;
  this.count = 0; this.index = 0; this.countedSlot = SLOT_NONE; this.countedId = 0;
};

FakeWatch.prototype.settingsCrc = function () { return crc.crc16(this.settings.slice(0, 18)); };

FakeWatch.prototype.validSlots = function () {
  var out = [], k;
  for (k = 0; k < MAX_SLOTS; k++) { if (this.slots[k].state === 1) { out.push(k); } }
  return out;
};

function u32(v) { return (v === undefined || v === null) ? undefined : (v >>> 0); }
function u8(v) { v = u32(v); return (v === undefined) ? undefined : (v > 255 ? 255 : v); }

FakeWatch.prototype._status = function (code, slot, offset) {
  var d = {};
  d[keys.MSG] = MSG.STATUS; d[keys.CODE] = code; d[keys.SLOT] = (slot === undefined) ? SLOT_NONE : slot;
  d[keys.OFFSET] = (offset || 0) | 0;
  if (!this.noReplyTo) { d[keys.REPLY_TO] = this._replyTo | 0; }   /* S5b: il MSG a cui risponde */
  return d;
};

FakeWatch.prototype._hello = function () {
  var d = {}, slots = [], k, c;
  for (k = 0; k < MAX_SLOTS; k++) {
    c = this.slots[k].state ? this.slots[k].crc : 0;
    slots.push(this.slots[k].state, c & 255, (c >>> 8) & 255, (c >>> 16) & 255, (c >>> 24) & 255);
  }
  d[keys.MSG] = MSG.HELLO; d[keys.PROTO] = 1; d[keys.FORMAT] = this.format;
  d[keys.MAX_CHUNK] = this.albumEnabled ? this.maxChunk : 0;
  if (!this.noSettingsCrc) { d[keys.CRC] = this.settingsCrc(); }
  if (!this.noOpenMs) { d[keys.OPEN_MS] = this.openMs & 0xFFFF; }
  d[keys.SLOTS] = slots;
  return d;
};

FakeWatch.prototype._progress = function (index, count) {
  this.index = index; this.count = count; this.progress.push([index, count]);
};

/* Timeout di silenzio (30 s in SYNCING): la foto in corso decade, IDLE. */
FakeWatch.prototype.idle = function () {
  if (this.state !== 'SYNCING') { return false; }
  this.state = 'IDLE'; this.pending = null; this._progress(0, 0);
  return true;
};

FakeWatch.prototype._commit = function (slot, fmt, length, crc32, photoId) {
  var s = this.slots[slot];
  s.state = 1; s.format = fmt; s.length = length; s.crc = crc32; s.photoId = photoId; s.generation++;
  if (this.order.indexOf(slot) < 0) { this.order.push(slot); }
};

/* Ritorna un Array di risposte (0 o 1 elemento). */
FakeWatch.prototype.handle = function (d) {
  var msg = u8(d[keys.MSG]) || 0, out, self = this;
  this._replyTo = msg;
  out = this._handle(d, msg);
  this.received.push(msg);
  out = out ? [out] : [];
  out = out.filter(function (r) {
    if ((r[keys.MSG] === MSG.STATUS || r[keys.MSG] === MSG.SYNC_READY) && self.dropStatus > 0) {
      self.dropStatus--;
      self.log('[watch] risposta MSG ' + r[keys.MSG] + ' PERSA (dropStatus)');
      return false;
    }
    return true;
  });
  out.forEach(function (r) { self.sent.push(r[keys.MSG]); });
  /* Ultimo passo: `received`/`sent`, il filtro dropStatus e i test che ispezionano i dizionari
   * ragionano sempre in chiavi numeriche; solo cio' che ESCE verso il PKJS cambia forma. */
  if (this.nameKeys) { out = out.map(toNameKeys); }
  return out;
};

FakeWatch.prototype._handle = function (d, msg) {
  var slot, fmt, len, c, off, id, data, p, s, k, i, b, order, seen, ended, blob, n, chunks;
  switch (msg) {
    case MSG.JS_READY:
      return this._hello();

    case MSG.SYNC_REQUEST:
      if (!this.albumEnabled || !this.maxChunk) { return this._status(CODE.NOT_SUPPORTED); }
      this.state = 'SYNCING'; this.pending = null;
      this.countedSlot = SLOT_NONE; this.countedId = 0;
      /* F3: "Foto k/n" riparte da OFFSET = foto gia' concluse (0 se assente: PKJS vecchio), con lo stesso
       * clamp di sync_proto.c prv_sync_request: u8, poi <= count - 1 (0 se count e' 0). */
      n = u8(d[keys.COUNT]) || 0;
      off = u32(d[keys.OFFSET]);
      i = (off === undefined) ? 0 : (off > 255 ? 255 : off);
      if (i >= n) { i = n ? n - 1 : 0; }
      this._progress(i, n);
      s = {}; s[keys.MSG] = MSG.SYNC_READY; s[keys.MAX_CHUNK] = this.maxChunk;
      return s;

    case MSG.PHOTO_BEGIN:
      if (this.state !== 'SYNCING') { return this._status(CODE.BUSY); }
      slot = u8(d[keys.SLOT]); fmt = u8(d[keys.FORMAT]); len = u32(d[keys.LENGTH]); c = u32(d[keys.CRC]);
      off = u32(d[keys.OFFSET]); id = u32(d[keys.PHOTO_ID]);
      if (slot === undefined || fmt === undefined || len === undefined || c === undefined || off === undefined || id === undefined) {
        return this._status(CODE.BAD_FORMAT);
      }
      if (slot >= MAX_SLOTS || fmt !== this.format || len !== FMT_LEN[fmt] || id === 0) { return this._status(CODE.BAD_FORMAT, slot); }
      p = this.pending;
      if (p && p.slot === slot && p.photoId === id && p.crc === c && off === p.next) {
        /* ripresa: CRC parziale conservato, "Foto k/n" fermo */
      } else {
        if (this.slots[slot].state === 1) { this.slots[slot].state = 0; this.slots[slot].crc = 0; }   /* svuotato nel manifest */
        this.pending = p = { slot: slot, fmt: fmt, length: len, crc: c, photoId: id, next: 0, buf: [] };
        if (!(this.countedSlot === slot && this.countedId === id)) {
          this.countedSlot = slot; this.countedId = id;
          this._progress(Math.min(this.index + 1, 255), this.count);
        }
      }
      return this._status(CODE.OK, slot, p.next);

    case MSG.PHOTO_DATA:
      if (this.state !== 'SYNCING') { return this._status(CODE.BUSY); }
      p = this.pending;
      if (!p) { return this._status(CODE.SEQ_ERR, SLOT_NONE, 0); }
      slot = u8(d[keys.SLOT]); off = u32(d[keys.OFFSET]); data = d[keys.DATA];
      if (slot !== p.slot) { return this._status(CODE.SEQ_ERR, p.slot, p.next); }
      if (off === undefined || !data) { return this._status(CODE.SEQ_ERR, p.slot, p.next); }
      n = data.length;
      if (off < p.next) { this.log('[watch] duplicato off=' + off + ' ignorato'); return null; }
      if (off > p.next || off % CHUNK !== 0 || n === 0 || n > this.maxChunk || off + n > p.length ||
          (n % CHUNK !== 0 && off + n !== p.length)) {
        return this._status(CODE.SEQ_ERR, p.slot, p.next);
      }
      for (i = 0; i < n; i++) { p.buf[off + i] = data[i] & 255; }
      p.next = off + n;
      return null;                                   /* nessuna risposta: basta l'ACK */

    case MSG.PHOTO_END:
      if (this.state !== 'SYNCING') { return this._status(CODE.BUSY); }
      slot = u8(d[keys.SLOT]); id = u32(d[keys.PHOTO_ID]);
      p = this.pending;
      if (!p) {
        if (slot !== undefined && slot < MAX_SLOTS && this.slots[slot].state === 1 && this.slots[slot].photoId === id) {
          return this._status(CODE.OK, slot, this.slots[slot].length);   /* ritrasmissione dopo il commit */
        }
        return this._status(CODE.SEQ_ERR, SLOT_NONE, 0);
      }
      if (slot !== p.slot) { return this._status(CODE.SEQ_ERR, p.slot, p.next); }
      if (p.next !== p.length) { return this._status(CODE.SEQ_ERR, p.slot, p.next); }
      if (crc.crc32(p.buf) !== p.crc) { this.pending = null; return this._status(CODE.CRC_ERR, slot, 0); }
      this._commit(slot, p.fmt, p.length, p.crc, p.photoId);
      this.buffers[slot] = p.buf;
      this.pending = null;
      return this._status(CODE.OK, slot, p.length);

    case MSG.SYNC_DONE:
      if (this.state === 'SYNCING') { this.state = 'IDLE'; this.pending = null; this._progress(0, 0); }
      return null;

    case MSG.SETTINGS:
      blob = d[keys.SETTINGS];
      if (!blob || blob.length !== 20 || blob[0] !== 1) { return this._status(CODE.BAD_FORMAT); }
      /* settings_validate() (settings.c): schema, layout <= 1, font < GAL_FONT_COUNT (S8/D22: 6),
       * clock_mode <= 2, leading_zero <= 2, text_color <= 4, outline <= 2, interval nella lista,
       * order <= 1, shake_next <= 1, info_row <= 15, digit_style <= GAL_STYLE_FILL_3D (S8/D21). */
      if (blob[1] > 1 || blob[2] > 5 || blob[3] > 2 || blob[4] > 2 || blob[5] > 4 || blob[6] > 2 ||
          [0, 5, 15, 30, 60, 180, 1440].indexOf(blob[7] | (blob[8] << 8)) < 0 || blob[9] > 1 || blob[10] > 1 ||
          blob[11] > 15 || blob[12] > 3) {
        return this._status(CODE.BAD_FORMAT);
      }
      this.settings = blob.slice(0, 18).map(function (x) { return x & 255; });
      return this._status(CODE.OK);

    case MSG.ALBUM_ORDER:
      order = d[keys.ORDER];
      if (!order || order.length !== MAX_SLOTS) { return this._status(CODE.BAD_FORMAT); }
      seen = {}; ended = false;
      for (i = 0; i < MAX_SLOTS; i++) {
        b = order[i];
        if (b === SLOT_NONE) { ended = true; continue; }
        if (ended || b >= MAX_SLOTS || seen[b]) { return this._status(CODE.BAD_FORMAT); }
        seen[b] = true;
      }
      this.order = order.filter(function (x) { return x !== SLOT_NONE; });
      return this._status(CODE.OK);

    case MSG.ALBUM_DELETE:
      slot = u8(d[keys.SLOT]);
      if (slot === undefined || slot >= MAX_SLOTS) { return this._status(CODE.BAD_FORMAT); }
      this.slots[slot].state = 0; this.slots[slot].crc = 0; this.buffers[slot] = null;
      if (this.pending && this.pending.slot === slot) { this.pending = null; }
      return this._status(CODE.OK, slot);

    default:
      return this._status(CODE.NOT_SUPPORTED);
  }
};

FakeWatch.MSG = MSG;
FakeWatch.CODE = CODE;
FakeWatch.NAMEKEYS_DEFAULT = NAMEKEYS_DEFAULT;
FakeWatch.toNameKeys = toNameKeys;
/* Legge un campo di un payload consegnato al PKJS in una forma qualunque (numerica o per nome):
 * l'equivalente di gv() in src/pkjs/sync.js, per i test che ispezionano il ritorno di handle(). */
FakeWatch.get = function (d, name) {
  var v = d[keys[name]];
  return (v === undefined) ? d[name] : v;
};
module.exports = FakeWatch;

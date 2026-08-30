/* fake_pebble.js — oggetto `Pebble` finto per i test node del PKJS: consegna ogni
 * sendAppMessage a un FakeWatch (fakewatch.js) in modo asincrono (setTimeout 0, come l'app
 * Pebble), chiama il callback di successo (ACK) e poi recapita le risposte dell'orologio ai
 * listener 'appmessage'. Guasti: nackNext (NACK sul prossimo invio), delayMs, dropInbound.
 *
 *   var pebble = new FakePebble(watch, { platform: 'pypkjs' }); global.Pebble = pebble;
 *   pebble.fire('ready'); pebble.fire('webviewclosed', { response: '...' });
 *   pebble.setTimers({ ... })  // opzionale
 */
function FakePebble(watch, opts) {
  opts = opts || {};
  this.watch = watch;
  this.platform = opts.platform || 'pypkjs';
  this.listeners = {};
  this.nackNext = 0;          /* > 0: i prossimi N sendAppMessage falliscono (NACK) */
  this.delayMs = 0;           /* ritardo dell'ACK e delle risposte */
  this.replyDelayMs = 0;      /* ritardo delle sole risposte dell'orologio (STATUS tardivi) */
  this.dropInbound = 0;       /* > 0: le prossime N risposte dell'orologio non arrivano al PKJS */
  this.outbox = [];           /* tutti i dizionari spediti dal PKJS (copie) */
  this.opened = [];           /* URL passati a openURL */
  this.log = opts.log || function () {};
  this.watchInfo = opts.watchInfo || { platform: (watch && watch.format === 2) ? 'flint' : 'emery', model: 'qemu', language: 'it_IT',
                                       firmware: { major: 4, minor: 33, patch: 2, suffix: '' } };
}

FakePebble.prototype.addEventListener = function (ev, fn) {
  (this.listeners[ev] = this.listeners[ev] || []).push(fn);
};

FakePebble.prototype.removeEventListener = function (ev, fn) {
  var l = this.listeners[ev] || [];
  var i = l.indexOf(fn);
  if (i >= 0) { l.splice(i, 1); }
};

FakePebble.prototype.fire = function (ev, e) {
  (this.listeners[ev] || []).slice().forEach(function (fn) { fn(e || {}); });
};

function cloneDict(d) {
  var out = {}, k;
  for (k in d) {
    if (Object.prototype.hasOwnProperty.call(d, k)) {
      out[k] = (d[k] && typeof d[k].slice === 'function' && typeof d[k] !== 'string') ? d[k].slice() : d[k];
    }
  }
  return out;
}

FakePebble.prototype.sendAppMessage = function (dict, ok, fail) {
  var self = this, copy = cloneDict(dict);
  this.outbox.push(copy);
  setTimeout(function () {
    var replies;
    if (self.nackNext > 0) {
      self.nackNext--;
      self.log('[pebble] NACK');
      if (fail) { fail({ data: { transactionId: 0 }, error: { message: 'nack (test)' } }); }
      return;
    }
    replies = self.watch.handle(copy);
    if (ok) { ok({ data: { transactionId: 0 } }); }
    replies.forEach(function (r) {
      if (self.dropInbound > 0) { self.dropInbound--; self.log('[pebble] risposta MSG ' + r[10000] + ' persa'); return; }
      setTimeout(function () { self.fire('appmessage', { payload: r }); }, self.replyDelayMs);
    });
  }, this.delayMs);
};

FakePebble.prototype.openURL = function (url) { this.opened.push(url); };
FakePebble.prototype.getActiveWatchInfo = function () { return this.watchInfo; };
FakePebble.prototype.showSimpleNotificationOnPebble = function () {};

module.exports = FakePebble;

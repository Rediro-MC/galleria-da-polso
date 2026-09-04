/* sync.js — motore di sync PKJS ↔ orologio (docs/design/galleria.md §5, lato telefono).
 * ES5 puro (gira nel WebView Android e nel JavaScriptCore "nudo" di iOS). Indipendente
 * dall'album: riceve un "provider" che, dato l'HELLO dell'orologio, dice cosa mandare.
 *
 *   var sync = require('./sync');
 *   sync.start({ provider: {...}, log: console.log, hooks: {...} });
 *   sync.resync();      // dopo una modifica dell'album: nuovo JS_READY → HELLO → piano (S5b)
 *
 * provider.plan(hello) → { photos: [{slot, photoId, format, length, crc, bytes | load(cb)}],
 *                          settings: bytes20|null, order: bytes12|null, deletes: [slot, ...] }
 *                        (bytes = Array di 0..255; load(cb(err, bytes)) = caricamento pigro, S5b:
 *                        il motore decodifica UNA foto per volta e libera i byte dopo l'esito)
 * provider.onPhotoResult(photo, ok, code)   (opzionale)
 * provider.onDone(summary)                  (opzionale) summary = { photosOk, photosFailed, settings, order,
 *                        deletes ['slot:CODE'], photoCodes ['slot:CODE' per ogni foto fallita], error? }
 * provider.onReadyFailed(why)               (opzionale: JS_READY non consegnato, o nessun HELLO dopo i rinvii)
 * hooks (solo test): beforeData(photo, offset, n) → 'skip' | 'dup' | 'stop' | undefined
 * hello = { proto, format, maxChunk, settingsCrc (null se l'orologio non lo manda), openMs (v1.9,
 *            perf 04/09: ms dell'apertura del file persist sull'orologio; null se non lo manda), slots[12] }
 *
 * Regole (D9): JS_READY → HELLO atteso entro 10 s dall'ACK (l'HELLO nasce solo dal JS_READY e l'outbox
 * dell'orologio non ritenta): 2 rinvii di JS_READY, poi provider.onReadyFailed (retry lungo di index.js);
 * un solo PHOTO_DATA in volo, il successivo dal callback di successo di
 * Pebble.sendAppMessage (mai da timer) — dopo una ripartenza (SEQ_ERR/BUSY) il messaggio di ripresa
 * può partire mentre l'ultimo chunk della generazione precedente è ancora in volo, e il suo ACK
 * viene ignorato; backoff 1-2-4-8-8-8-8 s sui fallimenti di invio; ogni PHOTO_BEGIN/PHOTO_END/
 * SETTINGS/ALBUM_* attende uno STATUS pertinente (timeout 10 s → rinvio, 2 volte, poi la sync si chiude);
 * SEQ_ERR → PHOTO_BEGIN{OFFSET = status.offset} e si riprende da lì; CRC_ERR → una ripetizione
 * da 0; BUSY → nuova SYNC_REQUEST{COUNT, OFFSET = foto già concluse} (l'orologio riprende "Foto k/n" da
 * lì); gli altri codici scartano la foto; invio fallito dopo il backoff
 * (telefono scollegato) → sync chiusa con errore (index.js la ritenta più tardi); watchdog 60 s senza
 * ACK né messaggi dall'orologio → sync chiusa con errore. Poiché lo STATUS di un chunk
 * fuori sequenza arriva DOPO l'ACK di quel chunk (e quindi dopo l'invio del successivo), ogni
 * gestore di STATUS ignora le risposte non pertinenti (ritorna false) e il flusso dati ha una
 * "generazione" che invalida gli ACK dei chunk spediti prima di una ripartenza. Gli interi (CRC, PHOTO_ID)
 * vanno inviati come int32 con segno (x | 0): il JS li serializza a 4 byte, l'orologio li rilegge
 * come uint32. */
var keys = require('message_keys');

/* S8 (bug trovato sull'orologio reale, 30/08/2026): pypkjs consegna il payload IN INGRESSO con le
 * chiavi NUMERICHE ("10000"…), l'app Core Devices (PKJSApp.toJSData) le rimappa nei NOMI ("MSG"…).
 * gv() legge entrambe le forme; in uscita restano le chiavi numeriche (accettate da entrambi). */
function gv(p, name) {
  var v = p[keys[name]];
  return (v === undefined) ? p[name] : v;
}

var MSG = {
  JS_READY: 1, HELLO: 2, SYNC_REQUEST: 3, SYNC_READY: 4, PHOTO_BEGIN: 5, PHOTO_DATA: 6,
  PHOTO_END: 7, STATUS: 8, SYNC_DONE: 9, SETTINGS: 10, ALBUM_ORDER: 11, ALBUM_DELETE: 12
};
var CODE = {
  OK: 0, CRC_ERR: 1, NO_SPACE: 2, BAD_FORMAT: 3, BUSY: 4, SEQ_ERR: 5, NOT_SUPPORTED: 6, STORAGE_ERR: 7
};
var CODE_NAME = ['OK', 'CRC_ERR', 'NO_SPACE', 'BAD_FORMAT', 'BUSY', 'SEQ_ERR', 'NOT_SUPPORTED', 'STORAGE_ERR'];
var PROTO = 1;
var SLOT_NONE = 0xFF;
var BACKOFF_MS = [1000, 2000, 4000, 8000, 8000, 8000, 8000];
var STATUS_TIMEOUT_MS = 10000;
var STATUS_RESENDS = 2;
var BUSY_RETRIES = 5;
var WATCHDOG_MS = 60000;      // nessun evento per 60 s con una sync in corso → chiusura forzata (mai bloccati per sempre)
var HELLO_TIMEOUT_MS = 10000; // JS_READY consegnato (ACK) ma HELLO mai arrivato (outbox dell'orologio fallita: non ritenta) → rinvio
var HELLO_RESENDS = 2;        // rinvii del JS_READY, poi provider.onReadyFailed (retry lungo di index.js)

var s = {
  runId: 0,             // cresce a ogni fine sync: i backoff di send() avviati in una sync chiusa non proseguono (revisione S5b)
  started: false,
  log: function () {},
  provider: null,
  hooks: {},
  maxChunk: 0,
  plan: null,
  photos: [],
  photoIndex: 0,
  cur: null,            // { photo, offset, gen, crcRetries, busyRetries, t0, tChunk, msgs }
                        // gen: generazione del flusso dati; cambia a ogni ripartenza (SEQ_ERR/BUSY/CRC) e
                        // fa ignorare l'ACK di un chunk spedito prima della ripartenza (mai due messaggi in volo)
  busyRetries: 0,
  readyHandler: null,   // callback in attesa di SYNC_READY
  photosDone: null,
  statusHandler: null,  // callback in attesa di uno STATUS
  statusTimer: null,
  lastStatusMsg: null,  // messaggio da rinviare se lo STATUS non arriva
  summary: null,
  running: false,
  watchdog: null,
  helloTimer: null,     // attesa dell'HELLO dopo l'ACK di un JS_READY (fuori da cancelWait: non è un'attesa di STATUS)
  helloPending: false,  // JS_READY spedito e HELLO non ancora ricevuto
  helloResends: 0,
  rerun: false          // resync() chiesta durante una sync: nuovo JS_READY a fine sync
};

/* Rete di sicurezza: se per WATCHDOG_MS non arriva né un ACK né un messaggio dall'orologio la sync
 * viene chiusa con errore, così un HELLO successivo può ripartire (revisione S5a). */
function touchWatchdog() {
  if (s.watchdog) { clearTimeout(s.watchdog); s.watchdog = null; }
  if (!s.running) { return; }
  s.watchdog = setTimeout(function () {
    s.watchdog = null;
    if (!s.running) { return; }
    s.log('[sync] nessun evento per ' + WATCHDOG_MS + ' ms: sync abbandonata');
    cancelWait();
    s.readyHandler = null;
    if (s.cur) { s.summary.photosFailed += (s.photos.length - s.photoIndex); s.cur = null; }
    s.summary.error = 'watchdog';
    finish();
  }, WATCHDOG_MS);
}

function codeName(c) { return CODE_NAME[c] || ('code' + c); }
function now() { return new Date().getTime(); }

/* ---- invio con backoff ---- */

function send(dict, onOk, onFail, attempt, run) {
  attempt = attempt || 0;
  if (run === undefined) { run = s.running ? s.runId : -1; }   // -1: fuori da una sync (JS_READY), mai annullato
  Pebble.sendAppMessage(dict, function () {
    if (run >= 0 && run !== s.runId) { return; }               // la sync è stata chiusa nel frattempo
    touchWatchdog();
    if (onOk) { onOk(); }
  }, function (e) {
    var err = (e && e.error) ? JSON.stringify(e.error) : (e ? JSON.stringify(e) : '?');
    if (run >= 0 && run !== s.runId) { return; }
    if (attempt < BACKOFF_MS.length) {
      s.log('[sync] invio fallito (' + err + '): riprovo fra ' + BACKOFF_MS[attempt] + ' ms (' + (attempt + 1) + '/' + BACKOFF_MS.length + ')');
      setTimeout(function () {
        if (run >= 0 && run !== s.runId) { return; }           // backoff sopravvissuto a un watchdog/abort: muore qui
        send(dict, onOk, onFail, attempt + 1, run);
      }, BACKOFF_MS[attempt]);
    } else {
      s.log('[sync] invio fallito definitivamente (' + err + ')');
      if (onFail) { onFail(); }
    }
  });
}

/* Invio + attesa di uno STATUS (PHOTO_BEGIN, PHOTO_END, SETTINGS, ALBUM_*). */
function sendForStatus(dict, handler, onFail) {
  s.statusHandler = handler;
  s.lastStatusMsg = { dict: dict, handler: handler, onFail: onFail, resends: 0 };
  send(dict, function () { armStatusTimer(); }, function () {
    cancelWait();
    if (onFail) { onFail(); }
  });
}

function armStatusTimer() {
  clearStatusTimer();
  s.statusTimer = setTimeout(function () {
    s.statusTimer = null;
    var m = s.lastStatusMsg;
    if (!m) { return; }
    if (m.resends < STATUS_RESENDS) {
      m.resends++;
      s.log('[sync] nessuno STATUS entro ' + STATUS_TIMEOUT_MS + ' ms: rinvio (' + m.resends + '/' + STATUS_RESENDS + ')');
      /* Rinvio fallito dopo il backoff: l'attesa va chiusa QUI (l'onFail di sendForStatus non è coinvolto),
       * altrimenti gestore e messaggio sopravvivrebbero alla fine della sync (revisione: F7). */
      send(m.dict, function () { armStatusTimer(); }, function () { cancelWait(); if (m.onFail) { m.onFail(); } });
    } else {
      s.log('[sync] nessuno STATUS dopo ' + STATUS_RESENDS + ' rinvii: abbandono');
      cancelWait();
      if (m.onFail) { m.onFail(); }
    }
  }, STATUS_TIMEOUT_MS);
}

function clearStatusTimer() {
  if (s.statusTimer) { clearTimeout(s.statusTimer); s.statusTimer = null; }
}

/* Chiude l'attesa di uno STATUS (timer, gestore, messaggio da rinviare). Invariante: fuori da una
 * sync (running false) sono tutti nulli — finish() la chiama sempre, così uno STATUS tardivo dopo la
 * fine non può riaprire un'attesa né richiamare un gestore stantio (revisione: F7). */
function cancelWait() {
  clearStatusTimer();
  s.statusHandler = null;
  s.lastStatusMsg = null;
}

/* ---- decodifica dei messaggi dell'orologio ---- */

function u32le(a, i) {
  /* & 0xFF: un runtime che consegna i byte con segno (-128..127) non deve falsare il CRC */
  return (((a[i] & 0xFF) | ((a[i + 1] & 0xFF) << 8) | ((a[i + 2] & 0xFF) << 16) | ((a[i + 3] & 0xFF) << 24)) >>> 0);
}

function parseSlots(arr) {
  var slots = [];
  var n = arr ? Math.floor(arr.length / 5) : 0;
  for (var k = 0; k < n; k++) {
    slots.push({ state: arr[k * 5] & 0xFF, crc: u32le(arr, k * 5 + 1) });
  }
  return slots;
}

function parseHello(p) {
  var c = gv(p, 'CRC'), om = gv(p, 'OPEN_MS');
  return {
    proto: gv(p, 'PROTO') | 0,
    format: gv(p, 'FORMAT') | 0,           // PHOTO_FMT_* nativo dell'orologio (1 raw6, 2 raw1)
    maxChunk: gv(p, 'MAX_CHUNK') | 0,
    settingsCrc: (c === undefined || c === null) ? null : (c & 0xFFFF),   // S5b: CRC-16 delle impostazioni
    /* v1.9 (perf 04/09): ms impiegati dal firmware ad aprire il file persist. Un orologio vecchio non
     * manda il campo -> null (la config page non mostra nessun avviso), 0 = non misurato. */
    openMs: (om === undefined || om === null) ? null : (om & 0xFFFF),
    slots: parseSlots(gv(p, 'SLOTS'))
  };
}

/* ---- piano: impostazioni / ordine / eliminazioni, poi foto ---- */

function runPlan() {
  var plan = s.plan;
  s.summary = { photosOk: 0, photosFailed: 0, settings: null, order: null, deletes: [], photoCodes: [] };
  var steps = [];
  /* Gli STATUS di SETTINGS/ALBUM_ORDER hanno SLOT 0xFF, quello di ALBUM_DELETE lo slot: uno STATUS con un
   * altro SLOT è la risposta tardiva a un altro messaggio e non va consumato (revisione S5b). Un invio
   * fallito dopo il backoff chiude la sync come per le foto (il telefono è scollegato). */
  if (plan.settings) {
    steps.push(function (next) {
      var d = {}; d[keys.MSG] = MSG.SETTINGS; d[keys.SETTINGS] = plan.settings;
      s.log('[sync] SETTINGS (' + plan.settings.length + ' B)');
      sendForStatus(d, function (st) {
        if (st.slot !== SLOT_NONE) { return false; }
        s.summary.settings = codeName(st.code); s.log('[sync] SETTINGS -> ' + codeName(st.code)); next();
        return true;
      }, function () { s.summary.settings = 'send failed'; abortSync('send failed'); });
    });
  }
  if (plan.order) {
    steps.push(function (next) {
      var d = {}; d[keys.MSG] = MSG.ALBUM_ORDER; d[keys.ORDER] = plan.order;
      s.log('[sync] ALBUM_ORDER [' + plan.order.join(',') + ']');
      sendForStatus(d, function (st) {
        if (st.slot !== SLOT_NONE) { return false; }
        s.summary.order = codeName(st.code); s.log('[sync] ALBUM_ORDER -> ' + codeName(st.code)); next();
        return true;
      }, function () { s.summary.order = 'send failed'; abortSync('send failed'); });
    });
  }
  (plan.deletes || []).forEach(function (slot) {
    steps.push(function (next) {
      var d = {}; d[keys.MSG] = MSG.ALBUM_DELETE; d[keys.SLOT] = slot;
      s.log('[sync] ALBUM_DELETE slot ' + slot);
      sendForStatus(d, function (st) {
        if (st.slot !== slot) { return false; }   /* l'orologio rimette sempre lo slot ricevuto, anche in BAD_FORMAT */
        s.summary.deletes.push(slot + ':' + codeName(st.code)); s.log('[sync] ALBUM_DELETE -> ' + codeName(st.code)); next();
        return true;
      }, function () { s.summary.deletes.push(slot + ':send failed'); abortSync('send failed'); });
    });
  });
  s.photos = plan.photos || [];
  if (s.photos.length) {
    if (!s.maxChunk) {
      s.log('[sync] l\'orologio non supporta il trasferimento (MAX_CHUNK 0): ' + s.photos.length + ' foto non inviate');
      s.summary.photosFailed = s.photos.length;
      s.summary.error = 'NOT_SUPPORTED';
      s.photos.forEach(function (p) {
        s.summary.photoCodes.push(p.slot + ':NOT_SUPPORTED');
        if (s.provider.onPhotoResult) { s.provider.onPhotoResult(p, false, 'NOT_SUPPORTED'); }
      });
      s.photos = [];
    } else {
      steps.push(function (next) { syncPhotos(next); });
    }
  }
  var i = 0;
  function step() {
    if (i >= steps.length) { finish(); return; }
    var f = steps[i++];
    f(step);
  }
  s.running = true;
  touchWatchdog();
  step();
}

function finish() {
  var summary = s.summary;
  s.running = false;
  s.runId++;
  if (s.watchdog) { clearTimeout(s.watchdog); s.watchdog = null; }
  cancelWait();
  s.cur = null;
  s.photos = [];
  s.plan = null;
  s.photoIndex = 0;
  s.photosDone = null;
  s.readyHandler = null;
  s.busyRetries = 0;
  s.log('[sync] fine: ' + JSON.stringify(summary));
  if (s.provider && s.provider.onDone) {
    try { s.provider.onDone(summary); } catch (e) { s.log('[sync] onDone: ' + e); }
  }
  if (s.rerun) {
    s.rerun = false;
    s.log('[sync] resync rinviata: nuovo JS_READY');
    sendReady();
  }
}

function clearHelloTimer() {
  if (s.helloTimer) { clearTimeout(s.helloTimer); s.helloTimer = null; }
}

/* JS_READY non consegnato (backoff esaurito) o nessun HELLO dopo i rinvii: orologio irraggiungibile,
 * index.js programma un nuovo tentativo con il retry lungo (revisione S5b, F5). */
function readyFailed(why) {
  clearHelloTimer();
  s.helloPending = false;
  s.log('[sync] ' + why);
  if (s.provider && s.provider.onReadyFailed) {
    try { s.provider.onReadyFailed(why); } catch (e) { s.log('[sync] onReadyFailed: ' + e); }
  }
}

/* JS_READY → HELLO. L'HELLO nasce solo dal JS_READY e l'outbox dell'orologio non ritenta: se dopo l'ACK
 * non arriva entro HELLO_TIMEOUT_MS il JS_READY viene rinviato (HELLO_RESENDS volte), poi readyFailed
 * (revisione: F5). Il timer si arma nel callback di successo SOLO se helloPending è ancora vero: sul
 * telefono l'HELLO può arrivare PRIMA dell'ACK del JS_READY (o un piano vuoto può finire prima) e in
 * quel caso non deve partire nessun rinvio. run = -1 in send(): mai annullato dalla fine di una sync. */
function sendReady(resend) {
  var d = {}; d[keys.MSG] = MSG.JS_READY;
  if (!resend) { s.helloResends = 0; }
  clearHelloTimer();
  s.helloPending = true;
  s.log('[sync] JS_READY' + (resend ? ' (rinvio ' + s.helloResends + '/' + HELLO_RESENDS + ')' : ''));
  send(d, function () {
    if (!s.helloPending) { return; }            /* HELLO già arrivato (prima dell'ACK): niente timer */
    clearHelloTimer();
    s.helloTimer = setTimeout(function () {
      s.helloTimer = null;
      if (!s.helloPending) { return; }
      if (s.helloResends < HELLO_RESENDS) {
        s.helloResends++;
        s.log('[sync] nessun HELLO entro ' + HELLO_TIMEOUT_MS + ' ms: rinvio JS_READY (' + s.helloResends + '/' + HELLO_RESENDS + ')');
        sendReady(true);
      } else {
        readyFailed('nessun HELLO dopo ' + HELLO_RESENDS + ' rinvii di JS_READY');
      }
    }, HELLO_TIMEOUT_MS);
  }, function () {
    readyFailed('JS_READY non consegnato');
  });
}

/* ---- foto ---- */

/* SYNC_REQUEST → SYNC_READY (o STATUS NOT_SUPPORTED/BUSY). Riusata anche per riprendere una
 * foto dopo che l'orologio è tornato IDLE (30 s di silenzio → PHOTO_BEGIN riceve BUSY): OFFSET = foto
 * già concluse (photoIndex, 0 alla prima richiesta), così l'orologio riprende "Foto k/n" da k invece
 * di ripartire da 1 (F3); un rinvio da armStatusTimer ripete lo stesso dizionario. */
function requestSync(onReady, onFail) {
  var d = {}; d[keys.MSG] = MSG.SYNC_REQUEST; d[keys.COUNT] = s.photos.length; d[keys.OFFSET] = s.photoIndex | 0;
  s.log('[sync] SYNC_REQUEST count=' + s.photos.length + ' from=' + s.photoIndex);
  s.readyHandler = function (maxChunk) {
    s.readyHandler = null;
    s.statusHandler = null;
    if (maxChunk > 0) { s.maxChunk = maxChunk; }
    s.log('[sync] SYNC_READY chunk=' + s.maxChunk);
    onReady();
  };
  sendForStatus(d, function (st) {
    /* SYNC_REQUEST riceve solo SYNC_READY o STATUS{NOT_SUPPORTED}: OK/SEQ_ERR/CRC_ERR/BUSY sono risposte
     * tardive a BEGIN/DATA/END precedenti → continuo ad aspettare il SYNC_READY. */
    if (st.code !== CODE.NOT_SUPPORTED && st.code !== CODE.BAD_FORMAT && st.code !== CODE.STORAGE_ERR) {
      return false;
    }
    s.readyHandler = null;
    s.log('[sync] SYNC_REQUEST rifiutata: ' + codeName(st.code));
    onFail(codeName(st.code));
    return true;
  }, function () { s.readyHandler = null; onFail('send failed'); });
}

function syncPhotos(done) {
  s.photosDone = done;
  requestSync(function () {
    s.photoIndex = 0;
    nextPhoto();
  }, function (why) {
    s.summary.photosFailed += s.photos.length;
    s.summary.error = why;
    done();
  });
}

function nextPhoto() {
  if (s.photoIndex >= s.photos.length) {
    var d = {}; d[keys.MSG] = MSG.SYNC_DONE;
    s.log('[sync] SYNC_DONE');
    var done = s.photosDone;
    s.photosDone = null;
    send(d, done, done);
    return;
  }
  var photo = s.photos[s.photoIndex];
  s.cur = { photo: photo, offset: 0, gen: 0, crcRetries: 0, busyRetries: 0, t0: now(), tChunk: 0, msgs: 0 };
  s.log('[sync] foto ' + (s.photoIndex + 1) + '/' + s.photos.length + ': slot ' + photo.slot + ' id 0x' + (photo.photoId >>> 0).toString(16) +
        ' fmt ' + photo.format + ' len ' + photo.length + ' crc 0x' + (photo.crc >>> 0).toString(16));
  if (!photo.bytes && typeof photo.load === 'function') {
    /* Caricamento pigro (S5b): decodifica (o scarico dal dev server) di UNA foto per volta. */
    var cur = s.cur, t = now(), called = false;
    var onLoaded = function (err, bytes) {
      if (called) { return; }
      called = true;
      if (s.cur !== cur || !s.running) { return; }      /* sync chiusa nel frattempo (watchdog) */
      touchWatchdog();
      if (err || !bytes || bytes.length !== photo.length) {
        photoFailed('load: ' + (err || ('lunghezza ' + (bytes ? bytes.length : 0))));
        return;
      }
      photo.bytes = bytes;
      s.log('[sync] foto slot ' + photo.slot + ' caricata: ' + bytes.length + ' B in ' + (now() - t) + ' ms');
      sendBegin();
    };
    try { photo.load(onLoaded); } catch (e) { onLoaded('' + e); }
    return;
  }
  if (!photo.bytes || photo.bytes.length !== photo.length) {
    photoFailed('bytes mancanti');
    return;
  }
  sendBegin();
}

function releasePhoto(photo) {
  if (photo && typeof photo.load === 'function') { photo.bytes = null; }   /* ricaricabile: libero la memoria */
}

/* L'invio non riesce più (telefono scollegato, backoff esaurito): inutile provare le foto rimaste
 * una per una (39 s di backoff ciascuna) — la sync si chiude con errore e index.js la ritenterà. */
function abortSync(why) {
  if (!s.running) { return; }
  s.log('[sync] sync abbandonata: ' + why);
  cancelWait();
  s.readyHandler = null;
  if (s.cur) {
    if (s.provider.onPhotoResult) { s.provider.onPhotoResult(s.cur.photo, false, why); }
    releasePhoto(s.cur.photo);
  }
  s.summary.photosFailed += Math.max(0, s.photos.length - s.photoIndex);
  s.summary.error = why;
  s.cur = null;
  s.photosDone = null;
  finish();
}

/* Ripresa dopo BUSY (nuova SYNC_REQUEST): un invio fallito dopo il backoff, o nessun SYNC_READY dopo
 * i rinvii, è un guasto di COLLEGAMENTO come ogni altro (revisione: la sync si chiude con errore e
 * index.js la ritenta), non una foto da scartare: 'send failed' non deve finire in photoCodes. */
function resumeFailed(why) {
  if (why === 'send failed') { abortSync(why); } else { photoFailed(why); }
}

function photoFailed(code) {
  var c = s.cur;
  if (!c) { return; }                    /* sync già chiusa (watchdog) mentre un backoff era in corso (test S5b) */
  s.log('[sync] foto slot ' + c.photo.slot + ' FALLITA (' + code + ') dopo ' + (now() - c.t0) + ' ms');
  s.summary.photosFailed++;
  s.summary.photoCodes.push(c.photo.slot + ':' + code);   /* F9: index.js classifica i codici per il retry */
  if (s.provider.onPhotoResult) { s.provider.onPhotoResult(c.photo, false, code); }
  releasePhoto(c.photo);
  s.cur = null;
  s.photoIndex++;
  nextPhoto();
}

function photoDone() {
  var c = s.cur;
  if (!c) { return; }
  s.log('[sync] foto slot ' + c.photo.slot + ' OK: ' + c.photo.length + ' B in ' + c.msgs + ' messaggi, ' + (now() - c.t0) + ' ms');
  s.summary.photosOk++;
  if (s.provider.onPhotoResult) { s.provider.onPhotoResult(c.photo, true, 'OK'); }
  releasePhoto(c.photo);
  s.cur = null;
  s.photoIndex++;
  nextPhoto();
}

function sendBegin() {
  var c = s.cur, p = c.photo;
  var d = {};
  d[keys.MSG] = MSG.PHOTO_BEGIN;
  d[keys.SLOT] = p.slot;
  d[keys.PHOTO_ID] = p.photoId | 0;
  d[keys.FORMAT] = p.format;
  d[keys.LENGTH] = p.length | 0;
  d[keys.CRC] = p.crc | 0;
  d[keys.OFFSET] = c.offset | 0;
  s.log('[sync] PHOTO_BEGIN slot ' + p.slot + ' offset ' + c.offset);
  sendForStatus(d, function (st) {
    switch (st.code) {
      case CODE.OK:
        c.offset = st.offset;
        c.gen++;                          // nuovo flusso: gli ACK dei chunk precedenti non contano più
        c.tChunk = now();
        sendData();
        break;
      case CODE.BUSY:
        /* L'orologio è tornato IDLE (30 s di silenzio): nuova SYNC_REQUEST, poi si riprende da c.offset. */
        if (c.busyRetries++ < BUSY_RETRIES) {
          s.log('[sync] PHOTO_BEGIN: orologio BUSY (IDLE?): rinnovo la SYNC_REQUEST');
          requestSync(sendBegin, resumeFailed);
        } else {
          photoFailed('BUSY');
        }
        break;
      case CODE.SEQ_ERR:
      case CODE.CRC_ERR:
        /* PHOTO_BEGIN non riceve mai SEQ_ERR/CRC_ERR: è la risposta a un DATA/END spedito PRIMA della
         * ripartenza (l'orologio risponde a ogni chunk fuori sequenza). Ignorata: aspetto l'OK. */
        return false;
      default:
        photoFailed(codeName(st.code));
    }
    return true;
  }, function () { if (s.cur === c) { abortSync('send failed'); } });
}

function sendData() {
  var c = s.cur, p = c.photo;
  if (c.offset >= p.length) { sendEnd(); return; }
  var n = Math.min(s.maxChunk, p.length - c.offset);
  var hook = s.hooks.beforeData ? s.hooks.beforeData(p, c.offset, n) : undefined;
  if (hook === 'stop') {
    s.log('[sync] hook stop: trasferimento interrotto a offset ' + c.offset + ' (silenzio)');
    return;
  }
  if (hook === 'skip') {
    s.log('[sync] hook skip: salto il chunk a offset ' + c.offset);
    c.offset += n;
    sendData();
    return;
  }
  var d = {};
  d[keys.MSG] = MSG.PHOTO_DATA;
  d[keys.SLOT] = p.slot;
  d[keys.OFFSET] = c.offset | 0;
  d[keys.DATA] = p.bytes.slice(c.offset, c.offset + n);
  var off = c.offset;
  var gen = c.gen;
  var t = now();
  // Uno STATUS (SEQ_ERR / NO_SPACE / BUSY) può arrivare durante i dati: lo gestisce onDataStatus.
  s.statusHandler = function (st) { return onDataStatus(st); };
  s.lastStatusMsg = null;
  send(d, function () {
    if (s.cur !== c || c.gen !== gen) { return; }   // il flusso è ripartito (SEQ_ERR/BUSY): questo ACK non conta
    c.msgs++;
    s.log('[sync] chunk off=' + off + ' n=' + n + ' ack ' + (now() - t) + ' ms');
    if (hook === 'dup') {
      s.log('[sync] hook dup: rinvio lo stesso chunk');
      send(d, function () { if (s.cur === c && c.gen === gen) { c.offset = off + n; sendData(); } },
           function () { if (s.cur === c) { abortSync('send failed'); } });
      return;
    }
    c.offset = off + n;
    sendData();
  }, function () { if (s.cur === c && c.gen === gen) { abortSync('send failed'); } });
}

function onDataStatus(st) {
  var c = s.cur;
  if (!c) { return true; }
  switch (st.code) {
    case CODE.SEQ_ERR:
      /* L'orologio ha visto un salto: fermo il flusso (gen++: l'ACK del chunk in volo verrà ignorato)
       * e riparto con PHOTO_BEGIN{OFFSET}. Altri SEQ_ERR tardivi verranno ignorati da sendBegin. */
      s.log('[sync] SEQ_ERR durante i dati: riprendo da ' + st.offset);
      c.gen++;
      c.offset = st.offset;
      sendBegin();
      break;
    case CODE.BUSY:
      c.gen++;
      if (c.busyRetries++ < BUSY_RETRIES) {
        s.log('[sync] BUSY durante i dati: rinnovo la SYNC_REQUEST e riprendo da ' + c.offset);
        requestSync(sendBegin, resumeFailed);
      } else {
        photoFailed('BUSY');
      }
      break;
    case CODE.OK:
    case CODE.CRC_ERR:
      break;                              // tardivo (BEGIN/END precedenti): ignorato
    default:
      c.gen++;
      photoFailed(codeName(st.code));
  }
  return true;
}

function sendEnd() {
  var c = s.cur, p = c.photo;
  var d = {}; d[keys.MSG] = MSG.PHOTO_END; d[keys.SLOT] = p.slot; d[keys.PHOTO_ID] = p.photoId | 0;
  s.log('[sync] PHOTO_END slot ' + p.slot);
  sendForStatus(d, function (st) {
    switch (st.code) {
      case CODE.OK:
        if (st.offset !== p.length) {
          return false;                   // OK di un PHOTO_BEGIN tardivo (OFFSET < LENGTH): aspetto quello dell'END
        }
        photoDone();
        break;
      case CODE.CRC_ERR:
        if (c.crcRetries++ < 1) {
          s.log('[sync] CRC_ERR: ripeto la foto da 0');
          c.gen++;
          c.offset = 0;
          sendBegin();
        } else {
          photoFailed('CRC_ERR');
        }
        break;
      case CODE.SEQ_ERR:
        c.gen++;
        c.offset = st.offset;
        sendBegin();
        break;
      case CODE.BUSY:
        c.gen++;
        if (c.busyRetries++ < BUSY_RETRIES) {
          requestSync(sendBegin, resumeFailed);
        } else {
          photoFailed('BUSY');
        }
        break;
      default:
        photoFailed(codeName(st.code));
    }
    return true;
  }, function () { if (s.cur === c) { abortSync('send failed'); } });
}

/* ---- eventi ---- */

function onMessage(e) {
  var p = e.payload || {};
  var msg = gv(p, 'MSG') | 0;
  touchWatchdog();
  switch (msg) {
    case MSG.HELLO: {
      clearHelloTimer();                /* F5: l'HELLO è arrivato, con qualunque PROTO: nessun rinvio */
      s.helloPending = false;
      var hello = parseHello(p);
      s.log('[sync] HELLO proto=' + hello.proto + ' maxChunk=' + hello.maxChunk +
            ' open=' + (hello.openMs === null ? '-' : hello.openMs + 'ms') + ' slots=' +
            hello.slots.map(function (x) { return x.state ? x.crc.toString(16) : '-'; }).join(','));
      if (hello.proto !== PROTO) {
        s.log('[sync] protocollo ' + hello.proto + ' non supportato (atteso ' + PROTO + ')');
        return;
      }
      s.maxChunk = hello.maxChunk;
      if (s.running) { s.log('[sync] HELLO durante una sync: ignorato'); return; }
      try {
        s.plan = s.provider.plan(hello) || {};
      } catch (e) {
        s.log('[sync] provider.plan ha lanciato: ' + e + ' — nessuna sync');
        return;
      }
      runPlan();
      break;
    }
    case MSG.SYNC_READY:
      /* Un SYNC_READY ripetuto (SYNC_REQUEST rinviata) NON deve toccare l'attesa di STATUS di un altro
       * messaggio (revisione S5a): pulizia solo se lo consumiamo davvero. */
      if (!s.readyHandler) { s.log('[sync] SYNC_READY ripetuto: ignorato'); break; }
      cancelWait();
      s.readyHandler(gv(p, 'MAX_CHUNK') | 0);
      break;
    case MSG.STATUS: {
      var rt = gv(p, 'REPLY_TO');
      var st = { code: gv(p, 'CODE') | 0, slot: gv(p, 'SLOT') | 0, offset: (gv(p, 'OFFSET') | 0) >>> 0,
                 replyTo: (rt === undefined || rt === null) ? null : (rt & 0xFF) };
      s.log('[sync] STATUS ' + codeName(st.code) + ' slot=' + st.slot + ' offset=' + st.offset +
            (st.replyTo === null ? '' : ' re=' + st.replyTo));
      var h = s.statusHandler;
      if (!h) { s.log('[sync] STATUS inatteso: ignorato'); break; }
      /* S5b: lo STATUS dice a quale messaggio risponde (REPLY_TO): mentre si attende la risposta a un
       * messaggio preciso, quelli di altri messaggi (copie ritrasmesse di SETTINGS/ALBUM_ORDER, che
       * hanno lo stesso SLOT 0xFF) non vengono consumati. Orologio senza REPLY_TO: solo i controlli
       * dei gestori. */
      if (st.replyTo !== null && s.lastStatusMsg && s.lastStatusMsg.dict &&
          st.replyTo !== (s.lastStatusMsg.dict[keys.MSG] | 0)) {
        s.log('[sync] STATUS per MSG ' + st.replyTo + ' mentre attendo MSG ' + (s.lastStatusMsg.dict[keys.MSG] | 0) + ': ignorato');
        break;
      }
      /* Stacco l'attesa corrente; se il gestore risponde false lo STATUS non era per lui (risposta
       * tardiva a un messaggio precedente) e l'attesa viene ripristinata, timer compreso. */
      var waiting = s.lastStatusMsg;
      s.statusHandler = null;
      s.lastStatusMsg = null;
      clearStatusTimer();
      if (h(st) === false) {
        s.log('[sync] STATUS non pertinente: continuo ad aspettare');
        s.statusHandler = h;
        s.lastStatusMsg = waiting;
        if (waiting) { armStatusTimer(); }
      }
      break;
    }
    default:
      s.log('[sync] messaggio ignoto MSG=' + msg + ' chiavi=' + Object.keys(p).slice(0, 4).join(','));
  }
}

/* ---- API ---- */

module.exports = {
  MSG: MSG,
  CODE: CODE,
  PROTO: PROTO,
  parseSlots: parseSlots,
  parseHello: parseHello,
  /* Registra il listener e manda JS_READY. */
  start: function (opts) {
    if (s.started) { return false; }          /* già avviato: il chiamante usa resync() (secondo 'ready') */
    s.started = true;
    s.provider = opts.provider;
    s.log = opts.log || function () {};
    s.hooks = opts.hooks || {};
    Pebble.addEventListener('appmessage', onMessage);
    sendReady();
    return true;
  },
  /* L'album è cambiato (webviewclosed, dev server): nuovo JS_READY → HELLO → piano. Se una sync
   * è in corso viene ripetuto alla fine (l'HELLO durante una sync è ignorato). */
  resync: function () {
    if (!s.started) { return; }
    if (s.running) {
      s.rerun = true;
      s.log('[sync] resync durante una sync: rinviata alla fine');
      return;
    }
    sendReady();
  },
  setHooks: function (hooks) { s.hooks = hooks || {}; },
  isRunning: function () { return s.running; },
  /* Solo test (node): tempi più corti. */
  configure: function (o) {
    o = o || {};
    if (o.backoffMs) { BACKOFF_MS = o.backoffMs; }
    if (o.statusTimeoutMs) { STATUS_TIMEOUT_MS = o.statusTimeoutMs; }
    if (o.statusResends !== undefined) { STATUS_RESENDS = o.statusResends; }
    if (o.watchdogMs) { WATCHDOG_MS = o.watchdogMs; }
    if (o.busyRetries !== undefined) { BUSY_RETRIES = o.busyRetries; }
    if (o.helloTimeoutMs) { HELLO_TIMEOUT_MS = o.helloTimeoutMs; }
    if (o.helloResends !== undefined) { HELLO_RESENDS = o.helloResends; }
  },
  /* Solo test: azzera lo stato del modulo (un solo Pebble finto per processo) e stacca il listener
   * 'appmessage', così un nuovo start() sullo stesso Pebble finto non accumula gestori (revisione: F14;
   * il guard typeof serve perché env() chiama _reset() prima di assegnare global.Pebble). */
  _reset: function () {
    if (typeof Pebble !== 'undefined' && Pebble.removeEventListener) { Pebble.removeEventListener('appmessage', onMessage); }
    cancelWait();
    clearHelloTimer();
    s.helloPending = false; s.helloResends = 0;
    if (s.watchdog) { clearTimeout(s.watchdog); s.watchdog = null; }
    s.started = false; s.provider = null; s.hooks = {}; s.maxChunk = 0; s.plan = null; s.photos = [];
    s.photoIndex = 0; s.cur = null; s.busyRetries = 0; s.readyHandler = null; s.photosDone = null;
    s.statusHandler = null; s.lastStatusMsg = null; s.summary = null; s.running = false; s.rerun = false;
    s.runId++;
  }
};

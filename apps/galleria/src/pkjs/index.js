/* index.js — PKJS di Galleria (S5b): album in localStorage (album.js) + motore di sync (sync.js,
 * S5a) + config page (S6: pagina inlinata in config_page.js, stato nell'hash, payload intero in webviewclosed;
 * docs/design/galleria-s6-config-page.md); in emulatore (Pebble.platform === 'pypkjs') il dev server tools/galleria_devserver.py
 * fa le sue veci (devserver.js): stato dell'album da GET /state.json, payload delle foto scaricati a
 * richiesta, pagina di prova aperta da `pebble emu-app-config`. Design: docs/design/galleria.md §5.1. */
var sync = require('./sync');
var Album = require('./album');
var dev = require('./devserver');
var b64 = require('./b64');

var DEV = (typeof Pebble !== 'undefined' && Pebble.platform === 'pypkjs');

var album = null;
var scenario = 'photo';               /* solo dev: guasti iniettati nel motore (state.hooks.scenario), one-shot */
var scenarioFired = false;
var chunkNo = 0;
var devOpenMs = null;                 /* solo dev: HELLO.OPEN_MS finto (state.hooks.open_ms, --open-ms); null = valore vero */

/* Ripresa automatica (S5b, F9): una sync finita con errori viene ritentata con un backoff lungo —
 * ogni tentativo è solo JS_READY → HELLO → diff, quindi costa nulla se non c'è niente da fare.
 * Tre classi di esito (retryClass):
 *  - 'link' — summary.error in TRANSIENT (telefono scollegato a metà, orologio muto, watchdog):
 *    retry SENZA tetto = ripresa alla riconnessione, voluta (un JS_READY per tentativo);
 *  - 'photo' — esiti per foto / impostazioni / ordine / eliminazione con un codice non in PERMANENT
 *    (STORAGE_ERR, CRC_ERR, BUSY, 'load: …', …; SEQ_ERR non è mai un esito: il motore riprende da
 *    solo): al più RETRY_PHOTO_MAX retry consecutivi di questa classe (photoRetries), poi si rinuncia
 *    fino al prossimo HELLO spontaneo (ready, riconnessione, Save della pagina);
 *  - 'permanent' — summary.error non transitorio (NOT_SUPPORTED, …) o solo codici PERMANENT:
 *    nessun retry automatico.
 * retryCount (gradino del backoff) cresce a ogni scheduleRetry e si azzera in cancelRetry (sync
 * riuscita, rinuncia, errore permanente); photoRetries conta solo i retry di classe 'photo' e si
 * azzera anche a ogni esito 'link', così una foto trova sempre i suoi RETRY_PHOTO_MAX tentativi anche
 * dopo una lunga disconnessione (revisione 29/08). */
var RETRY_MS = [30000, 60000, 120000, 300000, 600000];
var TRANSIENT = { 'send failed': true, 'watchdog': true };                        /* classe 'link': senza tetto */
var PERMANENT = { 'NOT_SUPPORTED': true, 'BAD_FORMAT': true, 'NO_SPACE': true };   /* mai ritentare */
var RETRY_PHOTO_MAX = 3;
var retryCount = 0;
var photoRetries = 0;   /* retry consecutivi di classe 'photo' (tetto RETRY_PHOTO_MAX) */
var retryTimer = null;

function scheduleRetry(why) {
  var ms = RETRY_MS[Math.min(retryCount, RETRY_MS.length - 1)];
  retryCount++;
  if (retryTimer) { clearTimeout(retryTimer); }
  log('[sync] ' + why + ': nuovo tentativo fra ' + (ms / 1000) + ' s (' + retryCount + ')');
  retryTimer = setTimeout(function () { retryTimer = null; sync.resync(); }, ms);
}

function cancelRetry() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  retryCount = 0;
  photoRetries = 0;
}

/* Esito fallito = codice ≠ 'OK'; 'send failed' è un guasto di collegamento (classe 'link', vedi retryClass). */
function isFailCode(c) { return typeof c === 'string' && c !== 'OK' && c !== 'send failed'; }

/* '<slot>:<code>' → '<code>' (il codice può contenere ':', es. 'load: …'). */
function codeOf(item) { var s = String(item), i = s.indexOf(':'); return (i < 0) ? s : s.slice(i + 1); }

/* Esiti falliti di una sync: [{label, code}] con label '<slot>:<code>' per le foto
 * (summary.photoCodes), 'settings:<code>', 'order:<code>', 'delete:<slot>:<code>'. */
function failedOutcomes(summary) {
  var out = [], codes = summary.photoCodes || [], dels = summary.deletes || [], i, c;
  for (i = 0; i < codes.length; i++) {
    c = codeOf(codes[i]);
    if (isFailCode(c)) { out.push({ label: String(codes[i]), code: c }); }
  }
  if (isFailCode(summary.settings)) { out.push({ label: 'settings:' + summary.settings, code: summary.settings }); }
  if (isFailCode(summary.order)) { out.push({ label: 'order:' + summary.order, code: summary.order }); }
  for (i = 0; i < dels.length; i++) {
    c = codeOf(dels[i]);
    if (isFailCode(c)) { out.push({ label: 'delete:' + dels[i], code: c }); }
  }
  return out;
}

function labelsOf(items) {
  var a = [], i;
  for (i = 0; i < items.length; i++) { a.push(items[i].label); }
  return a.join(',');
}

/* 'link' | 'photo' | 'permanent' | 'none' (vedi sopra). */
function retryClass(summary) {
  var items, i, retryable = false, codes = summary.photoCodes || [];
  if (summary.error) { return TRANSIENT[summary.error] ? 'link' : 'permanent'; }
  /* difesa: sync.js chiude la sync (abortSync → summary.error) su un invio fallito; se mai un
   * 'send failed' arrivasse come esito di una foto, resta un guasto di collegamento */
  for (i = 0; i < codes.length; i++) { if (codeOf(codes[i]) === 'send failed') { return 'link'; } }
  items = failedOutcomes(summary);
  if (!items.length) { return 'none'; }
  for (i = 0; i < items.length; i++) { if (!PERMANENT[items[i].code]) { retryable = true; } }
  return retryable ? 'photo' : 'permanent';
}

function log(m) { console.log(m); }

/* localStorage se c'è e funziona (WebView Android, JSCore iOS, pypkjs: persistente), altrimenti
 * un oggetto in memoria (l'album vive fino alla chiusura del PKJS: meglio di un crash).
 *
 * pypkjs (S5b, F11): il suo localStorage è un dbm.dumb di CPython, che aggiorna l'indice su disco
 * (.dir) solo in _commit() (chiusura pulita = `pebble install`, e __delitem__) e in _addkey (chiave
 * NUOVA); la riscrittura in place di un valore esistente resta solo in memoria → con `pebble kill`
 * (SIGKILL) l'indice punta alla versione vecchia e il JSON riletto è troncato (album azzerato).
 * Un padding a lunghezza fissa in unità UTF-16 non garantisce lo stesso numero di blocchi da 512 B
 * (il file è UTF-8: 'città' e i multipli attraversati cambiano il conto), quindi in modalità dev
 * ogni scrittura è removeItem + setItem: durabile per qualsiasi lunghezza/charset, al costo di un
 * .dat che cresce (512 B per album, ~45 KB per payload; `pebble wipe` azzera). I valori già paddati
 * su disco si rileggono (JSON.parse e b64.decode ignorano gli spazi) e vengono sostituiti nudi alla
 * prima riscrittura. Sul telefono (SharedPreferences / NSUserDefaults) nulla cambia. */
function safeStorage() {
  var probe = 'galleria.v1.probe';
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return {
        getItem: function (k) { var v = localStorage.getItem(k); return (v === undefined) ? null : v; },
        setItem: function (k, v) {
          if (!DEV) { localStorage.setItem(k, v); return; }
          /* dev: removeItem + setItem (vedi sopra); se setItem lancia il valore vecchio è già stato
           * tolto → lo si rimette, così il rollback di album.js (F8) rilegge l'album di prima */
          var old = localStorage.getItem(k);
          localStorage.removeItem(k);
          try { localStorage.setItem(k, v); }
          catch (e) {
            if (old !== null && old !== undefined) { try { localStorage.setItem(k, old); } catch (e2) { /* niente */ } }
            throw e;
          }
        },
        removeItem: function (k) { localStorage.removeItem(k); }
      };
    }
  } catch (e) {
    log('[album] localStorage non disponibile (' + e + '): album solo in memoria');
  }
  var mem = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}

/* ---- guasti di prova (solo dev; gli stessi scenari della fixture di S5a) ---- */
var hooks = {
  beforeData: function (photo, offset, n) {
    if (!DEV || scenarioFired) { return undefined; }
    chunkNo++;
    if (scenario === 'seq' && chunkNo === 2) { scenarioFired = true; return 'skip'; }
    if (scenario === 'dup' && chunkNo === 1) { scenarioFired = true; return 'dup'; }
    if (scenario === 'interrupt' && chunkNo === 3) { scenarioFired = true; return 'stop'; }
    return undefined;
  }
};

var provider = {
  plan: function (hello) {
    /* v1.9 (perf 04/09): in emulatore l'apertura del file persist è quasi istantanea, quindi l'avviso
     * di avvio lento della config page non si vedrebbe mai: `--open-ms N` del dev server lo forza.
     * La sostituzione è loggata QUI, dove avviene (F45): il log '[sync] HELLO … open=' di sync.js
     * è scritto PRIMA di provider.plan e riporta — giustamente — il valore vero dell'orologio,
     * quindi senza questa riga il run.log e la config page si contraddirebbero. (`DEV &&` e' ridondante:
     * devOpenMs viene scritto solo da applyDevState, che gira solo in DEV; resta come cintura.) */
    if (DEV && devOpenMs !== null && hello) {
      log('[dev] HELLO.OPEN_MS forzato a ' + devOpenMs + ' ms (orologio: ' +
          ((hello.openMs === null || hello.openMs === undefined) ? 'ignoto' : hello.openMs + ' ms') + ')');
      hello.openMs = devOpenMs;
    }
    var p = album.plan(hello);
    chunkNo = 0;
    if (DEV && scenario === 'crc' && !scenarioFired && p.photos.length) {
      /* CRC dichiarato sbagliato → l'orologio risponde CRC_ERR. Alterato DOPO il caricamento: la verifica
       * locale di load() usa il CRC vero, altrimenti scarterebbe il payload prima di ogni invio. */
      scenarioFired = true;
      (function (ph) {
        var orig = ph.load;
        ph.load = function (cb) {
          orig(function (err, bytes) {
            if (!err) { ph.crc = (ph.crc ^ 0x5A5A5A5A) >>> 0; log('[dev] scenario crc: CRC della foto slot ' + ph.slot + ' alterato'); }
            cb(err, bytes);
          });
        };
      })(p.photos[0]);
    }
    return p;
  },
  onPhotoResult: function (photo, ok, code) { album.onPhotoResult(photo, ok, code); },
  /* orologio irraggiungibile all'avvio, o HELLO mai arrivato dopo i rinvii di JS_READY (F5) */
  onReadyFailed: function (why) { scheduleRetry(why || 'JS_READY non consegnato'); },
  onDone: function (summary) {
    var cls, items, labels;
    album.onDone(summary);
    log('[album] ' + album.summary());
    if (!summary) { return; }
    cls = retryClass(summary);
    if (cls === 'link') {
      photoRetries = 0;
      scheduleRetry('sync con errori (' + (summary.error || 'send failed') + ')');
      return;
    }
    items = failedOutcomes(summary);
    labels = labelsOf(items);
    if (cls === 'photo' && photoRetries < RETRY_PHOTO_MAX) {
      photoRetries++;
      scheduleRetry('sync con errori (' + labels + ')');
    } else if (cls === 'photo') {
      log('[sync] ' + items.length + ' esiti falliti dopo ' + photoRetries + ' tentativi (' + labels + '): rinuncio fino al prossimo HELLO');
      cancelRetry();
    } else if (cls === 'permanent') {
      log('[sync] errore permanente (' + (summary.error || labels) + '): nessun nuovo tentativo automatico');
      cancelRetry();
    } else {
      cancelRetry();
    }
  }
};

/* ---- payload (config page / dev server) ---- */

function applyPayload(payload, full) {
  var r = album.applyPayload(payload, { full: full, allowUrl: DEV });
  log('[album] payload ' + (full ? 'completo' : 'delta') + ': ' + (r.ok ? 'ok' : 'ERRORE') +
      ', cambiato ' + r.changed + ', nuove [' + r.added.join(',') + '] aggiornate [' + r.updated.join(',') +
      '] eliminate [' + r.deleted.join(',') + ']' + (r.errors.length ? ' errori: ' + r.errors.join('; ') : ''));
  log('[album] ' + album.summary());
  return r;
}

/* Stato dal dev server: completo solo se lo dichiara (full: true, come /state.json e /save.json
 * oggi); un payload delta (S6) non va applicato come stato completo (F10). */
function applyDevState(state) {
  var om, next;
  if (state && state.hooks && typeof state.hooks.scenario === 'string') {
    scenario = state.hooks.scenario;
    if (scenario !== 'photo' && scenario !== 'none') { log('[dev] scenario di guasto "' + scenario + '"'); }
  }
  /* HELLO.OPEN_MS finto: ramo COMPLETO (F45). Ogni stato del dev server (/state.json, /save.json,
   * relay) porta `hooks`, ma `open_ms` solo con --open-ms: uno stato con `hooks` e SENZA l'hook
   * (dev server riavviato senza il flag per la controprova "l'avviso sparisce") deve AZZERARE il
   * valore forzato, altrimenti l'HELLO resterebbe falsificato fino al riavvio del PKJS. Uno stato
   * senza `hooks` del tutto (altra origine) non tocca l'hook, come per `scenario`. */
  if (state && state.hooks) {
    om = state.hooks.open_ms;
    next = (typeof om === 'number' && isFinite(om) && om >= 0) ? (om & 0xFFFF) : null;
    if (om !== undefined && om !== null && next === null) { log('[dev] hook open_ms non valido (' + om + '): ignorato'); }
    if (next !== devOpenMs) {
      log(next === null ? '[dev] hook open_ms rimosso: HELLO.OPEN_MS torna quello dell\'orologio'
                        : '[dev] hook open_ms: HELLO.OPEN_MS forzato a ' + next + ' ms (avviso di avvio lento)');
    }
    devOpenMs = next;
  }
  return applyPayload(state, !!(state && state.full === true));
}

/* Album non salvato e modifiche annullate (album.js, F8): l'orologio ha già ciò che c'è su disco. */
function rolledBack(r) { return r.ok === false && r.changed === false; }

function parseResponse(r) {
  var text = r, payload;
  if (typeof text !== 'string' || text.length === 0) { return null; }
  try {
    if (text.charAt(0) !== '{') { text = decodeURIComponent(text); }
    payload = JSON.parse(text);
  } catch (e) {
    log('[config] risposta della pagina non valida (' + e + '): ignorata');
    return null;
  }
  return (payload && typeof payload === 'object') ? payload : null;
}

/* ---- eventi Pebble ---- */

/* start() la prima volta; a un secondo 'ready' nello stesso runtime (riconnessione sull'app
 * Android) il motore è già avviato → resync() (nuovo JS_READY → HELLO → diff). */
function startOrResync() {
  if (!sync.start({ provider: provider, log: log, hooks: hooks })) {
    log('[sync] motore gia\' avviato: resync');   /* F-S8-2: solo ASCII nei log (l'app taglia i byte accentati) */
    sync.resync();
  }
}

Pebble.addEventListener('ready', function () {
  if (!album) { album = new Album(safeStorage(), log); }
  log('[album] pronto (' + (DEV ? 'dev server ' + dev.base : 'telefono') + '): ' + album.summary());
  if (!DEV) {
    startOrResync();
    return;
  }
  album.setLoader(function (slot, fmt, cb) { dev.fetchPhotoB64(slot, fmt, cb); });
  dev.fetchState(function (err, state) {
    if (err) {
      log('[dev] dev server non raggiungibile (' + err + '): parto con l\'album locale');
    } else {
      applyDevState(state);
    }
    startOrResync();
  });
});

/* ---- config page (S6, docs/design/galleria-s6-config-page.md §2 e §10) ----
 * Lo stato (album.state() + piattaforma/formato/tetto) viaggia nell'HASH dell'URL come base64url
 * dei byte UTF-8 del JSON: identico sul telefono (data: URL con la pagina inlinata da config_page.js)
 * e in emulatore (pagina servita dal dev server; `pebble emu-app-config` aggiunge ?return_to=
 * prima dell'hash). La pagina produce sempre e solo il formato dell'orologio collegato (fmt). */
var CONFIG_HTML = null;   /* require pigro: config_page.js è una stringa da ~60 KB generata da tools/build_config_page.py */

function watchPlatform() {
  var info = null;
  try { info = (typeof Pebble.getActiveWatchInfo === 'function') ? Pebble.getActiveWatchInfo() : null; }
  catch (e) { info = null; }                         /* app vecchia o orologio non collegato */
  return (info && typeof info.platform === 'string') ? info.platform : 'unknown';
}

function configState() {
  var st, platform = watchPlatform(), fmt;
  if (!album) { album = new Album(safeStorage(), log); }
  st = album.state();
  /* formato: vince l'orologio COLLEGATO (revisione S6 #5: con due orologi lo snapshot dell'ultimo HELLO
   * può essere dell'altro); lo snapshot serve solo se la piattaforma non è nota */
  if (platform === 'flint') { fmt = 2; }
  else if (platform !== 'unknown') { fmt = 1; }
  else { fmt = (st.watch && (st.watch.format === 1 || st.watch.format === 2)) ? st.watch.format : 1; }
  /* cap_kb: 900 (Android). Pebble.platform è il runtime ('pebble' sul telefono, 'pypkjs' in emulatore), NON
   * l'OS: iOS non è riconoscibile da qui (revisione S6 #4) → è la pagina ad abbassare il tetto a 200 KB
   * quando navigator.userAgent è iPhone/iPad/iPod. */
  return { v: 1, platform: platform, fmt: fmt, cap_kb: 900, dev: DEV,
           settings: st.settings, settingsSet: st.settingsSet, photos: st.photos, order: st.order,
           deleted: st.deleted, watch: st.watch || null };
}

var cfgOpenedAt = 0;                                /* S8: ms fra Pebble.openURL e webviewclosed (tempo nella pagina) */

Pebble.addEventListener('showConfiguration', function () {
  var hash = '', url;
  try { hash = b64.encodeUtf8(JSON.stringify(configState())); }
  catch (e) { log('[config] stato non serializzabile (' + e + '): pagina senza stato'); }
  if (DEV) {
    url = dev.base + '/config.html#' + hash;
    log('[config] apro ' + dev.base + '/config.html (stato: ' + hash.length + ' car.)');
  } else {
    if (CONFIG_HTML === null) {
      try { CONFIG_HTML = require('./config_page'); }
      catch (e) {                                     /* solo host/test: nel .pbw il modulo generato c'è sempre */
        log('[config] config_page.js mancante (' + e + '): eseguire tools/build_config_page.py');
        CONFIG_HTML = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Galleria</title>' +
                      '<p>Pagina di configurazione non inclusa nel pacchetto (config_page.js mancante).</p><p><a href="pebblejs://close#">Chiudi</a></p>';
      }
    }
    url = 'data:text/html;charset=utf-8,' + encodeURIComponent(CONFIG_HTML) + '#' + hash;
    log('[config] apro la pagina (URL ' + url.length + ' car., stato ' + hash.length + ')');
  }
  cfgOpenedAt = new Date().getTime();
  Pebble.openURL(url);
});

Pebble.addEventListener('webviewclosed', function (e) {
  var payload = parseResponse(e && e.response), r, t0;
  log('[config] pagina chiusa: risposta di ' + ((e && typeof e.response === 'string') ? e.response.length : 0) + ' car.' +
      (cfgOpenedAt ? ' dopo ' + (new Date().getTime() - cfgOpenedAt) + ' ms' : ''));
  cfgOpenedAt = 0;
  if (!payload) { log('[config] pagina chiusa senza modifiche'); return; }
  if (payload.dev) {
    if (!DEV) { log('[config] token dev fuori dall\'emulatore: ignorato'); return; }
    log('[dev] salvataggio seq ' + payload.seq + ': rileggo lo stato');
    dev.fetchSave(function (err, state) {
      if (err) { log('[dev] /save.json non raggiungibile: ' + err); return; }
      if (rolledBack(applyDevState(state))) { log('[config] modifiche annullate: nessuna sync'); return; }
      sync.resync();
    });
    return;
  }
  if (payload.v !== 1) { log('[config] payload v' + payload.v + ' non supportato'); return; }
  t0 = new Date().getTime();
  r = applyPayload(payload, false);
  log('[config] payload applicato in ' + (new Date().getTime() - t0) + ' ms');   /* S8: costo del localStorage del telefono */
  if (rolledBack(r)) { log('[config] modifiche annullate: nessuna sync'); return; }
  sync.resync();
});

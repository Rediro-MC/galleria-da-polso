/* devserver.js — client del dev server di S5b (tools/galleria_devserver.py), usato SOLO in
 * emulatore (Pebble.platform === 'pypkjs'). Il dev server fa le veci della config page: da lì
 * arrivano lo stato dell'album (GET /state.json, payload "full" con url al posto di data) e i
 * payload delle foto (GET /photo/<k>.raw6|raw1?b64=1, base64url), scaricati a richiesta dal loader
 * dell'album e poi salvati in localStorage come sul telefono. XHR di pypkjs: niente evento
 * 'error' (status 0 + readyState 4), quindi si usa onreadystatechange + un timer di guardia. */
var BASE = 'http://localhost:8765';
var TIMEOUT_MS = 8000;

function get(path, cb) {
  var xhr, done = false, guard;
  function finish(err, text) {
    if (done) { return; }
    done = true;
    if (guard) { clearTimeout(guard); guard = null; }
    cb(err, text);
  }
  try {
    xhr = new XMLHttpRequest();
    xhr.open('GET', BASE + path, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) { return; }
      if (xhr.status === 200) { finish(null, xhr.responseText); }
      else { finish('HTTP ' + xhr.status + (xhr.statusText ? ' ' + xhr.statusText : '')); }
    };
    xhr.timeout = TIMEOUT_MS;
    xhr.ontimeout = function () { finish('timeout'); };
    xhr.send();
  } catch (e) {
    finish('xhr: ' + e);
    return;
  }
  guard = setTimeout(function () { finish('timeout'); }, TIMEOUT_MS + 1000);
}

function getJson(path, cb) {
  get(path, function (err, text) {
    var obj;
    if (err) { return cb(err); }
    try { obj = JSON.parse(text); } catch (e) { return cb('JSON non valido da ' + path); }
    cb(null, obj);
  });
}

module.exports = {
  base: BASE,
  /* Stato completo dell'album secondo il dev server (payload full). */
  fetchState: function (cb) { getJson('/state.json', cb); },
  /* Dopo un Save della pagina di prova (token {v:1, dev:true, seq}). */
  fetchSave: function (cb) { getJson('/save.json', cb); },
  /* Payload base64url di uno slot nel formato dato (1 raw6, 2 raw1). */
  fetchPhotoB64: function (slot, fmt, cb) {
    get('/photo/' + slot + (fmt === 2 ? '.raw1' : '.raw6') + '?b64=1', function (err, text) {
      if (err) { return cb(err); }
      cb(null, (typeof text === 'string') ? text.replace(/\s+/g, '') : '');
    });
  }
};

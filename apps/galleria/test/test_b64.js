#!/usr/bin/env node
/* test_b64.js — test host di src/pkjs/b64.js (node, nessuna dipendenza).
 *
 * Copre: vettori RFC 4648 §10, round trip di tutti i 256 byte, buffer casuali (LCG con seme
 * fisso) di ogni lunghezza 0..70, un buffer da 34.200 B (una foto raw6), confronto con
 * Buffer.from(...).toString('base64url') di node, decodifica dell'alfabeto standard, del
 * padding e degli spazi, errori sugli input non validi, la fixture di
 * test/fixture_photo.js (i byte decodificati devono avere il CRC32 dichiarato) e — §8, S12/D44 —
 * `encodeUtf8` / `encodeUtf8Std`: byte UTF-8, alfabeti, padding, accenti/emoji/CJK, surrogati
 * spaiati, round trip con Buffer e forma del `data:` URL della config page.
 *
 * Si esegue da solo (`node test/test_b64.js`) o con `make -C test jstest`.
 */

var b64 = require('../src/pkjs/b64');
var fixture = require('./fixture_photo');
var zlib = require('zlib');

var g_pass = 0, g_fail = 0;

function check(cond, what) {
  if (cond) { g_pass++; } else { g_fail++; console.log('FAIL ' + what); }
}

function eq(got, exp, what) {
  if (got === exp) { g_pass++; } else { g_fail++; console.log('FAIL ' + what + ': "' + got + '" invece di "' + exp + '"'); }
}

function eqBytes(got, exp, what) {
  var i;
  if (got.length !== exp.length) {
    g_fail++; console.log('FAIL ' + what + ': ' + got.length + ' byte invece di ' + exp.length);
    return;
  }
  for (i = 0; i < exp.length; i++) {
    if (got[i] !== exp[i]) {
      g_fail++; console.log('FAIL ' + what + ': byte ' + i + ' = ' + got[i] + ' invece di ' + exp[i]);
      return;
    }
  }
  g_pass++;
}

function expectError(fn, what) {
  try { fn(); } catch (e) { g_pass++; return; }
  g_fail++; console.log('FAIL ' + what + ': nessun errore');
}

function bytesOf(str) {                       /* stringa ASCII -> Array di byte */
  var a = [], i;
  for (i = 0; i < str.length; i++) { a.push(str.charCodeAt(i)); }
  return a;
}

/* LCG a 32 bit (Math.imul: niente perdita di precisione come con la moltiplicazione a
 * virgola mobile), stesso schema delle fixture di photo_prep.py. Seme fisso = test ripetibile. */
function Lcg(seed) { this.x = seed | 0; }
Lcg.prototype.byte = function () {
  this.x = (Math.imul(this.x, 1103515245) + 12345) | 0;
  return (this.x >>> 16) & 255;
};

function crc32(buf) {
  return zlib.crc32 ? zlib.crc32(buf) >>> 0 : legacyCrc32(buf);
}

function legacyCrc32(buf) {                   /* node < 20.15: zlib.crc32 non c'è */
  var table = [], c, n, k, crc = 0xFFFFFFFF;
  for (n = 0; n < 256; n++) {
    c = n;
    for (k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
    table[n] = c >>> 0;
  }
  for (n = 0; n < buf.length; n++) { crc = table[(crc ^ buf[n]) & 255] ^ (crc >>> 8); }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/* ------------------------------------------------ 1. vettori RFC 4648 §10 --- */
/* base64url senza padding: gli stessi vettori del §10 con '=' tolti. */
var RFC = [
  ['', ''],
  ['f', 'Zg'],
  ['fo', 'Zm8'],
  ['foo', 'Zm9v'],
  ['foob', 'Zm9vYg'],
  ['fooba', 'Zm9vYmE'],
  ['foobar', 'Zm9vYmFy']
];
var RFC_PAD = ['', 'Zg==', 'Zm8=', 'Zm9v', 'Zm9vYg==', 'Zm9vYmE=', 'Zm9vYmFy'];

(function () {
  var i;
  for (i = 0; i < RFC.length; i++) {
    eq(b64.encode(bytesOf(RFC[i][0])), RFC[i][1], 'encode("' + RFC[i][0] + '")');
    eqBytes(b64.decode(RFC[i][1]), bytesOf(RFC[i][0]), 'decode("' + RFC[i][1] + '")');
    eqBytes(b64.decode(RFC_PAD[i]), bytesOf(RFC[i][0]), 'decode con padding "' + RFC_PAD[i] + '"');
  }
})();

/* ------------------------------------- 2. round trip di tutti i 256 byte --- */
(function () {
  var all = [], i;
  for (i = 0; i < 256; i++) { all.push(i); }
  var enc = b64.encode(all);
  eq(enc, Buffer.from(all).toString('base64url'), 'encode dei 256 byte = base64url di node');
  eqBytes(b64.decode(enc), all, 'round trip dei 256 byte');
  check(/^[A-Za-z0-9_-]*$/.test(enc), 'alfabeto base64url (niente + / =)');
  /* ogni singolo byte da solo */
  for (i = 0; i < 256; i++) {
    eqBytes(b64.decode(b64.encode([i])), [i], 'round trip del byte ' + i);
  }
})();

/* ------------- 3. buffer casuali: 10 per ogni lunghezza da 0 a 70 (LCG) --- */
(function () {
  var rnd = new Lcg(1), len, k, j, buf, enc;
  for (len = 0; len <= 70; len++) {
    for (k = 0; k < 10; k++) {
      buf = [];
      for (j = 0; j < len; j++) { buf.push(rnd.byte()); }
      enc = b64.encode(buf);
      eq(enc, Buffer.from(buf).toString('base64url'), 'encode casuale len ' + len + ' #' + k);
      eqBytes(b64.decode(enc), buf, 'round trip casuale len ' + len + ' #' + k);
      /* la stessa stringa con l'alfabeto standard e il padding deve dare gli stessi byte */
      eqBytes(b64.decode(Buffer.from(buf).toString('base64')), buf,
              'decode standard+padding len ' + len + ' #' + k);
    }
  }
})();

/* ------------------------------------ 4. buffer da 34.200 B (foto raw6) --- */
(function () {
  var rnd = new Lcg(20260829), buf = [], i, t0, enc, dec;
  for (i = 0; i < 34200; i++) { buf.push(rnd.byte()); }
  t0 = Date.now();
  enc = b64.encode(buf);
  var tEnc = Date.now() - t0;
  eq(enc.length, 45600, 'lunghezza base64url di 34.200 B');
  eq(enc, Buffer.from(buf).toString('base64url'), 'encode 34.200 B = base64url di node');
  t0 = Date.now();
  dec = b64.decode(enc);
  var tDec = Date.now() - t0;
  eqBytes(dec, buf, 'round trip 34.200 B');
  console.log('  34.200 B: encode ' + tEnc + ' ms, decode ' + tDec + ' ms');
})();

/* ---------------------- 5. spazi, a capo, padding, alfabeto standard misti --- */
(function () {
  var atteso = bytesOf('foobar');
  eqBytes(b64.decode('Zm9v\nYmFy'), atteso, 'decode con a capo');
  eqBytes(b64.decode('  Zm9v YmFy  '), atteso, 'decode con spazi');
  eqBytes(b64.decode('Zm9v\r\nYmFy\n'), atteso, 'decode con CRLF');
  eqBytes(b64.decode('Zm9vYmE=\n'), bytesOf('fooba'), 'decode con padding e a capo');
  /* '+' e '/' (standard) vs '-' e '_' (url): stessi byte */
  eqBytes(b64.decode('+/A='), b64.decode('-_A'), "'+/' e '-_' danno gli stessi byte");
  eqBytes(b64.decode('/w=='), [255], "decode('/w==') = [255]");
  eqBytes(b64.decode('_w'), [255], "decode('_w') = [255]");
})();

/* ------------------------------------------------ 6. input non validi --- */
(function () {
  eqBytes(b64.decode('Zg==='), [102], "padding in eccesso ('Zg===') tollerato");
  expectError(function () { b64.decode('Z'); }, 'lunghezza con resto 1');
  expectError(function () { b64.decode('Zm9vYmFyZ'); }, 'lunghezza 9 (resto 1)');
  expectError(function () { b64.decode('Zm9v*mFy'); }, "carattere '*' non valido");
  expectError(function () { b64.decode('Zm9vYmF!'); }, "carattere '!' non valido");
  expectError(function () { b64.decode('Zm9vYmà'); }, 'carattere non ASCII');
  expectError(function () { b64.decode('Zg==Zg'); }, 'simbolo dopo il padding');
  expectError(function () { b64.decode(null); }, 'decode(null)');
  expectError(function () { b64.decode(42); }, 'decode(numero)');
  expectError(function () { b64.encode(null); }, 'encode(null)');
  expectError(function () { b64.encode('foo'); }, 'encode(stringa)');
})();

/* ------------------------------- 7. la fixture di test/gen_sync_fixture.py --- */
(function () {
  var casi = [['raw6', fixture.raw6], ['raw1', fixture.raw1]], i, nome, f, t0, bytes, ms;
  eq(fixture.name, 'sync_fixture', 'nome della fixture');
  for (i = 0; i < casi.length; i++) {
    nome = casi[i][0]; f = casi[i][1];
    check(/^[A-Za-z0-9_-]+$/.test(f.b64), nome + ': base64url puro (niente + / =)');
    t0 = Date.now();
    bytes = b64.decode(f.b64);
    ms = Date.now() - t0;
    eq(bytes.length, f.len, nome + ': byte decodificati');
    eq(crc32(Buffer.from(bytes)), f.crc >>> 0, nome + ': CRC32 dei byte decodificati');
    eq(b64.encode(bytes), f.b64, nome + ': ri-codifica identica alla stringa del modulo');
    eqBytes(bytes, Array.prototype.slice.call(Buffer.from(f.b64, 'base64url')),
            nome + ': stessi byte di Buffer.from(..., base64url)');
    console.log('  fixture ' + nome + ': ' + bytes.length + ' B, CRC32 0x' +
                (f.crc >>> 0).toString(16).toUpperCase() + ', decodifica ' + ms + ' ms');
  }
  eq(fixture.raw6.len, 34200, 'raw6.len = 34.200 (photo_codec.h)');
  eq(fixture.raw1.len, 3024, 'raw1.len = 3.024 (photo_codec.h)');
})();

/* ------------- 8. encodeUtf8 / encodeUtf8Std (S6 hash, S12/D44 data: URL) --- */
(function () {
  var STD_RE = /^[A-Za-z0-9+\/]*={0,2}$/;
  var URL_RE = /^[A-Za-z0-9_-]*$/;
  var casi = ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar',
              'città è perché', 'èéìòù',
              'Español Português Français',
              '京都 テスト', '😀📷❤️',
              '<html>"quote" & \'apice\' \\ / \n\t', ' '];
  var i, s, std, url, buf;

  /* i vettori del RFC 4648 §10 con il padding: encodeUtf8Std di una stringa ASCII e' base64 standard */
  for (i = 0; i < RFC.length; i++) {
    eq(b64.encodeUtf8Std(RFC[i][0]), RFC_PAD[i], 'encodeUtf8Std("' + RFC[i][0] + '")');
  }

  for (i = 0; i < casi.length; i++) {
    s = casi[i];
    std = b64.encodeUtf8Std(s);
    url = b64.encodeUtf8(s);
    buf = Buffer.from(s, 'utf8');
    eq(std, buf.toString('base64'), 'encodeUtf8Std = Buffer.toString(base64) [' + i + ']');
    eq(url, buf.toString('base64url'), 'encodeUtf8 = Buffer.toString(base64url) [' + i + ']');
    check(STD_RE.test(std), 'alfabeto standard e padding solo in coda [' + i + ']');
    check(URL_RE.test(url), 'alfabeto url senza padding [' + i + ']');
    eq(std.length % 4, 0, 'lunghezza multipla di 4 [' + i + ']');
    eq(std.length, Math.ceil(buf.length / 3) * 4, 'lunghezza = ceil(n/3)*4 [' + i + ']');
    eq(std.replace(/=+$/, '').length, url.length, 'stesso numero di simboli con e senza padding [' + i + ']');
    eq(std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), url,
       'std -> url e\' solo il cambio di alfabeto [' + i + ']');
    eqBytes(b64.decode(std), Array.prototype.slice.call(buf), 'decode(encodeUtf8Std) = byte UTF-8 [' + i + ']');
    eq(Buffer.from(std, 'base64').toString('utf8'), s, 'round trip Buffer [' + i + ']');
  }

  /* il padding c'e' davvero quando serve, e vale la regola (3 - n%3) % 3 */
  for (i = 0; i < 7; i++) {
    s = 'abcdefg'.slice(0, i);
    eq((b64.encodeUtf8Std(s).match(/=/g) || []).length, (3 - (i % 3)) % 3,
       'numero di "=" per ' + i + ' byte');
  }

  /* surrogato spaiato: come Buffer, diventa U+FFFD (encodeURIComponent lancerebbe) */
  eq(b64.encodeUtf8Std('a\ud800b'), Buffer.from('a\ud800b', 'utf8').toString('base64'),
     'surrogato alto spaiato -> U+FFFD');
  eq(b64.encodeUtf8Std('a\udfffb'), Buffer.from('a\udfffb', 'utf8').toString('base64'),
     'surrogato basso spaiato -> U+FFFD');
  eq(b64.encodeUtf8Std('😀'), Buffer.from('😀', 'utf8').toString('base64'),
     'coppia valida: nessuna sostituzione');

  /* non stringhe: String(v), come encodeUtf8 (nessuna eccezione: la pagina si apre comunque) */
  eq(b64.encodeUtf8Std(42), Buffer.from('42', 'utf8').toString('base64'), 'encodeUtf8Std(numero)');
  eq(b64.encodeUtf8Std(null), Buffer.from('null', 'utf8').toString('base64'), 'encodeUtf8Std(null)');

  /* stringhe casuali (LCG con seme fisso), tutti i piani Unicode */
  (function () {
    var rnd = new Lcg(20260906), n, j, cp, txt, k;
    for (n = 0; n < 60; n++) {
      txt = '';
      for (j = 0; j < 1 + (n % 37); j++) {
        k = rnd.byte() & 3;
        if (k === 0) { cp = 0x20 + (rnd.byte() % 95); }
        else if (k === 1) { cp = 0xA0 + (rnd.byte() % 0x300); }
        else if (k === 2) { cp = 0x800 + (((rnd.byte() << 4) | (rnd.byte() & 15)) % 0xD000); }
        else { cp = 0x10000 + (((rnd.byte() << 8) | rnd.byte()) % 0x8000); }
        if (cp > 0xFFFF) {
          cp -= 0x10000;
          txt += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
        } else {
          txt += String.fromCharCode(cp);
        }
      }
      eq(b64.encodeUtf8Std(txt), Buffer.from(txt, 'utf8').toString('base64'),
         'casuale ' + n + ': encodeUtf8Std = Buffer');
      eq(b64.encodeUtf8(txt), Buffer.from(txt, 'utf8').toString('base64url'),
         'casuale ' + n + ': encodeUtf8 = Buffer');
    }
  })();

  /* pagina finta delle dimensioni vere (D44): rapporto 1,333 contro 1,659 del percent-encoding */
  (function () {
    var html = '<!doctype html><title>Galleria città</title><p>', t0, ms, pct, nb;
    while (html.length < 76000) { html += 'x<span class="tile">12:34</span>'; }
    t0 = Date.now();
    std = b64.encodeUtf8Std(html);
    ms = Date.now() - t0;
    pct = encodeURIComponent(html).length;
    nb = Buffer.byteLength(html, 'utf8');
    eq(std, Buffer.from(html, 'utf8').toString('base64'), 'pagina finta: uguale a Buffer');
    eq(Buffer.from(std, 'base64').toString('utf8'), html, 'pagina finta: round trip');
    check(std.length < pct, 'base64 piu\' corto del percent-encoding');
    console.log('  pagina finta di ' + nb + ' B: base64 ' + std.length + ' car. (x' +
                (std.length / nb).toFixed(3) + '), percent ' + pct + ' car., risparmio ' +
                (pct - std.length) + ', encode ' + ms + ' ms');
  })();

  /* la forma esatta che index.js mette in Pebble.openURL (S12/D44) */
  (function () {
    var page = '<!doctype html><p>città</p>', hash = b64.encodeUtf8('{"v":1}');
    var pfx = 'data:text/html;charset=utf-8;base64,';
    var url = pfx + b64.encodeUtf8Std(page) + '#' + hash;
    var body = url.slice(pfx.length, url.indexOf('#'));
    eq(Buffer.from(body, 'base64').toString('utf8'), page, 'data: URL: il corpo torna la pagina');
    eq(Buffer.from(b64.decode(url.slice(url.indexOf('#') + 1))).toString('utf8'), '{"v":1}',
       'data: URL: l\'hash resta base64url');
    check(url.indexOf('#') === url.lastIndexOf('#'), 'un solo # nell\'URL (il base64 non ne ha)');
  })();
})();

console.log('b64: ' + g_pass + ' ok, ' + g_fail + ' falliti');
process.exit(g_fail ? 1 : 0);

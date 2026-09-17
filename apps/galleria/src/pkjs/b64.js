/* b64.js — base64url per il PKJS di Galleria (S5a).
 *
 * Le foto viaggiano dalla config page al PKJS e stanno nell'album come stringhe base64url
 * (design galleria §5–§6); l'AppMessage vuole invece un Array di interi 0..255. Qui ci sono
 * le due conversioni, e solo quelle.
 *
 * ES5 puro e nient'altro: niente let/const/arrow/class, niente Uint8Array, niente atob/btoa
 * (non esistono nel JavaScriptCore "nudo" del PKJS su iOS) — così lo stesso file gira sul
 * WebView Android, su iOS e in pypkjs nell'emulatore.
 *
 * encode:       alfabeto base64url (A-Z a-z 0-9 '-' '_'), SENZA padding.
 * decode:       accetta sia base64url sia l'alfabeto standard ('+' '/'), ignora gli '=' finali e
 *               gli spazi/a capo, lancia Error su caratteri non validi o lunghezza incoerente.
 * encodeUtf8:   stringa -> base64url senza padding dei suoi byte UTF-8 (stato nell'hash dell'URL, S6).
 * encodeUtf8Std: stringa -> base64 STANDARD con padding dei suoi byte UTF-8 (S12/D44: la pagina
 *               viaggia sul telefono come `data:text/html;charset=utf-8;base64,<questo>` — 1,333
 *               caratteri per byte invece degli 1,659 del percent-encoding).
 *
 * Prestazioni: tabella di lookup costruita una volta al caricamento del modulo e cicli
 * piatti con indice (niente push, niente concatenazione di stringhe in un accumulatore):
 * una foto raw6 (34.200 B / 45.600 caratteri) si decodifica in pochi ms anche sul telefono.
 */

var ENC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/* Alfabeto standard di RFC 4648 §4, quello che il `data:` URL vuole dopo `;base64,` (S12/D44). */
var ENC_STD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/* DEC[codice ASCII] = 0..63 valore | -1 carattere non valido | -2 da ignorare (spazi e a
 * capo) | -3 '=' (padding: dopo di lui non può più arrivare un simbolo). */
var DEC = (function () {
  var t = [], i;
  for (i = 0; i < 256; i++) { t[i] = -1; }
  for (i = 0; i < 64; i++) { t[ENC.charCodeAt(i)] = i; }
  t[0x2B] = 62;                                  /* '+' dell'alfabeto standard */
  t[0x2F] = 63;                                  /* '/' dell'alfabeto standard */
  t[0x3D] = -3;                                  /* '=' */
  t[0x20] = -2; t[0x09] = -2; t[0x0A] = -2;      /* spazio, tab, \n */
  t[0x0D] = -2; t[0x0C] = -2;                    /* \r, \f */
  return t;
})();

/* Array di interi 0..255 -> stringa base64 con l'alfabeto `alpha` (64 caratteri) e, se `pad`,
 * il padding '=' fino al multiplo di 4. Motore unico di encode/encodeUtf8/encodeUtf8Std: i
 * valori vengono mascherati con & 255, così un byte fuori intervallo non fa esplodere l'invio
 * a metà foto. Nessun controllo sull'ingresso: lo fa il chiamante pubblico. */
function encodeAlpha(bytes, alpha, pad) {
  var n = bytes.length, full = n - (n % 3), parts = [], j = 0, i = 0, b0, b1, b2;
  while (i < full) {
    b0 = bytes[i] & 255; b1 = bytes[i + 1] & 255; b2 = bytes[i + 2] & 255;
    parts[j++] = alpha.charAt(b0 >> 2) +
                 alpha.charAt(((b0 & 0x03) << 4) | (b1 >> 4)) +
                 alpha.charAt(((b1 & 0x0F) << 2) | (b2 >> 6)) +
                 alpha.charAt(b2 & 0x3F);
    i += 3;
  }
  if (n - i === 1) {                             /* 1 byte avanzato -> 2 caratteri (+ '==') */
    b0 = bytes[i] & 255;
    parts[j++] = alpha.charAt(b0 >> 2) + alpha.charAt((b0 & 0x03) << 4) + (pad ? '==' : '');
  } else if (n - i === 2) {                      /* 2 byte avanzati -> 3 caratteri (+ '=') */
    b0 = bytes[i] & 255; b1 = bytes[i + 1] & 255;
    parts[j++] = alpha.charAt(b0 >> 2) +
                 alpha.charAt(((b0 & 0x03) << 4) | (b1 >> 4)) +
                 alpha.charAt((b1 & 0x0F) << 2) + (pad ? '=' : '');
  }
  return parts.join('');
}

/* Array di interi 0..255 -> stringa base64url senza padding. */
function encode(bytes) {
  if (!bytes || typeof bytes === 'string' || typeof bytes.length !== 'number') {
    /* una stringa ha .length: senza questo controllo passerebbe e darebbe byte a zero */
    throw new Error('b64.encode: serve un Array di byte, non ' + typeof bytes);
  }
  return encodeAlpha(bytes, ENC, false);
}

/* Stringa base64(url) -> Array di interi 0..255.
 * I bit che avanzano alla fine (2 o 4, quelli che il padding rappresenta) vengono scartati
 * senza pretendere che siano a zero: stessa tolleranza di Buffer.from(s, 'base64'). */
function decode(str) {
  if (typeof str !== 'string') {
    throw new Error('b64.decode: serve una stringa');
  }
  var n = str.length, out = [], k = 0, acc = 0, nbits = 0, nsym = 0;
  var padded = false, i, c, v;
  for (i = 0; i < n; i++) {
    c = str.charCodeAt(i);
    v = (c < 256) ? DEC[c] : -1;
    if (v >= 0) {
      if (padded) {
        throw new Error('b64.decode: carattere dopo il padding alla posizione ' + i);
      }
      acc = (acc << 6) | v;                      /* al massimo 12 bit: nessun overflow */
      nsym++;
      nbits += 6;
      if (nbits >= 8) {
        nbits -= 8;
        out[k++] = (acc >> nbits) & 255;
        acc = acc & ((1 << nbits) - 1);
      }
    } else if (v === -3) {
      padded = true;
    } else if (v !== -2) {
      throw new Error("b64.decode: carattere non valido '" + str.charAt(i) +
                      "' (0x" + c.toString(16) + ") alla posizione " + i);
    }
  }
  if ((nsym & 3) === 1) {                        /* 1 carattere solo non porta un byte intero */
    throw new Error('b64.decode: lunghezza non valida (' + nsym + ' caratteri, resto 1)');
  }
  return out;
}

/* Stringa JS -> Array dei suoi byte UTF-8. unescape(encodeURIComponent(s)) dà una "binary string"
 * con un carattere per byte (ES5 Annex B: c'è in V8, JavaScriptCore e pypkjs); un surrogato spaiato
 * fa lanciare encodeURIComponent → viene sostituito con U+FFFD e si riprova. */
function utf8Bytes(str) {
  var s = String(str), bin, bytes, i, c, out;
  try {
    bin = unescape(encodeURIComponent(s));
  } catch (e) {
    out = '';
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xDC00 && s.charCodeAt(i + 1) <= 0xDFFF) {
        out += s.charAt(i) + s.charAt(i + 1); i++;            /* coppia valida */
      } else if (c >= 0xD800 && c <= 0xDFFF) {
        out += '\uFFFD';                                      /* surrogato spaiato */
      } else {
        out += s.charAt(i);
      }
    }
    bin = unescape(encodeURIComponent(out));
  }
  bytes = new Array(bin.length);
  for (i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
  return bytes;
}

/* Stringa JS -> base64url SENZA padding dei suoi byte UTF-8: lo stato per la config page viaggia
 * nell'hash dell'URL (S6, design galleria-s6 §2), dove '+' e '/' non sarebbero al sicuro. */
function encodeUtf8(str) {
  return encodeAlpha(utf8Bytes(str), ENC, false);
}

/* Stringa JS -> base64 STANDARD ('+', '/') CON padding dei suoi byte UTF-8: è la forma che vuole
 * un `data:text/html;charset=utf-8;base64,…` (S12/D44). Il percent-encoding della stessa pagina
 * costa 1,659 caratteri per byte (le sorgenti sono quasi tutte ASCII ma `encodeURIComponent`
 * lascia in chiaro solo 71 caratteri su 128), questo ne costa 1,333: sull'HTML vero di fine S12
 * (81.028 B) sono 27.892 caratteri di URL in meno (135.932 -> 108.040, misurati il 06/09/2026).
 * Il padding si tiene: è la forma canonica di RFC 4648 §4, '=' è legale in un `data:` URL, costa
 * al massimo 2 caratteri e toglie ogni dubbio sui decodificatori non «forgiving». */
function encodeUtf8Std(str) {
  return encodeAlpha(utf8Bytes(str), ENC_STD, true);
}

module.exports = { encode: encode, decode: decode, encodeUtf8: encodeUtf8,
                   encodeUtf8Std: encodeUtf8Std };

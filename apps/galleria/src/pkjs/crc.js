/* crc.js — CRC per il PKJS di Galleria (S5b): gli stessi due di src/c/crc.h.
 *  - crc32(bytes[, prev]): CRC-32 IEEE riflesso (poly 0xEDB88320), convenzione zlib — si parte
 *    da 0 e si passa il valore precedente per continuare; "123456789" → 0xCBF43926. Ritorna un
 *    numero SENZA segno (0..2^32−1): per l'AppMessage va inviato come `crc | 0`.
 *  - crc16(bytes[, prev]): CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, non riflesso, senza
 *    xorout); "123456789" → 0x29B1. È il CRC del campo `crc16` di GalSettings e quello che
 *    l'orologio annuncia in HELLO.CRC (design §5, v1.7).
 * ES5 puro, tabella a 256 voci per il CRC-32 (una foto raw6 da 34.200 B ≈ 1–2 ms). */

var T32 = (function () {
  var t = [], n, k, c;
  for (n = 0; n < 256; n++) {
    c = n;
    for (k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes, prev) {
  var c = ((prev === undefined || prev === null) ? 0 : (prev >>> 0)) ^ 0xFFFFFFFF;
  var n = bytes ? bytes.length : 0, i;
  for (i = 0; i < n; i++) {
    c = T32[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function crc16(bytes, prev) {
  var c = (prev === undefined || prev === null) ? 0xFFFF : (prev & 0xFFFF);
  var n = bytes ? bytes.length : 0, i, k;
  for (i = 0; i < n; i++) {
    c ^= (bytes[i] & 0xFF) << 8;
    for (k = 0; k < 8; k++) {
      c = (c & 0x8000) ? (((c << 1) ^ 0x1021) & 0xFFFF) : ((c << 1) & 0xFFFF);
    }
  }
  return c & 0xFFFF;
}

module.exports = { crc32: crc32, crc16: crc16 };

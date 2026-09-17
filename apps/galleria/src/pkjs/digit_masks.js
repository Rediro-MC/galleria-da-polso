/* digit_masks.js - GENERATO da tools/gen_digits.py (v2) con --masks-js: non modificare a mano.
 * Rigenerare con:
 *   ~/.local/share/uv/tools/pebble-tool/bin/python tools/gen_digits.py \
 *       --fonts-dir apps/galleria/resources/fonts \
 *       --out apps/galleria/resources/digits \
 *       --header apps/galleria/src/c/digit_metrics.h \
 *       --masks-js apps/galleria/src/pkjs/digit_masks.js \
 *       --fit-width --no-colon-b --pack
 *
 * S12/D45: maschere a 1 bit del SOLO RIEMPIMENTO delle cifre sprite, per l'anteprima "onesta"
 * della config page (src/pkjs/config/preview.js). Struttura:
 *
 *   { v: 1,
 *     emery: { anton: { a: { strip_h, digit_h, ring, shadow, cell_w,
 *                            glyphs: { "0": { w, bits }, ..., ":": { w, bits } } },
 *                       b: { ... } },
 *              bebas: {...}, barlow: {...}, francois: {...}, staatliches: {...} },
 *     flint: { ... } }
 *
 * bits = base64url SENZA padding (alfabeto di src/pkjs/b64.js) delle righe della casella
 * d'inchiostro del glifo: w = ink[k].w colonne, strip_h righe, riga = ceil(w / 8) byte, MSB-first
 * (pixel x nel bit 0x80 >> (x & 7) del byte x / 8), 1 = riempimento. L'origine x nella strip
 * (ink[k].x) NON serve al JS, che disegna il glifo per conto suo.
 * Anello e ombra si RICOSTRUISCONO dalla sola maschera con la regola di D20 (la stessa che disegna
 * la strip, verificata su tutte e 20 le strip da gen_digits.py prima di scrivere questo
 * file): anello = pixel a distanza di Chebyshev 1..R dal riempimento, meno il riempimento; ombra =
 * scorrimenti (+k, +k), k = 1..S, di (riempimento u anello), meno (riempimento u anello); tutto
 * ritagliato alla casella w x strip_h. R (ring) e S (shadow) stanno in ogni taglia: emery 2/2,
 * flint 1/0 (D26: niente ombra). La taglia B non ha il ':' (--no-colon-b): la chiave manca.
 * ES5 + UMD (module.exports / root.GalDigitMasks), ASCII, nessuna data: due esecuzioni danno lo
 * stesso file byte per byte (--check). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.GalDigitMasks = factory(); }
}(this, function () {
  'use strict';
  /* Payload JSON puro fra i marcatori: lo rilegge test/gen_preview_fixture.py. */
  var MASKS = /*BEGIN-MASKS*/{
 "v": 1,
 "emery": {
  "anton": {
   "a": {
    "strip_h": 72,
    "digit_h": 66,
    "ring": 2,
    "shadow": 2,
    "cell_w": 40,
    "glyphs": {
     "0": {
      "w": 40,
      "bits": "AAAAAAAAAAAAAAAAEAAAAA__wAAAP__wAAB___wAAf___gAD____AAP___-AB____8AP____wA_____AD____-Af____4B_____gH_-D__Af_4P_8B__A__wH_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__Af_wP_8B__g__wH_-H__Af____8B_____gD____-AP____4A_____AB____8AD____gAP___8AAf___gAAf__8AAA___AAAA__wAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 27,
      "bits": "AAAAAAAAAAAAAAAAAAf-AAAP_gAAD_4AAB_-AAA__gAA__4AAf_-AA___gA___4AP__-AD___gA___4AP__-AD___gA___4AP7_-AD8__gA8P_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAA__gAAP_4AAD_-AAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 40,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAP_AAAAH__gAAB___gAAf___AAD___-AAP___8AB____4AP____wA_____AD____8Af____4B_____gH_-H_-Af_wf_4B__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D_-A__wP_4D__B__gP_8H_-AAAAf_4AAAB__AAAAP_8AAAA__wAAAH_-AAAAf_4AAAD__AAAAf_8AAAB__gAAAP_-AAAB__wAAAP_-AAAA__wAAAH__AAAA__4AAAH__AAAA__4AAAD__AAAAf_8AAAD__gAAAf_8AAAB__gAAAP_-AAAA__wAAAH_-AAAAf_4AAAD__AAAAP____4B_____gH____-Af____4B_____gP____-A_____4D_____gP____-A_____4D_____gP____-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 40,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAP_AAAAH__wAAB___gAAP___gAB____AAP___8AB____4AH____wA_____AD____8Af____4B_____gH__H_-Af_4P_4B__A__gH_8D__Af_wP_8B__A__wH_8D__Af_wP_4AAAA__gAAAD_-AAAAf_4AAAH__gAAD__-AAAP__wAAA___AAAD__4AAAP_-AAAA__wAAAD__gAAAP__gAAA__-AAAD__8AAAP__4AAAH__gAAAH_-AAAAf_4AAAA__gAAAD__A__gP_8D_-A__wP_4D__A__gP_8D_-A__wP_4D__A__gP_8D_-A__wP_8D__A__wP_4B__A__gH_8H_-Af____4B_____gH____8AP____wA_____AB____4AH____AAP___8AAf___gAA___8AAB___AAAB__wAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAP__4AAAAf__4AAAAf__4AAAAf__4AAAA___4AAAA___4AAAA___4AAAA___4AAAB___4AAAB___4AAAB___4AAAB_3_4AAAD_3_4AAAD_3_4AAAD_3_4AAAH_3_4AAAH_n_4AAAH_n_4AAAH_n_4AAAP_n_4AAAP_H_4AAAP_H_4AAAf_H_4AAAf_H_4AAAf-H_4AAAf-H_4AAA_-H_4AAA_-H_4AAA_8H_4AAA_8H_4AAB_8H_4AAB_8H_4AAB_8H_4AAD_4H_4AAD_4H_4AAD_4H_4AAD_4H_4AAH_wH_4AAH_wH_4AAH_wH_4AAH_wH_4AAP_gH_4AAP_gH_4AAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAAAAH_4AAAAAH_4AAAAAH_4AAAAAH_4AAAAAH_4AAAAAH_4AAAAAH_4AAAAAH_4AAAAAH_4AAAAAH_4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 39,
      "bits": "AAAAAAAAAAAAAAAAAAAAH____4Af____gB____-AH____4Af____gB____-AH____4Af____gB____-AH____4Af____gB____-AH_4AAAAf_gAAAB_-AAAAH_4AAAAf_gAAAB_-AAAAH_4fwAAf_n_wAB_-__wAH____gAf____AB____8AH____4Af____gB_____AH____8Af____wB__D__AH_4H_-Af_gf_4B_-B__gH_4D_-AAAAP_4AAAA__gAAAD_-AAAAP_4AAAA__gAAAD_-A__gP_4D_-A__gP_4D_-A__gP_4D_-A__gP_4D_-A__gP_4D_-A__gP_4D_-A__gf_4D_-B__gP_8H_8A_____wD_____AP____8A_____gB____-AH____wAP____AAf___4AA____AAB___4AAB___AAAB__gAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 40,
      "bits": "AAAAAAAAAAAAAAAAEAAAAA__wAAAP__wAAD___wAAf___gAD____AAf___-AB____8AP____wA_____AD____8Af____4B__B__gH_8D_-Af_wP_4B_-A__gP_4D_-A__gP_4D_-A__gP_4D_-A__gAAAD_-AAAAP_4AAAA__gAAAD_-AAAAP_4f4AA__n_8AD_-__4AP_7__wA_____gD____-AP____8A_____wD_____gP____-A_____4D__j__gP_8H_-A__wf_4D__A__wP_4D__A__gP_8D_-A__wP_4D__A__gP_8D_-A__wP_4D__A__gP_8D_-A__wP_4D_-A__wf_4D__B__gP_8H_-Af____4B_____AH____8AP____wA____-AD____4AH____AAP___4AA____AAA___4AAB___AAAB__wAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 38,
      "bits": "AAAAAAAAAAAAAAAAAAAAP____8A_____wD_____AP____8A_____wD_____AP____8A_____wD_____AP____4A_____gD____-AAAAf_4AAAB__gAAAP_8AAAA__wAAAD__AAAAf_4AAAB__gAAAP_-AAAA__wAAAD__AAAAf_4AAAB__gAAAP_-AAAA__wAAAD__AAAAf_4AAAB__gAAAP_-AAAA__wAAAD__AAAAf_4AAAB__gAAAH_-AAAA__wAAAD__AAAAf_8AAAB__gAAAH_-AAAAf_4AAAD__gAAAP_8AAAA__wAAAH__AAAAf_4AAAB__gAAAH_-AAAA__4AAAD__gAAAP_8AAAA__wAAAD__AAAAf_8AAAB__wAAAH__AAAAf_4AAAB__gAAAH_-AAAAf_4AAAD__gAAAP_-AAAA__4AAAD__gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 39,
      "bits": "AAAAAAAAAAAAAAAAIAAAAB__wAAAf__wAAH___wAA____gAH____AA____8AH____4Af____gB_____AP____8A_____wD_____gP_8H_-A__gf_4D_-B__gP_4D_-A__gP_4D_-A__gP_4H_-A__gf_4D__B__AP_-P_8A_____wB_____AH____4AP____AAf___8AAf___AAD___-AAf___8AD____4Af____gB_____AP____8A__w__wD__B__gP_4H_-A__gP_4D_-A__gP_4D_-A__gP_4D_-A__gP_4D_-A__gP_4D_-A__gP_4D_-A__gP_4D_-A__gP_4H_-A__gf_4D__B__AP____8A_____wB_____AH____4Af____gA____-AD____wAH____AAP___4AA____AAA___4AAB__-AAAB__gAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 40,
      "bits": "AAAAAAAAAAAAAAAAIAAAAA__wAAAP__wAAD___wAAf___gAD____AAf___-AB____4AP____wA_____AD____8Af____4B_____gH_-H_-Af_wP_4D__A__gP_8D_-A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_8D__A__wP_-D__A__4f_8B_____wH_____Af____8B_____wD_____AP____8Af____wB_____AB__v_8AD_8__wAD_D__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wH_4D_-Af_gP_4B_-A__gH_4D_-Af_gP_4B_-A__gH_8D_-Af_wf_4B_____AH____8Af____wA____-AD____4AH____AAf___4AA____gAA___4AAB___AAAA__wAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     ":": {
      "w": 19,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     }
    }
   },
   "b": {
    "strip_h": 100,
    "digit_h": 94,
    "ring": 2,
    "shadow": 2,
    "cell_w": 64,
    "glyphs": {
     "0": {
      "w": 55,
      "bits": "AAAAAAAAAAAAAAAAAAAAAA__gAAAAAD___gAAAAD___-AAAAD____4AAAB_____AAAA_____4AAAf_____AAAP_____4AAH______AAD______4AA______-AAf______wAH______8AD_______gA_______4AP______-AH_______wB___wf__8Af__4D___AH__-A___wD___AH__8A___wB___AP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__wB___gP__8Af__4H___AH___j___wB_______8Af______-AD_______gA_______4AP______8AB_______AAf______gAD______4AAf_____8AAD_____-AAA______AAAH_____gAAAf____wAAAD____4AAAAP___4AAAAA___wAAAAAA__AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 37,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAA__4AAAD__gAAAf_-AAAD__4AAAP__gAAB__-AAAf__4AAD___gAAf__-AAH___4AD____gD____-AP____4A_____gD____-AP____4A_____gD____-AP____4A_____gD____-AP_v__4A_8___gD_j__-AP4P__4A-A___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAD__-AAAP__4AAA___gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 55,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP_wAAAAAA___wAAAAB____gAAAA____-AAAA_____wAAAf____-AAAP_____wAAH_____-AAB______wAA______-AAP______gAH______8AB_______AA_______4AP______-AD_______gB_______8Af__8P___AH__-A___wB___AP__8Af__wB___AH__8Af__wD___AH__8A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__wD___AH__8A___wB___AP__8Af__wD___AH__8A___wD___AP__8A___wD___AP__8A___wD__-AP__8B___gAAAAAf__4AAAAAP__-AAAAAD___AAAAAA___wAAAAAf__8AAAAAH__-AAAAAD___gAAAAB___wAAAAAf__8AAAAAP__-AAAAAH___gAAAAB___wAAAAA___4AAAAAf__-AAAAAP___AAAAAD___gAAAAB___wAAAAA___8AAAAAf__-AAAAAP___AAAAAD___gAAAAB___4AAAAA___8AAAAAf__-AAAAAH___AAAAAD___gAAAAB___4AAAAA___8AAAAAP__-AAAAAH___AAAAAD___gAAAAA___4AAAAAf__8AAAAAH__-AAAAAD___gAAAAA___wAAAAAf__8AAAAAH__-AAAAAD_______wA_______8AP_______AH_______wB_______8Af_______AH_______wB_______8A________AP_______wD_______8A________AP_______wD_______8A________AP_______wD_______8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 54,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP_4AAAAAA___4AAAAB____gAAAB____-AAAA_____wAAAf____-AAAP_____wAAH_____-AAD______wAA______-AAf______gAH______8AD_______AA_______wAP______-AH_______gB_______4Af__8H__-AH__-A___wB___gP__8Af__wB___AH__8Af__wB___AH__8Af__wB___AH__8Af__wB___AH__8Af__wB___AH__8Af__wAAAAAH__8AAAAAD___AAAAAA___wAAAAAf__4AAAAAP__-AAAAAf___gAAAB____4AAAAf___8AAAAH____AAAAB____gAAAAf___wAAAAH___4AAAAB___8AAAAAf__8AAAAAH___gAAAAB___8AAAAAf___gAAAAH___8AAAAB____gAAAAf___8AAAAH____AAAAB____4AAAAA___-AAAAAD___gAAAAAf__4AAAAAH___AAAAAA___wAAAAAP__8AAAAAD___AP__4Af__wD__-AH__8A___gB___AP__4Af__wD__-AH__8A___gB___AP__4Af__wD__-AH__8A___gB___AP__4Af__wD__-AH__8A___gB___AP__4Af__wD__-AH__8A___gD___AP__8A___wD___AP__4Af__wH__-AH___D___gB_______4Af______8AH_______AA_______wAP______4AD______-AAf______AAH______wAA______4AAH_____8AAB______AAAP_____gAAA_____wAAAH____wAAAAf___wAAAAB___wAAAAAB__AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 57,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf____AAAAAB____8AAAAAH____wAAAAA_____AAAAAD____8AAAAAP____wAAAAA_____AAAAAH____8AAAAAf____wAAAAB_____AAAAAP____8AAAAA_____wAAAAD_____AAAAAP____8AAAAB_____wAAAAH_____AAAAAf____8AAAAB_____wAAAAP_____AAAAA__3__8AAAAD__f__wAAAAf_9___AAAAB__3__8AAAAH_-f__wAAAAf_5___AAAAD__n__8AAAAP_-f__wAAAA__x___AAAAH__H__8AAAAf_8f__wAAAB__x___AAAAH__H__8AAAA__4f__wAAAD__h___AAAAP_-H__8AAAA__4f__wAAAH__B___AAAAf_8H__8AAAB__wf__wAAAP__B___AAAA__4H__8AAAD__gf__wAAAP_-B___AAAB__4H__8AAAH__Af__wAAAf_8B___AAAB__wH__8AAAP__Af__wAAA__8B___AAAD__gH__8AAAf_-Af__wAAB__4B___AAAH__gH__8AAAf_8Af__wAAD__wB___AAAP__AH__8AAA__8Af__wAAH__gB___AAAf_-AH__8AAB__4Af__wAAH__gB___AAA__8AH__8AAD________gAP_______-AA________4AD________gAP_______-AA________4AD________gAP_______-AA________4AD________gAP_______-AA________4AD________gAP_______-AA________4AAAAAAf__wAAAAAAB___AAAAAAAH__8AAAAAAAf__wAAAAAAB___AAAAAAAH__8AAAAAAAf__wAAAAAAB___AAAAAAAH__8AAAAAAAf__wAAAAAAB___AAAAAAAH__8AAAAAAAf__wAAAAAAB___AAAAAAAH__8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 55,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAD_______AA_______wAP______8AD_______AA_______wAP______8AD_______AA_______wAP______8AD_______AA_______wAP______8AD_______AA_______wAP______8AD_______AA_______wAP__wAAAAAD__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wf8AAAD__8f_4AAA___P__gAAP__3__-AAD______wAA______-AAP______wAD______8AA_______gAP______8AD_______AA_______wAP______-AD_______gA_______4AP__8H___AD__-A___wA___AP__8AP__wB___AD__8Af__wA__-AH__8AP__gB___gD__4Af__4AAAAAH__-AAAAAB___gAAAAAf__4AAAAAH__-AAAAAB___gAAAAAf__4AAAAAH__-AAAAAB___gAAAAAf__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__wD___AH__8A___wB___AP__8Af__wD___gH__8Af__4D___AH___B___wB_______4Af______-AH_______gB_______wAP______8AD_______AAf______gAH______4AA______8AAH_____-AAA______gAAH_____wAAA_____wAAAD____4AAAAP___4AAAAA___4AAAAAA__gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 55,
      "bits": "AAAAAAAAAAAAAAAAAAAAAA__gAAAAAD___gAAAAD___-AAAAD____4AAAB_____AAAB_____8AAA______gAAP_____8AAH______AAD______4AA_______AAf______wAH______8AB_______gA_______4AP______-AD___B___gB___gP__4Af__wB__-AH__8Af__gB___AH__4Af__gB__-AH__4Af__gD__-AH__4A___gB__-AP__4Af__gD__-AH__4A___gB__-AP__4AAAAAD__-AAAAAA___gAAAAAP__4AAAAAD__-AAAAAA___gAAAAAP__4AAAAAD__-AAAAAA___gP-AAAP__4f_-AAD__-P__4AA___n___AAP__7___4AD_______AA_______4AP______-AD_______wA_______8AP_______gD_______4A_______-AP_______gD_______8A________AP___D___wD___gf__8A___wD___AP__8A___wD___AP__8A___gD___AP__4A___wD__-AP__-A___gD___gP__4A___4D__-AP__-A___gD___gP__4A___4D__-AP__-A___gD___gP__4A___4D__-AP__8A___gD___AP__4A___wD__-AP__8A___wD___AP__8A___wB___AP__8Af__4H__-AH___D___gB_______4Af______-AD_______AA_______wAP______8AB______-AAf______gAD______wAA______4AAH_____-AAA______AAAH_____gAAA_____wAAAH____wAAAAf___4AAAAA___wAAAAAA__gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 52,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAP_______AD_______wA_______8AP_______AD_______wA_______8AP_______AD_______wA_______8AP_______AD_______wA_______8AP_______AD_______wA_______8AP_______AD_______gAAAAAf__4AAAAAH__-AAAAAB___gAAAAA___wAAAAAP__8AAAAAH___AAAAAB___gAAAAAf__4AAAAAP__-AAAAAD___AAAAAB___wAAAAAf__8AAAAAP__-AAAAAD___gAAAAA___wAAAAAf__8AAAAAH__-AAAAAD___gAAAAA___4AAAAAP__8AAAAAH___AAAAAB___gAAAAA___4AAAAAP__-AAAAAD___AAAAAB___wAAAAAf__4AAAAAH__-AAAAAD___gAAAAA___wAAAAAf__8AAAAAH___AAAAAB___gAAAAA___4AAAAAP__-AAAAAD___AAAAAB___wAAAAAf__8AAAAAH__-AAAAAD___gAAAAA___4AAAAAP__8AAAAAH___AAAAAB___wAAAAAf__4AAAAAH__-AAAAAD___gAAAAA___4AAAAAP__8AAAAAD___AAAAAB___wAAAAAf__8AAAAAH___AAAAAB___gAAAAA___4AAAAAP__-AAAAAD___gAAAAA___4AAAAAP__8AAAAAH___AAAAAB___wAAAAAf__8AAAAAH___AAAAAB___wAAAAAf__4AAAAAP__-AAAAAD___gAAAAA___4AAAAAP__-AAAAAD___gAAAAA___4AAAAAP__-AAAAAD___gAAAAA___wAAAAAP__8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 54,
      "bits": "AAAAAAAAAAAAAAAAAAAAAA__gAAAAAD___gAAAAH____AAAAH____4AAAD_____gAAB_____8AAA______gAAf_____8AAP______gAH______4AB_______AAf______wAP______-AD_______gB_______4Af______-AH_______wB___w___8Af__4D___AH__-A___wB___AH__8A___wB___AP__8Af__wD___AH__8A___wB___AP__8Af__wD___AH__8A___wB___AH__8Af__wB___AH__8Af__wB___AH__-A___wB___gP__8Af__8P__-AD_______gA_______4AP______8AB_______AAP______gAD______wAAP_____4AAB_____8AAAf____-AAAP_____4AAH______AAD______4AB_______AAf______wAP______-AD_______gB_______8Af__8H___AH__-A___wB___AP__8Af__wB___AH__8Af__wD___AH__8A___wB___AP__8Af__wD__-AH__8A___gB___AP__4Af__wD__-AH__8A___gB___AP__4Af__wD__-AH__8A___gB___AP__4Af__wD__-AH__8A___wB___AH__8Af__wB___AH__8Af__wB___AH__8A___wB___gP__8Af__8H___AH_______gA_______4AP______-AD_______gAf______wAH______8AB______-AAP______gAD______wAAf_____8AAD_____-AAAf_____AAAD_____gAAAf____wAAAD____4AAAAP___4AAAAA___4AAAAAA__gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 55,
      "bits": "AAAAAAAAAAAAAAAAAAAAAA__gAAAAAD___gAAAAD___-AAAAD____4AAAB_____gAAA_____8AAAf_____gAAP_____4AAH______AAD______4AA______-AAf______wAH______8AD_______gA_______4AP______-AH_______gB___wf__8Af__4D___AH__-A___wB___AH__8A___wB___AP__8Af__wD___AH__8A___wB___AP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___wB___gP__8Af__4D___AH__-A___4D___gP__-A___4B___wf__-Af_______gH_______4B_______-Af_______gD_______4A_______-AP_______gB_______4Af______-AD_______gAf______4AH______-AAf__9___gAD__-f__4AAP_-H__-AAAf-B___gAAAAAf__4AAAAAH__-AAAAAB___gAAAAAf__4AAAAAH__8AAAAAB___AAAAAAf__wAAAAAH__8Af__gB___AH__4Af__wB__-AH__8Af__gB___AH__4Af__wB__-AH__8Af__gB___AH__4Af__wB___AH__4Af__wD__-AH__8A___gB___w___4Af______-AD_______AA_______wAP______8AD______-AAf______gAH______wAA______4AAH_____-AAA______AAAH_____gAAA_____wAAAH____wAAAAf___4AAAAA___wAAAAAA__AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     }
    }
   }
  },
  "bebas": {
   "a": {
    "strip_h": 72,
    "digit_h": 66,
    "ring": 2,
    "shadow": 2,
    "cell_w": 40,
    "glyphs": {
     "0": {
      "w": 37,
      "bits": "AAAAAAAAAAAAAAAH_AAAAD__gAAA___gAAH___AAA___-AAH___8AA____4AD____gAf___-AB_-H_8AH_wH_wA_-AP_AD_4A_-AP_AD_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AD_4A_-AP_gD_4A_8AH_wH_wAf_x__AB____8AD____gAP___-AAf___wAA___-AAB___wAAD__-AAAD__gAAAB_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 27,
      "bits": "AAAAAAAAAAAAAAAAAAD-AAAA_gAAAf4AAAH-AAAD_gAAB_4AAB_-AAD__gA___4AP__-AD___gA___4AP__-AD___gA___4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4AAAf-AAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 36,
      "bits": "AAAAAAAAAAAAAAAP-AAAAH__AAAB___AAAP__-AAB___8AAP___4AA____wAH____AAf___-AD_8P_4AP_gP_gA_8Af-AD_wB_8AP-AH_wA_4AP_AD_gA_8AP-AD_wA_4AP_AD_gB_8AP-AH_wA_4Af-AD_gB_4AAAAH_gAAAA_-AAAAD_wAAAAf_AAAAB_4AAAAP_gAAAB_8AAAAH_wAAAA_-AAAAH_4AAAA__AAAAH_4AAAAf_AAAAD_8AAAAf_gAAAD_8AAAAf_gAAAD_8AAAAf_gAAAB_8AAAAP_gAAAB_8AAAAH_wAAAA_-AAAAD_wAAAAf-AAAAB_4AAAAH_gAAAA_8AAAAD_wAAAAP_AAAAA_8AAAAD_wAAAAP_AAAAA____-AD____4AP____gA____-AD____4AP____gA____-AD____4AP____gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 36,
      "bits": "AAAAAAAAAAAAAAAH_AAAAD__gAAA___AAAH___AAA___-AAH___4AA____wAD____AAf___-AB_-P_4AH_gP_gAf-Af_AB_wB_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AAAAD_wAAAAP_AAAAA_8AAAAD_wAAAAf-AAAAB_4AAAAP_gAAAB_8AAAP__wAAA__-AAAD__wAAAP_8AAAA__gAAAD__gAAAP__gAAA__-AAAD__8AAAAP_4AAAAP_gAAAAf-AAAAB_8AAAAD_wAAAAP_AAAAA_8AAAAD_wAAAAP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wB_8AH_gP_wAf_h_-AB____4AD____gAP___8AAf___wAB___-AAD___wAAD__-AAAH__gAAAD_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAH_wAAAAAP_wAAAAAP_wAAAAAf_wAAAAAf_wAAAAA__wAAAAA__wAAAAA__wAAAAB__wAAAAB__wAAAAD__wAAAAD__wAAAAH__wAAAAH__wAAAAH__wAAAAP__wAAAAP__wAAAAf__wAAAAf7_wAAAA_7_wAAAA_7_wAAAA_z_wAAAB_z_wAAAB_j_wAAAD_j_wAAAD_j_wAAAH_D_wAAAH_D_wAAAH-D_wAAAP-D_wAAAP-D_wAAAf8D_wAAAf8D_wAAA_4D_wAAA_4D_wAAA_4D_wAAB_wD_wAAB_wD_wAAD_gD_wAAD_gD_wAAH_gD_wAAH_AD_wAAH_AD_wAAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAAAAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 37,
      "bits": "AAAAAAAAAAAAAAAAAAAAD____gAP___-AA____4AD____gAP___-AA____4AD____gAP___-AA____4AD_gAAAAP-AAAAA_4AAAAD_gAAAAP-AAAAA_4AAAAD_gAAAAf-AAAAB_4AAAAH_gAAAAf-AAAAB_4f8AAH_j_8AAf-__4AB____wAH____AAf___-AB____4AH____wAf____AB_-D_8AH_wH_wAf-AP_gB_wA_-AH_AD_4Af8AH_gD_wAf-AAAAB_4AAAAH_gAAAAf-AAAAB_4AAAAH_gAAAAf-AAAAB_4AAAAH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gB_wA_-AH_AD_4Af8AP_AB_4A_8AH_wH_wAf_h__AA____4AD____gAH___-AAf___wAA___-AAB___wAAD__-AAAD__gAAAB_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 37,
      "bits": "AAAAAAAAAAAAAAAH_AAAAD__gAAA___gAAH___AAA___-AAH___8AA____4AD____gAP____AB__D_8AH_wD_wAf-AP_AB_4Af-AP_gB_4A_-AH_gD_wAf-AP_AB_4A_8AAAAD_wAAAAP_AAAAA_8AAAAD_wAAAAP_AAAAA_8AAAAD_wP8AAP_D_8AA_8f_4AD_z__wAP_f__gA____-AD____8AP____wA_____AD_-D_-AP_wD_4A_-AP_gD_4Af-AP_gB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_gB_4Af-AH_gB_4A_-AH_wH_wAf_w__AA____8AD____gAH___-AAf___wAA___-AAB___wAAD__-AAAD__gAAAB_4AAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 36,
      "bits": "AAAAAAAAAAAAAAAAAAAAP____wA_____AD____8AP____wA_____AD____8AP____wA_____AD____8AAAAD_wAAAAP_AAAAA_8AAAAD_gAAAAf-AAAAB_4AAAAH_gAAAA_8AAAAD_wAAAAP_AAAAB_4AAAAH_gAAAAf-AAAAB_4AAAAP_AAAAA_8AAAAD_wAAAAf-AAAAB_4AAAAH_gAAAAf-AAAAD_wAAAAP_AAAAA_8AAAAH_gAAAAf-AAAAB_4AAAAP_gAAAA_8AAAAD_wAAAAP_AAAAB_4AAAAH_gAAAAf-AAAAD_4AAAAP_AAAAA_8AAAAD_wAAAAf-AAAAB_4AAAAH_gAAAA_-AAAAD_wAAAAP_AAAAB_8AAAAH_gAAAAf-AAAAB_4AAAAP_gAAAA_8AAAAD_wAAAAf_AAAAB_4AAAAH_gAAAA_-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 37,
      "bits": "AAAAAAAAAAAAAAAH_AAAAD__gAAA___gAAH___AAA___-AAH___8AA____4AD____gAf____AB_-H_8AH_wH_wA_-AP_AD_wA_-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_wA_8AP_AB_4A_8AH_gH_wAP_g_-AA____4AB____AAD___4AAH___AAAP__4AAD___wAAf___wAD____AAP___-AB__H_8AH_wH_wA_-AP_AD_wA_-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AH_gD_wAf-AP_AB_4A_8AP_gD_4A_-AP_wH_4A__x__AB____8AH____wAP___-AA____wAB____AAD___wAAD__-AAAH__gAAAD_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 36,
      "bits": "AAAAAAAAAAAAAAAP_AAAAH__gAAA___gAAP___AAB___-AAH___8AA____wAH____gAf___-AB_-H_8AP_gH_wA_-AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_4A_8AP_gH_wA__g__AD____8AH____wAf____AB____8AD____wAH__v_AAP_8_8AAf_j_wAAf4P_AAAAA_8AAAAD_wAAAAP_AAAAA_8AAAAD_wAAAAP_AAAAA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wA_8AP_AD_wB_8AH_gH_wAf_h__AB____4AD____gAP___8AAf___wAB___-AAD___wAAD__-AAAH__gAAAD_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     ":": {
      "w": 16,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD_wP_A_8D_wP_A_8D_wP_A_8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_8D_wP_A_8D_wP_A_8D_wP_AAAAAAAAAAAAAA"
     }
    }
   },
   "b": {
    "strip_h": 100,
    "digit_h": 94,
    "ring": 2,
    "shadow": 2,
    "cell_w": 64,
    "glyphs": {
     "0": {
      "w": 50,
      "bits": "AAAAAAAAAAAAAAAAAAAAAB_8AAAAAAH__8AAAAAH___wAAAAH___-AAAAD____4AAAD_____AAAB_____4AAAf_____AAAP_____wAAH_____-AAB______wAA______8AAP______AAD__4H__4AB__8Af_-AAf_8AD__gAH__AAf_4AB__gAH__AAf_4AB__wAP_-AAf_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAH__AAf_4AB__wAH_-AAf_8AB__wAH_-AAf_8AD__gAH__gB__4AA__-B__-AAP______AAD______wAAf_____8AAH_____-AAA______AAAH_____wAAB_____4AAAP____8AAAA____-AAAAH____AAAAAf___AAAAAB___AAAAAAB_8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 36,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAD_wAAAAP_AAAAB_8AAAAH_wAAAA__AAAAD_8AAAAf_wAAAD__AAAAf_8AAAD__wAAA___AAA___8AP____wA_____AD____8AP____wA_____AD____8AP____wA_____AD____8AP____wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 49,
      "bits": "AAAAAAAAAAAAAAAAAAAAAD_4AAAAAAP__4AAAAAP___gAAAAP___-AAAAH____wAAAD____-AAAB_____wAAA_____-AAAP_____wAAH_____8AAB______gAA______4AAP_____-AAH__wP__wAB__wA__8AAf_8AH__AAH_-AB__4AD__AAP_-AA__wAD__gAP_8AA__4AD__AAP_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAP_-AA__wAD__gAP_8AA__4AD__AAP_8AA__wAD__AAP_8AB__wAAAAAAf_8AAAAAAH_-AAAAAAD__gAAAAAA__4AAAAAAf_8AAAAAAH__AAAAAAD__wAAAAAA__4AAAAAAf_-AAAAAAP__AAAAAAH__gAAAAAB__4AAAAAA__8AAAAAAf_-AAAAAAP__gAAAAAH__wAAAAAB__4AAAAAA__8AAAAAAf__AAAAAAP__gAAAAAH__wAAAAAD__4AAAAAB__8AAAAAA__-AAAAAAf__AAAAAAH__wAAAAAD__4AAAAAB__8AAAAAA__-AAAAAAP__AAAAAAH__gAAAAAB__wAAAAAA__4AAAAAAP_-AAAAAAH__AAAAAAB__gAAAAAA__4AAAAAAP_8AAAAAAD__AAAAAAB__gAAAAAAf_4AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAP_8AAAAAAD__AAAAAAA__wAAAAAAP_8AAAAAAD______8AA_______AAP______wAD______8AA_______AAP______wAD______8AA_______AAP______wAD______8AA_______AAP______wAD______8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 49,
      "bits": "AAAAAAAAAAAAAAAAAAAAAD_4AAAAAAH__4AAAAAP___gAAAAH___-AAAAD____wAAAD____-AAAA_____wAAAf____-AAAP_____wAAH_____8AAB______gAAf_____4AAP_____-AAD__4P__wAA__4A__8AAf_8AH__AAH_-AB__wAB__gAP_-AAf_4AD__gAH_8AA__4AB__AAP_-AAf_wAD__gAH_8AA__4AB__AAP_-AAf_wAD__gAH_8AA__4AB__AAP_-AAAAAAD__gAAAAAA__4AAAAAAP_-AAAAAAD__gAAAAAA__wAAAAAAP_8AAAAAAD__AAAAAAB__wAAAAAAf_4AAAAAAP_-AAAAAAf__AAAAAf___wAAAAH___4AAAAB___8AAAAAf__-AAAAAH__-AAAAAB__-AAAAAAf__wAAAAAH___AAAAAB___4AAAAAf___AAAAAH___4AAAAB____AAAAAf___4AAAAAB__-AAAAAAH__wAAAAAA__8AAAAAAH__AAAAAAA__wAAAAAAP_-AAAAAAD__gAAAAAAf_4AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAH_-AAAAAAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AAf_wAD__gAH_-AA__4AB__gAP_-AAf_8AH__gAH__gD__wAA__-D__8AAP______AAD______gAAf_____4AAH_____8AAA______AAAP_____gAAB_____wAAAP____4AAAB____8AAAAH___-AAAAA___-AAAAAD__-AAAAAAD_4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 55,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD__wAAAAAA__8AAAAAAf__AAAAAAH__wAAAAAD__8AAAAAA___AAAAAAf__wAAAAAH__8AAAAAB___AAAAAA___wAAAAAP__8AAAAAH___AAAAAB___wAAAAA___8AAAAAP___AAAAAD___wAAAAB___8AAAAAf___AAAAAP___wAAAAD___8AAAAB____AAAAAf___wAAAAH___8AAAAD____AAAAA____wAAAAf___8AAAAH____AAAAB____wAAAA__f_8AAAAP_3__AAAAH_9__wAAAB_-f_8AAAA__n__AAAAP_x__wAAAD_8f_8AAAB__H__AAAAf_h__wAAAP_4f_8AAAD_8H__AAAB__B__wAAAf_wf_8AAAH_4H__AAAD_-B__wAAA__Af_8AAAf_wH__AAAH_8B__wAAB_-Af_8AAA__gH__AAAP_wB__wAAH_8Af_8AAB__AH__AAA__gB__wAAP_4Af_8AAD_8AH__AAB__AB__wAAf_wAf_8AAP_4AH__AAD_-AB__wAB__AAf_8AAf_wAH__AAH_8AB__wAD_-AAf_8AA________gP_______4D_______-A________gP_______4D_______-A________gP_______4D_______-A________gP_______4D_______-A________gAAAAB__wAAAAAAf_8AAAAAAH__AAAAAAB__wAAAAAAf_8AAAAAAH__AAAAAAB__wAAAAAAf_8AAAAAAH__AAAAAAB__wAAAAAAf_8AAAAAAH__AAAAAAB__wAAAAAAf_8AAAAAAH__AAAAAAB__wAAAAAAf_8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 49,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAB______gAA______4AAP_____-AAD______gAA______4AAP_____-AAD______gAA______4AAP_____-AAD______gAA______4AAP_____-AAD______gAA__gAAAAAAP_4AAAAAAD_-AAAAAAA__gAAAAAAP_4AAAAAAD_-AAAAAAA__gAAAAAAP_4AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAH_-AAAAAAB__gH-AAAAf_4P_8AAAH_-P__wAAB__H__-AAAf_z___wAAH_9___-AAB__f___wAAf_____8AAH______gAB______4AAf_____-AAH______wAD______8AA___A___AAP__AD__wAD__gAf_-AA__4AH__gAP_8AA__4AD__AAP_-AA__wAD__gAP_8AA__4AD__AAH_-AA__wAB__gAAAAAAf_4AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAH_-AAAAAAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAD__gAP_8AA__4AD__AAP_-AA__wAD__gAP_8AA__4AB__gAf_8AAf_4AH__AAH__AD__wAB__8D__8AAP_____-AAD______gAA______wAAH_____8AAA_____-AAAP_____gAAB_____wAAAP____4AAAB____8AAAAP___-AAAAA___-AAAAAD__-AAAAAAD_4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 49,
      "bits": "AAAAAAAAAAAAAAAAAAAAAD_4AAAAAAP__4AAAAAP___gAAAAP___-AAAAH____wAAAD____-AAAB_____wAAA_____-AAAf_____wAAH_____8AAD______gAA______4AAf______AAH__4H__wAB__4Af_8AAf_8AD__AAP_-AA__4AD__gAH_-AA__4AB__gAP_-AAf_4AD__AAH_-AA__wAA__gAP_8AAP_4AD__AAD_-AA__wAA__gAP_8AAAAAAD__AAAAAAA__wAAAAAAP_8AAAAAAD__AAAAAAA__wAAAAAAP_8AAAAAAD__AAAAAAA__wAAAAAAP_8Af8AAAD__A__4AAA__wf__gAAP_8f__8AAD__H___gAA__z___8AAP_9____AAD__f___4AA______-AAP______wAD______8AA_______AAP______4AD__-B__-AA__-AP__gAP__AB__4AD__gAP_-AA__4AD__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_8AAf_4AD__AAH_-AA__wAB__gAP_-AA__4AD__gAP_-AA__8AH__gAH__gD__wAB__-D__8AAf______AAD______gAA______4AAH_____8AAB______AAAP_____gAAB_____wAAAP____4AAAB____8AAAAP___-AAAAA___-AAAAAD__-AAAAAAD_4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 50,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAP______8AD_______AA_______wAP______8AD_______AA_______wAP______8AD_______AA_______wAP______8AD_______AA_______wAP______8AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAH_-AAAAAAD__AAAAAAA__wAAAAAAP_8AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAP_-AAAAAAD__AAAAAAA__wAAAAAAP_8AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAP_-AAAAAAD__AAAAAAA__wAAAAAAP_8AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAP_-AAAAAAD__AAAAAAA__wAAAAAAP_8AAAAAAH_-AAAAAAB__gAAAAAAf_4AAAAAAP_-AAAAAAD__AAAAAAA__wAAAAAAf_8AAAAAAH__AAAAAAB__gAAAAAAf_4AAAAAAP_-AAAAAAD__AAAAAAA__wAAAAAAf_8AAAAAAH__AAAAAAB__gAAAAAAf_4AAAAAAP_-AAAAAAD__AAAAAAA__wAAAAAAf_8AAAAAAH__AAAAAAB__gAAAAAA__4AAAAAAP_-AAAAAAD__AAAAAAA__wAAAAAAf_8AAAAAAH__AAAAAAB__gAAAAAA__4AAAAAAP_-AAAAAAD__AAAAAAA__wAAAAAAf_8AAAAAAH__AAAAAAB__gAAAAAA__4AAAAAAP_-AAAAAAD__AAAAAAA__wAAAAAAf_8AAAAAAH__AAAAAAB__gAAAAAA__4AAAAAAP_-AAAAAAD__AAAAAAB__wAAAAAAf_8AAAAAAH__AAAAAAD__gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 51,
      "bits": "AAAAAAAAAAAAAAAAAAAAAD_8AAAAAAH__8AAAAAP___wAAAAH____AAAAH____4AAAD_____AAAB_____4AAA______AAAP_____4AAH_____-AAB______wAA______8AAP______gAH__4H__4AB__4Af_-AAf_8AD__wAH__AAf_8AD__gAH__AA__4AB__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAP_-AAP_8AD__gAD__AA__4AA__wAH_-AAP_8AB__gAH__AAf_4AB__gAH__AAf_4AA__wAP_-AAP_-AH__AAB__4H__wAAf_____4AAD_____8AAAf_____AAAD_____gAAAf____gAAAD____wAAAA____8AAAAf____gAAAP____-AAAH_____wAAD_____-AAB______gAA______8AAP__gf__gAH__gB__4AB__wAP_-AAf_8AB__wAP_-AAf_8AD__gAD__AA__wAA__wAP_8AAP_8AD__AAD__gA__wAA__4AP_8AAP_-AD__AAD__gA__wAA__4AP_8AAP_-AD__AAD__gA__wAA__4AP_8AAP_-AD__AAD__gA__wAA__4AP_8AAP_-AD__AAD__gA__wAA__4AP_8AAP_-AD__AAD__gA__4AA__wAP_-AAf_8AD__wAH__AA__8AD__wAH__gB__8AB__-B__-AAf______gAD______4AA______8AAH______AAB______gAAP_____wAAB_____4AAAP____-AAAB____-AAAAP____AAAAA____AAAAAD___AAAAAAD_8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 50,
      "bits": "AAAAAAAAAAAAAAAAAAAAAD_4AAAAAAP__4AAAAAP___gAAAAP___-AAAAH____wAAAD_____AAAB_____wAAA_____-AAAP_____wAAH_____-AAD______gAA______8AAP______AAH__4H__wAB__4Af_-AAf_8AD__gAP_-AA__4AD__gAH_-AA__4AB__gAP_-AAf_8AD__AAH__AA__wAB__wAP_8AAf_8AD__AAH__AA__wAB__wAP_8AAf_8AD__AAH__AA__wAB__wAP_8AAf_8AD__AAH__AA__wAB__wAP_8AAf_8AD__AAH__AA__wAB__wAP_8AAf_8AD__AAH__AA__wAB__wAP_8AAf_8AD__AAH__AA__wAB__wAP_8AAf_8AD__gAH__AA__4AB__wAP_-AA__8AD__wAP__AA__-AH__wAH__4H__8AB_______AAf______wAH______8AA_______AAP______wAB______8AAf___3__AAD___9__wAAf__-f_8AAD___H__AAAf__h__wAAD__gf_8AAAH_gH__AAAAAAB__wAAAAAAf_8AAAAAAH__AAAAAAB__wAAAAAAf_8AAAAAAH__AAAAAAB__wAAAAAAf_8AAAAAAH__AA__wAB__wAP_8AAf_8AD__AAH__AA__wAB__wAP_8AAf_8AD__AAH_-AA__wAB__gAH_8AA__4AB__gAP_-AAf_8AH__gAH__gD__4AB__-D__8AAP______AAD______wAAf_____4AAH_____-AAA______AAAP_____gAAB_____4AAAP____8AAAB____-AAAAH___-AAAAA____AAAAAD__-AAAAAAD_4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     }
    }
   }
  },
  "barlow": {
   "a": {
    "strip_h": 72,
    "digit_h": 61,
    "ring": 2,
    "shadow": 2,
    "cell_w": 40,
    "glyphs": {
     "0": {
      "w": 39,
      "bits": "AAAAAAAAAAAAAAAAQAAAAA__AAAAf__gAAD___AAAf__-AAD___8AAf___4AD____wAP____AB____-AH____4A__g__wD_-B__AP_wD_8A__AP_wD_4Af_AP_gB_-A_-AH_4D_4Af_gP_gB_-A_-AH_4D_4Af_gP_gB_-A_-AH_4D_4Af_gP_gB_-A_-AH_4D_4Af_gP_gB_-A_-AH_4D_4Af_gP_gB_-A_-AH_4D_4Af_gP_gB_-A_-AH_4D_4Af_gP_gB_-A_-AH_4D_4Af_gP_gB_-A_-AH_4D_4Af_gP_gB_-A_-AH_4D_4Af_AP_wD_8A__AP_wD_-B__AP_4H_8Af____gB____-AD____wAP____AAf___4AA____AAB___4AAD___AAAH__4AAAD_8AAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 26,
      "bits": "AAAAAAAAAAAAAAAAAH_8AAP__AAP__wAP__8AD___AA___wAP__8AD___AA___wAP__8AD___AA___wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAP_wAAD_8AAA__AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 39,
      "bits": "AAAAAAAAAAAAAAAAIAAAAA__gAAAP__gAAD___AAAf___AAD___-AAf___4AD____wAP____gB____-AH____4Af_wf_wD_-B__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8Af_AP_wAAAA__AAAAH_8AAAAf_wAAAD_-AAAAP_4AAAB__AAAAH_8AAAA__wAAAH_-AAAAf_wAAAD__AAAAf_4AAAB__gAAAP_8AAAB__gAAAP_8AAAA__wAAAH_-AAAA__wAAAH_-AAAAf_4AAAD__AAAAf_4AAAD__AAAAP_8AAAB__gAAAP_8AAAB__gAAAP_-AAAA_____4D_____gP____-A_____4D_____gP____-A_____4D_____gP____-A_____4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 38,
      "bits": "AAAAAAAAAAAAAAAAAAAAH____8Af____wB_____AH____8Af____wB_____AH____8Af____wB_____AH____8AAAB__wAAAH_-AAAA__wAAAH_-AAAA__wAAAH__AAAAf_4AAAD__AAAAf_4AAAD__gAAAf_8AAAB__gAAAP_8AAAB__8AAAH__8AAAP__4AAAf__wAAA___gAAB___AAADB_8AAAAH_4AAAAP_gAAAA_-AAAAD_4AAAAP_wAAAAf_AAAAB_8AAAAH_wAAAAf_AAAAB_8A__AH_wD_8Af_AP_wB_8A__AH_wD_8A__AP_wD_8A__AP_wD_-B_-AP_8H_4Af____gB____-AD____wAP____AAf___4AB____AAB___4AAD___AAAH__4AAAD_-AAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 44,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAP_wAAAAAf_wAAAAAf_wAAAAAf_gAAAAA__gAAAAA__gAAAAA__AAAAAB__AAAAAB__AAAAAB__AAAAAD_-AAAAAD_-AAAAAD_-AAAAAH_8AAAAAH_8AAAAAH_8AAAAAP_4AAAAAP_4AAAAAP_4AAAAAf_wAAAAAf_wAAAAAf_wAAAAA__gAAAAA__gf_AAA__gf_AAB__Af_AAB__Af_AAB__Af_AAD__Af_AAD_-Af_AAD_-Af_AAH_-Af_AAH_8Af_AAH_8A__gAP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 38,
      "bits": "AAAAAAAAAAAAAAAAAAAAP____4A_____gD____-AP____4A_____gD____-AP____4A_____gD____-AP____4A__AAAAD_4AAAAP_gAAAA_-AAAAD_4AAAAP_gAAAA_-AAAAD_4AAAAP_gAAAA_-AAAAD_4AAAAP_gAAAA_-D-AAD_4__AAP_v_-AA____8AD____4AP____wA_____AD____8AP____4A_____gD__H_-AP_wH_4A__Af_wD_4A__AAAAD_8AAAAP_wAAAA__AAAAD_8AAAAP_wAAAA__AAAAD_8A__AP_wD_8A__AP_wD_8A__Af_wD_-B__AP_4P_4Af____gB____-AH____wAP____AA____4AB____gAD___8AAH___AAAH__4AAAH_-AAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 38,
      "bits": "AAAAAAAAAAAAAAAAQAAAAB__AAAAf__AAAH___AAA___-AAH___8AA____4AD____gAf____AB____8AP____4A__g__gD_8D_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8A_-AP_wAAAA__AAAAD_8AAAAP_x_AAA__f_gAD____AAP___-AA____8AD____4AP____wA_____AD____-AP_8P_4A__gf_gD_8B_-AP_wD_4A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__Af_wD_-B__AP_4P_8Af____gB____-AH____4AP____AAf___4AB____gAD___8AAH___gAAH__4AAAH_-AAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 38,
      "bits": "AAAAAAAAAAAAAAAAAAAAP____8A_____wD_____AP____8A_____wD_____AP____8A_____wD_____AP____8A_8AP_wD_wB__AP_AH_8A_8Af_gB_gB_-AAAAP_4AAAA__gAAAD_8AAAAf_wAAAB__AAAAH_4AAAAf_gAAAD_-AAAAP_wAAAA__AAAAH_8AAAAf_wAAAB_-AAAAP_4AAAA__gAAAD_8AAAAP_wAAAB__AAAAH_8AAAAf_gAAAD_-AAAAP_4AAAA__AAAAD_8AAAAf_wAAAB__AAAAH_4AAAA__gAAAD_-AAAAP_wAAAA__AAAAH_8AAAAf_gAAAB_-AAAAP_4AAAA__gAAAD_8AAAAf_wAAAB__AAAAH_4AAAAf_gAAAD_-AAAAP_4AAAA__AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 37,
      "bits": "AAAAAAAAAAAAAAAAQAAAAB__AAAAf__AAAH___AAA___-AAH___8AA____wAD____gAf____AB____8AP____wA__g__gD_8D_-AP_wH_4A__Af_gD_4A_-AP_gD_4A_-AP_gD_4A_-AP_gD_4A__Af_gD_8B_-AP_wH_4Af_g__AB__H_8AD____gAP___8AAf___wAA___8AAA___wAAP___gAB____AAP___-AA____4AH_8f_wAf_g__AD_8B_8AP_wH_4A__Af_gD_4A_-AP_gD_4A_-AP_gD_4A_-AP_gD_4A_-AP_gD_4B_-AP_wH_4A__Af_gD_8B_-AP_4P_wAf____AB____8AD____gAP___-AAf___wAA___-AAB___wAAD__-AAAH__wAAAH_4AAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 38,
      "bits": "AAAAAAAAAAAAAAAAQAAAAB__AAAAf__AAAH___AAA___-AAH___8AA____4AH____wAf____AB____8AP____4A__g__gD_-B_-AP_wH_4A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__Af_wD_-B__AH_8P_8Af____wB_____AD____8AP____wAf____AA____8AB____wAB_8__AAB_D_8AAAAP_wAAAA__AAAAD_8AAAAP_wD_8A__AP_wD_8A__AP_wD_8A__AP_wD_8A__gf_wB_-B__AH_8P_4Af____gB____-AD____wAP____AAf___4AA____AAB___4AAD___AAAH__4AAAD_8AAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     ":": {
      "w": 19,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-AAD_gAH_wAH_4AP_4AP_4AP_4AP_4AP_4AH_4AH_wAD_gAA-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-AAD_gAH_wAH_4AP_4AP_4AP_4AP_4AP_4AH_4AH_wAD_gAA-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     }
    }
   },
   "b": {
    "strip_h": 100,
    "digit_h": 93,
    "ring": 2,
    "shadow": 2,
    "cell_w": 64,
    "glyphs": {
     "0": {
      "w": 57,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAA_-AAAAAAAA___gAAAAAAf___gAAAAAD____gAAAAA_____gAAAAH_____AAAAA_____-AAAAH_____8AAAA______4AAAH______wAAA_______gAAD______-AAAf______8AAD_______wAAP_______gAA_______-AAH___A___8AAf__4A___wAB___AB___AAP__4AH__8AA___gAP__4AD__-AA___gAP__wAD__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAB__-AA___AAH__4AD__8AAf__gAP__wAD__-AA___gAP__4AD__-AA___gAH__4AH__8AAf__wAf__wAB___gD___AAH___A___8AAP_______gAA_______-AAD_______wAAH_______AAAP______4AAA_______gAAB______8AAAD______gAAAH_____8AAAAP_____gAAAAf____8AAAAA_____gAAAAB____4AAAAAB___-AAAAAAA___gAAAAAAAf_gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 37,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAP__4AAH___gAB___-AA____4AP____gD____-AP____4A_____gD____-AP____4A_____gD____-AP____4A_____gD____-AP____4Af____gB____-AH4H__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAf__gAAB__-AAAH__4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 58,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAA__AAAAAAAA___gAAAAAAP___wAAAAAD____gAAAAA_____gAAAAH_____AAAAA_____-AAAAH_____8AAAA______4AAAH______wAAA_______AAAD______-AAAf______8AAD_______wAAP_______AAA_______-AAH___A___4AAf__4B___gAB___AD___AAH__8AH__8AA___gAf__wAD__-AB___AAP__4AD__8AA___gAP__wAD__-AA___AAP__4AD__8AA___gAP__wAD__-AB___AAP__4AH__8AA___gAf__wAD__8AB___AAAAAAAH__8AAAAAAA___wAAAAAAD__-AAAAAAAP__4AAAAAAB___gAAAAAAH__-AAAAAAA___wAAAAAAD___AAAAAAAf__8AAAAAAB___gAAAAAAP__-AAAAAAB___wAAAAAAH___AAAAAAA___4AAAAAAD___gAAAAAAf__8AAAAAAD___gAAAAAAP__-AAAAAAB___wAAAAAAP___AAAAAAB___4AAAAAAH___AAAAAAA___8AAAAAAH___gAAAAAA___8AAAAAAD___gAAAAAAf__-AAAAAAD___wAAAAAAf__-AAAAAAB___wAAAAAAP__-AAAAAAB___4AAAAAAP___AAAAAAA___4AAAAAAH___AAAAAAA___8AAAAAAH___gAAAAAA___8AAAAAAD___gAAAAAAf__-AAAAAAD___wAAAAAAf__-AAAAAAB___wAAAAAAP__-AAAAAAB___4AAAAAAH_______-AAf_______8AB________wAH________AAf_______8AB________wAH________AAf_______8AB________wAH________AAf_______8AB________wAH________AAf_______8AB________wAH_______-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 56,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAD_______4A_______-AP_______gD_______4A_______-AP_______gD_______4A_______-AP_______gD_______4A_______-AP_______gD_______4A_______-AP_______gD_______4AAAAAf__-AAAAAP___AAAAAH___gAAAAD___4AAAAA___8AAAAAf__-AAAAAP___AAAAAH___gAAAAD___4AAAAA___8AAAAAf__-AAAAAP___AAAAAH___gAAAAD___4AAAAA___8AAAAAf__-AAAAAP___AAAAAH___gAAAAD___4AAAAB___8AAAAAf___8AAAAH____wAAAA____-AAAAH____4AAAA_____AAAAH____wAAAA____-AAAAH____wAAAA_v__8AAAAHAf__gAAAAgD__4AAAAAA___AAAAAAH__wAAAAAB__8AAAAAAf__gAAAAAD__4AAAAAA__-AAAAAAP__gAAAAAD__4AAAAAA__-AAAAAAP__gAAAAAD__4AAAAAA__-AAAAAAP__gAAAAAD__4AAAAAA___A___AAP__wP__wAD__8D__8AA__-A___AAP__gP__wAD__4D__8AA__-A___gAP__gP__4AD__4D__-AB__-A___gAf__gP__8AH__4B___AD__-Af__4B___gH___A___wB_______8AP_______AD_______gA_______4AH______-AB_______AAP______gAB______4AAP_____8AAB_____-AAAP_____AAAB_____gAAAH____gAAAAf___gAAAAB___gAAAAAB_-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 65,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP__4AAAAAAAAf__4AAAAAAAAf__4AAAAAAAAf__wAAAAAAAA___wAAAAAAAA___wAAAAAAAA___gAAAAAAAB___gAAAAAAAB___gAAAAAAAB___AAAAAAAAD___AAAAAAAAD___AAAAAAAAD__-AAAAAAAAH__-AAAAAAAAH__-AAAAAAAAH__8AAAAAAAAP__8AAAAAAAAP__8AAAAAAAAP__8AAAAAAAAf__4AAAAAAAAf__4AAAAAAAAf__4AAAAAAAA___wAAAAAAAA___wAAAAAAAA___wAAAAAAAB___gAAAAAAAB___gAAAAAAAB___gAAAAAAAD___AAAAAAAAD___AAAAAAAAD___AAAAAAAAH__-AAAAAAAAH__-AAAAAAAAH__-AAAAAAAAP__8AAAAAAAAP__8AAAAAAAAP__8Af__AAAAf__4Af__gAAAf__4Af__gAAAf__4Af__gAAA___wAf__gAAA___wAf__gAAA___wAf__gAAB___gAf__gAAB___gAf__gAAB___gAf__gAAD___AAf__gAAD___AAf__gAAD___AAf__gAAH___AAf__gAAH__-AA___gAAH_________gAH_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAAAAAAA___gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__gAAAAAAAAf__AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 56,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAP_______4D_______-A________gP_______4D_______-A________gP_______4D_______-A________gP_______4D_______-A________gP_______4D_______-A________gP_______wD__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wAAAAAD__8A_8AAA___B__4AAP__w___gAD__8___8AA___f___gAP______8AD_______gA_______8AP_______AD_______4A_______-AP_______wD_______8A________AP_______4D_______-A___8D___gP__8Af__4D__-AD__-A___gAf__gP__4AH__8B__8AB___AAAAAAf__wAAAAAH__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wH__wAD__8D__-AA___A___gAf__wP__4AH__8D__-AB___Af__gAf__wH__8AP__8B___AD__-Af__4B___gH___A___4A_______-AP_______gD_______wAf______8AH______-AA_______gAP______wAB______4AAP_____-AAB______AAAP_____gAAB_____gAAAH____wAAAA____wAAAAB___gAAAAAB_-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 56,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAf_gAAAAAB___AAAAAB___-AAAAB____4AAAB_____AAAA_____4AAAf_____AAAP_____4AAH______AAD______4AB_______AAf______wAP______-AD_______gB_______8Af_______AH___B___wB___gP__8A___wB___gP__4AP__4D__-AD__-A___gA___gP__4AP__4D__-AD__-A___AAf__gP__wAH__4D__8AB__-A___AAf__gP__wAD__wD__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wH_AAAD__8H_-AAA___H__4AAP______gAD______8AA_______gAP______8AD_______gA_______8AP_______AD_______4A_______-AP_______wD_______8A___-D___AP__-Af__4D___AD__-A___wA___gP__4AH__4D__-AB__-A___gAf__wP__4AH__8D__-AB___A___gAf__wP__4AH__8D__-AA___A___gAP__wP__wAD__8D__8AA___A___AAP__wP__4AD__8D__-AB___A___gAf__wP__4AH__8D__-AB___A___gAf__wH__4AH__8B__-AB___Af__gAf__wH__8AP__8B___AD___Af__4B___wD___A___4A_______-AP_______gD_______wAf______8AH_______AA_______gAP______wAB______8AAP_____-AAB______AAAP_____gAAB_____gAAAH____wAAAAf___wAAAAB___wAAAAAB_-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 56,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAP_______4D________A________wP_______8D________A________wP_______8D________A________wP_______8D________A________wP_______8D________A________wP_______8D__gAD__-A__4AA___gP_-AAf__4D__gAH__-A__4AB___AP_8AAf__wAAAAAP__8AAAAAD__-AAAAAA___gAAAAAf__4AAAAAH__8AAAAAB___AAAAAA___wAAAAAP__8AAAAAD__-AAAAAA___gAAAAAf__4AAAAAH__8AAAAAB___AAAAAA___wAAAAAP__8AAAAAD__-AAAAAA___gAAAAAf__4AAAAAH__8AAAAAB___AAAAAA___wAAAAAP__4AAAAAD__-AAAAAA___gAAAAAf__4AAAAAH__8AAAAAB___AAAAAA___wAAAAAP__4AAAAAD__-AAAAAB___gAAAAAf__4AAAAAH__8AAAAAB___AAAAAA___wAAAAAP__4AAAAAD__-AAAAAB___gAAAAAf__wAAAAAH__8AAAAAB___AAAAAA___wAAAAAP__4AAAAAD__-AAAAAB___gAAAAAf__wAAAAAH__8AAAAAB___AAAAAA___wAAAAAP__4AAAAAD__-AAAAAB___gAAAAAf__wAAAAAH__8AAAAAD___AAAAAA___wAAAAAP__4AAAAAD__-AAAAAB___gAAAAAf__wAAAAAH__8AAAAAD___AAAAAA___gAAAAAP__4AAAAAD__-AAAAAB___gAAAAAf__wAAAAAH__8AAAAAB__-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 55,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAf_AAAAAAB___AAAAAB___8AAAAB____wAAAB_____AAAA_____4AAAf_____AAAP_____4AAH______AAD______4AA_______AAf______wAH______-AD_______gA_______4Af_______AH___B___wB___gP__8A___wB___gP__4AP__4D__-AD__-A___gA___gP__wAH__4D__8AB__-A___AAf__gP__wAH__4D__8AB__-A___AAf__gP__wAH__4D__8AB__-A___AAf__gH__4AH__4B__-AD__8Af__gA___AH__8AP__wA___AH__4AP__4D__-AB___B___AAf______wAD______4AA______-AAH______AAA______gAAH_____gAAAf____wAAAH____-AAAH_____wAAD_____-AAB______wAA______-AAP______wAH______8AB___B___gA___gP__4AP__wB__-AH__4AP__wB__-AD__8Af__gA___AH__4AH__4D__8AB__-A___AAf__gP__wAH__4D__8AB__-A___AAf__gP__wAH__4D__8AB__-A___AAf__gP__wAH__4D__8AB__-A___AAf__gP__wAH__4D__-AD__-A___gA___gH__4AP__wB___AH__8Af__4B___AH___B___wA_______4AP______-AB_______gAf______wAD______4AA______-AAH______AAA______gAAH_____wAAA_____4AAAH____8AAAA____-AAAAH____AAAAAf___AAAAAA__-AAAAAAB_8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 56,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAf_gAAAAAB___gAAAAB____AAAAB____8AAAB_____gAAA_____8AAAf_____wAAP_____8AAH______gAD______8AA_______gAf______4AH_______AD_______wA_______8Af_______gH___g___4B___gD__-Af__4A___gH__8AH__8B___AB___Af__gAf__wH__4AD__8D__-AA___A___gAP__wP__4AD__8D__-AA___A___gAP__wP__4AD__8D__-AA___A___gAP__wP__4AD__8D__-AA___A___gAP__wP__4AD__8B__-AA___Af__gAP__wH__4AD__8B__-AA___Af__gAf__wH__8AH__8B___AB___Af__4A___wD___Af__8A___4P___AP_______wB_______8Af_______AD_______wA_______8AH_______AA_______wAP______8AB_______AAP______wAA___7__8AAH__8___AAAf_8P__wAAAf8D__8AAAAAA___AAAAAAP__wAAAAAD__8AAAAAA___AAAAAAP__wB__4AD__8A___AA___AP__wAP__wD__8AD__8A___AA___AP__wAP__wD__8AD__8A___AA___AP__wAf__wD__-AH__8A___gD___AP__8A___wD___g___8Af______-AH_______gB_______4AP______8AD_______AAf______gAH______wAA______8AAH_____-AAA______AAAH_____gAAA_____wAAAD____wAAAAP___wAAAAA___wAAAAAA_-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     }
    }
   }
  },
  "francois": {
   "a": {
    "strip_h": 72,
    "digit_h": 61,
    "ring": 2,
    "shadow": 2,
    "cell_w": 40,
    "glyphs": {
     "0": {
      "w": 42,
      "bits": "AAAAAAAAAAAAAAAAAAH_AAAAAA__4AAAAB__-AAAAH___AAAAP___gAAAP___wAAAf___4AAA____8AAA____8AAB_-D_-AAB_8A_-AAB_4Af-AAD_4Af_AAD_wAP_AAD_wAP_AAH_wAP_gAH_wAP_gAH_gAP_gAH_gAH_gAH_gAH_gAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_gAH_gAP_gAH_wAP_gAH_wAP_gAH_wAP_gAH_wAP_AAD_wAP_AAD_4Af_AAD_4Af_AAB_4A_-AAB_8A_-AAB__D_8AAA____8AAA____8AAAf___4AAAP___wAAAP___gAAAH___AAAAB__-AAAAA__4AAAAAH_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 32,
      "bits": "AAAAAAAAAAAAAAAAAAP4AAAP-AAAH_gAAH_4AAH_-AAD__gAD__4AD__-AA___gAP__4AD__-AA___gAP__4AD__-AA___gAOD_4AAA_-AAAP_gAAD_4AAA_-AAAP_gAAD_4AAA_-AAAP_gAAD_4AAA_-AAAP_gAAD_4AAA_-AAAP_gAAD_4AAA_-AAAP_gAAD_4AAA_-AAAP_gAAD_4AAA_-AAAP_gAAD_4AAA_-AAAP_gAAD_4AAA_-AAAP_gAAD_4AAA_-AAAP_gAAD_4AD____A____wP___8D____A____wP___8D____A____wP___8D____AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAD_gAAAAAf_8AAAAB___AAAAD___gAAAP___4AAAf___8AAAf___8AAA____-AAB_____AAB__B__AAD_8A__AAD_4Af_gAH_wAf_gAH_wAP_gAH_gAP_gAP_gAP_gAD_AAP_gAAfAAP_gAADAAP_gAAAAAP_gAAAAAf_gAAAAAf_gAAAAAf_AAAAAA__AAAAAA__AAAAAB_-AAAAAB_-AAAAAD_-AAAAAD_8AAAAAH_8AAAAAP_4AAAAAP_wAAAAAf_wAAAAA__gAAAAA__AAAAAB_-AAAAAD_-AAAAAH_8AAAAAP_4AAAAAf_wAAAAAf_gAAAAA__gAAAAB__AAAAAD_-AAAAAH_8AAAAAP_4AAAAAf_wAAAAAf_gAAAAA__AAAAAB_-AAAAAD_____gAD_____gAD_____gAD_____gAD_____AAD_____AAD_____AAD_____AAD_____AAD_____AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAH_gAAAAA__4AAAAD__-AAAAH___gAAAf___wAAA____4AAA____8AAB____8AAD____-AAD_8H_-AAH_wB__AAB_gA__AAAfAAf_AAAHAAf_AAACAAf_AAAAAAf_gAAAAAf_AAAAAAf_AAAAAAf_AAAAAAf_AAAAAA__AAAAAA_-AAAAAB_-AAAAAD_8AAAAAP_4AAAAA__4AAAAP__gAAAAP__AAAAAP_8AAAAAP_8AAAAAP__AAAAAP__gAAAAP__4AAAAP__4AAAAAf_8AAAAAD_-AAAAAA__AAAAAAf_AAAAAAf_AAAAAAP_gAAAAAP_gAAAAAP_gAAAAAP_gAAAAAP_gAAAAAP_gAAEAAP_gAAeAAP_gAB-AAP_gAP_AAf_gAP_gA__gAP_wB__AAH_8D__AAH____-AAD____-AAB____8AAB____4AAA____wAAAP___gAAAH__-AAAAB__4AAAAAH_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 44,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAH_4AAAAAP_4AAAAAP_4AAAAAf_4AAAAAf_4AAAAA__4AAAAA__4AAAAB__4AAAAB__4AAAAD__4AAAAH__4AAAAH__4AAAAP__4AAAAP__4AAAAf__4AAAAf7_4AAAA_7_4AAAA_z_4AAAB_z_4AAAD_j_4AAAD_j_4AAAH_D_4AAAH_D_4AAAP-D_4AAAP-D_4AAAf8D_4AAAf8D_4AAA_4D_4AAB_4D_4AAB_wD_4AAD_gD_4AAD_gD_4AAH_AD_4AAH_AD_4AAP-AD_4AAP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____4AAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAf___-AAAf___8AAAf___8AAAf___8AAA____8AAA____8AAA____8AAA____8AAA____8AAA_8AAAAAA_4AAAAAA_4AAAAAA_4AAAAAB_4AAAAAB_4AAAAAB_4AAAAAB_4AAAAAB_wAAAAAB_wAAAAAB_wAAAAAB_wAAAAAB_w_wAAAB___8AAAD____AAAD____gAAD____wAAD____4AAD____8AAD____8AAD____-AAD_8H_-AAD_wB__AAAfgA__AAADAAf_AAAAAAf_gAAAAAP_gAAAAAP_gAAAAAP_gAAAAAP_gAAAAAH_gAAAAAH_gAAAAAH_gAAAAAP_gAAGAAP_gAA-AAP_gAH_AAP_gAP_AAf_AAP_gAf_AAP_wA__AAH_4B_-AAH_-D_-AAD____8AAD____8AAB____4AAA____wAAAf___gAAAP___AAAAD__8AAAAA__4AAAAAH_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 40,
      "bits": "AAAAAAAAAAAAAAAAf4AAAAP_4AAAB__wAAAP__wAAB___AAAP__-AAB___8AAP___wAA____gAH_w_-AA_-A_8AD_wD_wAP_AH_AB_4Af8AH_gB_AAf-ADAAD_wAAAAP_AAAAA_8AAAAH_wAAAAf_AAAAB_8AAAAH_wAAAAf_AAAAB_8H8AAH_z_8AA____8AD____4AP____wA_____gD____-AP____8A_____wD__B__gP_wB_-A__AH_4D_8AP_wP_wA__Af-AB_8B_4AH_wH_gAf_Af_AB_8B_8AH_wH_wAf_AP_AB_8A_8AH_gD_wA_-AP_AD_4Af-AP_gB_4B_8AH_wH_wAP_h_-AA____4AB____AAH___4AAP___gAA___8AAB___gAAB__4AAAD_-AAAAB_gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 38,
      "bits": "AAAAAAAAAAAAAAAAAAAAP____8A_____wD_____AP____8A_____wD_____AP____8A_____wD_____AP____8AAAAf_wAAAD_-AAAAP_4AAAB__AAAAH_8AAAAf_gAAAD_-AAAAP_wAAAB__AAAAH_4AAAAf_gAAAD_-AAAAP_wAAAA__AAAAH_4AAAAf_gAAAB_-AAAAP_wAAAA__AAAAD_4AAAAf_gAAAB_-AAAAH_4AAAA__AAAAD_8AAAAP_wAAAB_-AAAAH_4AAAAf_gAAAB_-AAAAP_wAAAA__AAAAD_8AAAAP_wAAAB_-AAAAH_4AAAAf_gAAAB_-AAAAH_4AAAA__gAAAD_-AAAAP_wAAAA__AAAAD_8AAAAP_wAAAA__AAAAH_8AAAAf_wAAAB__AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAD_AAAAAAf_4AAAAB__-AAAAH___AAAAP___gAAAf___wAAAf___4AAA____8AAB____8AAB_-B_8AAD_8A_-AAD_4Af-AAD_wAf-AAD_wAP-AAD_wAP-AAD_wAP-AAD_wAP-AAD_wAf-AAD_4Af8AAD_4A_8AAD_8A_8AAD_-B_4AAB__D_wAAB____wAAA____gAAAf___AAAAf__-AAAAP__4AAAAD__8AAAAB__-AAAAB___gAAAH___wAAAP___4AAAf___8AAA__f_-AAB_-P_-AAD_8D__AAD_4B__AAH_wA__gAH_wAf_gAH_wAf_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_wAP_gAP_wAf_AAH_4A__AAH_-D__AAH____-AAD____8AAB____8AAB____4AAA____wAAAP___AAAAH__-AAAAB__4AAAAAP_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 39,
      "bits": "AAAAAAAAAAAAAAAB_gAAAA__gAAAP__gAAB___AAAP__-AAB___8AAP___wAB____gAH___-AA__h_8AD_4D_wAf_gH_gB_8Af-AH_wB_4A__AD_gD_4AP_AP_gA_8A_-AD_wD_4AP_AP_gA_-A_-AD_4D_4AP_gP_gA_-A__AD_4D_8AP_gH_wA_-Af_gD_4B__g__gD____-AP____4Af____gB____-AD____4AH____gAP___-AAf_z_4AAP4P_gAAAA_-AAAAD_4AAAAP_gAAAA_8AAAAD_wAAAAP_AAAAB_8AAAAH_wABwAf-AB_AB_4Af-AP_gA_4A_8AD_gD_wAP_Af-AA_-H_4AB____AAH___8AAP___gAA___8AAB___gAAD__8AAAH__gAAAH_4AAAAH-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     ":": {
      "w": 17,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     }
    }
   },
   "b": {
    "strip_h": 100,
    "digit_h": 94,
    "ring": 2,
    "shadow": 2,
    "cell_w": 64,
    "glyphs": {
     "0": {
      "w": 63,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAP_wAAAAAAAH__8AAAAAAD___8AAAAAA____8AAAAAH____4AAAAA_____4AAAAH_____wAAAA______gAAAH_____-AAAA______8AAAH______4AAAf______gAAD_______AAAP______8AAB___gf__4AAH__4Af__gAAf__AA___AAD__4AB__8AAP__AAD__wAA__8AAP__gAH__gAAf_-AAf_-AAB__4AB__4AAH__wAP__gAAP__AA__8AAA__8AD__wAAD__wAP__AAAP__gA__8AAA__-AH__wAAD__4Af__AAAH__gB__8AAAf_-AH__wAAB__8Af_-AAAH__wB__4AAAf__AP__gAAB__8A__-AAAH__wD__4AAAf__AP__gAAB__8A__-AAAH__wD__4AAAf__AP__gAAB__8A__-AAAH__wD__4AAAf__gP__gAAB__-A__-AAAH__4D__4AAAf__gP__gAAB__-A__-AAAH__4D__4AAAf__gP__gAAB__-A__-AAAH__4D__4AAAf__gP__gAAB__8A__-AAAH__wD__4AAAf__AP__gAAB__8A__-AAAH__wD__4AAAf__AP__wAAB__8A___AAAH__wB__8AAAf__AH__wAAB__8Af__AAAH__gB__8AAA__-AH__wAAD__4Af__AAAP__gA__8AAA__-AD__wAAD__wAP__gAAP__AA__-AAB__8AB__4AAH__wAH__gAAf_-AAf__AAB__4AB__8AAP__gAD__wAA__-AAP__gAD__wAA__-AAf__AAB__8AD__8AAH__4Af__gAAP__4H__-AAA_______wAAB_______AAAH______4AAAP______gAAA______8AAAB______gAAAD_____8AAAAH_____gAAAAP____8AAAAAf____gAAAAA____8AAAAAA____AAAAAAAf__wAAAAAAAP_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 48,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAD_wAAAAAP_wAAAAA__wAAAAB__wAAAAH__wAAAAf__wAAAB___wAAAD___wAAAP___wAAA____wAAB____wAAH____wAAP____wAAP____wAAP____wAAP____wAAP____wAAP____wAAP____wAAP____wAAP____wAAP____wAAP____wAAP4P__wAAOAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAAAP__wAAP______wP______gP______gP______gP______gP______gP______gP______gP______gP______gP______gP______gP______gP______gP______gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 61,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAH_wAAAAAAAH__8AAAAAAD___8AAAAAAf___8AAAAAH____8AAAAA_____8AAAAP_____4AAAB______wAAAP______gAAB_______AAAH______8AAA_______4AAH_______wAAf_______AAD___gf__-AAf__4Af__4AB__-AA___gAP__wAB___AA___AAD__8AD__4AAP__wAf__AAAf__AB__8AAB__8AH__gAAH__4A__-AAAf__gD__wAAB__-AD__AAAH__4AB_8AAAf__gAA_gAAB__-AAAeAAAH__wAAAIAAAf__AAAAAAAD__8AAAAAAAP__wAAAAAAA___AAAAAAAD__8AAAAAAAf__gAAAAAAB__-AAAAAAAP__4AAAAAAA___gAAAAAAD__8AAAAAAAf__wAAAAAAB__-AAAAAAAP__4AAAAAAB___gAAAAAAH__8AAAAAAA___wAAAAAAD__-AAAAAAAf__wAAAAAAD___AAAAAAAP__4AAAAAAB___gAAAAAAP__8AAAAAAA___gAAAAAAH__-AAAAAAA___wAAAAAAH__-AAAAAAA___wAAAAAAD___AAAAAAAf__4AAAAAAD___AAAAAAAf__4AAAAAAD___AAAAAAAP__8AAAAAAB___gAAAAAAP__8AAAAAAB___gAAAAAAP__8AAAAAAB___gAAAAAAP__8AAAAAAB___gAAAAAAH__8AAAAAAA___wAAAAAAH__-AAAAAAA___wAAAAAAH__-AAAAAAA___wAAAAAAD__-AAAAAAAf__wAAAAAAD__-AAAAAAAf_______8AD________wAP________AA________8AD________gAP_______-AA________4AD________gAP_______-AA________4AD________gAP_______-AA________4AD________gAP_______-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 61,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAP_wAAAAAAAP__8AAAAAAH___8AAAAAB____8AAAAAP____8AAAAD_____4AAAAf_____4AAAD______wAAAf______gAAD______-AAAf______8AAB_______4AAP_______gAB________AAH__-B___8AA___AA___4AB__4AB___gAB__AAD__-AAB_4AAH__4AAD_AAAf__wAAD4AAA___AAADgAAD__8AAACAAAP__wAAAAAAA___AAAAAAAD__8AAAAAAAP__wAAAAAAA___AAAAAAAD__4AAAAAAAP__gAAAAAAB__-AAAAAAAH__4AAAAAAAf__AAAAAAAD__8AAAAAAAf__gAAAAAAD__-AAAAAAAf__wAAAAAAH___AAAAAAB___4AAAAAA____AAAAAD____4AAAAAP___-AAAAAA____wAAAAAD___8AAAAAAP___AAAAAAA___8AAAAAAD___8AAAAAAP___8AAAAAA____8AAAAAD____4AAAAAP____wAAAAA_____gAAAAA_____AAAAAAA___-AAAAAAAf__4AAAAAAAf__wAAAAAAA___AAAAAAAB__-AAAAAAAD__4AAAAAAAP__wAAAAAAAf__AAAAAAAB__8AAAAAAAH__wAAAAAAAf__gAAAAAAA__-AAAAAAAD__4AAAAAAAP__gAAAAAAA__-AAAAAAAD__4AAAAAAAP__gAACAAAB__-AAA8AAAH__4AAfwAAAf__gAH_AAAB__-AB_-AAAP__4Af_8AAA___AD__wAAH__8AP__gAAf__wAf__gAD__-AB___AA___4AH___gP___gAP_______8AA________gAB_______-AAD_______wAAH______-AAAf______wAAA______-AAAA______wAAAB_____-AAAAD_____wAAAAD____8AAAAAD____AAAAAAB___gAAAAAAAP_gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 66,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP__wAAAAAAAAf__wAAAAAAAAf__wAAAAAAAA___wAAAAAAAA___wAAAAAAAB___wAAAAAAAB___wAAAAAAAD___wAAAAAAAH___wAAAAAAAH___wAAAAAAAP___wAAAAAAAP___wAAAAAAAf___wAAAAAAAf___wAAAAAAA____wAAAAAAA____wAAAAAAB____wAAAAAAD____wAAAAAAD____wAAAAAAH____wAAAAAAH____wAAAAAAP____wAAAAAAP____wAAAAAAf____wAAAAAAf_3__wAAAAAA__3__wAAAAAA__n__wAAAAAB__n__wAAAAAD__H__wAAAAAD__H__wAAAAAH_-H__wAAAAAH_-H__wAAAAAP_8H__wAAAAAP_8H__wAAAAAf_4H__wAAAAAf_wH__wAAAAA__wH__wAAAAA__gH__wAAAAB__gH__wAAAAD__AH__wAAAAD__AH__wAAAAH_-AH__wAAAAH_-AH__wAAAAP_8AH__wAAAAP_8AH__wAAAAf_4AH__wAAAAf_4AH__wAAAA__wAH__wAAAA__wAH__wAAAB__gAH__wAAAD__gAH__wAAAD__AAH__wAAAH__AAH__wAAAH_-AAH__wAAAP_-AAH__wAAAP_________wAP_________wAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________gAP_________AAP_________AAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__wAAAAAAAAH__gAAAAAAAAHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 61,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD______-AAAP______4AAA_______gAAD______8AAAf______wAAB_______AAAH______8AAAf______wAAB_______AAAH______8AAAf______wAAB_______AAAH______8AAA_______gAAD__gAAAAAAAP_-AAAAAAAA__4AAAAAAAD__gAAAAAAAP_-AAAAAAAA__4AAAAAAAD__gAAAAAAAP_8AAAAAAAA__wAAAAAAAH__AAAAAAAAf_8AAAAAAAB__wAAAAAAAH__AAAAAAAAf_8AAAAAAAB__wAAAAAAAH_-AAAAAAAAf_4AAAAAAAB__gAAAAAAAP_-AAAAAAAA__4D_wAAAAD__j__4AAAAP_____4AAAA______4AAAD______wAAAP______gAAA_______AAAD______-AAAP______8AAB_______4AAH_______wAAf_______AAB_______-AAH_______8AAf__wH___wAB__8AD___AAH__AAH__-AAD_4AAP__4AAB_AAAf__wAAA8AAA___AAAAAAAD__8AAAAAAAH__wAAAAAAAf__gAAAAAAA__-AAAAAAAD__4AAAAAAAP__gAAAAAAA__-AAAAAAAD__4AAAAAAAP__gAAAAAAAf_-AAAAAAAB__4AAAAAAAP__gAAAAAAA__-AAAEAAAD__4AABwAAAP__gAA_AAAA__-AAP-AAAD__wAH_4AAAf__AD__wAAB__8AP__AAAP__wA__-AAA__-AB__8AAH__4AH__4AA___gAf__wAD__8AA___gA___wAD___wP__-AAH_______4AAf_______AAA_______4AAB_______gAAD______8AAAH______gAAAP_____8AAAAf_____gAAAA_____8AAAAB_____AAAAAB____4AAAAAB___-AAAAAAA___gAAAAAAAP_gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 58,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAD_gAAAAAAAD__wAAAAAAA___wAAAAAAH___wAAAAAB____gAAAAAP____AAAAAB____-AAAAAP____8AAAAB_____4AAAAP_____gAAAA______AAAAH_____-AAAA______4AAAD______wAAAf__gf__AAAB__8A__8AAAP__AB__4AAA__8AD__gAAH__gAH_-AAAf_8AAf_4AAD__wAB__gAAP__AAH__AAA__4AAP-AAAH__gAA8AAAAf_-AAAAAAAB__4AAAAAAAP__AAAAAAAA__8AAAAAAAD__wAAAAAAAP__AAAAAAAB__8AAAAAAAH__wAAAAAAAf__AAAAAAAB__4AAAAAAAH__gAAAAAAAf_-AAAAAAAD__4Af8AAAAP__gP_-AAAA__-H__-AAAD__5___8AAAP__v___4AAA_______4AAD_______gAAP_______AAA_______-AAD_______8AAP_______wAA________gAD_______-AAP_______8AA________wAD___wH___AAP__8AH__-AA___AAP__4AD__4AA___gAP__gAB__-AA__-AAD__8AD__4AAP__wAP__gAA___AA__-AAB__8AD__4AAH__wAP__gAAf__AA__-AAB__8AB__4AAH__wAH__gAAf__AAf_-AAB__8AB__4AAH__wAH__gAAf__AAP__AAB__4AA__8AAH__gAD__wAA__-AAP__AAD__4AAf_8AAP__gAB__4AA__8AAH__gAH__wAAP_-AAf__AAA__8AD__4AAD__4AP__gAAH__wD__8AAAf__gf__wAAB______-AAAD______4AAAP______AAAAf_____4AAAB______gAAAD_____8AAAAH_____gAAAAP____8AAAAAf____gAAAAA____4AAAAAB____AAAAAAB___wAAAAAAB__8AAAAAAAA_8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 57,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH_______-AAf_______4AB________gAH_______-AAf_______4AB________gAH_______-AAf_______4AB________gAH_______-AAf_______4AD________gAP_______-AA________4AD________gAAAAAAP__8AAAAAAA___wAAAAAAH__-AAAAAAAf__wAAAAAAD___AAAAAAAP__8AAAAAAB___gAAAAAAH__-AAAAAAAf__wAAAAAAD___AAAAAAAP__4AAAAAAA___gAAAAAAH__8AAAAAAAf__wAAAAAAD__-AAAAAAAP__4AAAAAAA___gAAAAAAH__8AAAAAAAf__wAAAAAAB__-AAAAAAAP__4AAAAAAA___gAAAAAAH__8AAAAAAAf__wAAAAAAB___AAAAAAAP__4AAAAAAA___gAAAAAAD__8AAAAAAAf__wAAAAAAB___AAAAAAAH__4AAAAAAA___gAAAAAAD__-AAAAAAAP__wAAAAAAA___AAAAAAAH__8AAAAAAAf__wAAAAAAB__-AAAAAAAP__4AAAAAAA___gAAAAAAD__8AAAAAAAf__wAAAAAAB___AAAAAAAH__8AAAAAAAf__gAAAAAAD__-AAAAAAAP__4AAAAAAA___gAAAAAAD__8AAAAAAAf__wAAAAAAB___AAAAAAAH__8AAAAAAAf__gAAAAAAD__-AAAAAAAP__4AAAAAAA___gAAAAAAD__-AAAAAAAP__4AAAAAAB___AAAAAAAH__8AAAAAAAf__wAAAAAAB___AAAAAAAH__8AAAAAAAf__wAAAAAAD___AAAAAAAP__4AAAAAAA___gAAAAAAD__-AAAAAAAP__4AAAAAAA___gAAAAAAD__-AAAAAAAf__4AAAAAAB___gAAAAAAH__-AAAAAAAf__4AAAAAAB___gAAAAAAH__-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 62,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAH_wAAAAAAAH__8AAAAAAB___8AAAAAAf___8AAAAAH____8AAAAA_____4AAAAH_____wAAAA______gAAAH______AAAA______-AAAD______4AAAf______wAAD_______AAAP______-AAB___gP__4AAH__4AP__gAA___AAf__AAD__4AA__8AAP__AAB__wAA__8AAH__AAH__gAAf_8AAf_-AAA__wAB__4AAD__AAH__gAAP_8AAf_-AAA__wAB__8AAH__AAH__wAAf_8AAf__AAB__wAB__-AAH_-AAH__4AA__4AAP__wAH__gAA___gAf_8AAD___AD__wAAP__-Af_-AAAf__8D__wAAB___4___AAAD___3__4AAAP______AAAAf_____4AAAA______AAAAB_____4AAAAD____-AAAAAH____wAAAAAP____AAAAAAf____AAAAAAf___-AAAAAB____-AAAAAf____8AAAAD_____4AAAAf_____wAAAD______gAAA_______AAAH______-AAAf__n___8AAD__8H___wAAf__gP___gAD__8AP__-AAP__gAf__8AB__8AA___wAH__wAB___gA__-AAD__-AD__4AAP__4Af__gAAf__gB__8AAB__-AH__wAAD__8Af__AAAP__wB__8AAA___AH__wAAD__8A___AAAP__wD__8AAA___AP__wAAD__4A___AAAP__gD__8AAA__-AH__wAAD__4Af__gAAP__gB__-AAB__8AH__8AAH__wAf__4AA___AA___wAP__4AD___wD___gAH_______8AAf_______wAA_______-AAD_______wAAH_______AAAP______4AAAf______AAAA______wAAAB_____-AAAAB_____wAAAAB____8AAAAAB____AAAAAAB___gAAAAAAAf_gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 58,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAf-AAAAAAAAf__gAAAAAAH___gAAAAAB____AAAAAAP____AAAAAB____-AAAAAf____8AAAAD_____4AAAAf_____gAAAB______AAAAP_____-AAAB______4AAAH______wAAA_______AAAH__-B__-AAAf__wB__4AAB__-AD__gAAP__wAP__AAA__-AAf_8AAH__4AB__wAAf__gAH__gAB__8AAP_-AAH__wAA__4AAf__AAD__wAD__8AAP__AAP__gAA__8AA__-AAB__wAD__4AAH__AAP__gAAf_-AA__-AAB__4AD__4AAH__gAP__gAAf_-AA___AAB__4AD__8AAH__gAP__wAAf__AA___AAB__8AB__-AAH__wAH__4AAf__AAf__wAB__8AB___AAH__wAD___AB___AAP___A___8AA________wAB________AAH_______8AAP_______wAA________AAB_______8AAH_______wAAP_______AAAf______8AAA_______wAAB____f__AAAD___5__8AAAD__-H__wAAAH__Af__AAAAD_gB__8AAAAAAAP__gAAAAAAA__-AAAAAAAD__4AAAAAAAP__gAAAAAAA__-AAAAAAAD__4AAAAAAAP__gAAAAAAA__8AAAAAAAD__wAAAAAAAP__AAAAAAAB__8AAAAAAAH__gAAABwAAf_-AAAB_AAB__4AAD_8AAH__AAA__4AA__8AAD__gAD__wAAH_-AAP_-AAAf_8AB__4AAB__wAP__AAAH__gA__8AAAP__AH__gAAA__-B__-AAAD______wAAAH______AAAAf_____4AAAA______AAAAD_____8AAAAH_____gAAAAP____8AAAAAf____gAAAAA____8AAAAAB____gAAAAAD___4AAAAAAH___AAAAAAAD__wAAAAAAAB_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     }
    }
   }
  },
  "staatliches": {
   "a": {
    "strip_h": 72,
    "digit_h": 65,
    "ring": 2,
    "shadow": 2,
    "cell_w": 40,
    "glyphs": {
     "0": {
      "w": 44,
      "bits": "AAAAAAAAAAAAAAAAAAD_wAAAAAf_-AAAAB___gAAAH___4AAAP___8AAAf___-AAA_____AAB_____gAD_____wAD_____wAH_____4AH_-Af_4AP_4AH_8AP_wAD_8AP_gAB_8AP_gAB_8AP_gAB_8AP_gAB_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAA_8AP_gAB_8AP_gAB_8AP_gAB_8AP_wAD_8AP_4AH_8AH_-Af_4AH_____4AD_____wAD_____wAB_____gAA_____AAAf___-AAAP___8AAAH___4AAAB___gAAAAf_-AAAAAD_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 17,
      "bits": "AAAAAAAAAAAAP_AAP_AAP_AAP_AAP_AAP_AAP_AAP_AAP_AAP_AAP_AAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAH-AAAAAA__wAAAAD__8AAAAH__-AAAAP___gAAAf___wAAA____wAAB____4AAD____8AAD____8AAH____-AAH_8D_-AAP_4B__AAP_wA__AAP_gAf_AAP_gAf_AAP_gAP_gAP_AAP_gAP_AAP_gAP_AAP_gAP_AAf_AAP_AAf_AAP_AA__AAAAAA__AAAAAB_-AAAAAD_-AAAAAH_-AAAAAH_8AAAAAP_4AAAAAf_4AAAAA__wAAAAA__gAAAAB__gAAAAD__AAAAAD_-AAAAAH_8AAAAAP_8AAAAAf_4AAAAAf_wAAAAA__wAAAAB__gAAAAB__AAAAAD_-AAAAAH_-AAAAAP_8AAAAAP_4AAAAAf_wAAAAA__wAAAAB__gAAAAB__AAAAAD__AAAAAH_-AAAAAH_8AAAAAP_____AAP_____AAP_____AAP_____AAP_____AAP_____AAP_____AAP_____AAP_____AAP_____AAP_____AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAH-AAAAAA__wAAAAD__8AAAAH___AAAAP___gAAA____wAAA____4AAB____4AAD____8AAD____-AAH____-AAH_8D__AAP_4B__AAP_wA__AAP_gAf_AAP_gAf_gAP_gAP_gAP_AAP_gAP_AAP_gAP_AAP_gAP_AAP_gAP_AAf_AAP_AAf_AAAAAA__AAAAAB__AAAAAD_-AAAAD__-AAAAD__-AAAAD__8AAAAD__4AAAAD__wAAAAD__wAAAAD__4AAAAD__4AAAAD__8AAAAD__8AAAAD__-AAAAAD_-AAAAAB__AAAAAA__AAAAAAf_AAAAAAf_gAP_AAP_gAP_AAP_gAP_AAP_gAP_AAP_gAP_AAP_gAP_AAP_gAP_gAP_gAP_gAf_gAP_gAf_AAP_wA__AAP_4B__AAH_8D_-AAH____-AAD____-AAD____8AAB____4AAA____4AAAf___wAAAP___gAAAH__-AAAAD__8AAAAA__wAAAAAH-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 44,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAD_4AAAAAH_4AAAAAH_4AAAAAP_4AAAAAP_4AAAAAf_4AAAAAf_4AAAAA__4AAAAA__4AAAAA__4AAAAB__4AAAAB__4AAAAD__4AAAAD__4AAAAH__4AAAAH__4AAAAP__4AAAAP__4AAAAf__4AAAAf__4AAAA___4AAAA___4AAAB___4AAAB_7_4AAAD_7_4AAAD_z_4AAAH_z_4AAAH_j_4AAAP_j_4AAAP_D_4AAAP_D_4AAAf-D_4AAAf-D_4AAA_8D_4AAA_8D_4AAB_8D_4AAB_4D_4AAD_4D_4AAD_wD_4AAH_wD_4AAH_gD_4AAP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AP_____8AAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAD_4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAD____-AAD____-AAD____-AAD____-AAD____-AAD____-AAD____-AAD____-AAD____-AAD____-AAD____-AAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAD_wAAAAAH_wAAAAAH_wAAAAAH_wAAAAAH_wAAAAAH_wAAAAAH_gAAAAAH_j_AAAAH___4AAAH___-AAAH____AAAH____gAAH____wAAH____4AAH____8AAH____-AAH____-AAH_____AAH_8D__AAH_wA__gAH_gAf_gAAAAAP_gAAAAAP_gAAAAAP_gAAAAAP_gAAAAAP_gAAAAAP_gAAAAAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_wAf_gAP_wAf_gAH_4A__AAH_-D__AAH_____AAD____-AAB____-AAB____8AAA____4AAAf___wAAAP___gAAAH___AAAAB__-AAAAAf_4AAAAAD_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAH-AAAAAA__wAAAAD__8AAAAH___AAAAP___gAAAf___wAAA____4AAB____4AAD____8AAD____-AAH____-AAH_8D__AAP_4A__AAP_wA__AAP_gAf_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAAAAAP_gAAAAAP_gAAAAAP_j-AAAAP___wAAAP___8AAAP___-AAAP____gAAP____wAAP____4AAP____4AAP____8AAP____-AAP____-AAP_-D__AAP_4B__AAP_wA__AAP_gAf_AAP_gAf_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAf_gAP_gAf_AAP_wA__AAP_4B__AAH_8D__AAH____-AAD____-AAD____8AAB____4AAA____4AAAf___wAAAP___gAAAH___AAAAD__8AAAAA__wAAAAAH_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAP_____gAAAAAP_gAAAAAP_gAAAAAP_AAAAAAf_AAAAAAf_AAAAAAf-AAAAAA_-AAAAAA_-AAAAAA_8AAAAAB_8AAAAAB_8AAAAAD_4AAAAAD_4AAAAAD_4AAAAAH_wAAAAAH_wAAAAAH_wAAAAAP_gAAAAAP_gAAAAAP_gAAAAAf_AAAAAAf_AAAAAA__AAAAAA_-AAAAAA_-AAAAAB_-AAAAAB_8AAAAAB_8AAAAAD_8AAAAAD_4AAAAAD_4AAAAAH_4AAAAAH_wAAAAAH_wAAAAAP_wAAAAAP_gAAAAAf_gAAAAAf_gAAAAAf_AAAAAA__AAAAAA__AAAAAA_-AAAAAB_-AAAAAB_-AAAAAB_8AAAAAD_8AAAAAD_8AAAAAD_4AAAAAH_4AAAAAH_4AAAAAP_wAAAAAP_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAD_AAAAAAf_wAAAAB__8AAAAH___AAAAP___gAAAf___wAAA____4AAA____4AAB____8AAB____-AAD____-AAD_-D_-AAD_8B__AAH_4A__AAH_wAf_AAH_wAf_AAH_wAf_AAH_wAf_AAH_wAf_AAH_wAf_AAH_4A__AAD_8B__AAD_-D_-AAD____-AAB____-AAB____8AAA____4AAAf___4AAAf___wAAA____4AAA____8AAB____8AAD____-AAD____-AAH_-D__AAH_4A__AAH_wAf_gAP_wAf_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_wAf_gAH_wAf_gAH_4A__AAH_-D__AAD_____AAD____-AAB____8AAB____8AAA____4AAAf___wAAAP___gAAAH___AAAAB__-AAAAAf_4AAAAAD_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAH_AAAAAA__wAAAAB__8AAAAH___AAAAP___gAAAf___wAAA____4AAB____8AAB____8AAD____-AAH____-AAH_-D__AAH_4A__AAP_wAf_gAP_wAf_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_wAf_gAP_wAf_gAH_4A__gAH_-D__gAD_____gAD_____gAB_____gAB_____gAA_____gAAf____gAAP____gAAH____gAAB____gAAAf___gAAAD-P_gAAAAAP_gAAAAAP_gAAAAAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_gAP_wAf_gAP_wAf_gAH_4A__AAH_-D__AAH____-AAD____-AAD____8AAB____8AAA____4AAAf___wAAAP___gAAAH___AAAAB__8AAAAA__4AAAAAH-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     ":": {
      "w": 16,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_8D_wP_A_8D_wP_A_8D_wP_A_8D_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_8D_wP_A_8D_wP_A_8D_wP_A_8D_wAAAAAAAAAAAAAAAA"
     }
    }
   },
   "b": {
    "strip_h": 100,
    "digit_h": 94,
    "ring": 2,
    "shadow": 2,
    "cell_w": 64,
    "glyphs": {
     "0": {
      "w": 63,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAP_wAAAAAAAP__8AAAAAAD___-AAAAAA____-AAAAAP____-AAAAD_____8AAAAf_____4AAAD______4AAAf______wAAD_______gAAf______-AAD_______8AAP_______4AB________gAH________AA________8AD___gB___4Af__4AA___gB__-AAB___AH__wAAD__8A___AAAH__wD__4AAAP__AP__AAAA__8A__8AAAD__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAB__4D__wAAAH__gP__AAAAf_-A__8AAAD__4D__4AAAP__AP__gAAB__8Af__AAAP__wB__-AAB___AH__-AAP__4AP__-AH___gA________8AB________wAH_______-AAP_______4AA________AAB_______4AAD_______gAAH______8AAAP______gAAAf_____4AAAA______AAAAA_____4AAAAA____-AAAAAA____gAAAAAA___wAAAAAAAP_wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 22,
      "bits": "AAAAAAAAAAAAP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AP__AAAAAAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 58,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAf-AAAAAAAAP__gAAAAAAH___gAAAAAB____gAAAAAP____AAAAAB_____AAAAAf____-AAAAD_____8AAAAf_____4AAAD______wAAAP______AAAB______-AAAP______8AAA_______wAAH_______gAAf______-AAD___AP__8AAP__4Af__wAB__-AA___gAH__4AB__-AAf__AAD__4AB__4AAH__gAH__gAAf_-AA__-AAB__8AD__wAAD__wAP__AAAP__AA__8AAA__8AD__wAAD__wAP__AAAf__AA__8AAB__4AD__wAAH__gAP__AAA__-AA__8AAD__4AD__wAAf__gAAAAAAD__8AAAAAAAP__wAAAAAAB___AAAAAAAP__4AAAAAAB___gAAAAAAH__8AAAAAAA___wAAAAAAH__-AAAAAAA___wAAAAAAD___AAAAAAAf__4AAAAAAD___AAAAAAAP__4AAAAAAB___gAAAAAAP__8AAAAAAB___gAAAAAAH__8AAAAAAA___wAAAAAAH__-AAAAAAA___wAAAAAAD___AAAAAAAf__4AAAAAAD___AAAAAAAP__4AAAAAAB___gAAAAAAP__8AAAAAAB___gAAAAAAH__8AAAAAAA___wAAAAAAH__-AAAAAAA___wAAAAAAD___AAAAAAAf__4AAAAAAD___AAAAAAAP__4AAAAAAB___gAAAAAAP__8AAAAAAB___gAAAAAAH__8AAAAAAA___wAAAAAAH__-AAAAAAA___wAAAAAAD__-AAAAAAAf_______4AB________gAH_______-AAf_______4AB________gAH_______-AAf_______4AB________gAH_______-AAf_______4AB________gAH_______-AAf_______4AB________gAH_______-AAf_______4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 58,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAf-AAAAAAAAf__gAAAAAAH___gAAAAAB____gAAAAAP____gAAAAD_____AAAAAf____-AAAAD_____8AAAAf_____4AAAD______wAAAf______gAAD_______AAAP______8AAB_______4AAH_______gAA________AAD___AP__8AAf__wAP__4AB__-AAf__gAH__wAA__-AAf__AAD__4AB__4AAH__gAP__gAAf__AA__8AAA__8AD__wAAD__wAP__AAAP__AA__8AAA__8AD__wAAD__wAP__AAAP__AA__8AAA__8AD__wAAH__wAP__AAAf_-AAAAAAAB__4AAAAAAAP__gAAAAAAB__-AAAAAAAP__wAAAAAAD___AAAAAB____8AAAAAH____gAAAAAf___-AAAAAB____wAAAAAH___-AAAAAAf___4AAAAAB____AAAAAAH___4AAAAAAf___gAAAAAB____AAAAAAH___8AAAAAAf___4AAAAAB____wAAAAAH____AAAAAAf___-AAAAAB____4AAAAAAA___wAAAAAAB___AAAAAAAB__-AAAAAAAH__4AAAAAAAP__gAAAAAAAf_-AAAAAAAB__8AAAAAAAH__wAP__AAAP__AA__8AAA__8AD__wAAD__wAP__AAAP__AA__8AAA__8AD__wAAD__wAP__AAAP__AA__8AAA__8AD__wAAD__wAP__gAAf__AAf_-AAB__8AB__4AAH__gAH__wAA__-AAf__gAD__4AB__-AAf__gAD__-AD__8AAP__8A___wAAf_______AAB_______4AAD_______gAAP______8AAAf______gAAA______-AAAD______wAAAH_____-AAAAP_____wAAAAf____-AAAAA_____wAAAAA____8AAAAAB____gAAAAAB___4AAAAAAB__-AAAAAAAAf-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 61,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf_-AAAAAAAD__4AAAAAAAP__gAAAAAAB__-AAAAAAAH__4AAAAAAA___gAAAAAAD__-AAAAAAAf__4AAAAAAB___gAAAAAAP__-AAAAAAA___4AAAAAAH___gAAAAAAf__-AAAAAAD___4AAAAAAP___gAAAAAB___-AAAAAAH___4AAAAAAf___gAAAAAD___-AAAAAAP___4AAAAAB____gAAAAAH___-AAAAAA____4AAAAAD____gAAAAAf___-AAAAAB____4AAAAAP____gAAAAA____-AAAAAH____4AAAAAf____gAAAAD____-AAAAAP____4AAAAB__3__gAAAAH__f_-AAAAA__5__4AAAAD__n__gAAAAf_-f_-AAAAB__x__4AAAAP__H__gAAAA__4f_-AAAAD__h__4AAAAf_8H__gAAAB__wf_-AAAAP_-B__4AAAA__4H__gAAAH__Af_-AAAAf_8B__4AAAD__gH__gAAAP_-Af_-AAAB__wB__4AAAH__AH__gAAA__8Af_-AAAD__gB__4AAAf_-AH__gAAB__wAf_-AAAP__AB__4AAA__4AH__gAAH__gAf_-AAAf_8AB__4AAD__wAH__gAAP________4A_________gD________-AP________4A_________gD________-AP________4A_________gD________-AP________4A_________gD________-AP________4A_________gD________-AP________4AAAAAB__4AAAAAAAH__gAAAAAAAf_-AAAAAAAB__4AAAAAAAH__gAAAAAAAf_-AAAAAAAB__4AAAAAAAH__gAAAAAAAf_-AAAAAAAB__4AAAAAAAH__gAAAAAAAf_-AAAAAAAB__4AAAAAAAH__gAAAAAAAf_-AAAAAAAB__4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 58,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB_______4AAH_______gAAf______-AAB_______4AAH_______gAAf______-AAB_______4AAH_______gAAf______-AAB_______4AAH_______gAAf______-AAB_______4AAH_______gAAf______-AAD_______4AAP_-AAAAAAAA__4AAAAAAAD__gAAAAAAAP_-AAAAAAAA__4AAAAAAAD__gAAAAAAAP_-AAAAAAAA__4AAAAAAAD__gAAAAAAAP_-AAAAAAAA__4AAAAAAAD__gAAAAAAAP_-AAAAAAAA__4AAAAAAAD__gAAAAAAAP_-AAAAAAAA__4f-AAAAAD__v__AAAAAP_____gAAAA______gAAAD______AAAAP______AAAB______-AAAH______8AAAf______4AAB_______wAAH_______gAAf______-AAB_______8AAH_______4AAf_______gAB________AAH__-Af__8AAf__gAf__wAB__8AAf__gAH__gAA__-AAAAAAAD__4AAAAAAAH__gAAAAAAAf__AAAAAAAB__8AAAAAAAD__wAAAAAAAP__AAAAAAAA__8AAAAAAAD__wAAAAAAAP__AAAAAAAA__8AAAAAAAD__wAP__AAAP__AA__8AAA__8AD__wAAD__wAP__AAAP__AA__8AAA__8AD__wAAH__wAP__AAAf__AA__-AAB__4AD__4AAH__gAP__wAA__-AAf__AAH__4AB__-AA___gAH__8AH__8AAP__8B___wAA_______-AAB_______4AAH_______AAAP______8AAA_______gAAB______8AAAD______wAAAH_____-AAAAP_____wAAAAf____-AAAAA_____wAAAAB____8AAAAAB____gAAAAAB___4AAAAAAB__-AAAAAAAAf-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 58,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAf-AAAAAAAAf__AAAAAAAH___gAAAAAB____gAAAAAf____AAAAAD____-AAAAAf____-AAAAD_____8AAAAf_____4AAAD______wAAAf______AAAD______-AAAP______8AAB_______wAAH_______gAA_______-AAD___Af__8AAf__wAf__wAB__-AA___AAH__wAB__-AA__-AAD__4AD__4AAH__gAP__AAAf_-AA__8AAB__4AD__wAAH__wAP__AAAP__AA__8AAA__8AD__wAAD__wAP__AAAP__AA__8AAAAAAAD__wAAAAAAAP__AAAAAAAA__8AAAAAAAD__wP8AAAAAP__P__AAAAA______AAAAD______AAAAP______AAAA______-AAAD______8AAAP______8AAA_______wAAD_______gAAP_______AAA_______-AAD_______4AAP_______wAA________gAD_______-AAP___gf__8AA___4Af__wAD__-AA___AAP__wAB__-AA___AAD__4AD__4AAP__gAP__gAAf_-AA__8AAB__4AD__wAAH__gAP__AAAf_-AA__8AAB__4AD__wAAH__gAP__AAAf_-AA__8AAB__4AD__wAAH__gAP__AAAf_-AA__8AAB__4AD__wAAH__gAP__AAAf_-AA__8AAB__4AD__wAAH__gAP__AAAf_-AA__8AAB__4AD__4AAP__gAP__gAA__-AAf__AAH__4AB__-AA___AAH__8AH__8AAP__8B___wAA_______-AAB_______4AAH_______AAAP______8AAA_______gAAB______8AAAD______gAAAH_____-AAAAP_____wAAAAf____-AAAAA_____gAAAAB____8AAAAAB____gAAAAAB___4AAAAAAB__8AAAAAAAA_-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 58,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP________AA________8AD________wAP________AA________8AD________wAP________AA________8AD________wAP________AA________8AD________wAP________AA________8AD________wAP________AAAAAAAA__4AAAAAAAH__gAAAAAAAf_-AAAAAAAB__wAAAAAAAP__AAAAAAAA__8AAAAAAAD__gAAAAAAAf_-AAAAAAAB__4AAAAAAAH__AAAAAAAA__8AAAAAAAD__wAAAAAAAf_-AAAAAAAB__4AAAAAAAH__gAAAAAAA__8AAAAAAAD__wAAAAAAAP__AAAAAAAB__4AAAAAAAH__gAAAAAAAf_-AAAAAAAD__wAAAAAAAP__AAAAAAAA__8AAAAAAAH__gAAAAAAAf_-AAAAAAAD__4AAAAAAAP__AAAAAAAA__8AAAAAAAH__wAAAAAAAf_-AAAAAAAB__4AAAAAAAP__gAAAAAAA__8AAAAAAAD__wAAAAAAAf__AAAAAAAB__4AAAAAAAP__gAAAAAAA__-AAAAAAAD__wAAAAAAAf__AAAAAAAB__8AAAAAAAH__gAAAAAAA__-AAAAAAAD__4AAAAAAAP__AAAAAAAB__8AAAAAAAH__wAAAAAAAf_-AAAAAAAD__4AAAAAAAP__gAAAAAAB__8AAAAAAAH__wAAAAAAAf__AAAAAAAD__4AAAAAAAP__gAAAAAAA__-AAAAAAAH__wAAAAAAAf__AAAAAAAB__8AAAAAAAP__gAAAAAAA__-AAAAAAAH__4AAAAAAAf__AAAAAAAB__8AAAAAAAP__wAAAAAAA__-AAAAAAAD__4AAAAAAAf__gAAAAAAB__8AAAAAAAH__wAAAAAAA___AAAAAAAD__4AAAAAAAP__gAAAAAAB__-AAAAAAAH__wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 58,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAf-AAAAAAAAf__AAAAAAAH___gAAAAAB____AAAAAAP____AAAAAD____-AAAAAf____8AAAAD_____4AAAAf_____wAAAD______gAAAP______AAAB______8AAAP______4AAA_______wAAH_______AAAf______8AAB___Af__4AAP__4Af__gAA___AA__-AAD__4AB__8AAP__AAH__wAA__8AAP__AAD__wAA__8AAf_-AAD__wAB__4AAP__AAH__gAA__8AAP__AAD__wAA__8AAP__AAD__wAB__8AAP__gAH__wAA___AA__-AAD__-AH__4AAH__8B___gAAf______8AAA_______wAAD______-AAAH______4AAAf______AAAA______8AAAB______gAAAH_____8AAAAf_____wAAAD______gAAAf______AAAB______-AAAP______8AAB_______wAAH_______gAA_______-AAD___gf__8AAP__4Af__wAB__-AA___AAH__wAB__-AAf__AAD__4AD__4AAP__gAP__gAAf_-AA__8AAB__4AD__wAAH__gAP__AAAP_-AA__8AAA__8AD__wAAD__wAP__AAAP__AA__8AAA__8AD__wAAD__wAP__AAAP__AA__8AAA__8AD__wAAD__wAP__AAAP__AA__8AAA__8AD__wAAH__gAP__AAAf_-AA__-AAB__4AD__4AAP__gAP__wAA__-AAf__AAH__4AB__-AA___AAH__8AH__8AAP__8B___wAA_______-AAB_______4AAH_______AAAP______8AAAf______gAAB______8AAAD______wAAAH_____-AAAAP_____wAAAAf____-AAAAA_____wAAAAA____8AAAAAB____gAAAAAB___4AAAAAAB__8AAAAAAAAf-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 58,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAA_-AAAAAAAAf__AAAAAAAH___AAAAAAB____AAAAAAf____AAAAAD____-AAAAAf____8AAAAH_____4AAAAf_____wAAAD______gAAAf______AAAD______-AAAf______4AAB_______wAAP_______gAA_______-AAH___Af__8AAf__wAf__wAB__-AA___AAH__wAB__-AA__-AAD__4AD__4AAP__gAP__AAAf_-AA__8AAB__4AD__wAAH__gAP__AAAf_-AA__8AAB__4AD__wAAH__gAP__AAAf_-AA__8AAB__4AD__wAAH__gAP__AAAf_-AA__8AAB__4AD__wAAH__gAP__AAAf_-AA__8AAB__4AD__wAAH__gAP__AAAf_-AA__-AAD__4AD__4AAP__gAH__wAB__-AAf__gAP__4AB___AB___gAD___Af__-AAP_______4AA________gAB_______-AAD_______4AAP_______gAAf______-AAA_______4AAD_______gAAH______-AAAP______4AAAP______gAAAf_____-AAAAf_____4AAAA______gAAAAf__f_-AAAAAP_h__4AAAAAAAH__gAAAAAAAf_-AAAAAAAB__4AAAAAAAH__gAP__AAAf__AA__8AAB__8AD__wAAH__wAP__AAAf__AA__8AAB__8AD__wAAH__gAP__AAAf_-AA__8AAB__4AD__4AAP__gAP__gAA__-AAf__AAH__4AB__-AA___AAH__8AH__8AAP__8B___wAA_______-AAD_______4AAH_______AAAP______4AAA_______gAAB______8AAAD______gAAAH_____-AAAAP_____gAAAAf____8AAAAA_____gAAAAB____8AAAAAB____AAAAAAB___wAAAAAAB__8AAAAAAAA_-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
     }
    }
   }
  }
 },
 "flint": {
  "anton": {
   "a": {
    "strip_h": 44,
    "digit_h": 42,
    "ring": 1,
    "shadow": 0,
    "cell_w": 28,
    "glyphs": {
     "0": {
      "w": 24,
      "bits": "AAAAAP8AA__gD__wH__4H__8P__8P__8f__-f-P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f-f-f__-P__-P__8H__8H__4D__wA__AAP8AAAAA"
     },
     "1": {
      "w": 16,
      "bits": "AAAA_gH-A_4H_h_-f_5__n_-f_5__nv-Y_4D_gP-A_4D_gP-A_4D_gP-A_4D_gP-A_4D_gP-A_4D_gP-A_4D_gP-A_4D_gP-A_4D_gP-A_4D_gP-A_4AAA"
     },
     "2": {
      "w": 25,
      "bits": "AAAAAAD_AAAD_-AAB__wAA__-AAf__wAH__8AD___gA___4AP-P-AD_j_wA_wf8Af8H_AH_B_wB_wf8Af8P-AH_D_gB_w_4AAAP-AAAH_AAAB_wAAA_4AAAf-AAAH_AAAD_wAAB_4AAA_8AAAP-AAAH_AAAD_wAAB_4AAA_8AAAP-AAAH_gAAB_wAAA___4AP__-AD___gA___4AP__-AH___gB___4Af__-AAAAAAA"
     },
     "3": {
      "w": 24,
      "bits": "AAAAAP8AB__gD__wH__4P__8P__8P__8f__-f-f-f8P-f8P-f8P-AAP-AAP-AA_8AD_8AD_8AD_4AD_gAD_4AD_8AD_8AA_8AAf-AAP-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8f-f__8P__8P__8P__4H__wD__wB__AAf8AAAAA"
     },
     "4": {
      "w": 26,
      "bits": "AAAAAAB__gAAf_4AAH_-AAD__gAA__4AAP_-AAD__gAB__4AAf_-AAH7_gAD-_4AA_v-AAP7_gAD8_4AB_P-AAfz_gAH8_4AB_P-AA_j_gAP4_4AD-P-AB_j_gAfw_4AH8P-AB_D_gA_w_4AP4P-AD-D_gA___-Af___gH___4B___-Af___gH___4B___-AAAP-AAAD_gAAA_4AAAP-AAAD_gAAA_4AAAP-AAAAAAA"
     },
     "5": {
      "w": 24,
      "bits": "AAAAP__8P__8P__8P__8P__8P__8P__8P__8P8AAP8AAP8AAP8cAP9_gP__wP__4P__8P__8P__8P-f-P8P-P8P-P8P-AAP-AAP-AAP-AAP-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f-P-f__-P__8P__8P__4H__4D__wA__gAP8AAAAA"
     },
     "6": {
      "w": 25,
      "bits": "AAAAAAB_gAAD_-AAB__4AA___AAf__wAH__-AD___gA_4_4AP8H-AD_B_gA_wf4Af8H-AH_AAAB_wAAAf8AAAH_AAAB_z-AAf9_wAH__-AB___wAf__-AH___gB___4Af-P-AH_D_gB_w_8Af8P_AH_D_wB_w_8Af8P_AH_D_wB_w_4AP8P-AD_j_gA___4AP__-AD___AAf__wAD__4AA__8AAD_-AAAP-AAAAAAAA"
     },
     "7": {
      "w": 23,
      "bits": "AAAAf__8f__8f__8f__8f__8f__8f__8f__8AA_4AA_4AA_4AB_wAB_wAD_wAD_gAH_gAH_AAH_AAP_AAP-AAf-AAf8AAf8AA_8AA_4AA_4AB_4AB_wAB_wAB_wAD_wAD_gAD_gAD_gAH_gAH_gAH_gAH_AAH_AAH_AAH_AAP_AAAAAA"
     },
     "8": {
      "w": 24,
      "bits": "AAAAAP8AB__gD__wH__4P__8P__8f__-f__-f-P-f8P-f8P-f8P-f8P-f-P-P__-P__8H__4D__wD__4H__8P__8P__-f-f-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f8P-f-f-P__8P__8P__8H__4D__4D__wA__AAP8AAAAA"
     },
     "9": {
      "w": 25,
      "bits": "AAAAAAD_gAAD_-AAB__4AA__-AAf__wAH__8AD___gA___4AP-P-AD_j_gB_4f8Af-H_AH_h_wB_4f8Af-H_AH_h_wB_4f8Af-P_AD_j_wA___8AP___AD___wAf__8AH___AA_9_wAD-f8AAAH_AAAB_wAAAf8AAAH-AD_B_gA_wf4AP8H-AD_D_gA_4_4AP__-AD___AAf__wAH__4AA__8AAD_-AAAP-AAAAAAAA"
     },
     ":": {
      "w": 10,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf4B_gH-Af4B_gH-Af4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf4B_gH-Af4B_gH-Af4AAAAAAAAAAAAAAAAAAAA"
     }
    }
   },
   "b": {
    "strip_h": 64,
    "digit_h": 62,
    "ring": 1,
    "shadow": 0,
    "cell_w": 48,
    "glyphs": {
     "0": {
      "w": 34,
      "bits": "AAAAAAAAAEAAAAAf_wAAAP__wAAB___wAAP___gAB____AAP___8AA____4AH____gAf____AD____8AP____wA__g__gD_-D_-AP_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4A__g__gD_-H_-AP____4A_____AB____8AH____wAf___-AA____wAB____AAD___4AAH___AAAP__wAAAH_8AAAAAwAAAAAAAAAA"
     },
     "1": {
      "w": 22,
      "bits": "AAAAAAAAAB_4AB_4AD_4AH_4AP_4A__4D__4f__4f__4f__4f__4f__4f__4f__4f__4fP_4cP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AP_4AAAAAAAA"
     },
     "2": {
      "w": 34,
      "bits": "AAAAAAAAAAAAAAAP_AAAAH__gAAB___AAAP___AAB___-AAP___8AB____wAH____gAf___-AD____8AP____wA__h__AD_8H_8Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__AH_8H_8Af_wf_wB__B__AAAAP_8AAAA__gAAAD_-AAAAf_4AAAB__AAAAP_8AAAB__gAAAH_-AAAA__wAAAH_-AAAA__wAAAH__AAAAf_4AAAD__AAAAf_4AAAD__gAAAP_8AAAB__gAAAP_8AAAB__gAAAH_-AAAA__wAAAD_-AAAAf_4AAAB__AAAAP____wA_____AD____8AP____wB_____AH____8Af____wB_____AH____8Af____wB_____AAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 34,
      "bits": "AAAAAAAAAAAAAAAP_AAAAH__gAAB___gAAP___AAB___-AAP___8AB____4AH____gAf____AD____8AP____wA__x__AD_-D_-AP_wP_4A__A__gD_8D_-AP_wP_4AAAA__gAAAD_-AAAAf_wAAAH__AAAD__8AAAP__gAAA__-AAAD__wAAAP_-AAAA__gAAAD__gAAAP__AAAA__-AAAD__4AAAP__wAAAH__AAAAH_8AAAAf_wAAAA__gAAAD_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_wA__A__AD_-H_8AP____wA_____AD____4AH____gAf___8AA____wAD___-AAH___wAAP__-AAAP__wAAAP_4AAAAAgAAAAAAAAAA"
     },
     "4": {
      "w": 35,
      "bits": "AAAAAAAAAAAAAAAP__4AAA___gAAH__-AAAf__4AAB___gAAP__-AAA___4AAD___gAAP__-AAB___4AAH___gAAf__-AAB___4AAP___gAA___-AAD_v_4AAf-__gAB_7_-AAH_v_4AAf8__gAD_z_-AAP_P_4AA_8__gAH_j_-AAf-P_4AB_4__gAH_j_-AA_8P_4AD_w__gAP_D_-AA_8P_4AH_w__gAf-D_-AB_4P_4AP_g__gA_-D_-AD_wP_4AP_A__gB_8D_-AH_wP_4Af-A__gB_____wH_____Af____8B_____wH_____Af____8B_____wH_____Af____8AAAD_-AAAAP_4AAAA__gAAAD_-AAAAP_4AAAA__gAAAD_-AAAAP_4AAAA__gAAAD_-AAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 33,
      "bits": "AAAAAAAAAAAAAD____4AP____gA____-AD____4AP____gA____-AD____4AP____gA____-AD____4AP____gA_-AAAAD_4AAAAP_gAAAA_-AAAAD_4AAAAP_gAAAA_-f-AAD_7_-AAP___8AA____4AD____gAP____AA____8AD____4AP____gA__j_-AD_8H_8AP_gf_wA_-B__AD_4H_8AAAAf_wAAAB__AAAAH_8AAAAf_wAAAB__AAAAH_8Af_gf_wB_-B__AH_4H_8Af_gf_wB_-B__AH_4H_8Af_gf_wB_-B__AH_4H_8Af_gf_wB__B__AH_8H_8Af____gB____-AH____4AP____AA____8AB____gAH___-AAP___wAAP__-AAAf__gAAAf_4AAAABgAAAAAAAAAA"
     },
     "6": {
      "w": 34,
      "bits": "AAAAAAAAAEAAAAA__wAAAP__wAAD___wAAf___gAB____AAP___8AB____4AH____gAf____AD____8AP____wA__B__AD_8D_8Af_wP_wB__A__AH_8D_8Af_wP_wB__AAAAH_8AAAAf_wAAAB__AAAAH_8AAAAf_x_gAB__P_gAH____gAf____AB____8AH____4Af____gB_____AH____8Af____wB_____AH_-P_8Af_wf_wB__B__gH_8H_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8H_8Af_wf_wB__B__AH_8H_8AP____wA____-AD____4AP____gAf___8AB____wAD___-AAH___wAAP__-AAAf__wAAAP_4AAAAAwAAAAAAAAAA"
     },
     "7": {
      "w": 33,
      "bits": "AAAAAAAAAAAAAH____8Af____wB_____AH____8Af____wB_____AH____8Af____wB_____AH____8Af____gAAAD_-AAAAP_4AAAB__gAAAH_8AAAAf_wAAAD__AAAAP_4AAAB__gAAAH_8AAAA__wAAAD__AAAAP_4AAAB__gAAAH_8AAAA__wAAAD_-AAAAP_4AAAB__gAAAH_8AAAAf_wAAAD__AAAAP_4AAAB__gAAAH_-AAAAf_wAAAD__AAAAP_8AAAA__gAAAD_-AAAAf_4AAAB__gAAAH_8AAAA__wAAAD__AAAAP_8AAAA__gAAAD_-AAAAf_4AAAB__gAAAH_-AAAAf_wAAAB__AAAAH_8AAAA__wAAAD__AAAAP_8AAAA__wAAAD__AAAAP_8AAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 33,
      "bits": "AAAAAAAAAIAAAAB__gAAAf__wAAH___gAA____AAH___-AAf___8AD____wAP____gB____-AH____4Af____wB__D__AH_8H_8Af_gf_wB_-B__AH_4H_8Af_gf_wB_-B__AH_4H_8Af_wf_wB__j_-AH____4AP____gA____8AB____gAD___8AAH___gAA____gAH____AA____-AD____4Af____gB__j__AH_8H_8Af_gf_wB_-B__AH_4D_8Af_gP_wB_-A__AH_4D_8Af_gP_wB_-A__AH_4D_8Af_gP_wB_-B__AH_4H_8Af_wf_wB__D__AH____4Af____gA____-AD____4AP____AAf___8AB____gAD___-AAH___wAAP__-AAAf__gAAAP_4AAAABgAAAAAAAAAA"
     },
     "9": {
      "w": 34,
      "bits": "AAAAAAAAAIAAAAA__wAAAP__wAAB___wAAf___gAB____AAP___8AB____4AH____gA____-AD____8AP____wA__h__AH_8D_8Af_wP_wB__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_8D_-Af_wP_4B__A__gH_-H_-Af_4f_4B_____gH____-AP____4A_____gD____-AH____4Af____gA____-AB__v_4AD_8__gAB_D_-AAAAP_4AAAA__gAAAD_-AAAAP_4AAAA__gD_4D_-AP_gP_wA_-A__AD_4D_8AP_wP_wA__A__AD_8H_8AP____wA____-AD____4AP____gAf___8AB____wAD___-AAH___wAAP__-AAAP__wAAAP_8AAAABgAAAAAAAAAA"
     }
    }
   }
  },
  "bebas": {
   "a": {
    "strip_h": 44,
    "digit_h": 42,
    "ring": 1,
    "shadow": 0,
    "cell_w": 28,
    "glyphs": {
     "0": {
      "w": 21,
      "bits": "AAAAACAAA_8AD_-AH__AP__gP__gf4_wfwfwfwPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfwfwf4_wP__gP__gH__AD_-AA_8AACAAAAAA"
     },
     "1": {
      "w": 15,
      "bits": "AAAAAAB8APwA_Af8f_x__H_8f_x__AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AAAAAA"
     },
     "2": {
      "w": 21,
      "bits": "AAAAACAAA_8AD_-AH__AH__gP__gP4_wPwfwfwPwfgPwfgPwfgPwfgPwfgPwAAfwAAfgAA_gAA_gAB_AAD-AAD-AAH8AAP4AAfwAA_gAB_AAD_AAD-AAH8AAH4AAP4AAPwAAPwAAfwAAfwAAf__wf__wf__wf__wf__wf__wAAAAAAAA"
     },
     "3": {
      "w": 21,
      "bits": "AAAAACAAA_4AD_-AH__AP__AP__gP5_gfwfwfgfwfgfwfgfwfgfwAAfwAAfwAAfgAAfgAA_gAf_AAf-AAf4AAf-AAf_AAf_gAA_gAAfwAAfwAAfwAAPwfgPwfgPwfgPwfgPwfgfwfgfwfwfwf5_gP__gP__gH__AD_-AB_4AACAAAAAA"
     },
     "4": {
      "w": 23,
      "bits": "AAAAAAAAAA_gAA_gAB_gAB_gAB_gAD_gAD_gAH_gAH_gAP_gAP_gAP_gAf_gAffgA_fgA-fgB-fgB-fgB8fgD8fgD4fgH4fgH4fgPwfgPwfgPgfgfgfgf__8f__8f__8f__8f__8f__8AAfgAAfgAAfgAAfgAAfgAAfgAAfgAAAAAAAA"
     },
     "5": {
      "w": 21,
      "bits": "AAAAAAAAP__gP__gP__gP__gP__gP__gPwAAPwAAPwAAPwAAPwAAPwAAPz8AP3_AP__gP__gf__wf__wfwfwfwfwfgPwfgPwAAPwAAPwAAPwAAPwAAPwfgPwfgPwfgPwfgPwfgPwfgPwfwfwP4_wP__gH__gH__AD_-AA_8AACAAAAAA"
     },
     "6": {
      "w": 21,
      "bits": "AAAAACAAA_8AD_-AH__AP__gP__gP8_wfwPwfwPwfwPwfgPwfgAAfgAAfgAAfgAAfh8Afn_Afv_gfv_gf__wf__wf4fwfwPwfwPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfwPwfwfwP8_wP__wH__gH__AD_-AA_8AACAAAAAA"
     },
     "7": {
      "w": 21,
      "bits": "AAAAAAAAf__wf__wf__wf__wf__wf__wAAPwAAfwAAfgAAfgAA_gAA_AAA_AAA_AAB_AAB-AAB-AAD-AAD8AAD8AAH8AAH8AAH4AAH4AAP4AAPwAAPwAAfwAAfgAAfgAA_gAA_gAA_AAA_AAB_AAB-AAB-AAD-AAD-AAD8AAAAAAAAAA"
     },
     "8": {
      "w": 22,
      "bits": "AAAAACAAA_8AD_-AH__AP__gP__gf4_wfwfwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfwfwP4fgP__gH__AB_-AD__AH__gP__gfwfwfwPwfgPwfgP4fgP4fgP4fgP4fgP4fgP4fgP4fgPwfwfwf4_wP__wP__gH__AD_-AB_8AACAAAAAA"
     },
     "9": {
      "w": 21,
      "bits": "AAAAACAAB_4AD_-AH__AP__gP__gf4_wfwfwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfgPwfwfwf4_wf__wf__wP_vwH_vwD_PwA8PwAAPwAAPwAAPwAAPwfgPwfgPwfgfwfwfwf5_wP__gP__gH__AD_-AB_4AACAAAAAA"
     },
     ":": {
      "w": 9,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH8AfwB_AH8AfwB_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfwB_AH8AfwB_AH8AAAAAAA"
     }
    }
   },
   "b": {
    "strip_h": 64,
    "digit_h": 62,
    "ring": 1,
    "shadow": 0,
    "cell_w": 48,
    "glyphs": {
     "0": {
      "w": 31,
      "bits": "AAAAAAAf8AAA__4AA___AAf__4AP___AH___4B____A____wP___-D_wP_h_4B_4f-AP-H_AD_h_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_8f8AP_H_AD_x_wA_4f-AP-H_gH_g_8D_4P___-D____Af___wH___4A___8AH__-AA___AAD__AAAH_AAAAAAAA"
     },
     "1": {
      "w": 21,
      "bits": "AAAAAAAAAAPwAAfwAAfwAA_wAB_wAD_wAf_wf__wf__wf__wf__wf__wf__wf__wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAB_wAAAAAAAA"
     },
     "2": {
      "w": 31,
      "bits": "AAAAAAAf8AAA__4AAf__AAf__8AP___AD___4B____Af___wP___-D_wP_g_4B_4P-AP-H_AD_h_wA_8f8AP_H_AD_x_wA_8f8AP-H_AD_h_wA_4f8Af-AAAH_gAAB_wAAA_8AAAP_AAAH_gAAD_4AAA_8AAAf-AAAP_gAAH_wAAD_4AAA_-AAAf_AAAP_gAAH_wAAD_4AAB_8AAA_-AAAP_AAAH_gAAD_4AAA_8AAAf-AAAH_gAAB_wAAA_8AAAP-AAAD_gAAA_4AAAP-AAAH_gAAB____4f___-H____h____4f___-H____h____4f___-H____gAAAAAAAAAAA"
     },
     "3": {
      "w": 30,
      "bits": "AAAAAAAf4AAA__wAA___AAf__4AP___AH___4B___-A____wP___8D_wf_B_4D_wf8Af-H_AH_h_wB_4f8Af-H_AH_h_wB_4f8Af-AAAH_gAAB_4AAAf-AAAH_AAAB_wAAA_8AAAf-AAP__gAD__wAA__4AAP_8AAD_8AAA__wAAP__AAD__4AA__-AAAP_wAAA_8AAAH_AAAB_4AAAf-AAAH_gAAA_4AAAP-H_AD_h_wA_4f8AP-H_AD_h_wA_4f8AP-H_AH_h_wB_4f8Af-H_gH_h_8D_wP___8D____Af___gH___4A___8AH__-AA___AAD__AAAP-AAAAAAAA"
     },
     "4": {
      "w": 34,
      "bits": "AAAAAAAAAAAAAAAAP_gAAAA_-AAAAH_4AAAAf_gAAAB_-AAAAP_4AAAA__gAAAH_-AAAAf_4AAAD__gAAAP_-AAAA__4AAAH__gAAAf_-AAAD__4AAAP__gAAB__-AAAH__4AAAf__gAAD_f-AAAP9_4AAB_3_gAAH-f-AAA_5_4AAD_H_gAAP8f-AAB_h_4AAH-H_gAA_4f-AAD_B_4AAP8H_gAB_gf-AAH-B_4AA_4H_gAD_Af-AAf8B_4AB_gH_gAH-Af-AA_4B_4AD_AH_gAf____4B_____gH____-Af____4B_____gH____-Af____4B_____gH____-AAAAf-AAAAB_4AAAAH_gAAAAf-AAAAB_4AAAAH_gAAAAf-AAAAB_4AAAAH_gAAAAf-AAAAB_4AAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 30,
      "bits": "AAAAAAAAAAAf___wH___8B____Af___wH___8B____Af___wH___8B____A_4AAAP-AAAD_gAAA_4AAAP-AAAD_gAAA_4AAAP-AAAD_gAAA_4DgAP-P_AD_n_4A_7__AP___4D____A____wP___-D____g_-H_4f_Af-H_gH_h_4A_4f8AP-H_AD_gAAA_4AAAP-AAAD_gAAA_4AAAP-AAAD_gAAA_4AAAP-H_AD_h_wA_4f8AP-H_AD_h_wA_4f8AP-H_AD_h_wA_4P-AP-D_gH_g_8D_4P___-B____Af___wD___4A___8AH__-AA___AAD__gAAH_AAAAAAAA"
     },
     "6": {
      "w": 31,
      "bits": "AAAAAAAf8AAA__4AA___AAf__8AP___gH___4B____A____wP___-D_4H_g_8A_4f-AP-H_gB_h_4Af8f-AH_H_gB_x_4AAAf-AAAH_gAAB_4AAAf-AAAH_gAAB_4BAAf-H_AH_n_8B_7__gf___8H____B____4f___-H____h_-D_4f_Af_H_gD_x_4A_8f-AP_H_gD_x_4A_8f-AP_H_gD_x_4A_8f-AP_H_gD_x_4A_8f-AP_H_gD_x_4A_8f-AP_H_gD_x_4A_8f-AP_D_gH_g_8B_4P___-D____Af___wD___4A___-AH___AA___AAD__gAAH_AAAAAAAA"
     },
     "7": {
      "w": 30,
      "bits": "AAAAAAAAAAB____4f___-H____h____4f___-H____h____4f___-H____gAAA_4AAAf-AAAH_AAAB_wAAAf8AAAP_AAAD_gAAA_4AAAf-AAAH_AAAB_wAAA_8AAAP_AAAD_gAAA_4AAAf-AAAH_AAAB_wAAA_8AAAP_AAAD_gAAA_4AAAf-AAAH_AAAB_wAAA_8AAAP_AAAD_gAAB_4AAAf-AAAH_AAAB_wAAA_8AAAP_AAAD_gAAB_4AAAf-AAAH_AAAB_wAAA_8AAAP_AAAD_gAAB_4AAAf-AAAH_AAAD_wAAA_8AAAP_AAAD_gAAB_4AAAf-AAAAAAAAAAAAAA"
     },
     "8": {
      "w": 32,
      "bits": "AAAAAAAP-AAAf_8AAf__gAP__-AH___gD___8A____gf___4H____D_4H_w_8A_8P_AH_D_gB_4_4Af-P-AH_j_gB_4_4Af-P-AH_j_gB_4_4Af-P-AH_D_gB_w_8Af8H_AP_B_4H_gP___4D___8Af__-AD___AAP__gAP__8AH___wD___8B____gf_B_8P_AP_D_wB_w_4Af-P-AH_n_gB_5_4AP-f-AD_n_gA_5_4AP-f-AD_n_gA_5_4AP-f-AH_n_gB_4_4Af-P_AH_j_wD_4_-B_8P____B____wf___4D___-Af___AD___gAf__wAB__wAAH_gAAAAAAA"
     },
     "9": {
      "w": 30,
      "bits": "AAAAAAA_4AAA__wAA___AAf__4AP___AH___4D___-A____wP___8H_wP_h_4B_4f8Af-H_AD_h_wA_4f8AP-H_AD_h_wA_4f8AP-H_AD_h_wA_4f8AP-H_AD_h_wA_4f8AP-H_AD_h_wA_4f8AP-H_AD_h_4B_4f-Af-H_4f_h____4f___-D____g____4H__v-A__z_gH_4_4A_8P-AAwD_gAAA_4AAAP-AAAD_gAAA_4AAAP-AAAD_h_wA_4f8AP-H_AD_h_wA_4f8Af-H_gH_h_8D_4P___8D____Af___gH___4A___8AH__-AA___AAD__AAAP-AAAAAAAA"
     }
    }
   }
  },
  "barlow": {
   "a": {
    "strip_h": 44,
    "digit_h": 40,
    "ring": 1,
    "shadow": 0,
    "cell_w": 28,
    "glyphs": {
     "0": {
      "w": 25,
      "bits": "AAAAAAD_AAAD_8AAB__wAB__-AAf__wAP__8AD___gB_w_4Af8H-AH-B_gB_gf8Af4H_AH-B_wB_gf8Af4H_AH-B_wB_gf8Af4H_AH-B_wB_gf8Af4H_AH-B_wB_gf8Af4H_AH-B_wB_gf8Af4H_AH-B_wB_gf8Af4H_AH-B_gB_gf4Af8P-AD___gA___wAH__8AB__-AAP__AAA__AAAD_AAAAAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 15,
      "bits": "AAAH_D_8f_x__H_8f_x__H_8A_wD_AP8A_wD_AP8A_wD_AP8A_wD_AP8A_wD_AP8A_wD_AP8A_wD_AP8A_wD_AP8A_wD_AP8A_wD_AP8A_wD_AAAAAAAAA"
     },
     "2": {
      "w": 25,
      "bits": "AAAAAAB_gAAB_-AAB__wAA__-AAf__wAH__-AD___gA_4_4AP8H_AH_B_wB_wf8Af8H_AH_B_wA_gf8AAAH-AAAD_gAAA_4AAAf8AAAH_AAAD_gAAB_4AAAf8AAAP-AAAH_gAAD_wAAA_4AAAf8AAAP_AAAH_gAAD_wAAA_4AAAf8AAAP_AAAD___wA___8AP___AD___wA___8AP___AD___wAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 24,
      "bits": "AAAAP__-P__-P__-P__-P__-P__-P__-AAf-AA_8AB_4AB_wAD_wAH_gAP_AAf-AA_-AA__gAf_4AP_4AHP8AAH-AAH-AAH-AAD-AAD-AAD-AAD-f8D-f8D-f8D-f8H-P8H-P-P-P__-P__8H__8D__4B__wA__gAH-AAAAAAAAAAAAA"
     },
     "4": {
      "w": 28,
      "bits": "AAAAAAB_gAAA_4AAAP-AAAD_gAAB_wAAAf8AAAH_AAAD_gAAA_4AAAP-AAAH_AAAB_wAAAf8AAAP-AAAD_gAAA_4AAAf8P8AH_D_AB_w_wA_4P8AP-D_AD_g_wB_wP8Af___4H___-B____gf___4H___-B____gf___4AAA_wAAAP8AAAD_AAAA_wAAAP8AAAD_AAAA_wAAAP8AAAD_AAAA_wAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 24,
      "bits": "AAAAf__-f__-f__-f__-f__-f__-f__-f4AAf4AAf4AAf4AAf4AAf4AAf4AAf4AAf5_Af7_wf__4f__4f__8f__8f__-f8P-f4H-AAH-AAH-AAH-AAH-AAH-f4H-f4H-f8P-f8P-P__8P__8P__8H__4D__wA__AAP8AAAAAAAAAAAAA"
     },
     "6": {
      "w": 24,
      "bits": "AAAAAP8AA__AD__gH__wP__4P__8f__8f8f8f4P-f4P-f4P-f4H-f4AAf4AAf5-Af__gf__wf__4f__8f__8f8f8f8P-f4H-f4H-f4H-f4H-f4H-f4H-f4H-f4H-f4H-f8P-f8P-P__-P__8H__8H__4D__wA__gAP8AAAAAAAAAAAAA"
     },
     "7": {
      "w": 24,
      "bits": "AAAAf__-f__-f__-f__-f__-f__-f__-fgP-fgP-fgP8AAf8AAf8AAf4AA_4AA_4AA_wAA_wAB_wAB_wAB_gAD_gAD_gAD_AAH_AAH_AAH_AAH-AAP-AAP-AAP8AAf8AAf8AAf4AA_4AA_4AA_4AA_wAB_wAB_wAB_gAAAAAAAAAAAAA"
     },
     "8": {
      "w": 24,
      "bits": "AAAAAP4AA__AD__gH__wP__4P__8f__8f8f8f4P-f4P-f4H-f4H-f4H-f4P8f4P8P8f8P__4H__wD__gB__gH__wH__4P8f8P8P8f4P8f4H-f4H-f4H-f4H-f4H-f4P-f4P8f8f8P__8P__4H__4H__wD__gA__AAP4AAAAAAAAAAAAA"
     },
     "9": {
      "w": 24,
      "bits": "AAAAAP8AA__gD__wH__4P__8P__8P__-f-P-f8H-f8H-f4H-f4H-f4H-f4H-f4H-f4H-f8H-f8H-P-P-P__-P__-H__-D__-B__-Afn-AAH-AAH-P4H-P8H-P8H-P8H-P8H-P-P-P__-H__8H__8D__4B__wA__gAP8AAAAAAAAAAAAA"
     },
     ":": {
      "w": 12,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAD_AP8A_4H_gP-A_wB_ADwAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AP8A_wD_gf-A_4D_AH8APAAAAAAAAAA"
     }
    }
   },
   "b": {
    "strip_h": 64,
    "digit_h": 62,
    "ring": 1,
    "shadow": 0,
    "cell_w": 48,
    "glyphs": {
     "0": {
      "w": 35,
      "bits": "AAAAAAAAAEAAAAAf_wAAAH__wAAB___wAAP___gAB____AAP___-AB____8AH____wA_____gD____-Af_4P_4B__Af_wH_4B__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gD_8B_-Af_wH_8B__Af_4P_8A_____gD____-AH____wAf____AA____4AB____AAD___4AAH___AAAH__wAAAH_8AAAAAQAAAAAAAAAA"
     },
     "1": {
      "w": 22,
      "bits": "AAAAAAAAAP_4B__4H__4f__4f__4f__4f__4f__4f__4f__4f__4f__4YH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AH_4AAAAAAAA"
     },
     "2": {
      "w": 36,
      "bits": "AAAAAAAAACAAAAAP_wAAAH__4AAA___wAAP___gAB____AAP___-AA____8AH____wAf____gD____-AP_8P_8A__Af_wH_8B__Af_wD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_gH_8AAAAf_wAAAB__AAAAP_4AAAA__gAAAH_-AAAAf_wAAAD__AAAAP_8AAAB__gAAAH_8AAAA__wAAAH_-AAAA__4AAAD__AAAAf_4AAAD__AAAAf_8AAAB__gAAAP_8AAAB__gAAAP_-AAAA__wAAAH_-AAAA__wAAAH__AAAA__4AAAD__AAAAf_4AAAD__AAAAf_8AAAB_____4H_____gf____-B_____4H_____gf____-B_____4H_____gf____-B_____4AAAAAAAAAAAAAA"
     },
     "3": {
      "w": 35,
      "bits": "AAAAAAAAAAAAAD____-AP____8A_____wD_____AP____8A_____wD_____AP____8A_____wD_____AAAAf_8AAAD__gAAAf_8AAAB__gAAAP_8AAAB__wAAAP_-AAAB__wAAAH_-AAAA__wAAAH__AAAA__4AAAH__AAAA__8AAAD__-AAAH__-AAAP__8AAAf__4AAA___gAABx__AAACB_8AAAAH_4AAAAP_gAAAA_-AAAAD_4AAAAP_gAAAA__AAAAD_8AAAAP_wAAAA__AAAAD_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4A__Af_wD_4B__Af_gH_8B_-AP_8P_4A_____gD____8AH____wAf___-AA____4AB____AAD___4AAH___AAAH__wAAAH_8AAAAA4AAAAAAAAAA"
     },
     "4": {
      "w": 41,
      "bits": "AAAAAAAAAAAAAAAAAAf_wAAAAAf_wAAAAA__gAAAAA__gAAAAA__gAAAAB__AAAAAB__AAAAAB__AAAAAD_-AAAAAD_-AAAAAD_-AAAAAH_8AAAAAH_8AAAAAH_8AAAAAP_4AAAAAP_4AAAAAP_4AAAAAf_4AAAAAf_wAAAAAf_wAAAAA__wAAAAA__gAAAAA__gAAAAB__g__AAB__A__AAB__A__AAD__A__AAD_-A__AAD_-A__AAH_-A__AAH_8A__AAH_8A__AAP_8A__AAP_4A__AAP_____8Af_____8Af_____8Af_____8Af_____8Af_____8Af_____8Af_____8Af_____8Af_____8AAAAA__gAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAA__AAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 35,
      "bits": "AAAAAAAAAAAAAH____-Af____4B_____gH____-Af____4B_____gH____-Af____4B_____gH____-Af_gAAAB_-AAAAH_4AAAAf_gAAAB_-AAAAH_4AAAAf_gAAAB_-AAAAH_4AAAAf_gAAAB_-AAAAH_4AAAAf_geAAB_-P_gAH_7__AAf___-AB____8AH____4Af____wB_____AH____8Af____4B_____gH_8D_-Af_gH_4B_-Af_gH_wB_-AAAAH_8AAAAf_wAAAA__AAAAD_8AAAAP_wAAAA__Af_AD_8B_-Af_wH_4B__Af_gH_8B__Af_gH_8D_-Af_4f_4A_____gD____-AH____wAf____AA____4AD____AAH___4AAH___AAAP__wAAAP_8AAAAAwAAAAAAAAAA"
     },
     "6": {
      "w": 35,
      "bits": "AAAAAAAAAEAAAAAf_wAAAP__wAAB___gAAf___gAD____AAf___8AB____4AP____wA_____AH____8Af_4f_4B__A__gH_4D_-Af_gH_4B_-Af_gH_4B_-Af_gH_4B_-Af_gH_4AAAAf_gAAAB_-AAAAH_4fwAAf_n_wAB____wAH____gAf____AB____-AH____4Af____wB_____AH_-H_-Af_wP_4B__Af_gH_4B_-Af_gH_4B_-Af_wH_4B__Af_gH_8B_-AP_wH_4A__Af_gD_8B_-AP_wH_4B__Af_gH_8B_-Af_wH_4B__Af_gH_8B__Af_wH_8D_-AP_4f_4A_____gD____-AH____wAf____AA____4AB____AAH___4AAH___AAAP__wAAAH_8AAAAAwAAAAAAAAAA"
     },
     "7": {
      "w": 35,
      "bits": "AAAAAAAAAAAAAH_____Af____8B_____wH_____Af____8B_____wH_____Af____8B_____wH_____Af-AH_8B_4Af_wH_gB__Af-AP_4B_4A__gAAAD_-AAAAP_wAAAB__AAAAH_8AAAAf_gAAAD_-AAAAP_4AAAA__gAAAH_8AAAAf_wAAAB__AAAAH_4AAAA__gAAAD_-AAAAP_4AAAB__AAAAH_8AAAAf_wAAAB_-AAAAP_4AAAA__gAAAD_8AAAAf_wAAAB__AAAAH_8AAAA__gAAAD_-AAAAP_4AAAA__AAAAH_8AAAAf_wAAAB__AAAAP_4AAAA__gAAAD_-AAAAP_wAAAB__AAAAH_8AAAAf_gAAAD_-AAAAP_4AAAA__gAAAD_8AAAAf_wAAAB__AAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 34,
      "bits": "AAAAAAAAAIAAAAAf_gAAAP__wAAB___gAAf___AAD___-AAP___8AB____4AP____gA_____AD____8Af_4f_4B__A__gH_4D_-Af_gH_4B_-Af_gH_4B_-Af_gH_4B_-Af_gH_4B_-Af_gH_4B_-Af_gH_4D_8AP_wP_wA__h_-AB____4AH____AAP___4AAf___AAA___4AAD___wAAf___wAD____AAf___-AB_-H_4AP_wP_wA_-A__AH_4B_-Af_gH_4B_-Af_gH_4B_-Af_gH_4B_-Af_gH_4B_-Af_gH_4B_-Af_gH_4B_-Af_gH_4B_-A__gH_8D_8AP_4f_wA_____AD____4AH____gAf___8AA____wAB___-AAD___wAAH__-AAAH__gAAAH_4AAAAAwAAAAAAAAAA"
     },
     "9": {
      "w": 35,
      "bits": "AAAAAAAAAEAAAAA__wAAAP__wAAD___wAAf___gAD____AAf___-AB____4AP____wA_____AH____-Af_4f_4B__A__gH_8B_-Af_gH_4B_-Af_gH_4B_-Af_gH_8B_-Af_wH_4B__Af_gH_8B_-Af_wH_4B__Af_gH_8B_-Af_wH_4B__Af_gH_8B__Af_wH_8D__AP_4f_8A_____wD_____AH____8AP____wA_____AB____8AD____wAD_9__AAD_H_8AAAAf_wAAAB__AAAAH_8AAAAf_wH_8B__Af_wH_8B__Af_wH_8B__Af_wH_8A__Af_wD_-D_-AP_8f_4A_____gD____-AH____wAf____AA____4AB____AAD___4AAH___AAAH__wAAAH_8AAAAAwAAAAAAAAAA"
     }
    }
   }
  },
  "francois": {
   "a": {
    "strip_h": 44,
    "digit_h": 41,
    "ring": 1,
    "shadow": 0,
    "cell_w": 28,
    "glyphs": {
     "0": {
      "w": 27,
      "bits": "AAAAAAAEAAAAf-AAAf_wAAP_-AAH__wAB__-AA___gAP4P8AH8B_AB_Af4AfwD-AP4A_gD-AP4A_gD-AP4A_wD-AP8A_gD_AP4A_wH-AP8B_gD_Af4A_wH-AP8A_gD_AP4A_wD-AP8A_gD_AP4A_wD-AP4A_gD-AP8A_gB_AP4AfwH8AH8B_AA_g_wAP__4AB__-AAf__AAD__gAAf_wAAB_4AAABAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 20,
      "bits": "AAAAAAAAAHwAAfwAB_wAD_wAP_wAf_wAf_wAf_wAf_wAf_wAQ_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAA_wAf__gf__gf__gf__gf__gf__gAAAAAAAAAAAA"
     },
     "2": {
      "w": 26,
      "bits": "AAAAAAAEAAAA_8AAAf_wAAf__AAP__wAD__-AB___wA_wP8AP8B_AD-Af4B_AH-APwB_gAcAf4AAAH-AAAB_AAAA_wAAAP8AAAH-AAAB_gAAA_4AAAP8AAAH-AAAD_gAAB_wAAAf4AAAP8AAAH_AAAD_gAAB_wAAA_4AAAP8AAAH-AAAD_AAAB_gAAA___8AP___AD___wA___8AP___AD___wAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 26,
      "bits": "AAAAAAAEAAAA_-AAA__wAAf__AAP__4AH__-AB___wA_gf8ADwD_AAMAfwAAAH8AAAB_AAAAfwAAAP8AAAD_AAAB_gAAD_wAAH_4AAB_4AAAf-AAAH_4AAB__AAAH_4AAAH_AAAA_wAAAH8AAAB_gAAAf4AAAD-AAAB_gAYAf4AfAH-AfwB_gD-A_wA___8AH__-AB___gAP__wAA__wAAD_wAAADAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 28,
      "bits": "AAAAAAAAAAAAA_wAAAf8AAAH_AAAD_wAAA_8AAAf_AAAH_wAAD_8AAA__AAAf_wAAH38AAD9_AAB-fwAAfn8AAPx_AAD8fwAB-H8AAfh_AAPwfwAD8H8AB-B_AAfgfwAPwH8AD8B_AB____gf___4H___-B____gf___4AAB_AAAAfwAAAH8AAAB_AAAAfwAAAH8AAAB_AAAAfwAAAH8AAAB_AAAAgAAAAAAAAAAAAA"
     },
     "5": {
      "w": 25,
      "bits": "AAAAAAAAAAAP__wAD__8AA___AAP__wAH__8AB___AAfwAAAH8AAAB-AAAAfgAAAH4AAAB-AAAAfgAAAH4AAAD-_gAA__-AAP__wAD__-AA___wAP__-AD-D_gAfAf8AAgD_AAAAfwAAAH8AAAB_AAAAfwAAAH8AAgB_AB4AfwB-AP8AfwD-AH-B_gA___4AP__8AB__-AAP__AAB__gAAH_gAAACAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 24,
      "bits": "AAAAAAQAAH-AAf_gA__wA__4B__4D__8D-H8H8D8H8D8P4DgP4AAP4AAP4AAf4AAf4AAfx-Af3_gf__wf__4f__8f__8f8P-fwH-fwD-fwD-fwD-fwD-fwD-P4D-P4D-P4D-P4H8H8P8H__8D__4D__wB__gA__AAf-AABgAAAAAAAAA"
     },
     "7": {
      "w": 24,
      "bits": "AAAAAAAAP__-f__-f__-f__-f__-f__-AAP8AAf8AAf4AAf4AA_4AA_wAB_wAB_gAB_gAD_AAD_AAD_AAH-AAH-AAH-AAP8AAP8AAP8AAf8AAf4AAf4AAf4AA_4AA_wAA_wAA_wAA_wAB_wAB_wAB_wAB_gAB_gAB_gAAAAAAAAAAAAA"
     },
     "8": {
      "w": 26,
      "bits": "AAAAAAAEAAAA_8AAA__wAAf_-AAP__wAD__8AB___gAfwP4AP4B-AD-AfgA_gH4AP4B-AD-AfgA_wPwAH-H8AB_z-AAf__gAD__gAAf_wAAD_-AAAf_wAAf_-AAP__wAH-f-AB_D_wA_gf8AP4D_AH-Af4B_AH-AfwB_gH8Af4B_gH8Af4B_AH_A_wA___4AP__-AB___AAP__gAB__wAAH_wAAACAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 24,
      "bits": "AAAAABAAAf8AA__AD__gH__wH__wP__4P8P4f4H4f4H8fwH8fwH8fwD8fwD-fwD-fwD-f4D-f4D-f8P-P__-P__-H__-D__-B_7-Afn-AAH-AAH-AAH8AAH8AAH8DwH8PwP4PwP4P4fwP__wH__gH__AD__AB_-AA_4AACAAAAAAAAAA"
     },
     ":": {
      "w": 9,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB_AH8AfwB_AH8AfwB_AAAAAAAAAAAAAAAAAAAAfwB_AH8AfwB_AH8AfwB_AAAAAAAAAA"
     }
    }
   },
   "b": {
    "strip_h": 64,
    "digit_h": 61,
    "ring": 1,
    "shadow": 0,
    "cell_w": 48,
    "glyphs": {
     "0": {
      "w": 38,
      "bits": "AAAAAAAAA_4AAAAf_8AAAD__8AAA___4AAH___wAAf___gAD____AAf___-AB____4AP_wf_wA_-Af_AD_wA_8Af_AD_4B_4AH_gH_gAf-A_-AB_8D_4AH_wP_AAf_A_8AA_8D_wAD_wf_AAP_h_8AA_-H_wAD_4f_AAP_h_8AA_-H_wAD_4f_AAP_h_8AA_-H_wAD_4f_AAP_h_8AA_-H_wAD_4f_AAP_h_8AA_-H_wAD_4f_AAP_h_8AA_-H_wAD_4f_AAP_h_8AA_-H_wAD_wP_AAf_A_-AB_8D_4AH_wP_gAf_A_-AB_4B_4AH_gH_wA_-Af_AD_4A_8Af_AD_4B_8AP_4f_gAf___-AB____4AD____AAH___4AAf___AAA___4AAA___AAAB__wAAAA_4AAAAAAAAAAAAAAAA"
     },
     "1": {
      "w": 28,
      "bits": "AAAAAAAAAAAAB_AAAB_wAAA_8AAA__AAA__wAAf_8AAf__AAf__wAH__8AB___AAf__wAH__8AB___AAf__wAH__8ABwf_AAAH_wAAB_8AAAf_AAAH_wAAB_8AAAf_AAAH_wAAB_8AAAf_AAAH_wAAB_8AAAf_AAAH_wAAB_8AAAf_AAAH_wAAB_8AAAf_AAAH_wAAB_8AAAf_AAAH_wAAB_8AAAf_AAAH_wAAB_8AAAf_AAAH_wAAB_8AAAf_AAAH_wAAB_8AAAf_AAf___4H___-B____gf___4H___-B____gf___4H___-B____gf___4AAAAAAAAAAAAAAAAA"
     },
     "2": {
      "w": 37,
      "bits": "AAAAAAAAAf8AAAAP_-AAAD__-AAAf__8AAH___8AA____4AD____gAf____AD____-AP_4P_4B_-Af_gH_wA__A_-AD_8D_4AH_wP_AAf_B_8AB_8B_gAH_wA-AAf_AAYAB_8AAAAH_wAAAA__AAAAD_8AAAAP_gAAAB_-AAAAH_4AAAA__AAAAD_8AAAAf_wAAAB_-AAAAP_4AAAB__AAAAH_4AAAA__gAAAH_8AAAAf_gAAAD_8AAAAf_wAAAD_-AAAAf_wAAAD_-AAAAP_wAAAB__AAAAP_4AAAB__AAAAP_4AAAB__AAAAP_4AAAA__AAAAH_4AAAA__AAAAH_____Af____8B_____wH_____Af____4B_____gH____-Af____4B_____gH____-AAAAAAAAAAAAAAAAAAAAA"
     },
     "3": {
      "w": 37,
      "bits": "AAAAAAAAA_8AAAAf_8AAAH__8AAA___8AAP___4AB____wAH____gA____-AH____8Af_g__wD_4A__gD_AB_-AD4AD_4ADgAP_gAEAA_-AAAAD_8AAAAP_gAAAA_-AAAAD_4AAAAP_gAAAB_-AAAAH_wAAAA__AAAAH_4AAAB__AAAAf_8AAAf__AAAB__4AAAH_-AAAAf_4AAAB__4AAAH__wAAAf__wAAB___AAAAP_-AAAAH_8AAAAH_4AAAAP_gAAAA_-AAAAB_8AAAAH_wAAAAf_AAAAB_8AAAAH_wAAAAf_AAgAB_8APAAH_wD8AAf_B_4AD_8H_wAf_wf_gD_-A__gf_4D_____AH____8AP____gA____8AB____gAB___8AAD___AAAD__wAAAA_4AAAAAAAAAAAAAAAA"
     },
     "4": {
      "w": 40,
      "bits": "AAAAAAAAAAAAAAAAD_8AAAAf_wAAAB__AAAAP_8AAAA__wAAAH__AAAAf_8AAAD__wAAAP__AAAB__8AAAP__wAAA___AAAH__8AAAf__wAAD___AAAP9_8AAB_3_wAAH-f_AAA_5_8AAH_H_wAAf8f_AAD_h_8AAP-H_wAB_wf_AAH_B_8AA_4H_wAD_gf_AAf8B_8AD_wH_wAP-Af_AB_wB_8AH_AH_wA_4Af_AD_gB_8Af8AH_wB______n_____-f_____5______n_____-f_____5______n_____-f_____wAAAf_AAAAB_8AAAAH_wAAAAf_AAAAB_8AAAAH_wAAAAf_AAAAB_8AAAAH_wAAAAf_AAAAB_8AAAAH_wAAAAf_AAAAB_8AAAAH_gAAAAAAAAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 37,
      "bits": "AAAAAAAAAAAAAAP____AA____4AD____gAP___-AB____4AH____gAf___-AB____4AH____gAf-AAAAB_wAAAAH_AAAAAf8AAAAD_wAAAAP_AAAAA_8AAAAD_wAAAAP-AAAAA_4AAAAD_gAAAAP-AAAAA_4f4AAD___4AAf___4AB____wAH____gAf____AB____-AH____4Af____wB_-D__AH_gD_-AD8AH_4ABgAP_gAAAA__AAAAB_8AAAAH_wAAAAf_AAAAB_8AAAAD_wAAAAP_AAAAA_8AAAAH_wAMAAf_AHwAB_8D_gAH_wf-AA_-B_8AD_4H_4Af_gP_wD_8A__wf_wB____-AH____4AP____AAf___4AA____AAB___4AAB__-AAAB__wAAAA_4AAAAAAAAAAAAAAAA"
     },
     "6": {
      "w": 36,
      "bits": "AAAAAAAAAP8AAAAH_8AAAA__4AAAH__4AAA___gAAH___AAA___-AAH___4AAf___wAD_4f_AAf_Af-AB_4B_4AH_gD_gA_8AP-AD_wA_gAP_ABgAB_4AAAAH_gAAAAf-AAAAD_4AAAAP_gAAAA_-AAAAD_4AAAAP_gAAAA_-D-AAD_5_-AAf___-AB____8AH____4Af____wB_____AH____-Af____4B__g__wH_4A__Af_gD_8B_-AH_4H_4Af_gP_AA_-A_8AD_4D_wAP_gP_gA_-A_-AD_4D_4AP_gH_gA_-Af-AD_wB_4Af_AH_gB_8AP_AH_wA_8A_-AD_4D_4AH_w__AAf___8AA____gAD___8AAH___wAAf__-AAA___wAAA__8AAAB__AAAAA_wAAAAAAAAAAAAAAAA"
     },
     "7": {
      "w": 34,
      "bits": "AAAAAAAAAAAAAH____-Af____4B_____gH____-Af____4B_____gH____-Af____4B_____gH____-AAAAP_4AAAB__AAAAH_8AAAA__gAAAD_-AAAAP_wAAAB__AAAAH_4AAAA__gAAAD_8AAAAP_wAAAB__AAAAH_4AAAAf_gAAAD_8AAAAP_wAAAA__AAAAH_4AAAAf_gAAAB_8AAAAP_wAAAA__AAAAD_8AAAAf_gAAAB_-AAAAH_4AAAA__AAAAD_8AAAAP_wAAAA__AAAAH_4AAAAf_gAAAB_-AAAAH_4AAAA__AAAAD_8AAAAP_wAAAA__AAAAD_8AAAAf_wAAAB__AAAAH_4AAAAf_gAAAB_-AAAAH_4AAAAf_gAAAD_-AAAAP_4AAAA__gAAAAAAAAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 37,
      "bits": "AAAAAAAAAf4AAAAP_8AAAD__8AAA___4AAH___wAA____gAD____AAf___-AD____4AP_wP_gB_-Af_AH_wA_8Af-AD_wB_4AH_AH_gAf8Af-AB_wB_4AH_AH_gA_8Af_AD_gB_8Af-AH_4B_4Af_wP_AA__h_4AD____gAH___8AAP___gAA___8AAB___AAAB__-AAAD__8AAAP__8AAD___4AAf___wAD____gAf_v__AD_8f_8Af_gf_4B_8A__gP_gB__A_-AD_8D_4AP_wf_AAf_B_8AB_8H_wAH_wf_AAf_B_8AB_8H_wAH_wf_AAf_B_-AB_8H_4AP_gP_wB_-A__wf_4D_____AH____4AP____gA____8AB____gAB___4AAD___AAAD__wAAAB_4AAAAAAAAAAAAAAAA"
     },
     "9": {
      "w": 35,
      "bits": "AAAAAAAAA_wAAAAf_wAAAH__wAAA___gAAH___AAA___-AAH___4AA____wAD____AAf_w_-AB_8B_4AP_wD_wA_-AP_AD_4A_8Af_gB_wB_8AH_gH_wAf-Af_AB_4B_8AH_gH_wAf_Af_AB_8B_8AH_wH_wAf_Af_gB_8B_-AH_wD_4Af_AP_wB_8A__wf_wB_____AH____8AP____wA_____AB____8AD____wAH____AAP_5_8AAH8H_wAAAAf_AAAAB_8AAAAH_wAAAAf-AAAAB_4AAAAH_gAAAA_-AAAAD_4AA4AP_AA_gA_8AP_AH_wAf8Af-AB_wB_4AH_gP_AAf_D_8AA____gAD___-AAH___wAAf__-AAA___wAAB__-AAAD__wAAAD_8AAAAD_AAAAAAAAAAAAAAAAA"
     }
    }
   }
  },
  "staatliches": {
   "a": {
    "strip_h": 44,
    "digit_h": 42,
    "ring": 1,
    "shadow": 0,
    "cell_w": 28,
    "glyphs": {
     "0": {
      "w": 27,
      "bits": "AAAAAAAEAAAA_-AAA__wAAf__AAP__4AH___AD___wA_-_-Af4B_gH8AP4B_AD_AfwAfwH8AH8B_AB_AfwAfwH8AH8B_AB_AfwAfwH8AH8B_AB_AfwAfwH8AH8B_AB_AfwAfwH8AH8B_AB_AfwAfwH8AH8B_AB_AfwAfwH8AH8B_AD_AfwA_gH-Af4A_-_-AP___AB___wAP__4AB__8AAP_8AAA_-AAAAwAAAAAAAA"
     },
     "1": {
      "w": 9,
      "bits": "AAAAAH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AAAAAAA"
     },
     "2": {
      "w": 25,
      "bits": "AAAAAAAIAAAA_4AAA__gAAf_8AAP__gAH__8AD___AA_9_4AP8H-AH-A_gB_AP8AfwB_AH8AfwB_AP4AfwD-AAAB_gAAA_4AAAP8AAAH_AAAD_gAAB_wAAAf4AAAP-AAAH_AAAD_gAAA_wAAAf8AAAP-AAAH_AAAB_gAAA_4AAAf8AAAH-AAAD_gAAB___4Af__-AH___gB___4Af__-AH___gB___4AAAAAAAAAAAA"
     },
     "3": {
      "w": 25,
      "bits": "AAAAAAAIAAAA_4AAA__gAAf_8AAP__gAH__8AD___AA_9_4Af8H-AH-A_gB_AP8AfwB_AH8AfwB_AH8AfwD-AAAA_gAAA_4AAD_-AAA__AAAP_gAAD_wAAA_-AAAP_wAAD_8AAAB_gAAAP4AAAD-AH8AfwB_AH8AfwB_AH8AfwB_AP8Af4D-AH-B_gA_9_4AP__8AB___AAP__gAB__wAAP_4AAA_4AAAAgAAAAAAAA"
     },
     "4": {
      "w": 26,
      "bits": "AAAAAAAAAAAAB_gAAAf4AAAP-AAAD_gAAB_4AAAf-AAAP_gAAD_4AAB_-AAAf_gAAP_4AAD_-AAB__gAAf_4AAH7-AAD-_gAA_P4AAfz-AAH4_gAD-P4AA_D-AAfw_gAH4P4AD-D-AA_A_gAfwP4AH___4B___-Af___gH___4B___-Af___gH___4AAA_gAAAP4AAAD-AAAA_gAAAP4AAAD-AAAA_gAAAAAAAAAAAA"
     },
     "5": {
      "w": 25,
      "bits": "AAAAAAAAAAAf__4AH__-AB___gAf__4AH__-AD___gA___4AP4AAAD-AAAA_gAAAP4AAAD-AAAA_gAAAP4AAAD__AAA__8AAP__wAD__-AA___wAP__8AD___gA_wf4AP4D_AAAAfwAAAH8AAAB_AAAAfwB_AH8AfwB_AH8AfwB_gH8Af4D_AD_B_wA_9_4AH__-AB___AAP__gAB__wAAP_4AAA_4AAAAgAAAAAAAA"
     },
     "6": {
      "w": 24,
      "bits": "AAAAAAgAAf-AA__AD__wH__4H__4P__8P__-f4H-fwD-fwD-fwD-fwD-fwAAfwAAf34Af__Af__gf__wf__4f__8f__8f8P-f4H-fwD-fwD-fwD-fwD-fwD-fwD-fwD-fwD-fwD-f4H-P__8P__8H__4H__4D__wA__AAf-AABgAAAAA"
     },
     "7": {
      "w": 25,
      "bits": "AAAAAAAAAAB___8Af___AH___wB___8Af___AH___wB___8AAAB_AAAAfgAAAP4AAAD-AAAB_AAAAfwAAAH8AAAD-AAAA_gAAAP4AAAH8AAAB_AAAAfwAAAP4AAAD-AAAB_gAAAfwAAAH8AAAD_AAAA_gAAAP4AAAH-AAAB_AAAAfwAAAP8AAAD-AAAB_gAAAf4AAAH8AAAD_AAAA_wAAAP4AAAH-AAAAAAAAAAAAAA"
     },
     "8": {
      "w": 25,
      "bits": "AAAAAAAIAAAA_4AAA__gAAf_8AAP__gAD__8AB___AAf9_4AP8H-AD-A_gA_gP4AP4D-AD-A_gA_wP4AP-P-AB___AAf__wAD__4AAf_-AAP__wAH__8AD___gA_4f4AP4D_AH-A_wB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_gH8AP4D_AD_B_gA_9_4AH__-AB___AAP__gAB__wAAP_4AAA_4AAAAgAAAAAAAA"
     },
     "9": {
      "w": 25,
      "bits": "AAAAAAAIAAAA_4AAA__gAAf_8AAP__gAH__8AB___AA_9_4AP8H-AH-A_wB_AH8AfwB_AH8AfwB_AH8AfwB_AH8AfwB_AH8Af4D_AD-A_wA_4f8AP___AB___wAP__8AD___AAP__wAB__8AAH9_AAAAfwAAAH8AfwB_AH8AfwB_AH8Af4D_AD_B_gA_9_4AP__-AB___AAP__gAB__wAAP_4AAA_4AAAAgAAAAAAAA"
     },
     ":": {
      "w": 9,
      "bits": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfwB_AH8AfwB_AH8AfwAAAAAAAAAAAAAAAAAAAAAAAAAAAH8AfwB_AH8AfwB_AH8AAAAAAA"
     }
    }
   },
   "b": {
    "strip_h": 64,
    "digit_h": 62,
    "ring": 1,
    "shadow": 0,
    "cell_w": 48,
    "glyphs": {
     "0": {
      "w": 40,
      "bits": "AAAAAAAAAf-AAAAP__AAAD___AAAf___AAH___-AA____8AH____4Af____gD_____Af____-B__5__4P_4Af_w__AA__D_4AB_8P_AAD_w_8AAP_H_wAA_-f_AAD_5_8AAP_n_wAA_-f_AAD_5_8AAP_n_wAA_-f_AAD_5_8AAP_n_wAA_-f_AAD_5_8AAP_n_wAA_-f_AAD_5_8AAP_n_wAA_-f_AAD_5_8AAP_n_wAA_-f_AAD_5_8AAP_n_wAA_-f_AAD_5_8AAP_n_wAA_-f_AAD_5_8AAP_n_wAA_-f_AAD_5_8AAP_n_wAA_-P_AAD_w_-AAf_D_8AD_8P_4Af_wf_-f_-B_____4D_____AH____4Af____gA____8AB____gAB___4AAD___AAAD__wAAAB_4AAAAAAAAA"
     },
     "1": {
      "w": 13,
      "bits": "AAAAAD_wP_A_8D_wP_A_8D_wP_A_8D_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8H_wf_B_8AAAAAA"
     },
     "2": {
      "w": 36,
      "bits": "AAAAAAAAA_wAAAAP_4AAAD__4AAA___wAAH___gAA____AAH___-AAf___8AD____4Af____gB__j__AP_4D_8A__AH_wD_4AP_gP_AA_-A_8AD_4H_wAH_gf_AAf-B_8AD_4H_wAP_gf_AA_-B_8AH_wAAAA__AAAAD_8AAAAf_gAAAD_-AAAAP_wAAAB__AAAAP_4AAAB__AAAAH_8AAAA__gAAAH_8AAAA__gAAAD_-AAAAf_wAAAD_-AAAAP_wAAAB__AAAAP_4AAAB__AAAAH_8AAAA__gAAAH_8AAAAf_gAAAD_-AAAAf_wAAAD_-AAAAP_4AAAB__AAAAP_4AAAA_____4D_____gP____-A_____4D_____gP____-A_____4D_____gP____-A_____4AAAAAAAAAAAAAA"
     },
     "3": {
      "w": 36,
      "bits": "AAAAAAAAA_wAAAAf_4AAAD__4AAA___wAAH___wAA____gAH___-AA____8AD____4Af____gB__j__AP_4D_8A__AH_wD_4AP_gP_AA_-A_8AD_4D_wAH_gP_AAf-A_8AB_4D_wAH_gP_AA_-A_8AD_4AAAAf_gAAAD_8AAAAf_wAAB__-AAAH__4AAAf__AAAB__8AAAH__gAAAf_-AAAB__4AAAH__wAAAf__gAAB__-AAAAP_8AAAAP_wAAAAf_AAAAA_-AAAAD_4D_wAP_gf_AAf-B_8AB_4H_wAH_gf_AAf-B_8AB_4D_wAP_gP_AA_-A_-AD_4D_8Af_AP_4D_8Af_4__wB____-AD____4AP____AAf___4AA____gAB___8AAD___AAAD__4AAAH_-AAAAD_AAAAAAAAAA"
     },
     "4": {
      "w": 38,
      "bits": "AAAAAAAAAAAAAAAAD_wAAAAf_AAAAB_8AAAAP_wAAAA__AAAAH_8AAAAf_wAAAD__AAAAP_8AAAA__wAAAH__AAAAf_8AAAD__wAAAP__AAAB__8AAAH__wAAA___AAAD__8AAAf__wAAB___AAAP__8AAA___wAAH_v_AAAf-_8AAD_z_wAAP_P_AAB_4_-AAH_j_4AA_8P_gAD_w_-AAf-D_4AB_4P_gAH_A_-AA_8D_4AD_wP_gAf-A_-AB_4D_4AP_AP_gA_8A_-AH_____4f_____h_____-H_____4f_____h_____-H_____4f_____h_____-H_____4AAAP_gAAAA_-AAAAD_4AAAAP_gAAAA_-AAAAD_4AAAAP_gAAAA_-AAAAD_4AAAAP_gAAAA_-AAAAAAAAAAAAAAA"
     },
     "5": {
      "w": 36,
      "bits": "AAAAAAAAAAAAAB____-AH____4Af____gB____-AH____4Af____gB____-AH____4Af____gB____-AH_AAAAAf8AAAAD_wAAAAP_AAAAA_8AAAAD_wAAAAP_AAAAA_8AAAAD_wAAAAP_AAAAA_8AAAAD_z_AAAP___gAA____AAD____AAP___-AA____8AD____4AP____wA_____AD____-AP_8__4A_-Af_wD_wAf_AAAAB_8AAAAD_4AAAAP_gAAAA_-AAAAD_4AAAAP_gAAAA_-B_4AD_4H_gAP_gf-AA_-B_4AD_4H_wAP_gf_AA_8B_8AH_wH_4A__AP_wH_8A__x__gB____-AH____wAP____AAf___4AB____AAD___4AAD___AAAH__4AAAH_-AAAAD_AAAAAAAAAA"
     },
     "6": {
      "w": 36,
      "bits": "AAAAAAAAA_wAAAAP_4AAAD__4AAA___wAAH___wAA____gAH___-AA____8AD____4Af____gB__j__AP_4D_8A__AH_4D_4AP_gP_AA_-B_8AB_4H_wAH_gf_AAf-B_8AB_4H_wAAAAf_AAAAB_8AAAAH_z_AAAf___gAB____gAH____AAf____AB____-AH____4Af____wB_____gH____-Af_-P_8B__gP_wH_8Af_Af_gA_-B_8AD_4H_wAP_gf_AAf-B_8AB_4H_wAH_gf_AAf-B_8AB_4H_wAH_gf_AAf-A_8AB_4D_wAP_gP_AA_-A_-AD_4D_8Af_AP_4D_8Af_4__wB____-AD____4AH____AAf___4AA____gAB___8AAD___AAAD__4AAAD_-AAAAD_gAAAAAAAAA"
     },
     "7": {
      "w": 36,
      "bits": "AAAAAAAAAAAAAH_____gf____-B_____4H_____gf____-B_____4H_____gf____-B_____4H_____gAAAA_-AAAAD_wAAAAP_AAAAB_8AAAAH_gAAAAf-AAAAD_4AAAAP_AAAAA_8AAAAH_wAAAAf-AAAAD_4AAAAP_gAAAA_8AAAAH_wAAAAf_AAAAB_4AAAAP_gAAAA_-AAAAD_wAAAAf_AAAAB_8AAAAP_gAAAA_-AAAAD_4AAAAf_AAAAB_8AAAAH_wAAAA_-AAAAD_4AAAAP_gAAAB_8AAAAH_wAAAAf-AAAAD_4AAAAP_gAAAB_8AAAAH_wAAAAf_AAAAD_4AAAAP_gAAAA_-AAAAH_wAAAAf_AAAAB_8AAAAP_gAAAA_-AAAAH_4AAAAf_AAAAB_8AAAAAAAAAAAAAAAAA"
     },
     "8": {
      "w": 36,
      "bits": "AAAAAAAAA_wAAAAf_wAAAH__wAAA___wAAH___gAA____AAH___8AA____4AD____wAf____AB__v_-AH_wH_4A_-AP_gD_4Af-AP_AB_4A_8AH_wD_wAf_AP_AB_8A_-AH_gD_4A_-AP_wH_4Af_w__gB____8AD____wAP___-AAf___4AA____AAH___8AAf___4AD____wAf____AB____-AP_8f_4A__Af_wD_4A__Af_AB_8B_8AD_wH_gAP_Af-AA_8B_4AD_4H_gAP_gf-AA_-B_4AD_4H_gAP_gf-AA_-B_4AD_4H_gAP_Af_AA_8B_8AH_wD_4A__AP_wH_8A__x__gB____-AH____wAP____AAf___4AA____AAB___4AAD___AAAH__wAAAH_-AAAAD_AAAAAAAAAA"
     },
     "9": {
      "w": 36,
      "bits": "AAAAAAAAA_wAAAAf_wAAAH__wAAA___wAAP___gAB____AAP___-AA____4AH____wAf____gD__H_-AP_wH_4B_-AP_wH_wAf_Af_AB_8B_4AD_wH_gAP_Af-AA_8B_4AD_wH_gAP_Af-AA_8B_4AD_wH_gAP_Af-AA_8B_4AD_wH_wAP_Af_AB_8B_-AP_wD_8B__AP_8f_8Af____wB_____AD____8AP____wAf____AA____8AB____wAB____AAB___8AAA_z_wAAAAP_AAAAA_-AAAAD_4H_gAP_gf-AA_-B_4AD_wH_gAP_Af_AB_8B_8AH_wH_4A__AP_wH_8A__x__gB____-AH____wAP___-AA____4AB____AAD___4AAH___AAAH__wAAAH_8AAAAD_AAAAAAAAAA"
     }
    }
   }
  }
 }
}/*END-MASKS*/;
  return MASKS;
}));

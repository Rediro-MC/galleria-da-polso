/* fixture_preview.js - FIXTURE GENERATA da test/gen_preview_fixture.py v2: non modificare a mano.
 * Riferimento di src/pkjs/config/preview.js (S12/D48: anteprima "onesta" della config page) per
 * test/test_preview.js. Rigenerare con:
 *   python3 apps/galleria/test/gen_preview_fixture.py     (--check verifica che sia aggiornata)
 * Nessuna data: due esecuzioni devono dare lo stesso file byte per byte.
 *
 * cases[]  un caso per piattaforma x font x layout (5 font x 3 layout x 2 piattaforme = 30), con
 *          l'ora campione '12:34' posizionata come ui_time.c (prv_grid_steps / prv_place_row_fit /
 *          prv_layout_time, funzioni di tools/gen_digits.py) sulle metriche di
 *          src/pkjs/digit_masks.js. Campi:
 *            platform fmt font strip setting layout size mode bottom - identificazione (setting =
 *                     valore dell'impostazione `font` di settings.h, strip = indice in digit_masks;
 *                     layout C = "ora in basso" di D136: A specchiata, bottom true)
 *            screen_w screen_h cell colon gap band_h band_y   - costanti del layout (band_h =
 *                     altezza della fascia del colore automatico: A e C = info_y + info_h + 2,
 *                     B = tutto; band_y = origine y della fascia, 0 salvo C = h - band_h)
 *            strip_h digit_h ring shadow cell_w               - metriche della taglia
 *            rows[]   una riga in A e in C ('12:34'), due in B (HH sopra MM):
 *              y        riga 0 della strip sullo schermo (= fill_y - ring; in C il riempimento
 *                       e' specchiato nella fascia: fill_y = h - a_fill_y - digit_h)
 *              total    larghezza della riga secondo la griglia scelta
 *              x0       origine del blocco centrato ((w - total) / 2 troncato verso lo zero; in A
 *                       mai < 0, in B nessun clamp, come ui_time.c)
 *              ring_gap spazio fra gli anelli scelto da prv_place_row_fit (null = riserva)
 *              glyphs[] { ch, g (indice 0..10), w (colonne d'inchiostro), x (cella), adv (passo),
 *                       gx (x del blit: ui_digits_draw), crc, fill, ring, shadow }
 *                       crc = CRC32 zlib SENZA SEGNO della mappa di indici 0..3 (0 vuoto,
 *                       1 riempimento, 2 anello, 3 ombra) ricostruita dalla SOLA maschera di
 *                       digit_masks.js con la regola di D45, w byte per riga, strip_h righe;
 *                       fill/ring/shadow = quanti pixel per indice (diagnostica).
 * photos[] decisioni del colore automatico sulle due foto demo (resources/photos/): le stesse
 *          della tabella di resources/photos/README.md, calcolate con photo_prep.stats_emery /
 *          stats_flint (campionamento 1 px su 2, nessuna isteresi: decisione a freddo). Una voce
 *          bands[] per layout: A (fascia in alto), B (schermo intero) e C (stessa fascia di A
 *          ancorata al fondo, y = band_y).
 * synth[]  due immagini sintetiche di emery (sfondo bg, `bright` pixel fg nelle sole posizioni
 *          campionate della fascia in basso) con il conflitto al 15 % e al 14 %: pinnano la
 *          soglia del contorno di D140 (>= 15 %) e il campionamento da y = band_y.
 * luma     costanti di src/c/luma.h e impronta della tabella LUMA_SUN (64 valori) da pinnare nel
 *          porting JS: sum = somma dei 64 valori, crc = CRC32 zlib dei 64 byte (hysteresis non e'
 *          usata dall'anteprima: decisione a freddo).
 * Ancoraggio al C: prima di scrivere, il generatore confronta luma.h, LUMA_SUN di luma.c, le
 * costanti di prv_compute_layout (ui_time.c) e digit_metrics.h (contro digit_masks.js) con questi
 * numeri e si ferma se differiscono: la fixture non puo' restare verde su un C cambiato.
 * I CRC sono interi senza segno (in JS confrontare con `zlib.crc32(...) >>> 0`). */
module.exports = {
  version: 'v2',
  masks_v: 1,
  time: '12:34',
  /* costanti di ui_time.c:prv_compute_layout (content size normale). */
  layout: {
    emery: { fmt: 'raw6', w: 200, h: 228, a_fill_y: 9, a_cell: 40, a_colon: 16,
      b_hh_fill_y: 13, b_mm_fill_y: 121, b_cell: 64, b_gap: 8, info_y: 82, info_h: 22,
      band_a: 106, band_b: 228, band_c_y: 122 },
    flint: { fmt: 'raw1', w: 144, h: 168, a_fill_y: 7, a_cell: 28, a_colon: 12,
      b_hh_fill_y: 13, b_mm_fill_y: 93, b_cell: 48, b_gap: 8, info_y: 56, info_h: 18,
      band_a: 76, band_b: 168, band_c_y: 92 },
  },

  /* costanti di src/c/luma.h + impronta di LUMA_SUN (deve coincidere con luma.c). */
  luma: { white_bad: 77, black_bad: 25, crossover: 46, halo_pct: 15, hysteresis: 10,
    sun_len: 64, sun_sum: 6113, sun_crc: 0x7DA9EAC4 },

  cases: [
    { platform: 'emery', fmt: 'raw6', font: 'anton', strip: 0, setting: 0, layout: 'A', size: 'a', mode: 'A_SPRITE', bottom: false,
      screen_w: 200, screen_h: 228, cell: 40, colon: 16, gap: 0, band_h: 106, band_y: 0,
      strip_h: 72, digit_h: 66, ring: 2, shadow: 2, cell_w: 40,
      rows: [
        { y: 7, total: 183, x0: 8, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 27, x: 8, adv: 41, gx: 16, crc: 0x1F4BF4D0, fill: 908, ring: 363, shadow: 181 },
          { ch: '2', g: 2, w: 40, x: 49, adv: 41, gx: 50, crc: 0xC8BFA062, fill: 1441, ring: 604, shadow: 263 },
          { ch: ':', g: 10, w: 19, x: 90, adv: 19, gx: 91, crc: 0x2D61BB09, fill: 286, ring: 224, shadow: 124 },
          { ch: '3', g: 3, w: 40, x: 109, adv: 41, gx: 110, crc: 0x7F742E70, fill: 1474, ring: 609, shadow: 233 },
          { ch: '4', g: 4, w: 41, x: 150, adv: 41, gx: 151, crc: 0x48B06754, fill: 1456, ring: 527, shadow: 225 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'anton', strip: 0, setting: 0, layout: 'B', size: 'b', mode: 'B_SPRITE', bottom: false,
      screen_w: 200, screen_h: 228, cell: 64, colon: 64, gap: 8, band_h: 228, band_y: 0,
      strip_h: 100, digit_h: 94, ring: 2, shadow: 2, cell_w: 64,
      rows: [
        { y: 11, total: 136, x0: 32, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 37, x: 32, adv: 64, gx: 46, crc: 0xFE7880FF, fill: 1913, ring: 522, shadow: 260 },
          { ch: '2', g: 2, w: 55, x: 104, adv: 64, gx: 109, crc: 0xB7A690B0, fill: 3014, ring: 872, shadow: 401 },
        ] },
        { y: 119, total: 136, x0: 32, ring_gap: 2, glyphs: [
          { ch: '3', g: 3, w: 54, x: 32, adv: 64, gx: 38, crc: 0xF906858C, fill: 3065, ring: 879, shadow: 360 },
          { ch: '4', g: 4, w: 57, x: 104, adv: 64, gx: 108, crc: 0xBA5134EE, fill: 3116, ring: 760, shadow: 341 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'anton', strip: 0, setting: 0, layout: 'C', size: 'a', mode: 'A_SPRITE', bottom: true,
      screen_w: 200, screen_h: 228, cell: 40, colon: 16, gap: 0, band_h: 106, band_y: 122,
      strip_h: 72, digit_h: 66, ring: 2, shadow: 2, cell_w: 40,
      rows: [
        { y: 151, total: 183, x0: 8, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 27, x: 8, adv: 41, gx: 16, crc: 0x1F4BF4D0, fill: 908, ring: 363, shadow: 181 },
          { ch: '2', g: 2, w: 40, x: 49, adv: 41, gx: 50, crc: 0xC8BFA062, fill: 1441, ring: 604, shadow: 263 },
          { ch: ':', g: 10, w: 19, x: 90, adv: 19, gx: 91, crc: 0x2D61BB09, fill: 286, ring: 224, shadow: 124 },
          { ch: '3', g: 3, w: 40, x: 109, adv: 41, gx: 110, crc: 0x7F742E70, fill: 1474, ring: 609, shadow: 233 },
          { ch: '4', g: 4, w: 41, x: 150, adv: 41, gx: 151, crc: 0x48B06754, fill: 1456, ring: 527, shadow: 225 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'bebas', strip: 1, setting: 1, layout: 'A', size: 'a', mode: 'A_SPRITE', bottom: false,
      screen_w: 200, screen_h: 228, cell: 40, colon: 16, gap: 0, band_h: 106, band_y: 0,
      strip_h: 72, digit_h: 66, ring: 2, shadow: 2, cell_w: 40,
      rows: [
        { y: 7, total: 180, x0: 10, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 27, x: 10, adv: 41, gx: 18, crc: 0xBBBE0FBA, fill: 713, ring: 356, shadow: 181 },
          { ch: '2', g: 2, w: 36, x: 51, adv: 41, gx: 54, crc: 0x8AB8CFF1, fill: 1086, ring: 604, shadow: 281 },
          { ch: ':', g: 10, w: 16, x: 92, adv: 16, gx: 93, crc: 0xF8A473F2, fill: 180, ring: 184, shadow: 104 },
          { ch: '3', g: 3, w: 36, x: 108, adv: 41, gx: 111, crc: 0xF15C289C, fill: 1163, ring: 629, shadow: 260 },
          { ch: '4', g: 4, w: 41, x: 149, adv: 41, gx: 150, crc: 0x2986287A, fill: 1178, ring: 518, shadow: 230 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'bebas', strip: 1, setting: 1, layout: 'B', size: 'b', mode: 'B_SPRITE', bottom: false,
      screen_w: 200, screen_h: 228, cell: 64, colon: 64, gap: 8, band_h: 228, band_y: 0,
      strip_h: 100, digit_h: 94, ring: 2, shadow: 2, cell_w: 64,
      rows: [
        { y: 11, total: 136, x0: 32, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 36, x: 32, adv: 64, gx: 47, crc: 0x16473472, fill: 1444, ring: 504, shadow: 255 },
          { ch: '2', g: 2, w: 49, x: 104, adv: 64, gx: 112, crc: 0xD5E4EE63, fill: 2241, ring: 864, shadow: 401 },
        ] },
        { y: 119, total: 136, x0: 32, ring_gap: 2, glyphs: [
          { ch: '3', g: 3, w: 49, x: 32, adv: 64, gx: 40, crc: 0xB371ED1B, fill: 2336, ring: 886, shadow: 358 },
          { ch: '4', g: 4, w: 55, x: 104, adv: 64, gx: 109, crc: 0xB8E82901, fill: 2441, ring: 737, shadow: 339 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'bebas', strip: 1, setting: 1, layout: 'C', size: 'a', mode: 'A_SPRITE', bottom: true,
      screen_w: 200, screen_h: 228, cell: 40, colon: 16, gap: 0, band_h: 106, band_y: 122,
      strip_h: 72, digit_h: 66, ring: 2, shadow: 2, cell_w: 40,
      rows: [
        { y: 151, total: 180, x0: 10, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 27, x: 10, adv: 41, gx: 18, crc: 0xBBBE0FBA, fill: 713, ring: 356, shadow: 181 },
          { ch: '2', g: 2, w: 36, x: 51, adv: 41, gx: 54, crc: 0x8AB8CFF1, fill: 1086, ring: 604, shadow: 281 },
          { ch: ':', g: 10, w: 16, x: 92, adv: 16, gx: 93, crc: 0xF8A473F2, fill: 180, ring: 184, shadow: 104 },
          { ch: '3', g: 3, w: 36, x: 108, adv: 41, gx: 111, crc: 0xF15C289C, fill: 1163, ring: 629, shadow: 260 },
          { ch: '4', g: 4, w: 41, x: 149, adv: 41, gx: 150, crc: 0x2986287A, fill: 1178, ring: 518, shadow: 230 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'barlow', strip: 2, setting: 2, layout: 'A', size: 'a', mode: 'A_SPRITE', bottom: false,
      screen_w: 200, screen_h: 228, cell: 40, colon: 16, gap: 0, band_h: 106, band_y: 0,
      strip_h: 72, digit_h: 61, ring: 2, shadow: 2, cell_w: 40,
      rows: [
        { y: 7, total: 195, x0: 2, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 26, x: 2, adv: 44, gx: 12, crc: 0x7F55533E, fill: 791, ring: 332, shadow: 169 },
          { ch: '2', g: 2, w: 39, x: 46, adv: 44, gx: 49, crc: 0xE983B53B, fill: 1213, ring: 573, shadow: 261 },
          { ch: ':', g: 10, w: 19, x: 90, adv: 19, gx: 91, crc: 0x6B38981C, fill: 278, ring: 240, shadow: 108 },
          { ch: '3', g: 3, w: 38, x: 109, adv: 44, gx: 113, crc: 0x3166FAC0, fill: 1190, ring: 576, shadow: 229 },
          { ch: '4', g: 4, w: 44, x: 153, adv: 44, gx: 154, crc: 0xCD88E88E, fill: 1109, ring: 486, shadow: 230 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'barlow', strip: 2, setting: 2, layout: 'B', size: 'b', mode: 'B_SPRITE', bottom: false,
      screen_w: 200, screen_h: 228, cell: 64, colon: 64, gap: 8, band_h: 228, band_y: 0,
      strip_h: 100, digit_h: 93, ring: 2, shadow: 2, cell_w: 64,
      rows: [
        { y: 11, total: 138, x0: 31, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 37, x: 31, adv: 65, gx: 46, crc: 0x59F28CC4, fill: 1842, ring: 508, shadow: 255 },
          { ch: '2', g: 2, w: 58, x: 104, adv: 65, gx: 108, crc: 0x6820CFAA, fill: 2902, ring: 881, shadow: 400 },
        ] },
        { y: 119, total: 138, x0: 31, ring_gap: 2, glyphs: [
          { ch: '3', g: 3, w: 56, x: 31, adv: 65, gx: 36, crc: 0x687073B2, fill: 2843, ring: 883, shadow: 352 },
          { ch: '4', g: 4, w: 65, x: 104, adv: 65, gx: 105, crc: 0x55A8FD7E, fill: 2700, ring: 737, shadow: 361 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'barlow', strip: 2, setting: 2, layout: 'C', size: 'a', mode: 'A_SPRITE', bottom: true,
      screen_w: 200, screen_h: 228, cell: 40, colon: 16, gap: 0, band_h: 106, band_y: 122,
      strip_h: 72, digit_h: 61, ring: 2, shadow: 2, cell_w: 40,
      rows: [
        { y: 156, total: 195, x0: 2, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 26, x: 2, adv: 44, gx: 12, crc: 0x7F55533E, fill: 791, ring: 332, shadow: 169 },
          { ch: '2', g: 2, w: 39, x: 46, adv: 44, gx: 49, crc: 0xE983B53B, fill: 1213, ring: 573, shadow: 261 },
          { ch: ':', g: 10, w: 19, x: 90, adv: 19, gx: 91, crc: 0x6B38981C, fill: 278, ring: 240, shadow: 108 },
          { ch: '3', g: 3, w: 38, x: 109, adv: 44, gx: 113, crc: 0x3166FAC0, fill: 1190, ring: 576, shadow: 229 },
          { ch: '4', g: 4, w: 44, x: 153, adv: 44, gx: 154, crc: 0xCD88E88E, fill: 1109, ring: 486, shadow: 230 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'francois', strip: 3, setting: 4, layout: 'A', size: 'a', mode: 'A_SPRITE', bottom: false,
      screen_w: 200, screen_h: 228, cell: 40, colon: 16, gap: 0, band_h: 106, band_y: 0,
      strip_h: 72, digit_h: 61, ring: 2, shadow: 2, cell_w: 40,
      rows: [
        { y: 7, total: 193, x0: 3, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 32, x: 3, adv: 44, gx: 10, crc: 0x4F4636B1, fill: 873, ring: 392, shadow: 195 },
          { ch: '2', g: 2, w: 41, x: 47, adv: 44, gx: 49, crc: 0x0AE20BF3, fill: 1121, ring: 598, shadow: 266 },
          { ch: ':', g: 10, w: 17, x: 91, adv: 17, gx: 92, crc: 0x7F28F595, fill: 242, ring: 208, shadow: 116 },
          { ch: '3', g: 3, w: 41, x: 108, adv: 44, gx: 110, crc: 0xB259B50B, fill: 1065, ring: 620, shadow: 229 },
          { ch: '4', g: 4, w: 44, x: 152, adv: 44, gx: 153, crc: 0xCD33DB70, fill: 1143, ring: 496, shadow: 221 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'francois', strip: 3, setting: 4, layout: 'B', size: 'b', mode: 'B_SPRITE', bottom: false,
      screen_w: 200, screen_h: 228, cell: 64, colon: 64, gap: 8, band_h: 228, band_y: 0,
      strip_h: 100, digit_h: 94, ring: 2, shadow: 2, cell_w: 64,
      rows: [
        { y: 11, total: 140, x0: 30, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 48, x: 30, adv: 66, gx: 40, crc: 0x91BA2936, fill: 2164, ring: 608, shadow: 303 },
          { ch: '2', g: 2, w: 61, x: 104, adv: 66, gx: 107, crc: 0x52AAC628, fill: 2711, ring: 930, shadow: 412 },
        ] },
        { y: 119, total: 140, x0: 30, ring_gap: 2, glyphs: [
          { ch: '3', g: 3, w: 61, x: 30, adv: 66, gx: 33, crc: 0x94396B49, fill: 2589, ring: 960, shadow: 347 },
          { ch: '4', g: 4, w: 66, x: 104, adv: 66, gx: 105, crc: 0xF143728B, fill: 2768, ring: 786, shadow: 366 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'francois', strip: 3, setting: 4, layout: 'C', size: 'a', mode: 'A_SPRITE', bottom: true,
      screen_w: 200, screen_h: 228, cell: 40, colon: 16, gap: 0, band_h: 106, band_y: 122,
      strip_h: 72, digit_h: 61, ring: 2, shadow: 2, cell_w: 40,
      rows: [
        { y: 156, total: 193, x0: 3, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 32, x: 3, adv: 44, gx: 10, crc: 0x4F4636B1, fill: 873, ring: 392, shadow: 195 },
          { ch: '2', g: 2, w: 41, x: 47, adv: 44, gx: 49, crc: 0x0AE20BF3, fill: 1121, ring: 598, shadow: 266 },
          { ch: ':', g: 10, w: 17, x: 91, adv: 17, gx: 92, crc: 0x7F28F595, fill: 242, ring: 208, shadow: 116 },
          { ch: '3', g: 3, w: 41, x: 108, adv: 44, gx: 110, crc: 0xB259B50B, fill: 1065, ring: 620, shadow: 229 },
          { ch: '4', g: 4, w: 44, x: 152, adv: 44, gx: 153, crc: 0xCD33DB70, fill: 1143, ring: 496, shadow: 221 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'staatliches', strip: 4, setting: 5, layout: 'A', size: 'a', mode: 'A_SPRITE', bottom: false,
      screen_w: 200, screen_h: 228, cell: 40, colon: 16, gap: 0, band_h: 106, band_y: 0,
      strip_h: 72, digit_h: 65, ring: 2, shadow: 2, cell_w: 40,
      rows: [
        { y: 7, total: 192, x0: 4, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 17, x: 4, adv: 44, gx: 18, crc: 0x57739812, fill: 682, ring: 312, shadow: 160 },
          { ch: '2', g: 2, w: 41, x: 48, adv: 44, gx: 50, crc: 0xCFE80833, fill: 1300, ring: 631, shadow: 284 },
          { ch: ':', g: 10, w: 16, x: 92, adv: 16, gx: 93, crc: 0xADB49D1B, fill: 220, ring: 200, shadow: 112 },
          { ch: '3', g: 3, w: 41, x: 108, adv: 44, gx: 110, crc: 0x08D89E60, fill: 1346, ring: 666, shadow: 254 },
          { ch: '4', g: 4, w: 44, x: 152, adv: 44, gx: 153, crc: 0xC5CA772C, fill: 1301, ring: 496, shadow: 221 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'staatliches', strip: 4, setting: 5, layout: 'B', size: 'b', mode: 'B_SPRITE', bottom: false,
      screen_w: 200, screen_h: 228, cell: 64, colon: 64, gap: 8, band_h: 228, band_y: 0,
      strip_h: 100, digit_h: 94, ring: 2, shadow: 2, cell_w: 64,
      rows: [
        { y: 11, total: 136, x0: 32, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 22, x: 32, adv: 64, gx: 54, crc: 0x09C8FF66, fill: 1472, ring: 448, shadow: 230 },
          { ch: '2', g: 2, w: 58, x: 104, adv: 64, gx: 108, crc: 0xC5C009D0, fill: 2798, ring: 922, shadow: 416 },
        ] },
        { y: 119, total: 136, x0: 32, ring_gap: 2, glyphs: [
          { ch: '3', g: 3, w: 58, x: 32, adv: 64, gx: 36, crc: 0xDC0FAD31, fill: 2864, ring: 962, shadow: 375 },
          { ch: '4', g: 4, w: 61, x: 104, adv: 64, gx: 106, crc: 0x22C40144, fill: 2771, ring: 736, shadow: 340 },
        ] },
      ] },
    { platform: 'emery', fmt: 'raw6', font: 'staatliches', strip: 4, setting: 5, layout: 'C', size: 'a', mode: 'A_SPRITE', bottom: true,
      screen_w: 200, screen_h: 228, cell: 40, colon: 16, gap: 0, band_h: 106, band_y: 122,
      strip_h: 72, digit_h: 65, ring: 2, shadow: 2, cell_w: 40,
      rows: [
        { y: 152, total: 192, x0: 4, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 17, x: 4, adv: 44, gx: 18, crc: 0x57739812, fill: 682, ring: 312, shadow: 160 },
          { ch: '2', g: 2, w: 41, x: 48, adv: 44, gx: 50, crc: 0xCFE80833, fill: 1300, ring: 631, shadow: 284 },
          { ch: ':', g: 10, w: 16, x: 92, adv: 16, gx: 93, crc: 0xADB49D1B, fill: 220, ring: 200, shadow: 112 },
          { ch: '3', g: 3, w: 41, x: 108, adv: 44, gx: 110, crc: 0x08D89E60, fill: 1346, ring: 666, shadow: 254 },
          { ch: '4', g: 4, w: 44, x: 152, adv: 44, gx: 153, crc: 0xC5CA772C, fill: 1301, ring: 496, shadow: 221 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'anton', strip: 0, setting: 0, layout: 'A', size: 'a', mode: 'A_SPRITE', bottom: false,
      screen_w: 144, screen_h: 168, cell: 28, colon: 12, gap: 0, band_h: 76, band_y: 0,
      strip_h: 44, digit_h: 42, ring: 1, shadow: 0, cell_w: 28,
      rows: [
        { y: 6, total: 124, x0: 10, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 16, x: 10, adv: 28, gx: 16, crc: 0x6F9BC4CE, fill: 410, ring: 119, shadow: 0 },
          { ch: '2', g: 2, w: 25, x: 38, adv: 28, gx: 39, crc: 0x140D46EA, fill: 627, ring: 201, shadow: 0 },
          { ch: ':', g: 10, w: 10, x: 66, adv: 12, gx: 67, crc: 0xA95D5B3A, fill: 112, ring: 68, shadow: 0 },
          { ch: '3', g: 3, w: 24, x: 78, adv: 28, gx: 80, crc: 0x0BA5CACC, fill: 646, ring: 198, shadow: 0 },
          { ch: '4', g: 4, w: 26, x: 106, adv: 28, gx: 107, crc: 0x553FEF37, fill: 668, ring: 176, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'anton', strip: 0, setting: 0, layout: 'B', size: 'b', mode: 'B_SPRITE', bottom: false,
      screen_w: 144, screen_h: 168, cell: 48, colon: 48, gap: 8, band_h: 168, band_y: 0,
      strip_h: 64, digit_h: 62, ring: 1, shadow: 0, cell_w: 48,
      rows: [
        { y: 12, total: 104, x0: 20, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 22, x: 20, adv: 48, gx: 33, crc: 0x3F96DD91, fill: 841, ring: 168, shadow: 0 },
          { ch: '2', g: 2, w: 34, x: 76, adv: 48, gx: 83, crc: 0x6AEABD5A, fill: 1280, ring: 283, shadow: 0 },
        ] },
        { y: 92, total: 104, x0: 20, ring_gap: 2, glyphs: [
          { ch: '3', g: 3, w: 34, x: 20, adv: 48, gx: 27, crc: 0x01254C91, fill: 1296, ring: 284, shadow: 0 },
          { ch: '4', g: 4, w: 35, x: 76, adv: 48, gx: 82, crc: 0xE628D955, fill: 1344, ring: 247, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'anton', strip: 0, setting: 0, layout: 'C', size: 'a', mode: 'A_SPRITE', bottom: true,
      screen_w: 144, screen_h: 168, cell: 28, colon: 12, gap: 0, band_h: 76, band_y: 92,
      strip_h: 44, digit_h: 42, ring: 1, shadow: 0, cell_w: 28,
      rows: [
        { y: 118, total: 124, x0: 10, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 16, x: 10, adv: 28, gx: 16, crc: 0x6F9BC4CE, fill: 410, ring: 119, shadow: 0 },
          { ch: '2', g: 2, w: 25, x: 38, adv: 28, gx: 39, crc: 0x140D46EA, fill: 627, ring: 201, shadow: 0 },
          { ch: ':', g: 10, w: 10, x: 66, adv: 12, gx: 67, crc: 0xA95D5B3A, fill: 112, ring: 68, shadow: 0 },
          { ch: '3', g: 3, w: 24, x: 78, adv: 28, gx: 80, crc: 0x0BA5CACC, fill: 646, ring: 198, shadow: 0 },
          { ch: '4', g: 4, w: 26, x: 106, adv: 28, gx: 107, crc: 0x553FEF37, fill: 668, ring: 176, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'bebas', strip: 1, setting: 1, layout: 'A', size: 'a', mode: 'A_SPRITE', bottom: false,
      screen_w: 144, screen_h: 168, cell: 28, colon: 12, gap: 0, band_h: 76, band_y: 0,
      strip_h: 44, digit_h: 42, ring: 1, shadow: 0, cell_w: 28,
      rows: [
        { y: 6, total: 124, x0: 10, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 15, x: 10, adv: 28, gx: 16, crc: 0x18B93315, fill: 308, ring: 110, shadow: 0 },
          { ch: '2', g: 2, w: 21, x: 38, adv: 28, gx: 41, crc: 0x217511DF, fill: 431, ring: 190, shadow: 0 },
          { ch: ':', g: 10, w: 9, x: 66, adv: 12, gx: 67, crc: 0x90419951, fill: 84, ring: 60, shadow: 0 },
          { ch: '3', g: 3, w: 21, x: 78, adv: 28, gx: 81, crc: 0x8213793C, fill: 458, ring: 200, shadow: 0 },
          { ch: '4', g: 4, w: 23, x: 106, adv: 28, gx: 108, crc: 0x452B9527, fill: 452, ring: 160, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'bebas', strip: 1, setting: 1, layout: 'B', size: 'b', mode: 'B_SPRITE', bottom: false,
      screen_w: 144, screen_h: 168, cell: 48, colon: 48, gap: 8, band_h: 168, band_y: 0,
      strip_h: 64, digit_h: 62, ring: 1, shadow: 0, cell_w: 48,
      rows: [
        { y: 12, total: 104, x0: 20, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 21, x: 20, adv: 48, gx: 33, crc: 0x6FFAB92E, fill: 607, ring: 162, shadow: 0 },
          { ch: '2', g: 2, w: 31, x: 76, adv: 48, gx: 84, crc: 0x4E46A7E1, fill: 977, ring: 282, shadow: 0 },
        ] },
        { y: 92, total: 104, x0: 20, ring_gap: 2, glyphs: [
          { ch: '3', g: 3, w: 30, x: 20, adv: 48, gx: 29, crc: 0xBB0359E5, fill: 1030, ring: 292, shadow: 0 },
          { ch: '4', g: 4, w: 34, x: 76, adv: 48, gx: 83, crc: 0x4E99F81D, fill: 1059, ring: 240, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'bebas', strip: 1, setting: 1, layout: 'C', size: 'a', mode: 'A_SPRITE', bottom: true,
      screen_w: 144, screen_h: 168, cell: 28, colon: 12, gap: 0, band_h: 76, band_y: 92,
      strip_h: 44, digit_h: 42, ring: 1, shadow: 0, cell_w: 28,
      rows: [
        { y: 118, total: 124, x0: 10, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 15, x: 10, adv: 28, gx: 16, crc: 0x18B93315, fill: 308, ring: 110, shadow: 0 },
          { ch: '2', g: 2, w: 21, x: 38, adv: 28, gx: 41, crc: 0x217511DF, fill: 431, ring: 190, shadow: 0 },
          { ch: ':', g: 10, w: 9, x: 66, adv: 12, gx: 67, crc: 0x90419951, fill: 84, ring: 60, shadow: 0 },
          { ch: '3', g: 3, w: 21, x: 78, adv: 28, gx: 81, crc: 0x8213793C, fill: 458, ring: 200, shadow: 0 },
          { ch: '4', g: 4, w: 23, x: 106, adv: 28, gx: 108, crc: 0x452B9527, fill: 452, ring: 160, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'barlow', strip: 2, setting: 2, layout: 'A', size: 'a', mode: 'A_SPRITE', bottom: false,
      screen_w: 144, screen_h: 168, cell: 28, colon: 12, gap: 0, band_h: 76, band_y: 0,
      strip_h: 44, digit_h: 40, ring: 1, shadow: 0, cell_w: 28,
      rows: [
        { y: 6, total: 134, x0: 5, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 15, x: 5, adv: 30, gx: 12, crc: 0x5E7CDE08, fill: 355, ring: 110, shadow: 0 },
          { ch: '2', g: 2, w: 25, x: 35, adv: 30, gx: 37, crc: 0x380B7E9A, fill: 566, ring: 194, shadow: 0 },
          { ch: ':', g: 10, w: 12, x: 65, adv: 14, gx: 66, crc: 0x86663CFD, fill: 134, ring: 84, shadow: 0 },
          { ch: '3', g: 3, w: 24, x: 79, adv: 30, gx: 82, crc: 0xD71016A7, fill: 552, ring: 195, shadow: 0 },
          { ch: '4', g: 4, w: 28, x: 109, adv: 30, gx: 110, crc: 0xC1FB262D, fill: 524, ring: 163, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'barlow', strip: 2, setting: 2, layout: 'B', size: 'b', mode: 'B_SPRITE', bottom: false,
      screen_w: 144, screen_h: 168, cell: 48, colon: 48, gap: 8, band_h: 168, band_y: 0,
      strip_h: 64, digit_h: 62, ring: 1, shadow: 0, cell_w: 48,
      rows: [
        { y: 12, total: 104, x0: 20, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 22, x: 20, adv: 48, gx: 33, crc: 0xE5C03BA3, fill: 805, ring: 166, shadow: 0 },
          { ch: '2', g: 2, w: 36, x: 76, adv: 48, gx: 82, crc: 0x1948397C, fill: 1253, ring: 292, shadow: 0 },
        ] },
        { y: 92, total: 104, x0: 20, ring_gap: 2, glyphs: [
          { ch: '3', g: 3, w: 35, x: 20, adv: 48, gx: 26, crc: 0xC81E23B5, fill: 1236, ring: 295, shadow: 0 },
          { ch: '4', g: 4, w: 41, x: 76, adv: 48, gx: 79, crc: 0xD76562BB, fill: 1162, ring: 245, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'barlow', strip: 2, setting: 2, layout: 'C', size: 'a', mode: 'A_SPRITE', bottom: true,
      screen_w: 144, screen_h: 168, cell: 28, colon: 12, gap: 0, band_h: 76, band_y: 92,
      strip_h: 44, digit_h: 40, ring: 1, shadow: 0, cell_w: 28,
      rows: [
        { y: 120, total: 134, x0: 5, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 15, x: 5, adv: 30, gx: 12, crc: 0x5E7CDE08, fill: 355, ring: 110, shadow: 0 },
          { ch: '2', g: 2, w: 25, x: 35, adv: 30, gx: 37, crc: 0x380B7E9A, fill: 566, ring: 194, shadow: 0 },
          { ch: ':', g: 10, w: 12, x: 65, adv: 14, gx: 66, crc: 0x86663CFD, fill: 134, ring: 84, shadow: 0 },
          { ch: '3', g: 3, w: 24, x: 79, adv: 30, gx: 82, crc: 0xD71016A7, fill: 552, ring: 195, shadow: 0 },
          { ch: '4', g: 4, w: 28, x: 109, adv: 30, gx: 110, crc: 0xC1FB262D, fill: 524, ring: 163, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'francois', strip: 3, setting: 4, layout: 'A', size: 'a', mode: 'A_SPRITE', bottom: false,
      screen_w: 144, screen_h: 168, cell: 28, colon: 12, gap: 0, band_h: 76, band_y: 0,
      strip_h: 44, digit_h: 41, ring: 1, shadow: 0, cell_w: 28,
      rows: [
        { y: 6, total: 132, x0: 6, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 20, x: 6, adv: 30, gx: 11, crc: 0x53883975, fill: 401, ring: 130, shadow: 0 },
          { ch: '2', g: 2, w: 26, x: 36, adv: 30, gx: 38, crc: 0xA07EF60B, fill: 491, ring: 199, shadow: 0 },
          { ch: ':', g: 10, w: 9, x: 66, adv: 12, gx: 67, crc: 0xB64E0E95, fill: 105, ring: 66, shadow: 0 },
          { ch: '3', g: 3, w: 26, x: 78, adv: 30, gx: 80, crc: 0xF72A1653, fill: 478, ring: 205, shadow: 0 },
          { ch: '4', g: 4, w: 28, x: 108, adv: 30, gx: 109, crc: 0xB61483C7, fill: 487, ring: 174, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'francois', strip: 3, setting: 4, layout: 'B', size: 'b', mode: 'B_SPRITE', bottom: false,
      screen_w: 144, screen_h: 168, cell: 48, colon: 48, gap: 8, band_h: 168, band_y: 0,
      strip_h: 64, digit_h: 61, ring: 1, shadow: 0, cell_w: 48,
      rows: [
        { y: 12, total: 104, x0: 20, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 28, x: 20, adv: 48, gx: 30, crc: 0x63AB557B, fill: 873, ring: 192, shadow: 0 },
          { ch: '2', g: 2, w: 37, x: 76, adv: 48, gx: 81, crc: 0x4517AEC5, fill: 1121, ring: 297, shadow: 0 },
        ] },
        { y: 92, total: 104, x0: 20, ring_gap: 2, glyphs: [
          { ch: '3', g: 3, w: 37, x: 20, adv: 48, gx: 25, crc: 0xC8150F71, fill: 1065, ring: 308, shadow: 0 },
          { ch: '4', g: 4, w: 40, x: 76, adv: 48, gx: 80, crc: 0xF1EDB410, fill: 1143, ring: 253, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'francois', strip: 3, setting: 4, layout: 'C', size: 'a', mode: 'A_SPRITE', bottom: true,
      screen_w: 144, screen_h: 168, cell: 28, colon: 12, gap: 0, band_h: 76, band_y: 92,
      strip_h: 44, digit_h: 41, ring: 1, shadow: 0, cell_w: 28,
      rows: [
        { y: 119, total: 132, x0: 6, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 20, x: 6, adv: 30, gx: 11, crc: 0x53883975, fill: 401, ring: 130, shadow: 0 },
          { ch: '2', g: 2, w: 26, x: 36, adv: 30, gx: 38, crc: 0xA07EF60B, fill: 491, ring: 199, shadow: 0 },
          { ch: ':', g: 10, w: 9, x: 66, adv: 12, gx: 67, crc: 0xB64E0E95, fill: 105, ring: 66, shadow: 0 },
          { ch: '3', g: 3, w: 26, x: 78, adv: 30, gx: 80, crc: 0xF72A1653, fill: 478, ring: 205, shadow: 0 },
          { ch: '4', g: 4, w: 28, x: 108, adv: 30, gx: 109, crc: 0xB61483C7, fill: 487, ring: 174, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'staatliches', strip: 4, setting: 5, layout: 'A', size: 'a', mode: 'A_SPRITE', bottom: false,
      screen_w: 144, screen_h: 168, cell: 28, colon: 12, gap: 0, band_h: 76, band_y: 0,
      strip_h: 44, digit_h: 42, ring: 1, shadow: 0, cell_w: 28,
      rows: [
        { y: 6, total: 128, x0: 8, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 9, x: 8, adv: 29, gx: 18, crc: 0x882766D3, fill: 280, ring: 98, shadow: 0 },
          { ch: '2', g: 2, w: 25, x: 37, adv: 29, gx: 39, crc: 0xAA41E9AD, fill: 535, ring: 203, shadow: 0 },
          { ch: ':', g: 10, w: 9, x: 66, adv: 12, gx: 67, crc: 0x6A91D052, fill: 98, ring: 64, shadow: 0 },
          { ch: '3', g: 3, w: 25, x: 78, adv: 29, gx: 80, crc: 0xD78A4884, fill: 552, ring: 217, shadow: 0 },
          { ch: '4', g: 4, w: 26, x: 107, adv: 29, gx: 108, crc: 0x64445C7D, fill: 533, ring: 162, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'staatliches', strip: 4, setting: 5, layout: 'B', size: 'b', mode: 'B_SPRITE', bottom: false,
      screen_w: 144, screen_h: 168, cell: 48, colon: 48, gap: 8, band_h: 168, band_y: 0,
      strip_h: 64, digit_h: 62, ring: 1, shadow: 0, cell_w: 48,
      rows: [
        { y: 12, total: 104, x0: 20, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 13, x: 20, adv: 48, gx: 37, crc: 0x0EE80130, fill: 650, ring: 146, shadow: 0 },
          { ch: '2', g: 2, w: 36, x: 76, adv: 48, gx: 82, crc: 0x76EFDEA2, fill: 1187, ring: 303, shadow: 0 },
        ] },
        { y: 92, total: 104, x0: 20, ring_gap: 2, glyphs: [
          { ch: '3', g: 3, w: 36, x: 20, adv: 48, gx: 26, crc: 0xE3DCF3CB, fill: 1235, ring: 318, shadow: 0 },
          { ch: '4', g: 4, w: 38, x: 76, adv: 48, gx: 81, crc: 0x87687A9A, fill: 1167, ring: 240, shadow: 0 },
        ] },
      ] },
    { platform: 'flint', fmt: 'raw1', font: 'staatliches', strip: 4, setting: 5, layout: 'C', size: 'a', mode: 'A_SPRITE', bottom: true,
      screen_w: 144, screen_h: 168, cell: 28, colon: 12, gap: 0, band_h: 76, band_y: 92,
      strip_h: 44, digit_h: 42, ring: 1, shadow: 0, cell_w: 28,
      rows: [
        { y: 118, total: 128, x0: 8, ring_gap: 2, glyphs: [
          { ch: '1', g: 1, w: 9, x: 8, adv: 29, gx: 18, crc: 0x882766D3, fill: 280, ring: 98, shadow: 0 },
          { ch: '2', g: 2, w: 25, x: 37, adv: 29, gx: 39, crc: 0xAA41E9AD, fill: 535, ring: 203, shadow: 0 },
          { ch: ':', g: 10, w: 9, x: 66, adv: 12, gx: 67, crc: 0x6A91D052, fill: 98, ring: 64, shadow: 0 },
          { ch: '3', g: 3, w: 25, x: 78, adv: 29, gx: 80, crc: 0xD78A4884, fill: 552, ring: 217, shadow: 0 },
          { ch: '4', g: 4, w: 26, x: 107, adv: 29, gx: 108, crc: 0x64445C7D, fill: 533, ring: 162, shadow: 0 },
        ] },
      ] },
  ],

  /* foto demo: le decisioni del colore automatico della tabella di resources/photos/README.md. */
  photos: [
    { name: 'demo_1', platform: 'emery', fmt: 'raw6', file: 'demo_1.raw6', bytes: 34200, crc: 0x2B7BE24F, w: 200, h: 228,
      bands: [
        { layout: 'A', y: 0, h: 106, samples: 5300, bad_white: 0, bad_black: 96, mean: 15, white: true, bad_pct: 0, halo: false },
        { layout: 'B', y: 0, h: 228, samples: 11400, bad_white: 1, bad_black: 92, mean: 19, white: true, bad_pct: 1, halo: false },
        { layout: 'C', y: 122, h: 106, samples: 5300, bad_white: 2, bad_black: 90, mean: 20, white: true, bad_pct: 2, halo: false },
      ] },
    { name: 'demo_1', platform: 'flint', fmt: 'raw1', file: 'demo_1.raw1', bytes: 3024, crc: 0xA35A8FE7, w: 144, h: 168,
      bands: [
        { layout: 'A', y: 0, h: 76, samples: 2736, bad_white: 21, bad_black: 78, mean: 54, white: true, bad_pct: 21, halo: true },
        { layout: 'B', y: 0, h: 168, samples: 6048, bad_white: 22, bad_black: 77, mean: 57, white: true, bad_pct: 22, halo: true },
        { layout: 'C', y: 92, h: 76, samples: 2736, bad_white: 21, bad_black: 78, mean: 55, white: true, bad_pct: 21, halo: true },
      ] },
    { name: 'demo_2', platform: 'emery', fmt: 'raw6', file: 'demo_2.raw6', bytes: 34200, crc: 0xC91AE01B, w: 200, h: 228,
      bands: [
        { layout: 'A', y: 0, h: 106, samples: 5300, bad_white: 95, bad_black: 0, mean: 134, white: false, bad_pct: 0, halo: false },
        { layout: 'B', y: 0, h: 228, samples: 11400, bad_white: 84, bad_black: 6, mean: 133, white: false, bad_pct: 6, halo: false },
        { layout: 'C', y: 122, h: 106, samples: 5300, bad_white: 77, bad_black: 11, mean: 139, white: false, bad_pct: 11, halo: false },
      ] },
    { name: 'demo_2', platform: 'flint', fmt: 'raw1', file: 'demo_2.raw1', bytes: 3024, crc: 0xA7EF19B1, w: 144, h: 168,
      bands: [
        { layout: 'A', y: 0, h: 76, samples: 2736, bad_white: 86, bad_black: 13, mean: 221, white: false, bad_pct: 13, halo: true },
        { layout: 'B', y: 0, h: 168, samples: 6048, bad_white: 76, bad_black: 23, mean: 195, white: false, bad_pct: 23, halo: true },
        { layout: 'C', y: 92, h: 76, samples: 2736, bad_white: 70, bad_black: 29, mean: 178, white: false, bad_pct: 29, halo: true },
      ] },
  ],

  /* immagini sintetiche: la soglia del contorno al 15 % esatto sulla fascia in basso (D140). */
  synth: [
    { name: 'halo15', w: 200, h: 228, band_y: 122, band_h: 106, bg: 0, fg: 63, bright: 795,
      samples: 5300, bad_white: 15, bad_black: 85, mean: 38, white: true, bad_pct: 15, halo: true },
    { name: 'halo14', w: 200, h: 228, band_y: 122, band_h: 106, bg: 0, fg: 63, bright: 794,
      samples: 5300, bad_white: 14, bad_black: 85, mean: 38, white: true, bad_pct: 14, halo: false },
  ]
};

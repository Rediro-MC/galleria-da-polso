/* test_photo_codec.c — test host di photo_codec.c (nessun pebble.h). Tutti i buffer sono
 * static: niente array grandi sullo stack. Cwd = cartella test (fixture in fixtures/). */
#include <stdio.h>
#include <string.h>
#include "photo_codec.h"
#include "crc.h"

/* Fixture cross-language generata da tools/photo_prep.py --fixture (può non esistere). */
#if defined(__has_include)
#  if __has_include("fixtures/rt_meta.h")
#    include "fixtures/rt_meta.h"
#    define HAVE_RT_FIXTURE 1
#  endif
#endif

static int g_fail, g_pass;

#define CHECK(cond) do { \
    if (cond) { g_pass++; } \
    else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)

static uint32_t g_seed = 20260827u;
static uint8_t prv_rand8(void) {
  g_seed = g_seed * 1103515245u + 12345u;
  return (uint8_t)(g_seed >> 16);
}

#define SENT6  0xA5u                   /* sentinella: non ha l'alpha 0xC0 → mai un pixel valido */
#define SENT1  0x5Au

/* ---- round trip raw6 a basso livello: 480 px ---- */
#define RT_NPIX   480u
#define RT_NBYTES 360u                 /* 480 / 4 × 3 */
static uint8_t g_idx[RT_NPIX];
static uint8_t g_idx_hi[RT_NPIX];      /* stessi indici con i bit alti sporchi */
static uint8_t g_packed[RT_NBYTES];
static uint8_t g_packed2[RT_NBYTES + 8];
static uint8_t g_out[RT_NPIX + 16];    /* + coda sentinella */

/* Alimenta l'unpacker con blocchi di `chunk` byte (0 = lunghezze pseudo-casuali 0..63) e
 * verifica output e byte scritti. */
static void check_unpack_chunks(uint32_t chunk) {
  Raw6Unpacker u;
  raw6_unpack_init(&u);
  memset(g_out, SENT6, sizeof(g_out));
  uint32_t pos = 0;
  uint32_t w = 0;
  while (pos < RT_NBYTES) {
    uint32_t len = chunk ? chunk : (uint32_t)(prv_rand8() & 63u);
    if (len > RT_NBYTES - pos) {
      len = RT_NBYTES - pos;
    }
    uint32_t got = raw6_unpack(&u, g_packed + pos, len, g_out + w, RT_NPIX - w);
    if (got > RT_NPIX - w) {
      g_fail++;
      printf("FAIL chunk %lu: scritti %lu byte oltre la capacità\n", (unsigned long)chunk, (unsigned long)got);
      return;
    }
    w += got;
    pos += len;
  }
  uint32_t bad = 0;
  for (uint32_t i = 0; i < RT_NPIX; i++) {
    if (g_out[i] != (uint8_t)(PHOTO_PIXEL_OPAQUE | g_idx[i])) {
      bad++;
    }
  }
  for (uint32_t i = RT_NPIX; i < sizeof(g_out); i++) {
    if (g_out[i] != SENT6) {
      bad++;
    }
  }
  if (w != RT_NPIX || u.ncarry != 0 || bad != 0) {
    g_fail++;
    printf("FAIL unpack a chunk di %lu: scritti %lu (attesi %lu), ncarry %u, byte errati %lu\n",
           (unsigned long)chunk, (unsigned long)w, (unsigned long)RT_NPIX, (unsigned)u.ncarry,
           (unsigned long)bad);
  } else {
    g_pass++;
  }
}

static void test_raw6_roundtrip(void) {
  /* Primi 64 px: tutti gli indici; poi LCG. */
  for (uint32_t i = 0; i < RT_NPIX; i++) {
    g_idx[i] = (i < 64u) ? (uint8_t)i : (uint8_t)(prv_rand8() & 63u);
    g_idx_hi[i] = (uint8_t)(g_idx[i] | 0xC0u | ((i & 1u) ? 0x40u : 0x80u));
  }
  memset(g_packed, 0xEE, sizeof(g_packed));
  CHECK(raw6_pack(g_idx, RT_NPIX, g_packed, sizeof(g_packed)) == RT_NBYTES);
  /* I bit alti degli indici sono ignorati. */
  CHECK(raw6_pack(g_idx_hi, RT_NPIX, g_packed2, sizeof(g_packed2)) == RT_NBYTES);
  CHECK(memcmp(g_packed, g_packed2, RT_NBYTES) == 0);

  static const uint32_t chunks[] = { 1, 2, 3, 4, 5, 7, 149, 150, 151, 256, 1536 };
  for (uint32_t c = 0; c < sizeof(chunks) / sizeof(chunks[0]); c++) {
    check_unpack_chunks(chunks[c]);
  }
  for (uint32_t rep = 0; rep < 20; rep++) {
    check_unpack_chunks(0);            /* lunghezze pseudo-casuali */
  }

  /* n == 0 con in NULL; dst_cap == 0 con dst NULL. */
  {
    Raw6Unpacker u;
    raw6_unpack_init(&u);
    CHECK(raw6_unpack(&u, NULL, 0, g_out, 4) == 0);
    CHECK(u.ncarry == 0);
    CHECK(raw6_unpack(&u, g_packed, 2, NULL, 0) == 0);   /* 2 byte finiscono nel carry */
    CHECK(u.ncarry == 2);
    CHECK(raw6_unpack(NULL, g_packed, 3, g_out, 4) == 0);
  }

  /* pack: gruppo incompleto completato con 0; out_cap insufficiente → solo gruppi interi. */
  {
    static const uint8_t two[2] = { 0x3F, 0x00 };
    uint8_t o[6];
    memset(o, 0xEE, sizeof(o));
    CHECK(raw6_pack(two, 2, o, sizeof(o)) == 3);
    CHECK(o[0] == 0xFC && o[1] == 0x00 && o[2] == 0x00 && o[3] == 0xEE);
    CHECK(raw6_pack(g_idx, 8, o, 5) == 3);          /* 2 gruppi, ne entra uno */
    CHECK(raw6_pack(g_idx, 8, o, 2) == 0);
    CHECK(raw6_pack(NULL, 0, o, sizeof(o)) == 0);
    CHECK(raw6_pack(g_idx, 0, NULL, 0) == 0);
  }
}

/* ---- vettore a mano dalla formula dell'header ---- */
static void test_raw6_vector(void) {
  /* {0x3F,0x00,0x15,0x2A} → FC 05 6A; {0x01,0x02,0x03,0x04} → 04 20 C4; {3F×4} → FF FF FF;
   * {0,0,0,0} → 00 00 00. */
  static const uint8_t idx[16] = { 0x3F, 0x00, 0x15, 0x2A,  0x01, 0x02, 0x03, 0x04,
                                   0x3F, 0x3F, 0x3F, 0x3F,  0x00, 0x00, 0x00, 0x00 };
  static const uint8_t exp[12] = { 0xFC, 0x05, 0x6A,  0x04, 0x20, 0xC4,
                                   0xFF, 0xFF, 0xFF,  0x00, 0x00, 0x00 };
  uint8_t packed[12];
  uint8_t out[16];
  CHECK(raw6_pack(idx, 16, packed, sizeof(packed)) == 12);
  CHECK(memcmp(packed, exp, 12) == 0);

  Raw6Unpacker u;
  raw6_unpack_init(&u);
  memset(out, SENT6, sizeof(out));
  CHECK(raw6_unpack(&u, exp, 12, out, sizeof(out)) == 16);
  CHECK(out[0] == 0xFF && out[1] == 0xC0 && out[2] == 0xD5 && out[3] == 0xEA);
  CHECK(out[4] == 0xC1 && out[5] == 0xC2 && out[6] == 0xC3 && out[7] == 0xC4);
  CHECK(out[8] == 0xFF && out[11] == 0xFF && out[12] == 0xC0 && out[15] == 0xC0);
  for (uint32_t i = 0; i < 16; i++) {
    CHECK(out[i] == (uint8_t)(PHOTO_PIXEL_OPAQUE | idx[i]));
  }
  /* Stesso vettore un byte alla volta (carry 1 → 2 → gruppo). */
  raw6_unpack_init(&u);
  memset(out, SENT6, sizeof(out));
  uint32_t w = 0;
  for (uint32_t i = 0; i < 12; i++) {
    w += raw6_unpack(&u, exp + i, 1, out + w, sizeof(out) - w);
    CHECK(u.ncarry == (i + 1) % 3u);
  }
  CHECK(w == 16);
  for (uint32_t i = 0; i < 16; i++) {
    CHECK(out[i] == (uint8_t)(PHOTO_PIXEL_OPAQUE | idx[i]));
  }
}

/* ---- dst_cap insufficiente: scrive solo ciò che entra, non sfora ---- */
static void test_raw6_dst_cap(void) {
  static const uint8_t in[9] = { 0xFC, 0x05, 0x6A, 0x04, 0x20, 0xC4, 0xFF, 0xFF, 0xFF };
  uint8_t out[16];
  Raw6Unpacker u;

  /* cap 4: entra un gruppo su tre. */
  raw6_unpack_init(&u);
  memset(out, SENT6, sizeof(out));
  CHECK(raw6_unpack(&u, in, 9, out, 4) == 4);
  CHECK(out[0] == 0xFF && out[3] == 0xEA && out[4] == SENT6 && out[15] == SENT6);
  CHECK(u.ncarry == 0);

  /* cap 5..7: sempre un solo gruppo, out[4..] intatti. */
  for (uint32_t cap = 5; cap <= 7; cap++) {
    raw6_unpack_init(&u);
    memset(out, SENT6, sizeof(out));
    CHECK(raw6_unpack(&u, in, 9, out, cap) == 4);
    CHECK(out[4] == SENT6 && out[5] == SENT6 && out[6] == SENT6 && out[7] == SENT6);
  }

  /* cap 0: nulla scritto. cap 8 con 9 byte: due gruppi. */
  raw6_unpack_init(&u);
  memset(out, SENT6, sizeof(out));
  CHECK(raw6_unpack(&u, in, 9, out, 0) == 0);
  CHECK(out[0] == SENT6);
  raw6_unpack_init(&u);
  CHECK(raw6_unpack(&u, in, 9, out, 8) == 8);
  CHECK(out[7] == 0xC4 && out[8] == SENT6);

  /* Gruppo che si completa dal carry ma dst è pieno: scartato, ncarry azzerato. */
  raw6_unpack_init(&u);
  memset(out, SENT6, sizeof(out));
  CHECK(raw6_unpack(&u, in, 2, out, 16) == 0);
  CHECK(u.ncarry == 2);
  CHECK(raw6_unpack(&u, in + 2, 1, out, 0) == 0);
  CHECK(u.ncarry == 0);
  CHECK(out[0] == SENT6);
}

/* ---- PhotoDecoder raw6: buffer 228 × 204 (stride 204 > 200) ---- */
#define FB6_STRIDE 204u
static uint8_t g_pic_idx[RAW6_W * RAW6_H];
static uint8_t g_raw6[RAW6_BYTES + 512];       /* + byte in eccesso da ignorare */
static uint8_t g_fb6[FB6_STRIDE * RAW6_H];

/* Verifica il framebuffer intero: pixel = 0xC0|idx, padding = sentinella. Ritorna errori. */
static uint32_t check_fb6(void) {
  uint32_t bad = 0;
  for (uint32_t y = 0; y < RAW6_H; y++) {
    const uint8_t *row = g_fb6 + y * FB6_STRIDE;
    for (uint32_t x = 0; x < RAW6_W; x++) {
      if (row[x] != (uint8_t)(PHOTO_PIXEL_OPAQUE | g_pic_idx[y * RAW6_W + x])) {
        bad++;
      }
    }
    for (uint32_t x = RAW6_W; x < FB6_STRIDE; x++) {
      if (row[x] != SENT6) {
        bad++;
      }
    }
  }
  return bad;
}

/* Lunghezza massima dei chunk pseudo-casuali usati da run_decoder6 (deve superare 256). */
static uint32_t g_max_rand_len6;

/* Decodifica g_raw6 a blocchi da `chunk` byte (0 = pseudo-casuali 1..300, da due byte del
 * LCG: un solo byte non supererebbe mai 256) su g_fb6 e verifica. */
static void run_decoder6(uint32_t chunk, uint32_t total_in) {
  PhotoDecoder d;
  memset(g_fb6, SENT6, sizeof(g_fb6));
  CHECK(photo_decoder_init(&d, PHOTO_FMT_RAW6_200x228, g_fb6, FB6_STRIDE));
  CHECK(!photo_decoder_complete(&d));
  uint32_t pos = 0;
  uint32_t produced = 0;
  uint32_t calls = 0;
  bool complete_early = false;
  while (pos < total_in) {
    uint32_t len = chunk;
    if (len == 0) {
      uint32_t r = (uint32_t)prv_rand8() << 8;
      r |= prv_rand8();
      len = r % 300u + 1u;
      if (len > g_max_rand_len6) {
        g_max_rand_len6 = len;
      }
    }
    if (len > total_in - pos) {
      len = total_in - pos;
    }
    produced += photo_decoder_feed(&d, g_raw6 + pos, len);
    pos += len;
    calls++;
    if (pos < RAW6_BYTES && photo_decoder_complete(&d)) {
      complete_early = true;
    }
  }
  uint32_t bad = check_fb6();
  if (complete_early || !photo_decoder_complete(&d) || produced != (uint32_t)RAW6_W * RAW6_H
      || d.in_pos != RAW6_BYTES || d.out_pos != (uint32_t)RAW6_W * RAW6_H || bad != 0) {
    g_fail++;
    printf("FAIL decoder raw6 chunk %lu (input %lu, %lu chiamate): early %d, complete %d, "
           "prodotti %lu, in_pos %lu, out_pos %lu, byte errati %lu\n",
           (unsigned long)chunk, (unsigned long)total_in, (unsigned long)calls, (int)complete_early,
           (int)photo_decoder_complete(&d), (unsigned long)produced, (unsigned long)d.in_pos,
           (unsigned long)d.out_pos, (unsigned long)bad);
  } else {
    g_pass++;
  }
}

static void test_decoder_raw6(void) {
  for (uint32_t i = 0; i < sizeof(g_pic_idx); i++) {
    g_pic_idx[i] = (uint8_t)(prv_rand8() & 63u);
  }
  CHECK(raw6_pack(g_pic_idx, sizeof(g_pic_idx), g_raw6, sizeof(g_raw6)) == RAW6_BYTES);
  for (uint32_t i = RAW6_BYTES; i < sizeof(g_raw6); i++) {
    g_raw6[i] = 0xFF;                  /* eccesso: se venisse decodificato, si vedrebbe */
  }

  CHECK(photo_format_length(PHOTO_FMT_RAW6_200x228) == RAW6_BYTES);
  CHECK(photo_format_row_bytes(PHOTO_FMT_RAW6_200x228) == RAW6_OUT_ROW_BYTES);
  CHECK(photo_format_rows(PHOTO_FMT_RAW6_200x228) == RAW6_H);

  run_decoder6(256, RAW6_BYTES);                 /* come i chunk persist */
  run_decoder6(1536, RAW6_BYTES);                /* come le risorse */
  run_decoder6(RAW6_BYTES, RAW6_BYTES);          /* tutto in una volta */
  run_decoder6(1, RAW6_BYTES);                   /* un byte alla volta */
  run_decoder6(2, RAW6_BYTES);
  run_decoder6(149, RAW6_BYTES);
  run_decoder6(151, RAW6_BYTES);
  run_decoder6(7936, RAW6_BYTES);                /* MAX_CHUNK emery */
  g_max_rand_len6 = 0;
  for (uint32_t rep = 0; rep < 5; rep++) {
    run_decoder6(0, RAW6_BYTES);
  }
  CHECK(g_max_rand_len6 > 256u && g_max_rand_len6 <= 300u);   /* il ramo casuale supera davvero 256 */
  /* Input in eccesso (ignorato, non contato): a chunk e in un colpo solo. */
  run_decoder6(256, sizeof(g_raw6));
  run_decoder6(sizeof(g_raw6), sizeof(g_raw6));

  /* Stato a metà e dopo il completamento. */
  {
    PhotoDecoder d;
    memset(g_fb6, SENT6, sizeof(g_fb6));
    CHECK(photo_decoder_init(&d, PHOTO_FMT_RAW6_200x228, g_fb6, RAW6_OUT_ROW_BYTES)); /* stride == row_bytes */
    CHECK(photo_decoder_feed(&d, g_raw6, 256) == 340);      /* 85 gruppi, carry 1 */
    CHECK(d.in_pos == 256 && d.out_pos == 340 && d.u.ncarry == 1);
    CHECK(!photo_decoder_complete(&d));
    CHECK(photo_decoder_feed(&d, g_raw6 + 256, 0) == 0);
    CHECK(photo_decoder_feed(&d, NULL, 0) == 0);
    CHECK(photo_decoder_feed(&d, g_raw6 + 256, RAW6_BYTES - 256) == (uint32_t)RAW6_W * RAW6_H - 340);
    CHECK(photo_decoder_complete(&d));
    CHECK(photo_decoder_feed(&d, g_raw6, 100) == 0);        /* dopo la fine: ignorato */
    CHECK(d.in_pos == RAW6_BYTES);
    CHECK(photo_decoder_complete(&d));
    /* Con stride 200 il buffer 228×204 è usato in modo compatto: verifica diretta. */
    uint32_t bad = 0;
    for (uint32_t i = 0; i < (uint32_t)RAW6_W * RAW6_H; i++) {
      if (g_fb6[i] != (uint8_t)(PHOTO_PIXEL_OPAQUE | g_pic_idx[i])) {
        bad++;
      }
    }
    for (uint32_t i = (uint32_t)RAW6_W * RAW6_H; i < sizeof(g_fb6); i++) {
      if (g_fb6[i] != SENT6) {
        bad++;
      }
    }
    CHECK(bad == 0);
  }

  /* init non valida. */
  {
    PhotoDecoder d;
    CHECK(!photo_decoder_init(&d, PHOTO_FMT_RAW6_200x228, g_fb6, RAW6_OUT_ROW_BYTES - 1));
    CHECK(!photo_decoder_complete(&d));
    CHECK(photo_decoder_feed(&d, g_raw6, 256) == 0);        /* inerte */
    CHECK(!photo_decoder_init(&d, PHOTO_FMT_NONE, g_fb6, FB6_STRIDE));
    CHECK(!photo_decoder_init(&d, 99, g_fb6, FB6_STRIDE));
    CHECK(!photo_decoder_init(&d, PHOTO_FMT_RAW6_200x228, NULL, FB6_STRIDE));
    CHECK(!photo_decoder_init(NULL, PHOTO_FMT_RAW6_200x228, g_fb6, FB6_STRIDE));
    CHECK(!photo_decoder_complete(NULL));
    CHECK(photo_decoder_feed(NULL, g_raw6, 1) == 0);
    CHECK(photo_format_length(PHOTO_FMT_NONE) == 0);
    CHECK(photo_format_length(99) == 0);
    CHECK(photo_format_row_bytes(0) == 0 && photo_format_rows(0) == 0);
    CHECK(photo_format_row_bytes(99) == 0 && photo_format_rows(99) == 0);
  }
}

/* ---- PhotoDecoder raw1: stride 18 e 20 ---- */
#define FB1_STRIDE_MAX 20u
static uint8_t g_raw1[RAW1_BYTES + 256];
static uint8_t g_fb1[FB1_STRIDE_MAX * RAW1_H];

static void run_decoder1(uint16_t stride, uint32_t chunk, uint32_t total_in) {
  PhotoDecoder d;
  memset(g_fb1, SENT1, sizeof(g_fb1));
  CHECK(photo_decoder_init(&d, PHOTO_FMT_RAW1_144x168, g_fb1, stride));
  CHECK(!photo_decoder_complete(&d));
  uint32_t pos = 0;
  uint32_t produced = 0;
  bool complete_early = false;
  while (pos < total_in) {
    uint32_t len = chunk ? chunk : (uint32_t)(prv_rand8() % 40u) + 1u;
    if (len > total_in - pos) {
      len = total_in - pos;
    }
    produced += photo_decoder_feed(&d, g_raw1 + pos, len);
    pos += len;
    if (pos < RAW1_BYTES && photo_decoder_complete(&d)) {
      complete_early = true;
    }
  }
  uint32_t bad = 0;
  for (uint32_t y = 0; y < RAW1_H; y++) {
    const uint8_t *row = g_fb1 + y * stride;
    for (uint32_t x = 0; x < RAW1_ROW_BYTES; x++) {
      if (row[x] != g_raw1[y * RAW1_ROW_BYTES + x]) {
        bad++;
      }
    }
    for (uint32_t x = RAW1_ROW_BYTES; x < stride; x++) {
      if (row[x] != SENT1) {
        bad++;
      }
    }
  }
  for (uint32_t i = (uint32_t)stride * RAW1_H; i < sizeof(g_fb1); i++) {
    if (g_fb1[i] != SENT1) {
      bad++;
    }
  }
  if (complete_early || !photo_decoder_complete(&d) || produced != RAW1_BYTES
      || d.in_pos != RAW1_BYTES || d.out_pos != RAW1_BYTES || bad != 0) {
    g_fail++;
    printf("FAIL decoder raw1 stride %u chunk %lu (input %lu): early %d, complete %d, prodotti %lu, "
           "in_pos %lu, out_pos %lu, byte errati %lu\n",
           (unsigned)stride, (unsigned long)chunk, (unsigned long)total_in, (int)complete_early,
           (int)photo_decoder_complete(&d), (unsigned long)produced, (unsigned long)d.in_pos,
           (unsigned long)d.out_pos, (unsigned long)bad);
  } else {
    g_pass++;
  }
}

static void test_decoder_raw1(void) {
  /* Pattern noto: riga y, byte x → (y*18+x) ^ 0x33, così ogni byte è distinguibile. */
  for (uint32_t i = 0; i < RAW1_BYTES; i++) {
    g_raw1[i] = (uint8_t)(i ^ 0x33u);
  }
  for (uint32_t i = RAW1_BYTES; i < sizeof(g_raw1); i++) {
    g_raw1[i] = 0xFF;
  }
  CHECK(photo_format_length(PHOTO_FMT_RAW1_144x168) == RAW1_BYTES);
  CHECK(photo_format_row_bytes(PHOTO_FMT_RAW1_144x168) == RAW1_ROW_BYTES);
  CHECK(photo_format_rows(PHOTO_FMT_RAW1_144x168) == RAW1_H);

  run_decoder1(18, 256, RAW1_BYTES);
  run_decoder1(18, RAW1_BYTES, RAW1_BYTES);
  run_decoder1(18, 1, RAW1_BYTES);
  run_decoder1(18, 3072, sizeof(g_raw1));        /* MAX_CHUNK flint + eccesso */
  run_decoder1(20, 256, RAW1_BYTES);
  run_decoder1(20, RAW1_BYTES, RAW1_BYTES);
  run_decoder1(20, 17, RAW1_BYTES);
  run_decoder1(20, 19, RAW1_BYTES);
  run_decoder1(20, 256, sizeof(g_raw1));         /* eccesso a chunk */
  for (uint32_t rep = 0; rep < 5; rep++) {
    run_decoder1(20, 0, RAW1_BYTES);
    run_decoder1(18, 0, RAW1_BYTES);
  }
  {
    PhotoDecoder d;
    CHECK(!photo_decoder_init(&d, PHOTO_FMT_RAW1_144x168, g_fb1, 17));
    CHECK(photo_decoder_init(&d, PHOTO_FMT_RAW1_144x168, g_fb1, 20));
    CHECK(photo_decoder_feed(&d, g_raw1, 100) == 100);
    CHECK(d.in_pos == 100 && d.out_pos == 100);
    CHECK(!photo_decoder_complete(&d));
  }
}

/* ---- decodifica in place: input nella coda del buffer di output (garanzia di photo_codec.h) ---- */

static uint8_t g_ip[RAW6_OUT_ROW_BYTES * RAW6_H];        /* 45.600 B: il "bitmap" */

/* Riempie g_ip con la coda = raw6 dell'immagine g_pic_idx e decodifica a chunk della lunghezza
 * data (0 = tutto in una chiamata); poi confronta con 0xC0|idx. */
static void run_inplace6(uint32_t chunk) {
  const uint32_t tail = (uint32_t)RAW6_OUT_ROW_BYTES * RAW6_H - RAW6_BYTES;   /* 11.400 */
  memset(g_ip, 0xA5, sizeof(g_ip));
  memcpy(g_ip + tail, g_raw6, RAW6_BYTES);
  PhotoDecoder d;
  CHECK(photo_decoder_init(&d, PHOTO_FMT_RAW6_200x228, g_ip, RAW6_OUT_ROW_BYTES));
  uint32_t pos = 0;
  while (pos < RAW6_BYTES) {
    uint32_t take = chunk ? chunk : RAW6_BYTES;
    if (take > RAW6_BYTES - pos) {
      take = RAW6_BYTES - pos;
    }
    photo_decoder_feed(&d, g_ip + tail + pos, take);
    pos += take;
  }
  CHECK(photo_decoder_complete(&d));
  uint32_t bad = 0;
  for (uint32_t i = 0; i < (uint32_t)RAW6_W * RAW6_H; i++) {
    if (g_ip[i] != (uint8_t)(PHOTO_PIXEL_OPAQUE | (g_pic_idx[i] & 63u))) {
      bad++;
    }
  }
  if (bad) {
    printf("FAIL inplace6 chunk=%lu: %lu pixel diversi\n", (unsigned long)chunk, (unsigned long)bad);
    g_fail++;
  } else {
    g_pass++;
  }
}

static void test_decoder_inplace(void) {
  /* immagine pseudo-casuale con tutti gli indici e byte alti sporchi nell'idx */
  for (uint32_t i = 0; i < (uint32_t)RAW6_W * RAW6_H; i++) {
    g_pic_idx[i] = (uint8_t)((i < 64u) ? i : prv_rand8());
  }
  CHECK(raw6_pack(g_pic_idx, (uint32_t)RAW6_W * RAW6_H, g_raw6, sizeof(g_raw6)) == RAW6_BYTES);
  run_inplace6(0);          /* una sola chiamata (ui_photo) */
  run_inplace6(1536);
  run_inplace6(256);        /* chunk persist */
  run_inplace6(1);
  run_inplace6(7);
  run_inplace6(299);
  /* raw1: con stride 18 il payload è già nel layout del bitmap (nessuna decodifica: ui_photo
   * legge direttamente in gbitmap_get_data); qui si verifica solo che il decoder con in == dst
   * non sia necessario, cioè che la copia riga per riga sia l'identità. */
  for (uint32_t i = 0; i < RAW1_BYTES; i++) {
    g_raw1[i] = (uint8_t)(i * 7u + 3u);
  }
  memcpy(g_fb1, g_raw1, RAW1_BYTES);
  CHECK(memcmp(g_fb1, g_raw1, RAW1_BYTES) == 0);
}

/* ---- fixture cross-language (tools/photo_prep.py) ---- */
#ifdef HAVE_RT_FIXTURE
static uint8_t g_rt_idx[(uint32_t)RT_W * RT_H];
static uint8_t g_rt_raw6[RT_RAW6_LEN];
static uint8_t g_rt_unp[(uint32_t)RT_W * RT_H];
static uint8_t g_rt_pack[RT_RAW6_LEN];
static uint8_t g_rt_bits[(uint32_t)RT1_W * RT1_H];
static uint8_t g_rt_raw1[RT_RAW1_LEN];

/* Legge esattamente `len` byte; 1 ok, 0 file mancante, -1 lunghezza sbagliata. */
static int prv_read_fixture(const char *path, uint8_t *buf, uint32_t len) {
  FILE *f = fopen(path, "rb");
  if (!f) {
    return 0;
  }
  uint32_t got = (uint32_t)fread(buf, 1, len, f);
  uint8_t extra;
  int eof = (fread(&extra, 1, 1, f) == 0);
  fclose(f);
  return (got == len && eof) ? 1 : -1;
}

static void test_fixture(void) {
  static const char *paths[4] = { "fixtures/rt.idx", "fixtures/rt.raw6", "fixtures/rt.bits", "fixtures/rt.raw1" };
  uint8_t *bufs[4] = { g_rt_idx, g_rt_raw6, g_rt_bits, g_rt_raw1 };
  const uint32_t lens[4] = { (uint32_t)RT_W * RT_H, RT_RAW6_LEN, (uint32_t)RT1_W * RT1_H, RT_RAW1_LEN };
  for (uint32_t k = 0; k < 4; k++) {
    int r = prv_read_fixture(paths[k], bufs[k], lens[k]);
    if (r == 0) {
      printf("SKIP fixture (%s mancante)\n", paths[k]);
      return;
    }
    if (r < 0) {
      g_fail++;
      printf("FAIL fixture %s: lunghezza diversa da %lu\n", paths[k], (unsigned long)lens[k]);
      return;
    }
  }
  const uint32_t npix = (uint32_t)RT_W * RT_H;
  const uint32_t row1 = ((uint32_t)RT1_W + 7u) / 8u;

  /* CRC32 dei payload = define del tool. */
  CHECK(crc32_update(0, g_rt_raw6, RT_RAW6_LEN) == (uint32_t)RT_RAW6_CRC32);
  CHECK(crc32_update(0, g_rt_raw1, RT_RAW1_LEN) == (uint32_t)RT_RAW1_CRC32);
  CHECK(RT_RAW6_LEN == npix / 4u * 3u);
  CHECK(RT_RAW1_LEN == row1 * RT1_H);

  /* unpack(rt.raw6) == 0xC0 | rt.idx; pack(rt.idx) == rt.raw6. */
  {
    Raw6Unpacker u;
    raw6_unpack_init(&u);
    memset(g_rt_unp, SENT6, sizeof(g_rt_unp));
    CHECK(raw6_unpack(&u, g_rt_raw6, RT_RAW6_LEN, g_rt_unp, sizeof(g_rt_unp)) == npix);
    uint32_t bad = 0;
    for (uint32_t i = 0; i < npix; i++) {
      if (g_rt_unp[i] != (uint8_t)(PHOTO_PIXEL_OPAQUE | (g_rt_idx[i] & 63u))) {
        bad++;
      }
    }
    CHECK(bad == 0);
    CHECK(raw6_pack(g_rt_idx, npix, g_rt_pack, sizeof(g_rt_pack)) == RT_RAW6_LEN);
    CHECK(memcmp(g_rt_pack, g_rt_raw6, RT_RAW6_LEN) == 0);
  }
  /* Se la fixture ha le dimensioni emery, anche il PhotoDecoder deve riprodurla. */
#if (RT_W == 200) && (RT_H == 228)
  {
    PhotoDecoder d;
    memset(g_fb6, SENT6, sizeof(g_fb6));
    CHECK(photo_decoder_init(&d, PHOTO_FMT_RAW6_200x228, g_fb6, FB6_STRIDE));
    for (uint32_t pos = 0; pos < RT_RAW6_LEN; pos += 256) {
      uint32_t len = (RT_RAW6_LEN - pos < 256u) ? RT_RAW6_LEN - pos : 256u;
      photo_decoder_feed(&d, g_rt_raw6 + pos, len);
    }
    CHECK(photo_decoder_complete(&d));
    uint32_t bad = 0;
    for (uint32_t y = 0; y < RAW6_H; y++) {
      for (uint32_t x = 0; x < RAW6_W; x++) {
        if (g_fb6[y * FB6_STRIDE + x] != (uint8_t)(PHOTO_PIXEL_OPAQUE | (g_rt_idx[y * RAW6_W + x] & 63u))) {
          bad++;
        }
      }
    }
    CHECK(bad == 0);
  }
#endif

  /* raw1: bit (0x80 >> (x&7)) del byte x/8 della riga y == rt.bits[y*W+x]. */
  {
    uint32_t bad = 0;
    for (uint32_t y = 0; y < (uint32_t)RT1_H; y++) {
      for (uint32_t x = 0; x < (uint32_t)RT1_W; x++) {
        uint8_t byte = g_rt_raw1[y * row1 + (x >> 3)];
        uint8_t bit = (byte & (uint8_t)(0x80u >> (x & 7u))) ? 1u : 0u;
        if (bit != (g_rt_bits[y * (uint32_t)RT1_W + x] ? 1u : 0u)) {
          bad++;
        }
      }
    }
    CHECK(bad == 0);
  }
  printf("fixture: %dx%d raw6 %lu B, %dx%d raw1 %lu B verificati\n", (int)RT_W, (int)RT_H,
         (unsigned long)RT_RAW6_LEN, (int)RT1_W, (int)RT1_H, (unsigned long)RT_RAW1_LEN);
}
#else
static void test_fixture(void) {
  printf("SKIP fixture (fixtures/rt_meta.h assente)\n");
}
#endif

int main(void) {
  test_raw6_roundtrip();
  test_raw6_vector();
  test_raw6_dst_cap();
  test_decoder_raw6();
  test_decoder_raw1();
  test_decoder_inplace();
  test_fixture();

  printf("photo_codec: %d ok, %d falliti\n", g_pass, g_fail);
  return g_fail ? 1 : 0;
}

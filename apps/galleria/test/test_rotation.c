/* test_rotation.c — test host di rotation.c (gcc). Esegue: make -C apps/galleria/test run-test_rotation */
#include <stdio.h>
#include <string.h>
#include "rotation.h"
#include "photo_codec.h"

static int g_ok, g_fail;
#define CHECK(cond) do { if (cond) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); } } while (0)
#define CHECK_EQ(a, b) do { long long _a = (long long)(a), _b = (long long)(b); if (_a == _b) { g_ok++; } else { g_fail++; printf("FAIL %s:%d: %s = %lld, atteso %s = %lld\n", __FILE__, __LINE__, #a, _a, #b, _b); } } while (0)

static const uint8_t FMT = PHOTO_FMT_RAW6_200x228;

static void manifest_init(GalManifest *m) {
  memset(m, 0, sizeof(*m));
  m->magic = GAL_MAGIC;
  m->schema = GAL_SCHEMA;
  m->slot_count = GAL_MAX_SLOTS;
  memset(m->order, GAL_SLOT_NONE, sizeof(m->order));
}

static void slot_set(GalManifest *m, uint8_t k, uint8_t state, uint8_t fmt) {
  m->slots[k].state = state;
  m->slots[k].format = fmt;
  m->slots[k].length = photo_format_length(fmt);
}

static void test_sizes(void) {
  CHECK_EQ(sizeof(GalSlotMeta), 16);
  CHECK_EQ(sizeof(GalManifest), 214);
  CHECK_EQ(sizeof(GalRotState), 4);
  CHECK_EQ(GAL_KEY_CHUNK(0, 0), 1000u);
  CHECK_EQ(GAL_KEY_CHUNK(11, 255), 1000u + 11u * 256u + 255u);
}

static void test_local_minutes(void) {
  CHECK_EQ(rotation_local_minutes(1970, 1, 1, 0, 0), 0);
  CHECK_EQ(rotation_local_minutes(1970, 1, 1, 0, 1), 1);
  CHECK_EQ(rotation_local_minutes(1970, 1, 2, 0, 0), 1440);
  CHECK_EQ(rotation_local_minutes(1970, 2, 1, 0, 0), 31u * 1440u);
  CHECK_EQ(rotation_local_minutes(1971, 1, 1, 0, 0), 365u * 1440u);
  CHECK_EQ(rotation_local_minutes(1972, 3, 1, 0, 0), (365u * 2u + 31u + 29u) * 1440u);   /* 1972 bisestile */
  CHECK_EQ(rotation_local_minutes(2000, 1, 1, 0, 0), 10957u * 1440u);
  CHECK_EQ(rotation_local_minutes(2000, 3, 1, 0, 0), 11017u * 1440u);                     /* 2000 bisestile */
  CHECK_EQ(rotation_local_minutes(2100, 3, 1, 0, 0), 47541u * 1440u);                     /* 2100 NON bisestile */
  CHECK_EQ(rotation_local_minutes(2026, 8, 28, 10, 30), 20693u * 1440u + 10u * 60u + 30u);
  CHECK_EQ(rotation_local_minutes(2038, 1, 19, 3, 14), 24855u * 1440u + 3u * 60u + 14u);  /* oltre 2^31 s */
  /* saturazione: mai crash, valori monotoni */
  CHECK_EQ(rotation_local_minutes(1969, 12, 31, 23, 59), 0);
  CHECK_EQ(rotation_local_minutes(1900, 1, 1, 0, 0), 0);
  CHECK_EQ(rotation_local_minutes(1970, 0, 0, -5, -5), 0);
  CHECK_EQ(rotation_local_minutes(1970, 13, 40, 30, 70), rotation_local_minutes(1970, 12, 31, 23, 59));
  CHECK(rotation_local_minutes(6000, 12, 31, 23, 59) > rotation_local_minutes(5999, 12, 31, 23, 59));
  /* consecutività su un anno intero: ogni giorno = giorno precedente + 1440 */
  static const uint8_t mdays[12] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
  uint32_t prev = rotation_local_minutes(2023, 12, 31, 0, 0);
  int bad = 0;
  for (int mo = 1; mo <= 12; mo++) {
    for (int d = 1; d <= mdays[mo - 1] + (mo == 2 ? 1 : 0); d++) {   /* 2024 bisestile */
      uint32_t v = rotation_local_minutes(2024, mo, d, 0, 0);
      if (v != prev + 1440u) {
        bad++;
      }
      prev = v;
    }
  }
  CHECK_EQ(bad, 0);
  CHECK_EQ(rotation_local_minutes(2025, 1, 1, 0, 0), prev + 1440u);
}

static void test_index_sequential(void) {
  /* ogni 30 min, 3 elementi, nessuno shake */
  CHECK_EQ(rotation_index(0, 3, 30, 0, 0), 0);
  CHECK_EQ(rotation_index(29, 3, 30, 0, 0), 0);
  CHECK_EQ(rotation_index(30, 3, 30, 0, 0), 1);
  CHECK_EQ(rotation_index(59, 3, 30, 0, 0), 1);
  CHECK_EQ(rotation_index(60, 3, 30, 0, 0), 2);
  CHECK_EQ(rotation_index(90, 3, 30, 0, 0), 0);
  /* shake = posizione successiva, stabile fino al prossimo confine */
  CHECK_EQ(rotation_index(0, 3, 30, 0, 1), 1);
  CHECK_EQ(rotation_index(29, 3, 30, 0, 1), 1);
  CHECK_EQ(rotation_index(30, 3, 30, 0, 1), 2);
  CHECK_EQ(rotation_index(0, 3, 30, 0, 255), 255 % 3);
  /* mai (0): solo lo shake muove */
  CHECK_EQ(rotation_index(0, 4, 0, 0, 0), 0);
  CHECK_EQ(rotation_index(1000000, 4, 0, 0, 0), 0);
  CHECK_EQ(rotation_index(1000000, 4, 0, 0, 5), 1);
  /* n = 1: sempre 0; n = 0: 0 */
  CHECK_EQ(rotation_index(12345, 1, 5, 0, 7), 0);
  CHECK_EQ(rotation_index(12345, 0, 5, 0, 7), 0);
  /* intervallo di test di 1 minuto (GALLERIA_DEBUG_INTERVAL) */
  CHECK_EQ(rotation_index(7, 2, 1, 0, 0), 1);
  CHECK_EQ(rotation_index(8, 2, 1, 0, 0), 0);
  /* giornaliera: cambio al primo tick dopo le 04:00 locali */
  const uint32_t day = 20693u * 1440u;                       /* 2026-08-28 00:00 */
  const uint8_t a = rotation_index(day + 239, 5, 1440, 0, 0);  /* 03:59 */
  const uint8_t b = rotation_index(day + 240, 5, 1440, 0, 0);  /* 04:00 */
  CHECK(a != b);
  CHECK_EQ(rotation_index(day + 240, 5, 1440, 0, 0), rotation_index(day + 1440 + 239, 5, 1440, 0, 0));   /* fino alle 03:59 del giorno dopo */
  CHECK_EQ((b + 1) % 5, rotation_index(day + 1440 + 240, 5, 1440, 0, 0));
  CHECK_EQ(rotation_index(day + 239, 5, 1440, 0, 0), rotation_index(day - 1440 + 240, 5, 1440, 0, 0));
  /* n > 12 viene limitato a 12 */
  CHECK(rotation_index(0, 200, 5, 0, 13) < 12);
}

static void test_index_random(void) {
  const uint8_t n = 5;
  /* dentro un round tutti diversi; round consecutivi: mai la stessa foto due volte di seguito */
  int dup_in_round = 0, same_at_boundary = 0, out_of_range = 0;
  uint8_t prev = 0xFF;
  for (uint32_t k = 0; k < 5000; k++) {
    const uint8_t idx = rotation_index(k * 30u, n, 30, 1, 0);
    if (idx >= n) {
      out_of_range++;
    }
    if (k % n == 0) {
      uint16_t seen = 0;
      for (uint8_t p = 0; p < n; p++) {
        const uint8_t v = rotation_index((k + p) * 30u, n, 30, 1, 0);
        if (seen & (1u << v)) {
          dup_in_round++;
        }
        seen |= (uint16_t)(1u << v);
      }
    }
    if (prev == idx) {
      same_at_boundary++;
    }
    prev = idx;
  }
  CHECK_EQ(out_of_range, 0);
  CHECK_EQ(dup_in_round, 0);
  CHECK_EQ(same_at_boundary, 0);
  /* deterministico e diverso dal sequenziale (per n ≥ 3) */
  CHECK_EQ(rotation_index(4242, 7, 15, 1, 3), rotation_index(4242, 7, 15, 1, 3));
  int differs = 0;
  for (uint32_t k = 0; k < 100; k++) {
    if (rotation_index(k * 15u, 7, 15, 1, 0) != rotation_index(k * 15u, 7, 15, 0, 0)) {
      differs++;
    }
  }
  CHECK(differs > 30);
  /* n ≤ 2: come sequenziale */
  for (uint32_t k = 0; k < 20; k++) {
    CHECK_EQ(rotation_index(k * 5u, 2, 5, 1, 0), k % 2);
    CHECK_EQ(rotation_index(k * 5u, 1, 5, 1, 0), 0);
  }
  /* shake: sposta di una posizione nella permutazione, cioè cambia foto (n ≥ 2) */
  int shake_same = 0;
  for (uint32_t k = 0; k < 500; k++) {
    if (rotation_index(k * 30u, n, 30, 1, 0) == rotation_index(k * 30u, n, 30, 1, 1)) {
      shake_same++;
    }
  }
  CHECK_EQ(shake_same, 0);
  /* 12 elementi, giornaliera: ogni round mostra tutti i 12 */
  uint16_t seen = 0;
  for (uint32_t d = 0; d < 12; d++) {
    seen |= (uint16_t)(1u << rotation_index(d * 1440u, 12, 1440, 1, 0));   /* 00:00 del giorno d: periodo d */
  }
  CHECK_EQ(seen, 0x0FFF);
}

static void test_sequence(void) {
  GalManifest m;
  uint8_t seq[GAL_MAX_SLOTS];
  manifest_init(&m);
  CHECK_EQ(rotation_sequence(&m, FMT, 0, seq), 0);                   /* album vuoto */
  CHECK_EQ(rotation_slot(0, &m, FMT, 0, 30, 0, 0), GAL_SLOT_NONE);
  CHECK_EQ(rotation_sequence(NULL, FMT, 0, seq), 0);

  /* order[] con duplicati, slot non validi, formato sbagliato e terminatore */
  slot_set(&m, 3, GAL_SLOT_VALID, FMT);
  slot_set(&m, 1, GAL_SLOT_VALID, PHOTO_FMT_RAW1_144x168);            /* altra piattaforma: ignorato */
  slot_set(&m, 7, GAL_SLOT_EMPTY, FMT);
  slot_set(&m, 9, GAL_SLOT_VALID, FMT);                                /* valido ma non in order[] */
  m.order[0] = 3; m.order[1] = 1; m.order[2] = 3; m.order[3] = 7; m.order[4] = GAL_SLOT_NONE; m.order[5] = 9;
  CHECK_EQ(rotation_sequence(&m, FMT, 0, seq), 1);
  CHECK_EQ(seq[0], 3);
  CHECK_EQ(rotation_slot(0, &m, FMT, 0, 30, 0, 0), 3);
  CHECK_EQ(rotation_slot(999999, &m, FMT, 0, 30, 1, 200), 3);
  /* skip_mask: slot 3 illeggibile → order[] non produce nulla → ordine naturale (9) */
  CHECK_EQ(rotation_sequence(&m, FMT, 1u << 3, seq), 1);
  CHECK_EQ(seq[0], 9);
  CHECK_EQ(rotation_slot(0, &m, FMT, (1u << 3) | (1u << 9), 30, 0, 0), GAL_SLOT_NONE);
  /* indici fuori intervallo in order[] ignorati */
  m.order[0] = 12; m.order[1] = 200; m.order[2] = 3; m.order[3] = GAL_SLOT_NONE;
  CHECK_EQ(rotation_sequence(&m, FMT, 0, seq), 1);
  CHECK_EQ(seq[0], 3);

  /* order[] vuoto e più slot validi: ordine naturale */
  manifest_init(&m);
  slot_set(&m, 5, GAL_SLOT_VALID, FMT);
  slot_set(&m, 2, GAL_SLOT_VALID, FMT);
  slot_set(&m, 11, GAL_SLOT_VALID, FMT);
  CHECK_EQ(rotation_sequence(&m, FMT, 0, seq), 3);
  CHECK_EQ(seq[0], 2); CHECK_EQ(seq[1], 5); CHECK_EQ(seq[2], 11);
  CHECK_EQ(rotation_slot(0, &m, FMT, 0, 30, 0, 0), 2);
  CHECK_EQ(rotation_slot(30, &m, FMT, 0, 30, 0, 0), 5);
  CHECK_EQ(rotation_slot(60, &m, FMT, 0, 30, 0, 0), 11);
  CHECK_EQ(rotation_slot(90, &m, FMT, 0, 30, 0, 0), 2);
  CHECK_EQ(rotation_slot(0, &m, FMT, 0, 30, 0, 1), 5);              /* shake */
  /* 12 slot pieni con order[] completo invertito */
  manifest_init(&m);
  for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {
    slot_set(&m, k, GAL_SLOT_VALID, FMT);
    m.order[k] = (uint8_t)(GAL_MAX_SLOTS - 1 - k);
  }
  CHECK_EQ(rotation_sequence(&m, FMT, 0, seq), 12);
  CHECK_EQ(seq[0], 11); CHECK_EQ(seq[11], 0);
  CHECK_EQ(rotation_slot(5 * 11, &m, FMT, 0, 5, 0, 0), 0);
  CHECK_EQ(rotation_slot(5 * 12, &m, FMT, 0, 5, 0, 0), 11);
}


/* ================================================================================================
 * S4 — estensione ADVERSARIALE (nuove funzioni in coda; le precedenti non sono state toccate).
 * Obiettivo: rompere il contratto scritto in rotation.h.
 *  1) rotation_local_minutes contro un ORACOLO ESTERNO (python3/datetime, tabella qui sotto),
 *     saturazione su tutta la griglia INT32_MIN..INT32_MAX e monotonia minuto per minuto.
 *  2) rotation_index: invarianti esaustive (range, determinismo, round, confine giornaliero).
 *  3) rotation_sequence/rotation_slot: pattern degeneri + fuzz contro una reimplementazione
 *     INDIPENDENTE del contratto (ref_sequence), con canarino sul buffer di uscita.
 * ================================================================================================ */

/* Tabella di riferimento generata con python3/datetime (calendario gregoriano proleptico):
 * 340 date sparse 1970-6000 + bisestili, anni secolari, confini d'anno e orari estremi. */
typedef struct { int16_t y; int8_t mo, d, h, mi; uint32_t exp; } RotDateVec;
static const RotDateVec k_rot_dates[] = {
  { 1900,  1,  1,  0,  0,          0u },   /* clamp anno basso */
  { 1900, 12, 31, 23, 59,          0u },   /* clamp anno basso */
  { 1901,  6, 15, 12,  0,          0u },
  { 1969, 12, 31, 23, 59,          0u },   /* ultimo minuto prima dell'epoca */
  { 1969,  1,  1,  0,  0,          0u },
  { 1970,  1,  1,  0,  0,          0u },   /* epoca */
  { 1970,  1,  1,  0,  1,          1u },
  { 1970,  1,  1, 23, 59,       1439u },
  { 1970, 12, 31, 23, 59,     525599u },
  { 1971,  1,  1,  0,  0,     525600u },
  { 1972,  2, 28, 23, 59,    1136159u },   /* 29/02 */
  { 1972,  2, 29,  0,  0,    1136160u },   /* 29/02 */
  { 1972,  2, 29, 23, 59,    1137599u },   /* 29/02 */
  { 1972,  3,  1,  0,  0,    1137600u },   /* 29/02 */
  { 1976,  2, 28, 23, 59,    3239999u },   /* 29/02 */
  { 1976,  2, 29,  0,  0,    3240000u },   /* 29/02 */
  { 1976,  2, 29, 23, 59,    3241439u },   /* 29/02 */
  { 1976,  3,  1,  0,  0,    3241440u },   /* 29/02 */
  { 1996,  2, 28, 23, 59,   13759199u },   /* 29/02 */
  { 1996,  2, 29,  0,  0,   13759200u },   /* 29/02 */
  { 1996,  2, 29, 23, 59,   13760639u },   /* 29/02 */
  { 1996,  3,  1,  0,  0,   13760640u },   /* 29/02 */
  { 2000,  2, 28, 23, 59,   15863039u },   /* 29/02 */
  { 2000,  2, 29,  0,  0,   15863040u },   /* 29/02 */
  { 2000,  2, 29, 23, 59,   15864479u },   /* 29/02 */
  { 2000,  3,  1,  0,  0,   15864480u },   /* 29/02 */
  { 2004,  2, 28, 23, 59,   17966879u },   /* 29/02 */
  { 2004,  2, 29,  0,  0,   17966880u },   /* 29/02 */
  { 2004,  2, 29, 23, 59,   17968319u },   /* 29/02 */
  { 2004,  3,  1,  0,  0,   17968320u },   /* 29/02 */
  { 2020,  2, 28, 23, 59,   26382239u },   /* 29/02 */
  { 2020,  2, 29,  0,  0,   26382240u },   /* 29/02 */
  { 2020,  2, 29, 23, 59,   26383679u },   /* 29/02 */
  { 2020,  3,  1,  0,  0,   26383680u },   /* 29/02 */
  { 2024,  2, 28, 23, 59,   28486079u },   /* 29/02 */
  { 2024,  2, 29,  0,  0,   28486080u },   /* 29/02 */
  { 2024,  2, 29, 23, 59,   28487519u },   /* 29/02 */
  { 2024,  3,  1,  0,  0,   28487520u },   /* 29/02 */
  { 2028,  2, 28, 23, 59,   30589919u },   /* 29/02 */
  { 2028,  2, 29,  0,  0,   30589920u },   /* 29/02 */
  { 2028,  2, 29, 23, 59,   30591359u },   /* 29/02 */
  { 2028,  3,  1,  0,  0,   30591360u },   /* 29/02 */
  { 2096,  2, 28, 23, 59,   66355199u },   /* 29/02 */
  { 2096,  2, 29,  0,  0,   66355200u },   /* 29/02 */
  { 2096,  2, 29, 23, 59,   66356639u },   /* 29/02 */
  { 2096,  3,  1,  0,  0,   66356640u },   /* 29/02 */
  { 2104,  2, 28, 23, 59,   70561439u },   /* 29/02 */
  { 2104,  2, 29,  0,  0,   70561440u },   /* 29/02 */
  { 2104,  2, 29, 23, 59,   70562879u },   /* 29/02 */
  { 2104,  3,  1,  0,  0,   70562880u },   /* 29/02 */
  { 2400,  2, 28, 23, 59,  226242719u },   /* 29/02 */
  { 2400,  2, 29,  0,  0,  226242720u },   /* 29/02 */
  { 2400,  2, 29, 23, 59,  226244159u },   /* 29/02 */
  { 2400,  3,  1,  0,  0,  226244160u },   /* 29/02 */
  { 2404,  2, 28, 23, 59,  228346559u },   /* 29/02 */
  { 2404,  2, 29,  0,  0,  228346560u },   /* 29/02 */
  { 2404,  2, 29, 23, 59,  228347999u },   /* 29/02 */
  { 2404,  3,  1,  0,  0,  228348000u },   /* 29/02 */
  { 1900,  2, 28, 12,  0,          0u },   /* secolare non bisestile */
  { 1900,  3,  1,  0,  0,          0u },   /* secolare non bisestile */
  { 2100,  2, 28, 12,  0,   68458320u },   /* secolare non bisestile */
  { 2100,  3,  1,  0,  0,   68459040u },   /* secolare non bisestile */
  { 2200,  2, 28, 12,  0,  121052880u },   /* secolare non bisestile */
  { 2200,  3,  1,  0,  0,  121053600u },   /* secolare non bisestile */
  { 2300,  2, 28, 12,  0,  173647440u },   /* secolare non bisestile */
  { 2300,  3,  1,  0,  0,  173648160u },   /* secolare non bisestile */
  { 2500,  2, 28, 12,  0,  278838000u },   /* secolare non bisestile */
  { 2500,  3,  1,  0,  0,  278838720u },   /* secolare non bisestile */
  { 2600,  2, 28, 12,  0,  331432560u },   /* secolare non bisestile */
  { 2600,  3,  1,  0,  0,  331433280u },   /* secolare non bisestile */
  { 2700,  2, 28, 12,  0,  384027120u },   /* secolare non bisestile */
  { 2700,  3,  1,  0,  0,  384027840u },   /* secolare non bisestile */
  { 2900,  2, 28, 12,  0,  489217680u },   /* secolare non bisestile */
  { 2900,  3,  1,  0,  0,  489218400u },   /* secolare non bisestile */
  { 3000,  2, 28, 12,  0,  541812240u },   /* secolare non bisestile */
  { 3000,  3,  1,  0,  0,  541812960u },   /* secolare non bisestile */
  { 1999, 12, 31, 23, 59,   15778079u },   /* fine anno */
  { 2000,  1,  1,  0,  0,   15778080u },   /* inizio anno */
  { 2000, 12, 31, 23, 59,   16305119u },   /* fine anno */
  { 2001,  1,  1,  0,  0,   16305120u },   /* inizio anno */
  { 2001, 12, 31, 23, 59,   16830719u },   /* fine anno */
  { 2002,  1,  1,  0,  0,   16830720u },   /* inizio anno */
  { 2023, 12, 31, 23, 59,   28401119u },   /* fine anno */
  { 2024,  1,  1,  0,  0,   28401120u },   /* inizio anno */
  { 2024, 12, 31, 23, 59,   28928159u },   /* fine anno */
  { 2025,  1,  1,  0,  0,   28928160u },   /* inizio anno */
  { 2025, 12, 31, 23, 59,   29453759u },   /* fine anno */
  { 2026,  1,  1,  0,  0,   29453760u },   /* inizio anno */
  { 2099, 12, 31, 23, 59,   68374079u },   /* fine anno */
  { 2100,  1,  1,  0,  0,   68374080u },   /* inizio anno */
  { 2100, 12, 31, 23, 59,   68899679u },   /* fine anno */
  { 2101,  1,  1,  0,  0,   68899680u },   /* inizio anno */
  { 2101, 12, 31, 23, 59,   69425279u },   /* fine anno */
  { 2102,  1,  1,  0,  0,   69425280u },   /* inizio anno */
  { 2399, 12, 31, 23, 59,  226157759u },   /* fine anno */
  { 2400,  1,  1,  0,  0,  226157760u },   /* inizio anno */
  { 2400, 12, 31, 23, 59,  226684799u },   /* fine anno */
  { 2401,  1,  1,  0,  0,  226684800u },   /* inizio anno */
  { 2401, 12, 31, 23, 59,  227210399u },   /* fine anno */
  { 2402,  1,  1,  0,  0,  227210400u },   /* inizio anno */
  { 2026,  8, 28,  0,  0,   29797920u },   /* orari estremi */
  { 2026,  8, 28,  0, 59,   29797979u },   /* orari estremi */
  { 2026,  8, 28,  1,  0,   29797980u },   /* orari estremi */
  { 2026,  8, 28,  3, 59,   29798159u },   /* orari estremi */
  { 2026,  8, 28,  4,  0,   29798160u },   /* orari estremi */
  { 2026,  8, 28, 12, 30,   29798670u },   /* orari estremi */
  { 2026,  8, 28, 23,  0,   29799300u },   /* orari estremi */
  { 2026,  8, 28, 23, 59,   29799359u },   /* orari estremi */
  { 2026,  1,  1,  0,  0,   29453760u },
  { 2026,  1, 31, 23, 59,   29498399u },
  { 2026,  2,  1,  0,  0,   29498400u },
  { 2026,  2, 28, 23, 59,   29538719u },
  { 2026,  3,  1,  0,  0,   29538720u },
  { 2026,  3, 31, 23, 59,   29583359u },
  { 2026,  4,  1,  0,  0,   29583360u },
  { 2026,  4, 30, 23, 59,   29626559u },
  { 2026,  5,  1,  0,  0,   29626560u },
  { 2026,  5, 31, 23, 59,   29671199u },
  { 2026,  6,  1,  0,  0,   29671200u },
  { 2026,  6, 30, 23, 59,   29714399u },
  { 2026,  7,  1,  0,  0,   29714400u },
  { 2026,  7, 31, 23, 59,   29759039u },
  { 2026,  8,  1,  0,  0,   29759040u },
  { 2026,  8, 31, 23, 59,   29803679u },
  { 2026,  9,  1,  0,  0,   29803680u },
  { 2026,  9, 30, 23, 59,   29846879u },
  { 2026, 10,  1,  0,  0,   29846880u },
  { 2026, 10, 31, 23, 59,   29891519u },
  { 2026, 11,  1,  0,  0,   29891520u },
  { 2026, 11, 30, 23, 59,   29934719u },
  { 2026, 12,  1,  0,  0,   29934720u },
  { 2026, 12, 31, 23, 59,   29979359u },
  { 2200,  1,  1,  0,  0,  120968640u },   /* anni lontani */
  { 2200, 12, 31, 23, 59,  121494239u },   /* anni lontani */
  { 2500,  1,  1,  0,  0,  278753760u },   /* anni lontani */
  { 2500, 12, 31, 23, 59,  279279359u },   /* anni lontani */
  { 3000,  1,  1,  0,  0,  541728000u },   /* anni lontani */
  { 3000, 12, 31, 23, 59,  542253599u },   /* anni lontani */
  { 4000,  1,  1,  0,  0, 1067676480u },   /* anni lontani */
  { 4000, 12, 31, 23, 59, 1068203519u },   /* anni lontani */
  { 5000,  1,  1,  0,  0, 1593626400u },   /* anni lontani */
  { 5000, 12, 31, 23, 59, 1594151999u },   /* anni lontani */
  { 5999,  1,  1,  0,  0, 2119049280u },   /* anni lontani */
  { 5999, 12, 31, 23, 59, 2119574879u },   /* anni lontani */
  { 6000,  1,  1,  0,  0, 2119574880u },   /* anni lontani */
  { 6000, 12, 31, 23, 59, 2120101919u },   /* anni lontani */
  { 2038,  1, 19,  3, 14,   35791394u },   /* 2^31 s */
  { 2106,  2,  7,  6, 28,   71582788u },   /* 2^32 s */
  { 2063,  6,  7,  8, 59,   49140539u },
  { 2087, 11, 25, 18, 40,   62010400u },
  { 2177,  4,  1, 15, 17,  109003157u },
  { 2068,  6, 19,  3, 58,   51788398u },
  { 2118,  9,  3, 18, 13,   78194533u },
  { 2180, 10, 22,  3, 39,  110874459u },
  { 2080,  6,  8, 21, 16,   58085116u },
  { 2045, 12, 31, 23, 42,   39972942u },
  { 2012, 11, 25, 21,  6,   22564626u },
  { 1975, 11, 29, 15, 20,    3108440u },
  { 2049, 10, 24,  0,  5,   41977445u },
  { 2126, 10,  6,  1,  1,   82448701u },
  { 1982, 11,  4, 20, 56,    6754856u },
  { 2161,  9,  8, 18, 53,  100818413u },
  { 2083,  6, 11,  4, 49,   59665249u },
  { 2049,  9, 15, 14, 43,   41922163u },
  { 1985, 12, 29, 17, 41,    8412101u },
  { 1997,  8, 30,  7, 40,   14548780u },
  { 2067,  5,  2, 20,  9,   51193209u },
  { 2003,  5, 28,  8,  3,   17568483u },
  { 2138,  5,  2,  7, 26,   88534526u },
  { 2003,  2, 16, 16, 40,   17423560u },
  { 2139,  5,  8, 14, 35,   89069195u },
  { 2119,  3,  1,  4, 29,   78451469u },
  { 2022,  3,  3, 10, 12,   27438372u },
  { 2178, 11,  6, 19, 37,  109844377u },
  { 2104,  7,  9,  4, 44,   70750364u },
  { 1977,  8, 14,  6, 36,    4006476u },
  { 2185,  1, 30,  8, 46,  113122606u },
  { 2182, 11, 15, 11, 40,  111960700u },
  { 2188,  1, 18,  6, 54,  114682014u },
  { 2092,  3, 24, 19, 14,   64287074u },
  { 2172,  3, 15,  2,  3,  106348443u },
  { 2120,  6, 20, 13, 48,   79138908u },
  { 2148, 11, 17,  4, 33,   94081233u },
  { 2037,  6, 20, 21, 56,   35485796u },
  { 2186,  9, 18,  7, 37,  113980777u },
  { 2188,  2, 24,  7, 18,  114735318u },
  { 1995, 10, 12,  6, 33,   13557993u },
  { 1986,  9, 24, 13, 34,    8799214u },
  { 2182, 10, 25, 10, 23,  111930383u },
  { 2165,  1, 18, 16,  0,  102586560u },
  { 1972, 10, 12, 20, 34,    1462834u },
  { 2186,  8, 10, 22, 46,  113925526u },
  { 2006,  8, 22, 22, 31,   19271431u },
  { 2167,  3,  9, 13, 12,  103709592u },
  { 2196,  5, 12, 21, 57,  119056197u },
  { 1992,  6, 23,  3, 23,   11821163u },
  { 1996,  5, 11,  4, 43,   13863163u },
  { 2161,  7, 11, 21, 48,  100733628u },
  { 1975,  7, 11, 19, 44,    2905664u },
  { 2030, 12, 29, 10, 32,   32079512u },
  { 1977,  8, 25,  7, 21,    4022361u },
  { 2090, 10, 11, 16, 28,   63523708u },
  { 2064,  9,  7, 19, 32,   49800692u },
  { 2049,  2,  1, 16,  4,   41596804u },
  { 1997, 11, 10, 10, 41,   14652641u },
  { 2105,  5, 11, 15, 19,   71191639u },
  { 2180,  8,  7, 18, 11,  110765891u },
  { 2075,  1, 24, 18, 36,   55259676u },
  { 1998,  1,  2, 18, 21,   14729421u },
  { 2176,  8, 11,  0, 55,  108666775u },
  { 2134,  8,  9,  0, 16,   86572816u },
  { 2169,  8, 28,  5, 13,  105009433u },
  { 2068,  9, 17,  5, 52,   51918112u },
  { 2118,  3,  5, 22,  9,   77932689u },
  { 2066,  8, 22,  4, 17,   50827937u },
  { 2037,  6,  4, 18, 35,   35462555u },
  { 2134, 11, 29, 11, 54,   86734794u },
  { 2098,  8,  5, 13,  2,   67634702u },
  { 1996,  2,  7, 11,  8,   13728188u },
  { 2111,  2, 19,  9, 36,   74229696u },
  { 2188,  8,  1,  3, 59,  114964079u },
  { 1998,  7,  7,  7,  1,   14996581u },
  { 2146,  1, 15, 21,  1,   92588941u },
  { 2149,  2,  7,  2, 27,   94199187u },
  { 2145,  1, 19,  9, 32,   92068412u },
  { 2074, 10, 24,  1, 58,   55126198u },
  { 1991,  6,  4, 14, 11,   11267411u },
  { 2156,  1,  3,  8, 32,   97829792u },
  { 2113,  1,  5, 19, 10,   75218110u },
  { 2182,  7, 19, 17, 36,  111789696u },
  { 2116,  7, 16, 23, 17,   77073077u },
  { 2083, 11,  8, 13,  2,   59881742u },
  { 2006,  3, 22,  0, 45,   19049805u },
  { 2133, 10, 18,  6, 29,   86148389u },
  { 2139, 10,  3, 18,  8,   89282528u },
  { 2166,  2, 28, 17, 10,  103171270u },
  { 2016,  6, 26, 14, 28,   24449188u },
  { 2014, 10, 26,  0, 15,   23571375u },
  { 2133,  3, 29, 18, 21,   85856781u },
  { 2046,  6,  3, 20,  2,   40194482u },
  { 2069,  1, 14,  6, 46,   52089526u },
  { 2091,  9, 24,  1, 35,   64023935u },
  { 2123,  1, 21,  5, 38,   80499218u },
  { 2126, 11, 21, 23, 13,   82516273u },
  { 2165, 10,  6, 22, 25,  102962785u },
  { 2170,  3, 23, 15, 37,  105308137u },
  { 2191,  3, 23,  3, 48,  116352228u },
  { 2086,  6,  2,  1, 15,   61230315u },
  { 2061,  8, 19,  1, 55,   48194035u },
  { 2200,  4,  1, 17,  1,  121099261u },
  { 2043,  3,  9, 17, 31,   38492251u },
  { 2180, 10,  1, 22,  1,  110845321u },
  { 2053, 11,  4, 23, 59,   44098559u },
  { 2160,  9, 25, 18, 22,  100317262u },
  { 2083,  8,  4, 15,  8,   59743628u },
  { 2113,  2, 28,  1,  8,   75294788u },
  { 2048,  4, 20,  8, 16,   41183056u },
  { 2099,  6,  2, 13, 45,   68068185u },
  { 2018, 12, 20,  7, 46,   25754866u },
  { 1981,  9, 24, 21, 30,    6170250u },
  { 2134,  4, 20,  0, 50,   86413010u },
  { 2126,  1, 11,  0, 39,   82062759u },
  { 2179,  2, 22, 16, 32,  109999712u },
  { 2110,  1,  4, 19, 15,   73638435u },
  { 2058, 11, 27,  1, 50,   46759790u },
  { 2038,  5, 20,  5, 53,   35965793u },
  { 2105,  3,  3, 21, 36,   71092656u },
  { 2132,  2, 25,  7,  8,   85282988u },
  { 2192,  5, 15,  6, 43,  116955763u },
  { 1973,  6, 11, 21, 38,    1811378u },
  { 2168,  9,  9,  6, 55,  104501215u },
  { 2191, 12, 30, 23, 32,  116759492u },
  { 2040,  7, 25, 13,  1,   37113901u },
  { 2142,  7, 24, 23, 37,   90758857u },
  { 1974, 11, 24, 22, 40,    2576080u },
  { 2112,  9,  9, 20, 10,   75048250u },
  { 2067,  8, 12,  6, 21,   51339261u },
  { 2095,  8, 17, 23,  8,   66074348u },
  { 2016,  7, 26,  7, 18,   24491958u },
  { 2066, 11, 13,  0, 51,   50947251u },
  { 1970,  7, 28, 10, 58,     300178u },
  { 2007,  5, 27,  2, 47,   19670567u },
  { 2015,  4, 13, 21, 35,   23816015u },
  { 2117,  8,  8,  2, 11,   77630531u },
  { 2100, 11, 27,  1, 22,   68849362u },
  { 2195, 10,  5,  0, 55,  118738135u },
  { 2143, 10, 26,  9,  2,   91418942u },
  { 2197,  5, 16, 18, 23,  119587343u },
  { 2073,  8,  2, 17, 13,   54481993u },
  { 2057, 10, 28,  4, 24,   46191144u },
  { 2023,  3, 16, 17, 27,   27983127u },
  { 2108, 12, 19, 21, 11,   73089911u },
  { 1995,  9,  9, 21, 29,   13511369u },
  { 1980, 10,  6,  2, 18,    5660778u },
  { 2054,  9, 16, 22, 38,   44553518u },
  { 2055, 10, 13,  6, 37,   45117037u },
  { 2084,  1,  5, 21, 25,   59965765u },
  { 2189, 10,  9, 18, 43,  115589923u },
  { 2192, 12,  1, 13, 51,  117244191u },
  { 1973,  4,  9,  6, 12,    1719732u },
  { 2073,  2,  9,  0, 14,   54230414u },
  { 2178, 11, 22,  1, 36,  109866336u },
  { 2080,  5, 21, 15, 14,   58058834u },
  { 2157,  5,  7, 16, 36,   98535876u },
  { 1986, 10,  5,  3, 19,    8814439u },
  { 2015,  5,  5,  5, 40,   23846740u },
  { 2066,  7, 13, 10,  3,   50770683u },
  { 2116, 10, 24,  0,  6,   77215686u },
  { 2051,  5, 14,  6, 24,   42794304u },
  { 2159,  2,  9,  0, 30,   99460830u },
  { 1993, 10,  7, 22, 40,   12500560u },
  { 2195,  9, 30, 10, 11,  118731491u },
  { 2001,  4, 27, 18, 27,   16473267u },
  { 2157,  6, 15,  0, 39,   98591079u },
  { 2188,  3, 30, 12,  8,  114786008u },
  { 2031, 11,  4, 23,  3,   32526663u },
  { 2094,  1, 24, 18, 58,   65253298u },
  { 2068,  7, 21,  2, 19,   51834379u },
  { 2070,  6,  1,  5, 23,   52813763u },
  { 2028,  9, 30, 12, 14,   30898814u },
  { 2022, 11, 15, 18, 35,   27808955u },
  { 2081,  2, 16, 13, 33,   58448973u },
  { 2198,  4, 16,  9, 42,  120069222u },
  { 2160,  3, 17, 14, 21,  100040541u },
  { 1972,  2,  1,  1, 57,    1095957u },
  { 2154,  3, 27,  0, 22,   96897622u },
  { 2085, 12,  8, 15, 46,   60977746u },
  { 2118, 11, 18,  1, 24,   78302964u },
  { 2160,  6,  2, 14, 45,  100151445u },
  { 2125,  8, 11,  5, 30,   81842730u },
  { 1973, 11,  1, 23, 42,    2017422u },
  { 2115,  1,  1, 20, 14,   76263614u },
  { 2175,  1,  3,  0, 21,  107822901u },
  { 2113,  7,  2, 22, 13,   75474613u },
  { 2168,  1, 13, 21, 19,  104156479u },
  { 2098, 10,  7, 23, 14,   67726034u },
  { 2116,  2,  2, 19, 59,   76835279u },
  { 2027,  9,  8,  4, 16,   30339616u },
  { 2159,  1, 11, 21,  0,   99420300u },
  { 2072, 11,  4,  5, 28,   54091048u },
};

#define ROT_MIN_MAX  2120101919u   /* rotation_local_minutes(6000, 12, 31, 23, 59) secondo datetime */

/* Istanti di prova riusati da più test (confini 04:00, giorno, dominio massimo, uint32). */
static const uint32_t k_now[] = {
  0u, 1u, 2u, 59u, 60u, 239u, 240u, 241u, 1199u, 1200u, 1439u, 1440u, 1441u, 4320u, 10079u, 10080u,
  29797920u, 29798159u, 29798160u,          /* 2026-08-28 00:00 / 03:59 / 04:00 */
  1000000u, 123456789u, 1500000000u, ROT_MIN_MAX, 2147483647u, 4294967295u
};
#define N_NOW ((int)(sizeof(k_now) / sizeof(k_now[0])))

static const uint16_t k_iv[] = { 0, 1, 5, 15, 30, 60, 180, 1440 };
#define N_IV ((int)(sizeof(k_iv) / sizeof(k_iv[0])))

/* ---- 1. rotation_local_minutes ---------------------------------------------------------------- */

static int32_t ref_clamp32(int32_t v, int32_t lo, int32_t hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/* Stessa chiamata con i campi già saturati: verifica che i limiti siano quelli documentati. */
static uint32_t ref_lm_clamped(int32_t y, int32_t mo, int32_t d, int32_t h, int32_t mi) {
  return rotation_local_minutes(ref_clamp32(y, 1900, 6000), ref_clamp32(mo, 1, 12),
                                ref_clamp32(d, 1, 31), ref_clamp32(h, 0, 23), ref_clamp32(mi, 0, 59));
}

static void test_local_minutes_oracle(void) {
  const uint32_t nvec = (uint32_t)(sizeof(k_rot_dates) / sizeof(k_rot_dates[0]));
  CHECK(nvec >= 300u);
  uint32_t bad = 0;
  for (uint32_t i = 0; i < nvec; i++) {
    const RotDateVec *v = &k_rot_dates[i];
    const uint32_t got = rotation_local_minutes(v->y, v->mo, v->d, v->h, v->mi);
    if (got != v->exp) {
      if (bad < 5u) {
        printf("  scarto oracolo %d-%02d-%02d %02d:%02d = %u, atteso %u\n", (int)v->y, (int)v->mo,
               (int)v->d, (int)v->h, (int)v->mi, (unsigned)got, (unsigned)v->exp);
      }
      bad++;
    }
  }
  CHECK_EQ(bad, 0);
  CHECK_EQ(rotation_local_minutes(6000, 12, 31, 23, 59), ROT_MIN_MAX);
  /* 29 febbraio e anni secolari: il giorno dopo il 28/02 */
  CHECK_EQ(rotation_local_minutes(2000, 2, 29, 12, 0), rotation_local_minutes(2000, 2, 28, 12, 0) + 1440u);
  CHECK_EQ(rotation_local_minutes(2000, 3, 1, 12, 0), rotation_local_minutes(2000, 2, 29, 12, 0) + 1440u);
  CHECK_EQ(rotation_local_minutes(2100, 3, 1, 12, 0), rotation_local_minutes(2100, 2, 28, 12, 0) + 1440u);  /* 2100 non bisestile */
  CHECK_EQ(rotation_local_minutes(2400, 3, 1, 12, 0), rotation_local_minutes(2400, 2, 29, 12, 0) + 1440u);  /* 2400 bisestile */
  CHECK_EQ(rotation_local_minutes(2200, 3, 1, 12, 0), rotation_local_minutes(2200, 2, 28, 12, 0) + 1440u);  /* 2200 non bisestile */
  CHECK_EQ(rotation_local_minutes(1900, 12, 31, 23, 59), 0);                                                /* clamp basso */
}

static void test_local_minutes_saturation(void) {
  /* griglia ORDINATA di valori assurdi: 15^5 = 759.375 combinazioni su tutti e 5 i campi */
  static const int32_t wild[] = { INT32_MIN, INT32_MIN + 1, -1000000, -1, 0, 1, 2, 12, 31, 59, 60,
                                  1970, 2026, 6000, INT32_MAX };
  const int nw = (int)(sizeof(wild) / sizeof(wild[0]));
  uint32_t over = 0, clamp_bad = 0;
  for (int a = 0; a < nw; a++) {
    for (int b = 0; b < nw; b++) {
      for (int c = 0; c < nw; c++) {
        for (int e = 0; e < nw; e++) {
          for (int f = 0; f < nw; f++) {
            const uint32_t got = rotation_local_minutes(wild[a], wild[b], wild[c], wild[e], wild[f]);
            if (got > ROT_MIN_MAX) {
              over++;
            }
            if (got != ref_lm_clamped(wild[a], wild[b], wild[c], wild[e], wild[f])) {
              clamp_bad++;
            }
          }
        }
      }
    }
  }
  CHECK_EQ(over, 0);        /* mai oltre il massimo del dominio documentato */
  CHECK_EQ(clamp_bad, 0);   /* saturazione esattamente a [1900,6000]/[1,12]/[1,31]/[0,23]/[0,59] */
  /* monotonia campo per campo (gli altri fissi e in intervallo): la griglia è ordinata */
  uint32_t nm_y = 0, nm_mo = 0, nm_d = 0, nm_h = 0, nm_mi = 0, prev = 0;
  for (int a = 0; a < nw; a++) { const uint32_t v = rotation_local_minutes(wild[a], 6, 15, 12, 30); if (a && v < prev) { nm_y++; }  prev = v; }
  for (int a = 0; a < nw; a++) { const uint32_t v = rotation_local_minutes(2026, wild[a], 15, 12, 30); if (a && v < prev) { nm_mo++; } prev = v; }
  for (int a = 0; a < nw; a++) { const uint32_t v = rotation_local_minutes(2026, 2, wild[a], 12, 30); if (a && v < prev) { nm_d++; }  prev = v; }
  for (int a = 0; a < nw; a++) { const uint32_t v = rotation_local_minutes(2026, 2, 15, wild[a], 30); if (a && v < prev) { nm_h++; }  prev = v; }
  for (int a = 0; a < nw; a++) { const uint32_t v = rotation_local_minutes(2026, 2, 15, 12, wild[a]); if (a && v < prev) { nm_mi++; } prev = v; }
  CHECK_EQ(nm_y, 0); CHECK_EQ(nm_mo, 0); CHECK_EQ(nm_d, 0); CHECK_EQ(nm_h, 0); CHECK_EQ(nm_mi, 0);
  /* estremi puri */
  CHECK_EQ(rotation_local_minutes(INT32_MAX, INT32_MAX, INT32_MAX, INT32_MAX, INT32_MAX), ROT_MIN_MAX);
  CHECK_EQ(rotation_local_minutes(INT32_MIN, INT32_MIN, INT32_MIN, INT32_MIN, INT32_MIN), 0);
  CHECK_EQ(rotation_local_minutes(INT32_MIN, INT32_MAX, INT32_MIN, INT32_MAX, INT32_MIN), 0);
  CHECK_EQ(rotation_local_minutes(INT32_MAX, INT32_MIN, INT32_MAX, INT32_MIN, INT32_MAX), rotation_local_minutes(6000, 1, 31, 0, 59));
  CHECK(rotation_local_minutes(INT32_MAX, 1, 1, 0, 0) <= ROT_MIN_MAX);
}

static uint8_t ref_dim(int32_t y, int32_t mo) {
  static const uint8_t md[12] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
  if (mo == 2 && ((y % 4 == 0 && y % 100 != 0) || y % 400 == 0)) {
    return 29;
  }
  return md[mo - 1];
}

static void ref_next_min(int32_t *y, int32_t *mo, int32_t *d, int32_t *h, int32_t *mi) {
  if (++(*mi) < 60) { return; }
  *mi = 0;
  if (++(*h) < 24) { return; }
  *h = 0;
  if (++(*d) <= (int32_t)ref_dim(*y, *mo)) { return; }
  *d = 1;
  if (++(*mo) <= 12) { return; }
  *mo = 1;
  (*y)++;
}

/* Una settimana intera minuto per minuto: ogni minuto vale esattamente il precedente + 1. */
static uint32_t walk_week(int32_t y, int32_t mo, int32_t d) {
  int32_t h = 0, mi = 0;
  uint32_t prev = rotation_local_minutes(y, mo, d, h, mi), bad = 0;
  for (uint32_t i = 0; i < 7u * 1440u; i++) {
    ref_next_min(&y, &mo, &d, &h, &mi);
    const uint32_t v = rotation_local_minutes(y, mo, d, h, mi);
    if (v != prev + 1u) {
      bad++;
    }
    prev = v;
  }
  return bad;
}

static void test_local_minutes_minute_walk(void) {
  CHECK_EQ(walk_week(1970, 1, 1), 0);        /* epoca */
  CHECK_EQ(walk_week(2023, 12, 28), 0);      /* fine/inizio anno */
  CHECK_EQ(walk_week(2024, 2, 26), 0);       /* 29 febbraio */
  CHECK_EQ(walk_week(2100, 2, 25), 0);       /* secolare non bisestile */
  CHECK_EQ(walk_week(2026, 8, 25), 0);       /* oggi */
  CHECK_EQ(walk_week(5999, 12, 28), 0);      /* cima del dominio */
  /* estremi della settimana */
  CHECK_EQ(rotation_local_minutes(2024, 3, 4, 0, 0), rotation_local_minutes(2024, 2, 26, 0, 0) + 7u * 1440u);
  CHECK_EQ(rotation_local_minutes(2024, 1, 4, 0, 0), rotation_local_minutes(2023, 12, 28, 0, 0) + 7u * 1440u);
}

/* ---- 2. rotation_index ------------------------------------------------------------------------ */

/* Periodo secondo il contratto dell'header, riscritto in modo INDIPENDENTE dall'implementazione:
 * "mai" → 0; giornaliera → quanti confini delle 04:00 locali sono già passati; altrimenti now/iv. */
static uint32_t ref_period(uint32_t now, uint16_t iv) {
  if (iv == 0) {
    return 0;
  }
  if (iv == ROT_DAILY_MIN) {
    if (now < ROT_DAILY_HOUR * 60u) {
      return 0;
    }
    return (now - ROT_DAILY_HOUR * 60u) / ROT_DAILY_MIN + 1u;
  }
  return now / iv;
}

static void test_index_range_matrix(void) {
  static const uint8_t shakes[] = { 0, 1, 2, 7, 63, 128, 254, 255 };
  const int nsh = (int)(sizeof(shakes) / sizeof(shakes[0]));
  uint32_t out_of_range = 0, nondet = 0, order_alias = 0;
  for (uint8_t n = 1; n <= GAL_MAX_SLOTS; n++) {
    for (int i = 0; i < N_IV; i++) {
      for (uint8_t o = 0; o < 2; o++) {
        for (int s = 0; s < nsh; s++) {
          for (int t = 0; t < N_NOW; t++) {
            const uint8_t idx = rotation_index(k_now[t], n, k_iv[i], o, shakes[s]);
            if (idx >= n) {
              out_of_range++;
            }
            if (idx != rotation_index(k_now[t], n, k_iv[i], o, shakes[s])) {
              nondet++;   /* determinismo: stessa chiamata → stesso risultato */
            }
            if (o == 1 && (rotation_index(k_now[t], n, k_iv[i], 2, shakes[s]) != idx ||
                           rotation_index(k_now[t], n, k_iv[i], 255, shakes[s]) != idx)) {
              order_alias++;   /* "order: 0 sequenziale, ALTRO = casuale" */
            }
          }
        }
      }
    }
  }
  CHECK_EQ(out_of_range, 0);
  CHECK_EQ(nondet, 0);
  CHECK_EQ(order_alias, 0);
  /* n = 0 → 0; n > 12 saturato a 12 (mai un indice ≥ 12) */
  CHECK_EQ(rotation_index(0, 0, 30, 0, 0), 0);
  CHECK_EQ(rotation_index(4294967295u, 0, 1, 1, 255), 0);
  uint32_t big_bad = 0, big_diff = 0;
  static const uint16_t bigs[] = { 13, 50, 128, 200, 255 };
  for (int b = 0; b < 5; b++) {
    for (int t = 0; t < N_NOW; t++) {
      for (uint8_t o = 0; o < 2; o++) {
        const uint8_t idx = rotation_index(k_now[t], (uint8_t)bigs[b], 30, o, 3);
        if (idx >= GAL_MAX_SLOTS) {
          big_bad++;
        }
        if (idx != rotation_index(k_now[t], GAL_MAX_SLOTS, 30, o, 3)) {
          big_diff++;
        }
      }
    }
  }
  CHECK_EQ(big_bad, 0);
  CHECK_EQ(big_diff, 0);
}

/* Invarianti del casuale su una finestra di round consecutivi (period = base/stride, k = period+shake). */
static void chk_rounds(uint8_t n, uint16_t iv, uint32_t base, uint32_t stride, uint8_t sh, uint8_t order,
                       uint32_t *range_bad, uint32_t *consec_bad, uint32_t *round_dup) {
  uint8_t  prev = 0xFF;
  uint32_t prev_round = 0xFFFFFFFFu;
  uint16_t mask = 0;
  for (uint32_t step = 0; step <= 5u * n; step++) {
    const uint32_t t = base + step * stride;
    const uint8_t  idx = rotation_index(t, n, iv, order, sh);
    const uint32_t rnd = (ref_period(t, iv) + sh) / n;
    if (idx >= n) {
      (*range_bad)++;
    }
    if (step > 0 && idx == prev) {
      (*consec_bad)++;                       /* mai la stessa due volte di seguito */
    }
    if (rnd != prev_round) {
      mask = 0;
      prev_round = rnd;
    }
    if (mask & (uint16_t)(1u << idx)) {
      (*round_dup)++;                        /* dentro un round tutti distinti */
    }
    mask |= (uint16_t)(1u << idx);
    prev = idx;
  }
}

static void test_index_rounds_deep(void) {
  /* basi: inizio, dintorni dei confini, cima del dominio e now_min grandi (k fino a ~4,29e9).
   * bd[] è la lista per la giornaliera: multipli di 1440 con 60 giorni di margine dentro il dominio
   * documentato (≤ 2.120.101.919), l'ultimo con round k ≈ 1,47e6 (2^32/1440 ≈ 2,98e6). */
  static const uint32_t bases[] = { 0u, 1u, 7u, 1000u, 29797920u, 1500000000u, 2120101800u, 4294960000u };
  static const uint32_t bd[] = { 0u, 1440u, 29797920u, 1500000000u, 2120014080u };
  static const uint8_t  shl[] = { 0, 1, 17, 128, 254, 255 };
  const int nb = (int)(sizeof(bases) / sizeof(bases[0]));
  const int nbd = (int)(sizeof(bd) / sizeof(bd[0]));
  const int nsh = (int)(sizeof(shl) / sizeof(shl[0]));
  uint32_t range_bad = 0, consec_bad = 0, round_dup = 0;
  for (uint8_t n = 3; n <= GAL_MAX_SLOTS; n++) {
    for (int s = 0; s < nsh; s++) {
      for (int b = 0; b < nb; b++) {
        chk_rounds(n, 1, bases[b], 1u, shl[s], 1, &range_bad, &consec_bad, &round_dup);
        chk_rounds(n, 30, bases[b] - bases[b] % 30u, 30u, shl[s], 1, &range_bad, &consec_bad, &round_dup);
      }
      for (int b = 0; b < nbd; b++) {
        chk_rounds(n, ROT_DAILY_MIN, bd[b], 1440u, shl[s], 1, &range_bad, &consec_bad, &round_dup);
      }
    }
  }
  CHECK_EQ(range_bad, 0);
  CHECK_EQ(consec_bad, 0);
  CHECK_EQ(round_dup, 0);
  /* stesse invarianti in sequenziale (n ≥ 2: k mod n non ripete mai due volte di seguito) */
  uint32_t sq_range = 0, sq_consec = 0, sq_dup = 0;
  for (uint8_t n = 2; n <= GAL_MAX_SLOTS; n++) {
    for (int s = 0; s < nsh; s++) {
      for (int b = 0; b < nb; b++) {
        chk_rounds(n, 1, bases[b], 1u, shl[s], 0, &sq_range, &sq_consec, &sq_dup);
      }
      for (int b = 0; b < nbd; b++) {
        chk_rounds(n, ROT_DAILY_MIN, bd[b], 1440u, shl[s], 0, &sq_range, &sq_consec, &sq_dup);
      }
    }
  }
  CHECK_EQ(sq_range, 0);
  CHECK_EQ(sq_consec, 0);
  CHECK_EQ(sq_dup, 0);
  /* ogni round del casuale è una permutazione COMPLETA di 0..n−1 (5 round per ogni n) */
  uint32_t incomplete = 0;
  for (uint8_t n = 3; n <= GAL_MAX_SLOTS; n++) {
    for (uint32_t r = 0; r < 5u; r++) {
      uint16_t mask = 0;
      for (uint8_t p = 0; p < n; p++) {
        mask |= (uint16_t)(1u << rotation_index(r * n + p, n, 1, 1, 0));
      }
      if (mask != (uint16_t)((1u << n) - 1u)) {
        incomplete++;
      }
    }
  }
  CHECK_EQ(incomplete, 0);
  /* una scossa in più = foto diversa, per ogni n ≥ 2 e ogni offset 0..254 (il wrap 255→0 sotto) */
  uint32_t shake_same = 0;
  for (uint8_t n = 2; n <= GAL_MAX_SLOTS; n++) {
    for (uint8_t o = 0; o < 2; o++) {
      for (int s = 0; s < 255; s++) {
        for (int t = 0; t < N_NOW; t++) {
          if (rotation_index(k_now[t], n, 30, o, (uint8_t)s) == rotation_index(k_now[t], n, 30, o, (uint8_t)(s + 1))) {
            shake_same++;
          }
        }
      }
    }
  }
  CHECK_EQ(shake_same, 0);
}

static void test_index_daily_boundary(void) {
  const uint32_t day0 = 29797920u;           /* 2026-08-28 00:00 (multiplo di 1440) */
  static const uint8_t ns[] = { 2, 5, 12 };
  static const uint8_t shl[] = { 0, 3 };
  uint32_t wrong_change = 0;
  for (int a = 0; a < 3; a++) {
    for (uint8_t o = 0; o < 2; o++) {
      for (int s = 0; s < 2; s++) {
        uint8_t prev = rotation_index(day0 - 1u, ns[a], ROT_DAILY_MIN, o, shl[s]);
        for (uint32_t off = 0; off < 30u * 1440u; off++) {   /* 30 giorni, minuto per minuto */
          const uint32_t now = day0 + off;
          const uint8_t  idx = rotation_index(now, ns[a], ROT_DAILY_MIN, o, shl[s]);
          const int changed = (idx != prev);
          const int expect  = ((now % 1440u) == ROT_DAILY_HOUR * 60u);
          if (changed != expect) {
            wrong_change++;
          }
          prev = idx;
        }
      }
    }
  }
  CHECK_EQ(wrong_change, 0);   /* cambia SOLO al minuto 240 (04:00), tutti i giorni */
  /* il periodo giornaliero coincide con la formula "confini delle 04:00 superati" (dominio documentato) */
  uint32_t per_bad = 0;
  for (uint32_t off = 0; off < 3u * 1440u; off++) {
    const uint32_t now = day0 + off;
    if (rotation_index(now, 12, ROT_DAILY_MIN, 0, 0) != (uint8_t)(ref_period(now, ROT_DAILY_MIN) % 12u)) {
      per_bad++;
    }
  }
  CHECK_EQ(per_bad, 0);
  CHECK_EQ(rotation_index(239, 12, ROT_DAILY_MIN, 0, 0), 0);        /* 1970-01-01 03:59 → periodo 0 */
  CHECK_EQ(rotation_index(240, 12, ROT_DAILY_MIN, 0, 0), 1);        /* 04:00 → periodo 1 */
  CHECK_EQ(rotation_index(0, 12, ROT_DAILY_MIN, 0, 0), 0);
  /* BUG-2 (trovato dai test adversariali di S4, corretto): prv_period() sommava (1440 − 240) a now_min
   * prima di dividere → overflow uint32 da now_min = 4.294.966.096 (irraggiungibile: rotation_local_minutes
   * ≤ 2.120.101.919, ma il contratto vale su tutto l'uint32). */
  CHECK_EQ(rotation_index(4294966096u, 12, ROT_DAILY_MIN, 0, 0), (uint8_t)(ref_period(4294966096u, ROT_DAILY_MIN) % 12u));
  CHECK_EQ(rotation_index(4294967295u, 12, ROT_DAILY_MIN, 0, 0), (uint8_t)(ref_period(4294967295u, ROT_DAILY_MIN) % 12u));
  /* ultimo confine delle 04:00 rappresentabile: 240 + 1440 × 2982615 = 4294965840 */
  CHECK_EQ(rotation_index(4294965840u, 12, ROT_DAILY_MIN, 0, 0),
           (uint8_t)((rotation_index(4294965839u, 12, ROT_DAILY_MIN, 0, 0) + 1u) % 12u));
}

static void test_index_interval_zero(void) {
  uint32_t depends_on_time = 0, formula_bad = 0;
  for (uint8_t n = 1; n <= GAL_MAX_SLOTS; n++) {
    for (uint8_t o = 0; o < 2; o++) {
      for (int s = 0; s <= 255; s++) {
        const uint8_t ref = rotation_index(0, n, 0, o, (uint8_t)s);
        for (int t = 0; t < N_NOW; t++) {
          if (rotation_index(k_now[t], n, 0, o, (uint8_t)s) != ref) {
            depends_on_time++;     /* "mai": solo lo shake muove */
          }
        }
        if (o == 0 && ref != (uint8_t)(s % n)) {
          formula_bad++;
        }
      }
    }
  }
  CHECK_EQ(depends_on_time, 0);
  CHECK_EQ(formula_bad, 0);
}

static void test_index_shake_wrap(void) {
  /* sequenziale = esattamente (periodo + shake) mod n, per OGNI shake 0..255 (wrap uint8 compreso) */
  uint32_t formula_bad = 0;
  for (uint8_t n = 1; n <= GAL_MAX_SLOTS; n++) {
    for (int i = 0; i < N_IV; i++) {
      for (int s = 0; s <= 255; s++) {
        for (int t = 0; t < N_NOW; t++) {
          const uint32_t k = ref_period(k_now[t], k_iv[i]) + (uint32_t)s;
          if (rotation_index(k_now[t], n, k_iv[i], 0, (uint8_t)s) != (uint8_t)(k % n)) {
            formula_bad++;
          }
        }
      }
    }
  }
  CHECK_EQ(formula_bad, 0);
  /* passo dello shake dentro l'intervallo uint8: sempre +1 modulo n */
  uint32_t step_bad = 0;
  for (uint8_t n = 1; n <= GAL_MAX_SLOTS; n++) {
    for (int s = 0; s < 255; s++) {
      const uint8_t a = rotation_index(29797920u, n, 30, 0, (uint8_t)s);
      const uint8_t b = rotation_index(29797920u, n, 30, 0, (uint8_t)(s + 1));
      if (b != (uint8_t)((a + 1u) % n)) {
        step_bad++;
      }
    }
  }
  CHECK_EQ(step_bad, 0);
  /* al wrap 255 → 0 l'indice torna a (periodo mod n): coerente con k = t + shake_offset, ma NON è
   * "la posizione successiva". Con n divisore di 255 (n = 1, 3, 5) la foto non cambia affatto. */
  const uint32_t now = 29797920u;
  for (uint8_t n = 1; n <= GAL_MAX_SLOTS; n++) {
    CHECK_EQ(rotation_index(now, n, 30, 0, 0), (uint8_t)((ref_period(now, 30) + 0u) % n));
  }
  CHECK_EQ(rotation_index(now, 3, 30, 0, 255), rotation_index(now, 3, 30, 0, 0));   /* 255 ≡ 0 mod 3 */
  CHECK_EQ(rotation_index(now, 5, 30, 0, 255), rotation_index(now, 5, 30, 0, 0));   /* 255 ≡ 0 mod 5 */
  /* in casuale il wrap riporta k indietro di 255: round diverso e indice senza alcun legame con
   * quello mostrato prima della scossa (qui, 5 foto: shake 255 → 1, shake 0 → 3). */
  CHECK(rotation_index(now, 5, 30, 1, 255) < 5);
  CHECK(rotation_index(now, 5, 30, 1, 0) < 5);
  /* BUG-1 (trovato dai test adversariali di S4, corretto): con il contatore uint8 il wrap 255 → 0
   * annullava la 256ª scossa per n | 255 (le due CHECK_EQ sopra lo documentano). Ora il contatore è a
   * 16 bit e model.c lo incrementa modulo ROT_SHAKE_MOD = mcm(1..12): il wrap 27719 → 0 è "la posizione
   * successiva" per OGNI n ≤ 12, in sequenziale (esatto) e in casuale (foto diversa). */
  formula_bad = 0;
  for (uint8_t n = 1; n <= GAL_MAX_SLOTS; n++) {
    CHECK_EQ(ROT_SHAKE_MOD % n, 0u);
    for (int i = 0; i < N_IV; i++) {
      for (int t = 0; t < N_NOW; t++) {
        if (k_now[t] > ROT_MIN_MAX) {
          continue;              /* precondizione dell'header: t + shake non deve traboccare */
        }
        const uint8_t last = rotation_index(k_now[t], n, k_iv[i], 0, (uint16_t)(ROT_SHAKE_MOD - 1u));
        const uint8_t wrap = rotation_index(k_now[t], n, k_iv[i], 0, 0);
        if (wrap != (uint8_t)((last + 1u) % n)) {
          formula_bad++;
        }
      }
    }
  }
  CHECK_EQ(formula_bad, 0);
  /* casuale: al wrap la posizione è la successiva ma il round cambia → la foto può coincidere per caso
   * (documentato in rotation.h); qui solo il vincolo di intervallo. */
  for (uint8_t n = 3; n <= GAL_MAX_SLOTS; n++) {
    CHECK(rotation_index(29797920u, n, 30, 1, (uint16_t)(ROT_SHAKE_MOD - 1u)) < n);
  }
}

/* ---- 3. rotation_sequence / rotation_slot ------------------------------------------------------ */

static int slot_showable(const GalManifest *m, uint8_t s, uint8_t fmt, uint16_t skip) {
  return s < GAL_MAX_SLOTS && !(skip & (uint16_t)(1u << s)) &&
         m->slots[s].state == GAL_SLOT_VALID && m->slots[s].format == fmt;
}

/* Reimplementazione INDIPENDENTE del contratto dell'header (oracolo del fuzz): order[] filtrato
 * fino al primo GAL_SLOT_NONE, senza duplicati; se non produce nulla, gli slot 0..11 in ordine. */
static uint8_t ref_sequence(const GalManifest *m, uint8_t fmt, uint16_t skip, uint8_t *out) {
  uint16_t seen = 0;
  uint8_t  n = 0;
  for (uint8_t i = 0; i < GAL_MAX_SLOTS; i++) {
    const uint8_t s = m->order[i];
    if (s == GAL_SLOT_NONE) {
      break;
    }
    if (!slot_showable(m, s, fmt, skip) || (seen & (uint16_t)(1u << s))) {
      continue;
    }
    seen |= (uint16_t)(1u << s);
    out[n++] = s;
  }
  if (n == 0) {
    for (uint8_t s = 0; s < GAL_MAX_SLOTS; s++) {
      if (slot_showable(m, s, fmt, skip)) {
        out[n++] = s;
      }
    }
  }
  return n;
}

#define CANARY 0xA5u
/* Esegue rotation_sequence su un buffer con canarino; ritorna n e conta le scritture fuori posto. */
static uint8_t seq_guarded(const GalManifest *m, uint8_t fmt, uint16_t skip, uint8_t *out, uint32_t *canary_bad) {
  uint8_t buf[GAL_MAX_SLOTS + 8];
  memset(buf, CANARY, sizeof(buf));
  const uint8_t n = rotation_sequence(m, fmt, skip, buf);
  if (n > GAL_MAX_SLOTS) {
    (*canary_bad)++;
    return n;
  }
  for (uint32_t i = n; i < (uint32_t)sizeof(buf); i++) {
    if (buf[i] != CANARY) {
      (*canary_bad)++;
      break;
    }
  }
  memcpy(out, buf, GAL_MAX_SLOTS);
  return n;
}

static void test_sequence_patterns(void) {
  GalManifest m;
  uint8_t seq[GAL_MAX_SLOTS];
  uint32_t canary_bad = 0;

  /* order[] tutto GAL_SLOT_NONE → ordine naturale */
  manifest_init(&m);
  slot_set(&m, 0, GAL_SLOT_VALID, FMT);
  slot_set(&m, 6, GAL_SLOT_VALID, FMT);
  slot_set(&m, 11, GAL_SLOT_VALID, FMT);
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 3);
  CHECK_EQ(seq[0], 0); CHECK_EQ(seq[1], 6); CHECK_EQ(seq[2], 11);

  /* order[] pieno di indici fuori intervallo (12, 13, 200, 0xFE): nessuno passa → naturale */
  for (uint8_t i = 0; i < GAL_MAX_SLOTS; i++) {
    m.order[i] = (uint8_t)(i % 2 ? 0xFEu : (uint8_t)(12u + i));
  }
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 3);
  CHECK_EQ(seq[0], 0);

  /* order[] tutto 0xFE tranne l'ultimo elemento valido: il valido vince (nessun fallback) */
  memset(m.order, 0xFE, sizeof(m.order));
  m.order[GAL_MAX_SLOTS - 1] = 11;
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 1);
  CHECK_EQ(seq[0], 11);

  /* order[] pieno dello stesso slot ripetuto: un solo elemento, nessun duplicato, nessun fallback */
  memset(m.order, 6, sizeof(m.order));
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 1);
  CHECK_EQ(seq[0], 6);
  CHECK_EQ(rotation_slot(0, &m, FMT, 0, 30, 0, 0), 6);
  CHECK_EQ(rotation_slot(29797920u, &m, FMT, 0, 1440, 1, 200), 6);

  /* GAL_SLOT_NONE in mezzo: tutto ciò che segue è ignorato */
  memset(m.order, GAL_SLOT_NONE, sizeof(m.order));
  m.order[0] = 11; m.order[1] = GAL_SLOT_NONE; m.order[2] = 0; m.order[3] = 6;
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 1);
  CHECK_EQ(seq[0], 11);

  /* GAL_SLOT_NONE in posizione 0: order[] non produce nulla → fallback naturale (0, 6, 11) */
  m.order[0] = GAL_SLOT_NONE;
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 3);
  CHECK_EQ(seq[0], 0); CHECK_EQ(seq[2], 11);

  /* state ≠ 0/1 (2, 3, 255) non è mostrabile, né in order[] né nell'ordine naturale */
  manifest_init(&m);
  slot_set(&m, 1, 2, FMT);
  slot_set(&m, 2, 3, FMT);
  slot_set(&m, 3, 255, FMT);
  slot_set(&m, 4, GAL_SLOT_EMPTY, FMT);
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 0);
  CHECK_EQ(rotation_slot(0, &m, FMT, 0, 30, 1, 7), GAL_SLOT_NONE);
  m.order[0] = 1; m.order[1] = 2; m.order[2] = 3; m.order[3] = 4;
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 0);
  slot_set(&m, 5, GAL_SLOT_VALID, FMT);
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 1);   /* order[] inutile → naturale */
  CHECK_EQ(seq[0], 5);

  /* formati ignoti (0, 3, 255) esclusi; il formato nativo dell'altra piattaforma pure */
  manifest_init(&m);
  slot_set(&m, 0, GAL_SLOT_VALID, PHOTO_FMT_NONE);
  slot_set(&m, 1, GAL_SLOT_VALID, 3);
  slot_set(&m, 2, GAL_SLOT_VALID, 255);
  slot_set(&m, 3, GAL_SLOT_VALID, PHOTO_FMT_RAW1_144x168);
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 0);
  CHECK_EQ(seq_guarded(&m, PHOTO_FMT_RAW1_144x168, 0, seq, &canary_bad), 1);   /* flint vede solo il suo */
  CHECK_EQ(seq[0], 3);
  CHECK_EQ(seq_guarded(&m, 255, 0, seq, &canary_bad), 1);
  CHECK_EQ(seq[0], 2);

  /* skip_mask: tutti i bit, tutti tranne uno, bit oltre i 12 slot */
  manifest_init(&m);
  for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {
    slot_set(&m, k, GAL_SLOT_VALID, FMT);
    m.order[k] = k;
  }
  CHECK_EQ(seq_guarded(&m, FMT, 0xFFFFu, seq, &canary_bad), 0);
  CHECK_EQ(rotation_slot(0, &m, FMT, 0xFFFFu, 30, 0, 0), GAL_SLOT_NONE);
  CHECK_EQ(rotation_slot(29797920u, &m, FMT, 0xFFFFu, 1440, 1, 255), GAL_SLOT_NONE);
  CHECK_EQ(seq_guarded(&m, FMT, 0x0FFFu, seq, &canary_bad), 0);
  CHECK_EQ(seq_guarded(&m, FMT, 0xF000u, seq, &canary_bad), 12);   /* bit oltre lo slot 11: ininfluenti */
  uint32_t one_bad = 0;
  for (uint8_t k = 0; k < GAL_MAX_SLOTS; k++) {
    const uint16_t skip = (uint16_t)(0x0FFFu & ~(1u << k));
    if (seq_guarded(&m, FMT, skip, seq, &canary_bad) != 1 || seq[0] != k) {
      one_bad++;
    }
    if (rotation_slot(12345u, &m, FMT, skip, 30, 1, 9) != k) {
      one_bad++;
    }
  }
  CHECK_EQ(one_bad, 0);
  CHECK_EQ(canary_bad, 0);

  /* out == NULL / manifest == NULL */
  CHECK_EQ(rotation_sequence(&m, FMT, 0, NULL), 0);
  CHECK_EQ(rotation_sequence(NULL, FMT, 0, seq), 0);
  CHECK_EQ(rotation_sequence(NULL, FMT, 0, NULL), 0);
  CHECK_EQ(rotation_slot(0, NULL, FMT, 0, 30, 0, 0), GAL_SLOT_NONE);

  /* 12 slot pieni: la sequenza copre tutti gli slot una volta sola e rotation_slot li visita tutti */
  memset(m.order, GAL_SLOT_NONE, sizeof(m.order));
  CHECK_EQ(seq_guarded(&m, FMT, 0, seq, &canary_bad), 12);
  uint16_t seen = 0;
  for (uint32_t p = 0; p < 12u; p++) {
    seen |= (uint16_t)(1u << rotation_slot(p * 1440u, &m, FMT, 0, 1440, 1, 0));
  }
  CHECK_EQ(seen, 0x0FFFu);
}

static uint32_t g_fz = 0x9E3779B9u;
static uint32_t fzr(void) {
  g_fz ^= g_fz << 13;
  g_fz ^= g_fz >> 17;
  g_fz ^= g_fz << 5;
  return g_fz;
}

static void test_sequence_fuzz(void) {
  static const uint8_t fmts[] = { PHOTO_FMT_RAW6_200x228, PHOTO_FMT_RAW1_144x168, PHOTO_FMT_NONE, 255 };
  GalManifest m;
  uint8_t got[GAL_MAX_SLOTS], exp[GAL_MAX_SLOTS];
  uint32_t mismatch = 0, dup = 0, too_many = 0, not_showable = 0, empty_bad = 0, canary_bad = 0,
           slot_bad = 0, slot_nondet = 0;
  for (uint32_t it = 0; it < 20000u; it++) {
    manifest_init(&m);
    for (uint8_t i = 0; i < GAL_MAX_SLOTS; i++) {
      const uint32_t r = fzr();
      m.slots[i].state  = (r & 7u) == 7u ? 255u : (uint8_t)(r % 4u);       /* 0..3 e 255 */
      m.slots[i].format = (uint8_t)((r >> 8) % 4u);                        /* 0..3 */
      if (((r >> 16) & 15u) == 0u) {
        m.slots[i].format = 255u;
      }
    }
    const uint32_t shape = fzr() % 5u;
    for (uint8_t i = 0; i < GAL_MAX_SLOTS; i++) {
      const uint32_t r = fzr() % 20u;
      switch (shape) {
        case 0: m.order[i] = GAL_SLOT_NONE; break;                          /* vuoto */
        case 1: m.order[i] = (uint8_t)(GAL_MAX_SLOTS - 1u - i); break;      /* pieno, invertito */
        case 2: m.order[i] = (uint8_t)(fzr() % 3u); break;                  /* duplicati fitti */
        case 3: m.order[i] = (uint8_t)(0xFEu - (fzr() % 3u)); break;        /* indici ≥ 12 e 0xFE */
        default: m.order[i] = (r < 12u) ? (uint8_t)r : (r < 16u ? GAL_SLOT_NONE : (uint8_t)(0xFEu - (r - 16u)));
      }
    }
    const uint8_t  fmt = fmts[fzr() % 4u];
    const uint16_t skip = (fzr() & 3u) ? (uint16_t)(fzr() & 0xFFFFu) : 0u;

    const uint8_t n = seq_guarded(&m, fmt, skip, got, &canary_bad);
    const uint8_t rn = ref_sequence(&m, fmt, skip, exp);
    if (n > GAL_MAX_SLOTS) {
      too_many++;
      continue;
    }
    if (n != rn || memcmp(got, exp, n) != 0) {
      mismatch++;
    }
    uint16_t seen = 0;
    for (uint8_t i = 0; i < n; i++) {
      if (seen & (uint16_t)(1u << got[i])) {
        dup++;
      }
      seen |= (uint16_t)(1u << got[i]);
      if (!slot_showable(&m, got[i], fmt, skip)) {
        not_showable++;
      }
    }
    int any = 0;
    for (uint8_t s = 0; s < GAL_MAX_SLOTS; s++) {
      any |= slot_showable(&m, s, fmt, skip);
    }
    if ((n == 0) != (any == 0)) {
      empty_bad++;      /* n == 0 ⟺ nessuno slot mostrabile (il fallback non può fallire) */
    }
    /* rotation_slot: sempre uno della sequenza (o NONE), e deterministico */
    const uint32_t now = fzr();
    const uint16_t iv = k_iv[fzr() % (uint32_t)N_IV];
    const uint8_t  ord = (uint8_t)(fzr() & 1u);
    const uint8_t  sh = (uint8_t)(fzr() & 0xFFu);
    const uint8_t  sl = rotation_slot(now, &m, fmt, skip, iv, ord, sh);
    if (rotation_slot(now, &m, fmt, skip, iv, ord, sh) != sl) {
      slot_nondet++;
    }
    if (n == 0) {
      if (sl != GAL_SLOT_NONE) {
        slot_bad++;
      }
    } else {
      int found = 0;
      for (uint8_t i = 0; i < n; i++) {
        found |= (got[i] == sl);
      }
      if (!found) {
        slot_bad++;
      }
    }
  }
  CHECK_EQ(mismatch, 0);
  CHECK_EQ(dup, 0);
  CHECK_EQ(too_many, 0);
  CHECK_EQ(not_showable, 0);
  CHECK_EQ(empty_bad, 0);
  CHECK_EQ(canary_bad, 0);
  CHECK_EQ(slot_bad, 0);
  CHECK_EQ(slot_nondet, 0);
}

/* Qualità della permutazione: un hash rotto (stesso ordine a ogni round) o un Fisher-Yates sbilanciato
 * passerebbero tutte le invarianti "strutturali" qui sopra ma renderebbero la rotazione inutile. */
static void test_index_random_quality(void) {
  /* sweep profondo: 200.000 periodi consecutivi per ogni n, mai due volte la stessa di seguito */
  uint32_t consec = 0, range = 0;
  for (uint8_t n = 3; n <= GAL_MAX_SLOTS; n++) {
    uint8_t prev = 0xFF;
    for (uint32_t k = 0; k < 200000u; k++) {
      const uint8_t v = rotation_index(k, n, 1, 1, 0);
      if (v >= n) {
        range++;
      }
      if (v == prev) {
        consec++;
      }
      prev = v;
    }
  }
  CHECK_EQ(consec, 0);
  CHECK_EQ(range, 0);
  /* la permutazione dipende davvero dal round */
  static uint32_t sigs[1024];
  uint32_t nsig = 0;
  for (uint32_t r = 0; r < 1000u; r++) {
    uint32_t sig = 0;
    for (uint8_t p = 0; p < GAL_MAX_SLOTS; p++) {
      sig = sig * 13u + rotation_index(r * GAL_MAX_SLOTS + p, GAL_MAX_SLOTS, 1, 1, 0);
    }
    uint32_t found = 0;
    for (uint32_t i = 0; i < nsig; i++) {
      if (sigs[i] == sig) { found = 1; break; }
    }
    if (!found && nsig < 1024u) {
      sigs[nsig++] = sig;
    }
  }
  CHECK(nsig >= 900u);            /* 12 foto: 1000 round quasi tutti diversi */
  uint32_t nsig3 = 0;
  uint32_t s3[8];
  for (uint32_t r = 0; r < 300u; r++) {
    uint32_t sig = 0;
    for (uint8_t p = 0; p < 3; p++) {
      sig = sig * 13u + rotation_index(r * 3u + p, 3, 1, 1, 0);
    }
    uint32_t found = 0;
    for (uint32_t i = 0; i < nsig3; i++) {
      if (s3[i] == sig) { found = 1; break; }
    }
    if (!found && nsig3 < 8u) {
      s3[nsig3++] = sig;
    }
  }
  CHECK_EQ(nsig3, 6);             /* 3 foto: tutte e 6 le permutazioni entro 300 round */
  /* ogni round è una permutazione completa → su n·N periodi ogni foto esce esattamente N volte */
  uint32_t skew = 0;
  for (uint8_t n = 3; n <= GAL_MAX_SLOTS; n++) {
    uint32_t c[GAL_MAX_SLOTS];
    memset(c, 0, sizeof(c));
    for (uint32_t k = 0; k < 1000u * n; k++) {
      c[rotation_index(k, n, 1, 1, 0)]++;
    }
    for (uint8_t i = 0; i < n; i++) {
      if (c[i] != 1000u) {
        skew++;
      }
    }
  }
  CHECK_EQ(skew, 0);
}

int main(void) {
  test_sizes();
  test_local_minutes();
  test_index_sequential();
  test_index_random();
  test_sequence();
  /* S4 — estensione adversariale (vedi il blocco qui sopra) */
  test_local_minutes_oracle();
  test_local_minutes_saturation();
  test_local_minutes_minute_walk();
  test_index_range_matrix();
  test_index_rounds_deep();
  test_index_daily_boundary();
  test_index_interval_zero();
  test_index_shake_wrap();
  test_sequence_patterns();
  test_index_random_quality();
  test_sequence_fuzz();
  printf("rotation: %d ok, %d falliti\n", g_ok, g_fail);
  return g_fail ? 1 : 0;
}

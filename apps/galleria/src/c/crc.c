/* crc.c — vedi crc.h. Tabelle a nibble: 16 voci → 64 B (CRC-32) + 32 B (CRC-16) di flash,
 * due lookup per byte. Nessuna divisione, nessun float; solo tipi a larghezza fissa. */
#include "crc.h"

/* CRC-32 riflesso (poly 0xEDB88320): voce i = i fatto scorrere di 4 bit a destra. */
static const uint32_t s_crc32_nib[16] = {
  0x00000000u, 0x1DB71064u, 0x3B6E20C8u, 0x26D930ACu,
  0x76DC4190u, 0x6B6B51F4u, 0x4DB26158u, 0x5005713Cu,
  0xEDB88320u, 0xF00F9344u, 0xD6D6A3E8u, 0xCB61B38Cu,
  0x9B64C2B0u, 0x86D3D2D4u, 0xA00AE278u, 0xBDBDF21Cu,
};

/* CRC-16/CCITT-FALSE (poly 0x1021): voce i = i<<12 fatto scorrere di 4 bit a sinistra. */
static const uint16_t s_crc16_nib[16] = {
  0x0000u, 0x1021u, 0x2042u, 0x3063u, 0x4084u, 0x50A5u, 0x60C6u, 0x70E7u,
  0x8108u, 0x9129u, 0xA14Au, 0xB16Bu, 0xC18Cu, 0xD1ADu, 0xE1CEu, 0xF1EFu,
};

uint32_t crc32_update(uint32_t crc, const uint8_t *p, uint32_t n) {
  crc = ~crc;                          /* convenzione zlib: stato interno complementato */
  for (uint32_t i = 0; i < n; i++) {
    crc ^= p[i];
    crc = (crc >> 4) ^ s_crc32_nib[crc & 15u];
    crc = (crc >> 4) ^ s_crc32_nib[crc & 15u];
  }
  return ~crc;
}

uint16_t crc16_ccitt_update(uint16_t crc, const uint8_t *p, uint32_t n) {
  for (uint32_t i = 0; i < n; i++) {
    uint8_t b = p[i];
    crc = (uint16_t)((uint16_t)(crc << 4) ^ s_crc16_nib[((crc >> 12) ^ (b >> 4)) & 15u]);
    crc = (uint16_t)((uint16_t)(crc << 4) ^ s_crc16_nib[((crc >> 12) ^ b) & 15u]);
  }
  return crc;
}

uint16_t crc16_ccitt(const uint8_t *p, uint32_t n) {
  return crc16_ccitt_update(0xFFFFu, p, n);
}

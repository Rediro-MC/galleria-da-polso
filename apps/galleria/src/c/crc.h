/* crc.h — CRC per manifest/impostazioni/foto. Modulo PURO (nessun pebble.h; test host in
 * test/test_crc.c). Tabelle a nibble (16 voci) per stare in poche decine di byte di flash.
 *  - CRC-32 IEEE 802.3 riflesso (poly 0xEDB88320), convenzione zlib: si parte da 0 e si passa il
 *    valore precedente per continuare; "123456789" → 0xCBF43926. È lo stesso CRC32 di
 *    tools/photo_prep.py e della config page (S6), calcolato sul payload raw6/raw1.
 *  - CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, non riflesso, senza xorout); "123456789" →
 *    0x29B1. Per GalManifest/GalSettings (campo crc16 calcolato sui byte che lo precedono). */
#ifndef GALLERIA_CRC_H
#define GALLERIA_CRC_H

#include <stdint.h>

/* crc = 0 alla prima chiamata, poi il valore ritornato; p può essere NULL se n == 0. */
uint32_t crc32_update(uint32_t crc, const uint8_t *p, uint32_t n);

/* crc = 0xFFFF alla prima chiamata, poi il valore ritornato. */
uint16_t crc16_ccitt_update(uint16_t crc, const uint8_t *p, uint32_t n);
/* Comodità: crc16_ccitt_update(0xFFFF, p, n). */
uint16_t crc16_ccitt(const uint8_t *p, uint32_t n);

#endif /* GALLERIA_CRC_H */

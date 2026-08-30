/* rt_meta.h — metadati delle fixture del test host di photo_codec.c. FILE GENERATO: non
 * modificarlo a mano, si rigenera con photo_prep.py v1 (dalla radice del repo)
 *   python3 tools/photo_prep.py --fixture apps/galleria/test/fixtures
 * Non contiene la data: rigenerandolo si deve riottenere lo stesso file byte per byte (cmp).
 * I test girano con cwd = apps/galleria/test, quindi i percorsi sono "fixtures/rt.*".
 *
 *  rt.idx   40×12 = 480 indici 0..63, 1 byte per pixel: i primi 64 sono 0..63 in sequenza, così
 *           ogni valore a 6 bit compare almeno una volta nel file; NON però in ogni posizione del
 *           gruppo da 4 (in quei primi 64 la posizione k vede solo i valori congrui a k mod 4).
 *           I restanti vengono da un LCG: sull'intero file ciascuna delle 4 posizioni del gruppo
 *           vede 50..58 valori distinti su 64. LCG: x0 = 1; a ogni pixel
 *           x = (x * 1103515245 + 12345) & 0x7fffffff, idx = (x >> 16) & 63.
 *  rt.raw6  raw6_pack(rt.idx): 4 px → 3 B, b0 = p0<<2|p1>>4, b1 = (p1&15)<<4|p2>>2, b2 = (p2&3)<<6|p3.
 *  rt.bits  24×8 = 192 pixel 0/1, 1 byte per pixel: riga 0 tutta 1, riga 1 tutta 0, poi
 *           bit = ((x*7 + y*3) % 5) < 2.
 *  rt.raw1  pack1(rt.bits): 1BitPalette MSB-first, pixel x nel bit 0x80 >> (x & 7) del byte x/8,
 *           riga (W+7)/8 = 3 B, 1 = bianco.
 *
 * I CRC32 sono zlib.crc32 sui byte del file, cioè crc32_update(0, dati, len) di src/c/crc.c. */
#ifndef GALLERIA_RT_META_H
#define GALLERIA_RT_META_H

#define RT_W            40
#define RT_H            12
#define RT_RAW6_LEN     360
#define RT_RAW6_CRC32   0x0CF602F1u

#define RT1_W           24
#define RT1_H           8
#define RT_RAW1_LEN     24
#define RT_RAW1_CRC32   0x0F739D89u

#endif /* GALLERIA_RT_META_H */

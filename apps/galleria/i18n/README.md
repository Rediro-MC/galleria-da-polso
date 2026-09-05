# `i18n/` — dizionari della config page (S10, D35)

`messages.json` è la **sorgente unica** dei testi della config page di Galleria in **italiano,
inglese, tedesco e francese**. Sta fuori da `src/pkjs/` di proposito: webpack non deve imbarcarlo
com'è, il PKJS carica il modulo generato.

```json
{
  "chiave_parlante": { "it": "…", "en": "…", "de": "…", "fr": "…" }
}
```

Oggi: **121 chiavi × 4 lingue**, 23.089 B (`wc -c i18n/messages.json`, 05/09/2026).

## Come si rigenera (mai a mano)

Tutti i comandi si lanciano dalla **cartella dell'app** (`apps/galleria`):

```bash
python3 ../../tools/build_i18n.py            # messages.json → src/pkjs/i18n.js + test/fixture_i18n.js
python3 ../../tools/build_i18n.py --check    # 0 se sono aggiornati, 1 altrimenti (dentro `make -C test pagecheck`)
python3 ../../tools/build_i18n.py --selftest # 20 controlli su una cartella temporanea
make -C test pagecheck                       # build_i18n --check + build_config_page --check + fixture + anteprime
```

I due file generati sono identici e **ASCII** (accenti come `\uXXXX`):
`module.exports = { keys: [...], en: [...], it: [...], de: [...], fr: [...] }`, array **nell'ordine
del file**. `src/pkjs/i18n.js` (20.731 B) finisce nello stato dell'hash della pagina (tutte e quattro
le lingue: il cambio lingua nella pagina è istantaneo, senza tornare al PKJS);
`test/fixture_i18n.js` è la stessa cosa per i test node.

## Regole

- **L'ordine delle chiavi conta**: l'indice di una chiave è la sua posizione, ed è quello che
  `tools/build_config_page.py` scrive nell'artefatto al posto del nome (`T('chiave'` → `T(12`,
  `data-i18n="chiave"` → `data-i18n="12"`). Aggiungere una chiave in mezzo cambia gli indici:
  rigenerare **tutto insieme** (`pagecheck` esegue prima `build_i18n --check`, poi quello della
  pagina).
- Chiavi in `snake_case`, nomi parlanti; i campi che iniziano con `_` sono commenti.
- Ogni voce ha **esattamente** le 4 lingue nell'ordine `it, en, de, fr`; testi non vuoti, **senza
  backtick** (la pagina viene inlinata in una stringa) e senza CR.
- Segnaposto solo `{0}` e `{1}`, con lo **stesso insieme** in tutte le lingue della voce
  (`T('chiave', a, b)` li sostituisce in una passata sola).
- **Niente plurali**: si riformula (« Foto da togliere: 3 »), niente doppie forme.
- **Nomi propri fuori dal dizionario**: Galleria, Pebble, Pebble Time 2, Pebble 2 Duo, Anton, Bebas
  Neue, Barlow Condensed, Francois One, Staatliches, LECO, Floyd–Steinberg, Atkinson, Bayer 4×4,
  «slot», gamma, lift, dithering, «KB».
- **Registro**: it «tu», en neutro, **de «du»**, **fr «vous»**; spazio prima di `: ; ! ?` in
  francese; maiuscole tedesche sui sostantivi. Etichette ≤ 28 caratteri dove si può (colonne da
  9,5 em, vanno a capo).
- I numeri decimali **non** stanno qui: li formatta `dec()` (en `.`, it/de/fr `,`).
- ⚠️ Questi testi hanno accenti: **non devono mai passare per `log()`** del PKJS (F-S8-2: una riga
  con un accento fa morire `pebble logs`). I dizionari viaggiano solo nell'hash dell'URL.

Glossario e criteri di traduzione: `../../../docs/design/galleria-s10-i18n.md` §3.

# heapprobe — sonda di memoria (Fase 0)

Watchapp di misura, scritta il 24/08/2026 per sapere **quanto heap resta davvero** su emery e flint:
`src/c/heapprobe.c` logga `heap_bytes_free()/heap_bytes_used()` a ogni fase, prova `malloc()` da 8 a
128 KiB, conta quanti blocchi da 8 KiB stanno in piedi insieme e alloca un `GBitmap` a schermo intero.
È la sonda descritta in `../../docs/ricerca/gap-1-memoria-emery.md` §6.

```bash
cd apps/heapprobe
pebble install --emulator emery --logs     # e --emulator flint; leggere le righe [main entry] … PROBE DONE
```

- `targetPlatforms` in `package.json`: **`["emery", "flint"]`**; la CI `.github/workflows/build.yml` la
  compila a ogni push insieme a `galleria` e `hello-emery`.
- Misure di Fase 0 su emulatori freschi (SDK 4.33.1): a `[main entry]` **129.680 B** liberi su emery e
  **64.144 B** su flint; 15 blocchi da 8 KiB insieme su emery, 7 su flint. Log completi in
  `../../docs/fase0/heapprobe-{emery,flint}-4.33.1.log`, lettura in `../../docs/CONTINUA-QUI.md`
  §«Fase 0, ambiente, verifiche in emulatore».
- Resta da rieseguire sull'orologio reale: `../../PIANO-SVILUPPO-PEBBLE.md` §15, riga 1.

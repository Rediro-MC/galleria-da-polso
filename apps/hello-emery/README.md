# hello-emery — smoke test dell'ambiente (Fase 0)

Progetto generato con `pebble new-project --ai hello-emery` il 24/08/2026 e tenuto come **prova che la
toolchain funziona**: compila, si installa negli emulatori e mostra una schermata fissa. Non è un'app
da pubblicare (`"private": true`, watchapp, nessuna risorsa) e il sorgente `src/c/hello-emery.c` è
ancora il template di `pebble-tool` (vedi `../../THIRD-PARTY-NOTICES.md` §1.2).

```bash
cd apps/hello-emery
pebble build                                                # statico 833 B in Fase 0
pebble install --emulator emery                             # e --emulator flint
pebble screenshot --emulator emery --no-open shot_emery.png
```

- `targetPlatforms` in `package.json`: **`["emery", "flint"]`** (in Fase 0 fu provata anche su `gabbro`).
- Lo usano `tools/setup-env.sh` (riga 72, l'ultimo passo del setup) e la CI
  `.github/workflows/build.yml`, che lo compila insieme a `galleria` e `heapprobe`.
- Risultati di Fase 0: screenshot in `../../docs/fase0/hello-emery-{emery,flint,gabbro}.png`, sintesi
  in `../../docs/CONTINUA-QUI.md` §«Fase 0, ambiente, verifiche in emulatore».

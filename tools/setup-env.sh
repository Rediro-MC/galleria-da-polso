#!/usr/bin/env bash
# Setup dell'ambiente di sviluppo Pebble in user space (Ubuntu 26.04, SENZA sudo). Idempotente.
# Riferimento: PIANO-SVILUPPO-PEBBLE.md §5. Eseguito con successo il 24/08/2026 (Fase 0); pebble-tool 5.0.40 dal 30/08/2026.
# Su un computer nuovo: git clone <repo> ~/ProgettiClaude/Pebble && ~/ProgettiClaude/Pebble/tools/setup-env.sh
#
# Cosa fa:
#   1. uv in ~/.local/bin (senza toccare i file rc)            4. SDK Pebble (toolchain ARM + QEMU) in ~/.local/share/pebble-sdk
#   2. Python 3.13 gestito da uv (quello di sistema non ha ensurepip)   5. librerie runtime di QEMU estratte dai .deb in ~/.local/lib/pebble-deps
#   3. pebble-tool pinnato                                      6. hook in ~/.bashrc che carica tools/pebble-env.sh (PATH + PEBBLE_QEMU_PATH)
set -euo pipefail

PT_VERSION="${PEBBLE_TOOL_VERSION:-5.0.40}"
PY="${PEBBLE_PYTHON:-3.13}"
SDK="${PEBBLE_SDK_VERSION:-latest}"
PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # la cartella del clone (di norma ~/ProgettiClaude/Pebble)
DEPS="$HOME/.local/lib/pebble-deps"
export PATH="$HOME/.local/bin:$PATH"
export PYTHONWARNINGS=ignore   # SyntaxWarning innocui di libpebble2 al primo import

log() { printf '\n== %s\n' "$*"; }

log "1) uv"
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh -s -- --no-modify-path
fi
uv --version

log "2) Python $PY gestito da uv"
uv python install "$PY"

log "3) pebble-tool $PT_VERSION"
if ! pebble --version 2>/dev/null | grep -q "v$PT_VERSION"; then
  uv tool install "pebble-tool==$PT_VERSION" --python "$PY" --force
fi
pebble --version
if [ -d "$HOME/.pebble-sdk" ]; then
  echo "ATTENZIONE: esiste ~/.pebble-sdk (directory legacy): pebble-tool la userebbe al posto di ~/.local/share/pebble-sdk." >&2
  echo "            Se non contiene nulla di utile, rimuovila: rm -r ~/.pebble-sdk" >&2
fi

log "4) SDK $SDK (~780 MB in ~/.local/share/pebble-sdk)"
if ! pebble sdk list 2>/dev/null | grep -q "(active)"; then
  pebble sdk install "$SDK"
fi
pebble sdk list

log "5) librerie runtime di QEMU senza sudo (libsdl2-classic, libxss1, libsndio7.0)"
mkdir -p "$DEPS"
if [ ! -f "$DEPS/root/usr/lib/x86_64-linux-gnu/sdl2-classic/libSDL2-2.0.so.0" ]; then
  ( cd "$DEPS" && rm -f ./*.deb && apt-get download libsdl2-classic libxss1 libsndio7.0 \
    && for d in ./*.deb; do dpkg-deb -x "$d" root; done )
fi
Q="$HOME/.local/share/pebble-sdk/SDKs/current/toolchain/bin/qemu-pebble"
if LD_LIBRARY_PATH="$DEPS/root/usr/lib/x86_64-linux-gnu:$DEPS/root/usr/lib/x86_64-linux-gnu/sdl2-classic" ldd "$Q" | grep -q "not found"; then
  echo "ERRORE: a qemu-pebble mancano ancora librerie:" >&2
  LD_LIBRARY_PATH="$DEPS/root/usr/lib/x86_64-linux-gnu:$DEPS/root/usr/lib/x86_64-linux-gnu/sdl2-classic" ldd "$Q" | grep "not found" >&2
  exit 1
fi
"$PROJ/tools/qemu-pebble-wrapper" --version | head -1

log "6) hook in ~/.bashrc"
if ! grep -q "tools/pebble-env.sh" "$HOME/.bashrc"; then
  printf '\n# >>> Pebble dev env (ProgettiClaude/Pebble, Fase 0) >>>\n[ -f "%s/tools/pebble-env.sh" ] && . "%s/tools/pebble-env.sh"\n# <<< Pebble dev env <<<\n' "$PROJ" "$PROJ" >> "$HOME/.bashrc"
  echo "aggiunto"
else
  echo "già presente"
fi

cat <<EOF

Fatto. In una nuova shell (oppure: . $PROJ/tools/pebble-env.sh):
  cd $PROJ/apps/hello-emery && pebble build && pebble install --emulator emery && pebble screenshot --emulator emery
Senza display X/Wayland aggiungere --vnc ai comandi che usano l'emulatore.
EOF

# Ambiente di sviluppo Pebble (Fase 0) — caricato da ~/.bashrc (hook scritto da tools/setup-env.sh)
# - uv, pebble-tool: ~/.local/bin (Python 3.13 gestito da uv)
# - SDK + toolchain ARM + QEMU: ~/.local/share/pebble-sdk/SDKs/current
# - librerie QEMU senza sudo: ~/.local/lib/pebble-deps (vedi tools/setup-env.sh)
# La cartella del progetto viene dedotta dalla posizione di questo file (funziona da qualsiasi clone);
# se il file viene copiato altrove vale il default ~/ProgettiClaude/Pebble.
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH";; esac
if [ -n "${BASH_SOURCE:-}" ]; then
  PEBBLE_PROJ_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)"
fi
export PEBBLE_PROJ_DIR="${PEBBLE_PROJ_DIR:-$HOME/ProgettiClaude/Pebble}"
export PEBBLE_QEMU_PATH="$PEBBLE_PROJ_DIR/tools/qemu-pebble-wrapper"

#!/usr/bin/env bash
# Installa gli Android platform-tools (adb) in user space, SENZA sudo. Idempotente.
# Serve per la sessione S8 (test su orologio reale): `pebble install --adb` parla con l'app
# Pebble su Android tramite `adb shell am broadcast` + `adb forward` (vedi
# pebble_tool/util/adb.py righe 33 e 55).
#
# Su un computer nuovo:  ~/ProgettiClaude/Pebble/tools/setup-adb.sh
#
# Cosa fa:
#   1. scarica platform-tools-latest-linux.zip da dl.google.com (curl, con fallback a wget)
#   2. lo estrae in ~/.local/android-platform-tools/platform-tools
#   3. crea il symlink ~/.local/bin/adb -> .../platform-tools/adb
#   4. verifica che ~/.local/bin sia nel PATH (lo aggiunge tools/pebble-env.sh) e stampa la versione
#
# Se adb e' gia' installato non riscarica nulla, a meno di FORCE=1 (o --force).
set -euo pipefail

URL="${ADB_ZIP_URL:-https://dl.google.com/android/repository/platform-tools-latest-linux.zip}"
DEST="${ADB_DEST:-$HOME/.local/android-platform-tools}"   # cartella di installazione
BIN="$HOME/.local/bin"                                     # gia' nel PATH via tools/pebble-env.sh
ADB="$DEST/platform-tools/adb"
FORCE="${FORCE:-0}"
[ "${1:-}" = "--force" ] && FORCE=1

log() { printf '\n== %s\n' "$*"; }

# --- 1) c'e' gia'? -----------------------------------------------------------
# `adb version` stampa p.es. "Android Debug Bridge version 1.0.41" + "Version 36.0.0-13206524".
if [ "$FORCE" != "1" ] && [ -x "$ADB" ]; then
  log "adb gia' presente in $ADB"
  "$ADB" version | sed 's/^/   /'
else
  log "1) download platform-tools"
  mkdir -p "$DEST"
  TMP="$(mktemp -d)"
  # il temporaneo viene rimosso anche in caso di errore (set -e)
  trap 'rm -rf "$TMP"' EXIT
  ZIP="$TMP/platform-tools.zip"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "$ZIP" "$URL"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$ZIP" "$URL"
  else
    echo "ERRORE: servono curl o wget per scaricare $URL" >&2; exit 1
  fi
  # controllo minimo di integrita': deve essere uno zip e contenere platform-tools/adb
  if ! unzip -tqq "$ZIP" >/dev/null 2>&1; then
    echo "ERRORE: il file scaricato non e' uno zip valido ($ZIP)" >&2; exit 1
  fi
  if ! unzip -l "$ZIP" | grep -q 'platform-tools/adb$'; then
    echo "ERRORE: lo zip non contiene platform-tools/adb" >&2; exit 1
  fi

  log "2) estrazione in $DEST"
  # -o = sovrascrive (rende idempotente il rilancio con --force); lo zip contiene gia' platform-tools/
  rm -rf "$DEST/platform-tools"
  unzip -q -o "$ZIP" -d "$DEST"
  chmod +x "$DEST/platform-tools/adb" "$DEST/platform-tools/fastboot" 2>/dev/null || true
  rm -rf "$TMP"; trap - EXIT
fi

# --- 3) symlink in ~/.local/bin ---------------------------------------------
log "3) symlink $BIN/adb"
mkdir -p "$BIN"
# -f -n: sostituisce un symlink esistente senza crearne uno DENTRO la cartella puntata
ln -sfn "$ADB" "$BIN/adb"
ls -l "$BIN/adb"

# --- 4) verifiche ------------------------------------------------------------
log "4) verifica"
case ":$PATH:" in
  *":$BIN:"*) echo "   PATH: ok, $BIN e' nel PATH" ;;
  *) echo "   ATTENZIONE: $BIN non e' nel PATH di questa shell."
     echo "               Caricare l'ambiente:  . $(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pebble-env.sh"
     export PATH="$BIN:$PATH" ;;
esac
adb version | sed 's/^/   /'

cat <<'EOF'

== Fatto.
   adb installato in ~/.local/android-platform-tools/platform-tools, symlink ~/.local/bin/adb.
   Prossimi passi (serve il telefono):
     - Android 11+ senza cavo:  adb pair <IP telefono>:<porta di accoppiamento>   (codice a 6 cifre)
                                adb connect <IP telefono>:<porta di connessione>  (PORTA DIVERSA!)
     - adb su un altro PC:      export ADB_SERVER_SOCKET=tcp:<IP host>:5037
       (richiede 'adb -a nodaemon server' su quel PC: server SENZA autenticazione esposto
        in rete -> solo su rete fidata, e chiuderlo a fine sessione)
   Poi:  adb devices   e   pebble install --adb --logs
EOF

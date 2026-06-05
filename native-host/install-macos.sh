#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.example.agentbrowser"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$ROOT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_DIR/config/extension-id.json"
TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
TARGET_FILE="$TARGET_DIR/$HOST_NAME.json"

read_config_value() {
  local key="$1"
  node -e "const fs=require('fs'); const config=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(config[process.argv[2]] || '')" "$CONFIG_FILE" "$key"
}

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing extension config: $CONFIG_FILE" >&2
  exit 1
fi

EXTENSION_ID="${FORMAX_EXTENSION_ID:-${1:-$(read_config_value extensionId)}}"
HOST_NAME="${FORMAX_EXTENSION_HOST_NAME:-$(read_config_value extensionHostName)}"
TARGET_FILE="$TARGET_DIR/$HOST_NAME.json"
NODE_PATH="$(command -v node)"
HOST_PATH="$ROOT_DIR/host-launcher.sh"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
esac
BUNDLED_HOST_PATH="$PROJECT_DIR/extension-host/macos/$ARCH/extension-host"

if [[ -z "$EXTENSION_ID" || -z "$HOST_NAME" ]]; then
  echo "Missing extensionId or extensionHostName in $CONFIG_FILE" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

if [[ -x "$BUNDLED_HOST_PATH" ]]; then
  HOST_PATH="$BUNDLED_HOST_PATH"
else
  cat > "$HOST_PATH" <<SH
#!/usr/bin/env bash
set -euo pipefail

exec "$NODE_PATH" "$ROOT_DIR/host.js"
SH

  chmod +x "$HOST_PATH"
fi

cat > "$TARGET_FILE" <<JSON
{
  "name": "$HOST_NAME",
  "description": "Agent Browser Controller Native Host",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
JSON

echo "Installed native host manifest:"
echo "$TARGET_FILE"
echo
cat "$TARGET_FILE"

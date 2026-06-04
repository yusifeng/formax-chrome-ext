#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.example.agentbrowser"
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
TARGET_FILE="$TARGET_DIR/$HOST_NAME.json"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <chrome-extension-id>" >&2
  exit 1
fi

EXTENSION_ID="$1"
NODE_PATH="$(command -v node)"
HOST_PATH="$ROOT_DIR/host-launcher.sh"

mkdir -p "$TARGET_DIR"

cat > "$HOST_PATH" <<SH
#!/usr/bin/env bash
set -euo pipefail

exec "$NODE_PATH" "$ROOT_DIR/host.js"
SH

chmod +x "$HOST_PATH"

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

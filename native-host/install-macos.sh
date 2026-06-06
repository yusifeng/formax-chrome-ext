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
  sed -nE 's/^[[:space:]]*"'"$key"'"[[:space:]]*:[[:space:]]*"([^"]*)".*$/\1/p' "$CONFIG_FILE" | head -n 1
}

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing extension config: $CONFIG_FILE" >&2
  exit 1
fi

EXTENSION_ID="${FORMAX_EXTENSION_ID:-${1:-$(read_config_value extensionId)}}"
HOST_NAME="${FORMAX_EXTENSION_HOST_NAME:-$(read_config_value extensionHostName)}"
TARGET_FILE="$TARGET_DIR/$HOST_NAME.json"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="x64" ;;
  aarch64) ARCH="arm64" ;;
esac
DIST_HOST_PATH="$PROJECT_DIR/extension-host/macos/$ARCH/extension-host"
BUILD_HOST_PATH="$PROJECT_DIR/build/extension-host/macos/$ARCH/extension-host"

if [[ -z "$EXTENSION_ID" || -z "$HOST_NAME" ]]; then
  echo "Missing extensionId or extensionHostName in $CONFIG_FILE" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

if [[ -x "$DIST_HOST_PATH" ]]; then
  HOST_PATH="$DIST_HOST_PATH"
elif [[ -x "$BUILD_HOST_PATH" ]]; then
  HOST_PATH="$BUILD_HOST_PATH"
else
  echo "Missing Rust native host binary. Checked:" >&2
  echo "  $DIST_HOST_PATH" >&2
  echo "  $BUILD_HOST_PATH" >&2
  echo "Run npm run build:rust-native-host or npm run package:dist first." >&2
  exit 1
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

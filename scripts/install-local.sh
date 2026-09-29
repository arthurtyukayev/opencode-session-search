#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_DIR="${1:-$HOME/.config/opencode/plugins/history}"

mkdir -p "$TARGET_DIR"

for file in index.ts history.ts database.ts v1.ts; do
  cp "$PLUGIN_ROOT/$file" "$TARGET_DIR/$file"
done

echo "Installed plugin and supporting modules to: $TARGET_DIR"
echo "Restart OpenCode to load the updated plugin."

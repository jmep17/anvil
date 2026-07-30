#!/usr/bin/env bash
# Install Anvil onto PATH (default: ~/.local/bin/anvil).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="${ANVIL_BIN_DIR:-$HOME/.local/bin}"
TARGET="$BIN_DIR/anvil"
ENTRY="$ROOT/bin/anvil"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required (https://bun.sh)" >&2
  exit 1
fi

echo "==> Installing dependencies"
cd "$ROOT"
bun install --frozen-lockfile 2>/dev/null || bun install

chmod +x "$ENTRY" "$ROOT/src/cli.ts"
mkdir -p "$BIN_DIR"

if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
  rm -f "$TARGET"
fi
ln -s "$ENTRY" "$TARGET"

# Also register with bun's global link table when available
bun link >/dev/null 2>&1 || true

echo "==> Linked $TARGET -> $ENTRY"
if ! command -v anvil >/dev/null 2>&1; then
  echo "warning: $BIN_DIR is not on your PATH." >&2
  echo "Add this to ~/.zshrc:" >&2
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\"" >&2
else
  echo "==> OK: $(command -v anvil)"
  anvil --help | head -3
fi

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies with pnpm..."
  pnpm install
fi

echo "Validating curriculum packs..."
pnpm validate

echo "Starting Nihongo Partner on http://localhost:5178 ..."
exec pnpm dev

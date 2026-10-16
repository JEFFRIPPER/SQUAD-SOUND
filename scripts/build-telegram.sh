#!/usr/bin/env bash
# Пересобирает www/js/vendor/telegram.min.js — браузерную сборку GramJS (MIT, github.com/gram-js/gramjs).
# Версия 2.26.21 — dist-tag "browser" пакета telegram, она уже без node-модулей.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cd "$TMP"
npm init -y >/dev/null
npm i --no-audit --no-fund telegram@2.26.21 big-integer esbuild@0.25.10
NODE_PATH="$TMP/node_modules" npx esbuild "$ROOT/scripts/telegram-entry.js" --bundle --minify --platform=browser --format=iife --target=es2020 \
  --legal-comments=eof --define:process.env.NODE_ENV='"production"' --outfile="$ROOT/www/js/vendor/telegram.min.js"
rm -rf "$TMP"

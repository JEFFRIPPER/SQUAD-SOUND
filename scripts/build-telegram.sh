#!/usr/bin/env bash
# Пересобирает www/js/vendor/telegram.min.js — браузерную сборку GramJS (MIT, github.com/gram-js/gramjs).
# Версия 2.26.21 — dist-tag "browser" пакета telegram, она уже без node-модулей.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cd "$TMP"
npm init -y >/dev/null
npm i --no-audit --no-fund telegram@2.26.21 big-integer esbuild@0.25.10
# Слой 198 у GramJS старее «музыки в профиле»: добавляем её типы и метод в схему (core.telegram.org/method/users.getSavedMusic)
node -e '
const f = "node_modules/telegram/tl/apiTl.js";
let s = require("fs").readFileSync(f, "utf8");
if (!s.includes("users.getSavedMusic")) {
  s = s.replace("---functions---", "users.savedMusicNotModified#e3878aa4 count:int = users.SavedMusic;\nusers.savedMusic#34a2f297 count:int documents:Vector<Document> = users.SavedMusic;\n---functions---");
  // метод — сразу после ---functions--- (конец файла у разных версий разный, регэксп по нему промахивался)
  s = s.replace("---functions---\n", "---functions---\nusers.getSavedMusic#788d7fe3 id:InputUser offset:int limit:int hash:long = users.SavedMusic;\n");
  require("fs").writeFileSync(f, s);
}'
grep -q "users.getSavedMusic#788d7fe3" node_modules/telegram/tl/apiTl.js
grep -q "users.savedMusic#34a2f297" node_modules/telegram/tl/apiTl.js
NODE_PATH="$TMP/node_modules" npx esbuild "$ROOT/scripts/telegram-entry.js" --bundle --minify --platform=browser --format=iife --target=es2020 \
  --legal-comments=eof --define:process.env.NODE_ENV='"production"' --outfile="$ROOT/www/js/vendor/telegram.min.js"
rm -rf "$TMP"

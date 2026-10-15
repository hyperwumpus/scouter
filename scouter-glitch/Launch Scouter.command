#!/bin/zsh
cd "${0:A:h}"
if [[ ! -d node_modules/pdf-lib ]]; then
  npm ci || { read; exit 1; }
fi
exec node server/main.mjs

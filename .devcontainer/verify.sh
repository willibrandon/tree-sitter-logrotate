#!/usr/bin/env bash

set -euo pipefail

test "$(node --version)" = "v24.19.0"
test "$(npm --version)" = "12.0.2"
test "$(tree-sitter --version)" = "tree-sitter 0.26.12"
test "$(node -p 'process.platform')" = "linux"
test "$(logrotate --version | head -1)" = "logrotate 3.22.0.56_3be1"
command -v clang >/dev/null
command -v cargo-fuzz >/dev/null
command -v emcc >/dev/null
command -v gh >/dev/null
command -v go >/dev/null
command -v java >/dev/null
command -v jq >/dev/null
command -v shellcheck >/dev/null
command -v swift >/dev/null
command -v unzip >/dev/null
command -v zig >/dev/null
test -x .venv/bin/python
.venv/bin/python -m build --version >/dev/null

bash -lc 'javac -version 2>&1' | grep --quiet '^javac 25\.'
bash -lc 'command -v cargo >/dev/null && command -v rustc >/dev/null'
mvn --version | head -1 | grep --quiet '^Apache Maven 3\.9\.16 '

npm ci
npm --prefix docs-site ci --include=optional
npm run docs:check
npm run docs:build
npm run verify
npm run test:fixtures
npm run test:sanitizers
npm run test:bindings
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:wasm
npm run test:performance
PYTHON=.venv/bin/python npm run package:release
npm run verify:release
PYTHON=.venv/bin/python npm run test:release
mvn --batch-mode --no-transfer-progress clean test

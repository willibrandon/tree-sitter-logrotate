#!/usr/bin/env bash

set -euo pipefail

workspace_root="$(git rev-parse --show-toplevel)"
readonly workspace_root
sudo chown -R "$(id --user):$(id --group)" \
  "$workspace_root/build" \
  "$workspace_root/.build" \
  "$workspace_root/.venv" \
  "$workspace_root/.zig-cache" \
  "$workspace_root/zig-out" \
  "$workspace_root/zig-pkg" \
  "$workspace_root/node_modules" \
  "$workspace_root/.devcontainer-output" \
  /home/vscode/.cache

cd "$workspace_root"
npm ci
npm run check:versions

node --version
npm --version
tree-sitter --version
clang --version | head -1
rustc --version
go version
java -version
mvn --version
swift --version
zig version
logrotate --version

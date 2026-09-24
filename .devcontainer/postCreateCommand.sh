#!/usr/bin/env bash
set -euo pipefail

cd /workspace
node --version
pnpm --version
make install-dev

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> [1/2] Verifying CareerRadar Frontend (apps/web — Phase 1 + PeakChart UI)..."
cd "${ROOT_DIR}/apps/web"
npm run typecheck
npm test
npm run build

echo "==> [2/2] Verifying CareerRadar Backend (apps/api — Phase 2 & Phase 3)..."
cd "${ROOT_DIR}/apps/api"
.venv/bin/alembic upgrade head
.venv/bin/pytest -v

echo "==> All CareerRadar Phase 0–3 frontend and backend checks passed!"

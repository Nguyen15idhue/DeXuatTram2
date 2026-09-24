#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

COMPOSE_FILE="docker-compose.simple.yml"

if [ -f scripts/migrate.sh ]; then
  echo "[update] Chay migration DB..."
  rc=0
  bash scripts/migrate.sh run || rc=$?
  if [ "$rc" -ne 0 ]; then
    if [ "$rc" = "2" ]; then
      echo "[update] DB chua co tracking. Chay: scripts/migrate.sh mark-all --yes (sau khi xac minh schema), roi chay lai update."
    fi
    exit 1
  fi
fi

echo "[update] Build images..."
if ! docker compose -f "$COMPOSE_FILE" build; then
  echo "[update] Build loi (co the DeadlineExceeded). Thu lai voi legacy builder..."
  COMPOSE_BAKE=false DOCKER_BUILDKIT=0 docker compose -f "$COMPOSE_FILE" build
fi

echo "[update] Khoi dong lai..."
docker compose -f "$COMPOSE_FILE" up -d

echo "[update] Index kho tri thuc chatbot (best-effort)..."
if command -v node >/dev/null 2>&1 && node -e "require('mysql2')" 2>/dev/null; then
  (cd backend && node scripts/index-knowledge.js) || echo "[update] Canh bao: index-knowledge that bai (bo qua)."
  (cd backend && node scripts/index-code-knowledge.js) || echo "[update] Canh bao: index-code-knowledge that bai (bo qua)."
else
  echo "[update] Bo qua index chatbot (thieu node/mysql2). Chay tay: npm run index:knowledge (trong backend/)."
fi

echo "Da cap nhat. Log: docker compose -f $COMPOSE_FILE logs -f"

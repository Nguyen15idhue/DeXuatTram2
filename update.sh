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

echo "[update] Seed template bao cao BCX (best-effort, bo qua neu da co)..."
sleep 5
docker compose -f "$COMPOSE_FILE" exec -T backend node scripts/seed-document-templates.js \
  || echo "[update] Canh bao: seed template BCX that bai (bo qua)."

if [ "${SKIP_INDEX:-0}" = "1" ]; then
  echo "[update] Bo qua index chatbot (SKIP_INDEX=1)."
else
  echo "[update] Index kho tri thuc chatbot (best-effort, toi da ${INDEX_TIMEOUT:-600}s/script)..."
  INDEX_TIMEOUT="${INDEX_TIMEOUT:-600}"
  if command -v node >/dev/null 2>&1 && node -e "require('mysql2')" 2>/dev/null; then
    (cd backend && echo "[update] > index-knowledge.js ..." && timeout "$INDEX_TIMEOUT" node scripts/index-knowledge.js) || echo "[update] Canh bao: index-knowledge that bai/qua han (bo qua)."
    (cd backend && echo "[update] > index-code-knowledge.js ..." && timeout "$INDEX_TIMEOUT" node scripts/index-code-knowledge.js) || echo "[update] Canh bao: index-code-knowledge that bai/qua han (bo qua)."
  elif docker compose -f "$COMPOSE_FILE" config >/dev/null 2>&1; then
    # VPS: host khong co node_modules -> chay trong container backend (co san node_modules),
    # mount ca repo de script thay AGENTS.md + docs/ + frontend/src.
    echo "[update] Chay index trong container backend (mount repo)..."
    run_index() {
      local script="$1"
      echo "[update] > $script ..."
      timeout "$INDEX_TIMEOUT" docker compose -f "$COMPOSE_FILE" run --rm --no-deps -T \
        -v "$PWD:/repo" -w /repo/backend backend \
        sh -c 'SCRIPT="$1"; LINKED=0; if [ ! -e node_modules ]; then ln -sfn /app/node_modules node_modules && LINKED=1; fi; node "scripts/$SCRIPT"; rc=$?; [ "$LINKED" = "1" ] && rm -f node_modules; exit $rc' _ "$script" \
        || echo "[update] Canh bao: $script that bai/qua han (bo qua)."
    }
    run_index index-knowledge.js
    run_index index-code-knowledge.js
  else
    echo "[update] Bo qua index chatbot (khong co node host va khong chay duoc container)."
  fi
fi

echo "Da cap nhat. Log: docker compose -f $COMPOSE_FILE logs -f"

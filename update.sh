#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

COMPOSE_FILE="docker-compose.simple.yml"

if [ -x scripts/migrate.sh ]; then
  echo "[update] Chay migration DB..."
  rc=0
  scripts/migrate.sh run || rc=$?
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
echo "Da cap nhat. Log: docker compose -f $COMPOSE_FILE logs -f"

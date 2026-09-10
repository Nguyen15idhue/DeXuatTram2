#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

COMPOSE_FILE="docker-compose.simple.yml"

echo "[update] Build images..."
if ! docker compose -f "$COMPOSE_FILE" build; then
  echo "[update] Build loi (co the DeadlineExceeded). Thu lai voi legacy builder..."
  COMPOSE_BAKE=false DOCKER_BUILDKIT=0 docker compose -f "$COMPOSE_FILE" build
fi

echo "[update] Khoi dong lai..."
docker compose -f "$COMPOSE_FILE" up -d
echo "Da cap nhat. Log: docker compose -f $COMPOSE_FILE logs -f"

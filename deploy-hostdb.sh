#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

COMPOSE_FILE="docker-compose.hostdb.yml"
BASELINE_FILE="database/baseline/station_management_baseline.sql"

if [ ! -f .env ]; then
  echo "LOI: chua co .env. Chay ./deploy.sh mot lan de tao .env (hoac tao tay) roi thu lai."
  exit 1
fi

set -a
. ./.env
set +a

DB_NAME="${DB_NAME:-station_management}"
DB_USER="${DB_USER:-station_app}"
: "${DB_PASSWORD:?thieu DB_PASSWORD trong .env}"
WEB_PORT="${WEB_PORT:-8081}"

log() { echo "[hostdb] $1"; }

log "Tao database + user tren MySQL host..."
sudo mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4;
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL

log "Import baseline (bo qua neu bang da ton tai)..."
if ! sudo mysql "${DB_NAME}" < "${BASELINE_FILE}"; then
  echo "   (canh bao: import co loi, co the do bang da ton tai — tiep tuc)"
fi

log "Khoi dong app (frontend + backend)..."
docker compose -f "$COMPOSE_FILE" up -d --build

IP="$(grep -E '^BASE_URL=' .env | head -1 | cut -d= -f2- | sed -E 's#https?://##' | cut -d: -f1)"
[ -n "$IP" ] || IP="$(hostname -I | awk '{print $1}')"

echo ""
echo "==================== HOAN TAT ===================="
echo "Link: http://${IP}:${WEB_PORT}"
echo "Tai khoan: admin@station.com / 123456"
echo "DB: MySQL host — ${DB_NAME} (user ${DB_USER})"
echo "================================================="

#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

COMPOSE_FILE="docker-compose.simple.yml"
VOL="dexuattram2_mysql_data"
TARBALL="${1:-mysql-datadir.tar.gz}"
ROOT_PW='RootPass2026!'
APP_PW='AppPass2026!'

log() { echo "[datadir] $1"; }

[ -f "$TARBALL" ] || { echo "LOI: khong thay $TARBALL"; exit 1; }
if [ ! -f .env ]; then
  echo "LOI: chua co .env. Tao bang: cp .env.example .env  (roi dien JWT_SECRET, IP...) va chay lai."
  exit 1
fi

log "Dong bo mat khau MySQL trong .env cho khop datadir..."
sed -i -E "s#^MYSQL_ROOT_PASSWORD=.*#MYSQL_ROOT_PASSWORD=${ROOT_PW}#" .env
sed -i -E "s#^MYSQL_APP_PASSWORD=.*#MYSQL_APP_PASSWORD=${APP_PW}#" .env
sed -i -E "s#^DB_PASSWORD=.*#DB_PASSWORD=${APP_PW}#" .env

log "Don container/volume MySQL cu..."
docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
docker rm -f station-mysql 2>/dev/null || true
docker volume rm "$VOL" 2>/dev/null || true

log "Nap datadir vao volume $VOL ..."
docker volume create "$VOL" >/dev/null
docker run --rm -v "$VOL":/data -v "$PWD":/backup busybox sh -c "tar xzf /backup/$(basename "$TARBALL") -C /data && chown -R 999:999 /data"

log "Chay deploy.sh (MySQL se khoi dong ngay, khong init lai)..."
chmod +x deploy.sh
exec ./deploy.sh

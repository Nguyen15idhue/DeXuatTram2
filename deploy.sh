#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.simple.yml"
VOL="dexuattram2_mysql_data"
DATADIR_TAR="docker/mysql-datadir.tar.gz"
LITE_DUMP="docker/station_lite_dump.sql"
DB_ROOT_PW='RootPass2026!'
DB_APP_PW='AppPass2026!'
DEFAULT_WEB_PORT="8081"
WEB_PORT="${WEB_PORT:-$DEFAULT_WEB_PORT}"
SKIP_SCHEMA=0

for arg in "$@"; do
  case "$arg" in
    --skip-schema) SKIP_SCHEMA=1 ;;
    --port=*) WEB_PORT="${arg#*=}" ;;
    -h|--help)
      echo "Cach dung: ./deploy.sh [--port=8081] [--skip-schema]"
      echo "  --port=<so>     Cong web (mac dinh 8081)"
      echo "  --skip-schema   Khong import du lieu DB"
      exit 0 ;;
    *) echo "Tham so khong hop le: $arg"; exit 1 ;;
  esac
done

log() { echo "[deploy] $1"; }

command -v docker >/dev/null 2>&1 || { echo "LOI: chua cai Docker."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "LOI: chua cai Docker Compose plugin."; exit 1; }
[ -f "$DATADIR_TAR" ] || { echo "LOI: thieu $DATADIR_TAR"; exit 1; }
[ -f "$LITE_DUMP" ] || { echo "LOI: thieu $LITE_DUMP"; exit 1; }

detect_ip() {
  local ip=""
  ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  [ -n "$ip" ] || ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo "$ip"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 48
  fi
}

if [ ! -f .env ]; then
  log "Tao .env..."
  IP="$(detect_ip)"
  cat > .env <<EOF
NODE_ENV=production
PORT=3000
WEB_PORT=${WEB_PORT}
TZ=Asia/Ho_Chi_Minh

DB_HOST=mysql
DB_PORT=3306
DB_USER=station_app
DB_PASSWORD=${DB_APP_PW}
DB_NAME=station_management

MYSQL_ROOT_PASSWORD=${DB_ROOT_PW}
MYSQL_DATABASE=station_management
MYSQL_APP_USER=station_app
MYSQL_APP_PASSWORD=${DB_APP_PW}

JWT_SECRET=$(random_secret)
JWT_EXPIRES_IN=12h

CORS_ORIGINS=http://${IP}:${WEB_PORT}
BASE_URL=http://${IP}:${WEB_PORT}
FRONTEND_URL=http://${IP}:${WEB_PORT}

CAPTCHA_ENABLED=false
TURNSTILE_SECRET_KEY=
ORPHAN_FILE_TTL_HOURS=24
ENABLE_SWAGGER=false
EOF
  log "Da tao .env (IP: ${IP})."
else
  log "Dung .env hien co; dong bo mat khau MySQL theo datadir."
  sed -i -E "s#^MYSQL_ROOT_PASSWORD=.*#MYSQL_ROOT_PASSWORD=${DB_ROOT_PW}#" .env 2>/dev/null || true
  sed -i -E "s#^MYSQL_APP_PASSWORD=.*#MYSQL_APP_PASSWORD=${DB_APP_PW}#" .env 2>/dev/null || true
  sed -i -E "s#^DB_PASSWORD=.*#DB_PASSWORD=${DB_APP_PW}#" .env 2>/dev/null || true
  IP="$(grep -E '^BASE_URL=' .env | head -1 | cut -d= -f2- | sed -E 's#https?://##' | cut -d: -f1)"
  [ -n "$IP" ] || IP="$(detect_ip)"
fi

log "Build images (lan dau co the vai phut)..."
docker compose -f "$COMPOSE_FILE" build

NEED_RESTORE=1
if docker volume inspect "$VOL" >/dev/null 2>&1; then
  if docker run --rm -v "$VOL":/data busybox sh -c '[ -d /data/mysql ]' >/dev/null 2>&1; then
    NEED_RESTORE=0
  fi
fi

if [ "$NEED_RESTORE" = "1" ]; then
  log "Nap datadir MySQL (bo qua init cham)..."
  docker rm -f station-mysql >/dev/null 2>&1 || true
  docker volume create "$VOL" >/dev/null 2>&1 || true
  docker run --rm -v "$VOL":/data -v "$PWD":/src busybox sh -c "tar xzf /src/${DATADIR_TAR} -C /data && chown -R 999:999 /data"
else
  log "Da co datadir MySQL, bo qua nap."
fi

log "Khoi dong MySQL..."
docker compose -f "$COMPOSE_FILE" up -d mysql

log "Cho MySQL healthy..."
MYSQL_READY=0
for i in $(seq 1 120); do
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' station-mysql 2>/dev/null || echo missing)"
  RUNNING="$(docker inspect -f '{{.State.Running}}' station-mysql 2>/dev/null || echo false)"
  if [ "$STATUS" = "healthy" ]; then
    MYSQL_READY=1
    break
  fi
  if [ "$RUNNING" != "true" ]; then
    echo "LOI: container MySQL khong chay (status=${STATUS}). Log cuoi:"
    docker logs --tail 60 station-mysql 2>&1 || true
    exit 1
  fi
  if [ $((i % 10)) -eq 0 ]; then
    echo "   ... dang cho MySQL (${STATUS}) $((i * 3))s"
  fi
  sleep 3
done
if [ "$MYSQL_READY" != "1" ]; then
  echo "LOI: MySQL khong healthy. Log cuoi:"
  docker logs --tail 60 station-mysql 2>&1 || true
  exit 1
fi
log "MySQL healthy."

if [ "$SKIP_SCHEMA" != "1" ]; then
  TABLE_USERS="$(printf "SHOW TABLES LIKE 'users';" | docker compose -f "$COMPOSE_FILE" exec -T mysql sh -c 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' 2>/dev/null | tr -d '\r' | head -1 || true)"
  if [ "$TABLE_USERS" = "users" ]; then
    log "DB da co bang, bo qua import."
  else
    log "Import du lieu DB (lite)..."
    docker compose -f "$COMPOSE_FILE" exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SET GLOBAL innodb_flush_log_at_trx_commit=0; SET GLOBAL sync_binlog=0;"' >/dev/null 2>&1 || true
    if ! docker compose -f "$COMPOSE_FILE" exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DATABASE"' < "$LITE_DUMP"; then
      echo "LOI: import du lieu that bai."
      exit 1
    fi
    docker compose -f "$COMPOSE_FILE" exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SET GLOBAL innodb_flush_log_at_trx_commit=1; SET GLOBAL sync_binlog=1;"' >/dev/null 2>&1 || true
    log "Import xong."
  fi
fi

log "Khoi dong backend + frontend..."
docker compose -f "$COMPOSE_FILE" up -d backend frontend

echo ""
echo "==================== HOAN TAT ===================="
echo "Link truy cap : http://${IP}:${WEB_PORT}"
echo "Tai khoan     : admin@station.com / 123456"
echo "--------------------------------------------------"
echo "CAN LAM NGAY (VPS PUBLIC):"
echo "  1. Doi mat khau admin + xoa tai khoan test."
echo "  2. Rotate token 1Office (cap nhat bang api_configs)."
echo "  3. Mo cong ${WEB_PORT} tren security group neu truy cap tu ngoai."
echo "================================================="

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILE="docker-compose.simple.yml"
DEFAULT_WEB_PORT="8081"
WEB_PORT="${WEB_PORT:-$DEFAULT_WEB_PORT}"
SKIP_SCHEMA=0
USE_SCRIPTS=0
BASELINE_FILE="database/baseline/station_management_baseline.sql"

for arg in "$@"; do
  case "$arg" in
    --skip-schema) SKIP_SCHEMA=1 ;;
    --use-scripts) USE_SCRIPTS=1 ;;
    --port=*) WEB_PORT="${arg#*=}" ;;
    -h|--help)
      echo "Cach dung: ./deploy.sh [--port=8081] [--skip-schema] [--use-scripts]"
      echo "  --port=<so>     Cong web (mac dinh 8081; tranh port dang mo tren VPS)"
      echo "  --skip-schema   Khong import database"
      echo "  --use-scripts   Bo file baseline, chay tuan tu database/01 -> 44"
      exit 0
      ;;
    *)
      echo "Tham so khong hop le: $arg"
      exit 1
      ;;
  esac
done

log() { echo "[deploy] $1"; }

command -v docker >/dev/null 2>&1 || { echo "LOI: chua cai Docker."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "LOI: chua cai Docker Compose plugin."; exit 1; }

detect_ip() {
  local ip=""
  ip="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  if [ -z "$ip" ]; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  fi
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
  log "Tao file .env moi..."
  IP="$(detect_ip)"
  JWT_SECRET="$(random_secret)"
  MYSQL_ROOT_PASSWORD="$(random_secret)"
  MYSQL_APP_PASSWORD="$(random_secret)"
  if [ "${#JWT_SECRET}" -lt 32 ]; then
    JWT_SECRET="$(random_secret)$(random_secret)"
  fi

  cat > .env <<EOF
NODE_ENV=production
PORT=3000
WEB_PORT=${WEB_PORT}
TZ=Asia/Ho_Chi_Minh

DB_HOST=mysql
DB_PORT=3306
DB_USER=station_app
DB_PASSWORD=${MYSQL_APP_PASSWORD}
DB_NAME=station_management

MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
MYSQL_DATABASE=station_management
MYSQL_APP_USER=station_app
MYSQL_APP_PASSWORD=${MYSQL_APP_PASSWORD}

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=12h

CORS_ORIGINS=http://${IP}:${WEB_PORT}
BASE_URL=http://${IP}:${WEB_PORT}
FRONTEND_URL=http://${IP}:${WEB_PORT}

CAPTCHA_ENABLED=false
TURNSTILE_SECRET_KEY=
ORPHAN_FILE_TTL_HOURS=24
ENABLE_SWAGGER=false
EOF
  log "Da tao .env (IP phat hien: ${IP})."
else
  log "Da co .env, dung lai file hien tai."
  IP="$(grep -E '^BASE_URL=' .env | head -1 | cut -d= -f2- | sed -E 's#https?://##' | cut -d: -f1)"
  [ -n "$IP" ] || IP="$(detect_ip)"
fi

log "Build images (lan dau co the mat vai phut)..."
docker compose -f "$COMPOSE_FILE" build

log "Khoi dong MySQL..."
docker compose -f "$COMPOSE_FILE" up -d mysql

log "Cho MySQL healthy (co the mat 1-3 phut lan dau)..."
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
    docker logs --tail 80 station-mysql 2>&1 || true
    exit 1
  fi
  sleep 3
done
if [ "$MYSQL_READY" != "1" ]; then
  echo "LOI: MySQL khong healthy sau thoi gian cho. Log cuoi:"
  docker logs --tail 80 station-mysql 2>&1 || true
  exit 1
fi
log "MySQL healthy."

log "Khoi dong backend + frontend..."
docker compose -f "$COMPOSE_FILE" up -d backend frontend

if [ "$SKIP_SCHEMA" != "1" ]; then
  TABLE_USERS="$(printf "SHOW TABLES LIKE 'users';" | docker compose -f "$COMPOSE_FILE" exec -T mysql sh -c 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' 2>/dev/null | tr -d '\r' | head -1 || true)"

  if [ "$TABLE_USERS" = "users" ]; then
    log "Database da co du lieu, bo qua import."
  elif [ "$USE_SCRIPTS" = "1" ] || [ ! -f "$BASELINE_FILE" ]; then
    log "Import schema (database/01 -> ...)..."
    for f in database/*.sql; do
      echo "   >> $f"
      if ! docker compose -f "$COMPOSE_FILE" exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DATABASE"' < "$f" 2>/tmp/schema_err.txt; then
        echo "      (canh bao loi khi chay $f)"
        sed 's/^/      /' /tmp/schema_err.txt || true
      fi
    done
    log "Import schema xong."
  else
    log "Import baseline: $BASELINE_FILE ..."
    if docker compose -f "$COMPOSE_FILE" exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DATABASE"' < "$BASELINE_FILE"; then
      log "Import baseline xong."
    else
      echo "LOI: import baseline that bai."
      exit 1
    fi
  fi
fi

echo ""
echo "==================== HOAN TAT ===================="
echo "Link truy cap : http://${IP}:${WEB_PORT}"
echo "Tai khoan mac dinh: admin@station.com / 123456"
echo "--------------------------------------------------"
echo "VIEC CAN LAM NGAY (VPS PUBLIC):"
echo "  1. Dang nhap va DOI MAT KHAU admin ngay."
echo "  2. Xoa/khoa cac tai khoan test (*@example.com, test..., reg...)."
echo "  3. Mo firewall chi cho cong ${WEB_PORT} va SSH."
echo "  4. Khi co domain: cap nhat CORS_ORIGINS/BASE_URL/FRONTEND_URL trong .env"
echo "     + dung TLS (Cloudflare/nginx)."
echo "  Luu y: mat khau MySQL root va app nam trong file .env (khong chia se)."
echo "================================================="

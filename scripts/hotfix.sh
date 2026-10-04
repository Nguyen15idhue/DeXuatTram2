#!/usr/bin/env bash
# Hotfix nhanh cho sua doi nho (code JS/CSS thuan da push GitHub).
# Khong rebuild image: chep file backend vao container + restart, rebuild
# rieng frontend khi can. Nhanh hon update.sh nhieu (backend < 1 phut).
#
# Dieu kien: VPS git == remote (code da push). Thay doi lon (migration,
# package.json, Dockerfile, compose) -> tu dong doi chay ./update.sh.
#
# Cach dung: ./scripts/hotfix.sh [--yes]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

COMPOSE_FILE="docker-compose.simple.yml"
BACKEND_CONTAINER="station-backend"
ASSUME_YES=0

for arg in "$@"; do
  case "$arg" in
    --yes) ASSUME_YES=1 ;;
    -h|--help)
      echo "Cach dung: ./scripts/hotfix.sh [--yes]"
      echo "  Trien khai nhanh sua doi nho da push (khong rebuild ca stack)."
      exit 0 ;;
    *) echo "Tham so khong hop le: $arg"; exit 1 ;;
  esac
done

log() { echo "[hotfix] $1"; }
die() { echo "[hotfix] LOI: $1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "chua cai Docker."
command -v git >/dev/null 2>&1 || die "chua cai git."

# 0. Cay lam viec phai sach (khong sua tay tren VPS)
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  die "VPS co sua doi chua commit. Xu ly tay xong moi chay (tranh mat code)."
fi

# 1. Pull code moi
OLD_HEAD="$(git rev-parse HEAD)"
BRANCH="$(git branch --show-current)"
log "Pull ${BRANCH}..."
git pull origin "$BRANCH" 2>&1 | tail -2
NEW_HEAD="$(git rev-parse HEAD)"
if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  log "Khong co commit moi. Khong lam gi."
  exit 0
fi
CHANGED="$(git diff --name-only "$OLD_HEAD" "$NEW_HEAD")"
log "File doi ($(echo "$CHANGED" | wc -l)):"
echo "$CHANGED" | sed 's/^/  /'

# 2. File xoa? -> update.sh cho an toan
DELETED="$(git diff --name-only --diff-filter=D "$OLD_HEAD" "$NEW_HEAD" || true)"
if [ -n "$DELETED" ]; then
  die "Co file bi xoa. Chay ./update.sh de rebuild sach."
fi

# 3. Thay doi lon? -> update.sh
if echo "$CHANGED" | grep -Eq '^(database/|backend/package(-lock)?\.json|frontend/package(-lock)?\.json|backend/Dockerfile|frontend/Dockerfile|docker-compose[^/]*\.yml|Dockerfile|\.dockerignore)'; then
  die "Thay doi migration/deps/Docker/compose. Chay ./update.sh."
fi

BACKEND_FILES="$(echo "$CHANGED" | grep -E '^backend/' || true)"
FRONTEND_FILES="$(echo "$CHANGED" | grep -E '^frontend/(src|public)/' || true)"
OTHER_FILES="$(echo "$CHANGED" | grep -Ev '^(backend/|frontend/(src|public)/|scripts/|docs/|AGENTS\.md|README)' || true)"
if [ -n "$OTHER_FILES" ]; then
  die "Co file ngoai pham vi hotfix. Chay ./update.sh. Danh sach: $(echo "$OTHER_FILES" | tr '\n' ' ')"
fi
if [ -z "$BACKEND_FILES" ] && [ -z "$FRONTEND_FILES" ]; then
  log "Chi doi docs/script. Khong can deploy."
  exit 0
fi

# 4. Trien khai backend: chep file + restart
if [ -n "$BACKEND_FILES" ]; then
  docker inspect "$BACKEND_CONTAINER" >/dev/null 2>&1 || die "container $BACKEND_CONTAINER khong ton tai."
  log "Chep $(echo "$BACKEND_FILES" | wc -l) file backend vao container..."
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ -f "$f" ] || die "khong thay file $f."
    dest="/app/${f#backend/}"
    docker cp "$f" "$BACKEND_CONTAINER:$dest" || die "chep $f that bai."
  done <<< "$BACKEND_FILES"
  log "Restart $BACKEND_CONTAINER..."
  docker restart "$BACKEND_CONTAINER" >/dev/null
  log "Cho backend healthy (toi da ~60s)..."
  OK=0
  for _ in $(seq 1 20); do
    if docker exec "$BACKEND_CONTAINER" node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
      OK=1
      break
    fi
    sleep 3
  done
  [ "$OK" = "1" ] || die "backend khong healthy sau restart. Xem: docker logs --tail 50 $BACKEND_CONTAINER"
  log "Backend xong."
fi

# 5. Trien khai frontend: rebuild rieng service frontend
if [ -n "$FRONTEND_FILES" ]; then
  log "Rebuild frontend (npm ci cache san, chi build lai)..."
  if ! docker compose -f "$COMPOSE_FILE" up -d --build frontend; then
    die "build frontend loi. Thu ./update.sh (legacy builder) hoac kiem tra log."
  fi
  log "Frontend xong."
fi

# 6. Verify nhanh qua cong web
WEB_PORT="$(grep -E '^WEB_PORT=' .env 2>/dev/null | cut -d= -f2- || true)"
WEB_PORT="${WEB_PORT:-8081}"
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://127.0.0.1:${WEB_PORT}/api/test" || true)"
if [ "$CODE" = "200" ]; then
  log "Verify OK: /api/test = 200."
else
  die "verify /api/test = ${CODE:-timeout}. Kiem tra: docker compose -f $COMPOSE_FILE ps"
fi

echo ""
echo "[hotfix] XONG trong vai chuc giay."
echo "[hotfix] Luu y: container va image se lech nhau cho toi lan ./update.sh ke tiep (rebuild tu git, khong mat code)."

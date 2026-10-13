#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

SOURCE_CONTAINER="station-mysql"
TARGET_CONTAINER="station-mysql"
TARGET_COMPOSE="docker-compose.simple.yml"
TARGET_VOLUME="dexuattram2_uploads_data"
UPLOADS_SRC_DIR="backend/storage/uploads"
LOCAL_BACKUP_DIR="backups"
TMP_DIR="${TMPDIR:-/tmp}"
REMOTE=""
REMOTE_DIR='~/DeXuatTram2'
DB_NAME=""
OUT_FILE=""
BACKUP_DIR="/root/backups"
BACKUP_KEEP=5
ASSUME_YES=0
DRY_RUN=0
SKIP_UPLOADS=0
MERGE=1
SSH_OPTS="${SSH_OPTS:-}"
CMD=""
FILE_ARG=""

usage() {
  cat <<'EOF'
Dong bo du lieu MySQL tu dev len VPS.

Mac dinh: CHI THEM du lieu (ban ghi trung PK/unique se bo qua, giu nguyen du lieu VPS).
Dung --full neu muon ghi de toan bo (xoa het bang roi tao lai tu dev).

Cach dung:
  scripts/sync-data.sh export [--out FILE]
  scripts/sync-data.sh import FILE
  scripts/sync-data.sh push --host user@vps [tuy chon]

Tuy chon:
  --host=user@vps     SSH dich (bat buoc voi push)
  --dir=DIR           Thu muc project tren VPS (mac dinh ~/DeXuatTram2)
  --compose=FILE      Compose file tren VPS (mac dinh docker-compose.simple.yml)
  --volume=NAME       Volume uploads tren VPS (mac dinh dexuattram2_uploads_data)
  --db=NAME           Ten DB dich (mac dinh lay tu container nguon)
  --out=FILE          File dump cho export
  --keep=N            So ban backup giu lai tren VPS (mac dinh 5)
  --no-uploads        Khong dong bo file uploads
  --full              GHI DE toan bo DB VPS bang du lieu dev (mac dinh la chi them)
  --merge             Chi them du lieu (mac dinh; giu de tuong thich)
  --mode=add|full     add (mac dinh) hoac full
  --yes, -y           Khong hoi xac nhan
  --dry-run           Chi in lenh, khong thuc thi
  -h, --help          Tro giup

Vi du:
  scripts/sync-data.sh push --host root@1.2.3.4
  scripts/sync-data.sh push --host root@1.2.3.4 --no-uploads
  scripts/sync-data.sh push --host root@1.2.3.4 --full
  scripts/sync-data.sh export --out /tmp/dev.sql.gz
  scripts/sync-data.sh import /tmp/dev.sql.gz --yes
EOF
  exit 0
}

log() { echo "[sync] $1"; }
die() { echo "[sync] LOI: $1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    export|import|push)
      if [ -z "$CMD" ]; then CMD="$1"; elif [ -z "$FILE_ARG" ]; then FILE_ARG="$1"; else die "tham so khong hop le: $1"; fi ;;
    --host=*) REMOTE="${1#*=}" ;;
    --host) shift; REMOTE="${1:-}" ;;
    --dir=*) REMOTE_DIR="${1#*=}" ;;
    --dir) shift; REMOTE_DIR="${1:-}" ;;
    --compose=*) TARGET_COMPOSE="${1#*=}" ;;
    --compose) shift; TARGET_COMPOSE="${1:-}" ;;
    --volume=*) TARGET_VOLUME="${1#*=}" ;;
    --volume) shift; TARGET_VOLUME="${1:-}" ;;
    --db=*) DB_NAME="${1#*=}" ;;
    --db) shift; DB_NAME="${1:-}" ;;
    --out=*) OUT_FILE="${1#*=}" ;;
    --out) shift; OUT_FILE="${1:-}" ;;
    --keep=*) BACKUP_KEEP="${1#*=}" ;;
    --keep) shift; BACKUP_KEEP="${1:-}" ;;
    -h|--help) usage ;;
    --yes|-y) ASSUME_YES=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --no-uploads) SKIP_UPLOADS=1 ;;
    --merge|--add) MERGE=1 ;;
    --full|--replace) MERGE=0 ;;
    --mode=*) [ "${1#*=}" = "full" ] && MERGE=0 || MERGE=1 ;;
    --mode) shift; [ "${1:-}" = "full" ] && MERGE=0 || MERGE=1 ;;
    -*) die "tham so khong hop le: $1" ;;
    *) if [ -z "$CMD" ]; then CMD="$1"; elif [ -z "$FILE_ARG" ]; then FILE_ARG="$1"; else die "tham so khong hop le: $1"; fi ;;
  esac
  shift
done

[ -n "$CMD" ] || { usage; }

confirm() {
  [ "$ASSUME_YES" = 1 ] && return 0
  printf '[sync] %s [yes/no]: ' "$1"
  read -r answer
  [ "$answer" = "yes" ] || [ "$answer" = "y" ]
}

need_docker() {
  command -v docker >/dev/null 2>&1 || die "chua cai Docker"
}

need_source() {
  need_docker
  local running
  running="$(docker inspect -f '{{.State.Running}}' "$SOURCE_CONTAINER" 2>/dev/null || echo false)"
  [ "$running" = "true" ] || die "container $SOURCE_CONTAINER khong chay"
}

resolve_db() {
  local src
  src="$(docker exec "$SOURCE_CONTAINER" printenv MYSQL_DATABASE 2>/dev/null | tr -d '\r\n' || true)"
  [ -n "$src" ] || src="station_management"
  [ -n "$DB_NAME" ] || DB_NAME="$src"
}

dump_flags() {
  if [ "$MERGE" = 1 ]; then
    printf '%s' "--single-transaction --no-create-info --skip-triggers --insert-ignore --hex-blob --set-gtid-purged=OFF --no-tablespaces --skip-lock-tables --skip-add-locks --default-character-set=utf8mb4 --ignore-table=$DB_NAME.schema_migrations"
  else
    printf '%s' '--single-transaction --routines --triggers --events --hex-blob --set-gtid-purged=OFF --no-tablespaces --skip-lock-tables --skip-add-locks --default-character-set=utf8mb4'
  fi
}

rsh() {
  if [ "$DRY_RUN" = 1 ]; then
    echo "  (dry) ssh $REMOTE \"$1\""
  else
    ssh $SSH_OPTS "$REMOTE" "$1"
  fi
}

remote_base() {
  printf 'cd %s && docker compose -f %s' "$REMOTE_DIR" "$TARGET_COMPOSE"
}

do_export() {
  local out="$1" flags
  flags="$(dump_flags)"
  log "Dump '$DB_NAME' tu $SOURCE_CONTAINER -> $out"
  if [ "$DRY_RUN" = 1 ]; then
    echo "  (dry) docker exec $SOURCE_CONTAINER sh -c 'mysqldump ... $flags $DB_NAME' | gzip > $out"
    return 0
  fi
  mkdir -p "$(dirname "$out")"
  docker exec "$SOURCE_CONTAINER" sh -c "exec mysqldump -uroot -p\"\$MYSQL_ROOT_PASSWORD\" $flags \"$DB_NAME\"" | gzip -c > "$out"
  [ -s "$out" ] || die "file dump rong: $out"
  log "Dump xong: $out ($(du -h "$out" | awk '{print $1}'))"
}

local_backup() {
  local ts="$1" out="$LOCAL_BACKUP_DIR/pre-sync-$ts.sql.gz"
  if [ "$DRY_RUN" = 1 ]; then echo "  (dry) backup DB dev -> $out"; return 0; fi
  mkdir -p "$LOCAL_BACKUP_DIR"
  log "Backup DB dev hien tai -> $out"
  docker exec "$SOURCE_CONTAINER" sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --default-character-set=utf8mb4 "$MYSQL_DATABASE" | gzip' > "$out"
  [ -s "$out" ] || die "backup dev rong"
}

do_import_local() {
  local file="$1" reader="cat"
  case "$file" in *.gz) reader="gzip -dc" ;; esac
  log "Import $file -> $SOURCE_CONTAINER/$DB_NAME"
  if [ "$DRY_RUN" = 1 ]; then echo "  (dry) $reader $file | docker exec -i ... mysql"; return 0; fi
  $reader "$file" | docker exec -i "$SOURCE_CONTAINER" sh -c "exec mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 \"$DB_NAME\""
}

remote_check() {
  local base
  base="$(remote_base)"
  log "Kiem tra VPS $REMOTE ..."
  if [ "$DRY_RUN" = 1 ]; then echo "  (dry) ssh $REMOTE \"$base ps\""; return 0; fi
  ssh $SSH_OPTS "$REMOTE" "$base ps >/dev/null" || die "khong truy cap duoc project tren VPS ($REMOTE_DIR / $TARGET_COMPOSE)"
}

remote_backup() {
  local ts="$1" base cmd
  base="$(remote_base)"
  cmd="$base exec -T mysql sh -c 'exec mysqldump -uroot -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction --routines --triggers --default-character-set=utf8mb4 \"\$MYSQL_DATABASE\" | gzip' > $BACKUP_DIR/pre-sync-$ts.sql.gz"
  log "Backup DB VPS -> $BACKUP_DIR/pre-sync-$ts.sql.gz"
  rsh "mkdir -p $BACKUP_DIR && $cmd"
  if [ "$SKIP_UPLOADS" != 1 ]; then
    log "Backup uploads VPS -> $BACKUP_DIR/uploads-pre-sync-$ts.tar.gz"
    rsh "docker run --rm -v $TARGET_VOLUME:/data -v $BACKUP_DIR:/backup busybox tar czf /backup/uploads-pre-sync-$ts.tar.gz -C /data ."
  fi
  rsh "ls -1t $BACKUP_DIR/pre-sync-*.sql.gz 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | xargs -r rm -f"
}

remote_stop_backend() {
  log "Dung backend tren VPS..."
  rsh "$(remote_base) stop backend"
}

remote_import_db() {
  local file="$1" reader="cat" base
  case "$file" in *.gz) reader="gzip -dc" ;; esac
  base="$(remote_base)"
  log "Import DB len VPS..."
  if [ "$DRY_RUN" = 1 ]; then echo "  (dry) $reader $file | ssh $REMOTE \"$base exec -T mysql ...\""; return 0; fi
  $reader "$file" | ssh $SSH_OPTS "$REMOTE" "$base exec -T mysql sh -c 'exec mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" --default-character-set=utf8mb4 \"\$MYSQL_DATABASE\"'"
}

remote_import_uploads() {
  [ "$SKIP_UPLOADS" = 1 ] && return 0
  [ -d "$UPLOADS_SRC_DIR" ] || { log "Bo qua uploads: khong thay $UPLOADS_SRC_DIR"; return 0; }
  log "Dong bo uploads len VPS volume $TARGET_VOLUME..."
  if [ "$DRY_RUN" = 1 ]; then echo "  (dry) tar czf - -C $UPLOADS_SRC_DIR . | ssh $REMOTE docker run ... tar xzf -"; return 0; fi
  tar czf - -C "$UPLOADS_SRC_DIR" . | ssh $SSH_OPTS "$REMOTE" "docker run --rm -i -v $TARGET_VOLUME:/data busybox tar xzf - -C /data"
}

remote_start() {
  log "Khoi dong lai backend tren VPS..."
  rsh "$(remote_base) up -d backend"
}

verify_counts() {
  local tables="users stations station_proposals field_definitions forms views data_lists files"
  log "Doi chieu so dong dev <-> VPS ($([ "$MERGE" = 1 ] && echo 'chi them: dev <= vps' || echo 'full: dev = vps')):"
  local t s r label
  for t in $tables; do
    s="$(docker exec "$SOURCE_CONTAINER" sh -c "mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"SELECT COUNT(*) FROM $t\" \"$DB_NAME\"" 2>/dev/null | tr -d '\r\n ' || true)"
    r="$(ssh $SSH_OPTS "$REMOTE" "docker exec $TARGET_CONTAINER sh -c 'mysql -N -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -e \"SELECT COUNT(*) FROM $t\" \"\$MYSQL_DATABASE\"'" 2>/dev/null | tr -d '\r\n ' || true)"
    if [ -z "$s" ] || [ -z "$r" ]; then
      label="?"
    elif [ "$MERGE" = 1 ]; then
      if [ "$s" -le "$r" ] 2>/dev/null; then label="OK"; else label="THIEU"; fi
    else
      if [ "$s" = "$r" ]; then label="OK"; else label="DIFF"; fi
    fi
    printf '  %-20s dev=%-8s vps=%-8s %s\n' "$t" "${s:-?}" "${r:-?}" "$label"
  done
}

cmd_export() {
  need_source
  resolve_db
  local out="${OUT_FILE:-$TMP_DIR/sync-$DB_NAME-$(date +%Y%m%d-%H%M%S).sql.gz}"
  do_export "$out"
}

cmd_import() {
  [ -n "$FILE_ARG" ] || die "thieu file dump (vi du: sync-data.sh import dump.sql.gz)"
  [ -f "$FILE_ARG" ] || die "khong thay file $FILE_ARG"
  need_source
  resolve_db
  confirm "Import $FILE_ARG vao DB '$DB_NAME' tren $SOURCE_CONTAINER?" || die "da huy"
  local_backup "$(date +%Y%m%d-%H%M%S)"
  do_import_local "$FILE_ARG"
  log "Import xong."
}

cmd_push() {
  [ -n "$REMOTE" ] || die "thieu --host user@vps"
  need_source
  resolve_db
  local ts dump
  ts="$(date +%Y%m%d-%H%M%S)"
  dump="$TMP_DIR/sync-$DB_NAME-$ts.sql.gz"
  log "Che do: $([ "$MERGE" = 1 ] && echo 'CHI THEM du lieu' || echo 'GHI DE toan bo (full)') | uploads: $([ "$SKIP_UPLOADS" = 1 ] && echo 'bo qua' || echo 'co')"
  if [ "$MERGE" = 1 ]; then
    log "Luu y: schema VPS phai da cap nhat (chay update.sh tren VPS truoc). Ban ghi trung PK/unique se duoc giu theo VPS."
    confirm "THEM du lieu '$DB_NAME' tu dev vao $REMOTE (khong xoa du lieu VPS)?" || die "da huy"
  else
    confirm "GHI DE toan bo DB '$DB_NAME' tren $REMOTE va (tuy chon) uploads?" || die "da huy"
  fi
  remote_check
  do_export "$dump"
  remote_backup "$ts"
  remote_stop_backend
  remote_import_db "$dump"
  remote_import_uploads
  remote_start
  [ "$DRY_RUN" = 1 ] || verify_counts
  [ "$DRY_RUN" = 1 ] || rm -f "$dump"
  echo ""
  if [ "$MERGE" = 1 ]; then
    log "Hoan tat: da THEM du lieu tu dev. Ban ghi trung PK/unique giu theo VPS, khong ghi de."
  else
    log "Hoan tat. Luu y bao mat: hash mat khau + token 1Office da copy tu dev."
    log "Hay doi mat khau admin va rotate token tren VPS (xem docs/6/Huong_dan_deploy_va_cap_nhat_VPS.md muc 8)."
  fi
}

case "$CMD" in
  export) cmd_export ;;
  import) cmd_import ;;
  push) cmd_push ;;
  *) usage ;;
esac

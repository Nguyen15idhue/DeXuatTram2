#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

MYSQL_CONTAINER="station-mysql"
DB_DIR="database"
SKIP_FILE="01-create-tables.sql"

FORCE=0
YES=0

log() { echo "[migrate] $1"; }
die() { echo "[migrate] LOI: $1" >&2; exit "${2:-1}"; }

usage() {
  echo "Cach dung:"
  echo "  scripts/migrate.sh status"
  echo "  scripts/migrate.sh run [--force]"
  echo "  scripts/migrate.sh mark-all --yes"
  echo "  scripts/migrate.sh mark <file>"
  echo "  scripts/migrate.sh unmark <file>"
  exit 0
}

CMD="${1:-status}"
shift || true
FILE_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --yes) YES=1 ;;
    -h|--help) usage ;;
    *) FILE_ARG="$1" ;;
  esac
  shift
done

need_container() {
  local running
  running="$(docker inspect -f '{{.State.Running}}' "$MYSQL_CONTAINER" 2>/dev/null || echo false)"
  [ "$running" = "true" ] || die "container $MYSQL_CONTAINER khong chay" 3
}

load_env() {
  local pw db
  pw="$(docker exec "$MYSQL_CONTAINER" printenv MYSQL_ROOT_PASSWORD 2>/dev/null | tr -d '\r\n' || true)"
  db="$(docker exec "$MYSQL_CONTAINER" printenv MYSQL_DATABASE 2>/dev/null | tr -d '\r\n' || true)"
  [ -n "$pw" ] && [ -n "$db" ] || die "thieu MYSQL_ROOT_PASSWORD/MYSQL_DATABASE trong container" 3
  if [ "$db" != "station_management" ]; then
    log "Canh bao: DB la $db (mot so script cu ghi USE station_management)."
  fi
}

mysql_exec() {
  docker exec -i "$MYSQL_CONTAINER" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DATABASE"'
}

mysql_query() {
  printf '%s' "$1" | docker exec -i "$MYSQL_CONTAINER" sh -c 'mysql -N -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DATABASE"'
}

sql_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

ensure_tracking() {
  mysql_exec <<'SQL' >/dev/null
CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
SQL
}

tracking_exists() {
  mysql_query "SHOW TABLES LIKE 'schema_migrations';" | tr -d '\r\n'
}

list_files() {
  local f
  for f in "$DB_DIR"/*.sql; do
    [ -e "$f" ] || continue
    basename "$f"
  done | sort
}

file_checksum() {
  sha256sum "$DB_DIR/$1" | awk '{print $1}'
}

cmd_status() {
  need_container
  load_env
  local applied_file total pending
  applied_file="$(mktemp)"
  if [ -n "$(tracking_exists)" ]; then
    mysql_query "SELECT filename FROM schema_migrations ORDER BY filename;" | tr -d '\r' >"$applied_file"
  else
    : >"$applied_file"
  fi
  total=0
  pending=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    total=$((total + 1))
    if [ "$f" = "$SKIP_FILE" ]; then
      echo "[bo qua - fresh only] $f"
    elif grep -Fxq "$f" "$applied_file"; then
      echo "[da chay] $f"
    else
      echo "[cho] $f"
      pending=$((pending + 1))
    fi
  done < <(list_files)
  rm -f "$applied_file"
  log "Tong $total file, con $pending chua chay."
}

run_one_file() {
  local f="$1"
  local tmp
  tmp="$(mktemp)"
  if tr -d '\r' < "$DB_DIR/$f" | docker exec -i "$MYSQL_CONTAINER" sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 "$MYSQL_DATABASE"' >"$tmp" 2>&1; then
    rm -f "$tmp"
    return 0
  fi
  echo "--- loi khi chay $f ---" >&2
  tail -30 "$tmp" >&2
  rm -f "$tmp"
  return 1
}

record_applied() {
  local f="$1" sum="$2" esc
  esc="$(sql_escape "$f")"
  mysql_exec <<SQL >/dev/null
INSERT INTO schema_migrations (filename, checksum) VALUES ('$esc', '$sum');
SQL
}

cmd_run() {
  need_container
  load_env
  ensure_tracking
  local applied_file tbls applied_n
  applied_file="$(mktemp)"
  mysql_query "SELECT filename, checksum FROM schema_migrations ORDER BY filename;" | tr -d '\r' >"$applied_file"
  applied_n="$(grep -c . "$applied_file" || true)"
  tbls="$(mysql_query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> 'schema_migrations';" | tr -d '\r\n ')"
  if [ "$applied_n" = "0" ] && [ "$tbls" = "0" ]; then
    rm -f "$applied_file"
    die "DB trong. Dung datadir/lite de khoi tao, khong dung runner." 1
  fi
  if [ "$applied_n" = "0" ] && [ "$tbls" != "0" ] && [ "$FORCE" != "1" ]; then
    rm -f "$applied_file"
    echo "[migrate] DB da co du lieu nhung chua co tracking." >&2
    echo "[migrate] Chay: scripts/migrate.sh mark-all --yes (sau khi xac minh schema), roi chay lai." >&2
    exit 2
  fi
  local done_n=0 fail=0 f sum old
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    if grep -Fxq "$f" <(awk '{print $1}' "$applied_file"); then
      sum="$(file_checksum "$f")"
      old="$(awk -v k="$f" '$1==k {print $2}' "$applied_file")"
      if [ -n "$old" ] && [ "$old" != "$sum" ]; then
        log "Canh bao: $f da doi so voi luc chay."
      fi
      continue
    fi
    if [ "$f" = "$SKIP_FILE" ]; then
      log "Bo qua $f (chi dung khoi tao thu cong)."
      continue
    fi
    log "Chay $f ..."
    if run_one_file "$f"; then
      sum="$(file_checksum "$f")"
      record_applied "$f" "$sum"
      done_n=$((done_n + 1))
      log "Xong $f."
    else
      fail=1
      break
    fi
  done < <(list_files)
  rm -f "$applied_file"
  if [ "$fail" = "1" ]; then
    die "Dung lai do loi. Sua script roi chay lai." 1
  fi
  log "Hoan tat. Da chay them $done_n file."
}

cmd_mark_all() {
  [ "$YES" = "1" ] || die "can --yes de xac nhan" 1
  need_container
  load_env
  ensure_tracking
  local values="" f sum esc n=0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    sum="$(file_checksum "$f")"
    esc="$(sql_escape "$f")"
    if [ -n "$values" ]; then values="$values,"; fi
    values="$values('$esc','$sum')"
    n=$((n + 1))
  done < <(list_files)
  if [ -n "$values" ]; then
    mysql_exec <<SQL >/dev/null
INSERT INTO schema_migrations (filename, checksum) VALUES $values ON DUPLICATE KEY UPDATE checksum=VALUES(checksum);
SQL
  fi
  log "Da danh dau $n file."
}

cmd_mark() {
  [ -n "$FILE_ARG" ] || die "thieu ten file" 1
  local f sum esc
  f="$(basename "$FILE_ARG")"
  [ -f "$DB_DIR/$f" ] || die "khong thay $DB_DIR/$f" 1
  need_container
  load_env
  ensure_tracking
  sum="$(file_checksum "$f")"
  esc="$(sql_escape "$f")"
  mysql_exec <<SQL >/dev/null
REPLACE INTO schema_migrations (filename, checksum) VALUES ('$esc','$sum');
SQL
  log "Da danh dau $f."
}

cmd_unmark() {
  [ -n "$FILE_ARG" ] || die "thieu ten file" 1
  local f esc
  f="$(basename "$FILE_ARG")"
  esc="$(sql_escape "$f")"
  need_container
  load_env
  mysql_exec <<SQL >/dev/null
DELETE FROM schema_migrations WHERE filename='$esc';
SQL
  log "Da go $f."
}

case "$CMD" in
  status) cmd_status ;;
  run) cmd_run ;;
  mark-all) cmd_mark_all ;;
  mark) cmd_mark ;;
  unmark) cmd_unmark ;;
  *) usage ;;
esac

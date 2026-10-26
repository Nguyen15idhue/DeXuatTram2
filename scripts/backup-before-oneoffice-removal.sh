#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077

MYSQL_CONTAINER="${MYSQL_CONTAINER:-station-mysql}"
BACKUP_DIR="${BACKUP_DIR:-backups/pre-oneoffice-removal}"

running="$(docker inspect -f '{{.State.Running}}' "$MYSQL_CONTAINER" 2>/dev/null || echo false)"
[ "$running" = "true" ] || { echo "[backup] LOI: container $MYSQL_CONTAINER khong chay" >&2; exit 3; }

db="$(docker exec "$MYSQL_CONTAINER" printenv MYSQL_DATABASE 2>/dev/null | tr -d '\r\n' || true)"
pw="$(docker exec "$MYSQL_CONTAINER" printenv MYSQL_ROOT_PASSWORD 2>/dev/null | tr -d '\r\n' || true)"
[ -n "$db" ] && [ -n "$pw" ] || { echo "[backup] LOI: thieu MYSQL_DATABASE/MYSQL_ROOT_PASSWORD" >&2; exit 3; }

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
backup_file="$BACKUP_DIR/${db}-before-oneoffice-removal-${stamp}.sql.gz"

echo "[backup] Dang dump database $db tu $MYSQL_CONTAINER..."
docker exec "$MYSQL_CONTAINER" sh -c \
  'exec mysqldump --single-transaction --routines --triggers --events --hex-blob --default-character-set=utf8mb4 -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  | gzip -c >"$backup_file"

[ -s "$backup_file" ] || { echo "[backup] LOI: file backup rong: $backup_file" >&2; exit 1; }
gzip -t "$backup_file"
sha256sum "$backup_file" >"$backup_file.sha256"

echo "[backup] Backup da tao va kiem tra: $backup_file"
echo "[backup] SHA-256: $(cut -d' ' -f1 "$backup_file.sha256")"

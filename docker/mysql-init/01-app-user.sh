#!/usr/bin/env bash
if [ -z "${MYSQL_APP_USER:-}" ] || [ -z "${MYSQL_APP_PASSWORD:-}" ]; then
  echo "[init] MYSQL_APP_USER/MYSQL_APP_PASSWORD chua dat, bo qua tao user app."
  exit 0
fi

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
CREATE USER IF NOT EXISTS '${MYSQL_APP_USER}'@'%' IDENTIFIED BY '${MYSQL_APP_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_APP_USER}'@'%';
FLUSH PRIVILEGES;
EOSQL

echo "[init] Da tao user MySQL '${MYSQL_APP_USER}' cho database '${MYSQL_DATABASE}'."

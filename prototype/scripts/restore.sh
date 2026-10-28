#!/bin/sh
set -eu
backup_path=${1:?Usage: scripts/restore.sh /absolute/path/lumio.dump empty_database_name}
restore_database=${2:?Provide a separate empty restore database name}
case "$restore_database" in lumio|*[!a-zA-Z0-9_]*|'') echo 'Use a separate database with a simple identifier' >&2; exit 1 ;; esac
docker compose exec -T db createdb -U lumio "$restore_database"
docker compose exec -T db pg_restore --exit-on-error --no-owner -U lumio -d "$restore_database" < "$backup_path"
echo "Restored into separate database $restore_database"

#!/bin/sh
set -eu
umask 077
backup_path=${1:?Usage: scripts/backup.sh /absolute/path/lumio.dump}
case "$backup_path" in /*) ;; *) echo 'Use an absolute backup path' >&2; exit 1 ;; esac
if [ -e "$backup_path" ]; then echo 'Backup path already exists' >&2; exit 1; fi
temporary=$(mktemp "${backup_path}.tmp.XXXXXX")
trap 'rm -f "$temporary"' 0 HUP INT TERM
docker compose exec -T db pg_dump -U lumio -d lumio -Fc > "$temporary"
ln "$temporary" "$backup_path"
echo "Backup written to $backup_path"

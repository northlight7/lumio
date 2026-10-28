#!/bin/sh
set -eu
# File-backed Compose secrets retain host ownership. Copy them privately before dropping privileges.
umask 077
secret_directory=$(mktemp -d /tmp/lumio-secrets.XXXXXX)
if [ -n "${POSTGRES_PASSWORD_FILE:-}" ]; then
    cp "$POSTGRES_PASSWORD_FILE" "$secret_directory/db_password"
    export POSTGRES_PASSWORD_FILE="$secret_directory/db_password"
fi
if [ -n "${DEEPSEEK_API_KEY_FILE:-}" ]; then
    cp "$DEEPSEEK_API_KEY_FILE" "$secret_directory/deepseek_key"
    export DEEPSEEK_API_KEY_FILE="$secret_directory/deepseek_key"
fi
if [ -n "${APP_DB_PASSWORD_FILE:-}" ]; then
    cp "$APP_DB_PASSWORD_FILE" "$secret_directory/app_db_password"
    export APP_DB_PASSWORD_FILE="$secret_directory/app_db_password"
fi
chown -R 1001:1001 "$secret_directory"
exec su-exec 1001:1001 "$@"

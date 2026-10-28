#!/bin/sh
set -eu
project_directory=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_directory"
node scripts/setup-local.mjs
if docker compose version >/dev/null 2>&1; then
    docker compose -f compose.dev.yaml -p lumio-dev up -d --wait
elif [ -x ../.internal/tools/docker-compose ]; then
    ../.internal/tools/docker-compose -f compose.dev.yaml -p lumio-dev up -d --wait
else
    echo 'Install the Docker Compose plugin before starting Lumio.' >&2
    exit 1
fi
if [ ! -d node_modules ]; then npm ci; fi
node --env-file=.env.local scripts/migrate.mjs
echo 'Lumio is opening at http://localhost:3100'
exec npm run dev -- --port 3100

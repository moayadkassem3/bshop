#!/usr/bin/env bash
# Test deployment on Render: the backend and the website run in one service.
# The website listens on Render's $PORT and forwards /api/* to the backend on 3000.
set -euo pipefail
cd "$(dirname "$0")/.."

# Database tables, the platform admin, and the two demo salons; each step skips what already exists.
npm run seed --workspace apps/api
npm run seed:demo --workspace apps/api

PORT=3000 npm run start --workspace apps/api &
WEB_PORT="${PORT:-3001}"
PORT="$WEB_PORT" npm run start --workspace apps/web &

# If either stops, stop the service so Render restarts it.
wait -n
exit 1

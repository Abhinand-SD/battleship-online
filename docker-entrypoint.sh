#!/bin/sh
set -e
cd /app/packages/server
if [ -n "$DATABASE_URL" ]; then
  echo "Applying database migrations…"
  npx prisma migrate deploy
else
  echo "DATABASE_URL not set: starting with the in-memory store (data is not persisted)."
fi
exec node dist/index.js

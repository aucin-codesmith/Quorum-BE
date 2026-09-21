#!/bin/sh
set -e

echo "Applying database migrations..."
node src/db/migrate.js

# Demo data for local use. Leave SEED_ON_START unset (or false) for real deployments.
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "Seeding demo data (skipped if users already exist)..."
  node src/db/seed.js
fi

exec "$@"

#!/usr/bin/env bash
# Creates a local PostgreSQL role + databases for development and tests.
# Requires a running PostgreSQL server and sudo access to the `postgres` OS user (or run as a superuser).
set -euo pipefail
ROLE="${DB_ROLE:-battleship}"
PASS="${DB_PASSWORD:-battleship}"
DB="${DB_NAME:-battleship}"
TEST_DB="${DB_TEST_NAME:-battleship_test}"

run_psql() {
  if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 "$@"
  else
    psql -U postgres -v ON_ERROR_STOP=1 "$@"
  fi
}

run_psql -tc "SELECT 1 FROM pg_roles WHERE rolname = '$ROLE'" | grep -q 1 || \
  run_psql -c "CREATE ROLE \"$ROLE\" WITH LOGIN PASSWORD '$PASS';"
for name in "$DB" "$TEST_DB"; do
  run_psql -tc "SELECT 1 FROM pg_database WHERE datname = '$name'" | grep -q 1 || \
    run_psql -c "CREATE DATABASE \"$name\" OWNER \"$ROLE\";"
done
echo "Local databases ready:"
echo "  DATABASE_URL=postgresql://$ROLE:$PASS@localhost:5432/$DB"
echo "  TEST_DATABASE_URL=postgresql://$ROLE:$PASS@localhost:5432/$TEST_DB"

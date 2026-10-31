#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT/docker-compose.production.yml"
ENV_FILE="$ROOT/deploy/.env"
BACKUP="${1:-}"

if [[ -z "$BACKUP" || ! -f "$BACKUP" ]]; then
  echo "Usage: bash deploy/restore-full-database.sh /private/path/locatium.dump" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing deploy/.env. Copy deploy/.env.example and fill it first." >&2
  exit 1
fi

cd "$ROOT"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" up -d --build db redis

echo "Waiting for PostgreSQL..."
until docker compose --env-file "$ENV_FILE" -f "$COMPOSE" exec -T db \
  pg_isready -U locatium -d locatium >/dev/null 2>&1; do
  sleep 2
done

echo "Restoring the full private PostGIS backup..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" exec -T db \
  pg_restore \
    --username=locatium \
    --dbname=locatium \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --exit-on-error \
    <"$BACKUP"

echo "Applying idempotent application migrations..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" --profile tools run --rm migrate

echo "Provisioning admin and credential-free demo identities..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" --profile tools run --rm bootstrap

echo "Starting the complete stack..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" up -d --build
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" ps

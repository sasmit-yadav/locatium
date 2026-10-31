#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/deploy/.env"
COMPOSE="$ROOT/docker-compose.production.yml"
BACKUP_DIR="${BACKUP_DIR:-$HOME/locatium-backups}"
KEEP_DAYS="${KEEP_DAYS:-7}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
OUTPUT="$BACKUP_DIR/locatium-$(date -u +%Y%m%d-%H%M%S).dump"
TEMP_OUTPUT="${OUTPUT}.partial"
trap 'rm -f "$TEMP_OUTPUT"' EXIT

cd "$ROOT"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE" exec -T db \
  pg_dump \
    --username=locatium \
    --dbname=locatium \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    >"$TEMP_OUTPUT"

mv "$TEMP_OUTPUT" "$OUTPUT"
chmod 600 "$OUTPUT"
trap - EXIT
find "$BACKUP_DIR" -type f -name 'locatium-*.dump' -mtime "+$KEEP_DAYS" -delete
echo "Backup created: $OUTPUT"

#!/bin/bash
# Sync Supabase → local Docker PostgreSQL (dev only, read-only from Supabase)
# Usage: ./scripts/sync-dev-db.sh
set -euo pipefail

SOURCE_URL="${SOURCE_DATABASE_URL:-$(grep '^DATABASE_URL=' server/.env | cut -d= -f2-)}"
LOCAL_URL="postgres://paperclip:paperclip@localhost:5432/paperclip"
LOCAL_CONTAINER="${LOCAL_DB_CONTAINER:-docker-db-1}"

if [ -z "$SOURCE_URL" ]; then
  echo "ERROR: No DATABASE_URL found in server/.env and SOURCE_DATABASE_URL is not set."
  exit 1
fi

echo "→ Dumping from Supabase..."
DUMP_FILE=$(mktemp /tmp/paperclip-dev-dump.XXXXXX.sql)
trap 'rm -f "$DUMP_FILE"' EXIT

pg_dump "$SOURCE_URL" \
  --no-owner --no-acl \
  --no-privileges \
  --format=plain \
  --quote-all-identifiers \
  > "$DUMP_FILE"

echo "→ Resetting local Docker DB..."
docker exec "$LOCAL_CONTAINER" \
  psql -U paperclip -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" paperclip

echo "→ Restoring dump to local DB..."
docker exec -i "$LOCAL_CONTAINER" \
  psql -U paperclip paperclip < "$DUMP_FILE"

echo "✓ Local DB synced from Supabase ($(du -sh "$DUMP_FILE" | cut -f1))"

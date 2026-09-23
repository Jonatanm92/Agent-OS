#!/bin/sh
# Nightly backup of the Jarful store. Example cron: 15 3 * * * /app/scripts/backup.sh
# Keeps 14 daily copies next to the live file.
set -eu
DB="${JARFUL_DB:-/data/db.json}"
DIR="$(dirname "$DB")/backups"
mkdir -p "$DIR"
cp "$DB" "$DIR/db-$(date -u +%Y-%m-%d).json"
ls -1t "$DIR"/db-*.json | tail -n +15 | xargs -r rm --

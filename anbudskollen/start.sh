#!/usr/bin/env sh
# Startar Anbudskollen lokalt: http://localhost:3020
set -e
cd "$(dirname "$0")"
[ -f .env ] || { cp .env.example .env; echo "Skapade .env – fyll i ANTHROPIC_API_KEY och ADMIN_TOKEN för full funktion."; }
[ -d node_modules ] || npm ci
exec node src/server.mjs

#!/usr/bin/env sh
set -eu

HOST="${REVENUE_OS_HOST:-127.0.0.1}"
TOKEN="${REVENUE_OS_TOKEN:-}"

if [ "$HOST" != "127.0.0.1" ] && [ -z "$TOKEN" ]; then
  echo "Refusing a non-local bind without REVENUE_OS_TOKEN." >&2
  exit 1
fi

cd "$(dirname "$0")"
exec node ./server.mjs

#!/usr/bin/env sh
# Starts Life OS on http://127.0.0.1:3020 (set LIFE_OS_HOST=0.0.0.0 and
# LIFE_OS_TOKEN to reach it from your phone over Tailscale).
cd "$(dirname "$0")" && exec node server.mjs

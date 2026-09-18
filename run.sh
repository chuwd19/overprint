#!/usr/bin/env bash
# Serve Overprint locally. ES modules need a real origin, so file:// won't do.
set -euo pipefail
PORT="${1:-8123}"
cd "$(dirname "$0")"
echo "Overprint → http://localhost:$PORT"
(sleep 0.6 && open "http://localhost:$PORT") &
exec python3 -m http.server "$PORT" --bind 127.0.0.1

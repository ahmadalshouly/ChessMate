#!/usr/bin/env bash
# Screenshots of the Watch screens from a web build, with sample data.
#   scripts/watch-screenshots/run.sh <dist-dir> <out-dir>
# Needs python3 and Google Chrome. The build's server URL ($EXPO_PUBLIC_SERVER_URL)
# is pointed at the local stand-in server.
set -euo pipefail
DIST_IN=$1
OUT=$2
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(mktemp -d)
cp -r "$DIST_IN" "$WORK/dist"
mkdir -p "$OUT"

URL=${EXPO_PUBLIC_SERVER_URL:-wss://chessmate-server.fly.dev/ws}
HOST=$(echo "$URL" | sed -E 's#^wss?://([^/]+).*#\1#')
# Point the bundle at the local server (WebSocket and HTTP forms of the address).
grep -rl "$HOST" "$WORK/dist" | while read -r f; do
  sed -i -e "s#wss://$HOST#ws://127.0.0.1:8099#g" -e "s#https://$HOST#http://127.0.0.1:8099#g" -e "s#$HOST#127.0.0.1:8099#g" "$f"
done

python3 "$HERE/mock_server.py" "$WORK/dist" &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -sf http://127.0.0.1:8099/api/watch/me >/dev/null && break; sleep 0.2; done

CHROME=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
shot() { # name width height scale path
  local url="http://127.0.0.1:8099$5"
  # Phones: inside a frame of the phone's width (Chrome's window has a minimum width).
  if [ "$2" -lt 600 ]; then url="http://127.0.0.1:8099/__phone?w=$2&h=$3&p=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$5")"; fi
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor="$4" \
    --window-size="$2,$3" --virtual-time-budget=12000 --screenshot="$OUT/$1.png" "$url" >/dev/null 2>&1 || true
  echo "captured $1"
}
shot mobile-1-watch 430 1400 2 /watch
shot mobile-6-puzzles 430 1700 2 /puzzles
shot mobile-2-event-games 430 1700 2 /watch/events/berlin
shot mobile-3-event-standings 430 1400 2 "/watch/events/berlin?tab=standings"
shot mobile-4-event-news 430 1100 2 "/watch/events/berlin?tab=news"
shot mobile-5-game 430 1100 2 /watch/game/g30
shot mobile-6-streamers 430 1000 2 /watch/streamers
shot desktop-1-watch 1366 1100 1 /watch
shot desktop-2-event-games 1366 1300 1 /watch/events/berlin
shot desktop-3-game 1366 900 1 /watch/game/g30
shot desktop-4-analysis-1366 1366 768 1 /analysis
shot desktop-5-analysis-1920 1920 1080 1 /analysis
shot desktop-6-watch-game-1920 1920 1080 1 /watch/game/g30
shot desktop-7-finished-game 1366 900 1 /watch/game/g34
shot desktop-8-puzzles 1366 1100 1 /puzzles
ls -la "$OUT"

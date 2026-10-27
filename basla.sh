#!/data/data/com.termux/files/usr/bin/bash
# Adana Hat Rehberi'ni yerel tarayıcıda açar.
cd "$(dirname "$0")/www" || exit 1
PORT="${1:-8080}"
echo "Adana Hat Rehberi: http://localhost:$PORT"
python3 -m http.server "$PORT"

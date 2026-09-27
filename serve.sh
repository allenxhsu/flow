#!/bin/sh
# Serve Flow on http://localhost:8201 (ES modules need http://, not file://).
# Every response carries Cache-Control: no-store, so an edited module shows on
# the next reload instead of a heuristically cached copy.
#   ./serve.sh [port]
PORT="${1:-${PORT:-8201}}"
cd "$(dirname "$0")" || exit 1
echo "Flow → http://localhost:$PORT"
exec python3 - "$PORT" <<'PY'
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2'}
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, fmt, *args):
        pass

ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
PY

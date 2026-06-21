#!/usr/bin/env python3
"""Static file server for Orbitals with caching disabled.

`python3 -m http.server` caches files in the browser, so edits to JS/HTML
don't show up on a plain reload. This server adds no-store headers so every
load of http://localhost:8080 always fetches the newest file — no ?v= needed.

Usage:
    python3 serve.py            # serves this directory on port 8080
    python3 serve.py 9000       # custom port
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    # Bind on all interfaces so both localhost (IPv4) and ::1 (IPv6) resolve here.
    server = HTTPServer(("0.0.0.0", port), NoCacheHandler)
    print(f"Orbitals serving (no-cache) on http://localhost:{port}/  —  Ctrl+C to stop")
    server.serve_forever()

import http.server
import socketserver
import webbrowser
import threading
import os
from pathlib import Path

PORT = 8000
HOST = "127.0.0.1"

# Always serve from the folder this file lives in
ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Helps avoid cached JS/CSS while testing locally
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

url = f"http://{HOST}:{PORT}/"

with ReusableTCPServer((HOST, PORT), Handler) as httpd:
    print("Village Vibes local server")
    print(f"Serving: {ROOT}")
    print(f"Opening: {url}")
    print("Press Ctrl+C to stop the server.")

    threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

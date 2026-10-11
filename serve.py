import http.server
import socketserver
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.css': 'text/css',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def main():
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler) as server:
        url = 'http://localhost:%d/' % PORT
        print('Game is running at ' + url)
        print('Press Ctrl+C to stop')
        threading.Timer(0.6, webbrowser.open, args=(url,)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print('Stopped')


if __name__ == '__main__':
    main()

import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, format, *args):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8098
server = ThreadingHTTPServer(('', port), NoCacheHandler)
server.daemon_threads = True
server.serve_forever()

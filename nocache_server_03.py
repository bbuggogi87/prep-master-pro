import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

TARGET_DIR = r"F:\2 Share\OneDrive\3 Entertainment\5 운동방식 Workout\03 운동정리 프로그램_어플\www"

class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=TARGET_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, format, *args):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8150
server = ThreadingHTTPServer(('', port), NoCacheHandler)
server.daemon_threads = True
server.serve_forever()

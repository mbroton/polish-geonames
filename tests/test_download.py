from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
import unittest

from scripts.build_data import download

PAYLOAD = b"official PRNG archive bytes"


class Server:
    def __init__(self, hanging_requests):
        self.requests = 0
        self.release = threading.Event()
        server = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                server.requests += 1
                if server.requests <= hanging_requests:
                    server.release.wait(5)
                    return
                self.send_response(200)
                self.send_header("Content-Length", str(len(PAYLOAD)))
                self.end_headers()
                self.wfile.write(PAYLOAD)

            def log_message(self, *args):
                pass

        self.http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.http.server_port}/PRNG_MIEJSCOWOSCI_GML.zip"

    def __enter__(self):
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        return self

    def __exit__(self, *args):
        self.release.set()
        self.http.shutdown()
        self.http.server_close()


class DownloadTests(unittest.TestCase):
    def test_retries_after_the_server_stops_responding(self):
        with Server(hanging_requests=1) as server, tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "source.zip"
            download(server.url, target, timeout=0.5, wait=0)
            self.assertEqual(target.read_bytes(), PAYLOAD)
            self.assertEqual(server.requests, 2)

    def test_fails_when_every_attempt_times_out(self):
        with Server(hanging_requests=3) as server, tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(OSError):
                download(server.url, Path(folder) / "source.zip", timeout=0.5, wait=0)
            self.assertEqual(server.requests, 3)


if __name__ == "__main__":
    unittest.main()

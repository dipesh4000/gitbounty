"""A stand-in for GitHub's REST API, for the end-to-end test.

The end-to-end test drives the real backend, the real database and the real website. The one thing it
cannot drive is github.com: that needs an account, a token, and somebody to click Authorize. This serves
the handful of endpoints GitBounty calls, with data the test controls.

It is **not** a mock library: it is a real HTTP server the backend talks to over a socket, so the httpx
client, the headers, the pagination loop, the status handling and the JSON parsing are all the real code
paths. Only the far side of the socket is substituted.

The backend reaches it because `GITBOUNTY_ENVIRONMENT=test` lets `GITHUB_API_URL` be overridden; in any
other environment that setting is ignored and the real host is used (see app/config.py).

State is driven over a control endpoint so one test can move a pull request through its lifecycle:

    POST /__control__/state   {"pulls": [...], "issues": [...], "reviews": {...}}
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("FAKE_GITHUB_PORT", "8099"))
OWNER = "e2e-maintainer"
REPO = f"{OWNER}/widgets"

#: Mutable, set by the control endpoint. The defaults are an empty account.
STATE: dict = {
    "repositories": [],
    "issues": [],
    "pulls": [],
    "reviews": {},
    "files": {},
}


def repository(**overrides) -> dict:
    base = {
        "id": 777001,
        "full_name": REPO,
        "name": "widgets",
        "private": False,
        "archived": False,
        "owner": {"login": OWNER, "type": "User"},
        "permissions": {"admin": True, "maintain": True, "push": True},
        "language": "TypeScript",
        "description": "A repository used by the end-to-end test",
        "stargazers_count": 12,
        "created_at": "2026-01-01T00:00:00Z",
        "has_issues": True,
        "open_issues_count": 2,
    }
    return {**base, **overrides}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args) -> None:  # noqa: D102 - quiet; the test's output is what matters
        return

    def _send(self, payload, status: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # --- control -----------------------------------------------------------

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler's naming
        parsed = urlparse(self.path)
        if parsed.path == "/__control__/state":
            length = int(self.headers.get("Content-Length", "0"))
            STATE.update(json.loads(self.rfile.read(length) or "{}"))
            self._send({"ok": True})
            return
        if parsed.path == "/__control__/reset":
            STATE.update({"repositories": [], "issues": [], "pulls": [], "reviews": {}, "files": {}})
            self._send({"ok": True})
            return
        self._send({"message": "Not Found"}, 404)

    # --- the GitHub endpoints GitBounty actually calls -----------------------

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        page = int(query.get("page", ["1"])[0])

        if path == "/__control__/health":
            self._send({"ok": True})
            return

        # Every repository the signed-in user can administer.
        if path == "/user/repos":
            self._send(STATE["repositories"] if page == 1 else [])
            return

        # One repository.
        if path.startswith("/repos/") and path.count("/") == 3:
            full_name = path[len("/repos/"):]
            for repo in STATE["repositories"]:
                if repo["full_name"].casefold() == full_name.casefold():
                    self._send(repo)
                    return
            self._send({"message": "Not Found"}, 404)
            return

        # A repository's open issues.
        if path.endswith("/issues") and path.startswith("/repos/"):
            self._send(STATE["issues"] if page == 1 else [])
            return

        # A pull request's changed files and its reviews.
        if path.startswith("/repos/") and path.endswith("/files"):
            number = path.split("/pulls/")[1].split("/")[0]
            self._send(STATE["files"].get(number, []) if page == 1 else [])
            return
        if path.startswith("/repos/") and path.endswith("/reviews"):
            number = path.split("/pulls/")[1].split("/")[0]
            self._send(STATE["reviews"].get(number, []) if page == 1 else [])
            return

        # The pull request search.
        if path == "/search/issues":
            self._send({"items": STATE["pulls"] if page == 1 else [], "total_count": len(STATE["pulls"])})
            return

        self._send({"message": "Not Found"}, 404)


if __name__ == "__main__":
    print(f"fake github listening on http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()

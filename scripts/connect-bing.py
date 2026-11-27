#!/usr/bin/env python3
"""One-time Bing read-only OAuth setup in the user's Google Cloud Shell.

Official flow: https://learn.microsoft.com/en-us/bingwebmaster/oauth2
No credentials, authorization codes, API responses or site lists are logged.
Credential output is owner-only in Cloud Shell, never inside the checkout.
This does NOT install credentials into GitHub or enable scheduled collection.
"""
import datetime as dt
import getpass
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

TOKEN_URL = "https://www.bing.com/webmasters/oauth/token"
API_URL = "https://www.bing.com/webmaster/api.svc/json/GetUserSites"
SCOPE = "webmaster.read"


class SetupError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request_json(url, *, form=None, token=None):
    headers = {"Accept": "application/json"}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            payload = json.loads(response.read(1_000_000))
    except urllib.error.HTTPError as exc:
        raise SetupError("Bing request failed (HTTP " + str(exc.code) + "); response withheld") from None
    except (OSError, ValueError):
        raise SetupError("Bing response could not be read; details withheld") from None
    if not isinstance(payload, dict) or "error" in payload:
        raise SetupError("Bing returned an unsuccessful response; details withheld")
    return payload


def save_credentials(path, payload):
    directory = path.parent
    if directory.is_symlink() or path.is_symlink():
        raise SetupError("Refusing a symbolic-link credential destination")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    directory.chmod(0o700)
    fd, temporary = tempfile.mkstemp(prefix=".bing-", dir=directory)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(payload, stream)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def exchange_and_verify(code, client_id, client_secret, redirect_uri, destination):
    response = request_json(TOKEN_URL, form={"client_id": client_id, "client_secret": client_secret, "code": code, "grant_type": "authorization_code", "redirect_uri": redirect_uri})
    access = response.get("access_token")
    refresh = response.get("refresh_token")
    if not isinstance(access, str) or not access or not isinstance(refresh, str) or not refresh:
        raise SetupError("Required tokens missing; no credentials saved")
    granted = str(response.get("scope", SCOPE)).lower().split()
    if any(scope != SCOPE for scope in granted):
        raise SetupError("Unexpected granted scope; no credentials saved")
    # Retain a successful authorization even if the subsequent API test fails.
    save_credentials(destination, {"client_id": client_id, "client_secret": client_secret, "refresh_token": refresh, "redirect_uri": redirect_uri, "scope": SCOPE, "authorized_at_utc": dt.datetime.now(dt.timezone.utc).isoformat()})
    sites = request_json(API_URL, token=access).get("d")
    if not isinstance(sites, list):
        raise SetupError("Credentials saved privately, but Bing site-list test failed; not connected")
    matching = [entry for entry in sites if isinstance(entry, dict) and urllib.parse.urlsplit(entry.get("Url", "")).hostname in {"wisemainecoon.com", "www.wisemainecoon.com"} and entry.get("IsVerified") is True]
    if not matching:
        raise SetupError("Credentials saved privately, but verified Wise Maine Coon access was not established")


def handler_for(state, exchange, result):
    class Callback(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Default logging would expose the authorization code in the URL.

        def reply(self, status, message):
            body = message.encode()
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            parsed = urllib.parse.urlsplit(self.path)
            if parsed.path != "/bing/callback":
                self.reply(404, "Not found")
                return
            if not parsed.query:
                self.reply(200, "Callback ready. Continue using the Bing authorization link printed in Cloud Shell.")
                return
            query = urllib.parse.parse_qs(parsed.query)
            received = query.get("state", [])
            if len(received) != 1 or not secrets.compare_digest(received[0], state):
                self.reply(400, "State validation failed. No code was processed.")
                return
            if result.get("finished"):
                self.reply(409, "This authorization session has already finished.")
                return
            result["finished"] = True
            if "error" in query or len(query.get("code", [])) != 1:
                result["error"] = "Authorization was denied or no valid code was returned"
                self.reply(400, result["error"])
                return
            try:
                exchange(query["code"][0])
                result["success"] = True
                self.reply(200, "Bing read-only access verified. Credentials saved privately in Cloud Shell. Return to ChatGPT; scheduled reporting still needs configuration.")
            except SetupError as exc:
                result["error"] = str(exc)
                self.reply(502, result["error"])
            except Exception:
                result["error"] = "Setup failed; sensitive details withheld"
                self.reply(500, result["error"])
    return Callback


def main():
    host = os.environ.get("WEB_HOST", "")
    if not host or not host.endswith(".cloudshell.dev") or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-" for c in host):
        raise SetupError("Run this helper in Google Cloud Shell with WEB_HOST available")
    if not sys.stdin.isatty():
        raise SetupError("Interactive terminal required for hidden credential entry")
    redirect_uri = "https://8080-" + host + "/bing/callback"
    print("Registered Redirect URI must match exactly:\n" + redirect_uri)
    if input("Does it match your Bing client? Type yes: ").strip().lower() != "yes":
        raise SetupError("Stopped; correct the registered URI before continuing")
    client_id = input("Bing OAuth Client ID: ").strip()
    client_secret = getpass.getpass("Bing OAuth Client Secret (hidden): ").strip()
    if not client_id or not client_secret:
        raise SetupError("Client ID and secret are required")
    state, result = secrets.token_urlsafe(32), {}
    destination = Path.home() / ".config" / "wmc-reporting" / "bing-oauth.json"
    exchange = lambda code: exchange_and_verify(code, client_id, client_secret, redirect_uri, destination)
    try:
        server = HTTPServer(("0.0.0.0", 8080), handler_for(state, exchange, result))
    except OSError:
        raise SetupError("Port 8080 is unavailable; stop its existing app before retrying") from None
    server.timeout = 1
    authorization = "https://www.bing.com/webmasters/oauth/authorize?" + urllib.parse.urlencode({"response_type": "code", "client_id": client_id, "redirect_uri": redirect_uri, "scope": SCOPE, "state": state})
    print("\nOpen this callback readiness check first:\n" + redirect_uri)
    print("\nThen open this Bing link and approve View/read access only:\n" + authorization)
    print("\nWaiting up to 10 minutes. Keep this Cloud Shell running. Do not share the returned callback URL or credentials.", flush=True)
    deadline = time.monotonic() + 600
    try:
        while not result.get("finished") and time.monotonic() < deadline:
            server.handle_request()
    finally:
        server.server_close()
    if result.get("success"):
        print("SUCCESS: Bing read-only access verified; credentials saved privately. Scheduled reporting is not enabled yet.")
        return 0
    if result.get("error"):
        raise SetupError(result["error"])
    raise SetupError("Authorization timed out; no successful connection established")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (SetupError, KeyboardInterrupt) as exc:
        print("STOPPED: " + (str(exc) or "Cancelled"), file=sys.stderr)
        sys.exit(1)

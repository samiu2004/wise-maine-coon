"""Read-only connection probe. Never print tokens, reports or response bodies.

The repository and its Actions logs are public. No analytics are written to
files, artifacts, commits or job summaries. Daily collection requires a private
destination and is intentionally not scheduled by this connection probe.
"""

import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


class ProbeError(Exception):
    pass


def request_json(token, url, body=None):
    payload = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        url, data=payload,
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        # Deliberately do not read or print the response body.
        raise ProbeError("Google returned HTTP " + str(exc.code)) from None
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise ProbeError("Network timeout, connection error or invalid response") from None


def check_gsc(token):
    sites = request_json(token, "https://www.googleapis.com/webmasters/v3/sites")
    available = {entry.get("siteUrl") for entry in sites.get("siteEntry", [])}
    candidates = ["sc-domain:wisemainecoon.com", "https://www.wisemainecoon.com/"]
    site = next((candidate for candidate in candidates if candidate in available), None)
    if site is None:
        raise ProbeError("Expected Wise Maine Coon property is not accessible")
    end = dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=3)
    start = end - dt.timedelta(days=6)
    url = "https://www.googleapis.com/webmasters/v3/sites/" + urllib.parse.quote(site, safe="") + "/searchAnalytics/query"
    result = request_json(token, url, {
        "startDate": start.isoformat(), "endDate": end.isoformat(),
        "type": "web", "dataState": "final", "rowLimit": 1,
    })
    if not isinstance(result, dict) or "error" in result:
        raise ProbeError("Unexpected Search Console response")
    # A successful response with no rows is valid, not a connection failure.


def check_ga4(token):
    result = request_json(token, "https://analyticsdata.googleapis.com/v1beta/properties/549214960:runReport", {
        "dateRanges": [{"startDate": "7daysAgo", "endDate": "yesterday"}],
        "metrics": [{"name": "sessions"}],
        "limit": "1",
    })
    if not isinstance(result, dict) or not result.get("metricHeaders") or "error" in result:
        raise ProbeError("Unexpected GA4 response")


def main():
    token = os.environ.get("WMC_GOOGLE_ACCESS_TOKEN")
    if not token:
        print("FAIL: missing short-lived Google token")
        return 1
    failed = False
    for name, check in [("Search Console", check_gsc), ("GA4", check_ga4)]:
        try:
            check(token)
            print(name + ": read-only API access verified")
        except ProbeError as exc:
            failed = True
            print(name + ": FAIL: " + str(exc))
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())

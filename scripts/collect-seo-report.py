"""Collect read-only Google reports into one explicitly authorized private sheet.

No report, credentials or API response bodies are printed, saved to disk,
committed, uploaded as Actions artifacts, or included in public job summaries.
Only the Reports tab and collection-status cells of the destination are written.
Source data is gathered in memory before replacing the previous snapshot.
"""
import datetime as dt
import importlib.util
import json
import math
import os
from pathlib import Path
import sys
import urllib.parse

spec = importlib.util.spec_from_file_location("wmc_probe", Path(__file__).with_name("check-reporting-access.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
request_json, ProbeError = probe.request_json, probe.ProbeError

SHEET_ID = "1BEwbf2B7g0XH-nJoYW09gke2zGt_OvpJEIpxhsm8rUo"
SHEETS = "https://sheets.googleapis.com/v4/spreadsheets/" + SHEET_ID
HEADERS = ["Dataset", "Period start", "Period end", "Country filter", "Dimensions", "Metric", "Value", "Collected at UTC", "Source"]
GA_METRICS = ["sessions", "engagedSessions", "engagementRate", "userEngagementDuration", "activeUsers"]
EPOCH = dt.date(1899, 12, 30)


def serial_date(value):
    return (value - EPOCH).days


def periods(today):
    # Common comparison dates, excluding the newest three calendar days.
    # GSC uses Pacific dates; GA4 retains the property's configured timezone.
    end = today - dt.timedelta(days=3)
    result = []
    for days in (7, 28):
        start = end - dt.timedelta(days=days - 1)
        result.append((str(days) + "d_current", start, end))
        result.append((str(days) + "d_previous", start - dt.timedelta(days=days), start - dt.timedelta(days=1)))
    return result


def metric_rows(dataset, start, end, geo, dimensions, metrics, collected, source):
    result = []
    dims = json.dumps(dimensions, ensure_ascii=False, sort_keys=True)
    for key, value in metrics.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ProbeError("Invalid numeric metric; previous snapshot retained")
        result.append([dataset, serial_date(start), serial_date(end), geo, dims, key, value, collected, source])
    return result


def collect(token, now):
    collected = (now - dt.datetime(1899, 12, 30, tzinfo=dt.timezone.utc)).total_seconds() / 86400
    sites = request_json(token, "https://www.googleapis.com/webmasters/v3/sites")
    available = {entry.get("siteUrl") for entry in sites.get("siteEntry", [])}
    site = next((s for s in ["sc-domain:wisemainecoon.com", "https://www.wisemainecoon.com/"] if s in available), None)
    if site is None:
        raise ProbeError("Wise Maine Coon Search Console property unavailable")
    gsc_url = "https://www.googleapis.com/webmasters/v3/sites/" + urllib.parse.quote(site, safe="") + "/searchAnalytics/query"
    ga_url = "https://analyticsdata.googleapis.com/v1beta/properties/549214960:runReport"
    output = [HEADERS]
    for label, start, end in periods(now.date()):
        for geo in ("All", "US"):
            for name, dims, limit in [("totals", [], 1), ("pages", ["page"], 500), ("queries", ["query"], 500), ("page_queries", ["page", "query"], 1000)]:
                body = {"startDate": start.isoformat(), "endDate": end.isoformat(), "dimensions": dims, "type": "web", "dataState": "final", "rowLimit": limit}
                if geo == "US":
                    body["dimensionFilterGroups"] = [{"filters": [{"dimension": "country", "operator": "equals", "expression": "usa"}]}]
                response = request_json(token, gsc_url, body)
                if not isinstance(response, dict) or "error" in response:
                    raise ProbeError("Unexpected GSC response; previous snapshot retained")
                rows = response.get("rows", [])
                source = "GSC Web final; " + site + "; top-row limit=" + str(limit) + "; cap_reached=" + str(bool(dims) and len(rows) >= limit).lower()
                if not rows:
                    # Metadata, not a fabricated zero-traffic metric.
                    output += metric_rows("GSC " + label + " " + name, start, end, geo, {}, {"returned_rows": 0}, collected, source)
                for row in rows:
                    keys = row.get("keys", [])
                    if len(keys) != len(dims):
                        raise ProbeError("Unexpected GSC dimensions")
                    output += metric_rows("GSC " + label + " " + name, start, end, geo, dict(zip(dims, keys)), {k: row[k] for k in ["clicks", "impressions", "ctr", "position"]}, collected, source)
            for name, dims in [("totals", []), ("sources", ["sessionSource", "sessionMedium"]), ("landing_pages", ["landingPagePlusQueryString"])]:
                body = {"dateRanges": [{"startDate": start.isoformat(), "endDate": end.isoformat()}], "metrics": [{"name": k} for k in GA_METRICS], "limit": "500", "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}]}
                if dims:
                    body["dimensions"] = [{"name": k} for k in dims]
                if geo == "US":
                    body["dimensionFilter"] = {"filter": {"fieldName": "countryId", "stringFilter": {"matchType": "EXACT", "value": "US"}}}
                response = request_json(token, ga_url, body)
                if not isinstance(response, dict) or "error" in response or not response.get("metricHeaders"):
                    raise ProbeError("Unexpected GA4 response; previous snapshot retained")
                metadata = response.get("metadata", {})
                source = "GA4 549214960; timezone=" + metadata.get("timeZone", "property timezone") + "; row_count=" + str(response.get("rowCount", 0)) + "; limit=500; metadata=" + json.dumps(metadata, ensure_ascii=False, sort_keys=True)
                rows = response.get("rows", [])
                if not rows:
                    output += metric_rows("GA4 " + label + " " + name, start, end, geo, {}, {"returned_rows": 0}, collected, source)
                for row in rows:
                    keys = [v["value"] for v in row.get("dimensionValues", [])]
                    metrics = {h["name"]: float(v["value"]) for h, v in zip(response["metricHeaders"], row["metricValues"])}
                    if len(keys) != len(dims) or len(metrics) != len(GA_METRICS):
                        raise ProbeError("Unexpected GA4 columns")
                    output += metric_rows("GA4 " + label + " " + name, start, end, geo, dict(zip(dims, keys)), metrics, collected, source)
    return output


def save(token, rows, now):
    if len(rows) > 30000:
        raise ProbeError("Report exceeds the configured row bound; previous snapshot retained")
    meta = request_json(token, SHEETS + "?fields=sheets(properties)")
    tabs = {s["properties"]["title"]: s["properties"] for s in meta.get("sheets", [])}
    if "Reports" not in tabs or "Connection" not in tabs:
        raise ProbeError("Expected private destination tabs missing")
    reports = tabs["Reports"]
    old_size = reports["gridProperties"]["rowCount"]
    if len(rows) > old_size:
        request_json(token, SHEETS + ":batchUpdate", {"requests": [{"updateSheetProperties": {"properties": {"sheetId": reports["sheetId"], "gridProperties": {"rowCount": len(rows)}}, "fields": "gridProperties.rowCount"}}]})
    # Pad old rows with empty strings so a shorter replacement leaves no stale rows.
    values = rows + [[""] * len(HEADERS) for _ in range(max(0, old_size - len(rows)))]
    body = {"valueInputOption": "RAW", "data": [
        {"range": "Reports!A1:I" + str(len(values)), "values": values},
        {"range": "Connection!B8", "values": [["Snapshot saved " + now.isoformat(timespec="seconds")]]},
        {"range": "Connection!A11:B13", "values": [["Snapshot rows", len(rows) - 1], ["Reporting periods", "7 and 28 days versus preceding equal periods; through UTC date minus 3 days"], ["Interpretation", "GSC hides some queries and returns top rows; do not sum query rows into site totals. GA4 user engagement duration is total seconds, not average session time."]]},
    ]}
    if len(json.dumps(body).encode()) > 8000000:
        raise ProbeError("Report payload exceeds safe bound; previous snapshot retained")
    request_json(token, SHEETS + "/values:batchUpdate", body)
    request_json(token, SHEETS + ":batchUpdate", {"requests": [
        {"repeatCell": {"range": {"sheetId": reports["sheetId"], "startRowIndex": 1, "endRowIndex": len(rows), "startColumnIndex": 1, "endColumnIndex": 3}, "cell": {"userEnteredFormat": {"numberFormat": {"type": "DATE", "pattern": "yyyy-mm-dd"}}}, "fields": "userEnteredFormat.numberFormat"}},
        {"repeatCell": {"range": {"sheetId": reports["sheetId"], "startRowIndex": 1, "endRowIndex": len(rows), "startColumnIndex": 7, "endColumnIndex": 8}, "cell": {"userEnteredFormat": {"numberFormat": {"type": "DATE_TIME", "pattern": "yyyy-mm-dd hh:mm:ss"}}}, "fields": "userEnteredFormat.numberFormat"}},
        {"updateSpreadsheetProperties": {"properties": {"timeZone": "Asia/Karachi"}, "fields": "timeZone"}},
    ]})


def main():
    token = os.environ.get("WMC_GOOGLE_ACCESS_TOKEN")
    if not token:
        print("FAIL: missing short-lived Google token")
        return 1
    try:
        now = dt.datetime.now(dt.timezone.utc)
        rows = collect(token, now)
        save(token, rows, now)
        print("GSC and GA4 snapshot saved to the authorized private Google Sheet")
        return 0
    except ProbeError as exc:
        print("Report collection failed: " + str(exc))
        return 1
    except (KeyError, TypeError, ValueError):
        print("Report collection failed: unexpected response structure")
        return 1


if __name__ == "__main__":
    sys.exit(main())

"""ForexFactory's economic calendar — via the free JSON feed its own
embeddable widget runs on (nfs.faireconomy.media), not by scraping
forexfactory.com itself.

ForexFactory publishes no public API, and its terms have historically
prohibited scraping its pages. This feed is the redistribution channel it
set up for exactly this kind of third-party reuse, and needs no key or
login. No documented rate limit, but it is still fetched at most once per
run (src/run.py), not once per symbol/timeframe.

The exact field names below are the schema this feed has used for years
across the many free trading tools built on it, but this project's own
integration has not been checked against a live response — verify the
fields still match if events stop showing up.
"""

from datetime import datetime, timezone

import requests

BASE_URL = "https://nfs.faireconomy.media"
FEEDS = ("ff_calendar_thisweek.json", "ff_calendar_nextweek.json")
TIMEOUT = 10


def fetch_events():
    """Every scheduled event from this week and next, deduplicated, or []
    on any failure — a calendar that can't be reached is a reason to skip
    the event-risk gate for this run, not a reason to fail it. Both weeks
    are fetched so a check made near a week boundary still sees whatever
    is coming up next, not just what has already rolled off."""
    events = []
    seen = set()
    for feed in FEEDS:
        for row in _fetch_feed(feed):
            event = _parse(row)
            if event is None:
                continue
            key = (event["title"], event["country"], event["event_time"])
            if key in seen:
                continue
            seen.add(key)
            events.append(event)
    return events


def _fetch_feed(feed):
    try:
        response = requests.get(f"{BASE_URL}/{feed}", timeout=TIMEOUT)
        response.raise_for_status()
        rows = response.json()
        return rows if isinstance(rows, list) else []
    except Exception:
        return []


def _parse(row):
    """One event, or None for a row that doesn't have what this needs — a
    malformed entry is skipped rather than allowed to crash the whole feed."""
    try:
        return {
            "title": row["title"],
            "country": row["country"],
            "impact": row["impact"],
            "event_time": int(datetime.fromisoformat(row["date"]).astimezone(timezone.utc).timestamp()),
        }
    except (KeyError, TypeError, ValueError):
        return None

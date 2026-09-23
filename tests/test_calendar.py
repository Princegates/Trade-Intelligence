from src.ingest import calendar


class _Response:
    def __init__(self, rows=None, status_error=None):
        self._rows = rows or []
        self._status_error = status_error

    def raise_for_status(self):
        if self._status_error:
            raise self._status_error

    def json(self):
        return self._rows


ROW = {
    "title": "CPI m/m",
    "country": "USD",
    "impact": "High",
    "date": "2026-09-25T12:30:00-04:00",
    "forecast": "0.3%",
    "previous": "0.2%",
}


def _serve(monkeypatch, by_feed):
    """`by_feed` maps a feed filename to the rows it returns."""

    def fake_get(url, timeout):
        feed = url.rsplit("/", 1)[-1]
        return _Response(by_feed.get(feed, []))

    monkeypatch.setattr(calendar.requests, "get", fake_get)


def test_fetch_events_parses_a_row_into_epoch_utc(monkeypatch):
    _serve(monkeypatch, {"ff_calendar_thisweek.json": [ROW]})

    events = calendar.fetch_events()

    assert len(events) == 1
    assert events[0]["title"] == "CPI m/m"
    assert events[0]["country"] == "USD"
    assert events[0]["impact"] == "High"
    # 2026-09-25T12:30:00-04:00 == 2026-09-25 16:30:00 UTC
    assert events[0]["event_time"] == 1790353800
    assert events[0]["forecast"] == "0.3%"
    assert events[0]["previous"] == "0.2%"
    assert events[0]["actual"] is None  # not released yet


def test_a_released_actual_value_is_captured(monkeypatch):
    released = {**ROW, "actual": "0.4%"}
    _serve(monkeypatch, {"ff_calendar_thisweek.json": [released]})

    assert calendar.fetch_events()[0]["actual"] == "0.4%"


def test_missing_forecast_and_previous_do_not_drop_the_event(monkeypatch):
    bare = {"title": "Holiday", "country": "USD", "impact": "Low", "date": ROW["date"]}
    _serve(monkeypatch, {"ff_calendar_thisweek.json": [bare]})

    events = calendar.fetch_events()
    assert len(events) == 1
    assert events[0]["forecast"] is None
    assert events[0]["previous"] is None


def test_events_from_both_feeds_are_combined(monkeypatch):
    other = {**ROW, "title": "NFP", "date": "2026-10-02T08:30:00-04:00"}
    _serve(monkeypatch, {"ff_calendar_thisweek.json": [ROW], "ff_calendar_nextweek.json": [other]})

    titles = {e["title"] for e in calendar.fetch_events()}
    assert titles == {"CPI m/m", "NFP"}


def test_duplicate_events_across_feeds_are_not_repeated(monkeypatch):
    _serve(monkeypatch, {"ff_calendar_thisweek.json": [ROW], "ff_calendar_nextweek.json": [ROW]})

    assert len(calendar.fetch_events()) == 1


def test_a_malformed_row_is_skipped_not_fatal(monkeypatch):
    malformed = {"title": "Missing fields"}  # no country/impact/date
    _serve(monkeypatch, {"ff_calendar_thisweek.json": [malformed, ROW]})

    events = calendar.fetch_events()
    assert len(events) == 1
    assert events[0]["title"] == "CPI m/m"


def test_an_unparseable_date_is_skipped_not_fatal(monkeypatch):
    bad_date = {**ROW, "date": "not-a-date"}
    _serve(monkeypatch, {"ff_calendar_thisweek.json": [bad_date]})

    assert calendar.fetch_events() == []


def test_a_network_failure_returns_no_events_rather_than_raising(monkeypatch):
    def fake_get(url, timeout):
        raise ConnectionError("dns failure")

    monkeypatch.setattr(calendar.requests, "get", fake_get)

    assert calendar.fetch_events() == []


def test_an_http_error_status_is_treated_like_no_data(monkeypatch):
    def fake_get(url, timeout):
        return _Response(status_error=RuntimeError("503"))

    monkeypatch.setattr(calendar.requests, "get", fake_get)

    assert calendar.fetch_events() == []


def test_a_non_list_response_is_treated_as_empty(monkeypatch):
    def fake_get(url, timeout):
        return _Response(rows={"error": "rate limited"})

    monkeypatch.setattr(calendar.requests, "get", fake_get)

    assert calendar.fetch_events() == []

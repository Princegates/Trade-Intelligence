from src.signals import event_risk

HOUR = 3600
NOW = 1_700_000_000


def _event(country="USD", impact="High", event_time=NOW, title="CPI m/m"):
    return {"title": title, "country": country, "impact": impact, "event_time": event_time}


def test_blackout_before_a_release():
    events = [_event(event_time=NOW + 600)]  # 10 minutes from now
    assert event_risk.blackout(events, "USD", NOW, before_seconds=1800, after_seconds=3600) == events[0]


def test_blackout_after_a_release():
    events = [_event(event_time=NOW - 600)]  # 10 minutes ago
    assert event_risk.blackout(events, "USD", NOW, before_seconds=1800, after_seconds=3600) == events[0]


def test_no_blackout_outside_the_window():
    events = [_event(event_time=NOW - 2 * HOUR)]
    assert event_risk.blackout(events, "USD", NOW, before_seconds=1800, after_seconds=3600) is None


def test_no_blackout_for_a_different_currency():
    events = [_event(country="EUR", event_time=NOW)]
    assert event_risk.blackout(events, "USD", NOW, before_seconds=1800, after_seconds=3600) is None


def test_medium_and_low_impact_never_blackout():
    events = [_event(impact="Medium", event_time=NOW), _event(impact="Low", event_time=NOW)]
    assert event_risk.blackout(events, "USD", NOW, before_seconds=1800, after_seconds=3600) is None


def test_impact_match_is_case_insensitive():
    events = [_event(impact="HIGH", event_time=NOW)]
    assert event_risk.blackout(events, "USD", NOW, before_seconds=1800, after_seconds=3600) == events[0]


def test_empty_calendar_never_blacks_out():
    assert event_risk.blackout([], "USD", NOW, before_seconds=1800, after_seconds=3600) is None


def test_returns_the_first_matching_event_among_several():
    events = [_event(event_time=NOW - 10 * HOUR), _event(event_time=NOW, title="NFP")]
    result = event_risk.blackout(events, "USD", NOW, before_seconds=1800, after_seconds=3600)
    assert result["title"] == "NFP"

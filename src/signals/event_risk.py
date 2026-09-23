"""Whether `now` sits inside the blackout window around a scheduled
high-impact economic release for a currency.

A technically sound signal issued right before or right after a major
release is not evidence of anything — spread widens and price can spike in
either direction while the market digests the number, and a call made in
that window is a coin flip dressed up as a read (spec sections 6 and 13:
event risk lowers confidence and belongs in the false-signal filter, not the
confluence score itself).
"""


def blackout(events, currency, now, before_seconds, after_seconds):
    """The high-impact event `now` is inside the window for, or None.

    Only "High" impact matters here — Medium/Low fire many times a day and
    would leave gold quiet for no real reason. Case-insensitive: the exact
    casing of the impact field is not something this project controls.
    """
    for event in events:
        if event["country"] != currency:
            continue
        if event["impact"].lower() != "high":
            continue
        if event["event_time"] - before_seconds <= now <= event["event_time"] + after_seconds:
            return event
    return None

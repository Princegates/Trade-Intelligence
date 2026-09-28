import pytest

from src import funding

HOUR = 3600


def test_hourly_and_8_hourly_rates_come_out_on_the_same_scale():
    # 0.01% per 8 hours, as Binance (every 8h) and Kraken/Hyperliquid (hourly) report it.
    eight_hourly = funding.per_8h_percent([(i * 8 * HOUR, 0.0001) for i in range(4)])
    hourly = funding.per_8h_percent([(i * HOUR, 0.0001 / 8) for i in range(4)])
    assert [r for _, r in eight_hourly] == pytest.approx([0.01] * 4)
    assert [r for _, r in hourly] == pytest.approx([0.01] * 4)


def test_records_are_sorted_and_deduplicated():
    series = funding.per_8h_percent([(2 * HOUR, 0.0), (HOUR, 0.0), (2 * HOUR, 0.0), (3 * HOUR, 0.0)])
    assert [t for t, _ in series] == [HOUR, 2 * HOUR, 3 * HOUR]


def test_the_daily_average_only_sees_rates_already_paid():
    series = [(h * HOUR, float(h)) for h in range(48)]
    at = funding.daily_average(series)
    # At hour 30: the day after hour 6 up to and including hour 30 -> hours 7..30.
    assert at(30 * HOUR) == pytest.approx(sum(range(7, 31)) / 24)
    # Half an hour later nothing new has been paid.
    assert at(30 * HOUR + 1800) == at(30 * HOUR)
    assert at(-1) is None
    # A day after the last rate there's nothing left in the window.
    assert at(47 * HOUR + funding.WINDOW_SECONDS) is None


def test_the_first_source_with_believable_data_wins():
    def blocked(start):
        raise RuntimeError("451 Client Error: Unavailable For Legal Reasons")

    def wrong_units(start):  # e.g. an annualised rate read as per-period
        return [(i * HOUR, 0.1) for i in range(10)]

    def good(start):
        return [(i * HOUR, 0.0001 / 8) for i in range(10)]

    logs = []
    name, series = funding.fetch_history(0, [("A", blocked), ("B", wrong_units), ("C", good)], logs.append)
    assert name == "C"
    assert len(series) == 10
    assert any("A unavailable" in line for line in logs)
    assert any("B skipped" in line for line in logs)


def test_no_source_means_no_funding():
    assert funding.fetch_history(0, [("A", lambda start: [])], lambda line: None) == (None, [])

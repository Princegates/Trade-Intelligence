"""Plain-Python technical indicators — no numpy/pandas needed for this scale of data."""


def sma(values, period):
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def ema_series(values, period):
    """EMA for every point once the window fills. ema_series(v, p)[-k] lines up
    with values[-k], which is what the crossover checks below rely on."""
    if len(values) < period:
        return []
    k = 2 / (period + 1)
    ema_vals = [sum(values[:period]) / period]
    for price in values[period:]:
        ema_vals.append(price * k + ema_vals[-1] * (1 - k))
    return ema_vals


def ema(values, period):
    """Latest EMA value, or None without enough history. A thin convenience
    wrapper — ema_series does the real work and stays the source of truth for
    the alignment contract other callers (like divergence) depend on."""
    series = ema_series(values, period)
    return series[-1] if series else None


def _rsi_from_averages(avg_gain, avg_loss):
    if avg_gain == 0 and avg_loss == 0:
        return 50.0  # no movement at all
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


def rsi_series(values, period=14):
    """RSI at every point once the window fills, aligned like ema_series:
    rsi_series(v, p)[-k] lines up with values[-k]. Divergence needs this —
    it compares the indicator's value at two different past swings, not just
    the latest one, so a single scalar isn't enough."""
    if len(values) < period + 1:
        return []

    gains, losses = [], []
    for i in range(1, len(values)):
        change = values[i] - values[i - 1]
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    out = [_rsi_from_averages(avg_gain, avg_loss)]
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        out.append(_rsi_from_averages(avg_gain, avg_loss))
    return out


def rsi(values, period=14):
    series = rsi_series(values, period)
    return series[-1] if series else None


def atr(candles, period=14):
    """Average True Range — how far this market actually moves per candle.

    Stop and target distances are derived from this rather than a fixed
    percentage: the same $500 move is noise on BTC daily and a large move on
    a 5m candle, and a level that ignores that is arbitrary.
    """
    if len(candles) < period + 1:
        return None

    true_ranges = []
    for i in range(1, len(candles)):
        prev_close = candles[i - 1]["close"]
        high, low = candles[i]["high"], candles[i]["low"]
        true_ranges.append(max(high - low, abs(high - prev_close), abs(low - prev_close)))

    # Wilder's smoothing, the definition ATR is normally quoted under.
    value = sum(true_ranges[:period]) / period
    for tr in true_ranges[period:]:
        value = (value * (period - 1) + tr) / period
    return value


def macd(values, fast=12, slow=26, signal=9):
    if len(values) < slow + signal + 1:
        return None

    ema_fast = ema_series(values, fast)
    ema_slow = ema_series(values, slow)
    offset = slow - fast  # ema_fast starts earlier than ema_slow; align to ema_slow's index 0
    macd_line = [ema_fast[offset + i] - ema_slow[i] for i in range(len(ema_slow))]
    signal_line = ema_series(macd_line, signal)

    return {
        "macd": macd_line[-1],
        "signal": signal_line[-1],
        "prev_macd": macd_line[-2],
        "prev_signal": signal_line[-2],
        "histogram": macd_line[-1] - signal_line[-1],
    }


def bollinger(values, period=20, num_std=2.0):
    """A moving average with a volatility-scaled envelope around it.

    Used as a volatility read, not a directional vote: price sitting outside
    its own recent range is stretched, which is a reason for caution rather
    than a reason to chase it (spec section 5, volatility).
    """
    if len(values) < period:
        return None

    window = values[-period:]
    mid = sum(window) / period
    variance = sum((v - mid) ** 2 for v in window) / period
    std = variance**0.5
    return {
        "mid": mid,
        "upper": mid + num_std * std,
        "lower": mid - num_std * std,
    }

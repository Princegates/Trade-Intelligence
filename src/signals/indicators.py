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


def rsi(values, period=14):
    if len(values) < period + 1:
        return None

    gains, losses = [], []
    for i in range(1, len(values)):
        change = values[i] - values[i - 1]
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_gain == 0 and avg_loss == 0:
        return 50.0  # no movement at all
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))


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

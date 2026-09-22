"""Combines the indicators into a verdict with reasoning attached — never a
bare BUY/SELL/HOLD with no explanation of why."""

from .. import config
from . import indicators as ind
from . import patterns as pat

BUY_THRESHOLD = config.BUY_THRESHOLD
SELL_THRESHOLD = -config.BUY_THRESHOLD

# Stop sits this many ATRs from the entry, target twice that again, so a call
# is framed to risk one unit to make one and a half.
STOP_ATRS = 1.5
REWARD_TO_RISK = 1.5


def _trend(closes):
    fast, slow = ind.sma(closes, 20), ind.sma(closes, 50)
    if fast is None or slow is None:
        return "flat", None, None
    if fast - slow > 1e-9:
        return "up", fast, slow
    if slow - fast > 1e-9:
        return "down", fast, slow
    return "flat", fast, slow


def _levels(verdict, price, atr):
    """Entry, invalidation and target — or, for a HOLD, the two prices that
    would turn it into a call. Without ATR there is no honest way to size
    these, so they are omitted rather than guessed."""
    if atr is None or atr <= 0:
        return None

    stop_distance = atr * STOP_ATRS
    target_distance = stop_distance * REWARD_TO_RISK

    if verdict == "BUY":
        return {
            "entry": price,
            "stop": price - stop_distance,
            "target": price + target_distance,
            "buy_above": None,
            "sell_below": None,
        }
    if verdict == "SELL":
        return {
            "entry": price,
            "stop": price + stop_distance,
            "target": price - target_distance,
            "buy_above": None,
            "sell_below": None,
        }

    # HOLD: the band to wait out, and what breaking it would mean.
    return {
        "entry": None,
        "stop": None,
        "target": None,
        "buy_above": price + stop_distance,
        "sell_below": price - stop_distance,
    }


def evaluate(candles):
    """`candles` are closed candles, oldest first, each with open/high/low/
    close/volume."""
    closes = [c["close"] for c in candles]
    reasons = []
    score = 0
    evidence = 0

    rsi_val = ind.rsi(closes, 14)
    if rsi_val is not None:
        evidence += 1
        if rsi_val < 30:
            score += 1
            reasons.append(f"RSI(14) at {rsi_val:.1f} — oversold (<30), bullish")
        elif rsi_val > 70:
            score -= 1
            reasons.append(f"RSI(14) at {rsi_val:.1f} — overbought (>70), bearish")
        else:
            reasons.append(f"RSI(14) at {rsi_val:.1f} — neutral (30-70)")

    macd_val = ind.macd(closes)
    if macd_val is not None:
        evidence += 1
        diff = macd_val["macd"] - macd_val["signal"]
        crossed_up = macd_val["prev_macd"] <= macd_val["prev_signal"] and macd_val["macd"] > macd_val["signal"]
        crossed_down = macd_val["prev_macd"] >= macd_val["prev_signal"] and macd_val["macd"] < macd_val["signal"]
        if diff > 1e-9:
            score += 1
            note = "just crossed above" if crossed_up else "above"
            reasons.append(f"MACD {macd_val['macd']:.2f} {note} signal line ({macd_val['signal']:.2f}) — bullish")
        elif diff < -1e-9:
            score -= 1
            note = "just crossed below" if crossed_down else "below"
            reasons.append(f"MACD {macd_val['macd']:.2f} {note} signal line ({macd_val['signal']:.2f}) — bearish")
        else:
            reasons.append("MACD flat against its signal line — no clear direction")

    trend, sma_fast, sma_slow = _trend(closes)
    if sma_fast is not None and sma_slow is not None:
        evidence += 1
        if trend == "up":
            score += 1
            reasons.append(f"SMA20 ({sma_fast:.2f}) above SMA50 ({sma_slow:.2f}) — uptrend")
        elif trend == "down":
            score -= 1
            reasons.append(f"SMA20 ({sma_fast:.2f}) below SMA50 ({sma_slow:.2f}) — downtrend")
        else:
            reasons.append(f"SMA20 equal to SMA50 ({sma_fast:.2f}) — no clear trend")

    # Candlestick evidence is read against the trend, never by name alone:
    # the same shape reverses an uptrend or confirms a downtrend.
    found = pat.detect(candles, trend)
    if found:
        evidence += 1
        direction = sum(p["direction"] for p in found)
        score += 1 if direction > 0 else -1 if direction < 0 else 0
        for p in found:
            reasons.append(f"{p['name']} — {p['note']}")

    atr_val = ind.atr(candles, 14)
    if atr_val is not None:
        reasons.append(f"ATR(14) at {atr_val:.2f} — typical move per candle, used to size the levels below")

    if evidence < config.MIN_EVIDENCE:
        verdict = "HOLD"
        reasons.append(
            f"Only {evidence} of 4 indicators had enough history to report — "
            "too little evidence for a directional call"
        )
    elif score >= BUY_THRESHOLD:
        verdict = "BUY"
    elif score <= SELL_THRESHOLD:
        verdict = "SELL"
    else:
        verdict = "HOLD"

    # Confidence stays None until there is a track record to calibrate it
    # against. A number derived from `score` would only restate how many
    # indicators agreed, which is not the same thing as how often that
    # agreement has actually been right (SE-005).
    return {
        "verdict": verdict,
        "score": score,
        "reasoning": reasons,
        "evidence_count": evidence,
        "confidence": None,
        "patterns": [p["name"] for p in found],
        "levels": _levels(verdict, closes[-1], atr_val),
    }

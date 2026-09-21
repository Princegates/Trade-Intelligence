"""Combines the indicators into a verdict with reasoning attached — never a
bare BUY/SELL/HOLD with no explanation of why."""

from . import indicators as ind

BUY_THRESHOLD = 2
SELL_THRESHOLD = -2


def evaluate(closes):
    reasons = []
    score = 0

    rsi_val = ind.rsi(closes, 14)
    if rsi_val is not None:
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

    sma_fast = ind.sma(closes, 20)
    sma_slow = ind.sma(closes, 50)
    if sma_fast is not None and sma_slow is not None:
        diff = sma_fast - sma_slow
        if diff > 1e-9:
            score += 1
            reasons.append(f"SMA20 ({sma_fast:.2f}) above SMA50 ({sma_slow:.2f}) — uptrend")
        elif diff < -1e-9:
            score -= 1
            reasons.append(f"SMA20 ({sma_fast:.2f}) below SMA50 ({sma_slow:.2f}) — downtrend")
        else:
            reasons.append(f"SMA20 equal to SMA50 ({sma_fast:.2f}) — no clear trend")

    if score >= BUY_THRESHOLD:
        verdict = "BUY"
    elif score <= SELL_THRESHOLD:
        verdict = "SELL"
    else:
        verdict = "HOLD"

    return {"verdict": verdict, "score": score, "reasoning": reasons}

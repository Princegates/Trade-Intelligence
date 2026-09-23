"""Combines confluence across independent categories into a verdict with
reasoning attached — never a bare BUY/SELL/HOLD with no explanation of why.

Four categories vote, each -1/0/+1: EMA trend, momentum (RSI+MACD counted
once between them, not twice), market structure, and candlestick
confirmation. They are kept independent deliberately — RSI and MACD both
follow the same underlying price move, so letting them vote separately would
double-count one opinion as two (spec section 8). A call needs at least two
categories to agree and none to be overridden by a false-signal gate below;
one bullish reading alone is never enough (spec section 1).

Everything here is priced in OHLC — no DXY, funding rates, open interest or
macro calendar, because none of that is available on the free feeds this
project runs on. See README for what that leaves out and why.
"""

import math

from .. import config
from . import divergence, indicators as ind, patterns as pat, structure as struct

BUY_THRESHOLD = config.BUY_THRESHOLD
SELL_THRESHOLD = -config.BUY_THRESHOLD

EMA_PERIODS = (9, 21, 50, 100, 200)

# Stop sits this many ATRs from the entry, target twice that again, so a call
# is framed to risk one unit to make one and a half.
STOP_ATRS = 1.5
REWARD_TO_RISK = 1.5


def _ema_trend(closes):
    """Trend read from the EMA stack rather than a single moving-average
    cross. "Aligned" is judged as a majority of price/EMA pairs sitting in
    the same order, not a strict nested stack — that is rare outside a
    strong trend and would make this vote unavailable most of the time.

    Returns (vote, label, reasons). `label` is "up"/"down"/"flat" and is also
    what candlestick patterns are read against (spec section 4).
    """
    price = closes[-1]
    available = [(p, ind.ema(closes, p)) for p in EMA_PERIODS]
    available = [(p, v) for p, v in available if v is not None]
    if len(available) < 2:
        return None, "flat", ["EMA stack: not enough history yet for a trend read"]

    chain = [price] + [v for _, v in available]
    bullish = sum(1 for a, b in zip(chain, chain[1:]) if a > b)
    bearish = sum(1 for a, b in zip(chain, chain[1:]) if a < b)
    total = len(chain) - 1
    needed = math.ceil(total * 0.6)

    stack = ", ".join(f"EMA{p}={v:.2f}" for p, v in available)
    if bullish >= needed and bullish > bearish:
        return 1, "up", [f"Price above a bullishly stacked EMA line ({stack})"]
    if bearish >= needed and bearish > bullish:
        return -1, "down", [f"Price below a bearishly stacked EMA line ({stack})"]
    return 0, "flat", [f"EMA stack mixed ({stack}) — no clean trend"]


def _momentum(closes, candles, swings):
    """RSI and MACD are both trend-following momentum reads, so they cast
    one vote together, not two — they have to agree to produce a directional
    read; either alone leaves momentum neutral rather than confirming itself
    twice (spec section 8).

    Divergence between price and RSI at the last two comparable swings is
    checked here too, but never adds its own vote: it is only ever a reason
    engine.evaluate can veto a call with (spec section 13).
    """
    rsi_series = ind.rsi_series(closes, 14)
    macd_val = ind.macd(closes)
    if not rsi_series and macd_val is None:
        return {"vote": None, "reasons": ["Momentum: not enough history yet"], "divergence": None}

    reasons = []
    rsi_val = rsi_series[-1] if rsi_series else None
    rsi_dir = 0
    if rsi_val is not None:
        if rsi_val > 70:
            rsi_dir, note = -1, "overbought (>70)"
        elif rsi_val < 30:
            rsi_dir, note = 1, "oversold (<30)"
        else:
            rsi_dir, note = 0, "neutral (30-70)"
        reasons.append(f"RSI(14) at {rsi_val:.1f} — {note}")

    macd_dir = 0
    if macd_val is not None:
        diff = macd_val["macd"] - macd_val["signal"]
        crossed_up = macd_val["prev_macd"] <= macd_val["prev_signal"] and macd_val["macd"] > macd_val["signal"]
        crossed_down = macd_val["prev_macd"] >= macd_val["prev_signal"] and macd_val["macd"] < macd_val["signal"]
        if diff > 1e-9:
            macd_dir = 1
            note = "just crossed above" if crossed_up else "above"
            reasons.append(f"MACD {macd_val['macd']:.2f} {note} signal line ({macd_val['signal']:.2f}) — bullish")
        elif diff < -1e-9:
            macd_dir = -1
            note = "just crossed below" if crossed_down else "below"
            reasons.append(f"MACD {macd_val['macd']:.2f} {note} signal line ({macd_val['signal']:.2f}) — bearish")
        else:
            reasons.append("MACD flat against its signal line — no clear direction")

    if rsi_dir != 0 and rsi_dir == macd_dir:
        vote = rsi_dir
        reasons.append("RSI and MACD agree — counted once as momentum, not twice")
    elif rsi_dir != 0 and macd_dir != 0:
        vote = 0
        reasons.append("RSI and MACD disagree — momentum stays neutral rather than picking a side")
    else:
        vote = 0

    diverged = None
    if rsi_series and swings:
        aligned = divergence.align(candles, rsi_series)
        diverged = divergence.find(swings, aligned, "high") or divergence.find(swings, aligned, "low")
        if diverged:
            reasons.append(f"{diverged['kind'].capitalize()} RSI divergence — price and momentum disagree")

    return {"vote": vote, "reasons": reasons, "divergence": diverged}


def _structure(candles):
    """Market structure vote: a Break of Structure votes with the trend it
    continues, a Change of Character votes with the reversal it warns of,
    and an unclear bias votes nothing (spec sections 3 and 9 — WAIT when
    structure is unclear)."""
    swings = struct.swing_points(candles, config.SWING_LOOKBACK)
    highs = [s for s in swings if s["kind"] == "high"]
    lows = [s for s in swings if s["kind"] == "low"]

    if len(highs) < 2 or len(lows) < 2:
        return {
            "vote": None,
            "reasons": ["Market structure: not enough swing history yet"],
            "regime": "RANGING",
            "swings": swings,
            "swept": None,
        }

    trend_bias = struct.bias(swings)
    break_event = struct.break_of_structure(candles, swings, trend_bias)
    regime = struct.regime(trend_bias, break_event)
    pools = struct.equal_levels(swings, config.EQUAL_LEVEL_TOLERANCE)
    swept = struct.swept(candles[-1], pools) if pools else None

    reasons = []
    if break_event:
        level = break_event["level"]
        if break_event["kind"] == "BOS":
            reasons.append(f"BOS at {level:.2f} — price confirms the prevailing {trend_bias}trend")
        else:
            # A CHoCH's text has to end on the *new* implied direction, not
            # the old trend being broken — the web dashboard's plain-language
            # summary (web/src/lib/plain-language.ts) counts "uptrend" and
            # "downtrend" as keywords, and this vote's sign is the new one.
            new_bias = "up" if break_event["direction"] == 1 else "down"
            article = "an" if new_bias == "up" else "a"
            reasons.append(
                f"CHoCH at {level:.2f} — price breaks the level that held the {trend_bias}trend, "
                f"the first sign of a shift toward {article} {new_bias}trend"
            )
        vote = break_event["direction"]
    else:
        reasons.append(f"Market structure: {trend_bias} bias, no fresh break this candle")
        vote = 0

    if swept:
        reasons.append(
            f"Equal {swept['kind']}s pooled near {swept['price']:.2f} ({swept['touches']} touches) — a liquidity level worth watching"
        )

    return {"vote": vote, "reasons": reasons, "regime": regime, "swings": swings, "swept": swept}


def _pattern(candles, trend_label, swings, atr_val):
    """Candlestick confirmation, gated on context (spec section 4): a shape
    only counts as a vote when it is directional AND sits at a level from
    `swings` that is actually meaningful. Seen-but-not-counted patterns are
    still reported, since context is exactly what makes them worth
    explaining rather than acting on."""
    found = pat.detect(candles, trend_label)
    if not found:
        return {"vote": None, "reasons": [], "names": []}

    reasons = [f"{p['name']} — {p['note']}" for p in found]
    names = [p["name"] for p in found]
    direction = sum(p["direction"] for p in found)
    raw_vote = 1 if direction > 0 else -1 if direction < 0 else 0

    if raw_vote == 0:
        return {"vote": 0, "reasons": reasons, "names": names}

    price = candles[-1]["close"]
    levels = struct.nearest_levels(swings, price)
    at_a_level = struct.near_level(price, levels["support"], atr_val) or struct.near_level(
        price, levels["resistance"], atr_val
    )
    if at_a_level:
        return {"vote": raw_vote, "reasons": reasons, "names": names}

    reasons.append("not at a meaningful support/resistance level — not counted as confirmation")
    return {"vote": 0, "reasons": reasons, "names": names}


def _volatility(candles, closes, atr_val):
    """A candle blowing far past its own typical range is a reason for
    caution, not confirmation — a setup can be technically right and still
    too extended to enter safely the moment it happens (spec section 13)."""
    if atr_val is None or atr_val <= 0:
        return {"ok": True, "reasons": []}

    last_range = candles[-1]["high"] - candles[-1]["low"]
    if last_range / atr_val > config.VOLATILITY_SPIKE_ATR:
        ratio = last_range / atr_val
        return {"ok": False, "reasons": [f"Latest candle's range is {ratio:.1f}x its ATR(14) — abnormal volatility"]}

    bands = ind.bollinger(closes, 20)
    if bands and bands["mid"]:
        price = closes[-1]
        if price > bands["upper"] or price < bands["lower"]:
            return {
                "ok": True,
                "reasons": [
                    f"Price outside its Bollinger Band ({bands['lower']:.2f}-{bands['upper']:.2f}) — stretched, not disqualifying on its own"
                ],
            }
    return {"ok": True, "reasons": []}


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


def apply_event_risk_override(result, candles, event, currency):
    """Pulls a directional call back to HOLD when it lands inside the
    blackout window around a scheduled high-impact economic release —
    the same override pattern as the built-in false-signal gates (spec
    section 13), just driven by an external calendar (src/signals/
    event_risk.py) rather than price action alone.

    A HOLD is left untouched: there is nothing to pull back, and this
    should never be able to turn a HOLD into a call.
    """
    if result["verdict"] == "HOLD":
        return result

    atr_val = ind.atr(candles, 14)
    result["reasoning"].append(
        f"Overridden to HOLD — {event['title']} ({currency}, high impact) scheduled within the event-risk window"
    )
    result["verdict"] = "HOLD"
    result["levels"] = _levels("HOLD", candles[-1]["close"], atr_val)
    return result


def evaluate(candles):
    """`candles` are closed candles, oldest first, each with open/high/low/
    close/volume."""
    closes = [c["close"] for c in candles]
    atr_val = ind.atr(candles, 14)

    trend_vote, trend_label, trend_reasons = _ema_trend(closes)
    structure = _structure(candles)
    momentum = _momentum(closes, candles, structure["swings"])
    pattern = _pattern(candles, trend_label, structure["swings"], atr_val)
    volatility = _volatility(candles, closes, atr_val)

    votes = {"trend": trend_vote, "momentum": momentum["vote"], "structure": structure["vote"], "pattern": pattern["vote"]}
    evidence = sum(1 for v in votes.values() if v is not None)
    score = sum(v for v in votes.values() if v is not None)

    reasons = list(trend_reasons)
    reasons += momentum["reasons"]
    reasons += structure["reasons"]
    reasons += pattern["reasons"]
    reasons += volatility["reasons"]
    if atr_val is not None:
        reasons.append(f"ATR(14) at {atr_val:.2f} — typical move per candle, used to size the levels below")

    if evidence < config.MIN_EVIDENCE:
        verdict = "HOLD"
        reasons.append(
            f"Only {evidence} of 4 categories had enough history to report — too little evidence for a directional call"
        )
    elif score >= BUY_THRESHOLD:
        verdict = "BUY"
    elif score <= SELL_THRESHOLD:
        verdict = "SELL"
    else:
        verdict = "HOLD"

    # False-signal gates (spec section 13): each can only pull a call back
    # to HOLD, never push a HOLD into one — evidence has to earn a signal,
    # a gate only ever takes one away. Checked in a fixed order so the
    # reasoning always names the first disqualifying reason found.
    if verdict != "HOLD":
        if structure["regime"] == "RANGING":
            reasons.append("Overridden to HOLD — market structure is ranging, not trending")
            verdict = "HOLD"
        elif not volatility["ok"]:
            reasons.append("Overridden to HOLD — volatility is abnormal for this instrument right now")
            verdict = "HOLD"
        elif structure["swept"] and (
            (verdict == "BUY" and structure["swept"]["kind"] == "high")
            or (verdict == "SELL" and structure["swept"]["kind"] == "low")
        ):
            reasons.append(
                f"Overridden to HOLD — this move swept a liquidity pool at {structure['swept']['price']:.2f} and closed back inside it, a likely false breakout"
            )
            verdict = "HOLD"
        elif momentum["divergence"] and (
            (verdict == "BUY" and momentum["divergence"]["kind"] == "bearish")
            or (verdict == "SELL" and momentum["divergence"]["kind"] == "bullish")
        ):
            reasons.append("Overridden to HOLD — momentum divergence contradicts this call")
            verdict = "HOLD"

    # Confidence stays None until there is a track record to calibrate it
    # against. A number derived from `score` would only restate how many
    # categories agreed, which is not the same thing as how often that
    # agreement has actually been right (SE-005).
    return {
        "verdict": verdict,
        "score": score,
        "reasoning": reasons,
        "evidence_count": evidence,
        "confidence": None,
        "patterns": pattern["names"],
        "levels": _levels(verdict, closes[-1], atr_val),
    }

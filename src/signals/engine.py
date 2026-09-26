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
from . import confluence, divergence, entry_zone as ez, indicators as ind, patterns as pat, structure as struct

BUY_THRESHOLD = config.BUY_THRESHOLD
SELL_THRESHOLD = -config.BUY_THRESHOLD

EMA_PERIODS = (9, 21, 50, 100, 200)

# Stop sits this many ATRs from the entry — tightened from 1.5 to 0.75 for
# stricter risk management. Target keeps the same 1:1.5 risk:reward ratio
# (REWARD_TO_RISK is a multiple of the stop distance, not of ATR directly),
# so it tightens along with the stop rather than staying fixed.
STOP_ATRS = 0.75
REWARD_TO_RISK = 1.5

# Phase 2a structural defaults — read via settings.get(key, DEFAULT) so
# these always-on features work correctly even when settings is None/{},
# unlike the veto gates below which need an explicit settings row to
# activate at all.
STRUCTURE_BUFFER_ATR = 0.25
ENTRY_ZONE_WIDTH_ATR = 0.5
TOUCHES_FOR_FULL_SCORE = 4


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
            "break_event": None,
            "trend_bias": None,
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

    return {
        "vote": vote,
        "reasons": reasons,
        "regime": regime,
        "swings": swings,
        "swept": swept,
        "break_event": break_event,
        "trend_bias": trend_bias,
    }


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


def _levels(
    verdict,
    price,
    atr,
    stop_atrs=STOP_ATRS,
    reward_to_risk=REWARD_TO_RISK,
    structural_stop=None,
    structural_target=None,
):
    """Entry, invalidation and target — or, for a HOLD, the two prices that
    would turn it into a call. Without ATR there is no honest way to size
    these, so they are omitted rather than guessed.

    `stop_atrs`/`reward_to_risk` default to the module constants but can be
    overridden per-run from an admin's engine_settings row (see evaluate()),
    so an admin adjusting these doesn't require a code change + redeploy.

    `structural_stop`/`structural_target` (src/signals/entry_zone.py), when
    given, take priority over the fixed ATR multiple — real, independently-
    derived market structure rather than a stop and target that are always
    the same ratio apart by construction. Falling back to the ATR math when
    either is None (no swings yet, e.g. early history) reproduces exactly
    today's behavior with zero settings gate needed."""
    if atr is None or atr <= 0:
        return None

    stop_distance = atr * stop_atrs
    target_distance = stop_distance * reward_to_risk

    if verdict == "BUY":
        return {
            "entry": price,
            "stop": structural_stop if structural_stop is not None else price - stop_distance,
            "target": structural_target if structural_target is not None else price + target_distance,
            "buy_above": None,
            "sell_below": None,
        }
    if verdict == "SELL":
        return {
            "entry": price,
            "stop": structural_stop if structural_stop is not None else price + stop_distance,
            "target": structural_target if structural_target is not None else price - target_distance,
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
    # A directional call's confidence and structural fields describe that
    # call specifically — once it's overridden to HOLD there's no live call
    # left for any of them to be about, same "None means HOLD" contract
    # engine.evaluate()'s own gates keep. regime/market_phase are left
    # untouched: they describe the market, not this call, and are
    # unaffected by every other veto gate the same way.
    result["confidence"] = None
    result["verdict"] = "HOLD"
    result["levels"] = _levels("HOLD", candles[-1]["close"], atr_val)
    result["invalidation_level"] = None
    result["entry_zone_low"] = None
    result["entry_zone_high"] = None
    return result


# --- Confidence scoring -----------------------------------------------
#
# A transparent read of how much of the engine's OWN evidence lines up
# behind a call — NOT a calibrated win probability. There is no outcome
# tracking wired to this number: src/accuracy.py forward-checks published
# signals against later closes, but nothing feeds that back here. Treat
# "82/100" as "82% of the engine's own checks agree with itself", not
# "82% chance this works" (see SE-005's reasoning for why a score-derived
# number risks exactly that confusion).
#
# Eight categories, weighted to sum to 100 points, computed only from
# evidence this run already gathered (no new detection machinery beyond
# confluence.py and the existing structure/indicators functions):
#   trend alignment 20, market structure 20, pullback quality 15,
#   support/resistance 10, candle confirmation 10, ATR/volatility 10,
#   momentum 10, liquidity context 5.
#
# Stored as a 0.0-1.0 fraction (divided by 100 before writing) to match the
# existing `confidence: number | null` contract end-to-end — the web
# dashboard's `(signal.confidence * 100).toFixed(0)%` display needs no
# changes to start showing real numbers.


def _vote_score(vote, direction, points, neutral_fraction=0.5):
    """Shared scoring for the four vote-based categories (trend alignment,
    market structure, momentum, candle confirmation): full marks when the
    vote agrees with the call's direction, partial credit when it's
    neutral/unavailable (absence of evidence isn't evidence against), zero
    when it actively disagrees."""
    if vote is None or vote == 0:
        return points * neutral_fraction
    if vote == direction:
        return points
    return 0.0


def _trend_alignment_score(verdict, higher_bias, points=20):
    """Higher-timeframe structural bias (confluence.py) vs. this call's
    direction. A call that reached here already survived the confluence
    veto (or it's disabled), so "opposes" is only reachable when an admin
    has turned that veto off — kept for completeness, not normally hit."""
    agree_bias = "up" if verdict == "BUY" else "down"
    if higher_bias == agree_bias:
        return points
    if higher_bias in (None, "range"):
        return points * 0.5
    return 0.0


def _pullback_quality_score(zone_result, points=15):
    """Real pullback/entry-zone classification (src/signals/entry_zone.py),
    superseding Phase 1's ATR-distance proxy. Full marks sitting inside the
    zone; graduated by how far outside it price has run; a reduced but
    nonzero score when there's no structural level yet to measure against
    (absence of evidence isn't evidence against)."""
    if zone_result is None:
        return points * 0.3
    if zone_result["inside_zone"]:
        return points
    distance_atr = zone_result["distance_atr"]
    if distance_atr <= 1.0:
        return points * 0.6
    if distance_atr <= 2.0:
        return points * 0.3
    return 0.0


def _sr_proximity_score(price, swings, atr_val, tolerance, points=10):
    """Scaled by how many times the nearest *pooled* (multi-touch) level
    from struct.equal_levels has actually been tested — a level tested
    four-plus times is a stronger read than one tested twice, rather than
    Phase 1's binary near/not-near. Deliberately a different data source
    than pullback quality (tested/pooled levels vs. the single nearest
    swing), so the two categories aren't just restating each other."""
    if atr_val is None or atr_val <= 0:
        return 0.0
    pools = struct.equal_levels(swings, tolerance)
    nearby = [p for p in pools if struct.near_level(price, p["price"], atr_val)]
    if not nearby:
        return 0.0
    touches = max(p["touches"] for p in nearby)
    return points * min(touches / TOUCHES_FOR_FULL_SCORE, 1.0)


def _volatility_score(volatility, points=10):
    """Clean volatility scores full; a call that's technically ok but
    stretched outside its Bollinger Band scores partial, a caution the
    existing _volatility() reasons already surface as text. Not-ok
    volatility already vetoes the call outright before this runs."""
    if not volatility.get("ok", True):
        return 0.0
    stretched = any("Bollinger Band" in r for r in volatility.get("reasons", []))
    return points * 0.6 if stretched else points


def _liquidity_score(verdict, swept, points=5):
    """Full marks with no liquidity sweep flagged at all; reduced if a
    sweep was flagged on the *opposite* side (informational, not
    disqualifying); a matching-side sweep already vetoes the call outright
    before this runs, so 0 is defensive, not normally reachable."""
    if not swept:
        return points
    matching = (verdict == "BUY" and swept["kind"] == "high") or (verdict == "SELL" and swept["kind"] == "low")
    return 0.0 if matching else points * 0.4


def _confidence(verdict, votes, structure, volatility, higher_bias, price, atr_val, tolerance, zone_result):
    """Returns (confidence, reasoning_lines). confidence is None with no
    reasoning for a HOLD — there's no live call left to be confident
    about, whether HOLD was the original verdict or a gate overrode it.

    `zone_result` is the caller's already-computed entry_zone.entry_zone()
    result for this call's side (src/signals/entry_zone.py) — reused here
    rather than re-derived, since evaluate() needs it for the same call's
    stop/target/invalidation fields anyway."""
    if verdict == "HOLD":
        return None, []

    direction = 1 if verdict == "BUY" else -1
    swings = structure.get("swings") or []

    trend_points = _trend_alignment_score(verdict, higher_bias)
    structure_points = _vote_score(votes["structure"], direction, 20)
    pullback_points = _pullback_quality_score(zone_result)
    sr_points = _sr_proximity_score(price, swings, atr_val, tolerance)
    candle_points = _vote_score(votes["pattern"], direction, 10)
    atr_points = _volatility_score(volatility)
    momentum_points = _vote_score(votes["momentum"], direction, 10)
    liquidity_points = _liquidity_score(verdict, structure.get("swept"))

    total = (
        trend_points + structure_points + pullback_points + sr_points
        + candle_points + atr_points + momentum_points + liquidity_points
    )
    # Rounded once, here, to a single integer 0-100 — the one source of
    # truth for both the breakdown text below and the fraction returned,
    # so a reasoning line and the number a later gate compares against can
    # never disagree over a rounding difference (59.5 formatting as "60"
    # while round(0.595, 2) * 100 comes back as 59.0 due to floating-point
    # representation was a real, observed discrepancy during development).
    rounded_total = round(min(max(total, 0.0), 100.0))

    reasoning = [
        f"Confidence {rounded_total}/100 — confluence strength, not a win rate: "
        f"trend {trend_points:.0f}/20, structure {structure_points:.0f}/20, "
        f"pullback {pullback_points:.0f}/15, S/R {sr_points:.0f}/10, "
        f"candle {candle_points:.0f}/10, ATR/volatility {atr_points:.0f}/10, "
        f"momentum {momentum_points:.0f}/10, liquidity {liquidity_points:.0f}/5"
    ]
    return rounded_total / 100.0, reasoning


def _rr_below_minimum(levels, min_rr):
    """Real risk/reward computed from the actual entry/stop/target the
    engine already produced — never re-derived or nudged to pass, per the
    spec's own "do not artificially move take-profit to manufacture a
    better RR" instruction. Returns False (does not block) when levels
    can't be evaluated, rather than guessing.

    The tiny epsilon below is not a loophole — it exists because
    entry-stop/target-entry subtraction on real floats does not always
    reproduce the exact ratio the levels were sized from (e.g. computed rr
    landing at 1.4999999999999842 instead of exactly 1.5 was observed
    during development); without it, min_reward_to_risk set equal to
    reward_to_risk — the documented "inert by default" configuration —
    could spuriously veto every signal on rounding noise alone."""
    if not levels or levels.get("entry") is None:
        return False
    entry, stop, target = levels["entry"], levels["stop"], levels["target"]
    if stop is None or target is None:
        return False
    risk = abs(entry - stop)
    reward = abs(target - entry)
    if risk <= 0:
        return False
    return (reward / risk) < (min_rr - 1e-9)


def evaluate(candles, higher_timeframe_bias=None, settings=None):
    """`candles` are closed candles, oldest first, each with open/high/low/
    close/volume.

    `higher_timeframe_bias` is confluence.higher_timeframe_bias() applied to
    an anchor timeframe's own candles (see src/signals/confluence.py and
    src/run.py — this function never fetches anything itself). `settings`
    is an optional dict shaped like a row from the engine_settings table
    (src/storage/supabase.py::get_engine_settings()), supplying per-field
    overrides; a missing field falls back to today's fixed constant/
    behavior individually, never all-or-nothing. Both parameters default to
    values that reproduce exactly today's behavior when omitted, so every
    existing caller and test keeps working unmodified."""
    settings = settings or {}
    closes = [c["close"] for c in candles]
    atr_val = ind.atr(candles, 14)

    trend_vote, trend_label, trend_reasons = _ema_trend(closes)
    structure = _structure(candles)
    momentum = _momentum(closes, candles, structure["swings"])
    pattern = _pattern(candles, trend_label, structure["swings"], atr_val)
    volatility = _volatility(candles, closes, atr_val)

    # Phase 2a: nearest confirmed support/resistance to current price,
    # computed once and reused for every structural computation below
    # rather than re-derived per-helper (src/signals/entry_zone.py).
    struct_levels = struct.nearest_levels(structure["swings"], closes[-1])
    buffer_atr = settings.get("structure_buffer_atr", STRUCTURE_BUFFER_ATR)
    zone_width_atr = settings.get("entry_zone_width_atr", ENTRY_ZONE_WIDTH_ATR)

    # regime/market_phase describe what the market is doing, not what this
    # particular call turns out to be — they populate the same way
    # regardless of verdict, including HOLD, so phase direction here comes
    # from the swing-derived trend bias rather than the (possibly
    # overridden) verdict below.
    phase_side = (
        "support" if structure["trend_bias"] == "up"
        else "resistance" if structure["trend_bias"] == "down"
        else None
    )
    phase_zone = ez.entry_zone(phase_side, closes[-1], struct_levels, atr_val, zone_width_atr) if phase_side else None
    regime = structure["regime"]
    market_phase_label = ez.market_phase(regime, structure["break_event"], phase_zone)

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
        verdict_side = "support" if verdict == "BUY" else "resistance"
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
        elif (
            settings.get("require_higher_timeframe_confluence", True)
            and confluence.opposes(verdict, higher_timeframe_bias)
        ):
            reasons.append(
                f"Overridden to HOLD — the higher timeframe's structure is trending {higher_timeframe_bias}, opposing this call"
            )
            verdict = "HOLD"
        elif "max_entry_zone_distance_atr" in settings and ez.distance_exceeds(
            ez.entry_zone(verdict_side, closes[-1], struct_levels, atr_val, zone_width_atr),
            settings["max_entry_zone_distance_atr"],
        ):
            reasons.append("Overridden to HOLD — price has run too far from its entry zone to chase")
            verdict = "HOLD"

    stop_atrs = settings.get("atr_stop_multiplier", STOP_ATRS)
    reward_to_risk_value = settings.get("reward_to_risk", REWARD_TO_RISK)

    def _resolve(v):
        """Side, and the levels dict for verdict `v` — structural stop/
        target when real structure is available (independently derived, so
        risk/reward genuinely varies per signal), else the same fixed-ATR
        math as before (src/signals/entry_zone.py, always-on, no settings
        gate needed: it falls through to today's exact behavior whenever
        there aren't enough swings)."""
        side = "support" if v == "BUY" else "resistance" if v == "SELL" else None
        s_stop = ez.structural_stop(side, closes[-1], struct_levels, atr_val, buffer_atr) if side else None
        s_target = ez.structural_target(side, struct_levels) if side else None
        return _levels(v, closes[-1], atr_val, stop_atrs, reward_to_risk_value, s_stop, s_target), side

    levels, verdict_side = _resolve(verdict)

    # R:R gate — only runs when an admin has actually configured a minimum
    # (a fresh engine_settings row always has one; settings=None/{} never
    # does, so this stays inert for every existing caller). Real risk/
    # reward from the levels just computed above, never re-derived to force
    # a pass. Now that stop/target are independently derived from structure
    # when it's available (rather than always a fixed multiple of each
    # other), this gate can genuinely discriminate between signals instead
    # of passing or failing uniformly.
    if verdict != "HOLD" and "min_reward_to_risk" in settings:
        min_rr = settings["min_reward_to_risk"]
        if _rr_below_minimum(levels, min_rr):
            reasons.append(
                f"Overridden to HOLD — risk/reward does not clear the configured minimum of 1:{min_rr:g}"
            )
            verdict = "HOLD"
            levels, verdict_side = _resolve(verdict)

    # Confidence is computed for whatever verdict survived every gate above
    # — a call already overridden to HOLD reports no confidence, since
    # there's no live call left to be confident about. See the
    # "Confidence scoring" block above _vote_score for what this number is
    # and, just as importantly, what it is not.
    confidence_zone = ez.entry_zone(verdict_side, closes[-1], struct_levels, atr_val, zone_width_atr) if verdict_side else None
    confidence, confidence_reasons = _confidence(
        verdict,
        votes,
        structure,
        volatility,
        higher_timeframe_bias,
        closes[-1],
        atr_val,
        config.EQUAL_LEVEL_TOLERANCE,
        confidence_zone,
    )
    reasons += confidence_reasons

    # Confidence-threshold gate — same "only when admin-configured" guard
    # as the R:R gate above, so this stays inert for every existing caller.
    if verdict != "HOLD" and "min_confidence_threshold" in settings and confidence is not None:
        min_confidence = settings["min_confidence_threshold"]
        if confidence * 100 < min_confidence:
            reasons.append(
                f"Overridden to HOLD — confidence {confidence * 100:.0f}/100 is below the configured minimum of {min_confidence:g}"
            )
            verdict = "HOLD"
            levels, verdict_side = _resolve(verdict)
            confidence = None

    # Call-specific structural fields — None on HOLD, matching the existing
    # entry/stop/target null-for-HOLD contract (unlike regime/market_phase
    # above, which describe the market rather than this specific call).
    # Recomputed from the truly final verdict/side, which may have changed
    # again since confidence_zone was computed.
    invalidation_level_val = ez.invalidation_level(verdict_side, struct_levels) if verdict_side else None
    entry_zone_result = ez.entry_zone(verdict_side, closes[-1], struct_levels, atr_val, zone_width_atr) if verdict_side else None
    entry_zone_low = entry_zone_result["zone_low"] if entry_zone_result else None
    entry_zone_high = entry_zone_result["zone_high"] if entry_zone_result else None

    return {
        "verdict": verdict,
        "score": score,
        "reasoning": reasons,
        "evidence_count": evidence,
        "confidence": confidence,
        "patterns": pattern["names"],
        "levels": levels,
        "regime": regime,
        "market_phase": market_phase_label,
        "invalidation_level": invalidation_level_val,
        "entry_zone_low": entry_zone_low,
        "entry_zone_high": entry_zone_high,
    }

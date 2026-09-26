"""Structure-aware stop/target/invalidation levels and market-phase
classification — Phase 2a of the entry-quality engine.

Every function here is keyed on a `side` ("support" or "resistance"), never
on a verdict string ("BUY"/"SELL"/"HOLD"). That is deliberate: a verdict can
be "HOLD" (nothing to compute a structural stop for) or can describe a call
whose *direction* still needs a structural side resolved by the caller
either way. Keeping this module verdict-agnostic means it is HOLD-safe by
construction — a caller simply doesn't call it when there's no side to
resolve, and `None` propagates the same way `engine._levels()` already
omits fields it can't honestly compute, rather than a HOLD accidentally
falling into a SELL-shaped branch.

`levels` throughout is the dict returned by `structure.nearest_levels()` —
computed once per `evaluate()` call and threaded through, not re-derived
per-helper.
"""


def structural_stop(side, price, levels, atr_val, buffer_atr):
    """Stop placed just beyond the nearest relevant swing level, buffered
    by a fraction of ATR so ordinary noise doesn't clip it. None when
    there's no level on that side yet or ATR is unavailable — the caller's
    ATR-fixed-ratio fallback takes over, exactly as it does today when
    there aren't enough swings."""
    if atr_val is None or atr_val <= 0:
        return None
    level = levels.get(side)
    if level is None:
        return None
    buffer = atr_val * buffer_atr
    return level - buffer if side == "support" else level + buffer


def structural_target(side, levels):
    """The opposing structural level — deliberately NOT a multiple of the
    stop distance. Risk and reward now come from independent real levels,
    so risk/reward genuinely varies per signal instead of being fixed by
    settings alone."""
    opposite = "resistance" if side == "support" else "support"
    return levels.get(opposite)


def invalidation_level(side, levels):
    """The raw structural level itself (unbuffered) — the price that, if
    reached, means the thesis behind this side was simply wrong. Distinct
    from structural_stop, which adds a noise buffer for order placement."""
    return levels.get(side)


def entry_zone(side, price, levels, atr_val, zone_width_atr):
    """A band around the nearest same-side level, and how far current
    price sits from it in ATRs. None when there's no level or no ATR —
    never guessed."""
    if atr_val is None or atr_val <= 0:
        return None
    level = levels.get(side)
    if level is None:
        return None
    half_width = atr_val * zone_width_atr
    zone_low, zone_high = level - half_width, level + half_width
    inside = zone_low <= price <= zone_high
    distance_atr = 0.0 if inside else min(abs(price - zone_low), abs(price - zone_high)) / atr_val
    return {
        "preferred_entry": level,
        "zone_low": zone_low,
        "zone_high": zone_high,
        "inside_zone": inside,
        "distance_atr": round(distance_atr, 2),
    }


def distance_exceeds(zone_result, max_distance_atr):
    """Whether price has run too far from its entry zone to chase. A
    missing zone (no structural level yet) or being inside it never trips
    this, so the gate that uses it stays inert whenever there's no real
    structure to measure against."""
    if zone_result is None or zone_result["inside_zone"]:
        return False
    return zone_result["distance_atr"] > max_distance_atr


def market_phase(regime, break_event, zone_result):
    """One label for what price is currently doing — independent of
    whether any call survives to publish. A fresh CHoCH/RANGING regime
    wins outright; otherwise a fresh BOS is a breakout, sitting inside the
    (trend-direction-based) entry zone is a pullback, and anything else is
    an impulse leg."""
    if regime == "REVERSING":
        return "REVERSAL"
    if regime == "RANGING":
        return "CONSOLIDATION"
    if break_event and break_event["kind"] == "BOS":
        return "BREAKOUT"
    if zone_result and zone_result["inside_zone"]:
        return "PULLBACK"
    return "IMPULSE"

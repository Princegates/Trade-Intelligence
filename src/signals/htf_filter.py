"""Graduated higher-timeframe filter for ALIVEDESTINY.

`confluence.higher_timeframe_bias()` (reused here unchanged) gives the raw
1H read; `confluence.opposes()` is strictly binary veto-only, built for the
confluence engine's own gate chain. ALIVEDESTINY wants a genuinely
graduated response instead — prefer aligned/neutral, and let an admin
choose whether a conflict is only noted, downgrades the setup, or rejects
it outright — so this is new logic layered on top of the same raw bias
read, not a change to `confluence.opposes()` (which the confluence engine
still needs untouched).
"""


def evaluate(verdict_direction, htf_bias, mode):
    """`verdict_direction` is 1 for a bullish call, -1 for bearish.
    `htf_bias` is "up"/"down"/"range"/None. `mode` is
    alivedestiny_settings.htf_filter_mode: "advisory" (never blocks),
    "downgrade" (flagged but never blocks), or "strict_veto" (a real
    conflict rejects the setup). Returns {"outcome", "reason"} —
    "outcome" is one of ALIGNED/NEUTRAL/DOWNGRADED/REJECTED."""
    agree_bias = "up" if verdict_direction == 1 else "down"
    oppose_bias = "down" if verdict_direction == 1 else "up"

    if htf_bias == agree_bias:
        return {"outcome": "ALIGNED", "reason": f"1H bias ({htf_bias}) agrees with the call"}
    if htf_bias in (None, "range"):
        return {"outcome": "NEUTRAL", "reason": "1H bias is unavailable or ranging — no conflict"}

    # htf_bias == oppose_bias from here.
    if mode == "strict_veto":
        return {
            "outcome": "REJECTED",
            "reason": f"1H bias ({htf_bias}) opposes the call — rejected under strict HTF filtering",
        }
    if mode == "downgrade":
        return {"outcome": "DOWNGRADED", "reason": f"1H bias ({htf_bias}) opposes the call — downgraded, not blocked"}
    return {"outcome": "DOWNGRADED", "reason": f"1H bias ({htf_bias}) opposes the call — advisory only, noted"}

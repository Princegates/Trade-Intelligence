"""Optional, additive commentary on an already-decided signal.

The verdict itself always comes from the rule-based engine
(src/signals/engine.py) — nothing here ever decides BUY/SELL/HOLD. This
module only asks an LLM to write a paragraph *about* a call that has already
been made, using an admin-configured provider (see web/src/lib/demo-data.ts's
SETTINGS_PROVIDERS.ai and /admin/settings). If that provider is unset,
unreachable, rate-limited, or returns anything unexpected, the caller gets
None back and the run continues exactly as it would have before this module
existed — a missing "AI take" is invisible on the dashboard (see
src/lib/signal-view.ts's aiCommentary), not a failure.

Only Google Gemini is implemented for now, since it's the provider with a
genuine standing free tier rather than a one-time trial credit. Structured so
another provider can be added later without changing run.py: the dispatch is
on settings["provider"], and an unknown provider just returns None.
"""

import requests

TIMEOUT = 30
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"

# Keeps the paragraph short enough to sit comfortably in a signal card next
# to the deterministic summary, not replace the page.
MAX_OUTPUT_TOKENS = 220


def _format_signal(signal):
    levels = signal.get("levels") or {}
    level_bits = []
    if levels.get("entry") is not None:
        level_bits.append(f"entry {levels['entry']}, stop {levels['stop']}, target {levels['target']}")
    elif levels.get("buy_above") is not None:
        level_bits.append(f"buy above {levels['buy_above']}, sell below {levels['sell_below']}")
    levels_text = f" Levels: {level_bits[0]}." if level_bits else ""

    patterns = signal.get("patterns") or []
    patterns_text = f" Candlestick patterns: {', '.join(patterns)}." if patterns else ""

    reasoning = "; ".join(signal.get("reasoning") or [])

    return (
        f"{signal['symbol']} {signal['timeframe']} — verdict {signal['verdict']} (score {signal['score']:+d}) "
        f"at price {signal['price']}. Reasoning the rule-based engine already used: {reasoning}.{levels_text}"
        f"{patterns_text}"
    )


def _build_prompt(signal):
    return (
        "You are writing a short, additional commentary paragraph for a trading dashboard. "
        "A rule-based system has already decided the verdict below — do not change it, second-guess it, "
        "or state a different verdict. Do not give financial advice or tell the reader what to do. "
        "Write 2-4 sentences in plain English that add color: what about the reasoning stands out, "
        "how confidently the signals line up, and what would call the setup into question. "
        "No markdown, no bullet points, no headers — plain prose only.\n\n"
        f"{_format_signal(signal)}"
    )


def _generate_gemini(signal, config):
    api_key = (config or {}).get("api_key")
    if not api_key:
        print("[warn] AI commentary (gemini): no API key saved in /admin/settings")
        return None
    model = (config or {}).get("model") or DEFAULT_GEMINI_MODEL

    try:
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": api_key},
            json={
                "contents": [{"parts": [{"text": _build_prompt(signal)}]}],
                "generationConfig": {"maxOutputTokens": MAX_OUTPUT_TOKENS, "temperature": 0.4},
            },
            timeout=TIMEOUT,
        )
        if not response.ok:
            # Same diagnostic as the chat widget's gemini-chat.ts: the body
            # carries the actual reason (bad key, unknown model, rate limit),
            # which response.raise_for_status()'s message alone would not.
            print(f"[warn] AI commentary (gemini) {response.status_code}: {response.text[:500]}")
            return None
        data = response.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return text or None
    except Exception as exc:
        print(f"[warn] AI commentary (gemini) failed: {exc}")
        return None


_GENERATORS = {"gemini": _generate_gemini}


def generate(signal, settings):
    """`signal` is a plain dict (symbol, timeframe, verdict, score,
    reasoning, patterns, levels, price). `settings` is what
    supabase.get_active_ai_settings() returns: {"provider": ..., "config":
    {...}}. Returns the commentary text, or None if there's nothing to
    generate with or generation failed — always safe to call."""
    if not settings:
        return None
    generator = _GENERATORS.get(settings.get("provider"))
    if not generator:
        print(f"[warn] AI commentary: no generator for provider {settings.get('provider')!r}")
        return None
    return generator(signal, settings.get("config"))

from src.ai import commentary


def _signal(**overrides):
    base = {
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "verdict": "BUY",
        "score": 2,
        "reasoning": ["Price above a bullishly stacked EMA line", "RSI(14) at 58.2 — neutral"],
        "patterns": ["bullish engulfing"],
        "levels": {"entry": 68420.5, "stop": 68275.2, "target": 68638.4},
        "price": 68420.5,
    }
    base.update(overrides)
    return base


class _Response:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status = status

    def raise_for_status(self):
        if self.status >= 400:
            raise RuntimeError(f"HTTP {self.status}")

    def json(self):
        return self._payload


def _gemini_payload(text):
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def test_no_settings_means_no_commentary():
    assert commentary.generate(_signal(), None) is None


def test_unknown_provider_returns_none_rather_than_raising():
    assert commentary.generate(_signal(), {"provider": "openai", "config": {"api_key": "x"}}) is None


def test_missing_api_key_returns_none():
    assert commentary.generate(_signal(), {"provider": "gemini", "config": {}}) is None


def test_gemini_success_returns_the_generated_text(monkeypatch):
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return _Response(_gemini_payload("  Momentum and trend line up cleanly here.  "))

    monkeypatch.setattr(commentary.requests, "post", fake_post)

    text = commentary.generate(_signal(), {"provider": "gemini", "config": {"api_key": "k"}})

    assert text == "Momentum and trend line up cleanly here."
    assert captured["url"].endswith(f"models/{commentary.DEFAULT_GEMINI_MODEL}:generateContent")
    assert captured["params"]["key"] == "k"
    assert "BTCUSDT" in captured["json"]["contents"][0]["parts"][0]["text"]


def test_gemini_uses_the_configured_model_when_given(monkeypatch):
    captured = {}

    def fake_post(url, **kwargs):
        captured["url"] = url
        return _Response(_gemini_payload("text"))

    monkeypatch.setattr(commentary.requests, "post", fake_post)

    commentary.generate(_signal(), {"provider": "gemini", "config": {"api_key": "k", "model": "gemini-2.5-pro"}})

    assert captured["url"].endswith("models/gemini-2.5-pro:generateContent")


def test_gemini_http_error_is_swallowed_not_raised(monkeypatch):
    monkeypatch.setattr(commentary.requests, "post", lambda *a, **k: _Response({}, status=429))

    assert commentary.generate(_signal(), {"provider": "gemini", "config": {"api_key": "k"}}) is None


def test_gemini_network_failure_is_swallowed_not_raised(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("timed out")

    monkeypatch.setattr(commentary.requests, "post", boom)

    assert commentary.generate(_signal(), {"provider": "gemini", "config": {"api_key": "k"}}) is None


def test_gemini_malformed_response_is_swallowed_not_raised(monkeypatch):
    monkeypatch.setattr(commentary.requests, "post", lambda *a, **k: _Response({"unexpected": "shape"}))

    assert commentary.generate(_signal(), {"provider": "gemini", "config": {"api_key": "k"}}) is None


def test_gemini_empty_text_returns_none(monkeypatch):
    monkeypatch.setattr(commentary.requests, "post", lambda *a, **k: _Response(_gemini_payload("   ")))

    assert commentary.generate(_signal(), {"provider": "gemini", "config": {"api_key": "k"}}) is None


def test_prompt_never_asks_the_model_to_change_the_verdict():
    prompt = commentary._build_prompt(_signal())

    assert "do not change it" in prompt.lower()
    assert "BUY" in prompt

import importlib

import pytest

from src import config


@pytest.fixture(autouse=True)
def restore_config():
    """Each test reloads the module under a patched environment; reload once
    more afterwards so the real environment is back for everything else."""
    yield
    importlib.reload(config)


def test_unset_binance_host_falls_back_to_the_us_endpoint():
    # api.binance.com answers 451 to the US IPs that GitHub Actions runs on.
    assert "binance.us" in importlib.reload(config).BINANCE_BASE_URL


def test_empty_binance_host_does_not_override_the_default(monkeypatch):
    # Actions sets an unconfigured variable to "", which a get() default would
    # happily accept and then fail every fetch against an empty URL.
    monkeypatch.setenv("BINANCE_BASE_URL", "")
    assert "binance.us" in importlib.reload(config).BINANCE_BASE_URL


def test_binance_host_can_be_overridden(monkeypatch):
    # Binance.US blocks non-US callers, so local runs need the global host.
    monkeypatch.setenv("BINANCE_BASE_URL", "https://api.binance.com/api/v3/klines")
    assert importlib.reload(config).BINANCE_BASE_URL == "https://api.binance.com/api/v3/klines"

import re
from pathlib import Path

from src import config

WEB_VERSION_FILE = Path(__file__).resolve().parent.parent / "web" / "src" / "lib" / "guda-special-version.ts"


def test_dashboard_reads_the_version_the_engine_publishes():
    # The dashboard shows only the current version's GUDA SPECIAL signals, so
    # a version bump here without the web constant would leave the cards on
    # "Waiting for the first ... signal" forever.
    match = re.search(r'GUDA_SPECIAL_STRATEGY_VERSION = "([^"]+)"', WEB_VERSION_FILE.read_text())
    assert match, f"GUDA_SPECIAL_STRATEGY_VERSION not found in {WEB_VERSION_FILE}"
    assert match.group(1) == config.GUDA_SPECIAL_STRATEGY_VERSION

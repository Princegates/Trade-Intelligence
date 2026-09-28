/** The GUDA SPECIAL version the engine publishes today — mirrors
 * GUDA_SPECIAL_STRATEGY_VERSION in src/config.py, and
 * tests/test_guda_special_version_sync.py fails if the two drift apart.
 * The dashboard shows only this version's signals: an older version's last
 * call was made by rules this one replaced, so it isn't the latest call. */
export const GUDA_SPECIAL_STRATEGY_VERSION = "guda-special-1.1.0";

/** The version as people read it: "1.1.0". */
export const GUDA_SPECIAL_VERSION_LABEL = GUDA_SPECIAL_STRATEGY_VERSION.replace(/^guda-special-/, "");

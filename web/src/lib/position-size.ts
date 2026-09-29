// The "Position size" calculator on signal cards: what a trade of a given
// lot size would lose at the stop and make at the target, in money and as a
// share of the account. Pure, so it's tested without a browser.

/** Units per standard lot on Exness (1 BTC, 100 troy ounces of gold), plus
 * the unit's name. Other brokers can differ, which the calculator says. */
export const CONTRACTS: Record<string, { lotSize: number; unit: string }> = {
  BTCUSDT: { lotSize: 1, unit: "BTC" },
  XAUUSD: { lotSize: 100, unit: "oz" },
};

// Exness's smallest lot and lot step.
export const LOT_STEP = 0.01;

/** Above this share of the account at the stop, the calculator warns. */
export const HIGH_RISK_PCT = 2;

export interface LotOutcome {
  /** How much of the market the lots buy or sell, in the contract's unit. */
  units: number;
  /** Money lost if the stop is hit, and made if the target is. */
  loss: number;
  gain: number | null;
  /** Those as a percent of the balance; null without a balance. */
  lossPct: number | null;
  gainPct: number | null;
}

export function lotOutcome({
  lots,
  entry,
  stop,
  target,
  lotSize,
  balance,
}: {
  lots: number;
  entry: number;
  stop: number;
  target: number | null;
  lotSize: number;
  balance: number | null;
}): LotOutcome | null {
  const stopDistance = Math.abs(entry - stop);
  if (!(lots > 0) || !(stopDistance > 0) || !(lotSize > 0)) return null;

  const units = lots * lotSize;
  const loss = units * stopDistance;
  const gain = target === null ? null : units * Math.abs(target - entry);
  const pct = (amount: number | null) =>
    amount !== null && balance !== null && balance > 0 ? (amount / balance) * 100 : null;
  return { units, loss, gain, lossPct: pct(loss), gainPct: pct(gain) };
}

// Position sizing for the "Position size" calculator on signal cards:
// how big a position risks a chosen share of the account if the stop is
// hit. Pure, so it's tested without a browser.

/** Units per standard lot on Exness (1 BTC, 100 troy ounces of gold), plus
 * the unit's name. Other brokers can differ, which the calculator says. */
export const CONTRACTS: Record<string, { lotSize: number; unit: string }> = {
  BTCUSDT: { lotSize: 1, unit: "BTC" },
  XAUUSD: { lotSize: 100, unit: "oz" },
};

// Exness's smallest lot and lot step.
export const LOT_STEP = 0.01;

export interface PositionSize {
  /** Money lost if the stop is hit. */
  riskAmount: number;
  /** Size that loses exactly riskAmount at the stop. */
  units: number;
  /** units in lots, rounded down to LOT_STEP so the risk never exceeds the
   * plan; 0 when even the smallest lot would risk too much. */
  lots: number;
  /** What the rounded-down lots actually risk, and make at the target. */
  lotsRisk: number;
  lotsReward: number | null;
  /** Money lost at the stop with the smallest lot, for when lots is 0. */
  minLotRisk: number;
}

export function positionSize({
  balance,
  riskPct,
  entry,
  stop,
  target,
  lotSize,
}: {
  balance: number;
  riskPct: number;
  entry: number;
  stop: number;
  target: number | null;
  lotSize: number;
}): PositionSize | null {
  const stopDistance = Math.abs(entry - stop);
  if (!(balance > 0) || !(riskPct > 0) || !(stopDistance > 0) || !(lotSize > 0)) return null;

  const riskAmount = (balance * riskPct) / 100;
  const units = riskAmount / stopDistance;
  // The small epsilon keeps 0.03 lots from flooring to 0.02 on float noise.
  const lots = Math.floor(units / lotSize / LOT_STEP + 1e-9) * LOT_STEP;
  const lotUnits = lots * lotSize;
  return {
    riskAmount,
    units,
    lots,
    lotsRisk: lotUnits * stopDistance,
    lotsReward: target === null ? null : lotUnits * Math.abs(target - entry),
    minLotRisk: LOT_STEP * lotSize * stopDistance,
  };
}

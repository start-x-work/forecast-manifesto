/**
 * 価格受容：Van Westendorp Price Sensitivity Meter の公開集計。
 *
 * 業界別の Price Adjustment 実係数は非公開（docs/05-boundaries.md）。
 * 本モジュールが出すのは調査4問からの交点（IPP / OPP / PMC / PME）だけ。
 *
 * 各回答者は4つの価格を答える：
 *   tooCheap / cheap / expensive / tooExpensive
 * 単調性（tooCheap ≤ cheap ≤ expensive ≤ tooExpensive）を満たさない票は除外する。
 */

export interface PsmResponse {
  tooCheap: number;
  cheap: number;
  expensive: number;
  tooExpensive: number;
}

export interface PsmResult {
  nValid: number;
  nDropped: number;
  /** Indifference Price Point：Cheap 累積 ∩ Expensive 累積 */
  ipp: number;
  /** Optimal Price Point：TooCheap 累積 ∩ TooExpensive 累積 */
  opp: number;
  /** Point of Marginal Cheapness：TooCheap ∩ Expensive */
  pmc: number;
  /** Point of Marginal Expensiveness：Cheap ∩ TooExpensive */
  pme: number;
}

function cumulativeAt(prices: number[], p: number, direction: "ge" | "le"): number {
  if (prices.length === 0) return 0;
  let c = 0;
  for (const x of prices) {
    if (direction === "ge" ? x >= p : x <= p) c++;
  }
  return c / prices.length;
}

function isMonotone(r: PsmResponse): boolean {
  return (
    Number.isFinite(r.tooCheap) &&
    Number.isFinite(r.cheap) &&
    Number.isFinite(r.expensive) &&
    Number.isFinite(r.tooExpensive) &&
    r.tooCheap <= r.cheap &&
    r.cheap <= r.expensive &&
    r.expensive <= r.tooExpensive
  );
}

/** 2本の折れ線（y1, y2）が交差する価格。格子上で |y1-y2| 最小の点。 */
function intersection(grid: number[], y1: number[], y2: number[]): number {
  let best = grid[0];
  let bestGap = Infinity;
  for (let i = 0; i < grid.length; i++) {
    const gap = Math.abs(y1[i] - y2[i]);
    if (gap < bestGap) {
      bestGap = gap;
      best = grid[i];
    }
  }
  return best;
}

/**
 * Van Westendorp の4交点を返す。
 *
 * 累積の向き：
 *   TooCheap(P) / Cheap(P) = その価格以上を「安すぎ／安い」とした割合（右下がり）
 *   Expensive(P) / TooExpensive(P) = その価格以下を「高い／高すぎ」とした割合（右上がり）
 */
export function vanWestendorp(responses: PsmResponse[]): PsmResult {
  if (!Array.isArray(responses) || responses.length === 0) {
    throw new RangeError("responses must be a non-empty array");
  }
  const valid = responses.filter(isMonotone);
  const nDropped = responses.length - valid.length;
  if (valid.length === 0) {
    throw new RangeError("no monotone PSM responses remain");
  }

  const tooCheap = valid.map((r) => r.tooCheap);
  const cheap = valid.map((r) => r.cheap);
  const expensive = valid.map((r) => r.expensive);
  const tooExpensive = valid.map((r) => r.tooExpensive);

  const grid = [...new Set([...tooCheap, ...cheap, ...expensive, ...tooExpensive])].sort(
    (a, b) => a - b,
  );

  const tc = grid.map((p) => cumulativeAt(tooCheap, p, "ge"));
  const ch = grid.map((p) => cumulativeAt(cheap, p, "ge"));
  const ex = grid.map((p) => cumulativeAt(expensive, p, "le"));
  const te = grid.map((p) => cumulativeAt(tooExpensive, p, "le"));

  return {
    nValid: valid.length,
    nDropped,
    ipp: intersection(grid, ch, ex),
    opp: intersection(grid, tc, te),
    pmc: intersection(grid, tc, ex),
    pme: intersection(grid, ch, te),
  };
}

/**
 * 基準価格（OPP 等）に対する相対価格から、公開可能な乗数を作る。
 * priceAdj = (reference / observed) ** elasticity
 *
 * 弾力性そのものは呼び出し側が渡す。業界別実係数は入れない。
 */
export function priceAdjustmentFromRelative(
  observedPrice: number,
  referencePrice: number,
  elasticity: number,
): number {
  if (!(observedPrice > 0) || !(referencePrice > 0)) {
    throw new RangeError("prices must be positive");
  }
  if (!Number.isFinite(elasticity) || elasticity < 0) {
    throw new RangeError("elasticity must be a non-negative finite number");
  }
  return (referencePrice / observedPrice) ** elasticity;
}

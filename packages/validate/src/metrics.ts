/**
 * 予測誤差の指標。pairs は { predicted, actual } の配列。
 *
 * MAPE は actual = 0 のペアを除外して計算する（ゼロ割回避——README/docs に明記）。
 */

export interface PredictionPair {
  predicted: number;
  actual: number;
}

function assertNonEmpty(pairs: PredictionPair[], name: string): void {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new RangeError(`${name} requires a non-empty array of pairs`);
  }
}

/** 平均絶対誤差。 */
export function mae(pairs: PredictionPair[]): number {
  assertNonEmpty(pairs, "mae");
  let s = 0;
  for (const p of pairs) s += Math.abs(p.predicted - p.actual);
  return s / pairs.length;
}

/** 二乗平均平方根誤差。 */
export function rmse(pairs: PredictionPair[]): number {
  assertNonEmpty(pairs, "rmse");
  let s = 0;
  for (const p of pairs) s += (p.predicted - p.actual) ** 2;
  return Math.sqrt(s / pairs.length);
}

/**
 * 平均絶対パーセント誤差（%）。actual = 0 のペアは除外する。
 * @throws {RangeError} 除外後にペアが残らない場合
 */
export function mape(pairs: PredictionPair[]): number {
  assertNonEmpty(pairs, "mape");
  const nonZero = pairs.filter((p) => p.actual !== 0);
  if (nonZero.length === 0) {
    throw new RangeError("mape requires at least one pair with actual != 0 (zero-actual pairs are excluded)");
  }
  let s = 0;
  for (const p of nonZero) s += Math.abs((p.predicted - p.actual) / p.actual);
  return (s / nonZero.length) * 100;
}

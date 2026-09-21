/**
 * 増分性の算術（iROAS・リフト・差の正規近似区間）。
 *
 * GeoLift / MMM の再実装はしない。入力は「やらなかった世界」との差分として
 * 既に定義された観測値（テスト群・対照群の平均と標本サイズ、または増分売上と追加出稿）。
 * 設計の考え方は docs/06-incrementality.md。
 */

export interface GroupMoments {
  /** 群平均（売上・CV など同一単位） */
  mean: number;
  /** 群標本サイズ */
  n: number;
  /** 不偏分散。省略時は区間を出さない */
  variance?: number;
}

export interface MeanDiffInterval {
  estimate: number;
  se: number;
  ci: [number, number];
  /** 正規近似の両側区間。既定 0.95 */
  level: number;
}

function assertFinitePositive(name: string, v: number): void {
  if (!Number.isFinite(v) || v <= 0) {
    throw new RangeError(`${name} must be a positive finite number, received ${v}`);
  }
}

function assertFinite(name: string, v: number): void {
  if (!Number.isFinite(v)) {
    throw new RangeError(`${name} must be finite, received ${v}`);
  }
}

/** 相対リフト = treated / control − 1。対照平均が 0 なら throw。 */
export function relativeLift(treatedMean: number, controlMean: number): number {
  assertFinite("treatedMean", treatedMean);
  assertFinite("controlMean", controlMean);
  if (controlMean === 0) {
    throw new RangeError("relativeLift requires a non-zero control mean");
  }
  return treatedMean / controlMean - 1;
}

/** 増分売上 = (treated − control) × treatedN */
export function incrementalOutcome(treated: GroupMoments, control: GroupMoments): number {
  assertFinite("treated.mean", treated.mean);
  assertFinite("control.mean", control.mean);
  assertFinitePositive("treated.n", treated.n);
  assertFinitePositive("control.n", control.n);
  return (treated.mean - control.mean) * treated.n;
}

/**
 * iROAS = 増分売上 / 追加出稿費。
 * 点推定のみ。区間は iroasWithInterval。
 */
export function iroas(incrementalRevenue: number, incrementalSpend: number): number {
  assertFinite("incrementalRevenue", incrementalRevenue);
  assertFinite("incrementalSpend", incrementalSpend);
  if (incrementalSpend === 0) {
    throw new RangeError("iroas requires non-zero incremental spend");
  }
  return incrementalRevenue / incrementalSpend;
}

/**
 * 差の平均の正規近似区間（両側）。z_0.975 ≈ 1.959964。
 * 分散が片方でも欠けていれば throw。
 */
export function meanDifferenceInterval(
  treated: GroupMoments,
  control: GroupMoments,
  level = 0.95,
): MeanDiffInterval {
  if (treated.variance === undefined || control.variance === undefined) {
    throw new RangeError("meanDifferenceInterval requires variance on both groups");
  }
  assertFinitePositive("treated.n", treated.n);
  assertFinitePositive("control.n", control.n);
  if (!(treated.variance >= 0) || !(control.variance >= 0)) {
    throw new RangeError("variance must be non-negative");
  }
  if (level <= 0 || level >= 1) {
    throw new RangeError(`level must be within (0, 1), received ${level}`);
  }
  const estimate = treated.mean - control.mean;
  const se = Math.sqrt(treated.variance / treated.n + control.variance / control.n);
  // 両側 95% の z。他の level は粗く正規分位点を線形近似せず、0.95 以外は
  // よく使う 90/99 のみハードコード。
  const z = level === 0.9 ? 1.644854 : level === 0.99 ? 2.575829 : 1.959964;
  if (level !== 0.9 && level !== 0.95 && level !== 0.99) {
    throw new RangeError("level must be 0.9, 0.95, or 0.99");
  }
  return { estimate, se, ci: [estimate - z * se, estimate + z * se], level };
}

/**
 * iROAS の区間：差の平均区間を treated.n / incrementalSpend で線形変換。
 * spend は確定値とみなす（出稿費の計測誤差はモデルに入れない）。
 */
export function iroasWithInterval(
  treated: GroupMoments,
  control: GroupMoments,
  incrementalSpend: number,
  level = 0.95,
): MeanDiffInterval {
  assertFinite("incrementalSpend", incrementalSpend);
  if (incrementalSpend === 0) {
    throw new RangeError("iroasWithInterval requires non-zero incremental spend");
  }
  const diff = meanDifferenceInterval(treated, control, level);
  const scale = treated.n / incrementalSpend;
  return {
    estimate: diff.estimate * scale,
    se: diff.se * Math.abs(scale),
    ci: [diff.ci[0] * scale, diff.ci[1] * scale],
    level: diff.level,
  };
}

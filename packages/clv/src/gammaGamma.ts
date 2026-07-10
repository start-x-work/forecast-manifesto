/**
 * Gamma-Gamma モデル（購買金額）。Colombo & Jiang / Fader-Hardie。
 *
 * 顧客 i の取引あたり平均金額の期待 E(M) を、観測平均 m_x と取引回数 x から
 * 縮小推定する。頻度と金額の独立性を仮定するため、独立性チェック関数を備える。
 *
 * パラメータ:
 *   p     … 個人の支出 Gamma の形状
 *   q, γ  … 個人の支出率 ν の事前 Gamma(q, γ)
 */

import { lnGamma, nelderMead } from "./math.js";
import type { Rfm } from "./rfm.js";

export interface GgParams {
  p: number;
  q: number;
  gamma: number;
}

export interface IndependenceCheck {
  /** frequency と monetary の Pearson 相関 */
  correlation: number;
  /** |correlation| が閾値未満なら true（独立仮定が妥当） */
  independent: boolean;
  threshold: number;
}

/**
 * 頻度と金額の独立性チェック。Gamma-Gamma は両者の独立を仮定するため、
 * 相関が強い場合は推定の妥当性を疑う警告材料になる。
 * frequency ≥ 1 かつ monetary > 0 の顧客のみで相関を計算する。
 */
export function checkFrequencyMonetaryIndependence(
  rfm: Rfm[],
  threshold = 0.1,
): IndependenceCheck {
  const rows = rfm.filter((c) => c.frequency >= 1 && c.monetary > 0);
  const n = rows.length;
  if (n < 2) {
    return { correlation: 0, independent: true, threshold };
  }
  let sx = 0, sy = 0;
  for (const c of rows) {
    sx += c.frequency;
    sy += c.monetary;
  }
  const mx = sx / n;
  const my = sy / n;
  let cov = 0, vx = 0, vy = 0;
  for (const c of rows) {
    const dx = c.frequency - mx;
    const dy = c.monetary - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  const denom = Math.sqrt(vx * vy);
  const correlation = denom === 0 ? 0 : cov / denom;
  return { correlation, independent: Math.abs(correlation) < threshold, threshold };
}

/** 個票の Gamma-Gamma 対数尤度（frequency ≥ 1, monetary > 0）。 */
function individualLogLik(p: number, q: number, v: number, x: number, m: number): number {
  return (
    lnGamma(p * x + q) -
    lnGamma(p * x) -
    lnGamma(q) +
    q * Math.log(v) +
    (p * x - 1) * Math.log(m) +
    p * x * Math.log(x) -
    (p * x + q) * Math.log(x * m + v)
  );
}

export interface FitGammaGammaResult extends GgParams {
  logLik: number;
  independence: IndependenceCheck;
}

export interface FitGammaGammaOptions {
  maxIterations?: number;
  tolerance?: number;
  /** 独立性警告の相関閾値（既定 0.1） */
  independenceThreshold?: number;
  /** true のとき相関が強ければ console.warn（既定 true） */
  warn?: boolean;
}

/**
 * Gamma-Gamma を最尤推定する（Nelder-Mead, 対数空間）。
 * frequency ≥ 1 かつ monetary > 0 の顧客のみを用いる。
 *
 * @throws {RangeError} 対象顧客が存在しない場合
 */
export function fitGammaGamma(rfm: Rfm[], opts: FitGammaGammaOptions = {}): FitGammaGammaResult {
  const rows = rfm.filter((c) => c.frequency >= 1 && c.monetary > 0);
  if (rows.length === 0) {
    throw new RangeError("fitGammaGamma requires customers with frequency >= 1 and monetary > 0");
  }

  const independence = checkFrequencyMonetaryIndependence(
    rfm,
    opts.independenceThreshold ?? 0.1,
  );
  if ((opts.warn ?? true) && !independence.independent) {
    // 独立性チェックの警告
    console.warn(
      `[gamma-gamma] frequency と monetary の相関が ${independence.correlation.toFixed(3)} で ` +
        `閾値 ${independence.threshold} を超過。金額モデルの独立仮定が崩れている可能性があります。`,
    );
  }

  const n = rows.length;
  const negMeanLL = (logParams: number[]): number => {
    const p = Math.exp(logParams[0]);
    const q = Math.exp(logParams[1]);
    const v = Math.exp(logParams[2]);
    let ll = 0;
    for (const c of rows) ll += individualLogLik(p, q, v, c.frequency, c.monetary);
    if (!Number.isFinite(ll)) return 1e12;
    return -ll / n;
  };

  const res = nelderMead(negMeanLL, [0, 0, 0], {
    maxIterations: opts.maxIterations ?? 500,
    tolerance: opts.tolerance ?? 1e-10,
  });

  const params: GgParams = {
    p: Math.exp(res.x[0]),
    q: Math.exp(res.x[1]),
    gamma: Math.exp(res.x[2]),
  };
  let logLik = 0;
  for (const c of rows) logLik += individualLogLik(params.p, params.q, params.gamma, c.frequency, c.monetary);

  return { ...params, logLik, independence };
}

/**
 * 顧客の取引あたり期待平均金額 E(M | x, m_x)。
 * 個人観測 m_x と母集団平均を、取引回数に応じて加重した縮小推定。
 * frequency = 0 の顧客は母集団平均 γp/(q−1) を返す。
 */
export function expectedAvgValue(c: Rfm, gg: GgParams): number {
  const { p, q, gamma } = gg;
  const populationMean = (gamma * p) / (q - 1);
  if (c.frequency <= 0 || c.monetary <= 0) return populationMean;
  const weight = (p * c.frequency) / (p * c.frequency + q - 1);
  return (1 - weight) * populationMean + weight * c.monetary;
}

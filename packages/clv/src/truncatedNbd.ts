/**
 * ゼロ切断 NBD（zero-truncated NBD）による (M, K) 同定。
 *
 * 購入者しか観測できないデータ（会員購買ログ・POS の購入者集計など）では、
 * 「買った人の平均購入回数 m」と「リピート率 repeatRate」の 2 つの観測値から
 * 母集団の NBD パラメータ (M, K) を逆算できる：
 *
 *   E[r | r≥1] = M / (1 − P0)                = m
 *   P(r≥2 | r≥1) = 1 − P1 / (1 − P0)         = repeatRate
 *
 *   P0 = (1+M/K)^(−K)、P1 = nbdPmf(1, M, K)
 *
 * @forecast-manifesto/solver の identifyK と同じ契約：
 * 収束 1e-10・最大 200 反復・解なし（数理的矛盾）は明示的に throw。
 *
 * 解法は二分法パターンの拡張（入れ子の二分法）：
 *   内側：K を固定し、E[r|r≥1] = m を満たす M を二分法で解く
 *         （M ∈ (0, m)。M/(1−P0) は M について単調増加、M→0 で 1、M→m 未満で m 超）
 *   外側：暗黙の repeatRate(K) − 目標 を K の二分法で解く
 *         （m 固定のとき暗黙のリピート率は K について単調増加：
 *          K→0 で対数級数分布の下限、K→∞ でポアソンの上限に挟まれる）
 */

import { nbdPmf, zeroPurchaseProbability } from "@forecast-manifesto/solver";

export interface FitTruncatedNbdOptions {
  /** K の探索下限（既定 1e-6） */
  lower?: number;
  /** K の探索上限（既定 1e6） */
  upper?: number;
  /** 収束判定 |f| < tolerance（既定 1e-10） */
  tolerance?: number;
  /** 外側二分法の最大反復回数（既定 200） */
  maxIterations?: number;
}

export interface FitTruncatedNbdResult {
  /** 一人あたり平均購入回数（母集団、非購入者含む） */
  M: number;
  /** 形状パラメータ */
  K: number;
  /** 外側二分法の反復回数 */
  iterations: number;
}

/** K を固定して E[r | r≥1] = m を満たす M を二分法で解く。 */
function solveMGivenK(m: number, K: number, tolerance: number): number {
  // g(M) = M / (1 − P0(M,K)) は単調増加。g(0+) = 1, g(M) < m ⇒ M < m なので (0, m) に解。
  let lo = Number.MIN_VALUE;
  let hi = m; // g(m) = m / (1−P0) > m なので上側で符号が変わる
  const g = (M: number): number => M / (1 - zeroPurchaseProbability(M, K)) - m;
  // lo 側は g→1−m < 0（m>1 が前提）
  for (let i = 0; i < 400; i++) {
    const mid = 0.5 * (lo + hi);
    const val = g(mid);
    if (Math.abs(val) < tolerance) return mid;
    if (val < 0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** (M, K) が与えられたときの暗黙のリピート率 1 − P1/(1−P0)。 */
function impliedRepeatRate(M: number, K: number): number {
  const p0 = zeroPurchaseProbability(M, K);
  return 1 - nbdPmf(1, M, K) / (1 - p0);
}

/**
 * ゼロ切断 NBD の 2 変数同定。
 *
 * @param m 購入者の平均購入回数 E[r | r≥1]（> 1）
 * @param repeatRate リピート率 P(r≥2 | r≥1)（0 < repeatRate < 1）
 * @param opts 探索オプション
 * @returns { M, K, iterations }
 * @throws {RangeError} 入力が不正、または m と repeatRate が数理的に矛盾して解を持たない場合
 *
 * 必要条件：m ≥ 1 + repeatRate（リピーターは最低 2 回買うため）。
 * さらに K∈(0,∞) で暗黙のリピート率は（m 固定で）対数級数分布〜ポアソンの間に
 * 挟まれるため、その範囲外の repeatRate も解なしとして throw する。
 */
export function fitTruncatedNbd(
  m: number,
  repeatRate: number,
  opts: FitTruncatedNbdOptions = {},
): FitTruncatedNbdResult {
  if (!Number.isFinite(m) || m <= 1) {
    throw new RangeError(
      `m (mean purchases among buyers) must be > 1, received ${m}. ` +
        `m = 1 would mean nobody repeats (degenerate); m < 1 is impossible for r >= 1.`,
    );
  }
  if (!Number.isFinite(repeatRate) || repeatRate <= 0 || repeatRate >= 1) {
    throw new RangeError(`repeatRate must be within (0, 1), received ${repeatRate}`);
  }
  // 必要条件：平均は最低でも 1·(1−repeatRate) + 2·repeatRate = 1 + repeatRate
  if (m < 1 + repeatRate) {
    throw new RangeError(
      `inconsistent inputs: m=${m} < 1 + repeatRate = ${1 + repeatRate}. ` +
        `Repeat buyers purchase at least twice, so the buyer mean must be at least 1 + repeatRate.`,
    );
  }

  const lower = opts.lower ?? 1e-6;
  const upper = opts.upper ?? 1e6;
  const tolerance = opts.tolerance ?? 1e-10;
  const maxIterations = opts.maxIterations ?? 200;

  // h(K) = impliedRepeatRate(M(K), K) − repeatRate。K について単調増加。
  const h = (K: number): number => {
    const M = solveMGivenK(m, K, tolerance);
    return impliedRepeatRate(M, K) - repeatRate;
  };

  const hLower = h(lower);
  const hUpper = h(upper);

  if (hLower > 0) {
    // 目標リピート率が K→0（対数級数）の下限より小さい
    throw new RangeError(
      `no solution: repeatRate=${repeatRate} is below the zero-truncated NBD minimum ` +
        `(${(repeatRate + hLower).toFixed(6)} at K=${lower}) for m=${m}. ` +
        `The inputs are mathematically inconsistent.`,
    );
  }
  if (hUpper < 0) {
    // 目標リピート率が K→∞（ポアソン）の上限より大きい
    throw new RangeError(
      `no solution: repeatRate=${repeatRate} exceeds the zero-truncated NBD maximum ` +
        `(${(repeatRate + hUpper).toFixed(6)} as K → ∞, the Poisson limit) for m=${m}. ` +
        `The inputs are mathematically inconsistent.`,
    );
  }

  let lo = lower;
  let hi = upper;
  let iterations = 0;
  let K = 0.5 * (lo + hi);
  for (; iterations < maxIterations; iterations++) {
    // K は桁が広いため対数スケールの中点で刻む
    K = Math.exp(0.5 * (Math.log(lo) + Math.log(hi)));
    const val = h(K);
    if (Math.abs(val) < tolerance) {
      iterations++;
      break;
    }
    if (val < 0) lo = K;
    else hi = K;
  }

  const M = solveMGivenK(m, K, tolerance);
  return { M, K, iterations };
}

/**
 * ゼロ切断分布 P(r | r≥1)（r = 1..n）を返す。
 *
 * @throws {RangeError} n が正の整数でない場合
 */
export function truncatedNbdDistribution(M: number, K: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`n must be a positive integer, received ${n}`);
  }
  const denom = 1 - zeroPurchaseProbability(M, K);
  const out: number[] = [];
  for (let r = 1; r <= n; r++) out.push(nbdPmf(r, M, K) / denom);
  return out;
}

/**
 * 今年 r 回買った顧客の、翌年（同じ長さの期間）の期待購買回数（逓減込み）。
 *
 * ガンマ・ポアソンの事後平均：E[λ | r] = M(K + r)/(M + K)。
 * ヘビーユーザーほど翌年は平均へ回帰する（逓減）——r が大きいほど
 * 期待値は r より小さくなり、r が小さい顧客はわずかに増える。
 */
export function expectedNextPeriodPurchases(r: number, M: number, K: number): number {
  if (!Number.isInteger(r) || r < 0) {
    throw new RangeError(`r must be a non-negative integer, received ${r}`);
  }
  return (M * (K + r)) / (M + K);
}

/**
 * 上位 topFraction（既定 20%）の購入者が売上（購買回数）に占める割合を
 * ゼロ切断 NBD 分布から算出する。
 *
 * 購入回数の多い順に顧客を並べ、上位 topFraction 人分の購買回数シェアを返す。
 * 境界の r は按分する。
 */
export function topBuyersRevenueShare(M: number, K: number, topFraction = 0.2): number {
  if (!(topFraction > 0) || !(topFraction <= 1)) {
    throw new RangeError(`topFraction must be within (0, 1], received ${topFraction}`);
  }

  const denom = 1 - zeroPurchaseProbability(M, K);
  const meanAmongBuyers = M / denom;

  // 裾から十分な範囲まで pmf を蓄積（累積 1−1e-12 か上限まで）
  const probs: number[] = []; // index i ↔ r = i+1
  let cum = 0;
  const maxR = 100000;
  for (let r = 1; r <= maxR; r++) {
    const p = nbdPmf(r, M, K) / denom;
    probs.push(p);
    cum += p;
    if (1 - cum < 1e-12 && r > 10) break;
  }

  // 購入回数の多い順（r 降順）に人数を積み、上位 topFraction を按分で切り出す
  let peopleAcc = 0;
  let revenueAcc = 0;
  for (let i = probs.length - 1; i >= 0; i--) {
    const r = i + 1;
    const p = probs[i];
    if (peopleAcc + p >= topFraction) {
      const need = topFraction - peopleAcc;
      revenueAcc += need * r;
      peopleAcc = topFraction;
      break;
    }
    peopleAcc += p;
    revenueAcc += p * r;
  }

  return revenueAcc / meanAmongBuyers;
}

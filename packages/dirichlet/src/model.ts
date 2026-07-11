/**
 * デリシュレー NBD（Dirichlet model）の中核確率関数。
 *
 * Goodhardt, Ehrenberg & Chatfield (1984) "The Dirichlet: A Comprehensive
 * Model of Buying Behaviour" (JRSS A, 147(5), 621-655) のモデル構造を実装。
 * R パッケージ `NBDdirichlet`（Feiming Chen, GPL）と同じ推定・集計手順を
 * TypeScript で独立に再実装している（コードの移植ではなく数式からの実装）。
 *
 * 構造：
 *   カテゴリ購買回数 n ~ NBD(M, K)
 *   n 回のうちブランド j を選ぶ回数 r_j | n ~ Beta-Binomial(n, α_j, S−α_j)
 *   α_j = S × marketShare_j
 */

import { lnGamma, nbdPmf } from "@forecast-manifesto/solver";

export interface DirichletModel {
  /** カテゴリの一人あたり平均購買回数（observationPeriods 適用後） */
  M: number;
  /** NBD 形状パラメータ */
  K: number;
  /** ブランド選好の集中度（大きいほどスイッチングが激しい） */
  S: number;
  /** 無限和の打ち切り上限 */
  nstar: number;
  brands: { name: string; marketShare: number }[];
}

/** カテゴリ購買回数の確率 P(n)。solver の nbdPmf をそのまま使う。 */
export function categoryPn(model: Pick<DirichletModel, "M" | "K">, n: number): number {
  return nbdPmf(n, model.M, model.K);
}

/**
 * P(r_α = 0 | n)：n 回のカテゴリ購買で、選好質量 α のブランド群を一度も
 * 選ばない確率。Π_{i=0}^{n-1} (S−α+i)/(S+i) を対数空間で計算。
 */
export function pZeroGivenN(S: number, alpha: number, n: number): number {
  if (n === 0) return 1;
  if (alpha >= S) return 0; // 縮退（単一ブランド）：必ずそのブランドを買う
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.log(S - alpha + i) - Math.log(S + i);
  return Math.exp(s);
}

/**
 * P(r | n)：n 回のうちちょうど r 回、選好質量 α のブランド群を選ぶ確率
 * （Beta-Binomial）。
 */
export function pRGivenN(S: number, alpha: number, r: number, n: number): number {
  if (r < 0 || r > n) return 0;
  if (alpha >= S) return r === n ? 1 : 0; // 縮退：全購買がそのブランド
  const lnChoose = lnGamma(n + 1) - lnGamma(r + 1) - lnGamma(n - r + 1);
  const lnBetaNum =
    lnGamma(alpha + r) + lnGamma(S - alpha + n - r) - lnGamma(S + n);
  const lnBetaDen = lnGamma(alpha) + lnGamma(S - alpha) - lnGamma(S);
  return Math.exp(lnChoose + lnBetaNum - lnBetaDen);
}

/** 理論ブランド浸透率 b = 1 − Σ_n P(n)·P(0|n)。alpha は選好質量（合算可）。 */
export function brandPenetration(
  model: Pick<DirichletModel, "M" | "K" | "S" | "nstar">,
  alpha: number,
): number {
  let p0 = 0;
  for (let n = 0; n <= model.nstar; n++) {
    p0 += categoryPn(model, n) * pZeroGivenN(model.S, alpha, n);
  }
  return 1 - p0;
}

/**
 * ブランド購買者あたりのカテゴリ購買回数
 * wp = Σ_n n·P(n)·(1 − P(0|n)) / b。
 */
export function categoryRateForBrandBuyers(
  model: Pick<DirichletModel, "M" | "K" | "S" | "nstar">,
  alpha: number,
): number {
  let s = 0;
  for (let n = 1; n <= model.nstar; n++) {
    s += n * categoryPn(model, n) * (1 - pZeroGivenN(model.S, alpha, n));
  }
  return s / brandPenetration(model, alpha);
}

/**
 * 100% ロイヤル（sole buyer）率：ブランド j の購買者のうち、カテゴリ購買を
 * すべて j に振った人の割合 = Σ_{n≥1} P(n)·P(r=n|n) / b。
 */
export function soleBuyerRate(
  model: Pick<DirichletModel, "M" | "K" | "S" | "nstar">,
  alpha: number,
): number {
  let s = 0;
  for (let n = 1; n <= model.nstar; n++) {
    s += categoryPn(model, n) * pRGivenN(model.S, alpha, n, n);
  }
  return s / brandPenetration(model, alpha);
}

/**
 * NBD (Negative Binomial Distribution) の確率質量関数と補助関数。
 *
 * 森岡毅・今西聖貴『確率思考の戦略論』で用いられる需要予測モデルの、
 * 公知の数式・モデル構造のみを実装している（書籍本文の転載はしない）。
 *
 * 消費者一人あたりの一定期間の購入回数 r が NBD に従うと仮定する:
 *
 *   P_r = (1 + M/K)^(-K) · Γ(K+r) / (Γ(r+1)·Γ(K)) · (M/(M+K))^r
 *
 *   M = 一人あたり平均購入回数（母集団平均）
 *   K = 形状パラメータ（購入の集中度。小さいほどヘビーユーザー偏在）
 *
 * r=0 の確率（＝非購入率）は penetration（浸透率）の補数になる:
 *
 *   P_0 = (1 + M/K)^(-K) = 1 - penetration
 */

const LANCZOS_G = 7;

// Lanczos 近似係数（g=7, n=9）
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/**
 * ln Γ(x) を Lanczos 近似で計算する。
 * Γ 比を直接扱うとオーバーフローするため、対数空間で扱うのに用いる。
 *
 * @param x 正の実数
 * @returns ln Γ(x)
 * @throws {RangeError} x が正の有限値でない場合
 */
export function lnGamma(x: number): number {
  if (!Number.isFinite(x) || x <= 0) {
    throw new RangeError(`lnGamma requires a positive finite x, received ${x}`);
  }
  const z = x - 1;
  let a = LANCZOS_C[0];
  const t = z + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_C.length; i++) {
    a += LANCZOS_C[i] / (z + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

function assertParams(M: number, K: number): void {
  if (!Number.isFinite(M) || M <= 0) {
    throw new RangeError(`M must be a positive finite number, received ${M}`);
  }
  if (!Number.isFinite(K) || K <= 0) {
    throw new RangeError(`K must be a positive finite number, received ${K}`);
  }
}

/**
 * 非購入確率 P_0 = (1 + M/K)^(-K)。
 * log1p を用いて K が小さいときの桁落ちを避ける。
 */
export function zeroPurchaseProbability(M: number, K: number): number {
  assertParams(M, K);
  return Math.exp(-K * Math.log1p(M / K));
}

/**
 * 浸透率 penetration = 1 - P_0。
 */
export function penetrationFromK(M: number, K: number): number {
  return 1 - zeroPurchaseProbability(M, K);
}

/**
 * NBD 確率質量関数 P_r。
 *
 * @param r 購入回数（0 以上の整数）
 * @param M 一人あたり平均購入回数
 * @param K 形状パラメータ
 * @returns r 回購入する確率 P_r
 * @throws {RangeError} r が非負整数でない、または M/K が不正な場合
 */
export function nbdPmf(r: number, M: number, K: number): number {
  assertParams(M, K);
  if (!Number.isInteger(r) || r < 0) {
    throw new RangeError(`r must be a non-negative integer, received ${r}`);
  }
  // 対数空間で計算しオーバーフローを回避する
  const lnP0 = -K * Math.log1p(M / K);
  const lnRatio = lnGamma(K + r) - lnGamma(r + 1) - lnGamma(K);
  const lnTail = r === 0 ? 0 : r * Math.log(M / (M + K));
  return Math.exp(lnP0 + lnRatio + lnTail);
}

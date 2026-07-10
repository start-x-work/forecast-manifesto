/**
 * Pareto/NBD 参照実装（教材用・任意）。Schmittlein, Morrison & Colombo (1987)。
 *
 * BG/NBD の「元祖」。離反を連続時間の指数分布でモデル化する点が BG/NBD と異なる
 * （BG/NBD は購入直後のみ離反しうる離散版）。ここでは思想比較のための最小実装として
 * 生存確率と条件付き期待購買回数の「近似」を提供する教材用モジュール。
 *
 * 注意：これは production 用途の検証済み実装ではない。CDNOW 公表値との厳密照合も
 * 行わない（推定は BG/NBD 側の責務）。厳密な Pareto/NBD の最尤推定が必要なら
 * BTYD（R）や lifetimes（Python）を参照すること。
 *
 * パラメータ:
 *   r, α  … 購買率 λ の事前 Gamma(r, α)
 *   s, β  … 離反率 μ の事前 Gamma(s, β)
 */

import { hyp2f1 } from "./math.js";
import type { Rfm } from "./rfm.js";

export interface ParetoNbdParams {
  r: number;
  alpha: number;
  s: number;
  beta: number;
}

/**
 * 生存確率 P(alive | x, t_x, T)。
 *
 * Pareto/NBD の生存確率はガウス超幾何を含む。ここでは思想比較のための
 * 簡略化した近似形を用いる（厳密実装は BTYD/lifetimes を参照）。
 */
export function probAlive(c: Rfm, p: ParetoNbdParams): number {
  const { r, alpha, s, beta } = p;
  const x = c.frequency;
  const tx = c.recency;
  const T = c.T;

  const maxab = Math.max(alpha, beta);
  const absDiff = Math.abs(alpha - beta);

  // A0（Schmittlein et al. の補助関数）を対数対称に評価
  const lnA0AtT = lnA0(r, s, x, maxab, absDiff, T);
  const lnA0AtTx = lnA0(r, s, x, maxab, absDiff, tx);

  // P(alive) = 1 / (1 + (s / (r + s + x)) · exp(lnA0AtTx − lnA0AtT) の逆数構造)
  // 標準形：P(τ>T | ·) = 1 / (1 + (s/(r+s+x)) · (A0(t_x)/A0(T)) · ... )
  const ratio = (s / (r + s + x)) * Math.exp(lnA0AtTx - lnA0AtT);
  return 1 / (1 + ratio);
}

// ln A0：ガウス超幾何 2F1 を用いた補助項（連続時間離反の寄与）
function lnA0(
  r: number,
  s: number,
  x: number,
  maxab: number,
  absDiff: number,
  t: number,
): number {
  // z = |α−β| / (max(α,β) + t) ∈ [0,1)
  const z = absDiff / (maxab + t);
  const twoF1 = hyp2f1(r + s + x, s + 1, r + s + x + 1, z);
  return -(r + s + x) * Math.log(maxab + t) + Math.log(Math.max(twoF1, Number.MIN_VALUE));
}

/**
 * 今後 t 期間の条件付き期待購買回数 E[Y(t) | x, t_x, T]（近似）。
 * P(alive) を用いた実務的近似：生存確率 × 生存時の期待購買。
 * 厳密式は Schmittlein et al. (1987) を参照。教材用の目安値として提供する。
 */
export function expectedTransactions(t: number, c: Rfm, p: ParetoNbdParams): number {
  const { r, alpha, s, beta } = p;
  const alive = probAlive(c, p);
  // 生存中の期待購買率 × 期待残存期間の近似
  const purchaseRate = (r + c.frequency) / (alpha + c.T);
  const expectedLifetime = s > 1 ? (beta + c.T) / (s - 1) : Infinity;
  const horizon = Math.min(t, expectedLifetime);
  return alive * purchaseRate * horizon;
}

/** 参照用の対数尤度（教材目的、最適化はスコープ外）。 */
export function logLikelihood(_p: ParetoNbdParams, _rfm: Rfm[]): number {
  // Pareto/NBD の尤度は 2F1 を含み実装が重いため、参照実装では未提供。
  // BG/NBD（bgnbd.ts）を推定に用いること。
  throw new Error(
    "Pareto/NBD の最尤推定は参照実装ではサポートしていません。推定には BG/NBD（fitBgNbd）を使用してください。",
  );
}

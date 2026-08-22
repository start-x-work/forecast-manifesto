/**
 * 時間スケーリング（期間換算）。
 *
 * NBD の基本性質：観測期間 t に対し平均購入回数 M は比例し、形状 K は不変。
 *   M(t2) = M(t1) · (t2 / t1),   K(t2) = K(t1)
 * したがって短期観測（例：4週）から長期（例：52週）の浸透率・購入回数を外挿できる。
 * 新商品の年間需要予測に直結する（Ehrenberg の浸透率成長の性質）。
 *
 * 注意：外挿は「購買機会が期間に比例して積み上がる」定常性を仮定する。
 * 強い季節性・普及過程・供給制約があると乖離するため、倍率が大きい場合は警告を返す。
 */

import { penetrationFromK } from "./nbd.js";

/** 外挿倍率がこの値を超えると警告を付す（既定の目安）。 */
const DEFAULT_WARN_RATIO = 12;

export interface ScaleToHorizonResult {
  /** 期間 t2 に換算した平均購入回数 */
  M: number;
  /** 形状パラメータ（期間不変） */
  K: number;
  /** 外挿倍率が大きい場合の警告（それ以外は undefined） */
  warning?: string;
}

function assertHorizonInputs(M: number, K: number, t1: number, t2: number): void {
  if (!Number.isFinite(M) || M <= 0) {
    throw new RangeError(`M must be a positive finite number, received ${M}`);
  }
  if (!Number.isFinite(K) || K <= 0) {
    throw new RangeError(`K must be a positive finite number, received ${K}`);
  }
  if (!Number.isFinite(t1) || t1 <= 0) {
    throw new RangeError(`t1 must be a positive finite number, received ${t1}`);
  }
  if (!Number.isFinite(t2) || t2 <= 0) {
    throw new RangeError(`t2 must be a positive finite number, received ${t2}`);
  }
}

/**
 * 観測期間 t1 の (M, K) を期間 t2 に換算する。K は期間不変、M は比例。
 *
 * @param M 期間 t1 での平均購入回数（> 0）
 * @param K 形状パラメータ（> 0・期間不変）
 * @param t1 観測期間（> 0・単位は任意だが t2 と揃える）
 * @param t2 換算先の期間（> 0）
 * @returns 換算後の { M, K } と、外挿倍率が大きい場合の warning
 * @throws {RangeError} いずれかの入力が正の有限値でない場合
 */
export function scaleToHorizon(
  M: number,
  K: number,
  t1: number,
  t2: number,
  opts: { warnRatio?: number } = {},
): ScaleToHorizonResult {
  assertHorizonInputs(M, K, t1, t2);
  const warnRatio = opts.warnRatio ?? DEFAULT_WARN_RATIO;
  const ratio = t2 / t1;
  const result: ScaleToHorizonResult = { M: M * ratio, K };
  if (ratio > warnRatio) {
    result.warning =
      `extrapolation ratio t2/t1 = ${ratio.toFixed(2)} exceeds ${warnRatio}; ` +
      `long-horizon projection assumes stationary purchasing (no seasonality, diffusion, or supply constraints). Treat with care.`;
  }
  return result;
}

/**
 * 期間 t2 に換算した浸透率 penetration(t2) = 1 - P_0(M(t2), K)。
 *
 * @param M 期間 t1 での平均購入回数（> 0）
 * @param K 形状パラメータ（> 0）
 * @param t1 観測期間（> 0）
 * @param t2 換算先の期間（> 0）
 * @returns 期間 t2 での浸透率
 * @throws {RangeError} いずれかの入力が正の有限値でない場合
 */
export function penetrationAtHorizon(
  M: number,
  K: number,
  t1: number,
  t2: number,
): number {
  const { M: scaledM } = scaleToHorizon(M, K, t1, t2);
  return penetrationFromK(scaledM, K);
}

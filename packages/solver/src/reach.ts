/**
 * リーチ＆フリークエンシー（到達率と接触頻度）。
 *
 * 露出回数（impressions）が母集団（population）に NBD(M, K) で配分されると
 * みなす。ここで
 *
 *   averageFrequencyAll = impressions / population = M（母集団全体の平均接触頻度）
 *   reach               = 1 - P_0 = penetrationFromK(M, K)（1回以上接触した割合）
 *   frequencyAmongReached = averageFrequencyAll / reach（到達者内の平均頻度）
 *
 * K（接触の集中度）は媒体・出稿設計で変わる。実測リーチが分かる場合は
 * identifyK(M, observedReach) で K を逆算し、その 1 点で再現する。実測が無い
 * 場合は K の事前レンジ（kPrior）から reach の区間を出す——reach は K に対して
 * 単調増加（K 大 ⇒ P_0 小 ⇒ reach 大）なので、区間は kPrior の両端で決まる。
 *
 * 非公開境界：媒体別・出稿別の K 実値（ベンチマーク）は同梱しない。本 OSS が
 * 公開するのは「計算方法」と「K の入れ方」まで（docs/05-boundaries.md）。
 * 既定 K は置かない——K は必ず観測（observedReach）か事前レンジ（kPrior）で与える。
 */

import { identifyK } from "./identify.js";
import { penetrationFromK } from "./nbd.js";

export interface ReachInput {
  /** 総露出回数（インプレッション, > 0） */
  impressions: number;
  /** 対象母集団の規模（> 0） */
  population: number;
  /**
   * 実測リーチ（0 < observedReach < 1）。与えると K を identifyK で逆算し、
   * その 1 点で reach を再現する（method="identified"）。
   */
  observedReach?: number;
  /**
   * K の事前レンジ（observedReach 未指定時に必須）。low/high から reach の区間を
   * 出す（method="prior"）。媒体別 K の実値は同梱しないため、呼び出し側が与える。
   */
  kPrior?: { low: number; high: number };
}

export interface ReachResult {
  /** 母集団全体の平均接触頻度 = impressions / population（= M） */
  averageFrequencyAll: number;
  /** 到達率（1 回以上接触した割合）と、その区間 */
  reach: { point: number; low: number; high: number };
  /** 到達者内の平均接触頻度 = averageFrequencyAll / reach.point */
  frequencyAmongReached: number;
  /** 用いた形状パラメータ K（identified: 逆算値 / prior: レンジ中央） */
  K: number;
  /** K の決め方 */
  method: "identified" | "prior";
}

/**
 * 露出回数と母集団からリーチ・フリークエンシーを求める。
 *
 * @param input impressions・population と、observedReach か kPrior のいずれか
 * @returns averageFrequencyAll・reach（point/low/high）・frequencyAmongReached・K・method
 * @throws {RangeError} 入力が不正、または実測リーチが NBD の到達上限を超える場合
 */
export function reachFromImpressions(input: ReachInput): ReachResult {
  const { impressions, population, observedReach, kPrior } = input;
  if (!Number.isFinite(impressions) || impressions <= 0) {
    throw new RangeError(`impressions must be a positive finite number, received ${impressions}`);
  }
  if (!Number.isFinite(population) || population <= 0) {
    throw new RangeError(`population must be a positive finite number, received ${population}`);
  }

  // 母集団全体の平均接触頻度（= NBD の M）。impressions < population なら M < 1（低頻度）で正常。
  const M = impressions / population;

  const reachAt = (K: number): number => penetrationFromK(M, K);

  if (observedReach !== undefined) {
    if (!Number.isFinite(observedReach) || observedReach <= 0 || observedReach >= 1) {
      throw new RangeError(`observedReach must be within (0, 1), received ${observedReach}`);
    }
    const { K } = identifyK(M, observedReach); // 到達上限超過はここで throw
    const point = reachAt(K); // ≈ observedReach（再現）
    return {
      averageFrequencyAll: M,
      reach: { point, low: point, high: point },
      frequencyAmongReached: M / point,
      K,
      method: "identified",
    };
  }

  if (!kPrior) {
    throw new RangeError(
      "either observedReach or kPrior must be provided (no default K is shipped; supply the K range for your medium/plan)",
    );
  }
  const { low, high } = kPrior;
  if (!Number.isFinite(low) || low <= 0 || !Number.isFinite(high) || high <= low) {
    throw new RangeError(`kPrior must satisfy 0 < low < high, received low=${low}, high=${high}`);
  }

  // reach は K に対して単調増加。区間は kPrior の両端、点はレンジの幾何平均で。
  const Kmid = Math.sqrt(low * high);
  const point = reachAt(Kmid);
  return {
    averageFrequencyAll: M,
    reach: { point, low: reachAt(low), high: reachAt(high) },
    frequencyAmongReached: M / point,
    K: Kmid,
    method: "prior",
  };
}

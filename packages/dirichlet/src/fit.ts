/**
 * デリシュレー NBD の同定。R `NBDdirichlet::dirichlet()` と同一の手順：
 *
 *   1. M = カテゴリ浸透率 × 購買者平均購買回数
 *   2. K：(1 + M/K)^(−K) = 1 − カテゴリ浸透率 を解く（solver の identifyK）
 *   3. S：観測ブランド浸透率があるブランドごとに理論浸透率＝観測浸透率を解き
 *      （S_j）、外れ値（boxplot ルール＋上側ノッチ超過）を除いた
 *      シェア加重平均を最終 S とする
 *
 * observationPeriods（期間倍率 t）は M にのみ掛かる（K・S は不変）——
 * R の summary(t=…) と同じ扱い。
 */

import { identifyK } from "@forecast-manifesto/solver";
import { brandPenetration } from "./model.js";
import type { DirichletModel } from "./model.js";

export interface DirichletBrandInput {
  name: string;
  /** 市場シェア（購買機会ベース）。合計 ≒ 1 */
  marketShare: number;
  /** 観測ブランド浸透率（S の推定に使用。S を直接指定する場合は省略可） */
  observedPenetration?: number;
}

export interface FitDirichletInput {
  /** カテゴリ浸透率（期間内にカテゴリを1回以上買った人の割合） */
  categoryPenetration: number;
  /** カテゴリ購買者の平均購買回数 */
  categoryBuyRate: number;
  brands: DirichletBrandInput[];
  /** 期間倍率（既定 1）。M にのみ乗算（K・S は不変） */
  observationPeriods?: number;
  /** S を直接指定（観測ブランド浸透率からの推定をスキップ） */
  S?: number;
  /** 無限和の打ち切り（既定 50。高頻度カテゴリでは増やす） */
  nstar?: number;
  /** S 探索の上限（既定 30） */
  maxS?: number;
  /**
   * ブランド別 S_j の外れ値除去（boxplot ルール＋上側ノッチ超過）を適用するか。
   * 既定 false＝単純なシェア加重平均。R NBDdirichlet の公表出力（歯磨き粉例の
   * S=1.55）は除去なしの加重平均に一致する。現行 CRAN v1.4 のコードは除去を
   * 行うが、同じ例で S=1.30 となり自身の公表出力と食い違うため、既定では
   * 公表出力側に合わせている。
   */
  sOutlierRemoval?: boolean;
}

/** R の fivenum に相当する Tukey ヒンジ。 */
function hinges(sorted: number[]): { lower: number; median: number; upper: number } {
  const n = sorted.length;
  const half = Math.floor((n + 3) / 2) / 2;
  const at = (pos: number): number =>
    (sorted[Math.floor(pos) - 1] + sorted[Math.ceil(pos) - 1]) / 2;
  return { lower: at(half), median: at((n + 1) / 2), upper: at(n + 1 - half) };
}

/**
 * R の `boxplot(x, plot=F)` 外れ値ルール＋上側ノッチ超過の除去を再現し、
 * 残ったブランドの S をシェアで加重平均する。
 */
export function robustWeightedS(sAll: number[], shares: number[]): number {
  const sorted = [...sAll].sort((a, b) => a - b);
  const { lower, median, upper } = hinges(sorted);
  const iqr = upper - lower;
  const lowFence = lower - 1.5 * iqr;
  const highFence = upper + 1.5 * iqr;
  const upperNotch = median + (1.58 * iqr) / Math.sqrt(sAll.length);

  let wSum = 0;
  let sSum = 0;
  for (let i = 0; i < sAll.length; i++) {
    const s = sAll[i];
    const isOutlier = s < lowFence || s > highFence || s > upperNotch;
    if (isOutlier) continue;
    wSum += shares[i];
    sSum += s * shares[i];
  }
  if (wSum === 0) {
    // すべて除外された縮退ケース：単純なシェア加重平均に落とす
    for (let i = 0; i < sAll.length; i++) {
      wSum += shares[i];
      sSum += sAll[i] * shares[i];
    }
  }
  return sSum / wSum;
}

/** 理論浸透率 = 観測浸透率 を S について解く（二分法＋境界フォールバック）。 */
function solveSForBrand(
  base: { M: number; K: number; nstar: number },
  share: number,
  observedPen: number,
  maxS: number,
): number {
  const f = (S: number): number =>
    brandPenetration({ ...base, S }, S * share) - observedPen;

  let lo = 1e-4;
  let hi = maxS;
  let fLo = f(lo);
  let fHi = f(hi);
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) {
    // 括れない：R の optimize 同様、二乗誤差が小さい側の境界に落ちる
    return Math.abs(fLo) < Math.abs(fHi) ? lo : hi;
  }
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    const fMid = f(mid);
    if (Math.abs(fMid) < 1e-12 || hi - lo < 1e-10) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return 0.5 * (lo + hi);
}

/**
 * デリシュレー NBD を同定する。
 *
 * @throws {RangeError} 浸透率・購買回数・シェアが不正、シェア合計が 1±0.02 の外、
 *   または S が指定されず観測ブランド浸透率も無い場合
 */
export function fitDirichlet(input: FitDirichletInput): DirichletModel {
  const { categoryPenetration, categoryBuyRate, brands } = input;
  if (!(categoryPenetration > 0) || !(categoryPenetration < 1)) {
    throw new RangeError(`categoryPenetration must be within (0, 1), received ${categoryPenetration}`);
  }
  if (!(categoryBuyRate >= 1)) {
    throw new RangeError(`categoryBuyRate must be >= 1 (mean purchases per buyer), received ${categoryBuyRate}`);
  }
  if (!Array.isArray(brands) || brands.length === 0) {
    throw new RangeError("brands must be a non-empty array");
  }
  for (const b of brands) {
    if (!(b.marketShare > 0) || !(b.marketShare <= 1)) {
      throw new RangeError(`marketShare for ${b.name} must be within (0, 1], received ${b.marketShare}`);
    }
    if (b.observedPenetration !== undefined && (!(b.observedPenetration > 0) || !(b.observedPenetration < 1))) {
      throw new RangeError(`observedPenetration for ${b.name} must be within (0, 1), received ${b.observedPenetration}`);
    }
  }
  // シェア合計は 1 を超えられない（1+0.02 は丸め誤差の許容）。
  // 合計 < 1 は許容する：残りは「モデル化していないその他ブランド」として
  // 数理的に自然に扱われる（R NBDdirichlet 同梱の歯磨き粉例もシェア合計 0.86）。
  const shareSum = brands.reduce((s, b) => s + b.marketShare, 0);
  if (shareSum > 1.02) {
    throw new RangeError(
      `brand market shares cannot exceed 1 (+0.02 tolerance), received ${shareSum.toFixed(4)}`,
    );
  }

  const t = input.observationPeriods ?? 1;
  if (!(t > 0)) {
    throw new RangeError(`observationPeriods must be > 0, received ${t}`);
  }
  const nstar = input.nstar ?? 50;
  const maxS = input.maxS ?? 30;

  // 1) M（基準期間）
  const baseM = categoryPenetration * categoryBuyRate;

  // 2) K：カテゴリ浸透率の mean-and-zeros 同定（identifyK と同一の方程式）
  const { K } = identifyK(baseM, categoryPenetration);

  // 3) S
  let S: number;
  if (input.S !== undefined) {
    if (!(input.S > 0)) throw new RangeError(`S must be > 0, received ${input.S}`);
    S = input.S;
  } else {
    const withObs = brands.filter((b) => b.observedPenetration !== undefined);
    if (withObs.length === 0) {
      throw new RangeError(
        "S estimation requires observedPenetration on at least one brand (or pass S directly)",
      );
    }
    const base = { M: baseM, K, nstar };
    const sAll = withObs.map((b) => solveSForBrand(base, b.marketShare, b.observedPenetration!, maxS));
    const weights = withObs.map((b) => b.marketShare);
    if (withObs.length === 1) {
      S = sAll[0];
    } else if (input.sOutlierRemoval) {
      S = robustWeightedS(sAll, weights);
    } else {
      // 既定：シェア加重平均（R の公表出力と一致する挙動）
      const wSum = weights.reduce((a, w) => a + w, 0);
      S = sAll.reduce((a, v, i) => a + v * weights[i], 0) / wSum;
    }
  }

  return {
    M: baseM * t,
    K,
    S,
    nstar,
    brands: brands.map((b) => ({ name: b.name, marketShare: b.marketShare })),
  };
}

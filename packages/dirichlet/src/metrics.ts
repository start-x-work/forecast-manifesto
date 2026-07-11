/**
 * デリシュレー NBD から導く市場構造指標。
 *
 * - brandMetrics … 理論浸透率・購買頻度・SCR・100%ロイヤル率
 * - duplicationMatrix … ブランド間購買重複（重複購買の法則の検証）
 * - doubleJeopardyTable … シェア昇順の浸透率×頻度表（ダブルジェパディ線）
 */

import {
  brandPenetration,
  categoryRateForBrandBuyers,
  soleBuyerRate,
  pZeroGivenN,
  categoryPn,
} from "./model.js";
import type { DirichletModel } from "./model.js";

export interface BrandMetricsRow {
  name: string;
  /** 市場シェア（入力値） */
  share: number;
  /** 理論ブランド浸透率 b */
  penetration: number;
  /** ブランド購買者あたりの購買回数 w = M·share / b */
  buyRate: number;
  /** Share of Category Requirements = w / (ブランド購買者のカテゴリ購買回数) */
  scr: number;
  /** 100% ロイヤル比率（カテゴリ購買を全てこのブランドに振った購買者の割合） */
  soleBuyerRate: number;
}

/**
 * ブランド別の理論指標。brandName を指定するとそのブランドのみ返す。
 *
 * @throws {RangeError} brandName がモデルに存在しない場合
 */
export function brandMetrics(model: DirichletModel, brandName?: string): BrandMetricsRow[] {
  const targets =
    brandName === undefined
      ? model.brands
      : model.brands.filter((b) => b.name === brandName);
  if (targets.length === 0) {
    throw new RangeError(`brand "${brandName}" is not in the model`);
  }

  return targets.map((b) => {
    const alpha = model.S * b.marketShare;
    const pen = brandPenetration(model, alpha);
    const buyRate = (model.M * b.marketShare) / pen;
    const catRate = categoryRateForBrandBuyers(model, alpha);
    return {
      name: b.name,
      share: b.marketShare,
      penetration: pen,
      buyRate,
      scr: buyRate / catRate,
      soleBuyerRate: soleBuyerRate(model, alpha),
    };
  });
}

/**
 * 購買重複行列 D。D[j][k] = P(ブランド j も買う | ブランド k の購買者)（j ≠ k）。
 * 対角は 1。「重複購買の法則」（重複はシェアにほぼ比例）の検証に使う。
 */
export function duplicationMatrix(model: DirichletModel): number[][] {
  const nb = model.brands.length;
  const alphas = model.brands.map((b) => model.S * b.marketShare);
  const pens = alphas.map((a) => brandPenetration(model, a));

  // P(j も k も買わない) = Σ_n P(n)·P(0 | n, α_j + α_k)
  const both = (j: number, k: number): number => {
    let pNeither = 0;
    for (let n = 0; n <= model.nstar; n++) {
      pNeither += categoryPn(model, n) * pZeroGivenN(model.S, alphas[j] + alphas[k], n);
    }
    // P(both) = b_j + b_k − P(either) = b_j + b_k − (1 − P(neither))
    return pens[j] + pens[k] - (1 - pNeither);
  };

  const D: number[][] = [];
  for (let j = 0; j < nb; j++) {
    D.push([]);
    for (let k = 0; k < nb; k++) {
      D[j][k] = j === k ? 1 : both(j, k) / pens[k];
    }
  }
  return D;
}

export interface PenetrationFitRow {
  name: string;
  share: number;
  observedPenetration: number;
  theoreticalPenetration: number;
  /** 理論 − 観測 */
  diff: number;
}

export interface PenetrationFitCheck {
  rows: PenetrationFitRow[];
  /** |理論 − 観測| の平均 */
  mae: number;
  /** 最大乖離のブランド */
  worst: PenetrationFitRow;
}

/**
 * 当てはまり診断：理論ブランド浸透率と観測浸透率の乖離を返す。
 * デリシュレーが仮定する定常構造からの逸脱（ニッチ・過剰ロイヤルティ等）の
 * 検出に使う——乖離が大きいブランドは「モデルが語れない何か」を持っている。
 *
 * @param observed name と observedPenetration の配列（fitDirichlet 入力の brands をそのまま渡せる）
 * @throws {RangeError} observed が空、またはモデルに無いブランドを含む場合
 */
export function penetrationFitCheck(
  model: DirichletModel,
  observed: { name: string; observedPenetration?: number }[],
): PenetrationFitCheck {
  const withObs = observed.filter((b) => b.observedPenetration !== undefined);
  if (withObs.length === 0) {
    throw new RangeError("penetrationFitCheck requires at least one observedPenetration");
  }
  const shareByName = new Map(model.brands.map((b) => [b.name, b.marketShare]));
  const rows: PenetrationFitRow[] = withObs.map((b) => {
    const share = shareByName.get(b.name);
    if (share === undefined) {
      throw new RangeError(`brand "${b.name}" is not in the model`);
    }
    const theoretical = brandPenetration(model, model.S * share);
    return {
      name: b.name,
      share,
      observedPenetration: b.observedPenetration!,
      theoreticalPenetration: theoretical,
      diff: theoretical - b.observedPenetration!,
    };
  });
  const mae = rows.reduce((s, r) => s + Math.abs(r.diff), 0) / rows.length;
  const worst = rows.reduce((w, r) => (Math.abs(r.diff) > Math.abs(w.diff) ? r : w), rows[0]);
  return { rows, mae, worst };
}

export interface DoubleJeopardyRow {
  name: string;
  share: number;
  penetration: number;
  buyRate: number;
}

/**
 * ダブルジェパディ表：シェア昇順に浸透率と購買頻度を並べる。
 * 小さいブランドは「買う人が少なく、買う人の頻度も低い」——二重に苦しむ。
 */
export function doubleJeopardyTable(model: DirichletModel): DoubleJeopardyRow[] {
  return brandMetrics(model)
    .map((m) => ({ name: m.name, share: m.share, penetration: m.penetration, buyRate: m.buyRate }))
    .sort((a, b) => a.share - b.share);
}

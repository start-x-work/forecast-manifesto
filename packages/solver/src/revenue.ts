/**
 * 浸透率ベースの売上予測と、その区間（パラメトリック・ブートストラップ）。
 *
 * 「点ではなく、幅で語る」を最終数値（売上）まで貫く。売上を浸透率で表す：
 *
 *   revenue = marketSize × penetration × unitPrice × purchasesPerBuyer × adjustment
 *
 * ここで penetration は NBD(M, K) の 1 - P_0。K の不確実性（有限標本での
 * 浸透率・M の揺らぎ）を、identifyKWithInterval と同じ再生成ブートストラップで
 * 売上まで伝播させる。認知率・配荷率などは adjustment に点値として与える
 * （区間は付さない＝将来拡張の余地）。
 *
 * 点推定 API（forecastRevenue）は不変。本モジュールは追加のみ。
 */

import { identifyK } from "./identify.js";
import { createRng, sampleNbd, percentile } from "./rng.js";

export interface RevenueWithIntervalInput {
  /** 母集団規模（到達しうる人数など、>= 0） */
  marketSize: number;
  /** 平均購入回数（> 0）。K 同定に使う */
  M: number;
  /** 観測浸透率（0 < penetration < 1）。K 同定に使う */
  penetration: number;
  /** 単価（>= 0） */
  unitPrice: number;
  /** 購入者一人あたりの購買数（既定 1 ＝ 浸透率ベース：1人1単位） */
  purchasesPerBuyer?: number;
  /** 認知率×配荷率×コンセプト等の点調整係数（既定 1・区間なし） */
  adjustment?: number;
}

export interface RevenueWithIntervalOptions {
  /** 観測の母数（浸透率・M を測った顧客数）。既定 1000 */
  nCustomers?: number;
  /** ブートストラップ反復数（既定 200） */
  iterations?: number;
  /** 乱数シード（既定 1） */
  seed?: number;
  /** 区間の信頼水準（既定 0.9 → [5%, 95%]） */
  level?: number;
}

export interface RevenueInterval {
  /** 点推定の売上 */
  point: number;
  /** 区間下限 */
  low: number;
  /** 区間上限 */
  high: number;
  /** 実行した反復数 */
  iterations: number;
  /** 再生成で解なし等によりスキップした反復数 */
  skipped: number;
  /** 計算量ガード警告（通常 undefined） */
  warning?: string;
}

/**
 * 浸透率ベースの売上に、K（浸透率）の不確実性を伝播させた区間を付す。
 *
 * @param input 売上入力（marketSize, M, penetration, unitPrice, ...）
 * @param opts ブートストラップ設定
 * @returns { point, low, high, iterations, skipped }
 * @throws {RangeError} 入力が不正、または identifyK が解を持たない場合
 */
export function forecastRevenueWithInterval(
  input: RevenueWithIntervalInput,
  opts: RevenueWithIntervalOptions = {},
): RevenueInterval {
  const { marketSize, M, penetration, unitPrice } = input;
  const purchasesPerBuyer = input.purchasesPerBuyer ?? 1;
  const adjustment = input.adjustment ?? 1;
  if (!Number.isFinite(marketSize) || marketSize < 0) {
    throw new RangeError(`marketSize must be a non-negative finite number, received ${marketSize}`);
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new RangeError(`unitPrice must be a non-negative finite number, received ${unitPrice}`);
  }
  if (!Number.isFinite(purchasesPerBuyer) || purchasesPerBuyer < 0) {
    throw new RangeError(`purchasesPerBuyer must be non-negative, received ${purchasesPerBuyer}`);
  }
  if (!Number.isFinite(adjustment) || adjustment < 0) {
    throw new RangeError(`adjustment must be non-negative, received ${adjustment}`);
  }

  const nCustomers = opts.nCustomers ?? 1000;
  if (!Number.isInteger(nCustomers) || nCustomers < 2) {
    throw new RangeError(`nCustomers must be an integer >= 2, received ${nCustomers}`);
  }
  const iterations = opts.iterations ?? 200;
  const seed = opts.seed ?? 1;
  const level = opts.level ?? 0.9;
  if (!(level > 0) || !(level < 1)) {
    throw new RangeError(`level must be within (0, 1), received ${level}`);
  }

  const revenueOf = (pen: number): number =>
    marketSize * pen * unitPrice * purchasesPerBuyer * adjustment;

  // 点推定：同定した K から理論浸透率（≒ 入力 penetration）で売上を出す
  const { K } = identifyK(M, penetration); // 解なしはここで throw
  const point = revenueOf(penetration);

  let warning: string | undefined;
  if (iterations * nCustomers > 1e7) {
    warning = `iterations (${iterations}) x nCustomers (${nCustomers}) exceeds 1e7 — this may take a long time. Consider reducing iterations or sampling customers.`;
  }

  const rng = createRng(seed);
  const revenues: number[] = [];
  let skipped = 0;
  for (let i = 0; i < iterations; i++) {
    // NBD(M, K̂) から nCustomers 人を再生成し、浸透率を再計測
    let buyers = 0;
    let sum = 0;
    for (let n = 0; n < nCustomers; n++) {
      const r = sampleNbd(M, K, rng);
      sum += r;
      if (r >= 1) buyers++;
    }
    const penHat = buyers / nCustomers;
    const mHat = sum / nCustomers;
    if (!(mHat > 0) || penHat <= 0 || penHat >= 1) {
      skipped++;
      continue;
    }
    revenues.push(revenueOf(penHat));
  }

  if (revenues.length === 0) {
    throw new RangeError(
      "all bootstrap iterations were skipped (resampled penetration had no valid value). Increase nCustomers or iterations.",
    );
  }

  revenues.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  const result: RevenueInterval = {
    point,
    low: percentile(revenues, alpha),
    high: percentile(revenues, 1 - alpha),
    iterations,
    skipped,
  };
  if (warning) result.warning = warning;
  return result;
}

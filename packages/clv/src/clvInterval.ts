/**
 * 区間つき LTV：コホートの「1 顧客あたり平均 CLV」にパラメトリック・
 * ブートストラップ区間を付す。
 *
 * 点推定：観測コホートで BG/NBD ＋ Gamma-Gamma を推定し、各顧客の clv() を
 * 平均する（perCustomerMean.point ＝ mean_i clv(i)）。
 * 区間：推定パラメータどおりに同数のコホートを再生成 → 再推定 → 平均 CLV を
 * 再計算 ×iterations → パーセンタイル区間。母数（顧客数）が少ないほど再推定の
 * ばらつきが大きく、区間は広くなる。
 *
 * すべてシード固定・依存ゼロ（solver の rng を再利用）。フルベイズ（MCMC）は
 * スコープ外——事後分布が要るときは PyMC-Marketing を参照（docs/08）。
 *
 * 命名について：本パッケージには既に `clvWithInterval`（bootstrap.ts, 個客の
 * モンテカルロ区間）が存在するため、コホート版は別関数として追加する
 * （後方互換のため既存 API は不変）。
 */

import { createRng, sampleGamma, sampleBeta, percentile } from "@forecast-manifesto/solver";
import { fitBgNbd } from "./bgnbd.js";
import type { BgNbdParams } from "./bgnbd.js";
import { fitGammaGamma, checkFrequencyMonetaryIndependence } from "./gammaGamma.js";
import type { GgParams } from "./gammaGamma.js";
import { clv } from "./clv.js";
import type { Rfm } from "./rfm.js";

const WEEKS_PER_MONTH = 365.25 / 12 / 7;

/** 顧客数がこれ未満なら区間が過小評価になりうる旨を警告する。 */
const FEW_CUSTOMERS_THRESHOLD = 300;

export interface ClvIntervalInput {
  /** 対象コホートの RFM（BG/NBD ＋ Gamma-Gamma を推定する母集団） */
  rfm: Rfm[];
  /** 予測期間（月） */
  horizonMonths: number;
  /** 月次割引率（例 0.01 = 月1%） */
  monthlyDiscount: number;
  /**
   * 粗利率（0 < margin <= 1）。指定時のみ grossProfitPerCustomer を返す。
   * perCustomerMean は margin を掛けない割引現在売上ベースの LTV。
   */
  margin?: number;
  /** RFM の時間単位が週でない場合の 1 月あたり単位数（既定 = 週換算） */
  unitsPerMonth?: number;
}

export interface ClvIntervalOptions {
  /** ブートストラップ反復数（既定 200） */
  iterations?: number;
  /** 乱数シード（既定 1） */
  seed?: number;
  /** 区間の信頼水準（既定 0.9 → [5%, 95%]） */
  level?: number;
}

export interface ClvIntervalResult {
  /** 1 顧客あたり平均 CLV（割引現在売上ベース, margin 未適用）の点推定と区間 */
  perCustomerMean: { point: number; low: number; high: number };
  /** margin 指定時のみ：1 顧客あたり平均の割引現在利益（= perCustomerMean × margin） */
  grossProfitPerCustomer?: { point: number; low: number; high: number };
  /** 点推定に用いた推定パラメータ */
  params: { bgnbd: BgNbdParams; gammaGamma: GgParams };
  /** 実行したブートストラップ反復数 */
  iterations: number;
  /** 用いた乱数シード */
  seed: number;
  /** 妥当性に関する警告（該当が無ければ空配列） */
  warnings: string[];
}

/**
 * BG/NBD の生成過程で 1 顧客の (frequency, recency) を再生成する。
 * λ ~ Gamma(r, 1/α)、p ~ Beta(a, b)。初回を t=0 とし、以後を指数間隔で生成、
 * 各購入直後に確率 p で離反する（bootstrap.ts と同一の生成過程）。
 */
function simulateBgNbdCustomer(
  params: BgNbdParams,
  T: number,
  rng: () => number,
): { frequency: number; recency: number } {
  const lambda = sampleGamma(params.r, 1 / params.alpha, rng);
  const p = sampleBeta(params.a, params.b, rng);
  let t = 0;
  let x = 0;
  let tx = 0;
  for (;;) {
    const u = Math.max(rng(), Number.MIN_VALUE);
    t += -Math.log(u) / lambda;
    if (t > T) break;
    x++;
    tx = t;
    if (rng() < p) break;
  }
  return { frequency: x, recency: tx };
}

/** Gamma-Gamma の生成過程で反復購入者の平均金額を再生成する。 */
function simulateMonetary(gg: GgParams, frequency: number, rng: () => number): number {
  if (frequency < 1) return 0;
  const nu = sampleGamma(gg.q, 1 / gg.gamma, rng);
  return sampleGamma(gg.p * frequency, 1 / (nu * frequency), rng);
}

/** コホートの 1 顧客あたり平均 CLV（割引現在売上ベース, margin=1）。 */
function meanClv(
  rfm: Rfm[],
  bg: BgNbdParams,
  gg: GgParams,
  horizonMonths: number,
  monthlyDiscount: number,
  unitsPerMonth: number,
): number {
  let sum = 0;
  for (const c of rfm) {
    sum += clv(c, bg, gg, { horizonMonths, monthlyDiscount, margin: 1, unitsPerMonth });
  }
  return sum / rfm.length;
}

/**
 * コホートの「1 顧客あたり平均 CLV」に区間を付す。同一入力＋同一 seed で完全再現。
 *
 * @param input rfm コホートと horizon/discount/margin
 * @param opts iterations・seed・level
 * @returns perCustomerMean（点＋区間）・（margin 指定時）grossProfitPerCustomer・params・warnings
 * @throws {RangeError} rfm が空、opts が不正、または全反復が再推定に失敗した場合
 */
export function clvWithInterval(
  input: ClvIntervalInput,
  opts: ClvIntervalOptions = {},
): ClvIntervalResult {
  const { rfm, horizonMonths, monthlyDiscount } = input;
  if (!Array.isArray(rfm) || rfm.length === 0) {
    throw new RangeError("input.rfm must be a non-empty array of Rfm");
  }
  if (input.margin !== undefined && !(input.margin >= 0)) {
    throw new RangeError(`margin must be >= 0, received ${input.margin}`);
  }
  const iterations = opts.iterations ?? 200;
  const seed = opts.seed ?? 1;
  const level = opts.level ?? 0.9;
  if (!(level > 0) || !(level < 1)) {
    throw new RangeError(`level must be within (0, 1), received ${level}`);
  }
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError(`iterations must be a positive integer, received ${iterations}`);
  }
  const unitsPerMonth = input.unitsPerMonth ?? WEEKS_PER_MONTH;

  const bg = fitBgNbd(rfm);
  const gg = fitGammaGamma(rfm, { warn: false });

  // 点推定（clv() の平均。引数検証も clv() 内で走る）
  const point = meanClv(rfm, bg, gg, horizonMonths, monthlyDiscount, unitsPerMonth);

  // 妥当性の警告
  const warnings: string[] = [];
  if (rfm.length < FEW_CUSTOMERS_THRESHOLD) {
    warnings.push(
      `顧客数が ${rfm.length} 件と少なく（< ${FEW_CUSTOMERS_THRESHOLD}）、区間が実際の不確実性を過小評価する可能性があります。`,
    );
  }
  const maxT = rfm.reduce((m, c) => (c.T > m ? c.T : m), 0);
  const horizonUnits = horizonMonths * unitsPerMonth;
  if (horizonUnits > maxT) {
    warnings.push(
      `予測期間（${horizonUnits.toFixed(1)} 単位）が観測窓の最大 T（${maxT.toFixed(1)} 単位）を超えており、観測外への外挿になります。`,
    );
  }
  const indep = checkFrequencyMonetaryIndependence(rfm);
  if (!indep.independent) {
    warnings.push(
      `frequency と monetary の相関が ${indep.correlation.toFixed(3)} で閾値 ${indep.threshold} を超過。Gamma-Gamma の独立仮定が崩れており、金額側の推定にバイアスが生じ得ます。`,
    );
  }

  // ブートストラップ：推定パラメータで同数コホートを再生成 → 再推定 → 平均 CLV
  const rng = createRng(seed);
  const samples: number[] = [];
  let skipped = 0;
  for (let i = 0; i < iterations; i++) {
    const sim: Rfm[] = rfm.map((c) => {
      const s = simulateBgNbdCustomer(bg, c.T, rng);
      return {
        customerId: c.customerId,
        frequency: s.frequency,
        recency: s.recency,
        T: c.T,
        monetary: simulateMonetary(gg, s.frequency, rng),
      };
    });
    try {
      const simBg = fitBgNbd(sim);
      const simGg = fitGammaGamma(sim, { warn: false });
      samples.push(meanClv(sim, simBg, simGg, horizonMonths, monthlyDiscount, unitsPerMonth));
    } catch {
      skipped++; // 再生成コホートが再推定に失敗した反復はスキップ
    }
  }
  if (samples.length === 0) {
    throw new RangeError("all bootstrap iterations failed to refit. Increase data size or iterations.");
  }

  samples.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  const low = percentile(samples, alpha);
  const high = percentile(samples, 1 - alpha);

  const result: ClvIntervalResult = {
    perCustomerMean: { point, low, high },
    params: { bgnbd: bg, gammaGamma: gg },
    iterations,
    seed,
    warnings,
  };
  if (input.margin !== undefined) {
    const m = input.margin;
    result.grossProfitPerCustomer = { point: point * m, low: low * m, high: high * m };
  }
  return result;
}

/**
 * 需要予測経路の時間分割バックテスト。
 *
 * 期間 t1（較正）で推定し、期間 t2（検証）を予測して実績と突き合わせる：
 *   MAE / RMSE / MAPE（点精度）と、区間のカバレッジ率
 *   （level の予測区間に実績が入った顧客の割合）を返す。
 *
 * 予測区間は BG/NBD の検証期間購買回数を Poisson(期待値) で近似した
 * 保守的な予測区間（決定的・シード不要）。過分散のため実分布より狭めになり得る
 * 点に留意（カバレッジは名目水準の下側に出やすい）。
 */

import { fitBgNbd, expectedTransactions } from "@forecast-manifesto/clv";
import type { Transaction, ToRfmOptions } from "@forecast-manifesto/clv";
import { splitCalibrationHoldout } from "./split.js";
import { mae, rmse, mape } from "./metrics.js";
import type { PredictionPair } from "./metrics.js";

export interface BacktestOptions extends ToRfmOptions {
  /** 較正期間の終端 */
  splitDate: Date;
  /** 検証期間の終端 */
  observationEnd: Date;
  /** 予測区間の名目水準（既定 0.9） */
  level?: number;
}

export interface BacktestResult {
  /** 対象顧客数（較正コホート） */
  nCustomers: number;
  /** 平均絶対誤差（顧客別 検証購買回数） */
  mae: number;
  /** 二乗平均平方根誤差 */
  rmse: number;
  /** 平均絶対百分率誤差（actual=0 は除外） */
  mape: number;
  /** 区間カバレッジ率（level の予測区間に実績が入った割合） */
  coverage: number;
  /** カバレッジの名目水準（= opts.level） */
  level: number;
  /** 較正期間の終端（ISO） */
  splitDate: string;
  /** 検証期間の終端（ISO） */
  observationEnd: string;
}

/** Poisson(λ) の下側分位点：CDF(k) >= p を満たす最小の k。 */
function poissonQuantile(lambda: number, p: number): number {
  if (lambda <= 0) return 0;
  let k = 0;
  let term = Math.exp(-lambda);
  let cdf = term;
  while (cdf < p && k < 1_000_000) {
    k += 1;
    term *= lambda / k;
    cdf += term;
  }
  return k;
}

/**
 * 取引ログを時間分割してバックテストする。
 *
 * @param transactions 取引ログ
 * @param opts splitDate・observationEnd・level・時間単位
 * @returns 点精度（MAE/RMSE/MAPE）と区間カバレッジ率
 * @throws {RangeError} 較正コホートが空、または level が (0,1) 外の場合
 */
export function backtest(
  transactions: Transaction[],
  opts: BacktestOptions,
): BacktestResult {
  const level = opts.level ?? 0.9;
  if (!(level > 0) || !(level < 1)) {
    throw new RangeError(`level must be within (0, 1), received ${level}`);
  }
  const { splitDate, observationEnd, ...rfmOpts } = opts;
  const { calibration, holdout } = splitCalibrationHoldout(
    transactions,
    splitDate,
    observationEnd,
    rfmOpts,
  );
  if (calibration.length === 0) {
    throw new RangeError("calibration cohort is empty; check splitDate/observationEnd");
  }

  const params = fitBgNbd(calibration);
  const alpha = (1 - level) / 2;

  const pairs: PredictionPair[] = [];
  let covered = 0;
  for (let i = 0; i < calibration.length; i++) {
    const predicted = expectedTransactions(holdout[i].holdoutT, calibration[i], params);
    const actual = holdout[i].actualTransactions;
    pairs.push({ predicted, actual });

    const low = poissonQuantile(predicted, alpha);
    const high = poissonQuantile(predicted, 1 - alpha);
    if (actual >= low && actual <= high) covered += 1;
  }

  return {
    nCustomers: calibration.length,
    mae: mae(pairs),
    rmse: rmse(pairs),
    mape: mape(pairs),
    coverage: covered / calibration.length,
    level,
    splitDate: splitDate.toISOString().slice(0, 10),
    observationEnd: observationEnd.toISOString().slice(0, 10),
  };
}

/**
 * 較正／検証分割（lifetimes の calibration_and_holdout_data 相当）。
 *
 * 較正期間（〜splitDate）で RFM を作り、検証期間（splitDate〜observationEnd）の
 * 実測（反復購買機会数・支出）を顧客別に対応付ける。
 * 較正期間に初回購入がない顧客（splitDate 以降に現れた顧客）は対象外。
 */

import { toRfm } from "@forecast-manifesto/clv";
import type { Rfm, Transaction, ToRfmOptions } from "@forecast-manifesto/clv";

const MS_PER_DAY = 86400000;

export interface HoldoutActual {
  customerId: string;
  /** 検証期間の実測購買機会数（同日複数取引は 1 機会——toRfm と同一規約） */
  actualTransactions: number;
  /** 検証期間の実測支出合計 */
  actualSpend: number;
  /** 検証期間の長さ（toRfm と同じ時間単位。既定は週） */
  holdoutT: number;
}

export interface SplitResult {
  calibration: Rfm[];
  holdout: HoldoutActual[];
}

/**
 * 取引ログを較正期間／検証期間に分割する。
 *
 * @param transactions 取引ログ
 * @param splitDate 較正期間の終端（この日までが較正）
 * @param observationEnd 検証期間の終端
 * @param opts toRfm と同じ時間単位オプション
 * @returns calibration（較正 RFM）と holdout（顧客別の検証実測）。
 *          holdout は calibration と同じ顧客集合・同じ順序。
 * @throws {RangeError} splitDate >= observationEnd の場合
 */
export function splitCalibrationHoldout(
  transactions: Transaction[],
  splitDate: Date,
  observationEnd: Date,
  opts: ToRfmOptions = {},
): SplitResult {
  if (splitDate.getTime() >= observationEnd.getTime()) {
    throw new RangeError(
      `splitDate (${splitDate.toISOString()}) must be before observationEnd (${observationEnd.toISOString()})`,
    );
  }
  const unitMs = (opts.timeUnitDays ?? 7) * MS_PER_DAY;
  const splitMs = startOfDay(splitDate);
  const endMs = startOfDay(observationEnd);

  const calibration = toRfm(transactions, splitDate, opts);
  const calibIds = new Set(calibration.map((c) => c.customerId));

  // 検証期間：(splitDate, observationEnd] の購買機会（同日集約）と支出
  const days = new Map<string, Map<number, number>>();
  for (const t of transactions) {
    const dayMs = startOfDay(t.date);
    if (dayMs <= splitMs || dayMs > endMs) continue;
    if (!calibIds.has(t.customerId)) continue; // 較正期間に存在しない顧客は対象外
    let m = days.get(t.customerId);
    if (!m) {
      m = new Map<number, number>();
      days.set(t.customerId, m);
    }
    m.set(dayMs, (m.get(dayMs) ?? 0) + t.amount);
  }

  const holdoutT = (endMs - splitMs) / unitMs;
  const holdout: HoldoutActual[] = calibration.map((c) => {
    const m = days.get(c.customerId);
    let spend = 0;
    if (m) for (const v of m.values()) spend += v;
    return {
      customerId: c.customerId,
      actualTransactions: m ? m.size : 0,
      actualSpend: spend,
      holdoutT,
    };
  });

  return { calibration, holdout };
}

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

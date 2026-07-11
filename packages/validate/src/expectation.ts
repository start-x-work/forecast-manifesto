/**
 * 頻度別の条件付き期待値（実測 vs 予測）と累積トラッキング。
 *
 * BG/NBD の「予測を当てるゲームにしない」ための実証装置：
 * - conditionalExpectationByFrequency … 較正頻度グループ別に検証期間の実測平均と
 *   条件付き期待 E[Y(t)|·] を突き合わせる（lifetimes の
 *   plot_calibration_purchases_vs_holdout_purchases 相当のデータ生成）
 * - trackingCumulative … Fader-Hardie-Lee (2005) Figure 3 と同じ方式の累積
 *   トラッキング。各顧客の「誕生」（初回購入）を起点に無条件期待 E[X(t)] を
 *   積み上げ、実測の累積反復購買と並べる
 */

import { expectedTransactions } from "@forecast-manifesto/clv";
import type { Rfm, Transaction, BgNbdParams } from "@forecast-manifesto/clv";
import type { HoldoutActual } from "./split.js";

const MS_PER_DAY = 86400000;

export interface FrequencyRow {
  /** 較正期間の反復購買回数 x（capFrequency 指定時は上限グループに合併） */
  frequency: number;
  /** このグループの顧客数 */
  nCustomers: number;
  /** 検証期間の予測平均（E[Y(holdoutT) | x, t_x, T] のグループ平均） */
  predicted: number;
  /** 検証期間の実測平均 */
  actual: number;
}

export interface FrequencyOptions {
  /**
   * この頻度以上を 1 グループに合併する（lifetimes の n=7 相当）。
   * 高頻度の少数グループはノイズが大きいため、プロット用途では 7 前後を推奨。
   * 省略時は合併しない。
   */
  capFrequency?: number;
}

/**
 * 較正頻度グループ別に、検証期間の予測平均と実測平均を返す（頻度昇順）。
 *
 * @throws {RangeError} calib と holdout の顧客集合が一致しない場合
 */
export function conditionalExpectationByFrequency(
  calib: Rfm[],
  holdout: HoldoutActual[],
  params: BgNbdParams,
  opts: FrequencyOptions = {},
): FrequencyRow[] {
  const actualById = new Map(holdout.map((h) => [h.customerId, h]));
  const cap = opts.capFrequency;
  const groups = new Map<number, { n: number; pred: number; actual: number }>();

  for (const c of calib) {
    const h = actualById.get(c.customerId);
    if (!h) {
      throw new RangeError(`holdout is missing customer ${c.customerId} — use splitCalibrationHoldout to build both`);
    }
    const key = cap !== undefined ? Math.min(c.frequency, cap) : c.frequency;
    const g = groups.get(key) ?? { n: 0, pred: 0, actual: 0 };
    g.n++;
    g.pred += expectedTransactions(h.holdoutT, c, params);
    g.actual += h.actualTransactions;
    groups.set(key, g);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([frequency, g]) => ({
      frequency,
      nCustomers: g.n,
      predicted: g.pred / g.n,
      actual: g.actual / g.n,
    }));
}

export interface TrackingOptions {
  /** 較正期間の終端（コホート＝この日までに初回購入した顧客） */
  splitDate: Date;
  /** 追跡の終端 */
  observationEnd: Date;
  /** 集計バケット */
  bucket: "week" | "month";
  /** RFM の時間単位（1 単位あたりの日数、既定 7＝週） */
  timeUnitDays?: number;
}

export interface TrackingRow {
  /** コホート起点（最初の取引日）からのバケット連番（1 始まり） */
  t: number;
  /** このバケット終端が較正期間内なら true（splitDate 以前） */
  inCalibration: boolean;
  /** 予測の累積反復購買数（誕生起点の無条件期待 E[X(t−birth)] のコホート合計） */
  predicted: number;
  /** 実測の累積反復購買数（同日集約の購買機会。初回購入は含まない） */
  actual: number;
}

/**
 * 累積トラッキング（FHL 2005 Figure 3 方式）。
 *
 * コホート（splitDate までに初回購入した顧客）の反復購買を、コホート起点から
 * observationEnd まで累積で追う。予測は各顧客の誕生（初回購入日）を起点にした
 * 無条件期待 E[X(t)]（新規顧客の条件付き期待に等しい）の合計。
 * 較正期間のあてはまりと検証期間の外挿の両方が 1 本の線で確認できる。
 */
export function trackingCumulative(
  calib: Rfm[],
  transactions: Transaction[],
  params: BgNbdParams,
  opts: TrackingOptions,
): TrackingRow[] {
  const splitMs = startOfDay(opts.splitDate);
  const endMs = startOfDay(opts.observationEnd);
  if (splitMs >= endMs) {
    throw new RangeError("splitDate must be before observationEnd");
  }
  const unitMs = (opts.timeUnitDays ?? 7) * MS_PER_DAY;
  const bucketMs = (opts.bucket === "week" ? 7 : 365.25 / 12) * MS_PER_DAY;

  // コホート顧客の購買機会（同日集約）を収集
  const calibIds = new Set(calib.map((c) => c.customerId));
  const occasions = new Map<string, number[]>();
  for (const tx of transactions) {
    if (!calibIds.has(tx.customerId)) continue;
    const dayMs = startOfDay(tx.date);
    if (dayMs > endMs) continue;
    const arr = occasions.get(tx.customerId);
    if (arr) {
      if (!arr.includes(dayMs)) arr.push(dayMs);
    } else {
      occasions.set(tx.customerId, [dayMs]);
    }
  }

  // 誕生（初回購入日）とコホート起点
  let cohortStart = Infinity;
  const births: number[] = [];
  const repeatDays: number[] = [];
  for (const arr of occasions.values()) {
    arr.sort((a, b) => a - b);
    births.push(arr[0]);
    if (arr[0] < cohortStart) cohortStart = arr[0];
    for (let i = 1; i < arr.length; i++) repeatDays.push(arr[i]); // 反復のみ
  }
  if (!Number.isFinite(cohortStart)) {
    throw new RangeError("no transactions found for the calibration cohort");
  }

  const nBuckets = Math.ceil((endMs - cohortStart) / bucketMs);
  const actualPerBucket = new Array(nBuckets).fill(0);
  for (const dayMs of repeatDays) {
    const idx = Math.min(nBuckets - 1, Math.floor((dayMs - cohortStart) / bucketMs));
    actualPerBucket[idx]++;
  }

  // 無条件期待 E[X(t)] ＝ 新規顧客（x=0, t_x=0, T=0）の条件付き期待
  const virgin = { customerId: "", frequency: 0, recency: 0, T: 0, monetary: 0 };
  const eX = (tUnits: number): number =>
    tUnits <= 0 ? 0 : expectedTransactions(tUnits, virgin, params);

  const rows: TrackingRow[] = [];
  let actualCum = 0;
  for (let b = 1; b <= nBuckets; b++) {
    const bucketEndMs = Math.min(endMs, cohortStart + b * bucketMs);
    let predicted = 0;
    for (const birth of births) predicted += eX((bucketEndMs - birth) / unitMs);
    actualCum += actualPerBucket[b - 1];
    rows.push({ t: b, inCalibration: bucketEndMs <= splitMs, predicted, actual: actualCum });
  }
  return rows;
}

function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

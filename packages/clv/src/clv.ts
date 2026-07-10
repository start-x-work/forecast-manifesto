/**
 * CLV 合成（割引現在価値）と診断サマリ。
 *
 * CLV = Σ_{月 i=1..H}  M · margin · (E[Y(t_i)] − E[Y(t_{i-1})]) / (1 + d)^i
 *   M       … Gamma-Gamma の期待取引金額
 *   E[Y(t)] … BG/NBD の条件付き期待購買回数（累積）
 *   d       … 月次割引率
 *
 * 時間単位の注意：RFM の T・recency は既定で「週」。CLV の horizon は「月」で
 * 指定するため、月→週換算（1 月 = 365.25/12/7 週）して E[Y(t)] を評価する。
 */

import { expectedTransactions, probAlive } from "./bgnbd.js";
import type { BgNbdParams } from "./bgnbd.js";
import { expectedAvgValue } from "./gammaGamma.js";
import type { GgParams } from "./gammaGamma.js";
import type { Rfm } from "./rfm.js";

/** 1 月あたりの週数（RFM が週単位のときの換算係数） */
const WEEKS_PER_MONTH = 365.25 / 12 / 7;

export interface ClvOptions {
  /** 予測期間（月） */
  horizonMonths: number;
  /** 月次割引率（例 0.01 = 月1%） */
  monthlyDiscount: number;
  /** 粗利率（0〜1）。売上に乗じて利益に変換 */
  margin: number;
  /** RFM の時間単位が週でない場合の 1 月あたり単位数（既定 = 週換算） */
  unitsPerMonth?: number;
}

/**
 * 個客の CLV（割引現在価値）を求める。
 *
 * @throws {RangeError} オプションが不正な場合
 */
export function clv(c: Rfm, p: BgNbdParams, gg: GgParams, opts: ClvOptions): number {
  const { horizonMonths, monthlyDiscount, margin } = opts;
  if (!(horizonMonths > 0) || !Number.isInteger(horizonMonths)) {
    throw new RangeError(`horizonMonths must be a positive integer, received ${horizonMonths}`);
  }
  if (!(monthlyDiscount >= 0)) {
    throw new RangeError(`monthlyDiscount must be >= 0, received ${monthlyDiscount}`);
  }
  if (!(margin >= 0)) {
    throw new RangeError(`margin must be >= 0, received ${margin}`);
  }

  const unitsPerMonth = opts.unitsPerMonth ?? WEEKS_PER_MONTH;
  const avgValue = expectedAvgValue(c, gg);

  let total = 0;
  let prevCumTx = 0; // E[Y(0)] = 0
  for (let month = 1; month <= horizonMonths; month++) {
    const t = month * unitsPerMonth;
    const cumTx = expectedTransactions(t, c, p);
    const incrementalTx = cumTx - prevCumTx;
    total += (avgValue * margin * incrementalTx) / Math.pow(1 + monthlyDiscount, month);
    prevCumTx = cumTx;
  }
  return total;
}

export type SegmentLabel = "優良継続" | "離反危機" | "新規" | "休眠";

export interface Segment {
  label: SegmentLabel;
  count: number;
  share: number;
}

export interface Summary {
  /** 生存顧客比率（平均 P(alive)） */
  aliveRate: number;
  /** 上位 20% の（予測）売上集中度 */
  top20RevenueShare: number;
  /** 今後 12 ヶ月の期待反復購買回数の総和 */
  expectedRepeatNext12m: number;
  /** セグメント分布（4区分） */
  segments: Segment[];
}

export interface SummarizeOptions {
  /** 生存判定のしきい値（既定 0.5） */
  aliveThreshold?: number;
  /** RFM の時間単位が週でない場合の 1 月あたり単位数（既定 = 週換算） */
  unitsPerMonth?: number;
}

/**
 * 診断・レポート用の集計サマリ。
 *
 * segments は (生存 × 反復購入有無) の 2×2 で 4 区分。count 合計＝顧客数、
 * share 合計＝1。
 */
export function summarize(
  rfm: Rfm[],
  p: BgNbdParams,
  gg: GgParams,
  opts: SummarizeOptions = {},
): Summary {
  const n = rfm.length;
  if (n === 0) {
    return {
      aliveRate: 0,
      top20RevenueShare: 0,
      expectedRepeatNext12m: 0,
      segments: [
        { label: "優良継続", count: 0, share: 0 },
        { label: "離反危機", count: 0, share: 0 },
        { label: "新規", count: 0, share: 0 },
        { label: "休眠", count: 0, share: 0 },
      ],
    };
  }

  const aliveThreshold = opts.aliveThreshold ?? 0.5;
  const unitsPerMonth = opts.unitsPerMonth ?? WEEKS_PER_MONTH;
  const t12 = 12 * unitsPerMonth;

  let aliveSum = 0;
  let expectedRepeatNext12m = 0;
  const values: number[] = []; // 予測12ヶ月売上（集中度用）
  const counts: Record<SegmentLabel, number> = { 優良継続: 0, 離反危機: 0, 新規: 0, 休眠: 0 };

  for (const c of rfm) {
    const alive = probAlive(c, p);
    aliveSum += alive;

    const et12 = expectedTransactions(t12, c, p);
    expectedRepeatNext12m += et12;
    values.push(expectedAvgValue(c, gg) * et12);

    const isAlive = alive >= aliveThreshold;
    const hasRepeat = c.frequency >= 1;
    const label: SegmentLabel = isAlive
      ? hasRepeat
        ? "優良継続"
        : "新規"
      : hasRepeat
        ? "離反危機"
        : "休眠";
    counts[label]++;
  }

  // 上位 20% 売上集中度
  values.sort((a, b) => b - a);
  const totalValue = values.reduce((s, v) => s + v, 0);
  const topCount = Math.max(1, Math.ceil(n * 0.2));
  const topValue = values.slice(0, topCount).reduce((s, v) => s + v, 0);
  const top20RevenueShare = totalValue > 0 ? topValue / totalValue : 0;

  const labels: SegmentLabel[] = ["優良継続", "離反危機", "新規", "休眠"];
  const segments: Segment[] = labels.map((label) => ({
    label,
    count: counts[label],
    share: counts[label] / n,
  }));

  return {
    aliveRate: aliveSum / n,
    top20RevenueShare,
    expectedRepeatNext12m,
    segments,
  };
}

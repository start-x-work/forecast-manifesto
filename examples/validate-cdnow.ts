/**
 * 検証レポートの実例：CDNOW を較正39週/検証39週に分割し、
 * BG/NBD の予測を実測と突き合わせた Markdown レポートを出力する。
 *
 *   npm run build
 *   npm run example:validate
 */

import { readFileSync } from "node:fs";
import { fitBgNbd } from "@forecast-manifesto/clv";
import type { Transaction } from "@forecast-manifesto/clv";
import {
  splitCalibrationHoldout,
  conditionalExpectationByFrequency,
  trackingCumulative,
  mae,
  rmse,
  mape,
} from "@forecast-manifesto/validate";

// CDNOW 公開データ（1/10 系統サンプル）。validate のテストフィクスチャを再利用。
const csvUrl = new URL("../packages/validate/tests/fixtures/cdnow_transactions.csv", import.meta.url);
const transactions: Transaction[] = readFileSync(csvUrl, "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((l) => {
    const [id, date, amount] = l.split(",");
    return { customerId: id, date: new Date(date + "T00:00:00Z"), amount: Number(amount) };
  });

const splitDate = new Date("1997-09-30T00:00:00Z");
const observationEnd = new Date("1998-06-30T00:00:00Z");

const { calibration, holdout } = splitCalibrationHoldout(transactions, splitDate, observationEnd);
const params = fitBgNbd(calibration);
const freq = conditionalExpectationByFrequency(calibration, holdout, params, { capFrequency: 7 });
const track = trackingCumulative(calibration, transactions, params, {
  splitDate,
  observationEnd,
  bucket: "week",
});
const holdoutRows = track.filter((r) => !r.inCalibration);
const last = track[track.length - 1];

const lines: string[] = [];
lines.push(`# 検証レポート — CDNOW（較正39週 / 検証39週）`);
lines.push("");
lines.push(`- コホート: ${calibration.length} 顧客 / 取引 ${transactions.length} 件`);
lines.push(
  `- BG/NBD: r=${params.r.toFixed(3)}, α=${params.alpha.toFixed(3)}, a=${params.a.toFixed(3)}, b=${params.b.toFixed(3)}`,
);
lines.push("");
lines.push(`## 頻度別 実測 vs 予測（検証期間）`);
lines.push("");
lines.push(`| 較正頻度 | 顧客数 | 予測平均 | 実測平均 |`);
lines.push(`|---:|---:|---:|---:|`);
for (const r of freq) {
  const label = r.frequency === 7 ? "7+" : String(r.frequency);
  lines.push(`| ${label} | ${r.nCustomers} | ${r.predicted.toFixed(3)} | ${r.actual.toFixed(3)} |`);
}
lines.push("");
lines.push(`## 累積トラッキング（FHL 2005 Figure 3 方式）`);
lines.push("");
lines.push(`- 追跡: ${track.length} 週（うち較正 ${track.length - holdoutRows.length} 週）`);
lines.push(`- 最終累積: 予測 ${last.predicted.toFixed(0)} vs 実測 ${last.actual}`);
lines.push(`- 最終相対誤差: ${((Math.abs(last.predicted - last.actual) / last.actual) * 100).toFixed(2)}%`);
lines.push(`- 検証期間の週次 MAPE: ${mape(holdoutRows).toFixed(2)}%（actual=0 の週は除外）`);
lines.push(`- MAE: ${mae(track).toFixed(1)} / RMSE: ${rmse(track).toFixed(1)}`);
lines.push("");
lines.push(`> 予測は「当てるゲーム」ではない。構造が実測を再現できているかを、`);
lines.push(`> 頻度別の突き合わせと累積トラッキングで確認してから使う。`);

console.log(lines.join("\n"));

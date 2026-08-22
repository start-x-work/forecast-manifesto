/**
 * バックテストの実例：CDNOW を較正39週/検証39週に分割し、
 * 点精度（MAE/RMSE/MAPE）と予測区間のカバレッジ率を出す。
 *
 *   npm run build
 *   npm run example:backtest
 */

import { readFileSync } from "node:fs";
import type { Transaction } from "@forecast-manifesto/clv";
import { backtest } from "@forecast-manifesto/validate";

const csvUrl = new URL("../packages/validate/tests/fixtures/cdnow_transactions.csv", import.meta.url);
const transactions: Transaction[] = readFileSync(csvUrl, "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((l) => {
    const [id, date, amount] = l.split(",");
    return { customerId: id, date: new Date(date + "T00:00:00Z"), amount: Number(amount) };
  });

const r = backtest(transactions, {
  splitDate: new Date("1997-09-30T00:00:00Z"),
  observationEnd: new Date("1998-06-30T00:00:00Z"),
  level: 0.9,
});

console.log("# バックテスト（CDNOW 39週/39週）");
console.log(`- 顧客数: ${r.nCustomers}`);
console.log(`- MAE: ${r.mae.toFixed(3)} / RMSE: ${r.rmse.toFixed(3)} / MAPE: ${r.mape.toFixed(1)}%`);
console.log(`- 予測区間カバレッジ（名目 ${(r.level * 100).toFixed(0)}%）: ${(r.coverage * 100).toFixed(1)}%`);
console.log(`- 予測は当てるゲームではない。点精度と区間の当たり具合を両方見る（docs/08）。`);

import { readFileSync } from "node:fs";
import type { Transaction } from "@forecast-manifesto/clv";

/**
 * CDNOW 取引フィクスチャ（Fader-Hardie-Lee 2005 の 1/10 系統サンプル、
 * 2,357 顧客・6,919 取引・1997-01-01〜1998-06-30）を読み込む。
 * 出典：CDNOW 公開データセット（学術ベンチマーク）。
 */
export function loadCdnowTransactions(): Transaction[] {
  const csv = readFileSync(new URL("./fixtures/cdnow_transactions.csv", import.meta.url), "utf8");
  return csv
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => {
      const [id, date, amount] = l.split(",");
      return { customerId: id, date: new Date(date + "T00:00:00Z"), amount: Number(amount) };
    });
}

export const CDNOW_SPLIT = new Date("1997-09-30T00:00:00Z");
export const CDNOW_END = new Date("1998-06-30T00:00:00Z");

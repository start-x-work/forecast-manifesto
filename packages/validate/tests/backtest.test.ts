import { describe, it, expect } from "vitest";
import { backtest } from "../src/backtest.js";
import { loadCdnowTransactions, CDNOW_SPLIT, CDNOW_END } from "./helpers.js";

const transactions = loadCdnowTransactions();

describe("backtest — 時間分割バックテスト（CDNOW 39週/39週）", () => {
  it("公開データで実行でき、健全な指標を返す", () => {
    const r = backtest(transactions, { splitDate: CDNOW_SPLIT, observationEnd: CDNOW_END });
    expect(r.nCustomers).toBe(2357);
    expect(r.mae).toBeGreaterThanOrEqual(0);
    expect(r.rmse).toBeGreaterThanOrEqual(r.mae); // RMSE >= MAE（常に成立）
    expect(Number.isFinite(r.mape)).toBe(true);
    expect(r.coverage).toBeGreaterThanOrEqual(0);
    expect(r.coverage).toBeLessThanOrEqual(1);
    expect(r.level).toBe(0.9);
  });

  it("カバレッジ率が名目水準の近傍（緩め: 0.7〜1.0）に出る", () => {
    const r = backtest(transactions, { splitDate: CDNOW_SPLIT, observationEnd: CDNOW_END, level: 0.9 });
    expect(r.coverage).toBeGreaterThan(0.7);
    expect(r.coverage).toBeLessThanOrEqual(1);
  });

  it("名目水準を上げるとカバレッジは単調非減少", () => {
    const lo = backtest(transactions, { splitDate: CDNOW_SPLIT, observationEnd: CDNOW_END, level: 0.5 });
    const hi = backtest(transactions, { splitDate: CDNOW_SPLIT, observationEnd: CDNOW_END, level: 0.95 });
    expect(hi.coverage).toBeGreaterThanOrEqual(lo.coverage);
  });

  it("決定的（同一入力で同一結果）", () => {
    const a = backtest(transactions, { splitDate: CDNOW_SPLIT, observationEnd: CDNOW_END });
    const b = backtest(transactions, { splitDate: CDNOW_SPLIT, observationEnd: CDNOW_END });
    expect(a).toEqual(b);
  });

  it("不正な level は throw", () => {
    expect(() => backtest(transactions, { splitDate: CDNOW_SPLIT, observationEnd: CDNOW_END, level: 1 })).toThrow();
  });
});

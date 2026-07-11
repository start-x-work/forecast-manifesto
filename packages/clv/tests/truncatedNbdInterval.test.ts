import { describe, it, expect } from "vitest";
import { fitTruncatedNbdWithInterval } from "../src/truncatedNbdInterval.js";
import { fitTruncatedNbd } from "../src/truncatedNbd.js";
import { nbdPmf, zeroPurchaseProbability } from "@forecast-manifesto/solver";

/** 既知の (M, K) から観測値を生成（round-trip 用） */
function observables(M: number, K: number): { m: number; repeatRate: number } {
  const p0 = zeroPurchaseProbability(M, K);
  return { m: M / (1 - p0), repeatRate: 1 - nbdPmf(1, M, K) / (1 - p0) };
}

const { m, repeatRate } = observables(1.4, 0.75);

describe("fitTruncatedNbdWithInterval — seed 再現性", () => {
  it("同一入力＋同一 seed で結果が完全一致（2回実行）", () => {
    const a = fitTruncatedNbdWithInterval(m, repeatRate, { iterations: 50, seed: 42, nCustomers: 500 });
    const b = fitTruncatedNbdWithInterval(m, repeatRate, { iterations: 50, seed: 42, nCustomers: 500 });
    expect(a).toEqual(b);
  });

  it("seed が違えば区間は変わる", () => {
    const a = fitTruncatedNbdWithInterval(m, repeatRate, { iterations: 50, seed: 1, nCustomers: 500 });
    const b = fitTruncatedNbdWithInterval(m, repeatRate, { iterations: 50, seed: 2, nCustomers: 500 });
    expect(a.interval.K.low).not.toBe(b.interval.K.low);
  });
});

describe("fitTruncatedNbdWithInterval — 区間の健全性", () => {
  const res = fitTruncatedNbdWithInterval(m, repeatRate, { iterations: 200, seed: 1, nCustomers: 2000 });

  it("点推定は fitTruncatedNbd と同一", () => {
    const point = fitTruncatedNbd(m, repeatRate);
    expect(res.M).toBe(point.M);
    expect(res.K).toBe(point.K);
  });

  it("(M, K) の区間が点推定を含む", () => {
    expect(res.interval.M.low).toBeLessThanOrEqual(res.M);
    expect(res.interval.M.high).toBeGreaterThanOrEqual(res.M);
    expect(res.interval.K.low).toBeLessThanOrEqual(res.K);
    expect(res.interval.K.high).toBeGreaterThanOrEqual(res.K);
    expect(res.interval.level).toBe(0.9);
  });

  it("翌年期待購買回数 = M(K+m)/(M+K) の点と p5–p95 を返す", () => {
    const expected = (res.M * (res.K + m)) / (res.M + res.K);
    expect(res.nextYearPurchasesPerCustomer.point).toBeCloseTo(expected, 10);
    expect(res.nextYearPurchasesPerCustomer.p5).toBeLessThanOrEqual(res.nextYearPurchasesPerCustomer.point);
    expect(res.nextYearPurchasesPerCustomer.p95).toBeGreaterThanOrEqual(res.nextYearPurchasesPerCustomer.point);
  });

  it("iterations フィールドは指定値を返す", () => {
    expect(res.iterations).toBe(200);
  });

  it("母数を増やすと区間は狭くなる（感度）", () => {
    const small = fitTruncatedNbdWithInterval(m, repeatRate, { iterations: 150, seed: 1, nCustomers: 300 });
    const large = fitTruncatedNbdWithInterval(m, repeatRate, { iterations: 150, seed: 1, nCustomers: 5000 });
    const width = (x: { low: number; high: number }) => x.high - x.low;
    expect(width(large.interval.K)).toBeLessThan(width(small.interval.K));
    expect(width(large.interval.M)).toBeLessThan(width(small.interval.M));
  });
});

describe("fitTruncatedNbdWithInterval — 契約と実行時間", () => {
  it("opts 省略で動く（iterations=200 既定）と実行時間が実用域", () => {
    const t0 = performance.now();
    const res = fitTruncatedNbdWithInterval(m, repeatRate);
    const elapsed = performance.now() - t0;
    expect(res.iterations).toBe(200);
    expect(elapsed).toBeLessThan(10_000); // 実用域（既定 200 反復 × 1000 人）
  }, 30_000);

  it("点推定 API の解なし条件をそのまま伝播する", () => {
    expect(() => fitTruncatedNbdWithInterval(1.2, 0.5)).toThrow(RangeError); // m < 1+repeatRate
    expect(() => fitTruncatedNbdWithInterval(0.8, 0.3)).toThrow(RangeError);
  });

  it("不正な opts を throw する", () => {
    expect(() => fitTruncatedNbdWithInterval(m, repeatRate, { level: 1.5 })).toThrow(RangeError);
    expect(() => fitTruncatedNbdWithInterval(m, repeatRate, { nCustomers: 1 })).toThrow(RangeError);
    expect(() => fitTruncatedNbdWithInterval(m, repeatRate, { iterations: 0 })).toThrow(RangeError);
  });

  it("警告：iterations×nCustomers > 1e7", () => {
    const res = fitTruncatedNbdWithInterval(m, repeatRate, { iterations: 2, nCustomers: 5_000_001, seed: 1 });
    expect(res.warning).toMatch(/1e7/);
  }, 120_000);
});

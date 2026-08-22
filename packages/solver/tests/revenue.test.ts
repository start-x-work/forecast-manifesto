import { describe, it, expect } from "vitest";
import { forecastRevenueWithInterval } from "../src/revenue.js";

const base = { marketSize: 1_000_000, M: 1.4, penetration: 0.5461, unitPrice: 480 };

describe("forecastRevenueWithInterval — 浸透率ベース売上の区間", () => {
  it("同一シードで完全再現", () => {
    const a = forecastRevenueWithInterval(base, { seed: 7, iterations: 300, nCustomers: 1500 });
    const b = forecastRevenueWithInterval(base, { seed: 7, iterations: 300, nCustomers: 1500 });
    expect(a).toEqual(b);
  });

  it("low < point < high", () => {
    const r = forecastRevenueWithInterval(base, { seed: 1, iterations: 400, nCustomers: 2000 });
    expect(r.low).toBeLessThan(r.point);
    expect(r.point).toBeLessThan(r.high);
  });

  it("点推定は marketSize×penetration×unitPrice（既定 purchasesPerBuyer=1）", () => {
    const r = forecastRevenueWithInterval(base, { iterations: 50 });
    expect(r.point).toBeCloseTo(1_000_000 * 0.5461 * 480, 6);
  });

  it("母数が小さいほど区間が広い（感度）", () => {
    const wide = forecastRevenueWithInterval(base, { seed: 3, iterations: 400, nCustomers: 500 });
    const narrow = forecastRevenueWithInterval(base, { seed: 3, iterations: 400, nCustomers: 8000 });
    const w = wide.high - wide.low;
    const n = narrow.high - narrow.low;
    expect(w).toBeGreaterThan(n);
  });

  it("不正入力は throw", () => {
    expect(() => forecastRevenueWithInterval({ ...base, marketSize: -1 })).toThrow();
    expect(() => forecastRevenueWithInterval({ ...base, penetration: 1.5 })).toThrow();
    expect(() => forecastRevenueWithInterval(base, { level: 1 })).toThrow();
  });
});

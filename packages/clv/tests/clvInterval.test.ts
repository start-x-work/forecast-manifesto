import { describe, it, expect } from "vitest";
import { clvWithInterval } from "../src/clvInterval.js";
import { clv } from "../src/clv.js";
import { fitBgNbd } from "../src/bgnbd.js";
import { fitGammaGamma } from "../src/gammaGamma.js";
import type { Rfm } from "../src/rfm.js";
import { loadCdnowRfm } from "./helpers.js";

// 再推定を反復するため、テストは CDNOW の部分集合で軽量に回す（母数依存の性質は
// 部分集合でも保たれる）。
const full = loadCdnowRfm();
const cohort = full.slice(0, 600);
const input = { rfm: cohort, horizonMonths: 12, monthlyDiscount: 0.01 };

describe("clvWithInterval（コホート）— 区間つき LTV", () => {
  it("perCustomerMean.point が clv() の平均に一致する（1e-6）", () => {
    const bg = fitBgNbd(cohort);
    const gg = fitGammaGamma(cohort, { warn: false });
    const expected =
      cohort.reduce(
        (s, c) => s + clv(c, bg, gg, { horizonMonths: 12, monthlyDiscount: 0.01, margin: 1 }),
        0,
      ) / cohort.length;
    // point は iterations に依存しないので最小反復で十分
    const r = clvWithInterval(input, { iterations: 1, seed: 1 });
    expect(r.perCustomerMean.point).toBeCloseTo(expected, 6);
  });

  it("同一シードで完全再現", () => {
    const a = clvWithInterval(input, { iterations: 20, seed: 7 });
    const b = clvWithInterval(input, { iterations: 20, seed: 7 });
    expect(a).toEqual(b);
  });

  it("low <= point <= high", () => {
    const r = clvWithInterval(input, { iterations: 30, seed: 1 });
    expect(r.perCustomerMean.low).toBeLessThanOrEqual(r.perCustomerMean.point);
    expect(r.perCustomerMean.point).toBeLessThanOrEqual(r.perCustomerMean.high);
  });

  it("顧客数が少ないほど区間が広い", () => {
    const small = clvWithInterval({ ...input, rfm: full.slice(0, 150) }, { iterations: 40, seed: 2 });
    const large = clvWithInterval({ ...input, rfm: full.slice(0, 900) }, { iterations: 40, seed: 2 });
    const wSmall = small.perCustomerMean.high - small.perCustomerMean.low;
    const wLarge = large.perCustomerMean.high - large.perCustomerMean.low;
    expect(wSmall).toBeGreaterThan(wLarge);
  });

  it("顧客数 < 300 の警告が出る", () => {
    const r = clvWithInterval({ ...input, rfm: full.slice(0, 200) }, { iterations: 3, seed: 1 });
    expect(r.warnings.some((w) => w.includes("顧客数"))).toBe(true);
  });

  it("margin 指定時のみ grossProfitPerCustomer を返す（= perCustomerMean × margin）", () => {
    const withMargin = clvWithInterval({ ...input, margin: 0.3 }, { iterations: 3, seed: 1 });
    expect(withMargin.grossProfitPerCustomer).toBeDefined();
    expect(withMargin.grossProfitPerCustomer!.point).toBeCloseTo(
      withMargin.perCustomerMean.point * 0.3,
      9,
    );
    const noMargin = clvWithInterval(input, { iterations: 3, seed: 1 });
    expect(noMargin.grossProfitPerCustomer).toBeUndefined();
  });

  it("frequency と monetary が強相関の合成データで独立性警告が出る", () => {
    // 反復回数が多い顧客ほど金額も高い（正相関）合成コホート
    const correlated: Rfm[] = [];
    for (let i = 0; i < 400; i++) {
      const freq = 1 + (i % 8); // 1..8
      correlated.push({
        customerId: `c${i}`,
        frequency: freq,
        recency: 20,
        T: 38,
        monetary: 10 + freq * 12, // 頻度に比例＝強い正相関
      });
    }
    const r = clvWithInterval(
      { rfm: correlated, horizonMonths: 12, monthlyDiscount: 0.01 },
      { iterations: 5, seed: 1 },
    );
    expect(r.warnings.some((w) => w.includes("独立仮定"))).toBe(true);
  });

  it("不正入力は throw", () => {
    expect(() => clvWithInterval({ ...input, rfm: [] })).toThrow();
    expect(() => clvWithInterval(input, { level: 1 })).toThrow();
    expect(() => clvWithInterval(input, { iterations: 0 })).toThrow();
  });
});

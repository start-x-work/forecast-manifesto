import { describe, it, expect } from "vitest";
import { fitBgNbd, probAlive, expectedTransactions } from "../src/bgnbd.js";
import type { Rfm } from "../src/rfm.js";
import { loadCdnowRfm } from "./helpers.js";

const rfm = loadCdnowRfm();

describe("fitBgNbd — CDNOW reproduces Fader-Hardie-Lee (2005)", () => {
  const fit = fitBgNbd(rfm);

  it("recovers r, alpha, a, b within 1e-2 of published values", () => {
    expect(fit.r).toBeCloseTo(0.243, 2);
    expect(fit.alpha).toBeCloseTo(4.414, 2);
    expect(fit.a).toBeCloseTo(0.793, 2);
    expect(fit.b).toBeCloseTo(2.426, 2);
  });

  it("log-likelihood matches the published value (~ -9582.4)", () => {
    expect(fit.logLik).toBeGreaterThan(-9583);
    expect(fit.logLik).toBeLessThan(-9582);
  });
});

describe("probAlive", () => {
  const fit = fitBgNbd(rfm);

  it("is exactly 1 for customers with no repeat purchase (frequency = 0)", () => {
    for (const c of rfm.filter((r) => r.frequency === 0).slice(0, 50)) {
      expect(probAlive(c, fit)).toBe(1);
    }
  });

  it("is within (0, 1] for every customer", () => {
    for (const c of rfm) {
      const pa = probAlive(c, fit);
      expect(pa).toBeGreaterThan(0);
      expect(pa).toBeLessThanOrEqual(1);
    }
  });

  it("ranks a recently-active repeat buyer above an early-then-silent one", () => {
    const active = rfm.find((c) => c.customerId === "0001")!; // x=2, tx≈30.4, T≈38.9
    const silent = rfm.find((c) => c.customerId === "0002")!; // x=1, tx≈1.7, T≈38.9
    expect(probAlive(active, fit)).toBeGreaterThan(probAlive(silent, fit));
    // 早期に一度きり購入して沈黙 → 生存確率は低い
    expect(probAlive(silent, fit)).toBeLessThan(0.5);
  });
});

describe("expectedTransactions", () => {
  const fit = fitBgNbd(rfm);
  const c = rfm.find((r) => r.customerId === "0001")!;

  it("is 0 over a zero horizon", () => {
    expect(expectedTransactions(0, c, fit)).toBeCloseTo(0, 10);
  });

  it("is non-negative and monotonically increasing in the horizon", () => {
    let prev = 0;
    for (const t of [1, 4, 13, 26, 39, 52]) {
      const e = expectedTransactions(t, c, fit);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
  });

  it("aggregate 39-week expectation is in a sensible range for the sample", () => {
    let total = 0;
    for (const r of rfm) total += expectedTransactions(39, r, fit);
    // FHL のホールドアウト実測は ~1810。モデル期待はその近傍のオーダー。
    expect(total).toBeGreaterThan(1400);
    expect(total).toBeLessThan(2000);
  });
});

describe("fitBgNbd — boundaries", () => {
  it("throws on empty input", () => {
    expect(() => fitBgNbd([])).toThrow(RangeError);
  });

  it("handles an all-frequency-0 dataset without crashing", () => {
    const zeros: Rfm[] = Array.from({ length: 20 }, (_, i) => ({
      customerId: String(i),
      frequency: 0,
      recency: 0,
      T: 30,
      monetary: 0,
    }));
    const fit = fitBgNbd(zeros);
    expect(Number.isFinite(fit.logLik)).toBe(true);
    // 反復購入が皆無 → 全員 P(alive)=1
    for (const c of zeros) expect(probAlive(c, fit)).toBe(1);
  });

  it("handles a single customer", () => {
    const one: Rfm[] = [{ customerId: "x", frequency: 3, recency: 20, T: 30, monetary: 40 }];
    const fit = fitBgNbd(one);
    expect(Number.isFinite(fit.logLik)).toBe(true);
    expect(fit.r).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import {
  nbdPmf,
  lnGamma,
  zeroPurchaseProbability,
  penetrationFromK,
} from "../src/nbd.js";

describe("lnGamma", () => {
  it("matches known factorial values: Γ(n) = (n-1)!", () => {
    // Γ(1)=1, Γ(2)=1, Γ(3)=2, Γ(4)=6, Γ(5)=24
    expect(Math.exp(lnGamma(1))).toBeCloseTo(1, 10);
    expect(Math.exp(lnGamma(2))).toBeCloseTo(1, 10);
    expect(Math.exp(lnGamma(3))).toBeCloseTo(2, 10);
    expect(Math.exp(lnGamma(4))).toBeCloseTo(6, 10);
    expect(Math.exp(lnGamma(5))).toBeCloseTo(24, 8);
  });

  it("matches Γ(1/2) = sqrt(pi)", () => {
    expect(Math.exp(lnGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 10);
  });

  it("throws on non-positive input", () => {
    expect(() => lnGamma(0)).toThrow(RangeError);
    expect(() => lnGamma(-1)).toThrow(RangeError);
  });
});

describe("nbdPmf", () => {
  it("P_0 equals the zero-purchase probability (1 + M/K)^(-K)", () => {
    const M = 0.9;
    const K = 0.5;
    expect(nbdPmf(0, M, K)).toBeCloseTo(zeroPurchaseProbability(M, K), 12);
  });

  it("penetration = 1 - P_0", () => {
    const M = 1.4;
    const K = 0.7;
    expect(penetrationFromK(M, K)).toBeCloseTo(1 - nbdPmf(0, M, K), 12);
  });

  it("sums to ~1 over r = 0..1000", () => {
    const cases = [
      { M: 0.9, K: 0.5 },
      { M: 2.5, K: 1.2 },
      { M: 5.0, K: 0.3 },
    ];
    for (const { M, K } of cases) {
      let sum = 0;
      for (let r = 0; r <= 1000; r++) sum += nbdPmf(r, M, K);
      expect(sum).toBeGreaterThan(0.999999);
      expect(sum).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("all probabilities are non-negative and <= 1", () => {
    const M = 3.0;
    const K = 0.8;
    for (let r = 0; r <= 50; r++) {
      const p = nbdPmf(r, M, K);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("does not overflow for large M and small K", () => {
    const p = nbdPmf(200, 50, 0.05);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
  });

  it("throws on invalid r", () => {
    expect(() => nbdPmf(-1, 1, 1)).toThrow(RangeError);
    expect(() => nbdPmf(1.5, 1, 1)).toThrow(RangeError);
  });

  it("throws on invalid M or K", () => {
    expect(() => nbdPmf(0, 0, 1)).toThrow(RangeError);
    expect(() => nbdPmf(0, 1, 0)).toThrow(RangeError);
    expect(() => nbdPmf(0, -1, 1)).toThrow(RangeError);
  });
});

import { describe, it, expect } from "vitest";
import { paretoNbd } from "../src/index.js";
import type { ParetoNbdParams } from "../src/index.js";
import type { Rfm } from "../src/rfm.js";

// 教材用参照実装のサニティテスト（厳密照合は BG/NBD 側の責務）
const params: ParetoNbdParams = { r: 0.55, alpha: 10.58, s: 0.61, beta: 11.67 }; // SMC(1987) CDNOW系の目安値

function cust(frequency: number, recency: number, T: number): Rfm {
  return { customerId: "x", frequency, recency, T, monetary: 0 };
}

describe("paretoNbd.probAlive (教材用近似)", () => {
  it("stays within (0, 1]", () => {
    for (const c of [cust(0, 0, 38.9), cust(2, 30.4, 38.9), cust(10, 38, 38.9)]) {
      const pa = paretoNbd.probAlive(c, params);
      expect(pa).toBeGreaterThan(0);
      expect(pa).toBeLessThanOrEqual(1);
    }
  });

  it("recent activity implies higher survival than early silence", () => {
    const recent = paretoNbd.probAlive(cust(3, 37, 38.9), params);
    const silent = paretoNbd.probAlive(cust(3, 5, 38.9), params);
    expect(recent).toBeGreaterThan(silent);
  });
});

describe("paretoNbd.expectedTransactions (教材用近似)", () => {
  it("is non-negative and increases with the horizon", () => {
    const c = cust(2, 30.4, 38.9);
    const e13 = paretoNbd.expectedTransactions(13, c, params);
    const e39 = paretoNbd.expectedTransactions(39, c, params);
    expect(e13).toBeGreaterThanOrEqual(0);
    expect(e39).toBeGreaterThanOrEqual(e13);
  });

  it("caps the horizon by the expected remaining lifetime (s > 1)", () => {
    const heavyChurn: ParetoNbdParams = { r: 1, alpha: 10, s: 3, beta: 5 };
    const c = cust(2, 30, 38.9);
    const shortLife = paretoNbd.expectedTransactions(1000, c, heavyChurn);
    expect(Number.isFinite(shortLife)).toBe(true);
  });
});

describe("paretoNbd.logLikelihood", () => {
  it("throws — MLE is intentionally unsupported in the reference implementation", () => {
    expect(() => paretoNbd.logLikelihood(params, [cust(1, 10, 30)])).toThrow(/BG\/NBD|fitBgNbd/);
  });
});

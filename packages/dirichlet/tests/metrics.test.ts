import { describe, it, expect } from "vitest";
import {
  fitDirichlet,
  brandMetrics,
  duplicationMatrix,
  doubleJeopardyTable,
  pRGivenN,
  pZeroGivenN,
  brandPenetration,
} from "../src/index.js";
import { toothpaste } from "./fixtures/toothpaste.js";

const model = fitDirichlet(toothpaste);

describe("beta-binomial building blocks", () => {
  const S = model.S;
  const alpha = S * 0.25;

  it("P(r|n) sums to 1 over r = 0..n", () => {
    for (const n of [1, 3, 8]) {
      let sum = 0;
      for (let r = 0; r <= n; r++) sum += pRGivenN(S, alpha, r, n);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it("pZeroGivenN equals pRGivenN(0)", () => {
    for (const n of [0, 1, 5]) {
      expect(pZeroGivenN(S, alpha, n)).toBeCloseTo(pRGivenN(S, alpha, 0, n), 12);
    }
  });
});

describe("brandMetrics", () => {
  it("returns one row per brand, or a single named brand", () => {
    expect(brandMetrics(model)).toHaveLength(8);
    const one = brandMetrics(model, "Macleans");
    expect(one).toHaveLength(1);
    expect(one[0].name).toBe("Macleans");
  });

  it("throws for an unknown brand", () => {
    expect(() => brandMetrics(model, "Nope")).toThrow(RangeError);
  });

  it("all rates are within their natural ranges", () => {
    for (const m of brandMetrics(model)) {
      expect(m.penetration).toBeGreaterThan(0);
      expect(m.penetration).toBeLessThan(1);
      expect(m.buyRate).toBeGreaterThanOrEqual(1);
      expect(m.scr).toBeGreaterThan(0);
      expect(m.scr).toBeLessThanOrEqual(1);
      expect(m.soleBuyerRate).toBeGreaterThan(0);
      expect(m.soleBuyerRate).toBeLessThanOrEqual(1);
    }
  });
});

describe("duplicationMatrix — 重複購買の法則", () => {
  const D = duplicationMatrix(model);
  const pens = model.brands.map((b) => brandPenetration(model, model.S * b.marketShare));

  it("has unit diagonal and probabilities elsewhere", () => {
    for (let j = 0; j < D.length; j++) {
      expect(D[j][j]).toBe(1);
      for (let k = 0; k < D.length; k++) {
        if (j === k) continue;
        expect(D[j][k]).toBeGreaterThan(0);
        expect(D[j][k]).toBeLessThan(1);
      }
    }
  });

  it("duplication of brand j is roughly constant across partner brands (law of duplication)", () => {
    // D[j][k] ≈ 一定（k に依らない）——重複はパートナーではなく対象のシェアで決まる
    for (let j = 0; j < D.length; j++) {
      const row = D[j].filter((_, k) => k !== j);
      const max = Math.max(...row);
      const min = Math.min(...row);
      expect(max / min).toBeLessThan(1.2);
    }
  });

  it("satisfies the joint-buyer symmetry b_jk = D[j][k]·b_k = D[k][j]·b_j", () => {
    for (let j = 0; j < D.length; j++) {
      for (let k = j + 1; k < D.length; k++) {
        expect(D[j][k] * pens[k]).toBeCloseTo(D[k][j] * pens[j], 10);
      }
    }
  });
});

describe("doubleJeopardyTable — ダブルジェパディ", () => {
  const dj = doubleJeopardyTable(model);

  it("is sorted by ascending share", () => {
    for (let i = 1; i < dj.length; i++) {
      expect(dj[i].share).toBeGreaterThanOrEqual(dj[i - 1].share);
    }
  });

  it("penetration and buy rate both rise with share (二重の苦しみ)", () => {
    for (let i = 1; i < dj.length; i++) {
      expect(dj[i].penetration).toBeGreaterThanOrEqual(dj[i - 1].penetration);
      expect(dj[i].buyRate).toBeGreaterThanOrEqual(dj[i - 1].buyRate);
    }
  });
});

import { describe, it, expect } from "vitest";
import { fitDirichlet, robustWeightedS, brandMetrics, duplicationMatrix } from "../src/index.js";
import { toothpaste } from "./fixtures/toothpaste.js";

describe("fitDirichlet — input validation", () => {
  const ok = toothpaste;

  it("throws when market shares exceed 1 (+0.02)", () => {
    expect(() =>
      fitDirichlet({
        ...ok,
        brands: [
          { name: "A", marketShare: 0.7, observedPenetration: 0.3 },
          { name: "B", marketShare: 0.5, observedPenetration: 0.2 },
        ],
      }),
    ).toThrow(RangeError);
  });

  it("accepts partial share coverage (unmodeled brands as remainder)", () => {
    // R 同梱の歯磨き粉例自体、シェア合計 0.86
    expect(() => fitDirichlet(ok)).not.toThrow();
  });

  it("throws without S and without any observedPenetration", () => {
    expect(() =>
      fitDirichlet({
        categoryPenetration: 0.5,
        categoryBuyRate: 2,
        brands: [{ name: "A", marketShare: 0.6 }, { name: "B", marketShare: 0.4 }],
      }),
    ).toThrow(/observedPenetration|S/);
  });

  it("throws on invalid penetration / buy rate / share / periods", () => {
    const brands = [{ name: "A", marketShare: 0.6, observedPenetration: 0.3 }];
    expect(() => fitDirichlet({ categoryPenetration: 0, categoryBuyRate: 2, brands })).toThrow(RangeError);
    expect(() => fitDirichlet({ categoryPenetration: 1, categoryBuyRate: 2, brands })).toThrow(RangeError);
    expect(() => fitDirichlet({ categoryPenetration: 0.5, categoryBuyRate: 0.5, brands })).toThrow(RangeError);
    expect(() => fitDirichlet({ categoryPenetration: 0.5, categoryBuyRate: 2, brands: [] })).toThrow(RangeError);
    expect(() =>
      fitDirichlet({ categoryPenetration: 0.5, categoryBuyRate: 2, brands, observationPeriods: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      fitDirichlet({
        categoryPenetration: 0.5,
        categoryBuyRate: 2,
        brands: [{ name: "A", marketShare: 0.6, observedPenetration: 1.2 }],
      }),
    ).toThrow(RangeError);
  });

  it("accepts a direct S and skips estimation", () => {
    const model = fitDirichlet({
      categoryPenetration: 0.5,
      categoryBuyRate: 2,
      brands: [{ name: "A", marketShare: 0.6 }, { name: "B", marketShare: 0.4 }],
      S: 1.2,
    });
    expect(model.S).toBe(1.2);
  });
});

describe("fitDirichlet — degenerate single brand", () => {
  const model = fitDirichlet({
    categoryPenetration: 0.4,
    categoryBuyRate: 2.2,
    brands: [{ name: "Only", marketShare: 1 }],
    S: 1.5,
  });

  it("brand equals the category: pen = cat pen, buyRate = cat buy rate, SCR = sole = 1", () => {
    const [m] = brandMetrics(model);
    expect(m.penetration).toBeCloseTo(0.4, 6);
    expect(m.buyRate).toBeCloseTo(2.2, 6);
    expect(m.scr).toBeCloseTo(1, 6);
    expect(m.soleBuyerRate).toBeCloseTo(1, 6);
  });

  it("duplication matrix is [[1]]", () => {
    expect(duplicationMatrix(model)).toEqual([[1]]);
  });
});

describe("fitDirichlet — observationPeriods (期間倍率)", () => {
  const base = fitDirichlet(toothpaste);
  const yearly = fitDirichlet({ ...toothpaste, observationPeriods: 4 });

  it("scales M only (K and S unchanged)", () => {
    expect(yearly.M).toBeCloseTo(base.M * 4, 10);
    expect(yearly.K).toBeCloseTo(base.K, 10);
    expect(yearly.S).toBeCloseTo(base.S, 10);
  });

  it("longer period raises penetration and buy rate", () => {
    const b = brandMetrics(base)[0];
    const y = brandMetrics(yearly)[0];
    expect(y.penetration).toBeGreaterThan(b.penetration);
    expect(y.buyRate).toBeGreaterThan(b.buyRate);
  });
});

describe("robustWeightedS", () => {
  it("removes upper-notch outliers (current CRAN v1.4 behaviour)", () => {
    // 歯磨き粉例の S_j（デバッグで実測した値）
    const sAll = [1.2977, 2.2134, 1.6032, 0.8446, 1.4493, 1.293, 2.2198, 2.1382];
    const shares = [0.25, 0.19, 0.1, 0.1, 0.09, 0.08, 0.03, 0.02];
    expect(robustWeightedS(sAll, shares)).toBeCloseTo(1.2953, 3);
  });

  it("falls back to the plain weighted mean when everything is excluded", () => {
    expect(robustWeightedS([1, 1], [0.5, 0.5])).toBeCloseTo(1, 10);
  });
});

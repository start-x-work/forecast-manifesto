import { describe, it, expect } from "vitest";
import { fitDirichlet, brandMetrics } from "../src/index.js";
import { toothpaste, publishedParams, publishedBuyTable } from "./fixtures/toothpaste.js";

describe("toothpaste fixture — published parameters (print.dirichlet.Rd)", () => {
  const model = fitDirichlet(toothpaste);

  it("reproduces M, K, S within 1e-2", () => {
    expect(Math.abs(model.M - publishedParams.M)).toBeLessThan(1e-2);
    expect(Math.abs(model.K - publishedParams.K)).toBeLessThan(1e-2);
    expect(Math.abs(model.S - publishedParams.S)).toBeLessThan(1e-2);
  });

  it("theoretical brand penetrations stay close to the observed ones", () => {
    const rows = brandMetrics(model);
    for (let i = 0; i < rows.length; i++) {
      expect(Math.abs(rows[i].penetration - toothpaste.brands[i].observedPenetration)).toBeLessThan(0.015);
    }
  });
});

describe("toothpaste fixture — published buy table (summary.dirichlet.R comments)", () => {
  // ソースコメントの buy テーブルは、現行 CRAN v1.4 の外れ値除去ありの S での出力
  const model = fitDirichlet({ ...toothpaste, sOutlierRemoval: true });
  const rows = brandMetrics(model);

  it("uses the outlier-removed S (~1.30)", () => {
    expect(model.S).toBeCloseTo(1.2953, 2);
  });

  it("brand buy rates match pur.brand at published (1dp) precision", () => {
    for (let i = 0; i < rows.length; i++) {
      expect(Math.abs(rows[i].buyRate - publishedBuyTable.purBrand[i])).toBeLessThan(0.05);
    }
  });

  it("category rates per brand buyer match pur.cat at published (1dp) precision", () => {
    for (let i = 0; i < rows.length; i++) {
      const catRate = rows[i].buyRate / rows[i].scr;
      expect(Math.abs(catRate - publishedBuyTable.purCat[i])).toBeLessThan(0.05);
    }
  });

  it("SCR matches the ratio implied by the published table within rounding noise", () => {
    for (let i = 0; i < rows.length; i++) {
      const impliedScr = publishedBuyTable.purBrand[i] / publishedBuyTable.purCat[i];
      // 公表値が1桁精度のため、丸め起因の揺れとして 0.02 を許容
      expect(Math.abs(rows[i].scr - impliedScr)).toBeLessThan(0.02);
    }
  });
});

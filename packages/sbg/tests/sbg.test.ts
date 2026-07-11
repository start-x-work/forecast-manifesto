import { describe, it, expect } from "vitest";
import {
  fitSbg,
  churnProbabilities,
  survivalCurve,
  retentionCurve,
  logLikelihood,
  expectedTenure,
  discountedExpectedLifetime,
  discountedExpectedResidualLifetime,
  cohortLtv,
  fitSbgMultiCohort,
  logLikelihoodMultiCohort,
} from "../src/sbg.js";

/**
 * フィクスチャ出典：Fader & Hardie (2007) "How to Project Customer Retention"
 * (Journal of Interactive Marketing 21(1)) の High End / Regular 両セグメント。
 * 数値アンカーは Apache-2 参照実装 jdmaturen/shifted_beta_geometric_py が
 * 論文から引用するテスト値（α=0.668, β=3.806・LL(1,1)≈−2.115・
 * 8〜12年目外挿・DERL(d=0.1,n=7)≈7.530）に一致することを確認済み。
 * Regular の α=0.704, β=1.182 は論文掲載値で、本実装の独立 MLE が
 * データ系列から同値を再現する（交差検証）。
 */
const HIGH_END = [0.869, 0.743, 0.653, 0.593, 0.551, 0.517, 0.491];
const REGULAR = [0.631, 0.468, 0.382, 0.326, 0.289, 0.262, 0.241];

describe("fitSbg — Fader & Hardie (2007) 両セグメント再現", () => {
  it("High End: alpha=0.668, beta=3.806 within 1e-2", () => {
    const fit = fitSbg(HIGH_END);
    expect(Math.abs(fit.alpha - 0.668)).toBeLessThan(1e-2);
    expect(Math.abs(fit.beta - 3.806)).toBeLessThan(1e-2);
  });

  it("Regular: alpha=0.704, beta=1.182 within 1e-2", () => {
    const fit = fitSbg(REGULAR);
    expect(Math.abs(fit.alpha - 0.704)).toBeLessThan(1e-2);
    expect(Math.abs(fit.beta - 1.182)).toBeLessThan(1e-2);
  });

  it("accepts an optional leading 1.0", () => {
    const a = fitSbg(HIGH_END);
    const b = fitSbg([1.0, ...HIGH_END]);
    expect(b.alpha).toBeCloseTo(a.alpha, 8);
    expect(b.beta).toBeCloseTo(a.beta, 8);
  });

  it("log-likelihood at (1,1) matches the reference (-2.115)", () => {
    expect(Math.abs(logLikelihood({ alpha: 1, beta: 1 }, HIGH_END) - -2.115)).toBeLessThan(2e-3);
  });
});

describe("survivalCurve — 7年先の外挿が論文図を再現", () => {
  it("High End years 8-12 extrapolation matches [0.460, 0.436, 0.414, 0.395, 0.378]", () => {
    const fit = fitSbg(HIGH_END);
    const years8to12 = survivalCurve(fit, 12).slice(7);
    const anchors = [0.46, 0.436, 0.414, 0.395, 0.378];
    for (let i = 0; i < anchors.length; i++) {
      expect(Math.abs(years8to12[i] - anchors[i])).toBeLessThan(1e-2);
    }
  });

  it("reproduces the calibration data closely", () => {
    const fit = fitSbg(HIGH_END);
    const s = survivalCurve(fit, 7);
    for (let i = 0; i < 7; i++) expect(Math.abs(s[i] - HIGH_END[i])).toBeLessThan(0.02);
  });

  it("is decreasing and within (0, 1)", () => {
    const s = survivalCurve({ alpha: 0.7, beta: 3.8 }, 20);
    let prev = 1;
    for (const v of s) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });
});

describe("retentionCurve — 生存者バイアスによる漸増", () => {
  it("increases with tenure (individuals do not improve; the composition does)", () => {
    const r = retentionCurve({ alpha: 0.668, beta: 3.806 }, 10);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
    expect(r[0]).toBeCloseTo(3.806 / (0.668 + 3.806), 6);
  });

  it("is consistent with the survival curve: S(t) = S(t-1)·r(t)", () => {
    const p = { alpha: 0.7, beta: 1.2 };
    const s = survivalCurve(p, 8);
    const r = retentionCurve(p, 8);
    let cur = 1;
    for (let t = 0; t < 8; t++) {
      cur *= r[t];
      expect(s[t]).toBeCloseTo(cur, 12);
    }
  });
});

describe("churnProbabilities", () => {
  it("sums with the survivor mass to 1", () => {
    const p = { alpha: 0.668, beta: 3.806 };
    const n = 30;
    const churn = churnProbabilities(p, n);
    const sTail = survivalCurve(p, n)[n - 1];
    const total = churn.reduce((a, v) => a + v, 0) + sTail;
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("expectedTenure", () => {
  it("uses the closed form (α+β−1)/(α−1) for alpha > 1", () => {
    expect(expectedTenure({ alpha: 2, beta: 3 })).toBeCloseTo(4, 10);
  });

  it("throws for alpha <= 1 without a horizon (infinite mean)", () => {
    expect(() => expectedTenure({ alpha: 0.7, beta: 1.2 })).toThrow(RangeError);
  });

  it("truncated sum approaches the closed form as the horizon grows", () => {
    const p = { alpha: 2, beta: 3 };
    // 裾が t^(-α) で減衰するため打ち切り誤差は O(1/horizon)
    expect(Math.abs(expectedTenure(p, 500) - 4)).toBeLessThan(0.05);
  });
});

describe("discounted expected lifetime (DEL / DERL)", () => {
  const he = { alpha: 0.668, beta: 3.806 };

  it("DERL(d=0.1, n=7) reproduces the reference 7.530", () => {
    const v = discountedExpectedResidualLifetime(he, { discount: 0.1, survivedPeriods: 7 });
    expect(Math.abs(v - 7.53)).toBeLessThan(1e-2);
  });

  it("DEL closed form equals the truncated sum for a long horizon", () => {
    const closed = discountedExpectedLifetime(he, { discount: 0.1 });
    const truncated = discountedExpectedLifetime(he, { discount: 0.1, horizon: 300 });
    expect(closed).toBeCloseTo(truncated, 6);
  });

  it("DERL grows with survived periods (survivors are better risks)", () => {
    const d0 = discountedExpectedResidualLifetime(he, { discount: 0.1, survivedPeriods: 0 });
    const d7 = discountedExpectedResidualLifetime(he, { discount: 0.1, survivedPeriods: 7 });
    expect(d7).toBeGreaterThan(d0);
  });

  it("validates inputs", () => {
    expect(() => discountedExpectedLifetime(he, { discount: 0 })).toThrow(RangeError);
    expect(() => discountedExpectedResidualLifetime(he, { discount: 0.1, survivedPeriods: -1 })).toThrow(RangeError);
  });
});

describe("input validation", () => {
  it("rejects empty, out-of-range, and increasing series", () => {
    expect(() => fitSbg([])).toThrow(RangeError);
    expect(() => fitSbg([1.0])).toThrow(RangeError); // 先頭1.0のみ＝観測なし
    expect(() => fitSbg([0.8, 1.2])).toThrow(RangeError);
    expect(() => fitSbg([0.5, 0.7])).toThrow(RangeError); // 増加
    expect(() => fitSbg([0.5, 0])).toThrow(RangeError);
  });

  it("rejects non-positive parameters", () => {
    expect(() => survivalCurve({ alpha: 0, beta: 1 }, 5)).toThrow(RangeError);
    expect(() => retentionCurve({ alpha: 1, beta: -1 }, 5)).toThrow(RangeError);
    expect(() => churnProbabilities({ alpha: 1, beta: 1 }, 0)).toThrow(RangeError);
  });
});

describe("cohortLtv（CARD A2b 契約：割引率対応のコホートLTV）", () => {
  const he = { alpha: 0.668, beta: 3.806 };
  const opts = { discount: 0.1, revenuePerPeriod: 1000 };

  it("equals revenuePerPeriod × DEL (analytic consistency)", () => {
    const ltv = cohortLtv(he, opts);
    const del = discountedExpectedLifetime(he, { discount: 0.1 });
    expect(ltv).toBeCloseTo(1000 * del, 8);
  });

  it("closed form matches the truncated sum for a long horizon", () => {
    const closed = cohortLtv(he, opts);
    const truncated = cohortLtv(he, { ...opts, horizon: 300 });
    expect(closed).toBeCloseTo(truncated, 4);
  });

  it("decreases as the discount rate rises and scales linearly with revenue", () => {
    expect(cohortLtv(he, { discount: 0.2, revenuePerPeriod: 1000 })).toBeLessThan(cohortLtv(he, opts));
    expect(cohortLtv(he, { discount: 0.1, revenuePerPeriod: 2000 })).toBeCloseTo(2 * cohortLtv(he, opts), 8);
  });

  it("is deterministic: identical inputs give identical results (推定に乱数なし)", () => {
    const data = [0.869, 0.743, 0.653, 0.593];
    const a = fitSbg(data);
    const b = fitSbg(data);
    expect(a).toEqual(b);
    expect(cohortLtv(a, opts)).toBe(cohortLtv(b, opts));
  });

  it("validates revenuePerPeriod and discount", () => {
    expect(() => cohortLtv(he, { discount: 0.1, revenuePerPeriod: 0 })).toThrow(RangeError);
    expect(() => cohortLtv(he, { discount: 0, revenuePerPeriod: 100 })).toThrow(RangeError);
  });
});

describe("fitSbgMultiCohort — 参照値照合", () => {
  // Fader "Fitting the sBG Model to Multi-Cohort Data" の合成データ（参照実装のテスト値）
  const COHORTS = [
    [10000, 8000, 6480, 5307, 4391],
    [10000, 8000, 6480, 5307],
    [10000, 8000, 6480],
    [10000, 8000],
  ];

  it("reproduces alpha=3.80, beta=15.19", () => {
    const fit = fitSbgMultiCohort(COHORTS);
    expect(Math.abs(fit.alpha - 3.8)).toBeLessThan(0.05);
    expect(Math.abs(fit.beta - 15.19)).toBeLessThan(0.2);
  });

  it("is deterministic (同一入力→同一出力)", () => {
    expect(fitSbgMultiCohort(COHORTS)).toEqual(fitSbgMultiCohort(COHORTS));
  });

  it("single cohort agrees with fitSbg on the same data (rates)", () => {
    const counts = [10000, 8690, 7430, 6530];
    const multi = fitSbgMultiCohort([counts]);
    const rates = fitSbg(counts.slice(1).map((v) => v / counts[0]));
    // 尤度のスケール（人数 vs 率で1万倍）が違うため収束点は微差になる → 相対誤差で照合
    expect(Math.abs(multi.alpha - rates.alpha) / rates.alpha).toBeLessThan(1e-3);
    expect(Math.abs(multi.beta - rates.beta) / rates.beta).toBeLessThan(1e-3);
  });

  it("logLik matches logLikelihoodMultiCohort at the optimum", () => {
    const fit = fitSbgMultiCohort(COHORTS);
    expect(fit.logLik).toBeCloseTo(logLikelihoodMultiCohort(fit, COHORTS), 10);
  });

  it("validates inputs", () => {
    expect(() => fitSbgMultiCohort([])).toThrow(RangeError);
    expect(() => fitSbgMultiCohort([[100]])).toThrow(RangeError);       // 2点未満
    expect(() => fitSbgMultiCohort([[100, 120]])).toThrow(RangeError);  // 増加
    expect(() => fitSbgMultiCohort([[100, 0]])).toThrow(RangeError);    // 非正
  });
});

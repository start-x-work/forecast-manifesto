import { describe, it, expect, vi } from "vitest";
import {
  fitGammaGamma,
  expectedAvgValue,
  checkFrequencyMonetaryIndependence,
} from "../src/gammaGamma.js";
import type { Rfm } from "../src/rfm.js";
import { loadCdnowRfm } from "./helpers.js";

const rfm = loadCdnowRfm();

describe("fitGammaGamma — CDNOW reproduces the Hardie note", () => {
  const fit = fitGammaGamma(rfm, { warn: false });

  it("recovers p, q, gamma within 1e-2 of published values", () => {
    expect(fit.p).toBeCloseTo(6.25, 2);
    expect(fit.q).toBeCloseTo(3.74, 2);
    expect(fit.gamma).toBeCloseTo(15.44, 2);
  });

  it("reports the frequency/monetary correlation", () => {
    expect(Math.abs(fit.independence.correlation)).toBeLessThan(0.2);
  });
});

describe("expectedAvgValue", () => {
  const fit = fitGammaGamma(rfm, { warn: false });

  it("returns the population mean γp/(q-1) for customers with no repeat", () => {
    const popMean = (fit.gamma * fit.p) / (fit.q - 1);
    const zero: Rfm = { customerId: "z", frequency: 0, recency: 0, T: 30, monetary: 0 };
    expect(expectedAvgValue(zero, fit)).toBeCloseTo(popMean, 10);
  });

  it("shrinks the observed mean toward the population mean", () => {
    const popMean = (fit.gamma * fit.p) / (fit.q - 1);
    const highSpender: Rfm = { customerId: "h", frequency: 1, recency: 10, T: 30, monetary: popMean * 5 };
    const est = expectedAvgValue(highSpender, fit);
    // 観測は母平均より高いが、縮小されて母平均〜観測の間に収まる
    expect(est).toBeGreaterThan(popMean);
    expect(est).toBeLessThan(highSpender.monetary);
  });

  it("weights heavy buyers closer to their observed mean", () => {
    const popMean = (fit.gamma * fit.p) / (fit.q - 1);
    const light: Rfm = { customerId: "l", frequency: 1, recency: 10, T: 30, monetary: popMean * 3 };
    const heavy: Rfm = { customerId: "H", frequency: 20, recency: 10, T: 30, monetary: popMean * 3 };
    // 取引回数が多いほど観測平均への信頼が増す
    expect(expectedAvgValue(heavy, fit)).toBeGreaterThan(expectedAvgValue(light, fit));
  });
});

describe("independence check", () => {
  it("flags strongly correlated frequency/monetary and warns", () => {
    // frequency と monetary を強く相関させた合成データ
    const correlated: Rfm[] = Array.from({ length: 100 }, (_, i) => ({
      customerId: String(i),
      frequency: i + 1,
      recency: 10,
      T: 30,
      monetary: (i + 1) * 10, // frequency に完全連動
    }));
    const check = checkFrequencyMonetaryIndependence(correlated);
    expect(check.correlation).toBeGreaterThan(0.9);
    expect(check.independent).toBe(false);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fitGammaGamma(correlated);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("treats near-zero correlation as independent", () => {
    const check = checkFrequencyMonetaryIndependence([
      { customerId: "a", frequency: 1, recency: 5, T: 30, monetary: 50 },
      { customerId: "b", frequency: 5, recency: 5, T: 30, monetary: 50 },
      { customerId: "c", frequency: 1, recency: 5, T: 30, monetary: 50 },
      { customerId: "d", frequency: 5, recency: 5, T: 30, monetary: 50 },
    ]);
    expect(check.independent).toBe(true);
  });
});

describe("fitGammaGamma — boundaries", () => {
  it("throws when no customer has frequency >= 1 and monetary > 0", () => {
    const zeros: Rfm[] = [{ customerId: "z", frequency: 0, recency: 0, T: 30, monetary: 0 }];
    expect(() => fitGammaGamma(zeros)).toThrow(RangeError);
  });
});

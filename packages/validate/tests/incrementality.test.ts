import { describe, it, expect } from "vitest";
import {
  relativeLift,
  incrementalOutcome,
  iroas,
  meanDifferenceInterval,
  iroasWithInterval,
} from "../src/incrementality.js";

describe("incrementality arithmetic", () => {
  it("relativeLift is treated/control − 1", () => {
    expect(relativeLift(120, 100)).toBeCloseTo(0.2, 12);
    expect(relativeLift(100, 100)).toBe(0);
  });

  it("incrementalOutcome multiplies the mean gap by treated n", () => {
    expect(incrementalOutcome({ mean: 12, n: 50 }, { mean: 10, n: 50 })).toBe(100);
  });

  it("iroas is incremental revenue over incremental spend", () => {
    expect(iroas(250_000, 100_000)).toBeCloseTo(2.5, 12);
  });

  it("meanDifferenceInterval recovers a known SE and contains the estimate", () => {
    const treated = { mean: 12, n: 100, variance: 16 };
    const control = { mean: 10, n: 100, variance: 9 };
    const r = meanDifferenceInterval(treated, control);
    expect(r.estimate).toBe(2);
    expect(r.se).toBeCloseTo(Math.sqrt(16 / 100 + 9 / 100), 12);
    expect(r.ci[0]).toBeLessThan(2);
    expect(r.ci[1]).toBeGreaterThan(2);
    expect(r.ci[1] - r.ci[0]).toBeCloseTo(2 * 1.959964 * r.se, 8);
  });

  it("iroasWithInterval is a linear rescaling of the mean difference interval", () => {
    const treated = { mean: 12, n: 40, variance: 4 };
    const control = { mean: 10, n: 40, variance: 4 };
    const spend = 80;
    const diff = meanDifferenceInterval(treated, control);
    const r = iroasWithInterval(treated, control, spend);
    const scale = 40 / 80;
    expect(r.estimate).toBeCloseTo(diff.estimate * scale, 12);
    expect(r.ci[0]).toBeCloseTo(diff.ci[0] * scale, 12);
    expect(r.ci[1]).toBeCloseTo(diff.ci[1] * scale, 12);
  });

  it("rejects zero control / zero spend / missing variance", () => {
    expect(() => relativeLift(1, 0)).toThrow(RangeError);
    expect(() => iroas(1, 0)).toThrow(RangeError);
    expect(() => meanDifferenceInterval({ mean: 1, n: 10 }, { mean: 0, n: 10 })).toThrow(RangeError);
  });
});

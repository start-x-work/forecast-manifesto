import { describe, it, expect } from "vitest";
import { vanWestendorp, priceAdjustmentFromRelative } from "../src/psm.js";
import type { PsmResponse } from "../src/psm.js";

const sample: PsmResponse[] = [
  { tooCheap: 10, cheap: 20, expensive: 40, tooExpensive: 50 },
  { tooCheap: 15, cheap: 25, expensive: 45, tooExpensive: 55 },
  { tooCheap: 12, cheap: 22, expensive: 42, tooExpensive: 52 },
  { tooCheap: 8, cheap: 18, expensive: 38, tooExpensive: 48 },
  { tooCheap: 20, cheap: 30, expensive: 50, tooExpensive: 60 },
];

describe("vanWestendorp", () => {
  it("returns four interior points and drops non-monotone rows", () => {
    const withBad = [...sample, { tooCheap: 40, cheap: 10, expensive: 20, tooExpensive: 30 }];
    const r = vanWestendorp(withBad);
    expect(r.nValid).toBe(5);
    expect(r.nDropped).toBe(1);
    expect(r.pmc).toBeLessThanOrEqual(r.pme);
    expect(r.opp).toBeGreaterThanOrEqual(r.pmc);
    expect(r.opp).toBeLessThanOrEqual(r.pme);
    for (const p of [r.ipp, r.opp, r.pmc, r.pme]) {
      expect(p).toBeGreaterThanOrEqual(8);
      expect(p).toBeLessThanOrEqual(60);
    }
  });

  it("throws on empty / all-invalid input", () => {
    expect(() => vanWestendorp([])).toThrow(RangeError);
    expect(() =>
      vanWestendorp([{ tooCheap: 50, cheap: 40, expensive: 30, tooExpensive: 20 }]),
    ).toThrow(RangeError);
  });
});

describe("priceAdjustmentFromRelative", () => {
  it("is 1 at the reference price and inverse at elasticity 1", () => {
    expect(priceAdjustmentFromRelative(100, 100, 1.4)).toBe(1);
    expect(priceAdjustmentFromRelative(200, 100, 1)).toBeCloseTo(0.5, 12);
    expect(priceAdjustmentFromRelative(50, 100, 1)).toBeCloseTo(2, 12);
  });

  it("rejects non-positive prices", () => {
    expect(() => priceAdjustmentFromRelative(0, 10, 1)).toThrow(RangeError);
    expect(() => priceAdjustmentFromRelative(10, 10, -1)).toThrow(RangeError);
  });
});

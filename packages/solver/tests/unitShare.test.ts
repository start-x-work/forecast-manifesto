import { describe, it, expect } from "vitest";
import { unitShare, forecastRevenue } from "../src/unitShare.js";

describe("unitShare", () => {
  it("multiplies awareness × distribution × conceptShare × priceAdj", () => {
    expect(unitShare(0.8, 0.9, 0.3, 1.0)).toBeCloseTo(0.216, 12);
  });

  it("applies the price adjustment as a multiplier", () => {
    const base = unitShare(0.5, 0.5, 0.4, 1.0);
    const discounted = unitShare(0.5, 0.5, 0.4, 1.1);
    expect(discounted).toBeCloseTo(base * 1.1, 12);
  });

  it("throws when a rate is outside [0, 1]", () => {
    expect(() => unitShare(1.2, 0.5, 0.5, 1)).toThrow(RangeError);
    expect(() => unitShare(0.5, -0.1, 0.5, 1)).toThrow(RangeError);
    expect(() => unitShare(0.5, 0.5, 2, 1)).toThrow(RangeError);
  });

  it("throws on negative priceAdj", () => {
    expect(() => unitShare(0.5, 0.5, 0.5, -1)).toThrow(RangeError);
  });
});

describe("forecastRevenue", () => {
  it("computes marketSize × unitShare × unitPrice", () => {
    expect(forecastRevenue(1_000_000, 0.05, 300)).toBeCloseTo(15_000_000, 6);
  });

  it("throws on negative inputs", () => {
    expect(() => forecastRevenue(-1, 0.1, 100)).toThrow(RangeError);
    expect(() => forecastRevenue(100, -0.1, 100)).toThrow(RangeError);
    expect(() => forecastRevenue(100, 0.1, -100)).toThrow(RangeError);
  });
});

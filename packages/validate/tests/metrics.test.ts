import { describe, it, expect } from "vitest";
import { mae, rmse, mape } from "../src/metrics.js";

const pairs = [
  { predicted: 12, actual: 10 },
  { predicted: 8, actual: 10 },
  { predicted: 10, actual: 10 },
];

describe("mae / rmse / mape", () => {
  it("computes known values", () => {
    expect(mae(pairs)).toBeCloseTo(4 / 3, 10);
    expect(rmse(pairs)).toBeCloseTo(Math.sqrt(8 / 3), 10);
    expect(mape(pairs)).toBeCloseTo(((0.2 + 0.2 + 0) / 3) * 100, 10);
  });

  it("mape excludes actual = 0 pairs", () => {
    const withZero = [...pairs, { predicted: 5, actual: 0 }];
    expect(mape(withZero)).toBeCloseTo(mape(pairs), 10);
  });

  it("mape throws when all actuals are zero", () => {
    expect(() => mape([{ predicted: 1, actual: 0 }])).toThrow(RangeError);
  });

  it("all metrics throw on empty input", () => {
    expect(() => mae([])).toThrow(RangeError);
    expect(() => rmse([])).toThrow(RangeError);
    expect(() => mape([])).toThrow(RangeError);
  });

  it("is zero for a perfect prediction", () => {
    const perfect = [{ predicted: 3, actual: 3 }];
    expect(mae(perfect)).toBe(0);
    expect(rmse(perfect)).toBe(0);
    expect(mape(perfect)).toBe(0);
  });
});

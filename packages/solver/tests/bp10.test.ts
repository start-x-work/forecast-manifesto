import { describe, it, expect } from "vitest";
import { conceptShare } from "../src/bp10.js";

describe("conceptShare", () => {
  it("averages the target brand's per-respondent vote share", () => {
    // 2 回答者 × 3 ブランド。行合計 10。対象は列 0。
    const votes = [
      [5, 3, 2], // 対象 0.5
      [1, 6, 3], // 対象 0.1
    ];
    expect(conceptShare(votes)).toBeCloseTo(0.3, 12);
  });

  it("supports a non-zero target index", () => {
    const votes = [
      [5, 3, 2],
      [1, 6, 3],
    ];
    // 列 1: 3/10 と 6/10 → 平均 0.45
    expect(conceptShare(votes, 1)).toBeCloseTo(0.45, 12);
  });

  it("normalises per row so rows not summing to 10 still work", () => {
    const votes = [
      [2, 2], // 0.5
      [4, 4], // 0.5
    ];
    expect(conceptShare(votes)).toBeCloseTo(0.5, 12);
  });

  it("treats an all-zero (abstaining) respondent as share 0", () => {
    const votes = [
      [10, 0],
      [0, 0],
    ];
    // 1.0 と 0 → 平均 0.5
    expect(conceptShare(votes)).toBeCloseTo(0.5, 12);
  });

  it("returns a value in [0, 1]", () => {
    const votes = [
      [7, 2, 1],
      [3, 3, 4],
      [0, 5, 5],
    ];
    const s = conceptShare(votes);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("throws on empty input", () => {
    expect(() => conceptShare([])).toThrow(RangeError);
  });

  it("throws on a non-rectangular matrix", () => {
    expect(() => conceptShare([[1, 2, 3], [1, 2]])).toThrow(RangeError);
  });

  it("throws on out-of-range target index", () => {
    expect(() => conceptShare([[1, 2]], 5)).toThrow(RangeError);
  });

  it("throws on negative votes", () => {
    expect(() => conceptShare([[1, -2]])).toThrow(RangeError);
  });
});

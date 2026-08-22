import { describe, it, expect } from "vitest";
import { unitShare, fitIntentCalibration } from "../src/unitShare.js";

describe("unitShare — intentCalibration（後方互換）", () => {
  it("既定値（引数4つ）で従来の計算結果が不変", () => {
    expect(unitShare(0.6, 0.7, 0.5, 1.0)).toBeCloseTo(0.6 * 0.7 * 0.5 * 1.0, 12);
  });
  it("intentCalibration を渡すと乗算される", () => {
    expect(unitShare(0.6, 0.7, 0.5, 1.0, 0.8)).toBeCloseTo(0.6 * 0.7 * 0.5 * 1.0 * 0.8, 12);
  });
  it("負の intentCalibration は throw", () => {
    expect(() => unitShare(0.6, 0.7, 0.5, 1.0, -0.1)).toThrow();
  });
});

describe("fitIntentCalibration — 意向-行動ギャップの補正係数", () => {
  it("原点回帰で係数を返す（actual ≈ coef × concept）", () => {
    const coef = 0.7;
    const pairs = [0.1, 0.2, 0.3, 0.4].map((cs) => ({ conceptShare: cs, actualShare: coef * cs }));
    const r = fitIntentCalibration(pairs);
    expect(r.coefficient).toBeCloseTo(coef, 6);
    expect(r.n).toBe(4);
  });
  it("過大評価（実 < 意向）の標本で係数 < 1・note に意向-行動ギャップ", () => {
    const pairs = [
      { conceptShare: 0.2, actualShare: 0.12 },
      { conceptShare: 0.3, actualShare: 0.18 },
      { conceptShare: 0.5, actualShare: 0.30 },
    ];
    const r = fitIntentCalibration(pairs);
    expect(r.coefficient).toBeLessThan(1);
    expect(r.note).toMatch(/意向-行動ギャップ|過大評価/);
  });
  it("不正入力は throw", () => {
    expect(() => fitIntentCalibration([])).toThrow();
    expect(() => fitIntentCalibration([{ conceptShare: 0, actualShare: 0 }])).toThrow(); // 全て0
    expect(() => fitIntentCalibration([{ conceptShare: -1, actualShare: 0.1 }])).toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { splitCalibrationHoldout } from "../src/split.js";
import type { Transaction } from "@forecast-manifesto/clv";

function tx(customerId: string, iso: string, amount: number): Transaction {
  return { customerId, date: new Date(iso + "T00:00:00Z"), amount };
}

const SPLIT = new Date("1997-06-30T00:00:00Z");
const END = new Date("1997-12-30T00:00:00Z");

describe("splitCalibrationHoldout", () => {
  it("builds calibration RFM up to splitDate and holdout actuals after it", () => {
    const txns = [
      tx("A", "1997-01-01", 10),
      tx("A", "1997-03-01", 20), // 較正内の反復
      tx("A", "1997-08-01", 30), // 検証期間
      tx("A", "1997-09-01", 40), // 検証期間
    ];
    const { calibration, holdout } = splitCalibrationHoldout(txns, SPLIT, END);
    expect(calibration).toHaveLength(1);
    expect(calibration[0].frequency).toBe(1); // 較正内の反復1回
    expect(holdout).toHaveLength(1);
    expect(holdout[0].actualTransactions).toBe(2);
    expect(holdout[0].actualSpend).toBeCloseTo(70, 10);
    // holdoutT = 6/30 → 12/30 = 183 日 ≈ 26.14 週
    expect(holdout[0].holdoutT).toBeCloseTo(183 / 7, 6);
  });

  it("excludes customers whose first purchase is after splitDate", () => {
    const txns = [
      tx("A", "1997-01-01", 10),
      tx("B", "1997-08-01", 99), // 検証期間デビュー → 対象外
    ];
    const { calibration, holdout } = splitCalibrationHoldout(txns, SPLIT, END);
    expect(calibration.map((c) => c.customerId)).toEqual(["A"]);
    expect(holdout.map((h) => h.customerId)).toEqual(["A"]);
  });

  it("counts same-day holdout transactions as one occasion (toRfm と同一規約)", () => {
    const txns = [
      tx("A", "1997-01-01", 10),
      tx("A", "1997-08-01", 30),
      tx("A", "1997-08-01", 5), // 同日 → 1機会, 支出は合算
    ];
    const { holdout } = splitCalibrationHoldout(txns, SPLIT, END);
    expect(holdout[0].actualTransactions).toBe(1);
    expect(holdout[0].actualSpend).toBeCloseTo(35, 10);
  });

  it("reports zero actuals for calibration customers silent in the holdout", () => {
    const txns = [tx("A", "1997-01-01", 10)];
    const { holdout } = splitCalibrationHoldout(txns, SPLIT, END);
    expect(holdout[0].actualTransactions).toBe(0);
    expect(holdout[0].actualSpend).toBe(0);
  });

  it("ignores transactions after observationEnd", () => {
    const txns = [
      tx("A", "1997-01-01", 10),
      tx("A", "1998-06-01", 99), // 観測終了より後
    ];
    const { holdout } = splitCalibrationHoldout(txns, SPLIT, END);
    expect(holdout[0].actualTransactions).toBe(0);
  });

  it("throws when splitDate >= observationEnd", () => {
    expect(() => splitCalibrationHoldout([], END, SPLIT)).toThrow(RangeError);
  });
});

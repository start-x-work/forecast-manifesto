import { describe, it, expect } from "vitest";
import { toRfm } from "../src/rfm.js";
import type { Transaction } from "../src/rfm.js";

function tx(customerId: string, iso: string, amount: number): Transaction {
  return { customerId, date: new Date(iso + "T00:00:00Z"), amount };
}

describe("toRfm", () => {
  it("computes frequency, recency, T in weeks", () => {
    // 初回 01-01、+2週 01-15、+4週 01-29。観測終了 02-26（初回+8週）
    const txns = [
      tx("A", "1997-01-01", 10),
      tx("A", "1997-01-15", 20),
      tx("A", "1997-01-29", 30),
    ];
    const [r] = toRfm(txns, new Date("1997-02-26T00:00:00Z"));
    expect(r.frequency).toBe(2); // 反復2回
    expect(r.recency).toBeCloseTo(4, 6); // 初回→最終 = 4週
    expect(r.T).toBeCloseTo(8, 6); // 初回→観測終了 = 8週
    expect(r.monetary).toBeCloseTo(25, 6); // 反復2回の平均 (20+30)/2
  });

  it("merges same-day transactions into one purchase occasion", () => {
    const txns = [
      tx("A", "1997-01-01", 10),
      tx("A", "1997-01-15", 20),
      tx("A", "1997-01-15", 40), // 同日 → 1機会（金額は合算 60）
    ];
    const [r] = toRfm(txns, new Date("1997-02-01T00:00:00Z"));
    expect(r.frequency).toBe(1);
    expect(r.monetary).toBeCloseTo(60, 6);
  });

  it("assigns frequency 0 and monetary 0 to single-purchase customers", () => {
    const [r] = toRfm([tx("A", "1997-01-01", 10)], new Date("1997-02-01T00:00:00Z"));
    expect(r.frequency).toBe(0);
    expect(r.recency).toBe(0);
    expect(r.monetary).toBe(0);
  });

  it("excludes transactions after the observation end (calibration)", () => {
    const txns = [
      tx("A", "1997-01-01", 10),
      tx("A", "1997-01-15", 20),
      tx("A", "1997-03-01", 99), // 観測終了より後 → 無視
    ];
    const [r] = toRfm(txns, new Date("1997-02-01T00:00:00Z"));
    expect(r.frequency).toBe(1);
    expect(r.monetary).toBeCloseTo(20, 6);
  });

  it("supports a daily time unit", () => {
    const txns = [tx("A", "1997-01-01", 10), tx("A", "1997-01-08", 20)];
    const [r] = toRfm(txns, new Date("1997-01-15T00:00:00Z"), { timeUnitDays: 1 });
    expect(r.recency).toBeCloseTo(7, 6); // 7日
    expect(r.T).toBeCloseTo(14, 6);
  });

  it("returns customers sorted by id and handles multiple customers", () => {
    const txns = [tx("B", "1997-01-01", 5), tx("A", "1997-01-01", 5)];
    const rows = toRfm(txns, new Date("1997-02-01T00:00:00Z"));
    expect(rows.map((r) => r.customerId)).toEqual(["A", "B"]);
  });
});

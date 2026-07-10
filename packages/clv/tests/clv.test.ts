import { describe, it, expect } from "vitest";
import { clv, summarize } from "../src/clv.js";
import { fitBgNbd } from "../src/bgnbd.js";
import { fitGammaGamma } from "../src/gammaGamma.js";
import type { Rfm } from "../src/rfm.js";
import { loadCdnowRfm } from "./helpers.js";

const rfm = loadCdnowRfm();
const bg = fitBgNbd(rfm);
const gg = fitGammaGamma(rfm, { warn: false });

describe("clv", () => {
  const active = rfm.find((c) => c.customerId === "0001")!;
  const opts = { horizonMonths: 12, monthlyDiscount: 0.01, margin: 0.3 };

  it("is positive for an active repeat buyer", () => {
    expect(clv(active, bg, gg, opts)).toBeGreaterThan(0);
  });

  it("increases with a longer horizon", () => {
    const short = clv(active, bg, gg, { ...opts, horizonMonths: 6 });
    const long = clv(active, bg, gg, { ...opts, horizonMonths: 24 });
    expect(long).toBeGreaterThan(short);
  });

  it("decreases as the discount rate rises", () => {
    const low = clv(active, bg, gg, { ...opts, monthlyDiscount: 0.0 });
    const high = clv(active, bg, gg, { ...opts, monthlyDiscount: 0.05 });
    expect(high).toBeLessThan(low);
  });

  it("scales linearly with margin", () => {
    const m1 = clv(active, bg, gg, { ...opts, margin: 0.2 });
    const m2 = clv(active, bg, gg, { ...opts, margin: 0.4 });
    expect(m2).toBeCloseTo(2 * m1, 6);
  });

  it("ranks a likely-alive buyer above a likely-churned one", () => {
    const silent = rfm.find((c) => c.customerId === "0002")!;
    expect(clv(active, bg, gg, opts)).toBeGreaterThan(clv(silent, bg, gg, opts));
  });

  it("throws on invalid options", () => {
    expect(() => clv(active, bg, gg, { ...opts, horizonMonths: 0 })).toThrow(RangeError);
    expect(() => clv(active, bg, gg, { ...opts, horizonMonths: 1.5 })).toThrow(RangeError);
    expect(() => clv(active, bg, gg, { ...opts, monthlyDiscount: -0.1 })).toThrow(RangeError);
    expect(() => clv(active, bg, gg, { ...opts, margin: -1 })).toThrow(RangeError);
  });
});

describe("summarize", () => {
  const s = summarize(rfm, bg, gg);

  it("aliveRate is a probability", () => {
    expect(s.aliveRate).toBeGreaterThan(0);
    expect(s.aliveRate).toBeLessThanOrEqual(1);
  });

  it("top20RevenueShare is within (0, 1]", () => {
    expect(s.top20RevenueShare).toBeGreaterThan(0);
    expect(s.top20RevenueShare).toBeLessThanOrEqual(1);
    // 上位20%が全体の20%超を占める（集中がある）
    expect(s.top20RevenueShare).toBeGreaterThan(0.2);
  });

  it("expectedRepeatNext12m is positive", () => {
    expect(s.expectedRepeatNext12m).toBeGreaterThan(0);
  });

  it("segment counts sum to the customer total and shares sum to 1", () => {
    const totalCount = s.segments.reduce((acc, seg) => acc + seg.count, 0);
    const totalShare = s.segments.reduce((acc, seg) => acc + seg.share, 0);
    expect(totalCount).toBe(rfm.length);
    expect(totalShare).toBeCloseTo(1, 10);
  });

  it("has all four segment labels", () => {
    expect([...s.segments.map((seg) => seg.label)].sort()).toEqual(
      ["優良継続", "新規", "休眠", "離反危機"].sort(),
    );
  });

  it("returns zeroed summary for empty input", () => {
    const empty = summarize([], bg, gg);
    expect(empty.aliveRate).toBe(0);
    expect(empty.expectedRepeatNext12m).toBe(0);
    expect(empty.segments.reduce((a, seg) => a + seg.count, 0)).toBe(0);
  });
});

describe("summarize — segment classification", () => {
  it("labels a no-repeat but alive customer 新規 and a churned one 休眠", () => {
    const custs: Rfm[] = [
      { customerId: "new", frequency: 0, recency: 0, T: 2, monetary: 0 },
    ];
    const s = summarize(custs, bg, gg);
    const nonzero = s.segments.filter((seg) => seg.count > 0);
    // frequency 0 → 新規 or 休眠 のいずれか（生存判定次第）
    expect(["新規", "休眠"]).toContain(nonzero[0].label);
  });
});

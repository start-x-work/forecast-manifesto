import { describe, it, expect } from "vitest";
import { reachFromImpressions } from "../src/reach.js";
import { identifyK } from "../src/identify.js";
import { penetrationFromK } from "../src/nbd.js";

describe("reachFromImpressions — リーチ＆フリークエンシー", () => {
  it("averageFrequencyAll = impressions / population", () => {
    const r = reachFromImpressions({
      impressions: 3_000_000,
      population: 1_000_000,
      kPrior: { low: 0.5, high: 2 },
    });
    expect(r.averageFrequencyAll).toBeCloseTo(3, 12);
  });

  it("observedReach を与えると K を逆算し observedReach を再現する", () => {
    const impressions = 3_000_000;
    const population = 1_000_000;
    const observedReach = 0.62;
    const r = reachFromImpressions({ impressions, population, observedReach });
    expect(r.method).toBe("identified");
    expect(r.reach.point).toBeCloseTo(observedReach, 8);
    // 逆算 K が penetrationFromK で observedReach を復元する
    const { K } = identifyK(impressions / population, observedReach);
    expect(r.K).toBeCloseTo(K, 8);
    expect(penetrationFromK(3, r.K)).toBeCloseTo(observedReach, 8);
    // identified では区間は点に一致（K 不確実性は与えられていない）
    expect(r.reach.low).toBe(r.reach.point);
    expect(r.reach.high).toBe(r.reach.point);
  });

  it("frequencyAmongReached = averageFrequencyAll / reach（> 1）", () => {
    const r = reachFromImpressions({
      impressions: 3_000_000,
      population: 1_000_000,
      observedReach: 0.62,
    });
    expect(r.frequencyAmongReached).toBeCloseTo(3 / 0.62, 8);
    expect(r.frequencyAmongReached).toBeGreaterThan(1);
  });

  it("kPrior の両端で区間が決まり、reach は K に対して単調増加", () => {
    const base = { impressions: 3_000_000, population: 1_000_000 };
    const r = reachFromImpressions({ ...base, kPrior: { low: 0.5, high: 2 } });
    expect(r.method).toBe("prior");
    expect(r.reach.low).toBeLessThan(r.reach.point);
    expect(r.reach.point).toBeLessThan(r.reach.high);
    expect(r.reach.low).toBeCloseTo(penetrationFromK(3, 0.5), 12);
    expect(r.reach.high).toBeCloseTo(penetrationFromK(3, 2), 12);
  });

  it("kPrior が広いほど区間が広い", () => {
    const base = { impressions: 3_000_000, population: 1_000_000 };
    const narrow = reachFromImpressions({ ...base, kPrior: { low: 0.9, high: 1.1 } });
    const wide = reachFromImpressions({ ...base, kPrior: { low: 0.3, high: 3 } });
    const wN = narrow.reach.high - narrow.reach.low;
    const wW = wide.reach.high - wide.reach.low;
    expect(wW).toBeGreaterThan(wN);
  });

  it("impressions < population（M < 1）も正常に扱える", () => {
    const r = reachFromImpressions({
      impressions: 400_000,
      population: 1_000_000,
      kPrior: { low: 0.5, high: 2 },
    });
    expect(r.averageFrequencyAll).toBeCloseTo(0.4, 12);
    expect(r.reach.point).toBeGreaterThan(0);
    expect(r.reach.point).toBeLessThan(1);
  });

  it("不正入力は throw", () => {
    expect(() => reachFromImpressions({ impressions: 0, population: 1000, kPrior: { low: 1, high: 2 } })).toThrow();
    expect(() => reachFromImpressions({ impressions: -1, population: 1000, kPrior: { low: 1, high: 2 } })).toThrow();
    expect(() => reachFromImpressions({ impressions: 1000, population: 0, kPrior: { low: 1, high: 2 } })).toThrow();
    // observedReach も kPrior も無い
    expect(() => reachFromImpressions({ impressions: 3000, population: 1000 })).toThrow();
    // kPrior が不正（low >= high）
    expect(() => reachFromImpressions({ impressions: 3000, population: 1000, kPrior: { low: 2, high: 1 } })).toThrow();
    // observedReach が範囲外
    expect(() => reachFromImpressions({ impressions: 3000, population: 1000, observedReach: 1.2 })).toThrow();
    // observedReach が NBD 到達上限（1 - e^-M）超過 → identifyK が throw
    expect(() => reachFromImpressions({ impressions: 3_000_000, population: 1_000_000, observedReach: 0.99 })).toThrow();
  });
});

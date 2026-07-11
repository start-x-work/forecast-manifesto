import { describe, it, expect } from "vitest";
import { identifyKWithInterval } from "../src/interval.js";
import { penetrationFromK } from "../src/nbd.js";

describe("identifyKWithInterval", () => {
  const M = 1.4;
  const trueK = 0.75;
  const penetration = penetrationFromK(M, trueK);

  it("reproduces identical intervals for the same seed (2回実行一致)", () => {
    const a = identifyKWithInterval(M, penetration, { nCustomers: 2000, iterations: 50, seed: 42 });
    const b = identifyKWithInterval(M, penetration, { nCustomers: 2000, iterations: 50, seed: 42 });
    expect(a.ci).toEqual(b.ci);
    expect(a.samples).toEqual(b.samples);
    expect(a.skipped).toBe(b.skipped);
  });

  it("returns a CI that contains the point estimate", () => {
    const res = identifyKWithInterval(M, penetration, { nCustomers: 2000, iterations: 100, seed: 1 });
    expect(res.K).toBeCloseTo(trueK, 3);
    expect(res.ci[0]).toBeLessThanOrEqual(res.K);
    expect(res.ci[1]).toBeGreaterThanOrEqual(res.K);
    expect(res.ci[0]).toBeLessThan(res.ci[1]);
  });

  it("interval widens when the sample size shrinks (感度)", () => {
    const large = identifyKWithInterval(M, penetration, { nCustomers: 4000, iterations: 100, seed: 1 });
    const small = identifyKWithInterval(M, penetration, { nCustomers: 400, iterations: 100, seed: 1 });
    expect(small.ci[1] - small.ci[0]).toBeGreaterThan(large.ci[1] - large.ci[0]);
  });

  it("wider level produces a wider interval", () => {
    const narrow = identifyKWithInterval(M, penetration, { nCustomers: 1000, iterations: 100, seed: 1, level: 0.5 });
    const wide = identifyKWithInterval(M, penetration, { nCustomers: 1000, iterations: 100, seed: 1, level: 0.95 });
    expect(wide.ci[1] - wide.ci[0]).toBeGreaterThan(narrow.ci[1] - narrow.ci[0]);
  });

  it("omits samples when includeSamples=false", () => {
    const res = identifyKWithInterval(M, penetration, { nCustomers: 500, iterations: 20, seed: 1, includeSamples: false });
    expect(res.samples).toBeUndefined();
  });

  it("warns when iterations x nCustomers exceeds 1e7", () => {
    const res = identifyKWithInterval(M, penetration, { nCustomers: 5_000_001, iterations: 2, seed: 1 });
    expect(res.warning).toMatch(/1e7/);
  }, 120_000);

  it("throws on invalid options and unreachable penetration", () => {
    expect(() => identifyKWithInterval(M, penetration, { nCustomers: 1 })).toThrow(RangeError);
    expect(() => identifyKWithInterval(M, penetration, { nCustomers: 100, level: 1.5 })).toThrow(RangeError);
    expect(() => identifyKWithInterval(0.5, 0.9, { nCustomers: 100 })).toThrow(RangeError); // 解なし
  });

  it("works with opts omitted (nCustomers 既定 1000) and returns the interval contract", () => {
    const res = identifyKWithInterval(M, penetration);
    expect(res.iterations).toBe(200);
    expect(res.interval.level).toBe(0.9);
    expect(res.interval.low).toBeLessThanOrEqual(res.K);
    expect(res.interval.high).toBeGreaterThanOrEqual(res.K);
    // ci は後方互換フィールド：interval と同値
    expect(res.ci).toEqual([res.interval.low, res.interval.high]);
  });

  it("is reproducible with default opts (seed 既定 1)", () => {
    const a = identifyKWithInterval(M, penetration);
    const b = identifyKWithInterval(M, penetration, { seed: 1 });
    expect(a.interval).toEqual(b.interval);
  });

  it("default 200 iterations run in practical time", () => {
    const t0 = performance.now();
    identifyKWithInterval(M, penetration, { includeSamples: false });
    expect(performance.now() - t0).toBeLessThan(10_000);
  }, 30_000);
});

import { describe, it, expect } from "vitest";
import {
  createRng,
  sampleNormal,
  sampleGamma,
  samplePoisson,
  sampleBeta,
  sampleNbd,
  percentile,
} from "../src/rng.js";
import { zeroPurchaseProbability } from "../src/nbd.js";

describe("createRng", () => {
  it("is deterministic for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("differs across seeds and stays within [0, 1)", () => {
    const a = createRng(1);
    const b = createRng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      const x = a();
      const y = b();
      if (x === y) same++;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(same).toBeLessThan(5);
  });
});

describe("samplers — distribution moments (seeded)", () => {
  const N = 20000;

  it("sampleNormal has mean ~0 and variance ~1", () => {
    const rng = createRng(7);
    let s = 0, s2 = 0;
    for (let i = 0; i < N; i++) {
      const x = sampleNormal(rng);
      s += x;
      s2 += x * x;
    }
    expect(s / N).toBeCloseTo(0, 1);
    expect(s2 / N - (s / N) ** 2).toBeCloseTo(1, 1);
  });

  it("sampleGamma(shape, scale) has mean shape*scale (shape > 1 and shape < 1)", () => {
    for (const [shape, scale] of [[2, 3], [0.4, 5]] as const) {
      const rng = createRng(11);
      let s = 0;
      for (let i = 0; i < N; i++) s += sampleGamma(shape, scale, rng);
      expect(s / N).toBeCloseTo(shape * scale, 0);
    }
  });

  it("sampleGamma throws on invalid params", () => {
    const rng = createRng(1);
    expect(() => sampleGamma(0, 1, rng)).toThrow(RangeError);
    expect(() => sampleGamma(1, -1, rng)).toThrow(RangeError);
  });

  it("samplePoisson has mean ~lambda (small and large lambda)", () => {
    for (const lambda of [0.8, 45]) {
      const rng = createRng(13);
      let s = 0;
      for (let i = 0; i < N; i++) s += samplePoisson(lambda, rng);
      expect((s / N - lambda) / lambda).toBeLessThan(0.05);
    }
  });

  it("samplePoisson handles lambda = 0 and throws on negative", () => {
    const rng = createRng(1);
    expect(samplePoisson(0, rng)).toBe(0);
    expect(() => samplePoisson(-1, rng)).toThrow(RangeError);
  });

  it("sampleBeta stays in (0,1) with mean a/(a+b)", () => {
    const rng = createRng(17);
    let s = 0;
    for (let i = 0; i < N; i++) {
      const x = sampleBeta(2, 5, rng);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
      s += x;
    }
    expect(s / N).toBeCloseTo(2 / 7, 1);
  });

  it("sampleNbd matches NBD mean and zero-probability", () => {
    const M = 1.4, K = 0.7;
    const rng = createRng(23);
    let s = 0, zeros = 0;
    for (let i = 0; i < N; i++) {
      const r = sampleNbd(M, K, rng);
      s += r;
      if (r === 0) zeros++;
    }
    expect((s / N - M) / M).toBeLessThan(0.05);
    expect(zeros / N).toBeCloseTo(zeroPurchaseProbability(M, K), 1);
  });
});

describe("percentile", () => {
  it("interpolates linearly", () => {
    const arr = [0, 10, 20, 30, 40];
    expect(percentile(arr, 0)).toBe(0);
    expect(percentile(arr, 1)).toBe(40);
    expect(percentile(arr, 0.5)).toBe(20);
    expect(percentile(arr, 0.25)).toBe(10);
    expect(percentile(arr, 0.125)).toBe(5);
  });

  it("throws on empty input", () => {
    expect(() => percentile([], 0.5)).toThrow(RangeError);
  });
});

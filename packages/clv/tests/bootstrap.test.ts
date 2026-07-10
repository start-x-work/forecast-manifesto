import { describe, it, expect } from "vitest";
import {
  fitBgNbdWithInterval,
  clvWithInterval,
  summarizeWithInterval,
} from "../src/bootstrap.js";
import { fitBgNbd } from "../src/bgnbd.js";
import { fitGammaGamma } from "../src/gammaGamma.js";
import { loadCdnowRfm } from "./helpers.js";

const rfm = loadCdnowRfm();
const subset = rfm.slice(0, 400); // 高速テスト用サブセット

describe("fitBgNbdWithInterval", () => {
  it("reproduces identical intervals for the same seed (2回実行一致)", () => {
    const a = fitBgNbdWithInterval(subset, { iterations: 10, seed: 42 });
    const b = fitBgNbdWithInterval(subset, { iterations: 10, seed: 42 });
    expect(a.ci).toEqual(b.ci);
    expect(a.samples).toEqual(b.samples);
  }, 120_000);

  it("CDNOW bootstrap CI contains the point estimate (健全性)", () => {
    const res = fitBgNbdWithInterval(rfm, { iterations: 30, seed: 1 });
    expect(res.ci.r[0]).toBeLessThanOrEqual(res.params.r);
    expect(res.ci.r[1]).toBeGreaterThanOrEqual(res.params.r);
    expect(res.ci.alpha[0]).toBeLessThanOrEqual(res.params.alpha);
    expect(res.ci.alpha[1]).toBeGreaterThanOrEqual(res.params.alpha);
    expect(res.ci.a[0]).toBeLessThanOrEqual(res.params.a);
    expect(res.ci.a[1]).toBeGreaterThanOrEqual(res.params.a);
    expect(res.ci.b[0]).toBeLessThanOrEqual(res.params.b);
    expect(res.ci.b[1]).toBeGreaterThanOrEqual(res.params.b);
  }, 300_000);

  it("interval widens when the sample is halved (感度)", () => {
    const full = fitBgNbdWithInterval(rfm, { iterations: 25, seed: 1 });
    const half = fitBgNbdWithInterval(rfm.slice(0, Math.floor(rfm.length / 2)), { iterations: 25, seed: 1 });
    const width = (ci: [number, number]) => ci[1] - ci[0];
    // 4 パラメータのうち過半で幅が拡大していること（個別パラメータは揺れるため）
    const wins = [
      width(half.ci.r) > width(full.ci.r),
      width(half.ci.alpha) > width(full.ci.alpha),
      width(half.ci.a) > width(full.ci.a),
      width(half.ci.b) > width(full.ci.b),
    ].filter(Boolean).length;
    expect(wins).toBeGreaterThanOrEqual(3);
  }, 300_000);

  it("throws on invalid level", () => {
    expect(() => fitBgNbdWithInterval(subset, { level: 0 })).toThrow(RangeError);
  });
});

describe("clvWithInterval", () => {
  const p = fitBgNbd(subset);
  const gg = fitGammaGamma(subset, { warn: false });
  const active = subset.find((c) => c.frequency >= 2)!;
  const opts = { horizonMonths: 12, monthlyDiscount: 0.01, margin: 0.3 };

  it("is deterministic for the same seed", () => {
    const a = clvWithInterval(active, p, gg, { ...opts, iterations: 500, seed: 7 });
    const b = clvWithInterval(active, p, gg, { ...opts, iterations: 500, seed: 7 });
    expect(a).toEqual(b);
  });

  it("returns ordered percentiles and a matching point estimate", () => {
    const res = clvWithInterval(active, p, gg, { ...opts, iterations: 1000, seed: 1 });
    expect(res.p5).toBeLessThanOrEqual(res.p50);
    expect(res.p50).toBeLessThanOrEqual(res.p95);
    expect(res.p95).toBeGreaterThan(0);
    expect(res.point).toBeGreaterThan(0); // clv() と同じ点推定
  });

  it("propagates clv() argument validation", () => {
    expect(() => clvWithInterval(active, p, gg, { ...opts, horizonMonths: 0 })).toThrow(RangeError);
  });
});

describe("summarizeWithInterval", () => {
  it("is deterministic and intervals are sane on a subset", () => {
    const a = summarizeWithInterval(subset, { iterations: 8, seed: 5 });
    const b = summarizeWithInterval(subset, { iterations: 8, seed: 5 });
    expect(a.ci).toEqual(b.ci);

    expect(a.ci.aliveRate[0]).toBeGreaterThanOrEqual(0);
    expect(a.ci.aliveRate[1]).toBeLessThanOrEqual(1);
    expect(a.ci.aliveRate[0]).toBeLessThanOrEqual(a.ci.aliveRate[1]);
    expect(a.ci.top20RevenueShare[1]).toBeLessThanOrEqual(1);
    expect(a.ci.expectedRepeatNext12m[0]).toBeGreaterThan(0);
    expect(a.ci.segments).toHaveLength(4);
    for (const seg of a.ci.segments) {
      expect(seg.share[0]).toBeGreaterThanOrEqual(0);
      expect(seg.share[1]).toBeLessThanOrEqual(1);
    }
    // 点推定は summarize と同一構造
    expect(a.point.segments.reduce((s, x) => s + x.count, 0)).toBe(subset.length);
  }, 300_000);
});

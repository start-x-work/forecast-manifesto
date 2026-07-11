import { describe, it, expect } from "vitest";
import { fitBgNbd } from "@forecast-manifesto/clv";
import {
  splitCalibrationHoldout,
  conditionalExpectationByFrequency,
  trackingCumulative,
  mape,
} from "../src/index.js";
import { loadCdnowTransactions, CDNOW_SPLIT, CDNOW_END } from "./helpers.js";

const transactions = loadCdnowTransactions();
const { calibration, holdout } = splitCalibrationHoldout(transactions, CDNOW_SPLIT, CDNOW_END);
const params = fitBgNbd(calibration);

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    vx += (xs[i] - mx) ** 2;
    vy += (ys[i] - my) ** 2;
  }
  return cov / Math.sqrt(vx * vy);
}

describe("CDNOW calibration/holdout (39週/39週)", () => {
  it("splits into the full 2,357-customer cohort with a ~39-week holdout", () => {
    expect(calibration).toHaveLength(2357);
    expect(holdout).toHaveLength(2357);
    expect(holdout[0].holdoutT).toBeCloseTo(39, 0);
  });

  it("calibration fit matches the published BG/NBD parameters", () => {
    expect(params.r).toBeCloseTo(0.243, 2);
    expect(params.alpha).toBeCloseTo(4.414, 2);
    expect(params.a).toBeCloseTo(0.793, 2);
    expect(params.b).toBeCloseTo(2.426, 2);
  });
});

describe("conditionalExpectationByFrequency — DoD", () => {
  it("predicted vs actual correlate with r > 0.9 (lifetimes 相当, cap=7)", () => {
    const rows = conditionalExpectationByFrequency(calibration, holdout, params, { capFrequency: 7 });
    expect(rows).toHaveLength(8); // 0..7+
    const r = pearson(rows.map((x) => x.predicted), rows.map((x) => x.actual));
    expect(r).toBeGreaterThan(0.9);
    // 顧客数の合計はコホート全体
    expect(rows.reduce((s, x) => s + x.nCustomers, 0)).toBe(2357);
  });

  it("groups are sorted by frequency and means are non-negative", () => {
    const rows = conditionalExpectationByFrequency(calibration, holdout, params);
    for (let i = 1; i < rows.length; i++) expect(rows[i].frequency).toBeGreaterThan(rows[i - 1].frequency);
    for (const row of rows) {
      expect(row.predicted).toBeGreaterThanOrEqual(0);
      expect(row.actual).toBeGreaterThanOrEqual(0);
    }
  });

  it("throws when holdout is missing a calibration customer", () => {
    expect(() => conditionalExpectationByFrequency(calibration, holdout.slice(1), params)).toThrow(RangeError);
  });
});

describe("trackingCumulative — DoD (FHL 2005 Figure 3 方式)", () => {
  const track = trackingCumulative(calibration, transactions, params, {
    splitDate: CDNOW_SPLIT,
    observationEnd: CDNOW_END,
    bucket: "week",
  });

  it("covers 78 weeks with a marked calibration region", () => {
    expect(track).toHaveLength(78);
    expect(track.filter((r) => r.inCalibration).length).toBeGreaterThanOrEqual(38);
  });

  it("final cumulative error is within 5% (Fader-Hardie 再現)", () => {
    const last = track[track.length - 1];
    const relErr = Math.abs(last.predicted - last.actual) / last.actual;
    expect(relErr).toBeLessThan(0.05);
  });

  it("holdout-region weekly MAPE stays under 5%", () => {
    const holdoutRows = track.filter((r) => !r.inCalibration);
    expect(mape(holdoutRows)).toBeLessThan(5);
  });

  it("both series are monotonically non-decreasing", () => {
    for (let i = 1; i < track.length; i++) {
      expect(track[i].predicted).toBeGreaterThanOrEqual(track[i - 1].predicted);
      expect(track[i].actual).toBeGreaterThanOrEqual(track[i - 1].actual);
    }
  });

  it("supports monthly buckets", () => {
    const monthly = trackingCumulative(calibration, transactions, params, {
      splitDate: CDNOW_SPLIT,
      observationEnd: CDNOW_END,
      bucket: "month",
    });
    expect(monthly.length).toBeGreaterThanOrEqual(17);
    expect(monthly.length).toBeLessThanOrEqual(19);
    // 最終累積は週次と一致（バケットの切り方に依存しない）
    expect(monthly[monthly.length - 1].actual).toBe(track[track.length - 1].actual);
  });

  it("throws when splitDate >= observationEnd", () => {
    expect(() =>
      trackingCumulative(calibration, transactions, params, {
        splitDate: CDNOW_END,
        observationEnd: CDNOW_SPLIT,
        bucket: "week",
      }),
    ).toThrow(RangeError);
  });
});

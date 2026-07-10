import { describe, it, expect } from "vitest";
import {
  fitTruncatedNbd,
  truncatedNbdDistribution,
  expectedNextPeriodPurchases,
  topBuyersRevenueShare,
} from "../src/truncatedNbd.js";
import { nbdPmf, zeroPurchaseProbability } from "@forecast-manifesto/solver";

/** 既知の (M, K) から観測値 m・repeatRate を解析的に生成する。 */
function observables(M: number, K: number): { m: number; repeatRate: number } {
  const p0 = zeroPurchaseProbability(M, K);
  const m = M / (1 - p0);
  const repeatRate = 1 - nbdPmf(1, M, K) / (1 - p0);
  return { m, repeatRate };
}

describe("fitTruncatedNbd — round trip from known (M, K)", () => {
  const Ms = [0.05, 0.3, 0.9, 2.0, 5.0];
  const Ks = [0.1, 0.5, 1.0, 3.0, 20.0];

  for (const M of Ms) {
    for (const K of Ks) {
      it(`recovers M=${M}, K=${K}`, () => {
        const { m, repeatRate } = observables(M, K);
        const fit = fitTruncatedNbd(m, repeatRate);
        expect(Math.abs(fit.M - M) / M).toBeLessThan(1e-4);
        expect(Math.abs(fit.K - K) / K).toBeLessThan(1e-4);
        expect(fit.iterations).toBeGreaterThan(0);
        expect(fit.iterations).toBeLessThanOrEqual(200);
      });
    }
  }

  it("the recovered (M, K) reproduces the observables to high precision", () => {
    const { m, repeatRate } = observables(1.4, 0.75);
    const fit = fitTruncatedNbd(m, repeatRate);
    const back = observables(fit.M, fit.K);
    expect(back.m).toBeCloseTo(m, 8);
    expect(back.repeatRate).toBeCloseTo(repeatRate, 8);
  });
});

describe("fitTruncatedNbd — inconsistent and invalid inputs throw", () => {
  it("throws when m <= 1 (buyer mean cannot be at or below 1)", () => {
    expect(() => fitTruncatedNbd(1, 0.3)).toThrow(RangeError);
    expect(() => fitTruncatedNbd(0.8, 0.3)).toThrow(RangeError);
  });

  it("throws when repeatRate is outside (0, 1)", () => {
    expect(() => fitTruncatedNbd(2, 0)).toThrow(RangeError);
    expect(() => fitTruncatedNbd(2, 1)).toThrow(RangeError);
    expect(() => fitTruncatedNbd(2, -0.1)).toThrow(RangeError);
  });

  it("throws when m < 1 + repeatRate (repeaters buy at least twice)", () => {
    expect(() => fitTruncatedNbd(1.2, 0.5)).toThrow(RangeError);
    expect(() => fitTruncatedNbd(1.2, 0.5)).toThrow(/inconsistent/i);
  });

  it("throws when repeatRate exceeds the Poisson (K→∞) upper bound for the given m", () => {
    // m=3 のポアソン上限を実測して、それを僅かに超える値を要求する
    const { repeatRate: poissonMax } = (() => {
      // 大きな K でポアソン極限を近似
      const K = 1e6;
      // m=3 に対応する M を探す（round trip 用の逆関数を粗く）
      let lo = 1e-9, hi = 3;
      for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const val = mid / (1 - zeroPurchaseProbability(mid, K)) - 3;
        if (val < 0) lo = mid;
        else hi = mid;
      }
      const M = (lo + hi) / 2;
      return observables(M, K);
    })();
    expect(() => fitTruncatedNbd(3, Math.min(0.999, poissonMax + 0.005))).toThrow(RangeError);
  });

  it("throws when repeatRate is below the K→0 (log-series) lower bound for the given m", () => {
    // m=3 の下限（K=1e-6 での暗黙リピート率）より小さい値を要求する
    expect(() => fitTruncatedNbd(3, 0.4)).toThrow(RangeError); // 対数級数下限 ≈ 0.43 超
  });
});

describe("truncatedNbdDistribution", () => {
  it("sums to ~1 over a long horizon", () => {
    const dist = truncatedNbdDistribution(1.2, 0.6, 2000);
    const sum = dist.reduce((s, p) => s + p, 0);
    expect(sum).toBeGreaterThan(0.999999);
    expect(sum).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("equals nbdPmf(r)/(1-P0) elementwise", () => {
    const M = 0.9, K = 0.5;
    const denom = 1 - zeroPurchaseProbability(M, K);
    const dist = truncatedNbdDistribution(M, K, 10);
    for (let r = 1; r <= 10; r++) {
      expect(dist[r - 1]).toBeCloseTo(nbdPmf(r, M, K) / denom, 12);
    }
  });

  it("throws on invalid n", () => {
    expect(() => truncatedNbdDistribution(1, 1, 0)).toThrow(RangeError);
    expect(() => truncatedNbdDistribution(1, 1, 1.5)).toThrow(RangeError);
  });
});

describe("expectedNextPeriodPurchases（逓減）", () => {
  const M = 1.5, K = 0.8;

  it("regresses toward the mean: heavy buyers decline, r=0 rises toward M", () => {
    // ヘビーユーザー（r=10）の翌年期待は今年より小さい
    expect(expectedNextPeriodPurchases(10, M, K)).toBeLessThan(10);
    // 非購入者（r=0）の翌年期待は正（平均へ回帰）だが M 未満
    const e0 = expectedNextPeriodPurchases(0, M, K);
    expect(e0).toBeGreaterThan(0);
    expect(e0).toBeLessThan(M);
  });

  it("is increasing in r and the population average is preserved", () => {
    let prev = -1;
    for (let r = 0; r <= 20; r++) {
      const e = expectedNextPeriodPurchases(r, M, K);
      expect(e).toBeGreaterThan(prev);
      prev = e;
    }
    // E_r[E[next | r]] = M(K + E[r])/(M+K) = M(K+M)/(M+K) = M （全体平均は保存）
    let total = 0;
    for (let r = 0; r <= 2000; r++) total += nbdPmf(r, M, K) * expectedNextPeriodPurchases(r, M, K);
    expect(total).toBeCloseTo(M, 6);
  });

  it("throws on invalid r", () => {
    expect(() => expectedNextPeriodPurchases(-1, M, K)).toThrow(RangeError);
    expect(() => expectedNextPeriodPurchases(1.5, M, K)).toThrow(RangeError);
  });
});

describe("topBuyersRevenueShare", () => {
  it("top 20% of buyers hold more than 20% of purchases (heterogeneity)", () => {
    const share = topBuyersRevenueShare(1.4, 0.5);
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThanOrEqual(1);
  });

  it("is higher for smaller K (heavier concentration)", () => {
    const concentrated = topBuyersRevenueShare(1.4, 0.1);
    const homogeneous = topBuyersRevenueShare(1.4, 50);
    expect(concentrated).toBeGreaterThan(homogeneous);
  });

  it("topFraction = 1 returns the full revenue (share = 1)", () => {
    expect(topBuyersRevenueShare(1.4, 0.5, 1)).toBeCloseTo(1, 6);
  });

  it("throws on invalid topFraction", () => {
    expect(() => topBuyersRevenueShare(1, 1, 0)).toThrow(RangeError);
    expect(() => topBuyersRevenueShare(1, 1, 1.5)).toThrow(RangeError);
  });
});

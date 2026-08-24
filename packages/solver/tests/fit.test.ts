import { describe, it, expect } from "vitest";
import { fitNbdMLE } from "../src/fit.js";
import { identifyK } from "../src/identify.js";
import { nbdPmf, penetrationFromK } from "../src/nbd.js";

/** 既知 (M,K) から期待度数分布（人数 N・rMax まで）を生成する。 */
function syntheticCounts(M: number, K: number, N: number, rMax: number): number[] {
  const counts: number[] = [];
  for (let r = 0; r <= rMax; r++) counts.push(nbdPmf(r, M, K) * N);
  return counts;
}

function logLik(counts: number[], M: number, K: number): number {
  let ll = 0;
  for (let r = 0; r < counts.length; r++) {
    if (counts[r] > 0) ll += counts[r] * Math.log(nbdPmf(r, M, K));
  }
  return ll;
}

describe("fitNbdMLE — 全度数分布からの最尤推定", () => {
  it("既知パラメータを合成データから回復する（許容誤差内）", () => {
    const trueM = 1.4;
    const trueK = 0.75;
    const counts = syntheticCounts(trueM, trueK, 100000, 40);
    const { M, K, converged } = fitNbdMLE(counts);
    expect(converged).toBe(true);
    expect(M).toBeCloseTo(trueM, 2);
    expect(K).toBeCloseTo(trueK, 1);
  });

  it("同一データで fitNbdMLE の対数尤度が identifyK 由来パラメータ以上", () => {
    const trueM = 0.9;
    const trueK = 1.2;
    const counts = syntheticCounts(trueM, trueK, 50000, 30);
    const fit = fitNbdMLE(counts);

    // identifyK 由来の K（同じ M・浸透率マッチング）
    const N = counts.reduce((a, b) => a + b, 0);
    const M = counts.reduce((a, c, r) => a + r * c, 0) / N;
    const penetration = 1 - counts[0] / N;
    const { K: kMatch } = identifyK(M, penetration);

    const llFit = logLik(counts, fit.M, fit.K);
    const llMatch = logLik(counts, M, kMatch);
    expect(llFit).toBeGreaterThanOrEqual(llMatch - 1e-6);
  });

  it("converged: false を握り潰さない（反復不足なら false）", () => {
    const counts = syntheticCounts(1.0, 0.8, 10000, 25);
    const r = fitNbdMLE(counts, { maxIter: 2, tol: 1e-12 });
    expect(r.converged).toBe(false);
    expect(r.iterations).toBe(2);
  });

  it("不正入力は throw", () => {
    expect(() => fitNbdMLE([])).toThrow();
    expect(() => fitNbdMLE([1, -2, 3])).toThrow();
    expect(() => fitNbdMLE([0, 0, 0])).toThrow(); // 合計 0
    expect(() => fitNbdMLE([5])).toThrow();       // 全員 0 回購入 → 平均 0
  });
});

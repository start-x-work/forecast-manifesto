import { describe, it, expect } from "vitest";
import { chiSquareGof } from "../src/gof.js";
import { nbdPmf } from "@forecast-manifesto/solver";

/** 既知 (M,K) の NBD から期待度数（人数 N）を生成。 */
function nbdCounts(M: number, K: number, N: number, rMax: number): number[] {
  const counts: number[] = [];
  for (let r = 0; r <= rMax; r++) counts.push(Math.round(nbdPmf(r, M, K) * N));
  return counts;
}

describe("chiSquareGof — NBD 適合度検定", () => {
  it("NBD 由来の度数分布は fits: true", () => {
    const counts = nbdCounts(1.4, 0.75, 200000, 25);
    const r = chiSquareGof(counts, 1.4, 0.75);
    expect(r.df).toBeGreaterThan(0);
    expect(r.fits).toBe(true);
    expect(r.pValue).toBeGreaterThan(0.05);
  });

  it("明確な非NBD（一様分布）は fits: false", () => {
    // 0..9 回を均等に配分 → NBD の裾（単調減少）と大きく乖離
    const counts = new Array(10).fill(1000);
    const r = chiSquareGof(counts, 4.5, 2.0);
    expect(r.fits).toBe(false);
    expect(r.pValue).toBeLessThan(0.05);
    expect(r.note).toMatch(/sBG|Dirichlet/);
  });

  it("不正入力は throw", () => {
    expect(() => chiSquareGof([], 1, 1)).toThrow();
    expect(() => chiSquareGof([1, -1], 1, 1)).toThrow();
    expect(() => chiSquareGof([0, 0], 1, 1)).toThrow();
  });

  it("セル数不足では検定不能を返す（fits:true・note明示）", () => {
    const r = chiSquareGof([90, 10], 0.11, 5); // ビンが少なく df<1
    expect(r.df).toBeLessThan(1);
    expect(r.note).toMatch(/検定不能|不足/);
  });
});

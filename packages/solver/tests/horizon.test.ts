import { describe, it, expect } from "vitest";
import { scaleToHorizon, penetrationAtHorizon } from "../src/horizon.js";
import { penetrationFromK, nbdPmf } from "../src/nbd.js";

describe("scaleToHorizon — 期間換算（M 比例・K 不変）", () => {
  it("scaleToHorizon(M,K,1,4) は M*4, K を返す", () => {
    const { M, K } = scaleToHorizon(0.35, 0.75, 1, 4);
    expect(M).toBeCloseTo(0.35 * 4, 12);
    expect(K).toBe(0.75);
  });

  it("同一期間なら不変（t1 == t2）", () => {
    const { M, K } = scaleToHorizon(1.2, 0.9, 4, 4);
    expect(M).toBeCloseTo(1.2, 12);
    expect(K).toBe(0.9);
  });

  it("外挿倍率が大きいと warning を返す（t2/t1 > 12）", () => {
    const r = scaleToHorizon(0.1, 0.5, 4, 52); // 倍率 13
    expect(r.warning).toBeTruthy();
    const ok = scaleToHorizon(0.1, 0.5, 4, 40); // 倍率 10
    expect(ok.warning).toBeUndefined();
  });

  it("不正入力は throw", () => {
    expect(() => scaleToHorizon(0, 0.5, 1, 4)).toThrow();
    expect(() => scaleToHorizon(1, 0, 1, 4)).toThrow();
    expect(() => scaleToHorizon(1, 0.5, 0, 4)).toThrow();
    expect(() => scaleToHorizon(1, 0.5, 1, -4)).toThrow();
  });
});

describe("penetrationAtHorizon — 換算後の浸透率", () => {
  it("4週観測→52週の浸透率が既存関数と整合する", () => {
    const M4 = 0.2;
    const K = 0.6;
    const p52 = penetrationAtHorizon(M4, K, 4, 52);
    // 手計算: M52 = M4 * 13, penetrationFromK(M52, K)
    expect(p52).toBeCloseTo(penetrationFromK(M4 * 13, K), 12);
    // 浸透率は期間が伸びれば増える
    expect(p52).toBeGreaterThan(penetrationFromK(M4, K));
  });

  it("換算後 M で NBD の P_0 と整合（1 - P_0 = penetration）", () => {
    const p = penetrationAtHorizon(0.15, 0.8, 1, 12);
    const M12 = 0.15 * 12;
    expect(1 - nbdPmf(0, M12, 0.8)).toBeCloseTo(p, 12);
  });
});

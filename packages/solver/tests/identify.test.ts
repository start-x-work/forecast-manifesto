import { describe, it, expect } from "vitest";
import { identifyK } from "../src/identify.js";
import { penetrationFromK } from "../src/nbd.js";

describe("identifyK — research example (森岡毅・今西聖貴『確率思考の戦略論』)", () => {
  // リサーチ実例の平均購入回数 M = 1372 / 279812。
  const M = 1372 / 279812;

  // NOTE: 書籍/Excel ソルバーの「実測浸透率 → K」ペアは非公開資産のため、
  // ここでは同定器の正しさをラウンドトリップで検証する:
  //   既知の K から順方向で浸透率を出し、逆方向 identifyK でその K を復元できること。
  // 実際の研究データ（実測浸透率と Excel ソルバー結果）が手に入り次第、
  // 下の referenceK / 期待浸透率を差し替え、許容誤差 1e-3 で照合する。
  it("recovers K from penetration within 1e-3 (round trip)", () => {
    const referenceK = 0.75; // Excel ソルバー結果の代替値
    const penetration = penetrationFromK(M, referenceK);

    const { K, iterations } = identifyK(M, penetration);

    expect(K).toBeCloseTo(referenceK, 3);
    expect(iterations).toBeGreaterThan(0);
    expect(iterations).toBeLessThanOrEqual(200);
  });

  it("the identified K reproduces the observed penetration to high precision", () => {
    const referenceK = 0.75;
    const penetration = penetrationFromK(M, referenceK);
    const { K } = identifyK(M, penetration);
    expect(penetrationFromK(M, K)).toBeCloseTo(penetration, 9);
  });
});

describe("identifyK — round trip across a parameter grid", () => {
  const Ms = [0.005, 0.5, 1.4, 3.0, 12.0];
  const Ks = [0.05, 0.3, 0.75, 2.0, 8.0];

  for (const M of Ms) {
    for (const K of Ks) {
      it(`recovers K=${K} for M=${M}`, () => {
        const penetration = penetrationFromK(M, K);
        const result = identifyK(M, penetration);
        // 相対誤差で評価（K が桁で変わるため）
        expect(result.K).toBeGreaterThan(0);
        expect(Math.abs(result.K - K) / K).toBeLessThan(1e-4);
        expect(penetrationFromK(M, result.K)).toBeCloseTo(penetration, 9);
      });
    }
  }
});

describe("identifyK — boundaries and error conditions", () => {
  it("throws when penetration >= NBD maximum (1 - e^(-M))", () => {
    const M = 0.5;
    const maxPen = 1 - Math.exp(-M);
    expect(() => identifyK(M, maxPen)).toThrow(RangeError);
    expect(() => identifyK(M, maxPen + 0.01)).toThrow(RangeError);
    // ちょうど超える値は unreachable であることをメッセージで示す
    expect(() => identifyK(M, maxPen)).toThrow(/unreachable|maximum/i);
  });

  it("throws on penetration <= 0 or >= 1", () => {
    expect(() => identifyK(1, 0)).toThrow(RangeError);
    expect(() => identifyK(1, -0.1)).toThrow(RangeError);
    expect(() => identifyK(1, 1)).toThrow(RangeError);
    expect(() => identifyK(1, 1.2)).toThrow(RangeError);
  });

  it("throws on non-positive M", () => {
    expect(() => identifyK(0, 0.3)).toThrow(RangeError);
    expect(() => identifyK(-1, 0.3)).toThrow(RangeError);
  });

  it("handles penetration -> 0 (small penetration yields small K)", () => {
    const M = 1.0;
    const small = penetrationFromK(M, 1e-3);
    const { K } = identifyK(M, small);
    expect(K).toBeCloseTo(1e-3, 4);
  });

  it("handles large penetration approaching the NBD maximum", () => {
    const M = 4.0;
    const nearMax = penetrationFromK(M, 5000); // 大きな K → 上限近く
    const { K } = identifyK(M, nearMax);
    expect(penetrationFromK(M, K)).toBeCloseTo(nearMax, 8);
  });
});

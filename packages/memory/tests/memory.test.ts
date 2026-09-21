import { describe, it, expect } from "vitest";
import {
  shareOfMind,
  shareOfMindTable,
  cepCoverage,
  regenerationRate,
  mentalPhysicalGap,
} from "../src/memory.js";

describe("shareOfMind", () => {
  it("is brand / category and the table sums to 1", () => {
    expect(shareOfMind(30, 100)).toBeCloseTo(0.3, 12);
    const table = shareOfMindTable([
      { name: "A", mentions: 50 },
      { name: "B", mentions: 30 },
      { name: "C", mentions: 20 },
    ]);
    expect(table.map((r) => r.share).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(table[0].share).toBeCloseTo(0.5, 12);
  });

  it("rejects empty or inverted inputs", () => {
    expect(() => shareOfMind(2, 0)).toThrow(RangeError);
    expect(() => shareOfMind(5, 3)).toThrow(RangeError);
    expect(() => shareOfMindTable([])).toThrow(RangeError);
  });
});

describe("cepCoverage / regeneration / gap", () => {
  it("coverage is linked / total", () => {
    expect(
      cepCoverage([
        { cep: "朝食", linked: true },
        { cep: "贈り物", linked: false },
        { cep: "疲れ", linked: true },
        { cep: "節約", linked: false },
      ]),
    ).toBeCloseTo(0.5, 12);
  });

  it("regenerationRate is repeat / first", () => {
    expect(regenerationRate(40, 80)).toBeCloseTo(0.5, 12);
    expect(() => regenerationRate(9, 0)).toThrow(RangeError);
    expect(() => regenerationRate(5, 4)).toThrow(RangeError);
  });

  it("mentalPhysicalGap is the signed difference", () => {
    expect(mentalPhysicalGap(0.22, 0.18)).toBeCloseTo(0.04, 12);
    expect(mentalPhysicalGap(0.1, 0.2)).toBeCloseTo(-0.1, 12);
    expect(() => mentalPhysicalGap(1.2, 0.1)).toThrow(RangeError);
  });
});

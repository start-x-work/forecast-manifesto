import { describe, it, expect } from "vitest";
import { hyp2f1, logAddExp, lnBeta, nelderMead } from "../src/math.js";

describe("hyp2f1", () => {
  it("2F1(1,1;2;z) = -ln(1-z)/z", () => {
    for (const z of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(hyp2f1(1, 1, 2, z)).toBeCloseTo(-Math.log(1 - z) / z, 9);
    }
  });

  it("2F1(a,b;b;z) = (1-z)^(-a)", () => {
    for (const z of [0.2, 0.5, 0.8]) {
      expect(hyp2f1(3, 5, 5, z)).toBeCloseTo(Math.pow(1 - z, -3), 9);
    }
  });

  it("equals 1 at z = 0", () => {
    expect(hyp2f1(2, 3, 4, 0)).toBeCloseTo(1, 12);
  });

  it("throws when |z| >= 1", () => {
    expect(() => hyp2f1(1, 1, 2, 1)).toThrow(RangeError);
  });
});

describe("logAddExp", () => {
  it("computes log(exp(a)+exp(b)) without overflow", () => {
    expect(logAddExp(0, 0)).toBeCloseTo(Math.log(2), 12);
    expect(logAddExp(1000, 1000)).toBeCloseTo(1000 + Math.log(2), 9);
  });
  it("handles -Infinity as an identity", () => {
    expect(logAddExp(-Infinity, 5)).toBe(5);
    expect(logAddExp(5, -Infinity)).toBe(5);
  });
});

describe("lnBeta", () => {
  it("matches ln of the Beta integral for integer args", () => {
    // B(2,3) = 1!·2!/4! = 1/12
    expect(Math.exp(lnBeta(2, 3))).toBeCloseTo(1 / 12, 10);
  });
});

describe("nelderMead", () => {
  it("minimizes a shifted quadratic", () => {
    const f = (x: number[]) => (x[0] - 3) ** 2 + (x[1] + 1) ** 2 + 5;
    const res = nelderMead(f, [0, 0], { tolerance: 1e-12 });
    expect(res.x[0]).toBeCloseTo(3, 4);
    expect(res.x[1]).toBeCloseTo(-1, 4);
    expect(res.fx).toBeCloseTo(5, 6);
    expect(res.converged).toBe(true);
  });

  it("minimizes the Rosenbrock function near (1,1)", () => {
    const rosen = (x: number[]) => (1 - x[0]) ** 2 + 100 * (x[1] - x[0] ** 2) ** 2;
    const res = nelderMead(rosen, [-1, 1], { maxIterations: 2000, tolerance: 1e-14 });
    expect(res.x[0]).toBeCloseTo(1, 2);
    expect(res.x[1]).toBeCloseTo(1, 2);
  });
});

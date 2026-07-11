import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/index.js";

// CDNOW 取引フィクスチャ（validate パッケージと共有）
const CDNOW_CSV = fileURLToPath(
  new URL("../../validate/tests/fixtures/cdnow_transactions.csv", import.meta.url),
);

describe("run — usage / errors", () => {
  it("prints usage for help and no command", () => {
    expect(run([]).output).toMatch(/Usage:/);
    expect(run(["help"]).code).toBe(0);
  });

  it("fails with a clear message on unknown command", () => {
    const r = run(["nope"]);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/unknown command/);
  });

  it("propagates CSV errors with line numbers", () => {
    const dir = mkdtempSync(join(tmpdir(), "fmcli-"));
    const bad = join(dir, "bad.csv");
    writeFileSync(bad, "customerId,date,amount\nA,2026-01-01,10\nB,oops,5\n");
    const r = run(["analyze", bad, "--observation-end", "2026-06-30"]);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/line 3/);
  });
});

describe("run identify-k", () => {
  it("returns the point estimate", () => {
    // penetrationFromK(1.4, 0.75) = 0.5461
    const r = run(["identify-k", "--m", "1.4", "--penetration", "0.5461"]);
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/K = 0\.750/);
  });

  it("adds an interval with --n and supports --format json", () => {
    const r = run(["identify-k", "--m", "1.4", "--penetration", "0.5461", "--n", "1000", "--format", "json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.output);
    expect(parsed.K).toBeGreaterThan(0);
    expect(parsed.ci[0]).toBeLessThan(parsed.ci[1]);
  });

  it("errors when required options are missing", () => {
    const r = run(["identify-k", "--m", "1.4"]);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/--penetration/);
  });
});

describe("run analyze — CDNOW 完走", () => {
  it("produces a report-ready markdown output", () => {
    const r = run(["analyze", CDNOW_CSV, "--observation-end", "1997-09-30", "--top", "5"]);
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/# 顧客資産分析レポート/);
    expect(r.output).toMatch(/BG\/NBD: r=0\.24/); // CDNOW 公表値
    expect(r.output).toMatch(/\| セグメント \|/);
    expect(r.output).toMatch(/## 上位顧客 CLV/);
  }, 120_000);

  it("supports --format json", () => {
    const r = run(["analyze", CDNOW_CSV, "--observation-end", "1997-09-30", "--top", "3", "--format", "json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.output);
    expect(parsed.customers).toBe(2357);
    expect(parsed.topCustomers).toHaveLength(3);
    expect(parsed.params.bgnbd.r).toBeCloseTo(0.243, 2);
  }, 120_000);
});

describe("run dirichlet", () => {
  it("fits from a config JSON and prints the DJ note", () => {
    const dir = mkdtempSync(join(tmpdir(), "fmcli-"));
    const cfg = join(dir, "dirichlet.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        categoryPenetration: 0.56,
        categoryBuyRate: 2.6,
        brands: [
          { name: "Colgate DC", marketShare: 0.25, observedPenetration: 0.2 },
          { name: "Macleans", marketShare: 0.19, observedPenetration: 0.17 },
          { name: "Close Up", marketShare: 0.1, observedPenetration: 0.09 },
        ],
      }),
    );
    const r = run(["dirichlet", "--config", cfg]);
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/M=1\.456/);
    expect(r.output).toMatch(/ダブルジェパディ/);
  });
});

describe("run sbg", () => {
  it("fits a single cohort and prints the churn report", () => {
    const r = run(["sbg", "--retention", "0.869,0.743,0.653,0.593,0.551,0.517,0.491", "--revenue", "12000"]);
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/α=0\.668/);
    expect(r.output).toMatch(/β=3\.806/);
    expect(r.output).toMatch(/コホートLTV/);
    expect(r.output).toMatch(/生存者バイアス/);
  });

  it("fits multi-cohort counts from a file", () => {
    const dir = mkdtempSync(join(tmpdir(), "fmcli-"));
    const f = join(dir, "cohorts.csv");
    writeFileSync(f, "10000,8000,6480,5307,4391\n10000,8000,6480,5307\n10000,8000,6480\n10000,8000\n");
    const r = run(["sbg", "--cohorts-file", f, "--format", "json"]);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.output);
    expect(Math.abs(parsed.alpha - 3.8)).toBeLessThan(0.05);
    expect(Math.abs(parsed.beta - 15.19)).toBeLessThan(0.2);
  });

  it("errors without input and on bad numbers", () => {
    expect(run(["sbg"]).code).toBe(1);
    const r = run(["sbg", "--retention", "0.8,oops"]);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/comma-separated numbers/);
  });
});

describe("run validate — CDNOW 完走", () => {
  it("produces the calibration/holdout report", () => {
    const r = run(["validate", CDNOW_CSV, "--split-date", "1997-09-30", "--observation-end", "1998-06-30"]);
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/# 検証レポート/);
    expect(r.output).toMatch(/r=0\.24/);
    expect(r.output).toMatch(/相対誤差 4\./); // 最終累積誤差 ~4.1%
    expect(r.output).toMatch(/7\+/);
  }, 120_000);
});

describe("run dirichlet — 当てはまり診断", () => {
  it("adds the fit-check table when observedPenetration is present", () => {
    const dir = mkdtempSync(join(tmpdir(), "fmcli-"));
    const cfg = join(dir, "d.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        categoryPenetration: 0.56,
        categoryBuyRate: 2.6,
        brands: [
          { name: "A", marketShare: 0.25, observedPenetration: 0.2 },
          { name: "B", marketShare: 0.19, observedPenetration: 0.17 },
        ],
      }),
    );
    const r = run(["dirichlet", "--config", cfg]);
    expect(r.code).toBe(0);
    expect(r.output).toMatch(/当てはまり診断/);
    expect(r.output).toMatch(/平均乖離/);
  });
});

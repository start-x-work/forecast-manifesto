/**
 * CDNOW フィクスチャ生成スクリプト（リポジトリには含めない元データから派生）。
 *
 * Fader, Hardie & Lee (2005) の 1/10 系統サンプル（2,357 顧客）を用いる。
 * 元データ CDNOW_sample.txt の各行： origId sampleId date(YYYYMMDD) qty amount
 * キャリブレーションは 39 週（1997-01-01 〜 1997-09-30）。
 *
 * 同梱の canonical サマリ（lifetimes cdnow_customers_summary.csv, ID/frequency/recency/T）と
 * toRfm の出力（frequency/recency/T）を突き合わせて変換ロジックを検証し、
 * BG/NBD・Gamma-Gamma を推定して公表値と照合したうえで、
 * テスト用フィクスチャ tests/fixtures/cdnow_rfm.json を出力する。
 *
 *   npx tsx packages/clv/scripts/derive-cdnow.ts /workspace/CDNOW_sample.txt /workspace/cdnow_customers_summary.csv
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { toRfm, fitBgNbd, fitGammaGamma } from "../src/index.js";
import type { Transaction, Rfm } from "../src/index.js";

const samplePath = process.argv[2] ?? "/workspace/CDNOW_sample.txt";
const canonicalPath = process.argv[3] ?? "/workspace/cdnow_customers_summary.csv";

// --- 元データ読み込み（sampleId を顧客キーに） ---
const transactions: Transaction[] = [];
for (const line of readFileSync(samplePath, "utf8").split("\n")) {
  const p = line.trim().split(/\s+/);
  if (p.length < 5) continue;
  const sampleId = p[1];
  const ymd = p[2];
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  if (!y) continue;
  transactions.push({
    customerId: sampleId,
    date: new Date(Date.UTC(y, m - 1, d)),
    amount: Number(p[4]),
  });
}

const observationEnd = new Date(Date.UTC(1997, 8, 30)); // 1997-09-30
const rfm = toRfm(transactions, observationEnd, { timeUnitDays: 7 });
console.log(`rfm rows: ${rfm.length}`);

// --- canonical サマリと突き合わせ（frequency / recency / T） ---
const canonical = new Map<string, { f: number; r: number; T: number }>();
const canonLines = readFileSync(canonicalPath, "utf8").trim().split("\n");
for (let i = 1; i < canonLines.length; i++) {
  const [id, f, r, T] = canonLines[i].split(",");
  canonical.set(String(Number(id)), { f: Number(f), r: Number(r), T: Number(T) });
}

let maxFreqDiff = 0, maxRecDiff = 0, maxTDiff = 0, matched = 0;
for (const c of rfm) {
  const key = String(Number(c.customerId));
  const ref = canonical.get(key);
  if (!ref) continue;
  matched++;
  maxFreqDiff = Math.max(maxFreqDiff, Math.abs(c.frequency - ref.f));
  maxRecDiff = Math.max(maxRecDiff, Math.abs(c.recency - ref.r));
  maxTDiff = Math.max(maxTDiff, Math.abs(c.T - ref.T));
}
console.log(`matched vs canonical: ${matched}`);
console.log(`max |Δfrequency|=${maxFreqDiff}, max |Δrecency|=${maxRecDiff.toFixed(4)}, max |ΔT|=${maxTDiff.toFixed(4)}`);

// --- 推定 ---
const bg = fitBgNbd(rfm, { maxIterations: 3000, tolerance: 1e-13 });
console.log("\n=== BG/NBD ===");
console.log(`r=${bg.r.toFixed(4)} (0.243)  alpha=${bg.alpha.toFixed(4)} (4.414)  a=${bg.a.toFixed(4)} (0.793)  b=${bg.b.toFixed(4)} (2.426)  ll=${bg.logLik.toFixed(2)} (-9582.4)`);

const gg = fitGammaGamma(rfm, { warn: false });
console.log("\n=== Gamma-Gamma ===");
console.log(`p=${gg.p.toFixed(4)} (6.25)  q=${gg.q.toFixed(4)} (3.74)  gamma=${gg.gamma.toFixed(4)} (15.44)  corr=${gg.independence.correlation.toFixed(4)}`);

// --- フィクスチャ出力 ---
const fixtureDir = new URL("../tests/fixtures/", import.meta.url);
mkdirSync(fixtureDir, { recursive: true });
const rounded = rfm.map((c: Rfm) => ({
  customerId: c.customerId,
  frequency: c.frequency,
  recency: Math.round(c.recency * 1e6) / 1e6,
  T: Math.round(c.T * 1e6) / 1e6,
  monetary: Math.round(c.monetary * 1e4) / 1e4,
}));
writeFileSync(new URL("cdnow_rfm.json", fixtureDir), JSON.stringify(rounded) + "\n");
console.log(`\nfixture written: tests/fixtures/cdnow_rfm.json (${rounded.length} rows)`);

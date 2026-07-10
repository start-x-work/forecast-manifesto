/**
 * 「点ではなく、幅で語る」の実例。
 *
 * 同じ観測でも、母数が小さければ K の同定には幅がある。パラメトリック・
 * ブートストラップでその幅を可視化する（シード固定・再現可能）。
 *
 *   npm run build
 *   npm run example:interval
 */

import { identifyK, identifyKWithInterval, penetrationFromK } from "@forecast-manifesto/solver";
import { fitBgNbdWithInterval, clvWithInterval, fitBgNbd, fitGammaGamma } from "@forecast-manifesto/clv";
import type { Rfm } from "@forecast-manifesto/clv";
import { readFileSync } from "node:fs";

// --- 1) K 同定の幅：点推定 → 区間の3行 ---
const M = 1.4;
const penetration = penetrationFromK(M, 0.75);

const { K } = identifyK(M, penetration); // 点推定（従来どおり）
const withN = (n: number) =>
  identifyKWithInterval(M, penetration, { nCustomers: n, iterations: 200, seed: 1 });

console.log(`K 点推定 = ${K.toFixed(4)}`);
for (const n of [500, 2000, 10000]) {
  const r = withN(n);
  console.log(
    `  n=${String(n).padStart(5)} → 90%区間 [${r.ci[0].toFixed(3)}, ${r.ci[1].toFixed(3)}]（幅 ${(r.ci[1] - r.ci[0]).toFixed(3)}）`,
  );
}
console.log("  → 母数が増えるほど幅は狭まる。幅が広いうちは「点」で語らない。\n");

// --- 2) BG/NBD パラメータの幅（CDNOW サブセット・軽量デモ） ---
const rfm: Rfm[] = JSON.parse(
  readFileSync(new URL("../packages/clv/tests/fixtures/cdnow_rfm.json", import.meta.url), "utf8"),
).slice(0, 400);

const fit = fitBgNbdWithInterval(rfm, { iterations: 30, seed: 1 });
console.log(`BG/NBD（CDNOW 先頭400顧客, 30反復）:`);
for (const key of ["r", "alpha", "a", "b"] as const) {
  const point = fit.params[key];
  const [lo, hi] = fit.ci[key];
  console.log(`  ${key.padEnd(5)} = ${point.toFixed(3)}  90%区間 [${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
}

// --- 3) 個客 CLV の幅 ---
const p = fitBgNbd(rfm);
const gg = fitGammaGamma(rfm, { warn: false });
const active = rfm.find((c) => c.frequency >= 2)!;
const res = clvWithInterval(active, p, gg, {
  horizonMonths: 12,
  monthlyDiscount: 0.01,
  margin: 0.3,
  iterations: 2000,
  seed: 1,
});
console.log(`\n顧客 ${active.customerId} の12ヶ月CLV:`);
console.log(`  点推定 ${res.point.toFixed(1)} / p5 ${res.p5.toFixed(1)} / 中央値 ${res.p50.toFixed(1)} / p95 ${res.p95.toFixed(1)}`);
console.log("  → 分布は右に裾を引く。予算は点でなく p5〜p95 の幅で会話する。");

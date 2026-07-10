/**
 * 顧客資産の一連フロー：取引ログ → RFM → BG/NBD ＋ Gamma-Gamma → CLV ＋ 診断サマリ。
 *
 * 説明用に、決定論的な擬似乱数（seed 固定）で合成コホートを生成する。
 * 実務では自社の取引ログ（customerId, date, amount）を toRfm に渡す。
 *
 *   npm run build
 *   npm run example:clv
 */

import {
  toRfm,
  fitBgNbd,
  fitGammaGamma,
  clv,
  summarize,
  probAlive,
} from "@forecast-manifesto/clv";
import type { Transaction } from "@forecast-manifesto/clv";

// --- 決定論的 RNG（mulberry32） ---
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const DAY = 86400000;
const start = Date.UTC(2025, 0, 1);

// --- 合成コホート：500 顧客、52 週間の取引 ---
const transactions: Transaction[] = [];
for (let i = 0; i < 500; i++) {
  const customerId = `C${String(i).padStart(4, "0")}`;
  const firstWeek = Math.floor(rand() * 8); // 最初の8週内に初回購入
  const weeklyRate = 0.02 + rand() * 0.25; // 週あたり購入確率
  const churnWeek = 8 + Math.floor(rand() * 60); // 離反時期
  const avgSpend = 20 + rand() * 80;
  transactions.push({
    customerId,
    date: new Date(start + firstWeek * 7 * DAY),
    amount: avgSpend * (0.7 + rand() * 0.6),
  });
  for (let w = firstWeek + 1; w < 52 && w < churnWeek; w++) {
    if (rand() < weeklyRate) {
      transactions.push({
        customerId,
        date: new Date(start + w * 7 * DAY),
        amount: avgSpend * (0.7 + rand() * 0.6),
      });
    }
  }
}
console.log(`合成取引: ${transactions.length} 件 / 500 顧客`);

// --- RFM（39週でキャリブレーション） ---
const observationEnd = new Date(start + 39 * 7 * DAY);
const rfm = toRfm(transactions, observationEnd);

// --- 推定 ---
const bg = fitBgNbd(rfm);
console.log(`\nBG/NBD: r=${bg.r.toFixed(3)} α=${bg.alpha.toFixed(3)} a=${bg.a.toFixed(3)} b=${bg.b.toFixed(3)}`);
const gg = fitGammaGamma(rfm);
console.log(`Gamma-Gamma: p=${gg.p.toFixed(3)} q=${gg.q.toFixed(3)} γ=${gg.gamma.toFixed(3)} (corr=${gg.independence.correlation.toFixed(3)})`);

// --- 診断サマリ ---
const s = summarize(rfm, bg, gg);
console.log(`\n生存顧客比率: ${(s.aliveRate * 100).toFixed(1)}%`);
console.log(`上位20%売上集中度: ${(s.top20RevenueShare * 100).toFixed(1)}%`);
console.log(`今後12ヶ月の期待反復購買（総和）: ${s.expectedRepeatNext12m.toFixed(0)} 回`);
console.log("セグメント:");
for (const seg of s.segments) {
  console.log(`  ${seg.label.padEnd(5)} ${String(seg.count).padStart(4)} 人 (${(seg.share * 100).toFixed(1)}%)`);
}

// --- 個客 CLV（上位5名） ---
const opts = { horizonMonths: 12, monthlyDiscount: 0.01, margin: 0.3 };
const ranked = rfm
  .map((c) => ({ id: c.customerId, alive: probAlive(c, bg), clv: clv(c, bg, gg, opts) }))
  .sort((x, y) => y.clv - x.clv)
  .slice(0, 5);
console.log("\nCLV 上位5名（12ヶ月・月次割引1%・粗利30%）:");
for (const r of ranked) {
  console.log(`  ${r.id}  P(alive)=${r.alive.toFixed(2)}  CLV=${r.clv.toFixed(0)}`);
}

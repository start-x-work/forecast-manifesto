/**
 * 新商品の売上予測（BP-10 → ユニットシェア → 売上）。
 *
 * 販売実績のない新商品では、コールドスタート耐性と説明可能性のために数理モデルを使う。
 * BP-10 のコンセプトシェアに、認知率・配荷率・価格調整係数を掛けてユニットシェアを求め、
 * 市場規模と単価から売上を予測する。
 *
 *   npm run build
 *   npm run example:forecast
 */

import { conceptShare, unitShare, forecastRevenue } from "@forecast-manifesto/solver";

// 1) BP-10 調査：回答者 × ブランド の 10 票配分行列（列 0 が対象の新商品）
const bp10Votes = [
  [4, 3, 3],
  [6, 2, 2],
  [3, 4, 3],
  [5, 3, 2],
  [2, 5, 3],
];
const cs = conceptShare(bp10Votes);
console.log(`コンセプトシェア（BP-10）= ${(cs * 100).toFixed(1)}%`);

// 2) ユニットシェア = 認知 × 配荷 × コンセプトシェア × 価格調整
const awareness = 0.6; // 認知率
const distribution = 0.7; // 配荷率
const priceAdj = 1.0; // 基準価格（実係数は非公開資産）
const share = unitShare(awareness, distribution, cs, priceAdj);
console.log(`ユニットシェア = ${(share * 100).toFixed(2)}%`);
console.log(`  = 認知 ${awareness} × 配荷 ${distribution} × CS ${cs.toFixed(3)} × PriceAdj ${priceAdj}`);

// 3) 売上 = 市場規模 × ユニットシェア × 単価
const marketSize = 2_000_000; // 対象カテゴリの年間需要量（個）
const unitPrice = 480; // 単価（円）
const revenue = forecastRevenue(marketSize, share, unitPrice);
console.log(`\n予測売上 = ${revenue.toLocaleString("ja-JP")} 円 / 年`);
console.log(`  = 市場規模 ${marketSize.toLocaleString("ja-JP")} × シェア ${share.toFixed(4)} × 単価 ${unitPrice}`);

// 物理制約：予測がキャパシティ（スループット上限）を突き抜けていないか確認する
const annualCapacityUnits = 100_000; // 供給上限（個/年）
const forecastUnits = marketSize * share;
if (forecastUnits > annualCapacityUnits) {
  const discounted = forecastRevenue(
    annualCapacityUnits / share, // 供給律速でシェアが頭打ちになるケースの近似
    share,
    unitPrice,
  );
  console.log(
    `\n⚠ 予測数量 ${Math.round(forecastUnits).toLocaleString("ja-JP")} 個 が供給上限 ${annualCapacityUnits.toLocaleString("ja-JP")} 個 を超過。` +
      `\n  キャパシティ律速の売上上限 ≈ ${discounted.toLocaleString("ja-JP")} 円`,
  );
} else {
  console.log(
    `\n供給上限チェック: 予測 ${Math.round(forecastUnits).toLocaleString("ja-JP")} 個 ≤ 上限 ${annualCapacityUnits.toLocaleString("ja-JP")} 個 → OK`,
  );
}

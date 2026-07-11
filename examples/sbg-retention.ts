/**
 * 契約型（サブスク）の解約構造：Fader & Hardie (2007) の High End / Regular
 * 両セグメントで sBG を推定し、7年先まで外挿する。
 *
 *   npm run build
 *   npm run example:sbg
 */

import {
  fitSbg,
  survivalCurve,
  retentionCurve,
  discountedExpectedResidualLifetime,
} from "@forecast-manifesto/sbg";

const SEGMENTS = {
  "High End": [0.869, 0.743, 0.653, 0.593, 0.551, 0.517, 0.491],
  Regular: [0.631, 0.468, 0.382, 0.326, 0.289, 0.262, 0.241],
} as const;

for (const [name, data] of Object.entries(SEGMENTS)) {
  const fit = fitSbg(data);
  console.log(`## ${name}: α=${fit.alpha.toFixed(3)}, β=${fit.beta.toFixed(3)}`);
  const s = survivalCurve(fit, 12);
  console.log(
    `  実測(1-7年): ${data.map((v) => (v * 100).toFixed(1)).join(" ")}`,
  );
  console.log(
    `  外挿(8-12年): ${s.slice(7).map((v) => (v * 100).toFixed(1)).join(" ")}`,
  );
  const r = retentionCurve(fit, 8);
  console.log(
    `  期次リテンション: ${r.map((v) => (v * 100).toFixed(0) + "%").join(" → ")}（漸増＝生存者バイアス）`,
  );
  const derl = discountedExpectedResidualLifetime(fit, { discount: 0.1, survivedPeriods: 7 });
  console.log(`  7年生存者の残存期待（割引10%）: ${derl.toFixed(2)} 期分\n`);
}

console.log("→ 個人のリテンションは一定でも、コホートの更新率は上がって見える（docs/09）");

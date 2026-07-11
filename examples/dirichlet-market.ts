/**
 * デリシュレー NBD の実例：UK 歯磨き粉市場（GEC 1984 / R NBDdirichlet 同梱例）。
 * ダブルジェパディ表と SCR を出力する。
 *
 *   npm run build
 *   npm run example:dirichlet
 */

import {
  fitDirichlet,
  brandMetrics,
  doubleJeopardyTable,
  duplicationMatrix,
} from "@forecast-manifesto/dirichlet";

const model = fitDirichlet({
  categoryPenetration: 0.56, // カテゴリ浸透率（四半期）
  categoryBuyRate: 2.6, // カテゴリ購買者の平均購買回数
  brands: [
    { name: "Colgate DC", marketShare: 0.25, observedPenetration: 0.2 },
    { name: "Macleans", marketShare: 0.19, observedPenetration: 0.17 },
    { name: "Close Up", marketShare: 0.1, observedPenetration: 0.09 },
    { name: "Signal", marketShare: 0.1, observedPenetration: 0.08 },
    { name: "ultrabrite", marketShare: 0.09, observedPenetration: 0.08 },
    { name: "Gibbs SR", marketShare: 0.08, observedPenetration: 0.07 },
    { name: "Boots Priv. Label", marketShare: 0.03, observedPenetration: 0.03 },
    { name: "Sainsbury Priv. Lab.", marketShare: 0.02, observedPenetration: 0.02 },
  ],
});

console.log(`推定パラメータ: M=${model.M.toFixed(3)}  K=${model.K.toFixed(3)}  S=${model.S.toFixed(3)}`);
console.log("（R NBDdirichlet 公表値: M=1.456, K=0.78, S=1.55）\n");

console.log("## ダブルジェパディ表（シェア昇順）");
console.log("brand                 share   浸透率   購買頻度");
for (const r of doubleJeopardyTable(model)) {
  console.log(
    `${r.name.padEnd(21)} ${(r.share * 100).toFixed(0).padStart(4)}%   ${(r.penetration * 100).toFixed(1).padStart(5)}%   ${r.buyRate.toFixed(2)}`,
  );
}
console.log("→ シェアが小さいほど、浸透率も頻度も低い＝二重に苦しむ\n");

console.log("## SCR と 100% ロイヤル率");
console.log("brand                 SCR     sole-buyer");
for (const m of brandMetrics(model)) {
  console.log(
    `${m.name.padEnd(21)} ${(m.scr * 100).toFixed(1).padStart(5)}%   ${(m.soleBuyerRate * 100).toFixed(1).padStart(5)}%`,
  );
}
console.log("→ ロイヤルティ指標もシェアに従う（独立には動かない）\n");

console.log("## 購買重複（Colgate DC の重複率：他ブランド買い手のうち Colgate も買う割合）");
const D = duplicationMatrix(model);
const names = model.brands.map((b) => b.name);
for (let k = 1; k < names.length; k++) {
  console.log(`  ${names[k].padEnd(21)} ${(D[0][k] * 100).toFixed(1)}%`);
}
console.log("→ パートナーに依らずほぼ一定＝重複購買の法則");

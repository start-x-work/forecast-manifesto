/**
 * UK 歯磨き粉市場（1973 Q1, AGB パネル 5,240 人）。
 *
 * 出典：
 * - データ：Goodhardt, Ehrenberg & Chatfield (1984) §3 / R パッケージ
 *   `NBDdirichlet`（CRAN, Feiming Chen）同梱の例（man/dirichlet.Rd）
 * - 公表パラメータ（M=1.456, K=0.78, S=1.55）：man/print.dirichlet.Rd の
 *   実行例出力（外れ値除去なしのシェア加重平均に一致）
 * - 公表 buy テーブル（pur.brand / pur.cat）：R/summary.dirichlet.R の
 *   ソースコメント（外れ値除去ありの S≈1.30 での出力に一致）
 *
 * ※ CRAN v1.4 のコードと同梱ドキュメントの公表出力は S の外れ値除去の有無で
 *   食い違っている。本パッケージは既定で「公表パラメータ側」（除去なし）に合わせ、
 *   `sOutlierRemoval: true` で現行コード挙動を再現する。
 */

export const toothpaste = {
  categoryPenetration: 0.56,
  categoryBuyRate: 2.6,
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
};

/** print.dirichlet.Rd の公表出力（外れ値除去なし） */
export const publishedParams = { M: 1.456, K: 0.78, S: 1.55 };

/**
 * summary.dirichlet.R ソースコメントの公表出力（1 桁精度・外れ値除去あり）：
 *   pur.brand: ブランド購買者あたりの購買回数
 *   pur.cat  : ブランド購買者あたりのカテゴリ購買回数
 */
export const publishedBuyTable = {
  purBrand: [1.8, 1.8, 1.7, 1.7, 1.7, 1.7, 1.6, 1.6],
  purCat: [3.2, 3.2, 3.3, 3.3, 3.3, 3.3, 3.4, 3.4],
};

/**
 * @forecast-manifesto/dirichlet
 *
 * 多ブランド市場構造：デリシュレー NBD（Goodhardt-Ehrenberg-Chatfield 1984）。
 * A1（市場の NBD）の完成形——カテゴリ×ブランドの同時構造を記述し、
 * ダブルジェパディ・購買重複の法則をコードで検証可能にする。
 *
 * 公知のモデル構造・数式のみを実装。R `NBDdirichlet` と同一の推定手順
 * （数式からの独立再実装）で、歯磨き粉市場の公表出力を再現済み（tests/）。
 */

export { fitDirichlet, robustWeightedS } from "./fit.js";
export type { FitDirichletInput, DirichletBrandInput } from "./fit.js";

export {
  categoryPn,
  pZeroGivenN,
  pRGivenN,
  brandPenetration,
  categoryRateForBrandBuyers,
  soleBuyerRate,
} from "./model.js";
export type { DirichletModel } from "./model.js";

export { brandMetrics, duplicationMatrix, doubleJeopardyTable } from "./metrics.js";
export type { BrandMetricsRow, DoubleJeopardyRow } from "./metrics.js";

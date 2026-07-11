/**
 * @forecast-manifesto/solver
 *
 * 需要予測の数理モデル（NBD ＋ BP-10）を、編集可能な素材として公開するソルバー。
 * 森岡毅・今西聖貴『確率思考の戦略論』のメソッドに基づく実装（公知の数式・モデル構造のみ）。
 *
 * 公開するのは「計算方法」と「選定の考え方」まで。
 * 業界別ベンチマーク K 値・Price Adjustment の実係数・個社予測は非公開資産。
 * 詳細は docs/05-boundaries.md を参照。
 */

export { lnGamma, nbdPmf, zeroPurchaseProbability, penetrationFromK } from "./nbd.js";
export { identifyK } from "./identify.js";
export type { IdentifyKOptions, IdentifyKResult } from "./identify.js";
export {
  createRng,
  sampleNormal,
  sampleGamma,
  samplePoisson,
  sampleBeta,
  sampleNbd,
  percentile,
} from "./rng.js";
export { identifyKWithInterval } from "./interval.js";
export type {
  IdentifyKWithIntervalOptions,
  IdentifyKWithIntervalResult,
} from "./interval.js";
export { conceptShare } from "./bp10.js";
export { unitShare, forecastRevenue } from "./unitShare.js";

/**
 * @forecast-manifesto/clv
 *
 * 顧客生涯価値（CLV）の数理モデル。市場の NBD（@forecast-manifesto/solver）と
 * 同一の数学血統で、市場 → 顧客を貫通させる（スタック A2「顧客資産」）。
 *
 *   RFM 変換 → BG/NBD（頻度・生存）＋ Gamma-Gamma（金額）→ CLV（割引現在価値）
 *
 * 森岡（市場の NBD）→ Schmittlein/Fader（顧客の NBD）——同じ分布が市場と顧客を貫く。
 * 詳細は docs/05b-clv.md を参照。
 */

export { toRfm } from "./rfm.js";
export type { Rfm, Transaction, ToRfmOptions } from "./rfm.js";

export { fitBgNbd, probAlive, expectedTransactions, logLikelihood } from "./bgnbd.js";
export type { BgNbdParams, FitBgNbdResult, FitOptions } from "./bgnbd.js";

export {
  fitGammaGamma,
  expectedAvgValue,
  checkFrequencyMonetaryIndependence,
} from "./gammaGamma.js";
export type {
  GgParams,
  FitGammaGammaResult,
  FitGammaGammaOptions,
  IndependenceCheck,
} from "./gammaGamma.js";

export {
  fitTruncatedNbd,
  truncatedNbdDistribution,
  expectedNextPeriodPurchases,
  topBuyersRevenueShare,
} from "./truncatedNbd.js";
export type { FitTruncatedNbdOptions, FitTruncatedNbdResult } from "./truncatedNbd.js";

export { clv, summarize } from "./clv.js";
export type {
  ClvOptions,
  Summary,
  Segment,
  SegmentLabel,
  SummarizeOptions,
} from "./clv.js";

export {
  fitBgNbdWithInterval,
  clvWithInterval,
  summarizeWithInterval,
} from "./bootstrap.js";
export type {
  BootstrapOptions,
  FitBgNbdWithIntervalResult,
  ClvWithIntervalResult,
  SummaryWithIntervalResult,
} from "./bootstrap.js";

// 教材用 Pareto/NBD 参照実装（名前空間で分離）
export * as paretoNbd from "./paretoNbd.js";
export type { ParetoNbdParams } from "./paretoNbd.js";

// 数値ユーティリティ（再利用向け）
export { hyp2f1, lnBeta, logAddExp, nelderMead } from "./math.js";
export type { NelderMeadOptions, NelderMeadResult } from "./math.js";

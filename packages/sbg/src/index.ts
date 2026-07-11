/**
 * @forecast-manifesto/sbg
 *
 * 契約型（サブスク）CLV：shifted-beta-geometric（Fader & Hardie 2007）。
 * docs/05b の「スコープ外」を解除するモジュール（スタック A2b）。
 * 非契約型（いつでも買える）は @forecast-manifesto/clv（BG/NBD）を使う。
 */

export {
  fitSbg,
  churnProbabilities,
  survivalCurve,
  retentionCurve,
  logLikelihood,
  expectedTenure,
  discountedExpectedLifetime,
  discountedExpectedResidualLifetime,
  cohortLtv,
  fitSbgMultiCohort,
  logLikelihoodMultiCohort,
} from "./sbg.js";
export type { SbgParams, FitSbgResult, DelOptions, CohortLtvOptions } from "./sbg.js";

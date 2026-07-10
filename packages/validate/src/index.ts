/**
 * @forecast-manifesto/validate
 *
 * 「予測を当てるゲームにしない」の実証装置。較正／検証分割・頻度別の
 * 実測 vs 予測・累積トラッキング・誤差指標を提供する。
 * 既存の Rfm / Transaction 型（@forecast-manifesto/clv）をそのまま再利用する。
 */

export { splitCalibrationHoldout } from "./split.js";
export type { HoldoutActual, SplitResult } from "./split.js";

export { conditionalExpectationByFrequency, trackingCumulative } from "./expectation.js";
export type { FrequencyRow, FrequencyOptions, TrackingOptions, TrackingRow } from "./expectation.js";

export { mae, rmse, mape } from "./metrics.js";
export type { PredictionPair } from "./metrics.js";

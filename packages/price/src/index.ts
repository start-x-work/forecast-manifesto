/**
 * @forecast-manifesto/price
 *
 * 価格受容：Van Westendorp 交点と、相対価格から作る公開可能な価格調整乗数。
 * Branding-OS の「価格」軸は本モジュールの出口の言い換え（新規開発ではない）。
 */

export { vanWestendorp, priceAdjustmentFromRelative } from "./psm.js";
export type { PsmResponse, PsmResult } from "./psm.js";

/**
 * ユニットシェアと売上予測。
 *
 * ユニットシェア = 認知率 × 配荷率 × コンセプトシェア × 価格調整係数
 *
 *   awareness    認知率（0〜1）
 *   distribution 配荷率（0〜1）
 *   conceptShare コンセプト受容度（BP-10 由来, 0〜1）
 *   priceAdj     価格調整係数（Price Adjustment）。基準価格で 1.0。
 *                値引きで > 1、割高で < 1 の乗数（顧問デリバラブルの実係数は非公開）。
 */

function assertUnitInterval(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be within [0, 1], received ${value}`);
  }
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number, received ${value}`);
  }
}

/**
 * ユニットシェアを求める。
 *
 * @param awareness 認知率（0〜1）
 * @param distribution 配荷率（0〜1）
 * @param conceptShare コンセプトシェア（0〜1）
 * @param priceAdj 価格調整係数（>= 0, 基準 1.0）
 * @param intentCalibration 表明選好の補正係数（>= 0・既定 1.0 ＝無補正。fitIntentCalibration で推定）
 * @returns ユニットシェア
 * @throws {RangeError} 率が [0,1] 外、または priceAdj が負の場合
 */
export function unitShare(
  awareness: number,
  distribution: number,
  conceptShare: number,
  priceAdj: number,
  intentCalibration: number = 1.0,
): number {
  assertUnitInterval("awareness", awareness);
  assertUnitInterval("distribution", distribution);
  assertUnitInterval("conceptShare", conceptShare);
  assertNonNegative("priceAdj", priceAdj);
  assertNonNegative("intentCalibration", intentCalibration);
  return awareness * distribution * conceptShare * priceAdj * intentCalibration;
}

export interface IntentCalibrationResult {
  /** 補正係数：actualShare ≈ coefficient × conceptShare（原点回帰の最小二乗解） */
  coefficient: number;
  /** 当てはめに使ったペア数 */
  n: number;
  /** 意向-行動ギャップに関する補足 */
  note: string;
}

/**
 * ローンチ後の実シェアと事前コンセプトシェアから補正係数を推定する（意向-行動ギャップの補正）。
 *
 * 表明選好（購入意向の10点配分など）は実購買を系統的に過大評価しがちで、
 * この乖離の補正が新商品予測誤差を最も左右する。coefficient は原点を通る
 * 単回帰（最小二乗）で、unitShare の intentCalibration にそのまま渡せる。
 *
 * 注意：業界別の補正係数ベンチマークは非公開資産（docs/05-boundaries.md）。
 * 本 OSS には数値を同梱せず、当てはめの「方法」だけを公開する。
 *
 * @param pairs { conceptShare, actualShare } のペア（実績ペア）
 * @returns { coefficient, n, note }
 * @throws {RangeError} pairs が空、または conceptShare が全て 0 の場合
 */
export function fitIntentCalibration(
  pairs: { conceptShare: number; actualShare: number }[],
): IntentCalibrationResult {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new RangeError("pairs must be a non-empty array of { conceptShare, actualShare }");
  }
  let sxx = 0;
  let sxy = 0;
  for (const { conceptShare, actualShare } of pairs) {
    if (!Number.isFinite(conceptShare) || conceptShare < 0) {
      throw new RangeError(`conceptShare must be a non-negative finite number, received ${conceptShare}`);
    }
    if (!Number.isFinite(actualShare) || actualShare < 0) {
      throw new RangeError(`actualShare must be a non-negative finite number, received ${actualShare}`);
    }
    sxx += conceptShare * conceptShare;
    sxy += conceptShare * actualShare;
  }
  if (sxx === 0) {
    throw new RangeError("all conceptShare values are 0; cannot fit a calibration coefficient");
  }
  const coefficient = sxy / sxx; // 原点を通る最小二乗
  const note =
    coefficient < 1
      ? `係数 < 1：表明選好が実シェアを過大評価している（意向-行動ギャップ）。unitShare の intentCalibration に ${coefficient.toFixed(3)} を渡して補正する。`
      : `係数 ≥ 1：この標本では実シェアが事前コンセプトシェアを下回っていない。標本数・代表性を確認のこと（n=${pairs.length}）。`;
  return { coefficient, n: pairs.length, note };
}

/**
 * 売上を予測する。
 *
 *   売上 = 市場規模 × ユニットシェア × 単価
 *
 * @param marketSize 市場規模（対象カテゴリの総需要量など, >= 0）
 * @param unitShare ユニットシェア（>= 0）
 * @param unitPrice 単価（>= 0）
 * @returns 予測売上
 * @throws {RangeError} いずれかが負の場合
 */
export function forecastRevenue(
  marketSize: number,
  unitShare: number,
  unitPrice: number,
): number {
  assertNonNegative("marketSize", marketSize);
  assertNonNegative("unitShare", unitShare);
  assertNonNegative("unitPrice", unitPrice);
  return marketSize * unitShare * unitPrice;
}

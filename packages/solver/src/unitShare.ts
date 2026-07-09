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
 * @returns ユニットシェア
 * @throws {RangeError} 率が [0,1] 外、または priceAdj が負の場合
 */
export function unitShare(
  awareness: number,
  distribution: number,
  conceptShare: number,
  priceAdj: number,
): number {
  assertUnitInterval("awareness", awareness);
  assertUnitInterval("distribution", distribution);
  assertUnitInterval("conceptShare", conceptShare);
  assertNonNegative("priceAdj", priceAdj);
  return awareness * distribution * conceptShare * priceAdj;
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

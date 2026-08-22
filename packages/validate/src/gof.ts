/**
 * 適合度検定（Goodness-of-Fit）：観測度数分布が NBD に従うかを検定する。
 *
 * 「回す前の誠実」——NBD が当てはまらないカテゴリ（強い季節性・寡占・契約型）で
 * 黙って数値を返さない。観測度数と NBD 期待度数のカイ二乗検定で乖離を可視化し、
 * 不適合なら次の一手（sBG / Dirichlet 等）を note で示す。
 *
 * 期待度数 5 未満のセルは上位（裾）に併合する標準手順を用いる。
 * df = 有効セル数 - 1 - 推定パラメータ数(=2, M と K)。
 */

import { nbdPmf, lnGamma } from "@forecast-manifesto/solver";

export interface ChiSquareGofResult {
  /** カイ二乗統計量 */
  statistic: number;
  /** 自由度 */
  df: number;
  /** p 値（上側確率） */
  pValue: number;
  /** 有意水準 5% で当てはまると判断できるか */
  fits: boolean;
  /** 判定の補足・不適合時の次の一手 */
  note: string;
}

/** 正則化下側不完全ガンマ関数 P(a, x)。級数展開＋連分数の標準実装。 */
function regularizedLowerGamma(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  const gln = lnGamma(a);
  if (x < a + 1) {
    // 級数展開
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  // 連分数（Lentz 法）で上側 Q を求め、P = 1 - Q
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  const q = Math.exp(-x + a * Math.log(x) - gln) * h;
  return 1 - q;
}

/** カイ二乗分布の上側確率（生存関数）Q(x; k) = 1 - P(k/2, x/2)。 */
function chiSquareSf(x: number, k: number): number {
  if (k <= 0) return NaN;
  if (x <= 0) return 1;
  return 1 - regularizedLowerGamma(k / 2, x / 2);
}

/**
 * 観測度数分布 observed と NBD(M, K) のカイ二乗適合度検定。
 *
 * observed[r] は「r 回購入した人数」。最終セルは NBD の裾確率をまとめて期待度数に
 * 折り込むため、観測側は十分な範囲（実質サポートを覆う r）を渡すこと。
 *
 * @param observed 観測度数（index = 購入回数）。非負・合計 > 0。
 * @param M NBD 平均購入回数（> 0）
 * @param K NBD 形状パラメータ（> 0）
 * @returns 統計量・自由度・p 値・適合判定・note
 * @throws {RangeError} observed が空・負値・合計 0 の場合
 */
export function chiSquareGof(
  observed: number[],
  M: number,
  K: number,
): ChiSquareGofResult {
  if (!Array.isArray(observed) || observed.length === 0) {
    throw new RangeError("observed must be a non-empty array of frequency counts");
  }
  let N = 0;
  for (let r = 0; r < observed.length; r++) {
    const c = observed[r];
    if (!Number.isFinite(c) || c < 0) {
      throw new RangeError(`observed[${r}] must be a non-negative finite number, received ${c}`);
    }
    N += c;
  }
  if (N <= 0) throw new RangeError("observed must sum to a positive total");

  const L = observed.length;
  // 期待度数：r=0..L-2 は pmf、最終セルは裾（r >= L-1）をまとめる
  const expected: number[] = new Array(L);
  let head = 0;
  for (let r = 0; r < L - 1; r++) {
    const p = nbdPmf(r, M, K);
    expected[r] = N * p;
    head += p;
  }
  expected[L - 1] = N * Math.max(0, 1 - head); // 裾確率を最終セルへ

  // 期待度数 5 未満のセルを裾方向に併合
  const obsBin: number[] = [];
  const expBin: number[] = [];
  let oAcc = 0;
  let eAcc = 0;
  for (let r = 0; r < L; r++) {
    oAcc += observed[r];
    eAcc += expected[r];
    if (eAcc >= 5) {
      obsBin.push(oAcc);
      expBin.push(eAcc);
      oAcc = 0;
      eAcc = 0;
    }
  }
  // 端数（<5）が残ったら最後のビンに併合
  if (eAcc > 0) {
    if (expBin.length > 0) {
      obsBin[obsBin.length - 1] += oAcc;
      expBin[expBin.length - 1] += eAcc;
    } else {
      obsBin.push(oAcc);
      expBin.push(eAcc);
    }
  }

  const cells = expBin.length;
  const df = cells - 1 - 2; // M, K の2パラメータを推定

  let statistic = 0;
  for (let i = 0; i < cells; i++) {
    if (expBin[i] > 0) {
      const d = obsBin[i] - expBin[i];
      statistic += (d * d) / expBin[i];
    }
  }

  if (df < 1) {
    return {
      statistic,
      df,
      pValue: NaN,
      fits: true,
      note: `セル数が不足（有効セル ${cells}・df=${df}）のため検定不能。度数分布の範囲を広げるか、より多くの購入回数を観測してから再検定する。`,
    };
  }

  const pValue = chiSquareSf(statistic, df);
  const fits = pValue >= 0.05;
  const note = fits
    ? `p=${pValue.toFixed(3)} ≥ 0.05：NBD 構造と有意な乖離なし。予測に進んでよい。`
    : `p=${pValue.toFixed(3)} < 0.05：NBD が当てはまらない可能性。契約型（解約が観測できる）なら sBG、寡占・強ブランド構造なら Dirichlet の重複診断を先に確認する。強い季節性・普及過程があれば期間換算の外挿にも注意。`;
  return { statistic, df, pValue, fits, note };
}

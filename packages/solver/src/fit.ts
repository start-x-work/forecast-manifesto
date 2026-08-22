/**
 * 全度数分布からの NBD 最尤推定（MLE）。
 *
 * identifyK は「平均 M と浸透率」の2統計量だけを使うが、購入回数の度数分布
 * counts[r]（r 回購入した人数）が手元にある場合は、分布全体を使って
 * より高精度に (M, K) を推定できる。
 *
 * NBD では平均の最尤推定は標本平均に一致するため、M は標本平均に固定し、
 * K を1次元最適化（対数尤度の最大化）で求める。対数尤度は K について
 * 通常単峰なので、黄金分割探索（導関数不要・区間収縮が保証）で最大点を得る。
 *
 * 使い分け：
 *   - 要約統計しかない新商品調査 → identifyK（浸透率マッチング・コールドスタート耐性）
 *   - 度数分布がある既存商品     → fitNbdMLE（分布全体を使い高精度）
 * identifyK は非推奨にしない（本 OSS の価値であるコールドスタート耐性のため）。
 */

import { lnGamma } from "./nbd.js";

export interface FitNbdMLEOptions {
  /** K 探索の下限（既定 1e-4） */
  lower?: number;
  /** K 探索の上限（既定 1e6） */
  upper?: number;
  /** 収束判定：log K 区間幅がこの値未満で収束（既定 1e-8） */
  tol?: number;
  /** 最大反復回数（既定 200） */
  maxIter?: number;
}

export interface FitNbdMLEResult {
  /** 標本平均に一致する平均購入回数 */
  M: number;
  /** 最尤推定された形状パラメータ */
  K: number;
  /** 最大化された対数尤度 */
  logLik: number;
  /** 黄金分割探索の反復回数 */
  iterations: number;
  /** 収束したか（区間幅が tol 未満に到達したか） */
  converged: boolean;
}

/** 度数分布 counts と (M, K) に対する対数尤度 Σ_r counts[r]·ln P_r。 */
function logLikelihood(counts: number[], M: number, K: number): number {
  const lnP0Base = -K * Math.log1p(M / K); // ln P_0
  const lnTailBase = Math.log(M / (M + K)); // r 1 単位あたりの裾項
  const lnGammaK = lnGamma(K);
  let ll = 0;
  for (let r = 0; r < counts.length; r++) {
    const c = counts[r];
    if (c === 0) continue;
    const lnRatio = lnGamma(K + r) - lnGamma(r + 1) - lnGammaK;
    const lnPr = lnP0Base + lnRatio + (r === 0 ? 0 : r * lnTailBase);
    ll += c * lnPr;
  }
  return ll;
}

/**
 * 購入回数の度数分布 counts[r] から NBD パラメータを最尤推定する。
 *
 * @param counts counts[r] = r 回購入した人数（index が購入回数）。非負・合計 > 0。
 * @param opts 探索オプション
 * @returns 推定された { M, K, logLik, iterations, converged }
 * @throws {RangeError} counts が空・負値を含む・合計 0・平均 0（全員が非購入）の場合
 */
export function fitNbdMLE(
  counts: number[],
  opts: FitNbdMLEOptions = {},
): FitNbdMLEResult {
  if (!Array.isArray(counts) || counts.length === 0) {
    throw new RangeError("counts must be a non-empty array of frequency counts");
  }
  let N = 0;
  let weighted = 0;
  for (let r = 0; r < counts.length; r++) {
    const c = counts[r];
    if (!Number.isFinite(c) || c < 0) {
      throw new RangeError(`counts[${r}] must be a non-negative finite number, received ${c}`);
    }
    N += c;
    weighted += r * c;
  }
  if (N <= 0) {
    throw new RangeError("counts must sum to a positive total");
  }
  const M = weighted / N;
  if (M <= 0) {
    throw new RangeError(
      "sample mean is 0 (everyone made 0 purchases): NBD is not identifiable",
    );
  }

  const lower = opts.lower ?? 1e-4;
  const upper = opts.upper ?? 1e6;
  const tol = opts.tol ?? 1e-8;
  const maxIter = opts.maxIter ?? 200;
  if (!(lower > 0) || !(upper > lower)) {
    throw new RangeError(`invalid K search range: lower=${lower}, upper=${upper}`);
  }

  // log K 空間での黄金分割探索（対数尤度は K について通常単峰）
  const g = (logK: number): number => logLikelihood(counts, M, Math.exp(logK));
  const invphi = (Math.sqrt(5) - 1) / 2; // 1/φ ≈ 0.618
  let a = Math.log(lower);
  let b = Math.log(upper);
  let c = b - invphi * (b - a);
  let d = a + invphi * (b - a);
  let fc = g(c);
  let fd = g(d);
  let iterations = 0;
  let converged = false;
  for (let i = 1; i <= maxIter; i++) {
    iterations = i;
    if (fc < fd) {
      a = c;
      c = d;
      fc = fd;
      d = a + invphi * (b - a);
      fd = g(d);
    } else {
      b = d;
      d = c;
      fd = fc;
      c = b - invphi * (b - a);
      fc = g(c);
    }
    if (b - a < tol) {
      converged = true;
      break;
    }
  }
  const logK = 0.5 * (a + b);
  const K = Math.exp(logK);
  return { M, K, logLik: logLikelihood(counts, M, K), iterations, converged };
}

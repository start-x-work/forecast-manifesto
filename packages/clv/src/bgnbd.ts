/**
 * BG/NBD モデル（Fader, Hardie & Lee 2005,
 * "Counting Your Customers the Easy Way"）。
 *
 * 非契約型・離散購買の顧客について、購買頻度（ガンマ・ポアソン）と
 * 離反（ビート・幾何）を同時にモデル化する。パラメータ:
 *   r, α  … 個人購買率 λ の事前 Gamma(r, α)
 *   a, b  … 各購入後の離反確率 p の事前 Beta(a, b)
 *
 * 個票尤度（対数）は Beta/Gamma 関数で閉形式に書ける（超幾何関数は不要）。
 * 条件付き期待購買回数 E[Y(t)|·] にのみガウス超幾何 2F1 が現れる。
 */

import { lnGamma, logAddExp, hyp2f1, nelderMead } from "./math.js";
import type { Rfm } from "./rfm.js";

export interface BgNbdParams {
  r: number;
  alpha: number;
  a: number;
  b: number;
}

export interface FitBgNbdResult extends BgNbdParams {
  logLik: number;
}

export interface FitOptions {
  maxIterations?: number;
  tolerance?: number;
}

/** 個票の対数尤度（重みなし）。 */
function individualLogLik(p: BgNbdParams, x: number, tx: number, T: number): number {
  const { r, alpha, a, b } = p;
  const A1 = lnGamma(r + x) - lnGamma(r) + r * Math.log(alpha);
  const A2 = lnGamma(a + b) + lnGamma(b + x) - lnGamma(b) - lnGamma(a + b + x);
  const A3 = -(r + x) * Math.log(alpha + T);
  const A4 = x > 0 ? Math.log(a) - Math.log(b + x - 1) - (r + x) * Math.log(tx + alpha) : -Infinity;
  return A1 + A2 + logAddExp(A3, A4);
}

/** データ全体の対数尤度。 */
export function logLikelihood(p: BgNbdParams, rfm: Rfm[]): number {
  let ll = 0;
  for (const c of rfm) ll += individualLogLik(p, c.frequency, c.recency, c.T);
  return ll;
}

/**
 * BG/NBD を最尤推定する（Nelder-Mead）。
 *
 * 正値制約を満たすため対数空間で最適化する。文献標準の初期値 r=α=a=b=1、
 * 最大 500 反復。
 *
 * @param rfm 顧客別 RFM
 * @returns 推定パラメータ r, α, a, b と対数尤度
 * @throws {RangeError} rfm が空の場合
 */
export function fitBgNbd(rfm: Rfm[], opts: FitOptions = {}): FitBgNbdResult {
  if (rfm.length === 0) throw new RangeError("rfm must be non-empty");

  const n = rfm.length;
  // 平均負対数尤度を最小化（スケールのみの差でargminは不変、収束が安定）
  const negMeanLL = (logParams: number[]): number => {
    const p: BgNbdParams = {
      r: Math.exp(logParams[0]),
      alpha: Math.exp(logParams[1]),
      a: Math.exp(logParams[2]),
      b: Math.exp(logParams[3]),
    };
    let ll = 0;
    for (const c of rfm) ll += individualLogLik(p, c.frequency, c.recency, c.T);
    if (!Number.isFinite(ll)) return 1e12;
    return -ll / n;
  };

  const res = nelderMead(negMeanLL, [0, 0, 0, 0], {
    maxIterations: opts.maxIterations ?? 500,
    tolerance: opts.tolerance ?? 1e-10,
  });

  const params: BgNbdParams = {
    r: Math.exp(res.x[0]),
    alpha: Math.exp(res.x[1]),
    a: Math.exp(res.x[2]),
    b: Math.exp(res.x[3]),
  };
  return { ...params, logLik: logLikelihood(params, rfm) };
}

/**
 * 生存確率 P(alive | x, t_x, T)。
 * x=0（反復購入なし）の顧客は定義上 1。
 */
export function probAlive(c: Rfm, p: BgNbdParams): number {
  const { r, alpha, a, b } = p;
  const x = c.frequency;
  if (x === 0) return 1;
  const ratio = (a / (b + x - 1)) * Math.pow((alpha + c.T) / (alpha + c.recency), r + x);
  return 1 / (1 + ratio);
}

/**
 * 今後 t 期間（RFM と同じ時間単位）の条件付き期待購買回数
 * E[Y(t) | x, t_x, T]（FHL 2005）。
 */
export function expectedTransactions(t: number, c: Rfm, p: BgNbdParams): number {
  const { r, alpha, a, b } = p;
  const x = c.frequency;
  const tx = c.recency;
  const T = c.T;

  // 分子：(a+b+x-1)/(a-1) · [1 - ((α+T)/(α+T+t))^(r+x) · 2F1(r+x, b+x; a+b+x-1; t/(α+T+t))]
  const z = t / (alpha + T + t);
  const twoF1 = hyp2f1(r + x, b + x, a + b + x - 1, z);
  const term = 1 - Math.pow((alpha + T) / (alpha + T + t), r + x) * twoF1;
  const numerator = ((a + b + x - 1) / (a - 1)) * term;

  // 分母：1 + δ_{x>0} · (a/(b+x-1)) · ((α+T)/(α+t_x))^(r+x)
  const denom = x > 0 ? 1 + (a / (b + x - 1)) * Math.pow((alpha + T) / (alpha + tx), r + x) : 1;

  return numerator / denom;
}

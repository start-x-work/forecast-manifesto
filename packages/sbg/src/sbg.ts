/**
 * shifted-beta-geometric（sBG）モデル：契約型（サブスク）顧客の解約構造。
 *
 * Fader & Hardie (2007) "How to Project Customer Retention"
 * (Journal of Interactive Marketing 21(1)) のモデル。
 *
 *   顧客の解約確率 θ ~ Beta(α, β)（顧客ごとに異質）
 *   各期末に確率 θ で解約（幾何過程）
 *
 *   P(T = t)   = B(α+1, β+t−1) / B(α, β)          （t 期目に解約する確率）
 *   S(t)       = B(α, β+t) / B(α, β)               （t 期生存率）
 *   r(t)       = S(t)/S(t−1) = (β+t−1)/(α+β+t−1)  （期次リテンション：漸増）
 *
 * 非契約型（いつでも買える）は BG/NBD（@forecast-manifesto/clv）を使うこと。
 * 使い分けは docs/05b・docs/09 を参照。
 */

export interface SbgParams {
  alpha: number;
  beta: number;
}

export interface FitSbgResult extends SbgParams {
  logLik: number;
}

function assertParams(p: SbgParams): void {
  if (!(p.alpha > 0) || !(p.beta > 0)) {
    throw new RangeError(`alpha and beta must be > 0, received alpha=${p.alpha}, beta=${p.beta}`);
  }
}

/** P(T = t)（t = 1..n）を漸化式で返す。P(1) = α/(α+β)。 */
export function churnProbabilities(params: SbgParams, n: number): number[] {
  assertParams(params);
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`n must be a positive integer, received ${n}`);
  }
  const { alpha, beta } = params;
  const p: number[] = [alpha / (alpha + beta)];
  for (let t = 2; t <= n; t++) {
    p.push(((beta + t - 2) / (alpha + beta + t - 1)) * p[t - 2]);
  }
  return p;
}

/** 生存率 S(1..periods)。S(t) = Π_{i=1..t} (β+i−1)/(α+β+i−1)。 */
export function survivalCurve(params: SbgParams, periods: number): number[] {
  assertParams(params);
  if (!Number.isInteger(periods) || periods < 1) {
    throw new RangeError(`periods must be a positive integer, received ${periods}`);
  }
  const { alpha, beta } = params;
  const s: number[] = [];
  let cur = 1;
  for (let t = 1; t <= periods; t++) {
    cur *= (beta + t - 1) / (alpha + beta + t - 1);
    s.push(cur);
  }
  return s;
}

/**
 * 期次リテンション r(1..periods) = (β+t−1)/(α+β+t−1)。
 * t とともに単調に上がる——個人のリテンションが上がるのではなく、
 * 解約しやすい人から先に抜けるため（生存者バイアス。docs/09）。
 */
export function retentionCurve(params: SbgParams, periods: number): number[] {
  assertParams(params);
  if (!Number.isInteger(periods) || periods < 1) {
    throw new RangeError(`periods must be a positive integer, received ${periods}`);
  }
  const { alpha, beta } = params;
  const r: number[] = [];
  for (let t = 1; t <= periods; t++) {
    r.push((beta + t - 1) / (alpha + beta + t - 1));
  }
  return r;
}

/** 生存率系列の対数尤度（率ベース）。 */
export function logLikelihood(params: SbgParams, survival: number[]): number {
  assertParams(params);
  const s = normalizeSurvival(survival);
  const n = s.length;
  const p = churnProbabilities(params, n);
  const surv = survivalCurve(params, n);
  let ll = 0;
  let prev = 1;
  for (let t = 0; t < n; t++) {
    const churned = prev - s[t]; // t+1 期に解約した割合
    if (churned > 0) ll += churned * Math.log(p[t]);
    prev = s[t];
  }
  ll += s[n - 1] * Math.log(surv[n - 1]); // 観測終了まで生存した割合
  return ll;
}

/** 入力の残存率系列を検証し、先頭の 1.0 を取り除く。 */
function normalizeSurvival(survival: number[]): number[] {
  if (!Array.isArray(survival) || survival.length === 0) {
    throw new RangeError("survival series must be a non-empty array");
  }
  const s = survival[0] === 1 ? survival.slice(1) : survival.slice();
  if (s.length === 0) {
    throw new RangeError("survival series needs at least one post-start observation");
  }
  let prev = 1;
  for (const v of s) {
    if (!(v > 0) || !(v <= 1)) {
      throw new RangeError(`survival rates must be within (0, 1], received ${v}`);
    }
    if (v > prev + 1e-12) {
      throw new RangeError("survival series must be non-increasing");
    }
    prev = v;
  }
  return s;
}

/** 2 変数 Nelder-Mead（対数空間・privateユーティリティ）。 */
function maximize(f: (a: number, b: number) => number): { alpha: number; beta: number } {
  const g = (x: number[]): number => -f(Math.exp(x[0]), Math.exp(x[1]));
  let simplex = [
    [0, 0],
    [0.5, 0],
    [0, 0.5],
  ];
  let fv = simplex.map(g);
  for (let iter = 0; iter < 500; iter++) {
    const order = [0, 1, 2].sort((i, j) => fv[i] - fv[j]);
    const [best, mid, worst] = order;
    if (Math.abs(fv[worst] - fv[best]) < 1e-12) break;
    const cx = (simplex[best][0] + simplex[mid][0]) / 2;
    const cy = (simplex[best][1] + simplex[mid][1]) / 2;
    const rx = cx + (cx - simplex[worst][0]);
    const ry = cy + (cy - simplex[worst][1]);
    const fr = g([rx, ry]);
    if (fr < fv[best]) {
      const ex = cx + 2 * (rx - cx);
      const ey = cy + 2 * (ry - cy);
      const fe = g([ex, ey]);
      if (fe < fr) {
        simplex[worst] = [ex, ey];
        fv[worst] = fe;
      } else {
        simplex[worst] = [rx, ry];
        fv[worst] = fr;
      }
    } else if (fr < fv[mid]) {
      simplex[worst] = [rx, ry];
      fv[worst] = fr;
    } else {
      const kx = cx + 0.5 * (simplex[worst][0] - cx);
      const ky = cy + 0.5 * (simplex[worst][1] - cy);
      const fk = g([kx, ky]);
      if (fk < fv[worst]) {
        simplex[worst] = [kx, ky];
        fv[worst] = fk;
      } else {
        for (const i of [mid, worst]) {
          simplex[i] = [
            simplex[best][0] + 0.5 * (simplex[i][0] - simplex[best][0]),
            simplex[best][1] + 0.5 * (simplex[i][1] - simplex[best][1]),
          ];
          fv[i] = g(simplex[i]);
        }
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => fv[i] - fv[j]);
  return { alpha: Math.exp(simplex[order[0]][0]), beta: Math.exp(simplex[order[0]][1]) };
}

/**
 * sBG を最尤推定する。
 *
 * @param retention コホートの期次残存率（生存率）。先頭の 1.0 は省略可。
 *   例：[1.0, 0.869, 0.743, 0.653, …] または [0.869, 0.743, 0.653, …]
 * @returns { alpha, beta, logLik }
 * @throws {RangeError} 系列が空・(0,1] 外・増加している場合
 */
export function fitSbg(retention: number[]): FitSbgResult {
  const s = normalizeSurvival(retention);
  const { alpha, beta } = maximize((a, b) => logLikelihood({ alpha: a, beta: b }, s));
  return { alpha, beta, logLik: logLikelihood({ alpha, beta }, s) };
}

/**
 * 期待在籍期間 E[T]（期）。α > 1 なら閉形式 (α+β−1)/(α−1)。
 * horizon を与えると打ち切り和 Σ_{t=0}^{horizon−1} S(t)（S(0)=1）を返す。
 * α ≤ 1 では平均が発散するため horizon が必須。
 *
 * @throws {RangeError} α ≤ 1 かつ horizon 未指定の場合
 */
export function expectedTenure(params: SbgParams, horizon?: number): number {
  assertParams(params);
  if (horizon === undefined) {
    if (params.alpha <= 1) {
      throw new RangeError(
        `expected tenure is infinite for alpha <= 1 (alpha=${params.alpha}); pass a horizon to truncate`,
      );
    }
    return (params.alpha + params.beta - 1) / (params.alpha - 1);
  }
  if (!Number.isInteger(horizon) || horizon < 1) {
    throw new RangeError(`horizon must be a positive integer, received ${horizon}`);
  }
  const s = survivalCurve(params, horizon - 1);
  return 1 + s.reduce((acc, v) => acc + v, 0);
}

/** ガウス超幾何 2F1（|z|<1 の級数。private） */
function hyp2f1(a: number, b: number, c: number, z: number): number {
  let term = 1;
  let sum = 1;
  for (let k = 0; k < 100000; k++) {
    term *= ((a + k) * (b + k)) / ((c + k) * (1 + k)) * z;
    sum += term;
    if (Math.abs(term) < 1e-14 * Math.abs(sum)) break;
  }
  return sum;
}

export interface DelOptions {
  /** 期あたり割引率（例 0.1 = 10%/期） */
  discount: number;
  /** 打ち切り期間（省略時は無限和＝2F1 閉形式） */
  horizon?: number;
}

/**
 * DEL：新規獲得時点の割引期待在籍（1 期 1 の支払いを S(t) で重み付けした現在価値）。
 *
 *   DEL = Σ_{t≥0} S(t)/(1+d)^t = 2F1(1, β; α+β; 1/(1+d))
 *
 * horizon を与えると打ち切り和で計算する。
 */
export function discountedExpectedLifetime(params: SbgParams, opts: DelOptions): number {
  assertParams(params);
  if (!(opts.discount > 0)) {
    throw new RangeError(`discount must be > 0, received ${opts.discount}`);
  }
  const delta = 1 / (1 + opts.discount);
  if (opts.horizon === undefined) {
    return hyp2f1(1, params.beta, params.alpha + params.beta, delta);
  }
  if (!Number.isInteger(opts.horizon) || opts.horizon < 1) {
    throw new RangeError(`horizon must be a positive integer, received ${opts.horizon}`);
  }
  const s = survivalCurve(params, opts.horizon - 1);
  let del = 1;
  for (let t = 1; t < opts.horizon; t++) del += s[t - 1] * Math.pow(delta, t);
  return del;
}

export interface CohortLtvOptions extends DelOptions {
  /** 1 期あたりの顧客単価（売上 or 粗利。どちらを入れたかで LTV の意味が決まる） */
  revenuePerPeriod: number;
}

/**
 * コホート LTV：新規獲得顧客 1 人あたりの割引生涯価値。
 *
 *   cohortLtv = revenuePerPeriod × DEL
 *             = revenuePerPeriod × Σ_{t≥0} S(t)/(1+d)^t
 *
 * 支払いは各期の期首（獲得時 t=0 を含む）に発生する前提。horizon を与えると
 * 打ち切り、省略時は 2F1 閉形式の無限和。
 *
 * @throws {RangeError} revenuePerPeriod <= 0、または DEL 側の入力が不正な場合
 */
export function cohortLtv(params: SbgParams, opts: CohortLtvOptions): number {
  if (!(opts.revenuePerPeriod > 0)) {
    throw new RangeError(`revenuePerPeriod must be > 0, received ${opts.revenuePerPeriod}`);
  }
  return opts.revenuePerPeriod * discountedExpectedLifetime(params, opts);
}

/**
 * DERL：n 期生き残った既存顧客の、残りの割引期待在籍
 * （Fader & Hardie 2009 "Customer-Base Valuation in a Contractual Setting"）。
 *
 *   DERL(n) = r(n+1) · 2F1(1, β+n+1; α+β+n+1; 1/(1+d))
 */
export function discountedExpectedResidualLifetime(
  params: SbgParams,
  opts: { discount: number; survivedPeriods: number },
): number {
  assertParams(params);
  if (!(opts.discount > 0)) {
    throw new RangeError(`discount must be > 0, received ${opts.discount}`);
  }
  const n = opts.survivedPeriods;
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`survivedPeriods must be a non-negative integer, received ${n}`);
  }
  const { alpha, beta } = params;
  const delta = 1 / (1 + opts.discount);
  const retention = (beta + n) / (alpha + beta + n);
  return retention * hyp2f1(1, beta + n + 1, alpha + beta + n + 1, delta);
}

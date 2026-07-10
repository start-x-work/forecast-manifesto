/**
 * clv モジュール共通の数値ユーティリティ。
 *
 * lnGamma は solver 既存の Lanczos 実装を再利用する（@forecast-manifesto/solver）。
 * オーバーフロー回避のため、尤度・期待値はすべて対数空間で計算する。
 */

import { lnGamma } from "@forecast-manifesto/solver";

export { lnGamma };

/** ln B(a, b) = lnΓ(a) + lnΓ(b) − lnΓ(a+b) */
export function lnBeta(a: number, b: number): number {
  return lnGamma(a) + lnGamma(b) - lnGamma(a + b);
}

/** log(exp(a) + exp(b)) を桁あふれなく計算する。 */
export function logAddExp(a: number, b: number): number {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log1p(Math.exp(-Math.abs(a - b)));
}

/**
 * ガウス超幾何関数 2F1(a, b; c; z) を級数展開で計算する（|z| < 1）。
 *
 *   2F1(a,b;c;z) = Σ_{n≥0} (a)_n (b)_n / (c)_n · z^n / n!
 *
 * BG/NBD の条件付き期待購買回数 E[Y(t)|·] に現れる。引数は
 * z = t/(α+T+t) ∈ (0,1) で常に収束する。
 *
 * @throws {RangeError} |z| >= 1 で級数が収束しない場合
 */
export function hyp2f1(
  a: number,
  b: number,
  c: number,
  z: number,
  tolerance = 1e-14,
  maxTerms = 100000,
): number {
  if (Math.abs(z) >= 1) {
    throw new RangeError(`hyp2f1 series requires |z| < 1, received z=${z}`);
  }
  let term = 1; // n=0 の項
  let sum = 1;
  for (let n = 0; n < maxTerms; n++) {
    // term_{n+1} = term_n · (a+n)(b+n)/((c+n)(1+n)) · z
    term *= ((a + n) * (b + n)) / ((c + n) * (1 + n)) * z;
    sum += term;
    if (Math.abs(term) < tolerance * Math.abs(sum)) return sum;
  }
  return sum;
}

export interface NelderMeadOptions {
  /** 収束判定：単体の関数値の広がり（既定 1e-10） */
  tolerance?: number;
  /** 最大反復回数（既定 500） */
  maxIterations?: number;
  /** 初期単体の各次元のステップ（既定 0.05） */
  step?: number;
}

export interface NelderMeadResult {
  x: number[];
  fx: number;
  iterations: number;
  converged: boolean;
}

/**
 * Nelder-Mead 単体法（無制約最小化）。
 *
 * BG/NBD・Gamma-Gamma のパラメータは正値制約があるため、呼び出し側は
 * 対数空間（log-params）で最適化し、評価時に exp して正値へ戻す。
 */
export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  opts: NelderMeadOptions = {},
): NelderMeadResult {
  const tol = opts.tolerance ?? 1e-10;
  const maxIter = opts.maxIterations ?? 500;
  const step = opts.step ?? 0.05;

  const n = x0.length;
  const alpha = 1; // 反射
  const gamma = 2; // 拡大
  const rho = 0.5; // 収縮
  const sigma = 0.5; // 縮小

  // 初期単体（n+1 頂点）
  const simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const v = x0.slice();
    v[i] += step;
    simplex.push(v);
  }
  let fvals = simplex.map(f);

  let iterations = 0;
  const order = (): number[] =>
    fvals.map((_, i) => i).sort((i, j) => fvals[i] - fvals[j]);

  for (; iterations < maxIter; iterations++) {
    const idx = order();
    const best = idx[0];
    const worst = idx[n];
    const secondWorst = idx[n - 1];

    // 収束判定
    if (Math.abs(fvals[worst] - fvals[best]) <= tol) {
      return { x: simplex[best].slice(), fx: fvals[best], iterations, converged: true };
    }

    // 重心（worst を除く）
    const centroid = new Array(n).fill(0);
    for (let i = 0; i <= n; i++) {
      if (i === worst) continue;
      for (let d = 0; d < n; d++) centroid[d] += simplex[i][d] / n;
    }

    // 反射
    const reflect = centroid.map((c, d) => c + alpha * (c - simplex[worst][d]));
    const fReflect = f(reflect);

    if (fReflect < fvals[best]) {
      // 拡大
      const expand = centroid.map((c, d) => c + gamma * (reflect[d] - c));
      const fExpand = f(expand);
      if (fExpand < fReflect) {
        simplex[worst] = expand;
        fvals[worst] = fExpand;
      } else {
        simplex[worst] = reflect;
        fvals[worst] = fReflect;
      }
    } else if (fReflect < fvals[secondWorst]) {
      simplex[worst] = reflect;
      fvals[worst] = fReflect;
    } else {
      // 収縮
      const contract = centroid.map((c, d) => c + rho * (simplex[worst][d] - c));
      const fContract = f(contract);
      if (fContract < fvals[worst]) {
        simplex[worst] = contract;
        fvals[worst] = fContract;
      } else {
        // 縮小
        for (let i = 0; i <= n; i++) {
          if (i === best) continue;
          simplex[i] = simplex[i].map((v, d) => simplex[best][d] + sigma * (v - simplex[best][d]));
          fvals[i] = f(simplex[i]);
        }
      }
    }
  }

  const idx = order();
  return { x: simplex[idx[0]].slice(), fx: fvals[idx[0]], iterations, converged: false };
}

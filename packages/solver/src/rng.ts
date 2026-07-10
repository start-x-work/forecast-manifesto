/**
 * シード固定の乱数と分布サンプラ（依存ゼロ）。
 *
 * パラメトリック・ブートストラップ（identifyKWithInterval / clv の *WithInterval）で
 * 使う最小限のサンプラ群。フルベイズ（MCMC）はスコープ外で PyMC-Marketing に委譲する。
 * すべてシード固定で再現可能。
 */

/**
 * mulberry32：32bit シードの高速 PRNG。同一シードで同一系列を返す。
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 標準正規乱数（Box-Muller）。 */
export function sampleNormal(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng(); // log(0) 回避
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Gamma(shape, scale) 乱数。Marsaglia–Tsang 法（shape<1 はべき乗ブースト）。
 */
export function sampleGamma(shape: number, scale: number, rng: () => number): number {
  if (!(shape > 0) || !(scale > 0)) {
    throw new RangeError(`sampleGamma requires shape > 0 and scale > 0, received shape=${shape}, scale=${scale}`);
  }
  if (shape < 1) {
    // Gamma(k) = Gamma(k+1) · U^(1/k)
    const u = rng();
    return sampleGamma(shape + 1, scale, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v * scale;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

/**
 * Poisson(lambda) 乱数。λ が小さいうちは Knuth 法、大きい場合は正規近似。
 */
export function samplePoisson(lambda: number, rng: () => number): number {
  if (!(lambda >= 0)) {
    throw new RangeError(`samplePoisson requires lambda >= 0, received ${lambda}`);
  }
  if (lambda === 0) return 0;
  if (lambda > 30) {
    // 正規近似（連続性補正つき）。ブートストラップ用途では十分な精度。
    const n = Math.round(lambda + Math.sqrt(lambda) * sampleNormal(rng));
    return Math.max(0, n);
  }
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/** Beta(a, b) 乱数（2つのガンマの比）。 */
export function sampleBeta(a: number, b: number, rng: () => number): number {
  const x = sampleGamma(a, 1, rng);
  const y = sampleGamma(b, 1, rng);
  return x / (x + y);
}

/**
 * NBD(M, K) 乱数（ガンマ・ポアソン合成）：λ ~ Gamma(K, M/K), r ~ Poisson(λ)。
 */
export function sampleNbd(M: number, K: number, rng: () => number): number {
  const lambda = sampleGamma(K, M / K, rng);
  return samplePoisson(lambda, rng);
}

/** 配列のパーセンタイル（線形補間）。q ∈ [0,1]。 */
export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new RangeError("percentile requires a non-empty array");
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

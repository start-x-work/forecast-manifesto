/**
 * ゼロ切断 NBD 同定のパラメトリック・ブートストラップ区間。
 *
 * 手順：同定した (M̂, K̂) のゼロ切断分布 P(r | r≥1) から nCustomers 人の
 * 購入者を再生成（逆 CDF 法）→ m・repeatRate を再計測 → fitTruncatedNbd を
 * 再実行 ×iterations → (M, K) と派生量のパーセンタイル区間。
 *
 * Marketing-OS 顧客資産診断（第9弾）の p5–p95 幅表示に使う。
 * 点推定 API（fitTruncatedNbd）は不変（追加のみ）。
 */

import { createRng, percentile, nbdPmf, zeroPurchaseProbability } from "@forecast-manifesto/solver";
import { fitTruncatedNbd } from "./truncatedNbd.js";

export interface FitTruncatedNbdWithIntervalOptions {
  /** ブートストラップ反復数（既定 200） */
  iterations?: number;
  /** 乱数シード（既定 1） */
  seed?: number;
  /** 区間の信頼水準（既定 0.9 → [5%, 95%]） */
  level?: number;
  /**
   * 再生成する購入者数（既定 1000）。区間の幅は母数に依存するため、
   * 実データの購入者数が分かる場合は必ず渡すこと。
   */
  nCustomers?: number;
}

export interface FitTruncatedNbdWithIntervalResult {
  /** 点推定（fitTruncatedNbd と同一） */
  M: number;
  K: number;
  /** 実行したブートストラップ反復数 */
  iterations: number;
  /** (M, K) の区間 */
  interval: {
    level: number;
    M: { low: number; high: number };
    K: { low: number; high: number };
  };
  /**
   * 翌年期待購買回数（現顧客1人あたり）= M(K+m)/(M+K)。
   * point は点推定パラメータで、p5/p95 はブートストラップ分布の分位点。
   */
  nextYearPurchasesPerCustomer: { point: number; p5: number; p95: number };
  /** 再同定に失敗しスキップした反復数 */
  skipped: number;
  /** 計算量ガード警告（iterations×nCustomers > 1e7） */
  warning?: string;
}

/** ゼロ切断 NBD の逆 CDF テーブルを作る（累積 1−1e-12 まで、上限 1e5）。 */
function truncatedCdf(M: number, K: number): number[] {
  const denom = 1 - zeroPurchaseProbability(M, K);
  const cdf: number[] = [];
  let cum = 0;
  for (let r = 1; r <= 100000; r++) {
    cum += nbdPmf(r, M, K) / denom;
    cdf.push(cum);
    if (1 - cum < 1e-12 && r > 10) break;
  }
  return cdf;
}

/** 逆 CDF 法で r ≥ 1 を 1 つ引く（二分探索）。 */
function sampleTruncated(cdf: number[], rng: () => number): number {
  const u = rng();
  let lo = 0;
  let hi = cdf.length - 1;
  if (u >= cdf[hi]) return hi + 1; // 裾の丸め：最終値に割り当て
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < u) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1; // index 0 ↔ r = 1
}

/**
 * ゼロ切断 NBD を同定し、(M, K) と翌年期待購買回数にブートストラップ区間を
 * 付与する。同一入力＋同一 seed で結果は完全に再現される。
 *
 * @throws {RangeError} fitTruncatedNbd と同じ解なし条件、または opts が不正な場合
 */
export function fitTruncatedNbdWithInterval(
  m: number,
  repeatRate: number,
  opts: FitTruncatedNbdWithIntervalOptions = {},
): FitTruncatedNbdWithIntervalResult {
  const iterations = opts.iterations ?? 200;
  const seed = opts.seed ?? 1;
  const level = opts.level ?? 0.9;
  const nCustomers = opts.nCustomers ?? 1000;
  if (!(level > 0) || !(level < 1)) {
    throw new RangeError(`level must be within (0, 1), received ${level}`);
  }
  if (!Number.isInteger(nCustomers) || nCustomers < 2) {
    throw new RangeError(`nCustomers must be an integer >= 2, received ${nCustomers}`);
  }
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError(`iterations must be a positive integer, received ${iterations}`);
  }

  const point = fitTruncatedNbd(m, repeatRate); // 解なしはここで throw

  let warning: string | undefined;
  if (iterations * nCustomers > 1e7) {
    warning = `iterations (${iterations}) x nCustomers (${nCustomers}) exceeds 1e7 — this may take a long time. Consider reducing iterations or nCustomers.`;
  }

  const cdf = truncatedCdf(point.M, point.K);
  const rng = createRng(seed);
  const msamples: number[] = [];
  const ksamples: number[] = [];
  const nextSamples: number[] = [];
  let skipped = 0;

  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    let repeaters = 0;
    for (let n = 0; n < nCustomers; n++) {
      const r = sampleTruncated(cdf, rng);
      sum += r;
      if (r >= 2) repeaters++;
    }
    const mHat = sum / nCustomers;
    const rrHat = repeaters / nCustomers;
    try {
      const fit = fitTruncatedNbd(mHat, rrHat);
      msamples.push(fit.M);
      ksamples.push(fit.K);
      nextSamples.push((fit.M * (fit.K + m)) / (fit.M + fit.K));
    } catch {
      skipped++; // 再生成標本が解なし条件に落ちた反復はスキップ
    }
  }

  if (msamples.length === 0) {
    throw new RangeError(
      "all bootstrap iterations were skipped (resampled m/repeatRate had no solution). Increase nCustomers or iterations.",
    );
  }

  msamples.sort((a, b) => a - b);
  ksamples.sort((a, b) => a - b);
  nextSamples.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;

  const result: FitTruncatedNbdWithIntervalResult = {
    M: point.M,
    K: point.K,
    iterations,
    interval: {
      level,
      M: { low: percentile(msamples, alpha), high: percentile(msamples, 1 - alpha) },
      K: { low: percentile(ksamples, alpha), high: percentile(ksamples, 1 - alpha) },
    },
    nextYearPurchasesPerCustomer: {
      point: (point.M * (point.K + m)) / (point.M + point.K),
      p5: percentile(nextSamples, 0.05),
      p95: percentile(nextSamples, 0.95),
    },
    skipped,
  };
  if (warning) result.warning = warning;
  return result;
}

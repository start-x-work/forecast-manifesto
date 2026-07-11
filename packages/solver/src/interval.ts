/**
 * K 同定のパラメトリック・ブートストラップ区間。
 *
 * 手順：同定した (M, K̂) の NBD から nCustomers 人の購買回数を再生成 →
 * 浸透率と M を再計測 → K を再同定 ×iterations → パーセンタイル区間。
 *
 * 点推定 API（identifyK）のシグネチャ・戻り値は不変。本関数は追加のみ。
 */

import { identifyK } from "./identify.js";
import { createRng, sampleNbd, percentile } from "./rng.js";

export interface IdentifyKWithIntervalOptions {
  /**
   * 観測の母数（浸透率・M を測った顧客数）。再生成のサンプルサイズ。
   * 既定 1000。区間の幅は母数に依存するため、実データの母数が分かる場合は
   * 必ず渡すこと（既定値は「目安の幅」を出すための便宜）。
   */
  nCustomers?: number;
  /** ブートストラップ反復数（既定 200） */
  iterations?: number;
  /** 乱数シード（既定 1） */
  seed?: number;
  /** 区間の信頼水準（既定 0.9 → [5%, 95%]） */
  level?: number;
  /** true で samples を結果に含める（既定 true） */
  includeSamples?: boolean;
}

export interface KInterval {
  level: number;
  low: number;
  high: number;
}

export interface IdentifyKWithIntervalResult {
  /** 点推定の K（identifyK と同一） */
  K: number;
  /** 実行したブートストラップ反復数（opts.iterations と同値） */
  iterations: number;
  /** 区間（level は opts.level と同値） */
  interval: KInterval;
  /** パーセンタイル区間 [lo, hi]（interval と同じ値。後方互換のため維持） */
  ci: [number, number];
  /** ブートストラップ標本（includeSamples=false で省略） */
  samples?: number[];
  /** 再生成で解なし等によりスキップした反復数 */
  skipped: number;
  /** 計算量ガード警告（iterations×nCustomers > 1e7 のとき文字列、通常 undefined） */
  warning?: string;
}

/**
 * 観測 (M, penetration) から K を同定し、パラメトリック・ブートストラップで
 * 区間を付与する。
 *
 * @throws {RangeError} identifyK と同じ解なし条件、または opts が不正な場合
 */
export function identifyKWithInterval(
  M: number,
  penetration: number,
  opts: IdentifyKWithIntervalOptions = {},
): IdentifyKWithIntervalResult {
  const nCustomers = opts.nCustomers ?? 1000;
  if (!Number.isInteger(nCustomers) || nCustomers < 2) {
    throw new RangeError(`nCustomers must be an integer >= 2, received ${nCustomers}`);
  }
  const iterations = opts.iterations ?? 200;
  const seed = opts.seed ?? 1;
  const level = opts.level ?? 0.9;
  if (!(level > 0) || !(level < 1)) {
    throw new RangeError(`level must be within (0, 1), received ${level}`);
  }

  const { K } = identifyK(M, penetration); // 点推定（解なしはここで throw）

  let warning: string | undefined;
  if (iterations * nCustomers > 1e7) {
    warning = `iterations (${iterations}) x nCustomers (${nCustomers}) exceeds 1e7 — this may take a long time. Consider reducing iterations or sampling customers.`;
  }

  const rng = createRng(seed);
  const samples: number[] = [];
  let skipped = 0;

  for (let i = 0; i < iterations; i++) {
    // NBD(M, K̂) から nCustomers 人の購買回数を再生成
    let sum = 0;
    let buyers = 0;
    for (let n = 0; n < nCustomers; n++) {
      const r = sampleNbd(M, K, rng);
      sum += r;
      if (r >= 1) buyers++;
    }
    const mHat = sum / nCustomers;
    const penHat = buyers / nCustomers;
    if (!(mHat > 0) || penHat <= 0 || penHat >= 1) {
      skipped++;
      continue;
    }
    try {
      samples.push(identifyK(mHat, penHat).K);
    } catch {
      skipped++; // 再生成標本が解なし条件に落ちた反復はスキップ
    }
  }

  if (samples.length === 0) {
    throw new RangeError(
      "all bootstrap iterations were skipped (resampled penetration/M had no solution). Increase nCustomers or iterations.",
    );
  }

  samples.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  const ci: [number, number] = [percentile(samples, alpha), percentile(samples, 1 - alpha)];

  const result: IdentifyKWithIntervalResult = {
    K,
    iterations,
    interval: { level, low: ci[0], high: ci[1] },
    ci,
    skipped,
  };
  if (opts.includeSamples ?? true) result.samples = samples;
  if (warning) result.warning = warning;
  return result;
}

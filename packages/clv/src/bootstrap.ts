/**
 * パラメトリック・ブートストラップによる不確実性の定量化（clv 側）。
 *
 * 方式：推定パラメータで個票を再生成 → 再推定を iterations 回 → パーセンタイル区間。
 * フルベイズ（MCMC）はスコープ外——事後分布が必要な場合は PyMC-Marketing を参照。
 *
 * 点推定 API（fitBgNbd / clv / summarize）のシグネチャ・戻り値は不変。
 * 本モジュールは *WithInterval の追加のみを行う。
 */

import {
  createRng,
  sampleGamma,
  sampleBeta,
  percentile,
} from "@forecast-manifesto/solver";
import { fitBgNbd, probAlive } from "./bgnbd.js";
import type { BgNbdParams, FitBgNbdResult } from "./bgnbd.js";
import { fitGammaGamma, expectedAvgValue } from "./gammaGamma.js";
import type { GgParams } from "./gammaGamma.js";
import { clv, summarize } from "./clv.js";
import type { ClvOptions, Summary, SegmentLabel } from "./clv.js";
import type { Rfm } from "./rfm.js";

const WEEKS_PER_MONTH = 365.25 / 12 / 7;

export interface BootstrapOptions {
  /** ブートストラップ反復数（既定 200） */
  iterations?: number;
  /** 乱数シード（既定 1） */
  seed?: number;
  /** 区間の信頼水準（既定 0.9 → [5%, 95%]） */
  level?: number;
}

function resolveOpts(opts: BootstrapOptions): { iterations: number; seed: number; level: number } {
  const iterations = opts.iterations ?? 200;
  const seed = opts.seed ?? 1;
  const level = opts.level ?? 0.9;
  if (!(level > 0) || !(level < 1)) {
    throw new RangeError(`level must be within (0, 1), received ${level}`);
  }
  return { iterations, seed, level };
}

function computeGuard(iterations: number, n: number): string | undefined {
  if (iterations * n > 1e7) {
    return `iterations (${iterations}) x customers (${n}) exceeds 1e7 — this may take a long time. Consider reducing iterations or sampling customers.`;
  }
  return undefined;
}

function ciOf(samples: number[], level: number): [number, number] {
  const sorted = [...samples].sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  return [percentile(sorted, alpha), percentile(sorted, 1 - alpha)];
}

/**
 * BG/NBD の生成過程どおりに 1 顧客の (frequency, recency) をシミュレートする。
 * λ ~ Gamma(r, 1/α)、p ~ Beta(a, b)。初回購入を t=0 とし、以後の反復購入を
 * 指数間隔で生成、各購入直後に確率 p で離反する。
 */
function simulateBgNbdCustomer(
  params: BgNbdParams,
  T: number,
  rng: () => number,
): { frequency: number; recency: number } {
  const lambda = sampleGamma(params.r, 1 / params.alpha, rng);
  const p = sampleBeta(params.a, params.b, rng);
  let t = 0;
  let x = 0;
  let tx = 0;
  for (;;) {
    const u = Math.max(rng(), Number.MIN_VALUE);
    t += -Math.log(u) / lambda;
    if (t > T) break;
    x++;
    tx = t;
    if (rng() < p) break; // 購入直後の離反
  }
  return { frequency: x, recency: tx };
}

/** Gamma-Gamma の生成過程どおりに反復購入者の平均金額をシミュレートする。 */
function simulateMonetary(gg: GgParams, frequency: number, rng: () => number): number {
  if (frequency < 1) return 0;
  // ν ~ Gamma(q, 1/γ)、平均金額 m̄x | ν ~ Gamma(p·x, 1/(ν·x))（期待値 p/ν）
  const nu = sampleGamma(gg.q, 1 / gg.gamma, rng);
  return sampleGamma(gg.p * frequency, 1 / (nu * frequency), rng);
}

export interface FitBgNbdWithIntervalResult {
  /** 点推定（fitBgNbd と同一） */
  params: FitBgNbdResult;
  /** 各パラメータのパーセンタイル区間 */
  ci: { r: [number, number]; alpha: [number, number]; a: [number, number]; b: [number, number] };
  /** ブートストラップ標本（パラメータ組） */
  samples: BgNbdParams[];
  /** 再推定に失敗しスキップした反復数 */
  skipped: number;
  warning?: string;
}

/**
 * BG/NBD を推定し、パラメトリック・ブートストラップで各パラメータに区間を付与する。
 */
export function fitBgNbdWithInterval(
  rfm: Rfm[],
  opts: BootstrapOptions = {},
): FitBgNbdWithIntervalResult {
  const { iterations, seed, level } = resolveOpts(opts);
  const point = fitBgNbd(rfm);
  const warning = computeGuard(iterations, rfm.length);
  const rng = createRng(seed);

  const samples: BgNbdParams[] = [];
  let skipped = 0;
  for (let i = 0; i < iterations; i++) {
    const sim: Rfm[] = rfm.map((c) => {
      const s = simulateBgNbdCustomer(point, c.T, rng);
      return { customerId: c.customerId, frequency: s.frequency, recency: s.recency, T: c.T, monetary: 0 };
    });
    try {
      const fit = fitBgNbd(sim);
      samples.push({ r: fit.r, alpha: fit.alpha, a: fit.a, b: fit.b });
    } catch {
      skipped++;
    }
  }
  if (samples.length === 0) {
    throw new RangeError("all bootstrap iterations failed to refit. Increase data size or iterations.");
  }

  const ci = {
    r: ciOf(samples.map((s) => s.r), level),
    alpha: ciOf(samples.map((s) => s.alpha), level),
    a: ciOf(samples.map((s) => s.a), level),
    b: ciOf(samples.map((s) => s.b), level),
  };
  const result: FitBgNbdWithIntervalResult = { params: point, ci, samples, skipped };
  if (warning) result.warning = warning;
  return result;
}

export interface ClvWithIntervalResult {
  /** 点推定（clv() と同一） */
  point: number;
  p5: number;
  p50: number;
  p95: number;
  warning?: string;
}

/**
 * 個客 CLV のモンテカルロ区間。
 *
 * 顧客の観測 (x, t_x, T) を所与とした事後的な描画で将来をシミュレートする：
 *   生存 ~ Bernoulli(P(alive))、λ ~ Gamma(r+x, 1/(α+T))、p ~ Beta(a, b+x)
 * 将来の購買列を指数間隔で生成し、月次割引した利益を合算する。
 * 金額は expectedAvgValue の点推定を用いる（金額の不確実性・パラメータの
 * 標本誤差は含まない——docs/08 参照）。
 */
export function clvWithInterval(
  c: Rfm,
  p: BgNbdParams,
  gg: GgParams,
  opts: ClvOptions & BootstrapOptions,
): ClvWithIntervalResult {
  const { iterations, seed } = resolveOpts(opts);
  const point = clv(c, p, gg, opts); // 引数検証もここで走る
  const unitsPerMonth = opts.unitsPerMonth ?? WEEKS_PER_MONTH;
  const horizon = opts.horizonMonths * unitsPerMonth;
  const avgValue = expectedAvgValue(c, gg);
  const alive0 = probAlive(c, p);
  const rng = createRng(seed);

  const draws: number[] = [];
  for (let i = 0; i < iterations; i++) {
    if (rng() >= alive0) {
      draws.push(0); // 既に離反
      continue;
    }
    const lambda = sampleGamma(p.r + c.frequency, 1 / (p.alpha + c.T), rng);
    const churn = sampleBeta(p.a, p.b + c.frequency, rng);
    let t = 0;
    let pv = 0;
    for (;;) {
      const u = Math.max(rng(), Number.MIN_VALUE);
      t += -Math.log(u) / lambda;
      if (t > horizon) break;
      const month = Math.min(opts.horizonMonths, Math.max(1, Math.ceil(t / unitsPerMonth)));
      pv += (avgValue * opts.margin) / Math.pow(1 + opts.monthlyDiscount, month);
      if (rng() < churn) break;
    }
    draws.push(pv);
  }

  draws.sort((a, b) => a - b);
  return {
    point,
    p5: percentile(draws, 0.05),
    p50: percentile(draws, 0.5),
    p95: percentile(draws, 0.95),
  };
}

export interface SummaryWithIntervalResult {
  /** 点推定（summarize と同一） */
  point: Summary;
  ci: {
    aliveRate: [number, number];
    top20RevenueShare: [number, number];
    expectedRepeatNext12m: [number, number];
    segments: { label: SegmentLabel; share: [number, number] }[];
  };
  skipped: number;
  warning?: string;
}

/**
 * summarize の各値にパラメトリック・ブートストラップ区間を付与する。
 * 各反復で個票（頻度・金額）を再生成し、BG/NBD・Gamma-Gamma を再推定して
 * サマリを再計算する（推定の標本誤差を含んだ区間）。
 */
export function summarizeWithInterval(
  rfm: Rfm[],
  opts: BootstrapOptions = {},
): SummaryWithIntervalResult {
  const { iterations, seed, level } = resolveOpts(opts);
  const bg = fitBgNbd(rfm);
  const gg = fitGammaGamma(rfm, { warn: false });
  const point = summarize(rfm, bg, gg);
  const warning = computeGuard(iterations, rfm.length);
  const rng = createRng(seed);

  const labels: SegmentLabel[] = ["優良継続", "離反危機", "新規", "休眠"];
  const acc = {
    aliveRate: [] as number[],
    top20RevenueShare: [] as number[],
    expectedRepeatNext12m: [] as number[],
    segShare: new Map<SegmentLabel, number[]>(labels.map((l) => [l, []])),
  };

  let skipped = 0;
  for (let i = 0; i < iterations; i++) {
    const sim: Rfm[] = rfm.map((c) => {
      const s = simulateBgNbdCustomer(bg, c.T, rng);
      return {
        customerId: c.customerId,
        frequency: s.frequency,
        recency: s.recency,
        T: c.T,
        monetary: simulateMonetary(gg, s.frequency, rng),
      };
    });
    try {
      const simBg = fitBgNbd(sim);
      const simGg = fitGammaGamma(sim, { warn: false });
      const s = summarize(sim, simBg, simGg);
      acc.aliveRate.push(s.aliveRate);
      acc.top20RevenueShare.push(s.top20RevenueShare);
      acc.expectedRepeatNext12m.push(s.expectedRepeatNext12m);
      for (const seg of s.segments) acc.segShare.get(seg.label)!.push(seg.share);
    } catch {
      skipped++;
    }
  }
  if (acc.aliveRate.length === 0) {
    throw new RangeError("all bootstrap iterations failed. Increase data size or iterations.");
  }

  const result: SummaryWithIntervalResult = {
    point,
    ci: {
      aliveRate: ciOf(acc.aliveRate, level),
      top20RevenueShare: ciOf(acc.top20RevenueShare, level),
      expectedRepeatNext12m: ciOf(acc.expectedRepeatNext12m, level),
      segments: labels.map((label) => ({ label, share: ciOf(acc.segShare.get(label)!, level) })),
    },
    skipped,
  };
  if (warning) result.warning = warning;
  return result;
}

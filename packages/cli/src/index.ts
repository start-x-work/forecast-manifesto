/**
 * @forecast-manifesto/cli — 需要予測・顧客資産分析の CLI。
 *
 *   npx @forecast-manifesto/cli analyze transactions.csv \
 *     --observation-end 2026-06-30 --horizon 12 --margin 0.3 \
 *     --bootstrap 200 --format md
 *
 * サブコマンド：
 *   analyze     取引ログ CSV → summarize ＋ 上位顧客 CLV（--bootstrap で区間付き）
 *   identify-k  --m --penetration（--n で区間付き）
 *   dirichlet   --config <json>（fitDirichlet 入力の JSON ファイル）
 *
 * 入力 CSV は UTF-8 のみ対応。ヘッダ必須（customerId,date,amount）。
 */

import { readFileSync } from "node:fs";
import {
  identifyK,
  identifyKWithInterval,
} from "@forecast-manifesto/solver";
import {
  toRfm,
  fitBgNbd,
  fitGammaGamma,
  clv,
  clvWithInterval,
  summarize,
  summarizeWithInterval,
  probAlive,
} from "@forecast-manifesto/clv";
import {
  fitDirichlet,
  brandMetrics,
  doubleJeopardyTable,
  penetrationFitCheck,
} from "@forecast-manifesto/dirichlet";
import {
  fitSbg,
  fitSbgMultiCohort,
  survivalCurve,
  retentionCurve,
  expectedTenure,
  cohortLtv,
} from "@forecast-manifesto/sbg";
import {
  splitCalibrationHoldout,
  conditionalExpectationByFrequency,
  trackingCumulative,
  mape,
} from "@forecast-manifesto/validate";
import { parseTransactionsCsv } from "./csv.js";
import {
  parseArgs,
  requireString,
  requireNumber,
  optionalNumber,
  optionalString,
} from "./args.js";

const USAGE = `forecast-manifesto CLI

Usage:
  forecast-manifesto analyze <transactions.csv> --observation-end 2026-06-30 [--horizon 12] [--margin 0.3] [--discount 0.01] [--top 10] [--bootstrap 200] [--seed 1] [--format md|json]
  forecast-manifesto identify-k --m <mean purchases> --penetration <rate> [--n <customers>] [--format md|json]
  forecast-manifesto dirichlet --config <input.json> [--format md|json]
  forecast-manifesto sbg --retention 0.87,0.74,0.65 [--periods 12] [--discount 0.1] [--revenue 12000] [--format md|json]
  forecast-manifesto sbg --cohorts-file cohorts.csv   (1行 = 1コホートの期別残存人数)
  forecast-manifesto validate <transactions.csv> --split-date 1997-09-30 --observation-end 1998-06-30 [--format md|json]

Input CSV: UTF-8, header required (customerId,date,amount).`;

function fmtPct(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

function analyze(argv: string[]): string {
  const args = parseArgs(argv);
  const csvPath = args.positional[0];
  if (!csvPath) throw new Error("analyze requires a CSV path.\n\n" + USAGE);
  const observationEnd = new Date(requireString(args, "observation-end") + "T00:00:00Z");
  if (Number.isNaN(observationEnd.getTime())) {
    throw new Error("--observation-end must be an ISO date (e.g. 2026-06-30)");
  }
  const horizon = optionalNumber(args, "horizon") ?? 12;
  const margin = optionalNumber(args, "margin") ?? 0.3;
  const discount = optionalNumber(args, "discount") ?? 0.01;
  const top = optionalNumber(args, "top") ?? 10;
  const bootstrap = optionalNumber(args, "bootstrap");
  const seed = optionalNumber(args, "seed") ?? 1;
  const format = optionalString(args, "format") ?? "md";

  const transactions = parseTransactionsCsv(readFileSync(csvPath, "utf8"));
  const rfm = toRfm(transactions, observationEnd);
  const bg = fitBgNbd(rfm);
  const gg = fitGammaGamma(rfm, { warn: false });
  const s = summarize(rfm, bg, gg);
  const clvOpts = { horizonMonths: horizon, monthlyDiscount: discount, margin };

  const ranked = rfm
    .map((c) => ({
      customerId: c.customerId,
      frequency: c.frequency,
      alive: probAlive(c, bg),
      clv: clv(c, bg, gg, clvOpts),
    }))
    .sort((a, b) => b.clv - a.clv)
    .slice(0, top);

  const interval = bootstrap
    ? summarizeWithInterval(rfm, { iterations: bootstrap, seed })
    : undefined;
  const topWithCi = bootstrap
    ? ranked.map((r) => {
        const c = rfm.find((x) => x.customerId === r.customerId)!;
        const ci = clvWithInterval(c, bg, gg, { ...clvOpts, iterations: Math.max(bootstrap, 500), seed });
        return { ...r, p5: ci.p5, p95: ci.p95 };
      })
    : undefined;

  if (format === "json") {
    return JSON.stringify(
      {
        customers: rfm.length,
        transactions: transactions.length,
        params: { bgnbd: { r: bg.r, alpha: bg.alpha, a: bg.a, b: bg.b }, gammaGamma: gg },
        summary: s,
        summaryInterval: interval?.ci,
        topCustomers: topWithCi ?? ranked,
      },
      null,
      2,
    );
  }

  const L: string[] = [];
  L.push(`# 顧客資産分析レポート`);
  L.push("");
  L.push(`- 顧客数: ${rfm.length} / 取引: ${transactions.length} 件（観測終了 ${observationEnd.toISOString().slice(0, 10)}）`);
  L.push(`- BG/NBD: r=${bg.r.toFixed(3)}, α=${bg.alpha.toFixed(3)}, a=${bg.a.toFixed(3)}, b=${bg.b.toFixed(3)}`);
  L.push(`- Gamma-Gamma: p=${gg.p.toFixed(3)}, q=${gg.q.toFixed(3)}, γ=${gg.gamma.toFixed(3)}（頻度×金額 相関 ${gg.independence.correlation.toFixed(3)}）`);
  L.push("");
  L.push(`## サマリ`);
  L.push("");
  const ci = interval?.ci;
  const withCi = (v: string, c?: [number, number], pct = true): string =>
    c ? `${v}（90%区間 ${pct ? fmtPct(c[0]) : c[0].toFixed(0)}〜${pct ? fmtPct(c[1]) : c[1].toFixed(0)}）` : v;
  L.push(`- 生存顧客比率: ${withCi(fmtPct(s.aliveRate), ci?.aliveRate)}`);
  L.push(`- 上位20%売上集中度: ${withCi(fmtPct(s.top20RevenueShare), ci?.top20RevenueShare)}`);
  L.push(`- 今後12ヶ月の期待反復購買: ${withCi(s.expectedRepeatNext12m.toFixed(0) + " 回", ci?.expectedRepeatNext12m, false)}`);
  L.push("");
  L.push(`| セグメント | 人数 | 構成比 |`);
  L.push(`|---|---:|---:|`);
  for (const seg of s.segments) L.push(`| ${seg.label} | ${seg.count} | ${fmtPct(seg.share)} |`);
  L.push("");
  L.push(`## 上位顧客 CLV（${horizon}ヶ月・月次割引${fmtPct(discount)}・粗利${fmtPct(margin)}）`);
  L.push("");
  L.push(bootstrap ? `| 顧客 | 頻度 | P(alive) | CLV | p5〜p95 |` : `| 顧客 | 頻度 | P(alive) | CLV |`);
  L.push(bootstrap ? `|---|---:|---:|---:|---|` : `|---|---:|---:|---:|`);
  for (const r of (topWithCi ?? ranked) as Array<{ customerId: string; frequency: number; alive: number; clv: number; p5?: number; p95?: number }>) {
    const base = `| ${r.customerId} | ${r.frequency} | ${r.alive.toFixed(2)} | ${r.clv.toFixed(1)} |`;
    L.push(r.p5 !== undefined ? `${base} ${r.p5.toFixed(1)}〜${r.p95!.toFixed(1)} |` : base);
  }
  if (bootstrap) {
    L.push("");
    L.push(`> 区間はパラメトリック・ブートストラップ（${bootstrap} 反復・シード ${seed}・再現可能）。`);
  }
  return L.join("\n");
}

function identifyKCmd(argv: string[]): string {
  const args = parseArgs(argv);
  const m = requireNumber(args, "m");
  const penetration = requireNumber(args, "penetration");
  const n = optionalNumber(args, "n");
  const format = optionalString(args, "format") ?? "md";

  if (n !== undefined) {
    const r = identifyKWithInterval(m, penetration, { nCustomers: n, includeSamples: false });
    if (format === "json") return JSON.stringify({ K: r.K, ci: r.ci, skipped: r.skipped }, null, 2);
    return [
      `K = ${r.K.toFixed(4)}（M=${m}, 浸透率=${penetration}）`,
      `90%区間 [${r.ci[0].toFixed(4)}, ${r.ci[1].toFixed(4)}]（n=${n}）`,
    ].join("\n");
  }
  const r = identifyK(m, penetration);
  if (format === "json") return JSON.stringify(r, null, 2);
  return `K = ${r.K.toFixed(4)}（M=${m}, 浸透率=${penetration}, ${r.iterations} 反復で収束）`;
}

function dirichletCmd(argv: string[]): string {
  const args = parseArgs(argv);
  const configPath = requireString(args, "config");
  const format = optionalString(args, "format") ?? "md";
  const input = JSON.parse(readFileSync(configPath, "utf8"));
  const model = fitDirichlet(input);
  const metrics = brandMetrics(model);
  const dj = doubleJeopardyTable(model);
  const hasObserved = Array.isArray(input.brands) && input.brands.some((b: { observedPenetration?: number }) => b.observedPenetration !== undefined);
  const fitCheck = hasObserved ? penetrationFitCheck(model, input.brands) : undefined;

  if (format === "json") {
    return JSON.stringify({ model: { M: model.M, K: model.K, S: model.S }, brandMetrics: metrics, doubleJeopardy: dj, fitCheck }, null, 2);
  }
  const L: string[] = [];
  L.push(`# 多ブランド市場構造（Dirichlet NBD）`);
  L.push("");
  L.push(`- M=${model.M.toFixed(3)} / K=${model.K.toFixed(3)} / S=${model.S.toFixed(3)}`);
  L.push("");
  L.push(`| ブランド | シェア | 浸透率 | 頻度 | SCR | 100%ロイヤル |`);
  L.push(`|---|---:|---:|---:|---:|---:|`);
  for (const m of metrics) {
    L.push(
      `| ${m.name} | ${fmtPct(m.share)} | ${fmtPct(m.penetration)} | ${m.buyRate.toFixed(2)} | ${fmtPct(m.scr)} | ${fmtPct(m.soleBuyerRate)} |`,
    );
  }
  L.push("");
  if (fitCheck) {
    L.push(`## 当てはまり診断（理論浸透率 vs 観測）`);
    L.push("");
    L.push(`| ブランド | 観測 | 理論 | 乖離 |`);
    L.push(`|---|---:|---:|---:|`);
    for (const r of fitCheck.rows) {
      L.push(`| ${r.name} | ${fmtPct(r.observedPenetration)} | ${fmtPct(r.theoreticalPenetration)} | ${(r.diff >= 0 ? "+" : "") + fmtPct(r.diff)} |`);
    }
    L.push("");
    L.push(`- 平均乖離 ${fmtPct(fitCheck.mae)}／最大乖離 ${fitCheck.worst.name}（${(fitCheck.worst.diff >= 0 ? "+" : "") + fmtPct(fitCheck.worst.diff)}）`);
    L.push("");
  }
  L.push(`> シェア昇順で浸透率も頻度も下がる＝ダブルジェパディ（詳細は docs/07）。`);
  return L.join("\n");
}


function sbgCmd(argv: string[]): string {
  const args = parseArgs(argv);
  const format = optionalString(args, "format") ?? "md";
  const periods = optionalNumber(args, "periods") ?? 12;
  const discount = optionalNumber(args, "discount") ?? 0.1;
  const revenue = optionalNumber(args, "revenue");

  const retentionArg = optionalString(args, "retention");
  const cohortsFile = optionalString(args, "cohorts-file");
  if (!retentionArg && !cohortsFile) {
    throw new Error("sbg requires --retention 0.87,0.74,... or --cohorts-file <csv>.\n\n" + USAGE);
  }

  let fit: { alpha: number; beta: number; logLik: number };
  let sourceNote: string;
  if (cohortsFile) {
    const cohorts = readFileSync(cohortsFile, "utf8")
      .trim()
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l, i) => {
        const nums = l.split(",").map((v) => Number(v.trim()));
        if (nums.some((v) => !Number.isFinite(v))) {
          throw new Error(`line ${i + 1}: cohort counts must be numbers (received "${l.trim()}")`);
        }
        return nums;
      });
    fit = fitSbgMultiCohort(cohorts);
    sourceNote = `マルチコホート同時推定（${cohorts.length} コホート）`;
  } else {
    const retention = retentionArg!.split(",").map((v) => Number(v.trim()));
    if (retention.some((v) => !Number.isFinite(v))) {
      throw new Error(`--retention must be comma-separated numbers (received "${retentionArg}")`);
    }
    fit = fitSbg(retention);
    sourceNote = `単一コホート（${retention.length} 期）`;
  }

  const params = { alpha: fit.alpha, beta: fit.beta };
  const survival = survivalCurve(params, periods);
  const retentionSeries = retentionCurve(params, periods);
  const tenure = fit.alpha > 1 ? expectedTenure(params) : expectedTenure(params, 120);
  const ltv = revenue !== undefined ? cohortLtv(params, { discount, revenuePerPeriod: revenue }) : undefined;

  if (format === "json") {
    return JSON.stringify(
      { alpha: fit.alpha, beta: fit.beta, logLik: fit.logLik, survival, retention: retentionSeries, expectedTenure: tenure, cohortLtv: ltv },
      null,
      2,
    );
  }
  const L: string[] = [];
  L.push(`# 解約構造レポート（shifted-beta-geometric）`);
  L.push("");
  L.push(`- 推定: α=${fit.alpha.toFixed(3)}, β=${fit.beta.toFixed(3)}（${sourceNote}）`);
  L.push(`- 期待在籍期間: ${tenure.toFixed(2)} 期${fit.alpha <= 1 ? "（α≤1のため120期打ち切り）" : ""}`);
  if (ltv !== undefined) {
    L.push(`- コホートLTV: ${ltv.toFixed(0)}（単価 ${revenue}／期・割引 ${fmtPct(discount)}）`);
  }
  L.push("");
  L.push(`| 期 | 残存率（外挿込み） | 期次リテンション |`);
  L.push(`|---:|---:|---:|`);
  for (let t = 0; t < periods; t++) {
    L.push(`| ${t + 1} | ${fmtPct(survival[t])} | ${fmtPct(retentionSeries[t])} |`);
  }
  L.push("");
  L.push(`> リテンションの漸増は生存者バイアス（個人は改善していない）。docs/09 参照。`);
  return L.join("\n");
}

function validateCmd(argv: string[]): string {
  const args = parseArgs(argv);
  const csvPath = args.positional[0];
  if (!csvPath) throw new Error("validate requires a CSV path.\n\n" + USAGE);
  const splitDate = new Date(requireString(args, "split-date") + "T00:00:00Z");
  const observationEnd = new Date(requireString(args, "observation-end") + "T00:00:00Z");
  if (Number.isNaN(splitDate.getTime()) || Number.isNaN(observationEnd.getTime())) {
    throw new Error("--split-date and --observation-end must be ISO dates (e.g. 1997-09-30)");
  }
  const format = optionalString(args, "format") ?? "md";

  const transactions = parseTransactionsCsv(readFileSync(csvPath, "utf8"));
  const { calibration, holdout } = splitCalibrationHoldout(transactions, splitDate, observationEnd);
  const params = fitBgNbd(calibration);
  const freq = conditionalExpectationByFrequency(calibration, holdout, params, { capFrequency: 7 });
  const track = trackingCumulative(calibration, transactions, params, { splitDate, observationEnd, bucket: "week" });
  const holdoutRows = track.filter((r) => !r.inCalibration);
  const last = track[track.length - 1];
  const finalErr = Math.abs(last.predicted - last.actual) / last.actual;

  if (format === "json") {
    return JSON.stringify(
      { customers: calibration.length, params: { r: params.r, alpha: params.alpha, a: params.a, b: params.b }, byFrequency: freq, finalCumulative: { predicted: last.predicted, actual: last.actual, relativeError: finalErr }, holdoutWeeklyMape: mape(holdoutRows) },
      null,
      2,
    );
  }
  const L: string[] = [];
  L.push(`# 検証レポート（較正/検証分割）`);
  L.push("");
  L.push(`- コホート: ${calibration.length} 顧客（較正〜${requireString(args, "split-date")} / 検証〜${requireString(args, "observation-end")}）`);
  L.push(`- BG/NBD: r=${params.r.toFixed(3)}, α=${params.alpha.toFixed(3)}, a=${params.a.toFixed(3)}, b=${params.b.toFixed(3)}`);
  L.push(`- 最終累積: 予測 ${last.predicted.toFixed(0)} vs 実測 ${last.actual}（相対誤差 ${fmtPct(finalErr)}）`);
  L.push(`- 検証期間の週次 MAPE: ${mape(holdoutRows).toFixed(2)}%`);
  L.push("");
  L.push(`| 較正頻度 | 顧客数 | 予測平均 | 実測平均 |`);
  L.push(`|---:|---:|---:|---:|`);
  for (const r of freq) {
    L.push(`| ${r.frequency === 7 ? "7+" : r.frequency} | ${r.nCustomers} | ${r.predicted.toFixed(3)} | ${r.actual.toFixed(3)} |`);
  }
  L.push("");
  L.push(`> 予測は当てるゲームではない。構造が実測を再現しているかを確認してから使う（docs/08）。`);
  return L.join("\n");
}

export function run(argv: string[]): { code: number; output: string } {
  const [cmd, ...rest] = argv;
  try {
    switch (cmd) {
      case "analyze":
        return { code: 0, output: analyze(rest) };
      case "identify-k":
        return { code: 0, output: identifyKCmd(rest) };
      case "dirichlet":
        return { code: 0, output: dirichletCmd(rest) };
      case "sbg":
        return { code: 0, output: sbgCmd(rest) };
      case "validate":
        return { code: 0, output: validateCmd(rest) };
      case undefined:
      case "help":
      case "--help":
        return { code: 0, output: USAGE };
      default:
        return { code: 1, output: `unknown command: ${cmd}\n\n${USAGE}` };
    }
  } catch (err) {
    return { code: 1, output: `error: ${(err as Error).message}` };
  }
}


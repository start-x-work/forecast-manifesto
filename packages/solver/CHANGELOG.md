# Changelog — @forecast-manifesto/solver

本パッケージの主な変更を記録する。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

すべて **追加のみ（additive）** で、既存の点推定 API のシグネチャに破壊的変更はない。

## [Unreleased]

### Fixed

- `tests/fit.test.ts` で未使用だった `penetrationFromK` の import を除去し、`tsc --noEmit`（`npm run typecheck`）を green にした。

## [0.5.0] - 2026-08-24

### Added

- **期間換算（時間スケーリング）** `scaleToHorizon(M, K, t1, t2)` / `penetrationAtHorizon(M, K, t1, t2)`（[`src/horizon.ts`](./src/horizon.ts)）。NBD の性質（`M` は期間に比例・`K` は不変）で短期観測から長期の浸透率・購入回数を外挿する。外挿倍率 `t2/t1 > 12` で `warning` を返す。解説は [docs/03-nbd-model.md](../../docs/03-nbd-model.md) の「期間換算」節。
- **度数分布からの最尤推定（MLE）** `fitNbdMLE(counts, opts?)`（[`src/fit.ts`](./src/fit.ts)）。購入回数の度数分布全体から `(M, K)` を推定する（`M` は標本平均の閉形式、`K` は黄金分割探索）。`converged` を握り潰さず返す。要約統計しかない場合の `identifyK` は非推奨にしない（コールドスタート耐性のため）。使い分けは [docs/03-nbd-model.md](../../docs/03-nbd-model.md) を参照。

公知のモデル構造・数式のみを実装しており、原著本文の転載はしない。一次文献は docs 各章に明記。

# Changelog — @forecast-manifesto/solver

本パッケージの主な変更を記録する。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

すべて **追加のみ（additive）** で、既存の点推定 API のシグネチャに破壊的変更はない。

## [0.7.0] - 2026-09-28

### Added

- **NBD のモーメントと累積分布** `nbdMean(M, K)` / `nbdVariance(M, K)` / `nbdCdf(n, M, K)`（[`src/nbd.ts`](./src/nbd.ts)）。PMF の総和・平均・分散の自己検証に使う。
- **全ブランドのコンセプトシェア** `conceptShareByBrand(votes)`（[`src/bp10.ts`](./src/bp10.ts)）。既存の `conceptShare(votes, j)` を全列に適用する薄いラッパー。
- `identifyK` の戻り値に `residual`（`|P_0(K) − (1 − penetration)|`）を追加。既存フィールド `K` / `iterations` の値と意味は不変。

## [0.6.0] - 2026-09-28

### Added

- **リーチ＆フリークエンシー** `reachFromImpressions(input)`（[`src/reach.ts`](./src/reach.ts)）。露出回数と母集団から到達率（reach）・母集団平均頻度（averageFrequencyAll）・到達者内平均頻度（frequencyAmongReached）を NBD で求める。実測リーチがあれば `identifyK` で K を逆算して再現し、無ければ K の事前レンジ（`kPrior`）から reach の区間を出す。媒体別・出稿別の K 実値（ベンチマーク）は同梱しない（`docs/05-boundaries.md`）。解説は [docs/10-reach.md](../../docs/10-reach.md)。
- **表明選好の補正** `fitIntentCalibration(pairs)` と `unitShare(..., intentCalibration=1.0)`（[`src/unitShare.ts`](./src/unitShare.ts)）。ローンチ後の実シェアと事前コンセプトシェアの原点回帰で意向-行動ギャップの補正係数を推定する。既定 1.0 で従来結果は不変（後方互換）。業界別の補正係数は同梱しない。解説は [docs/04-bp10.md](../../docs/04-bp10.md)。
- **浸透率ベース売上の区間** `forecastRevenueWithInterval(input, opts?)`（[`src/revenue.ts`](./src/revenue.ts)）。K（浸透率）の不確実性を再生成ブートストラップで売上まで伝播させる。同一シードで完全再現。解説は [docs/08-uncertainty.md](../../docs/08-uncertainty.md)。
- 公開 API スナップショットテスト（[`tests/api.test.ts`](./tests/api.test.ts)）。エクスポートの意図しない削除・改名を CI で検知する。

### Fixed

- `tests/fit.test.ts` で未使用だった `penetrationFromK` の import を除去し、`tsc --noEmit`（`npm run typecheck`）を green にした。

## [0.5.0] - 2026-08-24

### Added

- **期間換算（時間スケーリング）** `scaleToHorizon(M, K, t1, t2)` / `penetrationAtHorizon(M, K, t1, t2)`（[`src/horizon.ts`](./src/horizon.ts)）。NBD の性質（`M` は期間に比例・`K` は不変）で短期観測から長期の浸透率・購入回数を外挿する。外挿倍率 `t2/t1 > 12` で `warning` を返す。解説は [docs/03-nbd-model.md](../../docs/03-nbd-model.md) の「期間換算」節。
- **度数分布からの最尤推定（MLE）** `fitNbdMLE(counts, opts?)`（[`src/fit.ts`](./src/fit.ts)）。購入回数の度数分布全体から `(M, K)` を推定する（`M` は標本平均の閉形式、`K` は黄金分割探索）。`converged` を握り潰さず返す。要約統計しかない場合の `identifyK` は非推奨にしない（コールドスタート耐性のため）。使い分けは [docs/03-nbd-model.md](../../docs/03-nbd-model.md) を参照。

公知のモデル構造・数式のみを実装しており、原著本文の転載はしない。一次文献は docs 各章に明記。

# Changelog — @forecast-manifesto/dirichlet

本パッケージの主な変更を記録する。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

すべて **追加のみ（additive）** で、既存 API のシグネチャに破壊的変更はない。

## [0.3.0] - 2026-09-28

### Added

- **重複購買の当てはまり診断** `duplicationFitCheck(model, observed)`（[`src/metrics.ts`](./src/metrics.ts)）。観測重複率行列（`observed[j][k]` = k の購買者が j も買う割合）と理論値 `duplicationMatrix` の乖離（行ごとの差・MAE・最大乖離）を返す。
- 公開 API スナップショットテスト（[`tests/api.test.ts`](./tests/api.test.ts)）。

### Changed

- 依存 `@forecast-manifesto/solver` を `^0.7.0` に更新。

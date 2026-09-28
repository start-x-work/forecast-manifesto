# Changelog — @forecast-manifesto/validate

本パッケージの主な変更を記録する。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

すべて **追加のみ（additive）** で、既存 API のシグネチャに破壊的変更はない。

## [0.4.0] - 2026-09-28

### Added

- **増分性の算術** `relativeLift` / `incrementalOutcome` / `iroas` / `meanDifferenceInterval` / `iroasWithInterval`（[`src/incrementality.ts`](./src/incrementality.ts)）。テスト群・対照群の平均と標本サイズ（区間には分散も）から、リフト・増分成果・iROAS と正規近似の区間を出す。合成対照群・MMM の再実装はしない。解説は [docs/06-incrementality.md](../../docs/06-incrementality.md)。区間の水準は 0.9 / 0.95 / 0.99 のみ。出稿削減テスト（spend < 0）でも区間は下限 ≤ 上限の順に返す。

### Changed

- 依存を `@forecast-manifesto/clv` `^0.5.0`・`@forecast-manifesto/solver` `^0.7.0` に更新。

## [0.3.0] - 2026-09-28

### Added

- **時間分割バックテスト** `backtest(transactions, opts)`（[`src/backtest.ts`](./src/backtest.ts)）。較正期間 t1 で BG/NBD を推定し、検証期間 t2 の顧客別購買回数を予測して実績と突き合わせる。点精度（MAE / RMSE / MAPE）と予測区間のカバレッジ率を返す。予測区間は検証期間購買回数を Poisson（期待値）で近似した保守的区間（過分散のためカバレッジは名目水準の下側に出やすい）。使用例は [`examples/backtest.ts`](../../examples/backtest.ts)。
- 公開 API スナップショットテスト（[`tests/api.test.ts`](./tests/api.test.ts)）。エクスポートの意図しない削除・改名を CI で検知する。

## [0.2.0] - 2026-08-24

### Added

- **適合度検定（Goodness-of-Fit）** `chiSquareGof(observed, M, K)`（[`src/gof.ts`](./src/gof.ts)）。観測度数分布が NBD に従うかをカイ二乗検定で判定する。期待度数 5 未満のセルは裾方向に併合、自由度は `セル数 - 1 - 推定パラメータ数(=2)`。`fits: false` のときは次の一手（契約型なら sBG、寡占・強ブランドなら Dirichlet の重複診断）を `note` で示す。「回す前の誠実」——NBD が当てはまらないカテゴリで黙って数値を返さないための装置。

公知の手法（カイ二乗適合度検定）に基づく実装。

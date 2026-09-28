# Changelog — @forecast-manifesto/clv

本パッケージの主な変更を記録する。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

すべて **追加のみ（additive）** で、既存 API のシグネチャに破壊的変更はない。

## [0.5.0] - Unreleased

### Added

- **コホート CLV 合計** `portfolioClv(rfm, p, gg, opts)`（[`src/clv.ts`](./src/clv.ts)）。個客 `clv` の線形和。
- `fitBgNbd` の `FitOptions.initialLogParams`（対数空間の初期値）。**省略時の挙動は 0.4.0 と同一**（文献標準の r=α=a=b=1 から単一スタート）で、点推定・ブートストラップ区間の結果は変わらない。局所解を疑うときに呼び出し側が別の始点を試し、`logLik` を比べるために使う。

### Changed

- 依存 `@forecast-manifesto/solver` を `^0.7.0` に更新。

## [0.4.0] - 2026-09-28

### Added

- **区間つき LTV（コホート）** `clvCohortWithInterval(input, opts?)`（[`src/clvInterval.ts`](./src/clvInterval.ts)）。コホートの「1 顧客あたり平均 CLV」にパラメトリック・ブートストラップ区間を付す。点推定は各顧客 `clv()` の平均に一致し、母数（顧客数）が少ないほど区間は広がる。顧客数 < 300・予測期間が観測窓を超える外挿・頻度×金額の強相関（Gamma-Gamma の独立仮定崩れ）を `warnings` で通知する。依存ゼロ・シード固定で完全再現。解説は [docs/05b-clv.md](../../docs/05b-clv.md) の「区間つき LTV」節。
  - 命名注記：既存の `clvWithInterval`（[`src/bootstrap.ts`](./src/bootstrap.ts), 個客のモンテカルロ区間）と役割が異なるため、後方互換を保ちつつコホート版を `clvCohortWithInterval` として公開する（`clvInterval.ts` 内の関数名は `clvWithInterval`）。
- 公開 API スナップショットテスト（[`tests/api.test.ts`](./tests/api.test.ts)）。エクスポートの意図しない削除・改名を CI で検知する。

### Changed

- 内部依存 `@forecast-manifesto/solver` の許容レンジを `^0.6.0` に更新（追加された `rng` 系ユーティリティの再利用のため。API は後方互換）。

公知のモデル構造・数式（BG/NBD・Gamma-Gamma・ブートストラップ）のみを実装しており、原著本文の転載はしない。一次文献は docs 各章に明記。

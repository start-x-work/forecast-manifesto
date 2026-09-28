# Changelog — @forecast-manifesto/cli

本パッケージの主な変更を記録する。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [0.3.0] - 2026-09-28

### Added

- `iroas` コマンド：群平均・標本サイズ・追加出稿費から iROAS（分散を渡せば 95% 区間）を出す。
- `memory` コマンド：言及回数から心的シェア、`--physical` を渡せば心的−実購買ギャップを出す。`--physical` に無いブランドがあればエラーにする（0 とみなして黙って計算しない）。
- `psm` コマンド：回答 JSON から Van Westendorp の4交点を出す。

### Changed

- `bin` のパスを `npm pkg fix` の正規形（`dist/bin.cjs`）に揃えた。公開時に npm が同じ整形を自動適用していたため、公開済み 0.3.0 の中身とリポジトリの記述を一致させる変更で、動作は変わらない。
- 依存を clv `^0.5.0`・dirichlet `^0.3.0`・solver `^0.7.0`・validate `^0.4.0` に更新し、memory `^0.1.0`・price `^0.1.0` を追加。

## [0.2.1] - 2026-08-24

### Added

- `analyze` コマンドに **NBD 適合度検定** を組み込み（`@forecast-manifesto/validate` の `chiSquareGof`）。購入回数分布が NBD と有意に乖離した場合（`fits: false`）は、md/json いずれの出力でも**必ず警告と次の一手を表示**する。適合度が同定不能な入力では GoF を出さず、警告なしで続行する。

適合度が green ＝コードの数値的整合の確認であり、本番の意思決定の妥当性そのものではない点は変わらない。

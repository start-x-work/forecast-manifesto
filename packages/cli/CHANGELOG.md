# Changelog — @forecast-manifesto/cli

本パッケージの主な変更を記録する。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [0.2.1] - 2026-08-24

### Added

- `analyze` コマンドに **NBD 適合度検定** を組み込み（`@forecast-manifesto/validate` の `chiSquareGof`）。購入回数分布が NBD と有意に乖離した場合（`fits: false`）は、md/json いずれの出力でも**必ず警告と次の一手を表示**する。適合度が同定不能な入力では GoF を出さず、警告なしで続行する。

適合度が green ＝コードの数値的整合の確認であり、本番の意思決定の妥当性そのものではない点は変わらない。

# Changelog — @forecast-manifesto/price

本パッケージの主な変更を記録する。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従う。

## [0.1.0] - Unreleased

### Added

- 初版。`vanWestendorp(responses)`（Van Westendorp 1976 の4交点：IPP / OPP / PMC / PME）と `priceAdjustmentFromRelative(observed, reference, elasticity)`（定弾力性の相対価格乗数）。業界別の価格調整係数・弾力性の既定値は同梱しない。解説と一次文献は [docs/12-price.md](../../docs/12-price.md)。

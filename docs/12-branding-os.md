# Branding-OS 対応表 — 出口の言い換え（新規開発ゼロ）

Branding-OS（Marketing-OS のブランド資産診断）は、確率思考スタックのうち4モジュールを**商品の言葉に言い換えた入口**である。計算の本体は本リポジトリにあり、診断LPは設問とスコアの写像だけを持つ。

| Branding-OS の出口 | 診断での言い換え | OSS モジュール | 計算の中身 | 置かないもの |
|---|---|---|---|---|
| 想起 | 第一想起・援助想起・入口の広さ | `@forecast-manifesto/memory` | 心的シェア、CEP 被覆、再生率 | CEP 辞書・業界ベンチマーク |
| 価格受容 | 値引き依存・納得価格 | `@forecast-manifesto/price` | Van Westendorp 交点、相対価格乗数 | 業界別 Price Adjustment 実係数 |
| 顧客資産 | 継続・集中・LTV | `@forecast-manifesto/clv` | BG/NBD ＋ Gamma-Gamma、ゼロ切断 NBD | 個社取引データ |
| 市場構造 | 浸透と頻度の天井 | `@forecast-manifesto/dirichlet` | Dirichlet NBD、DJ、重複 | 個社シェアの実測パイプライン |

残る3モジュールは診断の別入口に対応する。

| モジュール | 診断入口 | パッケージ |
|---|---|---|
| NBD / BP-10 | 需要予測構造診断 | `@forecast-manifesto/solver` |
| BG/NBD（個客頻度・生存） | 顧客資産診断（clv と同一スタック） | `@forecast-manifesto/clv` |
| 増分性検証 | 意思決定の総点検（効果検証レンズ） | `@forecast-manifesto/validate` |

往復リンク：OSS README → Marketing-OS 診断LP、診断LP → 本 GitHub（UTM 付き）。製品側の静的検査は `tests/oss-link-roundtrip.test.ts`。

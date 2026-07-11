# 09. 契約型の解約構造 — リテンションは「上がって見える」

サブスクのコホートを追うと、期次リテンション（更新率）はほぼ必ず**時間とともに上がって見える**。1年目 87% → 2年目 85%？いや逆で、86% → 88% → 90%…と漸増していく。これを「顧客ロイヤルティが育っている」と読むのは、たいてい**誤読**だ。

## 生存者バイアス

shifted-beta-geometric（sBG, Fader & Hardie 2007）の仮定はこうだ：

- 顧客ごとに解約確率 θ は**最初から違う**（θ ~ Beta(α, β)）
- 各人の θ は**時間が経っても変わらない**（各期末に確率 θ で解約）

個人レベルでは誰も「育って」いない。それでもコホートのリテンションは漸増する——**解約しやすい人から先にいなくなる**からだ。残った集団の θ の平均は期を追うごとに下がり、更新率は上がって見える。

```
r(t) = (β + t − 1) / (α + β + t − 1)   ← t とともに単調増加
```

含意は実務的に重い：

1. **リテンション改善施策の効果測定**で、時系列の自然な漸増をベースラインにしないと効果を過大評価する。
2. **線形外挿は破綻する**。「毎年5ptずつ改善している」を将来に伸ばすと100%を超える。sBG は α, β の2パラメータで漸増ごと外挿できる（High End セグメントで7年先まで論文図を再現済み → `packages/sbg/tests`）。
3. **古い顧客ほど価値が高い**。n 期生き残った顧客の残存期待（DERL）は n とともに増える。既存顧客の維持コスト配分はこの構造を前提に。

## 使い方（3行）

```ts
import { fitSbg, survivalCurve, discountedExpectedResidualLifetime } from "@forecast-manifesto/sbg";

const { alpha, beta } = fitSbg([0.869, 0.743, 0.653, 0.593]); // コホート残存率
const future = survivalCurve({ alpha, beta }, 12);            // 12期先まで外挿
const derl = discountedExpectedResidualLifetime({ alpha, beta }, { discount: 0.1, survivedPeriods: 4 });
```

## 非契約型との使い分け

| | 契約型（sbg） | 非契約型（clv） |
|---|---|---|
| 解約 | **観測できる**（解約イベントがある） | 観測できない（買わなくなるだけ） |
| 典型例 | SaaS・サブスク・保険・会費 | EC・小売・アプリ内課金 |
| モデル | shifted-beta-geometric | BG/NBD ＋ Gamma-Gamma |
| 入力 | コホートの期次残存率 | 取引ログ（RFM） |

---

出典：Fader, P.S. & Hardie, B.G.S. (2007) "How to Project Customer Retention", Journal of Interactive Marketing 21(1); 同 (2009) "Customer-Base Valuation in a Contractual Setting"。公知のモデル構造・数式のみを実装し、論文本文の転載はしない。

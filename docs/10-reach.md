# 10. リーチ＆フリークエンシー（到達率と接触頻度）

広告出稿の「延べ何回当てたか（インプレッション）」から、「実際に何人へ届いたか（リーチ）」と「届いた人は平均何回見たか（フリークエンシー）」を、需要予測と同じ NBD で推定する。市場の購買回数と同じ数学血統で、露出回数の分布を扱う。

## 考え方

露出回数が母集団に NBD(M, K) で配分されるとみなす。

```
averageFrequencyAll   = impressions / population = M   … 母集団全体の平均接触頻度
reach                 = 1 - P_0 = 1 - (1 + M/K)^(-K)   … 1 回以上接触した割合
frequencyAmongReached = averageFrequencyAll / reach     … 到達者内の平均頻度
```

`M`（延べ接触の平均）は観測から一意に決まる。分けるのは **`K`（接触の集中度）** だ。`K` が小さいほど一部の人に露出が偏り（リーチは伸びず頻度が上がる）、大きいほど広く薄く届く（リーチが上限 `1 - e^(-M)` に近づく）。reach は `K` に対して単調増加する。

## 使い方

```ts
import { reachFromImpressions } from "@forecast-manifesto/solver";

// (A) 実測リーチがある場合：K を逆算して再現する
const a = reachFromImpressions({
  impressions: 3_000_000,
  population: 1_000_000,
  observedReach: 0.62,
});
// a.method === "identified"、a.reach.point ≈ 0.62、a.K = 逆算値

// (B) 実測が無い場合：K の事前レンジから区間を出す
const b = reachFromImpressions({
  impressions: 3_000_000,
  population: 1_000_000,
  kPrior: { low: 0.5, high: 2 },
});
// b.method === "prior"、b.reach = { point, low, high }
// kPrior が広いほど reach の区間も広い（幅で語る）
```

## 前提と限界

- **単一媒体・単一期間の集約モデル**。クロスメディアの重複除去や逓減する到達曲線の媒体別合成は本モジュールの範囲外（出稿設計の非公開レイヤー）。
- **`K` は入力**。媒体別・出稿別の `K` 実値（ベンチマーク）は同梱しない（→ [05-boundaries.md](./05-boundaries.md)）。必ず実測リーチ（`observedReach`）か事前レンジ（`kPrior`）で与える。既定 `K` は置かない。
- **到達には上限がある**。reach は `1 - e^(-M)` を超えられない。`observedReach` がこの上限以上なら解は無く、`identifyK` が明示的に throw する（黙って数値を返さない）。
- `impressions < population`（`M < 1`）でも正常に扱える（低頻度・低リーチの状況）。

## 実務導線

- **試したい** → [Marketing-OS](https://marketing-os.jp/lp/) で Web から
- **頼みたい** → [Start-X 顧問サービス](https://start-x.work/service/)：媒体別 `K` のベンチマーク・クロスメディア設計・個社の出稿最適化

---

出典：NBD（負の二項分布）を露出回数に当てはめるリーチ／フリークエンシー・モデルは、購買行動と同じ公知のモデル構造（[03-nbd-model.md](./03-nbd-model.md) 参照：Ehrenberg 1959/1988）に基づく。区間はブートストラップ／事前レンジによる（[08-uncertainty.md](./08-uncertainty.md)）。媒体別 `K` 実値・出稿設計は Start-X の非公開レイヤーで、公知のモデル構造・数式のみを実装し、原著本文の転載はしない。

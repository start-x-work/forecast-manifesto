# 11. 価格受容 — Van Westendorp と公開可能な価格調整

ユニットシェアの `priceAdj`（docs/04）は乗数である。業界別の実係数は非公開（docs/05）。公開するのは、調査4問から交点を取る方法と、**呼び出し側が弾力性を渡したとき**の相対価格乗数だけである。

## 理論（Van Westendorp PSM）

各回答者に4つの価格を聞く。

- 安すぎて品質が疑わしい（tooCheap）
- 安い（cheap）
- 高い（expensive）
- 高すぎて買わない（tooExpensive）

単調性 `tooCheap ≤ cheap ≤ expensive ≤ tooExpensive` を満たさない票は除外する。累積曲線の交点が IPP / OPP / PMC / PME。受容レンジは PMC–PME。

## 公開可能な価格調整

```
priceAdj = (reference / observed) ** elasticity
```

`reference` は OPP など調査から得た基準価格。`elasticity` は呼び出し側が渡す。ここに業界別の実測係数は埋め込まない。

## 前提と限界

- PSM は選好の表明であり、実際の購買ではない。
- 交点は格子上の最近接点。回答が粗いと交点も粗い。
- Branding-OS の価格軸は、本モジュールの出口を自己申告に言い換えたもの。

```ts
import { vanWestendorp, priceAdjustmentFromRelative } from "@forecast-manifesto/price";

const psm = vanWestendorp(responses);
const adj = priceAdjustmentFromRelative(observed, psm.opp, elasticity);
```

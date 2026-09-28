# 12. 価格受容 — Van Westendorp PSM と公開可能な価格調整

ユニットシェアの `priceAdj`（[04](./04-bp10.md)）は乗数である。業界別の実係数は非公開（[05](./05-boundaries.md)）。公開するのは、調査4問から交点を取る方法と、**呼び出し側が弾力性を渡したとき**の相対価格乗数だけである。

## 理論（Van Westendorp PSM）

各回答者に4つの価格を聞く。

- 安すぎて品質が疑わしい（tooCheap）
- 安い（cheap）
- 高い（expensive）
- 高すぎて買わない（tooExpensive）

単調性 `tooCheap ≤ cheap ≤ expensive ≤ tooExpensive` を満たさない票は除外する。累積曲線の交点が IPP / OPP / PMC / PME。受容レンジは PMC–PME。

| 交点 | 本実装で使う2曲線 |
|---|---|
| OPP（最適価格点） | 安すぎ ∩ 高すぎ |
| IPP（無差別価格点） | 安い ∩ 高い |
| PMC（限界的安さ） | 安すぎ ∩ 高い |
| PME（限界的高さ） | 安い ∩ 高すぎ |

原著は PMC・PME を「安くない（= 1 − 安い）」「高くない（= 1 − 高い）」の補曲線との交点で定義する。本実装は実務で広く使われる「高い」「安い」曲線との交点を採る。両者は一般に一致しないため、他の集計と比べるときは定義をそろえること。

## 公開可能な価格調整

```
priceAdj = (reference / observed) ** elasticity
```

`reference` は OPP など調査から得た基準価格。`elasticity` は呼び出し側が渡す（定弾力性の公知の関数形）。ここに業界別の実測係数は埋め込まない。既定値も置かない。

## 前提と限界

- PSM は選好の表明であり、実際の購買ではない（意向-行動ギャップは [04](./04-bp10.md)）。
- 交点は格子（回答に現れた価格）上の最近接点。回答が粗いと交点も粗い。2曲線が区間で重なる（差が 0 の格子点が複数ある）ときは、その最安値を返す。
- 診断サービス側の価格軸は、本モジュールの出口を自己申告に言い換えたもの。

```ts
import { vanWestendorp, priceAdjustmentFromRelative } from "@forecast-manifesto/price";

const psm = vanWestendorp(responses);
const adj = priceAdjustmentFromRelative(observed, psm.opp, elasticity);
```

---

出典：Van Westendorp, P.H. (1976) "NSS Price Sensitivity Meter (PSM) — A New Approach to study Consumer-Perception of Prices", Proceedings of the 29th ESOMAR Congress, Venice, 139-167。4問の設問構造と交点の定義は同論文に基づき、交点の組み合わせ（上表）・格子上の交点探索・相対価格乗数の関数形の選択は Start-X による実装。公知の手法・数式のみを実装し、論文本文の転載はしない。

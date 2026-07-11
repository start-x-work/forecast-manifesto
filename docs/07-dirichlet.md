# 07. 多ブランド市場構造 — デリシュレー NBD

A1（市場の NBD）はカテゴリ全体の需要を記述した。デリシュレー NBD（Goodhardt, Ehrenberg & Chatfield 1984）はその完成形——**カテゴリ×ブランドの同時構造**を記述する。カテゴリを何回買うか（NBD）と、その中でどのブランドを選ぶか（Dirichlet）を、わずか3種のパラメータで貫く。

```
カテゴリ購買回数  n  ~ NBD(M, K)          ← A1 と同じ
ブランド選択     r_j | n ~ Beta-Binomial(n, α_j, S−α_j)
                 α_j = S × marketShare_j
```

- **M, K**：カテゴリの平均購買回数と集中度（A1 の同じパラメータ）
- **S**：ブランド選好の集中度。小さいほど「決め打ち買い」、大きいほどスイッチングが激しい

## ダブルジェパディ — 小さなブランドは二重に苦しむ

モデルから機械的に導かれる最重要パターン。シェアの小さいブランドは、

1. **買う人が少ない**（浸透率が低い）
2. **その少ない買い手すら、買う頻度が低い**（購買頻度も低い）

つまり「小さいが熱狂的なファンに支えられたブランド」は、繰り返し購買される消費財市場では構造的に例外である。ロイヤルティ（購買頻度・SCR・100%ロイヤル率）はシェアの**従属変数**であり、シェアを動かさずにロイヤルティだけを引き上げる施策は、この構造に逆らうことになる。

```ts
import { fitDirichlet, doubleJeopardyTable } from "@forecast-manifesto/dirichlet";

const model = fitDirichlet({
  categoryPenetration: 0.56,
  categoryBuyRate: 2.6,
  brands: [
    { name: "A", marketShare: 0.25, observedPenetration: 0.20 },
    { name: "B", marketShare: 0.08, observedPenetration: 0.07 },
    // …
  ],
});
doubleJeopardyTable(model); // シェア昇順に浸透率と頻度が並んで上がる＝DJ線
```

## 購買重複の法則 — 顧客は「共有」されている

ブランド j の買い手のうち、ブランド k も買う人の割合（重複率）は、**k が何であるかにほぼ依存せず、j のシェア（浸透率）にほぼ比例する**。

```ts
import { duplicationMatrix } from "@forecast-manifesto/dirichlet";
const D = duplicationMatrix(model); // D[j][k] = P(j も買う | k の買い手)
```

行 j の値が k に依らずほぼ一定になることを確認できる。含意：**競合の顧客はあなたの顧客でもある**。「独自のポジショニングで別の顧客層を持つ」という言説は、購買データ上はめったに観測されない。

## brandMetrics が返すもの

| 指標 | 意味 |
|---|---|
| `penetration` | 理論ブランド浸透率 |
| `buyRate` | ブランド購買者あたりの購買回数 w = M·share / b |
| `scr` | Share of Category Requirements（買い手のカテゴリ需要のうち自ブランド比率） |
| `soleBuyerRate` | 100% ロイヤル比率（カテゴリ購買を全部このブランドに振った人） |

## 同定に必要な入力

パネル・POS の集計値だけでよい（個票不要）：

1. カテゴリ浸透率・カテゴリ購買者の平均購買回数 → M, K（A1 の identifyK と同一の方程式）
2. ブランド別シェア＋観測浸透率 → S（ブランド別に解いてシェア加重平均）

検証は R `NBDdirichlet` 同梱の歯磨き粉市場（UK 1973Q1）で実施済み——公表パラメータ M=1.456, K=0.78, S=1.55 と buy テーブルを再現（`packages/dirichlet/tests`）。シェア合計が 1 未満の入力は「モデル化していないその他ブランド」として自然に扱われる。

## 限界と、A3（記憶構造）への橋

デリシュレーが記述するのは**定常状態**の構造だ。広告・配荷・値引きが「なぜ」シェアを動かすのかは説明しない——シェアが動いた後の世界がまたデリシュレーに従う、と言うだけである。シェアそのものを動かす力学（想起集合・カテゴリーエントリーポイント・記憶構造）は次のレンズ A3 の領域であり、本モジュールはそのための「動かなかった場合のベースライン」を提供する。

---

出典：Goodhardt, G.J., Ehrenberg, A.S.C., Chatfield, C. (1984) "The Dirichlet: A Comprehensive Model of Buying Behaviour", JRSS A 147(5), 621-655。公知のモデル構造・数式のみを実装し、原著本文の転載はしない。R `NBDdirichlet`（GPL）はアルゴリズム仕様の参照のみで、コードは TypeScript による独立実装。

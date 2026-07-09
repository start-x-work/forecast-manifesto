# 03. NBD モデル解説

NBD（Negative Binomial Distribution / 負の二項分布）は、一定期間における消費者一人あたりの購入回数 `r` の分布を記述する。

## 確率質量関数

```
P_r = (1 + M/K)^(-K) · Γ(K+r) / (Γ(r+1)·Γ(K)) · (M/(M+K))^r
```

| 記号 | 意味 |
|------|------|
| `P_r` | 期間内に `r` 回購入する確率 |
| `M`   | 一人あたり平均購入回数（母集団平均） |
| `K`   | 形状パラメータ（購入の集中度） |
| `Γ`   | ガンマ関数 |

実装（[`packages/solver/src/nbd.ts`](../packages/solver/src/nbd.ts)）では Γ 比を直接計算するとオーバーフローするため、`lnGamma`（Lanczos 近似）で対数空間に移して計算する。

## M と K の意味

- **M（平均購入回数）**：市場全体で「一人が平均何回買うか」。カテゴリの需要の厚みを表す。
- **K（集中度）**：小さいほど購入がヘビーユーザーに偏る（少数が大量に買う）。大きいほど購入が均され、購入者が広く薄く分布する。

同じ M でも K が違えば市場の姿は変わる。K が需要を「垂直（頻度）／水平（間口）」どちらに伸ばせるかを示す。

## 浸透率との関係

`r = 0`（非購入）の確率が、浸透率の補数になる。

```
P_0 = (1 + M/K)^(-K) = 1 - penetration
```

ここから重要な帰結——**浸透率には理論上限がある**。

```
K → 0   のとき P_0 → 1        （penetration → 0）
K → ∞   のとき P_0 → e^(-M)   （penetration → 1 - e^(-M)）
```

つまり平均購入回数 M で決まる浸透率の天井は `1 - e^(-M)`。これを超える浸透率は、どんな K でも実現できない。市場の間口には物理的な上限があるということだ。

## K の同定手順

観測できるのは通常 `M`（平均購入回数）と `penetration`（浸透率）。ここから `K` を逆算する。

```
(1 + M/K)^(-K) = 1 - penetration  を K について解く
```

`P_0(K)` は K に対して単調減少なので、区間 `[1e-6, 1e6]` で確実に解ける。実装（[`identify.ts`](../packages/solver/src/identify.ts)）は**安全化 Newton 法**（Newton-Raphson ＋ 二分法フォールバック）を使う：

1. Newton ステップが区間内かつ収束が速ければ Newton で進む。
2. 区間外に出る／収束が遅ければ二分法に切り替える。
3. 収束判定 `|f| < 1e-10`、最大 200 反復。
4. `penetration ≥ 1 - e^(-M)` など**解を持たない入力は明示的に throw** する。

```ts
import { identifyK } from "@forecast-manifesto/solver";

const M = 1372 / 279812;              // 平均購入回数
const penetration = 0.004875;         // 観測浸透率
const { K, iterations } = identifyK(M, penetration);
// → K ≈ 0.75
```

再現例：[`examples/k-identification.ts`](../examples/k-identification.ts)

## 四半期ごとの再同定

K は一度求めて終わりではない。四半期ごとに再同定し、変化を市場構造のシグナルとして読む。→ [02-method-selection.md](./02-method-selection.md) の「ハイブリッド運用ルール」を参照。

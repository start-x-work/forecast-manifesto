# Forecast Manifesto

**需要予測の意思決定構造を、編集可能な素材として公開する。点ではなく、幅で語る。**

Marketing-OS Manifesto に続く「設計と編集」シリーズ第 2 弾（需要予測編）。数理モデル（NBD ＋ BP-10）による需要予測の**計算方法**と**メソッド選定の考え方**を OSS として公開する。

森岡毅・今西聖貴『確率思考の戦略論』（KADOKAWA）のメソッドに基づく実装。公知の数式・モデル構造のみを実装し、書籍本文の転載はしない。

---

## スタック：市場 → 顧客を同一の数学血統で貫く

```
A1  市場の NBD ✅ 公開済         A2  顧客の NBD ✅ 追加
    @forecast-manifesto/solver       @forecast-manifesto/clv
    NBD ＋ BP-10                       BG/NBD ＋ Gamma-Gamma
    浸透率・売上の天井                 生存・期待購買・CLV
        │                                  │
        └────── 同じ負の二項分布 ──────────┘
        森岡（市場の NBD）→ Schmittlein/Fader（顧客の NBD）
```

market（solver）で「市場に何回買う人がどれだけいるか」を、customer（clv）で「この顧客が今後何回・いくら買うか」を、**同じ分布**で扱う。→ [docs/05b-clv.md](./docs/05b-clv.md)

---

## 3 層構造：どこまでが無料で、どこからが支援か

```
┌─ 公開層（本リポジトリ｜OSS）───────────────────────┐
│  ソルバー実装・BP-10 テンプレ・メソッド選定決定木・思想        │
└──────────┬──────────────────┬──────────────┘
           ↓ 参照                    ↓ 参照
┌─ 診断ツール層 ─────┐   ┌─ サービス層（非公開）──────────┐
│ Marketing-OS         │   │ 顧問デリバラブル：                    │
│ 需要予測構造診断      │   │   業界別ベンチマーク K 値            │
│ = ソルバーの Web 版  │   │   Price Adjustment 実係数・個社予測  │
│                      │   │   外部データパイプライン              │
└──────────────┘   └──────────────────────────┘
```

- **公開する**：計算方法・選定の考え方（コモディティ化してよい知識）
- **公開しない**：顧問先データで蓄積するベンチマーク・係数・パイプライン（競争力の源泉）

詳細な線引き宣言：[docs/05-boundaries.md](./docs/05-boundaries.md)

---

## クイックスタート

```bash
npm install @forecast-manifesto/solver
```

観測された平均購入回数 `M` と浸透率 `penetration` から、NBD の形状パラメータ `K` を同定する：

```ts
import { identifyK } from "@forecast-manifesto/solver";

const { K } = identifyK(1372 / 279812, 0.004875);
console.log(K); // ≈ 0.75
```

新商品の売上予測（BP-10 → ユニットシェア → 売上）：

```ts
import { conceptShare, unitShare, forecastRevenue } from "@forecast-manifesto/solver";

const cs = conceptShare([[4, 3, 3], [6, 2, 2], [3, 4, 3]]); // BP-10 集計
const share = unitShare(0.6, 0.7, cs, 1.0);                 // 認知×配荷×CS×価格調整
const revenue = forecastRevenue(2_000_000, share, 480);     // 市場規模×シェア×単価
```

顧客生涯価値（CLV）— 取引ログから BG/NBD ＋ Gamma-Gamma で個客価値を出す：

```ts
import { toRfm, fitBgNbd, fitGammaGamma, clv } from "@forecast-manifesto/clv";

const rfm = toRfm(transactions, observationEnd);   // 取引ログ → RFM
const [p, gg] = [fitBgNbd(rfm), fitGammaGamma(rfm)]; // 生存・頻度／金額
const value = clv(rfm[0], p, gg, { horizonMonths: 12, monthlyDiscount: 0.01, margin: 0.3 });
```

### 幅で語る — 点推定に区間を付ける

```ts
import { identifyKWithInterval } from "@forecast-manifesto/solver";

const { K, ci } = identifyKWithInterval(1.4, 0.5461, { nCustomers: 2000 });
console.log(K, ci); // 0.75, [0.68, 0.83] — 母数 2,000 人ならこの幅がある
```

パラメトリック・ブートストラップ（シード固定・再現可能）。`fitBgNbdWithInterval` / `clvWithInterval` / `summarizeWithInterval` も同様。→ [docs/08-uncertainty.md](./docs/08-uncertainty.md)

### 検証する — 予測を当てるゲームにしない

```ts
import { splitCalibrationHoldout, trackingCumulative } from "@forecast-manifesto/validate";

const { calibration, holdout } = splitCalibrationHoldout(transactions, splitDate, observationEnd);
const track = trackingCumulative(calibration, transactions, fitBgNbd(calibration), { splitDate, observationEnd, bucket: "week" });
```

CDNOW 公開データで較正39週→検証39週の外挿誤差 4.1%（最終累積）を再現済み。

実行できる例：[`examples/`](./examples)

---

## ドキュメント（読了 15 分）

| # | 内容 |
|---|------|
| [01](./docs/01-philosophy.md) | なぜ数理 × AI のハイブリッドか |
| [02](./docs/02-method-selection.md) | メソッド選定の決定木 |
| [03](./docs/03-nbd-model.md) | NBD モデル解説（M・K の意味、同定手順） |
| [04](./docs/04-bp10.md) | BP-10 設問テンプレート＋集計方法 |
| [05](./docs/05-boundaries.md) | 公開/非公開の線引き宣言 |
| [05b](./docs/05b-clv.md) | 顧客資産の思想（NBD の家系図：森岡 → Fader） |
| [08](./docs/08-uncertainty.md) | 不確実性の定量化（点ではなく、幅で語る） |

---

## パッケージ：`@forecast-manifesto/solver`

| 関数 | 役割 |
|------|------|
| `nbdPmf(r, M, K)` | NBD 確率質量関数 `P_r` |
| `identifyK(M, penetration, opts?)` | K 同定（安全化 Newton 法） |
| `zeroPurchaseProbability(M, K)` / `penetrationFromK(M, K)` | 非購入率／浸透率 |
| `conceptShare(votes, targetIndex?)` | BP-10 コンセプトシェア集計 |
| `unitShare(awareness, distribution, conceptShare, priceAdj)` | ユニットシェア |
| `forecastRevenue(marketSize, unitShare, unitPrice)` | 売上予測 |

## パッケージ：`@forecast-manifesto/clv`

| 関数 | 役割 |
|------|------|
| `toRfm(transactions, observationEnd, opts?)` | 取引ログ → 顧客別 RFM |
| `fitBgNbd(rfm, opts?)` | BG/NBD 最尤推定（頻度・生存） |
| `probAlive(c, p)` / `expectedTransactions(t, c, p)` | 生存確率／期待購買回数 |
| `fitGammaGamma(rfm, opts?)` / `expectedAvgValue(c, gg)` | 金額モデル（独立性チェック付き） |
| `clv(c, p, gg, opts)` | CLV（割引現在価値） |
| `summarize(rfm, p, gg)` | 診断サマリ（生存率・集中度・セグメント） |
| `fitTruncatedNbd(m, repeatRate, opts?)` | ゼロ切断 NBD：購入者の平均回数とリピート率から (M, K) を同定 |
| `truncatedNbdDistribution(M, K, n)` / `expectedNextPeriodPurchases(r, M, K)` | P(r \| r≥1)／翌年期待購買回数（逓減込み） |
| `topBuyersRevenueShare(M, K, topFraction?)` | 上位 20% 購入者の売上集中度 |

CDNOW 公開データで Fader-Hardie-Lee (2005) の公表値を許容誤差 1e-2 で再現（`packages/clv/tests`）。

## パッケージ：`@forecast-manifesto/validate`

| 関数 | 役割 |
|------|------|
| `splitCalibrationHoldout(transactions, splitDate, observationEnd)` | 較正／検証分割 |
| `conditionalExpectationByFrequency(calib, holdout, params, opts?)` | 頻度別 実測 vs 予測 |
| `trackingCumulative(calib, transactions, params, opts)` | 累積トラッキング（FHL 2005 Figure 3 方式） |
| `mae(pairs)` / `rmse(pairs)` / `mape(pairs)` | 誤差指標（`mape` は actual=0 を除外） |

不確実性 API：`identifyKWithInterval`（solver）／`fitBgNbdWithInterval`・`clvWithInterval`・`summarizeWithInterval`（clv）→ [docs/08](./docs/08-uncertainty.md)

---

## 試す / 頼む

- **試したい** → [Marketing-OS 需要予測構造診断・顧客資産診断](https://marketing-os.jp/lp/)（Web でソルバー／clv を動かす）
- **頼みたい** → [Start-X 需要予測・事業シミュレーション](https://start-x.work/service/)（非公開資産で回す実務）

---

## 開発

```bash
npm install       # ワークスペース依存の導入
npm run build     # solver → clv をビルド
npm test          # Vitest（全ワークスペース）
npm run example:k         # K 同定の実例
npm run example:forecast  # 新商品売上予測の実例
npm run example:clv       # 顧客資産（RFM → BG/NBD → CLV）の実例
npm run example:validate  # 検証レポート（CDNOW 較正/検証）の実例
npm run example:interval  # 「幅で語る」不確実性の実例
```

---

## English summary

**Forecast Manifesto** publishes the *decision structure* of demand forecasting as an editable material. It open-sources the calculation methods (NBD + BP-10) and the method-selection reasoning behind demand forecasting — the second entry in the "design & edit" series after Marketing-OS Manifesto.

It is an implementation of the methodology in *確率思考の戦略論* (Morioka & Imanishi, KADOKAWA). Only publicly known formulas and model structures are implemented; no book text is reproduced.

- **Open** (this repo): solver, BP-10 template, method-selection decision tree, philosophy — knowledge that is fine to commoditize.
- **Not open** (advisory deliverables): industry benchmark K values, real Price-Adjustment coefficients, per-company forecasts, external data pipelines — the competitive edge accumulated from client data.

```bash
npm install @forecast-manifesto/solver
```

```ts
import { identifyK } from "@forecast-manifesto/solver";
const { K } = identifyK(1372 / 279812, 0.004875); // ≈ 0.75
```

---

## License

Apache-2.0 — Marketing-OS エコシステムと同一。詳細は [LICENSE](./LICENSE) / [NOTICE](./NOTICE)。

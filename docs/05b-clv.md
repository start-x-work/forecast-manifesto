# 05b. 顧客資産の思想 — NBD の家系図（市場 → 顧客）

Forecast Manifesto の第 1 弾（solver）は**市場**の NBD だった。この clv モジュールは同じ分布を**顧客**に適用する。市場と顧客は、同じ数学の血統でつながっている。

## 1. NBD の家系図

```
市場の NBD
   M・K で「市場全体」の購入回数分布を記述
        │  同じ負の二項分布を、集団から個へ
        ▼
Schmittlein / Fader（顧客の NBD）
   Pareto/NBD → BG/NBD で「一人ひとり」の購入と離反を記述
```

市場の需要が NBD に従うなら、その市場を構成する顧客一人ひとりの購買も同じ família の分布で書ける。solver の `nbdPmf` が「市場に r 回買う人がどれだけいるか」を与えたのと同じ発想で、BG/NBD は「この顧客が今後 t 期間に何回買うか」を与える。**同じ分布が市場と顧客を貫く。**

- **市場の NBD**（solver）：M（平均購入回数）・K（集中度）→ 浸透率・売上の天井
- **顧客の NBD**（clv）：r, α（購買率の分布）・a, b（離反の分布）→ 生存・期待購買・CLV

## 2. 平均値 LTV の何が問題か

よくある LTV = 単価 × 購入頻度 × 継続期間。これは二つの誤りを抱える。

1. **生存を無視する**：離反はモデル化されず、「継続期間」を外から決め打ちする。実際には顧客ごとに「まだ生きているか」の確率が違う。
2. **全顧客を一律に扱う**：平均で全員を代表させると、上位が生む価値と休眠客の価値が混ざる。意思決定に使えない。

BG/NBD ＋ Gamma-Gamma は、この二つを個票の確率として分解する。

## 3. 4 つの問いに答える

| 問い | 関数 | モデル |
|------|------|--------|
| 誰が生きているか | `probAlive(c, p)` | BG/NBD |
| 次の 12 ヶ月で何回買うか | `expectedTransactions(t, c, p)` | BG/NBD |
| 1 回いくら生むか | `expectedAvgValue(c, gg)` | Gamma-Gamma |
| どこに集中しているか | `summarize(rfm, p, gg).top20RevenueShare` | 合成 |

そして CLV（割引現在価値）はこれらの合成：

```
CLV = Σ_{月 i}  M · margin · (E[Y(t_i)] − E[Y(t_{i-1})]) / (1 + d)^i
```

```ts
import { toRfm, fitBgNbd, fitGammaGamma, clv, summarize } from "@forecast-manifesto/clv";

const rfm = toRfm(transactions, observationEnd);        // 取引ログ → RFM
const p = fitBgNbd(rfm);                                // 生存・頻度
const gg = fitGammaGamma(rfm);                          // 金額
const value = clv(rfm[0], p, gg, { horizonMonths: 12, monthlyDiscount: 0.01, margin: 0.3 });
const report = summarize(rfm, p, gg);                   // 診断サマリ
```

### 推定の妥当性
- パラメータは CDNOW 公開データ（Fader-Hardie-Lee 2005）で検証済み：`fitBgNbd` は公表値 r≈0.243, α≈4.414, a≈0.793, b≈2.426 を、`fitGammaGamma` は p≈6.25, q≈3.74, γ≈15.44 を許容誤差 1e-2 で再現する（`packages/clv/tests`）。
- Gamma-Gamma は**頻度と金額の独立**を仮定する。`fitGammaGamma` は相関をチェックし、強い場合に警告する。

## 3.5. 区間つき LTV（コホート平均の幅）

点で LTV を語ると、投資判断が幅を失う。`clvCohortWithInterval` はコホートの**1 顧客あたり平均 CLV** に、パラメトリック・ブートストラップで区間を付す。点推定は各顧客 `clv()` の平均に一致し（売上ベース、`margin` を掛ければ利益ベースの `grossProfitPerCustomer` も返す）、推定パラメータどおりに同数コホートを再生成して再推定を繰り返し、平均 CLV のばらつきを分位点区間にする。

```ts
import { clvCohortWithInterval, toRfm } from "@forecast-manifesto/clv";

const rfm = toRfm(transactions, observationEnd);
const r = clvCohortWithInterval(
  { rfm, horizonMonths: 12, monthlyDiscount: 0.01, margin: 0.3 },
  { iterations: 200, seed: 1 },
);
// r.perCustomerMean = { point, low, high }（売上ベース）
// r.grossProfitPerCustomer = { point, low, high }（margin 適用時のみ）
// r.warnings … 妥当性の注意（下記）
```

**幅は母数で決まる**：顧客数が少ないほど再推定のばらつきが大きく、区間は広がる。だから幅が広いうちは「点」で意思決定しない。同一入力＋同一 `seed` で結果は完全に再現する（依存ゼロ）。

**回す前の誠実**：次のとき `warnings` で通知する——(1) 顧客数が 300 未満で区間が過小評価になりうる、(2) 予測期間が観測窓（最大 T）を超える外挿、(3) 頻度×金額の相関が強く Gamma-Gamma の独立仮定が崩れている。フルベイズ（事後分布）が要る場合は [PyMC-Marketing](https://github.com/pymc-labs/pymc-marketing) を参照（→ [08-uncertainty.md](./08-uncertainty.md)）。

> 命名注記：個客単位のモンテカルロ区間は別関数 `clvWithInterval`（[`bootstrap.ts`](../packages/clv/src/bootstrap.ts)）で提供している。コホート平均版は後方互換のため `clvCohortWithInterval` として公開する。

## 4. 限界の明記（スコープ）

このモデルは**非契約型・連続時間**が前提だ。顧客がいつ離反したかを直接は観測できず（「解約ボタン」がない）、購買間隔から確率的に推定する——EC・小売・アプリ内課金などが該当する。

**契約型（サブスク）は別系**。解約が観測できるサブスクリプションでは shifted-beta-geometric（sBG）が適切で、[`@forecast-manifesto/sbg`](./09-sbg.md) として提供している（使い分け表も同ページ）。ベイズ推定（MCMC）による事後分布が必要な場合は [PyMC-Marketing](https://github.com/pymc-labs/pymc-marketing) を参照。

## 5. 実務導線

- **試したい（簡易版）** → [Marketing-OS 需要予測構造診断・顧客資産診断（第9弾）](https://marketing-os.jp/lp/)で Web から
- **頼みたい（個票分析）** → [Start-X 顧問サービス](https://start-x.work/service/)：業界別ベンチマーク・外部データ連携・個社の CLV 運用

公開するのは計算方法（このモジュール）まで。業界別ベンチマーク係数・個社予測・データパイプラインは非公開資産（→ [05-boundaries.md](./05-boundaries.md)）。

---

出典：Schmittlein, Morrison & Colombo (1987); Fader, Hardie & Lee (2005) "Counting Your Customers the Easy Way"; Fader & Hardie (Gamma-Gamma note)。公知のモデル構造・数式のみを実装し、原著本文の転載はしない。

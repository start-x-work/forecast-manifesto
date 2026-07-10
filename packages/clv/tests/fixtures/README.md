# CDNOW フィクスチャ

`cdnow_rfm.json` は、公開データセット **CDNOW**（Fader, Hardie & Lee 2005 が用いた
1/10 系統サンプル、2,357 顧客）から派生した RFM サマリです。

- **元データ**：`CDNOW_sample.txt`（`origId sampleId date qty amount`）。学術用途の公開データ。
- **キャリブレーション**：1997-01-01 〜 1997-09-30（39 週）
- **各行**：`{ customerId, frequency, recency, T, monetary }`（時間単位＝週）
- **生成**：`packages/clv/scripts/derive-cdnow.ts`（元データはリポジトリに含めない）

このフィクスチャで `fitBgNbd` を推定すると、公表値
**r≈0.243, α≈4.414, a≈0.793, b≈2.426**（BG/NBD）および
**p≈6.25, q≈3.74, γ≈15.44**（Gamma-Gamma, Hardie ノート）を許容誤差 1e-2 で再現します。

> 非公開資産（顧問先データ・ベンチマーク係数）は一切含みません。CDNOW は公知の学術ベンチマークです。

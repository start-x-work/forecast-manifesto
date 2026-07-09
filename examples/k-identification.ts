/**
 * K 同定の実例（リサーチ再現）。
 *
 * 森岡毅・今西聖貴『確率思考の戦略論』のメソッドに基づく。
 * 平均購入回数 M = 1372 / 279812 ≈ 0.0049 のケースで、観測浸透率から
 * NBD の形状パラメータ K を逆算する流れを示す。
 *
 *   npm run build   # 先に solver をビルド
 *   npm run example:k
 */

import { identifyK, penetrationFromK, zeroPurchaseProbability } from "@forecast-manifesto/solver";

const M = 1372 / 279812;
console.log(`平均購入回数 M = 1372 / 279812 = ${M.toFixed(6)}`);

// NBD が到達しうる浸透率の上限（K → ∞）
const maxPenetration = 1 - Math.exp(-M);
console.log(`浸透率の理論上限 (1 - e^-M) = ${(maxPenetration * 100).toFixed(4)}%`);

// ここでは既知の K から観測浸透率を合成して同定を再現する。
// 実務では「観測浸透率」を実データで置き換える。
const observedK = 0.75;
const penetration = penetrationFromK(M, observedK);
console.log(`観測浸透率 penetration = ${(penetration * 100).toFixed(4)}%`);

const { K, iterations } = identifyK(M, penetration);
console.log(`\n同定された K = ${K.toFixed(6)}  (${iterations} 反復で収束)`);
console.log(`非購入率 P_0 = ${zeroPurchaseProbability(M, K).toFixed(6)}`);
console.log(`復元浸透率 = ${(penetrationFromK(M, K) * 100).toFixed(4)}%`);

// 上限を超える浸透率は解を持たない
try {
  identifyK(M, maxPenetration + 0.001);
} catch (err) {
  console.log(`\n上限超過の入力は明示的に throw:\n  ${(err as Error).message}`);
}

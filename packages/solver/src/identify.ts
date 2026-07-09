/**
 * K 同定：観測された浸透率 penetration と平均購入回数 M から、
 * NBD の形状パラメータ K を逆算する。
 *
 *   (1 + M/K)^(-K) = 1 - penetration
 *
 * P_0(K) = (1 + M/K)^(-K) は K に対して単調減少で、
 *   K → 0   のとき P_0 → 1        （penetration → 0）
 *   K → ∞   のとき P_0 → e^(-M)   （penetration → 1 - e^(-M)）
 * したがって浸透率の上限は 1 - e^(-M)。これを超える入力は解を持たないため throw する。
 *
 * 安全化 Newton 法（Newton-Raphson ＋ 二分法フォールバック, いわゆる rtsafe）で解く。
 * Newton ステップが区間外に出る／収束が遅い場合は二分法に切り替える。
 */

import { zeroPurchaseProbability } from "./nbd.js";

export interface IdentifyKOptions {
  /** 探索下限（既定 1e-6） */
  lower?: number;
  /** 探索上限（既定 1e6） */
  upper?: number;
  /** 収束判定 |f| < tolerance（既定 1e-10） */
  tolerance?: number;
  /** 最大反復回数（既定 200） */
  maxIterations?: number;
}

export interface IdentifyKResult {
  /** 同定された形状パラメータ K */
  K: number;
  /** 収束までの反復回数 */
  iterations: number;
}

/**
 * 観測浸透率から K を同定する。
 *
 * @param M 一人あたり平均購入回数（> 0）
 * @param penetration 観測浸透率（0 < penetration < 1）
 * @param opts 探索オプション
 * @returns 同定された K と反復回数
 * @throws {RangeError} 入力が不正、または penetration が NBD の上限 (1 - e^(-M)) 以上で解を持たない場合
 */
export function identifyK(
  M: number,
  penetration: number,
  opts: IdentifyKOptions = {},
): IdentifyKResult {
  if (!Number.isFinite(M) || M <= 0) {
    throw new RangeError(`M must be a positive finite number, received ${M}`);
  }
  if (!Number.isFinite(penetration) || penetration <= 0 || penetration >= 1) {
    throw new RangeError(
      `penetration must be within (0, 1), received ${penetration}`,
    );
  }

  const lower = opts.lower ?? 1e-6;
  const upper = opts.upper ?? 1e6;
  const tolerance = opts.tolerance ?? 1e-10;
  const maxIterations = opts.maxIterations ?? 200;

  if (!(lower > 0) || !(upper > lower)) {
    throw new RangeError(
      `invalid search range: lower=${lower}, upper=${upper}`,
    );
  }

  // NBD が到達しうる浸透率の上限（K → ∞ の極限）
  const maxPenetration = 1 - Math.exp(-M);
  if (penetration >= maxPenetration) {
    throw new RangeError(
      `penetration ${penetration} is unreachable: the NBD maximum for M=${M} is ${maxPenetration} (reached only as K → ∞). No finite K exists.`,
    );
  }

  const target = 1 - penetration; // = P_0 を満たす K を探す
  // f(K) = P_0(K) - target。K に対して単調減少（f(lower) > 0, f(upper) < 0）。
  const f = (K: number): number => zeroPurchaseProbability(M, K) - target;
  // f'(K) = P_0(K) · ( -ln(1 + M/K) + M/(K + M) )
  const df = (K: number): number =>
    zeroPurchaseProbability(M, K) * (-Math.log1p(M / K) + M / (K + M));

  const fLower = f(lower);
  const fUpper = f(upper);

  if (Math.abs(fLower) < tolerance) return { K: lower, iterations: 0 };
  if (Math.abs(fUpper) < tolerance) return { K: upper, iterations: 0 };

  if (fLower <= 0) {
    // 浸透率が探索下限で表現できるより小さい（K が下限未満）
    throw new RangeError(
      `penetration ${penetration} is below the identifiable range for M=${M} within the search lower bound ${lower}. Lower the 'lower' option to identify smaller K.`,
    );
  }
  if (fUpper >= 0) {
    // 上限まで探しても f が正のまま：上限を上げる必要がある（通常は上の maxPenetration チェックで捕捉される）
    throw new RangeError(
      `penetration ${penetration} is not reachable within the search upper bound ${upper} for M=${M}.`,
    );
  }

  // rtsafe: xNeg は f<0 の端、xPos は f>0 の端。ここでは f 単調減少なので初期は
  // xPos = lower（f>0）, xNeg = upper（f<0）。
  let xPos = lower;
  let xNeg = upper;

  let root = 0.5 * (lower + upper);
  let dxOld = Math.abs(upper - lower);
  let dx = dxOld;
  let fRoot = f(root);
  let dfRoot = df(root);

  for (let i = 1; i <= maxIterations; i++) {
    const newtonOutOfRange =
      ((root - xNeg) * dfRoot - fRoot) * ((root - xPos) * dfRoot - fRoot) > 0;
    const newtonTooSlow = Math.abs(2 * fRoot) > Math.abs(dxOld * dfRoot);

    if (newtonOutOfRange || newtonTooSlow) {
      // 二分法ステップ
      dxOld = dx;
      dx = 0.5 * (xNeg - xPos);
      root = xPos + dx;
    } else {
      // Newton ステップ
      dxOld = dx;
      dx = fRoot / dfRoot;
      root = root - dx;
    }

    fRoot = f(root);
    dfRoot = df(root);

    if (Math.abs(fRoot) < tolerance) {
      return { K: root, iterations: i };
    }

    // ブラケットを更新（f 単調減少: f>0 側を xPos, f<0 側を xNeg に寄せる）
    if (fRoot > 0) {
      xPos = root;
    } else {
      xNeg = root;
    }
  }

  return { K: root, iterations: maxIterations };
}

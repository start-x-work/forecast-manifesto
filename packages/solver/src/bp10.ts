/**
 * BP-10（Buying Preference / 10 点配分法）の集計。
 *
 * 各回答者は 10 票（ポイント）を候補ブランド／コンセプト間に配分する。
 * conceptShare は対象ブランドの平均得票率（コンセプトシェア）を返す。
 * この値は unitShare の「コンセプト受容度」項として使われる。
 */

/**
 * BP-10 のコンセプトシェアを集計する。
 *
 * @param votes 回答者 × ブランドの配分行列。votes[i][j] は回答者 i がブランド j に
 *              配分した票数（通常は行合計が 10）。
 * @param targetIndex 対象ブランドの列インデックス（既定 0）
 * @returns 対象ブランドの平均得票率（0〜1）
 * @throws {RangeError} 入力が空、行が矩形でない、targetIndex が範囲外、票が負の場合
 *
 * 各回答者について「対象への配分 / その回答者の総配分」を求め、回答者間で平均する。
 * 行合計が 10 でない回答（無効票・棄権）にも頑健になるよう、行ごとに正規化する。
 * 総配分が 0 の回答者はシェア 0 として扱う。
 */
export function conceptShare(votes: number[][], targetIndex = 0): number {
  if (!Array.isArray(votes) || votes.length === 0) {
    throw new RangeError("votes must be a non-empty matrix");
  }
  if (!Number.isInteger(targetIndex) || targetIndex < 0) {
    throw new RangeError(
      `targetIndex must be a non-negative integer, received ${targetIndex}`,
    );
  }

  const brandCount = votes[0].length;
  if (targetIndex >= brandCount) {
    throw new RangeError(
      `targetIndex ${targetIndex} is out of range for ${brandCount} brands`,
    );
  }

  let shareSum = 0;
  for (let i = 0; i < votes.length; i++) {
    const row = votes[i];
    if (!Array.isArray(row) || row.length !== brandCount) {
      throw new RangeError(
        `row ${i} must have ${brandCount} entries (matrix must be rectangular)`,
      );
    }
    let total = 0;
    for (let j = 0; j < row.length; j++) {
      const v = row[j];
      if (!Number.isFinite(v) || v < 0) {
        throw new RangeError(
          `vote at [${i}][${j}] must be a non-negative finite number, received ${v}`,
        );
      }
      total += v;
    }
    shareSum += total === 0 ? 0 : row[targetIndex] / total;
  }

  return shareSum / votes.length;
}

/**
 * トランザクションログ → 顧客別 RFM サマリ変換。
 *
 * BG/NBD・Gamma-Gamma が要求する非契約型の RFM 定義（Fader-Hardie 準拠）:
 *   frequency … 反復購入回数（初回を除く購入機会数。同日複数取引は 1 機会）
 *   recency   … 初回購入から最終購入までの経過（時間単位はデフォルト週）
 *   T         … 初回購入から観測終了までの経過（同単位）
 *   monetary  … 反復購入機会あたりの平均金額（frequency=0 の顧客は 0）
 */

const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;

export interface Transaction {
  customerId: string;
  date: Date;
  amount: number;
}

export interface Rfm {
  customerId: string;
  /** 反復購入回数 x（初回を除く） */
  frequency: number;
  /** 初回→最終購入の経過（週） */
  recency: number;
  /** 初回→観測終了の経過（週） */
  T: number;
  /** 反復購入機会あたり平均金額 */
  monetary: number;
}

export interface ToRfmOptions {
  /** 時間単位（1 単位あたりの日数）。既定 7（週）。日単位にするなら 1。 */
  timeUnitDays?: number;
}

/**
 * 取引ログを顧客別 RFM に変換する。観測終了日より後の取引は除外（キャリブレーション）。
 *
 * @param transactions 取引ログ（customerId, date, amount）
 * @param observationEnd 観測終了日（この日までを集計）
 * @param opts 時間単位オプション
 * @returns 顧客別 RFM 配列（customerId 昇順）
 */
export function toRfm(
  transactions: Transaction[],
  observationEnd: Date,
  opts: ToRfmOptions = {},
): Rfm[] {
  const unitMs = (opts.timeUnitDays ?? 7) * (MS_PER_WEEK / 7);
  const endMs = observationEnd.getTime();

  // 顧客ごとに、日付（0時基準）→ その日の合計金額 を集計
  const byCustomer = new Map<string, Map<number, number>>();
  for (const t of transactions) {
    const dayMs = startOfDay(t.date).getTime();
    if (dayMs > endMs) continue; // 観測終了より後は除外
    let days = byCustomer.get(t.customerId);
    if (!days) {
      days = new Map<number, number>();
      byCustomer.set(t.customerId, days);
    }
    days.set(dayMs, (days.get(dayMs) ?? 0) + t.amount);
  }

  const result: Rfm[] = [];
  for (const [customerId, days] of byCustomer) {
    const occasions = [...days.keys()].sort((a, b) => a - b);
    if (occasions.length === 0) continue;
    const first = occasions[0];
    const last = occasions[occasions.length - 1];
    const frequency = occasions.length - 1;
    const recency = (last - first) / unitMs;
    const T = (endMs - first) / unitMs;

    // 反復購入機会（初回を除く）の平均金額
    let monetary = 0;
    if (frequency > 0) {
      let sum = 0;
      for (let i = 1; i < occasions.length; i++) sum += days.get(occasions[i]) ?? 0;
      monetary = sum / frequency;
    }

    result.push({ customerId, frequency, recency, T, monetary });
  }

  result.sort((a, b) => (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0));
  return result;
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

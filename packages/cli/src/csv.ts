/**
 * 取引ログ CSV パーサ（自前・依存ゼロ）。
 *
 * 仕様：
 * - 対応形式：`customerId,date,amount`（ヘッダ必須・この3列を含むこと）
 * - 文字コードは UTF-8 のみ対応
 * - RFC 4180 相当のクオート対応（`"a,b"` / `""` エスケープ / クオート内改行）
 * - 不正行は行番号付きの Error を投げる
 */

import type { Transaction } from "@forecast-manifesto/clv";

/** 1 行を RFC4180 相当でフィールド分割する。 */
export function parseCsv(text: string): { rows: string[][]; lineNumbers: number[] } {
  const rows: string[][] = [];
  const lineNumbers: number[] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const pushField = (): void => {
    row.push(field);
    field = "";
  };
  const pushRow = (): void => {
    pushField();
    // 完全な空行はスキップ
    if (!(row.length === 1 && row[0] === "")) {
      rows.push(row);
      lineNumbers.push(rowStartLine);
    }
    row = [];
    rowStartLine = line;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === "\n") line++;
        field += c;
      }
    } else if (c === '"') {
      if (field !== "") {
        throw new Error(`line ${line}: unexpected quote inside an unquoted field`);
      }
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      line++;
      pushRow();
    } else if (c === "\r") {
      // CRLF: 次の \n に任せる。単独 CR は行区切りとして扱う
      if (text[i + 1] !== "\n") {
        line++;
        pushRow();
      }
    } else {
      field += c;
    }
  }
  if (inQuotes) {
    throw new Error(`line ${rowStartLine}: unterminated quoted field`);
  }
  if (field !== "" || row.length > 0) pushRow();

  return { rows, lineNumbers };
}

/**
 * 取引ログ CSV をパースする。
 *
 * @throws {Error} ヘッダ欠落・必須列欠落・型不正（行番号付き）
 */
export function parseTransactionsCsv(text: string): Transaction[] {
  const { rows, lineNumbers } = parseCsv(text);
  if (rows.length === 0) {
    throw new Error("empty CSV: a header row (customerId,date,amount) is required");
  }
  const header = rows[0].map((h) => h.trim());
  const idIdx = header.indexOf("customerId");
  const dateIdx = header.indexOf("date");
  const amountIdx = header.indexOf("amount");
  if (idIdx < 0 || dateIdx < 0 || amountIdx < 0) {
    throw new Error(
      `line ${lineNumbers[0]}: header must contain customerId, date, amount (received: ${header.join(",")})`,
    );
  }

  const out: Transaction[] = [];
  for (let r = 1; r < rows.length; r++) {
    const ln = lineNumbers[r];
    const cols = rows[r];
    if (cols.length <= Math.max(idIdx, dateIdx, amountIdx)) {
      throw new Error(`line ${ln}: expected at least ${Math.max(idIdx, dateIdx, amountIdx) + 1} columns, got ${cols.length}`);
    }
    const customerId = cols[idIdx].trim();
    if (customerId === "") {
      throw new Error(`line ${ln}: customerId is empty`);
    }
    const dateStr = cols[dateIdx].trim();
    const date = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00Z");
    if (Number.isNaN(date.getTime())) {
      throw new Error(`line ${ln}: invalid date "${dateStr}" (expected ISO format like 2026-06-30)`);
    }
    const amount = Number(cols[amountIdx]);
    if (!Number.isFinite(amount)) {
      throw new Error(`line ${ln}: invalid amount "${cols[amountIdx]}"`);
    }
    out.push({ customerId, date, amount });
  }
  if (out.length === 0) {
    throw new Error("CSV contains a header but no data rows");
  }
  return out;
}

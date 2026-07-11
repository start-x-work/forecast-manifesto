import { describe, it, expect } from "vitest";
import { parseCsv, parseTransactionsCsv } from "../src/csv.js";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    const { rows } = parseCsv("a,b,c\n1,2,3\n");
    expect(rows).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("supports quoted fields with commas, escaped quotes, and newlines", () => {
    const { rows } = parseCsv('a,b\n"x,y",plain\n"say ""hi""","line1\nline2"\n');
    expect(rows[1]).toEqual(["x,y", "plain"]);
    expect(rows[2]).toEqual(['say "hi"', "line1\nline2"]);
  });

  it("handles CRLF and skips empty lines", () => {
    const { rows } = parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n");
    expect(rows).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("throws on an unterminated quote", () => {
    expect(() => parseCsv('a,b\n"open,2\n')).toThrow(/unterminated/);
  });
});

describe("parseTransactionsCsv", () => {
  const HEADER = "customerId,date,amount\n";

  it("parses valid transactions", () => {
    const txns = parseTransactionsCsv(HEADER + "A,2026-01-15,120.5\nB,2026-02-01,80\n");
    expect(txns).toHaveLength(2);
    expect(txns[0].customerId).toBe("A");
    expect(txns[0].date.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(txns[0].amount).toBe(120.5);
  });

  it("accepts extra columns and any column order", () => {
    const txns = parseTransactionsCsv("date,note,customerId,amount\n2026-01-01,hello,A,10\n");
    expect(txns[0].customerId).toBe("A");
    expect(txns[0].amount).toBe(10);
  });

  it("reports the line number for a bad date", () => {
    expect(() => parseTransactionsCsv(HEADER + "A,2026-01-15,10\nB,not-a-date,20\n")).toThrow(/line 3/);
  });

  it("reports the line number for a bad amount and empty id", () => {
    expect(() => parseTransactionsCsv(HEADER + "A,2026-01-01,xx\n")).toThrow(/line 2.*amount/);
    expect(() => parseTransactionsCsv(HEADER + ",2026-01-01,5\n")).toThrow(/line 2.*customerId/);
  });

  it("reports the line number for missing columns", () => {
    expect(() => parseTransactionsCsv(HEADER + "A,2026-01-01\n")).toThrow(/line 2/);
  });

  it("throws on a missing header or empty file", () => {
    expect(() => parseTransactionsCsv("")).toThrow(/header/);
    expect(() => parseTransactionsCsv("id,when,value\nA,2026-01-01,3\n")).toThrow(/header must contain/);
    expect(() => parseTransactionsCsv(HEADER)).toThrow(/no data rows/);
  });
});

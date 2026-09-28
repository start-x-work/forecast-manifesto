import { describe, it, expect } from "vitest";
import * as api from "../src/index.js";

/**
 * 公開 API スナップショット。index.ts の実行時エクスポート（値）を固定し、
 * 意図しない破壊的変更（エクスポートの削除・改名）を CI で検知する。
 * 追加は additive なので、増える分はここに追記して更新する。
 */
const EXPECTED_EXPORTS = [
  "cepCoverage",
  "mentalPhysicalGap",
  "regenerationRate",
  "shareOfMind",
  "shareOfMindTable",
].sort();

describe("@forecast-manifesto/memory — 公開 API スナップショット", () => {
  it("実行時エクスポートの集合が固定リストと一致する", () => {
    expect(Object.keys(api).sort()).toEqual(EXPECTED_EXPORTS);
  });
});

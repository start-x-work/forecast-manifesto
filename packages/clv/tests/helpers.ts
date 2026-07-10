import { readFileSync } from "node:fs";
import type { Rfm } from "../src/index.js";

/** CDNOW RFM フィクスチャ（2,357 顧客）を読み込む。 */
export function loadCdnowRfm(): Rfm[] {
  return JSON.parse(
    readFileSync(new URL("./fixtures/cdnow_rfm.json", import.meta.url), "utf8"),
  ) as Rfm[];
}

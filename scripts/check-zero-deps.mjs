/**
 * ランタイム依存ゼロの保証。
 *
 * 本 OSS の設計原則：公開パッケージは**第三者ランタイム依存を持たない**
 * （依存ゼロ＝監査可能・供給網リスク最小）。ワークスペース内の兄弟パッケージ
 * （@forecast-manifesto/*）への依存のみ許可する。違反があれば非ゼロ終了し CI を落とす。
 *
 *   node scripts/check-zero-deps.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "packages");

const ALLOWED_SCOPE = "@forecast-manifesto/";
const violations = [];

for (const name of readdirSync(pkgDir)) {
  const pkgPath = join(pkgDir, name, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    continue; // package.json が無いディレクトリはスキップ
  }
  const deps = pkg.dependencies ?? {};
  for (const dep of Object.keys(deps)) {
    if (!dep.startsWith(ALLOWED_SCOPE)) {
      violations.push(`${pkg.name}: 第三者ランタイム依存 "${dep}" が存在します`);
    }
  }
}

if (violations.length > 0) {
  console.error("ランタイム依存ゼロの原則に違反しています:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log("OK: 公開パッケージに第三者ランタイム依存はありません（依存ゼロ）。");

#!/usr/bin/env node
/** bin エントリポイント。ロジックは index.ts の run() に集約（テスト可能に）。 */
import { run } from "./index.js";

const { code, output } = run(process.argv.slice(2));
console.log(output);
process.exitCode = code;

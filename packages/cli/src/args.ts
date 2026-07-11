/** 最小のコマンドライン引数パーサ（依存ゼロ）。--key value / --flag に対応。 */

export interface ParsedArgs {
  positional: string[];
  options: Map<string, string | true>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        options.set(key, next);
        i++;
      } else {
        options.set(key, true);
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, options };
}

export function requireString(args: ParsedArgs, key: string): string {
  const v = args.options.get(key);
  if (typeof v !== "string") {
    throw new Error(`--${key} is required (e.g. --${key} <value>)`);
  }
  return v;
}

export function optionalString(args: ParsedArgs, key: string): string | undefined {
  const v = args.options.get(key);
  return typeof v === "string" ? v : undefined;
}

export function requireNumber(args: ParsedArgs, key: string): number {
  const v = Number(requireString(args, key));
  if (!Number.isFinite(v)) throw new Error(`--${key} must be a number`);
  return v;
}

export function optionalNumber(args: ParsedArgs, key: string): number | undefined {
  const v = optionalString(args, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${key} must be a number`);
  return n;
}

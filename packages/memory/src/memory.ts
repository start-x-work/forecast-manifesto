/**
 * 記憶／再生構造の計算。
 *
 * メンタルアベイラビリティ（想起集合・カテゴリーエントリーポイント）の
 * 公開可能な算術のみ。業界別ベンチマークや個社の CEP 辞書は非公開。
 *
 * 前提：入力は調査票の集計（言及回数・CEP リンクの有無）であり、
 * 広告効果の因果推定ではない。定常の Dirichlet ベースラインと並べて使う。
 */

export interface BrandMentions {
  name: string;
  /** 非援助想起などの言及回数（>= 0） */
  mentions: number;
}

export interface CepLink {
  cep: string;
  linked: boolean;
}

function assertNonNegative(name: string, v: number): void {
  if (!Number.isFinite(v) || v < 0) {
    throw new RangeError(`${name} must be a non-negative finite number, received ${v}`);
  }
}

/** 心的シェア = 当該ブランド言及 / カテゴリ総言及。総言及 0 なら throw。 */
export function shareOfMind(brandMentions: number, categoryMentions: number): number {
  assertNonNegative("brandMentions", brandMentions);
  assertNonNegative("categoryMentions", categoryMentions);
  if (categoryMentions === 0) {
    throw new RangeError("shareOfMind requires categoryMentions > 0");
  }
  if (brandMentions > categoryMentions) {
    throw new RangeError("brandMentions cannot exceed categoryMentions");
  }
  return brandMentions / categoryMentions;
}

/** 複数ブランドの心的シェア。合計は 1。 */
export function shareOfMindTable(brands: BrandMentions[]): { name: string; share: number }[] {
  if (!Array.isArray(brands) || brands.length === 0) {
    throw new RangeError("brands must be a non-empty array");
  }
  const total = brands.reduce((s, b) => {
    assertNonNegative(`mentions(${b.name})`, b.mentions);
    return s + b.mentions;
  }, 0);
  if (total === 0) throw new RangeError("at least one brand must have mentions > 0");
  return brands.map((b) => ({ name: b.name, share: b.mentions / total }));
}

/** CEP 被覆率 = リンク済み CEP 数 / 全 CEP 数。 */
export function cepCoverage(links: CepLink[]): number {
  if (!Array.isArray(links) || links.length === 0) {
    throw new RangeError("links must be a non-empty array");
  }
  const linked = links.filter((l) => l.linked).length;
  return linked / links.length;
}

/**
 * 再生率 = 再想起回数 / 初回想起回数。
 * 「一度思い出した人が、次の機会でもう一度思い出すか」の粗い再生構造。
 */
export function regenerationRate(repeatRecall: number, firstRecall: number): number {
  assertNonNegative("repeatRecall", repeatRecall);
  assertNonNegative("firstRecall", firstRecall);
  if (firstRecall === 0) {
    throw new RangeError("regenerationRate requires firstRecall > 0");
  }
  if (repeatRecall > firstRecall) {
    throw new RangeError("repeatRecall cannot exceed firstRecall");
  }
  return repeatRecall / firstRecall;
}

/**
 * 心的シェア − 実購買シェア。正なら「買われる以上に思い出されている」。
 * どちらも [0, 1]。
 */
export function mentalPhysicalGap(mentalShare: number, physicalShare: number): number {
  if (!(mentalShare >= 0 && mentalShare <= 1)) {
    throw new RangeError(`mentalShare must be within [0, 1], received ${mentalShare}`);
  }
  if (!(physicalShare >= 0 && physicalShare <= 1)) {
    throw new RangeError(`physicalShare must be within [0, 1], received ${physicalShare}`);
  }
  return mentalShare - physicalShare;
}

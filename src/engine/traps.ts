import { CONTRAST_PAIRS } from "../content/kana";
import type { DrillCategory, DrillItem } from "./drills";

/**
 * Trap catalog: the named confusions this curriculum is built to defeat. One shared id
 * space is used by the event log (`events.ts`), the learner personas (`sim/`), the
 * Sensei agent's explanations (`server/agent`), Agent Lens tag filters, and the exercise
 * composer. Add a trap here and every layer picks it up.
 */
export interface TrapDef {
  id: string;
  label: string;
  /** One contrastive sentence a tutor can say; plain English, no romaji needed. */
  rule: string;
  category: DrillCategory;
  /** True when this item exercises the trap. */
  matches: (item: DrillItem) => boolean;
  /**
   * The characteristic wrong answer a learner who has this confusion would give.
   * Used only by the simulator. Returns undefined when no plausible slip exists.
   */
  slip: (item: DrillItem) => string | undefined;
}

const firstKana = (item: DrillItem) => item.acceptedKana[0] ?? "";
const hasKana = (item: DrillItem, needle: string) => item.acceptedKana.some((k) => k.includes(needle));
const isCounterKind = (item: DrillItem, kind: string) =>
  item.skill === "counter" && Boolean(item.prompt.en?.includes(`(${kind})`));

/** Picks the option that is not the answer when the item is a choice item. */
function otherOption(item: DrillItem, preferred?: string): string | undefined {
  if (item.answerKind !== "choice" || !item.options) return preferred;
  if (preferred && item.options.includes(preferred)) return preferred;
  return item.options.find((o) => o !== item.answerDisplay);
}

function devoiceRomaji(r: string): string {
  return r.replace(/^g/, "k").replace(/^z/, "s").replace(/^j/, "sh").replace(/^d/, "t").replace(/^[bp]/, "h");
}

/* Contrast traps are generated from the content so new lookalike pairs need no code. */
const contrastTraps: TrapDef[] = CONTRAST_PAIRS.map((pair) => ({
  id: pair.id,
  label: `${pair.chars.join(" / ")} lookalikes`,
  rule: pair.visualRule,
  category: "kana",
  matches: (item) =>
    (item.skill === "contrast" || item.skill === "kana-read") &&
    Boolean(item.prompt.text && pair.chars.includes(item.prompt.text)),
  slip: (item) => {
    const idx = pair.chars.indexOf(item.prompt.text ?? "");
    const wrong = pair.romaji.find((_, i) => i !== idx)?.split(" ")[0].toLowerCase();
    return otherOption(item, wrong);
  },
}));

const handTraps: TrapDef[] = [
  {
    id: "particle-wa-ha",
    label: "Topic は written as わ",
    rule: "The topic particle is pronounced wa but always written は. Only the word わたし starts with わ.",
    category: "grammar",
    matches: (item) =>
      (item.skill === "cloze" && item.acceptedKana.includes("は")) ||
      (item.skill === "vocab-recall" && /は$/.test(firstKana(item)) && /こんにち|こんばん/.test(firstKana(item))),
    slip: (item) => (item.skill === "cloze" ? otherOption(item, "わ") : firstKana(item).replace(/は$/, "わ")),
  },
  {
    id: "kore-kono",
    label: "これ vs この",
    rule: "これ stands alone as a noun (this one); この must be followed by a noun (this pen). Same split for それ/その and あれ/あの.",
    category: "grammar",
    matches: (item) => item.skill === "cloze" && /これ|この|それ|その|あれ|あの/.test(item.trapWarning ?? ""),
    slip: (item) => {
      const ans = item.answerDisplay;
      const swap: Record<string, string> = { これ: "この", この: "これ", それ: "その", その: "それ", あれ: "あの", あの: "あれ" };
      return otherOption(item, swap[ans]);
    },
  },
  {
    id: "year-4-yonensei",
    label: "4th-year student is よねんせい",
    rule: "Before ねんせい, four is よ, not よん: よねんせい. The ん is dropped.",
    category: "counter",
    matches: (item) => hasKana(item, "よねんせい"),
    slip: () => "よんねんせい",
  },
  {
    id: "hour-4-yoji",
    label: "4:00 is よじ",
    rule: "Four o'clock is よじ. Neither よんじ nor しじ exists.",
    category: "counter",
    matches: (item) => isCounterKind(item, "time") && /^(ごぜん|ごご)?よじ/.test(firstKana(item)),
    slip: (item) => firstKana(item).replace(/よじ/, "よんじ"),
  },
  {
    id: "hour-7-shichiji",
    label: "7:00 is しちじ",
    rule: "Seven o'clock is しちじ in Genki. ななじ is only heard in announcements for clarity.",
    category: "counter",
    matches: (item) => isCounterKind(item, "time") && /^(ごぜん|ごご)?しちじ/.test(firstKana(item)),
    slip: (item) => firstKana(item).replace(/しちじ/, "なじ"),
  },
  {
    id: "hour-9-kuji",
    label: "9:00 is くじ",
    rule: "Nine o'clock is くじ, never きゅうじ.",
    category: "counter",
    matches: (item) => isCounterKind(item, "time") && /^(ごぜん|ごご)?くじ/.test(firstKana(item)),
    slip: (item) => firstKana(item).replace(/くじ/, "きゅうじ"),
  },
  {
    id: "minute-pun-fun",
    label: "ぷん vs ふん minutes",
    rule: "Minutes ending in 1, 3, 4, 6, 8, 10 take ぷん (いっぷん, さんぷん, よんぷん, ろっぷん, はっぷん, じゅっぷん); the rest take ふん.",
    category: "counter",
    matches: (item) => isCounterKind(item, "time") && firstKana(item).includes("ぷん"),
    slip: (item) => firstKana(item).replace(/ぷん/, "ふん"),
  },
  {
    id: "age-20-hatachi",
    label: "20 years old is はたち",
    rule: "Twenty years old has its own word, はたち. Genki does not accept にじゅっさい.",
    category: "counter",
    matches: (item) => hasKana(item, "はたち"),
    slip: () => "にじゅっさい",
  },
  {
    id: "age-sai-clipping",
    label: "いっさい / はっさい / じゅっさい",
    rule: "Before さい, いち becomes いっ, はち becomes はっ, and じゅう becomes じゅっ.",
    category: "counter",
    matches: (item) => isCounterKind(item, "age") && /(いっ|はっ|じゅっ)さい/.test(firstKana(item)),
    slip: (item) => firstKana(item).replace(/いっさい/, "いちさい").replace(/はっさい/, "はちさい").replace(/じゅっさい/, "じゅうさい"),
  },
  {
    id: "hundreds-voicing",
    label: "300 / 600 / 800",
    rule: "Hundreds mutate: さんびゃく (b after ん), ろっぴゃく and はっぴゃく (small っ plus p). Every other hundred is plain ひゃく.",
    category: "counter",
    matches: (item) => /さんびゃく|ろっぴゃく|はっぴゃく/.test(firstKana(item)),
    slip: (item) => firstKana(item).replace(/さんびゃく/, "さんひゃく").replace(/ろっぴゃく/, "ろくひゃく").replace(/はっぴゃく/, "はちひゃく"),
  },
  {
    id: "thousands-voicing",
    label: "3,000 / 8,000",
    rule: "Thousands mutate twice: さんぜん (z after ん) and はっせん (small っ). Everything else is plain せん.",
    category: "counter",
    matches: (item) => /さんぜん|はっせん/.test(firstKana(item)),
    slip: (item) => firstKana(item).replace(/さんぜん/, "さんせん").replace(/はっせん/, "はちせん"),
  },
  {
    id: "man-grouping",
    label: "10,000 is いちまん",
    rule: "Japanese groups large numbers by ten thousand (まん), and 10,000 itself needs いち: いちまん, never just まん.",
    category: "counter",
    matches: (item) => /^いちまん/.test(firstKana(item)),
    slip: (item) => firstKana(item).replace(/^いちまん/, "まん"),
  },
  {
    id: "voicing-marks",
    label: "Dakuten voicing",
    rule: "Two small ticks voice the consonant (か→が, さ→ざ, た→だ, は→ば); the small circle on the は row makes p (ぱ).",
    category: "kana",
    matches: (item) => item.skill === "voicing",
    slip: (item) => otherOption(item, devoiceRomaji(item.answerDisplay)),
  },
  {
    id: "sokuon-long-vowel",
    label: "Small っ and long vowels",
    rule: "Small っ doubles the next consonant (きって = kitte) and a repeated vowel or ー stretches the sound (おおきい = ookii). Dropping either changes the word.",
    category: "kana",
    matches: (item) => item.skill === "mechanics-word" || item.skill === "loanword",
    slip: (item) => {
      const r = item.answerDisplay;
      const shortened = r.replace(/([bcdfghjklmnpqrstvwxyz])\1/, "$1").replace(/([aeiou])\1/, "$1");
      return otherOption(item, shortened !== r ? shortened : undefined);
    },
  },
];

export const TRAPS: TrapDef[] = [...handTraps, ...contrastTraps];

const TRAP_BY_ID = new Map(TRAPS.map((t) => [t.id, t]));

export function getTrap(id: string): TrapDef | undefined {
  return TRAP_BY_ID.get(id);
}

/** First trap that this item exercises, if any. Hand-written traps take priority over generated ones. */
export function trapForItem(item: DrillItem): TrapDef | undefined {
  return TRAPS.find((t) => t.matches(item));
}

/** Plain-data view (no functions) for JSON consumers such as the evals package. */
export function trapCatalog(): Array<Pick<TrapDef, "id" | "label" | "rule" | "category">> {
  return TRAPS.map(({ id, label, rule, category }) => ({ id, label, rule, category }));
}

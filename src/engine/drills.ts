import type {
  ClozeExercise,
  ContrastPair,
  GrammarPoint,
  KanaEntry,
  RoleplayScenario,
  TextSegment,
  VocabEntry,
} from "../content/schema";
import {
  type CounterDrillKind,
  type CounterDrillQuestion,
  type ReadingResult,
  spellAge,
  spellClockTime,
  spellInteger,
  spellSchoolYear,
  spellYen,
} from "./numbers";
import { isAnswerAccepted, normalizeJapaneseInput } from "./romaji-kana";
import type { ItemMastery } from "./srs";

/**
 * Unified quiz shape shared by every study unit. Kana, vocab, cloze, counter, and
 * roleplay content all collapse into a DrillItem so one checkpoint can mix them.
 *
 * `id` is the mastery id recorded through `recordReview`; it is deliberately shared with
 * the reference tabs (Kana Lab, Grammar, Numbers, Vocab) so progress made anywhere feeds
 * the same FSRS-lite boxes. `variantKey` is unique per item instance within one quiz.
 */
export type DrillCategory = ItemMastery["category"];

export type DrillSkill =
  | "kana-read"
  | "voicing"
  | "mechanics-word"
  | "contrast"
  | "loanword"
  | "vocab-recall"
  | "vocab-recognize"
  | "cloze"
  | "example-match"
  | "counter"
  | "roleplay-turn";

export interface DrillPrompt {
  /** Japanese to display with ruby support (cloze sentences, vocab in JP->EN). */
  segments?: TextSegment[];
  /** Plain prompt text (a kana glyph, "4:30 PM", or an English meaning). */
  text?: string;
  /** English instruction or context line. */
  en?: string;
  /** Kana to speak when the answer is revealed. */
  speakKana?: string;
  /** Romaji hint shown only in bridge mode. */
  romaji?: string;
}

export interface DrillItem {
  id: string;
  variantKey: string;
  category: DrillCategory;
  skill: DrillSkill;
  sourceUnitId: string;
  prompt: DrillPrompt;
  answerKind: "choice" | "typed";
  options?: string[];
  acceptedKana: string[];
  acceptedRomaji: string[];
  /** Canonical answer shown in feedback (and matched exactly for choice items). */
  answerDisplay: string;
  explanation: string;
  trapWarning?: string;
  /** Whether this item can be re-asked as a typed (no options) question. */
  typedCapable: boolean;
}

/* ---------------------------------------------------------------------------------------- */
/* Seeded randomness                                                                           */
/* ---------------------------------------------------------------------------------------- */

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: small, deterministic PRNG. Returns a function yielding [0, 1). */
export function createRng(seed: string | number): () => number {
  let a = typeof seed === "number" ? seed >>> 0 : hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string | number): T[] {
  const rng = createRng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function seededPick<T>(items: readonly T[], count: number, seed: string | number): T[] {
  return seededShuffle(items, seed).slice(0, Math.max(0, count));
}

/* ---------------------------------------------------------------------------------------- */
/* Helpers                                                                                    */
/* ---------------------------------------------------------------------------------------- */

function cleanRomaji(r: string): string {
  return r.split(" ")[0].toLowerCase();
}

/** "けいざい / こうがく" -> ["けいざい", "こうがく", "けいざい / こうがく"] with 〜 stripped. */
function splitVariants(value: string): string[] {
  const parts = value
    .split("/")
    .map((p) => p.replace(/〜/g, "").trim())
    .filter(Boolean);
  const whole = value.replace(/〜/g, "").trim();
  return Array.from(new Set([...parts, whole].filter(Boolean)));
}

/** "college; university" -> "college"; "teacher; professor (never ...)" -> "teacher; professor". */
export function shortEnglish(en: string): string {
  const noParen = en.replace(/\s*\([^)]*\)/g, "").trim();
  return noParen.length > 0 ? noParen : en;
}

function buildChoiceOptions(answer: string, pool: readonly string[], seed: string, size = 4): string[] {
  const distractors = seededShuffle(
    Array.from(new Set(pool.filter((p) => p !== answer))),
    `${seed}:distractors`,
  ).slice(0, size - 1);
  return seededShuffle([answer, ...distractors], `${seed}:order`);
}

/* ---------------------------------------------------------------------------------------- */
/* Builders                                                                                   */
/* ---------------------------------------------------------------------------------------- */

export interface KanaDrillOptions {
  script: "hiragana" | "katakana";
  /** Romaji pool for distractors (defaults to the whole gojuon row set passed in). */
  pool: readonly KanaEntry[];
}

export function fromKana(entry: KanaEntry, opts: KanaDrillOptions): DrillItem {
  const glyph = opts.script === "hiragana" ? entry.hiragana : entry.katakana;
  const romaji = cleanRomaji(entry.romaji);
  const acceptedRomaji = [romaji];
  if (entry.id === "kana-wo") acceptedRomaji.push("wo");
  if (romaji === "shi") acceptedRomaji.push("si");
  if (romaji === "chi") acceptedRomaji.push("ti");
  if (romaji === "tsu") acceptedRomaji.push("tu");
  if (romaji === "fu") acceptedRomaji.push("hu");
  const mnemonic = opts.script === "hiragana" ? entry.hiraMnemonic : entry.kataMnemonic;
  const seed = `${entry.id}:${opts.script}`;
  return {
    id: entry.id,
    variantKey: seed,
    category: "kana",
    skill: "kana-read",
    sourceUnitId: "",
    prompt: {
      text: glyph,
      en: `Read this ${opts.script} aloud, then type its romaji.`,
      speakKana: entry.hiragana,
    },
    answerKind: "choice",
    options: buildChoiceOptions(
      romaji,
      opts.pool.map((k) => cleanRomaji(k.romaji)),
      seed,
    ),
    acceptedKana: [entry.hiragana],
    acceptedRomaji,
    answerDisplay: romaji,
    explanation: `${glyph} = ${romaji}. ${mnemonic}`,
    trapWarning: entry.irregularNote,
    typedCapable: true,
  };
}

export interface VoicedPairInput {
  base: string;
  voicedHira: string;
  voicedKata: string;
  romaji: string;
  note?: string;
}

export function fromVoicedKana(
  pair: VoicedPairInput,
  pool: readonly VoicedPairInput[],
  script: "hiragana" | "katakana" = "hiragana",
): DrillItem {
  const glyph = script === "hiragana" ? pair.voicedHira : pair.voicedKata;
  const romaji = cleanRomaji(pair.romaji);
  const id = `voiced-${romaji}`;
  const seed = `${id}:${script}`;
  const acceptedRomaji = [romaji];
  if (romaji === "ji") acceptedRomaji.push("zi", "di");
  if (romaji === "zu") acceptedRomaji.push("du");
  return {
    id,
    variantKey: seed,
    category: "kana",
    skill: "voicing",
    sourceUnitId: "",
    prompt: {
      text: glyph,
      en: `Voiced kana (from ${pair.base}). Type the romaji.`,
      speakKana: pair.voicedHira,
    },
    answerKind: "choice",
    options: buildChoiceOptions(romaji, pool.map((p) => cleanRomaji(p.romaji)), seed),
    acceptedKana: [pair.voicedHira],
    acceptedRomaji,
    answerDisplay: romaji,
    explanation: `${glyph} = ${romaji} (${pair.base} + mark).${pair.note ? ` ${pair.note}.` : ""}`,
    typedCapable: true,
  };
}

export interface MechanicsWordInput {
  id: string;
  jp: string;
  romaji: string;
  en: string;
  rule: string;
}

export function fromMechanicsWord(word: MechanicsWordInput, pool: readonly MechanicsWordInput[]): DrillItem {
  const romaji = word.romaji.split(" ")[0].toLowerCase();
  const seed = `${word.id}:mech`;
  return {
    id: word.id,
    variantKey: seed,
    category: "kana",
    skill: "mechanics-word",
    sourceUnitId: "",
    prompt: {
      text: word.jp,
      en: `Read this word (${word.en}). Watch for small っ / small ゃゅょ / long vowels.`,
      speakKana: word.jp,
    },
    answerKind: "choice",
    options: buildChoiceOptions(romaji, pool.map((w) => w.romaji.split(" ")[0].toLowerCase()), seed),
    acceptedKana: [word.jp],
    acceptedRomaji: [romaji],
    answerDisplay: romaji,
    explanation: `${word.jp} = ${romaji} (${word.en}). ${word.rule}`,
    typedCapable: true,
  };
}

/** One item per character in a lookalike set; distractors are the other characters' readings. */
export function fromContrastPair(pair: ContrastPair, kanaIndex: readonly KanaEntry[]): DrillItem[] {
  return pair.chars.map((ch, idx) => {
    const romaji = cleanRomaji(pair.romaji[idx]);
    const kanaEntry = kanaIndex.find((k) => k.hiragana === ch || k.katakana === ch);
    const id = kanaEntry ? kanaEntry.id : `${pair.id}-${idx}`;
    const seed = `${pair.id}:${ch}`;
    const options = seededShuffle(pair.romaji.map(cleanRomaji), seed);
    return {
      id,
      variantKey: seed,
      category: "kana",
      skill: "contrast",
      sourceUnitId: "",
      prompt: {
        text: ch,
        en: `Lookalike check (${pair.romaji.map(cleanRomaji).join(" / ")}). Which one is this?`,
        speakKana: kanaEntry?.hiragana ?? ch,
      },
      answerKind: "choice",
      options,
      acceptedKana: kanaEntry ? [kanaEntry.hiragana] : [ch],
      acceptedRomaji: [romaji, ...(id === "kana-wo" ? ["wo"] : [])],
      answerDisplay: romaji,
      explanation: `${ch} = ${romaji}. ${pair.visualRule}`,
      typedCapable: true,
    };
  });
}

export interface LoanwordInput {
  id: string;
  jp: string;
  romaji: string;
  en: string;
}

export function fromLoanword(word: LoanwordInput, pool: readonly LoanwordInput[]): DrillItem {
  const seed = `${word.id}:lw`;
  const romaji = word.romaji.toLowerCase();
  return {
    id: word.id,
    variantKey: seed,
    category: "vocab",
    skill: "loanword",
    sourceUnitId: "",
    prompt: {
      text: word.jp,
      en: "Decode this katakana loanword. Type the romaji (or the kana).",
      speakKana: word.jp,
    },
    answerKind: "choice",
    options: buildChoiceOptions(romaji, pool.map((w) => w.romaji.toLowerCase()), seed),
    acceptedKana: [word.jp],
    acceptedRomaji: [romaji],
    answerDisplay: romaji,
    explanation: `${word.jp} = ${romaji} = ${word.en}. ー stretches the previous vowel; small ィ/ャ glides merge.`,
    typedCapable: true,
  };
}

/** English meaning shown; learner produces the Japanese (kana or romaji). */
export function fromVocabRecall(entry: VocabEntry): DrillItem {
  const seed = `${entry.id}:recall`;
  return {
    id: entry.id,
    variantKey: seed,
    category: "vocab",
    skill: "vocab-recall",
    sourceUnitId: "",
    prompt: {
      text: shortEnglish(entry.en),
      en: "Say it in Japanese, then type it (kana or romaji).",
      speakKana: entry.kana.replace(/〜/g, ""),
    },
    answerKind: "typed",
    acceptedKana: splitVariants(entry.kana),
    acceptedRomaji: splitVariants(entry.romaji).map((r) => r.toLowerCase().replace(/^-/, "")),
    answerDisplay: entry.kana,
    explanation: `${entry.kana} (${entry.romaji}) = ${entry.en}${entry.note ? `. ${entry.note}` : ""}`,
    typedCapable: true,
  };
}

/** Japanese shown; learner picks the English meaning. */
export function fromVocabRecognize(entry: VocabEntry, pool: readonly VocabEntry[]): DrillItem {
  const seed = `${entry.id}:recognize`;
  const answer = shortEnglish(entry.en);
  return {
    id: entry.id,
    variantKey: seed,
    category: "vocab",
    skill: "vocab-recognize",
    sourceUnitId: "",
    prompt: {
      segments: entry.segments,
      romaji: entry.romaji,
      en: "What does this mean?",
      speakKana: entry.kana.replace(/〜/g, ""),
    },
    answerKind: "choice",
    options: buildChoiceOptions(
      answer,
      pool.map((v) => shortEnglish(v.en)),
      seed,
    ),
    acceptedKana: [],
    acceptedRomaji: [answer],
    answerDisplay: answer,
    explanation: `${entry.kana} = ${entry.en}${entry.note ? `. ${entry.note}` : ""}`,
    typedCapable: false,
  };
}

const BLANK_SEGMENT: TextSegment = { text: "＿＿" };

export function fromCloze(cloze: ClozeExercise): DrillItem {
  const seed = `${cloze.id}:cloze`;
  const acceptedRomaji: string[] = [];
  if (cloze.acceptedAnswers.includes("は")) acceptedRomaji.push("wa", "ha");
  if (cloze.acceptedAnswers.includes("を")) acceptedRomaji.push("o", "wo");
  return {
    id: cloze.id,
    variantKey: seed,
    category: "grammar",
    skill: "cloze",
    sourceUnitId: "",
    prompt: {
      segments: [...cloze.beforeSegments, BLANK_SEGMENT, ...cloze.afterSegments],
      en: cloze.promptEn,
      speakKana: [
        ...cloze.beforeSegments.map((s) => s.furigana ?? s.text),
        cloze.blankAnswerKana,
        ...cloze.afterSegments.map((s) => s.furigana ?? s.text),
      ].join(""),
    },
    answerKind: "choice",
    options: seededShuffle(cloze.options, seed),
    acceptedKana: cloze.acceptedAnswers,
    acceptedRomaji,
    answerDisplay: cloze.blankAnswerKana,
    explanation: cloze.explanation,
    trapWarning: cloze.trapWarning,
    typedCapable: true,
  };
}

/** English meaning shown; learner picks which example sentence says it. */
export function fromGrammarExample(
  grammar: GrammarPoint,
  exampleIndex: number,
  extraPool: readonly GrammarPoint[] = [],
): DrillItem {
  const ex = grammar.examples[exampleIndex];
  const id = `${grammar.id}-ex${exampleIndex + 1}`;
  const seed = `${id}:example`;
  const pool = [
    ...grammar.examples.map((e) => e.kana),
    ...extraPool.flatMap((g) => g.examples.map((e) => e.kana)),
  ];
  return {
    id,
    variantKey: seed,
    category: "grammar",
    skill: "example-match",
    sourceUnitId: "",
    prompt: {
      text: ex.en,
      en: `Which Japanese sentence says this? (${grammar.code})`,
      speakKana: ex.kana,
    },
    answerKind: "choice",
    options: buildChoiceOptions(ex.kana, pool, seed),
    acceptedKana: [ex.kana],
    acceptedRomaji: [ex.romaji],
    answerDisplay: ex.kana,
    explanation: `${ex.kana} — ${ex.en}. Formula: ${grammar.formula}`,
    typedCapable: false,
  };
}

export function fromRoleplay(scenario: RoleplayScenario): DrillItem[] {
  return scenario.turns.map((turn, idx) => {
    const id = `${scenario.id}-t${idx + 1}`;
    const seed = `${id}:rp`;
    const correct = turn.choices.find((c) => c.isCorrect) ?? turn.choices[0];
    return {
      id,
      variantKey: seed,
      category: "grammar",
      skill: "roleplay-turn",
      sourceUnitId: "",
      prompt: {
        segments: turn.promptJp.segments,
        romaji: turn.promptJp.romaji,
        en: `${turn.speakerName}: "${turn.promptJp.en}" — Goal: ${turn.goalEn}`,
        speakKana: correct.kana,
      },
      answerKind: "choice",
      options: seededShuffle(
        turn.choices.map((c) => c.jp),
        seed,
      ),
      acceptedKana: [correct.kana, correct.jp],
      acceptedRomaji: [correct.romaji],
      answerDisplay: correct.jp,
      explanation: `${correct.feedback} (${correct.en})`,
      typedCapable: false,
    };
  });
}

function fromReading(
  id: string,
  kind: CounterDrillKind,
  jpQuestion: string,
  promptLabel: string,
  solution: ReadingResult,
): DrillItem {
  const seed = `${id}:counter`;
  const mutationNote = solution.mutations.length > 0 ? ` Traps: ${solution.mutations.join("; ")}` : "";
  return {
    id,
    variantKey: seed,
    category: "counter",
    skill: "counter",
    sourceUnitId: "",
    prompt: {
      text: promptLabel,
      en: `${jpQuestion} — answer in kana or romaji (${kind}).`,
      speakKana: solution.kana,
    },
    answerKind: "typed",
    acceptedKana: solution.acceptedKana,
    acceptedRomaji: solution.acceptedRomaji,
    answerDisplay: solution.kana,
    explanation: `${solution.kana} (${solution.romaji}). ${solution.breakdown}.${mutationNote}`,
    trapWarning: solution.mutations[0],
    typedCapable: true,
  };
}

export function fromCounterDrill(q: CounterDrillQuestion): DrillItem {
  return fromReading(q.id, q.kind, q.jpQuestion, q.questionPrompt, q.solution);
}

const COUNTER_QUESTION_JP: Record<CounterDrillKind, string> = {
  time: "いま なんじですか。",
  age: "なんさいですか。",
  schoolYear: "なんねんせいですか。",
  yen: "これは いくらですか。",
  number: "この かずは？",
};

/** Deterministically generates fresh counter items so checkpoints never repeat the curated set verbatim. */
export function generateCounterItems(kind: CounterDrillKind, count: number, seed: string): DrillItem[] {
  const rng = createRng(`${kind}:${seed}`);
  const items: DrillItem[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (items.length < count && guard < count * 20) {
    guard += 1;
    let id = "";
    let label = "";
    let solution: ReadingResult | null = null;
    if (kind === "time") {
      const hour = 1 + Math.floor(rng() * 12);
      const minuteChoices = [0, 0, 30, 1, 3, 4, 5, 6, 8, 10, 15, 20, 45, 50];
      const minute = minuteChoices[Math.floor(rng() * minuteChoices.length)];
      const periodRoll = rng();
      const period = periodRoll < 0.33 ? "am" : periodRoll < 0.66 ? "pm" : undefined;
      id = `gen-time-${hour}-${minute}-${period ?? "x"}`;
      solution = spellClockTime(hour, minute, period);
      label = solution.promptLabel;
    } else if (kind === "age") {
      const ages = [1, 8, 10, 18, 19, 20, 21, 22, 24, 28, 30, 35, 41, 48, 50];
      const age = ages[Math.floor(rng() * ages.length)];
      id = `gen-age-${age}`;
      solution = spellAge(age);
      label = solution.promptLabel;
    } else if (kind === "schoolYear") {
      const year = 1 + Math.floor(rng() * 4);
      id = `gen-year-${year}`;
      solution = spellSchoolYear(year);
      label = solution.promptLabel;
    } else if (kind === "yen") {
      const amounts = [100, 150, 300, 350, 600, 680, 800, 1000, 1300, 1800, 2600, 3000, 3800, 6000, 8000, 8600, 10000, 12000, 30000, 38000];
      const amount = amounts[Math.floor(rng() * amounts.length)];
      id = `gen-yen-${amount}`;
      solution = spellYen(amount);
      label = solution.promptLabel;
    } else {
      const numbers = [4, 7, 9, 14, 17, 19, 40, 70, 90, 100, 300, 600, 800, 1000, 3000, 8000, 10000, 20000];
      const n = numbers[Math.floor(rng() * numbers.length)];
      id = `gen-num-${n}`;
      solution = spellInteger(n);
      label = solution.promptLabel;
    }
    if (!solution || seen.has(id)) continue;
    seen.add(id);
    items.push(fromReading(id, kind, COUNTER_QUESTION_JP[kind], label, solution));
  }
  return items;
}

/* ---------------------------------------------------------------------------------------- */
/* Grading and variants                                                                       */
/* ---------------------------------------------------------------------------------------- */

export function grade(item: DrillItem, input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (item.answerKind === "choice" && trimmed === item.answerDisplay) return true;
  if (isAnswerAccepted(trimmed, item.acceptedKana, item.acceptedRomaji)) return true;
  // Direct-object particle を is pronounced "o"; accept either romanisation.
  if (item.acceptedKana.includes("を")) {
    const n = normalizeJapaneseInput(trimmed);
    if (n === "お" || n === "を") return true;
  }
  return false;
}

/** Returns a copy of the item presented without options (harder checkpoint form) when possible. */
export function asTyped(item: DrillItem): DrillItem {
  if (!item.typedCapable || item.answerKind === "typed") return item;
  return { ...item, answerKind: "typed", options: undefined, variantKey: `${item.variantKey}:typed` };
}

export function withSourceUnit(items: DrillItem[], unitId: string): DrillItem[] {
  return items.map((it) => ({ ...it, sourceUnitId: unitId }));
}

export function dedupeById(items: readonly DrillItem[]): DrillItem[] {
  const seen = new Set<string>();
  const out: DrillItem[] = [];
  for (const it of items) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

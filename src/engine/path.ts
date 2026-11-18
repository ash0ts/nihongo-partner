import type { VoicingRule } from "../content/kana";
import type {
  ContrastPair,
  GrammarPoint,
  JapaneseLine,
  KanaEntry,
  LessonPack,
  RoleplayScenario,
  VocabEntry,
} from "../content/schema";
import {
  asTyped,
  type DrillItem,
  dedupeById,
  fromCloze,
  fromContrastPair,
  fromCounterDrill,
  fromGrammarExample,
  fromKana,
  fromLoanword,
  fromMechanicsWord,
  fromRoleplay,
  fromVocabRecall,
  fromVocabRecognize,
  fromVoicedKana,
  generateCounterItems,
  type LoanwordInput,
  type MechanicsWordInput,
  seededShuffle,
  withSourceUnit,
} from "./drills";
import { type CounterDrillKind, getCuratedCounterDrills } from "./numbers";
import { classifyMastery, markUnitSkipped, type ProgressSnapshot } from "./srs";

/* ---------------------------------------------------------------------------------------- */
/* Types                                                                                      */
/* ---------------------------------------------------------------------------------------- */

export type UnitKind =
  | "kana"
  | "grammar"
  | "vocab"
  | "counters"
  | "roleplay"
  | "checkpoint"
  | "cumulative"
  | "preview";

export interface MechanicsBlock {
  id: string;
  title: string;
  rule: string;
  trap: string;
  examples: Array<{ jp: string; romaji: string; en: string }>;
}

export interface TeachBlock {
  heading: string;
  intro: string;
  bullets: string[];
  examples: JapaneseLine[];
  grammar?: GrammarPoint;
  kanaCards?: KanaEntry[];
  voicingRules?: VoicingRule[];
  mechanics?: MechanicsBlock[];
  contrastPairs?: ContrastPair[];
  loanwords?: LoanwordInput[];
  vocabCards?: VocabEntry[];
  roleplays?: RoleplayScenario[];
  counterNotes?: string[];
}

export interface StudyUnit {
  id: string;
  groupId: string;
  lessonId: string | null;
  kind: UnitKind;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  teach: TeachBlock;
  /** Micro-drill pool (immediate feedback, options allowed). */
  drillItems: DrillItem[];
  /** How many micro-drill prompts to show per pass through the unit. */
  drillSize: number;
  /** Harder forms used by the checkpoint (typed where possible). */
  checkpointPool: DrillItem[];
  checkpointSize: number;
  passBar: number;
  /** Ungated units (preview) never block and never flag. */
  gated: boolean;
  optional: boolean;
  /** Preferred display mode when the unit enforces Genki's no-romaji policy. */
  romajiPolicy: LessonPack["romajiPolicy"];
}

export interface StudyGroup {
  id: string;
  title: string;
  subtitle: string;
  unitIds: string[];
}

export interface StudyPath {
  units: StudyUnit[];
  groups: StudyGroup[];
}

export interface KanaCurriculum {
  gojuon: KanaEntry[];
  voicing: VoicingRule[];
  mechanics: MechanicsBlock[];
  contrastPairs: ContrastPair[];
  loanwords: Array<LoanwordInput & { lesson: string }>;
}

export type UnitDisplayStatus =
  | "locked"
  | "available"
  | "in-progress"
  | "passed"
  | "failed"
  | "skipped-unmastered";

/* ---------------------------------------------------------------------------------------- */
/* Configuration (extend here when new lessons bring new counters)                          */
/* ---------------------------------------------------------------------------------------- */

export const PASS_BAR = 0.8;

/** Which counter families each lesson introduces. Add an entry when authoring a new pack. */
export const COUNTER_KINDS_BY_LESSON: Record<string, CounterDrillKind[]> = {
  L01: ["time", "age", "schoolYear"],
  L02: ["yen", "number"],
};

const COUNTER_LABEL: Record<CounterDrillKind, string> = {
  time: "clock time (〜じ / 〜ふん・ぷん)",
  age: "age (〜さい, はたち)",
  schoolYear: "school year (〜ねんせい)",
  yen: "prices (〜えん, 100-99,999)",
  number: "bare numbers (4/7/9 readings, まん grouping)",
};

const COUNTER_NOTES: Record<CounterDrillKind, string[]> = {
  time: [
    "Irregular hours: 4:00 よじ, 7:00 しちじ, 9:00 くじ. Never よんじ / きゅうじ.",
    "Minutes ending in 1, 3, 4, 6, 8, 10 take ぷん (いっぷん, さんぷん, よんぷん, ろっぷん, はっぷん, じゅっぷん); others take ふん.",
    "Half past is はん; AM/PM (ごぜん / ごご) go BEFORE the hour.",
  ],
  age: ["1 いっさい, 8 はっさい, 10 じゅっさい, 20 はたち (special word)."],
  schoolYear: ["4th year is よねんせい (no ん). 1st いちねんせい, 2nd にねんせい, 3rd さんねんせい."],
  yen: [
    "300 さんびゃく, 600 ろっぴゃく, 800 はっぴゃく; 3,000 さんぜん, 8,000 はっせん.",
    "Japanese groups by 10,000 (まん): 10,000 = いちまん, 38,000 = さんまんはっせん.",
  ],
  number: ["4 = よん (or し), 7 = なな (or しち), 9 = きゅう (or く); counting usually prefers よん / なな / きゅう."],
};

const KANA_ROW_CHUNKS: Array<{ id: string; title: string; rows: string[]; subtitle: string }> = [
  { id: "kana-rows-1", title: "Hiragana & Katakana: あ・か・さ rows", rows: ["vowel", "k", "s"], subtitle: "15 characters, mnemonics first, then read them cold." },
  { id: "kana-rows-2", title: "Hiragana & Katakana: た・な・は rows", rows: ["t", "n", "h"], subtitle: "Includes the irregular ち / つ / ふ readings." },
  { id: "kana-rows-3", title: "Hiragana & Katakana: ま・や・ら・わ・ん", rows: ["m", "y", "r", "w", "n-final"], subtitle: "Finishes the 46 base kana." },
];

const MINUTES: Record<UnitKind, number> = {
  kana: 12,
  grammar: 8,
  vocab: 6,
  counters: 10,
  roleplay: 6,
  checkpoint: 6,
  cumulative: 12,
  preview: 10,
};

const VOCAB_CHUNK_MAX = 9;
const CLASSROOM_UNIT_MIN = 4;

/* ---------------------------------------------------------------------------------------- */
/* Builders                                                                                  */
/* ---------------------------------------------------------------------------------------- */

function harden(items: DrillItem[]): DrillItem[] {
  return items.map(asTyped);
}

function makeUnit(
  partial: Omit<StudyUnit, "checkpointPool" | "estimatedMinutes" | "passBar" | "gated" | "optional" | "romajiPolicy" | "drillSize"> &
    Partial<Pick<StudyUnit, "checkpointPool" | "estimatedMinutes" | "passBar" | "gated" | "optional" | "romajiPolicy" | "drillSize">>,
): StudyUnit {
  const drillItems = withSourceUnit(partial.drillItems, partial.id);
  const checkpointPool = withSourceUnit(partial.checkpointPool ?? harden(drillItems), partial.id);
  return {
    estimatedMinutes: MINUTES[partial.kind],
    passBar: PASS_BAR,
    gated: true,
    optional: false,
    romajiPolicy: "bridge-allowed",
    drillSize: Math.min(8, drillItems.length),
    ...partial,
    drillItems,
    checkpointPool,
  };
}

function buildKanaUnits(kana: KanaCurriculum): { units: StudyUnit[]; group: StudyGroup } {
  const units: StudyUnit[] = [];

  for (const chunk of KANA_ROW_CHUNKS) {
    const entries = kana.gojuon.filter((k) => chunk.rows.includes(k.row));
    const drills = [
      ...entries.map((k) => fromKana(k, { script: "hiragana", pool: kana.gojuon })),
      ...entries.map((k) => fromKana(k, { script: "katakana", pool: kana.gojuon })),
    ];
    units.push(
      makeUnit({
        id: chunk.id,
        groupId: "kana",
        lessonId: null,
        kind: "kana",
        title: chunk.title,
        subtitle: chunk.subtitle,
        teach: {
          heading: chunk.title,
          intro:
            "Recognition beats handwriting tonight: Genki prints no romaji from Lesson 3. Read each card, say the sound, picture the mnemonic, move on.",
          bullets: entries.filter((k) => k.irregularNote).map((k) => `${k.hiragana} / ${k.katakana}: ${k.irregularNote}`),
          examples: [],
          kanaCards: entries,
        },
        drillItems: drills,
        drillSize: 10,
        checkpointSize: 10,
      }),
    );
  }

  const voicedPool = kana.voicing.flatMap((r) => r.pairs);
  const mechanicsWords: MechanicsWordInput[] = kana.mechanics.flatMap((m) =>
    m.examples.map((ex, idx) => ({
      id: `${m.id}-w${idx + 1}`,
      jp: ex.jp,
      romaji: ex.romaji,
      en: ex.en,
      rule: m.rule,
    })),
  );
  units.push(
    makeUnit({
      id: "kana-voicing",
      groupId: "kana",
      lessonId: null,
      kind: "kana",
      title: "Voicing marks, small っ, small ゃゅょ, long vowels",
      subtitle: "Four voicing switches plus the three spelling mechanics that change meaning.",
      teach: {
        heading: "Dakuten, handakuten and the small-kana mechanics",
        intro:
          "Two dots (゛) voice a consonant (k→g, s→z, t→d, h→b); a circle (゜) turns h into p. Small っ doubles the next consonant; small ゃゅょ glide; おう / えい stretch a vowel.",
        bullets: kana.voicing.map((r) => `${r.baseRow}: ${r.shift}`),
        examples: [],
        voicingRules: kana.voicing,
        mechanics: kana.mechanics,
      },
      drillItems: [
        ...voicedPool.map((p) => fromVoicedKana(p, voicedPool, "hiragana")),
        ...mechanicsWords.map((w) => fromMechanicsWord(w, mechanicsWords)),
      ],
      drillSize: 10,
      checkpointSize: 8,
    }),
  );

  units.push(
    makeUnit({
      id: "kana-contrasts",
      groupId: "kana",
      lessonId: null,
      kind: "kana",
      title: "Lookalike pairs: シ/ツ, ソ/ン, は/ほ, ね/れ/わ ...",
      subtitle: "The ten confusions that cost beginners the most reading time.",
      teach: {
        heading: "Lookalike contrast pairs",
        intro: "Each pair has one visual rule. Learn the rule, not the shapes in isolation.",
        bullets: kana.contrastPairs.map((p) => `${p.chars.join(" / ")}: ${p.visualRule}`),
        examples: [],
        contrastPairs: kana.contrastPairs,
      },
      drillItems: kana.contrastPairs.flatMap((p) => fromContrastPair(p, kana.gojuon)),
      drillSize: 10,
      checkpointSize: 10,
    }),
  );

  units.push(
    makeUnit({
      id: "kana-loanwords",
      groupId: "kana",
      lessonId: null,
      kind: "kana",
      title: "Katakana loanwords from Lessons 1-2",
      subtitle: "Real words you will meet in class: アメリカ, コンピューター, スマホ, コンビニ.",
      teach: {
        heading: "Decoding katakana loanwords",
        intro:
          "Read left to right, stretch any vowel before ー, and say it aloud: the English word usually pops out. ィ / ャ glides merge with the kana before them.",
        bullets: [
          "ー always lengthens the previous vowel (コーヒー = koohii).",
          "Small ッ doubles the next consonant just like っ.",
          "Country + じん = nationality, country + ご = language (except えいご).",
        ],
        examples: [],
        loanwords: kana.loanwords,
      },
      drillItems: kana.loanwords.map((w) => fromLoanword(w, kana.loanwords)),
      drillSize: 9,
      checkpointSize: 8,
    }),
  );

  return {
    units,
    group: {
      id: "kana",
      title: "Kana foundation",
      subtitle: "Read hiragana and katakana before anything else; everything after this assumes it.",
      unitIds: units.map((u) => u.id),
    },
  };
}

function kanaParts(kana: string): string[] {
  return kana
    .split("/")
    .map((p) => p.replace(/〜/g, "").trim())
    .filter((p) => p.length >= 2);
}

function vocabMentionedIn(grammar: GrammarPoint, vocab: VocabEntry[]): VocabEntry[] {
  const haystack = grammar.examples.map((e) => e.kana).join("\n");
  return vocab.filter((v) => kanaParts(v.kana).some((part) => haystack.includes(part)));
}

function chunkVocab(vocab: VocabEntry[]): VocabEntry[][] {
  if (vocab.length === 0) return [];
  const chunks = Math.ceil(vocab.length / VOCAB_CHUNK_MAX);
  const size = Math.ceil(vocab.length / chunks);
  const out: VocabEntry[][] = [];
  for (let i = 0; i < vocab.length; i += size) out.push(vocab.slice(i, i + size));
  return out;
}

function categoriesLabel(vocab: VocabEntry[]): string {
  return Array.from(new Set(vocab.map((v) => v.category))).join(" · ");
}

function buildLessonUnits(lesson: LessonPack): { units: StudyUnit[]; group: StudyGroup } {
  const units: StudyUnit[] = [];
  const groupId = lesson.id;
  const classroomAll = lesson.vocab.filter((v) => v.priority === "classroom");
  // A handful of classroom phrases rides along with core vocab; a real set (p.81) gets its own unit.
  const classroomStandalone = classroomAll.length >= CLASSROOM_UNIT_MIN;
  const coreVocab = [
    ...lesson.vocab.filter((v) => v.priority === "core"),
    ...(classroomStandalone ? [] : classroomAll),
  ];
  const classroomVocab = classroomStandalone ? classroomAll : [];
  const bonusVocab = lesson.vocab.filter((v) => v.priority === "bonus");
  const vocabPool = lesson.vocab;

  for (const g of lesson.grammar) {
    const clozes = lesson.clozeDrills.filter((c) => c.grammarId === g.id);
    const others = lesson.grammar.filter((x) => x.id !== g.id);
    const mentioned = vocabMentionedIn(g, coreVocab).slice(0, 4);
    const drills = [
      ...clozes.map(fromCloze),
      ...g.examples.map((_, idx) => fromGrammarExample(g, idx, others)),
      ...mentioned.map(fromVocabRecall),
    ];
    units.push(
      makeUnit({
        id: `${lesson.id}-g-${g.id}`,
        groupId,
        lessonId: lesson.id,
        kind: "grammar",
        title: `${g.code} ${g.title}`,
        subtitle: g.formula,
        romajiPolicy: lesson.romajiPolicy,
        teach: {
          heading: g.title,
          intro: g.summary,
          bullets: [`Mental model: ${g.mentalModel}`, ...g.traps.map((t) => `Trap: ${t}`)],
          examples: g.examples,
          grammar: g,
          vocabCards: mentioned,
        },
        drillItems: drills,
        drillSize: Math.min(8, drills.length),
        checkpointSize: Math.min(6, drills.length),
      }),
    );
  }

  chunkVocab(coreVocab).forEach((chunk, idx) => {
    const drills = [
      ...chunk.map(fromVocabRecall),
      ...chunk.map((v) => fromVocabRecognize(v, vocabPool)),
    ];
    units.push(
      makeUnit({
        id: `${lesson.id}-v-${idx + 1}`,
        groupId,
        lessonId: lesson.id,
        kind: "vocab",
        title: `Vocabulary ${idx + 1}: ${categoriesLabel(chunk)}`,
        subtitle: `${chunk.length} core words. Recall them from English, then recognise them from Japanese.`,
        romajiPolicy: lesson.romajiPolicy,
        teach: {
          heading: `Lesson ${lesson.number} vocabulary (${idx + 1})`,
          intro: "Say each word aloud twice. Notes in parentheses are the traps Genki tests.",
          bullets: chunk.filter((v) => v.note).map((v) => `${v.kana}: ${v.note}`),
          examples: [],
          vocabCards: idx === 0 && bonusVocab.length > 0 ? [...chunk, ...bonusVocab] : chunk,
        },
        drillItems: drills,
        drillSize: Math.min(8, drills.length),
        checkpointSize: Math.min(8, chunk.length),
      }),
    );
  });

  if (classroomVocab.length > 0) {
    const drills = [
      ...classroomVocab.map(fromVocabRecall),
      ...classroomVocab.map((v) => fromVocabRecognize(v, vocabPool)),
    ];
    units.push(
      makeUnit({
        id: `${lesson.id}-classroom`,
        groupId,
        lessonId: lesson.id,
        kind: "vocab",
        title: `Classroom survival phrases (Lesson ${lesson.number})`,
        subtitle: "What you say when you did not catch something. Needed live in class tonight.",
        romajiPolicy: lesson.romajiPolicy,
        teach: {
          heading: "Classroom expressions",
          intro: "These are the phrases that buy you time in class. Produce them from memory, not from recognition.",
          bullets: lesson.survivalNotes ?? [],
          examples: [],
          vocabCards: classroomVocab,
        },
        drillItems: drills,
        drillSize: Math.min(8, drills.length),
        checkpointSize: Math.min(6, classroomVocab.length),
      }),
    );
  }

  const counterKinds = COUNTER_KINDS_BY_LESSON[lesson.id] ?? [];
  if (counterKinds.length > 0) {
    const curated = counterKinds.flatMap((kind) => getCuratedCounterDrills(kind).map(fromCounterDrill));
    const generated = counterKinds.flatMap((kind) => generateCounterItems(kind, 6, `${lesson.id}-counters`));
    const drills = dedupeById([...curated, ...generated]);
    units.push(
      makeUnit({
        id: `${lesson.id}-counters`,
        groupId,
        lessonId: lesson.id,
        kind: "counters",
        title: `Numbers in use: ${counterKinds.map((k) => COUNTER_LABEL[k]).join(", ")}`,
        subtitle: "Produce the reading in kana or romaji. Sound shifts are the whole point.",
        romajiPolicy: lesson.romajiPolicy,
        teach: {
          heading: "Counters and sound shifts",
          intro:
            "Japanese numbers mutate when a counter follows. Learn the shift table once; every drill below is generated from the same rules.",
          bullets: counterKinds.flatMap((k) => COUNTER_NOTES[k]),
          examples: [],
          counterNotes: counterKinds.map((k) => COUNTER_LABEL[k]),
        },
        drillItems: drills,
        drillSize: 8,
        checkpointSize: 8,
      }),
    );
  }

  if (lesson.roleplays.length > 0) {
    const drills = lesson.roleplays.flatMap(fromRoleplay);
    units.push(
      makeUnit({
        id: `${lesson.id}-roleplay`,
        groupId,
        lessonId: lesson.id,
        kind: "roleplay",
        title: `Roleplay: ${lesson.roleplays.map((r) => r.title).join(" / ")}`,
        subtitle: "Pick the natural reply. Then open Sensei to run it live.",
        romajiPolicy: lesson.romajiPolicy,
        teach: {
          heading: "Scenario briefing",
          intro: lesson.roleplays.map((r) => `${r.title}: ${r.setting} You are ${r.yourRole}; partner is ${r.partnerRole}.`).join(" "),
          bullets: lesson.survivalNotes ?? [],
          examples: [],
          roleplays: lesson.roleplays,
        },
        drillItems: drills,
        drillSize: drills.length,
        checkpointSize: Math.min(4, drills.length),
      }),
    );
  }

  const lessonPool = dedupeById(units.flatMap((u) => u.checkpointPool));
  units.push(
    makeUnit({
      id: `${lesson.id}-checkpoint`,
      groupId,
      lessonId: lesson.id,
      kind: "checkpoint",
      title: `Lesson ${lesson.number} checkpoint`,
      subtitle: "Mixed quiz across the whole lesson. Weak items are sampled first.",
      romajiPolicy: lesson.romajiPolicy,
      teach: {
        heading: `Lesson ${lesson.number}: can you do these?`,
        intro: lesson.summary,
        bullets: lesson.goals,
        examples: [],
      },
      drillItems: [],
      drillSize: 0,
      checkpointPool: lessonPool,
      checkpointSize: Math.min(12, lessonPool.length),
    }),
  );

  return {
    units,
    group: {
      id: groupId,
      title: `Lesson ${lesson.number}: ${lesson.title}`,
      subtitle: lesson.summary,
      unitIds: units.map((u) => u.id),
    },
  };
}

function buildCumulativeUnit(groupUnits: StudyUnit[], lessons: LessonPack[]): StudyUnit {
  const pool = dedupeById(groupUnits.filter((u) => u.kind !== "checkpoint").flatMap((u) => u.checkpointPool));
  const first = lessons[0]?.id ?? "L00";
  const last = lessons[lessons.length - 1]?.id ?? first;
  return makeUnit({
    id: `cumulative-${first}-${last}`,
    groupId: "final",
    lessonId: null,
    kind: "cumulative",
    title: `Cumulative mock: kana + ${lessons.map((l) => `L${l.number}`).join(", ")}`,
    subtitle: "25 mixed items across everything so far. Shaky items are weighted in.",
    teach: {
      heading: "Final readiness check",
      intro:
        "This is the closest thing to walking into class. No hints, typed answers where possible, items drawn from every unit you have seen.",
      bullets: [
        "Pass bar is 80%. Below that, the score screen lists exactly what to retry.",
        "Anything you miss here drops back into the review queue.",
      ],
      examples: [],
    },
    drillItems: [],
    drillSize: 0,
    checkpointPool: pool,
    checkpointSize: Math.min(25, pool.length),
  });
}

function buildPreviewUnit(lesson: LessonPack): StudyUnit {
  const drills = [
    ...lesson.clozeDrills.map(fromCloze),
    ...lesson.grammar.flatMap((g) => g.examples.map((_, idx) => fromGrammarExample(g, idx, lesson.grammar.filter((x) => x.id !== g.id)))),
    ...lesson.vocab.filter((v) => v.priority === "core").slice(0, 4).map((v) => fromVocabRecognize(v, lesson.vocab)),
  ];
  return makeUnit({
    id: `preview-${lesson.id}`,
    groupId: "preview",
    lessonId: lesson.id,
    kind: "preview",
    title: `Preview: Lesson ${lesson.number} (${lesson.title})`,
    subtitle: "Optional, ungated. Ten minutes so tonight's class is not the first time you see 〜ます.",
    romajiPolicy: lesson.romajiPolicy,
    gated: false,
    optional: true,
    teach: {
      heading: lesson.title,
      intro: lesson.summary,
      bullets: [
        ...(lesson.survivalNotes ?? []),
        ...lesson.grammar.flatMap((g) => g.traps.map((t) => `Trap: ${t}`)),
      ],
      examples: lesson.grammar.flatMap((g) => g.examples),
      grammar: lesson.grammar[0],
      vocabCards: lesson.vocab,
    },
    drillItems: drills,
    drillSize: Math.min(6, drills.length),
    checkpointSize: Math.min(6, drills.length),
  });
}

/**
 * Derives the full guided path from content. Nothing here is hand-listed: adding a
 * complete LessonPack produces grammar, vocab, counter (if configured), roleplay and
 * checkpoint units automatically; the first bridge-status lesson becomes the preview.
 */
export function buildStudyPath(lessons: LessonPack[], kana: KanaCurriculum): StudyPath {
  const units: StudyUnit[] = [];
  const groups: StudyGroup[] = [];

  const kanaBlock = buildKanaUnits(kana);
  units.push(...kanaBlock.units);
  groups.push(kanaBlock.group);

  const complete = lessons.filter((l) => l.status === "complete").sort((a, b) => a.number - b.number);
  const lessonUnits: StudyUnit[] = [];
  for (const lesson of complete) {
    const built = buildLessonUnits(lesson);
    units.push(...built.units);
    lessonUnits.push(...built.units);
    groups.push(built.group);
  }

  if (complete.length > 0) {
    const cumulative = buildCumulativeUnit([...kanaBlock.units, ...lessonUnits], complete);
    units.push(cumulative);
    groups.push({
      id: "final",
      title: "Final readiness",
      subtitle: "One mixed mock before class.",
      unitIds: [cumulative.id],
    });
  }

  const preview = lessons
    .filter((l) => l.status === "bridge")
    .sort((a, b) => a.number - b.number)[0];
  if (preview) {
    const unit = buildPreviewUnit(preview);
    units.push(unit);
    groups.push({
      id: "preview",
      title: "Optional preview",
      subtitle: "A short look at what class covers next.",
      unitIds: [unit.id],
    });
  }

  return { units, groups };
}

/* ---------------------------------------------------------------------------------------- */
/* Gating                                                                                     */
/* ---------------------------------------------------------------------------------------- */

export function getUnitIndex(path: StudyPath, unitId: string): number {
  return path.units.findIndex((u) => u.id === unitId);
}

export function getUnitStatus(path: StudyPath, unitId: string, progress: ProgressSnapshot): UnitDisplayStatus {
  const idx = getUnitIndex(path, unitId);
  if (idx < 0) return "locked";
  const unit = path.units[idx];
  const rec = progress.pathUnits[unitId];
  if (rec) {
    if (rec.status === "passed") return "passed";
    if (rec.status === "failed") return "failed";
    if (rec.status === "skipped") return "skipped-unmastered";
    return "in-progress";
  }
  if (idx === 0 || unit.optional) return "available";
  const prev = path.units[idx - 1];
  const prevRec = progress.pathUnits[prev.id];
  if (prev.optional || !prev.gated) return "available";
  if (prevRec && (prevRec.status === "passed" || prevRec.status === "skipped")) return "available";
  return "locked";
}

export function isUnitOpenable(status: UnitDisplayStatus): boolean {
  return status !== "locked";
}

/** First unit the learner should work on next; null when the path is complete. */
export function nextRecommendedUnit(path: StudyPath, progress: ProgressSnapshot): StudyUnit | null {
  const statuses = path.units.map((u) => getUnitStatus(path, u.id, progress));
  const active = path.units.findIndex(
    (u, i) => !u.optional && (statuses[i] === "available" || statuses[i] === "in-progress" || statuses[i] === "failed"),
  );
  if (active >= 0) return path.units[active];
  const flagged = path.units.findIndex((_, i) => statuses[i] === "skipped-unmastered");
  if (flagged >= 0) return path.units[flagged];
  const optional = path.units.findIndex((u, i) => u.optional && statuses[i] !== "passed");
  if (optional >= 0) return path.units[optional];
  return null;
}

/** Marks every earlier non-passed, gated unit as skipped so `unitId` becomes available. */
export function jumpToUnit(path: StudyPath, progress: ProgressSnapshot, unitId: string, now = new Date()): ProgressSnapshot {
  const idx = getUnitIndex(path, unitId);
  if (idx <= 0) return progress;
  let next = progress;
  for (let i = 0; i < idx; i += 1) {
    const u = path.units[i];
    if (!u.gated || u.optional) continue;
    const rec = next.pathUnits[u.id];
    if (rec?.status === "passed") continue;
    next = markUnitSkipped(next, u.id, now);
  }
  return next;
}

/* ---------------------------------------------------------------------------------------- */
/* Item selection                                                                             */
/* ---------------------------------------------------------------------------------------- */

function masteryRank(progress: ProgressSnapshot, id: string): number {
  const level = classifyMastery(progress.items[id]);
  if (level === "shaky") return 0;
  if (level === "unseen") return 1;
  if (level === "learning") return 2;
  return 3;
}

function pickWeighted(pool: DrillItem[], size: number, progress: ProgressSnapshot, seed: string): DrillItem[] {
  const shuffled = seededShuffle(pool, seed);
  const ranked = [...shuffled].sort((a, b) => masteryRank(progress, a.id) - masteryRank(progress, b.id));
  const out: DrillItem[] = [];
  const usedIds = new Set<string>();
  for (const item of ranked) {
    if (out.length >= size) break;
    if (usedIds.has(item.id)) continue;
    usedIds.add(item.id);
    out.push(item);
  }
  // Pool smaller than size in unique ids: allow repeats by variant.
  if (out.length < size) {
    for (const item of ranked) {
      if (out.length >= size) break;
      if (out.some((o) => o.variantKey === item.variantKey)) continue;
      out.push(item);
    }
  }
  return seededShuffle(out, `${seed}:final`);
}

/** Micro-drill prompts: unseen and shaky first so each pass teaches something new. */
export function selectDrillItems(unit: StudyUnit, progress: ProgressSnapshot, pass = 0): DrillItem[] {
  if (unit.drillItems.length === 0) return [];
  return pickWeighted(unit.drillItems, unit.drillSize, progress, `${unit.id}:drill:${pass}`);
}

/** Checkpoint prompts: deterministic per (unit, attempt), weak items sampled first. */
export function selectCheckpointItems(unit: StudyUnit, progress: ProgressSnapshot, attempt = 0): DrillItem[] {
  if (unit.checkpointPool.length === 0) return [];
  return pickWeighted(unit.checkpointPool, unit.checkpointSize, progress, `${unit.id}:checkpoint:${attempt}`);
}

/**
 * Cumulative review after a passed checkpoint: due items first, then shaky, then
 * learning, then anything else from units before `upToUnitId`.
 */
export function selectReviewItems(
  path: StudyPath,
  progress: ProgressSnapshot,
  upToUnitId: string,
  n: number,
  now = new Date(),
): DrillItem[] {
  const idx = getUnitIndex(path, upToUnitId);
  if (idx <= 0 || n <= 0) return [];
  const earlier = path.units.slice(0, idx).filter((u) => u.kind !== "checkpoint" && u.kind !== "cumulative");
  const pool = dedupeById(earlier.flatMap((u) => u.checkpointPool));
  if (pool.length === 0) return [];

  const nowMs = now.getTime();
  const rank = (item: DrillItem): number => {
    const m = progress.items[item.id];
    if (!m) return 3;
    const due = Date.parse(m.nextDueAt) <= nowMs;
    const level = classifyMastery(m);
    if (due && level === "shaky") return 0;
    if (due) return 1;
    if (level === "shaky") return 1;
    if (level === "learning") return 2;
    return 4;
  };
  const shuffled = seededShuffle(pool, `${upToUnitId}:review:${Math.floor(nowMs / 60_000)}`);
  return [...shuffled].sort((a, b) => rank(a) - rank(b)).slice(0, n);
}

/* ---------------------------------------------------------------------------------------- */
/* Readiness summary and pace                                                                 */
/* ---------------------------------------------------------------------------------------- */

export interface GroupReadiness {
  groupId: string;
  title: string;
  unitsTotal: number;
  unitsPassed: number;
  unitsSkipped: number;
  itemsTotal: number;
  itemsSolid: number;
  itemsShaky: number;
  masteryPct: number; // 0..100
}

export interface WeakItemSummary {
  id: string;
  label: string;
  unitTitle: string;
  lapses: number;
  accuracy: number;
}

export interface ReadinessSummary {
  groups: GroupReadiness[];
  weakest: WeakItemSummary[];
  flaggedUnits: StudyUnit[];
  unitsPassed: number;
  unitsTotal: number;
  overallPct: number;
  paceRatio: number;
  estimatedRemainingMinutes: number;
  isComplete: boolean;
}

export function summarizeReadiness(path: StudyPath, progress: ProgressSnapshot, weakestLimit = 10): ReadinessSummary {
  const itemLabel = new Map<string, { label: string; unitTitle: string }>();
  for (const u of path.units) {
    for (const it of u.drillItems) {
      if (!itemLabel.has(it.id)) {
        itemLabel.set(it.id, {
          label: it.prompt.text ?? it.prompt.segments?.map((s) => s.text).join("") ?? it.answerDisplay,
          unitTitle: u.title,
        });
      }
    }
  }

  const groups: GroupReadiness[] = path.groups.map((g) => {
    const units = g.unitIds.map((id) => path.units.find((u) => u.id === id)!).filter(Boolean);
    const ids = new Set(units.flatMap((u) => u.drillItems.map((i) => i.id)));
    let solid = 0;
    let shaky = 0;
    for (const id of ids) {
      const level = classifyMastery(progress.items[id]);
      if (level === "solid") solid += 1;
      if (level === "shaky") shaky += 1;
    }
    const statuses = units.map((u) => getUnitStatus(path, u.id, progress));
    return {
      groupId: g.id,
      title: g.title,
      unitsTotal: units.length,
      unitsPassed: statuses.filter((s) => s === "passed").length,
      unitsSkipped: statuses.filter((s) => s === "skipped-unmastered").length,
      itemsTotal: ids.size,
      itemsSolid: solid,
      itemsShaky: shaky,
      masteryPct: ids.size === 0 ? 0 : Math.round((solid / ids.size) * 100),
    };
  });

  const weakest: WeakItemSummary[] = Object.values(progress.items)
    .filter((m) => itemLabel.has(m.id) && classifyMastery(m) === "shaky")
    .sort((a, b) => b.lapses - a.lapses || a.correct / a.attempts - b.correct / b.attempts)
    .slice(0, weakestLimit)
    .map((m) => ({
      id: m.id,
      label: itemLabel.get(m.id)!.label,
      unitTitle: itemLabel.get(m.id)!.unitTitle,
      lapses: m.lapses,
      accuracy: m.attempts === 0 ? 0 : m.correct / m.attempts,
    }));

  const statuses = path.units.map((u) => getUnitStatus(path, u.id, progress));
  const flaggedUnits = path.units.filter((_, i) => statuses[i] === "skipped-unmastered");
  const required = path.units.filter((u) => !u.optional);
  const unitsPassed = required.filter((u) => progress.pathUnits[u.id]?.status === "passed").length;

  let observedSeconds = 0;
  let expectedSeconds = 0;
  for (const u of path.units) {
    const rec = progress.pathUnits[u.id];
    if (rec?.status === "passed" && rec.elapsedSeconds > 0) {
      observedSeconds += rec.elapsedSeconds;
      expectedSeconds += u.estimatedMinutes * 60;
    }
  }
  const rawRatio = expectedSeconds > 0 ? observedSeconds / expectedSeconds : 1;
  const paceRatio = Math.min(2.5, Math.max(0.5, rawRatio));
  const remainingBase = required
    .filter((u) => progress.pathUnits[u.id]?.status !== "passed")
    .reduce((acc, u) => acc + u.estimatedMinutes, 0);

  return {
    groups,
    weakest,
    flaggedUnits,
    unitsPassed,
    unitsTotal: required.length,
    overallPct: required.length === 0 ? 0 : Math.round((unitsPassed / required.length) * 100),
    paceRatio,
    estimatedRemainingMinutes: Math.round(remainingBase * paceRatio),
    isComplete: unitsPassed === required.length,
  };
}

export function formatMinutes(total: number): string {
  if (total <= 0) return "0 min";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

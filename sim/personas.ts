/**
 * Synthetic learner personas. Pure data: a base accuracy, per-trap fall-through rates,
 * a response-time model, and a fatigue slope. The simulator (`run.ts`) turns these into
 * answers for real `DrillItem`s using each trap's `slip()`.
 *
 * There is no public dataset of Genki-level learner errors, so the personas are built
 * from the curriculum's own trap catalog (`src/engine/traps.ts`). Rates are deliberately
 * exaggerated so each persona exercises a distinct failure mode.
 */
export interface Persona {
  id: string;
  description: string;
  /** Probability of a correct answer on an item with no trap (before fatigue). */
  baseAccuracy: number;
  /** Probability of falling for a given trap when the item exercises it. Default applies to unlisted traps. */
  trapRates: Record<string, number>;
  defaultTrapRate: number;
  /** Mean response time in ms and a multiplier for typed items. */
  msMean: number;
  typedMsFactor: number;
  /** When the learner is in bridge mode, chance they answer in romaji rather than kana (typed items). */
  romajiDependence: number;
  /** Accuracy lost per 10 answered items (0.02 = 2 points per 10 items). */
  fatigueSlope: number;
  /** Display mode this persona studies in. */
  mode: "bridge" | "classroom" | "immersion";
  /** Share of a realistic population (`pnpm sim --population N` samples by this). */
  weight: number;
  /** Edge-case behaviours layered on top of the accuracy model. */
  quirks?: Quirks;
}

export interface Quirks {
  /** Chance a typed answer is submitted empty (tapped Check too early). */
  blankRate?: number;
  /** Chance a correct typed answer carries paste noise: trailing 。, spaces, a stray full-width space. */
  noiseRate?: number;
  /** Chance of typing the English meaning instead of Japanese ("four" for よん). */
  englishRate?: number;
  /** After this many misses in a row the learner stops trying and types わかりません / ?. */
  giveUpAfter?: number;
  /** Types romaji even in classroom/immersion mode (where the app expects kana). */
  romajiEverywhere?: boolean;
  /** In the free-form sentence session, chance each message is off-topic or out of scope. */
  offTopicRate?: number;
  /** Runs the sentence session at all (default 0.4 in population mode). */
  sentenceSessionRate?: number;
}

export const PERSONAS: Persona[] = [
  {
    id: "steady-median",
    description: "The typical engaged crammer: mostly right, slips on the famous traps about a third of the time.",
    baseAccuracy: 0.86,
    trapRates: {},
    defaultTrapRate: 0.35,
    msMean: 3800,
    typedMsFactor: 1.6,
    romajiDependence: 0.5,
    fatigueSlope: 0.01,
    mode: "bridge",
    weight: 0.3,
  },
  {
    id: "rushed-guesser",
    description: "Fast and careless; answers in under two seconds and falls for most traps.",
    baseAccuracy: 0.7,
    trapRates: {},
    defaultTrapRate: 0.6,
    msMean: 1500,
    typedMsFactor: 1.2,
    romajiDependence: 0.8,
    fatigueSlope: 0.02,
    mode: "bridge",
    weight: 0.12,
  },
  {
    id: "slow-accurate",
    description: "Thinks for a long time and is usually right; weak only on the phonetic counter shifts.",
    baseAccuracy: 0.95,
    trapRates: { "hundreds-voicing": 0.4, "thousands-voicing": 0.4, "minute-pun-fun": 0.35 },
    defaultTrapRate: 0.12,
    msMean: 7500,
    typedMsFactor: 1.5,
    romajiDependence: 0.2,
    fatigueSlope: 0.005,
    mode: "classroom",
    weight: 0.12,
  },
  {
    id: "romaji-dependent",
    description: "Reads romaji fluently but kana recognition is weak; every kana item is a coin flip, counters are fine.",
    baseAccuracy: 0.9,
    trapRates: {
      "pair-shi-tsu": 0.7,
      "pair-so-n": 0.7,
      "pair-ha-ho": 0.6,
      "pair-sa-ki": 0.6,
      "pair-ne-re-wa": 0.6,
      "pair-nu-me": 0.6,
      "pair-ru-ro": 0.5,
      "pair-u-wa-fu": 0.5,
      "pair-ma-mu-a": 0.5,
      "pair-ku-ke-ta": 0.5,
      "voicing-marks": 0.45,
      "sokuon-long-vowel": 0.5,
    },
    defaultTrapRate: 0.2,
    msMean: 4500,
    typedMsFactor: 1.4,
    romajiDependence: 0.95,
    fatigueSlope: 0.01,
    mode: "bridge",
    weight: 0.08,
  },
  {
    id: "kana-confuser",
    description: "Specifically confuses the katakana lookalikes シ/ツ and ソ/ン and the hiragana は/ほ; everything else is solid.",
    baseAccuracy: 0.92,
    trapRates: { "pair-shi-tsu": 0.85, "pair-so-n": 0.85, "pair-ha-ho": 0.7 },
    defaultTrapRate: 0.15,
    msMean: 3200,
    typedMsFactor: 1.5,
    romajiDependence: 0.3,
    fatigueSlope: 0.008,
    mode: "classroom",
    weight: 0.06,
  },
  {
    id: "counter-trap-prone",
    description: "Says よんねんせい, よんじ, にじゅっさい: knows the numbers, misses every irregular reading.",
    baseAccuracy: 0.9,
    trapRates: {
      "year-4-yonensei": 0.9,
      "hour-4-yoji": 0.85,
      "hour-7-shichiji": 0.6,
      "hour-9-kuji": 0.8,
      "age-20-hatachi": 0.85,
      "age-sai-clipping": 0.5,
      "minute-pun-fun": 0.6,
      "hundreds-voicing": 0.6,
      "thousands-voicing": 0.6,
      "man-grouping": 0.5,
    },
    defaultTrapRate: 0.15,
    msMean: 4200,
    typedMsFactor: 1.5,
    romajiDependence: 0.4,
    fatigueSlope: 0.01,
    mode: "bridge",
    weight: 0.06,
  },
  {
    id: "perfectionist",
    description: "The ideal case: nearly everything right, rarely needs the Sensei. Most sessions produce no agent call at all.",
    baseAccuracy: 0.99,
    trapRates: {},
    defaultTrapRate: 0.04,
    msMean: 2600,
    typedMsFactor: 1.4,
    romajiDependence: 0.1,
    fatigueSlope: 0.002,
    mode: "classroom",
    weight: 0.08,
    quirks: { sentenceSessionRate: 0.7 },
  },
  {
    id: "night-crammer",
    description: "Starts sharp and fades hard: accuracy drops about six points per ten items, so late units are where the misses pile up.",
    baseAccuracy: 0.92,
    trapRates: {},
    defaultTrapRate: 0.3,
    msMean: 3000,
    typedMsFactor: 1.6,
    romajiDependence: 0.4,
    fatigueSlope: 0.06,
    mode: "bridge",
    weight: 0.06,
  },
  {
    id: "give-up-quitter",
    description: "Edge case: after two misses in a row types わかりません or ? for the rest of the set. The Sensei has to notice the learner has stopped trying.",
    baseAccuracy: 0.72,
    trapRates: {},
    defaultTrapRate: 0.5,
    msMean: 2200,
    typedMsFactor: 1.1,
    romajiDependence: 0.6,
    fatigueSlope: 0.02,
    mode: "bridge",
    weight: 0.04,
    quirks: { giveUpAfter: 2 },
  },
  {
    id: "romaji-only",
    description: "Edge case: set the app to classroom mode but still types romaji for everything, so every typed kana answer is marked wrong and the Sensei must answer in kana without echoing romaji.",
    baseAccuracy: 0.9,
    trapRates: {},
    defaultTrapRate: 0.25,
    msMean: 3500,
    typedMsFactor: 1.3,
    romajiDependence: 1,
    fatigueSlope: 0.01,
    mode: "classroom",
    weight: 0.03,
    quirks: { romajiEverywhere: true },
  },
  {
    id: "sloppy-typist",
    description: "Edge case: right answers with paste noise (trailing 。, spaces), the odd blank submit, and the occasional English word. Tests how the grader and the Sensei handle near-misses.",
    baseAccuracy: 0.9,
    trapRates: {},
    defaultTrapRate: 0.3,
    msMean: 2800,
    typedMsFactor: 1.3,
    romajiDependence: 0.3,
    fatigueSlope: 0.01,
    mode: "bridge",
    weight: 0.03,
    quirks: { blankRate: 0.08, noiseRate: 0.35, englishRate: 0.08 },
  },
  {
    id: "off-topic-asker",
    description: "Edge case: uses the sentence checker as a general chatbot: asks about kanji, て-form, how to say things, or just chats. Scope control is the whole test.",
    baseAccuracy: 0.85,
    trapRates: {},
    defaultTrapRate: 0.35,
    msMean: 3500,
    typedMsFactor: 1.5,
    romajiDependence: 0.5,
    fatigueSlope: 0.01,
    mode: "bridge",
    weight: 0.02,
    quirks: { offTopicRate: 0.7, sentenceSessionRate: 1 },
  },
];

export const PERSONA_BY_ID = new Map(PERSONAS.map((p) => [p.id, p]));

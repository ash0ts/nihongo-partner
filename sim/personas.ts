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
  },
];

export const PERSONA_BY_ID = new Map(PERSONAS.map((p) => [p.id, p]));

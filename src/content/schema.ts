import { z } from "zod";

export type DisplayMode = "bridge" | "classroom" | "immersion";

export const TextSegmentSchema = z.object({
  text: z.string().min(1),
  furigana: z.string().min(1).optional(),
});
export type TextSegment = z.infer<typeof TextSegmentSchema>;

export const JapaneseLineSchema = z.object({
  segments: z.array(TextSegmentSchema).min(1),
  kana: z.string().min(1),
  romaji: z.string().min(1),
  en: z.string().min(1),
  literalEn: z.string().optional(),
});
export type JapaneseLine = z.infer<typeof JapaneseLineSchema>;

export const KanaEntrySchema = z.object({
  id: z.string().min(1),
  hiragana: z.string().min(1),
  katakana: z.string().min(1),
  romaji: z.string().min(1),
  row: z.string().min(1),
  col: z.enum(["a", "i", "u", "e", "o", "n", "ya", "yu", "yo"]),
  kind: z.enum(["gojuon", "dakuten", "handakuten", "combo"]),
  hiraMnemonic: z.string().min(1),
  kataMnemonic: z.string().min(1),
  irregularNote: z.string().optional(),
});
export type KanaEntry = z.infer<typeof KanaEntrySchema>;

export const ContrastPairSchema = z.object({
  id: z.string().min(1),
  script: z.enum(["hiragana", "katakana"]),
  chars: z.array(z.string().min(1)).min(2).max(3),
  romaji: z.array(z.string().min(1)).min(2).max(3),
  title: z.string().min(1),
  visualRule: z.string().min(1),
  drillWords: z
    .array(
      z.object({
        jp: z.string().min(1),
        romaji: z.string().min(1),
        en: z.string().min(1),
      }),
    )
    .min(2),
});
export type ContrastPair = z.infer<typeof ContrastPairSchema>;

export const VocabEntrySchema = z.object({
  id: z.string().min(1),
  lessonId: z.string().min(1),
  category: z.string().min(1),
  segments: z.array(TextSegmentSchema).min(1),
  kana: z.string().min(1),
  romaji: z.string().min(1),
  en: z.string().min(1),
  priority: z.enum(["core", "classroom", "bonus"]),
  note: z.string().optional(),
});
export type VocabEntry = z.infer<typeof VocabEntrySchema>;

export const GrammarPointSchema = z.object({
  id: z.string().min(1),
  lessonId: z.string().min(1),
  code: z.string().min(1),
  title: z.string().min(1),
  formula: z.string().min(1),
  summary: z.string().min(1),
  mentalModel: z.string().min(1),
  traps: z.array(z.string().min(1)).min(1),
  examples: z.array(JapaneseLineSchema).min(2),
});
export type GrammarPoint = z.infer<typeof GrammarPointSchema>;

export const ClozeExerciseSchema = z.object({
  id: z.string().min(1),
  lessonId: z.string().min(1),
  grammarId: z.string().min(1),
  promptEn: z.string().min(1),
  beforeSegments: z.array(TextSegmentSchema),
  blankAnswerKana: z.string().min(1),
  acceptedAnswers: z.array(z.string().min(1)).min(1),
  afterSegments: z.array(TextSegmentSchema),
  options: z.array(z.string().min(1)).min(3).max(4),
  explanation: z.string().min(1),
  trapWarning: z.string().optional(),
});
export type ClozeExercise = z.infer<typeof ClozeExerciseSchema>;

export const RoleplayTurnSchema = z.object({
  speakerName: z.string().min(1),
  promptJp: JapaneseLineSchema,
  goalEn: z.string().min(1),
  choices: z
    .array(
      z.object({
        jp: z.string().min(1),
        kana: z.string().min(1),
        romaji: z.string().min(1),
        en: z.string().min(1),
        isCorrect: z.boolean(),
        feedback: z.string().min(1),
      }),
    )
    .min(3),
});
export type RoleplayTurn = z.infer<typeof RoleplayTurnSchema>;

export const RoleplayScenarioSchema = z.object({
  id: z.string().min(1),
  lessonId: z.string().min(1),
  title: z.string().min(1),
  setting: z.string().min(1),
  yourRole: z.string().min(1),
  partnerRole: z.string().min(1),
  turns: z.array(RoleplayTurnSchema).min(2),
});
export type RoleplayScenario = z.infer<typeof RoleplayScenarioSchema>;

export const LessonPackSchema = z.object({
  id: z.string().regex(/^L\d{2}$/),
  number: z.number().int().min(0).max(23),
  slug: z.string().min(1),
  title: z.string().min(1),
  jpTitle: JapaneseLineSchema,
  status: z.enum(["complete", "bridge"]),
  romajiPolicy: z.enum(["bridge-allowed", "no-romaji"]),
  estimatedMinutes: z.number().int().positive(),
  summary: z.string().min(1),
  goals: z.array(z.string().min(1)).min(2),
  grammar: z.array(GrammarPointSchema).min(1),
  vocab: z.array(VocabEntrySchema).min(5),
  clozeDrills: z.array(ClozeExerciseSchema).min(2),
  roleplays: z.array(RoleplayScenarioSchema),
  survivalNotes: z.array(z.string().min(1)).optional(),
});
export type LessonPack = z.infer<typeof LessonPackSchema>;

/** Helper to create plain kana/katakana segments with no kanji furigana needed. */
export function seg(text: string, furigana?: string): TextSegment {
  return furigana ? { text, furigana } : { text };
}

export function line(
  segments: TextSegment[],
  kana: string,
  romaji: string,
  en: string,
  literalEn?: string,
): JapaneseLine {
  return literalEn ? { segments, kana, romaji, en, literalEn } : { segments, kana, romaji, en };
}

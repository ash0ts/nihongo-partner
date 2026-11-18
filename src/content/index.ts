import {
  CONTRAST_PAIRS,
  GOJUON_KANA,
  KATAKANA_LOANWORD_DRILLS,
  ORTHOGRAPHY_MECHANICS,
  VOICING_RULES,
} from "./kana";
import { LESSON_00 } from "./lessons/lesson-00-greetings";
import { LESSON_01 } from "./lessons/lesson-01-new-friends";
import { LESSON_02 } from "./lessons/lesson-02-shopping";
import { LESSON_03_BRIDGE } from "./lessons/lesson-03-bridge";
import { LESSON_04_BRIDGE } from "./lessons/lesson-04-bridge";
import type { ClozeExercise, GrammarPoint, LessonPack, RoleplayScenario, VocabEntry } from "./schema";

export const LESSONS: LessonPack[] = [
  LESSON_00,
  LESSON_01,
  LESSON_02,
  LESSON_03_BRIDGE,
  LESSON_04_BRIDGE,
];

export const CRAM_LESSONS: LessonPack[] = LESSONS.filter((l) => l.status === "complete");

export const ALL_VOCAB: VocabEntry[] = LESSONS.flatMap((l) => l.vocab);
export const ALL_GRAMMAR: GrammarPoint[] = LESSONS.flatMap((l) => l.grammar);
export const ALL_CLOZE: ClozeExercise[] = LESSONS.flatMap((l) => l.clozeDrills);
export const ALL_ROLEPLAYS: RoleplayScenario[] = LESSONS.flatMap((l) => l.roleplays);

export {
  CONTRAST_PAIRS,
  GOJUON_KANA,
  KATAKANA_LOANWORD_DRILLS,
  ORTHOGRAPHY_MECHANICS,
  VOICING_RULES,
};

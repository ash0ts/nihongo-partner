import { describe, expect, it } from "vitest";
import { ALL_CLOZE, ALL_VOCAB, CONTRAST_PAIRS, GOJUON_KANA, LESSONS } from "./index";
import { LessonPackSchema } from "./schema";

describe("Curriculum Packs Integrity", () => {
  it("contains all 46 Gojūon characters and 10 contrast sets", () => {
    expect(GOJUON_KANA).toHaveLength(46);
    expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(10);
  });

  it("validates L00..L04 packs against LessonPackSchema", () => {
    for (const lesson of LESSONS) {
      const parsed = LessonPackSchema.safeParse(lesson);
      expect(parsed.success, lesson.id).toBe(true);
    }
    expect(ALL_VOCAB.length).toBeGreaterThanOrEqual(75);
    expect(ALL_CLOZE.length).toBeGreaterThanOrEqual(18);
  });
});

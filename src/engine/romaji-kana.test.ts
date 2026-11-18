import { describe, expect, it } from "vitest";
import { isAnswerAccepted, katakanaToHiragana, romajiToHiragana } from "./romaji-kana";

describe("Romaji / Kana Normalizer & Answer Grader", () => {
  it("converts core romaji, glides, and double consonants accurately", () => {
    expect(romajiToHiragana("watashi")).toBe("わたし");
    expect(romajiToHiragana("ryuugakusei")).toBe("りゅうがくせい");
    expect(romajiToHiragana("roppyaku")).toBe("ろっぴゃく");
    expect(romajiToHiragana("chotto")).toBe("ちょっと");
    expect(romajiToHiragana("konnichiwa")).toBe("こんにちわ");
    expect(romajiToHiragana("sanzen")).toBe("さんぜん");
  });

  it("normalizes katakana to hiragana for tolerant comparison", () => {
    expect(katakanaToHiragana("アメリカ")).toBe("あめりか");
  });

  it("grades kana, romaji, and topic particle は/wa properly", () => {
    expect(isAnswerAccepted("よじ", ["よじ"], ["yoji"])).toBe(true);
    expect(isAnswerAccepted("yoji", ["よじ"], ["yoji"])).toBe(true);
    expect(isAnswerAccepted("yonji", ["よじ"], ["yoji"])).toBe(false);
    expect(isAnswerAccepted("wa", ["は"])).toBe(true);
    expect(isAnswerAccepted("は", ["は"])).toBe(true);
  });
});

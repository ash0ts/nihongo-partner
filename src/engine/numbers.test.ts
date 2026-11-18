import { describe, expect, it } from "vitest";
import {
  spellAge,
  spellClockTime,
  spellInteger,
  spellSchoolYear,
  spellYen,
} from "./numbers";

describe("Japanese Compositional Number & Counter Oracle", () => {
  it("spells 0..99 cleanly", () => {
    expect(spellInteger(0).kana).toBe("ゼロ");
    expect(spellInteger(7).kana).toBe("なな");
    expect(spellInteger(14).kana).toBe("じゅうよん");
    expect(spellInteger(42).kana).toBe("よんじゅうに");
  });

  it("handles all three hundred-level phonetic mutations (300, 600, 800)", () => {
    expect(spellInteger(100).kana).toBe("ひゃく");
    expect(spellInteger(300).kana).toBe("さんびゃく");
    expect(spellInteger(600).kana).toBe("ろっぴゃく");
    expect(spellInteger(800).kana).toBe("はっぴゃく");
    expect(spellInteger(300).mutations.length).toBeGreaterThan(0);
    expect(spellInteger(600).mutations.length).toBeGreaterThan(0);
    expect(spellInteger(800).mutations.length).toBeGreaterThan(0);
  });

  it("handles all thousand-level phonetic mutations (1000, 3000, 8000)", () => {
    expect(spellInteger(1000).kana).toBe("せん");
    expect(spellInteger(3000).kana).toBe("さんぜん");
    expect(spellInteger(8000).kana).toBe("はっせん");
  });

  it("groups large numbers by 10^4 (まん) rather than 10^3", () => {
    expect(spellYen(10_000).kana).toBe("いちまんえん");
    expect(spellYen(38_000).kana).toBe("さんまんはっせんえん");
    expect(spellYen(2_600).kana).toBe("にせんろっぴゃくえん");
  });

  it("enforces irregular hours (4:00 yoji, 7:00 shichiji, 9:00 kuji) and -fun/-pun alternation", () => {
    expect(spellClockTime(4, 0).kana).toBe("よじ");
    expect(spellClockTime(7, 0).kana).toBe("しちじ");
    expect(spellClockTime(9, 0).kana).toBe("くじ");
    expect(spellClockTime(9, 30, "am").kana).toBe("ごぜんくじはん");
    expect(spellClockTime(3, 1).kana).toBe("さんじいっぷん");
    expect(spellClockTime(2, 5).kana).toBe("にじごふん");
    expect(spellClockTime(11, 6).kana).toBe("じゅういちじろっぷん");
    expect(spellClockTime(8, 4).kana).toBe("はちじよんぷん");
    expect(spellClockTime(7, 10, "pm").kana).toBe("ごごしちじじゅっぷん");
    expect(spellClockTime(7, 10, "pm").acceptedKana).toContain("ごごしちじじっぷん");
  });

  it("handles age irregulars including 20 -> hatachi and 1/8/10 clips", () => {
    expect(spellAge(1).kana).toBe("いっさい");
    expect(spellAge(8).kana).toBe("はっさい");
    expect(spellAge(10).kana).toBe("じゅっさい");
    expect(spellAge(20).kana).toBe("はたち");
    expect(spellAge(21).kana).toBe("にじゅういっさい");
  });

  it("enforces 4th-year student -> yonensei (drops n)", () => {
    expect(spellSchoolYear(1).kana).toBe("いちねんせい");
    expect(spellSchoolYear(4).kana).toBe("よねんせい");
  });
});

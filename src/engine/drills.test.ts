import { describe, expect, it } from "vitest";
import { CONTRAST_PAIRS, GOJUON_KANA, KATAKANA_LOANWORD_DRILLS, LESSONS } from "../content";
import {
  asTyped,
  fromCloze,
  fromContrastPair,
  fromCounterDrill,
  fromGrammarExample,
  fromKana,
  fromLoanword,
  fromRoleplay,
  fromVocabRecall,
  fromVocabRecognize,
  generateCounterItems,
  grade,
  seededShuffle,
} from "./drills";
import { getCuratedCounterDrills } from "./numbers";

const L01 = LESSONS.find((l) => l.id === "L01")!;

describe("drills: builders", () => {
  it("builds kana items with 4 unique options containing the answer", () => {
    const shi = GOJUON_KANA.find((k) => k.id === "kana-shi")!;
    const item = fromKana(shi, { script: "hiragana", pool: GOJUON_KANA });
    expect(item.options).toHaveLength(4);
    expect(new Set(item.options).size).toBe(4);
    expect(item.options).toContain("shi");
    expect(item.id).toBe("kana-shi");
    expect(grade(item, "shi")).toBe(true);
    expect(grade(item, "si")).toBe(true);
    expect(grade(item, "し")).toBe(true);
    expect(grade(item, "tsu")).toBe(false);
  });

  it("maps contrast-pair characters back onto gojuon mastery ids", () => {
    const pair = CONTRAST_PAIRS.find((p) => p.id === "pair-shi-tsu")!;
    const items = fromContrastPair(pair, GOJUON_KANA);
    expect(items.map((i) => i.id)).toEqual(["kana-shi", "kana-tsu"]);
    expect(items[1].options).toEqual(expect.arrayContaining(["shi", "tsu"]));
  });

  it("grades vocab recall in kana or romaji and splits slash variants", () => {
    const nensei = L01.vocab.find((v) => v.id === "v01-nensei")!;
    const item = fromVocabRecall(nensei);
    expect(grade(item, "nensei")).toBe(true);
    expect(grade(item, "ねんせい")).toBe(true);

    const majors = L01.vocab.find((v) => v.id === "v01-keizai-kougaku")!;
    const majorsItem = fromVocabRecall(majors);
    expect(grade(majorsItem, "keizai")).toBe(true);
    expect(grade(majorsItem, "こうがく")).toBe(true);
    expect(grade(majorsItem, "gakusei")).toBe(false);
  });

  it("builds vocab recognition with english options and exact-match grading", () => {
    const item = fromVocabRecognize(L01.vocab[0], L01.vocab);
    expect(item.options).toContain(item.answerDisplay);
    expect(grade(item, item.answerDisplay)).toBe(true);
    expect(item.typedCapable).toBe(false);
    expect(asTyped(item)).toBe(item);
  });

  it("builds cloze items that accept wa/ha for は and o/wo for を", () => {
    const c01 = L01.clozeDrills.find((c) => c.id === "c01-1")!;
    const item = fromCloze(c01);
    expect(item.options).toHaveLength(c01.options.length);
    expect(grade(item, "wa")).toBe(true);
    expect(grade(item, "は")).toBe(true);
    expect(grade(item, "わ")).toBe(true);
    expect(grade(item, "の")).toBe(false);
    const typed = asTyped(item);
    expect(typed.answerKind).toBe("typed");
    expect(typed.options).toBeUndefined();

    const l03 = LESSONS.find((l) => l.id === "L03")!;
    const wo = fromCloze(l03.clozeDrills.find((c) => c.id === "c03-2")!);
    expect(grade(wo, "o")).toBe(true);
    expect(grade(wo, "wo")).toBe(true);
    expect(grade(wo, "を")).toBe(true);
  });

  it("builds example-match and roleplay items with one correct option", () => {
    const ex = fromGrammarExample(L01.grammar[0], 0, L01.grammar.slice(1));
    expect(ex.options).toContain(ex.answerDisplay);
    expect(new Set(ex.options).size).toBe(ex.options!.length);

    const rp = fromRoleplay(L01.roleplays[0]);
    expect(rp).toHaveLength(L01.roleplays[0].turns.length);
    for (const item of rp) {
      expect(item.options).toContain(item.answerDisplay);
      expect(grade(item, item.answerDisplay)).toBe(true);
    }
  });

  it("wraps curated counters and generates deterministic fresh ones", () => {
    const curated = getCuratedCounterDrills("time").map(fromCounterDrill);
    const four = curated.find((i) => i.id === "time-0400")!;
    expect(grade(four, "yoji")).toBe(true);
    expect(grade(four, "よんじ")).toBe(false);

    const a = generateCounterItems("yen", 6, "seed-1");
    const b = generateCounterItems("yen", 6, "seed-1");
    const c = generateCounterItems("yen", 6, "seed-2");
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(a.map((i) => i.id)).not.toEqual(c.map((i) => i.id));
    expect(new Set(a.map((i) => i.id)).size).toBe(6);
    for (const item of a) {
      expect(grade(item, item.answerDisplay)).toBe(true);
    }
  });

  it("decodes loanwords in romaji or katakana", () => {
    const lw = KATAKANA_LOANWORD_DRILLS[0];
    const item = fromLoanword(lw, KATAKANA_LOANWORD_DRILLS);
    expect(grade(item, lw.romaji)).toBe(true);
    expect(grade(item, lw.jp)).toBe(true);
  });
});

describe("drills: seeded shuffle", () => {
  it("is deterministic per seed and preserves membership", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = seededShuffle(src, "unit-a:1");
    const b = seededShuffle(src, "unit-a:1");
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(src);
    expect(seededShuffle(src, "unit-a:2")).not.toEqual(a);
  });
});

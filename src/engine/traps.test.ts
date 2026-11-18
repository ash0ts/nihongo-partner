import { describe, expect, it } from "vitest";
import { STUDY_PATH } from "../content/study-path";
import { type DrillItem, grade } from "./drills";
import { appendEvent, makeEvent, makeSessionId, parseEvents, summarizeTraps, trailingMissStreak } from "./events";
import { TRAPS, getTrap, trapForItem, wrongFormsIn } from "./traps";

const ALL_ITEMS: DrillItem[] = STUDY_PATH.units.flatMap((u) => [...u.drillItems, ...u.checkpointPool]);

describe("trap catalog", () => {
  it("has unique ids and every trap matches at least one real item", () => {
    const ids = TRAPS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const trap of TRAPS) {
      const hits = ALL_ITEMS.filter((it) => trap.matches(it));
      expect(hits.length, `trap ${trap.id} matches no item`).toBeGreaterThan(0);
    }
  });

  it("every slip is graded wrong (otherwise it is not a trap)", () => {
    for (const trap of TRAPS) {
      const hits = ALL_ITEMS.filter((it) => trap.matches(it));
      for (const item of hits) {
        const slip = trap.slip(item);
        if (slip === undefined) continue;
        expect(grade(item, slip), `${trap.id}: slip "${slip}" accepted for ${item.id}`).toBe(false);
      }
    }
  });

  it("maps known items to the expected trap", () => {
    const year4 = ALL_ITEMS.find((it) => it.id === "gen-year-4");
    expect(year4 && trapForItem(year4)?.id).toBe("year-4-yonensei");
    const shi = ALL_ITEMS.find((it) => it.skill === "contrast" && it.prompt.text === "シ");
    expect(shi && trapForItem(shi)?.id).toBe("pair-shi-tsu");
    expect(getTrap("particle-wa-ha")?.category).toBe("grammar");
  });
});

describe("interaction events", () => {
  const item = ALL_ITEMS.find((it) => it.id === "gen-year-4")!;

  it("builds a schema-valid event with the trap id attached", () => {
    const ev = makeEvent({
      item,
      sessionId: makeSessionId(new Date("2026-01-01T00:00:00Z"), () => 0.5),
      mode: "bridge",
      input: "よんねんせい",
      correct: false,
      ms: 4200.6,
      phase: "checkpoint",
    });
    expect(ev.trapId).toBe("year-4-yonensei");
    expect(ev.ms).toBe(4201);
    expect(parseEvents([ev])).toHaveLength(1);
  });

  it("caps the log and summarises traps and miss streaks", () => {
    let log = appendEvent([], makeEvent({ item, sessionId: "s", mode: "bridge", input: "x", correct: false, ms: 1, phase: "drill" }), 2);
    log = appendEvent(log, makeEvent({ item, sessionId: "s", mode: "bridge", input: "よねんせい", correct: true, ms: 1, phase: "drill" }), 2);
    log = appendEvent(log, makeEvent({ item, sessionId: "s", mode: "bridge", input: "x", correct: false, ms: 1, phase: "drill" }), 2);
    expect(log).toHaveLength(2);
    expect(trailingMissStreak(log)).toBe(1);
    const stats = summarizeTraps(log);
    expect(stats[0]).toMatchObject({ trapId: "year-4-yonensei", attempts: 2, misses: 1 });
  });

  it("finds known wrong spellings in a sentence and leaves correct ones alone", () => {
    expect(wrongFormsIn("いま きゅうじはんです。").map((h) => h.trap.id)).toEqual(["hour-9-kuji"]);
    expect(wrongFormsIn("いま よんじです。").map((h) => h.trap.id)).toEqual(["hour-4-yoji"]);
    expect(wrongFormsIn("わたしは よんねんせいです。").map((h) => h.trap.id)).toEqual(["year-4-yonensei"]);
    expect(wrongFormsIn("わたしは にじゅっさいです。").map((h) => h.trap.id)).toEqual(["age-20-hatachi"]);
    expect(wrongFormsIn("よんじゅっさいです。")).toEqual([]);
    expect(wrongFormsIn("よんじゅうさいです。").map((h) => h.trap.id)).toEqual(["age-sai-clipping"]);
    expect(wrongFormsIn("きゅうじゅうえんです。")).toEqual([]);
    expect(wrongFormsIn("いま くじはんです。さんぷん まえです。")).toEqual([]);
    expect(wrongFormsIn("わたしは はたちです。")).toEqual([]);
  });
});

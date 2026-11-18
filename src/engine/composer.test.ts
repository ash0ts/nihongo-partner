import { describe, expect, it } from "vitest";
import { STUDY_PATH } from "../content/study-path";
import { composeExerciseSet, itemPool, rationaleIsGrounded } from "./composer";
import { makeEvent, type InteractionEvent } from "./events";
import { TRAPS, trapForItem } from "./traps";

const pool = itemPool(STUDY_PATH);

function eventsFor(trapId: string, misses: number, hits: number): InteractionEvent[] {
  const trap = TRAPS.find((t) => t.id === trapId)!;
  const items = pool.filter((it) => trap.matches(it));
  const out: InteractionEvent[] = [];
  let t = Date.parse("2026-11-01T00:00:00Z");
  for (let i = 0; i < misses; i += 1) {
    const it = items[i % items.length];
    out.push(makeEvent({ item: it, sessionId: "t", unitId: it.sourceUnitId, mode: "classroom", input: trap.slip(it) ?? "x", correct: false, ms: 3000, phase: "drill", now: new Date((t += 5000)) }));
  }
  for (let i = 0; i < hits; i += 1) {
    const it = pool[(i * 7) % pool.length];
    out.push(makeEvent({ item: it, sessionId: "t", unitId: it.sourceUnitId, mode: "classroom", input: it.answerDisplay, correct: true, ms: 2000, phase: "drill", now: new Date((t += 5000)) }));
  }
  return out;
}

describe("composeExerciseSet", () => {
  it("targets the most-missed trap, interleaves, and stays short", () => {
    const events = [...eventsFor("hour-4-yoji", 4, 0), ...eventsFor("pair-shi-tsu", 3, 20)];
    const set = composeExerciseSet({ events, pool, mode: "classroom", n: 10, recentWindow: 0 });
    expect(set.items.length).toBe(10);
    const targeted = set.items.filter((i) => i.trapId === "hour-4-yoji" || i.trapId === "pair-shi-tsu").length;
    expect(targeted).toBeGreaterThanOrEqual(3);
    for (let i = 2; i < set.items.length; i += 1) {
      const t = set.items[i].trapId;
      if (t) expect(t === set.items[i - 1].trapId && t === set.items[i - 2].trapId).toBe(false);
    }
    expect(set.rules).toContain("target-errors");
    expect(set.rules).toContain("interleave");
    expect(new Set(set.items.map((i) => i.itemId)).size).toBe(set.items.length);
    expect(rationaleIsGrounded(set.rationale, set.facts, set.items.length)).toBe(true);
  });

  it("fades choice items to typed after two correct answers", () => {
    const it = pool.find((x) => x.answerKind === "choice" && x.typedCapable)!;
    const events = [1, 2, 3].map((k) =>
      makeEvent({ item: it, sessionId: "t", unitId: it.sourceUnitId, mode: "bridge", input: it.answerDisplay, correct: true, ms: 1500, phase: "drill", now: new Date(1_700_000_000_000 + k * 1000) }),
    );
    const set = composeExerciseSet({ events, pool, mode: "bridge", n: 5, recentWindow: 0 });
    const composed = set.items.find((c) => c.itemId === it.id);
    expect(composed?.answerKind).toBe("typed");
    expect(set.rules).toContain("fade-scaffold");
  });

  it("spaces out recent hits, brings back recent misses, and composes with no history", () => {
    const empty = composeExerciseSet({ events: [], pool, mode: "immersion", n: 8 });
    expect(empty.items.length).toBe(8);
    expect(empty.facts.topTraps).toEqual([]);
    const recentHits = eventsFor("age-20-hatachi", 0, 6);
    const spaced = composeExerciseSet({ events: recentHits, pool, mode: "immersion", n: 8, recentWindow: 10 });
    for (const e of recentHits) expect(spaced.items.some((c) => c.itemId === e.itemId)).toBe(false);
    const recentMisses = eventsFor("age-20-hatachi", 2, 0);
    const remedial = composeExerciseSet({ events: recentMisses, pool, mode: "immersion", n: 8, recentWindow: 10 });
    expect(remedial.items.some((c) => c.trapId === "age-20-hatachi")).toBe(true);
    expect(remedial.facts.meanAccuracy).toBeGreaterThan(0.55);
  });
});

describe("composeExerciseSet: misses without a catalogued trap", () => {
  it("brings back a missed item even when no trap is attached and names it", () => {
    const path = STUDY_PATH;
    const pool = itemPool(path);
    const item = pool.find((it) => it.id === "time-0205") ?? pool.find((it) => it.skill === "counter" && !trapForItem(it))!;
    const events = [makeEvent({ item, sessionId: "t", unitId: item.sourceUnitId, mode: "bridge", input: "よんじ", correct: false, ms: 3000, phase: "drill", now: new Date(1_700_000_000_000) })];
    const set = composeExerciseSet({ events, pool, mode: "bridge", n: 10 });
    expect(set.items.some((i) => i.itemId === item.id && i.reason === "target-errors")).toBe(true);
    expect(set.facts.recentMisses).toBe(1);
    expect(set.rationale).toContain("You missed 1 item");
    expect(set.rules).toContain("target-errors");
  });
});

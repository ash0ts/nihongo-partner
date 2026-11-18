import { describe, expect, it } from "vitest";
import { CRAM_LESSONS, LESSONS } from "../content";
import { STUDY_PATH } from "../content/study-path";
import {
  getUnitStatus,
  jumpToUnit,
  nextRecommendedUnit,
  selectCheckpointItems,
  selectDrillItems,
  selectReviewItems,
  summarizeReadiness,
} from "./path";
import { createEmptySnapshot, markUnitSkipped, recordCheckpoint, recordReview } from "./srs";

const path = STUDY_PATH;
const allDrillIds = new Set(path.units.flatMap((u) => u.drillItems.map((i) => i.id)));
const allPoolIds = new Set(path.units.flatMap((u) => u.checkpointPool.map((i) => i.id)));

describe("study path: generation", () => {
  it("has unique unit ids, groups covering every unit, and kana first", () => {
    const ids = path.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    const grouped = path.groups.flatMap((g) => g.unitIds);
    expect(new Set(grouped).size).toBe(ids.length);
    expect(grouped.sort()).toEqual([...ids].sort());
    expect(path.units[0].kind).toBe("kana");
    expect(path.groups[0].id).toBe("kana");
  });

  it("covers every grammar point, core vocab id, cloze id and roleplay of complete lessons", () => {
    for (const lesson of CRAM_LESSONS) {
      for (const g of lesson.grammar) {
        expect(path.units.some((u) => u.id === `${lesson.id}-g-${g.id}`), g.id).toBe(true);
      }
      for (const v of lesson.vocab.filter((x) => x.priority !== "bonus")) {
        expect(allDrillIds.has(v.id), v.id).toBe(true);
      }
      for (const c of lesson.clozeDrills) {
        expect(allDrillIds.has(c.id), c.id).toBe(true);
      }
      if (lesson.roleplays.length > 0) {
        expect(path.units.some((u) => u.id === `${lesson.id}-roleplay`)).toBe(true);
      }
      const checkpoint = path.units.find((u) => u.id === `${lesson.id}-checkpoint`);
      expect(checkpoint, `${lesson.id} checkpoint`).toBeTruthy();
      expect(checkpoint!.checkpointPool.length).toBeGreaterThanOrEqual(checkpoint!.checkpointSize);
      expect(checkpoint!.checkpointSize).toBeGreaterThanOrEqual(8);
    }
  });

  it("covers all 46 kana and ends with the cumulative mock then an optional ungated preview", () => {
    for (let i = 0; i < 46; i += 1) {
      const kanaUnitIds = path.units.filter((u) => u.kind === "kana").flatMap((u) => u.drillItems.map((d) => d.id));
      expect(new Set(kanaUnitIds).size).toBeGreaterThanOrEqual(46);
    }
    const last = path.units[path.units.length - 1];
    expect(last.kind).toBe("preview");
    expect(last.optional).toBe(true);
    expect(last.gated).toBe(false);
    expect(last.lessonId).toBe("L03");
    expect(last.romajiPolicy).toBe("no-romaji");

    const cumulative = path.units[path.units.length - 2];
    expect(cumulative.kind).toBe("cumulative");
    expect(cumulative.checkpointSize).toBe(25);
    expect(cumulative.checkpointPool.length).toBeGreaterThan(100);

    const bridgeOnly = LESSONS.filter((l) => l.status === "bridge").map((l) => l.id);
    expect(bridgeOnly).toContain("L04");
    expect(path.units.some((u) => u.lessonId === "L04")).toBe(false);
  });

  it("gives every gated unit a non-empty checkpoint pool and sets sourceUnitId", () => {
    for (const u of path.units) {
      expect(u.checkpointPool.length, u.id).toBeGreaterThan(0);
      expect(u.checkpointSize, u.id).toBeGreaterThan(0);
      expect(u.checkpointSize).toBeLessThanOrEqual(u.checkpointPool.length);
      for (const item of [...u.drillItems, ...u.checkpointPool]) {
        expect(item.sourceUnitId).toBe(u.id);
      }
    }
    expect(allPoolIds.size).toBeGreaterThan(150);
  });
});

describe("study path: gating", () => {
  it("locks units until the previous one is passed or skipped, with soft skip flags", () => {
    let snap = createEmptySnapshot();
    const [first, second, third] = path.units;
    expect(getUnitStatus(path, first.id, snap)).toBe("available");
    expect(getUnitStatus(path, second.id, snap)).toBe("locked");
    expect(nextRecommendedUnit(path, snap)?.id).toBe(first.id);

    snap = recordCheckpoint(snap, first.id, 0.6, first.passBar);
    expect(getUnitStatus(path, first.id, snap)).toBe("failed");
    expect(getUnitStatus(path, second.id, snap)).toBe("locked");
    expect(nextRecommendedUnit(path, snap)?.id).toBe(first.id);

    snap = recordCheckpoint(snap, first.id, 0.9, first.passBar);
    expect(getUnitStatus(path, first.id, snap)).toBe("passed");
    expect(getUnitStatus(path, second.id, snap)).toBe("available");
    expect(nextRecommendedUnit(path, snap)?.id).toBe(second.id);

    snap = markUnitSkipped(snap, second.id);
    expect(getUnitStatus(path, second.id, snap)).toBe("skipped-unmastered");
    expect(getUnitStatus(path, third.id, snap)).toBe("available");
    expect(nextRecommendedUnit(path, snap)?.id).toBe(third.id);
  });

  it("jumpToUnit flags earlier unfinished units and keeps the preview always available", () => {
    const target = path.units[5];
    let snap = createEmptySnapshot();
    snap = recordCheckpoint(snap, path.units[0].id, 1, 0.8);
    snap = jumpToUnit(path, snap, target.id);
    expect(getUnitStatus(path, target.id, snap)).toBe("available");
    expect(getUnitStatus(path, path.units[0].id, snap)).toBe("passed");
    for (let i = 1; i < 5; i += 1) {
      expect(getUnitStatus(path, path.units[i].id, snap)).toBe("skipped-unmastered");
    }
    const preview = path.units[path.units.length - 1];
    expect(getUnitStatus(path, preview.id, createEmptySnapshot())).toBe("available");
  });

  it("returns null from nextRecommendedUnit once everything required is passed", () => {
    let snap = createEmptySnapshot();
    for (const u of path.units) {
      snap = recordCheckpoint(snap, u.id, 1, u.passBar);
    }
    expect(nextRecommendedUnit(path, snap)).toBeNull();
    const summary = summarizeReadiness(path, snap);
    expect(summary.isComplete).toBe(true);
    expect(summary.overallPct).toBe(100);
    expect(summary.estimatedRemainingMinutes).toBe(0);
  });
});

describe("study path: item selection", () => {
  it("selects deterministic checkpoint items of the requested size, weak items first", () => {
    const unit = path.units.find((u) => u.id === "L01-checkpoint")!;
    const snap0 = createEmptySnapshot();
    const a = selectCheckpointItems(unit, snap0, 0);
    const b = selectCheckpointItems(unit, snap0, 0);
    expect(a.map((i) => i.variantKey)).toEqual(b.map((i) => i.variantKey));
    expect(a).toHaveLength(unit.checkpointSize);
    expect(new Set(a.map((i) => i.id)).size).toBe(a.length);

    let snap = snap0;
    snap = recordReview(snap, "c01-4", "grammar", false, 3000);
    snap = recordReview(snap, "v01-nensei", "vocab", false, 3000);
    const weighted = selectCheckpointItems(unit, snap, 1);
    expect(weighted.map((i) => i.id)).toEqual(expect.arrayContaining(["c01-4", "v01-nensei"]));
  });

  it("micro-drill selection respects drillSize and review pulls due/shaky items from earlier units", () => {
    const kanaUnit = path.units[0];
    const drill = selectDrillItems(kanaUnit, createEmptySnapshot());
    expect(drill).toHaveLength(kanaUnit.drillSize);

    const now = new Date("2026-11-18T20:00:00Z");
    let snap = createEmptySnapshot();
    snap = recordReview(snap, "kana-shi", "kana", false, 3000, new Date("2026-11-18T19:00:00Z"));
    snap = recordReview(snap, "kana-ka", "kana", true, 1000, new Date("2026-11-18T19:59:00Z"));
    const l01Grammar = path.units.find((u) => u.id === "L01-g-g01-wa-desu")!;
    const review = selectReviewItems(path, snap, l01Grammar.id, 6, now);
    expect(review).toHaveLength(6);
    expect(review[0].id).toBe("kana-shi");
    expect(review.every((i) => i.sourceUnitId !== l01Grammar.id)).toBe(true);
    expect(selectReviewItems(path, snap, path.units[0].id, 6, now)).toEqual([]);
  });

  it("summarizes readiness per group with weakest items and a pace estimate", () => {
    let snap = createEmptySnapshot();
    snap = recordReview(snap, "kana-shi", "kana", false, 3000);
    snap = recordReview(snap, "kana-shi", "kana", false, 3000);
    const first = path.units[0];
    snap = recordCheckpoint(snap, first.id, 0.9, first.passBar);
    snap = { ...snap, pathUnits: { ...snap.pathUnits, [first.id]: { ...snap.pathUnits[first.id], elapsedSeconds: first.estimatedMinutes * 60 * 2 } } };
    const summary = summarizeReadiness(path, snap);
    expect(summary.groups[0].groupId).toBe("kana");
    expect(summary.groups[0].unitsPassed).toBe(1);
    expect(summary.weakest[0].id).toBe("kana-shi");
    expect(summary.weakest[0].lapses).toBe(2);
    expect(summary.paceRatio).toBe(2);
    expect(summary.unitsPassed).toBe(1);
    expect(summary.isComplete).toBe(false);
    expect(summary.estimatedRemainingMinutes).toBeGreaterThan(0);
  });
});

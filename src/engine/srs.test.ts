import { describe, expect, it } from "vitest";
import {
  addUnitElapsed,
  classifyMastery,
  createEmptySnapshot,
  getWeakItemIds,
  markUnitSkipped,
  recordCheckpoint,
  recordReview,
  resetUnit,
} from "./srs";

describe("Study Path unit progress", () => {
  it("records pass/fail against the pass bar and never downgrades a pass", () => {
    let snap = createEmptySnapshot();
    expect(snap.pathUnits).toEqual({});

    snap = recordCheckpoint(snap, "u1", 0.6, 0.8);
    expect(snap.pathUnits.u1.status).toBe("failed");
    expect(snap.pathUnits.u1.attempts).toBe(1);

    snap = recordCheckpoint(snap, "u1", 0.9, 0.8);
    expect(snap.pathUnits.u1.status).toBe("passed");
    expect(snap.pathUnits.u1.bestScore).toBe(0.9);

    snap = recordCheckpoint(snap, "u1", 0.5, 0.8);
    expect(snap.pathUnits.u1.status).toBe("passed");
    expect(snap.pathUnits.u1.lastScore).toBe(0.5);
    expect(snap.pathUnits.u1.attempts).toBe(3);
  });

  it("marks skipped units without touching passed ones and logs elapsed time", () => {
    let snap = createEmptySnapshot();
    snap = markUnitSkipped(snap, "u2");
    expect(snap.pathUnits.u2.status).toBe("skipped");
    expect(snap.pathUnits.u2.skippedAt).toBeTruthy();

    snap = recordCheckpoint(snap, "u3", 1, 0.8);
    snap = markUnitSkipped(snap, "u3");
    expect(snap.pathUnits.u3.status).toBe("passed");

    snap = addUnitElapsed(snap, "u4", 90);
    expect(snap.pathUnits.u4.status).toBe("in-progress");
    expect(snap.pathUnits.u4.elapsedSeconds).toBe(90);
    snap = addUnitElapsed(snap, "u4", 30.4);
    expect(snap.pathUnits.u4.elapsedSeconds).toBe(120);

    snap = resetUnit(snap, "u4");
    expect(snap.pathUnits.u4).toBeUndefined();
  });
});

describe("FSRS-lite Mastery Store", () => {
  it("promotes fast consecutive streaks to solid and flags misses as shaky", () => {
    let snap = createEmptySnapshot();
    expect(classifyMastery(snap.items["kana-shi"])).toBe("unseen");

    snap = recordReview(snap, "kana-shi", "kana", false, 3500);
    expect(classifyMastery(snap.items["kana-shi"])).toBe("shaky");
    expect(getWeakItemIds(snap, "kana")).toEqual(["kana-shi"]);

    snap = recordReview(snap, "kana-tsu", "kana", true, 1400);
    snap = recordReview(snap, "kana-tsu", "kana", true, 1200);
    expect(classifyMastery(snap.items["kana-tsu"])).toBe("solid");
  });
});

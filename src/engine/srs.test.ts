import { describe, expect, it } from "vitest";
import { classifyMastery, createEmptySnapshot, getWeakItemIds, recordReview } from "./srs";

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

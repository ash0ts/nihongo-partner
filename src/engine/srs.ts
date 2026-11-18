export type MasteryLevel = "unseen" | "shaky" | "learning" | "solid";

export interface ItemMastery {
  id: string;
  category: "kana" | "vocab" | "grammar" | "counter";
  attempts: number;
  correct: number;
  streak: number;
  lapses: number;
  avgMs: number;
  box: number; // 0..4 FSRS-lite stability bucket
  lastReviewedAt: string;
  nextDueAt: string;
}

export interface SprintBlockState {
  blockId: string;
  completed: boolean;
  elapsedSeconds: number;
}

/**
 * Per-unit state for the guided Study Path.
 * - `in-progress`: opened (time logged) but no checkpoint taken yet.
 * - `passed`: a checkpoint met the unit's pass bar.
 * - `failed`: attempted, below the bar; unit stays available for retry.
 * - `skipped`: learner moved past it without passing (shown as "not yet mastered").
 */
export type UnitStatus = "in-progress" | "passed" | "failed" | "skipped";

export interface UnitProgress {
  unitId: string;
  status: UnitStatus;
  attempts: number;
  bestScore: number; // 0..1
  lastScore: number; // 0..1
  lastCheckpointAt?: string;
  skippedAt?: string;
  /** Wall-clock seconds spent inside the unit player, used for pace estimates. */
  elapsedSeconds: number;
}

export interface ProgressSnapshot {
  version: "nihongo-partner.v1";
  updatedAt: string;
  displayMode: "bridge" | "classroom" | "immersion";
  slowAudio: boolean;
  sprintBlocks: Record<string, SprintBlockState>;
  items: Record<string, ItemMastery>;
  pathUnits: Record<string, UnitProgress>;
}

const STORAGE_KEY = "nihongo-partner.progress.v1";

const BOX_INTERVAL_MINUTES = [2, 12, 45, 240, 1440];

export function createEmptySnapshot(): ProgressSnapshot {
  return {
    version: "nihongo-partner.v1",
    updatedAt: new Date().toISOString(),
    displayMode: "bridge",
    slowAudio: false,
    sprintBlocks: {},
    items: {},
    pathUnits: {},
  };
}

export function loadProgress(): ProgressSnapshot {
  if (typeof window === "undefined" || !window.localStorage) {
    return createEmptySnapshot();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptySnapshot();
    const parsed = JSON.parse(raw) as Partial<ProgressSnapshot>;
    if (parsed.version !== "nihongo-partner.v1" || typeof parsed.items !== "object") {
      return createEmptySnapshot();
    }
    return {
      ...createEmptySnapshot(),
      ...parsed,
      items: parsed.items ?? {},
      sprintBlocks: parsed.sprintBlocks ?? {},
      pathUnits: parsed.pathUnits ?? {},
    };
  } catch {
    return createEmptySnapshot();
  }
}

export function saveProgress(snapshot: ProgressSnapshot): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota issues in private browsing
  }
}

export function classifyMastery(item?: ItemMastery): MasteryLevel {
  if (!item || item.attempts === 0) return "unseen";
  const accuracy = item.correct / item.attempts;
  if (item.streak >= 2 && item.box >= 2 && accuracy >= 0.8 && item.avgMs <= 4500) {
    return "solid";
  }
  if (item.streak === 0 || accuracy < 0.6) {
    return "shaky";
  }
  return "learning";
}

export function recordReview(
  snapshot: ProgressSnapshot,
  id: string,
  category: ItemMastery["category"],
  isCorrect: boolean,
  responseMs: number,
  now = new Date(),
): ProgressSnapshot {
  const prev = snapshot.items[id];
  const clampedMs = Math.max(250, Math.min(30_000, Math.round(responseMs)));
  const attempts = (prev?.attempts ?? 0) + 1;
  const correct = (prev?.correct ?? 0) + (isCorrect ? 1 : 0);
  const streak = isCorrect ? (prev?.streak ?? 0) + 1 : 0;
  const lapses = (prev?.lapses ?? 0) + (isCorrect ? 0 : 1);
  const avgMs = prev ? Math.round(prev.avgMs * 0.65 + clampedMs * 0.35) : clampedMs;

  let box = prev?.box ?? 0;
  if (isCorrect) {
    const fastBonus = clampedMs <= 2600 && streak >= 2 ? 2 : 1;
    box = Math.min(4, box + fastBonus);
  } else {
    box = 0;
  }

  const intervalMin = BOX_INTERVAL_MINUTES[box] ?? 10;
  const nextDue = new Date(now.getTime() + intervalMin * 60_000);

  return {
    ...snapshot,
    updatedAt: now.toISOString(),
    items: {
      ...snapshot.items,
      [id]: {
        id,
        category,
        attempts,
        correct,
        streak,
        lapses,
        avgMs,
        box,
        lastReviewedAt: now.toISOString(),
        nextDueAt: nextDue.toISOString(),
      },
    },
  };
}

export function getWeakItemIds(
  snapshot: ProgressSnapshot,
  category?: ItemMastery["category"],
): string[] {
  return Object.values(snapshot.items)
    .filter((item) => (!category || item.category === category) && classifyMastery(item) === "shaky")
    .sort((a, b) => b.lapses - a.lapses || a.streak - b.streak)
    .map((item) => item.id);
}

/* ---------------------------------------------------------------------------------------- */
/* Study Path unit progress                                                                   */
/* ---------------------------------------------------------------------------------------- */

function emptyUnitProgress(unitId: string): UnitProgress {
  return {
    unitId,
    status: "in-progress",
    attempts: 0,
    bestScore: 0,
    lastScore: 0,
    elapsedSeconds: 0,
  };
}

/**
 * Records a checkpoint result. `score` is 0..1; `passBar` is the unit's soft gate.
 * A pass marks the unit `passed`; a miss marks it `failed` (still available) unless it
 * had already been passed before, in which case the earlier pass stands.
 */
export function recordCheckpoint(
  snapshot: ProgressSnapshot,
  unitId: string,
  score: number,
  passBar: number,
  now = new Date(),
): ProgressSnapshot {
  const prev = snapshot.pathUnits[unitId] ?? emptyUnitProgress(unitId);
  const clamped = Math.max(0, Math.min(1, score));
  const passedNow = clamped >= passBar;
  const status: UnitStatus = passedNow || prev.status === "passed" ? "passed" : "failed";
  return {
    ...snapshot,
    updatedAt: now.toISOString(),
    pathUnits: {
      ...snapshot.pathUnits,
      [unitId]: {
        ...prev,
        status,
        attempts: prev.attempts + 1,
        bestScore: Math.max(prev.bestScore, clamped),
        lastScore: clamped,
        lastCheckpointAt: now.toISOString(),
        skippedAt: status === "passed" ? undefined : prev.skippedAt,
      },
    },
  };
}

/** Marks a unit as skipped ("not yet mastered"). Never downgrades a passed unit. */
export function markUnitSkipped(
  snapshot: ProgressSnapshot,
  unitId: string,
  now = new Date(),
): ProgressSnapshot {
  const prev = snapshot.pathUnits[unitId] ?? emptyUnitProgress(unitId);
  if (prev.status === "passed") return snapshot;
  return {
    ...snapshot,
    updatedAt: now.toISOString(),
    pathUnits: {
      ...snapshot.pathUnits,
      [unitId]: { ...prev, status: "skipped", skippedAt: now.toISOString() },
    },
  };
}

/** Adds wall-clock seconds spent in a unit (feeds the pace estimate). */
export function addUnitElapsed(
  snapshot: ProgressSnapshot,
  unitId: string,
  seconds: number,
  now = new Date(),
): ProgressSnapshot {
  if (!Number.isFinite(seconds) || seconds <= 0) return snapshot;
  const prev = snapshot.pathUnits[unitId] ?? emptyUnitProgress(unitId);
  return {
    ...snapshot,
    updatedAt: now.toISOString(),
    pathUnits: {
      ...snapshot.pathUnits,
      [unitId]: { ...prev, elapsedSeconds: prev.elapsedSeconds + Math.round(seconds) },
    },
  };
}

/** Clears a unit's record so it can be retaken from scratch (mastery items are kept). */
export function resetUnit(snapshot: ProgressSnapshot, unitId: string, now = new Date()): ProgressSnapshot {
  if (!snapshot.pathUnits[unitId]) return snapshot;
  const next = { ...snapshot.pathUnits };
  delete next[unitId];
  return { ...snapshot, updatedAt: now.toISOString(), pathUnits: next };
}

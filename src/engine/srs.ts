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

export interface ProgressSnapshot {
  version: "nihongo-partner.v1";
  updatedAt: string;
  displayMode: "bridge" | "classroom" | "immersion";
  slowAudio: boolean;
  sprintBlocks: Record<string, SprintBlockState>;
  items: Record<string, ItemMastery>;
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

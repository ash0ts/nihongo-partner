/**
 * compose_exercise_set: turn a learner's interaction log into a short custom set.
 *
 * Deterministic on purpose. The rules below are the ones in docs/teaching-rationale.md,
 * each with an id that the set reports as "applied" so the composer eval and the Agent Lens
 * trace can check the claim. The LLM (server side) only writes the one-paragraph rationale
 * from `facts`; it never picks items.
 *
 * Runs in the browser (client-side fallback) and on the server (traced tool).
 */
import { asTyped, type DrillItem } from "./drills";
import { type InteractionEvent, summarizeTraps, type TrapStat } from "./events";
import type { StudyPath } from "./path";
import { getTrap, trapForItem } from "./traps";

/**
 * Every distinct item variant on the path. Deduped by `variantKey`, not `id`, because the
 * katakana variant of a kana item is what the pair traps match.
 */
export function itemPool(path: StudyPath): DrillItem[] {
  const seen = new Map<string, DrillItem>();
  for (const u of path.units) for (const it of [...u.drillItems, ...u.checkpointPool]) if (!seen.has(it.variantKey)) seen.set(it.variantKey, it);
  return [...seen.values()];
}

export type TeachingRule =
  | "target-errors"
  | "contrast-pairs"
  | "interleave"
  | "retrieval"
  | "fade-scaffold"
  | "desirable-difficulty"
  | "spacing"
  | "short-set";

export const TEACHING_RULES: Record<TeachingRule, string> = {
  "target-errors": "Half the set drills the traps you missed most",
  "contrast-pairs": "Confusable pairs are practised side by side",
  interleave: "No trap appears three times in a row",
  retrieval: "Every item asks you to produce the answer, not just recognise it",
  "fade-scaffold": "Items you have got right twice switch from multiple choice to typing",
  "desirable-difficulty": "The set is pitched so you should get roughly 8 out of 10 right",
  spacing: "Items you saw in the last few minutes are left out",
  "short-set": "Ten items, then stop",
};

export interface ComposedItem {
  itemId: string;
  variantKey: string;
  trapId?: string;
  answerKind: "choice" | "typed";
  typedCapable: boolean;
  skill: DrillItem["skill"];
  reason: TeachingRule;
  predictedAccuracy: number;
  recentCorrectStreak: number;
}

export interface ExerciseSetFacts {
  eventsSeen: number;
  topTraps: Array<{ trapId: string; label: string; misses: number; attempts: number }>;
  weakItems: number;
  reviewDue: number;
  fadedToTyped: number;
  inBand: number;
  /** Mean predicted accuracy over the set; the composer pitches this near 0.8. */
  meanAccuracy: number;
}

export interface ExerciseSet {
  id: string;
  createdAt: string;
  mode: "bridge" | "classroom" | "immersion";
  items: ComposedItem[];
  rules: TeachingRule[];
  facts: ExerciseSetFacts;
  rationale: string;
  source: "deterministic" | "llm";
}

export interface ComposeInput {
  events: readonly InteractionEvent[];
  /** Every item the learner could be asked (the whole path, deduped by id). */
  pool: readonly DrillItem[];
  mode: ExerciseSet["mode"];
  n?: number;
  now?: Date;
  /** Items answered within this many trailing events count as "just seen". */
  recentWindow?: number;
}

interface ItemHistory {
  attempts: number;
  correct: number;
  streak: number;
  lastIndex: number;
  /** The learner has met this item as multiple choice. */
  sawChoice: boolean;
}

const BAND = { low: 0.6, high: 0.95 };
/** Wilson et al. 2019: learning is fastest when training accuracy sits near 85%. */
const TARGET_ACCURACY = 0.8;

function histories(events: readonly InteractionEvent[]): Map<string, ItemHistory> {
  const map = new Map<string, ItemHistory>();
  events.forEach((e, i) => {
    const h = map.get(e.itemId) ?? { attempts: 0, correct: 0, streak: 0, lastIndex: -1, sawChoice: false };
    h.attempts += 1;
    if (e.answerKind === "choice") h.sawChoice = true;
    if (e.correct) {
      h.correct += 1;
      h.streak += 1;
    } else {
      h.streak = 0;
    }
    h.lastIndex = i;
    map.set(e.itemId, h);
  });
  return map;
}

/**
 * Beta-smoothed accuracy with a prior mean of 0.7 and the weight of two answers: an unseen
 * item sits at 0.7, one hit at 0.8, one miss at 0.47, two misses at 0.35. The prior is the
 * rough base rate for Lesson 0-2 drills, so thin evidence does not look like weakness.
 */
export function predictedAccuracy(h: ItemHistory | undefined): number {
  if (!h) return PRIOR_MEAN;
  return (h.correct + PRIOR_MEAN * PRIOR_WEIGHT) / (h.attempts + PRIOR_WEIGHT);
}
const PRIOR_MEAN = 0.7;
const PRIOR_WEIGHT = 2;

function interleave(items: ComposedItem[]): ComposedItem[] {
  // Greedy: always take from the trap with the most items left, unless that would make three
  // in a row; then take the next-largest. Untagged items are their own one-item buckets.
  const buckets = new Map<string, ComposedItem[]>();
  for (const it of items) {
    const key = it.trapId ?? `_${it.itemId}`;
    buckets.set(key, [...(buckets.get(key) ?? []), it]);
  }
  const out: ComposedItem[] = [];
  while (out.length < items.length) {
    const ranked = [...buckets.entries()].filter(([, q]) => q.length > 0).sort((a, b) => b[1].length - a[1].length);
    const last = out[out.length - 1]?.trapId;
    const beforeLast = out[out.length - 2]?.trapId;
    const pick = ranked.find(([key]) => !(last && key === last && key === beforeLast)) ?? ranked[0];
    out.push(pick[1].shift()!);
  }
  return out;
}

export function composeExerciseSet(input: ComposeInput): ExerciseSet {
  const n = input.n ?? 10;
  const now = input.now ?? new Date();
  const recentWindow = input.recentWindow ?? 10;
  const events = input.events;
  const hist = histories(events);
  // "Just seen" only excludes items the learner last answered correctly: a miss from a minute
  // ago is exactly what a remedial set should come back to.
  const recentIds = new Set<string>();
  for (const e of recentWindow > 0 ? events.slice(-recentWindow) : []) {
    if (e.correct) recentIds.add(e.itemId);
    else recentIds.delete(e.itemId);
  }
  const byId = new Map(input.pool.map((it) => [it.id, it]));

  const trapStats: TrapStat[] = summarizeTraps(events).filter((t) => t.misses > 0);
  const topTraps = trapStats.slice(0, 3);
  const topTrapIds = new Set(topTraps.map((t) => t.trapId));
  const rules = new Set<TeachingRule>(["short-set", "retrieval", "spacing"]);

  const chosen = new Map<string, ComposedItem>();
  let faded = 0;

  const make = (item: DrillItem, reason: TeachingRule): ComposedItem => {
    const h = hist.get(item.id);
    const streak = h?.streak ?? 0;
    const trap = trapForItem(item);
    // Fade: recognition -> production once the learner has shown it twice. Classroom and
    // immersion modes also prefer typing for kana recognition, matching the Lesson 3 format.
    const wantTyped = item.typedCapable && (streak >= 2 || (input.mode !== "bridge" && item.skill === "kana-read"));
    const resolved = wantTyped ? asTyped(item) : item;
    if (wantTyped && (item.answerKind === "choice" || h?.sawChoice)) {
      faded += 1;
      rules.add("fade-scaffold");
    }
    return {
      itemId: item.id,
      variantKey: resolved.variantKey,
      trapId: trap?.id,
      answerKind: resolved.answerKind,
      typedCapable: item.typedCapable,
      skill: item.skill,
      reason,
      predictedAccuracy: Math.round(predictedAccuracy(h) * 100) / 100,
      recentCorrectStreak: streak,
    };
  };

  const add = (item: DrillItem | undefined, reason: TeachingRule) => {
    if (!item || chosen.has(item.id) || chosen.size >= n) return false;
    if (recentIds.has(item.id)) return false;
    chosen.set(item.id, make(item, reason));
    return true;
  };

  // 1. Target errors: items from the top missed traps, weakest first, plus their contrast partners.
  const weakTarget = Math.ceil(n / 2);
  const trapItems = input.pool
    .filter((it) => {
      const t = trapForItem(it);
      return t && topTrapIds.has(t.id);
    })
    .sort((a, b) => predictedAccuracy(hist.get(a.id)) - predictedAccuracy(hist.get(b.id)));
  for (const it of trapItems) {
    if ([...chosen.values()].filter((c) => c.reason === "target-errors" || c.reason === "contrast-pairs").length >= weakTarget) break;
    if (add(it, "target-errors")) rules.add("target-errors");
    // Contrast partner: another item under the same pair trap that the learner has NOT missed.
    const t = trapForItem(it);
    if (t?.id.startsWith("pair-")) {
      const partner = input.pool.find((p) => p.id !== it.id && trapForItem(p)?.id === t.id && !chosen.has(p.id) && (hist.get(p.id)?.correct ?? 0) >= (hist.get(it.id)?.correct ?? 0));
      if (add(partner, "contrast-pairs")) rules.add("contrast-pairs");
    }
  }

  // 2. Pitch the set: the weak items above sit well below the target, so the rest of the set
  //    comes from items the learner is likely to get right, strongest and longest-unseen
  //    first, until the mean predicted accuracy reaches TARGET_ACCURACY. Those items double
  //    as spaced review.
  const mean = () => {
    const vals = [...chosen.values()].map((c) => c.predictedAccuracy);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const seenCandidates = [...hist.entries()]
    .filter(([id, h]) => byId.has(id) && h.correct > 0 && !chosen.has(id) && !recentIds.has(id))
    .map(([id, h]) => ({ id, acc: predictedAccuracy(h), lastIndex: h.lastIndex }));
  const strongestFirst = [...seenCandidates].sort((a, b) => b.acc - a.acc || a.lastIndex - b.lastIndex);
  const hardestInBandFirst = [...seenCandidates].filter((c) => c.acc >= BAND.low && c.acc <= BAND.high).sort((a, b) => a.acc - b.acc);
  for (const c of strongestFirst) {
    if (chosen.size >= n || mean() >= TARGET_ACCURACY) break;
    if (add(byId.get(c.id), "spacing")) rules.add("desirable-difficulty");
  }
  for (const c of hardestInBandFirst) {
    if (chosen.size >= n) break;
    if (add(byId.get(c.id), "desirable-difficulty")) rules.add("desirable-difficulty");
  }
  for (const c of strongestFirst) {
    if (chosen.size >= n) break;
    add(byId.get(c.id), "spacing");
  }

  // 3. Fill from unseen items in the same traps / units as the misses, then anything unseen.
  if (chosen.size < n) {
    const missedUnits = new Set(events.filter((e) => !e.correct).map((e) => e.unitId));
    const fillers = input.pool.filter((it) => !hist.has(it.id) && (missedUnits.has(it.sourceUnitId) || topTrapIds.has(trapForItem(it)?.id ?? "")));
    for (const it of fillers) {
      if (chosen.size >= n) break;
      add(it, "desirable-difficulty");
    }
    for (const it of input.pool) {
      if (chosen.size >= n) break;
      add(it, "desirable-difficulty");
    }
  }

  const items = interleave([...chosen.values()]);
  if (items.length >= 3) rules.add("interleave");

  const inBand = items.filter((i) => i.predictedAccuracy >= BAND.low && i.predictedAccuracy <= BAND.high).length;
  const meanAccuracy = items.length ? Math.round((items.reduce((a, i) => a + i.predictedAccuracy, 0) / items.length) * 100) / 100 : 0;
  const facts: ExerciseSetFacts = {
    eventsSeen: events.length,
    topTraps: topTraps.map((t) => ({ trapId: t.trapId, label: getTrap(t.trapId)?.label ?? t.trapId, misses: t.misses, attempts: t.attempts })),
    weakItems: items.filter((i) => i.reason === "target-errors").length,
    reviewDue: items.filter((i) => i.reason === "spacing").length,
    fadedToTyped: faded,
    inBand,
    meanAccuracy,
  };

  const appliedRules = [...rules].filter((r) => r !== "retrieval" || items.every((i) => i.answerKind === "typed" || !i.typedCapable));
  return {
    id: `set-${now.getTime().toString(36)}`,
    createdAt: now.toISOString(),
    mode: input.mode,
    items,
    rules: appliedRules,
    facts,
    rationale: deterministicRationale(facts, appliedRules),
    source: "deterministic",
  };
}

export function deterministicRationale(facts: ExerciseSetFacts, rules: TeachingRule[]): string {
  const parts: string[] = [];
  if (facts.topTraps.length > 0) {
    const t = facts.topTraps[0];
    parts.push(`You missed ${t.label} ${t.misses} of ${t.attempts} times, so ${facts.weakItems} of these items go after that and the other traps you tripped on.`);
  } else {
    parts.push("No misses yet, so this set is a spaced review of what you have already seen.");
  }
  if (facts.fadedToTyped > 0) parts.push(`${facts.fadedToTyped} item${facts.fadedToTyped === 1 ? "" : "s"} you have got right twice now ask you to type the answer.`);
  if (facts.reviewDue > 0) parts.push(`${facts.reviewDue} ${facts.reviewDue === 1 ? "is" : "are"} older items coming back for review.`);
  if (rules.includes("interleave")) parts.push("Traps are mixed so you cannot answer on autopilot.");
  return parts.join(" ");
}

/** Numbers the rationale may mention: anything else is treated as hallucinated. */
export function allowedNumbers(facts: ExerciseSetFacts, itemCount: number): Set<number> {
  const nums = new Set<number>([itemCount, facts.weakItems, facts.reviewDue, facts.fadedToTyped, facts.inBand, facts.eventsSeen, Math.round(facts.meanAccuracy * 10), Math.round(facts.meanAccuracy * 100)]);
  for (const t of facts.topTraps) {
    nums.add(t.misses);
    nums.add(t.attempts);
  }
  return nums;
}

export function rationaleIsGrounded(text: string, facts: ExerciseSetFacts, itemCount: number): boolean {
  const allowed = allowedNumbers(facts, itemCount);
  const mentioned = (text.match(/\b\d+\b/g) ?? []).map(Number);
  return mentioned.every((m) => allowed.has(m) || m <= 10);
}

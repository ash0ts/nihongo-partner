import { z } from "zod";
import type { DrillItem } from "./drills";
import { trapForItem } from "./traps";

/**
 * One answered prompt. This is the contract shared by the web app, the learner
 * simulator (`sim/`), and the evals (`evals/`): every producer writes this shape and
 * every consumer reads it. Keep it flat and JSON-friendly.
 */
export const InteractionPhaseSchema = z.enum(["drill", "checkpoint", "review", "retry", "sensei-set"]);
export type InteractionPhase = z.infer<typeof InteractionPhaseSchema>;

export const InteractionEventSchema = z.object({
  /** ISO timestamp. */
  at: z.string().min(1),
  /** One id per app load or simulated session; groups events into a conversation. */
  sessionId: z.string().min(1),
  unitId: z.string(),
  itemId: z.string().min(1),
  variantKey: z.string().min(1),
  category: z.enum(["kana", "vocab", "grammar", "counter"]),
  skill: z.string().min(1),
  answerKind: z.enum(["choice", "typed"]),
  mode: z.enum(["bridge", "classroom", "immersion"]),
  /** What the learner typed or tapped (trimmed, max 120 chars). */
  input: z.string().max(120),
  /** Canonical answer (`DrillItem.answerDisplay`). */
  expected: z.string(),
  correct: z.boolean(),
  ms: z.number().int().nonnegative(),
  /** Trap this item exercises (from `traps.ts`), whether or not the learner fell for it. */
  trapId: z.string().optional(),
  phase: InteractionPhaseSchema,
});
export type InteractionEvent = z.infer<typeof InteractionEventSchema>;

export const EVENT_LOG_CAP = 3000;

export function makeSessionId(now = new Date(), rand = Math.random): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const tail = Math.floor(rand() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `s-${stamp}-${tail}`;
}

export interface MakeEventInput {
  item: DrillItem;
  sessionId: string;
  unitId?: string;
  mode: InteractionEvent["mode"];
  input: string;
  correct: boolean;
  ms: number;
  phase: InteractionPhase;
  now?: Date;
}

export function makeEvent(args: MakeEventInput): InteractionEvent {
  const { item } = args;
  return {
    at: (args.now ?? new Date()).toISOString(),
    sessionId: args.sessionId,
    unitId: args.unitId ?? item.sourceUnitId,
    itemId: item.id,
    variantKey: item.variantKey,
    category: item.category,
    skill: item.skill,
    answerKind: item.answerKind,
    mode: args.mode,
    input: args.input.trim().slice(0, 120),
    expected: item.answerDisplay,
    correct: args.correct,
    ms: Math.max(0, Math.round(args.ms)),
    trapId: trapForItem(item)?.id,
    phase: args.phase,
  };
}

/** Appends to a bounded log; the oldest events fall off first. */
export function appendEvent(log: readonly InteractionEvent[], event: InteractionEvent, cap = EVENT_LOG_CAP): InteractionEvent[] {
  const next = [...log, event];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Validates an arbitrary JSON array (from a sim run or an exported snapshot). */
export function parseEvents(raw: unknown): InteractionEvent[] {
  return z.array(InteractionEventSchema).parse(raw);
}

/* ---------------------------------------------------------------------------------------- */
/* Summaries used by the agent, the composer, and the readiness panel                        */
/* ---------------------------------------------------------------------------------------- */

export interface TrapStat {
  trapId: string;
  attempts: number;
  misses: number;
  missRate: number;
  lastMissAt?: string;
}

export function summarizeTraps(events: readonly InteractionEvent[]): TrapStat[] {
  const byTrap = new Map<string, TrapStat>();
  for (const e of events) {
    if (!e.trapId) continue;
    const s = byTrap.get(e.trapId) ?? { trapId: e.trapId, attempts: 0, misses: 0, missRate: 0 };
    s.attempts += 1;
    if (!e.correct) {
      s.misses += 1;
      s.lastMissAt = e.at;
    }
    byTrap.set(e.trapId, s);
  }
  return Array.from(byTrap.values())
    .map((s) => ({ ...s, missRate: s.attempts ? s.misses / s.attempts : 0 }))
    .sort((a, b) => b.missRate - a.missRate || b.misses - a.misses);
}

export interface ItemStat {
  itemId: string;
  attempts: number;
  misses: number;
  lastInputs: string[];
  avgMs: number;
}

export function summarizeItems(events: readonly InteractionEvent[]): ItemStat[] {
  const byItem = new Map<string, ItemStat & { totalMs: number }>();
  for (const e of events) {
    const s = byItem.get(e.itemId) ?? { itemId: e.itemId, attempts: 0, misses: 0, lastInputs: [], avgMs: 0, totalMs: 0 };
    s.attempts += 1;
    s.totalMs += e.ms;
    if (!e.correct) {
      s.misses += 1;
      s.lastInputs = [...s.lastInputs.slice(-2), e.input];
    }
    byItem.set(e.itemId, s);
  }
  return Array.from(byItem.values())
    .map(({ totalMs, ...s }) => ({ ...s, avgMs: s.attempts ? Math.round(totalMs / s.attempts) : 0 }))
    .sort((a, b) => b.misses - a.misses || a.attempts - b.attempts);
}

/** Longest run of consecutive misses at the tail of the log (used for the learner-stuck signal). */
export function trailingMissStreak(events: readonly InteractionEvent[]): number {
  let n = 0;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].correct) break;
    n += 1;
  }
  return n;
}

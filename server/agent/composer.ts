/**
 * Server half of the exercise composer. The item selection is the shared deterministic core in
 * src/engine/composer.ts, run here as the traced `compose_exercise_set` tool. The model's only
 * job is a one-paragraph rationale written from `facts`; any number it invents that is not in
 * the facts drops the paragraph back to the deterministic one.
 */
import { composeExerciseSet, type ExerciseSet, itemPool, rationaleIsGrounded, TEACHING_RULES } from "../../src/engine/composer";
import type { InteractionEvent } from "../../src/engine/events";
import type { StudyPath } from "../../src/engine/path";
import type { TurnTrace } from "../tracing";

export interface ComposeRequest {
  sessionId: string;
  mode: ExerciseSet["mode"];
  recentEvents?: InteractionEvent[];
  persona?: string;
  unitId?: string;
  n?: number;
}

export async function composeTool(trace: TurnTrace, path: StudyPath, req: ComposeRequest): Promise<ExerciseSet> {
  const events = req.recentEvents ?? [];
  // The set is plain data; round-trip through JSON to satisfy the span's JsonValue payload type.
  const json = await trace.tool("compose_exercise_set", { events: events.length, n: req.n ?? 10, mode: req.mode }, () =>
    JSON.parse(JSON.stringify(composeExerciseSet({ events, pool: itemPool(path), mode: req.mode, n: req.n ?? 10 }))),
  );
  return json as unknown as ExerciseSet;
}

export function rationalePrompt(set: ExerciseSet): { system: string[]; facts: Record<string, unknown> } {
  return {
    system: [
      "You are a concise Japanese Sensei. You have just built a short custom drill set for a student cramming Genki I Lessons 0-2.",
      "Write the reason for this set in 2 or 3 plain English sentences a beginner can read. Speak to the student as 'you'.",
      "Mention ONLY the rules listed in appliedRules and ONLY numbers that appear in the facts. Do not mention internal field names. No praise, no filler, no romaji.",
      "If eventsSeen is 0 there is no history yet: say this is a starter set that will adapt once the student has answered some items.",
      "If recentMisses > 0, open with what the student missed (use missedPrompts to name the items, e.g. '2:05') and say those come back first. Do not describe the set's size or mechanics unless a rule in appliedRules is about it.",
    ],
    facts: {
      appliedRules: set.rules.map((r) => ({ id: r, meaning: TEACHING_RULES[r] })),
      ...set.facts,
      itemCount: set.items.length,
    },
  };
}

export function acceptRationale(set: ExerciseSet, text: string | undefined): ExerciseSet {
  const t = (text ?? "").trim();
  if (!t || t.split(/\s+/).length > 90 || !rationaleIsGrounded(t, set.facts, set.items.length)) return set;
  return { ...set, rationale: t, source: "llm" };
}

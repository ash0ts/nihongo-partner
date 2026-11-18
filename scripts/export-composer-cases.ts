/**
 * Run the deterministic composer over every simulated learner session and write the sets
 * for the Python composer eval.
 *
 *   pnpm export:composer-cases                 # deterministic rationale only (fast, offline)
 *   pnpm export:composer-cases --llm           # ask the running/spawned Sensei server for rationales
 *
 * Output: evals/datasets/composer-cases.jsonl, one row per session.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { STUDY_PATH } from "../src/content/study-path";
import { composeExerciseSet, type ExerciseSet, itemPool, TEACHING_RULES } from "../src/engine/composer";
import { type InteractionEvent, summarizeTraps } from "../src/engine/events";

const useLlm = process.argv.includes("--llm");
const serverUrl = process.env.SENSEI_URL ?? "http://127.0.0.1:5179";

const events = readFileSync("evals/datasets/sim-v1.jsonl", "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as InteractionEvent);

const bySession = new Map<string, InteractionEvent[]>();
for (const e of events) bySession.set(e.sessionId, [...(bySession.get(e.sessionId) ?? []), e]);

const pool = itemPool(STUDY_PATH);
const rows: unknown[] = [];

async function composeFor(sessionId: string, evs: InteractionEvent[]): Promise<ExerciseSet> {
  const mode = evs[evs.length - 1]?.mode ?? "bridge";
  if (!useLlm) return composeExerciseSet({ events: evs, pool, mode, n: 10, now: new Date(evs[evs.length - 1].at) });
  const res = await fetch(`${serverUrl}/api/tutor/compose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: `${sessionId}-compose`, displayMode: mode, persona: sessionId.split("-").slice(3, -1).join("-"), recentEvents: evs, n: 10 }),
  });
  const data = (await res.json()) as { ok: boolean; result?: ExerciseSet; error?: string };
  if (!data.ok || !data.result) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.result;
}

for (const [sessionId, evs] of bySession) {
  // sim session ids look like sim-<seed>-<yyyy>-<mm>-<dd>-<persona>-<unit>; persona can contain hyphens.
  const unitId = evs[0].unitId;
  const persona = sessionId.split("-").slice(5).join("-").slice(0, -(unitId.length + 1));
  const set = await composeFor(sessionId, evs);
  rows.push({
    sessionId,
    persona,
    unitId,
    mode: set.mode,
    trapStats: summarizeTraps(evs).filter((t) => t.misses > 0),
    recentCorrectItemIds: evs.slice(-10).filter((e) => e.correct).map((e) => e.itemId),
    ruleMeanings: Object.fromEntries(set.rules.map((r) => [r, TEACHING_RULES[r]])),
    set,
  });
  if (useLlm) process.stderr.write(`${sessionId}: ${set.source}\n`);
}

mkdirSync("evals/datasets", { recursive: true });
writeFileSync("evals/datasets/composer-cases.jsonl", rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`wrote ${rows.length} composer cases -> evals/datasets/composer-cases.jsonl (${useLlm ? "llm rationales" : "deterministic"})`);

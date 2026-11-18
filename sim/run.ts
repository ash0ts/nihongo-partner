import fs from "node:fs";
import path from "node:path";
import { createTutorHandler } from "../server/handler";
import { createTraceRunner } from "../server/tracing";
import { STUDY_PATH } from "../src/content/study-path";
import { createRng, type DrillItem, grade } from "../src/engine/drills";
import { type InteractionEvent, type InteractionPhase, makeEvent, summarizeTraps } from "../src/engine/events";
import { selectCheckpointItems, selectDrillItems, type StudyUnit } from "../src/engine/path";
import { createEmptySnapshot, type ProgressSnapshot, recordCheckpoint, recordReview } from "../src/engine/srs";
import { trapForItem } from "../src/engine/traps";
import { type Persona, PERSONA_BY_ID, PERSONAS } from "./personas";
import { SENTENCE_CASES } from "./utterances";

/**
 * Learner simulator. Walks personas through real study units (teach -> drill -> checkpoint
 * -> retry) using the same selection and grading code as the app, emits InteractionEvents,
 * and (unless --no-llm) asks the Sensei agent to explain each miss and summarise each
 * failed checkpoint so every call lands in Agent Lens.
 *
 *   pnpm sim --personas all --units default --seed 7 --out out/sim/run-7
 *   pnpm sim --no-llm            # deterministic, no network, used in CI
 */

const DEFAULT_UNITS = [
  "kana-rows-1",
  "kana-contrasts",
  "kana-voicing",
  "L01-g-g01-wa-desu",
  "L01-counters",
  "L02-g-g02-kosoado-matrix",
  "L02-counters",
  "L01-checkpoint",
];

interface Args {
  personas: string[];
  units: string[];
  seed: number;
  out: string;
  llm: boolean;
  trace: boolean;
  concurrency: number;
  maxAttempts: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const personas = (get("--personas") ?? "all") === "all" ? PERSONAS.map((p) => p.id) : (get("--personas") ?? "").split(",").filter(Boolean);
  const unitsRaw = get("--units") ?? "default";
  const units = unitsRaw === "default" ? DEFAULT_UNITS : unitsRaw === "all" ? STUDY_PATH.units.map((u) => u.id) : unitsRaw.split(",").filter(Boolean);
  const seed = Number(get("--seed") ?? 7);
  return {
    personas,
    units,
    seed,
    out: get("--out") ?? path.join("out", "sim", `run-${seed}`),
    llm: !argv.includes("--no-llm"),
    trace: !argv.includes("--no-trace"),
    concurrency: Number(get("--concurrency") ?? 3),
    maxAttempts: Number(get("--max-attempts") ?? 2),
  };
}

/* ---------------------------------------------------------------------------------------- */
/* Answer model                                                                               */
/* ---------------------------------------------------------------------------------------- */

interface Answer {
  input: string;
  correct: boolean;
  ms: number;
  slipped: boolean;
}

function wrongTyped(item: DrillItem, pool: readonly DrillItem[], rng: () => number): string {
  const others = pool.filter((p) => p.id !== item.id && p.skill === item.skill && p.answerDisplay !== item.answerDisplay);
  if (others.length > 0) return others[Math.floor(rng() * others.length)].answerDisplay;
  return "わかりません";
}

export function answerFor(item: DrillItem, persona: Persona, pool: readonly DrillItem[], rng: () => number, answered: number): Answer {
  const fatigue = persona.fatigueSlope * (answered / 10);
  const accuracy = Math.max(0.2, persona.baseAccuracy - fatigue);
  const typed = item.answerKind === "typed";
  const ms = Math.round(persona.msMean * (typed ? persona.typedMsFactor : 1) * (0.6 + rng() * 0.8));

  const trap = trapForItem(item);
  if (trap) {
    const pFall = persona.trapRates[trap.id] ?? persona.defaultTrapRate;
    if (rng() < pFall) {
      const slip = trap.slip(item);
      if (slip) return { input: slip, correct: grade(item, slip), ms, slipped: true };
    }
  }

  if (rng() < accuracy) {
    if (!typed) return { input: item.answerDisplay, correct: true, ms, slipped: false };
    const useRomaji = persona.mode === "bridge" && rng() < persona.romajiDependence && item.acceptedRomaji.length > 0;
    const input = useRomaji ? item.acceptedRomaji[0] : (item.acceptedKana[0] ?? item.answerDisplay);
    return { input, correct: grade(item, input), ms, slipped: false };
  }

  if (!typed && item.options) {
    const wrong = item.options.filter((o) => o !== item.answerDisplay);
    const input = wrong[Math.floor(rng() * wrong.length)] ?? item.answerDisplay;
    return { input, correct: grade(item, input), ms, slipped: false };
  }
  const input = wrongTyped(item, pool, rng);
  return { input, correct: grade(item, input), ms, slipped: false };
}

/* ---------------------------------------------------------------------------------------- */
/* Session walk                                                                               */
/* ---------------------------------------------------------------------------------------- */

export interface AgentOutput {
  sessionId: string;
  persona: string;
  unitId: string;
  task: "explain_miss" | "what_to_fix" | "grade_sentence";
  itemId?: string;
  input: string;
  expected?: string;
  trapId?: string;
  mode: Persona["mode"];
  result: unknown;
  conversationId?: string;
  error?: string;
}

interface SessionResult {
  events: InteractionEvent[];
  outputs: AgentOutput[];
  summary: { persona: string; unitId: string; drillAccuracy: number; checkpointScores: number[]; passed: boolean };
}

async function runSession(
  persona: Persona,
  unit: StudyUnit,
  args: Args,
  handler: ReturnType<typeof createTutorHandler> | null,
  runId: string,
): Promise<SessionResult> {
  const sessionId = `sim-${runId}-${persona.id}-${unit.id}`;
  const rng = createRng(`${args.seed}:${persona.id}:${unit.id}`);
  let progress: ProgressSnapshot = createEmptySnapshot();
  progress.displayMode = persona.mode;
  const events: InteractionEvent[] = [];
  const outputs: AgentOutput[] = [];
  let clock = Date.parse("2026-11-18T09:00:00Z") + Math.floor(rng() * 3_600_000);
  let answered = 0;
  const pool = [...unit.drillItems, ...unit.checkpointPool];

  const recent = () => events.slice(-60);

  async function answerItems(items: DrillItem[], phase: InteractionPhase, explain: boolean): Promise<{ correct: number; missed: Array<{ item: DrillItem; input: string }> }> {
    let correct = 0;
    const missed: Array<{ item: DrillItem; input: string }> = [];
    for (const item of items) {
      const a = answerFor(item, persona, pool, rng, answered);
      answered += 1;
      clock += a.ms + 400;
      progress = recordReview(progress, item.id, item.category, a.correct, a.ms, new Date(clock));
      const ev = makeEvent({ item, sessionId, unitId: unit.id, mode: persona.mode, input: a.input, correct: a.correct, ms: a.ms, phase, now: new Date(clock) });
      events.push(ev);
      if (a.correct) correct += 1;
      else {
        missed.push({ item, input: a.input });
        if (explain && handler) {
          try {
            const out = await handler.sensei.explainMiss({
              sessionId,
              mode: persona.mode,
              unitId: unit.id,
              persona: persona.id,
              recentEvents: recent(),
              itemId: item.id,
              variantKey: item.variantKey,
              input: a.input,
              expected: item.answerDisplay,
            });
            outputs.push({ sessionId, persona: persona.id, unitId: unit.id, task: "explain_miss", itemId: item.id, input: a.input, expected: item.answerDisplay, trapId: ev.trapId, mode: persona.mode, result: out.result, conversationId: out.conversationId });
          } catch (err) {
            outputs.push({ sessionId, persona: persona.id, unitId: unit.id, task: "explain_miss", itemId: item.id, input: a.input, expected: item.answerDisplay, trapId: ev.trapId, mode: persona.mode, result: null, error: err instanceof Error ? err.message : String(err) });
          }
        }
      }
    }
    return { correct, missed };
  }

  // Drill (explanations on, like the app)
  const drillItems = selectDrillItems(unit, progress, 0);
  const drill = await answerItems(drillItems, "drill", args.llm);
  const drillAccuracy = drillItems.length ? drill.correct / drillItems.length : 1;

  // Checkpoint with up to maxAttempts; retry misses between attempts
  const checkpointScores: number[] = [];
  let passed = !unit.gated;
  for (let attempt = 0; attempt < args.maxAttempts; attempt += 1) {
    const items = selectCheckpointItems(unit, progress, attempt);
    const cp = await answerItems(items, "checkpoint", false);
    const score = items.length ? cp.correct / items.length : 1;
    checkpointScores.push(score);
    progress = recordCheckpoint(progress, unit.id, score, unit.gated ? unit.passBar : 0, new Date(clock));
    if (cp.missed.length > 0 && args.llm && handler) {
      try {
        const out = await handler.sensei.whatToFix({
          sessionId,
          mode: persona.mode,
          unitId: unit.id,
          persona: persona.id,
          recentEvents: recent(),
          unitTitle: unit.title,
          missed: cp.missed.map((m) => ({ itemId: m.item.id, input: m.input, expected: m.item.answerDisplay, trapId: trapForItem(m.item)?.id })),
        });
        outputs.push({ sessionId, persona: persona.id, unitId: unit.id, task: "what_to_fix", input: cp.missed.map((m) => m.item.id).join(","), mode: persona.mode, result: out.result, conversationId: out.conversationId });
      } catch (err) {
        outputs.push({ sessionId, persona: persona.id, unitId: unit.id, task: "what_to_fix", input: "", mode: persona.mode, result: null, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (!unit.gated || score >= unit.passBar) {
      passed = true;
      break;
    }
    if (cp.missed.length > 0 && attempt + 1 < args.maxAttempts) {
      await answerItems(cp.missed.map((m) => ({ ...m.item, variantKey: `${m.item.variantKey}:retry${attempt}` })), "retry", args.llm);
    }
  }

  return { events, outputs, summary: { persona: persona.id, unitId: unit.id, drillAccuracy, checkpointScores, passed } };
}

/** Free-form sentence grading, which only exists with a model (the deterministic path has no grader). */
async function runSentenceCases(persona: Persona, handler: ReturnType<typeof createTutorHandler>, runId: string, rng: () => number): Promise<AgentOutput[]> {
  const sessionId = `sim-${runId}-${persona.id}-sentences`;
  const outputs: AgentOutput[] = [];
  const cases = SENTENCE_CASES.filter((c) => !c.trapId || rng() < (persona.trapRates[c.trapId] ?? persona.defaultTrapRate) || c.expectedCorrect);
  for (const c of cases.slice(0, 6)) {
    try {
      const out = await handler.sensei.gradeTyped({
        sessionId,
        mode: persona.mode,
        persona: persona.id,
        userMessage: c.utterance,
        allowedGrammar: ["G1.1 [X は] Y です", "G1.2 〜ですか", "G1.3 N1 の N2", "G2.5 も", "G2.6 じゃないです"],
      });
      outputs.push({ sessionId, persona: persona.id, unitId: "sentences", task: "grade_sentence", input: c.utterance, expected: c.expectedCorrect ? "correct" : "incorrect", trapId: c.trapId, mode: persona.mode, result: out.result, conversationId: out.conversationId });
    } catch (err) {
      outputs.push({ sessionId, persona: persona.id, unitId: "sentences", task: "grade_sentence", input: c.utterance, expected: c.expectedCorrect ? "correct" : "incorrect", trapId: c.trapId, mode: persona.mode, result: null, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return outputs;
}

/* ---------------------------------------------------------------------------------------- */
/* Main                                                                                       */
/* ---------------------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = `${args.seed}-${new Date().toISOString().slice(0, 10)}`;
  const personas = args.personas.map((id) => {
    const p = PERSONA_BY_ID.get(id);
    if (!p) throw new Error(`Unknown persona ${id}. Known: ${PERSONAS.map((x) => x.id).join(", ")}`);
    return p;
  });
  const units = args.units.map((id) => {
    const u = STUDY_PATH.units.find((x) => x.id === id);
    if (!u) throw new Error(`Unknown unit ${id}`);
    return u;
  });

  const tracer = createTraceRunner({ enabled: args.llm && args.trace, spanProcessor: "batch" });
  const handler = args.llm ? createTutorHandler({ tracer, allowAll: true }) : null;
  if (args.llm && !handler?.creds) {
    console.error("No inference credentials (WANDB_API_KEY / ~/.netrc / OPENAI_API_KEY). Re-run with --no-llm for the deterministic path.");
    process.exit(2);
  }
  const tracing = handler ? await tracer.enabled() : false;
  console.log(`sim ${runId}: ${personas.length} personas x ${units.length} units, seed ${args.seed}, llm=${args.llm}, tracing=${tracing ? tracer.project : "off"}`);

  fs.mkdirSync(args.out, { recursive: true });
  const allEvents: InteractionEvent[] = [];
  const allOutputs: AgentOutput[] = [];
  const summaries: SessionResult["summary"][] = [];

  // Personas run concurrently (bounded); units within a persona run in order so fatigue and mastery carry forward realistically.
  const queue = [...personas];
  async function worker(): Promise<void> {
    for (let p = queue.shift(); p; p = queue.shift()) {
      for (const unit of units) {
        const r = await runSession(p, unit, args, handler, runId);
        allEvents.push(...r.events);
        allOutputs.push(...r.outputs);
        summaries.push(r.summary);
        console.log(`  ${p.id.padEnd(20)} ${unit.id.padEnd(26)} drill ${(r.summary.drillAccuracy * 100).toFixed(0).padStart(3)}%  checkpoint ${r.summary.checkpointScores.map((s) => `${(s * 100).toFixed(0)}%`).join(" -> ")} ${r.summary.passed ? "pass" : "FAIL"}`);
      }
      if (handler) {
        const rng = createRng(`${args.seed}:${p.id}:sentences`);
        allOutputs.push(...(await runSentenceCases(p, handler, runId, rng)));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, args.concurrency) }, () => worker()));

  const write = (name: string, rows: unknown[]) => fs.writeFileSync(path.join(args.out, name), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  write("events.jsonl", allEvents);
  write("agent-outputs.jsonl", allOutputs);
  const trapStats = summarizeTraps(allEvents);
  const byPersona = Object.fromEntries(
    personas.map((p) => {
      const evs = allEvents.filter((e) => e.sessionId.includes(`-${p.id}-`));
      return [p.id, { events: evs.length, accuracy: evs.length ? evs.filter((e) => e.correct).length / evs.length : 0, traps: summarizeTraps(evs).slice(0, 5) }];
    }),
  );
  fs.writeFileSync(
    path.join(args.out, "summary.json"),
    JSON.stringify({ runId, seed: args.seed, llm: args.llm, tracing: tracing ? tracer.project : null, personas: args.personas, units: args.units, events: allEvents.length, agentOutputs: allOutputs.length, errors: allOutputs.filter((o) => o.error).length, sessions: summaries, trapStats, byPersona }, null, 2),
  );
  console.log(`wrote ${allEvents.length} events, ${allOutputs.length} agent outputs (${allOutputs.filter((o) => o.error).length} errors) -> ${args.out}`);
  if (handler) {
    await tracer.flush();
    await tracer.shutdown();
  }
}

const isMain = process.argv[1] && /sim[\\/]run\.ts$/.test(process.argv[1]);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

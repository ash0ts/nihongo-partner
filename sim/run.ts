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
import { OFF_TOPIC_CASES, SENTENCE_CASES } from "./utterances";

/**
 * Learner simulator. Walks personas through real study units (teach -> drill -> checkpoint
 * -> retry) using the same selection and grading code as the app, emits InteractionEvents,
 * and (unless --no-llm) asks the Sensei agent to explain each miss and summarise each
 * failed checkpoint so every call lands in Agent Lens.
 *
 *   pnpm sim --personas all --units default --seed 7 --out out/sim/run-7
 *   pnpm sim --no-llm            # deterministic, no network, used in CI
 *   pnpm sim --population 80 --seed 21 --cohort pop-21
 *                                # a realistic population: learners sampled by persona weight,
 *                                # each on a 2-5 unit journey with progress carried forward
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
  /** Population mode: number of learners to sample by persona weight (0 = classic persona x unit grid). */
  population: number;
  cohort?: string;
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
    population: Number(get("--population") ?? 0),
    cohort: get("--cohort"),
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

const NOISE = ["。", " ", "　", "  ", "！"];

function withNoise(input: string, rng: () => number): string {
  const n = NOISE[Math.floor(rng() * NOISE.length)];
  return rng() < 0.5 ? `${input}${n}` : ` ${input}${n}`;
}

export function answerFor(item: DrillItem, persona: Persona, pool: readonly DrillItem[], rng: () => number, answered: number, missStreak = 0): Answer {
  const fatigue = persona.fatigueSlope * (answered / 10);
  const accuracy = Math.max(0.2, persona.baseAccuracy - fatigue);
  const typed = item.answerKind === "typed";
  const ms = Math.round(persona.msMean * (typed ? persona.typedMsFactor : 1) * (0.6 + rng() * 0.8));
  const q = persona.quirks ?? {};

  // Edge behaviours first: they override the accuracy model.
  if (q.giveUpAfter !== undefined && missStreak >= q.giveUpAfter && typed) {
    const input = rng() < 0.6 ? "わかりません" : "?";
    return { input, correct: false, ms: Math.round(ms * 0.4), slipped: false };
  }
  if (typed && q.blankRate && rng() < q.blankRate) return { input: "", correct: false, ms: Math.round(ms * 0.3), slipped: false };
  if (typed && q.englishRate && rng() < q.englishRate && item.prompt.en) {
    const input = item.prompt.en.replace(/\s*\([^)]*\)/g, "").split(/[,;/]/)[0].trim().toLowerCase();
    return { input, correct: grade(item, input), ms, slipped: false };
  }
  if (typed && q.romajiEverywhere && item.acceptedRomaji.length > 0 && rng() < accuracy) {
    const input = item.acceptedRomaji[0];
    return { input, correct: grade(item, input), ms, slipped: false };
  }

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
    let input = useRomaji ? item.acceptedRomaji[0] : (item.acceptedKana[0] ?? item.answerDisplay);
    if (q.noiseRate && rng() < q.noiseRate) input = withNoise(input, rng);
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
  progress: ProgressSnapshot;
  summary: { persona: string; learnerId: string; unitId: string; drillAccuracy: number; checkpointScores: number[]; passed: boolean; agentCalls: number };
}

interface Learner {
  /** Stable id for one simulated person across units, e.g. `l07-steady-median`. */
  id: string;
  persona: Persona;
  /** Progress carried from the learner's earlier units (population mode). */
  progress: ProgressSnapshot;
  /** Earlier events for this learner, so the agent's learner state spans units. */
  history: InteractionEvent[];
  cohort?: string;
}

async function runSession(
  learner: Learner,
  unit: StudyUnit,
  args: Args,
  handler: ReturnType<typeof createTutorHandler> | null,
  runId: string,
): Promise<SessionResult> {
  const persona = learner.persona;
  const sessionId = `sim-${runId}-${learner.id}-${unit.id}`;
  const rng = createRng(`${args.seed}:${learner.id}:${unit.id}`);
  let progress: ProgressSnapshot = { ...learner.progress, displayMode: persona.mode };
  const events: InteractionEvent[] = [];
  const outputs: AgentOutput[] = [];
  // Fresh learners start in a synthetic morning; a learner's later units start 10-40 minutes after the previous one ended.
  const lastSeen = learner.history.at(-1)?.at;
  let clock = lastSeen ? Date.parse(lastSeen) + 600_000 + Math.floor(rng() * 1_800_000) : Date.parse("2026-11-18T09:00:00Z") + Math.floor(rng() * 3_600_000);
  let answered = 0;
  let missStreak = 0;
  const pool = [...unit.drillItems, ...unit.checkpointPool];

  const recent = () => [...learner.history, ...events].slice(-60);
  const ctx = { sessionId, mode: persona.mode, unitId: unit.id, persona: persona.id, learnerId: learner.id, cohort: learner.cohort } as const;

  async function answerItems(items: DrillItem[], phase: InteractionPhase, explain: boolean): Promise<{ correct: number; missed: Array<{ item: DrillItem; input: string }> }> {
    let correct = 0;
    const missed: Array<{ item: DrillItem; input: string }> = [];
    for (const item of items) {
      const a = answerFor(item, persona, pool, rng, answered, missStreak);
      answered += 1;
      missStreak = a.correct ? 0 : missStreak + 1;
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
              ...ctx,
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
          ...ctx,
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

  return { events, outputs, progress, summary: { persona: persona.id, learnerId: learner.id, unitId: unit.id, drillAccuracy, checkpointScores, passed, agentCalls: outputs.length } };
}

/** Free-form sentence grading, which only exists with a model (the deterministic path has no grader). */
async function runSentenceCases(learner: Learner, handler: ReturnType<typeof createTutorHandler>, runId: string, rng: () => number): Promise<AgentOutput[]> {
  const persona = learner.persona;
  const sessionId = `sim-${runId}-${learner.id}-sentences`;
  const outputs: AgentOutput[] = [];
  const offTopicRate = persona.quirks?.offTopicRate ?? 0;
  const graded = SENTENCE_CASES.filter((c) => !c.trapId || rng() < (persona.trapRates[c.trapId] ?? persona.defaultTrapRate) || c.expectedCorrect);
  const cases = graded.slice(0, 6).map((c) => (rng() < offTopicRate ? OFF_TOPIC_CASES[Math.floor(rng() * OFF_TOPIC_CASES.length)] : c));
  for (const c of cases) {
    try {
      const out = await handler.sensei.gradeTyped({
        sessionId,
        mode: persona.mode,
        persona: persona.id,
        learnerId: learner.id,
        cohort: learner.cohort,
        userMessage: c.utterance,
        allowedGrammar: ["G1.1 [X は] Y です", "G1.2 〜ですか", "G1.3 N1 の N2", "G2.5 も", "G2.6 じゃないです"],
      });
      outputs.push({ sessionId, persona: persona.id, unitId: "sentences", task: "grade_sentence", input: c.utterance, expected: c.id.startsWith("o-") ? (c.expectedCorrect ? "correct" : "out-of-scope") : c.expectedCorrect ? "correct" : "incorrect", trapId: c.trapId, mode: persona.mode, result: out.result, conversationId: out.conversationId });
    } catch (err) {
      outputs.push({ sessionId, persona: persona.id, unitId: "sentences", task: "grade_sentence", input: c.utterance, expected: c.expectedCorrect ? "correct" : "incorrect", trapId: c.trapId, mode: persona.mode, result: null, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return outputs;
}

/* ---------------------------------------------------------------------------------------- */
/* Main                                                                                       */
/* ---------------------------------------------------------------------------------------- */

function pickWeighted(rng: () => number): Persona {
  const total = PERSONAS.reduce((a, p) => a + p.weight, 0);
  let r = rng() * total;
  for (const p of PERSONAS) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return PERSONAS[PERSONAS.length - 1];
}

/**
 * Population mode: N learners sampled by persona weight. Each gets a journey of 2-5
 * consecutive Study Path units, starting near the beginning more often than not (new
 * learners outnumber returning ones), with progress and event history carried forward.
 */
function buildPopulation(n: number, seed: number, cohort: string | undefined): Array<{ learner: Learner; units: StudyUnit[] }> {
  const rng = createRng(`${seed}:population`);
  const pathUnits = STUDY_PATH.units.filter((u) => u.drillItems.length > 0 || u.checkpointPool.length > 0);
  const out: Array<{ learner: Learner; units: StudyUnit[] }> = [];
  for (let k = 0; k < n; k += 1) {
    const persona = pickWeighted(rng);
    const length = 2 + Math.floor(rng() * 4);
    // Skewed start: most begin in the first third of the path.
    const start = Math.floor(Math.pow(rng(), 2) * Math.max(1, pathUnits.length - length));
    const units = pathUnits.slice(start, start + length);
    const progress = createEmptySnapshot();
    progress.displayMode = persona.mode;
    out.push({ learner: { id: `l${String(k + 1).padStart(2, "0")}-${persona.id}`, persona, progress, history: [], cohort }, units });
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const date = new Date().toISOString().slice(0, 10);
  const runId = args.population > 0 ? `${args.cohort ?? `pop-${args.seed}`}-${date}` : `${args.seed}-${date}`;
  const cohort = args.population > 0 ? runId : args.cohort;

  let plan: Array<{ learner: Learner; units: StudyUnit[] }>;
  if (args.population > 0) {
    plan = buildPopulation(args.population, args.seed, cohort);
  } else {
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
    plan = personas.map((persona) => {
      const progress = createEmptySnapshot();
      progress.displayMode = persona.mode;
      return { learner: { id: persona.id, persona, progress, history: [], cohort }, units };
    });
  }

  const tracer = createTraceRunner({ enabled: args.llm && args.trace, spanProcessor: "batch" });
  const handler = args.llm ? createTutorHandler({ tracer, allowAll: true }) : null;
  if (args.llm && !handler?.creds) {
    console.error("No inference credentials (WANDB_API_KEY / ~/.netrc / OPENAI_API_KEY). Re-run with --no-llm for the deterministic path.");
    process.exit(2);
  }
  const tracing = handler ? await tracer.enabled() : false;
  const sessionsPlanned = plan.reduce((a, p) => a + p.units.length, 0);
  console.log(`sim ${runId}: ${plan.length} learners, ${sessionsPlanned} unit sessions, seed ${args.seed}, llm=${args.llm}, tracing=${tracing ? tracer.project : "off"}`);

  fs.mkdirSync(args.out, { recursive: true });
  const allEvents: InteractionEvent[] = [];
  const allOutputs: AgentOutput[] = [];
  const summaries: SessionResult["summary"][] = [];

  // Learners run concurrently (bounded); units within a learner run in order so fatigue and mastery carry forward.
  const queue = [...plan];
  async function worker(): Promise<void> {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const { learner, units } = next;
      for (const unit of units) {
        const r = await runSession(learner, unit, args, handler, runId);
        learner.progress = r.progress;
        learner.history.push(...r.events);
        allEvents.push(...r.events);
        allOutputs.push(...r.outputs);
        summaries.push(r.summary);
        console.log(`  ${learner.id.padEnd(26)} ${unit.id.padEnd(26)} drill ${(r.summary.drillAccuracy * 100).toFixed(0).padStart(3)}%  checkpoint ${r.summary.checkpointScores.map((s) => `${(s * 100).toFixed(0)}%`).join(" -> ")} ${r.summary.passed ? "pass" : "FAIL"}  sensei x${r.summary.agentCalls}`);
      }
      if (handler) {
        const rng = createRng(`${args.seed}:${learner.id}:sentences`);
        const rate = args.population > 0 ? (learner.persona.quirks?.sentenceSessionRate ?? 0.4) : 1;
        if (rng() < rate) allOutputs.push(...(await runSentenceCases(learner, handler, runId, rng)));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, args.concurrency) }, () => worker()));

  const write = (name: string, rows: unknown[]) => fs.writeFileSync(path.join(args.out, name), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  write("events.jsonl", allEvents);
  write("agent-outputs.jsonl", allOutputs);
  const trapStats = summarizeTraps(allEvents);
  const personaIds = [...new Set(plan.map((p) => p.learner.persona.id))];
  const byPersona = Object.fromEntries(
    personaIds.map((pid) => {
      const learners = plan.filter((p) => p.learner.persona.id === pid).map((p) => p.learner.id);
      const evs = allEvents.filter((e) => learners.some((l) => e.sessionId.includes(`-${l}-`)));
      const outs = allOutputs.filter((o) => learners.some((l) => o.sessionId.includes(`-${l}-`)));
      const sess = summaries.filter((x) => x.persona === pid);
      return [
        pid,
        {
          learners: learners.length,
          sessions: sess.length,
          passRate: sess.length ? sess.filter((x) => x.passed).length / sess.length : 0,
          events: evs.length,
          accuracy: evs.length ? evs.filter((e) => e.correct).length / evs.length : 0,
          agentCalls: outs.length,
          callsPerSession: sess.length ? outs.length / sess.length : 0,
          traps: summarizeTraps(evs).slice(0, 5),
        },
      ];
    }),
  );
  fs.writeFileSync(
    path.join(args.out, "summary.json"),
    JSON.stringify(
      {
        runId,
        cohort,
        seed: args.seed,
        llm: args.llm,
        tracing: tracing ? tracer.project : null,
        population: args.population || null,
        personas: personaIds,
        units: [...new Set(plan.flatMap((p) => p.units.map((u) => u.id)))],
        learners: plan.length,
        events: allEvents.length,
        agentOutputs: allOutputs.length,
        agentOutputsByTask: allOutputs.reduce<Record<string, number>>((acc, o) => ((acc[o.task] = (acc[o.task] ?? 0) + 1), acc), {}),
        errors: allOutputs.filter((o) => o.error).length,
        sessions: summaries,
        trapStats,
        byPersona,
      },
      null,
      2,
    ),
  );
  if (args.population > 0) {
    console.log("\npersona                 learners  sessions  pass  accuracy  sensei/session");
    for (const [pid, v] of Object.entries(byPersona).sort((a, b) => b[1].learners - a[1].learners)) {
      console.log(`  ${pid.padEnd(20)} ${String(v.learners).padStart(8)}  ${String(v.sessions).padStart(8)}  ${(v.passRate * 100).toFixed(0).padStart(3)}%  ${(v.accuracy * 100).toFixed(0).padStart(7)}%  ${v.callsPerSession.toFixed(1).padStart(14)}`);
    }
  }
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

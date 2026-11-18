/**
 * Export grading cases for the Python evals.
 *
 *   pnpm export:eval-cases            # writes evals/datasets/grading-cases.jsonl
 *
 * Three kinds of case, all with ground truth attached:
 *   - trap items: for every catalogued trap, the matching drill items answered correctly and
 *     with the trap's classic slip. Truth = deterministic `grade()`.
 *   - sim misses: distinct (item, input) pairs real personas typed in the frozen sim run.
 *     Truth = deterministic `grade()`.
 *   - sentences: free-form Lesson 1-2 utterances with hand-labelled truth, which only an
 *     LLM can grade.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { grade, type DrillItem } from "../src/engine/drills";
import { STUDY_PATH } from "../src/content/study-path";
import { TRAPS, trapCatalog, trapForItem } from "../src/engine/traps";
import { SENTENCE_CASES } from "../sim/utterances";

export interface GradingCase {
  id: string;
  kind: "trap-item" | "sim-miss" | "sentence";
  itemId?: string;
  answerKind?: "choice" | "typed";
  prompt: string;
  promptEn: string;
  expected: string;
  input: string;
  truthCorrect: boolean;
  trapId?: string;
  mode: "bridge" | "classroom" | "immersion";
  note?: string;
}

const items = new Map<string, DrillItem>();
for (const u of STUDY_PATH.units) for (const it of [...u.drillItems, ...u.checkpointPool]) if (!items.has(it.id)) items.set(it.id, it);

const promptText = (it: DrillItem) => it.prompt.text ?? it.prompt.segments?.map((s) => s.text).join("") ?? "";
const modes = ["bridge", "classroom", "immersion"] as const;
const cases: GradingCase[] = [];
const seen = new Set<string>();

function push(c: GradingCase) {
  const key = `${c.itemId ?? c.id}|${c.input}`;
  if (seen.has(key)) return;
  seen.add(key);
  cases.push(c);
}

let i = 0;
for (const trap of TRAPS) {
  const matching = [...items.values()].filter((it) => trap.matches(it));
  for (const it of matching.slice(0, 3)) {
    const mode = modes[i++ % modes.length];
    push({
      id: `trap-${trap.id}-${it.id}-ok`,
      kind: "trap-item",
      itemId: it.id,
      answerKind: it.answerKind,
      prompt: promptText(it),
      promptEn: it.prompt.en ?? "",
      expected: it.answerDisplay,
      input: it.acceptedKana[0] ?? it.answerDisplay,
      truthCorrect: grade(it, it.acceptedKana[0] ?? it.answerDisplay),
      trapId: trap.id,
      mode,
    });
    const slip = trap.slip(it);
    if (!slip) continue;
    push({
      id: `trap-${trap.id}-${it.id}-slip`,
      kind: "trap-item",
      itemId: it.id,
      answerKind: it.answerKind,
      prompt: promptText(it),
      promptEn: it.prompt.en ?? "",
      expected: it.answerDisplay,
      input: slip,
      truthCorrect: grade(it, slip),
      trapId: trap.id,
      mode,
      note: trap.label,
    });
  }
}

const simPath = "evals/datasets/sim-v1.jsonl";
if (existsSync(simPath)) {
  const misses = readFileSync(simPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { itemId: string; input: string; correct: boolean; answerKind: string; mode: GradingCase["mode"] })
    .filter((e) => !e.correct && e.answerKind === "typed" && e.input.trim().length > 0);
  for (const e of misses) {
    const it = items.get(e.itemId);
    if (!it) continue;
    push({
      id: `sim-${e.itemId}-${cases.length}`,
      kind: "sim-miss",
      itemId: it.id,
      answerKind: it.answerKind,
      prompt: promptText(it),
      promptEn: it.prompt.en ?? "",
      expected: it.answerDisplay,
      input: e.input,
      truthCorrect: grade(it, e.input),
      trapId: trapForItem(it)?.id,
      mode: e.mode,
    });
    if (cases.filter((c) => c.kind === "sim-miss").length >= 40) break;
  }
}

for (const s of SENTENCE_CASES) {
  push({
    id: s.id,
    kind: "sentence",
    prompt: "Check my sentence.",
    promptEn: "",
    expected: "",
    input: s.utterance,
    truthCorrect: s.expectedCorrect,
    trapId: s.trapId,
    mode: "classroom",
    note: s.note,
  });
}

mkdirSync("evals/datasets", { recursive: true });
writeFileSync("evals/datasets/grading-cases.jsonl", cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
writeFileSync("evals/datasets/traps.json", JSON.stringify(trapCatalog(), null, 2) + "\n");
writeFileSync(
  "evals/datasets/items.json",
  JSON.stringify(Object.fromEntries([...items.values()].map((it) => [it.id, { skill: it.skill, answerKind: it.answerKind, answer: it.answerDisplay }]))) + "\n",
);
const byKind = cases.reduce<Record<string, number>>((acc, c) => ((acc[c.kind] = (acc[c.kind] ?? 0) + 1), acc), {});
console.log(`wrote ${cases.length} grading cases -> evals/datasets/grading-cases.jsonl`, byKind);

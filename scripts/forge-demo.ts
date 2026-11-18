/**
 * `pnpm demo`: the five-minute Forge walkthrough, driven from one terminal.
 *
 * 1. Runs a small population (12 learners sampled by persona weight, `--population N` to change,
 *    or `--one` for a single rushed learner through two units) against the live Sensei agent (traced).
 * 2. Prints the Agent Lens links to open, the conversation ids to search for, and the
 *    current tag counts and agent versions pulled from the API.
 * 3. Prints the eval commands that score the same conversations offline.
 *
 * Needs a W&B key (`wandb login` or WANDB_API_KEY). Everything it creates is synthetic.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolveForgeProject, resolveWandbKey } from "../server/credentials";

const project = resolveForgeProject();
const [entity, name] = project.split("/");
const key = resolveWandbKey();
if (!key) {
  console.error("No W&B key. Run `wandb login` first; the app itself works without one, the demo does not.");
  process.exit(2);
}

const argv = process.argv.slice(2);
const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const seed = flag("--seed") ?? String(Date.now() % 1000);
const out = `out/sim/demo-${seed}`;
const one = argv.includes("--one");
const population = flag("--population") ?? "12";

const simArgs = one
  ? ["--personas", "rushed-guesser", "--units", "kana-contrasts,L01-counters"]
  : ["--population", population, "--cohort", `demo-${seed}`];
console.log(one ? `\n1. Simulating one rushed learner through two units (seed ${seed}) against the live agent...\n` : `\n1. Simulating ${population} learners sampled by persona weight (seed ${seed}) against the live agent...\n`);
const sim = spawnSync("pnpm", ["sim", "--seed", seed, ...simArgs, "--out", out, "--concurrency", "6"], { stdio: "inherit" });
if (sim.status !== 0) process.exit(sim.status ?? 1);

const outputs = readFileSync(`${out}/agent-outputs.jsonl`, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l) as { sessionId: string; task: string; trapId?: string; result: { source?: string } });
const sessions = [...new Set(outputs.map((o) => o.sessionId))];
const busiest = Object.entries(outputs.reduce<Record<string, number>>((acc, o) => ((acc[o.sessionId] = (acc[o.sessionId] ?? 0) + 1), acc), {}))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 4);
const byTask = outputs.reduce<Record<string, number>>((acc, o) => ((acc[o.task] = (acc[o.task] ?? 0) + 1), acc), {});

async function api<T>(url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const versions = await api<{ versions: Array<{ agent_version: string; invocation_count: number }> }>(
  "https://trace.wandb.ai/agents/agent-versions/query",
  { project_id: project, agent_name: "nihongo-sensei" },
  { Authorization: `Basic ${Buffer.from(`api:${key}`).toString("base64")}` },
);
const lensHeaders = { "X-Wandb-Entity": entity, "X-Wandb-Project": name };
const tags = await api<{ data: Array<{ id: string; name: string }> }>("https://agent-pulse.wandb.ai/api/tags", undefined, lensHeaders);
const now = Date.now();
const dist = await api<{ data: { buckets: Array<{ tag_counts: Record<string, number> }> } }>(
  "https://agent-pulse.wandb.ai/api/conversation-tags/distribution",
  { after_ms: now - 7 * 86_400_000, before_ms: now, time_bucket_seconds: 86_400 },
  lensHeaders,
);
const counts: Record<string, number> = {};
for (const b of dist?.data.buckets ?? []) for (const [id, n] of Object.entries(b.tag_counts)) counts[id] = (counts[id] ?? 0) + n;

const lens = `https://forge.coreweave.com/agent-lens/${project}`;
console.log(`\n2. Open Agent Lens: ${lens}\n`);
console.log(`   Just traced: ${outputs.length} turns (${Object.entries(byTask).map(([t, n]) => `${n} ${t}`).join(", ")}) in ${sessions.length} conversations.`);
console.log(`   Search for a conversation id to read it as a chat (busiest first):`);
for (const [s, n] of busiest) console.log(`     ${s}  (${n} turns)`);
if (sessions.length > busiest.length) console.log(`     ... and ${sessions.length - busiest.length} more; filter nihongo.cohort = ${one ? "(none)" : `demo-${seed}-<date>`}`);
console.log(`   Each turn shows the tool spans (get_learner_state, lookup_item, grade_answer, lookup_rule) and the model call.`);
console.log(`   Filter spans by attribute, e.g. nihongo.task = explain_miss, nihongo.trap_id = ${outputs.find((o) => o.trapId)?.trapId ?? "year-4-yonensei"}, nihongo.source = deterministic.`);
const named = (versions?.versions ?? []).filter((v) => v.agent_version).sort((a, b) => a.agent_version.localeCompare(b.agent_version));
if (named.length) {
  console.log(`\n   Agent versions (each prompt change is a new version; compare tag rates between them):`);
  for (const v of named) console.log(`     ${v.agent_version.padEnd(10)} ${v.invocation_count} turns`);
}
if (tags?.data?.length) {
  console.log(`\n   Tags the judge has applied in the last 7 days (new conversations are judged within a few minutes):`);
  for (const t of [...tags.data].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))) console.log(`     ${t.name.padEnd(16)} ${counts[t.id] ?? 0}`);
  console.log(`   Tag view: ${lens}/conversations?tags=${tags.data.map((t) => t.name).join(",")}`);
}
console.log(`\n3. Score the same replies offline (W&B EvalTables land in https://forge.coreweave.com/wandb/${project}):`);
console.log(`     cd evals && uv run nihongo-evals feedback --dataset ../${out}/agent-outputs.jsonl`);
console.log(`     cd evals && uv run nihongo-evals grading`);
console.log(`     cd evals && uv run nihongo-evals composer\n`);

/**
 * Freeze a simulator run into committed eval datasets.
 *
 *   pnpm tsx scripts/freeze-sim-dataset.ts out/sim/run-7 evals/datasets sim-v1
 *
 * Writes `<name>.jsonl` (interaction events) and `<name>-agent.jsonl` (agent outputs).
 * Everything in a sim run is synthetic, but we still drop conversation ids and any
 * absolute paths so the file is safe to publish as-is.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [src = "out/sim/run-7", dstDir = "evals/datasets", name = "sim-v1"] = process.argv.slice(2);

function readJsonl(path: string): Record<string, unknown>[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

const scrub = (value: unknown): unknown =>
  typeof value === "string" ? value.replace(/\/(Users|home)\/[^\s"']+/g, "<path>") : value;

const events = readJsonl(join(src, "events.jsonl"));
const outputs = readJsonl(join(src, "agent-outputs.jsonl")).map((row) => {
  const { conversationId: _conversationId, ...rest } = row;
  return Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, scrub(v)]));
});

mkdirSync(dstDir, { recursive: true });
writeFileSync(join(dstDir, `${name}.jsonl`), events.map((e) => JSON.stringify(e)).join("\n") + "\n");
writeFileSync(join(dstDir, `${name}-agent.jsonl`), outputs.map((o) => JSON.stringify(o)).join("\n") + "\n");

const summary = JSON.parse(readFileSync(join(src, "summary.json"), "utf8")) as Record<string, unknown>;
writeFileSync(
  join(dstDir, `${name}.summary.json`),
  JSON.stringify({ ...summary, source: `${name} frozen from simulator run` }, null, 2) + "\n",
);
console.log(`froze ${events.length} events and ${outputs.length} agent outputs -> ${dstDir}/${name}*.jsonl`);

# Showing Forge with the Sensei (ten minutes)

The app is a Genki I cram tutor first. The Forge story sits on top of it: every time the Sensei explains a miss, grades a sentence, or builds a set, that turn is traced to Agent Lens, judged by tags, and scored again offline in W&B. This page is the short path through that story. Each step is one thing to look at, and `pnpm demo` prints the links and ids for steps 2 to 4.

Prerequisites: `wandb login` (or `WANDB_API_KEY`), `pnpm install`, and `cd evals && uv sync` for step 5.

## 1. Use the tutor like a learner (2 min)

```sh
pnpm dev
```

Open the Path tab, pick a kana unit, and miss an item on purpose (answer つ when it asks for し). Press "Why was that wrong?". The reply contrasts what you wrote with the answer using the item's own mnemonic. Then finish the checkpoint and press "What to fix". Back on the Path tab, the "Sensei set" card builds ten items aimed at what you just missed and shows which teaching rules it applied.

Without a key the same buttons still work from deterministic rules; with a key they go through the model. Either way the turn is logged.

## 2. Make traffic worth looking at (1 min)

```sh
pnpm demo
```

This runs one rushed learner through two units against the live agent (about 30 turns in three conversations), then prints the conversation ids, the Agent Lens link, the agent versions, and the current tag counts.

## 3. Read one conversation in Agent Lens (3 min)

Open the printed link (`https://forge.coreweave.com/agent-lens/wandb/nihongo-partner`) and paste one of the conversation ids into search. Points to make:

- A conversation is one learner session. Each turn is a `chat` span with the tool spans under it: `get_learner_state`, `lookup_item`, `grade_answer`, `lookup_rule`, `compose_exercise_set`.
- Every span carries `nihongo.*` attributes (task, trap id, mode, unit, whether the reply came from the model or the deterministic fallback). Filter on `nihongo.task = explain_miss` and `nihongo.source = deterministic` to show how often the guardrails took over.
- Agent versions: `sensei-v1` explained kana shapes from memory and was sometimes wrong; `sensei-v2` is given the item's mnemonic and told not to invent shapes. Compare the two in the versions view.

## 4. Tags: the judge reading every conversation (2 min)

Open the tag view the script prints (or `agentlens/tags.md`). Five tags, each with plain-English criteria the LLM judge applies to new conversations within a few minutes:

| tag | what it catches |
| --- | --- |
| `trap-not-named` | the reply never names the confusion the trap catalog knows about |
| `romaji-leak` | romaji in a mode that should be kana-only |
| `scope-creep` | grammar beyond Lessons 0-2 |
| `wrong-reading` | a kana shape or reading stated wrongly |
| `learner-stuck` | three misses in a row with no change in the Sensei's approach |

Click a tagged conversation to show the turn that triggered it. The `wrong-reading` tag is what pointed at the v1 problem fixed in v2.

## 5. Evals: the same replies scored offline (2 min)

```sh
cd evals
uv run nihongo-evals feedback --dataset ../out/sim/demo-<seed>/agent-outputs.jsonl
uv run nihongo-evals grading
uv run nihongo-evals composer
```

Each writes a `wandb.EvalTable` to `https://forge.coreweave.com/wandb/wandb/nihongo-partner`. Open the run and show the table: input, reply, deterministic checks, judge verdict, judge note. `grading` compares three graders (rules only, model, model plus phonetic facts) on the frozen 143-case set; `composer` checks the exercise sets against the teaching rules in `docs/teaching-rationale.md`.

The committed datasets under `evals/datasets/` are synthetic and are also published as Weave datasets, so the tables are reproducible.

## What not to show

Skip the raw span table and the OTLP settings. The whole point is that a learner pressed one button and three Forge surfaces (traces, tags, evals) agree about whether the Sensei did its job.

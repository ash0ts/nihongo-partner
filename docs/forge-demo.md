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
pnpm demo            # 12 learners sampled by persona weight, about 150 turns
pnpm demo --one      # one rushed learner through two units, about 30 turns
```

The population is skewed like a real class: a few near-perfect learners who barely call the Sensei, a steady middle, and edge cases (a learner who types わかりません after two misses, one who types romaji in a kana-only mode, one who pastes noise, one who asks for te-form). The script prints the busiest conversation ids, the Agent Lens link, the agent versions, and the current tag counts. The project already holds four larger cohorts (`pop-a` 1731 turns, `pop-b` 695, `pop-c` 508, `pop-d` 601, one agent version each) described in `agentlens/tags.md`; filter on `nihongo.cohort` to see one at a time.

## 3. Read one conversation in Agent Lens (3 min)

Open the printed link (`https://forge.coreweave.com/agent-lens/wandb/nihongo-sensei`) and paste one of the conversation ids into search, or open it directly at `.../conversations/<conversationId>` (the id is the session id, e.g. `sim-pop-d-2026-11-18-l05-steady-median-L01-counters`). Points to make:

- A conversation is one learner session. The Thread tab reads like a chat: the learner's question ("I answered じゅういちじろっふん for 11:06 and it was marked wrong. Why?"), the tool calls Sensei made first (`get_learner_state`, `lookup_item`, `grade_answer`, `lookup_rule`, `compose_exercise_set`), then the reply the learner saw. Expand "4 tool calls" to show the arguments.
- Every span carries `nihongo.*` attributes (task, trap id, mode, unit, whether the reply came from the model or the deterministic fallback). Filter on `nihongo.task = explain_miss` and `nihongo.source = deterministic` to show how often the guardrails took over.
- Agent versions: every prompt change is a new version. `sensei-v3` leaked kanji into 1.1% of replies; `sensei-v4` added a kana-only rule and a guard that falls back to the rule-based text, and the `kanji-leak` tag went to zero on the next cohort. Compare the two in the versions view. (The earlier `wandb/nihongo-partner` project holds the `v1` to `v2` story: shapes described from memory, then grounded in each item's mnemonic.)
- Learners, not just sessions: `nihongo.learner_id` groups one person's units, so a learner who failed kana-contrasts and then L01-counters reads as one story. `nihongo.gave_up = true` finds the turns where someone typed わかりません.

## 4. Tags: the judge reading every conversation (2 min)

Open the tag view the script prints (or `agentlens/tags.md`). Six tags, each with plain-English criteria the LLM judge applies to new conversations within a few minutes:

| tag | what it catches |
| --- | --- |
| `trap-not-named` | the reply never names the confusion the trap catalog knows about |
| `romaji-leak` | romaji in a mode that should be kana-only |
| `scope-creep` | grammar beyond Lessons 0-2 |
| `wrong-reading` | a kana shape or reading stated wrongly |
| `learner-stuck` | repeated misses, a failed retry, or a learner who has stopped trying |
| `kanji-leak` | kanji in the Sensei's own text, unreadable before Lesson 3 |

Click a tag name on the Tags page to get the per-turn table with a Rationale column ("The learner wrote 'いま きゅうじはんです。' with the incorrect reading きゅうじ; the assistant marked it as correct"). That list is what produced the `sensei-v6` grading guard. `kanji-leak` is the tag with the cleanest story: found by the offline eval on the first cohort, promoted to a tag, fixed in the next version, and now a regression alarm.

## 5. Evals: the same replies scored offline (2 min)

```sh
cd evals
uv run nihongo-evals feedback --dataset ../out/sim/demo-<seed>/agent-outputs.jsonl --limit 200
uv run nihongo-evals grading
uv run nihongo-evals composer
```

Each writes a `wandb.EvalTable` to `https://forge.coreweave.com/wandb/wandb/nihongo-sensei`. Open the run and show the table: input, reply, deterministic checks, judge verdict, judge note. `grading` compares three graders (rules only, model, model plus phonetic facts) on the frozen 143-case set; `composer` checks the exercise sets against the teaching rules in `docs/teaching-rationale.md`.

The committed datasets under `evals/datasets/` are synthetic and are also published as Weave datasets, so the tables are reproducible.

## What not to show

Skip the raw span table and the OTLP settings. The whole point is that a learner pressed one button and three Forge surfaces (traces, tags, evals) agree about whether the Sensei did its job.

## The recorded walkthrough

`out/walkthrough/nihongo-sensei-walkthrough.mp4` is the app chapters, six annotated Agent Lens frames, and an outro, about 100 seconds. To rebuild it:

1. `uv run --with playwright python ~/.codex/skills/record-walkthrough/scripts/record.py --spec demo/walkthrough.json --out out/walkthrough` records the app chapters against a seeded dev server and ends on the "Behind it" title card.
2. The Agent Lens frames in `out/forge-frames/0*.png` were captured in a signed-in browser at a 1280x800 viewport with the same red callout style (chapter pill bottom-left, caption bottom-right, one ring per frame): Overview, Conversations, one conversation with its tool calls expanded, the `wrong-reading` filter, that tag's rationale table, Insights. Recapture them when the project changes.
3. `uv run --with playwright python ~/.codex/skills/record-walkthrough/scripts/record.py --spec demo/outro.json --out out/walkthrough-outro` records the outro card.
4. `demo/assemble-forge.sh` turns each frame into a 7.5-second clip with a slow push-in and joins the three parts.


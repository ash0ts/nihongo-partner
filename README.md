# Nihongo Partner

A local-first Japanese study workbench built initially to cram **Genki I Lessons 0–2** in six hours before walking into a **Lesson 3–4** course, and structured as an extensible curriculum engine across an 8-week class and beyond.

All mnemonics, grammar explanations, cloze sentences, and roleplay dialogues in this repository are original MIT-licensed material aligned to the Genki I (3rd Edition) syllabus topics.

## Quick start

Requires Node 22+ and `pnpm`.

```bash
git clone https://github.com/ash0ts/nihongo-partner.git
cd nihongo-partner
./try-it.sh
```

Open **http://localhost:5178**. `./try-it.sh` installs dependencies on first run, validates all curriculum packs (`pnpm validate`), and starts the Vite workbench.

## Use it on your phone

The app is a static site, so it runs anywhere a browser does. Three ways in, from easiest to most hands-on:

1. **Hosted (any network):** open **https://ash0ts.github.io/nihongo-partner/** on your phone. Every push to `main` rebuilds and redeploys it through GitHub Pages (`.github/workflows/pages.yml`). Your phone never needs to reach your laptop.
2. **Add to Home Screen:** the site ships as a PWA. In Safari tap Share, then *Add to Home Screen*; in Chrome on Android use the menu, then *Install app*. It opens full screen with its own icon and keeps working offline after the first load.
3. **Same Wi-Fi as your laptop:** run `pnpm dev:phone` and open the phone URL it prints (it includes a `?sensei=` token). This is the only mode where the live Sensei tutor works, because the agent runs inside the dev server. Corporate or guest Wi-Fi often blocks phone-to-laptop traffic; if the page never loads, use option 1.

Progress lives in each browser's `localStorage`, so the phone and the laptop keep separate records. To move progress between them, tap *Export JSON* on one device and *Import* the file on the other (AirDrop, iCloud Drive, or email all work). On a phone the header folds the mode and audio settings behind a single button at the top right.

## How to study: the Study Path

The app opens on the **Study Path**, a linear sequence of 34 units generated from the lesson packs. Every unit runs the same loop:

1. **Teach**: one rule card (formula, mental model, traps, examples with audio) or a set of kana/vocab cards.
2. **Micro-drill**: 6 to 10 prompts with immediate feedback and the explanation shown on every answer.
3. **Checkpoint**: a fixed-length quiz with no hints, typed answers where possible. The pass bar is 80%.
4. **Cumulative review**: after a pass, six items from earlier units come back, due and shaky ones first.

Gates are soft. Passing unlocks the next unit. Falling short gives you three choices: retry only what you missed and retake, retake from scratch, or skip ahead. Skipped units stay flagged **Not yet mastered** in the readiness panel until you go back and pass them. You can also jump to any locked unit; everything before it that you have not passed gets the same flag.

There is no timer. Each unit shows a pace estimate (about 4.5 hours for the required path at base pace) and the header recomputes time remaining from how long your passed units actually took. The path covers kana, Lesson 0, Lesson 1, Lesson 2, a 25-item cumulative mock, and an optional ungated Lesson 3 preview at the end.

The other tabs (Kana Lab, Grammar, Numbers, Vocab, Sensei Roleplay, and the original hour-by-hour plan) stay available as free-practice reference. Everything records into the same mastery store, so drilling in a reference tab also feeds the path's review queue.

## Why Lesson 3 needs a specific cram strategy

Genki I prints romanized readings (`romaji`) under Japanese text in Lessons 1 and 2, then **removes all romaji starting on page 1 of Lesson 3**, switching to kanji with hiragana furigana and katakana loanwords.

Trying to handwrite 92 kana characters from memory during a single-day cram eats four hours for almost zero classroom payoff. Nihongo Partner focuses on what Lesson 3 immediately demands:

1. **100% Kana reading recognition first** (`Kana Lab`): 5x10 Gojuon coordinate soundboard, four voicing rules (`k->g`, `s->z`, `t->d`, `h->b/p`), palatalized glides (`kya/sha/cha`), double-consonant stops (`っ/ッ`), long vowels, 10 lookalike contrast drills (`シ/ツ`, `ソ/ン`, `は/ほ`, `さ/き`, `ね/れ/わ`), and real Lesson 1–2 katakana loanwords.
2. **Postpositional syntax & particle slots** (`Grammar & こそあど`): `[Topic は/も] + [Modifier の Head] + [です / じゃないです] + [か / ね / よ]`, interactive 4x3 `こそあど` spatial pointer table, and Bunpro-style active-recall cloze drills.
3. **Algorithmic counter & phonetic-shift solver** (`Numbers, Time & Yen`): live solver + trap-weighted quiz covering `10^4 まん` yen grouping, irregular hours (`よじ`, `しちじ`, `くじ`), `-ぷん` vs `-ふん` minute triggers, `よねんせい` (4th-year student), and `はたち` (20 years old).
4. **Classroom survival & active flashcards** (`Vocab & Classroom p.81`): prioritizes spoken recovery phrases (`ゆっくり いってください`, `もういちど いってください`, `わかりません`) alongside Lesson 0–2 vocabulary and Lesson 3–4 bridge previews.
5. **Three live orthography modes** (header toggle): graduate from `Romaji Bridge (Hrs 1–4)` to `L3 Class Mode (Furigana, No Romaji)` in Hour 5 so tonight's textbook format already feels familiar.
6. **Sensei roleplay & sentence check** (`Sensei Roleplay`): deterministic offline multi-turn classroom/shop simulations plus the optional Sensei agent (`server/`, see below) backed by CoreWeave Forge Serverless Inference or any OpenAI-compatible API.

## Standalone Markdown study guide

Prefer reading a single printable reference sheet alongside or away from the app? Open [`docs/6-hour-cram-playbook.md`](docs/6-hour-cram-playbook.md).

## The Sensei agent

Deterministic drills, `ja-JP` browser speech playback, and FSRS-lite `localStorage` mastery tracking run 100% offline. On top of that sits an optional tutor agent, **Sensei**, which runs server side in `server/` and is reached through `/api/tutor`. It shows up in four places:

- **Why was that wrong?** on any missed drill item. Sensei looks up the item, grades the answer, finds the matching trap in the catalog, and writes a two-sentence explanation. Without a model it still answers from the trap rule.
- **What to fix** after a failed checkpoint: the one or two confusions behind the misses and what to practise next.
- **Sensei set** on the Path tab: ten items composed from your own answer log (see below).
- **Sensei Roleplay** tab: free-form sentence grading and roleplay turns.

Every answer you give is logged as an `InteractionEvent` (`src/engine/events.ts`: item, your input, the expected answer, right or wrong, time taken, and the trap id if the item is a known trap). The log lives in the same `localStorage` snapshot as your progress, capped at 3000 events, and is what Sensei reads instead of guessing. Nothing is sent anywhere unless the server is running.

### Turning the model on

Sensei works with no credentials at all (it says `rule` instead of `written for you`). To let it write:

- **CoreWeave Forge Inference:** run `wandb login` (writes `~/.netrc`) or export `WANDB_API_KEY`. The default model is `zai-org/GLM-5.3-Flash` with `reasoning_effort: low` (the endpoint ignores `enable_thinking: false`); override with `FORGE_MODEL`, and set `FORGE_PROJECT` to change the Forge project (default `wandb/nihongo-sensei`).
- **OpenAI-compatible endpoint:** export `OPENAI_API_KEY` (plus optional `OPENAI_BASE_URL` and `OPENAI_MODEL`).

Credentials are read strictly inside Node (`server/credentials.ts`) and never enter client bundles, `localStorage`, or Git. `pnpm dev` mounts the agent into Vite; `pnpm sensei` runs it standalone on port 5179. Callers from any address other than localhost must present the token the server prints at startup (`?sensei=<token>` on the page URL stores it for the session), so `pnpm dev:phone` does not turn your key into an open relay.

### Agent Lens tracing

Every Sensei turn is traced to Forge Agent Lens in `wandb/nihongo-sensei` with the `@coreweave/forge-sdk`: one conversation per learner session, one turn per request, each tool call (`get_learner_state`, `lookup_item`, `grade_answer`, `lookup_rule`, `compose_exercise_set`) as its own span, and the model call with token usage. Each turn carries `nihongo.*` attributes (`task`, `mode`, `unit_id`, `persona`, `trap_id`, `source`, `prompt_variant`) so you can slice by trap or by orthography mode. Set `FORGE_TRACING=0` to turn it off.

Five Agent Lens tags watch the conversations for the failure modes that matter for a tutor: `trap-not-named`, `romaji-leak`, `scope-creep`, `wrong-reading`, `learner-stuck`. Their definitions live in [`agentlens/tags.json`](agentlens/tags.json) and are explained in [`agentlens/tags.md`](agentlens/tags.md); `pnpm tags` syncs them to the project and `pnpm tags --dist` prints last week's counts.

### Sensei set: exercises composed from your misses

`compose_exercise_set` (`src/engine/composer.ts`) turns the answer log into a ten-item set: half aimed at the traps you miss most, confusable pairs side by side, nothing three times in a row, typed instead of multiple choice once you have got an item right twice, pitched so you should get roughly 8 of 10 right, and skipping items you just answered correctly. The item choice is deterministic and runs in the browser on the static site; with the server up, the same set comes back traced with a model-written rationale that may only cite the rules the composer applied and the numbers it reported. [`docs/teaching-rationale.md`](docs/teaching-rationale.md) gives the research behind each rule.

## Simulations and evals

To see how Sensei behaves across many learners without waiting for real ones, `sim/` runs rule-based personas through real units: drill, checkpoint, retry, with every miss sent to Sensei. Twelve personas cover the range from ideal to edge case: `perfectionist` and `slow-accurate` rarely need help; `steady-median` is the typical crammer; `rushed-guesser`, `night-crammer`, `romaji-dependent`, `kana-confuser` and `counter-trap-prone` each fall for a different family of traps; `give-up-quitter` types わかりません after two misses, `romaji-only` types romaji in a kana-only mode, `sloppy-typist` submits blanks and paste noise, and `off-topic-asker` uses the sentence checker as a chatbot. Each persona has a population weight, so `--population N` samples a realistic class and walks each learner through a 2-5 unit journey with progress carried forward.

```bash
pnpm sim --no-llm                 # deterministic, offline, seconds; same events, no model calls
pnpm sim --seed 7                 # the persona x unit grid against the live agent (needs a W&B key)
pnpm sim --population 120 --seed 21 --cohort pop-a   # a weighted population; nihongo.cohort filters it in Agent Lens
pnpm sim:freeze out/sim/run-7 evals/datasets sim-v1   # freeze a run into committed datasets
```

The frozen run (`evals/datasets/sim-v1*.jsonl`: 1140 events, 272 agent replies, all synthetic) feeds the Python evals in `evals/` (managed with `uv`):

```bash
cd evals
uv run nihongo-evals build-dataset        # publish events, replies, and grading cases as Weave Datasets
uv run nihongo-evals grading              # deterministic grade() vs LLM (bare) vs LLM (with phonetic facts), as a wandb.EvalTable
uv run nihongo-evals feedback             # explain_miss / what_to_fix replies: names the trap, no romaji leak, length, English, plus an LLM judge for wrong readings and scope
uv run nihongo-evals composer             # the composed sets against the teaching rules, plus a judge on the rationale
```

Every command takes `--dry-run`, which runs the deterministic checks with no network, and that is what CI runs. `pnpm export:eval-cases` and `pnpm export:composer-cases` regenerate the case files from the current curriculum and frozen events. The judge is a different model family from the agent (`Qwen/Qwen3.8-27B` by default, `FORGE_JUDGE_MODEL` to change it). `feedback --dataset` also takes a path, so any sim run can be scored.

### Showing it off

`pnpm demo` runs one learner against the live agent and prints the Agent Lens link, the conversation ids, the agent versions, and the current tag counts. [`docs/forge-demo.md`](docs/forge-demo.md) is the ten-minute walkthrough built around it: miss an item in the app, read the conversation and its tool spans, look at what the tags caught, then open the EvalTable that scored the same replies.

## Extending across your 8-week course (and working with coding agents)

```text
src/content/schema.ts              Zod contracts (LessonPack, GrammarPoint, VocabEntry, ClozeExercise)
src/content/kana.ts                46 Gojuon kana, voicing rules, orthography mechanics, 10 contrast sets
src/content/lessons/lesson-00..02  Complete Lesson 0, Lesson 1, and Lesson 2 packs
src/content/lessons/lesson-03..04  Tonight's Lesson 3 & Lesson 4 bridge packs (ready to expand each week)
src/content/study-path.ts          STUDY_PATH: the guided path derived from LESSONS + kana data
src/engine/drills.ts               DrillItem: one quiz shape for kana, vocab, cloze, counter, roleplay items
src/engine/path.ts                 buildStudyPath, soft gating, checkpoint/review selection, readiness summary
src/engine/                        Number/time/age/yen oracle, romaji-kana normalizer, FSRS-lite store
src/engine/events.ts, traps.ts     InteractionEvent log (the contract between app, agent, sims, and evals) and the trap catalog
src/engine/composer.ts             compose_exercise_set: deterministic set builder shared by browser and server
src/ui/PathTab.tsx, UnitPlayer.tsx, Checkpoint.tsx, DrillCard.tsx, SenseiSet.tsx   The guided flow UI
server/                            Sensei agent (tools, prompts, Agent Lens tracing, token-guarded HTTP handler)
sim/                               Persona simulator that drives the agent through real units
evals/                             uv package: Weave datasets, EvalTables, LLM judge; committed datasets in evals/datasets/
agentlens/                         Agent Lens tag definitions and notes
docs/                              6-hour cram playbook, curriculum architecture guide, teaching rationale for the composer
.cursor/skills/ & .agents/skills/  In-repo agent skills (add-lesson-pack, cram-coach-session, curriculum-audit)
```

- Read [`docs/curriculum-architecture.md`](docs/curriculum-architecture.md) to add or expand lessons (`L03`, `L04`, ..., `L12`). A new `status: "complete"` pack automatically gets grammar, vocab, roleplay, and checkpoint units on the Study Path; add a `COUNTER_KINDS_BY_LESSON` entry in `src/engine/path.ts` if it introduces a counter family.
- Export `progress.json` from the top bar and invoke the `cram-coach-session` skill in Cursor, Claude Code, or Codex to have your coding agent quiz your exact shaky items before class.

## Verification commands

```bash
pnpm check     # runs tsc -b, curriculum schema/furigana validator, Vitest suite, and secret/path scrub
pnpm build     # builds static production bundle into dist/
pnpm sim --no-llm                               # deterministic simulator pass
cd evals && uv run nihongo-evals grading --dry-run && uv run nihongo-evals feedback --dry-run && uv run nihongo-evals composer --dry-run
```

## License

MIT (`LICENSE`).

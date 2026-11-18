# Agent Lens tags for Sensei

Sensei's conversations land in the Forge project `wandb/nihongo-sensei` under the agent name `nihongo-sensei`. Agent Lens runs an LLM judge over each conversation and applies the tags below when the criteria match. The definitions live in `tags.json`; `pnpm tags` creates or updates them through the Agent Lens API, `pnpm tags --check` fails if the live catalog drifted from the file, and `pnpm tags --dist` prints the last week's tag counts per day.

Every turn Sensei records carries `nihongo.*` custom attributes (`task`, `mode`, `unit_id`, `persona`, `learner_id`, `cohort`, `trap_id`, `item_id`, `source`, `prompt_variant`, `agent_version`, `gave_up`, `in_scope`). The judge reads them alongside the messages, and the same keys filter spans in the Agent Lens span table, so a tag plus an attribute filter narrows to a specific failure (for example `romaji-leak` with `nihongo.mode = immersion`).

| Tag | What it catches | Where to look first |
| --- | --- | --- |
| `trap-not-named` | The miss had a `nihongo.trap_id` but the reply never named the confusion or the rule. | `nihongo.task = explain_miss`, `nihongo.names_trap = false` |
| `romaji-leak` | Latin-letter Japanese in a `classroom` or `immersion` conversation. `bridge` mode is exempt. | `nihongo.mode != bridge` |
| `scope-creep` | Grammar or vocabulary past Genki I Lesson 2 (particles beyond は, verb forms, adjectives, kanji). | `nihongo.task = grade_sentence` or `roleplay` |
| `wrong-reading` | Sensei states a wrong reading (よんじ, にじゅうさい, さんひゃく) or grades a correct answer wrong. | `nihongo.task = grade_sentence`, compare `nihongo.graded_correct` |
| `learner-stuck` | The same trap or item recurs across turns, a checkpoint retry failed again, or the learner has stopped trying (わかりません, ?, blanks). | `nihongo.gave_up = true`, `nihongo.task = what_to_fix` |
| `kanji-leak` | Kanji in Sensei's own text. Lessons 0-2 learners read kana and digits only. | `nihongo.agent_version = sensei-v3` (the version that leaked) |

## Views

- Conversations filtered to the six tags: <https://forge.coreweave.com/agent-lens/wandb/nihongo-sensei/conversations?tags=trap-not-named,romaji-leak,scope-creep,wrong-reading,learner-stuck,kanji-leak>
- Agent overview: <https://forge.coreweave.com/agent-lens/wandb/nihongo-sensei>
- Tag ids in `wandb/nihongo-sensei` (created 2026-11-18): `trap-not-named` `01a1f005-cfbc-719e-8c89-039eaca5bdee`, `romaji-leak` `01a1f005-d040-7010-b32d-9a4f8b8a27ae`, `scope-creep` `01a1f005-d0b8-76ed-8387-f36324a15f77`, `wrong-reading` `01a1f005-d134-70d4-9577-4d6d3518adf1`, `learner-stuck` `01a1f005-d1b8-72d2-90af-212caa92a50c`, `kanji-leak` `01a1f00e-bd95-7878-a5d4-0c3bb6f93ccc`. (The earlier development project `wandb/nihongo-partner` keeps the `sensei-v1`/`v2` history and its own copies of the first five tags.)

## What the population batches showed

`wandb/nihongo-sensei` was started clean on 2026-11-18 and filled with four population runs (`pnpm sim --population`): cohort `pop-a` (120 learners sampled by persona weight, 419 unit sessions, 1731 Sensei turns, agent `sensei-v3`), `pop-b` (50 learners, 695 turns, `sensei-v4`), `pop-c` (40 learners, 508 turns, `sensei-v5`) and `pop-d` (40 learners, 149 sessions, 601 turns, `sensei-v6`). Filter on `nihongo.cohort` to see one on its own.

- The distribution is deliberately skewed the way a real class is: `perfectionist` learners averaged 1.8 Sensei calls per session and `slow-accurate` 2.1, while `rushed-guesser` averaged 7.3 and `give-up-quitter` 7.2. About a third of all sessions produced no call at all.
- The offline feedback judge on a 400-reply sample of `pop-a` found 19 replies with kanji (1.1%), which a Lesson 0-2 learner cannot read. That became the `kanji-leak` tag, a `kanjiFree` guard that falls back to the rule-based explanation, and a kana-only line in the mode rules; `pop-b` under `sensei-v4` had zero. Compare the two versions in the agent view.
- `learner-stuck` is the most-assigned tag on the new project, driven by `give-up-quitter` and `rushed-guesser` sessions. Those are the conversations the composer's `target-errors` rule exists for.
- `wrong-reading` on `pop-b` and `pop-c` was mostly one failure: a learner typed `いま きゅうじはんです。` or `いま よんじです。`, the model wrote the right reading into `japanese` and still set `correct: true` (7 of 8 きゅうじ sentences passed in `pop-b`). The tag rationale column says it in one line each. `sensei-v6` scans kana sentences for the catalogue's known wrong spellings (`wrongForms` in `src/engine/traps.ts`), looks the rule up as a tool call before grading, and overrules `correct` when the model's own corrected sentence differs from the learner's; all 28 such sentences in `pop-d` came back incorrect.
- The thread view renders the LLM span's messages, not the turn's `userMessage`. Until `sensei-v6` the user side read "Here are the facts, as data…" and the agent side was raw JSON. Facts now ride in the system prompt, the learner's own question is the user message, and explain/what-to-fix replies are plain text, so a conversation reads as a chat.
- `GLM-5.3-Flash` on Forge Inference ignores `enable_thinking: false` and spent 300-900 reasoning tokens per turn, sometimes the whole budget (an empty reply, so the deterministic fallback fired on 8 of 12 what-to-fix turns in a probe). `reasoning_effort: "low"` is the knob it honours (about 5 reasoning tokens); `pop-d` ran at 0.9 s per turn with 6 fallbacks in 338 explain turns.
- On the first development project the `wrong-reading` tag was what exposed `sensei-v1` describing kana shapes from memory; `sensei-v2` grounded every explanation in the item's own mnemonic.

## How the tags relate to the evals

Tags are the production-side signal: they fire on whatever conversations arrive, including real learners. The `evals/` package is the offline side: it replays frozen simulator cases through the same agent and scores them with deterministic checks and an LLM judge that uses the same questions (does the reply name the trap, is it romaji-free in the right modes, is it in scope, is the reading right, is the learner progressing). When a tag rate moves in Agent Lens, the matching eval is the place to reproduce it.

- Offline score for `pop-d` (`sensei-v6`, 200-reply sample, EvalTable run `gsvokqvb`): `kanji_free` 1.0, `names_trap` 1.0 by rule and 0.92 by judge, `reading_ok` 0.985, `in_scope` 0.965, `under_40_words` 0.905. The under-40-words misses are the long what-to-fix summaries; everything else that failed in earlier cohorts is at or near zero.

## Changing a tag

Edit `tags.json`, run `pnpm tags`, and commit both. Keep names kebab-case (the API enforces `^[a-z0-9]+(?:-[a-z0-9]+)*$`) and criteria under 1600 characters. Tags not listed in the file are left untouched so people can experiment in the UI without the sync deleting their work.

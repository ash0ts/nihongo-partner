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

`wandb/nihongo-sensei` was started clean on 2026-11-18 and filled with two population runs (`pnpm sim --population`): cohort `pop-a` (120 learners sampled by persona weight, 419 unit sessions, 1731 Sensei turns, agent `sensei-v3`) and `pop-b` (50 learners, 695 turns, `sensei-v4`). Filter on `nihongo.cohort` to see either on its own.

- The distribution is deliberately skewed the way a real class is: `perfectionist` learners averaged 1.8 Sensei calls per session and `slow-accurate` 2.1, while `rushed-guesser` averaged 7.3 and `give-up-quitter` 7.2. About a third of all sessions produced no call at all.
- The offline feedback judge on a 400-reply sample of `pop-a` found 19 replies with kanji (1.1%), which a Lesson 0-2 learner cannot read. That became the `kanji-leak` tag, a `kanjiFree` guard that falls back to the rule-based explanation, and a kana-only line in the mode rules; `pop-b` under `sensei-v4` had zero. Compare the two versions in the agent view.
- `learner-stuck` is the most-assigned tag on the new project, driven by `give-up-quitter` and `rushed-guesser` sessions. Those are the conversations the composer's `target-errors` rule exists for.
- On the first development project the `wrong-reading` tag was what exposed `sensei-v1` describing kana shapes from memory; `sensei-v2` grounded every explanation in the item's own mnemonic.

## How the tags relate to the evals

Tags are the production-side signal: they fire on whatever conversations arrive, including real learners. The `evals/` package is the offline side: it replays frozen simulator cases through the same agent and scores them with deterministic checks and an LLM judge that uses the same questions (does the reply name the trap, is it romaji-free in the right modes, is it in scope, is the reading right, is the learner progressing). When a tag rate moves in Agent Lens, the matching eval is the place to reproduce it.

## Changing a tag

Edit `tags.json`, run `pnpm tags`, and commit both. Keep names kebab-case (the API enforces `^[a-z0-9]+(?:-[a-z0-9]+)*$`) and criteria under 1600 characters. Tags not listed in the file are left untouched so people can experiment in the UI without the sync deleting their work.

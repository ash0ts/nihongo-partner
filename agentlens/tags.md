# Agent Lens tags for Sensei

Sensei's conversations land in the Forge project `wandb/nihongo-partner` under the agent name `nihongo-sensei`. Agent Lens runs an LLM judge over each conversation and applies the tags below when the criteria match. The definitions live in `tags.json`; `pnpm tags` creates or updates them through the Agent Lens API, `pnpm tags --check` fails if the live catalog drifted from the file, and `pnpm tags --dist` prints the last week's tag counts per day.

Every turn Sensei records carries `nihongo.*` custom attributes (`task`, `mode`, `unit_id`, `persona`, `trap_id`, `item_id`, `source`, `prompt_variant`, `agent_version`). The judge reads them alongside the messages, and the same keys filter spans in the Agent Lens span table, so a tag plus an attribute filter narrows to a specific failure (for example `romaji-leak` with `nihongo.mode = immersion`).

| Tag | What it catches | Where to look first |
| --- | --- | --- |
| `trap-not-named` | The miss had a `nihongo.trap_id` but the reply never named the confusion or the rule. | `nihongo.task = explain_miss`, `nihongo.names_trap = false` |
| `romaji-leak` | Latin-letter Japanese in a `classroom` or `immersion` conversation. `bridge` mode is exempt. | `nihongo.mode != bridge` |
| `scope-creep` | Grammar or vocabulary past Genki I Lesson 2 (particles beyond は, verb forms, adjectives, kanji). | `nihongo.task = grade_sentence` or `roleplay` |
| `wrong-reading` | Sensei states a wrong reading (よんじ, にじゅうさい, さんひゃく) or grades a correct answer wrong. | `nihongo.task = grade_sentence`, compare `nihongo.graded_correct` |
| `learner-stuck` | The same trap or item recurs across turns, or a checkpoint retry failed again. | `nihongo.persona = rushed-guesser`, `nihongo.task = what_to_fix` |

## Views

- Conversations filtered to the five tags: <https://forge.coreweave.com/agent-lens/wandb/nihongo-partner/conversations?tags=trap-not-named,romaji-leak,scope-creep,wrong-reading,learner-stuck>
- Agent overview: <https://forge.coreweave.com/agent-lens/wandb/nihongo-partner>
- Tag ids (created 2026-11-18): `trap-not-named` `01a1efc0-3214-74b8-8af3-34e51d73895a`, `romaji-leak` `01a1efc0-32a1-7182-98e8-c6cf694e9c21`, `scope-creep` `01a1efc0-332d-7d35-8361-212817441e22`, `wrong-reading` `01a1efc0-33b1-7493-998a-10700b40cf86`, `learner-stuck` `01a1efc0-342c-7a0a-b03b-da1fd49f30c7`.

## First readings

After the first traced simulator runs on 2026-11-18 (about 320 conversations across six personas), the judge had assigned: `romaji-leak` 41, `wrong-reading` 20, `trap-not-named` 14, `learner-stuck` 11, `scope-creep` 8 (`pnpm tags --dist`). The `romaji-leak` count included kana-reading drills, where the reply has to state the romaji reading; the criteria now exempt those, so expect that number to drop on the next run. `wrong-reading` is the one to read first: the offline feedback judge found the same class of error (wrong stroke descriptions for ソ and ま, a confused dakuten explanation), which is a prompt problem, not a tagging problem.

## How the tags relate to the evals

Tags are the production-side signal: they fire on whatever conversations arrive, including real learners. The `evals/` package is the offline side: it replays frozen simulator cases through the same agent and scores them with deterministic checks and an LLM judge that uses the same five questions (does the reply name the trap, is it romaji-free in the right modes, is it in scope, is the reading right, is the learner progressing). When a tag rate moves in Agent Lens, the matching eval is the place to reproduce it.

## Changing a tag

Edit `tags.json`, run `pnpm tags`, and commit both. Keep names kebab-case (the API enforces `^[a-z0-9]+(?:-[a-z0-9]+)*$`) and criteria under 1600 characters. Tags not listed in the file are left untouched so people can experiment in the UI without the sync deleting their work.

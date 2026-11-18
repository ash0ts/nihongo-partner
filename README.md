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

## Why Lesson 3 needs a specific cram strategy

Genki I prints romanized readings (`romaji`) under Japanese text in Lessons 1 and 2, then **removes all romaji starting on page 1 of Lesson 3**, switching to kanji with hiragana furigana and katakana loanwords.

Trying to handwrite 92 kana characters from memory during a single-day cram eats four hours for almost zero classroom payoff. Nihongo Partner focuses on what Lesson 3 immediately demands:

1. **100% Kana reading recognition first** (`Kana Lab`): 5x10 Gojuon coordinate soundboard, four voicing rules (`k->g`, `s->z`, `t->d`, `h->b/p`), palatalized glides (`kya/sha/cha`), double-consonant stops (`っ/ッ`), long vowels, 10 lookalike contrast drills (`シ/ツ`, `ソ/ン`, `は/ほ`, `さ/き`, `ね/れ/わ`), and real Lesson 1–2 katakana loanwords.
2. **Postpositional syntax & particle slots** (`Grammar & こそあど`): `[Topic は/も] + [Modifier の Head] + [です / じゃないです] + [か / ね / よ]`, interactive 4x3 `こそあど` spatial pointer table, and Bunpro-style active-recall cloze drills.
3. **Algorithmic counter & phonetic-shift solver** (`Numbers, Time & Yen`): live solver + trap-weighted quiz covering `10^4 まん` yen grouping, irregular hours (`よじ`, `しちじ`, `くじ`), `-ぷん` vs `-ふん` minute triggers, `よねんせい` (4th-year student), and `はたち` (20 years old).
4. **Classroom survival & active flashcards** (`Vocab & Classroom p.81`): prioritizes spoken recovery phrases (`ゆっくり いってください`, `もういちど いってください`, `わかりません`) alongside Lesson 0–2 vocabulary and Lesson 3–4 bridge previews.
5. **Three live orthography modes** (header toggle): graduate from `Romaji Bridge (Hrs 1–4)` to `L3 Class Mode (Furigana, No Romaji)` in Hour 5 so tonight's textbook format already feels familiar.
6. **Sensei roleplay & sentence check** (`Sensei Roleplay`): deterministic offline multi-turn classroom/shop simulations plus an optional server-side dev proxy (`/api/tutor`) backed by CoreWeave Forge Serverless Inference (`WANDB_API_KEY` or `~/.netrc`) or any OpenAI-compatible API.

## Standalone Markdown study guide

Prefer reading a single printable reference sheet alongside or away from the app? Open [`docs/6-hour-cram-playbook.md`](docs/6-hour-cram-playbook.md).

## Optional live Sensei setup

Deterministic drills, `ja-JP` browser speech playback, and FSRS-lite `localStorage` mastery tracking run 100% offline. To enable live free-form roleplay and custom sentence grading during `pnpm dev`:

- **CoreWeave Forge Inference:** run `wandb login` (writes `~/.netrc`) or export `WANDB_API_KEY` (optional `FORGE_INFERENCE_PROJECT` and `FORGE_INFERENCE_MODEL`, defaulting to `zai-org/GLM-5.3-Flash` with reasoning disabled for fast turns).
- **OpenAI-compatible endpoint:** export `OPENAI_API_KEY` (plus optional `OPENAI_BASE_URL` and `OPENAI_MODEL`).

Credentials are read strictly inside Vite's Node dev middleware (`vite.config.ts`) and never enter client bundles, `localStorage`, or Git.

## Extending across your 8-week course (and working with coding agents)

```text
src/content/schema.ts              Zod contracts (LessonPack, GrammarPoint, VocabEntry, ClozeExercise)
src/content/kana.ts                46 Gojuon kana, voicing rules, orthography mechanics, 10 contrast sets
src/content/lessons/lesson-00..02  Complete Lesson 0, Lesson 1, and Lesson 2 packs
src/content/lessons/lesson-03..04  Tonight's Lesson 3 & Lesson 4 bridge packs (ready to expand each week)
src/engine/                        Number/time/age/yen oracle, romaji-kana normalizer, FSRS-lite store
docs/                              6-hour cram playbook + curriculum architecture guide
.cursor/skills/ & .agents/skills/  In-repo agent skills (add-lesson-pack, cram-coach-session, curriculum-audit)
```

- Read [`docs/curriculum-architecture.md`](docs/curriculum-architecture.md) to add or expand lessons (`L03`, `L04`, ..., `L12`).
- Export `progress.json` from the top bar and invoke the `cram-coach-session` skill in Cursor, Claude Code, or Codex to have your coding agent quiz your exact shaky items before class.

## Verification commands

```bash
pnpm check     # runs tsc -b, curriculum schema/furigana validator, Vitest suite, and secret/path scrub
pnpm build     # builds static production bundle into dist/
```

## License

MIT (`LICENSE`).

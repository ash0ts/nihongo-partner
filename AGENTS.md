# Nihongo Partner — Agent Contract

## Read first

1. `docs/curriculum-architecture.md` defines the typed curriculum schemas, furigana invariants, and how lessons plug into the workbench.
2. `docs/6-hour-cram-playbook.md` is the standalone Markdown study reference kept in sync with the interactive curriculum.
3. Read the matching repository skill in `.cursor/skills/` (mirrored in `.agents/skills/`) before adding lessons, coaching the learner, or preparing a push:
   - `add-lesson-pack` — author or expand a lesson pack (`L03`–`L23`) and conjugator/counter engines
   - `cram-coach-session` — act as a Socratic Japanese drill partner in chat using `src/content/` and optional exported `progress.json`
   - `curriculum-audit` — run linguistic, schema, furigana, originality, and secret/path-scrub verification

## Commands from repository root

- Launch local workbench (installs if needed, validates content, serves on port 5178): `./try-it.sh`
- Dev server only: `pnpm dev`
- Validate curriculum schemas, ID uniqueness, furigana coverage, and L3+ no-romaji policy: `pnpm validate`
- Run Vitest unit tests (counters, romaji-kana conversion, SRS, curriculum packs): `pnpm test`
- Check repository for leaked secrets or hardcoded local user paths: `pnpm scrub`
- Full verification gate (run before every commit/push): `pnpm check && pnpm build`

## Pedagogical & repository invariants

1. **100% original examples and explanations.** Align topics, grammar codes, and core vocabulary coverage to the student's Genki 3rd Edition course progression, while writing strictly original example sentences, mnemonics, cloze prompts, and dialogues. Never copy textbook dialogue transcripts or workbook exercises verbatim.
2. **Every Kanji segment requires pure Hiragana furigana.** Use `seg("学生", "がくせい")` from `src/content/schema.ts`. `pnpm validate` enforces this across all lessons.
3. **Lesson 3+ enforces `romajiPolicy: "no-romaji"`.** Lessons 0–2 allow optional romaji in Bridge Mode (`bridge-allowed`); from Lesson 3 onward, romaji must stay off by default so the learner reads kana and furigana fluently.
4. **Deterministic engines own rules; LLMs stay optional.** Counter mutations (`src/engine/numbers.ts`), verb/adjective conjugators, and SRS scheduling (`src/engine/srs.ts`) must be deterministic TypeScript modules with Vitest tests. The optional `/api/tutor` middleware (`vite.config.ts`) runs server-side only, reads credentials from environment variables or `~/.netrc`, and must never leak keys into client code or Git.
5. **Public GitHub hygiene.** Never commit `.env` files, personal `progress*.json` exports, or hardcoded local paths (`pnpm scrub` gates this automatically).

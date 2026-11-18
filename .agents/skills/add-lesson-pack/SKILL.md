---
name: add-lesson-pack
description: Author or expand typed Japanese lesson packs (L03 through L23), grammar rules, furigana vocab decks, cloze drills, roleplays, and deterministic conjugation/counter engines in Nihongo Partner. Use when adding a new Genki lesson, upgrading a bridge stub after class, or turning class notes and homework topics into interactive study drills.
---

# Add Lesson Pack

Read `AGENTS.md`, `docs/curriculum-architecture.md`, and `src/content/schema.ts` before authoring content.

## Workflow

1. **Inspect existing packs for structure and ID conventions:**
   - Complete pack reference: `src/content/lessons/lesson-02-shopping.ts`
   - Bridge stub reference: `src/content/lessons/lesson-03-bridge.ts`
   - Keep IDs prefixed by lesson number (`g03-*`, `v03-*`, `c03-*`, `rp03-*`) so global uniqueness holds across `LESSONS`.

2. **Enforce Lesson 3+ orthography and originality invariants:**
   - Set `romajiPolicy: "no-romaji"` on every lesson with `number >= 3`.
   - Wrap every Kanji substring in `seg("漢字", "かんじ")` using pure Hiragana readings so `pnpm validate` and `<SegmentsView>` render accurate `<ruby>` furigana.
   - Author 100% original sentences, mnemonics, cloze contexts, and roleplay turns—never copy copyrighted textbook dialogues or workbook items verbatim.

3. **Prioritize systems mental models and high-error traps:**
   - In each `GrammarPoint`, state the structural `formula` first, explain how it wires into Japanese SOV particle slots in `mentalModel`, and list concrete beginner mistakes in `traps` (for example, Lesson 3 relative time words `きょう / あした / まいにち` rejecting `に`, or u-verb lookalikes like `かえる -> かえります`).
   - In `clozeDrills`, make the 2–3 distractors represent actual student errors (such as `お` vs `を`, `で` vs `に`, `はも` vs `も`) and populate `trapWarning`.

4. **Add deterministic engines when algorithmic rules appear:**
   - Whenever a lesson introduces a rule-governed morphological or numeric system (such as Lesson 3 `ます` conjugation, Lesson 5 `い/な` adjective inflection, Lesson 6 `て`-form sound changes, or Lesson 7/11 counters), implement a pure solver in `src/engine/` with Vitest tests (`src/engine/*.test.ts`).

5. **Register and validate:**
   - Export the pack in `src/content/index.ts`.
   - Run `pnpm check && pnpm build` and resolve every validation or test failure before finishing.

## What the Study Path generates from your pack

`buildStudyPath` (`src/engine/path.ts`) reads every `status: "complete"` pack and emits units in this order, so author with these fields in mind:

| Field you write | Unit it drives |
| --- | --- |
| each `grammar[]` entry | one `grammar` unit: teach card from `formula`, `summary`, `mentalModel`, `traps`, `examples`; drills from clozes whose `grammarId` matches, example-match items from `examples`, and core vocab whose kana appears in those examples |
| `vocab[]` with `priority: "core"` | `vocab` units in chunks of at most 9 (EN -> JP typed recall + JP -> EN recognition); `note` text surfaces on the teach card |
| `vocab[]` with `priority: "classroom"` (4 or more) | a standalone classroom-survival unit; fewer than 4 merge into core |
| `vocab[]` with `priority: "bonus"` | teach-only cards, never quizzed |
| `clozeDrills[]` | choice items in micro-drills, typed items in checkpoints; `acceptedAnswers` is the grading set, so include every kana spelling you will accept |
| `roleplays[]` | a `roleplay` unit with one choice item per turn (exactly one `isCorrect` choice) and an "Open in Sensei" deep link |
| `survivalNotes` | bullets on classroom and roleplay teach cards |
| the whole pack | a `<L>-checkpoint` unit sampling 12 items across every unit above |
| `status: "bridge"` (first such lesson) | the optional, ungated `preview-<L>` unit at the end of the path |

Two extra hooks:
- If the lesson introduces a counter family (Lesson 7 `〜にん`, Lesson 11 `〜かい`, ...), add it to `COUNTER_KINDS_BY_LESSON` in `src/engine/path.ts` and give `generateCounterItems` a case plus curated drills in `src/engine/numbers.ts`.
- Any brand-new quiz type (verb conjugation, adjective inflection) needs a `DrillItem` builder in `src/engine/drills.ts` and a `fromX` call site in `buildLessonUnits`, with Vitest coverage in `src/engine/drills.test.ts` and `src/engine/path.test.ts`.

`pnpm validate` fails if your pack produces no grammar, vocab, or checkpoint unit, or if any cloze or non-bonus vocab item is unreachable from the path.

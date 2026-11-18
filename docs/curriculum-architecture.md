# Curriculum Architecture & Extensibility Guide

Nihongo Partner separates **curriculum data** (`src/content/`) from **deterministic learning engines** (`src/engine/`) and **workbench UI tabs** (`src/ui/`) so adding Lessons 3–12 (Genki I) or Lessons 13–23 (Genki II) requires zero React component rewrites.

## 1. Core Contracts (`src/content/schema.ts`)

Every lesson module exports a `LessonPack` validated by `LessonPackSchema`:

- `id`: `"L00"` .. `"L23"` (unique across the registry)
- `status`: `"complete"` for full lessons, `"bridge"` for upcoming preview stubs (`L03`, `L04`)
- `romajiPolicy`: `"bridge-allowed"` for Lessons 0–2; `"no-romaji"` enforced automatically by `pnpm validate` for Lesson 3 (`number >= 3`) and above
- `grammar`: array of `GrammarPoint` items (`formula`, `summary`, `mentalModel`, `traps`, and `examples`)
- `vocab`: array of `VocabEntry` items (`priority: "core" | "classroom" | "bonus"`, `segments` with furigana)
- `clozeDrills`: Bunpro-style slot-fill prompts with `acceptedAnswers`, 3–4 multiple-choice `options`, and `trapWarning`
- `roleplays`: multi-turn deterministic classroom/real-world branching conversations

### Kanji + Furigana Segments (`TextSegment`)

Instead of hardcoding plain strings or separate HTML ruby markup, Japanese text uses `seg(text, furigana?)`:

```ts
line(
  [seg("私", "わたし"), seg("は "), seg("図書館", "としょかん"), seg("で "), seg("勉強", "べんきょう"), seg("します。")],
  "わたしは としょかんで べんきょうします。",
  "Watashi wa toshokan de benkyou shimasu.",
  "I study at the library.",
)
```

`pnpm validate` inspects every `TextSegment` in the repository and fails CI if:
1. Any CJK Unified Ideograph (`\u4E00-\u9FFF`) lacks a `furigana` string, or
2. Any `furigana` string contains non-Hiragana characters.

This single invariant powers all three UI display modes (`bridge`, `classroom`, and `immersion`) automatically.

## 2. Adding or Expanding a Lesson Week-by-Week

1. Create or expand `src/content/lessons/lesson-XX-<slug>.ts` (for example, promoting `lesson-03-bridge.ts` from `status: "bridge"` to `status: "complete"` after class).
2. Register it in `LESSONS` inside `src/content/index.ts`.
3. If the lesson introduces a new algorithmic conjugation or counter family (such as Lesson 3 `ru/u/irregular` verb `ます` conjugation, Lesson 5 `い/な` adjectives, Lesson 6 `て`-form, or Lesson 7 `〜にん` people counters), add a pure solver + Vitest unit suite in `src/engine/`.
4. Run `pnpm check` (`tsc -b && pnpm validate && pnpm test && pnpm scrub`).

## 3. The Guided Study Path (`src/engine/path.ts`)

The default tab is a linear path of **study units** derived from content at build time by `buildStudyPath(LESSONS, KANA_CURRICULUM)` (`src/content/study-path.ts` exports the result as `STUDY_PATH`). Nothing in the path is hand-listed; adding a lesson pack adds units.

### Unit kinds and generation rules

| Kind | Produced from | Unit id | Teach card | Drill / checkpoint pool |
| --- | --- | --- | --- | --- |
| `kana` (x6) | `GOJUON_KANA`, `VOICING_RULES`, `ORTHOGRAPHY_MECHANICS`, `CONTRAST_PAIRS`, `KATAKANA_LOANWORD_DRILLS` | `kana-rows-1..3`, `kana-voicing`, `kana-contrasts`, `kana-loanwords` | kana cards with both mnemonics | hiragana + katakana reading items, voiced kana, mechanics words, lookalike choices, loanword decoding |
| `grammar` | one per `GrammarPoint` | `<L>-g-<grammarId>` | formula, summary, mental model, traps, examples | clozes with that `grammarId`, example-match items, core vocab whose kana appears in the examples |
| `vocab` | `priority: "core"` split into chunks of at most 9 | `<L>-v-<n>` | vocab cards (bonus words ride along as teach-only) | EN -> JP typed recall, JP -> EN recognition |
| `vocab` (classroom) | `priority: "classroom"` when the lesson has 4 or more; smaller sets merge into core | `<L>-classroom` | survival notes + cards | same as vocab |
| `counters` | `COUNTER_KINDS_BY_LESSON[lessonId]` | `<L>-counters` | shift tables | curated `getCuratedCounterDrills` + 6 generated items per kind from `spell*` |
| `roleplay` | `lesson.roleplays` | `<L>-roleplay` | scenario briefing + "Open in Sensei" | one choice item per turn |
| `checkpoint` | every complete lesson | `<L>-checkpoint` | lesson goals | union of the lesson's unit pools, 12 items |
| `cumulative` | all complete lessons + kana | `cumulative-L00-L02` | readiness notes | everything so far, 25 items |
| `preview` | first `status: "bridge"` lesson | `preview-<L>` | grammar + vocab of the bridge pack | clozes, example-match, recognition; optional and ungated |

Every item is a `DrillItem` (`src/engine/drills.ts`): one shape with `prompt`, `answerKind: "choice" | "typed"`, `acceptedKana`, `acceptedRomaji`, `explanation`, and a mastery `id` shared with the reference tabs (`kana-shi`, `v01-nensei`, `c02-3`, `time-0400`, ...). Checkpoint pools are the micro-drill items passed through `asTyped`, so anything that can be typed is typed in the checkpoint.

### Flow inside a unit (`src/ui/UnitPlayer.tsx`)

`teach -> drill -> checkpoint -> result -> (retry misses -> checkpoint) | (review -> done)`

- `selectDrillItems` picks `drillSize` prompts, unseen and shaky first.
- `selectCheckpointItems` picks `checkpointSize` prompts deterministically per `(unitId, attempt)`, weak items first, one per mastery id.
- `selectReviewItems` runs after a pass: up to 6 items from earlier units ranked due -> shaky -> learning -> other.

### Soft gating (`getUnitStatus`)

- A unit is `available` when it is first, optional, or the previous gated unit is `passed` or `skipped`.
- `recordCheckpoint(snapshot, unitId, score, passBar)` writes `passed` at or above `PASS_BAR = 0.8`, otherwise `failed` (still available). A pass is never downgraded.
- `markUnitSkipped` records `skipped`, shown as **Not yet mastered**; `jumpToUnit` marks every earlier unpassed gated unit the same way.
- `nextRecommendedUnit` returns the first available/in-progress/failed required unit, then the first flagged unit, then unfinished optional units.
- Preview units set `gated: false` so their score is informational.

### Pace, not a timer

`summarizeReadiness` reports per-group mastery (`solid` items / items), the ten weakest items, flagged units, and `estimatedRemainingMinutes = remaining base minutes x paceRatio`, where `paceRatio` is observed seconds in passed units over their `estimatedMinutes` (clamped 0.5 to 2.5). Nothing locks on the clock.

## 4. Adding a lesson to the path

Promote or author a pack with `status: "complete"` and the path picks it up. Three optional hooks:

1. `COUNTER_KINDS_BY_LESSON` in `src/engine/path.ts` adds a counters unit; pair it with curated drills in `src/engine/numbers.ts`.
2. `priority: "classroom"` on four or more vocab entries yields a standalone survival unit.
3. `pnpm validate` fails if a complete lesson has no grammar, vocab, or checkpoint unit, or if any cloze or non-bonus vocab item is unreachable from the path.

## 5. FSRS-Lite Progress Sidecar (`progress.json`)

The browser stores item-level latency, streak, lapse count, and stability bucket (`0..4`) in `localStorage` under `nihongo-partner.progress.v1`, plus `pathUnits` (per-unit status, attempts, best/last score, seconds spent). Older snapshots without `pathUnits` load unchanged. Clicking **Export JSON** downloads `progress.json` (gitignored), which coding agents can read during a `cram-coach-session` to drill your actual shaky items before quizzes or class.

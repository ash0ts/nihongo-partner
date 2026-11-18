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

## 3. FSRS-Lite Progress Sidecar (`progress.json`)

The browser stores item-level latency, streak, lapse count, and stability bucket (`0..4`) in `localStorage` under `nihongo-partner.progress.v1`. Clicking **Export JSON** downloads `progress.json` (gitignored), which coding agents can read during a `cram-coach-session` to drill your actual shaky items before quizzes or class.

---
name: curriculum-audit
description: Audit Nihongo Partner curriculum accuracy, Zod schema validity, Kanji furigana completeness, Lesson 3+ no-romaji compliance, copyright originality, Vitest coverage, and secret/local-path hygiene before commits or GitHub pushes. Use before committing, opening PRs, or publishing curriculum updates.
---

# Curriculum Audit

Run this checklist before committing or pushing changes to GitHub.

## Automated Gate

Execute from the repository root:

```bash
pnpm check && pnpm build
```

`pnpm check` runs four deterministic gates in sequence:
1. `pnpm typecheck` (`tsc -b` strict mode with `noUnusedLocals` and `noUnusedParameters`)
2. `pnpm validate` (`scripts/validate-content.ts` — checks 46 base Gojuon kana, Zod schemas across all `LESSONS`, global ID uniqueness, mandatory Hiragana-only `furigana` on every Kanji `TextSegment`, `romajiPolicy: "no-romaji"` on `number >= 3`, and cloze/roleplay answer integrity)
3. `pnpm test` (`vitest run` — verifies phonetic mutations across numbers, `10^4 まん`, clock times, ages, school years, romaji-kana normalization, and FSRS-lite mastery transitions)
4. `pnpm scrub` (`scripts/scrub-check.ts` — rejects hardcoded local user home paths and API keys/tokens across all tracked source and doc files)

## Manual Linguistic & Originality Spot-Check

Before finalizing new curriculum items, verify:
- Phonetic mutations match standard Tokyo Japanese taught in Genki 3rd Edition (`よじ`, `しちじ`, `くじ`, `よねんせい`, `はたち`, `さんびゃく/ろっぴゃく/はっぴゃく`, `さんぜん/はっせん`, `あそこ`).
- Topic `は` (`wa`), direction `へ` (`e`), and direct-object `を` (`o`) use particle orthography in `segments` and `kana`.
- All example sentences, mnemonics, and dialogues are original rather than lifted from copyrighted textbooks or workbooks.
- `.cursor/skills/` and `.agents/skills/` stay mirrored so Cursor, Claude Code, and Codex see identical repository instructions.

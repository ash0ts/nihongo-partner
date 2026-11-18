# CLAUDE.md

Read and follow [`AGENTS.md`](AGENTS.md) and the repository skills in `.agents/skills/` (identical to `.cursor/skills/`):

- `.agents/skills/add-lesson-pack/SKILL.md`
- `.agents/skills/cram-coach-session/SKILL.md`
- `.agents/skills/curriculum-audit/SKILL.md`

The default learner experience is the guided Study Path (`src/engine/path.ts`, `src/ui/PathTab.tsx`), derived from lesson packs. Content changes flow into it automatically; see `docs/curriculum-architecture.md` section 3 before touching gating or item selection.

Always run `pnpm check && pnpm build` before committing or pushing changes.

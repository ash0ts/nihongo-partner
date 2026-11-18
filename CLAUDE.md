# CLAUDE.md

Read and follow [`AGENTS.md`](AGENTS.md) and the repository skills in `.agents/skills/` (identical to `.cursor/skills/`):

- `.agents/skills/add-lesson-pack/SKILL.md`
- `.agents/skills/cram-coach-session/SKILL.md`
- `.agents/skills/curriculum-audit/SKILL.md`

The default learner experience is the guided Study Path (`src/engine/path.ts`, `src/ui/PathTab.tsx`), derived from lesson packs. Content changes flow into it automatically; see `docs/curriculum-architecture.md` section 3 before touching gating or item selection.

The Sensei agent lives in `server/` (traced to Forge Agent Lens), the persona simulator in `sim/`, and the Python evals in `evals/`. `src/engine/events.ts` is the shared contract between all of them; see AGENTS.md invariant 7 before changing it.

Always run `pnpm check && pnpm build && pnpm sim --no-llm` and the three `uv run nihongo-evals ... --dry-run` commands (from `evals/`) before committing or pushing changes.

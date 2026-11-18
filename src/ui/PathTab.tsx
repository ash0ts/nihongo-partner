import { useMemo, useState } from "react";
import type { DisplayMode } from "../content/schema";
import {
  formatMinutes,
  getUnitStatus,
  nextRecommendedUnit,
  type StudyPath,
  type StudyUnit,
  summarizeReadiness,
  type UnitDisplayStatus,
} from "../engine/path";
import type { ItemMastery, ProgressSnapshot } from "../engine/srs";
import { UnitPlayer } from "./UnitPlayer";

interface PathTabProps {
  path: StudyPath;
  progress: ProgressSnapshot;
  mode: DisplayMode;
  slowAudio: boolean;
  onRecordReview: (id: string, category: ItemMastery["category"], isCorrect: boolean, ms: number) => void;
  onRecordCheckpoint: (unitId: string, score: number, passBar: number) => void;
  onSkipUnit: (unitId: string) => void;
  onJumpToUnit: (unitId: string) => void;
  onResetUnit: (unitId: string) => void;
  onElapsed: (unitId: string, seconds: number) => void;
  onOpenRoleplay: (scenarioId: string) => void;
}

const STATUS_LABEL: Record<UnitDisplayStatus, string> = {
  locked: "Locked",
  available: "Up next",
  "in-progress": "In progress",
  passed: "Passed",
  failed: "Below bar",
  "skipped-unmastered": "Not yet mastered",
};

const STATUS_CLASS: Record<UnitDisplayStatus, string> = {
  locked: "bg-stone-100 text-stone-500 border-stone-200",
  available: "bg-stone-900 text-white border-stone-900",
  "in-progress": "bg-sky-100 text-sky-900 border-sky-300",
  passed: "bg-emerald-100 text-emerald-900 border-emerald-300",
  failed: "bg-amber-100 text-amber-900 border-amber-300",
  "skipped-unmastered": "bg-amber-100 text-amber-900 border-amber-400",
};

const KIND_LABEL: Record<StudyUnit["kind"], string> = {
  kana: "Kana",
  grammar: "Grammar",
  vocab: "Vocab",
  counters: "Numbers",
  roleplay: "Roleplay",
  checkpoint: "Lesson check",
  cumulative: "Mock",
  preview: "Preview",
};

export function PathTab({
  path,
  progress,
  mode,
  slowAudio,
  onRecordReview,
  onRecordCheckpoint,
  onSkipUnit,
  onJumpToUnit,
  onResetUnit,
  onElapsed,
  onOpenRoleplay,
}: PathTabProps) {
  const [openUnitId, setOpenUnitId] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<StudyUnit | null>(null);

  const statuses = useMemo(() => {
    const map = new Map<string, UnitDisplayStatus>();
    for (const u of path.units) map.set(u.id, getUnitStatus(path, u.id, progress));
    return map;
  }, [path, progress]);

  const summary = useMemo(() => summarizeReadiness(path, progress), [path, progress]);
  const next = useMemo(() => nextRecommendedUnit(path, progress), [path, progress]);

  const openUnit = openUnitId ? path.units.find((u) => u.id === openUnitId) ?? null : null;

  const advanceFrom = (unitId: string) => {
    const idx = path.units.findIndex((u) => u.id === unitId);
    const following = path.units[idx + 1];
    if (following) setOpenUnitId(following.id);
    else setOpenUnitId(null);
  };

  if (openUnit) {
    const idx = path.units.findIndex((u) => u.id === openUnit.id);
    return (
      <UnitPlayer
        key={openUnit.id}
        path={path}
        unit={openUnit}
        progress={progress}
        mode={mode}
        slowAudio={slowAudio}
        isLastUnit={idx === path.units.length - 1}
        onRecordReview={onRecordReview}
        onRecordCheckpoint={onRecordCheckpoint}
        onSkipUnit={onSkipUnit}
        onElapsed={onElapsed}
        onExit={() => setOpenUnitId(null)}
        onAdvance={() => advanceFrom(openUnit.id)}
        onOpenRoleplay={onOpenRoleplay}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Continue card */}
      <section className="rounded-lg border border-stone-900 bg-stone-900 p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="mono-label text-xs uppercase text-stone-400">
              {summary.isComplete ? "Path complete" : "Continue"}
            </div>
            {next ? (
              <>
                <h2 className="text-lg font-semibold">{next.title}</h2>
                <p className="text-sm text-stone-300">{next.subtitle}</p>
              </>
            ) : (
              <h2 className="text-lg font-semibold">Every required unit passed. Walk in.</h2>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <div className="mono-label text-xs text-stone-400">
                {summary.unitsPassed} / {summary.unitsTotal} units · {summary.overallPct}%
              </div>
              <div className="mono-label text-xs text-stone-400">
                ~{formatMinutes(summary.estimatedRemainingMinutes)} left at your pace
                {summary.paceRatio !== 1 && ` (×${summary.paceRatio.toFixed(2)})`}
              </div>
            </div>
            {next && (
              <button
                type="button"
                onClick={() => setOpenUnitId(next.id)}
                className="rounded bg-white px-4 py-2 text-xs font-semibold text-stone-900 hover:bg-stone-200 cursor-pointer"
              >
                {statuses.get(next.id) === "skipped-unmastered" ? "Go back and master it" : "Start"}
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-stone-700">
          <div className="h-full bg-emerald-400 transition-all" style={{ width: `${summary.overallPct}%` }} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Unit list */}
        <div className="space-y-5">
          {path.groups.map((group) => {
            const units = group.unitIds.map((id) => path.units.find((u) => u.id === id)!).filter(Boolean);
            const g = summary.groups.find((x) => x.groupId === group.id);
            return (
              <section key={group.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-stone-900">{group.title}</h3>
                    <p className="text-xs text-stone-600">{group.subtitle}</p>
                  </div>
                  {g && (
                    <span className="mono-label text-xs text-stone-500">
                      {g.unitsPassed}/{g.unitsTotal} passed · {g.masteryPct}% items solid
                    </span>
                  )}
                </div>
                <ol className="mt-2 divide-y divide-stone-200 rounded-lg border border-stone-300 bg-white">
                  {units.map((u) => {
                    const status = statuses.get(u.id) ?? "locked";
                    const rec = progress.pathUnits[u.id];
                    return (
                      <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <span className={`mono-label shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[status]}`}>
                          {STATUS_LABEL[status]}
                          {status === "passed" && rec && ` ${Math.round(rec.bestScore * 100)}%`}
                          {status === "failed" && rec && ` ${Math.round(rec.lastScore * 100)}%`}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-stone-900">
                            {u.title}
                            {u.optional && <span className="ml-2 text-xs font-normal text-stone-500">optional</span>}
                          </div>
                          <div className="mono-label text-[11px] text-stone-500">
                            {KIND_LABEL[u.kind]} · ~{u.estimatedMinutes} min · {u.checkpointSize}-item checkpoint
                            {rec && rec.attempts > 0 && ` · ${rec.attempts} attempt${rec.attempts === 1 ? "" : "s"}`}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1.5">
                          {status === "locked" ? (
                            <button
                              type="button"
                              onClick={() => setPendingJump(u)}
                              className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-600 hover:bg-stone-100 cursor-pointer"
                            >
                              Jump here
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setOpenUnitId(u.id)}
                              className={`rounded px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                                status === "passed"
                                  ? "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
                                  : "bg-stone-900 text-white hover:bg-stone-700"
                              }`}
                            >
                              {status === "passed" ? "Review" : status === "skipped-unmastered" ? "Master it" : "Open"}
                            </button>
                          )}
                          {rec && (
                            <button
                              type="button"
                              onClick={() => onResetUnit(u.id)}
                              title="Clear this unit's checkpoint record (item mastery is kept)"
                              className="rounded border border-stone-200 bg-white px-2 py-1 text-[11px] text-stone-500 hover:bg-stone-100 cursor-pointer"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>

        {/* Readiness panel */}
        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <section className="rounded-lg border border-stone-300 bg-white p-4">
            <h3 className="text-sm font-semibold text-stone-900">Ready for class?</h3>
            <ul className="mt-2 space-y-1.5">
              {summary.groups.map((g) => (
                <li key={g.groupId} className="text-xs">
                  <div className="flex items-center justify-between text-stone-700">
                    <span className="truncate pr-2">{g.title}</span>
                    <span className="mono-label shrink-0">{g.masteryPct}%</span>
                  </div>
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded bg-stone-200">
                    <div className="h-full bg-stone-900" style={{ width: `${g.masteryPct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-stone-500">
              "Items solid" counts drill items answered correctly twice in a row, quickly, with a stable review box.
            </p>
          </section>

          {summary.flaggedUnits.length > 0 && (
            <section className="rounded-lg border border-amber-400 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-950">Not yet mastered</h3>
              <ul className="mt-2 space-y-1">
                {summary.flaggedUnits.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-xs text-amber-950">
                    <span className="truncate">{u.title}</span>
                    <button
                      type="button"
                      onClick={() => setOpenUnitId(u.id)}
                      className="shrink-0 rounded border border-amber-500 bg-white px-2 py-0.5 text-[11px] font-semibold cursor-pointer hover:bg-amber-100"
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-stone-300 bg-white p-4">
            <h3 className="text-sm font-semibold text-stone-900">Weakest items</h3>
            {summary.weakest.length === 0 ? (
              <p className="mt-1 text-xs text-stone-500">Nothing shaky yet. Misses will show up here.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {summary.weakest.map((w) => (
                  <li key={w.id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="jp-text truncate font-medium text-stone-900">{w.label}</span>
                    <span className="mono-label shrink-0 text-stone-500">
                      {w.lapses} miss{w.lapses === 1 ? "" : "es"} · {Math.round(w.accuracy * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {pendingJump && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-900/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border border-stone-300 bg-white p-5">
            <h3 className="text-base font-semibold text-stone-900">Jump to "{pendingJump.title}"?</h3>
            <p className="mt-1 text-sm text-stone-700">
              Every earlier unit you have not passed will be flagged "not yet mastered". You can come back to them
              from the readiness panel any time.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingJump(null)}
                className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onJumpToUnit(pendingJump.id);
                  setOpenUnitId(pendingJump.id);
                  setPendingJump(null);
                }}
                className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 cursor-pointer"
              >
                Jump and flag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

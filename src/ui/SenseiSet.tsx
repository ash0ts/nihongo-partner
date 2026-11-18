import { useMemo, useState } from "react";
import type { DisplayMode } from "../content/schema";
import { composeExerciseSet, type ExerciseSet, itemPool, TEACHING_RULES } from "../engine/composer";
import { asTyped, type DrillItem } from "../engine/drills";
import type { InteractionEvent } from "../engine/events";
import type { StudyPath } from "../engine/path";
import { composeSet as composeOnServer } from "../engine/tutor-client";
import { DrillCard } from "./DrillCard";
import { useTutor } from "./TutorContext";
import type { DrillAnswerHandler } from "./UnitPlayer";

/**
 * "Sensei set": a 10-item drill composed from the learner's own misses.
 * With the Sensei server up, the set comes back traced with a model-written rationale;
 * on a static host the same deterministic composer runs in the browser.
 */

export function resolveComposedItems(set: ExerciseSet, path: StudyPath): DrillItem[] {
  const pool = itemPool(path);
  const byKey = new Map(pool.map((it) => [it.variantKey, it]));
  const out: DrillItem[] = [];
  for (const c of set.items) {
    const direct = byKey.get(c.variantKey);
    const base = direct ?? byKey.get(c.variantKey.replace(/:typed$/, "")) ?? pool.find((it) => it.id === c.itemId);
    if (!base) continue;
    out.push(c.answerKind === "typed" ? asTyped(base) : base);
  }
  return out;
}

interface SenseiSetCardProps {
  path: StudyPath;
  events: InteractionEvent[];
  mode: DisplayMode;
  onStart: (set: ExerciseSet, items: DrillItem[]) => void;
}

export function SenseiSetCard({ path, events, mode, onStart }: SenseiSetCardProps) {
  const tutor = useTutor();
  const [state, setState] = useState<{ loading: boolean; set?: ExerciseSet; error?: string }>({ loading: false });
  const live = Boolean(tutor.status?.available);

  const build = async () => {
    setState({ loading: true });
    if (live) {
      const res = await composeOnServer({ sessionId: tutor.sessionId, mode, recentEvents: events.slice(-300), n: 10 });
      if (res.ok && res.result) {
        setState({ loading: false, set: res.result });
        return;
      }
    }
    const set = composeExerciseSet({ events, pool: itemPool(path), mode, n: 10 });
    setState({ loading: false, set });
  };

  const set = state.set;
  const items = useMemo(() => (set ? resolveComposedItems(set, path) : []), [set, path]);

  return (
    <section className="rounded-lg border border-stone-900 bg-white p-4" data-testid="sensei-set-card">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-stone-900">Sensei set</h3>
        <span className="mono-label text-[11px] text-stone-500">{events.length} answers logged</span>
      </div>
      <p className="mt-1 text-xs text-stone-600">
        Ten items built from your own misses: the traps you fall for, mixed up, with typing instead of multiple choice once you have shown you know one.
      </p>
      {!set && (
        <button
          type="button"
          onClick={build}
          disabled={state.loading}
          className="mt-3 w-full rounded bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-60 cursor-pointer"
        >
          {state.loading ? "Building…" : events.length === 0 ? "Build a starter set" : "Build my set"}
        </button>
      )}
      {set && (
        <div className="mt-3 space-y-2">
          <div className="rounded border border-stone-200 bg-stone-50 p-3">
            <div className="mono-label text-[10px] uppercase text-stone-500">
              {set.source === "llm" ? "Written for you" : "Rule-based"} · {items.length} items
            </div>
            <p className="mt-1 text-xs leading-relaxed text-stone-800">{set.rationale}</p>
          </div>
          <ul className="flex flex-wrap gap-1">
            {set.rules.map((r) => (
              <li key={r} title={TEACHING_RULES[r]} className="mono-label rounded border border-stone-200 px-1.5 py-0.5 text-[10px] text-stone-600">
                {r}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onStart(set, items)}
              disabled={items.length === 0}
              className="flex-1 rounded bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-700 disabled:opacity-60 cursor-pointer"
            >
              Start set
            </button>
            <button
              type="button"
              onClick={build}
              className="rounded border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Rebuild
            </button>
          </div>
        </div>
      )}
      {state.error && <p className="mt-2 text-xs text-red-700">{state.error}</p>}
    </section>
  );
}

interface SenseiSetPlayerProps {
  set: ExerciseSet;
  items: DrillItem[];
  mode: DisplayMode;
  slowAudio: boolean;
  onDrillAnswer: DrillAnswerHandler;
  onExit: () => void;
}

export function SenseiSetPlayer({ set, items, mode, slowAudio, onDrillAnswer, onExit }: SenseiSetPlayerProps) {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const item = items[index];
  const done = index >= items.length;
  const correct = results.filter(Boolean).length;

  return (
    <div className="space-y-4" data-testid="sensei-set-player">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="mono-label text-xs uppercase text-stone-500">Sensei set</div>
          <p className="max-w-xl text-xs text-stone-600">{set.rationale}</p>
        </div>
        <button type="button" onClick={onExit} className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer">
          Back to path
        </button>
      </div>
      {!done && item && (
        <DrillCard
          key={item.variantKey}
          item={item}
          index={index}
          total={items.length}
          mode={mode}
          slowAudio={slowAudio}
          variant="drill"
          onAnswer={(ok, ms, input) => {
            setResults((r) => [...r, ok]);
            onDrillAnswer(item, ok, ms, input, "sensei-set");
          }}
          onNext={() => setIndex((i) => i + 1)}
          nextLabel={index === items.length - 1 ? "Finish" : "Next"}
        />
      )}
      {done && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <h2 className="text-lg font-semibold text-stone-900">
            {correct} / {items.length}
          </h2>
          <p className="mt-1 text-sm text-stone-700">
            {correct === items.length
              ? "Clean set. Build another and the composer will push harder."
              : "Misses are back in the log, so the next set leans on them."}
          </p>
          <button type="button" onClick={onExit} className="mt-4 rounded bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 cursor-pointer">
            Back to path
          </button>
        </section>
      )}
    </div>
  );
}

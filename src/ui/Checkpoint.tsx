import { useEffect, useState } from "react";
import type { DisplayMode } from "../content/schema";
import type { DrillItem } from "../engine/drills";
import type { StudyUnit } from "../engine/path";
import { trapForItem } from "../engine/traps";
import { whatToFix } from "../engine/tutor-client";
import type { WhatToFixResult } from "../engine/tutor-types";
import { DrillCard } from "./DrillCard";
import { useTutor } from "./TutorContext";
import type { DrillAnswerHandler } from "./UnitPlayer";

export interface CheckpointOutcome {
  score: number; // 0..1
  correct: number;
  total: number;
  missed: DrillItem[];
  /** What the learner answered for each missed item, keyed by variantKey. */
  inputs: Record<string, string>;
}

interface CheckpointProps {
  unit: StudyUnit;
  items: DrillItem[];
  mode: DisplayMode;
  slowAudio: boolean;
  onDrillAnswer: DrillAnswerHandler;
  onFinished: (outcome: CheckpointOutcome) => void;
}

/** Fixed-length quiz with no hints; reports a score when the last item is answered. */
export function Checkpoint({ unit, items, mode, slowAudio, onDrillAnswer, onFinished }: CheckpointProps) {
  const [idx, setIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [missed, setMissed] = useState<DrillItem[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [lastOk, setLastOk] = useState<boolean | null>(null);

  const item = items[idx];
  if (!item) return null;

  const handleAnswer = (ok: boolean, ms: number, input: string) => {
    onDrillAnswer(item, ok, ms, input, "checkpoint");
    setLastOk(ok);
    if (ok) setCorrect((c) => c + 1);
    else {
      setMissed((m) => [...m, item]);
      setInputs((prev) => ({ ...prev, [item.variantKey]: input }));
    }
  };

  const handleNext = () => {
    const nextCorrect = correct;
    const nextMissed = missed;
    if (idx + 1 >= items.length) {
      onFinished({
        score: items.length === 0 ? 0 : nextCorrect / items.length,
        correct: nextCorrect,
        total: items.length,
        missed: nextMissed,
        inputs,
      });
      return;
    }
    setLastOk(null);
    setIdx((i) => i + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-stone-600">
        <span>
          {unit.title} · pass bar {Math.round(unit.passBar * 100)}%
          {!unit.gated && " (ungated preview)"}
        </span>
        <span className="mono-label">
          {correct} right · {missed.length} missed
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-stone-200">
        <div
          className={`h-full transition-all ${lastOk === false ? "bg-amber-500" : "bg-stone-900"}`}
          style={{ width: `${((idx + (lastOk === null ? 0 : 1)) / items.length) * 100}%` }}
        />
      </div>
      <DrillCard
        key={item.variantKey}
        item={item}
        index={idx}
        total={items.length}
        mode={mode}
        slowAudio={slowAudio}
        variant="checkpoint"
        onAnswer={handleAnswer}
        onNext={handleNext}
        nextLabel={idx + 1 >= items.length ? "See score" : "Next"}
      />
    </div>
  );
}

interface CheckpointResultProps {
  unit: StudyUnit;
  outcome: CheckpointOutcome;
  attempt: number;
  isLastUnit: boolean;
  onRetryWeak: () => void;
  onRetake: () => void;
  onSkip: () => void;
  onContinue: () => void;
}

export function CheckpointResult({
  unit,
  outcome,
  attempt,
  isLastUnit,
  onRetryWeak,
  onRetake,
  onSkip,
  onContinue,
}: CheckpointResultProps) {
  const pct = Math.round(outcome.score * 100);
  const passed = !unit.gated || outcome.score >= unit.passBar;
  const tutor = useTutor();
  const [fix, setFix] = useState<WhatToFixResult | null>(null);

  // Ask the Sensei agent what the misses have in common. Only when a server is present.
  useEffect(() => {
    if (!tutor.status?.available || outcome.missed.length === 0) return;
    let live = true;
    whatToFix({
      sessionId: tutor.sessionId,
      mode: tutor.mode,
      unitId: unit.id,
      recentEvents: tutor.recentEvents(),
      unitTitle: unit.title,
      missed: outcome.missed.map((m) => ({
        itemId: m.id,
        input: outcome.inputs[m.variantKey] ?? "",
        expected: m.answerDisplay,
        trapId: trapForItem(m)?.id,
      })),
    }).then((res) => {
      if (live && res.ok && res.result) setFix(res.result);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit.id, attempt]);

  return (
    <div
      className={`rounded-lg border p-6 ${
        passed ? "border-emerald-400 bg-emerald-50" : "border-amber-400 bg-amber-50"
      }`}
    >
      <div className="mono-label text-xs uppercase text-stone-600">
        Checkpoint result · attempt {attempt}
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-5xl font-bold text-stone-900">{pct}%</span>
        <span className="text-sm text-stone-700">
          {outcome.correct} / {outcome.total} correct · pass bar {Math.round(unit.passBar * 100)}%
        </span>
      </div>
      <p className="mt-2 text-sm text-stone-800">
        {!unit.gated
          ? "Preview unit: no gate here. You have seen what class covers next."
          : passed
            ? "Passed. A short cumulative review comes next so earlier material stays warm."
            : "Below the bar. Retry just the misses, then retake, or skip ahead and this unit stays flagged as not yet mastered."}
      </p>

      {fix && (
        <div className="mt-3 rounded border border-stone-300 bg-white/80 p-3 text-sm text-stone-900">
          <div className="mono-label text-[10px] uppercase text-stone-500">
            What to fix · Sensei {fix.source === "llm" ? "(written for you)" : "(rule)"}
          </div>
          <p className="mt-0.5 leading-relaxed">{fix.summary}</p>
        </div>
      )}

      {outcome.missed.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-stone-700">Missed</div>
          <ul className="mt-1 grid gap-1 sm:grid-cols-2">
            {outcome.missed.map((m) => (
              <li key={m.variantKey} className="rounded border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-800">
                <span className="jp-text font-medium">{m.prompt.text ?? m.prompt.segments?.map((s) => s.text).join("")}</span>
                <span className="text-stone-500"> → </span>
                <span className="jp-text">{m.answerDisplay}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {passed ? (
          <button
            type="button"
            onClick={onContinue}
            className="rounded bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 cursor-pointer"
          >
            {isLastUnit ? "Finish" : "Continue"}
          </button>
        ) : (
          <>
            {outcome.missed.length > 0 && (
              <button
                type="button"
                onClick={onRetryWeak}
                className="rounded bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 cursor-pointer"
              >
                Retry the {outcome.missed.length} missed
              </button>
            )}
            <button
              type="button"
              onClick={onRetake}
              className="rounded border border-stone-400 bg-white px-4 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 cursor-pointer"
            >
              Retake checkpoint
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="rounded border border-amber-500 bg-white px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
            >
              Skip ahead anyway (flag as not yet mastered)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { DisplayMode } from "../content/schema";
import type { DrillItem } from "../engine/drills";
import {
  selectCheckpointItems,
  selectDrillItems,
  selectReviewItems,
  type StudyPath,
  type StudyUnit,
  type TeachBlock,
} from "../engine/path";
import { speakJapanese } from "../engine/speech";
import type { InteractionPhase } from "../engine/events";
import type { ProgressSnapshot } from "../engine/srs";
import { Checkpoint, type CheckpointOutcome, CheckpointResult } from "./Checkpoint";
import { DrillCard } from "./DrillCard";
import { JapaneseLineView, SegmentsView } from "./RubyText";

type Phase = "teach" | "drill" | "pre-checkpoint" | "checkpoint" | "result" | "retry" | "review" | "done";

/** Every answered prompt flows through this: mastery update plus the interaction event log. */
export type DrillAnswerHandler = (
  item: DrillItem,
  isCorrect: boolean,
  ms: number,
  input: string,
  phase: InteractionPhase,
) => void;

const REVIEW_SIZE = 6;

interface UnitPlayerProps {
  path: StudyPath;
  unit: StudyUnit;
  progress: ProgressSnapshot;
  mode: DisplayMode;
  slowAudio: boolean;
  isLastUnit: boolean;
  onDrillAnswer: DrillAnswerHandler;
  onRecordCheckpoint: (unitId: string, score: number, passBar: number) => void;
  onSkipUnit: (unitId: string) => void;
  onElapsed: (unitId: string, seconds: number) => void;
  onExit: () => void;
  onAdvance: () => void;
  onOpenRoleplay: (scenarioId: string) => void;
}

export function UnitPlayer({
  path,
  unit,
  progress,
  mode,
  slowAudio,
  isLastUnit,
  onDrillAnswer,
  onRecordCheckpoint,
  onSkipUnit,
  onElapsed,
  onExit,
  onAdvance,
  onOpenRoleplay,
}: UnitPlayerProps) {
  const effectiveMode: DisplayMode = unit.romajiPolicy === "no-romaji" && mode === "bridge" ? "classroom" : mode;
  const hasDrill = unit.drillItems.length > 0;

  const [phase, setPhase] = useState<Phase>("teach");
  const [drillPass, setDrillPass] = useState(0);
  const [drillItems, setDrillItems] = useState<DrillItem[]>([]);
  const [drillIdx, setDrillIdx] = useState(0);
  const [attempt, setAttempt] = useState(progress.pathUnits[unit.id]?.attempts ?? 0);
  const [checkpointItems, setCheckpointItems] = useState<DrillItem[]>([]);
  const [outcome, setOutcome] = useState<CheckpointOutcome | null>(null);
  const [retryItems, setRetryItems] = useState<DrillItem[]>([]);
  const [retryIdx, setRetryIdx] = useState(0);
  const [reviewItems, setReviewItems] = useState<DrillItem[]>([]);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewCorrect, setReviewCorrect] = useState(0);

  // Pace tracking: log wall-clock time spent in the unit when leaving it.
  const startedAt = useRef<number>(Date.now());
  const elapsedRef = useRef(onElapsed);
  elapsedRef.current = onElapsed;
  useEffect(() => {
    startedAt.current = Date.now();
    const id = unit.id;
    return () => {
      elapsedRef.current(id, (Date.now() - startedAt.current) / 1000);
    };
  }, [unit.id]);

  // Progress snapshot captured when entering a phase so selection is stable during it.
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const startDrill = () => {
    const items = selectDrillItems(unit, progressRef.current, drillPass);
    setDrillItems(items);
    setDrillIdx(0);
    setDrillPass((p) => p + 1);
    setPhase(items.length > 0 ? "drill" : "pre-checkpoint");
  };

  const startCheckpoint = () => {
    const items = selectCheckpointItems(unit, progressRef.current, attempt);
    setCheckpointItems(items);
    setOutcome(null);
    setPhase("checkpoint");
  };

  const finishCheckpoint = (result: CheckpointOutcome) => {
    setOutcome(result);
    setAttempt((a) => a + 1);
    onRecordCheckpoint(unit.id, result.score, unit.gated ? unit.passBar : 0);
    setPhase("result");
  };

  const startRetry = () => {
    if (!outcome || outcome.missed.length === 0) return;
    setRetryItems(outcome.missed.map((m) => ({ ...m, variantKey: `${m.variantKey}:retry${attempt}` })));
    setRetryIdx(0);
    setPhase("retry");
  };

  const startReview = () => {
    const items = selectReviewItems(path, progressRef.current, unit.id, REVIEW_SIZE);
    if (items.length === 0) {
      setPhase("done");
      return;
    }
    setReviewItems(items.map((it) => ({ ...it, variantKey: `${it.variantKey}:review${attempt}` })));
    setReviewIdx(0);
    setReviewCorrect(0);
    setPhase("review");
  };

  const skipUnit = () => {
    onSkipUnit(unit.id);
    onAdvance();
  };

  const checkpointPreview = useMemo(
    () => ({
      size: unit.checkpointSize,
      typed: unit.checkpointPool.filter((i) => i.answerKind === "typed").length,
    }),
    [unit],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="mono-label text-xs uppercase text-stone-500">
            {unit.kind} · ~{unit.estimatedMinutes} min · {phaseLabel(phase)}
          </div>
          <h2 className="text-xl font-semibold text-stone-900">{unit.title}</h2>
          <p className="text-sm text-stone-600">{unit.subtitle}</p>
          {unit.romajiPolicy === "no-romaji" && mode === "bridge" && (
            <p className="mt-1 text-xs text-amber-800">
              Romaji is off for this unit (Genki prints none from Lesson 3). Furigana stays on.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="rounded border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
        >
          Back to path
        </button>
      </div>

      <PhaseStrip phase={phase} hasDrill={hasDrill} />

      {phase === "teach" && (
        <>
          <TeachView teach={unit.teach} mode={effectiveMode} slowAudio={slowAudio} onOpenRoleplay={onOpenRoleplay} />
          <div className="flex flex-wrap gap-2">
            {hasDrill ? (
              <>
                <button
                  type="button"
                  onClick={startDrill}
                  className="rounded bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 cursor-pointer"
                >
                  Start micro-drill ({unit.drillSize} prompts)
                </button>
                <button
                  type="button"
                  onClick={startCheckpoint}
                  className="rounded border border-stone-400 bg-white px-4 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 cursor-pointer"
                >
                  I know this: go to checkpoint
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startCheckpoint}
                className="rounded bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 cursor-pointer"
              >
                Start checkpoint ({unit.checkpointSize} items)
              </button>
            )}
          </div>
        </>
      )}

      {phase === "drill" && drillItems[drillIdx] && (
        <DrillCard
          key={drillItems[drillIdx].variantKey}
          item={drillItems[drillIdx]}
          index={drillIdx}
          total={drillItems.length}
          mode={effectiveMode}
          slowAudio={slowAudio}
          variant="drill"
          onAnswer={(ok, ms, input) => onDrillAnswer(drillItems[drillIdx], ok, ms, input, "drill")}
          onNext={() => {
            if (drillIdx + 1 >= drillItems.length) setPhase("pre-checkpoint");
            else setDrillIdx((i) => i + 1);
          }}
          nextLabel={drillIdx + 1 >= drillItems.length ? "Finish drill" : "Next"}
        />
      )}

      {phase === "pre-checkpoint" && (
        <div className="rounded-lg border border-stone-300 bg-white p-6">
          <h3 className="text-lg font-semibold text-stone-900">Checkpoint: {checkpointPreview.size} items</h3>
          <p className="mt-1 text-sm text-stone-700">
            No hints. Typed answers where possible. {Math.round(unit.passBar * 100)}% unlocks the next unit; anything
            lower you can retry or skip with a flag.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startCheckpoint}
              className="rounded bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 cursor-pointer"
            >
              Start checkpoint
            </button>
            {hasDrill && (
              <button
                type="button"
                onClick={startDrill}
                className="rounded border border-stone-400 bg-white px-4 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 cursor-pointer"
              >
                One more drill round
              </button>
            )}
            <button
              type="button"
              onClick={() => setPhase("teach")}
              className="rounded border border-stone-300 bg-white px-4 py-2 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Re-read the teach card
            </button>
          </div>
        </div>
      )}

      {phase === "checkpoint" && checkpointItems.length > 0 && (
        <Checkpoint
          key={`${unit.id}:${attempt}`}
          unit={unit}
          items={checkpointItems}
          mode={effectiveMode}
          slowAudio={slowAudio}
          onDrillAnswer={onDrillAnswer}
          onFinished={finishCheckpoint}
        />
      )}

      {phase === "result" && outcome && (
        <CheckpointResult
          unit={unit}
          outcome={outcome}
          attempt={attempt}
          isLastUnit={isLastUnit}
          onRetryWeak={startRetry}
          onRetake={startCheckpoint}
          onSkip={skipUnit}
          onContinue={startReview}
        />
      )}

      {phase === "retry" && retryItems[retryIdx] && (
        <div className="space-y-2">
          <p className="text-xs text-stone-600">Retrying only what you missed. Explanations are back on.</p>
          <DrillCard
            key={retryItems[retryIdx].variantKey}
            item={retryItems[retryIdx]}
            index={retryIdx}
            total={retryItems.length}
            mode={effectiveMode}
            slowAudio={slowAudio}
            variant="drill"
            onAnswer={(ok, ms, input) => onDrillAnswer(retryItems[retryIdx], ok, ms, input, "retry")}
            onNext={() => {
              if (retryIdx + 1 >= retryItems.length) startCheckpoint();
              else setRetryIdx((i) => i + 1);
            }}
            nextLabel={retryIdx + 1 >= retryItems.length ? "Retake checkpoint" : "Next"}
          />
        </div>
      )}

      {phase === "review" && reviewItems[reviewIdx] && (
        <div className="space-y-2">
          <p className="text-xs text-stone-600">
            Cumulative review: {reviewItems.length} items from earlier units, due and shaky ones first.
          </p>
          <DrillCard
            key={reviewItems[reviewIdx].variantKey}
            item={reviewItems[reviewIdx]}
            index={reviewIdx}
            total={reviewItems.length}
            mode={effectiveMode}
            slowAudio={slowAudio}
            variant="drill"
            onAnswer={(ok, ms, input) => {
              onDrillAnswer(reviewItems[reviewIdx], ok, ms, input, "review");
              if (ok) setReviewCorrect((c) => c + 1);
            }}
            onNext={() => {
              if (reviewIdx + 1 >= reviewItems.length) setPhase("done");
              else setReviewIdx((i) => i + 1);
            }}
            nextLabel={reviewIdx + 1 >= reviewItems.length ? "Finish review" : "Next"}
          />
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-lg border border-emerald-400 bg-emerald-50 p-6">
          <h3 className="text-lg font-semibold text-stone-900">Unit complete</h3>
          <p className="mt-1 text-sm text-stone-800">
            {reviewItems.length > 0
              ? `Review: ${reviewCorrect} / ${reviewItems.length}. Misses are back in the queue and will resurface after the next checkpoint.`
              : "Nothing was due for review yet."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAdvance}
              className="rounded bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 cursor-pointer"
            >
              {isLastUnit ? "Back to path" : "Next unit"}
            </button>
            <button
              type="button"
              onClick={onExit}
              className="rounded border border-stone-300 bg-white px-4 py-2 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Back to path
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "teach":
      return "teach";
    case "drill":
      return "micro-drill";
    case "pre-checkpoint":
    case "checkpoint":
      return "checkpoint";
    case "result":
      return "score";
    case "retry":
      return "retry misses";
    case "review":
      return "cumulative review";
    case "done":
      return "complete";
  }
}

function PhaseStrip({ phase, hasDrill }: { phase: Phase; hasDrill: boolean }) {
  const steps: Array<{ key: string; label: string; active: Phase[] }> = [
    { key: "teach", label: "Teach", active: ["teach"] },
    ...(hasDrill ? [{ key: "drill", label: "Drill", active: ["drill" as Phase] }] : []),
    { key: "check", label: "Checkpoint", active: ["pre-checkpoint", "checkpoint", "result", "retry"] },
    { key: "review", label: "Review", active: ["review"] },
    { key: "done", label: "Done", active: ["done"] },
  ];
  const activeIdx = steps.findIndex((s) => s.active.includes(phase));
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-[11px]">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className={`mono-label rounded px-2 py-0.5 ${
            i === activeIdx
              ? "bg-stone-900 text-white"
              : i < activeIdx
                ? "bg-emerald-100 text-emerald-900"
                : "bg-stone-200/70 text-stone-600"
          }`}
        >
          {i + 1}. {s.label}
        </li>
      ))}
    </ol>
  );
}

interface TeachViewProps {
  teach: TeachBlock;
  mode: DisplayMode;
  slowAudio: boolean;
  onOpenRoleplay: (scenarioId: string) => void;
}

function TeachView({ teach, mode, slowAudio, onOpenRoleplay }: TeachViewProps) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-stone-300 bg-white p-5">
        <h3 className="text-base font-semibold text-stone-900">{teach.heading}</h3>
        <p className="mt-1 text-sm leading-relaxed text-stone-800">{teach.intro}</p>
        {teach.grammar && (
          <div className="mt-3 rounded border border-stone-200 bg-stone-50 p-3">
            <div className="mono-label text-xs uppercase text-stone-500">Formula</div>
            <div className="jp-text mt-0.5 text-base font-semibold text-stone-900">{teach.grammar.formula}</div>
          </div>
        )}
        {teach.bullets.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm text-stone-800">
            {teach.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-stone-400">•</span>
                <span className="jp-text leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        )}
        {teach.examples.length > 0 && (
          <div className="mt-3 divide-y divide-stone-200 border-t border-stone-200">
            {teach.examples.map((ex, i) => (
              <JapaneseLineView key={i} line={ex} mode={mode} slowAudio={slowAudio} />
            ))}
          </div>
        )}
      </section>

      {teach.kanaCards && teach.kanaCards.length > 0 && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <div className="mono-label text-xs uppercase text-stone-500">Characters ({teach.kanaCards.length})</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {teach.kanaCards.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => speakJapanese(k.hiragana, slowAudio)}
                className="rounded border border-stone-200 bg-stone-50 p-3 text-left hover:border-stone-400 cursor-pointer"
              >
                <div className="flex items-baseline gap-3">
                  <span className="jp-text text-4xl font-semibold text-stone-900">{k.hiragana}</span>
                  <span className="jp-text text-3xl text-stone-700">{k.katakana}</span>
                  <span className="mono-label ml-auto text-sm font-semibold text-stone-800">{k.romaji}</span>
                </div>
                <p className="mt-1.5 text-xs text-stone-700">{k.hiraMnemonic}</p>
                <p className="mt-0.5 text-xs text-stone-500">Katakana: {k.kataMnemonic}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {teach.voicingRules && teach.voicingRules.length > 0 && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <div className="mono-label text-xs uppercase text-stone-500">Voicing table</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {teach.voicingRules.map((r) => (
              <div key={`${r.baseRow}-${r.mark}`} className="rounded border border-stone-200 bg-stone-50 p-3">
                <div className="text-xs font-semibold text-stone-800">
                  {r.baseRow} · {r.mark}
                </div>
                <div className="text-xs text-stone-600">{r.shift}</div>
                <div className="jp-text mt-2 flex flex-wrap gap-2 text-lg">
                  {r.pairs.map((p) => (
                    <button
                      key={p.voicedHira}
                      type="button"
                      onClick={() => speakJapanese(p.voicedHira, slowAudio)}
                      title={p.note}
                      className="rounded border border-stone-300 bg-white px-2 py-1 cursor-pointer hover:border-stone-500"
                    >
                      {p.voicedHira}
                      <span className="text-stone-400">/</span>
                      {p.voicedKata}
                      <span className="mono-label ml-1 text-xs text-stone-600">{p.romaji}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {teach.mechanics && teach.mechanics.length > 0 && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <div className="mono-label text-xs uppercase text-stone-500">Spelling mechanics</div>
          <div className="mt-3 space-y-3">
            {teach.mechanics.map((m) => (
              <div key={m.id} className="rounded border border-stone-200 bg-stone-50 p-3">
                <div className="text-sm font-semibold text-stone-900">{m.title}</div>
                <p className="mt-1 text-xs text-stone-800">{m.rule}</p>
                <p className="mt-1 text-xs text-amber-900">Trap: {m.trap}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.examples.map((ex) => (
                    <button
                      key={ex.jp}
                      type="button"
                      onClick={() => speakJapanese(ex.jp, slowAudio)}
                      className="rounded border border-stone-300 bg-white px-2 py-1 text-left cursor-pointer hover:border-stone-500"
                    >
                      <span className="jp-text text-base">{ex.jp}</span>
                      <span className="mono-label ml-2 text-xs text-stone-600">{ex.romaji}</span>
                      <span className="ml-2 text-xs text-stone-500">{ex.en}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {teach.contrastPairs && teach.contrastPairs.length > 0 && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <div className="mono-label text-xs uppercase text-stone-500">Lookalikes</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {teach.contrastPairs.map((p) => (
              <div key={p.id} className="rounded border border-stone-200 bg-stone-50 p-3">
                <div className="jp-text flex items-baseline gap-3 text-4xl font-semibold text-stone-900">
                  {p.chars.map((c, i) => (
                    <span key={c}>
                      {c}
                      <span className="mono-label ml-1 text-xs font-normal text-stone-600">{p.romaji[i]}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-stone-800">{p.visualRule}</p>
                <div className="jp-text mt-1.5 text-xs text-stone-600">
                  {p.drillWords.map((w) => `${w.jp} (${w.romaji}, ${w.en})`).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {teach.loanwords && teach.loanwords.length > 0 && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <div className="mono-label text-xs uppercase text-stone-500">Loanwords ({teach.loanwords.length})</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {teach.loanwords.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => speakJapanese(w.jp, slowAudio)}
                className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-left cursor-pointer hover:border-stone-400"
              >
                <div className="jp-text text-xl font-medium text-stone-900">{w.jp}</div>
                <div className="text-xs text-stone-600">
                  <span className="mono-label">{w.romaji}</span> · {w.en}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {teach.vocabCards && teach.vocabCards.length > 0 && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <div className="mono-label text-xs uppercase text-stone-500">Vocabulary ({teach.vocabCards.length})</div>
          <div className="mt-2 divide-y divide-stone-200">
            {teach.vocabCards.map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="jp-text text-lg font-medium text-stone-900">
                    <SegmentsView segments={v.segments} mode={mode} />
                    {v.priority === "bonus" && (
                      <span className="mono-label ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">bonus</span>
                    )}
                  </div>
                  {mode === "bridge" && <div className="mono-label text-xs text-stone-500">{v.romaji}</div>}
                  <div className="text-sm text-stone-700">{v.en}</div>
                  {v.note && <div className="text-xs text-amber-900">{v.note}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => speakJapanese(v.kana.replace(/〜/g, ""), slowAudio)}
                  className="mono-label shrink-0 rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
                >
                  Play
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {teach.roleplays && teach.roleplays.length > 0 && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <div className="mono-label text-xs uppercase text-stone-500">Scenarios</div>
          <div className="mt-2 space-y-2">
            {teach.roleplays.map((rp) => (
              <div key={rp.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-stone-200 bg-stone-50 p-3">
                <div>
                  <div className="text-sm font-semibold text-stone-900">{rp.title}</div>
                  <div className="text-xs text-stone-600">
                    {rp.setting} You: {rp.yourRole}. Partner: {rp.partnerRole}. {rp.turns.length} turns.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenRoleplay(rp.id)}
                  className="rounded border border-stone-400 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 cursor-pointer"
                >
                  Open in Sensei Roleplay
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { DisplayMode } from "../content/schema";
import { type DrillItem, grade } from "../engine/drills";
import { speakJapanese } from "../engine/speech";
import { SegmentsView } from "./RubyText";

interface DrillCardProps {
  item: DrillItem;
  index: number;
  total: number;
  mode: DisplayMode;
  slowAudio: boolean;
  /** "drill" shows the full explanation; "checkpoint" shows only right/wrong and the answer. */
  variant: "drill" | "checkpoint";
  onAnswer: (isCorrect: boolean, ms: number, input: string) => void;
  onNext: () => void;
  nextLabel?: string;
}

const BIG_GLYPH_SKILLS = new Set(["kana-read", "voicing", "contrast"]);

export function DrillCard({
  item,
  index,
  total,
  mode,
  slowAudio,
  variant,
  onAnswer,
  onNext,
  nextLabel = "Next",
}: DrillCardProps) {
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<{ ok: boolean; input: string } | null>(null);
  const shownAt = useRef<number>(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTyped("");
    setResult(null);
    shownAt.current = Date.now();
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [item.variantKey]);

  useEffect(() => {
    if (result) nextRef.current?.focus();
  }, [result]);

  const submit = (input: string) => {
    if (result) return;
    const ok = grade(item, input);
    const ms = Date.now() - shownAt.current;
    setResult({ ok, input });
    onAnswer(ok, ms, input);
    if (item.prompt.speakKana) speakJapanese(item.prompt.speakKana, slowAudio);
  };

  const handleTypedSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (result) {
      onNext();
      return;
    }
    if (typed.trim()) submit(typed);
  };

  const isBigGlyph = BIG_GLYPH_SKILLS.has(item.skill) && item.prompt.text;
  const showRomaji = mode === "bridge" && item.prompt.romaji;

  return (
    <div className="rounded-lg border border-stone-300 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="mono-label text-xs uppercase text-stone-500">
          {variant === "checkpoint" ? "Checkpoint" : "Drill"} · {index + 1} / {total}
        </span>
        <span className="mono-label text-[11px] text-stone-400">{item.skill}</span>
      </div>

      <div className="mt-3">
        {item.prompt.segments && (
          <div className="jp-text text-2xl font-medium leading-relaxed text-stone-900">
            <SegmentsView segments={item.prompt.segments} mode={mode} />
          </div>
        )}
        {item.prompt.text && (
          <div
            className={`${isBigGlyph ? "jp-text text-6xl font-semibold tracking-wide" : "text-2xl font-medium"} text-stone-900`}
          >
            {item.prompt.text}
          </div>
        )}
        {showRomaji && <div className="mono-label mt-1 text-xs text-stone-500">{item.prompt.romaji}</div>}
        {item.prompt.en && <p className="mt-2 text-sm text-stone-600">{item.prompt.en}</p>}
      </div>

      {item.answerKind === "choice" && item.options ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {item.options.map((opt) => {
            const picked = result?.input === opt;
            const isAnswer = opt === item.answerDisplay;
            let cls = "border-stone-300 bg-white hover:border-stone-500";
            if (result) {
              if (isAnswer) cls = "border-emerald-500 bg-emerald-50";
              else if (picked) cls = "border-amber-500 bg-amber-50";
              else cls = "border-stone-200 bg-stone-50 text-stone-400";
            }
            return (
              <button
                key={opt}
                type="button"
                disabled={Boolean(result)}
                onClick={() => submit(opt)}
                className={`jp-text rounded-md border px-3 py-2.5 text-left text-base font-medium transition cursor-pointer disabled:cursor-default ${cls}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <form onSubmit={handleTypedSubmit} className="mt-4 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={typed}
            disabled={Boolean(result)}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type kana or romaji, then Enter"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="jp-text flex-1 rounded border border-stone-300 px-3 py-2 text-lg disabled:bg-stone-100"
          />
          {!result && (
            <button
              type="submit"
              className="rounded bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700 cursor-pointer"
            >
              Check
            </button>
          )}
        </form>
      )}

      {result && (
        <div
          className={`mt-4 rounded-md border p-3 text-sm ${
            result.ok ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-amber-300 bg-amber-50 text-amber-950"
          }`}
        >
          <div className="font-semibold">
            {result.ok ? "Correct." : "Not quite."}{" "}
            <span className="jp-text font-medium">
              {result.ok ? "" : `Answer: ${item.answerDisplay}`}
            </span>
          </div>
          {(variant === "drill" || !result.ok) && (
            <p className="mt-1 text-xs leading-relaxed">{item.explanation}</p>
          )}
          {variant === "drill" && item.trapWarning && (
            <p className="mt-1 text-xs font-medium">Trap: {item.trapWarning}</p>
          )}
          <div className="mt-3 flex justify-end">
            <button
              ref={nextRef}
              type="button"
              onClick={onNext}
              className="rounded bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-700 cursor-pointer"
            >
              {nextLabel} (Enter)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

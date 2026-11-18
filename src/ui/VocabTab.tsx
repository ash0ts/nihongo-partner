import { useMemo, useRef, useState } from "react";
import { ALL_VOCAB } from "../content";
import type { DisplayMode } from "../content/schema";
import { speakJapanese } from "../engine/speech";
import { classifyMastery, type ProgressSnapshot } from "../engine/srs";
import { SegmentsView } from "./RubyText";

interface VocabTabProps {
  progress: ProgressSnapshot;
  mode: DisplayMode;
  slowAudio: boolean;
  onRecordReview: (id: string, category: "vocab", isCorrect: boolean, ms: number) => void;
}

export function VocabTab({ progress, mode, slowAudio, onRecordReview }: VocabTabProps) {
  const [filter, setFilter] = useState<string>("classroom");
  const [direction, setDirection] = useState<"jp-en" | "en-jp">("jp-en");
  const [query, setQuery] = useState("");
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const cardShownAt = useRef<number>(Date.now());

  const filteredVocab = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = ALL_VOCAB.filter((v) => {
      if (filter === "classroom" && v.priority !== "classroom") return false;
      if (filter === "shaky" && classifyMastery(progress.items[v.id]) !== "shaky") return false;
      if (filter.startsWith("L0") && v.lessonId !== filter) return false;
      if (!q) return true;
      return (
        v.kana.toLowerCase().includes(q) ||
        v.romaji.toLowerCase().includes(q) ||
        v.en.toLowerCase().includes(q) ||
        v.category.toLowerCase().includes(q)
      );
    });
    return list.length > 0 ? list : ALL_VOCAB;
  }, [filter, progress.items, query]);

  const activeCard = filteredVocab[cardIdx % filteredVocab.length];

  const gradeCard = (knewIt: boolean) => {
    if (!activeCard) return;
    const elapsed = Date.now() - cardShownAt.current;
    onRecordReview(activeCard.id, "vocab", knewIt, elapsed);
    setFlipped(false);
    setCardIdx((i) => i + 1);
    cardShownAt.current = Date.now();
  };

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["classroom", "Classroom Survival (p.81 First!)"],
              ["all", "All Vocab"],
              ["L00", "L0 Greetings"],
              ["L01", "L1 New Friends"],
              ["L02", "L2 Shopping"],
              ["L03", "L3 Verbs Bridge"],
              ["shaky", "Shaky Queue"],
            ] as const
          ).map(([fid, label]) => (
            <button
              key={fid}
              type="button"
              onClick={() => {
                setFilter(fid);
                setCardIdx(0);
                setFlipped(false);
                cardShownAt.current = Date.now();
              }}
              className={`rounded px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                filter === fid
                  ? "bg-stone-900 text-white"
                  : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDirection((d) => (d === "jp-en" ? "en-jp" : "jp-en"));
              setFlipped(false);
            }}
            className="mono-label rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 cursor-pointer"
          >
            Prompt: {direction === "jp-en" ? "JP -> EN (Reading)" : "EN -> JP (Speaking)"}
          </button>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCardIdx(0);
            }}
            placeholder="Search word..."
            className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs"
          />
        </div>
      </div>

      {/* Active-Recall Flashcard Deck */}
      {activeCard && (
        <section className="max-w-2xl mx-auto rounded-lg border-2 border-stone-900 bg-white p-6">
          <div className="flex items-center justify-between text-xs text-stone-500 mono-label">
            <span>
              {activeCard.lessonId} · {activeCard.category}
            </span>
            <span>
              Card {(cardIdx % filteredVocab.length) + 1} / {filteredVocab.length}
            </span>
          </div>

          <div
            onClick={() => {
              setFlipped((f) => !f);
              speakJapanese(activeCard.kana.split("/")[0].trim(), slowAudio);
            }}
            className="mt-4 min-h-[160px] rounded-lg border border-stone-200 bg-stone-50 p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-stone-400"
          >
            {direction === "jp-en" ? (
              <>
                <div className="text-3xl font-semibold text-stone-900 leading-relaxed">
                  <SegmentsView segments={activeCard.segments} mode={mode} />
                </div>
                {mode === "bridge" && (
                  <div className="mono-label mt-1 text-xs text-stone-500">{activeCard.romaji}</div>
                )}
                {flipped ? (
                  <div className="mt-4 pt-3 border-t border-stone-200 text-base font-medium text-emerald-900">
                    {activeCard.en}
                    {activeCard.note && (
                      <div className="mt-1 text-xs text-amber-800">{activeCard.note}</div>
                    )}
                  </div>
                ) : (
                  <div className="mono-label mt-4 text-xs text-stone-400">
                    Click card to reveal meaning &amp; hear pronunciation
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="text-xl font-semibold text-stone-900">{activeCard.en}</div>
                {flipped ? (
                  <div className="mt-4 pt-3 border-t border-stone-200">
                    <div className="text-2xl font-semibold text-stone-900">
                      <SegmentsView segments={activeCard.segments} mode={mode} />
                    </div>
                    {mode === "bridge" && (
                      <div className="mono-label mt-1 text-xs text-stone-500">
                        {activeCard.romaji}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mono-label mt-4 text-xs text-stone-400">
                    Say the Japanese aloud, then click to verify
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-4 flex justify-between gap-3">
            <button
              type="button"
              onClick={() => speakJapanese(activeCard.kana.split("/")[0].trim(), slowAudio)}
              className="rounded border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Play Audio
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => gradeCard(false)}
                className="rounded border border-amber-400 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-100 cursor-pointer"
              >
                Still Shaky (Re-queue)
              </button>
              <button
                type="button"
                onClick={() => gradeCard(true)}
                className="rounded bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-700 cursor-pointer"
              >
                Got It Cold -&gt;
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Scannable Reference Sheet */}
      <section className="rounded-lg border border-stone-300 bg-white overflow-hidden">
        <div className="border-b border-stone-200 bg-stone-50 px-4 py-2.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase mono-label text-stone-600">
            Scannable Deck Reference ({filteredVocab.length} cards)
          </h3>
          <span className="mono-label text-xs text-stone-500">Click Play to hear native audio</span>
        </div>
        <div className="divide-y divide-stone-100">
          {filteredVocab.map((v) => {
            const m = classifyMastery(progress.items[v.id]);
            return (
              <div key={v.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-[210px]">
                  <span className="mono-label text-[11px] text-stone-400 mr-2">{v.lessonId}</span>
                  <span className="font-semibold text-stone-900">
                    <SegmentsView segments={v.segments} mode={mode} />
                  </span>
                  {mode === "bridge" && (
                    <span className="mono-label text-xs text-stone-500 ml-2">({v.romaji})</span>
                  )}
                </div>
                <div className="flex-1 text-xs text-stone-700">{v.en}</div>
                <div className="flex items-center gap-2">
                  <span
                    className={`mono-label rounded px-2 py-0.5 text-[10px] uppercase ${
                      m === "solid"
                        ? "bg-emerald-100 text-emerald-900"
                        : m === "shaky"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {m}
                  </span>
                  <button
                    type="button"
                    onClick={() => speakJapanese(v.kana.split("/")[0].trim(), slowAudio)}
                    className="mono-label rounded border border-stone-300 px-2 py-0.5 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
                  >
                    Play
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

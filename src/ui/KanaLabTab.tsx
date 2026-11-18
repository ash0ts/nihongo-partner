import { useMemo, useRef, useState } from "react";
import {
  CONTRAST_PAIRS,
  GOJUON_KANA,
  KATAKANA_LOANWORD_DRILLS,
  ORTHOGRAPHY_MECHANICS,
  VOICING_RULES,
} from "../content";
import type { KanaEntry } from "../content/schema";
import { speakJapanese } from "../engine/speech";
import { classifyMastery, type ProgressSnapshot } from "../engine/srs";

interface KanaLabTabProps {
  progress: ProgressSnapshot;
  slowAudio: boolean;
  onRecordReview: (id: string, category: "kana" | "vocab", isCorrect: boolean, ms: number) => void;
}

type KanaView = "matrix" | "contrasts" | "mechanics" | "quiz";
type QuizDeck = "hiragana" | "katakana" | "traps" | "loanwords";

const MATRIX_ROWS = [
  { key: "vowel", label: "∅ (Vowels)" },
  { key: "k", label: "K-row" },
  { key: "s", label: "S-row" },
  { key: "t", label: "T-row" },
  { key: "n", label: "N-row" },
  { key: "h", label: "H-row" },
  { key: "m", label: "M-row" },
  { key: "y", label: "Y-row" },
  { key: "r", label: "R-row" },
  { key: "w", label: "W-row" },
  { key: "n-final", label: "Final N" },
];

const COLS: Array<"a" | "i" | "u" | "e" | "o" | "n"> = ["a", "i", "u", "e", "o", "n"];

const TRAP_CHAR_SET = new Set([
  "シ",
  "ツ",
  "ソ",
  "ン",
  "は",
  "ほ",
  "さ",
  "き",
  "ね",
  "れ",
  "わ",
  "ぬ",
  "め",
  "る",
  "ろ",
  "ウ",
  "ワ",
  "フ",
  "マ",
  "ム",
  "ア",
  "ク",
  "ケ",
  "タ",
]);

export function KanaLabTab({ progress, slowAudio, onRecordReview }: KanaLabTabProps) {
  const [subView, setSubView] = useState<KanaView>("matrix");
  const [scriptFilter, setScriptFilter] = useState<"both" | "hiragana" | "katakana">("both");
  const [selectedKana, setSelectedKana] = useState<KanaEntry>(GOJUON_KANA[11]); // し/シ default

  // Active Speed Quiz state
  const [quizDeck, setQuizDeck] = useState<QuizDeck>("hiragana");
  const [quizIdx, setQuizIdx] = useState(0);
  const [typedGuess, setTypedGuess] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
  const promptShownAt = useRef<number>(Date.now());

  const quizItems = useMemo(() => {
    if (quizDeck === "loanwords") {
      return KATAKANA_LOANWORD_DRILLS.map((lw) => ({
        id: lw.id,
        category: "vocab" as const,
        promptGlyph: lw.jp,
        answerRomaji: lw.romaji,
        meaningNote: `${lw.en} (${lw.lesson})`,
        mnemonic: "Remember: ー extends the preceding vowel; read left-to-right aloud to hear the English loanword!",
      }));
    }
    if (quizDeck === "traps") {
      const items: Array<{
        id: string;
        category: "kana";
        promptGlyph: string;
        answerRomaji: string;
        meaningNote: string;
        mnemonic: string;
      }> = [];
      for (const k of GOJUON_KANA) {
        const cleanRomaji = k.romaji.split(" ")[0];
        if (TRAP_CHAR_SET.has(k.hiragana)) {
          items.push({
            id: k.id,
            category: "kana",
            promptGlyph: k.hiragana,
            answerRomaji: cleanRomaji,
            meaningNote: `Hiragana (${k.row}-row)`,
            mnemonic: k.hiraMnemonic,
          });
        }
        if (TRAP_CHAR_SET.has(k.katakana)) {
          items.push({
            id: k.id,
            category: "kana",
            promptGlyph: k.katakana,
            answerRomaji: cleanRomaji,
            meaningNote: `Katakana (${k.row}-row)`,
            mnemonic: k.kataMnemonic,
          });
        }
      }
      return items;
    }

    return GOJUON_KANA.map((k) => {
      const cleanRomaji = k.romaji.split(" ")[0];
      const isHira = quizDeck === "hiragana";
      return {
        id: k.id,
        category: "kana" as const,
        promptGlyph: isHira ? k.hiragana : k.katakana,
        answerRomaji: cleanRomaji,
        meaningNote: `${isHira ? "Hiragana" : "Katakana"} · pair: ${isHira ? k.katakana : k.hiragana}`,
        mnemonic: isHira ? k.hiraMnemonic : k.kataMnemonic,
      };
    });
  }, [quizDeck]);

  const currentPrompt = quizItems[quizIdx % quizItems.length];

  const multipleChoiceOptions = useMemo(() => {
    if (!currentPrompt) return [];
    const pool = Array.from(new Set(quizItems.map((i) => i.answerRomaji))).filter(
      (r) => r !== currentPrompt.answerRomaji,
    );
    // Deterministic pseudo-shuffle seeded by quizIdx + promptGlyph charCode
    const seed = quizIdx * 17 + currentPrompt.promptGlyph.charCodeAt(0);
    const distractors: string[] = [];
    for (let offset = 0; offset < pool.length && distractors.length < 3; offset += 1) {
      distractors.push(pool[(seed + offset * 7) % pool.length]);
    }
    const all = [...distractors, currentPrompt.answerRomaji];
    return all.sort((a, b) => ((a.charCodeAt(0) + seed) % 5) - ((b.charCodeAt(0) + seed) % 5));
  }, [currentPrompt, quizIdx, quizItems]);

  const submitQuizAnswer = (guessRaw: string) => {
    if (!currentPrompt) return;
    const elapsed = Date.now() - promptShownAt.current;
    const cleanGuess = guessRaw.trim().toLowerCase();
    const target = currentPrompt.answerRomaji.toLowerCase();
    const accepted =
      cleanGuess === target ||
      (target === "o" && cleanGuess === "wo") ||
      (target === "shi" && cleanGuess === "si") === false && cleanGuess === target;

    onRecordReview(currentPrompt.id, currentPrompt.category, accepted, elapsed);
    setSessionStats((s) => ({
      correct: s.correct + (accepted ? 1 : 0),
      total: s.total + 1,
    }));
    speakJapanese(currentPrompt.promptGlyph, slowAudio);

    if (accepted) {
      setFeedback({
        ok: true,
        msg: `Correct (${(elapsed / 1000).toFixed(1)}s): ${currentPrompt.promptGlyph} = ${currentPrompt.answerRomaji} · ${currentPrompt.meaningNote}`,
      });
      setTypedGuess("");
      window.setTimeout(() => {
        setFeedback(null);
        setQuizIdx((i) => i + 1);
        promptShownAt.current = Date.now();
      }, 650);
    } else {
      setFeedback({
        ok: false,
        msg: `Not quite — ${currentPrompt.promptGlyph} is "${currentPrompt.answerRomaji}" (${currentPrompt.meaningNote}). Hint: ${currentPrompt.mnemonic}`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["matrix", "1. 5x10 Soundboard & Mnemonics"],
              ["contrasts", "2. Lookalike Contrast Pairs (10 Traps)"],
              ["mechanics", "3. Voicing (゛/゜), Glides & Long Vowels"],
              ["quiz", "4. Timed Recognition Speed Drill"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSubView(key);
                promptShownAt.current = Date.now();
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${
                subView === key
                  ? "bg-stone-900 text-white"
                  : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {subView === "matrix" && (
          <div className="flex gap-1.5">
            {(["both", "hiragana", "katakana"] as const).map((sc) => (
              <button
                key={sc}
                type="button"
                onClick={() => setScriptFilter(sc)}
                className={`mono-label rounded px-2.5 py-1 text-xs capitalize cursor-pointer ${
                  scriptFilter === sc
                    ? "bg-amber-900 text-white"
                    : "border border-stone-300 bg-white text-stone-600"
                }`}
              >
                {sc}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 1. 5x10 Coordinate Matrix + Inspector */}
      {subView === "matrix" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="rounded-lg border border-stone-300 bg-white p-4 overflow-x-auto">
            <div className="mb-3 flex items-center justify-between text-xs text-stone-600">
              <span>Click any tile to hear native pronunciation &amp; view both mnemonics.</span>
              <span className="mono-label">Green = Solid · Amber = Shaky</span>
            </div>
            <table className="w-full border-collapse text-center">
              <thead>
                <tr className="border-b border-stone-200 mono-label text-xs text-stone-500">
                  <th className="py-1.5 px-2 text-left">Row</th>
                  {COLS.map((c) => (
                    <th key={c} className="py-1.5 px-2 uppercase">
                      -{c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX_ROWS.map((r) => (
                  <tr key={r.key} className="border-b border-stone-100">
                    <td className="py-2 px-2 text-left mono-label text-xs font-medium text-stone-600 whitespace-nowrap">
                      {r.label}
                    </td>
                    {COLS.map((c) => {
                      const entry = GOJUON_KANA.find((k) => k.row === r.key && k.col === c);
                      if (!entry) {
                        return <td key={c} className="py-2 px-1 bg-stone-50/60" />;
                      }
                      const mastery = classifyMastery(progress.items[entry.id]);
                      const isSelected = selectedKana.id === entry.id;
                      const badgeCls =
                        mastery === "solid"
                          ? "border-emerald-400 bg-emerald-50/60"
                          : mastery === "shaky"
                            ? "border-amber-400 bg-amber-50/70"
                            : "border-stone-200 bg-white hover:border-stone-400";

                      return (
                        <td key={c} className="p-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedKana(entry);
                              speakJapanese(entry.hiragana, slowAudio);
                            }}
                            className={`w-full rounded border px-2 py-1.5 transition cursor-pointer ${badgeCls} ${
                              isSelected ? "ring-2 ring-stone-900" : ""
                            }`}
                          >
                            <div className="jp-text text-lg font-semibold text-stone-900 leading-tight">
                              {scriptFilter === "hiragana" && entry.hiragana}
                              {scriptFilter === "katakana" && entry.katakana}
                              {scriptFilter === "both" && (
                                <span>
                                  {entry.hiragana}
                                  <span className="text-stone-400 mx-0.5 text-sm">/</span>
                                  {entry.katakana}
                                </span>
                              )}
                            </div>
                            <div className="mono-label text-[11px] text-stone-500 mt-0.5">
                              {entry.romaji}
                            </div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Selected Character Inspector */}
          <aside className="rounded-lg border border-stone-300 bg-white p-5 self-start sticky top-24">
            <div className="flex items-center justify-between">
              <span className="mono-label text-xs uppercase text-stone-500">
                {selectedKana.row}-row · -{selectedKana.col}
              </span>
              <button
                type="button"
                onClick={() => speakJapanese(selectedKana.hiragana, slowAudio)}
                className="mono-label rounded bg-stone-900 px-3 py-1 text-xs text-white hover:bg-stone-700 cursor-pointer"
              >
                Speak &ldquo;{selectedKana.romaji}&rdquo;
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                <div className="mono-label text-[11px] text-stone-500">Hiragana (L1)</div>
                <div className="jp-text mt-1 text-5xl font-semibold text-stone-900">
                  {selectedKana.hiragana}
                </div>
              </div>
              <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                <div className="mono-label text-[11px] text-stone-500">Katakana (L2)</div>
                <div className="jp-text mt-1 text-5xl font-semibold text-stone-900">
                  {selectedKana.katakana}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="mono-label text-xs font-semibold text-stone-700">
                  Hiragana Memory Hook
                </div>
                <p className="mt-0.5 text-stone-700">{selectedKana.hiraMnemonic}</p>
              </div>
              <div>
                <div className="mono-label text-xs font-semibold text-stone-700">
                  Katakana Memory Hook
                </div>
                <p className="mt-0.5 text-stone-700">{selectedKana.kataMnemonic}</p>
              </div>
              {selectedKana.irregularNote && (
                <div className="rounded border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950">
                  <strong>Phonetic / Particle Rule:</strong> {selectedKana.irregularNote}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* 2. Lookalike Contrast Pairs */}
      {subView === "contrasts" && (
        <div className="grid gap-4 md:grid-cols-2">
          {CONTRAST_PAIRS.map((pair) => (
            <div key={pair.id} className="rounded-lg border border-stone-300 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="mono-label text-xs uppercase text-amber-800 font-semibold">
                  {pair.script} contrast
                </span>
                <span className="text-xs font-semibold text-stone-900">{pair.title}</span>
              </div>

              <div className="mt-3 flex justify-center gap-4">
                {pair.chars.map((ch, idx) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => speakJapanese(ch, slowAudio)}
                    className="flex-1 rounded-md border border-stone-200 bg-stone-50 py-3 px-4 text-center hover:border-stone-400 cursor-pointer"
                  >
                    <div className="jp-text text-4xl font-semibold text-stone-900">{ch}</div>
                    <div className="mono-label mt-1 text-xs font-semibold text-stone-700">
                      {pair.romaji[idx]}
                    </div>
                  </button>
                ))}
              </div>

              <p className="mt-3 text-xs text-stone-700 leading-relaxed">{pair.visualRule}</p>

              <div className="mt-3 pt-2.5 border-t border-stone-200 flex flex-wrap gap-2">
                {pair.drillWords.map((w) => (
                  <button
                    key={w.jp}
                    type="button"
                    onClick={() => speakJapanese(w.jp, slowAudio)}
                    className="rounded border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-stone-800 hover:bg-stone-100 cursor-pointer"
                  >
                    <span className="jp-text font-semibold">{w.jp}</span>{" "}
                    <span className="mono-label text-stone-500">({w.romaji})</span> · {w.en}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Voicing & Orthography Mechanics */}
      {subView === "mechanics" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-stone-300 bg-white p-5">
            <h3 className="text-base font-semibold text-stone-900">
              Learn 4 Voicing Transformations Instead of Memorizing 25 Extra Characters
            </h3>
            <p className="mt-1 text-xs text-stone-600">
              Adding two dots (dakuten ゛) vibrates your vocal cords; adding a small circle (handakuten ゜) on the H-row turns it into a popping P.
            </p>
            <div className="mt-4 space-y-3">
              {VOICING_RULES.map((rule) => (
                <div key={rule.baseRow} className="rounded border border-stone-200 bg-stone-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-stone-900">
                      {rule.baseRow} + {rule.mark}
                    </span>
                    <span className="mono-label text-xs text-amber-900 font-semibold">
                      {rule.shift}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {rule.pairs.map((p) => (
                      <button
                        key={p.romaji}
                        type="button"
                        onClick={() => speakJapanese(p.voicedHira, slowAudio)}
                        className="rounded border border-stone-200 bg-white p-2 text-center hover:border-stone-400 cursor-pointer"
                      >
                        <div className="jp-text text-base font-semibold text-stone-900">
                          {p.voicedHira} / {p.voicedKata}
                        </div>
                        <div className="mono-label text-[11px] text-stone-600">{p.romaji}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {ORTHOGRAPHY_MECHANICS.map((m) => (
              <div key={m.id} className="rounded-lg border border-stone-300 bg-white p-4">
                <h4 className="font-semibold text-sm text-stone-900">{m.title}</h4>
                <p className="mt-1.5 text-xs text-stone-700 leading-relaxed">{m.rule}</p>
                <div className="mt-2 rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-950">
                  <strong>Trap:</strong> {m.trap}
                </div>
                <div className="mt-3 space-y-1.5">
                  {m.examples.map((ex) => (
                    <button
                      key={ex.jp}
                      type="button"
                      onClick={() => speakJapanese(ex.jp, slowAudio)}
                      className="w-full text-left rounded border border-stone-200 px-2.5 py-1.5 text-xs hover:bg-stone-50 cursor-pointer"
                    >
                      <span className="jp-text font-semibold text-stone-900">{ex.jp}</span>{" "}
                      <span className="mono-label text-stone-500">({ex.romaji})</span> — {ex.en}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Timed Active Recognition Quiz */}
      {subView === "quiz" && currentPrompt && (
        <div className="max-w-xl mx-auto rounded-lg border border-stone-300 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["hiragana", "Hiragana (46)"],
                  ["katakana", "Katakana (46)"],
                  ["traps", "Lookalike Traps"],
                  ["loanwords", "L1-L2 Katakana Words"],
                ] as const
              ).map(([dk, label]) => (
                <button
                  key={dk}
                  type="button"
                  onClick={() => {
                    setQuizDeck(dk);
                    setQuizIdx(0);
                    setFeedback(null);
                    setTypedGuess("");
                    promptShownAt.current = Date.now();
                  }}
                  className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    quizDeck === dk
                      ? "bg-stone-900 text-white"
                      : "border border-stone-300 bg-stone-50 text-stone-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="mono-label text-xs text-stone-600">
              Session: {sessionStats.correct}/{sessionStats.total}
            </span>
          </div>

          <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50 py-8 px-4 text-center">
            <div className="mono-label text-xs text-stone-500">Read this aloud &amp; enter romaji</div>
            <div className="jp-text mt-2 text-6xl font-semibold text-stone-900">
              {currentPrompt.promptGlyph}
            </div>
          </div>

          {/* 4 Quick-Tap Options */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {multipleChoiceOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => submitQuizAnswer(opt)}
                className="mono-label rounded border border-stone-300 bg-white py-2.5 px-3 text-sm font-semibold text-stone-900 hover:border-stone-900 hover:bg-stone-50 cursor-pointer"
              >
                {opt}
              </button>
            ))}
          </div>

          {/* Direct Keyboard Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typedGuess.trim()) submitQuizAnswer(typedGuess);
            }}
            className="mt-3 flex gap-2"
          >
            <input
              type="text"
              value={typedGuess}
              onChange={(e) => setTypedGuess(e.target.value)}
              placeholder="Or type romaji & press Enter (faster recall)..."
              className="mono-label flex-1 rounded border border-stone-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700 cursor-pointer"
            >
              Check
            </button>
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setTypedGuess("");
                setQuizIdx((i) => i + 1);
                promptShownAt.current = Date.now();
              }}
              className="rounded border border-stone-300 px-3 py-2 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Next -&gt;
            </button>
          </form>

          {feedback && (
            <div
              className={`mt-4 rounded border p-3 text-xs leading-relaxed ${
                feedback.ok
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              {feedback.msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

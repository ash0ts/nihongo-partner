import { useMemo, useRef, useState } from "react";
import { ALL_CLOZE, LESSONS } from "../content";
import type { DisplayMode } from "../content/schema";
import { isAnswerAccepted } from "../engine/romaji-kana";
import { speakJapanese } from "../engine/speech";
import { classifyMastery, type ProgressSnapshot } from "../engine/srs";
import { JapaneseLineView, SegmentsView } from "./RubyText";

interface GrammarTabProps {
  progress: ProgressSnapshot;
  mode: DisplayMode;
  slowAudio: boolean;
  onRecordReview: (id: string, category: "grammar", isCorrect: boolean, ms: number) => void;
}

interface KosoadoCell {
  prefix: "ko" | "so" | "a" | "do";
  zoneLabel: string;
  standalone: { word: string; romaji: string; sampleJp: string; sampleEn: string };
  preNoun: { word: string; romaji: string; sampleJp: string; sampleEn: string };
  location: { word: string; romaji: string; sampleJp: string; sampleEn: string; irregular?: boolean };
}

const KOSOADO_ROWS: KosoadoCell[] = [
  {
    prefix: "ko",
    zoneLabel: "こ-series · Near Speaker (Me)",
    standalone: {
      word: "これ",
      romaji: "kore",
      sampleJp: "これは いくらですか。",
      sampleEn: "How much is this one (in my hand)?",
    },
    preNoun: {
      word: "この + N",
      romaji: "kono + N",
      sampleJp: "このスマホは わたしのです。",
      sampleEn: "This smartphone is mine.",
    },
    location: {
      word: "ここ",
      romaji: "koko",
      sampleJp: "きょうしつは ここです。",
      sampleEn: "The classroom is right here.",
    },
  },
  {
    prefix: "so",
    zoneLabel: "そ-series · Near Listener (You)",
    standalone: {
      word: "それ",
      romaji: "sore",
      sampleJp: "それを ください。",
      sampleEn: "Please give me that one (near you).",
    },
    preNoun: {
      word: "その + N",
      romaji: "sono + N",
      sampleJp: "そのかさは いくらですか。",
      sampleEn: "How much is that umbrella (next to you)?",
    },
    location: {
      word: "そこ",
      romaji: "soko",
      sampleJp: "ぎんこうは そこです。",
      sampleEn: "The bank is right there (near you).",
    },
  },
  {
    prefix: "a",
    zoneLabel: "あ-series · Far From Both",
    standalone: {
      word: "あれ",
      romaji: "are",
      sampleJp: "あれは なんですか。",
      sampleEn: "What is that thing over there?",
    },
    preNoun: {
      word: "あの + N",
      romaji: "ano + N",
      sampleJp: "あのひとは やましたせんせいです。",
      sampleEn: "That person over there is Prof. Yamashita.",
    },
    location: {
      word: "あそこ",
      romaji: "asoko",
      sampleJp: "トイレは あそこです。",
      sampleEn: "The restroom is over there. (IRREGULAR: あそこ, not あこ!)",
      irregular: true,
    },
  },
  {
    prefix: "do",
    zoneLabel: "ど-series · Question (3+ items / Where)",
    standalone: {
      word: "どれ",
      romaji: "dore",
      sampleJp: "あなたのペンは どれですか。",
      sampleEn: "Which one (of 3+) is your pen? (Never どれは!)",
    },
    preNoun: {
      word: "どの + N",
      romaji: "dono + N",
      sampleJp: "どのほんが いいですか。",
      sampleEn: "Which book is good?",
    },
    location: {
      word: "どこ",
      romaji: "doko",
      sampleJp: "としょかんは どこですか。",
      sampleEn: "Where is the library?",
    },
  },
];

export function GrammarTab({ progress, mode, slowAudio, onRecordReview }: GrammarTabProps) {
  const [lessonFilter, setLessonFilter] = useState<string>("all");
  const [selectedKosoado, setSelectedKosoado] = useState<{
    word: string;
    sampleJp: string;
    sampleEn: string;
  }>({
    word: "この + N",
    sampleJp: "このスマホは わたしのです。",
    sampleEn: "This smartphone is mine. (この MUST be followed immediately by a noun!)",
  });

  // Cloze drill runner state
  const [clozeFilter, setClozeFilter] = useState<string>("all");
  const [clozeIdx, setClozeIdx] = useState(0);
  const [typedCloze, setTypedCloze] = useState("");
  const [clozeFeedback, setClozeFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const shownAt = useRef<number>(Date.now());

  const visibleLessons = useMemo(
    () => (lessonFilter === "all" ? LESSONS : LESSONS.filter((l) => l.id === lessonFilter)),
    [lessonFilter],
  );

  const clozePool = useMemo(() => {
    if (clozeFilter === "shaky") {
      const shaky = ALL_CLOZE.filter((c) => classifyMastery(progress.items[c.id]) === "shaky");
      return shaky.length > 0 ? shaky : ALL_CLOZE;
    }
    return clozeFilter === "all" ? ALL_CLOZE : ALL_CLOZE.filter((c) => c.lessonId === clozeFilter);
  }, [clozeFilter, progress.items]);

  const currentCloze = clozePool[clozeIdx % clozePool.length];

  const handleClozeAnswer = (rawChoice: string) => {
    if (!currentCloze) return;
    const elapsed = Date.now() - shownAt.current;
    const ok = isAnswerAccepted(rawChoice, currentCloze.acceptedAnswers);
    onRecordReview(currentCloze.id, "grammar", ok, elapsed);

    const fullSpoken = [
      ...currentCloze.beforeSegments.map((s) => s.furigana || s.text),
      currentCloze.blankAnswerKana,
      ...currentCloze.afterSegments.map((s) => s.furigana || s.text),
    ].join("");
    speakJapanese(fullSpoken, slowAudio);

    if (ok) {
      setClozeFeedback({
        ok: true,
        msg: `Correct: [${currentCloze.blankAnswerKana}] — ${currentCloze.explanation}`,
      });
      setTypedCloze("");
    } else {
      setClozeFeedback({
        ok: false,
        msg: `Expected [${currentCloze.blankAnswerKana}]. ${currentCloze.explanation}${
          currentCloze.trapWarning ? ` (${currentCloze.trapWarning})` : ""
        }`,
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Japanese SOV + Particle Mental Model Diagram */}
      <section className="rounded-lg border border-stone-300 bg-white p-5">
        <div className="mono-label text-xs uppercase tracking-wider text-stone-500">
          Syntax Architecture · Postpositional Slot Engine
        </div>
        <h2 className="mt-1 text-lg font-semibold text-stone-900">
          How Japanese Sentences Wire Together (Lessons 1-2 Copula -&gt; Lesson 3 Verbs)
        </h2>
        <p className="mt-1 text-xs text-stone-600">
          Every particle attaches AFTER the noun it tags (like a postfix type annotation). The copula{" "}
          <code className="mono-label bg-stone-100 px-1 rounded">です</code> or verb{" "}
          <code className="mono-label bg-stone-100 px-1 rounded">〜ます</code> ALWAYS locks the very end of the clause.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <div className="rounded border border-stone-300 bg-stone-50 p-3">
            <div className="mono-label text-[11px] font-semibold text-stone-500">
              1. TOPIC SLOT (Optional!)
            </div>
            <div className="jp-text mt-1 text-base font-semibold text-stone-900">
              [Topic] + は / も
            </div>
            <p className="mt-1 text-xs text-stone-600">
              Omit whenever obvious! <code className="jp-text">は</code> (pronounced wa) sets topic;{" "}
              <code className="jp-text">も</code> (&ldquo;also&rdquo;) replaces <code className="jp-text">は</code>.
            </p>
          </div>
          <div className="rounded border border-stone-300 bg-stone-50 p-3">
            <div className="mono-label text-[11px] font-semibold text-stone-500">
              2. RIGHT-HEADED NOUN CHAIN
            </div>
            <div className="jp-text mt-1 text-base font-semibold text-stone-900">
              [Modifier] の [Head]
            </div>
            <p className="mt-1 text-xs text-stone-600">
              Scope narrows left-to-right:{" "}
              <span className="jp-text">さくらだいがくの がくせい</span> (Sakura Univ&apos;s student).
            </p>
          </div>
          <div className="rounded border border-stone-300 bg-stone-50 p-3">
            <div className="mono-label text-[11px] font-semibold text-stone-500">
              3. FINAL PREDICATE LOCK
            </div>
            <div className="jp-text mt-1 text-base font-semibold text-stone-900">
              です / じゃないです
            </div>
            <p className="mt-1 text-xs text-stone-600">
              Affirmative <span className="jp-text">です</span>; polite negative{" "}
              <span className="jp-text">じゃないです</span>. (Tonight in L3: <span className="jp-text">〜ます / 〜ません</span>).
            </p>
          </div>
          <div className="rounded border border-stone-300 bg-stone-50 p-3">
            <div className="mono-label text-[11px] font-semibold text-stone-500">
              4. SENTENCE MOOD FLAG
            </div>
            <div className="jp-text mt-1 text-base font-semibold text-stone-900">
              + か / ね / よ
            </div>
            <p className="mt-1 text-xs text-stone-600">
              <span className="jp-text">か</span> = question (no word swap!);{" "}
              <span className="jp-text">ね</span> = &ldquo;right?&rdquo;; <span className="jp-text">よ</span> = new info!
            </p>
          </div>
        </div>
      </section>

      {/* 2. Interactive Bunpro-Style Cloze Drill Runner */}
      {currentCloze && (
        <section className="rounded-lg border-2 border-stone-900 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="mono-label text-xs uppercase font-semibold text-amber-800">
                Active Recall · Particle &amp; Copula Cloze Drill
              </span>
              <h3 className="text-base font-semibold text-stone-900">
                Fill the exact grammatical slot ({clozeIdx + 1} of {clozePool.length})
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All (L0-L4)"],
                  ["L00", "L0"],
                  ["L01", "L1"],
                  ["L02", "L2"],
                  ["L03", "L3 Bridge"],
                  ["shaky", "Shaky Queue"],
                ] as const
              ).map(([fid, label]) => (
                <button
                  key={fid}
                  type="button"
                  onClick={() => {
                    setClozeFilter(fid);
                    setClozeIdx(0);
                    setClozeFeedback(null);
                    shownAt.current = Date.now();
                  }}
                  className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    clozeFilter === fid
                      ? "bg-stone-900 text-white"
                      : "border border-stone-300 bg-stone-50 text-stone-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-4">
            <div className="text-xs font-medium text-stone-600">{currentCloze.promptEn}</div>
            <div className="mt-2 text-xl font-semibold text-stone-900 leading-relaxed">
              <SegmentsView segments={currentCloze.beforeSegments} mode={mode} />
              <span className="mx-1.5 inline-block min-w-[72px] border-b-2 border-amber-700 bg-amber-50 px-2 py-0.5 text-center jp-text text-amber-950">
                {clozeFeedback ? currentCloze.blankAnswerKana : "＿＿＿"}
              </span>
              <SegmentsView segments={currentCloze.afterSegments} mode={mode} />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {currentCloze.options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleClozeAnswer(opt)}
                className="jp-text rounded border border-stone-300 bg-white py-2 px-3 text-base font-semibold text-stone-900 hover:border-stone-900 hover:bg-stone-50 cursor-pointer"
              >
                {opt}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typedCloze.trim()) handleClozeAnswer(typedCloze);
            }}
            className="mt-3 flex gap-2"
          >
            <input
              type="text"
              value={typedCloze}
              onChange={(e) => setTypedCloze(e.target.value)}
              placeholder="Or type kana / romaji (e.g. kono, asoko, janai desu) & press Enter..."
              className="flex-1 rounded border border-stone-300 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded bg-stone-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-stone-700 cursor-pointer"
            >
              Check
            </button>
            <button
              type="button"
              onClick={() => {
                setClozeFeedback(null);
                setTypedCloze("");
                setClozeIdx((i) => i + 1);
                shownAt.current = Date.now();
              }}
              className="rounded border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Next Prompt -&gt;
            </button>
          </form>

          {clozeFeedback && (
            <div
              className={`mt-3 rounded border p-3 text-xs leading-relaxed ${
                clozeFeedback.ok
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              {clozeFeedback.msg}
            </div>
          )}
        </section>
      )}

      {/* 3. Interactive 4x3 Ko-So-A-Do Spatial Matrix */}
      <section className="rounded-lg border border-stone-300 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="mono-label text-xs uppercase text-stone-500">
              Lesson 2 Centerpiece · Click Any Cell to Hear &amp; Inspect
            </div>
            <h3 className="text-base font-semibold text-stone-900">
              The 4x3 こそあど (Ko-So-A-Do) Spatial Pointer Grid
            </h3>
          </div>
          <div className="rounded border border-stone-200 bg-stone-50 px-3 py-2 text-xs">
            <span className="jp-text font-semibold text-stone-900">{selectedKosoado.sampleJp}</span>{" "}
            — <span className="text-stone-600">{selectedKosoado.sampleEn}</span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 mono-label text-xs text-stone-500">
                <th className="py-2 px-3">Spatial Distance</th>
                <th className="py-2 px-3">Standalone Noun (NEVER + Noun)</th>
                <th className="py-2 px-3">Pre-Noun Modifier (MUST + Noun)</th>
                <th className="py-2 px-3">Location (Place)</th>
              </tr>
            </thead>
            <tbody>
              {KOSOADO_ROWS.map((row) => (
                <tr key={row.prefix} className="border-b border-stone-100">
                  <td className="py-2.5 px-3 text-xs font-semibold text-stone-700">
                    {row.zoneLabel}
                  </td>
                  {[row.standalone, row.preNoun, row.location].map((cell) => {
                    const isIrreg = "irregular" in cell && cell.irregular;
                    return (
                      <td key={cell.word} className="p-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKosoado({
                              word: cell.word,
                              sampleJp: cell.sampleJp,
                              sampleEn: cell.sampleEn,
                            });
                            speakJapanese(cell.sampleJp, slowAudio);
                          }}
                          className={`w-full text-left rounded border p-2.5 transition cursor-pointer ${
                            isIrreg
                              ? "border-amber-400 bg-amber-50/70 hover:border-amber-600"
                              : "border-stone-200 bg-stone-50/50 hover:border-stone-500 hover:bg-white"
                          }`}
                        >
                          <div className="jp-text font-semibold text-base text-stone-900">
                            {cell.word}
                          </div>
                          {mode === "bridge" && (
                            <div className="mono-label text-[11px] text-stone-500">{cell.romaji}</div>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Complete Grammar Reference Cards by Lesson */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-stone-900">
            Lesson-by-Lesson Grammar Formulas, Traps &amp; Audio Examples
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {[["all", "All Lessons"], ...LESSONS.map((l) => [l.id, `${l.id}: ${l.title.split(":")[0]}`])].map(
              ([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLessonFilter(id)}
                  className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    lessonFilter === id
                      ? "bg-stone-900 text-white"
                      : "border border-stone-300 bg-white text-stone-700"
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        {visibleLessons.map((lesson) => (
          <div key={lesson.id} className="space-y-3">
            <div className="flex items-center gap-2 pt-2">
              <span className="mono-label rounded bg-stone-900 px-2 py-0.5 text-xs font-semibold text-white">
                {lesson.id}
              </span>
              <h4 className="font-semibold text-stone-900">{lesson.title}</h4>
              {lesson.status === "bridge" && (
                <span className="mono-label rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">
                  Tonight&apos;s Class Bridge (No Romaji Policy)
                </span>
              )}
            </div>

            {lesson.grammar.map((g) => (
              <div key={g.id} className="rounded-lg border border-stone-300 bg-white p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h5 className="text-base font-semibold text-stone-900">
                    <span className="mono-label text-xs text-stone-500 mr-2">{g.code}</span>
                    {g.title}
                  </h5>
                  <code className="jp-text rounded bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-900">
                    {g.formula}
                  </code>
                </div>
                <p className="mt-2 text-sm text-stone-700 leading-relaxed">{g.summary}</p>
                <p className="mt-1.5 text-xs text-stone-600">
                  <strong>Systems Mental Model:</strong> {g.mentalModel}
                </p>

                <div className="mt-3 rounded border border-amber-200 bg-amber-50/70 p-3">
                  <div className="mono-label text-[11px] font-semibold uppercase text-amber-900">
                    Exam &amp; Classroom Traps
                  </div>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5 text-xs text-amber-950">
                    {g.traps.map((t, idx) => (
                      <li key={idx}>{t}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 divide-y divide-stone-100 border-t border-stone-200 pt-2">
                  {g.examples.map((ex, idx) => (
                    <JapaneseLineView
                      key={idx}
                      line={ex}
                      mode={lesson.romajiPolicy === "no-romaji" && mode === "bridge" ? "classroom" : mode}
                      slowAudio={slowAudio}
                      compact
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

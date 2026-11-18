import { useMemo, useRef, useState } from "react";
import type { DisplayMode } from "../content/schema";
import {
  type CounterDrillKind,
  getCuratedCounterDrills,
  spellAge,
  spellClockTime,
  spellSchoolYear,
  spellYen,
} from "../engine/numbers";
import { isAnswerAccepted } from "../engine/romaji-kana";
import { speakJapanese } from "../engine/speech";

interface NumbersTabProps {
  mode: DisplayMode;
  slowAudio: boolean;
  onRecordReview: (id: string, category: "counter", isCorrect: boolean, ms: number) => void;
}

export function NumbersTab({ mode, slowAudio, onRecordReview }: NumbersTabProps) {
  // Interactive Sandbox state
  const [yenInput, setYenInput] = useState(38600);
  const [clockHour, setClockHour] = useState(4);
  const [clockMin, setClockMin] = useState(30);
  const [clockPeriod, setClockPeriod] = useState<"am" | "pm" | "none">("pm");
  const [ageInput, setAgeInput] = useState(20);
  const [yearInput, setYearInput] = useState(4);

  // Rapid-Fire Counter Quiz state
  const [drillFilter, setDrillFilter] = useState<CounterDrillKind | "all">("all");
  const [drillIdx, setDrillIdx] = useState(0);
  const [typedReading, setTypedReading] = useState("");
  const [quizFeedback, setQuizFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const shownAt = useRef<number>(Date.now());

  const yenResult = useMemo(
    () => spellYen(Math.max(0, Math.min(99_999_999, Math.floor(yenInput || 0)))),
    [yenInput],
  );
  const clockResult = useMemo(
    () => spellClockTime(clockHour, clockMin, clockPeriod === "none" ? undefined : clockPeriod),
    [clockHour, clockMin, clockPeriod],
  );
  const ageResult = useMemo(
    () => spellAge(Math.max(1, Math.min(99, Math.floor(ageInput || 1)))),
    [ageInput],
  );
  const yearResult = useMemo(() => spellSchoolYear(yearInput), [yearInput]);

  const drillPool = useMemo(() => getCuratedCounterDrills(drillFilter), [drillFilter]);
  const currentDrill = drillPool[drillIdx % drillPool.length];

  const checkDrill = (guess: string) => {
    if (!currentDrill) return;
    const elapsed = Date.now() - shownAt.current;
    const ok = isAnswerAccepted(
      guess,
      currentDrill.solution.acceptedKana,
      currentDrill.solution.acceptedRomaji,
    );
    onRecordReview(currentDrill.id, "counter", ok, elapsed);
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    speakJapanese(currentDrill.solution.kana, slowAudio);

    if (ok) {
      setQuizFeedback({
        ok: true,
        msg: `Correct! ${currentDrill.solution.promptLabel} = ${currentDrill.solution.kana} (${currentDrill.solution.romaji})`,
      });
      setTypedReading("");
    } else {
      setQuizFeedback({
        ok: false,
        msg: `Trap alert: ${currentDrill.solution.promptLabel} is ${currentDrill.solution.kana} (${currentDrill.solution.romaji}). ${currentDrill.solution.mutations.join(" · ")}`,
      });
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Rapid-Fire Trap-Weighted Counter Quiz */}
      {currentDrill && (
        <section className="rounded-lg border-2 border-stone-900 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="mono-label text-xs uppercase font-semibold text-amber-800">
                Hour 4 Exit Gate · Trap-Weighted Counter Quiz
              </span>
              <h2 className="text-base font-semibold text-stone-900">
                Spell the exact reading in Kana or Romaji (Session: {score.right}/{score.total})
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All Traps (20)"],
                  ["time", "Clock Time"],
                  ["yen", "Shopping Prices (¥)"],
                  ["age", "Age (〜さい)"],
                  ["schoolYear", "School Year"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setDrillFilter(k);
                    setDrillIdx(0);
                    setQuizFeedback(null);
                    setTypedReading("");
                    shownAt.current = Date.now();
                  }}
                  className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    drillFilter === k
                      ? "bg-stone-900 text-white"
                      : "border border-stone-300 bg-stone-50 text-stone-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mono-label text-xs text-stone-500">{currentDrill.categoryLabel}</div>
              <div className="jp-text mt-1 text-base text-stone-700">{currentDrill.jpQuestion}</div>
            </div>
            <div className="mono-label text-3xl font-bold text-stone-900">
              {currentDrill.questionPrompt}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (typedReading.trim()) checkDrill(typedReading);
            }}
            className="mt-3 flex flex-wrap gap-2"
          >
            <input
              type="text"
              value={typedReading}
              onChange={(e) => setTypedReading(e.target.value)}
              placeholder="Type kana or romaji (e.g. yoji, hatachi, sanman hassen en)..."
              className="mono-label flex-1 min-w-[240px] rounded border border-stone-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700 cursor-pointer"
            >
              Check Reading
            </button>
            <button
              type="button"
              onClick={() => checkDrill("__reveal__")}
              className="rounded border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
            >
              Reveal &amp; Speak
            </button>
            <button
              type="button"
              onClick={() => {
                setQuizFeedback(null);
                setTypedReading("");
                setDrillIdx((i) => i + 1);
                shownAt.current = Date.now();
              }}
              className="rounded border border-stone-300 bg-stone-100 px-3 py-2 text-xs font-medium text-stone-800 hover:bg-stone-200 cursor-pointer"
            >
              Next -&gt;
            </button>
          </form>

          {quizFeedback && (
            <div
              className={`mt-3 rounded border p-3 text-xs leading-relaxed ${
                quizFeedback.ok
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              {quizFeedback.msg}
            </div>
          )}
        </section>
      )}

      {/* 2. Interactive Live Solver Sandbox */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Yen & 10^4 Man Converter */}
        <div className="rounded-lg border border-stone-300 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-900">
              Live Yen &amp; 10<sup>4</sup> まん Price Solver (Lesson 2)
            </h3>
            <button
              type="button"
              onClick={() => speakJapanese(yenResult.kana, slowAudio)}
              className="mono-label rounded bg-stone-900 px-2.5 py-1 text-xs text-white cursor-pointer"
            >
              Speak Price
            </button>
          </div>
          <p className="mt-1 text-xs text-stone-600">
            English groups commas every 3 zeros (thousands); Japanese groups every{" "}
            <strong>4 zeros (まん = 10,000)</strong>.
          </p>
          <input
            type="number"
            min={0}
            max={99999999}
            value={yenInput}
            onChange={(e) => setYenInput(Number(e.target.value))}
            className="mono-label mt-3 w-full rounded border border-stone-300 px-3 py-1.5 text-base font-semibold"
          />
          <div className="mt-3 rounded border border-stone-200 bg-stone-50 p-3">
            <div className="jp-text text-xl font-semibold text-stone-900">{yenResult.kana}</div>
            {mode === "bridge" && (
              <div className="mono-label text-xs text-stone-600 mt-0.5">{yenResult.romaji}</div>
            )}
            <div className="mono-label text-xs text-stone-500 mt-1">{yenResult.breakdown}</div>
            {yenResult.mutations.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {yenResult.mutations.map((m, idx) => (
                  <li key={idx}>• {m}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Clock, Age & School Year Solver */}
        <div className="rounded-lg border border-stone-300 bg-white p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">
                Live Clock Solver (ごぜん/ごご + 〜じ + 〜ふん/ぷん)
              </h3>
              <button
                type="button"
                onClick={() => speakJapanese(clockResult.kana, slowAudio)}
                className="mono-label rounded bg-stone-900 px-2.5 py-1 text-xs text-white cursor-pointer"
              >
                Speak Time
              </button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <select
                value={clockHour}
                onChange={(e) => setClockHour(Number(e.target.value))}
                className="mono-label rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                  <option key={h} value={h}>
                    {h} hr
                  </option>
                ))}
              </select>
              <select
                value={clockMin}
                onChange={(e) => setClockMin(Number(e.target.value))}
                className="mono-label rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30, 45].map((m) => (
                  <option key={m} value={m}>
                    :{String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <select
                value={clockPeriod}
                onChange={(e) => setClockPeriod(e.target.value as "am" | "pm" | "none")}
                className="mono-label rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="pm">PM (ごご)</option>
                <option value="am">AM (ごぜん)</option>
                <option value="none">No AM/PM</option>
              </select>
            </div>
            <div className="mt-2 rounded border border-stone-200 bg-stone-50 p-2.5">
              <span className="jp-text text-lg font-semibold text-stone-900">{clockResult.kana}</span>
              {mode === "bridge" && (
                <span className="mono-label ml-2 text-xs text-stone-600">({clockResult.romaji})</span>
              )}
              {clockResult.mutations.map((m, idx) => (
                <div key={idx} className="text-xs text-amber-900 mt-0.5">
                  • {m}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-stone-200">
            <div>
              <label className="mono-label text-xs text-stone-600">Age (1-99 さい)</label>
              <input
                type="number"
                min={1}
                max={99}
                value={ageInput}
                onChange={(e) => setAgeInput(Number(e.target.value))}
                className="mono-label mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => speakJapanese(ageResult.kana, slowAudio)}
                className="mt-1.5 text-left text-xs text-stone-800 hover:underline cursor-pointer"
              >
                <span className="jp-text font-semibold text-sm">{ageResult.kana}</span>{" "}
                {mode === "bridge" && <span className="mono-label">({ageResult.romaji})</span>}
              </button>
            </div>
            <div>
              <label className="mono-label text-xs text-stone-600">School Year (1-4)</label>
              <select
                value={yearInput}
                onChange={(e) => setYearInput(Number(e.target.value))}
                className="mono-label mt-1 w-full rounded border border-stone-300 bg-white px-2 py-1 text-sm"
              >
                {[1, 2, 3, 4].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => speakJapanese(yearResult.kana, slowAudio)}
                className="mt-1.5 text-left text-xs text-stone-800 hover:underline cursor-pointer"
              >
                <span className="jp-text font-semibold text-sm">{yearResult.kana}</span>{" "}
                {mode === "bridge" && <span className="mono-label">({yearResult.romaji})</span>}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Master One-Screen Phonetic Exception Cheat Matrix */}
      <section className="rounded-lg border border-stone-300 bg-white p-5">
        <h3 className="text-base font-semibold text-stone-900">
          Every Phonetic Counter Exception in Genki Lessons 1 &amp; 2 (Memorize ONLY the Highlighted Shifts)
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
          <div className="rounded border border-stone-200 p-3">
            <div className="mono-label font-semibold text-stone-800">1. Hours (〜じ) — 3 Traps</div>
            <p className="mt-1 text-stone-600">Regular 1..12 EXCEPT:</p>
            <ul className="mt-1.5 space-y-1 jp-text text-sm font-medium text-amber-900">
              <li>4:00 = よじ (yoji — NEVER よんじ!)</li>
              <li>7:00 = しちじ (shichiji)</li>
              <li>9:00 = くじ (kuji — NEVER きゅうじ!)</li>
            </ul>
          </div>

          <div className="rounded border border-stone-200 p-3">
            <div className="mono-label font-semibold text-stone-800">
              2. Minutes (〜ぷん vs 〜ふん)
            </div>
            <p className="mt-1 text-stone-600">
              <strong>1, 3, 4, 6, 8, 10 -&gt; ぷん</strong>; 2, 5, 7, 9 -&gt; ふん:
            </p>
            <ul className="mt-1.5 space-y-0.5 jp-text text-sm font-medium text-amber-900">
              <li>1 = いっぷん · 3 = さんぷん · 4 = よんぷん</li>
              <li>6 = ろっぷん · 8 = はっぷん · 10 = じゅっぷん</li>
              <li>30 = はん (or さんじゅっぷん)</li>
            </ul>
          </div>

          <div className="rounded border border-stone-200 p-3">
            <div className="mono-label font-semibold text-stone-800">
              3. School Year &amp; Age Traps
            </div>
            <ul className="mt-1.5 space-y-1 jp-text text-sm font-medium text-amber-900">
              <li>4th-year = よねんせい (drops ん!)</li>
              <li>1 yr = いっさい · 8 yrs = はっさい</li>
              <li>10 yrs = じゅっさい (じっさい)</li>
              <li>20 yrs = はたち (special word!)</li>
            </ul>
          </div>

          <div className="rounded border border-stone-200 p-3">
            <div className="mono-label font-semibold text-stone-800">
              4. Hundreds (ひゃく) — 3 Shifts
            </div>
            <ul className="mt-1.5 space-y-1 jp-text text-sm font-medium text-amber-900">
              <li>300 = さんびゃく (sanbyaku)</li>
              <li>600 = ろっぴゃく (roppyaku)</li>
              <li>800 = はっぴゃく (happyaku)</li>
            </ul>
          </div>

          <div className="rounded border border-stone-200 p-3">
            <div className="mono-label font-semibold text-stone-800">
              5. Thousands (せん) — 2 Shifts
            </div>
            <ul className="mt-1.5 space-y-1 jp-text text-sm font-medium text-amber-900">
              <li>1,000 = せん (not いっせん standalone)</li>
              <li>3,000 = さんぜん (sanzen)</li>
              <li>8,000 = はっせん (hassen)</li>
            </ul>
          </div>

          <div className="rounded border border-stone-200 p-3">
            <div className="mono-label font-semibold text-stone-800">
              6. Ten-Thousands (まん = 10<sup>4</sup>)
            </div>
            <ul className="mt-1.5 space-y-1 jp-text text-sm font-medium text-amber-900">
              <li>10,000 = いちまん (REQUIRES いち!)</li>
              <li>100,000 = じゅうまん (10 × まん)</li>
              <li>1,000,000 = ひゃくまん (100 × まん)</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

import { useEffect, useState } from "react";
import { ALL_CLOZE, ALL_VOCAB, GOJUON_KANA } from "../content";
import type { DisplayMode } from "../content/schema";
import { type AppTab, SIX_HOUR_SPRINT } from "../content/sprint";
import { speakJapanese } from "../engine/speech";
import { classifyMastery, getWeakItemIds, type ProgressSnapshot } from "../engine/srs";

interface SprintTabProps {
  progress: ProgressSnapshot;
  mode: DisplayMode;
  slowAudio: boolean;
  onToggleBlockComplete: (blockId: string) => void;
  onNavigateTab: (tab: AppTab) => void;
  onSwitchMode: (mode: DisplayMode) => void;
}

export function SprintTab({
  progress,
  mode,
  slowAudio,
  onToggleBlockComplete,
  onNavigateTab,
  onSwitchMode,
}: SprintTabProps) {
  const [activeBlockId, setActiveBlockId] = useState<string>("hour-1");
  const [timerRunning, setTimerRunning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(3600);

  // Personal Self-Introduction Builder state
  const [myNameKata, setMyNameKata] = useState("アニッシュ");
  const [myRoleJp, setMyRoleJp] = useState("かいしゃいん");
  const [myRoleRomaji, setMyRoleRomaji] = useState("kaishain");
  const [myFieldJp, setMyFieldJp] = useState("コンピューター");
  const [myFieldRomaji, setMyFieldRomaji] = useState("konpyuutaa");
  const [myCountryJp, setMyCountryJp] = useState("アメリカじん");
  const [myCountryRomaji, setMyCountryRomaji] = useState("amerikajin");

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const kanaSolid = GOJUON_KANA.filter((k) => classifyMastery(progress.items[k.id]) === "solid").length;
  const clozeSolid = ALL_CLOZE.filter((c) => classifyMastery(progress.items[c.id]) === "solid").length;
  const vocabSolid = ALL_VOCAB.filter((v) => classifyMastery(progress.items[v.id]) === "solid").length;
  const weakCount = getWeakItemIds(progress).length;
  const completedHours = SIX_HOUR_SPRINT.filter((b) => progress.sprintBlocks[b.id]?.completed).length;

  const fullIntroKana = `はじめまして。${myNameKata}です。${myCountryJp}です。しごとは ${myRoleJp}です。せんこうは ${myFieldJp}です。どうぞ よろしくおねがいします。`;
  const fullIntroRomaji = `Hajimemashite. ${myNameKata} desu. ${myCountryRomaji} desu. Shigoto wa ${myRoleRomaji} desu. Senkou wa ${myFieldRomaji} desu. Douzo yoroshiku onegaishimasu.`;

  return (
    <div className="space-y-8">
      {/* Top Situational Readiness Banner */}
      <section className="rounded-lg border border-stone-300 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mono-label text-xs uppercase tracking-wider text-amber-800 font-semibold">
              Pre-Class Readiness Contract · Genki I L0-L2 -&gt; Tonight&apos;s L3-L4 Course
            </div>
            <h2 className="mt-1 text-xl font-semibold text-stone-900">
              Why Lesson 3 catches fast crammers off guard (and how to beat it in 6 hours)
            </h2>
            <p className="mt-2 text-sm text-stone-700 leading-relaxed">
              Genki I prints romaji under every sentence in Lessons 1 and 2, then{" "}
              <strong className="font-semibold text-stone-900">
                deletes all romaji on page 1 of Lesson 3
              </strong>
              , switching to kanji with hiragana furigana plus katakana loanwords. Skip handwriting
              from memory today: spend Hours 1-2 locking in 100% kana reading speed, Hours 3-5 on
              the particle/pointer/counter rules, and flip the header toggle to{" "}
              <button
                type="button"
                onClick={() => onSwitchMode("classroom")}
                className="underline font-medium text-stone-900 hover:text-amber-800 cursor-pointer"
              >
                L3 Class Mode (No Romaji)
              </button>{" "}
              for Hours 5-6.
            </p>
          </div>

          {/* 60-minute Sprint Block Timer */}
          <div className="rounded-md border border-stone-300 bg-stone-50 px-4 py-3 min-w-[230px]">
            <div className="mono-label text-xs text-stone-500">
              Active Block Timer ({SIX_HOUR_SPRINT.find((b) => b.id === activeBlockId)?.hourLabel.split(" ")[0]} {SIX_HOUR_SPRINT.find((b) => b.id === activeBlockId)?.hourLabel.split(" ")[1]})
            </div>
            <div className="mono-label mt-1 text-3xl font-semibold text-stone-900">
              {formatTimer(secondsLeft)}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setTimerRunning((r) => !r)}
                className="rounded bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700 cursor-pointer"
              >
                {timerRunning ? "Pause" : "Start 60m"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimerRunning(false);
                  setSecondsLeft(3600);
                }}
                className="rounded border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Mastery Telemetry Strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5 pt-4 border-t border-stone-200">
          <div>
            <div className="mono-label text-xs text-stone-500">Sprint Hours Done</div>
            <div className="mt-0.5 text-lg font-semibold text-stone-900">{completedHours} / 6</div>
          </div>
          <div>
            <div className="mono-label text-xs text-stone-500">Base Kana Solid</div>
            <div className="mt-0.5 text-lg font-semibold text-stone-900">{kanaSolid} / 46</div>
          </div>
          <div>
            <div className="mono-label text-xs text-stone-500">Grammar Cloze Solid</div>
            <div className="mt-0.5 text-lg font-semibold text-stone-900">{clozeSolid} / {ALL_CLOZE.length}</div>
          </div>
          <div>
            <div className="mono-label text-xs text-stone-500">Vocab Cards Solid</div>
            <div className="mt-0.5 text-lg font-semibold text-stone-900">{vocabSolid} / {ALL_VOCAB.length}</div>
          </div>
          <div>
            <div className="mono-label text-xs text-stone-500">Shaky Items Due</div>
            <div className={`mt-0.5 text-lg font-semibold ${weakCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {weakCount}
            </div>
          </div>
        </div>
      </section>

      {/* Hour-by-Hour Execution Roadmap */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-stone-900">
          6-Hour Cram Execution Plan (Click any block to focus timer &amp; jump straight into drills)
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {SIX_HOUR_SPRINT.map((block) => {
            const isDone = Boolean(progress.sprintBlocks[block.id]?.completed);
            const isFocused = activeBlockId === block.id;
            return (
              <div
                key={block.id}
                onClick={() => setActiveBlockId(block.id)}
                className={`rounded-lg border p-4 transition-colors cursor-pointer ${
                  isDone
                    ? "border-emerald-300 bg-emerald-50/40"
                    : isFocused
                      ? "border-stone-900 bg-white"
                      : "border-stone-200 bg-white hover:border-stone-400"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="mono-label text-xs font-semibold text-stone-600">
                    {block.hourLabel}
                  </span>
                  <label
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 text-xs font-medium text-stone-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => onToggleBlockComplete(block.id)}
                      className="rounded border-stone-400"
                    />
                    Mark Done
                  </label>
                </div>
                <h4 className="mt-1 font-semibold text-stone-900">{block.title}</h4>
                <p className="mt-1 text-xs text-stone-600">{block.whyItMattersTonight}</p>
                <ul className="mt-2.5 space-y-1 text-xs text-stone-700 list-disc pl-4">
                  {block.checklist.map((step, idx) => (
                    <li key={idx}>{step}</li>
                  ))}
                </ul>
                <div className="mt-3 pt-2.5 border-t border-stone-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="mono-label text-[11px] text-amber-900">
                    Gate: {block.exitGate}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigateTab(block.targetTab);
                    }}
                    className="rounded bg-stone-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-stone-700 cursor-pointer"
                  >
                    {block.actionLabel} -&gt;
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Personal 15-Second Classroom Self-Introduction Rehearsal Card */}
      <section className="rounded-lg border border-stone-300 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mono-label text-xs uppercase tracking-wider text-stone-500">
              Guaranteed Day-1 Classroom Prompt (自己紹介 · Jikoshoukai)
            </div>
            <h3 className="text-base font-semibold text-stone-900 mt-0.5">
              Customize &amp; Rehearse Your 5-Sentence Self-Introduction Out Loud
            </h3>
          </div>
          <button
            type="button"
            onClick={() => speakJapanese(fullIntroKana, slowAudio)}
            className="rounded bg-stone-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-stone-700 cursor-pointer"
          >
            Speak Full Intro ({slowAudio ? "0.72x Slow" : "1.0x Normal"})
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <label className="block text-xs">
            <span className="mono-label text-stone-600">Your Name (Katakana, NO さん!)</span>
            <input
              type="text"
              value={myNameKata}
              onChange={(e) => setMyNameKata(e.target.value)}
              className="jp-text mt-1 w-full rounded border border-stone-300 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="mono-label text-stone-600">Nationality (Country + じん)</span>
            <select
              value={myCountryJp}
              onChange={(e) => {
                const map: Record<string, string> = {
                  アメリカじん: "amerikajin",
                  インドじん: "indojin",
                  カナダじん: "kanadajin",
                  イギリスじん: "igirisujin",
                  にほんじん: "nihonjin",
                };
                setMyCountryJp(e.target.value);
                setMyCountryRomaji(map[e.target.value] || "");
              }}
              className="jp-text mt-1 w-full rounded border border-stone-300 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="アメリカじん">アメリカじん (American)</option>
              <option value="インドじん">インドじん (Indian)</option>
              <option value="カナダじん">カナダじん (Canadian)</option>
              <option value="イギリスじん">イギリスじん (British)</option>
              <option value="にほんじん">にほんじん (Japanese)</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="mono-label text-stone-600">Role / Occupation</span>
            <select
              value={myRoleJp}
              onChange={(e) => {
                const map: Record<string, string> = {
                  かいしゃいん: "kaishain",
                  エンジニア: "enjinia",
                  だいがくいんせい: "daigakuinsei",
                  だいがくせい: "daigakusei",
                };
                setMyRoleJp(e.target.value);
                setMyRoleRomaji(map[e.target.value] || "");
              }}
              className="jp-text mt-1 w-full rounded border border-stone-300 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="かいしゃいん">かいしゃいん (Company employee)</option>
              <option value="エンジニア">エンジニア (Engineer)</option>
              <option value="だいがくいんせい">だいがくいんせい (Grad student)</option>
              <option value="だいがくせい">だいがくせい (College student)</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="mono-label text-stone-600">Major / Field (せんこう)</span>
            <select
              value={myFieldJp}
              onChange={(e) => {
                const map: Record<string, string> = {
                  コンピューター: "konpyuutaa",
                  こうがく: "kougaku",
                  けいざい: "keizai",
                  ビジネス: "bijinesu",
                };
                setMyFieldJp(e.target.value);
                setMyFieldRomaji(map[e.target.value] || "");
              }}
              className="jp-text mt-1 w-full rounded border border-stone-300 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="コンピューター">コンピューター (Computer Science)</option>
              <option value="こうがく">こうがく (Engineering)</option>
              <option value="けいざい">けいざい (Economics)</option>
              <option value="ビジネス">ビジネス (Business)</option>
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-4">
          <p className="jp-text text-lg font-medium text-stone-900 leading-relaxed">{fullIntroKana}</p>
          {mode === "bridge" && (
            <p className="mono-label mt-1 text-xs text-stone-600">{fullIntroRomaji}</p>
          )}
          <p className="mt-1.5 text-xs text-stone-600">
            &ldquo;How do you do. I&apos;m {myNameKata}. I&apos;m {myCountryJp.replace("じん", "")}. My work is {myRoleJp}. My field/major is {myFieldJp}. Pleased to meet you.&rdquo;
          </p>
        </div>
      </section>
    </div>
  );
}

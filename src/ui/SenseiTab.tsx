import { useEffect, useState } from "react";
import { ALL_GRAMMAR, ALL_ROLEPLAYS, ALL_VOCAB } from "../content";
import type { DisplayMode } from "../content/schema";
import { speakJapanese } from "../engine/speech";
import { fetchTutorStatus, tutorPost } from "../engine/tutor-client";
import type { TutorStatus } from "../engine/tutor-types";
import { JapaneseLineView } from "./RubyText";
import { useTutor } from "./TutorContext";

interface SenseiTabProps {
  mode: DisplayMode;
  slowAudio: boolean;
  /** Scenario to open first (deep link from the Study Path roleplay units). */
  initialScenarioId?: string | null;
}

interface ChatTurn {
  role: "user" | "assistant";
  jp: string;
  kana?: string;
  en?: string;
  coachTip?: string;
}

export function SenseiTab({ mode, slowAudio, initialScenarioId = null }: SenseiTabProps) {
  // Offline Guided Roleplay state
  const [scenarioIdx, setScenarioIdx] = useState(() => {
    const idx = initialScenarioId ? ALL_ROLEPLAYS.findIndex((r) => r.id === initialScenarioId) : -1;
    return idx >= 0 ? idx : 0;
  });
  const [turnIdx, setTurnIdx] = useState(0);
  const [selectedChoiceIdx, setSelectedChoiceIdx] = useState<number | null>(null);

  // Optional Live Forge Inference Sensei state
  const [tutorStatus, setTutorStatus] = useState<TutorStatus>({
    available: false,
    provider: null,
    model: null,
    tracing: false,
    project: null,
    tokenRequired: false,
  });
  const [tutorMode, setTutorMode] = useState<"roleplay" | "grade">("roleplay");
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([
    {
      role: "assistant",
      jp: "こんばんは！はじめまして。おなまえは なんですか。",
      kana: "こんばんは！はじめまして。おなまえは なんですか。",
      en: "Good evening! Nice to meet you. What is your name?",
      coachTip: "Reply in kana or romaji using Lesson 1-2 polite Japanese (e.g., はじめまして。アニッシュです。).",
    },
  ]);
  const [userDraft, setUserDraft] = useState("");
  const [loadingTutor, setLoadingTutor] = useState(false);
  const [tutorError, setTutorError] = useState<string | null>(null);

  const tutor = useTutor();
  useEffect(() => {
    // Static build or offline: null status keeps deterministic roleplays active
    fetchTutorStatus().then((s) => {
      if (s) setTutorStatus(s);
    });
  }, []);

  const scenario = ALL_ROLEPLAYS[scenarioIdx % ALL_ROLEPLAYS.length];
  const turn = scenario?.turns[turnIdx % scenario.turns.length];

  const sendLiveMessage = async () => {
    const trimmed = userDraft.trim();
    if (!trimmed || loadingTutor) return;
    setLoadingTutor(true);
    setTutorError(null);
    const nextUserTurn: ChatTurn = { role: "user", jp: trimmed };
    setChatHistory((h) => [...h, nextUserTurn]);
    setUserDraft("");

    try {
      const payload = await tutorPost<Record<string, unknown>, Record<string, unknown>>("chat", {
        mode: tutorMode,
        displayMode: mode,
        sessionId: tutor.sessionId,
        recentEvents: tutor.recentEvents(),
        scenarioTitle: "Week-1 Genki Classroom & Café Icebreaker",
        allowedGrammar: ALL_GRAMMAR.map((g) => `${g.code} ${g.formula}`),
        allowedVocab: ALL_VOCAB.slice(0, 50).map((v) => `${v.kana} (${v.en})`),
        history: chatHistory.map((c) => ({ role: c.role, content: c.jp })),
        userMessage: trimmed,
      });

      if (!payload.ok) {
        setTutorError(payload.error || "Live Sensei call failed.");
        setLoadingTutor(false);
        return;
      }

      const r = payload.result || {};
      if (tutorMode === "grade") {
        const jp = String(r.japanese || "");
        const reading = String(r.reading || jp);
        const feedback = String(r.feedback || "");
        const trap = String(r.trapNote || "");
        setChatHistory((h) => [
          ...h,
          {
            role: "assistant",
            jp: jp || "Checked!",
            kana: reading,
            en: feedback,
            coachTip: trap || undefined,
          },
        ]);
        if (reading) speakJapanese(reading, slowAudio);
      } else {
        const replyJp = String(r.replyJp || "そうですね！");
        const replyKana = String(r.replyKana || replyJp);
        const replyEn = String(r.replyEn || "");
        const coachTip = String(r.coachTip || "");
        setChatHistory((h) => [
          ...h,
          {
            role: "assistant",
            jp: replyJp,
            kana: replyKana,
            en: replyEn,
            coachTip: coachTip || undefined,
          },
        ]);
        speakJapanese(replyKana, slowAudio);
      }
    } catch (err) {
      setTutorError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoadingTutor(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Deterministic Guided Classroom & Shop Roleplays (100% Offline) */}
      {scenario && turn && (
        <section className="rounded-lg border border-stone-300 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="mono-label text-xs uppercase text-stone-500">
                Deterministic Dialogue Simulator · Works Offline
              </div>
              <h2 className="text-lg font-semibold text-stone-900">{scenario.title}</h2>
              <p className="text-xs text-stone-600">
                {scenario.setting} · You: <strong>{scenario.yourRole}</strong> · Partner:{" "}
                <strong>{scenario.partnerRole}</strong>
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ROLEPLAYS.map((sc, idx) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => {
                    setScenarioIdx(idx);
                    setTurnIdx(0);
                    setSelectedChoiceIdx(null);
                  }}
                  className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                    idx === scenarioIdx
                      ? "bg-stone-900 text-white"
                      : "border border-stone-300 bg-stone-50 text-stone-700"
                  }`}
                >
                  {sc.lessonId}: {sc.title.split(" ")[0]} {sc.title.split(" ")[1]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-4">
            <div className="mono-label text-xs font-semibold text-stone-600">
              {turn.speakerName} · Turn {turnIdx + 1} of {scenario.turns.length}
            </div>
            <JapaneseLineView line={turn.promptJp} mode={mode} slowAudio={slowAudio} />
            <div className="mt-2 rounded bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-950">
              <strong>Your Goal:</strong> {turn.goalEn}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {turn.choices.map((ch, idx) => {
              const isPicked = selectedChoiceIdx === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedChoiceIdx(idx);
                    speakJapanese(ch.kana, slowAudio);
                  }}
                  className={`w-full text-left rounded-md border p-3 transition cursor-pointer ${
                    isPicked
                      ? ch.isCorrect
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-amber-500 bg-amber-50"
                      : "border-stone-300 bg-white hover:border-stone-500"
                  }`}
                >
                  <div className="jp-text font-semibold text-base text-stone-900">{ch.jp}</div>
                  {mode === "bridge" && (
                    <div className="mono-label text-xs text-stone-500">{ch.romaji}</div>
                  )}
                  {isPicked && (
                    <div className="mt-2 pt-2 border-t border-stone-200 text-xs text-stone-800">
                      <strong>{ch.isCorrect ? "Spot on:" : "Watch out:"}</strong> {ch.feedback} (
                      {ch.en})
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setSelectedChoiceIdx(null);
                if (turnIdx + 1 < scenario.turns.length) {
                  setTurnIdx((t) => t + 1);
                } else {
                  setScenarioIdx((s) => (s + 1) % ALL_ROLEPLAYS.length);
                  setTurnIdx(0);
                }
              }}
              className="rounded bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-700 cursor-pointer"
            >
              {turnIdx + 1 < scenario.turns.length ? "Next Turn ->" : "Next Scenario ->"}
            </button>
          </div>
        </section>
      )}

      {/* 2. Optional Live Forge Inference Sensei */}
      <section className="rounded-lg border border-stone-300 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="mono-label text-xs uppercase text-stone-500">
                Optional AI Sensei Partner (Server-Side Dev Proxy)
              </span>
              <span
                className={`mono-label rounded px-2 py-0.5 text-[11px] font-semibold ${
                  tutorStatus.available
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-stone-100 text-stone-600"
                }`}
              >
                {tutorStatus.available
                  ? `Connected · ${tutorStatus.model}`
                  : "Offline Mode (Set WANDB_API_KEY or wandb login to enable)"}
              </span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-stone-900">
              Free-Form L0-L2 Roleplay &amp; Custom Sentence Grader
            </h3>
          </div>

          <div className="flex gap-1.5">
            {(
              [
                ["roleplay", "Live Conversation"],
                ["grade", "Check My Sentence"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setTutorMode(m)}
                className={`rounded px-2.5 py-1 text-xs font-medium cursor-pointer ${
                  tutorMode === m
                    ? "bg-stone-900 text-white"
                    : "border border-stone-300 bg-stone-50 text-stone-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-2.5 max-h-[320px] overflow-y-auto rounded border border-stone-200 bg-stone-50 p-3">
          {chatHistory.map((turnItem, idx) => (
            <div
              key={idx}
              className={`rounded-md p-3 text-sm ${
                turnItem.role === "assistant"
                  ? "bg-white border border-stone-200"
                  : "bg-stone-900 text-white ml-8"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="jp-text font-medium">{turnItem.jp}</div>
                {turnItem.role === "assistant" && (
                  <button
                    type="button"
                    onClick={() => speakJapanese(turnItem.kana || turnItem.jp, slowAudio)}
                    className="mono-label rounded border border-stone-300 px-2 py-0.5 text-[11px] text-stone-700 cursor-pointer"
                  >
                    Play
                  </button>
                )}
              </div>
              {turnItem.en && <div className="mt-1 text-xs text-stone-600">{turnItem.en}</div>}
              {turnItem.coachTip && (
                <div className="mt-1.5 rounded bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs text-amber-950">
                  <strong>Sensei Note:</strong> {turnItem.coachTip}
                </div>
              )}
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendLiveMessage();
          }}
          className="mt-3 flex gap-2"
        >
          <input
            type="text"
            value={userDraft}
            onChange={(e) => setUserDraft(e.target.value)}
            disabled={!tutorStatus.available || loadingTutor}
            placeholder={
              tutorMode === "grade"
                ? "Type a Japanese or English sentence you want Sensei to check for tonight's class..."
                : "Reply in Japanese (kana or romaji)..."
            }
            className="flex-1 rounded border border-stone-300 px-3 py-2 text-sm disabled:bg-stone-100"
          />
          <button
            type="submit"
            disabled={!tutorStatus.available || loadingTutor}
            className="rounded bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-40 cursor-pointer"
          >
            {loadingTutor ? "Thinking..." : tutorMode === "grade" ? "Grade" : "Send"}
          </button>
        </form>
        {tutorError && <p className="mt-2 text-xs text-amber-800">{tutorError}</p>}
      </section>
    </div>
  );
}

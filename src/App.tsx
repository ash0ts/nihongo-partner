import { useRef, useState } from "react";
import type { DisplayMode } from "./content/schema";
import type { AppTab } from "./content/sprint";
import { STUDY_PATH } from "./content/study-path";
import type { DrillItem } from "./engine/drills";
import { appendEvent, type InteractionPhase, makeEvent, makeSessionId } from "./engine/events";
import { jumpToUnit } from "./engine/path";
import {
  addUnitElapsed,
  type ItemMastery,
  loadProgress,
  markUnitSkipped,
  type ProgressSnapshot,
  recordCheckpoint,
  recordReview,
  resetUnit,
  saveProgress,
} from "./engine/srs";
import { GrammarTab } from "./ui/GrammarTab";
import { KanaLabTab } from "./ui/KanaLabTab";
import { NumbersTab } from "./ui/NumbersTab";
import { PathTab } from "./ui/PathTab";
import { SenseiTab } from "./ui/SenseiTab";
import { SprintTab } from "./ui/SprintTab";
import { TutorProvider } from "./ui/TutorContext";
import { VocabTab } from "./ui/VocabTab";

const MODE_SHORT: Record<DisplayMode, string> = {
  bridge: "Romaji",
  classroom: "Furigana",
  immersion: "Immersion",
};

const NAV_TABS: Array<{ id: AppTab; label: string }> = [
  { id: "path", label: "Study Path" },
  { id: "sprint", label: "Reference: 6-Hr Plan" },
  { id: "kana", label: "Kana Lab" },
  { id: "grammar", label: "Grammar & こそあど" },
  { id: "numbers", label: "Numbers, Time & Yen" },
  { id: "vocab", label: "Vocab & Classroom p.81" },
  { id: "sensei", label: "Sensei Roleplay" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("path");
  const [progress, setProgress] = useState<ProgressSnapshot>(() => loadProgress());
  const [senseiScenarioId, setSenseiScenarioId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionId = useRef(makeSessionId());

  const updateProgress = (updater: (prev: ProgressSnapshot) => ProgressSnapshot) => {
    setProgress((prev) => {
      const next = updater(prev);
      saveProgress(next);
      return next;
    });
  };

  const handleRecordReview = (
    id: string,
    category: ItemMastery["category"],
    isCorrect: boolean,
    ms: number,
  ) => {
    updateProgress((prev) => recordReview(prev, id, category, isCorrect, ms));
  };

  /** Path drills report the full item so the event log can keep the learner's actual input. */
  const handleDrillAnswer = (item: DrillItem, isCorrect: boolean, ms: number, input: string, phase: InteractionPhase) => {
    updateProgress((prev) => {
      const withReview = recordReview(prev, item.id, item.category, isCorrect, ms);
      const event = makeEvent({
        item,
        sessionId: sessionId.current,
        mode: prev.displayMode,
        input,
        correct: isCorrect,
        ms,
        phase,
      });
      return { ...withReview, events: appendEvent(withReview.events, event) };
    });
  };

  const handleRecordCheckpoint = (unitId: string, score: number, passBar: number) => {
    updateProgress((prev) => recordCheckpoint(prev, unitId, score, passBar));
  };

  const handleSkipUnit = (unitId: string) => {
    updateProgress((prev) => markUnitSkipped(prev, unitId));
  };

  const handleJumpToUnit = (unitId: string) => {
    updateProgress((prev) => jumpToUnit(STUDY_PATH, prev, unitId));
  };

  const handleResetUnit = (unitId: string) => {
    updateProgress((prev) => resetUnit(prev, unitId));
  };

  const handleUnitElapsed = (unitId: string, seconds: number) => {
    updateProgress((prev) => addUnitElapsed(prev, unitId, seconds));
  };

  const handleOpenRoleplay = (scenarioId: string) => {
    setSenseiScenarioId(scenarioId);
    setActiveTab("sensei");
  };

  const handleSwitchMode = (displayMode: DisplayMode) => {
    updateProgress((prev) => ({
      ...prev,
      displayMode,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleToggleSlowAudio = () => {
    updateProgress((prev) => ({
      ...prev,
      slowAudio: !prev.slowAudio,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleToggleBlockComplete = (blockId: string) => {
    updateProgress((prev) => {
      const existing = prev.sprintBlocks[blockId];
      return {
        ...prev,
        updatedAt: new Date().toISOString(),
        sprintBlocks: {
          ...prev.sprintBlocks,
          [blockId]: {
            blockId,
            completed: !existing?.completed,
            elapsedSeconds: existing?.elapsedSeconds ?? 0,
          },
        },
      };
    });
  };

  const handleExportProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "progress.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProgress = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ProgressSnapshot;
        if (parsed.version === "nihongo-partner.v1" && parsed.items) {
          const normalized: ProgressSnapshot = {
            ...parsed,
            sprintBlocks: parsed.sprintBlocks ?? {},
            pathUnits: parsed.pathUnits ?? {},
            events: Array.isArray(parsed.events) ? parsed.events : [],
          };
          saveProgress(normalized);
          setProgress(normalized);
        }
      } catch {
        // Ignore malformed uploads
      }
    };
    reader.readAsText(file);
  };

  return (
    <TutorProvider sessionId={sessionId.current} mode={progress.displayMode} events={progress.events}>
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Sticky Top Control Bar: one title row, one scrollable nav row; settings fold away on phones */}
      <header className="sticky top-0 z-20 border-b border-stone-300 bg-stone-50/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-6xl px-3 py-2 sm:px-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-2.5">
              <h1 className="truncate text-base font-bold tracking-tight text-stone-900 sm:text-lg">Nihongo Partner</h1>
              <span className="mono-label hidden text-xs text-stone-500 md:inline">
                Genki I Cram (L0-L2) -&gt; 8-Week Course Engine
              </span>
            </div>

            {/* Settings: inline on desktop, behind a toggle on phones */}
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              className="mono-label rounded border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer md:hidden"
            >
              {settingsOpen ? "Close" : `${MODE_SHORT[progress.displayMode]} · ${progress.slowAudio ? "slow" : "1.0x"}`}
            </button>

            <div className={`${settingsOpen ? "flex" : "hidden"} w-full flex-wrap items-center gap-2 pt-2 md:flex md:w-auto md:pt-0`}>
              <div className="flex rounded-md border border-stone-300 bg-white p-0.5 text-xs">
                {(
                  [
                    ["bridge", "Romaji Bridge", "Romaji Bridge (Hrs 1-4)"],
                    ["classroom", "Furigana", "L3 Class Mode (Furigana, No Romaji)"],
                    ["immersion", "Immersion", "Immersion"],
                  ] as const
                ).map(([m, shortLabel, longLabel]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSwitchMode(m)}
                    className={`rounded px-2.5 py-1.5 font-medium transition cursor-pointer ${
                      progress.displayMode === m
                        ? "bg-stone-900 text-white"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    <span className="lg:hidden">{shortLabel}</span>
                    <span className="hidden lg:inline">{longLabel}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleToggleSlowAudio}
                className={`mono-label rounded border px-2.5 py-1.5 text-xs font-medium cursor-pointer ${
                  progress.slowAudio
                    ? "border-amber-600 bg-amber-100 text-amber-950"
                    : "border-stone-300 bg-white text-stone-700"
                }`}
              >
                Audio: {progress.slowAudio ? "0.72x Slow" : "1.0x"}
              </button>

              <button
                type="button"
                onClick={handleExportProgress}
                title="Export progress.json so coding agents can inspect your shaky items"
                className="mono-label rounded border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mono-label rounded border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportProgress(file);
                }}
              />
            </div>
          </div>

          {/* Primary Navigation Tabs: single scrollable row on phones, wraps on wide screens */}
          <nav className="scrollbar-none -mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
            {NAV_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setSettingsOpen(false);
                }}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-stone-900 text-white"
                    : "bg-stone-200/70 text-stone-700 hover:bg-stone-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-4 sm:py-6">
        {activeTab === "path" && (
          <PathTab
            path={STUDY_PATH}
            progress={progress}
            mode={progress.displayMode}
            slowAudio={progress.slowAudio}
            onDrillAnswer={handleDrillAnswer}
            onRecordCheckpoint={handleRecordCheckpoint}
            onSkipUnit={handleSkipUnit}
            onJumpToUnit={handleJumpToUnit}
            onResetUnit={handleResetUnit}
            onElapsed={handleUnitElapsed}
            onOpenRoleplay={handleOpenRoleplay}
          />
        )}
        {activeTab === "sprint" && (
          <SprintTab
            progress={progress}
            mode={progress.displayMode}
            slowAudio={progress.slowAudio}
            onToggleBlockComplete={handleToggleBlockComplete}
            onNavigateTab={setActiveTab}
            onSwitchMode={handleSwitchMode}
          />
        )}
        {activeTab === "kana" && (
          <KanaLabTab
            progress={progress}
            slowAudio={progress.slowAudio}
            onRecordReview={handleRecordReview}
          />
        )}
        {activeTab === "grammar" && (
          <GrammarTab
            progress={progress}
            mode={progress.displayMode}
            slowAudio={progress.slowAudio}
            onRecordReview={handleRecordReview}
          />
        )}
        {activeTab === "numbers" && (
          <NumbersTab
            mode={progress.displayMode}
            slowAudio={progress.slowAudio}
            onRecordReview={handleRecordReview}
          />
        )}
        {activeTab === "vocab" && (
          <VocabTab
            progress={progress}
            mode={progress.displayMode}
            slowAudio={progress.slowAudio}
            onRecordReview={handleRecordReview}
          />
        )}
        {activeTab === "sensei" && (
          <SenseiTab
            key={senseiScenarioId ?? "default"}
            mode={progress.displayMode}
            slowAudio={progress.slowAudio}
            initialScenarioId={senseiScenarioId}
          />
        )}
      </main>
    </div>
    </TutorProvider>
  );
}

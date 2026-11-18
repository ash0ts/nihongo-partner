import { useRef, useState } from "react";
import type { DisplayMode } from "./content/schema";
import type { AppTab } from "./content/sprint";
import {
  type ItemMastery,
  loadProgress,
  type ProgressSnapshot,
  recordReview,
  saveProgress,
} from "./engine/srs";
import { GrammarTab } from "./ui/GrammarTab";
import { KanaLabTab } from "./ui/KanaLabTab";
import { NumbersTab } from "./ui/NumbersTab";
import { SenseiTab } from "./ui/SenseiTab";
import { SprintTab } from "./ui/SprintTab";
import { VocabTab } from "./ui/VocabTab";

const NAV_TABS: Array<{ id: AppTab; label: string }> = [
  { id: "sprint", label: "6-Hr Cram Plan" },
  { id: "kana", label: "Kana Lab" },
  { id: "grammar", label: "Grammar & こそあど" },
  { id: "numbers", label: "Numbers, Time & Yen" },
  { id: "vocab", label: "Vocab & Classroom p.81" },
  { id: "sensei", label: "Sensei Roleplay" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("sprint");
  const [progress, setProgress] = useState<ProgressSnapshot>(() => loadProgress());
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          saveProgress(parsed);
          setProgress(parsed);
        }
      } catch {
        // Ignore malformed uploads
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Sticky Top Control Bar */}
      <header className="sticky top-0 z-20 border-b border-stone-300 bg-stone-50/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-lg font-bold tracking-tight text-stone-900">Nihongo Partner</h1>
              <span className="mono-label text-xs text-stone-500">
                Genki I Cram (L0-L2) -&gt; 8-Week Course Engine
              </span>
            </div>

            {/* Global Orthography & Audio Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border border-stone-300 bg-white p-0.5 text-xs">
                {(
                  [
                    ["bridge", "Romaji Bridge (Hrs 1-4)"],
                    ["classroom", "L3 Class Mode (Furigana, No Romaji)"],
                    ["immersion", "Immersion"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleSwitchMode(m)}
                    className={`rounded px-2.5 py-1 font-medium transition cursor-pointer ${
                      progress.displayMode === m
                        ? "bg-stone-900 text-white"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleToggleSlowAudio}
                className={`mono-label rounded border px-2.5 py-1 text-xs font-medium cursor-pointer ${
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
                className="mono-label rounded border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mono-label rounded border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-100 cursor-pointer"
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

          {/* Primary Navigation Tabs */}
          <nav className="mt-3 flex flex-wrap gap-1.5">
            {NAV_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
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

      <main className="mx-auto max-w-6xl px-4 py-6">
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
          <SenseiTab mode={progress.displayMode} slowAudio={progress.slowAudio} />
        )}
      </main>
    </div>
  );
}

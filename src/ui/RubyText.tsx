import type { DisplayMode, JapaneseLine, TextSegment } from "../content/schema";
import { speakJapanese } from "../engine/speech";

interface SegmentsProps {
  segments: TextSegment[];
  mode: DisplayMode;
  className?: string;
}

export function SegmentsView({ segments, mode, className = "" }: SegmentsProps) {
  return (
    <span className={`jp-text ${className}`}>
      {segments.map((s, idx) => {
        if (!s.furigana) {
          return <span key={idx}>{s.text}</span>;
        }
        if (mode === "bridge") {
          // In Bridge mode (L1-L2 style), show pure kana primary with subtle kanji hint on hover, or ruby
          return (
            <ruby key={idx} className="mx-0.5">
              {s.text}
              <rt>{s.furigana}</rt>
            </ruby>
          );
        }
        if (mode === "classroom") {
          // Exact Genki Lesson 3 page format: Kanji + Hiragana Furigana, ZERO romaji
          return (
            <ruby key={idx} className="mx-0.5">
              {s.text}
              <rt>{s.furigana}</rt>
            </ruby>
          );
        }
        // Immersion mode: Kanji only, reveal reading on hover title
        return (
          <span key={idx} title={s.furigana} className="underline decoration-stone-300 decoration-dotted underline-offset-4">
            {s.text}
          </span>
        );
      })}
    </span>
  );
}

interface JapaneseLineCardProps {
  line: JapaneseLine;
  mode: DisplayMode;
  slowAudio: boolean;
  showTranslation?: boolean;
  compact?: boolean;
}

export function JapaneseLineView({
  line,
  mode,
  slowAudio,
  showTranslation = true,
  compact = false,
}: JapaneseLineCardProps) {
  return (
    <div className={`flex items-start justify-between gap-3 ${compact ? "py-1" : "py-2"}`}>
      <div className="min-w-0 flex-1">
        <div className={`${compact ? "text-base" : "text-lg"} font-medium text-stone-900 leading-relaxed`}>
          <SegmentsView segments={line.segments} mode={mode} />
        </div>
        {mode === "bridge" && (
          <div className="mono-label text-xs text-stone-500 mt-0.5">{line.romaji}</div>
        )}
        {showTranslation && (
          <div className="text-sm text-stone-700 mt-0.5">
            {line.en}
            {line.literalEn && (
              <span className="text-xs text-stone-500 ml-2">(lit. &ldquo;{line.literalEn}&rdquo;)</span>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => speakJapanese(line.kana, slowAudio)}
        title="Play Japanese audio"
        className="mono-label shrink-0 rounded border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:border-stone-500 hover:bg-stone-100 active:bg-stone-200 cursor-pointer"
      >
        Play
      </button>
    </div>
  );
}

"use client";

type Speed = 1 | 2 | 5;

interface Props {
  totalEvents: number;
  position: number;
  playing: boolean;
  speed: Speed;
  onPosition: (pos: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (speed: Speed) => void;
}

export function ReplayScrubber({ totalEvents, position, playing, speed, onPosition, onPlay, onPause, onSpeed }: Props) {
  if (totalEvents === 0) return null;
  const pct = totalEvents > 1 ? Math.round((position / (totalEvents - 1)) * 100) : 100;

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-[#131c30] bg-[#080d18] select-none">
      {/* Play/Pause */}
      <button
        onClick={playing ? onPause : onPlay}
        disabled={position >= totalEvents - 1 && !playing}
        className="flex h-6 w-6 items-center justify-center rounded-md text-[#7d92ad] hover:bg-[#141c2e] hover:text-[#e2e8f4] transition-colors disabled:opacity-30"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
            <rect x="3" y="2" width="3.5" height="12" rx="1"/>
            <rect x="9.5" y="2" width="3.5" height="12" rx="1"/>
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2l10 6-10 6V2z"/>
          </svg>
        )}
      </button>

      {/* Scrubber track */}
      <div className="flex-1 flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={totalEvents - 1}
          value={position}
          onChange={(e) => onPosition(Number(e.target.value))}
          className="flex-1 h-1 accent-blue-500 cursor-pointer"
          style={{ accentColor: "#3b82f6" }}
        />
        <span className="font-mono text-[10px] text-[#3d5070] w-16 text-right shrink-0">
          {position + 1}/{totalEvents} · {pct}%
        </span>
      </div>

      {/* Speed */}
      <div className="flex items-center gap-px">
        {([1, 2, 5] as Speed[]).map((s) => (
          <button
            key={s}
            onClick={() => onSpeed(s)}
            className={[
              "rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors",
              speed === s
                ? "bg-blue-600/30 text-blue-300 border border-blue-600/40"
                : "text-[#3d5070] hover:text-[#7d92ad] hover:bg-[#141c2e]",
            ].join(" ")}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

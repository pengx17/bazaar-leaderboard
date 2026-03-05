import { formatSeasonName } from "@/lib/api";

interface SeasonSelectorProps {
  seasons: number[];
  activeSeason: number;
  onSeasonChange: (season: number) => void;
}

export function SeasonSelector({
  seasons,
  activeSeason,
  onSeasonChange,
}: SeasonSelectorProps) {
  return (
    <div className="flex items-center gap-0.5 mr-1">
      {seasons.map((s) => (
        <button
          key={s}
          onClick={() => onSeasonChange(s)}
          className={`min-w-[36px] h-8 px-2 text-xs font-mono rounded transition-colors ${
            s === activeSeason
              ? "bg-amber-500/15 text-amber-500 font-bold"
              : "text-muted-foreground hover:text-foreground hover:bg-card/80"
          }`}
        >
          {formatSeasonName(s)}
        </button>
      ))}
    </div>
  );
}

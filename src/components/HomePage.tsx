import { StatsPanel } from "@/components/StatsPanel";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { TitleRatingChart } from "@/components/TitleRatingChart";
import { PinnedPlayersChart } from "@/components/PinnedPlayersChart";
import { fetchStats } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

export function HomePage() {
  const { data: stats, loading, error } = useFetch(() => fetchStats(), []);
  const seasonId = stats?.seasonId;

  return (
    <>
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-8 bg-amber-500 rounded-sm" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            The Bazaar
          </h1>
        </div>
        <p className="text-sm text-muted-foreground font-mono ml-5 tracking-wide">
          LEGENDARY LEADERBOARD TRACKER
          {seasonId != null && ` — SEASON ${seasonId}`}
        </p>
      </header>

      {/* Stats bar */}
      <section className="mb-6">
        {loading ? (
          <div className="h-12 rounded-lg bg-card/30 border border-border/40 animate-pulse" />
        ) : error || !stats ? (
          <div className="px-4 py-3 rounded-lg bg-card/30 border border-border/40 text-sm text-muted-foreground">
            {error ?? "No data available"}
          </div>
        ) : (
          <StatsPanel stats={stats} />
        )}
      </section>

      {/* Pinned Players */}
      {seasonId != null && (
        <section className="mb-10">
          <PinnedPlayersChart seasonId={seasonId} />
        </section>
      )}

      {/* Leaderboard */}
      {seasonId != null && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-amber-500/60 rounded-sm" />
            <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
              Leaderboard
            </h2>
          </div>
          <LeaderboardTable seasonId={seasonId} />
        </section>
      )}

      {/* Title Cutoffs */}
      {seasonId != null && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-amber-500/60 rounded-sm" />
            <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
              Title Thresholds
            </h2>
          </div>
          <TitleRatingChart seasonId={seasonId} />
        </section>
      )}
    </>
  );
}

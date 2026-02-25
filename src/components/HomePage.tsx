import { useTranslation } from "react-i18next";
import { StatsPanel } from "@/components/StatsPanel";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { TitleRatingChart } from "@/components/TitleRatingChart";
import { PinnedPlayersChart } from "@/components/PinnedPlayersChart";
import { fetchStats, formatSeasonName } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

export function HomePage() {
  const { t } = useTranslation();
  const { data: stats, loading, error } = useFetch(() => fetchStats(), []);
  const seasonId = stats?.seasonId;

  return (
    <>
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-8 bg-amber-500 rounded-sm" />
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            {t("home.title")}
          </h1>
        </div>
        <p className="text-sm text-muted-foreground font-mono ml-5 tracking-wide">
          {seasonId != null
            ? t("home.subtitleSeason", { season: formatSeasonName(seasonId) })
            : t("home.subtitle")}
        </p>
      </header>

      {/* Stats bar */}
      <section className="mb-6">
        {loading ? (
          <div className="h-12 rounded-lg bg-card/30 border border-border/40 animate-pulse" />
        ) : error || !stats ? (
          <div className="px-4 py-3 rounded-lg bg-card/30 border border-border/40 text-sm text-muted-foreground">
            {error ?? t("home.noData")}
          </div>
        ) : (
          <StatsPanel stats={stats} />
        )}
      </section>

      {/* Pinned Players */}
      <section className="mb-10">
        {seasonId != null && <PinnedPlayersChart seasonId={seasonId} />}
      </section>

      {/* Leaderboard */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-amber-500/60 rounded-sm" />
          <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
            {t("home.leaderboard")}
          </h2>
        </div>
        {seasonId != null ? (
          <LeaderboardTable seasonId={seasonId} />
        ) : (
          <div className="h-[600px] rounded-lg bg-card/30 border border-border/40 animate-pulse" />
        )}
      </section>

      {/* Title Cutoffs */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-amber-500/60 rounded-sm" />
          <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
            {t("home.titleThresholds")}
          </h2>
        </div>
        {seasonId != null ? (
          <TitleRatingChart seasonId={seasonId} />
        ) : (
          <div className="h-[420px] rounded-lg bg-card/30 border border-border/40 animate-pulse" />
        )}
      </section>
    </>
  );
}

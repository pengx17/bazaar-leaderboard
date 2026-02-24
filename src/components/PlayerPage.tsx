import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Hash, Zap } from "lucide-react";
import { RatingChart } from "@/components/RatingChart";
import { fetchStats, fetchLeaderboard } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

export function PlayerPage({ params }: { params: { username: string } }) {
  const username = decodeURIComponent(params.username);

  // Fetch stats to get current season
  const { data: stats } = useFetch(() => fetchStats(), []);
  const currentSeason = stats?.seasonId;

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const activeSeason = selectedSeason ?? currentSeason;

  // Generate available seasons (current + 2 previous)
  const seasons = currentSeason
    ? Array.from({ length: 3 }, (_, i) => currentSeason - i).filter(
        (s) => s > 0
      )
    : [];

  // Fetch player's current rank/rating from leaderboard (exact match)
  const { data: playerData } = useFetch(
    () =>
      activeSeason != null
        ? fetchLeaderboard({ seasonId: activeSeason, search: username, limit: 1 })
        : Promise.resolve(null),
    [activeSeason, username]
  );

  const playerEntry = playerData?.entries.find(
    (e) => e.username.toLowerCase() === username.toLowerCase()
  );

  return (
    <>
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-mono mb-6 transition-colors group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Leaderboard
      </Link>

      {/* Player header */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">
          {username}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {/* Current rank & rating */}
          {playerEntry ? (
            <>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card/50 border border-border/40 font-mono">
                <Hash className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-foreground font-bold tabular-nums">
                  {playerEntry.position.toLocaleString()}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card/50 border border-border/40 font-mono">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-foreground font-bold tabular-nums">
                  {playerEntry.rating.toLocaleString()}
                </span>
                <span className="text-muted-foreground text-xs">pts</span>
              </span>
            </>
          ) : (
            <span className="text-muted-foreground font-mono text-xs">
              {activeSeason != null ? "Loading..." : ""}
            </span>
          )}

          {/* Season selector */}
          {seasons.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-muted-foreground font-mono mr-1">
                Season
              </span>
              {seasons.map((s) => (
                <button
                  key={s}
                  onClick={() => setSelectedSeason(s)}
                  className={`min-w-[36px] h-7 px-2 text-xs font-mono rounded transition-colors ${
                    s === activeSeason
                      ? "bg-amber-500/15 text-amber-500 font-bold"
                      : "text-muted-foreground hover:text-foreground hover:bg-card/80 border border-border/30"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rating chart */}
      {activeSeason != null && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-amber-500/60 rounded-sm" />
            <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
              Rating &amp; Rank History
            </h2>
          </div>
          <RatingChart username={username} seasonId={activeSeason} />
        </section>
      )}
    </>
  );
}

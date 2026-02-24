import { useState } from "react";
import { StatsPanel } from "@/components/StatsPanel";
import { UserSearch } from "@/components/UserSearch";
import { RatingChart } from "@/components/RatingChart";
import { TitleRatingChart } from "@/components/TitleRatingChart";
import { fetchStats } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { Card, CardContent } from "@/components/ui/card";

export default function App() {
  const [searchedUser, setSearchedUser] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const {
    data: stats,
    loading,
    error,
  } = useFetch(() => fetchStats(), []);

  const seasonId = stats?.seasonId;

  const handleSearch = (username: string) => {
    setSearchLoading(true);
    setSearchedUser(username);
    setTimeout(() => setSearchLoading(false), 100);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Atmospheric background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/[0.02] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/[0.015] rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Header */}
        <header className="mb-10">
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

        {/* Stats */}
        <section className="mb-10">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="stat-card animate-pulse">
                  <CardContent className="p-5">
                    <div className="h-4 bg-white/5 rounded w-24 mb-3" />
                    <div className="h-8 bg-white/5 rounded w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error || !stats ? (
            <Card className="stat-card">
              <CardContent className="p-5 text-center text-muted-foreground">
                {error ?? "No data available"}
              </CardContent>
            </Card>
          ) : (
            <StatsPanel stats={stats} />
          )}
        </section>

        {/* Player Search */}
        {seasonId != null && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-5 bg-amber-500/60 rounded-sm" />
              <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
                Player Lookup
              </h2>
            </div>
            <UserSearch onSearch={handleSearch} loading={searchLoading} />
            {searchedUser && (
              <div className="mt-6">
                <RatingChart
                  username={searchedUser}
                  seasonId={seasonId}
                />
              </div>
            )}
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

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground/40 font-mono py-8 border-t border-border/30">
          Data collected every 30 minutes via official API
        </footer>
      </div>
    </div>
  );
}

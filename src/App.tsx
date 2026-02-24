import { useState } from "react";
import { StatsPanel } from "@/components/StatsPanel";
import { UserSearch } from "@/components/UserSearch";
import { RatingChart } from "@/components/RatingChart";
import { TitleRatingChart } from "@/components/TitleRatingChart";

const CURRENT_SEASON = 12;

export default function App() {
  const [searchedUser, setSearchedUser] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

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
            LEGENDARY LEADERBOARD TRACKER — SEASON {CURRENT_SEASON}
          </p>
        </header>

        {/* Stats */}
        <section className="mb-10">
          <StatsPanel seasonId={CURRENT_SEASON} />
        </section>

        {/* Player Search */}
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
                seasonId={CURRENT_SEASON}
              />
            </div>
          )}
        </section>

        {/* Title Cutoffs */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-amber-500/60 rounded-sm" />
            <h2 className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
              Title Thresholds
            </h2>
          </div>
          <TitleRatingChart seasonId={CURRENT_SEASON} />
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground/40 font-mono py-8 border-t border-border/30">
          Data collected every 30 minutes via official API
        </footer>
      </div>
    </div>
  );
}

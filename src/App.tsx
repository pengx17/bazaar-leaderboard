import { useState, useCallback } from "react";
import { Route, Switch } from "wouter";
import { Clock, Github } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HomePage } from "@/components/HomePage";
import { PlayerPage } from "@/components/PlayerPage";
import { SeasonSelector } from "@/components/SeasonSelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LocaleToggle } from "@/components/LocaleToggle";
import { fetchStats, formatSeasonName } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function App() {
  const { t } = useTranslation();
  const { data: stats } = useFetch(() => fetchStats(), []);
  const currentSeason = stats?.seasonId ?? null;
  const availableSeasons = stats?.availableSeasons ?? [];

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const activeSeason = selectedSeason ?? currentSeason;

  const handleSeasonChange = useCallback((season: number) => {
    setSelectedSeason(season);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Atmospheric background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/[0.02] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/[0.015] rounded-full blur-[120px]" />
      </div>

      {/* Navbar controls */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-1">
        {availableSeasons.length > 1 && activeSeason != null && (
          <SeasonSelector
            seasons={availableSeasons}
            activeSeason={activeSeason}
            onSeasonChange={handleSeasonChange}
          />
        )}
        <LocaleToggle />
        <ThemeToggle />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Switch>
          <Route path="/">
            <HomePage
              seasonId={activeSeason}
              seasonName={activeSeason != null ? formatSeasonName(activeSeason) : null}
            />
          </Route>
          <Route path="/player/:username">
            {(params) => (
              <PlayerPage
                params={params}
                seasonId={activeSeason}
              />
            )}
          </Route>
          <Route>
            <div className="text-center py-20 text-muted-foreground font-mono">
              {t("app.404")}
            </div>
          </Route>
        </Switch>

        <footer className="flex flex-col items-center gap-2 text-xs text-muted-foreground/40 font-mono py-8 border-t border-border/30 mt-10">
          <span>{t("app.footer")}</span>
          {stats && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {stats.seasonStart && (
                <>
                  <span>{formatTime(stats.seasonStart)}</span>
                  <span>—</span>
                </>
              )}
              <span>{formatTime(stats.snapshotTime)}</span>
            </span>
          )}
          <span className="flex items-center gap-3">
            <span>{t("app.inspiredBy")} <a href="https://bazaar.mrmao.life/" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors underline underline-offset-2">bazaar.mrmao.life</a></span>
            <span>·</span>
            <a href="https://github.com/pengx17/bazaar-leaderboard" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
              <Github className="w-3 h-3" />
              GitHub
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}

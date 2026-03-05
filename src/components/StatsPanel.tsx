import { Link } from "wouter";
import { TrendingUp, TrendingDown, Rocket, ArrowDownRight, UserPlus, Activity, BarChart3, Flame, Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StatsData } from "@/lib/api";

export function StatsPanel({ stats }: { stats: StatsData }) {
  const { t } = useTranslation();
  const hasMovers = stats.biggestGainer || stats.biggestLoser || stats.biggestClimber || stats.biggestFaller || stats.mostActive || stats.longestWinStreak;
  const hasExtras = stats.newEntries != null || stats.activeRatio != null || stats.medianRating != null;

  // Nothing interesting to show (e.g. old seasons with no delta data)
  if (!hasMovers && !hasExtras) return null;

  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-4 py-3 rounded-lg bg-card/50 border border-border/40 text-sm">
      {/* Row 1: players */}
      <span className="text-muted-foreground/50 font-mono text-[10px] uppercase tracking-wider pt-0.5">
        {t("stats.players")}
      </span>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {stats.biggestGainer && (
          <StatItem
            icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
            label={t("stats.hotStreak")}
            username={stats.biggestGainer.username}
            accent={`+${stats.biggestGainer.delta.toLocaleString()}`}
            accentColor="text-emerald-500"
          />
        )}
        {stats.biggestLoser && (
          <StatItem
            icon={<TrendingDown className="w-3.5 h-3.5 text-red-400" />}
            label={t("stats.coldStreak")}
            username={stats.biggestLoser.username}
            accent={stats.biggestLoser.delta.toLocaleString()}
            accentColor="text-red-400"
          />
        )}
        {stats.biggestClimber && (
          <StatItem
            icon={<Rocket className="w-3.5 h-3.5 text-violet-400" />}
            label={t("stats.climber")}
            username={stats.biggestClimber.username}
            accent={`+${stats.biggestClimber.positionDelta.toLocaleString()}`}
            accentColor="text-violet-400"
          />
        )}
        {stats.biggestFaller && (
          <StatItem
            icon={<ArrowDownRight className="w-3.5 h-3.5 text-orange-400" />}
            label={t("stats.faller")}
            username={stats.biggestFaller.username}
            accent={stats.biggestFaller.positionDelta.toLocaleString()}
            accentColor="text-orange-400"
          />
        )}
        {stats.mostActive && (
          <StatItem
            icon={<Flame className="w-3.5 h-3.5 text-amber-500" />}
            label={t("stats.mostActive")}
            username={stats.mostActive.username}
            accent={`${stats.mostActive.games} ${t("player.games")}`}
            accentColor="text-amber-500"
          />
        )}
        {stats.longestWinStreak && stats.longestWinStreak.streak > 1 && (
          <StatItem
            icon={<Trophy className="w-3.5 h-3.5 text-yellow-500" />}
            label={t("stats.winStreak")}
            username={stats.longestWinStreak.username}
            accent={`${stats.longestWinStreak.streak}×`}
            accentColor="text-yellow-500"
          />
        )}
      </div>
      {/* Row 2: numbers */}
      {hasExtras && (
        <>
          <span className="text-muted-foreground/50 font-mono text-[10px] uppercase tracking-wider pt-0.5 border-t border-border/30 pt-2">
            {t("stats.overview")}
          </span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border/30 pt-2">
            {stats.medianRating != null && (
              <MiniStat
                icon={<BarChart3 className="w-3.5 h-3.5 text-blue-400" />}
                label={t("stats.median")}
                value={stats.medianRating.toLocaleString()}
                color="text-blue-400"
              />
            )}
            {stats.activePlayers != null && stats.activeRatio != null && (
              <MiniStat
                icon={<Activity className="w-3.5 h-3.5 text-emerald-400" />}
                label={t("stats.active")}
                value={`${stats.activePlayers.toLocaleString()} (${stats.activeRatio}%)`}
                color="text-emerald-400"
              />
            )}
            {stats.newEntries != null && stats.newEntries > 0 && (
              <MiniStat
                icon={<UserPlus className="w-3.5 h-3.5 text-sky-400" />}
                label={t("stats.newEntries")}
                value={stats.newEntries.toLocaleString()}
                color="text-sky-400"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatItem({
  icon,
  label,
  username,
  accent,
  accentColor = "text-amber-500",
}: {
  icon: React.ReactNode;
  label: string;
  username: string;
  accent?: string;
  accentColor?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
        {label}
      </span>
      <Link
        href={`/player/${encodeURIComponent(username)}`}
        className="font-bold text-foreground hover:text-amber-500 transition-colors"
      >
        {username}
      </Link>
      {accent && (
        <span className={`font-mono text-xs tabular-nums ${accentColor}`}>
          {accent}
        </span>
      )}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  color = "text-foreground",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
        {label}
      </span>
      <span className={`font-mono text-xs font-bold tabular-nums ${color}`}>
        {value}
      </span>
    </div>
  );
}

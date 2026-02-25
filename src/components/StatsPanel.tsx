import { Link } from "wouter";
import { Crown, TrendingUp, TrendingDown, Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { StatsData } from "@/lib/api";

export function StatsPanel({ stats }: { stats: StatsData }) {
  const { t } = useTranslation();
  const hasMovers = stats.biggestGainer || stats.biggestLoser || stats.biggestClimber;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 rounded-lg bg-card/50 border border-border/40 text-sm">
      <StatItem
        icon={<Crown className="w-3.5 h-3.5 text-amber-500" />}
        label="#1"
        username={stats.topPlayer?.username ?? "—"}
        accent={String(stats.topPlayer?.rating ?? "")}
      />
      {hasMovers && <Divider />}
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

function Divider() {
  return <div className="hidden sm:block w-px h-4 bg-border/50" />;
}

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Crown, Users, Minus } from "lucide-react";
import type { StatsData } from "@/lib/api";

export function StatsPanel({ stats }: { stats: StatsData }) {
  const snapshotDate = new Date(stats.snapshotTime);
  const timeAgo = getTimeAgo(snapshotDate);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        Last snapshot {timeAgo}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Top Player */}
        <Card className="stat-card group">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                #1 Player
              </span>
              <Crown className="w-4 h-4 text-amber-500 group-hover:animate-bounce" />
            </div>
            {stats.topPlayer ? (
              <>
                <p className="text-lg font-bold text-foreground truncate">
                  {stats.topPlayer.username}
                </p>
                <p className="text-2xl font-mono font-black text-amber-500 tabular-nums">
                  {stats.topPlayer.rating.toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>

        {/* Daily Change */}
        <Card className="stat-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                24h Change
              </span>
              {stats.dailyTopChange != null && stats.dailyTopChange > 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              ) : stats.dailyTopChange != null && stats.dailyTopChange < 0 ? (
                <TrendingDown className="w-4 h-4 text-red-500" />
              ) : (
                <Minus className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <p
              className={`text-2xl font-mono font-black tabular-nums ${
                stats.dailyTopChange != null && stats.dailyTopChange > 0
                  ? "text-emerald-500"
                  : stats.dailyTopChange != null && stats.dailyTopChange < 0
                    ? "text-red-500"
                    : "text-muted-foreground"
              }`}
            >
              {stats.dailyTopChange != null
                ? `${stats.dailyTopChange > 0 ? "+" : ""}${stats.dailyTopChange}`
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Top player rating delta
            </p>
          </CardContent>
        </Card>

        {/* Total Players */}
        <Card className="stat-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Legends
              </span>
              <Users className="w-4 h-4 text-amber-500/60" />
            </div>
            <p className="text-2xl font-mono font-black text-foreground tabular-nums">
              {stats.totalEntries.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Total ranked players
            </p>
          </CardContent>
        </Card>

        {/* Bottom Player */}
        <Card className="stat-card">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Threshold
              </span>
              <Badge
                variant="secondary"
                className="text-[10px] font-mono px-1.5 py-0"
              >
                FLOOR
              </Badge>
            </div>
            {stats.bottomPlayer ? (
              <>
                <p className="text-lg font-bold text-foreground truncate">
                  {stats.bottomPlayer.username}
                </p>
                <p className="text-2xl font-mono font-black text-muted-foreground tabular-nums">
                  {stats.bottomPlayer.rating.toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

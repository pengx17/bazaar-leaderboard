import { Crown, Users, ArrowDown } from "lucide-react";
import type { StatsData } from "@/lib/api";

export function StatsPanel({ stats }: { stats: StatsData }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 rounded-lg bg-card/50 border border-border/40 text-sm">
      <StatItem
        icon={<Crown className="w-3.5 h-3.5 text-amber-500" />}
        label="#1"
        value={stats.topPlayer?.username ?? "—"}
        accent={String(stats.topPlayer?.rating ?? "")}
      />
      <Divider />
      <StatItem
        icon={<Users className="w-3.5 h-3.5 text-amber-500/60" />}
        label="Legends"
        value={stats.totalEntries.toLocaleString()}
      />
      <Divider />
      <StatItem
        icon={<ArrowDown className="w-3.5 h-3.5 text-muted-foreground" />}
        label="Floor"
        value={stats.bottomPlayer?.username ?? "—"}
        accent={String(stats.bottomPlayer?.rating ?? "")}
      />
    </div>
  );
}

function StatItem({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
        {label}
      </span>
      <span className="font-bold text-foreground">{value}</span>
      {accent && (
        <span className="font-mono text-xs text-amber-500 tabular-nums">
          {accent}
        </span>
      )}
    </div>
  );
}

function Divider() {
  return <div className="hidden sm:block w-px h-4 bg-border/50" />;
}

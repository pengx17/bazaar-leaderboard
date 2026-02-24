import { useState, useCallback } from "react";
import { Link } from "wouter";
import { Search, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { fetchLeaderboard } from "@/lib/api";
import type { LeaderboardEntry } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";

const PAGE_SIZE = 50;

export function LeaderboardTable({ seasonId }: { seasonId: number }) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, loading, error } = useFetch(
    () =>
      fetchLeaderboard({
        seasonId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: search || undefined,
      }),
    [seasonId, page, search]
  );

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSearch(searchInput);
      setPage(0);
    },
    [searchInput]
  );

  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    setSearch("");
    setPage(0);
  }, []);

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search player..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-10 pr-20 py-2.5 bg-card/50 border border-border/40 rounded-lg text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
          {search && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="px-2 py-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
          )}
          <button
            type="submit"
            className="px-3 py-1 text-xs font-mono bg-amber-500/10 text-amber-500 rounded hover:bg-amber-500/20 transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="rounded-lg border border-border/40 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[4rem_1fr_6rem] sm:grid-cols-[5rem_1fr_8rem] items-center px-4 py-2.5 bg-card/30 border-b border-border/30 text-xs font-mono uppercase tracking-widest text-muted-foreground">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">Rating</span>
        </div>

        {/* Body */}
        {loading ? (
          <div className="divide-y divide-border/20">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[4rem_1fr_6rem] sm:grid-cols-[5rem_1fr_8rem] items-center px-4 py-3 animate-pulse"
              >
                <div className="h-4 bg-white/5 rounded w-8" />
                <div className="h-4 bg-white/5 rounded w-32" />
                <div className="h-4 bg-white/5 rounded w-12 ml-auto" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {error}
          </div>
        ) : !data || data.entries.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground font-mono">
            {search
              ? `No players found for "${search}"`
              : "No leaderboard data"}
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {data.entries.map((entry) => (
              <LeaderboardRow key={`${entry.position}-${entry.username}`} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {search
              ? `${data?.total.toLocaleString()} results`
              : `${(page * PAGE_SIZE + 1).toLocaleString()}–${Math.min((page + 1) * PAGE_SIZE, data?.total ?? 0).toLocaleString()} of ${data?.total.toLocaleString()}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded hover:bg-card/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <PageNumbers
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded hover:bg-card/80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const isTop3 = entry.position <= 3;
  const isTop10 = entry.position <= 10;
  const isTop100 = entry.position <= 100;

  return (
    <Link
      href={`/player/${encodeURIComponent(entry.username)}`}
      className="grid grid-cols-[4rem_1fr_6rem] sm:grid-cols-[5rem_1fr_8rem] items-center px-4 py-2.5 hover:bg-amber-500/[0.04] transition-colors cursor-pointer group"
    >
      {/* Rank */}
      <span className="flex items-center gap-1.5">
        {isTop3 ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/15 text-amber-500">
            <Trophy className="w-3 h-3" />
          </span>
        ) : (
          <span
            className={`font-mono text-sm tabular-nums ${
              isTop10
                ? "text-amber-500/80 font-bold"
                : isTop100
                  ? "text-foreground/80"
                  : "text-muted-foreground"
            }`}
          >
            {entry.position}
          </span>
        )}
        {isTop3 && (
          <span className="font-mono text-xs text-amber-500 font-bold tabular-nums">
            {entry.position}
          </span>
        )}
      </span>

      {/* Player name */}
      <span
        className={`text-sm truncate group-hover:text-amber-500 transition-colors ${
          isTop10 ? "font-bold text-foreground" : "text-foreground/90"
        }`}
      >
        {entry.username}
      </span>

      {/* Rating */}
      <span
        className={`text-right font-mono text-sm tabular-nums ${
          isTop3
            ? "text-amber-500 font-bold"
            : isTop10
              ? "text-foreground font-semibold"
              : "text-muted-foreground"
        }`}
      >
        {entry.rating.toLocaleString()}
      </span>
    </Link>
  );
}

function PageNumbers({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages: (number | "...")[] = [];
  const maxVisible = 5;

  if (totalPages <= maxVisible + 2) {
    for (let i = 0; i < totalPages; i++) pages.push(i);
  } else {
    pages.push(0);
    const start = Math.max(1, currentPage - 1);
    const end = Math.min(totalPages - 2, currentPage + 1);

    if (start > 1) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 2) pages.push("...");
    pages.push(totalPages - 1);
  }

  return (
    <div className="flex items-center gap-0.5">
      {pages.map((p, i) =>
        p === "..." ? (
          <span
            key={`ellipsis-${i}`}
            className="px-1.5 text-xs text-muted-foreground"
          >
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[28px] h-7 px-1.5 text-xs font-mono rounded transition-colors ${
              p === currentPage
                ? "bg-amber-500/15 text-amber-500 font-bold"
                : "text-muted-foreground hover:text-foreground hover:bg-card/80"
            }`}
          >
            {p + 1}
          </button>
        )
      )}
    </div>
  );
}

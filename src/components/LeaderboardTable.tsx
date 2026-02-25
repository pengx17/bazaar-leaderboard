import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Link } from "wouter";
import { Search, ChevronLeft, ChevronRight, Trophy, X } from "lucide-react";
import { fetchLeaderboard } from "@/lib/api";
import type { LeaderboardEntry } from "@/lib/api";
import { useFetch } from "@/lib/use-fetch";
import { PinButton } from "@/components/PinButton";
import { usePinnedPlayers } from "@/lib/pinned-players";

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function LeaderboardTable({ seasonId }: { seasonId: number }) {
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput.trim(), DEBOUNCE_MS);
  const prevSearchRef = useRef(debouncedSearch);
  const { pinned } = usePinnedPlayers();

  // Reset page to 0 when search term changes
  useEffect(() => {
    if (prevSearchRef.current !== debouncedSearch) {
      prevSearchRef.current = debouncedSearch;
      setPage(0);
    }
  }, [debouncedSearch]);

  const { data, loading, error } = useFetch(
    () =>
      fetchLeaderboard({
        seasonId,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        search: debouncedSearch || undefined,
      }),
    [seasonId, page, debouncedSearch]
  );

  // Fetch pinned players' entries (only when not searching)
  const pinnedKey = pinned.join(",");
  const showPinned = pinned.length > 0 && !debouncedSearch;
  const { data: pinnedEntries } = useFetch(
    () =>
      showPinned
        ? Promise.all(
            pinned.map(async (username) => {
              const result = await fetchLeaderboard({
                seasonId,
                search: username,
                limit: 1,
              });
              return (
                result.entries.find(
                  (e) => e.username.toLowerCase() === username.toLowerCase()
                ) ?? null
              );
            })
          ).then((entries) =>
            entries.filter((e): e is LeaderboardEntry => e !== null)
          )
        : Promise.resolve([]),
    [seasonId, pinnedKey, debouncedSearch]
  );

  // Deduplicate: remove pinned players from regular rows
  const pinnedUsernames = useMemo(
    () => new Set((pinnedEntries ?? []).map((e) => e.username.toLowerCase())),
    [pinnedEntries]
  );
  const regularEntries = useMemo(
    () =>
      data?.entries.filter(
        (e) => !pinnedUsernames.has(e.username.toLowerCase())
      ) ?? [],
    [data?.entries, pinnedUsernames]
  );

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    setPage(0);
  }, []);

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search player..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full pl-10 pr-10 py-2.5 bg-card/50 border border-border/40 rounded-lg text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
        />
        {searchInput && (
          <button
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border/40 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[4rem_1fr_6rem_2rem] sm:grid-cols-[5rem_1fr_8rem_2.5rem] items-center px-4 py-2.5 bg-card/30 border-b border-border/30 text-xs font-mono uppercase tracking-widest text-muted-foreground">
          <span>Rank</span>
          <span>Player</span>
          <span className="text-right">Rating</span>
          <span />
        </div>

        {/* Body */}
        {loading ? (
          <div className="divide-y divide-border/20">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[4rem_1fr_6rem_2rem] sm:grid-cols-[5rem_1fr_8rem_2.5rem] items-center px-4 py-3 animate-pulse"
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
            {debouncedSearch
              ? `No players found for "${debouncedSearch}"`
              : "No leaderboard data"}
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {/* Pinned rows */}
            {showPinned && pinnedEntries && pinnedEntries.length > 0 && (
              <div className="divide-y divide-amber-500/10 bg-amber-500/[0.03] border-b border-amber-500/20">
                {pinnedEntries.map((entry) => (
                  <LeaderboardRow
                    key={`pinned-${entry.username}`}
                    entry={entry}
                    pinned
                  />
                ))}
              </div>
            )}
            {/* Regular rows */}
            {regularEntries.map((entry) => (
              <LeaderboardRow key={`${entry.position}-${entry.username}`} entry={entry} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {debouncedSearch
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

function LeaderboardRow({
  entry,
  pinned,
}: {
  entry: LeaderboardEntry;
  pinned?: boolean;
}) {
  const isTop3 = entry.position <= 3;
  const isTop10 = entry.position <= 10;
  const isTop100 = entry.position <= 100;

  return (
    <Link
      href={`/player/${encodeURIComponent(entry.username)}`}
      className={`grid grid-cols-[4rem_1fr_6rem_2rem] sm:grid-cols-[5rem_1fr_8rem_2.5rem] items-center px-4 py-2.5 transition-colors cursor-pointer group ${
        pinned
          ? "hover:bg-amber-500/[0.06]"
          : "hover:bg-amber-500/[0.04]"
      }`}
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

      {/* Pin */}
      <span className={`flex justify-center transition-opacity ${
        pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}>
        <PinButton username={entry.username} size="sm" />
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

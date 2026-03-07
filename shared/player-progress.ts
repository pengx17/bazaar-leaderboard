export interface RatingPointLike {
  rating: number;
}

export interface PlayerProgress {
  estimatedGames: number;
  longestWinStreak: number;
}

export function isMissingProgressColumnError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /no such column: (estimated_games|longest_win_streak)/i.test(err.message)
  );
}

export function computePlayerProgressFromHistory<T extends RatingPointLike>(
  history: T[]
): PlayerProgress {
  let estimatedGames = 0;
  let currentWinStreak = 0;
  let longestWinStreak = 0;

  for (let i = 1; i < history.length; i++) {
    const delta = history[i].rating - history[i - 1].rating;

    if (delta > 0) {
      estimatedGames++;
      currentWinStreak++;
      if (currentWinStreak > longestWinStreak) {
        longestWinStreak = currentWinStreak;
      }
    } else if (delta < 0) {
      estimatedGames++;
      currentWinStreak = 0;
    }
  }

  return {
    estimatedGames,
    longestWinStreak,
  };
}

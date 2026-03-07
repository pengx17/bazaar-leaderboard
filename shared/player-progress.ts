export interface RatingPointLike {
  rating: number;
}

export interface PlayerProgress {
  estimatedGames: number;
  currentWinStreak: number;
  longestWinStreak: number;
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
    currentWinStreak,
    longestWinStreak,
  };
}

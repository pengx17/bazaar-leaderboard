export default {
  // App
  "app.404": "404 — Not Found",
  "app.footer": "Data collected every 30 minutes via official API",

  // HomePage
  "home.title": "The Bazaar",
  "home.subtitle": "LEGENDARY LEADERBOARD TRACKER",
  "home.subtitleSeason": "LEGENDARY LEADERBOARD TRACKER — SEASON {{seasonId}}",
  "home.noData": "No data available",
  "home.leaderboard": "Leaderboard",
  "home.titleThresholds": "Title Thresholds",

  // StatsPanel
  "stats.legends": "Legends",
  "stats.floor": "Floor",

  // LeaderboardTable
  "leaderboard.searchPlaceholder": "Search player...",
  "leaderboard.rank": "Rank",
  "leaderboard.player": "Player",
  "leaderboard.rating": "Rating",
  "leaderboard.noResults": 'No players found for "{{search}}"',
  "leaderboard.noData": "No leaderboard data",
  "leaderboard.results": "{{total}} results",
  "leaderboard.pageInfo": "{{start}}–{{end}} of {{total}}",

  // PlayerPage
  "player.back": "Back to Leaderboard",
  "player.season": "Season",
  "player.ratingHistory": "Rating & Rank History",

  // RatingChart
  "chart.playerTracking": "Player Tracking",
  "chart.noData": 'No data found for "{{username}}"',
  "chart.rating": "Rating",
  "chart.rank": "Rank",
  "chart.position": "Position",

  // TitleRatingChart
  "titleChart.heading": "Title Cutoff Lines",
  "titleChart.description":
    "Minimum rating to reach each title tier this season",
  "titleChart.noData": "No title rating data available",
  "titleChart.top10": "Top 10",
  "titleChart.top100": "Top 100",
  "titleChart.top1000": "Top 1000",

  // PinnedPlayersChart
  "pinned.heading": "Pinned Players",
  "pinned.ratingHistory": "Rating history for pinned players this season",
  "pinned.rankHistory": "Rank history for pinned players this season",
  "pinned.clearAll": "Clear all pinned players",

  // PinButton
  "pin.unpin": "Unpin {{username}}",
  "pin.pin": "Pin {{username}}",
  "pin.maxReached": "Max {{max}} pinned players",

  // RatingPrediction
  "prediction.heading": "Top 1000 Prediction",
  "prediction.alreadyIn": "Already in Top 1000!",
  "prediction.currentRank": "Current rank: #{{rank}}",
  "prediction.ratingGap": "Rating Gap",
  "prediction.target": "Target: {{target}}",
  "prediction.avgWins": "Avg Wins / Game",
  "prediction.tenWinRate": "10-win rate: {{rate}}%",
  "prediction.estGames": "Est. Games Needed",
  "prediction.equilibrium": "Equilibrium",
  "prediction.equilibriumSub": "Rating ceiling at current skill",
  "prediction.needAvgWins": "Need Avg Wins",
  "prediction.needAvgWinsSub": "To sustain target rating",
  "prediction.stallWarning":
    "At current win rate, rating stalls around {{rating}} — need higher avg wins to reach top 1000.",
  "prediction.formula": "ΔR = 5(W − R/100)",
  "prediction.formula10win": "+ 5 for 10-win",
  "prediction.basedOn": "Based on {{count}} game sessions.",
  "prediction.assumesThreshold":
    "Assumes top-1000 threshold stays at {{threshold}}.",

  // ThemeToggle
  "theme.switchToLight": "Switch to light mode",
  "theme.switchToDark": "Switch to dark mode",
} as const;

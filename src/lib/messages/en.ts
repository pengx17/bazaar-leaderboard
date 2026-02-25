export default {
  // App
  "app.404": "404 — Not Found",
  "app.footer": "Data collected every 30 minutes via official API",

  // HomePage
  "home.title": "The Bazaar",
  "home.subtitle": "LEGENDARY LEADERBOARD TRACKER",
  "home.subtitleSeason": "LEGENDARY LEADERBOARD TRACKER — {{season}}",
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
  "prediction.heading": "Rank Prediction",
  "prediction.tier.top10": "Top 10",
  "prediction.tier.top100": "Top 100",
  "prediction.tier.top1000": "Top 1000",
  "prediction.elite": "You are an elite Top 10 player!",
  "prediction.currentRank": "Current rank: #{{rank}}",
  "prediction.ratingGap": "Rating Gap",
  "prediction.target": "{{tier}} target: {{target}}",
  "prediction.avgWins": "Avg Wins / Game",
  "prediction.tenWinRate": "10-win rate: {{rate}}%",
  "prediction.estGames": "Est. Games Needed",
  "prediction.estGamesSub": "To reach {{tier}}",
  "prediction.equilibrium": "Equilibrium",
  "prediction.equilibriumSub": "Rating ceiling at current skill",
  "prediction.needAvgWins": "Need Avg Wins",
  "prediction.needAvgWinsSub": "To sustain target rating",
  "prediction.stallWarning":
    "At current win rate, rating stalls around {{rating}} — need higher avg wins to reach {{tier}}.",
  "prediction.formula": "ΔR = 5(W − R/100)",
  "prediction.formula10win": "+ 5 for 10-win",
  "prediction.basedOn": "Based on {{count}} game sessions.",
  "prediction.assumesThreshold":
    "Assumes {{tier}} threshold stays at {{threshold}}.",

  "prediction.noHistory":
    "Need at least 2 rating snapshots to predict. Data is collected every 30 minutes — check back soon.",
  "prediction.fewGames":
    "Need at least 5 game sessions (rating changes) to predict. Keep playing!",
  "prediction.noThreshold":
    "Threshold data not available yet for this season.",

  // ThemeToggle
  "theme.switchToLight": "Switch to light mode",
  "theme.switchToDark": "Switch to dark mode",
} as const;

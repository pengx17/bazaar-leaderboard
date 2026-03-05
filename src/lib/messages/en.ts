export default {
  // App
  "app.404": "404 — Not Found",
  "app.footer": "Data collected every 15 minutes via official API",
  "app.inspiredBy": "Inspired by",

  // HomePage
  "home.title": "The Bazaar",
  "home.subtitle": "LEGENDARY LEADERBOARD TRACKER",
  "home.subtitleSeason": "LEGENDARY LEADERBOARD TRACKER — {{season}}",
  "home.noData": "No data available",
  "home.leaderboard": "Leaderboard",
  "home.titleThresholds": "Title Thresholds",

  // StatsPanel
  "stats.players": "Players",
  "stats.overview": "Overview",
  "stats.hotStreak": "Hot",
  "stats.coldStreak": "Cold",
  "stats.climber": "Climber",
  "stats.faller": "Faller",
  "stats.newEntries": "New",
  "stats.active": "Active",
  "stats.median": "Median",
  "stats.mostActive": "Grinder",
  "stats.winStreak": "Streak",

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
  "player.games": "games",
  "player.winStreak": "win streak",
  "player.ratingHistory": "Rating & Rank History",

  // RatingChart
  "chart.playerTracking": "Player Tracking",
  "chart.noData": 'No data found for "{{username}}"',
  "chart.rating": "Rating",
  "chart.rank": "Rank",
  "chart.position": "Rank",

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
  "prediction.equilibriumSub": "Projected steady-state rating",
  "prediction.needAvgWins": "Need Avg Wins",
  "prediction.needAvgWinsSub": "To sustain target rating",
  "prediction.stallWarning":
    "At current win rate, rating is projected to plateau around {{rating}}. Reaching {{tier}} requires a higher avg wins.",
  "prediction.formula": "ΔR = 5(W − R/100)",
  "prediction.formula10win": "+ 5 for 10-win",
  "prediction.basedOn": "Based on {{count}} game sessions.",
  "prediction.assumesThreshold":
    "Assumes {{tier}} threshold stays at {{threshold}}.",

  "prediction.noHistory":
    "Gathering data — predictions will be available shortly (updated every 15 min).",
  "prediction.fewGames":
    "Collecting data — predictions unlock after 10 recorded sessions in Legendary.",
  "prediction.noThreshold":
    "Threshold data not available yet for this season.",

  // ThemeToggle
  "theme.switchToLight": "Switch to light mode",
  "theme.switchToDark": "Switch to dark mode",
} as const;

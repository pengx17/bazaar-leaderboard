export default {
  // App
  "app.404": "404 — 页面未找到",
  "app.footer": "每 30 分钟通过官方 API 采集数据",

  // HomePage
  "home.title": "The Bazaar",
  "home.subtitle": "传奇排行榜追踪器",
  "home.subtitleSeason": "传奇排行榜追踪器 — {{season}}",
  "home.noData": "暂无数据",
  "home.leaderboard": "排行榜",
  "home.titleThresholds": "段位门槛",

  // StatsPanel
  "stats.legends": "传奇玩家",
  "stats.floor": "门槛",

  // LeaderboardTable
  "leaderboard.searchPlaceholder": "搜索玩家...",
  "leaderboard.rank": "排名",
  "leaderboard.player": "玩家",
  "leaderboard.rating": "分数",
  "leaderboard.noResults": '未找到 "{{search}}" 相关玩家',
  "leaderboard.noData": "暂无排行榜数据",
  "leaderboard.results": "{{total}} 条结果",
  "leaderboard.pageInfo": "{{start}}–{{end}} / {{total}}",

  // PlayerPage
  "player.back": "返回排行榜",
  "player.season": "赛季",
  "player.ratingHistory": "分数与排名历史",

  // RatingChart
  "chart.playerTracking": "玩家追踪",
  "chart.noData": '未找到 "{{username}}" 的数据',
  "chart.rating": "分数",
  "chart.rank": "排名",
  "chart.position": "排名",

  // TitleRatingChart
  "titleChart.heading": "段位分数线",
  "titleChart.description": "本赛季各段位最低分数要求",
  "titleChart.noData": "暂无段位分数数据",
  "titleChart.top10": "前 10",
  "titleChart.top100": "前 100",
  "titleChart.top1000": "前 1000",

  // PinnedPlayersChart
  "pinned.heading": "关注的玩家",
  "pinned.ratingHistory": "本赛季关注玩家的分数变化",
  "pinned.rankHistory": "本赛季关注玩家的排名变化",
  "pinned.clearAll": "清除所有关注",

  // PinButton
  "pin.unpin": "取消关注 {{username}}",
  "pin.pin": "关注 {{username}}",
  "pin.maxReached": "最多关注 {{max}} 名玩家",

  // RatingPrediction
  "prediction.heading": "前 1000 预测",
  "prediction.alreadyIn": "已进入前 1000！",
  "prediction.currentRank": "当前排名：第 {{rank}} 名",
  "prediction.ratingGap": "分差",
  "prediction.target": "目标：{{target}}",
  "prediction.avgWins": "场均胜场",
  "prediction.tenWinRate": "10 胜率：{{rate}}%",
  "prediction.estGames": "预计还需场次",
  "prediction.equilibrium": "均衡分数",
  "prediction.equilibriumSub": "当前实力对应的分数上限",
  "prediction.needAvgWins": "所需场均胜场",
  "prediction.needAvgWinsSub": "维持目标分数所需",
  "prediction.stallWarning":
    "按当前胜率，分数将停滞在 {{rating}} 附近 — 需要更高的场均胜场才能进入前 1000。",
  "prediction.formula": "ΔR = 5(W − R/100)",
  "prediction.formula10win": "10 胜 +5",
  "prediction.basedOn": "基于 {{count}} 场对局数据。",
  "prediction.assumesThreshold": "假设前 1000 门槛保持在 {{threshold}}。",

  "prediction.noHistory":
    "需要至少 2 个分数快照才能预测。数据每 30 分钟采集一次，请稍后再看。",
  "prediction.noThreshold": "本赛季的前 1000 门槛数据暂不可用。",

  // ThemeToggle
  "theme.switchToLight": "切换到亮色模式",
  "theme.switchToDark": "切换到暗色模式",
} as const;

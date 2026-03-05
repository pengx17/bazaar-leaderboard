# The Bazaar Leaderboard Tracker

A community-built leaderboard tracker for [The Bazaar](https://www.thebazaar.com/) Legendary ranked mode. Tracks player ratings, rank changes, and title thresholds over time.

**Live site:** [bazaar-leaderboard.pages.dev](https://bazaar-leaderboard.pages.dev)

## Features

- **Live Leaderboard** — Searchable, paginated player rankings with 24h rating/position deltas
- **Player Profiles** — Individual rating & rank history charts with forward-filled sparse data
- **Rank Prediction** — Estimates games needed to reach the next tier based on recent performance
- **Title Thresholds** — Historical cutoff lines for Top 10 / Top 100 / Top 1000
- **Pin & Compare** — Pin up to 5 players to overlay their rating or rank curves
- **Fun Stats** — Hot streaks, biggest climbers/fallers, new entries, active ratio, median rating
- **Multi-Season** — Season selector with full history for past seasons
- **Dark / Light Theme** — Automatic + manual toggle
- **i18n** — English and Chinese

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, Vite, Tailwind CSS v4, shadcn/ui, ECharts |
| Backend | Cloudflare Pages Functions (serverless) |
| Database | Cloudflare D1 (SQLite) |
| Data Sync | GitHub Actions cron (every 15 min) |
| Routing | wouter |
| i18n | react-i18next |

## Architecture

```
┌─────────────────────────────────────────────────┐
│  GitHub Actions (cron */15)                     │
│  scripts/fetch-leaderboard.ts                   │
│  → Fetch official API → Dedup → Sync D1 tables  │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Cloudflare D1                                  │
│  ┌──────────────┐ ┌──────────────────────────┐  │
│  │ player_latest│ │ player_history           │  │
│  │ (leaderboard)│ │ (change-only snapshots)  │  │
│  └──────────────┘ └──────────────────────────┘  │
│  ┌──────────────┐ ┌──────────────────────────┐  │
│  │ snapshots    │ │ snapshot_metrics         │  │
│  │ (metadata)   │ │ (title thresholds)       │  │
│  └──────────────┘ └──────────────────────────┘  │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  Cloudflare Pages Functions  (functions/api/)   │
│  /api/leaderboard  /api/stats                   │
│  /api/rating-history  /api/title-rating-history │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│  React SPA (src/)                               │
│  HomePage → StatsPanel, LeaderboardTable,       │
│             PinnedPlayersChart, TitleRatingChart │
│  PlayerPage → RatingChart, RatingPrediction     │
└─────────────────────────────────────────────────┘
```

### Data Model

The tracker uses a **user-centric** data model optimized for change detection:

- **`player_latest`** — One row per player per season with current rating, position, and 24h deltas. Serves as the leaderboard source of truth.
- **`player_history`** — Appended only when a player's rating or position changes. Frontend forward-fills sparse data into continuous chart lines.
- **`snapshots`** / **`snapshot_metrics`** — Per-sync metadata and aggregated title threshold values (Top 10/100/1000 cutoffs).

## Development

### Prerequisites

- Node.js 20+
- A Cloudflare account (for D1 and Pages)

### Setup

```bash
npm install

# Start the dev server (frontend + Pages Functions)
npm run dev
```

### Project Structure

```
src/                    # React frontend
  components/           # UI components
  lib/                  # API client, hooks, i18n, utilities
functions/api/          # Cloudflare Pages Functions (serverless API)
scripts/
  fetch-leaderboard.ts  # Cron sync script (GitHub Actions)
  backfill-derived-tables.ts  # One-off backfill for snapshot_metrics
schema.sql              # D1 database schema
```

### Environment Variables

The sync script (`scripts/fetch-leaderboard.ts`) requires:

| Variable | Description |
|----------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | API token with D1 write access |
| `CLOUDFLARE_DATABASE_ID` | D1 database ID |

These are configured as GitHub Actions secrets.

### Deployment

The site auto-deploys to Cloudflare Pages on push to `main`. Data is synced by a GitHub Actions cron job every 15 minutes.

## Credits

- [bazaar.mrmao.life](https://bazaar.mrmao.life/) — The original Bazaar leaderboard tracker that inspired this project

## License

MIT

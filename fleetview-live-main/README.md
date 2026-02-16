# FleetView Live — Real-Time Fleet Tracking Dashboard

React frontend for the **Real-Time Vehicle Distribution Tracking System**. Provides a live map dashboard, route history playback, and CDC lag monitoring.

## Tech Stack

- **Vite** — Build tool & dev server
- **React 18** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** — Styling & component library
- **Leaflet** / **react-leaflet** — Map rendering
- **Zustand** — State management (auth, map positions, playback)
- **TanStack React Query** — Server state & API caching
- **Socket.io Client** — Real-time WebSocket updates
- **Bun** — Package manager & runtime

## Pages

| Route | Description |
|---|---|
| `/login` | JWT authentication |
| `/` | **Live Dashboard** — Real-time map with driver markers, fleet sidebar, stats grid |
| `/history` | **Route History** — Playback of historical routes with timeline slider and speed controls |
| `/monitoring` | **CDC Monitoring** — Per-table lag cards, Kafka offset lag table, summary (admin only) |

## Getting Started

```bash
# Install dependencies
bun install

# Start dev server (connects to tracking-service at localhost:3000)
bun run dev
```

The app expects the NestJS tracking service running at `http://localhost:3000` (configurable via `VITE_API_URL`).

## Project Structure

```
src/
├── components/
│   ├── dashboard/    # TrackingMap, FleetSidebar, DriverCard, StatsGrid, MapControls, MapLegend
│   ├── history/      # HistoryMap, HistorySidebar, PlaybackControls
│   ├── monitoring/   # LagCard, LagSparkline, OffsetLagTable, CdcSummaryBar
│   ├── layout/       # AppLayout, ProtectedRoute
│   └── ui/           # shadcn/ui components (Button, Card, Dialog, etc.)
├── hooks/
│   ├── api/          # React Query hooks (useDrivers, useRoutes, useHistory, etc.)
│   ├── useSocket.ts  # WebSocket connection management
│   └── useDriverPositions.ts  # Real-time position subscription
├── pages/            # Route pages (Index, LoginPage, HistoryPage, MonitoringPage)
├── stores/           # Zustand stores (auth, map, playback)
├── types/            # TypeScript interfaces
├── config/           # Environment configuration
└── lib/              # Axios instance, Socket.io client, utilities
```

## Key Features

- **Live Map** — Driver markers with status colors (moving/idle/offline), heading rotation, fly-to-driver, popup details
- **Fleet Sidebar** — Real-time driver list with search, status filters, route assignment
- **Route History Playback** — Timeline scrubbing, speed control (1x–16x), traversed/remaining path visualization, visit stop markers
- **CDC Monitoring** — Real-time lag metrics per table, sparkline charts, Kafka offset tracking
- **Authentication** — JWT login with token refresh, role-based route protection

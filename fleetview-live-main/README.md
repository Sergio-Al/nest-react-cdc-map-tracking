# FleetView Live — Real-Time Fleet Tracking Dashboard

React frontend for the **Real-Time Vehicle Distribution Tracking System**. Live map dashboard, route planning, route history playback, operational reports, and directory pages for drivers / vehicles / customers — all sharing a dense "Mission Control" aesthetic with a warm-dark theme.

## Tech Stack

- **Vite** + **React 18** + **TypeScript**
- **Tailwind CSS** + **shadcn/ui** — styling & component library
- **Leaflet** / **react-leaflet** — map rendering (CARTO light/dark tiles)
- **Zustand** — client/UI state (auth, map, playback, routeBuilder, reports, dashboard)
- **TanStack React Query** — server state & caching
- **Socket.io Client** — real-time WebSocket updates
- **next-themes** — light/dark theme toggle
- **date-fns** — date utilities
- **Bun** — package manager & runtime (npm also works)

## Pages

| Route | Description |
|---|---|
| `/login` | JWT authentication |
| `/` | **Live Dashboard** — real-time map, driver markers, fleet sidebar, command palette |
| `/routes` | **Route Builder** — drag-and-drop visit ordering, OSRM geometry, command-palette add-stop |
| `/history` | **Route History** — playback with timeline scrubbing, speed control, shared date-range picker |
| `/reports` | **Reports** — Overview KPIs, Routes (with drilldown), Visits, Drivers, Vehicles, Customers — saved filter views, CSV export |
| `/customers` | **Customers directory** — dense table, click-to-pin map in New Customer dialog, geofence preview |
| `/vehicles` | **Vehicles directory** — dense table, detail panel with assigned driver, Edit dialog |
| `/drivers` | **Drivers directory** — dense table, detail panel with last-known position mini-map |
| `/monitoring` | **CDC Monitoring** — per-table lag, Kafka offset lag table (admin only) |

## Getting Started

```bash
bun install         # or: npm install
bun dev             # or: npm run dev   → http://localhost:5173
bun run build       # or: npm run build
npm run lint
npm test            # vitest run
```

Copy `.env.example` → `.env` first; it points the app at the NestJS tracking service (`:3000`) and WebSocket. Configurable via `VITE_API_URL` / `VITE_WS_URL`.

Default demo login: `admin@tenant1.com` / `admin123` (tenant `tenant-1`).

## Project Structure

```
src/
├── components/
│   ├── customers/      # CustomersPage helpers — CustomerDetailPanel, CreateCustomerDialog (map-pin)
│   ├── dashboard/      # TrackingMap, MapWorkspace, DriverPanel, DriverInbox, MapControls, Footer
│   ├── drivers/        # DriverDetailPanel, CreateDriverDialog
│   ├── filters/        # FilterBar + FilterBuilder + useDatasetFilters (shared by directory & report tables)
│   ├── history/        # RouteHistoryFilter, RouteHistoryMap, RouteHistoryDetail, RouteHistoryPlaybackBar
│   ├── layout/         # AppLayout, IconRail, CommandPalette, ProtectedRoute, navigation
│   ├── monitoring/     # LagCard, LagSparkline, OffsetLagTable, CdcSummaryBar
│   ├── reports/        # ReportsHeader, OverviewTab, RoutesTab, DriversTab, DataTables, filter definitions
│   ├── routes/         # Route builder — sidebar, map, drag-and-drop visit cards, add-stop palette
│   ├── theme/          # ThemeProvider + theme toggle
│   ├── vehicles/       # VehicleDetailPanel, CreateVehicleDialog, EditVehicleDialog
│   └── ui/             # shadcn primitives + project primitives:
│                       #   table-shell (dense list shell), directory-detail-panel (340px sidebar),
│                       #   location-picker-map (Leaflet click-to-pin + geofence circle),
│                       #   date-range-picker, dense-form (Field/DenseInput/ChipGroup/DialogFormFooter)
├── hooks/
│   ├── api/            # React Query hooks: useDrivers, useVehicles, useRoutes, useRouteBuilder,
│   │                   #   useHistory, useReports, useDriverDetail
│   ├── useSocket.ts    # WebSocket connection management
│   ├── useDashboardHotkeys.ts
│   ├── useRouteBuilderActions.ts
│   └── useReportExporter.ts
├── pages/              # Index, LoginPage, HistoryPage, RoutesPage, ReportsPage,
│                       #   CustomersPage, VehiclesPage, DriversPage, MonitoringPage, NotFound
├── stores/             # Zustand: auth, map, playback, routeBuilder, reports, dashboard
├── lib/                # axios instance, Socket.io client, polyline decode, mock helpers
├── types/              # Shared TypeScript interfaces
└── config/             # Environment configuration
```

## Conventions

- **Data fetching:** add a React Query hook under `hooks/api/` rather than calling `fetch` inside components. Auth token comes from the `auth` Zustand store — attach as `Authorization: Bearer`.
- **Real-time:** `useSocket` connects to `http://localhost:3000/tracking` with the JWT and joins `tenant:`/`driver:`/`route:` rooms. Server emits `position:update`, `visit:update`, `cdc:lag`.
- **Backend writes are async (CDC):** after a `POST /customers` the new row appears via CDC after ~2s. The Customers page shows a yellow "syncing via CDC" banner during the propagation window — don't assume immediate read-after-write.
- **UI primitives over duplication:** new list pages should use `TableShell` + `Td` + `FilterBar` + `useDatasetFilters`. Detail panels should wrap `DirectoryDetailPanel`. Maps inside dialogs/panels should use `LocationPickerMap` (it owns its `leaflet/dist/leaflet.css` import). Form dialogs should use the `dense-form` primitives for visual consistency.
- **shadcn additions:** use the CLI (`components.json` config) — don't hand-edit generated files in `components/ui/*` that came from shadcn.
- **Theme:** Mission Control palette lives in CSS vars (`--mc-*`) — prefer `bg-mc-elev`, `border-mc-border-strong`, `text-mc-text-muted` etc. over arbitrary Tailwind colors so the warm-dark theme stays cohesive.

## Key Features

- **Live Dashboard** — driver markers with status colors (moving/idle/offline), heading rotation, follow-driver mode, popups, command palette (⌘K), driver inbox.
- **Route Builder** — drag-and-drop visit ordering, OSRM road-snapped geometry, click-pin add-stop on the map, customer command palette with derived category/frequency/urgency metadata.
- **Route History Playback** — timeline scrubbing, 1×–16× speed, traversed/remaining path coloring, stop markers, shared date-range picker (matches Reports).
- **Reports** — 6 tabs (Overview KPIs + heatmap + insights, Routes with drilldown, Visits, Drivers, Vehicles, Customers), date-range + comparison, saved filter views per dataset, CSV export.
- **Directory pages (Customers / Vehicles / Drivers)** — dense `TableShell` with sticky headers, `FilterBar` + saved views, 340px right-side `DirectoryDetailPanel` with Leaflet preview (geofence for customers, last-known position for drivers).
- **CDC Monitoring** — real-time lag per table, sparklines, Kafka offset tracking (admin only).
- **Authentication** — JWT login, role-gated UI (`admin` / `dispatcher` can mutate; `viewer` is read-only).

# scripts/

Operational tooling that runs **outside** the services, against a running stack. Run everything
from the repository root. The `.mts` simulators need Node ≥ 22.18 (native TypeScript, no npm
dependencies); SQL files are piped into the database containers with `docker exec`.

Related tooling lives elsewhere: k6 scenarios in [`load-tests/`](../load-tests/README.md),
AWS provisioning/deploy in [`deploy/aws/`](../deploy/aws/).

## `simulators/`

| Script | What it does |
|---|---|
| `simulate-route.mts` | Drives a real planned route through the **live GPS pipeline** (OSRM streets → Traccar OsmAnd :5055 → Kafka → enrichment → geofence auto-arrival/departure → visit completion). `--backfill <days>` seeds past workdays for History/Reports; `--clear-backfill` removes them. |
| `simulate-erp.mts` | The **Business-tier integration demo**: acts as the tenant's own ERP, writing directly to MySQL so changes reach the dashboard through Debezium CDC, printing commit → visible latency. `--with-routes --drive` closes the loop (ERP orders → route → simulated driver → order status written back to MySQL → CDC). Refuses to run unless the tenant's plan allows integration and it is switched on. |

```bash
node scripts/simulators/simulate-route.mts --list
node scripts/simulators/simulate-route.mts --route <uuid> [--dry-run]
node scripts/simulators/simulate-route.mts --backfill 45 | --clear-backfill

node scripts/simulators/simulate-erp.mts --once [--with-routes --drive] [--pause-connector]
node scripts/simulators/simulate-erp.mts --business-day --interval 60
node scripts/simulators/simulate-erp.mts --list-runs | --clear <run-id>
```

ERP run manifests (what each run created/edited, so `--clear` can undo it) are written to
`scripts/.erp-runs/` (gitignored). Each script's header documents every option.

## `cdc/`

| File | What it does |
|---|---|
| `register-cdc-connector.sh` | Registers/updates the Debezium MySQL connector (idempotent PUT). Normally not needed — the `cdc-connector-init` container does this on every `docker compose up`. |
| `cdc-connector-config.json` | The connector config, shared by the script and `cdc-connector-init` (mounted in `docker-compose.yml`). Edit it here. |

## `seeds/`

| File | Target DB | What it does |
|---|---|---|
| `seed-visit-completions.sql` | TimescaleDB | 30 days of demo `visit_completions` (prefer `simulate-route.mts --backfill` for coherent routes + positions). |
| `seed-load-test-drivers.sql` | cache-db | 1,000 load-test drivers `LOAD0001`–`LOAD1000` for the k6 scenarios. |
| `cleanup-load-test-drivers.sql` | cache-db | Removes those drivers and their positions. |

## `migrations/`

| File | What it does |
|---|---|
| `migrate-standalone-id-sequences.sql` | One-off for existing cache-db volumes: moves `customers_cache` / `orders_cache` id sequences to start at 1,000,000,000 so PG-owned (standalone) rows never collide with MySQL ids from CDC. Idempotent; only reports (never renumbers) old standalone orders below that range. `docker exec -i cache-db psql -U tracking -d tracking_cache < scripts/migrations/migrate-standalone-id-sequences.sql` |
| `migrate-daily-stats-tz.sql` | One-off for existing TimescaleDB volumes: rebuilds `driver_daily_stats` bucketed by `America/La_Paz`. Fresh installs already get it from the init scripts. |

## `demos/`

| File | What it does |
|---|---|
| `cdc-pipeline-demo.sh` | Presenter-driven CDC architecture demo in 5 acts (happy path, standalone contrast, integration-service down, MySQL down → DLQ → replay, poison message). Spanish narration; open Monitoring → Pipeline while it runs. `--auto` for rehearsal, `--act N` for one act. Stops/starts `integration-service` and `mysql` and always restores them on exit. |

## `smoke/`

| File | What it does |
|---|---|
| `smoke-customers-dual-mode.sh` | Same check for customers: standalone `201`/`200` and immediately readable, integrated `202` then arrives via CDC. Restores the tenant's original mode. |
| `smoke-orders-dual-mode.sh` | End-to-end check of the orders write path in both modes: standalone (direct PG) and integrated (Kafka → MySQL → CDC). `CLEAN=1` removes its rows. |

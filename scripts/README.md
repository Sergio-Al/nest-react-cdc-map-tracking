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

## `validation/`

| File | What it does |
|---|---|
| `validacion_haversine_geodesica.py` | Measures the error of the system's Haversine (`geo-utils.ts`, R = 6,371,000 m) against the WGS84 geodesic distance (Karney, geographiclib) over the 23 La Paz seed customers: 253 customer pairs plus 8 points on each geofence radius. Needs `pip install geographiclib==2.1`. `python3 scripts/validation/validacion_haversine_geodesica.py infrastructure/mysql/init/02-seed-customers-lapaz.sql` |
| `kafka-recovery-test.sh` | GPS event recovery under interruptions. **A**: stops tracking-service, publishes N positions straight to `gps.positions`, checks Kafka retains them (lag ≥ N) and that all N reach `enriched_positions` after the restart. **B**: publishes N while consuming, stops it mid-way (`--signal KILL`, default, or `TERM`), restarts, and checks exactly N rows (at-least-once + `ON CONFLICT`). Loads the LOAD seed if missing; detects Docker vs local tracking-service. Writes `evidence/kafka-recovery-<date>.{txt,json}`; `--cleanup` deletes the runs' rows. |
| `offline-buffer-check.sh` | Read-only check for the manual phone-offline test: lists a device's Traccar fixes in a window, flags late ones (`servertime − devicetime > 30 s`) and verifies each is in `enriched_positions`. Writes `evidence/offline-buffer-<date>.{txt,json}`. |

Results and findings of the committed runs: [`validation/evidence/README.md`](validation/evidence/README.md).

```bash
scripts/validation/kafka-recovery-test.sh                        # A + B (SIGKILL), N=1000 over LOAD0001–0050
scripts/validation/kafka-recovery-test.sh --scenario B --signal TERM
scripts/validation/kafka-recovery-test.sh -n 5000 -d 200 --kill-at 30
scripts/validation/kafka-recovery-test.sh --cleanup              # every kafka-recovery-*.json run (or pass one file)

scripts/validation/offline-buffer-check.sh DEV004 "2026-11-05 10:00-04" "2026-11-05 10:30-04"
```

`kafka-recovery-test.sh` stops and restarts tracking-service. In local mode it relaunches it
with `TS_START_CMD` (default `node dist/main`, run from `tracking-service/`, log in
`$TMPDIR/kafka-recovery-tracking-service.log`); run `npm run build` first. Under `--profile full`
it uses `docker stop` / `docker kill` / `docker start tracking-service`.

**Phone offline test** (`offline-buffer-check.sh`):

1. In Traccar (http://localhost:8082) the phone's device must have the same identifier as a
   driver's `device_id` (e.g. `DEV004`). In Traccar Client set that identifier, the server URL
   `http://<this machine's LAN IP>:5055`, a frequency of 10–30 s, and turn **offline buffering** on.
2. Start tracking (the driver shows up on the live map), note the time, then switch the phone to
   airplane mode for a few minutes while moving if possible. Keep tracking-service running.
3. Turn airplane mode off, wait until the buffered fixes are uploaded (the map catches up), note the time.
4. `scripts/validation/offline-buffer-check.sh DEV004 "<start>-04" "<end>-04"` → `RESULT: PASS`
   when every late fix was persisted. Add `TAG=phone` to label the evidence file.

Traccar does not retry a failed forward (`forward.retry.enable` is off in `infrastructure/traccar/traccar.xml`),
so tracking-service must be up while the phone uploads its buffer.

## `smoke/`

| File | What it does |
|---|---|
| `smoke-customers-dual-mode.sh` | Same check for customers: standalone `201`/`200` and immediately readable, integrated `202` then arrives via CDC. Restores the tenant's original mode. |
| `smoke-orders-dual-mode.sh` | End-to-end check of the orders write path in both modes: standalone (direct PG) and integrated (Kafka → MySQL → CDC). `CLEAN=1` removes its rows. |

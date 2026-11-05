# Validation evidence

Runs of the scripts in `scripts/validation/`, kept as evidence. Environment for all runs:
Apple M1 (8 cores), 16 GB, macOS 26.5.2; Docker 29.8.0 (8 CPU, 7.7 GB); tracking-service as a
local compiled build (`node dist/main`) at commit `f6dbfbe`; Kafka topic `gps.positions` with
6 partitions, consumer group `tracking-service-group`.

## GPS event recovery — `kafka-recovery-test.sh` (2026-11-04)

N = 1,000 positions per scenario over 50 devices (LOAD0001–LOAD0050), published straight to
`gps.positions` in the ingestion service's JSON format.

| Run | Scenario | Result | Published | Lag while stopped / at stop | Rows persisted | Lost | Redelivered (dupes absorbed) | DLQ | Recovery |
|---|---|---|---|---|---|---|---|---|---|
| [2136](kafka-recovery-2026-11-04T2136.json) | A — consumer stopped (SIGTERM before publishing) | **PASS** | 1,000 | 1,000 | 1,000 | 0 | — | 0 | 30 s |
| [2136](kafka-recovery-2026-11-04T2136.json) | B — SIGKILL at 40 % persisted | **FAIL** | 1,000 | 483 | 900 | 100 | 483 (4) | 0 | 29 s |
| [2139](kafka-recovery-2026-11-04T2139.json) | B — SIGTERM at 40 % persisted | **FAIL** | 1,000 | 497 | 959 | 41 | 497 (0) | 0 | 32 s |

Recovery = tracking-service start → consumer lag back to 0 (≈ 25 s of it is application boot).

What holds:

- **Kafka retains events while the consumer is down.** With tracking-service stopped the lag grew to
  exactly N and nothing was written; after the restart the group resumed from its committed offsets
  and all 1,000 positions were persisted, none to the DLQ (scenario A).
- **Uncommitted messages are redelivered.** After a crash, every message whose offset had not been
  committed was consumed again (483 and 497); the ones already written before the crash were
  absorbed by `ON CONFLICT (time, driver_id) DO NOTHING` (4 duplicates, no duplicate rows).

Finding — **events are lost when tracking-service stops mid-consumption** (not fixed; app code untouched):

- `EnrichmentService` buffers TimescaleDB rows in memory and flushes them every 1 s or at 100 rows
  (`TIMESCALE_FLUSH_INTERVAL_MS`, `TIMESCALE_FLUSH_THRESHOLD`), but KafkaJS auto-commits the offset as
  soon as `handleRawPosition` returns, i.e. *before* the row is durable. Rows still in the buffer when
  the process dies are never redelivered: 100 lost with SIGKILL (one full threshold batch) and 41 with
  SIGTERM, matching the "committed but not persisted at the stop" counter of the run.
- SIGTERM loses rows too: `main.ts` does not call `app.enableShutdownHooks()`, so
  `onModuleDestroy()` — which flushes the buffer — never runs on `docker stop` or a redeploy.
- A failed flush (`TimescaleDB batch flush failed (N rows dropped)`) is the same gap: the offsets are
  already committed.
- Possible fixes, for a later change: enable shutdown hooks; commit offsets only after the flush
  (`autoCommit: false` + commit after `insertEnrichedPositionBatch`, or `eachBatch` with a flush before
  `resolveOffset`); or write synchronously per message.

Scope: the loss window is the last ≤ 1 s / ≤ 100 positions processed before an abrupt stop. Other
destinations (Redis, `driver_positions`, `gps.positions.enriched`) are written before the offset commit
and are not affected.

## Offline buffering — `offline-buffer-check.sh`

| Run | Source | Result | Late fixes (> 30 s) | Persisted | Disconnection |
|---|---|---|---|---|---|
| [2141-osmand-sim](offline-buffer-2026-11-04T2141-osmand-sim.json) | **Simulated** client: 10 OsmAnd fixes sent to Traccar :5055 with timestamps 300–192 s old, then 3 current fixes (LOAD0050) | PASS | 10 | 10 | ≈ 301 s |

The simulated run only validates the script and the Traccar → `/api/traccar/positions` forwarding of
old fixes (Traccar 6.11, filters disabled; its forwarder does not skip outdated positions). The real
test with a phone in airplane mode is described in `scripts/README.md` → `validation/`.
Traccar does not retry failed forwards (`forward.retry.enable` is not set), so fixes uploaded while
tracking-service is down stay only in `tc_positions`.

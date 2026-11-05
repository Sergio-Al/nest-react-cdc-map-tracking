#!/usr/bin/env bash
# =============================================================================
# kafka-recovery-test.sh — evidence that the GPS pipeline (gps.positions →
# enrichment → TimescaleDB) loses no events when the consumer is interrupted.
#
#   Scenario A — consumer stopped: tracking-service is down while N positions
#     are published straight to gps.positions. Kafka must retain them (lag ≥ N)
#     and, once tracking-service is back, all N must land in enriched_positions.
#   Scenario B — abrupt crash: N positions are published while tracking-service
#     is consuming; it is SIGKILLed mid-way (or SIGTERMed with --signal TERM) and restarted. Offsets not yet
#     committed are redelivered (at-least-once) and ON CONFLICT (time, driver_id)
#     absorbs the duplicates, so exactly N rows must persist.
#
# Positions use the same JSON the ingestion service produces
# (traccar-ingestion.service.ts), key = numeric deviceId, with
# attributes.uniqueId = LOADxxxx so enrichment maps them to the load-test
# drivers. Each message gets a unique deviceTime (1 ms apart) and carries
# attributes.runId, so a run is isolated by (LOAD driver ids, time window).
#
# Does not change application code. Works with tracking-service running in
# Docker (`--profile full`, container `tracking-service`) or as a local process
# on :3000 (restarted with $TS_START_CMD from tracking-service/).
#
# Usage (from the repository root):
#   scripts/validation/kafka-recovery-test.sh                  # A then B, N=1000, 50 devices
#   scripts/validation/kafka-recovery-test.sh -n 5000 -d 200   # bigger run
#   scripts/validation/kafka-recovery-test.sh --scenario B --kill-at 30
#   scripts/validation/kafka-recovery-test.sh --cleanup [evidence.json]   # delete the runs' rows
#
# Options:
#   -n, --messages N     positions per scenario (default 1000)
#   -d, --devices D      LOAD devices to spread them over, 1..1000 (default 50)
#   --scenario A|B|all   default all
#   --kill-at PCT        Scenario B: stop it once PCT % of the rows are persisted (default 40)
#   --signal KILL|TERM   Scenario B: abrupt crash (default) or an orderly stop (docker stop / SIGTERM)
#   --flush-wait S       seconds to wait after lag 0 (≥ 1 flush interval of 1 s; default 5)
#   --timeout S          max seconds to wait for lag 0 after restart (default 180)
#   --cleanup [FILE]     delete enriched_positions rows, Redis keys and driver_positions
#                        snapshots of the runs in FILE (default: every kafka-recovery-*.json)
#
# Env: KAFKA_GROUP_ID (default tracking-service-group), TS_PORT (3000),
#      TS_START_CMD (local mode, default "node dist/main"), REDIS_PASSWORD (redis_secret).
# Requires: docker, python3, curl, lsof (local mode).
# Output: scripts/validation/evidence/kafka-recovery-<date>.{txt,json}
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
EVIDENCE_DIR="scripts/validation/evidence"
TOPIC="gps.positions"
DLQ_TOPIC="gps.positions.dlq"
GROUP="${KAFKA_GROUP_ID:-tracking-service-group}"
TS_PORT="${TS_PORT:-3000}"
TS_START_CMD="${TS_START_CMD:-node dist/main}"
REDIS_PASSWORD="${REDIS_PASSWORD:-redis_secret}"
KBIN="/opt/kafka/bin"
BOOTSTRAP="kafka:9092"

N=1000; DEVICES=50; SCENARIO=all; KILL_AT=40; SIGNAL=KILL; FLUSH_WAIT=5; TIMEOUT=180
CLEANUP=0; CLEANUP_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    -n|--messages) N="$2"; shift 2 ;;
    -d|--devices) DEVICES="$2"; shift 2 ;;
    --scenario) SCENARIO="$2"; shift 2 ;;
    --kill-at) KILL_AT="$2"; shift 2 ;;
    --signal) SIGNAL="$2"; shift 2 ;;
    --flush-wait) FLUSH_WAIT="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --cleanup) CLEANUP=1; if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then CLEANUP_FILE="$2"; shift; fi; shift ;;
    -h|--help) sed -n '2,47p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

case "$SCENARIO" in A|B|all) ;; *) echo "--scenario must be A, B or all" >&2; exit 2 ;; esac
case "$SIGNAL" in KILL|TERM) ;; *) echo "--signal must be KILL or TERM" >&2; exit 2 ;; esac
if [ "$DEVICES" -lt 1 ] || [ "$DEVICES" -gt 1000 ]; then echo "--devices must be 1..1000" >&2; exit 2; fi

tsql()  { docker exec -i timescale psql -U timescale -d tracking_history -v ON_ERROR_STOP=1 -tAq "$@"; }
csql()  { docker exec -i cache-db psql -U tracking -d tracking_cache -v ON_ERROR_STOP=1 -tAq "$@"; }
rcli()  { docker exec -i redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning "$@"; }
now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }

# ── Cleanup mode ────────────────────────────────────────────────────────────
if [ "$CLEANUP" = 1 ]; then
  if [ -n "$CLEANUP_FILE" ]; then files="$CLEANUP_FILE"; else files=$(ls "$EVIDENCE_DIR"/kafka-recovery-*.json 2>/dev/null || true); fi
  [ -n "$files" ] || { echo "No kafka-recovery-*.json evidence found — nothing to clean."; exit 0; }
  for f in $files; do
    echo "Cleaning runs recorded in $f"
    # One line per scenario: "<t_from> <t_to> <uuid,uuid,...>"
    python3 - "$f" <<'PY' | while read -r t0 t1 ids; do
import json, sys
d = json.load(open(sys.argv[1]))
for s in d.get("scenarios", {}).values():
    w = s.get("window") or {}
    if w.get("from") and w.get("to"):
        print(w["from"], w["to"], ",".join(d["driver_ids"]))
PY
      deleted=$(tsql -c "WITH d AS (DELETE FROM enriched_positions WHERE driver_id = ANY('{$ids}'::uuid[]) AND time BETWEEN '$t0' AND '$t1' RETURNING 1) SELECT count(*) FROM d")
      echo "  $t0 … $t1: deleted $deleted enriched_positions rows"
    done
    ids=$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["driver_ids"]))' "$f")
    tenants=$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1])).get("tenants", ["tenant-1","tenant-2"])))' "$f")
    for id in $ids; do
      rcli DEL "pos:driver:$id" >/dev/null
      for t in $tenants; do rcli ZREM "geo:drivers:$t" "$id" >/dev/null; rcli ZREM "active:drivers:$t" "$id" >/dev/null; done
    done
    csql -c "DELETE FROM driver_positions WHERE driver_id = ANY('{$(echo "$ids" | tr ' ' ',')}'::uuid[])" >/dev/null
    csql -c "UPDATE drivers SET status = 'offline' WHERE id = ANY('{$(echo "$ids" | tr ' ' ',')}'::uuid[])" >/dev/null
    echo "  Redis keys and driver_positions snapshots of $(echo "$ids" | wc -w | tr -d ' ') LOAD drivers removed"
  done
  echo "Load-test drivers themselves stay; remove them with scripts/seeds/cleanup-load-test-drivers.sql."
  exit 0
fi

# ── Output files ────────────────────────────────────────────────────────────
mkdir -p "$EVIDENCE_DIR"
STAMP="$(date +%Y-%m-%dT%H%M)"
TXT="$EVIDENCE_DIR/kafka-recovery-$STAMP.txt"
JSON="$EVIDENCE_DIR/kafka-recovery-$STAMP.json"
RUN_ID="krt-$(date -u +%Y%m%dT%H%M%SZ)"
TS_LOG="${TMPDIR:-/tmp}/kafka-recovery-tracking-service.log"
: > "$TXT"
log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$TXT"; }
die() { log "ABORT: $*"; exit 1; }

# ── tracking-service control (Docker or local process) ──────────────────────
TS_MODE=""
TS_STOPPED=0
detect_ts_mode() {
  if docker ps --format '{{.Names}}' | grep -qx tracking-service; then TS_MODE=docker
  elif lsof -t -nP -iTCP:"$TS_PORT" -sTCP:LISTEN >/dev/null 2>&1; then TS_MODE=local
  else TS_MODE=""; fi
}
ts_healthy() { curl -sf -m 3 "http://localhost:$TS_PORT/api/health" | grep -q '"kafka":"up"'; }
ts_stop() { # $1 = graceful | kill
  if [ "$TS_MODE" = docker ]; then
    if [ "$1" = kill ]; then docker kill -s KILL tracking-service >/dev/null; else docker stop tracking-service >/dev/null; fi
  else
    local pid; pid=$(lsof -t -nP -iTCP:"$TS_PORT" -sTCP:LISTEN | head -1)
    [ -n "$pid" ] || die "no process listening on :$TS_PORT"
    if [ "$1" = kill ]; then kill -KILL "$pid"; else kill -TERM "$pid"; fi
    local i=0; while kill -0 "$pid" 2>/dev/null && [ $i -lt 60 ]; do sleep 0.5; i=$((i+1)); done
    kill -0 "$pid" 2>/dev/null && kill -KILL "$pid"
  fi
  TS_STOPPED=1
}
ts_start() {
  if [ "$TS_MODE" = docker ]; then docker start tracking-service >/dev/null
  else nohup sh -c "cd tracking-service && exec $TS_START_CMD" </dev/null >>"$TS_LOG" 2>&1 & disown; fi
  local i=0; until ts_healthy; do sleep 1; i=$((i+1)); [ $i -lt 120 ] || die "tracking-service not healthy after 120 s (log: $TS_LOG)"; done
  TS_STOPPED=0
}

# ── Kafka helpers ───────────────────────────────────────────────────────────
# Prints "<committed> <log_end> <lag>" summed over the topic's partitions.
group_offsets() {
  docker exec kafka "$KBIN/kafka-consumer-groups.sh" --bootstrap-server "$BOOTSTRAP" \
      --describe --group "$GROUP" 2>/dev/null |
    awk -v t="$TOPIC" '$2==t { c+=($4=="-"?0:$4); e+=$5; l+=($6=="-"?$5:$6) } END { printf "%d %d %d\n", c, e, l }'
}
group_describe() {
  docker exec kafka "$KBIN/kafka-consumer-groups.sh" --bootstrap-server "$BOOTSTRAP" \
      --describe --group "$GROUP" 2>/dev/null | awk -v t="$TOPIC" 'NR==1 || $1=="GROUP" || $2==t' | sed 's/^/    /'
}
dlq_count_run() { # DLQ messages that belong to this run
  docker exec kafka "$KBIN/kafka-console-consumer.sh" --bootstrap-server "$BOOTSTRAP" \
      --topic "$DLQ_TOPIC" --from-beginning --timeout-ms 8000 2>/dev/null | grep -c "\"runId\":\"$1\"" || true
}
dlq_end_offset() {
  docker exec kafka "$KBIN/kafka-get-offsets.sh" --bootstrap-server "$BOOTSTRAP" --topic "$DLQ_TOPIC" 2>/dev/null |
    awk -F: '{ s+=$3 } END { print s+0 }'
}
publish() { # $1 = run tag, $2 = base epoch ms ; N lines "key|json" → gps.positions
  python3 - "$N" "$DEVICES" "$1" "$2" <<'PY' |
import json, sys, datetime, random
n, devices, run, base = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], int(sys.argv[4])
random.seed(run)
for i in range(n):
    dev = i % devices + 1
    t = datetime.datetime.fromtimestamp((base + i) / 1000, datetime.timezone.utc)
    iso = t.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    print(f"{dev}|" + json.dumps({
        "deviceId": dev,
        "latitude": -16.50 + random.uniform(-0.03, 0.03),
        "longitude": -68.13 + random.uniform(-0.03, 0.03),
        "altitude": 3650.0, "speed": round(random.uniform(0, 40), 1),
        "course": round(random.uniform(0, 359), 1), "accuracy": 8.0,
        "deviceTime": iso, "fixTime": iso, "serverTime": iso, "valid": True,
        "attributes": {"uniqueId": f"LOAD{dev:04d}", "runId": run, "seq": i},
    }, separators=(",", ":")))
PY
  docker exec -i kafka "$KBIN/kafka-console-producer.sh" --bootstrap-server "$BOOTSTRAP" --topic "$TOPIC" \
      --property parse.key=true --property key.separator='|' >/dev/null
}
iso_ms() { python3 -c 'import sys,datetime; print(datetime.datetime.fromtimestamp(int(sys.argv[1])/1000, datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z"))' "$1"; }
# Prints "<rows> <distinct (time,driver_id)>" for the run window.
rows_in_window() {
  tsql -c "SELECT count(*) || ' ' || count(DISTINCT (time, driver_id)) FROM enriched_positions
           WHERE driver_id = ANY('{$DRIVER_IDS_CSV}'::uuid[]) AND time BETWEEN '$1' AND '$2'"
}
wait_lag_zero() { # prints seconds waited, or -1 on timeout
  local start; start=$(now_ms)
  while :; do
    set -- $(group_offsets)
    [ "$3" -eq 0 ] && { echo $(( ($(now_ms) - start) / 1000 )); return; }
    [ $(( ($(now_ms) - start) / 1000 )) -lt "$TIMEOUT" ] || { echo -1; return; }
    sleep 2
  done
}

# Restart tracking-service if the script aborts with it stopped.
finish() {
  local rc=$?
  if [ "$TS_STOPPED" = 1 ] && [ -n "$TS_MODE" ]; then log "restoring tracking-service"; ts_start || true; fi
  [ -n "${RESULTS_READY:-}" ] || write_json "incomplete"
  exit $rc
}

# ── JSON evidence ───────────────────────────────────────────────────────────
write_json() {
  export J_STATUS="$1" J_FILE="$JSON" J_RUN="$RUN_ID" J_N="$N" J_DEVICES="$DEVICES" J_GROUP="$GROUP" \
    J_MODE="$TS_MODE" J_COMMIT="$COMMIT" J_CPU="$CPU" J_RAM="$RAM" J_OS="$OS" J_DOCKER="$DOCKER_INFO" \
    J_IDS="$DRIVER_IDS_CSV" J_KILLAT="$KILL_AT" J_FLUSH="$FLUSH_WAIT" J_SCEN="$SCENARIO" J_CMD="$CMDLINE" J_SIGNAL="$SIGNAL"
  python3 - <<'PY'
import json, os
e = os.environ
def scen(p):
    keys = [k for k in e if k.startswith(p + "_")]
    if not keys: return None
    out = {}
    for k in sorted(keys):
        v = e[k]; name = k[len(p) + 1:].lower()
        try: v = int(v)
        except ValueError: pass
        out[name] = v
    w = {"from": out.pop("t_from", None), "to": out.pop("t_to", None)}
    out["window"] = w
    return out
doc = {
    "test": "kafka-recovery", "status": e["J_STATUS"], "run_id": e["J_RUN"],
    "date": __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds"),
    "command": e["J_CMD"], "commit": e["J_COMMIT"],
    "environment": {"cpu": e["J_CPU"], "ram": e["J_RAM"], "os": e["J_OS"], "docker": e["J_DOCKER"],
                    "tracking_service_mode": e["J_MODE"]},
    "params": {"messages_per_scenario": int(e["J_N"]), "devices": int(e["J_DEVICES"]),
               "consumer_group": e["J_GROUP"], "topic": "gps.positions",
               "kill_at_pct": int(e["J_KILLAT"]), "scenario_b_signal": e["J_SIGNAL"], "flush_wait_s": int(e["J_FLUSH"]), "scenarios": e["J_SCEN"]},
    "scenarios": {k: v for k, v in (("A_consumer_stopped", scen("SA")), ("B_crash_mid_consumption", scen("SB"))) if v},
    "driver_ids": [i for i in e["J_IDS"].split(",") if i],
    "tenants": ["tenant-1", "tenant-2"],
}
json.dump(doc, open(e["J_FILE"], "w"), indent=2, ensure_ascii=False)
PY
}

# ── Preconditions ───────────────────────────────────────────────────────────
CMDLINE="scripts/validation/kafka-recovery-test.sh -n $N -d $DEVICES --scenario $SCENARIO --kill-at $KILL_AT --signal $SIGNAL --flush-wait $FLUSH_WAIT"
COMMIT="$(git rev-parse --short HEAD)$(git diff --quiet HEAD -- tracking-service || echo '-dirty')"
if [ "$(uname)" = Darwin ]; then
  CPU="$(sysctl -n machdep.cpu.brand_string), $(sysctl -n hw.ncpu) cores"
  RAM="$(( $(sysctl -n hw.memsize) / 1073741824 )) GB"
  OS="macOS $(sw_vers -productVersion) ($(uname -m))"
else
  CPU="$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | sed 's/^ //'), $(nproc) cores"
  RAM="$(awk '/MemTotal/ { printf "%d GB", $2/1048576 }' /proc/meminfo)"
  OS="$(. /etc/os-release; echo "$PRETTY_NAME") ($(uname -m))"
fi
DOCKER_INFO="$(docker info --format 'Docker {{.ServerVersion}}, {{.NCPU}} CPU, {{.MemTotal}}' 2>/dev/null |
  awk -F', ' '{ printf "%s, %s, %.1f GB", $1, $2, $3/1073741824 }')"
DRIVER_IDS_CSV=""
trap finish EXIT

log "== Kafka recovery test  run=$RUN_ID  N=$N  devices=$DEVICES  scenario=$SCENARIO"
log "   commit $COMMIT | $CPU | $RAM | $OS | $DOCKER_INFO"

for c in kafka timescale cache-db redis; do
  docker ps --format '{{.Names}}' | grep -qx "$c" || die "container '$c' is not running (docker compose up -d)"
done
detect_ts_mode
[ -n "$TS_MODE" ] || die "tracking-service is not running (local :$TS_PORT or container tracking-service)"
ts_healthy || die "tracking-service health check failed (http://localhost:$TS_PORT/api/health)"
log "tracking-service mode: $TS_MODE"

NEED_RESTART=0
seeded=$(csql -c "SELECT count(*) FROM drivers WHERE device_id LIKE 'LOAD%'")
if [ "$seeded" -lt 1000 ]; then
  log "LOAD drivers: $seeded/1000 — loading scripts/seeds/seed-load-test-drivers.sql"
  csql < scripts/seeds/seed-load-test-drivers.sql >/dev/null
  NEED_RESTART=1   # enrichment loads the device→driver map at startup
fi
DRIVER_IDS_CSV=$(csql -c "SELECT string_agg(id::text, ',' ORDER BY device_id) FROM drivers
                          WHERE device_id IN (SELECT 'LOAD' || lpad(g::text, 4, '0') FROM generate_series(1, $DEVICES) g)")
[ "$(echo "$DRIVER_IDS_CSV" | tr ',' '\n' | grep -c .)" -eq "$DEVICES" ] || die "expected $DEVICES LOAD drivers"
log "LOAD drivers ready ($DEVICES used: LOAD0001–LOAD$(printf %04d "$DEVICES"))"

if [ "$NEED_RESTART" = 1 ] && [ "$SCENARIO" = B ]; then
  log "restarting tracking-service so enrichment picks up the new LOAD drivers"
  ts_stop graceful; ts_start
fi

# ── Scenario A ──────────────────────────────────────────────────────────────
run_a() {
  log ""
  log "── Scenario A: consumer stopped ─────────────────────────────"
  set -- $(group_offsets); local c0=$1 e0=$2 l0=$3
  log "A1 consumer group '$GROUP' before:  committed=$c0 log-end=$e0 lag=$l0"
  group_describe | tee -a "$TXT"
  [ "$l0" -eq 0 ] || log "   (warning: lag was already $l0 before the test)"
  local dlq0; dlq0=$(dlq_end_offset)

  log "A2 stopping tracking-service (graceful)"
  ts_stop graceful
  local base; base=$(now_ms)
  local t0 t1; t0=$(iso_ms "$base"); t1=$(iso_ms $((base + N - 1)))
  log "A3 publishing $N positions to $TOPIC (deviceTime $t0 … $t1, runId $RUN_ID-A)"
  local p0; p0=$(now_ms); publish "$RUN_ID-A" "$base"; local pub_ms=$(( $(now_ms) - p0 ))
  set -- $(group_offsets); local c1=$1 e1=$2 l1=$3
  log "A4 with consumer down:  committed=$c1 log-end=$e1 lag=$l1  (published in ${pub_ms} ms)"
  group_describe | tee -a "$TXT"
  local rows_down; rows_down=$(rows_in_window "$t0" "$t1" | cut -d' ' -f1)
  log "   rows in TimescaleDB while down: $rows_down"

  log "A5 starting tracking-service"
  local s0; s0=$(now_ms); ts_start; local boot_s=$(( ($(now_ms) - s0) / 1000 ))
  local waited; waited=$(wait_lag_zero)
  local recover_s=$(( ($(now_ms) - s0) / 1000 ))
  set -- $(group_offsets); local c2=$1 e2=$2 l2=$3
  log "   healthy after ${boot_s} s; lag 0 after ${recover_s} s from start (waited $waited s)"
  log "A6 consumer group after:  committed=$c2 log-end=$e2 lag=$l2"
  group_describe | tee -a "$TXT"
  sleep "$FLUSH_WAIT"
  set -- $(rows_in_window "$t0" "$t1"); local rows=$1 distinct=$2
  local dlq_run; dlq_run=$(dlq_count_run "$RUN_ID-A"); local dlq1; dlq1=$(dlq_end_offset)
  log "A7 enriched_positions rows for the run: $rows (distinct (time,driver_id): $distinct) — expected $N"
  log "   DLQ: $dlq_run messages of this run; $DLQ_TOPIC end offset $dlq0 → $dlq1"
  local res=FAIL
  if [ "$l1" -ge "$N" ] && [ "$l2" -eq 0 ] && [ "$rows" -eq "$N" ] && [ "$distinct" -eq "$N" ] && [ "$dlq_run" -eq 0 ]; then res=PASS; fi
  log "A  RESULT: $res"
  export SA_RESULT=$res SA_PUBLISHED=$N SA_T_FROM=$t0 SA_T_TO=$t1 SA_RUN_TAG="$RUN_ID-A" \
    SA_LAG_BEFORE=$l0 SA_COMMITTED_BEFORE=$c0 SA_LAG_WHILE_DOWN=$l1 SA_LAG_AFTER=$l2 \
    SA_ROWS_WHILE_DOWN=$rows_down SA_ROWS_PERSISTED=$rows SA_ROWS_DISTINCT=$distinct \
    SA_DLQ_MESSAGES=$dlq_run SA_PUBLISH_MS=$pub_ms SA_BOOT_S=$boot_s SA_RECOVERY_S=$recover_s
}

# ── Scenario B ──────────────────────────────────────────────────────────────
run_b() {
  log ""
  log "── Scenario B: SIG$SIGNAL mid-consumption ──────────────────────"
  set -- $(group_offsets); local c0=$1 e0=$2 l0=$3
  log "B1 consumer group before:  committed=$c0 log-end=$e0 lag=$l0"
  local dlq0; dlq0=$(dlq_end_offset)
  local base; base=$(now_ms)
  local t0 t1; t0=$(iso_ms "$base"); t1=$(iso_ms $((base + N - 1)))
  local target=$(( N * KILL_AT / 100 ))
  log "B2 publishing $N positions with tracking-service consuming (deviceTime $t0 … $t1, runId $RUN_ID-B)"
  publish "$RUN_ID-B" "$base" &
  local pub_pid=$!
  local rows=0 i=0
  while [ "$rows" -lt "$target" ] && [ $i -lt 600 ]; do
    rows=$(rows_in_window "$t0" "$t1" | cut -d' ' -f1); [ "$rows" -ge "$target" ] || sleep 0.2; i=$((i+1))
  done
  log "B3 $rows rows persisted (≥ $KILL_AT % of $N) — SIG$SIGNAL tracking-service"
  if [ "$SIGNAL" = KILL ]; then ts_stop kill; else ts_stop graceful; fi
  local kill_ms; kill_ms=$(now_ms)
  wait "$pub_pid" || die "producer failed"
  set -- $(rows_in_window "$t0" "$t1"); local rows_kill=$1
  set -- $(group_offsets); local c1=$1 e1=$2 l1=$3
  local committed_run=$(( c1 - c0 ))
  log "B4 after kill:  rows=$rows_kill  committed=$c1 (+$committed_run of this run) log-end=$e1 lag=$l1"
  group_describe | tee -a "$TXT"
  # The stop lands "mid-consumption" when not every row was durable yet — either
  # messages were still pending in Kafka or rows were still in the write buffer.
  local mid=0; if [ "$rows_kill" -lt "$N" ]; then mid=1; fi
  [ "$mid" = 1 ] || log "   warning: every row was already persisted at the stop (raise -n or lower --kill-at)"
  local unflushed=$(( committed_run - rows_kill )); [ "$unflushed" -ge 0 ] || unflushed=0
  log "   committed but not yet persisted at the stop: $unflushed"

  log "B5 restarting tracking-service"
  local s0; s0=$(now_ms); ts_start; local boot_s=$(( ($(now_ms) - s0) / 1000 ))
  local waited; waited=$(wait_lag_zero)
  local recover_s=$(( ($(now_ms) - s0) / 1000 ))
  set -- $(group_offsets); local c2=$1 e2=$2 l2=$3
  log "   healthy after ${boot_s} s; lag 0 after ${recover_s} s from restart (waited $waited s)"
  log "B6 consumer group after:  committed=$c2 log-end=$e2 lag=$l2"
  group_describe | tee -a "$TXT"
  sleep "$FLUSH_WAIT"
  set -- $(rows_in_window "$t0" "$t1"); local rows_final=$1 distinct=$2
  local dlq_run; dlq_run=$(dlq_count_run "$RUN_ID-B"); local dlq1; dlq1=$(dlq_end_offset)
  # Messages consumed again after the restart vs rows they added: the difference
  # was already persisted before the kill and was dropped by ON CONFLICT.
  local redelivered=$(( N - committed_run )) inserted_after=$(( rows_final - rows_kill ))
  local absorbed=$(( redelivered - inserted_after )); [ "$absorbed" -ge 0 ] || absorbed=0
  local lost=$(( N - rows_final )); [ "$lost" -ge 0 ] || lost=0
  log "B7 enriched_positions rows for the run: $rows_final (distinct: $distinct) — expected $N"
  log "   redelivered after restart: $redelivered; new rows after restart: $inserted_after; duplicates absorbed by ON CONFLICT: $absorbed; lost: $lost"
  log "   DLQ: $dlq_run messages of this run; $DLQ_TOPIC end offset $dlq0 → $dlq1"
  local res=FAIL
  if [ "$mid" = 1 ] && [ "$l2" -eq 0 ] && [ "$rows_final" -eq "$N" ] && [ "$distinct" -eq "$N" ] && [ "$dlq_run" -eq 0 ]; then res=PASS
  elif [ "$mid" = 0 ]; then res=INCONCLUSIVE; fi
  [ "$lost" -eq 0 ] || log "   LOSS: $lost positions whose offsets were committed before their TimescaleDB write was flushed"
  log "B  RESULT: $res"
  export SB_RESULT=$res SB_PUBLISHED=$N SB_T_FROM=$t0 SB_T_TO=$t1 SB_RUN_TAG="$RUN_ID-B" \
    SB_LAG_BEFORE=$l0 SB_KILL_TARGET_ROWS=$target SB_ROWS_AT_KILL=$rows_kill SB_COMMITTED_AT_KILL=$committed_run \
    SB_LAG_AT_KILL=$l1 SB_COMMITTED_NOT_PERSISTED_AT_KILL=$unflushed SB_SIGNAL=$SIGNAL SB_LAG_AFTER=$l2 SB_ROWS_PERSISTED=$rows_final SB_ROWS_DISTINCT=$distinct \
    SB_REDELIVERED=$redelivered SB_INSERTED_AFTER_RESTART=$inserted_after SB_DUPLICATES_ABSORBED=$absorbed \
    SB_LOST=$lost SB_DLQ_MESSAGES=$dlq_run SB_BOOT_S=$boot_s SB_RECOVERY_S=$recover_s SB_KILLED_MID_CONSUMPTION=$mid
}

case "$SCENARIO" in A) run_a ;; B) run_b ;; all) run_a; run_b ;; esac

RESULTS_READY=1
overall=PASS
for r in "${SA_RESULT:-}" "${SB_RESULT:-}"; do [ -z "$r" ] || [ "$r" = PASS ] || overall=FAIL; done
write_json "$overall"
log ""
log "== Summary  run=$RUN_ID"
[ -z "${SA_RESULT:-}" ] || log "   A consumer stopped : $SA_RESULT  published=$N lag_while_down=$SA_LAG_WHILE_DOWN rows=$SA_ROWS_PERSISTED dlq=$SA_DLQ_MESSAGES recovery=${SA_RECOVERY_S}s"
[ -z "${SB_RESULT:-}" ] || log "   B SIG$SIGNAL mid-run   : $SB_RESULT  published=$N rows_at_kill=$SB_ROWS_AT_KILL rows=$SB_ROWS_PERSISTED lost=$SB_LOST absorbed=$SB_DUPLICATES_ABSORBED dlq=$SB_DLQ_MESSAGES recovery=${SB_RECOVERY_S}s"
log "   evidence: $TXT , $JSON"
log "   rows are kept as evidence; remove them with: scripts/validation/kafka-recovery-test.sh --cleanup $JSON"

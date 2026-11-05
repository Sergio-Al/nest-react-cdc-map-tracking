#!/usr/bin/env bash
# =============================================================================
# offline-buffer-check.sh — evidence for the manual "phone offline" test.
#
# Traccar Client (with offline buffering on) keeps fixes while the phone has no
# connectivity and uploads them on reconnect with their original timestamps.
# Traccar stores them in tc_positions and forwards each one to
# /api/traccar/positions (traccar.xml forward.url; filters are disabled and the
# forwarder does not skip old fixes). This script checks that every such
# late-arriving fix reached TimescaleDB enriched_positions.
#
#   1. tc_positions ⋈ tc_devices (uniqueid) in [from, to] by devicetime.
#      A fix is "late" when servertime − devicetime > LATE_S (default 30 s).
#   2. Each late fix must exist in enriched_positions for the driver whose
#      device_id = uniqueId, at time = devicetime (± 1 ms).
#   3. Writes scripts/validation/evidence/offline-buffer-<date>.{txt,json}.
#
# Usage (from the repository root):
#   scripts/validation/offline-buffer-check.sh <uniqueId> <from> <to>
#   scripts/validation/offline-buffer-check.sh DEV004 "2026-11-05 10:00-04" "2026-11-05 10:30-04"
# <from>/<to> are PostgreSQL timestamps; include the UTC offset (La Paz is -04),
# otherwise they are read as UTC (Traccar stores UTC).
#
# Env: LATE_S (30), TAG (optional label appended to the evidence file name).
# Read-only: it never writes to any database.
#
# Test procedure: see scripts/README.md → validation/.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
[ $# -eq 3 ] || { sed -n '2,28p' "$0"; exit 2; }
UNIQUE_ID="$1"; FROM="$2"; TO="$3"
LATE_S="${LATE_S:-30}"
EVIDENCE_DIR="scripts/validation/evidence"
STAMP="$(date +%Y-%m-%dT%H%M)${TAG:+-$TAG}"
TXT="$EVIDENCE_DIR/offline-buffer-$STAMP.txt"
JSON="$EVIDENCE_DIR/offline-buffer-$STAMP.json"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

for c in traccar-db timescale cache-db; do
  docker ps --format '{{.Names}}' | grep -qx "$c" || { echo "container '$c' is not running" >&2; exit 1; }
done
case "$UNIQUE_ID" in *[!A-Za-z0-9_.-]*) echo "invalid uniqueId" >&2; exit 2 ;; esac

trsql() { docker exec -i traccar-db psql -U traccar -d traccar -v ON_ERROR_STOP=1 -tAq -F '|' "$@"; }
tsql()  { docker exec -i timescale psql -U timescale -d tracking_history -v ON_ERROR_STOP=1 -tAq -F '|' "$@"; }
csql()  { docker exec -i cache-db psql -U tracking -d tracking_cache -v ON_ERROR_STOP=1 -tAq "$@"; }

# Bound the window in UTC (tc_positions columns are UTC "timestamp without time zone").
read -r FROM_UTC TO_UTC <<<"$(trsql -c "SELECT to_char(('$FROM'::timestamptz) AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS'),
                                              to_char(('$TO'::timestamptz)   AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS')" | tr '|' ' ')"

DEVICE_ROW=$(trsql -c "SELECT id, name FROM tc_devices WHERE uniqueid = '$UNIQUE_ID'")
[ -n "$DEVICE_ROW" ] || { echo "Traccar has no device with uniqueId '$UNIQUE_ID'" >&2; exit 1; }
DRIVER_ROW=$(csql -F '|' -c "SELECT id, name FROM drivers WHERE device_id = '$UNIQUE_ID'")
[ -n "$DRIVER_ROW" ] || { echo "no driver with device_id '$UNIQUE_ID' in cache-db" >&2; exit 1; }
DRIVER_ID="${DRIVER_ROW%%|*}"

# 1. Every fix of the device in the window: id|devicetime|servertime|delay_s (UTC, ms).
trsql -c "SELECT p.id,
                 to_char(p.devicetime, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),
                 to_char(p.servertime, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),
                 round(extract(epoch FROM p.servertime - p.devicetime)::numeric, 1)
          FROM tc_positions p JOIN tc_devices d ON d.id = p.deviceid
          WHERE d.uniqueid = '$UNIQUE_ID'
            AND p.devicetime BETWEEN '$FROM_UTC' AND '$TO_UTC'
          ORDER BY p.devicetime" > "$WORK/traccar.psv"

# 2. Which of those devicetimes exist in enriched_positions (± 1 ms).
if [ -s "$WORK/traccar.psv" ]; then
  values=$(awk -F'|' '{ printf "%s(%s,'"'"'%s'"'"'::timestamptz)", (NR>1?",":""), $1, $2 }' "$WORK/traccar.psv")
  tsql -c "SELECT v.id FROM (VALUES $values) AS v(id, t)
           WHERE EXISTS (SELECT 1 FROM enriched_positions e
                         WHERE e.driver_id = '$DRIVER_ID'
                           AND e.time BETWEEN v.t - interval '1 millisecond' AND v.t + interval '1 millisecond')" > "$WORK/persisted.ids"
else
  : > "$WORK/persisted.ids"
fi

export UNIQUE_ID FROM TO FROM_UTC TO_UTC LATE_S DEVICE_ROW DRIVER_ROW JSON WORK
export COMMIT="$(git rev-parse --short HEAD)"
python3 - <<'PY' | tee "$TXT"
import json, os, datetime
e = os.environ
late_s = float(e["LATE_S"])
persisted = {l.strip() for l in open(f'{e["WORK"]}/persisted.ids') if l.strip()}
fixes = []
for line in open(f'{e["WORK"]}/traccar.psv'):
    line = line.strip()
    if not line: continue
    pid, dt, st, delay = line.split("|")
    fixes.append({"traccar_id": int(pid), "devicetime": dt, "servertime": st,
                  "delay_s": float(delay), "late": float(delay) > late_s, "persisted": pid in persisted})
late = [f for f in fixes if f["late"]]
late_ok = [f for f in late if f["persisted"]]
parse = lambda s: datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
offline = None
if late:
    first_fix, last_fix = parse(late[0]["devicetime"]), parse(late[-1]["devicetime"])
    reconnect = min(parse(f["servertime"]) for f in late)
    flushed = max(parse(f["servertime"]) for f in late)
    offline = {
        "first_buffered_fix": late[0]["devicetime"], "last_buffered_fix": late[-1]["devicetime"],
        "buffered_span_s": round((last_fix - first_fix).total_seconds(), 1),
        "reconnected_at": reconnect.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "disconnection_s": round((reconnect - first_fix).total_seconds(), 1),
        "upload_span_s": round((flushed - reconnect).total_seconds(), 1),
        "max_delay_s": max(f["delay_s"] for f in late),
    }
dev_id, dev_name = e["DEVICE_ROW"].split("|", 1)
drv_id, drv_name = e["DRIVER_ROW"].split("|", 1)
result = "PASS" if late and len(late_ok) == len(late) else ("NO_LATE_FIXES" if not late else "FAIL")
doc = {
    "test": "offline-buffer", "result": result,
    "date": datetime.datetime.now().astimezone().isoformat(timespec="seconds"), "commit": e["COMMIT"],
    "device": {"unique_id": e["UNIQUE_ID"], "traccar_id": int(dev_id), "name": dev_name},
    "driver": {"id": drv_id, "name": drv_name},
    "window": {"from": e["FROM"], "to": e["TO"], "from_utc": e["FROM_UTC"] + "Z", "to_utc": e["TO_UTC"] + "Z"},
    "late_threshold_s": late_s,
    "fixes_in_window": len(fixes), "fixes_persisted": sum(f["persisted"] for f in fixes),
    "late_fixes": len(late), "late_fixes_persisted": len(late_ok),
    "missing_late_fixes": [f for f in late if not f["persisted"]],
    "offline": offline, "fixes": fixes,
}
json.dump(doc, open(e["JSON"], "w"), indent=2, ensure_ascii=False)

print(f"== Offline buffer check  {doc['date']}  commit {e['COMMIT']}")
print(f"device {e['UNIQUE_ID']} (Traccar #{dev_id}, {dev_name}) → driver {drv_name} ({drv_id})")
print(f"window {e['FROM']} … {e['TO']}  (UTC {e['FROM_UTC']} … {e['TO_UTC']})")
print(f"fixes in window: {len(fixes)}; in enriched_positions: {doc['fixes_persisted']}")
print(f"late fixes (servertime − devicetime > {late_s:g} s): {len(late)}; persisted: {len(late_ok)}")
if offline:
    print(f"offline: first buffered fix {offline['first_buffered_fix']}, last {offline['last_buffered_fix']} "
          f"({offline['buffered_span_s']} s of buffered fixes)")
    print(f"reconnected at {offline['reconnected_at']} → disconnection ≈ {offline['disconnection_s']} s; "
          f"buffer uploaded in {offline['upload_span_s']} s; max delay {offline['max_delay_s']} s")
for f in doc["missing_late_fixes"]:
    print(f"  MISSING traccar_id={f['traccar_id']} devicetime={f['devicetime']} delay={f['delay_s']} s")
print(f"RESULT: {result}")
print(f"evidence: {e['JSON']}")
PY

#!/usr/bin/env bash
# Smoke test: standalone customer writes (201/200, immediately readable) and
# integrated writes (202, Kafka → MySQL → CDC). Run from the repository root.
# Prereqs: running stack, rebuilt tracking-service, standalone id migration applied,
# a demo tenant with settings and an admin login, and jq/curl/docker installed.
# Usage: bash scripts/smoke/smoke-customers-dual-mode.sh
# Overrides: BASE_URL, LOGIN_EMAIL, LOGIN_PASS, TENANT_ID, CDC_TIMEOUT_SEC.
# Creates uniquely named smoke customers; restores the tenant's original mode.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:3000/api}"
EMAIL="${LOGIN_EMAIL:-admin@tenant1.com}"
PASSWORD="${LOGIN_PASS:-admin123}"
TENANT="${TENANT_ID:-tenant-1}"
TIMEOUT="${CDC_TIMEOUT_SEC:-20}"
[[ "$TENANT" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Invalid TENANT_ID"; exit 1; }
[[ "$TIMEOUT" =~ ^[1-9][0-9]*$ ]] || { echo "Invalid CDC_TIMEOUT_SEC"; exit 1; }
for tool in jq curl docker; do
  command -v "$tool" >/dev/null || { echo "missing required tool: $tool"; exit 1; }
done

pass=0; fail=0
ok(){ printf '  ✅ %s\n' "$1"; pass=$((pass+1)); }
no(){ printf '  ❌ %s\n' "$1"; fail=$((fail+1)); }
hd(){ printf '\n── %s ──\n' "$1"; }
db(){ docker exec -i cache-db psql -U tracking -d tracking_cache -v ON_ERROR_STOP=1 -tAc "$1"; }
set_mode(){ db "UPDATE tenant_settings SET ingest_mode='$1' WHERE tenant_id='$TENANT';" >/dev/null; }

ORIGINAL_MODE=$(db "SELECT ingest_mode FROM tenant_settings WHERE tenant_id='$TENANT';")
[[ "$ORIGINAL_MODE" = standalone || "$ORIGINAL_MODE" = integrated ]] || {
  echo "No valid tenant_settings row for $TENANT"; exit 1;
}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/smoke-customers.XXXXXX")
finish(){
  set_mode "$ORIGINAL_MODE"
  rm -f "$WORK/body"
  rmdir "$WORK"
  echo "Restored $TENANT → ingest_mode=$ORIGINAL_MODE"
}
trap finish EXIT

LOGIN=$(jq -n --arg email "$EMAIL" --arg password "$PASSWORD" --arg tenantId "$TENANT" \
  '{email:$email,password:$password,tenantId:$tenantId}')
TOKEN=$(curl -fsS "$BASE/auth/login" -H 'Content-Type: application/json' -d "$LOGIN" | jq -r '.accessToken // empty')
[ -n "$TOKEN" ] || { echo "login failed"; exit 1; }
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
NAME="SMOKE-CUSTOMER-$(date +%s)-$$"
request(){ curl -sS -o "$WORK/body" -w '%{http_code}' "${AUTH[@]}" -X "$1" "$BASE$2" -d "$3"; }
customer_payload(){ jq -n --arg tenantId "$TENANT" --arg name "$1" \
  '{tenantId:$tenantId,name:$name,latitude:-16.5,longitude:-68.13}'; }
seen_name(){ curl -fsS "${AUTH[@]}" "$BASE/customers" | jq -r --arg name "$1" '[.[] | select(.name==$name)] | length'; }
wait_for_name(){
  local i
  for ((i=0;i<TIMEOUT;i++)); do
    if [ "$(seen_name "$1")" = 1 ]; then return 0; fi
    sleep 1
  done
  return 1
}

hd '#1 standalone — 201 create / 200 update, immediate GET'
set_mode standalone
STD="$NAME-STD"
code=$(request POST /customers "$(customer_payload "$STD")")
[ "$code" = 201 ] && ok 'POST /customers → 201' || no "expected 201, got $code"
SID=$(jq -r '.id // empty' "$WORK/body")
if [[ "$SID" =~ ^[0-9]+$ ]] && [ "$SID" -ge 1000000000 ]; then
  ok "PG-owned id is in standalone range ($SID)"
  [ "$(seen_name "$STD")" = 1 ] && ok 'immediately readable via GET /customers' || no 'standalone create not immediately visible'
  code=$(request PATCH "/customers/$SID" "$(customer_payload "$STD-MOVED")")
  [ "$code" = 200 ] && ok 'PATCH /customers/:id → 200' || no "expected 200, got $code"
  [ "$(seen_name "$STD-MOVED")" = 1 ] && ok 'updated row immediately readable' || no 'standalone update not immediately visible'
else
  no '201 response missing a standalone-range customer id'
fi

hd '#2 integrated — 202 create / update, then CDC visibility'
set_mode integrated
INT="$NAME-INT"
code=$(request POST /customers "$(customer_payload "$INT")")
[ "$code" = 202 ] && ok 'POST /customers → 202' || no "expected 202, got $code"
jq -e '.status=="accepted" and (.correlationId|type=="string")' "$WORK/body" >/dev/null \
  && ok '202 carries correlationId' || no 'missing accepted/correlationId response'
if wait_for_name "$INT"; then
  ok 'customer visible via GET after CDC'
  IID=$(curl -fsS "${AUTH[@]}" "$BASE/customers" | jq -r --arg name "$INT" '.[] | select(.name==$name) | .id')
  code=$(request PATCH "/customers/$IID" "$(customer_payload "$INT-MOVED")")
  [ "$code" = 202 ] && ok 'PATCH /customers/:id → 202' || no "expected 202, got $code"
  wait_for_name "$INT-MOVED" && ok 'updated customer visible after CDC' || no 'integrated update did not arrive via CDC'
else
  no "integrated customer not visible within ${TIMEOUT}s (check integration-service and Debezium)"
fi

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" = 0 ]

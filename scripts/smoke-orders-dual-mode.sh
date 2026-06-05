#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Smoke test: dual-mode orders (standalone PG-owned vs integrated MySQL/CDC).
#
# Exercises the per-tenant order write path end to end against a RUNNING stack:
#   #1  standalone  → POST /orders returns 201 + the row is immediately readable
#   #2  integrated  → POST /orders returns 202; the row arrives via CDC; and with
#                     allow_app_order_create=false the create is blocked with 403
#   #3  visit completion echo → completing a visit that carries an order_id flips
#                     the order status (standalone: synchronously; integrated: CDC)
#
# Prereqs: infra up (docker), tracking-service on :3000, integration-service
#          rebuilt, the migration applied, and `jq` installed.
#
# Usage:   bash scripts/smoke-orders-dual-mode.sh
#          CLEAN=1 bash scripts/smoke-orders-dual-mode.sh    # remove seeded rows
#
# Env overrides: BASE_URL, LOGIN_EMAIL, LOGIN_PASS, TENANT_ID, DRIVER_ID
# Note: this flips tenant-1's ingest_mode while running and restores it to
#       integrated/allow=true on exit.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3000/api}"
CONNECT="${CONNECT_URL:-http://localhost:8083}"
EMAIL="${LOGIN_EMAIL:-admin@tenant1.com}"
PASSWORD="${LOGIN_PASS:-admin123}"
TENANT="${TENANT_ID:-tenant-1}"
# Seeded tenant-1 driver (infrastructure/cache-db/init/01-init.sql).
DRIVER_ID="${DRIVER_ID:-a1b2c3d4-0001-4000-8000-000000000001}"
TS=$(date +%s)
ROUTES_FILE="/tmp/smoke_routes.$TS"
VISITS_FILE="/tmp/smoke_visits.$TS"

pass=0; fail=0
ok(){ printf '  \033[32m✅ %s\033[0m\n' "$1"; pass=$((pass+1)); }
no(){ printf '  \033[31m❌ %s\033[0m\n' "$1"; fail=$((fail+1)); }
hd(){ printf '\n\033[1m── %s ──\033[0m\n' "$1"; }

need(){ command -v "$1" >/dev/null 2>&1 || { echo "missing required tool: $1"; exit 1; }; }
need jq; need curl; need docker

# Run SQL against the cache DB, tuples-only/unaligned (bare value out).
db(){ docker exec -i cache-db psql -U tracking -d tracking_cache -tAc "$1"; }
# Run SQL against MySQL core_business (source of truth for integrated writes).
MYSQL_ROOT_PW="${MYSQL_ROOT_PW:-root_secret}"
mysqldb(){ docker exec -i mysql mysql -uroot -p"$MYSQL_ROOT_PW" core_business -N -e "$1" 2>/dev/null; }

# ── Preflight: the integrated path (tests #2 and #3b) needs a Debezium connector
#    that captures core_business.orders and is RUNNING. Without it, integrated
#    writes reach MySQL but never sync to orders_cache, and the failures look like
#    mysterious CDC timeouts. Discover the connector by what it captures (not a
#    hardcoded name) and fail fast with remediation. Set SKIP_CDC_CHECK=1 to skip
#    (e.g. when only exercising standalone mode).
preflight_cdc(){
  [ "${SKIP_CDC_CHECK:-0}" = 1 ] && { echo "⏭  SKIP_CDC_CHECK=1 — not verifying the Debezium connector"; return 0; }
  local connectors name cfg status cstate tfail
  connectors=$(curl -s "$CONNECT/connectors" 2>/dev/null)
  if ! echo "$connectors" | jq -e 'type=="array"' >/dev/null 2>&1; then
    echo "❌ Kafka Connect unreachable at $CONNECT (override with CONNECT_URL). Is the stack up?"
    exit 1
  fi
  for name in $(echo "$connectors" | jq -r '.[]'); do
    cfg=$(curl -s "$CONNECT/connectors/$name/config" 2>/dev/null)
    echo "$cfg" | jq -e '(.["table.include.list"] // "") | contains("core_business.orders")' >/dev/null 2>&1 || continue
    status=$(curl -s "$CONNECT/connectors/$name/status" 2>/dev/null)
    cstate=$(echo "$status" | jq -r '.connector.state // "UNKNOWN"')
    tfail=$(echo "$status" | jq -r '[.tasks[]? | select(.state!="RUNNING")] | length')
    if [ "$cstate" = RUNNING ] && [ "${tfail:-1}" = 0 ] && echo "$status" | jq -e '(.tasks|length) > 0' >/dev/null 2>&1; then
      echo "✔ CDC connector '$name' is RUNNING and captures core_business.orders"
      return 0
    fi
    echo "❌ CDC connector '$name' captures orders but is unhealthy (connector=$cstate, non-running tasks=${tfail:-?})."
    echo "   Inspect:      curl $CONNECT/connectors/$name/status | jq"
    echo "   Re-register:  bash scripts/register-cdc-connector.sh"
    exit 1
  done
  echo "❌ No Debezium connector captures core_business.orders — integrated mode can't sync to orders_cache."
  echo "   Register it:  bash scripts/register-cdc-connector.sh"
  echo "   (or run standalone-only with SKIP_CDC_CHECK=1)"
  exit 1
}
preflight_cdc

set_mode(){ # $1=standalone|integrated  $2=true|false
  db "UPDATE tenant_settings SET ingest_mode='$1', allow_app_order_create=$2 WHERE tenant_id='$TENANT';" >/dev/null
}

finish(){
  if [ "${CLEAN:-0}" = 1 ]; then
    # Delete only the visits we created (by id) — a reused route may carry
    # pre-existing seeded visits we must not touch.
    if [ -f "$VISITS_FILE" ]; then
      while read -r v; do
        [ -n "$v" ] || continue
        db "DELETE FROM planned_visits WHERE id='$v';" >/dev/null
      done < "$VISITS_FILE"
      rm -f "$VISITS_FILE"
    fi
    # Delete only routes we created (not the pre-existing active one we reused).
    if [ -f "$ROUTES_FILE" ]; then
      while read -r r; do
        [ -n "$r" ] || continue
        db "DELETE FROM routes WHERE id='$r';" >/dev/null
      done < "$ROUTES_FILE"
      rm -f "$ROUTES_FILE"
    fi
    db "DELETE FROM orders_cache WHERE order_number LIKE 'SMOKE-%' AND tenant_id='$TENANT';" >/dev/null
    echo "🧹 cleaned seeded smoke rows (MySQL SMOKE-* rows from #2 may remain)"
  fi
  set_mode integrated true
  echo "↩  restored $TENANT → ingest_mode=integrated, allow_app_order_create=true"
}
trap finish EXIT

# ── Auth ──
TOKEN=$(curl -s "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"tenantId\":\"$TENANT\"}" | jq -r '.accessToken // empty')
[ -n "$TOKEN" ] || { echo "login failed (check backend on $BASE and credentials)"; exit 1; }
AUTH=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

# A customer id to attach orders/visits to. The integrated path inserts into
# MySQL `orders`, whose customer_id FK requires the row to exist in MySQL
# `customers` (source of truth) — not just the PG cache (which the La Paz seed
# populates directly with extra customers). So pick from MySQL: that id is
# guaranteed in the PG cache too (via CDC), satisfying both modes.
CUST=$(mysqldb "SELECT id FROM customers WHERE tenant_id='$TENANT' ORDER BY id LIMIT 1;")
[ -n "$CUST" ] || { echo "no MySQL customers for $TENANT — seed customers first"; exit 1; }
echo "using customer_id=$CUST, driver_id=$DRIVER_ID"

# POST /orders → writes HTTP status to stdout, body to /tmp/smoke_body.
post_order(){ curl -s -o /tmp/smoke_body -w "%{http_code}" "${AUTH[@]}" -X POST "$BASE/orders" -d "$1"; }

# Seed a pending visit linked to an order; echoes the visit id.
# Reuses the driver's existing active route for today if one exists — the
# uq_routes_active_driver_date index allows only one non-cancelled route per
# (tenant, driver, date), so inserting a second would collide.
seed_visit(){ # $1=order_id
  local rid vid
  rid=$(db "SELECT id FROM routes WHERE tenant_id='$TENANT' AND driver_id='$DRIVER_ID' AND scheduled_date=CURRENT_DATE AND status<>'cancelled' LIMIT 1;")
  if [ -z "$rid" ]; then
    # CTE-wrap so the top-level statement is a SELECT — a bare INSERT..RETURNING
    # under `psql -tA` also prints the "INSERT 0 1" command tag, corrupting the id.
    rid=$(db "WITH ins AS (INSERT INTO routes (tenant_id, driver_id, scheduled_date, status) VALUES ('$TENANT','$DRIVER_ID',CURRENT_DATE,'active') RETURNING id) SELECT id FROM ins;")
    echo "$rid" >> "$ROUTES_FILE"
  fi
  vid=$(db "WITH ins AS (INSERT INTO planned_visits (tenant_id, route_id, driver_id, customer_id, order_id, sequence_number, scheduled_date, status) VALUES ('$TENANT','$rid','$DRIVER_ID',$CUST,$1,1,CURRENT_DATE,'pending') RETURNING id) SELECT id FROM ins;")
  echo "$vid" >> "$VISITS_FILE"
  echo "$vid"
}

complete_visit(){ curl -s -o /dev/null -w "%{http_code}" "${AUTH[@]}" -X PATCH "$BASE/visits/$1/status" -d '{"status":"completed"}'; }

# ── #1 standalone create (201, immediate read) ──
hd "#1 standalone create — expect 201 + immediate read"
set_mode standalone true
NUM1="SMOKE-STD-$TS"
code=$(post_order "{\"customerId\":$CUST,\"orderNumber\":\"$NUM1\",\"totalAmount\":100}")
[ "$code" = 201 ] && ok "POST /orders → 201" || no "POST /orders → $code (expected 201)"
OID=$(jq -r '.id // empty' < /tmp/smoke_body)
[ -n "$OID" ] && ok "201 body carries the new order (id=$OID, number=$(jq -r .orderNumber </tmp/smoke_body))" \
              || no "201 body has no order id"
seen=$(curl -s "${AUTH[@]}" "$BASE/orders" | jq -r --arg n "$NUM1" '[.[]|select(.orderNumber==$n)]|length')
[ "$seen" = 1 ] && ok "order visible immediately via GET /orders (no CDC lag)" || no "order not immediately visible (matches=$seen)"

# ── #2 integrated create (202 + CDC) and the create gate (403) ──
hd "#2 integrated create — expect 202 + CDC arrival, then 403 when create disabled"
set_mode integrated true
NUM2="SMOKE-INT-$TS"
code=$(post_order "{\"customerId\":$CUST,\"orderNumber\":\"$NUM2\",\"totalAmount\":200}")
[ "$code" = 202 ] && ok "POST /orders → 202" || no "POST /orders → $code (expected 202)"
jq -e '.correlationId' < /tmp/smoke_body >/dev/null 2>&1 && ok "202 body carries a correlationId" || no "202 body has no correlationId"
IOID=""; arr=0
for i in $(seq 1 20); do
  IOID=$(db "SELECT id FROM orders_cache WHERE tenant_id='$TENANT' AND order_number='$NUM2' LIMIT 1;")
  [ -n "$IOID" ] && { arr=$i; break; }
  sleep 1
done
[ -n "$IOID" ] && ok "order arrived in orders_cache via MySQL→CDC (id=$IOID after ${arr}s)" \
              || no "order never arrived via CDC within 20s (is integration-service + Debezium up?)"
set_mode integrated false
code=$(post_order "{\"customerId\":$CUST,\"orderNumber\":\"SMOKE-GATE-$TS\",\"totalAmount\":1}")
[ "$code" = 403 ] && ok "create blocked with 403 when allow_app_order_create=false" || no "expected 403, got $code"

# ── #3 visit-completion echo (both modes) ──
hd "#3 visit completion → order status echo"
# 3a standalone: synchronous
set_mode standalone true
VID=$(seed_visit "$OID")
code=$(complete_visit "$VID")
[ "$code" = 200 ] && ok "standalone: PATCH /visits/:id/status → 200" || no "standalone visit complete → $code"
st=$(db "SELECT status FROM orders_cache WHERE id=$OID;")
[ "$st" = "completed" ] && ok "standalone: order $OID status=completed synchronously" || no "standalone: order status=$st (expected completed)"

# 3b integrated: via CDC
if [ -n "$IOID" ]; then
  set_mode integrated true
  VID2=$(seed_visit "$IOID")
  code=$(complete_visit "$VID2")
  [ "$code" = 200 ] && ok "integrated: PATCH /visits/:id/status → 200" || no "integrated visit complete → $code"
  st=""; arr=0
  for i in $(seq 1 20); do
    st=$(db "SELECT status FROM orders_cache WHERE id=$IOID;")
    [ "$st" = "completed" ] && { arr=$i; break; }
    sleep 1
  done
  [ "$st" = "completed" ] && ok "integrated: order $IOID status=completed via CDC (after ${arr}s)" \
                          || no "integrated: order status=$st (expected completed via CDC)"
else
  no "3b skipped — no integrated order id from #2"
fi

# ── Summary ──
printf '\n\033[1m════ %d passed, %d failed ════\033[0m\n' "$pass" "$fail"
[ "$fail" = 0 ]

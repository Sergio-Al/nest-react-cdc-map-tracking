#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Register the Debezium MySQL CDC connector with Kafka Connect
# Usage:  ./scripts/cdc/register-cdc-connector.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"

echo "⏳ Waiting for Kafka Connect to be ready..."
until curl -sf "${CONNECT_URL}/connectors" > /dev/null 2>&1; do
  sleep 2
done
echo "✔ Kafka Connect is ready"

echo "📡 Registering MySQL CDC connector (upsert)..."
# PUT /connectors/<name>/config is an upsert: it creates the connector if absent
# and updates it in place if it already exists — so re-running this script is
# safe and never 409s (unlike POST /connectors). Body is the bare config object
# (no {name, config} envelope) shared with the cdc-connector-init compose
# service: scripts/cdc/cdc-connector-config.json — edit it there, not here.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
curl -sf -X PUT "${CONNECT_URL}/connectors/mysql-cdc-v4/config" \
  -H "Content-Type: application/json" \
  -d @"${SCRIPT_DIR}/cdc-connector-config.json" | python3 -m json.tool

echo ""
echo "✔ Connector registered/updated. Checking status..."
sleep 3

curl -sf "${CONNECT_URL}/connectors/mysql-cdc-v4/status" | python3 -m json.tool

echo ""
echo "🎉 Done! CDC changes from MySQL will appear on these Kafka topics:"
echo "   • cdc.accounts"
echo "   • cdc.customers"
echo "   • cdc.products"
echo "   • cdc.orders"
# NOTE: drivers are PostgreSQL-owned (written directly by tracking-service);
# they were intentionally removed from this CDC loop. Do not re-add
# core_business.drivers unless re-enabling the gated MySQL→PG inbound sync.

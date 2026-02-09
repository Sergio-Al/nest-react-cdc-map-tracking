#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Register the Debezium MySQL CDC connector with Kafka Connect
# Usage:  ./scripts/register-cdc-connector.sh
# ─────────────────────────────────────────────────────────────

set -euo pipefail

CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"

echo "⏳ Waiting for Kafka Connect to be ready..."
until curl -sf "${CONNECT_URL}/connectors" > /dev/null 2>&1; do
  sleep 2
done
echo "✔ Kafka Connect is ready"

echo "📡 Registering MySQL CDC connector..."
curl -sf -X POST "${CONNECT_URL}/connectors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "mysql-cdc-v4",
    "config": {
      "connector.class": "io.debezium.connector.mysql.MySqlConnector",
      "tasks.max": "1",
      "database.hostname": "mysql",
      "database.port": "3306",
      "database.user": "root",
      "database.password": "root_secret",
      "database.server.id": "184054",
      "topic.prefix": "cdc",
      "database.include.list": "core_business",
      "table.include.list": "core_business.accounts,core_business.customers,core_business.products,core_business.orders,core_business.users",
      "schema.history.internal.kafka.bootstrap.servers": "kafka:9092",
      "schema.history.internal.kafka.topic": "_schema-history",
      "include.schema.changes": "false",
      "decimal.handling.mode": "double",
      "time.precision.mode": "connect",
      "transforms": "route,unwrap",
      "transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
      "transforms.route.regex": "cdc\\.core_business\\.(.*)",
      "transforms.route.replacement": "cdc.$1",
      "transforms.unwrap.type": "io.debezium.transforms.ExtractNewRecordState",
      "transforms.unwrap.add.fields": "op,table,source.ts_ms",
      "transforms.unwrap.delete.handling.mode": "rewrite",
      "key.converter": "org.apache.kafka.connect.json.JsonConverter",
      "key.converter.schemas.enable": "false",
      "value.converter": "org.apache.kafka.connect.json.JsonConverter",
      "value.converter.schemas.enable": "false"
    }
  }' | python3 -m json.tool

echo ""
echo "✔ Connector registered. Checking status..."
sleep 3

curl -sf "${CONNECT_URL}/connectors/mysql-cdc-v4/status" | python3 -m json.tool

echo ""
echo "🎉 Done! CDC changes from MySQL will appear on these Kafka topics:"
echo "   • cdc.accounts"
echo "   • cdc.customers"
echo "   • cdc.products"
echo "   • cdc.orders"
echo "   • cdc.users"

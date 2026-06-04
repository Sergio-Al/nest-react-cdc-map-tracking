# integration-service (NestJS)

Kafka **commands → MySQL** writer. The only component that writes the source-of-truth
`core_business` database. NestJS 10 port of the original Go service. Runs in Docker, port `8090`.

## What it does

Subscribes (consumer group `integration-service-group`) to:

| Topic | Target table | ID source |
|---|---|---|
| `commands.customers` | `core_business.customers` | MySQL `AUTO_INCREMENT` |
| `commands.drivers` | `core_business.drivers` | client UUID (`CHAR(36)`) in the message |

For each message it parses the envelope, INSERTs into MySQL, and — once Debezium picks up the
binlog change — the row flows through `cdc.*` to the tracking-service PostgreSQL cache.

### Command envelope

```json
{
  "op": "create",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "tenantId": "tenant-1",
    "name": "John Doe",
    "vehicleType": "van"
  }
}
```

Only `op: "create"` is handled. `data` is the customer/driver payload (see
`src/modules/integration/command.types.ts`). Required: `tenantId` + `name` (customers also
need nothing else; drivers also need `id`). Optional fields fall back to MySQL defaults
(`geofence_radius_meters=100`, `customer_type=regular`, `vehicle_type=van`, `status=offline`).

## Error handling (DLQ)

| Failure | Behaviour |
|---|---|
| Invalid JSON / wrong `op` / missing required field | → `<topic>.dlq` immediately (no retry) |
| MySQL insert error | retry up to 3× (300ms base, exponential backoff) → then `<topic>.dlq` |

DLQ messages preserve the original key/value and add headers `dlq-reason` and `original-topic`.
Inspect/replay them from the tracking-service DLQ admin API or Kafka UI (`localhost:8080`).

## Endpoints

- `GET /healthz` → `{"status":"ok","service":"integration-service"}`
- `GET /metrics` → Prometheus-style text: `uptime_seconds`, `messages_processed{topic=...}`,
  `dlq_sends_total`, `db_errors_total`.

## Run

```bash
docker compose build integration-service
docker compose up -d integration-service
curl localhost:8090/healthz
```

Environment variables: see `.env.example` (`KAFKA_BROKER`, `KAFKA_GROUP_ID`, `MYSQL_*`, `HTTP_PORT`).

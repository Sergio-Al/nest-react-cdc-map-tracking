# Load Tests

Load testing suite for the Real-Time Vehicle Distribution Tracking System using [k6](https://k6.io/).

## Prerequisites

1. **Install k6**:
   ```bash
   # macOS
   brew install k6

   # Linux (Debian/Ubuntu)
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
     --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
     | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update && sudo apt-get install k6
   ```

2. **Infrastructure running**:
   ```bash
   docker compose up -d
   ```

3. **Tracking service running**:
   ```bash
   cd tracking-service && npm run start:dev
   ```

4. **Seed 1,000 test drivers**:
   ```bash
   docker exec -i cache-db psql -U tracking -d tracking_cache \
     < scripts/seed-load-test-drivers.sql
   ```

## Test Scripts

| Script | Description | VUs | Duration |
|---|---|---|---|
| `gps-ingestion.js` | Simulates 1,000 GPS devices sending positions | 0→1000 | ~8 min |
| `ws-consumers.js` | Simulates 500 WebSocket dashboard clients | 0→500 | ~7 min |
| `full-scenario.js` | Combined GPS + WebSocket test | 1500 total | ~8 min |

## Running Tests

### GPS Ingestion Only
```bash
k6 run load-tests/gps-ingestion.js
```

### WebSocket Consumers Only
```bash
k6 run load-tests/ws-consumers.js
```

### Full Scenario (GPS + WebSocket)
```bash
k6 run load-tests/full-scenario.js
```

### With System Monitoring
```bash
# Terminal 1: Start health monitor
chmod +x load-tests/check-system.sh
./load-tests/check-system.sh

# Terminal 2: Run load test
k6 run load-tests/gps-ingestion.js
```

### Custom Configuration
```bash
# Different base URL
k6 run -e BASE_URL=http://myserver:3000 load-tests/gps-ingestion.js

# Shorter test duration (override stages)
k6 run --duration 2m --vus 100 load-tests/gps-ingestion.js
```

## Thresholds

### GPS Ingestion
| Metric | Threshold | Description |
|---|---|---|
| `http_req_duration` | p95 < 200ms | 95th percentile response time |
| `http_req_duration` | p99 < 500ms | 99th percentile response time |
| `http_req_failed` | < 1% | HTTP failure rate |

### WebSocket Consumers
| Metric | Threshold | Description |
|---|---|---|
| `ws_connect_errors` | < 5% | WebSocket connection failure rate |
| `ws_connect_duration` | p95 < 3s | 95th percentile connect time |

## Results

Test results are saved to `load-tests/results/` as JSON summaries:
- `gps-ingestion-summary.json`
- `ws-consumers-summary.json`
- `full-scenario-summary.json`

## Cleanup

After testing, remove the load test drivers:
```bash
docker exec -i cache-db psql -U tracking -d tracking_cache \
  < scripts/cleanup-load-test-drivers.sql
```

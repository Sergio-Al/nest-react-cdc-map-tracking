import { gpsIngestion } from './gps-ingestion.js';
import { wsConsumers } from './ws-consumers.js';

/**
 * k6 Full Load Test Scenario
 *
 * Combines GPS ingestion (1,000 drivers) + WebSocket consumers (500 clients)
 * into a single test run with independent scenarios.
 *
 * Prerequisites:
 *   1. Infrastructure running: docker compose up -d
 *   2. Tracking service running: cd tracking-service && npm run start:dev
 *   3. Load test drivers seeded:
 *      docker exec -i cache-db psql -U tracking -d tracking_cache < scripts/seed-load-test-drivers.sql
 *
 * Run:
 *   k6 run load-tests/full-scenario.js
 */

export const options = {
  scenarios: {
    // Scenario 1: GPS device simulation
    gps_drivers: {
      executor: 'ramping-vus',
      exec: 'gpsIngestion',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '60s', target: 500 },
        { duration: '60s', target: 1000 },
        { duration: '5m', target: 1000 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },

    // Scenario 2: Dashboard WebSocket consumers (start after 30s ramp)
    ws_dashboard: {
      executor: 'ramping-vus',
      exec: 'wsConsumers',
      startVUs: 0,
      startTime: '30s', // Start after initial GPS ramp
      stages: [
        { duration: '20s', target: 100 },
        { duration: '40s', target: 300 },
        { duration: '30s', target: 500 },
        { duration: '5m', target: 500 },
        { duration: '20s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },

  thresholds: {
    // GPS ingestion thresholds
    'http_req_duration{name:POST_position}': ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],

    // WebSocket thresholds
    ws_connect_errors: ['rate<0.05'],
  },
};

// Re-export scenario functions
export { gpsIngestion, wsConsumers };

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test: 'full-scenario',
    scenarios: ['gps_drivers', 'ws_dashboard'],
    duration: data.state?.testRunDurationMs || 0,
    metrics: {
      http_reqs: data.metrics.http_reqs?.values?.count || 0,
      http_req_duration_p95: data.metrics.http_req_duration?.values?.['p(95)'] || 0,
      http_req_failed_rate: data.metrics.http_req_failed?.values?.rate || 0,
      ws_messages_received: data.metrics.ws_messages_received?.values?.count || 0,
      vus_max: data.metrics.vus_max?.values?.value || 0,
    },
  };

  return {
    'load-tests/results/full-scenario-summary.json': JSON.stringify(summary, null, 2),
  };
}

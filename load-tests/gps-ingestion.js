import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * k6 GPS Ingestion Load Test
 *
 * Simulates 1,000 GPS devices sending positions to the Traccar webhook endpoint.
 * Each virtual user represents one GPS device (LOAD0001–LOAD1000) that sends
 * a position every 5 seconds, simulating driving around La Paz, Bolivia.
 *
 * Prerequisites:
 *   1. Infrastructure running: docker compose up -d
 *   2. Tracking service running: cd tracking-service && npm run start:dev
 *   3. Load test drivers seeded:
 *      docker exec -i cache-db psql -U tracking -d tracking_cache < scripts/seed-load-test-drivers.sql
 *
 * Run:
 *   k6 run load-tests/gps-ingestion.js
 *
 * Run with custom base URL:
 *   k6 run -e BASE_URL=http://localhost:3000 load-tests/gps-ingestion.js
 */

// ── Custom metrics ─────────────────────────────────────────

const positionErrors = new Rate('position_errors');
const positionDuration = new Trend('position_duration', true);

// ── Configuration ──────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TOTAL_DRIVERS = 1000;

// La Paz, Bolivia center coordinates
const LA_PAZ_CENTER = { lat: -16.5000, lng: -68.1300 };
const COORDINATE_SPREAD = 0.05; // ~5km radius

export const options = {
  scenarios: {
    gps_ingestion: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },   // Ramp to 100 drivers
        { duration: '60s', target: 500 },   // Ramp to 500 drivers
        { duration: '60s', target: 1000 },  // Ramp to 1,000 drivers
        { duration: '5m', target: 1000 },   // Sustain 1,000 drivers
        { duration: '30s', target: 0 },     // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],  // p95 < 200ms, p99 < 500ms
    http_req_failed: ['rate<0.01'],                  // < 1% failure rate
    position_errors: ['rate<0.01'],                  // < 1% position errors
  },
};

// ── Per-VU state ───────────────────────────────────────────

/**
 * Each VU gets a unique driver ID based on its VU number (1-based).
 * The driver simulates a random walk from a starting position.
 */
export default function () {
  const driverNumber = (__VU % TOTAL_DRIVERS) + 1;
  const deviceId = `LOAD${String(driverNumber).padStart(4, '0')}`;

  // Initialize position with slight randomization from center
  const baseLat = LA_PAZ_CENTER.lat + (Math.random() - 0.5) * COORDINATE_SPREAD;
  const baseLng = LA_PAZ_CENTER.lng + (Math.random() - 0.5) * COORDINATE_SPREAD;

  // Random walk: small increments to simulate driving
  const lat = baseLat + (Math.random() - 0.5) * 0.002;
  const lng = baseLng + (Math.random() - 0.5) * 0.002;
  const speed = Math.random() * 60;           // 0–60 km/h
  const course = Math.random() * 360;         // 0–360°
  const altitude = 3600 + Math.random() * 200; // La Paz altitude: 3600–3800m

  const now = new Date().toISOString();

  // Traccar 6.x webhook format
  const payload = JSON.stringify({
    position: {
      id: Date.now(),
      deviceId: driverNumber,
      protocol: 'osmand',
      serverTime: now,
      deviceTime: now,
      fixTime: now,
      outdated: false,
      valid: true,
      latitude: lat,
      longitude: lng,
      altitude: altitude,
      speed: speed,
      course: course,
      accuracy: 5 + Math.random() * 15,
      attributes: {
        uniqueId: deviceId,
        batteryLevel: 50 + Math.random() * 50,
        motion: speed > 2,
      },
    },
    device: {
      id: driverNumber,
      uniqueId: deviceId,
      name: `Load Driver ${driverNumber}`,
      status: 'online',
    },
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: { name: 'POST_position' },
  };

  const res = http.post(`${BASE_URL}/api/traccar/positions`, payload, params);

  const success = check(res, {
    'status is 201': (r) => r.status === 201,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  positionErrors.add(!success);
  positionDuration.add(res.timings.duration);

  // Each device sends a position every 5 seconds
  sleep(5);
}

// ── Summary ────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test: 'gps-ingestion',
    metrics: {
      http_reqs: data.metrics.http_reqs?.values?.count || 0,
      http_req_duration_p95: data.metrics.http_req_duration?.values?.['p(95)'] || 0,
      http_req_duration_p99: data.metrics.http_req_duration?.values?.['p(99)'] || 0,
      http_req_duration_avg: data.metrics.http_req_duration?.values?.avg || 0,
      http_req_failed_rate: data.metrics.http_req_failed?.values?.rate || 0,
      position_errors_rate: data.metrics.position_errors?.values?.rate || 0,
      vus_max: data.metrics.vus_max?.values?.value || 0,
    },
    thresholds: Object.entries(data.metrics)
      .filter(([, v]) => v.thresholds)
      .reduce((acc, [k, v]) => {
        acc[k] = Object.entries(v.thresholds).reduce((t, [name, passed]) => {
          t[name] = passed;
          return t;
        }, {});
        return acc;
      }, {}),
  };

  return {
    'load-tests/results/gps-ingestion-summary.json': JSON.stringify(summary, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data) {
  const reqs = data.metrics.http_reqs?.values?.count || 0;
  const p95 = data.metrics.http_req_duration?.values?.['p(95)']?.toFixed(1) || '?';
  const p99 = data.metrics.http_req_duration?.values?.['p(99)']?.toFixed(1) || '?';
  const avg = data.metrics.http_req_duration?.values?.avg?.toFixed(1) || '?';
  const failRate = ((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2);
  const maxVUs = data.metrics.vus_max?.values?.value || 0;

  return `
╔═══════════════════════════════════════════════════╗
║        GPS Ingestion Load Test Results            ║
╠═══════════════════════════════════════════════════╣
║  Total requests:    ${String(reqs).padEnd(30)}║
║  Max VUs:           ${String(maxVUs).padEnd(30)}║
║  Avg duration:      ${(avg + 'ms').padEnd(30)}║
║  p95 duration:      ${(p95 + 'ms').padEnd(30)}║
║  p99 duration:      ${(p99 + 'ms').padEnd(30)}║
║  Failure rate:      ${(failRate + '%').padEnd(30)}║
╚═══════════════════════════════════════════════════╝
`;
}

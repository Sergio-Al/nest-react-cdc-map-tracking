import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';
import http from 'k6/http';

/**
 * k6 WebSocket Consumer Load Test
 *
 * Simulates 500 concurrent dashboard users connected via WebSocket,
 * receiving real-time position updates. Run alongside gps-ingestion.js
 * for a full end-to-end load test.
 *
 * Prerequisites:
 *   1. Infrastructure running: docker compose up -d
 *   2. Tracking service running: cd tracking-service && npm run start:dev
 *
 * Run:
 *   k6 run load-tests/ws-consumers.js
 *
 * Run with custom settings:
 *   k6 run -e BASE_URL=http://localhost:3000 -e WS_URL=ws://localhost:3000 load-tests/ws-consumers.js
 */

// ── Custom metrics ─────────────────────────────────────────

const wsConnectErrors = new Rate('ws_connect_errors');
const wsMessagesReceived = new Counter('ws_messages_received');
const wsConnectDuration = new Trend('ws_connect_duration', true);

// ── Configuration ──────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';

// Default credentials
const LOGIN_EMAIL = __ENV.LOGIN_EMAIL || 'admin@tenant1.com';
const LOGIN_PASSWORD = __ENV.LOGIN_PASSWORD || 'admin123';
const TENANT_ID = __ENV.TENANT_ID || 'tenant-1';

export const options = {
  scenarios: {
    ws_consumers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 100 },   // Ramp to 100 clients
        { duration: '40s', target: 300 },   // Ramp to 300 clients
        { duration: '30s', target: 500 },   // Ramp to 500 clients
        { duration: '5m', target: 500 },    // Sustain 500 clients
        { duration: '20s', target: 0 },     // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    ws_connect_errors: ['rate<0.05'],       // < 5% connection failures
    ws_connect_duration: ['p(95)<3000'],     // p95 connect < 3s
    ws_messages_received: ['count>0'],       // Must receive at least some messages
  },
};

// ── Shared auth token (obtained once per VU) ───────────────

let authToken = null;

function getAuthToken() {
  if (authToken) return authToken;

  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: LOGIN_EMAIL,
      password: LOGIN_PASSWORD,
      tenantId: TENANT_ID,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (loginRes.status === 201 || loginRes.status === 200) {
    const body = JSON.parse(loginRes.body);
    authToken = body.accessToken;
  }

  return authToken;
}

// ── Main test function ─────────────────────────────────────

export default function () {
  const token = getAuthToken();
  if (!token) {
    wsConnectErrors.add(true);
    sleep(5);
    return;
  }

  // Socket.IO uses HTTP polling handshake first, then upgrades to WebSocket.
  // For k6, we connect directly with the Socket.IO WebSocket transport.
  const socketUrl =
    `${WS_URL}/socket.io/?EIO=4&transport=websocket` +
    `&auth=${encodeURIComponent(JSON.stringify({ token }))}`;

  const connectStart = Date.now();

  const res = ws.connect(socketUrl, {}, function (socket) {
    const connectTime = Date.now() - connectStart;
    wsConnectDuration.add(connectTime);

    socket.on('open', function () {
      // Socket.IO handshake: send connect packet for /tracking namespace
      socket.send('40/tracking,{"token":"' + token + '"}');
    });

    socket.on('message', function (msg) {
      // Socket.IO messages are prefixed with packet type
      // 42 = event message
      if (msg.startsWith('42/tracking,')) {
        wsMessagesReceived.add(1);

        try {
          const payload = msg.substring(13); // Remove "42/tracking,"
          const data = JSON.parse(payload);
          const eventName = data[0];

          // We're receiving position:update and visit:update events
          if (eventName === 'position:update' || eventName === 'visit:update') {
            // Successfully received a real-time event
          }
        } catch {
          // Ignore parse errors on non-event messages
        }
      }

      // Respond to Socket.IO ping (type 2) with pong (type 3)
      if (msg === '2') {
        socket.send('3');
      }
    });

    socket.on('error', function (e) {
      wsConnectErrors.add(true);
    });

    // Join the tenant room after a short delay (wait for handshake)
    socket.setTimeout(function () {
      // Socket.IO event: join-tenant
      socket.send(
        '42/tracking,["join-tenant",{"tenantId":"' + TENANT_ID + '"}]',
      );
    }, 1000);

    // Keep connection alive for the duration of the iteration
    // Each VU stays connected for 30 seconds, then reconnects
    socket.setTimeout(function () {
      socket.close();
    }, 30000);
  });

  const connected = check(res, {
    'WebSocket connected': (r) => r && r.status === 101,
  });

  if (!connected) {
    wsConnectErrors.add(true);
  }

  // Brief pause between reconnections
  sleep(2);
}

// ── Summary ────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test: 'ws-consumers',
    metrics: {
      ws_sessions: data.metrics.ws_sessions?.values?.count || 0,
      ws_connect_duration_p95: data.metrics.ws_connect_duration?.values?.['p(95)'] || 0,
      ws_messages_received: data.metrics.ws_messages_received?.values?.count || 0,
      ws_connect_errors_rate: data.metrics.ws_connect_errors?.values?.rate || 0,
      vus_max: data.metrics.vus_max?.values?.value || 0,
    },
  };

  return {
    'load-tests/results/ws-consumers-summary.json': JSON.stringify(summary, null, 2),
    stdout: wsSummary(data),
  };
}

function wsSummary(data) {
  const sessions = data.metrics.ws_sessions?.values?.count || 0;
  const p95 = data.metrics.ws_connect_duration?.values?.['p(95)']?.toFixed(1) || '?';
  const msgs = data.metrics.ws_messages_received?.values?.count || 0;
  const errRate = ((data.metrics.ws_connect_errors?.values?.rate || 0) * 100).toFixed(2);
  const maxVUs = data.metrics.vus_max?.values?.value || 0;

  return `
╔═══════════════════════════════════════════════════╗
║        WebSocket Consumer Load Test Results       ║
╠═══════════════════════════════════════════════════╣
║  Max concurrent:    ${String(maxVUs).padEnd(30)}║
║  Total sessions:    ${String(sessions).padEnd(30)}║
║  Messages received: ${String(msgs).padEnd(30)}║
║  Connect p95:       ${(p95 + 'ms').padEnd(30)}║
║  Error rate:        ${(errRate + '%').padEnd(30)}║
╚═══════════════════════════════════════════════════╝
`;
}

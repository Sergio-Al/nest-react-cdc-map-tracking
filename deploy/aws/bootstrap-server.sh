#!/usr/bin/env bash
# Runs ON the EC2 instance (invoked by first-deploy.sh). Sets up the
# production .env, prepares OSRM map data, builds the app images, and
# brings the full stack up. Idempotent: safe to re-run.
#
#   bash /opt/tracking/deploy/aws/bootstrap-server.sh <public-ip>
set -euo pipefail

IP="${1:?Usage: bootstrap-server.sh <public-ip>}"
cd /opt/tracking

# ── .env ────────────────────────────────────────────────────
# Generated once; kept across re-runs so JWT_SECRET (and issued tokens) and
# DB passwords stay stable. Regenerate by deleting /opt/tracking/.env.
if [ ! -f .env ]; then
  echo "→ Generating production .env"
  cp .env.example .env
  JWT=$(openssl rand -hex 32)
  sed -i \
    -e "s|^NODE_ENV=.*|NODE_ENV=production|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" \
    -e "s|^LOG_LEVEL=.*|LOG_LEVEL=info|" \
    -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=http://$IP|" \
    -e "s|^FRONTEND_PORT=.*|FRONTEND_PORT=80|" \
    -e "s|^VITE_API_URL=.*|VITE_API_URL=http://$IP:3000|" \
    -e "s|^VITE_WS_URL=.*|VITE_WS_URL=http://$IP:3000|" \
    .env
else
  echo "→ .env exists, keeping it"
fi

# ── OSRM map data (La Paz) ─────────────────────────────────
if [ ! -f infrastructure/osrm/data/la-paz.osrm ]; then
  echo "→ Preparing OSRM map data (downloads Bolivia OSM, ~10 min)…"
  chmod +x infrastructure/osrm/setup.sh
  ./infrastructure/osrm/setup.sh
else
  echo "→ OSRM data present, skipping setup"
fi

# ── Build & start ──────────────────────────────────────────
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile full)

echo "→ Building app images (first run ~10 min)…"
"${COMPOSE[@]}" build

echo "→ Starting the stack…"
"${COMPOSE[@]}" up -d --remove-orphans

echo "→ Waiting for the backend to answer…"
for i in $(seq 1 60); do
  if curl -sf "http://localhost:3000/api/health" >/dev/null 2>&1; then
    echo "✔ Backend is up."
    break
  fi
  sleep 5
  [ "$i" = 60 ] && { echo "✖ Backend did not come up — check: docker compose logs tracking-service" >&2; exit 1; }
done

echo ""
echo "✔ Deployed:"
echo "   Dashboard : http://$IP"
echo "   API       : http://$IP:3000/api/health"
echo "   Traccar UI: http://$IP:8082  (admin-IP only)"
echo "   OsmAnd    : http://$IP:5055  (phone GPS ingest)"

#!/usr/bin/env bash
# First deploy: rsync the local working tree to the server, then run the
# on-server bootstrap (env file, OSRM data, image build, stack up).
#
#   ./deploy/aws/first-deploy.sh <public-ip>
#
# Subsequent deploys should come from GitHub Actions (.github/workflows/deploy.yml).
set -euo pipefail

IP="${1:?Usage: first-deploy.sh <public-ip>}"
KEY_FILE="$HOME/.ssh/tracking-demo-key.pem"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SSH_OPTS=(-i "$KEY_FILE" -o StrictHostKeyChecking=accept-new)

echo "→ Waiting for SSH + first-boot provisioning…"
until ssh "${SSH_OPTS[@]}" -o ConnectTimeout=5 "ubuntu@$IP" \
    'test -f /var/lib/cloud/instance/user-data-done' 2>/dev/null; do
  sleep 10
  printf '.'
done
echo " ready"

echo "→ Syncing repo → ubuntu@$IP:/opt/tracking (excludes node_modules/dist/logs/OSRM data)…"
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .next \
  --exclude 'logs/' --exclude 'infrastructure/osrm/data/' \
  --exclude '.env' \
  -e "ssh ${SSH_OPTS[*]}" \
  "$REPO_ROOT/" "ubuntu@$IP:/opt/tracking/"

echo "→ Running on-server bootstrap…"
ssh "${SSH_OPTS[@]}" "ubuntu@$IP" "bash /opt/tracking/deploy/aws/bootstrap-server.sh $IP"

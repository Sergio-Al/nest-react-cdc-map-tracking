#!/bin/bash
#
# check-system.sh — Monitor system health during load tests
#
# Polls the tracking service health endpoint, Docker container stats,
# and Kafka consumer lag to provide real-time visibility during load testing.
#
# Usage: ./load-tests/check-system.sh
# Stop:  Ctrl+C
#

BASE_URL="${BASE_URL:-http://localhost:3000}"
INTERVAL="${INTERVAL:-10}"  # seconds between checks

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "╔═══════════════════════════════════════════════════╗"
echo "║       System Health Monitor (every ${INTERVAL}s)          ║"
echo "╠═══════════════════════════════════════════════════╣"
echo "║  Base URL: ${BASE_URL}"
echo "║  Press Ctrl+C to stop"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

check_count=0

while true; do
  check_count=$((check_count + 1))
  timestamp=$(date '+%H:%M:%S')

  echo "━━━ Check #${check_count} at ${timestamp} ━━━━━━━━━━━━━━━━━━━"

  # 1. Health endpoint
  health=$(curl -s --max-time 5 "${BASE_URL}/api/health" 2>/dev/null)
  if [ $? -eq 0 ] && [ -n "$health" ]; then
    status=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
    kafka=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin)['services'].get('kafka','?'))" 2>/dev/null)
    redis=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin)['services'].get('redis','?'))" 2>/dev/null)
    timescale=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin)['services'].get('timescale','?'))" 2>/dev/null)
    ws_clients=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin)['websocket'].get('connectedClients',0))" 2>/dev/null)
    cdc_status=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cdc',{}).get('status','?'))" 2>/dev/null)
    dlq_total=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('dlq',{}).get('totalMessages',0))" 2>/dev/null)

    if [ "$status" = "ok" ]; then
      echo -e "  Health:     ${GREEN}${status}${NC}"
    elif [ "$status" = "warning" ]; then
      echo -e "  Health:     ${YELLOW}${status}${NC}"
    else
      echo -e "  Health:     ${RED}${status}${NC}"
    fi

    echo "  Services:   kafka=${kafka} redis=${redis} timescale=${timescale}"
    echo "  WebSocket:  ${ws_clients} connected clients"
    echo "  CDC:        ${cdc_status}"
    echo "  DLQ:        ${dlq_total} messages"
  else
    echo -e "  Health:     ${RED}UNREACHABLE${NC}"
  fi

  # 2. Docker container CPU/memory (top 5 by CPU)
  echo "  ─── Docker Stats ───"
  docker stats --no-stream --format "    {{.Name}}: CPU={{.CPUPerc}} MEM={{.MemUsage}}" 2>/dev/null \
    | grep -E "kafka|cache-db|timescale|redis|tracking" \
    | head -6

  # 3. Redis memory
  redis_mem=$(docker exec redis redis-cli -a redis_secret INFO memory 2>/dev/null | grep used_memory_human | tr -d '\r')
  if [ -n "$redis_mem" ]; then
    echo "  Redis:      ${redis_mem}"
  fi

  echo ""
  sleep "${INTERVAL}"
done

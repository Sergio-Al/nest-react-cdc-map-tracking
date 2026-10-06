#!/usr/bin/env bash
# Demostración para presentación: ejecutar solo cuando el presentador quiera
# provocar las fallas. Este script sí detiene servicios; no es una prueba de humo.
# Uso: bash scripts/demos/cdc-pipeline-demo.sh [--auto] [--act 1..5]
# Requiere stack listo, imágenes actualizadas y el tópico pipeline.traces creado.
set -euo pipefail
AUTO=0; ACT=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --auto) AUTO=1; shift ;;
    --act) ACT="${2:?Falta el número de acto}"; shift 2 ;;
    *) echo "Uso: $0 [--auto] [--act 1..5]"; exit 1 ;;
  esac
done
[[ "$ACT" =~ ^[0-5]$ ]] || { echo 'Acto inválido'; exit 1; }
BASE="${BASE_URL:-http://localhost:3000/api}"
TENANT="${TENANT_ID:-tenant-1}"
EMAIL="${LOGIN_EMAIL:-admin@tenant1.com}"
PASSWORD="${LOGIN_PASS:-admin123}"
[[ "$TENANT" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Tenant inválido'; exit 1; }
for tool in curl jq docker uuidgen; do
  command -v "$tool" >/dev/null || { echo "Falta $tool"; exit 1; }
done
WORK=$(mktemp -d "${TMPDIR:-/tmp}/cdc-pipeline-demo.XXXXXX")
STOPPED_INTEGRATION=0; STOPPED_MYSQL=0; ORIGINAL_MODE=''
db(){ docker exec -i cache-db psql -U tracking -d tracking_cache -v ON_ERROR_STOP=1 -tAc "$1"; }
mode(){ db "UPDATE tenant_settings SET ingest_mode='$1' WHERE tenant_id='$TENANT';" >/dev/null; }
finish(){
  if [ "$STOPPED_MYSQL" = 1 ]; then docker start mysql >/dev/null || true; fi
  if [ "$STOPPED_INTEGRATION" = 1 ]; then docker start integration-service >/dev/null || true; fi
  if [ -n "$ORIGINAL_MODE" ]; then mode "$ORIGINAL_MODE" || true; fi
  rm -f "$WORK/body" "$WORK/headers" "$WORK/trace"
  rmdir "$WORK" || true
}
trap finish EXIT
pause(){ if [ "$AUTO" = 0 ]; then read -r -p 'Presiona Enter para continuar…' _; echo; fi; }
act(){ printf '\n════ Acto %s — %s ════\n' "$1" "$2"; echo 'Mira el dashboard: Monitoreo → Pipeline.'; pause; }
selected(){ [ "$ACT" = 0 ] || [ "$ACT" = "$1" ]; }
ORIGINAL_MODE=$(db "SELECT ingest_mode FROM tenant_settings WHERE tenant_id='$TENANT';")
[[ "$ORIGINAL_MODE" = integrated || "$ORIGINAL_MODE" = standalone ]] || { echo 'Falta tenant_settings'; ORIGINAL_MODE=''; exit 1; }
LOGIN=$(jq -n --arg email "$EMAIL" --arg password "$PASSWORD" --arg tenantId "$TENANT" '{email:$email,password:$password,tenantId:$tenantId}')
TOKEN=$(curl -fsS "$BASE/auth/login" -H 'Content-Type: application/json' -d "$LOGIN" | jq -r '.accessToken // empty')
[ -n "$TOKEN" ] || { echo 'No se pudo iniciar sesión'; exit 1; }
AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')
CID=''
create_customer(){
  local name payload code
  name="DEMO-PIPELINE-$1-$(date +%s)-$$"
  payload=$(jq -n --arg tenantId "$TENANT" --arg name "$name" '{tenantId:$tenantId,name:$name,latitude:-16.5,longitude:-68.13}')
  code=$(curl -sS "${AUTH[@]}" -X POST "$BASE/customers" -d "$payload" -D "$WORK/headers" -o "$WORK/body" -w '%{http_code}')
  CID=$(awk 'tolower($1)=="x-correlation-id:" {gsub("\r", "", $2); print $2}' "$WORK/headers")
  if [ -z "$CID" ]; then CID=$(jq -r '.correlationId // empty' "$WORK/body"); fi
  echo "HTTP $code · correlationId=$CID"
  [[ "$code" = 201 || "$code" = 202 ]] && [ -n "$CID" ] || { cat "$WORK/body"; return 1; }
}
print_trace(){
  jq -r '
    def ms: . as $s | (($s | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601)*1000)
      + (try ($s | capture("\\.(?<ms>[0-9]{3})Z$").ms | tonumber) catch 0);
    . as $trace | .stages as $stages |
    range(0; $stages|length) as $i | $stages[$i] as $stage |
    (if $i==0 then 0 else (($stage.at|ms)-($stages[$i-1].at|ms)) end) as $delta |
    "  \($stage.at) · \($stage.stage) · +\($delta) ms \(($stage.detail // {})|tojson)"
  ' "$WORK/trace"
  jq -r '"Estado: \(.status) · Total: \(.totalMs // "pendiente") ms"' "$WORK/trace"
}
wait_trace(){ # estado esperado, plazo en segundos
  local expected="$1" timeout="${2:-45}" i last='' signature status
  for ((i=0;i<timeout;i++)); do
    if curl -fsS "${AUTH[@]}" "$BASE/pipeline/traces/$CID" -o "$WORK/trace"; then
      signature=$(jq -r '"\(.status):\(.stages|length)"' "$WORK/trace")
      if [ "$signature" != "$last" ]; then print_trace; last="$signature"; fi
      status=$(jq -r '.status' "$WORK/trace")
      if [ "$status" = "$expected" ]; then return 0; fi
    fi
    sleep 1
  done
  echo "La traza no llegó a '$expected' dentro de ${timeout}s."; return 1
}
wait_mysql(){
  local i health
  for ((i=0;i<60;i++)); do
    health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' mysql)
    if [ "$health" = healthy ]; then return 0; fi
    sleep 1
  done
  echo 'MySQL no está saludable todavía.'; return 1
}

if selected 1; then
  act 1 'Camino feliz integrado: API → Kafka → MySQL → CDC → PostgreSQL → WebSocket'
  mode integrated; create_customer integrado; wait_trace completed
  echo 'Selecciona la traza y observa los tiempos de cada etapa.'; pause
fi
if selected 2; then
  act 2 'Contraste standalone: API → PostgreSQL → WebSocket'
  mode standalone; create_customer standalone; wait_trace completed
  echo 'Solo tres etapas: los datos son propios de PostgreSQL.'; pause; mode integrated
fi
if selected 3; then
  act 3 'Servicio de integración caído: Kafka conserva el comando'
  mode integrated; STOPPED_INTEGRATION=1; docker stop integration-service >/dev/null
  create_customer servicio-caido
  sleep 2
  curl -fsS "${AUTH[@]}" "$BASE/pipeline/traces/$CID" -o "$WORK/trace"; print_trace
  echo 'La traza queda en kafka.produced. Ahora recuperamos el consumidor.'; pause
  docker start integration-service >/dev/null; STOPPED_INTEGRATION=0
  wait_trace completed 90; pause
fi
if selected 4; then
  act 4 'MySQL caído: reintentos y cola de mensajes fallidos'
  mode integrated; STOPPED_MYSQL=1; docker stop mysql >/dev/null
  create_customer db-caida; wait_trace failed 90
  echo 'Observa integration.retry y dlq.sent; abre commands.customers.dlq.'; pause
  docker start mysql >/dev/null; STOPPED_MYSQL=0; wait_mysql
  if [ "$AUTO" = 1 ]; then
    curl -fsS "${AUTH[@]}" -X POST "$BASE/dlq/commands.customers.dlq/replay?limit=100" | jq .
  else
    echo 'Presiona «Reintentar» en el panel DLQ del dashboard.'; pause
  fi
  wait_trace completed 90; pause
fi
if selected 5; then
  act 5 'Mensaje venenoso: validación permanente, sin reintentos'
  mode integrated
  CID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  poison=$(jq -nc --arg tenantId "$TENANT" --arg correlationId "$CID" '{op:"create",correlationId:$correlationId,data:{tenantId:$tenantId}}')
  printf '%s|%s\n' "$TENANT" "$poison" | docker exec -i kafka /opt/kafka/bin/kafka-console-producer.sh \
    --bootstrap-server kafka:9092 --topic commands.customers --property parse.key=true --property 'key.separator=|'
  echo "correlationId=$CID · falta el nombre del cliente: observa la DLQ sin reintentos."
  wait_trace failed; pause
fi
echo 'Demostración terminada; se restaura el modo original del tenant.'

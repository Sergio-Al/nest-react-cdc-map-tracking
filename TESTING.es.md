# 🧪 Pruebas Unitarias

> 🇬🇧 English version: [TESTING.md](TESTING.md)

Documentación de las pruebas unitarias del proyecto. Cubren los servicios de negocio más críticos de `tracking-service` y los handlers de comandos de `integration-service-nest`.

**Estado actual: 235 pruebas en 21 suites, todas en verde.**

| Servicio | Suites | Pruebas | Tiempo aprox. |
|---|---|---|---|
| `tracking-service` | 19 | 205 | ~8 s |
| `integration-service-nest` | 2 | 30 | ~2 s |

## Cómo ejecutarlas

Las pruebas son **unitarias puras**: todas las dependencias externas (PostgreSQL, MySQL, Kafka, Redis, TimescaleDB, Traccar) están mockeadas. **No necesitan Docker ni infraestructura levantada.**

```bash
# tracking-service
cd tracking-service
npm test              # toda la suite
npm run test:watch    # modo watch durante el desarrollo
npm run test:cov      # con reporte de cobertura (→ coverage/)
npx jest visits       # una sola suite, por nombre de archivo

# integration-service-nest
cd integration-service-nest
npm test
```

> Nota: al correr la suite verás líneas `ERROR` en la consola. Son esperadas — corresponden a las pruebas de rutas de fallo (Kafka caído, TimescaleDB caído, etc.) que ejercitan el logging de errores de los servicios. Lo que importa es el resumen final de Jest.

## Convenciones

Todas las suites siguen el mismo estilo (el archivo de referencia original es `tracking-service/src/modules/kafka/dlq.service.spec.ts`):

- **Un archivo `*.spec.ts` junto al servicio que prueba** (Jest los descubre vía `testRegex` en `package.json`; no hay carpeta `__tests__`).
- **`Test.createTestingModule` de `@nestjs/testing`** con todos los providers mockeados vía `useValue`. Los repositorios TypeORM se inyectan con `getRepositoryToken(Entidad, 'cacheDb')`.
- **Se prueba comportamiento, no implementación**: qué se publicó en Kafka, qué se escribió en el repositorio, qué excepción se lanzó — no el orden interno de llamadas.
- **Consumidores de Kafka**: se invoca `onModuleInit()`, se captura el handler real registrado en `KafkaConsumerService.registerHandler` y se le pasan payloads fabricados. Así se ejercita el pipeline completo tal como lo ve Kafka.
- **Fake timers de Jest** donde hay `setInterval`/backoff con `setTimeout` (enrichment, handlers de integración) para que las pruebas sean deterministas y rápidas (`jest.runAllTimersAsync()` drena los sleeps de reintento).
- **bcrypt real** en las pruebas de auth (factor de costo 4 para velocidad): el hasheo de contraseñas se verifica de verdad, no con mocks.

## Suites de `tracking-service`

### `enrichment/geo-utils.spec.ts` — 12 pruebas

Funciones puras de geolocalización:

- **Haversine**: distancia cero en el mismo punto, distancias conocidas (1° de latitud ≈ 111 km), simetría.
- **ETA**: vehículo detenido o velocidad negativa → `null`; redondeo a segundos enteros.
- **Geocerca**: dentro/fuera del radio, y el borde exacto cuenta como *dentro* (`<=`).

### `enrichment/enrichment.service.spec.ts` — 23 pruebas

El corazón del pipeline GPS, probado a través del handler real de `gps.positions`:

- **Mapa dispositivo→conductor**: dispositivos desconocidos se descartan sin tocar nada aguas abajo; `attributes.uniqueId` (ej. `DEV001`) tiene prioridad sobre el `deviceId` numérico de Traccar; `refreshDriverMapping` agrega/re-empareja/despareja en vivo (un cambio de dispositivo desaloja la clave anterior) y `removeDriverMapping` elimina al conductor del lookup.
- **Fan-out**: la posición enriquecida llega a Kafka (`gps.positions.enriched`, key = driverId, header tenantId), Redis (`pos:driver:*`, GeoSet por tenant, ZSET de activos) y el snapshot en PG. Un fallo de Kafka **no** hunde los otros destinos (`Promise.allSettled`).
- **Proximidad**: distancia y ETA hacia el cliente de la siguiente visita; campos en `null` cuando el cliente no tiene coordenadas.
- **Auto-llegada por geocerca**: dispara para visitas `pending` y `en_route`; **no** dispara mientras hay una visita `in_progress`; si `markArrived` falla, el handler sobrevive y publica `visitAutoArrival: false`.
- **Sin llegadas en cascada** (regresión): posiciones dentro de la geocerca de la parada *actual* en curso no deben marcar como llegada la *siguiente* visita — esto llegó a marcar todas las paradas restantes de una ruta.
- **Salida automática por geocerca**: la visita en sitio se marca como salida solo tras 3 posiciones consecutivas más allá del radio + 50 m; una posición de vuelta adentro reinicia la racha, el ruido dentro del margen se ignora y un fallo de `markDeparted` no rompe el pipeline.
- **Estado del conductor**: se marca `active` una sola vez por proceso, no en cada posición.
- **Buffer de TimescaleDB**: las filas pendientes se escriben al apagar el servicio (`onModuleDestroy`).

### `visits/visits.service.spec.ts` — 27 pruebas

El ciclo de vida de visitas del que depende la app de conductores:

- **Idempotencia natural**: una transición redundante al estado actual es un no-op puro — sin save, sin evento Kafka, sin fila duplicada de historial. Esto es lo que hace seguros el outbox offline de la app y los disparos repetidos de geocerca.
- **Timestamps por estado**: `arrivedAt` / `completedAt` / `departedAt` según la transición; el historial (`visit_completions` en TimescaleDB) se escribe **solo** al entrar a un estado terminal (`completed`/`skipped`/`failed`), con `durationSec` (llegada→completado) y `onTime` calculado contra la ventana horaria.
- **Pedidos**: al completar una visita con `orderId` se delega a `OrdersService.setOrderStatus`; sin `orderId` no se toca nada. Fallos de pedidos, Kafka o TimescaleDB **no** impiden completar la visita (best-effort).
- **Consultas del conductor**: `getNextVisitForDriver` solo considera visitas `pending`/`en_route` de hoy en adelante (el guard contra visitas viejas que secuestran el contexto de ETA/geocerca); `getCurrentVisitForDriver` busca la visita `in_progress`; `getOnSiteVisitForDriver` encuentra la última visita con llegada y sin salida (incluidas las completadas antes de irse).
- **Salida**: `markDeparted` marca `departedAt` en visitas llegadas / en curso / completadas, nunca sobrescribe una salida existente e ignora visitas a las que el conductor nunca llegó.
- **Salidas perdidas**: al registrar una nueva llegada, las visitas anteriores del conductor que quedaron sin salida se cierran con la hora de esa llegada, en un solo update.
- **Día local, no UTC**: "hoy" se calcula en la zona horaria del despliegue (`America/La_Paz`); prueba de regresión para las 20:00–24:00 locales, cuando el día UTC ya cambió.
- **CRUD**: creación con estado `pending` + incremento de paradas de la ruta; borrado solo permitido en `pending`; búsquedas con scope de tenant que devuelven 404 en vez de filtrar datos cruzados.

### `auth/auth.service.spec.ts` — 28 pruebas

Autenticación contra `cached_users` (PG-owned):

- **Login**: lookup con scope de tenant; rechazo de usuario desconocido, contraseña incorrecta y usuario inactivo; el bundle devuelto trae access token, refresh token (guardado en Redis con el TTL configurado), el usuario **sin** el campo `password` y los settings efectivos.
- **Registro**: chequeo de duplicados + el backstop de la violación de unicidad de PG (`23505`) traducida a `409 Conflict`; la contraseña se guarda hasheada (verificado con `bcrypt.compare` real); la prueba inversa de 14 días arranca solo para `role: 'admin'` y su fallo nunca bloquea la creación de la cuenta.
- **Signup self-serve**: slugs reservados (`admin`, `api`, …) rechazados antes de reclamar nada; el workspace se reclama en minúsculas; auto-login al final.
- **Login de conductor**: un login por conductor; conflictos de email y de conductor ya vinculado.
- **Refresh / logout**: rotación del refresh token (el viejo se borra de Redis), rechazo de tokens desconocidos y de usuarios desactivados.
- **`validateUser`** (validación JWT por request): cache en Redis de 60 s que evita golpear PG en cada request — el hit de cache no consulta la BD, la contraseña **nunca** se cachea, y usuarios inactivos devuelven `null` sin cachearse.

### `drivers/drivers.service.spec.ts` — 20 pruebas

Conductores PG-owned y sus contratos de efectos secundarios:

- **Cada mutación mantiene sincronizados el mapa de enrichment y Traccar**: crear provisiona el dispositivo; cambiar de dispositivo deshabilita el anterior y asegura el nuevo; cambiar solo el nombre refresca el dispositivo existente; cambios no relacionados (ej. `status`) no tocan nada.
- **Desactivación** = soft delete: estado `inactive`, emparejamiento limpio, `removeDriverMapping`, dispositivo Traccar deshabilitado (no borrado — se preserva el historial).
- **Conflictos de dispositivo**: rechazados por el pre-chequeo (`deviceInUse`) y por el backstop `23505` contra la carrera check-then-insert.
- **Cupos**: `assertCanAddDriver` (asiento facturable) corre **antes** de cualquier escritura.
- **`provisionAppDevice`** (app móvil del conductor): acuña un id estable `APP-<driverId>` para conductores sin dispositivo; idempotente para los ya emparejados (mantiene el id, solo re-asegura Traccar).
- **Scope de tenant**: ids cruzados dan 404 antes de cualquier efecto; la reconciliación de arranque solo re-provisiona conductores emparejados no inactivos.

### `orders/orders.service.spec.ts` — 9 pruebas

El punto de entrada dual-mode de pedidos:

- **La compuerta de crear/actualizar**: tenant `integrated` con `allowAppOrderCreate: false` → `403 Forbidden` sin llegar al writer; con el flag activo, pasa. Standalone siempre pasa.
- **`setOrderStatus` nunca se bloquea**: el write-back de completar una entrega es integración, no originación — funciona incluso con las creaciones deshabilitadas.
- **`OrderWriterResolver`**: elige la estrategia por tenant desde `tenant_settings.ingest_mode` (standalone ↔ integrated) y propaga el flag de creación.
- Lecturas siempre desde `orders_cache`, más recientes primero; 404 con scope de tenant.

### `orders/writers/order-writers.spec.ts` — 9 pruebas

Las dos estrategias de escritura, lado a lado:

- **`StandaloneOrderWriter`** (PG es dueño, síncrono): insert directo que devuelve la fila (`mode: 'sync'` → HTTP 201); número `ORD-######` acuñado desde la secuencia cuando el DTO no lo trae; updates parciales que solo tocan campos presentes; fila inexistente → 404 en update pero warn-y-continúa en status.
- **`IntegratedOrderWriter`** (Kafka, asíncrono): cada operación emite el comando correcto en `commands.orders` (`op: create/update/status`, key = tenantId, correlationId devuelto como `mode: 'async'` → HTTP 202), incluyendo la metadata de completado (`driverId`, `visitId`) en los comandos de status.

### `drivers/driver-events.spec.ts` — 12 pruebas

El feed de actividad derivado detrás de `GET /drivers/:id/events` (funciones puras, sin mocks):

- **Eventos de visita**: llegada / completada (con tiempo en sitio) / salida; omitidas y fallidas se reportan en su hora de cierre en lugar de "salida"; se ignoran marcas fuera de la ventana.
- **Inicio de turno**: la primera posición de la ventana.
- **Inactividad**: detenido ≥ 5 min lejos de cualquier parada; las paradas cortas (semáforos) se ignoran; estacionar en un cliente no es inactividad — la ventana en sitio sigue abierta tras completar hasta que el conductor sale; los huecos del dispositivo cortan el tramo (teléfono apagado no es inactividad).
- **Exceso de velocidad**: un evento por tramo en su velocidad pico; un pico de una sola posición (ruido GPS) se ignora.
- Todo combinado del más reciente al más antiguo.

### `traccar/traccar.controller.spec.ts` — 3 pruebas

- **Unidades de velocidad**: la velocidad del `PositionData` de Traccar se convierte de nudos a km/h (payload simple y arreglo); el formato plano manual / de pruebas de carga pasa sin cambios (ya está en km/h).

### `kafka/dlq.service.spec.ts` — 14 pruebas *(preexistente)*

Ruteo a topics `*.dlq` (los topics `cdc.*` comparten `cdc.dlq`), headers de diagnóstico, contadores, truncado de stacks largos, y la política `withRetry` (backoff exponencial, errores permanentes sin reintento, no lanzar si el propio DLQ falla).

### `kafka/kafka-consumer.service.spec.ts` — 1 prueba

Un topic opcional ausente (el topic del pipeline) no impide que los handlers de los topics existentes sigan corriendo.

### `dlq/dlq-admin.service.spec.ts` — 15 pruebas

Administración de DLQ (`/api/dlq/*`): lista también las colas `commands.*.dlq`; cuenta como pendientes solo los registros posteriores al cursor de replay; el replay reenvía cada mensaje a su topic de origen (con ruteo por mensaje en la cola compartida `cdc.dlq`), avanza el cursor y se detiene en un envío fallido para reintentarlo después; rechaza colas desconocidas antes de consumir.

### `customers/customers.controller.spec.ts` — 4 pruebas

Escrituras de clientes según el modo del tenant: `201`/`200` síncrono (standalone) o `202 Accepted` asíncrono (integrado); siempre se usa el tenant del JWT, nunca el del body.

### `customers/customer-writer.resolver.spec.ts` — 2 pruebas

Sin fila de `tenant_settings` el tenant es standalone; el writer integrado se elige por la configuración del tenant, independiente del gate de creación de pedidos.

### `customers/writers/customer-writers.spec.ts` — 7 pruebas

- **Standalone (PG directo)**: devuelve la fila insertada, invalida la cache y notifica al tenant; updates parciales (incluidas coordenadas cero) con scope de tenant; 404 localizado para ids inexistentes o de otro tenant; un fallo de notificación no convierte en error una escritura ya aplicada.
- **Integrado (Kafka)**: respeta el contrato exacto de los comandos create/update con el tenant autoritativo; los fallos de Kafka se propagan en vez de confirmar una escritura no encolada.

### `sync/cdc-consumer.service.spec.ts` — 5 pruebas

El consumidor CDC aplica upserts y deletes al cache de PostgreSQL, invalida la cache de clientes, enlaza el cambio con su traza del pipeline y emite `cdc:change` al tenant con la latencia medida; no emite en los snapshot reads (`op: 'r'`) del arranque, y un fallo de invalidación o broadcast nunca hace fallar un cambio ya aplicado.

### `pipeline/pipeline-trace.service.spec.ts` — 9 pruebas

Trazas del pipeline CDC en Redis: creación atómica con índice por tenant acotado y TTL de 24 h; agregado atómico de etapas con duración total; aislamiento entre tenants; lecturas acotadas a 100; reconciliación cuando el CDC llega antes que la confirmación del commit; nada de esto rompe escrituras ni lecturas si Redis no está disponible.

### `pipeline/pipeline.types.spec.ts` — 3 pruebas

Cálculo del estado de una traza: fallos a DLQ y reinicio al hacer replay, cronología de origen ante ACKs de Kafka tardíos, y tiempo total a través de un intento fallido más su replay.

### `common/utils/local-date.spec.ts` — 2 pruebas

`localDate(tz)` devuelve la fecha civil de La Paz tras el cambio de día UTC y coincide con la fecha UTC cuando ambas concuerdan.

## Suites de `integration-service-nest`

Ambos handlers se prueban a través del handler real registrado en Kafka, con fake timers para que los backoffs de reintento sean instantáneos. Además, cada uno emite los eventos del pipeline CDC (consumido, confirmado con el id real del insert en MySQL, cada intento fallido y el motivo final del DLQ), y un fallo al producir esos eventos nunca hace fallar la escritura de negocio.

### `integration/customers.handler.spec.ts` — 14 pruebas

- **Fallos permanentes → DLQ directo, un solo intento de BD**: JSON inválido, `op` desconocido, `tenantId`/`name`/`id` faltantes, cliente inexistente en un update.
- **Escrituras exitosas**: insert con defaults (`geofenceRadiusMeters: 100`, `customerType: 'regular'`) y el `correlationId` persistido para idempotencia; updates parciales solo con los campos presentes en el comando.
- **Semántica at-least-once**: un `correlation_id` duplicado (redelivery de Kafka de un comando ya aplicado) se trata como **éxito**, no como error — sin DLQ, sin reintento.
- **Reintentos**: errores transitorios de BD reintentan con backoff y solo van al DLQ tras agotar los 4 intentos; una recuperación a mitad de camino evita el DLQ.

### `integration/orders.handler.spec.ts` — 16 pruebas

Lo mismo que customers para las tres operaciones (`create`/`update`/`status`), más:

- **`op: 'status'`** (el eco de completar entrega): update con scope de tenant; campos requeridos validados; pedido inexistente → DLQ permanente sin reintentos.
- **Número de pedido determinista**: cuando el comando `create` no trae `orderNumber`, se deriva del `correlationId` (`ORD-<primeros 12 chars>`) — nunca un `Date.now()` fresco por entrega, para que las redeliveries choquen con la restricción de unicidad en vez de acuñar números nuevos.

## Qué NO se prueba unitariamente (y por qué)

- **Controllers, gateways y módulos de infraestructura** (`redis`, `timescale`, wrappers de Kafka): son pegamento fino; se cubren mejor con e2e contra el stack de Docker. (Excepción: la normalización de payloads del webhook de Traccar, que hace la conversión nudos → km/h.)
- **Comportamiento del pipeline de punta a punta** (Traccar → Kafka → enrichment → geocerca → visitas): se ejercita en vivo con `scripts/simulators/simulate-route.mts` (ver el README).
- **Internals de query builders de TypeORM**: se asserta el resultado observable, no la cadena de llamadas (salvo donde la cláusula ES la lógica, como el filtro de fechas de `getNextVisitForDriver`).
- El flujo CDC completo MySQL → Debezium → Kafka → cache ya tiene verificación e2e propia: `scripts/` (`smoke-orders-dual-mode.sh`) y el skill `/verify-cdc`.

## Cobertura pendiente (próximos candidatos)

En orden de valor sugerido:

1. `routes` — construcción de requests y mapeo de respuestas de OSRM / OR-Tools (mockeando el HTTP).
2. `customers` — la cache de 3 niveles (Map en proceso → Redis → PG → fallback MySQL).
3. `sync` — el monitoreo de lag del CDC (el consumidor `CdcConsumerService` ya está cubierto).
4. Frontend (`fleetview-live-main`) — Vitest ya está configurado; priorizar hooks con lógica (ej. `hooks/api/useReports.ts`).

# 🚚 Sistema de Rastreo Vehicular para Distribución en Tiempo Real

Sistema de rastreo vehicular en tiempo real diseñado para monitorear **1,000 conductores** realizando entregas, con un dashboard que soporta **500 usuarios concurrentes** visualizando posiciones en vivo, visitas planificadas, historial de rutas y reproducción de recorridos.

> 📖 [Read in English](README.md)

---

## 📋 Tabla de Contenidos

- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Stack Tecnológico](#-stack-tecnológico)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Requisitos Previos](#-requisitos-previos)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Ejecución](#-ejecución)
- [Flujos de Datos](#-flujos-de-datos)
- [Módulos del Servicio NestJS](#-módulos-del-servicio-nestjs)
- [API REST](#-api-rest)
- [Tópicos de Kafka](#-tópicos-de-kafka)
- [Esquemas de Base de Datos](#-esquemas-de-base-de-datos)
- [Patrones de Diseño](#-patrones-de-diseño)
- [Pruebas Manuales](#-pruebas-manuales)
- [Estado del Proyecto](#-estado-del-proyecto)

---

## 🏗 Arquitectura del Sistema

```
Dispositivos GPS (1000)
       │ TCP/UDP
       ▼
┌──────────────┐     ┌──────────────┐
│   TRACCAR    │────▶│  Traccar DB  │
│   Server     │     │ (PostgreSQL) │
└──────┬───────┘     └──────────────┘
       │ HTTP Webhook
       ▼
┌──────────────┐
│ APACHE KAFKA │◀──── Debezium CDC ◀──── MySQL (Fuente de Verdad)
│              │                          (Clientes, Cuentas,
│ Tópicos:     │                           Pedidos, Productos)
│ • gps.positions              │
│ • gps.positions.enriched     │
│ • gps.events                 │
│ • visits.events              │
│ • cdc.customers              │
│ • cdc.accounts               │
│ • cdc.products               │
│ • cdc.orders                 │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│         TRACKING SERVICE (NestJS)                │
│                                                  │
│  ┌─────────────────┐  ┌──────────────────────┐  │
│  │ Traccar Webhook  │  │ Consumidores Kafka   │  │
│  │ Controller       │  │ • Posiciones GPS     │  │
│  │ POST /positions  │  │ • Sincronización CDC │  │
│  │ POST /events     │  │ • Eventos de visitas │  │
│  └────────┬─────────┘  └──────────┬───────────┘  │
│           ▼                       ▼               │
│  ┌──────────────────────────────────────────┐    │
│  │       Servicio de Enriquecimiento         │    │
│  │  • Cruzar posición GPS con:               │    │
│  │    - Info del conductor (caché local)     │    │
│  │    - Datos del cliente (caché local)      │    │
│  │    - Visitas planificadas (BD local)      │    │
│  │  • Calcular proximidad y ETA              │    │
│  │  • Detectar llegada/salida (geofence)     │    │
│  └──────────────────────────────────────────┘    │
│           │                                      │
│     ┌─────┼──────────────┬───────────────┐       │
│     ▼     ▼              ▼               ▼       │
│  ┌─────┐ ┌────────┐ ┌──────────┐ ┌───────────┐  │
│  │Redis│ │Cache PG│ │Timescale │ │ WebSocket │  │
│  │     │ │(local) │ │   DB     │ │ Gateway   │  │
│  └─────┘ └────────┘ └──────────┘ └───────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 🛠 Stack Tecnológico

| Componente | Tecnología | Versión | Propósito |
|---|---|---|---|
| Servidor GPS | Traccar | 6.5 | Decodificación de protocolos, gestión de dispositivos |
| BD Traccar | PostgreSQL | 16 | Almacenamiento interno de Traccar |
| Broker de Mensajes | Apache Kafka | 3.9.0 (modo KRaft) | Streaming de eventos, desacoplamiento |
| CDC | Debezium | 2.7.3.Final | Captura de cambios MySQL → Kafka |
| BD Fuente de Verdad | MySQL | 8.0 | Datos de negocio (Clientes, Cuentas, Pedidos, Productos) |
| Servicio Backend | NestJS | 10+ | Servicio principal de rastreo |
| BD Caché Local | PostgreSQL | 16 | Datos sincronizados de MySQL, visitas, rutas |
| BD Histórica | TimescaleDB | latest-pg16 | Series de tiempo, historial de posiciones, analíticas |
| Caché / Pub-Sub | Redis | 7-alpine | Posiciones recientes, caché de 3 niveles |
| WebSocket | Socket.io | 4+ | Push en tiempo real al dashboard |
| Lenguaje | TypeScript | 5+ | Backend |
| Contenedores | Docker + Docker Compose | Latest | Entorno de desarrollo |

---

## 📁 Estructura del Proyecto

```
streaming-tracking-logistic/
├── .env.example                      # Plantilla de variables de entorno
├── .env                              # Variables de entorno (gitignored)
├── .gitignore
├── docker-compose.yml                # Orquestación de todos los servicios
├── INIT-PLAN.md                      # Plan de implementación original
├── AUTH_IMPLEMENTATION.md
├── README.md                         # Documentación en inglés
├── README.es.md                      # Este archivo (español)
│
├── infrastructure/
│   ├── mysql/
│   │   ├── conf/my.cnf               # Configuración de binlog (ROW, GTID)
│   │   └── init/
│   │       ├── 01-init.sql           # Tablas + datos semilla (accounts, customers, products, orders)
│   │       └── 02-users.sql          # Tabla users + cuentas admin semilla
│   ├── cache-db/
│   │   └── init/
│   │       ├── 01-init.sql           # Esquema del caché (sync, drivers, routes, visits, positions)
│   │       └── 02-cached-users.sql   # Tabla cached_users (poblada vía CDC en runtime)
│   ├── timescale/
│   │   └── init/01-init.sql          # Hypertables, compresión, retención, agregados continuos
│   └── traccar/
│       └── traccar.xml               # Configuración de Traccar (webhook, puertos)
│
├── scripts/
│   └── register-cdc-connector.sh     # Registra el conector Debezium en Kafka Connect
│
├── tracking-service/                 # Backend NestJS
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── src/
│       ├── main.ts                   # Bootstrap de la aplicación
│       ├── app.module.ts             # Módulo raíz con todas las importaciones
│       ├── adapters/
│       │   └── redis-io.adapter.ts   # Adaptador Socket.io Redis para soporte multi-instancia
│       ├── config/
│       │   ├── configuration.ts      # Configuración centralizada (Kafka, DBs, Redis)
│       │   └── database.config.ts    # Conexiones TypeORM + factories para TimescaleDB y MySQL
│       ├── types/
│       │   └── pg.d.ts               # Declaración de tipos para el módulo 'pg'
│       └── modules/
│           ├── auth/                 # Autenticación JWT, guards, refresh tokens
│           ├── kafka/                # Productor y consumidor Kafka (global)
│           ├── traccar/              # Controller webhook + servicio de ingestión
│           ├── enrichment/           # Enriquecimiento de posiciones GPS
│           ├── sync/                 # Consumidor CDC + monitoreo de lag
│           ├── customers/            # Caché de clientes de 3 niveles
│           ├── drivers/              # CRUD de conductores + entidad de posición
│           ├── routes/               # Gestión de rutas de entrega
│           ├── visits/               # Ciclo de vida de visitas planificadas
│           ├── websocket/            # Gateway Socket.io con broadcasting por rooms
│           ├── redis/                # Servicio Redis (global, con operaciones geo)
│           ├── timescale/            # Escritura/lectura de series de tiempo
│           └── health/               # Endpoints de salud (Kafka, Redis, TimescaleDB, WebSocket)
│
└── fleetview-live-main/              # Frontend React (Vite + Bun)
    ├── package.json
    ├── .env.example
    └── src/
        ├── components/
        │   ├── dashboard/            # Mapa, sidebar, tarjetas de conductores
        │   ├── history/              # Reproducción de rutas
        │   ├── monitoring/           # Monitoreo de lag CDC (admin)
        │   ├── layout/               # AppLayout, ProtectedRoute
        │   └── ui/                   # Componentes shadcn/ui
        ├── hooks/                    # Hooks React Query, useSocket
        ├── pages/                    # Index, Login, History, Monitoring, NotFound
        ├── stores/                   # Stores Zustand (auth, map, playback)
        └── types/                    # Interfaces TypeScript
```

---

## 📌 Requisitos Previos

- **Docker** y **Docker Compose** (v2+)
- **Node.js** v18+ y **npm** v9+
- ~6 GB de RAM disponible para los contenedores Docker
- Puertos disponibles: `3000`, `3306`, `5432`, `5433`, `6379`, `8082`, `8083`, `8084`, `9094`

---

## 🚀 Instalación y Configuración

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd streaming-tracking-logistic
```

### 2. Configurar variables de entorno

El archivo `.env` ya incluye valores por defecto para desarrollo local:

```dotenv
# MySQL (Fuente de Verdad)
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_DATABASE=core_business
MYSQL_ROOT_PASSWORD=root_secret

# PostgreSQL Caché
CACHE_DB_HOST=cache-db
CACHE_DB_PORT=5432
CACHE_DB_NAME=tracking_cache
CACHE_DB_USER=tracking
CACHE_DB_PASSWORD=tracking_secret

# TimescaleDB
TIMESCALE_HOST=timescale
TIMESCALE_PORT=5433
TIMESCALE_DB=tracking_history
TIMESCALE_USER=timescale
TIMESCALE_PASSWORD=timescale_secret

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=redis_secret

# Kafka
KAFKA_BROKER=kafka:9092
KAFKA_EXTERNAL_PORT=9094
```

### 3. Levantar la infraestructura con Docker

```bash
# Levantar todos los servicios de infraestructura
docker compose up -d

# Verificar que todos los contenedores estén saludables
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Los servicios que se levantan:

| Contenedor | Puerto(s) | Descripción |
|---|---|---|
| `traccar` | 8082, 5001 | Servidor GPS Traccar |
| `traccar-db` | (interno) | PostgreSQL de Traccar |
| `kafka` | 9094 (host) | Broker Apache Kafka (KRaft) |
| `kafka-init` | — | Crea los 8 tópicos de Kafka (se ejecuta y termina) |
| `kafka-connect` | 8083 | Debezium Connect para CDC |
| `kafka-ui` | 8084 | UI de monitoreo de Kafka |
| `mysql` | 3306 | Base de datos fuente de verdad |
| `cache-db` | 5432 | PostgreSQL caché local |
| `timescale` | 5433 | TimescaleDB para historial |
| `redis` | 6379 | Caché y pub/sub |

### 4. Registrar el conector CDC de Debezium

```bash
# Esperar a que Kafka Connect esté listo, luego registrar el conector
bash scripts/register-cdc-connector.sh
```

Esto configura Debezium para capturar cambios de las tablas `accounts`, `customers`, `products` y `orders` de MySQL y publicarlos en los tópicos `cdc.*` de Kafka.

### 5. Instalar dependencias del servicio NestJS

```bash
cd tracking-service
npm install
```

### 6. Instalar y ejecutar el frontend

```bash
cd fleetview-live-main

# Copiar plantilla de entorno
cp .env.example .env

# Instalar dependencias (usando Bun o npm)
bun install
# o: npm install

# Iniciar servidor de desarrollo
bun dev
# o: npm run dev
```

El frontend estará disponible en `http://localhost:5173`.

---

## ▶️ Ejecución

### Desarrollo local (recomendado)

```bash
# Asegurarse de que la infraestructura Docker está levantada
docker compose up -d

# Detener el contenedor tracking-service de Docker (si existe)
docker compose stop tracking-service

# Ejecutar NestJS en modo desarrollo con hot-reload
cd tracking-service
npm run start:dev
```

El servicio estará disponible en `http://localhost:3000`.

### Verificar salud del sistema

```bash
curl http://localhost:3000/api/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "timestamp": "2026-02-07T06:20:00.000Z",
  "services": {
    "kafka": "up",
    "redis": "up",
    "timescale": "up"
  }
}
```

### Interfaces web útiles

| Herramienta | URL | Descripción |
|---|---|---|
| Frontend | http://localhost:5173 | Dashboard React (login: admin@tenant1.com / admin123) |
| Kafka UI | http://localhost:8084 | Monitoreo de tópicos, consumidores y conectores |
| Traccar | http://localhost:8082 | Interfaz de administración de Traccar |

---

## 🔄 Flujos de Datos

### Flujo de Posiciones GPS

```
Dispositivo GPS → Traccar → Webhook HTTP → NestJS (TraccarController)
    → Kafka [gps.positions]
    → EnrichmentService (consume + enriquece con datos de negocio)
    → Fan-out paralelo:
        ├── Redis (posición más reciente por conductor, TTL 5 min)
        ├── PostgreSQL caché (snapshot driver_positions, upsert)
        ├── TimescaleDB (historial enriched_positions)
        └── Kafka [gps.positions.enriched]
```

### Flujo de Sincronización CDC (MySQL → Caché Local)

```
MySQL (INSERT/UPDATE/DELETE) → Binlog
    → Debezium captura cambios
    → Kafka [cdc.accounts, cdc.customers, cdc.products, cdc.orders]
    → NestJS CdcConsumerService
        ├── Upsert/Delete en PostgreSQL caché
        ├── Invalidar caché Redis
        └── Actualizar sync_state
```

### Caché de 3 Niveles (Lecturas de Clientes)

```
Petición → Nivel 1: Memoria en proceso (Map, TTL 60s)
    │ miss
    ▼
Nivel 2: Redis (TTL 5 min)
    │ miss
    ▼
Nivel 3: PostgreSQL caché local (siempre actualizado vía CDC)
    │ miss (raro)
    ▼
Fallback: MySQL directo
```

### Ciclo de Vida de Visitas

```
1. Crear visita planificada (POST /api/visits)
2. Conductor se acerca al geofence del cliente → Auto-detección de llegada
3. Visita: pending → arrived → in_progress → completed
4. Eventos publicados en Kafka [visits.events]
5. Historial guardado en TimescaleDB (visit_completions)
```

---

## 📦 Módulos del Servicio NestJS

### `kafka/` — Productor y Consumidor Kafka
- **KafkaProducerService**: Produce mensajes individuales y en lote a cualquier tópico.
- **KafkaConsumerService**: Registra handlers por tópico con opción `fromBeginning`. Gestiona un único consumidor con múltiples suscripciones.

### `traccar/` — Ingestión de Datos GPS
- **TraccarController**: Recibe posiciones y eventos via webhook HTTP desde Traccar.
- **TraccarIngestionService**: Publica posiciones crudas en `gps.positions` y eventos en `gps.events`.

### `enrichment/` — Enriquecimiento de Posiciones
- **EnrichmentService**: Consume `gps.positions`, cruza con datos de conductor/ruta/visita/cliente, calcula distancia y ETA al próximo destino, detecta entrada a geofence, marca llegadas automáticas.
- **geo-utils.ts**: Funciones utilitarias (distancia Haversine, ETA, detección de geofence).

### `sync/` — Sincronización CDC
- **CdcConsumerService**: Consume tópicos `cdc.*`, mapea campos de Debezium, ejecuta upsert/delete en caché local, actualiza `sync_state`.
- **SyncController**: Endpoints para consultar estado de sincronización y datos cacheados.

### `auth/` — Autenticación JWT
- **AuthController**: Login con email/password, refresh token, registro (admin), logout, perfil del usuario.
- **JwtAuthGuard**: Guard global que verifica tokens JWT en cada request (excepto rutas públicas).
- **RolesGuard**: Guard que verifica roles (admin, dispatcher, driver) basado en decoradores `@Roles()`.
- **AuthService**: Verificación de contraseñas con bcrypt, generación de tokens JWT, gestión de refresh tokens.

### `customers/` — Caché de Clientes
- **CustomerCacheService**: Implementa caché de 3 niveles (Memoria → Redis → PG → fallback MySQL). Soporta búsqueda por ID, por tenant, y consultas geográficas.

### `drivers/` — Gestión de Conductores
- **DriversService/Controller**: CRUD de conductores con campos `device_id`, `vehicle_plate`, `vehicle_type`, `status`.
- **DriverPosition**: Entidad snapshot de la última posición conocida por conductor.

### `routes/` — Rutas de Entrega
- **RoutesService/Controller**: Crear, listar, actualizar rutas. Buscar rutas activas y del día por conductor. Contador de paradas completadas.

### `visits/` — Visitas Planificadas
- **VisitsService/Controller**: Crear visitas, gestionar ciclo de vida (`pending` → `arrived` → `in_progress` → `completed` → `departed`), llegada/salida automática, publicación de eventos.

### `redis/` — Servicio Redis (Global)
- **RedisService**: Wrapper sobre ioredis con operaciones: get/set, hashes, geo (GEOADD, GEODIST, GEORADIUS), pub/sub, health check.

### `timescale/` — Series de Tiempo
- **TimescaleService**: Pool de conexiones pg directo (no TypeORM). Inserta posiciones enriquecidas, completaciones de visitas. Consulta historial por conductor, ruta, y estadísticas diarias.

### `websocket/` — Gateway WebSocket en Tiempo Real
- **TrackingGateway**: Gateway Socket.io con broadcasting por rooms (`tenant:{id}`, `driver:{id}`, `route:{id}`). Emite `position:update`, `visit:update`, y `cdc:lag`. Autenticación JWT en cada conexión.
- **WsBroadcastService**: Puente Kafka→WebSocket. Consume `gps.positions.enriched` y `visits.events` y transmite a los clientes conectados.
- **RedisIoAdapter**: Adaptador Socket.io usando Redis pub/sub para escalamiento horizontal.

### `health/` — Endpoints de Salud
- **HealthController**: `GET /api/health` verifica conectividad con Kafka, Redis y TimescaleDB. `GET /api/health/ready` para readiness probe.

---

## 📡 API REST

### Salud

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado general del servicio |
| GET | `/api/health/ready` | Readiness check |

### Autenticación

La API utiliza autenticación basada en JWT con control de acceso por roles.

#### Endpoints de Auth

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | Público | Autenticar y obtener tokens |
| POST | `/api/auth/refresh` | Público | Refrescar access token |
| POST | `/api/auth/register` | Admin | Crear nuevo usuario |
| POST | `/api/auth/logout` | Autenticado | Invalidar refresh token |
| GET | `/api/auth/profile` | Autenticado | Obtener info del usuario actual |

#### Flujo de Login

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tenant1.com",
    "password": "admin123",
    "tenantId": "tenant-1"
  }'

# Respuesta:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "uuid-v4-token",
  "expiresIn": "15m",
  "user": {
    "id": "admin-tenant-1",
    "email": "admin@tenant1.com",
    "name": "Admin User",
    "role": "admin",
    "tenantId": "tenant-1"
  }
}

# 2. Usar access token en requests autenticados
curl -X GET http://localhost:3000/api/drivers \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# 3. Refrescar token cuando sea necesario
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{ "refreshToken": "uuid-v4-token" }'
```

#### Roles y Permisos

| Rol | Descripción | Permisos |
|---|---|---|
| `admin` | Administrador del sistema | Todas las operaciones, gestión de usuarios, acceso a sync |
| `dispatcher` | Planificador de rutas | Ver/editar rutas, visitas, conductores (propio tenant) |
| `driver` | Conductor de entregas | Ver propias rutas y visitas, actualizar estado de visita |

#### Usuarios por Defecto

| Email | Password | Tenant | Rol |
|---|---|---|---|
| `admin@tenant1.com` | `admin123` | tenant-1 | admin |
| `admin@tenant2.com` | `admin123` | tenant-2 | admin |

### Traccar (Webhook)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/traccar/positions` | Recibe posiciones de Traccar |
| POST | `/api/traccar/events` | Recibe eventos de Traccar |

### Conductores

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/drivers` | Listar todos los conductores |
| GET | `/api/drivers/:id` | Obtener conductor por ID |
| POST | `/api/drivers` | Crear conductor |
| PATCH | `/api/drivers/:id` | Actualizar conductor |
| GET | `/api/drivers/:id/history?from=&to=` | Historial de posiciones del conductor (TimescaleDB) |

### Rutas

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/routes` | Crear ruta |
| GET | `/api/routes` | Listar rutas |
| GET | `/api/routes/:id` | Obtener ruta con visitas |
| PATCH | `/api/routes/:id` | Actualizar ruta (ej: cambiar status) |
| GET | `/api/routes/driver/:driverId/active` | Ruta activa del conductor |
| GET | `/api/routes/driver/:driverId/today` | Rutas del día del conductor |
| GET | `/api/routes/:id/history?from=&to=` | Historial de posiciones de la ruta (TimescaleDB) |

### Visitas

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/visits` | Crear visita planificada |
| GET | `/api/visits/:id` | Obtener visita por ID |
| GET | `/api/visits/route/:routeId` | Visitas de una ruta |
| GET | `/api/visits/driver/:driverId` | Visitas de un conductor |
| PATCH | `/api/visits/:id/status` | Actualizar estado de visita |

### Sincronización CDC

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/sync/status` | Estado de sincronización por tabla |
| GET | `/api/sync/accounts` | Cuentas cacheadas |
| GET | `/api/sync/accounts/:id` | Cuenta por ID |
| GET | `/api/sync/customers` | Clientes cacheados |
| GET | `/api/sync/customers/:id` | Cliente por ID |
| GET | `/api/sync/products` | Productos cacheados |
| GET | `/api/sync/products/:id` | Producto por ID |
| GET | `/api/sync/orders` | Pedidos cacheados |
| GET | `/api/sync/orders/:id` | Pedido por ID |
| GET | `/api/sync/lag` | Métricas de lag CDC (solo admin) |

---

## 🌐 API WebSocket

### Conexión

Conectarse al servidor WebSocket en el namespace `/tracking` con autenticación JWT:

```javascript
// Después de login exitoso, usar el access token
const socket = io('http://localhost:3000/tracking', {
  auth: {
    token: accessToken  // Token JWT de /api/auth/login
  }
});

// Manejar errores de autenticación
socket.on('error', (error) => {
  console.error('Error de auth WebSocket:', error.message);
  // Refrescar token y reconectar
});

// Conexión autenticada y auto-join a room de tenant
socket.on('connect', () => {
  console.log('Conectado al servidor de tracking');
});
```

**Nota**: El gateway WebSocket verifica tokens JWT en la conexión. Los usuarios se unen automáticamente a su room de tenant basado en su token. Los conductores solo pueden unirse a sus propias rooms; admin/dispatcher pueden unirse a cualquiera.

### Eventos Cliente → Servidor

| Evento | Payload | Descripción |
|---|---|---|
| `join-tenant` | `{ tenantId: string }` | Unirse al room para recibir actualizaciones de un tenant |
| `join-driver` | `{ driverId: string }` | Unirse al room para recibir actualizaciones de un conductor específico |
| `join-route` | `{ routeId: string }` | Unirse al room para recibir actualizaciones de una ruta específica |
| `leave-tenant` | `{ tenantId: string }` | Salir del room de tenant |
| `leave-driver` | `{ driverId: string }` | Salir del room de conductor |
| `leave-route` | `{ routeId: string }` | Salir del room de ruta |
| `get-active-drivers` | — | Solicitar lista de conductores rastreados actualmente |

### Eventos Servidor → Cliente

| Evento | Payload | Descripción |
|---|---|---|
| `position:update` | `EnrichedPosition` | Posición GPS en tiempo real con datos enriquecidos |
| `visit:update` | `VisitEvent` | Evento del ciclo de vida de visita (llegada, completado, etc.) |
| `cdc:lag` | `CdcLagSnapshot` | Métricas de lag CDC transmitidas cada 5s (solo admin) |
| `error` | `{ message: string }` | Notificación de error |

### Convenciones de Rooms

- **Rooms de tenant**: `tenant:{tenantId}` — Recibir todas las actualizaciones de conductores en un tenant
- **Rooms de conductor**: `driver:{driverId}` — Recibir actualizaciones de un conductor específico
- **Rooms de ruta**: `route:{routeId}` — Recibir actualizaciones de todos los conductores en una ruta

Los clientes pueden unirse a múltiples rooms simultáneamente para personalizar su flujo de datos.

### Ejemplo de Cliente

```javascript
const { io } = require('socket.io-client');

const socket = io('http://localhost:3000/tracking');

socket.on('connect', () => {
  console.log('Conectado al servidor de tracking');
  
  // Unirse al room de tenant para ver todos los conductores
  socket.emit('join-tenant', { tenantId: 'tenant-1' });
  
  // O unirse a room de conductor específico
  socket.emit('join-driver', { driverId: 'a1b2c3d4-0001-4000-8000-000000000001' });
});

socket.on('position:update', (position) => {
  console.log('Posición del conductor:', position);
  // Actualizar marcador en mapa, calcular ETA, etc.
});

socket.on('visit:update', (event) => {
  console.log('Evento de visita:', event);
  // Actualizar estado de visita en UI
});

socket.on('disconnect', () => {
  console.log('Desconectado del servidor de tracking');
});
```

---

## 📈 Monitoreo de Lag CDC

Monitoreo en tiempo real del retraso entre cambios en MySQL fuente y su llegada al caché PostgreSQL.

### Endpoint REST

`GET /api/sync/lag` — Retorna `CdcLagSnapshot` con métricas de lag por tabla, lag de offset Kafka, y totales. Solo admin.

### Evento WebSocket

`cdc:lag` — Transmitido cada 5 segundos al room `role:admin`. Mismo payload que el endpoint REST.

### Integración con Health

`GET /api/health` incluye una sección `cdc` con estado de lag:

| Lag | Estado |
|---|---|
| < 2 segundos | `healthy` (verde) |
| 2–5 segundos | `warning` (amarillo) |
| 5–10 segundos | `degraded` (naranja) |
| > 10 segundos | `critical` (rojo) |

### Frontend

Los usuarios admin pueden acceder a la página de monitoreo en `/monitoring` desde la cabecera del dashboard. Muestra:

- **Tarjetas de lag por tabla** — Lag actual, eventos procesados, conteo de errores, gráfico sparkline
- **Tabla de lag de offset Kafka** — Mensajes pendientes por topic/partición
- **Barra de resumen** — Total eventos, errores, lag máx/promedio, uptime

---

## 📨 Tópicos de Kafka

| Tópico | Particiones | Productor | Consumidor | Propósito |
|---|---|---|---|---|
| `gps.positions` | 6 | TraccarIngestionService | EnrichmentService | Posiciones GPS crudas |
| `gps.positions.enriched` | 6 | EnrichmentService | WsBroadcastService | Posiciones enriquecidas |
| `gps.events` | 3 | TraccarIngestionService | (por implementar) | Eventos de Traccar |
| `visits.events` | 3 | VisitsService | WsBroadcastService | Ciclo de vida de visitas |
| `cdc.accounts` | 3 | Debezium | CdcConsumerService | Cambios en cuentas |
| `cdc.customers` | 3 | Debezium | CdcConsumerService | Cambios en clientes |
| `cdc.products` | 3 | Debezium | CdcConsumerService | Cambios en productos |
| `cdc.orders` | 3 | Debezium | CdcConsumerService | Cambios en pedidos |
| `cdc.users` | 3 | Debezium | CdcConsumerService | Cambios en usuarios |

---

## 🗄 Esquemas de Base de Datos

### MySQL — Fuente de Verdad (`core_business`)

- `accounts` — Cuentas/empresas (id, tenant_id, name, account_type, settings)
- `customers` — Clientes con ubicación geográfica (lat, lng, geofence_radius)
- `products` — Catálogo de productos
- `orders` — Pedidos

### PostgreSQL Caché (`tracking_cache`)

**Tablas sincronizadas vía CDC (solo lectura):**
- `accounts_cache`, `customers_cache`, `products_cache`

**Tablas propias del servicio de rastreo:**
- `drivers` — Conductores (device_id vincula con Traccar)
- `routes` — Rutas de entrega planificadas
- `planned_visits` — Paradas dentro de una ruta
- `driver_positions` — Snapshot de la última posición por conductor
- `sync_state` — Estado de sincronización CDC

### TimescaleDB (`tracking_history`)

**Hypertables:**
- `enriched_positions` — Historial de posiciones enriquecidas (particionado por día, compresión después de 7 días, retención 365 días)
- `visit_completions` — Registro de visitas completadas para analíticas

**Agregados Continuos:**
- `driver_daily_stats` — Estadísticas diarias por conductor (velocidad promedio/max, porcentaje en movimiento, conteo de visitas)

---

## 🧩 Patrones de Diseño

| Patrón | Implementación |
|---|---|
| **Ingestión via Webhook** | Traccar envía posiciones por HTTP al servicio |
| **Enriquecimiento Event-Driven** | Consumir crudo → enriquecer → producir enriquecido (Kafka) |
| **CDC (Change Data Capture)** | Debezium captura cambios MySQL → Kafka → caché local |
| **Caché de 3 Niveles** | Memoria (60s) → Redis (5min) → PG local → MySQL (fallback) |
| **Fan-out Paralelo** | Cada posición enriquecida se escribe simultáneamente en Redis, PG, TimescaleDB y Kafka |
| **Detección de Geofence** | Cálculo Haversine para detectar entrada/salida de perímetro del cliente |
| **Llegada Automática** | Si el conductor entra al geofence de la próxima visita, se marca `arrived` automáticamente |
| **Upsert con Conflicto** | driver_positions usa `ON CONFLICT DO UPDATE` para snapshot siempre actualizado |
| **Multi-tenancy** | `tenant_id` presente en todas las entidades, consultas filtradas por tenant |

---

## 🧪 Pruebas Manuales

### Verificar sincronización CDC

```bash
# Ver estado de sincronización
curl -s http://localhost:3000/api/sync/status | python3 -m json.tool

# Ver clientes sincronizados
curl -s http://localhost:3000/api/sync/customers | python3 -m json.tool

# Modificar un dato en MySQL y verificar que se propaga
docker exec -it mysql mysql -uroot -proot_secret core_business \
  -e "UPDATE accounts SET name = 'Nuevo Nombre' WHERE id = 1;"

# Verificar actualización en caché (debería reflejar el cambio en ~2s)
curl -s http://localhost:3000/api/sync/accounts | python3 -m json.tool
```

### Simular posición GPS

```bash
# Enviar posición cerca del cliente "Downtown Warehouse" (40.7128, -74.006)
curl -s -X POST http://localhost:3000/api/traccar/positions \
  -H "Content-Type: application/json" \
  -d '[{
    "id": 1,
    "deviceId": 1001,
    "protocol": "osmand",
    "serverTime": "2026-02-07T12:00:00.000Z",
    "deviceTime": "2026-02-07T12:00:00.000Z",
    "fixTime": "2026-02-07T12:00:00.000Z",
    "valid": true,
    "latitude": 40.7130,
    "longitude": -74.0055,
    "altitude": 10,
    "speed": 5,
    "course": 90,
    "accuracy": 10,
    "attributes": { "uniqueId": "DEV001" }
  }]'
```

### Crear ruta y visita completa

```bash
# 1. Crear ruta para el conductor John Smith
curl -s -X POST http://localhost:3000/api/routes \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-1",
    "driverId": "a1b2c3d4-0001-4000-8000-000000000001",
    "scheduledDate": "2026-02-07"
  }' | python3 -m json.tool

# 2. Activar la ruta (reemplazar ROUTE_ID)
curl -s -X PATCH http://localhost:3000/api/routes/ROUTE_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'

# 3. Crear visita planificada al cliente Downtown Warehouse
curl -s -X POST http://localhost:3000/api/visits \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-1",
    "routeId": "ROUTE_ID",
    "driverId": "a1b2c3d4-0001-4000-8000-000000000001",
    "customerId": 1,
    "sequenceNumber": 1,
    "visitType": "delivery",
    "scheduledDate": "2026-02-07",
    "timeWindowStart": "08:00",
    "timeWindowEnd": "12:00"
  }' | python3 -m json.tool

# 4. Enviar posición GPS dentro del geofence → auto-arrival
# (ver "Simular posición GPS" arriba)
```

### Verificar datos en TimescaleDB

```bash
docker exec timescale psql -U timescale -d tracking_history \
  -c "SELECT time, driver_id, latitude, longitude, speed, customer_name, distance_to_next_m
      FROM enriched_positions ORDER BY time DESC LIMIT 5;"
```

### Verificar datos en Redis

```bash
# Última posición del conductor
docker exec redis redis-cli -a redis_secret \
  GET "pos:driver:a1b2c3d4-0001-4000-8000-000000000001"

# Posiciones geográficas de conductores
docker exec redis redis-cli -a redis_secret \
  GEOPOS "geo:drivers" "a1b2c3d4-0001-4000-8000-000000000001"
```

---

## 📊 Estado del Proyecto

### ✅ Fase 1 — Fundación (Completada)
- [x] Docker Compose con todos los servicios de infraestructura
- [x] Traccar configurado con PostgreSQL y webhook
- [x] Apache Kafka en modo KRaft (sin Zookeeper)
- [x] Proyecto NestJS con estructura modular
- [x] Controller de webhook Traccar + productor Kafka

### ✅ Fase 2 — CDC y Sincronización de Datos (Completada)
- [x] MySQL configurado con binlog (ROW, GTID)
- [x] Kafka Connect con conector Debezium MySQL
- [x] Consumidor CDC en NestJS (sync cuentas, clientes, productos)
- [x] Esquema de caché en PostgreSQL local
- [x] Servicio de caché de 3 niveles (Memoria → Redis → PG)

### ✅ Fase 3 — Enriquecimiento y Tiempo Real (Completada)
- [x] Servicio de enriquecimiento (consumir posiciones, cruzar con datos cacheados)
- [x] Gestión de conductores, rutas y visitas (BD local)
- [x] Detección de proximidad por geofence y auto-arrival
- [x] Esquema TimescaleDB con hypertables, compresión y agregados continuos
- [x] Escritor TimescaleDB (almacenar posiciones enriquecidas)
- [x] Fan-out paralelo a Redis, PG, TimescaleDB y Kafka

### ✅ Fase 4 — WebSocket y Dashboard (Completada)
- [x] Gateway WebSocket Socket.io con adaptador Redis
- [x] Broadcasting basado en rooms (por tenant y por conductor)
- [x] Frontend React con mapa (Mapbox/Leaflet)
- [x] Reproducción de historial de rutas con slider temporal y controles de velocidad
- [x] Panel de lista de conductores con estado en tiempo real
- [x] Leyenda y controles del mapa (z-index corregido sobre tiles de Leaflet)
- [x] Corrección de layout del mapa de historial (cadena flex para altura correcta del contenedor Leaflet)

### ⬜ Fase 5 — Monitoreo y Robustez (Pendiente)
- [x] Autenticación JWT con control de acceso basado en roles
- [x] Gestión de usuarios vía sincronización CDC
- [x] Autenticación WebSocket
- [x] Monitoreo de lag CDC
- [ ] Manejo de errores y dead letter queues
- [ ] Pruebas de carga con 1,000 conductores simulados

---

## 📝 Conductores de Prueba

El sistema viene con 3 conductores pre-cargados:

| Nombre | Device ID | Tenant | Vehículo | Placa |
|---|---|---|---|---|
| John Smith | DEV001 | tenant-1 | Van | ABC-1234 |
| Jane Doe | DEV002 | tenant-1 | Truck | DEF-5678 |
| Bob Wilson | DEV003 | tenant-2 | Van | GHI-9012 |

## 📝 Clientes de Prueba

| Nombre | Tenant | Ubicación | Geofence | Tipo |
|---|---|---|---|---|
| Downtown Warehouse | tenant-1 | 40.7128, -74.006 | 150m | warehouse |
| Midtown Office | tenant-1 | 40.7549, -73.984 | 100m | office |
| Brooklyn Store | tenant-1 | 40.686, -73.977 | 100m | retail |
| Queens Distribution | tenant-2 | 40.7282, -73.7949 | 200m | warehouse |
| Bronx Retail | tenant-2 | 40.837, -73.8654 | 100m | retail |

---

## 📄 Licencia

Proyecto de uso educativo / demostración.

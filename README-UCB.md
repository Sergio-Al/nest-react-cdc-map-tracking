# Sistema de Rastreo Vehicular para el control de visitas en tiempo real

Sistema de rastreo vehicular en tiempo real diseñado para monitorear al menos **1,000 condductores** realizando visitas, con un dashboard que soporta hasta **500 usuarios concurrentes** visualizando posiciones en vivo con respecto a las visitas, historial de rutas con reproducciones de recorrido, planificacion de rutas y monitoreo de sincronización de datos.

## Objetivo general

El proyecto actual busca crear un control a detalle del recorrido de las ruta establecida y ejecucion de visitas de un usuario transportista. Para un enfoque mas preciso del proyecto se abarca solo el control del recorrido y la visita con el cliente.

## Objetivos especificos

- Implementar un API Rest con procesos de salud, autenticacion basica, roles y permisos basicos, gestion del webhook de traccar para capturar los datos de pocisiones y eventos. Obtener informacion de conductores, rutas, clientes, visitas y una sincronizacion CDC.

- Implementar una capa de conexion basado en WebSocket por el cual los clientes se podran conectar mediante su autenticacion JWT respectiva. Se tendra eventos de recibir actualizacion de rutas con conductores especificos en tiempo real.

- Implementar un monitoreo de CDC para visualizar los cambios desde la fuente en MySQL y su llegada al caché PostgreSQL.

- Implementar la pantalla principal de frontend donde se puede visualizar la ruta, el usuario y la visualizacion de posicion en tiempo real.

## Alcance

- Levantar Servidor GPS basado en Traccar version 6.11 el cual se encarga de la gestion de dispositivos y la decodificación de protocolo. Ademas, tambien este servidor contiene su respectiva base de datos en PostgreSQL DB.
- Levantar un Broker de mensajes basado en Apache Kafka para el streaming de eventos y desacoplamiento de procesos.
- CDC Debezium para la captura de cambios del la base de datos central MySQL u otra base de datos con kafka.
- Levantar una base de datos de la fuente de la verdad, en caso que el cliente tenga una base de datos ya en uso, para el proyecto se debe de tener una base de datos con datos de prueba.
- Crear un servicio backend basado en NestJS que será el servicio principal para capturar y gestionar los datos del rastreo de los usuarios transportistas.
- Levantar una base de datos Caché local basado en PostgreSQL para tener los datos sincronizados de la base de datos central (en este caso MySQL), con la informacion de cuentas, visitas y rutas.
- Levantar una base de datos historica basado en Timescale para guardar las posiciones historicas junto con los datos de la ruta establecida.

**No se incluye por ahora**
- Notificaciones por websocket
- Roles a detalle en el frontend, campos o componentes gestionados pro RBAC u otros.
- Interaccion a nivel escritura con la base de datos principal, esto contemplaria implementar una arquitectura CQRS.

## Stack Tecnológico


| Componente | Tecnología | Versión | Propósito |
|---|---|---|---|
| Servidor GPS | Traccar | 6.11 | Decodificación de protocolos, gestión de dispositivos |
| BD Traccar | PostgreSQL | 16 | Almacenamiento interno de Traccar |
| Broker de Mensajes | Apache Kafka | 3.9.0 (modo KRaft) | Streaming de eventos, desacoplamiento |
| CDC | Debezium | 2.7.3.Final | Captura de cambios MySQL → Kafka |
| BD Fuente de Verdad | MySQL | 8.0 | Datos de negocio (Clientes, Cuentas, Pedidos, Productos) |
| Servicio Backend | NestJS | 10+ | Servicio principal de rastreo |
| BD Caché Local | PostgreSQL | 16 | Datos sincronizados de MySQL, visitas, rutas |
| BD Histórica | TimescaleDB | latest-pg16 | Series de tiempo, historial de posiciones, analíticas |
| Caché / Pub-Sub | Redis | 7-alpine | Posiciones recientes, caché de 3 niveles |
| Motor de Ruteo | OSRM | latest | Matriz de distancias/duraciones viales (La Paz, Bolivia) |
| Optimizador de Rutas | OR-Tools (Python) | 9.x | Solver VRP via sidecar FastAPI |
| WebSocket | Socket.io | 4+ | Push en tiempo real al dashboard |
| Lenguaje | TypeScript | 5+ | Backend |
| Contenedores | Docker + Docker Compose | Latest | Entorno de desarrollo |


## Arquitectura

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


## Endpoints core 

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
| POST | `/api/routes/:id/optimize` | Optimizar orden de visitas usando OSRM + OR-Tools |
| PATCH | `/api/routes/:id/reorder` | Reordenar visitas manualmente (drag-and-drop) |

### Clientes

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/customers` | Listar todos los clientes (filtrado por tenant) |

### Visitas

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/visits` | Crear visita planificada |
| GET | `/api/visits/:id` | Obtener visita por ID |
| GET | `/api/visits/route/:routeId` | Visitas de una ruta |
| GET | `/api/visits/driver/:driverId` | Visitas de un conductor |
| PATCH | `/api/visits/:id/status` | Actualizar estado de visita |
| DELETE | `/api/visits/:id` | Eliminar una visita pendiente |


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


## Instalación y Configuración

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
| `kafka-ui` | 8080 | UI de monitoreo de Kafka |
| `mysql` | 3306 | Base de datos fuente de verdad |
| `cache-db` | 5432 | PostgreSQL caché local |
| `timescale` | 5433 | TimescaleDB para historial |
| `redis` | 6379 | Caché y pub/sub |
| `osrm` | 5003 | Motor de ruteo OSRM (red vial de La Paz) |
| `or-tools-solver` | 5002 | Solver VRP OR-Tools (Python FastAPI) |

### 4. Configurar OSRM (Optimización de Rutas)

```bash
# Descargar datos OSM de Bolivia, recortar región La Paz y construir grafo OSRM
chmod +x infrastructure/osrm/setup.sh
./infrastructure/osrm/setup.sh
```

Esto descarga el extracto OSM de Bolivia desde Geofabrik, lo recorta al bounding box de La Paz (`-69.65,-17.05,-67.0,-13.5`), y ejecuta OSRM extract/partition/customize. Los archivos del grafo resultante se guardan en `infrastructure/osrm/data/`.

### 5. Aplicar migración de optimización de rutas y datos semilla

```bash
# Agregar columnas de optimización a tablas routes y planned_visits
docker exec -i cache-db psql -U tracking -d tracking_cache \
  < infrastructure/cache-db/init/03-route-optimizer.sql

# Semillar 23 clientes de La Paz con coordenadas reales
docker exec -i cache-db psql -U tracking -d tracking_cache \
  < infrastructure/cache-db/init/04-seed-customers-lapaz.sql
```

### 6. Registrar el conector CDC de Debezium

```bash
# Esperar a que Kafka Connect esté listo, luego registrar el conector
bash scripts/register-cdc-connector.sh
```

Esto configura Debezium para capturar cambios de las tablas `accounts`, `customers`, `products` y `orders` de MySQL y publicarlos en los tópicos `cdc.*` de Kafka.

### 7. Instalar dependencias del servicio NestJS

```bash
cd tracking-service
npm install
```

### 8. Instalar y ejecutar el frontend

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

El frontend estará disponible en `http://localhost:3001`.

---

## Ejecución

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
| Kafka UI | http://localhost:8080 | Monitoreo de tópicos, consumidores y conectores |
| Traccar | http://localhost:8082 | Interfaz de administración de Traccar |

---

## Equipo y roles


| Nombre | Rol |
|---|---|
| Sergio Machaca | Backend | 
| Sergio Machaca | Frontend | 
| Sergio Machaca | QA |
| Sergio Machaca | DevOps | 


# JWT Authentication Implementation Summary

## Overview
Successfully implemented a complete JWT authentication system with role-based access control (RBAC) for the NestJS tracking service. Users are stored in MySQL, synced to the cache DB via CDC, and validated using JWT tokens stored in Redis.

## What Was Implemented

### 1. Dependencies Added
- `@nestjs/passport` - Passport integration
- `@nestjs/jwt` - JWT utilities
- `passport` - Core Passport library
- `passport-jwt` - JWT strategy
- `bcrypt` - Password hashing
- `@types/bcrypt` & `@types/passport-jwt` (dev)

### 2. Database Schema

#### MySQL (`core_business.users`)
```sql
CREATE TABLE users (
  id          VARCHAR(36) PRIMARY KEY,
  tenant_id   VARCHAR(36) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  password    VARCHAR(255) NOT NULL,  -- bcrypt hash
  name        VARCHAR(255) NOT NULL,
  role        ENUM('admin', 'dispatcher', 'driver') NOT NULL DEFAULT 'dispatcher',
  driver_id   VARCHAR(36) NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_tenant (email, tenant_id)
);
```

Seeded with default admin users:
- `admin@tenant1.com` / `admin123` (tenant-1)
- `admin@tenant2.com` / `admin123` (tenant-2)

#### Cache DB (`tracking_cache.cached_users`)
Synced from MySQL via CDC for fast JWT validation.

### 3. Kafka CDC Integration
- Added `users` table to Debezium connector
- Created `cdc.users` topic (3 partitions)
- Implemented CDC handler in `CdcConsumerService`

### 4. Configuration
Added auth config section in `configuration.ts`:
```typescript
auth: {
  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: '15m',
  refreshExpiresIn: '7d',
  refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000,
  traccarApiKey: process.env.TRACCAR_API_KEY || 'traccar-shared-key',
}
```

### 5. Auth Module Structure
```
tracking-service/src/modules/auth/
├── auth.module.ts
├── auth.service.ts
├── auth.controller.ts
├── dto/
│   ├── auth.dto.ts (RegisterDto, LoginDto, RefreshDto)
│   └── index.ts
├── decorators/
│   ├── public.decorator.ts (@Public)
│   ├── roles.decorator.ts (@Roles)
│   ├── current-user.decorator.ts (@CurrentUser)
│   └── index.ts
├── guards/
│   ├── jwt-auth.guard.ts (global JWT guard)
│   ├── roles.guard.ts (role-based guard)
│   ├── api-key.guard.ts (for Traccar endpoints)
│   └── index.ts
└── strategies/
    └── jwt.strategy.ts
```

### 6. Authentication Flow

#### Token System
- **Access tokens**: 15-minute JWT, payload: `{ sub, tenantId, role, driverId }`
- **Refresh tokens**: 7-day UUID stored in Redis with key pattern `refresh:{token}`
- Password hashing: bcrypt with 10 salt rounds

#### Endpoints
| Endpoint | Auth | Description |
|---|---|---|
| `POST /api/auth/login` | Public | Get token pair |
| `POST /api/auth/refresh` | Public | Rotate tokens |
| `POST /api/auth/register` | Admin | Create user |
| `POST /api/auth/logout` | Authenticated | Delete refresh token |
| `GET /api/auth/profile` | Authenticated | Current user info |

### 7. Role-Based Access Control

#### Roles
- **admin**: Full system access, user management, sync endpoints
- **dispatcher**: View/manage routes, visits, drivers (own tenant)
- **driver**: View own routes/visits, update own visit status

#### Protected Controllers
- **DriversController**: `@Roles('admin', 'dispatcher')` for listing
- **RoutesController**: `@Roles('admin', 'dispatcher')` for create/update
- **VisitsController**: `@Roles('admin', 'dispatcher')` for create; drivers can only update own visits
- **SyncController**: `@Roles('admin')` for all endpoints
- **TraccarController**: `@Public()` + `ApiKeyGuard` (X-API-Key header)
- **HealthController**: `@Public()` for all endpoints

### 8. Tenant Isolation
All controllers enforce tenant isolation server-side:
- JWT payload carries `tenantId`
- Queries filtered by `user.tenantId` instead of trusting client input
- Drivers can only access their own resources

### 9. WebSocket Authentication
```typescript
// Client connects with JWT
const socket = io('http://localhost:3000/tracking', {
  auth: { token: accessToken }
});

// Server validates on connection
async handleConnection(client: Socket) {
  const token = client.handshake.auth?.token;
  const payload = this.jwtService.verify(token);
  const user = await this.authService.validateUser(payload);
  
  // Auto-join tenant room
  client.join(`tenant:${user.tenantId}`);
  
  // Store user in socket.data for room validation
  client.data.user = { userId, tenantId, role, driverId };
}
```

Room join validations:
- Users can only join their own tenant rooms
- Drivers can only join their own driver rooms
- Admin/dispatcher can join any room within tenant

### 10. Global Guards
Registered via `APP_GUARD`:
1. **JwtAuthGuard** - Validates JWT on all endpoints (skips `@Public()`)
2. **RolesGuard** - Enforces `@Roles()` metadata

All endpoints are protected by default; opt-out with `@Public()`.

### 11. Environment Variables (docker-compose.yml)
```yaml
JWT_SECRET: ${JWT_SECRET:-change-me-in-production-please}
JWT_EXPIRES_IN: ${JWT_EXPIRES_IN:-15m}
REFRESH_EXPIRES_IN: ${REFRESH_EXPIRES_IN:-7d}
TRACCAR_API_KEY: ${TRACCAR_API_KEY:-traccar-shared-key}
```

### 12. Documentation Updates
- Added comprehensive "Authentication" section in README.md
- Updated Kafka topics table (added `cdc.users`)
- Updated database schema docs
- Updated Phase 5 checklist
- Added WebSocket auth flow documentation
- Updated architecture diagram

## Testing

### Manual Test Flow
```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tenant1.com",
    "password": "admin123",
    "tenantId": "tenant-1"
  }'

# 2. Use access token
curl http://localhost:3000/api/drivers \
  -H "Authorization: Bearer {ACCESS_TOKEN}"

# 3. Test role restrictions (should fail for driver role)
curl -X POST http://localhost:3000/api/routes \
  -H "Authorization: Bearer {DRIVER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

## Security Features
✅ Passwords hashed with bcrypt (10 rounds)  
✅ Short-lived access tokens (15 min)  
✅ Refresh token rotation on refresh  
✅ Tenant isolation enforced server-side  
✅ Role-based permissions  
✅ WebSocket auth with JWT  
✅ API key protection for machine-to-machine (Traccar)  
✅ Refresh tokens in Redis with TTL  
✅ Global guards (secure by default)  

## Next Steps
- [ ] Implement password reset flow
- [ ] Add rate limiting
- [ ] Add audit logging for auth events
- [ ] Integration tests for auth flows
- [ ] Add API key rotation for Traccar

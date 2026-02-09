-- Cached users table for fast JWT validation
CREATE TABLE IF NOT EXISTS cached_users (
  id          VARCHAR(36) PRIMARY KEY,
  tenant_id   VARCHAR(36) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  password    VARCHAR(255) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  role        VARCHAR(50) NOT NULL,
  driver_id   VARCHAR(36),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cached_users_tenant ON cached_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cached_users_email_tenant ON cached_users(email, tenant_id);
CREATE INDEX IF NOT EXISTS idx_cached_users_driver ON cached_users(driver_id);

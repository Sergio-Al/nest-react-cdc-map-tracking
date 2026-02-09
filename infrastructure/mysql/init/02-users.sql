-- Users table for authentication
CREATE TABLE IF NOT EXISTS users (
  id          VARCHAR(36) PRIMARY KEY,
  tenant_id   VARCHAR(36) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  password    VARCHAR(255) NOT NULL,  -- bcrypt hash
  name        VARCHAR(255) NOT NULL,
  role        ENUM('admin', 'dispatcher', 'driver') NOT NULL DEFAULT 'dispatcher',
  driver_id   VARCHAR(36) NULL,       -- FK to drivers table, only for role='driver'
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_tenant (email, tenant_id),
  INDEX idx_tenant (tenant_id),
  INDEX idx_driver (driver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default admin users for each tenant
-- Password: 'admin123' hashed with bcrypt (10 rounds)

INSERT INTO users (id, tenant_id, email, password, name, role, is_active) VALUES
  ('admin-tenant-1', 'tenant-1', 'admin@tenant1.com', '$2b$10$ompRBApLHZ57rpiZrZ.1XuMTNm4bSOjv6AueYEWvLaFEryV.6.sXi', 'Admin User', 'admin', TRUE),
  ('admin-tenant-2', 'tenant-2', 'admin@tenant2.com', '$2b$10$ompRBApLHZ57rpiZrZ.1XuMTNm4bSOjv6AueYEWvLaFEryV.6.sXi', 'Admin User', 'admin', TRUE)
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;

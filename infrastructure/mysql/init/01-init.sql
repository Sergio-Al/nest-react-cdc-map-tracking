-- ─── Core Business Database (MySQL – replaces SQL Server) ──────
-- This is the "source of truth" database.
-- In production this would be the existing SQL Server; for local dev we use MySQL.

USE core_business;

-- Accounts / Tenants
CREATE TABLE IF NOT EXISTS accounts (
    id          BIGINT       AUTO_INCREMENT PRIMARY KEY,
    tenant_id   VARCHAR(50)  NOT NULL,
    name        VARCHAR(200) NOT NULL,
    account_type VARCHAR(50) NOT NULL DEFAULT 'standard',
    settings    JSON,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_accounts_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Customers
CREATE TABLE IF NOT EXISTS customers (
    id                      BIGINT       AUTO_INCREMENT PRIMARY KEY,
    tenant_id               VARCHAR(50)  NOT NULL,
    name                    VARCHAR(200) NOT NULL,
    phone                   VARCHAR(50),
    email                   VARCHAR(200),
    address                 VARCHAR(500),
    latitude                DECIMAL(10,7),
    longitude               DECIMAL(10,7),
    geofence_radius_meters  INT          NOT NULL DEFAULT 100,
    customer_type           VARCHAR(50)  NOT NULL DEFAULT 'regular',
    active                  BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_customers_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Products
CREATE TABLE IF NOT EXISTS products (
    id          BIGINT        AUTO_INCREMENT PRIMARY KEY,
    tenant_id   VARCHAR(50)   NOT NULL,
    name        VARCHAR(200)  NOT NULL,
    sku         VARCHAR(100)  NOT NULL,
    category    VARCHAR(100),
    unit_price  DECIMAL(12,2) NOT NULL DEFAULT 0,
    active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_products_tenant (tenant_id),
    UNIQUE KEY uq_products_sku (tenant_id, sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id              BIGINT        AUTO_INCREMENT PRIMARY KEY,
    tenant_id       VARCHAR(50)   NOT NULL,
    customer_id     BIGINT        NOT NULL,
    order_number    VARCHAR(50)   NOT NULL,
    status          VARCHAR(30)   NOT NULL DEFAULT 'pending',
    total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
    delivery_date   DATE,
    notes           TEXT,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_orders_tenant (tenant_id),
    INDEX idx_orders_customer (customer_id),
    UNIQUE KEY uq_orders_number (tenant_id, order_number),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─── Seed data for development ─────────────────────────────
INSERT INTO accounts (tenant_id, name, account_type) VALUES
('tenant-1', 'Acme Logistics', 'premium'),
('tenant-2', 'FastTrack Delivery', 'standard');

INSERT INTO customers (tenant_id, name, phone, address, latitude, longitude, geofence_radius_meters, customer_type) VALUES
('tenant-1', 'Downtown Warehouse',    '+1-555-0101', '123 Main St',    40.7128000, -74.0060000, 150, 'warehouse'),
('tenant-1', 'Midtown Office',        '+1-555-0102', '456 Park Ave',   40.7549000, -73.9840000, 100, 'office'),
('tenant-1', 'Brooklyn Store',        '+1-555-0103', '789 Atlantic',   40.6860000, -73.9770000, 100, 'retail'),
('tenant-2', 'Queens Distribution',   '+1-555-0201', '321 Queens Blvd',40.7282000, -73.7949000, 200, 'warehouse'),
('tenant-2', 'Bronx Retail',          '+1-555-0202', '654 Grand Ave',  40.8370000, -73.8654000, 100, 'retail');

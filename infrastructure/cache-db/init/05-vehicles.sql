-- ─── Vehicles table ──────────────────────────────────────────
-- Dedicated vehicle management, decoupled from drivers.
-- A vehicle can optionally be assigned to a driver via driver_id.

CREATE TABLE IF NOT EXISTS vehicles (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       VARCHAR(50)     NOT NULL,
    plate           VARCHAR(30)     NOT NULL,
    type            VARCHAR(50)     NOT NULL DEFAULT 'van',       -- van | truck | motorcycle
    brand           VARCHAR(100),
    model           VARCHAR(100),
    year            INT,
    color           VARCHAR(50),
    capacity_kg     NUMERIC(8, 2),
    status          VARCHAR(20)     NOT NULL DEFAULT 'active',    -- active | maintenance | inactive
    driver_id       UUID            REFERENCES drivers(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_plate_tenant ON vehicles(tenant_id, plate);
CREATE INDEX IF NOT EXISTS idx_vehicles_tenant  ON vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_driver  ON vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status  ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_type    ON vehicles(type);

-- ─── Seed: demo vehicles ────────────────────────────────────
INSERT INTO vehicles (tenant_id, plate, type, brand, model, year, color, capacity_kg, status, driver_id) VALUES
('tenant-1', 'ABC-1234', 'van',   'Mercedes-Benz', 'Sprinter',   2022, 'White',  1500.00, 'active', 'a1b2c3d4-0001-4000-8000-000000000001'),
('tenant-1', 'DEF-5678', 'truck', 'Volvo',         'FH16',       2021, 'Blue',   5000.00, 'active', 'a1b2c3d4-0001-4000-8000-000000000002'),
('tenant-2', 'GHI-9012', 'van',   'Ford',          'Transit',    2023, 'Silver', 1200.00, 'active', 'a1b2c3d4-0002-4000-8000-000000000003')
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════
-- La Paz, Bolivia customers — owned by MySQL (the tenant's system of record)
--
-- The demo tenants are Business-tier and run in `integrated` mode, where
-- MySQL core_business is the source of truth for business data and PostgreSQL
-- customers_cache is only a read model filled by Debezium CDC. So these rows
-- live HERE and reach PostgreSQL through the CDC snapshot — never seed
-- customers_cache directly for an integrated tenant (it bypasses CDC, and MySQL
-- orders couldn't reference those customers: orders.customer_id has an FK).
--
-- Explicit ids 1001–1023 keep the historical ids (scripts/seed-visit-completions.sql
-- references them) and stay clear of the auto-increment demo rows 1–5;
-- new customers continue from 1024. (Target design: standalone tenants own
-- customers directly in PostgreSQL. Today customer create/update still always
-- goes through commands.customers → MySQL → CDC — a dual-mode write path like
-- orders' is a pending follow-up.)
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO customers (id, tenant_id, name, phone, email, address, zone, latitude, longitude, geofence_radius_meters, customer_type, active) VALUES
(1001, 'tenant-1', 'Farmacia Bolivia',             '+591-2-2311234', 'farmacia@correo.bo',       'Av. Camacho 1234, Centro',               'Centro',         -16.4955, -68.1336, 80,  'regular', TRUE),
(1002, 'tenant-1', 'Supermercado Ketal Sur',        '+591-2-2791000', 'ketal.sur@correo.bo',      'Calle 21 de Calacoto 8220',              'Calacoto',       -16.5340, -68.0780, 100, 'premium', TRUE),
(1003, 'tenant-1', 'Restaurante Gustu',             '+591-2-2117491', 'info@gustu.bo',            'Calle 10 #300, Calacoto',                'Calacoto',       -16.5365, -68.0810, 60,  'premium', TRUE),
(1004, 'tenant-1', 'Hospital de Clinicas',          '+591-2-2245090', 'admin@clinicas.gob.bo',    'Av. Saavedra, Miraflores',               'Miraflores',     -16.5050, -68.1210, 150, 'regular', TRUE),
(1005, 'tenant-1', 'Universidad Mayor San Andres',  '+591-2-2440480', 'info@umsa.bo',             'Av. Villazon 1995, Monoblock',           'Centro',         -16.5025, -68.1310, 120, 'regular', TRUE),
(1006, 'tenant-1', 'Mercado Rodriguez',             '+591-2-2281567',  NULL,                      'Calle Illampu esq. Max Paredes',         'Max Paredes',    -16.4960, -68.1425, 80,  'regular', TRUE),
(1007, 'tenant-1', 'Tienda YPFB San Miguel',        '+591-2-2770800', 'ventas@ypfb.gob.bo',      'Av. Ballivian, San Miguel',              'San Miguel',     -16.5280, -68.0860, 100, 'regular', TRUE),
(1008, 'tenant-1', 'Oficinas BCP Prado',            '+591-2-2317070', 'bcp@bcp.com.bo',           'Av. 16 de Julio (El Prado) 1616',       'Centro',         -16.5000, -68.1320, 80,  'premium', TRUE),
(1009, 'tenant-1', 'Colegio Franco Boliviano',      '+591-2-2793300', 'secretaria@franco.edu.bo', 'Calle 10 de Obrajes',                   'Obrajes',        -16.5250, -68.1040, 100, 'regular', TRUE),
(1010, 'tenant-1', 'Megacenter Mall',               '+591-2-2115000', 'info@megacenter.bo',       'Av. Rafael Pabon, Irpavi',              'Irpavi',         -16.5180, -68.0720, 150, 'premium', TRUE),
(1011, 'tenant-1', 'Clinica del Sur',               '+591-2-2784001', 'recepcion@clinicadelsur.bo','Av. Hernando Siles 5000, Obrajes',      'Obrajes',        -16.5220, -68.0950, 120, 'premium', TRUE),
(1012, 'tenant-1', 'Ferreteria El Constructor',     '+591-2-2281999',  NULL,                      'Av. Buenos Aires 890, Cementerio',      'Cementerio',     -16.4980, -68.1510, 80,  'regular', TRUE),
(1013, 'tenant-1', 'Panaderia Francesca',           '+591-2-2710456', 'francesca@correo.bo',      'Calle Rosendo Gutierrez 570, Sopocachi','Sopocachi',      -16.5080, -68.1250, 50,  'regular', TRUE),
(1014, 'tenant-1', 'Distribuidora de Gas LP',       '+591-2-2823456', 'gaslp@correo.bo',          'Av. Periferica, Villa Fatima',           'Villa Fatima',  -16.4870, -68.1170, 100, 'regular', TRUE),
(1015, 'tenant-1', 'Libreria Gisbert',              '+591-2-2204568', 'ventas@gisbert.bo',        'Calle Comercio 1270, Centro',           'Centro',         -16.4975, -68.1365, 60,  'regular', TRUE),
(1016, 'tenant-1', 'Multicine Megacenter',          '+591-2-2115050', 'multicine@megacenter.bo',  'Multicine, Irpavi',                     'Irpavi',         -16.5189, -68.0730, 100, 'regular', TRUE),
(1017, 'tenant-1', 'Taller Automotriz Velasco',     '+591-2-2245678',  NULL,                      'Zona Villa Victoria, Av. Apumalla',     'Villa Victoria', -16.4920, -68.1480, 80,  'regular', TRUE),
(1018, 'tenant-1', 'Consultorio Dental Sonrisa',    '+591-2-2796543', 'sonrisa@dental.bo',        'Calle 8, Achumani',                     'Achumani',       -16.5350, -68.0690, 60,  'regular', TRUE),
(1019, 'tenant-1', 'Deposito Industrial Achachicala','+591-2-2310999', NULL,                      'Av. Chacaltaya, Achachicala',            'Achachicala',   -16.4780, -68.1320, 200, 'regular', TRUE),
(1020, 'tenant-1', 'Hotel Radisson Plaza',           '+591-2-2441111', 'reservas@radisson.bo',    'Av. Arce 2177, Sopocachi',              'Sopocachi',      -16.5060, -68.1280, 100, 'premium', TRUE),
(1021, 'tenant-2', 'Tienda San Pedro',              '+591-2-2489012',  NULL,                      'Plaza San Pedro, Zona San Pedro',       'San Pedro',      -16.4990, -68.1400, 80,  'regular', TRUE),
(1022, 'tenant-2', 'Mercado Lanza',                 '+591-2-2206789',  NULL,                      'Calle Figueroa, Centro',                'Centro',         -16.4945, -68.1370, 100, 'regular', TRUE),
(1023, 'tenant-2', 'Banco Mercantil Miraflores',    '+591-2-2441500', 'miraflores@bmsc.com.bo',   'Av. Busch, Miraflores',                 'Miraflores',     -16.5070, -68.1150, 80,  'premium', TRUE);

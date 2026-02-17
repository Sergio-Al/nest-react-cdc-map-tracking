-- Seed La Paz, Bolivia customers
DELETE FROM customers_cache;

INSERT INTO customers_cache (id, tenant_id, name, phone, email, address, latitude, longitude, geofence_radius_meters, customer_type, active) VALUES
(1,  'tenant-1', 'Farmacia Bolivia',             '+591-2-2311234', 'farmacia@correo.bo',       'Av. Camacho 1234, Centro',               -16.4955, -68.1336, 80,  'regular', true),
(2,  'tenant-1', 'Supermercado Ketal Sur',        '+591-2-2791000', 'ketal.sur@correo.bo',      'Calle 21 de Calacoto 8220',              -16.5340, -68.0780, 100, 'premium', true),
(3,  'tenant-1', 'Restaurante Gustu',             '+591-2-2117491', 'info@gustu.bo',            'Calle 10 #300, Calacoto',                -16.5365, -68.0810, 60,  'premium', true),
(4,  'tenant-1', 'Hospital de Clinicas',          '+591-2-2245090', 'admin@clinicas.gob.bo',    'Av. Saavedra, Miraflores',               -16.5050, -68.1210, 150, 'regular', true),
(5,  'tenant-1', 'Universidad Mayor San Andres',  '+591-2-2440480', 'info@umsa.bo',             'Av. Villazon 1995, Monoblock',           -16.5025, -68.1310, 120, 'regular', true),
(6,  'tenant-1', 'Mercado Rodriguez',             '+591-2-2281567',  NULL,                      'Calle Illampu esq. Max Paredes',         -16.4960, -68.1425, 80,  'regular', true),
(7,  'tenant-1', 'Tienda YPFB San Miguel',        '+591-2-2770800', 'ventas@ypfb.gob.bo',      'Av. Ballivian, San Miguel',              -16.5280, -68.0860, 100, 'regular', true),
(8,  'tenant-1', 'Oficinas BCP Prado',            '+591-2-2317070', 'bcp@bcp.com.bo',           'Av. 16 de Julio (El Prado) 1616',       -16.5000, -68.1320, 80,  'premium', true),
(9,  'tenant-1', 'Colegio Franco Boliviano',      '+591-2-2793300', 'secretaria@franco.edu.bo', 'Calle 10 de Obrajes',                   -16.5250, -68.1040, 100, 'regular', true),
(10, 'tenant-1', 'Megacenter Mall',               '+591-2-2115000', 'info@megacenter.bo',       'Av. Rafael Pabon, Irpavi',              -16.5180, -68.0720, 150, 'premium', true),
(11, 'tenant-1', 'Clinica del Sur',               '+591-2-2784001', 'recepcion@clinicadelsur.bo','Av. Hernando Siles 5000, Obrajes',      -16.5220, -68.0950, 120, 'premium', true),
(12, 'tenant-1', 'Ferreteria El Constructor',     '+591-2-2281999',  NULL,                      'Av. Buenos Aires 890, Cementerio',      -16.4980, -68.1510, 80,  'regular', true),
(13, 'tenant-1', 'Panaderia Francesca',           '+591-2-2710456', 'francesca@correo.bo',      'Calle Rosendo Gutierrez 570, Sopocachi',-16.5080, -68.1250, 50,  'regular', true),
(14, 'tenant-1', 'Distribuidora de Gas LP',       '+591-2-2823456', 'gaslp@correo.bo',          'Av. Periferica, Villa Fatima',           -16.4870, -68.1170, 100, 'regular', true),
(15, 'tenant-1', 'Libreria Gisbert',              '+591-2-2204568', 'ventas@gisbert.bo',        'Calle Comercio 1270, Centro',           -16.4975, -68.1365, 60,  'regular', true),
(16, 'tenant-1', 'Multicine Megacenter',          '+591-2-2115050', 'multicine@megacenter.bo',  'Multicine, Irpavi',                     -16.5189, -68.0730, 100, 'regular', true),
(17, 'tenant-1', 'Taller Automotriz Velasco',     '+591-2-2245678',  NULL,                      'Zona Villa Victoria, Av. Apumalla',     -16.4920, -68.1480, 80,  'regular', true),
(18, 'tenant-1', 'Consultorio Dental Sonrisa',    '+591-2-2796543', 'sonrisa@dental.bo',        'Calle 8, Achumani',                     -16.5350, -68.0690, 60,  'regular', true),
(19, 'tenant-1', 'Deposito Industrial Achachicala','+591-2-2310999', NULL,                      'Av. Chacaltaya, Achachicala',            -16.4780, -68.1320, 200, 'regular', true),
(20, 'tenant-1', 'Hotel Radisson Plaza',           '+591-2-2441111', 'reservas@radisson.bo',    'Av. Arce 2177, Sopocachi',              -16.5060, -68.1280, 100, 'premium', true),
(21, 'tenant-2', 'Tienda San Pedro',              '+591-2-2489012',  NULL,                      'Plaza San Pedro, Zona San Pedro',       -16.4990, -68.1400, 80,  'regular', true),
(22, 'tenant-2', 'Mercado Lanza',                 '+591-2-2206789',  NULL,                      'Calle Figueroa, Centro',                -16.4945, -68.1370, 100, 'regular', true),
(23, 'tenant-2', 'Banco Mercantil Miraflores',    '+591-2-2441500', 'miraflores@bmsc.com.bo',   'Av. Busch, Miraflores',                 -16.5070, -68.1150, 80,  'premium', true);

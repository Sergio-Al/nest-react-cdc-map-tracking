-- Customers are dual-purpose: integrated tenants use a CDC read model with
-- explicit MySQL ids; standalone tenants own rows written directly in PostgreSQL.
-- Reserve ids >= 1e9 for PG inserts so they cannot collide with low MySQL ids.
CREATE SEQUENCE IF NOT EXISTS customers_cache_id_seq START WITH 1000000000;
ALTER TABLE customers_cache ALTER COLUMN id SET DEFAULT nextval('customers_cache_id_seq');
ALTER SEQUENCE customers_cache_id_seq OWNED BY customers_cache.id;

CREATE TABLE IF NOT EXISTS region_customer_product (
    region_code TEXT NOT NULL CHECK (region_code GLOB '[0-9][0-9]'),
    product_id TEXT NOT NULL REFERENCES municipality_product(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    created_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    PRIMARY KEY (region_code, product_id)
);

CREATE TABLE IF NOT EXISTS region_customer_change (
    id INTEGER PRIMARY KEY,
    region_code TEXT NOT NULL CHECK (region_code GLOB '[0-9][0-9]'),
    actor_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    product_ids_json TEXT NOT NULL CHECK (json_valid(product_ids_json)),
    changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS region_customer_change_code_idx
    ON region_customer_change (region_code, changed_at DESC);

CREATE TABLE IF NOT EXISTS customer_import (
    id TEXT PRIMARY KEY,
    imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

WITH imported(code) AS (
    VALUES ('2580'), ('1452'), ('0186'), ('0117'), ('2085'), ('0123'),
           ('1060'), ('0381'), ('0840'), ('2560'), ('1984'), ('1884'),
           ('0182'), ('0330'), ('0127'), ('1382'), ('1415'), ('1780'),
           ('0885'), ('1785'), ('1764'), ('1766'), ('1782'), ('1781'),
           ('2083'), ('0880'), ('1761'), ('1783'), ('1763'), ('1737'),
           ('0331'), ('0382'), ('2505'), ('1784'), ('1730'), ('0862'),
           ('0126'), ('0305'), ('2514'), ('1715'), ('1960'), ('1494'),
           ('0861'), ('2521'), ('2581'), ('1495'), ('0360'), ('1765'),
           ('0319'), ('2513'), ('0834'), ('1471'), ('0181'), ('1499'),
           ('0138'), ('1485'), ('1276'), ('1907'), ('0191'), ('2262'),
           ('0486'), ('2084'), ('0821'), ('2506')
)
INSERT OR IGNORE INTO municipality_customer_product (municipality_code, product_id)
SELECT code, 'visselblasarkanal' FROM imported
WHERE NOT EXISTS (SELECT 1 FROM customer_import WHERE id = 'kommunkunder-2026-11');

WITH imported(code) AS (VALUES ('25'), ('23'), ('08'), ('17'))
INSERT OR IGNORE INTO region_customer_product (region_code, product_id)
SELECT code, 'visselblasarkanal' FROM imported
WHERE NOT EXISTS (SELECT 1 FROM customer_import WHERE id = 'kommunkunder-2026-11');

INSERT OR IGNORE INTO customer_import (id) VALUES ('kommunkunder-2026-11');

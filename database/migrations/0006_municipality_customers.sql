CREATE TABLE IF NOT EXISTS municipality_product (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL CHECK (
        color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
    ),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

INSERT OR IGNORE INTO municipality_product (id, name, color, sort_order)
VALUES
    ('visselblasarkanal', 'Visselblåsarkanal', '#17483d', 1),
    ('redact', 'Redact', '#2563eb', 2);

CREATE TABLE IF NOT EXISTS municipality_customer_product (
    municipality_code TEXT NOT NULL CHECK (
        municipality_code GLOB '[0-9][0-9][0-9][0-9]'
    ),
    product_id TEXT NOT NULL REFERENCES municipality_product(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    created_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    PRIMARY KEY (municipality_code, product_id)
);

CREATE INDEX IF NOT EXISTS municipality_customer_product_product_idx
    ON municipality_customer_product (product_id, municipality_code);

CREATE TABLE IF NOT EXISTS municipality_customer_change (
    id INTEGER PRIMARY KEY,
    municipality_code TEXT NOT NULL CHECK (
        municipality_code GLOB '[0-9][0-9][0-9][0-9]'
    ),
    actor_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    product_ids_json TEXT NOT NULL CHECK (json_valid(product_ids_json)),
    changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS municipality_customer_change_code_idx
    ON municipality_customer_change (municipality_code, changed_at DESC);

INSERT OR IGNORE INTO municipality_customer_product (municipality_code, product_id)
VALUES
    ('0117', 'visselblasarkanal'),
    ('0181', 'visselblasarkanal'),
    ('0881', 'visselblasarkanal'),
    ('1485', 'visselblasarkanal'),
    ('2580', 'visselblasarkanal'),
    ('0123', 'visselblasarkanal'),
    ('0138', 'visselblasarkanal'),
    ('2505', 'visselblasarkanal'),
    ('0381', 'visselblasarkanal'),
    ('2523', 'visselblasarkanal'),
    ('2085', 'visselblasarkanal'),
    ('2521', 'visselblasarkanal'),
    ('1261', 'visselblasarkanal'),
    ('1784', 'visselblasarkanal'),
    ('0880', 'visselblasarkanal'),
    ('0127', 'visselblasarkanal'),
    ('1382', 'visselblasarkanal'),
    ('0643', 'visselblasarkanal'),
    ('0330', 'visselblasarkanal'),
    ('0840', 'visselblasarkanal'),
    ('1766', 'visselblasarkanal'),
    ('0360', 'visselblasarkanal'),
    ('0319', 'visselblasarkanal'),
    ('0382', 'visselblasarkanal'),
    ('1270', 'visselblasarkanal'),
    ('0191', 'visselblasarkanal'),
    ('0126', 'visselblasarkanal'),
    ('2581', 'visselblasarkanal'),
    ('0885', 'visselblasarkanal'),
    ('1730', 'visselblasarkanal'),
    ('1763', 'visselblasarkanal'),
    ('1764', 'visselblasarkanal'),
    ('1783', 'visselblasarkanal'),
    ('1761', 'visselblasarkanal'),
    ('0331', 'visselblasarkanal'),
    ('2083', 'visselblasarkanal'),
    ('1471', 'visselblasarkanal'),
    ('1494', 'visselblasarkanal'),
    ('1495', 'visselblasarkanal'),
    ('2514', 'visselblasarkanal'),
    ('1715', 'visselblasarkanal'),
    ('1781', 'visselblasarkanal'),
    ('1415', 'visselblasarkanal'),
    ('1785', 'visselblasarkanal'),
    ('1737', 'visselblasarkanal'),
    ('1765', 'visselblasarkanal'),
    ('2513', 'visselblasarkanal'),
    ('0821', 'visselblasarkanal'),
    ('1983', 'visselblasarkanal'),
    ('0160', 'visselblasarkanal'),
    ('2084', 'visselblasarkanal'),
    ('2080', 'visselblasarkanal'),
    ('1452', 'visselblasarkanal'),
    ('0180', 'visselblasarkanal'),
    ('1281', 'visselblasarkanal'),
    ('0882', 'visselblasarkanal'),
    ('1962', 'redact');

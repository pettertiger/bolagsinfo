CREATE TABLE IF NOT EXISTS sellfinity_municipality_status (
    municipality_code TEXT PRIMARY KEY CHECK (municipality_code GLOB '[0-9][0-9][0-9][0-9]'),
    status TEXT NOT NULL CHECK (status IN ('customer', 'not_customer', 'unmatched', 'uncertain'))
);

CREATE TABLE IF NOT EXISTS sellfinity_sync (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_success_at TEXT,
    last_attempt_at TEXT NOT NULL,
    last_error TEXT
);

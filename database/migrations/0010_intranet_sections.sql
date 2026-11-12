CREATE TABLE intranet_section (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL
);

-- Seed default sections
INSERT INTO intranet_section (id, name, description, is_active, sort_order)
VALUES
    ('anstalld', 'Anställd', 'Information för anställda: rutiner, frånvaro, helgdagar etc.', 1, 1),
    ('kunder', 'Kunder & Kontrakt', 'Kundöversikt, avtalsöversikt, nya affärer och säljstatus.', 0, 2),
    ('media', 'Media & Digitalt', 'Mediaöversikt, webbtrafik-dashboard och publikationer.', 0, 3),
    ('resurser', 'Resurser & Utveckling', 'Verktyg, dokumentation och utvecklingsöversikt.', 0, 4),
    ('om-lantero', 'Om Lantero', 'Om företaget, värderingar, organisation och kontaktinfo.', 0, 5);

-- Lagrar förfallodatum från Sellfinity för avtalsövervakning
-- Field_id måste konfigureras baserat på Sellfinity-setup
CREATE TABLE contract_due_date (
    id INTEGER PRIMARY KEY,
    organization_number TEXT NOT NULL UNIQUE REFERENCES company(organization_number) ON DELETE CASCADE,
    due_date TEXT CHECK (due_date IS NULL OR (date(due_date) IS NOT NULL AND date(due_date) = due_date)),
    due_date_field_id INTEGER NOT NULL CHECK (due_date_field_id > 0),
    synced_from_sellfinity INTEGER NOT NULL DEFAULT 0 CHECK (synced_from_sellfinity IN (0, 1)),
    last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX contract_due_date_org_number_idx
    ON contract_due_date (organization_number);

CREATE INDEX contract_due_date_due_date_idx
    ON contract_due_date (due_date)
    WHERE due_date IS NOT NULL;

-- Tabell för att spåra uppdateringar till Sellfinity
CREATE TABLE contract_sync_log (
    id INTEGER PRIMARY KEY,
    organization_number TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('read', 'write', 'sync_error')),
    due_date TEXT CHECK (due_date IS NULL OR (date(due_date) IS NOT NULL AND date(due_date) = due_date)),
    error_message TEXT,
    attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at TEXT
);

CREATE INDEX contract_sync_log_org_number_idx
    ON contract_sync_log (organization_number, attempted_at DESC);

CREATE TABLE IF NOT EXISTS scb_import_progress (
    import_batch_id INTEGER PRIMARY KEY REFERENCES scb_import_batch(id) ON DELETE CASCADE,
    employee_class INTEGER NOT NULL DEFAULT 0 CHECK (employee_class BETWEEN 0 AND 16),
    cursor_id INTEGER,
    page_count INTEGER NOT NULL DEFAULT 0 CHECK (page_count >= 0),
    stored_count INTEGER NOT NULL DEFAULT 0 CHECK (stored_count >= 0),
    skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
    lease_until TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS scb_import_staging_month_unique_idx
    ON scb_import_batch (reference_month)
    WHERE status = 'staging';
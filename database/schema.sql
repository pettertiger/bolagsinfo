CREATE TABLE app_user (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    access_code_salt TEXT,
    access_code_hash TEXT,
    access_code_iterations INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_seen_at TEXT,
    CHECK (
        (access_code_salt IS NULL AND access_code_hash IS NULL AND access_code_iterations IS NULL)
        OR
        (access_code_salt IS NOT NULL AND access_code_hash IS NOT NULL AND access_code_iterations > 0)
    )
);

CREATE TABLE auth_session (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    expires_at TEXT NOT NULL,
    revoked_at TEXT
);

CREATE INDEX auth_session_user_expiry_idx ON auth_session (user_id, expires_at);

CREATE TABLE auth_login_attempt (
    identifier TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
    locked_until TEXT,
    last_attempt_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE contract (
    id INTEGER PRIMARY KEY,
    company_name TEXT NOT NULL CHECK (length(trim(company_name)) > 0),
    due_date TEXT NOT NULL CHECK (date(due_date) IS NOT NULL AND date(due_date) = due_date),
    note TEXT,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    created_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    deleted_at TEXT,
    deleted_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL
);

CREATE INDEX contract_active_due_date_idx
    ON contract (due_date, company_name)
    WHERE deleted_at IS NULL;

CREATE TABLE scb_import_batch (
    id INTEGER PRIMARY KEY,
    reference_month TEXT NOT NULL CHECK (
        reference_month GLOB '????-??-01' AND date(reference_month) = reference_month
    ),
    status TEXT NOT NULL CHECK (status IN ('staging', 'ready', 'failed')),
    source_version TEXT,
    fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at TEXT,
    record_count INTEGER CHECK (record_count IS NULL OR record_count >= 0),
    error_message TEXT,
    created_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL
);

CREATE INDEX scb_import_month_status_idx
    ON scb_import_batch (reference_month, status, fetched_at DESC);

CREATE TABLE scb_import_progress (
    import_batch_id INTEGER PRIMARY KEY REFERENCES scb_import_batch(id) ON DELETE CASCADE,
    employee_class INTEGER NOT NULL DEFAULT 0 CHECK (employee_class BETWEEN 0 AND 16),
    cursor_id INTEGER,
    page_count INTEGER NOT NULL DEFAULT 0 CHECK (page_count >= 0),
    stored_count INTEGER NOT NULL DEFAULT 0 CHECK (stored_count >= 0),
    skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
    lease_until TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX scb_import_staging_month_unique_idx
    ON scb_import_batch (reference_month)
    WHERE status = 'staging';

CREATE TABLE company (
    id INTEGER PRIMARY KEY,
    organization_number TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE company_month_snapshot (
    id INTEGER PRIMARY KEY,
    import_batch_id INTEGER NOT NULL REFERENCES scb_import_batch(id) ON DELETE RESTRICT,
    company_id INTEGER NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
    company_name TEXT NOT NULL,
    employee_category TEXT NOT NULL CHECK (
        employee_category IN ('under_50', '20_49', '50_99', '100_199', '200_plus', 'unknown')
    ),
    employee_count INTEGER CHECK (employee_count IS NULL OR employee_count >= 0),
    source_record_id TEXT,
    UNIQUE (import_batch_id, company_id),
    UNIQUE (id, company_id)
);

CREATE INDEX company_snapshot_category_idx
    ON company_month_snapshot (import_batch_id, employee_category);

CREATE TABLE monthly_summary (
    id INTEGER PRIMARY KEY,
    month_start TEXT NOT NULL CHECK (
        month_start GLOB '????-??-01' AND date(month_start) = month_start
    ),
    revision INTEGER NOT NULL CHECK (revision > 0),
    current_import_id INTEGER NOT NULL REFERENCES scb_import_batch(id) ON DELETE RESTRICT,
    previous_import_id INTEGER REFERENCES scb_import_batch(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'failed')),
    generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    published_at TEXT,
    created_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    UNIQUE (month_start, revision)
);

CREATE INDEX monthly_summary_archive_idx
    ON monthly_summary (month_start DESC, revision DESC)
    WHERE status = 'published';

CREATE TABLE monthly_summary_entry (
    id INTEGER PRIMARY KEY,
    summary_id INTEGER NOT NULL REFERENCES monthly_summary(id) ON DELETE RESTRICT,
    company_id INTEGER NOT NULL REFERENCES company(id) ON DELETE RESTRICT,
    current_snapshot_id INTEGER NOT NULL,
    previous_snapshot_id INTEGER NOT NULL,
    company_name_at_publication TEXT NOT NULL,
    previous_category TEXT NOT NULL CHECK (
        previous_category IN ('under_50', '20_49', '100_199')
    ),
    current_category TEXT NOT NULL DEFAULT '50_99' CHECK (current_category = '50_99'),
    employee_count_at_publication INTEGER CHECK (
        employee_count_at_publication IS NULL OR employee_count_at_publication BETWEEN 50 AND 99
    ),
    UNIQUE (summary_id, company_id),
    FOREIGN KEY (current_snapshot_id, company_id)
        REFERENCES company_month_snapshot(id, company_id) ON DELETE RESTRICT,
    FOREIGN KEY (previous_snapshot_id, company_id)
        REFERENCES company_month_snapshot(id, company_id) ON DELETE RESTRICT
);

CREATE TABLE audit_event (
    id INTEGER PRIMARY KEY,
    actor_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (
        action IN ('contract_created', 'contract_updated', 'contract_deleted', 'summary_published', 'scb_imported')
    ),
    entity_id INTEGER,
    occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    details_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details_json))
);

CREATE INDEX audit_event_entity_idx ON audit_event (action, entity_id, occurred_at DESC);

CREATE TABLE access_code_change (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX access_code_change_user_idx
    ON access_code_change (user_id, changed_at DESC);
CREATE TABLE company_month_snapshot_new (
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

INSERT INTO company_month_snapshot_new (
    id, import_batch_id, company_id, company_name, employee_category, employee_count, source_record_id
)
SELECT
    id, import_batch_id, company_id, company_name, employee_category, employee_count, source_record_id
FROM company_month_snapshot;

CREATE TABLE monthly_summary_entry_new (
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
        REFERENCES company_month_snapshot_new(id, company_id) ON DELETE RESTRICT,
    FOREIGN KEY (previous_snapshot_id, company_id)
        REFERENCES company_month_snapshot_new(id, company_id) ON DELETE RESTRICT
);

INSERT INTO monthly_summary_entry_new (
    id, summary_id, company_id, current_snapshot_id, previous_snapshot_id,
    company_name_at_publication, previous_category, current_category, employee_count_at_publication
)
SELECT
    id, summary_id, company_id, current_snapshot_id, previous_snapshot_id,
    company_name_at_publication, previous_category, current_category, employee_count_at_publication
FROM monthly_summary_entry;

DROP TABLE monthly_summary_entry;
DROP TABLE company_month_snapshot;

ALTER TABLE company_month_snapshot_new RENAME TO company_month_snapshot;
ALTER TABLE monthly_summary_entry_new RENAME TO monthly_summary_entry;

CREATE INDEX company_snapshot_category_idx
    ON company_month_snapshot (import_batch_id, employee_category);

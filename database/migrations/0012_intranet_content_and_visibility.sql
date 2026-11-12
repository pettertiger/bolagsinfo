ALTER TABLE intranet_section
ADD COLUMN visibility_mode TEXT NOT NULL DEFAULT 'all'
CHECK (visibility_mode IN ('all', 'selected'));

CREATE TABLE intranet_section_user (
    section_id TEXT NOT NULL REFERENCES intranet_section(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (section_id, user_id)
);

CREATE TABLE intranet_content_block (
    id INTEGER PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES intranet_section(id) ON DELETE CASCADE,
    title TEXT,
    body TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    created_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    CHECK (title IS NULL OR length(trim(title)) > 0),
    CHECK (title IS NOT NULL OR length(trim(body)) > 0)
);

CREATE INDEX intranet_content_section_order_idx
    ON intranet_content_block (section_id, sort_order, id);

CREATE INDEX intranet_section_user_user_idx
    ON intranet_section_user (user_id, section_id);

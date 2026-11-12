CREATE TABLE IF NOT EXISTS access_code_change (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES app_user(id) ON DELETE SET NULL,
    changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS access_code_change_user_idx
    ON access_code_change (user_id, changed_at DESC);

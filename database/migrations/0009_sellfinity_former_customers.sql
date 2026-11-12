CREATE TABLE sellfinity_municipality_status_new (
    municipality_code TEXT PRIMARY KEY CHECK (municipality_code GLOB '[0-9][0-9][0-9][0-9]'),
    status TEXT NOT NULL CHECK (status IN ('customer', 'ex_customer', 'not_customer', 'unmatched', 'uncertain'))
);

INSERT INTO sellfinity_municipality_status_new (municipality_code, status)
SELECT municipality_code, CASE WHEN status = 'not_customer' THEN 'uncertain' ELSE status END
FROM sellfinity_municipality_status;

DROP TABLE sellfinity_municipality_status;
ALTER TABLE sellfinity_municipality_status_new RENAME TO sellfinity_municipality_status;

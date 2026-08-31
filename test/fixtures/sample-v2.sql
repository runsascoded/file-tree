-- Regenerate: rm -f sample-v2.sqlite && sqlite3 sample-v2.sqlite < sample-v2.sql
--
-- `sample.sql` after a plausible re-upload: same schema, different rows.
-- Exists so a test can prove that a stale connection or a stale block
-- cache would be *observable* — comparing a file against itself proves
-- nothing about staleness.
--
-- Same `page_size` and a `VACUUM`, so the two files are close in size
-- and layout: the pages a reader already cached from `sample.sqlite`
-- remain plausible-looking pages at the same offsets, which is exactly
-- the failure mode being guarded against.
PRAGMA page_size=4096;

CREATE TABLE events (id INTEGER PRIMARY KEY, region TEXT NOT NULL, ts INTEGER NOT NULL, value REAL, note TEXT);
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 3000)
INSERT INTO events(id, region, ts, value, note)
  SELECT i,
         CASE i%3 WHEN 0 THEN 'bos' WHEN 1 THEN 'lax' ELSE 'sea' END,
         1800000000 + i*3600,
         (i*11)%100 + 0.25,
         'entry-' || i
  FROM n;

CREATE INDEX events_region_ts ON events(region, ts);

CREATE TABLE regions (code TEXT PRIMARY KEY, name TEXT NOT NULL);
INSERT INTO regions VALUES ('bos','Boston'),('lax','Los Angeles'),('sea','Seattle');

CREATE VIEW recent AS SELECT * FROM events ORDER BY ts DESC LIMIT 10;

VACUUM;

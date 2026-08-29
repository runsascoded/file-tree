-- Regenerate: rm -f sample.sqlite && sqlite3 sample.sqlite < sample.sql
--
-- Small (~250 KiB, ~60 pages at 4 KiB) but not trivially so: `events`
-- has to span enough pages that a scan, a deep OFFSET and readahead each
-- cost visibly more than an index seek, since the tests assert those
-- costs exactly.
PRAGMA page_size=4096;

CREATE TABLE events (id INTEGER PRIMARY KEY, region TEXT NOT NULL, ts INTEGER NOT NULL, value REAL, note TEXT);
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 3000)
INSERT INTO events(id, region, ts, value, note)
  SELECT i,
         CASE i%3 WHEN 0 THEN 'nyc' WHEN 1 THEN 'sf' ELSE 'chi' END,
         1700000000 + i*3600,
         (i*7)%100 + 0.5,
         'note-' || i
  FROM n;

-- An index, so a test can tell an index seek from a table scan.
CREATE INDEX events_region_ts ON events(region, ts);

CREATE TABLE regions (code TEXT PRIMARY KEY, name TEXT NOT NULL);
INSERT INTO regions VALUES ('nyc','New York'),('sf','San Francisco'),('chi','Chicago');

-- A view, so schema listing has to distinguish one from a table.
CREATE VIEW recent AS SELECT * FROM events ORDER BY ts DESC LIMIT 10;

VACUUM;

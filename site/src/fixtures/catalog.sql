-- Demo database for the `/mock` SQLite viewer.
--
-- Regenerate (needs the `sqlite3` CLI):
--   cd site/src/fixtures
--   rm -f catalog.sqlite && sqlite3 catalog.sqlite < catalog.sql
--   node ../../tools/embed-sqlite.mjs
--
-- Shaped to exercise the viewer rather than to be realistic: several
-- tables so the picker has something to pick, a view so it has to
-- distinguish one, a foreign key so `renderCell` has somewhere to link,
-- and enough rows in `rides` that paging is more than one page.
PRAGMA page_size=4096;

CREATE TABLE regions (code TEXT PRIMARY KEY, name TEXT NOT NULL, timezone TEXT NOT NULL);
INSERT INTO regions VALUES
  ('nyc','New York','America/New_York'),
  ('sfo','San Francisco','America/Los_Angeles'),
  ('lax','Los Angeles','America/Los_Angeles');

CREATE TABLE stations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  region TEXT NOT NULL REFERENCES regions(code),
  capacity INTEGER NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL
);
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 120)
INSERT INTO stations(id, name, region, capacity, lat, lon)
  SELECT i,
         'Station ' || printf('%03d', i),
         CASE i%3 WHEN 0 THEN 'nyc' WHEN 1 THEN 'sfo' ELSE 'lax' END,
         8 + (i*7)%40,
         round(37.0 + (i%97)/100.0, 4),
         round(-122.0 + (i%89)/100.0, 4)
  FROM n;

CREATE TABLE rides (
  id INTEGER PRIMARY KEY,
  station_id INTEGER NOT NULL REFERENCES stations(id),
  started_at TEXT NOT NULL,
  duration_s INTEGER NOT NULL,
  member INTEGER NOT NULL
);
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 900)
INSERT INTO rides(id, station_id, started_at, duration_s, member)
  SELECT i,
         1 + (i*13)%120,
         datetime(1767225600 + i*431, 'unixepoch'),
         120 + (i*97)%3480,
         i%4 <> 0
  FROM n;

CREATE INDEX rides_station ON rides(station_id);

CREATE VIEW busiest AS
  SELECT s.name AS station, s.region, count(*) AS rides, sum(r.duration_s)/60 AS minutes
  FROM rides r JOIN stations s ON s.id = r.station_id
  GROUP BY r.station_id
  ORDER BY rides DESC, station;

VACUUM;

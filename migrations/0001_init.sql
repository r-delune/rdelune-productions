CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  country TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS track_plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id INTEGER NOT NULL,
  track_title TEXT NOT NULL,
  album_name TEXT NOT NULL,
  duration_seconds REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_page_views_path ON page_views(path);
CREATE INDEX idx_page_views_created ON page_views(created_at);
CREATE INDEX idx_track_plays_track ON track_plays(track_id);
CREATE INDEX idx_track_plays_created ON track_plays(created_at);

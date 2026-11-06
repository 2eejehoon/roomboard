-- data-model.md "D1 (영구)". No personal data: the only per-visitor value is reporter_hash, an HMAC of a random device key.
CREATE TABLE rooms (
  id TEXT PRIMARY KEY CHECK (length(id) = 10),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 60),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 300),
  room_data TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  online_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  deleted_by TEXT CHECK (deleted_by IN ('owner', 'admin'))
);
CREATE INDEX rooms_list ON rooms (deleted_at, created_at DESC);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK (target_type IN ('room', 'message')),
  room_id TEXT NOT NULL,
  message_id TEXT NOT NULL DEFAULT '',
  message_snapshot TEXT,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'abuse', 'sexual', 'illegal', 'other')),
  reporter_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  UNIQUE (target_type, room_id, message_id, reporter_hash)
);
CREATE INDEX reports_admin ON reports (status, created_at DESC);

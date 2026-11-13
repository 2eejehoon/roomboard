-- specs/002-auto-bugfix-loop/data-model.md "D1". No personal data: every text is redact()ed before it is stored (research R4).
CREATE TABLE bug_fingerprints (
  fingerprint TEXT PRIMARY KEY CHECK (length(fingerprint) = 16),
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  error_name TEXT NOT NULL CHECK (length(error_name) <= 100),
  summary TEXT NOT NULL CHECK (length(summary) <= 300),
  frames TEXT NOT NULL,
  count INTEGER NOT NULL,
  synced_count INTEGER NOT NULL DEFAULT 0,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  app_version_min TEXT NOT NULL,
  app_version_max TEXT NOT NULL,
  view_counts TEXT NOT NULL,
  browser_counts TEXT NOT NULL,
  issue_number INTEGER,
  status TEXT NOT NULL CHECK (status IN ('new', 'open', 'closed', 'regressed')),
  gated INTEGER NOT NULL DEFAULT 0,
  fixed_version TEXT
);
CREATE INDEX bug_fingerprints_status ON bug_fingerprints (status, last_seen);

CREATE TABLE github_sync_state (
  day TEXT PRIMARY KEY,
  issues_created INTEGER NOT NULL DEFAULT 0,
  reports_received INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 1000),
  context TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'issued')),
  issue_number INTEGER,
  created_at INTEGER NOT NULL
);

-- specs/002-auto-bugfix-loop/data-model.md: operator alerts sent once (contracts/github.md "[ops]"). No personal data: flags and dates.
ALTER TABLE github_sync_state ADD COLUMN limit_alerted INTEGER NOT NULL DEFAULT 0;
CREATE TABLE token_alerts (expires TEXT PRIMARY KEY);

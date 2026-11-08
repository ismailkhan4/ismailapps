-- Project inquiries from /contact. Retention: rows older than 24 months are
-- deleted daily by the scheduled handler in src/worker.ts (and on each insert).
CREATE TABLE inquiries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  need TEXT NOT NULL,
  stage TEXT NOT NULL,
  budget TEXT NOT NULL,
  timeline TEXT NOT NULL,
  description TEXT NOT NULL,
  link TEXT,
  notified INTEGER NOT NULL DEFAULT 0,
  confirmed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX inquiries_created_at ON inquiries (created_at);

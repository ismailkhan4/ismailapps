-- Launch waitlists for our games. One row per email per game.
-- Only what we need to send one launch email: the game, the email, the platform, and when.
CREATE TABLE game_waitlist (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  game TEXT NOT NULL,
  email TEXT NOT NULL,
  platform TEXT NOT NULL,
  UNIQUE (game, email)
);

CREATE INDEX game_waitlist_created_at ON game_waitlist (created_at);

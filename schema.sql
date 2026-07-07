-- TokenDesk canonical schema. See SPEC.md §3.
-- Apply:  wrangler d1 execute tokendesk --file=schema.sql           (local)
--          wrangler d1 execute tokendesk --file=schema.sql --remote  (prod)

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  gh_user       TEXT    UNIQUE NOT NULL,
  gh_id         INTEGER UNIQUE NOT NULL,
  email         TEXT,
  avatar_url    TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pools (
  id          INTEGER PRIMARY KEY,
  name        TEXT    UNIQUE NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pool_tokens (
  id                  INTEGER PRIMARY KEY,
  pool_id             INTEGER NOT NULL REFERENCES pools(id),
  value               TEXT    NOT NULL,
  created_at          INTEGER NOT NULL,
  assigned_to_user_id INTEGER REFERENCES users(id),
  assigned_at         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pool_tokens_pool      ON pool_tokens(pool_id);
CREATE INDEX IF NOT EXISTS idx_pool_tokens_assigned  ON pool_tokens(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_pool_tokens_free      ON pool_tokens(pool_id, id) WHERE assigned_to_user_id IS NULL;

CREATE TABLE IF NOT EXISTS machine_tokens (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER UNIQUE NOT NULL REFERENCES users(id),
  token       TEXT    UNIQUE NOT NULL,
  created_at  INTEGER NOT NULL,
  rotated_at  INTEGER
);

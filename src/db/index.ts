import Database, { type Database as DB } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

export type { DB };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  lang       TEXT NOT NULL DEFAULT 'en',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL,
  tutor_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_session
  ON messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS request_logs (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  message_id    TEXT,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  latency_ms    INTEGER,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  est_cost      REAL,
  retrieved_ids TEXT,   -- JSON array of curriculum IDs
  safety_flags  TEXT,   -- JSON array of flag strings
  error         TEXT,   -- error code when the request failed, else NULL
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Opens (and migrates) a SQLite database. Pass ":memory:" for tests so each run
 * gets an isolated, disposable DB — the DB path is the persistence seam.
 */
export function createDb(path = config.DB_PATH): DB {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

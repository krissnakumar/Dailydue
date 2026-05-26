export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS pending_operations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    retries INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    synced INTEGER DEFAULT 0
  );`,
  `CREATE TABLE IF NOT EXISTS local_data (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`
];

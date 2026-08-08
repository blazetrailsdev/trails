CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  score REAL,
  avatar BLOB,
  created_at DATETIME NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

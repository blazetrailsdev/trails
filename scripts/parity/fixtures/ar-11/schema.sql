-- Fixture for statement: ar-11
-- Query: User.where(tall: [false, nil])

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT,
  tall INTEGER,
  active INTEGER,
  created_at DATETIME
);

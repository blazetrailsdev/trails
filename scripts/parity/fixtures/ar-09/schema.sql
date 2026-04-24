-- Fixture for statement: ar-09
-- Query: User.where.not(tall: true)

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT,
  tall INTEGER,
  active INTEGER,
  created_at DATETIME
);

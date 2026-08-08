-- Fixture for statement: ar-10
-- Query: User.where("users.tall IS NOT TRUE")

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT,
  tall INTEGER,
  active INTEGER,
  created_at DATETIME
);

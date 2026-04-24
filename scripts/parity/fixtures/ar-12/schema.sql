-- Fixture for statement: ar-12
-- Query: User.order(created_at: :desc).limit(10).offset(20)

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT,
  tall INTEGER,
  active INTEGER,
  created_at DATETIME
);

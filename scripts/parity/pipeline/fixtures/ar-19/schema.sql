-- Fixture for statement: ar-19
-- Query: User.order(:created_at).unscope(:order).where(active: true)

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  active INTEGER,
  created_at DATETIME
);

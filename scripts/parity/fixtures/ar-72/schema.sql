-- Fixture for statement: ar-72
-- Query: User.select(:id).distinct.where(active: true)

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT,
  active BOOLEAN
);

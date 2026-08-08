-- Fixture for statement: arel-53
-- Query: Simple CTE: cte_table with photos; users JOIN cte_table

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT, first_name TEXT, last_name TEXT, email TEXT,
  age INTEGER, karma INTEGER, bitmap INTEGER, comments_count INTEGER,
  tall INTEGER, active INTEGER, locked INTEGER, orders_count INTEGER,
  created_at DATETIME
);
CREATE TABLE photos (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  click INTEGER,
  created_at DATETIME
);
CREATE INDEX idx_photos_user_id ON photos(user_id);

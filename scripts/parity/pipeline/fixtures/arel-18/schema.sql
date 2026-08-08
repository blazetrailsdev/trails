-- Fixture for statement: arel-18
-- Query: users[:name].eq(bots[:name])

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT, first_name TEXT, last_name TEXT, email TEXT,
  age INTEGER, karma INTEGER, bitmap INTEGER, comments_count INTEGER,
  tall INTEGER, active INTEGER, locked INTEGER, orders_count INTEGER,
  created_at DATETIME
);
CREATE TABLE bots (
  id INTEGER PRIMARY KEY,
  name TEXT
);

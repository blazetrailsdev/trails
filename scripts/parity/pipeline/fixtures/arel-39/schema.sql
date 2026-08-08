-- Fixture for statement: arel-39
-- Query: NamedFunction.new('IF',[users[:name].eq(nil),users[:email],users[:name]])

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT, first_name TEXT, last_name TEXT, email TEXT,
  age INTEGER, karma INTEGER, bitmap INTEGER, comments_count INTEGER,
  tall INTEGER, active INTEGER, locked INTEGER, orders_count INTEGER,
  created_at DATETIME
);

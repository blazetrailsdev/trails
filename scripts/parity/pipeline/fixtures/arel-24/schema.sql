-- Fixture for statement: arel-24
-- Query: User.arel_table[:age] / 3 - Employee.arel_table[:time_at_company]

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT, first_name TEXT, last_name TEXT, email TEXT,
  age INTEGER, karma INTEGER, bitmap INTEGER, comments_count INTEGER,
  tall INTEGER, active INTEGER, locked INTEGER, orders_count INTEGER,
  created_at DATETIME
);
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  time_at_company INTEGER,
  salary NUMERIC,
  dismissed INTEGER
);

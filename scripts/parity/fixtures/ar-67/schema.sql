-- Fixture for statement: ar-67
-- Query: User.with(active: User.where(active: true), admins: User.where(role: "admin")).from("active")

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT,
  active BOOLEAN,
  role TEXT
);

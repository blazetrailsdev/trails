-- Fixture for statement: ar-53
-- Query: Customer.where.not(last_name: nil).where.not(email: nil)

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  last_name TEXT,
  email TEXT
);

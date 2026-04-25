-- Fixture for statement: ar-49
-- Query: Customer.where.not(last_name: nil)

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  last_name TEXT,
  email TEXT
);

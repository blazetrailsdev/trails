-- Fixture for statement: ar-13
-- Query: Customer.select(:first_name).distinct

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  orders_count INTEGER
);

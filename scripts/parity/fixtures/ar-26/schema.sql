-- Fixture for statement: ar-26
-- Query: Customer.where(last_name: "Smith").rewhere(last_name: "Jones")

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  last_name TEXT,
  orders_count INTEGER
);

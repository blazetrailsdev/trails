-- Fixture for statement: ar-06
-- Query: Customer.where.not(orders_count: [1, 3, 5])

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  orders_count INTEGER
);

-- Fixture for statement: ar-08
-- Query: Customer.where(last_name: "Smith").where(orders_count: [1, 3, 5])

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  orders_count INTEGER
);

-- Fixture for statement: ar-28
-- Query: Customer.where(last_name: "Smith").merge(Customer.where(orders_count: 5))

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  last_name TEXT,
  orders_count INTEGER
);

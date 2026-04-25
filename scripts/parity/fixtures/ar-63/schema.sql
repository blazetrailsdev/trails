-- Fixture for statement: ar-63
-- Query: Customer.where(orders_count: 1).or(Customer.where(orders_count: 3).or(Customer.where(orders_count: 5)))

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  orders_count INTEGER
);

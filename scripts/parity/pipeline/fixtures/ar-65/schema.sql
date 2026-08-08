-- Fixture for statement: ar-65
-- Query: Order.where(created_at: Time.now)

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  created_at DATETIME
);

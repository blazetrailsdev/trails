-- Fixture for statement: ar-52
-- Query: Order.where(created_at: 1.week.ago..Time.now)

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  created_at DATETIME
);

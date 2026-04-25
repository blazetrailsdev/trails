-- Fixture for statement: ar-51
-- Query: Order.group(:status).having("SUM(total) > ?", 200)

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  status TEXT,
  total INTEGER
);

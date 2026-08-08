-- Fixture for statement: ar-17
-- Query: Order.select("created_at as ordered_date, sum(total) as total_price").group("created_at").having("sum(total) > ?", 200)

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  total INTEGER,
  created_at DATETIME
);

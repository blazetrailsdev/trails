-- Fixture for statement: ar-32
-- Query: Book.in_order_of(:status, %w[published draft archived])

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);

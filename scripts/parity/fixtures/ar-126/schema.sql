-- Fixture for statement: ar-126
-- Query: Book.order(Arel.sql("CASE WHEN status = 'featured' THEN 0 ELSE 1 END"))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);

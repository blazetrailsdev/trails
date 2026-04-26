-- Fixture for statement: ar-86
-- Query: Book.where(Book.arel_table[:rating].lt(5))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  rating INTEGER
);

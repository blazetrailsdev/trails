-- Fixture for statement: ar-85
-- Query: Book.where(Book.arel_table[:pages].gt(100))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  pages INTEGER
);

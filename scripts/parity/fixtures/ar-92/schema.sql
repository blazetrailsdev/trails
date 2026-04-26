-- Fixture for statement: ar-92
-- Query: Book.where(Book.arel_table[:pages].between(100..500))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  pages INTEGER
);

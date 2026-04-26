-- Fixture for statement: ar-99
-- Query: Book.from(Book.where(active: true), :books)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  active BOOLEAN
);

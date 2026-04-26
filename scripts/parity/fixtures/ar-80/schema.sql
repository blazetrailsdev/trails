-- Fixture for statement: ar-80
-- Query: Book.where(active: true).merge(Book.order(:title))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  active BOOLEAN
);

-- Fixture for statement: ar-94
-- Query: Book.where(Book.arel_table[:status].not_eq("draft"))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);

-- Fixture for statement: ar-91
-- Query: Book.where(Book.arel_table[:status].in(["active", "archived"]))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);

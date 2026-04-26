-- Fixture for statement: ar-119
-- Query: Book.where(Book.arel_table[:status].eq("published"))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);

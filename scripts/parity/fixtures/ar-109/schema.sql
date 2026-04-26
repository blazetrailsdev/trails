-- Fixture for statement: ar-109
-- Query: Book.where(Book.arel_table[:status].not_in(["draft", "archived"]))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);

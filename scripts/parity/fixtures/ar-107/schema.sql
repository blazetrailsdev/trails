-- Fixture for statement: ar-107
-- Query: Book.where(Book.arel_table[:status].eq_any(["active", "featured"]))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);

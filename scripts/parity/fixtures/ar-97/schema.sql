-- Fixture for statement: ar-97
-- Query: Book.where(status: "active").or(Book.where(status: "featured"))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);

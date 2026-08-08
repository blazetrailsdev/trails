-- Fixture for statement: ar-103
-- Query: Book.with(recent_books: Book.where("created_at > '2020-01-01'")).from("recent_books").select("recent_books.*")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  created_at DATETIME
);

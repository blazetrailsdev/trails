-- Fixture for statement: ar-47
-- Query: Book.where(id: 1..5).and(Book.where(title: "Rails"))

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);

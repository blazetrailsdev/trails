-- Fixture for statement: ar-54
-- Query: Book.create_with(status: "active").where(id: 1..5)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);

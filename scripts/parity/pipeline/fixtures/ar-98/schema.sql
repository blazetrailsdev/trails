-- Fixture for statement: ar-98
-- Query: Book.where.not(status: "draft", active: false)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT,
  active BOOLEAN
);

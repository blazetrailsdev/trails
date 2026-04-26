-- Fixture for statement: ar-125
-- Query: Book.where(active: false)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  active BOOLEAN
);

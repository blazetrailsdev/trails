-- Fixture for statement: ar-128
-- Query: Book.where(active: true).select("COUNT(*) AS total")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  active BOOLEAN
);
